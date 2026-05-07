-- ================================================================
-- SEGURANÇA — Row Level Security (RLS)
-- Execute no SQL Editor do Supabase
-- Bloqueia acesso direto via chave anon ao banco de dados
-- O service_role (usado no servidor) bypassa RLS automaticamente
-- ================================================================

-- ── Habilitar RLS em todas as tabelas ────────────────────────────
ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prizes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts   ENABLE ROW LEVEL SECURITY;

-- Tabelas da migration_v2 (se já executada)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'whatsapp_config') THEN
    ALTER TABLE whatsapp_config   ENABLE ROW LEVEL SECURITY;
    ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE prize_issuances   ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Tabelas da migration_v3 (se já executada)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
    ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ── Bloquear todo acesso da chave anon (pública) ──────────────────
-- A chave anon fica exposta no front-end e não deve ter acesso direto

CREATE POLICY "deny_anon" ON customers        FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon" ON prize_codes      FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon" ON prizes           FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon" ON events           FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon" ON config           FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon" ON login_attempts   FOR ALL TO anon USING (false) WITH CHECK (false);

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'whatsapp_config') THEN
    EXECUTE 'CREATE POLICY "deny_anon" ON whatsapp_config   FOR ALL TO anon USING (false) WITH CHECK (false)';
    EXECUTE 'CREATE POLICY "deny_anon" ON whatsapp_messages FOR ALL TO anon USING (false) WITH CHECK (false)';
    EXECUTE 'CREATE POLICY "deny_anon" ON whatsapp_templates FOR ALL TO anon USING (false) WITH CHECK (false)';
    EXECUTE 'CREATE POLICY "deny_anon" ON prize_issuances   FOR ALL TO anon USING (false) WITH CHECK (false)';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
    EXECUTE 'CREATE POLICY "deny_anon" ON users         FOR ALL TO anon USING (false) WITH CHECK (false)';
    EXECUTE 'CREATE POLICY "deny_anon" ON user_sessions FOR ALL TO anon USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- ── Verificação ───────────────────────────────────────────────────
-- Execute esta query para confirmar que o RLS está ativo:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
