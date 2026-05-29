// =====================================================
// INCLUDE.JS - CLIENTE (VERSIÓN CORREGIDA)
// CON RESALTADO DE PESTAÑAS: Mis Reservas e Historial SEPARADOS
// FURIA MOTOR COMPANY SRL
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
window.API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 [CLIENTE] Modo DESARROLLO');
        return 'http://localhost:5000';
    }
    console.log('📡 [CLIENTE] Modo PRODUCCIÓN');
    return '';
})();

console.log('🌐 [CLIENTE] API_BASE_URL:', window.API_BASE_URL);

// =====================================================
// FORZAR ROL CLIENTE - SOBREESCRIBIR CUALQUIER OTRA CONFIGURACIÓN
// =====================================================
localStorage.setItem('furia_selected_role', 'cliente');
sessionStorage.setItem('current_role_mode', 'cliente');

// =====================================================
// CONFIGURACIÓN DEL CLIENTE
// =====================================================
const CONFIG = {
    sidebarPath: '/cliente/components/sidebar.html',
    logoPath: '/img/logoblanco.jpeg',
    defaultUserName: 'Cliente',
    userRole: 'Cliente',
    API_URL: window.API_BASE_URL + '/api/cliente'
};

// MAPEO DE PÁGINAS - Incluye TODAS las páginas del cliente
const PAGE_FILES = {
    'misvehiculos': '/cliente/misvehiculos.html',
    'cotizaciones': '/cliente/cotizaciones.html',
    'avances': '/cliente/avances.html',
    'misreservas': '/cliente/misreservas.html',
    'historial': '/cliente/historial.html',
    'perfil': '/cliente/perfil.html'
};

// MAPEO PARA EL RESALTADO - data-page debe coincidir con el valor en sidebar.html
const PAGE_MAPPING = {
    'misvehiculos': 'misvehiculos',
    'cotizaciones': 'cotizaciones',
    'avances': 'avances',
    'misreservas': 'misreservas',
    'historial': 'historial',
    'perfil': 'perfil'
};

// =====================================================
// FUNCIONES DE AUTENTICACIÓN
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

async function verificarAutenticacion() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    
    if (!token) {
        console.log('❌ [CLIENTE] No hay token');
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
    
    console.log('✅ [CLIENTE] Verificación exitosa');
    return true;
}

// =====================================================
// FUNCIÓN PRINCIPAL PARA CARGAR EL SIDEBAR
// =====================================================
async function includeSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    
    if (!sidebarContainer) {
        console.warn('⚠️ [CLIENTE] No se encontró el contenedor del sidebar');
        return;
    }
    
    const autenticado = await verificarAutenticacion();
    if (!autenticado) return;
    
    mostrarLoader(sidebarContainer);
    
    const sidebarUrl = CONFIG.sidebarPath;
    console.log(`🔄 [CLIENTE] Cargando sidebar desde: ${sidebarUrl}`);
    
    try {
        const response = await fetch(sidebarUrl);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        let html = await response.text();
        
        // CORREGIR ENLACES RELATIVOS
        html = html.replace(/href="\.\.\//g, 'href="/cliente/');
        html = html.replace(/href="\.\//g, 'href="/cliente/');
        html = html.replace(/src="\.\.\//g, 'src="/cliente/');
        
        sidebarContainer.innerHTML = html;
        console.log('✅ [CLIENTE] Sidebar cargado correctamente');
        
        inicializarSidebar();
        
    } catch (error) {
        console.error('❌ [CLIENTE] Error cargando sidebar:', error);
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

// =====================================================
// SIDEBAR DE RESPALDO (FALLBACK)
// =====================================================
function crearSidebarRespaldo(container) {
    const user = obtenerUsuarioActualSync();
    const currentPage = obtenerPaginaActual();
    
    container.innerHTML = `
        <aside class="sidebar">
            <div class="sidebar-header">
                <img src="/img/logoblanco.jpeg" alt="FURIA MOTOR" class="sidebar-logo" 
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%23C1121F%22/%3E%3Ctext x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22white%22%3EFM%3C/text%3E%3C/svg%3E'">
                <span class="sidebar-brand">FURIA MOTOR</span>
            </div>
            <div class="sidebar-user">
                <div class="user-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">Cliente</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItemRespaldo('misvehiculos', 'Mis Vehículos', 'car', currentPage)}
                    ${crearMenuItemRespaldo('cotizaciones', 'Informes de Cotización', 'file-invoice-dollar', currentPage)}
                    ${crearMenuItemRespaldo('avances', 'Avances de Reparación', 'chart-line', currentPage)}
                    ${crearMenuItemRespaldo('misreservas', 'Mis Reservas', 'calendar-check', currentPage)}
                    ${crearMenuItemRespaldo('historial', 'Historial', 'history', currentPage)}
                    ${crearMenuItemRespaldo('perfil', 'Perfil', 'user-circle', currentPage)}
                </ul>
                <ul class="sidebar-bottom">
                    <li class="nav-item">
                        <a href="#" onclick="logout(); return false;" class="nav-link">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Cerrar Sesión</span>
                        </a>
                    </li>
                </ul>
            </nav>
        </aside>
    `;
}

function crearMenuItemRespaldo(page, label, icon, currentPage) {
    const isActive = currentPage === page ? 'active' : '';
    const href = PAGE_FILES[page] || `/cliente/${page}.html`;
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${href}" class="nav-link" onclick="navegarPagina(event, '${page}')">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
            </a>
        </li>
    `;
}

// =====================================================
// NAVEGACIÓN CON RESALTADO
// =====================================================
window.navegarPagina = function(event, page) {
    event.preventDefault();
    
    // Forzar rol cliente
    localStorage.setItem('furia_selected_role', 'cliente');
    
    const href = PAGE_FILES[page];
    if (href) {
        console.log(`🔗 [CLIENTE] Navegando a: ${href}`);
        window.location.href = href;
    } else {
        console.error(`❌ [CLIENTE] Página no encontrada: ${page}`);
    }
};

// =====================================================
// INICIALIZAR SIDEBAR - RESALTADO DE PESTAÑA ACTIVA
// =====================================================
function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        console.log(`📍 [CLIENTE] Página actual detectada: ${currentPage}`);
        
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        
        // Agregar event listeners a los enlaces
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    const token = localStorage.getItem('furia_token');
                    if (!token) {
                        e.preventDefault();
                        window.location.href = window.API_BASE_URL + '/';
                    }
                }
            });
        });
        
        console.log(`✅ [CLIENTE] Sidebar inicializado - Pestaña activa: ${currentPage}`);
    }, 100);
}

// =====================================================
// OBTENER PÁGINA ACTUAL DESDE LA URL
// =====================================================
function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    let pageName = filename.replace('.html', '');
    
    // Mapeo especial para ciertos nombres de archivo
    if (pageName === 'misreservas') return 'misreservas';
    if (pageName === 'historial') return 'historial';
    if (pageName === 'misvehiculos') return 'misvehiculos';
    if (pageName === 'cotizaciones') return 'cotizaciones';
    if (pageName === 'avances') return 'avances';
    if (pageName === 'perfil') return 'perfil';
    
    // Si no coincide con ninguno, devolver el nombre original
    const mappedPage = PAGE_MAPPING[pageName];
    return mappedPage || 'misvehiculos';
}

// =====================================================
// MARCAR ITEM ACTIVO EN EL MENÚ
// =====================================================
function marcarItemActivo(currentPage) {
    // Remover clase active de todos los items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const link = item.querySelector('.nav-link');
        if (link) link.classList.remove('active');
    });
    
    // Buscar y activar el item correspondiente
    const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        const activeLink = activeItem.querySelector('.nav-link');
        if (activeLink) activeLink.classList.add('active');
        console.log(`✅ [CLIENTE] Item activado: ${currentPage}`);
    } else {
        console.log(`⚠️ [CLIENTE] No se encontró item para: ${currentPage}`);
        
        // Si estamos en historial.html pero no encuentra 'historial', buscar alternativas
        if (window.location.pathname.includes('historial')) {
            const fallbackItem = document.querySelector('.nav-item[data-page="historial"]');
            if (fallbackItem) {
                fallbackItem.classList.add('active');
                console.log(`✅ [CLIENTE] Fallback activado: historial`);
            }
        }
        if (window.location.pathname.includes('misreservas')) {
            const fallbackItem = document.querySelector('.nav-item[data-page="misreservas"]');
            if (fallbackItem) {
                fallbackItem.classList.add('active');
                console.log(`✅ [CLIENTE] Fallback activado: misreservas`);
            }
        }
    }
}

// =====================================================
// OBTENER USUARIO ACTUAL
// =====================================================
function obtenerUsuarioActualSync() {
    try {
        let userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user.nombre) {
                return { nombre: user.nombre, rol: 'cliente' };
            }
        }
        return { nombre: CONFIG.defaultUserName, rol: 'cliente' };
    } catch (error) {
        return { nombre: CONFIG.defaultUserName, rol: 'cliente' };
    }
}

async function obtenerUsuarioActual() {
    try {
        let userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user.nombre) {
                return { nombre: user.nombre, rol: 'cliente' };
            }
        }
        return { nombre: CONFIG.defaultUserName, rol: 'cliente' };
    } catch (error) {
        return { nombre: CONFIG.defaultUserName, rol: 'cliente' };
    }
}

function actualizarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (!userNameSpan) return;
    
    obtenerUsuarioActual().then(user => {
        userNameSpan.textContent = user.nombre;
    });
}

// =====================================================
// LOGOUT
// =====================================================
window.logout = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        console.log('🚪 [CLIENTE] Cerrando sesión...');
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = window.API_BASE_URL + '/';
    }
};

// =====================================================
// INICIALIZACIÓN PRINCIPAL
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [CLIENTE] Inicializando include.js');
    console.log('📍 Path actual:', window.location.pathname);
    console.log('📍 Sidebar a cargar:', CONFIG.sidebarPath);
    
    await includeSidebar();
    
    console.log('✅ [CLIENTE] include.js inicializado correctamente');
});

// Exponer funciones globales
window.getAuthHeaders = getAuthHeaders;
window.logout = window.logout;
window.obtenerPaginaActual = obtenerPaginaActual;