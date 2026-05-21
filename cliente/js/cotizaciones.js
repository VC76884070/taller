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
// COTIZACIONES.JS - CLIENTE (VERSIÓN OPTIMIZADA)
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = API_BASE_URL + '/api/cliente';
let currentUser = null;
let cotizaciones = [];
let currentCotizacion = null;
let currentCotizacionId = null;
const COSTO_DIAGNOSTICO = 200;

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
        'enviada': 'Pendiente',
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

function getEstadoIcon(estado) {
    const icons = {
        'enviada': 'fa-clock',
        'aprobado_total': 'fa-check-circle',
        'aprobado_parcial': 'fa-check-double',
        'rechazada': 'fa-times-circle'
    };
    return icons[estado] || 'fa-file-invoice';
}

// =====================================================
// CARGA DE DATOS OPTIMIZADA
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
            window.location.href = API_BASE_URL + '/';
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
            actualizarDashboard(cotizacionesList);
        } else {
            showToast(data.error || 'Error al cargar cotizaciones', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
        document.getElementById('cotizacionesGrid').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error de conexión</p>
                <button onclick="cargarCotizaciones()" class="btn-retry">Reintentar</button>
            </div>
        `;
    } finally {
        mostrarLoading(false);
    }
}

function actualizarDashboard(cotizacionesList) {
    const pendientes = cotizacionesList.filter(c => c.estado === 'enviada').length;
    const aprobadas = cotizacionesList.filter(c => c.estado === 'aprobado_total' || c.estado === 'aprobado_parcial').length;
    const rechazadas = cotizacionesList.filter(c => c.estado === 'rechazada').length;
    
    const pendientesEl = document.getElementById('pendientesCount');
    const aprobadasEl = document.getElementById('aprobadasCount');
    const rechazadasEl = document.getElementById('rechazadasCount');
    
    if (pendientesEl) pendientesEl.textContent = pendientes;
    if (aprobadasEl) aprobadasEl.textContent = aprobadas;
    if (rechazadasEl) rechazadasEl.textContent = rechazadas;
}

function renderizarCotizaciones(cotizacionesList) {
    const container = document.getElementById('cotizacionesGrid');
    if (!container) return;
    
    if (cotizacionesList.length === 0) {
        container.innerHTML = `
            <div class="empty-state premium">
                <i class="fas fa-file-invoice-dollar"></i>
                <h3>No hay cotizaciones disponibles</h3>
                <p>Las cotizaciones aparecerán aquí cuando el taller las genere</p>
                <button onclick="cargarCotizaciones()" class="btn-primary">
                    <i class="fas fa-sync-alt"></i> Actualizar
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = cotizacionesList.map(cotizacion => {
        const puedeAprobar = cotizacion.estado === 'enviada';
        const esRechazada = cotizacion.estado === 'rechazada';
        
        let montoMostrar = cotizacion.monto_total || 0;
        let mostrarDiagnosticoBadge = false;
        
        if (esRechazada) {
            montoMostrar = COSTO_DIAGNOSTICO;
            mostrarDiagnosticoBadge = true;
        }
        
        return `
            <div class="cotizacion-card-premium ${getEstadoClass(cotizacion.estado)}" onclick="verDetalleCotizacion(${cotizacion.id})">
                <div class="card-header-premium">
                    <div class="cotizacion-icono">
                        <i class="fas ${getEstadoIcon(cotizacion.estado)}"></i>
                    </div>
                    <div class="cotizacion-info-header">
                        <h3>${escapeHtml(cotizacion.codigo_orden)}</h3>
                        <p>${escapeHtml(cotizacion.vehiculo)} • ${escapeHtml(cotizacion.placa)}</p>
                    </div>
                    <span class="estado-badge-premium ${getEstadoClass(cotizacion.estado)}">
                        <i class="fas ${getEstadoIcon(cotizacion.estado)}"></i>
                        ${getEstadoTexto(cotizacion.estado)}
                    </span>
                </div>
                <div class="card-body-premium">
                    <div class="info-tag">
                        <i class="fas fa-calendar"></i>
                        <span>${formatDate(cotizacion.fecha)}</span>
                    </div>
                    <div class="monto-info">
                        <span class="monto-label">Monto:</span>
                        <span class="monto-valor ${esRechazada ? 'diagnostico' : ''}">
                            ${formatCurrency(montoMostrar)}
                            ${mostrarDiagnosticoBadge ? '<span class="diagnostico-badge"><i class="fas fa-stethoscope"></i> Diagnóstico</span>' : ''}
                        </span>
                    </div>
                </div>
                <div class="card-footer-premium">
                    <div class="servicios-count">
                        <i class="fas fa-tools"></i>
                        ${cotizacion.servicios_count || 0} servicio(s)
                    </div>
                    ${puedeAprobar ? `
                        <button class="btn-aprobar" onclick="event.stopPropagation(); verDetalleCotizacion(${cotizacion.id})">
                            <i class="fas fa-check-circle"></i> Revisar
                        </button>
                    ` : ''}
                    <button class="btn-imprimir" onclick="event.stopPropagation(); imprimirCotizacionDirecta(${cotizacion.id})">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// DETALLE DE COTIZACIÓN MEJORADO
// =====================================================

async function verDetalleCotizacion(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${id}`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = API_BASE_URL + '/';
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
    
    // Calcular totales
    let totalServiciosOriginal = 0;
    if (tieneServicios) {
        totalServiciosOriginal = cotizacion.servicios.reduce((sum, s) => sum + (s.precio || 0), 0);
    }
    
    let totalPagar = totalServiciosOriginal;
    let mostrarDiagnostico = false;
    
    if (esRechazada) {
        totalPagar = COSTO_DIAGNOSTICO;
        mostrarDiagnostico = true;
    }
    
    const serviciosHtml = (cotizacion.servicios || []).map((servicio, index) => `
        <div class="servicio-item-detalle ${servicio.aprobado_por_cliente ? 'aprobado' : ''}">
            <div class="servicio-info-detalle">
                <div class="servicio-descripcion">
                    <strong>${escapeHtml(servicio.descripcion)}</strong>
                </div>
                <div class="servicio-precio">
                    ${formatCurrency(servicio.precio)}
                </div>
            </div>
            ${puedeAprobar && !servicio.aprobado_por_cliente ? `
                <div class="servicio-acciones">
                    <label class="checkbox-label">
                        <input type="checkbox" class="servicio-checkbox" data-index="${index}" data-id="${servicio.id_servicio}">
                        <span class="checkbox-custom"></span>
                        Aprobar este servicio
                    </label>
                </div>
            ` : servicio.aprobado_por_cliente ? `
                <div class="servicio-aprobado-badge">
                    <i class="fas fa-check-circle"></i> Aprobado el ${formatDate(servicio.fecha_aprobacion)}
                </div>
            ` : ''}
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalDetalleBody');
    const accionesFooter = document.getElementById('cotizacionActions');
    
    if (modalBody) {
        modalBody.innerHTML = `
            ${mostrarDiagnostico ? `
                <div class="diagnostico-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>⚠️ Cotización Rechazada</strong>
                    <p>Esta cotización fue rechazada. Se aplicará el costo de diagnóstico de <strong>${formatCurrency(COSTO_DIAGNOSTICO)}</strong> por la revisión realizada al vehículo.</p>
                </div>
            ` : ''}
            
            <div class="detalle-grid-premium">
                <div class="detalle-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-info-circle"></i>
                        <span>Información de la Cotización</span>
                    </div>
                    <div class="detalle-card-content">
                        <div class="info-row">
                            <span class="label">Orden de Trabajo</span>
                            <span class="value">${escapeHtml(cotizacion.codigo_orden)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Vehículo</span>
                            <span class="value">${escapeHtml(cotizacion.vehiculo)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Placa</span>
                            <span class="value">${escapeHtml(cotizacion.placa)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Fecha de Emisión</span>
                            <span class="value">${formatDateTime(cotizacion.fecha_generacion)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Estado</span>
                            <span class="value ${getEstadoClass(cotizacion.estado)}">${getEstadoTexto(cotizacion.estado)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="detalle-card">
                <div class="detalle-card-title">
                    <i class="fas fa-tools"></i>
                    <span>Servicios Cotizados</span>
                </div>
                <div class="detalle-card-content">
                    ${tieneServicios ? `
                        <div class="servicios-lista-detalle">
                            ${serviciosHtml}
                        </div>
                        <div class="totales-detalle">
                            <div class="total-linea">
                                <span>Total Servicios:</span>
                                <span>${formatCurrency(totalServiciosOriginal)}</span>
                            </div>
                            ${mostrarDiagnostico ? `
                                <div class="total-linea diagnostico">
                                    <span><i class="fas fa-stethoscope"></i> Costo de Diagnóstico:</span>
                                    <span>${formatCurrency(COSTO_DIAGNOSTICO)}</span>
                                </div>
                            ` : ''}
                            <div class="total-linea gran-total">
                                <span>Total a Pagar:</span>
                                <span class="total-monto">${formatCurrency(totalPagar)}</span>
                            </div>
                        </div>
                    ` : `
                        <div class="empty-state-small">
                            <i class="fas fa-info-circle"></i>
                            <p>No hay servicios registrados</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
    
    // Configurar botones del footer
    if (accionesFooter) {
        if (esRechazada) {
            accionesFooter.innerHTML = `
                <button class="btn-secondary" onclick="cerrarModal('modalDetalleCotizacion')">
                    <i class="fas fa-times"></i> Cerrar
                </button>
            `;
        } else if (puedeAprobar && tieneServicios) {
            accionesFooter.innerHTML = `
                <button class="btn-secondary" onclick="cerrarModal('modalDetalleCotizacion')">
                    <i class="fas fa-times"></i> Cerrar
                </button>
                <button class="btn-warning" onclick="rechazarCotizacion()">
                    <i class="fas fa-times-circle"></i> Rechazar Cotización
                </button>
                <button class="btn-primary" onclick="aprobarServiciosSeleccionados()">
                    <i class="fas fa-check-double"></i> Aprobar Seleccionados
                </button>
                <button class="btn-primary" onclick="aprobarCotizacionCompleta()">
                    <i class="fas fa-check-circle"></i> Aprobar Todo
                </button>
            `;
        } else {
            accionesFooter.innerHTML = `
                <button class="btn-secondary" onclick="cerrarModal('modalDetalleCotizacion')">
                    <i class="fas fa-times"></i> Cerrar
                </button>
            `;
        }
    }
    
    abrirModal('modalDetalleCotizacion');
}

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
    
    const confirmar = await mostrarConfirmacion(
        '✅ Aprobar Cotización',
        `¿Estás seguro de que deseas aprobar TODOS los servicios?<br><br>
        <strong>Total: ${formatCurrency(currentCotizacion.total || 0)}</strong><br><br>
        Esto iniciará el trabajo en tu vehículo.`
    );
    
    if (!confirmar) return;
    
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
    
    const totalSeleccionado = currentCotizacion.servicios
        .filter((_, idx) => serviciosSeleccionados.includes(currentCotizacion.servicios[idx].id_servicio))
        .reduce((sum, s) => sum + (s.precio || 0), 0);
    
    const confirmar = await mostrarConfirmacion(
        '📝 Aprobar Servicios Seleccionados',
        `¿Aprobar ${serviciosSeleccionados.length} servicio(s)?<br><br>
        <strong>Total seleccionado: ${formatCurrency(totalSeleccionado)}</strong><br><br>
        Los servicios no seleccionados quedarán pendientes.`
    );
    
    if (!confirmar) return;
    
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

async function rechazarCotizacion() {
    const confirmar = await mostrarConfirmacion(
        '⚠️ Rechazar Cotización',
        `¿Estás seguro de que deseas RECHAZAR esta cotización?<br><br>
        <strong>Consecuencias:</strong><br>
        • Se aplicará el costo de diagnóstico de <strong>${formatCurrency(COSTO_DIAGNOSTICO)}</strong><br>
        • Este costo cubre la revisión técnica ya realizada<br>
        • El taller podrá preparar una nueva cotización<br><br>
        <strong>¿Confirmas el rechazo?</strong>`
    );
    
    if (!confirmar) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/cotizacion/${currentCotizacionId}/rechazar`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ motivo: '' })
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

function mostrarConfirmacion(titulo, mensaje) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalConfirmacion');
        const tituloEl = document.getElementById('confirmacionTitulo');
        const mensajeEl = document.getElementById('confirmacionMensaje');
        const confirmarBtn = document.getElementById('confirmarBtn');
        
        if (tituloEl) tituloEl.innerHTML = titulo;
        if (mensajeEl) mensajeEl.innerHTML = mensaje;
        
        const handleConfirm = () => {
            cerrarModal('modalConfirmacion');
            confirmarBtn.removeEventListener('click', handleConfirm);
            resolve(true);
        };
        
        const handleCancel = () => {
            cerrarModal('modalConfirmacion');
            document.querySelector('#modalConfirmacion .btn-secondary')?.removeEventListener('click', handleCancel);
            resolve(false);
        };
        
        confirmarBtn.addEventListener('click', handleConfirm);
        document.querySelector('#modalConfirmacion .btn-secondary')?.addEventListener('click', handleCancel);
        
        abrirModal('modalConfirmacion');
    });
}

// =====================================================
// IMPRESIÓN
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
    
    const totalServicios = cotizacion.total || 0;
    const totalFinal = esRechazada ? COSTO_DIAGNOSTICO : totalServicios;
    
    const serviciosHtml = (cotizacion.servicios || []).map(servicio => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(servicio.descripcion)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(servicio.precio)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                ${servicio.aprobado_por_cliente ? '✓ Aprobado' : '⏳ Pendiente'}
            </td>
        </tr>
    `).join('');
    
    const printContent = document.getElementById('printContent');
    if (printContent) {
        printContent.innerHTML = `
            <div class="cotizacion-print">
                <div class="print-header">
                    <img src="/img/logoblanco.jpeg" alt="FURIA MOTOR" style="height: 60px;" onerror="this.style.display='none'">
                    <h1>FURIA MOTOR COMPANY</h1>
                    <p>Centro de Servicio Automotriz</p>
                    <hr>
                    <h2>INFORME DE COTIZACIÓN</h2>
                </div>
                
                <div class="print-body">
                    <div class="info-section">
                        <p><strong>Orden de Trabajo:</strong> ${escapeHtml(cotizacion.codigo_orden)}</p>
                        <p><strong>Vehículo:</strong> ${escapeHtml(cotizacion.vehiculo)} - ${escapeHtml(cotizacion.placa)}</p>
                        <p><strong>Fecha de Emisión:</strong> ${formatDateTime(cotizacion.fecha_generacion)}</p>
                        <p><strong>Estado:</strong> ${getEstadoTexto(cotizacion.estado)}</p>
                    </div>
                    
                    <h3>Servicios Cotizados</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Descripción</th>
                                <th>Precio</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tieneServicios ? serviciosHtml : '<tr><td colspan="3" style="text-align: center;">No hay servicios registrados</td></tr>'}
                        </tbody>
                        <tfoot>
                            <tr class="total-row">
                                <td colspan="2" style="text-align: right;"><strong>Total:</strong></td>
                                <td style="text-align: right;"><strong>${formatCurrency(totalFinal)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                    
                    ${esRechazada ? `
                        <div class="diagnostico-nota">
                            <p><strong>⚠️ Nota:</strong> Esta cotización fue rechazada. Se aplica el costo de diagnóstico de ${formatCurrency(COSTO_DIAGNOSTICO)}.</p>
                        </div>
                    ` : ''}
                </div>
                
                <div class="print-footer">
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
                    .print-header { text-align: center; margin-bottom: 20px; }
                    .print-header h1 { color: #C1121F; margin: 0; }
                    .print-body { margin: 20px 0; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
                    th { background: #f5f5f5; }
                    .total-row { background: #f5f5f5; font-weight: bold; }
                    .diagnostico-nota { background: #fff3e0; padding: 10px; border-left: 4px solid #F59E0B; margin-top: 20px; }
                    .print-footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        .diagnostico-nota { break-inside: avoid; }
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
// AUTENTICACIÓN Y EVENTOS
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = API_BASE_URL + '/';
            return null;
        }
        
        const response = await fetch(`${API_URL}/perfil`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = API_BASE_URL + '/';
            return null;
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.usuario;
            
            const fechaElement = document.getElementById('currentDate');
            if (fechaElement) {
                const hoy = new Date();
                fechaElement.textContent = hoy.toLocaleDateString('es-ES', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
            
            return currentUser;
        }
        
        return null;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = API_BASE_URL + '/';
        return null;
    }
}

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
            timeout = setTimeout(() => cargarCotizaciones(), 300);
        });
    }
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