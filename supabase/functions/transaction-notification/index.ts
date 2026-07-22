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
    const transaccion_id = isWebhook ? record.id : record.transaccion_id;

    if (!transaccion_id) {
      return new Response(JSON.stringify({ success: false, error: "transaccion_id requerido", receivedPayload: payload }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (!RESEND_API_KEY || !SUPABASE_SERVICE_KEY) {
      console.error("[transaction-notification] Secrets faltantes");
      return new Response(JSON.stringify({ success: false, error: "Configuración del servidor incompleta" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Obtener la transacción con datos relacionados y IDs de clave externa
    const { data: tx, error: txError } = await supabase
      .from("transacciones_credicrc")
      .select(`
        id, monto_usd, monto_ves, tasa_bcv, dias_financiamiento,
        monto_inicial_pagado_usd, comision_monto_usd, fecha_transaccion,
        trabajador_id, proveedor_id,
        trabajadores_crc ( nombre, cedula ),
        proveedores_aliados ( nombre, categoria )
      `)
      .eq("id", transaccion_id)
      .maybeSingle();

    if (txError || !tx) {
      console.error("[transaction-notification] Transaccion no encontrada:", txError?.message);
      return new Response(JSON.stringify({ success: false, error: "Transacción no encontrada" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Obtener email del trabajador
    const { data: usuarioTrabajador } = await supabase
      .from("usuarios_credicrc")
      .select("email")
      .eq("trabajador_id", tx.trabajador_id || "")
      .maybeSingle();

    // Obtener email del proveedor
    const { data: usuarioProveedor } = await supabase
      .from("usuarios_credicrc")
      .select("email")
      .eq("proveedor_id", tx.proveedor_id || "")
      .maybeSingle();

    const trabajadorEmail = usuarioTrabajador?.email || null;
    const proveedorEmail = usuarioProveedor?.email || null;

    const trabajadorNombre = (tx.trabajadores_crc as any)?.nombre || "Trabajador";
    const trabajadorCedula = (tx.trabajadores_crc as any)?.cedula || "Cédula no registrada";
    const proveedorNombre = (tx.proveedores_aliados as any)?.nombre || "Comercio";
    
    const montoTotalVal = parseFloat(tx.monto_usd);
    const inicialVal = parseFloat(tx.monto_inicial_pagado_usd);
    const comisionVal = parseFloat(tx.comision_monto_usd);
    
    const montoUsd = montoTotalVal.toFixed(2);
    const montoVes = parseFloat(tx.monto_ves).toLocaleString("es-VE", { maximumFractionDigits: 2 });
    const inicialUsd = inicialVal.toFixed(2);
    const comisionUsd = comisionVal.toFixed(2);
    const netoUsd = (montoTotalVal - comisionVal).toFixed(2);

    const diasFin = tx.dias_financiamiento;
    const fechaTx = new Date(tx.fecha_transaccion).toLocaleDateString("es-VE", {
      day: "2-digit", month: "long", year: "numeric"
    });

    const htmlTrabajador = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Confirmación de Compra — CrediCRC</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#002855 0%,#073B73 100%);padding:28px 24px;text-align:center;">
            <p style="margin:0 0 4px;color:#64B5F6;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">U.E. COLEGIO RAFAEL CASTILLO</p>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:900;">Credi<span style="color:#E53935;">CRC</span></h1>
          </td>
        </tr>
        <tr>
          <td style="background:#1e40af;padding:12px 24px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;">🧾 Confirmación de Compra a Crédito</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px;">
            <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.7;">
              Estimado/a <strong>${trabajadorNombre}</strong>, tu compra en <strong>${proveedorNombre}</strong> 
              fue procesada exitosamente el <strong>${fechaTx}</strong>.
            </p>

            <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;margin:0 0 24px;font-size:13px;">
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Comercio / Negocio</td>
                <td style="color:#002855;font-weight:800;text-align:right;border-bottom:1px solid #e2e8f0;">${proveedorNombre}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Monto Total</td>
                <td style="color:#002855;font-weight:800;text-align:right;border-bottom:1px solid #e2e8f0;">$${montoUsd} USD</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Equivalente en Bs.</td>
                <td style="color:#374151;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">Bs. ${montoVes}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Pago Inicial</td>
                <td style="color:#059669;font-weight:800;text-align:right;border-bottom:1px solid #e2e8f0;">$${inicialUsd} USD</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:700;">Financiamiento</td>
                <td style="color:#374151;font-weight:700;text-align:right;">${diasFin} días (nómina)</td>
              </tr>
            </table>

            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:0 0 24px;">
              <p style="margin:0;color:#92400e;font-size:12px;font-weight:700;">⚠️ Recuerda</p>
              <p style="margin:6px 0 0;color:#78350f;font-size:12px;line-height:1.6;">
                La cuota de financiamiento será descontada automáticamente de tu próxima nómina. Asegúrate de mantener fondos suficientes para evitar el bloqueo de tu portal.
              </p>
            </div>

            <table width="100%"><tr><td align="center">
              <a href="https://credicrc.app" style="display:inline-block;background:linear-gradient(135deg,#002855,#073B73);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:13px 32px;border-radius:9px;">
                Ver Mis Cuotas →
              </a>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
              U.E. Colegio Rafael Castillo — Duaca, Estado Lara, Venezuela<br>
              Ref. Transacción: <code style="font-size:10px;">${transaccion_id}</code>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const htmlProveedor = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nueva Venta Registrada — CrediCRC</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#002855 0%,#073B73 100%);padding:28px 24px;text-align:center;">
            <p style="margin:0 0 4px;color:#64B5F6;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">U.E. COLEGIO RAFAEL CASTILLO</p>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:900;">Credi<span style="color:#E53935;">CRC</span></h1>
          </td>
        </tr>
        <tr>
          <td style="background:#059669;padding:12px 24px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;">🛍️ Venta Registrada Exitosamente</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px;">
            <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.7;">
              Estimado/a representante de <strong>${proveedorNombre}</strong>, se ha registrado una nueva venta a crédito en tu comercio el <strong>${fechaTx}</strong>.
            </p>

            <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;margin:0 0 24px;font-size:13px;">
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Cliente (Trabajador)</td>
                <td style="color:#002855;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">${trabajadorNombre}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Cédula Cliente</td>
                <td style="color:#374151;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">${trabajadorCedula}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Monto Total de Venta</td>
                <td style="color:#002855;font-weight:800;text-align:right;border-bottom:1px solid #e2e8f0;">$${montoUsd} USD</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Equivalente en Bs.</td>
                <td style="color:#374151;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">Bs. ${montoVes}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Pago Inicial Recibido (Caja)</td>
                <td style="color:#059669;font-weight:800;text-align:right;border-bottom:1px solid #e2e8f0;">$${inicialUsd} USD</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Comisión del Colegio</td>
                <td style="color:#e53935;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">-$${comisionUsd} USD</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:700;">Neto a Liquidar</td>
                <td style="color:#002855;font-weight:800;text-align:right;">$${netoUsd} USD</td>
              </tr>
            </table>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin:0 0 24px;">
              <p style="margin:0;color:#166534;font-size:12px;font-weight:700;">📌 Proceso de Conciliación</p>
              <p style="margin:6px 0 0;color:#14532d;font-size:12px;line-height:1.6;">
                Esta transacción queda registrada en tu balance de conciliación mensual. Puedes consultar y descargar el historial completo de ventas desde tu panel.
              </p>
            </div>

            <table width="100%"><tr><td align="center">
              <a href="https://credicrc.app" style="display:inline-block;background:linear-gradient(135deg,#002855,#073B73);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:13px 32px;border-radius:9px;">
                Ver Mi Panel de Comercio →
              </a>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
              U.E. Colegio Rafael Castillo — Duaca, Estado Lara, Venezuela<br>
              Ref. Transacción: <code style="font-size:10px;">${transaccion_id}</code>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emails = [];

    // 1. Enviar al trabajador (si tiene email)
    if (trabajadorEmail) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [trabajadorEmail],
          subject: `[CrediCRC] 🧾 Confirmación de Compra — $${montoUsd} en ${proveedorNombre}`,
          html: htmlTrabajador,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        console.error("[transaction-notification] Error Resend (trabajador):", JSON.stringify(d));
      } else {
        emails.push(d.id);
        console.log("[transaction-notification] Correo trabajador enviado:", d.id);
      }
    }

    // 2. Enviar al proveedor (si tiene email)
    if (proveedorEmail) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [proveedorEmail],
          subject: `[CrediCRC] 🛍️ Venta Registrada — $${montoUsd} de ${trabajadorNombre}`,
          html: htmlProveedor,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        console.error("[transaction-notification] Error Resend (proveedor):", JSON.stringify(d));
      } else {
        emails.push(d.id);
        console.log("[transaction-notification] Correo proveedor enviado:", d.id);
      }
    }

    return new Response(JSON.stringify({ success: true, emailsSent: emails.length, emailIds: emails }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[transaction-notification] Error inesperado:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
