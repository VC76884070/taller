// =====================================================
// COTIZACIONES.JS - JEFE DE TALLER (VERSIÓN COMPLETA CON ITEMS DINÁMICOS)
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/jefe-taller';
let currentUser = null;
let currentUserRoles = [];

// Datos globales
let ordenesAprobadas = [];
let encargadosRepuestos = [];
let solicitudesCotizacion = [];
let serviciosCotizados = [];
let cotizacionesEnviadas = [];
let solicitudesCompra = [];

// Items dinámicos
let itemsSolicitud = [];
let itemsCompra = [];

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

function statusBadge(estado) {
    const map = {
        'pendiente': 'status-pendiente',
        'cotizado': 'status-cotizado',
        'aprobado': 'status-aprobado',
        'rechazado': 'status-rechazado',
        'comprado': 'status-comprado',
        'enviada': 'status-enviado',
        'aprobado_total': 'status-aprobado',
        'aprobado_parcial': 'status-cotizado'
    };
    
    const texto = {
        'pendiente': 'Pendiente',
        'cotizado': 'Cotizado',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado',
        'comprado': 'Comprado',
        'enviada': 'Enviada',
        'aprobado_total': 'Aprobado Total',
        'aprobado_parcial': 'Aprobado Parcial'
    };
    
    const iconos = {
        'pendiente': 'fa-clock',
        'cotizado': 'fa-check-circle',
        'aprobado': 'fa-check-double',
        'comprado': 'fa-shopping-cart',
        'enviada': 'fa-paper-plane'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${iconos[estado] || 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE ITEMS (SOLICITUD)
// =====================================================

function renderItemsSolicitud() {
    const container = document.getElementById('itemsListSolicitud');
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
                <input type="text" class="item-descripcion" 
                       value="${escapeHtml(item.descripcion)}" 
                       placeholder="Ej: Aceite de motor, Filtro de aire, Bujías..."
                       onchange="actualizarItemSolicitud(${index}, 'descripcion', this.value)">
                
                <input type="number" class="item-cantidad" 
                       value="${item.cantidad}" min="1"
                       placeholder="Cantidad"
                       onchange="actualizarItemSolicitud(${index}, 'cantidad', parseInt(this.value))">
                
                <input type="text" class="item-detalle" 
                       value="${escapeHtml(item.detalle || '')}" 
                       placeholder="Detalle adicional (marca, especificaciones...)"
                       onchange="actualizarItemSolicitud(${index}, 'detalle', this.value)">
            </div>
            <div class="item-actions">
                <button type="button" class="btn-remove-item" onclick="eliminarItemSolicitud(${index})" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    // Actualizar resumen
    const summaryContainer = document.getElementById('itemsSummarySolicitud');
    if (summaryContainer) {
        const totalItems = itemsSolicitud.length;
        summaryContainer.innerHTML = `<i class="fas fa-cubes"></i> ${totalItems} item(s) agregado(s)`;
    }
}

function agregarItemSolicitud() {
    itemsSolicitud.push({
        descripcion: '',
        cantidad: 1,
        detalle: ''
    });
    renderItemsSolicitud();
    
    setTimeout(() => {
        const lastItem = document.querySelector('#itemsListSolicitud .item-row:last-child .item-descripcion');
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
    renderItemsSolicitud();
}

function limpiarItemsSolicitud() {
    itemsSolicitud = [];
    renderItemsSolicitud();
}

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE ITEMS (COMPRA)
// =====================================================

function renderItemsCompra() {
    const container = document.getElementById('itemsListCompra');
    if (!container) return;
    
    if (itemsCompra.length === 0) {
        container.innerHTML = `
            <div class="item-empty">
                <i class="fas fa-box-open"></i>
                <p>No hay items agregados</p>
                <small>Haz clic en "Agregar item" para comenzar</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = itemsCompra.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="item-descripcion" 
                       value="${escapeHtml(item.descripcion)}" 
                       placeholder="Ej: Aceite de motor, Filtro de aire, Bujías..."
                       onchange="actualizarItemCompra(${index}, 'descripcion', this.value)">
                
                <input type="number" class="item-cantidad" 
                       value="${item.cantidad}" min="1"
                       placeholder="Cantidad"
                       onchange="actualizarItemCompra(${index}, 'cantidad', parseInt(this.value))">
                
                <input type="text" class="item-detalle" 
                       value="${escapeHtml(item.detalle || '')}" 
                       placeholder="Detalle adicional (marca, especificaciones...)"
                       onchange="actualizarItemCompra(${index}, 'detalle', this.value)">
            </div>
            <div class="item-actions">
                <button type="button" class="btn-remove-item" onclick="eliminarItemCompra(${index})" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    // Actualizar resumen
    const summaryContainer = document.getElementById('itemsSummaryCompra');
    if (summaryContainer) {
        const totalItems = itemsCompra.length;
        summaryContainer.innerHTML = `<i class="fas fa-cubes"></i> ${totalItems} item(s) agregado(s)`;
    }
}

function agregarItemCompra() {
    itemsCompra.push({
        descripcion: '',
        cantidad: 1,
        detalle: ''
    });
    renderItemsCompra();
    
    setTimeout(() => {
        const lastItem = document.querySelector('#itemsListCompra .item-row:last-child .item-descripcion');
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
    renderItemsCompra();
}

function limpiarItemsCompra() {
    itemsCompra = [];
    renderItemsCompra();
}

// =====================================================
// CARGA DE DATOS DESDE API
// =====================================================

async function cargarOrdenesAprobadas() {
    try {
        const response = await fetch(`${API_URL}/ordenes-aprobadas`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            ordenesAprobadas = data.ordenes || [];
        }
    } catch (error) {
        console.error('Error cargando órdenes aprobadas:', error);
        ordenesAprobadas = [];
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
        }
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        solicitudesCotizacion = [];
    }
}

async function cargarServiciosCotizados() {
    try {
        const response = await fetch(`${API_URL}/servicios-cotizados`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            serviciosCotizados = data.servicios || [];
        }
    } catch (error) {
        console.error('Error cargando servicios cotizados:', error);
        serviciosCotizados = [];
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
        }
    } catch (error) {
        console.error('Error cargando cotizaciones enviadas:', error);
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
        }
    } catch (error) {
        console.error('Error cargando solicitudes de compra:', error);
        solicitudesCompra = [];
    }
}

async function cargarDatosIniciales() {
    try {
        await Promise.all([
            cargarOrdenesAprobadas(),
            cargarEncargadosRepuestos(),
            cargarSolicitudesCotizacion(),
            cargarServiciosCotizados(),
            cargarCotizacionesEnviadas(),
            cargarSolicitudesCompra()
        ]);
        
        renderAll();
    } catch (error) {
        console.error('Error cargando datos:', error);
        showToast('Error al cargar los datos', 'error');
    }
}

// =====================================================
// RENDERIZADO DE TABLAS
// =====================================================

function renderAll() {
    renderSelects();
    renderSolicitudesCotizacion();
    renderServiciosCotizados();
    renderCotizacionesEnviadas();
    renderSolicitudesCompra();
}

function renderSelects() {
    // Select de órdenes en el modal
    const selectOrden = document.getElementById('solicitud_id_orden_trabajo');
    if (selectOrden) {
        const currentValue = selectOrden.value;
        selectOrden.innerHTML = '<option value="">Seleccionar orden</option>' + 
            ordenesAprobadas.map(o => `<option value="${o.id_orden}">${escapeHtml(o.codigo_unico)} - ${escapeHtml(o.vehiculo)}</option>`).join('');
        if (currentValue) selectOrden.value = currentValue;
    }
    
    // Select de encargados
    const selectEncargado = document.getElementById('solicitud_id_encargado');
    if (selectEncargado) {
        selectEncargado.innerHTML = '<option value="">Seleccionar encargado</option>' +
            encargadosRepuestos.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
    }
    
    // Filtros de órdenes
    const filterIds = ['filtroOrdenSolicitud', 'filtroOrdenServicio', 'filtroOrdenCompra'];
    filterIds.forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
            const currentValue = sel.value;
            sel.innerHTML = '<option value="all">Todas las órdenes</option>' +
                ordenesAprobadas.map(o => `<option value="${o.id_orden}">${escapeHtml(o.codigo_unico)}</option>`).join('');
            if (currentValue !== 'all' && currentValue) sel.value = currentValue;
        }
    });
}

function renderSolicitudesCotizacion() {
    const tbody = document.getElementById('tablaSolicitudesCotizacion');
    if (!tbody) return;
    
    const searchTerm = document.getElementById('searchSolicitud')?.value.toLowerCase() || '';
    
    let filtered = [...solicitudesCotizacion];
    if (searchTerm) {
        filtered = filtered.filter(s => 
            (s.descripcion_pieza || '').toLowerCase().includes(searchTerm) ||
            (s.orden_codigo || '').toLowerCase().includes(searchTerm)
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
            <td><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></td>
            <td>${escapeHtml(solicitud.vehiculo || 'N/A')}</td>
            <td>${escapeHtml(solicitud.servicio_descripcion || '-')}</td>
            <td>${solicitud.items?.length || 1} item(s)</td>
            <td>${statusBadge(solicitud.estado)}</td>
            <td>${solicitud.precio_cotizado ? `Bs. ${solicitud.precio_cotizado.toFixed(2)}` : '-'}</td>
            <td>${formatDate(solicitud.fecha_solicitud)}</td>
            <td class="action-buttons">
                ${solicitud.estado === 'pendiente' ? `
                    <button class="action-btn delete" onclick="eliminarSolicitud(${solicitud.id})" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                ` : ''}
                ${solicitud.estado === 'cotizado' ? `
                    <button class="action-btn send" onclick="solicitarCompraDesdeCotizacion(${solicitud.id})" title="Solicitar Compra">
                        <i class="fas fa-shopping-cart"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function renderServiciosCotizados() {
    const container = document.getElementById('ordenesPendientesContainer');
    if (!container) return;
    
    const filtroOrden = document.getElementById('filtroOrdenServicio')?.value || 'all';
    const searchTerm = document.getElementById('searchServicio')?.value.toLowerCase() || '';
    
    let filtered = [...serviciosCotizados];
    if (filtroOrden !== 'all') {
        filtered = filtered.filter(o => o.id_orden == filtroOrden);
    }
    if (searchTerm) {
        filtered = filtered.filter(o => 
            (o.codigo_unico || '').toLowerCase().includes(searchTerm) ||
            (o.vehiculo || '').toLowerCase().includes(searchTerm) ||
            (o.cliente_nombre || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <p>No hay servicios con precios cotizados</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(orden => `
        <div class="orden-card">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"> ${escapeHtml(orden.vehiculo)}</span>
                </div>
                <div>
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                </div>
            </div>
            <div class="servicios-list">
                ${orden.servicios.map(serv => `
                    <div class="servicio-item">
                        <div class="servicio-descripcion">
                            <strong>${escapeHtml(serv.descripcion)}</strong>
                            ${serv.items && serv.items.length > 0 ? `
                                <div style="font-size: 0.7rem; color: var(--gris-texto); margin-top: 0.25rem;">
                                    ${serv.items.map(item => `• ${item.cantidad}x ${escapeHtml(item.descripcion)} ${item.detalle ? `(${escapeHtml(item.detalle)})` : ''}`).join('<br>')}
                                </div>
                            ` : ''}
                        </div>
                        <div class="servicio-precio">Precio: Bs. ${serv.precio_cotizado?.toFixed(2)}</div>
                    </div>
                `).join('')}
            </div>
            <div class="orden-footer">
                <button class="btn-primary" onclick="abrirModalGenerarCotizacion(${orden.id_orden})">
                    <i class="fas fa-file-invoice"></i> Generar Cotización
                </button>
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
                <td colspan="7">
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
            <td>${escapeHtml(cot.orden_codigo)}</td>
            <td>${escapeHtml(cot.vehiculo)}</td>
            <td>${escapeHtml(cot.cliente_nombre)}</td>
            <td><strong>Bs. ${cot.total?.toFixed(2) || '0.00'}</strong></td>
            <td>${cot.servicios_aprobados || 0} servicios</td>
            <td>${statusBadge(cot.estado_cliente)}</td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verDetalleCotizacion(${cot.id})" title="Ver Detalle">
                    <i class="fas fa-eye"></i>
                </button>
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
            (s.descripcion_pieza || '').toLowerCase().includes(searchTerm) ||
            (s.orden_codigo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fas fa-shopping-cart"></i>
                        <p>No hay solicitudes de compra</p>
                    </div>
                    </td>
                </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filtered.map(s => `
        <tr>
            <td>${s.id}</td>
            <td>${escapeHtml(s.orden_codigo)}</td>
            <td>${escapeHtml(s.vehiculo)}</td>
            <td>${escapeHtml(s.servicio_descripcion || '-')}</td>
            <td>${s.items?.length || 1} item(s)</td>
            <td>${statusBadge(s.estado)}</td>
            <td>${formatDate(s.fecha_solicitud)}</td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verSolicitudCompra(${s.id})" title="Ver Detalle">
                    <i class="fas fa-eye"></i>
                </button>
                ${s.estado === 'pendiente' ? `
                    <button class="action-btn approve" onclick="aprobarCompra(${s.id})" title="Marcar como Comprado">
                        <i class="fas fa-check-circle"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

// =====================================================
// ACCIONES - SOLICITUDES DE COTIZACIÓN
// =====================================================

async function crearSolicitudCotizacion() {
    const id_orden = document.getElementById('solicitud_id_orden_trabajo')?.value;
    const id_servicio = document.getElementById('solicitud_id_servicio')?.value;
    const id_encargado = document.getElementById('solicitud_id_encargado')?.value;
    const observacion = document.getElementById('solicitud_observacion')?.value;
    
    if (!id_orden) {
        showToast('Seleccione una orden de trabajo', 'error');
        return;
    }
    
    if (!id_servicio) {
        showToast('Seleccione un servicio', 'error');
        return;
    }
    
    if (!id_encargado) {
        showToast('Seleccione un encargado de repuestos', 'error');
        return;
    }
    
    // Validar items
    const itemsValidos = itemsSolicitud.filter(item => item.descripcion && item.descripcion.trim() !== '');
    if (itemsValidos.length === 0) {
        showToast('Agregue al menos un item con descripción', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden_trabajo: parseInt(id_orden),
                id_servicio: parseInt(id_servicio),
                id_encargado_repuestos: parseInt(id_encargado),
                items: itemsValidos,
                observacion_jefe_taller: observacion || ''
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Solicitud de cotización creada exitosamente', 'success');
            cerrarModal('modalSolicitudCotizacion');
            limpiarItemsSolicitud();
            document.getElementById('solicitud_observacion').value = '';
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al crear solicitud', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

async function eliminarSolicitud(id) {
    if (!confirm('¿Estás seguro de eliminar esta solicitud?')) return;
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Solicitud eliminada', 'success');
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// ACCIONES - COTIZACIÓN AL CLIENTE
// =====================================================

async function abrirModalGenerarCotizacion(id_orden) {
    const orden = serviciosCotizados.find(o => o.id_orden === id_orden);
    if (!orden) {
        showToast('Orden no encontrada', 'error');
        return;
    }
    
    const fecha = new Date().toLocaleDateString('es-BO');
    let serviciosHtml = '';
    let totalGeneral = 0;
    
    orden.servicios.forEach((serv, idx) => {
        const precio = serv.precio_cotizado || 0;
        totalGeneral += precio;
        
        // Generar tabla de items
        let itemsHtml = '';
        if (serv.items && serv.items.length > 0) {
            itemsHtml = `
                <tr style="background: #f0f0f0;">
                    <th colspan="4" style="padding: 0.5rem;">📦 Items incluidos:</th>
                </tr>
                ${serv.items.map(item => `
                    <tr>
                        <td>${item.cantidad}</td>
                        <td>${escapeHtml(item.descripcion)} ${item.detalle ? `<br><small>${escapeHtml(item.detalle)}</small>` : ''}</td>
                        <td>-</td>
                        <td>-</td>
                    </tr>
                `).join('')}
            `;
        }
        
        serviciosHtml += `
            <div class="servicio-cotizacion" id="servicio-cotizacion-${serv.id_servicio}">
                <h4>Servicio ${idx + 1}: ${escapeHtml(serv.descripcion)}</h4>
                <table class="cotizacion-tabla">
                    <thead>
                        <tr>
                            <th>Cantidad</th>
                            <th>Descripción</th>
                            <th>Precio Unitario</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>1</td>
                            <td>${escapeHtml(serv.descripcion)}</td>
                            <td>Bs. ${precio.toFixed(2)}</td>
                            <td>Bs. ${precio.toFixed(2)}</td>
                        </tr>
                        ${itemsHtml}
                    </tbody>
                </table>
                <div class="subtotal">Subtotal del servicio: Bs. ${precio.toFixed(2)}</div>
                <div style="margin-top: 0.5rem;">
                    <textarea class="form-input" id="sugerencias_${serv.id_servicio}" rows="2" placeholder="Sugerencias para este servicio..."></textarea>
                </div>
            </div>
        `;
    });
    
    const container = document.getElementById('generarCotizacionBody');
    container.innerHTML = `
        <div class="cotizacion-preview">
            <div class="cotizacion-header">
                <h1>INFORME DE COTIZACIÓN</h1>
                <div class="cotizacion-fecha">Fecha: ${fecha}</div>
            </div>
            <div class="cotizacion-datos">
                <h3>Datos del Cliente</h3>
                <p><strong>Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
                <p><strong>Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
                <p><strong>Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
            </div>
            ${serviciosHtml}
            <div class="total-general">Total General: Bs. ${totalGeneral.toFixed(2)}</div>
            <div class="sugerencias">
                <strong>Sugerencias generales:</strong>
                <textarea id="sugerencias_generales" class="form-input" rows="3" placeholder="Observaciones adicionales para el cliente..."></textarea>
            </div>
        </div>
    `;
    
    window.currentCotizacionData = { id_orden, servicios: orden.servicios };
    abrirModal('modalGenerarCotizacion');
}

async function enviarCotizacionCliente() {
    if (!window.currentCotizacionData) return;
    
    const { id_orden, servicios } = window.currentCotizacionData;
    const sugerenciasGenerales = document.getElementById('sugerencias_generales')?.value || '';
    
    const serviciosConSugerencias = servicios.map(serv => ({
        id_servicio: serv.id_servicio,
        precio: serv.precio_cotizado,
        sugerencias: document.getElementById(`sugerencias_${serv.id_servicio}`)?.value || ''
    }));
    
    try {
        const response = await fetch(`${API_URL}/enviar-cotizacion-cliente`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: id_orden,
                servicios: serviciosConSugerencias,
                sugerencias_generales: sugerenciasGenerales
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Cotización enviada al cliente exitosamente', 'success');
            cerrarModal('modalGenerarCotizacion');
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al enviar cotización', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

async function verDetalleCotizacion(id_cotizacion) {
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${id_cotizacion}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            const d = data.detalle;
            const container = document.getElementById('detalleCotizacionContainer');
            
            container.innerHTML = `
                <div class="orden-info-card">
                    <p><strong>Orden:</strong> ${escapeHtml(d.orden_codigo)}</p>
                    <p><strong>Vehículo:</strong> ${escapeHtml(d.vehiculo)}</p>
                    <p><strong>Fecha:</strong> ${formatDate(d.fecha_generacion)}</p>
                    <p><strong>Estado:</strong> ${statusBadge(d.estado_cliente)}</p>
                    <p><strong>Total:</strong> Bs. ${d.total?.toFixed(2)}</p>
                </div>
                <h4 style="margin: 1rem 0; color: var(--blanco);">Servicios</h4>
                ${d.servicios.map(s => `
                    <div class="servicio-item">
                        <div class="servicio-descripcion">
                            <strong>${escapeHtml(s.descripcion)}</strong>
                            ${s.items && s.items.length > 0 ? `
                                <div style="font-size: 0.7rem; margin-top: 0.25rem;">
                                    ${s.items.map(item => `• ${item.cantidad}x ${escapeHtml(item.descripcion)}`).join('<br>')}
                                </div>
                            ` : ''}
                        </div>
                        <div class="servicio-precio">
                            Bs. ${s.precio?.toFixed(2)}
                            ${s.aprobado_por_cliente ? 
                                '<span class="status-badge status-aprobado" style="margin-left: 0.5rem;"><i class="fas fa-check"></i> Aprobado</span>' : 
                                '<span class="status-badge status-pendiente" style="margin-left: 0.5rem;"><i class="fas fa-clock"></i> Pendiente</span>'}
                        </div>
                    </div>
                `).join('')}
            `;
            
            abrirModal('modalDetalleCotizacion');
        } else {
            showToast(data.error || 'Error al cargar detalle', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// ACCIONES - SOLICITUDES DE COMPRA
// =====================================================

async function solicitarCompraDesdeCotizacion(id_solicitud_cotizacion) {
    const solicitud = solicitudesCotizacion.find(s => s.id === id_solicitud_cotizacion);
    if (!solicitud) return;
    
    limpiarItemsCompra();
    
    // Pre-cargar el item principal
    if (solicitud.descripcion_pieza) {
        itemsCompra.push({
            descripcion: solicitud.descripcion_pieza,
            cantidad: solicitud.cantidad || 1,
            detalle: ''
        });
        renderItemsCompra();
    }
    
    window.currentCompraData = { id_solicitud_cotizacion: id_solicitud_cotizacion };
    
    const infoContainer = document.getElementById('solicitudCompraInfo');
    infoContainer.innerHTML = `
        <p><strong>Orden:</strong> ${escapeHtml(solicitud.orden_codigo)}</p>
        <p><strong>Vehículo:</strong> ${escapeHtml(solicitud.vehiculo)}</p>
        <p><strong>Servicio:</strong> ${escapeHtml(solicitud.servicio_descripcion || '-')}</p>
        <p><strong>Precio cotizado:</strong> ${solicitud.precio_cotizado ? `Bs. ${solicitud.precio_cotizado.toFixed(2)}` : 'No especificado'}</p>
    `;
    
    abrirModal('modalSolicitarCompra');
}

async function confirmarSolicitudCompra() {
    if (!window.currentCompraData) return;
    
    // Validar items
    const itemsValidos = itemsCompra.filter(item => item.descripcion && item.descripcion.trim() !== '');
    if (itemsValidos.length === 0) {
        showToast('Agregue al menos un item con descripción', 'error');
        return;
    }
    
    const mensaje = document.getElementById('compra_mensaje')?.value || '';
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_solicitud_cotizacion: window.currentCompraData.id_solicitud_cotizacion,
                items: itemsValidos,
                mensaje: mensaje
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Solicitud de compra creada exitosamente', 'success');
            cerrarModal('modalSolicitarCompra');
            limpiarItemsCompra();
            document.getElementById('compra_mensaje').value = '';
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al crear solicitud de compra', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

async function verSolicitudCompra(id) {
    const solicitud = solicitudesCompra.find(s => s.id === id);
    if (!solicitud) return;
    
    let itemsHtml = '';
    if (solicitud.items && solicitud.items.length > 0) {
        itemsHtml = solicitud.items.map(item => `
            <div class="servicio-item" style="margin-top: 0.5rem;">
                <div class="servicio-descripcion">
                    <strong>${escapeHtml(item.descripcion)}</strong>
                    ${item.detalle ? `<br><small>${escapeHtml(item.detalle)}</small>` : ''}
                </div>
                <div class="servicio-precio">Cantidad: ${item.cantidad}</div>
            </div>
        `).join('');
    }
    
    showToast(`
        Solicitud #${solicitud.id}
        Pieza: ${solicitud.descripcion_pieza}
        Estado: ${solicitud.estado}
        ${itemsHtml}
    `, 'info');
}

async function aprobarCompra(id) {
    if (!confirm('¿Confirmas que esta compra se ha realizado?')) return;
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${id}/aprobar`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Compra registrada exitosamente', 'success');
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al registrar compra', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// EVENTOS Y TABS
// =====================================================

function setupEventListeners() {
    // Botones principales
    const btnNueva = document.getElementById('btnNuevaSolicitudCotizacion');
    if (btnNueva) btnNueva.addEventListener('click', () => {
        limpiarItemsSolicitud();
        abrirModal('modalSolicitudCotizacion');
    });
    
    const saveBtn = document.getElementById('saveSolicitudModal');
    if (saveBtn) saveBtn.addEventListener('click', crearSolicitudCotizacion);
    
    const enviarBtn = document.getElementById('confirmarEnvioCotizacion');
    if (enviarBtn) enviarBtn.addEventListener('click', enviarCotizacionCliente);
    
    const confirmarBtn = document.getElementById('confirmarSolicitudCompra');
    if (confirmarBtn) confirmarBtn.addEventListener('click', confirmarSolicitudCompra);
    
    // Botones para agregar items
    const btnAgregarItemSolicitud = document.getElementById('btnAgregarItemSolicitud');
    if (btnAgregarItemSolicitud) btnAgregarItemSolicitud.addEventListener('click', agregarItemSolicitud);
    
    const btnAgregarItemCompra = document.getElementById('btnAgregarItemCompra');
    if (btnAgregarItemCompra) btnAgregarItemCompra.addEventListener('click', agregarItemCompra);
    
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
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
    
    // Cargar servicios al seleccionar orden
    const selectOrden = document.getElementById('solicitud_id_orden_trabajo');
    if (selectOrden) {
        selectOrden.addEventListener('change', async (e) => {
            const id_orden = e.target.value;
            if (id_orden) {
                try {
                    const response = await fetch(`${API_URL}/servicios-por-orden/${id_orden}`, {
                        headers: getAuthHeaders()
                    });
                    const data = await response.json();
                    if (data.success) {
                        const selectServicio = document.getElementById('solicitud_id_servicio');
                        selectServicio.innerHTML = '<option value="">Seleccionar servicio</option>' +
                            data.servicios.map(s => `<option value="${s.id}">${escapeHtml(s.descripcion)}</option>`).join('');
                    }
                } catch (error) {
                    console.error('Error cargando servicios:', error);
                }
            }
        });
    }
    
    // Filtros
    const filtros = ['filtroOrdenSolicitud', 'filtroEstadoSolicitud', 'searchSolicitud',
                     'filtroOrdenServicio', 'searchServicio', 'filtroOrdenCompra', 'filtroEstadoCompra', 'searchCompra'];
    filtros.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.addEventListener('change', () => {
                Promise.all([cargarSolicitudesCotizacion(), cargarSolicitudesCompra()]);
                renderSolicitudesCotizacion();
                renderSolicitudesCompra();
            });
            if (elemento.tagName === 'INPUT' && elemento.type !== 'checkbox' && elemento.type !== 'radio') {
                elemento.addEventListener('input', () => {
                    renderSolicitudesCotizacion();
                    renderSolicitudesCompra();
                });
            }
        }
    });
}

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    if (tabBtns.length === 0) return;
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            
            if (!tabId) return;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const targetContent = document.getElementById(tabId);
            if (targetContent) targetContent.classList.add('active');
        });
    });
}

// =====================================================
// AUTENTICACIÓN Y LOGOUT
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
        
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller') || 
                                    currentUser.rol_principal === 'jefe_taller';
        
        if (!tieneRolJefeTaller) {
            console.warn('Usuario no tiene rol de jefe_taller', currentUserRoles);
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return null;
        }
        
        // Mostrar nombre de usuario
        const userNombreSpan = document.getElementById('userNombre');
        if (userNombreSpan) {
            userNombreSpan.textContent = currentUser.nombre || 'Usuario';
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

function logout() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    window.location.href = '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

async function inicializar() {
    console.log('🚀 Inicializando cotizaciones.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarDatosIniciales();
    setupTabs();
    setupEventListeners();
    
    console.log('✅ cotizaciones.js inicializado correctamente');
}

// Exponer funciones globales
window.eliminarSolicitud = eliminarSolicitud;
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

document.addEventListener('DOMContentLoaded', inicializar);