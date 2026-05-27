// =====================================================
// DASHBOARD ENCARGADO DE REPUESTOS - VERSIÓN COMPLETA
// CON DATOS REALES DESDE EL BACKEND
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

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Dashboard Repuestos');
    console.log('📡 API_URL:', API_URL);
    
    const autenticado = await verificarAutenticacion();
    if (!autenticado) return;
    
    await cargarDashboard();
    setupEventListeners();
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
}

// =====================================================
// CARGAR DATOS DEL DASHBOARD
// =====================================================

async function cargarDashboard() {
    mostrarLoading(true);
    
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
        } else {
            mostrarNotificacion(result.error || 'Error al cargar datos', 'error');
            usarDatosEjemplo();
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión, usando datos de ejemplo', 'warning');
        usarDatosEjemplo();
    } finally {
        mostrarLoading(false);
    }
}

function actualizarDashboard() {
    if (!dashboardData) return;
    
    // Actualizar estadísticas
    const stats = dashboardData.stats || {};
    document.getElementById('solicitudesPendientes').textContent = stats.pendientes || 0;
    document.getElementById('solicitudesCompradas').textContent = stats.comprados || 0;
    document.getElementById('solicitudesEntregadas').textContent = stats.entregados || 0;
    document.getElementById('totalSolicitudes').textContent = stats.total || 0;
    document.getElementById('comprasMes').textContent = `Bs. ${(stats.compras_mes || 0).toLocaleString()}`;
    document.getElementById('ordenesActivas').textContent = stats.ordenes_activas || 0;
    
    // Actualizar badge de notificaciones
    const notificacionesBadge = document.getElementById('notificacionesBadge');
    if (notificacionesBadge && dashboardData.notificaciones) {
        const noLeidas = dashboardData.notificaciones.filter(n => !n.leida).length;
        notificacionesBadge.textContent = noLeidas;
    }
    
    // Renderizar comunicados
    renderizarComunicados(dashboardData.comunicados || []);
    
    // Renderizar solicitudes recientes
    renderizarSolicitudesRecientes(dashboardData.solicitudes_recientes || []);
    
    // Renderizar proveedores top
    renderizarProveedoresTop(dashboardData.proveedores_top || []);
    
    // Renderizar calendario/entregas
    renderizarCalendario(dashboardData.eventos_calendario || []);
    
    // Renderizar notificaciones
    renderizarNotificaciones(dashboardData.notificaciones || []);
    
    // Renderizar gráfico
    if (dashboardData.grafico_mensual) {
        renderizarGraficoCompras(dashboardData.grafico_mensual);
    }
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
        
        return `
            <div class="comunicado-item ${prioridadClass}" onclick="verComunicadoCompleto(${com.id})">
                <div class="comunicado-header">
                    ${prioridadIcon}
                    <strong>${escapeHtml(com.titulo)}</strong>
                    <span class="comunicado-fecha">${fecha}</span>
                </div>
                <div class="comunicado-preview">${escapeHtml(com.contenido.substring(0, 100))}...</div>
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
            <div class="solicitud-item" onclick="window.location.href='solicitudes_compra.html'">
                <div class="solicitud-info">
                    <div class="solicitud-orden">OT: ${escapeHtml(s.orden_codigo)}</div>
                    <div class="solicitud-items">${s.items_count} items</div>
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
        <div class="proveedor-item">
            <div class="proveedor-info">
                <i class="fas fa-building"></i>
                <span>${escapeHtml(p.nombre)}</span>
            </div>
            <div class="proveedor-stats">
                <span class="proveedor-veces">${p.veces} compras</span>
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
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
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
                        callback: function(value) {
                            return 'Bs. ' + value.toLocaleString();
                        }
                    }
                }
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
        if (tipo === 'dia') return date.getDate();
        if (tipo === 'mes') return date.toLocaleDateString('es-ES', { month: 'short' });
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
    const icon = tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${mensaje}`;
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

function usarDatosEjemplo() {
    // Datos de ejemplo para mostrar mientras no hay backend
    document.getElementById('solicitudesPendientes').textContent = '3';
    document.getElementById('solicitudesCompradas').textContent = '5';
    document.getElementById('solicitudesEntregadas').textContent = '12';
    document.getElementById('totalSolicitudes').textContent = '20';
    document.getElementById('comprasMes').textContent = 'Bs. 12,450';
    document.getElementById('ordenesActivas').textContent = '4';
}

// Funciones globales
window.verComunicadoCompleto = function(id) {
    const comunicado = dashboardData?.comunicados?.find(c => c.id === id);
    if (comunicado) {
        alert(`Título: ${comunicado.titulo}\n\nContenido:\n${comunicado.contenido}`);
    }
};

window.marcarNotificacionLeida = async function(id) {
    try {
        await fetch(`${API_URL}/dashboard/notificacion/${id}/leer`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        cargarDashboard();
    } catch (error) {
        console.error('Error:', error);
    }
};

window.cerrarSesion = function() {
    if (confirm('¿Cerrar sesión?')) {
        localStorage.clear();
        window.location.href = window.API_BASE_URL + '/';
    }
};

console.log('✅ dashboard.js cargado correctamente');