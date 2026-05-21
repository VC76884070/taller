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

// =====================================================
// CONTROL_CALIDAD.JS - JEFE DE TALLER
// GESTIÓN DE TRABAJOS COMPLETADOS POR TÉCNICOS
// VERSIÓN: ÚLTIMAS 10 ÓRDENES POR PESTAÑA
// =====================================================

const API_URL = API_BASE_URL + '/api/jefe-taller';
let currentUser = null;
let ordenesPendientes = [];
let ordenesFinalizadas = [];

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    if (!token) token = sessionStorage.getItem('token');
    
    if (!token) {
        console.error('No se encontró token de autenticación');
        return {};
    }
    
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr.split('T')[0];
        
        return date.toLocaleDateString('es-BO', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr.split('T')[0];
    }
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

function statusBadge(estado) {
    const map = {
        'VehiculoArmado': 'status-VehiculoArmado',
        'ReparacionCompletada': 'status-ReparacionCompletada',
        'Finalizado': 'status-Finalizado',
        'Entregado': 'status-Entregado',
        'EnReparacion': 'status-EnReparacion'
    };
    
    const texto = {
        'VehiculoArmado': 'Vehículo Armado',
        'ReparacionCompletada': 'Reparación Completada',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado',
        'EnReparacion': 'En Reparación'
    };
    
    const iconos = {
        'VehiculoArmado': 'fa-check-circle',
        'ReparacionCompletada': 'fa-wrench',
        'Finalizado': 'fa-flag-checkered',
        'Entregado': 'fa-truck',
        'EnReparacion': 'fa-sync-alt'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${iconos[estado] || 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

function mostrarMensajeLimite(container, limite, total) {
    // Eliminar mensaje existente
    const existingMsg = document.querySelector('.info-message');
    if (existingMsg) existingMsg.remove();
    
    // Si hay más órdenes que el límite, mostrar mensaje
    if (total >= limite) {
        const infoMsg = document.createElement('div');
        infoMsg.className = 'info-message';
        infoMsg.innerHTML = `
            <i class="fas fa-info-circle"></i>
            <span>Mostrando las <strong>últimas ${limite} órdenes</strong> más recientes. 
            Utiliza los filtros para refinar la búsqueda.</span>
        `;
        
        const containerParent = container.parentNode;
        if (containerParent && !containerParent.querySelector('.info-message')) {
            containerParent.insertBefore(infoMsg, container);
        }
    }
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarOrdenesPendientes() {
    mostrarLoading(true);
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        // Construir URL con límite de 10 órdenes
        let url = `${API_URL}/control-calidad/ordenes-pendientes?limit=10`;
        if (estado !== 'all') url += `&estado=${encodeURIComponent(estado)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        console.log('📡 Cargando órdenes pendientes:', url);
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            ordenesPendientes = data.ordenes || [];
            renderizarOrdenesPendientes();
            
            // Actualizar contador
            const badge = document.getElementById('pendientesCount');
            if (badge) {
                const totalOrdenes = data.total || ordenesPendientes.length;
                badge.textContent = totalOrdenes;
                
                // Mostrar tooltip con información
                badge.title = `Mostrando ${ordenesPendientes.length} de ${totalOrdenes} órdenes`;
            }
            
            // Mostrar mensaje de límite
            const container = document.getElementById('ordenesContainer');
            if (container) {
                mostrarMensajeLimite(container, data.limite || 10, data.total || ordenesPendientes.length);
            }
            
            console.log(`✅ Cargadas ${ordenesPendientes.length} órdenes pendientes`);
        } else {
            showToast(data.error || 'Error al cargar órdenes pendientes', 'error');
        }
    } catch (error) {
        console.error('❌ Error en cargarOrdenesPendientes:', error);
        showToast('Error de conexión al cargar órdenes pendientes', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cargarOrdenesFinalizadas() {
    mostrarLoading(true);
    try {
        const estado = document.getElementById('filtroEstadoFinalizadas')?.value || 'all';
        const search = document.getElementById('searchFinalizadasInput')?.value.toLowerCase() || '';
        
        // Construir URL con límite de 10 órdenes
        let url = `${API_URL}/control-calidad/ordenes-finalizadas?limit=10`;
        if (estado !== 'all') url += `&estado=${encodeURIComponent(estado)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        console.log('📡 Cargando órdenes finalizadas:', url);
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            ordenesFinalizadas = data.ordenes || [];
            renderizarOrdenesFinalizadas();
            
            // Mostrar mensaje de límite
            const container = document.getElementById('ordenesFinalizadasContainer');
            if (container) {
                mostrarMensajeLimite(container, data.limite || 10, data.total || ordenesFinalizadas.length);
            }
            
            console.log(`✅ Cargadas ${ordenesFinalizadas.length} órdenes finalizadas`);
        } else {
            showToast(data.error || 'Error al cargar órdenes finalizadas', 'error');
        }
    } catch (error) {
        console.error('❌ Error en cargarOrdenesFinalizadas:', error);
        showToast('Error de conexión al cargar órdenes finalizadas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZADO DE ÓRDENES
// =====================================================

function renderizarOrdenesPendientes() {
    const container = document.getElementById('ordenesContainer');
    if (!container) return;
    
    if (ordenesPendientes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>No hay trabajos pendientes de revisión</p>
                <small>Los trabajos completados por los técnicos aparecerán aquí</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ordenesPendientes.map(orden => `
        <div class="orden-card" data-orden-id="${orden.id_orden}">
            <div class="orden-header">
                <div class="orden-header-left">
                    <span class="orden-codigo">
                        <i class="fas fa-tag"></i> 
                        ${escapeHtml(orden.codigo_unico)}
                    </span>
                    <span class="orden-vehiculo">
                        <i class="fas fa-car"></i> 
                        ${escapeHtml(orden.vehiculo)}
                    </span>
                </div>
                <div class="orden-header-right">
                    ${statusBadge(orden.estado_global)}
                    <span class="orden-cliente">
                        <i class="fas fa-user"></i> 
                        ${escapeHtml(orden.cliente_nombre)}
                    </span>
                </div>
            </div>
            <div class="orden-body">
                <div class="detalle-row">
                    <span class="detalle-label">
                        <i class="fas fa-users"></i> Técnico(s):
                    </span>
                    <span class="detalle-value">${escapeHtml(orden.tecnicos_nombres || 'No asignado')}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">
                        <i class="fas fa-calendar-alt"></i> Fecha inicio:
                    </span>
                    <span class="detalle-value">${formatDate(orden.fecha_inicio)}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">
                        <i class="fas fa-calendar-check"></i> Fecha finalización:
                    </span>
                    <span class="detalle-value">${formatDate(orden.fecha_fin)}</span>
                </div>
            </div>
            <div class="orden-footer">
                <button class="action-btn view" onclick="verDetalleOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
                <button class="action-btn approve" onclick="abrirModalFinalizar(${orden.id_orden})">
                    <i class="fas fa-check-circle"></i> Aprobar y Finalizar
                </button>
                <button class="action-btn reject" onclick="abrirModalRechazar(${orden.id_orden})">
                    <i class="fas fa-tools"></i> Enviar a Revisión
                </button>
            </div>
        </div>
    `).join('');
}

function renderizarOrdenesFinalizadas() {
    const container = document.getElementById('ordenesFinalizadasContainer');
    if (!container) return;
    
    if (ordenesFinalizadas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-archive"></i>
                <p>No hay órdenes finalizadas</p>
                <small>Las órdenes aprobadas aparecerán aquí</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ordenesFinalizadas.map(orden => `
        <div class="orden-card" data-orden-id="${orden.id_orden}">
            <div class="orden-header">
                <div class="orden-header-left">
                    <span class="orden-codigo">
                        <i class="fas fa-tag"></i> 
                        ${escapeHtml(orden.codigo_unico)}
                    </span>
                    <span class="orden-vehiculo">
                        <i class="fas fa-car"></i> 
                        ${escapeHtml(orden.vehiculo)}
                    </span>
                </div>
                <div class="orden-header-right">
                    ${statusBadge(orden.estado_global)}
                    <span class="orden-cliente">
                        <i class="fas fa-user"></i> 
                        ${escapeHtml(orden.cliente_nombre)}
                    </span>
                </div>
            </div>
            <div class="orden-body">
                <div class="detalle-row">
                    <span class="detalle-label">
                        <i class="fas fa-users"></i> Técnico(s):
                    </span>
                    <span class="detalle-value">${escapeHtml(orden.tecnicos_nombres || 'No asignado')}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">
                        <i class="fas fa-calendar-check"></i> Fecha finalización:
                    </span>
                    <span class="detalle-value">${formatDate(orden.fecha_finalizacion)}</span>
                </div>
                ${orden.comentarios_aprobacion ? `
                    <div class="detalle-row">
                        <span class="detalle-label">
                            <i class="fas fa-comment"></i> Comentarios:
                        </span>
                        <span class="detalle-value">${escapeHtml(orden.comentarios_aprobacion)}</span>
                    </div>
                ` : ''}
            </div>
            <div class="orden-footer">
                <button class="action-btn view" onclick="verDetalleOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            </div>
        </div>
    `).join('');
}

// =====================================================
// VER DETALLE DE ORDEN
// =====================================================

window.verDetalleOrden = async function(ordenId) {
    mostrarLoading(true);
    try {
        console.log(`🔍 Cargando detalle de orden ${ordenId}`);
        
        const response = await fetch(`${API_URL}/control-calidad/detalle-orden/${ordenId}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.error || 'Error al cargar detalle', 'error');
            return;
        }
        
        const detalle = data.detalle;
        
        // Procesar fotos
        const fotos = detalle.recepcion?.fotos || {};
        const fotosArray = Object.entries(fotos).filter(([_, url]) => url && url !== '');
        
        const detalleHtml = `
            <div style="display: grid; gap: 1rem;">
                <!-- Información de la Orden -->
                <div class="orden-info-card">
                    <h3><i class="fas fa-clipboard-list"></i> Información de la Orden</h3>
                    <div class="detalle-grid">
                        <div><strong>Código:</strong> ${escapeHtml(detalle.orden?.codigo_unico || 'N/A')}</div>
                        <div><strong>Estado:</strong> ${statusBadge(detalle.orden?.estado_global)}</div>
                        <div><strong>Prioridad:</strong> ${escapeHtml(detalle.orden?.prioridad || 'Normal')}</div>
                        <div><strong>Fecha Ingreso:</strong> ${formatDate(detalle.orden?.fecha_ingreso)}</div>
                        <div><strong>Fecha Inicio:</strong> ${formatDate(detalle.orden?.fecha_inicio)}</div>
                        <div><strong>Fecha Fin:</strong> ${formatDate(detalle.orden?.fecha_fin)}</div>
                        <div><strong>Técnico(s):</strong> ${escapeHtml(detalle.tecnicos_nombres || 'N/A')}</div>
                        <div><strong>Kilometraje Ingreso:</strong> ${detalle.orden?.kilometraje_ingreso?.toLocaleString() || '0'} km</div>
                    </div>
                    ${detalle.orden?.comentarios ? `
                        <div style="margin-top: 0.5rem; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm);">
                            <strong><i class="fas fa-comment"></i> Comentarios adicionales:</strong><br>
                            ${escapeHtml(detalle.orden.comentarios)}
                        </div>
                    ` : ''}
                </div>
                
                <!-- Datos del Vehículo -->
                ${detalle.vehiculo ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-car"></i> Datos del Vehículo</h3>
                        <div class="detalle-grid">
                            <div><strong>Placa:</strong> ${escapeHtml(detalle.vehiculo.placa || 'No registrada')}</div>
                            <div><strong>Marca:</strong> ${escapeHtml(detalle.vehiculo.marca || 'N/A')}</div>
                            <div><strong>Modelo:</strong> ${escapeHtml(detalle.vehiculo.modelo || 'N/A')}</div>
                            <div><strong>Año:</strong> ${detalle.vehiculo.anio || 'N/A'}</div>
                            <div><strong>Color:</strong> ${escapeHtml(detalle.vehiculo.color || 'N/A')}</div>
                            <div><strong>Kilometraje:</strong> ${detalle.vehiculo.kilometraje?.toLocaleString() || '0'} km</div>
                        </div>
                    </div>
                ` : ''}
                
                <!-- Datos del Cliente -->
                ${detalle.cliente ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-user"></i> Datos del Cliente</h3>
                        <div class="detalle-grid">
                            <div><strong>Nombre:</strong> ${escapeHtml(detalle.cliente.nombre || 'No registrado')}</div>
                            <div><strong>Teléfono:</strong> ${escapeHtml(detalle.cliente.telefono || 'No registrado')}</div>
                            <div><strong>Email:</strong> ${escapeHtml(detalle.cliente.email || 'No registrado')}</div>
                            <div><strong>Dirección:</strong> ${escapeHtml(detalle.cliente.direccion || 'No registrada')}</div>
                        </div>
                    </div>
                ` : ''}
                
                <!-- Diagnóstico Técnico -->
                ${detalle.diagnostico?.informe ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-stethoscope"></i> Diagnóstico Técnico</h3>
                        <div><strong>Informe:</strong> ${escapeHtml(detalle.diagnostico.informe)}</div>
                        ${detalle.diagnostico.audio_url ? `
                            <div style="margin-top: 0.5rem;">
                                <strong>Audio:</strong><br>
                                <audio controls src="${detalle.diagnostico.audio_url}" style="max-width: 100%; margin-top: 0.5rem;"></audio>
                            </div>
                        ` : ''}
                        ${detalle.diagnostico.fecha_diagnostico ? `
                            <div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">
                                <i class="fas fa-calendar"></i> ${formatDate(detalle.diagnostico.fecha_diagnostico)}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                
                <!-- Servicios Realizados -->
                ${detalle.servicios && detalle.servicios.length > 0 ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-tools"></i> Servicios Realizados</h3>
                        ${detalle.servicios.map(s => `
                            <div class="servicio-item">
                                <div class="servicio-descripcion">
                                    <strong>${escapeHtml(s.descripcion)}</strong>
                                </div>
                                <div class="servicio-detalles">
                                    <span>Cantidad: ${s.cantidad}</span>
                                    ${s.precio ? `<span>Total: Bs. ${s.precio.toFixed(2)}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <!-- Recepción y Problema -->
                ${detalle.recepcion?.transcripcion_problema ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-clipboard-list"></i> Problema Reportado</h3>
                        <div>${escapeHtml(detalle.recepcion.transcripcion_problema)}</div>
                        ${detalle.recepcion.audio_url ? `
                            <div style="margin-top: 0.5rem;">
                                <strong>Audio de recepción:</strong><br>
                                <audio controls src="${detalle.recepcion.audio_url}" style="max-width: 100%; margin-top: 0.5rem;"></audio>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                
                <!-- Fotos del Vehículo -->
                ${fotosArray.length > 0 ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-images"></i> Fotos del Vehículo (${fotosArray.length})</h3>
                        <div class="fotos-grid">
                            ${fotosArray.map(([nombre, url]) => `
                                <div class="foto-item" onclick="verFotoAmpliada('${url}')" title="${escapeHtml(nombre)}">
                                    <img src="${url}" alt="${escapeHtml(nombre)}" loading="lazy">
                                    <div class="foto-nombre">${escapeHtml(nombre.length > 20 ? nombre.substring(0, 20) + '...' : nombre)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <!-- Historial de Cambios -->
                ${detalle.historial && detalle.historial.length > 0 ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-history"></i> Historial de Cambios</h3>
                        <div class="historial-list">
                            ${detalle.historial.map(h => `
                                <div class="historial-item">
                                    <div class="historial-fecha">${formatDate(h.fecha_cambio)}</div>
                                    <div class="historial-cambio">
                                        <span class="estado-anterior">${escapeHtml(h.estado_anterior || '?')}</span>
                                        <i class="fas fa-arrow-right"></i>
                                        <span class="estado-nuevo">${escapeHtml(h.estado_nuevo || '?')}</span>
                                    </div>
                                    ${h.comentarios ? `<div class="historial-comentario">${escapeHtml(h.comentarios)}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        const detalleBody = document.getElementById('detalleBody');
        if (detalleBody) {
            detalleBody.innerHTML = detalleHtml;
            abrirModal('modalDetalle');
        }
        
    } catch (error) {
        console.error('❌ Error en verDetalleOrden:', error);
        showToast('Error al cargar detalles de la orden', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// FUNCIONES DE FOTOS
// =====================================================

window.verFotoAmpliada = function(url) {
    const fotoModal = document.getElementById('fotoModal');
    const fotoAmpliada = document.getElementById('fotoAmpliada');
    
    if (fotoAmpliada && url) {
        fotoAmpliada.src = url;
        if (fotoModal) abrirModal('fotoModal');
    }
};

function cerrarFotoModal() {
    cerrarModal('fotoModal');
    const fotoAmpliada = document.getElementById('fotoAmpliada');
    if (fotoAmpliada) fotoAmpliada.src = '';
}

// =====================================================
// APROBAR Y FINALIZAR
// =====================================================

let currentOrdenId = null;

window.abrirModalFinalizar = async function(ordenId) {
    const orden = ordenesPendientes.find(o => o.id_orden === ordenId);
    if (!orden) {
        showToast('No se encontró la orden', 'error');
        return;
    }
    
    currentOrdenId = ordenId;
    
    const infoContainer = document.getElementById('finalizarInfo');
    if (infoContainer) {
        infoContainer.innerHTML = `
            <div class="orden-info-compact">
                <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
                <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
                <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
                <p><strong><i class="fas fa-users"></i> Técnico(s):</strong> ${escapeHtml(orden.tecnicos_nombres || 'No asignado')}</p>
                <p><strong><i class="fas fa-check-circle"></i> Estado actual:</strong> ${statusBadge(orden.estado_global)}</p>
            </div>
        `;
    }
    
    const comentariosInput = document.getElementById('comentariosFinalizar');
    if (comentariosInput) comentariosInput.value = '';
    
    abrirModal('modalFinalizar');
};

window.confirmarFinalizar = async function() {
    const comentarios = document.getElementById('comentariosFinalizar')?.value || '';
    
    if (!currentOrdenId) {
        showToast('Error: No se seleccionó ninguna orden', 'error');
        return;
    }
    
    mostrarLoading(true);
    try {
        console.log(`✅ Finalizando orden ${currentOrdenId}`);
        
        const response = await fetch(`${API_URL}/control-calidad/finalizar-orden/${currentOrdenId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comentarios: comentarios })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Orden finalizada correctamente', 'success');
            cerrarModal('modalFinalizar');
            
            // Recargar ambas listas
            await cargarOrdenesPendientes();
            await cargarOrdenesFinalizadas();
            
            currentOrdenId = null;
        } else {
            showToast(data.error || 'Error al finalizar la orden', 'error');
        }
    } catch (error) {
        console.error('❌ Error en confirmarFinalizar:', error);
        showToast('Error de conexión al finalizar la orden', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// RECHAZAR / ENVIAR A REVISIÓN
// =====================================================

window.abrirModalRechazar = async function(ordenId) {
    const orden = ordenesPendientes.find(o => o.id_orden === ordenId);
    if (!orden) {
        showToast('No se encontró la orden', 'error');
        return;
    }
    
    currentOrdenId = ordenId;
    
    const infoContainer = document.getElementById('rechazarInfo');
    if (infoContainer) {
        infoContainer.innerHTML = `
            <div class="orden-info-compact">
                <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
                <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
                <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
                <p><strong><i class="fas fa-users"></i> Técnico(s):</strong> ${escapeHtml(orden.tecnicos_nombres || 'No asignado')}</p>
                <p><strong><i class="fas fa-tools"></i> Estado actual:</strong> ${statusBadge(orden.estado_global)}</p>
            </div>
        `;
    }
    
    const instruccionesInput = document.getElementById('instruccionesRechazo');
    if (instruccionesInput) instruccionesInput.value = '';
    
    abrirModal('modalRechazar');
};

window.confirmarRechazar = async function() {
    const instrucciones = document.getElementById('instruccionesRechazo')?.value.trim();
    
    if (!instrucciones) {
        showToast('Debes escribir instrucciones para el técnico', 'warning');
        return;
    }
    
    if (!currentOrdenId) {
        showToast('Error: No se seleccionó ninguna orden', 'error');
        return;
    }
    
    mostrarLoading(true);
    try {
        console.log(`❌ Rechazando orden ${currentOrdenId}`);
        
        const response = await fetch(`${API_URL}/control-calidad/rechazar-orden/${currentOrdenId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ instrucciones: instrucciones })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Orden enviada a revisión. El técnico ha sido notificado.', 'success');
            cerrarModal('modalRechazar');
            
            // Recargar ambas listas
            await cargarOrdenesPendientes();
            await cargarOrdenesFinalizadas();
            
            currentOrdenId = null;
        } else {
            showToast(data.error || 'Error al enviar a revisión', 'error');
        }
    } catch (error) {
        console.error('❌ Error en confirmarRechazar:', error);
        showToast('Error de conexión al rechazar la orden', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// CONFIGURACIÓN DE TABS Y EVENTOS
// =====================================================

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    
    tabs.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            // Cambiar clase active en tabs
            tabs.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Cambiar contenido
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const activeTab = document.getElementById(tabId);
            if (activeTab) activeTab.classList.add('active');
            
            // Recargar datos según la pestaña activa
            if (tabId === 'tab-finalizadas') {
                cargarOrdenesFinalizadas();
            } else if (tabId === 'tab-pendientes') {
                cargarOrdenesPendientes();
            }
        });
    });
}

function setupEventListeners() {
    // Botones de actualización
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => cargarOrdenesPendientes());
    }
    
    const refreshFinalizadasBtn = document.getElementById('refreshFinalizadasBtn');
    if (refreshFinalizadasBtn) {
        refreshFinalizadasBtn.addEventListener('click', () => cargarOrdenesFinalizadas());
    }
    
    // Filtros de estado
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarOrdenesPendientes());
    }
    
    const filtroEstadoFinalizadas = document.getElementById('filtroEstadoFinalizadas');
    if (filtroEstadoFinalizadas) {
        filtroEstadoFinalizadas.addEventListener('change', () => cargarOrdenesFinalizadas());
    }
    
    // Búsquedas con debounce
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => cargarOrdenesPendientes(), 500);
        });
    }
    
    const searchFinalizadasInput = document.getElementById('searchFinalizadasInput');
    if (searchFinalizadasInput) {
        let debounceTimer;
        searchFinalizadasInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => cargarOrdenesFinalizadas(), 500);
        });
    }
    
    // Botones de confirmación de modales
    const btnConfirmarFinalizar = document.getElementById('btnConfirmarFinalizar');
    if (btnConfirmarFinalizar) {
        btnConfirmarFinalizar.addEventListener('click', confirmarFinalizar);
    }
    
    const btnConfirmarRechazar = document.getElementById('btnConfirmarRechazar');
    if (btnConfirmarRechazar) {
        btnConfirmarRechazar.addEventListener('click', confirmarRechazar);
    }
    
    // Cerrar modales al hacer clic fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // Cerrar modales con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
        }
    });
}

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        if (!token) {
            console.error('No se encontró token de autenticación');
            window.location.href = API_BASE_URL + '/';
            return null;
        }
        
        // Decodificar token JWT
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');
        
        currentUser = {
            id: payload.user?.id || payload.id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email,
            roles: payload.user?.roles || payload.roles || userData?.roles || []
        };
        
        console.log('✅ Usuario autenticado:', currentUser.nombre);
        
        // Actualizar fecha actual
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            fechaElement.innerHTML = new Date().toLocaleDateString('es-ES', options);
        }
        
        return currentUser;
    } catch (error) {
        console.error('❌ Error al cargar usuario:', error);
        window.location.href = API_BASE_URL + '/';
        return null;
    }
}

function logout() {
    console.log('🚪 Cerrando sesión...');
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = API_BASE_URL + '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

async function inicializar() {
    console.log('🚀 Inicializando Control de Calidad v2.0 - Últimas 10 órdenes');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    // Cargar datos iniciales
    await Promise.all([
        cargarOrdenesPendientes(),
        cargarOrdenesFinalizadas()
    ]);
    
    // Configurar UI
    setupTabs();
    setupEventListeners();
    
    console.log('✅ Control de Calidad inicializado correctamente');
}

// Exponer funciones globales necesarias
window.verDetalleOrden = verDetalleOrden;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarFotoModal = cerrarFotoModal;
window.abrirModalFinalizar = abrirModalFinalizar;
window.confirmarFinalizar = confirmarFinalizar;
window.abrirModalRechazar = abrirModalRechazar;
window.confirmarRechazar = confirmarRechazar;
window.cerrarModal = cerrarModal;
window.logout = logout;

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}