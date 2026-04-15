// =====================================================
// INCLUDE.JS - SIDEBAR PARA JEFE DE TALLER
// =====================================================

// Configuración
const CONFIG = {
    sidebarPath: 'components/sidebar.html',
    logoPath: '../img/logoblanco.jpeg',
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
        sidebarContainer.innerHTML = html;
        console.log('✅ Sidebar cargado correctamente');
        
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
                    <i class="fas fa-user-cog"></i>
                </div>
                <div class="user-info">
                    <span class="user-name" id="userName">${user.nombre}</span>
                    <span class="user-role">${CONFIG.userRole}</span>
                </div>
            </div>
            <nav class="sidebar-nav">
                <ul>
                    ${crearMenuItem('dashboard', 'Dashboard Técnico', 'chart-line', currentPage, '')}
                    ${crearMenuItem('orden_trabajo', 'Órdenes de Trabajo', 'clipboard-list', currentPage, '')}
                    ${crearMenuItem('calendario_bahias', 'Calendario y Bahías', 'calendar-alt', currentPage, '')}
                    ${crearMenuItem('historial_vehiculos', 'Historial', 'history', currentPage, '')}
                    ${crearMenuItem('perfil', 'Perfil', 'user-circle', currentPage, '')}
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

function crearMenuItem(page, label, icon, currentPage, badge) {
    const isActive = currentPage === page ? 'active' : '';
    const badgeHtml = badge ? `<span class="badge">${badge}</span>` : '';
    
    return `
        <li class="nav-item ${isActive}" data-page="${page}">
            <a href="${page}.html" class="nav-link">
                <i class="fas fa-${icon}"></i>
                <span>${label}</span>
                ${badgeHtml}
            </a>
        </li>
    `;
}

function inicializarSidebar() {
    setTimeout(() => {
        const currentPage = obtenerPaginaActual();
        console.log('📄 Página actual:', currentPage);
        marcarItemActivo(currentPage);
        actualizarNombreUsuario();
        cargarNotificaciones();
    }, 100);
}

function obtenerPaginaActual() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    let pageName = filename.replace('.html', '');
    
    // Mapear nombres de archivo a los data-page
    const pageMapping = {
        'dashboard': 'dashboard',
        'orden_trabajo': 'orden_trabajo',
        'calendario_bahias': 'calendario_bahias',
        'diagnosticos': 'diagnosticos',
        'control_calidad': 'control_calidad',
        'historial_vehiculos': 'historial_vehiculos',
        'perfil': 'perfil'
    };
    
    return pageMapping[pageName] || pageName;
}

function marcarItemActivo(currentPage) {
    const items = document.querySelectorAll('.nav-item');
    console.log('🔍 Items encontrados:', items.length);
    
    items.forEach(item => {
        item.classList.remove('active');
        const itemPage = item.getAttribute('data-page');
        if (itemPage === currentPage) {
            item.classList.add('active');
            console.log('✅ Activado:', itemPage);
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
                rol: user.rol || 'jefe_taller'
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

// =====================================================
// NOTIFICACIONES
// =====================================================

let notificaciones = [];
let notificacionesInterval = null;

async function cargarNotificaciones() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/notificaciones`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.notificaciones) {
            notificaciones = data.notificaciones;
            actualizarBadgeNotificaciones();
        }
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
        // Datos de ejemplo mientras no hay backend
        notificaciones = [
            { id: 1, leida: false, mensaje: 'Nuevo diagnóstico pendiente de revisión', tipo: 'diagnostico' },
            { id: 2, leida: false, mensaje: 'Orden OT-250401-001 completada por técnico', tipo: 'orden' },
            { id: 3, leida: true, mensaje: 'Bahía 3 liberada', tipo: 'bahia' }
        ];
        actualizarBadgeNotificaciones();
    }
}

function actualizarBadgeNotificaciones() {
    const badge = document.getElementById('notificacionesCount');
    if (!badge) return;
    
    const noLeidas = notificaciones.filter(n => !n.leida).length;
    badge.textContent = noLeidas;
    
    if (noLeidas > 0) {
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function mostrarNotificaciones() {
    const noLeidas = notificaciones.filter(n => !n.leida);
    
    if (noLeidas.length === 0) {
        mostrarNotificacionToast('No tienes notificaciones nuevas', 'info');
        return;
    }
    
    noLeidas.forEach(notif => {
        let mensaje = notif.mensaje;
        let tipo = 'info';
        
        if (notif.tipo === 'diagnostico') {
            tipo = 'warning';
        } else if (notif.tipo === 'orden') {
            tipo = 'success';
        }
        
        mostrarNotificacionToast(mensaje, tipo);
        
        // Marcar como leída (simulado)
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
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
        }
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Configurar evento de notificaciones
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const notifIcon = document.querySelector('.notification-icon');
        if (notifIcon) {
            notifIcon.addEventListener('click', mostrarNotificaciones);
        }
    }, 500);
});

// Cerrar sesión
window.cerrarSesion = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        window.location.href = '/';
    }
};

// Inicializar
document.addEventListener('DOMContentLoaded', includeSidebar);