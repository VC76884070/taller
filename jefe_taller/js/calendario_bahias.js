// =====================================================
// CALENDARIO Y BAHÍAS - JEFE TALLER (COMPLETO CORREGIDO)
// VERSIÓN CORREGIDA - USA VARIABLE GLOBAL DE INCLUDE.JS
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
// La variable API_BASE_URL ya está declarada en include.js como window.API_BASE_URL
// Si por alguna razón no existe (página cargada sola), la creamos
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 calendario_bahias.js - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 calendario_bahias.js - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

const API_URL = `${window.API_BASE_URL}/api`;
let userInfo = null;
let currentUserRoles = [];
let pollingInterval = null;

// Variables de estado
let fechaActual = new Date();
let ordenes = [];
let bahiasEstado = [];
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

// Variables para gráficos
let estadosChart = null;
let evolucionChart = null;
let diagnosticosChart = null;
let cargaChart = null;

// Datos para evolución mensual
let evolucionMensual = {
    labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
    datos: [0, 0, 0, 0, 0, 0]
};

// Datos de técnicos
let tecnicosCargaData = [];

// Mapeo de estados
const ESTADOS_ORDEN = {
    'EnRecepcion': { texto: 'En Recepción', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
    'EnDiagnostico': { texto: 'En Diagnóstico', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
    'EnProceso': { texto: 'En Proceso', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
    'EnPausa': { texto: 'En Pausa', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
    'PendienteAprobacion': { texto: 'Pendiente Aprobación', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
    'DiagnosticoCompletado': { texto: 'Diagnóstico Completado', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
    'DiagnosticoAprobado': { texto: 'Diagnóstico Aprobado', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
    'CotizacionEnviada': { texto: 'Cotización Enviada', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
    'CotizacionAceptada': { texto: 'Cotización Aceptada', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
    'Finalizado': { texto: 'Finalizado', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
    'Entregado': { texto: 'Entregado', color: '#059669', bg: 'rgba(5, 150, 105, 0.15)' }
};

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando calendario y bahías');
    console.log('📡 API_URL:', API_URL);
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    await cargarTodosLosDatos();
    
    renderizarCalendario();
    renderizarBahias();
    renderizarEstadisticas();
    
    iniciarPolling();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = window.API_BASE_URL + '/';
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
        
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller');
        
        if (!tieneRolJefeTaller) {
            console.warn('Usuario no tiene permisos de jefe_taller', currentUserRoles);
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => { window.location.href = window.API_BASE_URL + '/'; }, 2000);
            return false;
        }
        
        console.log('✅ Autenticación exitosa - Roles:', currentUserRoles);
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
    
    const userNameElement = document.getElementById('userNombre');
    if (userNameElement && userInfo) {
        userNameElement.textContent = userInfo.nombre || 'Usuario';
    }
}

function setupEventListeners() {
    const prevBtn = document.getElementById('prevMesBtn');
    const nextBtn = document.getElementById('nextMesBtn');
    const hoyBtn = document.getElementById('hoyBtn');
    const refreshBtn = document.getElementById('refreshBahiasBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (prevBtn) prevBtn.addEventListener('click', () => {
        fechaActual.setMonth(fechaActual.getMonth() - 1);
        renderizarCalendario();
    });
    
    if (nextBtn) nextBtn.addEventListener('click', () => {
        fechaActual.setMonth(fechaActual.getMonth() + 1);
        renderizarCalendario();
    });
    
    if (hoyBtn) hoyBtn.addEventListener('click', () => {
        fechaActual = new Date();
        renderizarCalendario();
    });
    
    if (refreshBtn) refreshBtn.addEventListener('click', async () => {
        await cargarBahias();
        renderizarBahias();
        mostrarNotificacion('Bahías actualizadas', 'success');
    });
    
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // Pestañas
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
    window.location.href = window.API_BASE_URL + '/';
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
    mostrarLoading(true);
    try {
        await Promise.all([
            cargarOrdenesConPlanificacion(),
            cargarBahias(),
            cargarEstadisticas(),
            cargarDiagnosticosStats(),
            cargarDatosGraficos()
        ]);
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarNotificacion('Error cargando datos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cargarOrdenesConPlanificacion() {
    try {
        const token = localStorage.getItem('furia_token');
        console.log('📅 Cargando órdenes con planificación...');
        
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-con-planificacion`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        const data = await response.json();
        
        if (response.ok && data.ordenes) {
            ordenes = data.ordenes;
            console.log(`✅ ${ordenes.length} órdenes planificadas cargadas`);
        } else {
            ordenes = [];
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        ordenes = [];
    }
}

async function cargarBahias() {
    try {
        const token = localStorage.getItem('furia_token');
        console.log('🏭 Cargando estado de bahías...');
        
        const response = await fetch(`${API_URL}/jefe-taller/bahias`, {
            headers: { 'Authorization': `Bearer ${token}` }
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
            console.log(`✅ Bahías: ${ocupadas} ocupadas`);
        } else {
            bahiasEstado = [];
        }
    } catch (error) {
        console.error('Error cargando bahías:', error);
        bahiasEstado = [];
    }
}

async function cargarEstadisticas() {
    try {
        const token = localStorage.getItem('furia_token');
        console.log('📊 Cargando estadísticas...');
        
        const response = await fetch(`${API_URL}/jefe-taller/estadisticas-ordenes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            statsGenerales = {
                total: data.total || 0,
                enProceso: data.enProceso || 0,
                enPausa: data.enPausa || 0,
                enRecepcion: data.enRecepcion || 0,
                pendienteAprobacion: data.pendienteAprobacion || 0,
                finalizadas: data.finalizadas || 0,
                entregadas: data.entregadas || 0
            };
            console.log('✅ Estadísticas cargadas:', statsGenerales);
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

async function cargarDiagnosticosStats() {
    try {
        const token = localStorage.getItem('furia_token');
        
        const response = await fetch(`${API_URL}/jefe-taller/diagnosticos-stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (response.ok && data.stats) {
            diagnosticoStats = data.stats;
        }
    } catch (error) {
        console.error('Error cargando estadísticas de diagnósticos:', error);
    }
}

async function cargarDatosGraficos() {
    try {
        const token = localStorage.getItem('furia_token');
        
        // Cargar evolución mensual
        const evolucionResponse = await fetch(`${API_URL}/jefe-taller/evolucion-mensual`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (evolucionResponse.ok) {
            const evolucionData = await evolucionResponse.json();
            if (evolucionData.success && evolucionData.datos) {
                evolucionMensual = {
                    labels: evolucionData.labels || ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
                    datos: evolucionData.datos || [0, 0, 0, 0, 0, 0]
                };
            }
        }
        
        // Cargar carga de técnicos
        const tecnicosResponse = await fetch(`${API_URL}/jefe-taller/tecnicos-carga`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (tecnicosResponse.ok) {
            const tecnicosData = await tecnicosResponse.json();
            if (tecnicosData.success && tecnicosData.tecnicos) {
                tecnicosCargaData = tecnicosData.tecnicos;
            }
        }
        
    } catch (error) {
        console.error('Error cargando datos para gráficos:', error);
    }
}

// =====================================================
// RENDERIZADO DEL CALENDARIO
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
    
    // Agrupar órdenes por fecha
    const ordenesPorFecha = {};
    ordenes.forEach(orden => {
        if (orden.fecha_hora_inicio_estimado) {
            const fecha = new Date(orden.fecha_hora_inicio_estimado);
            const fechaKey = fecha.toISOString().split('T')[0];
            if (!ordenesPorFecha[fechaKey]) ordenesPorFecha[fechaKey] = [];
            ordenesPorFecha[fechaKey].push(orden);
        }
    });
    
    let html = '';
    
    // Días vacíos al inicio
    for (let i = 0; i < diaInicioSemana; i++) {
        html += `<div class="celda-dia vacio"></div>`;
    }
    
    // Días del mes
    for (let dia = 1; dia <= totalDias; dia++) {
        const fechaDia = new Date(año, mes, dia);
        const fechaKey = fechaDia.toISOString().split('T')[0];
        const ordenesDelDia = ordenesPorFecha[fechaKey] || [];
        const esHoy = fechaDia.toDateString() === hoy.toDateString();
        
        html += `
            <div class="celda-dia ${esHoy ? 'hoy' : ''} ${ordenesDelDia.length > 0 ? 'con-ordenes' : ''}" 
                 onclick="abrirDetalleDia('${fechaKey}', ${dia}, ${mes + 1}, ${año})">
                <div class="dia-numero">${dia}</div>
                <div class="dia-eventos">
                    ${ordenesDelDia.slice(0, 2).map(orden => `
                        <div class="evento-mini" title="${orden.codigo_unico} - ${orden.placa || ''}">
                            ${orden.codigo_unico ? orden.codigo_unico.substring(0, 10) + '...' : 'Sin código'}
                        </div>
                    `).join('')}
                    ${ordenesDelDia.length > 2 ? `<div class="evento-mas">+${ordenesDelDia.length - 2} más</div>` : ''}
                </div>
                ${ordenesDelDia.length > 0 ? `<div class="dia-badge">${ordenesDelDia.length} orden(es)</div>` : ''}
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
                            <span class="progreso-texto">${bahia.horas_transcurridas}/${bahia.horas_estimadas}h</span>
                        </div>
                    `;
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
                ${infoAdicional}
                ${bahia.horas_transcurridas ? `<div class="bahia-tiempo">⏱️ ${bahia.horas_transcurridas} horas</div>` : ''}
            </div>
        `;
    }).join('');
}

// =====================================================
// RENDERIZADO DE ESTADÍSTICAS Y GRÁFICOS
// =====================================================

function renderizarEstadisticas() {
    console.log('📊 Renderizando estadísticas:', statsGenerales);
    
    // Actualizar números en tarjetas
    const elementos = {
        totalOrdenes: statsGenerales.total,
        enProcesoCount: statsGenerales.enProceso,
        enPausaCount: statsGenerales.enPausa,
        entregadasCount: statsGenerales.entregadas,
        diagPendientes: diagnosticoStats.pendiente || 0,
        diagAprobados: diagnosticoStats.aprobado || 0,
        diagRechazados: diagnosticoStats.rechazado || 0
    };
    
    Object.entries(elementos).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    });
    
    // Renderizar gráficos
    renderizarGraficos();
}

function renderizarGraficos() {
    // 1. Gráfico de Estados (Doughnut)
    const estadosCtx = document.getElementById('estadosChart')?.getContext('2d');
    if (estadosCtx) {
        if (estadosChart) estadosChart.destroy();
        
        estadosChart = new Chart(estadosCtx, {
            type: 'doughnut',
            data: {
                labels: ['En Proceso', 'En Pausa', 'En Recepción', 'Pendiente Aprobación', 'Finalizadas', 'Entregadas'],
                datasets: [{
                    data: [
                        statsGenerales.enProceso || 0,
                        statsGenerales.enPausa || 0,
                        statsGenerales.enRecepcion || 0,
                        statsGenerales.pendienteAprobacion || 0,
                        statsGenerales.finalizadas || 0,
                        statsGenerales.entregadas || 0
                    ],
                    backgroundColor: ['#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#10B981', '#059669'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, color: '#9ca3af' } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? Math.round((context.raw / total) * 100) : 0;
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    // 2. Gráfico de Evolución Mensual (Line)
    const evolucionCtx = document.getElementById('evolucionChart')?.getContext('2d');
    if (evolucionCtx) {
        if (evolucionChart) evolucionChart.destroy();
        
        evolucionChart = new Chart(evolucionCtx, {
            type: 'line',
            data: {
                labels: evolucionMensual.labels,
                datasets: [{
                    label: 'Órdenes de Trabajo',
                    data: evolucionMensual.datos,
                    borderColor: '#c1121f',
                    backgroundColor: 'rgba(193, 18, 31, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#c1121f',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { labels: { color: '#9ca3af' } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Cantidad', color: '#9ca3af' } },
                    x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
                }
            }
        });
    }
    
    // 3. Gráfico de Diagnósticos (Bar)
    const diagnosticosCtx = document.getElementById('diagnosticosChart')?.getContext('2d');
    if (diagnosticosCtx) {
        if (diagnosticosChart) diagnosticosChart.destroy();
        
        diagnosticosChart = new Chart(diagnosticosCtx, {
            type: 'bar',
            data: {
                labels: ['Pendientes', 'Aprobados', 'Rechazados'],
                datasets: [{
                    label: 'Diagnósticos',
                    data: [
                        diagnosticoStats.pendiente || 0,
                        diagnosticoStats.aprobado || 0,
                        diagnosticoStats.rechazado || 0
                    ],
                    backgroundColor: ['#F59E0B', '#10B981', '#EF4444'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Cantidad', color: '#9ca3af' } },
                    x: { ticks: { color: '#9ca3af' } }
                }
            }
        });
    }
    
    // 4. Gráfico de Carga de Técnicos
    const cargaCtx = document.getElementById('cargaChart')?.getContext('2d');
    if (cargaCtx && tecnicosCargaData.length > 0) {
        if (cargaChart) cargaChart.destroy();
        
        const maxCarga = tecnicosCargaData[0]?.max_vehiculos || 2;
        
        cargaChart = new Chart(cargaCtx, {
            type: 'bar',
            data: {
                labels: tecnicosCargaData.map(t => t.nombre.split(' ')[0]),
                datasets: [{
                    label: 'Órdenes Activas',
                    data: tecnicosCargaData.map(t => t.ordenes_activas),
                    backgroundColor: tecnicosCargaData.map(t => {
                        if (t.ordenes_activas >= maxCarga) return '#EF4444';
                        if (t.ordenes_activas >= maxCarga - 1) return '#F59E0B';
                        return '#10B981';
                    }),
                    borderRadius: 8
                }, {
                    label: 'Capacidad Máxima',
                    data: Array(tecnicosCargaData.length).fill(maxCarga),
                    type: 'line',
                    borderColor: '#9ca3af',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: {
                    y: { beginAtZero: true, max: maxCarga + 1, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Cantidad', color: '#9ca3af' } },
                    x: { ticks: { color: '#9ca3af' } }
                }
            }
        });
    }
    
    // Lista de técnicos
    renderizarListaTecnicosCarga();
}

function renderizarListaTecnicosCarga() {
    const container = document.getElementById('tecnicosCargaList');
    if (!container) return;
    
    if (tecnicosCargaData.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No hay técnicos registrados</p></div>';
        return;
    }
    
    const maxCarga = tecnicosCargaData[0]?.max_vehiculos || 2;
    
    container.innerHTML = tecnicosCargaData.map(tecnico => {
        const porcentaje = (tecnico.ordenes_activas / maxCarga) * 100;
        let cargaClass = 'normal';
        if (porcentaje >= 100) cargaClass = 'urgente';
        else if (porcentaje >= 80) cargaClass = 'alta';
        
        return `
            <div class="tecnico-carga-item">
                <span class="tecnico-nombre">
                    <i class="fas fa-user-cog"></i> ${escapeHtml(tecnico.nombre)}
                </span>
                <div class="tecnico-carga">
                    <div class="carga-bar">
                        <div class="carga-fill ${cargaClass}" style="width: ${Math.min(100, porcentaje)}%"></div>
                    </div>
                    <span class="carga-texto">${tecnico.ordenes_activas}/${maxCarga}</span>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// MODALES
// =====================================================

async function abrirDetalleDia(fechaKey, dia, mes, año) {
    const modal = document.getElementById('modalDetalleDia');
    const titulo = document.getElementById('modalDiaTitulo');
    const body = document.getElementById('modalDiaBody');
    
    const fecha = new Date(año, mes - 1, dia);
    const nombreDia = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (titulo) titulo.innerHTML = `<i class="fas fa-calendar-day"></i> Órdenes del ${nombreDia}`;
    
    const ordenesDelDia = ordenes.filter(orden => {
        if (!orden.fecha_hora_inicio_estimado) return false;
        const fechaOrden = new Date(orden.fecha_hora_inicio_estimado);
        const fechaKeyOrden = fechaOrden.toISOString().split('T')[0];
        return fechaKeyOrden === fechaKey;
    });
    
    if (body) {
        if (ordenesDelDia.length === 0) {
            body.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-check"></i><p>No hay órdenes programadas para este día</p></div>`;
        } else {
            body.innerHTML = `
                <div class="ordenes-dia-lista">
                    ${ordenesDelDia.map(orden => {
                        const estadoConfig = ESTADOS_ORDEN[orden.estado_global] || { texto: orden.estado_global || 'Desconocido', color: '#9ca3af', bg: 'rgba(107, 114, 128, 0.15)' };
                        return `
                            <div class="orden-dia-card" onclick="verDetalleOrden(${orden.id})">
                                <div class="orden-card-header">
                                    <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                                    <span class="orden-estado" style="background: ${estadoConfig.bg}; color: ${estadoConfig.color}">
                                        <i class="fas fa-circle" style="font-size: 8px;"></i> ${estadoConfig.texto}
                                    </span>
                                </div>
                                <div class="orden-card-body">
                                    <div class="orden-info"><i class="fas fa-car"></i><span>${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')} (${escapeHtml(orden.placa || 'N/A')})</span></div>
                                    <div class="orden-info"><i class="fas fa-user"></i><span>${escapeHtml(orden.cliente_nombre || 'N/A')}</span></div>
                                    <div class="orden-info"><i class="fas fa-warehouse"></i><span>Bahía ${orden.bahia_asignada || 'No asignada'}</span></div>
                                    ${orden.tecnicos && orden.tecnicos.length > 0 ? `<div class="orden-info"><i class="fas fa-users"></i><span>Técnicos: ${orden.tecnicos.map(t => t.nombre).join(', ')}</span></div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
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

async function verDetalleOrden(idOrden) {
    try {
        const token = localStorage.getItem('furia_token');
        mostrarNotificacion('Cargando detalles...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${token}` }
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
            const estadoConfig = ESTADOS_ORDEN[detalle.estado_global] || { texto: detalle.estado_global || 'Desconocido', color: '#9ca3af' };
            
            body.innerHTML = `
                <div class="detalle-orden">
                    <div class="detalle-header">
                        <h3>${escapeHtml(detalle.codigo_unico)}</h3>
                        <span class="detalle-estado" style="color: ${estadoConfig.color}"><i class="fas fa-circle"></i> ${estadoConfig.texto}</span>
                    </div>
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-car"></i> Vehículo</h4>
                        <p><strong>Placa:</strong> ${escapeHtml(detalle.placa || 'N/A')}</p>
                        <p><strong>Marca/Modelo:</strong> ${escapeHtml(detalle.marca || '')} ${escapeHtml(detalle.modelo || '')}</p>
                        <p><strong>Año:</strong> ${detalle.anio || 'N/A'} | <strong>Kilometraje:</strong> ${detalle.kilometraje ? detalle.kilometraje.toLocaleString() + ' km' : 'N/A'}</p>
                    </div>
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-user"></i> Cliente</h4>
                        <p><strong>Nombre:</strong> ${escapeHtml(detalle.cliente?.nombre || 'No registrado')}</p>
                        <p><strong>Teléfono:</strong> ${escapeHtml(detalle.cliente?.telefono || 'No registrado')}</p>
                    </div>
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-calendar"></i> Planificación</h4>
                        <p><strong>Bahía:</strong> ${detalle.planificacion?.bahia_asignada ? `Bahía ${detalle.planificacion.bahia_asignada}` : 'No asignada'}</p>
                        <p><strong>Horas estimadas:</strong> ${detalle.planificacion?.horas_estimadas || 'N/A'} horas</p>
                        ${detalle.planificacion?.fecha_hora_inicio_estimado ? `<p><strong>Inicio estimado:</strong> ${new Date(detalle.planificacion.fecha_hora_inicio_estimado).toLocaleString()}</p>` : ''}
                    </div>
                    ${detalle.tecnicos && detalle.tecnicos.length > 0 ? `
                        <div class="detalle-seccion">
                            <h4><i class="fas fa-users"></i> Técnicos</h4>
                            ${detalle.tecnicos.map(t => `<p><i class="fas fa-user-cog"></i> ${escapeHtml(t.nombre)} (${t.tipo === 'diagnostico' ? 'Diagnóstico' : 'Reparación'})</p>`).join('')}
                        </div>
                    ` : ''}
                    <div class="detalle-actions">
                        <button class="btn-cerrar" onclick="cerrarModalDetalleOrden()">Cerrar</button>
                    </div>
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

function verDetalleBahia(numero) {
    const bahia = bahiasEstado.find(b => b.numero === numero);
    const modal = document.getElementById('modalDetalleBahia');
    const body = document.getElementById('modalBahiaBody');
    
    let estadoTexto = 'Libre';
    let estadoClass = 'libre';
    let tiempoInfo = '';
    
    if (bahia) {
        switch (bahia.estado) {
            case 'ocupado': 
                estadoTexto = 'Ocupado';
                estadoClass = 'ocupado';
                if (bahia.horas_estimadas && bahia.horas_transcurridas) {
                    tiempoInfo = `<div class="detalle-item"><span class="detalle-label">Horas transcurridas</span><span class="detalle-value">${bahia.horas_transcurridas} / ${bahia.horas_estimadas}</span></div>`;
                }
                break;
            case 'reservado': 
                estadoTexto = 'Reservado';
                estadoClass = 'reservado';
                if (bahia.fecha_inicio_estimado) {
                    tiempoInfo = `<div class="detalle-item"><span class="detalle-label">Inicio estimado</span><span class="detalle-value">${new Date(bahia.fecha_inicio_estimado).toLocaleString()}</span></div>`;
                }
                break;
            default: 
                estadoTexto = 'Libre';
                estadoClass = 'libre';
        }
    }
    
    if (body) {
        body.innerHTML = `
            <div class="detalle-bahia">
                <div class="detalle-item"><span class="detalle-label">Bahía</span><span class="detalle-value">Bahía ${numero}</span></div>
                <div class="detalle-item"><span class="detalle-label">Estado</span><span class="detalle-value ${estadoClass}">${estadoTexto}</span></div>
                ${tiempoInfo}
                ${bahia?.orden_codigo ? `<div class="detalle-item"><span class="detalle-label">Orden</span><span class="detalle-value">${escapeHtml(bahia.orden_codigo)}</span></div>` : ''}
                <div class="detalle-actions"><button class="btn-cerrar" onclick="cerrarModalBahia()">Cerrar</button></div>
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
// FUNCIONES AUXILIARES
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        if (document.visibilityState === 'visible') {
            console.log('🔄 Actualizando datos...');
            await cargarOrdenesConPlanificacion();
            await cargarBahias();
            renderizarCalendario();
            renderizarBahias();
        }
    }, 30000);
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
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
    const iconos = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
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