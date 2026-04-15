// =====================================================
// HISTORIAL DE TRABAJOS - TÉCNICO MECÁNICO
// FURIA MOTOR COMPANY SRL
// =====================================================

let token = null;
let trabajos = [];
let trabajosFiltrados = [];
let paginaActual = 1;
let itemsPorPagina = 10;
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
// CARGAR HISTORIAL
// =====================================================

async function cargarHistorial() {
    try {
        showToast('Cargando historial...', 'info');
        
        const response = await fetch('/tecnico/api/historial', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            trabajos = data.trabajos;
            aplicarFiltros();
            actualizarEstadisticas();
            showToast(`${trabajos.length} trabajos encontrados`, 'success');
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
// FILTRADO
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
    paginacionInfo.textContent = `Mostrando ${trabajosFiltrados.length} trabajos`;
    
    const inicio = (paginaActual - 1) * itemsPorPagina + 1;
    const fin = Math.min(paginaActual * itemsPorPagina, trabajosFiltrados.length);
    paginasInfo.textContent = `Página ${paginaActual} de ${totalPaginas} (${inicio}-${fin} de ${trabajosFiltrados.length})`;
    
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
// DETALLE DEL TRABAJO
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
    
    console.log('Detalle completo:', detalle);
    
    // Separar fotos por tipo
    const fotosRecepcion = (detalle.fotos || []).filter(f => f.tipo === 'recepcion');
    const fotosDiagnostico = (detalle.fotos || []).filter(f => f.tipo === 'diagnostico');
    
    // Generar HTML de fotos de recepción
    let fotosRecepcionHtml = '';
    if (fotosRecepcion.length > 0) {
        fotosRecepcionHtml = `
            <div class="fotos-seccion">
                <h5><i class="fas fa-clipboard-list"></i> Fotos de Recepción</h5>
                <div class="detalle-fotos">
                    ${fotosRecepcion.map((foto, idx) => `
                        <div class="detalle-foto" onclick="verImagenAmpliada('${foto.url_foto}', '${foto.descripcion}')">
                            <img src="${foto.url_foto}" alt="${foto.descripcion}" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                            <div class="detalle-foto-label">${foto.descripcion}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Generar HTML de fotos de diagnóstico
    let fotosDiagnosticoHtml = '';
    if (fotosDiagnostico.length > 0) {
        fotosDiagnosticoHtml = `
            <div class="fotos-seccion">
                <h5><i class="fas fa-stethoscope"></i> Fotos del Diagnóstico</h5>
                <div class="detalle-fotos">
                    ${fotosDiagnostico.map((foto, idx) => `
                        <div class="detalle-foto" onclick="verImagenAmpliada('${foto.url_foto}', '${foto.descripcion}')">
                            <img src="${foto.url_foto}" alt="${foto.descripcion}" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                            <div class="detalle-foto-label">${foto.descripcion}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    let fotosHtml = '';
    if (fotosRecepcionHtml || fotosDiagnosticoHtml) {
        fotosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-camera"></i> Evidencia Fotográfica</h4>
                ${fotosRecepcionHtml}
                ${fotosDiagnosticoHtml}
            </div>
        `;
    } else {
        fotosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-camera"></i> Evidencia Fotográfica</h4>
                <p class="detalle-value" style="color: var(--gris-texto);">No se registraron fotos</p>
            </div>
        `;
    }
    
    // Generar HTML de audio de recepción (problema del cliente)
    let recepcionAudioHtml = '';
    if (detalle.recepcion_audio) {
        recepcionAudioHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-headset"></i> Problema Reportado por el Cliente</h4>
                <div class="detalle-item" style="margin-bottom: 0.8rem;">
                    <span class="detalle-label">Audio del Cliente</span>
                    <audio controls style="width: 100%; margin-top: 0.5rem; border-radius: var(--radius-md);">
                        <source src="${detalle.recepcion_audio}" type="audio/mpeg">
                        Tu navegador no soporta el elemento de audio.
                    </audio>
                </div>
                ${detalle.recepcion_transcripcion ? `
                    <div class="detalle-item">
                        <span class="detalle-label">Transcripción del Problema</span>
                        <div class="detalle-value" style="background: var(--gris-oscuro); padding: 0.8rem; border-radius: var(--radius-md); margin-top: 0.3rem;">
                            ${escapeHtml(detalle.recepcion_transcripcion)}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    // Generar HTML de servicios
    let serviciosHtml = '';
    if (detalle.servicios && detalle.servicios.length > 0) {
        serviciosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-tools"></i> Servicios Realizados / Recomendados</h4>
                <div class="detalle-servicios">
                    ${detalle.servicios.map(s => `<span class="servicio-tag">${escapeHtml(s)}</span>`).join('')}
                </div>
            </div>
        `;
    } else {
        serviciosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-tools"></i> Servicios Realizados / Recomendados</h4>
                <p class="detalle-value" style="color: var(--gris-texto);">No se registraron servicios</p>
            </div>
        `;
    }
    
    // Generar HTML de diagnóstico técnico
    let diagnosticoHtml = '';
    if (detalle.diagnostico) {
        diagnosticoHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-stethoscope"></i> Diagnóstico Técnico</h4>
                <div class="detalle-item">
                    <span class="detalle-label">Estado del Diagnóstico</span>
                    <span class="detalle-value">
                        <span class="estado-badge estado-${detalle.diagnostico.estado || 'pendiente'}">
                            ${detalle.diagnostico.estado === 'aprobado' ? '✅ Aprobado' : 
                              detalle.diagnostico.estado === 'rechazado' ? '❌ Rechazado' : 
                              detalle.diagnostico.estado === 'pendiente' ? '⏳ Pendiente' : '📝 Borrador'}
                        </span>
                    </span>
                </div>
                <div class="detalle-item" style="margin-top: 0.8rem;">
                    <span class="detalle-label">Transcripción del Diagnóstico</span>
                    <div class="detalle-value" style="background: var(--gris-oscuro); padding: 0.8rem; border-radius: var(--radius-md); margin-top: 0.3rem;">
                        ${escapeHtml(detalle.diagnostico.transcripcion_informe || 'No hay transcripción disponible')}
                    </div>
                </div>
                ${detalle.diagnostico.url_grabacion_informe ? `
                    <div class="detalle-item" style="margin-top: 0.8rem;">
                        <span class="detalle-label">Audio del Diagnóstico</span>
                        <audio controls style="width: 100%; margin-top: 0.5rem; border-radius: var(--radius-md);">
                            <source src="${detalle.diagnostico.url_grabacion_informe}" type="audio/mpeg">
                            Tu navegador no soporta el elemento de audio.
                        </audio>
                    </div>
                ` : ''}
                ${detalle.diagnostico.fecha_envio ? `
                    <div class="detalle-item" style="margin-top: 0.8rem;">
                        <span class="detalle-label">Fecha de Envío</span>
                        <span class="detalle-value">${formatFecha(detalle.diagnostico.fecha_envio)}</span>
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        diagnosticoHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-stethoscope"></i> Diagnóstico Técnico</h4>
                <p class="detalle-value" style="color: var(--gris-texto);">No se ha registrado diagnóstico para este trabajo</p>
            </div>
        `;
    }
    
    // Generar HTML de observaciones
    let observacionesHtml = '';
    if (detalle.observaciones && detalle.observaciones.length > 0) {
        observacionesHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-comment-dots"></i> Observaciones del Jefe de Taller</h4>
                ${detalle.observaciones.map(obs => `
                    <div class="historial-item" style="margin-bottom: 0.8rem;">
                        <div class="historial-header">
                            <span class="historial-version">
                                <i class="fas fa-user-check"></i> Revisión
                            </span>
                            <span class="historial-fecha">${formatFecha(obs.fecha_hora)}</span>
                        </div>
                        <div class="historial-informe">${escapeHtml(obs.observacion)}</div>
                        ${obs.transcripcion_obs ? `<div class="historial-transcripcion"><i class="fas fa-microphone-alt"></i> ${escapeHtml(obs.transcripcion_obs)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    body.innerHTML = `
        <div class="detalle-recepcion">
            <!-- Información General -->
            <div class="detalle-seccion">
                <h4><i class="fas fa-info-circle"></i> Información General</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Código de Trabajo</span>
                        <span class="detalle-value"><strong>${escapeHtml(detalle.codigo_unico || 'N/A')}</strong></span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Estado</span>
                        <span class="detalle-value">
                            <span class="trabajo-estado estado-${detalle.estado_global}">
                                <i class="fas ${getEstadoIcono(detalle.estado_global)}"></i> ${detalle.estado_global || 'En Recepción'}
                            </span>
                        </span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Fecha de Ingreso</span>
                        <span class="detalle-value">${formatFecha(detalle.fecha_ingreso)}</span>
                    </div>
                    ${detalle.fecha_salida ? `
                        <div class="detalle-item">
                            <span class="detalle-label">Fecha de Entrega</span>
                            <span class="detalle-value">${formatFecha(detalle.fecha_salida)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Datos del Cliente -->
            <div class="detalle-seccion">
                <h4><i class="fas fa-user"></i> Datos del Cliente</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Nombre Completo</span>
                        <span class="detalle-value">${escapeHtml(detalle.cliente_nombre || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Teléfono de Contacto</span>
                        <span class="detalle-value">${escapeHtml(detalle.cliente_telefono || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Ubicación</span>
                        <span class="detalle-value">${escapeHtml(detalle.cliente_ubicacion || 'N/A')}</span>
                    </div>
                </div>
            </div>
            
            <!-- Datos del Vehículo -->
            <div class="detalle-seccion">
                <h4><i class="fas fa-car"></i> Datos del Vehículo</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Placa</span>
                        <span class="detalle-value"><strong>${escapeHtml(detalle.placa || 'N/A')}</strong></span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Marca / Modelo</span>
                        <span class="detalle-value">${escapeHtml(detalle.marca || '')} ${escapeHtml(detalle.modelo || '')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Año de Fabricación</span>
                        <span class="detalle-value">${detalle.anio || 'N/A'}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Kilometraje Actual</span>
                        <span class="detalle-value">${detalle.kilometraje?.toLocaleString() || '0'} km</span>
                    </div>
                </div>
            </div>
            
            ${recepcionAudioHtml}
            ${serviciosHtml}
            ${diagnosticoHtml}
            ${observacionesHtml}
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
        <title>Trabajo ${detalle.codigo_unico}</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            h1 { color: #C1121F; border-bottom: 2px solid #C1121F; }
            .seccion { margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
            .label { font-weight: bold; color: #666; }
            .value { color: #333; }
            .fotos { display: flex; flex-wrap: wrap; gap: 10px; }
            .foto { max-width: 200px; }
            .foto img { width: 100%; }
        </style>
    </head>
    <body>
        <h1>FURIA MOTOR COMPANY SRL</h1>
        <h2>Detalle de Trabajo</h2>
        <p><strong>Código:</strong> ${detalle.codigo_unico}</p>
        <p><strong>Fecha:</strong> ${formatFecha(detalle.fecha_ingreso)}</p>
        
        <div class="seccion">
            <h3>Cliente</h3>
            <p><strong>Nombre:</strong> ${detalle.cliente_nombre || 'N/A'}</p>
            <p><strong>Teléfono:</strong> ${detalle.cliente_telefono || 'N/A'}</p>
        </div>
        
        <div class="seccion">
            <h3>Vehículo</h3>
            <p><strong>Placa:</strong> ${detalle.placa || 'N/A'}</p>
            <p><strong>Marca/Modelo:</strong> ${detalle.marca || ''} ${detalle.modelo || ''}</p>
            <p><strong>Kilometraje:</strong> ${detalle.kilometraje?.toLocaleString() || '0'} km</p>
        </div>
        
        <div class="seccion">
            <h3>Servicios Realizados</h3>
            <ul>
                ${(detalle.servicios || []).map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>
        
        <div class="seccion">
            <h3>Diagnóstico</h3>
            <p>${detalle.diagnostico?.transcripcion_informe || 'No disponible'}</p>
        </div>
        
        <div class="seccion">
            <h3>Evidencia Fotográfica</h3>
            <div class="fotos">
                ${(detalle.fotos || []).map(foto => `
                    <div class="foto">
                        <img src="${foto.url_foto}" alt="Foto">
                    </div>
                `).join('')}
            </div>
        </div>
    </body>
    </html>`;
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