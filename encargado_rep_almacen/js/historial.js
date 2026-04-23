// =====================================================
// HISTORIAL.JS - ENCARGADO DE REPUESTOS
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/encargado-repuestos';
let currentUser = null;
let currentTab = 'cotizaciones';

// Datos para gráficos
let movimientosChart = null;
let estadoChart = null;

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

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('es-BO');
    } catch {
        return dateStr;
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

function statusBadge(estado) {
    const map = {
        'pendiente': 'status-pendiente',
        'cotizado': 'status-cotizado',
        'aprobado': 'status-aprobado',
        'comprado': 'status-comprado',
        'entregado': 'status-entregado'
    };
    
    const texto = {
        'pendiente': 'Pendiente',
        'cotizado': 'Cotizado',
        'aprobado': 'Aprobado',
        'comprado': 'Comprado',
        'entregado': 'Entregado'
    };
    
    const iconos = {
        'pendiente': 'fa-clock',
        'cotizado': 'fa-check-circle',
        'aprobado': 'fa-check-double',
        'comprado': 'fa-shopping-cart',
        'entregado': 'fa-truck'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${iconos[estado] || 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarCotizaciones() {
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const fechaInicio = document.getElementById('fechaInicio')?.value;
        const fechaFin = document.getElementById('fechaFin')?.value;
        
        let url = `${API_URL}/historial/cotizaciones`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (fechaInicio) params.append('fecha_inicio', fechaInicio);
        if (fechaFin) params.append('fecha_fin', fechaFin);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let cotizaciones = data.cotizaciones || [];
            
            if (search) {
                cotizaciones = cotizaciones.filter(c => 
                    (c.orden_codigo || '').toLowerCase().includes(search) ||
                    (c.repuesto || '').toLowerCase().includes(search) ||
                    (c.proveedor || '').toLowerCase().includes(search)
                );
            }
            
            renderTablaCotizaciones(cotizaciones);
        }
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
    }
}

async function cargarCompras() {
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const fechaInicio = document.getElementById('fechaInicio')?.value;
        const fechaFin = document.getElementById('fechaFin')?.value;
        
        let url = `${API_URL}/historial/compras`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (fechaInicio) params.append('fecha_inicio', fechaInicio);
        if (fechaFin) params.append('fecha_fin', fechaFin);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let compras = data.compras || [];
            
            if (search) {
                compras = compras.filter(c => 
                    (c.orden_codigo || '').toLowerCase().includes(search) ||
                    (c.repuesto || '').toLowerCase().includes(search) ||
                    (c.proveedor || '').toLowerCase().includes(search)
                );
            }
            
            renderTablaCompras(compras);
        }
    } catch (error) {
        console.error('Error cargando compras:', error);
    }
}

async function cargarEntregas() {
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const fechaInicio = document.getElementById('fechaInicio')?.value;
        const fechaFin = document.getElementById('fechaFin')?.value;
        
        let url = `${API_URL}/historial/entregas`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (fechaInicio) params.append('fecha_inicio', fechaInicio);
        if (fechaFin) params.append('fecha_fin', fechaFin);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let entregas = data.entregas || [];
            
            if (search) {
                entregas = entregas.filter(e => 
                    (e.orden_codigo || '').toLowerCase().includes(search) ||
                    (e.repuesto || '').toLowerCase().includes(search) ||
                    (e.destinatario || '').toLowerCase().includes(search)
                );
            }
            
            renderTablaEntregas(entregas);
        }
    } catch (error) {
        console.error('Error cargando entregas:', error);
    }
}

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_URL}/historial/estadisticas`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            const stats = data.stats;
            
            document.getElementById('totalCotizaciones').textContent = stats.total_cotizaciones || 0;
            document.getElementById('totalCompras').textContent = stats.total_compras || 0;
            document.getElementById('totalEntregas').textContent = stats.total_entregas || 0;
            document.getElementById('montoTotalCompras').textContent = `Bs. ${(stats.monto_total_compras || 0).toLocaleString()}`;
            
            renderMovimientosChart(stats.movimientos_por_mes || []);
            renderEstadoChart(stats.estados || {});
            renderTopProveedores(stats.top_proveedores || []);
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// =====================================================
// RENDERIZADO DE TABLAS
// =====================================================

function renderTablaCotizaciones(cotizaciones) {
    const tbody = document.getElementById('tablaCotizaciones');
    if (!tbody) return;
    
    if (cotizaciones.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-inbox" style="font-size: 2rem; color: var(--gris-texto);"></i>
                    <p>No hay cotizaciones registradas</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = cotizaciones.map(c => `
        <tr>
            <td>#${c.id}</td>
            <td>${formatDate(c.fecha_solicitud)}</td>
            <td><strong>${escapeHtml(c.orden_codigo)}</strong></td>
            <td>${escapeHtml(c.vehiculo)}</td>
            <td>${escapeHtml(c.repuesto)}</td>
            <td>${c.cantidad}</td>
            <td>${c.precio ? `Bs. ${c.precio.toFixed(2)}` : '-'}</td>
            <td>${statusBadge(c.estado)}</td>
            <td>
                <button class="action-btn" onclick="verDetalleCotizacion(${c.id})" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderTablaCompras(compras) {
    const tbody = document.getElementById('tablaCompras');
    if (!tbody) return;
    
    if (compras.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-inbox" style="font-size: 2rem; color: var(--gris-texto);"></i>
                    <p>No hay compras registradas</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = compras.map(c => `
        <tr>
            <td>#${c.id}</td>
            <td>${formatDate(c.fecha_solicitud)}</td>
            <td>${c.fecha_compra ? formatDate(c.fecha_compra) : '-'}</td>
            <td><strong>${escapeHtml(c.orden_codigo)}</strong></td>
            <td>${escapeHtml(c.proveedor)}</td>
            <td>${escapeHtml(c.repuesto)}</td>
            <td>${c.cantidad}</td>
            <td>${c.monto ? `Bs. ${c.monto.toFixed(2)}` : '-'}</td>
            <td>${statusBadge(c.estado)}</td>
            <td>
                <button class="action-btn" onclick="verDetalleCompra(${c.id})" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderTablaEntregas(entregas) {
    const tbody = document.getElementById('tablaEntregas');
    if (!tbody) return;
    
    if (entregas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-inbox" style="font-size: 2rem; color: var(--gris-texto);"></i>
                    <p>No hay entregas registradas</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = entregas.map(e => `
        <tr>
            <td>#${e.id}</td>
            <td>${formatDate(e.fecha_entrega)}</td>
            <td><strong>${escapeHtml(e.orden_codigo)}</strong></td>
            <td>${escapeHtml(e.vehiculo)}</td>
            <td>${escapeHtml(e.repuesto)}</td>
            <td>${e.cantidad}</td>
            <td>${escapeHtml(e.destinatario || 'N/A')}</td>
            <td>${statusBadge(e.estado)}</td>
            <td>
                <button class="action-btn" onclick="verDetalleEntrega(${e.id})" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// =====================================================
// GRÁFICOS
// =====================================================

function renderMovimientosChart(data) {
    const canvas = document.getElementById('movimientosChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const meses = data.map(d => d.mes);
    const cotizaciones = data.map(d => d.cotizaciones || 0);
    const compras = data.map(d => d.compras || 0);
    const entregas = data.map(d => d.entregas || 0);
    
    if (movimientosChart) movimientosChart.destroy();
    
    movimientosChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: meses,
            datasets: [
                {
                    label: 'Cotizaciones',
                    data: cotizaciones,
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Compras',
                    data: compras,
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Entregas',
                    data: entregas,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#8E8E93' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#2C2C2E' },
                    ticks: { color: '#8E8E93' }
                },
                x: {
                    grid: { color: '#2C2C2E' },
                    ticks: { color: '#8E8E93' }
                }
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
        'pendiente': '#F59E0B',
        'cotizado': '#2563EB',
        'comprado': '#F59E0B',
        'entregado': '#10B981'
    };
    
    const backgroundColors = labels.map(label => colores[label] || '#6B7280');
    
    if (estadoChart) estadoChart.destroy();
    
    estadoChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
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
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#8E8E93' }
                }
            }
        }
    });
}

function renderTopProveedores(proveedores) {
    const container = document.getElementById('topProveedoresList');
    if (!container) return;
    
    if (proveedores.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gris-texto);">No hay datos</p>';
        return;
    }
    
    container.innerHTML = proveedores.map(p => `
        <div class="top-proveedor-item">
            <span class="top-proveedor-nombre">${escapeHtml(p.nombre)}</span>
            <span class="top-proveedor-cantidad">${p.total_compras} compras</span>
        </div>
    `).join('');
}

// =====================================================
// DETALLES
// =====================================================

async function verDetalleCotizacion(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/historial/cotizaciones/${id}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            const c = data.cotizacion;
            const items = c.items || [];
            
            const itemsHtml = items.map(item => `
                <tr>
                    <td>${escapeHtml(item.descripcion)}</td>
                    <td>${item.cantidad}</td>
                    <td>${item.detalle || '-'}</td>
                </tr>
            `).join('');
            
            const modalBody = document.getElementById('modalDetalleCotizacionBody');
            modalBody.innerHTML = `
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <label>Solicitud ID</label>
                        <p>#${c.id}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Fecha Solicitud</label>
                        <p>${formatDateTime(c.fecha_solicitud)}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Orden de Trabajo</label>
                        <p><strong>${escapeHtml(c.orden_codigo)}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label>Vehículo</label>
                        <p>${escapeHtml(c.vehiculo)}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Servicio</label>
                        <p>${escapeHtml(c.servicio_descripcion)}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Estado</label>
                        <p>${statusBadge(c.estado)}</p>
                    </div>
                    <div class="detalle-items">
                        <label>Items solicitados</label>
                        <table>
                            <thead>
                                <tr><th>Descripción</th><th>Cantidad</th><th>Detalle</th></tr>
                            </thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>
                    ${c.precio_cotizado ? `
                        <div class="detalle-item">
                            <label>Precio Cotizado</label>
                            <p class="text-success">Bs. ${c.precio_cotizado.toFixed(2)}</p>
                        </div>
                        <div class="detalle-item">
                            <label>Proveedor</label>
                            <p>${escapeHtml(c.proveedor_info || '-')}</p>
                        </div>
                    ` : ''}
                    ${c.observacion_jefe_taller ? `
                        <div class="detalle-item">
                            <label>Observación Jefe Taller</label>
                            <p>${escapeHtml(c.observacion_jefe_taller)}</p>
                        </div>
                    ` : ''}
                    ${c.respuesta_encargado ? `
                        <div class="detalle-item">
                            <label>Tu respuesta</label>
                            <p>${escapeHtml(c.respuesta_encargado)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
            
            abrirModal('modalDetalleCotizacion');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function verDetalleCompra(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/historial/compras/${id}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            const c = data.compra;
            const items = c.items || [];
            
            const itemsHtml = items.map(item => `
                <tr>
                    <td>${escapeHtml(item.descripcion)}</td>
                    <td>${item.cantidad}</td>
                    <td>${item.detalle || '-'}</td>
                </tr>
            `).join('');
            
            const modalBody = document.getElementById('modalDetalleCompraBody');
            modalBody.innerHTML = `
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <label>Solicitud ID</label>
                        <p>#${c.id}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Fecha Solicitud</label>
                        <p>${formatDateTime(c.fecha_solicitud)}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Fecha Compra</label>
                        <p>${c.fecha_compra ? formatDateTime(c.fecha_compra) : '-'}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Orden de Trabajo</label>
                        <p><strong>${escapeHtml(c.orden_codigo)}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label>Proveedor</label>
                        <p>${escapeHtml(c.proveedor)}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Monto Total</label>
                        <p class="text-success">Bs. ${c.monto?.toFixed(2) || '0.00'}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Estado</label>
                        <p>${statusBadge(c.estado)}</p>
                    </div>
                    <div class="detalle-items">
                        <label>Items comprados</label>
                        <table>
                            <thead><tr><th>Descripción</th><th>Cantidad</th><th>Detalle</th></tr></thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>
                    ${c.notas_compra ? `
                        <div class="detalle-item">
                            <label>Notas de compra</label>
                            <p>${escapeHtml(c.notas_compra)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
            
            abrirModal('modalDetalleCompra');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function verDetalleEntrega(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/historial/entregas/${id}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            const e = data.entrega;
            const items = e.items || [];
            
            const itemsHtml = items.map(item => `
                <tr>
                    <td>${escapeHtml(item.descripcion)}</td>
                    <td>${item.cantidad}</td>
                </tr>
            `).join('');
            
            const modalBody = document.getElementById('modalDetalleEntregaBody');
            modalBody.innerHTML = `
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <label>Solicitud ID</label>
                        <p>#${e.id}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Fecha Entrega</label>
                        <p>${formatDateTime(e.fecha_entrega)}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Orden de Trabajo</label>
                        <p><strong>${escapeHtml(e.orden_codigo)}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label>Vehículo</label>
                        <p>${escapeHtml(e.vehiculo)}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Destinatario</label>
                        <p>${escapeHtml(e.destinatario || 'No registrado')}</p>
                    </div>
                    <div class="detalle-item">
                        <label>Estado</label>
                        <p>${statusBadge(e.estado)}</p>
                    </div>
                    <div class="detalle-items">
                        <label>Items entregados</label>
                        <table>
                            <thead><tr><th>Descripción</th><th>Cantidad</th></tr></thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>
                    ${e.notas_entrega ? `
                        <div class="detalle-item">
                            <label>Notas de entrega</label>
                            <p>${escapeHtml(e.notas_entrega)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
            
            abrirModal('modalDetalleEntrega');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// EXPORTAR DATOS
// =====================================================

function exportarDatos() {
    const tabla = currentTab === 'cotizaciones' ? 'tablaCotizaciones' :
                  currentTab === 'compras' ? 'tablaCompras' : 'tablaEntregas';
    
    const tablaElement = document.getElementById(tabla);
    if (!tablaElement) return;
    
    const rows = tablaElement.querySelectorAll('tr');
    let csv = [];
    
    // Cabeceras
    const headers = [];
    const firstRow = rows[0];
    if (firstRow) {
        firstRow.querySelectorAll('th').forEach(th => {
            headers.push(th.innerText);
        });
    }
    csv.push(headers.join(','));
    
    // Datos
    rows.forEach(row => {
        const rowData = [];
        row.querySelectorAll('td').forEach(td => {
            let text = td.innerText;
            // Limpiar HTML
            text = text.replace(/<[^>]*>/g, '');
            // Escapar comillas
            text = text.replace(/"/g, '""');
            rowData.push(`"${text}"`);
        });
        if (rowData.length) csv.push(rowData.join(','));
    });
    
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_${currentTab}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Exportación completada', 'success');
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
        
        const tieneRolRepuestos = currentUser.roles?.includes('encargado_repuestos') || 
                                    currentUser.roles?.includes('encargado_rep_almacen');
        
        if (!tieneRolRepuestos) {
            showToast('No tienes permisos', 'error');
            setTimeout(() => window.location.href = '/', 2000);
            return null;
        }
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        return currentUser;
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
            
            // Cargar datos según pestaña
            mostrarLoading(true);
            if (tabId === 'cotizaciones') await cargarCotizaciones();
            else if (tabId === 'compras') await cargarCompras();
            else if (tabId === 'entregas') await cargarEntregas();
            else if (tabId === 'estadisticas') await cargarEstadisticas();
            mostrarLoading(false);
        });
    });
    
    // Botones
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            mostrarLoading(true);
            if (currentTab === 'cotizaciones') await cargarCotizaciones();
            else if (currentTab === 'compras') await cargarCompras();
            else if (currentTab === 'entregas') await cargarEntregas();
            else if (currentTab === 'estadisticas') await cargarEstadisticas();
            mostrarLoading(false);
            showToast('Actualizado', 'success');
        });
    }
    
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportarDatos);
    }
    
    // Filtros
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (currentTab === 'cotizaciones') cargarCotizaciones();
            else if (currentTab === 'compras') cargarCompras();
            else if (currentTab === 'entregas') cargarEntregas();
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => {
            if (currentTab === 'cotizaciones') cargarCotizaciones();
            else if (currentTab === 'compras') cargarCompras();
            else if (currentTab === 'entregas') cargarEntregas();
        });
    }
    
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    if (fechaInicio && fechaFin) {
        [fechaInicio, fechaFin].forEach(input => {
            input.addEventListener('change', () => {
                if (currentTab === 'cotizaciones') cargarCotizaciones();
                else if (currentTab === 'compras') cargarCompras();
                else if (currentTab === 'entregas') cargarEntregas();
            });
        });
    }
    
    // Cerrar modales
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando historial.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarCotizaciones();
    await cargarEstadisticas();
    setupEventListeners();
    
    console.log('✅ historial.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalleCotizacion = verDetalleCotizacion;
window.verDetalleCompra = verDetalleCompra;
window.verDetalleEntrega = verDetalleEntrega;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);