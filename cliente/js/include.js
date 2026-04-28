// =====================================================
// INCLUDE.JS - CLIENTE (CORREGIDO)
// FURIA MOTOR COMPANY SRL
// =====================================================

const CONFIG = {
    sidebarPath: 'components/sidebar.html',
    logoPath: '../../img/logoblanco.jpeg',
    defaultUserName: 'Cliente',
    userRole: 'Cliente',
    API_URL: '/api/cliente'
};

const PAGE_FILES = {
    'misvehiculos': '/cliente/misvehiculos.html',
    'cotizaciones': '/cliente/cotizaciones.html',
    'avances': '/cliente/avances.html',
    'historial': '/cliente/historial.html',
    'perfil': '/cliente/perfil.html'
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
        console.log('❌ No hay token');
        window.location.href = '/';
        return false;
    }
    
    try {
        const response = await fetch(`${CONFIG.API_URL}/perfil`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            console.log('❌ Token inválido o expirado');
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.usuario) {
            console.log('✅ Usuario autenticado:', data.usuario.nombre);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
        return false;
    }
}

// =====================================================
// FUNCIONES DEL SIDEBAR
// =====================================================

async function includeSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    
    if (!sidebarContainer) {
        console.warn('⚠️ No se encontró el contenedor del sidebar');
        return;
    }
    
    // Primero verificar autenticación
    const autenticado = await verificarAutenticacion();
    if (!autenticado) return;
    
    mostrarLoader(sidebarContainer);
    
    try {
        // Intentar cargar el sidebar desde el archivo
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        let html = await response.text();
        
        // Reemplazar enlaces relativos por absolutos
        html = html.replace(/href="([^"]+)"/g, (match, href) => {
            if (href.startsWith('../') || href.startsWith('./') || !href.startsWith('/')) {
                return `href="/cliente/${href.replace(/^\.\.\/|^\.\//, '')}"`;
            }
            return match;
        });
        
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
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('misvehiculos', 'Mis Vehículos', 'car', currentPage)}
                    ${crearMenuItem('cotizaciones', 'Informes de Cotización', 'file-invoice-dollar', currentPage)}
                    ${crearMenuItem('avances', 'Avances de Reparación', 'chart-line', currentPage)}
                    ${crearMenuItem('historial', 'Historial', 'history', currentPage)}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage)}
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

function crearMenuItem(page, label, icon, currentPage) {
    const isActive = currentPage === page ? 'active' : '';
    const href = PAGE_FILES[page] || `/cliente/${page}.html`;
    
    // Prevenir navegación por defecto y manejar clics
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${href}" class="nav-link" onclick="navegarPagina(event, '${page}')">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
            </a>
        </li>
    `;
}

// Función global para navegación
window.navegarPagina = function(event, page) {
    event.preventDefault();
    
    const href = PAGE_FILES[page] || `/cliente/${page}.html`;
    console.log(`🔗 Navegando a: ${href}`);
    
    // Verificar autenticación antes de navegar
    const token = localStorage.getItem('furia_token') || localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }
    
    window.location.href = href;
};

function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        
        // Agregar event listeners a los enlaces
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    // Verificar autenticación
                    const token = localStorage.getItem('furia_token') || localStorage.getItem('token');
                    if (!token) {
                        e.preventDefault();
                        window.location.href = '/';
                    }
                }
            });
        });
    }, 100);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'misvehiculos.html';
    const pageName = filename.replace('.html', '');
    
    // Mapeo de nombres de archivo a páginas
    const pageMapping = {
        'misvehiculos': 'misvehiculos',
        'cotizaciones': 'cotizaciones',
        'avances': 'avances',
        'historial': 'historial',
        'perfil': 'perfil'
    };
    
    return pageMapping[pageName] || 'misvehiculos';
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
    }
}

async function obtenerUsuarioActual() {
    try {
        // Intentar obtener del localStorage primero
        let userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user.nombre) {
                return { nombre: user.nombre, rol: 'cliente' };
            }
        }
        
        // Si no hay, intentar desde la API
        const token = localStorage.getItem('furia_token') || localStorage.getItem('token');
        if (token) {
            const response = await fetch(`${CONFIG.API_URL}/perfil`, {
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.usuario) {
                    return { nombre: data.usuario.nombre, rol: 'cliente' };
                }
            }
        }
        
        return { nombre: CONFIG.defaultUserName, rol: 'cliente' };
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
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
        console.log('🚪 Cerrando sesión...');
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        window.location.href = '/';
    }
};

// =====================================================
// INICIALIZACIÓN
// =====================================================

// Verificar autenticación al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando include.js');
    
    // Verificar autenticación
    const autenticado = await verificarAutenticacion();
    if (!autenticado) return;
    
    // Cargar sidebar
    await includeSidebar();
    
    console.log('✅ include.js inicializado correctamente');
});