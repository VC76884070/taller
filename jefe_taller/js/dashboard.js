// =====================================================
// DASHBOARD JEFE DE TALLER - VERSIÓN CORREGIDA
// VERSIÓN CORREGIDA - USA VARIABLE GLOBAL DE INCLUDE.JS
// =====================================================

if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 dashboard.js - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 dashboard.js - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

const API_URL = window.API_BASE_URL + '/api';
let calendar = null;
let currentUser = null;
let rolesUsuario = [];

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando dashboard Jefe Taller');
    console.log('📡 API_URL:', API_URL);
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    await loadDashboardData();
    setupEventListeners();
    iniciarPolling();
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
        
        if (currentUser && currentUser.roles) {
            rolesUsuario = currentUser.roles;
        }
        
        const tieneRolJefeTaller = rolesUsuario.includes('jefe_taller');
        
        if (!tieneRolJefeTaller) {
            if (rolesUsuario.includes('jefe_operativo')) {
                window.location.href = window.API_BASE_URL + '/jefe_operativo/dashboard.html';
            } else {
                window.location.href = window.API_BASE_URL + '/';
            }
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = window.API_BASE_URL + '/';
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
    
    initCalendar();
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadDashboardData());
    }
}

function iniciarPolling() {
    setInterval(() => {
        loadDashboardDataSilencioso();
    }, 30000);
}

async function loadDashboardDataSilencioso() {
    try {
        const token = localStorage.getItem('furia_token');
        
        const [bahiasRes, ordenesRes] = await Promise.all([
            fetch(`${API_URL}/jefe-taller/bahias-estado`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/jefe-taller/ordenes-activas`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        
        const bahias = bahiasRes.ok ? await bahiasRes.json() : null;
        const ordenesActivas = ordenesRes.ok ? await ordenesRes.json() : null;
        
        if (bahias && bahias.bahias) {
            renderizarBahias(bahias.bahias);
        }
        
        if (ordenesActivas && ordenesActivas.ordenes) {
            renderizarVehiculosTaller(ordenesActivas.ordenes);
            const vehiculosCount = document.getElementById('vehiculosTallerCount');
            if (vehiculosCount) vehiculosCount.textContent = ordenesActivas.ordenes.length;
        }
        
        if (calendar) calendar.refetchEvents();
        
    } catch (error) {
        console.error('Error en polling silencioso:', error);
    }
}

// =====================================================
// CALENDARIO - USANDO ENDPOINT ESPECÍFICO
// =====================================================

function initCalendar() {
    const calendarEl = document.getElementById('calendarioJefe');
    if (!calendarEl) return;
    
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
        datesSet: () => {
            setTimeout(() => pintarDiasReparacion(), 150);
        }
    });
    
    calendar.render();
    setTimeout(() => pintarDiasReparacion(), 500);
}

async function cargarEventosCalendario(info, successCallback, failureCallback) {
    try {
        const token = localStorage.getItem('furia_token');
        
        console.log('📅 Cargando eventos del calendario...');
        
        // Usar el nuevo endpoint específico para el calendario
        const response = await fetch(`${API_URL}/jefe-taller/eventos-calendario`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            console.error('Error en respuesta:', response.status);
            successCallback([]);
            return;
        }
        
        const data = await response.json();
        console.log('📅 Eventos recibidos:', data);
        
        const eventos = [];
        
        if (data.success && data.eventos && data.eventos.length > 0) {
            data.eventos.forEach(evento => {
                // Validar fecha
                let fechaEvento = new Date(evento.start);
                if (isNaN(fechaEvento.getTime())) {
                    console.warn(`Fecha inválida para evento: ${evento.title}`);
                    return;
                }
                
                eventos.push({
                    id: evento.id,
                    title: evento.title,
                    start: fechaEvento,
                    backgroundColor: evento.backgroundColor || '#FF9800',
                    borderColor: evento.borderColor || '#FF9800',
                    textColor: '#ffffff',
                    extendedProps: {
                        orden_id: evento.extendedProps?.orden_id,
                        codigo_unico: evento.extendedProps?.codigo_unico
                    }
                });
            });
        }
        
        console.log(`📅 Eventos cargados para calendario: ${eventos.length}`);
        successCallback(eventos);
        
    } catch (error) {
        console.error('Error cargando eventos:', error);
        successCallback([]);
    }
}

async function pintarDiasReparacion() {
    try {
        const token = localStorage.getItem('furia_token');
        
        // Para pintar días, seguimos usando ordenes-activas que tiene más información
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-activas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        
        if (!data.success || !data.ordenes || data.ordenes.length === 0) return;
        
        document.querySelectorAll('.fc-daygrid-day').forEach(day => {
            day.classList.remove('reparacion-dia', 'entrega-dia', 'atrasado-dia');
            day.removeAttribute('data-tooltip');
        });
        
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        data.ordenes.forEach(orden => {
            let fechaIngreso;
            
            if (orden.fecha_ingreso) {
                try {
                    if (typeof orden.fecha_ingreso === 'string') {
                        fechaIngreso = new Date(orden.fecha_ingreso);
                        if (isNaN(fechaIngreso.getTime())) {
                            fechaIngreso = new Date(orden.fecha_ingreso.split('T')[0]);
                        }
                    } else {
                        fechaIngreso = new Date(orden.fecha_ingreso);
                    }
                } catch (e) {
                    fechaIngreso = new Date();
                }
            } else {
                fechaIngreso = new Date();
            }
            
            let fechaFin = new Date(fechaIngreso);
            
            if (orden.dias_estimados_reparacion) {
                fechaFin.setDate(fechaIngreso.getDate() + orden.dias_estimados_reparacion);
            } else {
                return;
            }
            
            const vehiculo = orden.vehiculo || {};
            const placa = vehiculo.placa || orden.codigo_unico || 'Vehículo';
            const modelo = vehiculo.modelo || '';
            const cliente = vehiculo.cliente_nombre || 'Cliente';
            const diasEstimados = orden.dias_estimados_reparacion;
            
            const dias = [];
            let currentDate = new Date(fechaIngreso);
            currentDate.setHours(0, 0, 0, 0);
            
            while (currentDate <= fechaFin) {
                dias.push(new Date(currentDate));
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            dias.forEach(dia => {
                const diaStr = dia.toISOString().split('T')[0];
                const dayElements = document.querySelectorAll(`.fc-daygrid-day[data-date="${diaStr}"]`);
                
                const esUltimoDia = dia.toDateString() === fechaFin.toDateString();
                const estaAtrasado = dia < hoy && esUltimoDia;
                
                dayElements.forEach(dayEl => {
                    if (esUltimoDia) {
                        if (estaAtrasado) {
                            dayEl.classList.add('atrasado-dia');
                            dayEl.setAttribute('data-tooltip', `⚠️ ATRASADO: ${placa}\n📅 Entrega: ${fechaFin.toLocaleDateString()}\n👤 Cliente: ${cliente}`);
                        } else {
                            dayEl.classList.add('entrega-dia');
                            dayEl.setAttribute('data-tooltip', `🚗 ENTREGA: ${placa}\n📅 ${diasEstimados} días\n👤 Cliente: ${cliente}`);
                        }
                    } else {
                        dayEl.classList.add('reparacion-dia');
                        let tooltip = `🔧 REPARACIÓN: ${placa} ${modelo}`;
                        if (dia.toDateString() === fechaIngreso.toDateString()) {
                            tooltip = `📅 INGRESO: ${placa}\n⏱️ ${diasEstimados} días\n👤 Cliente: ${cliente}`;
                        }
                        dayEl.setAttribute('data-tooltip', tooltip);
                    }
                });
            });
        });
        
    } catch (error) {
        console.error('Error pintando días de reparación:', error);
    }
}

// =====================================================
// CARGAR DATOS DEL DASHBOARD
// =====================================================

async function loadDashboardData() {
    mostrarLoading(true);
    try {
        const token = localStorage.getItem('furia_token');
        
        console.log('🔄 Cargando datos del dashboard...');
        
        const [bahiasRes, diagnosticosRes, cotizacionesRes, ordenesRes] = await Promise.all([
            fetch(`${API_URL}/jefe-taller/bahias-estado`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/jefe-taller/diagnosticos-pendientes`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/jefe-taller/cotizaciones-enviadas-dashboard`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/jefe-taller/ordenes-activas`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        
        const bahias = bahiasRes.ok ? await bahiasRes.json() : null;
        const diagnosticos = diagnosticosRes.ok ? await diagnosticosRes.json() : null;
        const cotizaciones = cotizacionesRes.ok ? await cotizacionesRes.json() : null;
        const ordenesActivas = ordenesRes.ok ? await ordenesRes.json() : null;
        
        console.log('📊 Datos recibidos:');
        console.log('- Bahías:', bahias?.bahias?.length || 0);
        console.log('- Diagnósticos:', diagnosticos?.diagnosticos?.length || 0);
        console.log('- Cotizaciones:', cotizaciones?.cotizaciones?.length || 0);
        console.log('- Órdenes activas:', ordenesActivas?.ordenes?.length || 0);
        
        // Mostrar la primera orden para debug
        if (ordenesActivas && ordenesActivas.ordenes && ordenesActivas.ordenes.length > 0) {
            console.log('📋 Primera orden:', ordenesActivas.ordenes[0]);
        }
        
        actualizarUI(bahias, diagnosticos, cotizaciones, ordenesActivas);
        
        if (calendar) {
            setTimeout(() => {
                console.log('🔄 Refrescando calendario...');
                calendar.refetchEvents();
            }, 500);
        }
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        mostrarNotificacion('Error al cargar datos del servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function actualizarUI(bahias, diagnosticos, cotizaciones, ordenesActivas) {
    // Bahías
    if (bahias && bahias.bahias && bahias.bahias.length > 0) {
        renderizarBahias(bahias.bahias);
    } else {
        renderizarVacio('bahiasGrid', 'No hay información de bahías');
    }
    
    // Diagnósticos pendientes
    if (diagnosticos && diagnosticos.diagnosticos && diagnosticos.diagnosticos.length > 0) {
        renderizarDiagnosticos(diagnosticos.diagnosticos);
        const pendientesCount = document.getElementById('pendientesCount');
        if (pendientesCount) pendientesCount.textContent = diagnosticos.diagnosticos.length;
    } else {
        renderizarVacio('diagnosticosList', 'No hay diagnósticos pendientes');
        const pendientesCount = document.getElementById('pendientesCount');
        if (pendientesCount) pendientesCount.textContent = '0';
    }
    
    // Cotizaciones (próximas entregas)
    if (cotizaciones && cotizaciones.cotizaciones && cotizaciones.cotizaciones.length > 0) {
        renderizarEntregas(cotizaciones.cotizaciones);
    } else {
        renderizarVacio('entregasList', 'No hay cotizaciones enviadas');
    }
    
    // Vehículos en taller
    if (ordenesActivas && ordenesActivas.ordenes && ordenesActivas.ordenes.length > 0) {
        renderizarVehiculosTaller(ordenesActivas.ordenes);
        const vehiculosCount = document.getElementById('vehiculosTallerCount');
        if (vehiculosCount) vehiculosCount.textContent = ordenesActivas.ordenes.length;
    } else {
        renderizarVacio('vehiculosTallerList', 'No hay vehículos en taller');
        const vehiculosCount = document.getElementById('vehiculosTallerCount');
        if (vehiculosCount) vehiculosCount.textContent = '0';
    }
}

function renderizarVacio(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${mensaje}</p></div>`;
    }
}

// =====================================================
// RENDERIZADO DE BAHÍAS
// =====================================================

function renderizarBahias(bahias) {
    const container = document.getElementById('bahiasGrid');
    if (!container) return;
    
    const estadosTexto = { 
        'ocupada': 'Ocupada', 
        'reservada': 'Reservada', 
        'libre': 'Libre' 
    };
    
    const estadosColor = {
        'ocupada': '#E91E63',
        'reservada': '#FF9800',
        'libre': '#4CAF50'
    };
    
    if (!bahias || bahias.length === 0) {
        renderizarVacio('bahiasGrid', 'No hay información de bahías');
        return;
    }
    
    container.innerHTML = bahias.map(b => `
        <div class="bahia-item ${b.estado}" onclick="verDetalleBahia(${b.numero})" style="border-left: 4px solid ${estadosColor[b.estado] || '#ccc'}">
            <div class="bahia-numero">Bahía ${b.numero}</div>
            <div class="bahia-estado" style="color: ${estadosColor[b.estado] || '#666'}">
                ${estadosTexto[b.estado] || b.estado}
            </div>
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
            <div class="diagnostico-item" onclick="revisarDiagnostico(${diagnosticoId})">
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
            <div class="entrega-item" onclick="verCotizacion(${c.id})">
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
        'EnRecepcion': '#FF9800',
        'EnDiagnostico': '#2196F3',
        'EnReparacion': '#4CAF50',
        'EnPausa': '#9E9E9E',
        'PendienteAprobacion': '#FF5722'
    };
    
    const estadoDisplay = {
        'EnRecepcion': 'En Recepción',
        'EnDiagnostico': 'En Diagnóstico',
        'EnReparacion': 'En Reparación',
        'EnPausa': 'En Pausa',
        'ReparacionCompletada': 'Reparación Completada',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado'
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
            <div class="vehiculo-taller-item" onclick="verOrdenTrabajo(${ordenId})">
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
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const icon = tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<span><i class="fas ${icon}"></i> ${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// =====================================================
// FUNCIONES GLOBALES (para onclick)
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

window.logout = () => {
    localStorage.clear();
    window.location.href = window.API_BASE_URL + '/';
};