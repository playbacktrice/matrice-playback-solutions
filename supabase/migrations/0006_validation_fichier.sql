-- Validation du fichier transmis : contrôles stricts et messages explicites, alignés sur l'interface.
-- Refuse désormais les fichiers sans numéro de version, sans liste de catégories, ou dont une catégorie
-- ou une réponse n'a pas la structure attendue (auparavant : message imprécis ou acceptation).
-- Aucun autre changement : mêmes droits (compte participant actif), même ouverture, transmission unique.
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
  v_id text;
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

  -- Format (mêmes règles que l'interface)
  if jsonb_typeof(p_file) is distinct from 'object'
     or p_file ->> 'format' is distinct from 'matrice-playback-solutions' then
    raise exception 'Ce fichier n''est pas un fichier de réponses de la démarche' using errcode = 'PT422';
  end if;
  if not (p_file ? 'formatVersion') or jsonb_typeof(p_file -> 'formatVersion') = 'null' then
    raise exception 'Numéro de version absent du fichier' using errcode = 'PT422';
  end if;
  if jsonb_typeof(p_file -> 'formatVersion') is distinct from 'number'
     or (p_file ->> 'formatVersion')::numeric <> 1 then
    raise exception 'Version de fichier non prise en charge (version 1 attendue)' using errcode = 'PT422';
  end if;
  if not (p_file ? 'categories') or jsonb_typeof(p_file -> 'categories') = 'null' then
    raise exception 'Liste des catégories absente du fichier' using errcode = 'PT422';
  end if;
  if jsonb_typeof(p_file -> 'categories') is distinct from 'array' then
    raise exception 'Liste des catégories invalide' using errcode = 'PT422';
  end if;
  if pg_column_size(p_file) > 2000000 then
    raise exception 'Fichier trop volumineux' using errcode = 'PT422';
  end if;

  for v_cat in select * from jsonb_array_elements(p_file -> 'categories') loop
    if jsonb_typeof(v_cat) is distinct from 'object'
       or jsonb_typeof(v_cat -> 'items') is distinct from 'array' then
      raise exception 'Fichier invalide : catégorie sans liste de réponses' using errcode = 'PT422';
    end if;
    for v_item in select * from jsonb_array_elements(v_cat -> 'items') loop
      v_id := case when jsonb_typeof(v_item) = 'object' then v_item ->> 'id' end;
      if v_id is null or not (v_id = any (v_ids)) then
        raise exception 'Fichier invalide : sous-catégorie inconnue (%)', coalesce(v_id, 'sans identifiant') using errcode = 'PT422';
      end if;
      if jsonb_typeof(v_item -> 'answer') is distinct from 'string' then
        raise exception 'Fichier invalide : réponse non textuelle (%)', v_id using errcode = 'PT422';
      end if;
      if char_length(v_item ->> 'answer') > 20000 then
        raise exception 'Réponse trop longue (%)', v_id using errcode = 'PT422';
      end if;
      if v_answers ? v_id then
        raise exception 'Fichier invalide : sous-catégorie en double (%)', v_id using errcode = 'PT422';
      end if;
      v_answers := v_answers || jsonb_build_object(v_id, v_item ->> 'answer');
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
