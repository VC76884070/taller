// =====================================================
// MIS VEHÍCULOS - TÉCNICO MECÁNICO
// FLUJO: EMPEZAR TRABAJO → DIAGNÓSTICO → APROBACIÓN → REPARACIÓN
// FURIA MOTOR COMPANY SRL
// VERSIÓN CORREGIDA - URLs: /tecnico/...
// =====================================================

// Configuración de roles
const ROLE_CONFIG = {
    'jefe_operativo': {
        redirect: '/jefe_operativo/dashboard.html'
    },
    'jefe_taller': {
        redirect: '/jefe_taller/dashboard.html'
    },
    'tecnico': {
        redirect: '/tecnico/mis-vehiculos'
    },
    'tecnico_mecanico': {
        redirect: '/tecnico/mis-vehiculos'
    },
    'encargado_repuestos': {
        redirect: '/encargado_rep_almacen/dashboard.html'
    },
    'cliente': {
        redirect: '/cliente/dashboard.html'
    }
};

// Estado global
let vehiculosAsignados = [];
let token = null;
let usuarioActual = null;
let rolesUsuario = [];
let comunicadosVistos = [];

// Obtener token
function getToken() {
    const localToken = localStorage.getItem('furia_token');
    if (localToken) return localToken;
    const fallbackToken = localStorage.getItem('token');
    if (fallbackToken) return fallbackToken;
    return null;
}

// Mostrar fecha actual
function mostrarFechaActual() {
    const fechaSpan = document.getElementById('currentDate');
    if (fechaSpan) {
        const hoy = new Date();
        const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
        fechaSpan.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
}

// Formato de fecha amigable
function formatFechaComunicado(fechaISO) {
    if (!fechaISO) return 'Fecha no disponible';
    
    const fecha = new Date(fechaISO);
    const ahora = new Date();
    const diffMs = ahora - fecha;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {
        return 'Justo ahora';
    } else if (diffMins < 60) {
        return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
        return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
    } else if (diffDays < 7) {
        return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
    } else {
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
}

// Mostrar toast
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    toast.style.cssText = `
        background: var(--bg-card);
        color: var(--blanco);
        padding: 0.75rem 1.25rem;
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-left: 4px solid ${type === 'success' ? '#10B981' : type === 'error' ? '#C1121F' : type === 'warning' ? '#F59E0B' : '#1E3A5F'};
        animation: slideIn 0.3s ease;
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Recargar datos
window.recargarDatos = function() {
    cargarVehiculos();
    cargarComunicados();
};

// Función para normalizar roles
function normalizarRol(rol) {
    if (!rol) return null;
    const rolLower = rol.toLowerCase();
    
    const mapping = {
        'tecnico': 'tecnico',
        'tecnico_mecanico': 'tecnico',
        'jefe_taller': 'jefe_taller',
        'jefe_operativo': 'jefe_operativo',
        'encargado_repuestos': 'encargado_repuestos',
        'cliente': 'cliente',
        'admin': 'admin',
        'administrador': 'admin'
    };
    
    return mapping[rolLower] || rolLower;
}

// Verificar si tiene rol de técnico
function tieneRolTecnico(roles) {
    if (!roles || !Array.isArray(roles)) return false;
    return roles.some(rol => normalizarRol(rol) === 'tecnico');
}

// =====================================================
// VERIFICAR AUTENTICACIÓN - URL CORREGIDA
// =====================================================
async function verificarToken() {
    token = getToken();
    
    if (!token) {
        console.error('No hay token');
        window.location.href = '/';
        return false;
    }
    
    try {
        const userData = localStorage.getItem('furia_user');
        if (userData) {
            usuarioActual = JSON.parse(userData);
            rolesUsuario = usuarioActual.roles || [];
            rolesUsuario = rolesUsuario.map(r => normalizarRol(r));
        }
        
        // URL CORREGIDA: /tecnico/verify-token (sin /api/)
        const response = await fetch('/tecnico/verify-token', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
            console.error('Token inválido');
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        if (data.user) {
            usuarioActual = data.user;
            rolesUsuario = data.user.roles || [];
            rolesUsuario = rolesUsuario.map(r => normalizarRol(r));
            localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
        }
        
        const selectedRole = localStorage.getItem('furia_selected_role');
        
        console.log('📋 Roles del usuario (normalizados):', rolesUsuario);
        console.log('🎯 Rol seleccionado:', selectedRole);
        
        const tieneRol = tieneRolTecnico(rolesUsuario);
        
        console.log('🔍 ¿Tiene rol técnico?', tieneRol);
        
        if (!tieneRol) {
            console.warn('❌ Usuario no tiene permiso de Técnico');
            showToast('No tienes permisos para acceder a esta sección', 'error');
            
            if (rolesUsuario.includes('jefe_operativo')) {
                window.location.href = '/jefe_operativo/dashboard.html';
            } else if (rolesUsuario.includes('jefe_taller')) {
                window.location.href = '/jefe_taller/dashboard.html';
            } else if (rolesUsuario.includes('encargado_repuestos')) {
                window.location.href = '/encargado_rep_almacen/dashboard.html';
            } else if (rolesUsuario.includes('cliente')) {
                window.location.href = '/cliente/dashboard.html';
            } else {
                window.location.href = '/';
            }
            return false;
        }
        
        console.log('✅ Autenticación correcta para Técnico Mecánico');
        return true;
        
    } catch (error) {
        console.error('Error verificando token:', error);
        window.location.href = '/';
        return false;
    }
}

function mostrarIndicadorRoles() {
    const headerUserInfo = document.querySelector('.user-info');
    if (headerUserInfo && rolesUsuario && rolesUsuario.length > 1) {
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
            cursor: pointer;
        `;
        
        const nombresRoles = rolesUsuario.map(r => {
            const nombres = {
                'jefe_taller': 'Jefe Taller',
                'jefe_operativo': 'Jefe Operativo',
                'tecnico': 'Técnico',
                'encargado_repuestos': 'Repuestos',
                'cliente': 'Cliente'
            };
            return nombres[r] || r;
        }).join(' • ');
        
        rolesBadge.innerHTML = `<i class="fas fa-exchange-alt" style="margin-right: 0.3rem;"></i>${nombresRoles}`;
        rolesBadge.title = 'Tienes múltiples roles. Haz clic para cambiar de rol.';
        rolesBadge.onclick = () => {
            if (confirm('¿Cambiar de rol? Deberás cerrar sesión y seleccionar otro rol.')) {
                cerrarSesion();
            }
        };
        
        headerUserInfo.appendChild(rolesBadge);
    }
}

function mostrarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan && usuarioActual) {
        userNameSpan.textContent = usuarioActual.nombre || usuarioActual.email || 'Usuario';
    }
}

// =====================================================
// CARGAR VEHÍCULOS ASIGNADOS - URL CORREGIDA
// =====================================================
async function cargarVehiculos() {
    const grid = document.getElementById('vehiculosGrid');
    const loadingContainer = document.getElementById('loadingContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (grid) grid.innerHTML = '';
    if (loadingContainer) loadingContainer.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    
    try {
        const timestamp = new Date().getTime();
        // URL CORREGIDA: /tecnico/mis-vehiculos (sin /api/)
        const response = await fetch(`/tecnico/get-mis-vehiculos?_=${timestamp}`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        console.log('📦 Respuesta de vehículos:', data);
        
        if (!data.success) {
            throw new Error(data.error || 'Error al cargar');
        }
        
        vehiculosAsignados = data.vehiculos || [];
        
        console.log(`✅ ${vehiculosAsignados.length} vehículos cargados`);
        
        if (loadingContainer) loadingContainer.style.display = 'none';
        
        if (vehiculosAsignados.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        
        renderVehiculos();
        
    } catch (error) {
        console.error('Error:', error);
        if (loadingContainer) loadingContainer.style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'block';
            const emptyTitle = emptyState.querySelector('h3');
            const emptyText = emptyState.querySelector('p');
            if (emptyTitle) emptyTitle.textContent = 'Error al cargar';
            if (emptyText) emptyText.textContent = error.message;
        }
        showToast(error.message, 'error');
    }
}

function renderVehiculos() {
    const grid = document.getElementById('vehiculosGrid');
    if (!grid) return;
    
    if (!vehiculosAsignados || vehiculosAsignados.length === 0) {
        grid.innerHTML = '<div class="no-data">No hay vehículos asignados</div>';
        return;
    }
    
    grid.innerHTML = vehiculosAsignados.map(vehiculo => {
        const tipo = vehiculo.tipo_asignacion;
        const esDiagnostico = tipo === 'diagnostico';
        const esReparacion = tipo === 'reparacion';
        
        const diagnosticoEnviado = vehiculo.diagnostico_enviado || false;
        const diagnosticoAprobado = vehiculo.diagnostico_aprobado || false;
        const diagnosticoRechazado = vehiculo.diagnostico_rechazado || false;
        const diagnosticoEstado = vehiculo.diagnostico_estado;
        const diagnosticoVersion = vehiculo.diagnostico_version || 1;
        
        const trabajoIniciado = vehiculo.trabajo_iniciado || false;
        const estadoGlobal = vehiculo.estado_global;
        
        let badgeHtml = '';
        let botonesHtml = '';
        
        if (esDiagnostico) {
            badgeHtml = `
                <span class="asignacion-badge diagnostico">
                    <i class="fas fa-stethoscope"></i> Diagnóstico v${diagnosticoVersion}
                </span>
            `;
            
            const bahiaInfo = vehiculo.bahia_asignada ? 
                `<div class="bahia-info" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(37, 99, 235, 0.1); border-radius: var(--radius-sm);">
                    <i class="fas fa-warehouse"></i> <strong>Bahía asignada:</strong> ${vehiculo.bahia_asignada}
                </div>` : '';
            
            if (!trabajoIniciado && !diagnosticoEnviado && !diagnosticoRechazado) {
                botonesHtml = `
                    <button class="btn-sm btn-primary-sm" onclick="empezarTrabajoDiagnostico(${vehiculo.orden_id})">
                        <i class="fas fa-play-circle"></i> Empezar Trabajo
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    ${bahiaInfo}
                `;
            } 
            else if (trabajoIniciado && !diagnosticoEnviado && !diagnosticoRechazado) {
                botonesHtml = `
                    <button class="btn-sm btn-warning-sm" onclick="crearDiagnostico(${vehiculo.orden_id})">
                        <i class="fas fa-stethoscope"></i> Realizar Diagnóstico
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    <div class="bahia-info" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-sm);">
                        <i class="fas fa-warehouse"></i> <strong>Bahía ocupada:</strong> ${vehiculo.bahia_asignada}
                    </div>
                `;
            } 
            else if (diagnosticoEstado === 'pendiente') {
                botonesHtml = `
                    <button class="btn-sm btn-warning-sm" disabled>
                        <i class="fas fa-hourglass-half"></i> Diagnóstico en revisión
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    <div class="bahia-info" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-sm);">
                        <i class="fas fa-warehouse"></i> <strong>Bahía ocupada:</strong> ${vehiculo.bahia_asignada}
                    </div>
                `;
            } 
            else if (diagnosticoEstado === 'aprobado') {
                botonesHtml = `
                    <button class="btn-sm btn-success-sm" disabled>
                        <i class="fas fa-check-circle"></i> Diagnóstico Aprobado
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    <div class="bahia-info" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-sm);">
                        <i class="fas fa-warehouse"></i> <strong>Bahía ocupada:</strong> ${vehiculo.bahia_asignada}
                    </div>
                `;
            } 
            else if (diagnosticoRechazado) {
                botonesHtml = `
                    <button class="btn-sm btn-warning-sm" onclick="crearDiagnostico(${vehiculo.orden_id})">
                        <i class="fas fa-edit"></i> Rehacer Diagnóstico
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    <div class="bahia-info" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-sm);">
                        <i class="fas fa-warehouse"></i> <strong>Bahía ocupada:</strong> ${vehiculo.bahia_asignada}
                    </div>
                `;
            }
        } else if (esReparacion) {
            badgeHtml = `
                <span class="asignacion-badge reparacion">
                    <i class="fas fa-wrench"></i> Reparación
                </span>
            `;
            
            const bahiaInfo = vehiculo.bahia_asignada ? 
                `<div class="bahia-info" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(37, 99, 235, 0.1); border-radius: var(--radius-sm);">
                    <i class="fas fa-warehouse"></i> <strong>Bahía asignada:</strong> ${vehiculo.bahia_asignada}
                </div>` : '';
            
            if (!trabajoIniciado) {
                botonesHtml = `
                    <button class="btn-sm btn-primary-sm" onclick="iniciarReparacion(${vehiculo.orden_id})">
                        <i class="fas fa-play-circle"></i> Iniciar Reparación
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    ${bahiaInfo}
                `;
            } else if (estadoGlobal === 'EnProceso') {
                botonesHtml = `
                    <button class="btn-sm btn-warning-sm" onclick="pausarReparacion(${vehiculo.orden_id})">
                        <i class="fas fa-pause"></i> Pausar
                    </button>
                    <button class="btn-sm btn-danger-sm" onclick="finalizarReparacion(${vehiculo.orden_id})">
                        <i class="fas fa-flag-checkered"></i> Finalizar
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    ${bahiaInfo}
                `;
            } else if (estadoGlobal === 'EnPausa') {
                botonesHtml = `
                    <button class="btn-sm btn-success-sm" onclick="reanudarReparacion(${vehiculo.orden_id})">
                        <i class="fas fa-play"></i> Reanudar
                    </button>
                    <button class="btn-sm btn-danger-sm" onclick="finalizarReparacion(${vehiculo.orden_id})">
                        <i class="fas fa-flag-checkered"></i> Finalizar
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    ${bahiaInfo}
                `;
            }
        }
        
        return `
            <div class="vehiculo-card" data-orden-id="${vehiculo.orden_id}">
                <div class="card-header">
                    <div class="vehiculo-info">
                        <div class="vehiculo-icon">
                            <i class="fas ${esDiagnostico ? 'fa-stethoscope' : 'fa-wrench'}"></i>
                        </div>
                        <div class="vehiculo-titulo">
                            <h3>${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</h3>
                            <span class="placa">${escapeHtml(vehiculo.vehiculo.placa)}</span>
                        </div>
                    </div>
                    ${badgeHtml}
                </div>
                
                <div class="card-body">
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-tag"></i> Orden:</span>
                        <span class="detalle-value">${escapeHtml(vehiculo.codigo_unico)}</span>
                    </div>
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-calendar"></i> Ingreso:</span>
                        <span class="detalle-value">${formatFecha(vehiculo.fecha_ingreso)}</span>
                    </div>
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-road"></i> Kilometraje:</span>
                        <span class="detalle-value">${vehiculo.vehiculo.kilometraje?.toLocaleString() || 'N/A'} km</span>
                    </div>
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-user"></i> Cliente:</span>
                        <span class="detalle-value">${escapeHtml(vehiculo.cliente.nombre)}</span>
                    </div>
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-phone"></i> Contacto:</span>
                        <span class="detalle-value">${escapeHtml(vehiculo.cliente.contacto || 'No registrado')}</span>
                    </div>
                </div>
                
                <div class="card-footer">
                    ${botonesHtml}
                </div>
            </div>
        `;
    }).join('');
}

function formatFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const fecha = new Date(fechaStr);
        if (isNaN(fecha.getTime())) return 'N/A';
        return fecha.toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// DIAGNÓSTICO - EMPEZAR TRABAJO - URL CORREGIDA
// =====================================================
let ordenSeleccionadaParaEmpezar = null;

window.empezarTrabajoDiagnostico = function(ordenId) {
    ordenSeleccionadaParaEmpezar = ordenId;
    
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        const infoHtml = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
            ${vehiculo.bahia_asignada ? `<p><strong>Bahía asignada:</strong> ${vehiculo.bahia_asignada}</p>` : '<p class="text-warning"><i class="fas fa-exclamation-triangle"></i> No hay bahía asignada</p>'}
        `;
        document.getElementById('empezarInfo').innerHTML = infoHtml;
    }
    document.getElementById('ordenIdEmpezar').value = ordenId;
    document.getElementById('empezarModal').classList.add('show');
};

window.cerrarEmpezarModal = function() {
    document.getElementById('empezarModal').classList.remove('show');
    document.getElementById('empezarInfo').innerHTML = '';
    document.getElementById('ordenIdEmpezar').value = '';
    ordenSeleccionadaParaEmpezar = null;
};

async function confirmarEmpezarDiagnostico() {
    const ordenId = document.getElementById('ordenIdEmpezar').value;
    
    cerrarEmpezarModal();
    showToast('Iniciando trabajo...', 'info');
    
    try {
        // URL CORREGIDA: /tecnico/empezar-diagnostico (sin /api/)
        const response = await fetch('/tecnico/empezar-diagnostico', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message || 'Trabajo iniciado correctamente', 'success');
            cargarVehiculos();
        } else {
            if (data.bahia_ocupada) {
                showToast(data.error, 'warning');
            } else {
                showToast(data.error || 'Error al iniciar', 'error');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// DIAGNÓSTICO - CREAR Y ENVIAR
// =====================================================
function crearDiagnostico(ordenId) {
    sessionStorage.setItem('orden_diagnostico_id', ordenId);
    window.location.href = `/tecnico_mecanico/diagnostico.html?orden=${ordenId}`;
}

// =====================================================
// REPARACIÓN - INICIAR - URL CORREGIDA
// =====================================================
let ordenSeleccionadaParaReparacion = null;

window.iniciarReparacion = function(ordenId) {
    ordenSeleccionadaParaReparacion = ordenId;
    
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        const infoHtml = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
            ${vehiculo.bahia_asignada ? `<p><strong>Bahía asignada:</strong> ${vehiculo.bahia_asignada}</p>` : ''}
        `;
        document.getElementById('iniciarInfo').innerHTML = infoHtml;
    }
    document.getElementById('ordenIdIniciar').value = ordenId;
    document.getElementById('iniciarModal').classList.add('show');
};

window.cerrarIniciarModal = function() {
    document.getElementById('iniciarModal').classList.remove('show');
    document.getElementById('iniciarInfo').innerHTML = '';
    document.getElementById('ordenIdIniciar').value = '';
    ordenSeleccionadaParaReparacion = null;
};

async function confirmarInicioReparacion() {
    const ordenId = document.getElementById('ordenIdIniciar').value;
    
    cerrarIniciarModal();
    showToast('Iniciando reparación...', 'info');
    
    try {
        // URL CORREGIDA: /tecnico/iniciar-reparacion (sin /api/)
        const response = await fetch('/tecnico/iniciar-reparacion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message || 'Reparación iniciada correctamente', 'success');
            cargarVehiculos();
        } else {
            if (data.bahia_ocupada) {
                showToast(data.error, 'warning');
            } else {
                showToast(data.error || 'Error al iniciar', 'error');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// REPARACIÓN - PAUSAR - URL CORREGIDA
// =====================================================
window.pausarReparacion = function(ordenId) {
    document.getElementById('ordenIdPausa').value = ordenId;
    document.getElementById('motivoPausa').value = '';
    document.getElementById('pausaModal').classList.add('show');
};

window.cerrarPausaModal = function() {
    document.getElementById('pausaModal').classList.remove('show');
    document.getElementById('motivoPausa').value = '';
    document.getElementById('ordenIdPausa').value = '';
};

async function confirmarPausaReparacion() {
    const ordenId = document.getElementById('ordenIdPausa').value;
    const motivo = document.getElementById('motivoPausa').value.trim();
    
    if (!motivo) {
        showToast('Debes especificar el motivo de la pausa', 'warning');
        return;
    }
    
    cerrarPausaModal();
    showToast('Pausando reparación...', 'info');
    
    try {
        // URL CORREGIDA: /tecnico/pausar-reparacion (sin /api/)
        const response = await fetch('/tecnico/pausar-reparacion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId), motivo })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Reparación pausada correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al pausar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// REPARACIÓN - REANUDAR - URL CORREGIDA
// =====================================================
window.reanudarReparacion = function(ordenId) {
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        const infoHtml = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
            ${vehiculo.bahia_asignada ? `<p><strong>Bahía asignada:</strong> ${vehiculo.bahia_asignada}</p>` : ''}
        `;
        document.getElementById('reanudarInfo').innerHTML = infoHtml;
    }
    document.getElementById('ordenIdReanudar').value = ordenId;
    document.getElementById('reanudarModal').classList.add('show');
};

window.cerrarReanudarModal = function() {
    document.getElementById('reanudarModal').classList.remove('show');
    document.getElementById('reanudarInfo').innerHTML = '';
    document.getElementById('ordenIdReanudar').value = '';
};

async function confirmarReanudarReparacion() {
    const ordenId = document.getElementById('ordenIdReanudar').value;
    
    cerrarReanudarModal();
    showToast('Reanudando reparación...', 'info');
    
    try {
        // URL CORREGIDA: /tecnico/reanudar-reparacion (sin /api/)
        const response = await fetch('/tecnico/reanudar-reparacion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Reparación reanudada correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al reanudar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// REPARACIÓN - FINALIZAR - URL CORREGIDA
// =====================================================
window.finalizarReparacion = async function(ordenId) {
    if (!confirm('¿Estás seguro de que deseas finalizar esta reparación? La bahía quedará libre.')) {
        return;
    }
    
    showToast('Finalizando reparación...', 'info');
    
    try {
        // URL CORREGIDA: /tecnico/finalizar-reparacion (sin /api/)
        const response = await fetch('/tecnico/finalizar-reparacion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Reparación finalizada correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al finalizar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
};

// =====================================================
// DETALLE DE ORDEN - URL CORREGIDA
// =====================================================
window.verDetalle = async function(ordenId) {
    showToast('Cargando detalles...', 'info');
    
    try {
        // URL CORREGIDA: /tecnico/detalle-orden/${ordenId} (sin /api/)
        const response = await fetch(`/tecnico/detalle-orden/${ordenId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al cargar detalle');
        }
        
        const detalle = data.detalle;
        const tipoAsignacion = detalle.tipo_asignacion;
        
        const fotos = detalle.recepcion?.fotos || {};
        const fotosArray = Object.entries(fotos).filter(([_, url]) => url && url !== '');
        
        const kilometraje = detalle.vehiculo?.kilometraje ? 
            `${parseInt(detalle.vehiculo.kilometraje).toLocaleString()} km` : 'N/A';
        
        const anio = detalle.vehiculo?.anio && detalle.vehiculo.anio !== 'N/A' ? 
            detalle.vehiculo.anio : 'No especificado';
        
        const marcaModelo = `${detalle.vehiculo?.marca || ''} ${detalle.vehiculo?.modelo || ''}`.trim() || 'No especificado';
        
        const bahiaInfo = detalle.planificacion?.bahia_asignada ? 
            `<div><strong>Bahía asignada:</strong> ${detalle.planificacion.bahia_asignada}</div>` : '';
        
        const diagnosticoInfo = detalle.diagnostico_tecnico?.informe ? `
            <div class="modal-section">
                <h3><i class="fas fa-stethoscope"></i> Diagnóstico Técnico (v${detalle.diagnostico_tecnico.version || 1})</h3>
                <div class="diagnostico-box">
                    <p>${escapeHtml(detalle.diagnostico_tecnico.informe)}</p>
                    ${detalle.diagnostico_tecnico.audio_url ? `
                        <div class="audio-player" style="margin-top: 0.75rem;">
                            <audio controls preload="none">
                                <source src="${detalle.diagnostico_tecnico.audio_url}" type="audio/mpeg">
                                Tu navegador no soporta audio.
                            </audio>
                        </div>
                    ` : ''}
                    <div style="margin-top: 0.5rem;">
                        <strong>Estado:</strong> 
                        <span class="estado-badge ${detalle.diagnostico_tecnico.estado === 'aprobado' ? 'proceso' : (detalle.diagnostico_tecnico.estado === 'rechazado' ? 'pausa' : '')}">
                            ${detalle.diagnostico_tecnico.estado === 'aprobado' ? '✅ Aprobado' : (detalle.diagnostico_tecnico.estado === 'rechazado' ? '❌ Rechazado' : '⏳ Pendiente')}
                        </span>
                    </div>
                </div>
            </div>
        ` : '';
        
        const detalleHtml = `
            <div style="display: grid; gap: 1rem;">
                <div class="modal-section">
                    <h3><i class="fas fa-clipboard-list"></i> Información de la Orden</h3>
                    <div class="detalle-grid">
                        <div><strong>Código:</strong> ${escapeHtml(detalle.orden?.codigo_unico || 'N/A')}</div>
                        <div><strong>Estado:</strong> 
                            <span class="estado-badge ${detalle.orden?.estado_global === 'EnProceso' ? 'proceso' : 'pausa'}" style="display: inline-flex; font-size: 0.7rem;">
                                ${detalle.orden?.estado_global === 'EnProceso' ? 'En Proceso' : detalle.orden?.estado_global || 'N/A'}
                            </span>
                        </div>
                        <div><strong>Fecha Ingreso:</strong> ${formatFecha(detalle.orden?.fecha_ingreso)}</div>
                        ${bahiaInfo}
                        <div><strong>Tipo:</strong> 
                            <span class="asignacion-badge ${tipoAsignacion === 'diagnostico' ? 'diagnostico' : 'reparacion'}">
                                <i class="fas ${tipoAsignacion === 'diagnostico' ? 'fa-stethoscope' : 'fa-wrench'}"></i>
                                ${tipoAsignacion === 'diagnostico' ? 'Diagnóstico' : 'Reparación'}
                            </span>
                        </div>
                    </div>
                </div>
                
                <div class="modal-section">
                    <h3><i class="fas fa-car"></i> Datos del Vehículo</h3>
                    <div class="detalle-grid">
                        <div><strong>Placa:</strong> ${escapeHtml(detalle.vehiculo?.placa || 'No registrada')}</div>
                        <div><strong>Marca/Modelo:</strong> ${escapeHtml(marcaModelo)}</div>
                        <div><strong>Año:</strong> ${escapeHtml(anio)}</div>
                        <div><strong>Kilometraje:</strong> ${kilometraje}</div>
                    </div>
                </div>
                
                <div class="modal-section">
                    <h3><i class="fas fa-user"></i> Datos del Cliente</h3>
                    <div class="detalle-grid">
                        <div><strong>Nombre:</strong> ${escapeHtml(detalle.cliente?.nombre || 'No registrado')}</div>
                        <div><strong>Teléfono:</strong> ${escapeHtml(detalle.cliente?.telefono || 'No registrado')}</div>
                        <div><strong>Email:</strong> ${escapeHtml(detalle.cliente?.email || 'No registrado')}</div>
                    </div>
                </div>
                
                <div class="modal-section">
                    <h3><i class="fas fa-comment"></i> Problema Reportado</h3>
                    <div class="diagnostico-box">
                        <p>${escapeHtml(detalle.recepcion?.transcripcion_problema || 'No hay descripción del problema')}</p>
                        ${detalle.recepcion?.audio_url ? `
                            <div class="audio-player" style="margin-top: 0.75rem;">
                                <audio controls preload="none">
                                    <source src="${detalle.recepcion.audio_url}" type="audio/mpeg">
                                    Tu navegador no soporta audio.
                                </audio>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                ${diagnosticoInfo}
                
                ${fotosArray.length > 0 ? `
                    <div class="modal-section">
                        <h3><i class="fas fa-images"></i> Fotos del Vehículo (${fotosArray.length})</h3>
                        <div class="fotos-grid">
                            ${fotosArray.map(([nombre, url]) => `
                                <div class="foto-item" onclick="verFoto('${url}')">
                                    <img src="${url}" alt="${nombre}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238E8E93\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Crect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'%3E%3C/rect%3E%3Ccircle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'%3E%3C/circle%3E%3Cpolyline points=\'21 15 16 10 5 21\'%3E%3C/polyline%3E%3C/svg%3E'">
                                    <span>${escapeHtml(nombre)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        document.getElementById('detalleBody').innerHTML = detalleHtml;
        document.getElementById('detalleModal').classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message, 'error');
    }
};

window.verFoto = function(url) {
    const modal = document.getElementById('fotoModal');
    const imagen = document.getElementById('fotoAmpliada');
    if (imagen) imagen.src = url;
    if (modal) modal.classList.add('show');
};

window.cerrarFotoModal = function() {
    const modal = document.getElementById('fotoModal');
    if (modal) modal.classList.remove('show');
};

window.cerrarDetalleModal = function() {
    document.getElementById('detalleModal').classList.remove('show');
};

// =====================================================
// COMUNICADOS - URLs CORREGIDAS
// =====================================================
window.cargarComunicados = async function() {
    const comunicadosList = document.getElementById('comunicadosList');
    if (!comunicadosList) return;
    
    try {
        const vistosStorage = localStorage.getItem('comunicados_vistos');
        if (vistosStorage) {
            comunicadosVistos = JSON.parse(vistosStorage);
        }
        
        const timestamp = new Date().getTime();
        // URL CORREGIDA: /tecnico/comunicados (sin /api/)
        const response = await fetch(`/tecnico/comunicados?_=${timestamp}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar comunicados');
        }
        
        const comunicados = result.data || [];
        const badge = document.getElementById('comunicadosBadge');
        
        const noLeidos = comunicados.filter(c => !comunicadosVistos.includes(c.id)).length;
        if (badge) {
            badge.textContent = noLeidos;
            badge.style.backgroundColor = noLeidos > 0 ? 'var(--rojo-primario)' : 'var(--gris-medio)';
        }
        
        if (comunicados.length === 0) {
            comunicadosList.innerHTML = `
                <div class="empty-comunicados">
                    <i class="fas fa-bullhorn"></i>
                    <p>No hay comunicados disponibles</p>
                </div>
            `;
            return;
        }
        
        comunicados.sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
        
        comunicadosList.innerHTML = comunicados.map(com => {
            let prioridadIcon = '';
            let prioridadClass = '';
            const esNuevo = !comunicadosVistos.includes(com.id);
            const nuevoClass = esNuevo ? 'nuevo' : '';
            
            if (com.prioridad === 'importante') {
                prioridadIcon = '<i class="fas fa-exclamation-triangle importante"></i>';
                prioridadClass = 'importante';
            } else if (com.prioridad === 'urgente') {
                prioridadIcon = '<i class="fas fa-bell urgente"></i>';
                prioridadClass = 'urgente';
            } else {
                prioridadIcon = '<i class="fas fa-info-circle"></i>';
                prioridadClass = 'normal';
            }
            
            const fechaFormateada = formatFechaComunicado(com.fecha_creacion);
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = com.contenido;
            const textoPlano = tempDiv.textContent || tempDiv.innerText || '';
            const textoResumido = textoPlano.length > 100 ? textoPlano.substring(0, 100) + '...' : textoPlano;
            
            return `
                <div class="comunicado-item ${prioridadClass} ${nuevoClass}" onclick="verComunicadoCompleto(${com.id})" data-id="${com.id}">
                    <div class="comunicado-titulo">
                        ${prioridadIcon}
                        <strong>${escapeHtml(com.titulo)}</strong>
                        <span class="comunicado-fecha">
                            <i class="far fa-clock"></i> ${fechaFormateada}
                        </span>
                    </div>
                    <div class="comunicado-contenido">
                        ${escapeHtml(textoResumido)}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error cargando comunicados:', error);
        const comunicadosList = document.getElementById('comunicadosList');
        if (comunicadosList) {
            comunicadosList.innerHTML = `
                <div class="empty-comunicados">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar comunicados</p>
                </div>
            `;
        }
    }
};

function verComunicadoCompleto(id) {
    if (!comunicadosVistos.includes(id)) {
        comunicadosVistos.push(id);
        localStorage.setItem('comunicados_vistos', JSON.stringify(comunicadosVistos));
        
        const badge = document.getElementById('comunicadosBadge');
        if (badge) {
            const comunicadosList = document.querySelectorAll('.comunicado-item');
            const noLeidos = Array.from(comunicadosList).filter(item => !comunicadosVistos.includes(parseInt(item.dataset.id))).length;
            badge.textContent = noLeidos;
            badge.style.backgroundColor = noLeidos > 0 ? 'var(--rojo-primario)' : 'var(--gris-medio)';
        }
        
        const elemento = document.querySelector(`.comunicado-item[data-id="${id}"]`);
        if (elemento) elemento.classList.remove('nuevo');
    }
    
    // URL CORREGIDA: /tecnico/comunicados/${id} (sin /api/)
    fetch(`/tecnico/comunicados/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => response.json())
    .then(result => {
        if (result.success && result.data) {
            const com = result.data;
            const fechaFormateada = formatFechaComunicado(com.fecha_creacion);
            
            let prioridadBadge = '';
            if (com.prioridad === 'importante') {
                prioridadBadge = '<span class="prioridad-badge importante">Importante</span>';
            } else if (com.prioridad === 'urgente') {
                prioridadBadge = '<span class="prioridad-badge urgente">Urgente</span>';
            } else {
                prioridadBadge = '<span class="prioridad-badge normal">Normal</span>';
            }
            
            const modalContent = `
                <div class="modal-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                        <h3 style="margin: 0;">${escapeHtml(com.titulo)}</h3>
                        ${prioridadBadge}
                    </div>
                    <div class="comunicado-meta">
                        <span><i class="far fa-calendar-alt"></i> ${fechaFormateada}</span>
                    </div>
                    <div class="comunicado-contenido-completo">
                        ${com.contenido}
                    </div>
                </div>
            `;
            
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.style.display = 'flex';
            modal.innerHTML = `
                <div class="modal-content modal-md">
                    <div class="modal-header">
                        <h2><i class="fas fa-bullhorn"></i> Comunicado</h2>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${modalContent}
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cerrar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('Error al cargar el comunicado', 'error');
    });
}

// =====================================================
// CIERRE DE SESIÓN
// =====================================================
window.cerrarSesion = function() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    localStorage.removeItem('furia_selected_role');
    localStorage.removeItem('furia_selected_role_user');
    window.location.href = '/';
};

// =====================================================
// ESTILOS ADICIONALES
// =====================================================
const estilosAdicionales = document.createElement('style');
estilosAdicionales.textContent = `
    .asignacion-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.3rem 0.7rem;
        border-radius: var(--radius-full);
        font-size: 0.7rem;
        font-weight: 600;
    }
    .asignacion-badge.diagnostico {
        background: rgba(37, 99, 235, 0.15);
        color: var(--azul-acento);
    }
    .asignacion-badge.reparacion {
        background: rgba(16, 185, 129, 0.15);
        color: var(--verde-exito);
    }
    .btn-warning-sm {
        background: var(--ambar-alerta);
        color: var(--blanco);
    }
    .btn-warning-sm:hover:not(:disabled) {
        background: #d97706;
        transform: translateY(-1px);
    }
    .btn-warning-sm:disabled,
    .btn-success-sm:disabled,
    .btn-danger-sm:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }
    .prioridad-badge {
        display: inline-block;
        padding: 0.2rem 0.6rem;
        border-radius: var(--radius-full);
        font-size: 0.7rem;
        font-weight: 600;
    }
    .prioridad-badge.normal {
        background: var(--gris-medio);
        color: var(--gris-texto);
    }
    .prioridad-badge.importante {
        background: rgba(245, 158, 11, 0.15);
        color: var(--ambar-alerta);
    }
    .prioridad-badge.urgente {
        background: rgba(193, 18, 31, 0.15);
        color: var(--rojo-primario);
    }
    .comunicado-meta {
        font-size: 0.7rem;
        color: var(--gris-texto);
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-color);
    }
    .comunicado-contenido-completo {
        font-size: 0.9rem;
        line-height: 1.6;
        color: var(--blanco);
    }
    .modal-md {
        max-width: 550px;
    }
    .comunicado-item.nuevo {
        animation: highlight 2s ease;
    }
    @keyframes highlight {
        0% {
            background: rgba(193, 18, 31, 0.2);
        }
        100% {
            background: transparent;
        }
    }
    .bahia-info {
        margin-top: 0.5rem;
        padding: 0.5rem;
        background: rgba(37, 99, 235, 0.1);
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
    }
    .text-warning {
        color: var(--ambar-alerta);
    }
`;
document.head.appendChild(estilosAdicionales);

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const tokenValido = await verificarToken();
    if (!tokenValido) return;
    
    mostrarFechaActual();
    mostrarNombreUsuario();
    mostrarIndicadorRoles();
    await cargarVehiculos();
    await cargarComunicados();
    
    const confirmarEmpezarBtn = document.getElementById('confirmarEmpezarBtn');
    if (confirmarEmpezarBtn) {
        confirmarEmpezarBtn.onclick = confirmarEmpezarDiagnostico;
    }
    
    const confirmarInicioBtn = document.getElementById('confirmarInicioBtn');
    if (confirmarInicioBtn) {
        confirmarInicioBtn.onclick = confirmarInicioReparacion;
    }
    
    const confirmarPausaBtn = document.getElementById('confirmarPausaBtn');
    if (confirmarPausaBtn) {
        confirmarPausaBtn.onclick = confirmarPausaReparacion;
    }
    
    const confirmarReanudarBtn = document.getElementById('confirmarReanudarBtn');
    if (confirmarReanudarBtn) {
        confirmarReanudarBtn.onclick = confirmarReanudarReparacion;
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
    
    setInterval(() => {
        if (document.visibilityState === 'visible' && token) {
            cargarVehiculos();
            cargarComunicados();
        }
    }, 30000);
    
    console.log('✅ misvehiculos.js cargado correctamente');
});