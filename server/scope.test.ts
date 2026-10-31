import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData, keccak256, toHex } from 'viem';
import { scope, withScope, scopedPath, v2Scope, type RuntimeScope } from './scope.ts';
import { readJson, saveJson, exclusive, appendTrail } from './store.ts';
import { wallets, walletClient, AIRNODE_URL, publicClient } from './config.ts';
import { abi, artifact, sendTx } from './chain.ts';
import { buy } from './payment.ts';
import { deriveRequestHash } from './airnode-v2.ts';
import { runFutureAgent } from './future-agent.ts';

async function isolated(fn: () => Promise<void>) {
  const root = process.cwd(); mkdirSync(join(root, '.local'), { recursive: true });
  const dir = mkdtempSync(join(root, '.local/security-scope-'));
  try { process.chdir(dir); await fn(); }
  finally { process.chdir(root); rmSync(dir, { recursive: true, force: true }); }
}
const pause = () => new Promise<void>(resolve => setImmediate(resolve));

test('V2 maps only local/evidence namespaces and is idempotent for already scoped paths', () => {
  assert.equal(scope(), undefined);
  assert.equal(scopedPath('.local/pool.json'), '.local/pool.json');
  assert.equal(scopedPath('evidence/payout.json'), 'evidence/payout.json');
  withScope(v2Scope, () => {
    assert.equal(scopedPath('.local'), '.local/v2');
    assert.equal(scopedPath('.local/pool.json'), '.local/v2/pool.json');
    assert.equal(scopedPath('evidence/payout.json'), 'evidence/v2/payout.json');
    assert.equal(scopedPath('.local/v2/pool.json'), '.local/v2/pool.json');
    assert.equal(scopedPath('evidence/v2/payout.json'), 'evidence/v2/payout.json');
    assert.equal(scopedPath('web/dist/index.html'), 'web/dist/index.html');
    assert.equal(scopedPath('evidence-other/payout.json'), 'evidence-other/payout.json');
  });
  assert.equal(scope(), undefined);
});

test('overlapping asynchronous requests retain their own state, trail and evidence without changing V1 bytes', async () => {
  await isolated(async () => {
    saveJson('.local/pool.json', { id: 'v1-pool', status: 'paid' });
    saveJson('.local/mandate.json', { id: 'v1-mandate', callsUsed: 2 });
    saveJson('evidence/payout.json', { hash: 'v1-receipt' });
    const paths = ['.local/pool.json', '.local/mandate.json', 'evidence/payout.json'];
    const before = paths.map(path => readFileSync(path, 'utf8'));
    const alternate: RuntimeScope = { localRoot: '.local/other', evidenceRoot: 'evidence/other' };
    await Promise.all([
      withScope(v2Scope, async () => {
        saveJson('.local/pool.json', { id: 'v2-pool', status: 'waiting' });
        await pause();
        assert.equal(scope(), v2Scope);
        assert.equal(readJson('.local/pool.json').id, 'v2-pool');
        saveJson('.local/mandate.json', { id: 'v2-mandate', callsUsed: 1 });
        appendTrail('observation', 'Waiting for result', 'confirmed');
        await pause();
        saveJson('evidence/payout.json', { hash: 'v2-receipt' });
      }),
      withScope(alternate, async () => {
        await pause();
        saveJson('.local/pool.json', { id: 'other-pool' });
        await pause();
        assert.equal(scope(), alternate);
        assert.equal(readJson('.local/pool.json').id, 'other-pool');
      }),
      (async () => { await pause(); assert.equal(scope(), undefined); assert.equal(readJson('.local/pool.json').id, 'v1-pool'); })(),
    ]);
    assert.deepEqual(paths.map(path => readFileSync(path, 'utf8')), before);
    assert.equal(readJson('.local/v2/trail.json')[0].poolId, 'v2-pool');
    assert.equal(existsSync('.local/trail.json'), false);
    assert.deepEqual(readJson('evidence/v2/payout.json'), { hash: 'v2-receipt' });
    assert.equal(scope(), undefined);
  });
});

test('nested scopes and thrown async work restore their caller context', async () => {
  const outer: RuntimeScope = { localRoot: '.local/outer', evidenceRoot: 'evidence/outer' };
  await withScope(outer, async () => {
    await assert.rejects(withScope(v2Scope, async () => { await pause(); assert.equal(scope(), v2Scope); throw new Error('held proof'); }), /held proof/);
    assert.equal(scope(), outer);
    assert.equal(scopedPath('.local/pool.json'), '.local/outer/pool.json');
  });
  assert.equal(scope(), undefined);
});

test('V1 and V2 economic action locks can overlap while duplicate V2 actions are blocked', async () => {
  await isolated(async () => {
    let release!: () => void;
    const v1 = exclusive(async () => { await new Promise<void>(resolve => { release = resolve; }); });
    await withScope(v2Scope, async () => {
      await exclusive(async () => {
        assert.equal(existsSync('.local/action.lock'), true);
        assert.equal(existsSync('.local/v2/action.lock'), true);
        await assert.rejects(exclusive(async () => {}), /in progress/);
      });
      assert.equal(existsSync('.local/v2/action.lock'), false);
    });
    assert.equal(existsSync('.local/action.lock'), true);
    release(); await v1;
    assert.equal(existsSync('.local/action.lock'), false);
  });
});

function ephemeralWallets() {
  const roles: any = {};
  for (const role of ['deployer', 'buyer', 'counterparty']) {
    const privateKey = generatePrivateKey(); roles[role] = { privateKey, address: privateKeyToAccount(privateKey).address };
  }
  return { testOnly: true, chainId: 84532, roles };
}

test('scoped wallet selection uses separate executor addresses instead of the V1 environment wallet', async () => {
  const prior = process.env.WALLET_FILE;
  try {
    await isolated(async () => {
      const v1 = ephemeralWallets(); const v2 = ephemeralWallets();
      saveJson('.local/v1-wallets.json', v1); saveJson('.local/v2/test-wallets.json', v2);
      process.env.WALLET_FILE = join(process.cwd(), '.local/v1-wallets.json');
      await Promise.all([
        withScope(v2Scope, async () => {
          await pause();
          assert.equal(wallets().deployer.address, v2.roles.deployer.address);
          assert.equal(walletClient().account.address, v2.roles.deployer.address);
          assert.notEqual(walletClient().account.address, v1.roles.deployer.address);
        }),
        (async () => { await pause(); assert.equal(walletClient().account.address, v1.roles.deployer.address); })(),
      ]);
      assert.equal(wallets().deployer.address, v1.roles.deployer.address);
    });
  } finally { if (prior === undefined) delete process.env.WALLET_FILE; else process.env.WALLET_FILE = prior; }
});

test('a missing V2 wallet fails closed instead of using the configured V1 executor', async () => {
  const prior = process.env.WALLET_FILE;
  try {
    await isolated(async () => {
      saveJson('.local/v1-wallets.json', ephemeralWallets());
      process.env.WALLET_FILE = join(process.cwd(), '.local/v1-wallets.json');
      assert.ok(wallets().deployer.address);
      withScope(v2Scope, () => assert.throws(() => wallets(), /ENOENT/));
    });
  } finally { if (prior === undefined) delete process.env.WALLET_FILE; else process.env.WALLET_FILE = prior; }
});

test('scope selects the future contract artifact and ABI without replacing V1 definitions', async () => {
  await isolated(async () => {
    saveJson('out/PrizeLock.sol/PrizeLock.json', { contract: 'PrizeLock', abi: [{ name: 'v1Artifact' }] });
    saveJson('out/FuturePrizeLock.sol/FuturePrizeLock.json', { contract: 'FuturePrizeLock', abi: [{ name: 'v2Artifact' }] });
    saveJson('evidence/contract-abi.json', [{ name: 'v1Evidence' }]);
    withScope(v2Scope, () => saveJson('evidence/contract-abi.json', [{ name: 'v2Evidence' }]));
    assert.equal(artifact().contract, 'PrizeLock');
    assert.equal(abi()[0].name, 'v1Evidence');
    withScope(v2Scope, () => { assert.equal(artifact().contract, 'FuturePrizeLock'); assert.equal(abi()[0].name, 'v2Evidence'); });
    assert.equal(abi()[0].name, 'v1Evidence');
  });
});

test('identical intent IDs reuse only their own version receipt and budget ledger without another charge', async () => {
  await isolated(async () => {
    const original = globalThis.fetch; let purchases = 0;
    try {
      globalThis.fetch = (async () => { purchases++; throw new Error('Saved delivery must not purchase'); }) as typeof fetch;
      const request = { operation: 'getMatch', parameters: { match_id_or_slug: 'future-match' } };
      const hash = deriveRequestHash(request);
      const m1 = { id: 'same-policy-id', allowedTool: 'getMatch', requestHash: hash, endpoint: AIRNODE_URL, apiSpent: '0' };
      const m2 = { ...m1 };
      saveJson('.local/intents/same-intent.json', { intentId: 'same-intent', status: 'delivered', requestHash: hash, amount: '10000', proof: { data: 'V1 saved receipt' } });
      await withScope(v2Scope, async () => {
        saveJson('.local/intents/same-intent.json', { intentId: 'same-intent', status: 'delivered', requestHash: hash, amount: '10000', proof: { data: 'V2 saved receipt' } });
        assert.equal((await buy(request, 'same-intent', m2, '.local/mandate.json')).proof.data, 'V2 saved receipt');
        assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
      });
      assert.equal(readJson('.local/delivered-fees.json'), null);
      assert.equal((await buy(request, 'same-intent', m1, '.local/mandate.json')).proof.data, 'V1 saved receipt');
      assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
      await withScope(v2Scope, async () => {
        await buy(request, 'same-intent', m2, '.local/mandate.json');
        assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
        assert.equal(Object.keys(readJson('.local/delivered-fees.json')).length, 1);
      });
      assert.equal(purchases, 0);
    } finally { globalThis.fetch = original; }
  });
});

test('delegated refund needs explicit permission, fixed contract, zero value, exact calldata and gas capacity', async () => {
  const originalChainId = publicClient.getChainId; const originalEstimate = publicClient.estimateGas;
  try {
    await isolated(async () => {
      saveJson('.local/v2/test-wallets.json', ephemeralWallets());
      publicClient.getChainId = (async () => 84532) as typeof publicClient.getChainId;
      publicClient.estimateGas = (async () => 100000n) as typeof publicClient.estimateGas;
      await withScope(v2Scope, async () => {
        const contract = '0x0000000000000000000000000000000000000004';
        const refundAbi = [{ type: 'function', name: 'refund', inputs: [], outputs: [], stateMutability: 'nonpayable' }] as const;
        saveJson('evidence/contract-abi.json', refundAbi);
        const request = { to: contract, data: encodeFunctionData({ abi: refundAbi, functionName: 'refund' }), value: 0n };
        const base = { id: 'refund-policy', contract, expiresAt: Math.floor(Date.now() / 1000) + 60, gasReservedWei: '0', gasBudgetWei: '300000000000000', payoutActions: 0 };
        const options = (m: any) => ({ mandate: m, mandateFile: '.local/mandate.json', method: 'refund', args: [] });
        await assert.rejects(sendTx('refund-no-permission', request, options({ ...base })), /Unapproved economic method/);
        await assert.rejects(sendTx('refund-wrong-contract', { ...request, to: '0x0000000000000000000000000000000000000005' }, options({ ...base, allowRefund: true })), /destination or value/);
        await assert.rejects(sendTx('refund-nonzero-value', { ...request, value: 1n }, options({ ...base, allowRefund: true })), /destination or value/);
        await assert.rejects(sendTx('refund-wrong-calldata', { ...request, data: '0x1234' }, options({ ...base, allowRefund: true })), /Unapproved calldata/);
        const exhausted = { ...base, allowRefund: true, gasBudgetWei: '0' };
        await assert.rejects(sendTx('refund-no-gas-budget', request, options(exhausted)), /Total gas budget/);
        assert.equal(exhausted.gasReservedWei, '0'); assert.equal(exhausted.payoutActions, 0);
        assert.equal(existsSync('.local/v2/transactions/refund-no-gas-budget.json'), false);
      });
    });
  } finally { publicClient.getChainId = originalChainId; publicClient.estimateGas = originalEstimate; }
});

test('an already submitted V2 refund reconciles after expiry without a new API purchase or transaction', async () => {
  const originalGet = publicClient.getTransactionReceipt; const originalRead = publicClient.readContract; const originalBalance = publicClient.getBalance; const originalFetch = globalThis.fetch;
  try {
    await isolated(async () => {
      saveJson('.local/v2/test-wallets.json', ephemeralWallets());
      let apiCalls = 0;
      globalThis.fetch = (async () => { apiCalls++; throw new Error('Refund recovery must not call an API'); }) as typeof fetch;
      publicClient.getBalance = (async () => 0n) as typeof publicClient.getBalance;
      publicClient.readContract = (async ({ functionName }: any) => ({ state: 3, winningTeam: 0n, paidTo: '0x0000000000000000000000000000000000000000', acceptedProofHash: '0x' + '00'.repeat(32) })[functionName]) as typeof publicClient.readContract;
      publicClient.getTransactionReceipt = (async () => ({ status: 'success', transactionHash: '0x' + '33'.repeat(32), blockNumber: 123n, contractAddress: null, gasUsed: 20000n, effectiveGasPrice: 10n, l1Fee: 7n })) as typeof publicClient.getTransactionReceipt;
      await withScope(v2Scope, async () => {
        const contract = '0x0000000000000000000000000000000000000004';
        const refundAbi = [{ type: 'function', name: 'refund', inputs: [], outputs: [], stateMutability: 'nonpayable' }] as const;
        saveJson('evidence/contract-abi.json', refundAbi);
        const pool = { id: 'future-refund-test', address: contract, status: 'waiting', policy: { settlementDeadline: 1, refundGrace: 0, prizeWei: '100000000000000' } };
        saveJson('.local/pool.json', pool);
        saveJson('.local/mandate.json', { id: 'expired-monitor', status: 'paying', expiresAt: 1, maxActionGasWei: '150000000000000', allowRefund: true });
        const data = encodeFunctionData({ abi: refundAbi, functionName: 'refund' });
        const requestHash = keccak256(toHex(JSON.stringify({ to: contract, data, value: '0' })));
        saveJson('.local/transactions/future-refund-test-refund.json', { intentId: 'future-refund-test-refund', requestHash, hash: '0x' + '33'.repeat(32), raw: '0xabcd', status: 'pending' });
        await runFutureAgent();
        assert.equal(readJson('.local/mandate.json').status, 'refunded');
        assert.equal(readJson('.local/mandate.json').gasSpentWei, '200007');
        assert.equal(readJson('evidence/refund.json').receipt.transactionHash, '0x' + '33'.repeat(32));
        assert.equal(readJson('evidence/deployment.json').refundTx, '0x' + '33'.repeat(32));
        assert.equal(readJson('.local/pool.json').status, 'refunded');
      });
      assert.equal(apiCalls, 0);
      assert.equal(existsSync('.local/mandate.json'), false);
    });
  } finally { publicClient.getTransactionReceipt = originalGet; publicClient.readContract = originalRead; publicClient.getBalance = originalBalance; globalThis.fetch = originalFetch; }
});
