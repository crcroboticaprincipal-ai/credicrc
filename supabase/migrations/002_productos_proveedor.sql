-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 002: Productos por Proveedor — Vitrina Online (máx. 10 activos)
-- Tipo: ADITIVA
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS productos_proveedor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id    UUID NOT NULL REFERENCES proveedores_aliados(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  precio          NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  stock_disponible BOOLEAN DEFAULT true,
  activo          BOOLEAN DEFAULT true,
  imagen_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_productos_proveedor_id ON productos_proveedor(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_productos_activos ON productos_proveedor(proveedor_id, activo);

-- RLS
ALTER TABLE productos_proveedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos pueden leer productos" ON productos_proveedor FOR SELECT USING (true);

-- ── RPC ATÓMICO: Agregar producto con validación del límite de 10 ──────────
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
  -- Contar productos ACTIVOS del proveedor (con lock para evitar race conditions)
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

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_producto_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_productos_updated_at
  BEFORE UPDATE ON productos_proveedor
  FOR EACH ROW EXECUTE FUNCTION update_producto_timestamp();
