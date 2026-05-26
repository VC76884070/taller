// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            return 'http://localhost:5000';
        }
        return '';
    })();
}

// =====================================================
// COTIZACIONES.JS - JEFE DE TALLER
// VERSIÓN 5.0 - CON SOLICITUDES DE TÉCNICOS Y COMPRA DIRECTA UNIFICADA
// =====================================================

const API_URL = window.API_BASE_URL + '/api/jefe-taller';
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
let solicitudesRepuestosTecnico = [];

// Items dinámicos
let itemsSolicitud = [];
let itemsCompraDirecta = [];

// Variables para archivo y servicios
let currentFileData = null;
let currentFileName = null;
let currentOrdenData = null;
let currentCotizacionId = null;
let serviciosCotizables = [];
let isEditingCotizacion = false;
let currentOrdenAceptada = null;
let currentOrdenArmado = null;

// Variable para solicitud de técnico (cuando se abre el modal desde el carrito)
let currentSolicitudTecnico = null;

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
        'solicitado': 'status-pendiente',
        'en_proceso': 'status-cotizado',
        'completado': 'status-aprobado'
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
        'solicitado': 'Solicitud Enviada',
        'en_proceso': 'En Proceso',
        'completado': 'Completado'
    };
    
    let icon = 'fa-clock';
    if (estado === 'aprobado' || estado === 'aprobada' || estado === 'comprado' || estado === 'completado') icon = 'fa-check-circle';
    if (estado === 'rechazado') icon = 'fa-times-circle';
    if (estado === 'enviada') icon = 'fa-paper-plane';
    if (estado === 'solicitado') icon = 'fa-paper-plane';
    if (estado === 'en_proceso') icon = 'fa-spinner fa-pulse';
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${icon}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE ITEMS - SOLICITUD COTIZACIÓN
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

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE ITEMS - COMPRA DIRECTA (UNIFICADO)
// =====================================================

function renderItemsCompraDirecta() {
    const container = document.getElementById('itemsListCompraDirecta');
    if (!container) return;
    
    if (itemsCompraDirecta.length === 0) {
        container.innerHTML = `<div class="item-empty"><i class="fas fa-box-open"></i><p>No hay items agregados</p><small>Haz clic en "Agregar item" para comenzar</small></div>`;
        return;
    }
    
    container.innerHTML = itemsCompraDirecta.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Nombre del repuesto" onchange="actualizarItemCompraDirecta(${index}, 'descripcion', this.value)">
                <input type="number" class="item-cantidad" value="${item.cantidad}" min="1" onchange="actualizarItemCompraDirecta(${index}, 'cantidad', parseInt(this.value))">
                <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle (marca, especificaciones...)" onchange="actualizarItemCompraDirecta(${index}, 'detalle', this.value)">
            </div>
            <div class="item-actions">
                <button class="btn-remove-item" onclick="eliminarItemCompraDirecta(${index})"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `).join('');
}

function agregarItemCompraDirecta() {
    itemsCompraDirecta.push({ descripcion: '', cantidad: 1, detalle: '' });
    renderItemsCompraDirecta();
    setTimeout(() => {
        const lastInput = document.querySelector('#itemsListCompraDirecta .item-row:last-child .item-descripcion');
        if (lastInput) lastInput.focus();
    }, 100);
}

function actualizarItemCompraDirecta(index, campo, valor) {
    if (itemsCompraDirecta[index]) itemsCompraDirecta[index][campo] = valor;
}

function eliminarItemCompraDirecta(index) {
    itemsCompraDirecta.splice(index, 1);
    renderItemsCompraDirecta();
}

function limpiarItemsCompraDirecta() {
    itemsCompraDirecta = [];
    renderItemsCompraDirecta();
}

// =====================================================
// CARGA DE DATOS PRINCIPALES
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
        const response = await fetch(`${API_URL}/solicitudes-compra`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            solicitudesCompra = data.solicitudes || [];
            renderSolicitudesCompra();
            console.log(`📊 Solicitudes de compra cargadas: ${solicitudesCompra.length}`);
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
            cargarSelectEncargadosCompra();
        }
    } catch (error) {
        console.error('Error cargando encargados:', error);
        encargadosRepuestos = [];
    }
}

function cargarSelectEncargadosCompra() {
    const selectEncargado = document.getElementById('compraDirecta_id_encargado');
    if (selectEncargado && encargadosRepuestos.length > 0) {
        selectEncargado.innerHTML = '<option value="">Seleccionar encargado</option>' +
            encargadosRepuestos.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
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

async function cargarOrdenesActivasParaCompraDirecta() {
    try {
        mostrarLoading(true);
        console.log('🔄 Cargando órdenes activas...');
        
        const response = await fetch(`${API_URL}/ordenes-activas`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        console.log('📦 Datos recibidos del backend:', JSON.stringify(data, null, 2));
        
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        if (!selectOrden) {
            console.error('❌ Select no encontrado');
            return;
        }
        
        if (data.success && data.ordenes && data.ordenes.length > 0) {
            console.log(`✅ ${data.ordenes.length} órdenes encontradas`);
            
            selectOrden.innerHTML = '<option value="">Seleccionar orden</option>';
            
            data.ordenes.forEach(orden => {
                const option = document.createElement('option');
                // Asegurar que el valor sea el ID correcto
                const ordenId = orden.id_orden || orden.id;
                option.value = ordenId;
                option.textContent = `${orden.codigo_unico} - ${orden.vehiculo || 'Vehículo'}`;
                selectOrden.appendChild(option);
                console.log(`  - Agregada: value=${option.value}, text=${option.textContent}`);
            });
            
            // Auto-seleccionar la primera orden válida
            if (selectOrden.options.length > 1) {
                selectOrden.selectedIndex = 1;
                console.log('✅ Seleccionada primera orden:', selectOrden.value);
            }
            
        } else {
            console.warn('⚠️ No hay órdenes activas');
            selectOrden.innerHTML = '<option value="">No hay órdenes activas disponibles</option>';
        }
    } catch (error) {
        console.error('❌ Error cargando órdenes:', error);
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        if (selectOrden) {
            selectOrden.innerHTML = '<option value="">Error al cargar órdenes</option>';
        }
        showToast('Error al cargar las órdenes activas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// SOLICITUDES DE REPUESTOS DE TÉCNICOS (TAB 3)
// =====================================================

async function cargarSolicitudesRepuestosTecnico() {
    try {
        const estado = document.getElementById('filtroEstadoRepuestoTecnico')?.value || 'all';
        const search = document.getElementById('searchRepuestoTecnico')?.value || '';
        
        let url = `${API_URL}/solicitudes-repuestos-tecnico?estado=${estado}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            solicitudesRepuestosTecnico = data.solicitudes || [];
            renderSolicitudesRepuestosTecnico();
            console.log(`📊 Solicitudes de técnicos: ${solicitudesRepuestosTecnico.length}`);
        }
    } catch (error) {
        console.error('Error cargando solicitudes de técnicos:', error);
        solicitudesRepuestosTecnico = [];
        const tbody = document.getElementById('tablaSolicitudesRepuestosTecnico');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar solicitudes</p></div></td></tr>`;
        }
    }
}

function renderSolicitudesRepuestosTecnico() {
    const tbody = document.getElementById('tablaSolicitudesRepuestosTecnico');
    if (!tbody) return;
    
    if (solicitudesRepuestosTecnico.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-inbox"></i><p>No hay solicitudes de repuestos de técnicos</p></div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = solicitudesRepuestosTecnico.map(s => {
        let itemsHtml = '';
        if (s.items && s.items.length > 0) {
            itemsHtml = s.items.map(item => 
                `<div style="font-size: 0.7rem; padding: 0.2rem 0;">• ${escapeHtml(item.descripcion)} x${item.cantidad}</div>`
            ).join('');
        } else {
            itemsHtml = '<span class="text-muted">No especificado</span>';
        }
        
        let estadoClass = '';
        let estadoIcon = '';
        let estadoTexto = '';
        
        switch (s.estado) {
            case 'pendiente':
                estadoClass = 'status-pendiente';
                estadoIcon = 'fa-clock';
                estadoTexto = 'Pendiente';
                break;
            case 'en_proceso':
                estadoClass = 'status-cotizado';
                estadoIcon = 'fa-spinner fa-pulse';
                estadoTexto = 'En Proceso';
                break;
            case 'completado':
                estadoClass = 'status-aprobado';
                estadoIcon = 'fa-check-circle';
                estadoTexto = 'Completado';
                break;
            case 'rechazado':
                estadoClass = 'status-rechazado';
                estadoIcon = 'fa-times-circle';
                estadoTexto = 'Rechazado';
                break;
            default:
                estadoClass = 'status-pendiente';
                estadoIcon = 'fa-clock';
                estadoTexto = s.estado || 'Desconocido';
        }
        
        // Botón de carrito (Gestionar Compra) - abre el mismo modal que el botón "Nueva Solicitud de Compra Directa"
        // pero PRE-CARGADO con los items del técnico
        let accionesHtml = '';
        if (s.estado === 'pendiente' || s.estado === 'en_proceso') {
            accionesHtml = `
                <button class="action-btn edit" onclick="abrirModalCompraDesdeSolicitudTecnico(${s.id})" title="Gestionar Compra">
                    <i class="fas fa-shopping-cart"></i>
                </button>
            `;
        } else {
            accionesHtml = `<span class="text-muted">Finalizado</span>`;
        }
        
        return `
            <tr>
                <td>${s.id}</td>
                <td><strong>${escapeHtml(s.orden_codigo)}</strong><br><small class="text-muted">${escapeHtml(s.orden_estado)}</small></td>
                <td>${escapeHtml(s.vehiculo)}</td>
                <td>
                    <strong>${escapeHtml(s.tecnico_nombre)}</strong>
                    ${s.tecnico_contacto ? `<br><small class="text-muted">📞 ${escapeHtml(s.tecnico_contacto)}</small>` : ''}
                </td>
                <td style="max-width: 250px;">
                    ${itemsHtml}
                    ${s.observaciones ? `<div class="text-muted" style="font-size: 0.65rem; margin-top: 0.25rem;"><i class="fas fa-comment"></i> ${escapeHtml(s.observaciones.substring(0, 50))}${s.observaciones.length > 50 ? '...' : ''}</div>` : ''}
                </td>
                <td><span class="status-badge ${estadoClass}"><i class="fas ${estadoIcon}"></i> ${estadoTexto}</span></td>
                <td>${formatDate(s.fecha_solicitud)}</td>
                <td class="action-buttons">${accionesHtml}</td>
            </tr>
        `;
    }).join('');
}

// =====================================================
// MODAL DE COMPRA DIRECTA UNIFICADO
// =====================================================

// Abre el modal para nueva solicitud de compra (botón)
async function abrirModalNuevaSolicitudCompraDirecta() {
    console.log('🔄 Abriendo modal de nueva solicitud de compra directa...');
    
    limpiarItemsCompraDirecta();
    currentSolicitudTecnico = null;
    
    const observacionesTextarea = document.getElementById('compraDirecta_observaciones');
    if (observacionesTextarea) observacionesTextarea.value = '';
    
    const infoAdicional = document.getElementById('compraDirectaInfoAdicional');
    if (infoAdicional) infoAdicional.style.display = 'none';
    
    const title = document.getElementById('modalCompraDirectaTitle');
    if (title) title.innerHTML = '<i class="fas fa-shopping-cart"></i> Nueva Solicitud de Compra';
    
    mostrarLoading(true);
    try {
        await cargarOrdenesActivasParaCompraDirecta();
        await cargarEncargadosRepuestos();
        
        // Forzar que el select tenga un valor válido seleccionado
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        if (selectOrden && selectOrden.options.length > 1) {
            // Si hay opciones y la primera es la placeholder, seleccionar la primera opción válida
            if (selectOrden.selectedIndex === 0 || !selectOrden.value || selectOrden.value === '') {
                selectOrden.selectedIndex = 1; // Seleccionar la primera opción válida
                console.log('✅ Select orden auto-seleccionado a:', selectOrden.value);
            }
        }
        
        const selectEncargado = document.getElementById('compraDirecta_id_encargado');
        if (selectEncargado && selectEncargado.options.length > 1 && (!selectEncargado.value || selectEncargado.value === '')) {
            selectEncargado.selectedIndex = 1;
        }
        
        abrirModal('modalNuevaSolicitudCompraDirecta');
        
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error al preparar el formulario', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// Abre el modal desde el carrito de una solicitud de técnico
async function abrirModalCompraDesdeSolicitudTecnico(id_solicitud) {
    console.log(`🔄 Abriendo modal desde solicitud de técnico #${id_solicitud}`);
    
    const solicitud = solicitudesRepuestosTecnico.find(s => s.id === id_solicitud);
    if (!solicitud) {
        showToast('No se encontró la solicitud del técnico', 'error');
        return;
    }
    
    currentSolicitudTecnico = solicitud;
    
    // Limpiar items previos
    limpiarItemsCompraDirecta();
    
    // Pre-cargar los items del técnico en el modal
    if (solicitud.items && solicitud.items.length > 0) {
        itemsCompraDirecta = solicitud.items.map(item => ({
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            detalle: item.detalle || ''
        }));
        renderItemsCompraDirecta();
        console.log(`📦 Items pre-cargados: ${itemsCompraDirecta.length}`);
    }
    
    // Mostrar info adicional de la solicitud del técnico
    const infoAdicional = document.getElementById('compraDirectaInfoAdicional');
    if (infoAdicional) {
        let itemsHtml = '';
        if (solicitud.items && solicitud.items.length > 0) {
            itemsHtml = '<ul style="margin: 0.5rem 0 0 1rem;">' + 
                solicitud.items.map(item => `<li><strong>${escapeHtml(item.descripcion)}</strong> x${item.cantidad}${item.detalle ? ` (${escapeHtml(item.detalle)})` : ''}</li>`).join('') + 
                '</ul>';
        }
        
        infoAdicional.innerHTML = `
            <p><strong><i class="fas fa-tools"></i> Solicitud del Técnico #${solicitud.id}</strong></p>
            <p><strong>Orden:</strong> ${escapeHtml(solicitud.orden_codigo)}</p>
            <p><strong>Vehículo:</strong> ${escapeHtml(solicitud.vehiculo)}</p>
            <p><strong>Técnico:</strong> ${escapeHtml(solicitud.tecnico_nombre)}</p>
            <p><strong>Repuestos solicitados:</strong>${itemsHtml}</p>
            ${solicitud.observaciones ? `<p><strong>Observaciones del técnico:</strong> ${escapeHtml(solicitud.observaciones)}</p>` : ''}
        `;
        infoAdicional.style.display = 'block';
    }
    
    // Cambiar título
    const title = document.getElementById('modalCompraDirectaTitle');
    if (title) title.innerHTML = '<i class="fas fa-shopping-cart"></i> Solicitar Compra - Items del Técnico';
    
    mostrarLoading(true);
    try {
        // Cargar órdenes activas
        await cargarOrdenesActivasParaCompraDirecta();
        
        // Pre-seleccionar la orden
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        if (selectOrden && solicitud.id_orden_trabajo) {
            // Asegurar que la orden esté en el select
            const optionExists = Array.from(selectOrden.options).some(opt => opt.value == solicitud.id_orden_trabajo);
            if (!optionExists) {
                // Agregar la orden si no existe
                const option = document.createElement('option');
                option.value = solicitud.id_orden_trabajo;
                option.textContent = `${escapeHtml(solicitud.orden_codigo)} - ${escapeHtml(solicitud.vehiculo)}`;
                selectOrden.appendChild(option);
            }
            selectOrden.value = solicitud.id_orden_trabajo;
            console.log(`✅ Orden preseleccionada: ${solicitud.id_orden_trabajo}`);
        }
        
        // Cargar encargados de repuestos
        await cargarEncargadosRepuestos();
        
        // Pre-llenar observaciones
        const observacionesTextarea = document.getElementById('compraDirecta_observaciones');
        if (observacionesTextarea && solicitud.observaciones) {
            observacionesTextarea.value = `Solicitud del técnico: ${solicitud.observaciones.substring(0, 200)}`;
        }
        
        abrirModal('modalNuevaSolicitudCompraDirecta');
        
    } catch (error) {
        console.error('❌ Error preparando modal:', error);
        showToast('Error al preparar el formulario', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function confirmarCompraDirecta() {
    // Obtener elementos y depurar
    const selectOrden = document.getElementById('compraDirecta_id_orden');
    const selectEncargado = document.getElementById('compraDirecta_id_encargado');
    const observaciones = document.getElementById('compraDirecta_observaciones')?.value || '';
    
    // DEPURACIÓN: Mostrar información del select
    console.log('🔍 DEPURACIÓN SELECT ORDEN:');
    console.log('  - Elemento existe:', !!selectOrden);
    console.log('  - value:', selectOrden?.value);
    console.log('  - selectedIndex:', selectOrden?.selectedIndex);
    console.log('  - options length:', selectOrden?.options?.length);
    
    if (selectOrden && selectOrden.options) {
        for (let i = 0; i < selectOrden.options.length; i++) {
            console.log(`  - option[${i}]: value="${selectOrden.options[i].value}", text="${selectOrden.options[i].text}"`);
        }
    }
    
    // Normalizar la obtención del valor
    let id_orden = null;
    if (selectOrden) {
        // Intentar obtener el valor de diferentes maneras
        id_orden = selectOrden.value;
        if (!id_orden || id_orden === '' || id_orden === 'undefined') {
            // Si el value está vacío, intentar con el texto seleccionado o buscar por selectedIndex
            const selectedOption = selectOrden.options[selectOrden.selectedIndex];
            if (selectedOption && selectedOption.value && selectedOption.value !== '') {
                id_orden = selectedOption.value;
            }
        }
    }
    
    const id_encargado = selectEncargado?.value;
    
    console.log('📝 Valor final id_orden:', id_orden);
    console.log('📝 id_encargado:', id_encargado);
    
    // Validación más estricta
    if (!id_orden || id_orden === '' || id_orden === 'undefined' || id_orden === 'null' || id_orden === 'NaN') {
        showToast('⚠️ Por favor, seleccione una orden de trabajo válida', 'warning');
        
        // Recargar órdenes si no hay ninguna seleccionable
        if (selectOrden && selectOrden.options.length <= 1) {
            showToast('No hay órdenes activas. Recargando...', 'info');
            await cargarOrdenesActivasParaCompraDirecta();
        }
        
        if (selectOrden) {
            selectOrden.style.borderColor = 'var(--rojo-primario)';
            selectOrden.focus();
            setTimeout(() => {
                selectOrden.style.borderColor = '';
            }, 2000);
        }
        return;
    }
    
    if (!id_encargado || id_encargado === '' || id_encargado === 'undefined') {
        showToast('⚠️ Por favor, seleccione un encargado de repuestos', 'warning');
        if (selectEncargado) {
            selectEncargado.style.borderColor = 'var(--rojo-primario)';
            selectEncargado.focus();
            setTimeout(() => {
                selectEncargado.style.borderColor = '';
            }, 2000);
        }
        return;
    }
    
    const itemsValidos = itemsCompraDirecta.filter(item => item.descripcion && item.descripcion.trim() !== '');
    if (itemsValidos.length === 0) {
        showToast('⚠️ Agregue al menos un repuesto a comprar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const id_orden_numero = parseInt(id_orden);
        
        if (isNaN(id_orden_numero)) {
            showToast('Error: ID de orden inválido', 'error');
            return;
        }
        
        const requestBody = {
            id_orden_trabajo: id_orden_numero,
            id_encargado_repuestos: parseInt(id_encargado),
            items: itemsValidos,
            observaciones: observaciones
        };
        
        console.log('📤 Enviando solicitud:', requestBody);
        
        const response = await fetch(`${API_URL}/solicitudes-compra-directa`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (currentSolicitudTecnico) {
                await actualizarEstadoSolicitudTecnico(currentSolicitudTecnico.id, 'en_proceso', 
                    `Solicitud de compra enviada. Items: ${itemsValidos.length}`);
            }
            
            showToast('✅ Solicitud de compra enviada al encargado de repuestos', 'success');
            cerrarModal('modalNuevaSolicitudCompraDirecta');
            limpiarItemsCompraDirecta();
            currentSolicitudTecnico = null;
            
            await cargarSolicitudesCompra();
            await cargarSolicitudesRepuestosTecnico();
        } else {
            showToast(data.error || 'Error al crear solicitud', 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}
async function actualizarEstadoSolicitudTecnico(id_solicitud, nuevoEstado, respuesta) {
    try {
        const response = await fetch(`${API_URL}/solicitudes-repuestos-tecnico/${id_solicitud}/estado`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                estado: nuevoEstado, 
                respuesta: respuesta,
                respondido_por: currentUser?.id
            })
        });
        const data = await response.json();
        console.log(`✅ Solicitud de técnico #${id_solicitud} actualizada a ${nuevoEstado}`);
        return data;
    } catch (error) {
        console.error('Error actualizando solicitud de técnico:', error);
        return { success: false };
    }
}

// =====================================================
// RENDERIZADO PRIMER APARTADO (TAB 1)
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
// RENDERIZADO SEGUNDO APARTADO (TAB 2)
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
    
    if (filtroEstado !== 'all') {
        if (filtroEstado === 'pendiente') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.DIAGNOSTICO_APROBADO);
        } else if (filtroEstado === 'enviada') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.COTIZACION_ENVIADA);
        } else if (filtroEstado === 'aprobada') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.COTIZACION_ACEPTADA || o.estado_global === ESTADOS_ORDEN.COTIZACION_PARCIAL);
        } else if (filtroEstado === 'rechazada') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.COTIZACION_RECHAZADA);
        } else if (filtroEstado === 'reparacion') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.EN_REPARACION);
        }
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
            botonesHtml = `<button class="btn-outline" onclick="verAvanceReparacion(${orden.id_orden})"><i class="fas fa-eye"></i> Ver Detalle</button>`;
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
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-inbox"></i><p>No hay solicitudes</p></div></td></tr>`;
        return;
    }
    
    // SIN columna de acciones - solo información
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
        </tr>
    `).join('');
}

// =====================================================
// SUBIDA DE ARCHIVOS
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
    
    if (selectBtn) {
        selectBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🖱️ Click en seleccionar archivo');
            fileInput.click();
        });
    }
    
    if (dropArea) {
        dropArea.addEventListener('click', function(e) {
            if (e.target === selectBtn || selectBtn?.contains(e.target)) return;
            console.log('🖱️ Click en área de drop');
            fileInput.click();
        });
    }
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        console.log('📁 Archivo seleccionado:', file?.name);
        if (file) handleFileSelect(file);
    });
    
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
    }
}

function clearFileSelection() {
    currentFileData = null;
    currentFileName = null;
    
    const fileInfo = document.getElementById('fileInfo');
    const fileInput = document.getElementById('cotizacionFile');
    
    if (fileInfo) fileInfo.style.display = 'none';
    if (fileInput) fileInput.value = '';
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
    if (totalSpan) totalSpan.textContent = formatCurrency(total);
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

function setupModalTabs() {
    const modalTabs = document.querySelectorAll('#modalGenerarCotizacion .modal-tab-btn');
    const modalContents = document.querySelectorAll('#modalGenerarCotizacion .modal-tab-content');
    
    modalTabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            
            modalTabs.forEach(t => t.classList.remove('active'));
            modalContents.forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const activeContent = document.getElementById(`tab-${tabId}`);
            if (activeContent) {
                activeContent.classList.add('active');
            }
        });
    });
}

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
    
    // RESETEAR el campo de días (vacío)
    const plazoDiasInput = document.getElementById('reparacionPlazoDias');
    if (plazoDiasInput) {
        plazoDiasInput.value = '';  // Vacío para obligar a llenar
        plazoDiasInput.style.borderColor = '';
    }
    
    // Ocultar mensaje de error
    const errorMsg = document.getElementById('plazoDiasError');
    if (errorMsg) errorMsg.style.display = 'none';
    
    mostrarLoading(true);
    try {
        const [tecnicosActualesRes, todosTecnicosRes] = await Promise.all([
            fetch(`${API_URL}/orden/${id_orden}/tecnicos-asignados`, { headers: getAuthHeaders() }),
            fetch(`${API_URL}/tecnicos-con-carga`, { headers: getAuthHeaders() })
        ]);
        
        const tecnicosActualesData = await tecnicosActualesRes.json();
        const todosTecnicosData = await todosTecnicosRes.json();
        
        console.log('📊 Técnicos actuales:', tecnicosActualesData);
        console.log('📊 Todos los técnicos con carga:', todosTecnicosData);
        
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
                    
                    let cargaColor = '';
                    let cargaIcono = '';
                    let cargaTexto = '';
                    
                    if (ordenesActivas === 0) {
                        cargaColor = '#10B981';
                        cargaIcono = 'fa-check-circle';
                        cargaTexto = 'Disponible';
                    } else if (ordenesActivas === 1) {
                        cargaColor = '#F59E0B';
                        cargaIcono = 'fa-clock';
                        cargaTexto = `${ordenesActivas}/${maxVehiculos} vehículo(s)`;
                    } else {
                        cargaColor = '#EF4444';
                        cargaIcono = 'fa-exclamation-triangle';
                        cargaTexto = `COMPLETO (${ordenesActivas}/${maxVehiculos})`;
                    }
                    
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
    abrirModal('modalIniciarReparacion');
}   

async function confirmarIniciarReparacion() {
    if (!currentOrdenAceptada) return;
    
    // OBTENER EL VALOR DEL INPUT
    const plazoDiasInput = document.getElementById('reparacionPlazoDias');
    let plazoDias = plazoDiasInput?.value;
    
    console.log("🔍 Valor del input:", plazoDias);
    console.log("🔍 Tipo del valor:", typeof plazoDias);
    
    // VALIDAR
    if (!plazoDias || plazoDias === '' || plazoDias === null) {
        showToast('⚠️ Debes especificar cuántos días durará la reparación', 'warning');
        plazoDiasInput?.focus();
        return;
    }
    
    // CONVERTIR A NÚMERO
    const diasNumerico = Number(plazoDias);
    console.log("🔍 Convertido a número:", diasNumerico);
    
    if (isNaN(diasNumerico) || diasNumerico < 1 || diasNumerico > 60) {
        showToast('⚠️ El plazo debe ser un número entre 1 y 60 días', 'warning');
        return;
    }
    
    const instrucciones = document.getElementById('reparacionInstrucciones')?.value.trim();
    if (!instrucciones) {
        showToast('⚠️ Debes escribir instrucciones para los técnicos', 'warning');
        return;
    }
    
    const checkboxes = document.querySelectorAll('#tecnicosContainer input[type="checkbox"]:checked');
    const tecnicosIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (tecnicosIds.length === 0) {
        showToast('⚠️ Selecciona al menos un técnico', 'warning');
        return;
    }
    
    // CONFIRMAR
    const confirmMsg = `📋 INICIAR REPARACIÓN\n\n` +
        `📅 Plazo: ${diasNumerico} DÍAS\n` +
        `👨‍🔧 Técnicos: ${tecnicosIds.length}\n\n` +
        `⚠️ Este plazo se guardará en la base de datos.\n` +
        `¿Confirmar?`;
    
    if (!confirm(confirmMsg)) return;
    
    mostrarLoading(true);
    
    try {
        // =====================================================
        // USAR EL NUEVO ENDPOINT
        // =====================================================
        const payload = {
            id_orden: currentOrdenAceptada.id_orden,
            tecnicos: tecnicosIds,
            instrucciones: instrucciones,
            dias: diasNumerico  // ← CAMPO RENOMBRADO
        };
        
        console.log("📤 Enviando payload al NUEVO endpoint:", JSON.stringify(payload, null, 2));
        
        const response = await fetch(`${API_URL}/iniciar-reparacion-con-dias`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        console.log("📥 Respuesta del NUEVO endpoint:", data);
        
        if (data.success) {
            showToast(`✅ Reparación iniciada. Plazo: ${data.dias_guardados} días`, 'success');
            cerrarModal('modalIniciarReparacion');
            setTimeout(() => location.reload(), 1500);
        } else {
            showToast(data.error || 'Error al iniciar reparación', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
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
// ASYNC GUARDAR SOLICITUD COTIZACIÓN
// =====================================================

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

// =====================================================
// FUNCIONES DE TAB Y EVENTOS
// =====================================================

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
            
            if (tabId === 'tab-solicitar-compra') {
                cargarSolicitudesRepuestosTecnico();
            }
        });
    });
}

function setupEventListeners() {
    // Botones principales
    document.getElementById('enviarCotizacionBtn')?.addEventListener('click', enviarCotizacionCliente);
    document.getElementById('btnAgregarServicioCotizacion')?.addEventListener('click', agregarServicioCotizable);
    document.getElementById('btnAgregarItemSolicitud')?.addEventListener('click', agregarItemSolicitud);
    document.getElementById('saveSolicitudModal')?.addEventListener('click', guardarSolicitudCotizacion);
    
    // Botones de refresh
    document.getElementById('refreshSolicitarBtn')?.addEventListener('click', () => cargarDatosIniciales());
    document.getElementById('refreshCotizacionBtn')?.addEventListener('click', () => cargarDatosIniciales());
    document.getElementById('refreshHistorialBtn')?.addEventListener('click', cargarHistorialCotizaciones);
    document.getElementById('btnHistorialCotizaciones')?.addEventListener('click', () => {
        cargarHistorialCotizaciones().then(() => abrirModal('modalHistorialCotizaciones'));
    });
    document.getElementById('btnNuevaSolicitudCotizacion')?.addEventListener('click', () => {
        limpiarItemsSolicitud();
        cargarOrdenesAprobadas().then(() => abrirModal('modalSolicitudCotizacion'));
    });
    
    // Botones TAB 3
    document.getElementById('refreshSolicitudesTecnico')?.addEventListener('click', () => {
        cargarSolicitudesRepuestosTecnico();
    });
    document.getElementById('filtroEstadoRepuestoTecnico')?.addEventListener('change', () => cargarSolicitudesRepuestosTecnico());
    document.getElementById('searchRepuestoTecnico')?.addEventListener('input', () => cargarSolicitudesRepuestosTecnico());
    
    // Filtros TAB 1 y 2
    document.getElementById('filtroEstadoCotizacionSolicitar')?.addEventListener('change', () => renderOrdenesSolicitarCotizacion());
    document.getElementById('searchOrdenSolicitar')?.addEventListener('input', () => renderOrdenesSolicitarCotizacion());
    document.getElementById('filtroEstadoCotizacionCliente')?.addEventListener('change', () => renderOrdenesCotizacionCliente());
    document.getElementById('searchCotizacionCliente')?.addEventListener('input', () => renderOrdenesCotizacionCliente());
    document.getElementById('searchHistorial')?.addEventListener('input', () => renderHistorialCotizaciones());
    document.getElementById('filtroEstadoHistorial')?.addEventListener('change', () => renderHistorialCotizaciones());
    
    // Botones compra directa (unificado)
    document.getElementById('btnNuevaSolicitudCompraDirecta')?.addEventListener('click', abrirModalNuevaSolicitudCompraDirecta);
    document.getElementById('btnAgregarItemCompraDirecta')?.addEventListener('click', agregarItemCompraDirecta);
    document.getElementById('btnConfirmarCompraDirecta')?.addEventListener('click', confirmarCompraDirecta);
    
    // Cerrar modales al hacer clic fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    });
}

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token') || localStorage.getItem('token');
        if (!token) { 
            window.location.href = window.API_BASE_URL + '/'; 
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
            setTimeout(() => { window.location.href = window.API_BASE_URL + '/'; }, 2000); 
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
        window.location.href = window.API_BASE_URL + '/'; 
        return null; 
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
            cargarHistorialCotizaciones(),
            cargarSolicitudesRepuestosTecnico()
        ]);
    } catch (error) {
        console.error('Error cargando datos:', error);
        showToast('Error al cargar los datos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function logout() { 
    localStorage.clear(); 
    sessionStorage.clear(); 
    window.location.href = window.API_BASE_URL + '/'; 
}

async function inicializar() {
    console.log('🚀 Inicializando cotizaciones.js versión 5.0');
    const user = await cargarUsuarioActual();
    if (!user) return;
    await cargarDatosIniciales();
    setupTabs();
    setupEventListeners();
    console.log('✅ cotizaciones.js inicializado correctamente');
}

function renderSolicitudesCompra() {
    const tbody = document.getElementById('tablaSolicitudesCompra');
    if (!tbody) return;
    
    if (!solicitudesCompra || solicitudesCompra.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-inbox"></i><p>No hay solicitudes de compra</p></div></div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = solicitudesCompra.map(s => {
        // Parsear items si es string
        let itemsList = s.items;
        if (typeof itemsList === 'string') {
            try {
                itemsList = JSON.parse(itemsList);
            } catch(e) {
                itemsList = [];
            }
        }
        
        const itemsHtml = itemsList && itemsList.length > 0 
            ? itemsList.map(item => `<div style="font-size: 0.7rem;">• ${escapeHtml(item.descripcion)} x${item.cantidad}</div>`).join('')
            : `<div class="text-muted">${escapeHtml(s.descripcion_pieza || 'Item')} x${s.cantidad || 1}</div>`;
        
        let estadoClass = '';
        let estadoIcon = '';
        let estadoTexto = '';
        
        switch (s.estado) {
            case 'pendiente':
                estadoClass = 'status-pendiente';
                estadoIcon = 'fa-clock';
                estadoTexto = 'Pendiente';
                break;
            case 'comprado':
                estadoClass = 'status-aprobado';
                estadoIcon = 'fa-check-circle';
                estadoTexto = 'Comprado';
                break;
            case 'rechazado':
                estadoClass = 'status-rechazado';
                estadoIcon = 'fa-times-circle';
                estadoTexto = 'Rechazado';
                break;
            default:
                estadoClass = 'status-pendiente';
                estadoIcon = 'fa-clock';
                estadoTexto = s.estado || 'Pendiente';
        }
        
        return `
            <tr>
                <td>${s.id}</div>
                <td><strong>${escapeHtml(s.orden_codigo || 'N/A')}</strong></div>
                <td>${escapeHtml(s.vehiculo || 'N/A')}</div>
                <td style="max-width: 250px;">${itemsHtml}</div>
                <td><span class="status-badge ${estadoClass}"><i class="fas ${estadoIcon}"></i> ${estadoTexto}</span></div>
                <td>${formatDate(s.fecha_solicitud)}</div>
                <td class="action-buttons">
                    <button class="action-btn view" onclick="verDetalleSolicitudCompra(${s.id})" title="Ver detalle">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${s.estado === 'pendiente' ? 
                        `<button class="action-btn approve" onclick="aprobarCompra(${s.id})" title="Marcar como comprado">
                            <i class="fas fa-check-circle"></i>
                        </button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// Función para ver detalle de solicitud de compra
// Función para ver detalle de solicitud de compra (JEFE DE TALLER - TAB 3)
function verDetalleSolicitudCompra(id) {
    const solicitud = solicitudesCompra.find(s => s.id === id);
    if (!solicitud) return;
    
    // Guardar el ID de la solicitud para la descarga
    window.currentSolicitudCompraId = id;
    
    let itemsHtml = '';
    let itemsList = solicitud.items;
    if (typeof itemsList === 'string') {
        try {
            itemsList = JSON.parse(itemsList);
        } catch(e) {
            itemsList = [];
        }
    }
    
    if (itemsList && itemsList.length > 0) {
        itemsHtml = '<ul style="margin: 0.5rem 0 0 1rem;">' + 
            itemsList.map(item => `<li><strong>${escapeHtml(item.descripcion)}</strong> x${item.cantidad}${item.detalle ? ` (${escapeHtml(item.detalle)})` : ''}</li>`).join('') + 
            '</ul>';
    } else {
        itemsHtml = `<p>${escapeHtml(solicitud.descripcion_pieza || 'Item')} x${solicitud.cantidad || 1}</p>`;
    }
    
    // Buscar la cotización asociada a esta orden
    const cotizacion = cotizacionesMap[solicitud.id_orden_trabajo];
    const tieneDocumento = cotizacion && cotizacion.id;
    
    const container = document.getElementById('detalleCotizacionContainer');
    container.innerHTML = `
        <div class="orden-info-card">
            <p><strong><i class="fas fa-tag"></i> Solicitud ID:</strong> ${solicitud.id}</p>
            <p><strong><i class="fas fa-clipboard-list"></i> Orden:</strong> ${escapeHtml(solicitud.orden_codigo)}</p>
            <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(solicitud.vehiculo)}</p>
            <p><strong><i class="fas fa-boxes"></i> Items solicitados:</strong>${itemsHtml}</p>
            <p><strong><i class="fas fa-clock"></i> Fecha solicitud:</strong> ${formatDate(solicitud.fecha_solicitud)}</p>
            <p><strong><i class="fas fa-chart-line"></i> Estado:</strong> ${statusBadge(solicitud.estado)}</p>
            
            ${solicitud.mensaje_jefe_taller ? `<p><strong><i class="fas fa-comment"></i> Mensaje del Jefe de Taller:</strong> ${escapeHtml(solicitud.mensaje_jefe_taller)}</p>` : ''}
            
            <!-- SECCIÓN DE COMPROBANTE (lo que llenó el encargado de repuestos) -->
            ${solicitud.estado === 'comprado' || solicitud.estado === 'entregado' ? `
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--border-color);">
                    <h4 style="color: var(--verde-exito); margin-bottom: 0.75rem;">
                        <i class="fas fa-receipt"></i> Detalles de la Compra (Registrado por Encargado de Repuestos)
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
                        ${solicitud.fecha_compra ? `
                            <div>
                                <label style="font-size: 0.65rem; color: var(--gris-texto);">Fecha de Compra</label>
                                <p style="margin: 0; font-weight: 500;">${formatDate(solicitud.fecha_compra)}</p>
                            </div>
                        ` : ''}
                        ${solicitud.numero_factura ? `
                            <div>
                                <label style="font-size: 0.65rem; color: var(--gris-texto);">N° Factura/Comprobante</label>
                                <p style="margin: 0; font-weight: 500;">${escapeHtml(solicitud.numero_factura)}</p>
                            </div>
                        ` : ''}
                        ${solicitud.proveedor_nombre ? `
                            <div>
                                <label style="font-size: 0.65rem; color: var(--gris-texto);">Proveedor</label>
                                <p style="margin: 0; font-weight: 500;">${escapeHtml(solicitud.proveedor_nombre)}</p>
                            </div>
                        ` : ''}
                        ${solicitud.precio_cotizado ? `
                            <div>
                                <label style="font-size: 0.65rem; color: var(--gris-texto);">Monto Total</label>
                                <p style="margin: 0; font-weight: 700; color: var(--verde-exito);">${formatCurrency(solicitud.precio_cotizado)}</p>
                            </div>
                        ` : ''}
                    </div>
                    ${solicitud.notas_compra ? `
                        <div style="margin-top: 0.75rem;">
                            <label style="font-size: 0.65rem; color: var(--gris-texto);">Notas de compra</label>
                            <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">${escapeHtml(solicitud.notas_compra)}</p>
                        </div>
                    ` : ''}
                    ${solicitud.respuesta_encargado ? `
                        <div style="margin-top: 0.75rem;">
                            <label style="font-size: 0.65rem; color: var(--gris-texto);">Respuesta del Encargado</label>
                            <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">${escapeHtml(solicitud.respuesta_encargado)}</p>
                        </div>
                    ` : ''}
                    ${solicitud.comprobante_url ? `
                        <div style="margin-top: 1rem;">
                            <button class="btn-outline" onclick="verComprobanteCompra(${solicitud.id})" style="width: 100%;">
                                <i class="fas fa-image"></i> Ver Comprobante de Compra
                            </button>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            
            ${solicitud.fecha_entrega ? `
                <div style="margin-top: 1rem; padding-top: 0.5rem;">
                    <p><strong><i class="fas fa-truck"></i> Fecha de entrega:</strong> ${formatDate(solicitud.fecha_entrega)}</p>
                    ${solicitud.notas_entrega ? `<p><strong>Notas de entrega:</strong> ${escapeHtml(solicitud.notas_entrega)}</p>` : ''}
                </div>
            ` : ''}
        </div>
    `;
    
    // Mostrar el botón de descarga de documento si existe la cotización
    const modalFooter = document.querySelector('#modalDetalleCotizacion .modal-footer');
    if (modalFooter) {
        const btnDescargar = modalFooter.querySelector('#descargarDocumentoBtn');
        if (cotizacion && cotizacion.id) {
            if (btnDescargar) {
                btnDescargar.style.display = 'flex';
                btnDescargar.onclick = () => descargarDocumentoCotizacion(cotizacion.id);
            }
        } else {
            if (btnDescargar) btnDescargar.style.display = 'none';
        }
    }
    
    abrirModal('modalDetalleCotizacion');
}

// Función para descargar el documento de cotización (PDF/WORD)
async function descargarDocumentoCotizacion(idCotizacion) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${idCotizacion}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (!data.success || !data.detalle) {
            showToast('No se pudo obtener el documento', 'error');
            return;
        }
        
        const cotizacion = data.detalle;
        
        if (!cotizacion.archivo_base64) {
            showToast('No hay documento asociado a esta cotización', 'warning');
            return;
        }
        
        // Decodificar base64
        let base64String = cotizacion.archivo_base64;
        if (base64String.includes(',')) {
            base64String = base64String.split(',')[1];
        }
        
        const byteCharacters = atob(base64String);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        // Determinar tipo MIME
        let mimeType = 'application/pdf';
        const nombreArchivo = cotizacion.nombre_archivo || 'documento_cotizacion.pdf';
        if (nombreArchivo.toLowerCase().endsWith('.doc')) {
            mimeType = 'application/msword';
        } else if (nombreArchivo.toLowerCase().endsWith('.docx')) {
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        
        const blob = new Blob([byteArray], { type: mimeType });
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = nombreArchivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        
        showToast('✅ Documento descargado correctamente', 'success');
        
    } catch (error) {
        console.error('Error descargando documento:', error);
        showToast('Error al descargar el documento', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// Función para ver el comprobante desde el jefe de taller
function verComprobanteCompra(idSolicitud) {
    const solicitud = solicitudesCompra.find(s => s.id === idSolicitud);
    if (!solicitud || !solicitud.comprobante_url) {
        showToast('No hay comprobante disponible para esta solicitud', 'warning');
        return;
    }
    
    const isImage = solicitud.comprobante_url.match(/\.(jpeg|jpg|gif|png|webp)$/i);
    
    const container = document.getElementById('detalleCotizacionContainer');
    container.innerHTML = `
        <div class="comprobante-modal-container">
            <div class="comprobante-header">
                <h3><i class="fas fa-receipt"></i> Comprobante de Compra</h3>
                <p>Solicitud #${solicitud.id} - Orden: ${escapeHtml(solicitud.orden_codigo)}</p>
            </div>
            
            <div class="comprobante-visualizacion">
                ${isImage ? 
                    `<img src="${solicitud.comprobante_url}" alt="Comprobante" class="comprobante-imagen" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22200%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3EImagen%20no%20disponible%3C%2Ftext%3E%3C%2Fsvg%3E'">` :
                    `<iframe src="${solicitud.comprobante_url}" class="comprobante-pdf"></iframe>`
                }
            </div>
            
            <div class="comprobante-info">
                <div class="info-grid">
                    <div class="info-item">
                        <label>Factura/Comprobante N°:</label>
                        <span>${escapeHtml(solicitud.numero_factura || 'N/A')}</span>
                    </div>
                    <div class="info-item">
                        <label>Proveedor:</label>
                        <span>${escapeHtml(solicitud.proveedor_nombre || 'N/A')}</span>
                    </div>
                    <div class="info-item">
                        <label>Monto Total:</label>
                        <span class="monto">${formatCurrency(solicitud.precio_cotizado || 0)}</span>
                    </div>
                    <div class="info-item">
                        <label>Fecha de Compra:</label>
                        <span>${formatDate(solicitud.fecha_compra)}</span>
                    </div>
                    <div class="info-item">
                        <label>Estado:</label>
                        <span>${statusBadge(solicitud.estado)}</span>
                    </div>
                </div>
                
                ${solicitud.notas_compra ? `
                    <div class="info-item full-width">
                        <label>Notas de compra:</label>
                        <p>${escapeHtml(solicitud.notas_compra)}</p>
                    </div>
                ` : ''}
                
                ${solicitud.respuesta_encargado ? `
                    <div class="info-item full-width">
                        <label>Respuesta del Encargado:</label>
                        <p>${escapeHtml(solicitud.respuesta_encargado)}</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="comprobante-actions">
                <button class="btn-secondary" onclick="cerrarModal('modalDetalleCotizacion')">
                    <i class="fas fa-times"></i> Cerrar
                </button>
                <button class="btn-primary" onclick="descargarComprobante(${solicitud.id})">
                    <i class="fas fa-download"></i> Descargar Comprobante
                </button>
                <button class="btn-outline" onclick="window.open('${solicitud.comprobante_url}', '_blank')">
                    <i class="fas fa-external-link-alt"></i> Abrir en nueva ventana
                </button>
            </div>
        </div>
    `;
    abrirModal('modalDetalleCotizacion');
}

// Función para aprobar compra (marcar como comprado)
async function aprobarCompra(id) {
    if (!confirm('¿Confirmar que la compra se realizó?')) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${id}/aprobar`, { 
            method: 'PUT', 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Compra registrada como completada', 'success');
            await cargarSolicitudesCompra();
        } else {
            showToast(data.error || 'Error al registrar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}
// =====================================================
// VER Y DESCARGAR COMPROBANTE DE COMPRA (JEFE DE TALLER)
// =====================================================

function verComprobanteCompra(idSolicitud) {
    const solicitud = solicitudesCompra.find(s => s.id === idSolicitud);
    if (!solicitud || !solicitud.comprobante_url) {
        showToast('No hay comprobante disponible para esta solicitud', 'warning');
        return;
    }
    
    const isImage = solicitud.comprobante_url.match(/\.(jpeg|jpg|gif|png|webp)$/i);
    const fileExtension = isImage ? 'jpg' : 'pdf';
    
    const container = document.getElementById('detalleCotizacionContainer');
    container.innerHTML = `
        <div class="comprobante-modal-container">
            <div class="comprobante-header">
                <h3><i class="fas fa-receipt"></i> Comprobante de Compra</h3>
                <p>Solicitud #${solicitud.id} - Orden: ${escapeHtml(solicitud.orden_codigo)}</p>
            </div>
            
            <div class="comprobante-visualizacion">
                ${isImage ? 
                    `<img src="${solicitud.comprobante_url}" alt="Comprobante" class="comprobante-imagen" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22200%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3EImagen%20no%20disponible%3C%2Ftext%3E%3C%2Fsvg%3E'">` :
                    `<iframe src="${solicitud.comprobante_url}" class="comprobante-pdf"></iframe>`
                }
            </div>
            
            <div class="comprobante-info">
                <div class="info-grid">
                    <div class="info-item">
                        <label>Factura/Comprobante N°:</label>
                        <span>${escapeHtml(solicitud.numero_factura || 'N/A')}</span>
                    </div>
                    <div class="info-item">
                        <label>Proveedor:</label>
                        <span>${escapeHtml(solicitud.proveedor_nombre || 'N/A')}</span>
                    </div>
                    <div class="info-item">
                        <label>Monto Total:</label>
                        <span class="monto">${formatCurrency(solicitud.precio_cotizado || 0)}</span>
                    </div>
                    <div class="info-item">
                        <label>Fecha de Compra:</label>
                        <span>${formatDate(solicitud.fecha_compra)}</span>
                    </div>
                    <div class="info-item">
                        <label>Estado:</label>
                        <span>${statusBadge(solicitud.estado)}</span>
                    </div>
                </div>
                
                ${solicitud.notas_compra ? `
                    <div class="info-item full-width">
                        <label>Notas de compra:</label>
                        <p>${escapeHtml(solicitud.notas_compra)}</p>
                    </div>
                ` : ''}
                
                ${solicitud.respuesta_encargado ? `
                    <div class="info-item full-width">
                        <label>Respuesta del Encargado:</label>
                        <p>${escapeHtml(solicitud.respuesta_encargado)}</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="comprobante-actions">
                <button class="btn-secondary" onclick="cerrarModal('modalDetalleCotizacion')">
                    <i class="fas fa-times"></i> Cerrar
                </button>
                <button class="btn-primary" onclick="descargarComprobante(${solicitud.id}, '${fileExtension}')">
                    <i class="fas fa-download"></i> Descargar Comprobante
                </button>
                ${isImage ? `
                    <button class="btn-outline" onclick="window.open('${solicitud.comprobante_url}', '_blank')">
                        <i class="fas fa-external-link-alt"></i> Abrir en nueva ventana
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    abrirModal('modalDetalleCotizacion');
}

// Función para descargar el comprobante (CORREGIDA)
async function descargarComprobante(idSolicitud) {
    const solicitud = solicitudesCompra.find(s => s.id === idSolicitud);
    if (!solicitud || !solicitud.comprobante_url) {
        showToast('No hay comprobante para descargar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const url = solicitud.comprobante_url;
        const filename = `comprobante_${solicitud.orden_codigo}_${solicitud.id}.${url.split('.').pop().split('?')[0]}`;
        
        // Método 1: Intentar fetch + blob (más compatible)
        const response = await fetch(url);
        
        if (response.ok) {
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            showToast('✅ Descarga iniciada', 'success');
        } else {
            // Método 2: Abrir en nueva ventana como fallback
            window.open(url, '_blank');
            showToast('El archivo se abrirá en una nueva ventana. Usa "Guardar como" desde allí.', 'info');
        }
    } catch (error) {
        console.error('Error descargando:', error);
        // Método 3: Fallback final - abrir directamente
        window.open(solicitud.comprobante_url, '_blank');
        showToast('El archivo se abrirá en una nueva ventana. Usa "Guardar como" para descargarlo.', 'info');
    } finally {
        mostrarLoading(false);
    }
}

async function verificarDiasGuardados(id_orden) {
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/tecnicos-asignados`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        console.log("🔍 Verificación de orden:", data);
        
        // También consultar directamente la orden
        const ordenResponse = await fetch(`${API_URL}/ordenes-con-servicios`, {
            headers: getAuthHeaders()
        });
        const ordenData = await ordenResponse.json();
        
        const orden = ordenData.ordenes?.find(o => o.id_orden === id_orden);
        if (orden) {
            console.log("📊 Estado de la orden:", orden.estado_global);
        }
        
        return data;
    } catch (error) {
        console.error("Error verificando:", error);
    }
}

// =====================================================
// VER AVANCES DE REPARACIÓN (FUNCIONAL)
// =====================================================

async function verAvanceReparacion(id_orden) {
    console.log(`🔍 Ver avances de reparación para orden ${id_orden}`);
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/avances-reparacion`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        console.log('📦 Avances recibidos:', data);
        
        if (!data.success) {
            showToast(data.error || 'Error al cargar avances', 'error');
            return;
        }
        
        const avances = data.avances || [];
        const ordenCodigo = data.orden_codigo || 'N/A';
        
        const container = document.getElementById('detalleCotizacionContainer');
        
        if (avances.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-line fa-3x" style="color: var(--gris-texto); margin-bottom: 1rem;"></i>
                    <h3>No hay avances registrados</h3>
                    <p>La orden ${escapeHtml(ordenCodigo)} aún no tiene avances de reparación.</p>
                    <p class="text-muted">Los técnicos pueden subir avances desde su aplicación móvil.</p>
                </div>
            `;
        } else {
            // Separar avances aprobados y pendientes
            const aprobados = avances.filter(a => a.estado === 'aprobado');
            const pendientes = avances.filter(a => a.estado === 'pendiente');
            const rechazados = avances.filter(a => a.estado === 'rechazado');
            
            let avancesHtml = '';
            
            // Sección de avances pendientes
            if (pendientes.length > 0) {
                avancesHtml += `
                    <div class="avances-seccion pendientes">
                        <h3 style="color: var(--naranja-advertencia); margin-bottom: 1rem;">
                            <i class="fas fa-clock"></i> Pendientes de Revisión (${pendientes.length})
                        </h3>
                        ${pendientes.map(avance => renderAvanceCard(avance)).join('')}
                    </div>
                `;
            }
            
            // Sección de avances aprobados
            if (aprobados.length > 0) {
                avancesHtml += `
                    <div class="avances-seccion aprobados" style="margin-top: 2rem;">
                        <h3 style="color: var(--verde-exito); margin-bottom: 1rem;">
                            <i class="fas fa-check-circle"></i> Avances Aprobados (${aprobados.length})
                        </h3>
                        ${aprobados.map(avance => renderAvanceCard(avance)).join('')}
                    </div>
                `;
            }
            
            // Sección de avances rechazados
            if (rechazados.length > 0) {
                avancesHtml += `
                    <div class="avances-seccion rechazados" style="margin-top: 2rem;">
                        <h3 style="color: var(--rojo-primario); margin-bottom: 1rem;">
                            <i class="fas fa-times-circle"></i> Avances Rechazados (${rechazados.length})
                        </h3>
                        ${rechazados.map(avance => renderAvanceCard(avance)).join('')}
                    </div>
                `;
            }
            
            container.innerHTML = `
                <div class="avances-reparacion-container">
                    <div class="orden-header-avances" style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid var(--border-color);">
                        <h2><i class="fas fa-clipboard-list"></i> Avances de Reparación</h2>
                        <p><strong>Orden:</strong> ${escapeHtml(ordenCodigo)}</p>
                        <p><strong>Estado actual:</strong> ${statusBadge(data.estado_orden)}</p>
                    </div>
                    ${avancesHtml}
                </div>
            `;
        }
        
        // Agregar estilos CSS para los avances
        agregarEstilosAvances();
        
        abrirModal('modalDetalleCotizacion');
        
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error al cargar los avances de reparación', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// Función auxiliar para renderizar una tarjeta de avance
function renderAvanceCard(avance) {
    // Generar preview de fotos
    let fotosPreview = '';
    if (avance.fotos && avance.fotos.length > 0) {
        fotosPreview = `
            <div class="avance-fotos-preview">
                ${avance.fotos.slice(0, 4).map(foto => `
                    <div class="avance-foto-item" onclick="verFotoAmpliada('${foto.url}')">
                        <img src="${foto.url}" alt="Foto del avance">
                        ${foto.comentario ? `<span class="foto-comentario-badge" title="${escapeHtml(foto.comentario)}"><i class="fas fa-comment"></i></span>` : ''}
                    </div>
                `).join('')}
                ${avance.fotos.length > 4 ? `<div class="avance-foto-mas">+${avance.fotos.length - 4}</div>` : ''}
            </div>
        `;
    }
    
    let estadoClass = '';
    let estadoIcon = '';
    let estadoTexto = '';
    
    switch (avance.estado) {
        case 'aprobado':
            estadoClass = 'status-aprobado';
            estadoIcon = 'fa-check-circle';
            estadoTexto = 'Aprobado';
            break;
        case 'pendiente':
            estadoClass = 'status-pendiente';
            estadoIcon = 'fa-clock';
            estadoTexto = 'Pendiente';
            break;
        case 'rechazado':
            estadoClass = 'status-rechazado';
            estadoIcon = 'fa-times-circle';
            estadoTexto = 'Rechazado';
            break;
        default:
            estadoClass = 'status-pendiente';
            estadoIcon = 'fa-clock';
            estadoTexto = avance.estado || 'Desconocido';
    }
    
    return `
        <div class="avance-card-detalle" style="background: var(--bg-card); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1rem; border-left: 4px solid ${avance.estado === 'aprobado' ? '#10B981' : (avance.estado === 'pendiente' ? '#F59E0B' : '#EF4444')};">
            <div class="avance-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; margin-bottom: 0.75rem;">
                <div>
                    <h4 style="margin: 0;">${escapeHtml(avance.titulo)}</h4>
                    <div style="margin-top: 0.25rem;">
                        <span class="tecnico-nombre"><i class="fas fa-user"></i> ${escapeHtml(avance.tecnico_nombre)}</span>
                        ${avance.tecnico_contacto ? `<span style="margin-left: 0.75rem;"><i class="fas fa-phone"></i> ${escapeHtml(avance.tecnico_contacto)}</span>` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <span class="status-badge ${estadoClass}"><i class="fas ${estadoIcon}"></i> ${estadoTexto}</span>
                    <div style="font-size: 0.7rem; color: var(--gris-texto); margin-top: 0.25rem;">
                        <i class="far fa-calendar-alt"></i> ${formatDate(avance.fecha_creacion)}
                    </div>
                </div>
            </div>
            
            ${avance.descripcion ? `
                <div class="avance-descripcion" style="margin: 0.75rem 0; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-md);">
                    <i class="fas fa-align-left"></i> ${escapeHtml(avance.descripcion)}
                </div>
            ` : ''}
            
            ${fotosPreview}
            
            ${avance.comentario_revision ? `
                <div class="avance-comentario" style="margin-top: 0.75rem; padding: 0.5rem; background: rgba(193, 18, 31, 0.1); border-radius: var(--radius-md);">
                    <i class="fas fa-comment-dots"></i> <strong>Comentario de revisión:</strong>
                    <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">${escapeHtml(avance.comentario_revision)}</p>
                </div>
            ` : ''}
            
            ${avance.fecha_aprobacion ? `
                <div style="margin-top: 0.5rem; font-size: 0.7rem; color: var(--gris-texto);">
                    <i class="fas fa-check-circle"></i> Aprobado el: ${formatDate(avance.fecha_aprobacion)}
                </div>
            ` : ''}
        </div>
    `;
}

// Función para agregar estilos CSS dinámicamente
function agregarEstilosAvances() {
    if (document.getElementById('avances-estilos')) return;
    
    const style = document.createElement('style');
    style.id = 'avances-estilos';
    style.textContent = `
        .avances-reparacion-container {
            max-height: 70vh;
            overflow-y: auto;
            padding-right: 0.5rem;
        }
        
        .avance-fotos-preview {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-top: 0.75rem;
        }
        
        .avance-foto-item {
            position: relative;
            width: 80px;
            height: 80px;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            border: 2px solid var(--border-color);
            transition: transform 0.2s;
        }
        
        .avance-foto-item:hover {
            transform: scale(1.05);
        }
        
        .avance-foto-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .foto-comentario-badge {
            position: absolute;
            bottom: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.6);
            color: white;
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 0.6rem;
        }
        
        .avance-foto-mas {
            width: 80px;
            height: 80px;
            background: var(--gris-oscuro);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            font-weight: bold;
            color: var(--gris-texto);
        }
        
        .avances-seccion {
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .orden-header-avances {
            background: linear-gradient(135deg, var(--bg-card) 0%, var(--gris-oscuro) 100%);
            padding: 1rem;
            border-radius: var(--radius-lg);
            position: sticky;
            top: 0;
            z-index: 10;
        }
    `;
    document.head.appendChild(style);
}

// Función para ver foto ampliada (si no existe ya)
function verFotoAmpliada(url) {
    const modal = document.getElementById('modalFoto');
    const img = document.getElementById('fotoAmpliada');
    
    if (!modal) {
        // Crear modal de foto si no existe
        const modalHtml = `
            <div class="modal" id="modalFoto" onclick="cerrarModalFoto()">
                <div class="modal-content" style="max-width: 90%; background: transparent;" onclick="event.stopPropagation()">
                    <div style="text-align: right; margin-bottom: 0.5rem;">
                        <button class="modal-close" onclick="cerrarModalFoto()" style="background: var(--bg-card);">&times;</button>
                    </div>
                    <img id="fotoAmpliada" src="" style="width: 100%; border-radius: var(--radius-lg);">
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    const fotoImg = document.getElementById('fotoAmpliada');
    const fotoModal = document.getElementById('modalFoto');
    
    if (fotoImg) fotoImg.src = url;
    if (fotoModal) fotoModal.classList.add('show');
}

function cerrarModalFoto() {
    const modal = document.getElementById('modalFoto');
    if (modal) modal.classList.remove('show');
}

// Exponer función para pruebas en consola
window.verificarDiasGuardados = verificarDiasGuardados;
// Exponer funciones globales
window.descargarDocumentoCotizacion = descargarDocumentoCotizacion;
window.verDetalleSolicitudCompra = verDetalleSolicitudCompra;
window.verComprobanteCompra = verComprobanteCompra;
window.descargarComprobante = descargarComprobante;
window.eliminarSolicitudCotizacion = eliminarSolicitudCotizacion;
window.abrirModalGenerarCotizacion = abrirModalGenerarCotizacion;
window.editarCotizacionExistente = editarCotizacionExistente;
window.verDetalleCotizacion = verDetalleCotizacion;
window.verDetalleCotizacionByOrden = verDetalleCotizacionByOrden;
window.cerrarModal = cerrarModal;
window.logout = logout;
window.agregarItemSolicitud = agregarItemSolicitud;
window.actualizarItemSolicitud = actualizarItemSolicitud;
window.eliminarItemSolicitud = eliminarItemSolicitud;
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
window.abrirModalNuevaSolicitudCompraDirecta = abrirModalNuevaSolicitudCompraDirecta;
window.abrirModalCompraDesdeSolicitudTecnico = abrirModalCompraDesdeSolicitudTecnico;
window.agregarItemCompraDirecta = agregarItemCompraDirecta;
window.actualizarItemCompraDirecta = actualizarItemCompraDirecta;
window.eliminarItemCompraDirecta = eliminarItemCompraDirecta;

// Inicializar
document.addEventListener('DOMContentLoaded', inicializar);