# LOOP.md — amélioration continue (Claude = DEV, Codex = REVIEW)

## État
TOUR_CLAUDE

## Itération
4

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
15. **[BUG – élevé] Un identifiant joueur hérité bloque encore le rendu.** `index.html:933-934` : prop sur un match terminé dans PL.done avec `playerId: 'constructor'` → pl.g.filter lève TypeError au chargement, avant la synchro. POST 200 reproduit (`server.mjs:64-71`) ; passe aussi le filtre d’import (`index.html:1428`). Deux nouveaux TODO backlog 15 (chargement local et API réelle). Valider les champs prop et protéger PL.players par une vérification de clé propre, y compris pour les paris déjà enregistrés. Distinct du backlog 14 (joueur, pas équipe). Priorité suivante.
14. ~~**[BUG – élevé] Identifiant d’équipe hérité qui bloque la page.**~~ Confirmé corrigé à l’itération 3 : abbr ne lit que les clés propres (`index.html:575`), validation numérique des équipes (`server.mjs:65-67`). Les deux tests échouent sur eaf9940^ et passent sur HEAD ; compatibilité détaillée dans la revue 3.
12. **[BUG – moyen] Perte locale pour un id hérité de Object.prototype.** `index.html:860-861` utilise `{}` comme ensemble : avec `id: 'constructor'` (autorisé au POST et à l'import), `ids[id]` est déjà vrai même si la liste serveur est vide. `adopt()` efface le pari local avant l'envoi, puis POST reçoit un lot vide (400) et l'id reste en attente. Le même motif existe dans la migration (`index.html:871-872`) et la nouvelle table `kept` (`index.html:884-885`). Reproduit avec le harness, test TODO `backlog 12`. Traiter les id comme clés propres (Set ou objet sans prototype) ; motif préexistant hors diff, pas une pollution globale du prototype démontrée.
16. **[BUG – moyen] Un match inexistant est compté comme réglé.** `index.html:938-951` lit gameById sans clé propre : `gameId: 'constructor', market: 'ml', pick: 'away'` obtient W (faux profit de 10 $ avec mise 10/cote 2). Les scores undefined produisent NaN ; par lecture, spread/total tombent sur P. L’API accepte toute chaîne gameId (`server.mjs:66`), l’import aussi (`index.html:1428`). Nouveau TODO backlog 16 : résultat attendu null, réel W au premier cas ; les variantes suivantes ne sont pas exécutées après cette assertion. Ne régler que les matchs réellement présents ; contrôler aussi l’affichage `index.html:1005`.
1. ~~**[BUG – moyen] Pari refusé : perte locale, succès trompeur et suppressions bloquées.**~~ Confirmé terminé à l’itération 2 : refus conservé et signalé, DELETE indépendants envoyés malgré POST 400. Les deux anciens TODO passent et échouent sur `c806e4c^`. Cas concurrent préexistant suivi séparément au backlog 13.
10. **[BUG – moyen] Doublons dans un même POST comptés deux fois.** `server.mjs:107-109` construit `have` depuis les paris existants sans y ajouter les id acceptés du lot : `{ bets: [b, b] }` sur serveur vide écrit deux paris identiques, repris par `adopt()` et comptés deux fois dans les statistiques. Reproduit contre le vrai serveur avec GitHub simulé, test TODO `backlog 10` dans `test/server.test.mjs`. Les numéros du backlog restent stables ; l'ordre ici indique la priorité.
11. **[BUG – moyen] Identifiants acceptés mais impossibles à supprimer.** `server.mjs:65` accepte toute chaîne de longueur ≤ 40, tandis que `server.mjs:114` exige `[\w-]{1,40}` dans l'URL brute. Un pari importé avec `id: 'import:1'` est accepté (200), puis DELETE `/api/bets/import%3A1` renvoie 404 ; il reste sur le serveur et bloque les suppressions suivantes dans `sync()`. Test TODO `backlog 11` dans `test/server.test.mjs`.
13. **[BUG – moyen] Ajout pendant une synchro : succès sans envoi.** `index.html:867,880,900-902,1349` : pendant que le POST du premier pari attend, le formulaire ajoute un second et appelle sync(), qui retourne immédiatement. Le second reste local dans bets/pendAdd, mais hors du lot toSend. À la réponse, aucune relance et syncHtml annonce « Paris enregistrés sur le serveur » (`index.html:916`). Reproduit avec POST différé, test TODO `backlog 13`. Préexistant au correctif ; traiter les changements arrivés en cours de route ou signaler leur attente. Contrôler aussi suppression/import pendant la synchro.
2. **[BUG – faible] Écritures GitHub inutiles.** `server.mjs:53-54` : `change` reçoit une copie (`cur.bets.slice()`), donc `next === cur.bets` n'est jamais vrai ; un doublon renvoyé (réessai après délai dépassé) ou la suppression d'un id inconnu crée quand même un commit sur `paris-data`.
3. **[BUG – faible] JSON invalide → 500 au lieu de 400.** `server.mjs:92` lève une SyntaxError attrapée en 500 (`server.mjs:121-123`).
4. **[SÉCURITÉ – faible] Messages d'erreur internes renvoyés au client.** `server.mjs:123` renvoie `error.message` brut (ex. « Lecture : HTTP 401 » de GitHub).
5. **[PERF – faible] ~620 Ko de données joueurs/face-à-face chargés à chaque visite**, même si on ne quitte pas l'onglet Matchs (`players.js`, `h2h.js`, `h2hbox.js` en `<script>` bloquants).
6. **[QUALITÉ – faible] `fetch-data.mjs` non testable** : `main()` s'exécute à l'import et `oddsFor` / `numeric` ne sont pas exportés (`fetch-data.mjs:28`, `fetch-data.mjs:111`). La lecture des cotes ESPN (sens de l'écart) n'a donc aucun test.
7. **[QUALITÉ – faible] Horaires de mise à jour dupliqués** : `REFRESH_UTC` dans `index.html` doit être modifié à la main en même temps que les `cron` du workflow.
8. **[UX – faible] Bandeau « données vieilles »** dans `index.html` dit de lancer `node fetch-data.mjs`, inutile sur téléphone (changement visible → voir « À valider »).
9. **[UX – faible] Le nom du parieur n'est pas limité à 40 caractères à la saisie** (`#bmWho`) ni à l'import, alors que le serveur refuse au-delà : depuis l'itération 1 le pari n'est plus perdu, mais il reste en attente et refusé à chaque synchro.

## Dernière modif
Itération 3 — backlog 14 (identifiant d'équipe hérité qui fait planter la page). La revue 2 n'avait pas de point à corriger sur l'itération 2 (backlog 1 accepté).
- Quoi : `abbr()` (`index.html`) vérifie `hasOwnProperty` au lieu d'un accès direct à `teams[id]` ; `validBet` (`server.mjs`) exige `homeId` et `awayId` numériques (identifiants ESPN), donc `homeId: "constructor"` est refusé (400).
- Pourquoi : un pari avec `homeId: "constructor"` (accepté par l'API ou par l'import) levait une TypeError dans `renderBets()` et bloquait tout le chargement de la page, y compris sur les autres appareils après synchro.
- Fichiers : `index.html` (`abbr()`), `server.mjs` (`validBet`), `test/page.test.mjs` et `test/server.test.mjs` (retrait du marqueur `todo: 'backlog 14'` sur les 2 tests de Codex). Fixture `validBet` de `test/server.test.mjs` complétée avec `homeId: '27', awayId: '8'`, comme les vrais paris envoyés par la page (sinon le serveur, désormais plus strict, refusait la fixture).
- Tests : `npm run lint` 4/4 ; `npm test` 43 tests : 39 réussis, 0 échec, 4 TODO (backlogs 10, 11, 12, 13). Sans la correction (stash de `index.html` et `server.mjs`), les 2 tests du backlog 14 échouent.
- Limite connue : le serveur ne revalide pas les paris déjà dans `bets.json` ; l'import de la page n'applique pas encore la même règle sur les id d'équipe (le rendu ne plante plus, mais l'envoi sera refusé).

## Review

**À CORRIGER — revue 3 par Codex ; backlog 14 accepté, nouveaux 15/16 à traiter.**

- AGENTS.md, LOOP.md et git show HEAD (`eaf9940`) lus. Skills disponibles examinés : aucun skill spécialisé pertinent pour cette revue Node/HTML ; aucun SKILL.md de projet trouvé par rg. Branche conservée, seuls LOOP.md et test/ modifiés ; aucun push.
- Preuve indépendante : copies temporaires sous test/ du parent eaf9940^ (index.html et server.mjs), tests actuels, harness et faux GitHub. `node --test --test-name-pattern="chargement des paris|dangereux" …` : parent 0/2, exit 1 (TypeError abbr ; POST 200 au lieu de 400), HEAD 2/2, exit 0. Copies supprimées ; aucun remplacement de source du dépôt. Une première sélection avec accent ne sélectionnait aucun test ; seules ces dernières exécutions constituent la preuve.
- Correctif `index.html:575` robuste pour les équipes héritées déjà présentes localement, importées ou reçues du serveur. Validation `server.mjs:65-67` : nouveau test vert sur homeId ET awayId avec constructor, __proto__, toString et hasOwnProperty (aucune écriture GitHub).
- Fixture légitime : homeId/awayId correspondent au formulaire (`index.html:1214,1342`). Aucun test supprimé ni assertion affaiblie ; les tests négatifs isolent encore leur champ invalide au lieu d’échouer accidentellement sur la fixture. Nouveau test API vert : ml, spread, total, prop avec équipes numériques → 200 et présence dans la réponse.
- Historique : `git log --reverse -S 'homeId:' -- index.html` et `git show 527e57e:index.html` contrôlés. Dès le premier suivi des paris (527e57e, 11 nov. 2026), draft inclut les équipes et Object.assign les copie dans le pari ; 15e4eab les conserve explicitement. Pas de version du formulaire de paris sans homeId trouvée. ESPN converti en chaînes (`fetch-data.mjs:81-83`). Pas de régression démontrée pour les paris normalement créés, y compris déjà en attente sur téléphone.
- Import : `index.html:1428` accepte encore des objets sans homeId/awayId, des nombres ou des chaînes non numériques ; le POST les refuse désormais. Ils restent locaux/en attente avec message générique (`index.html:906`), sans perte grâce au backlog 1. Les exports des formulaires historiques contiennent ces champs ; les imports externes n’ont pas cette garantie. Limite confirmée par lecture des filtres, pas par test d’import navigateur : envisager validation/enrichissement cohérent à l’import. GET/DELETE ne revalident pas les anciens paris du serveur.
- Autres lookups : abbr protège les équipes des paris ; les autres teams[…] viennent des données NBA ou des sélections, pas directement de ces champs. upcomingById[b.gameId] (`index.html:823-824`) sort si odds absent sur une propriété héritée : pas de crash trouvé là. gameById règle un match inexistant (nouveau 16). PL.players[b.playerId] bloque le rendu (nouveau 15, deux TODO reproduits). STATS[b.stat] (`index.html:928,933,1428`) reste sans clé propre : une chaîne héritée passe l’import et peut donner un libellé undefined ; aucune exception prouvée pour une simple chaîne stat héritée. Validation prop serveur insuffisante, à examiner avec 15. Pas d’audit exhaustif ni de navigateur/production consulté.
- Checks : `npm run lint` 4/4 ; `npm test` initial 43 = 39 réussis + 4 TODO ; final 48 = 41 réussis + 7 TODO en échec attendu, 0 échec bloquant, exit 0. Cinq tests ajoutés, aucun supprimé ; trois nouveaux TODO (15 × 2, 16 × 1). Aucun build ni typecheck.
- Aucun arrêt : trois itérations, backlog non vide, amélioration mesurable (deux tests 14 désormais verts). Itération 4, TOUR_CLAUDE. Priorité 15 puis défauts moyens dans l’ordre du backlog.

Revues précédentes condensées :

- Revue 1 : À CORRIGER ; succès trompeur/refus partiel du backlog 1, nouveaux 10/11/12 ; 32 réussis + 5 TODO.
- Revue 2 : À CORRIGER ; backlog 1 confirmé (ancien 0/2, actuel 2/2), nouveaux 14/13 ; 37 réussis + 6 TODO. Refus conservés et DELETE indépendants vérifiés ; concurrence restante suivie en 13.

## À valider par Cyric
- ~~`GET /api/bets` public~~ : Cyric a répondu de le garder ainsi (13 nov.).
- Poids du book dans les probabilités (`MARKET_W = 0.7`, `index.html`) choisi au jugé ; à recalibrer quand il y aura assez de matchs joués.
- Texte du bandeau « données vieilles » (backlog 8).
- Refonte visuelle par Codex : fusionnée (PR #16), hors de cette boucle. Pas encore vérifiée sur un vrai iPhone.

## Historique
- Itération 0 : préparation, 0 → 27 tests.
- Itération 1 : pari refusé par le serveur conservé sur l'appareil, message clair ; 27 → 29 tests.
- Revue 1 (Codex) : À CORRIGER ; preuve ancien code 0/2, actuel 32 réussis + 5 TODO ; backlog 1 rouvert, nouveaux 10, 11 et 12 ; itération 2, TOUR_CLAUDE.
- Itération 2 : backlog 1 terminé (refus partiel signalé, DELETE non bloqués) ; 32 → 34 tests réussis, 5 → 3 TODO.
- Revue 2 (Codex) : À CORRIGER ; backlog 1 confirmé (ancien 0/2, actuel 2/2), nouveaux 14 et 13 ; 37 réussis + 6 TODO ; itération 3, TOUR_CLAUDE.
- Itération 3 : backlog 14 corrigé (page qui plante sur un id d'équipe hérité, refusé par le serveur) ; 37 → 39 tests réussis, 6 → 4 TODO.
- Revue 3 (Codex) : À CORRIGER ; backlog 14 confirmé (parent 0/2, HEAD 2/2), nouveaux 15/16 ; 41 réussis + 7 TODO ; itération 4, TOUR_CLAUDE.
