// =====================================================
// MIS VEHÍCULOS - TÉCNICO MECÁNICO (CORREGIDO)
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const vehiculosGrid = document.getElementById('vehiculosGrid');
const loadingContainer = document.getElementById('loadingContainer');
const emptyState = document.getElementById('emptyState');
const notificacionesBadge = document.getElementById('notificacionesBadge');
const limitIndicator = document.getElementById('limitIndicator');

// Modal
const entrarModal = document.getElementById('entrarModal');
const modalMessage = document.getElementById('modalMessage');
const modalInfo = document.getElementById('modalInfo');
const confirmarEntrarBtn = document.getElementById('confirmarEntrarBtn');

// Variables de estado
let vehiculosActivos = [];
let vehiculoSeleccionado = null;

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

// Verificar autenticación (CORREGIDO)
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    console.log('Verificando autenticación:', { token: !!token, user });
    
    // Si no hay token, redirigir al login
    if (!token) {
        console.warn('No hay token, redirigiendo a login');
        window.location.href = '../../login.html';
        return false;
    }
    
    // Verificar que el rol sea 'tecnico' (en tu base de datos puede ser 'tecnico_mecanico')
    if (user.rol !== 'tecnico' && user.rol !== 'tecnico_mecanico') {
        console.warn(`Rol incorrecto: ${user.rol}, esperado: tecnico`);
        
        // Mapeo de roles a rutas
        const roleRedirects = {
            'jefe_operativo': '/jefe_operativo/dashboard.html',
            'jefe_taller': '/jefe_taller/dashboard.html',
            'admin_general': '/admin_general/dashboard.html',
            'encargado_repuestos': '/encargado_rep_almacen/dashboard.html',
            'cliente': '/cliente/dashboard.html'
        };
        
        // Redirigir según el rol
        if (roleRedirects[user.rol]) {
            window.location.href = roleRedirects[user.rol];
        } else {
            window.location.href = '../../login.html';
        }
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
        if (e.key === 'Escape' && entrarModal && entrarModal.classList.contains('show')) {
            cerrarModal();
        }
    });
    
    // Cerrar modal haciendo clic fuera
    if (entrarModal) {
        entrarModal.addEventListener('click', (e) => {
            if (e.target === entrarModal) {
                cerrarModal();
            }
        });
    }
}

// =====================================================
// CARGAR VEHÍCULOS
// =====================================================
async function loadVehiculos() {
    try {
        mostrarLoading(true);
        
        // Simulación - Reemplazar con llamada real a la API
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Datos de ejemplo
        vehiculosActivos = generarVehiculosEjemplo();
        
        actualizarBadges();
        renderizarVehiculos();
        
        // Guardar en localStorage para el badge del sidebar
        localStorage.setItem('vehiculos_activos', JSON.stringify(vehiculosActivos));
        
    } catch (error) {
        console.error('Error:', error);
        mostrarError('Error al cargar vehículos');
    } finally {
        mostrarLoading(false);
    }
}

// Generar vehículos de ejemplo
function generarVehiculosEjemplo() {
    // Para probar el estado vacío, cambiar a []
    // return [];
    
    return [
        {
            id: 1,
            codigo: 'OT-240318-001',
            cliente: 'Juan Pérez',
            vehiculo: {
                marca: 'Toyota',
                modelo: 'Corolla',
                placa: 'ABC123',
                año: 2020
            },
            tiempoEstimado: 4, // horas
            tiempoTranscurrido: 1.5,
            estado: 'en-proceso',
            diagnostico: 'Ruido en motor al acelerar'
        },
        {
            id: 2,
            codigo: 'OT-240318-002',
            cliente: 'María López',
            vehiculo: {
                marca: 'Honda',
                modelo: 'Civic',
                placa: 'XYZ789',
                año: 2021
            },
            tiempoEstimado: 6,
            tiempoTranscurrido: 4,
            estado: 'en-pausa',
            diagnostico: 'Vibración en frenos, esperando repuestos',
            motivoPausa: 'Esperando pastillas de freno'
        }
    ];
}

// Actualizar badges
function actualizarBadges() {
    const vehiculosBadge = document.getElementById('vehiculosBadge');
    if (vehiculosBadge) {
        vehiculosBadge.textContent = vehiculosActivos.length;
    }
    
    if (notificacionesBadge) {
        notificacionesBadge.textContent = Math.floor(Math.random() * 3) + 1;
    }
}

// Mostrar/ocultar loading
function mostrarLoading(show) {
    if (!loadingContainer || !vehiculosGrid || !emptyState) return;
    
    if (show) {
        loadingContainer.style.display = 'block';
        vehiculosGrid.style.display = 'none';
        emptyState.style.display = 'none';
    } else {
        loadingContainer.style.display = 'none';
    }
}

// Mostrar error
function mostrarError(mensaje) {
    if (!vehiculosGrid) return;
    
    vehiculosGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
            <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #E53935; margin-bottom: 1rem;"></i>
            <p style="color: #666666;">${mensaje}</p>
            <button onclick="recargarDatos()" class="btn-refresh" style="margin-top: 1rem;">
                <i class="fas fa-sync-alt"></i> Reintentar
            </button>
        </div>
    `;
    vehiculosGrid.style.display = 'grid';
}

// =====================================================
// RENDERIZAR VEHÍCULOS
// =====================================================
function renderizarVehiculos() {
    if (!vehiculosGrid || !emptyState) return;
    
    if (vehiculosActivos.length === 0) {
        vehiculosGrid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    vehiculosGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    // Calcular porcentaje de progreso
    const vehiculosConProgreso = vehiculosActivos.map(v => {
        const progreso = (v.tiempoTranscurrido / v.tiempoEstimado) * 100;
        const tiempoRestante = v.tiempoEstimado - v.tiempoTranscurrido;
        return { ...v, progreso: Math.min(progreso, 100), tiempoRestante };
    });
    
    vehiculosGrid.innerHTML = vehiculosConProgreso.map(v => `
        <div class="vehiculo-card ${v.estado}" data-id="${v.id}">
            <div class="card-header">
                <div class="card-header-left">
                    <div class="card-label">Orden de trabajo</div>
                    <div class="card-codigo">${v.codigo}</div>
                </div>
                <div class="estado-badge ${v.estado}">
                    ${v.estado === 'en-proceso' ? 'En proceso' : 'En pausa'}
                </div>
            </div>
            
            <div class="card-body">
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Cliente</span>
                        <span class="info-value">
                            <i class="fas fa-user"></i>
                            ${v.cliente}
                        </span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Vehículo</span>
                        <span class="info-value">
                            <i class="fas fa-car"></i>
                            ${v.vehiculo.marca} ${v.vehiculo.modelo}
                        </span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Placa</span>
                        <span class="info-value">
                            <i class="fas fa-id-card"></i>
                            ${v.vehiculo.placa}
                        </span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Año</span>
                        <span class="info-value">
                            <i class="fas fa-calendar"></i>
                            ${v.vehiculo.año}
                        </span>
                    </div>
                    
                    <div class="info-item full-width">
                        <span class="info-label">Diagnóstico</span>
                        <span class="info-value">
                            <i class="fas fa-stethoscope"></i>
                            ${v.diagnostico}
                        </span>
                    </div>
                    
                    ${v.estado === 'en-pausa' && v.motivoPausa ? `
                        <div class="info-item full-width">
                            <span class="info-label">Motivo de pausa</span>
                            <span class="info-value" style="color: #FF3B30;">
                                <i class="fas fa-pause-circle"></i>
                                ${v.motivoPausa}
                            </span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="progreso-container">
                    <div class="progreso-header">
                        <span class="progreso-label">Progreso</span>
                        <span class="progreso-tiempo">
                            <i class="far fa-clock"></i>
                            ${v.tiempoRestante.toFixed(1)}h restantes
                        </span>
                    </div>
                    <div class="progreso-bar">
                        <div class="progreso-fill" style="width: ${v.progreso}%;"></div>
                    </div>
                </div>
            </div>
            
            <div class="card-footer">
                <button class="btn-entrar" onclick="abrirModalEntrar(${v.id})">
                    <i class="fas fa-sign-in-alt"></i>
                    Entrar al vehículo
                </button>
            </div>
        </div>
    `).join('');
}

// =====================================================
// FUNCIONES DEL MODAL
// =====================================================
window.abrirModalEntrar = (id) => {
    vehiculoSeleccionado = vehiculosActivos.find(v => v.id === id);
    
    if (!vehiculoSeleccionado || !entrarModal || !modalMessage || !modalInfo) return;
    
    modalMessage.textContent = `¿Estás listo para comenzar a trabajar en la orden ${vehiculoSeleccionado.codigo}?`;
    
    modalInfo.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <p><strong>Cliente:</strong> ${vehiculoSeleccionado.cliente}</p>
            <p><strong>Vehículo:</strong> ${vehiculoSeleccionado.vehiculo.marca} ${vehiculoSeleccionado.vehiculo.modelo} (${vehiculoSeleccionado.vehiculo.placa})</p>
            <p><strong>Diagnóstico:</strong> ${vehiculoSeleccionado.diagnostico}</p>
        </div>
    `;
    
    if (confirmarEntrarBtn) {
        confirmarEntrarBtn.onclick = () => confirmarEntrar(vehiculoSeleccionado.id);
    }
    
    entrarModal.classList.add('show');
};

window.cerrarModal = () => {
    if (entrarModal) {
        entrarModal.classList.remove('show');
    }
    vehiculoSeleccionado = null;
};

function confirmarEntrar(id) {
    mostrarNotificacion(`Accediendo a la orden #${id}...`, 'info');
    
    setTimeout(() => {
        mostrarNotificacion('Redirigiendo al diagnóstico...', 'success');
        cerrarModal();
        
        // Aquí iría la redirección a la página de diagnóstico
        // window.location.href = `diagnostico.html?id=${id}`;
    }, 1500);
}

// =====================================================
// RECARGAR DATOS
// =====================================================
window.recargarDatos = () => {
    loadVehiculos();
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
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#E53935' : tipo === 'warning' ? '#FF9800' : '#2196F3'};
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
        localStorage.removeItem('vehiculos_activos');
        window.location.href = '../../login.html';
    }
};