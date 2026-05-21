// =====================================================
// ÓRDENES DE TRABAJO - JEFE TALLER (VERSIÓN OPTIMIZADA)
// VERSIÓN CORREGIDA CON URL DINÁMICA PARA PRODUCCIÓN
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - FUNCIONA EN LOCAL Y PRODUCCIÓN
// =====================================================
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 OrdenTrabajo.js - Modo DESARROLLO');
        return 'http://localhost:5000';
    }
    console.log('📡 OrdenTrabajo.js - Modo PRODUCCIÓN');
    return '';
})();

const API_URL = `${API_BASE_URL}/api`;
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

// Control de estado para evitar actualizaciones simultáneas
let isUpdating = false;
let lastActivasFetch = 0;
let lastFinalizadasFetch = 0;

// Cache TTL en milisegundos
const CACHE_TTL = {
    activas: 30000,      // 30 segundos para órdenes activas
    finalizadas: 60000,  // 60 segundos para finalizadas (cambian menos)
    tecnicos: 30000      // 30 segundos para técnicos
};

// Cache para datos que cambian poco
const dataCache = {
    tecnicos: { data: null, timestamp: null },
    
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
    console.log('🚀 Inicializando orden_trabajo.js (Jefe Taller)');
    console.log('📡 API_BASE_URL:', API_BASE_URL);
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    // Cargar datos en paralelo para mayor velocidad
    await Promise.all([
        cargarTecnicos(),
        cargarUltimasOrdenesActivas(),  // NUEVO: usa el endpoint rápido
        cargarOrdenesFinalizadas()
    ]);
    
    iniciarPolling();
    
    // Detectar cuando la página se vuelve visible para actualizar
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Actualización silenciosa en segundo plano
            cargarUltimasOrdenesActivas(true);
            cargarOrdenesFinalizadas(true);
        }
    });
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = `${API_BASE_URL}/`;
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
            window.location.href = `${API_BASE_URL}/`;
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = `${API_BASE_URL}/`;
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
    
    // Botones de refresh
    document.getElementById('refreshActivas')?.addEventListener('click', () => {
        cargarUltimasOrdenesActivas(true);
    });
    document.getElementById('refreshFinalizadas')?.addEventListener('click', () => {
        cargarOrdenesFinalizadas(true);
    });
    
    // Filtros de órdenes activas
    const searchActivas = document.getElementById('searchActivas');
    const tecnicoFiltro = document.getElementById('tecnicoFiltro');
    const estadoFiltroActivas = document.getElementById('estadoFiltroActivas');
    
    if (searchActivas) {
        searchActivas.addEventListener('input', debounce(() => filtrarOrdenesActivas(), 300));
    }
    if (tecnicoFiltro) tecnicoFiltro.addEventListener('change', () => filtrarOrdenesActivas());
    if (estadoFiltroActivas) estadoFiltroActivas.addEventListener('change', () => filtrarOrdenesActivas());
    
    // Filtros de órdenes finalizadas
    const searchFinalizadas = document.getElementById('searchFinalizadas');
    const fechaDesdeFinalizadas = document.getElementById('fechaDesdeFinalizadas');
    const fechaHastaFinalizadas = document.getElementById('fechaHastaFinalizadas');
    
    if (searchFinalizadas) {
        searchFinalizadas.addEventListener('input', debounce(() => filtrarOrdenesFinalizadas(), 300));
    }
    if (fechaDesdeFinalizadas) fechaDesdeFinalizadas.addEventListener('change', () => filtrarOrdenesFinalizadas());
    if (fechaHastaFinalizadas) fechaHastaFinalizadas.addEventListener('change', () => filtrarOrdenesFinalizadas());
    
    // Cerrar modales con ESC
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
    
    // Actualizar datos si es necesario al cambiar de pestaña
    if (tabId === 'activas') {
        cargarUltimasOrdenesActivas();
    } else if (tabId === 'finalizadas') {
        cargarOrdenesFinalizadas();
    }
}

// =====================================================
// API CALLS - VERSIÓN OPTIMIZADA
// =====================================================

// NUEVO: Cargar SOLO las últimas 10 órdenes activas (más rápido)
async function cargarUltimasOrdenesActivas(forceRefresh = false) {
    // Evitar múltiples llamadas simultáneas
    if (isUpdating) return;
    
    const now = Date.now();
    
    // Usar caché si no se fuerza actualización
    if (!forceRefresh && ordenesActivas.length > 0 && (now - lastActivasFetch) < CACHE_TTL.activas) {
        renderOrdenesActivas(ordenesActivas);
        return;
    }
    
    isUpdating = true;
    
    try {
        const container = document.getElementById('ordenesActivasList');
        if (!container) return;
        
        // Mostrar skeleton loading solo en primera carga
        if (ordenesActivas.length === 0) {
            container.innerHTML = `
                <div class="skeleton-loading">
                    ${Array(3).fill(0).map(() => `
                        <div class="skeleton-card">
                            <div class="skeleton-header"></div>
                            <div class="skeleton-body"></div>
                            <div class="skeleton-footer"></div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        // Usar el endpoint optimizado de últimas 10 órdenes
        const response = await fetch(`${API_URL}/jefe-taller/ultimas-ordenes`, {
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`,
                'Cache-Control': forceRefresh ? 'no-cache' : 'max-age=30'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.ordenes) {
            ordenesActivas = data.ordenes;
            lastActivasFetch = Date.now();
            
            // Actualizar contador
            const countElement = document.getElementById('activasCount');
            if (countElement) {
                const totalActivas = ordenesActivas.length;
                countElement.textContent = totalActivas;
                // Si hay exactamente 10, mostrar un indicador de que puede haber más
                if (totalActivas === 10) {
                    countElement.title = "Mostrando últimas 10 órdenes. Puede haber más.";
                }
            }
            
            renderOrdenesActivas(ordenesActivas);
        } else {
            throw new Error(data.error || 'Error al cargar órdenes');
        }
        
    } catch (error) {
        console.error('Error cargando últimas órdenes:', error);
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
        } else {
            mostrarNotificacion('Error al actualizar órdenes', 'error');
        }
    } finally {
        isUpdating = false;
    }
}

// Función para cargar TODAS las órdenes activas (cuando el usuario lo solicite)
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
        // Verificar caché
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
    // Evitar múltiples llamadas simultáneas
    if (isUpdating && !forceRefresh) return;
    
    const now = Date.now();
    
    // Usar caché si no se fuerza actualización
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
// RENDERIZAR ÓRDENES ACTIVAS
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
    
    // Agregar botón "Ver más" si hay exactamente 10 órdenes (probablemente hay más)
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
// POLLING OPTIMIZADO
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    // Polling menos frecuente: cada 60 segundos
    pollingInterval = setInterval(() => {
        // Solo actualizar si la página es visible y no hay una actualización en curso
        if (!document.hidden && !isUpdating) {
            const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
            
            if (activeTab === 'activas') {
                // Actualización silenciosa en segundo plano
                cargarUltimasOrdenesActivas();
            } else if (activeTab === 'finalizadas') {
                cargarOrdenesFinalizadas();
            }
        }
    }, 60000); // 60 segundos
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
    // Eliminar notificaciones anteriores
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
    
    // Animación de entrada
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
        
        // Cargar técnicos si es necesario
        if (tecnicosDisponibles.length === 0) {
            await cargarTecnicos();
        }
        
        // Renderizar el modal de gestión
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
    
    // HTML del modal (simplificado para este ejemplo)
    body.innerHTML = `
        <div class="gestion-orden-container">
            <div class="info-orden">
                <h3>Orden: ${escapeHtml(ordenEnGestion.codigo_unico)}</h3>
                <p>Estado: ${ordenEnGestion.estado_global}</p>
                <p>Vehículo: ${escapeHtml(ordenEnGestion.marca)} ${escapeHtml(ordenEnGestion.modelo)} (${escapeHtml(ordenEnGestion.placa)})</p>
                <p>Cliente: ${escapeHtml(ordenEnGestion.cliente?.nombre || 'No registrado')}</p>
            </div>
            
            <div class="gestion-seccion">
                <h4><i class="fas fa-users"></i> Asignar Técnicos</h4>
                <div class="tecnicos-selector">
                    ${tecnicosDisponibles.map(t => `
                        <label class="tecnico-checkbox">
                            <input type="checkbox" name="tecnico" value="${t.id}" 
                                ${ordenEnGestion.tecnicos?.some(tec => tec.id === t.id) ? 'checked' : ''}
                                ${!t.disponible && !ordenEnGestion.tecnicos?.some(tec => tec.id === t.id) ? 'disabled' : ''}>
                            <span>${escapeHtml(t.nombre)}</span>
                            <small>(${t.ordenes_activas}/${t.max_vehiculos})</small>
                        </label>
                    `).join('')}
                </div>
                <small>Máximo 2 técnicos por orden</small>
            </div>
            
            <div class="gestion-seccion">
                <h4><i class="fas fa-calendar"></i> Planificación</h4>
                <div class="planificacion-form">
                    <div class="form-group">
                        <label>Bahía (1-12):</label>
                        <input type="number" id="bahia" min="1" max="12" value="${ordenEnGestion.planificacion?.bahia_asignada || ''}">
                    </div>
                    <div class="form-group">
                        <label>Fecha inicio:</label>
                        <input type="datetime-local" id="fecha_inicio" value="${ordenEnGestion.planificacion?.fecha_hora_inicio_estimado ? new Date(ordenEnGestion.planificacion.fecha_hora_inicio_estimado).toISOString().slice(0, 16) : ''}">
                    </div>
                    <div class="form-group">
                        <label>Horas estimadas:</label>
                        <input type="number" id="horas_estimadas" step="0.5" value="${ordenEnGestion.planificacion?.horas_estimadas || ''}">
                    </div>
                </div>
            </div>
            
            <div class="gestion-seccion">
                <h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4>
                <textarea id="diagnostico" rows="4" placeholder="Ingrese el diagnóstico inicial...">${ordenEnGestion.transcripcion_problema || ''}</textarea>
                <div class="audio-controls">
                    <button type="button" id="btnGrabarAudio" class="btn-audio">
                        <i class="fas fa-microphone"></i> Grabar Audio
                    </button>
                    <button type="button" id="btnDetenerAudio" class="btn-audio stop" style="display:none;">
                        <i class="fas fa-stop"></i> Detener
                    </button>
                    <audio id="audioReproduccion" controls style="display:none;"></audio>
                </div>
            </div>
        </div>
    `;
    
    if (footer) {
        footer.innerHTML = `
            <button class="btn-cancelar" onclick="window.cerrarModalGestionOrden()">Cancelar</button>
            <button class="btn-guardar" onclick="window.guardarGestionOrden()">Guardar Cambios</button>
        `;
    }
    
    // Configurar eventos de audio (simplificado)
    setupAudioEvents();
}

function setupAudioEvents() {
    const btnGrabar = document.getElementById('btnGrabarAudio');
    const btnDetener = document.getElementById('btnDetenerAudio');
    
    if (btnGrabar) {
        btnGrabar.onclick = () => iniciarGrabacionAudio();
    }
    if (btnDetener) {
        btnDetener.onclick = () => detenerGrabacionAudio();
    }
}

async function iniciarGrabacionAudio() {
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
            const audioElem = document.getElementById('audioReproduccion');
            if (audioElem) {
                audioElem.src = audioUrl;
                audioElem.style.display = 'block';
            }
            
            // Detener todas las pistas del stream
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        const btnGrabar = document.getElementById('btnGrabarAudio');
        const btnDetener = document.getElementById('btnDetenerAudio');
        if (btnGrabar) btnGrabar.style.display = 'none';
        if (btnDetener) btnDetener.style.display = 'inline-block';
        
        mostrarNotificacion('Grabando audio...', 'info');
        
    } catch (error) {
        console.error('Error al acceder al micrófono:', error);
        mostrarNotificacion('No se pudo acceder al micrófono', 'error');
    }
}

function detenerGrabacionAudio() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        const btnGrabar = document.getElementById('btnGrabarAudio');
        const btnDetener = document.getElementById('btnDetenerAudio');
        if (btnGrabar) btnGrabar.style.display = 'inline-block';
        if (btnDetener) btnDetener.style.display = 'none';
        
        mostrarNotificacion('Grabación detenida', 'success');
    }
}

async function guardarGestionOrden() {
    if (!ordenEnGestion) return;
    
    mostrarNotificacion('Guardando cambios...', 'info');
    
    try {
        // Obtener técnicos seleccionados
        const tecnicosSeleccionados = Array.from(document.querySelectorAll('input[name="tecnico"]:checked'))
            .map(cb => parseInt(cb.value));
        
        // Guardar asignación de técnicos
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
        
        // Guardar planificación
        const bahia = document.getElementById('bahia')?.value;
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
        
        // Guardar diagnóstico (si hay audio, subirlo primero)
        const diagnostico = document.getElementById('diagnostico')?.value;
        let audioUrl = null;
        
        if (audioBlob) {
            // Convertir audio a base64
            const reader = new FileReader();
            audioUrl = await new Promise((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(audioBlob);
            });
            
            // Subir audio
            const audioResponse = await fetch(`${API_URL}/jefe-taller/subir-audio-diagnostico`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({
                    audio: audioUrl,
                    id_orden: ordenEnGestion.id
                })
            });
            
            if (audioResponse.ok) {
                const audioData = await audioResponse.json();
                audioUrl = audioData.url;
            }
        }
        
        if (diagnostico) {
            const diagResponse = await fetch(`${API_URL}/jefe-taller/diagnostico-inicial`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({
                    id_orden: ordenEnGestion.id,
                    diagnostico: diagnostico,
                    audio_url: audioUrl
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
        await cargarUltimasOrdenesActivas(true);
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
    
    // Detener grabación si está activa
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
    }
    
    ordenEnGestion = null;
    audioBlob = null;
    audioChunks = [];
}

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
                    <div class="detalle-header">
                        <h3>Orden: ${escapeHtml(orden.codigo_unico)}</h3>
                        <span class="estado-badge ${orden.estado_global}">${orden.estado_global}</span>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-car"></i> Información del Vehículo</h4>
                        <p><strong>Placa:</strong> ${escapeHtml(orden.placa)}</p>
                        <p><strong>Marca/Modelo:</strong> ${escapeHtml(orden.marca)} ${escapeHtml(orden.modelo)}</p>
                        <p><strong>Año:</strong> ${orden.anio || 'N/A'}</p>
                        <p><strong>Kilometraje:</strong> ${orden.kilometraje || 'N/A'} km</p>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-user"></i> Cliente</h4>
                        <p><strong>Nombre:</strong> ${escapeHtml(orden.cliente?.nombre || 'No registrado')}</p>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-users"></i> Técnicos Asignados</h4>
                        ${orden.tecnicos?.length > 0 ? 
                            orden.tecnicos.map(t => `<p>👨‍🔧 ${escapeHtml(t.nombre)}</p>`).join('') :
                            '<p>Sin técnicos asignados</p>'}
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-calendar"></i> Planificación</h4>
                        <p><strong>Bahía:</strong> ${orden.planificacion?.bahia_asignada || 'No asignada'}</p>
                        <p><strong>Inicio estimado:</strong> ${orden.planificacion?.fecha_hora_inicio_estimado ? new Date(orden.planificacion.fecha_hora_inicio_estimado).toLocaleString() : 'N/A'}</p>
                        <p><strong>Horas estimadas:</strong> ${orden.planificacion?.horas_estimadas || 'N/A'} h</p>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-stethoscope"></i> Problema Reportado</h4>
                        <p>${escapeHtml(orden.transcripcion_problema) || 'No registrado'}</p>
                    </div>
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
                        <div class="alert alert-warning">
                            <i class="fas fa-clock"></i>
                            <strong>Diagnóstico Pendiente de Revisión</strong>
                        </div>
                        <p><strong>Técnico:</strong> ${escapeHtml(data.tecnico_nombre)}</p>
                        <p><strong>Versión:</strong> ${data.version}</p>
                        <p><strong>Estado:</strong> ${data.estado}</p>
                        <button class="btn-primary" onclick="window.revisarDiagnostico(${idOrden})">
                            <i class="fas fa-eye"></i> Revisar Diagnóstico
                        </button>
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

// Exponer funciones globales
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
window.revisarDiagnostico = (idOrden) => {
    mostrarNotificacion('Función en desarrollo', 'info');
};