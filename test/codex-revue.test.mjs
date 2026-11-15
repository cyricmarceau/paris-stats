// Revue des PR #20–#24. Aucun service distant : serveur réel, GitHub simulé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPage, sampleData } from './page-harness.mjs';

async function server(t) {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const dir = mkdtempSync(join(tmpdir(), 'ps-revue-'));
  const stateFile = join(dir, 'github.json');
  const child = spawn(process.execPath, ['--import', './test/fake-github.mjs', 'server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: String(port), GITHUB_TOKEN: 'faux', BETS_CODE: '', FAKE_GH_FILE: stateFile },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
    rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API non démarrée')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('port')) { clearTimeout(timer); resolve(); } });
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('API arrêtée : ' + code)); });
  });
  return {
    async call(path, method = 'GET', body) {
      const r = await fetch(`http://127.0.0.1:${port}${path}`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      return { status: r.status, body: await r.json() };
    },
    github: () => JSON.parse(readFileSync(stateFile, 'utf8'))
  };
}

const bet = { id: 'revue', gameId: 'g1', homeId: '1', awayId: '2', market: 'ml', pick: 'home',
  odds: 2.5, stake: 10, who: 'Revue', date: '2026-10-22T00:00:00Z' };
const poison = { ...bet, closeOdds: { toString: null } };

// Défaut de validation préexistant (backlog 23), désormais accessible sans code (#20).
test('revue 1 : POST anonyme refuse closeOdds objet', async t => {
  const s = await server(t);
  const r = await s.call('/api/bets', 'POST', { bet: poison });
  assert.equal(r.status, 400);
  assert.equal(s.github().puts, 0);
});

test('revue 1 : un pari accepté sans code ne bloque pas le prochain chargement', async t => {
  const s = await server(t);
  const posted = await s.call('/api/bets', 'POST', { bet: poison });
  if (posted.status === 400) return; // Une validation serveur corrige aussi ce chemin.
  assert.equal(posted.status, 200);
  const downloaded = await s.call('/api/bets');
  assert.doesNotThrow(() => loadPage({ data: sampleData(), storage: {
    'paris-stats-bets': JSON.stringify(downloaded.body.bets)
  } }));
});

// Défaut préexistant (backlog 2), exploitable sans code depuis #20.
test('revue 2 : DELETE anonyme absent ne crée aucun commit GitHub', async t => {
  const s = await server(t);
  assert.equal((await s.call('/api/bets', 'POST', { bet })).status, 200);
  const before = s.github().puts;
  for (let i = 0; i < 3; i++) assert.equal((await s.call('/api/bets/inexistant', 'DELETE')).status, 200);
  assert.equal(s.github().puts, before, 'chaque DELETE sans effet produit un PUT GitHub');
});

const odds = { homeMoneyline: 250, awayMoneyline: -300, spread: 7.5, total: 200.5 };
function clickButton(p, tag) {
  assert.ok(tag, 'bouton rendu');
  const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const button = { getAttribute: k => attrs[k] ?? null, closest: s => s === 'button.addbet' ? button : null };
  p.document.getElementById('app').dispatchEvent({ type: 'click', target: button });
}

test('revue 3 : Top ne réutilise pas une cote effacée et absente du formulaire', () => {
  const p = loadPage({ data: sampleData({ upcomingOdds: odds }) });
  const app = p.document.getElementById('app');
  assert.ok(p.topCandidates().some(c => c.market === 'ml' && c.pick === 'home'));
  // Représente le véritable input rendu, avec sa cote importée puis effacée.
  const attrs = { 'data-id': 'u1:home', 'data-p': String(p.withMarket(p.project(p.teams['2'], p.teams['1']), odds).pHome),
    'data-book': '3.5', 'data-prov': 'book' };
  const input = { value: '', classList: { contains: c => c === 'odds' }, getAttribute: k => attrs[k] ?? null };
  const originalQuery = app.querySelector.bind(app);
  app.querySelector = selector => selector === 'input.odds[data-id="u1:home"]' ? input : originalQuery(selector);
  app.dispatchEvent({ type: 'input', target: input });
  p.showView('top');
  const top = p.document.getElementById('view-top').innerHTML;
  const tag = [...top.matchAll(/<button\b[^>]*>/g)].map(m => m[0])
    .find(s => s.includes('data-m="ml"') && s.includes('data-pick="home"'));
  if (tag) {
    clickButton(p, tag);
    assert.ok(Number(p.document.getElementById('bmOdds').value) > 1,
      'Top recommande 3,50 mais le formulaire ouvert depuis ce pari a une cote vide');
  }
});

test('revue : calculs Top cohérents avec les boutons Matchs, signes et cotes manuelles', () => {
  for (const spread of [-7.5, 7.5]) {
    const p = loadPage({ data: sampleData({ upcomingOdds: { ...odds, spread } }), storage: {
      'paris-stats-cotes': JSON.stringify({ 'u1:home': { v: '4.125', t: Date.now() } })
    } });
    const app = p.document.getElementById('app').innerHTML;
    const pr = p.withMarket(p.project(p.teams['2'], p.teams['1']), { ...odds, spread });
    for (const c of p.topCandidates()) {
      assert.ok(Math.abs(c.ev - (c.p * c.dec - 1)) < 1e-12);
      const button = [...app.matchAll(/<button\b[^>]*>/g)].map(m => m[0])
        .find(s => s.includes(`data-m="${c.market}"`) && s.includes(`data-pick="${c.pick}"`));
      assert.ok(button, 'même choix sur la carte : ' + c.label);
      assert.equal(Number(button.match(/data-p="([^"]+)"/)[1]), c.p);
      if (c.market === 'spread') {
        const ph = p.normCdf((pr.margin + spread) / 12);
        assert.equal(c.p, c.pick === 'home' ? ph : 1 - ph);
        assert.ok(c.label.endsWith(String(c.pick === 'home' ? spread : -spread)));
      }
      if (c.market === 'total') {
        const po = 1 - p.normCdf((odds.total - pr.total) / 18);
        assert.equal(c.p, c.pick === 'over' ? po : 1 - po);
      }
      if (c.market === 'ml' && c.pick === 'home') assert.equal(c.dec, 4.125);
    }
  }
});

test('revue : nom prompt et libellés Top restent du texte échappé', () => {
  const attack = '<img src=x onerror=alert(1)>';
  const data = sampleData({ upcomingOdds: odds });
  data.teams.forEach(t => { t.abbr = attack; });
  const p = loadPage({ data, prompt: () => attack });
  p.document.getElementById('me').dispatchEvent({ type: 'click' });
  assert.equal(p.document.getElementById('me').textContent, '👤 ' + attack);
  p.showView('top');
  const top = p.document.getElementById('view-top').innerHTML;
  assert.ok(top.includes('&lt;img'));
  assert.ok(!top.includes('<img'));
});

test('revue : API anonyme conserve ses bornes de validation et de taille de requête', async t => {
  const s = await server(t);
  for (const patch of [{ odds: 1 }, { odds: 1000 }, { stake: 0 }, { stake: 1e6 },
    { who: 'x'.repeat(41) }, { p: 1.1 }, { homeId: 'constructor' }, { padding: 'x'.repeat(2100) }]) {
    assert.equal((await s.call('/api/bets', 'POST', { bet: { ...bet, ...patch } })).status, 400);
  }
  const tooLarge = await s.call('/api/bets', 'POST', { padding: 'x'.repeat(200001) });
  assert.ok(tooLarge.status >= 400, 'ne doit pas accepter une requête de plus de 200 000 octets');
  assert.equal(s.github().puts, 0);
  assert.equal((await s.call('/health')).status, 200);
});

test('revue : synchro sans X-Code et message 401 actualisé', async () => {
  const calls = [];
  const p = loadPage({ data: sampleData(), storage: { 'paris-stats-code': 'ancien-code' },
    fetch: async (url, opts) => {
      calls.push(opts);
      return { ok: false, status: 401, json: async () => ({}) };
    }
  });
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.length);
  assert.ok(calls.every(opts => !Object.keys(opts.headers).some(k => k.toLowerCase() === 'x-code')));
  assert.equal(p.state().sync.state, 'off');
  assert.equal(p.state().sync.msg, "Le serveur a refusé l'accès.");
});
