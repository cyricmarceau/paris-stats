// Synchronisation des paris de la page avec l'API (fetch simulé).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sampleData } from './page-harness.mjs';

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
const okBet = { id: 'ok1', gameId: 'u1', homeId: '2', awayId: '1', market: 'ml', pick: 'home', odds: 2.1, stake: 10, who: 'Cyric', date: '2026-11-20T00:00:00.000Z' };
const longName = { ...okBet, id: 'long1', who: 'Un nom beaucoup trop long pour le serveur de paris' }; // > 40 caractères

// Imite server.mjs : GET renvoie la liste ; POST garde seulement les paris valides (nom ≤ 40), 400 si aucun.
function fakeApi() {
  const server = [], calls = [];
  const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  return {
    server, calls,
    fetch(url, opts = {}) {
      calls.push({ url, method: opts.method || 'GET' });
      if (opts.method === 'DELETE') {
        const id = decodeURIComponent(url.split('/').pop());
        for (let i = server.length - 1; i >= 0; i--) if (server[i].id === id) server.splice(i, 1);
        return json(200, { bets: server.slice() });
      }
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


test('réessai : un pari déjà présent sur le serveur sort de l’attente sans duplication', async () => {
  const api = fakeApi(); api.server.push(okBet);
  const p = loadPage({ data: sampleData(), storage: storageWith([okBet]), fetch: api.fetch });
  await flush();
  assert.deepEqual(p.state().pendAdd, []);
  assert.equal(p.state().bets.length, 1);
  assert.equal(api.server.length, 1);
});

test('migration : seul le pari absent est envoyé, le refus reste local', async () => {
  const api = fakeApi(); api.server.push(okBet);
  const storage = storageWith([okBet, longName]);
  delete storage['paris-stats-migrated'];
  storage['paris-stats-pend-add'] = '[]';
  const p = loadPage({ data: sampleData(), storage, fetch: api.fetch });
  await flush();
  assert.deepEqual(p.state().pendAdd, ['long1']);
  assert.equal(p.state().bets.length, 2);
  assert.equal(p.localStorage.getItem('paris-stats-migrated'), 'true');
});

test('DELETE seul : un pari supprimé reste masqué après adopt et sort de l’attente', async () => {
  const api = fakeApi(); api.server.push(okBet);
  const storage = storageWith([]);
  storage['paris-stats-pend-del'] = JSON.stringify([okBet.id]);
  const p = loadPage({ data: sampleData(), storage, fetch: api.fetch });
  await flush();
  assert.deepEqual(api.server, []);
  assert.deepEqual(p.state().bets, []);
  assert.deepEqual(p.state().pendDel, []);
});

test('refus partiel : ne pas annoncer que tous les paris sont enregistrés', async () => {
  const api = fakeApi();
  const p = loadPage({ data: sampleData(), storage: storageWith([okBet, longName]), fetch: api.fetch });
  await flush();
  assert.deepEqual(p.state().pendAdd, ['long1']);
  assert.notEqual(p.state().sync.state, 'ok');
  assert.match(p.state().sync.msg, /refus/i);
});

test('refus total : les DELETE indépendants doivent tout de même être envoyés', async () => {
  const api = fakeApi(); api.server.push(okBet);
  const storage = storageWith([longName]);
  storage['paris-stats-pend-del'] = JSON.stringify([okBet.id]);
  const p = loadPage({ data: sampleData(), storage, fetch: api.fetch });
  await flush();
  assert.ok(api.calls.some(c => c.method === 'DELETE'), 'le POST 400 empêche tous les DELETE');
  assert.deepEqual(api.server, []);
  assert.deepEqual(p.state().pendDel, []);
  assert.deepEqual(p.state().pendAdd, ['long1']);
});

test('un id hérité de Object.prototype ne doit pas faire perdre un pari local', { todo: 'backlog 12' }, async () => {
  const api = fakeApi();
  const bet = { ...okBet, id: 'constructor' };
  const p = loadPage({ data: sampleData(), storage: storageWith([bet]), fetch: api.fetch });
  await flush();
  assert.ok(p.state().bets.some(b => b.id === bet.id), 'adopt confond la propriété héritée constructor avec un id présent');
  assert.equal(api.server.length, 1);
  assert.deepEqual(p.state().pendAdd, []);
});
