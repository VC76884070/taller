/**
 * cotizaciones.js - Jefe de Taller (CORREGIDO)
 * FURIA MOTOR COMPANY SRL
 * 
 * Módulo de Cotizaciones con 3 apartados:
 * 1. Solicitar Cotización al Encargado de Repuestos (con lista dinámica)
 * 2. Gestión de Servicios y Cotización al Cliente (con QR/DatosCuenta)
 * 3. Solicitar Compra al Encargado de Repuestos (con lista dinámica)
 */

// =====================================================
// VARIABLES GLOBALES
// =====================================================
let currentUser = null;
let currentUserRoles = [];
let API_URL = window.location.origin + '/api/jefe-taller';

// Datos en memoria
let ordenesTrabajo = [];
let encargadosRepuestos = [];
let serviciosTecnicos = [];
let solicitudesCotizacion = [];
let cotizacionesEnviadas = [];
let solicitudesCompra = [];

// Variables para listas dinámicas
let itemsSolicitud = [];
let itemsCompra = [];

// =====================================================
// FUNCIONES DE AUTENTICACIÓN (CORREGIDAS)
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

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = '/';
            return;
        }
        
        // Decodificar token
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        let userData = null;
        try {
            const userStr = localStorage.getItem('furia_user');
            if (userStr) userData = JSON.parse(userStr);
        } catch (e) {}
        
        // Obtener datos del usuario
        currentUser = {
            id: payload.user?.id || payload.id || payload.user_id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email,
            roles: payload.user?.roles || payload.roles || userData?.roles || [],
            rol_principal: payload.user?.rol_principal || payload.rol_principal || userData?.rol_principal
        };
        
        // Obtener roles del usuario
        if (currentUser.roles && Array.isArray(currentUser.roles)) {
            currentUserRoles = currentUser.roles;
        } else if (currentUser.rol_principal) {
            currentUserRoles = [currentUser.rol_principal];
        }
        
        // Verificar si tiene rol de jefe_taller (usando el nuevo sistema)
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller') || 
                                    currentUser.rol_principal === 'jefe_taller';
        
        if (!tieneRolJefeTaller) {
            console.warn('Usuario no tiene rol de jefe_taller', currentUserRoles);
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return;
        }
        
        console.log('✅ Usuario autenticado:', currentUser.nombre, 'Roles:', currentUserRoles);
        return currentUser;
        
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        window.location.href = '/';
    }
}

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarFechaActual() {
    const fechaElement = document.getElementById('currentDate');
    if (fechaElement) {
        const hoy = new Date();
        const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
        fechaElement.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
    
    // Mostrar nombre de usuario en el header
    const userNombreSpan = document.getElementById('userNombre');
    if (userNombreSpan && currentUser) {
        userNombreSpan.textContent = currentUser.nombre || 'Usuario';
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
        toast.style.animation = 'slideOut 0.3s ease';
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

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function renderEstadoBadge(estado) {
    const estados = {
        'pendiente': '<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente</span>',
        'cotizado': '<span class="status-badge status-cotizado"><i class="fas fa-check-circle"></i> Cotizado</span>',
        'aprobado': '<span class="status-badge status-aprobado"><i class="fas fa-check-double"></i> Aprobado</span>',
        'rechazado': '<span class="status-badge status-rechazado"><i class="fas fa-times-circle"></i> Rechazado</span>',
        'comprado': '<span class="status-badge status-comprado"><i class="fas fa-shopping-cart"></i> Comprado</span>'
    };
    return estados[estado] || `<span class="status-badge">${estado}</span>`;
}

function renderEstadoClienteBadge(estado) {
    const estados = {
        'aprobado_total': '<span class="status-badge status-aprobado"><i class="fas fa-check-double"></i> Aprobado Total</span>',
        'aprobado_parcial': '<span class="status-badge status-cotizado"><i class="fas fa-check"></i> Aprobado Parcial</span>',
        'rechazado': '<span class="status-badge status-rechazado"><i class="fas fa-times"></i> Rechazado</span>',
        'pendiente': '<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente</span>',
        'enviada': '<span class="status-badge status-enviado"><i class="fas fa-paper-plane"></i> Enviada</span>'
    };
    return estados[estado] || `<span class="status-badge">${estado}</span>`;
}

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE SOLICITUD
// =====================================================

function renderItemsList() {
    const container = document.getElementById('itemsList');
    if (!container) return;
    
    if (itemsSolicitud.length === 0) {
        container.innerHTML = `
            <div class="item-empty">
                <i class="fas fa-box-open"></i>
                <p>No hay items agregados</p>
                <small>Haz clic en "Agregar item" para comenzar</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = itemsSolicitud.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="form-input item-descripcion" 
                       value="${escapeHtml(item.descripcion)}" 
                       placeholder="Ej: Filtro de aceite, Bujías, Herramienta..."
                       onchange="actualizarItemSolicitud(${index}, 'descripcion', this.value)">
                
                <input type="number" class="form-input item-cantidad" 
                       value="${item.cantidad}" min="1"
                       placeholder="Cantidad"
                       onchange="actualizarItemSolicitud(${index}, 'cantidad', parseInt(this.value))">
                
                <input type="text" class="form-input item-observacion" 
                       value="${escapeHtml(item.observacion || '')}" 
                       placeholder="Observaciones (opcional)"
                       onchange="actualizarItemSolicitud(${index}, 'observacion', this.value)">
            </div>
            <div class="item-actions">
                <button type="button" class="btn-remove-item" onclick="eliminarItemSolicitud(${index})" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function agregarItemSolicitud() {
    itemsSolicitud.push({
        descripcion: '',
        cantidad: 1,
        observacion: ''
    });
    renderItemsList();
    
    setTimeout(() => {
        const lastItem = document.querySelector('#itemsList .item-row:last-child .item-descripcion');
        if (lastItem) lastItem.focus();
    }, 100);
}

function actualizarItemSolicitud(index, campo, valor) {
    if (itemsSolicitud[index]) {
        itemsSolicitud[index][campo] = valor;
    }
}

function eliminarItemSolicitud(index) {
    itemsSolicitud.splice(index, 1);
    renderItemsList();
}

function limpiarItemsSolicitud() {
    itemsSolicitud = [];
    renderItemsList();
}

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE COMPRA
// =====================================================

function renderCompraItemsList() {
    const container = document.getElementById('compraItemsList');
    if (!container) return;
    
    if (itemsCompra.length === 0) {
        container.innerHTML = `
            <div class="item-empty">
                <i class="fas fa-box-open"></i>
                <p>No hay items agregados</p>
                <small>Haz clic en "Agregar item" para solicitar compra</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = itemsCompra.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="form-input item-descripcion" 
                       value="${escapeHtml(item.descripcion)}" 
                       placeholder="Ej: Filtro de aceite, Pastillas de freno..."
                       onchange="actualizarItemCompra(${index}, 'descripcion', this.value)">
                
                <input type="number" class="form-input item-cantidad" 
                       value="${item.cantidad}" min="1"
                       placeholder="Cantidad"
                       onchange="actualizarItemCompra(${index}, 'cantidad', parseInt(this.value))">
                
                <input type="text" class="form-input item-observacion" 
                       value="${escapeHtml(item.observacion || '')}" 
                       placeholder="Observaciones (opcional)"
                       onchange="actualizarItemCompra(${index}, 'observacion', this.value)">
            </div>
            <div class="item-actions">
                <button type="button" class="btn-remove-item" onclick="eliminarItemCompra(${index})" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function agregarItemCompra() {
    itemsCompra.push({
        descripcion: '',
        cantidad: 1,
        observacion: ''
    });
    renderCompraItemsList();
    
    setTimeout(() => {
        const lastItem = document.querySelector('#compraItemsList .item-row:last-child .item-descripcion');
        if (lastItem) lastItem.focus();
    }, 100);
}

function actualizarItemCompra(index, campo, valor) {
    if (itemsCompra[index]) {
        itemsCompra[index][campo] = valor;
    }
}

function eliminarItemCompra(index) {
    itemsCompra.splice(index, 1);
    renderCompraItemsList();
}

function limpiarItemsCompra() {
    itemsCompra = [];
    renderCompraItemsList();
}

// =====================================================
// CARGA DE DATOS DESDE API
// =====================================================

async function cargarDatosIniciales() {
    try {
        // Mostrar loading
        const loadingElements = document.querySelectorAll('.loading-indicator');
        loadingElements.forEach(el => el.style.display = 'flex');
        
        await Promise.all([
            cargarOrdenesTrabajo(),
            cargarEncargadosRepuestos(),
            cargarSolicitudesCotizacion(),
            cargarServiciosPendientes(),
            cargarCotizacionesEnviadas(),
            cargarSolicitudesCompra()
        ]);
        
        renderAllTables();
        
        // Ocultar loading
        loadingElements.forEach(el => el.style.display = 'none');
    } catch (error) {
        console.error('Error cargando datos:', error);
        showToast('Error al cargar los datos', 'error');
    }
}

async function cargarOrdenesTrabajo() {
    try {
        const response = await fetch(`${API_URL}/ordenes-trabajo`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            ordenesTrabajo = data.ordenes || [];
        } else {
            ordenesTrabajo = [];
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        ordenesTrabajo = [];
    }
}

async function cargarEncargadosRepuestos() {
    try {
        const response = await fetch(`${API_URL}/encargados-repuestos`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            encargadosRepuestos = data.encargados || [];
        } else {
            encargadosRepuestos = [];
        }
    } catch (error) {
        console.error('Error cargando encargados:', error);
        encargadosRepuestos = [];
    }
}

async function cargarSolicitudesCotizacion() {
    try {
        const filtroOrden = document.getElementById('filtroOrdenSolicitud')?.value || 'all';
        const filtroEstado = document.getElementById('filtroEstadoSolicitud')?.value || 'all';
        
        let url = `${API_URL}/solicitudes-cotizacion`;
        const params = new URLSearchParams();
        if (filtroOrden !== 'all') params.append('id_orden_trabajo', filtroOrden);
        if (filtroEstado !== 'all') params.append('estado', filtroEstado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            solicitudesCotizacion = data.solicitudes || [];
        } else {
            solicitudesCotizacion = [];
        }
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        solicitudesCotizacion = [];
    }
}

async function cargarServiciosPendientes() {
    try {
        const response = await fetch(`${API_URL}/servicios-pendientes`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            serviciosTecnicos = data.ordenes || [];
        } else {
            serviciosTecnicos = [];
        }
    } catch (error) {
        console.error('Error cargando servicios:', error);
        serviciosTecnicos = [];
    }
}

async function cargarCotizacionesEnviadas() {
    try {
        const response = await fetch(`${API_URL}/cotizaciones-enviadas`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            cotizacionesEnviadas = data.cotizaciones || [];
        } else {
            cotizacionesEnviadas = [];
        }
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
        cotizacionesEnviadas = [];
    }
}

async function cargarSolicitudesCompra() {
    try {
        const filtroOrden = document.getElementById('filtroOrdenCompra')?.value || 'all';
        const filtroEstado = document.getElementById('filtroEstadoCompra')?.value || 'all';
        
        let url = `${API_URL}/solicitudes-compra`;
        const params = new URLSearchParams();
        if (filtroOrden !== 'all') params.append('id_orden_trabajo', filtroOrden);
        if (filtroEstado !== 'all') params.append('estado', filtroEstado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            solicitudesCompra = data.solicitudes || [];
        } else {
            solicitudesCompra = [];
        }
    } catch (error) {
        console.error('Error cargando solicitudes de compra:', error);
        solicitudesCompra = [];
    }
}

// =====================================================
// RENDERIZADO DE TABLAS
// =====================================================

function renderAllTables() {
    renderSelects();
    renderSolicitudesCotizacion();
    renderOrdenesPendientes();
    renderCotizacionesEnviadas();
    renderSolicitudesCompra();
}

function renderSelects() {
    const selectIds = ['filtroOrdenSolicitud', 'filtroOrdenServicio', 'filtroOrdenCompra', 'solicitud_id_orden_trabajo'];
    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="all">Todas las órdenes</option>' + 
                ordenesTrabajo.map(o => `<option value="${o.id}">${o.codigo_unico} - ${o.vehiculo}</option>`).join('');
            if (currentValue !== 'all' && currentValue) select.value = currentValue;
        }
    });
    
    const selectEncargado = document.getElementById('solicitud_id_encargado');
    if (selectEncargado) {
        selectEncargado.innerHTML = '<option value="">Seleccionar encargado</option>' +
            encargadosRepuestos.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
    }
}

function renderSolicitudesCotizacion() {
    const tbody = document.getElementById('tablaSolicitudesCotizacion');
    if (!tbody) return;
    
    const searchTerm = document.getElementById('searchSolicitud')?.value.toLowerCase() || '';
    
    let filtered = [...solicitudesCotizacion];
    if (searchTerm) {
        filtered = filtered.filter(s => 
            s.descripcion_pieza?.toLowerCase().includes(searchTerm) ||
            s.orden_codigo?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No hay solicitudes de cotización</p>
                        <button class="btn-primary btn-sm" onclick="document.getElementById('btnNuevaSolicitudCotizacion').click()">
                            <i class="fas fa-plus"></i> Crear primera solicitud
                        </button>
                    </div>
                  </td>
              </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filtered.map(solicitud => `
        <tr>
            <td>${solicitud.id}</td>
            <td><span class="orden-code">${solicitud.orden_codigo || 'N/A'}</span></td>
            <td>${solicitud.vehiculo || 'N/A'}</td>
            <td><strong>${solicitud.descripcion_pieza}</strong></td>
            <td>${solicitud.cantidad}</td>
            <td>${renderEstadoBadge(solicitud.estado)}</td>
            <td>${solicitud.precio_cotizado ? `Bs. ${solicitud.precio_cotizado.toFixed(2)}` : '-'}</td>
            <td>${formatDate(solicitud.fecha_solicitud)}</td>
            <td class="action-buttons">
                ${solicitud.estado === 'pendiente' ? `
                    <button class="action-btn delete" onclick="eliminarSolicitudCotizacion(${solicitud.id})" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                ` : ''}
                ${solicitud.estado === 'cotizado' ? `
                    <button class="action-btn send" onclick="solicitarCompraDesdeCotizacion(${solicitud.id})" title="Solicitar Compra"><i class="fas fa-shopping-cart"></i></button>
                ` : ''}
                ${solicitud.estado === 'aprobado' ? '<span class="status-badge status-aprobado"><i class="fas fa-check"></i> Aprobado</span>' : ''}
            </td>
        </tr>
    `).join('');
}

function renderOrdenesPendientes() {
    const container = document.getElementById('ordenesPendientesContainer');
    if (!container) return;
    
    const filtroOrden = document.getElementById('filtroOrdenServicio')?.value || 'all';
    const searchTerm = document.getElementById('searchServicio')?.value.toLowerCase() || '';
    
    let filtered = [...serviciosTecnicos];
    if (filtroOrden !== 'all') {
        filtered = filtered.filter(o => o.id_orden == filtroOrden);
    }
    if (searchTerm) {
        filtered = filtered.filter(o => 
            o.codigo_unico?.toLowerCase().includes(searchTerm) ||
            o.placa?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>No hay servicios pendientes de cotización</p>
                <small>Los diagnósticos aprobados aparecerán aquí</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(orden => `
        <div class="orden-card">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-hashtag"></i> ${orden.codigo_unico}</span>
                    <div class="orden-vehiculo">${orden.vehiculo} (${orden.placa})</div>
                    <div class="orden-cliente"><i class="fas fa-user"></i> ${orden.cliente_nombre}</div>
                </div>
                <button class="btn-primary btn-sm" onclick="abrirModalAsignarPrecios(${orden.id_orden})">
                    <i class="fas fa-tags"></i> Asignar Precios
                </button>
            </div>
            <div class="servicios-list">
                ${orden.servicios.map(servicio => `
                    <div class="servicio-item">
                        <span class="servicio-descripcion">${servicio.descripcion}</span>
                        <span class="servicio-precio">
                            ${servicio.tiene_precio ? `Bs. ${servicio.precio_asignado?.toFixed(2)}` : 'Sin precio'}
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderCotizacionesEnviadas() {
    const tbody = document.getElementById('tablaCotizacionesEnviadas');
    if (!tbody) return;
    
    if (cotizacionesEnviadas.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fas fa-envelope"></i>
                        <p>No hay cotizaciones enviadas</p>
                    </div>
                  </td>
              </tr>
        `;
        return;
    }
    
    tbody.innerHTML = cotizacionesEnviadas.map(cot => `
        <tr>
            <td><span class="orden-code">${cot.orden_codigo}</span></td>
            <td>${cot.vehiculo}</td>
            <td>${cot.cliente_nombre}</td>
            <td><strong>Bs. ${cot.total?.toFixed(2) || '0.00'}</strong></td>
            <td>${cot.servicios_aprobados || 0}</td>
            <td>${renderEstadoClienteBadge(cot.estado_cliente)}</td>
            <td>${cot.pago_50 ? '<span class="status-badge status-aprobado"><i class="fas fa-check-circle"></i> Pagado</span>' : '<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente</span>'}</td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verDetalleCotizacion(${cot.id})" title="Ver Detalle"><i class="fas fa-eye"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderSolicitudesCompra() {
    const tbody = document.getElementById('tablaSolicitudesCompra');
    if (!tbody) return;
    
    const searchTerm = document.getElementById('searchCompra')?.value.toLowerCase() || '';
    
    let filtered = [...solicitudesCompra];
    if (searchTerm) {
        filtered = filtered.filter(s => 
            s.descripcion_pieza?.toLowerCase().includes(searchTerm) ||
            s.orden_codigo?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="10">
                    <div class="empty-state">
                        <i class="fas fa-shopping-cart"></i>
                        <p>No hay solicitudes de compra</p>
                    </div>
                  </td>
              </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filtered.map(solicitud => `
        <tr>
            <td>${solicitud.id}</td>
            <td>${solicitud.orden_codigo || 'N/A'}</td>
            <td>${solicitud.vehiculo || 'N/A'}</td>
            <td><strong>${solicitud.descripcion_pieza}</strong></td>
            <td>${solicitud.cantidad}</td>
            <td>${solicitud.precio_cotizado ? `Bs. ${solicitud.precio_cotizado.toFixed(2)}` : '-'}</td>
            <td>${solicitud.proveedor_info || '-'}</td>
            <td>${renderEstadoBadge(solicitud.estado)}</td>
            <td>${formatDate(solicitud.fecha_solicitud)}</td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verSolicitudCompra(${solicitud.id})" title="Ver"><i class="fas fa-eye"></i></button>
                ${solicitud.estado === 'pendiente' ? `
                    <button class="action-btn send" onclick="aprobarSolicitudCompra(${solicitud.id})" title="Marcar como Comprado"><i class="fas fa-check-circle"></i></button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

// =====================================================
// APARTADO 1: CREAR SOLICITUD DE COTIZACIÓN
// =====================================================

async function crearSolicitudCotizacion() {
    const idOrden = document.getElementById('solicitud_id_orden_trabajo').value;
    const idEncargado = document.getElementById('solicitud_id_encargado').value;
    const observacionGeneral = document.getElementById('solicitud_observacion').value;
    
    if (!idOrden || idOrden === 'all') {
        showToast('Seleccione una orden de trabajo', 'error');
        return;
    }
    
    if (!idEncargado) {
        showToast('Seleccione un encargado de repuestos', 'error');
        return;
    }
    
    const itemsValidos = itemsSolicitud.filter(item => item.descripcion.trim() !== '');
    if (itemsValidos.length === 0) {
        showToast('Agregue al menos un item con descripción', 'error');
        return;
    }
    
    try {
        showToast('Enviando solicitud...', 'info');
        
        const response = await fetch(`${API_URL}/solicitudes-cotizacion`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden_trabajo: parseInt(idOrden),
                id_encargado_repuestos: parseInt(idEncargado),
                items: itemsValidos,
                observacion_general: observacionGeneral
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast(`✅ Solicitud enviada con ${itemsValidos.length} item(s)`, 'success');
            cerrarModal('modalSolicitudCotizacion');
            
            limpiarItemsSolicitud();
            document.getElementById('solicitud_observacion').value = '';
            document.getElementById('solicitud_id_encargado').value = '';
            
            await cargarSolicitudesCotizacion();
            renderSolicitudesCotizacion();
        } else {
            showToast(data.error || 'Error al crear solicitud', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

async function eliminarSolicitudCotizacion(id) {
    if (!confirm('¿Estás seguro de eliminar esta solicitud?')) return;
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Solicitud eliminada', 'success');
            await cargarSolicitudesCotizacion();
            renderSolicitudesCotizacion();
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// APARTADO 2: ASIGNAR PRECIOS Y ENVIAR COTIZACIÓN
// =====================================================
let currentOrdenPrecios = null;

function abrirModalAsignarPrecios(idOrden) {
    const orden = serviciosTecnicos.find(o => o.id_orden === idOrden);
    if (!orden) {
        showToast('Orden no encontrada', 'error');
        return;
    }
    
    const modal = document.getElementById('modalAsignarPrecios');
    const ordenInfo = document.getElementById('ordenInfo');
    const serviciosContainer = document.getElementById('serviciosContainer');
    
    ordenInfo.innerHTML = `
        <p><strong><i class="fas fa-clipboard"></i> Orden:</strong> ${orden.codigo_unico}</p>
        <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${orden.vehiculo} (${orden.placa})</p>
        <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${orden.cliente_nombre}</p>
        <p><strong><i class="fas fa-phone"></i> Contacto:</strong> ${orden.cliente_contacto || 'No registrado'}</p>
    `;
    
    serviciosContainer.innerHTML = orden.servicios.map(servicio => `
        <div class="servicio-precio-row">
            <span class="servicio-desc">${servicio.descripcion}</span>
            <input type="number" id="precio_${servicio.id_servicio}" class="form-control servicio-precio-input" 
                   placeholder="Precio Bs." step="0.01" value="${servicio.precio_asignado || ''}">
        </div>
    `).join('');
    
    currentOrdenPrecios = orden;
    abrirModal('modalAsignarPrecios');
}

async function enviarCotizacionAlCliente() {
    if (!currentOrdenPrecios) return;
    
    const servicios = [];
    let total = 0;
    
    for (const servicio of currentOrdenPrecios.servicios) {
        const input = document.getElementById(`precio_${servicio.id_servicio}`);
        const precio = parseFloat(input?.value);
        
        if (isNaN(precio) || precio <= 0) {
            showToast(`Asigne un precio válido para: ${servicio.descripcion}`, 'error');
            return;
        }
        
        servicios.push({
            id_servicio: servicio.id_servicio,
            precio: precio
        });
        total += precio;
    }
    
    try {
        const response = await fetch(`${API_URL}/asignar-precios`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenPrecios.id_orden,
                servicios: servicios
            })
        });
        
        const data = await response.json();
        if (!data.success) {
            showToast(data.error || 'Error al asignar precios', 'error');
            return;
        }
        
        const response2 = await fetch(`${API_URL}/enviar-cotizacion-cliente/${currentOrdenPrecios.id_orden}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data2 = await response2.json();
        if (data2.success) {
            showToast(`✅ Cotización enviada al cliente. Total: Bs. ${total.toFixed(2)}`, 'success');
            cerrarModal('modalAsignarPrecios');
            await cargarServiciosPendientes();
            await cargarCotizacionesEnviadas();
            renderOrdenesPendientes();
            renderCotizacionesEnviadas();
        } else {
            showToast(data2.error || 'Error al enviar cotización', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

async function verDetalleCotizacion(idCotizacion) {
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${idCotizacion}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            const detalle = data.detalle;
            const container = document.getElementById('detalleCotizacionContainer');
            
            const serviciosHtml = detalle.servicios.map(s => `
                <div class="servicio-item">
                    <span class="servicio-descripcion">${s.descripcion}</span>
                    <span>Bs. ${s.precio.toFixed(2)}</span>
                    <span>${s.aprobado_por_cliente ? 
                        '<span class="status-badge status-aprobado"><i class="fas fa-check"></i> Aprobado</span>' : 
                        '<span class="status-badge status-pendiente">Pendiente</span>'}</span>
                </div>
            `).join('');
            
            container.innerHTML = `
                <div class="orden-info-card">
                    <p><strong>Orden:</strong> ${detalle.orden_codigo}</p>
                    <p><strong>Vehículo:</strong> ${detalle.vehiculo}</p>
                    <p><strong>Fecha:</strong> ${formatDate(detalle.fecha_generacion)}</p>
                    <p><strong>Estado:</strong> ${renderEstadoClienteBadge(detalle.estado)}</p>
                </div>
                <h4 style="margin: 1rem 0 0.5rem 0;">Servicios Cotizados:</h4>
                ${serviciosHtml}
                <div class="orden-footer" style="margin-top: 1rem;">
                    <strong>Total: Bs. ${detalle.total?.toFixed(2) || '0.00'}</strong>
                </div>
            `;
            
            abrirModal('modalDetalleCotizacion');
        } else {
            showToast('Error al cargar detalle', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// APARTADO 2B: CONFIGURACIÓN DE PAGO
// =====================================================

async function loadPaymentConfig() {
    try {
        const response = await fetch(`${API_URL}/configuracion-pago`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            if (data.qr_url) {
                const qrImagen = document.getElementById('qrImagen');
                if (qrImagen) {
                    qrImagen.src = data.qr_url;
                    qrImagen.style.display = 'block';
                    const placeholder = document.getElementById('qrPlaceholder');
                    if (placeholder) placeholder.style.display = 'none';
                }
            }
            const datosCuenta = document.getElementById('datosCuenta');
            if (datosCuenta && data.datos_cuenta) {
                datosCuenta.value = data.datos_cuenta;
            }
        }
    } catch (error) {
        console.error('Error cargando configuración de pago:', error);
    }
}

function setupPaymentListeners() {
    const btnSubirQR = document.getElementById('btnSubirQR');
    const inputQR = document.getElementById('inputQR');
    const btnEliminarQR = document.getElementById('btnEliminarQR');
    const btnGuardarCuenta = document.getElementById('btnGuardarDatosCuenta');
    
    if (btnSubirQR) {
        btnSubirQR.addEventListener('click', () => inputQR?.click());
    }
    if (inputQR) {
        inputQR.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const qrUrl = event.target.result;
                    await savePaymentConfig(qrUrl, null);
                    const qrImagen = document.getElementById('qrImagen');
                    if (qrImagen) {
                        qrImagen.src = qrUrl;
                        qrImagen.style.display = 'block';
                        const placeholder = document.getElementById('qrPlaceholder');
                        if (placeholder) placeholder.style.display = 'none';
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
    if (btnEliminarQR) {
        btnEliminarQR.addEventListener('click', async () => {
            await savePaymentConfig(null, null);
            const qrImagen = document.getElementById('qrImagen');
            if (qrImagen) {
                qrImagen.src = '';
                qrImagen.style.display = 'none';
                const placeholder = document.getElementById('qrPlaceholder');
                if (placeholder) placeholder.style.display = 'flex';
            }
            showToast('QR eliminado', 'info');
        });
    }
    if (btnGuardarCuenta) {
        btnGuardarCuenta.addEventListener('click', async () => {
            const datosCuenta = document.getElementById('datosCuenta')?.value || '';
            await savePaymentConfig(null, datosCuenta);
            showToast('Datos de cuenta guardados', 'success');
        });
    }
}

async function savePaymentConfig(qrUrl, datosCuenta) {
    try {
        const body = {};
        if (qrUrl !== undefined) body.qr_url = qrUrl;
        if (datosCuenta !== undefined) body.datos_cuenta = datosCuenta;
        
        const response = await fetch(`${API_URL}/configuracion-pago`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        if (!data.success) {
            showToast('Error al guardar configuración', 'error');
        }
    } catch (error) {
        console.error('Error guardando configuración:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// APARTADO 3: SOLICITAR COMPRA
// =====================================================
let currentSolicitudCompra = null;

async function solicitarCompraDesdeCotizacion(idSolicitudCotizacion) {
    const solicitud = solicitudesCotizacion.find(s => s.id === idSolicitudCotizacion);
    if (!solicitud) {
        showToast('Solicitud no encontrada', 'error');
        return;
    }
    
    if (solicitud.estado !== 'cotizado') {
        showToast('Esta solicitud aún no tiene precio cotizado', 'error');
        return;
    }
    
    limpiarItemsCompra();
    
    itemsCompra.push({
        descripcion: solicitud.descripcion_pieza,
        cantidad: solicitud.cantidad,
        observacion: solicitud.observacion_jefe_taller || ''
    });
    renderCompraItemsList();
    
    const modal = document.getElementById('modalSolicitarCompra');
    const infoContainer = document.getElementById('solicitudCompraInfo');
    
    if (infoContainer) {
        infoContainer.innerHTML = `
            <p><strong><i class="fas fa-file-invoice"></i> Solicitud Cotización #${solicitud.id}</strong></p>
            <p><strong><i class="fas fa-clipboard"></i> Orden:</strong> ${solicitud.orden_codigo}</p>
            <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${solicitud.vehiculo}</p>
            <p><strong><i class="fas fa-tag"></i> Precio Cotizado:</strong> Bs. ${solicitud.precio_cotizado?.toFixed(2) || '0.00'}</p>
            <p><strong><i class="fas fa-truck"></i> Proveedor:</strong> ${solicitud.proveedor_info || 'Por definir'}</p>
        `;
    }
    
    currentSolicitudCompra = solicitud;
    abrirModal('modalSolicitarCompra');
}

async function confirmarSolicitudCompra() {
    if (!currentSolicitudCompra) return;
    
    const itemsValidos = itemsCompra.filter(item => item.descripcion.trim() !== '');
    if (itemsValidos.length === 0) {
        showToast('Agregue al menos un item con descripción', 'error');
        return;
    }
    
    const mensaje = document.getElementById('compra_mensaje')?.value || '';
    
    try {
        showToast('Enviando solicitud de compra...', 'info');
        
        const response = await fetch(`${API_URL}/solicitudes-compra`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_solicitud_cotizacion: currentSolicitudCompra.id,
                items: itemsValidos,
                mensaje: mensaje
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast(`✅ Solicitud de compra enviada con ${itemsValidos.length} item(s)`, 'success');
            cerrarModal('modalSolicitarCompra');
            
            limpiarItemsCompra();
            if (document.getElementById('compra_mensaje')) {
                document.getElementById('compra_mensaje').value = '';
            }
            
            await cargarSolicitudesCotizacion();
            await cargarSolicitudesCompra();
            renderSolicitudesCotizacion();
            renderSolicitudesCompra();
        } else {
            showToast(data.error || 'Error al crear solicitud de compra', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

async function aprobarSolicitudCompra(id) {
    if (!confirm('¿Confirmar que la compra se ha realizado?')) return;
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${id}/aprobar`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Compra registrada exitosamente', 'success');
            await cargarSolicitudesCompra();
            renderSolicitudesCompra();
        } else {
            showToast(data.error || 'Error al registrar compra', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

function verSolicitudCompra(id) {
    const solicitud = solicitudesCompra.find(s => s.id === id);
    if (!solicitud) return;
    showToast(`Solicitud: ${solicitud.descripcion_pieza} - Estado: ${solicitud.estado}`, 'info');
}

// =====================================================
// LOGOUT
// =====================================================

function logout() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    window.location.href = '/';
}

// =====================================================
// INICIALIZACIÓN Y EVENT LISTENERS
// =====================================================

async function inicializar() {
    mostrarFechaActual();
    await cargarUsuarioActual();
    await cargarDatosIniciales();
    setupEventListeners();
    await loadPaymentConfig();
}

function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabContent = document.getElementById(tabId);
            if (tabContent) tabContent.classList.add('active');
        });
    });
    
    // Botones
    const btnNueva = document.getElementById('btnNuevaSolicitudCotizacion');
    if (btnNueva) btnNueva.addEventListener('click', () => {
        limpiarItemsSolicitud();
        abrirModal('modalSolicitudCotizacion');
    });
    
    const saveBtn = document.getElementById('saveSolicitudModal');
    if (saveBtn) saveBtn.addEventListener('click', crearSolicitudCotizacion);
    
    const enviarBtn = document.getElementById('enviarCotizacionModal');
    if (enviarBtn) enviarBtn.addEventListener('click', enviarCotizacionAlCliente);
    
    const confirmarBtn = document.getElementById('confirmarSolicitudCompra');
    if (confirmarBtn) confirmarBtn.addEventListener('click', confirmarSolicitudCompra);
    
    const btnAgregarItem = document.getElementById('btnAgregarItem');
    if (btnAgregarItem) btnAgregarItem.addEventListener('click', agregarItemSolicitud);
    
    const btnAgregarItemCompra = document.getElementById('btnAgregarItemCompra');
    if (btnAgregarItemCompra) btnAgregarItemCompra.addEventListener('click', agregarItemCompra);
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // Cerrar modales
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
    
    // Filtros
    const filtros = ['filtroOrdenSolicitud', 'filtroEstadoSolicitud', 'searchSolicitud',
                     'filtroOrdenServicio', 'searchServicio', 'filtroOrdenCompra',
                     'filtroEstadoCompra', 'searchCompra'];
    
    filtros.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', async () => {
                if (id.includes('Solicitud')) {
                    await cargarSolicitudesCotizacion();
                    renderSolicitudesCotizacion();
                } else if (id.includes('Compra')) {
                    await cargarSolicitudesCompra();
                    renderSolicitudesCompra();
                } else if (id.includes('Servicio')) {
                    renderOrdenesPendientes();
                }
            });
            if (el.id?.includes('search')) {
                el.addEventListener('input', () => {
                    if (id.includes('Solicitud')) renderSolicitudesCotizacion();
                    else if (id.includes('Compra')) renderSolicitudesCompra();
                    else if (id.includes('Servicio')) renderOrdenesPendientes();
                });
            }
        }
    });
    
    // Refresh buttons
    const refreshBtns = ['refreshSolicitudes', 'refreshServicios', 'refreshCompras'];
    refreshBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', async () => {
                showToast('Actualizando datos...', 'info');
                await cargarDatosIniciales();
            });
        }
    });
    
    setupPaymentListeners();
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', inicializar);

// Funciones globales
window.eliminarSolicitudCotizacion = eliminarSolicitudCotizacion;
window.solicitarCompraDesdeCotizacion = solicitarCompraDesdeCotizacion;
window.abrirModalAsignarPrecios = abrirModalAsignarPrecios;
window.verDetalleCotizacion = verDetalleCotizacion;
window.verSolicitudCompra = verSolicitudCompra;
window.aprobarSolicitudCompra = aprobarSolicitudCompra;
window.cerrarModal = cerrarModal;
window.actualizarItemSolicitud = actualizarItemSolicitud;
window.eliminarItemSolicitud = eliminarItemSolicitud;
window.actualizarItemCompra = actualizarItemCompra;
window.eliminarItemCompra = eliminarItemCompra;
window.logout = logout;