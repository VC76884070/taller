// =====================================================
// DASHBOARD JEFE OPERATIVO - VERSIÓN COMPLETA Y CORREGIDA
// BASADA EN EL CÓDIGO FUNCIONAL DE JEFE TALLER
// =====================================================

if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 Modo DESARROLLO');
            return 'http://localhost:5000';
        }
        return '';
    })();
}

const API_URL = window.API_BASE_URL + '/api/jefe-operativo';
let calendar = null;
let ordenesActivas = [];
let currentUser = null;
let comunicadosActuales = [];

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando dashboard Jefe Operativo');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    await cargarDatosIniciales();
    initFullCalendar();
    setupEventListeners();
    crearModalComunicados();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    if (!token) {
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUser = payload.user;
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', { 
                year: 'numeric', month: 'long', day: 'numeric' 
            });
        }
        return true;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
}

function getHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('furia_token')}`,
        'Content-Type': 'application/json'
    };
}

function setupEventListeners() {
    // Click en campanita para abrir modal de comunicados
    const notificationIcon = document.querySelector('.notification-icon');
    if (notificationIcon) {
        notificationIcon.removeEventListener('click', abrirModalComunicados);
        notificationIcon.addEventListener('click', abrirModalComunicados);
    }
    
    // Botón de actualización manual
    const refreshBtn = document.getElementById('manualRefreshBtn');
    if (refreshBtn) {
        refreshBtn.removeEventListener('click', manualRefresh);
        refreshBtn.addEventListener('click', manualRefresh);
    }
}

// =====================================================
// CARGAR DATOS INICIALES
// =====================================================

async function cargarDatosIniciales() {
    mostrarLoading(true);
    try {
        console.log('🔄 Cargando datos del dashboard...');
        
        const [ordenesRes, statsRes, entregasRes, vehiculosRes] = await Promise.all([
            fetch(`${API_URL}/mis-ordenes-activas`, { headers: getHeaders() }),
            fetch(`${API_URL}/mis-stats`, { headers: getHeaders() }),
            fetch(`${API_URL}/mis-proximas-entregas`, { headers: getHeaders() }),
            fetch(`${API_URL}/mis-vehiculos-taller`, { headers: getHeaders() })
        ]);
        
        const ordenes = await ordenesRes.json();
        const stats = await statsRes.json();
        const entregas = await entregasRes.json();
        const vehiculos = await vehiculosRes.json();
        
        // Guardar órdenes activas para el calendario
        if (ordenes.success && ordenes.ordenes) {
            ordenesActivas = ordenes.ordenes;
            console.log(`📊 Órdenes activas cargadas: ${ordenesActivas.length}`);
        }
        
        // Actualizar KPIs
        if (stats.success && stats.stats) {
            actualizarKPI('ingresadosHoy', stats.stats.ingresados_hoy || 0);
            actualizarKPI('enProceso', stats.stats.en_proceso || 0);
            actualizarKPI('enPausa', stats.stats.en_pausa || 0);
        }
        
        // Renderizar próximas entregas
        if (entregas.success && entregas.entregas && entregas.entregas.length > 0) {
            renderizarEntregas(entregas.entregas);
            actualizarKPI('proximasEntregasCount', entregas.entregas.length);
        } else {
            renderizarVacio('entregasList', 'No hay entregas pendientes');
        }
        
        // Renderizar vehículos en taller
        if (vehiculos.success && vehiculos.vehiculos && vehiculos.vehiculos.length > 0) {
            renderizarVehiculosTaller(vehiculos.vehiculos);
            actualizarKPI('vehiculosTallerCount', vehiculos.vehiculos.length);
        } else {
            renderizarVacio('vehiculosTallerList', 'No hay vehículos en taller');
        }
        
        // Cargar comunicados y actualizar badge
        await cargarContadorComunicados();
        
        // Refrescar calendario
        if (calendar) {
            calendar.refetchEvents();
        }
        
        console.log('✅ Dashboard cargado correctamente');
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarNotificacion('Error al cargar datos del servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cargarContadorComunicados() {
    try {
        const response = await fetch(`${API_URL}/mis-comunicados`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        console.log('📬 Comunicados recibidos:', data);
        
        if (data.success && data.comunicados) {
            const cantidad = data.comunicados.length;
            const badge = document.getElementById('notificacionesCount');
            if (badge) {
                badge.textContent = cantidad;
                badge.style.display = cantidad > 0 ? 'inline-block' : 'none';
            }
            // Guardar en cache
            comunicadosActuales = data.comunicados;
        }
    } catch (error) {
        console.error('Error cargando contador de comunicados:', error);
    }
}

function actualizarKPI(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.textContent = valor;
    }
}

function renderizarVacio(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${mensaje}</p></div>`;
    }
}

// =====================================================
// RENDERIZADO DE COMPONENTES
// =====================================================

function renderizarEntregas(entregas) {
    const container = document.getElementById('entregasList');
    if (!container) return;
    
    if (!entregas || entregas.length === 0) {
        renderizarVacio('entregasList', 'No hay entregas pendientes');
        return;
    }
    
    let html = '';
    for (let i = 0; i < Math.min(entregas.length, 15); i++) {
        const e = entregas[i];
        let prioridadClass = '';
        let diasTexto = '';
        let statusText = '';
        
        if (e.prioridad === 'urgente') {
            prioridadClass = 'urgente';
            diasTexto = `⚠️ Atrasado ${Math.abs(e.dias_restantes)} días`;
            statusText = 'Atrasado';
        } else if (e.prioridad === 'hoy') {
            prioridadClass = 'hoy';
            diasTexto = '📅 Entrega HOY';
            statusText = 'Hoy';
        } else if (e.prioridad === 'pronto') {
            prioridadClass = 'pronto';
            diasTexto = `⏰ ${e.dias_restantes} días`;
            statusText = 'Próximo';
        } else if (e.dias_restantes !== null && e.dias_restantes !== undefined) {
            diasTexto = `${e.dias_restantes} días`;
            statusText = 'Próximo';
        } else {
            diasTexto = 'Fecha no definida';
            statusText = 'Pendiente';
        }
        
        html += `
            <div class="entrega-item ${prioridadClass}" onclick="window.verOrdenTrabajo(${e.id_orden})">
                <div class="entrega-icon"><i class="fas fa-calendar-check"></i></div>
                <div class="entrega-content">
                    <h4>${escapeHtml(e.vehiculo)} <span class="placa">${escapeHtml(e.placa)}</span></h4>
                    <p class="entrega-total">${diasTexto}</p>
                </div>
                <div class="entrega-status">
                    <span class="status-badge ${prioridadClass === 'urgente' ? 'pendiente' : 'aprobada'}">
                        ${statusText}
                    </span>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function renderizarVehiculosTaller(vehiculos) {
    const container = document.getElementById('vehiculosTallerList');
    if (!container) return;
    
    if (!vehiculos || vehiculos.length === 0) {
        renderizarVacio('vehiculosTallerList', 'No hay vehículos en taller');
        return;
    }
    
    const estadoColor = {
        'EnRecepcion': '#FF9800', 'EnDiagnostico': '#2196F3', 'EnReparacion': '#4CAF50',
        'EnPausa': '#9E9E9E', 'PendienteAprobacion': '#FF5722', 'ReparacionCompletada': '#8BC34A'
    };
    
    const estadoDisplay = {
        'EnRecepcion': 'En Recepción', 'EnDiagnostico': 'En Diagnóstico', 'EnReparacion': 'En Reparación',
        'EnPausa': 'En Pausa', 'ReparacionCompletada': 'Reparación Completada',
        'Finalizado': 'Finalizado', 'Entregado': 'Entregado', 'PendienteAprobacion': 'Pendiente Aprobación'
    };
    
    let html = '';
    for (let i = 0; i < Math.min(vehiculos.length, 15); i++) {
        const v = vehiculos[i];
        let diasTexto = '';
        let diasClass = '';
        
        if (v.dias_restantes !== null && v.dias_restantes !== undefined) {
            if (v.dias_restantes < 0) {
                diasClass = 'atrasado';
                diasTexto = `Atrasado ${Math.abs(v.dias_restantes)}d`;
            } else if (v.dias_restantes === 0) {
                diasClass = 'urgente';
                diasTexto = 'Hoy';
            } else if (v.dias_restantes <= 3) {
                diasClass = 'urgente';
                diasTexto = `${v.dias_restantes} días`;
            } else {
                diasTexto = `${v.dias_restantes} días`;
            }
        }
        
        html += `
            <div class="vehiculo-taller-item" onclick="window.verOrdenTrabajo(${v.id_orden})">
                <div class="vehiculo-taller-icon"><i class="fas fa-car-side"></i></div>
                <div class="vehiculo-taller-info">
                    <div class="vehiculo-taller-placa">${escapeHtml(v.placa)}</div>
                    <div class="vehiculo-taller-modelo">${escapeHtml(v.vehiculo)}</div>
                    <div class="vehiculo-taller-estado" style="color: ${estadoColor[v.estado] || '#666'}">
                        <i class="fas fa-circle" style="font-size: 8px;"></i> ${estadoDisplay[v.estado] || v.estado || 'En proceso'}
                    </div>
                </div>
                ${diasTexto ? `<div class="vehiculo-taller-dias ${diasClass}">${diasTexto}</div>` : ''}
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// =====================================================
// FULLCALENDAR
// =====================================================

function initFullCalendar() {
    const container = document.getElementById('calendarioOperativo');
    if (!container) {
        console.error('❌ No se encontró el contenedor del calendario');
        return;
    }
    
    if (typeof FullCalendar === 'undefined') {
        console.error('❌ FullCalendar no está cargado');
        setTimeout(() => initFullCalendar(), 500);
        return;
    }
    
    console.log('✅ Inicializando FullCalendar...');
    
    calendar = new FullCalendar.Calendar(container, {
        locale: 'es',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        height: 'auto',
        weekends: true,
        nowIndicator: true,
        
        events: function(fetchInfo, successCallback, failureCallback) {
            console.log('📅 Generando eventos del calendario...');
            
            if (!ordenesActivas.length) {
                console.log('📭 No hay órdenes activas');
                successCallback([]);
                return;
            }
            
            const events = [];
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            
            ordenesActivas.forEach(orden => {
                if (!orden.fecha_ingreso) return;
                
                let fechaInicio = new Date(orden.fecha_ingreso);
                if (isNaN(fechaInicio.getTime())) return;
                fechaInicio.setHours(0, 0, 0, 0);
                
                let fechaFin;
                if (orden.dias_estimados_reparacion && orden.dias_estimados_reparacion > 0) {
                    fechaFin = new Date(fechaInicio);
                    fechaFin.setDate(fechaInicio.getDate() + orden.dias_estimados_reparacion);
                } else if (orden.fecha_estimada_finalizacion) {
                    fechaFin = new Date(orden.fecha_estimada_finalizacion);
                } else {
                    return;
                }
                fechaFin.setHours(0, 0, 0, 0);
                
                const placa = orden.vehiculo?.placa || orden.codigo_unico || 'Vehículo';
                const estaAtrasado = fechaFin < hoy;
                
                // Evento de reparación (rango completo)
                events.push({
                    id: `reparacion-${orden.id_orden}`,
                    title: `🔧 ${placa}`,
                    start: fechaInicio,
                    end: new Date(fechaFin.getTime() + 24 * 60 * 60 * 1000),
                    allDay: true,
                    backgroundColor: estaAtrasado ? '#EF4444' : '#F59E0B',
                    borderColor: estaAtrasado ? '#EF4444' : '#F59E0B',
                    textColor: 'white'
                });
                
                // Evento de entrega
                events.push({
                    id: `entrega-${orden.id_orden}`,
                    title: `🚗 ENTREGA: ${placa}`,
                    start: fechaFin,
                    allDay: true,
                    backgroundColor: estaAtrasado ? '#DC2626' : '#8B5CF6',
                    borderColor: estaAtrasado ? '#DC2626' : '#8B5CF6',
                    textColor: 'white'
                });
            });
            
            console.log(`✅ ${events.length} eventos generados`);
            successCallback(events);
        },
        
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            const ordenId = info.event.id.split('-')[1];
            if (ordenId) {
                window.verOrdenTrabajo(parseInt(ordenId));
            }
        }
    });
    
    calendar.render();
    console.log('✅ FullCalendar inicializado');
}

// =====================================================
// MODAL DE COMUNICADOS
// =====================================================

function crearModalComunicados() {
    // Verificar si ya existe
    if (document.getElementById('modalComunicados')) return;
    
    const modalHTML = `
        <div id="modalComunicados" class="modal-comunicados">
            <div class="modal-content-comunicados">
                <div class="modal-header-comunicados">
                    <h3><i class="fas fa-bell"></i> Comunicados</h3>
                    <button class="modal-close" onclick="cerrarModalComunicados()">&times;</button>
                </div>
                <div class="modal-body-comunicados" id="modalBodyComunicados">
                    <div class="loading-skeleton">Cargando comunicados...</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Cerrar modal al hacer clic fuera
    document.getElementById('modalComunicados').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalComunicados')) {
            cerrarModalComunicados();
        }
    });
}

async function abrirModalComunicados() {
    const modal = document.getElementById('modalComunicados');
    if (!modal) return;
    
    modal.classList.add('active');
    await cargarComunicados();
}

function cerrarModalComunicados() {
    const modal = document.getElementById('modalComunicados');
    if (modal) {
        modal.classList.remove('active');
        // Restaurar la vista a la lista al cerrar
        const modalBody = document.getElementById('modalBodyComunicados');
        if (modalBody) {
            modalBody.innerHTML = '<div class="loading-skeleton">Cargando comunicados...</div>';
        }
    }
}

async function cargarComunicados() {
    const modalBody = document.getElementById('modalBodyComunicados');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
        <div class="sin-comunicados">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando comunicados...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_URL}/mis-comunicados`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        console.log('📬 Comunicados recibidos:', data);
        
        if (data.success && data.comunicados && data.comunicados.length > 0) {
            comunicadosActuales = data.comunicados;
            renderizarListaComunicados();
        } else {
            modalBody.innerHTML = `
                <div class="sin-comunicados">
                    <i class="fas fa-inbox"></i>
                    <p>No hay comunicados nuevos</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error cargando comunicados:', error);
        modalBody.innerHTML = `
            <div class="sin-comunicados">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error al cargar comunicados</p>
            </div>
        `;
    }
}

function renderizarListaComunicados() {
    const modalBody = document.getElementById('modalBodyComunicados');
    if (!modalBody) return;
    
    if (comunicadosActuales.length === 0) {
        modalBody.innerHTML = `
            <div class="sin-comunicados">
                <i class="fas fa-inbox"></i>
                <p>No hay comunicados nuevos</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="comunicados-list">';
    
    for (const com of comunicadosActuales) {
        const fecha = formatearFechaComunicado(com.fecha_creacion);
        const prioridadClass = com.prioridad === 'alta' ? 'prioridad-alta' : (com.prioridad === 'media' ? 'prioridad-media' : 'prioridad-baja');
        const prioridadTexto = com.prioridad === 'alta' ? '⚠️ Alta' : (com.prioridad === 'media' ? '📌 Media' : 'ℹ️ Normal');
        
        html += `
            <div class="comunicado-item ${prioridadClass}" onclick="verDetalleComunicado(${com.id})">
                <div class="comunicado-header">
                    <h4 class="comunicado-titulo">
                        <i class="fas fa-envelope"></i>
                        ${escapeHtml(com.titulo)}
                    </h4>
                    <span class="comunicado-fecha">
                        <i class="far fa-calendar-alt"></i>
                        ${fecha}
                    </span>
                </div>
                <div class="comunicado-contenido">
                    ${escapeHtml(com.contenido.substring(0, 200))}${com.contenido.length > 200 ? '...' : ''}
                </div>
                <div class="comunicado-footer">
                    <div class="comunicado-autor">
                        <i class="fas fa-user"></i>
                        ${escapeHtml(com.creador_nombre || 'Sistema')}
                    </div>
                    <div class="comunicado-prioridad ${prioridadClass}">
                        ${prioridadTexto}
                    </div>
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    modalBody.innerHTML = html;
}

function verDetalleComunicado(id) {
    const comunicado = comunicadosActuales.find(c => c.id === id);
    if (!comunicado) return;
    
    const modalBody = document.getElementById('modalBodyComunicados');
    if (!modalBody) return;
    
    const fecha = formatearFechaComunicado(comunicado.fecha_creacion);
    const prioridadClass = comunicado.prioridad === 'alta' ? 'prioridad-alta' : (comunicado.prioridad === 'media' ? 'prioridad-media' : 'prioridad-baja');
    const prioridadTexto = comunicado.prioridad === 'alta' ? '⚠️ Alta' : (comunicado.prioridad === 'media' ? '📌 Media' : 'ℹ️ Normal');
    
    modalBody.innerHTML = `
        <button class="volver-btn" onclick="cargarComunicados()">
            <i class="fas fa-arrow-left"></i> Volver a la lista
        </button>
        <div class="comunicado-detalle">
            <div class="comunicado-detalle-titulo">${escapeHtml(comunicado.titulo)}</div>
            <div class="comunicado-detalle-meta">
                <div class="comunicado-detalle-fecha">
                    <i class="far fa-calendar-alt"></i> ${fecha}
                </div>
                <div class="comunicado-detalle-autor">
                    <i class="fas fa-user"></i> ${escapeHtml(comunicado.creador_nombre || 'Sistema')}
                </div>
                <div class="comunicado-prioridad ${prioridadClass}">
                    ${prioridadTexto}
                </div>
            </div>
            <div class="comunicado-detalle-contenido">
                ${comunicado.contenido.replace(/\n/g, '<br>')}
            </div>
        </div>
    `;
}

function formatearFechaComunicado(fechaISO) {
    if (!fechaISO) return '-';
    const fecha = new Date(fechaISO);
    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    
    if (fecha.toDateString() === hoy.toDateString()) {
        return `Hoy, ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
    } else if (fecha.toDateString() === ayer.toDateString()) {
        return `Ayer, ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
    } else {
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// =====================================================
// ACTUALIZACIÓN MANUAL
// =====================================================

async function manualRefresh() {
    const refreshBtn = document.getElementById('manualRefreshBtn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
    }
    
    await cargarDatosIniciales();
    if (calendar) {
        calendar.refetchEvents();
    }
    
    if (refreshBtn) {
        setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
        }, 1000);
    }
}

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
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
        <span>${escapeHtml(mensaje)}</span>
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
// FUNCIONES GLOBALES (para llamar desde HTML)
// =====================================================

window.verOrdenTrabajo = function(id) {
    if (id) {
        window.location.href = window.API_BASE_URL + `/jefe_operativo/orden_trabajo.html?id=${id}`;
    }
};

window.verDetalleComunicado = verDetalleComunicado;
window.cerrarModalComunicados = cerrarModalComunicados;
window.cargarComunicados = cargarComunicados;

window.logout = function() {
    localStorage.clear();
    window.location.href = window.API_BASE_URL + '/';
};

window.reloadDashboard = function() {
    manualRefresh();
};

// =====================================================
// MANEJO DE ERRORES GLOBAL
// =====================================================

window.addEventListener('unhandledrejection', function(event) {
    console.error('Promesa rechazada no manejada:', event.reason);
});

window.addEventListener('error', function(event) {
    console.error('Error global:', event.error);
});