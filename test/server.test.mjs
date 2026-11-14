// API des paris (server.mjs) lancée pour de vrai, avec un faux GitHub en mémoire (fake-github.mjs).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'paris-api-'));
const children = [];
after(() => { children.forEach(c => c.kill()); rmSync(dir, { recursive: true, force: true }); });

let nextPort = 21000 + Math.floor(Math.random() * 20000);
async function startServer(env = {}) {
  const port = nextPort++;
  const ghFile = join(dir, `gh-${port}.json`);
  const child = spawn(process.execPath, ['--import', './test/fake-github.mjs', 'server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), FAKE_GH_FILE: ghFile, GITHUB_TOKEN: 'faux', BETS_CODE: 'secret', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server.mjs ne démarre pas')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('port')) { clearTimeout(t); resolve(); } });
    child.on('exit', code => { clearTimeout(t); reject(new Error(`server.mjs s'est arrêté (${code})`)); });
  });
  const call = (path, { method = 'GET', code, body } = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(code ? { 'X-Code': code } : {}) },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
  const github = () => JSON.parse(readFileSync(ghFile, 'utf8'));
  return { call, github };
}

const validBet = (o = {}) => ({ id: 'b1', gameId: '401909977', homeId: '27', awayId: '8', market: 'ml', pick: 'home', odds: 2.5, stake: 10, who: 'Cyric', date: '2026-11-13T00:00:00.000Z', ...o });

test('santé et liste vide ; la branche paris-data est créée', async () => {
  const s = await startServer();
  assert.equal((await s.call('/health')).status, 200);
  const r = await s.call('/api/bets');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { bets: [] });
  assert.ok(s.github().branches.includes('paris-data'));
});

test('ajout et suppression demandent le bon code', async () => {
  const s = await startServer();
  assert.equal((await s.call('/api/bets', { method: 'POST', body: { bet: validBet() } })).status, 401);
  assert.equal((await s.call('/api/bets', { method: 'POST', code: 'mauvais', body: { bet: validBet() } })).status, 401);
  assert.equal((await s.call('/api/bets/b1', { method: 'DELETE' })).status, 401);
  assert.equal(s.github().puts, 0);
});

test('pari invalide refusé', async () => {
  const s = await startServer();
  for (const bad of [{ odds: 1 }, { stake: 0 }, { market: 'autre' }, { pick: 'over' }, { market: 'spread' }, { who: 'x'.repeat(41) }, { date: 'pas une date' }]) {
    const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: validBet(bad) } });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(s.github().puts, 0);
});

test('ajout, doublon ignoré, puis suppression', async () => {
  const s = await startServer();
  let r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: validBet() } });
  assert.equal(r.status, 200);
  assert.equal(r.json.bets.length, 1);
  assert.deepEqual(JSON.parse(s.github().file), [validBet()]);
  r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bets: [validBet(), validBet({ id: 'b2', market: 'total', pick: 'over', line: 220.5 })] } });
  assert.deepEqual(r.json.bets.map(b => b.id), ['b1', 'b2']);
  r = await s.call('/api/bets/b1', { method: 'DELETE', code: 'secret' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.bets.map(b => b.id), ['b2']);
  assert.deepEqual((await s.call('/api/bets')).json.bets.map(b => b.id), ['b2']);
});

test('serveur sans configuration : 503', async () => {
  const s = await startServer({ GITHUB_TOKEN: '', BETS_CODE: '' });
  assert.equal((await s.call('/api/bets')).status, 503);
});


test('un POST contenant deux fois le même id ne doit enregistrer qu’un pari', { todo: 'backlog 10' }, async () => {
  const s = await startServer();
  const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bets: [validBet(), validBet()] } });
  assert.equal(r.status, 200);
  assert.equal(r.json.bets.length, 1);
  assert.equal(JSON.parse(s.github().file).length, 1);
});

test('tout id accepté par POST doit pouvoir être supprimé par DELETE', { todo: 'backlog 11' }, async () => {
  const s = await startServer();
  const id = 'import:1';
  const post = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: validBet({ id }) } });
  assert.equal(post.status, 200);
  assert.equal(post.json.bets[0].id, id);
  const del = await s.call('/api/bets/' + encodeURIComponent(id), { method: 'DELETE', code: 'secret' });
  assert.equal(del.status, 200);
  assert.deepEqual(del.json.bets, []);
});

test('un pari avec un identifiant d’équipe dangereux doit être refusé', async () => {
  const s = await startServer();
  const r = await s.call('/api/bets', {method:'POST',code:'secret',body:{bet:validBet({homeId:'constructor',awayId:'1'})}});
  assert.equal(r.status, 400);
});
