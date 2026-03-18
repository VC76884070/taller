// =====================================================
// INCLUDE.JS - SIDEBAR PARA TÉCNICO MECÁNICO
// =====================================================

// Configuración
const CONFIG = {
    sidebarPath: 'components/sidebar.html',
    logoPath: '../../img/logoblanco.jpeg',
    defaultUserName: 'Luis Mamani',
    userRole: 'Técnico Mecánico'
};

// =====================================================
// FUNCIÓN PRINCIPAL PARA INCLUIR EL SIDEBAR
// =====================================================
async function includeSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    
    if (!sidebarContainer) {
        console.warn('⚠️ No se encontró el contenedor del sidebar');
        return;
    }
    
    // Mostrar loader mientras carga
    mostrarLoader(sidebarContainer);
    
    try {
        console.log('🔄 Intentando cargar sidebar desde:', CONFIG.sidebarPath);
        
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // Verificar que el HTML no esté vacío
        if (!html || html.trim() === '') {
            throw new Error('El archivo sidebar.html está vacío');
        }
        
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar cargado correctamente');
        
        // Inicializar todas las funcionalidades del sidebar
        inicializarSidebar();
        
    } catch (error) {
        console.error('❌ Error cargando sidebar:', error);
        console.warn('⚠️ Usando sidebar de respaldo');
        crearSidebarRespaldo(sidebarContainer);
        inicializarSidebar();
    }
}

// =====================================================
// MOSTRAR LOADER MIENTRAS CARGA
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
// SIDEBAR DE RESPALDO (FALLBACK)
// =====================================================
function crearSidebarRespaldo(container) {
    const user = obtenerUsuarioActual();
    const currentPage = obtenerPaginaActual();
    
    container.innerHTML = `
        <aside class="sidebar">
            <!-- HEADER -->
            <div class="sidebar-header">
                <img src="${CONFIG.logoPath}" 
                     alt="FURIA MOTOR" 
                     class="sidebar-logo"
                     onerror="this.src='https://via.placeholder.com/40x40?text=FM'">
                <span class="sidebar-brand">FURIA MOTOR</span>
            </div>

            <!-- USER INFO -->
            <div class="sidebar-user">
                <div class="user-avatar">
                    <i class="fas fa-user-cog"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>

            <!-- NAVIGATION MENU -->
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('misvehiculos', 'Mis Vehículos', 'car', currentPage, '2')}
                    ${crearMenuItem('diagnostico', 'Diagnóstico', 'stethoscope', currentPage, '')}
                    ${crearMenuItem('avance', 'Avance de Trabajo', 'tasks', currentPage, '')}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage, '')}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage, '')}
                </ul>

                <!-- BOTTOM MENU -->
                <ul class="sidebar-bottom">
                    <li class="nav-item">
                        <a href="#" onclick="logout()" class="nav-link">
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
function crearMenuItem(page, label, icon, currentPage, badge) {
    const isActive = currentPage === page ? 'active' : '';
    const badgeHtml = badge ? `<span class="badge">${badge}</span>` : '';
    
    // Mapeo de nombres de página a archivos HTML
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
                ${badgeHtml}
            </a>
        </li>
    `;
}

// =====================================================
// INICIALIZAR FUNCIONALIDADES DEL SIDEBAR
// =====================================================
function inicializarSidebar() {
    try {
        // Pequeño delay para asegurar que el DOM esté listo
        setTimeout(() => {
            // Marcar item activo
            const currentPage = obtenerPaginaActual();
            marcarItemActivo(currentPage);
            
            // Actualizar nombre de usuario
            actualizarNombreUsuario();
            
            // Actualizar badge de vehículos
            actualizarBadgeVehiculos();
            
            // Configurar logout
            configurarLogout();
            
            console.log('✅ Sidebar inicializado correctamente');
        }, 100);
        
    } catch (error) {
        console.error('Error inicializando sidebar:', error);
    }
}

// =====================================================
// OBTENER PÁGINA ACTUAL
// =====================================================
function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    return filename.replace('.html', '');
}

// =====================================================
// MARCAR ITEM ACTIVO EN EL MENÚ
// =====================================================
function marcarItemActivo(currentPage) {
    // Remover active de todos
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Intentar encontrar por data-page exacto
    let activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    
    // Si no encuentra, intentar con mapeo
    if (!activeItem) {
        const pageMapping = {
            'misvehiculos': ['vehiculos', 'mis-vehiculos', 'home'],
            'diagnostico': ['diagnosticos', 'nuevo-diagnostico'],
            'avance': ['avances', 'progreso', 'trabajo'],
            'historial': ['historial-trabajos', 'historial-vehiculos'],
            'perfil': ['mi-perfil', 'configuracion']
        };
        
        // Buscar si currentPage tiene algún alias
        for (const [page, aliases] of Object.entries(pageMapping)) {
            if (page === currentPage || aliases.includes(currentPage)) {
                activeItem = document.querySelector(`.nav-item[data-page="${page}"]`);
                break;
            }
        }
    }
    
    // Si encuentra, activarlo
    if (activeItem) {
        activeItem.classList.add('active');
        console.log(`✅ Item activo: ${currentPage} → ${activeItem.dataset.page}`);
    } else {
        // Si no encuentra, activar misvehiculos por defecto
        const defaultItem = document.querySelector('.nav-item[data-page="misvehiculos"]');
        if (defaultItem) {
            defaultItem.classList.add('active');
            console.log(`✅ Item activo por defecto: misvehiculos`);
        }
    }
}

// =====================================================
// OBTENER USUARIO ACTUAL DESDE LOCALSTORAGE
// =====================================================
function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                rol: user.rol || 'tecnico',
                id: user.id || null
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    
    return {
        nombre: CONFIG.defaultUserName,
        rol: 'tecnico',
        id: null
    };
}

// =====================================================
// ACTUALIZAR NOMBRE DE USUARIO EN EL SIDEBAR
// =====================================================
function actualizarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (!userNameSpan) return;
    
    const user = obtenerUsuarioActual();
    userNameSpan.textContent = user.nombre;
}

// =====================================================
// ACTUALIZAR BADGE DE VEHÍCULOS
// =====================================================
function actualizarBadgeVehiculos() {
    const badge = document.getElementById('vehiculosBadge');
    if (!badge) return;
    
    // Obtener cantidad de vehículos activos desde localStorage
    try {
        const vehiculosActivos = JSON.parse(localStorage.getItem('vehiculos_activos') || '[]');
        badge.textContent = vehiculosActivos.length;
        
        // Ocultar badge si es 0
        if (vehiculosActivos.length === 0) {
            badge.style.display = 'none';
        } else {
            badge.style.display = 'inline';
        }
    } catch (error) {
        console.error('Error actualizando badge:', error);
        badge.textContent = '0';
        badge.style.display = 'none';
    }
}

// =====================================================
// CONFIGURAR FUNCIÓN DE LOGOUT
// =====================================================
function configurarLogout() {
    // Hacer la función logout global (por si se llama desde onclick)
    window.logout = function() {
        if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
            // Mostrar notificación de cierre de sesión
            mostrarNotificacion('Cerrando sesión...', 'info');
            
            // Limpiar localStorage
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            localStorage.removeItem('vehiculos_activos');
            localStorage.removeItem('furia_remembered');
            localStorage.removeItem('furia_remembered_type');
            
            // Redirigir al login
            setTimeout(() => {
                window.location.href = '../../login.html';
            }, 500);
        }
    };
}

// =====================================================
// FUNCIÓN PARA MOSTRAR NOTIFICACIONES
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
// AGREGAR ESTILOS ADICIONALES PARA EL SIDEBAR
// =====================================================
function agregarEstilosSidebar() {
    // Verificar si ya existen los estilos
    if (document.getElementById('sidebar-adicional-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sidebar-adicional-styles';
    style.textContent = `
        /* Estilos para el loader */
        .sidebar-loader {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        
        /* Mejoras para el sidebar */
        .sidebar {
            background: #121212;
            color: #FFFFFF;
            width: 280px;
            height: 100vh;
            position: fixed;
            left: 0;
            top: 0;
            overflow-y: auto;
            transition: all 0.3s ease;
            z-index: 1000;
        }
        
        .sidebar-header {
            padding: 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .sidebar-logo {
            width: 40px;
            height: 40px;
            object-fit: contain;
        }
        
        .sidebar-brand {
            font-size: 1.2rem;
            font-weight: 700;
            color: #E53935;
        }
        
        .sidebar-user {
            padding: 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .user-avatar {
            width: 48px;
            height: 48px;
            background: #E53935;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
        }
        
        .user-info {
            flex: 1;
        }
        
        .user-name {
            display: block;
            font-weight: 600;
            font-size: 1rem;
            margin-bottom: 0.25rem;
            color: #FFFFFF;
        }
        
        .user-role {
            display: block;
            font-size: 0.8rem;
            color: #9E9E9E;
        }
        
        .sidebar-nav {
            padding: 1rem 0;
            display: flex;
            flex-direction: column;
            height: calc(100vh - 180px);
        }
        
        .sidebar-nav ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        .sidebar-nav ul:first-child {
            flex: 1;
        }
        
        .nav-item {
            margin: 0.25rem 0;
        }
        
        .nav-link {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem 1.5rem;
            color: #9E9E9E;
            text-decoration: none;
            transition: all 0.3s ease;
            border-left: 4px solid transparent;
        }
        
        .nav-link i {
            width: 20px;
            font-size: 1.1rem;
        }
        
        .nav-link:hover {
            background: rgba(229, 57, 53, 0.1);
            color: #FFFFFF;
        }
        
        .nav-item.active .nav-link {
            background: rgba(229, 57, 53, 0.15);
            color: #FFFFFF;
            border-left-color: #E53935;
        }
        
        .badge {
            background: #E53935;
            color: #FFFFFF;
            padding: 0.2rem 0.5rem;
            border-radius: 12px;
            font-size: 0.7rem;
            margin-left: auto;
        }
        
        .sidebar-bottom {
            border-top: 1px solid rgba(255,255,255,0.1);
            padding-top: 1rem;
        }
        
        /* Responsive */
        @media (max-width: 992px) {
            .sidebar {
                width: 80px;
            }
            
            .sidebar-brand,
            .user-info,
            .nav-link span:not(.badge) {
                display: none;
            }
            
            .nav-link {
                justify-content: center;
                padding: 0.75rem;
            }
            
            .nav-link i {
                margin: 0;
                font-size: 1.3rem;
            }
        }
    `;
    
    document.head.appendChild(style);
}

// =====================================================
// VERIFICAR AUTENTICACIÓN (OPCIONAL)
// =====================================================
function verificarAutenticacion() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    // Si no hay token o no es técnico, redirigir
    if (!token || user.rol !== 'tecnico') {
        // No redirigir si ya estamos en login
        if (!window.location.pathname.includes('login.html')) {
            console.warn('⚠️ Usuario no autenticado o no es técnico, redirigiendo a login');
            window.location.href = '../../login.html';
            return false;
        }
    }
    
    return true;
}

// =====================================================
// INICIALIZAR TODO
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticación (opcional - descomentar si quieres redirección automática)
    // verificarAutenticacion();
    
    // Agregar estilos adicionales
    agregarEstilosSidebar();
    
    // Cargar sidebar
    includeSidebar();
});

// =====================================================
// EXPORTAR FUNCIONES PARA USO GLOBAL
// =====================================================
// Estas funciones estarán disponibles globalmente
window.obtenerUsuarioActual = obtenerUsuarioActual;
window.actualizarNombreUsuario = actualizarNombreUsuario;
window.actualizarBadgeVehiculos = actualizarBadgeVehiculos;
window.mostrarNotificacion = mostrarNotificacion;