// =====================================================
// COTIZACIONES.JS - JEFE DE TALLER
// VERSIÓN PROFESIONAL - COMPLETA Y CORREGIDA
// =====================================================

const API_URL = window.location.origin + '/api/jefe-taller';
let currentUser = null;
let currentUserRoles = [];

// Datos globales
let ordenesAprobadas = [];
let ordenesConServicios = [];
let encargadosRepuestos = [];
let solicitudesCotizacion = [];
let cotizacionesEnviadas = [];
let solicitudesCompra = [];

// Items dinámicos
let itemsSolicitud = [];
let itemsCompra = [];

// Editor Quill y datos
let quillEditor = null;
let currentCotizacionData = null;
let currentOrdenData = null;
let serviciosActuales = [];
let firmaBase64 = null;

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
        'cotizado': 'status-cotizado',
        'aprobado': 'status-aprobado',
        'rechazado': 'status-rechazado',
        'comprado': 'status-comprado',
        'enviada': 'status-enviado'
    };
    
    const texto = {
        'pendiente': 'Pendiente',
        'cotizado': 'Cotizado',
        'aprobado': 'Aprobado',
        'enviada': 'Enviada',
        'comprado': 'Comprado'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${estado === 'cotizado' || estado === 'comprado' ? 'fa-check-circle' : 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE ITEMS
// =====================================================

function renderItemsSolicitud() {
    const container = document.getElementById('itemsListSolicitud');
    if (!container) return;
    
    if (itemsSolicitud.length === 0) {
        container.innerHTML = `<div class="item-empty"><i class="fas fa-box-open"></i><p>No hay items agregados</p><small>Haz clic en "Agregar item" para comenzar</small></div>`;
        return;
    }
    
    container.innerHTML = itemsSolicitud.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Descripción del item" onchange="actualizarItemSolicitud(${index}, 'descripcion', this.value)">
                <input type="number" class="item-cantidad" value="${item.cantidad}" min="1" onchange="actualizarItemSolicitud(${index}, 'cantidad', parseInt(this.value))">
                <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle (marca, especificaciones...)" onchange="actualizarItemSolicitud(${index}, 'detalle', this.value)">
            </div>
            <div class="item-actions">
                <button class="btn-remove-item" onclick="eliminarItemSolicitud(${index})"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `).join('');
}

function agregarItemSolicitud() {
    itemsSolicitud.push({ descripcion: '', cantidad: 1, detalle: '' });
    renderItemsSolicitud();
    setTimeout(() => {
        const lastInput = document.querySelector('#itemsListSolicitud .item-row:last-child .item-descripcion');
        if (lastInput) lastInput.focus();
    }, 100);
}

function actualizarItemSolicitud(index, campo, valor) {
    if (itemsSolicitud[index]) itemsSolicitud[index][campo] = valor;
}

function eliminarItemSolicitud(index) {
    itemsSolicitud.splice(index, 1);
    renderItemsSolicitud();
}

function limpiarItemsSolicitud() {
    itemsSolicitud = [];
    renderItemsSolicitud();
}

function renderItemsCompra() {
    const container = document.getElementById('itemsListCompra');
    if (!container) return;
    
    if (itemsCompra.length === 0) {
        container.innerHTML = `<div class="item-empty"><i class="fas fa-box-open"></i><p>No hay items agregados</p><small>Haz clic en "Agregar item" para comenzar</small></div>`;
        return;
    }
    
    container.innerHTML = itemsCompra.map((item, index) => `
        <div class="item-row">
            <div class="item-fields">
                <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Descripción" onchange="actualizarItemCompra(${index}, 'descripcion', this.value)">
                <input type="number" class="item-cantidad" value="${item.cantidad}" min="1" onchange="actualizarItemCompra(${index}, 'cantidad', parseInt(this.value))">
                <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle" onchange="actualizarItemCompra(${index}, 'detalle', this.value)">
            </div>
            <div class="item-actions">
                <button class="btn-remove-item" onclick="eliminarItemCompra(${index})"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `).join('');
}

function agregarItemCompra() {
    itemsCompra.push({ descripcion: '', cantidad: 1, detalle: '' });
    renderItemsCompra();
}

function actualizarItemCompra(index, campo, valor) {
    if (itemsCompra[index]) itemsCompra[index][campo] = valor;
}

function eliminarItemCompra(index) {
    itemsCompra.splice(index, 1);
    renderItemsCompra();
}

function limpiarItemsCompra() {
    itemsCompra = [];
    renderItemsCompra();
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarOrdenesConServicios() {
    try {
        const response = await fetch(`${API_URL}/ordenes-con-servicios`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            ordenesConServicios = data.ordenes || [];
            renderOrdenes();
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        ordenesConServicios = [];
    }
}

async function cargarSolicitudesCotizacion() {
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            solicitudesCotizacion = data.solicitudes || [];
            renderSolicitudesCotizacion();
        }
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        solicitudesCotizacion = [];
    }
}

async function cargarCotizacionesEnviadas() {
    try {
        const response = await fetch(`${API_URL}/cotizaciones-enviadas`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            cotizacionesEnviadas = data.cotizaciones || [];
            renderCotizacionesEnviadas();
        }
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
        cotizacionesEnviadas = [];
    }
}

async function cargarSolicitudesCompra() {
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            solicitudesCompra = data.solicitudes || [];
            renderSolicitudesCompra();
        }
    } catch (error) {
        console.error('Error cargando solicitudes de compra:', error);
        solicitudesCompra = [];
    }
}

async function cargarEncargadosRepuestos() {
    try {
        const response = await fetch(`${API_URL}/encargados-repuestos`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            encargadosRepuestos = data.encargados || [];
            renderSelects();
        }
    } catch (error) {
        console.error('Error cargando encargados:', error);
        encargadosRepuestos = [];
    }
}

async function cargarOrdenesAprobadas() {
    try {
        const response = await fetch(`${API_URL}/ordenes-aprobadas`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            ordenesAprobadas = data.ordenes || [];
            renderSelects();
        }
    } catch (error) {
        console.error('Error cargando órdenes aprobadas:', error);
        ordenesAprobadas = [];
    }
}

async function cargarDatosIniciales() {
    mostrarLoading(true);
    try {
        await Promise.all([
            cargarOrdenesConServicios(),
            cargarSolicitudesCotizacion(),
            cargarCotizacionesEnviadas(),
            cargarSolicitudesCompra(),
            cargarEncargadosRepuestos(),
            cargarOrdenesAprobadas()
        ]);
    } catch (error) {
        console.error('Error cargando datos:', error);
        showToast('Error al cargar los datos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZADO DE ÓRDENES
// =====================================================

function renderOrdenes() {
    const container = document.getElementById('ordenesContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('searchOrden')?.value.toLowerCase() || '';
    let filtered = [...ordenesConServicios];
    
    if (searchTerm) {
        filtered = filtered.filter(o => 
            (o.codigo_unico || '').toLowerCase().includes(searchTerm) ||
            (o.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
            (o.vehiculo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No hay órdenes con servicios disponibles</p></div>`;
        return;
    }
    
    container.innerHTML = filtered.map(orden => `
        <div class="orden-card">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                </div>
                <div>
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                    <span class="orden-total"><i class="fas fa-dollar-sign"></i> Total: Bs. ${orden.total_orden?.toFixed(2) || '0.00'}</span>
                </div>
            </div>
            <div class="servicios-container">
                ${orden.servicios.map(serv => `
                    <div class="servicio-row">
                        <div class="servicio-info">
                            <div class="servicio-nombre">${escapeHtml(serv.descripcion)}</div>
                            ${serv.items && serv.items.length > 0 ? `<div class="servicio-items">📦 ${serv.items.length} repuesto(s)</div>` : ''}
                        </div>
                        <div class="servicio-estado estado-${serv.estado_cotizacion}">
                            <i class="fas ${serv.estado_cotizacion === 'cotizado' ? 'fa-check-circle' : 'fa-clock'}"></i>
                            ${serv.estado_cotizacion === 'cotizado' ? 'Cotizado' : (serv.estado_cotizacion === 'solicitado' ? 'Cotización solicitada' : 'Pendiente')}
                        </div>
                        <div class="servicio-precio">Bs. ${serv.precio_cotizado?.toFixed(2) || '0.00'}</div>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="editarServicioCotizacion(${orden.id_orden}, ${serv.id_servicio})" title="Editar"><i class="fas fa-edit"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="orden-footer">
                <button class="btn-primary" onclick="abrirModalGenerarCotizacion(${orden.id_orden})">
                    <i class="fas fa-file-invoice"></i> Generar Cotización
                </button>
                <button class="btn-outline" onclick="editarServiciosOrden(${orden.id_orden})">
                    <i class="fas fa-edit"></i> Editar Servicios
                </button>
            </div>
        </div>
    `).join('');
}

function renderSolicitudesCotizacion() {
    const tbody = document.getElementById('tablaSolicitudesCotizacion');
    if (!tbody) return;
    
    if (solicitudesCotizacion.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-inbox"></i><p>No hay solicitudes de cotización</p></div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = solicitudesCotizacion.map(s => `
        <tr>
            <td>${s.id}</td>
            <td><strong>${escapeHtml(s.orden_codigo)}</strong></td>
            <td>${escapeHtml(s.vehiculo)}</strong></td>
            <td>${escapeHtml(s.servicio_descripcion || '-')}</strong></td>
            <td>${s.items?.length || 1} item(s)</td>
            <td>${statusBadge(s.estado)}</strong></td>
            <td>${s.precio_cotizado ? `Bs. ${s.precio_cotizado.toFixed(2)}` : '-'}</td>
            <td>${formatDate(s.fecha_solicitud)}</strong></td>
            <td class="action-buttons">
                ${s.estado === 'pendiente' ? `<button class="action-btn delete" onclick="eliminarSolicitudCotizacion(${s.id})"><i class="fas fa-trash-alt"></i></button>` : ''}
                ${s.estado === 'cotizado' ? `<button class="action-btn send" onclick="solicitarCompraDesdeCotizacion(${s.id})"><i class="fas fa-shopping-cart"></i></button>` : ''}
            </strong>
        </tr>
    `).join('');
}

function renderCotizacionesEnviadas() {
    const tbody = document.getElementById('tablaCotizacionesEnviadas');
    if (!tbody) return;
    
    if (cotizacionesEnviadas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-envelope"></i><p>No hay cotizaciones enviadas</p></div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = cotizacionesEnviadas.map(cot => `
        <tr>
            <td><strong>${escapeHtml(cot.orden_codigo)}</strong></td>
            <td>${escapeHtml(cot.vehiculo)}</strong></td>
            <td>${escapeHtml(cot.cliente_nombre)}</strong></td>
            <td><strong>Bs. ${cot.total?.toFixed(2) || '0.00'}</strong></td>
            <td>${cot.servicios_aprobados || 0}/${cot.total_servicios || 0} servicios</strong></td>
            <td>${statusBadge(cot.estado || 'enviada')}</strong></td>
            <td><button class="action-btn view" onclick="verDetalleCotizacion(${cot.id})"><i class="fas fa-eye"></i></button></strong>
        </tr>
    `).join('');
}

function renderSolicitudesCompra() {
    const tbody = document.getElementById('tablaSolicitudesCompra');
    if (!tbody) return;
    
    if (solicitudesCompra.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No hay solicitudes de compra</p></div></strong></tr>`;
        return;
    }
    
    tbody.innerHTML = solicitudesCompra.map(s => `
        <tr>
            <td>${s.id}</strong></td>
            <td><strong>${escapeHtml(s.orden_codigo)}</strong></td>
            <td>${escapeHtml(s.vehiculo)}</strong></td>
            <td>${escapeHtml(s.servicio_descripcion || '-')}</strong></strong>
            <td>${s.items?.length || 1} item(s)</strong></strong>
            <td>${statusBadge(s.estado)}</strong></strong>
            <td>${formatDate(s.fecha_solicitud)}</strong></strong>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verSolicitudCompra(${s.id})"><i class="fas fa-eye"></i></button>
                ${s.estado === 'pendiente' ? `<button class="action-btn approve" onclick="aprobarCompra(${s.id})"><i class="fas fa-check-circle"></i></button>` : ''}
            </strong>
        </tr>
    `).join('');
}

function renderSelects() {
    const selectOrden = document.getElementById('solicitud_id_orden_trabajo');
    if (selectOrden && ordenesAprobadas.length > 0) {
        const currentValue = selectOrden.value;
        selectOrden.innerHTML = '<option value="">Seleccionar orden</option>' + 
            ordenesAprobadas.map(o => `<option value="${o.id_orden}">${escapeHtml(o.codigo_unico)} - ${escapeHtml(o.vehiculo)}</option>`).join('');
        if (currentValue) selectOrden.value = currentValue;
    }
    
    const selectEncargado = document.getElementById('solicitud_id_encargado');
    if (selectEncargado && encargadosRepuestos.length > 0) {
        selectEncargado.innerHTML = '<option value="">Seleccionar encargado</option>' +
            encargadosRepuestos.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
    }
}

// =====================================================
// ACCIONES - SOLICITUDES DE COTIZACIÓN
// =====================================================

async function eliminarSolicitudCotizacion(id) {
    if (!confirm('¿Eliminar esta solicitud?')) return;
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            showToast('Solicitud eliminada', 'success');
            await cargarSolicitudesCotizacion();
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// EDITOR DE SERVICIOS
// =====================================================

async function editarServiciosOrden(id_orden) {
    currentOrdenData = { id_orden };
    mostrarLoading(true);
    try {
        const orden = ordenesConServicios.find(o => o.id_orden === id_orden);
        if (orden && orden.servicios) {
            serviciosActuales = orden.servicios.map(s => ({
                id_servicio: s.id_servicio,
                descripcion: s.descripcion,
                precio: s.precio_cotizado || 0,
                items: s.items || []
            }));
        } else {
            serviciosActuales = [];
        }
        renderEditorServicios();
        abrirModal('modalEditorServicios');
    } catch (error) {
        showToast('Error al cargar servicios', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderEditorServicios() {
    const container = document.getElementById('serviciosEditablesContainer');
    if (!container) return;
    
    if (serviciosActuales.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-plus-circle"></i><p>No hay servicios. Haz clic en "Agregar Servicio"</p></div>`;
        return;
    }
    
    container.innerHTML = serviciosActuales.map((serv, idx) => `
        <div class="servicio-editable-card">
            <div class="servicio-editable-header" onclick="toggleServicioEditable(${idx})">
                <div class="servicio-editable-titulo">${escapeHtml(serv.descripcion || 'Nuevo Servicio')}</div>
                <div class="servicio-editable-precio">Bs. ${(serv.precio || 0).toFixed(2)}</div>
            </div>
            <div class="servicio-editable-body" id="servicio-body-${idx}">
                <div class="form-group">
                    <label>Nombre del Servicio</label>
                    <input type="text" class="form-input" value="${escapeHtml(serv.descripcion || '')}" onchange="actualizarServicio(${idx}, 'descripcion', this.value)">
                </div>
                <div class="form-group">
                    <label>Precio del Servicio</label>
                    <input type="number" class="form-input" step="0.01" value="${serv.precio || 0}" onchange="actualizarServicio(${idx}, 'precio', parseFloat(this.value))">
                </div>
                <div class="form-group">
                    <label>Repuestos/Items</label>
                    <div id="items-servicio-${idx}">
                        ${(serv.items || []).map((item, itemIdx) => `
                            <div class="item-row">
                                <div class="item-fields">
                                    <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Descripción" onchange="actualizarItemServicio(${idx}, ${itemIdx}, 'descripcion', this.value)">
                                    <input type="number" class="item-cantidad" value="${item.cantidad || 1}" min="1" onchange="actualizarItemServicio(${idx}, ${itemIdx}, 'cantidad', parseInt(this.value))">
                                    <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle" onchange="actualizarItemServicio(${idx}, ${itemIdx}, 'detalle', this.value)">
                                </div>
                                <div class="item-actions">
                                    <button class="btn-remove-item" onclick="eliminarItemServicio(${idx}, ${itemIdx})"><i class="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn-add-item" style="margin-top: 0.5rem;" onclick="agregarItemServicio(${idx})">
                        <i class="fas fa-plus-circle"></i> Agregar item
                    </button>
                </div>
                <div class="action-buttons" style="margin-top: 1rem;">
                    <button class="action-btn delete" onclick="eliminarServicio(${idx})"><i class="fas fa-trash-alt"></i> Eliminar Servicio</button>
                </div>
            </div>
        </div>
    `).join('');
}

function toggleServicioEditable(idx) {
    const body = document.getElementById(`servicio-body-${idx}`);
    if (body) body.classList.toggle('active');
}

function actualizarServicio(idx, campo, valor) {
    if (serviciosActuales[idx]) serviciosActuales[idx][campo] = valor;
}

function agregarItemServicio(servIdx) {
    if (!serviciosActuales[servIdx].items) serviciosActuales[servIdx].items = [];
    serviciosActuales[servIdx].items.push({ descripcion: '', cantidad: 1, detalle: '', precio_unitario: 0 });
    renderEditorServicios();
}

function actualizarItemServicio(servIdx, itemIdx, campo, valor) {
    if (serviciosActuales[servIdx]?.items?.[itemIdx]) {
        serviciosActuales[servIdx].items[itemIdx][campo] = valor;
    }
}

function eliminarItemServicio(servIdx, itemIdx) {
    serviciosActuales[servIdx].items.splice(itemIdx, 1);
    renderEditorServicios();
}

function agregarServicio() {
    serviciosActuales.push({ descripcion: 'Nuevo Servicio', precio: 0, items: [] });
    renderEditorServicios();
}

function eliminarServicio(idx) {
    serviciosActuales.splice(idx, 1);
    renderEditorServicios();
}

async function guardarServiciosEditados() {
    if (!currentOrdenData) {
        showToast('No hay orden seleccionada', 'error');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/servicios-cotizacion/${currentOrdenData.id_orden}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ servicios: serviciosActuales })
        });
        const data = await response.json();
        if (data.success) {
            showToast('Servicios guardados correctamente', 'success');
            cerrarModal('modalEditorServicios');
            await cargarOrdenesConServicios();
        } else {
            showToast(data.error || 'Error al guardar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function editarServicioCotizacion(id_orden, id_servicio) {
    currentOrdenData = { id_orden };
    const orden = ordenesConServicios.find(o => o.id_orden === id_orden);
    const servicio = orden?.servicios.find(s => s.id_servicio === id_servicio);
    
    serviciosActuales = [{
        id_servicio: servicio.id_servicio,
        descripcion: servicio.descripcion,
        precio: servicio.precio_cotizado || 0,
        items: servicio.items || []
    }];
    
    renderEditorServicios();
    abrirModal('modalEditorServicios');
}

// =====================================================
// COTIZACIÓN AL CLIENTE - EDITOR PROFESIONAL
// =====================================================

async function abrirModalGenerarCotizacion(id_orden) {
    mostrarLoading(true);
    try {
        const orden = ordenesConServicios.find(o => o.id_orden === id_orden);
        if (!orden) {
            showToast('Orden no encontrada', 'error');
            return;
        }
        
        const datosOrden = await obtenerDatosOrden(id_orden);
        currentOrdenData = { id_orden, datosOrden };
        serviciosActuales = orden.servicios.map(s => ({
            id_servicio: s.id_servicio,
            descripcion: s.descripcion,
            precio: s.precio_cotizado || 0,
            items: s.items || []
        }));
        
        const fecha = new Date();
        const fechaFormateada = `${fecha.getDate()} de ${fecha.toLocaleString('es-BO', { month: 'long' })} de ${fecha.getFullYear()}`;
        const contenidoInicial = generarHTMLCotizacion(orden, datosOrden, fechaFormateada);
        
        const container = document.getElementById('generarCotizacionBody');
        container.innerHTML = `
            <div class="formato-rapido">
                <button class="btn-formato" onclick="insertarTextoRapido('vehiculo')"><i class="fas fa-car"></i> Vehículo</button>
                <button class="btn-formato" onclick="insertarTextoRapido('diagnostico')"><i class="fas fa-stethoscope"></i> Diagnóstico</button>
                <button class="btn-formato" onclick="insertarTextoRapido('costos')"><i class="fas fa-table"></i> Tabla Costos</button>
                <button class="btn-formato" onclick="insertarTextoRapido('sugerencias')"><i class="fas fa-lightbulb"></i> Sugerencias</button>
                <button class="btn-formato" onclick="insertarTextoRapido('firma')"><i class="fas fa-signature"></i> Firma</button>
                <button class="btn-formato" onclick="abrirEditorServicios()"><i class="fas fa-edit"></i> Editar Servicios</button>
                <button class="btn-formato" onclick="subirFirmaDigital()"><i class="fas fa-upload"></i> Subir Firma</button>
                <button class="btn-formato" onclick="limpiarEditor()"><i class="fas fa-trash-alt"></i> Limpiar</button>
            </div>
            <div id="quillEditorContainer" style="background: white; border-radius: 8px; min-height: 500px;"></div>
            <div class="form-group" style="margin-top: 1rem;">
                <textarea id="notasAdicionales" class="form-textarea" rows="2" placeholder="Notas adicionales para el cliente..."></textarea>
            </div>
        `;
        
        setTimeout(() => {
            if (quillEditor) quillEditor = null;
            const editorContainer = document.getElementById('quillEditorContainer');
            if (editorContainer) {
                quillEditor = new Quill(editorContainer, {
                    theme: 'snow',
                    modules: {
                        toolbar: [
                            [{ 'font': ['arial', 'times-new-roman', 'courier-new', 'georgia'] }],
                            [{ 'size': ['10px', '12px', '14px', '16px', '18px', '24px'] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ 'color': [] }, { 'background': [] }],
                            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                            [{ 'indent': '-1'}, { 'indent': '+1' }],
                            [{ 'align': [] }],
                            ['blockquote', 'code-block'],
                            ['link', 'clean']
                        ]
                    },
                    placeholder: 'Escribe tu cotización profesional aquí...'
                });
                quillEditor.root.style.fontFamily = "'Times New Roman', Times, serif";
                quillEditor.root.style.fontSize = '14px';
                quillEditor.root.style.lineHeight = '1.6';
                quillEditor.root.style.color = '#1a1a2e';
                quillEditor.root.innerHTML = contenidoInicial;
            }
        }, 100);
        
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function limpiarEditor() {
    if (quillEditor && confirm('¿Estás seguro de limpiar todo el contenido del editor?')) {
        quillEditor.root.innerHTML = '';
        showToast('Editor limpiado', 'success');
    }
}

async function obtenerDatosOrden(id_orden) {
    try {
        const response = await fetch(`${API_URL}/datos-orden/${id_orden}`, { headers: getAuthHeaders() });
        const data = await response.json();
        return data.success ? data.datos : {};
    } catch (error) {
        console.error('Error obteniendo datos de orden:', error);
        return {};
    }
}

function generarHTMLCotizacion(orden, datosOrden, fecha) {
    let tablaCostos = `
        <h2 style="color: #C1121F;">Detalle de Trabajos y Repuestos</h2>
        <table style="width:100%; border-collapse: collapse; margin: 15px 0;">
            <thead>
                <tr style="background: #C1121F; color: white;">
                    <th style="padding: 10px;">Descripción</th>
                    <th style="padding: 10px; text-align: center;">Cantidad</th>
                    <th style="padding: 10px; text-align: right;">Precio Unit.</th>
                    <th style="padding: 10px; text-align: right;">Total</th>
                </table>
            </thead>
            <tbody>
    `;
    let totalGeneral = 0;
    
    serviciosActuales.forEach(serv => {
        if (serv.items && serv.items.length > 0) {
            serv.items.forEach(item => {
                const precioUnitario = item.precio_unitario || (serv.precio / serv.items.length) || 0;
                const subtotal = precioUnitario * (item.cantidad || 1);
                totalGeneral += subtotal;
                tablaCostos += `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(item.descripcion)}</td>
                        <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">${item.cantidad || 1}</td>
                        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Bs. ${precioUnitario.toFixed(2)}</td>
                        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Bs. ${subtotal.toFixed(2)}</td>
                    </tr>
                `;
            });
        } else {
            totalGeneral += serv.precio;
            tablaCostos += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>${escapeHtml(serv.descripcion)}</strong></td>
                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #ddd;">1</td>
                    <td style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Bs. ${serv.precio.toFixed(2)}</td>
                    <td style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Bs. ${serv.precio.toFixed(2)}</td>
                </tr>
            `;
        }
    });
    
    tablaCostos += `
                <tr style="background: #f5f5f5;">
                    <td colspan="3" style="padding: 10px; text-align: right;"><strong>TOTAL GENERAL</strong></td>
                    <td style="padding: 10px; text-align: right;"><strong style="color: #C1121F;">Bs. ${totalGeneral.toFixed(2)}</strong></td>
                </tr>
            </tbody>
        </table>
    `;
    
    return `
        <h1 style="color: #C1121F; text-align: center;">INFORME DE COTIZACIÓN</h1>
        <p style="text-align: right;">${fecha}</p>
        
        <h2 style="color: #C1121F;">Datos del Cliente y Vehículo</h2>
        <p><strong>Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
        <p><strong>Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
        <p><strong>Marca:</strong> ${escapeHtml(datosOrden.marca || '')} | <strong>Modelo:</strong> ${escapeHtml(datosOrden.modelo || '')} | <strong>Placa:</strong> ${escapeHtml(datosOrden.placa || '')}</p>
        
        <h2 style="color: #C1121F;">Diagnóstico</h2>
        <ul>
            ${serviciosActuales.map(s => `<li><strong>${escapeHtml(s.descripcion)}</strong>${s.items && s.items.length > 0 ? `<ul>${s.items.map(i => `<li>${escapeHtml(i.descripcion)}</li>`).join('')}</ul>` : ''}</li>`).join('')}
        </ul>
        
        ${tablaCostos}
        
        <h2 style="color: #C1121F;">Sugerencias</h2>
        <ul>
            <li>Cambio de aceite cada 5,000 km</li>
            <li>Revisión de frenos cada 10,000 km</li>
            <li>Mantenimiento preventivo regular</li>
        </ul>
    `;
}

function insertarTextoRapido(tipo) {
    if (!quillEditor) return;
    const range = quillEditor.getSelection();
    const index = range ? range.index : 0;
    
    const textos = {
        'vehiculo': `<h2 style="color: #C1121F;">Características del Vehículo</h2><p><strong>Marca:</strong> ${escapeHtml(currentOrdenData?.datosOrden?.marca || '')}<br><strong>Modelo:</strong> ${escapeHtml(currentOrdenData?.datosOrden?.modelo || '')}<br><strong>Año:</strong> ${escapeHtml(currentOrdenData?.datosOrden?.anio || '')}<br><strong>Placa:</strong> ${escapeHtml(currentOrdenData?.datosOrden?.placa || '')}</p>`,
        'diagnostico': `<h2 style="color: #C1121F;">Diagnóstico</h2><ul><li>Revisión general del vehículo</li><li>Componentes desgastados por uso</li><li>Mantenimiento necesario según kilometraje</li></ul>`,
        'costos': `<h2 style="color: #C1121F;">Detalle de Costos</h2>${generarTablaCostosHTML()}`,
        'sugerencias': `<h2 style="color: #C1121F;">Sugerencias de Mantenimiento</h2><ul><li>Cambio de aceite cada 5,000 km</li><li>Revisión de frenos cada 10,000 km</li><li>Rotación de neumáticos cada 10,000 km</li></ul>`,
        'firma': `<div style="margin-top: 40px; text-align: center;"><div class="firma-container">${firmaBase64 ? `<img src="${firmaBase64}" class="firma-imagen" style="max-width:200px; max-height:80px;">` : ''}<p><strong>Ing. Carlos Bello Málaga</strong><br>FURIA MOTOR COMPANY S.R.L.<br>68176122 - 74080830 - 78753973</p></div></div>`
    };
    
    quillEditor.clipboard.dangerouslyPasteHTML(index, textos[tipo] || '');
    showToast(`Bloque "${tipo}" insertado`, 'success');
}

function generarTablaCostosHTML() {
    let html = `<table style="width:100%; border-collapse: collapse; margin: 15px 0;"><thead><tr style="background:#C1121F; color:white;"><th style="padding:8px;">Descripción</th><th style="padding:8px; text-align:center;">Cantidad</th><th style="padding:8px; text-align:right;">Precio Unit.</th><th style="padding:8px; text-align:right;">Total</th></tr></thead><tbody>`;
    serviciosActuales.forEach(serv => {
        if (serv.items && serv.items.length > 0) {
            serv.items.forEach(item => {
                const precioUnitario = item.precio_unitario || (serv.precio / serv.items.length) || 0;
                const subtotal = precioUnitario * (item.cantidad || 1);
                html += `<tr><td style="padding:8px; border-bottom:1px solid #ddd;">${escapeHtml(item.descripcion)}</td><td style="padding:8px; text-align:center;">${item.cantidad || 1}</td><td style="padding:8px; text-align:right;">Bs. ${precioUnitario.toFixed(2)}</td><td style="padding:8px; text-align:right;">Bs. ${subtotal.toFixed(2)}</td></tr>`;
            });
        } else {
            html += `<tr><td style="padding:8px; border-bottom:1px solid #ddd;"><strong>${escapeHtml(serv.descripcion)}</strong></td><td style="padding:8px; text-align:center;">1</td><td style="padding:8px; text-align:right;">Bs. ${serv.precio.toFixed(2)}</td><td style="padding:8px; text-align:right;">Bs. ${serv.precio.toFixed(2)}</td></tr>`;
        }
    });
    html += `</tbody></table>`;
    return html;
}

function abrirEditorServicios() {
    renderEditorServicios();
    abrirModal('modalEditorServicios');
}

function subirFirmaDigital() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            firmaBase64 = event.target.result;
            showToast('Firma cargada exitosamente', 'success');
            if (quillEditor) insertarTextoRapido('firma');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

async function guardarBorradorCotizacion() {
    if (!quillEditor || !currentOrdenData) {
        showToast('No hay datos para guardar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/guardar-cotizacion`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenData.id_orden,
                contenido_html: quillEditor.root.innerHTML,
                servicios: serviciosActuales,
                firma_base64: firmaBase64 || '',
                notas: document.getElementById('notasAdicionales')?.value || ''
            })
        });
        const data = await response.json();
        if (data.success) {
            showToast('Borrador guardado correctamente', 'success');
        } else {
            showToast(data.error || 'Error al guardar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function enviarCotizacionCliente() {
    if (!quillEditor || !currentOrdenData) {
        showToast('No hay datos para enviar', 'warning');
        return;
    }
    
    if (!confirm('¿Confirmas enviar esta cotización al cliente?')) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/enviar-cotizacion`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenData.id_orden,
                contenido_html: quillEditor.root.innerHTML,
                servicios: serviciosActuales,
                firma_base64: firmaBase64 || '',
                notas: document.getElementById('notasAdicionales')?.value || ''
            })
        });
        const data = await response.json();
        if (data.success) {
            showToast('Cotización enviada al cliente exitosamente', 'success');
            cerrarModal('modalGenerarCotizacion');
            await cargarOrdenesConServicios();
            await cargarCotizacionesEnviadas();
        } else {
            showToast(data.error || 'Error al enviar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VISTA PREVIA Y PDF
// =====================================================

function verVistaPrevia() {
    if (!quillEditor) {
        showToast('No hay contenido para previsualizar', 'warning');
        return;
    }
    
    const contenido = quillEditor.root.innerHTML;
    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Vista Previa Cotización</title>
            <style>
                body { font-family: 'Times New Roman', Arial, sans-serif; padding: 40px; background: #e0e0e0; margin: 0; }
                .preview { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
                h1 { color: #C1121F; text-align: center; }
                h2 { color: #C1121F; border-left: 4px solid #C1121F; padding-left: 10px; }
                table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                th { background: #C1121F; color: white; padding: 8px; }
                td { border-bottom: 1px solid #ddd; padding: 8px; }
                .firma { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; }
                @media print {
                    body { background: white; padding: 0; }
                    .preview { padding: 20px; box-shadow: none; }
                }
            </style>
        </head>
        <body>
            <div class="preview">${contenido}</div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="window.print()" style="background: #C1121F; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">🖨️ Imprimir / Guardar PDF</button>
                <button onclick="window.close()" style="background: #666; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-left: 10px; cursor: pointer;">✖️ Cerrar</button>
            </div>
        </body>
        </html>
    `);
    ventana.document.close();
}

async function exportarPDF() {
    if (!quillEditor) {
        showToast('No hay contenido para exportar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const contenido = quillEditor.root.innerHTML;
        const element = document.createElement('div');
        element.innerHTML = `
            <div style="padding: 40px; font-family: 'Times New Roman', Arial, sans-serif; max-width: 900px; margin: 0 auto;">
                ${contenido}
            </div>
        `;
        document.body.appendChild(element);
        
        const opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `Cotizacion_${currentOrdenData?.codigo_unico || currentOrdenData?.id_orden || 'orden'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, letterRendering: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        
        await html2pdf().set(opt).from(element).save();
        document.body.removeChild(element);
        showToast('PDF generado exitosamente', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al generar PDF', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// SOLICITUDES DE COMPRA
// =====================================================

async function solicitarCompraDesdeCotizacion(id_solicitud) {
    const solicitud = solicitudesCotizacion.find(s => s.id === id_solicitud);
    if (!solicitud) return;
    
    limpiarItemsCompra();
    if (solicitud.descripcion_pieza) {
        itemsCompra.push({ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad || 1, detalle: '' });
        renderItemsCompra();
    }
    
    window.currentCompraData = { id_solicitud_cotizacion: id_solicitud };
    document.getElementById('solicitudCompraInfo').innerHTML = `
        <p><strong>Orden:</strong> ${escapeHtml(solicitud.orden_codigo)}</p>
        <p><strong>Vehículo:</strong> ${escapeHtml(solicitud.vehiculo)}</p>
        <p><strong>Precio cotizado:</strong> ${solicitud.precio_cotizado ? `Bs. ${solicitud.precio_cotizado.toFixed(2)}` : 'No especificado'}</p>
    `;
    abrirModal('modalSolicitarCompra');
}

async function confirmarSolicitudCompra() {
    if (!window.currentCompraData) return;
    
    const itemsValidos = itemsCompra.filter(item => item.descripcion && item.descripcion.trim() !== '');
    if (itemsValidos.length === 0) {
        showToast('Agregue al menos un item', 'error');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_solicitud_cotizacion: window.currentCompraData.id_solicitud_cotizacion,
                items: itemsValidos,
                mensaje: document.getElementById('compra_mensaje')?.value || ''
            })
        });
        const data = await response.json();
        if (data.success) {
            showToast('Solicitud de compra creada exitosamente', 'success');
            cerrarModal('modalSolicitarCompra');
            limpiarItemsCompra();
            await cargarSolicitudesCompra();
        } else {
            showToast(data.error || 'Error al crear solicitud', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function verSolicitudCompra(id) {
    const solicitud = solicitudesCompra.find(s => s.id === id);
    if (solicitud) {
        showToast(`Solicitud #${id} - Estado: ${solicitud.estado}`, 'info');
    }
}

async function aprobarCompra(id) {
    if (!confirm('¿Confirmar que la compra se realizó?')) return;
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${id}/aprobar`, { method: 'PUT', headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            showToast('Compra registrada exitosamente', 'success');
            await cargarSolicitudesCompra();
        } else {
            showToast(data.error || 'Error al registrar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function verDetalleCotizacion(id_cotizacion) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${id_cotizacion}`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            const d = data.detalle;
            const container = document.getElementById('detalleCotizacionContainer');
            container.innerHTML = `
                <div class="orden-info-card">
                    <p><strong>Orden:</strong> ${escapeHtml(d.orden_codigo)}</p>
                    <p><strong>Cliente:</strong> ${escapeHtml(d.cliente_nombre)}</p>
                    <p><strong>Vehículo:</strong> ${escapeHtml(d.vehiculo_marca)} ${escapeHtml(d.vehiculo_modelo)} - ${escapeHtml(d.vehiculo_placa)}</p>
                    <p><strong>Fecha Envío:</strong> ${formatDate(d.fecha_envio)}</p>
                </div>
                <h4>Servicios</h4>
                ${d.servicios.map(s => `<div class="servicio-item"><div class="servicio-descripcion"><strong>${escapeHtml(s.descripcion)}</strong></div><div class="servicio-precio">Bs. ${s.precio?.toFixed(2)} ${s.aprobado_por_cliente ? '✅ Aprobado' : '⏳ Pendiente'}</div></div>`).join('')}
            `;
            abrirModal('modalDetalleCotizacion');
        } else {
            showToast('Error al cargar detalle', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// EVENTOS Y AUTENTICACIÓN
// =====================================================

function setupEventListeners() {
    document.getElementById('saveSolicitudModal')?.addEventListener('click', () => {
        showToast('Función en desarrollo', 'info');
    });
    document.getElementById('guardarBorradorBtn')?.addEventListener('click', guardarBorradorCotizacion);
    document.getElementById('enviarCotizacionBtn')?.addEventListener('click', enviarCotizacionCliente);
    document.getElementById('verVistaPreviaBtn')?.addEventListener('click', verVistaPrevia);
    document.getElementById('exportarPDFPreviaBtn')?.addEventListener('click', exportarPDF);
    document.getElementById('confirmarSolicitudCompra')?.addEventListener('click', confirmarSolicitudCompra);
    document.getElementById('btnAgregarItemCompra')?.addEventListener('click', agregarItemCompra);
    document.getElementById('btnAgregarServicio')?.addEventListener('click', agregarServicio);
    document.getElementById('guardarServiciosBtn')?.addEventListener('click', guardarServiciosEditados);
    document.getElementById('refreshOrdenesBtn')?.addEventListener('click', () => cargarOrdenesConServicios());
    
    const refreshBtns = ['refreshSolicitudes', 'refreshCompras'];
    refreshBtns.forEach(id => { 
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => cargarDatosIniciales());
    });
    
    const searchOrden = document.getElementById('searchOrden');
    if (searchOrden) searchOrden.addEventListener('input', () => renderOrdenes());
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    });
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
        });
    });
}

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token') || localStorage.getItem('token');
        if (!token) { 
            window.location.href = '/'; 
            return null; 
        }
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');
        currentUser = { 
            id: payload.user?.id || payload.id || userData?.id, 
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario', 
            roles: payload.user?.roles || payload.roles || userData?.roles || [] 
        };
        currentUserRoles = currentUser.roles || [];
        
        const tieneRolJefeTaller = currentUserRoles.some(rol => 
            rol === 'jefe_taller' || rol === 'jefe_taller_principal' || rol === 'admin'
        );
        
        if (!tieneRolJefeTaller) { 
            showToast('No tienes permisos para acceder a esta sección', 'error'); 
            setTimeout(() => { window.location.href = '/'; }, 2000); 
            return null; 
        }
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.innerHTML = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
    } catch (error) { 
        console.error('Error al cargar usuario:', error);
        window.location.href = '/'; 
        return null; 
    }
}

function logout() { 
    localStorage.clear(); 
    sessionStorage.clear(); 
    window.location.href = '/'; 
}

async function inicializar() {
    console.log('🚀 Inicializando cotizaciones.js versión profesional');
    const user = await cargarUsuarioActual();
    if (!user) return;
    await cargarDatosIniciales();
    setupTabs();
    setupEventListeners();
    console.log('✅ cotizaciones.js inicializado correctamente');
}

// Exponer funciones globales
window.eliminarSolicitudCotizacion = eliminarSolicitudCotizacion;
window.solicitarCompraDesdeCotizacion = solicitarCompraDesdeCotizacion;
window.abrirModalGenerarCotizacion = abrirModalGenerarCotizacion;
window.verDetalleCotizacion = verDetalleCotizacion;
window.verSolicitudCompra = verSolicitudCompra;
window.aprobarCompra = aprobarCompra;
window.cerrarModal = cerrarModal;
window.logout = logout;
window.agregarItemSolicitud = agregarItemSolicitud;
window.agregarItemCompra = agregarItemCompra;
window.actualizarItemSolicitud = actualizarItemSolicitud;
window.eliminarItemSolicitud = eliminarItemSolicitud;
window.actualizarItemCompra = actualizarItemCompra;
window.eliminarItemCompra = eliminarItemCompra;
window.insertarTextoRapido = insertarTextoRapido;
window.toggleServicioEditable = toggleServicioEditable;
window.actualizarServicio = actualizarServicio;
window.agregarItemServicio = agregarItemServicio;
window.actualizarItemServicio = actualizarItemServicio;
window.eliminarItemServicio = eliminarItemServicio;
window.eliminarServicio = eliminarServicio;
window.editarServicioCotizacion = editarServicioCotizacion;
window.editarServiciosOrden = editarServiciosOrden;
window.abrirEditorServicios = abrirEditorServicios;
window.subirFirmaDigital = subirFirmaDigital;
window.limpiarEditor = limpiarEditor;
window.exportarPDF = exportarPDF;

document.addEventListener('DOMContentLoaded', inicializar);