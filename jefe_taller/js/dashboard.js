// =====================================================
// DASHBOARD JEFE DE TALLER - CORREGIDO PARA MULTI-ROL
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
    console.log('🚀 Inicializando dashboard Jefe Taller');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    await loadDashboardData();
    setupEventListeners();
    await cargarRolesUsuario();
});

// Verificar autenticación - CORREGIDO PARA MULTI-ROL
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        console.log('❌ No hay token, redirigiendo a login');
        window.location.href = '/';
        return false;
    }
    
    try {
        // Obtener usuario del localStorage
        if (userData) {
            usuarioActual = JSON.parse(userData);
        }
        
        // Decodificar token para verificar roles
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.user) {
            usuarioActual = { ...usuarioActual, ...payload.user };
        }
        
        // Obtener roles del usuario
        if (usuarioActual && usuarioActual.roles && Array.isArray(usuarioActual.roles)) {
            rolesUsuario = usuarioActual.roles;
        } else if (usuarioActual && usuarioActual.rol) {
            rolesUsuario = [usuarioActual.rol];
        } else {
            rolesUsuario = [];
        }
        
        // Obtener rol seleccionado
        const selectedRole = usuarioActual?.selected_role;
        
        console.log('📋 Roles del usuario:', rolesUsuario);
        console.log('🎯 Rol seleccionado:', selectedRole);
        
        // Verificar si tiene rol de jefe_taller
        const tieneRolJefeTaller = rolesUsuario.includes('jefe_taller');
        
        if (!tieneRolJefeTaller) {
            console.warn('❌ Usuario no tiene permiso de Jefe Taller');
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            
            // Si tiene jefe_operativo, redirigir allí
            if (rolesUsuario.includes('jefe_operativo')) {
                window.location.href = '/jefe_operativo/dashboard.html';
            } else {
                window.location.href = '/';
            }
            return false;
        }
        
        // Si el usuario seleccionó jefe_operativo pero está en jefe_taller, redirigir
        if (selectedRole === 'jefe_operativo' && rolesUsuario.includes('jefe_operativo')) {
            console.log('🔄 Usuario seleccionó Jefe Operativo, redirigiendo...');
            window.location.href = '/jefe_operativo/dashboard.html';
            return false;
        }
        
        // Verificar token con el backend
        const response = await fetch(`${API_URL}/verify-token`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
            console.log('❌ Token inválido, redirigiendo a login');
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        console.log('✅ Autenticación correcta para Jefe Taller');
        
        // Actualizar localStorage con roles si es necesario
        if (usuarioActual && !usuarioActual.roles) {
            usuarioActual.roles = rolesUsuario;
            localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
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
                if (usuarioActual) {
                    usuarioActual.roles = rolesUsuario;
                    localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
                }
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
        // Verificar si ya existe el badge
        if (headerUserInfo.querySelector('.roles-badge')) return;
        
        const rolesBadge = document.createElement('div');
        rolesBadge.className = 'roles-badge';
        rolesBadge.style.cssText = `
            font-size: 0.7rem;
            background: var(--gris-200);
            padding: 0.2rem 0.5rem;
            border-radius: 12px;
            margin-top: 0.25rem;
            display: inline-block;
            color: var(--blanco);
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
        
        // Agregar tooltip
        rolesBadge.title = 'Tienes múltiples roles. Puedes cambiar desde el menú de perfil.';
        
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
    
    // Mostrar nombre de usuario
    const userNombreSpan = document.getElementById('userNombre');
    if (userNombreSpan && usuarioActual) {
        userNombreSpan.textContent = usuarioActual.nombre || usuarioActual.email || 'Usuario';
    }
}

// Configurar event listeners
function setupEventListeners() {
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
        
        if (!token) {
            throw new Error('No hay token');
        }
        
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
                bahiasOcupadas: 9
            },
            diagnosticos: pendientes?.diagnosticos || [],
            cotizaciones: cotizaciones?.cotizaciones || [],
            stats: stats?.stats || {}
        };
        
        actualizarUI();
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        mostrarNotificacion('Error al cargar datos del dashboard', 'error');
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

// Usar datos de ejemplo
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
    return [
        {
            diagnostico_id: 1,
            vehiculo: 'Toyota Corolla',
            placa: 'ABC123',
            tecnico_nombre: 'Luis Mamani',
            fecha_envio: new Date().toISOString(),
            informe: 'Ruido en motor al acelerar, posible problema en correa'
        },
        {
            diagnostico_id: 2,
            vehiculo: 'Honda Civic',
            placa: 'XYZ789',
            tecnico_nombre: 'Carlos Rodríguez',
            fecha_envio: new Date().toISOString(),
            informe: 'Vibración en frenos, discos desgastados'
        }
    ];
}

// Generar próximas entregas
function generarEntregas() {
    return [
        {
            id: 1,
            vehiculo: 'Nissan Versa',
            placa: 'GHI789',
            cliente_nombre: 'Ana Flores',
            fecha_envio: new Date().toISOString(),
            total: 1500,
            estado_cliente: 'enviada'
        }
    ];
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

// Renderizar entregas
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
        const tieneOrden = Math.random() > 0.5;
        
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
};

window.revisarDiagnostico = (id) => {
    window.location.href = `diagnosticos.html?diagnostico_id=${id}`;
};

window.verCotizacion = (id) => {
    window.location.href = `cotizaciones.html?id=${id}`;
};

// Cambiar semana en calendario
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

console.log('✅ dashboard.js de Jefe Taller cargado correctamente');