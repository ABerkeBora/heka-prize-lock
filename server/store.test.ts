import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { saveJson, readJson, exclusive } from './store.ts';

async function inIsolatedDirectory(fn: () => Promise<void>) {
  const root = process.cwd(); mkdirSync(join(root, '.local'), { recursive: true });
  const dir = mkdtempSync(join(root, '.local/security-store-'));
  try { process.chdir(dir); await fn(); }
  finally { process.chdir(root); rmSync(dir, { recursive: true, force: true }); }
}

test('atomic persisted state preserves integer amounts, uses private file mode, and does not silently reset corrupt state', async () => {
  await inIsolatedDirectory(async () => {
    saveJson('.local/state.json', { amount: 1000000000000000001n, intentId: 'match-prize' });
    assert.deepEqual(readJson('.local/state.json'), { amount: '1000000000000000001', intentId: 'match-prize' });
    assert.equal(statSync('.local/state.json').mode & 0o077, 0);
    assert.equal(existsSync('.local/state.json.tmp'), false);
    assert.deepEqual(readJson('.local/missing.json', { empty: true }), { empty: true });
    writeFileSync('.local/state.json', '{broken');
    assert.throws(() => readJson('.local/state.json', { reset: true }), SyntaxError);
  });
});

test('exclusive executor blocks concurrent economic actions and releases the lock after success or error', async () => {
  await inIsolatedDirectory(async () => {
    let release!: () => void; let economicActions = 0;
    const first = exclusive(async () => { economicActions++; await new Promise<void>(resolve => { release = resolve; }); });
    await assert.rejects(exclusive(async () => { economicActions++; }), /in progress/);
    assert.equal(economicActions, 1);
    release(); await first;
    assert.equal(existsSync('.local/action.lock'), false);
    await assert.rejects(exclusive(async () => { throw new Error('RPC failed'); }), /RPC failed/);
    assert.equal(existsSync('.local/action.lock'), false);
    await exclusive(async () => { economicActions++; });
    assert.equal(economicActions, 2);
  });
});

test('a process crash leaves a recoverable lock, without deleting a live owner lock', async () => {
  const storeUrl = new URL('./store.ts', import.meta.url).href;
  await inIsolatedDirectory(async () => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {exclusive} from ${JSON.stringify(storeUrl)}; await exclusive(async()=>{process.exit(0)});`], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(existsSync('.local/action.lock'), true);
    let ran = false;
    await exclusive(async () => { ran = true; });
    assert.equal(ran, true);
    assert.equal(existsSync('.local/action.lock'), false);
  });
});
