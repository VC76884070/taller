// =====================================================
// MIS VEHÍCULOS - CLIENTE
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const vehiculosGrid = document.getElementById('vehiculosGrid');
const loadingContainer = document.getElementById('loadingContainer');
const emptyState = document.getElementById('emptyState');
const detalleModal = document.getElementById('detalleModal');
const detalleModalBody = document.getElementById('detalleModalBody');
const btnVerCotizacion = document.getElementById('btnVerCotizacion');

// Variables de estado
let vehiculosData = [];
let vehiculoSeleccionado = null;

// Mapeo de estados
const estadoConfig = {
    'recepcion': { texto: 'Recepción', color: '#2196F3' },
    'diagnostico': { texto: 'Diagnóstico', color: '#F59E0B' },
    'cotizacion': { texto: 'Cotización', color: '#2C3E50' },
    'reparacion': { texto: 'Reparación', color: '#C1121F' },
    'finalizado': { texto: 'Finalizado', color: '#10B981' }
};

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (autenticado) {
        initPage();
        await loadVehiculos();
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
    
    if (user.type !== 'client') {
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
    // Cerrar modal con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detalleModal.classList.contains('show')) {
            cerrarDetalleModal();
        }
    });
    
    // Cerrar modal haciendo clic fuera
    detalleModal.addEventListener('click', (e) => {
        if (e.target === detalleModal) {
            cerrarDetalleModal();
        }
    });
}

// =====================================================
// CARGAR VEHÍCULOS
// =====================================================
async function loadVehiculos() {
    try {
        mostrarLoading(true);
        
        // Simulación - Reemplazar con llamada real a la API
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        // Datos de ejemplo - Obtener del localStorage o API
        const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
        
        vehiculosData = generarVehiculosEjemplo(user);
        
        renderizarVehiculos();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarError('Error al cargar tus vehículos');
    } finally {
        mostrarLoading(false);
    }
}

// Generar vehículos de ejemplo
function generarVehiculosEjemplo(user) {
    // Datos de ejemplo para el cliente
    const vehiculosEjemplo = [
        {
            id: 1,
            marca: 'Toyota',
            modelo: 'Corolla',
            placa: 'ABC123',
            año: 2020,
            color: 'Gris',
            estado: 'reparacion',
            fechaIngreso: '2026-03-15T10:30:00',
            imagen: 'https://www.pngmart.com/files/22/Toyota-Corolla-PNG-Photo.png',
            diagnostico: 'Ruido en motor al acelerar. Se requiere revisión de bujías y limpieza de inyectores.',
            cotizacion: {
                total: 1250,
                items: [
                    { descripcion: 'Diagnóstico', precio: 200 },
                    { descripcion: 'Cambio de bujías', precio: 450 },
                    { descripcion: 'Limpieza de inyectores', precio: 600 }
                ]
            },
            timeline: [
                { estado: 'Recepción', fecha: '2026-03-15T10:30:00' },
                { estado: 'Diagnóstico', fecha: '2026-03-15T14:00:00' },
                { estado: 'Reparación', fecha: '2026-03-16T09:00:00' }
            ]
        },
        {
            id: 2,
            marca: 'Honda',
            modelo: 'Civic',
            placa: 'XYZ789',
            año: 2021,
            color: 'Blanco',
            estado: 'cotizacion',
            fechaIngreso: '2026-03-18T08:15:00',
            imagen: 'https://www.pngmart.com/files/22/Honda-Civic-PNG-Image.png',
            diagnostico: 'Vibración en frenos delanteros. Se recomienda cambio de pastillas y rectificado de discos.',
            cotizacion: {
                total: 980,
                items: [
                    { descripcion: 'Diagnóstico', precio: 200 },
                    { descripcion: 'Cambio pastillas freno', precio: 480 },
                    { descripcion: 'Rectificado discos', precio: 300 }
                ]
            },
            timeline: [
                { estado: 'Recepción', fecha: '2026-03-18T08:15:00' },
                { estado: 'Diagnóstico', fecha: '2026-03-18T11:30:00' }
            ]
        }
    ];
    
    return vehiculosEjemplo;
}

// Renderizar vehículos
function renderizarVehiculos() {
    if (vehiculosData.length === 0) {
        vehiculosGrid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    vehiculosGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    const estadoTexto = (estado) => estadoConfig[estado]?.texto || estado;
    const estadoClass = (estado) => {
        const map = {
            'recepcion': 'recepcion',
            'diagnostico': 'diagnostico',
            'cotizacion': 'cotizacion',
            'reparacion': 'reparacion',
            'finalizado': 'finalizado'
        };
        return map[estado] || 'recepcion';
    };
    
    const formatFecha = (fecha) => {
        const date = new Date(fecha);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };
    
    vehiculosGrid.innerHTML = vehiculosData.map(vehiculo => `
        <div class="vehiculo-card">
            <div class="vehiculo-imagen">
                <img src="${vehiculo.imagen}" alt="${vehiculo.marca} ${vehiculo.modelo}" 
                     onerror="this.src='https://placehold.co/400x300/e5e5e5/6B7280?text=${vehiculo.marca}'">
                <span class="estado-badge ${estadoClass(vehiculo.estado)}">
                    ${estadoTexto(vehiculo.estado)}
                </span>
            </div>
            <div class="vehiculo-info">
                <div class="vehiculo-titulo">
                    <h3>${vehiculo.marca} ${vehiculo.modelo}</h3>
                    <span class="vehiculo-placa">${vehiculo.placa}</span>
                </div>
                <div class="vehiculo-detalles">
                    <div class="detalle-item">
                        <i class="fas fa-calendar"></i>
                        <span>${vehiculo.año}</span>
                    </div>
                    <div class="detalle-item">
                        <i class="fas fa-palette"></i>
                        <span>${vehiculo.color}</span>
                    </div>
                </div>
                <div class="fecha-item">
                    <i class="fas fa-clock"></i>
                    <span>Ingreso: ${formatFecha(vehiculo.fechaIngreso)}</span>
                </div>
                <button class="btn-detalle" onclick="verDetalle(${vehiculo.id})">
                    <i class="fas fa-eye"></i>
                    Ver Detalle
                </button>
            </div>
        </div>
    `).join('');
}

// =====================================================
// DETALLE DEL VEHÍCULO
// =====================================================
window.verDetalle = (id) => {
    vehiculoSeleccionado = vehiculosData.find(v => v.id === id);
    
    if (!vehiculoSeleccionado) return;
    
    const formatFecha = (fecha) => {
        const date = new Date(fecha);
        return date.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };
    
    const estadoTexto = estadoConfig[vehiculoSeleccionado.estado]?.texto || vehiculoSeleccionado.estado;
    const estadoClass = (estado) => {
        const map = {
            'recepcion': '#2196F3',
            'diagnostico': '#F59E0B',
            'cotizacion': '#2C3E50',
            'reparacion': '#C1121F',
            'finalizado': '#10B981'
        };
        return map[estado] || '#6B7280';
    };
    
    const timelineHtml = vehiculoSeleccionado.timeline.map(item => `
        <div class="timeline-item">
            <div class="timeline-icon">
                <i class="fas fa-check"></i>
            </div>
            <div class="timeline-content">
                <div class="timeline-title">${item.estado}</div>
                <div class="timeline-date">${formatFecha(item.fecha)}</div>
            </div>
        </div>
    `).join('');
    
    detalleModalBody.innerHTML = `
        <div class="detalle-grid">
            <div>
                <div class="detalle-seccion">
                    <h4>Información del Vehículo</h4>
                    <p>${vehiculoSeleccionado.marca} ${vehiculoSeleccionado.modelo}</p>
                    <p class="small">Placa: ${vehiculoSeleccionado.placa}</p>
                    <p class="small">Año: ${vehiculoSeleccionado.año} | Color: ${vehiculoSeleccionado.color}</p>
                </div>
                <div class="detalle-seccion">
                    <h4>Estado Actual</h4>
                    <p style="color: ${estadoClass(vehiculoSeleccionado.estado)}; font-weight: 600;">
                        ${estadoTexto}
                    </p>
                </div>
                <div class="detalle-seccion">
                    <h4>Diagnóstico</h4>
                    <p>${vehiculoSeleccionado.diagnostico}</p>
                </div>
            </div>
            <div>
                <div class="detalle-seccion">
                    <h4>Línea de Tiempo</h4>
                    ${timelineHtml}
                </div>
            </div>
        </div>
    `;
    
    detalleModal.classList.add('show');
};

window.cerrarDetalleModal = () => {
    detalleModal.classList.remove('show');
    vehiculoSeleccionado = null;
};

window.verCotizacion = () => {
    if (vehiculoSeleccionado && vehiculoSeleccionado.cotizacion) {
        cerrarDetalleModal();
        mostrarNotificacion('Abriendo cotización...', 'info');
        setTimeout(() => {
            window.location.href = `cotizacion.html?id=${vehiculoSeleccionado.id}`;
        }, 500);
    } else {
        mostrarNotificacion('Cotización no disponible', 'warning');
    }
};

// =====================================================
// AGREGAR VEHÍCULO
// =====================================================
window.agregarVehiculo = () => {
    mostrarNotificacion('Función disponible próximamente', 'info');
};

// =====================================================
// UTILIDADES
// =====================================================
function mostrarLoading(show) {
    if (show) {
        loadingContainer.style.display = 'block';
        vehiculosGrid.style.display = 'none';
        emptyState.style.display = 'none';
    } else {
        loadingContainer.style.display = 'none';
    }
}

function mostrarError(mensaje) {
    vehiculosGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
            <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--rojo-primario); margin-bottom: 1rem;"></i>
            <p style="color: var(--gris-medio);">${mensaje}</p>
            <button onclick="location.reload()" class="btn-agregar" style="margin-top: 1rem;">
                <i class="fas fa-sync-alt"></i> Reintentar
            </button>
        </div>
    `;
    vehiculosGrid.style.display = 'grid';
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