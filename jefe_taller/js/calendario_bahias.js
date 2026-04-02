// =====================================================
// CALENDARIO Y BAHÍAS - JEFE TALLER
// PLANIFICACIÓN OPERATIVA
// =====================================================

const API_URL = 'http://localhost:5000/api';
let userInfo = null;
let pollingInterval = null;

// Variables de estado
let fechaActual = new Date();
let vistaActual = 'semana'; // 'semana' o 'dia'
let ordenesPlanificadas = [];
let bahiasEstado = [];
let tecnicosCarga = [];
let eventosCalendario = [];

// Elementos DOM
const semanaGrid = document.getElementById('semanaGrid');
const rangoSemana = document.getElementById('rangoSemana');
const vistaSemana = document.getElementById('vistaSemana');
const vistaDia = document.getElementById('vistaDia');
const bahiasGrid = document.getElementById('bahiasGrid');
const tecnicosCargaLista = document.getElementById('tecnicosCargaLista');
const bahiasOcupadasSpan = document.getElementById('bahiasOcupadas');

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    await cargarDatosIniciales();
    await renderizarTodo();
    
    iniciarPolling();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    userInfo = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || (userInfo.rol !== 'jefe_taller' && userInfo.id_rol !== 3)) {
        window.location.href = '/';
        return false;
    }
    return true;
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
    document.getElementById('prevSemanaBtn')?.addEventListener('click', () => {
        fechaActual.setDate(fechaActual.getDate() - 7);
        renderizarTodo();
    });
    
    document.getElementById('nextSemanaBtn')?.addEventListener('click', () => {
        fechaActual.setDate(fechaActual.getDate() + 7);
        renderizarTodo();
    });
    
    document.getElementById('hoyBtn')?.addEventListener('click', () => {
        fechaActual = new Date();
        renderizarTodo();
    });
    
    document.querySelectorAll('.vista-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const vista = btn.dataset.vista;
            cambiarVista(vista);
        });
    });
    
    document.getElementById('refreshCargaBtn')?.addEventListener('click', async () => {
        await cargarDatosIniciales();
        renderizarTodo();
        mostrarNotificacion('Datos actualizados', 'success');
    });
    
    document.getElementById('refreshBahiasBtn')?.addEventListener('click', async () => {
        await cargarBahias();
        renderizarBahias();
        mostrarNotificacion('Bahías actualizadas', 'success');
    });
}

function cambiarVista(vista) {
    vistaActual = vista;
    
    document.querySelectorAll('.vista-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.vista === vista) {
            btn.classList.add('active');
        }
    });
    
    if (vista === 'semana') {
        vistaSemana.style.display = 'block';
        vistaDia.style.display = 'none';
        renderizarCalendarioSemana();
    } else {
        vistaSemana.style.display = 'none';
        vistaDia.style.display = 'block';
        renderizarCalendarioDia();
    }
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarDatosIniciales() {
    try {
        await Promise.all([
            cargarOrdenesPlanificadas(),
            cargarBahias(),
            cargarCargaTecnicos()
        ]);
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarNotificacion('Error cargando datos', 'error');
    }
}

async function cargarOrdenesPlanificadas() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-planificadas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (response.ok && data.ordenes) {
            ordenesPlanificadas = data.ordenes;
            generarEventosCalendario();
        }
    } catch (error) {
        console.error('Error cargando órdenes planificadas:', error);
        ordenesPlanificadas = [];
    }
}

async function cargarBahias() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/bahias`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (response.ok && data.bahias) {
            bahiasEstado = data.bahias;
            const ocupadas = bahiasEstado.filter(b => b.estado === 'ocupado').length;
            if (bahiasOcupadasSpan) {
                bahiasOcupadasSpan.textContent = `${ocupadas}/12 ocupadas`;
            }
        }
    } catch (error) {
        console.error('Error cargando bahías:', error);
        bahiasEstado = Array.from({ length: 12 }, (_, i) => ({
            numero: i + 1,
            estado: 'libre',
            orden_codigo: null,
            orden_estado: null
        }));
    }
}

async function cargarCargaTecnicos() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/tecnicos-carga`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (response.ok && data.tecnicos) {
            tecnicosCarga = data.tecnicos;
        }
    } catch (error) {
        console.error('Error cargando carga de técnicos:', error);
        tecnicosCarga = [];
    }
}

function generarEventosCalendario() {
    eventosCalendario = [];
    
    ordenesPlanificadas.forEach(orden => {
        if (orden.fecha_hora_inicio_estimado && orden.horas_estimadas) {
            const inicio = new Date(orden.fecha_hora_inicio_estimado);
            const fin = new Date(inicio.getTime() + (orden.horas_estimadas * 60 * 60 * 1000));
            
            eventosCalendario.push({
                id: orden.id,
                codigo: orden.codigo_unico,
                titulo: orden.codigo_unico,
                inicio: inicio,
                fin: fin,
                bahia: orden.bahia_asignada,
                tecnicos: orden.tecnicos || [],
                cliente: orden.cliente_nombre,
                vehiculo: `${orden.marca} ${orden.modelo} (${orden.placa})`
            });
        }
    });
}

// =====================================================
// RENDERIZADO PRINCIPAL
// =====================================================

async function renderizarTodo() {
    await cargarDatosIniciales();
    
    if (vistaActual === 'semana') {
        renderizarCalendarioSemana();
    } else {
        renderizarCalendarioDia();
    }
    
    renderizarBahias();
    renderizarCargaTecnicos();
}

function renderizarCalendarioSemana() {
    if (!semanaGrid) return;
    
    const dias = obtenerDiasSemana(fechaActual);
    const horas = obtenerHorasDia();
    
    // Actualizar rango de semana
    const inicioSemana = dias[0];
    const finSemana = dias[6];
    rangoSemana.textContent = `${inicioSemana.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${finSemana.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    
    // Construir grid
    let html = `
        <div class="hora-columna">
            <div class="dia-header"></div>
            ${horas.map(hora => `<div class="hora-fila">${hora}</div>`).join('')}
        </div>
    `;
    
    dias.forEach((dia, idx) => {
        const esHoy = dia.toDateString() === new Date().toDateString();
        
        html += `
            <div class="dia-columna">
                <div class="dia-header ${esHoy ? 'actual' : ''}">
                    <div class="dia-nombre">${dia.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase()}</div>
                    <div class="dia-fecha">${dia.getDate()}</div>
                </div>
        `;
        
        horas.forEach((hora, horaIdx) => {
            const horaNum = parseInt(hora.split(':')[0]);
            const fechaHora = new Date(dia);
            fechaHora.setHours(horaNum, 0, 0);
            
            // Buscar eventos en esta celda
            const eventosEnCelda = eventosCalendario.filter(evento => {
                const eventInicio = new Date(evento.inicio);
                return eventInicio.toDateString() === dia.toDateString() && 
                       eventInicio.getHours() === horaNum;
            });
            
            html += `
                <div class="celda-horaria" data-fecha="${fechaHora.toISOString()}" onclick="abrirModalAsignarOrden('${fechaHora.toISOString()}')">
                    ${eventosEnCelda.map(evento => `
                        <div class="evento-orden" onclick="event.stopPropagation(); verDetalleOrden(${evento.id})" style="top: 2px; left: 2px; right: 2px;">
                            <div class="evento-codigo">${escapeHtml(evento.codigo)}</div>
                            <div class="evento-hora">Bahía ${evento.bahia || '?'}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        });
        
        html += `</div>`;
    });
    
    semanaGrid.innerHTML = html;
}

function renderizarCalendarioDia() {
    const diaDetalle = document.getElementById('diaDetalle');
    if (!diaDetalle) return;
    
    const fecha = fechaActual;
    const horas = obtenerHorasDia();
    
    rangoSemana.textContent = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    let html = `<div class="dia-timeline">`;
    
    horas.forEach(hora => {
        const horaNum = parseInt(hora.split(':')[0]);
        const fechaHora = new Date(fecha);
        fechaHora.setHours(horaNum, 0, 0);
        
        const eventosEnHora = eventosCalendario.filter(evento => {
            const eventInicio = new Date(evento.inicio);
            return eventInicio.toDateString() === fecha.toDateString() && 
                   eventInicio.getHours() === horaNum;
        });
        
        html += `
            <div class="timeline-hora">
                <div class="timeline-hora-label">${hora}</div>
                <div class="timeline-hora-contenido">
                    ${eventosEnHora.map(evento => `
                        <div class="evento-orden" style="position: relative; margin-bottom: 0.5rem;" onclick="verDetalleOrden(${evento.id})">
                            <div class="evento-codigo">${escapeHtml(evento.codigo)}</div>
                            <div class="evento-hora">Bahía ${evento.bahia || '?'} | ${escapeHtml(evento.cliente || 'Sin cliente')}</div>
                        </div>
                    `).join('')}
                    ${eventosEnHora.length === 0 ? '<span class="text-small" style="color: var(--gris-texto);">Sin órdenes planificadas</span>' : ''}
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    diaDetalle.innerHTML = html;
}

function renderizarBahias() {
    if (!bahiasGrid) return;
    
    bahiasGrid.innerHTML = bahiasEstado.map(bahia => {
        let estadoClass = '';
        let estadoTexto = '';
        
        switch (bahia.estado) {
            case 'ocupado':
                estadoClass = 'ocupado';
                estadoTexto = 'Ocupado';
                break;
            case 'libre':
                estadoClass = 'libre';
                estadoTexto = 'Libre';
                break;
            case 'mantenimiento':
                estadoClass = 'mantenimiento';
                estadoTexto = 'Mantenimiento';
                break;
            default:
                estadoClass = 'libre';
                estadoTexto = 'Libre';
        }
        
        return `
            <div class="bahia-card ${bahia.estado}" onclick="verDetalleBahia(${bahia.numero})">
                <div class="bahia-numero">Bahía ${bahia.numero}</div>
                <div class="bahia-estado ${estadoClass}">${estadoTexto}</div>
                ${bahia.orden_codigo ? `<div class="bahia-orden">${escapeHtml(bahia.orden_codigo)}</div>` : ''}
            </div>
        `;
    }).join('');
}

function renderizarCargaTecnicos() {
    if (!tecnicosCargaLista) return;
    
    if (tecnicosCarga.length === 0) {
        tecnicosCargaLista.innerHTML = '<div class="empty-state"><p>No hay técnicos registrados</p></div>';
        return;
    }
    
    tecnicosCargaLista.innerHTML = tecnicosCarga.map(tecnico => {
        const porcentaje = (tecnico.ordenes_activas / tecnico.max_vehiculos) * 100;
        let cargaClass = '';
        let textoClass = '';
        
        if (porcentaje >= 100) {
            cargaClass = 'alto';
            textoClass = 'alto';
        } else if (porcentaje >= 50) {
            cargaClass = 'medio';
            textoClass = 'medio';
        } else {
            cargaClass = 'bajo';
            textoClass = 'bajo';
        }
        
        return `
            <div class="tecnico-carga-item">
                <div class="tecnico-info">
                    <div class="tecnico-nombre">${escapeHtml(tecnico.nombre)}</div>
                    <div class="tecnico-contacto"><i class="fas fa-phone"></i> ${escapeHtml(tecnico.contacto || 'Sin contacto')}</div>
                </div>
                <div class="carga-info">
                    <div class="carga-bar-container">
                        <div class="carga-bar ${cargaClass}" style="width: ${porcentaje}%"></div>
                    </div>
                    <div class="carga-texto ${textoClass}">
                        ${tecnico.ordenes_activas}/${tecnico.max_vehiculos}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function obtenerDiasSemana(fecha) {
    const dia = fecha.getDay();
    const diff = fecha.getDate() - dia + (dia === 0 ? -6 : 1);
    const lunes = new Date(fecha);
    lunes.setDate(diff);
    
    const dias = [];
    for (let i = 0; i < 7; i++) {
        const diaSemana = new Date(lunes);
        diaSemana.setDate(lunes.getDate() + i);
        dias.push(diaSemana);
    }
    return dias;
}

function obtenerHorasDia() {
    const horas = [];
    for (let i = 7; i <= 19; i++) {
        horas.push(`${i.toString().padStart(2, '0')}:00`);
    }
    return horas;
}

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        await cargarDatosIniciales();
        if (vistaActual === 'semana') {
            renderizarCalendarioSemana();
        } else {
            renderizarCalendarioDia();
        }
        renderizarBahias();
        renderizarCargaTecnicos();
    }, 30000);
}

// =====================================================
// MODALES Y ACCIONES
// =====================================================

async function verDetalleOrden(idOrden) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (!response.ok || !data.detalle) throw new Error(data.error || 'Error cargando detalle');
        
        const detalle = data.detalle;
        const modal = document.getElementById('modalDetalleOrdenCalendario');
        const body = document.getElementById('modalDetalleOrdenBody');
        
        body.innerHTML = `
            <div class="detalle-orden">
                <div class="detalle-seccion">
                    <h4><i class="fas fa-info-circle"></i> Información General</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Código</span>
                            <span class="detalle-value">${escapeHtml(detalle.codigo_unico)}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Estado</span>
                            <span class="detalle-value ${detalle.estado_global}">${escapeHtml(detalle.estado_global)}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Bahía</span>
                            <span class="detalle-value">${detalle.planificacion?.bahia_asignada || 'No asignada'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-car"></i> Vehículo</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Placa</span>
                            <span class="detalle-value">${escapeHtml(detalle.placa)}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Cliente</span>
                            <span class="detalle-value">${escapeHtml(detalle.cliente?.nombre || 'N/A')}</span>
                        </div>
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-users"></i> Técnicos Asignados</h4>
                    <div class="orden-tecnicos">
                        ${detalle.tecnicos && detalle.tecnicos.length > 0 ? 
                            detalle.tecnicos.map(t => `<span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>`).join('') :
                            '<span>Sin técnicos asignados</span>'}
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.add('show');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message || 'Error cargando detalle', 'error');
    }
}

function cerrarModalDetalleOrden() {
    const modal = document.getElementById('modalDetalleOrdenCalendario');
    if (modal) modal.classList.remove('show');
}

function verDetalleBahia(numero) {
    const bahia = bahiasEstado.find(b => b.numero === numero);
    const modal = document.getElementById('modalDetalleBahia');
    const body = document.getElementById('modalBahiaBody');
    
    let estadoTexto = '';
    switch (bahia?.estado) {
        case 'ocupado': estadoTexto = 'Ocupado'; break;
        case 'mantenimiento': estadoTexto = 'Mantenimiento'; break;
        default: estadoTexto = 'Libre';
    }
    
    body.innerHTML = `
        <div class="detalle-bahia">
            <div class="detalle-item">
                <span class="detalle-label">Bahía</span>
                <span class="detalle-value">Bahía ${numero}</span>
            </div>
            <div class="detalle-item">
                <span class="detalle-label">Estado</span>
                <span class="detalle-value ${bahia?.estado}">${estadoTexto}</span>
            </div>
            ${bahia?.orden_codigo ? `
                <div class="detalle-item">
                    <span class="detalle-label">Orden Actual</span>
                    <span class="detalle-value">${escapeHtml(bahia.orden_codigo)}</span>
                </div>
            ` : ''}
        </div>
    `;
    
    modal.classList.add('show');
}

function cerrarModalBahia() {
    const modal = document.getElementById('modalDetalleBahia');
    if (modal) modal.classList.remove('show');
}

function abrirModalAsignarOrden(fechaISO) {
    mostrarNotificacion('Para asignar una orden, ve a la pestaña "Órdenes de Trabajo" y edita la planificación', 'info');
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
window.verDetalleOrden = verDetalleOrden;
window.cerrarModalDetalleOrden = cerrarModalDetalleOrden;
window.verDetalleBahia = verDetalleBahia;
window.cerrarModalBahia = cerrarModalBahia;
window.abrirModalAsignarOrden = abrirModalAsignarOrden;