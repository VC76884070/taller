// =====================================================
// DASHBOARD ENCARGADO DE REPUESTOS - VERSIÓN COMPLETA
// CON DATOS REALES DESDE EL BACKEND Y SOPORTE RESPONSIVE
// =====================================================

// Configuración
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            return 'http://localhost:5000';
        }
        return '';
    })();
}

const API_URL = `${window.API_BASE_URL}/api/encargado-repuestos`;

// Variables globales
let dashboardData = null;
let graficoCompras = null;
let refreshInterval = null;
let touchStartY = 0;

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Dashboard Repuestos');
    console.log('📡 API_URL:', API_URL);
    console.log('📱 Dispositivo móvil:', esDispositivoMovil());
    
    const autenticado = await verificarAutenticacion();
    if (!autenticado) return;
    
    await cargarDashboard();
    setupEventListeners();
    iniciarActualizacionAutomatica();
    initPullToRefresh();
});

async function verificarAutenticacion() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
    
    try {
        if (userData) {
            const usuario = JSON.parse(userData);
            const roles = usuario.roles || [];
            const tieneRol = roles.some(r => r === 'encargado_repuestos' || r === 'encargado_rep_almacen');
            
            if (!tieneRol) {
                window.location.href = window.API_BASE_URL + '/';
                return false;
            }
            
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) {
                userNameSpan.textContent = usuario.nombre || 'Encargado Repuestos';
            }
        }
        
        // Mostrar fecha actual
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }
        
        return true;
        
    } catch (error) {
        console.error('Error:', error);
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarDashboard();
            mostrarNotificacion('Actualizando datos...', 'info');
        });
    }
    
    // Event listener para el botón de marcar todas leídas
    const marcarLeidasBtn = document.getElementById('marcarLeidasBtn');
    if (marcarLeidasBtn) {
        marcarLeidasBtn.addEventListener('click', marcarTodasNotificacionesLeidas);
    }
    
    // Event listener para el botón de notificaciones
    const notifIcon = document.querySelector('.notification-icon');
    if (notifIcon) {
        notifIcon.addEventListener('click', () => {
            const notificacionesList = document.getElementById('notificacionesList');
            if (notificacionesList) {
                notificacionesList.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}

// Actualización automática cada 5 minutos (solo si la pestaña está activa)
function iniciarActualizacionAutomatica() {
    if (refreshInterval) clearInterval(refreshInterval);
    
    refreshInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            console.log('🔄 Actualización automática...');
            cargarDashboard(true); // true = silencioso
        }
    }, 300000); // 5 minutos
}

// Pull to refresh para móvil
function initPullToRefresh() {
    if (!esDispositivoMovil()) return;
    
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    
    let pullToRefreshIndicator = null;
    
    mainContent.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    });
    
    mainContent.addEventListener('touchmove', (e) => {
        const scrollTop = mainContent.scrollTop;
        const touchCurrentY = e.touches[0].clientY;
        const pullDistance = touchCurrentY - touchStartY;
        
        // Si está en el top y se tira hacia abajo más de 80px
        if (scrollTop === 0 && pullDistance > 80 && !pullToRefreshIndicator) {
            pullToRefreshIndicator = document.createElement('div');
            pullToRefreshIndicator.className = 'pull-to-refresh';
            pullToRefreshIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
            pullToRefreshIndicator.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: var(--rojo-primario);
                color: white;
                text-align: center;
                padding: 12px;
                z-index: 999;
                font-size: 14px;
                transform: translateY(-100%);
                transition: transform 0.3s;
            `;
            document.body.appendChild(pullToRefreshIndicator);
            
            setTimeout(() => {
                if (pullToRefreshIndicator) {
                    pullToRefreshIndicator.style.transform = 'translateY(0)';
                }
            }, 10);
        }
    });
    
    mainContent.addEventListener('touchend', async (e) => {
        const scrollTop = mainContent.scrollTop;
        
        if (scrollTop === 0 && pullToRefreshIndicator) {
            pullToRefreshIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
            await cargarDashboard();
            mostrarNotificacion('✅ Datos actualizados', 'success');
            
            setTimeout(() => {
                if (pullToRefreshIndicator) {
                    pullToRefreshIndicator.style.transform = 'translateY(-100%)';
                    setTimeout(() => {
                        if (pullToRefreshIndicator && pullToRefreshIndicator.remove) {
                            pullToRefreshIndicator.remove();
                        }
                        pullToRefreshIndicator = null;
                    }, 300);
                }
            }, 1000);
        } else if (pullToRefreshIndicator) {
            pullToRefreshIndicator.remove();
            pullToRefreshIndicator = null;
        }
    });
}

// =====================================================
// CARGAR DATOS DEL DASHBOARD
// =====================================================

async function cargarDashboard(silencioso = false) {
    if (!silencioso) mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/dashboard`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = window.API_BASE_URL + '/';
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            dashboardData = result.data;
            actualizarDashboard();
            if (!silencioso) {
                mostrarNotificacion('Datos actualizados correctamente', 'success');
            }
        } else {
            if (!silencioso) {
                mostrarNotificacion(result.error || 'Error al cargar datos', 'error');
            }
            usarDatosEjemplo();
        }
        
    } catch (error) {
        console.error('Error:', error);
        if (!silencioso) {
            mostrarNotificacion('Error de conexión, usando datos de ejemplo', 'warning');
        }
        usarDatosEjemplo();
    } finally {
        if (!silencioso) mostrarLoading(false);
    }
}

function actualizarDashboard() {
    if (!dashboardData) return;
    
    // Actualizar estadísticas
    const stats = dashboardData.stats || {};
    actualizarElemento('solicitudesPendientes', stats.pendientes || 0);
    actualizarElemento('solicitudesCompradas', stats.comprados || 0);
    actualizarElemento('solicitudesEntregadas', stats.entregados || 0);
    actualizarElemento('totalSolicitudes', stats.total || 0);
    actualizarElemento('comprasMes', `Bs. ${(stats.compras_mes || 0).toLocaleString()}`);
    actualizarElemento('ordenesActivas', stats.ordenes_activas || 0);
    
    // Actualizar badge de notificaciones
    const notificacionesBadge = document.getElementById('notificacionesBadge');
    if (notificacionesBadge && dashboardData.notificaciones) {
        const noLeidas = dashboardData.notificaciones.filter(n => !n.leida).length;
        notificacionesBadge.textContent = noLeidas;
        
        // Mostrar/ocultar badge
        if (noLeidas > 0) {
            notificacionesBadge.style.display = 'inline-block';
        } else {
            notificacionesBadge.style.display = 'none';
        }
    }
    
    // Renderizar componentes
    renderizarComunicados(dashboardData.comunicados || []);
    renderizarSolicitudesRecientes(dashboardData.solicitudes_recientes || []);
    renderizarProveedoresTop(dashboardData.proveedores_top || []);
    renderizarCalendario(dashboardData.eventos_calendario || []);
    renderizarNotificaciones(dashboardData.notificaciones || []);
    
    // Renderizar gráfico
    if (dashboardData.grafico_mensual) {
        renderizarGraficoCompras(dashboardData.grafico_mensual);
    }
}

function actualizarElemento(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor;
}

// =====================================================
// RENDERIZADO DE COMPONENTES
// =====================================================

function renderizarComunicados(comunicados) {
    const container = document.getElementById('comunicadosList');
    if (!container) return;
    
    if (comunicados.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-bullhorn"></i><p>No hay comunicados</p></div>';
        return;
    }
    
    container.innerHTML = comunicados.map(com => {
        let prioridadClass = '';
        let prioridadIcon = '';
        
        if (com.prioridad === 'importante') {
            prioridadClass = 'importante';
            prioridadIcon = '<i class="fas fa-exclamation-triangle"></i>';
        } else if (com.prioridad === 'urgente') {
            prioridadClass = 'urgente';
            prioridadIcon = '<i class="fas fa-bell"></i>';
        } else {
            prioridadIcon = '<i class="fas fa-info-circle"></i>';
        }
        
        const fecha = formatDate(com.fecha_creacion);
        const preview = com.contenido ? escapeHtml(com.contenido.substring(0, 100)) : '';
        
        return `
            <div class="comunicado-item ${prioridadClass}" onclick="verComunicadoCompleto(${com.id})">
                <div class="comunicado-header">
                    ${prioridadIcon}
                    <strong>${escapeHtml(com.titulo)}</strong>
                    <span class="comunicado-fecha">${fecha}</span>
                </div>
                <div class="comunicado-preview">${preview}...</div>
            </div>
        `;
    }).join('');
}

function renderizarSolicitudesRecientes(solicitudes) {
    const container = document.getElementById('solicitudesRecientesList');
    if (!container) return;
    
    if (solicitudes.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No hay solicitudes recientes</p></div>';
        return;
    }
    
    container.innerHTML = solicitudes.map(s => {
        const estadoClass = getEstadoClass(s.estado);
        const estadoTexto = getEstadoTexto(s.estado);
        
        return `
            <div class="solicitud-item" onclick="irASolicitudesCompra()">
                <div class="solicitud-info">
                    <div class="solicitud-orden">OT: ${escapeHtml(s.orden_codigo)}</div>
                    <div class="solicitud-items">${s.items_count || 0} items</div>
                </div>
                <div class="solicitud-meta">
                    <span class="solicitud-estado ${estadoClass}">${estadoTexto}</span>
                    <span class="solicitud-fecha">${formatDate(s.fecha_solicitud)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarProveedoresTop(proveedores) {
    const container = document.getElementById('proveedoresList');
    if (!container) return;
    
    if (proveedores.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-truck"></i><p>No hay proveedores registrados</p></div>';
        return;
    }
    
    container.innerHTML = proveedores.map(p => `
        <div class="proveedor-item" onclick="irAProveedores()">
            <div class="proveedor-info">
                <i class="fas fa-building"></i>
                <span>${escapeHtml(p.nombre)}</span>
            </div>
            <div class="proveedor-stats">
                <span class="proveedor-veces">${p.veces || 0} compras</span>
            </div>
        </div>
    `).join('');
}

function renderizarCalendario(eventos) {
    const container = document.getElementById('calendarioList');
    if (!container) return;
    
    if (eventos.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No hay entregas próximas</p></div>';
        return;
    }
    
    container.innerHTML = eventos.map(e => `
        <div class="evento-item">
            <div class="evento-fecha">
                <span class="evento-dia">${formatDate(e.fecha, 'dia')}</span>
                <span class="evento-mes">${formatDate(e.fecha, 'mes')}</span>
            </div>
            <div class="evento-info">
                <div class="evento-titulo">${escapeHtml(e.titulo)}</div>
                <div class="evento-proveedor">${escapeHtml(e.proveedor)}</div>
            </div>
        </div>
    `).join('');
}

function renderizarNotificaciones(notificaciones) {
    const container = document.getElementById('notificacionesList');
    if (!container) return;
    
    if (notificaciones.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No hay notificaciones</p></div>';
        return;
    }
    
    container.innerHTML = notificaciones.map(n => `
        <div class="notificacion-item ${n.leida ? 'leida' : 'no-leida'}" onclick="marcarNotificacionLeida(${n.id})">
            <div class="notificacion-icon">
                <i class="fas ${getNotificacionIcon(n.tipo)}"></i>
            </div>
            <div class="notificacion-content">
                <div class="notificacion-mensaje">${escapeHtml(n.mensaje)}</div>
                <div class="notificacion-fecha">${formatDate(n.fecha_envio)}</div>
            </div>
        </div>
    `).join('');
}

function renderizarGraficoCompras(grafico) {
    const canvas = document.getElementById('comprasChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (graficoCompras) graficoCompras.destroy();
    
    graficoCompras = new Chart(ctx, {
        type: 'line',
        data: {
            labels: grafico.meses,
            datasets: [{
                label: 'Compras (Bs.)',
                data: grafico.valores,
                borderColor: '#C1121F',
                backgroundColor: 'rgba(193, 18, 31, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#C1121F',
                pointBorderColor: '#fff',
                pointRadius: esDispositivoMovil() ? 3 : 4,
                pointHoverRadius: esDispositivoMovil() ? 5 : 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    bodyFont: { size: esDispositivoMovil() ? 10 : 12 },
                    titleFont: { size: esDispositivoMovil() ? 11 : 13 },
                    callbacks: {
                        label: function(context) {
                            return `Bs. ${context.raw.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { size: esDispositivoMovil() ? 9 : 11 },
                        callback: function(value) {
                            if (esDispositivoMovil() && value >= 1000) {
                                return 'Bs. ' + (value / 1000).toFixed(0) + 'k';
                            }
                            return 'Bs. ' + value.toLocaleString();
                        }
                    }
                },
                x: {
                    ticks: {
                        font: { size: esDispositivoMovil() ? 9 : 11 },
                        maxRotation: esDispositivoMovil() ? 45 : 0,
                        minRotation: esDispositivoMovil() ? 45 : 0
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            onResize: function(chart, size) {
                // Ajustar tamaño del gráfico cuando se redimensiona
                chart.update();
            }
        }
    });
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function getAuthHeaders() {
    const token = localStorage.getItem('furia_token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

function getEstadoClass(estado) {
    const clases = {
        'pendiente': 'status-pendiente',
        'comprado': 'status-comprado',
        'entregado': 'status-entregado'
    };
    return clases[estado] || 'status-pendiente';
}

function getEstadoTexto(estado) {
    const textos = {
        'pendiente': 'Pendiente',
        'comprado': 'Comprado',
        'entregado': 'Entregado'
    };
    return textos[estado] || estado;
}

function getNotificacionIcon(tipo) {
    const iconos = {
        'solicitud_compra': 'fa-shopping-cart',
        'compra_realizada': 'fa-check-circle',
        'entrega_realizada': 'fa-truck',
        'repuestos_entregados': 'fa-box-open'
    };
    return iconos[tipo] || 'fa-bell';
}

function formatDate(dateStr, tipo = 'completa') {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        if (tipo === 'dia') return date.getDate();
        if (tipo === 'mes') return date.toLocaleDateString('es-ES', { month: 'short' });
        if (tipo === 'hora') return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const icon = tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : tipo === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${mensaje}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast && toast.remove) toast.remove();
    }, 3000);
}

function usarDatosEjemplo() {
    // Datos de ejemplo para mostrar mientras no hay backend
    actualizarElemento('solicitudesPendientes', '3');
    actualizarElemento('solicitudesCompradas', '5');
    actualizarElemento('solicitudesEntregadas', '12');
    actualizarElemento('totalSolicitudes', '20');
    actualizarElemento('comprasMes', 'Bs. 12,450');
    actualizarElemento('ordenesActivas', '4');
}

// =====================================================
// FUNCIONES RESPONSIVE
// =====================================================

function esDispositivoMovil() {
    return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function ajustarGraficoResponsive() {
    if (graficoCompras) {
        graficoCompras.options.plugins.tooltip.bodyFont = { size: esDispositivoMovil() ? 10 : 12 };
        graficoCompras.options.plugins.tooltip.titleFont = { size: esDispositivoMovil() ? 11 : 13 };
        graficoCompras.options.scales.y.ticks.font = { size: esDispositivoMovil() ? 9 : 11 };
        graficoCompras.options.scales.x.ticks.font = { size: esDispositivoMovil() ? 9 : 11 };
        graficoCompras.options.scales.y.ticks.callback = function(value) {
            if (esDispositivoMovil() && value >= 1000) {
                return 'Bs. ' + (value / 1000).toFixed(0) + 'k';
            }
            return 'Bs. ' + value.toLocaleString();
        };
        graficoCompras.update();
    }
}

// Escuchar cambios de tamaño para ajustar gráfico
window.addEventListener('resize', () => {
    setTimeout(ajustarGraficoResponsive, 200);
});

// =====================================================
// FUNCIONES GLOBALES (para llamar desde HTML)
// =====================================================

window.verComunicadoCompleto = function(id) {
    const comunicado = dashboardData?.comunicados?.find(c => c.id === id);
    if (comunicado) {
        // En móvil, usar un modal más amigable
        if (esDispositivoMovil()) {
            mostrarModalComunicado(comunicado);
        } else {
            alert(`📢 ${comunicado.titulo}\n\n${comunicado.contenido}\n\n📅 ${formatDate(comunicado.fecha_creacion)}`);
        }
    }
};

function mostrarModalComunicado(comunicado) {
    // Crear modal para móvil
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;
    
    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: 16px; max-width: 90%; max-height: 80%; overflow-y: auto; padding: 20px;">
            <h3 style="color: var(--rojo-primario); margin-bottom: 15px;">${escapeHtml(comunicado.titulo)}</h3>
            <p style="color: var(--gris-texto); font-size: 12px; margin-bottom: 15px;">📅 ${formatDate(comunicado.fecha_creacion)}</p>
            <p style="color: var(--blanco); line-height: 1.5;">${escapeHtml(comunicado.contenido)}</p>
            <button onclick="this.closest('div').remove()" style="margin-top: 20px; background: var(--rojo-primario); color: white; border: none; padding: 10px 20px; border-radius: 8px; width: 100%;">Cerrar</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Cerrar al hacer click fuera
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

window.marcarNotificacionLeida = async function(id) {
    try {
        const response = await fetch(`${API_URL}/dashboard/notificacion/${id}/leer`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            // Actualizar localmente
            if (dashboardData && dashboardData.notificaciones) {
                const notif = dashboardData.notificaciones.find(n => n.id === id);
                if (notif) notif.leida = true;
                renderizarNotificaciones(dashboardData.notificaciones);
                
                // Actualizar badge
                const noLeidas = dashboardData.notificaciones.filter(n => !n.leida).length;
                const badge = document.getElementById('notificacionesBadge');
                if (badge) {
                    badge.textContent = noLeidas;
                    if (noLeidas === 0) badge.style.display = 'none';
                }
            }
            mostrarNotificacion('Marcada como leída', 'success');
        }
    } catch (error) {
        console.error('Error:', error);
    }
};

window.marcarTodasNotificacionesLeidas = async function() {
    try {
        const response = await fetch(`${API_URL}/dashboard/notificaciones/leer-todas`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            if (dashboardData && dashboardData.notificaciones) {
                dashboardData.notificaciones.forEach(n => n.leida = true);
                renderizarNotificaciones(dashboardData.notificaciones);
                
                const badge = document.getElementById('notificacionesBadge');
                if (badge) {
                    badge.textContent = '0';
                    badge.style.display = 'none';
                }
            }
            mostrarNotificacion('Todas las notificaciones marcadas como leídas', 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        // Si falla la API, al menos marcar localmente
        if (dashboardData && dashboardData.notificaciones) {
            dashboardData.notificaciones.forEach(n => n.leida = true);
            renderizarNotificaciones(dashboardData.notificaciones);
            const badge = document.getElementById('notificacionesBadge');
            if (badge) {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
            mostrarNotificacion('Notificaciones marcadas localmente', 'info');
        }
    }
};

window.irASolicitudesCompra = function() {
    window.location.href = 'solicitudes_compra.html';
};

window.irAProveedores = function() {
    window.location.href = 'proveedores.html';
};

window.cerrarSesion = function() {
    if (confirm('¿Cerrar sesión?')) {
        if (refreshInterval) clearInterval(refreshInterval);
        localStorage.clear();
        window.location.href = window.API_BASE_URL + '/';
    }
};

// =====================================================
// LIMPIEZA AL SALIR
// =====================================================
window.addEventListener('beforeunload', () => {
    if (refreshInterval) clearInterval(refreshInterval);
});

console.log('✅ dashboard.js cargado correctamente - Versión responsive con pull-to-refresh');