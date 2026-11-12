# Statistiques NBA 2026-27

Pour actualiser les données, dans ce dossier avec Node.js (aucune dépendance ni clé API) :

```powershell
node fetch-data.mjs
```

Ouvrez ensuite `index.html` dans votre navigateur, ou rechargez la page déjà ouverte. Le fichier `data.js` contient `window.NBA_DATA` et fonctionne avec une page ouverte en `file://`.

La source est l’API publique ESPN : `/apis/site/v2/sports/basketball/nba/teams` et `/apis/site/v2/sports/basketball/nba/scoreboard?dates=AAAAMMJJ&limit=1000` sur `https://site.api.espn.com`. Les plages de dates renvoyant HTTP 400 lors du test, le script consulte chaque journée depuis le 1er octobre 2026, avec une pause de 300 ms entre requêtes. Il conserve uniquement la saison régulière 2026-27, les résultats définitifs et les rencontres programmées dans les sept prochains jours à partir de l’heure de lancement. Les matchs de groupe de la NBA Cup sont inclus s’ils sont classés en saison régulière par ESPN.

Les cotes sont celles réellement renvoyées par ESPN (DraftKings lors du test), sans estimation. Les valeurs absentes restent `null` ; le handicap est exprimé du point de vue de l’équipe à domicile. Elles peuvent changer après l’actualisation.

Le script vérifie les 30 équipes, les références des matchs et les scores, dédoublonne les rencontres et les trie par date. Il écrit un fichier temporaire puis remplace `data.js` uniquement après succès complet. Une erreur réseau, HTTP ou de structure provoque une sortie non nulle et préserve le fichier précédent. La saison est volontairement fixée à 2026-27 ; il faudra adapter le script pour une autre saison.

## Rafraîchissement automatique

Le workflow GitHub Actions `.github/workflows/refresh-data.yml` lance `node fetch-data.mjs` quatre fois par jour (6 h 17, 12 h 17, 16 h 17 et 18 h 47, heure de l’Est en hiver) et pousse le nouveau `data.js` sur `main`, ce qui redéploie le site sur Render. Il peut aussi être lancé à la main depuis l’onglet *Actions* → *Rafraîchir les données NBA* → *Run workflow*. Si ESPN échoue, le job sort en erreur et l’ancien `data.js` reste en place.
