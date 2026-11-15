// Bouton « 👤 nom » en haut de la page : le parieur choisit son nom une fois, gardé sur l'appareil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sampleData } from './page-harness.mjs';

test('sans nom enregistré, le bouton invite à choisir un nom', () => {
  const p = loadPage({ data: sampleData() });
  assert.equal(p.document.getElementById('me').textContent, '👤 Choisir mon nom');
});

test('le nom déjà enregistré s’affiche en haut', () => {
  const p = loadPage({ data: sampleData(), storage: { 'paris-stats-who': 'Will' } });
  assert.equal(p.document.getElementById('me').textContent, '👤 Will');
});

test('choisir un nom le garde sur l’appareil et l’affiche', () => {
  const p = loadPage({ data: sampleData(), prompt: () => '  Bob  ' });
  p.document.getElementById('me').dispatchEvent({ type: 'click' });
  assert.equal(p.localStorage.getItem('paris-stats-who'), 'Bob');
  assert.equal(p.document.getElementById('me').textContent, '👤 Bob');
});

test('annuler ou laisser vide ne change pas le nom', () => {
  for (const answer of [null, '   ']) {
    const p = loadPage({ data: sampleData(), storage: { 'paris-stats-who': 'Will' }, prompt: () => answer });
    p.document.getElementById('me').dispatchEvent({ type: 'click' });
    assert.equal(p.localStorage.getItem('paris-stats-who'), 'Will');
    assert.equal(p.document.getElementById('me').textContent, '👤 Will');
  }
});
