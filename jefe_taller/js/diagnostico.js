// =====================================================
// DIAGNOSTICO.JS - JEFE DE TALLER (CORREGIDO)
// Gestión de diagnósticos técnicos
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
        // Decodificar token para obtener información del usuario
        const payload = JSON.parse(atob(token.split('.')[1]));
        userInfo = payload.user;
        
        // Obtener roles del usuario
        if (userInfo && userInfo.roles && Array.isArray(userInfo.roles)) {
            currentUserRoles = userInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (userInfo) userInfo.roles = currentUserRoles;
        }
        
        // Si no hay roles en el token, intentar obtener de userData
        if (currentUserRoles.length === 0 && userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (userInfo) userInfo.roles = currentUserRoles;
        }
        
        // Verificar si tiene rol de jefe_taller (usando el nuevo sistema)
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller') || 
                                    (userInfo && userInfo.rol_principal === 'jefe_taller') ||
                                    (userInfo && userInfo.rol === 'jefe_taller');
        
        // Compatibilidad con sistema antiguo (por si acaso)
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
    
    // Actualizar fecha
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
    
    // Actualizar nombre de usuario
    const userNameElement = document.getElementById('userNombre');
    if (userNameElement && userInfo) {
        userNameElement.textContent = userInfo.nombre || 'Usuario';
    }
    
    // Mostrar badge de roles si tiene múltiples
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
    
    // Filtros
    const filterEstado = document.getElementById('filterEstado');
    const searchInput = document.getElementById('searchInput');
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    const btnBuscar = document.getElementById('btnBuscar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (filterEstado) filterEstado.addEventListener('change', applyFilters);
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (fechaDesde) fechaDesde.addEventListener('change', applyFilters);
    if (fechaHasta) fechaHasta.addEventListener('change', applyFilters);
    if (btnBuscar) btnBuscar.addEventListener('click', () => loadDiagnosticos());
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
        loadDiagnosticos();
        loadStats();
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

// ====================================================
// FUNCIONES DE UTILIDAD
// ====================================================
function getAuthToken() {
    return localStorage.getItem('furia_token');
}

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
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

// ====================================================
// CARGAR DATOS
// ====================================================
async function loadDiagnosticos() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/diagnosticos-pendientes`, {
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
            applyFilters();
        } else {
            mostrarNotificacion(data.error || 'Error cargando diagnósticos', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión', 'error');
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

// ====================================================
// FILTRADO Y RENDERIZADO
// ====================================================
function applyFilters() {
    currentFilters.estado = document.getElementById('filterEstado')?.value || 'todos';
    currentFilters.search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    currentFilters.fechaDesde = document.getElementById('fechaDesde')?.value || '';
    currentFilters.fechaHasta = document.getElementById('fechaHasta')?.value || '';
    
    let filtered = [...currentDiagnosticos];
    
    if (currentFilters.estado !== 'todos') {
        filtered = filtered.filter(d => d.estado === currentFilters.estado);
    }
    
    if (currentFilters.search) {
        filtered = filtered.filter(d => 
            (d.codigo_unico || '').toLowerCase().includes(currentFilters.search) ||
            (d.tecnico_nombre || '').toLowerCase().includes(currentFilters.search) ||
            (d.placa || '').toLowerCase().includes(currentFilters.search)
        );
    }
    
    if (currentFilters.fechaDesde) {
        const desde = new Date(currentFilters.fechaDesde);
        filtered = filtered.filter(d => {
            if (!d.fecha_envio) return false;
            return new Date(d.fecha_envio) >= desde;
        });
    }
    
    if (currentFilters.fechaHasta) {
        const hasta = new Date(currentFilters.fechaHasta);
        hasta.setHours(23, 59, 59);
        filtered = filtered.filter(d => {
            if (!d.fecha_envio) return false;
            return new Date(d.fecha_envio) <= hasta;
        });
    }
    
    renderDiagnosticosList(filtered);
}

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
            <p>No hay diagnósticos pendientes</p>
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
    
    currentFilters = { estado: 'todos', search: '', fechaDesde: '', fechaHasta: '' };
    renderDiagnosticosList(currentDiagnosticos);
}

// ====================================================
// VER DIAGNÓSTICO
// ====================================================
async function verDiagnostico(diagnosticoId) {
    console.log('👁️ Ver diagnóstico ID:', diagnosticoId);
    
    const modal = document.getElementById('modalDiagnostico');
    const modalBody = document.getElementById('modalDiagnosticoBody');
    
    if (!modal || !modalBody) {
        console.error('❌ Modal no encontrado');
        mostrarNotificacion('Error al abrir el modal', 'error');
        return;
    }
    
    modalBody.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando detalles del diagnóstico...</p>
        </div>
    `;
    modal.classList.add('show');
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/diagnostico/${diagnosticoId}`, {
            headers: getHeaders()
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Data recibida:', data);
        
        if (data.success && data.diagnostico) {
            mostrarModalDiagnostico(data.diagnostico);
        } else {
            throw new Error(data.error || 'Datos inválidos');
        }
    } catch (error) {
        console.error('Error:', error);
        modalBody.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error al cargar el diagnóstico: ${error.message}</p>
                <button class="btn-primary" onclick="window.verDiagnostico(${diagnosticoId})">Reintentar</button>
            </div>
        `;
        mostrarNotificacion('Error al cargar los detalles', 'error');
    }
}

function mostrarModalDiagnostico(diagnostico) {
    console.log('🎨 Renderizando modal con diagnóstico mejorado');
    
    const modalBody = document.getElementById('modalDiagnosticoBody');
    if (!modalBody) return;
    
    const servicios = diagnostico.servicios || [];
    const solicitudes = diagnostico.solicitudes_repuestos || [];
    const fotos = diagnostico.fotos || [];
    const observaciones = diagnostico.observaciones || [];
    
    // Helper para mostrar precio
    const mostrarPrecio = (precio) => {
        if (!precio) return 'No asignado';
        return `$${parseFloat(precio).toLocaleString('es-CO')}`;
    };
    
    modalBody.innerHTML = `
        <div class="diagnostico-detalle">
            <!-- Información General -->
            <div class="info-section">
                <h3><i class="fas fa-info-circle"></i> Información General</h3>
                <div class="info-grid">
                    <div class="info-grid-item">
                        <strong>Código Orden:</strong>
                        <span>${escapeHtml(diagnostico.codigo_unico || 'N/A')}</span>
                    </div>
                    <div class="info-grid-item">
                        <strong>Técnico:</strong>
                        <span><i class="fas fa-user"></i> ${escapeHtml(diagnostico.tecnico_nombre || 'Sin asignar')}</span>
                    </div>
                    <div class="info-grid-item">
                        <strong>Vehículo:</strong>
                        <span><i class="fas fa-car"></i> ${escapeHtml(diagnostico.placa || 'N/A')} - ${escapeHtml(diagnostico.marca || '')} ${escapeHtml(diagnostico.modelo || '')}</span>
                    </div>
                    <div class="info-grid-item">
                        <strong>Estado:</strong>
                        <span class="estado-badge ${diagnostico.estado}">${getEstadoTexto(diagnostico.estado)}</span>
                    </div>
                    <div class="info-grid-item">
                        <strong>Fecha Envío:</strong>
                        <span><i class="fas fa-calendar"></i> ${formatDate(diagnostico.fecha_envio)}</span>
                    </div>
                    <div class="info-grid-item">
                        <strong>Versión:</strong>
                        <span><i class="fas fa-code-branch"></i> ${diagnostico.version || 1}</span>
                    </div>
                </div>
            </div>
            
            <!-- Informe del Técnico -->
            <div class="info-section">
                <h3><i class="fas fa-file-alt"></i> Informe del Técnico</h3>
                <div class="informe-content">
                    <p>${escapeHtml(diagnostico.informe || 'No hay informe escrito')}</p>
                    ${diagnostico.url_grabacion_informe ? `
                        <audio controls src="${diagnostico.url_grabacion_informe}">
                            Tu navegador no soporta audio
                        </audio>
                    ` : ''}
                </div>
            </div>
            
            <!-- Servicios Propuestos -->
            <div class="info-section">
                <h3><i class="fas fa-tools"></i> Servicios Propuestos (${servicios.length})</h3>
                <div class="servicios-list-modal">
                    ${servicios.length > 0 ? servicios.map((s, index) => `
                        <div class="servicio-card-modal">
                            <div class="servicio-header">
                                <div class="servicio-icon">
                                    <i class="fas fa-wrench"></i>
                                </div>
                                <div class="servicio-info">
                                    <span class="servicio-descripcion">
                                        ${index + 1}. ${escapeHtml(s.descripcion)}
                                    </span>
                                    <div class="servicio-meta">
                                        ${s.precio_estimado ? `
                                            <span class="precio-badge">
                                                <i class="fas fa-tag"></i> Estimado: ${mostrarPrecio(s.precio_estimado)}
                                            </span>
                                        ` : ''}
                                        ${s.precio_final ? `
                                            <span class="precio-badge">
                                                <i class="fas fa-check-circle"></i> Final: ${mostrarPrecio(s.precio_final)}
                                            </span>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('') : '<p style="color: var(--gris-texto); text-align: center;">No hay servicios registrados</p>'}
                </div>
            </div>
            
            <!-- Solicitudes de Repuestos -->
            <div class="info-section">
                <h3><i class="fas fa-boxes"></i> Solicitudes de Repuestos (${solicitudes.length})</h3>
                <div class="solicitudes-list">
                    ${solicitudes.length > 0 ? solicitudes.map(s => `
                        <div class="solicitud-item">
                            <div class="solicitud-info">
                                <span class="solicitud-descripcion">
                                    <i class="fas fa-cube"></i> ${escapeHtml(s.descripcion_pieza)}
                                </span>
                                <div class="solicitud-detalles">
                                    <span><i class="fas fa-hashtag"></i> Cantidad: ${s.cantidad}</span>
                                    <span><i class="fas fa-chart-line"></i> Urgencia: ${s.urgencia || 'normal'}</span>
                                    ${s.fecha_solicitud ? `<span><i class="fas fa-calendar"></i> ${formatDate(s.fecha_solicitud)}</span>` : ''}
                                </div>
                            </div>
                            <div class="solicitud-estado ${s.estado || 'pendiente'}">
                                ${s.estado || 'pendiente'}
                            </div>
                        </div>
                    `).join('') : '<p style="color: var(--gris-texto); text-align: center;">No hay solicitudes de repuestos</p>'}
                </div>
            </div>
            
            <!-- Fotos del Diagnóstico -->
            ${fotos.length > 0 ? `
            <div class="info-section">
                <h3><i class="fas fa-camera"></i> Fotos del Diagnóstico (${fotos.length})</h3>
                <div class="fotos-grid">
                    ${fotos.map(f => `
                        <div class="foto-item" onclick="window.verImagenAmpliada('${f.url_foto}')">
                            <img src="${f.url_foto}" alt="Foto diagnóstico" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                            <span>${escapeHtml(f.descripcion_tecnico || 'Sin descripción')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- Observaciones (si existen) -->
            ${observaciones.length > 0 ? `
            <div class="info-section">
                <h3><i class="fas fa-comments"></i> Historial de Observaciones (${observaciones.length})</h3>
                <div class="observaciones-list">
                    ${observaciones.map(obs => `
                        <div class="observacion-item">
                            <div class="observacion-header">
                                <span class="observacion-autor">
                                    <i class="fas fa-user-tie"></i> ${escapeHtml(obs.jefe_taller_nombre || 'Jefe de Taller')}
                                </span>
                                <span class="observacion-fecha">
                                    <i class="fas fa-clock"></i> ${formatDate(obs.fecha_hora)}
                                </span>
                            </div>
                            ${obs.observacion ? `
                                <div class="observacion-texto">
                                    <i class="fas fa-quote-left"></i> ${escapeHtml(obs.observacion)}
                                </div>
                            ` : ''}
                            ${obs.url_grabacion ? `
                                <div class="observacion-audio">
                                    <audio controls src="${obs.url_grabacion}">
                                        Tu navegador no soporta audio
                                    </audio>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>
    `;
    
    console.log('✅ Modal mejorado renderizado');
}

function cerrarModalDiagnostico() {
    const modal = document.getElementById('modalDiagnostico');
    if (modal) modal.classList.remove('show');
}

// ====================================================
// APROBAR DIAGNÓSTICO
// ====================================================
async function aprobarDiagnostico(diagnosticoId) {
    if (!confirm('¿Estás seguro de aprobar este diagnóstico?')) return;
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/aprobar-diagnostico`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ diagnostico_id: diagnosticoId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion('Diagnóstico aprobado correctamente');
            loadDiagnosticos();
            loadStats();
        } else {
            mostrarNotificacion(data.error || 'Error al aprobar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión', 'error');
    }
}

// ====================================================
// MODAL DE OBSERVACIÓN (RECHAZO)
// ====================================================
function abrirModalObservacion(diagnosticoId) {
    currentDiagnosticoId = diagnosticoId;
    const obsInput = document.getElementById('obsDiagnosticoId');
    const obsTexto = document.getElementById('observacionTexto');
    const audioPreview = document.getElementById('audioPreview');
    
    if (obsInput) obsInput.value = diagnosticoId;
    if (obsTexto) obsTexto.value = '';
    if (audioPreview) audioPreview.style.display = 'none';
    
    const modal = document.getElementById('modalObservacion');
    if (modal) modal.classList.add('show');
}

function cerrarModalObservacion() {
    const modal = document.getElementById('modalObservacion');
    if (modal) modal.classList.remove('show');
    if (mediaRecorder && isRecording) stopRecording();
}

async function enviarObservacion(event) {
    event.preventDefault();
    
    const diagnosticoId = document.getElementById('obsDiagnosticoId')?.value;
    const observacion = document.getElementById('observacionTexto')?.value;
    const grabacionUrl = document.getElementById('grabacionUrl')?.value;
    
    if (!observacion && !grabacionUrl) {
        mostrarNotificacion('Debes ingresar una observación o grabar un audio', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/rechazar-diagnostico`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                diagnostico_id: parseInt(diagnosticoId),
                observacion: observacion,
                grabacion_url: grabacionUrl || null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion('Diagnóstico rechazado correctamente');
            cerrarModalObservacion();
            loadDiagnosticos();
            loadStats();
        } else {
            mostrarNotificacion(data.error || 'Error al rechazar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión', 'error');
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
                const url = await subirAudioObservacion(reader.result);
                const grabacionUrl = document.getElementById('grabacionUrl');
                if (grabacionUrl && url) grabacionUrl.value = url;
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
        console.error('Error al grabar:', error);
        mostrarNotificacion('No se pudo acceder al micrófono', 'error');
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

async function subirAudioObservacion(audioBase64) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/subir-audio-observacion`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ audio: audioBase64 })
        });
        const data = await response.json();
        return data.success ? data.url : null;
    } catch (error) {
        console.error('Error subiendo audio:', error);
        return null;
    }
}

// ====================================================
// SOLICITAR REPUESTO
// ====================================================
function abrirModalSolicitarRepuesto(ordenId, servicioId, servicioDescripcion) {
    const ordenInput = document.getElementById('solicitudOrdenId');
    const servicioInput = document.getElementById('solicitudServicioId');
    const descripcionInput = document.getElementById('descripcionPieza');
    const cantidadInput = document.getElementById('cantidad');
    const observacionInput = document.getElementById('obsJefeTaller');
    
    if (ordenInput) ordenInput.value = ordenId;
    if (servicioInput) servicioInput.value = servicioId;
    if (descripcionInput) descripcionInput.value = '';
    if (cantidadInput) cantidadInput.value = '1';
    if (observacionInput) observacionInput.value = '';
    
    const modal = document.getElementById('modalSolicitarRepuesto');
    if (modal) modal.classList.add('show');
}

function cerrarModalSolicitud() {
    const modal = document.getElementById('modalSolicitarRepuesto');
    if (modal) modal.classList.remove('show');
}

async function enviarSolicitudRepuesto(event) {
    event.preventDefault();
    
    const ordenId = document.getElementById('solicitudOrdenId')?.value;
    const servicioId = document.getElementById('solicitudServicioId')?.value;
    const descripcion = document.getElementById('descripcionPieza')?.value;
    const cantidad = document.getElementById('cantidad')?.value;
    const urgencia = document.getElementById('urgencia')?.value;
    const observacion = document.getElementById('obsJefeTaller')?.value;
    
    if (!descripcion) {
        mostrarNotificacion('Debes describir la pieza o herramienta necesaria', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/solicitar-cotizacion-repuesto`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                orden_id: parseInt(ordenId),
                servicio_id: parseInt(servicioId),
                descripcion_pieza: descripcion,
                cantidad: parseInt(cantidad),
                urgencia: urgencia,
                observacion: observacion
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            mostrarNotificacion('Solicitud enviada al Encargado de Repuestos');
            cerrarModalSolicitud();
            if (currentDiagnosticoId) verDiagnostico(currentDiagnosticoId);
        } else {
            mostrarNotificacion(result.error || 'Error al enviar solicitud', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión', 'error');
    }
}

// ====================================================
// FUNCIONES ADICIONALES
// ====================================================
function verImagenAmpliada(url) {
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
}

// ====================================================
// EXPONER FUNCIONES GLOBALES
// ====================================================
window.verDiagnostico = verDiagnostico;
window.cerrarModalDiagnostico = cerrarModalDiagnostico;
window.aprobarDiagnostico = aprobarDiagnostico;
window.abrirModalObservacion = abrirModalObservacion;
window.cerrarModalObservacion = cerrarModalObservacion;
window.abrirModalSolicitarRepuesto = abrirModalSolicitarRepuesto;
window.cerrarModalSolicitud = cerrarModalSolicitud;
window.verImagenAmpliada = verImagenAmpliada;
window.logout = logout;

// Cerrar modales con ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModalDiagnostico();
        cerrarModalObservacion();
        cerrarModalSolicitud();
    }
});

// Cerrar modales clickeando fuera
window.onclick = (event) => {
    if (event.target.classList?.contains('modal')) {
        event.target.classList.remove('show');
    }
};

console.log('✅ diagnostico.js cargado correctamente');