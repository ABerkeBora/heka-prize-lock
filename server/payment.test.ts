import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeEventTopics, encodeAbiParameters, keccak256, toHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { validateChallenge, buy } from './payment.ts';
import { AIRNODE_URL, AUSD, PAY_TO, NETWORK, publicClient } from './config.ts';
import { deriveRequestHash } from './airnode-v2.ts';
import { saveJson, readJson } from './store.ts';
import { sendTx, submitRequest } from './chain.ts';
import { runAgent } from './agent.ts';

const now = 1_793_414_000;
const mandate = () => ({ expiresAt: now + 600, callsUsed: 0, maxCalls: 3, apiReserved: '0', maxApiFee: '10000', totalApiBudget: '30000' });
const challenge = () => ({
  x402Version: 2,
  resource: { url: AIRNODE_URL },
  accepts: [{ scheme: 'exact', network: NETWORK, asset: AUSD, payTo: PAY_TO, amount: '10000', maxTimeoutSeconds: 300, extra: { name: 'AirnodeHub USD', version: '1' } }],
});

test('priced API authorization is bounded by integer amount, count, total and expiry', () => {
  assert.equal(validateChallenge(challenge(), mandate(), now).amount, '10000');
  assert.throws(() => validateChallenge(challenge(), { ...mandate(), maxApiFee: '9999' }, now), /Per-action/);
  assert.throws(() => validateChallenge(challenge(), { ...mandate(), apiReserved: '20001' }, now), /Total API/);
  assert.throws(() => validateChallenge(challenge(), { ...mandate(), callsUsed: 3 }, now), /Total API/);
  assert.throws(() => validateChallenge(challenge(), { ...mandate(), expiresAt: now }, now), /expired/);
  assert.equal(validateChallenge(challenge(), { ...mandate(), expiresAt: now + 40 }, now).maxTimeoutSeconds, 40);
});

test('a valid cheap price cannot authorize a different network, asset, merchant, route or transfer scheme', () => {
  for (const mutation of [
    (c: any) => { c.accepts[0].network = 'eip155:8453'; },
    (c: any) => { c.accepts[0].asset = '0x0000000000000000000000000000000000000001'; },
    (c: any) => { c.accepts[0].payTo = '0x0000000000000000000000000000000000000002'; },
    (c: any) => { c.resource.url = AIRNODE_URL + 'redirect'; },
    (c: any) => { c.x402Version = 1; },
    (c: any) => { c.accepts[0].extra.assetTransferMethod = 'permit2'; },
    (c: any) => { c.accepts[0].extra.name = 'USDC'; },
  ]) {
    const c = challenge(); mutation(c);
    assert.throws(() => validateChallenge(c, mandate(), now), /Unapproved/);
  }
});

test('invalid prices and unbounded authorization windows fail before signing', () => {
  for (const amount of ['0', '-1', '0.01', '1e4', '10001']) {
    const c = challenge(); c.accepts[0].amount = amount;
    assert.throws(() => validateChallenge(c, mandate(), now), /budget/);
  }
  for (const timeout of [0, -1, 301, 1.5]) {
    const c = challenge(); c.accepts[0].maxTimeoutSeconds = timeout;
    assert.throws(() => validateChallenge(c, mandate(), now), /timeout/);
  }
});

test('one intent cannot charge again after delivery or change its bound request', async () => {
  const root = process.cwd(); mkdirSync(join(root, '.local'), { recursive: true });
  const dir = mkdtempSync(join(root, '.local/security-payment-'));
  const originalFetch = globalThis.fetch; let fetches = 0;
  try {
    process.chdir(dir);
    globalThis.fetch = (async () => { fetches++; throw new Error('Unexpected network call'); }) as typeof fetch;
    const request = { operation: 'getMatch', parameters: { match_id_or_slug: '1772358' } };
    const intent = { intentId: 'finished', requestHash: deriveRequestHash(request), status: 'delivered', proof: { data: 'saved response' } };
    saveJson('.local/intents/finished.json', intent);
    const m = mandate(); const before = JSON.stringify(m);
    assert.deepEqual(await buy(request, 'finished', m, '.local/mandate.json'), intent);
    assert.equal(JSON.stringify(m), before);
    await assert.rejects(buy({ ...request, parameters: { match_id_or_slug: 'another-match' } }, 'finished', m, '.local/mandate.json'), /bound to another request/);
    assert.equal(fetches, 0);
    assert.deepEqual(readJson('.local/intents/finished.json'), intent);
  } finally { globalThis.fetch = originalFetch; process.chdir(root); rmSync(dir, { recursive: true, force: true }); }
});

test('uncertain payment reconciles its existing nonce and freezes a spent authorization without a new charge', async () => {
  const root = process.cwd(); mkdirSync(join(root, '.local'), { recursive: true });
  const dir = mkdtempSync(join(root, '.local/security-reconcile-'));
  const originalFetch = globalThis.fetch; const originalRead = publicClient.readContract; let reads = 0; let fetches = 0;
  try {
    process.chdir(dir);
    globalThis.fetch = (async () => { fetches++; throw new Error('Unexpected network call'); }) as typeof fetch;
    publicClient.readContract = (async () => { reads++; return true; }) as typeof publicClient.readContract;
    const request = { operation: 'getMatch', parameters: { match_id_or_slug: '1772358' } };
    saveJson('.local/intents/uncertain.json', { intentId: 'uncertain', requestHash: deriveRequestHash(request), status: 'uncertain', payer: PAY_TO, payload: { payload: { authorization: { nonce: '0x' + '11'.repeat(32), validBefore: String(now + 100) } } } });
    await assert.rejects(buy(request, 'uncertain', mandate(), '.local/mandate.json'), /already settled|result missing/i);
    assert.equal(reads, 1); assert.equal(fetches, 0);
    assert.equal(readJson('.local/intents/uncertain.json').status, 'paid-result-missing');
    await assert.rejects(buy(request, 'uncertain', mandate(), '.local/mandate.json'), /manual recovery/);
    assert.equal(reads, 1); assert.equal(fetches, 0);
  } finally { globalThis.fetch = originalFetch; publicClient.readContract = originalRead; process.chdir(root); rmSync(dir, { recursive: true, force: true }); }
});

test('mandate tool, request identity and endpoint are checked even for a cached intent', async () => {
  const root = process.cwd(); const dir = mkdtempSync(join(root, '.local/security-policy-'));
  const originalFetch = globalThis.fetch; let fetches = 0;
  try {
    process.chdir(dir);
    globalThis.fetch = (async () => { fetches++; throw new Error('Unexpected network call'); }) as typeof fetch;
    const request = { operation: 'getMatch', parameters: { match_id_or_slug: '1772358' } };
    const hash = deriveRequestHash(request);
    saveJson('.local/intents/cached.json', { intentId: 'cached', requestHash: hash, status: 'delivered' });
    await assert.rejects(buy(request, 'cached', { ...mandate(), allowedTool: 'getTeam' }, '.local/mandate.json'), /Operation outside/);
    await assert.rejects(buy(request, 'cached', { ...mandate(), requestHash: '0x' + '12'.repeat(32) }, '.local/mandate.json'), /Request outside/);
    await assert.rejects(buy(request, 'cached', { ...mandate(), endpoint: 'https://unapproved.invalid/' }, '.local/mandate.json'), /Endpoint outside/);
    assert.equal(fetches, 0);
  } finally { globalThis.fetch = originalFetch; process.chdir(root); rmSync(dir, { recursive: true, force: true }); }
});

const realFixture = JSON.parse(readFileSync(new URL('../evidence/preflight-match.json', import.meta.url), 'utf8'));
const transferAbi = [{ type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] }] as const;
const authorizationAbi = [{ type: 'event', name: 'AuthorizationUsed', inputs: [{ name: 'authorizer', type: 'address', indexed: true }, { name: 'nonce', type: 'bytes32', indexed: true }] }] as const;
function authorizationLog(overrides: any = {}) {
  return {
    address: overrides.asset || AUSD,
    topics: encodeEventTopics({ abi: authorizationAbi, eventName: 'AuthorizationUsed', args: { authorizer: overrides.authorizer || realFixture.payer, nonce: overrides.nonce || '0x' + '11'.repeat(32) } }),
    data: '0x',
  };
}
function transferLog(overrides: any = {}) {
  return {
    address: overrides.asset || AUSD,
    topics: encodeEventTopics({ abi: transferAbi, eventName: 'Transfer', args: { from: overrides.from || realFixture.payer, to: overrides.to || PAY_TO } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(overrides.amount || '10000')]),
  };
}
async function withRecoveryFixture(fn: (m: any, intent: any) => Promise<void>) {
  const root = process.cwd(); const dir = mkdtempSync(join(root, '.local/security-recovery-'));
  const originalFetch = globalThis.fetch; const originalRead = publicClient.readContract; const originalWait = publicClient.waitForTransactionReceipt;
  try {
    process.chdir(dir);
    globalThis.fetch = (async () => { throw new Error('Recovery must not purchase again'); }) as typeof fetch;
    publicClient.readContract = (async () => true) as typeof publicClient.readContract;
    publicClient.waitForTransactionReceipt = (async () => ({ status: 'success', logs: [transferLog(), authorizationLog()] })) as typeof publicClient.waitForTransactionReceipt;
    const m = { ...mandate(), id: 'recovery-policy', apiSpent: '0', apiReserved: '10000', callsUsed: 1, allowedTool: 'getMatch', requestHash: realFixture.requestHash, endpoint: AIRNODE_URL };
    const intent = { intentId: 'recover', request: realFixture.request, requestHash: realFixture.requestHash, status: 'uncertain', httpStatus: 200, rawResponse: JSON.stringify(realFixture.proof), settlement: realFixture.settlement, payer: realFixture.payer, amount: realFixture.amount, payload: { payload: { authorization: { nonce: '0x' + '11'.repeat(32) } } } };
    saveJson('.local/intents/recover.json', intent); saveJson('.local/mandate.json', m);
    await fn(m, intent);
  } finally { globalThis.fetch = originalFetch; publicClient.readContract = originalRead; publicClient.waitForTransactionReceipt = originalWait; process.chdir(root); rmSync(dir, { recursive: true, force: true }); }
}

test('saved successful raw response recovers its exact fee receipt and real Airnode proof without repurchase', async () => {
  await withRecoveryFixture(async (m) => {
    const result = await buy(realFixture.request, 'recover', m, '.local/mandate.json');
    assert.equal(result.status, 'delivered');
    assert.deepEqual(result.proof, realFixture.proof);
    assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
    assert.equal(readJson('evidence/recover.json').receiptVerified, true);
    await buy(realFixture.request, 'recover', m, '.local/mandate.json');
    assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
  });
});

test('restart between delivered intent and fee ledger repairs spent accounting exactly once', async () => {
  await withRecoveryFixture(async (m, intent) => {
    saveJson('.local/intents/recover.json', { ...intent, status: 'delivered', proof: realFixture.proof, deliveredAt: '2026-10-31T03:00:00Z' });
    saveJson('.local/delivered-fees.json', { unrelated: { mandateId: 'another-policy', amount: '99999' } });
    await buy(realFixture.request, 'recover', m, '.local/mandate.json');
    assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
    await buy(realFixture.request, 'recover', m, '.local/mandate.json');
    assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
    assert.equal(Object.keys(readJson('.local/delivered-fees.json')).length, 2);
  });
});

test('a confirmed provider fee remains spent when the purchased proof is invalid', async () => {
  await withRecoveryFixture(async (m, intent) => {
    const edited = { ...realFixture.proof, data: realFixture.proof.data.replace(/"winnerId":\d+/, '"winnerId":1') };
    saveJson('.local/intents/recover.json', { ...intent, rawResponse: JSON.stringify(edited) });
    await assert.rejects(buy(realFixture.request, 'recover', m, '.local/mandate.json'), /signed by/);
    assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
    assert.notEqual(readJson('.local/intents/recover.json').status, 'delivered');
  });
});

test('a successful unrelated transaction or unused nonce cannot stand in for the exact API fee', async () => {
  for (const badLog of [
    transferLog({ asset: '0x0000000000000000000000000000000000000001' }),
    transferLog({ from: '0x0000000000000000000000000000000000000002' }),
    transferLog({ to: '0x0000000000000000000000000000000000000003' }),
    transferLog({ amount: '9999' }),
  ]) {
    await withRecoveryFixture(async (m) => {
      publicClient.waitForTransactionReceipt = (async () => ({ status: 'success', logs: [badLog] })) as typeof publicClient.waitForTransactionReceipt;
      await assert.rejects(buy(realFixture.request, 'recover', m, '.local/mandate.json'), /exact authorized aUSD transfer/);
      assert.equal(readJson('.local/mandate.json').apiSpent, '0');
      assert.notEqual(readJson('.local/intents/recover.json').status, 'delivered');
    });
  }
  await withRecoveryFixture(async (m) => {
    publicClient.readContract = (async () => false) as typeof publicClient.readContract;
    await assert.rejects(buy(realFixture.request, 'recover', m, '.local/mandate.json'), /nonce has not been consumed/);
    assert.equal(readJson('.local/mandate.json').apiSpent, '0');
  });
});

test('the exact authorization nonce and payer must occur in the same token receipt as its transfer', async () => {
  for (const logs of [
    [transferLog()],
    [transferLog(), authorizationLog({ nonce: '0x' + '22'.repeat(32) })],
    [transferLog(), authorizationLog({ authorizer: PAY_TO })],
    [transferLog(), authorizationLog({ asset: '0x0000000000000000000000000000000000000001' })],
  ]) {
    await withRecoveryFixture(async (m) => {
      publicClient.waitForTransactionReceipt = (async () => ({ status: 'success', logs })) as typeof publicClient.waitForTransactionReceipt;
      await assert.rejects(buy(realFixture.request, 'recover', m, '.local/mandate.json'), /this payment authorization nonce/);
      assert.equal(readJson('.local/mandate.json').apiSpent, '0');
    });
  }
});

test('transaction intent binding rejects changed recipient, calldata or value before any RPC request', async () => {
  await withTransactionFixture(async (request) => {
    for (const changed of [{ ...request, to: PAY_TO }, { ...request, data: '0x1235' }, { ...request, value: 1n }]) {
      await assert.rejects(sendTx('recover-tx', changed), /bound to different calldata/);
    }
  });
});

async function withTransactionFixture(fn: (request: any) => Promise<void>) {
  const root = process.cwd(); const dir = mkdtempSync(join(root, '.local/security-tx-'));
  const priorWallet = process.env.WALLET_FILE; const originalGet = publicClient.getTransactionReceipt;
  try {
    process.chdir(dir);
    const roles: any = {};
    for (const role of ['deployer', 'buyer', 'counterparty']) { const privateKey = generatePrivateKey(); roles[role] = { privateKey, address: privateKeyToAccount(privateKey).address }; }
    saveJson('.local/test-wallets.json', { testOnly: true, chainId: 84532, roles });
    process.env.WALLET_FILE = join(dir, '.local/test-wallets.json');
    const request = { to: '0x0000000000000000000000000000000000000004', data: '0x1234', value: 0n };
    const requestHash = keccak256(toHex(JSON.stringify({ to: request.to.toLowerCase(), data: request.data, value: '0' })));
    saveJson('.local/transactions/recover-tx.json', { intentId: 'recover-tx', requestHash, hash: '0x' + '33'.repeat(32), raw: '0xabcd', status: 'pending' });
    publicClient.getTransactionReceipt = (async () => { throw new Error('RPC must not be contacted for request mismatch'); }) as typeof publicClient.getTransactionReceipt;
    await fn(request);
  } finally { publicClient.getTransactionReceipt = originalGet; if (priorWallet === undefined) delete process.env.WALLET_FILE; else process.env.WALLET_FILE = priorWallet; process.chdir(root); rmSync(dir, { recursive: true, force: true }); }
}

test('expired transaction mandate permits receipt reconciliation but refuses rebroadcast', async () => {
  await withTransactionFixture(async (request) => {
    publicClient.getTransactionReceipt = (async () => { const e = new Error('not mined'); e.name = 'TransactionReceiptNotFoundError'; throw e; }) as typeof publicClient.getTransactionReceipt;
    await assert.rejects(sendTx('recover-tx', request, { mandate: { expiresAt: 1 } }), /expired; signed transaction not rebroadcast/);
    publicClient.getTransactionReceipt = (async () => ({ status: 'success', transactionHash: '0x' + '33'.repeat(32), blockNumber: 123n, contractAddress: null, gasUsed: 20000n, effectiveGasPrice: 10n })) as typeof publicClient.getTransactionReceipt;
    const tx = await sendTx('recover-tx', request, { mandate: { expiresAt: 1 } });
    assert.equal(tx.receipt.gasCostWei, '200000');
    assert.equal(tx.status, 'success');
  });
});

test('payout confirmation during restart recovers delivery evidence before returning paid', async () => {
  const contractAbi = JSON.parse(readFileSync(new URL('../evidence/contract-abi.json', import.meta.url), 'utf8'));
  const originalRead = publicClient.readContract; const originalBalance = publicClient.getBalance; const originalFetch = globalThis.fetch;
  try {
    await withTransactionFixture(async () => {
      let state = 1; let purchases = 0;
      globalThis.fetch = (async () => { purchases++; throw new Error('Pending payout must be reconciled before purchase'); }) as typeof fetch;
      publicClient.getBalance = (async () => 0n) as typeof publicClient.getBalance;
      const pool = { id: 'prize-test', address: '0x0000000000000000000000000000000000000004', status: 'funded', policy: { prizeWei: '100000000000000' } };
      const proof = { timestamp: '1793414000', data: '{}', signature: '0x' + '11'.repeat(65) };
      const m = { id: 'treasury-test', status: 'paying', currentIntent: 'observation-test', expiresAt: 1, gasSpentWei: '0' };
      saveJson('evidence/contract-abi.json', contractAbi);
      saveJson('.local/pool.json', pool); saveJson('.local/proof.json', proof); saveJson('.local/mandate.json', m);
      saveJson('.local/intents/observation-test.json', { settlement: { success: true, network: NETWORK, transaction: '0x' + '44'.repeat(32) } });
      publicClient.readContract = (async ({ functionName }: any) => ({ state, winningTeam: 139124n, paidTo: PAY_TO, acceptedProofHash: '0x' + '55'.repeat(32) })[functionName]) as typeof publicClient.readContract;
      const request = submitRequest(pool, proof);
      const requestHash = keccak256(toHex(JSON.stringify({ to: request.to.toLowerCase(), data: request.data, value: '0' })));
      saveJson('.local/transactions/prize-test-payout.json', { intentId: 'prize-test-payout', requestHash, hash: '0x' + '33'.repeat(32), raw: '0xabcd', status: 'pending' });
      publicClient.getTransactionReceipt = (async () => { state = 2; return { status: 'success', transactionHash: '0x' + '33'.repeat(32), blockNumber: 123n, contractAddress: null, gasUsed: 20000n, effectiveGasPrice: 10n }; }) as typeof publicClient.getTransactionReceipt;
      await runAgent();
      assert.equal(purchases, 0);
      assert.equal(readJson('.local/mandate.json').status, 'paid');
      const evidence = readJson('evidence/prize-test-payout.json');
      assert.ok(evidence, 'confirmed payout evidence must be written on this first resume');
      assert.equal(evidence.receipt.transactionHash, '0x' + '33'.repeat(32));
      assert.equal(evidence.deliveredPrizeWei, '100000000000000');
      assert.equal(readJson('evidence/deployment.json').payoutTx, '0x' + '33'.repeat(32));
    });
  } finally { publicClient.readContract = originalRead; publicClient.getBalance = originalBalance; globalThis.fetch = originalFetch; }
});
