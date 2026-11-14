# LOOP.md — amélioration continue (Claude = DEV, Codex = REVIEW)

## État
TOUR_CLAUDE

## Itération
2

## Projet (analyse de la préparation)
- Site statique : `index.html` (CSS + un script en ligne, ~1450 lignes), données générées `data.js`, `players.js`, `h2h.js`, `h2hbox.js`.
- `fetch-data.mjs`, `fetch-extras.mjs` : téléchargent les données ESPN (lancés par `.github/workflows/refresh-data.yml`).
- `server.mjs` : API des paris (Node sans dépendance), stocke `bets.json` sur la branche `paris-data` via l'API GitHub.
- Aucune dépendance, pas de build ni de typecheck (JavaScript sans types). « Lint » = `npm run lint` (compilation de chaque script).
- Tests : `npm test` (= `node --test "test/*.test.mjs"`), framework intégré `node:test`, rien à installer.
  - `test/page-harness.mjs` exécute le script de `index.html` dans Node avec un faux DOM ; `index.html` expose ses fonctions via `window.__PS_TEST__` (sans effet dans le navigateur).
  - `test/fake-github.mjs` remplace l'API GitHub par un dépôt en mémoire pour lancer `server.mjs` pour de vrai.
- Consignes du projet : `AGENTS.md` (et `CLAUDE.md` qui l'importe).

## Backlog (priorisé : bugs > sécurité > perf > qualité > UX)
12. **[BUG – moyen] Perte locale pour un id hérité de Object.prototype.** `index.html:860-861` utilise `{}` comme ensemble : avec `id: 'constructor'` (autorisé au POST et à l'import), `ids[id]` est déjà vrai même si la liste serveur est vide. `adopt()` efface le pari local avant l'envoi, puis POST reçoit un lot vide (400) et l'id reste en attente. Le même motif existe dans la migration (`index.html:871-872`) et la nouvelle table `kept` (`index.html:884-885`). Reproduit avec le harness, test TODO `backlog 12`. Traiter les id comme clés propres (Set ou objet sans prototype) ; motif préexistant hors diff, pas une pollution globale du prototype démontrée.
1. **[BUG – moyen] Pari refusé : correction incomplète à l'itération 1.** La perte locale est corrigée, mais `index.html:893-907` annonce « Paris enregistrés sur le serveur » après un POST partiellement accepté alors que `pendAdd` contient encore le refus. Un POST 400 court-circuite aussi tous les DELETE indépendants (`index.html:881-892`) à chaque réessai, jusqu'au retrait du pari invalide. Deux tests TODO `backlog 1` dans `test/sync.test.mjs`. Afficher le refus partiel et permettre aux suppressions indépendantes d'aboutir.
10. **[BUG – moyen] Doublons dans un même POST comptés deux fois.** `server.mjs:107-109` construit `have` depuis les paris existants sans y ajouter les id acceptés du lot : `{ bets: [b, b] }` sur serveur vide écrit deux paris identiques, repris par `adopt()` et comptés deux fois dans les statistiques. Reproduit contre le vrai serveur avec GitHub simulé, test TODO `backlog 10` dans `test/server.test.mjs`. Les numéros du backlog restent stables ; l'ordre ici indique la priorité.
11. **[BUG – moyen] Identifiants acceptés mais impossibles à supprimer.** `server.mjs:65` accepte toute chaîne de longueur ≤ 40, tandis que `server.mjs:114` exige `[\w-]{1,40}` dans l'URL brute. Un pari importé avec `id: 'import:1'` est accepté (200), puis DELETE `/api/bets/import%3A1` renvoie 404 ; il reste sur le serveur et bloque les suppressions suivantes dans `sync()`. Test TODO `backlog 11` dans `test/server.test.mjs`.
2. **[BUG – faible] Écritures GitHub inutiles.** `server.mjs:53-54` : `change` reçoit une copie (`cur.bets.slice()`), donc `next === cur.bets` n'est jamais vrai ; un doublon renvoyé (réessai après délai dépassé) ou la suppression d'un id inconnu crée quand même un commit sur `paris-data`.
3. **[BUG – faible] JSON invalide → 500 au lieu de 400.** `server.mjs:92` lève une SyntaxError attrapée en 500 (`server.mjs:121-123`).
4. **[SÉCURITÉ – faible] Messages d'erreur internes renvoyés au client.** `server.mjs:123` renvoie `error.message` brut (ex. « Lecture : HTTP 401 » de GitHub).
5. **[PERF – faible] ~620 Ko de données joueurs/face-à-face chargés à chaque visite**, même si on ne quitte pas l'onglet Matchs (`players.js`, `h2h.js`, `h2hbox.js` en `<script>` bloquants).
6. **[QUALITÉ – faible] `fetch-data.mjs` non testable** : `main()` s'exécute à l'import et `oddsFor` / `numeric` ne sont pas exportés (`fetch-data.mjs:28`, `fetch-data.mjs:111`). La lecture des cotes ESPN (sens de l'écart) n'a donc aucun test.
7. **[QUALITÉ – faible] Horaires de mise à jour dupliqués** : `REFRESH_UTC` dans `index.html` doit être modifié à la main en même temps que les `cron` du workflow.
8. **[UX – faible] Bandeau « données vieilles »** dans `index.html` dit de lancer `node fetch-data.mjs`, inutile sur téléphone (changement visible → voir « À valider »).
9. **[UX – faible] Le nom du parieur n'est pas limité à 40 caractères à la saisie** (`#bmWho`) ni à l'import, alors que le serveur refuse au-delà : depuis l'itération 1 le pari n'est plus perdu, mais il reste en attente et refusé à chaque synchro.

## Dernière modif
Itération 1 — backlog 1 (pari refusé par le serveur), commit `b0b9fca`.
- Quoi : après un envoi, `sync()` ne retire de `pendAdd` que les paris présents dans la réponse du serveur ; un pari refusé reste sur l'appareil et en attente. Un refus total (HTTP 400) affiche « Le serveur a refusé un pari (…) » au lieu de « Serveur injoignable ».
- Pourquoi : un pari rejeté par `validBet` (`server.mjs:64-70`, ex. nom de plus de 40 caractères) était retiré de l'attente puis effacé de l'appareil par `adopt()` sans message ; si tous étaient rejetés, la page affichait une fausse panne.
- Fichiers : `index.html` (`sync()`), `test/sync.test.mjs` (2 tests, échouaient avant la correction).
- Tests : `npm test` 29/29.
- Limite connue : backlog 9.

## Review
**À CORRIGER — revue de l'itération 1 par Codex.**

- Contrôle des consignes : `AGENTS.md` et tout `LOOP.md` lus, ainsi que `git show HEAD~1` (`b0b9fca`) et `git show HEAD` (`78cf346`). Skills disponibles examinés : aucun skill spécialisé n'aide cette revue Node/HTML ; aucun SKILL.md de projet trouvé. Aucun code source ni configuration modifié.
- Preuve du correctif : les deux tests originaux de `test/sync.test.mjs` échouent sur `b0b9fca^:index.html` dans une copie temporaire du harness (0/2, exit 1), puis passent sur le code actuel. Conservation du refus par `adopt()` confirmée (`index.html:853-862,884-885`). Amélioration mesurable : plus de perte locale sur refus partiel et message explicite sur 400.
- À corriger avant de clore le backlog 1 : succès trompeur après acceptation partielle (`index.html:893-907`) et DELETE bloqués après POST 400 (`index.html:881-892`). Le 400 conserve les paris en attente indéfiniment, sans réparation automatique ; retirer le pari invalide débloque la file. La limite de saisie/import reste au backlog 9, mais ne couvre pas les autres motifs de refus (cote, mise, id).
- Cas contrôlés : un pari déjà sur le serveur sort de l'attente sans duplication ; migration avec pari existant et refus local conserve ce dernier ; DELETE seul retire le pari sans résurrection par `adopt()`. Trois tests verts ajoutés. Les doublons déjà renvoyés par le serveur restent dupliqués côté page (`index.html:855-860`) : le correctif ne les crée pas ni ne les résout ; la création de doublons dans un lot est désormais au backlog 10.
- Sécurité : le correctif ne change pas l'authentification ; `X-Code` reste vérifié avant POST/DELETE (`server.mjs:102`), code comparé avec `timingSafeEqual` (`server.mjs:73-77`), données de paris et messages échappés dans les sorties HTML (`index.html:908-911,1005-1015`). Le risque des clés héritées est reproduit et ajouté au backlog 12. Aucun test navigateur ni audit de sécurité exhaustif effectué ; GET public reste le choix validé par Cyric.
- Nouveaux problèmes vérifiés hors correctif : backlog 12 (perte locale avec id constructor), 10 (doublons intra-lot, 2 au lieu de 1) et 11 (DELETE 404 après POST 200). Les cinq tests montrant des problèmes réels sont conservés avec `{ todo: 'backlog N' }`, aucun test supprimé.
- Vérifications exécutées : `npm run lint` 4/4 ; `npm test` initial 29/29, puis 37 tests : 32 réussis, 5 TODO en échec attendu, 0 échec bloquant (exit 0). Aucun build ni typecheck défini. Tests API exécutés localement avec faux GitHub, aucun appel de production nécessaire.
- Arrêt : aucune condition atteinte (itération 1 revue, backlog non vide, amélioration mesurable). Passage à l'itération 2, état TOUR_CLAUDE. Règles d'arrêt fournies dans la consigne utilisateur : pas de section de règles supplémentaire dans ce LOOP.md.

## À valider par Cyric
- ~~`GET /api/bets` public~~ : Cyric a répondu de le garder ainsi (13 nov.).
- Poids du book dans les probabilités (`MARKET_W = 0.7`, `index.html`) choisi au jugé ; à recalibrer quand il y aura assez de matchs joués.
- Texte du bandeau « données vieilles » (backlog 8).
- Refonte visuelle par Codex : fusionnée (PR #16), hors de cette boucle. Pas encore vérifiée sur un vrai iPhone.

## Historique
- Itération 0 : préparation, 0 → 27 tests.
- Itération 1 : pari refusé par le serveur conservé sur l'appareil, message clair ; 27 → 29 tests.
- Revue 1 (Codex) : À CORRIGER ; preuve ancien code 0/2, actuel 32 réussis + 5 TODO ; backlog 1 rouvert, nouveaux 10, 11 et 12 ; itération 2, TOUR_CLAUDE.
