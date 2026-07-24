// =====================================================
// DIAGNOSTICO.JS - JEFE DE TALLER
// Gestión de diagnósticos técnicos - RESPONSIVE
// VERSIÓN CORREGIDA - CON TARJETAS EN MÓVIL
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 diagnostico.js - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 diagnostico.js - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

const API_URL = window.API_BASE_URL + '/api';
let userInfo = null;
let currentUserRoles = [];

// Estado global
let currentDiagnosticos = {
    pendiente: [],
    aprobado: [],
    rechazado: [],
    borrador: []
};
let currentStats = {
    pendiente: 0,
    aprobado: 0,
    rechazado: 0,
    borrador: 0
};
let currentDiagnosticoId = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando página de diagnósticos...');
    console.log('📡 API_URL:', API_URL);
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    initEventListeners();
    await loadAllData();
    
    // Escuchar cambios de tamaño para cambiar entre tabla y tarjetas
    window.addEventListener('resize', () => {
        if (window.currentDiagnosticosFiltrados) {
            renderDiagnosticos(window.currentDiagnosticosFiltrados);
        }
    });
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userInfo = payload.user;
        
        if (userInfo && userInfo.roles && Array.isArray(userInfo.roles)) {
            currentUserRoles = userInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (userInfo) userInfo.roles = currentUserRoles;
        }
        
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller') || 
                                    (userInfo && userInfo.rol_principal === 'jefe_taller') ||
                                    (userInfo && userInfo.rol === 'jefe_taller');
        
        if (!tieneRolJefeTaller) {
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => { window.location.href = window.API_BASE_URL + '/'; }, 2000);
            return false;
        }
        
        console.log('✅ Autenticación exitosa - Roles:', currentUserRoles);
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = window.API_BASE_URL + '/';
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
    
    const userNameElement = document.getElementById('userNombre');
    if (userNameElement && userInfo) {
        userNameElement.textContent = userInfo.nombre || 'Usuario';
    }
}

function initEventListeners() {
    const filterEstado = document.getElementById('filterEstado');
    const searchInput = document.getElementById('searchInput');
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    const btnBuscar = document.getElementById('btnBuscar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (filterEstado) filterEstado.addEventListener('change', () => aplicarFiltros());
    if (searchInput) searchInput.addEventListener('input', aplicarFiltros);
    if (fechaDesde) fechaDesde.addEventListener('change', aplicarFiltros);
    if (fechaHasta) fechaHasta.addEventListener('change', aplicarFiltros);
    
    if (btnBuscar) btnBuscar.addEventListener('click', () => aplicarFiltros());
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadAllData());
    
    // Grabación de audio
    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    if (startRecordBtn) startRecordBtn.addEventListener('click', startRecording);
    if (stopRecordBtn) stopRecordBtn.addEventListener('click', stopRecording);
    
    // Formularios
    const formSolicitud = document.getElementById('formSolicitarRepuesto');
    const formObservacion = document.getElementById('formObservacion');
    if (formSolicitud) formSolicitud.addEventListener('submit', enviarSolicitudRepuesto);
    if (formObservacion) formObservacion.addEventListener('submit', enviarObservacion);
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

function getAuthToken() {
    return localStorage.getItem('furia_token');
}

function getHeaders() {
    const token = getAuthToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function loadAllData() {
    mostrarLoading(true);
    try {
        await Promise.all([
            loadDiagnosticos(),
            loadStats()
        ]);
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarNotificacion('Error al cargar los datos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function loadDiagnosticos() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/diagnosticos`, {
            headers: getHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('Error cargando diagnósticos');
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentDiagnosticos = {
                pendiente: [],
                aprobado: [],
                rechazado: [],
                borrador: []
            };
            
            for (const d of (data.diagnosticos || [])) {
                if (currentDiagnosticos[d.estado]) {
                    currentDiagnosticos[d.estado].push(d);
                }
            }
            
            console.log('✅ Diagnósticos cargados:');
            console.log(`   - Pendientes: ${currentDiagnosticos.pendiente.length}`);
            console.log(`   - Aprobados: ${currentDiagnosticos.aprobado.length}`);
            console.log(`   - Rechazados: ${currentDiagnosticos.rechazado.length}`);
            console.log(`   - Borradores: ${currentDiagnosticos.borrador.length}`);
            
            aplicarFiltros();
        } else {
            mostrarNotificacion(data.error || 'Error cargando diagnósticos', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión', 'error');
        mostrarResultadosVacio();
    }
}

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/diagnosticos-stats`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Error cargando estadísticas');
        
        const data = await response.json();
        if (data.success) {
            currentStats = data.stats;
            
            const pendientesElem = document.getElementById('pendientesCount');
            const aprobadosElem = document.getElementById('aprobadosCount');
            const rechazadosElem = document.getElementById('rechazadosCount');
            const borradoresElem = document.getElementById('borradoresCount');
            
            if (pendientesElem) pendientesElem.textContent = currentStats.pendiente || 0;
            if (aprobadosElem) aprobadosElem.textContent = currentStats.aprobado || 0;
            if (rechazadosElem) rechazadosElem.textContent = currentStats.rechazado || 0;
            if (borradoresElem) borradoresElem.textContent = currentStats.borrador || 0;
        }
    } catch (error) {
        console.error('Error cargando stats:', error);
    }
}

// =====================================================
// FILTROS Y BÚSQUEDA
// =====================================================

let currentFilters = {
    estado: 'todos',
    search: '',
    fechaDesde: '',
    fechaHasta: ''
};

let currentDiagnosticosFiltrados = [];

function aplicarFiltros() {
    currentFilters.estado = document.getElementById('filterEstado')?.value || 'todos';
    currentFilters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    currentFilters.fechaDesde = document.getElementById('fechaDesde')?.value || '';
    currentFilters.fechaHasta = document.getElementById('fechaHasta')?.value || '';
    
    let diagnosticosFiltrados = [];
    
    if (currentFilters.estado === 'todos') {
        diagnosticosFiltrados = [
            ...currentDiagnosticos.pendiente,
            ...currentDiagnosticos.aprobado,
            ...currentDiagnosticos.rechazado,
            ...currentDiagnosticos.borrador
        ];
    } else {
        diagnosticosFiltrados = [...(currentDiagnosticos[currentFilters.estado] || [])];
    }
    
    if (currentFilters.search) {
        diagnosticosFiltrados = diagnosticosFiltrados.filter(d => 
            (d.codigo_unico || '').toLowerCase().includes(currentFilters.search) ||
            (d.tecnico_nombre || '').toLowerCase().includes(currentFilters.search) ||
            (d.placa || '').toLowerCase().includes(currentFilters.search) ||
            (d.marca || '').toLowerCase().includes(currentFilters.search) ||
            (d.modelo || '').toLowerCase().includes(currentFilters.search)
        );
    }
    
    if (currentFilters.fechaDesde) {
        const desde = new Date(currentFilters.fechaDesde);
        desde.setHours(0, 0, 0, 0);
        diagnosticosFiltrados = diagnosticosFiltrados.filter(d => {
            if (!d.fecha_envio) return false;
            return new Date(d.fecha_envio) >= desde;
        });
    }
    
    if (currentFilters.fechaHasta) {
        const hasta = new Date(currentFilters.fechaHasta);
        hasta.setHours(23, 59, 59, 999);
        diagnosticosFiltrados = diagnosticosFiltrados.filter(d => {
            if (!d.fecha_envio) return false;
            return new Date(d.fecha_envio) <= hasta;
        });
    }
    
    currentDiagnosticosFiltrados = diagnosticosFiltrados;
    renderDiagnosticos(diagnosticosFiltrados);
}

function limpiarFiltros() {
    const filterEstado = document.getElementById('filterEstado');
    const searchInput = document.getElementById('searchInput');
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    
    if (filterEstado) filterEstado.value = 'todos';
    if (searchInput) searchInput.value = '';
    if (fechaDesde) fechaDesde.value = '';
    if (fechaHasta) fechaHasta.value = '';
    
    aplicarFiltros();
}

// =====================================================
// RENDERIZADO DE DIAGNÓSTICOS - RESPONSIVE
// =====================================================

function renderDiagnosticos(diagnosticos) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    if (!diagnosticos || diagnosticos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay diagnósticos para mostrar</p>
            </div>
        `;
        return;
    }
    
    // Detectar si es móvil (pantalla pequeña)
    const esMovil = window.innerWidth <= 768;
    
    // Agrupar por estado
    const pendientes = diagnosticos.filter(d => d.estado === 'pendiente');
    const aprobados = diagnosticos.filter(d => d.estado === 'aprobado');
    const rechazados = diagnosticos.filter(d => d.estado === 'rechazado');
    const borradores = diagnosticos.filter(d => d.estado === 'borrador');
    
    let html = '';
    
    if (pendientes.length > 0) {
        html += renderSeccion(pendientes, 'pendientes', true, esMovil);
    }
    
    if (aprobados.length > 0) {
        html += renderSeccion(aprobados, 'aprobados', false, esMovil);
    }
    
    if (rechazados.length > 0) {
        html += renderSeccion(rechazados, 'rechazados', false, esMovil);
    }
    
    if (borradores.length > 0) {
        html += renderSeccion(borradores, 'borradores', false, esMovil);
    }
    
    container.innerHTML = html;
}

function renderSeccion(diagnosticos, estado, showActions, esMovil) {
    const titulos = {
        'pendientes': { icono: 'fa-clock', texto: 'Pendientes de Revisión', color: '#F59E0B' },
        'aprobados': { icono: 'fa-check-circle', texto: 'Últimos Aprobados', color: '#10B981' },
        'rechazados': { icono: 'fa-times-circle', texto: 'Últimos Rechazados', color: '#EF4444' },
        'borradores': { icono: 'fa-file-alt', texto: 'Borradores', color: '#6B7280' }
    };
    
    const titulo = titulos[estado] || { icono: 'fa-file', texto: estado, color: '#6B7280' };
    
    if (esMovil) {
        // Modo tarjetas para móvil
        return `
            <div class="seccion-diagnosticos-mobile" style="margin-bottom: 1.5rem;">
                <div class="seccion-header ${estado}" style="padding: 0.75rem 1rem; background: var(--gris-oscuro); border-radius: var(--radius-lg) var(--radius-lg) 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas ${titulo.icono}" style="color: ${titulo.color}"></i> ${titulo.texto}
                    </h3>
                </div>
                <div class="diagnosticos-cards" style="padding: 0.75rem; background: var(--bg-card); border-radius: 0 0 var(--radius-lg) var(--radius-lg); border: 1px solid var(--border-color); border-top: none;">
                    ${diagnosticos.map(d => renderDiagnosticoCard(d, showActions && d.estado === 'pendiente')).join('')}
                </div>
            </div>
        `;
    } else {
        // Modo tabla para desktop
        return `
            <div class="seccion-diagnosticos" style="margin-bottom: 1.5rem;">
                <div class="seccion-header ${estado}" style="padding: 0.75rem 1rem; background: var(--gris-oscuro); border-radius: var(--radius-lg) var(--radius-lg) 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas ${titulo.icono}" style="color: ${titulo.color}"></i> ${titulo.texto}
                    </h3>
                    <span class="seccion-badge" style="font-size: 0.7rem; padding: 0.2rem 0.6rem; background: var(--gris-medio); border-radius: var(--radius-full);">${diagnosticos.length} registros</span>
                </div>
                <div style="overflow-x: auto; border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 var(--radius-lg) var(--radius-lg); background: var(--bg-card);">
                    <table style="width: 100%; border-collapse: collapse; min-width: 700px;">
                        <thead style="background: var(--gris-oscuro);">
                            <tr>
                                <th style="padding: 0.75rem; text-align: left; font-size: 0.7rem; color: var(--gris-texto);">Código</th>
                                <th style="padding: 0.75rem; text-align: left; font-size: 0.7rem; color: var(--gris-texto);">Técnico</th>
                                <th style="padding: 0.75rem; text-align: left; font-size: 0.7rem; color: var(--gris-texto);">Vehículo</th>
                                <th style="padding: 0.75rem; text-align: left; font-size: 0.7rem; color: var(--gris-texto);">Servicios</th>
                                <th style="padding: 0.75rem; text-align: left; font-size: 0.7rem; color: var(--gris-texto);">Fecha</th>
                                <th style="padding: 0.75rem; text-align: left; font-size: 0.7rem; color: var(--gris-texto);">Estado</th>
                                <th style="padding: 0.75rem; text-align: left; font-size: 0.7rem; color: var(--gris-texto);">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${diagnosticos.map(d => renderDiagnosticoRow(d, showActions && d.estado === 'pendiente')).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
}

function renderDiagnosticoCard(d, showActions) {
    const serviciosCount = d.servicios?.length || 0;
    
    return `
        <div class="diagnostico-card" data-id="${d.diagnostico_id}" style="background: var(--gris-oscuro); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 0.75rem; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                <span style="font-weight: 700; font-family: monospace; color: var(--rojo-primario);">${escapeHtml(d.codigo_unico || 'N/A')}</span>
                <span class="estado-badge ${d.estado}" style="font-size: 0.65rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-full);">
                    <i class="fas ${getEstadoIcon(d.estado)}"></i> ${getEstadoTexto(d.estado)}
                </span>
            </div>
            <div style="margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <i class="fas fa-user" style="width: 20px; color: var(--gris-texto);"></i>
                    <span style="color: var(--blanco);">${escapeHtml(d.tecnico_nombre || 'Sin asignar')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <i class="fas fa-car" style="width: 20px; color: var(--gris-texto);"></i>
                    <span style="color: var(--blanco);">${escapeHtml(d.placa || 'N/A')} - ${escapeHtml(d.marca || '')} ${escapeHtml(d.modelo || '')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <i class="fas fa-tools" style="width: 20px; color: var(--gris-texto);"></i>
                    <span style="color: var(--blanco);"><i class="fas fa-wrench"></i> ${serviciosCount} servicio${serviciosCount !== 1 ? 's' : ''}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-calendar" style="width: 20px; color: var(--gris-texto);"></i>
                    <span style="color: var(--gris-texto);">${formatDate(d.fecha_envio)}</span>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                <button class="action-btn view" onclick="verDiagnostico(${d.diagnostico_id})" style="background: transparent; border: none; cursor: pointer; padding: 0.3rem 0.6rem; border-radius: var(--radius-sm); color: var(--gris-texto);">
                    <i class="fas fa-eye"></i> Ver
                </button>
                ${showActions ? `
                    <button class="action-btn approve" onclick="aprobarDiagnostico(${d.diagnostico_id})" style="background: transparent; border: none; cursor: pointer; padding: 0.3rem 0.6rem; border-radius: var(--radius-sm); color: #10B981;">
                        <i class="fas fa-check-circle"></i> Aprobar
                    </button>
                    <button class="action-btn reject" onclick="abrirModalObservacion(${d.diagnostico_id})" style="background: transparent; border: none; cursor: pointer; padding: 0.3rem 0.6rem; border-radius: var(--radius-sm); color: #EF4444;">
                        <i class="fas fa-times-circle"></i> Rechazar
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

function renderDiagnosticoRow(d, showActions) {
    const serviciosCount = d.servicios?.length || 0;
    
    return `
        <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 0.75rem;"><span class="codigo" style="font-family: monospace; color: var(--rojo-primario);">${escapeHtml(d.codigo_unico || 'N/A')}</span></td>
            <td style="padding: 0.75rem;"><span style="color: var(--blanco);">${escapeHtml(d.tecnico_nombre || 'Sin asignar')}</span></td>
            <td style="padding: 0.75rem;"><span style="color: var(--blanco);">${escapeHtml(d.placa || 'N/A')}</span></td>
            <td style="padding: 0.75rem;"><span class="servicios-count" style="font-size: 0.75rem;"><i class="fas fa-wrench"></i> ${serviciosCount}</span></td>
            <td style="padding: 0.75rem;"><span class="fecha" style="font-size: 0.7rem; color: var(--gris-texto);">${formatDate(d.fecha_envio)}</span></td>
            <td style="padding: 0.75rem;">
                <span class="estado-badge ${d.estado}" style="font-size: 0.65rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-full);">
                    <i class="fas ${getEstadoIcon(d.estado)}"></i> ${getEstadoTexto(d.estado)}
                </span>
            </td>
            <td style="padding: 0.75rem;">
                <div class="action-buttons" style="display: flex; gap: 0.5rem;">
                    <button class="action-btn view" onclick="verDiagnostico(${d.diagnostico_id})" style="background: transparent; border: none; cursor: pointer; padding: 0.3rem; border-radius: var(--radius-sm); color: var(--gris-texto);">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${showActions ? `
                        <button class="action-btn approve" onclick="aprobarDiagnostico(${d.diagnostico_id})" style="background: transparent; border: none; cursor: pointer; padding: 0.3rem; border-radius: var(--radius-sm); color: #10B981;">
                            <i class="fas fa-check-circle"></i>
                        </button>
                        <button class="action-btn reject" onclick="abrirModalObservacion(${d.diagnostico_id})" style="background: transparent; border: none; cursor: pointer; padding: 0.3rem; border-radius: var(--radius-sm); color: #EF4444;">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `;
}

function mostrarResultadosVacio() {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-search"></i>
            <p>No hay diagnósticos para mostrar</p>
        </div>
    `;
}

// =====================================================
// VER DETALLE DE DIAGNÓSTICO
// =====================================================

window.verDiagnostico = async function(diagnosticoId) {
    console.log('👁️ Ver diagnóstico ID:', diagnosticoId);
    
    const modal = document.getElementById('modalDiagnostico');
    const modalBody = document.getElementById('modalDiagnosticoBody');
    
    if (!modal) return;
    
    modalBody.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando detalles...</p></div>`;
    modal.classList.add('show');
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/diagnostico/${diagnosticoId}`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        
        const data = await response.json();
        
        if (data.success && data.diagnostico) {
            mostrarModalDiagnostico(data.diagnostico);
        } else {
            throw new Error(data.error || 'Datos inválidos');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        modalBody.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error: ${error.message}</p></div>`;
        mostrarNotificacion('Error al cargar el diagnóstico', 'error');
    }
};

function mostrarModalDiagnostico(diagnostico) {
    const modalBody = document.getElementById('modalDiagnosticoBody');
    if (!modalBody) return;
    
    const servicios = diagnostico.servicios || [];
    const solicitudes = diagnostico.solicitudes_repuestos || [];
    const fotos = diagnostico.fotos || [];
    const observaciones = diagnostico.observaciones || [];
    
    modalBody.innerHTML = `
        <div class="diagnostico-detalle-modern" style="padding: 1rem;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, var(--rojo-primario), var(--rojo-oscuro)); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1rem;">
                <h2 style="font-size: 1.2rem; margin-bottom: 0.5rem;"><i class="fas fa-stethoscope"></i> Diagnóstico Técnico</h2>
                <div style="font-family: monospace; margin-bottom: 0.5rem;">Orden: ${escapeHtml(diagnostico.codigo_unico || 'N/A')}</div>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <div><i class="fas fa-car"></i> ${escapeHtml(diagnostico.placa || 'N/A')}</div>
                    <div><i class="fas fa-tag"></i> ${escapeHtml(diagnostico.marca || '')} ${escapeHtml(diagnostico.modelo || '')}</div>
                    <div><i class="fas fa-user"></i> Técnico: ${escapeHtml(diagnostico.tecnico_nombre || 'N/A')}</div>
                </div>
            </div>
            
            <!-- Información -->
            <div style="background: var(--gris-oscuro); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1rem;">
                <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-file-alt"></i> Informe del Técnico</h4>
                <p style="color: var(--gris-texto);">${escapeHtml(diagnostico.informe || 'Sin informe')}</p>
                ${diagnostico.url_grabacion_informe ? `<audio controls src="${diagnostico.url_grabacion_informe}" style="width: 100%; margin-top: 0.5rem;"></audio>` : ''}
            </div>
            
            <!-- Servicios -->
            <div style="background: var(--gris-oscuro); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1rem;">
                <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-tools"></i> Servicios (${servicios.length})</h4>
                ${servicios.length > 0 ? servicios.map(s => `
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
                        <strong>${escapeHtml(s.descripcion)}</strong>
                        ${s.precio_estimado ? `<span style="float: right;">Bs. ${s.precio_estimado}</span>` : ''}
                    </div>
                `).join('') : '<p class="text-muted">No hay servicios registrados</p>'}
            </div>
            
            <!-- Fotos -->
            ${fotos.length > 0 ? `
                <div style="background: var(--gris-oscuro); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1rem;">
                    <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-camera"></i> Fotos (${fotos.length})</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem;">
                        ${fotos.map(f => `
                            <img src="${f.url_foto}" style="width: 100%; height: 80px; object-fit: cover; border-radius: var(--radius-sm); cursor: pointer;" onclick="verImagenAmpliada('${f.url_foto}')">
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

window.cerrarModalDiagnostico = function() {
    const modal = document.getElementById('modalDiagnostico');
    if (modal) modal.classList.remove('show');
};

// =====================================================
// APROBAR DIAGNÓSTICO
// =====================================================

window.aprobarDiagnostico = async function(diagnosticoId) {
    if (!diagnosticoId) {
        mostrarNotificacion('ID de diagnóstico inválido', 'error');
        return;
    }
    
    if (!confirm('¿Estás seguro de aprobar este diagnóstico?\n\nAl aprobarlo, el diagnóstico pasará a estado APROBADO.')) return;
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/aprobar-diagnostico-simple`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ diagnostico_id: diagnosticoId })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            mostrarNotificacion('✅ Diagnóstico aprobado correctamente', 'success');
            await loadAllData();
            window.cerrarModalDiagnostico();
        } else {
            mostrarNotificacion(data.error || 'Error al aprobar el diagnóstico', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión', 'error');
    }
};

// =====================================================
// RECHAZAR DIAGNÓSTICO
// =====================================================

window.abrirModalObservacion = function(diagnosticoId) {
    currentDiagnosticoId = diagnosticoId;
    const obsInput = document.getElementById('obsDiagnosticoId');
    const obsTexto = document.getElementById('observacionTexto');
    const audioPreview = document.getElementById('audioPreview');
    const grabacionUrl = document.getElementById('grabacionUrl');
    
    // 🔥 ASIGNAR EL ID AL CAMPO OCULTO
    if (obsInput) obsInput.value = diagnosticoId;
    if (obsTexto) obsTexto.value = '';
    if (audioPreview) {
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (grabacionUrl) grabacionUrl.value = '';
    
    const modal = document.getElementById('modalObservacion');
    if (modal) modal.classList.add('show');
};

window.cerrarModalObservacion = function() {
    const modal = document.getElementById('modalObservacion');
    if (modal) modal.classList.remove('show');
    if (mediaRecorder && isRecording) stopRecording();
};

async function enviarObservacion(event) {
    event.preventDefault();
    
    const diagnosticoId = document.getElementById('obsDiagnosticoId')?.value;
    const observacion = document.getElementById('observacionTexto')?.value;
    const grabacionUrl = document.getElementById('grabacionUrl')?.value;
    
    if (!observacion && !grabacionUrl) {
        mostrarNotificacion('Debes ingresar una observación o grabar un audio', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('diagnostico_id', diagnosticoId);
    formData.append('observacion', observacion);
    if (grabacionUrl) formData.append('grabacion_url', grabacionUrl);
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/rechazar-diagnostico`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion('Diagnóstico rechazado correctamente', 'success');
            window.cerrarModalObservacion();
            await loadAllData();
        } else {
            mostrarNotificacion(data.error || 'Error al rechazar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión', 'error');
    }
}

// =====================================================
// GRABACIÓN DE AUDIO - MODIFICADO PARA ENVIAR diagnostico_id
// =====================================================

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioPreview = document.getElementById('audioPreview');
            if (audioPreview) {
                audioPreview.src = audioUrl;
                audioPreview.style.display = 'block';
            }
            
            // =============================================
            // 🔥 OBTENER diagnostico_id DEL MODAL
            // =============================================
            const diagnosticoId = document.getElementById('obsDiagnosticoId')?.value;
            console.log('🔍 diagnostico_id obtenido del modal:', diagnosticoId);
            
            const reader = new FileReader();
            reader.onloadend = async () => {
                // =============================================
                // 🔥 CREAR FORM DATA CON diagnostico_id
                // =============================================
                const formData = new FormData();
                formData.append('audio', reader.result);
                formData.append('tipo', 'observacion');
                formData.append('diagnostico_id', diagnosticoId || '');  // <-- ENVIAR diagnostico_id
                
                try {
                    const response = await fetch(`${API_URL}/jefe-taller/subir-audio-observacion`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${getAuthToken()}` },
                        body: formData
                    });
                    const data = await response.json();
                    const grabacionUrl = document.getElementById('grabacionUrl');
                    if (grabacionUrl && data.url) {
                        grabacionUrl.value = data.url;
                        console.log('✅ Audio subido, URL:', data.url);
                    }
                    if (data.url) {
                        mostrarNotificacion('Audio subido correctamente', 'success');
                    } else {
                        mostrarNotificacion('Error al subir el audio', 'error');
                    }
                } catch (error) {
                    console.error('Error subiendo audio:', error);
                    mostrarNotificacion('Error al subir el audio', 'error');
                }
            };
            reader.readAsDataURL(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        const startBtn = document.getElementById('startRecordBtn');
        const stopBtn = document.getElementById('stopRecordBtn');
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        mostrarNotificacion('Grabando...', 'warning');
    } catch (error) {
        console.error('Error accediendo al micrófono:', error);
        mostrarNotificacion('No se pudo acceder al micrófono. Verifica los permisos.', 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        const startBtn = document.getElementById('startRecordBtn');
        const stopBtn = document.getElementById('stopRecordBtn');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        mostrarNotificacion('Grabación finalizada', 'success');
    }
}

// =====================================================
// SOLICITAR REPUESTO
// =====================================================

window.abrirModalSolicitarRepuesto = function(ordenId, servicioId, servicioDescripcion) {
    const ordenInput = document.getElementById('solicitudOrdenId');
    const servicioInput = document.getElementById('solicitudServicioId');
    const descripcionPieza = document.getElementById('descripcionPieza');
    
    if (ordenInput) ordenInput.value = ordenId;
    if (servicioInput) servicioInput.value = servicioId;
    if (descripcionPieza) {
        descripcionPieza.value = servicioDescripcion ? `Para el servicio: ${servicioDescripcion}\n` : '';
    }
    
    const modal = document.getElementById('modalSolicitarRepuesto');
    if (modal) modal.classList.add('show');
};

window.cerrarModalSolicitud = function() {
    const modal = document.getElementById('modalSolicitarRepuesto');
    if (modal) modal.classList.remove('show');
};

async function enviarSolicitudRepuesto(event) {
    event.preventDefault();
    
    const ordenId = document.getElementById('solicitudOrdenId')?.value;
    const servicioId = document.getElementById('solicitudServicioId')?.value;
    const descripcion = document.getElementById('descripcionPieza')?.value;
    const cantidad = document.getElementById('cantidad')?.value;
    const observacion = document.getElementById('obsJefeTaller')?.value;
    
    if (!descripcion) {
        mostrarNotificacion('Debes describir la pieza', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('orden_id', ordenId);
    formData.append('servicio_id', servicioId);
    formData.append('descripcion_pieza', descripcion);
    formData.append('cantidad', cantidad || 1);
    formData.append('observacion', observacion || '');
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/solicitar-cotizacion-repuesto`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` },
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            mostrarNotificacion('Solicitud enviada correctamente', 'success');
            window.cerrarModalSolicitud();
            document.getElementById('descripcionPieza').value = '';
            document.getElementById('cantidad').value = '1';
            document.getElementById('obsJefeTaller').value = '';
        } else {
            mostrarNotificacion(result.error || 'Error al enviar solicitud', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión', 'error');
    }
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function getEstadoIcon(estado) {
    const icons = {
        'pendiente': 'fa-clock',
        'aprobado': 'fa-check-circle',
        'rechazado': 'fa-times-circle',
        'borrador': 'fa-file-alt'
    };
    return icons[estado] || 'fa-question-circle';
}

function getEstadoTexto(estado) {
    const textos = {
        'pendiente': 'Pendiente',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado',
        'borrador': 'Borrador'
    };
    return textos[estado] || estado;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarLoading(show) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    if (show) {
        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando diagnósticos...</p>
            </div>
        `;
    }
}

function mostrarNotificacion(mensaje, tipo = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.verImagenAmpliada = function(url) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer';
    modal.innerHTML = `
        <div style="position:relative;max-width:90%;max-height:90%">
            <button style="position:absolute;top:-40px;right:0;background:none;border:none;color:white;font-size:30px;cursor:pointer">&times;</button>
            <img src="${url}" style="max-width:100%;max-height:90vh;object-fit:contain">
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('button')?.addEventListener('click', () => modal.remove());
};

function logout() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = window.API_BASE_URL + '/';
}

// =====================================================
// EXPORTAR FUNCIONES GLOBALES
// =====================================================

window.verDiagnostico = verDiagnostico;
window.cerrarModalDiagnostico = cerrarModalDiagnostico;
window.aprobarDiagnostico = aprobarDiagnostico;
window.abrirModalObservacion = abrirModalObservacion;
window.cerrarModalObservacion = cerrarModalObservacion;
window.verImagenAmpliada = verImagenAmpliada;
window.abrirModalSolicitarRepuesto = abrirModalSolicitarRepuesto;
window.cerrarModalSolicitud = cerrarModalSolicitud;
window.logout = logout;

// Cerrar modales con ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.cerrarModalDiagnostico();
        window.cerrarModalObservacion();
        window.cerrarModalSolicitud();
    }
});

// Cerrar modales al hacer clic fuera
window.onclick = (event) => {
    if (event.target.classList?.contains('modal')) {
        event.target.classList.remove('show');
    }
};

console.log('✅ diagnostico.js cargado correctamente - Versión responsive con tarjetas en móvil');