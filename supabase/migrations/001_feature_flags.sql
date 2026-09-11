-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 001: Feature Flags — Control dinámico de módulos
-- Tipo: ADITIVA (no altera tablas existentes)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_flags (
  modulo_id     TEXT PRIMARY KEY,
  activo        BOOLEAN NOT NULL DEFAULT false,
  descripcion   TEXT,
  mensaje_bloqueo TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Registro inicial de módulos
INSERT INTO feature_flags (modulo_id, activo, descripcion, mensaje_bloqueo) VALUES
  ('tienda_online',         false, 'Vitrina de productos por proveedor (hasta 10 por comercio)', 'La Tienda Online está temporalmente en mantenimiento. Vuelve pronto.'),
  ('linea_domestica',       false, 'Financiamiento de electrodomésticos a cuotas', 'La Línea Doméstica estará disponible próximamente.'),
  ('avance_efectivo',       false, 'Avance de efectivo con cálculo de intereses', 'El módulo de Avance de Efectivo estará disponible próximamente.'),
  ('registro_proveedores',  true,  'Registro y aprobación de nuevos proveedores', NULL),
  ('pedidos_checkout',      false, 'Flujo de compra online con estados de pedido y entrega', 'El módulo de Pedidos en Línea estará disponible próximamente.')
ON CONFLICT (modulo_id) DO NOTHING;

-- RLS: Solo admin puede modificar feature_flags; todos pueden leer
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden leer feature_flags"
  ON feature_flags FOR SELECT USING (true);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_feature_flag_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_feature_flag_timestamp();
