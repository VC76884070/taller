// =====================================================
// SOLICITUDES_COMPRA.JS - ENCARGADO DE REPUESTOS
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
        'comprado': 'status-comprado',
        'entregado': 'status-entregado'
    };
    
    const texto = {
        'pendiente': 'Pendiente',
        'comprado': 'Comprado',
        'entregado': 'Entregado'
    };
    
    const iconos = {
        'pendiente': 'fa-clock',
        'comprado': 'fa-check-circle',
        'entregado': 'fa-truck'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${iconos[estado] || 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarSolicitudes() {
    mostrarLoading(true);
    
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/solicitudes-compra`;
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
                <p>No hay solicitudes de compra</p>
                <small>Las solicitudes aparecerán aquí cuando el Jefe de Taller las cree</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = solicitudes.map(solicitud => {
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
        
        const puedeComprar = solicitud.estado === 'pendiente';
        const puedeEntregar = solicitud.estado === 'comprado';
        const puedeVer = true;
        
        return `
            <div class="solicitud-card" data-id="${solicitud.id}">
                <div class="solicitud-header">
                    <h3><i class="fas fa-shopping-cart"></i> Solicitud #${solicitud.id}</h3>
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
                    
                    ${solicitud.precio_cotizado ? `
                        <div class="precio-cotizado-box">
                            <strong><i class="fas fa-tag"></i> Precio cotizado:</strong>
                            <span class="precio-valor">Bs. ${solicitud.precio_cotizado.toFixed(2)}</span>
                            ${solicitud.proveedor_info ? `<br><small>Proveedor: ${escapeHtml(solicitud.proveedor_info)}</small>` : ''}
                        </div>
                    ` : ''}
                    
                    ${solicitud.mensaje_jefe_taller ? `
                        <div class="observacion-box">
                            <small><i class="fas fa-comment"></i> Mensaje del Jefe de Taller:</small>
                            <p>${escapeHtml(solicitud.mensaje_jefe_taller)}</p>
                        </div>
                    ` : ''}
                    
                    ${solicitud.respuesta_encargado ? `
                        <div class="observacion-box">
                            <small><i class="fas fa-reply"></i> Tu respuesta:</small>
                            <p>${escapeHtml(solicitud.respuesta_encargado)}</p>
                        </div>
                    ` : ''}
                    
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="verDetalle(${solicitud.id})" title="Ver Detalle">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        ${puedeComprar ? `
                            <button class="action-btn buy" onclick="abrirModalComprar(${solicitud.id})" title="Marcar como Comprado">
                                <i class="fas fa-shopping-cart"></i> Marcar Comprado
                            </button>
                        ` : ''}
                        ${puedeEntregar ? `
                            <button class="action-btn deliver" onclick="abrirModalEntregar(${solicitud.id})" title="Registrar Entrega">
                                <i class="fas fa-truck"></i> Registrar Entrega
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// VER DETALLE
// =====================================================

async function verDetalle(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;
    
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
        
        ${solicitud.precio_cotizado ? `
            <div class="precio-cotizado-box">
                <strong>Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
            </div>
        ` : ''}
        
        ${solicitud.mensaje_jefe_taller ? `
            <div class="observacion-box">
                <small>Mensaje del Jefe de Taller:</small>
                <p>${escapeHtml(solicitud.mensaje_jefe_taller)}</p>
            </div>
        ` : ''}
        
        ${solicitud.respuesta_encargado ? `
            <div class="observacion-box">
                <small>Tu respuesta:</small>
                <p>${escapeHtml(solicitud.respuesta_encargado)}</p>
            </div>
        ` : ''}
        
        <div class="detalle-actions">
            <button class="btn-secondary" onclick="cerrarModal('modalDetalle')">Cerrar</button>
        </div>
    `;
    
    abrirModal('modalDetalle');
}

// =====================================================
// MARCAR COMO COMPRADO
// =====================================================

let currentSolicitudId = null;

function abrirModalComprar(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;
    
    currentSolicitudId = idSolicitud;
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map(item => `
        <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm);">
            <strong>${escapeHtml(item.descripcion)}</strong> - ${item.cantidad} uds
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalComprarBody');
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
        
        <div class="items-list">
            <h4>Items a comprar:</h4>
            ${itemsHtml}
        </div>
        
        ${solicitud.precio_cotizado ? `
            <div class="precio-cotizado-box">
                <strong>Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
            </div>
        ` : ''}
        
        <div class="compra-form">
            <div class="form-group">
                <label>Fecha de compra</label>
                <input type="date" id="fechaCompra" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Notas de compra (opcional)</label>
                <textarea id="notasCompra" rows="2" placeholder="N° de factura, detalles de la compra..."></textarea>
            </div>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
            <button class="btn-secondary" onclick="cerrarModal('modalComprar')">Cancelar</button>
            <button class="btn-comprar" onclick="confirmarCompra()">
                <i class="fas fa-check-circle"></i> Confirmar Compra
            </button>
        </div>
    `;
    
    abrirModal('modalComprar');
}

async function confirmarCompra() {
    const fechaCompra = document.getElementById('fechaCompra')?.value || new Date().toISOString().split('T')[0];
    const notas = document.getElementById('notasCompra')?.value || '';
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${currentSolicitudId}/comprar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                fecha_compra: fechaCompra,
                notas_compra: notas
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Compra registrada exitosamente', 'success');
            cerrarModal('modalComprar');
            await cargarSolicitudes();
        } else {
            showToast(data.error || 'Error al registrar compra', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// REGISTRAR ENTREGA
// =====================================================

function abrirModalEntregar(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;
    
    currentSolicitudId = idSolicitud;
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map(item => `
        <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm);">
            <strong>${escapeHtml(item.descripcion)}</strong> - ${item.cantidad} uds
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalEntregarBody');
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
        
        <div class="items-list">
            <h4>Items a entregar:</h4>
            ${itemsHtml}
        </div>
        
        <div class="compra-form">
            <div class="form-group">
                <label>Fecha de entrega</label>
                <input type="date" id="fechaEntrega" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Notas de entrega (opcional)</label>
                <textarea id="notasEntrega" rows="2" placeholder="Detalles de la entrega..."></textarea>
            </div>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
            <button class="btn-secondary" onclick="cerrarModal('modalEntregar')">Cancelar</button>
            <button class="btn-entregar" onclick="confirmarEntrega()">
                <i class="fas fa-truck"></i> Confirmar Entrega
            </button>
        </div>
    `;
    
    abrirModal('modalEntregar');
}

async function confirmarEntrega() {
    const fechaEntrega = document.getElementById('fechaEntrega')?.value || new Date().toISOString().split('T')[0];
    const notas = document.getElementById('notasEntrega')?.value || '';
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${currentSolicitudId}/entregar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                fecha_entrega: fechaEntrega,
                notas_entrega: notas
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Entrega registrada exitosamente', 'success');
            cerrarModal('modalEntregar');
            await cargarSolicitudes();
        } else {
            showToast(data.error || 'Error al registrar entrega', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
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
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return null;
        }
        
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
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando solicitudes_compra.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarSolicitudes();
    setupEventListeners();
    
    console.log('✅ solicitudes_compra.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalle = verDetalle;
window.abrirModalComprar = abrirModalComprar;
window.abrirModalEntregar = abrirModalEntregar;
window.confirmarCompra = confirmarCompra;
window.confirmarEntrega = confirmarEntrega;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);