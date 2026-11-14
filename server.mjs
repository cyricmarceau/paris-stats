// API des paris partagés (Render, service web gratuit).
// Les paris sont gardés dans bets.json sur la branche DATA_BRANCH du dépôt GitHub :
// rien ne se perd quand Render redémarre ou endort le service, et chaque changement est historisé.
//
// Variables d'environnement :
//   GITHUB_TOKEN  jeton GitHub « fine-grained » limité au dépôt, permission Contents : Read and write
//   BETS_CODE     code d'équipe demandé pour ajouter ou supprimer un pari
//   GITHUB_REPO   ex. cyricmarceau/paris-stats
//   DATA_BRANCH   ex. paris-data (pas main : un commit sur main redéploierait le site)
//   ALLOW_ORIGIN  ex. https://paris-stats.onrender.com
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const { GITHUB_TOKEN, BETS_CODE } = process.env;
const REPO = process.env.GITHUB_REPO || 'cyricmarceau/paris-stats';
const BRANCH = process.env.DATA_BRANCH || 'paris-data';
const ORIGIN = process.env.ALLOW_ORIGIN || 'https://paris-stats.onrender.com';
const FILE = 'bets.json';
const PORT = Number(process.env.PORT) || 10000;
const MARKETS = ['ml', 'spread', 'total', 'prop'];

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'paris-stats-api', ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000)
  });
  return res;
}

async function ensureBranch() {
  if ((await gh(`/branches/${BRANCH}`)).ok) return;
  const main = await (await gh('/git/ref/heads/main')).json();
  const res = await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: main.object.sha }) });
  if (!res.ok && res.status !== 422) throw new Error(`Création de la branche ${BRANCH} : HTTP ${res.status}`);
}

let cache = null; // { bets, sha }
async function load(force = false) {
  if (cache && !force) return cache;
  const res = await gh(`/contents/${FILE}?ref=${BRANCH}`);
  if (res.status === 404) { await ensureBranch(); cache = { bets: [], sha: null }; return cache; }
  if (!res.ok) throw new Error(`Lecture : HTTP ${res.status}`);
  const j = await res.json();
  cache = { bets: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8') || '[]'), sha: j.sha };
  return cache;
}

// Applique un changement et l'écrit ; recommence si quelqu'un a écrit entre-temps.
async function update(change, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await load(attempt > 0);
    const next = change(cur.bets.slice());
    if (next === cur.bets) return cur.bets;
    const body = { message, branch: BRANCH, content: Buffer.from(JSON.stringify(next, null, 1)).toString('base64') };
    if (cur.sha) body.sha = cur.sha;
    const res = await gh(`/contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body) });
    if (res.ok) { cache = { bets: next, sha: (await res.json()).content.sha }; return next; }
    if (res.status !== 409 && res.status !== 422) throw new Error(`Écriture : HTTP ${res.status}`);
  }
  throw new Error('Conflit d\'écriture répété');
}

function validBet(b) {
  const teamId = v => typeof v === 'string' && /^\d{1,10}$/.test(v); // identifiants ESPN numériques
  return b && typeof b.id === 'string' && b.id.length <= 40 && typeof b.gameId === 'string' && MARKETS.includes(b.market) &&
    teamId(b.homeId) && teamId(b.awayId) &&
    Number.isFinite(b.odds) && b.odds > 1 && b.odds < 1000 && Number.isFinite(b.stake) && b.stake > 0 && b.stake < 1e6 &&
    typeof b.who === 'string' && b.who.length <= 40 && Number.isFinite(Date.parse(b.date)) &&
    (b.market === 'total' || b.market === 'prop' ? ['over', 'under'] : ['home', 'away']).includes(b.pick) &&
    (b.market === 'ml' || Number.isFinite(b.line)) && JSON.stringify(b).length < 2000;
}

function codeOk(req) {
  const given = Buffer.from(String(req.headers['x-code'] || ''));
  const want = Buffer.from(String(BETS_CODE || ''));
  return want.length > 0 && given.length === want.length && timingSafeEqual(given, want);
}

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Code',
    'Cache-Control': 'no-store'
  });
  res.end(data === undefined ? '' : JSON.stringify(data));
}

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 200000) throw new Error('Requête trop grosse'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return send(res, 204);
    if (url.pathname === '/' || url.pathname === '/health') return send(res, 200, { ok: true });
    if (!GITHUB_TOKEN || !BETS_CODE) return send(res, 503, { error: 'Serveur pas encore configuré (GITHUB_TOKEN, BETS_CODE).' });
    if (url.pathname === '/api/bets' && req.method === 'GET') return send(res, 200, { bets: (await load()).bets });
    if (!codeOk(req)) return send(res, 401, { error: 'Code d\'équipe invalide.' });
    if (url.pathname === '/api/bets' && req.method === 'POST') {
      const body = await readBody(req);
      const list = Array.isArray(body.bets) ? body.bets : [body.bet];
      const good = list.filter(validBet);
      if (!good.length) return send(res, 400, { error: 'Pari invalide.' });
      const bets = await update(cur => {
        const have = new Set(cur.map(b => b.id));
        const add = good.filter(b => !have.has(b.id));
        return add.length ? cur.concat(add) : cur;
      }, `Pari ajouté (${good.map(b => b.who).join(', ')})`);
      return send(res, 200, { bets });
    }
    const m = url.pathname.match(/^\/api\/bets\/([\w-]{1,40})$/);
    if (m && req.method === 'DELETE') {
      const bets = await update(cur => cur.some(b => b.id === m[1]) ? cur.filter(b => b.id !== m[1]) : cur, `Pari supprimé ${m[1]}`);
      return send(res, 200, { bets });
    }
    send(res, 404, { error: 'Introuvable.' });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: error.message });
  }
}).listen(PORT, () => console.log(`API des paris sur le port ${PORT}`));
