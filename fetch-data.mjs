import { writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const DAY = 86400000;
const now = new Date();
const end = new Date(now.getTime() + 7 * DAY);
const output = fileURLToPath(new URL('./data.js', import.meta.url));
const temporary = `${output}.${process.pid}.tmp`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let requests = 0;
async function get(path) {
  if (requests++) await pause(300);
  const url = BASE + path;
  let response;
  try { response = await fetch(url, { headers: { 'User-Agent': 'Public sports data refresh/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }); }
  catch (error) { throw new Error(`Network failure for ${url}: ${error.message}`); }
  assert(response.ok, `HTTP ${response.status} for ${url}`);
  try { return await response.json(); }
  catch (error) { throw new Error(`Invalid JSON from ${url}: ${error.message}`); }
}
function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return null;
  return Number(value);
}
function oddsFor(competition) {
  const line = competition.odds?.find(item => item.provider?.name);
  if (!line) return null;
  const moneyline = side => {
    const n = numeric(line.moneyline?.[side]?.close?.odds ?? line[`${side}TeamOdds`]?.moneyLine);
    return n !== null && Number.isInteger(n) && Math.abs(n) >= 100 ? n : null;
  };
  // Explicit home-side line avoids ambiguity in ESPN's generic favorite spread.
  let spread = numeric(line.pointSpread?.home?.close?.line);
  if (spread === null && line.homeTeamOdds?.favorite === true) {
    const n = numeric(line.spread); spread = n === null ? null : -Math.abs(n);
  } else if (spread === null && line.awayTeamOdds?.favorite === true) {
    const n = numeric(line.spread); spread = n === null ? null : Math.abs(n);
  }
  const result = { provider: line.provider.name, homeMoneyline: moneyline('home'), awayMoneyline: moneyline('away'), spread, total: numeric(line.overUnder) };
  return Object.entries(result).some(([key, value]) => key !== 'provider' && value !== null) ? result : null;
}
async function main() {
  assert(now >= new Date('2026-10-01T00:00:00Z') && now < new Date('2027-10-01T00:00:00Z'), 'This script targets season 2026-27; update the season before refreshing a later season.');
  const teamData = await get('/teams?limit=100');
  const entries = teamData.sports?.[0]?.leagues?.[0]?.teams;
  assert(Array.isArray(entries), 'Missing ESPN teams array');
  const teams = entries.map(({ team }) => {
    assert(team?.id && team.abbreviation && team.displayName, 'Malformed team');
    return { id: String(team.id), abbr: team.abbreviation, name: team.displayName, logo: team.logos?.[0]?.href ?? null };
  }).sort((a, b) => a.abbr.localeCompare(b.abbr));
  const ids = new Set(teams.map(t => t.id));
  assert(teams.length === 30 && ids.size === 30, `Expected 30 unique teams, received ${teams.length}`);
  const events = new Map();
  // ESPN range requests returned HTTP 400 in live testing. Daily requests are
  // bounded (at most 15 NBA games), so limit=1000 cannot silently cut a season.
  // Start Oct 1 to include any early regular-season opener; filter preseason below.
  for (let day = Date.UTC(2026, 9, 1); day <= end.getTime(); day += DAY) {
    const date = new Date(day).toISOString().slice(0, 10).replaceAll('-', '');
    const data = await get(`/scoreboard?dates=${date}&limit=1000`);
    assert(Array.isArray(data.events), `Missing events array for ${date}`);
    assert(data.events.length < 1000, `Possibly truncated scoreboard for ${date}`);
    for (const event of data.events) {
      assert(event.id && event.season, `Malformed event for ${date}`);
      events.set(String(event.id), event);
    }
  }
  const games = [], upcoming = [];
  for (const event of events.values()) {
    if (Number(event.season.year) !== 2027 || Number(event.season.type) !== 2) continue;
    assert(Array.isArray(event.competitions) && event.competitions.length === 1, `Unexpected competitions for ${event.id}`);
    const c = event.competitions[0];
    const status = c.status?.type ?? event.status?.type;
    assert(status?.state && typeof status.completed === 'boolean', `Missing status for ${event.id}`);
    const timestamp = Date.parse(c.date ?? event.date);
    assert(Number.isFinite(timestamp), `Invalid date for ${event.id}`);
    const home = c.competitors?.find(t => t.homeAway === 'home');
    const away = c.competitors?.find(t => t.homeAway === 'away');
    const homeId = String(home?.team?.id), awayId = String(away?.team?.id);
    assert(ids.has(homeId) && ids.has(awayId) && homeId !== awayId, `Unknown teams for ${event.id}`);
    const game = { id: String(event.id), date: new Date(timestamp).toISOString(), homeId, awayId };
    if (status.completed && status.state === 'post' && status.name === 'STATUS_FINAL') {
      const homeScore = numeric(home.score), awayScore = numeric(away.score);
      assert(Number.isInteger(homeScore) && Number.isInteger(awayScore) && homeScore >= 0 && awayScore >= 0 && homeScore !== awayScore, `Invalid final scores for ${event.id}`);
      assert(timestamp <= now.getTime(), `Future final game ${event.id}`);
      games.push({ ...game, homeScore, awayScore });
    } else if (!status.completed && status.state === 'pre' && status.name === 'STATUS_SCHEDULED' && timestamp > now.getTime() && timestamp <= end.getTime()) {
      upcoming.push({ ...game, odds: oddsFor(c) });
    }
  }
  const sort = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  games.sort(sort); upcoming.sort(sort);
  assert(games.length > 0, 'No completed regular-season games returned; refusing to replace data.js');
  assert(upcoming.length > 0, 'No upcoming games returned; refusing to replace data.js');
  const records = teams.map(team => {
    const played = games.filter(g => g.homeId === team.id || g.awayId === team.id);
    const wins = played.filter(g => g.homeId === team.id ? g.homeScore > g.awayScore : g.awayScore > g.homeScore).length;
    const losses = played.filter(g => g.homeId === team.id ? g.homeScore < g.awayScore : g.awayScore < g.homeScore).length;
    assert(wins + losses === played.length, `Record mismatch for ${team.abbr}`);
    return { team: team.abbr, wins, losses, games: played.length };
  });
  const data = { generatedAt: now.toISOString(), season: '2026-27', source: 'ESPN', teams, games, upcoming };
  // Only replace the old file after every request and validation has succeeded.
  await writeFile(temporary, `window.NBA_DATA = ${JSON.stringify(data, null, 2)};\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, output);
  console.log(`Wrote data.js: ${teams.length} teams, ${games.length} completed games, ${upcoming.length} upcoming games; ${upcoming.filter(g => g.odds).length} with odds (${[...new Set(upcoming.filter(g => g.odds).map(g => g.odds.provider))].join(', ')}). ${requests} requests.`);
  console.table(records);
}
main().catch(async error => {
  await unlink(temporary).catch(() => {});
  console.error(`NBA refresh failed: ${error.message}. Existing data.js was not replaced.`);
  process.exitCode = 1;
});
