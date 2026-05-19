// =====================================================
// INCLUDE.JS - SIDEBAR PARA ENCARGADO DE REPUESTOS
// VERSIÓN CORREGIDA - Rutas correctas
// =====================================================

// Configuración
const CONFIG = {
    sidebarPath: 'components/sidebar.html',
    logoPath: '../../img/logoblanco.jpeg',
    defaultUserName: 'Roberto Vargas',
    userRole: 'Encargado de Repuestos'
};

// =====================================================
// ⚠️ IMPORTANTE: CORREGIR ESTAS RUTAS ⚠️
// =====================================================
const PAGE_FILES = {
    'dashboard': 'dashboard.html',
    'cotizaciones': 'solicitudes_cotizacion.html',  // ← Corregido
    'compras': 'solicitudes_compra.html',           // ← Corregido
    'proveedores': 'proveedores.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
};

// Nombres amigables
const PAGE_NAMES = {
    'dashboard': 'Dashboard',
    'cotizaciones': 'Solicitudes de Cotización',
    'compras': 'Solicitudes de Compra',
    'proveedores': 'Proveedores',
    'historial': 'Historial',
    'perfil': 'Perfil'
};

// =====================================================
// FUNCIÓN PRINCIPAL
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
                    ${crearMenuItem('dashboard', 'Dashboard', 'chart-line', currentPage)}
                    ${crearMenuItem('cotizaciones', 'Solicitudes Cotización', 'file-invoice-dollar', currentPage)}
                    ${crearMenuItem('compras', 'Solicitudes Compra', 'shopping-cart', currentPage)}
                    ${crearMenuItem('proveedores', 'Proveedores', 'truck', currentPage)}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage)}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage)}
                </ul>
                <ul class="sidebar-bottom">
                    <li class="nav-item">
                        <a href="#" onclick="cerrarSesion()" class="nav-link">
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
    const href = PAGE_FILES[page] || `${page}.html`;
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${href}" class="nav-link ${isActive}">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
            </a>
        </li>
    `;
}

function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        console.log('📄 Página actual detectada:', currentPage);
        
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        actualizarEnlacesSidebar();
        
        const items = document.querySelectorAll('.nav-item');
        console.log(`📋 Encontrados ${items.length} items en el sidebar`);
    }, 100);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    
    console.log('🔍 Archivo actual:', filename);
    
    // =====================================================
    // ⚠️ CORREGIR ESTE MAPEO ⚠️
    // =====================================================
    const fileToPage = {
        'dashboard.html': 'dashboard',
        'solicitudes_cotizacion.html': 'cotizaciones',  // ← Corregido
        'solicitudes_compra.html': 'compras',           // ← Corregido
        'proveedores.html': 'proveedores',
        'historial.html': 'historial',
        'perfil.html': 'perfil'
    };
    
    if (fileToPage[filename]) {
        console.log('✅ Página encontrada:', fileToPage[filename]);
        return fileToPage[filename];
    }
    
    // Para páginas que no están en el mapeo
    if (filename === 'dashboard.html') {
        return 'dashboard';
    }
    
    console.log('⚠️ Usando dashboard por defecto');
    return 'dashboard';
}

function marcarItemActivo(currentPage) {
    // Remover clase active de todos
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const link = item.querySelector('.nav-link');
        if (link) link.classList.remove('active');
    });
    
    // Buscar por data-page
    let activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    
    // Si no encuentra, buscar por href
    if (!activeItem) {
        const currentFile = window.location.pathname.split('/').pop();
        document.querySelectorAll('.nav-item').forEach(item => {
            const link = item.querySelector('.nav-link');
            const href = link?.getAttribute('href');
            if (href && href === currentFile) {
                activeItem = item;
            }
        });
    }
    
    // Marcar el activo
    if (activeItem) {
        activeItem.classList.add('active');
        const activeLink = activeItem.querySelector('.nav-link');
        if (activeLink) {
            activeLink.classList.add('active');
        }
        console.log('✅ Menú activo:', currentPage);
    } else {
        console.warn('⚠️ No se encontró el menú para:', currentPage);
    }
}

function actualizarEnlacesSidebar() {
    document.querySelectorAll('.nav-link[href]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('javascript') && href !== '#' && !href.startsWith('http')) {
            if (!href.includes('.html')) {
                const page = link.closest('.nav-item')?.getAttribute('data-page');
                if (page && PAGE_FILES[page]) {
                    link.setAttribute('href', PAGE_FILES[page]);
                }
            }
        }
    });
}

function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        
        if (userStr) {
            const user = JSON.parse(userStr);
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                email: user.email || '',
                rol: user.rol || 'encargado_repuestos'
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    
    return { nombre: CONFIG.defaultUserName, email: '', rol: 'encargado_repuestos' };
}

function actualizarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (!userNameSpan) return;
    
    const user = obtenerUsuarioActual();
    userNameSpan.textContent = user.nombre;
}

// Cierre de sesión
window.cerrarSesion = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        window.location.href = '../../login.html';
    }
};

// Recargar sidebar
window.recargarSidebar = function() {
    includeSidebar();
};

// Inicializar
document.addEventListener('DOMContentLoaded', includeSidebar);