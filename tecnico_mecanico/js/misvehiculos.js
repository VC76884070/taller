// =====================================================
// MIS VEHÍCULOS - TÉCNICO MECÁNICO
// CORREGIDO PARA MULTI-ROL CON SISTEMA DE BAHÍAS
// FURIA MOTOR COMPANY SRL
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
        redirect: '/tecnico_mecanico/misvehiculos.html'
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
    cargarEstadoBahias();
};

// =====================================================
// VERIFICAR AUTENTICACIÓN - CORREGIDO
// =====================================================
async function verificarToken() {
    if (!token) {
        console.error('No hay token');
        window.location.href = '/';
        return false;
    }
    
    try {
        // Obtener usuario del localStorage
        const userData = localStorage.getItem('furia_user');
        if (userData) {
            usuarioActual = JSON.parse(userData);
            rolesUsuario = usuarioActual.roles || [];
        }
        
        // Verificar token con el backend
        const response = await fetch('/tecnico/api/verify-token', {
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
        
        // Actualizar usuario con datos del backend
        if (data.user) {
            usuarioActual = data.user;
            rolesUsuario = data.user.roles || [];
            
            // Actualizar localStorage
            localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
        }
        
        // Obtener rol seleccionado
        const selectedRole = localStorage.getItem('furia_selected_role');
        
        console.log('📋 Roles del usuario:', rolesUsuario);
        console.log('🎯 Rol seleccionado:', selectedRole);
        
        // Verificar si tiene rol de técnico (por NOMBRE)
        const tieneRolTecnico = rolesUsuario.includes('tecnico');
        
        if (!tieneRolTecnico) {
            console.warn('❌ Usuario no tiene permiso de Técnico');
            showToast('No tienes permisos para acceder a esta sección', 'error');
            
            // Redirigir según el primer rol que tenga
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
        
        // Si el usuario seleccionó otro rol diferente a técnico, redirigir
        if (selectedRole && selectedRole !== 'tecnico' && ROLE_CONFIG[selectedRole]) {
            console.log(`🔄 Usuario seleccionó ${selectedRole}, redirigiendo...`);
            window.location.href = ROLE_CONFIG[selectedRole].redirect;
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

// Mostrar indicador de roles múltiples
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

// Mostrar nombre de usuario
function mostrarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan && usuarioActual) {
        userNameSpan.textContent = usuarioActual.nombre || usuarioActual.email || 'Usuario';
    }
}

// =====================================================
// CARGAR ESTADO DE BAHÍAS
// =====================================================
async function cargarEstadoBahias() {
    try {
        const response = await fetch('/tecnico/api/estado-bahias', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.bahias) {
            actualizarUIBahias(data.bahias);
        }
    } catch (error) {
        console.error('Error cargando estado de bahías:', error);
    }
}

function actualizarUIBahias(bahias) {
    const container = document.getElementById('bahiasContainer');
    if (!container) return;
    
    container.innerHTML = bahias.map(bahia => {
        const estado = bahia.estado || 'libre';
        const estadoClass = estado === 'ocupado' ? 'ocupado' : 'libre';
        const estadoTexto = estado === 'ocupado' ? 'Ocupada' : 'Libre';
        
        return `
            <div class="bahia-card ${estadoClass}" data-bahia="${bahia.bahia_numero}">
                <div class="bahia-numero">Bahía ${bahia.bahia_numero}</div>
                <div class="bahia-estado">
                    <span class="estado-indicador ${estadoClass}"></span>
                    ${estadoTexto}
                </div>
                ${bahia.orden_codigo ? `<div class="bahia-orden">Orden: ${escapeHtml(bahia.orden_codigo)}</div>` : ''}
            </div>
        `;
    }).join('');
}

// =====================================================
// CARGAR VEHÍCULOS ASIGNADOS
// =====================================================
async function cargarVehiculos() {
    const grid = document.getElementById('vehiculosGrid');
    const loadingContainer = document.getElementById('loadingContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (grid) grid.innerHTML = '';
    if (loadingContainer) loadingContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    try {
        const response = await fetch('/tecnico/api/mis-vehiculos', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
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
        
        // Actualizar badge de notificaciones (trabajos en pausa)
        const badge = document.getElementById('notificacionesBadge');
        if (badge) {
            const enPausa = vehiculosAsignados.filter(v => v.estado_global === 'EnPausa').length;
            badge.textContent = enPausa;
            badge.style.display = enPausa > 0 ? 'flex' : 'none';
        }
        
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

// Renderizar tarjetas de vehículos
function renderVehiculos() {
    const grid = document.getElementById('vehiculosGrid');
    if (!grid) return;
    
    if (!vehiculosAsignados || vehiculosAsignados.length === 0) {
        grid.innerHTML = '<div class="no-data">No hay vehículos asignados</div>';
        return;
    }
    
    grid.innerHTML = vehiculosAsignados.map(vehiculo => {
        const estado = vehiculo.estado_global === 'EnProceso' ? 'proceso' : 'pausa';
        const estadoTexto = vehiculo.estado_global === 'EnProceso' ? 'En Proceso' : 'En Pausa';
        const estadoIcon = vehiculo.estado_global === 'EnProceso' ? 'fa-play-circle' : 'fa-pause-circle';
        
        const tieneDiagnostico = vehiculo.diagnostico_inicial && vehiculo.diagnostico_inicial !== '';
        const tieneAudio = vehiculo.diagnostico_audio_url;
        const tieneProblema = vehiculo.recepcion?.transcripcion_problema;
        
        return `
            <div class="vehiculo-card" data-orden-id="${vehiculo.orden_id}">
                <div class="card-header">
                    <div class="vehiculo-info">
                        <div class="vehiculo-icon">
                            <i class="fas fa-car"></i>
                        </div>
                        <div class="vehiculo-titulo">
                            <h3>${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</h3>
                            <span class="placa">${escapeHtml(vehiculo.vehiculo.placa)}</span>
                        </div>
                    </div>
                    <span class="estado-badge ${estado}">
                        <i class="fas ${estadoIcon}"></i> ${estadoTexto}
                    </span>
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
                    
                    ${vehiculo.motivo_pausa ? `
                        <div class="motivo-pausa">
                            <i class="fas fa-info-circle"></i>
                            <strong>Motivo pausa:</strong> ${escapeHtml(vehiculo.motivo_pausa)}
                        </div>
                    ` : ''}
                    
                    ${tieneProblema ? `
                        <div class="diagnostico-preview">
                            <p><i class="fas fa-comment"></i> <strong>Problema reportado:</strong></p>
                            <div class="diagnostico-texto">${escapeHtml(truncateText(vehiculo.recepcion.transcripcion_problema, 100))}</div>
                        </div>
                    ` : ''}
                    
                    ${tieneDiagnostico ? `
                        <div class="diagnostico-preview">
                            <p><i class="fas fa-clipboard-list"></i> <strong>Instrucciones Jefe Taller:</strong></p>
                            <div class="diagnostico-texto">${escapeHtml(truncateText(vehiculo.diagnostico_inicial, 100))}</div>
                        </div>
                    ` : ''}
                    
                    ${tieneAudio ? `
                        <div class="audio-player">
                            <audio controls preload="none">
                                <source src="${vehiculo.diagnostico_audio_url}" type="audio/mpeg">
                                Tu navegador no soporta audio.
                            </audio>
                        </div>
                    ` : ''}
                </div>
                
                <div class="card-footer">
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    
                    ${vehiculo.estado_global === 'EnPausa' ? `
                        <button class="btn-sm btn-success-sm" onclick="abrirReanudarModal(${vehiculo.orden_id})">
                            <i class="fas fa-play"></i> Reanudar
                        </button>
                        <button class="btn-sm btn-danger-sm" onclick="finalizarTrabajo(${vehiculo.orden_id})">
                            <i class="fas fa-flag-checkered"></i> Finalizar
                        </button>
                    ` : `
                        <button class="btn-sm btn-outline-sm" onclick="abrirIniciarModal(${vehiculo.orden_id})">
                            <i class="fas fa-play-circle"></i> Empezar
                        </button>
                        <button class="btn-sm btn-outline-sm" onclick="abrirPausaModal(${vehiculo.orden_id})">
                            <i class="fas fa-pause"></i> Pausar
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// Formatear fecha
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

// Truncar texto
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Escapar HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// MODAL DE INICIAR TRABAJO (CON SELECCIÓN DE BAHÍA)
// =====================================================
let ordenSeleccionadaParaIniciar = null;

window.abrirIniciarModal = async function(ordenId) {
    ordenSeleccionadaParaIniciar = ordenId;
    
    // Cargar estado actual de bahías
    await cargarEstadoBahias();
    
    // Obtener información de la orden
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        const infoHtml = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
        `;
        document.getElementById('iniciarInfo').innerHTML = infoHtml;
    }
    
    document.getElementById('iniciarModal').classList.add('show');
};

window.cerrarIniciarModal = function() {
    document.getElementById('iniciarModal').classList.remove('show');
    document.getElementById('iniciarInfo').innerHTML = '';
    document.getElementById('bahiaSeleccionada').value = '';
    ordenSeleccionadaParaIniciar = null;
};

async function confirmarInicio() {
    const bahiaSeleccionada = document.getElementById('bahiaSeleccionada').value;
    
    if (!bahiaSeleccionada) {
        showToast('Debes seleccionar una bahía', 'warning');
        return;
    }
    
    cerrarIniciarModal();
    showToast('Iniciando trabajo...', 'info');
    
    try {
        const response = await fetch('/tecnico/api/iniciar-trabajo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                id_orden: parseInt(ordenSeleccionadaParaIniciar), 
                bahia_asignada: parseInt(bahiaSeleccionada)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message || 'Trabajo iniciado correctamente', 'success');
            cargarVehiculos();
            cargarEstadoBahias();
        } else {
            if (data.bahia_ocupada) {
                showToast(data.error, 'warning');
                // Recargar estado de bahías para mostrar actualización
                await cargarEstadoBahias();
                // Reabrir modal para que seleccione otra bahía
                setTimeout(() => abrirIniciarModal(ordenSeleccionadaParaIniciar), 1500);
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
// MODAL DE PAUSA
// =====================================================
window.abrirPausaModal = function(ordenId) {
    document.getElementById('ordenIdPausa').value = ordenId;
    document.getElementById('motivoPausa').value = '';
    document.getElementById('pausaModal').classList.add('show');
};

window.cerrarPausaModal = function() {
    document.getElementById('pausaModal').classList.remove('show');
    document.getElementById('motivoPausa').value = '';
    document.getElementById('ordenIdPausa').value = '';
};

async function confirmarPausa() {
    const ordenId = document.getElementById('ordenIdPausa').value;
    const motivo = document.getElementById('motivoPausa').value.trim();
    
    if (!motivo) {
        showToast('Debes especificar el motivo de la pausa', 'warning');
        return;
    }
    
    cerrarPausaModal();
    showToast('Pausando trabajo...', 'info');
    
    try {
        const response = await fetch('/tecnico/api/pausar-trabajo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId), motivo })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Trabajo pausado correctamente', 'success');
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
// MODAL DE REANUDAR
// =====================================================
window.abrirReanudarModal = function(ordenId) {
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        const infoHtml = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
            ${vehiculo.motivo_pausa ? `<p><strong>Motivo de pausa:</strong> ${escapeHtml(vehiculo.motivo_pausa)}</p>` : ''}
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

async function confirmarReanudar() {
    const ordenId = document.getElementById('ordenIdReanudar').value;
    
    cerrarReanudarModal();
    showToast('Reanudando trabajo...', 'info');
    
    try {
        const response = await fetch('/tecnico/api/reanudar-trabajo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Trabajo reanudado correctamente', 'success');
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
// FINALIZAR TRABAJO
// =====================================================
window.finalizarTrabajo = async function(ordenId) {
    if (!confirm('¿Estás seguro de que deseas finalizar este trabajo? La bahía quedará libre para nuevas órdenes.')) {
        return;
    }
    
    showToast('Finalizando trabajo...', 'info');
    
    try {
        const response = await fetch('/tecnico/api/finalizar-trabajo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Trabajo finalizado correctamente', 'success');
            cargarVehiculos();
            cargarEstadoBahias();
        } else {
            showToast(data.error || 'Error al finalizar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
};

// =====================================================
// MODAL DE DETALLE
// =====================================================
window.verDetalle = async function(ordenId) {
    showToast('Cargando detalles...', 'info');
    
    try {
        const response = await fetch(`/tecnico/api/detalle-orden/${ordenId}`, {
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
        
        const kilometraje = detalle.vehiculo?.kilometraje ? 
            `${parseInt(detalle.vehiculo.kilometraje).toLocaleString()} km` : 'N/A';
        
        const anio = detalle.vehiculo?.anio && detalle.vehiculo.anio !== 'N/A' ? 
            detalle.vehiculo.anio : 'No especificado';
        
        const marcaModelo = `${detalle.vehiculo?.marca || ''} ${detalle.vehiculo?.modelo || ''}`.trim() || 'No especificado';
        
        const bahiaInfo = detalle.planificacion?.bahia_asignada ? 
            `<div><strong>Bahía asignada:</strong> ${detalle.planificacion.bahia_asignada}</div>` : '';
        
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
                    </div>
                </div>
                
                <div class="modal-section">
                    <h3><i class="fas fa-car"></i> Datos del Vehículo</h3>
                    <div class="detalle-grid">
                        <div><strong>Placa:</strong> ${escapeHtml(detalle.vehiculo?.placa || 'No registrada')}</div>
                        <div><strong>Marca/Modelo:</strong> ${escapeHtml(marcaModelo)}</div>
                        <div><strong>Año:</strong> ${escapeHtml(anio)}</div>
                        <div><strong>Kilometraje:</strong> ${kilometraje}</div>
                        ${detalle.vehiculo?.color ? `<div><strong>Color:</strong> ${escapeHtml(detalle.vehiculo.color)}</div>` : ''}
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
                
                <div class="modal-section">
                    <h3><i class="fas fa-clipboard-list"></i> Instrucciones del Jefe de Taller</h3>
                    <div class="diagnostico-box">
                        <p>${escapeHtml(detalle.diagnostico_inicial || 'No hay instrucciones registradas')}</p>
                        ${detalle.diagnostico_audio_url ? `
                            <div class="audio-player" style="margin-top: 0.75rem;">
                                <audio controls preload="none">
                                    <source src="${detalle.diagnostico_audio_url}" type="audio/mpeg">
                                    Tu navegador no soporta audio.
                                </audio>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
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

// Ver foto en grande
window.verFoto = function(url) {
    const modalHtml = `
        <div class="modal show" id="fotoModal" onclick="cerrarFotoModal()">
            <div class="modal-content modal-lg" style="max-width: 90%; background: transparent;" onclick="event.stopPropagation()">
                <div style="text-align: right; margin-bottom: 0.5rem;">
                    <button class="modal-close" onclick="cerrarFotoModal()" style="background: var(--bg-card); padding: 0.3rem 0.8rem; border-radius: var(--radius-full);">&times;</button>
                </div>
                <img src="${url}" style="width: 100%; border-radius: var(--radius-lg);">
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('fotoModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.cerrarFotoModal = function() {
    const modal = document.getElementById('fotoModal');
    if (modal) modal.remove();
};

window.cerrarDetalleModal = function() {
    document.getElementById('detalleModal').classList.remove('show');
};

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
    token = getToken();
    
    console.log('Token encontrado:', token ? 'Sí' : 'No');
    
    if (!token) {
        console.error('No se encontró token');
        window.location.href = '/';
        return;
    }
    
    const tokenValido = await verificarToken();
    if (!tokenValido) return;
    
    mostrarFechaActual();
    mostrarNombreUsuario();
    mostrarIndicadorRoles();
    await cargarVehiculos();
    await cargarEstadoBahias();
    
    // Configurar botones de modales
    const confirmarInicioBtn = document.getElementById('confirmarInicioBtn');
    if (confirmarInicioBtn) {
        confirmarInicioBtn.onclick = confirmarInicio;
    }
    
    const confirmarPausaBtn = document.getElementById('confirmarPausaBtn');
    if (confirmarPausaBtn) {
        confirmarPausaBtn.onclick = confirmarPausa;
    }
    
    const confirmarReanudarBtn = document.getElementById('confirmarReanudarBtn');
    if (confirmarReanudarBtn) {
        confirmarReanudarBtn.onclick = confirmarReanudar;
    }
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
    
    // Refrescar datos cada 30 segundos
    setInterval(() => {
        if (document.visibilityState === 'visible' && token) {
            cargarVehiculos();
            cargarEstadoBahias();
        }
    }, 30000);
    
    console.log('✅ misvehiculos.js cargado correctamente');
});