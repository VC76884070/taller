// =====================================================
// INCLUDE.JS - SIDEBAR PARA ENCARGADO DE REPUESTOS
// VERSIÓN CORREGIDA CON LAS NUEVAS PESTAÑAS
// =====================================================

// Configuración
const CONFIG = {
    sidebarPath: 'components/sidebar.html',
    logoPath: '../../img/logoblanco.jpeg',
    defaultUserName: 'Roberto Vargas',
    userRole: 'Encargado de Repuestos'
};

// Mapeo de páginas a archivos
const PAGE_FILES = {
    'dashboard': 'dashboard.html',
    'cotizaciones': 'solicitudes_cotizacion.html',
    'compras': 'solicitudes_compra.html',
    'proveedores': 'proveedores.html',
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
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        const html = await response.text();
        sidebarContainer.innerHTML = html;
        
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
                <img src="${CONFIG.logoPath}" alt="FURIA MOTOR" class="sidebar-logo" onerror="this.src='https://via.placeholder.com/40'">
                <span class="sidebar-brand">FURIA MOTOR</span>
            </div>
            <div class="sidebar-user">
                <div class="user-avatar">
                    <i class="fas fa-boxes"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('dashboard', 'Dashboard', 'chart-pie', currentPage, '')}
                    ${crearMenuItem('cotizaciones', 'Solicitudes de Cotización', 'file-invoice-dollar', currentPage, '')}
                    ${crearMenuItem('compras', 'Solicitudes de Compra', 'shopping-cart', currentPage, '')}
                    ${crearMenuItem('proveedores', 'Proveedores', 'truck', currentPage, '')}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage, '')}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage, '')}
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

function crearMenuItem(page, label, icon, currentPage, badge) {
    const isActive = currentPage === page ? 'active' : '';
    const href = PAGE_FILES[page] || `${page}.html`;
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${href}" class="nav-link">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
                ${badge}
            </a>
        </li>
    `;
}

function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        actualizarBadgeNotificaciones();
    }, 100);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    const pageName = filename.replace('.html', '');
    
    // Buscar coincidencia en PAGE_FILES
    for (const [key, value] of Object.entries(PAGE_FILES)) {
        if (value === filename || key === pageName) {
            return key;
        }
    }
    
    return 'dashboard';
}

function marcarItemActivo(currentPage) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const link = item.querySelector('.nav-link');
        if (link) link.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        const activeLink = activeItem.querySelector('.nav-link');
        if (activeLink) activeLink.classList.add('active');
    } else {
        const defaultItem = document.querySelector('.nav-item[data-page="dashboard"]');
        if (defaultItem) {
            defaultItem.classList.add('active');
            const defaultLink = defaultItem.querySelector('.nav-link');
            if (defaultLink) defaultLink.classList.add('active');
        }
    }
}

function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                rol: user.rol || 'encargado_repuestos'
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    return { nombre: CONFIG.defaultUserName };
}

function actualizarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (!userNameSpan) return;
    
    const user = obtenerUsuarioActual();
    userNameSpan.textContent = user.nombre;
}

function actualizarBadgeNotificaciones() {
    // Actualizar badge de notificaciones si existe
    const badge = document.getElementById('notificacionesBadge');
    if (badge) {
        const stockBajo = localStorage.getItem('stock_bajo_count') || '0';
        if (stockBajo !== '0') {
            badge.textContent = stockBajo;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Función global de logout
window.logout = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        localStorage.removeItem('stock_bajo_count');
        window.location.href = '../../login.html';
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', includeSidebar);