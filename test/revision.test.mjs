// Le numéro de révision affiché en haut du site est présent et entier (voir AGENTS.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('numéro de révision affiché en haut de la page', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/<span class="rev" id="rev"[^>]*>révision (\d+)<\/span>/);
  assert.ok(m, 'élément id="rev" absent ou mal formé');
  assert.ok(Number(m[1]) >= 20);
});
