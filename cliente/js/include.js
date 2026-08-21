// =====================================================
// INCLUDE.JS - SIDEBAR PARA CLIENTE
// VERSIÓN CON LOGS PERSISTENTES EN LOCALSTORAGE
// =====================================================

// =====================================================
// FUNCIÓN PARA GUARDAR LOGS EN LOCALSTORAGE
// =====================================================
function logPersistente(tag, mensaje, data = null) {
    try {
        const logs = JSON.parse(localStorage.getItem('furia_debug_logs') || '[]');
        logs.push({
            timestamp: new Date().toISOString(),
            tag: tag,
            mensaje: mensaje,
            data: data,
            url: window.location.href
        });
        // Mantener solo últimos 50 logs
        if (logs.length > 50) logs.shift();
        localStorage.setItem('furia_debug_logs', JSON.stringify(logs));
        console.log(tag, mensaje, data);
    } catch(e) {
        console.error('Error guardando log:', e);
    }
}

// Función para ver logs guardados
function verLogsPersistentes() {
    try {
        const logs = JSON.parse(localStorage.getItem('furia_debug_logs') || '[]');
        console.log('📋 === LOGS PERSISTENTES ===');
        logs.forEach(log => {
            console.log(`[${log.timestamp}] ${log.tag}: ${log.mensaje}`, log.data || '');
        });
        console.log('📋 === FIN LOGS ===');
        return logs;
    } catch(e) {
        console.error('Error leyendo logs:', e);
        return [];
    }
}

// Función para limpiar logs
function limpiarLogsPersistentes() {
    localStorage.removeItem('furia_debug_logs');
    console.log('🧹 Logs persistentes limpiados');
}

// Exponer funciones globales para depuración
window.verLogsPersistentes = verLogsPersistentes;
window.limpiarLogsPersistentes = limpiarLogsPersistentes;

// =====================================================
// INICIO DEL SCRIPT
// =====================================================

logPersistente('🔵 INICIO', '===== ARCHIVO INCLUDE CLIENTE CARGADO =====');
logPersistente('🔵 INICIO', 'URL actual:', window.location.href);
logPersistente('🔵 INICIO', 'Pathname:', window.location.pathname);

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
window.API_BASE_URL = (() => {
    const hostname = window.location.hostname;
    logPersistente('📡 ENTORNO', 'hostname:', hostname);
    
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' ||
        hostname.includes('192.168.')) {
        logPersistente('📡 ENTORNO', 'Modo DESARROLLO - localhost');
        return 'http://localhost:5000';
    }
    logPersistente('📡 ENTORNO', 'Modo PRODUCCIÓN - URL relativa');
    return '';
})();

const API_BASE_URL = window.API_BASE_URL;
logPersistente('📡 API', 'API_BASE_URL:', API_BASE_URL);

// Configuración
const CONFIG = {
    sidebarPath: `${API_BASE_URL}/cliente/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Cargando...',
    userRole: 'Cliente'
};

logPersistente('🔧 CONFIG', 'CONFIG:', CONFIG);

// Mapeo de páginas
const PAGE_FILES = {
    'misvehiculos': 'misvehiculos.html',
    'misreservas': 'misreservas.html',
    'avances': 'avances.html',
    'cotizaciones': 'cotizaciones.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
};

logPersistente('📄 PAGES', 'PAGE_FILES:', PAGE_FILES);

// =====================================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL
// =====================================================
function obtenerUsuarioActual() {
    logPersistente('👤 USUARIO', '=== obtenerUsuarioActual() ===');
    
    try {
        const userStr = localStorage.getItem('furia_user');
        logPersistente('👤 USUARIO', 'userStr existe:', !!userStr);
        
        if (userStr) {
            const user = JSON.parse(userStr);
            logPersistente('👤 USUARIO', 'Usuario parseado:', {
                nombre: user.nombre,
                type: user.type,
                roles: user.roles,
                rol: user.rol,
                id: user.id
            });
            
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                roles: user.roles || [],
                id: user.id || null,
                type: user.type || null,
                raw: user
            };
        } else {
            logPersistente('⚠️ USUARIO', 'No hay userStr en localStorage');
        }
    } catch (error) {
        logPersistente('❌ USUARIO', 'Error obteniendo usuario:', error.message);
    }
    
    return { nombre: CONFIG.defaultUserName, roles: [], id: null, type: null };
}

// =====================================================
// VERIFICACIÓN DE SESIÓN
// =====================================================
function verificarSesionCliente() {
    logPersistente('🔐 SESION', '=== verificarSesionCliente() ===');
    
    const token = localStorage.getItem('furia_token');
    const userStr = localStorage.getItem('furia_user');
    
    logPersistente('🔐 SESION', 'Token existe:', !!token);
    logPersistente('🔐 SESION', 'Token valor (primeros 30 chars):', token ? token.substring(0, 30) + '...' : 'null');
    logPersistente('🔐 SESION', 'UserStr existe:', !!userStr);
    
    if (!token || !userStr) {
        logPersistente('⚠️⚠️⚠️ SESION', 'NO HAY SESIÓN - Redirigiendo al login');
        logPersistente('⚠️⚠️⚠️ SESION', 'token:', token);
        logPersistente('⚠️⚠️⚠️ SESION', 'userStr:', userStr);
        // Guardar estado antes de redirigir
        localStorage.setItem('furia_redirect_reason', 'no_session');
        localStorage.setItem('furia_redirect_time', new Date().toISOString());
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
    
    try {
        const userData = JSON.parse(userStr);
        logPersistente('👤 SESION', 'Datos del usuario:', {
            nombre: userData.nombre,
            type: userData.type,
            roles: userData.roles,
            rol: userData.rol
        });
        
        // Verificar que sea un cliente
        const esCliente = userData.type === 'client' || 
                         (userData.roles && userData.roles.includes('cliente')) || 
                         userData.rol === 'cliente';
        
        logPersistente('🔐 SESION', 'esCliente:', esCliente);
        logPersistente('🔐 SESION', 'userData.type === "client":', userData.type === 'client');
        logPersistente('🔐 SESION', 'roles incluye cliente:', userData.roles && userData.roles.includes('cliente'));
        logPersistente('🔐 SESION', 'rol === cliente:', userData.rol === 'cliente');
        
        if (!esCliente) {
            logPersistente('⚠️⚠️⚠️ SESION', 'NO ES CLIENTE - Redirigiendo al login');
            logPersistente('⚠️⚠️⚠️ SESION', 'userData:', userData);
            localStorage.setItem('furia_redirect_reason', 'not_client');
            localStorage.setItem('furia_redirect_time', new Date().toISOString());
            localStorage.clear();
            window.location.href = `${API_BASE_URL}/`;
            return false;
        }
        
        logPersistente('✅✅✅ SESION', 'SESIÓN VÁLIDA para:', userData.nombre);
        return true;
        
    } catch (error) {
        logPersistente('❌❌❌ SESION', 'Error al verificar sesión:', error.message);
        logPersistente('❌❌❌ SESION', 'userStr:', userStr);
        localStorage.setItem('furia_redirect_reason', 'parse_error');
        localStorage.setItem('furia_redirect_time', new Date().toISOString());
        localStorage.clear();
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
}

// =====================================================
// FUNCIÓN PRINCIPAL PARA INCLUIR EL SIDEBAR
// =====================================================
async function includeSidebar() {
    logPersistente('🔵 INCLUDE', '=====================================');
    logPersistente('🔵 INCLUDE', 'includeSidebar() - INICIANDO');
    logPersistente('🔵 INCLUDE', '=====================================');
    
    const sidebarContainer = document.getElementById('sidebar-container');
    logPersistente('🔵 INCLUDE', 'sidebarContainer encontrado:', !!sidebarContainer);
    
    if (!sidebarContainer) {
        logPersistente('⚠️⚠️⚠️ INCLUDE', 'No se encontró el contenedor del sidebar');
        logPersistente('⚠️⚠️⚠️ INCLUDE', 'Elemento con id="sidebar-container":', document.getElementById('sidebar-container'));
        return;
    }
    
    // VERIFICAR QUE ESTAMOS EN CLIENTE
    const currentPath = window.location.pathname;
    logPersistente('🔵 INCLUDE', 'currentPath:', currentPath);
    logPersistente('🔵 INCLUDE', 'currentPath.includes("/cliente/"):', currentPath.includes('/cliente/'));
    
    if (!currentPath.includes('/cliente/')) {
        logPersistente('ℹ️ INCLUDE', 'No estamos en cliente, no se carga este sidebar');
        logPersistente('ℹ️ INCLUDE', 'Path actual:', currentPath);
        return;
    }
    
    logPersistente('✅ INCLUDE', 'Estamos en CLIENTE, cargando sidebar...');
    
    // VERIFICAR SESIÓN
    logPersistente('🔵 INCLUDE', 'Llamando a verificarSesionCliente()...');
    const sesionValida = verificarSesionCliente();
    logPersistente('🔵 INCLUDE', 'sesionValida:', sesionValida);
    
    if (!sesionValida) {
        logPersistente('⚠️⚠️⚠️ INCLUDE', 'Sesión NO válida, deteniendo carga');
        return;
    }
    
    logPersistente('🔵 INCLUDE', 'Mostrando loader...');
    mostrarLoader(sidebarContainer);
    
    try {
        const sidebarUrl = CONFIG.sidebarPath;
        logPersistente('🔄 INCLUDE', 'Intentando cargar sidebar desde:', sidebarUrl);
        
        const response = await fetch(sidebarUrl);
        logPersistente('🔵 INCLUDE', 'Response status:', response.status);
        logPersistente('🔵 INCLUDE', 'Response ok:', response.ok);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        const html = await response.text();
        logPersistente('🔵 INCLUDE', 'HTML recibido, longitud:', html.length);
        logPersistente('🔵 INCLUDE', 'HTML primeros 200 chars:', html.substring(0, 200));
        
        if (!html || html.trim() === '') {
            throw new Error('El archivo sidebar.html está vacío');
        }
        
        logPersistente('🔵 INCLUDE', 'Asignando HTML al contenedor...');
        sidebarContainer.innerHTML = html;
        logPersistente('✅✅✅ INCLUDE', 'Sidebar de Cliente cargado correctamente');
        
        logPersistente('🔵 INCLUDE', 'Inicializando sidebar...');
        inicializarSidebar();
        
        // Guardar éxito
        localStorage.setItem('furia_sidebar_loaded', 'true');
        localStorage.setItem('furia_sidebar_time', new Date().toISOString());
        
    } catch (error) {
        logPersistente('❌❌❌ INCLUDE', 'Error cargando sidebar:', error.message);
        logPersistente('❌❌❌ INCLUDE', 'Error stack:', error.stack);
        logPersistente('⚠️ INCLUDE', 'Usando sidebar de respaldo');
        localStorage.setItem('furia_sidebar_error', error.message);
        crearSidebarRespaldo(sidebarContainer);
        inicializarSidebar();
    }
}

function mostrarLoader(container) {
    logPersistente('🔵 LOADER', 'mostrarLoader()');
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
    logPersistente('🔵 RESPALDO', 'crearSidebarRespaldo()');
    const user = obtenerUsuarioActual();
    const currentPage = obtenerPaginaActual();
    
    logPersistente('🔵 RESPALDO', 'user para respaldo:', user);
    logPersistente('🔵 RESPALDO', 'currentPage para respaldo:', currentPage);
    
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
    logPersistente('✅ RESPALDO', 'Sidebar de respaldo creado');
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
    logPersistente('🔵 NAVEGAR', 'navegarPagina() - page:', page);
    event.preventDefault();
    const href = PAGE_FILES[page] || `${page}.html`;
    logPersistente('🔵 NAVEGAR', 'Navegando a:', href);
    window.location.href = href;
};

function inicializarSidebar() {
    logPersistente('🔵 INICIALIZAR', 'inicializarSidebar() - INICIANDO');
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        logPersistente('🔵 INICIALIZAR', 'currentPage:', currentPage);
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        logPersistente('✅✅✅ INICIALIZAR', 'Sidebar de Cliente inicializado');
    }, 200);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    let pageName = filename.replace('.html', '');
    
    logPersistente('🔵 PAGINA', 'obtenerPaginaActual() - path:', path);
    logPersistente('🔵 PAGINA', 'obtenerPaginaActual() - filename:', filename);
    logPersistente('🔵 PAGINA', 'obtenerPaginaActual() - pageName:', pageName);
    
    const pageMapping = {
        'misvehiculos': 'misvehiculos',
        'misreservas': 'misreservas',
        'avances': 'avances',
        'cotizaciones': 'cotizaciones',
        'historial': 'historial',
        'perfil': 'perfil'
    };
    
    const result = pageMapping[pageName] || pageName;
    logPersistente('🔵 PAGINA', 'obtenerPaginaActual() - result:', result);
    return result;
}

function marcarItemActivo(currentPage) {
    logPersistente('🔵 ACTIVO', 'marcarItemActivo() - currentPage:', currentPage);
    setTimeout(() => {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            logPersistente('✅ ACTIVO', `Item activo: ${currentPage}`);
        } else {
            logPersistente('⚠️ ACTIVO', `No se encontró item para: ${currentPage}`);
            const defaultItem = document.querySelector('.nav-item[data-page="misvehiculos"]');
            if (defaultItem) {
                defaultItem.classList.add('active');
                logPersistente('✅ ACTIVO', 'Usando item por defecto: misvehiculos');
            }
        }
    }, 100);
}

function actualizarNombreUsuario() {
    logPersistente('🔵 NOMBRE', 'actualizarNombreUsuario()');
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) {
            logPersistente('⚠️ NOMBRE', 'No se encontró #userName');
            return;
        }
        
        const user = obtenerUsuarioActual();
        logPersistente('🔵 NOMBRE', 'Actualizando nombre a:', user.nombre);
        userNameSpan.textContent = user.nombre || CONFIG.defaultUserName;
    }, 200);
}

// =====================================================
// CIERRE DE SESIÓN
// =====================================================

window.cerrarSesionCliente = function() {
    logPersistente('🔵 LOGOUT', 'cerrarSesionCliente() llamado');
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        logPersistente('🔵 LOGOUT', 'Eliminando datos de sesión...');
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        logPersistente('👋 LOGOUT', 'Sesión cerrada correctamente');
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

logPersistente('🔵 INICIO', 'Configurando inicialización...');
logPersistente('🔵 INICIO', 'document.readyState:', document.readyState);

document.addEventListener('DOMContentLoaded', () => {
    logPersistente('🔵 DOM', '==========================');
    logPersistente('🔵 DOM', 'DOMContentLoaded - CLIENTE');
    logPersistente('🔵 DOM', 'Path actual:', window.location.pathname);
    logPersistente('🔵 DOM', '==========================');
    includeSidebar();
    ajustarSidebarResponsive();
});

// También ejecutar si ya está cargado
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    logPersistente('🔵 DOM', 'DOM ya cargado, ejecutando inmediatamente');
    includeSidebar();
    ajustarSidebarResponsive();
}

window.addEventListener('resize', ajustarSidebarResponsive);

logPersistente('🔵 FIN', '===== ARCHIVO CARGADO COMPLETAMENTE =====');

console.log('📋 Para ver logs persistentes, ejecuta en consola: verLogsPersistentes()');
console.log('📋 Para limpiar logs, ejecuta: limpiarLogsPersistentes()');