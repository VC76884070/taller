// =====================================================
// CALENDARIO Y BAHÍAS - JEFE TALLER
// CALENDARIO MENSUAL CON DETALLE POR DÍA Y ESTADO DE BAHÍAS
// =====================================================

const API_URL = '/api';
let userInfo = null;
let currentUserRoles = [];
let pollingInterval = null;

// Variables de estado
let fechaActual = new Date();
let ordenesPorDia = {};
let bahiasEstado = [];
let tecnicosCarga = [];
let statsGenerales = {
    total: 0,
    enProceso: 0,
    enPausa: 0,
    enRecepcion: 0,
    pendienteAprobacion: 0,
    finalizadas: 0,
    entregadas: 0
};
let diagnosticoStats = {
    pendiente: 0,
    aprobado: 0,
    rechazado: 0,
    borrador: 0
};

// Mapeo de estados a colores y texto
const ESTADOS_ORDEN = {
    'EnRecepcion': { texto: 'En Recepción', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
    'EnProceso': { texto: 'En Proceso', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
    'EnPausa': { texto: 'En Pausa', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
    'PendienteAprobacion': { texto: 'Pendiente Aprobación', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
    'Finalizado': { texto: 'Finalizado', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
    'Entregado': { texto: 'Entregado', color: '#059669', bg: 'rgba(5, 150, 105, 0.15)' }
};

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    await cargarTodosLosDatos();
    renderizarCalendario();
    renderizarBahias();
    
    iniciarPolling();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userInfo = payload.user;
        
        if (userInfo && userInfo.roles && Array.isArray(userInfo.roles)) {
            currentUserRoles = userInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (userInfo) userInfo.roles = currentUserRoles;
        }
        
        if (currentUserRoles.length === 0 && userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (userInfo) userInfo.roles = currentUserRoles;
        }
        
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller');
        
        if (!tieneRolJefeTaller) {
            console.warn('Usuario no tiene permisos de jefe_taller', currentUserRoles);
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return false;
        }
        
        console.log('✅ Autenticación exitosa - Roles:', currentUserRoles);
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
    
    const userNameElement = document.getElementById('userNombre');
    if (userNameElement && userInfo) {
        userNameElement.textContent = userInfo.nombre || 'Usuario';
    }
}

function setupEventListeners() {
    document.getElementById('prevMesBtn')?.addEventListener('click', () => {
        fechaActual.setMonth(fechaActual.getMonth() - 1);
        renderizarCalendario();
    });
    
    document.getElementById('nextMesBtn')?.addEventListener('click', () => {
        fechaActual.setMonth(fechaActual.getMonth() + 1);
        renderizarCalendario();
    });
    
    document.getElementById('hoyBtn')?.addEventListener('click', () => {
        fechaActual = new Date();
        renderizarCalendario();
    });
    
    document.getElementById('refreshBahiasBtn')?.addEventListener('click', async () => {
        await cargarBahias();
        renderizarBahias();
        mostrarNotificacion('Bahías actualizadas', 'success');
    });
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = btn.dataset.tab;
            cambiarPestana(tabId);
        });
    });
}

function logout() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = '/';
}

function cambiarPestana(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        }
    });
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `panel-${tabId}`) {
            panel.classList.add('active');
        }
    });
    
    if (tabId === 'bahias') {
        renderizarBahias();
    } else if (tabId === 'estadisticas') {
        renderizarEstadisticas();
    }
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarTodosLosDatos() {
    try {
        await Promise.all([
            cargarOrdenesConPlanificacion(),
            cargarBahias(),
            cargarEstadisticas(),
            cargarDiagnosticosStats()
        ]);
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarNotificacion('Error cargando datos', 'error');
    }
}

async function cargarOrdenesConPlanificacion() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-con-planificacion`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        const data = await response.json();
        if (response.ok && data.ordenes) {
            ordenesPorDia = {};
            
            data.ordenes.forEach(orden => {
                if (orden.fecha_hora_inicio_estimado) {
                    const fecha = new Date(orden.fecha_hora_inicio_estimado);
                    const fechaKey = fecha.toISOString().split('T')[0];
                    
                    if (!ordenesPorDia[fechaKey]) {
                        ordenesPorDia[fechaKey] = [];
                    }
                    
                    ordenesPorDia[fechaKey].push({
                        id: orden.id,
                        codigo_unico: orden.codigo_unico,
                        estado_global: orden.estado_global,
                        bahia_asignada: orden.bahia_asignada,
                        horas_estimadas: orden.horas_estimadas,
                        placa: orden.placa,
                        marca: orden.marca,
                        modelo: orden.modelo,
                        cliente_nombre: orden.cliente_nombre,
                        tecnicos: orden.tecnicos || [],
                        fecha_inicio: orden.fecha_hora_inicio_estimado,
                        fecha_inicio_real: orden.fecha_hora_inicio_real,
                        fecha_fin_real: orden.fecha_hora_fin_real,
                        bahia_ocupada: orden.bahia_ocupada
                    });
                }
            });
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        ordenesPorDia = {};
    }
}

async function cargarBahias() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/bahias`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        const data = await response.json();
        console.log('📊 Estado de bahías recibido:', data);
        
        if (response.ok && data.bahias) {
            bahiasEstado = data.bahias;
            const ocupadas = bahiasEstado.filter(b => b.estado === 'ocupado').length;
            const bahiasOcupadasSpan = document.getElementById('bahiasOcupadas');
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
            orden_estado: null,
            horas_estimadas: null,
            horas_transcurridas: null,
            fecha_inicio_real: null
        }));
    }
}

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/estadisticas-ordenes`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (response.ok) {
            statsGenerales = data;
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

async function cargarDiagnosticosStats() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/diagnosticos-stats`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (response.ok && data.stats) {
            diagnosticoStats = data.stats;
        }
    } catch (error) {
        console.error('Error cargando estadísticas de diagnósticos:', error);
    }
}

// =====================================================
// RENDERIZADO DEL CALENDARIO MENSUAL
// =====================================================

function renderizarCalendario() {
    const grid = document.getElementById('calendarioGrid');
    const mesTitulo = document.getElementById('mesActual');
    if (!grid) return;
    
    const año = fechaActual.getFullYear();
    const mes = fechaActual.getMonth();
    
    const nombreMes = fechaActual.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    if (mesTitulo) {
        mesTitulo.textContent = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
    }
    
    const primerDia = new Date(año, mes, 1);
    const ultimoDia = new Date(año, mes + 1, 0);
    
    let diaInicioSemana = primerDia.getDay();
    diaInicioSemana = diaInicioSemana === 0 ? 6 : diaInicioSemana - 1;
    
    const totalDias = ultimoDia.getDate();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    let html = '';
    
    for (let i = 0; i < diaInicioSemana; i++) {
        html += `<div class="celda-dia vacio"></div>`;
    }
    
    for (let dia = 1; dia <= totalDias; dia++) {
        const fechaDia = new Date(año, mes, dia);
        const fechaKey = fechaDia.toISOString().split('T')[0];
        const ordenesDelDia = ordenesPorDia[fechaKey] || [];
        const esHoy = fechaDia.toDateString() === hoy.toDateString();
        
        const estados = {
            EnProceso: 0,
            EnPausa: 0,
            EnRecepcion: 0,
            PendienteAprobacion: 0,
            Finalizado: 0,
            Entregado: 0
        };
        
        ordenesDelDia.forEach(orden => {
            if (estados[orden.estado_global] !== undefined) {
                estados[orden.estado_global]++;
            }
        });
        
        html += `
            <div class="celda-dia ${esHoy ? 'hoy' : ''} ${ordenesDelDia.length > 0 ? 'con-ordenes' : ''}" 
                 onclick="abrirDetalleDia('${fechaKey}', ${dia}, ${mes + 1}, ${año})">
                <div class="dia-numero">${dia}</div>
                <div class="dia-eventos">
                    ${ordenesDelDia.slice(0, 2).map(orden => `
                        <div class="evento-mini ${orden.estado_global}" title="${orden.codigo_unico} - ${ESTADOS_ORDEN[orden.estado_global]?.texto || orden.estado_global}">
                            ${orden.codigo_unico.substring(0, 12)}...
                        </div>
                    `).join('')}
                    ${ordenesDelDia.length > 2 ? `<div class="evento-mas">+${ordenesDelDia.length - 2} más</div>` : ''}
                </div>
                ${ordenesDelDia.length > 0 ? `
                    <div class="dia-resumen">
                        ${estados.EnProceso > 0 ? `<span class="resumen-badge proceso" title="En Proceso"><i class="fas fa-tools"></i> ${estados.EnProceso}</span>` : ''}
                        ${estados.EnPausa > 0 ? `<span class="resumen-badge pausa" title="En Pausa"><i class="fas fa-pause"></i> ${estados.EnPausa}</span>` : ''}
                        ${estados.Finalizado > 0 ? `<span class="resumen-badge finalizado" title="Finalizado"><i class="fas fa-check"></i> ${estados.Finalizado}</span>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    const celdasTotales = diaInicioSemana + totalDias;
    const celdasFaltantes = 42 - celdasTotales;
    for (let i = 0; i < celdasFaltantes; i++) {
        html += `<div class="celda-dia vacio"></div>`;
    }
    
    grid.innerHTML = html;
}

// =====================================================
// RENDERIZADO DE BAHÍAS
// =====================================================

function renderizarBahias() {
    const grid = document.getElementById('bahiasGrid');
    if (!grid) return;
    
    if (!bahiasEstado || bahiasEstado.length === 0) {
        grid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando estado de bahías...</p></div>';
        return;
    }
    
    grid.innerHTML = bahiasEstado.map(bahia => {
        let estadoClass = '';
        let estadoTexto = '';
        let bgColor = '';
        let infoAdicional = '';
        let tiempoInfo = '';
        
        switch (bahia.estado) {
            case 'ocupado':
                estadoClass = 'ocupado';
                estadoTexto = 'Ocupado';
                bgColor = 'rgba(239, 68, 68, 0.15)';
                
                if (bahia.horas_estimadas && bahia.horas_transcurridas) {
                    const porcentaje = Math.min(100, Math.round((bahia.horas_transcurridas / bahia.horas_estimadas) * 100));
                    infoAdicional = `
                        <div class="bahia-progreso">
                            <div class="progreso-bar">
                                <div class="progreso-fill" style="width: ${porcentaje}%"></div>
                            </div>
                            <span class="progreso-texto">${bahia.horas_transcurridas}/${bahia.horas_estimadas}h (${porcentaje}%)</span>
                        </div>
                    `;
                }
                
                if (bahia.horas_transcurridas) {
                    tiempoInfo = `<div class="bahia-tiempo">⏱️ ${bahia.horas_transcurridas} horas</div>`;
                }
                break;
            case 'reservado':
                estadoClass = 'reservado';
                estadoTexto = 'Reservado';
                bgColor = 'rgba(245, 158, 11, 0.15)';
                if (bahia.fecha_inicio_estimado) {
                    const fechaEst = new Date(bahia.fecha_inicio_estimado);
                    infoAdicional = `<div class="bahia-info">📅 ${fechaEst.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>`;
                }
                break;
            default:
                estadoClass = 'libre';
                estadoTexto = 'Libre';
                bgColor = 'rgba(16, 185, 129, 0.15)';
        }
        
        return `
            <div class="bahia-card ${bahia.estado}" onclick="verDetalleBahia(${bahia.numero})">
                <div class="bahia-numero">Bahía ${bahia.numero}</div>
                <div class="bahia-estado ${estadoClass}" style="background: ${bgColor}">
                    <i class="fas ${bahia.estado === 'ocupado' ? 'fa-wrench' : (bahia.estado === 'reservado' ? 'fa-clock' : 'fa-check-circle')}"></i>
                    ${estadoTexto}
                </div>
                ${bahia.orden_codigo ? `<div class="bahia-orden">📋 ${escapeHtml(bahia.orden_codigo)}</div>` : ''}
                ${tiempoInfo}
                ${infoAdicional}
                ${bahia.orden_estado ? `<div class="bahia-orden-estado">${escapeHtml(bahia.orden_estado)}</div>` : ''}
            </div>
        `;
    }).join('');
}

// =====================================================
// MODAL DE DETALLE DEL DÍA
// =====================================================

async function abrirDetalleDia(fechaKey, dia, mes, año) {
    const modal = document.getElementById('modalDetalleDia');
    const titulo = document.getElementById('modalDiaTitulo');
    const body = document.getElementById('modalDiaBody');
    
    const fecha = new Date(año, mes - 1, dia);
    const nombreDia = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (titulo) titulo.innerHTML = `<i class="fas fa-calendar-day"></i> Órdenes del ${nombreDia}`;
    
    const ordenes = ordenesPorDia[fechaKey] || [];
    
    if (body) {
        if (ordenes.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-check"></i>
                    <p>No hay órdenes programadas para este día</p>
                </div>
            `;
        } else {
            body.innerHTML = `
                <div class="ordenes-dia-lista">
                    ${ordenes.map(orden => `
                        <div class="orden-dia-card" onclick="verDetalleOrden(${orden.id})">
                            <div class="orden-card-header">
                                <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                                <span class="orden-estado ${orden.estado_global}" style="background: ${ESTADOS_ORDEN[orden.estado_global]?.bg}; color: ${ESTADOS_ORDEN[orden.estado_global]?.color}">
                                    <i class="fas ${getEstadoIcono(orden.estado_global)}"></i>
                                    ${ESTADOS_ORDEN[orden.estado_global]?.texto || orden.estado_global}
                                </span>
                            </div>
                            <div class="orden-card-body">
                                <div class="orden-info">
                                    <i class="fas fa-car"></i>
                                    <span>${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')} (${escapeHtml(orden.placa || 'N/A')})</span>
                                </div>
                                <div class="orden-info">
                                    <i class="fas fa-user"></i>
                                    <span>${escapeHtml(orden.cliente_nombre || 'N/A')}</span>
                                </div>
                                <div class="orden-info">
                                    <i class="fas fa-warehouse"></i>
                                    <span>Bahía ${orden.bahia_asignada || 'No asignada'}</span>
                                </div>
                                <div class="orden-info">
                                    <i class="fas fa-clock"></i>
                                    <span>${orden.fecha_inicio ? new Date(orden.fecha_inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'N/A'} - ${orden.horas_estimadas || '?'} horas estimadas</span>
                                </div>
                                ${orden.fecha_inicio_real ? `
                                    <div class="orden-info">
                                        <i class="fas fa-play-circle"></i>
                                        <span>Inicio real: ${new Date(orden.fecha_inicio_real).toLocaleString()}</span>
                                    </div>
                                ` : ''}
                                <div class="orden-info">
                                    <i class="fas fa-users"></i>
                                    <span>Técnicos: ${orden.tecnicos?.map(t => t.nombre).join(', ') || 'Sin asignar'}</span>
                                </div>
                            </div>
                            <div class="orden-card-footer">
                                <button class="btn-ver-detalle" onclick="event.stopPropagation(); verDetalleOrden(${orden.id})">
                                    <i class="fas fa-eye"></i> Ver detalle completo
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }
    
    if (modal) modal.classList.add('show');
}

function cerrarModalDetalleDia() {
    const modal = document.getElementById('modalDetalleDia');
    if (modal) modal.classList.remove('show');
}

function getEstadoIcono(estado) {
    const iconos = {
        'EnRecepcion': 'fa-clipboard-list',
        'EnProceso': 'fa-tools',
        'EnPausa': 'fa-pause-circle',
        'PendienteAprobacion': 'fa-hourglass-half',
        'Finalizado': 'fa-check-circle',
        'Entregado': 'fa-check-double'
    };
    return iconos[estado] || 'fa-question-circle';
}

// =====================================================
// DETALLE DE BAHÍA
// =====================================================

function verDetalleBahia(numero) {
    const bahia = bahiasEstado.find(b => b.numero === numero);
    const modal = document.getElementById('modalDetalleBahia');
    const body = document.getElementById('modalBahiaBody');
    
    let estadoTexto = '';
    let tiempoInfo = '';
    
    switch (bahia?.estado) {
        case 'ocupado': 
            estadoTexto = 'Ocupado';
            if (bahia.horas_estimadas && bahia.horas_transcurridas) {
                const porcentaje = Math.min(100, Math.round((bahia.horas_transcurridas / bahia.horas_estimadas) * 100));
                tiempoInfo = `
                    <div class="detalle-item">
                        <span class="detalle-label">Progreso</span>
                        <span class="detalle-value">
                            ${bahia.horas_transcurridas} / ${bahia.horas_estimadas} horas (${porcentaje}%)
                        </span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Inicio Real</span>
                        <span class="detalle-value">${bahia.fecha_inicio_real ? new Date(bahia.fecha_inicio_real).toLocaleString() : 'N/A'}</span>
                    </div>
                `;
            }
            break;
        case 'reservado': 
            estadoTexto = 'Reservado';
            if (bahia.fecha_inicio_estimado) {
                tiempoInfo = `
                    <div class="detalle-item">
                        <span class="detalle-label">Inicio Estimado</span>
                        <span class="detalle-value">${new Date(bahia.fecha_inicio_estimado).toLocaleString()}</span>
                    </div>
                `;
            }
            break;
        default: 
            estadoTexto = 'Libre';
    }
    
    if (body) {
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
                ${tiempoInfo}
                ${bahia?.orden_codigo ? `
                    <div class="detalle-item">
                        <span class="detalle-label">Orden Actual</span>
                        <span class="detalle-value">${escapeHtml(bahia.orden_codigo)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Estado Orden</span>
                        <span class="detalle-value">${escapeHtml(bahia.orden_estado || 'Desconocido')}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    if (modal) modal.classList.add('show');
}

function cerrarModalBahia() {
    const modal = document.getElementById('modalDetalleBahia');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// DETALLE DE ORDEN
// =====================================================

// =====================================================
// DETALLE DE ORDEN - VERSIÓN MEJORADA CON SECCIONES
// =====================================================

async function verDetalleOrden(idOrden) {
    try {
        mostrarNotificacion('Cargando detalles...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        const data = await response.json();
        if (!response.ok || !data.detalle) throw new Error(data.error || 'Error cargando detalle');
        
        const detalle = data.detalle;
        const modal = document.getElementById('modalDetalleOrden');
        const body = document.getElementById('modalDetalleOrdenBody');
        
        if (body) {
            // Formatear fechas
            const formatFecha = (fechaStr) => {
                if (!fechaStr) return 'No registrado';
                try {
                    return new Date(fechaStr).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } catch (e) {
                    return fechaStr;
                }
            };
            
            // Calcular tiempo transcurrido si está en proceso
            let tiempoInfo = '';
            let porcentajeProgreso = null;
            
            if (detalle.planificacion?.fecha_hora_inicio_real && !detalle.planificacion?.fecha_hora_fin_real) {
                const inicioReal = new Date(detalle.planificacion.fecha_hora_inicio_real);
                const ahora = new Date();
                const diffMs = ahora - inicioReal;
                const horas = Math.floor(diffMs / 3600000);
                const minutos = Math.floor((diffMs % 3600000) / 60000);
                
                tiempoInfo = `
                    <div class="detalle-tiempo-transcurrido">
                        <i class="fas fa-hourglass-half"></i>
                        <span>Tiempo transcurrido: <strong>${horas}h ${minutos}m</strong></span>
                    </div>
                `;
                
                if (detalle.planificacion?.horas_estimadas) {
                    const horasEstimadas = parseFloat(detalle.planificacion.horas_estimadas);
                    const horasTranscurridas = horas + (minutos / 60);
                    porcentajeProgreso = Math.min(100, Math.round((horasTranscurridas / horasEstimadas) * 100));
                }
            }
            
            // Estado de la orden con color
            const estadoOrden = detalle.estado_global;
            const estadoConfig = ESTADOS_ORDEN[estadoOrden] || { texto: estadoOrden, color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' };
            
            // Construir HTML del detalle
            const detalleHtml = `
                <div class="detalle-orden-completo">
                    <!-- CABECERA CON ESTADO -->
                    <div class="detalle-header">
                        <div class="detalle-titulo">
                            <i class="fas fa-clipboard-list"></i>
                            <h3>Orden de Trabajo</h3>
                        </div>
                        <div class="detalle-estado" style="background: ${estadoConfig.bg}; color: ${estadoConfig.color};">
                            <i class="fas ${getEstadoIcono(estadoOrden)}"></i>
                            ${estadoConfig.texto}
                        </div>
                    </div>
                    
                    <!-- SECCIÓN INFORMACIÓN GENERAL -->
                    <div class="detalle-seccion">
                        <div class="seccion-titulo">
                            <i class="fas fa-info-circle"></i>
                            <h4>Información General</h4>
                        </div>
                        <div class="detalle-grid-2cols">
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-qrcode"></i> Código:</span>
                                <span class="campo-valor">${escapeHtml(detalle.codigo_unico)}</span>
                            </div>
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-calendar-alt"></i> Fecha Ingreso:</span>
                                <span class="campo-valor">${formatFecha(detalle.fecha_ingreso)}</span>
                            </div>
                            ${detalle.fecha_salida ? `
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-flag-checkered"></i> Fecha Salida:</span>
                                <span class="campo-valor">${formatFecha(detalle.fecha_salida)}</span>
                            </div>
                            ` : ''}
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-road"></i> Kilometraje:</span>
                                <span class="campo-valor">${detalle.kilometraje ? parseInt(detalle.kilometraje).toLocaleString() + ' km' : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- SECCIÓN VEHÍCULO -->
                    <div class="detalle-seccion">
                        <div class="seccion-titulo">
                            <i class="fas fa-car"></i>
                            <h4>Datos del Vehículo</h4>
                        </div>
                        <div class="detalle-grid-2cols">
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-grip-lines"></i> Placa:</span>
                                <span class="campo-valor">${escapeHtml(detalle.placa || 'No registrada')}</span>
                            </div>
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-car-side"></i> Marca/Modelo:</span>
                                <span class="campo-valor">${escapeHtml(detalle.marca || '')} ${escapeHtml(detalle.modelo || '')}</span>
                            </div>
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-calendar"></i> Año:</span>
                                <span class="campo-valor">${detalle.anio || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- SECCIÓN CLIENTE -->
                    <div class="detalle-seccion">
                        <div class="seccion-titulo">
                            <i class="fas fa-user-circle"></i>
                            <h4>Datos del Cliente</h4>
                        </div>
                        <div class="detalle-grid-2cols">
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-user"></i> Nombre:</span>
                                <span class="campo-valor">${escapeHtml(detalle.cliente?.nombre || 'No registrado')}</span>
                            </div>
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-phone"></i> Teléfono:</span>
                                <span class="campo-valor">${escapeHtml(detalle.cliente?.telefono || 'No registrado')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- SECCIÓN PLANIFICACIÓN Y TIEMPOS -->
                    <div class="detalle-seccion">
                        <div class="seccion-titulo">
                            <i class="fas fa-calendar-week"></i>
                            <h4>Planificación y Tiempos</h4>
                        </div>
                        <div class="detalle-grid-2cols">
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-warehouse"></i> Bahía:</span>
                                <span class="campo-valor">${detalle.planificacion?.bahia_asignada ? `Bahía ${detalle.planificacion.bahia_asignada}` : 'No asignada'}</span>
                            </div>
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-clock"></i> Horas Estimadas:</span>
                                <span class="campo-valor">${detalle.planificacion?.horas_estimadas || 'N/A'} horas</span>
                            </div>
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-play-circle"></i> Inicio Estimado:</span>
                                <span class="campo-valor">${formatFecha(detalle.planificacion?.fecha_hora_inicio_estimado)}</span>
                            </div>
                            <div class="detalle-campo">
                                <span class="campo-etiqueta"><i class="fas fa-stop-circle"></i> Fin Estimado:</span>
                                <span class="campo-valor">${formatFecha(detalle.planificacion?.fecha_hora_fin_estimado)}</span>
                            </div>
                        </div>
                        
                        ${detalle.planificacion?.fecha_hora_inicio_real ? `
                        <div class="detalle-subseccion">
                            <div class="subseccion-titulo">
                                <i class="fas fa-chart-line"></i>
                                <span>Ejecución Real</span>
                            </div>
                            <div class="detalle-grid-2cols">
                                <div class="detalle-campo">
                                    <span class="campo-etiqueta"><i class="fas fa-play"></i> Inicio Real:</span>
                                    <span class="campo-valor">${formatFecha(detalle.planificacion.fecha_hora_inicio_real)}</span>
                                </div>
                                ${detalle.planificacion?.fecha_hora_fin_real ? `
                                <div class="detalle-campo">
                                    <span class="campo-etiqueta"><i class="fas fa-stop"></i> Fin Real:</span>
                                    <span class="campo-valor">${formatFecha(detalle.planificacion.fecha_hora_fin_real)}</span>
                                </div>
                                ` : ''}
                            </div>
                            ${tiempoInfo}
                            ${porcentajeProgreso !== null ? `
                            <div class="detalle-progreso">
                                <div class="progreso-label">
                                    <span>Progreso de reparación</span>
                                    <span>${porcentajeProgreso}%</span>
                                </div>
                                <div class="progreso-bar-container">
                                    <div class="progreso-bar-fill" style="width: ${porcentajeProgreso}%"></div>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                    </div>
                    
                    <!-- SECCIÓN TÉCNICOS ASIGNADOS -->
                    <div class="detalle-seccion">
                        <div class="seccion-titulo">
                            <i class="fas fa-users"></i>
                            <h4>Técnicos Asignados</h4>
                        </div>
                        <div class="tecnicos-lista">
                            ${detalle.tecnicos && detalle.tecnicos.length > 0 ? 
                                detalle.tecnicos.map(t => `
                                    <div class="tecnico-item">
                                        <i class="fas fa-user-cog"></i>
                                        <span>${escapeHtml(t.nombre)}</span>
                                        <span class="tecnico-tipo ${t.tipo === 'diagnostico' ? 'diagnostico' : 'reparacion'}">
                                            ${t.tipo === 'diagnostico' ? 'Diagnóstico' : 'Reparación'}
                                        </span>
                                    </div>
                                `).join('') :
                                '<div class="sin-datos"><i class="fas fa-user-slash"></i> Sin técnicos asignados</div>'}
                        </div>
                    </div>
                    
                    <!-- SECCIÓN DIAGNÓSTICO INICIAL -->
                    ${detalle.diagnostico_inicial ? `
                    <div class="detalle-seccion">
                        <div class="seccion-titulo">
                            <i class="fas fa-stethoscope"></i>
                            <h4>Diagnóstico Inicial</h4>
                        </div>
                        <div class="diagnostico-contenido">
                            <i class="fas fa-quote-left"></i>
                            <p>${escapeHtml(detalle.diagnostico_inicial)}</p>
                        </div>
                    </div>
                    ` : ''}
                    
                    <!-- SECCIÓN SERVICIOS -->
                    ${detalle.servicios && detalle.servicios.length > 0 ? `
                    <div class="detalle-seccion">
                        <div class="seccion-titulo">
                            <i class="fas fa-dollar-sign"></i>
                            <h4>Servicios Cotizados</h4>
                        </div>
                        <div class="servicios-lista">
                            ${detalle.servicios.map(s => `
                                <div class="servicio-item">
                                    <span class="servicio-nombre">${escapeHtml(s.descripcion)}</span>
                                    <span class="servicio-precio">Bs. ${s.precio?.toFixed(2) || '0.00'}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
            
            body.innerHTML = detalleHtml;
        }
        
        if (modal) modal.classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message || 'Error cargando detalle', 'error');
    }
}

function cerrarModalDetalleOrden() {
    const modal = document.getElementById('modalDetalleOrden');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// RENDERIZADO DE ESTADÍSTICAS
// =====================================================

function renderizarEstadisticas() {
    const totalElement = document.getElementById('totalOrdenes');
    const enProcesoElement = document.getElementById('enProcesoCount');
    const enPausaElement = document.getElementById('enPausaCount');
    const enRecepcionElement = document.getElementById('enRecepcionCount');
    const pendienteAprobacionElement = document.getElementById('pendienteAprobacionCount');
    const finalizadasElement = document.getElementById('finalizadasCount');
    const entregadasElement = document.getElementById('entregadasCount');
    
    if (totalElement) totalElement.textContent = statsGenerales.total || 0;
    if (enProcesoElement) enProcesoElement.textContent = statsGenerales.enProceso || 0;
    if (enPausaElement) enPausaElement.textContent = statsGenerales.enPausa || 0;
    if (enRecepcionElement) enRecepcionElement.textContent = statsGenerales.enRecepcion || 0;
    if (pendienteAprobacionElement) pendienteAprobacionElement.textContent = statsGenerales.pendienteAprobacion || 0;
    if (finalizadasElement) finalizadasElement.textContent = statsGenerales.finalizadas || 0;
    if (entregadasElement) entregadasElement.textContent = statsGenerales.entregadas || 0;
    
    const diagPendientes = document.getElementById('diagPendientes');
    const diagAprobados = document.getElementById('diagAprobados');
    const diagRechazados = document.getElementById('diagRechazados');
    
    if (diagPendientes) diagPendientes.textContent = diagnosticoStats.pendiente || 0;
    if (diagAprobados) diagAprobados.textContent = diagnosticoStats.aprobado || 0;
    if (diagRechazados) diagRechazados.textContent = diagnosticoStats.rechazado || 0;
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        if (document.visibilityState === 'visible') {
            console.log('🔄 Polling: Actualizando datos...');
            await cargarOrdenesConPlanificacion();
            await cargarBahias();
            renderizarCalendario();
            renderizarBahias();
        }
    }, 10000);
}

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
window.abrirDetalleDia = abrirDetalleDia;
window.cerrarModalDetalleDia = cerrarModalDetalleDia;
window.logout = logout;