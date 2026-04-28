// =====================================================
// HISTORIAL-CLIENTE.JS - CLIENTE
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/cliente';
let currentUser = null;
let currentTab = 'vehiculos';
let serviciosPage = 1;
let serviciosTotalPages = 1;
let currentServicioDetalle = null;

// Gráficos
let gastosChart = null;
let serviciosVehiculoChart = null;
let estadoChart = null;

// =====================================================
// FUNCIONES DE UTILIDAD
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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('es-BO');
    } catch {
        return dateStr;
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
    
    setTimeout(() => toast.remove(), 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

function getEstadoTexto(estado) {
    const estados = {
        'Finalizado': 'Completado',
        'Entregado': 'Entregado',
        'EnReparacion': 'En Reparación',
        'CotizacionEnviada': 'Cotización Enviada'
    };
    return estados[estado] || estado;
}

// =====================================================
// CARGA DE DATOS - VEHÍCULOS
// =====================================================

async function cargarVehiculos() {
    mostrarLoading(true);
    try {
        const search = document.getElementById('searchVehiculo')?.value.toLowerCase() || '';
        
        const response = await fetch(`${API_URL}/vehiculos-historial`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            let vehiculosList = data.vehiculos || [];
            
            if (search) {
                vehiculosList = vehiculosList.filter(v => 
                    (v.placa || '').toLowerCase().includes(search) ||
                    (v.modelo || '').toLowerCase().includes(search)
                );
            }
            
            renderizarVehiculos(vehiculosList);
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarVehiculos(vehiculos) {
    const container = document.getElementById('vehiculosList');
    if (!container) return;
    
    if (vehiculos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-car"></i>
                <p>No tienes vehículos registrados</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = vehiculos.map(v => `
        <div class="vehiculo-card-historial">
            <div class="vehiculo-header-historial">
                <div class="vehiculo-placa-historial">
                    <i class="fas fa-car"></i>
                    ${escapeHtml(v.placa)}
                </div>
                <div class="vehiculo-stats">
                    <div class="stat">
                        <span class="stat-value">${v.total_servicios}</span>
                        <span class="stat-label">Servicios</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${formatCurrency(v.total_gastado)}</span>
                        <span class="stat-label">Gastado</span>
                    </div>
                </div>
            </div>
            <div class="vehiculo-body-historial">
                <div class="info-item">
                    <i class="fas fa-tag"></i>
                    <span>${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-calendar"></i>
                    <span>Año: ${v.anio || 'N/A'}</span>
                </div>
                
                <div class="vehiculo-servicios">
                    <strong>Últimos servicios:</strong>
                    ${v.ultimos_servicios.map(s => `
                        <div class="servicio-breve">
                            <span class="servicio-fecha">${formatDate(s.fecha)}</span>
                            <span class="servicio-estado status-${s.estado === 'Finalizado' ? 'completado' : 'pendiente'}">${getEstadoTexto(s.estado)}</span>
                        </div>
                    `).join('')}
                </div>
                
                <button class="btn-ver-todos" onclick="verServiciosVehiculo(${v.id})">
                    <i class="fas fa-list"></i> Ver todos los servicios
                </button>
            </div>
        </div>
    `).join('');
}

// =====================================================
// CARGA DE DATOS - SERVICIOS
// =====================================================

async function cargarServicios(page = 1) {
    mostrarLoading(true);
    try {
        const search = document.getElementById('searchServicio')?.value.toLowerCase() || '';
        const anio = document.getElementById('filtroAnio')?.value || 'all';
        
        let url = `${API_URL}/servicios-historial?page=${page}&limit=10`;
        if (anio !== 'all') url += `&anio=${anio}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let serviciosList = data.servicios || [];
            
            if (search) {
                serviciosList = serviciosList.filter(s => 
                    (s.codigo_orden || '').toLowerCase().includes(search) ||
                    (s.placa || '').toLowerCase().includes(search) ||
                    (s.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            serviciosPage = data.pagination?.current_page || 1;
            serviciosTotalPages = data.pagination?.total_pages || 1;
            
            renderizarServicios(serviciosList);
            renderizarPaginacionServicios();
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarServicios(servicios) {
    const tbody = document.getElementById('serviciosList');
    if (!tbody) return;
    
    if (servicios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-inbox"></i>
                    <p>No hay servicios registrados</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = servicios.map(s => `
        <tr>
            <td>${formatDate(s.fecha)}</td>
            <td><strong>${escapeHtml(s.codigo_orden)}</strong></td>
            <td>${escapeHtml(s.vehiculo)}</td>
            <td>${s.servicios_count} servicio(s)</td>
            <td>${formatCurrency(s.monto_total)}</td>
            <td><span class="status-badge status-${s.estado === 'Finalizado' ? 'completado' : 'pendiente'}">${getEstadoTexto(s.estado)}</span></td>
            <td>
                <button class="action-btn" onclick="verDetalleServicio(${s.orden_id})" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn" onclick="verDocumento('orden', ${s.orden_id})" title="Ver orden">
                    <i class="fas fa-file-alt"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderizarPaginacionServicios() {
    const container = document.getElementById('paginationServicios');
    if (!container) return;
    
    if (serviciosTotalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    for (let i = 1; i <= serviciosTotalPages; i++) {
        html += `
            <button class="page-btn ${i === serviciosPage ? 'active' : ''}" onclick="cambiarPaginaServicios(${i})">
                ${i}
            </button>
        `;
    }
    container.innerHTML = html;
}

function cambiarPaginaServicios(page) {
    serviciosPage = page;
    cargarServicios(page);
}

// =====================================================
// CARGA DE DATOS - ESTADÍSTICAS
// =====================================================

async function cargarEstadisticas() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/estadisticas-cliente`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            const stats = data.stats;
            
            document.getElementById('totalServicios').textContent = stats.total_servicios || 0;
            document.getElementById('totalGastado').textContent = formatCurrency(stats.total_gastado);
            document.getElementById('totalVehiculos').textContent = stats.total_vehiculos || 0;
            document.getElementById('promedioServicio').textContent = formatCurrency(stats.promedio_servicio);
            
            renderGastosChart(stats.gastos_por_mes || []);
            renderServiciosVehiculoChart(stats.servicios_por_vehiculo || []);
            renderEstadoChart(stats.estados || {});
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        mostrarLoading(false);
    }
}

function renderGastosChart(data) {
    const canvas = document.getElementById('gastosChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const meses = data.map(d => d.mes);
    const montos = data.map(d => d.monto);
    
    if (gastosChart) gastosChart.destroy();
    
    gastosChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: meses,
            datasets: [{
                label: 'Gastos',
                data: montos,
                borderColor: '#C1121F',
                backgroundColor: 'rgba(193, 18, 31, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#8E8E93' } },
                tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#2C2C2E' }, ticks: { color: '#8E8E93', callback: (v) => formatCurrency(v) } },
                x: { grid: { color: '#2C2C2E' }, ticks: { color: '#8E8E93' } }
            }
        }
    });
}

function renderServiciosVehiculoChart(data) {
    const canvas = document.getElementById('serviciosVehiculoChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const labels = data.map(d => d.placa);
    const counts = data.map(d => d.total);
    
    if (serviciosVehiculoChart) serviciosVehiculoChart.destroy();
    
    serviciosVehiculoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Número de servicios',
                data: counts,
                backgroundColor: '#C1121F',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { labels: { color: '#8E8E93' } } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#2C2C2E' }, ticks: { color: '#8E8E93', stepSize: 1 } },
                x: { grid: { color: '#2C2C2E' }, ticks: { color: '#8E8E93' } }
            }
        }
    });
}

function renderEstadoChart(estados) {
    const canvas = document.getElementById('estadoChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(estados);
    const values = Object.values(estados);
    const colores = {
        'Finalizado': '#10B981',
        'Entregado': '#10B981',
        'EnReparacion': '#F59E0B',
        'CotizacionEnviada': '#3B82F6'
    };
    
    const backgroundColors = labels.map(l => colores[l] || '#6B7280');
    
    if (estadoChart) estadoChart.destroy();
    
    estadoChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.map(l => getEstadoTexto(l)),
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { position: 'bottom', labels: { color: '#8E8E93' } } }
        }
    });
}

// =====================================================
// CARGA DE DATOS - DOCUMENTOS
// =====================================================

async function cargarDocumentos() {
    mostrarLoading(true);
    try {
        const search = document.getElementById('searchDocumento')?.value.toLowerCase() || '';
        const tipo = document.getElementById('filtroTipoDocumento')?.value || 'all';
        
        let url = `${API_URL}/documentos-cliente`;
        if (tipo !== 'all') url += `?tipo=${tipo}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let documentosList = data.documentos || [];
            
            if (search) {
                documentosList = documentosList.filter(d => 
                    (d.titulo || '').toLowerCase().includes(search) ||
                    (d.codigo || '').toLowerCase().includes(search)
                );
            }
            
            renderizarDocumentos(documentosList);
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        mostrarLoading(false);
    }
}

function renderizarDocumentos(documentos) {
    const container = document.getElementById('documentosList');
    if (!container) return;
    
    if (documentos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-alt"></i>
                <p>No hay documentos disponibles</p>
            </div>
        `;
        return;
    }
    
    const iconos = {
        'cotizacion': 'fa-file-invoice-dollar',
        'factura': 'fa-file-invoice',
        'orden': 'fa-clipboard-list'
    };
    
    container.innerHTML = documentos.map(d => `
        <div class="documento-item">
            <div class="documento-info">
                <div class="documento-icon">
                    <i class="fas ${iconos[d.tipo] || 'fa-file-alt'}"></i>
                </div>
                <div class="documento-details">
                    <h4>${escapeHtml(d.titulo)}</h4>
                    <p>${escapeHtml(d.codigo || '')}</p>
                </div>
            </div>
            <div class="documento-fecha">
                <i class="far fa-calendar-alt"></i> ${formatDate(d.fecha)}
            </div>
            <div class="documento-actions">
                <button class="btn-documento" onclick="verDocumento('${d.tipo}', ${d.id})">
                    <i class="fas fa-eye"></i> Ver
                </button>
                <button class="btn-documento" onclick="descargarDocumentoDirecto('${d.tipo}', ${d.id})">
                    <i class="fas fa-download"></i> Descargar
                </button>
            </div>
        </div>
    `).join('');
}

// =====================================================
// DETALLE DE SERVICIO
// =====================================================

async function verDetalleServicio(ordenId) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-servicio/${ordenId}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentServicioDetalle = data.servicio;
            mostrarDetalleServicio(data.servicio);
        } else {
            showToast(data.error || 'Error al cargar detalle', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarDetalleServicio(servicio) {
    const modalBody = document.getElementById('modalDetalleServicioBody');
    modalBody.innerHTML = `
        <div class="detalle-seccion">
            <h4><i class="fas fa-info-circle"></i> Información General</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Orden de Trabajo</span>
                    <span class="detalle-value"><strong>${escapeHtml(servicio.codigo_orden)}</strong></span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Fecha</span>
                    <span class="detalle-value">${formatDateTime(servicio.fecha)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Estado</span>
                    <span class="detalle-value">${getEstadoTexto(servicio.estado)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Monto Total</span>
                    <span class="detalle-value total-monto">${formatCurrency(servicio.monto_total)}</span>
                </div>
            </div>
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-car"></i> Información del Vehículo</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Placa</span>
                    <span class="detalle-value">${escapeHtml(servicio.placa)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Vehículo</span>
                    <span class="detalle-value">${escapeHtml(servicio.vehiculo)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Kilometraje</span>
                    <span class="detalle-value">${servicio.kilometraje?.toLocaleString() || '0'} km</span>
                </div>
            </div>
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-tools"></i> Servicios Realizados</h4>
            <div class="servicios-lista">
                ${servicio.servicios.map(s => `
                    <div class="servicio-cotizacion-item">
                        <div class="servicio-info">
                            <div class="servicio-descripcion">${escapeHtml(s.descripcion)}</div>
                            <div class="servicio-precio">${formatCurrency(s.precio)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="total-general">
                <strong>Total:</strong> ${formatCurrency(servicio.monto_total)}
            </div>
        </div>
        
        ${servicio.descripcion_problema ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-pencil-alt"></i> Descripción del Problema</h4>
                <div class="detalle-descripcion">
                    ${escapeHtml(servicio.descripcion_problema)}
                </div>
            </div>
        ` : ''}
        
        ${servicio.trabajos_realizados ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-check-circle"></i> Trabajos Realizados</h4>
                <div class="detalle-descripcion">
                    ${escapeHtml(servicio.trabajos_realizados)}
                </div>
            </div>
        ` : ''}
    `;
    
    abrirModal('modalDetalleServicio');
}

function imprimirDetalle() {
    const modalContent = document.getElementById('modalDetalleServicioBody');
    if (!modalContent) return;
    
    const contenido = modalContent.innerHTML;
    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
            <head>
                <title>Detalle de Servicio</title>
                <style>
                    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 0; padding: 20px; }
                    .detalle-seccion { margin-bottom: 20px; }
                    .detalle-seccion h4 { color: #C1121F; border-bottom: 2px solid #C1121F; padding-bottom: 5px; }
                    .detalle-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
                    .detalle-label { font-size: 0.7rem; text-transform: uppercase; color: #666; }
                    .detalle-value { font-weight: 500; }
                    .total-monto { color: #10B981; font-size: 1.2rem; }
                    .servicio-cotizacion-item { background: #f5f5f5; padding: 10px; margin-bottom: 5px; border-radius: 5px; }
                    .servicio-info { display: flex; justify-content: space-between; }
                    .total-general { text-align: right; margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd; }
                </style>
            </head>
            <body>${contenido}</body>
        </html>
    `);
    ventana.document.close();
    ventana.print();
    cerrarModal('modalDetalleServicio');
}

// =====================================================
// DOCUMENTOS
// =====================================================

async function verDocumento(tipo, id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/documento/${tipo}/${id}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            const modalBody = document.getElementById('modalDocumentoBody');
            const modalTitulo = document.getElementById('modalDocumentoTitulo');
            
            modalTitulo.innerHTML = `<i class="fas ${tipo === 'cotizacion' ? 'fa-file-invoice-dollar' : tipo === 'factura' ? 'fa-file-invoice' : 'fa-clipboard-list'}"></i> ${data.documento.titulo}`;
            
            modalBody.innerHTML = data.documento.html;
            abrirModal('modalDocumento');
        } else {
            showToast(data.error || 'Error al cargar documento', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function imprimirDocumento() {
    const modalContent = document.getElementById('modalDocumentoBody');
    if (!modalContent) return;
    
    const contenido = modalContent.innerHTML;
    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
            <head>
                <title>Documento FURIA MOTOR</title>
                <style>
                    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 0; padding: 20px; }
                    @media print { body { margin: 0; padding: 0; } }
                </style>
            </head>
            <body>${contenido}</body>
        </html>
    `);
    ventana.document.close();
    ventana.print();
}

function descargarDocumento() {
    showToast('Funcionalidad en desarrollo', 'info');
}

function descargarDocumentoDirecto(tipo, id) {
    window.open(`${API_URL}/documento/${tipo}/${id}/download?token=${localStorage.getItem('furia_token')}`, '_blank');
}

// =====================================================
// UTILIDADES ADICIONALES
// =====================================================

async function verServiciosVehiculo(vehiculoId) {
    // Cambiar a pestaña de servicios y filtrar por vehículo
    document.querySelector('.tab-btn-historial[data-tab="servicios"]').click();
    // Aquí se podría implementar filtro por vehículo
}

function exportarServicios() {
    window.open(`${API_URL}/exportar-servicios?token=${localStorage.getItem('furia_token')}`, '_blank');
}

async function cargarAniosFiltro() {
    try {
        const response = await fetch(`${API_URL}/anios-servicios`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('filtroAnio');
            select.innerHTML = '<option value="all">Todos los años</option>' +
                data.anios.map(a => `<option value="${a}">${a}</option>`).join('');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = '/';
            return null;
        }
        
        const response = await fetch(`${API_URL}/perfil`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return null;
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.usuario;
            
            const fechaElement = document.getElementById('currentDate');
            if (fechaElement) {
                const hoy = new Date();
                fechaElement.textContent = hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
            }
            
            return currentUser;
        }
        return null;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = '/';
        return null;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    // Pestañas
    const tabBtns = document.querySelectorAll('.tab-btn-historial');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const tabId = btn.getAttribute('data-tab');
            currentTab = tabId;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-historial').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            if (tabId === 'vehiculos') await cargarVehiculos();
            else if (tabId === 'servicios') await cargarServicios();
            else if (tabId === 'estadisticas') await cargarEstadisticas();
            else if (tabId === 'documentos') await cargarDocumentos();
        });
    });
    
    // Botones de refresh
    const refreshVehiculos = document.getElementById('refreshVehiculos');
    if (refreshVehiculos) refreshVehiculos.addEventListener('click', cargarVehiculos);
    
    const refreshServicios = document.getElementById('refreshServicios');
    if (refreshServicios) refreshServicios.addEventListener('click', () => cargarServicios(1));
    
    const refreshDocumentos = document.getElementById('refreshDocumentos');
    if (refreshDocumentos) refreshDocumentos.addEventListener('click', cargarDocumentos);
    
    // Exportar servicios
    const exportarBtn = document.getElementById('exportarServicios');
    if (exportarBtn) exportarBtn.addEventListener('click', exportarServicios);
    
    // Filtros
    const searchVehiculo = document.getElementById('searchVehiculo');
    if (searchVehiculo) searchVehiculo.addEventListener('input', cargarVehiculos);
    
    const searchServicio = document.getElementById('searchServicio');
    if (searchServicio) searchServicio.addEventListener('input', () => cargarServicios(1));
    
    const filtroAnio = document.getElementById('filtroAnio');
    if (filtroAnio) filtroAnio.addEventListener('change', () => cargarServicios(1));
    
    const searchDocumento = document.getElementById('searchDocumento');
    if (searchDocumento) searchDocumento.addEventListener('input', cargarDocumentos);
    
    const filtroTipoDocumento = document.getElementById('filtroTipoDocumento');
    if (filtroTipoDocumento) filtroTipoDocumento.addEventListener('change', cargarDocumentos);
    
    // Cerrar modales
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando historial-cliente.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarVehiculos();
    await cargarAniosFiltro();
    setupEventListeners();
    
    console.log('✅ historial-cliente.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalleServicio = verDetalleServicio;
window.verDocumento = verDocumento;
window.verServiciosVehiculo = verServiciosVehiculo;
window.cambiarPaginaServicios = cambiarPaginaServicios;
window.imprimirDetalle = imprimirDetalle;
window.imprimirDocumento = imprimirDocumento;
window.descargarDocumento = descargarDocumento;
window.descargarDocumentoDirecto = descargarDocumentoDirecto;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);