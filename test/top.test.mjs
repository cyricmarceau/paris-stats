// Onglet « Top paris » : tous les paris des matchs à venir, classés par valeur espérée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sampleData } from './page-harness.mjs';

const odds = { homeMoneyline: 250, awayMoneyline: -300, spread: 7.5, total: 200.5, provider: 'DraftKings' };

test('les candidats sont triés par valeur espérée décroissante, tous positifs', () => {
  const p = loadPage({ data: sampleData({ upcomingOdds: odds }) });
  const list = p.topCandidates();
  assert.ok(list.length > 0);
  for (let i = 0; i < list.length; i++) {
    assert.ok(list[i].ev > 0, 'valeur positive');
    if (i) assert.ok(list[i - 1].ev >= list[i].ev, 'tri décroissant');
    assert.ok(Math.abs(list[i].ev - (list[i].p * list[i].dec - 1)) < 1e-12);
  }
});

test('gagnant, écart et total sont tous évalués', () => {
  const p = loadPage({ data: sampleData({ upcomingOdds: odds }) });
  // Ici le total projeté des équipes de test (~216) est loin de 200.5 : l'Over doit sortir.
  const over = p.topCandidates().find(c => c.market === 'total' && c.pick === 'over');
  assert.ok(over, 'Over 200.5 attendu');
  assert.equal(over.label, 'Over 200.5');
  assert.equal(over.dec, 1.91);
});

test('sans cote, aucun candidat et un message clair', () => {
  const p = loadPage({ data: sampleData() });
  assert.equal(p.topCandidates().length, 0);
  p.showView('top');
  assert.match(p.document.getElementById('view-top').innerHTML, /Aucun pari à valeur positive/);
});

test('l’onglet affiche les sections et un bouton Parier', () => {
  const p = loadPage({ data: sampleData({ upcomingOdds: odds }) });
  p.showView('top');
  const html = p.document.getElementById('view-top').innerHTML;
  assert.match(html, /<h2>Top paris<\/h2>/);
  assert.match(html, /class="addbet[^"]*" data-g="u1" data-m="total" data-pick="over"/);
});
