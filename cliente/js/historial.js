// =====================================================
// HISTORIAL.JS - CLIENTE (VERSIÓN OPTIMIZADA)
// FURIA MOTOR COMPANY SRL
// VERSIÓN CORREGIDA - USA DIRECTAMENTE window.API_BASE_URL
// SIGUE EL MISMO PATRÓN QUE COTIZACIONES.JS
// =====================================================

// =====================================================
// NOTA: API_BASE_URL ya está definida globalmente por include.js
// como window.API_BASE_URL. NO redeclarar como const aquí.
// =====================================================

// Verificar si existe la variable global, si no, crearla (fallback)
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 historial.js (Cliente) - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 historial.js (Cliente) - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

const API_URL = window.API_BASE_URL + '/api/cliente';

// Variables globales
let currentUser = null;
let serviciosData = [];
let currentPage = 1;
let totalPages = 1;
let currentChartGastos = null;
let currentChartServicios = null;
let currentChartEstado = null;

// =====================================================
// UTILIDADES
// =====================================================


function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
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
        return date.toLocaleDateString('es-BO', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        });
    } catch {
        return dateStr.split('T')[0];
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('es-BO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

function formatCurrency(amount) {
    return `Bs. ${(amount || 0).toLocaleString('es-BO', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    })}`;
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
    setTimeout(() => toast.remove(), 5000);
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
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
}

function getEstadoTexto(estado) {
    const estados = {
        'completado': 'Completado',
        'finalizado': 'Finalizado',
        'entregado': 'Entregado',
        'pendiente': 'Pendiente',
        'cancelado': 'Cancelado',
        'rechazado': 'Rechazado'
    };
    return estados[estado?.toLowerCase()] || estado || 'Pendiente';
}

function getEstadoClass(estado) {
    const estados = {
        'completado': 'status-completado',
        'finalizado': 'status-completado',
        'entregado': 'status-completado',
        'pendiente': 'status-pendiente',
        'cancelado': 'status-cancelado',
        'rechazado': 'status-cancelado'
    };
    return estados[estado?.toLowerCase()] || 'status-pendiente';
}

function getDocumentoIcon(tipo) {
    const iconos = {
        'cotizacion': 'fa-file-invoice-dollar',
        'factura': 'fa-file-invoice',
        'orden': 'fa-clipboard-list',
        'informe': 'fa-file-alt'
    };
    return iconos[tipo] || 'fa-file-alt';
}

// =====================================================
// CARGA DE VEHÍCULOS
// =====================================================

async function cargarVehiculos() {
    const container = document.getElementById('vehiculosList');
    if (!container) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/mis-vehiculos`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = window.API_BASE_URL + '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.vehiculos) {
            renderizarVehiculos(data.vehiculos);
        } else {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-car"></i>
                <p>No tienes vehículos registrados</p>
                <small>Registra un vehículo en "Mis Vehículos"</small>
            </div>`;
        }
    } catch (error) {
        console.error('Error cargando vehículos:', error);
        container.innerHTML = `<div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error al cargar vehículos</p>
            <button onclick="cargarVehiculos()" class="btn-secondary">Reintentar</button>
        </div>`;
    } finally {
        mostrarLoading(false);
    }
}

function renderizarVehiculos(vehiculos) {
    const container = document.getElementById('vehiculosList');
    if (!container) return;
    
    if (!vehiculos || vehiculos.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <i class="fas fa-car"></i>
            <p>No tienes vehículos registrados</p>
        </div>`;
        return;
    }
    
    container.innerHTML = vehiculos.map(vehiculo => {
        const servicios = vehiculo.servicios_recientes || [];
        const totalServicios = vehiculo.total_servicios || 0;
        const ultimoServicio = vehiculo.ultimo_servicio;
        
        return `
            <div class="vehiculo-card-historial" onclick="verServiciosVehiculo(${vehiculo.id})">
                <div class="vehiculo-header-historial">
                    <div class="vehiculo-placa-historial">
                        <i class="fas fa-car"></i>
                        <span>${escapeHtml(vehiculo.placa)}</span>
                    </div>
                    <div class="vehiculo-modelo">${escapeHtml(vehiculo.marca || '')} ${escapeHtml(vehiculo.modelo || '')}</div>
                </div>
                <div class="vehiculo-body-historial">
                    <div class="vehiculo-stats">
                        <div class="stat">
                            <span class="stat-value">${totalServicios}</span>
                            <span class="stat-label">Servicios</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">${ultimoServicio ? formatDate(ultimoServicio) : '-'}</span>
                            <span class="stat-label">Último servicio</span>
                        </div>
                    </div>
                    ${servicios.length > 0 ? `
                        <div class="vehiculo-servicios">
                            <h4>Últimos servicios:</h4>
                            ${servicios.slice(0, 3).map(s => `
                                <div class="servicio-breve">
                                    <span class="servicio-fecha">${formatDate(s.fecha_ingreso || s.fecha)}</span>
                                    <span class="servicio-estado ${getEstadoClass(s.estado)}">${getEstadoTexto(s.estado)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn-ver-todos" onclick="event.stopPropagation(); verServiciosVehiculo(${vehiculo.id})">
                            <i class="fas fa-history"></i> Ver historial completo
                        </button>
                    ` : `
                        <div class="empty-state small">
                            <p>Sin servicios registrados</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// CARGA DE SERVICIOS
// =====================================================

async function cargarServicios(page = 1) {
    const container = document.getElementById('serviciosList');
    if (!container) return;
    
    mostrarLoading(true);
    currentPage = page;
    
    const search = document.getElementById('searchServicio')?.value || '';
    const anio = document.getElementById('filtroAnio')?.value || 'all';
    
    try {
        let url = `${API_URL}/historial-servicios?page=${page}&limit=10`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (anio !== 'all') url += `&anio=${anio}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = window.API_BASE_URL + '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            serviciosData = data.servicios || [];
            totalPages = data.pagination?.total_pages || 1;
            renderizarServicios(serviciosData);
            renderizarPaginacion();
            actualizarFiltroAnios(data.anios_disponibles || []);
        } else {
            container.innerHTML = `<tr><td colspan="7" class="empty-state">
                <i class="fas fa-tools"></i>
                <p>No hay servicios registrados</p>
            </td></tr>`;
        }
    } catch (error) {
        console.error('Error cargando servicios:', error);
        container.innerHTML = `<tr><td colspan="7" class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error al cargar servicios</p>
            <button onclick="cargarServicios()" class="btn-secondary">Reintentar</button>
        </td></tr>`;
    } finally {
        mostrarLoading(false);
    }
}

function renderizarServicios(servicios) {
    const container = document.getElementById('serviciosList');
    if (!container) return;
    
    if (!servicios || servicios.length === 0) {
        container.innerHTML = `<tr><td colspan="7" class="empty-state">
            <i class="fas fa-tools"></i>
            <p>No hay servicios registrados</p>
        </td></tr>`;
        return;
    }
    
    container.innerHTML = servicios.map(servicio => `
        <tr onclick="verDetalleServicio(${servicio.id})" style="cursor: pointer;">
            <td>${formatDate(servicio.fecha_ingreso || servicio.fecha)}</td>
            <td><strong>${escapeHtml(servicio.codigo_unico || servicio.numero_orden || 'N/A')}</strong></td>
            <td>${escapeHtml(servicio.vehiculo_placa || servicio.placa || '-')}</td>
            <td>${escapeHtml(servicio.servicios_realizados || servicio.descripcion || '-')}</td>
            <td>${formatCurrency(servicio.monto_total || servicio.costo_total || 0)}</td>
            <td><span class="status-badge ${getEstadoClass(servicio.estado)}">${getEstadoTexto(servicio.estado)}</span></td>
            <td>
                <button class="action-btn" onclick="event.stopPropagation(); verDetalleServicio(${servicio.id})" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                ${servicio.documento_url ? `
                    <button class="action-btn" onclick="event.stopPropagation(); verDocumento('${servicio.documento_url}', '${escapeHtml(servicio.codigo_unico)}')" title="Ver documento">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function renderizarPaginacion() {
    const container = document.getElementById('paginationServicios');
    if (!container) return;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    html += `<button class="page-btn" onclick="cambiarPagina(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <i class="fas fa-chevron-left"></i>
    </button>`;
    
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="cambiarPagina(${i})">${i}</button>`;
    }
    
    html += `<button class="page-btn" onclick="cambiarPagina(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        <i class="fas fa-chevron-right"></i>
    </button>`;
    
    container.innerHTML = html;
}

function cambiarPagina(page) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    cargarServicios(page);
}

function actualizarFiltroAnios(anios) {
    const select = document.getElementById('filtroAnio');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="all">Todos los años</option>';
    
    anios.forEach(anio => {
        select.innerHTML += `<option value="${anio}">${anio}</option>`;
    });
    
    if (currentValue !== 'all' && anios.includes(parseInt(currentValue))) {
        select.value = currentValue;
    }
}

// =====================================================
// CARGA DE ESTADÍSTICAS
// =====================================================

async function cargarEstadisticas() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/estadisticas-cliente`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = window.API_BASE_URL + '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalServicios').textContent = data.total_servicios || 0;
            document.getElementById('totalGastado').textContent = formatCurrency(data.total_gastado || 0);
            document.getElementById('totalVehiculos').textContent = data.total_vehiculos || 0;
            const promedio = data.total_servicios > 0 ? (data.total_gastado / data.total_servicios) : 0;
            document.getElementById('promedioServicio').textContent = formatCurrency(promedio);
            
            renderizarGraficoGastos(data.gastos_por_mes || []);
            renderizarGraficoServiciosVehiculo(data.servicios_por_vehiculo || []);
            renderizarGraficoEstado(data.estados_distribucion || []);
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        showToast('Error al cargar estadísticas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarGraficoGastos(gastosPorMes) {
    const canvas = document.getElementById('gastosChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (currentChartGastos) currentChartGastos.destroy();
    
    currentChartGastos = new Chart(ctx, {
        type: 'line',
        data: {
            labels: gastosPorMes.map(g => g.mes),
            datasets: [{
                label: 'Gastos (Bs.)',
                data: gastosPorMes.map(g => g.total),
                borderColor: '#C1121F',
                backgroundColor: 'rgba(193, 18, 31, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } }
        }
    });
}

function renderizarGraficoServiciosVehiculo(serviciosPorVehiculo) {
    const canvas = document.getElementById('serviciosVehiculoChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (currentChartServicios) currentChartServicios.destroy();
    
    currentChartServicios = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: serviciosPorVehiculo.map(v => v.placa || `Vehículo ${v.id}`),
            datasets: [{
                label: 'Número de servicios',
                data: serviciosPorVehiculo.map(v => v.total_servicios),
                backgroundColor: '#C1121F',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } }
        }
    });
}

function renderizarGraficoEstado(estadosDistribucion) {
    const canvas = document.getElementById('estadoChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (currentChartEstado) currentChartEstado.destroy();
    
    const colores = ['#10B981', '#F59E0B', '#C1121F', '#8B5CF6'];
    
    currentChartEstado = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: estadosDistribucion.map(e => getEstadoTexto(e.estado)),
            datasets: [{
                data: estadosDistribucion.map(e => e.cantidad),
                backgroundColor: colores,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// =====================================================
// CARGA DE DOCUMENTOS
// =====================================================

async function cargarDocumentos() {
    const container = document.getElementById('documentosList');
    if (!container) return;
    
    mostrarLoading(true);
    
    const search = document.getElementById('searchDocumento')?.value || '';
    const tipo = document.getElementById('filtroTipoDocumento')?.value || 'all';
    
    try {
        let url = `${API_URL}/documentos-cliente`;
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (tipo !== 'all') params.append('tipo', tipo);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = window.API_BASE_URL + '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.documentos) {
            renderizarDocumentos(data.documentos);
        } else {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-file-alt"></i>
                <p>No hay documentos disponibles</p>
            </div>`;
        }
    } catch (error) {
        console.error('Error cargando documentos:', error);
        container.innerHTML = `<div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error al cargar documentos</p>
            <button onclick="cargarDocumentos()" class="btn-secondary">Reintentar</button>
        </div>`;
    } finally {
        mostrarLoading(false);
    }
}

function renderizarDocumentos(documentos) {
    const container = document.getElementById('documentosList');
    if (!container) return;
    
    if (!documentos || documentos.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <i class="fas fa-file-alt"></i>
            <p>No hay documentos disponibles</p>
        </div>`;
        return;
    }
    
    container.innerHTML = documentos.map(doc => `
        <div class="documento-item">
            <div class="documento-info">
                <div class="documento-icon">
                    <i class="fas ${getDocumentoIcon(doc.tipo)}"></i>
                </div>
                <div class="documento-details">
                    <h4>${escapeHtml(doc.titulo || doc.nombre || 'Documento')}</h4>
                    <p>${escapeHtml(doc.descripcion || '')}</p>
                </div>
            </div>
            <div class="documento-fecha">
                <i class="far fa-calendar-alt"></i>
                <span>${formatDate(doc.fecha_creacion || doc.fecha)}</span>
            </div>
            <div class="documento-actions">
                <button class="btn-documento" onclick="verDocumento('${doc.url}', '${escapeHtml(doc.titulo)}')">
                    <i class="fas fa-eye"></i> Ver
                </button>
                <button class="btn-documento" onclick="descargarDocumento('${doc.url}', '${escapeHtml(doc.titulo)}')">
                    <i class="fas fa-download"></i> Descargar
                </button>
            </div>
        </div>
    `).join('');
}

// =====================================================
// FUNCIONES GLOBALES
// =====================================================

window.verDetalleServicio = async function(servicioId) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/servicio/${servicioId}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success && data.servicio) {
            const servicio = data.servicio;
            const modalBody = document.getElementById('modalDetalleServicioBody');
            
            modalBody.innerHTML = `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-info-circle"></i> Información General</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Orden de Trabajo</span>
                            <span class="detalle-value">${escapeHtml(servicio.codigo_unico || 'N/A')}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Fecha de Ingreso</span>
                            <span class="detalle-value">${formatDate(servicio.fecha_ingreso)}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Vehículo</span>
                            <span class="detalle-value">${escapeHtml(servicio.vehiculo_placa || '-')}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Estado</span>
                            <span class="detalle-value"><span class="status-badge ${getEstadoClass(servicio.estado)}">${getEstadoTexto(servicio.estado)}</span></span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Monto Total</span>
                            <span class="detalle-value">${formatCurrency(servicio.monto_total)}</span>
                        </div>
                    </div>
                </div>
                ${servicio.descripcion ? `
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-stethoscope"></i> Descripción</h4>
                        <div class="detalle-descripcion">${escapeHtml(servicio.descripcion)}</div>
                    </div>
                ` : ''}
            `;
            
            abrirModal('modalDetalleServicio');
        } else {
            showToast('No se pudo cargar el detalle', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
};

window.verDocumento = function(url, titulo) {
    const modalBody = document.getElementById('modalDocumentoBody');
    const modalTitulo = document.getElementById('modalDocumentoTitulo');
    
    if (modalTitulo) modalTitulo.innerHTML = `<i class="fas fa-file-alt"></i> ${escapeHtml(titulo)}`;
    modalBody.innerHTML = `<iframe src="${url}" style="width: 100%; height: 60vh; border: none;"></iframe>`;
    abrirModal('modalDocumento');
};

window.descargarDocumento = function(url, nombre) {
    const link = document.createElement('a');
    link.href = url;
    link.download = nombre || 'documento';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.imprimirDetalle = function() {
    window.print();
};

window.imprimirDocumento = function() {
    const iframe = document.querySelector('#modalDocumentoBody iframe');
    if (iframe && iframe.src) {
        window.open(iframe.src, '_blank');
    }
};

window.verServiciosVehiculo = function(vehiculoId) {
    const tabServicios = document.querySelector('.tab-btn-historial[data-tab="servicios"]');
    if (tabServicios) tabServicios.click();
    
    const searchInput = document.getElementById('searchServicio');
    if (searchInput) {
        searchInput.value = `vehiculo_id:${vehiculoId}`;
        cargarServicios(1);
    }
};

window.exportarServicios = async function() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/exportar-servicios`, {
            headers: getAuthHeaders()
        });
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `historial_servicios_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('Exportación completada', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al exportar', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// AUTENTICACIÓN Y EVENTOS
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = window.API_BASE_URL + '/';
            return null;
        }
        
        const response = await fetch(`${API_URL}/perfil`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = window.API_BASE_URL + '/';
            return null;
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.usuario;
            
            const fechaElement = document.getElementById('currentDate');
            if (fechaElement) {
                const hoy = new Date();
                fechaElement.textContent = hoy.toLocaleDateString('es-ES', { 
                    year: 'numeric', month: 'long', day: 'numeric' 
                });
            }
            return currentUser;
        }
        return null;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab-btn-historial').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn-historial').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-historial').forEach(tab => tab.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            if (tabId === 'vehiculos') cargarVehiculos();
            if (tabId === 'servicios') cargarServicios(1);
            if (tabId === 'estadisticas') cargarEstadisticas();
            if (tabId === 'documentos') cargarDocumentos();
        });
    });
    
    // Filtros
    const searchServicio = document.getElementById('searchServicio');
    if (searchServicio) {
        let timeout;
        searchServicio.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => cargarServicios(1), 500);
        });
    }
    
    const filtroAnio = document.getElementById('filtroAnio');
    if (filtroAnio) filtroAnio.addEventListener('change', () => cargarServicios(1));
    
    const refreshServicios = document.getElementById('refreshServicios');
    if (refreshServicios) refreshServicios.addEventListener('click', () => cargarServicios(1));
    
    const exportarBtn = document.getElementById('exportarServicios');
    if (exportarBtn) exportarBtn.addEventListener('click', () => window.exportarServicios());
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

async function inicializar() {
    console.log('🚀 Inicializando historial.js (Cliente)');
    console.log('📡 API_URL:', API_URL);
    
    mostrarLoading(true);
    
    try {
        const user = await cargarUsuarioActual();
        if (!user) return;
        
        setupEventListeners();
        
        // Cargar pestaña activa
        const activeTab = document.querySelector('.tab-btn-historial.active');
        if (activeTab) {
            const tabId = activeTab.getAttribute('data-tab');
            if (tabId === 'vehiculos') cargarVehiculos();
            if (tabId === 'servicios') cargarServicios(1);
            if (tabId === 'estadisticas') cargarEstadisticas();
            if (tabId === 'documentos') cargarDocumentos();
        } else {
            cargarVehiculos();
        }
        
        console.log('✅ historial.js inicializado correctamente');
    } catch (error) {
        console.error('Error en inicialización:', error);
    } finally {
        mostrarLoading(false);
    }
}

// Exponer funciones globales
window.cargarVehiculos = cargarVehiculos;
window.cargarServicios = cargarServicios;
window.cambiarPagina = cambiarPagina;
window.verServiciosVehiculo = verServiciosVehiculo;
window.exportarServicios = window.exportarServicios;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);