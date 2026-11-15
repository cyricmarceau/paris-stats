// NHL dans la page : choix de la ligue, modèle hockey, paris des deux ligues lus avec les bonnes données.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sampleData } from './page-harness.mjs';

// Mêmes id d'équipe que la NBA de test ('1' à '4') : c'est le cas réel chez ESPN.
function nhlSample({ upcomingOdds = null } = {}) {
  const teams = ['1', '2', '3', '4'].map(id => ({ id, abbr: 'H' + id, name: 'Hockey ' + id, logo: null }));
  const games = [];
  let n = 0;
  const add = (homeId, awayId, homeScore, awayScore) =>
    games.push({ id: 'n' + (++n), date: new Date(Date.UTC(2026, 9, 21 + n)).toISOString(), homeId, awayId, homeScore, awayScore });
  add('1', '2', 4, 2); add('3', '4', 2, 3); add('2', '3', 5, 1); add('4', '1', 1, 3); add('1', '3', 3, 2); add('2', '4', 2, 4);
  const upcoming = [{ id: 'nu1', date: new Date(Date.now() + 864e5).toISOString(), homeId: '2', awayId: '1', odds: upcomingOdds }];
  return { generatedAt: new Date().toISOString(), season: '2026-27', source: 'test', league: 'nhl', teams, games, upcoming };
}
const nhlPlayers = { done: ['n1'], players: { 77: { n: 'Joueur Hockey', pos: 'C', t: '1', g: [['n1', '2026-10-22', '1', '2', 1, 18.5, 2, 1, 3, 5]] } } };
const bet = o => ({ id: 'b' + Math.random(), gameId: 'g1', homeId: '1', awayId: '2', market: 'ml', pick: 'home', odds: 2, stake: 10, who: 'Cyric', date: '2026-10-22T00:00:00.000Z', ...o });

test('NBA par défaut ; NHL choisie sur l\'appareil = données et stats hockey', () => {
  const nba = loadPage({ data: sampleData(), nhlData: nhlSample() });
  assert.equal(nba.league(), 'nba');
  assert.ok('pts' in nba.stats());
  const nhl = loadPage({ data: sampleData(), nhlData: nhlSample(), storage: { 'paris-stats-ligue': 'nhl' } });
  assert.equal(nhl.league(), 'nhl');
  assert.deepEqual(Object.keys(nhl.stats()), ['goals', 'assists', 'points', 'shots']);
  assert.ok(nhl.leagueAvg() > 1 && nhl.leagueAvg() < 6, 'moyenne de la ligue en buts');
});

test('NHL demandée mais données absentes : on reste sur la NBA', () => {
  const p = loadPage({ data: sampleData(), storage: { 'paris-stats-ligue': 'nhl' } });
  assert.equal(p.league(), 'nba');
});

test('modèle hockey : écart d\'un but ≈ 66 % de victoire, pas 53 % comme au basket', () => {
  const p = loadPage({ data: sampleData(), nhlData: nhlSample(), storage: { 'paris-stats-ligue': 'nhl' } });
  const pr = p.project(p.teams['1'], p.teams['2']);
  assert.ok(pr.total > 3 && pr.total < 9, 'total en buts : ' + pr.total);
  const ups = p.topCandidates();
  assert.ok(Array.isArray(ups));
  // P(victoire) pour 1 but d'avance avec un écart-type de 2,3
  assert.ok(Math.abs(p.normCdf(1 / 2.3) - 0.668) < 0.01);
});

test('Top paris NHL : puck line et total à partir des cotes DraftKings', () => {
  const p = loadPage({ data: sampleData(), nhlData: nhlSample({ upcomingOdds: { provider: 'DraftKings', homeMoneyline: 124, awayMoneyline: -148, spread: 1.5, total: 6.5 } }), storage: { 'paris-stats-ligue': 'nhl' } });
  const c = p.topCandidates();
  assert.ok(c.every(x => x.g.id === 'nu1'), 'seulement les matchs NHL');
  assert.ok(c.every(x => x.ev > 0));
  // Puck line : vraie cote inconnue (rarement -110), donc jamais dans le Top.
  assert.ok(c.every(x => x.market !== 'spread'));
});

test('anciens paris sans ligue = NBA ; paris NHL lus avec les équipes et matchs NHL, même id d\'équipe', () => {
  const p = loadPage({ data: sampleData(), nhlData: nhlSample(), nhlPlayers });
  const old = bet({ gameId: 'g1' });             // NBA g1 : 1 bat 2, 120-100
  const hockey = bet({ gameId: 'n2', league: 'nhl', homeId: '3', awayId: '4' }); // NHL n2 : 4 bat 3, 2-3
  assert.equal(p.betResult(old), 'W');
  assert.equal(p.betLabel(old), 'T1 gagne');
  assert.equal(p.betResult(hockey), 'L');
  assert.equal(p.betLabel(hockey), 'H3 gagne');
  // Un id de match NHL ne doit jamais être lu comme NBA, ni l'inverse.
  assert.equal(p.betResult(bet({ gameId: 'n1' })), null);
  assert.equal(p.betResult(bet({ gameId: 'g1', league: 'nhl' })), null);
});

test('pari joueur NHL réglé avec nhl-players.js (buts, puck line)', () => {
  const p = loadPage({ data: sampleData(), nhlData: nhlSample(), nhlPlayers });
  const over = bet({ gameId: 'n1', league: 'nhl', market: 'prop', pick: 'over', line: 1.5, stat: 'goals', playerId: '77', playerName: 'Joueur Hockey' });
  assert.equal(p.betResult(over), 'W');
  assert.match(p.betLabel(over), /Over 1\.5 buts$/);
  const pl = bet({ gameId: 'n1', league: 'nhl', market: 'spread', pick: 'away', line: 1.5, homeId: '1', awayId: '2' }); // 4-2 : 2 +1.5 perd
  assert.equal(p.betResult(pl), 'L');
});

test('Nos paris : icône de la ligue sur chaque pari et filtre par ligue', () => {
  const p = loadPage({ data: sampleData(), nhlData: nhlSample(), storage: { 'paris-stats-bets': JSON.stringify([bet({ id: 'a' }), bet({ id: 'b', gameId: 'n1', league: 'nhl' })]) } });
  const html = p.betsHtml();
  assert.match(html, /🏀/);
  assert.match(html, /🏒/);
  assert.match(html, /data-lgf="nhl"/);
});

test('revue Codex 1 : changer de ligue garde les cotes et lignes joueurs saisies pour l\'autre ligue', () => {
  const cotes = JSON.stringify({ 'u1:home': { v: '2.10', t: 1 }, 'nu1:away': { v: '1.80', t: 1 }, 'vieux:home': { v: '3', t: 1 } });
  const lignes = JSON.stringify({ 'u1:9:pts': { l: '20.5' }, 'nu1:77:goals': { l: '0.5' }, 'vieux:1:pts': { l: '3' } });
  for (const ligue of ['nba', 'nhl']) {
    const p = loadPage({ data: sampleData(), nhlData: nhlSample(), storage: { 'paris-stats-ligue': ligue, 'paris-stats-cotes': cotes, 'paris-stats-lignes-joueurs': lignes } });
    assert.deepEqual(Object.keys(JSON.parse(p.localStorage.getItem('paris-stats-cotes'))).sort(), ['nu1:away', 'u1:home'], ligue);
    assert.deepEqual(Object.keys(JSON.parse(p.localStorage.getItem('paris-stats-lignes-joueurs'))).sort(), ['nu1:77:goals', 'u1:9:pts'], ligue);
  }
});

test('revue Codex 3 : la puck line ±1,5 ne déplace pas l\'écart projeté (ce n\'est pas l\'écart attendu du marché)', () => {
  const p = loadPage({ data: sampleData(), nhlData: nhlSample(), storage: { 'paris-stats-ligue': 'nhl' } });
  const pr = p.project(p.teams['2'], p.teams['1']);
  assert.equal(p.withMarket(pr, { spread: -1.5 }).margin, pr.margin);
  // NBA inchangée : l'écart du book reste mélangé.
  const q = loadPage({ data: sampleData() });
  const qr = q.project(q.teams['2'], q.teams['1']);
  assert.notEqual(q.withMarket(qr, { spread: -7 }).margin, qr.margin);
});