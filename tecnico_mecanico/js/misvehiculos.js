// =====================================================
// MIS VEHÍCULOS - TÉCNICO MECÁNICO
// VERSIÓN CORREGIDA - SIN SELECTOR DE ROLES
// FURIA MOTOR COMPANY SRL
// =====================================================

// Configuración de roles
const ROLE_CONFIG = {
    'jefe_operativo': { redirect: '/jefe_operativo/dashboard.html' },
    'jefe_taller': { redirect: '/jefe_taller/dashboard.html' },
    'tecnico': { redirect: '/tecnico/mis-vehiculos' },
    'tecnico_mecanico': { redirect: '/tecnico/mis-vehiculos' },
    'encargado_repuestos': { redirect: '/encargado_rep_almacen/dashboard.html' },
    'cliente': { redirect: '/cliente/dashboard.html' }
};

// Estado global
let vehiculosAsignados = [];
let token = null;
let usuarioActual = null;
let rolesUsuario = [];
let comunicadosVistos = [];

// Variable para items de solicitud (NO redeclarar si ya existe)
if (typeof itemsSolicitud === 'undefined') {
    var itemsSolicitud = [];
}

// =====================================================
// UTILIDADES
// =====================================================
function getToken() {
    const localToken = localStorage.getItem('furia_token');
    if (localToken) return localToken;
    const fallbackToken = localStorage.getItem('token');
    if (fallbackToken) return fallbackToken;
    return null;
}

function mostrarFechaActual() {
    const fechaSpan = document.getElementById('currentDate');
    if (fechaSpan) {
        const hoy = new Date();
        const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
        fechaSpan.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
}

function formatFechaComunicado(fechaISO) {
    if (!fechaISO) return 'Fecha no disponible';
    const fecha = new Date(fechaISO);
    const ahora = new Date();
    const diffMs = ahora - fecha;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Justo ahora';
    if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
    if (diffHours < 24) return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
    if (diffDays < 7) return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
    return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const fecha = new Date(fechaStr);
        if (isNaN(fecha.getTime())) return 'N/A';
        return fecha.toLocaleDateString('es-ES', { 
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
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

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;`;
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    toast.style.cssText = `
        background: var(--bg-card); color: var(--blanco); padding: 0.75rem 1.25rem;
        border-radius: 10px; display: flex; align-items: center; gap: 0.75rem;
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

window.recargarDatos = function() {
    cargarVehiculos();
    cargarComunicados();
};

function normalizarRol(rol) {
    if (!rol) return null;
    const rolLower = rol.toLowerCase();
    const mapping = {
        'tecnico': 'tecnico', 'tecnico_mecanico': 'tecnico',
        'jefe_taller': 'jefe_taller', 'jefe_operativo': 'jefe_operativo',
        'encargado_repuestos': 'encargado_repuestos', 'cliente': 'cliente',
        'admin': 'admin', 'administrador': 'admin'
    };
    return mapping[rolLower] || rolLower;
}

function tieneRolTecnico(roles) {
    if (!roles || !Array.isArray(roles)) return false;
    return roles.some(rol => normalizarRol(rol) === 'tecnico');
}

// =====================================================
// AUTENTICACIÓN
// =====================================================
async function verificarToken() {
    token = getToken();
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const userData = localStorage.getItem('furia_user');
        if (userData) {
            usuarioActual = JSON.parse(userData);
            rolesUsuario = (usuarioActual.roles || []).map(r => normalizarRol(r));
        }
        
        const response = await fetch('/tecnico/verify-token', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        if (data.user) {
            usuarioActual = data.user;
            rolesUsuario = (data.user.roles || []).map(r => normalizarRol(r));
            localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
        }
        
        if (!tieneRolTecnico(rolesUsuario)) {
            showToast('No tienes permisos para acceder a esta sección', 'error');
            if (rolesUsuario.includes('jefe_operativo')) window.location.href = '/jefe_operativo/dashboard.html';
            else if (rolesUsuario.includes('jefe_taller')) window.location.href = '/jefe_taller/dashboard.html';
            else if (rolesUsuario.includes('encargado_repuestos')) window.location.href = '/encargado_rep_almacen/dashboard.html';
            else if (rolesUsuario.includes('cliente')) window.location.href = '/cliente/dashboard.html';
            else window.location.href = '/';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = '/';
        return false;
    }
}

// =====================================================
// FUNCIÓN ELIMINADA: mostrarIndicadorRoles()
// Ya no se muestra el selector de roles
// =====================================================

function mostrarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan && usuarioActual) {
        userNameSpan.textContent = usuarioActual.nombre || usuarioActual.email || 'Usuario';
    }
}

// =====================================================
// CARGAR VEHÍCULOS
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
        const response = await fetch(`/tecnico/get-mis-vehiculos?_=${timestamp}`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
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
        if (emptyState) emptyState.style.display = 'block';
        showToast(error.message, 'error');
    }
}

// =====================================================
// RENDERIZADO DE VEHÍCULOS
// =====================================================
function renderVehiculos() {
    const grid = document.getElementById('vehiculosGrid');
    if (!grid) return;
    
    if (!vehiculosAsignados || vehiculosAsignados.length === 0) {
        grid.innerHTML = '<div class="no-data">No hay vehículos asignados</div>';
        return;
    }
    
    grid.innerHTML = vehiculosAsignados.map(vehiculo => {
        const estadoGlobal = vehiculo.estado_global;
        const trabajoIniciado = vehiculo.trabajo_iniciado || false;
        
        const bahiaInfo = vehiculo.bahia_asignada ? 
            `<div class="bahia-info"><i class="fas fa-warehouse"></i> Bahía: ${vehiculo.bahia_asignada}</div>` : '';
        
        let badgeHtml = '';
        let botonesHtml = '';
        
        console.log(`🎯 Renderizando: ID=${vehiculo.orden_id}, Estado=${estadoGlobal}`);
        
        // ============ ESTADOS FINALES ============
        if (estadoGlobal === 'VehiculoArmado') {
            badgeHtml = `<span class="asignacion-badge armado-completado"><i class="fas fa-check-circle"></i> ✅ VEHÍCULO ARMADO</span>`;
            botonesHtml = `
                <div class="botones-container">
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </div>
                ${bahiaInfo}
                <div class="estado-final-info">
                    <i class="fas fa-info-circle"></i> El vehículo ha sido armado. Esperando instrucciones del Jefe de Taller.
                </div>
            `;
        }
        else if (estadoGlobal === 'ReparacionCompletada') {
            badgeHtml = `<span class="asignacion-badge reparacion-completada"><i class="fas fa-check-circle"></i> ✅ REPARACIÓN COMPLETADA</span>`;
            botonesHtml = `
                <div class="botones-container">
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </div>
                ${bahiaInfo}
                <div class="estado-final-info">
                    <i class="fas fa-info-circle"></i> Reparación completada. Esperando confirmación del Jefe de Taller.
                </div>
            `;
        }
        else if (estadoGlobal === 'Finalizado') {
            badgeHtml = `<span class="asignacion-badge finalizado"><i class="fas fa-flag-checkered"></i> 🏁 FINALIZADO</span>`;
            botonesHtml = `
                <div class="botones-container">
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </div>
                ${bahiaInfo}
                <div class="estado-final-info">
                    <i class="fas fa-check-circle"></i> Trabajo finalizado. A la espera de entrega al cliente.
                </div>
            `;
        }
        else if (estadoGlobal === 'Entregado') {
            badgeHtml = `<span class="asignacion-badge entregado"><i class="fas fa-truck"></i> 🚗 ENTREGADO</span>`;
            botonesHtml = `
                <div class="botones-container">
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </div>
                <div class="estado-final-info">
                    <i class="fas fa-check-circle"></i> Vehículo entregado al cliente. Trabajo completado.
                </div>
            `;
        }
        // ============ CASO ARMADO ============
        else if (estadoGlobal === 'EnArmadoVehiculo') {
            badgeHtml = `<span class="asignacion-badge armado"><i class="fas fa-tools"></i> 🔧 ARMADO REQUERIDO</span>`;
            
            const instruccionesArmado = vehiculo.instrucciones_armado || '';
            let instruccionesHtml = '';
            if (instruccionesArmado) {
                const textoResumido = instruccionesArmado.length > 100 ? instruccionesArmado.substring(0, 100) + '...' : instruccionesArmado;
                instruccionesHtml = `
                    <div class="instrucciones-resumen" style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(245, 158, 11, 0.05); border-radius: var(--radius-md); border-left: 3px solid var(--ambar-alerta);">
                        <div style="font-size: 0.7rem; color: var(--ambar-alerta); margin-bottom: 0.5rem;"><i class="fas fa-clipboard-list"></i> Instrucciones del Jefe de Taller:</div>
                        <div style="font-size: 0.75rem; color: var(--gris-texto);">${escapeHtml(textoResumido)}</div>
                    </div>
                `;
            }
            
            botonesHtml = `
                <div class="botones-container">
                    <button class="btn-sm btn-armado-completar" onclick="marcarArmadoCompletado(${vehiculo.orden_id})">
                        <i class="fas fa-check-circle"></i> ✅ Marcar Armado Completado
                    </button>
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </div>
                ${bahiaInfo}
                ${instruccionesHtml}
            `;
        }
        // ============ CASO REPARACIÓN O PAUSA ============
        else if (estadoGlobal === 'EnReparacion' || estadoGlobal === 'EnPausa') {
            if (estadoGlobal === 'EnReparacion') {
                badgeHtml = `<span class="asignacion-badge reparacion"><i class="fas fa-wrench"></i> 🔧 EN REPARACIÓN</span>`;
            } else {
                badgeHtml = `<span class="asignacion-badge reparacion"><i class="fas fa-pause-circle"></i> ⏸️ EN PAUSA</span>`;
            }
            
            const tieneSolicitudesPendientes = vehiculo.solicitudes_repuestos_pendientes || false;
            const advertenciaSolicitudes = tieneSolicitudesPendientes ? 
                `<div class="solicitud-pendiente-warning" style="margin-top: 0.5rem; padding: 0.3rem; background: rgba(245, 158, 11, 0.1); border-radius: var(--radius-sm); font-size: 0.7rem; text-align: center;">
                    <i class="fas fa-clock"></i> Hay solicitudes de repuestos pendientes
                </div>` : '';
            
            if (estadoGlobal === 'EnPausa') {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-success-sm" onclick="reanudarReparacion(${vehiculo.orden_id})">
                            <i class="fas fa-play"></i> Reanudar Trabajo
                        </button>
                        <button class="btn-sm btn-primary-sm" onclick="solicitarRepuestosSinPausa(${vehiculo.orden_id})">
                            <i class="fas fa-shopping-cart"></i> Solicitar Repuesto
                        </button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                            <i class="fas fa-eye"></i> Ver Detalle
                        </button>
                        <button class="btn-sm btn-secondary-sm" onclick="verHistorialSolicitudes(${vehiculo.orden_id})">
                            <i class="fas fa-history"></i> Historial Solicitudes
                        </button>
                    </div>
                    ${bahiaInfo}
                    ${advertenciaSolicitudes}
                `;
            } else {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-warning-sm" onclick="pausarReparacionManual(${vehiculo.orden_id})">
                            <i class="fas fa-pause"></i> Pausar Trabajo
                        </button>
                        <button class="btn-sm btn-primary-sm" onclick="solicitarRepuestosSinPausa(${vehiculo.orden_id})">
                            <i class="fas fa-shopping-cart"></i> Solicitar Repuesto
                        </button>
                        <button class="btn-sm btn-danger-sm" onclick="mostrarFinalizarModal(${vehiculo.orden_id})">
                            <i class="fas fa-flag-checkered"></i> Marcar Completada
                        </button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                            <i class="fas fa-eye"></i> Ver Detalle
                        </button>
                        <button class="btn-sm btn-secondary-sm" onclick="verHistorialSolicitudes(${vehiculo.orden_id})">
                            <i class="fas fa-history"></i> Historial Solicitudes
                        </button>
                    </div>
                    ${bahiaInfo}
                    ${advertenciaSolicitudes}
                `;
            }
        }
        // ============ CASO DIAGNÓSTICO ============
        else {
            const diagnosticoEstado = vehiculo.diagnostico_estado;
            const diagnosticoVersion = vehiculo.diagnostico_version || 1;
            
            badgeHtml = `<span class="asignacion-badge diagnostico"><i class="fas fa-stethoscope"></i> Diagnóstico v${diagnosticoVersion}</span>`;
            
            if (diagnosticoEstado === 'aprobado') {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-success-sm" disabled><i class="fas fa-check-circle"></i> Diagnóstico Aprobado</button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                    </div>
                    ${bahiaInfo}
                `;
            } else if (diagnosticoEstado === 'rechazado') {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-warning-sm" onclick="crearDiagnostico(${vehiculo.orden_id})"><i class="fas fa-edit"></i> Rehacer Diagnóstico</button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                    </div>
                    ${bahiaInfo}
                `;
            } else if (!trabajoIniciado && !diagnosticoEstado) {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-primary-sm" onclick="empezarTrabajoDiagnostico(${vehiculo.orden_id})"><i class="fas fa-play-circle"></i> Empezar Trabajo</button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                    </div>
                    ${bahiaInfo}
                `;
            } else if (trabajoIniciado && (!diagnosticoEstado || diagnosticoEstado === 'pendiente')) {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-warning-sm" onclick="crearDiagnostico(${vehiculo.orden_id})"><i class="fas fa-stethoscope"></i> Realizar Diagnóstico</button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                    </div>
                    ${bahiaInfo}
                `;
            }
        }
        
        return `
            <div class="vehiculo-card" data-orden-id="${vehiculo.orden_id}" data-estado="${estadoGlobal}">
                <div class="card-header">
                    <div class="vehiculo-info">
                        <div class="vehiculo-icon">
                            <i class="fas ${estadoGlobal === 'EnReparacion' ? 'fa-wrench' : (estadoGlobal === 'EnPausa' ? 'fa-pause-circle' : (estadoGlobal === 'EnArmadoVehiculo' ? 'fa-tools' : 'fa-car'))}"></i>
                        </div>
                        <div class="vehiculo-titulo">
                            <h3>${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</h3>
                            <span class="placa">${escapeHtml(vehiculo.vehiculo.placa)}</span>
                        </div>
                    </div>
                    ${badgeHtml}
                </div>
                
                <div class="card-body">
                    <div class="detalle-row"><span class="detalle-label"><i class="fas fa-tag"></i> Orden:</span><span class="detalle-value">${escapeHtml(vehiculo.codigo_unico)}</span></div>
                    <div class="detalle-row"><span class="detalle-label"><i class="fas fa-calendar"></i> Ingreso:</span><span class="detalle-value">${formatFecha(vehiculo.fecha_ingreso)}</span></div>
                    <div class="detalle-row"><span class="detalle-label"><i class="fas fa-road"></i> Kilometraje:</span><span class="detalle-value">${vehiculo.vehiculo.kilometraje?.toLocaleString() || 'N/A'} km</span></div>
                    <div class="detalle-row"><span class="detalle-label"><i class="fas fa-user"></i> Cliente:</span><span class="detalle-value">${escapeHtml(vehiculo.cliente.nombre)}</span></div>
                    <div class="detalle-row"><span class="detalle-label"><i class="fas fa-phone"></i> Contacto:</span><span class="detalle-value">${escapeHtml(vehiculo.cliente.contacto || 'No registrado')}</span></div>
                </div>
                
                <div class="card-footer">
                    ${botonesHtml}
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// DIAGNÓSTICO
// =====================================================
window.empezarTrabajoDiagnostico = function(ordenId) {
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        document.getElementById('empezarInfo').innerHTML = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
            ${vehiculo.bahia_asignada ? `<p><strong>Bahía asignada:</strong> ${vehiculo.bahia_asignada}</p>` : '<p class="text-warning"><i class="fas fa-exclamation-triangle"></i> No hay bahía asignada</p>'}
        `;
    }
    document.getElementById('ordenIdEmpezar').value = ordenId;
    document.getElementById('empezarModal').classList.add('show');
};

window.cerrarEmpezarModal = function() {
    document.getElementById('empezarModal').classList.remove('show');
    document.getElementById('ordenIdEmpezar').value = '';
};

async function confirmarEmpezarDiagnostico() {
    const ordenId = document.getElementById('ordenIdEmpezar').value;
    cerrarEmpezarModal();
    showToast('Iniciando trabajo...', 'info');
    
    try {
        const response = await fetch('/tecnico/empezar-diagnostico', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('Trabajo iniciado correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al iniciar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

function crearDiagnostico(ordenId) {
    sessionStorage.setItem('orden_diagnostico_id', ordenId);
    window.location.href = `/tecnico_mecanico/diagnostico.html?orden=${ordenId}`;
}

// =====================================================
// REPARACIÓN - INICIAR
// =====================================================
window.iniciarReparacion = function(ordenId) {
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        document.getElementById('iniciarInfo').innerHTML = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
            ${vehiculo.bahia_asignada ? `<p><strong>Bahía asignada:</strong> ${vehiculo.bahia_asignada}</p>` : ''}
        `;
    }
    document.getElementById('ordenIdIniciar').value = ordenId;
    document.getElementById('iniciarModal').classList.add('show');
};

window.cerrarIniciarModal = function() {
    document.getElementById('iniciarModal').classList.remove('show');
    document.getElementById('ordenIdIniciar').value = '';
};

async function confirmarInicioReparacion() {
    const ordenId = document.getElementById('ordenIdIniciar').value;
    cerrarIniciarModal();
    showToast('Iniciando reparación...', 'info');
    
    try {
        const response = await fetch('/tecnico/iniciar-reparacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('Reparación iniciada correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al iniciar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// REPARACIÓN - PAUSAR MANUAL
// =====================================================
window.pausarReparacionManual = function(ordenId) {
    document.getElementById('ordenIdPausaManual').value = ordenId;
    document.getElementById('motivoPausaManual').value = '';
    document.getElementById('pausaManualModal').classList.add('show');
};

window.cerrarPausaManualModal = function() {
    document.getElementById('pausaManualModal').classList.remove('show');
    document.getElementById('motivoPausaManual').value = '';
    document.getElementById('ordenIdPausaManual').value = '';
};

async function confirmarPausaManual() {
    const ordenId = document.getElementById('ordenIdPausaManual').value;
    const motivo = document.getElementById('motivoPausaManual').value.trim();
    
    if (!motivo) {
        showToast('Debes especificar el motivo de la pausa', 'warning');
        return;
    }
    
    cerrarPausaManualModal();
    showToast('Pausando reparación...', 'info');
    
    try {
        const response = await fetch('/tecnico/pausar-reparacion-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id_orden: parseInt(ordenId), motivo: motivo })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('Reparación pausada correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al pausar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// SOLICITAR REPUESTOS SIN PAUSA
// =====================================================
window.solicitarRepuestosSinPausa = function(ordenId) {
    limpiarItemsSolicitud();
    document.getElementById('ordenIdSolicitud').value = ordenId;
    document.getElementById('motivoSolicitud').value = '';
    document.getElementById('solicitarRepuestosModal').classList.add('show');
};

window.cerrarSolicitarRepuestosModal = function() {
    document.getElementById('solicitarRepuestosModal').classList.remove('show');
    document.getElementById('ordenIdSolicitud').value = '';
    limpiarItemsSolicitud();
};

async function confirmarSolicitarRepuestos() {
    const ordenId = document.getElementById('ordenIdSolicitud').value;
    const motivo = document.getElementById('motivoSolicitud').value.trim();
    
    const itemsValidos = itemsSolicitud.filter(item => item.descripcion && item.descripcion.trim() !== '');
    
    if (itemsValidos.length === 0) {
        showToast('Debes agregar al menos un repuesto a solicitar', 'warning');
        return;
    }
    
    cerrarSolicitarRepuestosModal();
    showToast('Enviando solicitud de repuestos...', 'info');
    
    try {
        const response = await fetch('/tecnico/solicitar-repuestos-sin-pausa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ 
                id_orden: parseInt(ordenId), 
                observaciones: motivo || 'Sin observaciones adicionales',
                items: itemsValidos
            })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Solicitud de repuestos enviada correctamente', 'success');
            limpiarItemsSolicitud();
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al enviar solicitud', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// REPARACIÓN - REANUDAR
// =====================================================
window.reanudarReparacion = function(ordenId) {
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        document.getElementById('reanudarInfo').innerHTML = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
            ${vehiculo.bahia_asignada ? `<p><strong>Bahía asignada:</strong> ${vehiculo.bahia_asignada}</p>` : ''}
        `;
    }
    document.getElementById('ordenIdReanudar').value = ordenId;
    document.getElementById('reanudarModal').classList.add('show');
};

window.cerrarReanudarModal = function() {
    document.getElementById('reanudarModal').classList.remove('show');
    document.getElementById('ordenIdReanudar').value = '';
};

async function confirmarReanudarReparacion() {
    const ordenId = document.getElementById('ordenIdReanudar').value;
    cerrarReanudarModal();
    showToast('Reanudando reparación...', 'info');
    
    try {
        const response = await fetch('/tecnico/reanudar-reparacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Reparación reanudada correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al reanudar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// REPARACIÓN - FINALIZAR
// =====================================================
window.mostrarFinalizarModal = async function(ordenId) {
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        document.getElementById('finalizarInfo').innerHTML = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
        `;
    }
    
    const bahiaWarning = document.getElementById('bahiaWarningMsg');
    if (bahiaWarning) bahiaWarning.style.display = 'none';
    
    try {
        const response = await fetch(`/tecnico/verificar-solicitudes-pendientes/${ordenId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        const solicitudesPendientesMsg = document.getElementById('solicitudesPendientesMsg');
        if (solicitudesPendientesMsg) {
            if (data.tiene_pendientes) {
                solicitudesPendientesMsg.style.display = 'block';
                solicitudesPendientesMsg.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--ambar-alerta);"></i> <span style="font-size: 0.8rem;">⚠️ Tienes ${data.cantidad} solicitud(es) de repuestos pendiente(s). Se notificará al Jefe de Taller.</span>`;
            } else {
                solicitudesPendientesMsg.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error verificando solicitudes:', error);
    }
    
    document.getElementById('ordenIdFinalizar').value = ordenId;
    document.getElementById('finalizarModal').classList.add('show');
};

window.cerrarFinalizarModal = function() {
    document.getElementById('finalizarModal').classList.remove('show');
    document.getElementById('ordenIdFinalizar').value = '';
};

async function confirmarFinalizarReparacion() {
    const ordenId = document.getElementById('ordenIdFinalizar').value;
    cerrarFinalizarModal();
    showToast('Finalizando reparación...', 'info');
    
    try {
        const response = await fetch('/tecnico/finalizar-reparacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Reparación finalizada correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al finalizar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// ARMADO
// =====================================================
window.marcarArmadoCompletado = async function(ordenId) {
    if (!confirm(`⚠️ CONFIRMACIÓN DE ARMADO\n\n¿Confirmas que has ARMADO COMPLETAMENTE el vehículo?\n\nEl vehículo quedará a su estado original antes del diagnóstico.\n\n✅ El cliente pagará SOLO el diagnóstico (Bs. 200)\n\n⚠️ Esta acción no se puede deshacer.`)) {
        return;
    }
    
    showToast('Procesando armado completado...', 'info');
    
    try {
        const response = await fetch('/tecnico/marcar-armado-completado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Armado completado correctamente. Se ha notificado al Jefe de Taller.', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al marcar armado completado', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
};

// =====================================================
// HISTORIAL DE SOLICITUDES DE REPUESTOS
// =====================================================
window.verHistorialSolicitudes = async function(ordenId) {
    showToast('Cargando historial de solicitudes...', 'info');
    
    try {
        const response = await fetch(`/tecnico/historial-solicitudes/${ordenId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al cargar historial');
        }
        
        const solicitudes = data.solicitudes || [];
        
        if (solicitudes.length === 0) {
            showToast('No hay solicitudes de repuestos para esta orden', 'info');
            return;
        }
        
        const modalBody = document.getElementById('historialSolicitudesBody');
        
        let solicitudesHtml = `
            <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                <p><strong><i class="fas fa-clipboard-list"></i> Orden:</strong> ${escapeHtml(data.codigo_orden || ordenId)}</p>
                <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(data.vehiculo || 'N/A')}</p>
            </div>
        `;
        
        solicitudesHtml += `<div class="solicitudes-historial">`;
        
        for (const sol of solicitudes) {
            let itemsHtml = '';
            let items = sol.items;
            if (typeof items === 'string') {
                try { items = JSON.parse(items); } catch(e) { items = []; }
            }
            
            if (items && items.length > 0) {
                itemsHtml = '<ul style="margin: 0.5rem 0 0 1rem;">' + 
                    items.map(item => `<li><strong>${escapeHtml(item.descripcion)}</strong> x${item.cantidad}${item.detalle ? ` (${escapeHtml(item.detalle)})` : ''}</li>`).join('') + 
                    '</ul>';
            }
            
            let estadoBadge = '';
            let estadoTexto = '';
            let estadoColor = '';
            let estadoIcon = '';
            
            switch (sol.estado) {
                case 'pendiente':
                    estadoBadge = 'status-pendiente';
                    estadoTexto = 'Pendiente';
                    estadoColor = '#F59E0B';
                    estadoIcon = 'fa-clock';
                    break;
                case 'en_proceso':
                    estadoBadge = 'status-proceso';
                    estadoTexto = 'En Proceso';
                    estadoColor = '#3B82F6';
                    estadoIcon = 'fa-spinner fa-pulse';
                    break;
                case 'completado':
                    estadoBadge = 'status-completado';
                    estadoTexto = 'Repuestos Comprados';
                    estadoColor = '#10B981';
                    estadoIcon = 'fa-check-circle';
                    break;
                case 'entregado':
                    estadoBadge = 'status-entregado';
                    estadoTexto = '✓ Entregado';
                    estadoColor = '#10B981';
                    estadoIcon = 'fa-truck';
                    break;
                case 'rechazado':
                    estadoBadge = 'status-rechazado';
                    estadoTexto = 'Rechazado';
                    estadoColor = '#C1121F';
                    estadoIcon = 'fa-times-circle';
                    break;
                default:
                    estadoBadge = 'status-pendiente';
                    estadoTexto = sol.estado || 'Desconocido';
                    estadoColor = 'var(--gris-texto)';
                    estadoIcon = 'fa-question-circle';
            }
            
            solicitudesHtml += `
                <div class="solicitud-historial-item" style="border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 1rem; overflow: hidden;">
                    <div style="background: var(--gris-oscuro); padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <div>
                            <strong><i class="fas fa-ticket-alt"></i> Solicitud #${sol.id}</strong>
                            <span style="font-size: 0.7rem; color: var(--gris-texto); margin-left: 0.5rem;">${formatFecha(sol.fecha_solicitud)}</span>
                        </div>
                        <span style="background: ${estadoColor}20; color: ${estadoColor}; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.7rem; font-weight: 500;">
                            <i class="fas ${estadoIcon}"></i> ${estadoTexto}
                        </span>
                    </div>
                    <div style="padding: 1rem;">
                        <div><strong>Repuestos solicitados:</strong>${itemsHtml}</div>
                        ${sol.observaciones ? `<div style="margin-top: 0.5rem;"><strong>Observaciones:</strong> ${escapeHtml(sol.observaciones)}</div>` : ''}
                        ${sol.respuesta ? `<div style="margin-top: 0.5rem; background: var(--gris-oscuro); padding: 0.5rem; border-radius: var(--radius-sm);"><strong>Respuesta del Jefe de Taller:</strong><br>${escapeHtml(sol.respuesta)}</div>` : ''}
                        ${sol.fecha_respuesta ? `<div style="margin-top: 0.5rem; font-size: 0.7rem; color: var(--gris-texto);">Respondido: ${formatFecha(sol.fecha_respuesta)}</div>` : ''}
                        
                        ${sol.estado === 'completado' ? `
                            <div style="margin-top: 0.75rem; background: rgba(16, 185, 129, 0.1); padding: 0.5rem; border-radius: var(--radius-sm); border-left: 3px solid var(--verde-exito);">
                                <strong style="color: var(--verde-exito);"><i class="fas fa-check-circle"></i> Estado: Repuestos comprados</strong>
                                <div style="font-size: 0.8rem; margin-top: 0.25rem;">Los repuestos ya están disponibles para su uso.</div>
                            </div>
                        ` : ''}
                        
                        ${sol.estado === 'entregado' ? `
                            <div style="margin-top: 0.75rem; background: rgba(16, 185, 129, 0.15); padding: 0.5rem; border-radius: var(--radius-sm); border-left: 3px solid var(--verde-exito);">
                                <strong style="color: var(--verde-exito);"><i class="fas fa-truck"></i> Estado: Repuestos entregados</strong>
                                <div style="font-size: 0.8rem; margin-top: 0.25rem;">Los repuestos han sido entregados y están disponibles para usar.</div>
                                ${sol.fecha_entrega ? `<div style="font-size: 0.7rem; margin-top: 0.25rem;">Fecha de entrega: ${formatFecha(sol.fecha_entrega)}</div>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
        solicitudesHtml += `</div>`;
        modalBody.innerHTML = solicitudesHtml;
        
        const modal = document.getElementById('historialSolicitudesModal');
        if (modal) modal.classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message, 'error');
    }
};

function cerrarHistorialModal() {
    const modal = document.getElementById('historialSolicitudesModal');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// DETALLE DE ORDEN
// =====================================================
window.verDetalle = async function(ordenId) {
    showToast('Cargando detalles...', 'info');
    
    try {
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
        
        const fotos = detalle.recepcion?.fotos || {};
        const fotosArray = Object.entries(fotos).filter(([_, url]) => url && url !== '');
        
        const kilometraje = detalle.vehiculo?.kilometraje ? `${parseInt(detalle.vehiculo.kilometraje).toLocaleString()} km` : 'N/A';
        const anio = detalle.vehiculo?.anio && detalle.vehiculo.anio !== 'N/A' ? detalle.vehiculo.anio : 'No especificado';
        const marcaModelo = `${detalle.vehiculo?.marca || ''} ${detalle.vehiculo?.modelo || ''}`.trim() || 'No especificado';
        
        const bahiaInfo = detalle.planificacion?.bahia_asignada ? `<div><strong>Bahía asignada:</strong> ${detalle.planificacion.bahia_asignada}</div>` : '';
        
        const detalleHtml = `
            <div style="display: grid; gap: 1rem;">
                <div class="modal-section">
                    <h3><i class="fas fa-clipboard-list"></i> Información de la Orden</h3>
                    <div class="detalle-grid">
                        <div><strong>Código:</strong> ${escapeHtml(detalle.orden?.codigo_unico || 'N/A')}</div>
                        <div><strong>Estado:</strong> ${detalle.orden?.estado_global || 'N/A'}</div>
                        <div><strong>Fecha Ingreso:</strong> ${formatFecha(detalle.orden?.fecha_ingreso)}</div>
                        ${bahiaInfo}
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
                    <div class="diagnostico-box" style="background: var(--gris-oscuro); padding: 0.75rem; border-radius: var(--radius-md);">
                        <p>${escapeHtml(detalle.recepcion?.transcripcion_problema || 'No hay descripción del problema')}</p>
                        ${detalle.recepcion?.audio_url ? `<audio controls preload="none" style="width: 100%; margin-top: 0.5rem;"><source src="${detalle.recepcion.audio_url}" type="audio/mpeg"></audio>` : ''}
                    </div>
                </div>
                
                ${fotosArray.length > 0 ? `
                    <div class="modal-section">
                        <h3><i class="fas fa-images"></i> Fotos del Vehículo (${fotosArray.length})</h3>
                        <div class="fotos-grid">
                            ${fotosArray.map(([nombre, url]) => `
                                <div class="foto-item" onclick="verFoto('${url}')" style="cursor: pointer;">
                                    <img src="${url}" alt="${nombre}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238E8E93%22%20stroke-width%3D%222%22%3E%3Crect%20x%3D%223%22%20y%3D%223%22%20width%3D%2218%22%20height%3D%2218%22%20rx%3D%222%22%2F%3E%3Ccircle%20cx%3D%228.5%22%20cy%3D%228.5%22%20r%3D%221.5%22%2F%3E%3Cpolyline%20points%3D%2221%2015%2016%2010%205%2021%22%2F%3E%3C%2Fsvg%3E'">
                                    <div style="font-size: 0.6rem; text-align: center; padding: 0.25rem;">${escapeHtml(nombre)}</div>
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
    document.getElementById('fotoAmpliada').src = url;
    document.getElementById('fotoModal').classList.add('show');
};

window.cerrarFotoModal = function() {
    document.getElementById('fotoModal').classList.remove('show');
};

window.cerrarDetalleModal = function() {
    document.getElementById('detalleModal').classList.remove('show');
};

// =====================================================
// COMUNICADOS
// =====================================================
window.cargarComunicados = async function() {
    const comunicadosList = document.getElementById('comunicadosList');
    if (!comunicadosList) return;
    
    try {
        const vistosStorage = localStorage.getItem('comunicados_vistos');
        if (vistosStorage) comunicadosVistos = JSON.parse(vistosStorage);
        
        const timestamp = new Date().getTime();
        const response = await fetch(`/tecnico/comunicados?_=${timestamp}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error al cargar comunicados');
        
        const comunicados = result.data || [];
        const badge = document.getElementById('comunicadosBadge');
        const noLeidos = comunicados.filter(c => !comunicadosVistos.includes(c.id)).length;
        
        if (badge) {
            badge.textContent = noLeidos;
            badge.style.backgroundColor = noLeidos > 0 ? 'var(--rojo-primario)' : 'var(--gris-medio)';
        }
        
        if (comunicados.length === 0) {
            comunicadosList.innerHTML = `<div class="empty-comunicados"><i class="fas fa-bullhorn"></i><p>No hay comunicados disponibles</p></div>`;
            return;
        }
        
        comunicados.sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
        
        comunicadosList.innerHTML = comunicados.map(com => {
            let prioridadIcon = '', prioridadClass = '';
            const esNuevo = !comunicadosVistos.includes(com.id);
            
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
                <div class="comunicado-item ${prioridadClass} ${esNuevo ? 'nuevo' : ''}" onclick="verComunicadoCompleto(${com.id})" data-id="${com.id}">
                    <div class="comunicado-titulo">
                        ${prioridadIcon}
                        <strong>${escapeHtml(com.titulo)}</strong>
                        <span class="comunicado-fecha"><i class="far fa-clock"></i> ${fechaFormateada}</span>
                    </div>
                    <div class="comunicado-contenido">${escapeHtml(textoResumido)}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('comunicadosList').innerHTML = `<div class="empty-comunicados"><i class="fas fa-exclamation-circle"></i><p>Error al cargar comunicados</p></div>`;
    }
};

function verComunicadoCompleto(id) {
    if (!comunicadosVistos.includes(id)) {
        comunicadosVistos.push(id);
        localStorage.setItem('comunicados_vistos', JSON.stringify(comunicadosVistos));
        const badge = document.getElementById('comunicadosBadge');
        if (badge) {
            const noLeidos = comunicadosVistos.filter(v => !comunicadosVistos.includes(v)).length;
            badge.textContent = noLeidos;
        }
        const elemento = document.querySelector(`.comunicado-item[data-id="${id}"]`);
        if (elemento) elemento.classList.remove('nuevo');
    }
    
    fetch(`/tecnico/comunicados/${id}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(response => response.json())
        .then(result => {
            if (result.success && result.data) {
                const com = result.data;
                const fechaFormateada = formatFechaComunicado(com.fecha_creacion);
                let prioridadBadge = '';
                if (com.prioridad === 'importante') prioridadBadge = '<span class="prioridad-badge importante">Importante</span>';
                else if (com.prioridad === 'urgente') prioridadBadge = '<span class="prioridad-badge urgente">Urgente</span>';
                else prioridadBadge = '<span class="prioridad-badge normal">Normal</span>';
                
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
                            <div class="modal-section">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap;">
                                    <h3 style="margin: 0;">${escapeHtml(com.titulo)}</h3>
                                    ${prioridadBadge}
                                </div>
                                <div class="comunicado-meta"><span><i class="far fa-calendar-alt"></i> ${fechaFormateada}</span></div>
                                <div class="comunicado-contenido-completo">${com.contenido}</div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cerrar</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
            }
        })
        .catch(error => console.error('Error:', error));
}

// =====================================================
// MANEJO DE ÍTEMS DE SOLICITUD DE REPUESTOS
// =====================================================

function renderItemsSolicitud() {
    const container = document.getElementById('itemsListSolicitud');
    if (!container) return;

    if (itemsSolicitud.length === 0) {
        container.innerHTML = `<div class="item-empty"><i class="fas fa-box-open"></i><p>No hay repuestos agregados</p><small>Haz clic en "Agregar repuesto" para comenzar</small></div>`;
        return;
    }

    container.innerHTML = itemsSolicitud.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Nombre del repuesto" onchange="actualizarItemSolicitud(${index}, 'descripcion', this.value)">
                <input type="number" class="item-cantidad" value="${item.cantidad}" min="1" onchange="actualizarItemSolicitud(${index}, 'cantidad', parseInt(this.value))">
                <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle (marca, especificaciones...)" onchange="actualizarItemSolicitud(${index}, 'detalle', this.value)">
            </div>
            <div class="item-actions">
                <button class="btn-remove-item" onclick="eliminarItemSolicitud(${index})"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `).join('');
}

function agregarItemSolicitud() {
    itemsSolicitud.push({ descripcion: '', cantidad: 1, detalle: '' });
    renderItemsSolicitud();
    setTimeout(() => {
        const lastInput = document.querySelector('#itemsListSolicitud .item-row:last-child .item-descripcion');
        if (lastInput) lastInput.focus();
    }, 100);
}

function actualizarItemSolicitud(index, campo, valor) {
    if (itemsSolicitud[index]) itemsSolicitud[index][campo] = valor;
}

function eliminarItemSolicitud(index) {
    itemsSolicitud.splice(index, 1);
    renderItemsSolicitud();
}

function limpiarItemsSolicitud() {
    itemsSolicitud = [];
    renderItemsSolicitud();
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
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const tokenValido = await verificarToken();
    if (!tokenValido) return;
    
    mostrarFechaActual();
    mostrarNombreUsuario();
    // ELIMINADO: mostrarIndicadorRoles() - Ya no se muestra el selector de roles
    await cargarVehiculos();
    await cargarComunicados();
    
    // Configurar botones de modales
    document.getElementById('confirmarEmpezarBtn')?.addEventListener('click', confirmarEmpezarDiagnostico);
    document.getElementById('confirmarInicioBtn')?.addEventListener('click', confirmarInicioReparacion);
    document.getElementById('confirmarPausaManualBtn')?.addEventListener('click', confirmarPausaManual);
    document.getElementById('btnAgregarItemSolicitud')?.addEventListener('click', agregarItemSolicitud);
    document.getElementById('confirmarSolicitarRepuestosBtn')?.addEventListener('click', confirmarSolicitarRepuestos);
    document.getElementById('confirmarReanudarBtn')?.addEventListener('click', confirmarReanudarReparacion);
    document.getElementById('confirmarFinalizarBtn')?.addEventListener('click', confirmarFinalizarReparacion);
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    });
    
    console.log('✅ misvehiculos.js cargado correctamente');
});