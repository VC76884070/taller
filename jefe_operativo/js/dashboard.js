// =====================================================
// DASHBOARD.JS - JEFE OPERATIVO (VERSIÓN FINAL)
// SIN AUTO-REFRESH Y SIN REDIRECCIONES
// =====================================================

const API_URL = window.location.origin + '/api';
let calendar = null;
let isLoading = false;
let dashboardLoadTimeout = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Dashboard Jefe Operativo');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initDateDisplay();
    
    // Cargar datos una sola vez al inicio
    await loadDashboardData();
    await initCalendar();
    
    setupEventListeners();
    
    // NO hay intervalo de auto-refresh
    console.log('✅ Dashboard cargado - Actualización manual solamente');
});

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userInfoRaw = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const userInfo = JSON.parse(userInfoRaw || '{}');
        const roles = userInfo.roles || [];
        const tieneAcceso = roles.includes('jefe_operativo') || userInfo.rol === 'jefe_operativo';
        
        if (!tieneAcceso) {
            if (roles.includes('jefe_taller')) {
                window.location.href = '/jefe_taller/dashboard.html';
            } else {
                window.location.href = '/';
            }
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error en checkAuth:', error);
        window.location.href = '/';
        return false;
    }
}

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function initDateDisplay() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element && element.textContent !== String(value)) {
        element.textContent = value;
    }
}

function formatearEstado(estado) {
    const estados = {
        'EnRecepcion': 'En recepción',
        'EnDiagnostico': 'En diagnóstico',
        'EnProceso': 'En proceso',
        'EnReparacion': 'En reparación',
        'EnPausa': 'En pausa',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado',
        'ReparacionCompletada': 'Reparación completada'
    };
    return estados[estado] || estado || 'En proceso';
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// =====================================================
// SKELETON LOADING
// =====================================================

function showSkeletonLoading() {
    const containers = ['entregasList', 'vehiculosTallerList'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container && !container.querySelector('.skeleton-loading')) {
            if (!container.hasAttribute('data-original')) {
                container.setAttribute('data-original', container.innerHTML);
            }
            container.innerHTML = `
                <div class="skeleton-loading">
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                </div>
            `;
        }
    });
}

function hideSkeletonLoading() {
    const containers = ['entregasList', 'vehiculosTallerList'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container && container.querySelector('.skeleton-loading')) {
            const original = container.getAttribute('data-original');
            if (original && original !== '') {
                container.innerHTML = original;
            } else {
                container.innerHTML = '<div class="empty-state">Cargando...</div>';
            }
        }
    });
}

function showErrorState() {
    const containers = ['entregasList', 'vehiculosTallerList'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = '<div class="error-state">⚠️ Error al cargar datos</div>';
        }
    });
}

// =====================================================
// CARGA PRINCIPAL DE DATOS (SOLO UNA VEZ)
// =====================================================

async function loadDashboardData() {
    if (isLoading) return;
    
    if (dashboardLoadTimeout) {
        clearTimeout(dashboardLoadTimeout);
    }
    
    dashboardLoadTimeout = setTimeout(async () => {
        isLoading = true;
        
        try {
            const token = localStorage.getItem('furia_token');
            
            if (!token) {
                console.warn('No hay token disponible');
                return;
            }
            
            showSkeletonLoading();
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(`${API_URL}/jefe-operativo/dashboard`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.status === 401) {
                logout();
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Error al cargar datos');
            }
            
            const data = result.data;
            
            requestAnimationFrame(() => {
                updateDashboardUI(data);
            });
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Timeout en la carga del dashboard');
                showErrorState();
            } else {
                console.error('Error cargando dashboard:', error);
                showErrorState();
            }
        } finally {
            isLoading = false;
            hideSkeletonLoading();
        }
    }, 100);
}

function updateDashboardUI(data) {
    // Actualizar KPIs
    if (data.kpis) {
        updateElement('ingresadosHoy', data.kpis.ingresados_hoy || 0);
        updateElement('enProceso', data.kpis.en_proceso || 0);
        updateElement('enPausa', data.kpis.en_pausa || 0);
    }
    
    // Actualizar próximas entregas
    if (data.proximas_entregas) {
        renderProximasEntregas(data.proximas_entregas);
        updateElement('proximasEntregasCount', data.proximas_entregas.length);
    }
    
    // Actualizar vehículos en taller
    if (data.vehiculos_taller) {
        renderVehiculosTaller(data.vehiculos_taller);
        updateElement('vehiculosTallerCount', data.vehiculos_taller.length);
    }
    
    // Actualizar últimos ingresos
    if (data.ultimos_ingresos) {
        renderUltimosIngresos(data.ultimos_ingresos);
    }
    
    // Actualizar notificaciones
    if (data.notificaciones !== undefined) {
        updateElement('notificacionesCount', data.total_notificaciones || 0);
    }
}

// =====================================================
// RENDERIZADO DE COMPONENTES (SIN REDIRECCIONES)
// =====================================================

function renderProximasEntregas(entregas) {
    const container = document.getElementById('entregasList');
    if (!container) return;
    
    if (!entregas || entregas.length === 0) {
        container.innerHTML = '<div class="empty-state">✅ No hay entregas pendientes</div>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < Math.min(entregas.length, 15); i++) {
        const e = entregas[i];
        let prioridadClass = '';
        let diasTexto = '';
        let statusText = '';
        
        if (e.prioridad === 'urgente') {
            prioridadClass = 'urgente';
            diasTexto = `⚠️ Atrasado ${Math.abs(e.dias_restantes)} días`;
            statusText = '⚠️ Atrasado';
        } else if (e.prioridad === 'hoy') {
            prioridadClass = 'hoy';
            diasTexto = '📅 Entrega HOY';
            statusText = '📅 Hoy';
        } else if (e.prioridad === 'pronto') {
            prioridadClass = 'pronto';
            diasTexto = `⏰ ${e.dias_restantes} días`;
            statusText = '📆 Próximo';
        } else if (e.dias_restantes !== null && e.dias_restantes !== undefined) {
            diasTexto = `${e.dias_restantes} días`;
            statusText = '📆 Próximo';
        } else if (e.dias_estimados) {
            diasTexto = `${e.dias_estimados} días estimados`;
            statusText = '📆 En proceso';
        } else {
            diasTexto = 'Fecha no definida';
            statusText = '⏳ Pendiente';
        }
        
        // SIN onclick - Solo visualización
        html += `
            <div class="entrega-item ${prioridadClass}" style="cursor: default;">
                <div class="entrega-icon"><i class="fas fa-calendar-check"></i></div>
                <div class="entrega-content">
                    <h4>${escapeHtml(e.vehiculo)} <span class="placa">${escapeHtml(e.placa)}</span></h4>
                    <p class="cliente"><i class="fas fa-user"></i> ${escapeHtml(e.cliente)}</p>
                    <p class="entrega-total">${diasTexto}</p>
                </div>
                <div class="entrega-status">
                    <span class="status-badge ${prioridadClass === 'urgente' ? 'pendiente' : 'aprobada'}">
                        ${statusText}
                    </span>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function renderVehiculosTaller(vehiculos) {
    const container = document.getElementById('vehiculosTallerList');
    if (!container) return;
    
    if (!vehiculos || vehiculos.length === 0) {
        container.innerHTML = '<div class="empty-state">🔧 No hay vehículos en taller</div>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < Math.min(vehiculos.length, 15); i++) {
        const v = vehiculos[i];
        let diasClass = '';
        let diasTexto = '';
        
        if (v.dias_restantes !== null && v.dias_restantes !== undefined) {
            if (v.dias_restantes < 0) {
                diasClass = 'atrasado';
                diasTexto = `Atrasado ${Math.abs(v.dias_restantes)}d`;
            } else if (v.dias_restantes === 0) {
                diasClass = 'urgente';
                diasTexto = 'Hoy';
            } else if (v.dias_restantes <= 3) {
                diasClass = 'urgente';
                diasTexto = `${v.dias_restantes} días`;
            } else {
                diasTexto = `${v.dias_restantes} días`;
            }
        }
        
        // SIN onclick - Solo visualización
        html += `
            <div class="vehiculo-taller-item" style="cursor: default;">
                <div class="vehiculo-taller-icon"><i class="fas fa-car-side"></i></div>
                <div class="vehiculo-taller-info">
                    <div class="vehiculo-taller-placa">${escapeHtml(v.placa)}</div>
                    <div class="vehiculo-taller-modelo">${escapeHtml(v.vehiculo)}</div>
                    <div class="vehiculo-taller-estado">${formatearEstado(v.estado)}</div>
                </div>
                ${diasTexto ? `<div class="vehiculo-taller-dias ${diasClass}">${diasTexto}</div>` : ''}
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function renderUltimosIngresos(ingresos) {
    const container = document.getElementById('ultimosIngresos');
    if (!container) return;
    
    if (!ingresos || ingresos.length === 0) {
        container.innerHTML = '<tr><td colspan="6">No hay ingresos registrados</td></tr>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < ingresos.length; i++) {
        const ing = ingresos[i];
        // SIN botón de ver - Solo visualización
        html += `
            <tr>
                <td>${ing.hora || '--:--'}</td>
                <td><span class="plate-badge">${escapeHtml(ing.placa || '---')}</span></td>
                <td>${escapeHtml(ing.vehiculo)}</td>
                <td>${escapeHtml(ing.cliente)}</td>
                <td><span class="status-badge ${ing.estado === 'EnRecepcion' ? 'warning' : 'success'}">${formatearEstado(ing.estado)}</span></td>
                <td><i class="fas fa-info-circle" style="color: #999; cursor: default;"></i></td>
            </tr>
        `;
    }
    
    container.innerHTML = html;
}

// =====================================================
// CALENDARIO (SOLO VISUALIZACIÓN)
// =====================================================

function initCalendar() {
    const calendarEl = document.getElementById('calendarioOperativo');
    if (!calendarEl) {
        console.warn('Elemento calendario no encontrado');
        return;
    }
    
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
        selectable: false,  // No seleccionable
        dayMaxEvents: true,
        events: cargarEventosCalendario,
        eventClick: function(info) {
            // Prevenir cualquier acción al hacer clic en eventos
            info.jsEvent.preventDefault();
            return false;
        },
        datesSet: () => {
            setTimeout(() => pintarDiasReparacion(), 150);
        }
    });
    
    calendar.render();
}

async function cargarEventosCalendario(info, successCallback, failureCallback) {
    try {
        const token = localStorage.getItem('furia_token');
        
        if (!token) {
            successCallback([]);
            return;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(`${API_URL}/jefe-operativo/ordenes-activas-calendario`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            successCallback([]);
            return;
        }
        
        const data = await response.json();
        const eventos = [];
        
        if (data.ordenes && data.ordenes.length > 0) {
            data.ordenes.forEach(orden => {
                if (orden.fecha_ingreso) {
                    eventos.push({
                        id: `orden_${orden.id_orden}`,
                        title: `🔧 ${orden.placa || 'Vehículo'}`,
                        start: orden.fecha_ingreso,
                        backgroundColor: '#FF9800',
                        borderColor: '#FF9800',
                        textColor: '#ffffff',
                        interactive: false  // No interactivo
                    });
                }
            });
        }
        
        successCallback(eventos);
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error cargando eventos:', error);
        }
        successCallback([]);
    }
}

async function pintarDiasReparacion() {
    try {
        const token = localStorage.getItem('furia_token');
        
        if (!token) return;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(`${API_URL}/jefe-operativo/ordenes-activas-calendario`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
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
            
            const placa = orden.placa || 'Vehículo';
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
                            dayEl.setAttribute('data-tooltip', `⚠️ ATRASADO: ${placa}`);
                        } else {
                            dayEl.classList.add('entrega-dia');
                            dayEl.setAttribute('data-tooltip', `🚗 ENTREGA: ${placa}`);
                        }
                    } else {
                        dayEl.classList.add('reparacion-dia');
                        if (dia.toDateString() === fechaIngreso.toDateString()) {
                            dayEl.setAttribute('data-tooltip', `📅 INGRESO: ${placa}`);
                        } else {
                            dayEl.setAttribute('data-tooltip', `🔧 REPARACIÓN: ${placa}`);
                        }
                    }
                });
            });
        });
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error pintando días:', error);
        }
    }
}

// =====================================================
// BOTÓN DE ACTUALIZACIÓN MANUAL
// =====================================================

function setupEventListeners() {
    const notifIcon = document.getElementById('notificationIcon');
    if (notifIcon) {
        notifIcon.addEventListener('click', () => {
            // Solo mostrar notificaciones, sin redirigir
            showNotificationsPanel();
        });
    }
    
    // Agregar botón de refresh manual si no existe
    addRefreshButton();
}

function addRefreshButton() {
    const topActions = document.querySelector('.top-actions');
    if (topActions && !document.getElementById('manualRefreshBtn')) {
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'manualRefreshBtn';
        refreshBtn.className = 'refresh-btn';
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
        refreshBtn.onclick = () => manualRefresh();
        refreshBtn.style.cssText = `
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
            transition: all 0.3s;
        `;
        topActions.insertBefore(refreshBtn, topActions.firstChild);
    }
}

async function manualRefresh() {
    const refreshBtn = document.getElementById('manualRefreshBtn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
    }
    
    await loadDashboardData();
    if (calendar) {
        calendar.refetchEvents();
    }
    
    if (refreshBtn) {
        setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
        }, 1000);
    }
}

function showNotificationsPanel() {
    // Función simple para mostrar notificaciones (solo visual)
    const count = document.getElementById('notificacionesCount')?.textContent || '0';
    alert(`📢 Notificaciones\n\nTienes ${count} notificaciones sin leer\n\n(Esta es una vista previa - próximamente panel completo)`);
}

// =====================================================
// FUNCIONES GLOBALES
// =====================================================

// Función de logout (se mantiene por si acaso)
window.logout = function() {
    if (dashboardLoadTimeout) {
        clearTimeout(dashboardLoadTimeout);
    }
    localStorage.clear();
    window.location.href = '/';
};

// Recargar datos manualmente desde consola (útil para debugging)
window.reloadDashboard = function() {
    manualRefresh();
};

// =====================================================
// MANEJO DE ERRORES GLOBAL
// =====================================================

window.addEventListener('unhandledrejection', function(event) {
    console.error('Promesa rechazada no manejada:', event.reason);
});

window.addEventListener('error', function(event) {
    console.error('Error global:', event.error);
});