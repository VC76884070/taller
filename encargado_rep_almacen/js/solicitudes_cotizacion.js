// =====================================================
// SOLICITUDES_COTIZACION.JS - ENCARGADO DE REPUESTOS
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/encargado-repuestos';
let currentUser = null;
let currentUserRoles = [];
let solicitudesPendientes = [];

// =====================================================
// FUNCIONES DE UTILIDAD
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
    }, 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
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
        'cotizado': 'status-aprobado',
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

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarSolicitudes() {
    mostrarLoading(true);
    
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/solicitudes-cotizacion`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            let solicitudes = data.solicitudes || [];
            
            // Filtrar por búsqueda
            if (search) {
                solicitudes = solicitudes.filter(s => 
                    (s.orden_codigo || '').toLowerCase().includes(search) ||
                    (s.descripcion_pieza || '').toLowerCase().includes(search) ||
                    (s.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            solicitudesPendientes = solicitudes;
            renderizarSolicitudes(solicitudes);
        } else {
            showToast(data.error || 'Error al cargar solicitudes', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarSolicitudes(solicitudes) {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;
    
    if (solicitudes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay solicitudes de cotización</p>
                <small>Las solicitudes aparecerán aquí cuando el Jefe de Taller las cree</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = solicitudes.map(solicitud => {
        // Parsear items
        let items = solicitud.items || [];
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
        }
        
        const itemsHtml = items.map(item => `
            <div class="item-row-solicitud">
                <div class="item-desc">${escapeHtml(item.descripcion)}</div>
                <div class="item-cant">${item.cantidad} uds</div>
                <div class="item-detalle">${escapeHtml(item.detalle || '')}</div>
            </div>
        `).join('');
        
        const puedeCotizar = solicitud.estado === 'pendiente';
        const puedeVer = true;
        
        return `
            <div class="solicitud-card" data-id="${solicitud.id}">
                <div class="solicitud-header">
                    <h3><i class="fas fa-file-invoice"></i> Solicitud #${solicitud.id}</h3>
                    ${statusBadge(solicitud.estado)}
                </div>
                <div class="solicitud-body">
                    <div class="orden-info">
                        <div class="orden-info-item">
                            <label>Orden de Trabajo</label>
                            <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
                        </div>
                        <div class="orden-info-item">
                            <label>Vehículo</label>
                            <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <label>Servicio</label>
                            <span>${escapeHtml(solicitud.servicio_descripcion || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <label>Fecha Solicitud</label>
                            <span>${formatDate(solicitud.fecha_solicitud)}</span>
                        </div>
                    </div>
                    
                    <div class="items-list">
                        <h4><i class="fas fa-cubes"></i> Items solicitados:</h4>
                        ${itemsHtml}
                    </div>
                    
                    ${solicitud.observacion_jefe_taller ? `
                        <div style="background: var(--gris-claro); padding: 0.75rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                            <small><i class="fas fa-comment"></i> Observación del Jefe de Taller:</small>
                            <p style="margin-top: 0.25rem;">${escapeHtml(solicitud.observacion_jefe_taller)}</p>
                        </div>
                    ` : ''}
                    
                    ${solicitud.precio_cotizado ? `
                        <div style="background: rgba(16, 185, 129, 0.1); padding: 0.75rem; border-radius: var(--radius-md); margin-bottom: 1rem; border-left: 3px solid var(--verde-exito);">
                            <strong><i class="fas fa-tag"></i> Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                            ${solicitud.proveedor_info ? `<br><small>Proveedor: ${escapeHtml(solicitud.proveedor_info)}</small>` : ''}
                        </div>
                    ` : ''}
                    
                    <div class="action-buttons" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="action-btn view" onclick="verDetalle(${solicitud.id})" title="Ver Detalle">
                            <i class="fas fa-eye"></i>
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

// =====================================================
// COTIZAR SOLICITUD
// =====================================================

let currentSolicitudId = null;

async function abrirModalCotizar(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;
    
    currentSolicitudId = idSolicitud;
    
    // Parsear items
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map((item, idx) => `
        <div style="margin-bottom: 1rem; padding: 0.5rem; background: var(--gris-claro); border-radius: var(--radius-sm);">
            <div><strong>${escapeHtml(item.descripcion)}</strong> - Cantidad: ${item.cantidad}</div>
            ${item.detalle ? `<div style="font-size: 0.8rem; color: var(--gris-medio);">${escapeHtml(item.detalle)}</div>` : ''}
            <div style="margin-top: 0.5rem;">
                <label>Precio unitario (Bs.):</label>
                <input type="number" id="precio_item_${idx}" class="precio-input" step="0.01" min="0" style="width: 150px; margin-left: 0.5rem;">
            </div>
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalCotizarBody');
    modalBody.innerHTML = `
        <div class="orden-info" style="margin-bottom: 1rem;">
            <div class="orden-info-item">
                <label>Orden</label>
                <span><strong>${escapeHtml(solicitud.orden_codigo)}</strong></span>
            </div>
            <div class="orden-info-item">
                <label>Vehículo</label>
                <span>${escapeHtml(solicitud.vehiculo)}</span>
            </div>
        </div>
        
        <h4>Items a cotizar:</h4>
        ${itemsHtml}
        
        <div class="form-group" style="margin-top: 1rem;">
            <label>Proveedor</label>
            <input type="text" id="proveedorInfo" class="form-control" placeholder="Nombre del proveedor">
        </div>
        
        <div class="form-group">
            <label>Observaciones (opcional)</label>
            <textarea id="respuestaEncargado" class="form-control" rows="3" placeholder="Notas sobre la cotización..."></textarea>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem;">
            <button class="btn-secondary" onclick="cerrarModal('modalCotizar')">Cancelar</button>
            <button class="btn-cotizar" onclick="enviarCotizacion()">
                <i class="fas fa-paper-plane"></i> Enviar Cotización
            </button>
        </div>
    `;
    
    abrirModal('modalCotizar');
}

async function enviarCotizacion() {
    const solicitud = solicitudesPendientes.find(s => s.id === currentSolicitudId);
    if (!solicitud) return;
    
    // Calcular precio total basado en items
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    let precioTotal = 0;
    for (let i = 0; i < items.length; i++) {
        const precioInput = document.getElementById(`precio_item_${i}`);
        if (precioInput && precioInput.value) {
            precioTotal += parseFloat(precioInput.value) * items[i].cantidad;
        }
    }
    
    if (precioTotal === 0) {
        showToast('Ingrese al menos un precio', 'error');
        return;
    }
    
    const proveedorInfo = document.getElementById('proveedorInfo')?.value || '';
    const respuesta = document.getElementById('respuestaEncargado')?.value || '';
    
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
            showToast('Cotización enviada exitosamente', 'success');
            cerrarModal('modalCotizar');
            await cargarSolicitudes();
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
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;
    
    // Parsear items
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map(item => `
        <div class="item-row-solicitud">
            <div class="item-desc">${escapeHtml(item.descripcion)}</div>
            <div class="item-cant">${item.cantidad} uds</div>
            <div class="item-detalle">${escapeHtml(item.detalle || '')}</div>
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalDetalleBody');
    modalBody.innerHTML = `
        <div class="orden-info">
            <div class="orden-info-item">
                <label>Solicitud ID</label>
                <span>#${solicitud.id}</span>
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
                <label>Servicio</label>
                <span>${escapeHtml(solicitud.servicio_descripcion || 'N/A')}</span>
            </div>
            <div class="orden-info-item">
                <label>Fecha Solicitud</label>
                <span>${formatDate(solicitud.fecha_solicitud)}</span>
            </div>
            <div class="orden-info-item">
                <label>Estado</label>
                <span>${statusBadge(solicitud.estado)}</span>
            </div>
        </div>
        
        <div class="items-list">
            <h4>Items solicitados:</h4>
            ${itemsHtml}
        </div>
        
        ${solicitud.observacion_jefe_taller ? `
            <div style="background: var(--gris-claro); padding: 0.75rem; border-radius: var(--radius-md); margin: 1rem 0;">
                <small><i class="fas fa-comment"></i> Observación del Jefe de Taller:</small>
                <p style="margin-top: 0.25rem;">${escapeHtml(solicitud.observacion_jefe_taller)}</p>
            </div>
        ` : ''}
        
        ${solicitud.precio_cotizado ? `
            <div style="background: rgba(16, 185, 129, 0.1); padding: 0.75rem; border-radius: var(--radius-md); margin: 1rem 0; border-left: 3px solid var(--verde-exito);">
                <strong><i class="fas fa-tag"></i> Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
                ${solicitud.respuesta_encargado ? `<br><strong>Notas:</strong> ${escapeHtml(solicitud.respuesta_encargado)}` : ''}
                <br><strong>Fecha respuesta:</strong> ${formatDate(solicitud.fecha_respuesta)}
            </div>
        ` : ''}
        
        <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
            <button class="btn-secondary" onclick="cerrarModal('modalDetalle')">Cerrar</button>
        </div>
    `;
    
    abrirModal('modalDetalle');
}

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = '/';
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
        
        if (currentUser.roles && Array.isArray(currentUser.roles)) {
            currentUserRoles = currentUser.roles;
        } else if (currentUser.rol_principal) {
            currentUserRoles = [currentUser.rol_principal];
        }
        
        const tieneRolRepuestos = currentUserRoles.includes('encargado_repuestos') || 
                                    currentUserRoles.includes('encargado_rep_almacen') ||
                                    currentUser.rol_principal === 'encargado_repuestos';
        
        if (!tieneRolRepuestos) {
            console.warn('Usuario no tiene rol de encargado de repuestos', currentUserRoles);
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return null;
        }
        
        // Mostrar fecha actual
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', opciones);
        }
        
        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
        
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        window.location.href = '/';
        return null;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarSolicitudes();
            showToast('Actualizando...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarSolicitudes());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarSolicitudes());
    }
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando solicitudes_cotizacion.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarSolicitudes();
    setupEventListeners();
    
    console.log('✅ solicitudes_cotizacion.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalle = verDetalle;
window.abrirModalCotizar = abrirModalCotizar;
window.enviarCotizacion = enviarCotizacion;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);