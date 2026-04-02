// =====================================================
// CONFIGURACIÓN
// =====================================================
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const cotizacionesTableBody = document.getElementById('cotizacionesTableBody');
const detalleVacio = document.getElementById('detalleVacio');
const detalleCotizacion = document.getElementById('detalleCotizacion');
const cerrarDetalleBtn = document.getElementById('cerrarDetalleBtn');
const searchInput = document.getElementById('searchInput');
const estadoFilter = document.getElementById('estadoFilter');
const fechaFilter = document.getElementById('fechaFilter');
const serviciosList = document.getElementById('serviciosList');
const subtotalSpan = document.getElementById('subtotal');
const totalCotizacionSpan = document.getElementById('totalCotizacion');
const diagnosticoMensaje = document.getElementById('diagnosticoMensaje');
const diagnosticoRow = document.getElementById('diagnosticoRow');
const previewTotal = document.getElementById('previewTotal');
const currentDateSpan = document.getElementById('currentDate');
const notificacionesCount = document.getElementById('notificacionesCount');
const cotizacionesCount = document.getElementById('cotizacionesCount');
const btnNuevaCotizacion = document.getElementById('btnNuevaCotizacion');
const btnEnviarCliente = document.getElementById('btnEnviarCliente');
const btnGenerarPDF = document.getElementById('btnGenerarPDF');
const btnEditarCotizacion = document.getElementById('btnEditarCotizacion');
const btnEliminarCotizacion = document.getElementById('btnEliminarCotizacion');
const ordenTrabajoSelect = document.getElementById('ordenTrabajo');
const serviciosGrid = document.getElementById('serviciosGrid');
const diagnosticoExistente = document.getElementById('diagnosticoExistente');
const diagnosticoTexto = document.getElementById('diagnosticoTexto');
const modalTitle = document.getElementById('modalTitle');
const ordenTrabajoGroup = document.getElementById('ordenTrabajoGroup');

// Variables globales
let cotizacionesData = [];
let cotizacionActual = null;
let paginaActual = 1;
let itemsPorPagina = 10;
let totalPaginas = 1;
let serviciosDisponibles = [];
let userInfo = null;
let modoEdicion = false;
let cotizacionEditandoId = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    await cargarServiciosDisponibles();
    await cargarCotizaciones();
    setupEventListeners();
    setupModalListeners();
    iniciarPollingNotificaciones();
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    userInfo = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || (userInfo.rol !== 'jefe_operativo' && userInfo.id_rol !== 2)) {
        window.location.href = '/';
        return false;
    }
    return true;
}

// Inicializar página
function initPage() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    if (currentDateSpan) {
        currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

// =====================================================
// CARGAR SERVICIOS DISPONIBLES
// =====================================================
async function cargarServiciosDisponibles() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/servicios-disponibles`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.data) {
            serviciosDisponibles = result.data;
            renderServiciosGrid();
        } else {
            // Datos por defecto si no hay servicios
            serviciosDisponibles = [
                { id: 1, nombre: 'Cambio de aceite', precio: 150 },
                { id: 2, nombre: 'Frenos (pastillas)', precio: 250 },
                { id: 3, nombre: 'Alineación y balanceo', precio: 450 },
                { id: 4, nombre: 'Cambio de batería', precio: 600 },
                { id: 5, nombre: 'Sistema de refrigeración', precio: 350 },
                { id: 6, nombre: 'Diagnóstico computarizado', precio: 800 }
            ];
            renderServiciosGrid();
        }
    } catch (error) {
        console.error('Error cargando servicios:', error);
        serviciosDisponibles = [
            { id: 1, nombre: 'Cambio de aceite', precio: 150 },
            { id: 2, nombre: 'Frenos (pastillas)', precio: 250 },
            { id: 3, nombre: 'Alineación y balanceo', precio: 450 },
            { id: 4, nombre: 'Cambio de batería', precio: 600 },
            { id: 5, nombre: 'Sistema de refrigeración', precio: 350 },
            { id: 6, nombre: 'Diagnóstico computarizado', precio: 800 }
        ];
        renderServiciosGrid();
    }
}

function renderServiciosGrid() {
    if (!serviciosGrid) return;
    
    serviciosGrid.innerHTML = serviciosDisponibles.map(serv => `
        <div class="servicio-item">
            <input type="checkbox" id="servicio-${serv.id}" value="${serv.precio}" data-id="${serv.id}" data-nombre="${serv.nombre}">
            <label for="servicio-${serv.id}">
                <strong>${serv.nombre}</strong>
                <span>Bs ${serv.precio.toLocaleString()}</span>
            </label>
        </div>
    `).join('');
    
    document.querySelectorAll('#serviciosGrid input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', actualizarPreviewTotal);
    });
}

// =====================================================
// CARGAR COTIZACIONES DESDE API
// =====================================================
async function cargarCotizaciones() {
    try {
        mostrarLoading(true);
        
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones?page=${paginaActual}&limit=${itemsPorPagina}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar cotizaciones');
        }
        
        cotizacionesData = result.data || [];
        totalPaginas = result.pagination?.totalPages || 1;
        
        if (cotizacionesCount) {
            cotizacionesCount.textContent = `${result.pagination?.total || 0} registros`;
        }
        
        renderTabla(cotizacionesData);
        renderPaginacion();
        
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
        mostrarNotificacion('Error al cargar cotizaciones: ' + error.message, 'error');
        
        if (cotizacionesTableBody) {
            cotizacionesTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-cell">
                        <i class="fas fa-exclamation-circle"></i> Error al cargar cotizaciones
                                        </td>
                </tr>
            `;
        }
    } finally {
        mostrarLoading(false);
    }
}

function mostrarLoading(mostrar) {
    if (cotizacionesTableBody && mostrar) {
        cotizacionesTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="loading-cell">
                    <i class="fas fa-spinner fa-spin"></i> Cargando cotizaciones...
                </td>
            </tr>
        `;
    }
}

// Renderizar tabla con botones de editar y eliminar
function renderTabla(cotizaciones) {
    if (!cotizacionesTableBody) return;
    
    if (!cotizaciones || cotizaciones.length === 0) {
        cotizacionesTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: var(--gris-texto);">
                    <i class="fas fa-inbox"></i> No hay cotizaciones registradas
                </td>
            </tr>
        `;
        return;
    }
    
    cotizacionesTableBody.innerHTML = cotizaciones.map(cot => {
        const estadoClass = {
            'pendiente': 'pendiente',
            'aprobada': 'aprobada',
            'aprobada_parcial': 'aprobada',
            'rechazada': 'rechazada',
            'diagnostico': 'diagnostico'
        }[cot.estado] || 'pendiente';
        
        const estadoTexto = {
            'pendiente': 'Pendiente',
            'aprobada': 'Aprobada',
            'aprobada_parcial': 'Aprobada (parcial)',
            'rechazada': 'Rechazada',
            'diagnostico': 'Solo diagnóstico'
        }[cot.estado] || cot.estado;
        
        const fechaFormateada = cot.fecha ? new Date(cot.fecha).toLocaleDateString('es-ES') : '-';
        
        return `
            <tr data-id="${cot.id}">
                <td><strong>${cot.codigo || 'COT-' + cot.id}</strong></td>
                <td>${escapeHtml(cot.cliente_nombre || '-')}</td>
                <td>${escapeHtml(cot.vehiculo_marca || '')} ${escapeHtml(cot.vehiculo_modelo || '')} (${escapeHtml(cot.placa || '-')})</td>
                <td><strong>Bs ${(cot.total || 0).toLocaleString()}</strong></td>
                <td><span class="estado-badge ${estadoClass}">${estadoTexto}</span></td>
                <td>${fechaFormateada}</td>
                <td class="action-buttons">
                    <button class="action-btn" onclick="event.stopPropagation(); verDetalle(${cot.id})" title="Ver detalle">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-btn" onclick="event.stopPropagation(); editarCotizacion(${cot.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="event.stopPropagation(); confirmarEliminarCotizacion(${cot.id}, '${cot.codigo || 'COT-' + cot.id}')" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Agregar evento de selección a las filas
    document.querySelectorAll('.cotizaciones-table tbody tr').forEach(row => {
        row.addEventListener('click', (e) => {
            if (!e.target.closest('.action-btn')) {
                const id = row.dataset.id;
                seleccionarCotizacion(parseInt(id));
            }
        });
    });
}

function renderPaginacion() {
    const paginationInfo = document.getElementById('paginationInfo');
    const btnAnterior = document.getElementById('btnPaginaAnterior');
    const btnSiguiente = document.getElementById('btnPaginaSiguiente');
    
    if (paginationInfo) {
        paginationInfo.textContent = `Página ${paginaActual} de ${totalPaginas || 1}`;
    }
    
    if (btnAnterior) {
        btnAnterior.disabled = paginaActual <= 1;
    }
    
    if (btnSiguiente) {
        btnSiguiente.disabled = paginaActual >= totalPaginas;
    }
}

// Filtrar cotizaciones
async function filtrarCotizaciones() {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const estado = estadoFilter?.value || '';
    const fecha = fechaFilter?.value || '';
    
    try {
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (estado) params.append('estado', estado);
        if (fecha && fecha !== 'todo') params.append('periodo', fecha);
        params.append('page', '1');
        params.append('limit', itemsPorPagina);
        
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            cotizacionesData = result.data || [];
            totalPaginas = result.pagination?.totalPages || 1;
            paginaActual = 1;
            renderTabla(cotizacionesData);
            renderPaginacion();
        }
    } catch (error) {
        console.error('Error filtrando:', error);
    }
}

// =====================================================
// SELECCIÓN DE COTIZACIÓN
// =====================================================
async function seleccionarCotizacion(id) {
    try {
        mostrarNotificacion('Cargando detalles...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar detalle');
        }
        
        cotizacionActual = result.data;
        
        // Remover selección anterior
        document.querySelectorAll('.cotizaciones-table tbody tr').forEach(row => {
            row.classList.remove('selected');
        });
        
        // Marcar fila seleccionada
        const fila = document.querySelector(`.cotizaciones-table tbody tr[data-id="${id}"]`);
        if (fila) fila.classList.add('selected');
        
        // Mostrar detalle
        mostrarDetalleCotizacion(cotizacionActual);
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function verDetalle(id) {
    seleccionarCotizacion(id);
}

function mostrarDetalleCotizacion(cotizacion) {
    if (!detalleVacio || !detalleCotizacion) return;
    
    // Ocultar vacío, mostrar detalle
    detalleVacio.style.display = 'none';
    detalleCotizacion.style.display = 'block';
    if (cerrarDetalleBtn) cerrarDetalleBtn.style.display = 'block';
    
    // Mostrar botones de editar y eliminar
    if (btnEditarCotizacion) btnEditarCotizacion.style.display = 'flex';
    if (btnEliminarCotizacion) btnEliminarCotizacion.style.display = 'flex';
    
    // Llenar datos básicos
    document.getElementById('detalleCodigo').textContent = cotizacion.codigo || `COT-${cotizacion.id}`;
    document.getElementById('detalleCliente').textContent = cotizacion.cliente_nombre || '-';
    document.getElementById('detalleVehiculo').textContent = `${cotizacion.vehiculo_marca || ''} ${cotizacion.vehiculo_modelo || ''} (${cotizacion.placa || '-'})`;
    document.getElementById('detalleOrden').textContent = cotizacion.orden_codigo || '-';
    document.getElementById('detalleFecha').textContent = cotizacion.fecha ? new Date(cotizacion.fecha).toLocaleString('es-ES') : '-';
    
    // Llenar servicios
    renderServiciosDetalle(cotizacion.servicios || []);
    
    // Calcular totales
    calcularTotalesDetalle(cotizacion.servicios || [], cotizacion.total);
}

function renderServiciosDetalle(servicios) {
    if (!serviciosList) return;
    
    if (!servicios || servicios.length === 0) {
        serviciosList.innerHTML = `
            <div style="text-align: center; padding: 1rem; color: var(--gris-texto);">
                No hay servicios registrados
            </div>
        `;
        return;
    }
    
    serviciosList.innerHTML = servicios.map(serv => `
        <div class="servicio-item-detalle">
            <span class="servicio-nombre">${escapeHtml(serv.descripcion || serv.nombre)}</span>
            <span class="servicio-precio">Bs ${(serv.precio || 0).toLocaleString()}</span>
        </div>
    `).join('');
}

function calcularTotalesDetalle(servicios, totalCotizacion) {
    const subtotal = servicios.reduce((sum, s) => sum + (s.precio || 0), 0);
    const tieneDiagnostico = servicios.some(s => 
        s.descripcion?.toLowerCase().includes('diagnóstico') || 
        s.nombre?.toLowerCase().includes('diagnóstico')
    );
    const aplicarDiagnostico = subtotal === 0 || tieneDiagnostico;
    
    // Actualizar UI
    if (subtotalSpan) subtotalSpan.textContent = `Bs ${subtotal.toLocaleString()}`;
    if (totalCotizacionSpan) totalCotizacionSpan.textContent = `Bs ${(totalCotizacion || 0).toLocaleString()}`;
    
    // Mostrar/ocultar diagnóstico
    if (diagnosticoRow) {
        diagnosticoRow.style.display = aplicarDiagnostico ? 'flex' : 'none';
    }
    if (diagnosticoMensaje) {
        diagnosticoMensaje.style.display = aplicarDiagnostico ? 'flex' : 'none';
    }
}

function cerrarDetalle() {
    if (detalleVacio) detalleVacio.style.display = 'block';
    if (detalleCotizacion) detalleCotizacion.style.display = 'none';
    if (cerrarDetalleBtn) cerrarDetalleBtn.style.display = 'none';
    if (btnEditarCotizacion) btnEditarCotizacion.style.display = 'none';
    if (btnEliminarCotizacion) btnEliminarCotizacion.style.display = 'none';
    cotizacionActual = null;
}

// =====================================================
// EDITAR COTIZACIÓN
// =====================================================
async function editarCotizacion(id) {
    try {
        mostrarNotificacion('Cargando datos para editar...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar cotización');
        }
        
        const cotizacion = result.data;
        cotizacionEditandoId = id;
        modoEdicion = true;
        
        // Cambiar título del modal
        if (modalTitle) {
            modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Cotización';
        }
        
        // Ocultar selector de orden de trabajo (no se puede cambiar)
        if (ordenTrabajoGroup) {
            ordenTrabajoGroup.style.display = 'none';
        }
        
        // Cargar servicios seleccionados en los checkboxes
        cargarServiciosEnModal(cotizacion.servicios || []);
        
        // Mostrar modal
        const modal = document.getElementById('cotizacionModal');
        if (modal) modal.classList.add('show');
        
        actualizarPreviewTotal();
        
        mostrarNotificacion('Datos cargados. Puedes editar los servicios.', 'success');
        
    } catch (error) {
        console.error('Error editando cotización:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cargarServiciosEnModal(servicios) {
    // Resetear checkboxes
    const checkboxes = document.querySelectorAll('#serviciosGrid input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    
    // Eliminar servicios personalizados existentes
    const serviciosGridContainer = document.getElementById('serviciosGrid');
    const customServices = serviciosGridContainer.querySelectorAll('.servicio-item[data-custom="true"]');
    customServices.forEach(service => service.remove());
    
    // Marcar servicios existentes
    servicios.forEach(serv => {
        const servicioExistente = serviciosDisponibles.find(s => s.nombre === serv.descripcion);
        if (servicioExistente) {
            const checkbox = document.getElementById(`servicio-${servicioExistente.id}`);
            if (checkbox) checkbox.checked = true;
        } else {
            // Agregar servicio personalizado
            agregarServicioCustomAlModal(serv.descripcion, serv.precio);
        }
    });
    
    actualizarPreviewTotal();
}

function agregarServicioCustomAlModal(descripcion, precio) {
    const serviciosGridContainer = document.getElementById('serviciosGrid');
    if (!serviciosGridContainer) return;
    
    const nuevoServicio = document.createElement('div');
    nuevoServicio.className = 'servicio-item';
    nuevoServicio.setAttribute('data-custom', 'true');
    const servicioId = `servicio-custom-${Date.now()}-${Math.random()}`;
    nuevoServicio.innerHTML = `
        <input type="checkbox" id="${servicioId}" value="${precio}" data-id="custom-${Date.now()}" data-nombre="${escapeHtml(descripcion)}" checked>
        <label for="${servicioId}">
            <strong>${escapeHtml(descripcion)}</strong>
            <span>Bs ${precio.toLocaleString()}</span>
        </label>
        <button type="button" class="btn-remove-custom" onclick="this.parentElement.remove(); actualizarPreviewTotal();" style="background: none; border: none; color: var(--rojo-primario); cursor: pointer; margin-left: 0.5rem;">
            <i class="fas fa-times"></i>
        </button>
    `;
    serviciosGridContainer.appendChild(nuevoServicio);
    
    const newCheckbox = nuevoServicio.querySelector('input[type="checkbox"]');
    newCheckbox.addEventListener('change', actualizarPreviewTotal);
}

// =====================================================
// ELIMINAR COTIZACIÓN
// =====================================================
function confirmarEliminarCotizacion(id, codigo) {
    const modal = document.getElementById('modalConfirmarEliminar');
    const eliminarInfo = document.getElementById('eliminarInfo');
    
    if (!modal) return;
    
    eliminarInfo.innerHTML = `
        <p><strong>Cotización:</strong> ${escapeHtml(codigo)}</p>
        <p><strong>ID:</strong> ${id}</p>
    `;
    
    modal.classList.add('show');
    
    const btnConfirmar = document.getElementById('btnConfirmarEliminar');
    if (btnConfirmar) {
        btnConfirmar.onclick = async () => {
            await eliminarCotizacion(id);
            cerrarModalEliminar();
        };
    }
}

function cerrarModalEliminar() {
    const modal = document.getElementById('modalConfirmarEliminar');
    if (modal) modal.classList.remove('show');
}

async function eliminarCotizacion(id) {
    try {
        mostrarNotificacion('Eliminando cotización...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            mostrarNotificacion('Cotización eliminada correctamente', 'success');
            cerrarDetalle();
            await cargarCotizaciones();
        } else {
            throw new Error(result.error || 'Error al eliminar');
        }
    } catch (error) {
        console.error('Error eliminando cotización:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// NUEVA COTIZACIÓN
// =====================================================
async function cargarOrdenesParaCotizar() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/ordenes-para-cotizar`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error);
        }
        
        if (ordenTrabajoSelect && result.data) {
            ordenTrabajoSelect.innerHTML = '<option value="">Seleccionar orden de trabajo</option>';
            result.data.forEach(orden => {
                ordenTrabajoSelect.innerHTML += `
                    <option value="${orden.id}" data-diagnostico="${escapeHtml(orden.diagnostico || '')}">
                        ${orden.codigo} - ${orden.vehiculo_marca} ${orden.vehiculo_modelo} (${orden.cliente_nombre})
                    </option>
                `;
            });
        }
        
        // Evento para mostrar diagnóstico al seleccionar orden
        ordenTrabajoSelect.addEventListener('change', () => {
            const selectedOption = ordenTrabajoSelect.options[ordenTrabajoSelect.selectedIndex];
            const diagnostico = selectedOption?.dataset?.diagnostico;
            
            if (diagnostico && diagnosticoExistente) {
                diagnosticoTexto.textContent = diagnostico;
                diagnosticoExistente.style.display = 'block';
            } else if (diagnosticoExistente) {
                diagnosticoExistente.style.display = 'none';
            }
        });
        
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        mostrarNotificacion('Error al cargar órdenes de trabajo', 'error');
        
        // Datos de ejemplo para desarrollo
        if (ordenTrabajoSelect) {
            ordenTrabajoSelect.innerHTML = `
                <option value="">Seleccionar orden de trabajo</option>
                <option value="1">OT-001 - Toyota Corolla (Juan Pérez)</option>
                <option value="2">OT-002 - Honda Civic (María López)</option>
                <option value="3">OT-003 - Suzuki Swift (Roberto Méndez)</option>
            `;
        }
    }
}

function resetModalForm() {
    // Resetear checkboxes
    const checkboxes = document.querySelectorAll('#serviciosGrid input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    
    // Eliminar servicios personalizados
    const serviciosGridContainer = document.getElementById('serviciosGrid');
    const customServices = serviciosGridContainer.querySelectorAll('.servicio-item[data-custom="true"]');
    customServices.forEach(service => service.remove());
    
    // Reset campos personalizados
    const customDesc = document.getElementById('servicioCustomDesc');
    const customPrecio = document.getElementById('servicioCustomPrecio');
    if (customDesc) customDesc.value = '';
    if (customPrecio) customPrecio.value = '';
    
    // Ocultar diagnóstico existente
    if (diagnosticoExistente) diagnosticoExistente.style.display = 'none';
    
    // Resetear modo edición
    modoEdicion = false;
    cotizacionEditandoId = null;
    
    // Mostrar selector de orden de trabajo
    if (ordenTrabajoGroup) {
        ordenTrabajoGroup.style.display = 'block';
    }
    
    // Cambiar título del modal
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Nueva Cotización';
    }
    
    actualizarPreviewTotal();
}

function actualizarPreviewTotal() {
    if (!previewTotal) return;
    
    // Calcular total de servicios predefinidos
    const checkboxes = document.querySelectorAll('#serviciosGrid input[type="checkbox"]:checked');
    let total = 0;
    
    checkboxes.forEach(cb => {
        total += parseFloat(cb.value) || 0;
    });
    
    // Agregar servicio personalizado temporal
    const customPrecio = document.getElementById('servicioCustomPrecio')?.value;
    if (customPrecio) {
        total += parseFloat(customPrecio) || 0;
    }
    
    // Determinar si aplica diagnóstico
    const aplicarDiagnostico = total === 0;
    const diagnosticoPreview = document.getElementById('diagnosticoPreview');
    
    if (aplicarDiagnostico) {
        total = 200;
        if (diagnosticoPreview) {
            diagnosticoPreview.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <span>Diagnóstico Bs. 200 aplicado (sin servicios seleccionados)</span>
            `;
        }
    } else {
        if (diagnosticoPreview) {
            diagnosticoPreview.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <span>Diagnóstico gratuito por seleccionar servicios</span>
            `;
        }
    }
    
    previewTotal.textContent = `Bs ${total.toLocaleString()}`;
}

function agregarServicioCustom() {
    const desc = document.getElementById('servicioCustomDesc');
    const precio = document.getElementById('servicioCustomPrecio');
    
    if (!desc.value || !precio.value) {
        mostrarNotificacion('Complete descripción y precio', 'warning');
        return;
    }
    
    const precioNum = parseFloat(precio.value);
    if (isNaN(precioNum) || precioNum <= 0) {
        mostrarNotificacion('Ingrese un precio válido', 'warning');
        return;
    }
    
    agregarServicioCustomAlModal(desc.value, precioNum);
    
    mostrarNotificacion('Servicio personalizado agregado', 'success');
    
    // Limpiar campos
    desc.value = '';
    precio.value = '';
    
    actualizarPreviewTotal();
}

async function guardarCotizacion() {
    // Determinar si es edición o nueva
    if (modoEdicion && cotizacionEditandoId) {
        await actualizarCotizacion();
    } else {
        await crearNuevaCotizacion();
    }
}

async function crearNuevaCotizacion() {
    // Validar orden de trabajo seleccionada
    const ordenId = ordenTrabajoSelect?.value;
    
    if (!ordenId) {
        mostrarNotificacion('Seleccione una orden de trabajo', 'warning');
        return;
    }
    
    // Recopilar servicios seleccionados
    const servicios = [];
    
    // Servicios predefinidos
    const checkboxes = document.querySelectorAll('#serviciosGrid input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        const label = cb.nextElementSibling;
        const nombre = label?.querySelector('strong')?.textContent || 'Servicio';
        servicios.push({
            descripcion: nombre,
            precio: parseFloat(cb.value) || 0
        });
    });
    
    // Si no hay servicios seleccionados, agregar diagnóstico
    if (servicios.length === 0) {
        servicios.push({
            descripcion: 'Diagnóstico general',
            precio: 200
        });
    }
    
    // Deshabilitar botón mientras se procesa
    const btnGuardar = document.getElementById('btnGuardarCotizacion');
    const textoOriginal = btnGuardar?.innerHTML;
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({
                orden_trabajo_id: parseInt(ordenId),
                servicios: servicios
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al guardar cotización');
        }
        
        mostrarNotificacion('Cotización guardada exitosamente', 'success');
        
        // Cerrar modal y recargar lista
        const modal = document.getElementById('cotizacionModal');
        if (modal) modal.classList.remove('show');
        resetModalForm();
        
        // Recargar cotizaciones
        paginaActual = 1;
        await cargarCotizaciones();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = textoOriginal;
        }
    }
}

async function actualizarCotizacion() {
    // Recopilar servicios seleccionados
    const servicios = [];
    
    // Servicios predefinidos
    const checkboxes = document.querySelectorAll('#serviciosGrid input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        const label = cb.nextElementSibling;
        const nombre = label?.querySelector('strong')?.textContent || 'Servicio';
        servicios.push({
            descripcion: nombre,
            precio: parseFloat(cb.value) || 0
        });
    });
    
    // Si no hay servicios seleccionados, agregar diagnóstico
    if (servicios.length === 0) {
        servicios.push({
            descripcion: 'Diagnóstico general',
            precio: 200
        });
    }
    
    // Deshabilitar botón mientras se procesa
    const btnGuardar = document.getElementById('btnGuardarCotizacion');
    const textoOriginal = btnGuardar?.innerHTML;
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones/${cotizacionEditandoId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({
                servicios: servicios
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al actualizar cotización');
        }
        
        mostrarNotificacion('Cotización actualizada exitosamente', 'success');
        
        // Cerrar modal y recargar lista
        const modal = document.getElementById('cotizacionModal');
        if (modal) modal.classList.remove('show');
        resetModalForm();
        
        // Recargar cotizaciones
        await cargarCotizaciones();
        
        // Cerrar detalle si estaba abierto
        cerrarDetalle();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = textoOriginal;
        }
    }
}

// =====================================================
// ACCIONES DE COTIZACIÓN
// =====================================================
async function enviarCotizacion() {
    if (!cotizacionActual) {
        mostrarNotificacion('Seleccione una cotización', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones/${cotizacionActual.id}/enviar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al enviar');
        }
        
        mostrarNotificacion(`Cotización ${cotizacionActual.codigo} enviada al cliente`, 'success');
        
        // Actualizar estado local
        cotizacionActual.estado = 'enviada';
        await cargarCotizaciones();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function generarPDF() {
    if (!cotizacionActual) {
        mostrarNotificacion('Seleccione una cotización', 'warning');
        return;
    }
    
    mostrarNotificacion(`Generando PDF de ${cotizacionActual.codigo}...`, 'info');
    
    // Aquí iría la lógica real de generación de PDF
    setTimeout(() => {
        mostrarNotificacion('PDF generado correctamente', 'success');
    }, 1500);
}

// =====================================================
// CONFIGURAR EVENT LISTENERS
// =====================================================
function setupEventListeners() {
    // Búsqueda
    if (searchInput) {
        let timeoutId;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                paginaActual = 1;
                filtrarCotizaciones();
            }, 500);
        });
    }
    
    // Filtros
    if (estadoFilter) {
        estadoFilter.addEventListener('change', () => {
            paginaActual = 1;
            filtrarCotizaciones();
        });
    }
    
    if (fechaFilter) {
        fechaFilter.addEventListener('change', () => {
            paginaActual = 1;
            filtrarCotizaciones();
        });
    }
    
    // Paginación
    const btnAnterior = document.getElementById('btnPaginaAnterior');
    const btnSiguiente = document.getElementById('btnPaginaSiguiente');
    
    if (btnAnterior) {
        btnAnterior.addEventListener('click', () => {
            if (paginaActual > 1) {
                paginaActual--;
                cargarCotizaciones();
            }
        });
    }
    
    if (btnSiguiente) {
        btnSiguiente.addEventListener('click', () => {
            if (paginaActual < totalPaginas) {
                paginaActual++;
                cargarCotizaciones();
            }
        });
    }
    
    // Botones de detalle
    if (btnEnviarCliente) {
        btnEnviarCliente.addEventListener('click', enviarCotizacion);
    }
    
    if (btnGenerarPDF) {
        btnGenerarPDF.addEventListener('click', generarPDF);
    }
    
    if (btnEditarCotizacion) {
        btnEditarCotizacion.addEventListener('click', () => {
            if (cotizacionActual) {
                editarCotizacion(cotizacionActual.id);
            }
        });
    }
    
    if (btnEliminarCotizacion) {
        btnEliminarCotizacion.addEventListener('click', () => {
            if (cotizacionActual) {
                confirmarEliminarCotizacion(cotizacionActual.id, cotizacionActual.codigo);
            }
        });
    }
    
    // Cerrar detalle
    if (cerrarDetalleBtn) {
        cerrarDetalleBtn.addEventListener('click', cerrarDetalle);
    }
    
    // Actualizar preview total cuando cambien checkboxes en modal
    document.addEventListener('change', (e) => {
        if (e.target.closest('#serviciosGrid') && e.target.type === 'checkbox') {
            actualizarPreviewTotal();
        }
    });
}

function setupModalListeners() {
    // Botón nueva cotización
    if (btnNuevaCotizacion) {
        btnNuevaCotizacion.addEventListener('click', async () => {
            await cargarOrdenesParaCotizar();
            resetModalForm();
            const modal = document.getElementById('cotizacionModal');
            if (modal) modal.classList.add('show');
            actualizarPreviewTotal();
        });
    }
    
    // Cerrar modal
    const btnCerrarModal = document.getElementById('btnCerrarModal');
    const btnCancelarModal = document.getElementById('btnCancelarModal');
    const modal = document.getElementById('cotizacionModal');
    
    const cerrarModal = () => {
        if (modal) modal.classList.remove('show');
        resetModalForm();
    };
    
    if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);
    if (btnCancelarModal) btnCancelarModal.addEventListener('click', cerrarModal);
    
    // Cerrar al hacer clic fuera
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModal();
        });
    }
    
    // Botón agregar servicio personalizado
    const btnAgregarCustom = document.getElementById('btnAgregarCustom');
    if (btnAgregarCustom) {
        btnAgregarCustom.addEventListener('click', agregarServicioCustom);
    }
    
    // Botón guardar cotización
    const btnGuardar = document.getElementById('btnGuardarCotizacion');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarCotizacion);
    }
}

// =====================================================
// POLLING DE NOTIFICACIONES
// =====================================================
let notificacionesInterval = null;

function iniciarPollingNotificaciones() {
    if (notificacionesInterval) clearInterval(notificacionesInterval);
    
    notificacionesInterval = setInterval(async () => {
        await cargarNotificaciones();
    }, 30000);
}

async function cargarNotificaciones() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/notificaciones`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.data) {
            const noLeidas = result.data.filter(n => !n.leida).length;
            if (notificacionesCount) {
                notificacionesCount.textContent = noLeidas;
                notificacionesCount.style.display = noLeidas > 0 ? 'inline-block' : 'none';
            }
        }
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
    }
}

// =====================================================
// UTILIDADES
// =====================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${iconos[tipo] || iconos.info}"></i>
        <span>${escapeHtml(mensaje)}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// =====================================================
// LOGOUT
// =====================================================
window.logout = () => {
    if (notificacionesInterval) clearInterval(notificacionesInterval);
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};

// =====================================================
// EXPORTAR FUNCIONES GLOBALES
// =====================================================
window.seleccionarCotizacion = seleccionarCotizacion;
window.verDetalle = verDetalle;
window.cerrarDetalle = cerrarDetalle;
window.enviarCotizacion = enviarCotizacion;
window.generarPDF = generarPDF;
window.editarCotizacion = editarCotizacion;
window.confirmarEliminarCotizacion = confirmarEliminarCotizacion;
window.logout = logout;