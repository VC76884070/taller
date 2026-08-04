// =====================================================
// INCLUDE.JS - SIDEBAR PARA JEFE DE TALLER
// VERSIÓN CORREGIDA - CARGA CORRECTAMENTE EL SIDEBAR
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - VARIABLE GLOBAL
// =====================================================
window.API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Include.js (Jefe Taller) - Modo DESARROLLO');
        return 'http://localhost:5000';
    }
    console.log('📡 Include.js (Jefe Taller) - Modo PRODUCCIÓN');
    return '';
})();

const API_BASE_URL = window.API_BASE_URL;

// Configuración del sidebar
const CONFIG = {
    sidebarPath: `/jefe_taller/components/sidebar.html`,
    logoPath: `/img/logoblanco.jpeg`,
    defaultUserName: 'Carlos Rodríguez',
    userRole: 'Jefe de Taller'
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
        console.log('🔄 Intentando cargar sidebar desde:', CONFIG.sidebarPath);
        
        const response = await fetch(CONFIG.sidebarPath);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        const html = await response.text();
        
        // Insertar el HTML en el contenedor
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar cargado correctamente');
        
        // Pequeño delay para asegurar que el DOM se actualice
        setTimeout(() => {
            inicializarSidebar();
            configurarSidebarResponsive();
        }, 50);
        
    } catch (error) {
        console.error('❌ Error cargando sidebar:', error);
        crearSidebarRespaldo(sidebarContainer);
        setTimeout(() => {
            inicializarSidebar();
            configurarSidebarResponsive();
        }, 50);
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
                <img src="${CONFIG.logoPath}" alt="FURIA MOTOR" class="sidebar-logo" onerror="this.style.display='none'">
                <span class="sidebar-brand">FURIA MOTOR</span>
            </div>
            <div class="sidebar-user">
                <div class="user-avatar">
                    <i class="fas fa-user-cog"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${escapeHtml(user.nombre)}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('dashboard', 'Dashboard Técnico', 'chart-line', currentPage)}
                    ${crearMenuItem('orden_trabajo', 'Órdenes de Trabajo', 'clipboard-list', currentPage)}
                    ${crearMenuItem('calendario_bahias', 'Calendario y Bahías', 'calendar-alt', currentPage)}
                    ${crearMenuItem('diagnostico', 'Diagnósticos', 'stethoscope', currentPage)}
                    ${crearMenuItem('cotizaciones', 'Cotizaciones', 'file-invoice-dollar', currentPage)}
                    ${crearMenuItem('control_calidad', 'Control de Calidad', 'check-double', currentPage)}
                    ${crearMenuItem('gestion_avances', 'Gestión de Avances', 'tasks', currentPage)}
                    ${crearMenuItem('reservas_solicitudes', 'Reservas y Solicitudes', 'calendar-check', currentPage)}
                    ${crearMenuItem('admin_roles', 'Administrar Roles', 'user-shield', currentPage)}
                    ${crearMenuItem('historial_vehiculos', 'Historial', 'history', currentPage)}
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
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${page}.html" class="nav-link">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
            </a>
        </li>
    `;
}

function inicializarSidebar() {
    // Marcar el elemento activo basado en la página actual
    const currentPage = obtenerPaginaActual();
    console.log('📄 Página actual:', currentPage);
    
    // Marcar el item activo en el sidebar
    const items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        item.classList.remove('active');
        const itemPage = item.getAttribute('data-page');
        if (itemPage === currentPage) {
            item.classList.add('active');
            console.log('✅ Activado:', itemPage);
        }
    });
    
    // Actualizar nombre de usuario
    actualizarNombreUsuario();
    
    // Cargar notificaciones
    cargarNotificaciones();
    
    // Asegurar que el sidebar sea visible en desktop
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && window.innerWidth > 1024) {
        sidebar.style.transform = 'translateX(0)';
    }
}

function configurarSidebarResponsive() {
    // Configurar botón hamburguesa y overlay si existen en la página
    const hamburgerBtn = document.getElementById('hamburgerMenu');
    const overlay = document.getElementById('sidebarOverlay');
    const sidebar = document.querySelector('.sidebar');
    
    if (hamburgerBtn && sidebar) {
        // Remover event listeners previos para evitar duplicados
        const newHamburger = hamburgerBtn.cloneNode(true);
        hamburgerBtn.parentNode.replaceChild(newHamburger, hamburgerBtn);
        
        newHamburger.addEventListener('click', function(e) {
            e.preventDefault();
            toggleSidebar();
        });
    }
    
    if (overlay && sidebar) {
        const newOverlay = overlay.cloneNode(true);
        overlay.parentNode.replaceChild(newOverlay, overlay);
        
        newOverlay.addEventListener('click', function() {
            closeSidebar();
        });
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerMenu');
    const body = document.body;
    
    if (!sidebar) return;
    
    const isOpen = sidebar.classList.contains('open');
    
    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
        if (hamburger) hamburger.classList.add('active');
        body.classList.add('sidebar-open');
        
        const icon = hamburger?.querySelector('i');
        if (icon) icon.className = 'fas fa-times';
    }
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerMenu');
    const body = document.body;
    
    if (sidebar) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
        if (hamburger) hamburger.classList.remove('active');
        body.classList.remove('sidebar-open');
        
        const icon = hamburger?.querySelector('i');
        if (icon) icon.className = 'fas fa-bars';
    }
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    return filename.replace('.html', '');
}

function obtenerUsuarioActual() {
    try {
        const userStr = localStorage.getItem('furia_user');
        if (userStr) {
            const user = JSON.parse(userStr);
            return {
                nombre: user.nombre || CONFIG.defaultUserName,
                email: user.email || '',
                rol: user.rol || 'jefe_taller'
            };
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    return { nombre: CONFIG.defaultUserName, email: '', rol: 'jefe_taller' };
}

function actualizarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (!userNameSpan) return;
    
    const user = obtenerUsuarioActual();
    userNameSpan.textContent = user.nombre;
}

// =====================================================
// NOTIFICACIONES
// =====================================================

let notificaciones = [];

async function cargarNotificaciones() {
    try {
        const token = localStorage.getItem('furia_token');
        if (!token) return;
        
        const response = await fetch(`${API_BASE_URL}/api/jefe-taller/notificaciones`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.notificaciones) {
            notificaciones = data.notificaciones;
            actualizarBadgeNotificaciones();
        }
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
        // Datos de ejemplo para desarrollo
        notificaciones = [
            { id: 1, leida: false, mensaje: 'Nuevo diagnóstico pendiente de revisión', tipo: 'diagnostico' },
            { id: 2, leida: false, mensaje: 'Orden OT-250401-001 completada por técnico', tipo: 'orden' }
        ];
        actualizarBadgeNotificaciones();
    }
}

function actualizarBadgeNotificaciones() {
    const badge = document.getElementById('notificacionesCount');
    if (!badge) return;
    
    const noLeidas = notificaciones.filter(n => !n.leida).length;
    badge.textContent = noLeidas;
    badge.style.display = noLeidas > 0 ? 'flex' : 'none';
}

function mostrarNotificaciones() {
    const noLeidas = notificaciones.filter(n => !n.leida);
    
    if (noLeidas.length === 0) {
        mostrarNotificacionToast('No tienes notificaciones nuevas', 'info');
        return;
    }
    
    noLeidas.forEach(notif => {
        let tipo = 'info';
        if (notif.tipo === 'diagnostico') tipo = 'warning';
        if (notif.tipo === 'orden') tipo = 'success';
        
        mostrarNotificacionToast(notif.mensaje, tipo);
        notif.leida = true;
    });
    
    actualizarBadgeNotificaciones();
}

function mostrarNotificacionToast(mensaje, tipo = 'info') {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && document.body.contains(toast)) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(toast)) document.body.removeChild(toast);
            }, 300);
        }
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// CIERRE DE SESIÓN
// =====================================================

window.cerrarSesion = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        window.location.href = `${API_BASE_URL}/`;
    }
};

// =====================================================
// INICIALIZACIÓN
// =====================================================

// Función global para toggle sidebar (para usar desde HTML)
window.toggleSidebarGlobal = toggleSidebar;
window.closeSidebarGlobal = closeSidebar;

// Configurar evento de notificaciones después de cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const notifIcon = document.querySelector('.notification-icon');
        if (notifIcon) {
            notifIcon.addEventListener('click', mostrarNotificaciones);
        }
    }, 500);
    
    // Configurar evento para cerrar sidebar al hacer click fuera
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 1024) {
            const sidebar = document.querySelector('.sidebar');
            const hamburger = document.getElementById('hamburgerMenu');
            const overlay = document.getElementById('sidebarOverlay');
            
            if (sidebar?.classList.contains('open') && 
                !sidebar.contains(e.target) && 
                hamburger && !hamburger.contains(e.target)) {
                closeSidebar();
            }
        }
    });
    
    // Prevenir scroll del body cuando sidebar está abierto
    document.addEventListener('touchmove', function(e) {
        if (window.innerWidth <= 1024) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar?.classList.contains('open') && !sidebar.contains(e.target)) {
                e.preventDefault();
            }
        }
    });
    
    // Cerrar sidebar al redimensionar a desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 1024) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar?.classList.contains('open')) {
                closeSidebar();
            }
        }
    });
});

// Inicializar el sidebar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', includeSidebar);
} else {
    includeSidebar();
}

console.log('✅ include.js cargado correctamente - Versión corregida');