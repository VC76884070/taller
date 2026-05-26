// =====================================================
// DIAGNOSTICO.JS - JEFE DE TALLER
// Gestión de diagnósticos técnicos - SOLO ÚLTIMOS 5 POR ESTADO
// VERSIÓN CORREGIDA - USA VARIABLE GLOBAL DE INCLUDE.JS
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
// La variable API_BASE_URL ya está declarada en include.js como window.API_BASE_URL
// Si por alguna razón no existe (página cargada sola), la creamos
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
    
    if (filterEstado) filterEstado.addEventListener('change', () => {
        aplicarFiltros();
    });
    
    if (searchInput) searchInput.addEventListener('input', aplicarFiltros);
    if (fechaDesde) fechaDesde.addEventListener('change', aplicarFiltros);
    if (fechaHasta) fechaHasta.addEventListener('change', aplicarFiltros);
    
    if (btnBuscar) btnBuscar.addEventListener('click', () => aplicarFiltros());
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
        loadAllData();
    });
    
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
            // Organizar diagnósticos por estado
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
            
            console.log('✅ Diagnósticos cargados (últimos 5 por estado):');
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
            
            // Actualizar UI
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

function aplicarFiltros() {
    currentFilters.estado = document.getElementById('filterEstado')?.value || 'todos';
    currentFilters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    currentFilters.fechaDesde = document.getElementById('fechaDesde')?.value || '';
    currentFilters.fechaHasta = document.getElementById('fechaHasta')?.value || '';
    
    let diagnosticosFiltrados = [];
    
    if (currentFilters.estado === 'todos') {
        // Mostrar todos los estados
        diagnosticosFiltrados = [
            ...currentDiagnosticos.pendiente,
            ...currentDiagnosticos.aprobado,
            ...currentDiagnosticos.rechazado,
            ...currentDiagnosticos.borrador
        ];
    } else {
        diagnosticosFiltrados = [...(currentDiagnosticos[currentFilters.estado] || [])];
    }
    
    // Aplicar búsqueda
    if (currentFilters.search) {
        diagnosticosFiltrados = diagnosticosFiltrados.filter(d => 
            (d.codigo_unico || '').toLowerCase().includes(currentFilters.search) ||
            (d.tecnico_nombre || '').toLowerCase().includes(currentFilters.search) ||
            (d.placa || '').toLowerCase().includes(currentFilters.search) ||
            (d.marca || '').toLowerCase().includes(currentFilters.search) ||
            (d.modelo || '').toLowerCase().includes(currentFilters.search)
        );
    }
    
    // Aplicar filtros de fecha
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
// RENDERIZADO DE DIAGNÓSTICOS - SOLO ÚLTIMOS 5
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
    
    // Agrupar por estado
    const pendientes = diagnosticos.filter(d => d.estado === 'pendiente');
    const aprobados = diagnosticos.filter(d => d.estado === 'aprobado');
    const rechazados = diagnosticos.filter(d => d.estado === 'rechazado');
    const borradores = diagnosticos.filter(d => d.estado === 'borrador');
    
    let html = '';
    
    // Pendientes
    if (pendientes.length > 0) {
        html += renderSeccion(pendientes, 'pendientes', true);
    } else if (currentStats.pendiente > 0) {
        html += renderSeccionVacia('pendientes', currentStats.pendiente);
    }
    
    // Aprobados - SOLO ÚLTIMOS 5
    if (aprobados.length > 0) {
        html += renderSeccion(aprobados, 'aprobados', false);
    } else if (currentStats.aprobado > 0) {
        html += renderSeccionVacia('aprobados', currentStats.aprobado);
    }
    
    // Rechazados - SOLO ÚLTIMOS 5
    if (rechazados.length > 0) {
        html += renderSeccion(rechazados, 'rechazados', false);
    } else if (currentStats.rechazado > 0) {
        html += renderSeccionVacia('rechazados', currentStats.rechazado);
    }
    
    // Borradores
    if (borradores.length > 0) {
        html += renderSeccion(borradores, 'borradores', false);
    }
    
    container.innerHTML = html;
}

function renderSeccion(diagnosticos, estado, showActions) {
    const titulos = {
        'pendientes': { icono: 'fa-clock', texto: 'Pendientes de Revisión', color: '#F59E0B' },
        'aprobados': { icono: 'fa-check-circle', texto: 'Últimos Aprobados', color: '#10B981' },
        'rechazados': { icono: 'fa-times-circle', texto: 'Últimos Rechazados', color: '#EF4444' },
        'borradores': { icono: 'fa-file-alt', texto: 'Borradores', color: '#6B7280' }
    };
    
    const titulo = titulos[estado] || { icono: 'fa-file', texto: estado, color: '#6B7280' };
    const totalEstado = currentStats[estado.slice(0, -1)] || diagnosticos.length;
    const mostrados = diagnosticos.length;
    
    return `
        <div class="seccion-diagnosticos">
            <div class="seccion-header ${estado}">
                <h3><i class="fas ${titulo.icono}"></i> ${titulo.texto}</h3>
                <div class="seccion-info">
                    <span class="seccion-badge">Mostrando ${mostrados} de ${totalEstado}</span>
                </div>
            </div>
            <div class="diagnosticos-table">
                <div class="table-header">
                    <span>Código Orden</span>
                    <span>Técnico</span>
                    <span>Vehículo</span>
                    <span>Servicios</span>
                    <span>Fecha</span>
                    <span>Estado</span>
                    <span>Acciones</span>
                </div>
                ${diagnosticos.map(d => renderDiagnosticoRow(d, showActions && d.estado === 'pendiente')).join('')}
            </div>
        </div>
    `;
}

function renderSeccionVacia(estado, total) {
    const titulos = {
        'pendientes': { icono: 'fa-clock', texto: 'Pendientes de Revisión', color: '#F59E0B' },
        'aprobados': { icono: 'fa-check-circle', texto: 'Aprobados', color: '#10B981' },
        'rechazados': { icono: 'fa-times-circle', texto: 'Rechazados', color: '#EF4444' }
    };
    
    const titulo = titulos[estado] || { icono: 'fa-file', texto: estado, color: '#6B7280' };
    
    return `
        <div class="seccion-diagnosticos">
            <div class="seccion-header ${estado}">
                <h3><i class="fas ${titulo.icono}"></i> ${titulo.texto}</h3>
                <div class="seccion-info">
                    <span class="seccion-badge">${total} en total</span>
                </div>
            </div>
            <div class="empty-state-mini">
                <i class="fas fa-info-circle"></i>
                <p>Mostrando solo los últimos 5 registros. Usa el filtro de estado para ver más.</p>
            </div>
        </div>
    `;
}

function renderDiagnosticoRow(d, showActions) {
    const serviciosCount = d.servicios?.length || 0;
    const tieneServicios = serviciosCount > 0;
    
    return `
        <div class="diagnostico-row" data-id="${d.diagnostico_id}">
            <span class="codigo">${escapeHtml(d.codigo_unico || 'N/A')}</span>
            <div class="tecnico">
                <div class="tecnico-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <span>${escapeHtml(d.tecnico_nombre || 'Sin asignar')}</span>
            </div>
            <span class="vehiculo">${escapeHtml(d.placa || 'N/A')} - ${escapeHtml(d.marca || '')} ${escapeHtml(d.modelo || '')}</span>
            <span class="servicios-count ${tieneServicios ? 'tiene' : ''}">
                <i class="fas fa-wrench"></i> ${serviciosCount} servicio${serviciosCount !== 1 ? 's' : ''}
            </span>
            <span class="fecha">${formatDate(d.fecha_envio)}</span>
            <span class="estado-badge ${d.estado}">
                <i class="fas ${getEstadoIcon(d.estado)}"></i>
                ${getEstadoTexto(d.estado)}
            </span>
            <div class="action-buttons">
                <button class="action-btn view" onclick="verDiagnostico(${d.diagnostico_id})" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                </button>
                ${showActions ? `
                    <button class="action-btn approve" onclick="aprobarDiagnostico(${d.diagnostico_id})" title="Aprobar">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="action-btn reject" onclick="abrirModalObservacion(${d.diagnostico_id})" title="Rechazar">
                        <i class="fas fa-times-circle"></i>
                    </button>
                ` : ''}
            </div>
        </div>
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
        <div class="diagnostico-detalle-modern">
            <!-- Header -->
            <div class="diagnostico-header-modern">
                <h2><i class="fas fa-stethoscope"></i> Diagnóstico Técnico</h2>
                <div class="codigo-orden">
                    <i class="fas fa-hashtag"></i> Orden: ${escapeHtml(diagnostico.codigo_unico || 'N/A')}
                </div>
                <div class="vehiculo-info-modern">
                    <div class="info-item"><i class="fas fa-car"></i> ${escapeHtml(diagnostico.placa || 'N/A')}</div>
                    <div class="info-item"><i class="fas fa-tag"></i> ${escapeHtml(diagnostico.marca || '')} ${escapeHtml(diagnostico.modelo || '')}</div>
                    <div class="info-item"><i class="fas fa-user"></i> Técnico: ${escapeHtml(diagnostico.tecnico_nombre || 'N/A')}</div>
                    <div class="info-item"><i class="fas fa-calendar"></i> ${formatDate(diagnostico.fecha_envio)}</div>
                </div>
            </div>
            
            <!-- Tabs -->
            <div class="diagnostico-tabs">
                <button class="tab-btn active" data-tab="info">📋 Información</button>
                <button class="tab-btn" data-tab="servicios">🔧 Servicios (${servicios.length})</button>
                ${solicitudes.length > 0 ? `<button class="tab-btn" data-tab="repuestos">🛒 Repuestos (${solicitudes.length})</button>` : ''}
                ${fotos.length > 0 ? `<button class="tab-btn" data-tab="fotos">📸 Fotos (${fotos.length})</button>` : ''}
                ${observaciones.length > 0 ? `<button class="tab-btn" data-tab="observaciones">💬 Observaciones (${observaciones.length})</button>` : ''}
            </div>
            
            <!-- Tab: Información -->
            <div class="tab-content active" id="tab-info">
                <div class="info-grid-modern">
                    <div class="info-card">
                        <div class="info-card-header"><i class="fas fa-file-alt"></i><h4>Informe del Técnico</h4></div>
                        <div class="info-card-content"><p>${escapeHtml(diagnostico.informe || 'Sin informe')}</p></div>
                        ${diagnostico.url_grabacion_informe ? `
                            <div style="margin-top: 1rem;">
                                <label>🎙️ Grabación:</label>
                                <audio controls src="${diagnostico.url_grabacion_informe}" style="width: 100%; margin-top: 0.5rem;"></audio>
                            </div>
                        ` : ''}
                    </div>
                    <div class="info-card">
                        <div class="info-card-header"><i class="fas fa-info-circle"></i><h4>Detalles</h4></div>
                        <div class="info-card-content">
                            <p><strong>Versión:</strong> ${diagnostico.version || 1}</p>
                            <p><strong>Estado:</strong> <span class="estado-badge ${diagnostico.estado}">${getEstadoTexto(diagnostico.estado)}</span></p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Tab: Servicios -->
            <div class="tab-content" id="tab-servicios">
                ${servicios.length > 0 ? `
                    <div class="servicios-list-modern">
                        ${servicios.map(s => `
                            <div class="servicio-card-modern">
                                <div class="servicio-nombre"><i class="fas fa-wrench"></i> ${escapeHtml(s.descripcion)}</div>
                                <div class="servicio-precios">
                                    ${s.precio_estimado ? `<span>Estimado: Bs. ${s.precio_estimado}</span>` : ''}
                                    ${s.precio_final ? `<span>Final: Bs. ${s.precio_final}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="empty-state"><p>No hay servicios registrados</p></div>'}
            </div>
            
            <!-- Tab: Repuestos -->
            ${solicitudes.length > 0 ? `
                <div class="tab-content" id="tab-repuestos">
                    <div class="solicitudes-list-modern">
                        ${solicitudes.map(s => `
                            <div class="solicitud-card">
                                <div class="solicitud-info">
                                    <h4>${escapeHtml(s.descripcion_pieza)}</h4>
                                    <p>Cantidad: ${s.cantidad}</p>
                                </div>
                                <div class="solicitud-estado-badge ${s.estado}">${s.estado}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Tab: Fotos -->
            ${fotos.length > 0 ? `
                <div class="tab-content" id="tab-fotos">
                    <div class="fotos-grid-modern">
                        ${fotos.map(f => `
                            <div class="foto-card" onclick="verImagenAmpliada('${f.url_foto}')">
                                <img src="${f.url_foto}" alt="Foto diagnóstico">
                                <div class="foto-card-info">${escapeHtml(f.descripcion_tecnico || 'Sin descripción')}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Tab: Observaciones -->
            ${observaciones.length > 0 ? `
                <div class="tab-content" id="tab-observaciones">
                    <div class="observaciones-list-modern">
                        ${observaciones.map(obs => `
                            <div class="observacion-card">
                                <div class="observacion-header">
                                    <div class="observacion-autor"><i class="fas fa-user-tie"></i> <strong>${escapeHtml(obs.jefe_taller_nombre || 'Jefe Taller')}</strong></div>
                                    <div class="observacion-fecha"><i class="far fa-clock"></i> ${formatDate(obs.fecha_hora)}</div>
                                </div>
                                <div class="observacion-texto">${escapeHtml(obs.observacion)}</div>
                                ${obs.url_grabacion ? `<div class="observacion-audio"><audio controls src="${obs.url_grabacion}"></audio></div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    // Inicializar tabs
    const tabs = modalBody.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            const contents = modalBody.querySelectorAll('.tab-content');
            contents.forEach(c => c.classList.remove('active'));
            const target = modalBody.querySelector(`#tab-${tabId}`);
            if (target) target.classList.add('active');
        });
    });
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
// GRABACIÓN DE AUDIO
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
            
            const reader = new FileReader();
            reader.onloadend = async () => {
                const formData = new FormData();
                formData.append('audio', reader.result);
                formData.append('tipo', 'observacion');
                
                try {
                    const response = await fetch(`${API_URL}/jefe-taller/subir-audio-observacion`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${getAuthToken()}` },
                        body: formData
                    });
                    const data = await response.json();
                    const grabacionUrl = document.getElementById('grabacionUrl');
                    if (grabacionUrl && data.url) grabacionUrl.value = data.url;
                    if (data.url) mostrarNotificacion('Audio subido correctamente', 'success');
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

// Exponer funciones globales
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

console.log('✅ diagnostico.js cargado correctamente - Solo últimos 5 por estado');