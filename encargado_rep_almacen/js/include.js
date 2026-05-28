// =====================================================
// CONFIGURACIÓN DE API - FUNCIONA EN LOCAL Y PRODUCCIÓN
// =====================================================
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Modo DESARROLLO - Usando localhost:5000');
        return 'http://localhost:5000';
    }
    console.log('📡 Modo PRODUCCIÓN - Usando URL relativa');
    return '';
})();

// ✅ EXPORTAR VARIABLE GLOBAL PARA OTROS SCRIPTS
window.API_BASE_URL = API_BASE_URL;

// =====================================================
// INCLUDE.JS - SIDEBAR PARA ENCARGADO DE REPUESTOS
// VERSIÓN CORREGIDA CON RESPONSIVE
// =====================================================

// Configuración
const CONFIG = {
    sidebarPath: `${API_BASE_URL}/encargado_rep_almacen/components/sidebar.html`,
    logoPath: `${API_BASE_URL}/img/logoblanco.jpeg`,
    defaultUserName: 'Encargado Repuestos',
    userRole: 'Encargado de Repuestos'
};

// Mapeo de páginas
const PAGE_FILES = {
    'dashboard': 'dashboard.html',
    'cotizaciones': 'solicitudes_cotizacion.html',
    'compras': 'solicitudes_compra.html',
    'proveedores': 'proveedores.html',
    'historial': 'historial.html',
    'perfil': 'perfil.html'
};

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
        console.log('🔄 Cargando sidebar desde:', CONFIG.sidebarPath);
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        const html = await response.text();
        sidebarContainer.innerHTML = html;
        
        inicializarSidebar();
        ajustarSidebarResponsive();
        
    } catch (error) {
        console.error('❌ Error cargando sidebar:', error);
        crearSidebarRespaldo(sidebarContainer);
        inicializarSidebar();
        ajustarSidebarResponsive();
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
        console.log('📄 Página actual detectada:', currentPage);
        
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        actualizarEnlacesSidebar();
        mejorarNavegacionMovil();
        
        const items = document.querySelectorAll('.nav-item');
        console.log(`📋 Encontrados ${items.length} items en el sidebar`);
    }, 100);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    
    console.log('🔍 Archivo actual:', filename);
    
    const fileToPage = {
        'dashboard.html': 'dashboard',
        'solicitudes_cotizacion.html': 'cotizaciones',
        'solicitudes_compra.html': 'compras',
        'proveedores.html': 'proveedores',
        'historial.html': 'historial',
        'perfil.html': 'perfil'
    };
    
    if (fileToPage[filename]) {
        console.log('✅ Página encontrada:', fileToPage[filename]);
        return fileToPage[filename];
    }
    
    console.log('⚠️ Usando dashboard por defecto');
    return 'dashboard';
}

function marcarItemActivo(currentPage) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const link = item.querySelector('.nav-link');
        if (link) link.classList.remove('active');
    });
    
    let activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    
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

// =====================================================
// FUNCIONES RESPONSIVE PARA EL SIDEBAR
// =====================================================

// Función para ajustar sidebar según el tamaño de pantalla
function ajustarSidebarResponsive() {
    const sidebar = document.querySelector('.sidebar');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    
    if (!sidebar) return;
    
    if (window.innerWidth > 768) {
        // En desktop/tablet, asegurar que sidebar esté visible
        sidebar.classList.remove('open');
        if (hamburgerMenu) hamburgerMenu.classList.remove('active');
        document.body.classList.remove('sidebar-open');
        
        // En tablet (769-992px) mantener estilo compacto
        if (window.innerWidth <= 992) {
            sidebar.style.transform = '';
        }
    } else {
        // En móvil, asegurar que sidebar esté cerrado inicialmente
        sidebar.classList.remove('open');
        if (hamburgerMenu) hamburgerMenu.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }
}

// Función para mejorar la navegación en móvil
function mejorarNavegacionMovil() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        // Remover event listener previo para evitar duplicados
        link.removeEventListener('click', handleNavLinkClick);
        link.addEventListener('click', handleNavLinkClick);
    });
}

function handleNavLinkClick(e) {
    // En móvil, cerrar sidebar después de hacer click
    if (window.innerWidth <= 768) {
        // Pequeño delay para que la navegación se complete
        setTimeout(() => {
            if (typeof window.closeSidebar === 'function') {
                window.closeSidebar();
            } else if (typeof closeSidebar === 'function') {
                closeSidebar();
            }
        }, 150);
    }
}

// Función para detectar si es dispositivo móvil
function esDispositivoMovil() {
    return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// =====================================================
// FUNCIONES GLOBALES
// =====================================================

window.cerrarSesion = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        window.location.href = API_BASE_URL + '/';
    }
};

window.recargarSidebar = function() {
    includeSidebar();
};

// Escuchar cambios de orientación
window.addEventListener('orientationchange', function() {
    setTimeout(ajustarSidebarResponsive, 100);
});

// Escuchar cambios de tamaño de pantalla
window.addEventListener('resize', function() {
    ajustarSidebarResponsive();
});

// =====================================================
// INICIALIZACIÓN
// =====================================================

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    includeSidebar();
});

// También inicializar si el script se carga después del DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', includeSidebar);
} else {
    includeSidebar();
}

// Exportar funciones para uso global
window.ajustarSidebarResponsive = ajustarSidebarResponsive;
window.mejorarNavegacionMovil = mejorarNavegacionMovil;
window.esDispositivoMovil = esDispositivoMovil;

console.log('✅ include.js cargado correctamente - Versión responsive');