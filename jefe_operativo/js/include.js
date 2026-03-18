// =====================================================
// INCLUDE.JS - SIDEBAR PARA JEFE OPERATIVO
// =====================================================

// Configuración
const CONFIG = {
    sidebarPath: 'components/sidebar.html',
    logoPath: '../img/logoblanco.jpeg',
    defaultUserName: 'María González',
    userRole: 'Jefe Operativo'
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
        
        // Intentar cargar el sidebar desde el archivo
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}: No se pudo cargar el sidebar`);
        }
        
        const html = await response.text();
        
        // Verificar que el HTML no esté vacío
        if (!html || html.trim() === '') {
            throw new Error('El archivo sidebar.html está vacío');
        }
        
        // Insertar el sidebar en el DOM
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar cargado correctamente');
        
        // Inicializar todas las funcionalidades del sidebar
        inicializarSidebar();
        
    } catch (error) {
        console.error('❌ Error cargando sidebar:', error);
        
        // Si falla la carga, usar el sidebar de respaldo
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
            <div style="padding: 2rem; text-align: center; color: var(--gris-medio);">
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
                    <i class="fas fa-user-tie"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>

            <!-- NAVIGATION MENU -->
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('dashboard', 'Dashboard', 'chart-pie', currentPage)}
                    ${crearMenuItem('recepcion', 'Recepción de Vehículos', 'car', currentPage)}
                    ${crearMenuItem('cotizaciones', 'Cotizaciones', 'file-invoice-dollar', currentPage)}
                    ${crearMenuItem('pro_vehiculo', 'Vehículos en Proceso', 'cogs', currentPage, '8')}
                    ${crearMenuItem('control_salida', 'Control de Salidas', 'check-circle', currentPage)}
                    ${crearMenuItem('rendicion', 'Rendición Diaria', 'hand-holding-usd', currentPage)}
                    ${crearMenuItem('comunicados', 'Comunicados', 'bullhorn', currentPage)}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage)}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage)}
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
function crearMenuItem(page, label, icon, currentPage, badge = null) {
    const isActive = currentPage === page ? 'active' : '';
    const badgeHtml = badge ? `<span class="badge">${badge}</span>` : '';
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${page}.html" class="nav-link">
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
        // Marcar item activo
        const currentPage = obtenerPaginaActual();
        marcarItemActivo(currentPage);
        
        // Actualizar nombre de usuario
        actualizarNombreUsuario();
        
        // Configurar logout
        configurarLogout();
        
        // Agregar estilos adicionales si es necesario
        agregarEstilosSidebar();
        
    } catch (error) {
        console.error('Error inicializando sidebar:', error);
    }
}

// =====================================================
// OBTENER PÁGINA ACTUAL
// =====================================================
function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    return filename.replace('.html', '');
}

// =====================================================
// MARCAR ITEM ACTIVO EN EL MENÚ
// =====================================================
function marcarItemActivo(currentPage) {
    // Pequeño delay para asegurar que el DOM esté listo
    setTimeout(() => {
        // Remover active de todos
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Activar el item correspondiente
        const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            console.log(`✅ Item activo: ${currentPage}`);
        } else {
            // Si no encuentra, activar dashboard por defecto
            const dashboardItem = document.querySelector('.nav-item[data-page="dashboard"]');
            if (dashboardItem) dashboardItem.classList.add('active');
        }
    }, 50);
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
                rol: user.rol || 'jefe_operativo'
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    
    return {
        nombre: CONFIG.defaultUserName,
        rol: 'jefe_operativo'
    };
}

// =====================================================
// ACTUALIZAR NOMBRE DE USUARIO EN EL SIDEBAR
// =====================================================
function actualizarNombreUsuario() {
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) return;
        
        const user = obtenerUsuarioActual();
        userNameSpan.textContent = user.nombre;
    }, 100);
}

// =====================================================
// CONFIGURAR FUNCIÓN DE LOGOUT
// =====================================================
function configurarLogout() {
    // Hacer la función logout global
    window.logout = function() {
        if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
            // Limpiar localStorage
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            localStorage.removeItem('furia_remembered');
            localStorage.removeItem('furia_remembered_type');
            
            // Redirigir al login
            window.location.href = '/login.html';
        }
    };
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
            background: var(--negro, #121212);
            color: var(--blanco, #FFFFFF);
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
            color: var(--rojo-primario, #C1121F);
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
            background: var(--rojo-primario, #C1121F);
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
        }
        
        .user-role {
            display: block;
            font-size: 0.8rem;
            color: var(--gris-medio, #6B7280);
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
            color: var(--gris-medio, #6B7280);
            text-decoration: none;
            transition: all 0.3s ease;
            border-left: 4px solid transparent;
        }
        
        .nav-link i {
            width: 20px;
            font-size: 1.1rem;
        }
        
        .nav-link:hover {
            background: rgba(193, 18, 31, 0.1);
            color: var(--blanco, #FFFFFF);
        }
        
        .nav-item.active .nav-link {
            background: rgba(193, 18, 31, 0.15);
            color: var(--blanco, #FFFFFF);
            border-left-color: var(--rojo-primario, #C1121F);
        }
        
        .badge {
            background: var(--rojo-primario, #C1121F);
            color: var(--blanco, #FFFFFF);
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
        @media (max-width: 768px) {
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
    
    // Si no hay token o no es jefe operativo, redirigir
    if (!token || user.rol !== 'jefe_operativo') {
        // No redirigir si ya estamos en login
        if (!window.location.pathname.includes('login.html')) {
            console.warn('⚠️ Usuario no autenticado, redirigiendo a login');
            window.location.href = '/login.html';
            return false;
        }
    }
    
    return true;
}

// =====================================================
// INICIALIZAR TODO
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticación (opcional - comentar si no quieres redirección automática)
    // verificarAutenticacion();
    
    // Cargar sidebar
    includeSidebar();
});

// =====================================================
// EXPORTAR FUNCIONES PARA USO GLOBAL
// =====================================================
// Estas funciones estarán disponibles globalmente
window.obtenerUsuarioActual = obtenerUsuarioActual;
window.actualizarNombreUsuario = actualizarNombreUsuario;