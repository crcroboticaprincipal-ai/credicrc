import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const payload = await req.json();
    const { action, proveedor_id, producto_id, nombre, descripcion, precio, imagen_url, activo, stock_disponible } = payload;

    if (!SUPABASE_SERVICE_KEY) {
      console.error("[manage-product] SUPABASE_SERVICE_ROLE_KEY no configurada");
      return new Response(JSON.stringify({ success: false, error: "Servidor sin Service Role Key" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (action === 'add') {
      if (!proveedor_id || !nombre || precio === undefined) {
        return new Response(JSON.stringify({ success: false, error: "Faltan campos requeridos (proveedor_id, nombre, precio)" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      // Verificar límite de 10 productos activos
      const { count, error: countErr } = await supabase
        .from('productos_proveedor')
        .select('id', { count: 'exact', head: true })
        .eq('proveedor_id', proveedor_id)
        .eq('activo', true);

      if (countErr) throw countErr;

      if ((count || 0) >= 10) {
        return new Response(JSON.stringify({ success: false, error: "Límite alcanzado: máximo 10 productos activos por proveedor." }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const { data, error } = await supabase
        .from('productos_proveedor')
        .insert([{
          proveedor_id,
          nombre: String(nombre).trim(),
          descripcion: descripcion ? String(descripcion).trim() : null,
          precio: parseFloat(precio),
          imagen_url: imagen_url || null,
          stock_disponible: stock_disponible !== undefined ? stock_disponible : true,
          activo: activo !== undefined ? activo : true
        }])
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, producto: data }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (action === 'toggle') {
      if (!producto_id) {
        return new Response(JSON.stringify({ success: false, error: "producto_id requerido" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const updates: any = { updated_at: new Date().toISOString() };
      if (activo !== undefined) updates.activo = activo;
      if (stock_disponible !== undefined) updates.stock_disponible = stock_disponible;

      const { data, error } = await supabase
        .from('productos_proveedor')
        .update(updates)
        .eq('id', producto_id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, producto: data }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (action === 'delete') {
      if (!producto_id) {
        return new Response(JSON.stringify({ success: false, error: "producto_id requerido" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const { error } = await supabase
        .from('productos_proveedor')
        .delete()
        .eq('id', producto_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Acción no válida" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[manage-product error]:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
