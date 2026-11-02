-- Tests sur le serveur réel, dans un bloc qui se termine TOUJOURS par une erreur volontaire
-- => toutes les écritures de test sont annulées (rien ne reste en base).
do $test$
declare
  rep text := '';
  adm uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  fa jsonb := '{"format":"matrice-playback-solutions","formatVersion":1,"participant":{"name":"Alice Test"},"updatedAt":"2026-11-10T10:00:00Z","categories":[{"id":"c1","items":[{"id":"c1-historique","title":"Historique","answer":"Réponse A « historique » 🎛️\nligne 2"},{"id":"c1-projets","title":"x","answer":""}]},{"id":"c4","items":[{"id":"c4-locaux","title":"Locaux","answer":"Studio A"}]}]}';
  fb jsonb := '{"format":"matrice-playback-solutions","formatVersion":1,"participant":{"name":"Bruno Test"},"categories":[{"id":"c1","items":[{"id":"c1-historique","answer":"Réponse B"}]}]}';
  n bigint; ok boolean; st text; msg text;
  procedure_dummy int;
begin
  -- helpers inline via sous-blocs
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (adm,'t-admin@test.invalid','authenticated','authenticated','{"display_name":"Admin T"}'),
    (a,'t-alice@test.invalid','authenticated','authenticated','{"display_name":"Alice T"}'),
    (b,'t-bruno@test.invalid','authenticated','authenticated','{}'),
    (c,'t-off@test.invalid','authenticated','authenticated','{}');
  update public.participants set role='admin' where user_id=adm;
  update public.participants set active=false where user_id=c;
  select count(*) into n from public.participants where user_id in (adm,a,b,c);
  rep := rep || format(E'\n%s participants créés automatiquement (4 attendus)', n);

  -- ---- AVANT ouverture (date réelle)
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  rep := rep || E'\navant : statut = ' || (public.get_status()->>'is_open') || ' ; ouverture = ' || (public.get_status()->>'opens_at');
  begin perform public.submit_responses(fa); rep := rep || E'\nÉCHEC avant : transmission acceptée';
  exception when others then rep := rep || E'\nOK avant : transmission refusée [' || sqlstate || ']'; end;
  execute 'reset role';
  insert into public.submissions (user_id, declared_name, answers, source_file) values (b,'pré','{"c1-historique":"x"}','{}');
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.submissions;
  rep := rep || format(E'\n%s avant : réponses visibles par l''admin = %s (0 attendu)', case when n=0 then 'OK' else 'ÉCHEC' end, n);
  execute 'reset role';
  delete from public.submissions where user_id=b;

  -- ---- OUVERTURE simulée
  update public.settings set opens_at = now() - interval '1 minute';

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);
  begin perform count(*) from public.submissions; rep := rep || E'\nÉCHEC anonyme : lecture possible';
  exception when others then rep := rep || E'\nOK anonyme : lecture refusée [' || sqlstate || ']'; end;
  begin perform public.submit_responses(fa); rep := rep || E'\nÉCHEC anonyme : transmission possible';
  exception when others then rep := rep || E'\nOK anonyme : transmission refusée [' || sqlstate || ']'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.submit_responses('{"format":"autre","formatVersion":1,"categories":[]}'); rep := rep || E'\nÉCHEC A : fichier invalide accepté';
  exception when others then rep := rep || E'\nOK A : fichier invalide refusé [' || sqlstate || ' ' || sqlerrm || ']'; end;
  begin perform public.submit_responses('{"format":"matrice-playback-solutions","formatVersion":1,"categories":[{"items":[{"id":"zz","answer":"x"}]}]}'); rep := rep || E'\nÉCHEC A : sous-catégorie inconnue acceptée';
  exception when others then rep := rep || E'\nOK A : sous-catégorie inconnue refusée [' || sqlstate || ']'; end;
  perform public.submit_responses(fa);
  select count(*) into n from public.submissions where user_id=a and answers->>'c1-historique' = E'Réponse A « historique » 🎛️\nligne 2' and source_file = fa;
  rep := rep || format(E'\n%s A : transmission enregistrée, texte et fichier d''origine intacts', case when n=1 then 'OK' else 'ÉCHEC' end);
  begin perform public.submit_responses(fa); rep := rep || E'\nÉCHEC A : doublon accepté';
  exception when others then rep := rep || E'\nOK A : doublon refusé [' || sqlstate || ']'; end;
  begin update public.submissions set answers='{}'; rep := rep || E'\nÉCHEC A : modification possible';
  exception when others then rep := rep || E'\nOK A : modification refusée [' || sqlstate || ']'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.submissions;
  rep := rep || format(E'\n%s B : voit la transmission de A (%s)', case when n=1 then 'OK' else 'ÉCHEC' end, n);
  begin delete from public.submissions where user_id=a; get diagnostics n = row_count;
    rep := rep || case when n=0 then E'\nOK B : suppression de A sans effet' else E'\nÉCHEC B : a supprimé A' end;
  exception when others then rep := rep || E'\nOK B : suppression de A refusée [' || sqlstate || ']'; end;
  perform public.submit_responses(fb);
  select count(*) into n from public.submissions;
  rep := rep || format(E'\n%s B : 2 transmissions visibles (%s)', case when n=2 then 'OK' else 'ÉCHEC' end, n);
  begin perform public.publish_synthesis('x', false); rep := rep || E'\nÉCHEC B : synthèse publiée';
  exception when others then rep := rep || E'\nOK B : synthèse refusée [' || sqlstate || ']'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.submissions;
  rep := rep || format(E'\n%s désactivé : voit %s réponse(s)', case when n=0 then 'OK' else 'ÉCHEC' end, n);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.publish_synthesis('Synthèse test', true);
  begin update public.syntheses set content='y'; rep := rep || E'\nÉCHEC admin : synthèse modifiable';
  exception when others then rep := rep || E'\nOK admin : synthèse non modifiable [' || sqlstate || ']'; end;
  execute 'reset role';

  raise exception 'FIN DES TESTS (annulation volontaire de toutes les écritures)%', rep;
end
$test$;
