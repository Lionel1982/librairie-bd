-- ============================================================================
--  Catalogue BD COMMUN PARTAGÉ (métadonnées par ISBN, lisible par TOUS)
--  À exécuter dans Supabase > SQL Editor.
--  Principe : les métadonnées d'un album (titre, série, auteur, éditeur,
--  année, couverture) sont universelles -> mutualisées entre utilisateurs.
--  La collection privée (statut/note) reste dans public.books (RLS par user).
-- ============================================================================

create table if not exists public.bd_catalog (
  isbn        text primary key,              -- ISBN-13 normalisé = clé universelle
  titre       text default '',
  serie       text default '',
  tome        integer,
  auteur      text default '',
  editeur     text default '',
  annee       text default '',
  cover       text default '',
  source      text default '',               -- ex. 'bnf', 'google', 'scan'
  updated_at  timestamptz not null default now(),
  updated_by  uuid                            -- qui a renseigné (traçabilité, non restrictif)
);

create index if not exists bd_catalog_serie_idx on public.bd_catalog(serie);

-- updated_at auto
create or replace function public.touch_bd_catalog()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists bd_catalog_touch on public.bd_catalog;
create trigger bd_catalog_touch before update on public.bd_catalog
  for each row execute function public.touch_bd_catalog();

-- ============================================================================
--  RLS : lecture pour TOUS (même non connecté), écriture pour utilisateurs
--  connectés (insert + update), PAS de delete (on ne vide pas le bien commun).
-- ============================================================================
alter table public.bd_catalog enable row level security;

drop policy if exists bdcat_sel on public.bd_catalog;
drop policy if exists bdcat_ins on public.bd_catalog;
drop policy if exists bdcat_upd on public.bd_catalog;

-- lecture : tout le monde (anon + authenticated)
create policy bdcat_sel on public.bd_catalog for select using (true);
-- insertion : tout utilisateur connecté
create policy bdcat_ins on public.bd_catalog for insert to authenticated with check (true);
-- mise à jour : tout utilisateur connecté (compléter/améliorer une fiche)
create policy bdcat_upd on public.bd_catalog for update to authenticated using (true) with check (true);

-- (pas de policy delete -> personne ne peut supprimer une entrée du catalogue commun)
