-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 005: Avance de Efectivo — Cupos Independientes con Intereses
-- ════════════════════════════════════════════════════════════════════════════

-- Las columnas cupo_avance_efectivo ya se añaden en la migración 004
-- Esta migración crea las tablas de solicitudes y cuotas

CREATE TABLE IF NOT EXISTS avance_efectivo_solicitudes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajador_id           UUID NOT NULL REFERENCES trabajadores_crc(id),
  proveedor_liquidez_id   UUID NOT NULL REFERENCES proveedores_aliados(id),
  monto_capital_usd       NUMERIC(10,2) NOT NULL CHECK (monto_capital_usd > 0),
  num_cuotas              INTEGER NOT NULL CHECK (num_cuotas IN (1,2,3,4)),
  tipo_interes            TEXT NOT NULL CHECK (tipo_interes IN ('porcentaje','monto_fijo')),
  valor_interes           NUMERIC(10,4) NOT NULL CHECK (valor_interes >= 0),
  -- Resultados del cálculo (guardados para registro contable)
  monto_interes_total_usd NUMERIC(10,2) NOT NULL,
  monto_total_usd         NUMERIC(10,2) NOT NULL,
  valor_cuota_usd         NUMERIC(10,2) NOT NULL,
  tasa_bcv_registro       NUMERIC(10,4) NOT NULL,
  estatus                 TEXT NOT NULL DEFAULT 'Pendiente'
                          CHECK (estatus IN ('Pendiente','Aprobado','Rechazado','En Pago','Completado')),
  notas                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ae_trabajador ON avance_efectivo_solicitudes(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_ae_proveedor  ON avance_efectivo_solicitudes(proveedor_liquidez_id);
CREATE INDEX IF NOT EXISTS idx_ae_estatus    ON avance_efectivo_solicitudes(estatus);

ALTER TABLE avance_efectivo_solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos pueden leer ae_solicitudes" ON avance_efectivo_solicitudes FOR SELECT USING (true);

-- ── Cuotas del Avance ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS avance_efectivo_cuotas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  UUID NOT NULL REFERENCES avance_efectivo_solicitudes(id) ON DELETE CASCADE,
  numero_cuota  INTEGER NOT NULL,
  monto_usd     NUMERIC(10,2) NOT NULL,  -- capital + interés proporcional
  capital_usd   NUMERIC(10,2) NOT NULL,
  interes_usd   NUMERIC(10,2) NOT NULL,
  fecha_cobro   DATE NOT NULL,
  estatus       TEXT NOT NULL DEFAULT 'Pendiente'
                CHECK (estatus IN ('Pendiente','Cobrado','Vencido','Pagado Directo')),
  fecha_pago_real TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ae_cuotas_solicitud ON avance_efectivo_cuotas(solicitud_id);
ALTER TABLE avance_efectivo_cuotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos pueden leer ae_cuotas" ON avance_efectivo_cuotas FOR SELECT USING (true);

-- ── RPC: Crear Solicitud de Avance de Efectivo (atómica) ──────────────────
CREATE OR REPLACE FUNCTION crear_solicitud_avance_efectivo(
  p_trabajador_id       UUID,
  p_proveedor_id        UUID,
  p_monto_capital_usd   NUMERIC,
  p_num_cuotas          INTEGER,
  p_tipo_interes        TEXT,
  p_valor_interes       NUMERIC,
  p_tasa_bcv            NUMERIC,
  p_fecha_primera_cuota DATE
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT, solicitud_id UUID,
              interes_total NUMERIC, monto_total NUMERIC, cuota_valor NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
  v_trabajador          trabajadores_crc%ROWTYPE;
  v_cupo_disp           NUMERIC;
  v_interes_total       NUMERIC;
  v_monto_total         NUMERIC;
  v_cuota_val           NUMERIC;
  v_capital_cuota       NUMERIC;
  v_interes_cuota       NUMERIC;
  v_sol_id              UUID;
  i                     INTEGER;
BEGIN
  SELECT * INTO v_trabajador FROM trabajadores_crc WHERE id = p_trabajador_id FOR UPDATE;

  v_cupo_disp := v_trabajador.cupo_avance_efectivo - v_trabajador.cupo_avance_efectivo_usado;

  -- Calcular intereses según tipo
  IF p_tipo_interes = 'porcentaje' THEN
    v_interes_total := ROUND(p_monto_capital_usd * (p_valor_interes / 100.0), 2);
  ELSE -- monto_fijo por cuota
    v_interes_total := ROUND(p_valor_interes * p_num_cuotas, 2);
  END IF;

  v_monto_total := p_monto_capital_usd + v_interes_total;
  v_cuota_val   := ROUND(v_monto_total / p_num_cuotas, 2);
  v_capital_cuota := ROUND(p_monto_capital_usd / p_num_cuotas, 2);
  v_interes_cuota := v_cuota_val - v_capital_cuota;

  -- Validaciones
  IF p_monto_capital_usd > v_cupo_disp THEN
    RETURN QUERY SELECT false,
      format('Cupo insuficiente. Disponible: $%s USD', v_cupo_disp::TEXT),
      NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Bloqueo cruzado: si tiene línea doméstica activa
  IF EXISTS (
    SELECT 1 FROM linea_domestica_solicitudes
    WHERE trabajador_id = p_trabajador_id AND estatus IN ('Pendiente','Aprobado','En Pago')
  ) THEN
    RETURN QUERY SELECT false,
      'No puede solicitar Avance de Efectivo mientras tiene una Línea Doméstica activa.',
      NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Insertar solicitud
  INSERT INTO avance_efectivo_solicitudes
    (trabajador_id, proveedor_liquidez_id, monto_capital_usd, num_cuotas, tipo_interes,
     valor_interes, monto_interes_total_usd, monto_total_usd, valor_cuota_usd, tasa_bcv_registro)
  VALUES
    (p_trabajador_id, p_proveedor_id, p_monto_capital_usd, p_num_cuotas, p_tipo_interes,
     p_valor_interes, v_interes_total, v_monto_total, v_cuota_val, p_tasa_bcv)
  RETURNING id INTO v_sol_id;

  -- Generar cuotas con desglose capital/interés
  FOR i IN 1..p_num_cuotas LOOP
    INSERT INTO avance_efectivo_cuotas
      (solicitud_id, numero_cuota, monto_usd, capital_usd, interes_usd, fecha_cobro)
    VALUES
      (v_sol_id, i, v_cuota_val, v_capital_cuota, v_interes_cuota,
       p_fecha_primera_cuota + ((i-1) * INTERVAL '15 days'));
  END LOOP;

  -- Marcar cupo como usado
  UPDATE trabajadores_crc
  SET cupo_avance_efectivo_usado = cupo_avance_efectivo_usado + p_monto_capital_usd
  WHERE id = p_trabajador_id;

  RETURN QUERY SELECT true, 'Avance de efectivo creado exitosamente.', v_sol_id,
               v_interes_total, v_monto_total, v_cuota_val;
END;
$$;
