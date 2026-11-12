// Données complémentaires : stats des joueurs match par match, blessures,
// et face-à-face des deux saisons précédentes. Lancé après fetch-data.mjs.
// Incrémental : seules les feuilles de match pas encore lues sont téléchargées.
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const PAST_SEASONS = [2025, 2026]; // années ESPN : 2024-25 et 2025-26
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

const int = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };

// Lit toutes les lignes de joueurs d'une feuille de match ESPN.
export function parseRows(summary, game) {
  const blocks = summary?.boxscore?.players;
  if (!Array.isArray(blocks) || blocks.length !== 2) throw new Error(`Feuille de match incomplète pour ${game.id}`);
  const out = [];
  for (const block of blocks) {
    const teamId = String(block.team?.id);
    if (teamId !== game.homeId && teamId !== game.awayId) throw new Error(`Équipe inattendue ${teamId} dans ${game.id}`);
    const st = block.statistics?.[0];
    const keys = st?.keys || [];
    const k = name => keys.indexOf(name);
    const iMin = k('minutes'), iPts = k('points'), iReb = k('rebounds'), iAst = k('assists');
    const i3 = k('threePointFieldGoalsMade-threePointFieldGoalsAttempted');
    if ([iMin, iPts, iReb, iAst, i3].some(i => i < 0)) throw new Error(`Colonnes de stats inattendues dans ${game.id}`);
    for (const a of st.athletes || []) {
      const s = a.stats;
      if (a.didNotPlay || !Array.isArray(s) || !s.length || !a.athlete?.id) continue;
      const min = int(s[iMin]);
      if (min <= 0) continue;
      out.push({ id: String(a.athlete.id), n: a.athlete.displayName, pos: a.athlete.position?.abbreviation || '', teamId, min,
        pts: int(s[iPts]), reb: int(s[iReb]), ast: int(s[iAst]), tpm: int(String(s[i3]).split('-')[0]) });
    }
  }
  if (out.length < 10) throw new Error(`Seulement ${out.length} joueurs lus dans ${game.id}`);
  return out;
}

// Ajoute les lignes de stats d'un match. Ligne : [gameId, date, équipe, adversaire, domicile, min, pts, reb, ast, 3pts]
export function parseBox(summary, game, store) {
  const rows = parseRows(summary, game);
  for (const r of rows) {
    const p = store.players[r.id] || (store.players[r.id] = { n: r.n, pos: r.pos, g: [] });
    p.n = r.n || p.n;
    if (p.g.some(x => x[0] === game.id)) continue;
    const home = r.teamId === game.homeId;
    p.g.push([game.id, game.date.slice(0, 10), r.teamId, home ? game.awayId : game.homeId, home ? 1 : 0, r.min, r.pts, r.reb, r.ast, r.tpm]);
  }
  return rows.length;
}

export function parseInjuries(json) {
  const out = {};
  for (const team of json?.injuries || []) {
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

export function parseSchedule(json, into) {
  for (const ev of json?.events || []) {
    const c = ev.competitions?.[0];
    if (!c || c.status?.type?.name !== 'STATUS_FINAL' || Number(ev.seasonType?.type) !== 2) continue;
    const h = c.competitors?.find(t => t.homeAway === 'home'), a = c.competitors?.find(t => t.homeAway === 'away');
    const hs = Number(h?.score?.value ?? h?.score), as = Number(a?.score?.value ?? a?.score);
    if (!h || !a || !Number.isFinite(hs) || !Number.isFinite(as)) continue;
    into.set(String(ev.id), [String(ev.id), ev.date.slice(0, 10), String(h.team.id), String(a.team.id), hs, as]);
  }
}

async function main() {
  const data = await loadVar('data.js');
  if (!data?.games?.length) throw new Error('data.js absent ou vide : lance fetch-data.mjs avant.');

  // 1. Stats des joueurs (incrémental)
  const store = (await loadVar('players.js')) || { done: [], players: {} };
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
  store.generatedAt = new Date().toISOString();
  await saveVar('players.js', 'NBA_PLAYERS', store);
  console.log(`players.js : ${added} nouveaux matchs lus, ${failed} en échec, ${Object.keys(store.players).length} joueurs.`);

  // 3. Face-à-face des saisons passées : téléchargé une seule fois.
  const h2h = await loadVar('h2h.js');
  if (!h2h || String(h2h.seasons) !== PAST_SEASONS.join(',')) {
    const games = new Map();
    for (const season of PAST_SEASONS) {
      for (const team of data.teams) {
        try { parseSchedule(await get(`/teams/${team.id}/schedule?season=${season}`), games); }
        catch (error) { console.warn(`Face-à-face ${team.abbr} ${season} : ${error.message}`); }
      }
    }
    if (games.size < 1000) throw new Error(`Face-à-face incomplets (${games.size} matchs) : h2h.js non remplacé.`);
    await saveVar('h2h.js', 'NBA_H2H', { seasons: PAST_SEASONS.join(','), games: [...games.values()].sort((x, y) => x[1].localeCompare(y[1])) });
    console.log(`h2h.js : ${games.size} matchs des saisons ${PAST_SEASONS.join(', ')}.`);
  }
  // 4. Feuilles de match des face-à-face passés pour les matchs à venir (stats des joueurs contre cet adversaire).
  //    Les matchs passés ne changent plus : chaque feuille n'est téléchargée qu'une fois.
  const past = (await loadVar('h2h.js'))?.games || [];
  const box = (await loadVar('h2hbox.js')) || { games: {} };
  const want = new Set();
  for (const u of data.upcoming || []) {
    past.filter(r => (r[2] === u.homeId && r[3] === u.awayId) || (r[2] === u.awayId && r[3] === u.homeId))
      .sort((x, y) => y[1].localeCompare(x[1])).slice(0, 10)
      .forEach(r => { if (!box.games[r[0]]) want.add(r); });
  }
  let boxAdded = 0;
  for (const r of [...want].slice(0, 400)) {
    const game = { id: r[0], date: r[1], homeId: r[2], awayId: r[3] };
    try {
      const rows = parseRows(await get(`/summary?event=${game.id}`), game);
      box.games[game.id] = { d: r[1], h: r[2], a: r[3], r: rows.map(x => [x.id, x.teamId, x.min, x.pts, x.reb, x.ast, x.tpm]) };
      boxAdded++;
    } catch (error) { console.warn(`Face-à-face ${game.id} : ${error.message}`); }
  }
  if (boxAdded) await saveVar('h2hbox.js', 'NBA_H2H_BOX', box);
  console.log(`h2hbox.js : ${boxAdded} feuilles ajoutées, ${Object.keys(box.games).length} au total.`);
  console.log(`${requests} requêtes.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(`Données complémentaires : ${error.message}`); process.exitCode = 1; });
}
