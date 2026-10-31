// Read-only verification helper. Compile first with `forge build`.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const address = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) {
  throw new Error('Usage: node contracts/compare-runtime.mjs <deployed address>');
}
const contractName=process.argv[3]||'PrizeLock';
if(!['PrizeLock','FuturePrizeLock'].includes(contractName))throw new Error('Unsupported contract artifact');
const artifact = JSON.parse(readFileSync(new URL(`../out/${contractName}.sol/${contractName}.json`, import.meta.url), 'utf8'));
const response = await fetch(process.env.PRIZE_LOCK_RPC_URL ?? 'https://sepolia.base.org', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
});
if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
const body = await response.json();
if (body.error) throw new Error(`RPC error: ${body.error.message}`);
const deployed = Buffer.from(body.result.replace(/^0x/, ''), 'hex');
const compiled = Buffer.from(artifact.deployedBytecode.object.replace(/^0x/, ''), 'hex');
if (deployed.length === 0) throw new Error('No deployed bytecode at address');
const slots = Object.values(artifact.deployedBytecode.immutableReferences).flat();
const normalize = (bytes) => {
  const normalized = Buffer.from(bytes);
  for (const { start, length } of slots) {
    if (start + length > normalized.length) throw new Error('Immutable slot outside code: incompatible artifact');
    normalized.fill(0, start, start + length);
  }
  return normalized;
};
const normalizedDeployed = normalize(deployed);
const normalizedCompiled = normalize(compiled);
const stripCbor = (bytes) => bytes.subarray(0, bytes.length - 2 - bytes.readUInt16BE(bytes.length - 2));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({
  address,
  chainRpc: process.env.PRIZE_LOCK_RPC_URL ? 'configured RPC' : 'https://sepolia.base.org',
  checkedAt: new Date().toISOString(),
  deployedBytes: deployed.length,
  compiledBytes: compiled.length,
  immutableRanges: slots.length,
  normalizedBytecodeAndMetadataMatch: normalizedDeployed.equals(normalizedCompiled),
  executableRuntimeMatch: stripCbor(normalizedDeployed).equals(stripCbor(normalizedCompiled)),
  normalizedDeployedSha256: hash(normalizedDeployed),
  normalizedCompiledSha256: hash(normalizedCompiled),
  note: 'Immutable values are checked through policy getters separately. Ignoring CBOR metadata proves executable-runtime equivalence, not exact published-source verification.',
}, null, 2));
