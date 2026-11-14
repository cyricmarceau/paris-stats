# LOOP.md — amélioration continue (Claude = DEV, Codex = REVIEW)

## État
TOUR_CLAUDE

## Itération
6

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
17. ~~**[BUG – élevé] Une probabilité facultative mal typée bloque le rendu des paris.**~~ Corrigé à l'itération 5 (`p` et `playerName`). `server.mjs:64-72,108-112` conserve `p` sans contrôle : POST d'un pari ml valide avec `p: { "toString": null }` → 200, objet enregistré. `index.html:1021,385` passe cet objet à pct(), qui lève TypeError (« Cannot convert object to primitive value »). Le chargement local s'arrête à renderBets (`index.html:1190`), et une liste reçue de l'API casse aussi son rendu ; l'import accepte p sans contrôle (`index.html:1432-1434`). Deux nouveaux tests TODO backlog 17 reproduisent API réelle et démarrage avec donnée enregistrée. Valider/normaliser les champs facultatifs utilisés par le rendu et tolérer les anciennes données mal formées. Préexistant, distinct des clés héritées corrigées à l'itération 4. Priorité suivante.
15. ~~**[BUG – élevé] Un identifiant joueur hérité bloque encore le rendu.**~~ Corrigé à l'itération 4 (même cause que 12 et 16, voir « Dernière modif »). `index.html:933-934` : prop sur un match terminé dans PL.done avec `playerId: 'constructor'` → pl.g.filter lève TypeError au chargement, avant la synchro. POST 200 reproduit (`server.mjs:64-71`) ; passe aussi le filtre d’import (`index.html:1428`). Deux nouveaux TODO backlog 15 (chargement local et API réelle). Valider les champs prop et protéger PL.players par une vérification de clé propre, y compris pour les paris déjà enregistrés. Distinct du backlog 14 (joueur, pas équipe). Priorité suivante.
14. ~~**[BUG – élevé] Identifiant d’équipe hérité qui bloque la page.**~~ Confirmé corrigé à l’itération 3 : abbr ne lit que les clés propres (`index.html:575`), validation numérique des équipes (`server.mjs:65-67`). Les deux tests échouent sur eaf9940^ et passent sur HEAD ; compatibilité détaillée dans la revue 3.
12. ~~**[BUG – moyen] Perte locale pour un id hérité de Object.prototype.**~~ Corrigé à l'itération 4. `index.html:860-861` utilise `{}` comme ensemble : avec `id: 'constructor'` (autorisé au POST et à l'import), `ids[id]` est déjà vrai même si la liste serveur est vide. `adopt()` efface le pari local avant l'envoi, puis POST reçoit un lot vide (400) et l'id reste en attente. Le même motif existe dans la migration (`index.html:871-872`) et la nouvelle table `kept` (`index.html:884-885`). Reproduit avec le harness, test TODO `backlog 12`. Traiter les id comme clés propres (Set ou objet sans prototype) ; motif préexistant hors diff, pas une pollution globale du prototype démontrée.
16. ~~**[BUG – moyen] Un match inexistant est compté comme réglé.**~~ Corrigé à l'itération 4. `index.html:938-951` lit gameById sans clé propre : `gameId: 'constructor', market: 'ml', pick: 'away'` obtient W (faux profit de 10 $ avec mise 10/cote 2). Les scores undefined produisent NaN ; par lecture, spread/total tombent sur P. L’API accepte toute chaîne gameId (`server.mjs:66`), l’import aussi (`index.html:1428`). Nouveau TODO backlog 16 : résultat attendu null, réel W au premier cas ; les variantes suivantes ne sont pas exécutées après cette assertion. Ne régler que les matchs réellement présents ; contrôler aussi l’affichage `index.html:1005`.
1. ~~**[BUG – moyen] Pari refusé : perte locale, succès trompeur et suppressions bloquées.**~~ Confirmé terminé à l’itération 2 : refus conservé et signalé, DELETE indépendants envoyés malgré POST 400. Les deux anciens TODO passent et échouent sur `c806e4c^`. Cas concurrent préexistant suivi séparément au backlog 13.
18. **[BUG - moyen] Modifier la ligne du formulaire conserve la probabilite de l'ancienne ligne.** `index.html:1218-1224,1264,1288-1294,1322-1328,1347-1352` : p est fixe a l'ouverture/au changement de cote ; aucun gestionnaire bmLine ne le recalcule ni ne l'efface. Reproduction avec le bouton total reellement rendu : Under 220,5 a 53,7778 %, ligne remplacee par 100,5, soumission -> Under 100,5 conserve p=0,537778. Resume et suggestion de mise restent aussi bases sur l'ancienne ligne. Meme chemin pour spread/props par lecture. Test TODO `backlog 18` dans `test/form.test.mjs:36` via les vrais gestionnaires ; cas total demontre sans navigateur. Recalculer p avec la nouvelle ligne ou l'invalider et rafraichir resume/mise. Preexistant, distinct du typage facultatif et de la synchro.
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
Itération 5 — backlog 17 (champ facultatif mal typé qui bloque le rendu). La revue 4 n'avait pas de point à corriger sur l'itération 4 (15/12/16 acceptés, regroupement accepté).
- Quoi : `validBet` (`server.mjs`) accepte `p` seulement absent/null ou nombre entre 0 et 1, et `playerName` seulement absent/null ou chaîne de 80 caractères max. Côté page (`index.html`), la colonne « Modèle » n'affiche `p` que si c'est un nombre fini, et `betLabel()` n'utilise `playerName` que si c'est une chaîne ; les anciennes données mal formées s'affichent donc sans planter.
- Pourquoi : `p: { "toString": null }` était accepté par l'API et faisait planter `pct()` au rendu ; `playerName` (le seul autre champ facultatif affiché) avait exactement le même défaut via `esc()`, donc il est traité dans la même correction.
- Fichiers : `server.mjs`, `index.html`, retrait des marqueurs `todo: 'backlog 17'` des 2 tests de Codex, et 2 tests ajoutés pour `playerName` (`test/page.test.mjs`, `test/server.test.mjs`).
- Tests : `npm run lint` 4/4 ; `npm test` 54 tests : 51 réussis, 0 échec, 3 TODO (backlogs 10, 11, 13). Sans la correction (stash de `index.html` et `server.mjs`), les 4 tests du backlog 17 échouent (47 réussis, 4 échecs).
- Limite connue : l'import de la page ne filtre toujours pas `p` ni `playerName` ; ces paris s'affichent sans planter mais seront refusés par le serveur (et restent en attente, cf. backlog 1/9).

## Review
**À CORRIGER - revue 5 par Codex ; correctif 17 accepte, nouveau 18 a traiter.**

- AGENTS.md, LOOP.md et `git show HEAD` (51cb5f8) lus. Catalogue des skills examine : aucun skill specialise utile a cette revue HTML/Node ; aucun SKILL.md de projet trouve. Branche conservee ; seules modifications dans test/ et LOOP.md, aucun push ni changement source.
- **Preuve 17 independante** : sources `git show 51cb5f8^:index.html` et `:server.mjs` copiees sous test/review-parent avec tests/harness actuels. `node --test --test-name-pattern="backlog 17" test/page.test.mjs test/server.test.mjs` : parent **0/4, exit 1** (deux TypeError au rendu, deux POST 200 au lieu de 400), HEAD **4/4, exit 0**. Copies temporaires supprimees ; aucun test supprime ou affaibli.
- **17 confirme** : `server.mjs:69-70` valide p/playerName ; `index.html:932,1021` protege les anciens paris. Test API supplementaire : p absent/null/0/0,5/1 acceptes ; p negatif/>1/chaine/booleen/tableau/objet refuses ; playerName numerique/booleen/tableau/>80 caracteres refuse, sans ecriture pour les refus.
- **Compatibilite des probabilites** : `index.html:445-450,539-550,1092-1104,1218-1224,1264,1347` relus. Sept tests verts supplementaires pilotent les gestionnaires reels via faux DOM, a partir des attributs des boutons rendus : ml avec/sans book, spread, total, props avec ligne normale et deux lignes extremes. p fini dans [0,1], data-po numerique dans ces cas. Sans attribut p, p0 devient null ; si data-po est NaN, draft.p peut etre NaN mais JSON.stringify le transmet comme null (autorise par API). Aucun chemin normal trouve produisant une chaine ou p hors intervalle. Le harness enregistre desormais les evenements ; source et assertions existantes inchangees.
- **Autres champs facultatifs affiches** : l'affirmation dans Derniere modif que playerName est le seul autre champ facultatif affiche est trop large. `closeOdds` intervient aussi dans betClv (`index.html:962-964`) avec controle de verite seulement ; closeLine a un typeof (`966`). Les chemins normaux updateClose (`831-833`) les produisent numeriques. Les imports restent permissifs et validBet ne valide pas ces champs. 17 accepte pour p/playerName, sans garantie generale sur les imports. Pas de ticket supplementaire sur une variante de champ objet mal forme, conformement a la demande d'eviter cette meme veine. p=0 masque et p historique >1 affichable (`1021`) : comportements preexistants, sans regression de ce diff.
- **Nouveau 18, moyen** : probabilite inchangee apres modification de ligne, reproduite par `test/form.test.mjs:36` (TODO backlog 18). Under 100,5 enregistre avec 0,537778 au lieu d'une probabilite proche de zero ou absente. Aucun autre nouveau probleme suffisamment etabli retenu apres lecture des calculs, formulaire, synchro et fetch-extras.mjs.
- **Checks** : `npm run lint` **4/4, exit 0** ; `npm test` initial **51 reussis + 3 TODO / 54**, final **59 reussis + 4 TODO / 63, exit 0**, zero echec bloquant. Les quatre TODO echouent comme attendu (10, 11, 13, 18). Aucun build ni typecheck. Production et exports personnels non consultes ; aucun navigateur execute.
- Aucun arret : cinq iterations terminees, backlog ouvert, amelioration mesurable (quatre tests 17 rouges sur parent, verts sur HEAD). **Iteration 6, TOUR_CLAUDE** ; priorite suivante 18 puis 10/11/13.

Revues precedentes condensees :

- Revue 1 : A CORRIGER ; refus partiel de 1, nouveaux 10/11/12 ; 32 reussis + 5 TODO.
- Revue 2 : A CORRIGER ; 1 confirme (parent 0/2, actuel 2/2), nouveaux 14/13 ; 37 reussis + 6 TODO.
- Revue 3 : A CORRIGER ; 14 confirme (parent 0/2, HEAD 2/2), nouveaux 15/16 ; 41 reussis + 7 TODO. Compatibilite des identifiants historiques examinee.
- Revue 4 : A CORRIGER ; regroupement 15/12/16 accepte, parent 0/4 et HEAD 4/4 ; nouveau 17 ; 47 reussis + 5 TODO. Dictionnaires, vrais ids joueurs et exports historiques examines.

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
- Itération 5 : backlog 17 corrigé (p et playerName mal typés refusés par le serveur, affichage tolérant) ; 47 → 51 tests réussis, 5 → 3 TODO.
- Revue 5 (Codex) : À CORRIGER ; 17 confirme (parent 0/4, HEAD 4/4), nouveau 18 (probabilite figee apres modification de ligne) ; 59 reussis + 4 TODO ; iteration 6, TOUR_CLAUDE.
