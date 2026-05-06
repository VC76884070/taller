// =====================================================
// MIS VEHÍCULOS - TÉCNICO MECÁNICO
// VERSIÓN COMPLETA - CON BOTONES DE REPARACIÓN CORREGIDOS
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

// Items para solicitud de repuestos
let itemsPausa = [];

// =====================================================
// FUNCIONES PARA MANEJAR ITEMS DE PAUSA
// =====================================================
function renderItemsPausa() {
    const container = document.getElementById('itemsListPausa');
    if (!container) return;
    
    if (itemsPausa.length === 0) {
        container.innerHTML = `<div class="item-empty"><i class="fas fa-box-open"></i><p>No hay repuestos agregados</p><small>Haz clic en "Agregar repuesto" para comenzar</small></div>`;
        return;
    }
    
    container.innerHTML = itemsPausa.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Nombre del repuesto" onchange="actualizarItemPausa(${index}, 'descripcion', this.value)">
                <input type="number" class="item-cantidad" value="${item.cantidad}" min="1" onchange="actualizarItemPausa(${index}, 'cantidad', parseInt(this.value))">
                <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle (marca, especificaciones...)" onchange="actualizarItemPausa(${index}, 'detalle', this.value)">
            </div>
            <div class="item-actions">
                <button class="btn-remove-item" onclick="eliminarItemPausa(${index})"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `).join('');
}

function agregarItemPausa() {
    itemsPausa.push({ descripcion: '', cantidad: 1, detalle: '' });
    renderItemsPausa();
    setTimeout(() => {
        const lastInput = document.querySelector('#itemsListPausa .item-row:last-child .item-descripcion');
        if (lastInput) lastInput.focus();
    }, 100);
}

function actualizarItemPausa(index, campo, valor) {
    if (itemsPausa[index]) itemsPausa[index][campo] = valor;
}

function eliminarItemPausa(index) {
    itemsPausa.splice(index, 1);
    renderItemsPausa();
}

function limpiarItemsPausa() {
    itemsPausa = [];
    renderItemsPausa();
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

function mostrarIndicadorRoles() {
    const headerUserInfo = document.querySelector('.user-info');
    if (headerUserInfo && rolesUsuario && rolesUsuario.length > 1) {
        if (headerUserInfo.querySelector('.roles-badge')) return;
        const rolesBadge = document.createElement('div');
        rolesBadge.className = 'roles-badge';
        rolesBadge.style.cssText = `font-size: 0.7rem; background: var(--gris-200); padding: 0.2rem 0.5rem; border-radius: 12px; margin-top: 0.25rem; display: inline-block; color: var(--blanco); cursor: pointer;`;
        const nombresRoles = rolesUsuario.map(r => {
            const nombres = { 'jefe_taller': 'Jefe Taller', 'jefe_operativo': 'Jefe Operativo', 'tecnico': 'Técnico', 'encargado_repuestos': 'Repuestos', 'cliente': 'Cliente' };
            return nombres[r] || r;
        }).join(' • ');
        rolesBadge.innerHTML = `<i class="fas fa-exchange-alt" style="margin-right: 0.3rem;"></i>${nombresRoles}`;
        rolesBadge.title = 'Tienes múltiples roles. Haz clic para cambiar de rol.';
        rolesBadge.onclick = () => { if (confirm('¿Cambiar de rol?')) cerrarSesion(); };
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
        console.log('📊 Detalle de vehículos:', vehiculosAsignados.map(v => ({ id: v.orden_id, estado: v.estado_global, tipo: v.tipo_asignacion, trabajo_iniciado: v.trabajo_iniciado })));
        
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
// RENDERIZADO DE VEHÍCULOS (CORREGIDO)
// =====================================================
function renderVehiculos() {
    console.log('📊 TODOS LOS VEHÍCULOS:', vehiculosAsignados);
    const grid = document.getElementById('vehiculosGrid');
    if (!grid) return;
    
    if (!vehiculosAsignados || vehiculosAsignados.length === 0) {
        grid.innerHTML = '<div class="no-data">No hay vehículos asignados</div>';
        return;
    }
    
    grid.innerHTML = vehiculosAsignados.map(vehiculo => {
        const tipo = vehiculo.tipo_asignacion;
        const estadoGlobal = vehiculo.estado_global;
        const trabajoIniciado = vehiculo.trabajo_iniciado || false;
        
        // Para depuración
        console.log(`🔍 Vehículo ${vehiculo.orden_id}: estado="${estadoGlobal}", tipo="${tipo}", trabajoIniciado=${trabajoIniciado}`);
        
        const bahiaInfo = vehiculo.bahia_asignada ? 
            `<div class="bahia-info"><i class="fas fa-warehouse"></i> Bahía: ${vehiculo.bahia_asignada}</div>` : '';
        
        let badgeHtml = '';
        let botonesHtml = '';
        
        // ============ CASO ARMADO ============
        if (tipo === 'armado' || estadoGlobal === 'EnArmadoVehiculo') {
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
                        <i class="fas fa-eye"></i> Ver Detalles
                    </button>
                </div>
                ${bahiaInfo}
                ${instruccionesHtml}
            `;
        }
        // ============ CASO DIAGNÓSTICO ============
        else if (tipo === 'diagnostico') {
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
                    <div class="bahia-info" style="background: rgba(16, 185, 129, 0.1);"><i class="fas fa-warehouse"></i> Bahía ocupada: ${vehiculo.bahia_asignada || 'N/A'}</div>
                `;
            }
        }
        // ============ CASO REPARACIÓN (CORREGIDO) ============
        else if (tipo === 'reparacion' || estadoGlobal === 'EnReparacion') {
            badgeHtml = `<span class="asignacion-badge reparacion"><i class="fas fa-wrench"></i> Reparación</span>`;
            
            // Si está en pausa
            if (estadoGlobal === 'EnPausa') {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-success-sm" onclick="reanudarReparacion(${vehiculo.orden_id})"><i class="fas fa-play"></i> Reanudar Reparación</button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                    </div>
                    ${bahiaInfo}
                `;
            }
            // Si está activa la reparación (EnReparacion)
            else if (estadoGlobal === 'EnReparacion') {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-warning-sm" onclick="pausarReparacion(${vehiculo.orden_id})"><i class="fas fa-pause"></i> Pausar (motivo)</button>
                        <button class="btn-sm btn-primary-sm" onclick="pausarConRepuestos(${vehiculo.orden_id})"><i class="fas fa-shopping-cart"></i> Pausar + Solicitar Repuestos</button>
                        <button class="btn-sm btn-danger-sm" onclick="mostrarFinalizarModal(${vehiculo.orden_id})"><i class="fas fa-flag-checkered"></i> Finalizar Reparación</button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                    </div>
                    ${bahiaInfo}
                `;
            }
            // Si no ha iniciado
            else if (!trabajoIniciado) {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-primary-sm" onclick="iniciarReparacion(${vehiculo.orden_id})"><i class="fas fa-play-circle"></i> Iniciar Reparación</button>
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                    </div>
                    ${bahiaInfo}
                `;
            }
            // Fallback: mostrar botones básicos
            else {
                botonesHtml = `
                    <div class="botones-container">
                        <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                    </div>
                    ${bahiaInfo}
                `;
            }
        }
        
        return `
            <div class="vehiculo-card" data-orden-id="${vehiculo.orden_id}">
                <div class="card-header">
                    <div class="vehiculo-info">
                        <div class="vehiculo-icon">
                            <i class="fas ${tipo === 'diagnostico' ? 'fa-stethoscope' : (tipo === 'reparacion' || estadoGlobal === 'EnReparacion' ? 'fa-wrench' : 'fa-tools')}"></i>
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
// REPARACIÓN - PAUSAR (SIMPLE)
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
        const response = await fetch('/tecnico/pausar-reparacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ id_orden: parseInt(ordenId), motivo: motivo, tipo: 'simple' })
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
// REPARACIÓN - PAUSAR CON REPUESTOS
// =====================================================
window.pausarConRepuestos = function(ordenId) {
    limpiarItemsPausa();
    document.getElementById('ordenIdPausaItems').value = ordenId;
    document.getElementById('motivoPausaItems').value = '';
    document.getElementById('pausaItemsModal').classList.add('show');
};

window.cerrarPausaItemsModal = function() {
    document.getElementById('pausaItemsModal').classList.remove('show');
    document.getElementById('ordenIdPausaItems').value = '';
    limpiarItemsPausa();
};

async function confirmarPausaConRepuestos() {
    const ordenId = document.getElementById('ordenIdPausaItems').value;
    const motivo = document.getElementById('motivoPausaItems').value.trim();
    const itemsValidos = itemsPausa.filter(item => item.descripcion && item.descripcion.trim() !== '');
    
    if (itemsValidos.length === 0) {
        showToast('Debes agregar al menos un repuesto a solicitar', 'warning');
        return;
    }
    
    cerrarPausaItemsModal();
    showToast('Enviando solicitud de repuestos...', 'info');
    
    try {
        const response = await fetch('/tecnico/pausar-reparacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ 
                id_orden: parseInt(ordenId), 
                motivo: motivo || 'Esperando repuestos para continuar la reparación',
                tipo: 'repuestos',
                items: itemsValidos
            })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Solicitud de repuestos enviada. Reparación pausada.', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al procesar', 'error');
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
            showToast('Reparación reanudada correctamente', 'success');
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
window.mostrarFinalizarModal = function(ordenId) {
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        document.getElementById('finalizarInfo').innerHTML = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
        `;
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
        const tipoAsignacion = detalle.tipo_asignacion;
        
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
    mostrarIndicadorRoles();
    await cargarVehiculos();
    await cargarComunicados();
    
    // Configurar botones de modales
    document.getElementById('confirmarEmpezarBtn')?.addEventListener('click', confirmarEmpezarDiagnostico);
    document.getElementById('confirmarInicioBtn')?.addEventListener('click', confirmarInicioReparacion);
    document.getElementById('confirmarPausaBtn')?.addEventListener('click', confirmarPausaReparacion);
    document.getElementById('btnAgregarItemPausa')?.addEventListener('click', agregarItemPausa);
    document.getElementById('confirmarPausaItemsBtn')?.addEventListener('click', confirmarPausaConRepuestos);
    document.getElementById('confirmarReanudarBtn')?.addEventListener('click', confirmarReanudarReparacion);
    document.getElementById('confirmarFinalizarBtn')?.addEventListener('click', confirmarFinalizarReparacion);
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    });
    
    setInterval(() => {
        if (document.visibilityState === 'visible' && token) {
            cargarVehiculos();
            cargarComunicados();
        }
    }, 30000);
    
    console.log('✅ misvehiculos.js cargado correctamente');
});