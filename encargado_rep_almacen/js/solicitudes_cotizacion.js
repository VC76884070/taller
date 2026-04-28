// =====================================================
// SOLICITUDES_COTIZACION.JS - ENCARGADO DE REPUESTOS
// FURIA MOTOR COMPANY SRL
// VERSIÓN MEJORADA CON MODALES OPTIMIZADOS
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

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
        // Limpiar body del modal después de la animación
        setTimeout(() => {
            if (modalId === 'modalCotizar' && document.getElementById('modalCotizarBody')) {
                // No limpiamos inmediatamente para evitar flickering
            }
        }, 300);
    }
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        // Prevenir scroll del body
        document.body.style.overflow = 'hidden';
        // Restaurar scroll al cerrar
        const closeModal = () => {
            document.body.style.overflow = '';
            modal.removeEventListener('animationend', closeModal);
        };
        modal.addEventListener('animationend', closeModal, { once: true });
    }
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
            showToast('Sesión expirada, redirigiendo...', 'warning');
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
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
                    (s.vehiculo || '').toLowerCase().includes(search) ||
                    (s.id || '').toString().includes(search)
                );
            }
            
            solicitudesPendientes = solicitudes;
            renderizarSolicitudes(solicitudes);
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
    
    container.innerHTML = solicitudes.map((solicitud, index) => {
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
        
        return `
            <div class="solicitud-card" data-id="${solicitud.id}" style="animation-delay: ${index * 0.05}s">
                <div class="solicitud-header">
                    <h3><i class="fas fa-file-invoice"></i> Solicitud #${solicitud.id}</h3>
                    ${statusBadge(solicitud.estado)}
                </div>
                <div class="solicitud-body">
                    <div class="orden-info">
                        <div class="orden-info-item">
                            <label><i class="fas fa-hashtag"></i> Orden de Trabajo</label>
                            <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
                        </div>
                        <div class="orden-info-item">
                            <label><i class="fas fa-car"></i> Vehículo</label>
                            <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <label><i class="fas fa-wrench"></i> Servicio</label>
                            <span>${escapeHtml(solicitud.servicio_descripcion || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <label><i class="fas fa-calendar"></i> Fecha Solicitud</label>
                            <span>${formatDate(solicitud.fecha_solicitud)}</span>
                        </div>
                    </div>
                    
                    <div class="items-list">
                        <h4><i class="fas fa-cubes"></i> Items solicitados:</h4>
                        ${itemsHtml}
                    </div>
                    
                    ${solicitud.observacion_jefe_taller ? `
                        <div class="observacion-box">
                            <small><i class="fas fa-comment-dots"></i> Observación del Jefe de Taller:</small>
                            <p>${escapeHtml(solicitud.observacion_jefe_taller)}</p>
                        </div>
                    ` : ''}
                    
                    ${solicitud.precio_cotizado ? `
                        <div class="precio-cotizado-box">
                            <strong><i class="fas fa-tag"></i> Precio cotizado:</strong>
                            <span class="precio-valor">Bs. ${solicitud.precio_cotizado.toFixed(2)}</span>
                            ${solicitud.proveedor_info ? `<br><small><i class="fas fa-truck"></i> Proveedor: ${escapeHtml(solicitud.proveedor_info)}</small>` : ''}
                            ${solicitud.fecha_respuesta ? `<br><small><i class="fas fa-clock"></i> Cotizado: ${formatDateTime(solicitud.fecha_respuesta)}</small>` : ''}
                        </div>
                    ` : ''}
                    
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="verDetalle(${solicitud.id})" title="Ver Detalle">
                            <i class="fas fa-eye"></i> Ver Detalle
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
// COTIZAR SOLICITUD (VERSIÓN MEJORADA)
// =====================================================

let currentSolicitudId = null;

async function abrirModalCotizar(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
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
    
    // Generar HTML mejorado para los items con precios
    const itemsHtml = items.map((item, idx) => `
        <div class="precio-item-row">
            <div class="precio-item-desc">
                <strong>${escapeHtml(item.descripcion)}</strong>
                <small>(x${item.cantidad} unidades)</small>
                ${item.detalle ? `<br><span style="font-size: 0.8rem; color: var(--gris-texto);"><i class="fas fa-info-circle"></i> ${escapeHtml(item.detalle)}</span>` : ''}
            </div>
            <div class="precio-item-input">
                <label><i class="fas fa-dollar-sign"></i> Precio unitario (Bs.):</label>
                <input type="number" id="precio_item_${idx}" class="precio-input" step="0.01" min="0" placeholder="0.00" value="">
                <span style="font-size: 0.85rem; color: var(--gris-texto);">
                    <i class="fas fa-calculator"></i> Total: Bs. <span id="total_item_${idx}" class="total-item">0.00</span>
                </span>
            </div>
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalCotizarBody');
    modalBody.innerHTML = `
        <div class="orden-info" style="margin-bottom: 1.5rem;">
            <div class="orden-info-item">
                <label><i class="fas fa-hashtag"></i> Solicitud</label>
                <span><strong>#${solicitud.id}</strong></span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-clipboard-list"></i> Orden de Trabajo</label>
                <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-car"></i> Vehículo</label>
                <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-calendar"></i> Fecha Solicitud</label>
                <span>${formatDate(solicitud.fecha_solicitud)}</span>
            </div>
        </div>
        
        ${solicitud.observacion_jefe_taller ? `
            <div class="observacion-box" style="margin-bottom: 1.5rem;">
                <small><i class="fas fa-comment-dots"></i> Observación del Jefe de Taller:</small>
                <p>${escapeHtml(solicitud.observacion_jefe_taller)}</p>
            </div>
        ` : ''}
        
        <div style="margin-bottom: 1.5rem;">
            <h4 style="color: var(--blanco); margin-bottom: 1rem;">
                <i class="fas fa-cubes"></i> Items a cotizar:
            </h4>
            ${itemsHtml}
        </div>
        
        <div class="form-group">
            <label><i class="fas fa-truck"></i> Proveedor *</label>
            <input type="text" id="proveedorInfo" class="form-control" placeholder="Ej: Autoparts Bolivia, Repuestos FURIA, Distribuidora ABC" autocomplete="off">
        </div>
        
        <div class="form-group">
            <label><i class="fas fa-sticky-note"></i> Observaciones (opcional)</label>
            <textarea id="respuestaEncargado" class="form-control" rows="3" placeholder="Notas sobre la cotización: tiempo de entrega, garantía, condiciones, etc..."></textarea>
        </div>
        
        <div class="modal-actions">
            <button class="btn-secondary" onclick="cerrarModal('modalCotizar')">
                <i class="fas fa-times"></i> Cancelar
            </button>
            <button class="btn-cotizar" onclick="enviarCotizacion()">
                <i class="fas fa-paper-plane"></i> Enviar Cotización
            </button>
        </div>
    `;
    
    // Agregar evento para calcular totales en tiempo real
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
                        
                        // Cambiar color si el precio es válido
                        if (precio > 0) {
                            totalSpan.style.color = 'var(--verde-exito)';
                            totalSpan.style.fontWeight = 'bold';
                        } else {
                            totalSpan.style.color = 'var(--gris-texto)';
                            totalSpan.style.fontWeight = 'normal';
                        }
                    }
                });
                
                // Trigger initial calculation
                const event = new Event('input');
                precioInput.dispatchEvent(event);
            }
        });
        
        // Focus en el primer input de precio
        const firstPrecioInput = document.getElementById('precio_item_0');
        if (firstPrecioInput) firstPrecioInput.focus();
    }, 100);
    
    abrirModal('modalCotizar');
}

async function enviarCotizacion() {
    const solicitud = solicitudesPendientes.find(s => s.id === currentSolicitudId);
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
    const preciosItems = [];
    let itemsConPrecio = 0;
    
    for (let i = 0; i < items.length; i++) {
        const precioInput = document.getElementById(`precio_item_${i}`);
        if (precioInput && precioInput.value) {
            const precioUnitario = parseFloat(precioInput.value);
            if (!isNaN(precioUnitario) && precioUnitario > 0) {
                const subtotal = precioUnitario * items[i].cantidad;
                precioTotal += subtotal;
                itemsConPrecio++;
                preciosItems.push({
                    item: items[i].descripcion,
                    precio_unitario: precioUnitario,
                    cantidad: items[i].cantidad,
                    subtotal: subtotal
                });
            }
        }
    }
    
    if (precioTotal === 0 || itemsConPrecio === 0) {
        showToast('⚠️ Ingrese al menos un precio válido para continuar', 'warning');
        // Enfocar el primer input de precio vacío
        for (let i = 0; i < items.length; i++) {
            const precioInput = document.getElementById(`precio_item_${i}`);
            if (precioInput && (!precioInput.value || parseFloat(precioInput.value) === 0)) {
                precioInput.focus();
                precioInput.style.borderColor = 'var(--ambar-alerta)';
                setTimeout(() => {
                    precioInput.style.borderColor = '';
                }, 2000);
                break;
            }
        }
        return;
    }
    
    const proveedorInfo = document.getElementById('proveedorInfo')?.value.trim() || '';
    if (!proveedorInfo) {
        showToast('⚠️ Por favor indique el nombre del proveedor', 'warning');
        const proveedorInput = document.getElementById('proveedorInfo');
        if (proveedorInput) {
            proveedorInput.focus();
            proveedorInput.style.borderColor = 'var(--ambar-alerta)';
            setTimeout(() => {
                proveedorInput.style.borderColor = '';
            }, 2000);
        }
        return;
    }
    
    const respuesta = document.getElementById('respuestaEncargado')?.value.trim() || '';
    
    // Confirmar antes de enviar
    const confirmar = confirm(`¿Confirmar cotización?\n\nProveedor: ${proveedorInfo}\nTotal: Bs. ${precioTotal.toFixed(2)}\n\n¿Desea enviar esta cotización?`);
    if (!confirmar) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion/${currentSolicitudId}/cotizar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                precio_cotizado: precioTotal,
                proveedor_info: proveedorInfo,
                respuesta_encargado: respuesta,
                detalle_precios: preciosItems
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ Cotización enviada exitosamente - Total: Bs. ${precioTotal.toFixed(2)}`, 'success');
            cerrarModal('modalCotizar');
            await cargarSolicitudes();
        } else {
            showToast(data.error || 'Error al enviar cotización', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE (VERSIÓN MEJORADA)
// =====================================================

async function verDetalle(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) {
        showToast('No se encontró la solicitud', 'error');
        return;
    }
    
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
    
    // Parsear detalle de precios si existe
    let detallesPrecios = [];
    if (solicitud.detalle_precios) {
        try {
            detallesPrecios = typeof solicitud.detalle_precios === 'string' ? 
                JSON.parse(solicitud.detalle_precios) : solicitud.detalle_precios;
        } catch(e) {}
    }
    
    const detallesPreciosHtml = detallesPrecios.length > 0 ? `
        <div style="margin-top: 1rem; background: var(--gris-oscuro); border-radius: var(--radius-md); padding: 1rem;">
            <h4 style="margin-bottom: 0.75rem;"><i class="fas fa-chart-line"></i> Desglose de cotización:</h4>
            ${detallesPrecios.map(dp => `
                <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
                    <span>${escapeHtml(dp.item)}</span>
                    <span>${dp.cantidad} x Bs. ${dp.precio_unitario.toFixed(2)} = <strong>Bs. ${dp.subtotal.toFixed(2)}</strong></span>
                </div>
            `).join('')}
        </div>
    ` : '';
    
    const modalBody = document.getElementById('modalDetalleBody');
    modalBody.innerHTML = `
        <div class="orden-info">
            <div class="orden-info-item">
                <label><i class="fas fa-hashtag"></i> Solicitud ID</label>
                <span>#${solicitud.id}</span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-clipboard-list"></i> Orden de Trabajo</label>
                <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-car"></i> Vehículo</label>
                <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-wrench"></i> Servicio</label>
                <span>${escapeHtml(solicitud.servicio_descripcion || 'N/A')}</span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-calendar"></i> Fecha Solicitud</label>
                <span>${formatDateTime(solicitud.fecha_solicitud)}</span>
            </div>
            <div class="orden-info-item">
                <label><i class="fas fa-tag"></i> Estado</label>
                <span>${statusBadge(solicitud.estado)}</span>
            </div>
        </div>
        
        <div class="items-list">
            <h4><i class="fas fa-cubes"></i> Items solicitados:</h4>
            ${itemsHtml}
        </div>
        
        ${solicitud.observacion_jefe_taller ? `
            <div class="observacion-box">
                <small><i class="fas fa-comment-dots"></i> Observación del Jefe de Taller:</small>
                <p>${escapeHtml(solicitud.observacion_jefe_taller)}</p>
            </div>
        ` : ''}
        
        ${solicitud.precio_cotizado ? `
            <div class="precio-cotizado-box">
                <strong><i class="fas fa-tag"></i> Precio cotizado:</strong>
                <span class="precio-valor">Bs. ${solicitud.precio_cotizado.toFixed(2)}</span>
                ${solicitud.proveedor_info ? `<br><strong><i class="fas fa-truck"></i> Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
                ${solicitud.respuesta_encargado ? `<br><strong><i class="fas fa-comment"></i> Notas del encargado:</strong><br>${escapeHtml(solicitud.respuesta_encargado)}` : ''}
                ${solicitud.fecha_respuesta ? `<br><strong><i class="fas fa-clock"></i> Fecha respuesta:</strong> ${formatDateTime(solicitud.fecha_respuesta)}` : ''}
            </div>
            ${detallesPreciosHtml}
        ` : `
            <div class="observacion-box" style="border-left-color: var(--ambar-alerta);">
                <small><i class="fas fa-clock"></i> Estado actual:</small>
                <p>Esta solicitud aún no ha sido cotizada. Utilice el botón "Cotizar" para enviar una propuesta de precios.</p>
            </div>
        `}
        
        <div class="modal-actions">
            <button class="btn-secondary" onclick="cerrarModal('modalDetalle')">
                <i class="fas fa-times"></i> Cerrar
            </button>
            ${solicitud.estado === 'pendiente' ? `
                <button class="btn-cotizar" onclick="cerrarModal('modalDetalle'); abrirModalCotizar(${solicitud.id})">
                    <i class="fas fa-tags"></i> Cotizar ahora
                </button>
            ` : ''}
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
            showToast('Actualizando lista...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarSolicitudes());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => cargarSolicitudes(), 500);
        });
    }
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModal(modal.id);
        });
    });
    
    // Cerrar modal con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                cerrarModal(modal.id);
            });
        }
    });
}

async function inicializar() {
    console.log('🚀 Inicializando solicitudes_cotizacion.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarSolicitudes();
    setupEventListeners();
    
    // Refresh automático cada 30 segundos
    setInterval(() => {
        if (!document.querySelector('.modal.active')) {
            cargarSolicitudes();
        }
    }, 30000);
    
    console.log('✅ solicitudes_cotizacion.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalle = verDetalle;
window.abrirModalCotizar = abrirModalCotizar;
window.enviarCotizacion = enviarCotizacion;
window.cerrarModal = cerrarModal;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', inicializar);