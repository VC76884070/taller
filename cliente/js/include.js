// =====================================================
// INCLUDE.JS - SIDEBAR PARA CLIENTE
// VERSIÓN CORREGIDA - BASADA EN EL PATRÓN DE JEFE OPERATIVO
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - VARIABLE GLOBAL
// =====================================================
window.API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Include.js (Cliente) - Modo DESARROLLO');
        return 'http://localhost:5000';
    }
    console.log('📡 Include.js (Cliente) - Modo PRODUCCIÓN');
    return 'https://taller-mecanico-dt10.onrender.com'; // <--- CAMBIA POR TU URL REAL
})();

const API_BASE_URL = window.API_BASE_URL;

// =====================================================
// FORZAR ROL CLIENTE
// =====================================================
localStorage.setItem('furia_selected_role', 'cliente');
sessionStorage.setItem('current_role_mode', 'cliente');

// =====================================================
// CONFIGURACIÓN DEL CLIENTE
// =====================================================
const CONFIG = {
    sidebarPath: `${API_BASE_URL}/cliente/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Cliente',
    userRole: 'Cliente'
};

// Mapeo de páginas del cliente
const PAGE_FILES = {
    'misvehiculos': 'misvehiculos.html',
    'cotizaciones': 'cotizaciones.html',
    'avances': 'avances.html',
    'misreservas': 'misreservas.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
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
    
    mostrarLoader(sidebarContainer);
    
    try {
        console.log('🔄 Intentando cargar sidebar desde:', CONFIG.sidebarPath);
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        let html = await response.text();
        
        if (!html || html.trim() === '') {
            throw new Error('El archivo sidebar.html está vacío');
        }
        
        // CORREGIR ENLACES RELATIVOS para que funcionen en producción
        html = html.replace(/href="\.\.\//g, `href="${API_BASE_URL}/cliente/`);
        html = html.replace(/href="\.\//g, `href="${API_BASE_URL}/cliente/`);
        html = html.replace(/src="\.\.\//g, `src="${API_BASE_URL}/cliente/`);
        html = html.replace(/src="\.\//g, `src="${API_BASE_URL}/cliente/`);
        
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar cargado correctamente');
        
        inicializarSidebar();
        
    } catch (error) {
        console.error('❌ Error cargando sidebar:', error);
        console.warn('⚠️ Usando sidebar de respaldo');
        crearSidebarRespaldo(sidebarContainer);
        inicializarSidebar();
    }
}

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
                <div class="user-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('misvehiculos', 'Mis Vehículos', 'car', currentPage)}
                    ${crearMenuItem('cotizaciones', 'Cotizaciones', 'file-invoice-dollar', currentPage)}
                    ${crearMenuItem('avances', 'Avances', 'chart-line', currentPage)}
                    ${crearMenuItem('misreservas', 'Mis Reservas', 'calendar-check', currentPage)}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage)}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage)}
                </ul>
                <ul class="sidebar-bottom">
                    <li class="nav-item">
                        <a href="#" onclick="window.logout()" class="nav-link">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Cerrar Sesión</span>
                        </a>
                    </li>
                </ul>
            </nav>
        </aside>
    `;
}

function crearMenuItem(page, label, icon, currentPage, badge = null) {
    const isActive = currentPage === page ? 'active' : '';
    const href = PAGE_FILES[page] || `${page}.html`;
    const badgeHtml = badge ? `<span class="badge">${badge}</span>` : '';
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${href}" class="nav-link" onclick="navegarPagina(event, '${page}')">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
                ${badgeHtml}
            </a>
        </li>
    `;
}

window.navegarPagina = function(event, page) {
    event.preventDefault();
    const href = PAGE_FILES[page] || `${page}.html`;
    window.location.href = href;
};

function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        
        // Agregar event listeners a los enlaces del sidebar
        document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    const token = localStorage.getItem('furia_token');
                    if (!token) {
                        e.preventDefault();
                        window.location.href = API_BASE_URL + '/';
                    }
                }
            });
        });
    }, 100);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    let pageName = filename.replace('.html', '');
    
    const pageMapping = {
        'misvehiculos': 'misvehiculos',
        'cotizaciones': 'cotizaciones',
        'avances': 'avances',
        'misreservas': 'misreservas',
        'historial': 'historial',
        'perfil': 'perfil'
    };
    
    return pageMapping[pageName] || 'misvehiculos';
}

function marcarItemActivo(currentPage) {
    setTimeout(() => {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            console.log(`✅ Item activo: ${currentPage}`);
        } else {
            // Fallback: activar Mis Vehículos
            const dashboardItem = document.querySelector('.nav-item[data-page="misvehiculos"]');
            if (dashboardItem) dashboardItem.classList.add('active');
        }
    }, 50);
}

function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                rol: user.rol || 'cliente',
                roles: user.roles || [user.rol]
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    
    return { nombre: CONFIG.defaultUserName, rol: 'cliente' };
}

function actualizarNombreUsuario() {
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) return;
        
        const user = obtenerUsuarioActual();
        userNameSpan.textContent = user.nombre;
    }, 100);
}

window.logout = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        window.location.href = `${API_BASE_URL}/`;
    }
};

// =====================================================
// FUNCIONES RESPONSIVE PARA EL SIDEBAR
// =====================================================
function ajustarSidebarResponsive() {
    const sidebar = document.querySelector('.sidebar');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    
    if (!sidebar) return;
    
    if (window.innerWidth > 1024) {
        sidebar.classList.remove('open');
        if (hamburgerMenu) hamburgerMenu.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    } else {
        // En móvil, asegurar que el sidebar empiece cerrado
        if (!sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            if (hamburgerMenu) hamburgerMenu.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        }
    }
}

window.addEventListener('orientationchange', function() {
    setTimeout(ajustarSidebarResponsive, 100);
});

window.addEventListener('resize', function() {
    ajustarSidebarResponsive();
});

document.addEventListener('DOMContentLoaded', () => {
    includeSidebar();
    ajustarSidebarResponsive();
});

window.ajustarSidebarResponsive = ajustarSidebarResponsive;