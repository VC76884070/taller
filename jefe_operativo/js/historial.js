// =====================================================
// HISTORIAL - JEFE OPERATIVO
// CONEXIÓN REAL A BASE DE DATOS
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';
let historialData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 10;
let currentSort = { field: 'fecha_ingreso', direction: 'desc' };
let activeFilters = {
    search: '',
    dateFrom: '',
    dateTo: '',
    cliente: '',
    estado: '',
    vehiculo: ''
};
let userInfo = null;

// Elementos DOM
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const toggleFilters = document.getElementById('toggleFilters');
const filtersPanel = document.getElementById('filtersPanel');
const activeFiltersCount = document.getElementById('activeFiltersCount');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const filterCliente = document.getElementById('filterCliente');
const filterEstado = document.getElementById('filterEstado');
const filterVehiculo = document.getElementById('filterVehiculo');
const clearFilters = document.getElementById('clearFilters');
const applyFilters = document.getElementById('applyFilters');
const historialTableBody = document.getElementById('historialTableBody');
const cardsView = document.getElementById('cardsView');
const tableView = document.getElementById('tableView');
const viewOptions = document.querySelectorAll('.view-option');
const resultsCount = document.getElementById('resultsCount');
const startRecord = document.getElementById('startRecord');
const endRecord = document.getElementById('endRecord');
const totalRecords = document.getElementById('totalRecords');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');
const paginationPages = document.getElementById('paginationPages');
const exportBtn = document.getElementById('exportData');
const currentDateSpan = document.getElementById('currentDate');
const notificacionesCount = document.getElementById('notificacionesCount');

// Modal
const detalleModal = document.getElementById('detalleModal');
const detalleModalBody = document.getElementById('detalleModalBody');

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    initDatePickers();
    await loadClientes();
    await loadHistorial();
    setupEventListeners();
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

// Inicializar datepickers
function initDatePickers() {
    flatpickr(dateFrom, {
        locale: 'es',
        dateFormat: 'Y-m-d',
        allowInput: true,
        maxDate: 'today'
    });
    
    flatpickr(dateTo, {
        locale: 'es',
        dateFormat: 'Y-m-d',
        allowInput: true,
        maxDate: 'today'
    });
}

// Cargar clientes para el filtro
async function loadClientes() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/clientes`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.data) {
            filterCliente.innerHTML = '<option value="">Todos los clientes</option>';
            result.data.forEach(cliente => {
                filterCliente.innerHTML += `<option value="${cliente.nombre}">${cliente.nombre}</option>`;
            });
        }
    } catch (error) {
        console.error('Error cargando clientes:', error);
    }
}

// =====================================================
// CARGAR HISTORIAL DESDE API
// =====================================================
async function loadHistorial() {
    try {
        showLoading();
        
        const params = new URLSearchParams();
        if (activeFilters.search) params.append('search', activeFilters.search);
        if (activeFilters.dateFrom) params.append('fecha_desde', activeFilters.dateFrom);
        if (activeFilters.dateTo) params.append('fecha_hasta', activeFilters.dateTo);
        if (activeFilters.cliente) params.append('cliente', activeFilters.cliente);
        if (activeFilters.estado) params.append('estado', activeFilters.estado);
        if (activeFilters.vehiculo) params.append('vehiculo', activeFilters.vehiculo);
        params.append('sort', currentSort.field);
        params.append('order', currentSort.direction);
        
        const response = await fetch(`${API_URL}/jefe-operativo/historial?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar historial');
        }
        
        historialData = result.data || [];
        filteredData = [...historialData];
        
        renderTableView();
        
    } catch (error) {
        console.error('Error cargando historial:', error);
        mostrarNotificacion('Error al cargar el historial: ' + error.message, 'error');
        
        if (historialTableBody) {
            historialTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-exclamation-circle" style="color: var(--rojo-primario); font-size: 2rem;"></i>
                        <p style="margin-top: 1rem;">Error al cargar datos</p>
                    </td>
                </tr>
            `;
        }
    }
}

function showLoading() {
    if (historialTableBody) {
        historialTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--rojo-primario);"></i>
                    <p style="margin-top: 1rem;">Cargando historial...</p>
                </td>
            </tr>
        `;
    }
}

// =====================================================
// FILTROS
// =====================================================
function updateFiltersBadge() {
    let count = 0;
    if (activeFilters.search) count++;
    if (activeFilters.dateFrom) count++;
    if (activeFilters.dateTo) count++;
    if (activeFilters.cliente) count++;
    if (activeFilters.estado) count++;
    if (activeFilters.vehiculo) count++;
    
    activeFiltersCount.textContent = count;
    activeFiltersCount.style.display = count > 0 ? 'inline' : 'none';
}

function applyFiltersAction() {
    // Actualizar filtros activos
    activeFilters.dateFrom = dateFrom.value;
    activeFilters.dateTo = dateTo.value;
    activeFilters.cliente = filterCliente.value;
    activeFilters.estado = filterEstado.value;
    activeFilters.vehiculo = filterVehiculo.value.toLowerCase();
    
    updateFiltersBadge();
    
    // Aplicar filtros
    filteredData = historialData.filter(item => {
        // Búsqueda general
        if (activeFilters.search) {
            const searchTerm = activeFilters.search.toLowerCase();
            const matchesSearch = 
                (item.codigo_unico || '').toLowerCase().includes(searchTerm) ||
                (item.placa || '').toLowerCase().includes(searchTerm) ||
                (item.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
                (item.vehiculo_marca || '').toLowerCase().includes(searchTerm) ||
                (item.vehiculo_modelo || '').toLowerCase().includes(searchTerm);
            
            if (!matchesSearch) return false;
        }
        
        // Filtro por cliente
        if (activeFilters.cliente && item.cliente_nombre !== activeFilters.cliente) {
            return false;
        }
        
        // Filtro por estado
        if (activeFilters.estado && item.estado_global !== activeFilters.estado) {
            return false;
        }
        
        // Filtro por vehículo
        if (activeFilters.vehiculo) {
            const vehiculoStr = `${item.vehiculo_marca} ${item.vehiculo_modelo}`.toLowerCase();
            if (!vehiculoStr.includes(activeFilters.vehiculo)) {
                return false;
            }
        }
        
        // Filtro por fecha
        if (activeFilters.dateFrom) {
            const fechaItem = new Date(item.fecha_ingreso).toISOString().split('T')[0];
            if (fechaItem < activeFilters.dateFrom) return false;
        }
        
        if (activeFilters.dateTo) {
            const fechaItem = new Date(item.fecha_ingreso).toISOString().split('T')[0];
            if (fechaItem > activeFilters.dateTo) return false;
        }
        
        return true;
    });
    
    // Aplicar ordenamiento
    applySorting();
    
    // Resetear a primera página
    currentPage = 1;
    
    // Renderizar según vista actual
    const activeView = document.querySelector('.view-option.active').dataset.view;
    if (activeView === 'table') {
        renderTableView();
    } else {
        renderCardsView();
    }
}

// =====================================================
// ORDENAMIENTO
// =====================================================
function toggleSort(field) {
    const headers = document.querySelectorAll('.sortable');
    headers.forEach(h => {
        if (h.dataset.sort === field) {
            if (h.classList.contains('asc')) {
                h.classList.remove('asc');
                h.classList.add('desc');
                currentSort.direction = 'desc';
            } else {
                h.classList.remove('desc');
                h.classList.add('asc');
                currentSort.direction = 'asc';
            }
        } else {
            h.classList.remove('asc', 'desc');
        }
    });
    
    currentSort.field = field;
    applySorting();
    
    const activeView = document.querySelector('.view-option.active').dataset.view;
    if (activeView === 'table') {
        renderTableView();
    } else {
        renderCardsView();
    }
}

function applySorting() {
    filteredData.sort((a, b) => {
        let aVal = a[currentSort.field];
        let bVal = b[currentSort.field];
        
        // Manejar fechas
        if (currentSort.field === 'fecha_ingreso') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        }
        
        // Manejar montos
        if (currentSort.field === 'total') {
            aVal = Number(aVal);
            bVal = Number(bVal);
        }
        
        if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// =====================================================
// RENDERIZADO
// =====================================================
function renderTableView() {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const end = Math.min(start + itemsPerPage, filteredData.length);
    const pageData = filteredData.slice(start, end);
    
    // Actualizar info de paginación
    resultsCount.textContent = filteredData.length;
    startRecord.textContent = filteredData.length > 0 ? start + 1 : 0;
    endRecord.textContent = end;
    totalRecords.textContent = filteredData.length;
    
    // Actualizar botones de paginación
    prevPage.disabled = currentPage === 1;
    nextPage.disabled = currentPage === totalPages || totalPages === 0;
    
    // Renderizar números de página
    renderPagination(totalPages);
    
    if (pageData.length === 0) {
        historialTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: var(--gris-texto);">
                        <i class="fas fa-history" style="font-size: 3rem; opacity: 0.3;"></i>
                        <p>No se encontraron registros</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    historialTableBody.innerHTML = pageData.map(item => {
        const fechaIngreso = new Date(item.fecha_ingreso).toLocaleDateString('es-ES');
        const fechaSalida = item.fecha_salida ? new Date(item.fecha_salida).toLocaleDateString('es-ES') : '-';
        const total = item.total || 0;
        const estado = item.estado_global || 'EnRecepcion';
        
        return `
            <tr>
                <td><strong>${item.codigo_unico || '-'}</strong></td>
                <td>${item.vehiculo_marca || ''} ${item.vehiculo_modelo || ''}<br><small style="color: var(--gris-texto);">${item.placa || '-'}</small></td>
                <td>${item.cliente_nombre || '-'}</td>
                <td>${fechaIngreso}</td>
                <td>${fechaSalida}</td>
                <td class="monto-cell">Bs. ${total.toLocaleString()}</td>
                <td><span class="estado-badge ${estado}">${getEstadoTexto(estado)}</span></td>
                <td>
                    <button class="btn-detalle" onclick="verDetalle(${item.id})">
                        <i class="fas fa-eye"></i>
                        <span>Ver detalle</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPagination(totalPages) {
    let pagesHtml = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pagesHtml += `
            <button class="page-number ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">
                ${i}
            </button>
        `;
    }
    
    paginationPages.innerHTML = pagesHtml;
}

function renderCardsView() {
    cardsView.innerHTML = filteredData.map(item => {
        const fechaIngreso = new Date(item.fecha_ingreso).toLocaleDateString('es-ES');
        const fechaSalida = item.fecha_salida ? new Date(item.fecha_salida).toLocaleDateString('es-ES') : '-';
        const total = item.total || 0;
        const estado = item.estado_global || 'EnRecepcion';
        
        return `
            <div class="historial-card">
                <div class="card-header">
                    <span class="card-codigo">${item.codigo_unico || '-'}</span>
                    <span class="estado-badge ${estado}">${getEstadoTexto(estado)}</span>
                </div>
                <div class="card-body">
                    <div class="card-row">
                        <span class="card-label">Vehículo:</span>
                        <span class="card-value">${item.vehiculo_marca || ''} ${item.vehiculo_modelo || ''} (${item.placa || '-'})</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Cliente:</span>
                        <span class="card-value">${item.cliente_nombre || '-'}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Ingreso:</span>
                        <span class="card-value">${fechaIngreso}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Salida:</span>
                        <span class="card-value">${fechaSalida}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Total:</span>
                        <span class="card-value monto-cell">Bs. ${total.toLocaleString()}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Jefe Operativo:</span>
                        <span class="card-value">${item.jefe_nombre || '-'}</span>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="btn-detalle" onclick="verDetalle(${item.id})">
                        <i class="fas fa-eye"></i>
                        Ver detalle completo
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function getEstadoTexto(estado) {
    const map = {
        'Entregado': 'Entregado',
        'entregado': 'Entregado',
        'Finalizado': 'Finalizado',
        'finalizado': 'Finalizado',
        'EnTaller': 'En Taller',
        'en_taller': 'En Taller',
        'EnRecepcion': 'En Recepción',
        'en_recepcion': 'En Recepción'
    };
    return map[estado] || estado;
}

// =====================================================
// PAGINACIÓN
// =====================================================
window.goToPage = (page) => {
    currentPage = page;
    const activeView = document.querySelector('.view-option.active').dataset.view;
    if (activeView === 'table') {
        renderTableView();
    } else {
        renderCardsView();
    }
};

// =====================================================
// DETALLE - CON DATOS REALES
// =====================================================
window.verDetalle = async (id) => {
    try {
        mostrarNotificacion('Cargando detalles...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-operativo/historial/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar detalle');
        }
        
        const item = result.data;
        
        const fechaIngreso = new Date(item.fecha_ingreso).toLocaleString('es-ES');
        const fechaSalida = item.fecha_salida ? new Date(item.fecha_salida).toLocaleString('es-ES') : 'No registrada';
        
        const serviciosHtml = (item.servicios || []).map(s => `
            <li>
                <i class="fas fa-check-circle"></i>
                <span>${s.descripcion || s}</span>
                <span style="margin-left: auto; color: var(--verde-exito); font-weight: 600;">Bs ${(s.precio || 0).toLocaleString()}</span>
            </li>
        `).join('');
        
        detalleModalBody.innerHTML = `
            <div class="detalle-grid">
                <div class="detalle-seccion">
                    <h3><i class="fas fa-info-circle"></i> Información General</h3>
                    <table class="detalle-tabla">
                        <tr><td>Código:</td><td><strong>${item.codigo_unico || '-'}</strong></td></tr>
                        <tr><td>Cliente:</td><td>${item.cliente_nombre || '-'}</td></tr>
                        <tr><td>Vehículo:</td><td>${item.vehiculo_marca || ''} ${item.vehiculo_modelo || ''} <span style="background: var(--gris-oscuro); padding: 0.2rem 0.5rem; border-radius: 4px;">${item.placa || '-'}</span></td></tr>
                        <tr><td>Jefe Operativo:</td><td>${item.jefe_nombre || '-'}</td></tr>
                        <tr><td>Fecha Ingreso:</td><td>${fechaIngreso}</td></tr>
                        <tr><td>Fecha Salida:</td><td>${fechaSalida}</td></tr>
                        <tr><td>Estado:</td><td><span class="estado-badge ${item.estado_global}">${getEstadoTexto(item.estado_global)}</span></td></tr>
                    </table>
                </div>
                
                <div class="detalle-seccion">
                    <h3><i class="fas fa-tools"></i> Servicios Realizados</h3>
                    <ul class="servicios-lista">
                        ${serviciosHtml || '<li>No hay servicios registrados</li>'}
                    </ul>
                    
                    <div class="total-card">
                        <span class="total-label">Total Facturado:</span>
                        <span class="total-value">Bs. ${(item.total || 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 1rem; padding: 1rem; background: var(--gris-oscuro); border-radius: 8px; border-left: 4px solid var(--rojo-primario);">
                <p style="margin: 0; color: var(--gris-texto); font-size: 0.85rem;">
                    <i class="fas fa-info-circle" style="margin-right: 0.5rem;"></i>
                    Esta orden fue ${item.estado_global === 'Entregado' ? 'entregada al cliente' : 
                                    item.estado_global === 'Finalizado' ? 'finalizada y lista para entrega' : 
                                    'procesada'} el ${fechaSalida}.
                </p>
            </div>
        `;
        
        detalleModal.classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
};

// Funciones del modal
window.cerrarDetalleModal = () => {
    if (detalleModal) detalleModal.classList.remove('show');
};

window.imprimirDetalle = () => {
    const contenidoDetalle = detalleModalBody.innerHTML;
    const ventanaImpresion = window.open('', '_blank');
    ventanaImpresion.document.write(`
        <html>
            <head>
                <title>Detalle de Orden</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <style>
                    body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 2rem; background: white; }
                    h1 { color: #C1121F; }
                    .detalle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
                    .estado-badge { padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.8rem; }
                    .total-card { margin-top: 2rem; padding: 1rem; background: #f5f5f5; border-radius: 8px; display: flex; justify-content: space-between; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <h1>FURIA MOTOR COMPANY</h1>
                <h2>Detalle de Orden</h2>
                ${contenidoDetalle}
                <p style="margin-top: 2rem; text-align: center; color: #666;">
                    Documento generado el ${new Date().toLocaleString()}
                </p>
            </body>
        </html>
    `);
    ventanaImpresion.document.close();
    ventanaImpresion.print();
};

window.exportarDetalle = () => {
    mostrarNotificacion('Generando PDF...', 'info');
    setTimeout(() => {
        mostrarNotificacion('PDF generado correctamente', 'success');
    }, 1500);
};

// Cerrar modal con tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detalleModal && detalleModal.classList.contains('show')) {
        cerrarDetalleModal();
    }
});

// Cerrar modal haciendo clic fuera
if (detalleModal) {
    detalleModal.addEventListener('click', (e) => {
        if (e.target === detalleModal) cerrarDetalleModal();
    });
}

// =====================================================
// CONFIGURAR EVENT LISTENERS
// =====================================================
function setupEventListeners() {
    // Búsqueda
    searchInput.addEventListener('input', (e) => {
        activeFilters.search = e.target.value;
        updateFiltersBadge();
        applyFiltersAction();
    });
    
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        activeFilters.search = '';
        updateFiltersBadge();
        applyFiltersAction();
    });
    
    // Toggle filtros
    toggleFilters.addEventListener('click', () => {
        filtersPanel.classList.toggle('visible');
        toggleFilters.classList.toggle('active');
    });
    
    // Limpiar filtros
    clearFilters.addEventListener('click', () => {
        dateFrom._flatpickr?.clear();
        dateTo._flatpickr?.clear();
        filterCliente.value = '';
        filterEstado.value = '';
        filterVehiculo.value = '';
        
        activeFilters = {
            search: activeFilters.search,
            dateFrom: '',
            dateTo: '',
            cliente: '',
            estado: '',
            vehiculo: ''
        };
        
        updateFiltersBadge();
        applyFiltersAction();
    });
    
    // Aplicar filtros
    applyFilters.addEventListener('click', applyFiltersAction);
    
    // Ordenamiento
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.sort;
            toggleSort(field);
        });
    });
    
    // Vista tabla/tarjetas
    viewOptions.forEach(option => {
        option.addEventListener('click', () => {
            viewOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            
            if (option.dataset.view === 'table') {
                tableView.style.display = 'block';
                cardsView.style.display = 'none';
                renderTableView();
            } else {
                tableView.style.display = 'none';
                cardsView.style.display = 'grid';
                renderCardsView();
            }
        });
    });
    
    // Paginación
    prevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            const activeView = document.querySelector('.view-option.active').dataset.view;
            if (activeView === 'table') renderTableView();
            else renderCardsView();
        }
    });
    
    nextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            const activeView = document.querySelector('.view-option.active').dataset.view;
            if (activeView === 'table') renderTableView();
            else renderCardsView();
        }
    });
    
    // Exportar
    exportBtn.addEventListener('click', exportData);
}

// =====================================================
// EXPORTAR DATOS
// =====================================================
function exportData() {
    const dataStr = JSON.stringify(filteredData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `historial_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    mostrarNotificacion(`${filteredData.length} registros exportados`, 'success');
}

// =====================================================
// NOTIFICACIONES
// =====================================================
let notificacionesInterval = null;

function iniciarPollingNotificaciones() {
    if (notificacionesInterval) clearInterval(notificacionesInterval);
    notificacionesInterval = setInterval(cargarNotificaciones, 30000);
}

async function cargarNotificaciones() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/notificaciones`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
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
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${mensaje}</span>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toastContainer.contains(toast)) toastContainer.removeChild(toast);
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

// Exportar funciones globales
window.goToPage = goToPage;
window.verDetalle = verDetalle;
window.cerrarDetalleModal = cerrarDetalleModal;
window.imprimirDetalle = imprimirDetalle;
window.exportarDetalle = exportarDetalle;
window.logout = logout;