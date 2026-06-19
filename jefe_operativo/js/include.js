// =====================================================
// INCLUDE.JS - SIDEBAR PARA JEFE OPERATIVO
// VERSIÓN CON LOGS DE DEPURACIÓN
// =====================================================

console.log('🔵 INCLUDE DE JEFE OPERATIVO: Archivo cargado');

// =====================================================
// CONFIGURACIÓN DE API - VARIABLE GLOBAL
// =====================================================
window.API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Include.js Jefe Operativo - Modo DESARROLLO');
        return 'http://localhost:5000';
    }
    console.log('📡 Include.js Jefe Operativo - Modo PRODUCCIÓN');
    return '';
})();

const API_BASE_URL = window.API_BASE_URL;

console.log('🔵 API_BASE_URL:', API_BASE_URL);

// Configuración
const CONFIG = {
    sidebarPath: `${API_BASE_URL}/jefe_operativo/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Cargando...',
    userRole: 'Jefe Operativo'
};

console.log('🔵 CONFIG:', CONFIG);

// Mapeo de páginas - SOLO JEFE OPERATIVO
const PAGE_FILES = {
    'dashboard': 'dashboard.html',
    'recepcion': 'recepcion.html',
    'cotizaciones': 'cotizaciones.html',
    'pro_vehiculo': 'pro_vehiculo.html',
    'control_calidad': 'control_calidad.html',
    'control_salida': 'control_salida.html',
    'rendicion': 'rendicion_diaria.html',
    'comunicados': 'comunicados.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
};

console.log('🔵 PAGE_FILES:', PAGE_FILES);

// =====================================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL
// =====================================================
function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        console.log('🔵 userStr:', userStr);
        if (userStr) {
            const user = JSON.parse(userStr);
            console.log('🔵 Usuario parseado:', user);
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                roles: user.roles || [],
                id: user.id || null
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    return { nombre: CONFIG.defaultUserName, roles: [], id: null };
}

// =====================================================
// FUNCIÓN PARA ELIMINAR BOTONES DE CERRAR SESIÓN ADICIONALES
// =====================================================
function eliminarBotonesCerrarSesionAdicionales() {
    const logoutSelectors = [
        '.logout-btn', 
        '.btn-logout', 
        '.cerrar-sesion',
        'a[onclick*="logout"]',
        'button[onclick*="logout"]'
    ];
    
    logoutSelectors.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const isInSidebar = el.closest('.sidebar');
                const isInSidebarBottom = el.closest('.sidebar-bottom');
                if (!isInSidebar && !isInSidebarBottom && el.parentNode) {
                    console.log('🗑️ Eliminando botón adicional:', el);
                    el.parentNode.removeChild(el);
                }
            });
        } catch(e) {}
    });
}

// =====================================================
// FUNCIÓN PRINCIPAL PARA INCLUIR EL SIDEBAR
// =====================================================
async function includeSidebar() {
    console.log('🔵 includeSidebar() - INICIANDO');
    
    const sidebarContainer = document.getElementById('sidebar-container');
    console.log('🔵 sidebarContainer:', sidebarContainer);
    
    if (!sidebarContainer) {
        console.warn('⚠️ No se encontró el contenedor del sidebar');
        return;
    }
    
    // VERIFICAR QUE ESTAMOS EN JEFE OPERATIVO
    const currentPath = window.location.pathname;
    console.log('🔵 currentPath:', currentPath);
    
    if (!currentPath.includes('/jefe_operativo/')) {
        console.log('ℹ️ No estamos en jefe_operativo, no se carga este sidebar');
        return;
    }
    
    console.log('🔵 Estamos en JEFE OPERATIVO, cargando sidebar...');
    
    mostrarLoader(sidebarContainer);
    
    try {
        console.log('🔄 Intentando cargar sidebar desde:', CONFIG.sidebarPath);
        const response = await fetch(CONFIG.sidebarPath);
        console.log('🔵 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        let html = await response.text();
        console.log('🔵 HTML recibido, longitud:', html.length);
        
        if (!html || html.trim() === '') {
            throw new Error('El archivo sidebar.html está vacío');
        }
        
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar de Jefe Operativo cargado correctamente');
        
        inicializarSidebar();
        
        setTimeout(() => {
            eliminarBotonesCerrarSesionAdicionales();
        }, 200);
        
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
    console.log('🔵 Creando sidebar de respaldo');
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
                    <i class="fas fa-user-tie"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('dashboard', 'Dashboard', 'chart-pie', currentPage)}
                    ${crearMenuItem('recepcion', 'Recepción de Vehículos', 'car', currentPage)}
                    ${crearMenuItem('cotizaciones', 'Cotizaciones', 'file-invoice-dollar', currentPage)}
                    ${crearMenuItem('pro_vehiculo', 'Vehículos en Proceso', 'cogs', currentPage)}
                    ${crearMenuItem('control_calidad', 'Control de Calidad', 'check-circle', currentPage)}
                    ${crearMenuItem('control_salida', 'Control de Salidas', 'sign-out-alt', currentPage)}
                    ${crearMenuItem('rendicion', 'Rendición Diaria', 'hand-holding-usd', currentPage)}
                    ${crearMenuItem('comunicados', 'Comunicados', 'bullhorn', currentPage)}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage)}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage)}
                </ul>
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
    console.log('🔵 inicializarSidebar() - INICIANDO');
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        console.log('🔵 currentPage:', currentPage);
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        console.log('✅ Sidebar de Jefe Operativo inicializado');
    }, 200);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    let pageName = filename.replace('.html', '');
    
    const pageMapping = {
        'dashboard': 'dashboard',
        'recepcion': 'recepcion',
        'cotizaciones': 'cotizaciones',
        'pro_vehiculo': 'pro_vehiculo',
        'control_calidad': 'control_calidad',
        'control_salida': 'control_salida',
        'rendicion_diaria': 'rendicion',
        'comunicados': 'comunicados',
        'historial': 'historial',
        'perfil': 'perfil'
    };
    
    return pageMapping[pageName] || pageName;
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
            const dashboardItem = document.querySelector('.nav-item[data-page="dashboard"]');
            if (dashboardItem) dashboardItem.classList.add('active');
        }
    }, 100);
}

function actualizarNombreUsuario() {
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) return;
        
        const user = obtenerUsuarioActual();
        console.log('🔵 Actualizando nombre a:', user.nombre);
        userNameSpan.textContent = user.nombre;
    }, 200);
}

// =====================================================
// CIERRE DE SESIÓN - SOPORTA TANTO logout() COMO cerrarSesion()
// =====================================================

// Función principal de cierre de sesión
function cerrarSesion() {
    console.log('🔵 cerrarSesion() llamado');
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        window.location.href = `${API_BASE_URL}/`;
    }
}

// Alias para logout() (usado en el sidebar)
window.logout = cerrarSesion;
window.cerrarSesion = cerrarSesion;

// =====================================================
// FUNCIONES RESPONSIVE
// =====================================================
function ajustarSidebarResponsive() {
    const sidebar = document.querySelector('.sidebar');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    
    if (!sidebar) return;
    
    if (window.innerWidth > 1024) {
        sidebar.classList.remove('open');
        if (hamburgerMenu) hamburgerMenu.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerMenu');
    
    if (!sidebar) return;
    
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
    if (hamburger) hamburger.classList.toggle('active');
    document.body.classList.toggle('sidebar-open');
}

function cerrarSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerMenu');
    
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    if (hamburger) hamburger.classList.remove('active');
    document.body.classList.remove('sidebar-open');
}

// Exponer funciones globales
window.toggleSidebar = toggleSidebar;
window.cerrarSidebar = cerrarSidebar;

// =====================================================
// INICIALIZAR
// =====================================================
console.log('🔵 INCLUDE DE JEFE OPERATIVO: Configurando inicialización...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔵 DOMContentLoaded - JEFE OPERATIVO');
    console.log('🔵 Path actual:', window.location.pathname);
    includeSidebar();
    ajustarSidebarResponsive();
});

window.addEventListener('resize', ajustarSidebarResponsive);
window.ajustarSidebarResponsive = ajustarSidebarResponsive;

console.log('🔵 INCLUDE DE JEFE OPERATIVO: Archivo cargado completamente');