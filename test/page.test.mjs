// Calculs de la page : cotes, probabilités, verdict, résultats et profit des paris.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sampleData } from './page-harness.mjs';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('la page se charge avec des données minimales', () => {
  const p = loadPage({ data: sampleData() });
  assert.equal(Object.keys(p.teams).length, 4);
  assert.ok(p.leagueAvg() > 90 && p.leagueAvg() < 130);
});

test('cote américaine → décimale', () => {
  const p = loadPage({ data: sampleData() });
  close(p.americanToDecimal(-154), 1 + 100 / 154);
  close(p.americanToDecimal(130), 2.3);
  close(p.americanToDecimal(-110), 1.9091);
  assert.equal(p.americanToDecimal(0), null);
  assert.equal(p.americanToDecimal(null), null);
  assert.equal(p.americanToDecimal(NaN), null);
});

test('loi normale : symétrie et valeurs connues', () => {
  const p = loadPage({ data: sampleData() });
  close(p.normCdf(0), 0.5);
  close(p.normCdf(1), 0.8413);
  close(p.normCdf(-1.96), 0.025);
  for (const z of [-3, -1, 0.3, 2]) close(p.normCdf(z) + p.normCdf(-z), 1);
});

test('projection : avantage du terrain et probabilités qui totalisent 1', () => {
  const p = loadPage({ data: sampleData() });
  const t = p.teams;
  const r = p.project(t['1'], t['1']); // une équipe contre elle-même : seul l'avantage du terrain compte
  close(r.homePts - r.awayPts, 2.5);
  close(r.margin, 2.5);
  const r2 = p.project(t['2'], t['1']);
  close(r2.pHome + r2.pAway, 1);
  assert.ok(r2.pHome < 0.5, 'T1 (meilleure équipe) doit être favorite à l’étranger');
});

test('verdict selon la valeur espérée (marge 10 % par défaut)', () => {
  const p = loadPage({ data: sampleData() });
  assert.match(p.verdict(0.5, 1.9), /Non/);
  assert.match(p.verdict(0.5, 2.1), /Mince/);
  assert.match(p.verdict(0.5, 2.3), /Ça vaut le coup/);
  assert.match(p.verdict(0.5, 2.5), /Suspect/);
  assert.equal(p.verdict(0.5, NaN), '');
  assert.equal(p.verdict(0.5, 1), '');
  assert.equal(p.isHot(0.5, 2.3), true);
  assert.equal(p.isHot(0.5, 2.5), false);
});

test('mélange modèle / book (Washington–Détroit du 12 nov.)', () => {
  const p = loadPage({ data: sampleData() });
  const model = { homePts: 105.5, awayPts: 111.8, pHome: 0.299, pAway: 0.701, margin: -6.3, total: 217.3 };
  const r = p.withMarket(model, { homeMoneyline: 293, awayMoneyline: -369, spread: 9.5, total: 220.5 });
  close(r.pBookHome, 0.2438);
  close(r.pHome, 0.3 * 0.299 + 0.7 * 0.2438);
  close(r.pHome + r.pAway, 1);
  close(r.margin, 0.3 * -6.3 + 0.7 * -9.5);
  close(r.total, 0.3 * 217.3 + 0.7 * 220.5);
  close(r.pModelHome, 0.299);
  const ev = r.pHome * p.americanToDecimal(293) - 1;
  assert.ok(ev < 0.05, `valeur ${ev} : ne doit plus sortir « ça vaut le coup »`);
});

test('sans cote du book, la projection du modèle reste telle quelle', () => {
  const p = loadPage({ data: sampleData() });
  const model = { homePts: 110, awayPts: 100, pHome: 0.8, pAway: 0.2, margin: 10, total: 210 };
  const r = p.withMarket(model, {});
  assert.equal(r.pHome, 0.8);
  assert.equal(r.margin, 10);
  assert.equal(r.total, 210);
  assert.equal(r.pBookHome, null);
});

// Match g1 : T1 (domicile) 120, T2 100.
const bet = o => ({ id: 'b', gameId: 'g1', homeId: '1', awayId: '2', odds: 2, stake: 10, who: 'X', date: '2026-10-22', ...o });

test('résultat d’un pari : gagnant du match', () => {
  const p = loadPage({ data: sampleData() });
  assert.equal(p.betResult(bet({ market: 'ml', pick: 'home' })), 'W');
  assert.equal(p.betResult(bet({ market: 'ml', pick: 'away' })), 'L');
  assert.equal(p.betResult(bet({ market: 'ml', pick: 'home', gameId: 'inconnu' })), null);
});

test('résultat d’un pari : écart (ligne du point de vue du domicile)', () => {
  const p = loadPage({ data: sampleData() });
  assert.equal(p.betResult(bet({ market: 'spread', pick: 'home', line: -19.5 })), 'W'); // gagne par 20
  assert.equal(p.betResult(bet({ market: 'spread', pick: 'home', line: -20.5 })), 'L');
  assert.equal(p.betResult(bet({ market: 'spread', pick: 'home', line: -20 })), 'P');
  assert.equal(p.betResult(bet({ market: 'spread', pick: 'away', line: -20.5 })), 'W'); // T2 +20.5
  assert.equal(p.betResult(bet({ market: 'spread', pick: 'away', line: -19.5 })), 'L');
});

test('résultat d’un pari : total', () => {
  const p = loadPage({ data: sampleData() });
  assert.equal(p.betResult(bet({ market: 'total', pick: 'over', line: 219.5 })), 'W');
  assert.equal(p.betResult(bet({ market: 'total', pick: 'under', line: 219.5 })), 'L');
  assert.equal(p.betResult(bet({ market: 'total', pick: 'over', line: 220 })), 'P');
});

test('résultat d’un pari joueur (prop)', () => {
  const players = { done: ['g1'], players: { p9: { n: 'Joueur', pos: 'G', t: '1', g: [['g1', '2026-10-22', '1', '2', 1, 30, 25, 5, 7, 3]] } }, injuries: {} };
  const p = loadPage({ data: sampleData(), players });
  const prop = o => bet({ market: 'prop', playerId: 'p9', stat: 'pts', ...o });
  assert.equal(p.betResult(prop({ pick: 'over', line: 24.5 })), 'W');
  assert.equal(p.betResult(prop({ pick: 'under', line: 24.5 })), 'L');
  assert.equal(p.betResult(prop({ pick: 'over', line: 25 })), 'P');
  assert.equal(p.betResult(prop({ pick: 'over', line: 4.5, playerId: 'absent' })), 'P'); // n'a pas joué
});

test('profit et CLV', () => {
  const p = loadPage({ data: sampleData() });
  const b = bet({ market: 'ml', pick: 'home', odds: 2.5, stake: 10 });
  assert.equal(p.betProfit(b, 'W'), 15);
  assert.equal(p.betProfit(b, 'L'), -10);
  assert.equal(p.betProfit(b, 'P'), 0);
  assert.equal(p.betProfit(b, null), null);
  close(p.betClv({ ...b, closeOdds: 2.0 }).v, 0.25);
  assert.equal(p.betClv(b), null);
  // Écart pris à -3.5 (domicile), fermé à -5.5 : 2 points de mieux.
  assert.equal(p.betClv(bet({ market: 'spread', pick: 'home', line: -3.5, closeLine: -5.5 })).v, 2);
  assert.equal(p.betClv(bet({ market: 'spread', pick: 'away', line: -3.5, closeLine: -5.5 })).v, -2);
  assert.equal(p.betClv(bet({ market: 'total', pick: 'over', line: 220.5, closeLine: 222.5 })).v, 2);
});

test('libellé d’un pari', () => {
  const p = loadPage({ data: sampleData() });
  assert.equal(p.betLabel(bet({ market: 'ml', pick: 'away' })), 'T2 gagne');
  assert.equal(p.betLabel(bet({ market: 'spread', pick: 'away', line: -3.5 })), 'T2 +3.5');
  assert.equal(p.betLabel(bet({ market: 'total', pick: 'under', line: 221.5 })), 'Under 221.5');
});

test('un identifiant d’équipe hérité ne doit pas empêcher le chargement des paris', () => {
  assert.doesNotThrow(() => loadPage({data:sampleData(),storage:{
    'paris-stats-bets':JSON.stringify([bet({market:'ml',pick:'home',homeId:'constructor'})])
  }}));
});
