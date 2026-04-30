// =====================================================
// INCLUDE.JS - SIDEBAR PARA TÉCNICO MECÁNICO (CORREGIDO)
// =====================================================

// Configuración
const CONFIG = {
    sidebarPath: 'components/sidebar.html',
    logoPath: '../../img/logoblanco.jpeg',
    defaultUserName: 'Técnico',
    userRole: 'Técnico Mecánico'
};

// =====================================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL (CORREGIDA)
// =====================================================
function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            
            // IMPORTANTE: Normalizar roles - 'tecnico' es correcto
            let roles = user.roles || [];
            if (typeof roles === 'string') roles = [roles];
            
            // Verificar si tiene rol de técnico
            const tieneRolTecnico = roles.some(r => {
                const rolLower = String(r).toLowerCase();
                return rolLower === 'tecnico' || rolLower === 'tecnico_mecanico';
            });
            
            console.log('🔍 Include.js - Usuario:', user.nombre);
            console.log('🔍 Include.js - Roles:', roles);
            console.log('🔍 Include.js - Tiene rol técnico:', tieneRolTecnico);
            
            // Si no tiene rol técnico pero está en página de técnico, redirigir
            if (!tieneRolTecnico && !window.location.pathname.includes('login')) {
                console.warn('⚠️ Usuario no tiene rol técnico, redirigiendo');
                
                if (roles.includes('jefe_taller')) {
                    window.location.href = '/jefe_taller/dashboard.html';
                } else if (roles.includes('jefe_operativo')) {
                    window.location.href = '/jefe_operativo/dashboard.html';
                } else {
                    window.location.href = '/';
                }
                return { nombre: user.nombre, roles: roles, tieneAcceso: false };
            }
            
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                roles: roles,
                id: user.id || null,
                tieneAcceso: tieneRolTecnico
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    
    return {
        nombre: CONFIG.defaultUserName,
        roles: ['tecnico'],
        id: null,
        tieneAcceso: true
    };
}

// =====================================================
// FUNCIÓN PRINCIPAL PARA INCLUIR EL SIDEBAR
// =====================================================
async function includeSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    
    if (!sidebarContainer) {
        console.warn('⚠️ No se encontró el contenedor del sidebar');
        return;
    }
    
    // Verificar autenticación antes de cargar sidebar
    const user = obtenerUsuarioActual();
    if (!user.tieneAcceso) return;
    
    mostrarLoader(sidebarContainer);
    
    try {
        console.log('🔄 Intentando cargar sidebar desde:', CONFIG.sidebarPath);
        
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        if (!html || html.trim() === '') {
            throw new Error('El archivo sidebar.html está vacío');
        }
        
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar cargado correctamente');
        
        inicializarSidebar();
        
    } catch (error) {
        console.error('❌ Error cargando sidebar:', error);
        crearSidebarRespaldo(sidebarContainer);
        inicializarSidebar();
    }
}

// =====================================================
// MOSTRAR LOADER
// =====================================================
function mostrarLoader(container) {
    container.innerHTML = `
        <aside class="sidebar sidebar-loader">
            <div style="padding: 2rem; text-align: center; color: #6B7280;">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p style="margin-top: 1rem;">Cargando menú...</p>
            </div>
        </aside>
    `;
}

// =====================================================
// SIDEBAR DE RESPALDO (CORREGIDO)
// =====================================================
function crearSidebarRespaldo(container) {
    const user = obtenerUsuarioActual();
    const currentPage = obtenerPaginaActual();
    
    // Determinar si mostrar opción de cambio de rol (si tiene múltiples roles)
    const tieneMultiplesRoles = user.roles && user.roles.length > 1;
    const rolesHtml = tieneMultiplesRoles ? `
        <div class="roles-switch" onclick="mostrarCambioRol()">
            <i class="fas fa-exchange-alt"></i>
            <span>Cambiar Rol (${user.roles.length} roles)</span>
        </div>
    ` : '';
    
    container.innerHTML = `
        <aside class="sidebar">
            <div class="sidebar-header">
                <img src="${CONFIG.logoPath}" 
                     alt="FURIA MOTOR" 
                     class="sidebar-logo"
                     onerror="this.src='https://via.placeholder.com/40x40?text=FM'">
                <span class="sidebar-brand">FURIA MOTOR</span>
            </div>

            <div class="sidebar-user">
                <div class="user-avatar">
                    <i class="fas fa-wrench"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                    ${rolesHtml}
                </div>
            </div>

            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('misvehiculos', 'Mis Vehículos', 'car', currentPage)}
                    ${crearMenuItem('diagnostico', 'Diagnóstico', 'stethoscope', currentPage)}
                    ${crearMenuItem('avance', 'Avance de Trabajo', 'tasks', currentPage)}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage)}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage)}
                </ul>

                <ul class="sidebar-bottom">
                    <li class="nav-item">
                        <a href="#" onclick="cerrarSesion()" class="nav-link">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Cerrar Sesión</span>
                        </a>
                    </li>
                </ul>
            </nav>
        </aside>
    `;
}

// =====================================================
// CREAR ITEM DE MENÚ
// =====================================================
function crearMenuItem(page, label, icon, currentPage) {
    const isActive = currentPage === page ? 'active' : '';
    
    const pageToFile = {
        'misvehiculos': 'misvehiculos.html',
        'diagnostico': 'diagnostico.html',
        'avance': 'avance.html',
        'historial': 'historial.html',
        'perfil': 'perfil.html'
    };
    
    const href = pageToFile[page] || `${page}.html`;
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${href}" class="nav-link">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
            </a>
        </li>
    `;
}

// =====================================================
// INICIALIZAR SIDEBAR
// =====================================================
function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        
        // Mostrar indicador de múltiples roles
        const user = obtenerUsuarioActual();
        if (user.roles && user.roles.length > 1) {
            mostrarIndicadorMultiplesRoles();
        }
        
        console.log('✅ Sidebar inicializado correctamente');
    }, 100);
}

// =====================================================
// MOSTRAR INDICADOR DE MÚLTIPLES ROLES
// =====================================================
function mostrarIndicadorMultiplesRoles() {
    const userInfo = document.querySelector('.user-info');
    if (!userInfo) return;
    
    // Evitar duplicados
    if (userInfo.querySelector('.multi-role-badge')) return;
    
    const user = obtenerUsuarioActual();
    const rolesNombres = user.roles.map(r => {
        const nombres = {
            'tecnico': 'Técnico',
            'jefe_taller': 'Jefe Taller',
            'jefe_operativo': 'Jefe Operativo',
            'encargado_repuestos': 'Repuestos'
        };
        return nombres[r] || r;
    }).join(' • ');
    
    const badge = document.createElement('div');
    badge.className = 'multi-role-badge';
    badge.style.cssText = `
        font-size: 0.65rem;
        background: rgba(229, 57, 53, 0.2);
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
        margin-top: 0.25rem;
        cursor: pointer;
        text-align: center;
    `;
    badge.innerHTML = `<i class="fas fa-exchange-alt"></i> ${rolesNombres}`;
    badge.title = "Tienes múltiples roles. Haz clic para cambiar.";
    badge.onclick = () => mostrarCambioRol();
    
    userInfo.appendChild(badge);
}

// =====================================================
// FUNCIÓN PARA CAMBIAR DE ROL
// =====================================================
window.mostrarCambioRol = function() {
    const user = obtenerUsuarioActual();
    const roles = user.roles || [];
    
    if (roles.length <= 1) {
        mostrarNotificacion('Solo tienes un rol asignado', 'info');
        return;
    }
    
    const roleNames = {
        'tecnico': 'Técnico Mecánico',
        'jefe_taller': 'Jefe de Taller',
        'jefe_operativo': 'Jefe Operativo',
        'encargado_repuestos': 'Encargado de Repuestos'
    };
    
    let message = 'Selecciona el rol para cambiar:\n\n';
    roles.forEach((rol, index) => {
        message += `${index + 1}. ${roleNames[rol] || rol}\n`;
    });
    message += '\n0. Cancelar';
    
    const option = prompt(message);
    
    if (option && option !== '0') {
        const selectedIndex = parseInt(option) - 1;
        if (selectedIndex >= 0 && selectedIndex < roles.length) {
            const selectedRole = roles[selectedIndex];
            const currentRole = localStorage.getItem('furia_selected_role');
            
            if (selectedRole !== currentRole) {
                localStorage.setItem('furia_selected_role', selectedRole);
                localStorage.setItem('furia_selected_role_user', user.id);
                mostrarNotificacion(`Cambiando a ${roleNames[selectedRole] || selectedRole}...`, 'success');
                
                const redirects = {
                    'tecnico': '/tecnico_mecanico/misvehiculos.html',
                    'jefe_taller': '/jefe_taller/dashboard.html',
                    'jefe_operativo': '/jefe_operativo/dashboard.html',
                    'encargado_repuestos': '/encargado_rep_almacen/dashboard.html'
                };
                
                setTimeout(() => {
                    window.location.href = redirects[selectedRole] || '/';
                }, 500);
            } else {
                mostrarNotificacion('Ya estás en ese rol', 'info');
            }
        }
    }
};

// =====================================================
// OBTENER PÁGINA ACTUAL
// =====================================================
function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    const pageName = filename.replace('.html', '');
    
    // Mapeo de páginas
    const validPages = ['misvehiculos', 'diagnostico', 'avance', 'historial', 'perfil'];
    
    if (validPages.includes(pageName)) {
        return pageName;
    }
    return 'misvehiculos';
}

// =====================================================
// MARCAR ITEM ACTIVO
// =====================================================
function marcarItemActivo(currentPage) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

// =====================================================
// ACTUALIZAR NOMBRE DE USUARIO
// =====================================================
function actualizarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (!userNameSpan) return;
    
    const user = obtenerUsuarioActual();
    userNameSpan.textContent = user.nombre;
}

// =====================================================
// CIERRE DE SESIÓN (CORREGIDO)
// =====================================================
window.cerrarSesion = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        window.location.href = '/';
    }
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
// AGREGAR ESTILOS
// =====================================================
function agregarEstilosSidebar() {
    if (document.getElementById('sidebar-adicional-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sidebar-adicional-styles';
    style.textContent = `
        .sidebar { background: #121212; color: #FFFFFF; width: 280px; height: 100vh; position: fixed; left: 0; top: 0; overflow-y: auto; z-index: 1000; }
        .sidebar-header { padding: 1.5rem; display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .sidebar-logo { width: 40px; height: 40px; object-fit: contain; }
        .sidebar-brand { font-size: 1.2rem; font-weight: 700; color: #E53935; }
        .sidebar-user { padding: 1.5rem; display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .user-avatar { width: 48px; height: 48px; background: #E53935; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
        .user-info { flex: 1; }
        .user-name { display: block; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem; color: #FFFFFF; }
        .user-role { display: block; font-size: 0.8rem; color: #9E9E9E; }
        .sidebar-nav { padding: 1rem 0; display: flex; flex-direction: column; height: calc(100vh - 180px); }
        .sidebar-nav ul { list-style: none; padding: 0; margin: 0; }
        .sidebar-nav ul:first-child { flex: 1; }
        .nav-item { margin: 0.25rem 0; }
        .nav-link { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1.5rem; color: #9E9E9E; text-decoration: none; transition: all 0.3s ease; border-left: 4px solid transparent; }
        .nav-link i { width: 20px; font-size: 1.1rem; }
        .nav-link:hover { background: rgba(229, 57, 53, 0.1); color: #FFFFFF; }
        .nav-item.active .nav-link { background: rgba(229, 57, 53, 0.15); color: #FFFFFF; border-left-color: #E53935; }
        .sidebar-bottom { border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem; }
        .multi-role-badge { font-size: 0.65rem; background: rgba(229, 57, 53, 0.2); padding: 0.2rem 0.5rem; border-radius: 12px; margin-top: 0.25rem; cursor: pointer; text-align: center; }
        @media (max-width: 992px) { .sidebar { width: 80px; } .sidebar-brand, .user-info, .nav-link span:not(.badge) { display: none; } .nav-link { justify-content: center; padding: 0.75rem; } .nav-link i { margin: 0; font-size: 1.3rem; } }
    `;
    document.head.appendChild(style);
}

// =====================================================
// INICIALIZAR
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    agregarEstilosSidebar();
    includeSidebar();
});