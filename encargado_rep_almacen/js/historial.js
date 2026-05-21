// =====================================================
// CONFIGURACIÓN DE API - FUNCIONA EN LOCAL Y PRODUCCIÓN
// =====================================================
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Modo DESARROLLO - Usando localhost:5000');
        return 'http://localhost:5000';
    }
    console.log('📡 Modo PRODUCCIÓN - Usando URL relativa');
    return '';
})();

// =====================================================
// HISTORIAL.JS - ENCARGADO DE REPUESTOS
// VERSIÓN CORREGIDA - MODALES FIJOS Y ESTADOS MEJORADOS
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = API_BASE_URL + '/api/encargado-repuestos';
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
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Asegurar que el modal se muestre correctamente
        setTimeout(() => {
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.scrollTop = 0;
            }
        }, 50);
    }
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

// Función mejorada para el estado
function statusBadge(estado) {
    const estados = {
        'pendiente': { class: 'status-pendiente', text: 'Pendiente', icon: 'fa-clock' },
        'cotizado': { class: 'status-cotizado', text: 'Cotizado', icon: 'fa-check-circle' },
        'aprobado': { class: 'status-aprobado', text: 'Aprobado', icon: 'fa-check-double' },
        'comprado': { class: 'status-comprado', text: 'Comprado', icon: 'fa-shopping-cart' },
        'entregado': { class: 'status-entregado', text: 'Entregado', icon: 'fa-truck' }
    };
    
    const e = estados[estado] || estados['pendiente'];
    
    return `<span class="status-badge ${e.class}">
        <i class="fas ${e.icon}"></i> ${e.text}
    </span>`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// =====================================================
// CARGA DE DATOS (LIMITADO A 10 REGISTROS)
// =====================================================

async function cargarCotizaciones() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        
        let url = `${API_URL}/historial/cotizaciones?limit=10`;
        
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
            
            if (estado !== 'all') {
                cotizaciones = cotizaciones.filter(c => c.estado === estado);
            }
            
            cotizaciones = cotizaciones.slice(0, 10);
            renderTablaCotizaciones(cotizaciones);
        }
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
        renderTablaCotizaciones([]);
    } finally {
        mostrarLoading(false);
    }
}

async function cargarCompras() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        
        let url = `${API_URL}/historial/compras?limit=10`;
        
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
            
            if (estado !== 'all') {
                compras = compras.filter(c => c.estado === estado);
            }
            
            compras = compras.slice(0, 10);
            renderTablaCompras(compras);
        }
    } catch (error) {
        console.error('Error cargando compras:', error);
        renderTablaCompras([]);
    } finally {
        mostrarLoading(false);
    }
}

async function cargarEntregas() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/historial/entregas?limit=10`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let entregas = data.entregas || [];
            
            if (search) {
                entregas = entregas.filter(e => 
                    (e.orden_codigo || '').toLowerCase().includes(search) ||
                    (e.repuesto || '').toLowerCase().includes(search)
                );
            }
            
            entregas = entregas.slice(0, 10);
            renderTablaEntregas(entregas);
        }
    } catch (error) {
        console.error('Error cargando entregas:', error);
        renderTablaEntregas([]);
    } finally {
        mostrarLoading(false);
    }
}

async function cargarEstadisticas() {
    mostrarLoading(true);
    
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
    } finally {
        mostrarLoading(false);
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
            <tr class="empty-row">
                <td colspan="9" style="text-align: center; padding: 3rem;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--gris-texto); margin-bottom: 1rem; display: block;"></i>
                    <p>No hay cotizaciones registradas</p>
                    <small>Las cotizaciones aparecerán aquí cuando las crees</small>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = cotizaciones.map(c => `
        <tr>
            <td>#${c.id}</td>
            <td>${formatDate(c.fecha_solicitud)}</td>
            <td><strong>${escapeHtml(c.orden_codigo || 'N/A')}</strong></td>
            <td>${escapeHtml((c.vehiculo || 'N/A').substring(0, 35))}</td>
            <td>${escapeHtml(c.repuesto || 'N/A')}</td>
            <td>${c.cantidad || 1}</td>
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
            <tr class="empty-row">
                <td colspan="10" style="text-align: center; padding: 3rem;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--gris-texto); margin-bottom: 1rem; display: block;"></i>
                    <p>No hay compras registradas</p>
                    <small>Las compras aparecerán aquí cuando las realices</small>
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
            <td><strong>${escapeHtml(c.orden_codigo || 'N/A')}</strong></td>
            <td>${escapeHtml(c.proveedor || 'N/A')}</td>
            <td>${escapeHtml(c.repuesto || 'N/A')}</td>
            <td>${c.cantidad || 1}</td>
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
            <tr class="empty-row">
                <td colspan="9" style="text-align: center; padding: 3rem;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--gris-texto); margin-bottom: 1rem; display: block;"></i>
                    <p>No hay entregas registradas</p>
                    <small>Las entregas aparecerán aquí cuando se entreguen los repuestos</small>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = entregas.map(e => `
        <tr>
            <td>#${e.id}</td>
            <td>${formatDate(e.fecha_entrega)}</td>
            <td><strong>${escapeHtml(e.orden_codigo || 'N/A')}</strong></td>
            <td>${escapeHtml((e.vehiculo || 'N/A').substring(0, 35))}</td>
            <td>${escapeHtml(e.repuesto || 'N/A')}</td>
            <td>${e.cantidad || 1}</td>
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
    
    if (meses.length === 0) {
        canvas.parentElement.innerHTML = '<p style="text-align: center; color: var(--gris-texto); padding: 2rem;">No hay datos para mostrar</p>';
        return;
    }
    
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
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#2C2C2E' },
                    ticks: { color: '#8E8E93', stepSize: 1 }
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
    const labels = Object.keys(estados).filter(k => estados[k] > 0);
    const values = labels.map(l => estados[l]);
    const colores = {
        'pendiente': '#F59E0B',
        'cotizado': '#2563EB',
        'comprado': '#F59E0B',
        'entregado': '#10B981'
    };
    
    const backgroundColors = labels.map(label => colores[label] || '#6B7280');
    
    if (estadoChart) estadoChart.destroy();
    
    if (values.length > 0 && values.some(v => v > 0)) {
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
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = values.reduce((a, b) => a + b, 0);
                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    } else {
        canvas.parentElement.innerHTML = '<p style="text-align: center; color: var(--gris-texto); padding: 2rem;">No hay datos para mostrar</p>';
    }
}

function renderTopProveedores(proveedores) {
    const container = document.getElementById('topProveedoresList');
    if (!container) return;
    
    if (proveedores.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gris-texto); padding: 2rem;">No hay datos de proveedores</p>';
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
// DETALLES - MODALES COMPLETOS
// =====================================================

async function verDetalleCotizacion(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/historial/cotizaciones/${id}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.cotizacion) {
            const c = data.cotizacion;
            const items = c.items || [];
            
            // Construir HTML de items
            let itemsHtml = '';
            if (items.length > 0) {
                itemsHtml = `
                    <div class="detalle-items">
                        <label><i class="fas fa-cubes"></i> Items solicitados</label>
                        <div class="items-table">
                            <table>
                                <thead>
                                    <tr><th>Descripción</th><th>Cantidad</th><th>Detalle</th></tr>
                                </thead>
                                <tbody>
                                    ${items.map(item => `
                                        <tr>
                                            <td>${escapeHtml(item.descripcion)}</td>
                                            <td>${item.cantidad}</td>
                                            <td>${escapeHtml(item.detalle || '-')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            
            const modalBody = document.getElementById('modalDetalleCotizacionBody');
            modalBody.innerHTML = `
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <label><i class="fas fa-hashtag"></i> Solicitud ID</label>
                        <p><strong>#${c.id}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-calendar"></i> Fecha Solicitud</label>
                        <p>${formatDateTime(c.fecha_solicitud)}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-clipboard-list"></i> Orden de Trabajo</label>
                        <p><strong>${escapeHtml(c.orden_codigo || 'N/A')}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-car"></i> Vehículo</label>
                        <p>${escapeHtml(c.vehiculo || 'N/A')}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-tag"></i> Estado</label>
                        <p>${statusBadge(c.estado)}</p>
                    </div>
                    ${c.fecha_respuesta ? `
                        <div class="detalle-item">
                            <label><i class="fas fa-reply"></i> Fecha Respuesta</label>
                            <p>${formatDateTime(c.fecha_respuesta)}</p>
                        </div>
                    ` : ''}
                    ${itemsHtml}
                    ${c.precio_cotizado ? `
                        <div class="detalle-item detalle-full">
                            <label><i class="fas fa-dollar-sign"></i> Precio Cotizado</label>
                            <p class="precio-destacado">Bs. ${c.precio_cotizado.toFixed(2)}</p>
                        </div>
                        <div class="detalle-item">
                            <label><i class="fas fa-truck"></i> Proveedor</label>
                            <p>${escapeHtml(c.proveedor_info || '-')}</p>
                        </div>
                    ` : ''}
                    ${c.observacion_jefe_taller ? `
                        <div class="detalle-item detalle-full">
                            <label><i class="fas fa-comment-dots"></i> Observación del Jefe de Taller</label>
                            <p class="observacion-texto">${escapeHtml(c.observacion_jefe_taller)}</p>
                        </div>
                    ` : ''}
                    ${c.respuesta_encargado ? `
                        <div class="detalle-item detalle-full">
                            <label><i class="fas fa-reply"></i> Tu respuesta</label>
                            <p class="respuesta-texto">${escapeHtml(c.respuesta_encargado)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
            
            abrirModal('modalDetalleCotizacion');
        } else {
            showToast('Error al cargar el detalle', 'error');
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
        
        if (data.success && data.compra) {
            const c = data.compra;
            const items = c.items || [];
            
            let itemsHtml = '';
            if (items.length > 0) {
                itemsHtml = `
                    <div class="detalle-items">
                        <label><i class="fas fa-shopping-cart"></i> Items comprados</label>
                        <div class="items-table">
                            <table>
                                <thead>
                                    <tr><th>Descripción</th><th>Cantidad</th><th>Detalle</th></tr>
                                </thead>
                                <tbody>
                                    ${items.map(item => `
                                        <tr>
                                            <td>${escapeHtml(item.descripcion)}</td>
                                            <td>${item.cantidad}</td>
                                            <td>${escapeHtml(item.detalle || '-')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            
            const modalBody = document.getElementById('modalDetalleCompraBody');
            modalBody.innerHTML = `
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <label><i class="fas fa-hashtag"></i> Solicitud ID</label>
                        <p><strong>#${c.id}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-calendar"></i> Fecha Solicitud</label>
                        <p>${formatDateTime(c.fecha_solicitud)}</p>
                    </div>
                    ${c.fecha_compra ? `
                        <div class="detalle-item">
                            <label><i class="fas fa-check-circle"></i> Fecha Compra</label>
                            <p>${formatDateTime(c.fecha_compra)}</p>
                        </div>
                    ` : ''}
                    <div class="detalle-item">
                        <label><i class="fas fa-clipboard-list"></i> Orden de Trabajo</label>
                        <p><strong>${escapeHtml(c.orden_codigo || 'N/A')}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-truck"></i> Proveedor</label>
                        <p>${escapeHtml(c.proveedor || 'N/A')}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-dollar-sign"></i> Monto Total</label>
                        <p class="precio-destacado">${c.precio_cotizado ? `Bs. ${c.precio_cotizado.toFixed(2)}` : '-'}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-tag"></i> Estado</label>
                        <p>${statusBadge(c.estado)}</p>
                    </div>
                    ${itemsHtml}
                    ${c.notas_compra ? `
                        <div class="detalle-item detalle-full">
                            <label><i class="fas fa-sticky-note"></i> Notas de compra</label>
                            <p>${escapeHtml(c.notas_compra)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
            
            abrirModal('modalDetalleCompra');
        } else {
            showToast('Error al cargar el detalle', 'error');
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
        
        if (data.success && data.entrega) {
            const e = data.entrega;
            const items = e.items || [];
            
            let itemsHtml = '';
            if (items.length > 0) {
                itemsHtml = `
                    <div class="detalle-items">
                        <label><i class="fas fa-boxes"></i> Items entregados</label>
                        <div class="items-table">
                            <table>
                                <thead>
                                    <tr><th>Descripción</th><th>Cantidad</th></tr>
                                </thead>
                                <tbody>
                                    ${items.map(item => `
                                        <tr>
                                            <td>${escapeHtml(item.descripcion)}</td>
                                            <td>${item.cantidad}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            
            const modalBody = document.getElementById('modalDetalleEntregaBody');
            modalBody.innerHTML = `
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <label><i class="fas fa-hashtag"></i> Entrega ID</label>
                        <p><strong>#${e.id}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-calendar"></i> Fecha Entrega</label>
                        <p>${formatDateTime(e.fecha_entrega)}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-clipboard-list"></i> Orden de Trabajo</label>
                        <p><strong>${escapeHtml(e.orden_codigo || 'N/A')}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-car"></i> Vehículo</label>
                        <p>${escapeHtml(e.vehiculo || 'N/A')}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-user"></i> Destinatario</label>
                        <p>${escapeHtml(e.destinatario || 'No registrado')}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-tag"></i> Estado</label>
                        <p>${statusBadge(e.estado)}</p>
                    </div>
                    ${itemsHtml}
                    ${e.notas_entrega ? `
                        <div class="detalle-item detalle-full">
                            <label><i class="fas fa-sticky-note"></i> Notas de entrega</label>
                            <p>${escapeHtml(e.notas_entrega)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
            
            abrirModal('modalDetalleEntrega');
        } else {
            showToast('Error al cargar el detalle', 'error');
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
    const tablaId = currentTab === 'cotizaciones' ? 'tablaCotizaciones' :
                    currentTab === 'compras' ? 'tablaCompras' : 'tablaEntregas';
    
    const tablaBody = document.getElementById(tablaId);
    if (!tablaBody) return;
    
    const rows = tablaBody.querySelectorAll('tr');
    if (rows.length === 0 || (rows.length === 1 && rows[0].classList.contains('empty-row'))) {
        showToast('No hay datos para exportar', 'warning');
        return;
    }
    
    let csv = [];
    
    // Cabeceras
    const headers = [];
    const headerRow = document.querySelector(`#${tablaId}`).closest('.table-container')?.querySelector('thead tr');
    if (headerRow) {
        headerRow.querySelectorAll('th').forEach(th => {
            headers.push(th.innerText);
        });
    }
    if (headers.length) csv.push(headers.join(','));
    
    // Datos
    rows.forEach(row => {
        const rowData = [];
        row.querySelectorAll('td').forEach(td => {
            let text = td.innerText;
            text = text.replace(/"/g, '""');
            rowData.push(`"${text}"`);
        });
        if (rowData.length) csv.push(rowData.join(','));
    });
    
    if (csv.length > 1) {
        const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `historial_${currentTab}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Exportación completada', 'success');
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
            window.location.href = API_BASE_URL + '/';
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
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => window.location.href = API_BASE_URL + '/', 2000);
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
        window.location.href = API_BASE_URL + '/';
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
            
            if (tabId === 'cotizaciones') await cargarCotizaciones();
            else if (tabId === 'compras') await cargarCompras();
            else if (tabId === 'entregas') await cargarEntregas();
            else if (tabId === 'estadisticas') await cargarEstadisticas();
        });
    });
    
    // Botón de actualizar
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (currentTab === 'cotizaciones') await cargarCotizaciones();
            else if (currentTab === 'compras') await cargarCompras();
            else if (currentTab === 'entregas') await cargarEntregas();
            else if (currentTab === 'estadisticas') await cargarEstadisticas();
            showToast('Datos actualizados', 'success');
        });
    }
    
    // Botón de exportar
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportarDatos);
    }
    
    // Búsqueda con debounce
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(() => {
            if (currentTab === 'cotizaciones') cargarCotizaciones();
            else if (currentTab === 'compras') cargarCompras();
            else if (currentTab === 'entregas') cargarEntregas();
        }, 500);
        searchInput.addEventListener('input', debouncedSearch);
    }
    
    // Filtro de estado
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => {
            if (currentTab === 'cotizaciones') cargarCotizaciones();
            else if (currentTab === 'compras') cargarCompras();
        });
    }
    
    // Cerrar modales
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModal(modal.id);
        });
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                cerrarModal(modal.id);
            });
        }
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

// Inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}

console.log('✅ historial.js cargado correctamente');