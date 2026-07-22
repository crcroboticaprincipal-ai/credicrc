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
    const { trabajador_id, monto_usd } = record;

    if (!trabajador_id) {
      return new Response(JSON.stringify({ success: false, error: "trabajador_id requerido", receivedPayload: payload }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (!RESEND_API_KEY || !SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Configuración del servidor incompleta" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Obtener email del trabajador
    const { data: usuario, error: userError } = await supabase
      .from("usuarios_credicrc")
      .select("email, nombre")
      .eq("trabajador_id", trabajador_id)
      .maybeSingle();

    if (userError || !usuario?.email) {
      console.error("[payment-notification] Email del trabajador no encontrado:", userError?.message);
      return new Response(JSON.stringify({ success: false, error: "Email del trabajador no encontrado" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const montoStr = monto_usd ? `$${parseFloat(monto_usd).toFixed(2)} USD` : "monto a confirmar";
    const fechaStr = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric" });

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pago Confirmado — CrediCRC</title></head>
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
          <td style="background:linear-gradient(135deg,#059669,#10b981);padding:12px 24px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;">✅ Pago Verificado y Confirmado</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px;">
            <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.7;">
              Estimado/a <strong>${usuario.nombre || "Trabajador"}</strong>, 
              tu pago de <strong style="color:#059669;">${montoStr}</strong> correspondiente 
              a tu cuota del sistema CrediCRC ha sido <strong>verificado y registrado</strong> exitosamente 
              el <strong>${fechaStr}</strong>.
            </p>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
              <p style="margin:0;color:#065f46;font-size:13px;font-weight:700;">🎯 Tu historial de pagos ha sido actualizado</p>
              <p style="margin:6px 0 0;color:#374151;font-size:13px;line-height:1.6;">
                Los pagos puntuales suman puntos a tu nivel de crédito. ¡Sigue así para desbloquear mejores límites y beneficios!
              </p>
            </div>

            <table width="100%"><tr><td align="center">
              <a href="https://credicrc.app" style="display:inline-block;background:linear-gradient(135deg,#002855,#073B73);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:13px 32px;border-radius:9px;">
                Ver Mi Portal →
              </a>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
              U.E. Colegio Rafael Castillo — Duaca, Estado Lara, Venezuela<br>
              Este es un correo automático, por favor no responder directamente.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [usuario.email],
        subject: `[CrediCRC] ✅ Pago Confirmado — ${montoStr}`,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("[payment-notification] Error Resend:", JSON.stringify(resendData));
      return new Response(JSON.stringify({ success: false, error: resendData?.message || "Error al enviar correo" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    console.log("[payment-notification] Correo enviado:", resendData.id, "→", usuario.email);
    return new Response(JSON.stringify({ success: true, emailId: resendData.id }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[payment-notification] Error inesperado:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
