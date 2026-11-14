# LOOP.md — amélioration continue (Claude = DEV, Codex = REVIEW)

## État
TOUR_CLAUDE

## Itération
1

## Projet (analyse de la préparation)
- Site statique : `index.html` (CSS + un script en ligne, ~1300 lignes), données générées `data.js`, `players.js`, `h2h.js`, `h2hbox.js`.
- `fetch-data.mjs`, `fetch-extras.mjs` : téléchargent les données ESPN (lancés par `.github/workflows/refresh-data.yml`).
- `server.mjs` : API des paris (Node sans dépendance), stocke `bets.json` sur la branche `paris-data` via l'API GitHub.
- Aucune dépendance, pas de build ni de typecheck (JavaScript sans types). « Lint » = compilation de chaque script.
- Tests : `npm test` (= `node --test "test/*.test.mjs"`), framework intégré `node:test`, rien à installer.
  - `test/page-harness.mjs` exécute le script de `index.html` dans Node avec un faux DOM ; `index.html` expose ses fonctions via `window.__PS_TEST__` (sans effet dans le navigateur).
  - `test/fake-github.mjs` remplace l'API GitHub par un dépôt en mémoire pour lancer `server.mjs` pour de vrai.

## Backlog (priorisé : bugs > sécurité > perf > qualité > UX)
1. **[BUG – moyen] Pari refusé par le serveur = perte silencieuse ou synchro bloquée.** `index.html:748-751` retire de `pendAdd` tous les paris envoyés, même ceux que `validBet` (`server.mjs:64-70`) a rejetés ; `adopt()` (`index.html:722-731`) les supprime ensuite de l'appareil. Si tous sont rejetés, le serveur répond 400 et la page affiche « Serveur injoignable » pour toujours (`index.html:763`), `pendAdd` ne se vide jamais. Déclencheur réaliste : nom de parieur de plus de 40 caractères (aucune limite dans `#bmWho`, `index.html:671`, ni à l'import, `index.html:1286`).
2. **[BUG – faible] Écritures GitHub inutiles.** `server.mjs:53-54` : `change` reçoit une copie (`cur.bets.slice()`), donc `next === cur.bets` n'est jamais vrai ; un doublon renvoyé (réessai après délai dépassé) ou la suppression d'un id inconnu crée quand même un commit sur `paris-data`.
3. **[BUG – faible] JSON invalide → 500 au lieu de 400.** `server.mjs:92` lève une SyntaxError attrapée en 500 (`server.mjs:121-123`).
4. **[SÉCURITÉ – faible] Messages d'erreur internes renvoyés au client.** `server.mjs:123` renvoie `error.message` brut (ex. « Lecture : HTTP 401 » de GitHub).
5. **[PERF – faible] ~620 Ko de données joueurs/face-à-face chargés à chaque visite**, même si on ne quitte pas l'onglet Matchs (`players.js`, `h2h.js`, `h2hbox.js` en `<script>` bloquants).
6. **[QUALITÉ – faible] `fetch-data.mjs` non testable** : `main()` s'exécute à l'import et `oddsFor` / `numeric` ne sont pas exportés (`fetch-data.mjs:28`, `fetch-data.mjs:111`). La lecture des cotes ESPN (sens de l'écart) n'a donc aucun test.
7. **[QUALITÉ – faible] Horaires de mise à jour dupliqués** : `REFRESH_UTC` (`index.html:593`) doit être modifié à la main en même temps que les `cron` du workflow.
8. **[UX – faible] Bandeau « données vieilles »** (`index.html:614`) dit de lancer `node fetch-data.mjs`, inutile sur téléphone (changement visible → voir « À valider »).

## Dernière modif
Itération 0 (préparation) : branche `auto-improve/2026-11-13`, 27 tests ajoutés (`test/`), `package.json` (scripts `test` et `lint`), crochet de test à la fin de `index.html`. Aucune modification de comportement. `npm test` : 27/27 réussis.

## Review
(aucune pour l'instant)

## À valider par Cyric
- `GET /api/bets` est public : n'importe qui avec l'adresse de l'API voit les paris (noms, mises). Le code n'est demandé que pour écrire. Le garder ainsi ?
- Poids du book dans les probabilités (`MARKET_W = 0.7`, `index.html`) choisi au jugé ; à recalibrer quand il y aura assez de matchs joués.
- Texte du bandeau « données vieilles » (backlog 8).
- Refonte visuelle demandée à Codex : faite sur une branche séparée, hors de cette boucle.

## Historique
- Itération 0 : préparation, 27 tests, 0 → 27.
