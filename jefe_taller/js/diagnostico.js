// =====================================================
// DIAGNOSTICO.JS - JEFE DE TALLER (VERSIÓN CORREGIDA CON MODAL FUNCIONAL)
// Gestión de diagnósticos técnicos con filtros funcionales
// =====================================================

const API_URL = 'http://localhost:5000/api';
let userInfo = null;
let currentUserRoles = [];

// Estado global
let currentDiagnosticos = [];
let currentFilters = {
    estado: 'todos',
    search: '',
    fechaDesde: '',
    fechaHasta: ''
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
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    initEventListeners();
    await loadDiagnosticos();
    await loadStats();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    console.log('🔐 Token existe:', !!token);
    
    if (!token) {
        console.log('❌ No hay token');
        window.location.href = '/';
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
        
        if (currentUserRoles.length === 0 && userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (userInfo) userInfo.roles = currentUserRoles;
        }
        
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller') || 
                                    (userInfo && userInfo.rol_principal === 'jefe_taller') ||
                                    (userInfo && userInfo.rol === 'jefe_taller');
        
        const tieneIdRolAntiguo = userInfo && (userInfo.id_rol === 2 || userInfo.id_rol === 3);
        
        if (!tieneRolJefeTaller && !tieneIdRolAntiguo) {
            console.warn('Usuario no tiene permisos de jefe_taller', currentUserRoles);
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return false;
        }
        
        console.log('✅ Autenticación exitosa - Roles:', currentUserRoles);
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
        return false;
    }
}

function initPage() {
    console.log('✅ Inicializando página');
    
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
    
    if (currentUserRoles.length > 1) {
        const userContainer = document.querySelector('.user-info');
        if (userContainer && !document.querySelector('.user-roles-badge')) {
            const rolesBadge = document.createElement('span');
            rolesBadge.className = 'user-roles-badge';
            rolesBadge.style.cssText = `
                font-size: 0.7rem;
                background: var(--gris-200);
                padding: 0.2rem 0.5rem;
                border-radius: 12px;
                margin-left: 0.5rem;
            `;
            const nombresRoles = currentUserRoles.map(r => {
                const nombres = {
                    'jefe_taller': 'Jefe Taller',
                    'jefe_operativo': 'Jefe Operativo',
                    'tecnico': 'Técnico',
                    'encargado_repuestos': 'Repuestos'
                };
                return nombres[r] || r;
            }).join(', ');
            rolesBadge.textContent = nombresRoles;
            const userNameSpan = document.getElementById('userNombre');
            if (userNameSpan && userNameSpan.parentElement) {
                userNameSpan.parentElement.appendChild(rolesBadge);
            }
        }
    }
}

function initEventListeners() {
    console.log('✅ Configurando event listeners');
    
    const filterEstado = document.getElementById('filterEstado');
    const searchInput = document.getElementById('searchInput');
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    const btnBuscar = document.getElementById('btnBuscar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (filterEstado) filterEstado.addEventListener('change', () => {
        loadDiagnosticos();
    });
    
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (fechaDesde) fechaDesde.addEventListener('change', applyFilters);
    if (fechaHasta) fechaHasta.addEventListener('change', applyFilters);
    
    if (btnBuscar) btnBuscar.addEventListener('click', () => loadDiagnosticos());
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
        loadDiagnosticos();
        loadStats();
    });
    
    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    if (startRecordBtn) startRecordBtn.addEventListener('click', startRecording);
    if (stopRecordBtn) stopRecordBtn.addEventListener('click', stopRecording);
    
    const formSolicitud = document.getElementById('formSolicitarRepuesto');
    const formObservacion = document.getElementById('formObservacion');
    if (formSolicitud) formSolicitud.addEventListener('submit', enviarSolicitudRepuesto);
    if (formObservacion) formObservacion.addEventListener('submit', enviarObservacion);
    
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
    
    const container = document.getElementById('toastContainer');
    if (container) {
        container.appendChild(toast);
    } else {
        document.body.appendChild(toast);
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            background: white;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            gap: 0.75rem;
            animation: slideIn 0.3s ease;
            border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#1E3A5F'};
        `;
    }
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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

function logout() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = '/';
}

async function loadDiagnosticos() {
    mostrarLoading(true);
    
    try {
        const estadoFiltro = document.getElementById('filterEstado')?.value || 'todos';
        
        let url = `${API_URL}/jefe-taller/diagnosticos`;
        if (estadoFiltro !== 'todos') {
            url += `?estado=${encodeURIComponent(estadoFiltro)}`;
        }
        
        console.log(`📡 Cargando diagnósticos desde: ${url}`);
        
        const response = await fetch(url, {
            headers: getHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                mostrarNotificacion('Sesión expirada', 'error');
                setTimeout(() => window.location.href = '/', 2000);
                return;
            }
            throw new Error('Error cargando diagnósticos');
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentDiagnosticos = data.diagnosticos || [];
            console.log(`✅ Cargados ${currentDiagnosticos.length} diagnósticos`);
            applyFilters();
        } else {
            mostrarNotificacion(data.error || 'Error cargando diagnósticos', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión: ' + error.message, 'error');
        mostrarResultadosVacio();
    } finally {
        mostrarLoading(false);
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
            const pendientesElem = document.getElementById('pendientesCount');
            const aprobadosElem = document.getElementById('aprobadosCount');
            const rechazadosElem = document.getElementById('rechazadosCount');
            const borradoresElem = document.getElementById('borradoresCount');
            
            if (pendientesElem) pendientesElem.textContent = data.stats?.pendiente || 0;
            if (aprobadosElem) aprobadosElem.textContent = data.stats?.aprobado || 0;
            if (rechazadosElem) rechazadosElem.textContent = data.stats?.rechazado || 0;
            if (borradoresElem) borradoresElem.textContent = data.stats?.borrador || 0;
        }
    } catch (error) {
        console.error('Error cargando stats:', error);
    }
}

function applyFilters() {
    currentFilters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    currentFilters.fechaDesde = document.getElementById('fechaDesde')?.value || '';
    currentFilters.fechaHasta = document.getElementById('fechaHasta')?.value || '';
    
    let filtered = [...currentDiagnosticos];
    
    if (currentFilters.search) {
        filtered = filtered.filter(d => 
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
        filtered = filtered.filter(d => {
            if (!d.fecha_envio) return false;
            return new Date(d.fecha_envio) >= desde;
        });
    }
    
    if (currentFilters.fechaHasta) {
        const hasta = new Date(currentFilters.fechaHasta);
        hasta.setHours(23, 59, 59, 999);
        filtered = filtered.filter(d => {
            if (!d.fecha_envio) return false;
            return new Date(d.fecha_envio) <= hasta;
        });
    }
    
    renderDiagnosticosList(filtered);
}

// ====================================================
// RENDERIZAR LISTA - CORREGIDO
// ====================================================
function renderDiagnosticosList(diagnosticos) {
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
    
    container.innerHTML = `
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
            ${diagnosticos.map(d => `
                <div class="diagnostico-row" data-id="${d.diagnostico_id}">
                    <span class="codigo">${escapeHtml(d.codigo_unico || 'N/A')}</span>
                    <div class="tecnico">
                        <div class="tecnico-avatar">
                            <i class="fas fa-user"></i>
                        </div>
                        <span>${escapeHtml(d.tecnico_nombre || 'Sin asignar')}</span>
                    </div>
                    <span class="vehiculo">${escapeHtml(d.placa || 'N/A')} - ${escapeHtml(d.marca || '')} ${escapeHtml(d.modelo || '')}</span>
                    <span class="servicios-count">${d.servicios?.length || 0} servicios</span>
                    <span class="fecha">${formatDate(d.fecha_envio)}</span>
                    <span class="estado-badge ${d.estado}">
                        <i class="fas ${getEstadoIcon(d.estado)}"></i>
                        ${getEstadoTexto(d.estado)}
                    </span>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="window.verDiagnostico(${d.diagnostico_id})" title="Ver detalle">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${d.estado === 'pendiente' ? `
                            <button class="action-btn approve" onclick="window.aprobarDiagnostico(${d.diagnostico_id})" title="Aprobar">
                                <i class="fas fa-check-circle"></i>
                            </button>
                            <button class="action-btn reject" onclick="window.abrirModalObservacion(${d.diagnostico_id})" title="Rechazar">
                                <i class="fas fa-times-circle"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
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

function limpiarFiltros() {
    const filterEstado = document.getElementById('filterEstado');
    const searchInput = document.getElementById('searchInput');
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    
    if (filterEstado) filterEstado.value = 'todos';
    if (searchInput) searchInput.value = '';
    if (fechaDesde) fechaDesde.value = '';
    if (fechaHasta) fechaHasta.value = '';
    
    loadDiagnosticos();
}

// ====================================================
// VER DIAGNÓSTICO - CORREGIDO
// ====================================================
window.verDiagnostico = async function(diagnosticoId) {
    console.log('👁️ Ver diagnóstico ID:', diagnosticoId);
    
    const modal = document.getElementById('modalDiagnostico');
    const modalBody = document.getElementById('modalDiagnosticoBody');
    
    if (!modal) {
        console.error('❌ Modal no encontrado');
        return;
    }
    if (!modalBody) {
        console.error('❌ Modal body no encontrado');
        return;
    }
    
    modalBody.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando detalles del diagnóstico...</p></div>`;
    modal.classList.add('show');
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/diagnostico/${diagnosticoId}`, {
            headers: getHeaders()
        });
        
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Datos recibidos:', data);
        
        if (data.success && data.diagnostico) {
            mostrarModalDiagnostico(data.diagnostico);
        } else {
            throw new Error(data.error || 'Datos inválidos');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        modalBody.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error: ${error.message}</p><p>Verifica la consola para más detalles.</p></div>`;
        mostrarNotificacion('Error al cargar el diagnóstico: ' + error.message, 'error');
    }
};

function mostrarModalDiagnostico(diagnostico) {
    const modalBody = document.getElementById('modalDiagnosticoBody');
    if (!modalBody) return;
    
    console.log('🎨 Renderizando diagnóstico:', diagnostico);
    
    const servicios = diagnostico.servicios || [];
    const solicitudes = diagnostico.solicitudes_repuestos || [];
    const fotos = diagnostico.fotos || [];
    const observaciones = diagnostico.observaciones || [];
    const estadoActual = diagnostico.estado;
    
    // Timeline HTML
    const timelineHtml = `
        <div class="status-timeline">
            <h4 style="margin-bottom: 1rem; color: var(--blanco);">
                <i class="fas fa-chart-line"></i> Estado del Diagnóstico
            </h4>
            <div class="timeline-steps">
                <div class="step ${estadoActual === 'pendiente' ? 'active' : estadoActual === 'aprobado' || estadoActual === 'rechazado' ? 'completed' : ''}">
                    <div class="step-icon"><i class="fas fa-file-alt"></i></div>
                    <div class="step-label">Enviado</div>
                </div>
                <div class="step ${estadoActual === 'aprobado' ? 'active' : ''}">
                    <div class="step-icon"><i class="fas fa-check"></i></div>
                    <div class="step-label">Aprobado</div>
                </div>
                <div class="step ${estadoActual === 'rechazado' ? 'active' : ''}">
                    <div class="step-icon"><i class="fas fa-times"></i></div>
                    <div class="step-label">Rechazado</div>
                </div>
            </div>
        </div>
    `;
    
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
            
            ${timelineHtml}
            
            <!-- Tabs -->
            <div class="diagnostico-tabs">
                <button class="tab-btn active" data-tab="info">📋 Información General</button>
                <button class="tab-btn" data-tab="servicios">🔧 Servicios (${servicios.length})</button>
                <button class="tab-btn" data-tab="repuestos">🛒 Repuestos (${solicitudes.length})</button>
                ${fotos.length > 0 ? `<button class="tab-btn" data-tab="fotos">📸 Fotos (${fotos.length})</button>` : ''}
                ${observaciones.length > 0 ? `<button class="tab-btn" data-tab="observaciones">💬 Observaciones (${observaciones.length})</button>` : ''}
            </div>
            
            <!-- Tab: Información General -->
            <div class="tab-content active" id="tab-info">
                <div class="info-grid-modern">
                    <div class="info-card">
                        <div class="info-card-header">
                            <i class="fas fa-file-alt"></i>
                            <h4>Informe del Técnico</h4>
                        </div>
                        <div class="info-card-content">
                            <p>${escapeHtml(diagnostico.informe || 'Sin informe proporcionado')}</p>
                            ${diagnostico.url_grabacion_informe ? `
                                <div style="margin-top: 1rem;">
                                    <label style="color: var(--gris-texto); font-size: 0.7rem;">🎙️ Grabación del informe:</label>
                                    <audio controls src="${diagnostico.url_grabacion_informe}" style="width: 100%; margin-top: 0.5rem;"></audio>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="info-card">
                        <div class="info-card-header">
                            <i class="fas fa-info-circle"></i>
                            <h4>Detalles Adicionales</h4>
                        </div>
                        <div class="info-card-content">
                            <p><strong>Versión:</strong> ${diagnostico.version || 1}</p>
                            <p><strong>Fecha de modificación:</strong> ${formatDate(diagnostico.fecha_modificacion)}</p>
                            <p><strong>Estado actual:</strong> <span class="estado-badge ${diagnostico.estado}">${getEstadoTexto(diagnostico.estado)}</span></p>
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
                                <div class="servicio-nombre">
                                    <i class="fas fa-wrench"></i>
                                    ${escapeHtml(s.descripcion)}
                                </div>
                                <div class="servicio-precios">
                                    ${s.precio_estimado ? `<span><i class="fas fa-dollar-sign"></i> Estimado: $${s.precio_estimado}</span>` : ''}
                                    ${s.precio_final ? `<span><i class="fas fa-check-circle"></i> Final: $${s.precio_final}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="empty-state"><i class="fas fa-tools"></i><p>No hay servicios registrados</p></div>'}
            </div>
            
            <!-- Tab: Repuestos -->
            <div class="tab-content" id="tab-repuestos">
                ${solicitudes.length > 0 ? `
                    <div class="solicitudes-list-modern">
                        ${solicitudes.map(s => `
                            <div class="solicitud-card">
                                <div class="solicitud-info">
                                    <h4>${escapeHtml(s.descripcion_pieza)}</h4>
                                    <p>Cantidad: ${s.cantidad} | Urgencia: ${s.urgencia || 'Normal'}</p>
                                </div>
                                <div class="solicitud-estado-badge ${s.estado}">
                                    ${s.estado === 'pendiente' ? 'Pendiente' : s.estado === 'cotizado' ? 'Cotizado' : s.estado}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No hay solicitudes de repuestos</p></div>'}
            </div>
            
            <!-- Tab: Fotos -->
            ${fotos.length > 0 ? `
                <div class="tab-content" id="tab-fotos">
                    <div class="fotos-grid-modern">
                        ${fotos.map(f => `
                            <div class="foto-card" onclick="window.verImagenAmpliada('${f.url_foto}')">
                                <img src="${f.url_foto}" alt="Foto diagnóstico" loading="lazy" onerror="this.src='https://placehold.co/150x100?text=Error+Carga'">
                                <div class="foto-card-info">
                                    <span>${escapeHtml(f.descripcion || 'Sin descripción')}</span>
                                </div>
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
                                    <div class="observacion-autor">
                                        <i class="fas fa-user-tie"></i>
                                        <strong>${escapeHtml(obs.jefe_taller_nombre || 'Jefe Taller')}</strong>
                                    </div>
                                    <div class="observacion-fecha">
                                        <i class="far fa-clock"></i> ${formatDate(obs.fecha_hora)}
                                    </div>
                                </div>
                                <div class="observacion-texto">
                                    ${escapeHtml(obs.observacion || 'Sin texto')}
                                </div>
                                ${obs.url_grabacion ? `
                                    <div class="observacion-audio">
                                        <audio controls src="${obs.url_grabacion}"></audio>
                                    </div>
                                ` : ''}
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
            contents.forEach(content => content.classList.remove('active'));
            const targetContent = modalBody.querySelector(`#tab-${tabId}`);
            if (targetContent) targetContent.classList.add('active');
        });
    });
}

window.cerrarModalDiagnostico = function() {
    const modal = document.getElementById('modalDiagnostico');
    if (modal) modal.classList.remove('show');
};

// ====================================================
// APROBAR DIAGNÓSTICO
// ====================================================
window.aprobarDiagnostico = async function(diagnosticoId) {
    console.log('📝 Aprobando diagnóstico ID:', diagnosticoId);
    
    if (!diagnosticoId) {
        mostrarNotificacion('ID de diagnóstico inválido', 'error');
        return;
    }
    
    if (!confirm('¿Estás seguro de aprobar este diagnóstico?\n\nAl aprobarlo, la orden pasará al estado COTIZACION.')) return;
    
    const token = getAuthToken();
    if (!token) {
        mostrarNotificacion('No hay sesión iniciada', 'error');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('diagnostico_id', diagnosticoId);
        
        const response = await fetch(`${API_URL}/jefe-taller/aprobar-diagnostico-simple`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            mostrarNotificacion(data.message || 'Diagnóstico aprobado correctamente', 'success');
            await loadDiagnosticos();
            await loadStats();
            window.cerrarModalDiagnostico();
        } else {
            mostrarNotificacion(data.error || 'Error al aprobar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión: ' + error.message, 'error');
    }
};

// ====================================================
// RECHAZAR DIAGNÓSTICO
// ====================================================
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
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion('Diagnóstico rechazado correctamente');
            window.cerrarModalObservacion();
            loadDiagnosticos();
            loadStats();
        } else {
            mostrarNotificacion(data.error || 'Error al rechazar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión: ' + error.message, 'error');
    }
}

// ====================================================
// GRABACIÓN DE AUDIO
// ====================================================
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
                        headers: {
                            'Authorization': `Bearer ${getAuthToken()}`
                        },
                        body: formData
                    });
                    const data = await response.json();
                    const grabacionUrl = document.getElementById('grabacionUrl');
                    if (grabacionUrl && data.url) grabacionUrl.value = data.url;
                    if (data.url) {
                        mostrarNotificacion('Audio subido correctamente', 'success');
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
        mostrarNotificacion('Grabación finalizada');
    }
}

// ====================================================
// SOLICITAR REPUESTO
// ====================================================
window.abrirModalSolicitarRepuesto = function(ordenId, servicioId, servicioDescripcion) {
    const ordenInput = document.getElementById('solicitudOrdenId');
    const servicioInput = document.getElementById('solicitudServicioId');
    const descripcionPieza = document.getElementById('descripcionPieza');
    
    if (ordenInput) ordenInput.value = ordenId;
    if (servicioInput) servicioInput.value = servicioId;
    if (descripcionPieza) {
        descripcionPieza.value = servicioDescripcion ? 
            `Para el servicio: ${servicioDescripcion}\n` : '';
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
    const urgencia = document.getElementById('urgencia')?.value;
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
    formData.append('urgencia', urgencia || 'normal');
    formData.append('observacion', observacion || '');
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/solicitar-cotizacion-repuesto`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            mostrarNotificacion('Solicitud enviada correctamente', 'success');
            window.cerrarModalSolicitud();
            document.getElementById('descripcionPieza').value = '';
            document.getElementById('cantidad').value = '1';
            document.getElementById('urgencia').value = 'normal';
            document.getElementById('obsJefeTaller').value = '';
        } else {
            mostrarNotificacion(result.error || 'Error al enviar solicitud', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión: ' + error.message, 'error');
    }
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
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    modal.querySelector('button')?.addEventListener('click', () => modal.remove());
};

window.logout = logout;

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.cerrarModalDiagnostico();
        window.cerrarModalObservacion();
        window.cerrarModalSolicitud();
    }
});

window.onclick = (event) => {
    if (event.target.classList?.contains('modal')) {
        event.target.classList.remove('show');
    }
};

console.log('✅ diagnostico.js cargado correctamente');