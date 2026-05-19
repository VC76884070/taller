// =====================================================
// HISTORIAL DE TRABAJOS - TÉCNICO MECÁNICO (OPTIMIZADO)
// SOLO ÚLTIMOS 10 TRABAJOS
// =====================================================

let token = null;
let trabajos = [];
let trabajosFiltrados = [];
let paginaActual = 1;
let itemsPorPagina = 5; // Mostrar 5 por página para mejor UX
let trabajoSeleccionado = null;

// =====================================================
// UTILIDADES
// =====================================================

function getToken() {
    const localToken = localStorage.getItem('furia_token');
    if (localToken) return localToken;
    const fallbackToken = localStorage.getItem('token');
    if (fallbackToken) return fallbackToken;
    return null;
}

function mostrarFechaActual() {
    const fechaSpan = document.getElementById('currentDate');
    if (fechaSpan) {
        const hoy = new Date();
        const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
        fechaSpan.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function formatFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const fecha = new Date(fechaStr);
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// VERIFICACIÓN DE AUTENTICACIÓN
// =====================================================

async function verificarToken() {
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const response = await fetch('/api/verify-token', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.valid) {
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            window.location.href = '/';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error verificando token:', error);
        window.location.href = '/';
        return false;
    }
}

// =====================================================
// CARGAR HISTORIAL (SOLO ÚLTIMOS 10)
// =====================================================

async function cargarHistorial() {
    try {
        showToast('Cargando últimos trabajos...', 'info');
        
        const response = await fetch('/tecnico/api/historial', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            trabajos = data.trabajos;
            trabajosFiltrados = [...trabajos];
            renderizarTrabajos();
            actualizarEstadisticas();
            actualizarPaginacion();
            showToast(`${trabajos.length} trabajos encontrados (últimos 10)`, 'success');
        } else {
            showToast(data.error || 'Error al cargar historial', 'error');
        }
    } catch (error) {
        console.error('Error cargando historial:', error);
        showToast('Error al cargar historial', 'error');
        
        const trabajosList = document.getElementById('trabajosList');
        if (trabajosList) {
            trabajosList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar el historial</p>
                </div>
            `;
        }
    }
}

// =====================================================
// FILTRADO (SOLO SOBRE LOS 10 TRABAJOS)
// =====================================================

function aplicarFiltros() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const fechaDesde = document.getElementById('fechaDesde')?.value;
    const fechaHasta = document.getElementById('fechaHasta')?.value;
    const estadoFiltro = document.getElementById('estadoFiltro')?.value || 'todos';
    
    trabajosFiltrados = trabajos.filter(trabajo => {
        // Búsqueda por texto
        if (searchTerm) {
            const textoBusqueda = `${trabajo.codigo_unico} ${trabajo.placa} ${trabajo.marca} ${trabajo.modelo} ${trabajo.cliente_nombre}`.toLowerCase();
            if (!textoBusqueda.includes(searchTerm)) return false;
        }
        
        // Filtro por estado
        if (estadoFiltro !== 'todos' && trabajo.estado_global !== estadoFiltro) return false;
        
        // Filtro por fecha
        if (fechaDesde) {
            const fechaTrabajo = new Date(trabajo.fecha_ingreso);
            const fechaDesdeDate = new Date(fechaDesde);
            if (fechaTrabajo < fechaDesdeDate) return false;
        }
        
        if (fechaHasta) {
            const fechaTrabajo = new Date(trabajo.fecha_ingreso);
            const fechaHastaDate = new Date(fechaHasta);
            fechaHastaDate.setHours(23, 59, 59);
            if (fechaTrabajo > fechaHastaDate) return false;
        }
        
        return true;
    });
    
    paginaActual = 1;
    renderizarTrabajos();
    actualizarPaginacion();
}

function limpiarFiltros() {
    document.getElementById('searchInput').value = '';
    document.getElementById('fechaDesde').value = '';
    document.getElementById('fechaHasta').value = '';
    document.getElementById('estadoFiltro').value = 'todos';
    aplicarFiltros();
}

// =====================================================
// RENDERIZADO
// =====================================================

function renderizarTrabajos() {
    const container = document.getElementById('trabajosList');
    if (!container) return;
    
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const trabajosPagina = trabajosFiltrados.slice(inicio, fin);
    
    if (trabajosPagina.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>No hay trabajos para mostrar</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = trabajosPagina.map(trabajo => `
        <div class="trabajo-card" onclick="verDetalle(${trabajo.id})">
            <div class="trabajo-header">
                <span class="trabajo-codigo"><i class="fas fa-hashtag"></i> ${escapeHtml(trabajo.codigo_unico)}</span>
                <span class="trabajo-estado estado-${trabajo.estado_global}">
                    <i class="fas ${getEstadoIcono(trabajo.estado_global)}"></i> ${trabajo.estado_global || 'En Recepción'}
                </span>
                <span class="trabajo-fecha">
                    <i class="far fa-calendar-alt"></i> ${formatFecha(trabajo.fecha_ingreso)}
                </span>
            </div>
            <div class="trabajo-info">
                <div class="info-item">
                    <i class="fas fa-user"></i> Cliente: <strong>${escapeHtml(trabajo.cliente_nombre || 'N/A')}</strong>
                </div>
                <div class="info-item">
                    <i class="fas fa-car"></i> Vehículo: <strong>${escapeHtml(trabajo.marca || '')} ${escapeHtml(trabajo.modelo || '')}</strong>
                </div>
                <div class="info-item">
                    <i class="fas fa-id-card"></i> Placa: <strong>${escapeHtml(trabajo.placa || 'N/A')}</strong>
                </div>
            </div>
            ${trabajo.servicios && trabajo.servicios.length > 0 ? `
                <div class="trabajo-servicios">
                    ${trabajo.servicios.slice(0, 3).map(s => `<span class="servicio-tag">${escapeHtml(s)}</span>`).join('')}
                    ${trabajo.servicios.length > 3 ? `<span class="servicio-tag">+${trabajo.servicios.length - 3} más</span>` : ''}
                </div>
            ` : ''}
        </div>
    `).join('');
}

function getEstadoIcono(estado) {
    switch (estado) {
        case 'Finalizado':
        case 'Entregado':
            return 'fa-check-circle';
        case 'EnProceso':
            return 'fa-play-circle';
        case 'EnPausa':
            return 'fa-pause-circle';
        default:
            return 'fa-clock';
    }
}

function actualizarEstadisticas() {
    const total = trabajos.length;
    const finalizados = trabajos.filter(t => t.estado_global === 'Finalizado' || t.estado_global === 'Entregado').length;
    const enProceso = trabajos.filter(t => t.estado_global === 'EnProceso').length;
    const enPausa = trabajos.filter(t => t.estado_global === 'EnPausa').length;
    
    document.getElementById('totalTrabajos').textContent = total;
    document.getElementById('trabajosFinalizados').textContent = finalizados;
    document.getElementById('trabajosEnProceso').textContent = enProceso;
    document.getElementById('trabajosEnPausa').textContent = enPausa;
}

function actualizarPaginacion() {
    const totalPaginas = Math.ceil(trabajosFiltrados.length / itemsPorPagina);
    const paginationContainer = document.getElementById('paginationContainer');
    const paginacionInfo = document.getElementById('paginacionInfo');
    const paginasInfo = document.getElementById('paginasInfo');
    const btnAnterior = document.getElementById('btnPaginaAnterior');
    const btnSiguiente = document.getElementById('btnPaginaSiguiente');
    
    if (totalPaginas <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    paginacionInfo.textContent = `Mostrando ${trabajosFiltrados.length} de ${trabajos.length} trabajos`;
    
    const inicio = (paginaActual - 1) * itemsPorPagina + 1;
    const fin = Math.min(paginaActual * itemsPorPagina, trabajosFiltrados.length);
    paginasInfo.textContent = `Página ${paginaActual} de ${totalPaginas} (${inicio}-${fin})`;
    
    btnAnterior.disabled = paginaActual <= 1;
    btnSiguiente.disabled = paginaActual >= totalPaginas;
}

function cambiarPagina(direccion) {
    const totalPaginas = Math.ceil(trabajosFiltrados.length / itemsPorPagina);
    const nuevaPagina = paginaActual + direccion;
    
    if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
        paginaActual = nuevaPagina;
        renderizarTrabajos();
        actualizarPaginacion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// =====================================================
// DETALLE DEL TRABAJO (SIN CAMBIOS)
// =====================================================

async function verDetalle(id) {
    try {
        showToast('Cargando detalles...', 'info');
        
        const response = await fetch(`/tecnico/api/historial/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            trabajoSeleccionado = data.detalle;
            mostrarModalDetalle(data.detalle);
        } else {
            showToast(data.error || 'Error al cargar detalles', 'error');
        }
    } catch (error) {
        console.error('Error cargando detalle:', error);
        showToast('Error al cargar detalles', 'error');
    }
}

function mostrarModalDetalle(detalle) {
    const modal = document.getElementById('modalDetalle');
    const body = document.getElementById('detalleBody');
    
    if (!modal || !body) return;
    
    // Las funciones de renderizado se mantienen igual
    // ... (mantener el mismo código de renderizado del modal)
    
    modal.classList.add('show');
}

function cerrarModalDetalle() {
    const modal = document.getElementById('modalDetalle');
    if (modal) modal.classList.remove('show');
    trabajoSeleccionado = null;
}

function exportarDetalle() {
    if (!trabajoSeleccionado) {
        showToast('No hay detalle para exportar', 'warning');
        return;
    }
    
    const contenido = generarHTMLExportacion(trabajoSeleccionado);
    const blob = new Blob([contenido], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Trabajo_${trabajoSeleccionado.codigo_unico}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exportación completada', 'success');
}

function generarHTMLExportacion(detalle) {
    // Mantener la misma función de exportación
    return `<!DOCTYPE html>...`; // (mismo código)
}

function verImagenAmpliada(url, titulo) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.innerHTML = `
        <div class="modal-imagen-content">
            <button class="modal-imagen-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            <img src="${url}" alt="${titulo}">
            <p>${titulo}</p>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

// =====================================================
// CIERRE DE SESIÓN
// =====================================================

function cerrarSesion() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    token = getToken();
    
    if (!token) {
        window.location.href = '/';
        return;
    }
    
    const tokenValido = await verificarToken();
    if (!tokenValido) return;
    
    mostrarFechaActual();
    await cargarHistorial();
    
    // Event Listeners
    const searchInput = document.getElementById('searchInput');
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    const estadoFiltro = document.getElementById('estadoFiltro');
    const btnLimpiar = document.getElementById('btnLimpiarFiltros');
    const btnAnterior = document.getElementById('btnPaginaAnterior');
    const btnSiguiente = document.getElementById('btnPaginaSiguiente');
    
    if (searchInput) searchInput.addEventListener('input', aplicarFiltros);
    if (fechaDesde) fechaDesde.addEventListener('change', aplicarFiltros);
    if (fechaHasta) fechaHasta.addEventListener('change', aplicarFiltros);
    if (estadoFiltro) estadoFiltro.addEventListener('change', aplicarFiltros);
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);
    if (btnAnterior) btnAnterior.addEventListener('click', () => cambiarPagina(-1));
    if (btnSiguiente) btnSiguiente.addEventListener('click', () => cambiarPagina(1));
    
    // Cargar sidebar
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        try {
            const response = await fetch('/tecnico_mecanico/components/sidebar.html');
            if (response.ok) {
                sidebarContainer.innerHTML = await response.text();
            }
        } catch (error) {
            console.error('Error cargando sidebar:', error);
        }
    }
    
    // Exponer funciones globales
    window.verDetalle = verDetalle;
    window.cerrarModalDetalle = cerrarModalDetalle;
    window.exportarDetalle = exportarDetalle;
    window.cerrarSesion = cerrarSesion;
    window.verImagenAmpliada = verImagenAmpliada;
});