// =====================================================
// DASHBOARD JEFE DE TALLER - CON CALENDARIO DE DÍAS PINTADOS
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
// CALENDARIO CON DÍAS PINTADOS
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
        eventClick: (info) => {
            verDetalleEvento(info.event);
        },
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
        
        const reservasResponse = await fetch(`${API_URL}/cliente/reservas-confirmadas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const reservasData = await reservasResponse.json();
        
        const eventos = [];
        
        if (reservasData.reservas) {
            reservasData.reservas.forEach(reserva => {
                const fechaHora = new Date(reserva.fecha_agendada);
                eventos.push({
                    id: `reserva_${reserva.id}`,
                    title: `📅 ${reserva.vehiculo?.placa || 'Cita'}`,
                    start: fechaHora,
                    backgroundColor: '#10B981',
                    borderColor: '#10B981',
                    className: 'fc-event-reserva',
                    extendedProps: {
                        tipo: 'reserva',
                        placa: reserva.vehiculo?.placa,
                        cliente: reserva.cliente_nombre
                    }
                });
            });
        }
        
        successCallback(eventos);
        setTimeout(() => pintarDiasReparacion(), 150);
        
    } catch (error) {
        console.error('Error cargando eventos:', error);
        failureCallback(error);
    }
}

async function pintarDiasReparacion() {
    try {
        const token = localStorage.getItem('furia_token');
        
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-activas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
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
    if (props.tipo === 'reserva') {
        mostrarNotificacion(`Reserva: ${props.placa} - ${props.cliente || 'Cliente'}`, 'info');
    }
}

// =====================================================
// CARGAR DATOS DEL DASHBOARD
// =====================================================

async function loadDashboardData() {
    mostrarLoading(true);
    try {
        const token = localStorage.getItem('furia_token');
        
        // Usar el endpoint correcto para estadísticas
        const statsResponse = await fetch(`${API_URL}/jefe-taller/dashboard-stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const statsData = await statsResponse.json();
        
        // Actualizar KPIs con los datos correctos
        if (statsData.success && statsData.stats) {
            document.getElementById('ordenesActivas').textContent = statsData.stats.ordenes_activas || 0;
            document.getElementById('ordenesPausa').textContent = statsData.stats.ordenes_pausa || 0;
            document.getElementById('tecnicosActivos').textContent = statsData.stats.tecnicos_activos || 0;
            document.getElementById('bahiasOcupadas').textContent = statsData.stats.bahias_ocupadas || 0;
            document.getElementById('pendientesCount').textContent = statsData.stats.diagnosticos_pendientes || 0;
        }
        
        // Cargar el resto de datos en paralelo
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
        
        actualizarUI(bahias, diagnosticos, cotizaciones, ordenesActivas);
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        mostrarNotificacion('Error al cargar datos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function actualizarUI(bahias, diagnosticos, cotizaciones, ordenesActivas) {
    // Actualizar KPIs (ya se actualizaron desde dashboard-stats)
    
    const pendientesCount = diagnosticos?.diagnosticos?.length || 0;
    document.getElementById('pendientesCount').textContent = pendientesCount;
    
    // Actualizar bahías
    if (bahias && bahias.bahias) {
        renderizarBahias(bahias.bahias);
        
        // Calcular bahías ocupadas desde los datos recibidos
        const bahiasOcupadas = bahias.bahias.filter(b => b.estado === 'ocupada' || b.estado === 'reservada').length;
        document.getElementById('bahiasOcupadas').textContent = bahiasOcupadas;
    } else {
        renderizarBahiasEjemplo();
    }
    
    // Actualizar diagnósticos
    if (diagnosticos && diagnosticos.diagnosticos) {
        renderizarDiagnosticos(diagnosticos.diagnosticos);
    } else {
        renderizarDiagnosticosEjemplo();
    }
    
    // Actualizar cotizaciones
    if (cotizaciones && cotizaciones.cotizaciones) {
        renderizarEntregas(cotizaciones.cotizaciones);
    } else {
        renderizarEntregasEjemplo();
    }
    
    // Actualizar vehículos en taller
    if (ordenesActivas && ordenesActivas.ordenes) {
        renderizarVehiculosTaller(ordenesActivas.ordenes);
        document.getElementById('vehiculosTallerCount').textContent = ordenesActivas.ordenes.length;
    }
}


function renderizarBahias(bahias) {
    const container = document.getElementById('bahiasGrid');
    if (!container) return;
    
    const estadosTexto = { 'ocupada': 'Ocupada', 'pausa': 'En Pausa', 'libre': 'Libre' };
    
    container.innerHTML = bahias.map(b => `
        <div class="bahia-item ${b.estado}" onclick="verDetalleBahia(${b.numero})">
            <div class="bahia-numero">Bahía ${b.numero}</div>
            <div class="bahia-estado">${estadosTexto[b.estado] || b.estado}</div>
            ${b.tecnico ? `<div class="bahia-tecnico">${b.tecnico}</div>` : ''}
        </div>
    `).join('');
}

function renderizarBahiasEjemplo() {
    const bahias = [];
    for (let i = 1; i <= 12; i++) {
        const random = Math.random();
        let estado;
        if (random < 0.5) estado = 'ocupada';
        else if (random < 0.7) estado = 'pausa';
        else estado = 'libre';
        bahias.push({ numero: i, estado: estado, tecnico: estado !== 'libre' ? 'Técnico' : null });
    }
    renderizarBahias(bahias);
}

function renderizarDiagnosticos(diagnosticos) {
    const container = document.getElementById('diagnosticosList');
    if (!container) return;
    
    if (!diagnosticos || diagnosticos.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--gris-texto);"><i class="fas fa-check-circle"></i><p>No hay diagnósticos pendientes</p></div>`;
        return;
    }
    
    container.innerHTML = diagnosticos.map(d => `
        <div class="diagnostico-item">
            <div class="diagnostico-icon"><i class="fas fa-stethoscope"></i></div>
            <div class="diagnostico-content">
                <h4>${d.vehiculo || d.marca || 'Vehículo'} (${d.placa || 'Sin placa'})</h4>
                <p>${d.informe ? d.informe.substring(0, 80) : 'Sin informe'}${d.informe?.length > 80 ? '...' : ''}</p>
            </div>
            <div class="diagnostico-meta">
                <span class="diagnostico-tecnico">${d.tecnico_nombre || 'Sin técnico'}</span>
                <button class="btn-revisar" onclick="revisarDiagnostico(${d.diagnostico_id || d.id})">Revisar</button>
            </div>
        </div>
    `).join('');
}

function renderizarDiagnosticosEjemplo() {
    const ejemplos = [
        { diagnostico_id: 1, vehiculo: 'Toyota Corolla', placa: 'ABC123', tecnico_nombre: 'Luis M.', informe: 'Ruido en motor al acelerar' },
        { diagnostico_id: 2, vehiculo: 'Honda Civic', placa: 'XYZ789', tecnico_nombre: 'Carlos R.', informe: 'Vibración en frenos' }
    ];
    renderizarDiagnosticos(ejemplos);
}

function renderizarEntregas(cotizaciones) {
    const container = document.getElementById('entregasList');
    if (!container) return;
    
    if (!cotizaciones || cotizaciones.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--gris-texto);"><i class="fas fa-clock"></i><p>No hay entregas próximas</p></div>`;
        return;
    }
    
    container.innerHTML = cotizaciones.slice(0, 5).map(c => `
        <div class="entrega-item">
            <div class="entrega-icon"><i class="fas fa-file-invoice-dollar"></i></div>
            <div class="entrega-content">
                <h4>${c.vehiculo || 'Vehículo'} (${c.placa || 'Sin placa'})</h4>
                <p>Cliente: ${c.cliente_nombre || 'No registrado'}</p>
                <p class="entrega-total">Bs. ${c.total?.toFixed(2) || '0.00'}</p>
            </div>
            <div class="entrega-meta">
                <button class="btn-ver" onclick="verCotizacion(${c.id})">Ver</button>
            </div>
        </div>
    `).join('');
}

function renderizarEntregasEjemplo() {
    const ejemplos = [{ id: 1, vehiculo: 'Nissan Versa', placa: 'GHI789', cliente_nombre: 'Ana Flores', total: 1500 }];
    renderizarEntregas(ejemplos);
}

function renderizarVehiculosTaller(ordenes) {
    const container = document.getElementById('vehiculosTallerList');
    if (!container) return;
    
    if (!ordenes || ordenes.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--gris-texto);"><i class="fas fa-car"></i><p>No hay vehículos en taller</p></div>`;
        return;
    }
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
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
            diasTexto = `${orden.dias_estimados_reparacion} días`;
        }
        
        return `
            <div class="vehiculo-taller-item" onclick="verOrdenTrabajo(${orden.id_orden || orden.id})">
                <div class="vehiculo-taller-icon"><i class="fas fa-car-side"></i></div>
                <div class="vehiculo-taller-info">
                    <div class="vehiculo-taller-placa">${orden.vehiculo?.placa || orden.placa || 'Vehículo'}</div>
                    <div class="vehiculo-taller-modelo">${orden.vehiculo?.marca || ''} ${orden.vehiculo?.modelo || ''}</div>
                </div>
                ${diasTexto ? `<div class="vehiculo-taller-dias ${diasClass}">${diasTexto}</div>` : ''}
            </div>
        `;
    }).join('');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    toast.innerHTML = `<span>${mensaje}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function usarDatosEjemplo() {
    mostrarNotificacion('Usando datos de demostración', 'warning');
    renderizarBahiasEjemplo();
    renderizarDiagnosticosEjemplo();
    renderizarEntregasEjemplo();
}

// Funciones globales
window.verDetalleBahia = (numero) => mostrarNotificacion(`Bahía ${numero}`, 'info');
window.revisarDiagnostico = (id) => window.location.href = `diagnosticos.html?diagnostico_id=${id}`;
window.verCotizacion = (id) => window.location.href = `cotizaciones.html?id=${id}`;
window.verOrdenTrabajo = (id) => window.location.href = `orden_trabajo.html?id=${id}`;
window.logout = () => { localStorage.clear(); window.location.href = '/'; };