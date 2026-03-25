// =====================================================
// DASHBOARD ADMINISTRADOR GENERAL
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const ingresosMes = document.getElementById('ingresosMes');
const egresosMes = document.getElementById('egresosMes');
const gananciaNeta = document.getElementById('gananciaNeta');
const ordenesActivas = document.getElementById('ordenesActivas');
const indicadoresGrid = document.getElementById('indicadoresGrid');
const alertasList = document.getElementById('alertasList');
const rendicionesList = document.getElementById('rendicionesList');
const kpisOperativos = document.getElementById('kpisOperativos');
const alertasCriticasCount = document.getElementById('alertasCriticasCount');
const periodBtns = document.querySelectorAll('.period-btn');

// Variables para gráficos
let ingresosEgresosChart = null;
let periodoActual = 'mes';

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (autenticado) {
        initPage();
        await loadDashboardData();
        setupEventListeners();
    }
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token) {
        window.location.href = '../../login.html';
        return false;
    }
    
    if (user.rol !== 'admin_general') {
        window.location.href = '../../login.html';
        return false;
    }
    
    return true;
}

// Inicializar página
function initPage() {
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
    periodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            periodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            periodoActual = btn.dataset.period;
            loadDashboardData();
        });
    });
}

// =====================================================
// CARGAR DATOS
// =====================================================
async function loadDashboardData() {
    try {
        mostrarLoading();
        
        // Simulación - Reemplazar con llamada real a la API
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        const data = generarDatosEjemplo(periodoActual);
        
        actualizarKPIs(data);
        renderizarGrafico(data.grafico);
        renderizarIndicadores(data.indicadores);
        renderizarAlertas(data.alertas);
        renderizarRendiciones(data.rendiciones);
        renderizarKPIsOperativos(data.kpisOperativos);
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al cargar datos del dashboard', 'error');
    }
}

// Generar datos de ejemplo según período
function generarDatosEjemplo(periodo) {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    let ingresosData, egresosData;
    
    if (periodo === 'mes') {
        ingresosData = [12000, 14500, 15800, 16200, 15800, 16500, 17200];
        egresosData = [7200, 8100, 8500, 8900, 8700, 9200, 9600];
    } else if (periodo === 'trimestre') {
        ingresosData = [45000, 48500, 52000];
        egresosData = [26000, 27500, 29500];
    } else {
        ingresosData = [145000, 158000, 162000, 168000, 172000, 185000, 192000, 198000, 205000, 212000, 218000, 225000];
        egresosData = [85000, 92000, 95000, 98000, 101000, 108000, 112000, 115000, 118000, 122000, 125000, 128000];
    }
    
    const totalIngresos = ingresosData.reduce((a, b) => a + b, 0);
    const totalEgresos = egresosData.reduce((a, b) => a + b, 0);
    const ganancia = totalIngresos - totalEgresos;
    
    return {
        kpis: {
            ingresos: totalIngresos,
            egresos: totalEgresos,
            ganancia: ganancia,
            ordenesActivas: 24
        },
        grafico: {
            labels: periodo === 'trimestre' ? ['Trim 1', 'Trim 2', 'Trim 3'] : 
                    periodo === 'mes' ? ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'] : meses,
            ingresos: ingresosData,
            egresos: egresosData
        },
        indicadores: [
            { label: 'Ticket promedio', valor: 'Bs. 2,850', trend: '+8%', positive: true },
            { label: 'Tiempo promedio reparación', valor: '3.2 días', trend: '-12%', positive: true },
            { label: 'Satisfacción cliente', valor: '4.8/5', trend: '+5%', positive: true },
            { label: 'Rotación inventario', valor: '2.4x', trend: '+15%', positive: true }
        ],
        alertas: [
            { titulo: 'Stock crítico', descripcion: 'Pastillas de freno - Solo 2 unidades', meta: 'Urgente' },
            { titulo: 'Rendición pendiente', descripcion: 'Encargado de repuestos no rindió ayer', meta: 'Hace 1 día' },
            { titulo: 'Orden en pausa > 48h', descripcion: 'OT-240318-045 esperando repuestos', meta: 'Crítico' },
            { titulo: 'Presupuesto excedido', descripcion: 'Compras del mes superan presupuesto', meta: 'Alerta' }
        ],
        rendiciones: [
            { usuario: 'Roberto Vargas', fecha: 'Ayer', monto: 12450, items: 23 },
            { usuario: 'María González', fecha: 'Ayer', monto: 15800, items: 31 },
            { usuario: 'Carlos Rodríguez', fecha: 'Hace 2 días', monto: 8900, items: 15 }
        ],
        kpisOperativos: [
            { label: 'Productividad taller', valor: '78%', objetivo: '85%' },
            { label: 'Uso de bahías', valor: '72%', objetivo: '80%' },
            { label: 'Eficiencia técnica', valor: '82%', objetivo: '85%' },
            { label: 'Cumplimiento entregas', valor: '91%', objetivo: '95%' }
        ]
    };
}

// Actualizar KPIs
function actualizarKPIs(data) {
    ingresosMes.textContent = `Bs. ${data.kpis.ingresos.toLocaleString()}`;
    egresosMes.textContent = `Bs. ${data.kpis.egresos.toLocaleString()}`;
    gananciaNeta.textContent = `Bs. ${data.kpis.ganancia.toLocaleString()}`;
    ordenesActivas.textContent = data.kpis.ordenesActivas;
}

// Renderizar gráfico de ingresos vs egresos
function renderizarGrafico(data) {
    const ctx = document.getElementById('ingresosEgresosChart').getContext('2d');
    
    if (ingresosEgresosChart) {
        ingresosEgresosChart.destroy();
    }
    
    ingresosEgresosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Ingresos',
                    data: data.ingresos,
                    backgroundColor: 'rgba(33, 150, 243, 0.8)',
                    borderRadius: 6,
                    barPercentage: 0.6
                },
                {
                    label: 'Egresos',
                    data: data.egresos,
                    backgroundColor: 'rgba(255, 152, 0, 0.8)',
                    borderRadius: 6,
                    barPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Bs. ${context.raw.toLocaleString()}`;
                        }
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        callback: function(value) {
                            return 'Bs. ' + value.toLocaleString();
                        }
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

// Renderizar indicadores de rendimiento
function renderizarIndicadores(indicadores) {
    indicadoresGrid.innerHTML = indicadores.map(ind => `
        <div class="indicador-item">
            <span class="indicador-label">${ind.label}</span>
            <span class="indicador-valor">${ind.valor}</span>
            <span class="indicador-trend ${ind.positive ? 'positive' : 'negative'}">
                <i class="fas fa-arrow-${ind.positive ? 'up' : 'down'}"></i>
                ${ind.trend}
            </span>
        </div>
    `).join('');
}

// Renderizar alertas críticas
function renderizarAlertas(alertas) {
    alertasCriticasCount.textContent = alertas.length;
    
    alertasList.innerHTML = alertas.map(alerta => `
        <div class="alerta-item">
            <div class="alerta-icon">
                <i class="fas fa-exclamation"></i>
            </div>
            <div class="alerta-content">
                <div class="alerta-titulo">${alerta.titulo}</div>
                <div class="alerta-desc">${alerta.descripcion}</div>
            </div>
            <div class="alerta-meta">${alerta.meta}</div>
        </div>
    `).join('');
}

// Renderizar rendiciones pendientes
function renderizarRendiciones(rendiciones) {
    rendicionesList.innerHTML = rendiciones.map(rend => `
        <div class="rendicion-item">
            <div class="rendicion-icon">
                <i class="fas fa-user"></i>
            </div>
            <div class="rendicion-content">
                <div class="rendicion-usuario">${rend.usuario}</div>
                <div class="rendicion-info">
                    <span>${rend.fecha}</span>
                    <span>${rend.items} items</span>
                </div>
            </div>
            <div class="rendicion-monto">Bs. ${rend.monto.toLocaleString()}</div>
        </div>
    `).join('');
}

// Renderizar KPIs operativos
function renderizarKPIsOperativos(kpis) {
    kpisOperativos.innerHTML = kpis.map(kpi => {
        const porcentaje = parseInt(kpi.valor);
        return `
            <div class="kpi-operativo-item">
                <div class="kpi-operativo-info">
                    <div class="kpi-operativo-header">
                        <span>${kpi.label}</span>
                        <span>${kpi.valor} / ${kpi.objetivo}</span>
                    </div>
                    <div class="kpi-operativo-bar">
                        <div class="kpi-operativo-fill" style="width: ${porcentaje}%;"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// UTILIDADES
// =====================================================
function mostrarLoading() {
    // Opcional: mostrar un indicador de carga
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${iconos[tipo] || iconos.info}"></i>
        <span>${mensaje}</span>
    `;
    
    toast.style.cssText = `
        background: white;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        animation: slideIn 0.3s ease;
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#2196F3'};
        min-width: 300px;
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// =====================================================
// LOGOUT
// =====================================================
window.logout = () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        window.location.href = '../../login.html';
    }
};