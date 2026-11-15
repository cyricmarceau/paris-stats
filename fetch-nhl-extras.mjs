import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl';
const here = name => fileURLToPath(new URL(`./${name}`, import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let requests = 0;

async function get(path) {
  if (requests++) await pause(250);
  const url = BASE + path;
  const response = await fetch(url, { headers: { 'User-Agent': 'Public sports data refresh/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function loadVar(file) {
  try {
    const text = await readFile(here(file), 'utf8');
    return JSON.parse(text.slice(text.indexOf('=') + 1).trim().replace(/;\s*$/, ''));
  } catch { return null; }
}

async function saveVar(file, name, value) {
  const tmp = here(`${file}.${process.pid}.tmp`);
  try {
    await writeFile(tmp, `window.${name} = ${JSON.stringify(value)};\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(tmp, here(file));
  } catch (error) { await unlink(tmp).catch(() => {}); throw error; }
}

// Points = goals + assists: ESPN provides no points column in hockey boxscores.
export function parseRows(summary, game) {
  const blocks = summary?.boxscore?.players;
  if (!Array.isArray(blocks) || blocks.length !== 2) throw new Error(`Feuille incomplete pour ${game.id}`);
  const out = [], seenTeams = new Set(), seenPlayers = new Set();
  for (const block of blocks) {
    const teamId = String(block.team?.id);
    if (teamId !== game.homeId && teamId !== game.awayId) throw new Error(`Equipe inattendue ${teamId}`);
    if (seenTeams.has(teamId)) throw new Error(`Equipe ${teamId} en double`);
    seenTeams.add(teamId);
    if (!Array.isArray(block.statistics)) throw new Error('Colonnes absentes');
    let count = 0;
    for (const st of block.statistics) {
      if (st.name === 'goalies') continue;
      const keys = st.keys || [];
      const indices = ['timeOnIce', 'goals', 'assists', 'shotsTotal'].map(k => keys.indexOf(k));
      if (indices.some(i => i < 0)) throw new Error(`Colonnes inattendues dans ${game.id} (${st.name})`);
      if (!Array.isArray(st.athletes)) throw new Error('Joueurs absents');
      for (const a of st.athletes) {
        if (a.didNotPlay || a.athlete?.scratched || a.athlete?.position?.abbreviation === 'G') continue;
        const stats = a.stats;
        if (!a.athlete?.id || !Array.isArray(stats) || stats.length < keys.length) throw new Error(`Stats tronquees dans ${game.id}`);
        const [time, ...values] = indices.map(i => stats[i]);
        const m = String(time).match(/^(\d+):([0-5]\d)$/);
        if (!m || values.some(v => !/^\d+$/.test(String(v)))) throw new Error(`Stats invalides dans ${game.id}`);
        const toi = Math.round((Number(m[1]) + Number(m[2]) / 60) * 10) / 10;
        const [goals, assists, shots] = values.map(Number);
        if (Number(m[1]) === 0 && Number(m[2]) === 0 && !(goals || assists || shots)) continue;
        const id = String(a.athlete.id);
        // ESPN can repeat players under the aggregate skaters group.
        if (seenPlayers.has(id)) continue;
        seenPlayers.add(id); count++;
        out.push({ id, n: a.athlete.displayName, pos: a.athlete.position?.abbreviation || '', teamId, toi, goals, assists, points: goals + assists, shots });
      }
    }
    // Normal lineup: 18 skaters. Reject severely incomplete team sheets.
    if (count < 10) throw new Error(`Seulement ${count} joueurs lus pour ${teamId} dans ${game.id}`);
  }
  return out;
}

export function parseBox(summary, game, store) {
  const rows = parseRows(summary, game); // Validate fully before mutating the store.
  for (const r of rows) {
    const p = store.players[r.id] || (store.players[r.id] = { n: r.n, pos: r.pos, t: r.teamId, g: [] });
    p.n = r.n || p.n; p.pos = r.pos || p.pos;
    if (p.g.some(x => x[0] === game.id)) continue;
    const home = r.teamId === game.homeId;
    p.g.push([game.id, game.date.slice(0, 10), r.teamId, home ? game.awayId : game.homeId, home ? 1 : 0, r.toi, r.goals, r.assists, r.points, r.shots]);
  }
  return rows.length;
}

export function parseInjuries(json) {
  if (!Array.isArray(json?.injuries)) throw new Error('Liste de blessures absente');
  const out = {};
  for (const team of json.injuries) {
    if (!team.id || !Array.isArray(team.injuries)) throw new Error('Blessures NHL incompletes');
    const list = [];
    for (const it of team.injuries || []) {
      const href = (it.athlete?.links || []).map(l => l.href).find(h => /\/id\/\d+/.test(h || '')) || '';
      const m = href.match(/\/id\/(\d+)/);
      list.push({ id: m ? m[1] : null, n: it.athlete?.displayName || '?', s: it.status || '', c: it.shortComment || '', d: it.date || '' });
    }
    out[String(team.id)] = list;
  }
  return out;
}

async function main() {
  const data = await loadVar('nhl-data.js');
  if (!data?.games?.length) throw new Error('nhl-data.js absent ou vide : lance fetch-nhl.mjs avant.');

  // 1. Stats des joueurs (incrémental)
  const store = (await loadVar('nhl-players.js')) || { done: [], players: {} };
  const done = new Set(store.done);
  let added = 0, failed = 0;
  for (const game of data.games) {
    if (done.has(game.id)) continue;
    try { parseBox(await get(`/summary?event=${game.id}`), game, store); done.add(game.id); added++; }
    catch (error) { failed++; console.warn(`Joueurs : ${error.message} (réessai au prochain passage)`); }
  }
  for (const p of Object.values(store.players)) {
    p.g.sort((x, y) => x[1].localeCompare(y[1]));
    p.t = p.g.length ? p.g[p.g.length - 1][2] : null;
  }
  store.done = [...done];

  // 2. Blessures (toute la ligue, une requête)
  try { store.injuries = parseInjuries(await get('/injuries')); store.injuriesAt = new Date().toISOString(); }
  catch (error) { console.warn(`Blessures non rafraîchies : ${error.message}`); }
  if (!store.done.length || !Object.keys(store.players).length) throw new Error('Aucune feuille NHL valide : fichier non remplace.');
  store.injuries ??= {};
  store.injuriesAt ??= null;
  store.generatedAt = new Date().toISOString();
  await saveVar('nhl-players.js', 'NHL_PLAYERS', store);
  console.log(`nhl-players.js : ${added} nouveaux matchs lus, ${failed} en échec, ${Object.keys(store.players).length} joueurs.`);

}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(`Données complémentaires : ${error.message}`); process.exitCode = 1; });
}
