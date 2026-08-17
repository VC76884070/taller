// register_sw.js - Registro del Service Worker con actualizaciones automáticas
// VERSIÓN ULTRA COMPLETA - Con detector de navegador y auto-actualización

(function() {
    'use strict';
    
    // =====================================================
    // VARIABLES DE CONTROL
    // =====================================================
    let updateTimeout = null;
    let isUpdating = false;
    let avisoNavegadorMostrado = false;
    
    // =====================================================
    // DETECTOR DE NAVEGADOR
    // =====================================================
    function detectarNavegador() {
        const ua = navigator.userAgent.toLowerCase();
        
        const isChrome = ua.includes('chrome') && 
                        !ua.includes('edg') && 
                        !ua.includes('opr') && 
                        !ua.includes('samsung');
        
        const isSamsung = ua.includes('samsung') || ua.includes('samsungbrowser');
        const isEdge = ua.includes('edg');
        const isOpera = ua.includes('opr');
        const isFirefox = ua.includes('firefox') && !ua.includes('seamonkey');
        const isSafari = ua.includes('safari') && !isChrome && !isEdge && !isOpera;
        const isAndroidBrowser = ua.includes('android') && 
                                !isChrome && 
                                !isSamsung && 
                                !isFirefox && 
                                !isEdge && 
                                !isOpera;
        const isMobile = ua.includes('mobile') || ua.includes('android') || ua.includes('iphone');
        
        let nombre = 'Otro';
        let recomendado = false;
        let mensaje = '';
        
        if (isChrome) {
            nombre = 'Chrome';
            recomendado = true;
            mensaje = '✅ Estás usando Chrome, ¡perfecto para TORQUE!';
        } else if (isSamsung) {
            nombre = 'Samsung Internet';
            recomendado = false;
            mensaje = '⚠️ Samsung Internet puede tener problemas. Usa Chrome.';
        } else if (isEdge) {
            nombre = 'Microsoft Edge';
            recomendado = false;
            mensaje = 'ℹ️ Edge funciona, pero Chrome es recomendado.';
        } else if (isOpera) {
            nombre = 'Opera';
            recomendado = false;
            mensaje = 'ℹ️ Opera funciona, pero Chrome es recomendado.';
        } else if (isFirefox) {
            nombre = 'Firefox';
            recomendado = false;
            mensaje = '⚠️ Firefox tiene soporte limitado para PWA.';
        } else if (isSafari) {
            nombre = 'Safari';
            recomendado = false;
            mensaje = '⚠️ Safari tiene soporte limitado para PWA.';
        } else if (isAndroidBrowser) {
            nombre = 'Navegador Android';
            recomendado = false;
            mensaje = '⚠️ El navegador nativo de Android no es compatible.';
        } else {
            nombre = 'Navegador desconocido';
            recomendado = false;
            mensaje = '⚠️ Tu navegador puede no ser compatible.';
        }
        
        return {
            nombre: nombre,
            esChrome: isChrome,
            esRecomendado: recomendado,
            esMovil: isMobile,
            mensaje: mensaje
        };
    }
    
    // =====================================================
    // MOSTRAR AVISO DE NAVEGADOR (SOLO SI NO ES CHROME)
    // =====================================================
    function mostrarAvisoNavegador() {
        if (avisoNavegadorMostrado) return;
        if (document.querySelector('.browser-warning')) return;
        
        const info = detectarNavegador();
        if (info.esChrome) return;
        if (!info.esMovil) return;
        
        avisoNavegadorMostrado = true;
        
        const warning = document.createElement('div');
        warning.className = 'browser-warning';
        warning.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #1e293b;
            color: white;
            padding: 16px 20px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            z-index: 99998;
            max-width: 92%;
            font-family: -apple-system, system-ui, sans-serif;
            animation: slideUpWarning 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
        `;
        
        warning.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="font-size: 24px; flex-shrink: 0;">⚠️</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
                        Navegador: ${info.nombre}
                    </div>
                    <div style="font-size: 13px; opacity: 0.9; margin-bottom: 12px;">
                        ${info.mensaje} Para mejor experiencia, usa <strong>Google Chrome</strong>.
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button onclick="abrirEnChrome()" style="
                            background: #3b82f6;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            font-size: 13px;
                        ">
                            <i class="fas fa-external-link-alt"></i> Abrir en Chrome
                        </button>
                        <button onclick="cerrarAvisoNavegador()" style="
                            background: transparent;
                            color: white;
                            border: 1px solid rgba(255,255,255,0.2);
                            padding: 8px 16px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 13px;
                        ">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Estilos de animación
        if (!document.getElementById('warningStyles')) {
            const style = document.createElement('style');
            style.id = 'warningStyles';
            style.textContent = `
                @keyframes slideUpWarning {
                    from { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.95); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(warning);
    }
    
    // =====================================================
    // ABRIR EN CHROME
    // =====================================================
    window.abrirEnChrome = function() {
        const urlActual = window.location.href;
        const chromeIntent = `intent://${urlActual.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end;`;
        
        try {
            window.location.href = chromeIntent;
        } catch (e) {
            window.open(urlActual, '_system');
        }
        
        cerrarAvisoNavegador();
    };
    
    // =====================================================
    // CERRAR AVISO DE NAVEGADOR
    // =====================================================
    window.cerrarAvisoNavegador = function() {
        const warning = document.querySelector('.browser-warning');
        if (warning) {
            warning.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => warning.remove(), 300);
        }
        avisoNavegadorMostrado = false;
    };
    
    // =====================================================
    // NOTIFICACIÓN DE ACTUALIZACIÓN (CON AUTO EN 10 SEGUNDOS)
    // =====================================================
    function showUpdateNotification() {
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
                    <div style="font-size: 13px; opacity: 0.8;">Se actualizará automáticamente en 10 segundos</div>
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
        if (!document.getElementById('toastStyles')) {
            const style = document.createElement('style');
            style.id = 'toastStyles';
            style.textContent = `
                @keyframes slideUpToast {
                    from { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.95); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toast);
        
        // 🔥 AUTO-ACTUALIZACIÓN EN 10 SEGUNDOS (más rápido)
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            const toastElement = document.querySelector('.update-toast');
            if (toastElement) {
                console.log('⏰ Auto-actualizando después de 10 segundos...');
                window.updateApp();
            }
        }, 10000);
    }
    
    // =====================================================
    // FUNCIÓN PARA ACTUALIZAR LA APP (RECARGA FORZADA)
    // =====================================================
    window.updateApp = function() {
        if (isUpdating) return;
        isUpdating = true;
        
        if (updateTimeout) {
            clearTimeout(updateTimeout);
            updateTimeout = null;
        }
        
        // Cambiar texto de la notificación
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
        
        // 🔥 RECARGA FORZADA (ignora caché)
        setTimeout(() => {
            window.location.reload(true);
        }, 800);
    };
    
    // =====================================================
    // CERRAR NOTIFICACIÓN
    // =====================================================
    window.dismissUpdate = function() {
        if (updateTimeout) {
            clearTimeout(updateTimeout);
            updateTimeout = null;
        }
        const toast = document.querySelector('.update-toast');
        if (toast) toast.remove();
    };
    
    // =====================================================
    // BOTÓN MANUAL DE ACTUALIZACIÓN
    // =====================================================
    window.forzarActualizacionManual = async function() {
        mostrarNotificacion('🔍 Buscando actualizaciones...', 'info');
        
        if (!('serviceWorker' in navigator)) {
            mostrarNotificacion('❌ Service Worker no soportado', 'error');
            return;
        }
        
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.update();
            
            if (registration.waiting) {
                mostrarNotificacion('🔄 Actualizando...', 'success');
                setTimeout(() => {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    setTimeout(() => {
                        window.location.reload(true);
                    }, 500);
                }, 1500);
            } else {
                mostrarNotificacion('✅ Ya tienes la última versión', 'success');
            }
        } catch (error) {
            mostrarNotificacion('❌ Error al buscar actualizaciones', 'error');
            console.error(error);
        }
    };
    
    // =====================================================
    // FUNCIÓN PARA MOSTRAR NOTIFICACIONES SIMPLES
    // =====================================================
    function mostrarNotificacion(mensaje, tipo) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${tipo === 'error' ? '#dc2626' : tipo === 'success' ? '#16a34a' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 12px;
            z-index: 99999;
            font-family: -apple-system, system-ui, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideUpToast 0.3s ease;
            max-width: 90%;
        `;
        toast.textContent = mensaje;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    // =====================================================
    // FORZAR ACTUALIZACIÓN AL ABRIR LA APP
    // =====================================================
    async function forzarActualizacionAlAbrir() {
        if (!('serviceWorker' in navigator)) return;
        
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.update();
            
            if (registration.waiting) {
                console.log('🔄 Nueva versión encontrada al abrir, actualizando...');
                window.updateApp();
            }
        } catch (error) {
            console.warn('Error verificando actualizaciones al abrir:', error);
        }
    }
    
    // =====================================================
    // REGISTRAR SERVICE WORKER
    // =====================================================
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado correctamente');
                
                // Verificar actualizaciones cada 15 segundos
                setInterval(() => {
                    registration.update();
                    console.log('🔍 Buscando actualizaciones...');
                }, 15000);
                
                // Detectar nueva versión
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 Nueva versión encontrada');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('✅ Nueva versión lista para instalar');
                            
                            const token = localStorage.getItem('furia_token');
                            if (!token) {
                                console.log('⚡ Sin sesión activa, actualizando inmediatamente...');
                                window.updateApp();
                            } else {
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
        
        // Forzar actualización al cargar la página
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(forzarActualizacionAlAbrir, 2000);
        });
        
        // Verificar al volver a la pestaña
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                navigator.serviceWorker.ready.then(registration => {
                    registration.update();
                    console.log('👁️ Verificando actualizaciones al volver...');
                });
            }
        });
        
        // 🔥 Cuando el SW cambia, recargar forzado
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('🔄 Service Worker cambiado, recargando...');
            setTimeout(() => {
                window.location.reload(true);
            }, 500);
        });
        
    } else {
        console.warn('⚠️ Service Worker no soportado en este navegador');
    }
    
    // =====================================================
    // MOSTRAR AVISO DE NAVEGADOR (AL CARGAR LA PÁGINA)
    // =====================================================
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            const info = detectarNavegador();
            console.log(`📱 Navegador: ${info.nombre}`);
            console.log(`✅ Es Chrome: ${info.esChrome}`);
            
            if (!info.esChrome && info.esMovil) {
                mostrarAvisoNavegador();
            }
        }, 3000);
    });
    
    // =====================================================
    // FUNCIÓN PARA VERIFICAR NAVEGADOR MANUALMENTE
    // =====================================================
    window.verificarNavegador = function() {
        const info = detectarNavegador();
        alert(`🔍 Navegador detectado: ${info.nombre}\n${info.mensaje}`);
        if (!info.esChrome) {
            mostrarAvisoNavegador();
        }
        return info;
    };
    
    console.log('✅ register_sw.js cargado - Versión ULTRA COMPLETA');
    console.log('🔄 Auto-actualización en 10 segundos');
    console.log('🔍 Búsqueda de actualizaciones cada 15 segundos');
    console.log('📱 Detector de navegador activo');
})();