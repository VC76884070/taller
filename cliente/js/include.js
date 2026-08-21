// =====================================================
// INCLUDE.JS - SIDEBAR PARA CLIENTE
// VERSIÓN CON LOGS DE DEPURACIÓN
// =====================================================

console.log('🔵🔵🔵 [INCLUDE CLIENTE] ===== ARCHIVO CARGADO =====');
console.log('🔵🔵🔵 [INCLUDE CLIENTE] Timestamp:', new Date().toISOString());
console.log('🔵🔵🔵 [INCLUDE CLIENTE] URL actual:', window.location.href);
console.log('🔵🔵🔵 [INCLUDE CLIENTE] Pathname:', window.location.pathname);

// =====================================================
// CONFIGURACIÓN DE API - VARIABLE GLOBAL
// =====================================================
window.API_BASE_URL = (() => {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] === DETECTANDO ENTORNO ===');
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] hostname:', window.location.hostname);
    
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 [INCLUDE CLIENTE] Modo DESARROLLO - localhost');
        return 'http://localhost:5000';
    }
    console.log('📡 [INCLUDE CLIENTE] Modo PRODUCCIÓN - URL relativa');
    return '';
})();

const API_BASE_URL = window.API_BASE_URL;

console.log('🔵🔵🔵 [INCLUDE CLIENTE] API_BASE_URL:', API_BASE_URL);

// Configuración
const CONFIG = {
    sidebarPath: `${API_BASE_URL}/cliente/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Cargando...',
    userRole: 'Cliente'
};

console.log('🔵🔵🔵 [INCLUDE CLIENTE] CONFIG:', CONFIG);

// Mapeo de páginas - CLIENTE
const PAGE_FILES = {
    'misvehiculos': 'misvehiculos.html',
    'misreservas': 'misreservas.html',
    'avances': 'avances.html',
    'cotizaciones': 'cotizaciones.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
};

console.log('🔵🔵🔵 [INCLUDE CLIENTE] PAGE_FILES:', PAGE_FILES);

// =====================================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL
// =====================================================
function obtenerUsuarioActual() {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] === obtenerUsuarioActual() ===');
    
    try {
        const userStr = localStorage.getItem('furia_user');
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] userStr desde localStorage:', userStr);
        
        if (userStr) {
            const user = JSON.parse(userStr);
            console.log('🔵🔵🔵 [INCLUDE CLIENTE] Usuario parseado:', user);
            console.log('🔵🔵🔵 [INCLUDE CLIENTE] user.type:', user.type);
            console.log('🔵🔵🔵 [INCLUDE CLIENTE] user.roles:', user.roles);
            console.log('🔵🔵🔵 [INCLUDE CLIENTE] user.rol:', user.rol);
            
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                roles: user.roles || [],
                id: user.id || null,
                type: user.type || null,
                raw: user
            };
        } else {
            console.warn('⚠️ [INCLUDE CLIENTE] No hay userStr en localStorage');
        }
    } catch (error) {
        console.error('❌ [INCLUDE CLIENTE] Error obteniendo usuario:', error);
    }
    
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] Retornando usuario por defecto');
    return { nombre: CONFIG.defaultUserName, roles: [], id: null, type: null };
}

// =====================================================
// VERIFICACIÓN DE SESIÓN - SOLO CLIENTE
// =====================================================
function verificarSesionCliente() {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] === verificarSesionCliente() ===');
    
    const token = localStorage.getItem('furia_token');
    const userStr = localStorage.getItem('furia_user');
    
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] token desde localStorage:', token ? '✅ Presente' : '❌ Ausente');
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] token valor (primeros 30 chars):', token ? token.substring(0, 30) + '...' : 'null');
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] userStr desde localStorage:', userStr ? '✅ Presente' : '❌ Ausente');
    
    if (!token || !userStr) {
        console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] NO HAY SESIÓN - Redirigiendo al login');
        console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] token:', token);
        console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] userStr:', userStr);
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
    
    try {
        const userData = JSON.parse(userStr);
        console.log('👤 [INCLUDE CLIENTE] Datos del usuario parseados:', userData);
        console.log('👤 [INCLUDE CLIENTE] userData.type:', userData.type);
        console.log('👤 [INCLUDE CLIENTE] userData.roles:', userData.roles);
        console.log('👤 [INCLUDE CLIENTE] userData.rol:', userData.rol);
        console.log('👤 [INCLUDE CLIENTE] userData.nombre:', userData.nombre);
        
        // Verificar que sea un cliente
        const esCliente = userData.type === 'client' || 
                         (userData.roles && userData.roles.includes('cliente')) || 
                         userData.rol === 'cliente';
        
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] esCliente:', esCliente);
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] userData.type === "client":', userData.type === 'client');
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] roles incluye cliente:', userData.roles && userData.roles.includes('cliente'));
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] rol === cliente:', userData.rol === 'cliente');
        
        if (!esCliente) {
            console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] NO ES CLIENTE - Redirigiendo al login');
            console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] userData:', userData);
            localStorage.clear();
            window.location.href = `${API_BASE_URL}/`;
            return false;
        }
        
        console.log('✅✅✅ [INCLUDE CLIENTE] SESIÓN VÁLIDA para:', userData.nombre);
        return true;
        
    } catch (error) {
        console.error('❌❌❌ [INCLUDE CLIENTE] Error al verificar sesión:', error);
        console.error('❌❌❌ [INCLUDE CLIENTE] userStr:', userStr);
        localStorage.clear();
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
}

// =====================================================
// FUNCIÓN PRINCIPAL PARA INCLUIR EL SIDEBAR
// =====================================================
async function includeSidebar() {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] =====================================');
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] includeSidebar() - INICIANDO');
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] =====================================');
    
    const sidebarContainer = document.getElementById('sidebar-container');
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] sidebarContainer encontrado:', !!sidebarContainer);
    
    if (!sidebarContainer) {
        console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] No se encontró el contenedor del sidebar');
        console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] Elementos con id="sidebar-container":', document.getElementById('sidebar-container'));
        console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] Buscando en el DOM...');
        return;
    }
    
    // VERIFICAR QUE ESTAMOS EN CLIENTE
    const currentPath = window.location.pathname;
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] currentPath:', currentPath);
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] currentPath.includes("/cliente/"):', currentPath.includes('/cliente/'));
    
    if (!currentPath.includes('/cliente/')) {
        console.log('ℹ️ [INCLUDE CLIENTE] No estamos en cliente, no se carga este sidebar');
        console.log('ℹ️ [INCLUDE CLIENTE] Path actual:', currentPath);
        return;
    }
    
    console.log('✅ [INCLUDE CLIENTE] Estamos en CLIENTE, cargando sidebar...');
    
    // VERIFICAR SESIÓN
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] Llamando a verificarSesionCliente()...');
    const sesionValida = verificarSesionCliente();
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] sesionValida:', sesionValida);
    
    if (!sesionValida) {
        console.warn('⚠️⚠️⚠️ [INCLUDE CLIENTE] Sesión NO válida, deteniendo carga');
        return; // La función ya redirige
    }
    
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] Mostrando loader...');
    mostrarLoader(sidebarContainer);
    
    try {
        console.log('🔄 [INCLUDE CLIENTE] Intentando cargar sidebar desde:', CONFIG.sidebarPath);
        const response = await fetch(CONFIG.sidebarPath);
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] Response status:', response.status);
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] Response ok:', response.ok);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        let html = await response.text();
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] HTML recibido, longitud:', html.length);
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] HTML primeros 200 chars:', html.substring(0, 200));
        
        if (!html || html.trim() === '') {
            throw new Error('El archivo sidebar.html está vacío');
        }
        
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] Asignando HTML al contenedor...');
        sidebarContainer.innerHTML = html;
        console.log('✅✅✅ [INCLUDE CLIENTE] Sidebar de Cliente cargado correctamente');
        
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] Inicializando sidebar...');
        inicializarSidebar();
        
    } catch (error) {
        console.error('❌❌❌ [INCLUDE CLIENTE] Error cargando sidebar:', error);
        console.error('❌❌❌ [INCLUDE CLIENTE] Error stack:', error.stack);
        console.warn('⚠️ [INCLUDE CLIENTE] Usando sidebar de respaldo');
        crearSidebarRespaldo(sidebarContainer);
        inicializarSidebar();
    }
}

function mostrarLoader(container) {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] mostrarLoader()');
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
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] crearSidebarRespaldo()');
    const user = obtenerUsuarioActual();
    const currentPage = obtenerPaginaActual();
    
    console.log('🔵🔵🔁 [INCLUDE CLIENTE] user para respaldo:', user);
    console.log('🔵🔵🔁 [INCLUDE CLIENTE] currentPage para respaldo:', currentPage);
    
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
    console.log('✅ [INCLUDE CLIENTE] Sidebar de respaldo creado');
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
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] navegarPagina() - page:', page);
    event.preventDefault();
    const href = PAGE_FILES[page] || `${page}.html`;
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] Navegando a:', href);
    window.location.href = href;
};

function inicializarSidebar() {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] inicializarSidebar() - INICIANDO');
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] currentPage:', currentPage);
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        console.log('✅✅✅ [INCLUDE CLIENTE] Sidebar de Cliente inicializado');
    }, 200);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    let pageName = filename.replace('.html', '');
    
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] obtenerPaginaActual() - path:', path);
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] obtenerPaginaActual() - filename:', filename);
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] obtenerPaginaActual() - pageName:', pageName);
    
    const pageMapping = {
        'misvehiculos': 'misvehiculos',
        'misreservas': 'misreservas',
        'avances': 'avances',
        'cotizaciones': 'cotizaciones',
        'historial': 'historial',
        'perfil': 'perfil'
    };
    
    const result = pageMapping[pageName] || pageName;
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] obtenerPaginaActual() - result:', result);
    return result;
}

function marcarItemActivo(currentPage) {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] marcarItemActivo() - currentPage:', currentPage);
    setTimeout(() => {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            console.log(`✅ [INCLUDE CLIENTE] Item activo: ${currentPage}`);
        } else {
            console.warn(`⚠️ [INCLUDE CLIENTE] No se encontró item para: ${currentPage}`);
            const defaultItem = document.querySelector('.nav-item[data-page="misvehiculos"]');
            if (defaultItem) {
                defaultItem.classList.add('active');
                console.log('✅ [INCLUDE CLIENTE] Usando item por defecto: misvehiculos');
            }
        }
    }, 100);
}

function actualizarNombreUsuario() {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] actualizarNombreUsuario()');
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) {
            console.warn('⚠️ [INCLUDE CLIENTE] No se encontró #userName');
            return;
        }
        
        const user = obtenerUsuarioActual();
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] Actualizando nombre a:', user.nombre);
        userNameSpan.textContent = user.nombre || CONFIG.defaultUserName;
    }, 200);
}

// =====================================================
// CIERRE DE SESIÓN
// =====================================================

window.cerrarSesionCliente = function() {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] cerrarSesionCliente() llamado');
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        console.log('🔵🔵🔵 [INCLUDE CLIENTE] Eliminando datos de sesión...');
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        console.log('👋 [INCLUDE CLIENTE] Sesión cerrada correctamente');
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

console.log('🔵🔵🔵 [INCLUDE CLIENTE] Configurando inicialización...');
console.log('🔵🔵🔵 [INCLUDE CLIENTE] document.readyState:', document.readyState);

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] ==========================');
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] DOMContentLoaded - CLIENTE');
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] Path actual:', window.location.pathname);
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] ==========================');
    includeSidebar();
    ajustarSidebarResponsive();
});

// También ejecutar si ya está cargado
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('🔵🔵🔵 [INCLUDE CLIENTE] DOM ya cargado, ejecutando inmediatamente');
    includeSidebar();
    ajustarSidebarResponsive();
}

window.addEventListener('resize', ajustarSidebarResponsive);

console.log('🔵🔵🔵 [INCLUDE CLIENTE] ===== ARCHIVO CARGADO COMPLETAMENTE =====');