// =====================================================
// INCLUDE.JS - SIDEBAR PARA TÉCNICO MECÁNICO
// VERSIÓN SIN SELECTOR DE ROLES - COMPLETA Y CORREGIDA
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - FUNCIONA EN LOCAL Y PRODUCCIÓN
// =====================================================
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Include.js - Modo DESARROLLO');
        return 'http://localhost:5000';
    }
    console.log('📡 Include.js - Modo PRODUCCIÓN');
    return '';
})();

// Exportar API_BASE_URL globalmente para otros scripts
window.API_BASE_URL = API_BASE_URL;

// Configuración
const CONFIG = {
    sidebarPath: `${API_BASE_URL}/tecnico_mecanico/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Técnico',
    userRole: 'Técnico Mecánico'
};

// Mapeo de páginas
const PAGE_FILES = {
    'misvehiculos': 'misvehiculos.html',
    'diagnostico': 'diagnostico.html',
    'avance': 'avance.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
};

// =====================================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL
// =====================================================
function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            
            let roles = user.roles || [];
            if (typeof roles === 'string') roles = [roles];
            
            const tieneRolTecnico = roles.some(r => {
                const rolLower = String(r).toLowerCase();
                return rolLower === 'tecnico' || rolLower === 'tecnico_mecanico';
            });
            
            console.log('🔍 Include.js - Usuario:', user.nombre);
            console.log('🔍 Include.js - Roles:', roles);
            
            if (!tieneRolTecnico && !window.location.pathname.includes('login')) {
                console.warn('⚠️ Usuario no tiene rol técnico, redirigiendo');
                
                if (roles.includes('jefe_taller')) {
                    window.location.href = `${API_BASE_URL}/jefe_taller/dashboard.html`;
                } else if (roles.includes('jefe_operativo')) {
                    window.location.href = `${API_BASE_URL}/jefe_operativo/dashboard.html`;
                } else {
                    window.location.href = `${API_BASE_URL}/`;
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
// FUNCIÓN PARA ELIMINAR CUALQUIER BOTÓN DE CERRAR SESIÓN ADICIONAL
// =====================================================
function eliminarBotonesCerrarSesionAdicionales() {
    const headerTop = document.querySelector('header') || document.querySelector('.top-header') || document.querySelector('.navbar');
    if (headerTop) {
        const logoutButtons = headerTop.querySelectorAll('a[onclick*="logout"], a[onclick*="cerrarSesion"], button[onclick*="logout"], button[onclick*="cerrarSesion"]');
        logoutButtons.forEach(btn => {
            if (btn && btn.parentNode) {
                console.log('🗑️ Eliminando botón de cerrar sesión del header:', btn);
                btn.parentNode.removeChild(btn);
            }
        });
    }
    
    const selectors = [
        '.logout-btn', 
        '.btn-logout', 
        '.cerrar-sesion', 
        '[onclick="logout()"]', 
        '[onclick="cerrarSesion()"]'
    ];
    
    selectors.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const isInSidebar = el.closest('.sidebar');
                if (!isInSidebar && el.parentNode) {
                    console.log('🗑️ Eliminando botón adicional:', el);
                    el.parentNode.removeChild(el);
                }
            });
        } catch(e) {}
    });
    
    const allElements = document.querySelectorAll('a, button');
    allElements.forEach(el => {
        const text = el.textContent || el.innerText;
        if (text && (text.includes('Cerrar Sesión') || text.includes('Cerrar Sesi&oacute;n') || text.includes('Logout'))) {
            const isInSidebar = el.closest('.sidebar');
            const isInSidebarBottom = el.closest('.sidebar-bottom');
            
            if (!isInSidebar && !isInSidebarBottom && el.parentNode) {
                console.log('🗑️ Eliminando botón por texto:', el);
                el.parentNode.removeChild(el);
            }
        }
    });
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
        
        setTimeout(() => {
            eliminarBotonesCerrarSesionAdicionales();
        }, 150);
        
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
// SIDEBAR DE RESPALDO (SIN SELECTOR DE ROLES)
// =====================================================
function crearSidebarRespaldo(container) {
    const user = obtenerUsuarioActual();
    const currentPage = obtenerPaginaActual();
    
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
    const href = PAGE_FILES[page] || `${page}.html`;
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${href}" class="nav-link" onclick="navegarPagina(event, '${page}')">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
            </a>
        </li>
    `;
}

window.navegarPagina = function(event, page) {
    event.preventDefault();
    window.location.href = PAGE_FILES[page] || `${page}.html`;
};

// =====================================================
// INICIALIZAR SIDEBAR
// =====================================================
function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        console.log('📍 Página actual:', currentPage);
        
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        corregirBotonCerrarSesion();
        
        console.log('✅ Sidebar inicializado correctamente');
    }, 150);
}

// =====================================================
// MARCAR ITEM ACTIVO
// =====================================================
function marcarItemActivo(currentPage) {
    setTimeout(() => {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            console.log(`✅ Item activo: ${currentPage}`);
        }
    }, 50);
}

// =====================================================
// FORZAR RESALTADO DEL MENÚ
// =====================================================
function forzarResaltadoMenu() {
    const currentPage = obtenerPaginaActual();
    let intentos = 0;
    const maxIntentos = 15;
    
    const intervalo = setInterval(() => {
        intentos++;
        const navItems = document.querySelectorAll('.nav-item');
        
        if (navItems.length > 0) {
            navItems.forEach(item => item.classList.remove('active'));
            
            let activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
                console.log(`✅ Menú resaltado: ${currentPage}`);
                clearInterval(intervalo);
                return;
            }
        }
        
        if (intentos >= maxIntentos) {
            console.warn('⚠️ No se pudo resaltar el menú');
            clearInterval(intervalo);
        }
    }, 300);
}

// =====================================================
// CORREGIR BOTÓN CERRAR SESIÓN
// =====================================================
function corregirBotonCerrarSesion() {
    const sidebarLogoutBtn = document.querySelector('.sidebar-bottom a[onclick="logout()"], .sidebar-bottom a[onclick*="cerrarSesion"]');
    
    if (sidebarLogoutBtn) {
        sidebarLogoutBtn.removeAttribute('onclick');
        sidebarLogoutBtn.setAttribute('onclick', 'cerrarSesion()');
        console.log('✅ Botón de cerrar sesión del sidebar corregido');
    }
}

// =====================================================
// OBTENER PÁGINA ACTUAL
// =====================================================
function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    let pageName = filename.replace('.html', '');
    
    const pageMapping = {
        'misvehiculos': 'misvehiculos',
        'diagnostico': 'diagnostico',
        'avance': 'avance',
        'historial': 'historial',
        'perfil': 'perfil'
    };
    
    return pageMapping[pageName] || 'misvehiculos';
}

// =====================================================
// ACTUALIZAR NOMBRE DE USUARIO
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
// CIERRE DE SESIÓN
// =====================================================
window.cerrarSesion = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        window.location.href = `${API_BASE_URL}/`;
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
// AGREGAR ESTILOS - VERSIÓN COMPLETA
// =====================================================
function agregarEstilosSidebar() {
    if (document.getElementById('sidebar-adicional-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sidebar-adicional-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        /* =====================================================
           ESTILOS DEL SIDEBAR
           ===================================================== */
        .sidebar {
            background: #121212;
            color: #FFFFFF;
            width: 280px;
            height: 100vh;
            position: fixed;
            left: 0;
            top: 0;
            overflow-y: auto;
            z-index: 1000;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            transform: translateX(0);
        }
        
        /* Scrollbar personalizada */
        .sidebar::-webkit-scrollbar {
            width: 4px;
        }
        
        .sidebar::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
        }
        
        .sidebar::-webkit-scrollbar-thumb {
            background: #E53935;
            border-radius: 4px;
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
            letter-spacing: 0.5px;
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
            flex-shrink: 0;
        }
        
        .user-info {
            flex: 1;
            min-width: 0;
        }
        
        .user-name {
            display: block;
            font-weight: 600;
            font-size: 1rem;
            margin-bottom: 0.25rem;
            color: #FFFFFF;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .user-role {
            display: block;
            font-size: 0.8rem;
            color: #9E9E9E;
        }
        
        .sidebar-nav {
            padding: 0.5rem 0;
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
            margin: 0.125rem 0;
        }
        
        .nav-link {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.7rem 1.5rem;
            color: #9E9E9E;
            text-decoration: none;
            transition: all 0.3s ease;
            border-left: 4px solid transparent;
            position: relative;
        }
        
        .nav-link i {
            width: 20px;
            font-size: 1.1rem;
            flex-shrink: 0;
        }
        
        .nav-link span:not(.badge) {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
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
            color: white;
            border-radius: 10px;
            padding: 0.15rem 0.5rem;
            font-size: 0.65rem;
            font-weight: 600;
            margin-left: auto;
            flex-shrink: 0;
            min-width: 20px;
            text-align: center;
        }
        
        .sidebar-bottom {
            border-top: 1px solid rgba(255,255,255,0.1);
            padding-top: 0.5rem;
            margin-top: auto;
        }
        
        .sidebar-bottom .nav-link {
            color: #9E9E9E;
        }
        
        .sidebar-bottom .nav-link:hover {
            background: rgba(229, 57, 53, 0.1);
            color: #E53935;
        }
        
        /* =====================================================
           HAMBURGUESA MENU
           ===================================================== */
        .hamburger-menu {
            display: none;
            flex-direction: column;
            justify-content: space-between;
            width: 30px;
            height: 22px;
            cursor: pointer;
            padding: 5px;
            background: transparent;
            border: none;
            position: fixed;
            top: 15px;
            left: 15px;
            z-index: 1001;
        }
        
        .hamburger-menu span {
            display: block;
            width: 100%;
            height: 3px;
            background: #FFFFFF;
            border-radius: 3px;
            transition: all 0.3s ease;
            transform-origin: center;
        }
        
        .hamburger-menu.active span:nth-child(1) {
            transform: translateY(8px) rotate(45deg);
        }
        
        .hamburger-menu.active span:nth-child(2) {
            opacity: 0;
            transform: scaleX(0);
        }
        
        .hamburger-menu.active span:nth-child(3) {
            transform: translateY(-8px) rotate(-45deg);
        }
        
        .sidebar-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.6);
            z-index: 999;
            backdrop-filter: blur(4px);
        }
        
        .sidebar-overlay.active {
            display: block;
        }
        
        /* =====================================================
           RESPONSIVE
           ===================================================== */
        @media (max-width: 1024px) {
            .hamburger-menu {
                display: flex !important;
            }
            
            .sidebar {
                transform: translateX(-100%);
                width: 280px;
                box-shadow: none;
            }
            
            .sidebar.open {
                transform: translateX(0);
                box-shadow: 5px 0 25px rgba(0, 0, 0, 0.5);
            }
            
            .sidebar.open .sidebar-brand,
            .sidebar.open .user-info,
            .sidebar.open .nav-link span:not(.badge) {
                display: block !important;
            }
            
            .sidebar.open .sidebar-header {
                justify-content: flex-start;
            }
            
            .sidebar.open .sidebar-user {
                justify-content: flex-start;
            }
            
            .sidebar.open .nav-link {
                justify-content: flex-start;
            }
            
            .sidebar-overlay.active {
                display: block;
            }
        }
        
        @media (min-width: 1025px) {
            .sidebar {
                transform: translateX(0) !important;
            }
            
            .hamburger-menu {
                display: none !important;
            }
            
            .sidebar-overlay {
                display: none !important;
            }
        }
        
        /* =====================================================
           LOADER DEL SIDEBAR
           ===================================================== */
        .sidebar-loader {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .sidebar-loader .fa-spinner {
            color: #E53935;
        }
    `;
    document.head.appendChild(style);
}

// =====================================================
// FUNCIONES RESPONSIVE
// =====================================================
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const hamburger = document.getElementById('hamburgerMenu');
    
    if (!sidebar) return;
    
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
    if (hamburger) hamburger.classList.toggle('active');
    
    document.body.classList.toggle('sidebar-open');
}

function cerrarSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const hamburger = document.getElementById('hamburgerMenu');
    
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    if (hamburger) hamburger.classList.remove('active');
    document.body.classList.remove('sidebar-open');
}

function ajustarSidebarResponsive() {
    const sidebar = document.querySelector('.sidebar');
    const hamburger = document.getElementById('hamburgerMenu');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (!sidebar) return;
    
    if (window.innerWidth > 1024) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
        if (hamburger) hamburger.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }
}

// =====================================================
// CREAR ELEMENTOS RESPONSIVE (HAMBURGUESA Y OVERLAY)
// =====================================================
function crearElementosResponsive() {
    // Verificar si ya existen
    if (document.getElementById('hamburgerMenu')) return;
    
    // Crear hamburguesa
    const hamburger = document.createElement('button');
    hamburger.id = 'hamburgerMenu';
    hamburger.className = 'hamburger-menu';
    hamburger.setAttribute('aria-label', 'Abrir menú');
    hamburger.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;
    hamburger.onclick = toggleSidebar;
    document.body.appendChild(hamburger);
    
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.onclick = cerrarSidebar;
    document.body.appendChild(overlay);
}

// =====================================================
// INICIALIZAR - PUNTO DE ENTRADA PRINCIPAL
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando sidebar para Técnico Mecánico');
    
    agregarEstilosSidebar();
    crearElementosResponsive();
    includeSidebar();
    ajustarSidebarResponsive();
    
    // Observer para detectar cambios y mantener el menú resaltado
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                setTimeout(() => {
                    eliminarBotonesCerrarSesionAdicionales();
                    forzarResaltadoMenu();
                }, 100);
            }
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Resaltado inicial
    setTimeout(() => {
        forzarResaltadoMenu();
    }, 500);
    
    console.log('✅ Sidebar inicializado completamente');
});

// Evento resize para ajustar responsive
window.addEventListener('resize', ajustarSidebarResponsive);

// Exportar funciones globales
window.toggleSidebar = toggleSidebar;
window.cerrarSidebar = cerrarSidebar;
window.ajustarSidebarResponsive = ajustarSidebarResponsive;