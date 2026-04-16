// =====================================================
// ADMINISTRACIÓN DE ROLES - JEFE TALLER
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = 'http://localhost:5000/api/admin';
let usuariosData = [];
let rolesData = [];
let usuarioSeleccionado = null;
let currentUserRoles = [];
let currentUserInfo = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    await cargarRoles();
    await cargarUsuarios();
    await cargarEstadisticas();
    setupEventListeners();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUserInfo = payload.user;
        
        if (currentUserInfo && currentUserInfo.roles && Array.isArray(currentUserInfo.roles)) {
            currentUserRoles = currentUserInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (currentUserInfo) currentUserInfo.roles = currentUserRoles;
        }
        
        const esJefeTaller = currentUserRoles.includes('jefe_taller') || 
                              (currentUserInfo && currentUserInfo.rol_principal === 'jefe_taller') ||
                              (currentUserInfo && currentUserInfo.rol === 'jefe_taller');
        
        if (!esJefeTaller) {
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/jefe_taller/dashboard.html';
            }, 2000);
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
        return false;
    }
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
    
    const userNameElement = document.getElementById('userNombre');
    if (userNameElement && currentUserInfo) {
        userNameElement.textContent = currentUserInfo.nombre || 'Jefe Taller';
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => filtrarUsuarios());
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

function logout() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = '/';
}

// =====================================================
// API CALLS
// =====================================================

function getAuthHeaders() {
    const token = localStorage.getItem('furia_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

async function cargarRoles() {
    try {
        const response = await fetch(`${API_URL}/roles`, { headers: getAuthHeaders() });
        if (response.status === 401) { logout(); return; }
        
        const data = await response.json();
        if (response.ok && data.success) {
            // Filtrar para asegurar que no venga el rol cliente
            rolesData = data.roles.filter(rol => rol.id !== 5);
            console.log('✅ Roles cargados (solo personal):', rolesData);
        } else {
            throw new Error(data.error || 'Error cargando roles');
        }
    } catch (error) {
        console.error('Error cargando roles:', error);
        mostrarNotificacion('Error al cargar los roles', 'error');
    }
}

async function cargarUsuarios() {
    try {
        const response = await fetch(`${API_URL}/usuarios`, { headers: getAuthHeaders() });
        if (response.status === 401) { logout(); return; }
        
        const data = await response.json();
        if (response.ok && data.success) {
            usuariosData = data.usuarios;
            console.log('✅ Usuarios de personal cargados:', usuariosData.length);
            renderUsuariosTable(usuariosData);
        } else {
            throw new Error(data.error || 'Error cargando usuarios');
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        mostrarNotificacion('Error al cargar los usuarios', 'error');
        const tbody = document.getElementById('usuariosTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-row"><i class="fas fa-exclamation-circle"></i> Error al cargar usuarios</td></tr>`;
        }
    }
}

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_URL}/estadisticas`, { headers: getAuthHeaders() });
        if (response.status === 401) { logout(); return; }
        
        const data = await response.json();
        if (response.ok && data.success) {
            const stats = data.estadisticas;
            
            document.getElementById('totalUsuarios').textContent = stats.total_usuarios || 0;
            
            for (const rol of stats.usuarios_por_rol) {
                const rolNombre = rol.rol_nombre;
                const cantidad = rol.cantidad;
                
                if (rolNombre === 'jefe_operativo') {
                    const elem = document.getElementById('totalJefeOperativo');
                    if (elem) elem.textContent = cantidad;
                } else if (rolNombre === 'jefe_taller') {
                    const elem = document.getElementById('totalJefeTaller');
                    if (elem) elem.textContent = cantidad;
                } else if (rolNombre === 'tecnico') {
                    const elem = document.getElementById('totalTecnico');
                    if (elem) elem.textContent = cantidad;
                } else if (rolNombre === 'encargado_repuestos') {
                    const elem = document.getElementById('totalRepuestos');
                    if (elem) elem.textContent = cantidad;
                }
            }
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// =====================================================
// RENDER FUNCTIONS
// =====================================================

function renderUsuariosTable(usuarios) {
    const tbody = document.getElementById('usuariosTableBody');
    if (!tbody) return;
    
    if (usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-row">No hay usuarios de personal registrados</td></tr>`;
        return;
    }
    
    tbody.innerHTML = usuarios.map(usuario => `
        <tr data-id="${usuario.id}">
            <td>${usuario.id}</td>
            <td><strong>${escapeHtml(usuario.nombre)}</strong></td>
            <td>${escapeHtml(usuario.email || '-')}</td>
            <td>${escapeHtml(usuario.documento || '-')}</td>
            <td>
                <div class="roles-badge">
                    ${usuario.roles_nombres && usuario.roles_nombres.length > 0 
                        ? usuario.roles_nombres.map(rol => `<span class="role-tag ${rol.replace('_', '-')}">${formatRolName(rol)}</span>`).join('')
                        : '<span class="no-roles">Sin roles asignados</span>'}
                </div>
               </td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verDetalleUsuario(${usuario.id})" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn edit" onclick="abrirModalRoles(${usuario.id})" title="Editar roles">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="eliminarUsuario(${usuario.id})" title="Eliminar usuario">
                    <i class="fas fa-trash-alt"></i>
                </button>
             </td>
        </tr>
    `).join('');
}

function filtrarUsuarios() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    
    if (!searchTerm) {
        renderUsuariosTable(usuariosData);
        return;
    }
    
    const filtrados = usuariosData.filter(u => 
        u.nombre.toLowerCase().includes(searchTerm) ||
        (u.email && u.email.toLowerCase().includes(searchTerm)) ||
        (u.documento && u.documento.includes(searchTerm))
    );
    
    renderUsuariosTable(filtrados);
}

// =====================================================
// VER DETALLE DE USUARIO
// =====================================================

async function verDetalleUsuario(usuarioId) {
    try {
        mostrarNotificacion('Cargando datos...', 'info');
        
        const response = await fetch(`${API_URL}/usuario/${usuarioId}`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) { logout(); return; }
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            const usuario = data.usuario;
            
            const modalBody = document.getElementById('modalDetalleUsuarioBody');
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="detalle-usuario">
                        <div class="info-group">
                            <label><i class="fas fa-user"></i> Nombre completo</label>
                            <p>${escapeHtml(usuario.nombre)}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-envelope"></i> Correo electrónico</label>
                            <p>${escapeHtml(usuario.email || 'No registrado')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-id-card"></i> Número de documento</label>
                            <p>${escapeHtml(usuario.documento || 'No registrado')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-phone"></i> Teléfono / Contacto</label>
                            <p>${escapeHtml(usuario.contacto || 'No registrado')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-map-marker-alt"></i> Ubicación</label>
                            <p>${escapeHtml(usuario.ubicacion || 'No registrada')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-calendar-alt"></i> Fecha de registro</label>
                            <p>${formatDate(usuario.fecha_registro)}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-tags"></i> Roles asignados</label>
                            <div class="roles-badge">
                                ${usuario.roles && usuario.roles.length > 0 
                                    ? usuario.roles.map(rol => `<span class="role-tag ${rol.replace('_', '-')}">${formatRolName(rol)}</span>`).join('')
                                    : '<span class="no-roles">Sin roles asignados</span>'}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            document.getElementById('modalDetalleUsuario').classList.add('show');
        } else {
            throw new Error(data.error || 'Error al cargar detalles');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cerrarModalDetalleUsuario() {
    document.getElementById('modalDetalleUsuario').classList.remove('show');
}

// =====================================================
// ELIMINAR USUARIO
// =====================================================

async function eliminarUsuario(usuarioId) {
    const usuario = usuariosData.find(u => u.id === usuarioId);
    if (!usuario) return;
    
    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario "${usuario.nombre}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/usuario/${usuarioId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) { logout(); return; }
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            mostrarNotificacion(data.message, 'success');
            await cargarUsuarios();
            await cargarEstadisticas();
        } else {
            throw new Error(data.error || 'Error al eliminar usuario');
        }
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// MODAL DE ROLES
// =====================================================

function abrirModalRoles(usuarioId) {
    const usuario = usuariosData.find(u => u.id === usuarioId);
    if (!usuario) {
        mostrarNotificacion('Usuario no encontrado', 'error');
        return;
    }
    
    usuarioSeleccionado = usuario;
    
    document.getElementById('modalUserName').textContent = usuario.nombre;
    document.getElementById('modalUserEmail').textContent = usuario.email || 'No registrado';
    document.getElementById('modalUserDocumento').textContent = usuario.documento || 'No registrado';
    
    const rolesContainer = document.getElementById('rolesCheckboxGroup');
    if (rolesContainer && rolesData.length > 0) {
        rolesContainer.innerHTML = rolesData.map(rol => `
            <div class="role-checkbox-item" onclick="toggleCheckbox(${rol.id})">
                <input type="checkbox" id="rol_${rol.id}" value="${rol.id}" 
                    ${usuario.roles_ids && usuario.roles_ids.includes(rol.id) ? 'checked' : ''}>
                <label for="rol_${rol.id}">
                    ${formatRolName(rol.nombre_rol)}
                    <span class="role-description">${rol.descripcion || getRolDescription(rol.nombre_rol)}</span>
                </label>
            </div>
        `).join('');
    }
    
    document.getElementById('rolesModal').classList.add('show');
}

function toggleCheckbox(rolId) {
    const checkbox = document.getElementById(`rol_${rolId}`);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
    }
}

async function saveRoles() {
    if (!usuarioSeleccionado) return;
    
    const checkboxes = document.querySelectorAll('#rolesCheckboxGroup input[type="checkbox"]');
    const rolesSeleccionados = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));
    
    mostrarNotificacion('Guardando cambios...', 'info');
    
    try {
        const response = await fetch(`${API_URL}/usuario/${usuarioSeleccionado.id}/roles`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ roles_ids: rolesSeleccionados })
        });
        
        if (response.status === 401) { logout(); return; }
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            mostrarNotificacion(data.message, 'success');
            closeRolesModal();
            await cargarUsuarios();
            await cargarEstadisticas();
        } else {
            throw new Error(data.error || 'Error al guardar los roles');
        }
    } catch (error) {
        console.error('Error guardando roles:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function closeRolesModal() {
    document.getElementById('rolesModal').classList.remove('show');
    usuarioSeleccionado = null;
}

// =====================================================
// UTILIDADES
// =====================================================

function formatRolName(rolNombre) {
    const nombres = {
        'jefe_operativo': 'Jefe Operativo',
        'jefe_taller': 'Jefe de Taller',
        'tecnico': 'Técnico Mecánico',
        'encargado_repuestos': 'Encargado de Repuestos'
    };
    return nombres[rolNombre] || rolNombre.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getRolDescription(rolNombre) {
    const descripciones = {
        'jefe_operativo': 'Gestiona recepción, cotizaciones y facturación',
        'jefe_taller': 'Supervisa diagnósticos, asigna técnicos y planifica',
        'tecnico': 'Realiza diagnósticos y trabajos mecánicos',
        'encargado_repuestos': 'Gestiona inventario y cotizaciones de repuestos'
    };
    return descripciones[rolNombre] || '';
}

function formatDate(dateStr) {
    if (!dateStr) return 'No registrado';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 9999;`;
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
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
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

// Funciones globales
window.verDetalleUsuario = verDetalleUsuario;
window.cerrarModalDetalleUsuario = cerrarModalDetalleUsuario;
window.eliminarUsuario = eliminarUsuario;
window.abrirModalRoles = abrirModalRoles;
window.closeRolesModal = closeRolesModal;
window.saveRoles = saveRoles;
window.toggleCheckbox = toggleCheckbox;
window.logout = logout;