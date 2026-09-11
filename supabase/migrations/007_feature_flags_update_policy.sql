-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 007: Permitir actualización de Feature Flags en RLS y activar todo
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir update feature_flags') THEN
    CREATE POLICY "Permitir update feature_flags" ON feature_flags FOR UPDATE USING (true);
  END IF;
END $$;

UPDATE feature_flags SET activo = true;
