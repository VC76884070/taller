// =====================================================
// CONFIGURACIÓN DE API - FUNCIONA EN LOCAL Y PRODUCCIÓN
// =====================================================
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Modo DESARROLLO - Usando localhost:5000');
        return 'http://localhost:5000';
    }
    console.log('📡 Modo PRODUCCIÓN - Usando URL relativa');
    return '';
})();

// =====================================================
// SOLICITUDES_COTIZACION.JS - ENCARGADO DE REPUESTOS
// VERSIÓN OPTIMIZADA - ÚLTIMAS 10 + PAGINACIÓN + CACHÉ
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = API_BASE_URL + '/api/encargado-repuestos';

// Configuración de paginación
const PAGE_SIZE = 10;  // ← SOLO 10 POR PÁGINA
const MAX_CACHE_AGE = 30000; // 30 segundos de caché

// Estado global
let currentUser = null;
let solicitudesCache = {
    data: null,
    timestamp: 0,
    currentPage: 1,
    totalPages: 1,
    totalItems: 0
};
let currentFilters = {
    estado: 'all',
    search: '',
    page: 1
};
let isLoading = false;

// =====================================================
// UTILIDADES OPTIMIZADAS
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    if (!token) token = sessionStorage.getItem('token');
    
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function formatDateTime(dateStr) {
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
    }, 3500);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
    isLoading = mostrar;
}

function statusBadge(estado) {
    const map = {
        'pendiente': 'status-pendiente',
        'cotizado': 'status-cotizado',
        'aprobado': 'status-aprobado',
        'rechazado': 'status-rechazado'
    };
    
    const texto = {
        'pendiente': 'Pendiente',
        'cotizado': 'Cotizado',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">${texto[estado] || estado}</span>`;
}

// Debounce para búsqueda (evita muchas peticiones)
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

// =====================================================
// CARGA OPTIMIZADA DE SOLICITUDES (SOLO ÚLTIMAS 10)
// =====================================================

async function cargarSolicitudes(resetPage = true) {
    if (isLoading) return;
    
    if (resetPage) {
        currentFilters.page = 1;
    }
    
    mostrarLoading(true);
    
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        // Actualizar filtros actuales
        currentFilters.estado = estado;
        currentFilters.search = search;
        
        // Construir URL con parámetros de paginación
        let url = `${API_URL}/solicitudes-cotizacion?page=${currentFilters.page}&limit=${PAGE_SIZE}`;
        if (estado !== 'all') url += `&estado=${estado}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders(),
            // Cache: fuerza a no usar caché del navegador
            cache: 'no-cache'
        });
        
        if (response.status === 401) {
            showToast('Sesión expirada, redirigiendo...', 'warning');
            setTimeout(() => { window.location.href = API_BASE_URL + '/'; }, 1500);
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Actualizar caché
            solicitudesCache = {
                data: data.solicitudes || [],
                timestamp: Date.now(),
                currentPage: data.pagination?.current_page || 1,
                totalPages: data.pagination?.total_pages || 1,
                totalItems: data.pagination?.total || 0
            };
            
            renderizarSolicitudes(solicitudesCache.data);
            renderizarPaginacion();
            
            // Mostrar info de cantidad
            const container = document.getElementById('solicitudesContainer');
            if (container && solicitudesCache.totalItems > 0) {
                const infoHtml = `
                    <div class="pagination-info">
                        <i class="fas fa-info-circle"></i> 
                        Mostrando ${solicitudesCache.data.length} de ${solicitudesCache.totalItems} solicitudes
                        ${solicitudesCache.totalItems > PAGE_SIZE ? ` (Página ${solicitudesCache.currentPage} de ${solicitudesCache.totalPages})` : ''}
                    </div>
                `;
                // Insertar al inicio del container
                const firstChild = container.firstChild;
                if (firstChild && firstChild.classList?.contains('pagination-info')) {
                    firstChild.innerHTML = infoHtml;
                } else {
                    container.insertAdjacentHTML('afterbegin', infoHtml);
                }
            }
        } else {
            showToast(data.error || 'Error al cargar solicitudes', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarSolicitudes(solicitudes) {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;
    
    if (!solicitudes || solicitudes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay solicitudes de cotización</p>
                <small>Las solicitudes aparecerán aquí cuando el Jefe de Taller las cree</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = solicitudes.map((solicitud, index) => {
        // Parsear items
        let items = solicitud.items || [];
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
        }
        
        const itemsHtml = items.slice(0, 3).map(item => `  
            <div class="item-row-solicitud">
                <div class="item-desc">${escapeHtml(item.descripcion)}</div>
                <div class="item-cant">${item.cantidad} uds</div>
            </div>
        `).join('');
        
        const tieneMasItems = items.length > 3;
        
        const puedeCotizar = solicitud.estado === 'pendiente';
        
        return `
            <div class="solicitud-card" data-id="${solicitud.id}" style="animation-delay: ${Math.min(index * 0.03, 0.3)}s">
                <div class="solicitud-header">
                    <h3><i class="fas fa-file-invoice"></i> Solicitud #${solicitud.id}</h3>
                    ${statusBadge(solicitud.estado)}
                </div>
                <div class="solicitud-body">
                    <div class="orden-info">
                        <div class="orden-info-item">
                            <label><i class="fas fa-hashtag"></i> OT</label>
                            <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
                        </div>
                        <div class="orden-info-item">
                            <label><i class="fas fa-car"></i> Vehículo</label>
                            <span>${escapeHtml(solicitud.vehiculo?.substring(0, 30) || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <label><i class="fas fa-calendar"></i> Fecha</label>
                            <span>${formatDate(solicitud.fecha_solicitud)}</span>
                        </div>
                    </div>
                    
                    <div class="items-list">
                        <h4><i class="fas fa-cubes"></i> Items solicitados (${items.length}):</h4>
                        ${itemsHtml}
                        ${tieneMasItems ? `<div class="more-items">+ ${items.length - 3} items más</div>` : ''}
                    </div>
                    
                    ${solicitud.precio_cotizado ? `
                        <div class="precio-cotizado-box">
                            <strong><i class="fas fa-tag"></i> Precio cotizado:</strong>
                            <span class="precio-valor">Bs. ${solicitud.precio_cotizado.toFixed(2)}</span>
                        </div>
                    ` : ''}
                    
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="verDetalle(${solicitud.id})" title="Ver Detalle">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        ${puedeCotizar ? `
                            <button class="action-btn cotizar" onclick="abrirModalCotizar(${solicitud.id})" title="Cotizar">
                                <i class="fas fa-tags"></i> Cotizar
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarPaginacion() {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;
    
    if (solicitudesCache.totalPages <= 1) return;
    
    const paginationHtml = `
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="cambiarPagina(${solicitudesCache.currentPage - 1})" 
                ${solicitudesCache.currentPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i> Anterior
            </button>
            <span class="pagination-current">
                Página ${solicitudesCache.currentPage} de ${solicitudesCache.totalPages}
            </span>
            <button class="pagination-btn" onclick="cambiarPagina(${solicitudesCache.currentPage + 1})"
                ${solicitudesCache.currentPage === solicitudesCache.totalPages ? 'disabled' : ''}>
                Siguiente <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', paginationHtml);
}

function cambiarPagina(page) {
    if (page < 1 || page > solicitudesCache.totalPages) return;
    if (page === solicitudesCache.currentPage) return;
    
    currentFilters.page = page;
    cargarSolicitudes(false); // No resetear página
}

// =====================================================
// COTIZAR SOLICITUD (OPTIMIZADO)
// =====================================================

let currentSolicitudId = null;

async function abrirModalCotizar(idSolicitud) {
    // Buscar en caché primero
    let solicitud = solicitudesCache.data?.find(s => s.id === idSolicitud);
    
    // Si no está en caché, cargar individualmente
    if (!solicitud) {
        mostrarLoading(true);
        try {
            const response = await fetch(`${API_URL}/solicitudes-cotizacion/${idSolicitud}`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                solicitud = data.solicitud;
            } else {
                showToast('No se encontró la solicitud', 'error');
                return;
            }
        } catch (error) {
            showToast('Error al cargar la solicitud', 'error');
            return;
        } finally {
            mostrarLoading(false);
        }
    }
    
    if (!solicitud) {
        showToast('No se encontró la solicitud', 'error');
        return;
    }
    
    currentSolicitudId = idSolicitud;
    
    // Parsear items
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    // Limitar a mostrar solo los items (no hay problema, es un modal)
    const itemsHtml = items.map((item, idx) => `
        <div class="precio-item-row">
            <div class="precio-item-desc">
                <strong>${escapeHtml(item.descripcion)}</strong>
                <small>(x${item.cantidad} uds)</small>
            </div>
            <div class="precio-item-input">
                <label>Precio unitario (Bs.):</label>
                <input type="number" id="precio_item_${idx}" class="precio-input" step="0.01" min="0" placeholder="0.00">
                <span class="total-hint">Total: Bs. <span id="total_item_${idx}" class="total-item">0.00</span></span>
            </div>
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalCotizarBody');
    modalBody.innerHTML = `
        <div class="orden-info" style="margin-bottom: 1.5rem;">
            <div class="orden-info-item">
                <label><i class="fas fa-hashtag"></i> Solicitud #${solicitud.id}</label>
                <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-car"></i> Vehículo</label>
                <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
            </div>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
            <h4>Items a cotizar (${items.length}):</h4>
            ${itemsHtml}
        </div>
        
        <div class="form-group">
            <label><i class="fas fa-truck"></i> Proveedor *</label>
            <input type="text" id="proveedorInfo" class="form-control" placeholder="Ej: Autoparts Bolivia" autocomplete="off">
        </div>
        
        <div class="form-group">
            <label><i class="fas fa-sticky-note"></i> Observaciones</label>
            <textarea id="respuestaEncargado" class="form-control" rows="2" placeholder="Notas sobre la cotización..."></textarea>
        </div>
        
        <div class="modal-actions">
            <button class="btn-secondary" onclick="cerrarModal('modalCotizar')">Cancelar</button>
            <button class="btn-cotizar" onclick="enviarCotizacion()">Enviar Cotización</button>
        </div>
    `;
    
    // Agregar eventos de cálculo
    setTimeout(() => {
        items.forEach((item, idx) => {
            const precioInput = document.getElementById(`precio_item_${idx}`);
            if (precioInput) {
                precioInput.addEventListener('input', function() {
                    const totalSpan = document.getElementById(`total_item_${idx}`);
                    if (totalSpan) {
                        const precio = parseFloat(this.value) || 0;
                        const total = precio * item.cantidad;
                        totalSpan.textContent = total.toFixed(2);
                        totalSpan.style.color = precio > 0 ? 'var(--verde-exito)' : 'var(--gris-texto)';
                    }
                });
            }
        });
        
        const firstInput = document.getElementById('precio_item_0');
        if (firstInput) firstInput.focus();
    }, 100);
    
    abrirModal('modalCotizar');
}

async function enviarCotizacion() {
    // Buscar solicitud en caché
    const solicitud = solicitudesCache.data?.find(s => s.id === currentSolicitudId);
    if (!solicitud) {
        showToast('Error: No se encontró la solicitud', 'error');
        return;
    }
    
    // Parsear items
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    let precioTotal = 0;
    let itemsConPrecio = 0;
    
    for (let i = 0; i < items.length; i++) {
        const precioInput = document.getElementById(`precio_item_${i}`);
        if (precioInput && precioInput.value) {
            const precioUnitario = parseFloat(precioInput.value);
            if (!isNaN(precioUnitario) && precioUnitario > 0) {
                precioTotal += precioUnitario * items[i].cantidad;
                itemsConPrecio++;
            }
        }
    }
    
    if (precioTotal === 0 || itemsConPrecio === 0) {
        showToast('Ingrese al menos un precio válido', 'warning');
        return;
    }
    
    const proveedorInfo = document.getElementById('proveedorInfo')?.value.trim() || '';
    if (!proveedorInfo) {
        showToast('Indique el nombre del proveedor', 'warning');
        return;
    }
    
    const respuesta = document.getElementById('respuestaEncargado')?.value.trim() || '';
    
    if (!confirm(`Confirmar cotización:\nProveedor: ${proveedorInfo}\nTotal: Bs. ${precioTotal.toFixed(2)}`)) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion/${currentSolicitudId}/cotizar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                precio_cotizado: precioTotal,
                proveedor_info: proveedorInfo,
                respuesta_encargado: respuesta
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`Cotización enviada - Total: Bs. ${precioTotal.toFixed(2)}`, 'success');
            cerrarModal('modalCotizar');
            // Recargar solicitudes (resetear caché)
            solicitudesCache.timestamp = 0;
            await cargarSolicitudes(true);
        } else {
            showToast(data.error || 'Error al enviar cotización', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE
// =====================================================

async function verDetalle(idSolicitud) {
    let solicitud = solicitudesCache.data?.find(s => s.id === idSolicitud);
    
    if (!solicitud) {
        mostrarLoading(true);
        try {
            const response = await fetch(`${API_URL}/solicitudes-cotizacion/${idSolicitud}`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                solicitud = data.solicitud;
            }
        } catch (error) {
            showToast('Error al cargar detalle', 'error');
            return;
        } finally {
            mostrarLoading(false);
        }
    }
    
    if (!solicitud) {
        showToast('No se encontró la solicitud', 'error');
        return;
    }
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map(item => `
        <div class="item-row-solicitud">
            <div class="item-desc">${escapeHtml(item.descripcion)}</div>
            <div class="item-cant">${item.cantidad} uds</div>
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalDetalleBody');
    modalBody.innerHTML = `
        <div class="orden-info">
            <div class="orden-info-item">
                <label>Solicitud #${solicitud.id}</label>
                <span>${statusBadge(solicitud.estado)}</span>
            </div>
            <div class="orden-info-item">
                <label>Orden de Trabajo</label>
                <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
            </div>
            <div class="orden-info-item">
                <label>Vehículo</label>
                <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
            </div>
            <div class="orden-info-item">
                <label>Fecha Solicitud</label>
                <span>${formatDateTime(solicitud.fecha_solicitud)}</span>
            </div>
        </div>
        
        <div class="items-list">
            <h4>Items solicitados (${items.length}):</h4>
            ${itemsHtml}
        </div>
        
        ${solicitud.observacion_jefe_taller ? `
            <div class="observacion-box">
                <small><i class="fas fa-comment-dots"></i> Observación:</small>
                <p>${escapeHtml(solicitud.observacion_jefe_taller)}</p>
            </div>
        ` : ''}
        
        ${solicitud.precio_cotizado ? `
            <div class="precio-cotizado-box">
                <strong>Precio cotizado:</strong>
                <span class="precio-valor">Bs. ${solicitud.precio_cotizado.toFixed(2)}</span>
                ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
                ${solicitud.respuesta_encargado ? `<br><strong>Notas:</strong> ${escapeHtml(solicitud.respuesta_encargado)}` : ''}
            </div>
        ` : ''}
        
        <div class="modal-actions">
            <button class="btn-secondary" onclick="cerrarModal('modalDetalle')">Cerrar</button>
            ${solicitud.estado === 'pendiente' ? `
                <button class="btn-cotizar" onclick="cerrarModal('modalDetalle'); abrirModalCotizar(${solicitud.id})">
                    Cotizar ahora
                </button>
            ` : ''}
        </div>
    `;
    
    abrirModal('modalDetalle');
}

// =====================================================
// AUTENTICACIÓN E INICIALIZACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = API_BASE_URL + '/';
            return null;
        }
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        let userData = null;
        try {
            const userStr = localStorage.getItem('furia_user');
            if (userStr) userData = JSON.parse(userStr);
        } catch (e) {}
        
        currentUser = {
            id: payload.user?.id || payload.id || payload.user_id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email,
            roles: payload.user?.roles || payload.roles || userData?.roles || [],
            rol_principal: payload.user?.rol_principal || payload.rol_principal || userData?.rol_principal
        };
        
        const tieneRolRepuestos = currentUser.roles?.includes('encargado_repuestos') || 
                                    currentUser.roles?.includes('encargado_rep_almacen');
        
        if (!tieneRolRepuestos) {
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => { window.location.href = API_BASE_URL + '/'; }, 2000);
            return null;
        }
        
        return currentUser;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = API_BASE_URL + '/';
        return null;
    }
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            solicitudesCache.timestamp = 0; // Invalidar caché
            cargarSolicitudes(true);
            showToast('Actualizando lista...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarSolicitudes(true));
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(() => cargarSolicitudes(true), 500);
        searchInput.addEventListener('input', debouncedSearch);
    }
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModal(modal.id);
        });
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                cerrarModal(modal.id);
            });
        }
    });
}

async function inicializar() {
    console.log('🚀 Inicializando solicitudes_cotizacion.js (Optimizado)');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    // Mostrar fecha
    const fechaElement = document.getElementById('currentDate');
    if (fechaElement) {
        const hoy = new Date();
        fechaElement.textContent = hoy.toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    await cargarSolicitudes(true);
    setupEventListeners();
    
    // Refresh automático cada 60 segundos (menos frecuente)
    setInterval(() => {
        if (!document.querySelector('.modal.active') && !isLoading) {
            // Solo refrescar si la caché tiene más de 60 segundos
            if (Date.now() - solicitudesCache.timestamp > 60000) {
                cargarSolicitudes(true);
            }
        }
    }, 60000);
    
    console.log('✅ solicitudes_cotizacion.js optimizado cargado');
}

// Exponer funciones globales
window.verDetalle = verDetalle;
window.abrirModalCotizar = abrirModalCotizar;
window.enviarCotizacion = enviarCotizacion;
window.cerrarModal = cerrarModal;
window.cambiarPagina = cambiarPagina;

document.addEventListener('DOMContentLoaded', inicializar);