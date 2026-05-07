-- =============================================================
-- BOTIQUIM BAR — Schema do banco de dados (Supabase / PostgreSQL)
-- Execute este script no SQL Editor do seu projeto Supabase
-- =============================================================

-- Habilitar extensão para UUIDs
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null,
  cpf         text unique not null,
  email       text not null,
  birth_date  date not null,
  instagram   text,
  prize_code  text,
  prize_name  text,
  created_at  timestamptz default now()
);

create index if not exists idx_customers_cpf       on customers (cpf);
create index if not exists idx_customers_created   on customers (created_at);
create index if not exists idx_customers_birth     on customers (birth_date);

-- ---------------------------------------------------------------
-- CÓDIGOS DE PRÊMIO
-- ---------------------------------------------------------------
create table if not exists prize_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  customer_cpf        text references customers (cpf) on delete cascade,
  customer_name       text,
  customer_phone      text,
  prize_name          text not null,
  prize_how           text not null,
  prize_validity_hours int default 24,
  created_at          timestamptz default now(),
  expires_at          timestamptz not null,
  redeemed            boolean default false,
  redeemed_at         timestamptz,
  redeemed_by         text
);

create index if not exists idx_codes_code      on prize_codes (code);
create index if not exists idx_codes_cpf       on prize_codes (customer_cpf);
create index if not exists idx_codes_redeemed  on prize_codes (redeemed);
create index if not exists idx_codes_created   on prize_codes (created_at);

-- ---------------------------------------------------------------
-- PRÊMIOS CONFIGURÁVEIS
-- ---------------------------------------------------------------
create table if not exists prizes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  short         text,
  how           text not null,
  sub           text,
  color         text default '#1D9E75',
  weight        int default 10,
  validity_hours int default 24,
  enabled       boolean default true,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

-- ---------------------------------------------------------------
-- CONFIGURAÇÕES GERAIS
-- ---------------------------------------------------------------
create table if not exists config (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------
-- PRÊMIOS PADRÃO
-- ---------------------------------------------------------------
insert into prizes (name, short, how, sub, color, weight, validity_hours, enabled, sort_order) values
  ('Chopp grátis!',      'Chopp\ngrátis!',   'Peça ao barman 1 chopp do nosso cardápio.',                       'Comemore a chegada com a gente!',   '#1D9E75', 10, 24, true, 1),
  ('Drink especial',     'Drink\nespecial',  'Escolha qualquer drink do cardápio e apresente o código.',         'Escolha o seu favorito!',           '#7F77DD', 13, 24, true, 2),
  ('Petisco grátis',     'Petisco\ngrátis!', 'Escolha 1 petisco do cardápio e apresente o código ao garçom.',   'Aperitivo por conta da casa!',      '#EF9F27', 15, 24, true, 3),
  ('10% de desconto',    '10%\ndesconto',    'Apresente o código ao garçom antes de fechar a conta.',           'Na sua conta de hoje!',             '#378ADD', 22, 24, true, 4),
  ('2 drinks por 1',     '2x1\ndrinks',      'Peça 2 drinks da mesma categoria e pague apenas 1.',              'Dobre a diversão!',                 '#D85A30',  8, 24, true, 5),
  ('20% de desconto',    '20%\ndesconto',    'Apresente o código ao garçom antes de fechar a conta.',           'Economize na conta!',               '#639922', 17, 24, true, 6),
  ('Brinde surpresa',    'Brinde\nsurpresa', 'Fale com o barman e apresente o código para receber seu brinde.', 'Uma surpresa especial!',            '#D4537E',  8, 24, true, 7),
  ('Shot grátis!',       'Shot\ngrátis!',    'Peça ao barman 1 shot da seleção do dia.',                        'Um brinde especial!',               '#BA7517',  7, 24, true, 8)
on conflict do nothing;

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY (desabilite para simplificar com service role)
-- ---------------------------------------------------------------
alter table customers   disable row level security;
alter table prize_codes disable row level security;
alter table prizes      disable row level security;
alter table config      disable row level security;
