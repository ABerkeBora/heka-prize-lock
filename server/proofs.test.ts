import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { caseProof } from './proofs.ts';
import { AIRNODE } from './config.ts';
import { deriveRequestHash, verifySignedResponse } from './airnode-v2.ts';
import { readJson, saveJson } from './store.ts';
import { withScope, v2Scope } from './scope.ts';

const fixtures = [
  { version: 'V1', proof: JSON.parse(readFileSync(new URL('../evidence/latest-proof.json', import.meta.url), 'utf8')), request: JSON.parse(readFileSync(new URL('../evidence/request.json', import.meta.url), 'utf8')) },
  { version: 'V2', proof: JSON.parse(readFileSync(new URL('../evidence/v2/latest-proof.json', import.meta.url), 'utf8')), request: JSON.parse(readFileSync(new URL('../evidence/v2/request.json', import.meta.url), 'utf8')) },
];

test('edited tamper case changes real numeric and null winner bytes and invalidates each original signature without network', async () => {
  const root = process.cwd(); mkdirSync(join(root, '.local'), { recursive: true });
  const dir = mkdtempSync(join(root, '.local/security-proof-edit-'));
  const originalFetch = globalThis.fetch; let networkCalls = 0;
  try {
    process.chdir(dir);
    globalThis.fetch = (async () => { networkCalls++; throw new Error('Signature regression must run without network'); }) as typeof fetch;
    for (const { version, proof, request } of fixtures) {
      const check = async () => {
        saveJson('evidence/latest-proof.json', proof);
        const expectedHash = deriveRequestHash(request);
        assert.equal(proof.requestHash, expectedHash);
        await verifySignedResponse(proof, AIRNODE, expectedHash);
        const edited = await caseProof('edited');
        const before = JSON.parse(proof.data); const after = JSON.parse(edited.data);
        if (version === 'V1') assert.equal(typeof before.winnerId, 'number');
        else assert.equal(before.winnerId, null);
        assert.equal(after.winnerId, 1);
        assert.notEqual(edited.data, proof.data, `${version} edited case must alter the signed bytes`);
        assert.deepEqual(after, { ...before, winnerId: 1 });
        assert.equal(edited.signature, proof.signature);
        assert.equal(edited.timestamp, proof.timestamp);
        assert.equal(edited.requestHash, proof.requestHash);
        await assert.rejects(verifySignedResponse(edited, AIRNODE, expectedHash), /signed by/);
        assert.equal(readJson('evidence/latest-proof.json').data, proof.data, 'tamper tool must preserve its source fixture');
      };
      if (version === 'V2') await withScope(v2Scope, check);
      else await check();
    }
    assert.equal(networkCalls, 0);
  } finally { globalThis.fetch = originalFetch; process.chdir(root); rmSync(dir, { recursive: true, force: true }); }
});
