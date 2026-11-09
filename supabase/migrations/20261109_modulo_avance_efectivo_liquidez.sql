-- =============================================================================
-- MIGRACIÓN INTEGRAL: MÓDULO DE AVANCE DE EFECTIVO Y CONSOLA DE PROVEEDOR DE LIQUIDEZ
-- FECHA: 2026-11-09
-- REGLA DE ORO: 100% ADITIVA Y NO DESTRUCTIVA (Sin DROP TABLE ni TRUNCATE).
-- Protege íntegramente saldos activos, los proveedores comerciales existentes y el historial.
-- =============================================================================

BEGIN;

-- ── 1. DIFERENCIACIÓN DE ROL Y TIPO DE PROVEEDOR (AISLAMIENTO DE INTERFAZ) ───
ALTER TABLE proveedores_aliados
  ADD COLUMN IF NOT EXISTS tipo_proveedor TEXT NOT NULL DEFAULT 'comercio';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_proveedores_tipo_proveedor'
  ) THEN
    ALTER TABLE proveedores_aliados
      ADD CONSTRAINT chk_proveedores_tipo_proveedor
      CHECK (tipo_proveedor IN ('comercio', 'liquidez'));
  END IF;
END $$;

-- Actualizar automáticamente cualquier proveedor cuya categoría ya sea de liquidez
UPDATE proveedores_aliados
SET tipo_proveedor = 'liquidez',
    comision_colegio = 0
WHERE categoria IN ('Liquidez / Efectivo', 'Proveedor de Liquidez');

-- Ampliar restricción de rol en usuarios_credicrc si existiera para admitir proveedor_liquidez
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'usuarios_credicrc'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%rol%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE usuarios_credicrc DROP CONSTRAINT %I', v_conname);
    ALTER TABLE usuarios_credicrc
      ADD CONSTRAINT usuarios_credicrc_rol_check
      CHECK (rol IN ('trabajador', 'proveedor', 'proveedor_liquidez', 'admin', 'tesoreria'));
  END IF;
END $$;

-- Asegurar que feature_flags tenga el módulo avance_efectivo registrado
INSERT INTO feature_flags (modulo_id, activo, descripcion, mensaje_bloqueo)
VALUES (
  'avance_efectivo',
  true,
  'Avance de efectivo con cálculo de intereses y Consola de Proveedor de Liquidez',
  'El módulo de Avance de Efectivo estará disponible próximamente.'
)
ON CONFLICT (modulo_id) DO NOTHING;


-- ── 2. CONFIGURADOR DINÁMICO DE CONDICIONES Y TASAS (PROVEEDOR DE LIQUIDEZ) ──
CREATE TABLE IF NOT EXISTS configuracion_liquidez (
  proveedor_id             UUID PRIMARY KEY REFERENCES proveedores_aliados(id) ON DELETE CASCADE,
  recepcion_activa         BOOLEAN NOT NULL DEFAULT true,
  modalidad_recargo        TEXT NOT NULL DEFAULT 'porcentaje'
                           CHECK (modalidad_recargo IN ('porcentaje', 'monto_fijo')),
  tasa_1_cuota             NUMERIC(10,2) NOT NULL DEFAULT 10.00 CHECK (tasa_1_cuota >= 0),
  cargo_minimo_1_cuota_usd NUMERIC(10,2) NOT NULL DEFAULT 1.50  CHECK (cargo_minimo_1_cuota_usd >= 0),
  tasa_2_cuotas            NUMERIC(10,2) NOT NULL DEFAULT 16.00 CHECK (tasa_2_cuotas >= 0),
  tasa_3_cuotas            NUMERIC(10,2) NOT NULL DEFAULT 24.00 CHECK (tasa_3_cuotas >= 0),
  monto_minimo_usd         NUMERIC(10,2) NOT NULL DEFAULT 10.00 CHECK (monto_minimo_usd >= 5.00),
  monto_maximo_usd         NUMERIC(10,2) NOT NULL DEFAULT 40.00 CHECK (monto_maximo_usd <= 40.00),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE configuracion_liquidez ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'configuracion_liquidez' AND policyname = 'Lectura configuracion_liquidez') THEN
    CREATE POLICY "Lectura configuracion_liquidez"
      ON configuracion_liquidez FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'configuracion_liquidez' AND policyname = 'Escritura configuracion_liquidez') THEN
    CREATE POLICY "Escritura configuracion_liquidez"
      ON configuracion_liquidez FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── 3. COLUMNAS ADITIVAS EN SOLICITUDES Y CUOTAS DE AVANCE DE EFECTIVO ───────
ALTER TABLE avance_efectivo_solicitudes
  ADD COLUMN IF NOT EXISTS banco_trabajador      TEXT,
  ADD COLUMN IF NOT EXISTS telefono_pago_movil   TEXT,
  ADD COLUMN IF NOT EXISTS cedula_pago_movil     TEXT,
  ADD COLUMN IF NOT EXISTS referencia_desembolso TEXT,
  ADD COLUMN IF NOT EXISTS fecha_desembolso      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_rechazo        TEXT;

-- Ampliar estados permitidos en avance_efectivo_solicitudes para incluir 'Desembolsado'
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'avance_efectivo_solicitudes'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%estatus%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE avance_efectivo_solicitudes DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE avance_efectivo_solicitudes
    ADD CONSTRAINT avance_efectivo_solicitudes_estatus_check
    CHECK (estatus IN ('Pendiente', 'Aprobado', 'Desembolsado', 'En Pago', 'Completado', 'Rechazado'));
END $$;

ALTER TABLE avance_efectivo_cuotas
  ADD COLUMN IF NOT EXISTS tasa_bcv_pago    NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS monto_ves_pagado NUMERIC(12,2);

-- Políticas RLS aditivas para operar solicitudes y cuotas de avance de efectivo
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'avance_efectivo_solicitudes' AND policyname = 'Insertar ae_solicitudes') THEN
    CREATE POLICY "Insertar ae_solicitudes"
      ON avance_efectivo_solicitudes FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'avance_efectivo_solicitudes' AND policyname = 'Actualizar ae_solicitudes') THEN
    CREATE POLICY "Actualizar ae_solicitudes"
      ON avance_efectivo_solicitudes FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'avance_efectivo_cuotas' AND policyname = 'Insertar ae_cuotas') THEN
    CREATE POLICY "Insertar ae_cuotas"
      ON avance_efectivo_cuotas FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'avance_efectivo_cuotas' AND policyname = 'Actualizar ae_cuotas') THEN
    CREATE POLICY "Actualizar ae_cuotas"
      ON avance_efectivo_cuotas FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── 4. RPC 1: CREAR SOLICITUD DE AVANCE DE EFECTIVO (SIN DESCONTAR CUPO AÚN) ─
-- Crea la solicitud en estado 'Pendiente' validando el saldo_disponible (limite_disponible)
-- dentro del cupo regular de $40.00. NO altera limite_disponible hasta el desembolso.
CREATE OR REPLACE FUNCTION public.solicitar_avance_efectivo(
  p_trabajador_id       UUID,
  p_proveedor_id        UUID,
  p_monto_capital_usd   NUMERIC,
  p_num_cuotas          INTEGER,
  p_tasa_bcv            NUMERIC,
  p_banco_trabajador    TEXT DEFAULT NULL,
  p_telefono_pago_movil TEXT DEFAULT NULL,
  p_cedula_pago_movil   TEXT DEFAULT NULL,
  p_notas               TEXT DEFAULT NULL
)
RETURNS TABLE(
  ok              BOOLEAN,
  mensaje         TEXT,
  solicitud_id    UUID,
  interes_total   NUMERIC,
  monto_total     NUMERIC,
  cuota_valor     NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trabajador      trabajadores_crc%ROWTYPE;
  v_cfg             configuracion_liquidez%ROWTYPE;
  v_modalidad       TEXT := 'porcentaje';
  v_tasa_1          NUMERIC := 10.00;
  v_piso_1          NUMERIC := 1.50;
  v_tasa_2          NUMERIC := 16.00;
  v_tasa_3          NUMERIC := 24.00;
  v_min_usd         NUMERIC := 10.00;
  v_max_usd         NUMERIC := 40.00;
  v_activa          BOOLEAN := true;
  v_valor_tasa      NUMERIC;
  v_interes_total   NUMERIC;
  v_monto_total     NUMERIC;
  v_cuota_val       NUMERIC;
  v_pendientes_usd  NUMERIC := 0;
  v_disponible_real NUMERIC;
  v_sol_id          UUID;
BEGIN
  -- 1. Bloquear fila del trabajador para lectura consistente
  SELECT * INTO v_trabajador
  FROM trabajadores_crc
  WHERE id = p_trabajador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Trabajador no encontrado.', NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  IF COALESCE(v_trabajador.qr_bloqueado, false) THEN
    RETURN QUERY SELECT false, 'Tu cuenta tiene el crédito bloqueado por retraso de pago.', NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 2. Cargar configuración dinámica del Proveedor de Liquidez (o usar valores por defecto)
  SELECT * INTO v_cfg
  FROM configuracion_liquidez
  WHERE proveedor_id = p_proveedor_id;

  IF FOUND THEN
    v_activa    := v_cfg.recepcion_activa;
    v_modalidad := v_cfg.modalidad_recargo;
    v_tasa_1    := v_cfg.tasa_1_cuota;
    v_piso_1    := v_cfg.cargo_minimo_1_cuota_usd;
    v_tasa_2    := v_cfg.tasa_2_cuotas;
    v_tasa_3    := v_cfg.tasa_3_cuotas;
    v_min_usd   := v_cfg.monto_minimo_usd;
    v_max_usd   := v_cfg.monto_maximo_usd;
  END IF;

  IF NOT v_activa THEN
    RETURN QUERY SELECT false, 'El Proveedor de Liquidez ha pausado temporalmente la recepción de solicitudes.', NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 3. Validaciones de plazo y reglas de negocio
  IF p_num_cuotas NOT IN (1, 2, 3) THEN
    RETURN QUERY SELECT false, 'El plazo debe ser de 1, 2 o 3 cuotas.', NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  IF p_monto_capital_usd < v_min_usd THEN
    RETURN QUERY SELECT false, format('El monto mínimo permitido es de $%s.', trim(to_char(v_min_usd, '999990.00'))), NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  IF p_monto_capital_usd > v_max_usd THEN
    RETURN QUERY SELECT false, format('El monto máximo permitido es de $%s.', trim(to_char(v_max_usd, '999990.00'))), NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Regla estricta: si selecciona el monto mínimo de $10.00, bloquear 3 cuotas
  IF p_monto_capital_usd <= 10.00 AND p_num_cuotas = 3 THEN
    RETURN QUERY SELECT false, 'Para avances de $10.00 solo se permiten plazos de 1 o 2 cuotas.', NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Verificar que no exceda su saldo_disponible (descontando solicitudes pendientes por aprobar)
  SELECT COALESCE(SUM(monto_capital_usd), 0) INTO v_pendientes_usd
  FROM avance_efectivo_solicitudes
  WHERE trabajador_id = p_trabajador_id
    AND estatus = 'Pendiente';

  v_disponible_real := GREATEST(0, v_trabajador.limite_disponible - v_pendientes_usd);

  IF p_monto_capital_usd > v_disponible_real THEN
    RETURN QUERY SELECT false,
      format('Cupo disponible insuficiente. Tienes $%s disponibles en tu límite de crédito.', trim(to_char(v_disponible_real, '999990.00'))),
      NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 4. Cálculo exacto de interés y cuotas según plazo y modalidad
  v_valor_tasa := CASE p_num_cuotas
    WHEN 1 THEN v_tasa_1
    WHEN 2 THEN v_tasa_2
    WHEN 3 THEN v_tasa_3
    ELSE v_tasa_1
  END;

  IF v_modalidad = 'porcentaje' THEN
    v_interes_total := ROUND(p_monto_capital_usd * (v_valor_tasa / 100.0), 2);
    IF p_num_cuotas = 1 THEN
      v_interes_total := GREATEST(v_interes_total, v_piso_1);
    END IF;
  ELSE
    -- Monto fijo ($) configurado para el plazo seleccionado
    v_interes_total := ROUND(v_valor_tasa, 2);
  END IF;

  v_monto_total := ROUND(p_monto_capital_usd + v_interes_total, 2);
  v_cuota_val   := ROUND(v_monto_total / p_num_cuotas, 2);

  -- 5. Insertar solicitud en estado 'Pendiente' SIN alterar todavía limite_disponible
  INSERT INTO avance_efectivo_solicitudes (
    trabajador_id,
    proveedor_liquidez_id,
    monto_capital_usd,
    num_cuotas,
    tipo_interes,
    valor_interes,
    monto_interes_total_usd,
    monto_total_usd,
    valor_cuota_usd,
    tasa_bcv_registro,
    estatus,
    banco_trabajador,
    telefono_pago_movil,
    cedula_pago_movil,
    notas
  ) VALUES (
    p_trabajador_id,
    p_proveedor_id,
    ROUND(p_monto_capital_usd, 2),
    p_num_cuotas,
    v_modalidad,
    v_valor_tasa,
    v_interes_total,
    v_monto_total,
    v_cuota_val,
    p_tasa_bcv,
    'Pendiente',
    p_banco_trabajador,
    p_telefono_pago_movil,
    p_cedula_pago_movil,
    p_notas
  )
  RETURNING id INTO v_sol_id;

  RETURN QUERY SELECT
    true,
    'Solicitud de Avance de Efectivo enviada. Tu cupo se descontará únicamente cuando el Proveedor de Liquidez confirme el desembolso.',
    v_sol_id,
    v_interes_total,
    v_monto_total,
    v_cuota_val;
END;
$$;


-- ── 5. RPC 2: CONFIRMAR DESEMBOLSO (RETENCIÓN ATÓMICA SOLO DE CAPITAL) ───────
-- Cuando el Proveedor de Liquidez transfiere el dinero e ingresa la referencia:
-- 1. Bloquea solicitud y trabajador (FOR UPDATE).
-- 2. Verifica que limite_disponible >= monto_capital_usd.
-- 3. Resta ÚNICAMENTE monto_capital_usd del limite_disponible del trabajador.
-- 4. Genera las cuotas exactas vinculadas a los cortes de nómina (15 y fin de mes).
CREATE OR REPLACE FUNCTION public.desembolsar_avance_efectivo(
  p_solicitud_id        UUID,
  p_referencia_pago     TEXT,
  p_fecha_primera_cuota DATE DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sol             avance_efectivo_solicitudes%ROWTYPE;
  v_trabajador      trabajadores_crc%ROWTYPE;
  v_cap_base        NUMERIC;
  v_int_base        NUMERIC;
  v_cap_acum        NUMERIC := 0;
  v_int_acum        NUMERIC := 0;
  v_cap_i           NUMERIC;
  v_int_i           NUMERIC;
  v_monto_i         NUMERIC;
  v_fecha_base      DATE;
  v_fecha_cobro     DATE;
  i                 INTEGER;
BEGIN
  IF COALESCE(btrim(p_referencia_pago), '') = '' THEN
    RETURN QUERY SELECT false, 'Debes ingresar el número de referencia del Pago Móvil / transferencia.';
    RETURN;
  END IF;

  -- 1. Bloquear la solicitud
  SELECT * INTO v_sol
  FROM avance_efectivo_solicitudes
  WHERE id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Solicitud de avance no encontrada.';
    RETURN;
  END IF;

  IF v_sol.estatus != 'Pendiente' THEN
    RETURN QUERY SELECT false, format('Esta solicitud ya fue procesada (Estado actual: %s).', v_sol.estatus);
    RETURN;
  END IF;

  -- 2. Bloquear la fila del trabajador (FOR UPDATE) y verificar saldo_disponible >= capital
  SELECT * INTO v_trabajador
  FROM trabajadores_crc
  WHERE id = v_sol.trabajador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Trabajador asociado no encontrado.';
    RETURN;
  END IF;

  IF v_trabajador.limite_disponible < v_sol.monto_capital_usd THEN
    RETURN QUERY SELECT false,
      format('El trabajador ya no posee cupo suficiente. Disponible actual: $%s, Capital solicitado: $%s.',
             trim(to_char(v_trabajador.limite_disponible, '999990.00')),
             trim(to_char(v_sol.monto_capital_usd, '999990.00')));
    RETURN;
  END IF;

  -- 3. Retención exclusiva del capital prestado en el límite de $40
  UPDATE trabajadores_crc
  SET limite_disponible = ROUND(GREATEST(0, limite_disponible - v_sol.monto_capital_usd), 2)
  WHERE id = v_sol.trabajador_id;

  -- 4. Actualizar estado de la solicitud a 'En Pago' (Aprobado / Desembolsado)
  UPDATE avance_efectivo_solicitudes
  SET estatus               = 'En Pago',
      referencia_desembolso = btrim(p_referencia_pago),
      fecha_desembolso      = NOW(),
      updated_at            = NOW()
  WHERE id = p_solicitud_id;

  -- 5. Generar el cronograma de cuotas en avance_efectivo_cuotas con cuadre exacto al centavo
  v_fecha_base := COALESCE(p_fecha_primera_cuota, (CURRENT_DATE + INTERVAL '15 days')::DATE);
  v_cap_base   := ROUND(v_sol.monto_capital_usd / v_sol.num_cuotas, 2);
  v_int_base   := ROUND(v_sol.monto_interes_total_usd / v_sol.num_cuotas, 2);

  FOR i IN 1..v_sol.num_cuotas LOOP
    IF i < v_sol.num_cuotas THEN
      v_cap_i := v_cap_base;
      v_int_i := v_int_base;
      v_cap_acum := v_cap_acum + v_cap_i;
      v_int_acum := v_int_acum + v_int_i;
    ELSE
      -- Última cuota absorbe cualquier diferencia de redondeo para que SUM(capital_usd) == monto_capital_usd exacto
      v_cap_i := ROUND(v_sol.monto_capital_usd - v_cap_acum, 2);
      v_int_i := ROUND(v_sol.monto_interes_total_usd - v_int_acum, 2);
    END IF;

    v_monto_i     := ROUND(v_cap_i + v_int_i, 2);
    v_fecha_cobro := (v_fecha_base + ((i - 1) * INTERVAL '15 days'))::DATE;

    INSERT INTO avance_efectivo_cuotas (
      solicitud_id,
      numero_cuota,
      capital_usd,
      interes_usd,
      monto_usd,
      fecha_cobro,
      estatus
    ) VALUES (
      p_solicitud_id,
      i,
      v_cap_i,
      v_int_i,
      v_monto_i,
      v_fecha_cobro,
      'Pendiente'
    );
  END LOOP;

  RETURN QUERY SELECT true,
    format('✅ Desembolso confirmado (Ref: %s). Se retuvieron $%s de capital del cupo del trabajador.',
           btrim(p_referencia_pago),
           trim(to_char(v_sol.monto_capital_usd, '999990.00')));
END;
$$;


-- ── 6. RPC 3: RECHAZAR SOLICITUD DE AVANCE DE EFECTIVO ───────────────────────
CREATE OR REPLACE FUNCTION public.rechazar_avance_efectivo(
  p_solicitud_id UUID,
  p_motivo       TEXT DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sol avance_efectivo_solicitudes%ROWTYPE;
BEGIN
  SELECT * INTO v_sol
  FROM avance_efectivo_solicitudes
  WHERE id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Solicitud no encontrada.';
    RETURN;
  END IF;

  IF v_sol.estatus != 'Pendiente' THEN
    RETURN QUERY SELECT false, format('No se puede rechazar una solicitud en estado %s.', v_sol.estatus);
    RETURN;
  END IF;

  UPDATE avance_efectivo_solicitudes
  SET estatus        = 'Rechazado',
      motivo_rechazo = COALESCE(NULLIF(btrim(p_motivo), ''), 'Rechazada por el Proveedor de Liquidez'),
      updated_at     = NOW()
  WHERE id = p_solicitud_id;

  RETURN QUERY SELECT true, 'Solicitud rechazada. El cupo disponible del trabajador permanece intacto.';
END;
$$;


-- ── 7. RPC 4: COBRAR CUOTA DE AVANCE EN NÓMINA (LIBERACIÓN EXACTA DE CAPITAL) ─
-- Incrementa el limite_disponible del trabajador EXCLUSIVAMENTE por la porción
-- de capital (capital_usd) de la cuota cobrada, jamás el interés, garantizando
-- que el límite del trabajador nunca supere su limite_total ($40.00).
CREATE OR REPLACE FUNCTION public.cobrar_cuota_avance_nomina(
  p_cuota_id UUID,
  p_tasa_bcv NUMERIC DEFAULT 36.85
)
RETURNS TABLE(
  ok                BOOLEAN,
  mensaje           TEXT,
  capital_liberado  NUMERIC,
  interes_ganancia  NUMERIC,
  nuevo_disponible  NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cuota           avance_efectivo_cuotas%ROWTYPE;
  v_sol             avance_efectivo_solicitudes%ROWTYPE;
  v_trabajador      trabajadores_crc%ROWTYPE;
  v_nuevo_disp      NUMERIC;
  v_pendientes_rest INTEGER;
BEGIN
  -- 1. Bloquear cuota (FOR UPDATE) para garantizar idempotencia absoluta
  SELECT * INTO v_cuota
  FROM avance_efectivo_cuotas
  WHERE id = p_cuota_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Cuota de avance no encontrada.', 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  IF v_cuota.estatus != 'Pendiente' THEN
    RETURN QUERY SELECT false,
      format('Esta cuota ya fue cobrada anteriormente (Estado: %s). No se realizó doble acreditación.', v_cuota.estatus),
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 2. Obtener solicitud padre y bloquear fila del trabajador
  SELECT * INTO v_sol
  FROM avance_efectivo_solicitudes
  WHERE id = v_cuota.solicitud_id
  FOR UPDATE;

  SELECT * INTO v_trabajador
  FROM trabajadores_crc
  WHERE id = v_sol.trabajador_id
  FOR UPDATE;

  -- 3. Marcar la cuota como 'Cobrado'
  UPDATE avance_efectivo_cuotas
  SET estatus          = 'Cobrado',
      fecha_pago_real  = NOW(),
      tasa_bcv_pago    = p_tasa_bcv,
      monto_ves_pagado = ROUND(v_cuota.monto_usd * p_tasa_bcv, 2)
  WHERE id = p_cuota_id;

  -- 4. Liberar en el cupo del trabajador EXCLUSIVAMENTE la porción de capital (capital_usd)
  -- GARANTÍA CRÍTICA: Jamás se suma interes_usd al limite_disponible, ni supera limite_total.
  v_nuevo_disp := LEAST(v_trabajador.limite_total, ROUND(v_trabajador.limite_disponible + v_cuota.capital_usd, 2));

  UPDATE trabajadores_crc
  SET limite_disponible = v_nuevo_disp
  WHERE id = v_trabajador.id;

  -- 5. Si todas las cuotas de la solicitud ya fueron cobradas, marcar la solicitud como 'Completado'
  SELECT COUNT(*) INTO v_pendientes_rest
  FROM avance_efectivo_cuotas
  WHERE solicitud_id = v_sol.id
    AND estatus = 'Pendiente';

  IF v_pendientes_rest = 0 THEN
    UPDATE avance_efectivo_solicitudes
    SET estatus    = 'Completado',
        updated_at = NOW()
    WHERE id = v_sol.id;
  END IF;

  RETURN QUERY SELECT
    true,
    format('✅ Cuota #%s cobrada ($%s total). Capital liberado al cupo: $%s. Interés neto proveedor: $%s.',
           v_cuota.numero_cuota::TEXT,
           trim(to_char(v_cuota.monto_usd, '999990.00')),
           trim(to_char(v_cuota.capital_usd, '999990.00')),
           trim(to_char(v_cuota.interes_usd, '999990.00'))),
    v_cuota.capital_usd,
    v_cuota.interes_usd,
    v_nuevo_disp;
END;
$$;

COMMIT;
