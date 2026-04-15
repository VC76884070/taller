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
let usuarioActual = null;
let rolesUsuario = [];

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    await loadDashboardData();
    setupEventListeners();
    await cargarRolesUsuario(); // Cargar roles para el UI
});

// Verificar autenticación (actualizado para múltiples roles)
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = '../../login.html';
        return false;
    }
    
    try {
        // Decodificar token para verificar roles
        const payload = JSON.parse(atob(token.split('.')[1]));
        usuarioActual = payload.user;
        
        // Obtener roles del usuario desde el token o desde el localStorage actualizado
        if (usuarioActual.roles && Array.isArray(usuarioActual.roles)) {
            rolesUsuario = usuarioActual.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            rolesUsuario = user.roles || [];
            usuarioActual.roles = rolesUsuario;
        }
        
        // Verificar si tiene rol de jefe_taller o jefe_operativo
        const tieneRolPermitido = rolesUsuario.includes('jefe_taller') || 
                                   rolesUsuario.includes('jefe_operativo') ||
                                   usuarioActual.rol === 'jefe_taller' || // Compatibilidad
                                   usuarioActual.id_rol === 2 || 
                                   usuarioActual.id_rol === 3;
        
        if (!tieneRolPermitido) {
            console.warn('Usuario no tiene permisos de jefe_taller o jefe_operativo');
            window.location.href = '../../login.html';
            return false;
        }
        
        // Actualizar localStorage con roles si es necesario
        if (usuarioActual && !usuarioActual.roles) {
            usuarioActual.roles = rolesUsuario;
            localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '../../login.html';
        return false;
    }
}

// Cargar roles del usuario desde el backend
async function cargarRolesUsuario() {
    try {
        const token = localStorage.getItem('furia_token');
        const response = await fetch(`${API_URL}/jefe-taller/perfil/roles`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.roles) {
                rolesUsuario = data.roles.map(r => r.nombre_rol || r);
                usuarioActual.roles = rolesUsuario;
                
                // Actualizar localStorage
                localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
                
                // Mostrar indicador visual de roles múltiples si aplica
                mostrarIndicadorRoles();
            }
        }
    } catch (error) {
        console.error('Error cargando roles:', error);
    }
}

// Mostrar indicador visual de roles múltiples
function mostrarIndicadorRoles() {
    const headerUserInfo = document.querySelector('.user-info');
    if (headerUserInfo && rolesUsuario.length > 1) {
        const rolesBadge = document.createElement('div');
        rolesBadge.className = 'roles-badge';
        rolesBadge.style.cssText = `
            font-size: 0.7rem;
            background: var(--gris-200);
            padding: 0.2rem 0.5rem;
            border-radius: 12px;
            margin-top: 0.25rem;
            display: inline-block;
        `;
        rolesBadge.textContent = rolesUsuario.map(r => {
            const nombres = {
                'jefe_taller': 'Jefe Taller',
                'jefe_operativo': 'Jefe Operativo',
                'tecnico': 'Técnico',
                'encargado_repuestos': 'Repuestos'
            };
            return nombres[r] || r;
        }).join(' • ');
        
        headerUserInfo.appendChild(rolesBadge);
    }
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
    
    // Mostrar nombre de usuario con roles
    const userNombreSpan = document.getElementById('userNombre');
    if (userNombreSpan && usuarioActual) {
        userNombreSpan.textContent = usuarioActual.nombre || usuarioActual.email || 'Usuario';
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Botón de recargar datos
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadDashboardData());
    }
}

// =====================================================
// CARGAR DATOS (CONECTADO A API REAL)
// =====================================================
async function loadDashboardData() {
    try {
        mostrarLoading(true);
        const token = localStorage.getItem('furia_token');
        
        // Cargar estadísticas de diagnósticos
        const statsResponse = await fetch(`${API_URL}/jefe-taller/diagnosticos-stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Cargar diagnósticos pendientes
        const pendientesResponse = await fetch(`${API_URL}/jefe-taller/diagnosticos-pendientes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Cargar cotizaciones enviadas
        const cotizacionesResponse = await fetch(`${API_URL}/jefe-taller/cotizaciones-enviadas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Procesar respuestas
        const stats = statsResponse.ok ? await statsResponse.json() : null;
        const pendientes = pendientesResponse.ok ? await pendientesResponse.json() : null;
        const cotizaciones = cotizacionesResponse.ok ? await cotizacionesResponse.json() : null;
        
        // Actualizar KPIs
        dashboardData = {
            kpis: {
                ordenesActivas: pendientes?.diagnosticos?.filter(d => d.estado === 'pendiente').length || 0,
                ordenesPausa: pendientes?.diagnosticos?.filter(d => d.estado === 'rechazado').length || 0,
                tecnicosActivos: new Set(pendientes?.diagnosticos?.map(d => d.id_tecnico)).size || 0,
                bahiasOcupadas: 9 // Este dato vendría de otro endpoint
            },
            diagnosticos: pendientes?.diagnosticos || [],
            cotizaciones: cotizaciones?.cotizaciones || [],
            stats: stats?.stats || {}
        };
        
        actualizarUI();
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        mostrarNotificacion('Error al cargar datos del dashboard', 'error');
        // Usar datos de ejemplo como fallback
        usarDatosEjemplo();
    } finally {
        mostrarLoading(false);
    }
}

// Mostrar/ocultar loading
function mostrarLoading(mostrar) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = mostrar ? 'flex' : 'none';
    }
}

// Usar datos de ejemplo en caso de error
function usarDatosEjemplo() {
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
    mostrarNotificacion('Usando datos de demostración', 'warning');
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
    if (ordenesActivas) ordenesActivas.textContent = dashboardData.kpis.ordenesActivas;
    if (ordenesPausa) ordenesPausa.textContent = dashboardData.kpis.ordenesPausa;
    if (tecnicosActivos) tecnicosActivos.textContent = dashboardData.kpis.tecnicosActivos;
    if (bahiasOcupadas) bahiasOcupadas.textContent = dashboardData.kpis.bahiasOcupadas;
    
    // Actualizar bahías
    if (dashboardData.bahias) renderizarBahias();
    
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
    
    if (bahiasGrid && dashboardData.bahias) {
        bahiasGrid.innerHTML = dashboardData.bahias.map(bahia => `
            <div class="bahia-item ${bahia.estado}" onclick="verDetalleBahia(${bahia.numero})">
                <div class="bahia-numero">Bahía ${bahia.numero}</div>
                <div class="bahia-estado">${estadosTexto[bahia.estado]}</div>
                ${bahia.tecnico ? `<div class="bahia-tecnico">${bahia.tecnico}</div>` : ''}
            </div>
        `).join('');
    }
}

// Renderizar diagnósticos
function renderizarDiagnosticos() {
    if (!diagnosticosList) return;
    
    const diagnosticos = dashboardData.diagnosticos || [];
    
    if (diagnosticos.length === 0) {
        diagnosticosList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--gris-500);">
                <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>No hay diagnósticos pendientes</p>
            </div>
        `;
        if (pendientesCount) pendientesCount.textContent = '0';
        return;
    }
    
    if (pendientesCount) pendientesCount.textContent = diagnosticos.length;
    
    diagnosticosList.innerHTML = diagnosticos.map(diag => `
        <div class="diagnostico-item">
            <div class="diagnostico-icon">
                <i class="fas fa-stethoscope"></i>
            </div>
            <div class="diagnostico-content">
                <h4>${diag.marca || ''} ${diag.modelo || ''} (${diag.placa || 'Sin placa'})</h4>
                <p>${diag.informe ? diag.informe.substring(0, 100) : 'Sin informe'}</p>
            </div>
            <div class="diagnostico-meta">
                <span class="diagnostico-tecnico">${diag.tecnico_nombre || 'Sin técnico'}</span>
                <span class="diagnostico-time">${formatearFecha(diag.fecha_envio)}</span>
                <button class="btn-revisar" onclick="revisarDiagnostico(${diag.diagnostico_id || diag.id})">
                    Revisar
                </button>
            </div>
        </div>
    `).join('');
}

// Renderizar entregas (cotizaciones pendientes)
function renderizarEntregas() {
    if (!entregasList) return;
    
    const cotizaciones = dashboardData.cotizaciones || [];
    
    if (cotizaciones.length === 0) {
        entregasList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--gris-500);">
                <i class="fas fa-clock" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>No hay cotizaciones pendientes de respuesta</p>
            </div>
        `;
        return;
    }
    
    entregasList.innerHTML = cotizaciones.map(cot => `
        <div class="entrega-item">
            <div class="entrega-icon">
                <i class="fas fa-file-invoice-dollar"></i>
            </div>
            <div class="entrega-content">
                <h4>${cot.vehiculo || 'Vehículo'} (${cot.placa || 'Sin placa'})</h4>
                <p>Cliente: ${cot.cliente_nombre || 'No registrado'}</p>
                <p class="entrega-total">Total: Bs. ${cot.total?.toFixed(2) || '0.00'}</p>
            </div>
            <div class="entrega-meta">
                <span class="diagnostico-time">${formatearFecha(cot.fecha_envio)}</span>
                <span class="entrega-estado ${cot.estado_cliente}">
                    ${estadoClienteTexto(cot.estado_cliente)}
                </span>
                <button class="btn-ver" onclick="verCotizacion(${cot.id})">
                    Ver
                </button>
            </div>
        </div>
    `).join('');
}

// Formatear fecha
function formatearFecha(fechaISO) {
    if (!fechaISO) return 'Fecha no disponible';
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Texto de estado de cliente
function estadoClienteTexto(estado) {
    const estados = {
        'aprobado_total': 'Aprobado',
        'aprobado_parcial': 'Aprobación Parcial',
        'enviada': 'Pendiente',
        'rechazada': 'Rechazada'
    };
    return estados[estado] || estado || 'Pendiente';
}

// Renderizar calendario
function renderizarCalendario() {
    const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const fechaInicio = new Date(semanaActual);
    fechaInicio.setDate(fechaInicio.getDate() - fechaInicio.getDay() + 1);
    
    const calendario = document.getElementById('calendarioMini');
    if (!calendario) return;
    
    let html = '';
    
    for (let i = 0; i < 7; i++) {
        const fecha = new Date(fechaInicio);
        fecha.setDate(fechaInicio.getDate() + i);
        
        const hoy = new Date();
        const esHoy = fecha.toDateString() === hoy.toDateString();
        const tieneOrden = Math.random() > 0.5; // Simulación - reemplazar con datos reales
        
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
    if (semanaActualSpan) semanaActualSpan.textContent = `${inicioStr} - ${finStr}`;
}

// =====================================================
// FUNCIONES DE NAVEGACIÓN
// =====================================================
window.verDetalleBahia = (numero) => {
    mostrarNotificacion(`Viendo detalle de Bahía ${numero}`, 'info');
    // Aquí iría la navegación a la página de detalle
};

window.revisarDiagnostico = (id) => {
    // Navegar a la página de revisión de diagnóstico
    window.location.href = `diagnostico-revision.html?id=${id}`;
};

window.verEntrega = (id) => {
    window.location.href = `cotizacion-detalle.html?id=${id}`;
};

window.verCotizacion = (id) => {
    window.location.href = `cotizacion-detalle.html?id=${id}`;
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