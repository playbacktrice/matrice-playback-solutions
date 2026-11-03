-- Accepte, lors de la transmission, les 5 champs facultatifs de l'outil de saisie v2.
-- Aucun autre changement : mêmes contrôles (compte participant actif, ouverture, transmission unique, validation).
create or replace function public.submit_responses(p_file jsonb)
returns public.submissions
language plpgsql security definer set search_path = '' as $$
declare
  v_ids constant text[] := array[
    'c1-historique','c1-projets','c1-specialites','c1-produits','c1-fonctionnement',
    'c2-court','c2-moyen','c2-long','c2-deleguer','c2-evolutions','c2-temps',
    'c3-qualite','c3-documentation','c3-relation','c3-autonomie','c3-imprevus','c3-outils','c3-decision',
    'c4-materiel','c4-locaux','c4-equipe','c4-collaborateurs','c4-partenaires','c4-reseau','c4-outils',
    'c4-comp-tech','c4-comp-com','c4-comp-admin','c4-comp-orga',
    -- 5 champs facultatifs (version 2 de l'outil de saisie)
    'c1-complements','c2-complements','c3-complements','c4-complements','commentaires-generaux'];
  v_answers jsonb := '{}'::jsonb;
  v_cat jsonb;
  v_item jsonb;
  v_name text;
  v_updated timestamptz;
  r public.submissions;
begin
  if not public.is_contributor() then
    raise exception 'Compte non autorisé à transmettre' using errcode = 'PT401';
  end if;
  if not public.is_open() then
    raise exception 'La mise en commun n''est pas encore ouverte' using errcode = 'PT403';
  end if;
  perform pg_advisory_xact_lock(hashtext('submit:' || auth.uid()::text));
  if exists (select 1 from public.submissions where user_id = auth.uid()) then
    raise exception 'Réponses déjà transmises' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_file) <> 'object'
     or p_file ->> 'format' is distinct from 'matrice-playback-solutions'
     or jsonb_typeof(p_file -> 'formatVersion') <> 'number'
     or (p_file ->> 'formatVersion')::numeric <> 1
     or jsonb_typeof(p_file -> 'categories') <> 'array' then
    raise exception 'Fichier non reconnu (format Matrice Playback Solutions v1 attendu)' using errcode = 'PT422';
  end if;
  if pg_column_size(p_file) > 2000000 then
    raise exception 'Fichier trop volumineux' using errcode = 'PT422';
  end if;
  for v_cat in select * from jsonb_array_elements(p_file -> 'categories') loop
    if jsonb_typeof(v_cat -> 'items') <> 'array' then
      raise exception 'Fichier invalide : catégorie sans liste de réponses' using errcode = 'PT422';
    end if;
    for v_item in select * from jsonb_array_elements(v_cat -> 'items') loop
      if not ((v_item ->> 'id') = any (v_ids)) then
        raise exception 'Fichier invalide : sous-catégorie inconnue (%)', v_item ->> 'id' using errcode = 'PT422';
      end if;
      if jsonb_typeof(v_item -> 'answer') <> 'string' then
        raise exception 'Fichier invalide : réponse non textuelle (%)', v_item ->> 'id' using errcode = 'PT422';
      end if;
      if char_length(v_item ->> 'answer') > 20000 then
        raise exception 'Réponse trop longue (%)', v_item ->> 'id' using errcode = 'PT422';
      end if;
      if v_answers ? (v_item ->> 'id') then
        raise exception 'Fichier invalide : sous-catégorie en double (%)', v_item ->> 'id' using errcode = 'PT422';
      end if;
      v_answers := v_answers || jsonb_build_object(v_item ->> 'id', v_item ->> 'answer');
    end loop;
  end loop;
  if not exists (select 1 from jsonb_each_text(v_answers) where btrim(value) <> '') then
    raise exception 'Le fichier ne contient aucune réponse' using errcode = 'PT422';
  end if;
  v_name := left(coalesce(btrim(p_file -> 'participant' ->> 'name'), ''), 120);
  begin
    v_updated := (p_file ->> 'updatedAt')::timestamptz;
  exception when others then v_updated := null;
  end;
  insert into public.submissions (user_id, declared_name, answers, source_file, file_updated_at)
  values (auth.uid(), v_name, v_answers, p_file, v_updated)
  returning * into r;
  return r;
end $$;
