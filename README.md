# Démarche de rapprochement — Playback Solutions

- `index.html`, `site.js` : site en ligne (La démarche, Mise en commun). Plus de saisie en ligne ; les réponses
  éventuellement saisies avec la version précédente restent récupérables (téléchargement JSON).
- `outil.html`, `questionnaire.js` : outil de saisie hors ligne. `python3 scripts/build_outil.py` produit
  `outil/Demarche-de-rapprochement-Playback-Solutions.zip` (un fichier HTML autonome + LISEZ-MOI).
- `trame.js` : 29 rubriques (identifiants inchangés) + 5 champs facultatifs.
- `collective.js` : mise en commun (Supabase), comparaison, synthèses.
- `supabase/migrations/0005_champs_facultatifs.sql` : à appliquer avant la mise en ligne de cette version.

Format JSON inchangé (`matrice-playback-solutions`, formatVersion 1) ; les anciens fichiers restent valides.
