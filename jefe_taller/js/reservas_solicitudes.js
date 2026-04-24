// =====================================================
// RESERVAS Y SOLICITUDES - JEFE TALLER
// =====================================================

const API_URL = 'http://localhost:5000/api';
let userInfo = null;
let calendar = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Reservas y Solicitudes...');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    await cargarClientes();
    await cargarSolicitudes();
    initCalendar();
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
        
        const userData = localStorage.getItem('furia_user');
        let userRoles = [];
        
        if (userInfo && userInfo.roles && Array.isArray(userInfo.roles)) {
            userRoles = userInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            userRoles = user.roles || [];
        }
        
        const tieneRolJefeTaller = userRoles.includes('jefe_taller');
        
        if (!tieneRolJefeTaller) {
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return false;
        }
        
        await cargarNotificaciones();
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
        return false;
    }
}

function initPage() {
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
    
    // Filtros
    const filtroEstado = document.getElementById('filtroEstadoSolicitud');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarSolicitudes());
    }
    
    const filtroReserva = document.getElementById('filtroEstadoReserva');
    if (filtroReserva) {
        filtroReserva.addEventListener('change', () => {
            if (calendar) calendar.refetchEvents();
        });
    }
    
    // Refresh buttons
    const btnRefreshSolicitudes = document.getElementById('btnRefreshSolicitudes');
    if (btnRefreshSolicitudes) {
        btnRefreshSolicitudes.addEventListener('click', () => cargarSolicitudes());
    }
    
    const btnRefreshCalendario = document.getElementById('btnRefreshCalendario');
    if (btnRefreshCalendario) {
        btnRefreshCalendario.addEventListener('click', () => {
            if (calendar) calendar.refetchEvents();
            mostrarNotificacion('Calendario actualizado', 'success');
        });
    }
    
    // Formulario reserva
    const formReserva = document.getElementById('formNuevaReserva');
    if (formReserva) {
        formReserva.addEventListener('submit', guardarReserva);
    }
    
    const btnLimpiar = document.getElementById('btnLimpiarForm');
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', limpiarFormReserva);
    }
    
    const clienteSelect = document.getElementById('reservaCliente');
    if (clienteSelect) {
        clienteSelect.addEventListener('change', () => cargarVehiculosPorCliente());
    }
    
    // Botón nuevo cliente
    const btnNuevoCliente = document.getElementById('btnNuevoCliente');
    if (btnNuevoCliente) {
        btnNuevoCliente.addEventListener('click', () => {
            abrirModalNuevoCliente();
        });
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
        cargarSolicitudes();
    }
}

function getAuthToken() {
    return localStorage.getItem('furia_token');
}

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
    };
}

// =====================================================
// NOTIFICACIONES
// =====================================================
async function cargarNotificaciones() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/notificaciones`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (response.ok && data.notificaciones) {
            const pendientes = data.notificaciones.filter(n => !n.leida).length;
            const badge = document.getElementById('notificacionesCount');
            if (badge) {
                badge.textContent = pendientes;
                badge.style.display = pendientes > 0 ? 'flex' : 'none';
            }
        }
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
    }
}

// =====================================================
// CALENDARIO (SOLO VISTA MENSUAL)
// =====================================================
function initCalendar() {
    const calendarEl = document.getElementById('calendario');
    if (!calendarEl) return;
    
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
        selectable: true,
        dayMaxEvents: true,
        events: cargarEventosCalendario,
        eventClick: (info) => {
            const reservaId = info.event.id;
            verDetalleReserva(reservaId);
        },
        dateClick: (info) => {
            const fecha = info.date;
            const fechaStr = fecha.toISOString().split('T')[0];
            document.getElementById('reservaFecha').value = fechaStr;
            cambiarTab('nueva-reserva');
        }
    });
    
    calendar.render();
}

async function cargarEventosCalendario(info, successCallback, failureCallback) {
    try {
        const estadoFiltro = document.getElementById('filtroEstadoReserva')?.value || 'todos';
        
        let url = `${API_URL}/jefe-taller/reservas?`;
        if (estadoFiltro !== 'todos') {
            url += `estado=${estadoFiltro}`;
        }
        
        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Error cargando reservas');
        
        const eventos = (data.reservas || []).map(reserva => {
            let color = '#F59E0B';
            let className = 'fc-event-pendiente';
            
            switch (reserva.estado) {
                case 'confirmada':
                    color = '#10B981';
                    className = 'fc-event-confirmada';
                    break;
                case 'cancelada':
                    color = '#6B7280';
                    className = 'fc-event-cancelada';
                    break;
                case 'completada':
                    color = '#1E3A5F';
                    className = 'fc-event-completada';
                    break;
                default:
                    color = '#F59E0B';
                    className = 'fc-event-pendiente';
            }
            
            const fechaHora = new Date(reserva.fecha_agendada);
            const titulo = `${reserva.placa || 'Sin vehículo'} - ${reserva.cliente_nombre || 'Cliente'}`;
            
            return {
                id: reserva.id.toString(),
                title: titulo,
                start: fechaHora,
                backgroundColor: color,
                borderColor: color,
                className: className,
                extendedProps: {
                    estado: reserva.estado,
                    descripcion: reserva.descripcion_problema
                }
            };
        });
        
        successCallback(eventos);
        
    } catch (error) {
        console.error('Error cargando eventos:', error);
        failureCallback(error);
    }
}

// =====================================================
// SOLICITUDES DE CLIENTES
// =====================================================
async function cargarSolicitudes() {
    const estadoFiltro = document.getElementById('filtroEstadoSolicitud')?.value || 'todos';
    
    try {
        let url = `${API_URL}/jefe-taller/solicitudes-clientes`;
        if (estadoFiltro !== 'todos') {
            url += `?estado=${estadoFiltro}`;
        }
        
        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Error cargando solicitudes');
        
        renderizarSolicitudes(data.solicitudes || []);
        
        const pendientes = (data.solicitudes || []).filter(s => s.estado === 'pendiente').length;
        const badge = document.getElementById('solicitudesPendientesBadge');
        if (badge) {
            if (pendientes > 0) {
                badge.textContent = pendientes;
                badge.style.display = 'inline-flex';
                badge.style.marginLeft = '0.5rem';
                badge.style.background = 'var(--rojo-primario)';
                badge.style.color = 'white';
                badge.style.borderRadius = '9999px';
                badge.style.padding = '0.15rem 0.5rem';
                badge.style.fontSize = '0.7rem';
            } else {
                badge.style.display = 'none';
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
        document.getElementById('solicitudesLista').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error cargando solicitudes</p>
            </div>
        `;
    }
}

function renderizarSolicitudes(solicitudes) {
    const container = document.getElementById('solicitudesLista');
    if (!container) return;
    
    if (!solicitudes || solicitudes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay solicitudes de clientes</p>
                <p style="font-size: 0.8rem;">Los clientes pueden solicitar reservas desde su panel</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = solicitudes.map(solicitud => `
        <div class="solicitud-card ${solicitud.estado}">
            <div class="solicitud-header">
                <div class="solicitud-cliente">
                    <i class="fas fa-user-circle"></i>
                    <span>${escapeHtml(solicitud.cliente_nombre || 'Cliente #' + solicitud.id_cliente)}</span>
                </div>
                <div class="solicitud-fecha-solicitud">
                    <i class="fas fa-calendar-alt"></i>
                    Solicitado: ${new Date(solicitud.fecha_solicitud).toLocaleDateString()}
                </div>
                <span class="solicitud-estado estado-${solicitud.estado}">
                    ${solicitud.estado === 'pendiente' ? '⏳ Pendiente' : 
                      solicitud.estado === 'confirmada' ? '✅ Confirmada' : 
                      solicitud.estado === 'cancelada' ? '❌ Cancelada' : 
                      '🏁 Completada'}
                </span>
            </div>
            <div class="solicitud-body">
                <div class="solicitud-info">
                    <i class="fas fa-car"></i>
                    <span><strong>Vehículo:</strong> ${escapeHtml(solicitud.placa || 'No registrado')}</span>
                </div>
                <div class="solicitud-info">
                    <i class="fas fa-calendar-day"></i>
                    <span><strong>Fecha solicitada:</strong> ${new Date(solicitud.fecha_deseada).toLocaleDateString()}</span>
                </div>
                <div class="solicitud-info">
                    <i class="fas fa-clock"></i>
                    <span><strong>Hora:</strong> ${solicitud.hora_deseada || 'No especificada'}</span>
                </div>
                <div class="solicitud-info">
                    <i class="fas fa-phone"></i>
                    <span><strong>Contacto:</strong> ${escapeHtml(solicitud.cliente_contacto || 'No disponible')}</span>
                </div>
            </div>
            <div class="solicitud-descripcion">
                <i class="fas fa-stethoscope"></i> ${escapeHtml(solicitud.descripcion_problema)}
            </div>
            ${solicitud.mensaje_adicional ? `
                <div class="solicitud-descripcion" style="background: rgba(193,18,31,0.1); margin-top: 0.5rem;">
                    <i class="fas fa-comment"></i> <strong>Mensaje del cliente:</strong> ${escapeHtml(solicitud.mensaje_adicional)}
                </div>
            ` : ''}
            <div class="solicitud-footer">
                ${solicitud.estado === 'pendiente' ? `
                    <button class="btn-sm btn-success" onclick="confirmarSolicitud(${solicitud.id})">
                        <i class="fas fa-check"></i> Confirmar
                    </button>
                    <button class="btn-sm btn-danger" onclick="rechazarSolicitud(${solicitud.id})">
                        <i class="fas fa-times"></i> Rechazar
                    </button>
                ` : ''}
                ${solicitud.estado === 'confirmada' ? `
                    <button class="btn-sm btn-warning" onclick="marcarCompletada(${solicitud.id})">
                        <i class="fas fa-flag-checkered"></i> Marcar Completada
                    </button>
                ` : ''}
                <button class="btn-sm btn-secondary" onclick="verDetalleSolicitud(${solicitud.id})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            </div>
        </div>
    `).join('');
}

// =====================================================
// ACCIONES DE SOLICITUDES
// =====================================================
async function confirmarSolicitud(id) {
    const result = await Swal.fire({
        title: 'Confirmar reserva',
        html: `
            <p>¿Deseas confirmar esta reserva?</p>
            <p>Puedes mantener la fecha y hora solicitada o cambiarla:</p>
            <div style="margin-top: 1rem;">
                <input type="date" id="confirmarFecha" class="swal2-input" placeholder="Fecha" style="width: 100%; margin-bottom: 0.5rem;">
                <input type="time" id="confirmarHora" class="swal2-input" placeholder="Hora" style="width: 100%;">
            </div>
            <small class="text-muted" style="display: block; margin-top: 0.5rem;">Dejar vacío para usar la fecha y hora solicitada por el cliente</small>
            <small class="text-muted">Horario de atención: 8:00 - 20:00</small>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-check"></i> Confirmar',
        cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
        preConfirm: () => {
            const fecha = document.getElementById('confirmarFecha').value;
            const hora = document.getElementById('confirmarHora').value;
            if (fecha && hora) {
                const horaNum = parseInt(hora.split(':')[0]);
                if (horaNum < 8 || horaNum >= 20) {
                    Swal.showValidationMessage('El horario debe estar entre 8:00 y 20:00');
                    return false;
                }
                return { fecha_agendada: `${fecha} ${hora}:00` };
            }
            return { fecha_agendada: null };
        }
    });
    
    if (result.isConfirmed) {
        await actualizarEstadoSolicitudConFecha(id, 'confirmada', result.value?.fecha_agendada);
    }
}

async function rechazarSolicitud(id) {
    const result = await Swal.fire({
        title: '¿Rechazar solicitud?',
        text: '¿Estás seguro de que quieres rechazar esta solicitud?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, rechazar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#d33'
    });
    
    if (result.isConfirmed) {
        await actualizarEstadoSolicitud(id, 'cancelada');
    }
}

async function marcarCompletada(id) {
    const result = await Swal.fire({
        title: '¿Completar reserva?',
        text: '¿La orden de trabajo ya fue completada?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, completar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#10B981'
    });
    
    if (result.isConfirmed) {
        await actualizarEstadoSolicitud(id, 'completada');
    }
}

async function actualizarEstadoSolicitud(id, estado) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/solicitudes-clientes/${id}/estado`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ estado })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 409) {
                mostrarNotificacion(data.error, 'error');
            } else {
                throw new Error(data.error || 'Error actualizando estado');
            }
            return;
        }
        
        mostrarNotificacion(`Solicitud ${estado === 'confirmada' ? 'confirmada' : estado === 'cancelada' ? 'rechazada' : 'completada'} exitosamente`, 'success');
        
        cargarSolicitudes();
        if (calendar) calendar.refetchEvents();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

async function actualizarEstadoSolicitudConFecha(id, estado, fecha_agendada) {
    try {
        const body = { estado };
        if (fecha_agendada) {
            body.fecha_agendada = fecha_agendada;
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/solicitudes-clientes/${id}/estado`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 409) {
                Swal.fire({
                    title: 'Horario no disponible',
                    text: data.error,
                    icon: 'error',
                    confirmButtonText: 'Entendido'
                });
            } else {
                throw new Error(data.error || 'Error actualizando estado');
            }
            return;
        }
        
        mostrarNotificacion(`Solicitud confirmada exitosamente`, 'success');
        
        cargarSolicitudes();
        if (calendar) calendar.refetchEvents();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// CLIENTES Y VEHÍCULOS
// =====================================================
async function cargarClientes() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/clientes`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error cargando clientes');
        
        const selectCliente = document.getElementById('reservaCliente');
        if (!selectCliente) return;
        
        selectCliente.innerHTML = '<option value="">Seleccionar cliente...</option>';
        
        (data.clientes || []).forEach(cliente => {
            selectCliente.innerHTML += `<option value="${cliente.id}">${escapeHtml(cliente.nombre)} - ${escapeHtml(cliente.contacto || 'Sin contacto')}</option>`;
        });
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

async function cargarVehiculosPorCliente() {
    const clienteId = document.getElementById('reservaCliente')?.value;
    const selectVehiculo = document.getElementById('reservaVehiculo');
    
    if (!clienteId || !selectVehiculo) return;
    
    selectVehiculo.disabled = true;
    selectVehiculo.innerHTML = '<option value="">Cargando vehículos...</option>';
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/vehiculos-cliente/${clienteId}`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error cargando vehículos');
        
        selectVehiculo.innerHTML = '<option value="">Seleccionar vehículo...</option>';
        
        if (!data.vehiculos || data.vehiculos.length === 0) {
            selectVehiculo.innerHTML = '<option value="">No hay vehículos registrados</option>';
            selectVehiculo.disabled = true;
            mostrarNotificacion('Este cliente no tiene vehículos registrados', 'warning');
            return;
        }
        
        (data.vehiculos || []).forEach(vehiculo => {
            selectVehiculo.innerHTML += `<option value="${vehiculo.id}">${escapeHtml(vehiculo.placa)} - ${escapeHtml(vehiculo.marca || 'Sin marca')} ${escapeHtml(vehiculo.modelo || '')} (${vehiculo.anio || 'Año no registrado'})</option>`;
        });
        
        selectVehiculo.disabled = false;
        
    } catch (error) {
        console.error('Error:', error);
        selectVehiculo.innerHTML = '<option value="">Error cargando vehículos</option>';
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// REGISTRO DE NUEVO CLIENTE
// =====================================================
function abrirModalNuevoCliente() {
    document.getElementById('nuevoClienteNombre').value = '';
    document.getElementById('nuevoClienteEmail').value = '';
    document.getElementById('nuevoClienteContacto').value = '';
    document.getElementById('nuevoClienteUbicacion').value = '';
    document.getElementById('nuevoClientePlaca').value = '';
    document.getElementById('nuevoClienteMarca').value = '';
    document.getElementById('nuevoClienteModelo').value = '';
    document.getElementById('nuevoClienteAnio').value = '';
    
    document.getElementById('modalNuevoCliente').classList.add('show');
}

function cerrarModalNuevoCliente() {
    document.getElementById('modalNuevoCliente').classList.remove('show');
}

async function registrarNuevoCliente() {
    const nombre = document.getElementById('nuevoClienteNombre').value.trim();
    const email = document.getElementById('nuevoClienteEmail').value.trim();
    const contacto = document.getElementById('nuevoClienteContacto').value.trim();
    const ubicacion = document.getElementById('nuevoClienteUbicacion').value.trim();
    const placa = document.getElementById('nuevoClientePlaca').value.trim().toUpperCase();
    const marca = document.getElementById('nuevoClienteMarca').value.trim();
    const modelo = document.getElementById('nuevoClienteModelo').value.trim();
    const anio = document.getElementById('nuevoClienteAnio').value.trim();
    
    if (!nombre) {
        mostrarNotificacion('El nombre del cliente es requerido', 'warning');
        return;
    }
    if (!email) {
        mostrarNotificacion('El email es requerido', 'warning');
        return;
    }
    if (!contacto) {
        mostrarNotificacion('El teléfono de contacto es requerido', 'warning');
        return;
    }
    if (!placa) {
        mostrarNotificacion('La placa del vehículo es requerida', 'warning');
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        mostrarNotificacion('El email no es válido', 'warning');
        return;
    }
    
    try {
        mostrarNotificacion('Registrando cliente...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/clientes/nuevo`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                nombre: nombre,
                email: email,
                contacto: contacto,
                ubicacion: ubicacion || null,
                placa: placa,
                marca: marca || null,
                modelo: modelo || null,
                anio: anio ? parseInt(anio) : null
            })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error registrando cliente');
        
        Swal.fire({
            title: 'Cliente registrado',
            html: `Cliente registrado exitosamente.<br><br>
                   <strong>Contraseña temporal:</strong> ${data.cliente.password_temporal || 'La contraseña ha sido enviada al email del cliente'}<br>
                   <small>El cliente deberá cambiar su contraseña al iniciar sesión.</small>`,
            icon: 'success',
            confirmButtonText: 'Entendido'
        });
        
        cerrarModalNuevoCliente();
        
        await cargarClientes();
        
        const selectCliente = document.getElementById('reservaCliente');
        if (selectCliente && data.cliente && data.cliente.id_usuario) {
            selectCliente.value = data.cliente.id_usuario;
            await cargarVehiculosPorCliente();
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// RESERVAS MANUALES
// =====================================================
async function guardarReserva(e) {
    e.preventDefault();
    
    const clienteId = document.getElementById('reservaCliente')?.value;
    const vehiculoId = document.getElementById('reservaVehiculo')?.value;
    const fecha = document.getElementById('reservaFecha')?.value;
    const hora = document.getElementById('reservaHora')?.value;
    const problema = document.getElementById('reservaProblema')?.value;
    const notas = document.getElementById('reservaNotas')?.value;
    
    if (!clienteId || !vehiculoId || !fecha || !hora || !problema) {
        mostrarNotificacion('Por favor completa todos los campos obligatorios', 'warning');
        return;
    }
    
    const fechaHora = `${fecha} ${hora}:00`;
    
    // Validar que la hora sea válida
    const horaSeleccionada = parseInt(hora.split(':')[0]);
    if (horaSeleccionada < 8 || horaSeleccionada >= 20) {
        mostrarNotificacion('El horario de atención es de 8:00 a 20:00', 'warning');
        return;
    }
    
    // Validar que la fecha no sea en el pasado
    const fechaSeleccionada = new Date(fecha);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (fechaSeleccionada < hoy) {
        mostrarNotificacion('No se pueden crear reservas en fechas pasadas', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/reservas`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                cliente_id: parseInt(clienteId),
                vehiculo_id: parseInt(vehiculoId),
                fecha_agendada: fechaHora,
                descripcion_problema: problema,
                notas: notas || null,
                es_manual: true
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 409) {
                Swal.fire({
                    title: 'Horario no disponible',
                    text: data.error,
                    icon: 'error',
                    confirmButtonText: 'Entendido'
                });
            } else {
                throw new Error(data.error || 'Error guardando reserva');
            }
            return;
        }
        
        mostrarNotificacion('Reserva creada exitosamente', 'success');
        limpiarFormReserva();
        
        if (calendar) calendar.refetchEvents();
        cambiarTab('calendario');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function limpiarFormReserva() {
    document.getElementById('reservaCliente').value = '';
    document.getElementById('reservaVehiculo').innerHTML = '<option value="">Primero selecciona un cliente</option>';
    document.getElementById('reservaVehiculo').disabled = true;
    document.getElementById('reservaFecha').value = '';
    document.getElementById('reservaHora').value = '';
    document.getElementById('reservaProblema').value = '';
    document.getElementById('reservaNotas').value = '';
}

// =====================================================
// EDITAR RESERVA
// =====================================================
async function editarReserva(id) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/reservas/${id}`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error cargando reserva');
        
        const reserva = data.reserva;
        const fechaAgendada = new Date(reserva.fecha_agendada);
        const fechaStr = fechaAgendada.toISOString().split('T')[0];
        const horaStr = fechaAgendada.toTimeString().slice(0, 5);
        
        const result = await Swal.fire({
            title: 'Editar Reserva',
            html: `
                <div style="text-align: left;">
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label><i class="fas fa-calendar-day"></i> Fecha *</label>
                        <input type="date" id="editFecha" class="swal2-input" value="${fechaStr}" style="width: 100%;">
                    </div>
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label><i class="fas fa-clock"></i> Hora *</label>
                        <input type="time" id="editHora" class="swal2-input" value="${horaStr}" style="width: 100%;">
                    </div>
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label><i class="fas fa-stethoscope"></i> Descripción del problema</label>
                        <textarea id="editProblema" class="swal2-textarea" rows="3" style="width: 100%;">${escapeHtml(reserva.descripcion_problema || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-comment"></i> Notas adicionales</label>
                        <textarea id="editNotas" class="swal2-textarea" rows="2" style="width: 100%;">${escapeHtml(reserva.mensaje_adicional || '')}</textarea>
                    </div>
                    <small class="text-muted">Horario de atención: 8:00 - 20:00</small>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save"></i> Guardar Cambios',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const fecha = document.getElementById('editFecha').value;
                const hora = document.getElementById('editHora').value;
                const problema = document.getElementById('editProblema').value;
                const notas = document.getElementById('editNotas').value;
                
                if (!fecha || !hora) {
                    Swal.showValidationMessage('Fecha y hora son requeridas');
                    return false;
                }
                
                const horaNum = parseInt(hora.split(':')[0]);
                if (horaNum < 8 || horaNum >= 20) {
                    Swal.showValidationMessage('El horario debe estar entre 8:00 y 20:00');
                    return false;
                }
                
                const fechaSeleccionada = new Date(fecha);
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                if (fechaSeleccionada < hoy) {
                    Swal.showValidationMessage('No se pueden editar reservas en fechas pasadas');
                    return false;
                }
                
                return { fecha, hora, problema, notas };
            }
        });
        
        if (result.isConfirmed) {
            const { fecha, hora, problema, notas } = result.value;
            const fechaHora = `${fecha} ${hora}:00`;
            await actualizarReserva(id, fechaHora, problema, notas);
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

async function actualizarReserva(id, fecha_agendada, descripcion_problema, notas) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/reservas/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                fecha_agendada: fecha_agendada,
                descripcion_problema: descripcion_problema,
                mensaje_adicional: notas
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 409) {
                Swal.fire({
                    title: 'Horario no disponible',
                    text: data.error,
                    icon: 'error',
                    confirmButtonText: 'Entendido'
                });
            } else {
                throw new Error(data.error || 'Error actualizando reserva');
            }
            return;
        }
        
        mostrarNotificacion('Reserva actualizada exitosamente', 'success');
        
        cerrarModal();
        if (calendar) calendar.refetchEvents();
        cargarSolicitudes();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// ELIMINAR RESERVA
// =====================================================
async function eliminarReserva(id) {
    const result = await Swal.fire({
        title: '¿Eliminar reserva?',
        html: '¿Estás seguro de que quieres eliminar esta reserva?<br><small>Esta acción no se puede deshacer.</small>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-trash"></i> Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#d33'
    });
    
    if (result.isConfirmed) {
        try {
            const response = await fetch(`${API_URL}/jefe-taller/reservas/${id}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error eliminando reserva');
            
            mostrarNotificacion('Reserva eliminada exitosamente', 'success');
            
            cerrarModal();
            if (calendar) calendar.refetchEvents();
            cargarSolicitudes();
            
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion(error.message, 'error');
        }
    }
}

// =====================================================
// MODALES
// =====================================================
async function verDetalleSolicitud(id) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/solicitudes-clientes/${id}`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error cargando solicitud');
        
        const solicitud = data.solicitud;
        
        document.getElementById('modalTitulo').innerHTML = '<i class="fas fa-calendar-check"></i> Detalle de Solicitud';
        
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="reserva-detalle">
                <div class="reserva-info">
                    <i class="fas fa-user"></i>
                    <div><span class="label">Cliente:</span> <span class="value">${escapeHtml(solicitud.cliente_nombre || 'No registrado')}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-phone"></i>
                    <div><span class="label">Contacto:</span> <span class="value">${escapeHtml(solicitud.cliente_contacto || 'No disponible')}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-car"></i>
                    <div><span class="label">Vehículo:</span> <span class="value">${escapeHtml(solicitud.placa || 'No registrado')} - ${escapeHtml(solicitud.marca || '')} ${escapeHtml(solicitud.modelo || '')}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-calendar-day"></i>
                    <div><span class="label">Fecha solicitada:</span> <span class="value">${new Date(solicitud.fecha_deseada).toLocaleDateString()}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-clock"></i>
                    <div><span class="label">Hora:</span> <span class="value">${solicitud.hora_deseada || 'No especificada'}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-stethoscope"></i>
                    <div><span class="label">Problema:</span> <span class="value">${escapeHtml(solicitud.descripcion_problema)}</span></div>
                </div>
                ${solicitud.mensaje_adicional ? `
                    <div class="reserva-info">
                        <i class="fas fa-comment"></i>
                        <div><span class="label">Mensaje adicional:</span> <span class="value">${escapeHtml(solicitud.mensaje_adicional)}</span></div>
                    </div>
                ` : ''}
                <div class="reserva-info">
                    <i class="fas fa-tag"></i>
                    <div><span class="label">Estado:</span> 
                        <span class="solicitud-estado estado-${solicitud.estado}">
                            ${solicitud.estado === 'pendiente' ? '⏳ Pendiente' : 
                              solicitud.estado === 'confirmada' ? '✅ Confirmada' : 
                              solicitud.estado === 'cancelada' ? '❌ Cancelada' : '🏁 Completada'}
                        </span>
                    </div>
                </div>
            </div>
        `;
        
        const modalFooter = document.getElementById('modalFooter');
        if (solicitud.estado === 'pendiente') {
            modalFooter.innerHTML = `
                <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
                <button class="btn-success" onclick="confirmarSolicitud(${solicitud.id}); cerrarModal();">
                    <i class="fas fa-check"></i> Confirmar
                </button>
                <button class="btn-danger" onclick="rechazarSolicitud(${solicitud.id}); cerrarModal();">
                    <i class="fas fa-times"></i> Rechazar
                </button>
            `;
        } else {
            modalFooter.innerHTML = `<button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>`;
        }
        
        document.getElementById('modalSolicitud').classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

async function verDetalleReserva(id) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/reservas/${id}`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error cargando reserva');
        
        const reserva = data.reserva;
        const fechaAgendada = new Date(reserva.fecha_agendada);
        
        document.getElementById('modalTitulo').innerHTML = '<i class="fas fa-calendar-check"></i> Detalle de Reserva';
        
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="reserva-detalle">
                <div class="reserva-info">
                    <i class="fas fa-user"></i>
                    <div><span class="label">Cliente:</span> <span class="value">${escapeHtml(reserva.cliente_nombre || 'No registrado')}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-phone"></i>
                    <div><span class="label">Contacto:</span> <span class="value">${escapeHtml(reserva.cliente_contacto || 'No disponible')}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-car"></i>
                    <div><span class="label">Vehículo:</span> <span class="value">${escapeHtml(reserva.placa || 'No registrado')} - ${escapeHtml(reserva.marca || '')} ${escapeHtml(reserva.modelo || '')}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-calendar-day"></i>
                    <div><span class="label">Fecha:</span> <span class="value">${fechaAgendada.toLocaleDateString()}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-clock"></i>
                    <div><span class="label">Hora:</span> <span class="value">${fechaAgendada.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
                </div>
                <div class="reserva-info">
                    <i class="fas fa-stethoscope"></i>
                    <div><span class="label">Problema:</span> <span class="value">${escapeHtml(reserva.descripcion_problema)}</span></div>
                </div>
                ${reserva.mensaje_adicional ? `
                    <div class="reserva-info">
                        <i class="fas fa-comment"></i>
                        <div><span class="label">Notas:</span> <span class="value">${escapeHtml(reserva.mensaje_adicional)}</span></div>
                    </div>
                ` : ''}
                <div class="reserva-info">
                    <i class="fas fa-tag"></i>
                    <div><span class="label">Estado:</span> 
                        <span class="solicitud-estado estado-${reserva.estado}">
                            ${reserva.estado === 'pendiente' ? '⏳ Pendiente' : 
                              reserva.estado === 'confirmada' ? '✅ Confirmada' : 
                              reserva.estado === 'cancelada' ? '❌ Cancelada' : '🏁 Completada'}
                        </span>
                    </div>
                </div>
            </div>
        `;
        
        const modalFooter = document.getElementById('modalFooter');
        if (reserva.estado !== 'completada') {
            modalFooter.innerHTML = `
                <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
                <button class="btn-primary" onclick="editarReserva(${reserva.id}); cerrarModal();">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn-danger" onclick="eliminarReserva(${reserva.id}); cerrarModal();">
                    <i class="fas fa-trash"></i> Eliminar
                </button>
            `;
        } else {
            modalFooter.innerHTML = `<button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>`;
        }
        
        document.getElementById('modalSolicitud').classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cerrarModal() {
    document.getElementById('modalSolicitud').classList.remove('show');
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
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && document.body.contains(toast)) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
        }
    }, 3000);
}

// Exponer funciones globales
window.confirmarSolicitud = confirmarSolicitud;
window.rechazarSolicitud = rechazarSolicitud;
window.marcarCompletada = marcarCompletada;
window.verDetalleSolicitud = verDetalleSolicitud;
window.verDetalleReserva = verDetalleReserva;
window.editarReserva = editarReserva;
window.eliminarReserva = eliminarReserva;
window.cerrarModal = cerrarModal;
window.cerrarModalNuevoCliente = cerrarModalNuevoCliente;
window.registrarNuevoCliente = registrarNuevoCliente;
window.cambiarTab = cambiarTab;