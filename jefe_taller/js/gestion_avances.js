// =====================================================
// GESTION_AVANCES.JS - JEFE DE TALLER
// GESTIÓN DE AVANCES DE TRABAJO - VERSIÓN CORREGIDA
// =====================================================

// 🔧 IMPORTANTE: Definir API_URL PRIMERO
const API_URL = window.location.origin + '/api/jefe-taller/avances';

let token = null;
let currentUser = null;
let avancesPendientes = [];
let avancesProcesados = [];

console.log('🔧 Iniciando configuración de gestion_avances.js');
console.log('📍 API_URL configurada:', API_URL);

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    if (!token) token = sessionStorage.getItem('token');
    
    if (!token) {
        console.warn('⚠️ No se encontró token');
    } else {
        console.log('🔑 Token obtenido (primeros 30 chars):', token.substring(0, 30) + '...');
    }
    
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-BO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

function showToast(message, type = 'info') {
    console.log(`📢 Toast [${type}]: ${message}`);
    
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';

    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

function statusBadge(estado) {
    const map = {
        'pendiente': 'status-pendiente',
        'aprobado': 'status-aprobado',
        'rechazado': 'status-rechazado'
    };
    const textos = {
        'pendiente': 'Pendiente',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado'
    };
    const iconos = {
        'pendiente': 'fa-clock',
        'aprobado': 'fa-check-circle',
        'rechazado': 'fa-times-circle'
    };
    return `<span class="status-badge ${map[estado]}"><i class="fas ${iconos[estado]}"></i> ${textos[estado]}</span>`;
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarAvancesPendientes() {
    console.log('🔄 Cargando avances pendientes...');
    console.log('📍 URL base:', API_URL);
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchPendientes')?.value.toLowerCase() || '';
        
        // Agregar timestamp para evitar caché
        const timestamp = new Date().getTime();
        const url = `${API_URL}/pendientes?_=${timestamp}`;
        console.log(`📡 URL completa: ${url}`);
        
        const response = await fetch(url, {
            headers: getAuthHeaders(),
            cache: 'no-cache',
            pragma: 'no-cache'
        });
        
        console.log(`📊 Response status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Respuesta de error:', errorText.substring(0, 500));
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📦 Datos recibidos:', data);

        if (data.success) {
            let avances = data.avances || [];
            console.log(`✅ Avances encontrados: ${avances.length}`);
            
            if (search) {
                avances = avances.filter(a => 
                    (a.titulo || '').toLowerCase().includes(search) ||
                    (a.tecnico_nombre || '').toLowerCase().includes(search) ||
                    (a.orden_codigo || '').toLowerCase().includes(search)
                );
                console.log(`🔍 Filtrados por búsqueda: ${avances.length}`);
            }
            
            avancesPendientes = avances;
            renderizarAvancesPendientes();
            
            const badge = document.getElementById('pendientesCount');
            if (badge) badge.textContent = avancesPendientes.length;
        } else {
            console.error('❌ Error en respuesta:', data.error);
            showToast(data.error || 'Error al cargar avances pendientes', 'error');
        }
    } catch (error) {
        console.error('❌ Error detallado:', error);
        console.error('❌ Stack trace:', error.stack);
        showToast('Error al cargar avances pendientes: ' + error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cargarAvancesProcesados() {
    console.log('🔄 Cargando avances procesados...');
    mostrarLoading(true);
    
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchAprobados')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/procesados`;
        if (estado !== 'all') url += `?estado=${estado}`;
        
        console.log(`📡 URL llamada: ${url}`);
        
        const response = await fetch(url, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });
        
        console.log(`📊 Response status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Datos recibidos:', data);

        if (data.success) {
            let avances = data.avances || [];
            console.log(`✅ Avances procesados encontrados: ${avances.length}`);
            
            if (search) {
                avances = avances.filter(a => 
                    (a.titulo || '').toLowerCase().includes(search) ||
                    (a.tecnico_nombre || '').toLowerCase().includes(search) ||
                    (a.orden_codigo || '').toLowerCase().includes(search)
                );
            }
            
            avancesProcesados = avances;
            renderizarAvancesProcesados();
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error al cargar avances procesados', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZADO
// =====================================================

function renderizarAvancesPendientes() {
    const container = document.getElementById('avancesPendientesContainer');
    if (!container) return;

    console.log(`🎨 Renderizando ${avancesPendientes.length} avances pendientes`);

    if (avancesPendientes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>No hay avances pendientes de revisión</p>
            </div>
        `;
        return;
    }

    container.innerHTML = avancesPendientes.map(avance => {
        let fotosPreview = '';
        if (avance.fotos && avance.fotos.length > 0) {
            fotosPreview = avance.fotos.slice(0, 3).map(f => `
                <img src="${f.url}" class="avance-foto-mini" onclick="event.stopPropagation(); verFotoAmpliada('${f.url}')">
            `).join('');
            if (avance.fotos.length > 3) {
                fotosPreview += `<span class="avance-foto-mas">+${avance.fotos.length - 3}</span>`;
            }
        }

        return `
            <div class="avance-card">
                <div class="avance-card-header">
                    <span class="avance-titulo">${escapeHtml(avance.titulo)}</span>
                    <span class="avance-fecha">${formatDate(avance.fecha_creacion)}</span>
                </div>
                <div class="avance-card-body">
                    <div class="avance-descripcion">${escapeHtml(avance.descripcion || 'Sin descripción')}</div>
                    <div class="avance-fotos">${fotosPreview}</div>
                    <div class="avance-info-row">
                        <span class="avance-tecnico"><i class="fas fa-user"></i> ${escapeHtml(avance.tecnico_nombre)}</span>
                        <span class="avance-orden"><i class="fas fa-tag"></i> ${escapeHtml(avance.orden_codigo)}</span>
                    </div>
                </div>
                <div class="avance-card-footer">
                    <button class="action-btn view" onclick="verDetalleAvance(${avance.id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    <button class="action-btn approve" onclick="abrirModalAprobar(${avance.id})">
                        <i class="fas fa-check-circle"></i> Aprobar
                    </button>
                    <button class="action-btn reject" onclick="abrirModalRechazar(${avance.id})">
                        <i class="fas fa-times-circle"></i> Rechazar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarAvancesProcesados() {
    const container = document.getElementById('avancesAprobadosContainer');
    if (!container) return;

    console.log(`🎨 Renderizando ${avancesProcesados.length} avances procesados`);

    if (avancesProcesados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-archive"></i>
                <p>No hay avances procesados</p>
            </div>
        `;
        return;
    }

    container.innerHTML = avancesProcesados.map(avance => {
        let fotosPreview = '';
        if (avance.fotos && avance.fotos.length > 0) {
            fotosPreview = avance.fotos.slice(0, 3).map(f => `
                <img src="${f.url}" class="avance-foto-mini" onclick="event.stopPropagation(); verFotoAmpliada('${f.url}')">
            `).join('');
            if (avance.fotos.length > 3) {
                fotosPreview += `<span class="avance-foto-mas">+${avance.fotos.length - 3}</span>`;
            }
        }

        return `
            <div class="avance-card">
                <div class="avance-card-header">
                    <span class="avance-titulo">${escapeHtml(avance.titulo)}</span>
                    <span class="avance-fecha">${formatDate(avance.fecha_creacion)}</span>
                </div>
                <div class="avance-card-body">
                    <div class="avance-descripcion">${escapeHtml(avance.descripcion || 'Sin descripción')}</div>
                    <div class="avance-fotos">${fotosPreview}</div>
                    <div class="avance-info-row">
                        <span class="avance-tecnico"><i class="fas fa-user"></i> ${escapeHtml(avance.tecnico_nombre)}</span>
                        <span class="avance-orden"><i class="fas fa-tag"></i> ${escapeHtml(avance.orden_codigo)}</span>
                    </div>
                    ${avance.comentario_revision ? `
                        <div class="avance-info-row" style="margin-top: 0.5rem;">
                            <span style="font-size: 0.7rem; color: var(--gris-texto);">
                                <i class="fas fa-comment"></i> ${escapeHtml(avance.comentario_revision)}
                            </span>
                        </div>
                    ` : ''}
                </div>
                <div class="avance-card-footer">
                    ${statusBadge(avance.estado)}
                    <button class="action-btn view" onclick="verDetalleAvance(${avance.id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// VER DETALLE AVANCE
// =====================================================

window.verDetalleAvance = async function(avanceId) {
    console.log(`🔍 Ver detalle del avance ${avanceId}`);
    mostrarLoading(true);
    
    try {
        const url = `${API_URL}/detalle/${avanceId}`;
        console.log(`📡 URL: ${url}`);
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        console.log(`📊 Response status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Datos recibidos:', data);

        if (!data.success) {
            showToast(data.error || 'Error al cargar detalle', 'error');
            return;
        }

        const avance = data.avance;
        
        const fotosHtml = avance.fotos && avance.fotos.length > 0 ? `
            <div class="detalle-fotos-grid">
                ${avance.fotos.map(foto => `
                    <div class="detalle-foto-item">
                        <img src="${foto.url}" onclick="verFotoAmpliada('${foto.url}')">
                        <div class="detalle-foto-comentario">${escapeHtml(foto.comentario || 'Sin comentario')}</div>
                    </div>
                `).join('')}
            </div>
        ` : '<p>No hay fotos registradas</p>';

        const modalBody = document.getElementById('detalleAvanceBody');
        modalBody.innerHTML = `
            <div class="orden-info-card">
                <p><strong><i class="fas fa-tag"></i> Título:</strong> ${escapeHtml(avance.titulo)}</p>
                <p><strong><i class="fas fa-align-left"></i> Descripción:</strong> ${escapeHtml(avance.descripcion || 'Sin descripción')}</p>
                <p><strong><i class="fas fa-user"></i> Técnico:</strong> ${escapeHtml(avance.tecnico_nombre)}</p>
                <p><strong><i class="fas fa-clipboard-list"></i> Orden:</strong> ${escapeHtml(avance.orden_codigo)}</p>
                <p><strong><i class="fas fa-calendar"></i> Fecha:</strong> ${formatDate(avance.fecha_creacion)}</p>
                <p><strong><i class="fas fa-chart-line"></i> Estado:</strong> ${statusBadge(avance.estado)}</p>
                ${avance.comentario_revision ? `<p><strong><i class="fas fa-comment"></i> Comentario de revisión:</strong> ${escapeHtml(avance.comentario_revision)}</p>` : ''}
                ${avance.fecha_aprobacion ? `<p><strong><i class="fas fa-check-circle"></i> Fecha de aprobación:</strong> ${formatDate(avance.fecha_aprobacion)}</p>` : ''}
            </div>
            <div class="fotos-section">
                <h4><i class="fas fa-images"></i> Fotos del avance (${avance.fotos?.length || 0})</h4>
                ${fotosHtml}
            </div>
        `;

        abrirModal('modalDetalleAvance');
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error al cargar detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
};

window.verFotoAmpliada = function(url) {
    document.getElementById('fotoAmpliada').src = url;
    const modal = document.getElementById('modalFoto');
    if (modal) modal.classList.add('show');
};

function cerrarModalFoto() {
    const modal = document.getElementById('modalFoto');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// APROBAR AVANCE
// =====================================================

let currentAvanceId = null;

window.abrirModalAprobar = async function(avanceId) {
    const avance = avancesPendientes.find(a => a.id === avanceId);
    if (!avance) return;
    
    console.log(`📝 Abriendo modal para aprobar avance ${avanceId}`);
    currentAvanceId = avanceId;
    
    const infoContainer = document.getElementById('aprobarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Título:</strong> ${escapeHtml(avance.titulo)}</p>
        <p><strong><i class="fas fa-user"></i> Técnico:</strong> ${escapeHtml(avance.tecnico_nombre)}</p>
        <p><strong><i class="fas fa-clipboard-list"></i> Orden:</strong> ${escapeHtml(avance.orden_codigo)}</p>
        <p><strong><i class="fas fa-images"></i> Fotos:</strong> ${avance.fotos?.length || 0} fotos</p>
    `;
    
    document.getElementById('comentarioAprobacion').value = '';
    abrirModal('modalAprobar');
};

window.confirmarAprobar = async function() {
    const comentario = document.getElementById('comentarioAprobacion')?.value || '';
    console.log(`✅ Confirmando aprobación del avance ${currentAvanceId} con comentario: "${comentario}"`);
    
    mostrarLoading(true);
    try {
        const url = `${API_URL}/aprobar/${currentAvanceId}`;
        console.log(`📡 PUT ${url}`);
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comentario: comentario })
        });
        
        const data = await response.json();
        console.log('📦 Respuesta:', data);
        
        if (data.success) {
            showToast('✅ Avance aprobado correctamente', 'success');
            cerrarModal('modalAprobar');
            await cargarAvancesPendientes();
            await cargarAvancesProcesados();
        } else {
            showToast(data.error || 'Error al aprobar', 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// RECHAZAR AVANCE
// =====================================================

window.abrirModalRechazar = async function(avanceId) {
    const avance = avancesPendientes.find(a => a.id === avanceId);
    if (!avance) return;
    
    console.log(`📝 Abriendo modal para rechazar avance ${avanceId}`);
    currentAvanceId = avanceId;
    
    const infoContainer = document.getElementById('rechazarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Título:</strong> ${escapeHtml(avance.titulo)}</p>
        <p><strong><i class="fas fa-user"></i> Técnico:</strong> ${escapeHtml(avance.tecnico_nombre)}</p>
        <p><strong><i class="fas fa-clipboard-list"></i> Orden:</strong> ${escapeHtml(avance.orden_codigo)}</p>
        <p><strong><i class="fas fa-images"></i> Fotos:</strong> ${avance.fotos?.length || 0} fotos</p>
    `;
    
    document.getElementById('motivoRechazo').value = '';
    abrirModal('modalRechazar');
};

window.confirmarRechazar = async function() {
    const motivo = document.getElementById('motivoRechazo')?.value.trim();
    
    if (!motivo) {
        showToast('Debes escribir el motivo del rechazo', 'warning');
        return;
    }
    
    console.log(`❌ Confirmando rechazo del avance ${currentAvanceId} con motivo: "${motivo}"`);
    
    mostrarLoading(true);
    try {
        const url = `${API_URL}/rechazar/${currentAvanceId}`;
        console.log(`📡 PUT ${url}`);
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ motivo: motivo })
        });
        
        const data = await response.json();
        console.log('📦 Respuesta:', data);
        
        if (data.success) {
            showToast('✅ Avance rechazado. El técnico ha sido notificado.', 'success');
            cerrarModal('modalRechazar');
            await cargarAvancesPendientes();
            await cargarAvancesProcesados();
        } else {
            showToast(data.error || 'Error al rechazar', 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    console.log('🔐 Verificando autenticación...');
    
    try {
        token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ No hay token');
            window.location.href = '/';
            return null;
        }
        
        console.log('✅ Token encontrado');

        const response = await fetch(`${API_URL}/verify-token`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        console.log('📦 Verify token response:', data);

        if (data.success && data.user) {
            currentUser = data.user;
        } else {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');
            currentUser = {
                id: payload.user?.id || payload.id || userData?.id,
                nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
                roles: payload.user?.roles || payload.roles || userData?.roles || []
            };
        }

        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.textContent = new Date().toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
    } catch (error) {
        console.error('❌ Error:', error);
        window.location.href = '/';
        return null;
    }
}

function logout() {
    console.log('🚪 Cerrando sesión...');
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    console.log('🔧 Configurando event listeners...');
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
            
            if (tabId === 'tab-aprobados') {
                cargarAvancesProcesados();
            }
        });
    });
    
    const refreshPendientes = document.getElementById('refreshPendientesBtn');
    if (refreshPendientes) {
        refreshPendientes.addEventListener('click', () => cargarAvancesPendientes());
    }
    
    const refreshAprobados = document.getElementById('refreshAprobadosBtn');
    if (refreshAprobados) {
        refreshAprobados.addEventListener('click', () => cargarAvancesProcesados());
    }
    
    const searchPendientes = document.getElementById('searchPendientes');
    if (searchPendientes) {
        searchPendientes.addEventListener('input', () => cargarAvancesPendientes());
    }
    
    const searchAprobados = document.getElementById('searchAprobados');
    if (searchAprobados) {
        searchAprobados.addEventListener('input', () => cargarAvancesProcesados());
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarAvancesProcesados());
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
    
    // Botones de confirmación
    const btnAprobar = document.getElementById('btnConfirmarAprobar');
    if (btnAprobar) {
        btnAprobar.addEventListener('click', confirmarAprobar);
    }
    
    const btnRechazar = document.getElementById('btnConfirmarRechazar');
    if (btnRechazar) {
        btnRechazar.addEventListener('click', confirmarRechazar);
    }
    
    console.log('✅ Event listeners configurados');
}

async function inicializar() {
    console.log('🚀 Inicializando gestion_avances.js (Jefe de Taller)');
    console.log(`📡 API_URL: ${API_URL}`);
    
    const user = await cargarUsuarioActual();
    if (!user) {
        console.error('❌ No se pudo autenticar usuario');
        return;
    }
    
    await cargarAvancesPendientes();
    await cargarAvancesProcesados();
    setupEventListeners();
    
    console.log('✅ gestion_avances.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalleAvance = verDetalleAvance;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarModalFoto = cerrarModalFoto;
window.abrirModalAprobar = abrirModalAprobar;
window.confirmarAprobar = confirmarAprobar;
window.abrirModalRechazar = abrirModalRechazar;
window.confirmarRechazar = confirmarRechazar;
window.cerrarModal = cerrarModal;
window.logout = logout;

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}