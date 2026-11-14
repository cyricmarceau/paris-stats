import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sampleData } from './page-harness.mjs';

// Utilise les attributs du bouton réellement rendu, puis les gestionnaires du formulaire.
function openMarket(p, market) {
  const app = p.document.getElementById('app');
  const tag = [...(app.innerHTML + p.document.getElementById('view-joueurs').innerHTML).matchAll(/<button\b[^>]*>/g)].map(m => m[0])
    .find(s => s.includes(`data-m="${market}"`));
  assert.ok(tag, `bouton ${market} rendu`);
  const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const btn = { getAttribute: k => attrs[k] ?? null, closest: s => s === 'button.addbet' ? btn : null };
  app.dispatchEvent({ type: 'click', target: btn });
  return attrs;
}
function submit(p) {
  const el = id => p.document.getElementById(id);
  el('bmOdds').value = '1.91'; el('bmStake').value = '10'; el('bmWho').value = 'Cyric';
  el('betForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  return p.state().bets.at(-1);
}

for (const odds of [null, { spread: -4.5, total: 220.5 }]) {
  for (const market of odds ? ['ml', 'spread', 'total'] : ['ml']) {
    test(`formulaire ${market}, book ${!!odds} : probabilité sérialisée compatible avec validBet`, () => {
      const p = loadPage({ data: sampleData({ upcomingOdds: odds }) });
      openMarket(p, market);
      const b = submit(p);
      assert.ok(b.p == null || (typeof b.p === 'number' && Number.isFinite(b.p) && b.p >= 0 && b.p <= 1));
      const wire = JSON.parse(JSON.stringify(b));
      assert.ok(wire.p == null || (typeof wire.p === 'number' && wire.p >= 0 && wire.p <= 1));
    });
  }
}

test('backlog 18: changer la ligne du total ne doit pas conserver la probabilité initiale', () => {
  const p = loadPage({ data: sampleData({ upcomingOdds: { total: 220.5 } }) });
  const attrs = openMarket(p, 'total');
  const line = p.document.getElementById('bmLine');
  // Une ligne très différente, dans le sens qui rend le choix presque impossible.
  line.value = attrs['data-pick'] === 'over' ? '300.5' : '100.5';
  line.dispatchEvent({ type: 'input', target: line });
  p.document.getElementById('app').dispatchEvent({ type: 'input', target: line });
  const b = submit(p);
  assert.ok(b.p == null || b.p < 0.05, `probabilité initiale conservée : ${b.p}, ligne ${b.line}`);
});

for (const line of ['20.5', '-10000', '10000']) {
  test(`formulaire prop, ligne ${line} : data-po reste un nombre dans [0,1]`, () => {
    const players = { done: [], injuries: {}, players: { '1966': {
      n: 'Joueur', t: '2', pos: 'G',
      g: [18, 22, 26].map((v, i) => ['g' + i, '2026-11-01', '2', '1', 1, 30, v, 5, 7, 3])
    } } };
    const p = loadPage({ data: sampleData(), players, storage: {
      'paris-stats-lignes-joueurs': JSON.stringify({ 'u1:1966:pts': { l: line } })
    } });
    const attrs = openMarket(p, 'prop');
    const po = Number(attrs['data-po']);
    assert.ok(Number.isFinite(po) && po >= 0 && po <= 1);
    const b = submit(p);
    assert.ok(typeof b.p === 'number' && Number.isFinite(b.p) && b.p >= 0 && b.p <= 1);
    assert.equal(typeof b.playerName, 'string');
  });
}
