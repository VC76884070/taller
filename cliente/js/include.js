// =====================================================
// INCLUDE.JS - SIDEBAR PARA CLIENTE
// VERSIÓN CORREGIDA - RESALTADO DE MENÚ
// =====================================================

console.log('🔵🔵🔵 [INCLUDE CLIENTE] ===== ARCHIVO CARGADO =====');

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
window.API_BASE_URL = (() => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('192.168.')) {
        console.log('📡 Modo DESARROLLO - localhost');
        return 'http://localhost:5000';
    }
    console.log('📡 Modo PRODUCCIÓN');
    return '';
})();

const API_BASE_URL = window.API_BASE_URL;

const CONFIG = {
    sidebarPath: `${API_BASE_URL}/cliente/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Cargando...',
    userRole: 'Cliente'
};

// ✅ MAPEO DE PÁGINAS
const PAGE_FILES = {
    'misvehiculos': '/cliente/misvehiculos.html',
    'misreservas': '/cliente/misreservas.html',
    'avances': '/cliente/avances.html',
    'cotizaciones': '/cliente/cotizaciones.html',
    'historial': '/cliente/historial.html',
    'perfil': '/cliente/perfil.html'
};

// =====================================================
// FUNCIÓN PARA OBTENER LA PÁGINA ACTUAL
// =====================================================
function obtenerPaginaActual() {
    const path = window.location.pathname;
    console.log('🔍 [PAGINA] Path actual:', path);
    
    // Extraer el nombre del archivo
    const filename = path.split('/').pop() || 'misvehiculos.html';
    console.log('🔍 [PAGINA] Archivo:', filename);
    
    // Mapear archivo a página
    const pageMapping = {
        'misvehiculos.html': 'misvehiculos',
        'misreservas.html': 'misreservas',
        'avances.html': 'avances',
        'cotizaciones.html': 'cotizaciones',
        'historial.html': 'historial',
        'perfil.html': 'perfil'
    };
    
    const page = pageMapping[filename] || 'misvehiculos';
    console.log('✅ [PAGINA] Página detectada:', page);
    return page;
}

// =====================================================
// FUNCIÓN PARA MARCAR EL ÍTEM ACTIVO
// =====================================================
function marcarItemActivo() {
    const currentPage = obtenerPaginaActual();
    console.log('🔵 [ACTIVO] Marcando página activa:', currentPage);
    
    // Quitar clase active de todos los items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const link = item.querySelector('.nav-link');
        if (link) link.classList.remove('active');
    });
    
    // Buscar el item que coincide con la página actual
    let activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    
    // Si no se encuentra por data-page, buscar por href
    if (!activeItem) {
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-item').forEach(item => {
            const link = item.querySelector('.nav-link');
            if (link) {
                const href = link.getAttribute('href');
                if (href === currentPath || href === currentPath.replace('/cliente/', '')) {
                    activeItem = item;
                }
            }
        });
    }
    
    // Si se encontró, marcarlo como activo
    if (activeItem) {
        activeItem.classList.add('active');
        const link = activeItem.querySelector('.nav-link');
        if (link) link.classList.add('active');
        console.log(`✅ [ACTIVO] Item activo: ${currentPage}`);
    } else {
        console.warn(`⚠️ [ACTIVO] No se encontró item para: ${currentPage}`);
        // Fallback: marcar misvehiculos como activo
        const defaultItem = document.querySelector('.nav-item[data-page="misvehiculos"]');
        if (defaultItem) {
            defaultItem.classList.add('active');
            const link = defaultItem.querySelector('.nav-link');
            if (link) link.classList.add('active');
            console.log('✅ [ACTIVO] Usando misvehiculos como fallback');
        }
    }
}

// =====================================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL
// =====================================================
function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
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
// VERIFICACIÓN DE SESIÓN
// =====================================================
function verificarSesionCliente() {
    const token = localStorage.getItem('furia_token');
    const userStr = localStorage.getItem('furia_user');
    
    if (!token || !userStr) {
        console.warn('⚠️ [SESION] NO HAY SESIÓN - Redirigiendo al login');
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
    
    try {
        const userData = JSON.parse(userStr);
        const esCliente = userData.type === 'client' || 
                         (userData.roles && userData.roles.includes('cliente')) || 
                         userData.rol === 'cliente';
        
        if (!esCliente) {
            console.warn('⚠️ [SESION] NO ES CLIENTE - Redirigiendo al login');
            localStorage.clear();
            window.location.href = `${API_BASE_URL}/`;
            return false;
        }
        
        console.log('✅ [SESION] SESIÓN VÁLIDA para:', userData.nombre);
        return true;
        
    } catch (error) {
        console.error('❌ [SESION] Error al verificar sesión:', error);
        localStorage.clear();
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
}

// =====================================================
// FUNCIÓN PARA ACTUALIZAR NOMBRE DEL USUARIO
// =====================================================
function actualizarNombreUsuario() {
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) return;
        
        const user = obtenerUsuarioActual();
        userNameSpan.textContent = user.nombre || CONFIG.defaultUserName;
        console.log('👤 [NOMBRE] Usuario:', user.nombre);
    }, 200);
}

// =====================================================
// FUNCIÓN DE NAVEGACIÓN
// =====================================================
function navegarAPagina(page) {
    console.log('🔵 [NAVEGAR] Navegando a:', page);
    const url = PAGE_FILES[page];
    if (url) {
        console.log('🔵 [NAVEGAR] URL:', url);
        window.location.href = url;
    } else {
        console.error('❌ [NAVEGAR] Página no encontrada:', page);
    }
}

window.navegarAPagina = navegarAPagina;

// =====================================================
// CIERRE DE SESIÓN
// =====================================================
window.cerrarSesionCliente = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        console.log('👋 [LOGOUT] Sesión cerrada');
        window.location.href = `${API_BASE_URL}/`;
    }
};

// Alias para logout
window.logout = window.cerrarSesionCliente;

// =====================================================
// FUNCIÓN PRINCIPAL PARA INCLUIR EL SIDEBAR
// =====================================================
async function includeSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    
    if (!sidebarContainer) {
        console.warn('⚠️ No se encontró el contenedor del sidebar');
        return;
    }
    
    // VERIFICAR QUE ESTAMOS EN CLIENTE
    const currentPath = window.location.pathname;
    if (!currentPath.includes('/cliente/')) {
        console.log('ℹ️ No estamos en cliente, no se carga este sidebar');
        return;
    }
    
    // VERIFICAR SESIÓN
    if (!verificarSesionCliente()) {
        return;
    }
    
    mostrarLoader(sidebarContainer);
    
    try {
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        let html = await response.text();
        
        // ✅ CORREGIR: Reemplazar rutas relativas por rutas absolutas
        html = html.replace(/href="\.\.\/([^"]+\.html)"/g, '/cliente/$1');
        html = html.replace(/href="([^"]+\.html)"/g, (match, p1) => {
            if (p1.startsWith('/') || p1.startsWith('http')) return match;
            return `href="/cliente/${p1}"`;
        });
        
        // ✅ CORREGIR: onclick de cerrar sesión
        html = html.replace(/onclick="logout\(\)"/g, 'onclick="window.cerrarSesionCliente()"');
        html = html.replace(/onclick="cerrarSesion\(\)"/g, 'onclick="window.cerrarSesionCliente()"');
        
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar de Cliente cargado correctamente');
        
        // ✅ INICIALIZAR: Marcar item activo y actualizar nombre
        inicializarSidebar();
        
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
                <div class="user-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre || CONFIG.defaultUserName}</span>
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

function crearMenuItem(page, label, icon, currentPage) {
    const isActive = currentPage === page ? 'active' : '';
    const href = PAGE_FILES[page] || `/cliente/${page}.html`;
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${href}" class="nav-link">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
            </a>
        </li>
    `;
}

function inicializarSidebar() {
    console.log('🔵 [INICIALIZAR] Inicializando sidebar...');
    
    // Marcar el item activo
    marcarItemActivo();
    
    // Actualizar nombre del usuario
    actualizarNombreUsuario();
    
    // Agregar event listeners para asegurar el resaltado
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            // No prevenir el comportamiento por defecto
            console.log('🔵 [CLICK] Navegando a:', this.getAttribute('href'));
        });
    });
    
    console.log('✅ Sidebar de Cliente inicializado');
}

// =====================================================
// FUNCIONES RESPONSIVE
// =====================================================
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

window.toggleSidebar = toggleSidebar;
window.cerrarSidebar = cerrarSidebar;

// =====================================================
// INICIALIZAR
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔵 [DOM] DOMContentLoaded - CLIENTE');
    includeSidebar();
});

// Si ya está cargado
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('🔵 [DOM] DOM ya cargado, ejecutando inmediatamente');
    includeSidebar();
}

console.log('✅ [INCLUDE] include.js cargado - CLIENTE');