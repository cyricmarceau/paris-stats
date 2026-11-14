# LOOP.md — amélioration continue (Claude = DEV, Codex = REVIEW)

## État
TOUR_CLAUDE

## Itération
8

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
18. ~~**[BUG - moyen] Modifier la ligne du formulaire conserve la probabilite de l'ancienne ligne.**~~ Corrigé à l'itération 6 (probabilité invalidée si la ligne change). `index.html:1218-1224,1264,1288-1294,1322-1328,1347-1352` : p est fixe a l'ouverture/au changement de cote ; aucun gestionnaire bmLine ne le recalcule ni ne l'efface. Reproduction avec le bouton total reellement rendu : Under 220,5 a 53,7778 %, ligne remplacee par 100,5, soumission -> Under 100,5 conserve p=0,537778. Resume et suggestion de mise restent aussi bases sur l'ancienne ligne. Meme chemin pour spread/props par lecture. Test TODO `backlog 18` dans `test/form.test.mjs:36` via les vrais gestionnaires ; cas total demontre sans navigateur. Recalculer p avec la nouvelle ligne ou l'invalider et rafraichir resume/mise. Preexistant, distinct du typage facultatif et de la synchro.
10. ~~**[BUG – moyen] Doublons dans un même POST comptés deux fois.**~~ Corrigé à l'itération 7. `server.mjs:107-109` construit `have` depuis les paris existants sans y ajouter les id acceptés du lot : `{ bets: [b, b] }` sur serveur vide écrit deux paris identiques, repris par `adopt()` et comptés deux fois dans les statistiques. Reproduit contre le vrai serveur avec GitHub simulé, test TODO `backlog 10` dans `test/server.test.mjs`. Les numéros du backlog restent stables ; l'ordre ici indique la priorité.
11. **[BUG – moyen] Identifiants acceptés mais impossibles à supprimer.** `server.mjs:65` accepte toute chaîne de longueur ≤ 40, tandis que `server.mjs:114` exige `[\w-]{1,40}` dans l'URL brute. Un pari importé avec `id: 'import:1'` est accepté (200), puis DELETE `/api/bets/import%3A1` renvoie 404 ; il reste sur le serveur et bloque les suppressions suivantes dans `sync()`. Test TODO `backlog 11` dans `test/server.test.mjs`.
13. **[BUG – moyen] Ajout pendant une synchro : succès sans envoi.** `index.html:867,880,900-902,1349` : pendant que le POST du premier pari attend, le formulaire ajoute un second et appelle sync(), qui retourne immédiatement. Le second reste local dans bets/pendAdd, mais hors du lot toSend. À la réponse, aucune relance et syncHtml annonce « Paris enregistrés sur le serveur » (`index.html:916`). Reproduit avec POST différé, test TODO `backlog 13`. Préexistant au correctif ; traiter les changements arrivés en cours de route ou signaler leur attente. Contrôler aussi suppression/import pendant la synchro.
19. **[BUG - moyen] Un joueur ayant marque peut etre efface si ses minutes sont arrondies a zero.** `fetch-extras.mjs:36,55-56` tronque les minutes puis ignore toute ligne <= 0, meme avec `didNotPlay` absent et 2 points marques. Reproduction synthetique dans `test/fetch-extras.test.mjs:51` (TODO backlog 19) : ajouter un joueur avec stats ['0','2','0','0','0-0'] a une feuille complete ; parseBox ne cree aucune entree pour lui. Les minutes '0:45' sont aussi tronquees a 0. Le match est ensuite marque done (`fetch-extras.mjs:113`), sans nouvel essai. Pour un joueur deja connu, la ligne manquante devient ensuite ? n'a pas joue ? et pari rembourse (`index.html:941-942,950`), au lieu du resultat de ses points. Conserver les apparitions etablies par les stats et traiter les durees sans perdre les secondes. Payloads ESPN de production non consultes ; frequence reelle non mesuree. Distinct des identifiants et champs facultatifs.
20. **[BUG – moyen] Une ligne de stats tronquée est enregistrée comme zéro puis figée.** `fetch-extras.mjs:36,53-58,113` accepte un joueur ayant 30 minutes mais un tableau `stats: ["30"]` : points/rebonds/assists/3pts absents deviennent tous 0 via `int(undefined)`. `parseBox` enregistre cette ligne, puis `main` marque le match done sans réessai. Les props peuvent être réglés à tort sur ces zéros (`index.html:940-950`) et les moyennes sont faussées. Nouveau test TODO backlog 20 (`test/fetch-extras.test.mjs:60`) : une feuille autrement complète doit être refusée avant toute mutation si une ligne jouée manque de stats requises. Reproduction synthétique confirmée ; occurrence ESPN réelle non consultée. Distinct de 19 : minutes valides, colonnes de valeurs absentes.
2. **[BUG – faible] Écritures GitHub inutiles.** `server.mjs:53-54` : `change` reçoit une copie (`cur.bets.slice()`), donc `next === cur.bets` n'est jamais vrai ; un doublon renvoyé (réessai après délai dépassé) ou la suppression d'un id inconnu crée quand même un commit sur `paris-data`.
3. **[BUG – faible] JSON invalide → 500 au lieu de 400.** `server.mjs:92` lève une SyntaxError attrapée en 500 (`server.mjs:121-123`).
4. **[SÉCURITÉ – faible] Messages d'erreur internes renvoyés au client.** `server.mjs:123` renvoie `error.message` brut (ex. « Lecture : HTTP 401 » de GitHub).
5. **[PERF – faible] ~620 Ko de données joueurs/face-à-face chargés à chaque visite**, même si on ne quitte pas l'onglet Matchs (`players.js`, `h2h.js`, `h2hbox.js` en `<script>` bloquants).
6. **[QUALITÉ – faible] `fetch-data.mjs` non testable** : `main()` s'exécute à l'import et `oddsFor` / `numeric` ne sont pas exportés (`fetch-data.mjs:28`, `fetch-data.mjs:111`). La lecture des cotes ESPN (sens de l'écart) n'a donc aucun test.
7. **[QUALITÉ – faible] Horaires de mise à jour dupliqués** : `REFRESH_UTC` dans `index.html` doit être modifié à la main en même temps que les `cron` du workflow.
21. **[QUALITÉ – faible] Historique GitHub : le message cite aussi les paris écartés.** `server.mjs:119` construit le message depuis `good`, avant la déduplication : deux paris valides de même id, parieurs Premier et Second, ne stockent que Premier mais écrivent « Pari ajouté (Premier, Second) ». Le réessai d’un pari existant crée aussi un message ajout trompeur (commit inutile déjà suivi en 2). Nouveau test TODO backlog 21 (`test/server.test.mjs:225`), messages capturés par `test/fake-github.mjs`. Construire le message depuis les ajouts effectifs ; aucune perte de pari démontrée ici.
8. **[UX – faible] Bandeau « données vieilles »** dans `index.html` dit de lancer `node fetch-data.mjs`, inutile sur téléphone (changement visible → voir « À valider »).
9. **[UX – faible] Le nom du parieur n'est pas limité à 40 caractères à la saisie** (`#bmWho`) ni à l'import, alors que le serveur refuse au-delà : depuis l'itération 1 le pari n'est plus perdu, mais il reste en attente et refusé à chaque synchro.

## Dernière modif
Itération 7 — backlog 10 (doublons dans un même POST), premier élément ouvert du backlog. La revue 6 n'avait pas de point à corriger sur l'itération 6 (18 accepté, fusion de `main` vérifiée).
- Quoi (`server.mjs`, POST `/api/bets`) : le filtre du lot ajoute chaque id accepté à l'ensemble `have` (`!have.has(b.id) && have.add(b.id)`), donc un id présent deux fois dans le même envoi n'est enregistré qu'une fois.
- Pourquoi : `{ bets: [b, b] }` écrivait deux paris identiques dans `bets.json`, comptés deux fois dans la fiche, le profit et le ROI de tous les appareils.
- Fichiers : `server.mjs` (1 ligne), retrait du marqueur `todo: 'backlog 10'` du test de Codex (`test/server.test.mjs`).
- Tests : `npm run lint` 4/4 ; `npm test` 72 tests : 69 réussis, 0 échec, 3 TODO (backlogs 11, 13, 19). Sans la correction (stash de `server.mjs`), le test du backlog 10 échoue.
- Limite connue : les doublons déjà enregistrés dans `bets.json` (s'il y en a) ne sont pas nettoyés ; ce correctif empêche seulement d'en créer.

## Review
**À CORRIGER — revue 7 par Codex ; correctif 10 accepté, nouveaux 20 et 21 à traiter.**

- AGENTS.md, LOOP.md et git show a18d608 lus. Catalogue des skills vérifié : aucun skill spécialisé utile à cette revue HTML/Node ; aucun SKILL.md de projet trouvé. Branche auto-improve/2026-11-13 conservée ; aucune source modifiée, aucun push.
- **Preuve 10** : serveur a18d608^ copié temporairement sous test/ avec le test actuel (sans TODO) et le même faux GitHub. node --test --test-name-pattern="un POST contenant" : parent **0/1, exit 1** (2 au lieu de 1), HEAD **1/1, exit 0**. Copies temporaires retirées. Aucun test existant supprimé ou affaibli.
- **API** : server.mjs:111-119 filtre la validité avant les doublons ; première copie valide conservée. Trois nouveaux tests verts couvrent copies différentes, réessai avec copie modifiée, invalide avant/après valide avec même id ; réponse et fichier GitHub vérifiés. Les doublons déjà stockés ne sont pas nettoyés (limite annoncée). Aucun défaut bloquant trouvé dans la ligne modifiée.
- **Client** : index.html:861-870,890-894 : adopt() choisit la dernière copie locale par id avant POST, et conserve les closeOdds/closeLine locaux ; ce comportement précède le correctif. Trois tests sur copies différentes : dernière copie valide envoyée une fois, ou dernière copie invalide gardée localement et signalée refusée. Un quatrième test avec pendAdd dupliqué confirme un POST de deux copies, une seule en retour, adopt() sans doublon et kept vidant les deux occurrences de l’attente. Pas de succès trompeur constaté dans ces cas. API directe = première copie valide ; copie locale avant envoi = dernière. Tests avec faux fetch, sans navigateur ni production.
- **Nouveau 20 (moyen)** : fetch-extras.mjs:36,53-58,113 transforme une ligne jouée tronquée en zéros définitifs ; test TODO rouge. Conséquence sur le règlement lue dans index.html:940-950 ; fréquence réelle non mesurée.
- **Nouveau 21 (faible, qualité)** : server.mjs:119, message construit depuis good : « Premier, Second » pour un seul ajout Premier. Test TODO rouge avec capture du message PUT. Le commit inutile au réessai est déjà en 2, non renuméroté.
- **Checks** : npm run lint initial **4/4, exit 0** ; npm test initial **69 réussis + 3 TODO / 72, exit 0**. Final : npm run lint **4/4, exit 0** ; npm test **76 réussis + 5 TODO / 81, exit 0**, aucun échec bloquant ; git diff --check vert. Les deux nouveaux TODO échouent pour les causes attendues. Aucun build ni typecheck.
- Aucun arrêt : sept itérations terminées, backlog encore ouvert et amélioration mesurable (10 rouge sur parent, vert sur HEAD). **Itération 8, TOUR_CLAUDE** ; priorité ouverte 11/13/19/20.

Revues précédentes condensées :

- Revue 1 : À CORRIGER ; refus partiel de 1, nouveaux 10/11/12 ; 32 réussis + 5 TODO.
- Revue 2 : À CORRIGER ; 1 confirmé (parent 0/2, actuel 2/2), nouveaux 14/13 ; 37 réussis + 6 TODO.
- Revue 3 : À CORRIGER ; 14 confirmé (parent 0/2, HEAD 2/2), nouveaux 15/16 ; 41 réussis + 7 TODO.
- Revue 4 : À CORRIGER ; 15/12/16 acceptés (parent 0/4, HEAD 4/4), nouveau 17 ; 47 réussis + 5 TODO.
- Revue 5 : À CORRIGER ; 17 confirmé (parent 0/4, HEAD 4/4), nouveau 18 ; 59 réussis + 4 TODO. closeOdds facultatif non validé noté sans ticket supplémentaire.
- Revue 6 : À CORRIGER ; 18 accepté (parent 0/1, HEAD 1/1), sept tests formulaire verts, merge hors boucle d369518 vérifié ; nouveau 19 ; 68 réussis + 4 TODO. Aucun navigateur ni déploiement consulté.

## À valider par Cyric
- ~~`GET /api/bets` public~~ : Cyric a répondu de le garder ainsi (13 nov.).
- Poids du book dans les probabilités (`MARKET_W = 0.7`, `index.html`) choisi au jugé ; à recalibrer quand il y aura assez de matchs joués.
- Texte du bandeau « données vieilles » (backlog 8).
- Formulaire de pari (itération 6) : si on change la ligne, la page n'affiche plus de probabilité du modèle ni de mise suggérée pour ce pari (au lieu d'afficher celles de l'ancienne ligne). Un recalcul pour la nouvelle ligne serait possible plus tard.
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
- Itération 6 : backlog 18 corrigé (probabilité invalidée quand la ligne du formulaire change) ; 59 → 60 tests réussis, 4 → 3 TODO.

- Revue 6 (Codex) : A CORRIGER ; 18 confirme (parent 0/1, HEAD 1/1), sept tests de formulaire supplementaires, nouveau 19 (minutes arrondies et joueur efface) ; 68 reussis + 4 TODO ; iteration 7, TOUR_CLAUDE.
- Itération 7 : backlog 10 corrigé (un même id envoyé deux fois n'est enregistré qu'une fois) ; 68 → 69 tests réussis, 4 → 3 TODO.

- Revue 7 (Codex) : À CORRIGER ; 10 confirmé (parent 0/1, HEAD 1/1), sept tests complémentaires verts, nouveaux 20/21 sous TODO ; 76 réussis + 5 TODO / 81 ; itération 8, TOUR_CLAUDE.
