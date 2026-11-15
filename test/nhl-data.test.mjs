import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { oddsFor, parseEvent } from '../fetch-nhl.mjs';
import { parseRows, parseBox, parseInjuries } from '../fetch-nhl-extras.mjs';

// Reduced real ESPN response: metadata removed, original columns and rows retained.
const fixture = JSON.parse(await readFile(new URL('./nhl-summary.fixture.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(fixture);

test('NHL: puck line domicile, total et moneylines ESPN', () => {
  assert.deepEqual(oddsFor({ odds: [{ provider: { name: 'DraftKings' },
    moneyline: { home: { close: { odds: '+126' } }, away: { close: { odds: '-148' } } },
    pointSpread: { home: { close: { line: '+1.5' } } }, overUnder: 6.5 }] }),
  { provider: 'DraftKings', homeMoneyline: 126, awayMoneyline: -148, spread: 1.5, total: 6.5 });
  const line = { provider: { name: 'DraftKings' }, spread: -1.5, homeTeamOdds: { favorite: true, moneyLine: -135 }, awayTeamOdds: { moneyLine: 114 }, total: { over: { close: { line: 'o5.5' } } } };
  assert.equal(oddsFor({ odds: [line] }).spread, -1.5);
  assert.equal(oddsFor({ odds: [line] }).total, 5.5);
  assert.equal(oddsFor({ odds: [line] }).homeMoneyline, -135);
  line.homeTeamOdds.favorite = false; line.awayTeamOdds.favorite = true;
  assert.equal(oddsFor({ odds: [line] }).spread, 1.5);
  assert.equal(oddsFor({}), null);
  assert.equal(oddsFor({ odds: [{ provider: { name: 'X' }, overUnder: 'bad' }] }), null);
});

function event(period = 4, detail = 'Final/OT') {
  return { id: 'ot', season: { year: 2027, type: 2 }, date: '2026-11-14T18:00Z', competitions: [{
    status: { period, type: { name: 'STATUS_FINAL', state: 'post', completed: true, detail } },
    competitors: [{ homeAway: 'home', team: { id: '7' }, score: '4' }, { homeAway: 'away', team: { id: '124292' }, score: '3' }] }] };
}
const parse = e => parseEvent(e, new Set(['7', '124292']), new Date('2026-11-15'), new Date('2026-11-22'));
test('NHL: fin OT/SO conserve le score final et ot', () => {
  for (const e of [event(), event(5, 'Final/SO'), event(3, 'Final/SO'), event(4, 'Final')]) {
    assert.equal(parse(e).game.ot, true); assert.equal(parse(e).game.homeScore, 4);
  }
  assert.equal(parse(event(3, 'Final')).game.ot, undefined);
  const tie = event(); tie.competitions[0].competitors[0].score = '3';
  assert.throws(() => parse(tie), /Invalid final scores/);
  const preseason = event(); preseason.season.type = 1;
  assert.equal(parse(preseason), null);
});

test('NHL: vrais attaquants et defenseurs ESPN, gardiens ignores, TOI decimal', () => {
  const rows = parseRows(fixture, fixture.game);
  assert.equal(rows.length, 36);
  assert.ok(rows.every(r => r.pos !== 'G'));
  assert.deepEqual(rows.find(r => r.id === '4781552'), { id: '4781552', n: 'Matty Beniers', pos: 'C', teamId: '124292', toi: 15.8, goals: 1, assists: 0, points: 1, shots: 2 });
  const store = { players: {} };
  parseBox(fixture, fixture.game, store); parseBox(fixture, fixture.game, store);
  assert.deepEqual(store.players['4781552'].g, [['401891809', '2026-11-14', '124292', '7', 0, 15.8, 1, 0, 1, 2]]);
});
test('NHL: colonnes manquantes refusees', () => {
  const f = copy(); f.boxscore.players[0].statistics[0].keys[4] = 'missing';
  assert.throws(() => parseRows(f, f.game), /Colonnes/);
});
test('NHL: equipe en double refusee', () => {
  const f = copy(); f.boxscore.players[1] = structuredClone(f.boxscore.players[0]);
  assert.throws(() => parseRows(f, f.game), /en double/);
});
test('NHL: stats tronquees rejetees sans mutation du store', () => {
  const f = copy(); f.boxscore.players[1].statistics[0].athletes[0].stats.pop();
  const store = { players: {} };
  assert.throws(() => parseBox(f, f.game, store), /tronquees/);
  assert.deepEqual(store, { players: {} });
});
test('NHL: feuille partielle refusee et joueurs agreges dedupliques', () => {
  const f = copy(); f.boxscore.players[0].statistics[0].athletes = [];
  assert.throws(() => parseRows(f, f.game), /Seulement/);
  const d = copy(); d.boxscore.players[0].statistics.push(structuredClone(d.boxscore.players[0].statistics[0]));
  assert.equal(parseRows(d, d.game).length, 36);
});

test('NHL: temps de glace court conserve, meme arrondi a zero', () => {
  const f = copy(), group = f.boxscore.players[0].statistics[0], stats = group.athletes[0].stats;
  stats[group.keys.indexOf('timeOnIce')] = '0:01';
  for (const k of ['goals', 'assists', 'shotsTotal']) stats[group.keys.indexOf(k)] = '0';
  assert.equal(parseRows(f, f.game).find(r => r.id === '4781552').toi, 0);
});
test('NHL: blessures reelles sans athlete.id et reponse invalide rejetee', () => {
  assert.deepEqual(parseInjuries({ injuries: [{ id: '25', injuries: [{ athlete: { displayName: 'Ryan Poehling', links: [{ href: 'https://www.espn.com/nhl/player/_/id/4233668' }] }, status: 'Injured Reserve' }] }] })['25'][0],
    { id: '4233668', n: 'Ryan Poehling', s: 'Injured Reserve', c: '', d: '' });
  assert.throws(() => parseInjuries({}), /absente/);
});
