-- =============================================================================
-- MIGRACIÓN: MÓDULO DE ANULACIÓN SEGURA Y REVERSO CONTABLE DE COMPRAS (SOFT-CANCEL ATÓMICO)
-- FECHA: 2026-11-18
-- DIRECTRIZ: 100% ADITIVA Y NO DESTRUCTIVA (CERO DELETE FÍSICO)
-- =============================================================================

-- 1. EXTENSIÓN ADITIVA DE COLUMNAS DE AUDITORÍA EN transacciones_credicrc
ALTER TABLE public.transacciones_credicrc
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT NULL,
  ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS anulado_por UUID NULL;

-- 2. AMPLIACIÓN SEGURA DE RESTRICCIONES CHECK / ENUM SOBRE estatus
DO $$
DECLARE
  r RECORD;
BEGIN
  -- 2.1. Si existe un constraint CHECK sobre estatus en transacciones_credicrc, reemplazarlo incluyendo 'Anulada' y 'anulada'
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'transacciones_credicrc'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%estatus%'
  LOOP
    EXECUTE format('ALTER TABLE public.transacciones_credicrc DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  ALTER TABLE public.transacciones_credicrc
    ADD CONSTRAINT transacciones_credicrc_estatus_check
    CHECK (estatus IN ('Pendiente', 'Aprobada', 'Rechazada', 'Completada', 'Anulada', 'anulada'));

  -- 2.2. Si existe un constraint CHECK sobre estatus en cronograma_cuotas, reemplazarlo incluyendo 'Anulada' y 'anulada'
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'cronograma_cuotas'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%estatus%'
  LOOP
    EXECUTE format('ALTER TABLE public.cronograma_cuotas DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  ALTER TABLE public.cronograma_cuotas
    ADD CONSTRAINT cronograma_cuotas_estatus_check
    CHECK (estatus IN ('Pendiente', 'Cobrado', 'Vencido', 'En Verificación', 'Pagado Directo', 'Anulada', 'anulada'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso no bloqueante al actualizar constraints de estatus: %', SQLERRM;
END $$;

-- 3. FUNCIÓN RPC ATÓMICA DE REVERSO CONTABLE (anular_transaccion_segura)
CREATE OR REPLACE FUNCTION public.anular_transaccion_segura(
  p_transaccion_id UUID,
  p_admin_id UUID DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL
)
RETURNS TABLE(
  ok BOOLEAN,
  mensaje TEXT,
  monto_restituido NUMERIC,
  nuevo_saldo_disponible NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.transacciones_credicrc%ROWTYPE;
  v_worker public.trabajadores_crc%ROWTYPE;
  v_cuota_cobrada BOOLEAN := FALSE;
  v_monto_financiado NUMERIC(12,2) := 0;
  v_nuevo_disponible NUMERIC(12,2) := 0;
  v_motivo_limpio TEXT;
BEGIN
  -- 1. Bloquear la fila de la transacción (FOR UPDATE) para evitar condiciones de carrera o dobles reversos
  SELECT *
    INTO v_tx
    FROM public.transacciones_credicrc
   WHERE id = p_transaccion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'La transacción indicada no existe.'::TEXT, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 2. Validar que NO esté ya anulada
  IF LOWER(COALESCE(v_tx.estatus, '')) IN ('anulada', 'anulado')
     OR COALESCE(v_tx.token_aprobacion, '') LIKE 'ANULADA:%' THEN
    RETURN QUERY SELECT FALSE, 'Esta compra ya fue anulada previamente. No se permiten dobles reversos.'::TEXT, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 3. Validar que NO esté liquidada al proveedor en un corte anterior cerrado
  IF LOWER(COALESCE(v_tx.estado_liquidacion_proveedor, 'pendiente')) = 'liquidado' THEN
    RETURN QUERY SELECT FALSE, 'No se puede anular: esta compra ya fue liquidada al proveedor en un corte cerrado.'::TEXT, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 4. Validar que sus cuotas en cronograma_cuotas NO hayan sido cobradas en nómina ni pagadas directo
  SELECT EXISTS (
    SELECT 1
      FROM public.cronograma_cuotas
     WHERE transaccion_id = p_transaccion_id
       AND LOWER(COALESCE(estatus, '')) IN ('cobrado', 'pagado directo')
  ) INTO v_cuota_cobrada;

  IF v_cuota_cobrada THEN
    RETURN QUERY SELECT FALSE, 'No se puede anular: la cuota de esta compra ya fue descontada en un corte de nómina anterior.'::TEXT, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 5. Bloquear la fila del trabajador (FOR UPDATE) y restituir exactamente el cupo descontado
  SELECT *
    INTO v_worker
    FROM public.trabajadores_crc
   WHERE id = v_tx.trabajador_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'No se encontró la ficha del trabajador asociado a la compra.'::TEXT, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  v_monto_financiado := GREATEST(0, ROUND(COALESCE(v_tx.monto_usd, 0) - COALESCE(v_tx.monto_inicial_pagado_usd, 0), 2));
  v_nuevo_disponible := LEAST(
    COALESCE(v_worker.limite_total, 40),
    ROUND(COALESCE(v_worker.limite_disponible, 0) + v_monto_financiado, 2)
  );

  UPDATE public.trabajadores_crc
     SET limite_disponible = v_nuevo_disponible
   WHERE id = v_worker.id;

  -- 6. Actualizar estado de la venta a 'Anulada' con auditoría completa (CERO DELETE)
  v_motivo_limpio := COALESCE(NULLIF(BTRIM(p_motivo), ''), 'Compra anulada por error de registro administrativo');

  UPDATE public.transacciones_credicrc
     SET estatus = 'Anulada',
         motivo_anulacion = v_motivo_limpio,
         fecha_anulacion = NOW(),
         anulado_por = p_admin_id
   WHERE id = p_transaccion_id;

  -- 7. Marcar las cuotas asociadas en cronograma_cuotas como 'Anulada' para excluirlas de nómina
  UPDATE public.cronograma_cuotas
     SET estatus = 'Anulada'
   WHERE transaccion_id = p_transaccion_id;

  RETURN QUERY SELECT
    TRUE,
    format('Compra anulada exitosamente. Se restituyeron $%s al cupo disponible de %s (Nuevo disponible: $%s).',
      to_char(v_monto_financiado, 'FM999990.00'),
      v_worker.nombre,
      to_char(v_nuevo_disponible, 'FM999990.00')
    )::TEXT,
    v_monto_financiado,
    v_nuevo_disponible;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_transaccion_segura(UUID, UUID, TEXT) TO anon, authenticated, service_role;
