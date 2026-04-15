// =====================================================
// ADMINISTRACIÓN DE ROLES - JEFE TALLER (CORREGIDO)
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
        // Decodificar token para obtener información del usuario
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUserInfo = payload.user;
        
        // Obtener roles del usuario
        if (currentUserInfo && currentUserInfo.roles && Array.isArray(currentUserInfo.roles)) {
            currentUserRoles = currentUserInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (currentUserInfo) currentUserInfo.roles = currentUserRoles;
        }
        
        console.log('🔐 Usuario autenticado:', currentUserInfo?.nombre);
        console.log('📋 Roles del usuario:', currentUserRoles);
        
        // Verificar si tiene rol de JEFE TALLER (permisos para asignar roles)
        const esJefeTaller = currentUserRoles.includes('jefe_taller') || 
                              (currentUserInfo && currentUserInfo.rol_principal === 'jefe_taller') ||
                              (currentUserInfo && currentUserInfo.rol === 'jefe_taller');
        
        // Compatibilidad con sistema antiguo
        const tieneIdRolAntiguo = currentUserInfo && (currentUserInfo.id_rol === 2);
        
        if (!esJefeTaller && !tieneIdRolAntiguo) {
            console.warn('❌ Usuario no tiene permisos de Jefe Taller', currentUserRoles);
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/jefe_taller/dashboard.html';
            }, 2000);
            return false;
        }
        
        console.log('✅ Autorizado como Jefe Taller');
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
    
    // Mostrar nombre de usuario
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
    
    // Logout
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
        const response = await fetch(`${API_URL}/roles`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        const data = await response.json();
        if (response.ok && data.success) {
            rolesData = data.roles;
            console.log('✅ Roles cargados:', rolesData);
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
        const response = await fetch(`${API_URL}/usuarios`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        const data = await response.json();
        if (response.ok && data.success) {
            usuariosData = data.usuarios;
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
        const response = await fetch(`${API_URL}/estadisticas`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        const data = await response.json();
        if (response.ok && data.success) {
            const stats = data.estadisticas;
            
            const totalUsuariosElem = document.getElementById('totalUsuarios');
            if (totalUsuariosElem) totalUsuariosElem.textContent = stats.total_usuarios || 0;
            
            // Actualizar estadísticas por rol
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
        tbody.innerHTML = `<tr><td colspan="6" class="loading-row">No hay usuarios registrados</td></tr>`;
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
            <td>
                <button class="btn-edit-roles" onclick="abrirModalRoles(${usuario.id})" title="Gestionar roles">
                    <i class="fas fa-edit"></i>
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
// MODAL DE ROLES
// =====================================================

function abrirModalRoles(usuarioId) {
    const usuario = usuariosData.find(u => u.id === usuarioId);
    if (!usuario) {
        mostrarNotificacion('Usuario no encontrado', 'error');
        return;
    }
    
    usuarioSeleccionado = usuario;
    
    // Actualizar información del usuario en el modal
    const modalUserName = document.getElementById('modalUserName');
    const modalUserEmail = document.getElementById('modalUserEmail');
    const modalUserDocumento = document.getElementById('modalUserDocumento');
    
    if (modalUserName) modalUserName.textContent = usuario.nombre;
    if (modalUserEmail) modalUserEmail.textContent = usuario.email || 'No registrado';
    if (modalUserDocumento) modalUserDocumento.textContent = usuario.documento || 'No registrado';
    
    // Generar checkboxes de roles
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
    
    const modal = document.getElementById('rolesModal');
    if (modal) {
        modal.classList.add('show');
    }
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
        
        if (response.status === 401) {
            logout();
            return;
        }
        
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
    const modal = document.getElementById('rolesModal');
    if (modal) {
        modal.classList.remove('show');
    }
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
        'encargado_repuestos': 'Encargado de Repuestos',
        'cliente': 'Cliente'
    };
    return nombres[rolNombre] || rolNombre.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getRolDescription(rolNombre) {
    const descripciones = {
        'jefe_operativo': 'Gestiona recepción, cotizaciones y facturación',
        'jefe_taller': 'Supervisa diagnósticos, asigna técnicos y planifica',
        'tecnico': 'Realiza diagnósticos y trabajos mecánicos',
        'encargado_repuestos': 'Gestiona inventario y cotizaciones de repuestos',
        'cliente': 'Acceso a sus vehículos y servicios'
    };
    return descripciones[rolNombre] || '';
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
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    
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
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#1E3A5F'};
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

// Funciones globales
window.abrirModalRoles = abrirModalRoles;
window.closeRolesModal = closeRolesModal;
window.saveRoles = saveRoles;
window.toggleCheckbox = toggleCheckbox;
window.logout = logout;