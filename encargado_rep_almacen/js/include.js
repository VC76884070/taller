// =====================================================
// INCLUDE.JS - SIDEBAR PARA CLIENTE
// VERSIÓN CORREGIDA - BASADA EN EL PATRÓN DE JEFE OPERATIVO
// =====================================================

console.log('🔵 [INCLUDE CLIENTE] Archivo cargado');

// =====================================================
// CONFIGURACIÓN DE API - VARIABLE GLOBAL
// =====================================================
window.API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 [INCLUDE CLIENTE] Modo DESARROLLO');
        return 'http://localhost:5000';
    }
    console.log('📡 [INCLUDE CLIENTE] Modo PRODUCCIÓN');
    return '';
})();

const API_BASE_URL = window.API_BASE_URL;

console.log('🔵 [INCLUDE CLIENTE] API_BASE_URL:', API_BASE_URL);

// Configuración
const CONFIG = {
    sidebarPath: `${API_BASE_URL}/cliente/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Cargando...',
    userRole: 'Cliente'
};

console.log('🔵 [INCLUDE CLIENTE] CONFIG:', CONFIG);

// Mapeo de páginas - CLIENTE
const PAGE_FILES = {
    'misvehiculos': 'misvehiculos.html',
    'misreservas': 'misreservas.html',
    'avances': 'avances.html',
    'cotizaciones': 'cotizaciones.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
};

console.log('🔵 [INCLUDE CLIENTE] PAGE_FILES:', PAGE_FILES);

// =====================================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL
// =====================================================
function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        console.log('🔵 [INCLUDE CLIENTE] userStr:', userStr);
        if (userStr) {
            const user = JSON.parse(userStr);
            console.log('🔵 [INCLUDE CLIENTE] Usuario parseado:', user);
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                roles: user.roles || [],
                id: user.id || null,
                type: user.type || null
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    return { nombre: CONFIG.defaultUserName, roles: [], id: null, type: null };
}

// =====================================================
// VERIFICACIÓN DE SESIÓN - SOLO CLIENTE
// =====================================================
function verificarSesionCliente() {
    console.log('🔵 [INCLUDE CLIENTE] verificarSesionCliente() - INICIANDO');
    
    const token = localStorage.getItem('furia_token');
    const userStr = localStorage.getItem('furia_user');
    
    console.log('🔍 [INCLUDE CLIENTE] Token:', token ? '✅ Presente' : '❌ Ausente');
    console.log('🔍 [INCLUDE CLIENTE] User:', userStr ? '✅ Presente' : '❌ Ausente');
    
    if (!token || !userStr) {
        console.warn('⚠️ [INCLUDE CLIENTE] No hay sesión - Redirigiendo al login');
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
    
    try {
        const userData = JSON.parse(userStr);
        console.log('👤 [INCLUDE CLIENTE] Datos del usuario:', userData);
        
        // Verificar que sea un cliente
        const esCliente = userData.type === 'client' || 
                         (userData.roles && userData.roles.includes('cliente')) || 
                         userData.rol === 'cliente';
        
        if (!esCliente) {
            console.warn('⚠️ [INCLUDE CLIENTE] No es un cliente - Redirigiendo al login');
            localStorage.clear();
            window.location.href = `${API_BASE_URL}/`;
            return false;
        }
        
        console.log('✅ [INCLUDE CLIENTE] Sesión válida para:', userData.nombre);
        return true;
        
    } catch (error) {
        console.error('❌ [INCLUDE CLIENTE] Error al verificar sesión:', error);
        localStorage.clear();
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
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
                    console.log('🗑️ [INCLUDE CLIENTE] Eliminando botón adicional:', el);
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
    console.log('🔵 [INCLUDE CLIENTE] includeSidebar() - INICIANDO');
    
    const sidebarContainer = document.getElementById('sidebar-container');
    console.log('🔵 [INCLUDE CLIENTE] sidebarContainer:', sidebarContainer);
    
    if (!sidebarContainer) {
        console.warn('⚠️ [INCLUDE CLIENTE] No se encontró el contenedor del sidebar');
        return;
    }
    
    // VERIFICAR QUE ESTAMOS EN CLIENTE
    const currentPath = window.location.pathname;
    console.log('🔵 [INCLUDE CLIENTE] currentPath:', currentPath);
    
    if (!currentPath.includes('/cliente/')) {
        console.log('ℹ️ [INCLUDE CLIENTE] No estamos en cliente, no se carga este sidebar');
        return;
    }
    
    console.log('🔵 [INCLUDE CLIENTE] Estamos en CLIENTE, cargando sidebar...');
    
    // VERIFICAR SESIÓN
    if (!verificarSesionCliente()) {
        return; // La función ya redirige
    }
    
    mostrarLoader(sidebarContainer);
    
    try {
        console.log('🔄 [INCLUDE CLIENTE] Intentando cargar sidebar desde:', CONFIG.sidebarPath);
        const response = await fetch(CONFIG.sidebarPath);
        console.log('🔵 [INCLUDE CLIENTE] Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        let html = await response.text();
        console.log('🔵 [INCLUDE CLIENTE] HTML recibido, longitud:', html.length);
        
        if (!html || html.trim() === '') {
            throw new Error('El archivo sidebar.html está vacío');
        }
        
        sidebarContainer.innerHTML = html;
        console.log('✅ [INCLUDE CLIENTE] Sidebar de Cliente cargado correctamente');
        
        inicializarSidebar();
        
        setTimeout(() => {
            eliminarBotonesCerrarSesionAdicionales();
        }, 200);
        
    } catch (error) {
        console.error('❌ [INCLUDE CLIENTE] Error cargando sidebar:', error);
        console.warn('⚠️ [INCLUDE CLIENTE] Usando sidebar de respaldo');
        crearSidebarRespaldo(sidebarContainer);
        inicializarSidebar();
    }
}

function mostrarLoader(container) {
    container.innerHTML = `
        <aside class="sidebar sidebar-loader">
            <div style="padding: 2rem; text-align: center; color: var(--gris-medio, #6B7280);">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p style="margin-top: 1rem;">Cargando menú...</p>
            </div>
        </aside>
    `;
}

function crearSidebarRespaldo(container) {
    console.log('🔵 [INCLUDE CLIENTE] Creando sidebar de respaldo');
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
                    <i class="fas fa-user"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('misvehiculos', 'Mis Vehículos', 'car', currentPage)}
                    ${crearMenuItem('misreservas', 'Mis Reservas', 'calendar-check', currentPage)}
                    ${crearMenuItem('avances', 'Mis Avances', 'tasks', currentPage)}
                    ${crearMenuItem('cotizaciones', 'Cotizaciones', 'file-invoice-dollar', currentPage)}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage)}
                    ${crearMenuItem('perfil', 'Mi Perfil', 'user-circle', currentPage)}
                </ul>
                <ul class="sidebar-bottom">
                    <li class="nav-item">
                        <a href="#" onclick="window.cerrarSesionCliente()" class="nav-link">
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
    console.log('🔵 [INCLUDE CLIENTE] inicializarSidebar() - INICIANDO');
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        console.log('🔵 [INCLUDE CLIENTE] currentPage:', currentPage);
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        console.log('✅ [INCLUDE CLIENTE] Sidebar de Cliente inicializado');
    }, 200);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    let pageName = filename.replace('.html', '');
    
    const pageMapping = {
        'misvehiculos': 'misvehiculos',
        'misreservas': 'misreservas',
        'avances': 'avances',
        'cotizaciones': 'cotizaciones',
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
            console.log(`✅ [INCLUDE CLIENTE] Item activo: ${currentPage}`);
        } else {
            const defaultItem = document.querySelector('.nav-item[data-page="misvehiculos"]');
            if (defaultItem) defaultItem.classList.add('active');
        }
    }, 100);
}

function actualizarNombreUsuario() {
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) return;
        
        const user = obtenerUsuarioActual();
        console.log('🔵 [INCLUDE CLIENTE] Actualizando nombre a:', user.nombre);
        userNameSpan.textContent = user.nombre;
    }, 200);
}

// =====================================================
// CIERRE DE SESIÓN
// =====================================================

window.cerrarSesionCliente = function() {
    console.log('🔵 [INCLUDE CLIENTE] cerrarSesionCliente() llamado');
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

// Alias para logout
window.logout = window.cerrarSesionCliente;

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
    const hamburger = document.getElementById('hamburgerMenu');
    
    if (!sidebar) return;
    
    sidebar.classList.toggle('open');
    if (hamburger) hamburger.classList.toggle('active');
    document.body.classList.toggle('sidebar-open');
}

function cerrarSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const hamburger = document.getElementById('hamburgerMenu');
    
    if (sidebar) sidebar.classList.remove('open');
    if (hamburger) hamburger.classList.remove('active');
    document.body.classList.remove('sidebar-open');
}

// Exponer funciones globales
window.toggleSidebar = toggleSidebar;
window.cerrarSidebar = cerrarSidebar;
window.ajustarSidebarResponsive = ajustarSidebarResponsive;

// =====================================================
// INICIALIZAR
// =====================================================

console.log('🔵 [INCLUDE CLIENTE] Configurando inicialización...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔵 [INCLUDE CLIENTE] DOMContentLoaded - CLIENTE');
    console.log('🔵 [INCLUDE CLIENTE] Path actual:', window.location.pathname);
    includeSidebar();
    ajustarSidebarResponsive();
});

window.addEventListener('resize', ajustarSidebarResponsive);

console.log('🔵 [INCLUDE CLIENTE] Archivo cargado completamente');