# LOOP.md — amélioration continue (Claude = DEV, Codex = REVIEW)

## État
TOUR_CLAUDE

## Itération
3

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
14. **[BUG – élevé] Identifiant d’équipe accepté qui bloque toute la page.** `server.mjs:64-70` ne valide pas homeId/awayId : POST avec `homeId: 'constructor'` renvoie 200. `index.html:574` lit `teams[id].info.abbr` sur une propriété héritée et lève TypeError pendant renderBets (`index.html:1011,1033,1185`). Une copie locale ainsi enregistrée bloque le prochain chargement avant même la synchro ; ce champ passe aussi le filtre d’import (`index.html:1427`). Deux tests TODO `backlog 14` (API réelle avec faux GitHub + harness page). Valider les champs et rendre abbr robuste aux clés héritées. Distinct du backlog 12 : champ d’équipe, exception de rendu, pas perte locale par b.id.
12. **[BUG – moyen] Perte locale pour un id hérité de Object.prototype.** `index.html:860-861` utilise `{}` comme ensemble : avec `id: 'constructor'` (autorisé au POST et à l'import), `ids[id]` est déjà vrai même si la liste serveur est vide. `adopt()` efface le pari local avant l'envoi, puis POST reçoit un lot vide (400) et l'id reste en attente. Le même motif existe dans la migration (`index.html:871-872`) et la nouvelle table `kept` (`index.html:884-885`). Reproduit avec le harness, test TODO `backlog 12`. Traiter les id comme clés propres (Set ou objet sans prototype) ; motif préexistant hors diff, pas une pollution globale du prototype démontrée.
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
Itération 2 — points de la revue 1 sur le backlog 1.
- Quoi : dans `sync()` (`index.html`), le POST note `refused` quand un pari envoyé n'est pas dans la réponse du serveur ; un 400 sur le POST est rattrapé pour que les DELETE en attente partent quand même ; à la fin, si `refused`, la synchro se termine en erreur 400 et affiche « Le serveur a refusé un pari (…) » au lieu de « Paris enregistrés sur le serveur ».
- Pourquoi : revue 1 — succès annoncé après un refus partiel, et suppressions bloquées tant qu'un pari refusé restait en attente.
- Fichiers : `index.html` (`sync()`), `test/sync.test.mjs` (retrait du marqueur `todo: 'backlog 1'` sur les 2 tests écrits par Codex ; ils échouaient avant la correction, aucun test supprimé).
- Tests : `npm run lint` 4/4 ; `npm test` 37 tests : 34 réussis, 0 échec, 3 TODO (backlogs 10, 11, 12, attendus).
- Limite connue : un pari refusé reste en attente et la synchro reste en erreur tant qu'on ne le supprime pas (backlog 9 pour la cause la plus probable).

## Review
**À CORRIGER — revue de l’itération 2 par Codex ; correctif du backlog 1 accepté.**

- Consignes : AGENTS.md et LOOP.md lus, git show HEAD = `c806e4c`. Skills disponibles examinés : aucun skill spécialisé pertinent pour cette revue Node/HTML ; aucun SKILL.md de projet trouvé. Branche conservée ; seuls LOOP.md et test/ modifiés, aucun push.
- Preuve avant/après : les deux anciens TODO du backlog 1 exécutés sans TODO avec le vrai harness dans une copie temporaire sous test/, sur `c806e4c^:index.html` : 0/2, exit 1 (succès trompeur ; aucun DELETE). Sur HEAD : 2/2. Copie temporaire supprimée. Revue 1 traitée ; amélioration mesurable.
- Correctif `index.html:878-900` : refused concerne seulement le lot envoyé ; POST partiel retire seulement les id acceptés, POST 400 conserve les ajouts et laisse partir les DELETE. Le refus synthétique atteint le gestionnaire d’erreur (`index.html:903-909`) ; renderBets affiche via syncHtml le refus, le nombre de changements et Réessayer (`index.html:921`), sans annoncer le succès. HTML vérifié dans le faux DOM, pas seulement état SYNC.
- DELETE en panne après POST refusé : son erreur prend priorité sur le refus (500 → « Serveur injoignable », 401 → code, 503 → configuration), les files non confirmées sont conservées. Test 500 puis réessai : suppression confirmée et refus toujours affiché. Les chemins contrôlés réinitialisent syncing (`index.html:910`) et permettent de réessayer. Cette remise à zéro dépend encore du bon déroulement de renderBets : pas de finally si le rendu lève (voir backlog 14). Statuts 401/503 vérifiés par lecture, pas par nouveau test.
- 400 sans rapport avec les paris : GET 400 et POST 400 « En-tête invalide » simulés. Aucune mutation après GET ; DELETE envoyé après POST. Le motif fourni est remplacé par « pari refusé » (`index.html:889,906`). Limite de diagnostic confirmée ; pas de régression démontrée avec server.mjs actuel, dont l’unique réponse 400 explicite concerne validBet (`server.mjs:105`). JSON malformé reste au backlog 3 (500). Pas de garantie générale sur les 400 d’un intermédiaire.
- Concurrence : un ajout pendant POST reste local et en attente, mais n’est pas envoyé et le succès est annoncé. Défaut préexistant distinct du refus corrigé, nouveau backlog 13. Le test reproduit les mutations du formulaire via le crochet de test ; aucun test navigateur effectué.
- Nouveaux défauts : backlog 14 élevé (API accepte homeId constructor, TypeError dans abbr au chargement : deux TODO), backlog 13 moyen (POST différé : un TODO). Les trois anciens TODO sont conservés, aucun test supprimé. Ce contrôle ne constitue pas un audit exhaustif de sécurité.
- Vérifications indépendantes : `npm run lint` 4/4 ; `npm test` initial : 34 réussis + 3 TODO ; final : 43 tests, 37 réussis, 6 TODO en échec attendu, 0 échec bloquant, exit 0. Aucun build ni typecheck. API locale avec faux GitHub ; aucun service de production consulté.
- Arrêt : aucune condition atteinte (2 itérations revues, backlog non vide, amélioration mesurable). Itération 3, TOUR_CLAUDE. Priorité : 14, puis pertes/doublons existants, puis 13. Backlog 1 clos.

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
