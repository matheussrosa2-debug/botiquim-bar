-- =============================================================
-- MIGRAÇÃO — Adicionar tabela de eventos ao Botiquim Bar
-- Execute este script no SQL Editor do Supabase
-- (além do schema.sql original, ou depois dele)
-- =============================================================

-- ---------------------------------------------------------------
-- EVENTOS
-- ---------------------------------------------------------------
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  date        date,
  active      boolean default false,
  created_at  timestamptz default now()
);

create index if not exists idx_events_active on events (active);

-- Adicionar coluna event_id e event_name na tabela de clientes
alter table customers
  add column if not exists event_id   uuid references events (id) on delete set null,
  add column if not exists event_name text;

-- Adicionar coluna event_id e event_name nos códigos (para relatórios)
alter table prize_codes
  add column if not exists event_id   uuid,
  add column if not exists event_name text;

-- Índice para busca por evento
create index if not exists idx_customers_event on customers (event_id);

-- Desabilitar RLS (mesma política do schema original)
alter table events disable row level security;

-- Evento padrão de exemplo
insert into events (name, description, date, active)
values ('Inauguração do Botiquim Bar', 'Evento de abertura do bar', current_date, true)
on conflict do nothing;
