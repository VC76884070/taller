// =====================================================
// INCLUDE.JS - SIDEBAR PARA TÉCNICO MECÁNICO
// VERSIÓN SIN SELECTOR DE ROLES - DEFINITIVA
// =====================================================

const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        return 'http://localhost:5000';
    }
    return '';
})();

window.API_BASE_URL = API_BASE_URL;

const CONFIG = {
    sidebarPath: `${API_BASE_URL}/tecnico_mecanico/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Técnico',
    userRole: 'Técnico Mecánico'
};

const PAGE_FILES = {
    'misvehiculos': 'misvehiculos.html',
    'diagnostico': 'diagnostico.html',
    'avance': 'avance.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
};

// =====================================================
// OBTENER USUARIO ACTUAL
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
            
            if (!tieneRolTecnico && !window.location.pathname.includes('login')) {
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
// FUNCIONES GLOBALES DEL SIDEBAR
// =====================================================
let sidebarOpen = false;

window.toggleSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerMenu');
    const body = document.body;
    
    if (!sidebar) return;
    
    sidebarOpen = !sidebarOpen;
    
    if (sidebarOpen) {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
        if (hamburger) hamburger.classList.add('active');
        body.classList.add('sidebar-open');
        const icon = hamburger ? hamburger.querySelector('i') : null;
        if (icon) icon.className = 'fas fa-times';
    } else {
        window.cerrarSidebar();
    }
};

window.cerrarSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerMenu');
    const body = document.body;
    
    if (sidebar) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
        if (hamburger) hamburger.classList.remove('active');
        body.classList.remove('sidebar-open');
        const icon = hamburger ? hamburger.querySelector('i') : null;
        if (icon) icon.className = 'fas fa-bars';
    }
    sidebarOpen = false;
};

// =====================================================
// INCLUIR SIDEBAR
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
        const response = await fetch(CONFIG.sidebarPath);
        if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
        
        const html = await response.text();
        if (!html || html.trim() === '') throw new Error('El archivo sidebar.html está vacío');
        
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

function crearSidebarRespaldo(container) {
    const user = obtenerUsuarioActual();
    const currentPage = obtenerPaginaActual();
    
    container.innerHTML = `
        <aside class="sidebar">
            <div class="sidebar-header">
                <img src="${CONFIG.logoPath}" alt="FURIA MOTOR" class="sidebar-logo"
                     onerror="this.src='https://via.placeholder.com/40x40?text=FM'">
                <span class="sidebar-brand">FURIA MOTOR</span>
            </div>
            <div class="sidebar-user">
                <div class="user-avatar"><i class="fas fa-wrench"></i></div>
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

function crearMenuItem(page, label, icon, currentPage) {
    const isActive = currentPage === page ? 'active' : '';
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${PAGE_FILES[page]}" class="nav-link" onclick="navegarPagina(event, '${page}')">
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

function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        corregirBotonCerrarSesion();
        console.log('✅ Sidebar inicializado correctamente');
    }, 150);
}

function marcarItemActivo(currentPage) {
    setTimeout(() => {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
        if (activeItem) activeItem.classList.add('active');
    }, 50);
}

function forzarResaltadoMenu() {
    const currentPage = obtenerPaginaActual();
    let intentos = 0;
    const intervalo = setInterval(() => {
        intentos++;
        const navItems = document.querySelectorAll('.nav-item');
        if (navItems.length > 0) {
            navItems.forEach(item => item.classList.remove('active'));
            const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
                clearInterval(intervalo);
                return;
            }
        }
        if (intentos >= 15) {
            clearInterval(intervalo);
        }
    }, 300);
}

function corregirBotonCerrarSesion() {
    const btn = document.querySelector('.sidebar-bottom a[onclick*="cerrarSesion"]');
    if (btn) {
        btn.removeAttribute('onclick');
        btn.setAttribute('onclick', 'cerrarSesion()');
    }
}

function eliminarBotonesCerrarSesionAdicionales() {
    // Limpiar botones duplicados
    document.querySelectorAll('.logout-btn, .btn-logout, [onclick*="logout"]').forEach(el => {
        if (!el.closest('.sidebar')) el.remove();
    });
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    const pageName = filename.replace('.html', '');
    const mapping = {
        'misvehiculos': 'misvehiculos',
        'diagnostico': 'diagnostico',
        'avance': 'avance',
        'historial': 'historial',
        'perfil': 'perfil'
    };
    return mapping[pageName] || 'misvehiculos';
}

function actualizarNombreUsuario() {
    setTimeout(() => {
        const span = document.getElementById('userName');
        if (!span) return;
        const user = obtenerUsuarioActual();
        if (user && user.nombre) {
            span.textContent = user.nombre;
        }
    }, 100);
}

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

function agregarEstilosSidebar() {
    if (document.getElementById('sidebar-estilos')) return;
    
    const style = document.createElement('style');
    style.id = 'sidebar-estilos';
    style.textContent = `
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
        .sidebar-header {
            padding: 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .sidebar-logo { width: 40px; height: 40px; object-fit: contain; }
        .sidebar-brand { font-size: 1.2rem; font-weight: 700; color: #E53935; }
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
        .user-info { flex: 1; }
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
        .sidebar-nav ul { list-style: none; padding: 0; margin: 0; }
        .sidebar-nav ul:first-child { flex: 1; }
        .nav-item { margin: 0.25rem 0; }
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
        .nav-link i { width: 20px; font-size: 1.1rem; }
        .nav-link:hover { background: rgba(229, 57, 53, 0.1); color: #FFFFFF; }
        .nav-item.active .nav-link {
            background: rgba(229, 57, 53, 0.15);
            color: #FFFFFF;
            border-left-color: #E53935;
        }
        .sidebar-bottom {
            border-top: 1px solid rgba(255,255,255,0.1);
            padding-top: 1rem;
        }
        .badge {
            background: #E53935;
            color: white;
            border-radius: 10px;
            padding: 0.15rem 0.5rem;
            font-size: 0.7rem;
            margin-left: auto;
        }
        @media (max-width: 1024px) {
            .hamburger-menu { display: flex !important; }
            .sidebar { transform: translateX(-100%); width: 280px; }
            .sidebar.open { transform: translateX(0); box-shadow: 5px 0 25px rgba(0,0,0,0.5); }
            .sidebar.open .sidebar-brand,
            .sidebar.open .user-info,
            .sidebar.open .nav-link span { display: block !important; }
            .sidebar.open .sidebar-header { justify-content: flex-start; }
            .sidebar.open .sidebar-user { justify-content: flex-start; }
            .sidebar.open .nav-link { justify-content: flex-start; }
        }
        @media (min-width: 1025px) {
            .sidebar { transform: translateX(0) !important; }
            .hamburger-menu { display: none !important; }
            .sidebar-overlay { display: none !important; }
        }
    `;
    document.head.appendChild(style);
}

function ajustarSidebarResponsive() {
    if (window.innerWidth > 1024) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.remove('open');
        document.body.classList.remove('sidebar-open');
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', function() {
    agregarEstilosSidebar();
    includeSidebar();
    ajustarSidebarResponsive();
    
    const observer = new MutationObserver(() => {
        setTimeout(() => {
            forzarResaltadoMenu();
        }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(() => forzarResaltadoMenu(), 500);
});

window.addEventListener('resize', ajustarSidebarResponsive);