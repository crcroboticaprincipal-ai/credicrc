-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 007: Fix RLS y RPC en productos_proveedor
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Políticas RLS permisivas para productos_proveedor
DROP POLICY IF EXISTS "Todos pueden leer productos" ON productos_proveedor;
DROP POLICY IF EXISTS "Permitir insert productos" ON productos_proveedor;
DROP POLICY IF EXISTS "Permitir update productos" ON productos_proveedor;
DROP POLICY IF EXISTS "Permitir delete productos" ON productos_proveedor;

CREATE POLICY "Todos pueden leer productos" ON productos_proveedor FOR SELECT USING (true);
CREATE POLICY "Permitir insert productos" ON productos_proveedor FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update productos" ON productos_proveedor FOR UPDATE USING (true);
CREATE POLICY "Permitir delete productos" ON productos_proveedor FOR DELETE USING (true);

-- 2. Corregir RPC agregar_producto_proveedor (eliminar FOR UPDATE en COUNT(*))
CREATE OR REPLACE FUNCTION agregar_producto_proveedor(
  p_proveedor_id  UUID,
  p_nombre        TEXT,
  p_descripcion   TEXT,
  p_precio        NUMERIC,
  p_imagen_url    TEXT DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, mensaje TEXT, producto_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_nuevo_id UUID;
BEGIN
  -- Contar productos ACTIVOS del proveedor
  SELECT COUNT(*) INTO v_count
  FROM productos_proveedor
  WHERE proveedor_id = p_proveedor_id AND activo = true;

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
