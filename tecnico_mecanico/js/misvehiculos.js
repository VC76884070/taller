// =====================================================
// MIS VEHÍCULOS - TÉCNICO MECÁNICO
// VERSIÓN COMPLETA CON SOPORTE PARA MÚLTIPLES FOTOS (HASTA 3)
// CORREGIDO: PREVIEW LOCAL DE FOTOS (ELIMINADO ERROR 401)
// CORREGIDO: HISTORIAL CON MINIATURAS DE GOOGLE DRIVE
// CORREGIDO: ERROR onerror - this.parentElement null
// CORREGIDO: PROXY UNIFICADO - /tecnico/proxy-imagen-repuesto
// FURIA MOTOR COMPANY SRL
// =====================================================

// =====================================================
// FUNCIONES AUXILIARES PARA GOOGLE DRIVE
// (ADAPTADO DE RECEPCIÓN - JEFE OPERATIVO)
// =====================================================

function extraerFileIdDrive(url) {
    if (!url) return null;
    
    url = url.trim();
    
    // Caso 1: URL con ?id= o &id=
    const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) {
        return matchId[1];
    }
    
    // Caso 2: URL con /file/d/ID/
    const matchFile = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchFile && matchFile[1]) {
        return matchFile[1];
    }
    
    // Caso 3: URL con /open?id=ID
    const matchOpen = url.match(/open\?id=([a-zA-Z0-9_-]+)/);
    if (matchOpen && matchOpen[1]) {
        return matchOpen[1];
    }
    
    // Caso 4: URL de thumbnail
    const matchThumb = url.match(/id=([a-zA-Z0-9_-]+)/);
    if (matchThumb && matchThumb[1]) {
        return matchThumb[1];
    }
    
    // Caso 5: Si la URL es solo un ID (sin protocolo)
    if (/^[a-zA-Z0-9_-]{10,}$/.test(url)) {
        return url;
    }
    
    return null;
}

function obtenerUrlMiniaturaDrive(url, size = 80) {
    if (!url) return null;
    
    // Si ya es una URL de thumbnail, devolverla
    if (url.includes('thumbnail') || url.includes('uc?export=view')) {
        return url;
    }
    
    const fileId = extraerFileIdDrive(url);
    if (fileId) {
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
    }
    
    return url;
}

function obtenerUrlVisualizacionDrive(url) {
    if (!url) return null;
    
    // Si ya es una URL de visualización, devolverla
    if (url.includes('uc?export=view') || url.includes('thumbnail')) {
        return url;
    }
    
    const fileId = extraerFileIdDrive(url);
    if (fileId) {
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
    
    return url;
}

// =====================================================
// FIN FUNCIONES AUXILIARES GOOGLE DRIVE
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

// Variable para items de solicitud (MÚLTIPLES FOTOS)
if (typeof itemsSolicitud === 'undefined') {
    var itemsSolicitud = [];
}

// =====================================================
// FUNCIÓN: CARGAR IMAGEN DESDE PROXY
// =====================================================
async function cargarImagenRepuestoDesdeProxy(url) {
    if (!url || url === 'null' || url === '' || url === 'undefined') {
        return null;
    }

    try {
        const token = getToken();
        const proxyUrl = `/tecnico/proxy-imagen-repuesto?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.base64) {
            return data.base64;
        } else {
            throw new Error(data.error || 'Error al obtener la imagen');
        }
    } catch (error) {
        console.warn(`⚠️ Error cargando imagen desde proxy: ${error.message}`);
        return null;
    }
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
// SUBIR FOTO DE REPUESTO - SOPORTE PARA MÚLTIPLES FOTOS (HASTA 3)
// =====================================================
async function subirFotoItemSolicitudTecnico(index, fotoNumero, input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Solo se permiten imágenes', 'error');
        input.value = '';
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen no debe superar los 5MB', 'error');
        input.value = '';
        return;
    }
    
    if (!itemsSolicitud[index]) {
        showToast('Error: Item no encontrado', 'error');
        return;
    }
    
    if (!itemsSolicitud[index].fotos) {
        itemsSolicitud[index].fotos = [];
    }
    
    if (itemsSolicitud[index].fotos.length >= 3) {
        showToast('Máximo 3 fotos por repuesto', 'warning');
        input.value = '';
        return;
    }
    
    const previewContainer = document.getElementById(`fotoPreviewSolicitudTecnico_${index}_${fotoNumero}`);
    const localPreviewUrl = URL.createObjectURL(file);
    
    if (previewContainer) {
        previewContainer.innerHTML = `
            <div style="position:relative;display:inline-block;">
                <img src="${localPreviewUrl}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:2px solid var(--ambar-alerta);cursor:pointer;" 
                     onclick="verFotoAmpliadaTecnico('${localPreviewUrl}')">
                <span style="position:absolute;top:-4px;right:-4px;background:var(--ambar-alerta);color:white;border-radius:50%;width:16px;height:16px;font-size:8px;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-spinner fa-spin"></i>
                </span>
            </div>
        `;
    }
    
    showToast(`Subiendo foto ${fotoNumero}...`, 'info');
    
    try {
        const formData = new FormData();
        formData.append('foto', file);
        formData.append('foto_numero', fotoNumero);
        formData.append('index', index);
        
        const ordenId = document.getElementById('ordenIdSolicitud')?.value;
        if (ordenId) {
            const vehiculo = vehiculosAsignados.find(v => v.orden_id === parseInt(ordenId));
            if (vehiculo && vehiculo.codigo_unico) {
                formData.append('codigo_orden', vehiculo.codigo_unico);
                formData.append('id_orden', ordenId);
                console.log(`📤 Enviando foto para orden: ${vehiculo.codigo_unico}`);
            } else {
                try {
                    const response = await fetch(`/tecnico/orden-codigo/${ordenId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await response.json();
                    if (data.success && data.codigo_unico) {
                        formData.append('codigo_orden', data.codigo_unico);
                        formData.append('id_orden', ordenId);
                    }
                } catch (e) {
                    console.warn('⚠️ No se pudo obtener código de orden');
                }
            }
        }
        
        const response = await fetch('/tecnico/subir-foto-repuesto', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success && data.url) {
            itemsSolicitud[index].fotos.push({
                url: data.url,
                public_id: data.public_id,
                localUrl: localPreviewUrl
            });
            
            if (previewContainer) {
                previewContainer.innerHTML = `
                    <div style="position:relative;display:inline-block;">
                        <img src="${localPreviewUrl}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:2px solid var(--verde-exito);cursor:pointer;" 
                             onclick="verFotoAmpliadaTecnico('${localPreviewUrl}')">
                        <button type="button" class="btn-remove-foto" onclick="event.preventDefault(); eliminarFotoItemSolicitudTecnico(${index}, ${itemsSolicitud[index].fotos.length - 1})" 
                                style="position:absolute;top:-6px;right:-6px;background:var(--rojo-primario);color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }
            
            renderItemsSolicitud();
            showToast('✅ Foto subida correctamente', 'success');
        } else {
            showToast(data.error || 'Error al subir foto', 'error');
            if (previewContainer) {
                previewContainer.innerHTML = `<div style="width:50px;height:50px;border:2px dashed var(--border-color);border-radius:6px;display:flex;align-items:center;justify-content:center;background:var(--gris-oscuro);">
                    <span style="color:var(--gris-texto);font-size:10px;text-align:center;line-height:1.2;"><i class="fas fa-plus"></i><br>${fotoNumero}</span>
                </div>`;
            }
            renderItemsSolicitud();
        }
    } catch (error) {
        console.error('Error subiendo foto:', error);
        showToast('Error de conexión al subir foto', 'error');
        renderItemsSolicitud();
    } finally {
        input.value = '';
    }
}

// =====================================================
// ELIMINAR FOTO DE ITEM (ESPECÍFICA)
// =====================================================
async function eliminarFotoItemSolicitudTecnico(index, fotoIndex) {
    if (!itemsSolicitud[index] || !itemsSolicitud[index].fotos || !itemsSolicitud[index].fotos[fotoIndex]) {
        showToast('No hay foto para eliminar', 'warning');
        return;
    }
    
    const foto = itemsSolicitud[index].fotos[fotoIndex];
    if (foto.public_id) {
        if (!confirm('¿Eliminar esta foto?')) return;
        
        showToast('Eliminando foto...', 'info');
        
        try {
            const response = await fetch('/tecnico/eliminar-foto-repuesto', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    public_id: foto.public_id
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (foto.localUrl) {
                    URL.revokeObjectURL(foto.localUrl);
                }
                itemsSolicitud[index].fotos.splice(fotoIndex, 1);
                renderItemsSolicitud();
                showToast('✅ Foto eliminada', 'success');
            } else {
                showToast(data.error || 'Error al eliminar foto', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showToast('Error de conexión', 'error');
        }
    } else {
        if (!confirm('¿Eliminar esta foto local?')) return;
        if (foto.localUrl) {
            URL.revokeObjectURL(foto.localUrl);
        }
        itemsSolicitud[index].fotos.splice(fotoIndex, 1);
        renderItemsSolicitud();
        showToast('✅ Foto local eliminada', 'success');
    }
}

// =====================================================
// RENDERIZAR ITEMS DE SOLICITUD CON MÚLTIPLES FOTOS
// =====================================================
function renderItemsSolicitud() {
    const container = document.getElementById('itemsListSolicitud');
    if (!container) return;

    if (itemsSolicitud.length === 0) {
        container.innerHTML = `<div class="item-empty"><i class="fas fa-box-open"></i><p>No hay repuestos agregados</p><small>Haz clic en "Agregar repuesto" para comenzar</small></div>`;
        return;
    }

    container.innerHTML = itemsSolicitud.map((item, index) => {
        if (!item.fotos) {
            item.fotos = [];
        }
        
        const cantidadFotos = item.fotos.length;
        const puedeAgregarFoto = cantidadFotos < 3;
        
        let fotosHtml = '';
        for (let f = 0; f < 3; f++) {
            const foto = item.fotos[f] || null;
            const tieneFoto = foto && (foto.localUrl || foto.url);
            const fotoNumero = f + 1;
            
            if (tieneFoto) {
                const srcImg = foto.localUrl || foto.url; 
                fotosHtml += `
                    <div class="foto-item-container" style="position:relative;display:inline-block;margin-right:4px;">
                        <img src="${srcImg}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:2px solid var(--verde-exito);cursor:pointer;" 
                             onclick="verFotoAmpliadaTecnico('${srcImg}')">
                        <button type="button" class="btn-remove-foto" onclick="event.preventDefault(); eliminarFotoItemSolicitudTecnico(${index}, ${f})" 
                                style="position:absolute;top:-6px;right:-6px;background:var(--rojo-primario);color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            } else {
                const inputId = `fotoInput_${index}_${fotoNumero}`;
                const previewId = `fotoPreviewSolicitudTecnico_${index}_${fotoNumero}`;
                const disabled = !puedeAgregarFoto && f >= cantidadFotos;
                
                fotosHtml += `
                    <div class="foto-item-container" style="position:relative;display:inline-block;margin-right:4px;" id="fotoContainer_${index}_${fotoNumero}">
                        <div id="${previewId}" style="width:50px;height:50px;border:2px dashed var(--border-color);border-radius:6px;display:flex;align-items:center;justify-content:center;background:var(--gris-oscuro);${disabled ? 'opacity:0.3;' : ''}">
                            ${disabled ? '<span style="color:var(--gris-texto);font-size:10px;">📷</span>' : `
                                <span style="color:var(--gris-texto);font-size:10px;text-align:center;line-height:1.2;">
                                    <i class="fas fa-plus"></i><br>
                                    ${fotoNumero}
                                </span>
                            `}
                        </div>
                        <input type="file" id="${inputId}" class="item-foto-input-solicitud-tecnico" accept="image/*" 
                               style="display:none;" 
                               onchange="subirFotoItemSolicitudTecnico(${index}, ${fotoNumero}, this)" 
                               ${disabled ? 'disabled' : ''}>
                        ${!disabled ? `
                            <button type="button" class="btn-foto-item-mini" onclick="event.preventDefault(); document.getElementById('${inputId}').click()" 
                                    style="position:absolute;bottom:-4px;right:-4px;background:var(--azul-acento);color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
                                <i class="fas fa-camera"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
            }
        }
        
        return `
            <div class="item-row" data-index="${index}">
                <div class="item-fields">
                    <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Nombre del repuesto" onchange="actualizarItemSolicitud(${index}, 'descripcion', this.value)">
                    <input type="number" class="item-cantidad" value="${item.cantidad}" min="1" onchange="actualizarItemSolicitud(${index}, 'cantidad', parseInt(this.value))">
                    <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle (marca, especificaciones...)" onchange="actualizarItemSolicitud(${index}, 'detalle', this.value)">
                </div>
                <div class="item-fotos-container">
                    <div class="item-fotos-grid">
                        ${fotosHtml}
                    </div>
                    <div style="font-size:9px;color:var(--gris-texto);margin-top:4px;">
                        ${cantidadFotos}/3 fotos
                    </div>
                </div>
                <div class="item-actions">
                    <button type="button" class="btn-remove-item" onclick="event.preventDefault(); eliminarItemSolicitud(${index})"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

function agregarItemSolicitud() {
    itemsSolicitud.push({ descripcion: '', cantidad: 1, detalle: '', fotos: [] });
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
    if (itemsSolicitud[index] && itemsSolicitud[index].fotos) {
        itemsSolicitud[index].fotos.forEach(foto => {
            if (foto.localUrl) URL.revokeObjectURL(foto.localUrl);
        });
    }
    itemsSolicitud.splice(index, 1);
    renderItemsSolicitud();
}

function limpiarItemsSolicitud() {
    itemsSolicitud.forEach(item => {
        if (item.fotos) {
            item.fotos.forEach(foto => {
                if (foto.localUrl) URL.revokeObjectURL(foto.localUrl);
            });
        }
    });
    itemsSolicitud = [];
    renderItemsSolicitud();
}

// =====================================================
// SOLICITAR REPUESTOS SIN PAUSA (CON MÚLTIPLES FOTOS)
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
    
    console.log('📤 Enviando items con fotos:', JSON.stringify(itemsValidos, null, 2));
    
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
        console.error('Error:', error);
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
// FUNCIÓN PARA VER FOTO AMPLIADA - VERSIÓN MEJORADA
// =====================================================
function verFotoAmpliadaTecnico(url) {
    if (!url) {
        showToast('No hay foto para mostrar', 'warning');
        return;
    }
    
    // Crear modal de foto si no existe
    let modalFoto = document.getElementById('modalFotoAmpliadaTecnico');
    if (!modalFoto) {
        const modalHtml = `
            <div class="modal" id="modalFotoAmpliadaTecnico" onclick="cerrarFotoAmpliadaTecnico()">
                <div class="modal-content" style="max-width: 800px; background: var(--bg-card);" onclick="event.stopPropagation()">
                    <div class="modal-header" style="border-bottom: 2px solid var(--rojo-primario);">
                        <h3><i class="fas fa-image"></i> Foto del Repuesto</h3>
                        <button class="modal-close" onclick="cerrarFotoAmpliadaTecnico()" style="font-size:1.8rem;">&times;</button>
                    </div>
                    <div class="modal-body" style="display:flex;justify-content:center;align-items:center;padding:1.5rem;background:var(--negro);min-height:300px;position:relative;">
                        <div id="fotoAmpliadaLoader" style="position:absolute;color:white;font-size:1.2rem;z-index:5;">
                            <i class="fas fa-spinner fa-spin"></i> Cargando...
                        </div>
                        <img id="fotoAmpliadaTecnicoImg" src="" alt="Foto ampliada" loading="lazy" 
                             style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:var(--radius-md);display:none;">
                    </div>
                    <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:1rem;padding:1rem;border-top:1px solid var(--border-color);">
                        <button class="btn-secondary" onclick="cerrarFotoAmpliadaTecnico()">Cerrar</button>
                        <button class="btn-primary" onclick="descargarFotoAmpliadaTecnico()">
                            <i class="fas fa-download"></i> Descargar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    const img = document.getElementById('fotoAmpliadaTecnicoImg');
    const loader = document.getElementById('fotoAmpliadaLoader');
    
    if (!img) return;

    // RESETEAR ESTADOS
    img.style.display = 'none';
    img.src = '';
    if (loader) {
        loader.style.display = 'block';
        loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    }
    
    // LIMPIAR TIMEOUT ANTERIOR
    if (window._fotoAmpliadaTimeout) {
        clearTimeout(window._fotoAmpliadaTimeout);
        window._fotoAmpliadaTimeout = null;
    }
    
    // 🔥 CONSTRUIR URL DEL PROXY
    const proxyUrl = `/tecnico/proxy-imagen-repuesto?url=${encodeURIComponent(url)}`;
    const token = getToken();
    
    console.log('📸 Cargando imagen vía fetch:', proxyUrl);
    
    // 🔥 FUNCIÓN PARA OCULTAR LOADER Y MOSTRAR IMAGEN
    function ocultarLoaderYMostrarImagen() {
        if (loader) {
            loader.style.display = 'none';
            loader.innerHTML = '';
        }
        img.style.display = 'block';
        if (window._fotoAmpliadaTimeout) {
            clearTimeout(window._fotoAmpliadaTimeout);
            window._fotoAmpliadaTimeout = null;
        }
    }
    
    // 🔥 FUNCIÓN PARA MOSTRAR ERROR
    function mostrarError(mensaje) {
        if (loader) {
            loader.style.display = 'none';
            loader.innerHTML = '';
        }
        img.style.display = 'block';
        img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="%238E8E93" stroke-width="2"%3E%3Crect x="3" y="3" width="18" height="18" rx="2"/%3E%3Ccircle cx="8.5" cy="8.5" r="1.5"/%3E%3Cpolyline points="21 15 16 10 5 21"/%3E%3C/svg%3E';
        img.style.objectFit = 'contain';
        if (window._fotoAmpliadaTimeout) {
            clearTimeout(window._fotoAmpliadaTimeout);
            window._fotoAmpliadaTimeout = null;
        }
        showToast(mensaje || 'No se pudo cargar la imagen', 'error');
    }
    
    // 🔥 USAR FETCH PARA OBTENER LA IMAGEN COMO BASE64
    fetch(proxyUrl, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success && data.base64) {
            // 🔥 Crear una nueva imagen para asegurar que el onload se dispare
            const nuevaImg = new Image();
            
            nuevaImg.onload = function() {
                // Cuando la imagen cargue, asignarla al elemento del DOM
                img.src = this.src;
                ocultarLoaderYMostrarImagen();
                console.log('✅ Foto ampliada cargada correctamente');
            };
            
            nuevaImg.onerror = function() {
                console.error('❌ Error al cargar la imagen en el objeto Image');
                // Intentar asignar directamente como fallback
                img.src = data.base64;
                ocultarLoaderYMostrarImagen();
                console.log('✅ Foto ampliada cargada (fallback)');
            };
            
            // Asignar el base64 a la nueva imagen para precargar
            nuevaImg.src = data.base64;
            
            // TIMEOUT DE SEGURIDAD PARA LA CARGA DE LA IMAGEN
            const loadTimeout = setTimeout(function() {
                console.warn('⏰ La imagen está tardando en cargar, mostrando de todas formas');
                img.src = data.base64;
                ocultarLoaderYMostrarImagen();
            }, 10000); // 10 segundos para cargar la imagen en el DOM
            
            // Limpiar el timeout si la imagen carga
            const originalOnload = nuevaImg.onload;
            nuevaImg.onload = function() {
                clearTimeout(loadTimeout);
                originalOnload.call(this);
            };
            
        } else {
            throw new Error(data.error || 'Error al obtener la imagen');
        }
    })
    .catch(error => {
        console.error('❌ Error en fetch:', error);
        mostrarError('No se pudo cargar la imagen: ' + error.message);
    });
    
    // 🔥 TIMEOUT DE SEGURIDAD PARA TODO EL PROCESO (60 segundos)
    window._fotoAmpliadaTimeout = setTimeout(function() {
        if (loader && loader.style.display !== 'none') {
            console.warn('⏰ Timeout global: la imagen no cargó después de 60 segundos');
            mostrarError('Tiempo de espera agotado (60s)');
        }
    }, 60000);
    
    // GUARDAR URL ORIGINAL PARA DESCARGA
    window._fotoAmpliadaTecnicoUrl = url;
    
    // ABRIR MODAL
    const modal = document.getElementById('modalFotoAmpliadaTecnico');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function cerrarFotoAmpliadaTecnico() {
    if (window._fotoAmpliadaTimeout) {
        clearTimeout(window._fotoAmpliadaTimeout);
        window._fotoAmpliadaTimeout = null;
    }
    
    const modal = document.getElementById('modalFotoAmpliadaTecnico');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
    
    const img = document.getElementById('fotoAmpliadaTecnicoImg');
    const loader = document.getElementById('fotoAmpliadaLoader');
    if (img) {
        img.src = '';
        img.style.display = 'none';
    }
    if (loader) {
        loader.style.display = 'none';
        loader.innerHTML = '';
    }
}

function descargarFotoAmpliadaTecnico() {
    const url = window._fotoAmpliadaTecnicoUrl;
    if (!url) {
        showToast('No hay foto para descargar', 'warning');
        return;
    }
    
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.download = `repuesto_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('✅ Descargando foto...', 'success');
}

// =====================================================
// HISTORIAL DE SOLICITUDES DE REPUESTOS - CORREGIDO
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
                itemsHtml = '<ul style="margin: 0.5rem 0 0 1rem; list-style: none; padding: 0;">' + 
                    items.map((item, itemIndex) => {
                        let fotosHtml = '';
                        const fotos = item.fotos || [];
                        
                        function generarFotoItem(fotoUrl, index) {
                            if (!fotoUrl || fotoUrl === 'null' || fotoUrl === '' || fotoUrl === 'undefined') {
                                return `<span style="color:var(--gris-texto);font-size:10px;">Sin foto</span>`;
                            }
                            
                            const proxyUrl = `/tecnico/proxy-imagen-repuesto?url=${encodeURIComponent(fotoUrl)}`;
                            
                            let thumbnailUrl = null;
                            try {
                                const fileId = extraerFileIdDrive(fotoUrl);
                                if (fileId) {
                                    thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w80`;
                                }
                            } catch(e) {}
                            
                            const srcFinal = thumbnailUrl || proxyUrl;
                            
                            return `
                                <div style="position:relative;display:inline-block;margin-right:6px;vertical-align:middle;">
                                    <img src="${srcFinal}" 
                                         onclick="verFotoAmpliadaTecnico('${fotoUrl}')" 
                                         style="width:55px;height:55px;object-fit:cover;border-radius:6px;border:2px solid var(--azul-acento);cursor:pointer;background:var(--gris-oscuro);"
                                         loading="lazy"
                                         title="Ver foto ${index + 1}"
                                         onerror="this.onerror=null; this.src='${proxyUrl}';">
                                    <span style="position:absolute;bottom:0px;right:0px;background:rgba(0,0,0,0.7);color:white;font-size:8px;padding:0 4px;border-radius:3px;border-top-left-radius:3px;">${index + 1}</span>
                                </div>
                            `;
                        }
                        
                        if (fotos.length > 0) {
                            const fotosValidas = fotos.filter(f => f && f.url && f.url !== 'null' && f.url !== '' && f.url !== 'undefined');
                            
                            if (fotosValidas.length > 0) {
                                fotosHtml = fotosValidas.map((foto, fi) => {
                                    return generarFotoItem(foto.url, fi);
                                }).join('');
                            } else {
                                fotosHtml = '<span style="color:var(--gris-texto);font-size:10px;">Sin foto válida</span>';
                            }
                        } else if (item.foto_url && item.foto_url !== 'null' && item.foto_url !== '') {
                            fotosHtml = generarFotoItem(item.foto_url, 0);
                        } else {
                            fotosHtml = '<span style="color:var(--gris-texto);font-size:10px;">Sin foto</span>';
                        }
                        
                        return `<li style="display:flex;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border-color);">
                            <div style="display:flex;gap:4px;margin-right:10px;flex-wrap:wrap;min-width:65px;align-items:center;">
                                ${fotosHtml}
                            </div>
                            <div style="flex:1;">
                                <strong>${escapeHtml(item.descripcion || 'Repuesto sin nombre')}</strong>
                                <span style="color:var(--gris-texto);font-size:0.8rem;margin-left:0.5rem;">x${item.cantidad || 1}</span>
                                ${item.detalle ? `<br><small style="color:var(--gris-texto);">${escapeHtml(item.detalle)}</small>` : ''}
                            </div>
                        </li>`;
                    }).join('') + 
                    '</ul>';
            } else {
                itemsHtml = '<p style="color:var(--gris-texto);font-size:0.85rem;">No hay items especificados</p>';
            }
            
            let estadoTexto = '';
            let estadoColor = '';
            let estadoIcon = '';
            
            switch (sol.estado) {
                case 'pendiente':
                    estadoTexto = '⏳ Pendiente';
                    estadoColor = '#F59E0B';
                    estadoIcon = 'fa-clock';
                    break;
                case 'en_proceso':
                    estadoTexto = '🔄 En Proceso';
                    estadoColor = '#3B82F6';
                    estadoIcon = 'fa-spinner fa-pulse';
                    break;
                case 'completado':
                    estadoTexto = '✅ Repuestos Comprados';
                    estadoColor = '#10B981';
                    estadoIcon = 'fa-check-circle';
                    break;
                case 'entregado':
                    estadoTexto = '📦 Entregado';
                    estadoColor = '#10B981';
                    estadoIcon = 'fa-truck';
                    break;
                case 'rechazado':
                    estadoTexto = '❌ Rechazado';
                    estadoColor = '#C1121F';
                    estadoIcon = 'fa-times-circle';
                    break;
                default:
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
                            ${sol.tipo === 'tecnico' ? '<span style="font-size:0.6rem;background:var(--azul-acento);color:white;padding:0.1rem 0.5rem;border-radius:20px;margin-left:0.5rem;">Técnico</span>' : ''}
                            ${sol.tipo === 'compra' ? '<span style="font-size:0.6rem;background:var(--verde-exito);color:white;padding:0.1rem 0.5rem;border-radius:20px;margin-left:0.5rem;">Compra</span>' : ''}
                        </div>
                        <span style="background: ${estadoColor}20; color: ${estadoColor}; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.7rem; font-weight: 500;">
                            <i class="fas ${estadoIcon}"></i> ${estadoTexto}
                        </span>
                    </div>
                    <div style="padding: 1rem;">
                        <div style="margin-bottom:0.5rem;font-size:0.9rem;"><strong>🔧 Repuestos solicitados:</strong></div>
                        ${itemsHtml}
                        
                        ${sol.observaciones ? `
                            <div style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                                <strong><i class="fas fa-comment"></i> Observaciones:</strong>
                                <p style="margin:0.25rem 0 0 0;font-size:0.85rem;">${escapeHtml(sol.observaciones)}</p>
                            </div>
                        ` : ''}
                        
                        ${sol.respuesta ? `
                            <div style="margin-top: 0.5rem; background: rgba(59, 130, 246, 0.05); padding: 0.5rem; border-radius: var(--radius-sm); border-left: 3px solid var(--azul-acento);">
                                <strong style="color: var(--azul-acento);"><i class="fas fa-reply"></i> Respuesta del Jefe de Taller:</strong>
                                <p style="margin:0.25rem 0 0 0;font-size:0.85rem;">${escapeHtml(sol.respuesta)}</p>
                            </div>
                        ` : ''}
                        
                        ${sol.fecha_respuesta ? `
                            <div style="margin-top: 0.5rem; font-size: 0.7rem; color: var(--gris-texto);">
                                <i class="far fa-clock"></i> Respondido: ${formatFecha(sol.fecha_respuesta)}
                            </div>
                        ` : ''}
                        
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
                                ${sol.fecha_entrega ? `<div style="font-size: 0.7rem; margin-top: 0.25rem;">📅 Fecha de entrega: ${formatFecha(sol.fecha_entrega)}</div>` : ''}
                            </div>
                        ` : ''}
                        
                        ${sol.comprobante_url ? `
                            <div style="margin-top: 0.75rem;">
                                <button class="btn-outline btn-sm" onclick="window.open('${sol.comprobante_url}', '_blank')" style="padding:0.3rem 0.8rem;font-size:0.7rem;cursor:pointer;">
                                    <i class="fas fa-receipt"></i> Ver Comprobante
                                </button>
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
// DETALLE DE ORDEN - COMPLETO Y CORREGIDO
// =====================================================
window.verDetalle = async function(ordenId) {
    // 🔥 VERIFICAR TOKEN
    const tokenActual = getToken();
    if (!tokenActual) {
        showToast('No hay sesión activa', 'error');
        window.location.href = '/';
        return;
    }
    
    console.log('========================================');
    console.log('🔍 VER DETALLE - INICIO');
    console.log(`📌 Orden ID: ${ordenId}`);
    console.log(`🔑 Token: ${tokenActual ? '✅ Presente' : '❌ NO HAY TOKEN'}`);
    console.log('========================================');
    
    showToast('Cargando detalles...', 'info');
    
    try {
        const response = await fetch(`/tecnico/detalle-orden/${ordenId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${tokenActual}` }
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
        
        // =============================================
        // DATOS DEL VEHÍCULO
        // =============================================
        const vehiculo = detalle.vehiculo || {};
        const kilometraje = vehiculo.kilometraje ? `${parseInt(vehiculo.kilometraje).toLocaleString()} km` : 'N/A';
        const anio = vehiculo.anio && vehiculo.anio !== 'N/A' && vehiculo.anio !== null ? vehiculo.anio : 'No especificado';
        const marcaModelo = `${vehiculo.marca || ''} ${vehiculo.modelo || ''}`.trim() || 'No especificado';
        const placa = vehiculo.placa || 'No registrada';
        
        const instruccionesTecnico = detalle.orden?.instrucciones_tecnico || 'No hay instrucciones del Jefe de Taller';
        const instruccionesArmado = detalle.orden?.instrucciones_armado || '';
        
        // =============================================
        // FOTOS
        // =============================================
        const fotos = detalle.recepcion?.fotos || {};
        const fotosArray = Object.entries(fotos).filter(([_, url]) => url && url !== '');
        console.log(`📸 Fotos a cargar: ${fotosArray.length}`);
        
        // =============================================
        // AUDIOS
        // =============================================
        const audioProblemaUrl = detalle.recepcion?.audio_url || '';
        const transcripcionProblema = detalle.recepcion?.transcripcion_problema || 'No hay descripción del problema';
        
        const audioDiagnosticoUrl = detalle.diagnostico_taller?.audio_url || '';
        const diagnosticoTexto = detalle.diagnostico_taller?.diagnostigo || '';
        
        const bahiaInfo = detalle.planificacion?.bahia_asignada ? 
            `<div><strong>Bahía asignada:</strong> ${detalle.planificacion.bahia_asignada}</div>` : '';
        
        // =============================================
        // 🎵 FUNCIÓN PARA CREAR AUDIO CON IDS ÚNICOS
        // =============================================
        function crearAudioHtml(url, titulo, icono, color) {
            // 🔥 SIEMPRE GENERAR EL HTML, aunque la URL esté vacía
            const audioId = `audio_${ordenId}_${titulo.replace(/\s/g, '_').toLowerCase()}`;
            const loaderId = `audioLoader_${ordenId}_${titulo.replace(/\s/g, '_').toLowerCase()}`;
            
            // Si no hay URL, mostrar mensaje
            if (!url || url === '') {
                return `
                    <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(59, 130, 246, 0.05); border-radius: var(--radius-md); border-left: 3px solid ${color};">
                        <div style="font-size: 0.75rem; color: ${color}; margin-bottom: 0.5rem;">
                            <i class="fas ${icono}"></i> ${titulo}:
                        </div>
                        <div style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem; background:var(--gris-oscuro); border-radius:var(--radius-sm); color:var(--gris-texto);">
                            <i class="fas fa-info-circle"></i>
                            <span style="font-size:0.8rem;">No hay audio disponible</span>
                        </div>
                    </div>
                `;
            }
            
            return `
                <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(59, 130, 246, 0.05); border-radius: var(--radius-md); border-left: 3px solid ${color};">
                    <div style="font-size: 0.75rem; color: ${color}; margin-bottom: 0.5rem;">
                        <i class="fas ${icono}"></i> ${titulo}:
                    </div>
                    <div id="${loaderId}" style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem; background:var(--gris-oscuro); border-radius:var(--radius-sm);">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span style="font-size:0.8rem;">Cargando audio...</span>
                    </div>
                    <audio id="${audioId}" controls style="width: 100%; display: none;" preload="metadata">
                        <source id="${audioId}_source" src="">
                        Tu navegador no soporta el elemento de audio.
                    </audio>
                </div>
            `;
        }
        
        // =============================================
        // HTML - PROBLEMA REPORTADO
        // =============================================
        const audioProblemaHtml = crearAudioHtml(
            audioProblemaUrl,
            'Grabación del problema (Cliente)',
            'fa-microphone',
            '#3B82F6'
        );
        
        const problemaHtml = `
            <div class="modal-section">
                <h3><i class="fas fa-comment"></i> Problema Reportado</h3>
                <div class="diagnostico-box" style="background: var(--gris-oscuro); padding: 0.75rem; border-radius: var(--radius-md);">
                    <p style="margin: 0 0 0.5rem 0;">${escapeHtml(transcripcionProblema)}</p>
                    ${audioProblemaHtml}
                </div>
            </div>
        `;
        
        // =============================================
        // HTML - DIAGNÓSTICO DEL JEFE DE TALLER
        // =============================================
        const audioDiagnosticoHtml = crearAudioHtml(
            audioDiagnosticoUrl,
            'Grabación del diagnóstico (Jefe de Taller)',
            'fa-clipboard-list',
            '#F59E0B'
        );
        
        const diagnosticoTallerHtml = `
            <div class="modal-section" style="border: 2px solid var(--ambar-alerta); border-radius: var(--radius-md); padding: 1rem; background: rgba(245, 158, 11, 0.05);">
                <h3 style="color: var(--ambar-alerta); display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-stethoscope"></i> Diagnóstico e Instrucciones del Jefe de Taller
                    <span style="font-size: 0.6rem; background: var(--ambar-alerta); color: white; padding: 0.1rem 0.5rem; border-radius: 20px; margin-left: auto;">INSTRUCCIONES</span>
                </h3>
                <div class="diagnostico-box" style="background: var(--gris-oscuro); padding: 0.75rem; border-radius: var(--radius-md);">
                    <p style="white-space: pre-wrap; font-size: 0.9rem; margin: 0 0 0.5rem 0;">
                        ${escapeHtml(diagnosticoTexto) || 'No hay diagnóstico del Jefe de Taller'}
                    </p>
                    ${audioDiagnosticoHtml}
                </div>
                ${instruccionesArmado ? `
                    <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
                        <strong style="color: var(--ambar-alerta);"><i class="fas fa-tools"></i> Instrucciones de Armado:</strong>
                        <p style="white-space: pre-wrap; font-size: 0.9rem; margin-top: 0.5rem;">${escapeHtml(instruccionesArmado)}</p>
                    </div>
                ` : ''}
            </div>
        `;
        
        // =============================================
        // HTML - SECCIÓN DE FOTOS
        // =============================================
        let fotosHtml = '';
        if (fotosArray.length > 0) {
            fotosHtml = `
                <div class="modal-section" id="fotosSeccion_${ordenId}">
                    <h3><i class="fas fa-images"></i> Fotos del Vehículo (${fotosArray.length})</h3>
                    <div class="fotos-grid" id="fotosGrid_${ordenId}" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
                        ${fotosArray.map(([nombre, url], index) => {
                            const imgId = `detalle_img_${ordenId}_${index}`;
                            const loaderId = `detalle_loader_${ordenId}_${index}`;
                            const nombreFormateado = nombre.replace(/_/g, ' ').replace('url ', '').replace('foto ', '').trim();
                            return `
                                <div class="foto-item" style="position:relative; background: var(--gris-oscuro); border-radius: var(--radius-md); overflow: hidden; border: 2px solid var(--border-color); aspect-ratio: 4/3; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                                    <div id="${loaderId}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; gap:0.5rem; flex-direction:column; color:var(--gris-texto);">
                                        <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;"></i>
                                        <span style="font-size:0.7rem;">Cargando...</span>
                                    </div>
                                    <img id="${imgId}" src="" alt="${nombreFormateado}" loading="lazy" 
                                         style="display:none; width:100%; height:100%; object-fit:cover; cursor:pointer;"
                                         onclick="verFoto('${url}')">
                                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:white;font-size:0.6rem;padding:0.25rem;text-align:center;z-index:2;">
                                        ${escapeHtml(nombreFormateado)}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        // =============================================
        // HTML - MODAL COMPLETO
        // =============================================
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
                        <div><strong>Placa:</strong> ${escapeHtml(placa)}</div>
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
                
                ${problemaHtml}
                ${diagnosticoTallerHtml}
                ${fotosHtml}
            </div>
        `;
        
        // =============================================
        // MOSTRAR MODAL
        // =============================================
        document.getElementById('detalleBody').innerHTML = detalleHtml;
        document.getElementById('detalleModal').classList.add('show');
        
        // =============================================
        // 🔥 CARGAR FOTOS Y AUDIOS CON FETCH
        // =============================================
        setTimeout(() => {
            // Asegurar que el token existe
            if (!token) {
                token = getToken();
            }
            
            // 📸 Cargar fotos
            fotosArray.forEach(([nombre, url], index) => {
                const imgId = `detalle_img_${ordenId}_${index}`;
                const loaderId = `detalle_loader_${ordenId}_${index}`;
                cargarImagenDetalle(url, imgId, loaderId);
            });
            
            // 🎵 Cargar audio del problema
            if (audioProblemaUrl) {
                const audioId = `audio_${ordenId}_grabacion_del_problema_cliente`;
                const loaderId = `audioLoader_${ordenId}_grabacion_del_problema_cliente`;
                cargarAudioDetalle(audioProblemaUrl, audioId, loaderId);
            }
            
            // 🎵 Cargar audio del diagnóstico
            if (audioDiagnosticoUrl) {
                const audioId = `audio_${ordenId}_grabacion_del_diagnostico_jefe_de_taller`;
                const loaderId = `audioLoader_${ordenId}_grabacion_del_diagnostico_jefe_de_taller`;
                cargarAudioDetalle(audioDiagnosticoUrl, audioId, loaderId);
            }
            
        }, 200);
        
    } catch (error) {
        console.error('❌ Error en verDetalle:', error);
        showToast(error.message || 'Error al cargar detalles', 'error');
    }
};
// =====================================================
// CARGAR AUDIO EN DETALLE - CON FETCH Y TOKEN
// =====================================================
async function cargarAudioDetalle(url, audioId, loaderId) {
    if (!url || url === '' || url === 'null' || url === 'undefined') {
        const loader = document.getElementById(loaderId);
        if (loader) {
            loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span style="font-size:0.7rem;">Sin audio</span>';
            loader.style.display = 'flex';
        }
        return;
    }
    
    const audio = document.getElementById(audioId);
    const source = audio ? document.getElementById(`${audioId}_source`) : null;
    const loader = document.getElementById(loaderId);
    
    if (!audio || !source) {
        console.warn(`⚠️ No se encontró el elemento audio: ${audioId}`);
        return;
    }
    
    // Mostrar loader
    if (loader) {
        loader.style.display = 'flex';
        loader.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:1.2rem;"></i><span style="font-size:0.7rem;">Cargando audio...</span>';
    }
    audio.style.display = 'none';
    audio.pause();
    source.src = '';
    audio.load();
    
    try {
        const tokenActual = getToken();
        if (!tokenActual) {
            throw new Error('No hay token para Google Drive');
        }
        
        // 🔥 USAR PROXY CON TOKEN
        const proxyUrl = `/tecnico/proxy-audio?url=${encodeURIComponent(url)}`;
        console.log(`🎵 [${audioId}] Cargando audio vía proxy...`);
        
        const response = await fetch(proxyUrl, {
            headers: {
                'Authorization': `Bearer ${tokenActual}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        // 🔥 CONVERTIR A BLOB Y CREAR URL LOCAL
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);
        
        // Asignar al elemento de audio
        source.src = localUrl;
        audio.style.display = 'block';
        audio.load();
        if (loader) loader.style.display = 'none';
        
        // Manejar errores de reproducción
        audio.addEventListener('error', function(e) {
            console.warn(`⚠️ [${audioId}] Error al reproducir audio`);
            if (loader) {
                loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span style="font-size:0.7rem;">Error al reproducir</span>';
                loader.style.display = 'flex';
            }
            audio.style.display = 'none';
        }, { once: true });
        
        console.log(`✅ [${audioId}] Audio cargado correctamente`);
        
    } catch (error) {
        console.error(`❌ [${audioId}] Error:`, error.message);
        if (loader) {
            loader.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span style="font-size:0.7rem;">${error.message}</span>`;
            loader.style.display = 'flex';
        }
        audio.style.display = 'none';
    }
}
// =====================================================
// CARGAR IMAGEN EN DETALLE - CON DETECCIÓN DE TIPO
// =====================================================
async function cargarImagenDetalle(url, imgId, loaderId) {
    if (!url || url === '' || url === 'null' || url === 'undefined') {
        const loader = document.getElementById(loaderId);
        if (loader) {
            loader.innerHTML = '<i class="fas fa-image"></i><span style="font-size:0.7rem;">Sin imagen</span>';
            loader.style.display = 'flex';
        }
        return;
    }
    
    const img = document.getElementById(imgId);
    const loader = document.getElementById(loaderId);
    
    if (!img) {
        console.warn(`⚠️ No se encontró el elemento img: ${imgId}`);
        return;
    }
    
    // Mostrar loader
    if (loader) {
        loader.style.display = 'flex';
        loader.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:1.2rem;"></i><span style="font-size:0.7rem;">Cargando...</span>';
    }
    img.style.display = 'none';
    img.src = '';
    
    try {
        // 🔥 DETECTAR TIPO DE URL
        const esCloudinary = url.includes('res.cloudinary.com');
        const esGoogleDrive = url.includes('drive.google.com') || url.includes('googleusercontent.com');
        
        let imagenUrl;
        
        if (esCloudinary) {
            // ✅ Cloudinary - URL directa
            imagenUrl = url;
            console.log(`📸 [${imgId}] Cloudinary directa`);
            
        } else if (esGoogleDrive) {
            // ✅ Google Drive - Usar proxy con token
            const tokenActual = getToken();
            if (!tokenActual) {
                throw new Error('No hay token para Google Drive');
            }
            
            const proxyUrl = `/tecnico/proxy-imagen-repuesto?url=${encodeURIComponent(url)}`;
            console.log(`📸 [${imgId}] Google Drive vía proxy`);
            
            const response = await fetch(proxyUrl, {
                headers: { 'Authorization': `Bearer ${tokenActual}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (data.success && data.base64) {
                imagenUrl = data.base64;
            } else {
                throw new Error(data.error || 'Error al obtener imagen');
            }
        } else {
            // ✅ Otros URLs (directo)
            imagenUrl = url;
            console.log(`📸 [${imgId}] URL directa`);
        }
        
        // Cargar la imagen
        const nuevaImg = new Image();
        nuevaImg.onload = function() {
            img.src = this.src;
            img.style.display = 'block';
            if (loader) loader.style.display = 'none';
            console.log(`✅ [${imgId}] Imagen cargada correctamente`);
        };
        nuevaImg.onerror = function() {
            img.src = imagenUrl;
            img.style.display = 'block';
            if (loader) loader.style.display = 'none';
            console.warn(`⚠️ [${imgId}] Imagen cargada con fallback`);
        };
        nuevaImg.src = imagenUrl;
        
    } catch (error) {
        console.error(`❌ [${imgId}] Error:`, error.message);
        if (loader) {
            loader.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span style="font-size:0.7rem;">${error.message}</span>`;
            loader.style.display = 'flex';
        }
        img.style.display = 'none';
    }
}
// =====================================================
// VER FOTO AMPLIADA - CON DETECCIÓN DE TIPO
// =====================================================
window.verFoto = async function(url) {
    if (!url) return;
    
    const modalImg = document.getElementById('fotoAmpliada');
    const modal = document.getElementById('fotoModal');
    const loader = document.getElementById('fotoModalLoader');
    
    // Crear loader si no existe
    let loaderElement = loader;
    if (!loaderElement) {
        const imgContainer = modalImg?.parentElement;
        if (imgContainer) {
            const div = document.createElement('div');
            div.id = 'fotoModalLoader';
            div.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-size:1.2rem;z-index:5;';
            div.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
            imgContainer.style.position = 'relative';
            imgContainer.appendChild(div);
            loaderElement = div;
        }
    }
    
    if (modalImg) {
        modalImg.style.display = 'none';
        modalImg.src = '';
    }
    if (loaderElement) {
        loaderElement.style.display = 'block';
        loaderElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    }
    
    if (modal) modal.classList.add('show');
    
    try {
        // 🔥 DETECTAR TIPO DE URL
        const esCloudinary = url.includes('res.cloudinary.com');
        const esGoogleDrive = url.includes('drive.google.com') || url.includes('googleusercontent.com');
        
        let imagenUrl;
        
        if (esCloudinary) {
            imagenUrl = url;
            console.log('📸 Ver foto: Cloudinary directa');
        } else if (esGoogleDrive) {
            const tokenActual = getToken();
            if (!tokenActual) {
                throw new Error('No hay token para Google Drive');
            }
            
            const proxyUrl = `/tecnico/proxy-imagen-repuesto?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, {
                headers: { 'Authorization': `Bearer ${tokenActual}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (data.success && data.base64) {
                imagenUrl = data.base64;
            } else {
                throw new Error(data.error || 'Error al obtener imagen');
            }
        } else {
            imagenUrl = url;
        }
        
        const nuevaImg = new Image();
        nuevaImg.onload = function() {
            if (modalImg) {
                modalImg.src = this.src;
                modalImg.style.display = 'block';
                modalImg.style.objectFit = 'contain';
            }
            if (loaderElement) loaderElement.style.display = 'none';
        };
        nuevaImg.onerror = function() {
            if (modalImg) {
                modalImg.src = imagenUrl;
                modalImg.style.display = 'block';
                modalImg.style.objectFit = 'contain';
            }
            if (loaderElement) loaderElement.style.display = 'none';
        };
        nuevaImg.src = imagenUrl;
        
    } catch (error) {
        console.error('❌ Error en verFoto:', error);
        if (loaderElement) {
            loaderElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
            loaderElement.style.display = 'block';
        }
        showToast('Error al cargar la imagen', 'error');
    }
};

window.cerrarFotoModal = function() {
    const modal = document.getElementById('fotoModal');
    if (modal) modal.classList.remove('show');
    const loader = document.getElementById('fotoModalLoader');
    if (loader) {
        loader.style.display = 'none';
        loader.innerHTML = '';
    }
    const img = document.getElementById('fotoAmpliada');
    if (img) {
        img.src = '';
        img.style.display = 'none';
    }
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
    await cargarVehiculos();
    await cargarComunicados();
    
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
    
    window.subirFotoItemSolicitudTecnico = subirFotoItemSolicitudTecnico;
    window.eliminarFotoItemSolicitudTecnico = eliminarFotoItemSolicitudTecnico;
    window.solicitarRepuestosSinPausa = solicitarRepuestosSinPausa;
    window.cerrarSolicitarRepuestosModal = cerrarSolicitarRepuestosModal;
    window.confirmarSolicitarRepuestos = confirmarSolicitarRepuestos;
    window.verHistorialSolicitudes = verHistorialSolicitudes;
    window.cerrarHistorialModal = cerrarHistorialModal;
    window.verDetalle = verDetalle;
    window.cerrarDetalleModal = cerrarDetalleModal;
    window.verFotoAmpliadaTecnico = verFotoAmpliadaTecnico;
    window.cerrarFotoAmpliadaTecnico = cerrarFotoAmpliadaTecnico;
    window.descargarFotoAmpliadaTecnico = descargarFotoAmpliadaTecnico;
    window.verFoto = verFoto;
    window.cerrarFotoModal = cerrarFotoModal;
    window.empezarTrabajoDiagnostico = empezarTrabajoDiagnostico;
    window.cerrarEmpezarModal = cerrarEmpezarModal;
    window.iniciarReparacion = iniciarReparacion;
    window.cerrarIniciarModal = cerrarIniciarModal;
    window.pausarReparacionManual = pausarReparacionManual;
    window.cerrarPausaManualModal = cerrarPausaManualModal;
    window.reanudarReparacion = reanudarReparacion;
    window.cerrarReanudarModal = cerrarReanudarModal;
    window.mostrarFinalizarModal = mostrarFinalizarModal;
    window.cerrarFinalizarModal = cerrarFinalizarModal;
    window.marcarArmadoCompletado = marcarArmadoCompletado;
    window.recargarDatos = recargarDatos;
    window.cerrarSesion = cerrarSesion;

    console.log('✅ misvehiculos.js - Funciones exportadas correctamente');
});