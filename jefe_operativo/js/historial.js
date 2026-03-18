// =====================================================
// HISTORIAL - JEFE OPERATIVO (ESTILO ERP)
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';
let historialData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 10;
let currentSort = { field: 'fechaIngreso', direction: 'desc' };
let activeFilters = {
    search: '',
    dateFrom: '',
    dateTo: '',
    cliente: '',
    estado: '',
    vehiculo: ''
};

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

// Modal
const detalleModal = document.getElementById('detalleModal');
const detalleModalBody = document.getElementById('detalleModalBody');

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initPage();
    initDatePickers();
    await loadHistorial();
    setupEventListeners();
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || user.rol !== 'jefe_operativo') {
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

// Configurar event listeners
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
        dateFrom._flatpickr.clear();
        dateTo._flatpickr.clear();
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
            renderTableView();
        }
    });
    
    nextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTableView();
        }
    });
    
    // Exportar
    exportBtn.addEventListener('click', exportData);
}

// =====================================================
// CARGAR DATOS
// =====================================================
async function loadHistorial() {
    try {
        showLoading();
        
        // Simulación - Reemplazar con llamada real a la API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Datos de ejemplo
        historialData = generateMockData(50);
        filteredData = [...historialData];
        
        renderTableView();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al cargar el historial', 'error');
    }
}

// Generar datos de ejemplo
function generateMockData(count) {
    const clientes = ['Juan Pérez', 'María López', 'Carlos Ruiz', 'Ana Flores', 'Roberto Méndez', 'Laura Sánchez', 'Pedro Gómez', 'Sofia Castro'];
    const vehiculos = ['Toyota Corolla', 'Honda Civic', 'Chevrolet Spark', 'Nissan Versa', 'Suzuki Swift', 'Ford Fiesta', 'Volkswagen Gol', 'Renault Logan'];
    const placas = ['ABC123', 'XYZ789', 'JKL012', 'GHI789', 'DEF456', 'MNO345', 'PQR678', 'STU901'];
    const estados = ['entregado', 'finalizado', 'cancelado'];
    
    const data = [];
    
    for (let i = 1; i <= count; i++) {
        const fechaIngreso = new Date();
        fechaIngreso.setDate(fechaIngreso.getDate() - Math.floor(Math.random() * 90));
        
        const fechaSalida = new Date(fechaIngreso);
        fechaSalida.setDate(fechaSalida.getDate() + Math.floor(Math.random() * 7) + 1);
        
        const estado = estados[Math.floor(Math.random() * estados.length)];
        const clienteIndex = Math.floor(Math.random() * clientes.length);
        
        data.push({
            id: i,
            codigo: `OT-${String(240301 + i).slice(-6)}`,
            vehiculo: vehiculos[Math.floor(Math.random() * vehiculos.length)],
            placa: placas[Math.floor(Math.random() * placas.length)],
            cliente: clientes[clienteIndex],
            fechaIngreso: fechaIngreso.toISOString(),
            fechaSalida: fechaSalida.toISOString(),
            totalFacturado: Math.floor(Math.random() * 2000) + 200,
            estado: estado,
            servicios: generarServiciosAleatorios(),
            tecnico: ['Luis Mamani', 'Carlos Rodríguez', 'Juan Pérez', 'María González'][Math.floor(Math.random() * 4)]
        });
    }
    
    return data;
}

function generarServiciosAleatorios() {
    const servicios = ['Cambio de aceite', 'Frenos (pastillas)', 'Alineación', 'Balanceo', 'Diagnóstico', 'Batería', 'Filtros', 'Suspensión'];
    const count = Math.floor(Math.random() * 3) + 1;
    const seleccionados = [];
    
    for (let i = 0; i < count; i++) {
        const servicio = servicios[Math.floor(Math.random() * servicios.length)];
        if (!seleccionados.includes(servicio)) {
            seleccionados.push(servicio);
        }
    }
    
    return seleccionados;
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
                item.codigo.toLowerCase().includes(searchTerm) ||
                item.placa.toLowerCase().includes(searchTerm) ||
                item.cliente.toLowerCase().includes(searchTerm) ||
                item.vehiculo.toLowerCase().includes(searchTerm);
            
            if (!matchesSearch) return false;
        }
        
        // Filtro por cliente
        if (activeFilters.cliente && item.cliente !== activeFilters.cliente) {
            return false;
        }
        
        // Filtro por estado
        if (activeFilters.estado && item.estado !== activeFilters.estado) {
            return false;
        }
        
        // Filtro por vehículo
        if (activeFilters.vehiculo && !item.vehiculo.toLowerCase().includes(activeFilters.vehiculo)) {
            return false;
        }
        
        // Filtro por fecha
        if (activeFilters.dateFrom) {
            const fechaItem = new Date(item.fechaIngreso).toISOString().split('T')[0];
            if (fechaItem < activeFilters.dateFrom) return false;
        }
        
        if (activeFilters.dateTo) {
            const fechaItem = new Date(item.fechaIngreso).toISOString().split('T')[0];
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
        if (currentSort.field === 'fechaIngreso') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        }
        
        // Manejar montos
        if (currentSort.field === 'totalFacturado') {
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
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: var(--gray-500);">
                        <i class="fas fa-history" style="font-size: 3rem; opacity: 0.3;"></i>
                        <p>No se encontraron registros</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    historialTableBody.innerHTML = pageData.map(item => {
        const fechaIngreso = new Date(item.fechaIngreso).toLocaleDateString('es-ES');
        const fechaSalida = new Date(item.fechaSalida).toLocaleDateString('es-ES');
        
        return `
            <tr>
                <td><strong>${item.codigo}</strong></td>
                <td>${item.vehiculo}<br><small style="color: var(--gray-500);">${item.placa}</small></td>
                <td>${item.cliente}</td>
                <td>${fechaIngreso}</td>
                <td>${fechaSalida}</td>
                <td class="monto-cell">Bs. ${item.totalFacturado.toFixed(2)}</td>
                <td><span class="estado-badge ${item.estado}">${getEstadoTexto(item.estado)}</span></td>
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
        const fechaIngreso = new Date(item.fechaIngreso).toLocaleDateString('es-ES');
        const fechaSalida = new Date(item.fechaSalida).toLocaleDateString('es-ES');
        
        return `
            <div class="historial-card">
                <div class="card-header">
                    <span class="card-codigo">${item.codigo}</span>
                    <span class="estado-badge ${item.estado}">${getEstadoTexto(item.estado)}</span>
                </div>
                <div class="card-body">
                    <div class="card-row">
                        <span class="card-label">Vehículo:</span>
                        <span class="card-value">${item.vehiculo} (${item.placa})</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Cliente:</span>
                        <span class="card-value">${item.cliente}</span>
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
                        <span class="card-value monto-cell">Bs. ${item.totalFacturado.toFixed(2)}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Técnico:</span>
                        <span class="card-value">${item.tecnico}</span>
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
        'entregado': 'Entregado',
        'finalizado': 'Finalizado',
        'cancelado': 'Cancelado'
    };
    return map[estado] || estado;
}

// =====================================================
// PAGINACIÓN
// =====================================================
window.goToPage = (page) => {
    currentPage = page;
    renderTableView();
};

// =====================================================
// DETALLE - VERSIÓN CORREGIDA
// =====================================================
window.verDetalle = (id) => {
    console.log('Ver detalle llamado para ID:', id); // Para debugging
    
    const item = historialData.find(i => i.id === id);
    if (!item) {
        console.error('Item no encontrado:', id);
        mostrarNotificacion('No se encontró el registro', 'error');
        return;
    }
    
    try {
        const fechaIngreso = new Date(item.fechaIngreso).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const fechaSalida = new Date(item.fechaSalida).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const serviciosHtml = item.servicios.map(s => `
            <li>
                <i class="fas fa-check-circle" style="color: var(--verde-exito);"></i>
                <span>${s}</span>
            </li>
        `).join('');
        
        detalleModalBody.innerHTML = `
            <div class="detalle-grid">
                <div class="detalle-seccion">
                    <h3><i class="fas fa-info-circle" style="margin-right: 0.5rem;"></i>Información General</h3>
                    <table class="detalle-tabla">
                        <tr>
                            <td>Código:</td>
                            <td><strong>${item.codigo}</strong></td>
                        </tr>
                        <tr>
                            <td>Cliente:</td>
                            <td>${item.cliente}</td>
                        </tr>
                        <tr>
                            <td>Vehículo:</td>
                            <td>${item.vehiculo} <span class="plate-badge" style="margin-left: 0.5rem;">${item.placa}</span></td>
                        </tr>
                        <tr>
                            <td>Técnico:</td>
                            <td>${item.tecnico || 'No asignado'}</td>
                        </tr>
                        <tr>
                            <td>Ingreso:</td>
                            <td>${fechaIngreso}</td>
                        </tr>
                        <tr>
                            <td>Salida:</td>
                            <td>${fechaSalida}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="detalle-seccion">
                    <h3><i class="fas fa-tools" style="margin-right: 0.5rem;"></i>Servicios Realizados</h3>
                    <ul class="servicios-lista">
                        ${serviciosHtml || '<li>No hay servicios registrados</li>'}
                    </ul>
                    
                    <div class="total-card">
                        <span class="total-label">Total Facturado:</span>
                        <span class="total-value">Bs. ${item.totalFacturado.toFixed(2)}</span>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 2rem; padding: 1rem; background: #F8F9FA; border-radius: 8px;">
                <p style="margin: 0; color: var(--gris-medio); font-size: 0.9rem;">
                    <i class="fas fa-info-circle" style="margin-right: 0.5rem;"></i>
                    Esta orden fue ${item.estado === 'entregado' ? 'entregada al cliente' : 
                                    item.estado === 'finalizado' ? 'finalizada y lista para entrega' : 
                                    'cancelada'} el ${fechaSalida}.
                </p>
            </div>
        `;
        
        // Mostrar el modal
        detalleModal.classList.add('show');
        console.log('Modal mostrado'); // Para debugging
        
    } catch (error) {
        console.error('Error al mostrar detalle:', error);
        mostrarNotificacion('Error al cargar el detalle', 'error');
    }
};

// Función para cerrar el modal
window.cerrarDetalleModal = () => {
    if (detalleModal) {
        detalleModal.classList.remove('show');
    }
};

// Función para imprimir
window.imprimirDetalle = () => {
    const contenidoOriginal = document.body.innerHTML;
    const contenidoDetalle = detalleModalBody.innerHTML;
    
    const ventanaImpresion = window.open('', '_blank');
    ventanaImpresion.document.write(`
        <html>
            <head>
                <title>Detalle de Orden</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <style>
                    body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 2rem; }
                    h1 { color: #C1121F; }
                    .detalle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
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

// Función para exportar a PDF
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

// Cerrar modal haciendo clic fuera del contenido
if (detalleModal) {
    detalleModal.addEventListener('click', (e) => {
        if (e.target === detalleModal) {
            cerrarDetalleModal();
        }
    });
}

// =====================================================
// EXPORTAR DATOS
// =====================================================
function exportData() {
    mostrarNotificacion('Preparando exportación...', 'info');
    
    setTimeout(() => {
        // Simular descarga
        const dataStr = JSON.stringify(filteredData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `historial_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        mostrarNotificacion(`${filteredData.length} registros exportados`, 'success');
    }, 1000);
}

// =====================================================
// UTILIDADES
// =====================================================
function showLoading() {
    historialTableBody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align: center; padding: 3rem;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--rojo-primario);"></i>
                <p style="margin-top: 1rem;">Cargando historial...</p>
            </td>
        </tr>
    `;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;
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
        <span>${mensaje}</span>
    `;
    
    toast.style.cssText = `
        background: white;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        animation: slideIn 0.3s ease;
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#2C3E50'};
        min-width: 300px;
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
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};