// =====================================================
// COTIZACIONES.JS - JEFE DE TALLER
// VERSIÓN 3.3 - CORREGIDO (SUBIDA DE ARCHIVOS FUNCIONAL)
// =====================================================

const API_URL = window.location.origin + '/api/jefe-taller';
let currentUser = null;
let currentUserRoles = [];

// Datos globales
let ordenesParaCotizar = [];
let ordenesDiagnosticoAprobado = [];
let encargadosRepuestos = [];
let solicitudesCotizacion = [];
let cotizacionesMap = {};
let solicitudesCompra = [];
let historialCotizaciones = [];

// Items dinámicos
let itemsSolicitud = [];
let itemsCompra = [];

// Variables para archivo y servicios
let currentFileData = null;
let currentFileName = null;
let currentOrdenData = null;
let currentCotizacionId = null;
let serviciosCotizables = [];
let isEditingCotizacion = false;
let currentOrdenAceptada = null;
let currentOrdenArmado = null;

// Estados de orden (constantes)
const ESTADOS_ORDEN = {
    DIAGNOSTICO_APROBADO: 'DiagnosticoAprobado',
    COTIZACION_ENVIADA: 'CotizacionEnviada',
    COTIZACION_ACEPTADA: 'CotizacionAceptada',
    COTIZACION_PARCIAL: 'CotizacionParcial',
    COTIZACION_RECHAZADA: 'CotizacionRechazada',
    EN_ARMADO: 'EnArmadoVehiculo',
    VEHICULO_ARMADO: 'VehiculoArmado',
    EN_REPARACION: 'EnReparacion',
    EN_PAUSA: 'EnPausa',
    REPARACION_COMPLETADA: 'ReparacionCompletada',
    FINALIZADO: 'Finalizado',
    ENTREGADO: 'Entregado'
};

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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function formatCurrency(amount) {
    return `Bs. ${(amount || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        'enviada': 'status-enviado',
        'aprobada': 'status-aprobado',
        'expirada': 'status-pendiente',
        'solicitado': 'status-pendiente'
    };
    
    const texto = {
        'pendiente': 'Pendiente',
        'cotizado': 'Cotizado',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado',
        'enviada': 'Enviada',
        'aprobada': 'Aprobada',
        'expirada': 'Expirada',
        'comprado': 'Comprado',
        'solicitado': 'Solicitud Enviada'
    };
    
    let icon = 'fa-clock';
    if (estado === 'aprobado' || estado === 'aprobada' || estado === 'comprado') icon = 'fa-check-circle';
    if (estado === 'rechazado') icon = 'fa-times-circle';
    if (estado === 'enviada') icon = 'fa-paper-plane';
    if (estado === 'solicitado') icon = 'fa-paper-plane';
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${icon}"></i> ${texto[estado] || estado}
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

async function cargarOrdenesDiagnosticoAprobado() {
    try {
        const response = await fetch(`${API_URL}/ordenes-diagnostico-aprobado`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            ordenesDiagnosticoAprobado = data.ordenes || [];
            console.log(`📊 Órdenes con diagnóstico aprobado: ${ordenesDiagnosticoAprobado.length}`);
            renderOrdenesSolicitarCotizacion();
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        ordenesDiagnosticoAprobado = [];
    }
}

async function cargarOrdenesParaCotizar() {
    try {
        const response = await fetch(`${API_URL}/ordenes-con-servicios`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            ordenesParaCotizar = data.ordenes || [];
            console.log(`📊 Órdenes para cotización al cliente: ${ordenesParaCotizar.length}`);
            renderOrdenesCotizacionCliente();
        }
    } catch (error) {
        console.error('Error cargando órdenes para cotizar:', error);
        ordenesParaCotizar = [];
    }
}

async function cargarSolicitudesCotizacion() {
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            solicitudesCotizacion = data.solicitudes || [];
            renderSolicitudesCotizacion();
            cargarSelectOrdenesSolicitud();
        }
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        solicitudesCotizacion = [];
    }
}

async function cargarCotizacionesMap() {
    try {
        const response = await fetch(`${API_URL}/cotizaciones-enviadas`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            cotizacionesMap = {};
            data.cotizaciones.forEach(cot => {
                cotizacionesMap[cot.id_orden_trabajo] = cot;
            });
            console.log('Cotizaciones cargadas:', Object.keys(cotizacionesMap).length);
        }
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
        cotizacionesMap = {};
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
            const selectEncargado = document.getElementById('solicitud_id_encargado');
            if (selectEncargado) {
                selectEncargado.innerHTML = '<option value="">Seleccionar encargado</option>' +
                    encargadosRepuestos.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
            }
        }
    } catch (error) {
        console.error('Error cargando encargados:', error);
        encargadosRepuestos = [];
    }
}

async function cargarOrdenesAprobadas() {
    try {
        const response = await fetch(`${API_URL}/ordenes-aprobadas`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            window.ordenesAprobadas = data.ordenes || [];
            cargarSelectOrdenesSolicitud();
            console.log(`✅ Órdenes aprobadas cargadas: ${window.ordenesAprobadas.length}`);
        }
    } catch (error) {
        console.error('Error cargando órdenes aprobadas:', error);
        window.ordenesAprobadas = [];
    }
}

async function cargarHistorialCotizaciones() {
    try {
        const response = await fetch(`${API_URL}/historial-cotizaciones`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            historialCotizaciones = data.cotizaciones || [];
            renderHistorialCotizaciones();
        }
    } catch (error) {
        console.error('Error cargando historial:', error);
        historialCotizaciones = [];
    }
}

function cargarSelectOrdenesSolicitud() {
    const selectOrden = document.getElementById('solicitud_id_orden_trabajo');
    const ordenes = window.ordenesAprobadas || [];
    
    if (selectOrden && ordenes.length > 0) {
        const currentValue = selectOrden.value;
        selectOrden.innerHTML = '<option value="">Seleccionar orden</option>' + 
            ordenes.map(o => `<option value="${o.id_orden}">${escapeHtml(o.codigo_unico)} - ${escapeHtml(o.vehiculo)}</option>`).join('');
        if (currentValue) selectOrden.value = currentValue;
    }
    
    if (selectOrden) {
        selectOrden.onchange = function() {
            const ordenId = parseInt(this.value);
            const orden = ordenesDiagnosticoAprobado.find(o => o.id_orden === ordenId);
            const selectServicio = document.getElementById('solicitud_id_servicio');
            
            if (selectServicio && orden && orden.servicios) {
                selectServicio.innerHTML = '<option value="">Seleccionar servicio</option>';
                orden.servicios.forEach(serv => {
                    const option = document.createElement('option');
                    option.value = serv.id_servicio;
                    option.textContent = serv.descripcion;
                    selectServicio.appendChild(option);
                });
            }
        };
    }
}

async function cargarDatosIniciales() {
    mostrarLoading(true);
    try {
        await Promise.all([
            cargarOrdenesDiagnosticoAprobado(),
            cargarOrdenesParaCotizar(),
            cargarSolicitudesCotizacion(),
            cargarCotizacionesMap(),
            cargarSolicitudesCompra(),
            cargarEncargadosRepuestos(),
            cargarOrdenesAprobadas(),
            cargarHistorialCotizaciones()
        ]);
    } catch (error) {
        console.error('Error cargando datos:', error);
        showToast('Error al cargar los datos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZADO PRIMER APARTADO
// =====================================================

function renderOrdenesSolicitarCotizacion() {
    const container = document.getElementById('ordenesSolicitarContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('searchOrdenSolicitar')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstadoCotizacionSolicitar')?.value || 'all';
    
    let ordenesFiltradas = ordenesDiagnosticoAprobado.filter(orden => {
        return orden.servicios.some(serv => 
            serv.estado_cotizacion === 'pendiente' || 
            serv.estado_cotizacion === 'solicitado'
        );
    });
    
    if (searchTerm) {
        ordenesFiltradas = ordenesFiltradas.filter(o => 
            (o.codigo_unico || '').toLowerCase().includes(searchTerm) ||
            (o.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
            (o.vehiculo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtroEstado === 'pendiente') {
        ordenesFiltradas = ordenesFiltradas.filter(o => 
            o.servicios.some(s => s.estado_cotizacion === 'pendiente')
        );
    } else if (filtroEstado === 'solicitado') {
        ordenesFiltradas = ordenesFiltradas.filter(o => 
            o.servicios.some(s => s.estado_cotizacion === 'solicitado')
        );
    }
    
    if (ordenesFiltradas.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No hay órdenes con diagnóstico aprobado pendientes de cotización</p><small>Las órdenes aparecerán aquí cuando el diagnóstico sea aprobado por el jefe de taller</small></div>`;
        return;
    }
    
    container.innerHTML = ordenesFiltradas.map(orden => {
        const serviciosPendientes = orden.servicios.filter(s => s.estado_cotizacion === 'pendiente').length;
        const serviciosSolicitados = orden.servicios.filter(s => s.estado_cotizacion === 'solicitado').length;
        
        let estadoBadge = '';
        let botonesHtml = '';
        
        if (serviciosSolicitados > 0) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> ${serviciosSolicitados} solicitud(es) enviada(s)</span>`;
            botonesHtml = `<button class="btn-outline" disabled style="opacity:0.7;"><i class="fas fa-clock"></i> Esperando respuesta</button>`;
        } else if (serviciosPendientes > 0) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> ${serviciosPendientes} servicio(s) pendiente(s)</span>`;
            botonesHtml = `<button class="btn-primary" onclick="abrirModalSolicitudParaOrden(${orden.id_orden})"><i class="fas fa-paper-plane"></i> Solicitar Cotización</button>`;
        }
        
        return `
        <div class="orden-card">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                </div>
                <div>
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                </div>
            </div>
            <div class="orden-body" style="padding: 0.75rem 1.25rem;">
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">${estadoBadge}</div>
                <div class="servicios-container" style="margin-top: 0.5rem;">
                    ${orden.servicios.map(serv => `
                        <div class="servicio-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
                            <div class="servicio-info"><div class="servicio-nombre" style="font-weight: 500;">${escapeHtml(serv.descripcion)}</div></div>
                            <div class="servicio-estado estado-${serv.estado_cotizacion}" style="font-size: 0.75rem;">
                                <i class="fas ${serv.estado_cotizacion === 'cotizado' ? 'fa-check-circle' : (serv.estado_cotizacion === 'solicitado' ? 'fa-paper-plane' : 'fa-clock')}"></i>
                                ${serv.estado_cotizacion === 'cotizado' ? 'Cotizado' : (serv.estado_cotizacion === 'solicitado' ? 'Solicitud enviada' : 'Pendiente')}
                            </div>
                            ${serv.precio_cotizado > 0 ? `<div class="servicio-precio" style="font-weight: 600; color: var(--verde-exito);">${formatCurrency(serv.precio_cotizado)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="orden-footer" style="padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-color);">${botonesHtml}</div>
        </div>`;
    }).join('');
}

async function abrirModalSolicitudParaOrden(id_orden) {
    limpiarItemsSolicitud();
    await cargarOrdenesAprobadas();
    const selectOrden = document.getElementById('solicitud_id_orden_trabajo');
    if (selectOrden) {
        selectOrden.value = id_orden;
        selectOrden.dispatchEvent(new Event('change'));
    }
    abrirModal('modalSolicitudCotizacion');
}

// =====================================================
// RENDERIZADO SEGUNDO APARTADO
// =====================================================

function renderOrdenesCotizacionCliente() {
    const container = document.getElementById('ordenesCotizacionContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('searchCotizacionCliente')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstadoCotizacionCliente')?.value || 'all';
    
    let filtered = [...ordenesParaCotizar];
    
    if (searchTerm) {
        filtered = filtered.filter(o => 
            (o.codigo_unico || '').toLowerCase().includes(searchTerm) ||
            (o.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
            (o.vehiculo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No hay órdenes disponibles</p></div>`;
        return;
    }
    
    container.innerHTML = filtered.map(orden => {
        const estadoOrden = orden.estado_global;
        let estadoBadge = '';
        let botonesHtml = '';
        
        if (estadoOrden === ESTADOS_ORDEN.DIAGNOSTICO_APROBADO) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente de Cotización</span>`;
            botonesHtml = `<button class="btn-primary" onclick="abrirModalGenerarCotizacion(${orden.id_orden})"><i class="fas fa-file-invoice"></i> Generar Cotización</button>`;
        } else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_ENVIADA) {
            estadoBadge = `<span class="status-badge status-enviado"><i class="fas fa-paper-plane"></i> Cotización Enviada</span>`;
            botonesHtml = `
                <button class="btn-outline" onclick="editarCotizacionExistente(${orden.id_orden})"><i class="fas fa-edit"></i> Editar Cotización</button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})"><i class="fas fa-eye"></i> Ver Detalle</button>`;
        } else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_ACEPTADA || estadoOrden === ESTADOS_ORDEN.COTIZACION_PARCIAL) {
            estadoBadge = `<span class="status-badge status-aprobado"><i class="fas fa-check-circle"></i> Cotización Aceptada</span>`;
            botonesHtml = `
                <button class="btn-primary" onclick='abrirModalIniciarReparacion(${orden.id_orden}, "${escapeHtml(orden.codigo_unico)}", "${escapeHtml(orden.vehiculo)}", "${escapeHtml(orden.cliente_nombre)}")'><i class="fas fa-play-circle"></i> Iniciar Reparación</button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})"><i class="fas fa-eye"></i> Ver Cotización</button>`;
        } else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_RECHAZADA) {
            estadoBadge = `<span class="status-badge status-rechazado"><i class="fas fa-times-circle"></i> Cotización Rechazada</span>`;
            botonesHtml = `
                <button class="btn-warning" onclick='abrirModalNotificarArmado(${orden.id_orden}, "${escapeHtml(orden.codigo_unico)}", "${escapeHtml(orden.vehiculo)}", "${escapeHtml(orden.cliente_nombre)}")'><i class="fas fa-tools"></i> Notificar Armado</button>
                <button class="btn-primary" onclick="reutilizarCotizacionRechazada(${orden.id_orden})"><i class="fas fa-copy"></i> Nueva Cotización</button>`;
        } else if (estadoOrden === ESTADOS_ORDEN.EN_ARMADO) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-tools"></i> Armando Vehículo</span>`;
            botonesHtml = `<button class="btn-outline" onclick="verInstruccionesArmado(${orden.id_orden})"><i class="fas fa-clipboard-list"></i> Ver Instrucciones</button>`;
        } else if (estadoOrden === ESTADOS_ORDEN.EN_REPARACION) {
            estadoBadge = `<span class="status-badge status-proceso"><i class="fas fa-wrench"></i> En Reparación</span>`;
            botonesHtml = `<button class="btn-outline" onclick="verAvanceReparacion(${orden.id_orden})"><i class="fas fa-chart-line"></i> Ver Avance</button>`;
        }
        
        const totalCotizado = orden.cotizacion_total || orden.total_orden || 0;
        
        return `
        <div class="orden-card">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                    ${estadoBadge}
                </div>
                <div>
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                    <span class="orden-total"><i class="fas fa-dollar-sign"></i> Total: ${formatCurrency(totalCotizado)}</span>
                </div>
            </div>
            <div class="servicios-container">
                ${orden.servicios.map(serv => `
                    <div class="servicio-row">
                        <div class="servicio-info"><div class="servicio-nombre">${escapeHtml(serv.descripcion)}</div></div>
                        <div class="servicio-estado estado-${serv.estado_cotizacion}">
                            <i class="fas ${serv.estado_cotizacion === 'cotizado' ? 'fa-check-circle' : (serv.estado_cotizacion === 'solicitado' ? 'fa-paper-plane' : 'fa-clock')}"></i>
                            ${serv.estado_cotizacion === 'cotizado' ? 'Cotizado' : (serv.estado_cotizacion === 'solicitado' ? 'Solicitud enviada' : 'Pendiente')}
                        </div>
                        ${serv.precio_cotizado > 0 ? `<div class="servicio-precio">${formatCurrency(serv.precio_cotizado)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="orden-footer">${botonesHtml}</div>
        </div>`;
    }).join('');
}

function renderHistorialCotizaciones() {
    const container = document.getElementById('historialCotizacionesContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('searchHistorial')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstadoHistorial')?.value || 'all';
    
    let filtered = [...historialCotizaciones];
    
    if (searchTerm) {
        filtered = filtered.filter(c => 
            (c.orden_codigo || '').toLowerCase().includes(searchTerm) ||
            (c.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
            (c.vehiculo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtroEstado !== 'all') {
        filtered = filtered.filter(c => c.estado === filtroEstado);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-history"></i><p>No hay cotizaciones en el historial</p></div>`;
        return;
    }
    
    container.innerHTML = filtered.map(cot => `
        <div class="orden-card">
            <div class="orden-header">
                <div><span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(cot.orden_codigo)}</span><span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(cot.vehiculo)}</span></div>
                <div><span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(cot.cliente_nombre)}</span><span class="orden-total"><i class="fas fa-dollar-sign"></i> Total: ${formatCurrency(cot.total)}</span></div>
            </div>
            <div class="orden-body" style="padding: 0.75rem 1.25rem;">
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                    <div><strong>Fecha envío:</strong> ${formatDate(cot.fecha_envio)}</div>
                    <div>${statusBadge(cot.estado)}</div>
                    ${cot.fecha_rechazo ? `<div><strong>Rechazado:</strong> ${formatDate(cot.fecha_rechazo)}</div>` : ''}
                </div>
                ${cot.motivo_rechazo ? `<div class="motivo-rechazo" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(193,18,31,0.1); border-radius: 6px;"><i class="fas fa-comment-dots"></i> <strong>Motivo de rechazo:</strong><p style="margin: 0.25rem 0 0 1.5rem; font-size: 0.8rem;">${escapeHtml(cot.motivo_rechazo)}</p></div>` : ''}
            </div>
            <div class="orden-footer">
                <button class="btn-outline" onclick="verDetalleCotizacion(${cot.id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                ${cot.estado === 'rechazada' ? `<button class="btn-primary" onclick="reutilizarCotizacionRechazada(${cot.id_orden_trabajo}, ${cot.id})"><i class="fas fa-copy"></i> Generar Nueva Cotización</button>` : ''}
            </div>
        </div>
    `).join('');
}

function renderSolicitudesCotizacion() {
    const tbody = document.getElementById('tablaSolicitudesCotizacion');
    if (!tbody) return;
    
    if (solicitudesCotizacion.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-inbox"></i><p>No hay solicitudes</p></div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = solicitudesCotizacion.map(s => `
        <tr>
            <td>${s.id}</td>
            <td><strong>${escapeHtml(s.orden_codigo)}</strong></td>
            <td>${escapeHtml(s.vehiculo)}</div></td>
            <td>${escapeHtml(s.servicio_descripcion || '-')}</div></td>
            <td>${s.items?.length || 1} item(s)</div></td>
            <td>${statusBadge(s.estado)}</div></td>
            <td>${s.precio_cotizado ? formatCurrency(s.precio_cotizado) : '-'}</div></td>
            <td>${formatDate(s.fecha_solicitud)}</div></td>
            <td class="action-buttons">
                ${s.estado === 'pendiente' ? `<button class="action-btn delete" onclick="eliminarSolicitudCotizacion(${s.id})"><i class="fas fa-trash-alt"></i></button>` : ''}
                ${s.estado === 'cotizado' ? `<button class="action-btn send" onclick="solicitarCompraDesdeCotizacion(${s.id})"><i class="fas fa-shopping-cart"></i></button>` : ''}
            </div>
        </tr>
    `).join('');
}

function renderSolicitudesCompra() {
    const tbody = document.getElementById('tablaSolicitudesCompra');
    if (!tbody) return;
    
    if (solicitudesCompra.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No hay solicitudes</p></div></div></td>`;
        return;
    }
    
    tbody.innerHTML = solicitudesCompra.map(s => `
        <tr>
            <td>${s.id}</div><td><strong>${escapeHtml(s.orden_codigo)}</strong></div><td>${escapeHtml(s.vehiculo)}</div><td>${s.items?.length || 1} item(s)</div><td>${statusBadge(s.estado)}</div><td>${formatDate(s.fecha_solicitud)}</div>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verSolicitudCompra(${s.id})"><i class="fas fa-eye"></i></button>
                ${s.estado === 'pendiente' ? `<button class="action-btn approve" onclick="aprobarCompra(${s.id})"><i class="fas fa-check-circle"></i></button>` : ''}
            </div>
        </tr>
    `).join('');
}

// =====================================================
// SUBIDA DE ARCHIVOS - CORREGIDA
// =====================================================

function setupFileUpload() {
    console.log('🔧 Configurando subida de archivos...');
    
    const fileInput = document.getElementById('cotizacionFile');
    const selectBtn = document.getElementById('selectFileBtn');
    const dropArea = document.getElementById('fileUploadArea');
    const removeBtn = document.getElementById('removeFileBtn');
    
    if (!fileInput) {
        console.error('❌ No se encontró el input de archivo (cotizacionFile)');
        return;
    }
    
    // Click en el botón de seleccionar archivo
    if (selectBtn) {
        selectBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🖱️ Click en seleccionar archivo');
            fileInput.click();
        });
    }
    
    // Click en el área de drop (si no es el botón)
    if (dropArea) {
        dropArea.addEventListener('click', function(e) {
            if (e.target === selectBtn || selectBtn?.contains(e.target)) return;
            console.log('🖱️ Click en área de drop');
            fileInput.click();
        });
    }
    
    // Cambio de archivo
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        console.log('📁 Archivo seleccionado:', file?.name);
        if (file) handleFileSelect(file);
    });
    
    // Drag & drop
    if (dropArea) {
        dropArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropArea.classList.add('dragover');
        });
        
        dropArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            dropArea.classList.remove('dragover');
        });
        
        dropArea.addEventListener('drop', function(e) {
            e.preventDefault();
            dropArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            console.log('📁 Archivo soltado:', file?.name);
            if (file) handleFileSelect(file);
        });
    }
    
    // Botón eliminar archivo
    if (removeBtn) {
        removeBtn.addEventListener('click', function() {
            console.log('🗑️ Eliminar archivo');
            clearFileSelection();
        });
    }
    
    console.log('✅ Subida de archivos configurada correctamente');
}

function handleFileSelect(file) {
    if (!file) return;
    
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Solo se permiten archivos PDF o Word', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showToast('El archivo no debe superar los 10MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        currentFileData = e.target.result;
        currentFileName = file.name;
        displayFileInfo(file);
        showToast('Archivo cargado correctamente', 'success');
        console.log('✅ Archivo cargado:', file.name);
    };
    reader.onerror = () => {
        showToast('Error al leer el archivo', 'error');
        console.error('❌ Error al leer el archivo');
    };
    reader.readAsDataURL(file);
}

function displayFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileIconPdf = document.getElementById('fileIconPdf');
    const fileIconWord = document.getElementById('fileIconWord');
    
    if (fileInfo && fileName && fileSize) {
        fileName.textContent = file.name;
        fileSize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        
        if (fileIconPdf && fileIconWord) {
            if (file.type === 'application/pdf') {
                fileIconPdf.style.display = 'block';
                fileIconWord.style.display = 'none';
            } else {
                fileIconPdf.style.display = 'none';
                fileIconWord.style.display = 'block';
            }
        }
        
        fileInfo.style.display = 'block';
        
        // Actualizar resumen
        const resumenArchivo = document.getElementById('resumenArchivo');
        if (resumenArchivo) resumenArchivo.textContent = file.name;
    }
}

function clearFileSelection() {
    currentFileData = null;
    currentFileName = null;
    
    const fileInfo = document.getElementById('fileInfo');
    const fileInput = document.getElementById('cotizacionFile');
    const resumenArchivo = document.getElementById('resumenArchivo');
    
    if (fileInfo) fileInfo.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (resumenArchivo) resumenArchivo.textContent = 'No seleccionado';
}

// =====================================================
// MODALES: NOTIFICAR ARMADO, INICIAR REPARACIÓN
// =====================================================

async function abrirModalNotificarArmado(id_orden, codigo, vehiculo, cliente) {
    currentOrdenArmado = { id_orden, codigo, vehiculo, cliente };
    
    const ordenInfo = document.getElementById('armadoOrdenInfo');
    if (ordenInfo) {
        ordenInfo.innerHTML = `
            <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(codigo)}</p>
            <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(vehiculo)}</p>
            <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(cliente)}</p>
            <p><strong><i class="fas fa-dollar-sign"></i> Monto a cobrar:</strong> Bs. 200.00 (solo diagnóstico)</p>
        `;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/tecnicos-asignados`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        const tecnicosContainer = document.getElementById('tecnicosAsignadosList');
        if (tecnicosContainer) {
            if (data.tecnicos && data.tecnicos.length > 0) {
                tecnicosContainer.innerHTML = data.tecnicos.map(t => `
                    <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; background: var(--bg-card); border-radius: 8px; margin-bottom: 0.5rem;">
                        <i class="fas fa-user-cog" style="color: var(--rojo-primario);"></i>
                        <div><strong>${escapeHtml(t.nombre)}</strong>${t.contacto ? `<br><small style="color: var(--gris-texto);">📞 ${escapeHtml(t.contacto)}</small>` : ''}</div>
                    </div>
                `).join('');
            } else {
                tecnicosContainer.innerHTML = `<div class="alert-warning">No hay técnicos asignados actualmente.</div>`;
            }
        }
    } catch (error) {
        console.error('Error cargando técnicos:', error);
    } finally {
        mostrarLoading(false);
    }
    
    document.getElementById('armadoInstrucciones').value = '';
    abrirModal('modalNotificarArmado');
}

async function confirmarNotificarArmado() {
    if (!currentOrdenArmado) return;
    
    const instrucciones = document.getElementById('armadoInstrucciones')?.value.trim();
    if (!instrucciones) {
        showToast('⚠️ Debes escribir instrucciones para el armado', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/rechazo/iniciar-armado`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenArmado.id_orden,
                instrucciones_armado: instrucciones
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Instrucciones enviadas al técnico', 'success');
            cerrarModal('modalNotificarArmado');
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al notificar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function abrirModalIniciarReparacion(id_orden, codigo, vehiculo, cliente) {
    currentOrdenAceptada = { id_orden, codigo, vehiculo, cliente };
    
    const ordenInfo = document.getElementById('reparacionOrdenInfo');
    if (ordenInfo) {
        ordenInfo.innerHTML = `
            <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(codigo)}</p>
            <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(vehiculo)}</p>
            <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(cliente)}</p>
        `;
    }
    
    mostrarLoading(true);
    try {
        // Obtener técnicos actualmente asignados y todos los técnicos con su carga
        const [tecnicosActualesRes, todosTecnicosRes] = await Promise.all([
            fetch(`${API_URL}/orden/${id_orden}/tecnicos-asignados`, { headers: getAuthHeaders() }),
            fetch(`${API_URL}/tecnicos-con-carga`, { headers: getAuthHeaders() })
        ]);
        
        const tecnicosActualesData = await tecnicosActualesRes.json();
        const todosTecnicosData = await todosTecnicosRes.json();
        
        console.log('📊 Técnicos actuales:', tecnicosActualesData);
        console.log('📊 Todos los técnicos con carga:', todosTecnicosData);
        
        // Crear un Set con los IDs de técnicos actualmente asignados
        const tecnicosActualesIds = new Set();
        if (tecnicosActualesData.tecnicos && tecnicosActualesData.tecnicos.length > 0) {
            tecnicosActualesData.tecnicos.forEach(t => tecnicosActualesIds.add(t.id));
        }
        
        const container = document.getElementById('tecnicosContainer');
        if (container) {
            if (todosTecnicosData.tecnicos && todosTecnicosData.tecnicos.length > 0) {
                container.innerHTML = todosTecnicosData.tecnicos.map(t => {
                    const estaAsignado = tecnicosActualesIds.has(t.id);
                    const ordenesActivas = t.ordenes_activas || 0;
                    const maxVehiculos = t.max_vehiculos || 2;
                    const disponible = ordenesActivas < maxVehiculos;
                    
                    // Determinar el color del badge de carga
                    let cargaColor = '';
                    let cargaIcono = '';
                    let cargaTexto = '';
                    
                    if (ordenesActivas === 0) {
                        cargaColor = '#10B981'; // verde
                        cargaIcono = 'fa-check-circle';
                        cargaTexto = 'Disponible';
                    } else if (ordenesActivas === 1) {
                        cargaColor = '#F59E0B'; // amarillo
                        cargaIcono = 'fa-clock';
                        cargaTexto = `${ordenesActivas}/${maxVehiculos} vehículo(s)`;
                    } else {
                        cargaColor = '#EF4444'; // rojo
                        cargaIcono = 'fa-exclamation-triangle';
                        cargaTexto = `COMPLETO (${ordenesActivas}/${maxVehiculos})`;
                    }
                    
                    // Determinar si el checkbox debe estar deshabilitado
                    const checkboxDisabled = !disponible && !estaAsignado;
                    const disabledAttr = checkboxDisabled ? 'disabled' : '';
                    
                    return `
                        <div class="tecnico-item" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem; background: var(--bg-card); border-radius: 8px; transition: all 0.2s; border: 1px solid var(--border-color); margin-bottom: 0.5rem; ${checkboxDisabled ? 'opacity: 0.6;' : ''}">
                            <input type="checkbox" id="tecnico_${t.id}" value="${t.id}" ${estaAsignado ? 'checked' : ''} ${disabledAttr}>
                            <label for="tecnico_${t.id}" style="flex: 1; cursor: ${checkboxDisabled ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-user-cog" style="color: var(--rojo-primario);"></i>
                                <div style="flex: 1;">
                                    <strong>${escapeHtml(t.nombre)}</strong>
                                    ${t.contacto ? `<br><small style="color: var(--gris-texto);">📞 ${escapeHtml(t.contacto)}</small>` : ''}
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                                    <span style="font-size: 0.7rem; color: ${cargaColor};">
                                        <i class="fas ${cargaIcono}"></i> ${cargaTexto}
                                    </span>
                                    ${ordenesActivas > 0 ? `
                                        <div style="width: 60px; height: 4px; background: var(--gris-oscuro); border-radius: 2px; overflow: hidden;">
                                            <div style="width: ${(ordenesActivas / maxVehiculos) * 100}%; height: 100%; background: ${cargaColor}; border-radius: 2px;"></div>
                                        </div>
                                    ` : ''}
                                </div>
                                ${estaAsignado ? '<span style="margin-left: 0.5rem; font-size: 0.7rem; color: var(--verde-exito);"><i class="fas fa-check-circle"></i> Actual</span>' : ''}
                                ${!disponible && !estaAsignado ? '<span style="margin-left: 0.5rem; font-size: 0.7rem; color: var(--rojo-primario);"><i class="fas fa-ban"></i> Límite alcanzado</span>' : ''}
                            </label>
                        </div>
                    `;
                }).join('');
            } else {
                container.innerHTML = `<div class="alert-warning" style="padding: 1rem; text-align: center;">
                    <i class="fas fa-exclamation-triangle"></i> No hay técnicos disponibles para asignar<br>
                    <small>Verifica que existan usuarios con rol "tecnico_mecanico" en el sistema</small>
                </div>`;
            }
        } else {
            console.error('❌ No se encontró el contenedor con id "tecnicosContainer"');
        }
    } catch (error) {
        console.error('Error cargando técnicos:', error);
        const container = document.getElementById('tecnicosContainer');
        if (container) {
            container.innerHTML = `<div class="alert-danger" style="padding: 1rem; text-align: center;">
                <i class="fas fa-exclamation-circle"></i> Error al cargar técnicos. Intente nuevamente.<br>
                <small>${error.message}</small>
            </div>`;
        }
    } finally {
        mostrarLoading(false);
    }
    
    document.getElementById('reparacionInstrucciones').value = '';
    document.getElementById('reparacionPlazoDias').value = 3;
    abrirModal('modalIniciarReparacion');
}
async function confirmarIniciarReparacion() {
    if (!currentOrdenAceptada) return;
    
    const instrucciones = document.getElementById('reparacionInstrucciones')?.value.trim();
    if (!instrucciones) {
        showToast('⚠️ Debes escribir instrucciones', 'warning');
        return;
    }
    
    const checkboxes = document.querySelectorAll('#tecnicosContainer input[type="checkbox"]:checked');
    const tecnicosIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (tecnicosIds.length === 0) {
        showToast('⚠️ Selecciona al menos un técnico', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        // 1. Asignar técnicos
        const asignarResponse = await fetch(`${API_URL}/asignar-tecnicos`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenAceptada.id_orden,
                tecnicos: tecnicosIds,
                instrucciones: instrucciones,
                tiempo_estimado: document.getElementById('reparacionPlazoDias')?.value || 3,
                tiempo_unidad: 'dias'
            })
        });
        
        const asignarData = await asignarResponse.json();
        
        if (!asignarData.success) {
            showToast(asignarData.error || 'Error al asignar técnicos', 'error');
            return;
        }
        
        // 2. Cambiar el estado de la orden (endpoint separado)
        console.log('🔄 Cambiando estado de la orden...');
        const estadoResponse = await fetch(`${API_URL}/cambiar-estado-reparacion/${currentOrdenAceptada.id_orden}`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        const estadoData = await estadoResponse.json();
        
        if (estadoData.success) {
            showToast(`✅ Reparación iniciada con ${tecnicosIds.length} técnico(s)`, 'success');
            cerrarModal('modalIniciarReparacion');
            
            // Recargar la página para ver el cambio
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showToast('Los técnicos fueron asignados pero hubo un error al cambiar el estado', 'warning');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}
// =====================================================
// FUNCIONES PARA SERVICIOS COTIZABLES
// =====================================================

function renderServiciosCotizables() {
    const container = document.getElementById('serviciosCotizacionContainer');
    if (!container) return;
    
    if (serviciosCotizables.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-plus-circle"></i><p>No hay servicios agregados</p><small>Haz clic en "Agregar Servicio" para comenzar</small></div>`;
        actualizarTotalCotizacion();
        return;
    }
    
    container.innerHTML = serviciosCotizables.map((serv, idx) => `
        <div class="servicio-cotizable-card">
            <div class="servicio-cotizable-header" onclick="toggleServicioCotizable(${idx})">
                <div class="servicio-cotizable-nombre">
                    <input type="text" value="${escapeHtml(serv.nombre)}" onchange="actualizarServicioCotizable(${idx}, 'nombre', this.value)" onclick="event.stopPropagation()">
                </div>
                <div class="servicio-cotizable-precio">
                    Bs. <input type="number" value="${serv.precio || 0}" step="0.01" onchange="actualizarServicioCotizable(${idx}, 'precio', parseFloat(this.value))" onclick="event.stopPropagation()">
                </div>
                <button class="action-btn delete" onclick="eliminarServicioCotizable(${idx})" onclick="event.stopPropagation()"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="servicio-cotizable-body" id="servicio-body-${idx}">
                <div class="form-group">
                    <label>Descripción detallada</label>
                    <textarea class="form-textarea" rows="2" onchange="actualizarServicioCotizable(${idx}, 'descripcion', this.value)">${escapeHtml(serv.descripcion || '')}</textarea>
                </div>
            </div>
        </div>
    `).join('');
    
    actualizarTotalCotizacion();
}

function toggleServicioCotizable(idx) {
    const body = document.getElementById(`servicio-body-${idx}`);
    if (body) body.classList.toggle('active');
}

function actualizarServicioCotizable(idx, campo, valor) {
    if (serviciosCotizables[idx]) {
        serviciosCotizables[idx][campo] = valor;
        if (campo === 'precio') actualizarTotalCotizacion();
    }
}

function agregarServicioCotizable() {
    serviciosCotizables.push({
        id_servicio: null,
        nombre: 'Nuevo Servicio',
        descripcion: '',
        precio: 0,
        items: []
    });
    renderServiciosCotizables();
}

function eliminarServicioCotizable(idx) {
    if (confirm('¿Eliminar este servicio de la cotización?')) {
        serviciosCotizables.splice(idx, 1);
        renderServiciosCotizables();
    }
}

function actualizarTotalCotizacion() {
    const total = serviciosCotizables.reduce((sum, serv) => sum + (serv.precio || 0), 0);
    const totalSpan = document.getElementById('totalCotizacion');
    const resumenTotal = document.getElementById('resumenTotal');
    if (totalSpan) totalSpan.textContent = formatCurrency(total);
    if (resumenTotal) resumenTotal.textContent = formatCurrency(total);
}

function cargarServiciosDesdeDiagnostico(orden) {
    serviciosCotizables = [];
    
    if (orden.servicios && orden.servicios.length > 0) {
        orden.servicios.forEach(serv => {
            serviciosCotizables.push({
                id_servicio: serv.id_servicio,
                nombre: serv.descripcion,
                descripcion: serv.descripcion || '',
                precio: serv.precio_cotizado || 0,
                items: []
            });
        });
    }
    
    if (serviciosCotizables.length === 0) {
        serviciosCotizables.push({
            id_servicio: null,
            nombre: 'Mano de obra',
            descripcion: 'Trabajos de reparación y mantenimiento',
            precio: 0,
            items: []
        });
    }
    
    renderServiciosCotizables();
}

// =====================================================
// COTIZACIÓN AL CLIENTE
// =====================================================

// Configurar los tabs del modal de generación de cotización
function setupModalTabs() {
    const modalTabs = document.querySelectorAll('#modalGenerarCotizacion .modal-tab-btn');
    const modalContents = document.querySelectorAll('#modalGenerarCotizacion .modal-tab-content');
    
    modalTabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            
            // Remover active de todos los tabs
            modalTabs.forEach(t => t.classList.remove('active'));
            modalContents.forEach(c => c.classList.remove('active'));
            
            // Activar el tab seleccionado
            this.classList.add('active');
            const activeContent = document.getElementById(`tab-${tabId}`);
            if (activeContent) {
                activeContent.classList.add('active');
            }
        });
    });
}

// Llamar a esta función después de abrir el modal
async function abrirModalGenerarCotizacion(id_orden) {
    mostrarLoading(true);
    isEditingCotizacion = false;
    currentCotizacionId = null;
    
    try {
        const orden = ordenesParaCotizar.find(o => o.id_orden === id_orden);
        if (!orden) {
            showToast('Orden no encontrada', 'error');
            return;
        }
        
        currentOrdenData = { id_orden };
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-file-invoice"></i> Generar Cotización';
        
        cargarServiciosDesdeDiagnostico(orden);
        clearFileSelection();
        
        const ordenInfoDiv = document.getElementById('ordenInfoPreview');
        if (ordenInfoDiv) {
            ordenInfoDiv.innerHTML = `
                <div>
                    <strong>Orden:</strong> ${escapeHtml(orden.codigo_unico)}<br>
                    <strong>Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}<br>
                    <strong>Vehículo:</strong> ${escapeHtml(orden.vehiculo)}
                </div>
            `;
        }
        
        setupFileUpload();
        
        // Configurar los tabs del modal
        setTimeout(() => {
            setupModalTabs();
        }, 100);
        
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function editarCotizacionExistente(id_orden) {
    const cotizacion = cotizacionesMap[id_orden];
    if (cotizacion) {
        await editarCotizacionPorId(cotizacion.id);
    } else {
        abrirModalGenerarCotizacion(id_orden);
    }
}

async function editarCotizacionPorId(id_cotizacion) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${id_cotizacion}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (!data.success) {
            showToast('Error al cargar la cotización', 'error');
            return;
        }
        
        const cotizacion = data.detalle;
        currentOrdenData = { id_orden: cotizacion.id_orden_trabajo };
        currentCotizacionId = id_cotizacion;
        isEditingCotizacion = true;
        
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Cotización';
        
        if (cotizacion.servicios && cotizacion.servicios.length > 0) {
            serviciosCotizables = cotizacion.servicios.map(serv => ({
                id_servicio: serv.id_servicio,
                nombre: serv.nombre || serv.descripcion,
                precio: serv.precio || 0
            }));
        } else {
            serviciosCotizables = [];
        }
        
        renderServiciosCotizables();
        
        if (cotizacion.notas) {
            document.getElementById('notasAdicionales').value = cotizacion.notas;
        }
        
        clearFileSelection();
        setupFileUpload();
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function enviarCotizacionCliente() {
    if (!currentOrdenData) {
        showToast('No hay datos para enviar', 'warning');
        return;
    }
    
    if (!currentFileData) {
        showToast('Debes subir un archivo PDF o Word', 'warning');
        return;
    }
    
    const serviciosConPrecio = serviciosCotizables.filter(s => s.precio > 0);
    if (serviciosConPrecio.length === 0) {
        showToast('Debes asignar precios a al menos un servicio', 'warning');
        return;
    }
    
    if (!confirm(isEditingCotizacion ? '¿Actualizar y reenviar esta cotización?' : '¿Enviar esta cotización al cliente?')) return;
    
    mostrarLoading(true);
    try {
        const serviciosParaEnviar = serviciosCotizables.map(serv => ({
            id_servicio: serv.id_servicio,
            nombre: serv.nombre,
            precio: serv.precio
        }));
        
        const url = isEditingCotizacion && currentCotizacionId 
            ? `${API_URL}/actualizar-cotizacion/${currentCotizacionId}`
            : `${API_URL}/enviar-cotizacion`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenData.id_orden,
                archivo_base64: currentFileData,
                nombre_archivo: currentFileName,
                notas: document.getElementById('notasAdicionales')?.value || '',
                servicios: serviciosParaEnviar
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast(isEditingCotizacion ? 'Cotización actualizada y reenviada' : 'Cotización enviada al cliente', 'success');
            cerrarModal('modalGenerarCotizacion');
            clearFileSelection();
            serviciosCotizables = [];
            isEditingCotizacion = false;
            currentCotizacionId = null;
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al enviar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function reutilizarCotizacionRechazada(id_orden) {
    mostrarLoading(true);
    try {
        const orden = ordenesParaCotizar.find(o => o.id_orden === id_orden);
        const cotizacionId = orden?.cotizacion_id;
        
        if (!cotizacionId) {
            abrirModalGenerarCotizacion(id_orden);
            return;
        }
        
        const response = await fetch(`${API_URL}/detalle-cotizacion/${cotizacionId}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (!data.success) {
            abrirModalGenerarCotizacion(id_orden);
            return;
        }
        
        const cotizacion = data.detalle;
        currentOrdenData = { id_orden };
        isEditingCotizacion = false;
        currentCotizacionId = null;
        
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-copy"></i> Nueva Cotización';
        
        if (cotizacion.servicios && cotizacion.servicios.length > 0) {
            serviciosCotizables = cotizacion.servicios.map(serv => ({
                id_servicio: serv.id_servicio,
                nombre: serv.nombre || serv.descripcion,
                precio: serv.precio || 0
            }));
        } else {
            serviciosCotizables = [];
        }
        
        renderServiciosCotizables();
        
        const ordenInfoDiv = document.getElementById('ordenInfoPreview');
        if (ordenInfoDiv && orden) {
            ordenInfoDiv.innerHTML = `<div><strong>Orden:</strong> ${escapeHtml(orden.codigo_unico)}<br><strong>Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}<br><strong>Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</div><small>Basado en cotización rechazada el ${formatDate(cotizacion.fecha_rechazo)}</small>`;
        }
        
        clearFileSelection();
        setupFileUpload();
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        abrirModalGenerarCotizacion(id_orden);
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE DE COTIZACIÓN
// =====================================================

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
                    <p><strong>Estado:</strong> ${statusBadge(d.estado || 'enviada')}</p>
                    <p><strong>Total:</strong> ${formatCurrency(d.total)}</p>
                    ${d.notas ? `<p><strong>Mensaje:</strong> ${escapeHtml(d.notas)}</p>` : ''}
                </div>
            `;
            
            abrirModal('modalDetalleCotizacion');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function verDetalleCotizacionByOrden(id_orden) {
    const cotizacion = cotizacionesMap[id_orden];
    if (cotizacion) {
        await verDetalleCotizacion(cotizacion.id);
    } else {
        showToast('No se encontró cotización para esta orden', 'warning');
    }
}

// =====================================================
// ACCIONES - SOLICITUDES
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
            await cargarOrdenesDiagnosticoAprobado();
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function solicitarCompraDesdeCotizacion(id_solicitud) {
    const solicitud = solicitudesCotizacion.find(s => s.id === id_solicitud);
    if (!solicitud) return;
    
    limpiarItemsCompra();
    if (solicitud.items && solicitud.items.length > 0) {
        itemsCompra = [...solicitud.items];
        renderItemsCompra();
    }
    
    window.currentCompraData = { id_solicitud_cotizacion: id_solicitud };
    document.getElementById('solicitudCompraInfo').innerHTML = `
        <p><strong>Orden:</strong> ${escapeHtml(solicitud.orden_codigo)}</p>
        <p><strong>Vehículo:</strong> ${escapeHtml(solicitud.vehiculo)}</p>
        <p><strong>Precio cotizado:</strong> ${solicitud.precio_cotizado ? formatCurrency(solicitud.precio_cotizado) : 'No especificado'}</p>
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
            showToast('Solicitud de compra creada', 'success');
            cerrarModal('modalSolicitarCompra');
            limpiarItemsCompra();
            await cargarSolicitudesCompra();
            await cargarOrdenesDiagnosticoAprobado();
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
            showToast('Compra registrada', 'success');
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

function verAvanceReparacion(id_orden) {
    showToast('Función en desarrollo', 'info');
}

async function verInstruccionesArmado(id_orden) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/instrucciones-armado`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success && data.instrucciones) {
            const container = document.getElementById('detalleCotizacionContainer');
            container.innerHTML = `
                <div class="alert-info">
                    <strong>Instrucciones de armado:</strong>
                    <p style="margin-top: 0.75rem; white-space: pre-wrap;">${escapeHtml(data.instrucciones)}</p>
                    <small>Fecha: ${formatDate(data.fecha_envio)}</small>
                </div>
            `;
            abrirModal('modalDetalleCotizacion');
        } else {
            showToast('No se encontraron instrucciones', 'warning');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar instrucciones', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// FUNCIONES AUXILIARES - TABS Y EVENTOS
// =====================================================

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

function setupEventListeners() {
    document.getElementById('enviarCotizacionBtn')?.addEventListener('click', enviarCotizacionCliente);
    document.getElementById('confirmarSolicitudCompra')?.addEventListener('click', confirmarSolicitudCompra);
    document.getElementById('btnAgregarItemCompra')?.addEventListener('click', agregarItemCompra);
    document.getElementById('btnAgregarServicioCotizacion')?.addEventListener('click', agregarServicioCotizable);
    document.getElementById('btnAgregarItemSolicitud')?.addEventListener('click', agregarItemSolicitud);
    document.getElementById('saveSolicitudModal')?.addEventListener('click', guardarSolicitudCotizacion);
    
    document.getElementById('refreshSolicitarBtn')?.addEventListener('click', () => cargarDatosIniciales());
    document.getElementById('refreshCotizacionBtn')?.addEventListener('click', () => cargarDatosIniciales());
    document.getElementById('btnHistorialCotizaciones')?.addEventListener('click', () => {
        cargarHistorialCotizaciones().then(() => abrirModal('modalHistorialCotizaciones'));
    });
    document.getElementById('refreshHistorialBtn')?.addEventListener('click', cargarHistorialCotizaciones);
    document.getElementById('btnNuevaSolicitudCotizacion')?.addEventListener('click', () => {
        limpiarItemsSolicitud();
        cargarOrdenesAprobadas().then(() => abrirModal('modalSolicitudCotizacion'));
    });
    
    document.getElementById('filtroEstadoCotizacionSolicitar')?.addEventListener('change', () => renderOrdenesSolicitarCotizacion());
    document.getElementById('searchOrdenSolicitar')?.addEventListener('input', () => renderOrdenesSolicitarCotizacion());
    document.getElementById('filtroEstadoCotizacionCliente')?.addEventListener('change', () => renderOrdenesCotizacionCliente());
    document.getElementById('searchCotizacionCliente')?.addEventListener('input', () => renderOrdenesCotizacionCliente());
    document.getElementById('searchHistorial')?.addEventListener('input', () => renderHistorialCotizaciones());
    document.getElementById('filtroEstadoHistorial')?.addEventListener('change', () => renderHistorialCotizaciones());
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    });
}

async function guardarSolicitudCotizacion() {
    const id_orden_trabajo = document.getElementById('solicitud_id_orden_trabajo')?.value;
    const id_servicio = document.getElementById('solicitud_id_servicio')?.value;
    const id_encargado = document.getElementById('solicitud_id_encargado')?.value;
    const observaciones = document.getElementById('solicitud_observacion')?.value || '';
    
    if (!id_orden_trabajo || !id_servicio || !id_encargado) {
        showToast('Complete todos los campos requeridos', 'warning');
        return;
    }
    
    if (itemsSolicitud.length === 0) {
        showToast('Agregue al menos un item para cotizar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden_trabajo: parseInt(id_orden_trabajo),
                id_servicio: parseInt(id_servicio),
                id_encargado: parseInt(id_encargado),
                items: itemsSolicitud,
                observaciones: observaciones
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Solicitud de cotización enviada exitosamente', 'success');
            cerrarModal('modalSolicitudCotizacion');
            limpiarItemsSolicitud();
            await cargarSolicitudesCotizacion();
            await cargarOrdenesDiagnosticoAprobado();
        } else {
            showToast(data.error || 'Error al enviar solicitud', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
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
    console.log('🚀 Inicializando cotizaciones.js versión 3.3');
    const user = await cargarUsuarioActual();
    if (!user) return;
    await cargarDatosIniciales();
    setupTabs();
    setupEventListeners();
    console.log('✅ cotizaciones.js inicializado correctamente');
}
// Función para mostrar badge de carga de técnicos en la tarjeta de orden
function renderCargaTecnicosBadge(tecnicos) {
    if (!tecnicos || tecnicos.length === 0) return '';
    
    const totalCarga = tecnicos.reduce((sum, t) => sum + (t.ordenes_activas || 0), 0);
    const maxTotal = tecnicos.length * 2;
    
    let color = '#10B981';
    if (totalCarga >= maxTotal) color = '#EF4444';
    else if (totalCarga > 0) color = '#F59E0B';
    
    return `
        <span style="font-size: 0.65rem; background: ${color}20; color: ${color}; padding: 0.2rem 0.5rem; border-radius: 12px;">
            <i class="fas fa-chart-line"></i> Carga: ${totalCarga}/${maxTotal}
        </span>
    `;
}

// Exponer funciones globales
window.eliminarSolicitudCotizacion = eliminarSolicitudCotizacion;
window.solicitarCompraDesdeCotizacion = solicitarCompraDesdeCotizacion;
window.abrirModalGenerarCotizacion = abrirModalGenerarCotizacion;
window.editarCotizacionExistente = editarCotizacionExistente;
window.verDetalleCotizacion = verDetalleCotizacion;
window.verDetalleCotizacionByOrden = verDetalleCotizacionByOrden;
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
window.actualizarServicioCotizable = actualizarServicioCotizable;
window.agregarServicioCotizable = agregarServicioCotizable;
window.eliminarServicioCotizable = eliminarServicioCotizable;
window.reutilizarCotizacionRechazada = reutilizarCotizacionRechazada;
window.abrirModalIniciarReparacion = abrirModalIniciarReparacion;
window.confirmarIniciarReparacion = confirmarIniciarReparacion;
window.abrirModalNotificarArmado = abrirModalNotificarArmado;
window.confirmarNotificarArmado = confirmarNotificarArmado;
window.verAvanceReparacion = verAvanceReparacion;
window.abrirModalSolicitudParaOrden = abrirModalSolicitudParaOrden;
window.verInstruccionesArmado = verInstruccionesArmado;
window.toggleServicioCotizable = toggleServicioCotizable;

// Inicializar
document.addEventListener('DOMContentLoaded', inicializar);