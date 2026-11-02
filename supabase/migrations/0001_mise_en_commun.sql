-- Matrice Playback Solutions — mise en commun du 16 novembre 2026
-- Principe : les réponses individuelles restent dans les navigateurs jusqu'à l'ouverture.
-- À partir de l'heure d'ouverture (contrôlée par l'horloge du SERVEUR), chaque participant
-- connecté transmet UNE fois son fichier ; tous les participants actifs consultent les transmissions.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.participants (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role         text not null default 'participant' check (role in ('admin', 'participant')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Paramètre unique : heure d'ouverture de la mise en commun
create table public.settings (
  id        integer primary key check (id = 1),
  opens_at  timestamptz not null
);
insert into public.settings (id, opens_at)
values (1, timestamptz '2026-11-16 11:00:00 Europe/Paris');

-- Une transmission par participant, jamais modifiée
create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.participants (user_id) on delete restrict,
  declared_name   text not null check (char_length(declared_name) <= 120),  -- nom saisi dans le fichier
  answers         jsonb not null check (jsonb_typeof(answers) = 'object'),   -- { "c1-historique": "…", … }
  source_file     jsonb not null,                                            -- fichier JSON d'origine, intact
  file_updated_at timestamptz,
  submitted_at    timestamptz not null default now()
);

-- Synthèse(s) publiée(s) par l'administrateur ; ai_assisted indique une mise en forme par IA
create table public.syntheses (
  id           bigint generated always as identity primary key,
  content      text not null check (char_length(content) between 1 and 100000),
  ai_assisted  boolean not null,
  published_by uuid not null references public.participants (user_id),
  published_at timestamptz not null default now()
);

-- Signal sans contenu pour l'actualisation en direct
create table public.sync_state (
  id         integer primary key check (id = 1),
  changed_at timestamptz not null default now()
);
insert into public.sync_state (id) values (1);

-- ---------------------------------------------------------------------------
-- Droits : aucun accès direct en écriture ; lecture sous RLS pour les connectés
-- ---------------------------------------------------------------------------
alter table public.participants enable row level security;
alter table public.settings     enable row level security;
alter table public.submissions  enable row level security;
alter table public.syntheses    enable row level security;
alter table public.sync_state   enable row level security;

revoke all on public.participants, public.settings, public.submissions, public.syntheses, public.sync_state
  from public, anon, authenticated;
grant select on public.participants, public.submissions, public.syntheses, public.sync_state to authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions de contrôle
-- ---------------------------------------------------------------------------
create function public.is_participant() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.participants p where p.user_id = auth.uid() and p.active);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.participants p where p.user_id = auth.uid() and p.active and p.role = 'admin');
$$;

create function public.is_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select now() >= (select opens_at from public.settings where id = 1);
$$;

-- État vu par l'application (heure du serveur, ouverture, statut du participant)
create function public.get_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'server_now', now(),
    'opens_at', (select opens_at from public.settings where id = 1),
    'is_open', public.is_open(),
    'is_participant', public.is_participant(),
    'is_admin', public.is_admin(),
    'display_name', (select display_name from public.participants where user_id = auth.uid()),
    'has_submitted', exists (select 1 from public.submissions where user_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Lecture (RLS)
-- ---------------------------------------------------------------------------
create policy participants_read on public.participants for select to authenticated
  using (public.is_participant());

create policy submissions_read on public.submissions for select to authenticated
  using (public.is_participant() and public.is_open());

create policy syntheses_read on public.syntheses for select to authenticated
  using (public.is_participant() and public.is_open());

create policy sync_read on public.sync_state for select to authenticated
  using (public.is_participant());

-- ---------------------------------------------------------------------------
-- Protection des données transmises
-- ---------------------------------------------------------------------------
create function public.tg_forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Les réponses transmises ne peuvent pas être modifiées' using errcode = '42501';
end $$;

create trigger submissions_no_update before update on public.submissions
  for each row execute function public.tg_forbid_change();
create trigger syntheses_no_update before update on public.syntheses
  for each row execute function public.tg_forbid_change();

create function public.tg_touch_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.sync_state set changed_at = now() where id = 1;
  return null;
end $$;
create trigger submissions_sync after insert or delete on public.submissions
  for each statement execute function public.tg_touch_sync();
create trigger syntheses_sync after insert on public.syntheses
  for each statement execute function public.tg_touch_sync();

-- ---------------------------------------------------------------------------
-- Transmission : validation complète du fichier côté serveur
-- Erreurs : PT401 non autorisé, PT403 pas encore ouvert, PT409 déjà transmis, PT422 fichier invalide
-- ---------------------------------------------------------------------------
create function public.submit_responses(p_file jsonb)
returns public.submissions
language plpgsql security definer set search_path = '' as $$
declare
  v_ids constant text[] := array[
    'c1-historique','c1-projets','c1-specialites','c1-produits','c1-fonctionnement',
    'c2-court','c2-moyen','c2-long','c2-deleguer','c2-evolutions','c2-temps',
    'c3-qualite','c3-documentation','c3-relation','c3-autonomie','c3-imprevus','c3-outils','c3-decision',
    'c4-materiel','c4-locaux','c4-equipe','c4-collaborateurs','c4-partenaires','c4-reseau','c4-outils',
    'c4-comp-tech','c4-comp-com','c4-comp-admin','c4-comp-orga'];
  v_answers jsonb := '{}'::jsonb;
  v_cat jsonb;
  v_item jsonb;
  v_name text;
  v_updated timestamptz;
  r public.submissions;
begin
  if not public.is_participant() then
    raise exception 'Compte non autorisé' using errcode = 'PT401';
  end if;
  if not public.is_open() then
    raise exception 'La mise en commun n''est pas encore ouverte' using errcode = 'PT403';
  end if;
  perform pg_advisory_xact_lock(hashtext('submit:' || auth.uid()::text));
  if exists (select 1 from public.submissions where user_id = auth.uid()) then
    raise exception 'Tes réponses ont déjà été transmises' using errcode = 'PT409';
  end if;

  -- Validation du format
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

create function public.publish_synthesis(p_content text, p_ai_assisted boolean)
returns public.syntheses
language plpgsql security definer set search_path = '' as $$
declare r public.syntheses;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = 'PT401';
  end if;
  if not public.is_open() then
    raise exception 'La mise en commun n''est pas encore ouverte' using errcode = 'PT403';
  end if;
  if p_ai_assisted is null then
    raise exception 'Indiquer si la synthèse a été mise en forme par IA' using errcode = 'PT422';
  end if;
  insert into public.syntheses (content, ai_assisted, published_by)
  values (btrim(p_content), p_ai_assisted, auth.uid()) returning * into r;
  return r;
end $$;

-- Chaque compte créé par l'administrateur (inscription publique désactivée) devient participant
create function public.tg_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.participants (user_id, display_name)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                                split_part(new.email, '@', 1), 'Participant'), 80))
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- ---------------------------------------------------------------------------
-- EXECUTE : uniquement pour les utilisateurs connectés, uniquement le nécessaire
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.get_status(), public.is_participant(), public.is_admin(), public.is_open(),
                          public.submit_responses(jsonb), public.publish_synthesis(text, boolean)
  to authenticated;

alter publication supabase_realtime add table public.sync_state;
