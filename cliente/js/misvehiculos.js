// =====================================================
// MISVEHICULOS.JS - CLIENTE (CORREGIDO)
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = '/api/cliente';  // CAMBIADO: sin window.location.origin
let currentUser = null;
let vehiculos = [];
let currentVehiculoId = null;
let currentOrdenId = null;

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
        'EnRecepcion': 'En Recepción',
        'EnDiagnostico': 'En Diagnóstico',
        'CotizacionEnviada': 'Cotización Enviada',
        'EnReparacion': 'En Reparación',
        'ControlCalidad': 'Control de Calidad',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado',
        'EnProceso': 'En Proceso',
        'EnPausa': 'En Pausa',
        'PendienteAprobacion': 'Pendiente de Aprobación'
    };
    return estados[estado] || estado;
}

function getEstadoClass(estado) {
    const classes = {
        'EnRecepcion': 'estado-EnRecepcion',
        'EnDiagnostico': 'estado-EnDiagnostico',
        'CotizacionEnviada': 'estado-CotizacionEnviada',
        'EnReparacion': 'estado-EnReparacion',
        'ControlCalidad': 'estado-ControlCalidad',
        'Finalizado': 'estado-Finalizado',
        'Entregado': 'estado-Entregado',
        'EnProceso': 'estado-EnProceso',
        'EnPausa': 'estado-EnPausa'
    };
    return classes[estado] || 'estado-EnRecepcion';
}

function getProgresoPorEstado(estado) {
    const progreso = {
        'EnRecepcion': 10,
        'EnDiagnostico': 25,
        'CotizacionEnviada': 40,
        'PendienteAprobacion': 45,
        'EnReparacion': 60,
        'ControlCalidad': 80,
        'Finalizado': 95,
        'Entregado': 100
    };
    return progreso[estado] || 0;
}

// =====================================================
// CARGA DE DATOS (CORREGIDO - ENDPOINTS CORRECTOS)
// =====================================================

async function cargarVehiculos() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const filtroEstado = document.getElementById('filtroEstado')?.value || 'all';
        
        // ENDPOINT CORREGIDO: /vehiculos (no /mis-vehiculos)
        const response = await fetch(`${API_URL}/vehiculos`, { 
            headers: getAuthHeaders() 
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            let vehiculosList = data.vehiculos || [];
            
            // Para cada vehículo, obtener sus órdenes
            const vehiculosConOrdenes = await Promise.all(vehiculosList.map(async (vehiculo) => {
                try {
                    const ordenesResponse = await fetch(`${API_URL}/vehiculo/${vehiculo.id}/ordenes`, {
                        headers: getAuthHeaders()
                    });
                    const ordenesData = await ordenesResponse.json();
                    
                    if (ordenesData.success && ordenesData.ordenes && ordenesData.ordenes.length > 0) {
                        const ultimaOrden = ordenesData.ordenes[0];
                        return {
                            ...vehiculo,
                            orden_actual: ultimaOrden,
                            estado_global: ultimaOrden.estado_global || 'EnRecepcion',
                            fecha_ingreso: ultimaOrden.fecha_ingreso,
                            codigo_unico: ultimaOrden.codigo_unico
                        };
                    }
                    return { ...vehiculo, orden_actual: null, estado_global: null };
                } catch (error) {
                    console.error(`Error obteniendo órdenes para vehículo ${vehiculo.id}:`, error);
                    return { ...vehiculo, orden_actual: null, estado_global: null };
                }
            }));
            
            // Filtrar por estado si es necesario
            let filteredVehiculos = vehiculosConOrdenes;
            if (filtroEstado !== 'all') {
                filteredVehiculos = vehiculosConOrdenes.filter(v => v.estado_global === filtroEstado);
            }
            
            // Filtrar por búsqueda
            if (search) {
                filteredVehiculos = filteredVehiculos.filter(v => 
                    (v.placa || '').toLowerCase().includes(search) ||
                    (v.marca || '').toLowerCase().includes(search) ||
                    (v.modelo || '').toLowerCase().includes(search)
                );
            }
            
            vehiculos = filteredVehiculos;
            renderizarVehiculos(filteredVehiculos);
        } else {
            showToast(data.error || 'Error al cargar vehículos', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
        
        const container = document.getElementById('vehiculosGrid');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error de conexión</p>
                    <small>No se pudieron cargar los vehículos</small>
                    <button onclick="cargarVehiculos()" class="btn-retry">
                        <i class="fas fa-sync-alt"></i> Reintentar
                    </button>
                </div>
            `;
        }
    } finally {
        mostrarLoading(false);
    }
}

function renderizarVehiculos(vehiculosList) {
    const container = document.getElementById('vehiculosGrid');
    if (!container) return;
    
    if (vehiculosList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-car-side"></i>
                <p>No tienes vehículos en el taller actualmente</p>
                <small>Cuando lleves tu vehículo al taller, aparecerá aquí con el estado de la reparación</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = vehiculosList.map(vehiculo => {
        const estado = vehiculo.estado_global || 'Sin orden';
        const progreso = getProgresoPorEstado(estado);
        
        return `
            <div class="vehiculo-card" onclick="verDetalleVehiculo(${vehiculo.id})">
                <div class="vehiculo-header">
                    <h3>
                        <i class="fas fa-car"></i>
                        ${escapeHtml(vehiculo.placa)}
                    </h3>
                    <span class="placa-badge">${escapeHtml(vehiculo.placa)}</span>
                </div>
                <div class="vehiculo-body">
                    <div class="vehiculo-info">
                        <div class="info-item">
                            <i class="fas fa-tag"></i>
                            <span><strong>${escapeHtml(vehiculo.marca)}</strong> ${escapeHtml(vehiculo.modelo)}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-calendar-alt"></i>
                            <span>Año: ${vehiculo.anio || 'N/A'}</span>
                        </div>
                        ${vehiculo.fecha_ingreso ? `
                            <div class="info-item">
                                <i class="fas fa-clock"></i>
                                <span>Ingreso: ${formatDate(vehiculo.fecha_ingreso)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${vehiculo.estado_global ? `
                        <div class="estado-badge ${getEstadoClass(vehiculo.estado_global)}">
                            <i class="fas fa-chart-simple"></i>
                            ${getEstadoTexto(vehiculo.estado_global)}
                        </div>
                        
                        <div class="progreso-container">
                            <div class="progreso-label">
                                <span>Progreso de reparación</span>
                                <span>${progreso}%</span>
                            </div>
                            <div class="progreso-bar">
                                <div class="progreso-fill" style="width: ${progreso}%"></div>
                            </div>
                        </div>
                    ` : `
                        <div class="estado-badge" style="background: rgba(107, 114, 128, 0.15); color: #6B7280;">
                            <i class="fas fa-clock"></i>
                            Sin órdenes activas
                        </div>
                    `}
                </div>
                <div class="vehiculo-footer">
                    <span>Última actualización: ${formatDate(new Date())}</span>
                    <button class="btn-ver-detalle" onclick="event.stopPropagation(); verDetalleVehiculo(${vehiculo.id})">
                        <i class="fas fa-eye"></i> Ver detalles
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// DETALLE DE VEHÍCULO (CORREGIDO)
// =====================================================

async function verDetalleVehiculo(id) {
    mostrarLoading(true);
    
    try {
        // Obtener el vehículo
        const vehiculoResponse = await fetch(`${API_URL}/vehiculos`, { 
            headers: getAuthHeaders() 
        });
        const vehiculoData = await vehiculoResponse.json();
        
        if (!vehiculoData.success) {
            throw new Error('Error al cargar datos del vehículo');
        }
        
        const vehiculo = vehiculoData.vehiculos.find(v => v.id === id);
        if (!vehiculo) {
            throw new Error('Vehículo no encontrado');
        }
        
        // Obtener órdenes del vehículo
        const ordenesResponse = await fetch(`${API_URL}/vehiculo/${id}/ordenes`, {
            headers: getAuthHeaders()
        });
        const ordenesData = await ordenesResponse.json();
        
        currentVehiculoId = id;
        currentOrdenId = ordenesData.ordenes?.[0]?.id || null;
        
        mostrarDetalleVehiculo(vehiculo, ordenesData.ordenes || []);
        
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message || 'Error al cargar detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarDetalleVehiculo(vehiculo, ordenes) {
    const ordenActual = ordenes[0] || null;
    const estado = ordenActual?.estado_global || 'Sin orden';
    const progreso = getProgresoPorEstado(estado);
    
    const modalBody = document.getElementById('modalDetalleBody');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
        <div class="detalle-seccion">
            <h4><i class="fas fa-car"></i> Información del Vehículo</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="label">Placa</span>
                    <span class="value"><strong>${escapeHtml(vehiculo.placa)}</strong></span>
                </div>
                <div class="detalle-item">
                    <span class="label">Marca / Modelo</span>
                    <span class="value">${escapeHtml(vehiculo.marca)} ${escapeHtml(vehiculo.modelo || '')}</span>
                </div>
                <div class="detalle-item">
                    <span class="label">Año</span>
                    <span class="value">${vehiculo.anio || 'N/A'}</span>
                </div>
                <div class="detalle-item">
                    <span class="label">Kilometraje</span>
                    <span class="value">${vehiculo.kilometraje?.toLocaleString() || '0'} km</span>
                </div>
            </div>
        </div>
        
        ${ordenActual ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-clipboard-list"></i> Orden de Trabajo Actual</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="label">Código</span>
                        <span class="value"><strong>${escapeHtml(ordenActual.codigo_unico || 'N/A')}</strong></span>
                    </div>
                    <div class="detalle-item">
                        <span class="label">Estado</span>
                        <span class="value estado-badge ${getEstadoClass(ordenActual.estado_global)}" style="display: inline-block;">
                            ${getEstadoTexto(ordenActual.estado_global)}
                        </span>
                    </div>
                    <div class="detalle-item">
                        <span class="label">Fecha de Ingreso</span>
                        <span class="value">${formatDateTime(ordenActual.fecha_ingreso)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="label">Progreso</span>
                        <span class="value">${progreso}%</span>
                    </div>
                </div>
                <div class="progreso-container" style="margin-top: 1rem;">
                    <div class="progreso-bar">
                        <div class="progreso-fill" style="width: ${progreso}%"></div>
                    </div>
                </div>
            </div>
            
            <div class="detalle-seccion">
                <h4><i class="fas fa-chart-line"></i> Línea de Tiempo</h4>
                ${generarTimelineHtml(ordenActual.estado_global)}
            </div>
        ` : `
            <div class="detalle-seccion">
                <div class="empty-state" style="padding: 2rem; text-align: center;">
                    <i class="fas fa-check-circle" style="font-size: 3rem; color: var(--verde-exito);"></i>
                    <p style="margin-top: 1rem;">No hay órdenes de trabajo activas para este vehículo</p>
                    <small>Si deseas realizar un servicio, agenda una cita con nosotros</small>
                </div>
            </div>
        `}
    `;
    
    // Mostrar/ocultar botón de cotización
    const btnCotizacion = document.getElementById('btnVerCotizacion');
    if (btnCotizacion) {
        const tieneCotizacion = ordenActual && 
            ['CotizacionEnviada', 'EnReparacion', 'ControlCalidad', 'PendienteAprobacion'].includes(ordenActual.estado_global);
        btnCotizacion.style.display = tieneCotizacion ? 'inline-flex' : 'none';
    }
    
    abrirModal('modalDetalleVehiculo');
}

function generarTimelineHtml(estadoActual) {
    const estados = [
        { key: 'EnRecepcion', label: 'Recepción del Vehículo', icon: 'fa-clipboard-list' },
        { key: 'EnDiagnostico', label: 'Diagnóstico', icon: 'fa-stethoscope' },
        { key: 'CotizacionEnviada', label: 'Cotización', icon: 'fa-file-invoice-dollar' },
        { key: 'PendienteAprobacion', label: 'Aprobación', icon: 'fa-check-circle' },
        { key: 'EnReparacion', label: 'Reparación', icon: 'fa-wrench' },
        { key: 'ControlCalidad', label: 'Control de Calidad', icon: 'fa-clipboard-check' },
        { key: 'Finalizado', label: 'Finalizado', icon: 'fa-flag-checkered' },
        { key: 'Entregado', label: 'Entregado', icon: 'fa-handshake' }
    ];
    
    let encontrado = false;
    
    const timelineItems = estados.map(estado => {
        const isCompleted = encontrado ? false : (estado.key === estadoActual);
        const isCurrent = estado.key === estadoActual;
        
        if (estado.key === estadoActual) {
            encontrado = true;
        }
        
        return `
            <div class="timeline-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}">
                <div class="timeline-dot">
                    <i class="fas ${estado.icon}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-title">${estado.label}</div>
                    ${isCurrent ? '<div class="timeline-status">En curso...</div>' : ''}
                </div>
            </div>
        `;
    }).join('');
    
    return `<div class="timeline">${timelineItems}</div>`;
}

function verCotizacion() {
    if (currentOrdenId) {
        window.location.href = `/cliente/cotizaciones.html?orden=${currentOrdenId}`;
    } else {
        showToast('No hay cotización disponible para este vehículo', 'warning');
    }
}

// =====================================================
// AUTENTICACIÓN (CORREGIDO)
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            console.log('❌ No hay token');
            window.location.href = '/';
            return null;
        }
        
        const response = await fetch(`${API_URL}/perfil`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            console.log('❌ Token inválido');
            localStorage.clear();
            window.location.href = '/';
            return null;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.usuario) {
            currentUser = data.usuario;
            console.log('✅ Usuario cargado:', currentUser.nombre);
            
            // Actualizar nombre en sidebar
            const userNameSpan = document.querySelector('.user-name');
            if (userNameSpan) {
                userNameSpan.textContent = currentUser.nombre || 'Cliente';
            }
            
            // Mostrar fecha
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
        console.error('Error cargando usuario:', error);
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
            cargarVehiculos();
            showToast('Actualizando...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarVehiculos());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => cargarVehiculos(), 500);
        });
    }
    
    // Cerrar modales
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando misvehiculos.js');
    
    mostrarLoading(true);
    
    try {
        const user = await cargarUsuarioActual();
        if (!user) return;
        
        await cargarVehiculos();
        setupEventListeners();
        
        console.log('✅ misvehiculos.js inicializado correctamente');
    } catch (error) {
        console.error('Error en inicialización:', error);
    } finally {
        mostrarLoading(false);
    }
}

// Exponer funciones globales
window.verDetalleVehiculo = verDetalleVehiculo;
window.verCotizacion = verCotizacion;
window.cerrarModal = cerrarModal;
window.cargarVehiculos = cargarVehiculos;

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', inicializar);