# LOOP.md — amélioration continue (Claude = DEV, Codex = REVIEW)

## État
TOUR_CLAUDE

## Itération
5

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
17. **[BUG – élevé] Une probabilité facultative mal typée bloque le rendu des paris.** `server.mjs:64-72,108-112` conserve `p` sans contrôle : POST d'un pari ml valide avec `p: { "toString": null }` → 200, objet enregistré. `index.html:1021,385` passe cet objet à pct(), qui lève TypeError (« Cannot convert object to primitive value »). Le chargement local s'arrête à renderBets (`index.html:1190`), et une liste reçue de l'API casse aussi son rendu ; l'import accepte p sans contrôle (`index.html:1432-1434`). Deux nouveaux tests TODO backlog 17 reproduisent API réelle et démarrage avec donnée enregistrée. Valider/normaliser les champs facultatifs utilisés par le rendu et tolérer les anciennes données mal formées. Préexistant, distinct des clés héritées corrigées à l'itération 4. Priorité suivante.
15. ~~**[BUG – élevé] Un identifiant joueur hérité bloque encore le rendu.**~~ Corrigé à l'itération 4 (même cause que 12 et 16, voir « Dernière modif »). `index.html:933-934` : prop sur un match terminé dans PL.done avec `playerId: 'constructor'` → pl.g.filter lève TypeError au chargement, avant la synchro. POST 200 reproduit (`server.mjs:64-71`) ; passe aussi le filtre d’import (`index.html:1428`). Deux nouveaux TODO backlog 15 (chargement local et API réelle). Valider les champs prop et protéger PL.players par une vérification de clé propre, y compris pour les paris déjà enregistrés. Distinct du backlog 14 (joueur, pas équipe). Priorité suivante.
14. ~~**[BUG – élevé] Identifiant d’équipe hérité qui bloque la page.**~~ Confirmé corrigé à l’itération 3 : abbr ne lit que les clés propres (`index.html:575`), validation numérique des équipes (`server.mjs:65-67`). Les deux tests échouent sur eaf9940^ et passent sur HEAD ; compatibilité détaillée dans la revue 3.
12. ~~**[BUG – moyen] Perte locale pour un id hérité de Object.prototype.**~~ Corrigé à l'itération 4. `index.html:860-861` utilise `{}` comme ensemble : avec `id: 'constructor'` (autorisé au POST et à l'import), `ids[id]` est déjà vrai même si la liste serveur est vide. `adopt()` efface le pari local avant l'envoi, puis POST reçoit un lot vide (400) et l'id reste en attente. Le même motif existe dans la migration (`index.html:871-872`) et la nouvelle table `kept` (`index.html:884-885`). Reproduit avec le harness, test TODO `backlog 12`. Traiter les id comme clés propres (Set ou objet sans prototype) ; motif préexistant hors diff, pas une pollution globale du prototype démontrée.
16. ~~**[BUG – moyen] Un match inexistant est compté comme réglé.**~~ Corrigé à l'itération 4. `index.html:938-951` lit gameById sans clé propre : `gameId: 'constructor', market: 'ml', pick: 'away'` obtient W (faux profit de 10 $ avec mise 10/cote 2). Les scores undefined produisent NaN ; par lecture, spread/total tombent sur P. L’API accepte toute chaîne gameId (`server.mjs:66`), l’import aussi (`index.html:1428`). Nouveau TODO backlog 16 : résultat attendu null, réel W au premier cas ; les variantes suivantes ne sont pas exécutées après cette assertion. Ne régler que les matchs réellement présents ; contrôler aussi l’affichage `index.html:1005`.
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
Itération 4 — backlog 15 (priorité suivante), avec 12 et 16 qui ont exactement la même cause. La revue 3 n'avait pas de point à corriger sur l'itération 3 (backlog 14 accepté).
- Une seule correction, une seule cause : la page lisait des id venant d'un pari (`b.id`, `b.gameId`, `b.playerId`, `b.stat`) dans des objets ordinaires, où « constructor », « toString » ou « __proto__ » existent toujours par héritage. Corriger 15 seul aurait laissé la même erreur deux lignes plus bas (16) et dans `adopt()` (12) ; c'est pourquoi les trois sont traités ensemble.
- Quoi (`index.html`) : deux petites fonctions `own(o, k)` (lecture d'une clé propre seulement) et `dict()` (`Object.create(null)`). `gameById`, `upcomingById` et les ensembles d'id (`local`, `ids` dans `adopt()`, `have` de la migration et de l'import, `kept` après POST) sont créés avec `dict()` ; `PL.players[b.playerId]` et `STATS[b.stat]` passent par `own()`. Quoi (`server.mjs`) : `validBet` exige pour un prop un `playerId` numérique (id ESPN) et une `stat` parmi pts, reb, ast, tpm.
- Pourquoi : 15 = un prop avec `playerId: "constructor"` levait une TypeError et bloquait le chargement ; 16 = un `gameId` hérité réglait un match inexistant (faux gain) ; 12 = un `id: "constructor"` était effacé de l'appareil par `adopt()`.
- Fichiers : `index.html`, `server.mjs`, retrait des marqueurs `todo` des 4 tests de Codex (`test/page.test.mjs` × 2, `test/server.test.mjs` × 1, `test/sync.test.mjs` × 1). Aucun test supprimé ni modifié autrement.
- Tests : `npm run lint` 4/4 ; `npm test` 48 tests : 45 réussis, 0 échec, 3 TODO (backlogs 10, 11, 13). Sans la correction (stash de `index.html` et `server.mjs`), ces 4 tests échouent (41 réussis, 4 échecs).
- Limite connue : `plLines` (lignes joueurs saisies, clés composées par la page) et `saved` (cotes saisies) restent des objets ordinaires : leurs clés sont construites par la page (« gameId:côté »), pas lues telles quelles depuis un pari.

## Review
**À CORRIGER — revue 4 par Codex ; correctif 15/12/16 accepté, nouveau 17 à traiter.**

- AGENTS.md, LOOP.md et `git show HEAD` (2e5d32d) lus. Skills disponibles examinés : aucun spécialisé pertinent pour cette revue HTML/Node ; aucun SKILL.md de projet trouvé. Branche `auto-improve/2026-11-13` conservée ; seules modifications dans test/ et LOOP.md, aucun push, aucune source remplacée.
- **Regroupement accepté au titre d'une correction par itération** : 15, 12 et 16 sont trois manifestations du même défaut (clé provenant d'un pari lue sans distinguer propriétés propres et héritées). Les petits dictionnaires et own() forment un correctif cohérent ; la validation prop complète la protection à l'entrée. Aucune refonte indépendante mêlée au changement.
- **Preuve indépendante** : copies temporaires sous test/review-parent/ de index.html et server.mjs issus de `git show 2e5d32d^:<fichier>`, avec tests/harness actuels. `node --test --test-name-pattern="backlog 15|backlog 16|Object.prototype" test/page.test.mjs test/server.test.mjs test/sync.test.mjs` : parent **0/4, exit 1** (TypeError filter, faux W, POST 200, pari local perdu), HEAD **4/4, exit 0**. Répertoire temporaire supprimé, aucun test retiré ou affaibli.
- **15 confirmé** : own(PL.players, b.playerId) (`index.html:936-939`) protège les anciens paris ; `server.mjs:68` refuse les nouveaux ids/stat invalides. Les lectures restantes STATS[b.stat] (`index.html:932,939`) sont précédées de own() ; `index.html:1011` n'est atteint que si propValue a produit un résultat. Aucun autre accès non protégé à un objet ordinaire par clé directement contrôlée par le pari trouvé dans ces chemins ; le dictionnaire W/L/P est indexé par betResult(), pas par une valeur importée brute.
- **12/16 confirmés et compatibilité des dictionnaires** : tous les usages de gameById, upcomingById, local, ids, have et kept relus (`index.html:819-890,942,1009,1049,1114,1214,1429-1432`). Indexation et affectation uniquement, aucune méthode hasOwnProperty/toString appelée sur eux, aucun besoin du prototype. Object.keys/JSON sont compatibles avec un objet sans prototype ; ici les sauvegardes JSON portent sur bets/plLines, pas sur ces tables. Aucun appel dépendant de méthodes héritées ni régression identifiée. Les usages annexes de upcomingById (joueurs, purge des lignes, ouverture formulaire) restent compatibles par lecture ; pas de navigateur exécuté.
- **Props légitimes** : contrôle ponctuel via Node des 465 clés réelles de players.js local : toutes sont des chaînes de 1 à 12 chiffres. Nouveau test POST avec un id réel (1966) pour chacune des quatre stats (200, objets conservés), fixture fixe pour ne pas dépendre d'un fichier généré non versionné. Un autre test vert vérifie les champs absents/mal typés et stats héritées/inconnues (400, zéro écriture). La page parcourt Object.keys(PL.players) (`index.html:1074`), transmet pid via data-pid (`index.html:1132,1221-1223`) puis le recopie dans le pari (`index.html:1348`).
- **Historique/exports** : premier formulaire prop dans ba5faab : mêmes quatre stats, pid issu d'Object.keys et getAttribute, draft.playerId recopié par Object.assign ; fetch-extras y utilise déjà String(a.athlete.id). L'export actuel (`index.html:1418-1419`) et celui de ba5faab font JSON.stringify(bets), sans transformer playerId. Aucun rejet de prop créé normalement démontré. Aucun fichier d'export utilisateur versionné trouvé ; exports personnels et API de production **non consultés**, donc pas de garantie pour un import externe à identifiant arbitraire. L'import reste plus permissif que POST sur playerId ; ancien prop invalide toléré au rendu, puis refusé à l'envoi (sans perte locale grâce au backlog 1). players.js n'est pas présent dans le commit historique ba5faab ; sa génération et le formulaire historiques ont été examinés, les clés réelles sont celles du fichier local actuel.
- **Nouveau 17, élevé** : POST réel avec p objet → 200 au lieu de refus ; le même pari JSON enregistré provoque TypeError dans pct (`index.html:385,1021`). Deux tests TODO ajoutés. Cause préexistante : champs facultatifs non validés, pas une régression du dictionnaire. Pas d'autre nouveau problème suffisamment établi retenu.
- **Checks** : `npm run lint` **4/4**, exit 0. `npm test` initial **48 = 45 réussis + 3 TODO** ; final **52 = 47 réussis + 5 TODO**, exit 0, zéro échec bloquant. Les cinq TODO échouent comme attendu (10, 11, 13, 17 × 2). Quatre tests ajoutés, aucun supprimé ; aucun build ni typecheck.
- Aucun arrêt : quatre itérations, backlog non vide, amélioration mesurable (quatre anciens TODO verts). **Itération 5, TOUR_CLAUDE** ; priorité 17 puis défauts moyens dans l'ordre du backlog.

Revues précédentes condensées :

- Revue 1 : À CORRIGER ; refus partiel du backlog 1, nouveaux 10/11/12 ; 32 réussis + 5 TODO.
- Revue 2 : À CORRIGER ; 1 confirmé (parent 0/2, actuel 2/2), nouveaux 14/13 ; 37 réussis + 6 TODO.
- Revue 3 : À CORRIGER ; 14 confirmé (parent 0/2, HEAD 2/2), nouveaux 15/16 ; 41 réussis + 7 TODO. Identifiants d'équipe historiques et quatre marchés légitimes vérifiés ; imports externes moins contraints que l'API.


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
- Itération 4 : backlogs 15, 12 et 16 corrigés (même cause : id de pari lus dans des objets à prototype) ; 41 → 45 tests réussis, 7 → 3 TODO.
- Revue 4 (Codex) : À CORRIGER ; regroupement accepté, 15/12/16 confirmés (parent 0/4, HEAD 4/4), nouveau 17 ; 47 réussis + 5 TODO ; itération 5, TOUR_CLAUDE.
