// sw.js - Service Worker para TORQUE con actualizaciones automáticas
// ⚠️ CAMBIA ESTA VERSIÓN EN CADA DESPLIEGUE
const CACHE_VERSION = '1.0.5';
const CACHE_NAME = `torque-v${CACHE_VERSION}`;

// ============================================
// ARCHIVOS A CACHEAR - AGREGAR TODOS TUS CSS Y JS
// ============================================
const urlsToCache = [
  '/',
  '/icono.png',
  '/manifest.json',
  
  // ===== CSS - Cliente =====
  '/cliente/css/avances.css',
  '/cliente/css/cotizaciones.css',
  '/cliente/css/historial.css',
  '/cliente/css/misreservas.css',
  '/cliente/css/misvehiculos.css',
  '/cliente/css/perfil.css',
  
  // ===== CSS - Encargado Repuestos =====
  '/encargado_rep_almacen/css/dashboard-mobile.css',
  '/encargado_rep_almacen/css/dashboard.css',
  '/encargado_rep_almacen/css/historial.css',
  '/encargado_rep_almacen/css/perfil.css',
  '/encargado_rep_almacen/css/proveedores.css',
  '/encargado_rep_almacen/css/solicitudes_compra.css',
  '/encargado_rep_almacen/css/solicitudes_cotizacion.css',
  
  // ===== CSS - Jefe Operativo =====
  '/jefe_operativo/css/comunicados.css',
  '/jefe_operativo/css/control_calidad.css',
  '/jefe_operativo/css/dashboard.css',
  '/jefe_operativo/css/historial.css',
  '/jefe_operativo/css/perfil.css',
  '/jefe_operativo/css/recepcion.css',
  
  // ===== CSS - Jefe Taller =====
  '/jefe_taller/css/admin_roles.css',
  '/jefe_taller/css/calendario_bahias.css',
  '/jefe_taller/css/control_calidad.css',
  '/jefe_taller/css/cotizaciones.css',
  '/jefe_taller/css/dashboard.css',
  '/jefe_taller/css/diagnostico.css',
  '/jefe_taller/css/gestion_avances.css',
  '/jefe_taller/css/historial_vehiculos.css',
  '/jefe_taller/css/orden_trabajo.css',
  '/jefe_taller/css/perfil.css',
  '/jefe_taller/css/reservas_solicitudes.css',
  
  // ===== CSS - Técnico Mecánico =====
  '/tecnico_mecanico/css/avance.css',
  '/tecnico_mecanico/css/diagnostico.css',
  '/tecnico_mecanico/css/historial.css',
  '/tecnico_mecanico/css/misvehiculos.css',
  '/tecnico_mecanico/css/perfil.css',
  
  // ===== CSS - Login =====
  '/login/css/style.css',
  
  // ===== JS - Cliente =====
  '/cliente/js/avances.js',
  '/cliente/js/cotizaciones.js',
  '/cliente/js/historial.js',
  '/cliente/js/include.js',
  '/cliente/js/misreservas.js',
  '/cliente/js/misvehiculos.js',
  '/cliente/js/perfil.js',
  
  // ===== JS - Encargado Repuestos =====
  '/encargado_rep_almacen/js/dashboard.js',
  '/encargado_rep_almacen/js/historial.js',
  '/encargado_rep_almacen/js/include.js',
  '/encargado_rep_almacen/js/perfil.js',
  '/encargado_rep_almacen/js/proveedores.js',
  '/encargado_rep_almacen/js/solicitudes_compra.js',
  '/encargado_rep_almacen/js/solicitudes_cotizacion.js',
  
  // ===== JS - Jefe Operativo =====
  '/jefe_operativo/js/comunicados.js',
  '/jefe_operativo/js/control_calidad.js',
  '/jefe_operativo/js/dashboard.js',
  '/jefe_operativo/js/historial.js',
  '/jefe_operativo/js/imageCompressor.js',
  '/jefe_operativo/js/include.js',
  '/jefe_operativo/js/perfil.js',
  '/jefe_operativo/js/recepcion.js',
  
  // ===== JS - Jefe Taller =====
  '/jefe_taller/js/admin_roles.js',
  '/jefe_taller/js/calendario_bahias.js',
  '/jefe_taller/js/control_calidad.js',
  '/jefe_taller/js/cotizaciones.js',
  '/jefe_taller/js/dashboard.js',
  '/jefe_taller/js/diagnostico.js',
  '/jefe_taller/js/gestion_avances.js',
  '/jefe_taller/js/historial_vehiculos.js',
  '/jefe_taller/js/include.js',
  '/jefe_taller/js/orden_trabajo.js',
  '/jefe_taller/js/perfil.js',
  '/jefe_taller/js/reservas_solicitudes.js',
  
  // ===== JS - Técnico Mecánico =====
  '/tecnico_mecanico/js/avance.js',
  '/tecnico_mecanico/js/diagnostico.js',
  '/tecnico_mecanico/js/historial.js',
  '/tecnico_mecanico/js/include.js',
  '/tecnico_mecanico/js/misvehiculos.js',
  '/tecnico_mecanico/js/perfil.js',
  
  // ===== JS - Login =====
  '/login/js/login.js',
  
  // ===== Imágenes =====
  '/img/logoblanco.jpeg',
  '/img/logonegro.jpeg'
];

// ============================================
// INSTALACIÓN
// ============================================
self.addEventListener('install', event => {
  console.log('[SW] Instalando versión:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando archivos...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Instalación completada, saltando waiting...');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Error en instalación:', error);
      })
  );
});

// ============================================
// ACTIVACIÓN - Limpiar cachés antiguos
// ============================================
self.addEventListener('activate', event => {
  console.log('[SW] Activando versión:', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              // Mantener solo el caché de la versión actual
              const isCurrent = cacheName === CACHE_NAME;
              if (!isCurrent) {
                console.log('[SW] Eliminando caché antiguo:', cacheName);
              }
              return !isCurrent;
            })
            .map(cacheName => {
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Tomando control de todas las páginas');
        return self.clients.claim();
      })
  );
});

// ============================================
// FETCH - Interceptar peticiones
// ============================================
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Devolver desde caché
          return cachedResponse;
        }
        
        // Si no está en caché, ir a la red
        return fetch(event.request)
          .then(response => {
            // Verificar que la respuesta sea válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clonar para guardar en caché
            const responseToCache = response.clone();
            
            // Guardar solo archivos estáticos
            const url = new URL(event.request.url);
            if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|json)$/)) {
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                })
                .catch(error => {
                  console.warn('[SW] No se pudo cachear:', url.pathname);
                });
            }
            
            return response;
          })
          .catch(() => {
            // Offline - mensaje de error
            return new Response('⚠️ Sin conexión a internet', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
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