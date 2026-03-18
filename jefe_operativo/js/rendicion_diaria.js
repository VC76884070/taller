// =====================================================
// RENDICIÓN DIARIA - JEFE OPERATIVO
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';
let ingresosChart = null;

// Elementos DOM
const fechaSelector = document.getElementById('fechaSelector');
const totalIngresosEl = document.getElementById('totalIngresos');
const totalDiagnosticosEl = document.getElementById('totalDiagnosticos');
const entregadoAdminEl = document.getElementById('entregadoAdmin');
const ordenesTableBody = document.getElementById('ordenesTableBody');
const totalOrdenesEl = document.getElementById('totalOrdenes');

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initPage();
    await loadRendicionDiaria();
    setupEventListeners();
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

// Inicializar página
function initPage() {
    // Setear fecha actual en el selector
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    fechaSelector.value = `${año}-${mes}-${dia}`;
}

// Configurar event listeners
function setupEventListeners() {
    fechaSelector.addEventListener('change', () => {
        loadRendicionDiaria();
    });
}

// =====================================================
// CARGAR DATOS DESDE API
// =====================================================
async function loadRendicionDiaria() {
    try {
        showLoading();
        
        const fecha = fechaSelector.value;
        const response = await fetch(`${API_URL}/jefe-operativo/rendicion-diaria?fecha=${fecha}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Error al cargar datos');
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateUI(result.data);
        } else {
            showError('Error al cargar los datos');
        }
        
    } catch (error) {
        console.error('Error:', error);
        cargarDatosEjemplo();
    }
}

// Datos de ejemplo para desarrollo
function cargarDatosEjemplo() {
    const data = {
        resumen: {
            total_ingresos: 4850,
            total_diagnosticos: 600,
            entregado_admin: 4607.5
        },
        ordenes: [
            {
                id: 1,
                codigo: 'OT-240318-001',
                hora: '09:30',
                cliente: 'Juan Pérez',
                vehiculo: 'Toyota Corolla',
                placa: 'ABC123',
                servicios: ['Cambio de aceite', 'Filtros'],
                monto: 450
            },
            {
                id: 2,
                codigo: 'OT-240318-002',
                hora: '10:15',
                cliente: 'María López',
                vehiculo: 'Honda Civic',
                placa: 'XYZ789',
                servicios: ['Diagnóstico'],
                monto: 200
            },
            {
                id: 3,
                codigo: 'OT-240318-003',
                hora: '11:45',
                cliente: 'Carlos Ruiz',
                vehiculo: 'Chevrolet Spark',
                placa: 'JKL012',
                servicios: ['Alineación', 'Balanceo'],
                monto: 350
            },
            {
                id: 4,
                codigo: 'OT-240318-004',
                hora: '14:20',
                cliente: 'Ana Flores',
                vehiculo: 'Nissan Versa',
                placa: 'GHI789',
                servicios: ['Frenos (pastillas)', 'Líquido'],
                monto: 650
            },
            {
                id: 5,
                codigo: 'OT-240318-005',
                hora: '16:00',
                cliente: 'Roberto Méndez',
                vehiculo: 'Suzuki Swift',
                placa: 'DEF456',
                servicios: ['Batería nueva', 'Diagnóstico'],
                monto: 750
            }
        ],
        grafico: {
            dias: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
            ingresos: [1200, 1800, 1500, 2100, 1900, 2800, 1650]
        }
    };
    
    updateUI(data);
}

// Actualizar UI con datos
function updateUI(data) {
    // Actualizar resumen
    totalIngresosEl.textContent = `Bs. ${data.resumen.total_ingresos.toFixed(2)}`;
    totalDiagnosticosEl.textContent = `Bs. ${data.resumen.total_diagnosticos.toFixed(2)}`;
    entregadoAdminEl.textContent = `Bs. ${data.resumen.entregado_admin.toFixed(2)}`;
    
    // Actualizar tabla
    renderTabla(data.ordenes);
    
    // Actualizar gráfico
    renderGrafico(data.grafico);
}

// Renderizar tabla
function renderTabla(ordenes) {
    if (!ordenesTableBody) return;
    
    // Actualizar contador
    if (totalOrdenesEl) {
        totalOrdenesEl.textContent = `${ordenes.length} órdenes`;
    }
    
    if (ordenes.length === 0) {
        ordenesTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <div class="empty-content">
                        <i class="fas fa-receipt"></i>
                        <p>No hay entregas registradas para este día</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    ordenesTableBody.innerHTML = ordenes.map(orden => {
        // Formatear servicios
        const serviciosHtml = orden.servicios && orden.servicios.length > 0 
            ? `<div class="servicios-list">
                ${orden.servicios.map(s => `<span class="servicio-tag">${s}</span>`).join('')}
               </div>`
            : '<span class="servicio-tag">Sin servicios</span>';
        
        return `
            <tr>
                <td><strong>${orden.hora}</strong></td>
                <td>${orden.codigo}</td>
                <td>${orden.cliente}</td>
                <td>${orden.vehiculo}</td>
                <td><span class="plate-badge">${orden.placa}</span></td>
                <td>${serviciosHtml}</td>
                <td class="monto-cell"><strong>Bs. ${orden.monto.toFixed(2)}</strong></td>
            </tr>
        `;
    }).join('');
}

// Renderizar gráfico
function renderGrafico(data) {
    const ctx = document.getElementById('ingresosChart');
    if (!ctx) return;
    
    // Destruir gráfico anterior si existe
    if (ingresosChart) {
        ingresosChart.destroy();
    }
    
    ingresosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.dias,
            datasets: [{
                label: 'Ingresos (Bs.)',
                data: data.ingresos,
                backgroundColor: 'rgba(193, 18, 31, 0.8)',
                borderRadius: 6,
                barPercentage: 0.6,
                categoryPercentage: 0.8
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
                        label: function(context) {
                            return `Bs. ${context.raw.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        callback: function(value) {
                            return 'Bs. ' + value;
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

// =====================================================
// ACCIONES
// =====================================================
window.generarReporteDiario = async () => {
    try {
        showLoading(true);
        
        const fecha = fechaSelector.value;
        const response = await fetch(`${API_URL}/jefe-operativo/generar-reporte-diario`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({ fecha })
        });
        
        if (!response.ok) {
            throw new Error('Error al generar reporte');
        }
        
        const result = await response.json();
        
        if (result.success) {
            mostrarNotificacion('Reporte generado correctamente', 'success');
            
            // Simular descarga de PDF
            setTimeout(() => {
                mostrarNotificacion('Descargando reporte...', 'info');
            }, 500);
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al generar reporte', 'error');
    } finally {
        showLoading(false);
    }
};

// =====================================================
// UTILIDADES
// =====================================================
function showLoading(show = false) {
    // Implementar si se desea un loading
}

function showError(message) {
    mostrarNotificacion(message, 'error');
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    // Reutilizar la misma función de notificaciones de control_salida.js
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
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#2C3E50'};
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
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};