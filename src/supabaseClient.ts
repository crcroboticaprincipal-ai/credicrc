import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL as string ||
  'https://ghjbudoeuxgpcghkhasa.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY as string ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoamJ1ZG9ldXhncGNnaGtoYXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI2MDQsImV4cCI6MjA5NzIwODYwNH0.BSmFFIYSlXX1tPHSXnweBjkFqauseVntZ5w99ibp4Cs';

// ─── Cliente optimizado para alta concurrencia ────────────────────────────────
// - Headers de trazabilidad para monitoreo en Supabase Pro
// - Límite de eventos en tiempo real para evitar saturación de canales
// - Auth autoRefresh y persistSession para reducir re-autenticaciones
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'x-app-name': 'CrediCRC',
      'x-app-version': '2.2',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// ─── DETECTOR DE CONECTIVIDAD DE RED ─────────────────────────────────────────
// Muestra un banner rojo cuando el móvil pierde señal (Wi-Fi ↔ datos).
// Al recuperar la red, reconecta el canal Realtime de Supabase y oculta el banner.
function getOfflineBanner(): HTMLElement {
  let banner = document.getElementById('credicrc-offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'credicrc-offline-banner';
    banner.textContent = '⚡ Sin conexión — Reconectando automáticamente...';
    document.body.prepend(banner);
  }
  return banner;
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    const banner = getOfflineBanner();
    banner.classList.add('visible');
    console.warn('[CrediCRC] Conexión perdida. Modo offline activado.');
  });

  window.addEventListener('online', () => {
    const banner = document.getElementById('credicrc-offline-banner');
    if (banner) banner.classList.remove('visible');
    // Reconectar canales Realtime de Supabase tras recuperar la red
    supabase.realtime.connect();
    console.info('[CrediCRC] Conexión restaurada. Realtime reconectado.');
  });
}
