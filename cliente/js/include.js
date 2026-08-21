// =====================================================
// INCLUDE.JS - SIDEBAR PARA CLIENTE
// VERSIÓN CORREGIDA - NAVEGACIÓN CON RUTAS ABSOLUTAS
// =====================================================

console.log('🔵🔵🔵 [INCLUDE CLIENTE] ===== ARCHIVO CARGADO =====');

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
        if (logs.length > 50) logs.shift();
        localStorage.setItem('furia_debug_logs', JSON.stringify(logs));
        console.log(tag, mensaje, data);
    } catch(e) {
        console.error('Error guardando log:', e);
    }
}

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

function limpiarLogsPersistentes() {
    localStorage.removeItem('furia_debug_logs');
    console.log('🧹 Logs persistentes limpiados');
}

window.verLogsPersistentes = verLogsPersistentes;
window.limpiarLogsPersistentes = limpiarLogsPersistentes;

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
window.API_BASE_URL = (() => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' ||
        hostname.includes('192.168.')) {
        return 'http://localhost:5000';
    }
    return '';
})();

const API_BASE_URL = window.API_BASE_URL;

// Configuración
const CONFIG = {
    sidebarPath: `${API_BASE_URL}/cliente/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Cargando...',
    userRole: 'Cliente',
    // ✅ NUEVO: BASE PATH para navegación
    basePath: '/cliente/'
};

// Mapeo de páginas con rutas ABSOLUTAS
const PAGE_FILES = {
    'misvehiculos': '/cliente/misvehiculos.html',
    'misreservas': '/cliente/misreservas.html',
    'avances': '/cliente/avances.html',
    'cotizaciones': '/cliente/cotizaciones.html',
    'historial': '/cliente/historial.html',
    'perfil': '/cliente/perfil.html'
};

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
                type: user.type || null,
                raw: user
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
        logPersistente('⚠️ SESION', 'NO HAY SESIÓN - Redirigiendo al login');
        localStorage.setItem('furia_redirect_reason', 'no_session');
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
    
    try {
        const userData = JSON.parse(userStr);
        const esCliente = userData.type === 'client' || 
                         (userData.roles && userData.roles.includes('cliente')) || 
                         userData.rol === 'cliente';
        
        if (!esCliente) {
            logPersistente('⚠️ SESION', 'NO ES CLIENTE - Redirigiendo al login');
            localStorage.clear();
            window.location.href = `${API_BASE_URL}/`;
            return false;
        }
        
        logPersistente('✅ SESION', 'SESIÓN VÁLIDA para:', userData.nombre);
        return true;
        
    } catch (error) {
        logPersistente('❌ SESION', 'Error al verificar sesión:', error.message);
        localStorage.clear();
        window.location.href = `${API_BASE_URL}/`;
        return false;
    }
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
        html = html.replace(/href="([^"]+\.html)"/g, (match, p1) => {
            // Si ya es una ruta absoluta o externa, no la modificamos
            if (p1.startsWith('/') || p1.startsWith('http')) {
                return match;
            }
            // Convertir a ruta absoluta
            return `href="/cliente/${p1}"`;
        });
        
        // ✅ También corregir onclick para cerrar sesión
        html = html.replace(/onclick="cerrarSesion\(\)"/g, 'onclick="window.cerrarSesionCliente()"');
        html = html.replace(/onclick="logout\(\)"/g, 'onclick="window.cerrarSesionCliente()"');
        
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar de Cliente cargado correctamente');
        
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
    // ✅ Usar ruta ABSOLUTA
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
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        console.log('✅ Sidebar de Cliente inicializado');
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
    
    return pageMapping[pageName] || 'misvehiculos';
}

function marcarItemActivo(currentPage) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        console.log(`✅ Item activo: ${currentPage}`);
    } else {
        const defaultItem = document.querySelector('.nav-item[data-page="misvehiculos"]');
        if (defaultItem) defaultItem.classList.add('active');
    }
}

function actualizarNombreUsuario() {
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) return;
        
        const user = obtenerUsuarioActual();
        userNameSpan.textContent = user.nombre || CONFIG.defaultUserName;
    }, 200);
}

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
        window.location.href = `${API_BASE_URL}/`;
    }
};

window.logout = window.cerrarSesionCliente;

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
    includeSidebar();
});

// Si ya está cargado
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    includeSidebar();
}

console.log('✅ include.js cargado - CLIENTE (versión corregida)');