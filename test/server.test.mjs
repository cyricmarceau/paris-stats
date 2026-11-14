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

test('revue 8 : DELETE decode une seule fois et garde le message exact sans changer le chemin GitHub', async () => {
  const s = await startServer();
  for (const id of ['a/b', '%2F', '\u0000', 'avec espace', 'été 🏀', '../bets.json', 'a?b#c', 'x'.repeat(40)]) {
    assert.equal((await s.call('/api/bets', {method:'POST',code:'secret',body:{bet:validBet({id})}})).status,200);
    const r=await s.call('/api/bets/'+encodeURIComponent(id),{method:'DELETE',code:'secret'});
    assert.equal(r.status,200,JSON.stringify(id));
    assert.deepEqual(r.json.bets,[]);
    assert.equal(s.github().messages.at(-1),'Pari supprimé '+id);
    assert.deepEqual(JSON.parse(s.github().file),[]);
  }
});

test('revue 8 : authentification avant DELETE malforme, limites sans ecriture', async () => {
  const s=await startServer();
  for (const [segment,status] of [['%E0%A4%A',400],['%00',200],['x'.repeat(41),404],['x'.repeat(201),404]]) {
    const path='/api/bets/'+segment;
    const before=s.github().puts;
    assert.equal((await s.call(path,{method:'DELETE'})).status,401);
    assert.equal(s.github().puts,before);
    assert.equal((await s.call(path,{method:'DELETE',code:'secret'})).status,status);
    if(status!==200) assert.equal(s.github().puts,before);
  }
});

for (const [label,id] of [['vide',''],['point','.'],['deux points','..'],['unicode long','é'.repeat(40)],['unicode BMP','漢'.repeat(40)]]) {
  test('backlog 11 : round trip DELETE pour id '+label,{todo:'backlog 11'},async()=>{
    const s=await startServer();
    assert.equal((await s.call('/api/bets',{method:'POST',code:'secret',body:{bet:validBet({id})}})).status,200);
    const r=await s.call('/api/bets/'+encodeURIComponent(id),{method:'DELETE',code:'secret'});
    assert.equal(r.status,200);
    assert.deepEqual(r.json.bets,[]);
  });
}

test('backlog 11 : un id accepte doit pouvoir etre encode par le client',{todo:'backlog 11'},async()=>{
  const s=await startServer(), id='\ud800';
  assert.equal((await s.call('/api/bets',{method:'POST',code:'secret',body:{bet:validBet({id})}})).status,200);
  assert.doesNotThrow(()=>encodeURIComponent(id));
});

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


test('un POST contenant deux fois le même id ne doit enregistrer qu’un pari', async () => {
  const s = await startServer();
  const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bets: [validBet(), validBet()] } });
  assert.equal(r.status, 200);
  assert.equal(r.json.bets.length, 1);
  assert.equal(JSON.parse(s.github().file).length, 1);
});

test('tout id accepté par POST doit pouvoir être supprimé par DELETE', async () => {
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

test('numeric team ids remain accepted for all four page markets', async () => {
  const s = await startServer();
  for (const market of ['ml', 'spread', 'total', 'prop']) {
    const b = validBet({ id: market, market, pick: ['total', 'prop'].includes(market) ? 'over' : 'home',
      ...(market === 'ml' ? {} : { line: 20.5 }), ...(market === 'prop' ? { playerId: '123', stat: 'pts', playerName: 'Player' } : {}) });
    const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: b } });
    assert.equal(r.status, 200, market);
    assert.ok(r.json.bets.some(x => x.id === market));
  }
});

test('inherited names in either team id are rejected', async () => {
  const s = await startServer();
  for (const field of ['homeId', 'awayId']) {
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: validBet({ [field]: id }) } });
      assert.equal(r.status, 400, `${field}=${id}`);
    }
  }
  assert.equal(s.github().puts, 0);
});

test('backlog 15: dangerous player id is rejected for props', async () => {
  const s = await startServer();
  const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: validBet({
    market: 'prop', pick: 'over', line: 20.5, playerId: 'constructor', stat: 'pts'
  }) } });
  assert.equal(r.status, 400);
});

test('backlog 17: malformed optional probability must be rejected before storage', async () => {
  const s = await startServer();
  const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: {
    bet: validBet({ p: { toString: null } })
  } });
  assert.equal(r.status, 400);
  assert.equal(s.github().puts, 0);
});

test('a real ESPN athlete id remains accepted for every page stat', async () => {
  // Clé réelle contrôlée dans players.js local ; fixture fixe pour les clones sans données générées.
  const s = await startServer();
  for (const stat of ['pts', 'reb', 'ast', 'tpm']) {
    const b = validBet({ id: stat, market: 'prop', pick: 'over', line: 20.5, playerId: '1966', stat });
    const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: b } });
    assert.equal(r.status, 200, stat);
    assert.deepEqual(r.json.bets.find(x => x.id === stat), b);
  }
});

test('prop validation rejects missing, malformed and inherited player ids or stats', async () => {
  const s = await startServer();
  for (const bad of [
    { playerId: undefined }, { playerId: 1966 }, { playerId: 'p9' }, { playerId: '__proto__' },
    { playerId: '1234567890123' }, { stat: undefined }, { stat: 'constructor' }, { stat: '__proto__' }, { stat: 'unknown' }
  ]) {
    const b = validBet({ market: 'prop', pick: 'over', line: 20.5, playerId: '1966', stat: 'pts', ...bad });
    const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: b } });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(s.github().puts, 0);
});

test('backlog 17: malformed optional player name must be rejected before storage', async () => {
  const s = await startServer();
  const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: {
    bet: validBet({ market: 'prop', pick: 'over', line: 20.5, playerId: '123', stat: 'pts', playerName: { toString: null } })
  } });
  assert.equal(r.status, 400);
  assert.equal(s.github().puts, 0);
});

test('optional probability boundaries and player name types match the page contract', async () => {
  const s = await startServer();
  for (const [i, p] of [undefined, null, 0, 0.5, 1].entries()) {
    const r = await s.call('/api/bets', { method: 'POST', code: 'secret', body: {
      bet: validBet({ id: 'boundary-' + i, p, playerName: i === 0 ? undefined : i === 1 ? null : 'Joueur' })
    } });
    assert.equal(r.status, 200, `p=${p}`);
  }
  const puts = s.github().puts;
  for (const p of [-0.01, 1.01, '0.5', false, [], {}]) {
    assert.equal((await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: validBet({ p }) } })).status, 400);
  }
  for (const playerName of [123, false, [], 'x'.repeat(81)]) {
    assert.equal((await s.call('/api/bets', { method: 'POST', code: 'secret', body: { bet: validBet({ playerName }) } })).status, 400);
  }
  assert.equal(s.github().puts, puts);
});

// Revue 7 : première copie valide conservée, même si les autres champs diffèrent.
test('revue 7 : doublons différents et réessai conservent la première copie', async () => {
  const s = await startServer();
  const first = validBet({who:'Premier',stake:12});
  const second = validBet({who:'Second',stake:99});
  for (let i=0; i<2; i++) {
    const r = await s.call('/api/bets', {method:'POST',code:'secret',body:{bets:i ? [second, second] : [first,second]}});
    assert.equal(r.status,200);
    assert.deepEqual(r.json.bets,[first]);
    assert.deepEqual(JSON.parse(s.github().file),[first]);
  }
});

for (const invalidFirst of [true, false]) {
  test('revue 7 : même id valide/invalide, invalide en premier = '+invalidFirst, async () => {
    const s = await startServer();
    const good = validBet(), bad = validBet({stake:0});
    const r = await s.call('/api/bets', {method:'POST',code:'secret',body:{bets:invalidFirst ? [bad,good] : [good,bad]}});
    assert.equal(r.status,200);
    assert.deepEqual(r.json.bets,[good]);
    assert.deepEqual(JSON.parse(s.github().file),[good]);
  });
}

test('backlog 21 : message GitHub ne cite que le parieur effectivement ajoute', {todo:'backlog 21'}, async () => {
  const s=await startServer();
  const r=await s.call('/api/bets',{method:'POST',code:'secret',body:{bets:[validBet({who:'Premier'}),validBet({who:'Second'})]}});
  assert.equal(r.status,200);
  assert.deepEqual(r.json.bets,[validBet({who:'Premier'})]);
  assert.deepEqual(s.github().messages,['Pari ajouté (Premier)']);
});
