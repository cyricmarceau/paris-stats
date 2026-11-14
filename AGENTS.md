# paris-stats — consignes pour les agents (Claude, Codex)

Site de stats NBA et de suivi de paris pour Cyric et Will. Répondre en français.

- Site : https://paris-stats.onrender.com (Render, site statique, redéployé à chaque push sur `main`)
- API des paris : https://paris-stats-api.onrender.com (Render, `server.mjs`, s'endort après 15 min)
- Dépôt : https://github.com/cyricmarceau/paris-stats

## Stack
- `index.html` : toute la page, CSS et un seul script en ligne (IIFE). Aucun framework, aucun build.
- Données générées, ne pas modifier à la main : `data.js` (`fetch-data.mjs`), `players.js`, `h2h.js`, `h2hbox.js` (`fetch-extras.mjs`). Le workflow `.github/workflows/refresh-data.yml` les rafraîchit 4 fois par jour et pousse sur `main`.
- `server.mjs` : API des paris, Node sans dépendance ; écrit `bets.json` sur la branche `paris-data` via l'API GitHub.
- Aucune dépendance npm. Node 22+.

## Commandes
- Tests : `npm test` (framework intégré `node:test`, rien à installer).
- Compilation de tous les scripts : `npm run lint`.
- Voir la page : ouvrir `index.html` dans un navigateur (fonctionne en `file://`).
- Rafraîchir les données en local : `node fetch-data.mjs` puis `node fetch-extras.mjs`.

## Règles
- Ne jamais travailler sur `main` : une branche par changement, puis une PR. Cyric a demandé que les PR prêtes (sans conflit, tests verts, testées) soient fusionnées sans redemander, puis que le déploiement soit vérifié sur le site.
- Lancer `npm test` avant chaque commit ; ajouter un test pour chaque bug corrigé. Ne jamais supprimer un test pour le faire passer.
- Le script de `index.html` dépend de nombreux `id`, classes et attributs `data-` : ne pas les renommer. Une refonte visuelle se fait dans le bloc `<style>`.
- Le crochet `window.__PS_TEST__` à la fin du script sert aux tests (`test/page-harness.mjs`) : le garder à jour si on ajoute une fonction à tester.
- Ne pas toucher aux secrets ni à la config de déploiement (`render.yaml`, variables Render `GITHUB_TOKEN`, `BETS_CODE`) sans demander.
- Un bug : partir de l'erreur exacte et chercher la cause, pas tout refaire.
- La boucle d'amélioration Claude (dev) / Codex (revue) suit `LOOP.md` quand il existe.

## Modèle de paris (à connaître avant de toucher aux calculs)
- Projection : moyennes pour/contre ramenées vers la moyenne de la ligue (`SHRINK_GAMES`), avantage du terrain 2,5 pts, écart-type 12 pts.
- Quand le book donne une cote, probabilité, écart et total retenus = 30 % modèle + 70 % book sans marge (`MARKET_W`) : le modèle seul surestime les outsiders.
- Valeur espérée = probabilité × cote décimale − 1. « Ça vaut le coup » au-delà de la marge de sécurité (10 % par défaut), « Suspect » au-delà de marge + 10 %.
