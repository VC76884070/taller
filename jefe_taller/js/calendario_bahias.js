// =====================================================
// CALENDARIO Y BAHÍAS - JEFE TALLER (CORREGIDO)
// CALENDARIO MENSUAL CON DETALLE POR DÍA
// =====================================================

const API_URL = 'http://localhost:5000/api';
let userInfo = null;
let currentUserRoles = [];
let pollingInterval = null;

// Variables de estado
let fechaActual = new Date();
let ordenesPorDia = {};  // { "YYYY-MM-DD": [ordenes] }
let bahiasEstado = [];
let tecnicosCarga = [];
let statsGenerales = {
    total: 0,
    enProceso: 0,
    enPausa: 0,
    finalizadas: 0
};
let diagnosticoStats = {
    pendiente: 0,
    aprobado: 0,
    rechazado: 0
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

const ESTADOS_DIAGNOSTICO = {
    'borrador': { texto: 'Borrador', color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' },
    'pendiente': { texto: 'Pendiente', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
    'aprobado': { texto: 'Aprobado', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
    'rechazado': { texto: 'Rechazado', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' }
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
        // Decodificar token para obtener información del usuario
        const payload = JSON.parse(atob(token.split('.')[1]));
        userInfo = payload.user;
        
        // Obtener roles del usuario
        if (userInfo && userInfo.roles && Array.isArray(userInfo.roles)) {
            currentUserRoles = userInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (userInfo) userInfo.roles = currentUserRoles;
        }
        
        // Si no hay roles en el token, intentar obtener de userData
        if (currentUserRoles.length === 0 && userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (userInfo) userInfo.roles = currentUserRoles;
        }
        
        // Verificar si tiene rol de jefe_taller (usando el nuevo sistema)
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller') || 
                                    (userInfo && userInfo.rol_principal === 'jefe_taller') ||
                                    (userInfo && userInfo.rol === 'jefe_taller');
        
        // Compatibilidad con sistema antiguo (por si acaso)
        const tieneIdRolAntiguo = userInfo && (userInfo.id_rol === 2 || userInfo.id_rol === 3);
        
        if (!tieneRolJefeTaller && !tieneIdRolAntiguo) {
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
    
    // Mostrar nombre de usuario
    const userNameElement = document.getElementById('userNombre');
    if (userNameElement && userInfo) {
        userNameElement.textContent = userInfo.nombre || 'Usuario';
    }
    
    // Mostrar badge de roles si tiene múltiples
    if (currentUserRoles.length > 1) {
        const userContainer = document.querySelector('.user-info');
        if (userContainer && !document.querySelector('.user-roles-badge')) {
            const rolesBadge = document.createElement('span');
            rolesBadge.className = 'user-roles-badge';
            rolesBadge.style.cssText = `
                font-size: 0.7rem;
                background: var(--gris-200);
                padding: 0.2rem 0.5rem;
                border-radius: 12px;
                margin-left: 0.5rem;
            `;
            const nombresRoles = currentUserRoles.map(r => {
                const nombres = {
                    'jefe_taller': 'Jefe Taller',
                    'jefe_operativo': 'Jefe Operativo',
                    'tecnico': 'Técnico',
                    'encargado_repuestos': 'Repuestos'
                };
                return nombres[r] || r;
            }).join(', ');
            rolesBadge.textContent = nombresRoles;
            const userNameSpan = document.getElementById('userNombre');
            if (userNameSpan && userNameSpan.parentElement) {
                userNameSpan.parentElement.appendChild(rolesBadge);
            }
        }
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
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // Cambio de pestaña
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
            cargarCargaTecnicos(),
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
                        fecha_inicio: orden.fecha_hora_inicio_estimado
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
            orden_codigo: null
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
    
    // Actualizar título
    const nombreMes = fechaActual.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    if (mesTitulo) {
        mesTitulo.textContent = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
    }
    
    // Primer día del mes y último día
    const primerDia = new Date(año, mes, 1);
    const ultimoDia = new Date(año, mes + 1, 0);
    
    // Día de la semana del primer día (0 = domingo, ajustar a lunes = 0)
    let diaInicioSemana = primerDia.getDay();
    diaInicioSemana = diaInicioSemana === 0 ? 6 : diaInicioSemana - 1;
    
    const totalDias = ultimoDia.getDate();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    let html = '';
    
    // Días vacíos al inicio
    for (let i = 0; i < diaInicioSemana; i++) {
        html += `<div class="celda-dia vacio"></div>`;
    }
    
    // Días del mes
    for (let dia = 1; dia <= totalDias; dia++) {
        const fechaDia = new Date(año, mes, dia);
        const fechaKey = fechaDia.toISOString().split('T')[0];
        const ordenesDelDia = ordenesPorDia[fechaKey] || [];
        const esHoy = fechaDia.toDateString() === hoy.toDateString();
        
        // Contar órdenes por estado
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
                    ${ordenesDelDia.slice(0, 3).map(orden => `
                        <div class="evento-mini ${orden.estado_global}" title="${orden.codigo_unico} - ${ESTADOS_ORDEN[orden.estado_global]?.texto || orden.estado_global}">
                            ${orden.codigo_unico}
                        </div>
                    `).join('')}
                    ${ordenesDelDia.length > 3 ? `<div class="evento-mas">+${ordenesDelDia.length - 3} más</div>` : ''}
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
    
    // Completar grid (6 filas x 7 columnas = 42 celdas)
    const celdasTotales = diaInicioSemana + totalDias;
    const celdasFaltantes = 42 - celdasTotales;
    for (let i = 0; i < celdasFaltantes; i++) {
        html += `<div class="celda-dia vacio"></div>`;
    }
    
    grid.innerHTML = html;
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
                                    <span>${new Date(orden.fecha_inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - ${orden.horas_estimadas || '?'} horas estimadas</span>
                                </div>
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
// RENDERIZADO DE BAHÍAS
// =====================================================

function renderizarBahias() {
    const grid = document.getElementById('bahiasGrid');
    if (!grid) return;
    
    grid.innerHTML = bahiasEstado.map(bahia => {
        let estadoClass = '';
        let estadoTexto = '';
        let bgColor = '';
        
        switch (bahia.estado) {
            case 'ocupado':
                estadoClass = 'ocupado';
                estadoTexto = 'Ocupado';
                bgColor = 'rgba(239, 68, 68, 0.15)';
                break;
            case 'mantenimiento':
                estadoClass = 'mantenimiento';
                estadoTexto = 'Mantenimiento';
                bgColor = 'rgba(245, 158, 11, 0.15)';
                break;
            default:
                estadoClass = 'libre';
                estadoTexto = 'Libre';
                bgColor = 'rgba(16, 185, 129, 0.15)';
        }
        
        return `
            <div class="bahia-card ${bahia.estado}" onclick="verDetalleBahia(${bahia.numero})">
                <div class="bahia-numero">Bahía ${bahia.numero}</div>
                <div class="bahia-estado ${estadoClass}" style="background: ${bgColor}">${estadoTexto}</div>
                ${bahia.orden_codigo ? `<div class="bahia-orden">${escapeHtml(bahia.orden_codigo)}</div>` : ''}
                ${bahia.orden_estado ? `<div class="bahia-orden-estado">${escapeHtml(bahia.orden_estado)}</div>` : ''}
            </div>
        `;
    }).join('');
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
                ${bahia?.orden_codigo ? `
                    <div class="detalle-item">
                        <span class="detalle-label">Orden Actual</span>
                        <span class="detalle-value">${escapeHtml(bahia.orden_codigo)}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Estado Orden</span>
                        <span class="detalle-value">${escapeHtml(bahia.orden_estado || 'Desconocido')}</span>
                    </div>
                ` : bahia?.estado === 'mantenimiento' ? `
                    <div class="detalle-item">
                        <span class="detalle-label">Nota</span>
                        <span class="detalle-value">Bahía en mantenimiento</span>
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
// RENDERIZADO DE ESTADÍSTICAS
// =====================================================

function renderizarEstadisticas() {
    const totalElement = document.getElementById('totalOrdenes');
    const enProcesoElement = document.getElementById('enProcesoCount');
    const enPausaElement = document.getElementById('enPausaCount');
    const finalizadasElement = document.getElementById('finalizadasCount');
    
    if (totalElement) totalElement.textContent = statsGenerales.total || 0;
    if (enProcesoElement) enProcesoElement.textContent = statsGenerales.enProceso || 0;
    if (enPausaElement) enPausaElement.textContent = statsGenerales.enPausa || 0;
    if (finalizadasElement) finalizadasElement.textContent = statsGenerales.finalizadas || 0;
    
    const diagPendientes = document.getElementById('diagPendientes');
    const diagAprobados = document.getElementById('diagAprobados');
    const diagRechazados = document.getElementById('diagRechazados');
    
    if (diagPendientes) diagPendientes.textContent = diagnosticoStats.pendiente || 0;
    if (diagAprobados) diagAprobados.textContent = diagnosticoStats.aprobado || 0;
    if (diagRechazados) diagRechazados.textContent = diagnosticoStats.rechazado || 0;
}

// =====================================================
// DETALLE DE ORDEN
// =====================================================

async function verDetalleOrden(idOrden) {
    try {
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
                                <span class="detalle-value ${detalle.estado_global}">${ESTADOS_ORDEN[detalle.estado_global]?.texto || detalle.estado_global}</span>
                            </div>
                            <div class="detalle-item">
                                <span class="detalle-label">Fecha Ingreso</span>
                                <span class="detalle-value">${new Date(detalle.fecha_ingreso).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-car"></i> Vehículo y Cliente</h4>
                        <div class="detalle-grid">
                            <div class="detalle-item">
                                <span class="detalle-label">Placa</span>
                                <span class="detalle-value">${escapeHtml(detalle.placa)}</span>
                            </div>
                            <div class="detalle-item">
                                <span class="detalle-label">Vehículo</span>
                                <span class="detalle-value">${escapeHtml(detalle.marca)} ${escapeHtml(detalle.modelo)} (${detalle.anio || 'N/A'})</span>
                            </div>
                            <div class="detalle-item">
                                <span class="detalle-label">Cliente</span>
                                <span class="detalle-value">${escapeHtml(detalle.cliente?.nombre || 'N/A')}</span>
                            </div>
                            <div class="detalle-item">
                                <span class="detalle-label">Teléfono</span>
                                <span class="detalle-value">${escapeHtml(detalle.cliente?.telefono || 'N/A')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-calendar-alt"></i> Planificación</h4>
                        <div class="detalle-grid">
                            <div class="detalle-item">
                                <span class="detalle-label">Bahía</span>
                                <span class="detalle-value">${detalle.planificacion?.bahia_asignada || 'No asignada'}</span>
                            </div>
                            <div class="detalle-item">
                                <span class="detalle-label">Inicio Estimado</span>
                                <span class="detalle-value">${detalle.planificacion?.fecha_hora_inicio_estimado ? new Date(detalle.planificacion.fecha_hora_inicio_estimado).toLocaleString() : 'No programado'}</span>
                            </div>
                            <div class="detalle-item">
                                <span class="detalle-label">Horas Estimadas</span>
                                <span class="detalle-value">${detalle.planificacion?.horas_estimadas || 'N/A'} horas</span>
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
                    
                    ${detalle.diagnostico_inicial ? `
                        <div class="detalle-seccion">
                            <h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4>
                            <div class="detalle-descripcion">${escapeHtml(detalle.diagnostico_inicial)}</div>
                        </div>
                    ` : ''}
                </div>
            `;
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
// FUNCIONES AUXILIARES
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        await cargarOrdenesConPlanificacion();
        renderizarCalendario();
    }, 30000);
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