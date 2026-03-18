// =====================================================
// CONFIGURACIÓN
// =====================================================
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const vehiculosGrid = document.getElementById('vehiculosGrid');
const searchInput = document.getElementById('searchInput');
const filterTabs = document.querySelectorAll('.filter-tab');
const currentDateSpan = document.getElementById('currentDate');

// Contadores
const countTodos = document.getElementById('countTodos');
const countProceso = document.getElementById('countProceso');
const countPausa = document.getElementById('countPausa');
const countFinalizado = document.getElementById('countFinalizado');

// Variables globales
let vehiculosData = [];
let filtroActual = 'todos';

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initPage();
    await loadVehiculos();
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
    // Búsqueda
    if (searchInput) {
        searchInput.addEventListener('input', filtrarVehiculos);
    }
    
    // Filtros por pestañas
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            filtroActual = tab.dataset.filter;
            filtrarVehiculos();
        });
    });
}

// =====================================================
// CARGAR VEHÍCULOS DESDE API
// =====================================================
async function loadVehiculos() {
    try {
        // Mostrar loading
        vehiculosGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                <h3>Cargando vehículos...</h3>
            </div>
        `;
        
        const response = await fetch(`${API_URL}/jefe-operativo/vehiculos-proceso`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Error al cargar vehículos');
        }
        
        const result = await response.json();
        vehiculosData = result.data || [];
        
        actualizarContadores();
        renderVehiculos();
        
    } catch (error) {
        console.error('Error:', error);
        // Datos de ejemplo para desarrollo
        cargarDatosEjemplo();
    }
}

// Datos de ejemplo para desarrollo
function cargarDatosEjemplo() {
    vehiculosData = [
        {
            id: 1,
            codigo: 'OT-240317-001',
            cliente: 'Juan Pérez',
            vehiculo: 'Toyota Corolla',
            placa: 'ABC123',
            tecnico: 'Luis Mamani',
            tiempoEstimado: '2.5 horas',
            tiempoTranscurrido: '1.2 horas',
            progreso: 45,
            estado: 'proceso',
            diagnostico: 'Cambio de aceite y frenos'
        },
        {
            id: 2,
            codigo: 'OT-240317-002',
            cliente: 'María López',
            vehiculo: 'Honda Civic',
            placa: 'XYZ789',
            tecnico: 'Carlos Rodríguez',
            tiempoEstimado: '4 horas',
            tiempoTranscurrido: '2.5 horas',
            progreso: 60,
            estado: 'proceso',
            diagnostico: 'Reparación de motor'
        },
        {
            id: 3,
            codigo: 'OT-240316-015',
            cliente: 'Roberto Méndez',
            vehiculo: 'Suzuki Swift',
            placa: 'DEF456',
            tecnico: 'Luis Mamani',
            tiempoEstimado: '1.5 horas',
            tiempoTranscurrido: '3.0 horas',
            progreso: 75,
            estado: 'pausa',
            diagnostico: 'Esperando repuestos',
            motivoPausa: 'Frenos traseros sin stock'
        },
        {
            id: 4,
            codigo: 'OT-240316-012',
            cliente: 'Ana Flores',
            vehiculo: 'Nissan Versa',
            placa: 'GHI789',
            tecnico: 'Juan Pérez',
            tiempoEstimado: '3 horas',
            tiempoTranscurrido: '2.8 horas',
            progreso: 90,
            estado: 'proceso',
            diagnostico: 'Alineación y balanceo'
        },
        {
            id: 5,
            codigo: 'OT-240315-008',
            cliente: 'Carlos Ruiz',
            vehiculo: 'Chevrolet Spark',
            placa: 'JKL012',
            tecnico: 'María González',
            tiempoEstimado: '5 horas',
            tiempoTranscurrido: '5.0 horas',
            progreso: 100,
            estado: 'finalizado',
            diagnostico: 'Cambio de batería y sistema eléctrico'
        }
    ];
    
    actualizarContadores();
    renderVehiculos();
}

// Actualizar contadores de filtros
function actualizarContadores() {
    const total = vehiculosData.length;
    const proceso = vehiculosData.filter(v => v.estado === 'proceso').length;
    const pausa = vehiculosData.filter(v => v.estado === 'pausa').length;
    const finalizado = vehiculosData.filter(v => v.estado === 'finalizado').length;
    
    if (countTodos) countTodos.textContent = total;
    if (countProceso) countProceso.textContent = proceso;
    if (countPausa) countPausa.textContent = pausa;
    if (countFinalizado) countFinalizado.textContent = finalizado;
}

// Filtrar vehículos
function filtrarVehiculos() {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    
    const filtrados = vehiculosData.filter(v => {
        // Filtro de búsqueda
        const matchesSearch = 
            v.codigo.toLowerCase().includes(searchTerm) ||
            v.cliente.toLowerCase().includes(searchTerm) ||
            v.placa.toLowerCase().includes(searchTerm) ||
            v.vehiculo.toLowerCase().includes(searchTerm);
        
        if (!matchesSearch) return false;
        
        // Filtro por estado
        if (filtroActual === 'todos') return true;
        if (filtroActual === 'proceso') return v.estado === 'proceso';
        if (filtroActual === 'pausa') return v.estado === 'pausa';
        if (filtroActual === 'finalizado') return v.estado === 'finalizado';
        
        return true;
    });
    
    renderVehiculos(filtrados);
}

// Renderizar vehículos
function renderVehiculos(vehiculos = vehiculosData) {
    if (!vehiculosGrid) return;
    
    if (vehiculos.length === 0) {
        vehiculosGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-car"></i>
                <h3>No hay vehículos</h3>
                <p>No se encontraron vehículos que coincidan con los criterios de búsqueda.</p>
                <button class="btn-primary" onclick="location.href='recepcion.html'">
                    <i class="fas fa-plus"></i> Registrar nuevo ingreso
                </button>
            </div>
        `;
        return;
    }
    
    vehiculosGrid.innerHTML = vehiculos.map(v => {
        const estadoClass = v.estado;
        const estadoTexto = {
            'proceso': 'En proceso',
            'pausa': 'En pausa',
            'finalizado': 'Finalizado'
        }[v.estado] || v.estado;
        
        const porcentajeProgreso = Math.min(100, Math.round((v.tiempoTranscurrido / v.tiempoEstimado) * 100));
        
        return `
            <div class="vehiculo-card estado-${v.estado}">
                <div class="card-header">
                    <span class="codigo-orden">${v.codigo}</span>
                    <span class="estado-badge ${estadoClass}">${estadoTexto}</span>
                </div>
                
                <div class="card-body">
                    <div class="info-principal">
                        <div class="vehiculo-icon">
                            <i class="fas fa-car"></i>
                        </div>
                        <div class="vehiculo-datos">
                            <h3>${v.vehiculo}</h3>
                            <p>${v.placa} · ${v.cliente}</p>
                        </div>
                    </div>
                    
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Código</span>
                            <span class="info-value">${v.codigo}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Cliente</span>
                            <span class="info-value">${v.cliente}</span>
                        </div>
                    </div>
                    
                    <div class="tecnico-info">
                        <div class="tecnico-avatar">
                            <i class="fas fa-user-cog"></i>
                        </div>
                        <div>
                            <div class="tecnico-nombre">${v.tecnico}</div>
                            <div class="tecnico-rol">Técnico asignado</div>
                        </div>
                    </div>
                    
                    <div class="tiempo-info">
                        <div class="tiempo-item">
                            <i class="fas fa-clock"></i>
                            <span>Estimado: <strong>${v.tiempoEstimado}</strong></span>
                        </div>
                        <div class="tiempo-item">
                            <i class="fas fa-hourglass-half"></i>
                            <span>Transcurrido: <strong>${v.tiempoTranscurrido}</strong></span>
                        </div>
                    </div>
                    
                    <div class="progreso-section">
                        <div class="progreso-header">
                            <span>Progreso</span>
                            <strong>${porcentajeProgreso}%</strong>
                        </div>
                        <div class="progreso-bar">
                            <div class="progreso-fill" style="width: ${porcentajeProgreso}%;"></div>
                        </div>
                    </div>
                    
                    ${v.estado === 'pausa' ? `
                        <div class="diagnostico-mensaje" style="margin-top: 1rem;">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>${v.motivoPausa || 'Esperando repuestos'}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="card-footer">
                    <button class="btn-card" onclick="verDetalleRapido(${v.id})">
                        <i class="fas fa-eye"></i> Ver detalle
                    </button>
                    <button class="btn-card ${v.estado === 'pausa' ? 'primary' : ''}" onclick="gestionarVehiculo(${v.id})">
                        <i class="fas ${v.estado === 'pausa' ? 'fa-play' : 'fa-cog'}"></i>
                        ${v.estado === 'pausa' ? 'Reanudar' : 'Gestionar'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// ACCIONES DE VEHÍCULOS
// =====================================================
window.verDetalleRapido = (id) => {
    const vehiculo = vehiculosData.find(v => v.id === id);
    if (!vehiculo) return;
    
    const modalBody = document.getElementById('detalleModalBody');
    const porcentajeProgreso = Math.min(100, Math.round((vehiculo.tiempoTranscurrido / vehiculo.tiempoEstimado) * 100));
    
    modalBody.innerHTML = `
        <div class="detalle-vehiculo">
            <div class="detalle-row">
                <span class="detalle-label">Código de orden:</span>
                <span class="detalle-value"><i class="fas fa-tag"></i> ${vehiculo.codigo}</span>
            </div>
            <div class="detalle-row">
                <span class="detalle-label">Cliente:</span>
                <span class="detalle-value"><i class="fas fa-user"></i> ${vehiculo.cliente}</span>
            </div>
            <div class="detalle-row">
                <span class="detalle-label">Vehículo:</span>
                <span class="detalle-value"><i class="fas fa-car"></i> ${vehiculo.vehiculo} (${vehiculo.placa})</span>
            </div>
            <div class="detalle-row">
                <span class="detalle-label">Técnico asignado:</span>
                <span class="detalle-value"><i class="fas fa-user-cog"></i> ${vehiculo.tecnico}</span>
            </div>
            <div class="detalle-row">
                <span class="detalle-label">Tiempo estimado:</span>
                <span class="detalle-value"><i class="fas fa-clock"></i> ${vehiculo.tiempoEstimado}</span>
            </div>
            <div class="detalle-row">
                <span class="detalle-label">Tiempo transcurrido:</span>
                <span class="detalle-value"><i class="fas fa-hourglass-half"></i> ${vehiculo.tiempoTranscurrido}</span>
            </div>
            <div class="detalle-row">
                <span class="detalle-label">Progreso:</span>
                <span class="detalle-value"><i class="fas fa-chart-line"></i> ${porcentajeProgreso}%</span>
            </div>
            <div class="detalle-row">
                <span class="detalle-label">Estado:</span>
                <span class="detalle-value">
                    <span class="estado-badge ${vehiculo.estado}" style="display: inline-block; padding: 0.2rem 0.8rem;">
                        ${vehiculo.estado === 'proceso' ? 'En proceso' : vehiculo.estado === 'pausa' ? 'En pausa' : 'Finalizado'}
                    </span>
                </span>
            </div>
            <div class="detalle-row">
                <span class="detalle-label">Diagnóstico:</span>
                <span class="detalle-value">${vehiculo.diagnostico || 'No especificado'}</span>
            </div>
            ${vehiculo.estado === 'pausa' ? `
                <div class="detalle-row">
                    <span class="detalle-label">Motivo de pausa:</span>
                    <span class="detalle-value" style="color: var(--ambar-alerta);">
                        <i class="fas fa-exclamation-triangle"></i> ${vehiculo.motivoPausa || 'Esperando repuestos'}
                    </span>
                </div>
            ` : ''}
        </div>
    `;
    
    document.getElementById('detalleModal').classList.add('show');
};

window.gestionarVehiculo = (id) => {
    const vehiculo = vehiculosData.find(v => v.id === id);
    if (!vehiculo) return;
    
    console.log('Gestionar vehículo:', vehiculo);
    
    if (vehiculo.estado === 'pausa') {
        mostrarNotificacion(`Reanudando trabajo de ${vehiculo.vehiculo}`, 'info');
    } else {
        mostrarNotificacion(`Abriendo gestión de ${vehiculo.vehiculo}`, 'info');
        // Aquí redirigirías a la página de gestión
        // window.location.href = `gestion-vehiculo.html?id=${id}`;
    }
};

window.verOrdenCompleta = () => {
    cerrarModal();
    // Aquí redirigirías a la orden completa
    mostrarNotificacion('Abriendo orden completa', 'info');
};

// =====================================================
// MODAL
// =====================================================
window.cerrarModal = () => {
    document.getElementById('detalleModal').classList.remove('show');
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

// Agregar estilos para animaciones si no existen
if (!document.querySelector('#toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}