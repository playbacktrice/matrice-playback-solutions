# Supabase — projet `matrice-playback-solutions` (ref enfeeltrunbxzneknerj, Paris)

- `migrations/0001_mise_en_commun.sql` : schéma appliqué (participants, ouverture, transmissions, synthèses, RLS).
- `tests/10_tests.sql` : 40 contrôles sur base locale (simulation Supabase : `tests/00_local_stub.sql`).
- `tests/20_tests_serveur.sql` : contrôles sur le serveur réel, auto-annulés (aucune trace).

Ouverture : `settings.opens_at` = 16/11/2026 11:00 Europe/Paris (heure du serveur).
Comptes : créés par l'administrateur (Authentication → Users → Add user). Chaque compte est créé
INACTIF dans `participants` : l'activer (active = true) et renseigner son nom affiché.
Réponses transmises : une par participant, jamais modifiables depuis l'application.
