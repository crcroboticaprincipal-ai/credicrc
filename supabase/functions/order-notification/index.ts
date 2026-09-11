import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM_EMAIL = "CrediCRC <noreply@credicrc.app>";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const payload = await req.json();
    const isWebhook = payload.record !== undefined;
    const record = isWebhook ? payload.record : payload;
    const order_id = isWebhook ? record.id : (record.order_id || record.id);

    if (!order_id) {
      return new Response(JSON.stringify({ success: false, error: "order_id requerido", receivedPayload: payload }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (!RESEND_API_KEY || !SUPABASE_SERVICE_KEY) {
      console.error("[order-notification] Secrets faltantes");
      return new Response(JSON.stringify({ success: false, error: "Configuración del servidor incompleta" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let order: any = null;

    // 1. Obtener datos del pedido (probar tabla orders, payload u objeto en datos_registro)
    const { data: dbOrder } = await supabase
      .from("orders")
      .select(`
        id, order_number, monto_total_usd, monto_total_ves, tasa_bcv,
        delivery_method, delivery_address, notas_trabajador, created_at,
        trabajador_id, proveedor_id,
        trabajadores_crc ( nombre, cedula ),
        proveedores_aliados ( nombre, categoria ),
        order_items ( nombre_producto, cantidad, precio_usd, subtotal_usd )
      `)
      .eq("id", order_id)
      .maybeSingle();

    if (dbOrder) {
      order = dbOrder;
    } else if (payload.order) {
      order = payload.order;
    } else {
      const { data: systemUsers } = await supabase.from("usuarios_credicrc").select("datos_registro");
      if (systemUsers) {
        for (const u of systemUsers) {
          if (u.datos_registro && Array.isArray(u.datos_registro.pedidos)) {
            const found = u.datos_registro.pedidos.find((p: any) => p.id === order_id);
            if (found) {
              order = found;
              break;
            }
          }
        }
      }
    }

    if (!order) {
      console.error("[order-notification] Pedido no encontrado:", order_id);
      return new Response(JSON.stringify({ success: false, error: "Pedido no encontrado" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    let proveedorNombre = (order.proveedores_aliados as any)?.nombre || order.proveedor?.nombre || "Comercio";
    let trabajadorNombre = (order.trabajadores_crc as any)?.nombre || order.trabajador?.nombre || "Trabajador";

    if (!proveedorNombre || proveedorNombre === "Comercio") {
      const { data: pRec } = await supabase.from("proveedores_aliados").select("nombre").eq("id", order.proveedor_id || "").maybeSingle();
      if (pRec?.nombre) proveedorNombre = pRec.nombre;
    }

    if (!trabajadorNombre || trabajadorNombre === "Trabajador") {
      const { data: wRec } = await supabase.from("trabajadores_crc").select("nombre").eq("id", order.trabajador_id || "").maybeSingle();
      if (wRec?.nombre) trabajadorNombre = wRec.nombre;
    }

    // 2. Obtener email del proveedor desde usuarios_credicrc
    const { data: usuarioProveedor } = await supabase
      .from("usuarios_credicrc")
      .select("email")
      .eq("proveedor_id", order.proveedor_id || "")
      .maybeSingle();

    const proveedorEmail = usuarioProveedor?.email || null;

    if (!proveedorEmail) {
      console.log("[order-notification] No se encontró email registrado para el proveedor ID:", order.proveedor_id);
      return new Response(JSON.stringify({ success: true, message: "Proveedor sin email registrado." }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const items = (order.order_items || []).map((i: any) => ({
      nombre_producto: i.nombre_producto || i.nombre || "Producto",
      cantidad: i.cantidad || 1,
      subtotal_usd: i.subtotal_usd || (i.precio_usd ? i.precio_usd * i.cantidad : 0)
    }));
    
    const montoTotalUsd = parseFloat(order.monto_total_usd || 0);
    const tasaBcvVal = parseFloat(order.tasa_bcv || 36.5);
    const montoTotalVes = parseFloat(order.monto_total_ves || (montoTotalUsd * tasaBcvVal));

    const montoUsd = montoTotalUsd.toFixed(2);
    const montoVes = montoTotalVes.toLocaleString("es-VE", { maximumFractionDigits: 2 });
    const fechaPedido = new Date(order.created_at || Date.now()).toLocaleDateString("es-VE", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });

    const itemsHtml = items.map((i: any) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; color: #1e293b; font-weight: 600;">${i.nombre_producto}</td>
        <td style="padding: 10px 12px; color: #475569; text-align: center;">×${i.cantidad}</td>
        <td style="padding: 10px 12px; color: #002855; font-weight: 800; text-align: right;">$${parseFloat(i.subtotal_usd).toFixed(2)} USD</td>
      </tr>
    `).join("");

    const htmlProveedor = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nuevo Pedido Online — CrediCRC</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        
        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#002855 0%,#073B73 100%);padding:28px 24px;text-align:center;">
            <p style="margin:0 0 4px;color:#64B5F6;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">U.E. COLEGIO RAFAEL CASTILLO</p>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:900;">Credi<span style="color:#E53935;">CRC</span></h1>
          </td>
        </tr>

        <!-- BADGE -->
        <tr>
          <td style="background:#002855;padding:12px 24px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:14px;font-weight:800;">🛒 ¡NUEVO PEDIDO ONLINE RECIBIDO! #${order.order_number}</p>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td style="padding:28px 28px;">
            <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.7;">
              Estimado/a representante de <strong>${proveedorNombre}</strong>, has recibido un nuevo pedido a través de la Tienda Online el <strong>${fechaPedido}</strong>.
            </p>

            <!-- DETALLES TRABAJADOR Y METODO -->
            <table width="100%" cellpadding="10" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 20px;font-size:13px;">
              <tr>
                <td style="color:#64748b;font-weight:700;">Cliente (Trabajador):</td>
                <td style="color:#002855;font-weight:800;text-align:right;">${trabajadorNombre}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:700;">Método de Entrega:</td>
                <td style="color:#002855;font-weight:800;text-align:right;">
                  ${order.delivery_method === 'pickup' ? '🏪 Retiro en Tienda (con QR)' : '🚚 Delivery a domicilio'}
                </td>
              </tr>
              ${order.delivery_address ? `
              <tr>
                <td style="color:#64748b;font-weight:700;">Dirección de Envío:</td>
                <td style="color:#334155;font-weight:700;text-align:right;">${order.delivery_address}</td>
              </tr>` : ''}
              ${order.notas_trabajador ? `
              <tr>
                <td style="color:#64748b;font-weight:700;">Notas especiales:</td>
                <td style="color:#d97706;font-weight:700;text-align:right;">${order.notas_trabajador}</td>
              </tr>` : ''}
            </table>

            <!-- LISTA DE PRODUCTOS -->
            <p style="margin:0 0 8px;color:#002855;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Productos Solicitados</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;margin:0 0 20px;font-size:13px;overflow:hidden;">
              <thead>
                <tr style="background:#f1f5f9;color:#475569;font-size:11px;text-transform:uppercase;">
                  <th style="padding:8px 12px;text-align:left;">Producto</th>
                  <th style="padding:8px 12px;text-align:center;">Cant.</th>
                  <th style="padding:8px 12px;text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- TOTAL -->
            <div style="background:linear-gradient(135deg,#002855,#073B73);border-radius:12px;padding:16px 20px;color:#ffffff;margin:0 0 24px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:700;text-transform:uppercase;">Total del Pedido</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:900;">$${montoUsd} USD</p>
              </div>
              <div style="text-align:right;">
                <p style="margin:0;color:#93c5fd;font-size:11px;">Equivalente BCV</p>
                <p style="margin:4px 0 0;font-size:14px;font-weight:700;">Bs. ${montoVes}</p>
              </div>
            </div>

            <!-- INSTRUCCIONES DE ACCIÓN -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin:0 0 24px;">
              <p style="margin:0;color:#166534;font-size:12px;font-weight:700;">⚡ ¿Qué debes hacer ahora?</p>
              <p style="margin:6px 0 0;color:#14532d;font-size:12px;line-height:1.6;">
                1. Abre tu aplicación <strong>CrediCRC</strong>.<br>
                2. Entra al menú <strong>Pedidos</strong> y presiona <strong>"✅ Aceptar Pedido"</strong>.<br>
                3. Una vez listo, marca como preparado o entrega al trabajador.
              </p>
            </div>

            <table width="100%"><tr><td align="center">
              <a href="https://credicrc.app" style="display:inline-block;background:linear-gradient(135deg,#002855,#073B73);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:14px 36px;border-radius:10px;">
                Gestionar Pedido en Mi App →
              </a>
            </td></tr></table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
              U.E. Colegio Rafael Castillo — Duaca, Estado Lara, Venezuela<br>
              Ref. Pedido: <code style="font-size:10px;">${order.order_number}</code>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // 3. Despachar correo vía Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [proveedorEmail],
        subject: `[CrediCRC] 🛒 ¡Nuevo Pedido Online Recibido! - Pedido #${order.order_number}`,
        html: htmlProveedor,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("[order-notification] Error Resend:", JSON.stringify(resendData));
      return new Response(JSON.stringify({ success: false, error: resendData?.message || "Error al enviar correo" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    console.log("[order-notification] Correo de pedido enviado:", resendData.id, "→", proveedorEmail);
    return new Response(JSON.stringify({ success: true, emailId: resendData.id }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[order-notification] Error inesperado:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
