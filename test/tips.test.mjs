// Petites icônes « i » qui expliquent les mots (ROI, CLV…).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage, sampleData } from './page-harness.mjs';

test('les indicateurs des paris ont une icône d’explication (ROI, CLV…)', () => {
  // Le tableau (Cote, Modèle, CLV) n'apparaît que s'il y a au moins un pari.
  const bet = { id: 'b', gameId: 'g1', homeId: '1', awayId: '2', market: 'ml', pick: 'home', odds: 2, stake: 10, who: 'X', date: '2026-10-22' };
  const p = loadPage({ data: sampleData(), storage: { 'paris-stats-bets': JSON.stringify([bet]) } });
  const html = p.document.getElementById('view-paris').innerHTML;
  for (const k of ['fiche', 'mise', 'roi', 'clv', 'attente', 'cote', 'modele']) {
    assert.match(html, new RegExp(`class="tip" data-tip="${k}"`), k);
  }
});

test('chaque icône utilisée a une explication', () => {
  const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const used = [...src.matchAll(/tip\("(\w+)"\)/g)].map(m => m[1]);
  const gloss = src.slice(src.indexOf('var GLOSS = {'), src.indexOf('function tip('));
  assert.ok(used.length >= 10);
  for (const k of new Set(used)) assert.match(gloss, new RegExp(`\\b${k}: "`), k);
});
