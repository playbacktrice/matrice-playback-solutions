do $test$
declare
  rep text := ''; adm uuid := gen_random_uuid(); t uuid := gen_random_uuid(); r uuid := gen_random_uuid(); n bigint; st jsonb;
  f jsonb := '{"format":"matrice-playback-solutions","formatVersion":1,"participant":{"name":"Test"},"categories":[{"id":"c1","items":[{"id":"c1-historique","answer":"Réponse de test"}]}]}';
begin
  insert into auth.users (id, email, aud, role) values (adm,'t-adm@test.invalid','authenticated','authenticated'),(t,'t-rep@test.invalid','authenticated','authenticated'),(r,'t-reel@test.invalid','authenticated','authenticated');
  update public.participants set active=true where user_id in (adm,t,r);
  update public.participants set role='admin' where user_id=adm;
  update public.participants set rehearsal=true where user_id in (adm,t);

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true); execute 'set local role authenticated';
  st := public.get_status();
  rep := rep || format(E'\n%s admin : peut transmettre = %s', case when (st->>'can_submit')::boolean=false then 'OK' else 'ÉCHEC' end, st->>'can_submit');
  begin perform public.submit_responses(f); rep := rep || E'\nÉCHEC admin : transmission acceptée';
  exception when others then rep := rep || E'\nOK admin : transmission refusée [' || sqlstate || ']'; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',t,'role','authenticated')::text, true); execute 'set local role authenticated';
  st := public.get_status();
  rep := rep || format(E'\n%s compte de répétition : ouvert=%s répétition=%s', case when (st->>'is_open')::boolean and (st->>'rehearsal')::boolean then 'OK' else 'ÉCHEC' end, st->>'is_open', st->>'rehearsal');
  perform public.submit_responses(f);
  rep := rep || E'\nOK compte de répétition : transmission acceptée avant l''heure';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true); execute 'set local role authenticated';
  select count(*) into n from public.submissions;
  rep := rep || format(E'\n%s admin (répétition) : voit la transmission de test (%s)', case when n=1 then 'OK' else 'ÉCHEC' end, n);
  perform public.publish_synthesis('Synthèse de test', true);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',r,'role','authenticated')::text, true); execute 'set local role authenticated';
  st := public.get_status();
  select count(*) into n from public.submissions;
  rep := rep || format(E'\n%s participant réel : fermé=%s, voit %s transmission(s)', case when (st->>'is_open')::boolean=false and n=0 then 'OK' else 'ÉCHEC' end, not (st->>'is_open')::boolean, n);
  select count(*) into n from public.syntheses;
  rep := rep || format(E'\n%s participant réel : voit %s synthèse(s)', case when n=0 then 'OK' else 'ÉCHEC' end, n);
  begin perform public.submit_responses(f); rep := rep || E'\nÉCHEC participant réel : transmission acceptée avant l''heure';
  exception when others then rep := rep || E'\nOK participant réel : transmission refusée avant l''heure [' || sqlstate || ']'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true); execute 'set local role anon';
  begin perform count(*) from public.submissions; rep := rep || E'\nÉCHEC anonyme : lecture';
  exception when others then rep := rep || E'\nOK anonyme : lecture refusée [' || sqlstate || ']'; end;
  execute 'reset role';
  raise exception 'FIN DES TESTS (annulation volontaire)%', rep;
end $test$;
