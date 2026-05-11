// =====================================================
// MIS RESERVAS - CLIENTE
// =====================================================

const API_URL = '';  // Vacío para usar rutas relativas
let userInfo = null;
let calendar = null;
let solicitudActualId = null;
let reservaCancelarId = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Mis Reservas...');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    await cargarMisDatos();
    await cargarMisVehiculos();
    await cargarMisSolicitudes();
    initCalendar();
    setupEventListeners();
    mostrarFechaActual();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userInfo = payload.user;
        return true;
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
        return false;
    }
}

function getAuthToken() {
    return localStorage.getItem('furia_token');
}

function getHeaders() {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
    };
    
    const userId = getUserIdFromToken();
    if (userId) {
        headers['X-User-Id'] = userId;
    }
    
    return headers;
}
function getUserIdFromToken() {
    const token = localStorage.getItem('furia_token');
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.user?.id || payload.user_id || null;
    } catch (e) {
        return null;
    }
}
function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        if (mostrar) {
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
        }
    }
}

function mostrarFechaActual() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

function setupEventListeners() {
    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            cambiarTab(tabId);
        });
    });
    
    // Filtro de solicitudes
    const filtroEstado = document.getElementById('filtroEstadoSolicitud');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarMisSolicitudes());
    }
    
    // Botón refresh
    const btnRefresh = document.getElementById('btnRefreshSolicitudes');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => cargarMisSolicitudes());
    }
    
    // Formulario nueva solicitud
    const form = document.getElementById('formNuevaSolicitud');
    if (form) {
        form.addEventListener('submit', enviarSolicitud);
    }
    
    // Botón rechazar horarios en modal
    const btnRechazar = document.getElementById('btnRechazarHorarios');
    if (btnRechazar) {
        btnRechazar.addEventListener('click', () => rechazarHorarios());
    }
    
    // Botón confirmar cancelación
    const btnConfirmarCancelacion = document.getElementById('btnConfirmarCancelacion');
    if (btnConfirmarCancelacion) {
        btnConfirmarCancelacion.addEventListener('click', () => confirmarCancelacion());
    }
}

function cambiarTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    if (tabId === 'calendario' && calendar) {
        setTimeout(() => calendar.refetchEvents(), 100);
    }
    if (tabId === 'solicitudes') {
        cargarMisSolicitudes();
    }
}

// =====================================================
// DATOS DEL CLIENTE Y VEHÍCULOS
// =====================================================

async function cargarMisDatos() {
    try {
        const response = await fetch(`/api/cliente/mi-perfil`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (response.ok && data.cliente) {
            const userNameElement = document.querySelector('.user-name');
            if (userNameElement && data.cliente.nombre) {
                userNameElement.textContent = data.cliente.nombre;
            }
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

async function cargarMisVehiculos() {
    const selectVehiculo = document.getElementById('vehiculoSelect');
    if (!selectVehiculo) return;
    
    try {
        const response = await fetch(`/api/cliente/mi-perfil`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        
        selectVehiculo.innerHTML = '<option value="">-- Selecciona un vehículo --</option>';
        
        if (!response.ok || !data.vehiculos || data.vehiculos.length === 0) {
            selectVehiculo.innerHTML = '<option value="">No tienes vehículos registrados</option>';
            selectVehiculo.disabled = true;
            return;
        }
        
        selectVehiculo.disabled = false;
        data.vehiculos.forEach(vehiculo => {
            selectVehiculo.innerHTML += `<option value="${vehiculo.id}">${vehiculo.placa} - ${vehiculo.marca || 'Sin marca'} ${vehiculo.modelo || ''}</option>`;
        });
        
    } catch (error) {
        console.error('Error cargando vehículos:', error);
        selectVehiculo.innerHTML = '<option value="">Error cargando vehículos</option>';
    }
}

// =====================================================
// CALENDARIO
// =====================================================

function initCalendar() {
    const calendarEl = document.getElementById('calendario');
    if (!calendarEl) {
        console.error('No se encontró el elemento del calendario');
        return;
    }
    
    // Verificar si FullCalendar está disponible
    if (typeof FullCalendar === 'undefined') {
        console.error('FullCalendar no está cargado');
        return;
    }
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'es',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        height: 'auto',
        editable: false,
        selectable: false,
        dayMaxEvents: true,
        events: cargarEventosCalendario,
        eventClick: (info) => {
            verDetalleReserva(info.event.id);
        }
    });
    
    calendar.render();
}

async function cargarEventosCalendario(info, successCallback, failureCallback) {
    try {
        const response = await fetch(`/api/cliente/reservas-confirmadas`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error cargando reservas');
        
        const eventos = (data.reservas || []).map(reserva => {
            const fechaHora = new Date(reserva.fecha_agendada);
            const titulo = `${reserva.vehiculo?.placa || 'Vehículo'} - ${reserva.descripcion_problema?.substring(0, 30) || 'Reserva'}`;
            
            return {
                id: reserva.id.toString(),
                title: titulo,
                start: fechaHora,
                backgroundColor: '#10B981',
                borderColor: '#10B981',
                className: 'fc-event-confirmada'
            };
        });
        
        successCallback(eventos);
        
    } catch (error) {
        console.error('Error cargando eventos:', error);
        failureCallback(error);
    }
}

// =====================================================
// MIS SOLICITUDES
// =====================================================

async function cargarMisSolicitudes() {
    mostrarLoading(true);
    
    const filtroEstado = document.getElementById('filtroEstadoSolicitud')?.value || 'todos';
    
    try {
        const response = await fetch(`/api/cliente/solicitudes`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Error cargando solicitudes');
        
        let solicitudes = data.solicitudes || [];
        
        if (filtroEstado !== 'todos') {
            solicitudes = solicitudes.filter(s => s.estado === filtroEstado);
        }
        
        renderizarSolicitudes(solicitudes);
        
    } catch (error) {
        console.error('Error:', error);
        const container = document.getElementById('solicitudesLista');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error cargando solicitudes</p>
                    <button class="btn-primary btn-sm" onclick="cargarMisSolicitudes()">Reintentar</button>
                </div>
            `;
        }
    } finally {
        mostrarLoading(false);
    }
}

function renderizarSolicitudes(solicitudes) {
    const container = document.getElementById('solicitudesLista');
    if (!container) return;
    
    if (!solicitudes || solicitudes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <p>No tienes solicitudes de reserva</p>
                <p style="font-size: 0.8rem;">Ve a "Nueva Reserva" para solicitar una cita</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = solicitudes.map(solicitud => {
        const fechaSolicitud = new Date(solicitud.fecha_solicitud).toLocaleDateString();
        const estadoTexto = getEstadoTexto(solicitud.estado);
        const estadoClase = getEstadoClase(solicitud.estado);
        
        return `
            <div class="solicitud-card ${solicitud.estado}">
                <div class="solicitud-header">
                    <div class="solicitud-fecha">
                        <i class="fas fa-calendar-alt"></i>
                        Solicitado: ${fechaSolicitud}
                    </div>
                    <span class="solicitud-estado ${estadoClase}">
                        ${estadoTexto}
                    </span>
                </div>
                <div class="solicitud-body">
                    <div class="solicitud-vehiculo">
                        <i class="fas fa-car"></i>
                        <strong>${solicitud.vehiculo?.placa || 'Vehículo no especificado'}</strong>
                    </div>
                    <div class="solicitud-vehiculo">
                        <i class="fas fa-calendar-day"></i>
                        Fecha deseada: ${solicitud.fecha_deseada} ${solicitud.hora_deseada ? `a las ${solicitud.hora_deseada}` : ''}
                    </div>
                    <div class="solicitud-problema">
                        <i class="fas fa-stethoscope"></i> ${escapeHtml(solicitud.descripcion_problema)}
                    </div>
                    ${solicitud.horarios_propuestos ? renderizarHorariosPropuestos(solicitud) : ''}
                </div>
                <div class="solicitud-footer">
                    ${renderizarBotonesSegunEstado(solicitud)}
                </div>
            </div>
        `;
    }).join('');
}

function getEstadoTexto(estado) {
    const estados = {
        'pendiente': '⏳ Solicitud enviada',
        'horarios_propuestos': '📅 Horarios propuestos',
        'confirmada': '✅ Confirmada',
        'cancelada': '❌ Cancelada',
        'completada': '🏁 Completada'
    };
    return estados[estado] || estado;
}

function getEstadoClase(estado) {
    return `estado-${estado}`;
}

function renderizarHorariosPropuestos(solicitud) {
    try {
        let horarios = solicitud.horarios_propuestos;
        if (typeof horarios === 'string') {
            horarios = JSON.parse(horarios);
        }
        
        if (!horarios || !Array.isArray(horarios) || horarios.length === 0) return '';
        
        return `
            <div class="horarios-lista">
                <small style="width: 100%; color: var(--azul-acento);">
                    <i class="fas fa-clock"></i> El taller te propone estos horarios:
                </small>
                ${horarios.map(horario => `
                    <button class="horario-item" onclick="seleccionarHorario(${solicitud.id}, '${horario}')">
                        <i class="fas fa-calendar-check"></i>
                        ${new Date(horario).toLocaleString()}
                    </button>
                `).join('')}
            </div>
        `;
    } catch (e) {
        console.error('Error parseando horarios:', e);
        return '';
    }
}

function renderizarBotonesSegunEstado(solicitud) {
    switch (solicitud.estado) {
        case 'horarios_propuestos':
            return `
                <button class="btn-sm btn-success" onclick="abrirModalHorarios(${solicitud.id})">
                    <i class="fas fa-calendar-check"></i> Ver horarios
                </button>
            `;
        case 'confirmada':
            return `
                <button class="btn-sm btn-secondary" onclick="verDetalleSolicitud(${solicitud.id})">
                    <i class="fas fa-eye"></i> Ver detalle
                </button>
                <button class="btn-sm btn-danger" onclick="abrirModalCancelar(${solicitud.id})">
                    <i class="fas fa-times"></i> Cancelar reserva
                </button>
            `;
        default:
            return `
                <button class="btn-sm btn-secondary" onclick="verDetalleSolicitud(${solicitud.id})">
                    <i class="fas fa-eye"></i> Ver detalle
                </button>
            `;
    }
}

// =====================================================
// ACCIONES
// =====================================================

function abrirModalHorarios(solicitudId) {
    solicitudActualId = solicitudId;
    cargarYMostrarHorarios(solicitudId);
}

async function cargarYMostrarHorarios(solicitudId) {
    try {
        const response = await fetch(`/api/cliente/solicitudes`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        const solicitud = data.solicitudes.find(s => s.id === solicitudId);
        
        if (!solicitud || !solicitud.horarios_propuestos) return;
        
        let horarios = solicitud.horarios_propuestos;
        if (typeof horarios === 'string') {
            horarios = JSON.parse(horarios);
        }
        
        const modalBody = document.getElementById('modalHorariosBody');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="horarios-lista" style="flex-direction: column;">
                    <p>Selecciona uno de los siguientes horarios para confirmar tu reserva:</p>
                    ${horarios.map(horario => `
                        <button class="horario-item" style="justify-content: space-between;" onclick="seleccionarHorario(${solicitudId}, '${horario}')">
                            <span><i class="fas fa-calendar-day"></i> ${new Date(horario).toLocaleDateString()}</span>
                            <span><i class="fas fa-clock"></i> ${new Date(horario).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        </button>
                    `).join('')}
                </div>
            `;
        }
        
        document.getElementById('modalHorarios').classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error cargando horarios', 'error');
    }
}

async function seleccionarHorario(solicitudId, horario) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/cliente/aceptar-horario/${solicitudId}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ horario_seleccionado: horario })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Error al confirmar horario');
        
        mostrarNotificacion('🎉 ¡Reserva confirmada!', 'success');
        cerrarModalHorarios();
        cargarMisSolicitudes();
        if (calendar) calendar.refetchEvents();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function rechazarHorarios() {
    if (!solicitudActualId) return;
    
    const confirmado = confirm('¿Rechazar estos horarios? La solicitud será cancelada.');
    if (!confirmado) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/cliente/rechazar-horarios/${solicitudActualId}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ motivo: 'Cliente no aceptó los horarios' })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al rechazar horarios');
        
        mostrarNotificacion('Horarios rechazados', 'info');
        cerrarModalHorarios();
        cargarMisSolicitudes();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

function cerrarModalHorarios() {
    document.getElementById('modalHorarios').classList.remove('show');
    solicitudActualId = null;
}

function abrirModalCancelar(reservaId) {
    reservaCancelarId = reservaId;
    document.getElementById('motivoCancelacion').value = '';
    document.getElementById('modalCancelar').classList.add('show');
}

function cerrarModalCancelar() {
    document.getElementById('modalCancelar').classList.remove('show');
    reservaCancelarId = null;
}

async function confirmarCancelacion() {
    if (!reservaCancelarId) return;
    
    const motivo = document.getElementById('motivoCancelacion')?.value || '';
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/cliente/cancelar-reserva/${reservaCancelarId}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ motivo })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al cancelar reserva');
        
        mostrarNotificacion('Reserva cancelada', 'success');
        cerrarModalCancelar();
        cargarMisSolicitudes();
        if (calendar) calendar.refetchEvents();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// NUEVA SOLICITUD
// =====================================================

async function enviarSolicitud(e) {
    e.preventDefault();
    
    const vehiculoId = document.getElementById('vehiculoSelect')?.value;
    const fechaDeseada = document.getElementById('fechaDeseada')?.value;
    const horaDeseada = document.getElementById('horaDeseada')?.value;
    const descripcionProblema = document.getElementById('descripcionProblema')?.value;
    const mensajeAdicional = document.getElementById('mensajeAdicional')?.value;
    
    if (!vehiculoId) {
        mostrarNotificacion('Selecciona un vehículo', 'warning');
        return;
    }
    if (!fechaDeseada) {
        mostrarNotificacion('Selecciona una fecha', 'warning');
        return;
    }
    if (!descripcionProblema || descripcionProblema.trim().length < 10) {
        mostrarNotificacion('Describe el problema (mínimo 10 caracteres)', 'warning');
        return;
    }
    
    const fechaMinima = new Date();
    fechaMinima.setHours(0, 0, 0, 0);
    const fechaSeleccionada = new Date(fechaDeseada);
    if (fechaSeleccionada < fechaMinima) {
        mostrarNotificacion('No puedes seleccionar una fecha pasada', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/cliente/solicitar`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                id_vehiculo: parseInt(vehiculoId),
                fecha_deseada: fechaDeseada,
                hora_deseada: horaDeseada || null,
                descripcion_problema: descripcionProblema,
                mensaje_adicional: mensajeAdicional || null
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Error al enviar solicitud');
        
        alert('✅ Solicitud enviada. El taller te responderá pronto.');
        limpiarFormulario();
        cambiarTab('solicitudes');
        cargarMisSolicitudes();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

function limpiarFormulario() {
    document.getElementById('vehiculoSelect').value = '';
    document.getElementById('fechaDeseada').value = '';
    document.getElementById('horaDeseada').value = '';
    document.getElementById('descripcionProblema').value = '';
    document.getElementById('mensajeAdicional').value = '';
}

// =====================================================
// MODALES DE DETALLE
// =====================================================

async function verDetalleReserva(reservaId) {
    // Implementar si es necesario
    mostrarNotificacion('Detalle de reserva', 'info');
}

async function verDetalleSolicitud(solicitudId) {
    try {
        const response = await fetch(`/api/cliente/solicitudes`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        const solicitud = data.solicitudes?.find(s => s.id == solicitudId);
        
        if (!solicitud) {
            mostrarNotificacion('Solicitud no encontrada', 'error');
            return;
        }
        
        const modalBody = document.getElementById('modalDetalleBody');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="detalle-info">
                    <div class="info-row"><strong>Vehículo:</strong> ${solicitud.vehiculo?.placa || 'N/A'}</div>
                    <div class="info-row"><strong>Fecha solicitada:</strong> ${solicitud.fecha_deseada} ${solicitud.hora_deseada || ''}</div>
                    <div class="info-row"><strong>Estado:</strong> ${getEstadoTexto(solicitud.estado)}</div>
                    <div class="info-row"><strong>Problema:</strong> ${escapeHtml(solicitud.descripcion_problema)}</div>
                    ${solicitud.mensaje_adicional ? `<div class="info-row"><strong>Comentarios:</strong> ${escapeHtml(solicitud.mensaje_adicional)}</div>` : ''}
                    ${solicitud.fecha_agendada ? `<div class="info-row"><strong>Fecha confirmada:</strong> ${new Date(solicitud.fecha_agendada).toLocaleString()}</div>` : ''}
                </div>
            `;
        }
        
        document.getElementById('modalDetalleSolicitud').classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error cargando detalle', 'error');
    }
}

function cerrarModalDetalle() {
    document.getElementById('modalDetalleSolicitud').classList.remove('show');
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    toast.innerHTML = `<span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Exponer funciones globales
window.cambiarTab = cambiarTab;
window.cargarMisSolicitudes = cargarMisSolicitudes;
window.limpiarFormulario = limpiarFormulario;
window.seleccionarHorario = seleccionarHorario;
window.abrirModalHorarios = abrirModalHorarios;
window.cerrarModalHorarios = cerrarModalHorarios;
window.abrirModalCancelar = abrirModalCancelar;
window.cerrarModalCancelar = cerrarModalCancelar;
window.verDetalleSolicitud = verDetalleSolicitud;
window.cerrarModalDetalle = cerrarModalDetalle;