// =====================================================
// DASHBOARD ENCARGADO DE REPUESTOS
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const totalRepuestos = document.getElementById('totalRepuestos');
const stockBajo = document.getElementById('stockBajo');
const comprasMes = document.getElementById('comprasMes');
const proveedoresActivos = document.getElementById('proveedoresActivos');
const alertasList = document.getElementById('alertasList');
const comprasList = document.getElementById('comprasList');
const criticosList = document.getElementById('criticosList');
const alertasCount = document.getElementById('alertasCount');
const criticosCount = document.getElementById('criticosCount');

// Variables para gráficos
let categoriasChart = null;

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
    
    const rolesValidos = ['encargado_repuestos', 'encargado_rep_almacen'];
    if (!rolesValidos.includes(user.rol)) {
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
    // Aquí puedes agregar más event listeners
}

// =====================================================
// CARGAR DATOS
// =====================================================
async function loadDashboardData() {
    try {
        // Simulación - Reemplazar con llamada real a la API
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        // Datos de ejemplo
        const data = generarDatosEjemplo();
        
        actualizarKPIs(data);
        renderizarAlertas(data.alertas);
        renderizarCompras(data.compras);
        renderizarCriticos(data.criticos);
        renderizarGrafico(data.categorias);
        
        // Actualizar badge de stock bajo en sidebar
        localStorage.setItem('stock_bajo_count', data.alertas.length.toString());
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al cargar datos del dashboard', 'error');
    }
}

// Generar datos de ejemplo
function generarDatosEjemplo() {
    return {
        kpis: {
            totalRepuestos: 1284,
            stockBajo: 23,
            comprasMes: 12450,
            proveedoresActivos: 8
        },
        alertas: [
            {
                id: 1,
                titulo: 'Filtros de aceite',
                descripcion: 'Stock crítico - Solo 2 unidades',
                cantidad: 2,
                unidad: 'uds'
            },
            {
                id: 2,
                titulo: 'Pastillas de freno delanteras',
                descripcion: 'Stock bajo - 5 unidades',
                cantidad: 5,
                unidad: 'uds'
            },
            {
                id: 3,
                titulo: 'Bujías NGK',
                descripcion: 'Agotándose rápidamente - 8 unidades',
                cantidad: 8,
                unidad: 'uds'
            }
        ],
        compras: [
            {
                id: 1,
                proveedor: 'Autorepuestos López',
                fecha: 'Hoy',
                items: 12,
                monto: 2450
            },
            {
                id: 2,
                proveedor: 'Distribuidora Gómez',
                fecha: 'Ayer',
                items: 8,
                monto: 1890
            },
            {
                id: 3,
                proveedor: 'Importadora Vargas',
                fecha: 'Hace 2 días',
                items: 15,
                monto: 3200
            }
        ],
        criticos: [
            {
                id: 1,
                nombre: 'Filtro de aceite',
                codigo: 'FA-001',
                stock: 2,
                minimo: 10
            },
            {
                id: 2,
                nombre: 'Pastilla freno delantera',
                codigo: 'PF-023',
                stock: 4,
                minimo: 15
            },
            {
                id: 3,
                nombre: 'Bujía NGK',
                codigo: 'BJ-112',
                stock: 5,
                minimo: 20
            },
            {
                id: 4,
                nombre: 'Correa de distribución',
                codigo: 'CD-045',
                stock: 1,
                minimo: 8
            },
            {
                id: 5,
                nombre: 'Amortiguador delantero',
                codigo: 'AD-078',
                stock: 3,
                minimo: 12
            }
        ],
        categorias: {
            labels: ['Filtros', 'Frenos', 'Motor', 'Eléctrico', 'Suspensión', 'Transmisión'],
            data: [320, 280, 240, 180, 150, 114]
        }
    };
}

// Actualizar KPIs
function actualizarKPIs(data) {
    totalRepuestos.textContent = data.kpis.totalRepuestos.toLocaleString();
    stockBajo.textContent = data.kpis.stockBajo;
    comprasMes.textContent = `Bs. ${data.kpis.comprasMes.toLocaleString()}`;
    proveedoresActivos.textContent = data.kpis.proveedoresActivos;
}

// Renderizar alertas
function renderizarAlertas(alertas) {
    alertasCount.textContent = alertas.length;
    
    alertasList.innerHTML = alertas.map(alerta => `
        <div class="alerta-item">
            <div class="alerta-icon">
                <i class="fas fa-exclamation"></i>
            </div>
            <div class="alerta-content">
                <div class="alerta-titulo">${alerta.titulo}</div>
                <div class="alerta-desc">${alerta.descripcion}</div>
            </div>
            <div class="alerta-meta">
                <div class="alerta-cantidad">${alerta.cantidad}</div>
                <div class="alerta-unidad">${alerta.unidad}</div>
            </div>
        </div>
    `).join('');
}

// Renderizar compras recientes
function renderizarCompras(compras) {
    comprasList.innerHTML = compras.map(compra => `
        <div class="compra-item">
            <div class="compra-icon">
                <i class="fas fa-receipt"></i>
            </div>
            <div class="compra-content">
                <div class="compra-proveedor">${compra.proveedor}</div>
                <div class="compra-info">
                    <span><i class="far fa-clock"></i> ${compra.fecha}</span>
                    <span><i class="fas fa-boxes"></i> ${compra.items} items</span>
                </div>
            </div>
            <div class="compra-monto">Bs. ${compra.monto.toLocaleString()}</div>
        </div>
    `).join('');
}

// Renderizar repuestos críticos
function renderizarCriticos(criticos) {
    criticosCount.textContent = criticos.length;
    
    criticosList.innerHTML = criticos.map(critico => `
        <div class="critico-item">
            <div class="critico-info">
                <h4>${critico.nombre}</h4>
                <p>${critico.codigo} | Mínimo: ${critico.minimo}</p>
            </div>
            <div class="critico-stock">
                <span>${critico.stock}</span>
                <small>uds</small>
            </div>
        </div>
    `).join('');
}

// Renderizar gráfico circular
function renderizarGrafico(categorias) {
    const ctx = document.getElementById('categoriasChart').getContext('2d');
    
    // Colores para el gráfico
    const colores = [
        '#C1121F', '#2C3E50', '#1E3A5F', '#10B981', '#F59E0B', '#6B7280'
    ];
    
    // Destruir gráfico anterior si existe
    if (categoriasChart) {
        categoriasChart.destroy();
    }
    
    categoriasChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categorias.labels,
            datasets: [{
                data: categorias.data,
                backgroundColor: colores,
                borderWidth: 0,
                borderRadius: 4,
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        font: {
                            size: 11,
                            family: 'Plus Jakarta Sans'
                        },
                        color: '#2C3E50'
                    }
                },
                tooltip: {
                    backgroundColor: '#0F0F10',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${context.raw} unidades (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// =====================================================
// NOTIFICACIONES
// =====================================================
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
        localStorage.removeItem('stock_bajo_count');
        window.location.href = '../../login.html';
    }
};