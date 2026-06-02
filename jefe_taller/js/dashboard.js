// =====================================================
// DASHBOARD JEFE DE TALLER - VERSIÓN COMPLETA
// CON TODOS LOS ENDPOINTS Y MODAL DE COMUNICADOS
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

const API_URL = window.API_BASE_URL + '/api/jefe-taller';
let calendar = null;
let ordenesActivas = [];
let currentUser = null;
let comunicadosActuales = [];

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando dashboard Jefe Taller');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    await cargarDatosIniciales();
    initFullCalendar();
    setupEventListeners();
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
        notificationIcon.addEventListener('click', abrirModalComunicados);
    }
}

// =====================================================
// CARGAR DATOS CON NUEVOS ENDPOINTS
// =====================================================

async function cargarDatosIniciales() {
    mostrarLoading(true);
    try {
        console.log('🔄 Cargando datos...');
        
        const [ordenesRes, bahiasRes, diagnosticosRes, cotizacionesRes, comunicadosRes] = await Promise.all([
            fetch(`${API_URL}/mis-ordenes-activas`, { headers: getHeaders() }),
            fetch(`${API_URL}/mis-bahias-estado`, { headers: getHeaders() }),
            fetch(`${API_URL}/mis-diagnosticos`, { headers: getHeaders() }),
            fetch(`${API_URL}/mis-cotizaciones`, { headers: getHeaders() }),
            fetch(`${API_URL}/mis-comunicados`, { headers: getHeaders() })
        ]);
        
        const ordenes = await ordenesRes.json();
        const bahias = await bahiasRes.json();
        const diagnosticos = await diagnosticosRes.json();
        const cotizaciones = await cotizacionesRes.json();
        const comunicados = await comunicadosRes.json();
        
        if (ordenes.success && ordenes.ordenes) {
            ordenesActivas = ordenes.ordenes;
            console.log(`📊 Órdenes activas cargadas: ${ordenesActivas.length}`);
            
            ordenesActivas.forEach(orden => {
                console.log(`📝 Orden ${orden.id_orden}: ingreso=${orden.fecha_ingreso}, dias=${orden.dias_estimados_reparacion}, placa=${orden.vehiculo?.placa}`);
            });
        }
        
        // Actualizar badge de notificaciones
        if (comunicados.success && comunicados.comunicados) {
            const badge = document.getElementById('notificacionesBadge');
            if (badge) {
                const cantidad = comunicados.comunicados.length;
                badge.textContent = cantidad;
                badge.style.display = cantidad > 0 ? 'inline-block' : 'none';
            }
        }
        
        // Actualizar UI
        if (bahias.success && bahias.bahias) {
            renderizarBahias(bahias.bahias);
        } else {
            renderizarVacio('bahiasGrid', 'No hay información de bahías');
        }
        
        if (diagnosticos.success && diagnosticos.diagnosticos && diagnosticos.diagnosticos.length > 0) {
            renderizarDiagnosticos(diagnosticos.diagnosticos);
            const pendientesCount = document.getElementById('pendientesCount');
            if (pendientesCount) pendientesCount.textContent = diagnosticos.diagnosticos.length;
        } else {
            renderizarVacio('diagnosticosList', 'No hay diagnósticos pendientes');
            const pendientesCount = document.getElementById('pendientesCount');
            if (pendientesCount) pendientesCount.textContent = '0';
        }
        
        if (cotizaciones.success && cotizaciones.cotizaciones && cotizaciones.cotizaciones.length > 0) {
            renderizarEntregas(cotizaciones.cotizaciones);
        } else {
            renderizarVacio('entregasList', 'No hay cotizaciones pendientes');
        }
        
        if (ordenesActivas.length > 0) {
            renderizarVehiculosTaller(ordenesActivas);
            const vehiculosCount = document.getElementById('vehiculosTallerCount');
            if (vehiculosCount) vehiculosCount.textContent = ordenesActivas.length;
        } else {
            renderizarVacio('vehiculosTallerList', 'No hay vehículos en taller');
            const vehiculosCount = document.getElementById('vehiculosTallerCount');
            if (vehiculosCount) vehiculosCount.textContent = '0';
        }
        
        // Refrescar calendario si ya está inicializado
        if (calendar) {
            calendar.refetchEvents();
        }
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarNotificacion('Error al cargar datos del servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarVacio(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${mensaje}</p></div>`;
    }
}

// =====================================================
// FULLCALENDAR - CALENDARIO CON RANGOS DE FECHAS
// =====================================================

function initFullCalendar() {
    const container = document.getElementById('fullcalendar-container');
    if (!container) {
        console.error('❌ No se encontró el contenedor');
        setTimeout(() => initFullCalendar(), 500);
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
            right: 'dayGridMonth'
        },
        height: 'auto',
        weekends: true,
        nowIndicator: true,
        
        events: function(fetchInfo, successCallback, failureCallback) {
            console.log('📅 Generando eventos...');
            
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
                
                console.log(`📅 Evento: ${placa} | ${fechaInicio.toLocaleDateString()} - ${fechaFin.toLocaleDateString()}`);
                
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
            console.log('Evento clickeado:', info.event.title);
            const ordenId = info.event.id.split('-')[1];
            if (ordenId) {
                mostrarOrdenesDelDiaPorId(parseInt(ordenId));
                window.verOrdenTrabajo(parseInt(ordenId));
            }
        },
        
        dateClick: function(info) {
            console.log('Fecha clickeada:', info.dateStr);
            mostrarOrdenesDelDia(info.dateStr);
        }
    });
    
    calendar.render();
    console.log('✅ FullCalendar inicializado');
}

function mostrarOrdenesDelDia(fechaStr) {
    const container = document.getElementById('infoDiaSeleccionado');
    const ordenesContainer = document.getElementById('ordenesDelDia');
    
    if (!container || !ordenesContainer) return;
    
    const fechaSeleccionada = new Date(fechaStr);
    if (isNaN(fechaSeleccionada.getTime())) return;
    fechaSeleccionada.setHours(0, 0, 0, 0);
    
    const ordenesEnDia = ordenesActivas.filter(orden => {
        if (!orden.fecha_ingreso) return false;
        
        let fechaIngreso = new Date(orden.fecha_ingreso);
        if (isNaN(fechaIngreso.getTime())) return false;
        fechaIngreso.setHours(0, 0, 0, 0);
        
        let fechaFin;
        if (orden.dias_estimados_reparacion && orden.dias_estimados_reparacion > 0) {
            fechaFin = new Date(fechaIngreso);
            fechaFin.setDate(fechaIngreso.getDate() + orden.dias_estimados_reparacion);
        } else if (orden.fecha_estimada_finalizacion) {
            fechaFin = new Date(orden.fecha_estimada_finalizacion);
        } else {
            return false;
        }
        if (fechaFin) fechaFin.setHours(0, 0, 0, 0);
        
        return fechaSeleccionada >= fechaIngreso && fechaSeleccionada <= fechaFin;
    });
    
    if (ordenesEnDia.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    ordenesContainer.innerHTML = ordenesEnDia.map(orden => {
        const placa = orden.vehiculo?.placa || orden.codigo_unico || 'Vehículo';
        const marca = orden.vehiculo?.marca || '';
        const modelo = orden.vehiculo?.modelo || '';
        
        let fechaIngreso = new Date(orden.fecha_ingreso);
        fechaIngreso.setHours(0, 0, 0, 0);
        
        let fechaFin;
        if (orden.dias_estimados_reparacion && orden.dias_estimados_reparacion > 0) {
            fechaFin = new Date(fechaIngreso);
            fechaFin.setDate(fechaIngreso.getDate() + orden.dias_estimados_reparacion);
        } else if (orden.fecha_estimada_finalizacion) {
            fechaFin = new Date(orden.fecha_estimada_finalizacion);
        }
        if (fechaFin) fechaFin.setHours(0, 0, 0, 0);
        
        const esUltimoDia = fechaFin && fechaSeleccionada.getTime() === fechaFin.getTime();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const estaAtrasado = fechaFin && fechaFin < hoy && esUltimoDia;
        
        let estadoClase = 'reparacion';
        let estadoTexto = 'En reparación';
        
        if (esUltimoDia) {
            if (estaAtrasado) {
                estadoClase = 'atrasado';
                estadoTexto = '⚠️ ATRASADO';
            } else {
                estadoClase = 'entrega';
                estadoTexto = '🚗 ENTREGA';
            }
        }
        
        const ordenId = orden.id_orden || orden.id;
        
        return `
            <div class="orden-dia-item ${estadoClase}" onclick="window.verOrdenTrabajo(${ordenId})">
                <div class="orden-dia-placa">
                    <strong>${escapeHtml(placa)}</strong> - ${escapeHtml(marca)} ${escapeHtml(modelo)}
                </div>
                <div class="orden-dia-estado ${estadoClase}">${estadoTexto}</div>
            </div>
        `;
    }).join('');
}

function mostrarOrdenesDelDiaPorId(ordenId) {
    const container = document.getElementById('infoDiaSeleccionado');
    const ordenesContainer = document.getElementById('ordenesDelDia');
    
    if (!container || !ordenesContainer) return;
    
    const orden = ordenesActivas.find(o => (o.id_orden || o.id) === ordenId);
    if (!orden) return;
    
    container.style.display = 'block';
    
    const placa = orden.vehiculo?.placa || orden.codigo_unico || 'Vehículo';
    const marca = orden.vehiculo?.marca || '';
    const modelo = orden.vehiculo?.modelo || '';
    
    ordenesContainer.innerHTML = `
        <div class="orden-dia-item entrega" onclick="window.verOrdenTrabajo(${ordenId})">
            <div class="orden-dia-placa">
                <strong>${escapeHtml(placa)}</strong> - ${escapeHtml(marca)} ${escapeHtml(modelo)}
            </div>
            <div class="orden-dia-estado entrega">🚗 VER ORDEN</div>
        </div>
    `;
}

// =====================================================
// RENDERIZADO DE BAHÍAS
// =====================================================

function renderizarBahias(bahias) {
    const container = document.getElementById('bahiasGrid');
    if (!container) return;
    
    const estadosTexto = { 'ocupada': 'Ocupada', 'reservada': 'Reservada', 'libre': 'Libre' };
    const estadosColor = { 'ocupada': '#E91E63', 'reservada': '#FF9800', 'libre': '#4CAF50' };
    
    if (!bahias || bahias.length === 0) {
        renderizarVacio('bahiasGrid', 'No hay información de bahías');
        return;
    }
    
    container.innerHTML = bahias.map(b => `
        <div class="bahia-item ${b.estado}" onclick="window.verDetalleBahia(${b.numero})" style="border-left: 4px solid ${estadosColor[b.estado] || '#ccc'}">
            <div class="bahia-numero">Bahía ${b.numero}</div>
            <div class="bahia-estado" style="color: ${estadosColor[b.estado] || '#666'}">${estadosTexto[b.estado] || b.estado}</div>
            ${b.tecnico ? `<div class="bahia-tecnico"><i class="fas fa-user"></i> ${escapeHtml(b.tecnico)}</div>` : ''}
            ${b.orden_codigo ? `<div class="bahia-orden"><i class="fas fa-clipboard"></i> ${escapeHtml(b.orden_codigo)}</div>` : ''}
        </div>
    `).join('');
}

// =====================================================
// RENDERIZADO DE DIAGNÓSTICOS
// =====================================================

function renderizarDiagnosticos(diagnosticos) {
    const container = document.getElementById('diagnosticosList');
    if (!container) return;
    
    if (!diagnosticos || diagnosticos.length === 0) {
        renderizarVacio('diagnosticosList', 'No hay diagnósticos pendientes');
        return;
    }
    
    container.innerHTML = diagnosticos.map(d => {
        const vehiculo = d.vehiculo || 'Vehículo';
        const placa = d.placa || '';
        const informe = d.informe || 'Sin informe';
        const fecha = formatearFecha(d.fecha_envio);
        const tecnico = d.tecnico_nombre || 'Sin técnico';
        const diagnosticoId = d.diagnostico_id || d.id;
        
        return `
            <div class="diagnostico-item" onclick="window.revisarDiagnostico(${diagnosticoId})">
                <div class="diagnostico-icon"><i class="fas fa-stethoscope"></i></div>
                <div class="diagnostico-content">
                    <h4>${escapeHtml(vehiculo)} ${placa ? `<span class="placa">${escapeHtml(placa)}</span>` : ''}</h4>
                    <p class="informe-preview">${escapeHtml(informe.substring(0, 80))}${informe.length > 80 ? '...' : ''}</p>
                    <div class="diagnostico-meta">
                        <span class="tecnico"><i class="fas fa-user"></i> ${escapeHtml(tecnico)}</span>
                        <span class="fecha"><i class="far fa-calendar"></i> ${fecha}</span>
                    </div>
                </div>
                <div class="diagnostico-action">
                    <button class="btn-revisar">Revisar</button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// RENDERIZADO DE ENTREGAS (COTIZACIONES)
// =====================================================

function renderizarEntregas(cotizaciones) {
    const container = document.getElementById('entregasList');
    if (!container) return;
    
    if (!cotizaciones || cotizaciones.length === 0) {
        renderizarVacio('entregasList', 'No hay cotizaciones pendientes');
        return;
    }
    
    container.innerHTML = cotizaciones.slice(0, 5).map(c => {
        const vehiculo = c.vehiculo || 'Vehículo';
        const placa = c.placa || '';
        const cliente = c.cliente_nombre || 'Cliente';
        const total = c.total || 0;
        const estado = c.estado || 'enviada';
        
        return `
            <div class="entrega-item" onclick="window.verCotizacion(${c.id})">
                <div class="entrega-icon"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="entrega-content">
                    <h4>${escapeHtml(vehiculo)} ${placa ? `<span class="placa">${escapeHtml(placa)}</span>` : ''}</h4>
                    <p class="cliente"><i class="fas fa-user"></i> ${escapeHtml(cliente)}</p>
                    <p class="entrega-total">Bs. ${total.toFixed(2)}</p>
                </div>
                <div class="entrega-status">
                    <span class="status-badge ${estado === 'aprobada' ? 'aprobada' : 'pendiente'}">
                        ${estado === 'aprobada' ? 'Aprobada' : 'Pendiente'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// RENDERIZADO DE VEHÍCULOS EN TALLER
// =====================================================

function renderizarVehiculosTaller(ordenes) {
    const container = document.getElementById('vehiculosTallerList');
    if (!container) return;
    
    if (!ordenes || ordenes.length === 0) {
        renderizarVacio('vehiculosTallerList', 'No hay vehículos en taller');
        return;
    }
    
    const estadoColor = {
        'EnRecepcion': '#FF9800', 'EnDiagnostico': '#2196F3', 'EnReparacion': '#4CAF50',
        'EnPausa': '#9E9E9E', 'PendienteAprobacion': '#FF5722'
    };
    
    const estadoDisplay = {
        'EnRecepcion': 'En Recepción', 'EnDiagnostico': 'En Diagnóstico', 'EnReparacion': 'En Reparación',
        'EnPausa': 'En Pausa', 'ReparacionCompletada': 'Reparación Completada',
        'Finalizado': 'Finalizado', 'Entregado': 'Entregado'
    };
    
    container.innerHTML = ordenes.map(orden => {
        const vehiculo = orden.vehiculo || {};
        const placa = vehiculo.placa || orden.codigo_unico || 'Vehículo';
        const marca = vehiculo.marca || '';
        const modelo = vehiculo.modelo || '';
        const estadoGlobal = orden.estado_global;
        const ordenId = orden.id_orden || orden.id;
        
        let diasTexto = '';
        if (orden.dias_estimados_reparacion) {
            diasTexto = `${orden.dias_estimados_reparacion} días estimados`;
        }
        
        return `
            <div class="vehiculo-taller-item" onclick="window.verOrdenTrabajo(${ordenId})">
                <div class="vehiculo-taller-icon"><i class="fas fa-car-side"></i></div>
                <div class="vehiculo-taller-info">
                    <div class="vehiculo-taller-placa">${escapeHtml(placa)}</div>
                    <div class="vehiculo-taller-modelo">${escapeHtml(marca)} ${escapeHtml(modelo)}</div>
                    <div class="vehiculo-taller-estado" style="color: ${estadoColor[estadoGlobal] || '#666'}">
                        <i class="fas fa-circle" style="font-size: 8px;"></i> ${estadoDisplay[estadoGlobal] || estadoGlobal || 'En proceso'}
                    </div>
                </div>
                ${diasTexto ? `<div class="vehiculo-taller-dias">${diasTexto}</div>` : ''}
            </div>
        `;
    }).join('');
}

// =====================================================
// MODAL DE COMUNICADOS
// =====================================================

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
    }
}

async function cargarComunicados() {
    const listaContainer = document.getElementById('listaComunicados');
    if (!listaContainer) return;
    
    listaContainer.innerHTML = `
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
        
        if (data.success && data.comunicados && data.comunicados.length > 0) {
            comunicadosActuales = data.comunicados;
            renderizarListaComunicados();
        } else {
            listaContainer.innerHTML = `
                <div class="sin-comunicados">
                    <i class="fas fa-inbox"></i>
                    <p>No hay comunicados nuevos</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error cargando comunicados:', error);
        listaContainer.innerHTML = `
            <div class="sin-comunicados">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error al cargar comunicados</p>
            </div>
        `;
    }
}

function renderizarListaComunicados() {
    const listaContainer = document.getElementById('listaComunicados');
    if (!listaContainer) return;
    
    if (comunicadosActuales.length === 0) {
        listaContainer.innerHTML = `
            <div class="sin-comunicados">
                <i class="fas fa-inbox"></i>
                <p>No hay comunicados nuevos</p>
            </div>
        `;
        return;
    }
    
    listaContainer.innerHTML = comunicadosActuales.map(com => `
        <div class="comunicado-item prioridad-${com.prioridad}" onclick="verDetalleComunicado(${com.id})">
            <div class="comunicado-header">
                <h4 class="comunicado-titulo">${escapeHtml(com.titulo)}</h4>
                <span class="comunicado-fecha">
                    <i class="far fa-calendar-alt"></i>
                    ${formatearFechaComunicado(com.fecha_creacion)}
                </span>
            </div>
            <div class="comunicado-contenido">
                ${escapeHtml(stripHtml(com.contenido))}
            </div>
            <div class="comunicado-prioridad">
                <span class="prioridad-badge ${com.prioridad}">
                    ${com.prioridad === 'alta' ? '⚠️ Alta' : com.prioridad === 'media' ? '📌 Media' : 'ℹ️ Normal'}
                </span>
            </div>
        </div>
    `).join('');
}

function verDetalleComunicado(id) {
    const comunicado = comunicadosActuales.find(c => c.id === id);
    if (!comunicado) return;
    
    const modalBody = document.getElementById('modalBodyComunicados');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
        <button class="volver-btn" onclick="cargarComunicados()">
            <i class="fas fa-arrow-left"></i> Volver
        </button>
        <div class="comunicado-detalle">
            <div class="comunicado-detalle-titulo">${escapeHtml(comunicado.titulo)}</div>
            <div class="comunicado-detalle-fecha">
                <i class="far fa-calendar-alt"></i>
                ${formatearFechaComunicado(comunicado.fecha_creacion)}
                <span class="prioridad-badge ${comunicado.prioridad}" style="margin-left: 0.5rem;">
                    ${comunicado.prioridad === 'alta' ? '⚠️ Alta' : comunicado.prioridad === 'media' ? '📌 Media' : 'ℹ️ Normal'}
                </span>
            </div>
            <div class="comunicado-detalle-contenido">
                ${comunicado.contenido}
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
            year: 'numeric'
        });
    }
}

function stripHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function formatearFecha(fecha) {
    if (!fecha) return 'Fecha no disponible';
    try {
        const d = new Date(fecha);
        if (isNaN(d.getTime())) return fecha;
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return fecha;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
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
// FUNCIONES GLOBALES
// =====================================================

window.verDetalleBahia = (numero) => {
    mostrarNotificacion(`Ver detalles de Bahía ${numero}`, 'info');
};

window.revisarDiagnostico = (id) => {
    if (id) {
        window.location.href = window.API_BASE_URL + `/jefe_taller/diagnostico.html?diagnostico_id=${id}`;
    }
};

window.verCotizacion = (id) => {
    if (id) {
        window.location.href = window.API_BASE_URL + `/jefe_taller/cotizaciones.html?id=${id}`;
    }
};

window.verOrdenTrabajo = (id) => {
    if (id) {
        window.location.href = window.API_BASE_URL + `/jefe_taller/orden_trabajo.html?id=${id}`;
    }
};

window.verDetalleComunicado = verDetalleComunicado;
window.cerrarModalComunicados = cerrarModalComunicados;

window.logout = () => {
    localStorage.clear();
    window.location.href = window.API_BASE_URL + '/';
};