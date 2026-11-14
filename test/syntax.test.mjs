// « Lint » minimal : tous les scripts se compilent (pas de dépendance, donc pas d'ESLint).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { pageScript } from './page-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

for (const file of ['server.mjs', 'fetch-data.mjs', 'fetch-extras.mjs']) {
  test(`${file} se compile`, () => { execFileSync(process.execPath, ['--check', file], { cwd: root }); });
}

test('le script de index.html se compile', () => {
  assert.doesNotThrow(() => new vm.Script(pageScript, { filename: 'index.html' }));
});
