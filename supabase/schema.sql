-- ============================================================================
--  Ma Bibliothèque BD — Schéma Supabase (Postgres)
--  Multi-utilisateurs : chaque ligne est liée à auth.users via user_id.
--  Row Level Security : un utilisateur ne voit/modifie QUE ses propres données.
--  À exécuter dans Supabase > SQL Editor (une seule fois).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) TABLE books : les albums de la collection
-- ---------------------------------------------------------------------------
create table if not exists public.books (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  titre         text not null default '',
  serie         text default '',
  tome          integer,                       -- null si hors-série / inconnu
  auteur        text default '',
  editeur       text default '',
  annee         integer,
  isbn          text default '',
  statut        text not null default 'jai',   -- jai | lu | en-cours | a-lire | veux | a-confirmer
  note          integer default 0,             -- 0..5
  commentaire   text default '',
  cover         text default '',               -- URL ou dataURL basse résolution
  cover_ok      boolean default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) TABLE ref_catalog : catalogue de référence local (CSV BDGest importé)
--    Sert de source de recherche prioritaire. Privé par utilisateur.
-- ---------------------------------------------------------------------------
create table if not exists public.ref_catalog (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  titre      text default '',
  serie      text default '',
  tome       integer,
  auteur     text default '',
  editeur    text default '',
  annee      text default '',
  isbn       text default '',
  cover      text default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3) TABLE series_meta : métadonnées par série (total de tomes Wikipédia…)
--    Une ligne par (user_id, serie_key).
-- ---------------------------------------------------------------------------
create table if not exists public.series_meta (
  user_id    uuid not null references auth.users(id) on delete cascade,
  serie_key  text not null,                    -- nom de série normalisé
  total      integer,                          -- nombre total de tomes (null = inconnu)
  source     text default '',                  -- ex. 'wikipedia:...'
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, serie_key)
);

-- ---------------------------------------------------------------------------
-- 4) TABLE blacklist : séries / albums à ne plus proposer
--    kind = 'serie' (key = nom normalisé) | 'album' (key = isbn:... ou t:titre|tome)
-- ---------------------------------------------------------------------------
create table if not exists public.blacklist (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('serie','album')),
  key        text not null,
  label      text default '',                  -- libellé lisible
  serie      text default '',
  tome       integer,
  isbn       text default '',
  added_at   timestamptz not null default now(),
  primary key (user_id, kind, key)
);

-- ---------------------------------------------------------------------------
--  INDEX utiles
-- ---------------------------------------------------------------------------
create index if not exists books_user_idx       on public.books(user_id);
create index if not exists books_user_statut_idx on public.books(user_id, statut);
create index if not exists books_user_serie_idx  on public.books(user_id, serie);
create index if not exists refcat_user_idx       on public.ref_catalog(user_id);

-- ---------------------------------------------------------------------------
--  updated_at automatique sur books
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books
  for each row execute function public.touch_updated_at();

-- ============================================================================
--  ROW LEVEL SECURITY : chaque utilisateur ne voit que ses lignes
-- ============================================================================
alter table public.books       enable row level security;
alter table public.ref_catalog enable row level security;
alter table public.series_meta enable row level security;
alter table public.blacklist   enable row level security;

-- Policies génériques : auth.uid() = user_id pour toutes les opérations.
-- books
drop policy if exists books_sel on public.books;
drop policy if exists books_ins on public.books;
drop policy if exists books_upd on public.books;
drop policy if exists books_del on public.books;
create policy books_sel on public.books for select using (auth.uid() = user_id);
create policy books_ins on public.books for insert with check (auth.uid() = user_id);
create policy books_upd on public.books for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy books_del on public.books for delete using (auth.uid() = user_id);

-- ref_catalog
drop policy if exists refcat_sel on public.ref_catalog;
drop policy if exists refcat_ins on public.ref_catalog;
drop policy if exists refcat_upd on public.ref_catalog;
drop policy if exists refcat_del on public.ref_catalog;
create policy refcat_sel on public.ref_catalog for select using (auth.uid() = user_id);
create policy refcat_ins on public.ref_catalog for insert with check (auth.uid() = user_id);
create policy refcat_upd on public.ref_catalog for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy refcat_del on public.ref_catalog for delete using (auth.uid() = user_id);

-- series_meta
drop policy if exists smeta_sel on public.series_meta;
drop policy if exists smeta_ins on public.series_meta;
drop policy if exists smeta_upd on public.series_meta;
drop policy if exists smeta_del on public.series_meta;
create policy smeta_sel on public.series_meta for select using (auth.uid() = user_id);
create policy smeta_ins on public.series_meta for insert with check (auth.uid() = user_id);
create policy smeta_upd on public.series_meta for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy smeta_del on public.series_meta for delete using (auth.uid() = user_id);

-- blacklist
drop policy if exists bl_sel on public.blacklist;
drop policy if exists bl_ins on public.blacklist;
drop policy if exists bl_upd on public.blacklist;
drop policy if exists bl_del on public.blacklist;
create policy bl_sel on public.blacklist for select using (auth.uid() = user_id);
create policy bl_ins on public.blacklist for insert with check (auth.uid() = user_id);
create policy bl_upd on public.blacklist for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy bl_del on public.blacklist for delete using (auth.uid() = user_id);

-- ============================================================================
--  FIN
-- ============================================================================
