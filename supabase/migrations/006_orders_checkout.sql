-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 006: Pedidos / Checkout — Flujo completo de compra online
-- Tablas: orders + order_items
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tabla principal de pedidos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT NOT NULL UNIQUE,  -- Ej: "CRC-2026-0001"
  trabajador_id   UUID NOT NULL REFERENCES trabajadores_crc(id),
  proveedor_id    UUID NOT NULL REFERENCES proveedores_aliados(id),
  -- Financiero
  monto_total_usd NUMERIC(10,2) NOT NULL,
  tasa_bcv        NUMERIC(10,4) NOT NULL,
  monto_total_ves NUMERIC(12,2) NOT NULL,
  -- Logística
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('pickup','delivery')),
  delivery_address TEXT,  -- Solo si delivery_method = 'delivery'
  -- Estado del pedido
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','preparing','ready','in_transit','delivered','cancelled')),
  -- QR de entrega (para validar pickup presencial)
  delivery_qr_token TEXT UNIQUE,
  delivery_qr_expires_at TIMESTAMPTZ,
  -- Metadata
  notas_trabajador TEXT,
  notas_proveedor  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Relaciones navegables
  trabajadores_crc UUID REFERENCES trabajadores_crc(id),
  proveedores_aliados UUID REFERENCES proveedores_aliados(id)
);

-- Corregir FK redundantes (las FKs están en trabajador_id y proveedor_id)
ALTER TABLE orders DROP COLUMN IF EXISTS trabajadores_crc;
ALTER TABLE orders DROP COLUMN IF EXISTS proveedores_aliados;

-- ── Ítems del pedido ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  producto_id     UUID NOT NULL REFERENCES productos_proveedor(id),
  nombre_producto TEXT NOT NULL,  -- snapshot del nombre al momento del pedido
  precio_usd      NUMERIC(10,2) NOT NULL,  -- snapshot del precio
  cantidad        INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  subtotal_usd    NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Historial de cambios de estado ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status_from TEXT,
  status_to   TEXT NOT NULL,
  actor_tipo  TEXT CHECK (actor_tipo IN ('trabajador','proveedor','admin','sistema')),
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_trabajador ON orders(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_orders_proveedor  ON orders(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden leer orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Todos pueden leer order_items" ON order_items FOR SELECT USING (true);
CREATE POLICY "Todos pueden leer order_history" ON order_status_history FOR SELECT USING (true);

-- ── Secuencia para order_number legible ───────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- ── RPC: Crear Pedido (atómico: pedido + ítems + descuento de cupo) ───────
CREATE OR REPLACE FUNCTION crear_pedido_online(
  p_trabajador_id   UUID,
  p_proveedor_id    UUID,
  p_productos       JSONB,  -- [{producto_id, cantidad}]
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
  -- Lock del trabajador
  SELECT * INTO v_worker FROM trabajadores_crc WHERE id = p_trabajador_id FOR UPDATE;

  -- Calcular monto total iterando productos
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

  -- Verificar cupo disponible
  IF v_monto_total > v_worker.limite_disponible THEN
    RETURN QUERY SELECT false,
      format('Cupo insuficiente. Disponible: $%s USD, Total pedido: $%s USD',
             v_worker.limite_disponible::TEXT, v_monto_total::TEXT),
      NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Generar número de pedido legible
  v_year    := EXTRACT(YEAR FROM NOW())::TEXT;
  v_seq     := nextval('order_number_seq');
  v_order_num := format('CRC-%s-%s', v_year, lpad(v_seq::TEXT, 4, '0'));

  -- Generar token QR de entrega (solo para pickup)
  v_qr_token := NULL;
  IF p_delivery_method = 'pickup' THEN
    v_qr_token := encode(gen_random_bytes(16), 'hex');
  END IF;

  -- Insertar el pedido
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

  -- Insertar ítems
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_productos) LOOP
    SELECT * INTO v_producto FROM productos_proveedor
    WHERE id = (v_item->>'producto_id')::UUID;

    v_subtotal := v_producto.precio * (v_item->>'cantidad')::INTEGER;

    INSERT INTO order_items (order_id, producto_id, nombre_producto, precio_usd, cantidad, subtotal_usd)
    VALUES (v_order_id, v_producto.id, v_producto.nombre, v_producto.precio,
            (v_item->>'cantidad')::INTEGER, v_subtotal);
  END LOOP;

  -- Descontar del cupo
  UPDATE trabajadores_crc
  SET limite_disponible = limite_disponible - v_monto_total
  WHERE id = p_trabajador_id;

  -- Registrar en historial
  INSERT INTO order_status_history (order_id, status_from, status_to, actor_tipo, notas)
  VALUES (v_order_id, NULL, 'pending', 'trabajador', 'Pedido creado online');

  RETURN QUERY SELECT true, 'Pedido creado exitosamente.', v_order_id, v_order_num, v_qr_token;
END;
$$;

-- ── RPC: Actualizar estado del pedido ─────────────────────────────────────
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

  -- Si se entrega, restaurar cupo (si no ya fue acreditado)
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

-- ── RPC: Validar QR de entrega (pickup presencial) ────────────────────────
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

  -- Marcar como entregado
  UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, status_from, status_to, actor_tipo, notas)
  VALUES (p_order_id, v_order.status, 'delivered', 'proveedor', 'Entrega validada por QR presencial');

  RETURN QUERY SELECT true, '✅ Entrega validada exitosamente. Pedido cerrado.';
END;
$$;

-- Trigger para updated_at en orders
CREATE OR REPLACE FUNCTION update_order_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_order_timestamp();
