// Configuración
const API_URL = 'http://localhost:5000/api';

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

// Variable para el gráfico
let incomeChart = null;

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initDashboard();
    await loadDashboardData();
    setupEventListeners();
    
    // Actualización cada 30 segundos
    setInterval(() => {
        console.log('Actualizando datos...');
        loadDashboardData();
    }, 30000);
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || user.rol !== 'jefe_operativo') {
        window.location.href = '/';
        return false;
    }
    
    return true;
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
                
                // Quitar active de todos
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Activar item actual
                link.closest('.nav-item').classList.add('active');
                
                // Navegar a la página
                window.location.href = href;
            }
        });
    });

    // Notificaciones
    document.querySelector('.notification-icon')?.addEventListener('click', () => {
        console.log('Abrir notificaciones');
        // Aquí puedes implementar un dropdown o modal de notificaciones
    });
}

// Cargar datos del dashboard
async function loadDashboardData() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/dashboard`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar datos');
        }
        
        const data = result.data;
        
        // Actualizar nombre de usuario
        if (userName) userName.textContent = data.usuario.nombre;
        if (welcomeName) welcomeName.textContent = data.usuario.nombre.split(' ')[0];
        
        // Actualizar KPIs
        updateKPIs(data.kpis);
        
        // Actualizar tabla de últimos ingresos
        updateUltimosIngresos(data.ultimos_ingresos);
        
        // Actualizar notificaciones
        updateNotificaciones(data.notificaciones, data.total_notificaciones);
        
        // Actualizar gráfico
        updateChart(data.grafico.fechas, data.grafico.ingresos);
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        
        // Mostrar error en UI pero no cargar datos de prueba
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
        
        // Eliminar después de 5 segundos
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
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
                <td><span class="plate-badge">${ingreso.placa || '---'}</span></td>
                <td>${ingreso.vehiculo || '---'}</td>
                <td>${ingreso.cliente || '---'}</td>
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
    // Actualizar contador
    if (notificationBadge) {
        notificationBadge.textContent = total || 0;
    }
    
    // Actualizar lista
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
                <p>${notif.mensaje || ''}</p>
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
    
    // Destruir gráfico anterior si existe
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
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `Bs ${context.parsed.y.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        callback: (value) => `Bs ${value}`
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Funciones de acción
window.verDetalles = (placa) => {
    if (!placa) return;
    console.log('Ver detalles:', placa);
    // Redirigir a la página de detalles
    window.location.href = `detalle-vehiculo.html?placa=${placa}`;
};

window.logout = () => {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};