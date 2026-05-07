-- =============================================================
-- MIGRAÇÃO V3 — Botiquim Bar
-- Execute no SQL Editor do Supabase APÓS migration_v2.sql
-- =============================================================

-- ---------------------------------------------------------------
-- USUÁRIOS DO SISTEMA
-- ---------------------------------------------------------------
create table if not exists users (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  username     text unique not null,
  password_hash text not null,
  role         text not null default 'employee',  -- 'manager' | 'employee'
  active       boolean default true,
  last_seen    timestamptz,
  created_at   timestamptz default now(),
  created_by   uuid
);

create index if not exists idx_users_username on users(username);
create index if not exists idx_users_role     on users(role);
alter table users disable row level security;

-- ---------------------------------------------------------------
-- SESSÕES / HISTÓRICO DE ACESSO
-- ---------------------------------------------------------------
create table if not exists user_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  ip         text,
  created_at timestamptz default now()
);

create index if not exists idx_sessions_user on user_sessions(user_id);
alter table user_sessions disable row level security;

-- ---------------------------------------------------------------
-- ATUALIZAR prize_codes — registrar quem resgatou
-- ---------------------------------------------------------------
alter table prize_codes
  add column if not exists redeemed_by_user_id uuid,
  add column if not exists redeemed_by_name    text;

-- ---------------------------------------------------------------
-- ATUALIZAR prizes — adicionar valor estimado para analítico
-- ---------------------------------------------------------------
alter table prizes
  add column if not exists estimated_value numeric(10,2) default 0;

-- ---------------------------------------------------------------
-- USUÁRIO GESTOR PADRÃO
-- (senha: gestor123 — hashada com SHA-512 + salt padrão)
-- O hash real será gerado pelo sistema na primeira chamada.
-- Este insert serve como placeholder; o sistema usa env vars como fallback.
-- ---------------------------------------------------------------
-- Nota: não inserimos usuário aqui pois o hash depende do JWT_SECRET do ambiente.
-- O gestor cria os usuários pelo painel após o primeiro login com a senha padrão.
