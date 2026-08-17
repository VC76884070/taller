// sw.js - Service Worker para TORQUE
// ⚠️ MODO SIN CACHÉ - PERO SIN BLOQUEAR RECURSOS EXTERNOS
// CAMBIA ESTA VERSIÓN EN CADA DESPLIEGUE
const CACHE_VERSION = '1.0.9';
const CACHE_NAME = `torque-v${CACHE_VERSION}`;

console.log(`[SW] Iniciando ${CACHE_NAME} - MODO SIN CACHÉ`);

// ============================================
// INSTALACIÓN - NO CACHEAR NADA
// ============================================
self.addEventListener('install', event => {
    console.log('[SW] Instalando versión:', CACHE_VERSION);
    console.log('[SW] ⚠️ Modo SIN CACHÉ - No se guardarán archivos');
    event.waitUntil(self.skipWaiting());
});

// ============================================
// ACTIVACIÓN - ELIMINAR TODA LA CACHÉ EXISTENTE
// ============================================
self.addEventListener('activate', event => {
    console.log('[SW] Activando versión:', CACHE_VERSION);
    console.log('[SW] 🧹 Eliminando toda la caché existente...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        console.log(`[SW] 🗑️ Eliminando caché: ${cacheName}`);
                        return caches.delete(cacheName);
                    })
                );
            })
            .then(() => {
                console.log('[SW] ✅ Toda la caché eliminada');
                console.log('[SW] Tomando control de todas las páginas');
                return self.clients.claim();
            })
    );
});

// ============================================
// FETCH - SOLO INTERCEPTAR RECURSOS DEL MISMO DOMINIO
// ============================================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // 🔥 SOLO interceptar peticiones del mismo dominio
    // (NO interceptar CDN, Google Fonts, etc.)
    if (url.origin !== self.location.origin) {
        // Para recursos externos, solo dejar pasar (no interceptar)
        event.respondWith(fetch(event.request));
        return;
    }
    
    // 🔥 Para recursos del mismo dominio: SIEMPRE IR A LA RED
    event.respondWith(
        fetch(event.request, {
            cache: 'no-store'
        })
        .catch(() => {
            // SOLO si NO hay internet, usar caché como fallback
            console.warn('[SW] ⚠️ Sin conexión, usando caché como fallback');
            return caches.match(event.request);
        })
    );
});

// ============================================
// MENSAJES - Escuchar mensajes del cliente
// ============================================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Forzando activación por mensaje del cliente');
        self.skipWaiting();
    }
});

// ============================================
// CONTROLADOR CAMBIADO - Notificar al cliente
// ============================================
self.addEventListener('controllerchange', () => {
    console.log('[SW] Controlador cambiado, notificando a clientes');
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'SW_UPDATED',
                version: CACHE_VERSION
            });
        });
    });
});

console.log('[SW] ✅ Modo SIN CACHÉ activado (solo para recursos locales)');
console.log('[SW] 📡 Recursos externos (CDN, Google Fonts) NO serán interceptados');