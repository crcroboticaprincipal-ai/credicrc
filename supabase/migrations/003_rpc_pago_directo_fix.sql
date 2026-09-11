-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 003: RPC procesar_pago_directo — Corrección Anti-Doble Acreditación
-- Añade: FOR UPDATE lock + verificación de idempotencia
-- SEGURIDAD CRÍTICA: Este RPC es el ÚNICO punto donde se modifica limite_disponible
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION procesar_pago_directo(p_pago_directo_id UUID)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_pago   pagos_directos_credicrc%ROWTYPE;
  v_cuota  cronograma_cuotas%ROWTYPE;
BEGIN
  -- ══ LOCK EXCLUSIVO: Previene doble ejecución concurrente (doble-click del admin) ══
  SELECT * INTO v_pago
  FROM pagos_directos_credicrc
  WHERE id = p_pago_directo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Pago no encontrado.';
    RETURN;
  END IF;

  -- ══ IDEMPOTENCIA: Si ya fue procesado, retornar sin re-acreditar ══
  IF v_pago.estatus != 'Pendiente' THEN
    RETURN QUERY SELECT false,
      format('Este pago ya fue procesado anteriormente (estado: %s). No se realizó ningún cambio.', v_pago.estatus);
    RETURN;
  END IF;

  -- Obtener datos de la cuota vinculada
  SELECT * INTO v_cuota
  FROM cronograma_cuotas
  WHERE id = v_pago.cuota_id
  FOR UPDATE;

  -- ══ ACTUALIZACIÓN ATÓMICA (todo o nada) ══

  -- 1. Marcar el pago como Verificado
  UPDATE pagos_directos_credicrc
  SET estatus = 'Verificado', updated_at = NOW()
  WHERE id = p_pago_directo_id;

  -- 2. Marcar la cuota como Pagado Directo
  UPDATE cronograma_cuotas
  SET estatus = 'Pagado Directo',
      fecha_pago_real = NOW(),
      tasa_bcv_pago = (SELECT 36.85), -- se actualizará con valor real desde frontend si disponible
      monto_ves_pagado = v_pago.monto_usd * 36.85
  WHERE id = v_pago.cuota_id;

  -- 3. Restaurar límite disponible UNA SOLA VEZ
  UPDATE trabajadores_crc
  SET limite_disponible = LEAST(limite_total, limite_disponible + v_pago.monto_usd)
  WHERE id = v_pago.trabajador_id;

  RETURN QUERY SELECT true,
    format('✅ Pago de $%s USD confirmado. Cupo restaurado al trabajador.', v_pago.monto_usd::TEXT);
END;
$$;

-- ══ Columna updated_at en pagos_directos_credicrc (si no existe) ══
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pagos_directos_credicrc' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE pagos_directos_credicrc ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END;
$$;
