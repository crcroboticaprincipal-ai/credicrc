import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
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
    const { email, nombre, rol } = record;

    if (!email || !nombre) {
      return new Response(JSON.stringify({ success: false, error: "email y nombre son requeridos", receivedPayload: payload }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (!RESEND_API_KEY) {
      console.error("[approval-notification] RESEND_API_KEY no configurado");
      return new Response(JSON.stringify({ success: false, error: "Servicio de correo no configurado" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const isProveedor = rol === "proveedor";
    const rolLabel = isProveedor ? "Comercio Aliado" : "Trabajador";
    const portalUrl = "https://credicrc.app";

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cuenta Aprobada — CrediCRC</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        
        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#002855 0%,#073B73 100%);padding:32px 24px;text-align:center;">
            <p style="margin:0 0 8px;color:#64B5F6;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">U.E. COLEGIO RAFAEL CASTILLO</p>
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;">Credi<span style="color:#E53935;">CRC</span></h1>
            <p style="margin:8px 0 0;color:#90CAF9;font-size:13px;">Sistema de Crédito Institucional</p>
          </td>
        </tr>

        <!-- SUCCESS BADGE -->
        <tr>
          <td style="background:linear-gradient(135deg,#059669,#10b981);padding:16px 24px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:0.3px;">
              ✅ ¡Tu cuenta ha sido APROBADA!
            </p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px 28px;">
            <h2 style="margin:0 0 8px;color:#002855;font-size:20px;font-weight:800;">¡Bienvenido/a, ${nombre}! 🎉</h2>
            <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.7;">
              Nos complace informarte que tu cuenta como <strong>${rolLabel}</strong> en <strong>CrediCRC</strong> ha sido 
              <strong style="color:#059669;">revisada y aprobada</strong> por la administración del Colegio Rafael Castillo.
              Ya puedes acceder a la plataforma con tu correo y contraseña.
            </p>

            ${isProveedor ? `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
              <p style="margin:0;color:#065f46;font-size:13px;font-weight:700;">🏪 Como Comercio Aliado puedes:</p>
              <ul style="margin:8px 0 0;padding-left:20px;color:#374151;font-size:13px;line-height:1.8;">
                <li>Escanear el QR de identidad de los trabajadores</li>
                <li>Registrar ventas al crédito instantáneamente</li>
                <li>Consultar tu historial de transacciones</li>
                <li>Recibir liquidaciones según tu comisión acordada</li>
              </ul>
            </div>` : `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
              <p style="margin:0;color:#065f46;font-size:13px;font-weight:700;">👤 Como Trabajador puedes:</p>
              <ul style="margin:8px 0 0;padding-left:20px;color:#374151;font-size:13px;line-height:1.8;">
                <li>Generar tu QR de identificación personal</li>
                <li>Realizar compras a crédito en comercios aliados</li>
                <li>Consultar tu límite disponible y nivel de crédito</li>
                <li>Ver tu cronograma de cuotas y pagos</li>
              </ul>
            </div>`}

            <div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:0 0 28px;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Correo de acceso</p>
              <p style="margin:0;color:#002855;font-size:14px;font-weight:600;">${email}</p>
            </div>

            <table width="100%"><tr><td align="center">
              <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#002855,#073B73);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:16px 40px;border-radius:10px;letter-spacing:0.3px;">
                Acceder a CrediCRC →
              </a>
            </td></tr></table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 28px;text-align:center;">
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
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `[CrediCRC] ✅ ¡Tu cuenta de ${rolLabel} ha sido Aprobada!`,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("[approval-notification] Error de Resend:", JSON.stringify(resendData));
      return new Response(JSON.stringify({ success: false, error: resendData?.message || "Error al enviar correo", resendStatus: resendResponse.status }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    console.log("[approval-notification] Correo enviado:", resendData.id, "→", email, "rol:", rol);
    return new Response(JSON.stringify({ success: true, emailId: resendData.id }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[approval-notification] Error inesperado:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
