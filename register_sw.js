// register_sw.js - Registro del Service Worker con actualizaciones automáticas
// VERSIÓN MEJORADA - Auto-actualización después de 30 segundos

(function() {
    'use strict';
    
    // Variables de control
    let updateTimeout = null;
    let isUpdating = false;
    
    // 📢 Función para mostrar notificación de actualización
    function showUpdateNotification() {
        // Evitar duplicados
        if (document.querySelector('.update-toast')) return;
        if (isUpdating) return;
        
        const toast = document.createElement('div');
        toast.className = 'update-toast';
        toast.innerHTML = `
            <div style="
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                background: #1e293b;
                color: white;
                padding: 16px 24px;
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                z-index: 99999;
                display: flex;
                align-items: center;
                gap: 16px;
                font-family: -apple-system, system-ui, sans-serif;
                animation: slideUpToast 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                max-width: 92%;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.1);
            ">
                <span style="font-size: 28px;">🔄</span>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 16px; margin-bottom: 2px;">¡Nueva versión disponible!</div>
                    <div style="font-size: 13px; opacity: 0.8;">Se actualizará automáticamente en 30 segundos</div>
                </div>
                <button onclick="updateApp()" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 8px 20px;
                    border-radius: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                    white-space: nowrap;
                ">Actualizar ahora</button>
                <button onclick="dismissUpdate()" style="
                    background: transparent;
                    color: white;
                    border: 1px solid rgba(255,255,255,0.2);
                    padding: 8px 12px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 18px;
                    transition: all 0.2s;
                ">✕</button>
            </div>
        `;
        
        // Estilos de animación
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideUpToast {
                from { 
                    opacity: 0; 
                    transform: translateX(-50%) translateY(30px) scale(0.95);
                }
                to { 
                    opacity: 1; 
                    transform: translateX(-50%) translateY(0) scale(1);
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(toast);
        
        // 🔥 AUTO-ACTUALIZACIÓN DESPUÉS DE 30 SEGUNDOS
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            const toastElement = document.querySelector('.update-toast');
            if (toastElement) {
                console.log('⏰ Auto-actualizando después de 30 segundos...');
                window.updateApp();
            }
        }, 30000);
    }
    
    // 🔄 Función para actualizar la app
    window.updateApp = function() {
        if (isUpdating) return;
        isUpdating = true;
        
        // Limpiar timeout si existe
        if (updateTimeout) {
            clearTimeout(updateTimeout);
            updateTimeout = null;
        }
        
        // Cambiar el texto de la notificación a "Actualizando..."
        const toast = document.querySelector('.update-toast');
        if (toast) {
            toast.innerHTML = `
                <div style="
                    position: fixed;
                    bottom: 24px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #1e293b;
                    color: white;
                    padding: 16px 24px;
                    border-radius: 16px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    font-family: -apple-system, system-ui, sans-serif;
                    max-width: 92%;
                    border: 1px solid rgba(255,255,255,0.1);
                ">
                    <span style="font-size: 24px;"><i class="fas fa-spinner fa-spin"></i></span>
                    <div>
                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 2px;">Actualizando aplicación...</div>
                        <div style="font-size: 13px; opacity: 0.8;">Por favor espera un momento</div>
                    </div>
                </div>
            `;
        }
        
        // Notificar al Service Worker
        navigator.serviceWorker.ready.then(registration => {
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        });
        
        // Recargar después de un momento
        setTimeout(() => {
            window.location.reload();
        }, 800);
    };
    
    // ❌ Función para cerrar notificación
    window.dismissUpdate = function() {
        // Limpiar timeout
        if (updateTimeout) {
            clearTimeout(updateTimeout);
            updateTimeout = null;
        }
        const toast = document.querySelector('.update-toast');
        if (toast) toast.remove();
    };
    
    // 📱 Registrar Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado correctamente');
                
                // Verificar actualizaciones cada 30 segundos
                setInterval(() => {
                    registration.update();
                    console.log('🔍 Buscando actualizaciones...');
                }, 30000);
                
                // Detectar nueva versión
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 Nueva versión encontrada');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('✅ Nueva versión lista para instalar');
                            
                            // Verificar si hay sesión activa
                            const token = localStorage.getItem('furia_token');
                            if (!token) {
                                // Sin sesión: actualizar inmediatamente
                                console.log('⚡ Sin sesión activa, actualizando inmediatamente...');
                                window.updateApp();
                            } else {
                                // Con sesión: mostrar notificación
                                showUpdateNotification();
                            }
                        }
                    });
                });
            })
            .catch(error => {
                console.warn('⚠️ Error registrando Service Worker:', error);
            });
        
        // Escuchar mensajes del SW
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                console.log('📢 Service Worker actualizado a:', event.data.version);
                
                const token = localStorage.getItem('furia_token');
                if (!token) {
                    window.updateApp();
                } else {
                    showUpdateNotification();
                }
            }
        });
        
        // Detectar si ya hay una nueva versión esperando
        navigator.serviceWorker.ready.then(registration => {
            if (registration.waiting) {
                const token = localStorage.getItem('furia_token');
                if (!token) {
                    window.updateApp();
                } else {
                    showUpdateNotification();
                }
            }
        });
        
        // 🔥 NUEVO: Verificar actualizaciones al volver a la pestaña
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                navigator.serviceWorker.ready.then(registration => {
                    registration.update();
                    console.log('👁️ Verificando actualizaciones al volver...');
                });
            }
        });
        
    } else {
        console.warn('⚠️ Service Worker no soportado en este navegador');
    }
    
    console.log('✅ register_sw.js cargado - Auto-actualización en 30 segundos');
})();