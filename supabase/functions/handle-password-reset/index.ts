import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://ghjbudoeuxgpcghkhasa.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const FROM_EMAIL = "CrediCRC <noreply@credicrc.app>";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const payload = await req.json();
    const { action, email, token, password } = payload;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── ACTION: REQUEST (SOLICITAR RECUPERACIÓN DE CLAVE) ─────────────────────
    if (action === "request") {
      if (!email) {
        return new Response(JSON.stringify({ success: false, error: "Correo electrónico requerido" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const cleanEmail = email.trim().toLowerCase();

      // 1. Buscar usuario por email
      const { data: users, error: searchErr } = await supabase
        .from("usuarios_credicrc")
        .select("id, email, nombre")
        .ilike("email", cleanEmail)
        .limit(1);

      if (searchErr) {
        console.error("[handle-password-reset] Error buscando usuario:", searchErr.message);
        return new Response(JSON.stringify({ success: false, error: "Error consultando usuario" }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      if (!users || users.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No existe una cuenta registrada con este correo electrónico." }), {
          status: 200, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const user = users[0];
      const resetToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora de validez

      // 2. Guardar token en usuario
      const { error: updateErr } = await supabase
        .from("usuarios_credicrc")
        .update({
          reset_token: resetToken,
          reset_token_expires: expiresAt
        })
        .eq("id", user.id);

      if (updateErr) {
        console.error("[handle-password-reset] Error actualizando token:", updateErr.message);
        return new Response(JSON.stringify({ success: false, error: "Error al generar enlace de recuperación" }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      // 3. Enviar correo vía Resend
      const resetUrl = `https://credicrc.app/?token=${resetToken}`;

      const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablecimiento de Contraseña — CrediCRC</title>
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

        <!-- BANNER INFO -->
        <tr>
          <td style="background:linear-gradient(135deg,#0284c7,#0369a1);padding:14px 24px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.3px;">
              🔐 Solicitud de Restablecimiento de Contraseña
            </p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px 28px;">
            <h2 style="margin:0 0 8px;color:#002855;font-size:20px;font-weight:800;">Hola, ${user.nombre} 👋</h2>
            <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.7;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>CrediCRC</strong>. 
              Si realizaste esta solicitud, haz clic en el siguiente botón para ingresar tu nueva clave de acceso:
            </p>

            <table width="100%" style="margin:28px 0;"><tr><td align="center">
              <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#002855,#073B73);color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;padding:16px 36px;border-radius:12px;box-shadow:0 4px 12px rgba(0,40,85,0.25);">
                🔑 Restablecer mi Contraseña →
              </a>
            </td></tr></table>

            <div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
              <p style="margin:0;color:#856404;font-size:12px;font-weight:700;">⏳ Información Importante de Seguridad:</p>
              <ul style="margin:6px 0 0;padding-left:18px;color:#664d03;font-size:12px;line-height:1.6;">
                <li>Este enlace es de uso único y vencerá automáticamente en <strong>1 hora</strong>.</li>
                <li>Si no solicitaste este cambio, puedes ignorar este correo; tu contraseña actual continuará siendo segura.</li>
              </ul>
            </div>

            <div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:10px;padding:14px 20px;margin:0 0 20px;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">¿El botón no funciona?</p>
              <p style="margin:0;color:#475569;font-size:11px;word-break:break-all;font-family:monospace;">${resetUrl}</p>
            </div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 28px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
              U.E. Colegio Rafael Castillo — Duaca, Estado Lara, Venezuela<br>
              Este es un correo de seguridad automático, por favor no responder directamente.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      if (!RESEND_API_KEY) {
        console.error("[handle-password-reset] RESEND_API_KEY no está configurado.");
        return new Response(JSON.stringify({ success: false, error: "Servicio de correo no configurado." }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [user.email],
          subject: "[CrediCRC] 🔐 Restablecimiento de Contraseña",
          html,
        }),
      });

      const resendData = await resendRes.json();
      if (!resendRes.ok) {
        console.error("[handle-password-reset] Error de Resend:", JSON.stringify(resendData));
        return new Response(JSON.stringify({ success: false, error: resendData?.message || "Error al enviar el correo." }), {
          status: 200, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ success: true, emailId: resendData.id }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ─── ACTION: CONFIRM (CAMBIAR LA CLAVE CON TOKEN VÁLIDO) ───────────────────
    if (action === "confirm") {
      if (!token || !password) {
        return new Response(JSON.stringify({ success: false, error: "Token y contraseña requeridos" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      // 1. Buscar usuario por reset_token
      const { data: users, error: findErr } = await supabase
        .from("usuarios_credicrc")
        .select("id, reset_token_expires")
        .eq("reset_token", token)
        .limit(1);

      if (findErr) {
        console.error("[handle-password-reset] Error verificando token:", findErr.message);
        return new Response(JSON.stringify({ success: false, error: "Error al verificar el token de recuperación." }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      if (!users || users.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "El token de recuperación es inválido o ya fue utilizado." }), {
          status: 200, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      const user = users[0];

      // 2. Verificar que no haya expirado
      if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
        return new Response(JSON.stringify({ success: false, error: "El enlace de recuperación ha expirado. Por favor solicita uno nuevo." }), {
          status: 200, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      // 3. Actualizar la contraseña y limpiar los campos de reset
      const { error: updateErr } = await supabase
        .from("usuarios_credicrc")
        .update({
          password: password,
          reset_token: null,
          reset_token_expires: null
        })
        .eq("id", user.id);

      if (updateErr) {
        console.error("[handle-password-reset] Error actualizando contraseña:", updateErr.message);
        return new Response(JSON.stringify({ success: false, error: "Error actualizando la contraseña." }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Acción no reconocida" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[handle-password-reset] Excepción general:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
