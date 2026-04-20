// =====================================================
// DASHBOARD JEFE OPERATIVO - CORREGIDO
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Configuración de roles para redirección
const ROLE_CONFIG = {
    'jefe_operativo': {
        redirect: '/jefe_operativo/dashboard.html'
    },
    'jefe_taller': {
        redirect: '/jefe_taller/dashboard.html'
    },
    'tecnico': {
        redirect: '/tecnico_mecanico/misvehiculos.html'
    },
    'encargado_repuestos': {
        redirect: '/encargado_rep_almacen/dashboard.html'
    }
};

// Elementos DOM
const userName = document.getElementById('userName');
const welcomeName = document.getElementById('welcomeName');
const currentDateSpan = document.getElementById('currentDate');
const ingresadosHoy = document.getElementById('ingresadosHoy');
const enProceso = document.getElementById('enProceso');
const enPausa = document.getElementById('enPausa');
const ingresosHoy = document.getElementById('ingresosHoy');
const ultimosIngresos = document.getElementById('ultimosIngresos');
const notificationsList = document.getElementById('notificationsList');
const notificationBadge = document.querySelector('.notification-badge');

// Variables de estado
let incomeChart = null;
let usuarioActual = null;
let rolesUsuario = [];
let token = null;

// En dashboard.js, actualizar checkAuth similar
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userInfoRaw = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const userInfo = JSON.parse(userInfoRaw || '{}');
        
        // Verificar token con backend
        const verifyResponse = await fetch('/api/verify-token', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!verifyResponse.ok) {
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        // Verificar si tiene rol jefe_operativo o jefe_taller
        const tieneAcceso = 
            (userInfo.roles && (userInfo.roles.includes('jefe_operativo') || userInfo.roles.includes('jefe_taller'))) ||
            userInfo.rol === 'jefe_operativo' ||
            userInfo.rol === 'jefe_taller';
        
        if (!tieneAcceso) {
            window.location.href = '/';
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error en checkAuth:', error);
        window.location.href = '/';
        return false;
    }
}

// Mostrar indicador de roles múltiples
function mostrarIndicadorRoles() {
    const headerUserInfo = document.querySelector('.user-info');
    if (headerUserInfo && rolesUsuario && rolesUsuario.length > 1) {
        if (headerUserInfo.querySelector('.roles-badge')) return;
        
        const rolesBadge = document.createElement('div');
        rolesBadge.className = 'roles-badge';
        rolesBadge.style.cssText = `
            font-size: 0.7rem;
            background: rgba(255,255,255,0.1);
            padding: 0.2rem 0.5rem;
            border-radius: 12px;
            margin-top: 0.25rem;
            display: inline-block;
            color: var(--blanco);
            cursor: pointer;
        `;
        
        const nombresRoles = rolesUsuario.map(r => {
            const nombres = {
                'jefe_taller': 'Jefe Taller',
                'jefe_operativo': 'Jefe Operativo',
                'tecnico': 'Técnico',
                'encargado_repuestos': 'Repuestos'
            };
            return nombres[r] || r;
        }).join(' • ');
        
        rolesBadge.innerHTML = `<i class="fas fa-exchange-alt" style="margin-right: 0.3rem;"></i>${nombresRoles}`;
        rolesBadge.title = 'Tienes múltiples roles. Cierra sesión para cambiar de rol.';
        
        headerUserInfo.appendChild(rolesBadge);
    }
}

// Mostrar nombre de usuario
function mostrarNombreUsuario() {
    if (userName && usuarioActual) {
        userName.textContent = usuarioActual.nombre || 'Usuario';
    }
    if (welcomeName && usuarioActual) {
        welcomeName.textContent = (usuarioActual.nombre || 'Usuario').split(' ')[0];
    }
}

// Inicializar dashboard
function initDashboard() {
    // Mostrar fecha actual
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    if (currentDateSpan) {
        currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Navegación por sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('http')) {
                e.preventDefault();
                
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                link.closest('.nav-item').classList.add('active');
                window.location.href = href;
            }
        });
    });

    // Notificaciones
    document.querySelector('.notification-icon')?.addEventListener('click', () => {
        console.log('Abrir notificaciones');
    });
}

// =====================================================
// CARGAR DATOS DEL DASHBOARD
// =====================================================
async function loadDashboardData() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/dashboard`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 401) {
            console.log('Sesión expirada');
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar datos');
        }
        
        const data = result.data;
        
        // Actualizar KPIs
        if (data.kpis) {
            updateKPIs(data.kpis);
        }
        
        // Actualizar tabla de últimos ingresos
        if (data.ultimos_ingresos) {
            updateUltimosIngresos(data.ultimos_ingresos);
        }
        
        // Actualizar notificaciones
        if (data.notificaciones) {
            updateNotificaciones(data.notificaciones, data.total_notificaciones || 0);
        }
        
        // Actualizar gráfico
        if (data.grafico) {
            updateChart(data.grafico.fechas, data.grafico.ingresos);
        }
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarError('No se pudieron cargar los datos del dashboard');
    }
}

// Mostrar error
function mostrarError(mensaje) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        background: rgba(193, 18, 31, 0.1);
        color: var(--rojo-primario);
        padding: 1rem;
        border-radius: var(--radius-md);
        margin-bottom: 1rem;
        text-align: center;
    `;
    errorDiv.textContent = mensaje;
    
    const content = document.querySelector('.content');
    if (content) {
        content.insertBefore(errorDiv, content.firstChild);
        setTimeout(() => errorDiv.remove(), 5000);
    }
}

// Actualizar KPIs
function updateKPIs(kpis) {
    if (ingresadosHoy) ingresadosHoy.textContent = kpis.ingresados_hoy || 0;
    if (enProceso) enProceso.textContent = kpis.en_proceso || 0;
    if (enPausa) enPausa.textContent = kpis.en_pausa || 0;
    if (ingresosHoy) ingresosHoy.textContent = `Bs ${(kpis.ingresos_hoy || 0).toLocaleString()}`;
}

// Actualizar tabla de últimos ingresos
function updateUltimosIngresos(ingresos) {
    if (!ultimosIngresos) return;
    
    if (!ingresos || ingresos.length === 0) {
        ultimosIngresos.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: var(--gris-medio);">
                    No hay ingresos registrados hoy
                </td>
            </tr>
        `;
        return;
    }
    
    ultimosIngresos.innerHTML = ingresos.map(ingreso => {
        const estadoClass = {
            'EnRecepcion': '',
            'EnProceso': 'success',
            'EnPausa': 'warning',
            'Finalizado': 'success',
            'Entregado': 'success'
        }[ingreso.estado] || '';
        
        const estadoTexto = {
            'EnRecepcion': 'En recepción',
            'EnProceso': 'En proceso',
            'EnPausa': 'En pausa',
            'Finalizado': 'Finalizado',
            'Entregado': 'Entregado'
        }[ingreso.estado] || ingreso.estado;
        
        return `
            <tr>
                <td>${ingreso.hora || '--:--'}</td>
                <td><span class="plate-badge">${escapeHtml(ingreso.placa || '---')}</span></td>
                <td>${escapeHtml(ingreso.vehiculo || '---')}</td>
                <td>${escapeHtml(ingreso.cliente || '---')}</td>
                <td><span class="status-badge ${estadoClass}">${estadoTexto}</span></td>
                <td>
                    <button class="action-btn" onclick="verDetalles('${ingreso.placa}')" title="Ver detalles">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Actualizar notificaciones
function updateNotificaciones(notificaciones, total) {
    if (notificationBadge) {
        notificationBadge.textContent = total || 0;
    }
    
    if (!notificationsList) return;
    
    if (!notificaciones || notificaciones.length === 0) {
        notificationsList.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; color: var(--gris-medio);">
                No hay notificaciones nuevas
            </div>
        `;
        return;
    }
    
    notificationsList.innerHTML = notificaciones.map(notif => `
        <div class="notification-item ${notif.tipo || ''}">
            <div class="notification-icon">
                <i class="fas fa-${notif.icono || 'info-circle'}"></i>
            </div>
            <div class="notification-content">
                <p>${escapeHtml(notif.mensaje || '')}</p>
                <span class="notification-time">${notif.tiempo || ''}</span>
            </div>
            ${notif.badge ? `<span class="notification-badge urgent">${notif.badge}</span>` : ''}
        </div>
    `).join('');
}

// Actualizar gráfico
function updateChart(labels, data) {
    const ctx = document.getElementById('incomeChart')?.getContext('2d');
    if (!ctx) return;
    
    if (incomeChart) {
        incomeChart.destroy();
    }
    
    incomeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels || ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
            datasets: [{
                label: 'Ingresos (Bs)',
                data: data || [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#C1121F',
                backgroundColor: 'rgba(193, 18, 31, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#C1121F',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `Bs ${context.parsed.y.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { callback: (value) => `Bs ${value}` }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

// Escapar HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Funciones de acción
window.verDetalles = (placa) => {
    if (placa) {
        window.location.href = `detalle-vehiculo.html?placa=${placa}`;
    }
};

// =====================================================
// LOGOUT - CORREGIDO
// =====================================================
window.logout = () => {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    localStorage.removeItem('furia_selected_role');
    localStorage.removeItem('furia_selected_role_user');
    window.location.href = '/';
};

// =====================================================
// INICIALIZACIÓN PRINCIPAL
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando dashboard Jefe Operativo');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initDashboard();
    mostrarNombreUsuario();
    mostrarIndicadorRoles();
    await loadDashboardData();
    setupEventListeners();
    
    // Actualización cada 30 segundos
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadDashboardData();
        }
    }, 30000);
});

console.log('✅ dashboard.js de Jefe Operativo cargado correctamente');