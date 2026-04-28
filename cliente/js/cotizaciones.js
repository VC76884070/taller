// =====================================================
// COTIZACIONES.JS - CLIENTE
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/cliente';
let currentUser = null;
let cotizaciones = [];
let currentCotizacion = null;
let currentCotizacionId = null;
let currentVehiculoId = null;

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
        'enviada': 'Enviada',
        'aprobado_total': 'Aprobada Totalmente',
        'aprobado_parcial': 'Aprobada Parcialmente',
        'rechazada': 'Rechazada'
    };
    return estados[estado] || estado;
}

function getEstadoClass(estado) {
    const classes = {
        'enviada': 'estado-enviada',
        'aprobado_total': 'estado-aprobada',
        'aprobado_parcial': 'estado-parcial',
        'rechazada': 'estado-rechazada'
    };
    return classes[estado] || 'estado-enviada';
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarCotizaciones() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        
        let url = `${API_URL}/cotizaciones`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            let cotizacionesList = data.cotizaciones || [];
            
            if (search) {
                cotizacionesList = cotizacionesList.filter(c => 
                    (c.codigo_orden || '').toLowerCase().includes(search) ||
                    (c.placa || '').toLowerCase().includes(search) ||
                    (c.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            cotizaciones = cotizacionesList;
            renderizarCotizaciones(cotizacionesList);
        } else {
            showToast(data.error || 'Error al cargar cotizaciones', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarCotizaciones(cotizacionesList) {
    const container = document.getElementById('cotizacionesGrid');
    if (!container) return;
    
    if (cotizacionesList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-invoice-dollar"></i>
                <p>No hay cotizaciones disponibles</p>
                <small>Las cotizaciones aparecerán aquí cuando el taller las genere</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = cotizacionesList.map(cotizacion => {
        const puedeAprobar = cotizacion.estado === 'enviada';
        
        return `
            <div class="cotizacion-card ${getEstadoClass(cotizacion.estado)}">
                <div class="cotizacion-header">
                    <div class="cotizacion-info">
                        <span class="cotizacion-codigo">
                            <i class="fas fa-receipt"></i>
                            Orden: ${escapeHtml(cotizacion.codigo_orden)}
                        </span>
                        <span class="cotizacion-fecha">
                            <i class="far fa-calendar-alt"></i>
                            ${formatDate(cotizacion.fecha)}
                        </span>
                    </div>
                    <span class="cotizacion-estado ${getEstadoClass(cotizacion.estado)}">
                        ${getEstadoTexto(cotizacion.estado)}
                    </span>
                </div>
                <div class="cotizacion-body">
                    <div class="vehiculo-info">
                        <div class="info-item">
                            <i class="fas fa-car"></i>
                            <span>${escapeHtml(cotizacion.vehiculo)}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-id-card"></i>
                            <span>Placa: ${escapeHtml(cotizacion.placa)}</span>
                        </div>
                    </div>
                    
                    <div class="servicios-resumen">
                        <div class="servicios-count">
                            <i class="fas fa-tools"></i>
                            ${cotizacion.servicios_count} servicio(s)
                        </div>
                        <div class="monto-total">
                            Total: ${formatCurrency(cotizacion.monto_total)}
                        </div>
                    </div>
                    
                    <div class="cotizacion-footer">
                        <button class="btn-ver-detalle" onclick="verDetalleCotizacion(${cotizacion.id}, '${escapeHtml(cotizacion.codigo_orden)}')">
                            <i class="fas fa-eye"></i> Ver Detalle
                        </button>
                        ${puedeAprobar ? `
                            <button class="btn-aprobar" onclick="verDetalleCotizacion(${cotizacion.id}, '${escapeHtml(cotizacion.codigo_orden)}')">
                                <i class="fas fa-check-circle"></i> Revisar y Aprobar
                            </button>
                        ` : ''}
                        <button class="btn-imprimir" onclick="imprimirCotizacionDirecta(${cotizacion.id})">
                            <i class="fas fa-print"></i> Imprimir
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// DETALLE DE COTIZACIÓN
// =====================================================

async function verDetalleCotizacion(id, codigoOrden) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${id}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentCotizacionId = id;
            currentCotizacion = data.cotizacion;
            mostrarDetalleCotizacion(data.cotizacion, codigoOrden);
        } else {
            showToast(data.error || 'Error al cargar cotización', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarDetalleCotizacion(cotizacion, codigoOrden) {
    const puedeAprobar = cotizacion.estado === 'enviada';
    const tieneAprobados = cotizacion.servicios.some(s => s.aprobado_por_cliente);
    
    const serviciosHtml = cotizacion.servicios.map((servicio, index) => `
        <div class="servicio-cotizacion-item ${servicio.aprobado_por_cliente ? 'aprobado' : ''}">
            <div class="servicio-info">
                <div class="servicio-descripcion">
                    <strong>${escapeHtml(servicio.descripcion)}</strong>
                </div>
                <div class="servicio-precio">
                    ${formatCurrency(servicio.precio)}
                </div>
            </div>
            ${puedeAprobar && !servicio.aprobado_por_cliente ? `
                <div class="servicio-actions">
                    <label class="checkbox-container">
                        <input type="checkbox" class="servicio-checkbox" data-index="${index}" data-id="${servicio.id_servicio || index}">
                        <span class="checkmark"></span>
                        Aprobar este servicio
                    </label>
                </div>
            ` : servicio.aprobado_por_cliente ? `
                <div class="servicio-aprobado">
                    <i class="fas fa-check-circle"></i> Aprobado el ${formatDate(servicio.fecha_aprobacion)}
                </div>
            ` : ''}
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalDetalleBody');
    modalBody.innerHTML = `
        <div class="detalle-seccion">
            <h4><i class="fas fa-info-circle"></i> Información de la Cotización</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Orden de Trabajo</span>
                    <span class="detalle-value"><strong>${escapeHtml(codigoOrden)}</strong></span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Fecha de Emisión</span>
                    <span class="detalle-value">${formatDateTime(cotizacion.fecha_generacion)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Estado</span>
                    <span class="detalle-value">${getEstadoTexto(cotizacion.estado)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Total</span>
                    <span class="detalle-value total-monto">${formatCurrency(cotizacion.total)}</span>
                </div>
            </div>
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-tools"></i> Servicios Cotizados</h4>
            <div class="servicios-lista">
                ${serviciosHtml}
            </div>
            <div class="total-general">
                <strong>Total General:</strong> ${formatCurrency(cotizacion.total)}
            </div>
        </div>
        
        ${cotizacion.sugerencias_generales ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-comment-dots"></i> Sugerencias del Taller</h4>
                <div class="detalle-descripcion">
                    ${escapeHtml(cotizacion.sugerencias_generales)}
                </div>
            </div>
        ` : ''}
    `;
    
    // Configurar botones según estado
    const btnAprobarTodo = document.getElementById('btnAprobarTodo');
    const btnAprobarSeleccion = document.getElementById('btnAprobarSeleccion');
    const btnRechazar = document.getElementById('btnRechazar');
    
    if (puedeAprobar) {
        btnAprobarTodo.style.display = 'flex';
        btnAprobarSeleccion.style.display = 'flex';
        btnRechazar.style.display = 'flex';
    } else {
        btnAprobarTodo.style.display = 'none';
        btnAprobarSeleccion.style.display = 'none';
        btnRechazar.style.display = 'none';
    }
    
    abrirModal('modalDetalleCotizacion');
}

// =====================================================
// APROBAR COTIZACIÓN
// =====================================================

function obtenerServiciosSeleccionados() {
    const checkboxes = document.querySelectorAll('.servicio-checkbox:checked');
    const indices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
    
    if (currentCotizacion && currentCotizacion.servicios) {
        return indices.map(idx => ({
            id_servicio: currentCotizacion.servicios[idx].id_servicio,
            descripcion: currentCotizacion.servicios[idx].descripcion
        }));
    }
    return [];
}

async function aprobarCotizacionCompleta() {
    if (!confirm('¿Estás seguro de que deseas aprobar todos los servicios de esta cotización?')) return;
    
    const servicios = currentCotizacion.servicios.map((_, idx) => ({
        id_servicio: currentCotizacion.servicios[idx].id_servicio
    }));
    
    await enviarAprobacion(servicios, 'total');
}

async function aprobarServiciosSeleccionados() {
    const serviciosSeleccionados = obtenerServiciosSeleccionados();
    
    if (serviciosSeleccionados.length === 0) {
        showToast('Selecciona al menos un servicio para aprobar', 'warning');
        return;
    }
    
    if (!confirm(`¿Aprobar ${serviciosSeleccionados.length} servicio(s)?`)) return;
    
    await enviarAprobacion(serviciosSeleccionados, 'parcial');
}

async function rechazarCotizacion() {
    if (!confirm('¿Estás seguro de que deseas rechazar esta cotización? Podrás solicitar una nueva cotización más tarde.')) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${currentCotizacionId}/rechazar`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Cotización rechazada', 'warning');
            cerrarModal('modalDetalleCotizacion');
            await cargarCotizaciones();
        } else {
            showToast(data.error || 'Error al rechazar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function enviarAprobacion(servicios, tipo) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${currentCotizacionId}/aprobar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ servicios: servicios })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`Cotización ${tipo === 'total' ? 'completamente' : 'parcialmente'} aprobada`, 'success');
            cerrarModal('modalDetalleCotizacion');
            await cargarCotizaciones();
        } else {
            showToast(data.error || 'Error al aprobar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// IMPRIMIR COTIZACIÓN
// =====================================================

async function imprimirCotizacionDirecta(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${id}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarVistaPreviaImpresion(data.cotizacion);
        } else {
            showToast(data.error || 'Error al cargar cotización', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarVistaPreviaImpresion(cotizacion) {
    const serviciosHtml = cotizacion.servicios.map(servicio => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(servicio.descripcion)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(servicio.precio)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                ${servicio.aprobado_por_cliente ? '✓ Aprobado' : '⏳ Pendiente'}
            </td>
        </tr>
    `).join('');
    
    const printContent = document.getElementById('printContent');
    printContent.innerHTML = `
        <div class="cotizacion-print" style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #C1121F; margin-bottom: 5px;">FURIA MOTOR COMPANY</h1>
                <p style="color: #666;">Centro de Servicio Automotriz</p>
                <hr style="border: 1px solid #C1121F;">
                <h2>INFORME DE COTIZACIÓN</h2>
            </div>
            
            <div style="margin-bottom: 20px;">
                <p><strong>Fecha de Emisión:</strong> ${formatDateTime(cotizacion.fecha_generacion)}</p>
                <p><strong>Estado:</strong> ${getEstadoTexto(cotizacion.estado)}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h3 style="color: #333; border-bottom: 2px solid #C1121F; padding-bottom: 5px;">Servicios Cotizados</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            <th style="padding: 8px; text-align: left;">Descripción</th>
                            <th style="padding: 8px; text-align: right;">Precio</th>
                            <th style="padding: 8px; text-align: center;">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${serviciosHtml}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f5f5f5;">
                            <td style="padding: 10px; text-align: right;"><strong>Total General:</strong></td>
                            <td style="padding: 10px; text-align: right;"><strong>${formatCurrency(cotizacion.total)}</strong></td>
                            <td style="padding: 10px;"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            
            ${cotizacion.sugerencias_generales ? `
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #333; border-bottom: 2px solid #C1121F; padding-bottom: 5px;">Sugerencias del Taller</h3>
                    <p style="background: #f9f9f9; padding: 10px; border-radius: 5px;">${escapeHtml(cotizacion.sugerencias_generales)}</p>
                </div>
            ` : ''}
            
            <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #999;">
                <hr>
                <p>Este documento es un informe de cotización generado automáticamente por FURIA MOTOR.</p>
                <p>Para cualquier consulta, contáctanos al teléfono: (591) 2-1234567</p>
            </div>
        </div>
    `;
    
    abrirModal('modalImprimir');
}

function imprimirCotizacion() {
    const printContent = document.getElementById('printContent');
    const originalContent = printContent.innerHTML;
    
    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
            <head>
                <title>Cotización FURIA MOTOR</title>
                <style>
                    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 0; padding: 20px; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                ${originalContent}
            </body>
        </html>
    `);
    ventana.document.close();
    ventana.print();
    cerrarModal('modalImprimir');
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
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarCotizaciones();
            showToast('Actualizando...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarCotizaciones());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarCotizaciones());
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando cotizaciones.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarCotizaciones();
    setupEventListeners();
    
    console.log('✅ cotizaciones.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalleCotizacion = verDetalleCotizacion;
window.aprobarCotizacionCompleta = aprobarCotizacionCompleta;
window.aprobarServiciosSeleccionados = aprobarServiciosSeleccionados;
window.rechazarCotizacion = rechazarCotizacion;
window.imprimirCotizacionDirecta = imprimirCotizacionDirecta;
window.imprimirCotizacion = imprimirCotizacion;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);