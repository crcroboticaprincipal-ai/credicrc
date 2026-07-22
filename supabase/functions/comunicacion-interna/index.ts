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
    const { audience, subject, title, body } = await req.json();

    if (!audience || !subject || !title || !body) {
      return new Response(JSON.stringify({ success: false, error: "Todos los campos son requeridos" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (!RESEND_API_KEY || !SUPABASE_SERVICE_KEY) {
      console.error("[comunicacion-interna] Secrets faltantes");
      return new Response(JSON.stringify({ success: false, error: "Configuración del servidor incompleta" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Determinar destinatarios
    let query = supabase.from("usuarios_credicrc").select("email, nombre, rol").eq("aprobado", true);

    if (audience === "profesores") {
      query = query.eq("rol", "trabajador");
    } else if (audience === "proveedores") {
      query = query.eq("rol", "proveedor");
    }

    const { data: users, error: uErr } = await query;
    if (uErr) throw uErr;

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No se encontraron destinatarios activos." }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Filtrar duplicados o nulos por si acaso
    const uniqueUsers = users.filter((u, index, self) => 
      u.email && self.findIndex(t => t.email === u.email) === index
    );

    // 2. Construir correos
    const buildHtml = (nombre: string, msgTitle: string, msgBody: string) => {
      const bodyParagraphs = msgBody
        .split("\n\n")
        .map(p => `<p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.7;">${p.replace(/\n/g, "<br>")}</p>`)
        .join("");

      return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${msgTitle}</title>
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
            <p style="margin:8px 0 0;color:#90CAF9;font-size:13px;">Comunicado Oficial de la Institución</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px 28px;">
            <h2 style="margin:0 0 16px;color:#002855;font-size:18px;font-weight:800;">Hola, ${nombre} 👋</h2>
            <div style="border-left:4px solid #E53935; padding-left:16px; margin:0 0 24px;">
              <h3 style="margin:0;color:#002855;font-size:16px;font-weight:900;line-height:1.4;">${msgTitle}</h3>
            </div>
            
            ${bodyParagraphs}

            <table width="100%" style="margin-top:28px;"><tr><td align="center">
              <a href="https://credicrc.app" style="display:inline-block;background:linear-gradient(135deg,#002855,#073B73);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 32px;border-radius:9px;">
                Acceder al Portal →
              </a>
            </td></tr></table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 28px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
              U.E. Colegio Rafael Castillo — Duaca, Estado Lara, Venezuela<br>
              Este es un canal de comunicación masiva oficial de CrediCRC.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    };

    // Lotes de 100
    const BATCH_SIZE = 100;
    const batches = [];
    for (let i = 0; i < uniqueUsers.length; i += BATCH_SIZE) {
      batches.push(uniqueUsers.slice(i, i + BATCH_SIZE));
    }

    let okCount = 0;
    let failCount = 0;

    for (const batch of batches) {
      const emailPayload = batch.map(u => ({
        from: FROM_EMAIL,
        to: [u.email],
        subject: subject,
        html: buildHtml(u.nombre, title, body)
      }));

      try {
        const resendRes = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(emailPayload)
        });

        const resData = await resendRes.json();
        
        if (resendRes.ok) {
          okCount += batch.length;
        } else {
          console.error("[comunicacion-interna] Falló envío:", JSON.stringify(resData));
          failCount += batch.length;
        }
      } catch (batchErr) {
        console.error("[comunicacion-interna] Error de red:", batchErr.message);
        failCount += batch.length;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      sent: okCount, 
      failed: failCount, 
      total: uniqueUsers.length 
    }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[comunicacion-interna] Error:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
