// Lecture des réponses ESPN dans fetch-extras.mjs (feuilles de match, blessures, calendriers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRows, parseBox, parseInjuries, parseSchedule } from '../fetch-extras.mjs';

const KEYS = ['minutes', 'points', 'rebounds', 'assists', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'];
const athlete = (id, stats, extra = {}) => ({ athlete: { id, displayName: 'P' + id, position: { abbreviation: 'G' } }, stats, ...extra });
const block = (teamId, start) => ({
  team: { id: teamId },
  statistics: [{ keys: KEYS, athletes: [0, 1, 2, 3, 4, 5].map(i => athlete(String(start + i), ['30', '20', '5', '4', '3-7'])) }]
});
const game = { id: 'g1', date: '2026-11-01T00:00:00Z', homeId: '1', awayId: '2' };

test('backlog 22 : deux blocs de la meme equipe ne forment pas une feuille complete', {todo:'backlog 22'}, () => {
  const s={boxscore:{players:[block('1',100),block('1',100)]}};
  const store={players:{}};
  assert.throws(()=>parseBox(s,game,store));
  assert.deepEqual(store.players,{});
});

test('feuille de match : joueurs lus, absents et 0 minute ignorés', () => {
  const s = { boxscore: { players: [block('1', 100), block('2', 200)] } };
  s.boxscore.players[0].statistics[0].athletes.push(athlete('999', [], { didNotPlay: true }), athlete('998', ['0', '0', '0', '0', '0-0']));
  const rows = parseRows(s, game);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows[0], { id: '100', n: 'P100', pos: 'G', teamId: '1', min: 30, pts: 20, reb: 5, ast: 4, tpm: 3 });
});

test('feuille de match incomplète ou inattendue : erreur', () => {
  assert.throws(() => parseRows({ boxscore: { players: [block('1', 100)] } }, game), /incomplète/);
  assert.throws(() => parseRows({ boxscore: { players: [block('1', 100), block('7', 200)] } }, game), /inattendue/);
  const bad = block('2', 200); bad.statistics[0].keys = ['minutes'];
  assert.throws(() => parseRows({ boxscore: { players: [block('1', 100), bad] } }, game), /Colonnes/);
});

test('parseBox : une ligne par joueur et par match, sans doublon', () => {
  const s = { boxscore: { players: [block('1', 100), block('2', 200)] } };
  const store = { players: {} };
  parseBox(s, game, store);
  parseBox(s, game, store);
  assert.equal(store.players['100'].g.length, 1);
  assert.deepEqual(store.players['200'].g[0], ['g1', '2026-11-01', '2', '1', 0, 30, 20, 5, 4, 3]);
});

test('blessures : identifiant tiré du lien du joueur', () => {
  const r = parseInjuries({ injuries: [{ id: 5, injuries: [{ athlete: { displayName: 'A', links: [{ href: 'https://x/nba/player/_/id/4278073/a' }] }, status: 'Out', shortComment: 'genou' }] }] });
  assert.deepEqual(r['5'][0], { id: '4278073', n: 'A', s: 'Out', c: 'genou', d: '' });
});

test('calendrier : seulement les matchs de saison régulière terminés', () => {
  const ev = (id, name, type) => ({ id, date: '2025-01-02T00:00Z', seasonType: { type }, competitions: [{ status: { type: { name } },
    competitors: [{ homeAway: 'home', team: { id: 1 }, score: { value: 110 } }, { homeAway: 'away', team: { id: 2 }, score: '100' }] }] });
  const into = new Map();
  parseSchedule({ events: [ev('a', 'STATUS_FINAL', 2), ev('b', 'STATUS_SCHEDULED', 2), ev('c', 'STATUS_FINAL', 3)] }, into);
  assert.deepEqual([...into.values()], [['a', '2025-01-02', '1', '2', 110, 100]]);
});

test('backlog 19 : un joueur avec points et minutes arrondies a zero conserve ses stats', { todo: 'backlog 19' }, () => {
  const s = { boxscore: { players: [block('1', 100), block('2', 200)] } };
  s.boxscore.players[0].statistics[0].athletes.push(athlete('999', ['0', '2', '0', '0', '0-0']));
  const store = { players: {} };
  parseBox(s, game, store);
  assert.ok(store.players['999'], 'joueur ayant marque 2 points efface a cause de ses minutes arrondies');
  assert.equal(store.players['999'].g[0][6], 2);
});

test('backlog 20 : stats joueur tronquées ne doivent pas devenir des zéros définitifs', {todo:'backlog 20'}, () => {
  const s={boxscore:{players:[block('1',100),block('2',200)]}};
  s.boxscore.players[0].statistics[0].athletes[0].stats=['30'];
  const store={players:{}};
  // Rejeter la feuille avant de la marquer done, afin de réessayer au prochain passage.
  assert.throws(()=>parseBox(s,game,store));
  assert.deepEqual(store.players,{});
});
