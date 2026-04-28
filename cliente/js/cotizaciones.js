// =====================================================
// COTIZACIONES.JS - CLIENTE (VERSIÓN CORREGIDA)
// CON COSTO DE DIAGNÓSTICO DE Bs. 200 AL RECHAZAR
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = '/api/cliente';
let currentUser = null;
let cotizaciones = [];
let currentCotizacion = null;
let currentCotizacionId = null;
const COSTO_DIAGNOSTICO = 200;

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
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

function getEstadoTexto(estado) {
    const estados = {
        'enviada': 'Enviada',
        'aprobado_total': 'Aprobada Totalmente',
        'aprobado_parcial': 'Aprobada Parcialmente',
        'rechazada': 'Rechazada (Costo Diagnóstico Bs. 200)'
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
            localStorage.clear();
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
                <button onclick="cargarCotizaciones()" class="btn-retry">
                    <i class="fas fa-sync-alt"></i> Actualizar
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = cotizacionesList.map(cotizacion => {
        const puedeAprobar = cotizacion.estado === 'enviada';
        const esRechazada = cotizacion.estado === 'rechazada';
        
        // CORRECCIÓN: Si la cotización está rechazada, mostrar Bs. 200.00 (costo de diagnóstico)
        // Si no está rechazada, mostrar el total de servicios
        let montoMostrar = cotizacion.monto_total || 0;
        let mostrarDiagnosticoBadge = false;
        
        if (esRechazada) {
            // Si está rechazada, siempre mostrar el costo de diagnóstico
            montoMostrar = COSTO_DIAGNOSTICO;
            mostrarDiagnosticoBadge = true;
        } else if (cotizacion.estado === 'aprobado_parcial' || cotizacion.estado === 'aprobado_total') {
            // Si está aprobada, mostrar el total de servicios aprobados
            // (esto ya viene en monto_total desde el backend)
            montoMostrar = cotizacion.monto_total || 0;
        } else if (cotizacion.estado === 'enviada') {
            // Si está enviada (pendiente), mostrar el total de servicios cotizados
            montoMostrar = cotizacion.monto_total || 0;
        }
        
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
                            ${cotizacion.servicios_count || 0} servicio(s)
                        </div>
                        <div class="monto-total">
                            Total: ${formatCurrency(montoMostrar)}
                            ${mostrarDiagnosticoBadge ? `
                                <span class="diagnostico-badge">
                                    <i class="fas fa-stethoscope"></i> Diagnóstico
                                </span>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="cotizacion-footer">
                        <button class="btn-ver-detalle" onclick="verDetalleCotizacion(${cotizacion.id})">
                            <i class="fas fa-eye"></i> Ver Detalle
                        </button>
                        ${puedeAprobar ? `
                            <button class="btn-aprobar" onclick="verDetalleCotizacion(${cotizacion.id})">
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

async function verDetalleCotizacion(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${id}`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentCotizacionId = id;
            currentCotizacion = data.cotizacion;
            mostrarDetalleCotizacion(data.cotizacion);
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

function mostrarDetalleCotizacion(cotizacion) {
    const puedeAprobar = cotizacion.estado === 'enviada';
    const esRechazada = cotizacion.estado === 'rechazada';
    const tieneServicios = cotizacion.servicios && cotizacion.servicios.length > 0;
    
    // Determinar si mostrar costo de diagnóstico (cuando está rechazada o no hay servicios aprobados)
    const serviciosAprobados = (cotizacion.servicios || []).filter(s => s.aprobado_por_cliente).length;
    const noHayServiciosAprobados = serviciosAprobados === 0;
    const mostrarDiagnostico = esRechazada || (noHayServiciosAprobados && !puedeAprobar);
    
    // Calcular totales
    let totalServicios = cotizacion.total || 0;
    let totalConDiagnostico = totalServicios;
    let mensajeDiagnostico = '';
    
    if (mostrarDiagnostico) {
        totalConDiagnostico = COSTO_DIAGNOSTICO;
        mensajeDiagnostico = `
            <div class="diagnostico-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>⚠️ Costo de Diagnóstico Aplicado</strong>
                <p>Esta cotización ha sido rechazada o no tiene servicios aprobados. Se aplicará el costo de diagnóstico de <strong>${formatCurrency(COSTO_DIAGNOSTICO)}</strong> por la revisión realizada al vehículo.</p>
            </div>
        `;
    }
    
    const serviciosHtml = (cotizacion.servicios || []).map((servicio, index) => `
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
                        <input type="checkbox" class="servicio-checkbox" data-index="${index}" data-id="${servicio.id_servicio}">
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
    
    const noServiciosHtml = !tieneServicios ? `
        <div class="empty-state" style="padding: 2rem;">
            <i class="fas fa-tools"></i>
            <p>No hay servicios en esta cotización</p>
            <small>Se aplicará el costo de diagnóstico de ${formatCurrency(COSTO_DIAGNOSTICO)}</small>
        </div>
    ` : '';
    
    const modalBody = document.getElementById('modalDetalleBody');
    if (modalBody) {
        modalBody.innerHTML = `
            ${mensajeDiagnostico}
            <div class="detalle-seccion">
                <h4><i class="fas fa-info-circle"></i> Información de la Cotización</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Orden de Trabajo</span>
                        <span class="detalle-value"><strong>${escapeHtml(cotizacion.codigo_orden)}</strong></span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Vehículo</span>
                        <span class="detalle-value">${escapeHtml(cotizacion.vehiculo)} - ${escapeHtml(cotizacion.placa)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Fecha de Emisión</span>
                        <span class="detalle-value">${formatDateTime(cotizacion.fecha_generacion)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Estado</span>
                        <span class="detalle-value">${getEstadoTexto(cotizacion.estado)}</span>
                    </div>
                </div>
            </div>
            
            <div class="detalle-seccion">
                <h4><i class="fas fa-tools"></i> Servicios Cotizados</h4>
                <div class="servicios-lista">
                    ${tieneServicios ? serviciosHtml : noServiciosHtml}
                </div>
                ${tieneServicios ? `
                    <div class="total-general">
                        <strong>Total Servicios:</strong> ${formatCurrency(totalServicios)}
                    </div>
                ` : ''}
                ${mostrarDiagnostico ? `
                    <div class="diagnostico-message">
                        <i class="fas fa-stethoscope"></i>
                        <span>Costo de Diagnóstico: ${formatCurrency(COSTO_DIAGNOSTICO)}</span>
                        <p>Este cargo aplica por la revisión y diagnóstico del vehículo</p>
                    </div>
                    <div class="total-general" style="margin-top: 1rem; border-top-color: var(--ambar-alerta);">
                        <strong>Total a Pagar:</strong> ${formatCurrency(COSTO_DIAGNOSTICO)}
                    </div>
                ` : ''}
                ${!mostrarDiagnostico && tieneServicios ? `
                    <div class="total-general">
                        <strong>Total General:</strong> ${formatCurrency(totalServicios)}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    // Configurar botones
    const btnAprobarTodo = document.getElementById('btnAprobarTodo');
    const btnAprobarSeleccion = document.getElementById('btnAprobarSeleccion');
    const btnRechazar = document.getElementById('btnRechazar');
    
    // Si está rechazada, ocultar botones de aprobación
    const mostrarBotonesAprobacion = puedeAprobar && tieneServicios;
    
    if (btnAprobarTodo) btnAprobarTodo.style.display = mostrarBotonesAprobacion ? 'inline-flex' : 'none';
    if (btnAprobarSeleccion) btnAprobarSeleccion.style.display = mostrarBotonesAprobacion ? 'inline-flex' : 'none';
    if (btnRechazar) btnRechazar.style.display = puedeAprobar ? 'inline-flex' : 'none';
    
    abrirModal('modalDetalleCotizacion');
}

// =====================================================
// APROBAR COTIZACIÓN
// =====================================================

function obtenerServiciosSeleccionados() {
    const checkboxes = document.querySelectorAll('.servicio-checkbox:checked');
    const indices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
    
    if (currentCotizacion && currentCotizacion.servicios) {
        return indices.map(idx => currentCotizacion.servicios[idx].id_servicio);
    }
    return [];
}

async function aprobarCotizacionCompleta() {
    if (!currentCotizacion.servicios || currentCotizacion.servicios.length === 0) {
        showToast('No hay servicios para aprobar', 'warning');
        return;
    }
    
    if (!confirm('¿Estás seguro de que deseas aprobar TODOS los servicios? Esto iniciará el trabajo en tu vehículo. El costo de diagnóstico NO aplicará.')) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${currentCotizacionId}/aprobar-total`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ ¡Cotización aprobada! El taller comenzará los trabajos.', 'success');
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

async function aprobarServiciosSeleccionados() {
    if (!currentCotizacion.servicios || currentCotizacion.servicios.length === 0) {
        showToast('No hay servicios disponibles para aprobar', 'warning');
        return;
    }
    
    const serviciosSeleccionados = obtenerServiciosSeleccionados();
    
    if (serviciosSeleccionados.length === 0) {
        showToast('Selecciona al menos un servicio para aprobar', 'warning');
        return;
    }
    
    if (!confirm(`¿Aprobar ${serviciosSeleccionados.length} servicio(s)? Los servicios no seleccionados quedarán pendientes.`)) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${currentCotizacionId}/aprobar-parcial`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                servicios_aprobados: serviciosSeleccionados,
                comentarios: ''
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Cotización aprobada parcialmente', 'success');
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
// RECHAZAR COTIZACIÓN (CON COSTO DE DIAGNÓSTICO)
// =====================================================

async function rechazarCotizacion() {
    const motivo = prompt('¿Por qué rechazas esta cotización? (Opcional)');
    
    const confirmarRechazo = confirm(
        `⚠️ IMPORTANTE\n\n` +
        `Si rechazas esta cotización:\n` +
        `• Se aplicará el costo de diagnóstico de ${formatCurrency(COSTO_DIAGNOSTICO)}\n` +
        `• Este costo cubre la revisión y diagnóstico ya realizado\n` +
        `• El taller preparará una nueva cotización si lo deseas\n\n` +
        `¿Estás seguro de rechazar esta cotización?`
    );
    
    if (!confirmarRechazo) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${currentCotizacionId}/rechazar`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ motivo: motivo || '' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`⚠️ Cotización rechazada. Se aplicará el costo de diagnóstico de ${formatCurrency(COSTO_DIAGNOSTICO)}.`, 'warning');
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
    const esRechazada = cotizacion.estado === 'rechazada';
    const tieneServicios = cotizacion.servicios && cotizacion.servicios.length > 0;
    const serviciosAprobados = (cotizacion.servicios || []).filter(s => s.aprobado_por_cliente).length;
    const noHayServiciosAprobados = serviciosAprobados === 0;
    const mostrarDiagnostico = esRechazada || (noHayServiciosAprobados && cotizacion.estado !== 'aprobado_total');
    
    const totalServicios = cotizacion.total || 0;
    const totalFinal = mostrarDiagnostico ? COSTO_DIAGNOSTICO : totalServicios;
    
    const serviciosHtml = (cotizacion.servicios || []).map(servicio => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(servicio.descripcion)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(servicio.precio)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                ${servicio.aprobado_por_cliente ? '✓ Aprobado' : '⏳ Pendiente'}
            </td>
        </tr>
    `).join('');
    
    const diagnosticoRow = mostrarDiagnostico && !esRechazada ? `
        <tr style="background: #fff3e0;">
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
                <strong>🔧 Servicio de Diagnóstico</strong><br>
                <small style="color: #666;">Revisión y diagnóstico del vehículo</small>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">
                <strong>${formatCurrency(COSTO_DIAGNOSTICO)}</strong>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                ⚠️ Aplicado por rechazo
            </td>
        </tr>
    ` : '';
    
    const diagnosticoRowRechazada = esRechazada ? `
        <tr style="background: #fff3e0;">
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
                <strong>🔧 Diagnóstico Técnico</strong><br>
                <small style="color: #666;">Revisión completa del vehículo</small>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">
                <strong>${formatCurrency(COSTO_DIAGNOSTICO)}</strong>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                ⚠️ Cotización rechazada
            </td>
        </tr>
    ` : '';
    
    const printContent = document.getElementById('printContent');
    if (printContent) {
        printContent.innerHTML = `
            <div class="cotizacion-print" style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; background: white; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #C1121F; margin-bottom: 5px;">FURIA MOTOR COMPANY</h1>
                    <p style="color: #666;">Centro de Servicio Automotriz</p>
                    <hr style="border: 1px solid #C1121F;">
                    <h2>INFORME DE COTIZACIÓN</h2>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <p><strong>Orden de Trabajo:</strong> ${escapeHtml(cotizacion.codigo_orden)}</p>
                    <p><strong>Vehículo:</strong> ${escapeHtml(cotizacion.vehiculo)} - ${escapeHtml(cotizacion.placa)}</p>
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
                            ${diagnosticoRow}
                            ${diagnosticoRowRechazada}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f5f5f5;">
                                <td style="padding: 10px; text-align: right;"><strong>Total General:</strong></td>
                                <td style="padding: 10px; text-align: right;"><strong>${formatCurrency(totalFinal)}</strong></td>
                                <td style="padding: 10px;"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                ${mostrarDiagnostico || esRechazada ? `
                    <div style="margin-top: 15px; padding: 10px; background: #fff3e0; border-left: 4px solid #F59E0B; border-radius: 5px;">
                        <p style="margin: 0; color: #333; font-size: 12px;">
                            <strong>⚠️ Nota:</strong> ${esRechazada ? 'Esta cotización fue rechazada.' : 'Esta cotización no tiene servicios aprobados.'} Se aplica el costo de diagnóstico de ${formatCurrency(COSTO_DIAGNOSTICO)} por la revisión realizada.
                        </p>
                    </div>
                ` : ''}
                
                <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #999;">
                    <hr>
                    <p>Este documento es un informe de cotización generado automáticamente por FURIA MOTOR.</p>
                </div>
            </div>
        `;
    }
    
    abrirModal('modalImprimir');
}

function imprimirCotizacion() {
    const printContent = document.getElementById('printContent');
    const originalContent = printContent ? printContent.innerHTML : '';
    
    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
            <head>
                <title>Cotización FURIA MOTOR</title>
                <style>
                    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 0; padding: 20px; }
                    @media print {
                        body { margin: 0; padding: 0; }
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
        let timeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => cargarCotizaciones(), 500);
        });
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando cotizaciones.js');
    
    mostrarLoading(true);
    
    try {
        const user = await cargarUsuarioActual();
        if (!user) return;
        
        await cargarCotizaciones();
        setupEventListeners();
        
        console.log('✅ cotizaciones.js inicializado correctamente');
    } catch (error) {
        console.error('Error en inicialización:', error);
    } finally {
        mostrarLoading(false);
    }
}

// Exponer funciones globales
window.verDetalleCotizacion = verDetalleCotizacion;
window.aprobarCotizacionCompleta = aprobarCotizacionCompleta;
window.aprobarServiciosSeleccionados = aprobarServiciosSeleccionados;
window.rechazarCotizacion = rechazarCotizacion;
window.imprimirCotizacionDirecta = imprimirCotizacionDirecta;
window.imprimirCotizacion = imprimirCotizacion;
window.cerrarModal = cerrarModal;
window.cargarCotizaciones = cargarCotizaciones;

document.addEventListener('DOMContentLoaded', inicializar);