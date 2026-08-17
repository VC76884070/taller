// sw.js - Service Worker para TORQUE
// ⚠️ MODO SIN CACHÉ - SIEMPRE DESCARGA DEL SERVIDOR
// CAMBIA ESTA VERSIÓN EN CADA DESPLIEGUE
const CACHE_VERSION = '1.0.8';
const CACHE_NAME = `torque-v${CACHE_VERSION}`;

console.log(`[SW] Iniciando ${CACHE_NAME} - MODO SIN CACHÉ`);

// ============================================
// INSTALACIÓN - NO CACHEAR NADA
// ============================================
self.addEventListener('install', event => {
    console.log('[SW] Instalando versión:', CACHE_VERSION);
    console.log('[SW] ⚠️ Modo SIN CACHÉ - No se guardarán archivos');
    
    // 🔥 NO CACHEAMOS NADA - Solo saltamos a activación
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
                // Eliminar TODOS los cachés existentes
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
// FETCH - SIEMPRE IR A LA RED, NUNCA USAR CACHÉ
// ============================================
self.addEventListener('fetch', event => {
    // 🔥 SIEMPRE IR A LA RED - NUNCA USAR CACHÉ
    event.respondWith(
        fetch(event.request, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        })
        .catch(() => {
            // ⚠️ SOLO si NO hay internet, usar caché como fallback
            console.warn('[SW] ⚠️ Sin conexión, intentando usar caché como fallback');
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

console.log('[SW] ✅ Modo SIN CACHÉ activado correctamente');
console.log('[SW] 📡 Todas las peticiones irán al servidor');
console.log('[SW] 🔄 Solo usará caché si NO hay internet');