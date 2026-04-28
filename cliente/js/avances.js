// =====================================================
// AVANCES.JS - CLIENTE
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/cliente';
let currentUser = null;
let avances = [];
let currentAvance = null;
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
        'EnRecepcion': 'En Recepción',
        'EnDiagnostico': 'En Diagnóstico',
        'CotizacionEnviada': 'Cotización Enviada',
        'EnReparacion': 'En Reparación',
        'ControlCalidad': 'Control de Calidad',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado'
    };
    return estados[estado] || estado;
}

function getProgresoPorEstado(estado) {
    const progreso = {
        'EnRecepcion': 10,
        'EnDiagnostico': 25,
        'CotizacionEnviada': 40,
        'EnReparacion': 60,
        'ControlCalidad': 80,
        'Finalizado': 95,
        'Entregado': 100
    };
    return progreso[estado] || 0;
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarAvances() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const filtroEstado = document.getElementById('filtroEstado')?.value || 'all';
        
        let url = `${API_URL}/avances`;
        const params = new URLSearchParams();
        if (filtroEstado !== 'all') params.append('estado', filtroEstado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            let avancesList = data.avances || [];
            
            if (search) {
                avancesList = avancesList.filter(a => 
                    (a.codigo_orden || '').toLowerCase().includes(search) ||
                    (a.placa || '').toLowerCase().includes(search) ||
                    (a.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            avances = avancesList;
            renderizarAvances(avancesList);
        } else {
            showToast(data.error || 'Error al cargar avances', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarAvances(avancesList) {
    const container = document.getElementById('avancesGrid');
    if (!container) return;
    
    if (avancesList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-chart-line"></i>
                <p>No hay reparaciones en proceso</p>
                <small>Cuando tu vehículo esté en el taller, aparecerá aquí</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = avancesList.map(avance => {
        const progreso = getProgresoPorEstado(avance.estado);
        const esActivo = avance.estado !== 'Entregado' && avance.estado !== 'Finalizado';
        
        return `
            <div class="avance-card" onclick="verDetalleAvance(${avance.orden_id})">
                <div class="avance-header">
                    <div class="avance-codigo">
                        <i class="fas fa-clipboard-list"></i>
                        ${escapeHtml(avance.codigo_orden)}
                    </div>
                    <span class="avance-estado estado-${avance.estado === 'Entregado' || avance.estado === 'Finalizado' ? 'completado' : 'activo'}">
                        ${getEstadoTexto(avance.estado)}
                    </span>
                </div>
                <div class="avance-body">
                    <div class="vehiculo-info">
                        <div class="info-item">
                            <i class="fas fa-car"></i>
                            <span>${escapeHtml(avance.vehiculo)}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-id-card"></i>
                            <span>Placa: ${escapeHtml(avance.placa)}</span>
                        </div>
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
                    
                    <div class="fechas-info">
                        <div class="fecha-item">
                            <span class="fecha-label">Ingreso</span>
                            <span class="fecha-valor">${formatDate(avance.fecha_ingreso)}</span>
                        </div>
                        ${avance.fecha_estimada ? `
                            <div class="fecha-item">
                                <span class="fecha-label">Entrega estimada</span>
                                <span class="fecha-valor">${formatDate(avance.fecha_estimada)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${avance.ultima_actividad ? `
                        <div class="ultima-actividad">
                            <p><i class="fas fa-clock"></i> Última actividad:</p>
                            <strong>${escapeHtml(avance.ultima_actividad)}</strong>
                        </div>
                    ` : ''}
                    
                    <button class="btn-ver-avance" onclick="event.stopPropagation(); verDetalleAvance(${avance.orden_id})">
                        <i class="fas fa-eye"></i> Ver detalles del avance
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// DETALLE DE AVANCE
// =====================================================

async function verDetalleAvance(ordenId) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/avance-detalle/${ordenId}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentOrdenId = ordenId;
            currentAvance = data.avance;
            mostrarDetalleAvance(data.avance);
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

function mostrarDetalleAvance(avance) {
    const progreso = getProgresoPorEstado(avance.estado);
    const esCompletado = avance.estado === 'Entregado' || avance.estado === 'Finalizado';
    
    // Generar timeline de pasos
    const stepsTimeline = generarTimelinePasos(avance);
    
    // Generar actividades recientes
    const actividadesHtml = generarActividadesHtml(avance.actividades || []);
    
    // Generar técnicos asignados
    const tecnicosHtml = generarTecnicosHtml(avance.tecnicos || []);
    
    const modalBody = document.getElementById('modalDetalleBody');
    modalBody.innerHTML = `
        <div class="detalle-seccion">
            <h4><i class="fas fa-info-circle"></i> Información General</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Orden de Trabajo</span>
                    <span class="detalle-value"><strong>${escapeHtml(avance.codigo_orden)}</strong></span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Estado Actual</span>
                    <span class="detalle-value">${getEstadoTexto(avance.estado)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Fecha de Ingreso</span>
                    <span class="detalle-value">${formatDateTime(avance.fecha_ingreso)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Progreso</span>
                    <span class="detalle-value">${progreso}%</span>
                </div>
            </div>
            <div class="progreso-bar" style="margin-top: 0.5rem;">
                <div class="progreso-fill" style="width: ${progreso}%"></div>
            </div>
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-car"></i> Información del Vehículo</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Placa</span>
                    <span class="detalle-value">${escapeHtml(avance.placa)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Vehículo</span>
                    <span class="detalle-value">${escapeHtml(avance.vehiculo)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Kilometraje</span>
                    <span class="detalle-value">${avance.kilometraje?.toLocaleString() || '0'} km</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Año</span>
                    <span class="detalle-value">${avance.anio || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-chart-line"></i> Progreso de la Reparación</h4>
            ${stepsTimeline}
        </div>
        
        ${avance.descripcion_problema ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-pencil-alt"></i> Descripción del Problema</h4>
                <div class="detalle-descripcion">
                    ${escapeHtml(avance.descripcion_problema)}
                </div>
            </div>
        ` : ''}
        
        ${tecnicosHtml ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-users"></i> Técnicos Asignados</h4>
                <div class="tecnicos-list">${tecnicosHtml}</div>
            </div>
        ` : ''}
        
        ${actividadesHtml ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-history"></i> Historial de Actividades</h4>
                <div class="actividades-list">${actividadesHtml}</div>
            </div>
        ` : ''}
        
        ${avance.sugerencias ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-comment-dots"></i> Sugerencias del Taller</h4>
                <div class="detalle-descripcion">
                    ${escapeHtml(avance.sugerencias)}
                </div>
            </div>
        ` : ''}
    `;
    
    // Mostrar/ocultar botón de orden completa
    const btnVerOrden = document.getElementById('btnVerOrden');
    if (btnVerOrden) {
        btnVerOrden.style.display = esCompletado ? 'flex' : 'none';
    }
    
    abrirModal('modalDetalleAvance');
}

function generarTimelinePasos(avance) {
    const pasos = [
        { key: 'EnRecepcion', label: 'Recepción del Vehículo', icon: 'fa-clipboard-list', desc: 'Vehículo ingresado al taller' },
        { key: 'EnDiagnostico', label: 'Diagnóstico', icon: 'fa-stethoscope', desc: 'Técnico realizando diagnóstico' },
        { key: 'CotizacionEnviada', label: 'Cotización', icon: 'fa-file-invoice-dollar', desc: 'Cotización enviada al cliente' },
        { key: 'EnReparacion', label: 'Reparación', icon: 'fa-tools', desc: 'Vehículo en proceso de reparación' },
        { key: 'ControlCalidad', label: 'Control de Calidad', icon: 'fa-clipboard-check', desc: 'Verificación final' },
        { key: 'Finalizado', label: 'Finalizado', icon: 'fa-check-circle', desc: 'Reparación completada' },
        { key: 'Entregado', label: 'Entregado', icon: 'fa-handshake', desc: 'Vehículo entregado al cliente' }
    ];
    
    let encontrado = false;
    const estadoActual = avance.estado;
    
    const timelineItems = pasos.map(paso => {
        const isCompleted = encontrado ? false : (paso.key === estadoActual || encontrado);
        if (paso.key === estadoActual) encontrado = true;
        
        let fecha = '';
        if (paso.key === 'EnRecepcion' && avance.fecha_ingreso) {
            fecha = formatDate(avance.fecha_ingreso);
        } else if (paso.key === 'Entregado' && avance.fecha_entrega) {
            fecha = formatDate(avance.fecha_entrega);
        }
        
        return `
            <div class="step-item">
                <div class="step-icon ${isCompleted ? 'completed' : ''} ${paso.key === estadoActual ? 'current' : ''}">
                    <i class="fas ${paso.icon}"></i>
                </div>
                <div class="step-content">
                    <div class="step-title">${paso.label}</div>
                    ${fecha ? `<div class="step-date">${fecha}</div>` : ''}
                    <div class="step-desc">${paso.desc}</div>
                </div>
            </div>
        `;
    }).join('');
    
    return `<div class="steps-timeline">${timelineItems}</div>`;
}

function generarActividadesHtml(actividades) {
    if (!actividades || actividades.length === 0) return '';
    
    const iconos = {
        'diagnostico': 'fa-stethoscope',
        'reparacion': 'fa-tools',
        'calidad': 'fa-clipboard-check',
        'entrega': 'fa-handshake'
    };
    
    return actividades.map(act => `
        <div class="actividad-item">
            <div class="actividad-icon">
                <i class="fas ${iconos[act.tipo] || 'fa-clock'}"></i>
            </div>
            <div class="actividad-content">
                <div class="actividad-desc">${escapeHtml(act.descripcion)}</div>
                <div class="actividad-fecha">${formatDateTime(act.fecha)}</div>
                ${act.tecnico ? `<div class="actividad-tecnico"><i class="fas fa-user"></i> ${escapeHtml(act.tecnico)}</div>` : ''}
            </div>
        </div>
    `).join('');
}

function generarTecnicosHtml(tecnicos) {
    if (!tecnicos || tecnicos.length === 0) return '';
    
    return tecnicos.map(tec => `
        <div class="tecnico-tag">
            <i class="fas fa-user"></i>
            ${escapeHtml(tec.nombre)}
            ${tec.especialidad ? `<span style="font-size: 0.65rem;">(${escapeHtml(tec.especialidad)})</span>` : ''}
        </div>
    `).join('');
}

// =====================================================
// ORDEN COMPLETA
// =====================================================

async function verOrdenCompleta() {
    if (!currentOrdenId) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/orden-completa/${currentOrdenId}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarOrdenCompleta(data.orden);
        } else {
            showToast(data.error || 'Error al cargar orden', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarOrdenCompleta(orden) {
    const modalBody = document.getElementById('modalOrdenBody');
    modalBody.innerHTML = `
        <div class="orden-completa">
            <div class="orden-header">
                <h2>FURIA MOTOR COMPANY</h2>
                <h3>Orden de Trabajo Completada</h3>
                <hr>
            </div>
            
            <div class="resumen-grid">
                <div class="resumen-item">
                    <span class="resumen-label">Código de Orden</span>
                    <span class="resumen-value"><strong>${escapeHtml(orden.codigo_orden)}</strong></span>
                </div>
                <div class="resumen-item">
                    <span class="resumen-label">Fecha de Completado</span>
                    <span class="resumen-value">${formatDateTime(orden.fecha_completado)}</span>
                </div>
            </div>
            
            <div class="detalle-seccion">
                <h4><i class="fas fa-user"></i> Datos del Cliente</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Nombre</span>
                        <span class="detalle-value">${escapeHtml(orden.cliente_nombre)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Teléfono</span>
                        <span class="detalle-value">${escapeHtml(orden.cliente_telefono)}</span>
                    </div>
                </div>
            </div>
            
            <div class="detalle-seccion">
                <h4><i class="fas fa-car"></i> Datos del Vehículo</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Placa</span>
                        <span class="detalle-value">${escapeHtml(orden.placa)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Vehículo</span>
                        <span class="detalle-value">${escapeHtml(orden.vehiculo)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Kilometraje Ingreso</span>
                        <span class="detalle-value">${orden.kilometraje_ingreso?.toLocaleString() || '0'} km</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Kilometraje Salida</span>
                        <span class="detalle-value">${orden.kilometraje_salida?.toLocaleString() || '0'} km</span>
                    </div>
                </div>
            </div>
            
            <div class="detalle-seccion">
                <h4><i class="fas fa-tools"></i> Trabajos Realizados</h4>
                <div class="detalle-descripcion">
                    ${escapeHtml(orden.trabajos_realizados || 'No se registraron detalles')}
                </div>
            </div>
            
            ${orden.observaciones ? `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-comment-dots"></i> Observaciones</h4>
                    <div class="detalle-descripcion">
                        ${escapeHtml(orden.observaciones)}
                    </div>
                </div>
            ` : ''}
            
            <div class="orden-footer" style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                <p style="color: var(--gris-texto); font-size: 12px;">
                    Documento generado automáticamente por FURIA MOTOR - Sistema de Gestión de Taller
                </p>
            </div>
        </div>
    `;
    
    cerrarModal('modalDetalleAvance');
    abrirModal('modalOrdenCompleta');
}

function imprimirOrden() {
    const modalContent = document.getElementById('modalOrdenBody');
    if (!modalContent) return;
    
    const contenido = modalContent.innerHTML;
    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
            <head>
                <title>Orden de Trabajo Completada</title>
                <style>
                    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 0; padding: 20px; }
                    .orden-completa { max-width: 800px; margin: 0 auto; }
                    .orden-header { text-align: center; margin-bottom: 20px; }
                    .orden-header h2 { color: #C1121F; margin-bottom: 5px; }
                    .orden-header hr { border: 1px solid #C1121F; }
                    .resumen-grid, .detalle-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px; }
                    .resumen-label, .detalle-label { font-size: 0.7rem; text-transform: uppercase; color: #666; }
                    .resumen-value, .detalle-value { font-weight: 500; color: #333; }
                    .detalle-seccion h4 { color: #333; border-bottom: 2px solid #C1121F; padding-bottom: 5px; margin-bottom: 10px; }
                    .detalle-descripcion { background: #f5f5f5; padding: 10px; border-radius: 5px; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                ${contenido}
            </body>
        </html>
    `);
    ventana.document.close();
    ventana.print();
    cerrarModal('modalOrdenCompleta');
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
            cargarAvances();
            showToast('Actualizando...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarAvances());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarAvances());
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando avances.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarAvances();
    setupEventListeners();
    
    console.log('✅ avances.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalleAvance = verDetalleAvance;
window.verOrdenCompleta = verOrdenCompleta;
window.imprimirOrden = imprimirOrden;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);