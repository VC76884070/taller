// Función para incluir el sidebar en todas las páginas
// Función para incluir el sidebar en todas las páginas
async function includeSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;
    
    try {
        // Usar ruta absoluta desde la raíz
        const response = await fetch('/jefe_operativo/components/sidebar.html');
        const html = await response.text();
        sidebarContainer.innerHTML = html;
        
        // Marcar el item activo según la página actual
        const currentPage = getCurrentPage();
        highlightActiveMenuItem(currentPage);
        
        // Actualizar nombre de usuario si está logueado
        updateUserName();
        
    } catch (error) {
        console.error('Error cargando sidebar:', error);
    }
}

// Obtener página actual basado en el nombre del archivo
function getCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'dashboard.html';
    return filename.replace('.html', '');
}

// Marcar el item activo en el menú
function highlightActiveMenuItem(currentPage) {
    // Remover active de todos
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Activar el item correspondiente
    const activeItem = document.querySelector(`.nav-item[data-page="${currentPage}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    } else {
        // Por defecto, activar dashboard
        const dashboardItem = document.querySelector('.nav-item[data-page="dashboard"]');
        if (dashboardItem) dashboardItem.classList.add('active');
    }
}

// Actualizar nombre de usuario en el sidebar
function updateUserName() {
    setTimeout(() => {
        const userNameSpan = document.getElementById('userName');
        if (!userNameSpan) return;
        
        const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
        if (user.nombre) {
            userNameSpan.textContent = user.nombre;
        }
    }, 100); // Pequeño delay para asegurar que el DOM se actualizó
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', includeSidebar);