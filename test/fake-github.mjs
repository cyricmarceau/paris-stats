// Préchargé avec `node --import` devant server.mjs : remplace l'API GitHub par un dépôt en mémoire.
// L'état est recopié dans FAKE_GH_FILE après chaque requête pour que les tests puissent le lire.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const FILE = process.env.FAKE_GH_FILE;
const state = FILE && existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8'))
  : { branches: ['main'], file: null, sha: 0, puts: 0, failReads: false };
const save = () => { if (FILE) writeFileSync(FILE, JSON.stringify(state)); };
save();

const realFetch = globalThis.fetch;
const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'api.github.com') return realFetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
  try {
    if (state.failReads && method === 'GET') return reply(500, { message: 'panne simulée' });
    let m;
    if (method === 'GET' && (m = path.match(/^\/branches\/(.+)$/))) return state.branches.includes(m[1]) ? reply(200, {}) : reply(404, {});
    if (method === 'GET' && path === '/git/ref/heads/main') return reply(200, { object: { sha: 'main-sha' } });
    if (method === 'POST' && path === '/git/refs') {
      const ref = JSON.parse(init.body).ref.replace('refs/heads/', '');
      if (state.branches.includes(ref)) return reply(422, {});
      state.branches.push(ref); return reply(201, {});
    }
    if (path === '/contents/bets.json' && method === 'GET') {
      return state.file === null ? reply(404, {}) : reply(200, { content: Buffer.from(state.file).toString('base64'), sha: 's' + state.sha });
    }
    if (path === '/contents/bets.json' && method === 'PUT') {
      const body = JSON.parse(init.body);
      const want = state.file === null ? undefined : 's' + state.sha;
      if (body.sha !== want) return reply(409, {});
      state.file = Buffer.from(body.content, 'base64').toString('utf8');
      state.sha++; state.puts++;
      return reply(200, { content: { sha: 's' + state.sha } });
    }
    return reply(404, {});
  } finally { save(); }
};
