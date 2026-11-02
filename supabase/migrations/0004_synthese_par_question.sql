-- Synthèse par sous-catégorie : items = { "c1-historique": "texte", ... } (29 clés au plus)
-- published_by peut être vide : synthèse générée et mise en ligne par l'IA (Claude) à la demande de l'administrateur.
alter table public.syntheses add column items jsonb not null default '{}'::jsonb check (jsonb_typeof(items) = 'object');
alter table public.syntheses alter column published_by drop not null;
alter table public.syntheses add constraint syntheses_ai_author check (published_by is not null or ai_assisted);
