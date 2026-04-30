// =====================================================
// COTIZACIONES.JS - JEFE DE TALLER
// VERSIÓN 3.0 - CON NUEVOS ESTADOS Y MANEJO DE RECHAZO
// =====================================================

const API_URL = window.location.origin + '/api/jefe-taller';
let currentUser = null;
let currentUserRoles = [];

// Datos globales
let ordenesConServicios = [];
let ordenesAprobadas = [];
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
let serviciosActuales = [];
let serviciosCotizables = [];
let isEditingCotizacion = false;
let currentInstruccionesOrden = null;
let currentOrdenRechazada = null;
let currentOrdenAceptada = null;
let currentOrdenArmado = null;

// Estados de orden (constantes)
const ESTADOS_ORDEN = {
    EN_RECEPCION: 'EnRecepcion',
    EN_DIAGNOSTICO: 'EnDiagnostico',
    DIAGNOSTICO_COMPLETADO: 'DiagnosticoCompletado',
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
        'rechazada_total': 'status-rechazado'
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
        'rechazada_total': 'Rechazada Total'
    };
    
    let icon = 'fa-clock';
    if (estado === 'aprobado' || estado === 'aprobada' || estado === 'comprado') icon = 'fa-check-circle';
    if (estado === 'rechazado' || estado === 'rechazada_total') icon = 'fa-times-circle';
    if (estado === 'enviada') icon = 'fa-paper-plane';
    
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
        const response = await fetch(`${API_URL}/ordenes-aprobadas`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            ordenesAprobadas = data.ordenes || [];
            cargarSelectOrdenesSolicitud();
        }
    } catch (error) {
        console.error('Error cargando órdenes aprobadas:', error);
        ordenesAprobadas = [];
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
    const selectServicio = document.getElementById('solicitud_id_servicio');
    
    if (selectOrden && ordenesAprobadas.length > 0) {
        const currentValue = selectOrden.value;
        selectOrden.innerHTML = '<option value="">Seleccionar orden</option>' + 
            ordenesAprobadas.map(o => `<option value="${o.id_orden}">${escapeHtml(o.codigo_unico)} - ${escapeHtml(o.vehiculo)}</option>`).join('');
        if (currentValue) selectOrden.value = currentValue;
    }
    
    if (selectServicio && ordenesConServicios.length > 0) {
        selectServicio.innerHTML = '<option value="">Seleccionar servicio</option>';
        ordenesConServicios.forEach(orden => {
            if (orden.servicios) {
                orden.servicios.forEach(serv => {
                    selectServicio.innerHTML += `<option value="${serv.id_servicio}">${escapeHtml(orden.codigo_unico)} - ${escapeHtml(serv.descripcion)}</option>`;
                });
            }
        });
    }
}

async function cargarDatosIniciales() {
    mostrarLoading(true);
    try {
        await Promise.all([
            cargarOrdenesConServicios(),
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
// RENDERIZADO DE ÓRDENES (ACTUALIZADO)
// =====================================================

function renderOrdenes() {
    const container = document.getElementById('ordenesContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('searchOrden')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstadoCotizacion')?.value || 'all';
    
    let filtered = [...ordenesConServicios];
    
    if (searchTerm) {
        filtered = filtered.filter(o => 
            (o.codigo_unico || '').toLowerCase().includes(searchTerm) ||
            (o.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
            (o.vehiculo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    // Clasificar órdenes según estado REAL de la cotización
    const ordenesPendientes = [];
    const ordenesEnviadas = [];
    const ordenesAceptadas = [];
    const ordenesRechazadas = [];
    const ordenesEnReparacion = [];
    const ordenesArmando = [];
    
    for (const orden of filtered) {
        const estadoOrden = orden.estado_global;
        const cotizacionInfo = cotizacionesMap[orden.id_orden];
        
        console.log(`Orden ${orden.codigo_unico}: estado_global=${estadoOrden}`);
        
        if (estadoOrden === ESTADOS_ORDEN.COTIZACION_RECHAZADA) {
            ordenesRechazadas.push({ ...orden, cotizacion: cotizacionInfo });
        }
        else if (estadoOrden === ESTADOS_ORDEN.EN_ARMADO) {
            ordenesArmando.push({ ...orden, cotizacion: cotizacionInfo });
        }
        else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_ACEPTADA || estadoOrden === ESTADOS_ORDEN.COTIZACION_PARCIAL) {
            ordenesAceptadas.push({ ...orden, cotizacion: cotizacionInfo });
        }
        else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_ENVIADA) {
            ordenesEnviadas.push({ ...orden, cotizacion: cotizacionInfo });
        }
        else if (estadoOrden === ESTADOS_ORDEN.EN_REPARACION) {
            ordenesEnReparacion.push({ ...orden, cotizacion: cotizacionInfo });
        }
        else {
            ordenesPendientes.push(orden);
        }
    }
    
    console.log(`Clasificación: Pendientes=${ordenesPendientes.length}, Enviadas=${ordenesEnviadas.length}, Aceptadas=${ordenesAceptadas.length}, Rechazadas=${ordenesRechazadas.length}, Armando=${ordenesArmando.length}, Reparacion=${ordenesEnReparacion.length}`);
    
    // Aplicar filtro
    let ordenesMostrar = [];
    if (filtroEstado === 'pendiente') {
        ordenesMostrar = ordenesPendientes;
    } else if (filtroEstado === 'enviada') {
        ordenesMostrar = ordenesEnviadas;
    } else if (filtroEstado === 'aprobada') {
        ordenesMostrar = [...ordenesAceptadas, ...ordenesEnReparacion];
    } else if (filtroEstado === 'rechazada') {
        ordenesMostrar = [...ordenesRechazadas, ...ordenesArmando];
    } else if (filtroEstado === 'reparacion') {
        ordenesMostrar = ordenesEnReparacion;
    } else {
        ordenesMostrar = [...ordenesPendientes, ...ordenesEnviadas, ...ordenesRechazadas, ...ordenesArmando, ...ordenesAceptadas, ...ordenesEnReparacion];
    }
    
    if (ordenesMostrar.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No hay órdenes con servicios disponibles</p></div>`;
        return;
    }
    
    container.innerHTML = ordenesMostrar.map(ordenData => {
        const orden = ordenData;
        const cotizacion = ordenData.cotizacion;
        const estadoOrden = orden.estado_global;
        
        let estadoBadgeHtml = '';
        let botonesHtml = '';
        
        // CASO 1: COTIZACIÓN RECHAZADA
        if (estadoOrden === ESTADOS_ORDEN.COTIZACION_RECHAZADA) {
            estadoBadgeHtml = `
                <div class="alert-danger" style="padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 8px; background: rgba(220, 53, 69, 0.15); border-left: 3px solid #dc3545;">
                    <i class="fas fa-times-circle" style="color: #dc3545;"></i>
                    <strong>❌ COTIZACIÓN RECHAZADA POR EL CLIENTE</strong>
                    <br><small>El cliente no aceptó la cotización. Debes notificar al técnico para que ARME el vehículo.</small>
                    ${cotizacion?.motivo_rechazo ? `<br><small><strong>Motivo:</strong> ${escapeHtml(cotizacion.motivo_rechazo)}</small>` : ''}
                </div>
            `;
            botonesHtml = `
                <button class="btn-warning" onclick='abrirModalNotificarArmado(${orden.id_orden}, "${escapeHtml(orden.codigo_unico)}", "${escapeHtml(orden.vehiculo)}", "${escapeHtml(orden.cliente_nombre)}")'>
                    <i class="fas fa-tools"></i> 🔧 Notificar al Técnico (Armar Vehículo)
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Cotización Rechazada
                </button>
                <button class="btn-primary" onclick="abrirModalGenerarCotizacion(${orden.id_orden})">
                    <i class="fas fa-file-invoice"></i> Generar Nueva Cotización
                </button>
            `;
        }
        // CASO 2: EN PROCESO DE ARMADO
        else if (estadoOrden === ESTADOS_ORDEN.EN_ARMADO) {
            estadoBadgeHtml = `
                <div class="alert-warning" style="padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 8px; background: rgba(255, 193, 7, 0.15); border-left: 3px solid #ffc107;">
                    <i class="fas fa-tools" style="color: #ffc107;"></i>
                    <strong>🔧 VEHÍCULO EN PROCESO DE ARMADO</strong>
                    <br><small>El técnico está armando el vehículo. Se cobrará solo diagnóstico (Bs. 200).</small>
                </div>
            `;
            botonesHtml = `
                <button class="btn-success" onclick='cobrarDiagnosticoArmado(${orden.id_orden}, "${escapeHtml(orden.codigo_unico)}")'>
                    <i class="fas fa-dollar-sign"></i> Cobrar Diagnóstico (Bs. 200)
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        }
        // CASO 3: COTIZACIÓN ACEPTADA
        else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_ACEPTADA || estadoOrden === ESTADOS_ORDEN.COTIZACION_PARCIAL) {
            const tieneTecnicos = orden.tecnicos_asignados;
            estadoBadgeHtml = `
                <div class="alert-success" style="padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 8px; background: rgba(40, 167, 69, 0.15); border-left: 3px solid #28a745;">
                    <i class="fas fa-check-circle" style="color: #28a745;"></i>
                    <strong>✅ COTIZACIÓN ACEPTADA POR EL CLIENTE</strong>
                    <br><small>El cliente aceptó la cotización. Inicia la reparación.</small>
                </div>
            `;
            if (tieneTecnicos) {
                botonesHtml = `
                    <button class="btn-primary" onclick="verAvanceReparacion(${orden.id_orden})">
                        <i class="fas fa-chart-line"></i> Ver Avance
                    </button>
                    <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                        <i class="fas fa-eye"></i> Ver Cotización
                    </button>
                `;
            } else {
                botonesHtml = `
                    <button class="btn-primary" onclick='abrirModalIniciarReparacion(${orden.id_orden}, "${escapeHtml(orden.codigo_unico)}", "${escapeHtml(orden.vehiculo)}", "${escapeHtml(orden.cliente_nombre)}")'>
                        <i class="fas fa-play-circle"></i> Iniciar Reparación
                    </button>
                    <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                        <i class="fas fa-eye"></i> Ver Cotización
                    </button>
                `;
            }
        }
        // CASO 4: EN REPARACIÓN
        else if (estadoOrden === ESTADOS_ORDEN.EN_REPARACION) {
            estadoBadgeHtml = `
                <div class="alert-info" style="padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 8px; background: rgba(23, 162, 184, 0.15); border-left: 3px solid #17a2b8;">
                    <i class="fas fa-wrench" style="color: #17a2b8;"></i>
                    <strong>🔧 REPARACIÓN EN CURSO</strong>
                    <br><small>Trabajo en progreso por el equipo técnico.</small>
                </div>
            `;
            botonesHtml = `
                <button class="btn-primary" onclick="verAvanceReparacion(${orden.id_orden})">
                    <i class="fas fa-chart-line"></i> Ver Avance
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        }
        // CASO 5: COTIZACIÓN ENVIADA
        else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_ENVIADA) {
            estadoBadgeHtml = `
                <div class="alert-warning" style="padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 8px; background: rgba(255, 193, 7, 0.15); border-left: 3px solid #ffc107;">
                    <i class="fas fa-paper-plane" style="color: #ffc107;"></i>
                    <strong>📨 COTIZACIÓN ENVIADA AL CLIENTE</strong>
                    <br><small>Esperando respuesta del cliente.</small>
                </div>
            `;
            botonesHtml = `
                <button class="btn-outline" onclick="editarCotizacionExistente(${orden.id_orden})">
                    <i class="fas fa-edit"></i> Editar Cotización
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        }
        // CASO 6: SIN COTIZACIÓN
        else {
            estadoBadgeHtml = `
                <div class="alert-secondary" style="padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 8px; background: var(--gris-oscuro);">
                    <i class="fas fa-clock"></i>
                    <strong>⏳ PENDIENTE DE COTIZACIÓN</strong>
                    <br><small>Diagnóstico listo, esperando generar cotización para el cliente.</small>
                </div>
            `;
            botonesHtml = `
                <button class="btn-primary" onclick="abrirModalGenerarCotizacion(${orden.id_orden})">
                    <i class="fas fa-file-invoice"></i> Generar Cotización
                </button>
            `;
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
                    </div>
                `).join('')}
            </div>
            ${estadoBadgeHtml}
            <div class="orden-footer">
                ${botonesHtml}
            </div>
        </div>
    `}).join('');
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
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(cot.orden_codigo)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(cot.vehiculo)}</span>
                </div>
                <div>
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(cot.cliente_nombre)}</span>
                    <span class="orden-total"><i class="fas fa-dollar-sign"></i> Total: ${formatCurrency(cot.total)}</span>
                </div>
            </div>
            <div class="orden-body" style="padding: 0.75rem 1.25rem;">
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                    <div><strong>Fecha envío:</strong> ${formatDate(cot.fecha_envio)}</div>
                    <div>${statusBadge(cot.estado)}</div>
                    ${cot.fecha_rechazo ? `<div><strong>Rechazado:</strong> ${formatDate(cot.fecha_rechazo)}</div>` : ''}
                </div>
                ${cot.motivo_rechazo ? `
                    <div class="motivo-rechazo" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(193,18,31,0.1); border-radius: 6px;">
                        <i class="fas fa-comment-dots"></i> <strong>Motivo de rechazo:</strong>
                        <p style="margin: 0.25rem 0 0 1.5rem; font-size: 0.8rem;">${escapeHtml(cot.motivo_rechazo)}</p>
                    </div>
                ` : ''}
            </div>
            <div class="orden-footer">
                <button class="btn-outline" onclick="verDetalleCotizacion(${cot.id})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
                ${cot.estado === 'rechazada' ? `
                    <button class="btn-primary" onclick="reutilizarCotizacionRechazada(${cot.id_orden_trabajo}, ${cot.id})">
                        <i class="fas fa-copy"></i> Generar Nueva Cotización
                    </button>
                ` : ''}
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
            <td>${escapeHtml(s.vehiculo)}</td>
            <td>${escapeHtml(s.servicio_descripcion || '-')}</td>
            <td>${s.items?.length || 1} item(s)</td>
            <td>${statusBadge(s.estado)}</td>
            <td>${s.precio_cotizado ? `Bs. ${s.precio_cotizado.toFixed(2)}` : '-'}</td>
            <td>${formatDate(s.fecha_solicitud)}</td>
            <td class="action-buttons">
                ${s.estado === 'pendiente' ? `<button class="action-btn delete" onclick="eliminarSolicitudCotizacion(${s.id})"><i class="fas fa-trash-alt"></i></button>` : ''}
                ${s.estado === 'cotizado' ? `<button class="action-btn send" onclick="solicitarCompraDesdeCotizacion(${s.id})"><i class="fas fa-shopping-cart"></i></button>` : ''}
            </td>
        </tr>
    `).join('');
}

function renderSolicitudesCompra() {
    const tbody = document.getElementById('tablaSolicitudesCompra');
    if (!tbody) return;
    
    if (solicitudesCompra.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No hay solicitudes</p></div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = solicitudesCompra.map(s => `
        <tr>
            <td>${s.id}</td>
            <td><strong>${escapeHtml(s.orden_codigo)}</strong></td>
            <td>${escapeHtml(s.vehiculo)}</td>
            <td>${escapeHtml(s.servicio_descripcion || '-')}</td>
            <td>${s.items?.length || 1} item(s)</td>
            <td>${statusBadge(s.estado)}</td>
            <td>${formatDate(s.fecha_solicitud)}</td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verSolicitudCompra(${s.id})"><i class="fas fa-eye"></i></button>
                ${s.estado === 'pendiente' ? `<button class="action-btn approve" onclick="aprobarCompra(${s.id})"><i class="fas fa-check-circle"></i></button>` : ''}
            </td>
        </tr>
    `).join('');
}

// =====================================================
// MODAL: NOTIFICAR ARMADO (COTIZACIÓN RECHAZADA)
// =====================================================

async function abrirModalNotificarArmado(id_orden, codigo, vehiculo, cliente) {
    currentOrdenArmado = { id_orden, codigo, vehiculo, cliente };
    
    const ordenInfo = document.getElementById('armadoOrdenInfo');
    if (ordenInfo) {
        ordenInfo.innerHTML = `
            <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(codigo)}</p>
            <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(vehiculo)}</p>
            <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(cliente)}</p>
        `;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/tecnicos-disponibles`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        const selectTecnicos = document.getElementById('armadoTecnicosList');
        if (selectTecnicos && data.tecnicos) {
            selectTecnicos.innerHTML = data.tecnicos.map(t => 
                `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`
            ).join('');
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
        showToast('Debes escribir instrucciones para el armado', 'warning');
        return;
    }
    
    const selectTecnicos = document.getElementById('armadoTecnicosList');
    const tecnicosIds = Array.from(selectTecnicos?.selectedOptions || []).map(opt => parseInt(opt.value));
    
    if (tecnicosIds.length === 0) {
        showToast('Debes seleccionar al menos un técnico', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/rechazo/iniciar-armado`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenArmado.id_orden,
                instrucciones_armado: instrucciones,
                tecnicos_ids: tecnicosIds
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Técnico notificado. El vehículo será armado.', 'success');
            cerrarModal('modalNotificarArmado');
            await cargarOrdenesConServicios();
            await cargarCotizacionesMap();
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

async function cobrarDiagnosticoArmado(id_orden, codigo) {
    if (!confirm(`¿Confirmas que el vehículo está ARMADO y deseas cobrar SOLO el diagnóstico (Bs. 200)?\n\nOrden: ${codigo}`)) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/rechazo/finalizar-diagnostico`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: id_orden,
                forma_pago: 'efectivo'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ Orden finalizada. Cobrado Bs. 200 por diagnóstico.`, 'success');
            await cargarOrdenesConServicios();
            await cargarCotizacionesMap();
        } else {
            showToast(data.error || 'Error al finalizar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// MODAL: INICIAR REPARACIÓN
// =====================================================

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
        const response = await fetch(`${API_URL}/tecnicos-disponibles`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        const container = document.getElementById('reparacionTecnicosContainer');
        if (container && data.tecnicos) {
            container.innerHTML = data.tecnicos.map(t => `
                <div class="tecnico-checkbox" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg-card); border-radius: 8px;">
                    <input type="checkbox" id="tecnico_${t.id}" value="${t.id}">
                    <label for="tecnico_${t.id}">${escapeHtml(t.nombre)}</label>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error:', error);
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
        showToast('Debes escribir instrucciones para los técnicos', 'warning');
        return;
    }
    
    const plazoDias = parseInt(document.getElementById('reparacionPlazoDias')?.value || 3);
    
    const checkboxes = document.querySelectorAll('#reparacionTecnicosContainer input[type="checkbox"]:checked');
    const tecnicosIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (tecnicosIds.length === 0) {
        showToast('Debes seleccionar al menos un técnico', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/asignar-tecnicos`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenAceptada.id_orden,
                tecnicos: tecnicosIds,
                instrucciones: instrucciones,
                tiempo_estimado: plazoDias,
                tiempo_unidad: 'dias'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ Reparación iniciada con ${tecnicosIds.length} técnico(s)`, 'success');
            cerrarModal('modalIniciarReparacion');
            await cargarOrdenesConServicios();
            await cargarCotizacionesMap();
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
    showToast('Función en desarrollo - Ver avance de reparación', 'info');
}

// =====================================================
// FUNCIONES PARA SERVICIOS COTIZABLES
// =====================================================

function renderServiciosCotizables() {
    const container = document.getElementById('serviciosCotizacionContainer');
    if (!container) return;
    
    if (serviciosCotizables.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-plus-circle"></i>
                <p>No hay servicios agregados</p>
                <small>Haz clic en "Agregar Servicio" para comenzar</small>
            </div>
        `;
        actualizarTotalCotizacion();
        return;
    }
    
    container.innerHTML = serviciosCotizables.map((serv, idx) => `
        <div class="servicio-cotizable-card" data-servicio-index="${idx}">
            <div class="servicio-cotizable-header" onclick="toggleServicioCotizable(${idx})">
                <div class="servicio-cotizable-nombre">
                    <input type="text" class="form-input" value="${escapeHtml(serv.nombre)}" 
                           style="background: transparent; border: none; padding: 0; font-weight: 600; width: auto;"
                           onchange="actualizarServicioCotizable(${idx}, 'nombre', this.value)" 
                           onclick="event.stopPropagation()">
                </div>
                <div class="servicio-cotizable-precio">
                    Bs. <input type="number" class="servicio-precio-input" value="${serv.precio || 0}" step="0.01"
                               style="width: 100px; background: transparent; border: none; text-align: right; font-weight: bold; color: var(--verde-exito);"
                               onchange="actualizarServicioCotizable(${idx}, 'precio', parseFloat(this.value))"
                               onclick="event.stopPropagation()">
                </div>
                <div class="action-buttons" onclick="event.stopPropagation()">
                    <button class="action-btn delete" onclick="eliminarServicioCotizable(${idx})" title="Eliminar servicio">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
            <div class="servicio-cotizable-body" id="servicio-cotizable-body-${idx}">
                <div class="form-group">
                    <label>Descripción detallada del servicio</label>
                    <textarea class="form-textarea" rows="2" 
                              onchange="actualizarServicioCotizable(${idx}, 'descripcion', this.value)"
                              placeholder="Describe el servicio en detalle...">${escapeHtml(serv.descripcion || '')}</textarea>
                </div>
                <div class="servicio-items-container">
                    <label><i class="fas fa-boxes"></i> Repuestos / Materiales</label>
                    <div id="items-cotizacion-${idx}">
                        ${(serv.items || []).map((item, itemIdx) => `
                            <div class="servicio-item-row">
                                <input type="text" class="servicio-item-descripcion" 
                                       value="${escapeHtml(item.descripcion)}" 
                                       placeholder="Descripción del repuesto"
                                       onchange="actualizarItemCotizable(${idx}, ${itemIdx}, 'descripcion', this.value)">
                                <input type="number" class="servicio-item-cantidad" 
                                       value="${item.cantidad || 1}" min="1"
                                       onchange="actualizarItemCotizable(${idx}, ${itemIdx}, 'cantidad', parseInt(this.value))">
                                <input type="number" class="servicio-item-precio" 
                                       value="${item.precio_unitario || 0}" step="0.01" 
                                       placeholder="Precio unitario"
                                       onchange="actualizarItemCotizable(${idx}, ${itemIdx}, 'precio_unitario', parseFloat(this.value))">
                                <div class="item-actions">
                                    <button class="btn-remove-item" onclick="eliminarItemCotizable(${idx}, ${itemIdx})">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn-add-item" style="margin-top: 0.5rem;" onclick="agregarItemCotizable(${idx})">
                        <i class="fas fa-plus-circle"></i> Agregar repuesto
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    actualizarTotalCotizacion();
}

function toggleServicioCotizable(idx) {
    const body = document.getElementById(`servicio-cotizable-body-${idx}`);
    if (body) body.classList.toggle('active');
}

function actualizarServicioCotizable(idx, campo, valor) {
    if (serviciosCotizables[idx]) {
        serviciosCotizables[idx][campo] = valor;
        if (campo === 'precio') {
            actualizarTotalCotizacion();
        }
    }
}

function agregarItemCotizable(servIdx) {
    if (!serviciosCotizables[servIdx].items) {
        serviciosCotizables[servIdx].items = [];
    }
    serviciosCotizables[servIdx].items.push({
        descripcion: '',
        cantidad: 1,
        precio_unitario: 0
    });
    renderServiciosCotizables();
    const body = document.getElementById(`servicio-cotizable-body-${servIdx}`);
    if (body) body.classList.add('active');
}

function actualizarItemCotizable(servIdx, itemIdx, campo, valor) {
    if (serviciosCotizables[servIdx]?.items?.[itemIdx]) {
        serviciosCotizables[servIdx].items[itemIdx][campo] = valor;
        recalcularPrecioServicio(servIdx);
    }
}

function eliminarItemCotizable(servIdx, itemIdx) {
    serviciosCotizables[servIdx].items.splice(itemIdx, 1);
    recalcularPrecioServicio(servIdx);
    renderServiciosCotizables();
}

function recalcularPrecioServicio(servIdx) {
    const servicio = serviciosCotizables[servIdx];
    if (!servicio) return;
    
    let totalItems = 0;
    if (servicio.items && servicio.items.length > 0) {
        totalItems = servicio.items.reduce((sum, item) => {
            return sum + ((item.precio_unitario || 0) * (item.cantidad || 1));
        }, 0);
    }
    
    if (totalItems > 0) {
        servicio.precio = totalItems;
        actualizarTotalCotizacion();
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
    const nuevoIdx = serviciosCotizables.length - 1;
    setTimeout(() => {
        const body = document.getElementById(`servicio-cotizable-body-${nuevoIdx}`);
        if (body) body.classList.add('active');
    }, 100);
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
    if (totalSpan) {
        totalSpan.textContent = `Bs. ${total.toFixed(2)}`;
    }
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
                items: (serv.items || []).map(item => ({
                    descripcion: item.descripcion || '',
                    cantidad: item.cantidad || 1,
                    precio_unitario: item.precio_unitario || 0
                }))
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
// FUNCIONES PARA SUBIDA DE ARCHIVOS
// =====================================================

function setupFileUpload() {
    const dropArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('cotizacionFile');
    const selectBtn = document.getElementById('selectFileBtn');
    
    if (!dropArea) return;
    
    dropArea.addEventListener('click', (e) => {
        if (e.target !== selectBtn && !selectBtn?.contains(e.target)) {
            fileInput.click();
        }
    });
    
    selectBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    
    fileInput?.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });
    
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    });
    
    dropArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
    });
    
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        handleFileSelect(file);
    });
    
    document.getElementById('removeFileBtn')?.addEventListener('click', () => {
        clearFileSelection();
    });
}

function handleFileSelect(file) {
    if (!file) return;
    
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Solo se permiten archivos PDF o Word (DOC, DOCX)', 'error');
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
    };
    reader.onerror = () => {
        showToast('Error al leer el archivo', 'error');
    };
    reader.readAsDataURL(file);
}

function displayFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const pdfIcon = document.querySelector('#fileInfo .fa-file-pdf');
    const wordIcon = document.querySelector('#fileInfo .fa-file-word');
    const uploadArea = document.getElementById('fileUploadArea');
    
    if (fileInfo && fileName && fileSize) {
        fileName.textContent = file.name;
        fileSize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        
        if (pdfIcon && wordIcon) {
            if (file.type === 'application/pdf') {
                pdfIcon.style.display = 'block';
                wordIcon.style.display = 'none';
            } else {
                pdfIcon.style.display = 'none';
                wordIcon.style.display = 'block';
            }
        }
        
        fileInfo.style.display = 'block';
        fileInfo.classList.add('file-uploaded');
        
        if (uploadArea) {
            uploadArea.style.opacity = '0.6';
        }
        
        setTimeout(() => {
            fileInfo.classList.remove('file-uploaded');
        }, 300);
    }
}

function clearFileSelection() {
    currentFileData = null;
    currentFileName = null;
    
    const fileInfo = document.getElementById('fileInfo');
    const fileInput = document.getElementById('cotizacionFile');
    const uploadArea = document.getElementById('fileUploadArea');
    
    if (fileInfo) fileInfo.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (uploadArea) uploadArea.style.opacity = '1';
}

function setupModalTabs() {
    const tabs = document.querySelectorAll('.modal-tab-btn');
    tabs.forEach(btn => {
        btn.removeEventListener('click', handleModalTabClick);
        btn.addEventListener('click', handleModalTabClick);
    });
}

function handleModalTabClick(e) {
    const btn = e.currentTarget;
    const tabId = btn.getAttribute('data-modal-tab');
    
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    document.querySelectorAll('.modal-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`modal-${tabId}`).classList.add('active');
}

// =====================================================
// COTIZACIÓN AL CLIENTE
// =====================================================

async function abrirModalGenerarCotizacion(id_orden) {
    mostrarLoading(true);
    isEditingCotizacion = false;
    currentCotizacionId = null;
    
    try {
        const orden = ordenesConServicios.find(o => o.id_orden === id_orden);
        if (!orden) {
            showToast('Orden no encontrada', 'error');
            return;
        }
        
        const datosOrden = await obtenerDatosOrden(id_orden);
        currentOrdenData = { id_orden, datosOrden };
        
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-file-invoice"></i> Generar Cotización';
        
        cargarServiciosDesdeDiagnostico(orden);
        clearFileSelection();
        
        const ordenInfoDiv = document.getElementById('ordenInfoPreview');
        if (ordenInfoDiv) {
            ordenInfoDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}<br>
                        <strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}<br>
                        <strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}
                    </div>
                    <div>
                        <strong>Total estimado:</strong> Bs. ${orden.total_orden?.toFixed(2) || '0.00'}
                    </div>
                </div>
            `;
        }
        
        setupFileUpload();
        setupModalTabs();
        
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function editarCotizacionExistente(id_orden) {
    mostrarLoading(true);
    try {
        const cotizacionExistente = cotizacionesMap[id_orden];
        if (!cotizacionExistente) {
            abrirModalGenerarCotizacion(id_orden);
            return;
        }
        
        await editarCotizacionPorId(cotizacionExistente.id);
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización para editar', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function editarCotizacionPorId(id_cotizacion) {
    mostrarLoading(true);
    isEditingCotizacion = true;
    currentCotizacionId = id_cotizacion;
    
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${id_cotizacion}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (!data.success) {
            showToast('Error al cargar la cotización', 'error');
            return;
        }
        
        const cotizacion = data.detalle;
        currentOrdenData = { id_orden: cotizacion.id_orden_trabajo };
        
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Cotización';
        
        if (cotizacion.servicios && cotizacion.servicios.length > 0) {
            serviciosCotizables = cotizacion.servicios.map(serv => ({
                id_servicio: serv.id_servicio,
                nombre: serv.nombre || serv.descripcion,
                descripcion: serv.descripcion || '',
                precio: serv.precio || 0,
                items: serv.items || []
            }));
        } else {
            serviciosCotizables = [];
        }
        
        renderServiciosCotizables();
        
        if (cotizacion.notas) {
            document.getElementById('notasAdicionales').value = cotizacion.notas;
        }
        
        const orden = ordenesConServicios.find(o => o.id_orden === cotizacion.id_orden_trabajo);
        const ordenInfoDiv = document.getElementById('ordenInfoPreview');
        if (ordenInfoDiv && orden) {
            ordenInfoDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}<br>
                        <strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}<br>
                        <strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}
                    </div>
                    <div>
                        <strong>Total cotizado:</strong> Bs. ${cotizacion.total?.toFixed(2) || '0.00'}
                    </div>
                </div>
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">
                    <small><i class="fas fa-info-circle"></i> Editando cotización enviada el ${formatDate(cotizacion.fecha_envio)}</small>
                </div>
            `;
        }
        
        clearFileSelection();
        setupFileUpload();
        setupModalTabs();
        
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización para editar', 'error');
    } finally {
        mostrarLoading(false);
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

async function enviarCotizacionCliente() {
    if (!currentOrdenData) {
        showToast('No hay datos para enviar', 'warning');
        return;
    }
    
    if (!currentFileData) {
        showToast('Debes subir un archivo PDF o Word para la cotización', 'warning');
        return;
    }
    
    const serviciosConPrecio = serviciosCotizables.filter(s => s.precio > 0);
    if (serviciosConPrecio.length === 0) {
        showToast('Debes asignar precios a al menos un servicio', 'warning');
        return;
    }
    
    const mensaje = isEditingCotizacion ? '¿Confirmas actualizar y reenviar esta cotización al cliente?' : '¿Confirmas enviar esta cotización al cliente?';
    if (!confirm(mensaje)) return;
    
    mostrarLoading(true);
    try {
        const serviciosParaEnviar = serviciosCotizables.map(serv => ({
            id_servicio: serv.id_servicio,
            nombre: serv.nombre,
            descripcion: serv.descripcion,
            precio: serv.precio,
            items: serv.items || []
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
            showToast(isEditingCotizacion ? 'Cotización actualizada y reenviada exitosamente' : 'Cotización enviada al cliente exitosamente', 'success');
            cerrarModal('modalGenerarCotizacion');
            clearFileSelection();
            serviciosCotizables = [];
            isEditingCotizacion = false;
            currentCotizacionId = null;
            await cargarCotizacionesMap();
            await cargarOrdenesConServicios();
            await cargarHistorialCotizaciones();
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

async function reutilizarCotizacionRechazada(id_orden, id_cotizacion) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${id_cotizacion}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (!data.success) {
            showToast('Error al cargar la cotización rechazada', 'error');
            return;
        }
        
        const cotizacion = data.detalle;
        currentOrdenData = { id_orden: cotizacion.id_orden_trabajo };
        
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-copy"></i> Nueva Cotización (basada en rechazada)';
        
        if (cotizacion.servicios && cotizacion.servicios.length > 0) {
            serviciosCotizables = cotizacion.servicios.map(serv => ({
                id_servicio: serv.id_servicio,
                nombre: serv.nombre || serv.descripcion,
                descripcion: serv.descripcion || '',
                precio: serv.precio || 0,
                items: serv.items || []
            }));
        } else {
            serviciosCotizables = [];
        }
        
        renderServiciosCotizables();
        
        const orden = ordenesConServicios.find(o => o.id_orden === id_orden);
        const ordenInfoDiv = document.getElementById('ordenInfoPreview');
        if (ordenInfoDiv && orden) {
            ordenInfoDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}<br>
                        <strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}<br>
                        <strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}
                    </div>
                </div>
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">
                    <small><i class="fas fa-info-circle"></i> Basado en cotización rechazada el ${formatDate(cotizacion.fecha_rechazo)}</small>
                </div>
            `;
        }
        
        isEditingCotizacion = false;
        currentCotizacionId = null;
        clearFileSelection();
        setupFileUpload();
        setupModalTabs();
        
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización rechazada', 'error');
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
            
            let archivoHTML = '';
            if (d.nombre_archivo) {
                const iconClass = d.nombre_archivo.toLowerCase().endsWith('.pdf') ? 'fa-file-pdf' : 'fa-file-word';
                const iconColor = d.nombre_archivo.toLowerCase().endsWith('.pdf') ? '#dc3545' : '#2b5797';
                archivoHTML = `
                    <div class="file-preview-card" style="margin-top: 15px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px;">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <i class="fas ${iconClass}" style="font-size: 40px; color: ${iconColor};"></i>
                                <div>
                                    <strong>${escapeHtml(d.nombre_archivo)}</strong>
                                    <p style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">Documento de cotización</p>
                                </div>
                            </div>
                            <button class="btn-primary" onclick="descargarCotizacion(${id_cotizacion})">
                                <i class="fas fa-download"></i> Descargar
                            </button>
                        </div>
                    </div>
                `;
            }
            
            let serviciosHTML = '';
            if (d.servicios && d.servicios.length > 0) {
                serviciosHTML = `
                    <div style="margin-top: 20px;">
                        <h4><i class="fas fa-clipboard-list"></i> Servicios Cotizados</h4>
                        <table class="data-table" style="margin-top: 10px;">
                            <thead>
                                <tr><th>Servicio</th><th style="text-align: center;">Cantidad</th><th style="text-align: right;">Precio</th><th style="text-align: center;">Estado</th></tr>
                            </thead>
                            <tbody>
                                ${d.servicios.map(serv => `
                                    <tr>
                                        <td>
                                            <strong>${escapeHtml(serv.nombre || serv.descripcion)}</strong>
                                            ${serv.items && serv.items.length > 0 ? `<br><small style="color: var(--gris-texto);">${serv.items.map(i => `📦 ${escapeHtml(i.descripcion)} x${i.cantidad}`).join(', ')}</small>` : ''}
                                         </strong>
                                        <td style="text-align: center;">${serv.items ? serv.items.reduce((sum, i) => sum + (i.cantidad || 1), 0) : 1}</strong>
                                        <td style="text-align: right;">Bs. ${(serv.precio || 0).toFixed(2)}</strong>
                                        <td style="text-align: center;">
                                            ${serv.aprobado_por_cliente 
                                                ? '<span class="status-badge status-aprobado"><i class="fas fa-check-circle"></i> Aprobado</span>'
                                                : '<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente</span>'}
                                        </strong>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div style="text-align: right; margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--border-color);">
                            <strong>TOTAL: Bs. ${d.total?.toFixed(2) || '0.00'}</strong>
                        </div>
                    </div>
                `;
            }
            
            container.innerHTML = `
                <div class="orden-info-card">
                    <p><strong>Orden:</strong> ${escapeHtml(d.orden_codigo)}</p>
                    <p><strong>Cliente:</strong> ${escapeHtml(d.cliente_nombre)}</p>
                    <p><strong>Vehículo:</strong> ${escapeHtml(d.vehiculo_marca)} ${escapeHtml(d.vehiculo_modelo)} - ${escapeHtml(d.vehiculo_placa)}</p>
                    <p><strong>Fecha Envío:</strong> ${formatDate(d.fecha_envio)}</p>
                    <p><strong>Estado:</strong> ${statusBadge(d.estado || 'enviada')}</p>
                    ${d.notas ? `<p><strong>Mensaje:</strong> ${escapeHtml(d.notas)}</p>` : ''}
                </div>
                ${serviciosHTML}
                ${archivoHTML}
            `;
            
            const btnDescarga = document.getElementById('exportarPDFDetalleBtn');
            if (btnDescarga) {
                btnDescarga.onclick = () => descargarCotizacion(id_cotizacion);
            }
            
            abrirModal('modalDetalleCotizacion');
        } else {
            showToast('Error al cargar detalle', 'error');
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

async function descargarCotizacion(id_cotizacion) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/descargar-cotizacion/${id_cotizacion}`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success && data.archivo_base64) {
            const link = document.createElement('a');
            link.href = data.archivo_base64;
            link.download = data.nombre_archivo || 'cotizacion.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Descargando archivo...', 'success');
        } else {
            showToast('Error al descargar el archivo', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
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
    document.getElementById('refreshOrdenesBtn')?.addEventListener('click', () => {
        cargarCotizacionesMap();
        cargarOrdenesConServicios();
    });
    document.getElementById('btnHistorialCotizaciones')?.addEventListener('click', () => {
        cargarHistorialCotizaciones().then(() => abrirModal('modalHistorialCotizaciones'));
    });
    document.getElementById('refreshHistorialBtn')?.addEventListener('click', cargarHistorialCotizaciones);
    document.getElementById('btnAgregarItemSolicitud')?.addEventListener('click', agregarItemSolicitud);
    document.getElementById('btnNuevaSolicitudCotizacion')?.addEventListener('click', () => {
        limpiarItemsSolicitud();
        abrirModal('modalSolicitudCotizacion');
    });
    
    document.getElementById('filtroEstadoCotizacion')?.addEventListener('change', () => renderOrdenes());
    document.getElementById('searchOrden')?.addEventListener('input', () => renderOrdenes());
    document.getElementById('searchHistorial')?.addEventListener('input', () => renderHistorialCotizaciones());
    document.getElementById('filtroEstadoHistorial')?.addEventListener('change', () => renderHistorialCotizaciones());
    
    const refreshBtns = ['refreshSolicitudes', 'refreshCompras'];
    refreshBtns.forEach(id => { 
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => cargarDatosIniciales());
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
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
    console.log('🚀 Inicializando cotizaciones.js versión 3.0');
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
window.toggleServicioCotizable = toggleServicioCotizable;
window.actualizarServicioCotizable = actualizarServicioCotizable;
window.agregarItemCotizable = agregarItemCotizable;
window.actualizarItemCotizable = actualizarItemCotizable;
window.eliminarItemCotizable = eliminarItemCotizable;
window.agregarServicioCotizable = agregarServicioCotizable;
window.eliminarServicioCotizable = eliminarServicioCotizable;
window.reutilizarCotizacionRechazada = reutilizarCotizacionRechazada;
window.abrirModalIniciarReparacion = abrirModalIniciarReparacion;
window.confirmarIniciarReparacion = confirmarIniciarReparacion;
window.abrirModalNotificarArmado = abrirModalNotificarArmado;
window.confirmarNotificarArmado = confirmarNotificarArmado;
window.cobrarDiagnosticoArmado = cobrarDiagnosticoArmado;
window.verAvanceReparacion = verAvanceReparacion;
window.descargarCotizacion = descargarCotizacion;

// Inicializar
document.addEventListener('DOMContentLoaded', inicializar);