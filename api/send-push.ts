import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Configuración de CORS
const setCorsHeaders = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  try {
    const { tipo, userId, target, titulo, cuerpo, urlDestino } = req.body;

    if (!titulo || !cuerpo) {
      return res.status(400).json({ error: 'Título y Cuerpo son campos requeridos.' });
    }

    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
    const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@credicrc.app';

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Claves VAPID no configuradas en el servidor.' });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ghjbudoeuxgpcghkhasa.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurado en el servidor.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload = JSON.stringify({
      titulo,
      cuerpo,
      urlDestino: urlDestino || '/'
    });

    let totalSent = 0;
    let totalFailed = 0;

    // ─── CASO 1: ENVÍO INDIVIDUAL ─────────────────────────────────────────────
    if (tipo === 'individual') {
      if (!userId) {
        return res.status(400).json({ error: 'userId requerido para envío individual.' });
      }

      const { data: tokens, error } = await supabase
        .from('device_tokens')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId);

      if (error) throw error;

      if (!tokens || tokens.length === 0) {
        return res.status(200).json({ success: true, sent: 0, failed: 0, message: 'Usuario sin dispositivos registrados.' });
      }

      const promises = tokens.map(async (token) => {
        const subscription = {
          endpoint: token.endpoint,
          keys: {
            p256dh: token.p256dh,
            auth: token.auth
          }
        };

        try {
          await webpush.sendNotification(subscription, payload);
          totalSent++;
        } catch (err: any) {
          console.error(`[Push Error] Dispositivo ${token.id}:`, err.statusCode || err.message);
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[Push Cleanup] Eliminando token obsoleto: ${token.id}`);
            await supabase.from('device_tokens').delete().eq('id', token.id);
          }
          totalFailed++;
        }
      });

      await Promise.all(promises);
      return res.status(200).json({ success: true, sent: totalSent, failed: totalFailed });
    }

    // ─── CASO 2: ENVÍO MASIVO / SEGMENTADO ─────────────────────────────────────
    let page = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      let query;

      if (target === 'profesores') {
        query = supabase
          .from('device_tokens')
          .select('id, endpoint, p256dh, auth, user_id, usuarios_credicrc!inner(rol)')
          .eq('usuarios_credicrc.rol', 'trabajador');
      } else if (target === 'proveedores') {
        query = supabase
          .from('device_tokens')
          .select('id, endpoint, p256dh, auth, user_id, usuarios_credicrc!inner(rol)')
          .eq('usuarios_credicrc.rol', 'proveedor');
      } else {
        query = supabase
          .from('device_tokens')
          .select('id, endpoint, p256dh, auth, user_id');
      }

      const { data: tokens, error } = await query
        .range(page * limit, (page + 1) * limit - 1);

      if (error) throw error;

      if (!tokens || tokens.length === 0) {
        hasMore = false;
        break;
      }

      const promises = tokens.map(async (token) => {
        const subscription = {
          endpoint: token.endpoint,
          keys: {
            p256dh: token.p256dh,
            auth: token.auth
          }
        };

        try {
          await webpush.sendNotification(subscription, payload);
          totalSent++;
        } catch (err: any) {
          console.error(`[Push Error] Dispositivo ${token.id}:`, err.statusCode || err.message);
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[Push Cleanup] Eliminando token obsoleto: ${token.id}`);
            await supabase.from('device_tokens').delete().eq('id', token.id);
          }
          totalFailed++;
        }
      });

      await Promise.all(promises);

      if (tokens.length < limit) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return res.status(200).json({ success: true, sent: totalSent, failed: totalFailed });

  } catch (error: any) {
    console.error('[Push Endpoint Error]:', error.message || error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
