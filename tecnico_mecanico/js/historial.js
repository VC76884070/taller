// =====================================================
// HISTORIAL DE TRABAJOS - TÉCNICO MECÁNICO (OPTIMIZADO)
// SOLO ÚLTIMOS 10 TRABAJOS
// VERSIÓN CORREGIDA CON URL DINÁMICA PARA PRODUCCIÓN
// =====================================================

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
        const response = await fetch(`${API_BASE_URL}/api/verify-token`, {
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
        
        const response = await fetch(`${API_BASE_URL}/tecnico/api/historial`, {
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
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
    }
    
    if (paginationContainer) paginationContainer.style.display = 'flex';
    if (paginacionInfo) paginacionInfo.textContent = `Mostrando ${trabajosFiltrados.length} de ${trabajos.length} trabajos`;
    
    const inicio = (paginaActual - 1) * itemsPorPagina + 1;
    const fin = Math.min(paginaActual * itemsPorPagina, trabajosFiltrados.length);
    if (paginasInfo) paginasInfo.textContent = `Página ${paginaActual} de ${totalPaginas} (${inicio}-${fin})`;
    
    if (btnAnterior) btnAnterior.disabled = paginaActual <= 1;
    if (btnSiguiente) btnSiguiente.disabled = paginaActual >= totalPaginas;
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
// DETALLE DEL TRABAJO
// =====================================================

async function verDetalle(id) {
    try {
        showToast('Cargando detalles...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/tecnico/api/historial/${id}`, {
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
    
    // Servicios HTML
    let serviciosHtml = '';
    if (detalle.servicios && detalle.servicios.length > 0) {
        serviciosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-tools"></i> Servicios Realizados</h4>
                <div class="servicios-listado">
                    ${detalle.servicios.map(s => `
                        <div class="servicio-realizado">
                            <i class="fas fa-wrench"></i>
                            <span>${escapeHtml(s)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Fotos HTML
    let fotosHtml = '';
    if (detalle.fotos && detalle.fotos.length > 0) {
        fotosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-camera"></i> Fotos del Trabajo</h4>
                <div class="fotos-grid-detalle">
                    ${detalle.fotos.map(foto => `
                        <div class="foto-item" onclick="verImagenAmpliada('${foto.url}', 'Foto de ${detalle.codigo_unico}')">
                            <img src="${foto.url}" alt="Foto del trabajo">
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Estado del diagnóstico
    let diagnosticoHtml = '';
    if (detalle.diagnostico) {
        let estadoBadge = '';
        switch (detalle.diagnostico.estado) {
            case 'aprobado':
                estadoBadge = '<span class="diagnostico-aprobado"><i class="fas fa-check-circle"></i> Aprobado</span>';
                break;
            case 'rechazado':
                estadoBadge = '<span class="diagnostico-rechazado"><i class="fas fa-times-circle"></i> Rechazado</span>';
                break;
            default:
                estadoBadge = '<span class="diagnostico-pendiente"><i class="fas fa-clock"></i> Pendiente</span>';
        }
        
        diagnosticoHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-stethoscope"></i> Diagnóstico</h4>
                <div class="diagnostico-info">
                    <div class="diagnostico-estado">${estadoBadge}</div>
                    ${detalle.diagnostico.informe ? `
                        <div class="diagnostico-informe">
                            <strong>Informe:</strong>
                            <p>${escapeHtml(detalle.diagnostico.informe)}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    body.innerHTML = `
        <div class="detalle-container">
            <div class="detalle-header">
                <div class="detalle-titulo">
                    <i class="fas fa-clipboard-list"></i>
                    <h3>Orden: ${escapeHtml(detalle.codigo_unico)}</h3>
                </div>
                <span class="estado-badge estado-${detalle.estado_global}">
                    ${detalle.estado_global || 'En Recepción'}
                </span>
            </div>
            
            <div class="detalle-info-grid">
                <div class="info-card">
                    <i class="fas fa-user"></i>
                    <div>
                        <label>Cliente</label>
                        <p>${escapeHtml(detalle.cliente_nombre || 'N/A')}</p>
                    </div>
                </div>
                <div class="info-card">
                    <i class="fas fa-car"></i>
                    <div>
                        <label>Vehículo</label>
                        <p>${escapeHtml(detalle.marca || '')} ${escapeHtml(detalle.modelo || '')}</p>
                    </div>
                </div>
                <div class="info-card">
                    <i class="fas fa-id-card"></i>
                    <div>
                        <label>Placa</label>
                        <p>${escapeHtml(detalle.placa || 'N/A')}</p>
                    </div>
                </div>
                <div class="info-card">
                    <i class="fas fa-calendar-alt"></i>
                    <div>
                        <label>Fecha Ingreso</label>
                        <p>${formatFecha(detalle.fecha_ingreso)}</p>
                    </div>
                </div>
                ${detalle.fecha_entrega ? `
                    <div class="info-card">
                        <i class="fas fa-check-circle"></i>
                        <div>
                            <label>Fecha Entrega</label>
                            <p>${formatFecha(detalle.fecha_entrega)}</p>
                        </div>
                    </div>
                ` : ''}
            </div>
            
            ${diagnosticoHtml}
            ${serviciosHtml}
            ${fotosHtml}
        </div>
    `;
    
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
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Detalle Trabajo - ${detalle.codigo_unico}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
            h1 { color: #333; border-bottom: 2px solid #e63946; padding-bottom: 10px; }
            h2 { color: #555; margin-top: 25px; }
            .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
            .info-item { background: #f5f5f5; padding: 10px; border-radius: 8px; }
            .info-item label { font-weight: bold; display: block; margin-bottom: 5px; }
            .servicio { background: #e8f4f8; padding: 8px; margin: 5px 0; border-radius: 5px; }
            .foto { margin: 10px; max-width: 300px; }
            .foto img { width: 100%; border-radius: 8px; }
            .estado { display: inline-block; padding: 5px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .estado-Finalizado { background: #d4edda; color: #155724; }
            .estado-EnProceso { background: #cfe2ff; color: #084298; }
        </style>
    </head>
    <body>
        <h1><i class="fas fa-clipboard-list"></i> Detalle Trabajo - ${escapeHtml(detalle.codigo_unico)}</h1>
        <div class="info-grid">
            <div class="info-item"><label>Cliente</label>${escapeHtml(detalle.cliente_nombre || 'N/A')}</div>
            <div class="info-item"><label>Vehículo</label>${escapeHtml(detalle.marca || '')} ${escapeHtml(detalle.modelo || '')}</div>
            <div class="info-item"><label>Placa</label>${escapeHtml(detalle.placa || 'N/A')}</div>
            <div class="info-item"><label>Fecha Ingreso</label>${formatFecha(detalle.fecha_ingreso)}</div>
            <div class="info-item"><label>Estado</label><span class="estado estado-${detalle.estado_global}">${detalle.estado_global || 'En Recepción'}</span></div>
        </div>
        
        ${detalle.diagnostico && detalle.diagnostico.informe ? `
            <h2>Diagnóstico</h2>
            <div class="info-item"><label>Informe</label><p>${escapeHtml(detalle.diagnostico.informe)}</p></div>
        ` : ''}
        
        ${detalle.servicios && detalle.servicios.length > 0 ? `
            <h2>Servicios Realizados</h2>
            ${detalle.servicios.map(s => `<div class="servicio">✓ ${escapeHtml(s)}</div>`).join('')}
        ` : ''}
        
        ${detalle.fotos && detalle.fotos.length > 0 ? `
            <h2>Fotos del Trabajo</h2>
            <div style="display: flex; flex-wrap: wrap;">
                ${detalle.fotos.map(foto => `<div class="foto"><img src="${foto.url}" alt="Foto trabajo"></div>`).join('')}
            </div>
        ` : ''}
        
        <p style="margin-top: 40px; color: #888;">Documento generado el ${new Date().toLocaleString()}</p>
    </body>
    </html>`;
}

function verImagenAmpliada(url, titulo) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
    `;
    modal.innerHTML = `
        <div style="position: relative; max-width: 90%; max-height: 90%;">
            <button style="position: absolute; top: -40px; right: 0; background: none; border: none; color: white; font-size: 30px; cursor: pointer;">&times;</button>
            <img src="${url}" alt="${titulo}" style="max-width: 100%; max-height: 80vh; border-radius: 8px;">
            <p style="color: white; text-align: center; margin-top: 10px;">${titulo}</p>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
    modal.querySelector('button').addEventListener('click', () => modal.remove());
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
    
    console.log('📡 API_BASE_URL:', API_BASE_URL);
    
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
            const response = await fetch(`${API_BASE_URL}/tecnico_mecanico/components/sidebar.html`);
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
    
    console.log('✅ historial.js cargado correctamente');
});