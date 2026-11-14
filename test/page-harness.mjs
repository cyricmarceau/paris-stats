// Charge le script de index.html dans Node avec un faux DOM minimal et rend ses fonctions internes.
// Le script appelle window.__PS_TEST__(api) à la fin ; voir le bas de index.html.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length !== 1) throw new Error(`index.html : 1 script en ligne attendu, ${scripts.length} trouvé(s)`);
export const pageScript = scripts[0];

function element() {
  return {
    innerHTML: '', textContent: '', value: '', hidden: false, title: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, querySelector() { return element(); }, querySelectorAll() { return []; },
    getAttribute() { return null; }, setAttribute() {}, focus() {}, closest() { return null; }
  };
}

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    dump: () => Object.fromEntries(m)
  };
}

// data : contenu de window.NBA_DATA. fetch : remplace l'appel réseau de la page (par défaut, ne répond jamais).
export function loadPage({ data, players = null, storage = {}, fetch } = {}) {
  const els = new Map();
  const document = {
    hidden: false,
    getElementById(id) { if (!els.has(id)) els.set(id, element()); return els.get(id); },
    addEventListener() {}
  };
  let api = null;
  const sandbox = {
    document, console, Intl, Date, Math, JSON, Promise, Number, String, Array, Object, Error, isFinite, parseFloat, parseInt,
    localStorage: memoryStorage(storage),
    navigator: {},
    fetch: fetch || (() => new Promise(() => {})),
    AbortController,
    setTimeout: () => 0, clearTimeout: () => {},
    NBA_DATA: data, NBA_PLAYERS: players,
    __PS_TEST__: x => { api = x; }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(pageScript, sandbox, { filename: 'index.html' });
  if (!api) throw new Error('index.html n’a pas appelé window.__PS_TEST__');
  api.localStorage = sandbox.localStorage;
  api.document = document; // Inspection du HTML rendu (syncBox, view-paris).
  return api;
}

// Petit jeu de données : 4 équipes, quelques matchs joués, un match à venir.
export function sampleData({ upcomingOdds = null } = {}) {
  const teams = ['1', '2', '3', '4'].map(id => ({ id, abbr: 'T' + id, name: 'Team ' + id, logo: null }));
  const games = [];
  let n = 0;
  const add = (homeId, awayId, homeScore, awayScore) =>
    games.push({ id: 'g' + (++n), date: new Date(Date.UTC(2026, 9, 21 + n)).toISOString(), homeId, awayId, homeScore, awayScore });
  add('1', '2', 120, 100); add('3', '4', 110, 112); add('2', '3', 105, 99); add('4', '1', 101, 118);
  add('1', '3', 115, 108); add('2', '4', 98, 104);
  const upcoming = [{ id: 'u1', date: new Date(Date.now() + 864e5).toISOString(), homeId: '2', awayId: '1', odds: upcomingOdds }];
  return { generatedAt: new Date().toISOString(), season: '2026-27', source: 'test', teams, games, upcoming };
}
