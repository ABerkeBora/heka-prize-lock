import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runFutureAgent } from './future-agent.ts';
import { withScope, v2Scope } from './scope.ts';
import { readJson, saveJson } from './store.ts';
import { publicClient } from './config.ts';

const waiting = JSON.parse(readFileSync(new URL('../evidence/v2/waiting.json', import.meta.url), 'utf8'));
const contractAbi = JSON.parse(readFileSync(new URL('../evidence/v2/contract-abi.json', import.meta.url), 'utf8'));

async function isolatedFuture(fn: (pool: any, mandate: any, stats: { requests: number; verifications: number }) => Promise<void>) {
  const root = process.cwd(); mkdirSync(join(root, '.local'), { recursive: true });
  const dir = mkdtempSync(join(root, '.local/security-future-'));
  const originalFetch = globalThis.fetch; const originalRead = publicClient.readContract; const originalBalance = publicClient.getBalance;
  const stats = { requests: 0, verifications: 0 };
  try {
    process.chdir(dir);
    saveJson('.local/pool.json', { id: 'preserved-v1', status: 'paid' });
    saveJson('.local/mandate.json', { id: 'preserved-v1-policy', apiSpent: '10000' });
    saveJson('evidence/payout.json', { hash: 'preserved-v1-receipt' });
    const v1Paths = ['.local/pool.json', '.local/mandate.json', 'evidence/payout.json'];
    const v1Bytes = v1Paths.map(path => readFileSync(path, 'utf8'));
    globalThis.fetch = (async () => { stats.requests++; throw new Error('Boundary tests must not purchase another observation'); }) as typeof fetch;
    publicClient.getBalance = (async () => BigInt(waiting.pool.policy.prizeWei)) as typeof publicClient.getBalance;
    publicClient.readContract = (async ({ functionName }: any) => {
      if (functionName === 'validateResponse') { stats.verifications++; throw new Error('ResultNotFinal'); }
      return ({ state: 1, winningTeam: 0n, paidTo: '0x0000000000000000000000000000000000000000', acceptedProofHash: '0x' + '00'.repeat(32) })[functionName];
    }) as typeof publicClient.readContract;
    await withScope(v2Scope, async () => {
      const now = Math.floor(Date.now() / 1000);
      const pool = structuredClone(waiting.pool); pool.policy.settlementDeadline = now + 3600; pool.policy.refundGrace = 600;
      const mandate = { ...structuredClone(waiting.mandate), status: 'active', expiresAt: now + 1800, nextPollAt: 0, lastObservedAt: null, currentIntent: null };
      saveJson('.local/pool.json', pool); saveJson('.local/mandate.json', mandate); saveJson('evidence/contract-abi.json', contractAbi);
      await fn(pool, mandate, stats);
    });
    assert.deepEqual(v1Paths.map(path => readFileSync(path, 'utf8')), v1Bytes);
  } finally {
    globalThis.fetch = originalFetch; publicClient.readContract = originalRead; publicClient.getBalance = originalBalance;
    process.chdir(root); rmSync(dir, { recursive: true, force: true });
  }
}

test('a real authenticated not-started observation yields waiting and preserves the funded prize without another charge', async () => {
  await isolatedFuture(async (pool, m, stats) => {
    m.currentIntent = 'saved-pending-observation'; m.callsUsed = 1;
    saveJson('.local/mandate.json', m);
    saveJson('.local/intents/saved-pending-observation.json', { intentId: 'saved-pending-observation', requestHash: pool.policy.requestHash, status: 'delivered', amount: '10000', deliveredAt: new Date().toISOString(), proof: waiting.proof });
    const result = await runFutureAgent();
    assert.equal(stats.requests, 0);
    assert.equal(stats.verifications, 1);
    assert.equal(result.decision, 'NO_PAYOUT');
    assert.equal(result.chain.state, 1);
    assert.equal(result.chain.balanceWei, pool.policy.prizeWei);
    assert.equal(readJson('.local/mandate.json').status, 'waiting');
    assert.equal(readJson('.local/mandate.json').apiSpent, '10000');
    assert.equal(readJson('.local/mandate.json').callsUsed, 1);
    assert.ok(readJson('.local/mandate.json').nextPollAt >= Math.floor(Date.now() / 1000) + 899);
    assert.equal(existsSync('.local/v2/transactions'), false);
    assert.equal(readJson('evidence/payout.json'), null);
    assert.equal(readJson('evidence/waiting.json').liveTerminal, 'PENDING');
  });
});

test('an observation before its fixed next-poll time cannot purchase data or submit a transaction', async () => {
  await isolatedFuture(async (_pool, m, stats) => {
    m.nextPollAt = Math.floor(Date.now() / 1000) + 900;
    saveJson('.local/mandate.json', m);
    await assert.rejects(runFutureAgent(), /not due/);
    assert.equal(stats.requests, 0); assert.equal(stats.verifications, 0);
    assert.equal(readJson('.local/mandate.json').callsUsed, m.callsUsed);
    assert.equal(existsSync('.local/v2/transactions'), false);
  });
});

test('exhausted observation budget schedules only the fixed refund boundary and does not buy again', async () => {
  await isolatedFuture(async (pool, m, stats) => {
    m.callsUsed = 3; m.maxCalls = 3; m.currentIntent = null;
    saveJson('.local/mandate.json', m);
    const result = await runFutureAgent();
    assert.equal(result.waiting, true);
    assert.equal(stats.requests, 0); assert.equal(stats.verifications, 0);
    const saved = readJson('.local/mandate.json');
    assert.equal(saved.status, 'budget-exhausted');
    assert.equal(saved.callsUsed, 3);
    assert.equal(saved.nextPollAt, pool.policy.settlementDeadline + pool.policy.refundGrace);
    assert.equal(existsSync('.local/v2/transactions'), false);
  });
});

test('expired V2 mandate stops without extending expiry or creating another economic intent', async () => {
  await isolatedFuture(async (_pool, m, stats) => {
    m.expiresAt = 1; saveJson('.local/mandate.json', m);
    await assert.rejects(runFutureAgent(), /expired; no extension or new payment/);
    assert.equal(stats.requests, 0); assert.equal(stats.verifications, 0);
    assert.equal(readJson('.local/mandate.json').status, 'expired');
    assert.equal(readJson('.local/mandate.json').expiresAt, 1);
    assert.equal(existsSync('.local/v2/transactions'), false);
    assert.equal(existsSync('.local/v2/intents'), false);
  });
});
