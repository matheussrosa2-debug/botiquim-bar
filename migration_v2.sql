-- =============================================================
-- MIGRAÇÃO V2 — Botiquim Bar
-- Execute no SQL Editor do Supabase APÓS o schema.sql original
-- =============================================================

-- ---------------------------------------------------------------
-- EVENTOS (completo — substitui migration_events.sql)
-- ---------------------------------------------------------------
create table if not exists events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  date             date,
  active           boolean default false,
  slug             text unique,
  qr_color         text default '#000000',
  qr_bg_color      text default '#ffffff',
  custom_prize_id  uuid,
  qr_downloads     int default 0,
  created_at       timestamptz default now()
);
create index if not exists idx_events_active on events (active);
create index if not exists idx_events_slug   on events (slug);
alter table events disable row level security;

-- Adicionar colunas de evento nos clientes
alter table customers
  add column if not exists event_id          uuid references events(id) on delete set null,
  add column if not exists event_name        text,
  add column if not exists lgpd_consent      boolean not null default false,
  add column if not exists lgpd_consent_at   timestamptz,
  add column if not exists marketing_consent boolean default false,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists welcome_sent      boolean default false,
  add column if not exists welcome_sent_at   timestamptz,
  add column if not exists birthday_sent_year int,
  add column if not exists deleted_at        timestamptz;

create index if not exists idx_customers_event   on customers(event_id);
create index if not exists idx_customers_birth   on customers(birth_date);
create index if not exists idx_customers_deleted on customers(deleted_at);

-- ---------------------------------------------------------------
-- PRÊMIOS — novos campos de controle de probabilidade e validade
-- ---------------------------------------------------------------
alter table prizes
  add column if not exists limit_type                  text default 'none',
  add column if not exists limit_every_n_registrations int,
  add column if not exists limit_per_period_count      int,
  add column if not exists limit_per_period_type       text default 'day',
  add column if not exists limit_total_count           int,
  add column if not exists schedule_start_hour         int,
  add column if not exists schedule_end_hour           int,
  add column if not exists fallback_prize_id           uuid,
  add column if not exists issued_count                int default 0,
  add column if not exists issued_today                int default 0,
  add column if not exists issued_this_week            int default 0,
  add column if not exists issued_this_month           int default 0,
  add column if not exists last_issued_at              timestamptz,
  add column if not exists validity_type               text default 'hours',
  add column if not exists validity_until              date;

-- ---------------------------------------------------------------
-- CÓDIGOS — tipo de origem
-- ---------------------------------------------------------------
alter table prize_codes
  add column if not exists type         text default 'wheel',
  add column if not exists event_id     uuid,
  add column if not exists event_name   text;

-- ---------------------------------------------------------------
-- HISTÓRICO DE SORTEIOS (auditoria)
-- ---------------------------------------------------------------
create table if not exists prize_issuances (
  id                  uuid primary key default gen_random_uuid(),
  prize_id            uuid references prizes(id) on delete set null,
  customer_cpf        text,
  issued_at           timestamptz default now(),
  registration_number int
);
create index if not exists idx_issuances_prize    on prize_issuances(prize_id);
create index if not exists idx_issuances_customer on prize_issuances(customer_cpf);
alter table prize_issuances disable row level security;

-- ---------------------------------------------------------------
-- CONFIGURAÇÃO WHATSAPP
-- ---------------------------------------------------------------
create table if not exists whatsapp_config (
  id          uuid primary key default gen_random_uuid(),
  instance_id text,
  token       text,
  enabled     boolean default false,
  updated_at  timestamptz default now()
);
alter table whatsapp_config disable row level security;

-- Templates de mensagem editáveis
create table if not exists whatsapp_templates (
  id        uuid primary key default gen_random_uuid(),
  type      text unique not null,
  body      text not null,
  enabled   boolean default true,
  updated_at timestamptz default now()
);
alter table whatsapp_templates disable row level security;

-- Log de mensagens enviadas
create table if not exists whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  customer_cpf  text,
  customer_name text,
  phone         text,
  type          text,
  status        text default 'pending',
  message_text  text,
  sent_at       timestamptz,
  error         text,
  created_at    timestamptz default now()
);
create index if not exists idx_wa_messages_cpf  on whatsapp_messages(customer_cpf);
create index if not exists idx_wa_messages_type on whatsapp_messages(type);
alter table whatsapp_messages disable row level security;

-- ---------------------------------------------------------------
-- TENTATIVAS DE LOGIN (rate limiting)
-- ---------------------------------------------------------------
create table if not exists login_attempts (
  id           uuid primary key default gen_random_uuid(),
  ip           text,
  role         text,
  success      boolean default false,
  attempted_at timestamptz default now()
);
create index if not exists idx_login_ip on login_attempts(ip, attempted_at);
alter table login_attempts disable row level security;

-- ---------------------------------------------------------------
-- TEMPLATES PADRÃO WHATSAPP
-- ---------------------------------------------------------------
insert into whatsapp_templates (type, body, enabled) values
(
  'welcome',
  '🍺 Olá, {primeiro_nome}! Bem-vindo(a) ao *{bar_nome}*!\n\nVocê ganhou: *{premio}* 🎉\n\nSeu código: *{codigo}*\nVálido até: {validade}\n\nApresente este código ao atendente para resgatar. Bom proveito! 🥂',
  true
),
(
  'birthday',
  '🎂 Feliz aniversário, {primeiro_nome}!\n\nO *{bar_nome}* tem um presente especial para você!\n\n🎁 Prêmio: *{premio}*\nCódigo: *{codigo}*\nVálido por {dias_validade} dias\n\nVenha comemorar com a gente! 🥳🍺',
  true
)
on conflict (type) do nothing;

-- ---------------------------------------------------------------
-- EVENTO DE EXEMPLO
-- ---------------------------------------------------------------
insert into events (name, description, date, active, slug)
values ('Cadastro Geral', 'Cadastros do balcão', current_date, true, 'geral')
on conflict do nothing;
