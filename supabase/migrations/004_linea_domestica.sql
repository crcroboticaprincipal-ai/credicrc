-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 004: Línea Doméstica — Cupos Independientes
-- Tablas: linea_domestica_solicitudes + linea_domestica_cuotas
-- ════════════════════════════════════════════════════════════════════════════

-- ── Cupos independientes en trabajadores_crc ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trabajadores_crc' AND column_name='cupo_linea_domestica') THEN
    ALTER TABLE trabajadores_crc ADD COLUMN cupo_linea_domestica NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE trabajadores_crc ADD COLUMN cupo_linea_domestica_usado NUMERIC(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trabajadores_crc' AND column_name='cupo_avance_efectivo') THEN
    ALTER TABLE trabajadores_crc ADD COLUMN cupo_avance_efectivo NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE trabajadores_crc ADD COLUMN cupo_avance_efectivo_usado NUMERIC(10,2) DEFAULT 0;
  END IF;
END;
$$;

-- ── Solicitudes de Línea Doméstica ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS linea_domestica_solicitudes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajador_id         UUID NOT NULL REFERENCES trabajadores_crc(id),
  proveedor_id          UUID NOT NULL REFERENCES proveedores_aliados(id),
  descripcion_articulo  TEXT NOT NULL,
  monto_total_usd       NUMERIC(10,2) NOT NULL CHECK (monto_total_usd > 0),
  num_cuotas            INTEGER NOT NULL CHECK (num_cuotas IN (2,4,6,8,10,12)),
  valor_cuota_usd       NUMERIC(10,2) NOT NULL,
  tasa_bcv_registro     NUMERIC(10,4) NOT NULL,
  estatus               TEXT NOT NULL DEFAULT 'Pendiente'
                        CHECK (estatus IN ('Pendiente','Aprobado','Rechazado','En Pago','Completado')),
  notas                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ld_trabajador ON linea_domestica_solicitudes(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_ld_proveedor  ON linea_domestica_solicitudes(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ld_estatus    ON linea_domestica_solicitudes(estatus);

ALTER TABLE linea_domestica_solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos pueden leer ld_solicitudes" ON linea_domestica_solicitudes FOR SELECT USING (true);

-- ── Cuotas de Línea Doméstica ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS linea_domestica_cuotas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  UUID NOT NULL REFERENCES linea_domestica_solicitudes(id) ON DELETE CASCADE,
  numero_cuota  INTEGER NOT NULL,
  monto_usd     NUMERIC(10,2) NOT NULL,
  fecha_cobro   DATE NOT NULL,
  estatus       TEXT NOT NULL DEFAULT 'Pendiente'
                CHECK (estatus IN ('Pendiente','Cobrado','Vencido','Pagado Directo')),
  fecha_pago_real TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ld_cuotas_solicitud ON linea_domestica_cuotas(solicitud_id);
ALTER TABLE linea_domestica_cuotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos pueden leer ld_cuotas" ON linea_domestica_cuotas FOR SELECT USING (true);

-- ── RPC: Crear Solicitud de Línea Doméstica (atómica) ─────────────────────
CREATE OR REPLACE FUNCTION crear_solicitud_linea_domestica(
  p_trabajador_id       UUID,
  p_proveedor_id        UUID,
  p_descripcion         TEXT,
  p_monto_total_usd     NUMERIC,
  p_num_cuotas          INTEGER,
  p_tasa_bcv            NUMERIC,
  p_fecha_primera_cuota DATE
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT, solicitud_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
  v_trabajador trabajadores_crc%ROWTYPE;
  v_cupo_disp  NUMERIC;
  v_cuota_val  NUMERIC;
  v_sol_id     UUID;
  i            INTEGER;
BEGIN
  SELECT * INTO v_trabajador FROM trabajadores_crc WHERE id = p_trabajador_id FOR UPDATE;

  v_cupo_disp := v_trabajador.cupo_linea_domestica - v_trabajador.cupo_linea_domestica_usado;
  v_cuota_val := ROUND(p_monto_total_usd / p_num_cuotas, 2);

  -- Verificar cupo disponible
  IF p_monto_total_usd > v_cupo_disp THEN
    RETURN QUERY SELECT false,
      format('Cupo insuficiente. Disponible: $%s USD, Solicitado: $%s USD', v_cupo_disp::TEXT, p_monto_total_usd::TEXT),
      NULL::UUID;
    RETURN;
  END IF;

  -- Bloqueo cruzado: si tiene avance de efectivo activo, bloquear
  IF EXISTS (
    SELECT 1 FROM avance_efectivo_solicitudes
    WHERE trabajador_id = p_trabajador_id AND estatus IN ('Pendiente','Aprobado','En Pago')
  ) THEN
    RETURN QUERY SELECT false, 'No puede solicitar Línea Doméstica mientras tiene un Avance de Efectivo activo.', NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO linea_domestica_solicitudes
    (trabajador_id, proveedor_id, descripcion_articulo, monto_total_usd, num_cuotas, valor_cuota_usd, tasa_bcv_registro)
  VALUES
    (p_trabajador_id, p_proveedor_id, p_descripcion, p_monto_total_usd, p_num_cuotas, v_cuota_val, p_tasa_bcv)
  RETURNING id INTO v_sol_id;

  -- Generar cronograma de cuotas
  FOR i IN 1..p_num_cuotas LOOP
    INSERT INTO linea_domestica_cuotas (solicitud_id, numero_cuota, monto_usd, fecha_cobro)
    VALUES (v_sol_id, i, v_cuota_val, p_fecha_primera_cuota + ((i-1) * INTERVAL '15 days'));
  END LOOP;

  -- Marcar cupo como usado
  UPDATE trabajadores_crc
  SET cupo_linea_domestica_usado = cupo_linea_domestica_usado + p_monto_total_usd
  WHERE id = p_trabajador_id;

  RETURN QUERY SELECT true, 'Solicitud de Línea Doméstica creada exitosamente.', v_sol_id;
END;
$$;
