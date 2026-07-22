// ─── CrediCRC Service Worker v1.0 ────────────────────────────────────────────
// Estrategia: Stale-While-Revalidate para assets estáticos
// Garantiza carga instantánea en conexiones de datos móviles inestables.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'credicrc-v1.1';
const CACHE_VERSION = 'credicrc-v1.1';

// Assets estáticos a pre-cachear durante la instalación
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/favicon.ico.png',
];

// ─── INSTALL: Pre-carga los assets críticos ───────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[CrediCRC SW] Instalando Service Worker v1.0...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[CrediCRC SW] Pre-cacheando assets de shell...');
      // addAll falla silenciosamente si algún asset no existe aún (ej. en dev)
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[CrediCRC SW] Algunos assets no pudieron pre-cachearse:', err);
      });
    }).then(() => {
      // Forzar activación inmediata sin esperar a que cierren las pestañas anteriores
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVATE: Limpia cachés desactualizadas ──────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[CrediCRC SW] Activando Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name.startsWith('credicrc-'))
          .map((name) => {
            console.log('[CrediCRC SW] Eliminando caché obsoleta:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Tomar control inmediato de todas las páginas abiertas
      return self.clients.claim();
    })
  );
});

// ─── FETCH: Stale-While-Revalidate ───────────────────────────────────────────
// Lógica:
//   1. Servir desde caché inmediatamente (respuesta rápida al usuario)
//   2. En paralelo, hacer fetch en background y actualizar caché
//   3. Si no hay caché, esperar al fetch de red
//   4. Si la red falla y no hay caché, retornar respuesta de fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Solo manejar peticiones GET del mismo origen o assets estáticos ─────────
  // No interceptar: peticiones a Supabase API, Resend, o POST requests
  if (
    request.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('resend.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/functions/')
  ) {
    // Pasar directamente a la red sin interferir
    return;
  }

  // ── Stale-While-Revalidate para assets estáticos ─────────────────────────
  event.respondWith(staleWhileRevalidate(request, event));
});

/**
 * Implementación de Stale-While-Revalidate:
 * - Retorna respuesta cacheada inmediatamente (si existe)
 * - Actualiza la caché en background con la respuesta de red
 */
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Lanzar fetch en background (sin await para no bloquear)
  const networkFetchPromise = fetch(request.clone())
    .then((networkResponse) => {
      // Solo cachear respuestas válidas (status 200, mismo origen)
      if (
        networkResponse &&
        networkResponse.status === 200 &&
        networkResponse.type !== 'error'
      ) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((err) => {
      console.warn('[CrediCRC SW] Red no disponible para:', request.url, err.message);
      return null;
    });

  // Si hay caché: retornar inmediatamente (stale) y revalidar en background
  if (cachedResponse) {
    // La revalidación ocurre en background — no bloqueamos al usuario
    event.waitUntil?.(networkFetchPromise);
    return cachedResponse;
  }

  // Si no hay caché: esperar respuesta de red
  const networkResponse = await networkFetchPromise;
  if (networkResponse) return networkResponse;

  // Fallback: si no hay ni caché ni red, retornar página offline mínima
  return new Response(
    `<!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CrediCRC - Sin Conexión</title>
      <style>
        body { margin: 0; font-family: Arial, sans-serif; background: #002855; 
               display: flex; align-items: center; justify-content: center; 
               min-height: 100vh; color: white; text-align: center; padding: 20px; box-sizing: border-box; }
        .card { background: rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 360px; }
        h1 { font-size: 28px; margin: 0 0 8px; }
        h1 span { color: #E53935; }
        p { color: #90CAF9; font-size: 14px; line-height: 1.6; }
        .icon { font-size: 48px; margin-bottom: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">📡</div>
        <h1>Credi<span>CRC</span></h1>
        <p>Sin conexión a internet. Verifica tu señal Wi-Fi o datos móviles e intenta nuevamente.</p>
      </div>
    </body>
    </html>`,
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

// ─── PUSH: Escucha alertas push del backend ──────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { titulo: 'CrediCRC', cuerpo: 'Nueva notificación', urlDestino: '/' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (err) {
      data = { titulo: 'CrediCRC', cuerpo: event.data.text(), urlDestino: '/' };
    }
  }

  const options = {
    body: data.cuerpo || data.mensaje || '',
    icon: '/logo.png', // Logo de CrediCRC
    badge: '/logo.png',
    data: {
      urlDestino: data.urlDestino || '/'
    },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(data.titulo || 'CrediCRC', options)
  );
});

// ─── NOTIFICATIONCLICK: Redirecciona al usuario al hacer clic ───────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlDestino = event.notification.data.urlDestino;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Buscar si ya hay una pestaña abierta con la app
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Enfocar pestaña existente y redirigir
          return client.navigate(urlDestino).then((c) => c.focus());
        }
      }
      // Si no hay pestaña abierta, abrir una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlDestino);
      }
    })
  );
});
