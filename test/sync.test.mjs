// Synchronisation des paris de la page avec l'API (fetch simulé).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sampleData } from './page-harness.mjs';

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
const okBet = { id: 'ok1', gameId: 'u1', homeId: '2', awayId: '1', market: 'ml', pick: 'home', odds: 2.1, stake: 10, who: 'Cyric', date: '2026-11-20T00:00:00.000Z' };
const longName = { ...okBet, id: 'long1', who: 'Un nom beaucoup trop long pour le serveur de paris' }; // > 40 caractères

// Imite server.mjs : GET renvoie la liste ; POST garde seulement les paris valides (nom ≤ 40), 400 si aucun.
function fakeApi() {
  const server = [];
  const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  return {
    server,
    fetch(url, opts = {}) {
      if (!url.endsWith('/api/bets')) return json(404, {});
      if ((opts.method || 'GET') === 'GET') return json(200, { bets: server.slice() });
      const good = JSON.parse(opts.body).bets.filter(b => b.who.length <= 40);
      if (!good.length) return json(400, { error: 'Pari invalide.' });
      good.forEach(b => { if (!server.some(x => x.id === b.id)) server.push(b); });
      return json(200, { bets: server.slice() });
    }
  };
}

const storageWith = bets => ({
  'paris-stats-bets': JSON.stringify(bets),
  'paris-stats-pend-add': JSON.stringify(bets.map(b => b.id)),
  'paris-stats-migrated': 'true',
  'paris-stats-code': 'secret'
});

test('un pari refusé par le serveur reste sur l’appareil, les autres sont envoyés', async () => {
  const api = fakeApi();
  const p = loadPage({ data: sampleData(), storage: storageWith([okBet, longName]), fetch: api.fetch });
  await flush();
  const s = p.state();
  assert.deepEqual(api.server.map(b => b.id), ['ok1']);
  assert.ok(s.bets.some(b => b.id === 'long1'), 'le pari refusé a été effacé de l’appareil');
  assert.deepEqual(s.pendAdd, ['long1'], 'le pari refusé doit rester en attente');
  assert.deepEqual(s.pendAdd.filter(id => id === 'ok1'), [], 'le pari accepté ne doit plus être en attente');
});

test('si le serveur refuse tout, la page le dit au lieu de « Serveur injoignable »', async () => {
  const api = fakeApi();
  const p = loadPage({ data: sampleData(), storage: storageWith([longName]), fetch: api.fetch });
  await flush();
  const s = p.state();
  assert.ok(s.bets.some(b => b.id === 'long1'));
  assert.notEqual(s.sync.msg, 'Serveur injoignable.');
  assert.match(s.sync.msg, /refus/i);
});
