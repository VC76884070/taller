// =====================================================
// DASHBOARD JEFE DE TALLER
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const ordenesActivas = document.getElementById('ordenesActivas');
const ordenesPausa = document.getElementById('ordenesPausa');
const tecnicosActivos = document.getElementById('tecnicosActivos');
const bahiasOcupadas = document.getElementById('bahiasOcupadas');
const bahiasGrid = document.getElementById('bahiasGrid');
const diagnosticosList = document.getElementById('diagnosticosList');
const entregasList = document.getElementById('entregasList');
const pendientesCount = document.getElementById('pendientesCount');
const semanaActualSpan = document.getElementById('semanaActual');

// Variables de estado
let semanaActual = new Date();
let dashboardData = {};

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initPage();
    await loadDashboardData();
    setupEventListeners();
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || user.rol !== 'jefe_taller') {
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
    // Aquí puedes agregar más event listeners si es necesario
}

// =====================================================
// CARGAR DATOS
// =====================================================
async function loadDashboardData() {
    try {
        // Simulación - Reemplazar con llamada real a la API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Datos de ejemplo
        dashboardData = {
            kpis: {
                ordenesActivas: 24,
                ordenesPausa: 6,
                tecnicosActivos: 8,
                bahiasOcupadas: 9
            },
            bahias: generarBahias(),
            diagnosticos: generarDiagnosticos(),
            entregas: generarEntregas()
        };
        
        actualizarUI();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al cargar datos', 'error');
    }
}

// Generar datos de bahías
function generarBahias() {
    const bahias = [];
    const estados = ['ocupada', 'pausa', 'libre'];
    const tecnicos = ['Luis M.', 'Carlos R.', 'Juan P.', 'María G.', 'Pedro S.', 'Ana L.', 'Roberto C.', 'Sofia M.'];
    
    for (let i = 1; i <= 12; i++) {
        const random = Math.random();
        let estado;
        
        if (random < 0.5) {
            estado = 'ocupada';
        } else if (random < 0.7) {
            estado = 'pausa';
        } else {
            estado = 'libre';
        }
        
        bahias.push({
            numero: i,
            estado: estado,
            tecnico: estado !== 'libre' ? tecnicos[Math.floor(Math.random() * tecnicos.length)] : null,
            orden: estado !== 'libre' ? `OT-2403-${String(i).padStart(3, '0')}` : null
        });
    }
    
    return bahias;
}

// Generar diagnósticos pendientes
function generarDiagnosticos() {
    const diagnosticos = [
        {
            id: 1,
            vehiculo: 'Toyota Corolla',
            placa: 'ABC123',
            tecnico: 'Luis Mamani',
            tiempo: 'Hace 15 min',
            descripcion: 'Ruido en motor al acelerar'
        },
        {
            id: 2,
            vehiculo: 'Honda Civic',
            placa: 'XYZ789',
            tecnico: 'Carlos Rodríguez',
            tiempo: 'Hace 32 min',
            descripcion: 'Vibración en frenos'
        },
        {
            id: 3,
            vehiculo: 'Chevrolet Spark',
            placa: 'JKL012',
            tecnico: 'Juan Pérez',
            tiempo: 'Hace 1h 10m',
            descripcion: 'Falla en sistema eléctrico'
        }
    ];
    
    return diagnosticos;
}

// Generar próximas entregas
function generarEntregas() {
    const entregas = [
        {
            id: 1,
            vehiculo: 'Nissan Versa',
            placa: 'GHI789',
            cliente: 'Ana Flores',
            hora: '14:30'
        },
        {
            id: 2,
            vehiculo: 'Suzuki Swift',
            placa: 'DEF456',
            cliente: 'Roberto Méndez',
            hora: '16:00'
        },
        {
            id: 3,
            vehiculo: 'Ford Fiesta',
            placa: 'MNO345',
            cliente: 'Laura Sánchez',
            hora: '17:30'
        }
    ];
    
    return entregas;
}

// =====================================================
// ACTUALIZAR UI
// =====================================================
function actualizarUI() {
    // Actualizar KPIs
    ordenesActivas.textContent = dashboardData.kpis.ordenesActivas;
    ordenesPausa.textContent = dashboardData.kpis.ordenesPausa;
    tecnicosActivos.textContent = dashboardData.kpis.tecnicosActivos;
    bahiasOcupadas.textContent = dashboardData.kpis.bahiasOcupadas;
    
    // Actualizar bahías
    renderizarBahias();
    
    // Actualizar diagnósticos
    renderizarDiagnosticos();
    
    // Actualizar entregas
    renderizarEntregas();
    
    // Actualizar calendario
    renderizarCalendario();
}

// Renderizar bahías
function renderizarBahias() {
    const estadosTexto = {
        'ocupada': 'Ocupada',
        'pausa': 'En Pausa',
        'libre': 'Libre'
    };
    
    bahiasGrid.innerHTML = dashboardData.bahias.map(bahia => `
        <div class="bahia-item ${bahia.estado}" onclick="verDetalleBahia(${bahia.numero})">
            <div class="bahia-numero">Bahía ${bahia.numero}</div>
            <div class="bahia-estado">${estadosTexto[bahia.estado]}</div>
            ${bahia.tecnico ? `<div class="bahia-tecnico">${bahia.tecnico}</div>` : ''}
        </div>
    `).join('');
}

// Renderizar diagnósticos
function renderizarDiagnosticos() {
    if (dashboardData.diagnosticos.length === 0) {
        diagnosticosList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--gris-500);">
                <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>No hay diagnósticos pendientes</p>
            </div>
        `;
        pendientesCount.textContent = '0';
        return;
    }
    
    pendientesCount.textContent = dashboardData.diagnosticos.length;
    
    diagnosticosList.innerHTML = dashboardData.diagnosticos.map(diag => `
        <div class="diagnostico-item">
            <div class="diagnostico-icon">
                <i class="fas fa-stethoscope"></i>
            </div>
            <div class="diagnostico-content">
                <h4>${diag.vehiculo} (${diag.placa})</h4>
                <p>${diag.descripcion}</p>
            </div>
            <div class="diagnostico-meta">
                <span class="diagnostico-tecnico">${diag.tecnico}</span>
                <span class="diagnostico-time">${diag.tiempo}</span>
                <button class="btn-revisar" onclick="revisarDiagnostico(${diag.id})">
                    Revisar
                </button>
            </div>
        </div>
    `).join('');
}

// Renderizar entregas
function renderizarEntregas() {
    if (dashboardData.entregas.length === 0) {
        entregasList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--gris-500);">
                <i class="fas fa-clock" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>No hay entregas programadas</p>
            </div>
        `;
        return;
    }
    
    entregasList.innerHTML = dashboardData.entregas.map(entrega => `
        <div class="entrega-item">
            <div class="entrega-icon">
                <i class="fas fa-car"></i>
            </div>
            <div class="entrega-content">
                <h4>${entrega.vehiculo} (${entrega.placa})</h4>
                <p>Cliente: ${entrega.cliente}</p>
            </div>
            <div class="entrega-meta">
                <span class="diagnostico-time">${entrega.hora}</span>
                <button class="btn-ver" onclick="verEntrega(${entrega.id})">
                    Ver
                </button>
            </div>
        </div>
    `).join('');
}

// Renderizar calendario
function renderizarCalendario() {
    const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const fechaInicio = new Date(semanaActual);
    fechaInicio.setDate(fechaInicio.getDate() - fechaInicio.getDay() + 1);
    
    const calendario = document.getElementById('calendarioMini');
    let html = '';
    
    for (let i = 0; i < 7; i++) {
        const fecha = new Date(fechaInicio);
        fecha.setDate(fechaInicio.getDate() + i);
        
        const hoy = new Date();
        const esHoy = fecha.toDateString() === hoy.toDateString();
        const tieneOrden = Math.random() > 0.5; // Simulación
        
        html += `
            <div class="calendario-dia ${esHoy ? 'today' : ''} ${tieneOrden ? 'has-orden' : ''}">
                <span class="dia-nombre">${diasSemana[i]}</span>
                <span class="dia-numero">${fecha.getDate()}</span>
            </div>
        `;
    }
    
    calendario.innerHTML = html;
    
    // Actualizar texto de semana
    const options = { month: 'short', day: 'numeric' };
    const inicioStr = fechaInicio.toLocaleDateString('es-ES', options);
    const fin = new Date(fechaInicio);
    fin.setDate(fin.getDate() + 6);
    const finStr = fin.toLocaleDateString('es-ES', options);
    semanaActualSpan.textContent = `${inicioStr} - ${finStr}`;
}

// =====================================================
// FUNCIONES DE NAVEGACIÓN
// =====================================================
window.verDetalleBahia = (numero) => {
    mostrarNotificacion(`Viendo detalle de Bahía ${numero}`, 'info');
    // Aquí iría la navegación a la página de detalle
};

window.revisarDiagnostico = (id) => {
    mostrarNotificacion(`Revisando diagnóstico #${id}`, 'info');
    // Aquí iría la navegación a la página de diagnóstico
};

window.verEntrega = (id) => {
    mostrarNotificacion(`Viendo detalle de entrega #${id}`, 'info');
    // Aquí iría la navegación a la página de entrega
};

// =====================================================
// CALENDARIO
// =====================================================
window.cambiarSemana = (direccion) => {
    if (direccion === 'anterior') {
        semanaActual.setDate(semanaActual.getDate() - 7);
    } else {
        semanaActual.setDate(semanaActual.getDate() + 7);
    }
    renderizarCalendario();
};

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
        border-left: 4px solid ${tipo === 'success' ? '#4CAF50' : tipo === 'error' ? '#E53935' : tipo === 'warning' ? '#FF9800' : '#2196F3'};
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
    window.location.href = '../../login.html';
};