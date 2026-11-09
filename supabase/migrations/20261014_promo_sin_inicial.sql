-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Promoción "Compras SIN Inicial" (bandera en Control de Módulos)
-- Tipo: ADITIVA — solo inserta una fila nueva en feature_flags; no toca datos existentes.
-- activo = true  → promoción vigente (botón "Aplica Inicial" gris, solo Inicial Cero)
-- activo = false → promoción apagada (proveedores pueden elegir Aplica Inicial)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO feature_flags (modulo_id, activo, descripcion, mensaje_bloqueo) VALUES
  ('promo_sin_inicial', true,
   'Promoción vigente: todas las compras se procesan con Inicial Cero. El botón "Aplica Inicial" queda deshabilitado (gris) para los proveedores.',
   NULL)
ON CONFLICT (modulo_id) DO NOTHING;
