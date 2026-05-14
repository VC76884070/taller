// =====================================================
// ÓRDENES DE TRABAJO - JEFE TALLER (VERSIÓN CORREGIDA)
// =====================================================

const API_URL = '/api';
let userInfo = null;
let pollingInterval = null;
let rolesUsuario = [];

let ordenesActivas = [];
let ordenesFinalizadas = [];
let tecnicosDisponibles = [];
let ordenEnGestion = null;
let audioBlob = null;
let audioChunks = [];
let isRecording = false;
let mediaRecorder = null;

// Cache para datos que cambian poco
const dataCache = {
    tecnicos: { data: null, timestamp: null, ttl: 30000 },
    bahias: { data: null, timestamp: null, ttl: 10000 },
    
    get(key) {
        const item = this[key];
        if (item.data && item.timestamp && (Date.now() - item.timestamp) < item.ttl) {
            return item.data;
        }
        return null;
    },
    
    set(key, data) {
        const item = this[key];
        if (item) {
            item.data = data;
            item.timestamp = Date.now();
        }
    },
    
    clear(key) {
        if (key && this[key]) {
            this[key].data = null;
            this[key].timestamp = null;
        } else {
            Object.keys(this).forEach(k => {
                if (this[k] && typeof this[k] === 'object' && this[k].hasOwnProperty('data')) {
                    this[k].data = null;
                    this[k].timestamp = null;
                }
            });
        }
    }
};

// =====================================================
// VERIFICAR SI LA ORDEN PUEDE SER EDITADA
// =====================================================

function puedeEditarOrden(estadoGlobal, trabajoIniciado = false) {
    if (trabajoIniciado) {
        return { 
            editable: false, 
            mensaje: `🔒 El técnico ya comenzó el trabajo en esta orden. No se puede modificar.` 
        };
    }
    
    const estadosBloqueados = ['Finalizado', 'Entregado'];
    
    if (estadosBloqueados.includes(estadoGlobal)) {
        return { 
            editable: false, 
            mensaje: `❌ La orden está en estado "${estadoGlobal}". No se puede modificar.` 
        };
    }
    
    return { editable: true, mensaje: null };
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    await Promise.all([
        cargarTecnicos(),
        cargarOrdenesActivas(),
        cargarOrdenesFinalizadas()
    ]);
    
    iniciarPolling();
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            cargarOrdenesActivas(true);
            cargarOrdenesFinalizadas(true);
        }
    });
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userInfo = payload.user;
        
        if (userInfo && userInfo.roles && Array.isArray(userInfo.roles)) {
            rolesUsuario = userInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            rolesUsuario = user.roles || [];
            if (userInfo) userInfo.roles = rolesUsuario;
        }
        
        const tieneRolPermitido = rolesUsuario.includes('jefe_taller') || rolesUsuario.includes('jefe_operativo');
        
        if (!tieneRolPermitido) {
            window.location.href = '/';
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
        return false;
    }
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
    
    const userNombreSpan = document.getElementById('userNombre');
    if (userNombreSpan && userInfo) {
        userNombreSpan.textContent = userInfo.nombre || userInfo.email || 'Usuario';
    }
}

function setupEventListeners() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            cambiarPestana(tabId);
        });
    });
    
    document.getElementById('refreshActivas')?.addEventListener('click', () => cargarOrdenesActivas(true));
    document.getElementById('refreshFinalizadas')?.addEventListener('click', () => cargarOrdenesFinalizadas(true));
    
    const searchActivas = document.getElementById('searchActivas');
    const tecnicoFiltro = document.getElementById('tecnicoFiltro');
    const estadoFiltroActivas = document.getElementById('estadoFiltroActivas');
    
    if (searchActivas) {
        searchActivas.addEventListener('input', debounce(() => filtrarOrdenesActivas(), 300));
    }
    if (tecnicoFiltro) tecnicoFiltro.addEventListener('change', () => filtrarOrdenesActivas());
    if (estadoFiltroActivas) estadoFiltroActivas.addEventListener('change', () => filtrarOrdenesActivas());
    
    const searchFinalizadas = document.getElementById('searchFinalizadas');
    const fechaDesdeFinalizadas = document.getElementById('fechaDesdeFinalizadas');
    const fechaHastaFinalizadas = document.getElementById('fechaHastaFinalizadas');
    
    if (searchFinalizadas) {
        searchFinalizadas.addEventListener('input', debounce(() => filtrarOrdenesFinalizadas(), 300));
    }
    if (fechaDesdeFinalizadas) fechaDesdeFinalizadas.addEventListener('change', () => filtrarOrdenesFinalizadas());
    if (fechaHastaFinalizadas) fechaHastaFinalizadas.addEventListener('change', () => filtrarOrdenesFinalizadas());
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarModalGestionOrden();
            cerrarModalDetalleOrden();
            cerrarModalHistorialDiagnostico();
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function cambiarPestana(tabId) {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');
    
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabId));
    panels.forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tabId}`));
}

// =====================================================
// API CALLS
// =====================================================

async function cargarTecnicos(forceRefresh = false) {
    try {
        if (!forceRefresh) {
            const cachedTecnicos = dataCache.get('tecnicos');
            if (cachedTecnicos) {
                tecnicosDisponibles = cachedTecnicos;
                actualizarFiltroTecnicos();
                return;
            }
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/tecnicos`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.tecnicos) {
            tecnicosDisponibles = data.tecnicos;
            dataCache.set('tecnicos', tecnicosDisponibles);
            actualizarFiltroTecnicos();
        }
    } catch (error) {
        console.error('Error cargando técnicos:', error);
        mostrarNotificacion('Error al cargar técnicos', 'error');
    }
}

function actualizarFiltroTecnicos() {
    const selectTecnico = document.getElementById('tecnicoFiltro');
    if (selectTecnico && tecnicosDisponibles.length > 0) {
        selectTecnico.innerHTML = '<option value="">Todos los técnicos</option>' +
            tecnicosDisponibles.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)} (${t.ordenes_activas}/${t.max_vehiculos})</option>`).join('');
    }
}

// =====================================================
// CARGAR ÓRDENES ACTIVAS - USANDO NUEVO ENDPOINT V2
// =====================================================

async function cargarOrdenesActivas(forceRefresh = false) {
    try {
        const container = document.getElementById('ordenesActivasList');
        if (!ordenesActivas.length && container) {
            container.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando órdenes activas...</p></div>`;
        }
        
        // Usar el endpoint optimizado
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-activas-v2`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.ordenes) {
            ordenesActivas = data.ordenes;
            const countElement = document.getElementById('activasCount');
            if (countElement) countElement.textContent = ordenesActivas.length;
            renderOrdenesActivas(ordenesActivas);
        } else {
            throw new Error(data.error || 'Error al cargar órdenes');
        }
    } catch (error) {
        console.error('Error cargando órdenes activas:', error);
        const container = document.getElementById('ordenesActivasList');
        if (container) {
            container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar órdenes: ${error.message}</p><button onclick="cargarOrdenesActivas(true)">Reintentar</button></div>`;
        }
    }
}

async function cargarOrdenesFinalizadas(forceRefresh = false) {
    try {
        const container = document.getElementById('ordenesFinalizadasList');
        if (!ordenesFinalizadas.length && container) {
            container.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando órdenes finalizadas...</p></div>`;
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-finalizadas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.ordenes) {
            ordenesFinalizadas = data.ordenes;
            const countElement = document.getElementById('finalizadasCount');
            if (countElement) countElement.textContent = ordenesFinalizadas.length;
            renderOrdenesFinalizadas(ordenesFinalizadas);
        } else {
            throw new Error(data.error || 'Error al cargar órdenes');
        }
    } catch (error) {
        console.error('Error cargando órdenes finalizadas:', error);
        const container = document.getElementById('ordenesFinalizadasList');
        if (container) {
            container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar órdenes: ${error.message}</p><button onclick="cargarOrdenesFinalizadas(true)">Reintentar</button></div>`;
        }
    }
}

// =====================================================
// RENDERIZAR ÓRDENES ACTIVAS - CORREGIDO
// =====================================================

function renderOrdenesActivas(ordenes) {
    const container = document.getElementById('ordenesActivasList');
    if (!container) return;
    
    if (!ordenes || ordenes.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-tasks"></i><p>No hay órdenes activas</p></div>`;
        return;
    }
    
    const estadoDisplay = {
        'EnRecepcion': 'En Recepción',
        'EnDiagnostico': 'En Diagnóstico',
        'DiagnosticoCompletado': 'Diagnóstico Completado',
        'CotizacionEnviada': 'Cotización Enviada',
        'CotizacionAceptada': 'Cotización Aceptada',
        'CotizacionParcial': 'Cotización Parcial',
        'CotizacionRechazada': 'Cotización Rechazada',
        'EnArmadoVehiculo': 'Armando Vehículo',
        'VehiculoArmado': 'Vehículo Armado',
        'EnReparacion': 'En Reparación',
        'EnPausa': 'En Pausa',
        'ReparacionCompletada': 'Reparación Completada'
    };
    
    container.innerHTML = ordenes.map(orden => {
        // 🔥 Los datos del vehículo están en orden.vehiculo
        const v = orden.vehiculo || {};
        const marca = v.marca || '';
        const modelo = v.modelo || '';
        const placa = v.placa || '';
        const clienteNombre = v.cliente_nombre || 'No registrado';
        
        const trabajoIniciado = orden.trabajo_iniciado || false;
        const puedeGestionar = !trabajoIniciado && orden.estado_global === 'EnRecepcion';
        const ordenId = orden.id_orden || orden.id;
        
        let estadoIcono = '';
        switch (orden.estado_global) {
            case 'EnRecepcion': estadoIcono = '📋'; break;
            case 'EnDiagnostico': estadoIcono = '🔧'; break;
            case 'DiagnosticoCompletado': estadoIcono = '✅'; break;
            case 'CotizacionEnviada': estadoIcono = '💰'; break;
            case 'CotizacionAceptada': estadoIcono = '👍'; break;
            case 'EnReparacion': estadoIcono = '🔨'; break;
            case 'EnPausa': estadoIcono = '⏸️'; break;
            default: estadoIcono = '📌';
        }
        
        const tecnicosLista = orden.tecnicos || [];
        
        return `
            <div class="orden-card" data-id="${ordenId}" data-estado="${orden.estado_global}">
                <div class="orden-card-header">
                    <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-estado ${orden.estado_global}">
                        ${estadoIcono} ${estadoDisplay[orden.estado_global] || orden.estado_global}
                    </span>
                    <span class="recepcion-fecha">
                        <i class="far fa-calendar-alt"></i> ${new Date(orden.fecha_ingreso).toLocaleDateString()}
                    </span>
                </div>
                
                <div class="orden-card-body">
                    <div class="orden-info-item">
                        <span class="orden-info-label">Cliente</span>
                        <span class="orden-info-value">${escapeHtml(clienteNombre)}</span>
                    </div>
                    <div class="orden-info-item">
                        <span class="orden-info-label">Vehículo</span>
                        <span class="orden-info-value">
                            ${escapeHtml(marca)} ${escapeHtml(modelo)} 
                            <span class="placa">(${escapeHtml(placa)})</span>
                        </span>
                    </div>
                    <div class="orden-info-item">
                        <span class="orden-info-label">Técnicos</span>
                        <div class="orden-tecnicos">
                            ${tecnicosLista.length > 0 ? 
                                tecnicosLista.map(t => `<span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>`).join('') :
                                '<span class="tecnico-badge sin-asignar"><i class="fas fa-user-slash"></i> Sin asignar</span>'}
                        </div>
                    </div>
                    ${orden.bahia_asignada ? `
                    <div class="orden-info-item">
                        <span class="orden-info-label">Bahía</span>
                        <span class="orden-info-value"><i class="fas fa-warehouse"></i> Bahía ${orden.bahia_asignada}</span>
                    </div>
                    ` : ''}
                    ${orden.fecha_hora_inicio_estimado ? `
                    <div class="orden-info-item">
                        <span class="orden-info-label">Inicio estimado</span>
                        <span class="orden-info-value">
                            <i class="far fa-clock"></i> ${new Date(orden.fecha_hora_inicio_estimado).toLocaleString()}
                        </span>
                    </div>
                    ` : ''}
                    ${orden.horas_estimadas ? `
                    <div class="orden-info-item">
                        <span class="orden-info-label">Horas estimadas</span>
                        <span class="orden-info-value"><i class="fas fa-hourglass-half"></i> ${orden.horas_estimadas} h</span>
                    </div>
                    ` : ''}
                    ${orden.trabajo_iniciado ? `
                    <div class="orden-info-item trabajo-iniciado">
                        <i class="fas fa-play-circle"></i> 
                        <strong class="text-warning">Trabajo iniciado por el técnico</strong>
                    </div>
                    ` : ''}
                </div>
                
                <div class="orden-card-footer">
                    ${puedeGestionar ? `
                    <button class="btn-accion-orden btn-gestionar" onclick="window.abrirModalGestionOrden(${ordenId})">
                        <i class="fas fa-edit"></i> Gestionar Orden
                    </button>
                    ` : `
                    <button class="btn-accion-orden btn-gestionar disabled" disabled style="opacity:0.5; cursor:not-allowed;">
                        <i class="fas fa-lock"></i> Gestionar Orden
                    </button>
                    `}
                    <button class="btn-accion-orden btn-ver-detalle-orden" onclick="window.verDetalleOrden(${ordenId})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    ${orden.estado_global === 'EnDiagnostico' ? `
                    <button class="btn-accion-orden btn-diagnostico" onclick="window.verDiagnosticoPendiente(${ordenId})">
                        <i class="fas fa-stethoscope"></i> Ver Diagnóstico
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderOrdenesFinalizadas(ordenes) {
    const container = document.getElementById('ordenesFinalizadasList');
    if (!container) return;
    
    if (!ordenes || ordenes.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>No hay órdenes finalizadas</p></div>`;
        return;
    }
    
    container.innerHTML = ordenes.map(orden => {
        const v = orden.vehiculo || {};
        const marca = v.marca || '';
        const modelo = v.modelo || '';
        const placa = v.placa || '';
        const clienteNombre = v.cliente_nombre || 'No registrado';
        const ordenId = orden.id_orden || orden.id;
        
        return `
            <div class="orden-card" data-id="${ordenId}">
                <div class="orden-card-header">
                    <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-estado ${orden.estado_global}">${orden.estado_global}</span>
                    <span class="recepcion-fecha"><i class="far fa-calendar-alt"></i> ${new Date(orden.fecha_ingreso).toLocaleDateString()}</span>
                </div>
                <div class="orden-card-body">
                    <div class="orden-info-item"><span class="orden-info-label">Cliente</span><span class="orden-info-value">${escapeHtml(clienteNombre)}</span></div>
                    <div class="orden-info-item"><span class="orden-info-label">Vehículo</span><span class="orden-info-value">${escapeHtml(marca)} ${escapeHtml(modelo)} (${escapeHtml(placa)})</span></div>
                    <div class="orden-info-item"><span class="orden-info-label">Fecha entrega</span><span class="orden-info-value">${orden.fecha_entrega ? new Date(orden.fecha_entrega).toLocaleDateString() : 'N/A'}</span></div>
                </div>
                <div class="orden-card-footer">
                    <button class="btn-accion-orden btn-ver-detalle-orden" onclick="window.verDetalleOrden(${ordenId})"><i class="fas fa-eye"></i> Ver Detalle</button>
                </div>
            </div>
        `;
    }).join('');
}

function filtrarOrdenesActivas() {
    const searchTerm = document.getElementById('searchActivas')?.value?.toLowerCase() || '';
    const tecnicoFiltro = document.getElementById('tecnicoFiltro')?.value || '';
    const estadoFiltro = document.getElementById('estadoFiltroActivas')?.value || '';
    
    let filtradas = [...ordenesActivas];
    
    if (searchTerm) {
        filtradas = filtradas.filter(o => 
            (o.codigo_unico?.toLowerCase().includes(searchTerm)) ||
            (o.vehiculo?.placa?.toLowerCase().includes(searchTerm)) ||
            (o.vehiculo?.cliente_nombre?.toLowerCase().includes(searchTerm))
        );
    }
    if (tecnicoFiltro) {
        filtradas = filtradas.filter(o => o.tecnicos && o.tecnicos.some(t => t.id == tecnicoFiltro));
    }
    if (estadoFiltro) {
        filtradas = filtradas.filter(o => o.estado_global === estadoFiltro);
    }
    renderOrdenesActivas(filtradas);
}

function filtrarOrdenesFinalizadas() {
    const searchTerm = document.getElementById('searchFinalizadas')?.value?.toLowerCase() || '';
    const fechaDesde = document.getElementById('fechaDesdeFinalizadas')?.value || '';
    const fechaHasta = document.getElementById('fechaHastaFinalizadas')?.value || '';
    
    let filtradas = [...ordenesFinalizadas];
    
    if (searchTerm) {
        filtradas = filtradas.filter(o => 
            (o.codigo_unico?.toLowerCase().includes(searchTerm)) ||
            (o.vehiculo?.placa?.toLowerCase().includes(searchTerm)) ||
            (o.vehiculo?.cliente_nombre?.toLowerCase().includes(searchTerm))
        );
    }
    if (fechaDesde) filtradas = filtradas.filter(o => o.fecha_ingreso >= fechaDesde);
    if (fechaHasta) filtradas = filtradas.filter(o => o.fecha_ingreso <= fechaHasta + 'T23:59:59');
    
    renderOrdenesFinalizadas(filtradas);
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        if (!document.hidden) {
            cargarOrdenesActivas();
        }
    }, 30000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const iconos = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// =====================================================
// FUNCIONES DE GESTIÓN DE ORDEN (simplificadas para este ejemplo)
// =====================================================

async function abrirModalGestionOrden(idOrden) {
    mostrarNotificacion('Función en desarrollo', 'info');
}

function cerrarModalGestionOrden() {
    const modal = document.getElementById('modalGestionOrden');
    if (modal) modal.classList.remove('show');
}

function cerrarModalDetalleOrden() {
    const modal = document.getElementById('modalDetalleOrden');
    if (modal) modal.classList.remove('show');
}

function cerrarModalHistorialDiagnostico() {
    const modal = document.getElementById('modalHistorialDiagnostico');
    if (modal) modal.classList.remove('show');
}

async function verDetalleOrden(idOrden) {
    mostrarNotificacion('Cargando detalle...', 'info');
    // Implementación similar a la original
}

// Exponer funciones globales
window.verDetalleOrden = verDetalleOrden;
window.cerrarModalDetalleOrden = cerrarModalDetalleOrden;
window.cerrarModalHistorialDiagnostico = cerrarModalHistorialDiagnostico;
window.abrirModalGestionOrden = abrirModalGestionOrden;
window.cerrarModalGestionOrden = cerrarModalGestionOrden;
window.cargarOrdenesActivas = cargarOrdenesActivas;
window.cargarOrdenesFinalizadas = cargarOrdenesFinalizadas;