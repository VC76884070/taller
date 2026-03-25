// =====================================================
// INCLUDE.JS - SIDEBAR PARA ENCARGADO DE REPUESTOS
// =====================================================

// Configuración
const CONFIG = {
    sidebarPath: 'components/sidebar.html',
    logoPath: '../../img/logoblanco.jpeg',
    defaultUserName: 'Roberto Vargas',
    userRole: 'Encargado de Repuestos'
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
                <img src="${CONFIG.logoPath}" alt="FURIA MOTOR" class="sidebar-logo">
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
                    ${crearMenuItem('dashboard', 'Dashboard Inventario', 'chart-pie', currentPage, '')}
                    ${crearMenuItem('inventario', 'Inventario', 'cubes', currentPage, '<span class="badge" id="stockBajoBadge">3</span>')}
                    ${crearMenuItem('compras', 'Compras', 'shopping-cart', currentPage, '')}
                    ${crearMenuItem('proveedores', 'Proveedores', 'truck', currentPage, '')}
                    ${crearMenuItem('herramientas', 'Herramientas', 'tools', currentPage, '')}
                    ${crearMenuItem('rendicion', 'Rendición Diaria', 'hand-holding-usd', currentPage, '')}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage, '')}
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
    
    const pageToFile = {
        'dashboard': 'dashboard.html',
        'inventario': 'inventario.html',
        'compras': 'compras.html',
        'proveedores': 'proveedores.html',
        'herramientas': 'herramientas.html',
        'rendicion': 'rendicion.html',
        'historial': 'historial.html'
    };
    
    const href = pageToFile[page] || `${page}.html`;
    
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
        actualizarBadgeStockBajo();
    }, 100);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    return filename.replace('.html', '');
}

function marcarItemActivo(currentPage) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    } else {
        const defaultItem = document.querySelector('.nav-item[data-page="dashboard"]');
        if (defaultItem) defaultItem.classList.add('active');
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

function actualizarBadgeStockBajo() {
    const badge = document.getElementById('stockBajoBadge');
    if (!badge) return;
    
    // Obtener datos de stock bajo desde localStorage o API
    const stockBajo = localStorage.getItem('stock_bajo_count') || '3';
    badge.textContent = stockBajo;
    
    if (stockBajo === '0') {
        badge.style.display = 'none';
    } else {
        badge.style.display = 'inline';
    }
}

window.logout = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('stock_bajo_count');
        window.location.href = '../../login.html';
    }
};

document.addEventListener('DOMContentLoaded', includeSidebar);