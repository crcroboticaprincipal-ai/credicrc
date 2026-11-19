-- =============================================================================
-- MIGRACIÓN: MÓDULO DE GESTIÓN DEL CICLO DE VIDA DE PROVEEDORES
-- SUSPENSIÓN TEMPORAL Y BAJA PERMANENTE (SOFT-DELETE)
-- FECHA: 2026-11-19
-- DIRECTRIZ: 100% ADITIVA Y NO DESTRUCTIVA (CERO DELETE FÍSICO)
-- =============================================================================

-- 1. EXTENSIÓN ADITIVA DEL ESQUEMA EN proveedores_aliados (CERO BORRADO FÍSICO)
ALTER TABLE public.proveedores_aliados
  ADD COLUMN IF NOT EXISTS estado_comercio TEXT NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS motivo_suspension TEXT NULL,
  ADD COLUMN IF NOT EXISTS fecha_cambio_estado TIMESTAMPTZ NULL;

-- Asegurar restricción CHECK sobre estado_comercio ('activo', 'suspendido', 'eliminado')
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'proveedores_aliados'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%estado_comercio%'
  LOOP
    EXECUTE format('ALTER TABLE public.proveedores_aliados DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  ALTER TABLE public.proveedores_aliados
    ADD CONSTRAINT proveedores_aliados_estado_comercio_check
    CHECK (LOWER(estado_comercio) IN ('activo', 'suspendido', 'eliminado'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso no bloqueante al configurar constraint de estado_comercio: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_proveedores_estado_comercio
  ON public.proveedores_aliados(estado_comercio);


-- 2. FUNCIÓN RPC DE CONTROL DE CICLO DE VIDA DEL PROVEEDOR (cambiar_estado_comercio_proveedor)
CREATE OR REPLACE FUNCTION public.cambiar_estado_comercio_proveedor(
  p_proveedor_id UUID,
  p_nuevo_estado TEXT,
  p_motivo TEXT DEFAULT NULL
)
RETURNS TABLE(
  ok BOOLEAN,
  mensaje TEXT,
  estado_actual TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prov public.proveedores_aliados%ROWTYPE;
  v_estado TEXT := LOWER(BTRIM(COALESCE(p_nuevo_estado, '')));
  v_motivo TEXT := NULLIF(BTRIM(COALESCE(p_motivo, '')), '');
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_estado NOT IN ('activo', 'suspendido', 'eliminado') THEN
    RETURN QUERY SELECT FALSE, 'Estado inválido. Valores permitidos: activo, suspendido, eliminado.'::TEXT, ''::TEXT;
    RETURN;
  END IF;

  SELECT *
    INTO v_prov
    FROM public.proveedores_aliados
   WHERE id = p_proveedor_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'El proveedor especificado no existe.'::TEXT, ''::TEXT;
    RETURN;
  END IF;

  IF v_estado = 'activo' THEN
    v_motivo := NULL;
  END IF;

  -- Actualizar estado en proveedores_aliados (CERO DELETE)
  UPDATE public.proveedores_aliados
     SET estado_comercio = v_estado,
         motivo_suspension = v_motivo,
         fecha_cambio_estado = v_now
   WHERE id = p_proveedor_id;

  -- Sincronizar metadatos de estado en usuarios_credicrc.datos_registro sin borrar la cuenta
  UPDATE public.usuarios_credicrc
     SET datos_registro = COALESCE(datos_registro, '{}'::jsonb) || jsonb_build_object(
       'estado_comercio', v_estado,
       'motivo_suspension', v_motivo,
       'fecha_cambio_estado', v_now
     )
   WHERE proveedor_id = p_proveedor_id;

  RETURN QUERY SELECT
    TRUE,
    CASE v_estado
      WHEN 'activo' THEN format('Comercio "%s" reactivado exitosamente. Operaciones y catálogo habilitados.', v_prov.nombre)
      WHEN 'suspendido' THEN format('Comercio "%s" suspendido temporalmente. Caja de cobro y catálogo pausados.', v_prov.nombre)
      WHEN 'eliminado' THEN format('Comercio "%s" dado de baja permanentemente (archivado). Acceso revocado e historial contable preservado.', v_prov.nombre)
    END::TEXT,
    v_estado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cambiar_estado_comercio_proveedor(UUID, TEXT, TEXT) TO anon, authenticated, service_role;


-- 3. BLINDAJE CENTRALIZADO EN SUPABASE (VALIDACIÓN DE ESTADO_COMERCIO = 'activo')
CREATE OR REPLACE FUNCTION public.assert_proveedor_activo(p_proveedor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado TEXT;
  v_motivo TEXT;
  v_nombre TEXT;
BEGIN
  IF p_proveedor_id IS NULL THEN
    RETURN;
  END IF;

  SELECT LOWER(COALESCE(estado_comercio, 'activo')), motivo_suspension, nombre
    INTO v_estado, v_motivo, v_nombre
    FROM public.proveedores_aliados
   WHERE id = p_proveedor_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_estado = 'suspendido' THEN
    RAISE EXCEPTION '⚠️ Cuenta Comercial Suspendida Temporalmente: El procesamiento de nuevas ventas para "%" se encuentra deshabilitado. Comuníquese con la Administración de CrediCRC.%',
      COALESCE(v_nombre, 'este comercio'),
      CASE WHEN v_motivo IS NOT NULL AND BTRIM(v_motivo) <> '' THEN ' (Motivo: ' || v_motivo || ')' ELSE '' END;
  ELSIF v_estado = 'eliminado' THEN
    RAISE EXCEPTION '🚫 Cuenta Comercial Dada de Baja: El comercio "%" ya no se encuentra activo en CrediCRC. Operación abortada.',
      COALESCE(v_nombre, 'seleccionado');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_proveedor_activo(UUID) TO anon, authenticated, service_role;

-- Función Trigger universal para abortar ventas, pedidos, avances o edición de catálogo si estado_comercio != 'activo'
CREATE OR REPLACE FUNCTION public.verificar_estado_comercio_activo_trg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prov_id UUID := NULL;
BEGIN
  IF TG_TABLE_NAME IN ('transacciones_credicrc', 'orders', 'productos_proveedor', 'linea_domestica_solicitudes') THEN
    v_prov_id := NEW.proveedor_id;
  ELSIF TG_TABLE_NAME = 'avance_efectivo_solicitudes' THEN
    v_prov_id := NEW.proveedor_liquidez_id;
  ELSIF TG_TABLE_NAME = 'avance_efectivo_cuotas' THEN
    SELECT proveedor_liquidez_id
      INTO v_prov_id
      FROM public.avance_efectivo_solicitudes
     WHERE id = NEW.solicitud_id;
  END IF;

  IF v_prov_id IS NOT NULL THEN
    PERFORM public.assert_proveedor_activo(v_prov_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger BEFORE INSERT en transacciones_credicrc (bloquea cobros POS / QR de proveedores suspendidos o eliminados)
DROP TRIGGER IF EXISTS trg_verificar_proveedor_activo_tx ON public.transacciones_credicrc;
CREATE TRIGGER trg_verificar_proveedor_activo_tx
  BEFORE INSERT ON public.transacciones_credicrc
  FOR EACH ROW
  EXECUTE FUNCTION public.verificar_estado_comercio_activo_trg();

-- Trigger BEFORE INSERT en orders (bloquea pedidos de Tienda Online a proveedores suspendidos o eliminados)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_verificar_proveedor_activo_orders ON public.orders';
    EXECUTE 'CREATE TRIGGER trg_verificar_proveedor_activo_orders BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.verificar_estado_comercio_activo_trg()';
  END IF;
END $$;

-- Trigger BEFORE INSERT OR UPDATE en productos_proveedor (bloquea edición de catálogo de proveedores suspendidos o eliminados)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'productos_proveedor') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_verificar_proveedor_activo_productos ON public.productos_proveedor';
    EXECUTE 'CREATE TRIGGER trg_verificar_proveedor_activo_productos BEFORE INSERT OR UPDATE ON public.productos_proveedor FOR EACH ROW EXECUTE FUNCTION public.verificar_estado_comercio_activo_trg()';
  END IF;
END $$;

-- Trigger BEFORE INSERT en avance_efectivo_solicitudes y avance_efectivo_cuotas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'avance_efectivo_solicitudes') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_verificar_proveedor_activo_avances ON public.avance_efectivo_solicitudes';
    EXECUTE 'CREATE TRIGGER trg_verificar_proveedor_activo_avances BEFORE INSERT ON public.avance_efectivo_solicitudes FOR EACH ROW EXECUTE FUNCTION public.verificar_estado_comercio_activo_trg()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'avance_efectivo_cuotas') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_verificar_proveedor_activo_avance_cuotas ON public.avance_efectivo_cuotas';
    EXECUTE 'CREATE TRIGGER trg_verificar_proveedor_activo_avance_cuotas BEFORE INSERT ON public.avance_efectivo_cuotas FOR EACH ROW EXECUTE FUNCTION public.verificar_estado_comercio_activo_trg()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'linea_domestica_solicitudes') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_verificar_proveedor_activo_ld ON public.linea_domestica_solicitudes';
    EXECUTE 'CREATE TRIGGER trg_verificar_proveedor_activo_ld BEFORE INSERT ON public.linea_domestica_solicitudes FOR EACH ROW EXECUTE FUNCTION public.verificar_estado_comercio_activo_trg()';
  END IF;
END $$;

-- Inyección aditiva en funciones RPC de cobro/validación QR (validar_y_consumir_qr y crear_transaccion_credicrc)
DO $$
DECLARE
  r RECORD;
  v_def TEXT;
  v_new_def TEXT;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('validar_y_consumir_qr', 'crear_transaccion_credicrc', 'crear_pedido_online', 'agregar_producto_proveedor')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF v_def NOT ILIKE '%assert_proveedor_activo%' AND v_def ILIKE '%p_proveedor_id%' THEN
      v_new_def := regexp_replace(
        v_def,
        '\yBEGIN\y',
        E'BEGIN\n  PERFORM public.assert_proveedor_activo(p_proveedor_id);',
        ''
      );
      IF v_new_def <> v_def THEN
        EXECUTE v_new_def;
      END IF;
    END IF;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso no bloqueante al actualizar RPCs con assert_proveedor_activo: %', SQLERRM;
END $$;
