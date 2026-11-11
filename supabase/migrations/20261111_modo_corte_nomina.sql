-- ============================================================================
-- MIGRACIÓN: Interruptor Maestro de "Modo Corte de Nómina"
-- (Pausa Temporal de Compras y Cobros)
-- ============================================================================
-- REGLA DE ORO: 100% ADITIVA Y NO DESTRUCTIVA.
-- No altera saldos, historiales ni esquemas existentes en Supabase Pro.
-- ============================================================================

-- 1. REGISTRO EN BASE DE DATOS (feature_flags)
INSERT INTO feature_flags (modulo_id, activo, descripcion, mensaje_bloqueo)
VALUES (
  'operaciones_compras_activas',
  TRUE,
  'Control global de compras y cobros (Pausa por Corte de Nómina)',
  'Estamos realizando el corte y conciliación de nómina. Las compras y cobros estarán disponibles nuevamente en breve (aprox. 1 a 2 horas).'
)
ON CONFLICT (modulo_id) DO NOTHING;

-- Asegurar políticas RLS en feature_flags para lectura y actualización en tiempo real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feature_flags' AND policyname = 'Permitir insert feature_flags'
  ) THEN
    CREATE POLICY "Permitir insert feature_flags"
      ON feature_flags FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- 2. BLINDAJE EN EL BACKEND (SEGURIDAD EN SUPABASE RPC / TRIGGERS)
-- Función centralizada que verifica si 'operaciones_compras_activas' está en TRUE.
-- Si es FALSE, aborta cualquier intento de transacción/cobro/desembolso con RAISE EXCEPTION
-- devolviendo el mensaje de pausa temporal al frontend (incluso si el usuario tenía el QR abierto antes).
CREATE OR REPLACE FUNCTION verificar_operaciones_compras_activas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activo BOOLEAN := TRUE;
  v_mensaje TEXT;
BEGIN
  SELECT activo, mensaje_bloqueo
    INTO v_activo, v_mensaje
    FROM feature_flags
   WHERE modulo_id = 'operaciones_compras_activas'
   LIMIT 1;

  IF FOUND AND v_activo IS FALSE THEN
    RAISE EXCEPTION '%', COALESCE(
      NULLIF(BTRIM(v_mensaje), ''),
      '⏸️ Pausa Temporal por Corte de Nómina: Estamos realizando el corte y conciliación de nómina. Las compras y cobros estarán disponibles nuevamente en breve.'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger BEFORE INSERT en transacciones_credicrc (bloquea cualquier cobro POS / QR durante el corte)
DROP TRIGGER IF EXISTS trg_bloqueo_corte_nomina_transacciones ON transacciones_credicrc;
CREATE TRIGGER trg_bloqueo_corte_nomina_transacciones
  BEFORE INSERT ON transacciones_credicrc
  FOR EACH ROW
  EXECUTE FUNCTION verificar_operaciones_compras_activas();

-- Trigger BEFORE INSERT en qr_tokens_credicrc (bloquea generación de nuevos QR durante el corte, si existe la tabla)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'qr_tokens_credicrc') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_bloqueo_corte_nomina_qr ON qr_tokens_credicrc';
    EXECUTE 'CREATE TRIGGER trg_bloqueo_corte_nomina_qr BEFORE INSERT ON qr_tokens_credicrc FOR EACH ROW EXECUTE FUNCTION verificar_operaciones_compras_activas()';
  END IF;
END $$;

-- Trigger BEFORE INSERT en orders (bloquea pedidos de Tienda Online durante el corte)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_bloqueo_corte_nomina_orders ON orders';
    EXECUTE 'CREATE TRIGGER trg_bloqueo_corte_nomina_orders BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION verificar_operaciones_compras_activas()';
  END IF;
END $$;

-- Trigger BEFORE INSERT en avance_efectivo_solicitudes (bloquea nuevas solicitudes de avance durante el corte)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'avance_efectivo_solicitudes') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_bloqueo_corte_nomina_avances ON avance_efectivo_solicitudes';
    EXECUTE 'CREATE TRIGGER trg_bloqueo_corte_nomina_avances BEFORE INSERT ON avance_efectivo_solicitudes FOR EACH ROW EXECUTE FUNCTION verificar_operaciones_compras_activas()';
  END IF;
END $$;

-- Trigger BEFORE INSERT enavance_efectivo_cuotas (bloquea desembolsos de avances durante el corte)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'avance_efectivo_cuotas') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_bloqueo_corte_nomina_avance_cuotas ON avance_efectivo_cuotas';
    EXECUTE 'CREATE TRIGGER trg_bloqueo_corte_nomina_avance_cuotas BEFORE INSERT ON avance_efectivo_cuotas FOR EACH ROW EXECUTE FUNCTION verificar_operaciones_compras_activas()';
  END IF;
END $$;
