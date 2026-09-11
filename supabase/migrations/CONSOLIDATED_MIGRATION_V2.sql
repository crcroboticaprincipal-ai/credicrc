-- ════════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN CONSOLIDADA CREDICRC V2
-- Ejecutar este archivo completo en el SQL Editor de Supabase
-- URL: https://supabase.com/dashboard/project/ghjbudoeuxgpcghkhasa/sql/new
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. FEATURE FLAGS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  modulo_id       TEXT PRIMARY KEY,
  activo          BOOLEAN NOT NULL DEFAULT false,
  descripcion     TEXT,
  mensaje_bloqueo TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags (modulo_id, activo, descripcion, mensaje_bloqueo) VALUES
  ('tienda_online',         false, 'Vitrina de productos por proveedor (hasta 10 por comercio)', 'La Tienda Online está temporalmente en mantenimiento. Vuelve pronto.'),
  ('linea_domestica',       false, 'Financiamiento de electrodomésticos a cuotas', 'La Línea Doméstica estará disponible próximamente.'),
  ('avance_efectivo',       false, 'Avance de efectivo con cálculo de intereses', 'El módulo de Avance de Efectivo estará disponible próximamente.'),
  ('registro_proveedores',  true,  'Registro y aprobación de nuevos proveedores', NULL),
  ('pedidos_checkout',      false, 'Flujo de compra online con estados de pedido y entrega', 'El módulo de Pedidos en Línea estará disponible próximamente.')
ON CONFLICT (modulo_id) DO NOTHING;

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer feature_flags') THEN
    CREATE POLICY "Todos pueden leer feature_flags" ON feature_flags FOR SELECT USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_feature_flag_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_feature_flag_timestamp();


-- ── 2. PRODUCTOS POR PROVEEDOR (HASTA 10 ACTIVOS) ───────────────────────────
CREATE TABLE IF NOT EXISTS productos_proveedor (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id     UUID NOT NULL REFERENCES proveedores_aliados(id) ON DELETE CASCADE,
  nombre           TEXT NOT NULL,
  descripcion      TEXT,
  precio           NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  stock_disponible BOOLEAN DEFAULT true,
  activo           BOOLEAN DEFAULT true,
  imagen_url       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_proveedor_id ON productos_proveedor(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_productos_activos ON productos_proveedor(proveedor_id, activo);

ALTER TABLE productos_proveedor ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer productos') THEN
    CREATE POLICY "Todos pueden leer productos" ON productos_proveedor FOR SELECT USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION agregar_producto_proveedor(
  p_proveedor_id  UUID,
  p_nombre        TEXT,
  p_descripcion   TEXT,
  p_precio        NUMERIC,
  p_imagen_url    TEXT DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT, producto_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
  v_nuevo_id UUID;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM productos_proveedor
  WHERE proveedor_id = p_proveedor_id AND activo = true
  FOR UPDATE;

  IF v_count >= 10 THEN
    RETURN QUERY SELECT false, 'Límite alcanzado: máximo 10 productos activos por proveedor.', NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO productos_proveedor (proveedor_id, nombre, descripcion, precio, imagen_url)
  VALUES (p_proveedor_id, p_nombre, p_descripcion, p_precio, p_imagen_url)
  RETURNING id INTO v_nuevo_id;

  RETURN QUERY SELECT true, 'Producto agregado exitosamente.', v_nuevo_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_producto_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_productos_updated_at ON productos_proveedor;
CREATE TRIGGER trg_productos_updated_at
  BEFORE UPDATE ON productos_proveedor
  FOR EACH ROW EXECUTE FUNCTION update_producto_timestamp();


-- ── 3. FIX ATÓMICO PAGOS DIRECTOS (ANTI DOBLE ACREDITACIÓN) ─────────────────
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

CREATE OR REPLACE FUNCTION procesar_pago_directo(p_pago_directo_id UUID)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_pago   pagos_directos_credicrc%ROWTYPE;
  v_cuota  cronograma_cuotas%ROWTYPE;
BEGIN
  SELECT * INTO v_pago
  FROM pagos_directos_credicrc
  WHERE id = p_pago_directo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Pago no encontrado.';
    RETURN;
  END IF;

  IF v_pago.estatus != 'Pendiente' THEN
    RETURN QUERY SELECT false,
      format('Este pago ya fue procesado anteriormente (estado: %s). No se realizó ningún cambio.', v_pago.estatus);
    RETURN;
  END IF;

  SELECT * INTO v_cuota
  FROM cronograma_cuotas
  WHERE id = v_pago.cuota_id
  FOR UPDATE;

  UPDATE pagos_directos_credicrc
  SET estatus = 'Verificado', updated_at = NOW()
  WHERE id = p_pago_directo_id;

  UPDATE cronograma_cuotas
  SET estatus = 'Pagado Directo',
      fecha_pago_real = NOW(),
      tasa_bcv_pago = (SELECT 36.85),
      monto_ves_pagado = v_pago.monto_usd * 36.85
  WHERE id = v_pago.cuota_id;

  UPDATE trabajadores_crc
  SET limite_disponible = LEAST(limite_total, limite_disponible + v_pago.monto_usd)
  WHERE id = v_pago.trabajador_id;

  RETURN QUERY SELECT true,
    format('✅ Pago de $%s USD confirmado. Cupo restaurado al trabajador.', v_pago.monto_usd::TEXT);
END;
$$;


-- ── 4. LÍNEA DOMÉSTICA & CUPOS INDEPENDIENTES ──────────────────────────────
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer ld_solicitudes') THEN
    CREATE POLICY "Todos pueden leer ld_solicitudes" ON linea_domestica_solicitudes FOR SELECT USING (true);
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer ld_cuotas') THEN
    CREATE POLICY "Todos pueden leer ld_cuotas" ON linea_domestica_cuotas FOR SELECT USING (true);
  END IF;
END $$;

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

  IF p_monto_total_usd > v_cupo_disp THEN
    RETURN QUERY SELECT false,
      format('Cupo insuficiente. Disponible: $%s USD, Solicitado: $%s USD', v_cupo_disp::TEXT, p_monto_total_usd::TEXT),
      NULL::UUID;
    RETURN;
  END IF;

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

  FOR i IN 1..p_num_cuotas LOOP
    INSERT INTO linea_domestica_cuotas (solicitud_id, numero_cuota, monto_usd, fecha_cobro)
    VALUES (v_sol_id, i, v_cuota_val, p_fecha_primera_cuota + ((i-1) * INTERVAL '15 days'));
  END LOOP;

  UPDATE trabajadores_crc
  SET cupo_linea_domestica_usado = cupo_linea_domestica_usado + p_monto_total_usd
  WHERE id = p_trabajador_id;

  RETURN QUERY SELECT true, 'Solicitud de Línea Doméstica creada exitosamente.', v_sol_id;
END;
$$;


-- ── 5. AVANCE DE EFECTIVO ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS avance_efectivo_solicitudes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajador_id           UUID NOT NULL REFERENCES trabajadores_crc(id),
  proveedor_liquidez_id   UUID NOT NULL REFERENCES proveedores_aliados(id),
  monto_capital_usd       NUMERIC(10,2) NOT NULL CHECK (monto_capital_usd > 0),
  num_cuotas              INTEGER NOT NULL CHECK (num_cuotas IN (1,2,3,4)),
  tipo_interes            TEXT NOT NULL CHECK (tipo_interes IN ('porcentaje','monto_fijo')),
  valor_interes           NUMERIC(10,4) NOT NULL CHECK (valor_interes >= 0),
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer ae_solicitudes') THEN
    CREATE POLICY "Todos pueden leer ae_solicitudes" ON avance_efectivo_solicitudes FOR SELECT USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS avance_efectivo_cuotas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  UUID NOT NULL REFERENCES avance_efectivo_solicitudes(id) ON DELETE CASCADE,
  numero_cuota  INTEGER NOT NULL,
  monto_usd     NUMERIC(10,2) NOT NULL,
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer ae_cuotas') THEN
    CREATE POLICY "Todos pueden leer ae_cuotas" ON avance_efectivo_cuotas FOR SELECT USING (true);
  END IF;
END $$;

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

  IF p_tipo_interes = 'porcentaje' THEN
    v_interes_total := ROUND(p_monto_capital_usd * (p_valor_interes / 100.0), 2);
  ELSE
    v_interes_total := ROUND(p_valor_interes * p_num_cuotas, 2);
  END IF;

  v_monto_total := p_monto_capital_usd + v_interes_total;
  v_cuota_val   := ROUND(v_monto_total / p_num_cuotas, 2);
  v_capital_cuota := ROUND(p_monto_capital_usd / p_num_cuotas, 2);
  v_interes_cuota := v_cuota_val - v_capital_cuota;

  IF p_monto_capital_usd > v_cupo_disp THEN
    RETURN QUERY SELECT false,
      format('Cupo insuficiente. Disponible: $%s USD', v_cupo_disp::TEXT),
      NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM linea_domestica_solicitudes
    WHERE trabajador_id = p_trabajador_id AND estatus IN ('Pendiente','Aprobado','En Pago')
  ) THEN
    RETURN QUERY SELECT false,
      'No puede solicitar Avance de Efectivo mientras tiene una Línea Doméstica activa.',
      NULL::UUID, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  INSERT INTO avance_efectivo_solicitudes
    (trabajador_id, proveedor_liquidez_id, monto_capital_usd, num_cuotas, tipo_interes,
     valor_interes, monto_interes_total_usd, monto_total_usd, valor_cuota_usd, tasa_bcv_registro)
  VALUES
    (p_trabajador_id, p_proveedor_id, p_monto_capital_usd, p_num_cuotas, p_tipo_interes,
     p_valor_interes, v_interes_total, v_monto_total, v_cuota_val, p_tasa_bcv)
  RETURNING id INTO v_sol_id;

  FOR i IN 1..p_num_cuotas LOOP
    INSERT INTO avance_efectivo_cuotas
      (solicitud_id, numero_cuota, monto_usd, capital_usd, interes_usd, fecha_cobro)
    VALUES
      (v_sol_id, i, v_cuota_val, v_capital_cuota, v_interes_cuota,
       p_fecha_primera_cuota + ((i-1) * INTERVAL '15 days'));
  END LOOP;

  UPDATE trabajadores_crc
  SET cupo_avance_efectivo_usado = cupo_avance_efectivo_usado + p_monto_capital_usd
  WHERE id = p_trabajador_id;

  RETURN QUERY SELECT true, 'Avance de efectivo creado exitosamente.', v_sol_id,
               v_interes_total, v_monto_total, v_cuota_val;
END;
$$;


-- ── 6. PEDIDOS & CHECKOUT ONLINE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT NOT NULL UNIQUE,
  trabajador_id   UUID NOT NULL REFERENCES trabajadores_crc(id),
  proveedor_id    UUID NOT NULL REFERENCES proveedores_aliados(id),
  monto_total_usd NUMERIC(10,2) NOT NULL,
  tasa_bcv        NUMERIC(10,4) NOT NULL,
  monto_total_ves NUMERIC(12,2) NOT NULL,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('pickup','delivery')),
  delivery_address TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','preparing','ready','in_transit','delivered','cancelled')),
  delivery_qr_token TEXT UNIQUE,
  delivery_qr_expires_at TIMESTAMPTZ,
  notas_trabajador TEXT,
  notas_proveedor  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  producto_id     UUID NOT NULL REFERENCES productos_proveedor(id),
  nombre_producto TEXT NOT NULL,
  precio_usd      NUMERIC(10,2) NOT NULL,
  cantidad        INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  subtotal_usd    NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status_from TEXT,
  status_to   TEXT NOT NULL,
  actor_tipo  TEXT CHECK (actor_tipo IN ('trabajador','proveedor','admin','sistema')),
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_trabajador ON orders(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_orders_proveedor  ON orders(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer orders') THEN
    CREATE POLICY "Todos pueden leer orders" ON orders FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer order_items') THEN
    CREATE POLICY "Todos pueden leer order_items" ON order_items FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Todos pueden leer order_history') THEN
    CREATE POLICY "Todos pueden leer order_history" ON order_status_history FOR SELECT USING (true);
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE OR REPLACE FUNCTION crear_pedido_online(
  p_trabajador_id   UUID,
  p_proveedor_id    UUID,
  p_productos       JSONB,
  p_delivery_method TEXT,
  p_delivery_address TEXT DEFAULT NULL,
  p_notas           TEXT DEFAULT NULL,
  p_tasa_bcv        NUMERIC DEFAULT 36.85
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT, order_id UUID, order_number TEXT, qr_token TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_worker      trabajadores_crc%ROWTYPE;
  v_producto    productos_proveedor%ROWTYPE;
  v_item        JSONB;
  v_monto_total NUMERIC := 0;
  v_order_id    UUID;
  v_order_num   TEXT;
  v_qr_token    TEXT;
  v_subtotal    NUMERIC;
  v_year        TEXT;
  v_seq         BIGINT;
BEGIN
  SELECT * INTO v_worker FROM trabajadores_crc WHERE id = p_trabajador_id FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_productos) LOOP
    SELECT * INTO v_producto FROM productos_proveedor
    WHERE id = (v_item->>'producto_id')::UUID AND activo = true AND stock_disponible = true;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false,
        format('Producto no disponible: %s', v_item->>'producto_id'),
        NULL::UUID, NULL::TEXT, NULL::TEXT;
      RETURN;
    END IF;

    v_subtotal := v_producto.precio * (v_item->>'cantidad')::INTEGER;
    v_monto_total := v_monto_total + v_subtotal;
  END LOOP;

  IF v_monto_total > v_worker.limite_disponible THEN
    RETURN QUERY SELECT false,
      format('Cupo insuficiente. Disponible: $%s USD, Total pedido: $%s USD',
             v_worker.limite_disponible::TEXT, v_monto_total::TEXT),
      NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_year    := EXTRACT(YEAR FROM NOW())::TEXT;
  v_seq     := nextval('order_number_seq');
  v_order_num := format('CRC-%s-%s', v_year, lpad(v_seq::TEXT, 4, '0'));

  v_qr_token := NULL;
  IF p_delivery_method = 'pickup' THEN
    v_qr_token := encode(gen_random_bytes(16), 'hex');
  END IF;

  INSERT INTO orders
    (order_number, trabajador_id, proveedor_id, monto_total_usd, tasa_bcv, monto_total_ves,
     delivery_method, delivery_address, notas_trabajador, delivery_qr_token, delivery_qr_expires_at, status)
  VALUES
    (v_order_num, p_trabajador_id, p_proveedor_id, v_monto_total, p_tasa_bcv,
     ROUND(v_monto_total * p_tasa_bcv, 2),
     p_delivery_method, p_delivery_address, p_notas, v_qr_token,
     CASE WHEN v_qr_token IS NOT NULL THEN NOW() + INTERVAL '24 hours' ELSE NULL END,
     'pending')
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_productos) LOOP
    SELECT * INTO v_producto FROM productos_proveedor
    WHERE id = (v_item->>'producto_id')::UUID;

    v_subtotal := v_producto.precio * (v_item->>'cantidad')::INTEGER;

    INSERT INTO order_items (order_id, producto_id, nombre_producto, precio_usd, cantidad, subtotal_usd)
    VALUES (v_order_id, v_producto.id, v_producto.nombre, v_producto.precio,
            (v_item->>'cantidad')::INTEGER, v_subtotal);
  END LOOP;

  UPDATE trabajadores_crc
  SET limite_disponible = limite_disponible - v_monto_total
  WHERE id = p_trabajador_id;

  INSERT INTO order_status_history (order_id, status_from, status_to, actor_tipo, notas)
  VALUES (v_order_id, NULL, 'pending', 'trabajador', 'Pedido creado online');

  RETURN QUERY SELECT true, 'Pedido creado exitosamente.', v_order_id, v_order_num, v_qr_token;
END;
$$;

CREATE OR REPLACE FUNCTION actualizar_estado_pedido(
  p_order_id    UUID,
  p_nuevo_estado TEXT,
  p_actor_tipo  TEXT,
  p_notas       TEXT DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Pedido no encontrado.'; RETURN;
  END IF;

  IF p_nuevo_estado = 'cancelled' AND v_order.status NOT IN ('delivered','cancelled') THEN
    UPDATE trabajadores_crc
    SET limite_disponible = LEAST(limite_total, limite_disponible + v_order.monto_total_usd)
    WHERE id = v_order.trabajador_id;
  END IF;

  UPDATE orders SET status = p_nuevo_estado, updated_at = NOW() WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, status_from, status_to, actor_tipo, notas)
  VALUES (p_order_id, v_order.status, p_nuevo_estado, p_actor_tipo, p_notas);

  RETURN QUERY SELECT true, format('Estado actualizado a: %s', p_nuevo_estado);
END;
$$;

CREATE OR REPLACE FUNCTION validar_qr_entrega(
  p_qr_token TEXT,
  p_order_id UUID
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Pedido no encontrado.'; RETURN;
  END IF;
  IF v_order.delivery_qr_token != p_qr_token THEN
    RETURN QUERY SELECT false, 'QR de entrega inválido.'; RETURN;
  END IF;
  IF v_order.delivery_qr_expires_at < NOW() THEN
    RETURN QUERY SELECT false, 'QR de entrega expirado.'; RETURN;
  END IF;
  IF v_order.status = 'delivered' THEN
    RETURN QUERY SELECT false, 'Este pedido ya fue entregado.'; RETURN;
  END IF;

  UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, status_from, status_to, actor_tipo, notas)
  VALUES (p_order_id, v_order.status, 'delivered', 'proveedor', 'Entrega validada por QR presencial');

  RETURN QUERY SELECT true, '✅ Entrega validada exitosamente. Pedido cerrado.';
END;
$$;

CREATE OR REPLACE FUNCTION update_order_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_order_timestamp();

COMMIT;
