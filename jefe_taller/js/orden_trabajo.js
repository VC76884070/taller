// =====================================================
// ÓRDENES DE TRABAJO - JEFE TALLER
// VERSIÓN COMPLETA Y CORREGIDA CON BAHÍAS Y DIAGNÓSTICOS
// =====================================================

if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 OrdenTrabajo.js - Modo DESARROLLO');
            return 'http://localhost:5000';
        }
        console.log('📡 OrdenTrabajo.js - Modo PRODUCCIÓN');
        return '';
    })();
}

const API_URL = `${window.API_BASE_URL}/api`;
let userInfo = null;
let pollingInterval = null;
let rolesUsuario = [];

let ordenesActivas = [];
let ordenesFinalizadas = [];
let tecnicosDisponibles = [];
let ordenEnGestion = null;
let bahiasEstado = [];

// Variables para grabación de audio
let audioBlob = null;
let audioChunks = [];
let isRecording = false;
let mediaRecorder = null;

let isUpdating = false;
let lastActivasFetch = 0;
let lastFinalizadasFetch = 0;

const CACHE_TTL = {
    activas: 30000,
    finalizadas: 60000,
    tecnicos: 30000,
    bahias: 10000
};

const dataCache = {
    tecnicos: { data: null, timestamp: null },
    bahias: { data: null, timestamp: null },
    
    get(key) {
        const item = this[key];
        if (item && item.data && item.timestamp) {
            const ttl = CACHE_TTL[key] || 30000;
            if ((Date.now() - item.timestamp) < ttl) {
                return item.data;
            }
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
    
    const estadosBloqueados = ['Finalizado', 'Entregado', 'CotizacionAceptada', 'CotizacionEnviada'];
    
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
    console.log('🚀 Inicializando orden_trabajo.js (Jefe Taller)');
    console.log('📡 API_URL:', API_URL);
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    await Promise.all([
        cargarTecnicos(),
        cargarEstadoBahias(),
        cargarUltimasOrdenesActivas(),
        cargarOrdenesFinalizadas()
    ]);
    
    iniciarPolling();
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            cargarUltimasOrdenesActivas(true);
            cargarOrdenesFinalizadas(true);
            cargarEstadoBahias(true);
        }
    });
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = `${window.API_BASE_URL}/`;
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
            window.location.href = `${window.API_BASE_URL}/`;
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = `${window.API_BASE_URL}/`;
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
}

function setupEventListeners() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            cambiarPestana(tabId);
        });
    });
    
    document.getElementById('refreshActivas')?.addEventListener('click', () => {
        cargarUltimasOrdenesActivas(true);
    });
    document.getElementById('refreshFinalizadas')?.addEventListener('click', () => {
        cargarOrdenesFinalizadas(true);
    });
    
    const refreshBahiasBtn = document.getElementById('refreshBahiasBtn');
    if (refreshBahiasBtn) {
        refreshBahiasBtn.addEventListener('click', () => cargarEstadoBahias(true));
    }
    
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
    
    if (tabId === 'activas') {
        cargarUltimasOrdenesActivas();
    } else if (tabId === 'finalizadas') {
        cargarOrdenesFinalizadas();
    }
}

// =====================================================
// API CALLS - BAHÍAS
// =====================================================

async function cargarEstadoBahias(forceRefresh = false) {
    try {
        if (!forceRefresh) {
            const cached = dataCache.get('bahias');
            if (cached) {
                bahiasEstado = cached;
                renderBahias(bahiasEstado);
                return;
            }
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/bahias/estado`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.bahias) {
            bahiasEstado = data.bahias;
            dataCache.set('bahias', bahiasEstado);
            renderBahias(bahiasEstado);
        } else {
            const container = document.getElementById('bahiasGrid');
            if (container) {
                container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar bahías</p></div>`;
            }
        }
        
    } catch (error) {
        console.error('Error cargando bahías:', error);
        const container = document.getElementById('bahiasGrid');
        if (container) {
            container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar bahías</p></div>`;
        }
    }
}

function renderBahias(bahias) {
    const container = document.getElementById('bahiasGrid');
    if (!container) return;
    
    if (!bahias || bahias.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-warehouse"></i><p>No hay bahías configuradas</p></div>`;
        return;
    }
    
    const estadoTexto = {
        'libre': 'Libre',
        'ocupado': 'Ocupado',
        'reservado': 'Reservado'
    };
    
    const estadoIcono = {
        'libre': 'fa-check-circle',
        'ocupado': 'fa-circle',
        'reservado': 'fa-clock'
    };
    
    const html = bahias.map(bahia => {
        const estado = bahia.estado;
        return `
            <div class="bahia-card ${estado}" onclick="verOrdenEnBahia(${bahia.numero}, '${bahia.orden_codigo || ''}')">
                <div class="bahia-numero">Bahía ${bahia.numero}</div>
                <div class="bahia-estado ${estado}">
                    <i class="fas ${estadoIcono[estado]}"></i> ${estadoTexto[estado]}
                </div>
                ${bahia.orden_codigo ? `<div class="bahia-orden">Orden: ${escapeHtml(bahia.orden_codigo)}</div>` : ''}
                ${bahia.fecha_inicio_estimado ? `<div class="bahia-tiempo">Inicio: ${new Date(bahia.fecha_inicio_estimado).toLocaleString()}</div>` : ''}
                ${bahia.horas_estimadas ? `<div class="bahia-tiempo">⏱️ ${bahia.horas_estimadas}h</div>` : ''}
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

function verOrdenEnBahia(bahiaNumero, ordenCodigo) {
    if (ordenCodigo) {
        mostrarNotificacion(`Bahía ${bahiaNumero} - Orden: ${ordenCodigo}`, 'info');
    } else {
        mostrarNotificacion(`Bahía ${bahiaNumero} está libre`, 'success');
    }
}

// =====================================================
// API CALLS - ÓRDENES
// =====================================================

async function cargarUltimasOrdenesActivas(forceRefresh = false) {
    if (isUpdating) return;
    
    const now = Date.now();
    
    if (!forceRefresh && ordenesActivas.length > 0 && (now - lastActivasFetch) < CACHE_TTL.activas) {
        renderOrdenesActivas(ordenesActivas);
        return;
    }
    
    isUpdating = true;
    
    try {
        const container = document.getElementById('ordenesActivasList');
        if (!container) return;
        
        if (ordenesActivas.length === 0) {
            container.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando órdenes activas...</p></div>`;
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/ultimas-ordenes`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.success && data.ordenes) {
            ordenesActivas = data.ordenes;
            lastActivasFetch = Date.now();
            
            const countElement = document.getElementById('activasCount');
            if (countElement) {
                countElement.textContent = ordenesActivas.length;
            }
            
            renderOrdenesActivas(ordenesActivas);
        } else {
            throw new Error(data.error || 'Error al cargar órdenes');
        }
        
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        const container = document.getElementById('ordenesActivasList');
        if (container && ordenesActivas.length === 0) {
            container.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar órdenes: ${error.message}</p>
                    <button onclick="cargarUltimasOrdenesActivas(true)" class="btn-retry">
                        <i class="fas fa-sync-alt"></i> Reintentar
                    </button>
                </div>
            `;
        }
    } finally {
        isUpdating = false;
    }
}

async function cargarTodasOrdenesActivas() {
    mostrarNotificacion('Cargando todas las órdenes activas...', 'info');
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-activas-v2`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.ordenes) {
            ordenesActivas = data.ordenes;
            const countElement = document.getElementById('activasCount');
            if (countElement) countElement.textContent = ordenesActivas.length;
            renderOrdenesActivas(ordenesActivas);
            mostrarNotificacion(`Se cargaron ${ordenesActivas.length} órdenes activas`, 'success');
        } else {
            throw new Error(data.error || 'Error al cargar órdenes');
        }
    } catch (error) {
        console.error('Error cargando todas las órdenes:', error);
        mostrarNotificacion('Error al cargar todas las órdenes', 'error');
    }
}

async function cargarTecnicos(forceRefresh = false) {
    try {
        if (!forceRefresh) {
            const cached = dataCache.get('tecnicos');
            if (cached) {
                tecnicosDisponibles = cached;
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

async function cargarOrdenesFinalizadas(forceRefresh = false) {
    if (isUpdating && !forceRefresh) return;
    
    const now = Date.now();
    
    if (!forceRefresh && ordenesFinalizadas.length > 0 && (now - lastFinalizadasFetch) < CACHE_TTL.finalizadas) {
        renderOrdenesFinalizadas(ordenesFinalizadas);
        return;
    }
    
    isUpdating = true;
    
    try {
        const container = document.getElementById('ordenesFinalizadasList');
        if (ordenesFinalizadas.length === 0 && container) {
            container.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando órdenes finalizadas...</p></div>`;
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-finalizadas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.ordenes) {
            ordenesFinalizadas = data.ordenes;
            lastFinalizadasFetch = Date.now();
            const countElement = document.getElementById('finalizadasCount');
            if (countElement) countElement.textContent = ordenesFinalizadas.length;
            renderOrdenesFinalizadas(ordenesFinalizadas);
        } else {
            throw new Error(data.error || 'Error al cargar órdenes');
        }
    } catch (error) {
        console.error('Error cargando órdenes finalizadas:', error);
        const container = document.getElementById('ordenesFinalizadasList');
        if (container && ordenesFinalizadas.length === 0) {
            container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar órdenes: ${error.message}</p><button onclick="cargarOrdenesFinalizadas(true)">Reintentar</button></div>`;
        }
    } finally {
        isUpdating = false;
    }
}

// =====================================================
// RENDERIZAR ÓRDENES
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
    
    const estadoIcono = {
        'EnRecepcion': '📋',
        'EnDiagnostico': '🔧',
        'DiagnosticoCompletado': '✅',
        'CotizacionEnviada': '💰',
        'CotizacionAceptada': '👍',
        'CotizacionParcial': '💸',
        'CotizacionRechazada': '❌',
        'EnArmadoVehiculo': '🔨',
        'VehiculoArmado': '🚗',
        'EnReparacion': '🛠️',
        'EnPausa': '⏸️',
        'ReparacionCompletada': '✔️'
    };
    
    const html = ordenes.map(orden => {
        const v = orden.vehiculo || {};
        const marca = v.marca || '';
        const modelo = v.modelo || '';
        const placa = v.placa || '';
        const clienteNombre = v.cliente_nombre || 'No registrado';
        
        const trabajoIniciado = orden.trabajo_iniciado || false;
        const puedeGestionar = !trabajoIniciado && orden.estado_global === 'EnRecepcion';
        const ordenId = orden.id_orden || orden.id;
        
        const icono = estadoIcono[orden.estado_global] || '📌';
        const estadoTexto = estadoDisplay[orden.estado_global] || orden.estado_global;
        
        const tecnicosLista = orden.tecnicos || [];
        const fechaIngreso = new Date(orden.fecha_ingreso).toLocaleDateString();
        
        return `
            <div class="orden-card" data-id="${ordenId}" data-estado="${orden.estado_global}">
                <div class="orden-card-header">
                    <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-estado ${orden.estado_global}">
                        ${icono} ${estadoTexto}
                    </span>
                    <span class="recepcion-fecha">
                        <i class="far fa-calendar-alt"></i> ${fechaIngreso}
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
                    ${trabajoIniciado ? `
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
                    <button class="btn-accion-orden btn-gestionar disabled" disabled style="opacity:0.5; cursor:not-allowed;" title="${!trabajoIniciado ? 'La orden no está en estado de recepción' : 'El técnico ya inició el trabajo'}">
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
    
    const verMasBtn = ordenes.length === 10 ? `
        <div class="ver-mas-container">
            <button class="btn-ver-mas" onclick="cargarTodasOrdenesActivas()">
                <i class="fas fa-chevron-down"></i> Ver todas las órdenes activas
            </button>
            <span class="ver-mas-hint">Mostrando las 10 órdenes más recientes</span>
        </div>
    ` : '';
    
    container.innerHTML = html + verMasBtn;
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

// =====================================================
// FILTROS
// =====================================================

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
    if (fechaDesde) {
        filtradas = filtradas.filter(o => o.fecha_ingreso >= fechaDesde);
    }
    if (fechaHasta) {
        filtradas = filtradas.filter(o => o.fecha_ingreso <= fechaHasta + 'T23:59:59');
    }
    
    renderOrdenesFinalizadas(filtradas);
}

// =====================================================
// POLLING
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(() => {
        if (!document.hidden && !isUpdating) {
            const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
            
            if (activeTab === 'activas') {
                cargarUltimasOrdenesActivas();
            } else if (activeTab === 'finalizadas') {
                cargarOrdenesFinalizadas();
            }
            cargarEstadoBahias();
        }
    }, 30000);
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

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
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${iconos[tipo] || iconos.info}"></i>
        <span>${escapeHtml(mensaje)}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// =====================================================
// FUNCIONES DE GESTIÓN DE ORDEN
// =====================================================

async function abrirModalGestionOrden(idOrden) {
    try {
        mostrarNotificacion('Cargando datos de la orden...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al cargar la orden');
        }
        
        ordenEnGestion = data.detalle;
        
        if (tecnicosDisponibles.length === 0) {
            await cargarTecnicos(true);
        }
        
        await cargarEstadoBahias(true);
        
        renderModalGestionOrden();
        
        const modal = document.getElementById('modalGestionOrden');
        if (modal) modal.classList.add('show');
        
    } catch (error) {
        console.error('Error abriendo modal:', error);
        mostrarNotificacion('Error al cargar la orden: ' + error.message, 'error');
    }
}

function renderModalGestionOrden() {
    const body = document.getElementById('modalGestionOrdenBody');
    const footer = document.getElementById('modalGestionOrdenFooter');
    
    if (!body || !ordenEnGestion) return;
    
    const puedeEditar = puedeEditarOrden(ordenEnGestion.estado_global, ordenEnGestion.trabajo_iniciado);
    
    // Obtener bahías para mostrar en el grid visual
    const bahiasParaSeleccion = bahiasEstado.length > 0 ? bahiasEstado : [];
    const bahiaActual = ordenEnGestion.planificacion?.bahia_asignada || null;
    
    body.innerHTML = `
        <div class="gestion-orden">
            <!-- Información de la orden -->
            <div class="gestion-section">
                <div class="gestion-section-header">
                    <h3><i class="fas fa-info-circle"></i> Información de la Orden</h3>
                </div>
                <div class="gestion-section-body">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Código de Orden</label>
                            <input type="text" class="form-input" value="${escapeHtml(ordenEnGestion.codigo_unico)}" readonly disabled>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Estado Actual</label>
                            <input type="text" class="form-input" value="${ordenEnGestion.estado_global}" readonly disabled>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Vehículo</label>
                            <input type="text" class="form-input" value="${escapeHtml(ordenEnGestion.marca)} ${escapeHtml(ordenEnGestion.modelo)} (${escapeHtml(ordenEnGestion.placa)})" readonly disabled>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Cliente</label>
                            <input type="text" class="form-input" value="${escapeHtml(ordenEnGestion.cliente?.nombre || 'No registrado')}" readonly disabled>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- ===================================================== -->
            <!-- DIAGNÓSTICO DEL CLIENTE (NO EDITABLE) -->
            <!-- ===================================================== -->
            <div class="gestion-section">
                <div class="gestion-section-header">
                    <h3><i class="fas fa-headset"></i> Diagnóstico del Cliente</h3>
                    <span class="section-status ${ordenEnGestion.transcripcion_problema ? 'completado' : 'pendiente'}">
                        ${ordenEnGestion.transcripcion_problema ? '✓ Registrado' : '○ Pendiente'}
                    </span>
                </div>
                <div class="gestion-section-body">
                    <div class="alert-info" style="background: rgba(59,130,246,0.1); padding: 0.75rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                        <i class="fas fa-info-circle"></i>
                        <small>Este diagnóstico fue proporcionado por el cliente durante la recepción del vehículo. <strong>NO es editable</strong>.</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Problema reportado por el cliente</label>
                        <textarea class="form-textarea" rows="3" readonly disabled style="background: var(--gris-oscuro);">${escapeHtml(ordenEnGestion.transcripcion_problema || 'No se ha registrado diagnóstico del cliente')}</textarea>
                    </div>
                </div>
            </div>
            
            <!-- ===================================================== -->
            <!-- DIAGNÓSTICO DEL JEFE DE TALLER (EDITABLE) -->
            <!-- ===================================================== -->
            <div class="gestion-section">
                <div class="gestion-section-header">
                    <h3><i class="fas fa-stethoscope"></i> Diagnóstico del Jefe Taller</h3>
                    <span class="section-status ${ordenEnGestion.diagnostigo_taller ? 'completado' : 'pendiente'}">
                        ${ordenEnGestion.diagnostigo_taller ? '✓ Registrado' : '○ Pendiente'}
                    </span>
                </div>
                <div class="gestion-section-body">
                    <div class="alert-warning" style="background: rgba(245,158,11,0.1); padding: 0.75rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                        <i class="fas fa-edit"></i>
                        <small>Este diagnóstico será visible para los técnicos. <strong>Puede editarlo</strong> para dar instrucciones específicas.</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Diagnóstico e instrucciones para el técnico</label>
                        <textarea id="diagnosticoTaller" class="form-textarea" rows="4" placeholder="Ingrese el diagnóstico técnico y las instrucciones para los mecánicos..." ${!puedeEditar.editable ? 'disabled' : ''}>${escapeHtml(ordenEnGestion.diagnostigo_taller || '')}</textarea>
                    </div>
                    <div class="diagnostico-audio">
                        <div class="diagnostico-audio-controls">
                            <button type="button" id="btnGrabarAudioTaller" class="btn-audio" ${!puedeEditar.editable ? 'disabled' : ''}>
                                <i class="fas fa-microphone"></i> Grabar Audio
                            </button>
                            <button type="button" id="btnDetenerAudioTaller" class="btn-audio" style="display:none;">
                                <i class="fas fa-stop"></i> Detener Grabación
                            </button>
                        </div>
                        <audio id="audioReproduccionTaller" controls style="display:none; width: 100%; margin-top: 10px;"></audio>
                    </div>
                </div>
            </div>
            
            <!-- Asignación de Técnicos -->
            <div class="gestion-section">
                <div class="gestion-section-header">
                    <h3><i class="fas fa-users"></i> Asignar Técnicos</h3>
                    <span class="section-status ${ordenEnGestion.tecnicos?.length > 0 ? 'completado' : 'pendiente'}">
                        ${ordenEnGestion.tecnicos?.length > 0 ? '✓ Asignados' : '○ Pendiente'}
                    </span>
                </div>
                <div class="gestion-section-body">
                    <div class="tecnicos-grid">
                        ${tecnicosDisponibles.map(t => {
                            const isAssigned = ordenEnGestion.tecnicos?.some(tec => tec.id === t.id);
                            const isDisabled = !t.disponible && !isAssigned;
                            return `
                                <label class="tecnico-option ${isAssigned ? 'selected' : ''}" style="${isDisabled ? 'opacity: 0.6; cursor: not-allowed;' : ''}">
                                    <input type="checkbox" name="tecnico" value="${t.id}" ${isAssigned ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                                    <div class="tecnico-info">
                                        <div class="tecnico-nombre">${escapeHtml(t.nombre)}</div>
                                        <div class="tecnico-carga">${t.ordenes_activas}/${t.max_vehiculos} vehículos</div>
                                    </div>
                                </label>
                            `;
                        }).join('')}
                    </div>
                    <small class="modal-hint">Selecciona hasta 2 técnicos para esta orden</small>
                </div>
            </div>
            
            <!-- Planificación con Bahías Visuales -->
            <div class="gestion-section">
                <div class="gestion-section-header">
                    <h3><i class="fas fa-calendar"></i> Planificación y Bahías</h3>
                    <span class="section-status ${ordenEnGestion.planificacion?.bahia_asignada ? 'completado' : 'pendiente'}">
                        ${ordenEnGestion.planificacion?.bahia_asignada ? '✓ Planificado' : '○ Pendiente'}
                    </span>
                </div>
                <div class="gestion-section-body">
                    <div class="bahias-seleccion-section">
                        <label class="form-label">Seleccionar Bahía</label>
                        <div class="bahias-grid-seleccion" id="bahiasGridSeleccion">
                            ${renderBahiasSeleccion(bahiasParaSeleccion, bahiaActual, puedeEditar.editable)}
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Fecha/Hora Inicio Estimado</label>
                            <input type="datetime-local" id="fecha_inicio" class="form-input" value="${ordenEnGestion.planificacion?.fecha_hora_inicio_estimado ? new Date(ordenEnGestion.planificacion.fecha_hora_inicio_estimado).toISOString().slice(0, 16) : ''}" ${!puedeEditar.editable ? 'disabled' : ''}>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Horas Estimadas</label>
                            <input type="number" id="horas_estimadas" class="form-input" step="0.5" value="${ordenEnGestion.planificacion?.horas_estimadas || ''}" ${!puedeEditar.editable ? 'disabled' : ''}>
                        </div>
                    </div>
                </div>
            </div>
            
            ${!puedeEditar.editable ? `
            <div class="bloqueo-banner warning">
                <i class="fas fa-lock"></i>
                <div>
                    <strong>⚠️ Orden Bloqueada</strong>
                    <p>${puedeEditar.mensaje}</p>
                </div>
            </div>
            ` : ''}
        </div>
    `;
    
    if (footer) {
        footer.innerHTML = `
            <button class="btn-secondary" onclick="window.cerrarModalGestionOrden()">Cancelar</button>
            ${puedeEditar.editable ? `<button class="btn-primary" onclick="window.guardarGestionOrden()">Guardar Cambios</button>` : ''}
        `;
    }
    
    if (puedeEditar.editable) {
        setupAudioEventosTaller();
        setupBahiasSeleccion();
    }
}

function renderBahiasSeleccion(bahias, bahiaActual, editable) {
    if (!bahias || bahias.length === 0) {
        // Si no hay datos de bahías, mostrar del 1 al 12
        let html = '';
        for (let i = 1; i <= 12; i++) {
            const isSelected = bahiaActual == i;
            html += `
                <div class="bahia-item ${isSelected ? 'selected' : ''}" data-bahia="${i}" style="${!editable ? 'cursor: not-allowed; opacity: 0.6;' : ''}">
                    <div class="bahia-numero">${i}</div>
                    <div class="bahia-estado-icono"><i class="fas fa-warehouse"></i></div>
                    <div class="bahia-estado-texto">Disponible</div>
                </div>
            `;
        }
        return html;
    }
    
    return bahias.map(bahia => {
        const isSelected = bahiaActual == bahia.numero;
        const isOcupada = bahia.estado === 'ocupado';
        const isReservada = bahia.estado === 'reservado';
        let estadoClass = '';
        let estadoTexto = bahia.estado === 'libre' ? 'Disponible' : (bahia.estado === 'ocupado' ? 'Ocupada' : 'Reservada');
        
        if (isOcupada) estadoClass = 'ocupada';
        if (isReservada) estadoClass = 'reservada';
        if (isReservada && isSelected) estadoClass = 'reservada actual';
        
        return `
            <div class="bahia-item ${estadoClass} ${isSelected ? 'selected' : ''}" data-bahia="${bahia.numero}" data-estado="${bahia.estado}" style="${!editable || isOcupada ? 'cursor: not-allowed; opacity: 0.6;' : ''}">
                <div class="bahia-numero">${bahia.numero}</div>
                <div class="bahia-estado-icono">
                    ${bahia.estado === 'libre' ? '<i class="fas fa-check-circle" style="color: #10B981;"></i>' : 
                      bahia.estado === 'ocupado' ? '<i class="fas fa-circle" style="color: #EF4444;"></i>' : 
                      '<i class="fas fa-clock" style="color: #F59E0B;"></i>'}
                </div>
                <div class="bahia-estado-texto">${estadoTexto}</div>
                ${bahia.orden_codigo ? `<div class="bahia-orden">${bahia.orden_codigo.substring(0, 8)}</div>` : ''}
            </div>
        `;
    }).join('');
}

function setupBahiasSeleccion() {
    const bahiasItems = document.querySelectorAll('#bahiasGridSeleccion .bahia-item');
    const inputBahia = document.getElementById('bahia');
    
    bahiasItems.forEach(item => {
        const estado = item.dataset.estado;
        if (estado === 'ocupado') return; // No permitir seleccionar bahías ocupadas
        
        item.addEventListener('click', () => {
            const bahiaNumero = item.dataset.bahia;
            
            // Remover selección de todas
            bahiasItems.forEach(i => i.classList.remove('selected'));
            
            // Agregar selección a la actual
            item.classList.add('selected');
            
            // Actualizar input oculto
            if (inputBahia) {
                inputBahia.value = bahiaNumero;
            } else {
                // Crear input si no existe
                const formRow = document.querySelector('.bahias-seleccion-section');
                if (formRow && !document.getElementById('bahia')) {
                    const hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.id = 'bahia';
                    hiddenInput.value = bahiaNumero;
                    formRow.appendChild(hiddenInput);
                } else if (inputBahia) {
                    inputBahia.value = bahiaNumero;
                }
            }
        });
    });
}

function setupAudioEventosTaller() {
    const btnGrabar = document.getElementById('btnGrabarAudioTaller');
    const btnDetener = document.getElementById('btnDetenerAudioTaller');
    
    if (btnGrabar) {
        btnGrabar.onclick = () => iniciarGrabacionAudioTaller();
    }
    if (btnDetener) {
        btnDetener.onclick = () => detenerGrabacionAudioTaller();
    }
}

async function iniciarGrabacionAudioTaller() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioElem = document.getElementById('audioReproduccionTaller');
            if (audioElem) {
                audioElem.src = audioUrl;
                audioElem.style.display = 'block';
            }
            
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        const btnGrabar = document.getElementById('btnGrabarAudioTaller');
        const btnDetener = document.getElementById('btnDetenerAudioTaller');
        if (btnGrabar) btnGrabar.style.display = 'none';
        if (btnDetener) btnDetener.style.display = 'inline-flex';
        
        mostrarNotificacion('Grabando audio...', 'info');
        
    } catch (error) {
        console.error('Error al acceder al micrófono:', error);
        mostrarNotificacion('No se pudo acceder al micrófono', 'error');
    }
}

function detenerGrabacionAudioTaller() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        const btnGrabar = document.getElementById('btnGrabarAudioTaller');
        const btnDetener = document.getElementById('btnDetenerAudioTaller');
        if (btnGrabar) btnGrabar.style.display = 'inline-flex';
        if (btnDetener) btnDetener.style.display = 'none';
        
        mostrarNotificacion('Grabación detenida', 'success');
    }
}

async function guardarGestionOrden() {
    if (!ordenEnGestion) return;
    
    mostrarNotificacion('Guardando cambios...', 'info');
    
    try {
        // 1. Guardar técnicos seleccionados
        const tecnicosSeleccionados = Array.from(document.querySelectorAll('input[name="tecnico"]:checked'))
            .map(cb => parseInt(cb.value));
        
        if (tecnicosSeleccionados.length > 0) {
            const asignarResponse = await fetch(`${API_URL}/jefe-taller/asignar-tecnicos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({
                    id_orden: ordenEnGestion.id,
                    tecnicos: tecnicosSeleccionados,
                    tipo_asignacion: 'diagnostico'
                })
            });
            
            if (!asignarResponse.ok) {
                const error = await asignarResponse.json();
                throw new Error(error.error || 'Error al asignar técnicos');
            }
        }
        
        // 2. Obtener bahía seleccionada
        let bahia = null;
        const bahiaSeleccionada = document.querySelector('#bahiasGridSeleccion .bahia-item.selected');
        if (bahiaSeleccionada) {
            bahia = bahiaSeleccionada.dataset.bahia;
        }
        
        const fechaInicio = document.getElementById('fecha_inicio')?.value;
        const horasEstimadas = document.getElementById('horas_estimadas')?.value;
        
        if (bahia && fechaInicio && horasEstimadas) {
            const planificarResponse = await fetch(`${API_URL}/jefe-taller/planificar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({
                    id_orden: ordenEnGestion.id,
                    bahia: parseInt(bahia),
                    fecha_inicio: fechaInicio,
                    horas_estimadas: parseFloat(horasEstimadas)
                })
            });
            
            if (!planificarResponse.ok) {
                const error = await planificarResponse.json();
                throw new Error(error.error || 'Error al guardar planificación');
            }
        }
        
        // 3. Guardar diagnóstico del taller (EDITABLE)
        const diagnosticoTaller = document.getElementById('diagnosticoTaller')?.value;
        let audioBase64 = null;
        
        if (audioBlob) {
            audioBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(audioBlob);
            });
        }
        
        if (diagnosticoTaller) {
            const diagResponse = await fetch(`${API_URL}/jefe-taller/diagnostico-inicial`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({
                    id_orden: ordenEnGestion.id,
                    diagnostico: diagnosticoTaller,
                    audio_url: audioBase64
                })
            });
            
            if (!diagResponse.ok) {
                const error = await diagResponse.json();
                throw new Error(error.error || 'Error al guardar diagnóstico');
            }
        }
        
        mostrarNotificacion('Cambios guardados correctamente', 'success');
        
        // Limpiar caché y recargar datos
        dataCache.clear('tecnicos');
        dataCache.clear('bahias');
        await cargarUltimasOrdenesActivas(true);
        await cargarEstadoBahias(true);
        await cargarTecnicos(true);
        
        cerrarModalGestionOrden();
        
    } catch (error) {
        console.error('Error guardando:', error);
        mostrarNotificacion('Error al guardar: ' + error.message, 'error');
    }
}

function cerrarModalGestionOrden() {
    const modal = document.getElementById('modalGestionOrden');
    if (modal) modal.classList.remove('show');
    
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
    }
    
    ordenEnGestion = null;
    audioBlob = null;
    audioChunks = [];
}

// =====================================================
// VER DETALLE DE ORDEN
// =====================================================

async function verDetalleOrden(idOrden) {
    try {
        mostrarNotificacion('Cargando detalle...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al cargar detalle');
        }
        
        const orden = data.detalle;
        const body = document.getElementById('modalDetalleOrdenBody');
        
        if (body) {
            body.innerHTML = `
                <div class="detalle-orden">
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-info-circle"></i> Información General</h4>
                        <div class="detalle-grid">
                            <div class="detalle-item"><span class="detalle-label">Código</span><span class="detalle-value">${escapeHtml(orden.codigo_unico)}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Estado</span><span class="detalle-value estado-${orden.estado_global}">${orden.estado_global}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Fecha Ingreso</span><span class="detalle-value">${new Date(orden.fecha_ingreso).toLocaleString()}</span></div>
                        </div>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-car"></i> Vehículo</h4>
                        <div class="detalle-grid">
                            <div class="detalle-item"><span class="detalle-label">Placa</span><span class="detalle-value">${escapeHtml(orden.placa)}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Marca/Modelo</span><span class="detalle-value">${escapeHtml(orden.marca)} ${escapeHtml(orden.modelo)}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Año</span><span class="detalle-value">${orden.anio || 'N/A'}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Kilometraje</span><span class="detalle-value">${orden.kilometraje?.toLocaleString() || '0'} km</span></div>
                        </div>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-user"></i> Cliente</h4>
                        <div class="detalle-grid">
                            <div class="detalle-item"><span class="detalle-label">Nombre</span><span class="detalle-value">${escapeHtml(orden.cliente?.nombre || 'No registrado')}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Teléfono</span><span class="detalle-value">${escapeHtml(orden.cliente?.telefono || 'N/A')}</span></div>
                        </div>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-users"></i> Técnicos Asignados</h4>
                        <div class="orden-tecnicos">
                            ${orden.tecnicos?.length > 0 ? 
                                orden.tecnicos.map(t => `<span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>`).join('') :
                                '<span class="tecnico-badge sin-asignar">Sin técnicos asignados</span>'}
                        </div>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-calendar"></i> Planificación</h4>
                        <div class="detalle-grid">
                            <div class="detalle-item"><span class="detalle-label">Bahía</span><span class="detalle-value">${orden.planificacion?.bahia_asignada || 'No asignada'}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Inicio Estimado</span><span class="detalle-value">${orden.planificacion?.fecha_hora_inicio_estimado ? new Date(orden.planificacion.fecha_hora_inicio_estimado).toLocaleString() : 'N/A'}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Horas Estimadas</span><span class="detalle-value">${orden.planificacion?.horas_estimadas || 'N/A'} h</span></div>
                        </div>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-headset"></i> Diagnóstico del Cliente</h4>
                        <div class="detalle-descripcion">${escapeHtml(orden.transcripcion_problema) || 'No registrado'}</div>
                    </div>
                    
                    ${orden.diagnostigo_taller ? `
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-stethoscope"></i> Diagnóstico del Jefe Taller</h4>
                        <div class="detalle-descripcion" style="background: rgba(193,18,31,0.1);">${escapeHtml(orden.diagnostigo_taller)}</div>
                    </div>
                    ` : ''}
                </div>
            `;
        }
        
        const modal = document.getElementById('modalDetalleOrden');
        if (modal) modal.classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al cargar detalle: ' + error.message, 'error');
    }
}

function cerrarModalDetalleOrden() {
    const modal = document.getElementById('modalDetalleOrden');
    if (modal) modal.classList.remove('show');
}

function cerrarModalHistorialDiagnostico() {
    const modal = document.getElementById('modalHistorialDiagnostico');
    if (modal) modal.classList.remove('show');
}

async function verDiagnosticoPendiente(idOrden) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/diagnostico-pendiente/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (data.enviado) {
            const body = document.getElementById('modalHistorialDiagnosticoBody');
            if (body) {
                body.innerHTML = `
                    <div class="diagnostico-pendiente">
                        <div class="alert alert-warning" style="background: rgba(245,158,11,0.15); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                            <i class="fas fa-clock"></i>
                            <strong>Diagnóstico Pendiente de Revisión</strong>
                        </div>
                        <div class="detalle-grid">
                            <div class="detalle-item"><span class="detalle-label">Técnico</span><span class="detalle-value">${escapeHtml(data.tecnico_nombre)}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Versión</span><span class="detalle-value">${data.version}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Estado</span><span class="detalle-value">${data.estado}</span></div>
                        </div>
                        <div class="diagnostico-acciones" style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                            <button class="btn-success" onclick="window.aprobarDiagnostico(${idOrden})">
                                <i class="fas fa-check"></i> Aprobar Diagnóstico
                            </button>
                            <button class="btn-warning" onclick="window.solicitarCambiosDiagnostico(${idOrden})">
                                <i class="fas fa-edit"></i> Solicitar Cambios
                            </button>
                        </div>
                    </div>
                `;
            }
            const modal = document.getElementById('modalHistorialDiagnostico');
            if (modal) modal.classList.add('show');
        } else {
            mostrarNotificacion('No hay diagnóstico pendiente para esta orden', 'info');
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al verificar diagnóstico', 'error');
    }
}

// Funciones para diagnóstico
window.aprobarDiagnostico = (idOrden) => {
    mostrarNotificacion('Función en desarrollo - Aprobar diagnóstico', 'info');
};

window.solicitarCambiosDiagnostico = (idOrden) => {
    mostrarNotificacion('Función en desarrollo - Solicitar cambios', 'info');
};

// =====================================================
// EXPOSICIÓN DE FUNCIONES GLOBALES
// =====================================================

window.verDetalleOrden = verDetalleOrden;
window.cerrarModalDetalleOrden = cerrarModalDetalleOrden;
window.cerrarModalHistorialDiagnostico = cerrarModalHistorialDiagnostico;
window.abrirModalGestionOrden = abrirModalGestionOrden;
window.cerrarModalGestionOrden = cerrarModalGestionOrden;
window.guardarGestionOrden = guardarGestionOrden;
window.cargarUltimasOrdenesActivas = cargarUltimasOrdenesActivas;
window.cargarTodasOrdenesActivas = cargarTodasOrdenesActivas;
window.cargarOrdenesFinalizadas = cargarOrdenesFinalizadas;
window.verDiagnosticoPendiente = verDiagnosticoPendiente;
window.verOrdenEnBahia = verOrdenEnBahia;
window.cargarEstadoBahias = cargarEstadoBahias;

console.log('✅ orden_trabajo.js cargado - Versión completa con bahías y diagnósticos');