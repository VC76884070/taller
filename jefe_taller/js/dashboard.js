// =====================================================
// DASHBOARD JEFE DE TALLER - SIN DATOS DE EJEMPLO
// =====================================================

const API_URL = window.location.origin + '/api';
let calendar = null;
let currentUser = null;
let rolesUsuario = [];

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando dashboard Jefe Taller');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    await loadDashboardData();
    setupEventListeners();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    
    if (!token) {
        window.location.href = '/';
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
                window.location.href = '/jefe_operativo/dashboard.html';
            } else {
                window.location.href = '/';
            }
            return false;
        }
        
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
    
    initCalendar();
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadDashboardData());
    }
}

// =====================================================
// CALENDARIO - SOLO CON ÓRDENES ACTIVAS
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
    setTimeout(() => pintarDiasReparacion(), 300);
}

async function cargarEventosCalendario(info, successCallback, failureCallback) {
    try {
        const token = localStorage.getItem('furia_token');
        
        // Solo cargar órdenes activas del taller
        const ordenesResponse = await fetch(`${API_URL}/jefe-taller/ordenes-activas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!ordenesResponse.ok) {
            console.error('Error cargando órdenes para calendario:', ordenesResponse.status);
            successCallback([]);
            return;
        }
        
        const ordenesData = await ordenesResponse.json();
        const eventos = [];
        
        if (ordenesData.ordenes && ordenesData.ordenes.length > 0) {
            ordenesData.ordenes.forEach(orden => {
                if (orden.fecha_ingreso) {
                    const fechaIngreso = new Date(orden.fecha_ingreso);
                    eventos.push({
                        id: `orden_${orden.id_orden}`,
                        title: `🔧 ${orden.vehiculo?.placa || 'Vehículo'}`,
                        start: fechaIngreso,
                        backgroundColor: '#FF9800',
                        borderColor: '#FF9800',
                        extendedProps: {
                            tipo: 'orden',
                            orden_codigo: orden.codigo_unico,
                            placa: orden.vehiculo?.placa
                        }
                    });
                }
            });
        }
        
        console.log(`📅 Eventos cargados: ${eventos.length}`);
        successCallback(eventos);
        setTimeout(() => pintarDiasReparacion(), 150);
        
    } catch (error) {
        console.error('Error cargando eventos:', error);
        successCallback([]);
    }
}

async function pintarDiasReparacion() {
    try {
        const token = localStorage.getItem('furia_token');
        
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-activas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            console.error('Error obteniendo órdenes para pintar días:', response.status);
            return;
        }
        
        const data = await response.json();
        
        if (!data.success || !data.ordenes || data.ordenes.length === 0) return;
        
        document.querySelectorAll('.fc-daygrid-day').forEach(day => {
            day.classList.remove('reparacion-dia', 'entrega-dia', 'atrasado-dia');
            day.removeAttribute('data-tooltip');
        });
        
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        data.ordenes.forEach(orden => {
            if (!orden.fecha_estimada_finalizacion && !orden.dias_estimados_reparacion) return;
            
            const fechaIngreso = new Date(orden.fecha_ingreso);
            let fechaFin;
            
            if (orden.fecha_estimada_finalizacion) {
                fechaFin = new Date(orden.fecha_estimada_finalizacion);
            } else if (orden.dias_estimados_reparacion) {
                fechaFin = new Date(fechaIngreso);
                fechaFin.setDate(fechaIngreso.getDate() + orden.dias_estimados_reparacion);
            } else {
                return;
            }
            
            const placa = orden.vehiculo?.placa || orden.placa || 'Vehículo';
            const modelo = orden.vehiculo?.modelo || orden.modelo || '';
            const cliente = orden.cliente_nombre || 'Cliente';
            const diasEstimados = orden.dias_estimados_reparacion || 
                Math.ceil((fechaFin - fechaIngreso) / (1000 * 60 * 60 * 24));
            
            const dias = [];
            let currentDate = new Date(fechaIngreso);
            currentDate.setHours(0, 0, 0, 0);
            
            let contador = 0;
            while (currentDate <= fechaFin && contador < 90) {
                dias.push(new Date(currentDate));
                currentDate.setDate(currentDate.getDate() + 1);
                contador++;
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

function verDetalleEvento(event) {
    const props = event.extendedProps;
    if (props.tipo === 'orden') {
        mostrarNotificacion(`Orden: ${props.orden_codigo} - ${props.placa}`, 'info');
    }
}

// =====================================================
// CARGAR DATOS REALES DEL DASHBOARD (SIN EJEMPLOS)
// =====================================================

async function loadDashboardData() {
    mostrarLoading(true);
    try {
        const token = localStorage.getItem('furia_token');
        
        // Cargar todos los datos en paralelo
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
        
        // Mostrar en consola para depuración
        console.log('📊 Datos recibidos:');
        console.log('- Bahías:', bahias?.bahias?.length || 0);
        console.log('- Diagnósticos pendientes:', diagnosticos?.diagnosticos?.length || 0);
        console.log('- Cotizaciones:', cotizaciones?.cotizaciones?.length || 0);
        console.log('- Órdenes activas:', ordenesActivas?.ordenes?.length || 0);
        
        actualizarUI(bahias, diagnosticos, cotizaciones, ordenesActivas);
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        mostrarNotificacion('Error al cargar datos del servidor', 'error');
        // NO mostrar datos de ejemplo, dejar vacío
    } finally {
        mostrarLoading(false);
    }
}

function actualizarUI(bahias, diagnosticos, cotizaciones, ordenesActivas) {
    // Actualizar bahías (si hay datos)
    if (bahias && bahias.bahias && bahias.bahias.length > 0) {
        renderizarBahias(bahias.bahias);
    } else {
        renderizarVacio('bahiasGrid', 'No hay información de bahías disponible');
    }
    
    // Actualizar diagnósticos pendientes
    if (diagnosticos && diagnosticos.diagnosticos && diagnosticos.diagnosticos.length > 0) {
        renderizarDiagnosticos(diagnosticos.diagnosticos);
        const pendientesCount = document.getElementById('pendientesCount');
        if (pendientesCount) pendientesCount.textContent = diagnosticos.diagnosticos.length;
    } else {
        renderizarVacio('diagnosticosList', 'No hay diagnósticos pendientes');
        if (document.getElementById('pendientesCount')) {
            document.getElementById('pendientesCount').textContent = '0';
        }
    }
    
    // Actualizar próximas entregas (cotizaciones)
    if (cotizaciones && cotizaciones.cotizaciones && cotizaciones.cotizaciones.length > 0) {
        renderizarEntregas(cotizaciones.cotizaciones);
    } else {
        renderizarVacio('entregasList', 'No hay cotizaciones enviadas');
    }
    
    // Actualizar vehículos en taller
    if (ordenesActivas && ordenesActivas.ordenes && ordenesActivas.ordenes.length > 0) {
        renderizarVehiculosTaller(ordenesActivas.ordenes);
        const vehiculosCount = document.getElementById('vehiculosTallerCount');
        if (vehiculosCount) vehiculosCount.textContent = ordenesActivas.ordenes.length;
    } else {
        renderizarVacio('vehiculosTallerList', 'No hay vehículos en taller');
        if (document.getElementById('vehiculosTallerCount')) {
            document.getElementById('vehiculosTallerCount').textContent = '0';
        }
    }
}

function renderizarVacio(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${mensaje}</p></div>`;
    }
}

// =====================================================
// FUNCIONES DE RENDERIZADO CON DATOS REALES
// =====================================================

function renderizarBahias(bahias) {
    const container = document.getElementById('bahiasGrid');
    if (!container) return;
    
    const estadosTexto = { 
        'ocupada': 'Ocupada', 
        'reservado': 'Reservada', 
        'libre': 'Libre' 
    };
    
    const estadosColor = {
        'ocupada': '#E91E63',
        'reservado': '#FF9800',
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
            ${b.tecnico ? `<div class="bahia-tecnico"><i class="fas fa-user"></i> ${b.tecnico}</div>` : ''}
            ${b.orden_codigo ? `<div class="bahia-orden"><i class="fas fa-clipboard"></i> ${b.orden_codigo}</div>` : ''}
        </div>
    `).join('');
}

function renderizarDiagnosticos(diagnosticos) {
    const container = document.getElementById('diagnosticosList');
    if (!container) return;
    
    container.innerHTML = diagnosticos.map(d => `
        <div class="diagnostico-item" onclick="revisarDiagnostico(${d.diagnostico_id || d.id})">
            <div class="diagnostico-icon"><i class="fas fa-stethoscope"></i></div>
            <div class="diagnostico-content">
                <h4>${d.vehiculo || 'Vehículo'} <span class="placa">${d.placa || ''}</span></h4>
                <p class="informe-preview">${d.informe ? d.informe.substring(0, 80) : 'Sin informe'}${d.informe?.length > 80 ? '...' : ''}</p>
                <div class="diagnostico-meta">
                    <span class="tecnico"><i class="fas fa-user"></i> ${d.tecnico_nombre || 'Sin técnico'}</span>
                    <span class="fecha"><i class="far fa-calendar"></i> ${formatearFecha(d.fecha_envio)}</span>
                </div>
            </div>
            <div class="diagnostico-action">
                <button class="btn-revisar">Revisar</button>
            </div>
        </div>
    `).join('');
}

function renderizarEntregas(cotizaciones) {
    const container = document.getElementById('entregasList');
    if (!container) return;
    
    container.innerHTML = cotizaciones.slice(0, 5).map(c => `
        <div class="entrega-item" onclick="verCotizacion(${c.id})">
            <div class="entrega-icon"><i class="fas fa-file-invoice-dollar"></i></div>
            <div class="entrega-content">
                <h4>${c.vehiculo || 'Vehículo'} <span class="placa">${c.placa || ''}</span></h4>
                <p class="cliente"><i class="fas fa-user"></i> ${c.cliente_nombre || 'Cliente no registrado'}</p>
                <p class="entrega-total">Bs. ${c.total?.toFixed(2) || '0.00'}</p>
            </div>
            <div class="entrega-status">
                <span class="status-badge ${c.estado === 'aprobada' ? 'aprobada' : 'pendiente'}">
                    ${c.estado === 'aprobada' ? 'Aprobada' : 'Enviada'}
                </span>
            </div>
        </div>
    `).join('');
}

function renderizarVehiculosTaller(ordenes) {
    const container = document.getElementById('vehiculosTallerList');
    if (!container) return;
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const estadoColor = {
        'EnRecepcion': '#FF9800',
        'EnDiagnostico': '#2196F3',
        'EnProceso': '#4CAF50',
        'EnPausa': '#9E9E9E',
        'PendienteAprobacion': '#FF5722'
    };
    
    container.innerHTML = ordenes.map(orden => {
        let diasClass = 'normal';
        let diasTexto = '';
        
        if (orden.fecha_estimada_finalizacion) {
            const fechaFin = new Date(orden.fecha_estimada_finalizacion);
            const diffDays = Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                diasClass = 'atrasado';
                diasTexto = `Atrasado ${Math.abs(diffDays)}d`;
            } else if (diffDays === 0) {
                diasClass = 'urgente';
                diasTexto = 'Entrega hoy';
            } else if (diffDays <= 3) {
                diasClass = 'urgente';
                diasTexto = `${diffDays} días`;
            } else {
                diasTexto = `${diffDays} días`;
            }
        } else if (orden.dias_estimados_reparacion) {
            diasTexto = `${orden.dias_estimados_reparacion} días estimados`;
        }
        
        return `
            <div class="vehiculo-taller-item" onclick="verOrdenTrabajo(${orden.id_orden || orden.id})">
                <div class="vehiculo-taller-icon"><i class="fas fa-car-side"></i></div>
                <div class="vehiculo-taller-info">
                    <div class="vehiculo-taller-placa">${orden.vehiculo?.placa || orden.placa || 'Vehículo'}</div>
                    <div class="vehiculo-taller-modelo">${orden.vehiculo?.marca || ''} ${orden.vehiculo?.modelo || ''}</div>
                    <div class="vehiculo-taller-estado" style="color: ${estadoColor[orden.estado_global] || '#666'}">
                        <i class="fas fa-circle" style="font-size: 8px;"></i> ${orden.estado_global || 'En proceso'}
                    </div>
                </div>
                ${diasTexto ? `<div class="vehiculo-taller-dias ${diasClass}">${diasTexto}</div>` : ''}
            </div>
        `;
    }).join('');
}

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function formatearFecha(fecha) {
    if (!fecha) return 'Fecha no disponible';
    const d = new Date(fecha);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    toast.innerHTML = `<span><i class="fas ${tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${mensaje}</span>`;
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
        window.location.href = `/jefe_taller/diagnosticos.html?diagnostico_id=${id}`;
    }
};

window.verCotizacion = (id) => {
    if (id) {
        window.location.href = `/jefe_taller/cotizaciones.html?id=${id}`;
    }
};

window.verOrdenTrabajo = (id) => {
    if (id) {
        window.location.href = `/jefe_taller/orden_trabajo.html?id=${id}`;
    }
};

window.logout = () => {
    localStorage.clear();
    window.location.href = '/';
};