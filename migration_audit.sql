-- ================================================================
-- MIGRAÇÃO — Auditoria de Ações
-- Execute no SQL Editor do Supabase
-- ================================================================

-- Tabela de auditoria — registra toda ação sensível no sistema
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,        -- 'create_user', 'delete_prize', 'redeem_code', 'export', etc.
  entity      text,                  -- 'users', 'prizes', 'prize_codes', etc.
  entity_id   text,                  -- ID do registro afetado
  user_id     uuid,                  -- ID do usuário que fez a ação
  user_name   text,                  -- Nome do usuário
  user_role   text,                  -- 'manager' | 'employee'
  ip          text,                  -- IP de origem
  detail      jsonb,                 -- Detalhes extras (ex: { "prize": "Chopp grátis" })
  created_at  timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at DESC);

-- RLS — somente service_role acessa
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon" ON audit_log FOR ALL TO anon USING (false) WITH CHECK (false);

-- Adicionar imagem aos prêmios
ALTER TABLE prizes ADD COLUMN IF NOT EXISTS image_url text;
