-- Tests de sécurité et de fonctionnement. À exécuter sur une base de TEST (locale).
\set ON_ERROR_STOP on
create or replace function pg_temp.login(p uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  if p is null then perform set_config('request.jwt.claims', '', false); execute 'set role anon';
  else perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false); execute 'set role authenticated'; end if;
end $$;
create or replace function pg_temp.must_fail(label text, q text, code text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlstate <> code then raise exception 'ÉCHEC % : % (%) au lieu de %', label, sqlstate, sqlerrm, code; end if;
    raise notice 'OK   %  [% %]', label, sqlstate, sqlerrm; return;
  end;
  raise exception 'ÉCHEC % : aucune erreur', label;
end $$;
create or replace function pg_temp.must_count(label text, q text, expected bigint) returns void language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  if n <> expected then raise exception 'ÉCHEC % : % au lieu de %', label, n, expected; end if;
  raise notice 'OK   %  [%]', label, n;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Fichier valide (même structure que l'export du site)
create temp table f (k text primary key, j jsonb);
grant select on f to anon, authenticated;
insert into f values ('A', '{"format":"matrice-playback-solutions","formatVersion":1,"participant":{"name":"Alice Test"},
  "updatedAt":"2026-11-10T10:00:00Z","categories":[
   {"id":"c1","items":[{"id":"c1-historique","title":"Historique","answer":"Réponse A « historique » 🎛️\nligne 2"},{"id":"c1-projets","title":"x","answer":""}]},
   {"id":"c4","items":[{"id":"c4-locaux","title":"Locaux","answer":"Studio A"}]}]}');
insert into f values ('B', '{"format":"matrice-playback-solutions","formatVersion":1,"participant":{"name":"Bruno Test"},
  "categories":[{"id":"c1","items":[{"id":"c1-historique","title":"Historique","answer":"Réponse B"}]}]}');
insert into f values ('bad_format', '{"format":"autre","formatVersion":1,"categories":[]}');
insert into f values ('bad_id', '{"format":"matrice-playback-solutions","formatVersion":1,"categories":[{"items":[{"id":"zz","answer":"x"}]}]}');
insert into f values ('dup', '{"format":"matrice-playback-solutions","formatVersion":1,"categories":[{"items":[{"id":"c1-historique","answer":"x"},{"id":"c1-historique","answer":"y"}]}]}');
insert into f values ('empty', '{"format":"matrice-playback-solutions","formatVersion":1,"categories":[{"items":[{"id":"c1-historique","answer":"  "}]}]}');
insert into f values ('nonstr', '{"format":"matrice-playback-solutions","formatVersion":1,"categories":[{"items":[{"id":"c1-historique","answer":12}]}]}');
insert into f values ('v2', '{"format":"matrice-playback-solutions","formatVersion":2,"categories":[]}');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"display_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'alice@test.local', '{"display_name":"Alice"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'bruno@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'desactive@test.local', '{}');
update public.participants set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000a';
update public.participants set active = false where user_id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.must_count('participants créés automatiquement', 'select 1 from public.participants', 4);

\set ADM '''00000000-0000-0000-0000-00000000000a'''
\set A   '''00000000-0000-0000-0000-0000000000a1'''
\set B   '''00000000-0000-0000-0000-0000000000b1'''
\set C   '''00000000-0000-0000-0000-0000000000c1'''

-- =================== AVANT L'OUVERTURE (date réelle : 16/11/2026 11 h) ===================
select pg_temp.login(:A);
select pg_temp.must_count('avant : ouverture fixée au 16/11 11 h Paris',
  $q$select 1 from (select (public.get_status()->>'opens_at')::timestamptz t) s where t = timestamptz '2026-11-16 10:00:00+00'$q$, 1);
select pg_temp.must_count('avant : statut fermé', $q$select 1 where (public.get_status()->>'is_open')::boolean = false$q$, 1);
select pg_temp.must_fail('avant : transmission refusée', $q$select public.submit_responses((select j from f where k='A'))$q$, 'PT403');
select pg_temp.login(:ADM);
select pg_temp.must_fail('avant : synthèse refusée', $q$select public.publish_synthesis('x', true)$q$, 'PT403');

-- Une transmission insérée par le propriétaire avant l'ouverture reste invisible pour tous
reset role;
insert into public.submissions (user_id, declared_name, answers, source_file)
values ('00000000-0000-0000-0000-0000000000b1', 'pré-ouverture', '{"c1-historique":"x"}', '{}');
select pg_temp.login(:B);
select pg_temp.must_count('avant : B ne voit rien (même sa propre ligne)', 'select * from public.submissions', 0);
select pg_temp.login(:ADM);
select pg_temp.must_count('avant : l''admin ne voit rien non plus', 'select * from public.submissions', 0);
reset role; delete from public.submissions;

-- =================== OUVERTURE (simulée : heure passée) ===================
update public.settings set opens_at = now() - interval '1 minute';

select pg_temp.login(null);
select pg_temp.must_fail('anonyme : lecture des réponses', 'select * from public.submissions', '42501');
select pg_temp.must_fail('anonyme : liste des participants', 'select * from public.participants', '42501');
select pg_temp.must_fail('anonyme : transmission', $q$select public.submit_responses('{}'::jsonb)$q$, '42501');
select pg_temp.must_fail('anonyme : statut', 'select public.get_status()', '42501');

select pg_temp.login(:A);
select pg_temp.must_fail('A : insertion directe', $q$insert into public.submissions(user_id,declared_name,answers,source_file) values (auth.uid(),'x','{}','{}')$q$, '42501');
select pg_temp.must_fail('A : format inconnu', $q$select public.submit_responses((select j from f where k='bad_format'))$q$, 'PT422');
select pg_temp.must_fail('A : version future', $q$select public.submit_responses((select j from f where k='v2'))$q$, 'PT422');
select pg_temp.must_fail('A : sous-catégorie inconnue', $q$select public.submit_responses((select j from f where k='bad_id'))$q$, 'PT422');
select pg_temp.must_fail('A : sous-catégorie en double', $q$select public.submit_responses((select j from f where k='dup'))$q$, 'PT422');
select pg_temp.must_fail('A : fichier sans réponse', $q$select public.submit_responses((select j from f where k='empty'))$q$, 'PT422');
select pg_temp.must_fail('A : réponse non textuelle', $q$select public.submit_responses((select j from f where k='nonstr'))$q$, 'PT422');
select pg_temp.must_count('A : rien enregistré après les refus', 'select * from public.submissions', 0);

select public.submit_responses((select j from f where k='A'));
select pg_temp.must_count('A : transmission enregistrée, texte intact',
  $q$select 1 from public.submissions where answers->>'c1-historique' = E'Réponse A « historique » 🎛️\nligne 2' and declared_name='Alice Test'$q$, 1);
select pg_temp.must_count('A : fichier d''origine conservé tel quel',
  $q$select 1 from public.submissions s, f where f.k='A' and s.source_file = f.j$q$, 1);
select pg_temp.must_fail('A : seconde transmission (doublon)', $q$select public.submit_responses((select j from f where k='A'))$q$, 'PT409');
select pg_temp.must_fail('A : modification directe', $q$update public.submissions set answers='{}'$q$, '42501');
select pg_temp.must_fail('A : suppression directe', $q$delete from public.submissions$q$, '42501');
select pg_temp.must_count('A : statut « déjà transmis »', $q$select 1 where (public.get_status()->>'has_submitted')::boolean$q$, 1);

select pg_temp.login(:B);
select pg_temp.must_count('B : voit la transmission de A (progressif)', 'select * from public.submissions', 1);
select pg_temp.must_fail('B : modifie la réponse de A', $q$update public.submissions set answers='{}'$q$, '42501');
select pg_temp.must_fail('B : supprime la réponse de A', $q$delete from public.submissions$q$, '42501');
select public.submit_responses((select j from f where k='B'));
select pg_temp.must_count('B : 2 transmissions visibles', 'select * from public.submissions', 2);
select pg_temp.must_count('B : sa transmission est à son nom', $q$select 1 from public.submissions where user_id = auth.uid()$q$, 1);
select pg_temp.must_fail('B : publie une synthèse', $q$select public.publish_synthesis('x', false)$q$, 'PT401');

select pg_temp.login(:C);
select pg_temp.must_count('désactivé : ne voit aucune réponse', 'select * from public.submissions', 0);
select pg_temp.must_fail('désactivé : ne peut pas transmettre', $q$select public.submit_responses((select j from f where k='A'))$q$, 'PT401');

select pg_temp.login(:ADM);
select pg_temp.must_fail('admin : synthèse sans indication IA', $q$select public.publish_synthesis('x', null)$q$, 'PT422');
select public.publish_synthesis('Synthèse test', true);
select pg_temp.must_fail('admin : modifie une synthèse', $q$update public.syntheses set content='y'$q$, '42501');
select pg_temp.must_fail('admin : modifie une réponse', $q$update public.submissions set answers='{}'$q$, '42501');
select pg_temp.login(:A);
select pg_temp.must_count('A : voit la synthèse marquée IA', 'select 1 from public.syntheses where ai_assisted', 1);

reset role;
select pg_temp.must_fail('propriétaire : UPDATE bloqué par trigger', $q$update public.submissions set declared_name='x'$q$, '42501');
select pg_temp.must_count('aucune fonction exécutable par anon',
  $q$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute')$q$, 0);
select pg_temp.must_count('search_path fixé sur les fonctions SECURITY DEFINER',
  $q$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')$q$, 0);
\echo '=== TOUS LES TESTS SONT PASSÉS ==='
