// =====================================================
// CONTROL_CALIDAD.JS - JEFE OPERATIVO
// GESTIÓN DE TRABAJOS COMPLETADOS POR TÉCNICOS
// VERSIÓN COMPLETA CON FUNCIONALIDAD DE ENTREGA
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================

const API_URL = `${window.API_BASE_URL}/api/jefe-operativo/control-calidad`;
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
    
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
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
        'Entregado': 'status-Entregado'
    };
    
    const texto = {
        'VehiculoArmado': 'Vehículo Armado',
        'ReparacionCompletada': 'Reparación Completada',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado'
    };
    
    const iconos = {
        'VehiculoArmado': 'fa-check-circle',
        'ReparacionCompletada': 'fa-wrench',
        'Finalizado': 'fa-flag-checkered',
        'Entregado': 'fa-truck'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${iconos[estado] || 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarOrdenesPendientes() {
    mostrarLoading(true);
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/ordenes-pendientes`;
        if (estado !== 'all') url += `?estado=${estado}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let ordenes = data.ordenes || [];
            
            if (search) {
                ordenes = ordenes.filter(o => 
                    (o.codigo_unico || '').toLowerCase().includes(search) ||
                    (o.cliente_nombre || '').toLowerCase().includes(search) ||
                    (o.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            ordenesPendientes = ordenes;
            renderizarOrdenesPendientes();
            
            const badge = document.getElementById('pendientesCount');
            if (badge) badge.textContent = ordenesPendientes.length;
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar órdenes pendientes', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cargarOrdenesFinalizadas() {
    mostrarLoading(true);
    try {
        const estado = document.getElementById('filtroEstadoFinalizadas')?.value || 'all';
        const search = document.getElementById('searchFinalizadasInput')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/ordenes-finalizadas`;
        if (estado !== 'all') url += `?estado=${estado}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let ordenes = data.ordenes || [];
            
            if (search) {
                ordenes = ordenes.filter(o => 
                    (o.codigo_unico || '').toLowerCase().includes(search) ||
                    (o.cliente_nombre || '').toLowerCase().includes(search) ||
                    (o.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            ordenesFinalizadas = ordenes;
            renderizarOrdenesFinalizadas();
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar órdenes finalizadas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZADO
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
        <div class="orden-card">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                </div>
                <div>
                    ${statusBadge(orden.estado_global)}
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                </div>
            </div>
            <div class="orden-body">
                <div class="detalle-row">
                    <span class="detalle-label">Técnico(s):</span>
                    <span class="detalle-value">${escapeHtml(orden.tecnicos_nombres || 'No asignado')}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">Fecha inicio:</span>
                    <span class="detalle-value">${formatDate(orden.fecha_inicio)}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">Fecha finalización:</span>
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
    
    container.innerHTML = ordenesFinalizadas.map(orden => {
        const isEntregado = orden.estado_global === 'Entregado';
        
        return `
        <div class="orden-card ${isEntregado ? 'entregado-card' : ''}">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                </div>
                <div>
                    ${statusBadge(orden.estado_global)}
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                </div>
            </div>
            <div class="orden-body">
                <div class="detalle-row">
                    <span class="detalle-label">Técnico(s):</span>
                    <span class="detalle-value">${escapeHtml(orden.tecnicos_nombres || 'No asignado')}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">Fecha finalización:</span>
                    <span class="detalle-value">${formatDate(orden.fecha_finalizacion)}</span>
                </div>
                ${orden.comentarios_aprobacion ? `
                    <div class="detalle-row">
                        <span class="detalle-label">Comentarios:</span>
                        <span class="detalle-value">${escapeHtml(orden.comentarios_aprobacion)}</span>
                    </div>
                ` : ''}
            </div>
            <div class="orden-footer">
                <button class="action-btn view" onclick="verDetalleOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
                ${orden.estado_global === 'Finalizado' ? `
                    <button class="action-btn entregado" onclick="abrirModalEntregar(${orden.id_orden})">
                        <i class="fas fa-truck"></i> Marcar como Entregado
                    </button>
                ` : orden.estado_global === 'Entregado' ? `
                    <button class="action-btn entregado" disabled style="opacity:0.6; cursor:not-allowed;">
                        <i class="fas fa-check-circle"></i> Vehículo Entregado
                    </button>
                ` : ''}
            </div>
        </div>
    `}).join('');
}
// =====================================================
// FUNCIONES PROXY PARA IMÁGENES Y AUDIO
// =====================================================

async function cargarImagenProxy(url, imgElement, loaderElement = null) {
    if (!url) {
        if (imgElement) imgElement.style.display = 'none';
        if (loaderElement) loaderElement.style.display = 'none';
        return null;
    }
    
    // Mostrar loader
    if (loaderElement) loaderElement.style.display = 'flex';
    if (imgElement) {
        imgElement.style.display = 'none';
        imgElement.style.opacity = '0';
    }
    
    try {
        const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.base64) {
            // Pre-cargar la imagen antes de mostrarla
            const nuevaImg = new Image();
            return new Promise((resolve) => {
                nuevaImg.onload = function() {
                    if (imgElement) {
                        imgElement.src = data.base64;
                        imgElement.style.display = 'block';
                        imgElement.style.opacity = '1';
                    }
                    if (loaderElement) loaderElement.style.display = 'none';
                    resolve(data.base64);
                };
                nuevaImg.onerror = function() {
                    if (loaderElement) {
                        loaderElement.innerHTML = '<i class="fas fa-image" style="color: var(--texto-muted);"></i>';
                        loaderElement.style.display = 'flex';
                    }
                    if (imgElement) imgElement.style.display = 'none';
                    resolve(null);
                };
                nuevaImg.src = data.base64;
            });
        } else {
            if (loaderElement) {
                loaderElement.innerHTML = '<i class="fas fa-image" style="color: var(--texto-muted);"></i>';
                loaderElement.style.display = 'flex';
            }
            if (imgElement) imgElement.style.display = 'none';
            console.warn('No se pudo cargar la imagen:', data.error);
            return null;
        }
    } catch (error) {
        console.error('Error cargando imagen:', error);
        if (loaderElement) {
            loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>';
            loaderElement.style.display = 'flex';
        }
        if (imgElement) imgElement.style.display = 'none';
        return null;
    }
}

// =====================================================
// VER FOTO AMPLIADA CON PROXY
// =====================================================

window.verFotoAmpliadaProxy = async function(url) {
    if (!url) return;
    
    const modalImg = document.getElementById('fotoAmpliada');
    const loader = document.getElementById('fotoModalLoader');
    const modal = document.getElementById('fotoModal');
    
    if (!modalImg) return;
    
    // Mostrar loader
    if (loader) loader.style.display = 'flex';
    modalImg.style.display = 'none';
    modalImg.style.opacity = '0';
    
    abrirModal('fotoModal');
    
    try {
        const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.base64) {
            // Pre-cargar antes de mostrar
            const nuevaImg = new Image();
            nuevaImg.onload = function() {
                modalImg.src = data.base64;
                modalImg.style.display = 'block';
                modalImg.style.opacity = '1';
                if (loader) loader.style.display = 'none';
            };
            nuevaImg.onerror = function() {
                if (loader) {
                    loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--danger); font-size: 2rem;"></i>';
                    loader.style.display = 'flex';
                }
                showToast('Error al cargar la imagen ampliada', 'error');
            };
            nuevaImg.src = data.base64;
        } else {
            if (loader) {
                loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--danger); font-size: 2rem;"></i>';
                loader.style.display = 'flex';
            }
            showToast('No se pudo cargar la imagen', 'error');
        }
    } catch (error) {
        console.error('Error cargando imagen ampliada:', error);
        if (loader) {
            loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--danger); font-size: 2rem;"></i>';
            loader.style.display = 'flex';
        }
        showToast('Error al cargar la imagen', 'error');
    }
};

// =====================================================
// TRANSCRIBIR AUDIO CON PROXY
// =====================================================

window.transcribirAudioProxy = async function(url) {
    if (!url) {
        showToast('No hay audio para transcribir', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/transcribir-audio`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        
        if (data.success && data.transcripcion) {
            showToast('✅ Transcripción generada correctamente', 'success');
            
            // Buscar el contenedor de descripción
            const descContainer = document.querySelector('.orden-info-card:has(h3 i.fa-clipboard-list)');
            if (descContainer) {
                let transDiv = descContainer.querySelector('.transcripcion-container');
                if (!transDiv) {
                    transDiv = document.createElement('div');
                    transDiv.className = 'transcripcion-container';
                    transDiv.style.marginTop = '0.5rem';
                    transDiv.style.padding = '0.5rem';
                    transDiv.style.background = 'var(--gris-oscuro)';
                    transDiv.style.borderRadius = 'var(--radius-sm)';
                    descContainer.appendChild(transDiv);
                }
                transDiv.innerHTML = `
                    <strong><i class="fas fa-file-alt"></i> Transcripción automática:</strong>
                    <p style="margin-top: 0.25rem;">${escapeHtml(data.transcripcion)}</p>
                `;
            }
        } else {
            showToast(data.error || 'Error al transcribir el audio', 'error');
        }
    } catch (error) {
        console.error('Error transcribiendo audio:', error);
        showToast('Error al transcribir el audio', 'error');
    } finally {
        mostrarLoading(false);
    }
};
// =====================================================
// VER DETALLE DE ORDEN - CON PROXY PARA IMÁGENES Y AUDIO
// =====================================================

window.verDetalleOrden = async function(ordenId) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-orden/${ordenId}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.error || 'Error al cargar detalle', 'error');
            return;
        }
        
        const detalle = data.detalle;
        
        const fotos = detalle.recepcion?.fotos || {};
        const fotosArray = Object.entries(fotos).filter(([_, url]) => url && url !== '');
        
        // GENERAR URLs PROXY PARA CADA IMAGEN
        let fotosHtml = '';
        if (fotosArray.length > 0) {
            fotosHtml = `
                <div class="orden-info-card">
                    <h3><i class="fas fa-images"></i> Fotos del Vehículo (${fotosArray.length})</h3>
                    <div class="fotos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
                        ${fotosArray.map(([nombre, url]) => `
                            <div class="foto-item" onclick="verFotoAmpliada('${url}')" style="cursor: pointer; background: var(--gris-oscuro); border-radius: var(--radius-sm); overflow: hidden; position: relative;">
                                <div class="foto-loader" style="display: flex; align-items: center; justify-content: center; height: 80px; background: var(--gris-oscuro);">
                                    <i class="fas fa-spinner fa-spin" style="color: var(--texto-muted);"></i>
                                </div>
                                <img src="" alt="${escapeHtml(nombre)}" style="width: 100%; height: 80px; object-fit: cover; display: none;" data-url="${url}" data-nombre="${escapeHtml(nombre)}">
                                <div style="font-size: 0.6rem; text-align: center; padding: 0.25rem; background: var(--gris-oscuro); color: var(--texto-muted);">
                                    ${escapeHtml(nombre.replace(/_/g, ' '))}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // 🔥 GENERAR HTML PARA AUDIO CON ID FIJO
        let audioHtml = '';
        if (detalle.recepcion?.audio_url) {
            // Usar ID fijo basado en el ordenId
            const audioId = `audio_${ordenId}`;
            const loaderId = `audioLoader_${ordenId}`;
            
            audioHtml = `
                <div style="margin-top: 0.5rem;">
                    <p><strong><i class="fas fa-microphone"></i> Grabación del problema:</strong></p>
                    <div id="audioContainer_${ordenId}" style="width: 100%;">
                        <div id="${loaderId}" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm);">
                            <i class="fas fa-spinner fa-spin"></i>
                            <span>Cargando audio...</span>
                        </div>
                        <audio id="${audioId}" controls style="width: 100%; display: none;" preload="metadata">
                            <source id="${audioId}_source" src="">
                            Tu navegador no soporta el elemento de audio.
                        </audio>
                    </div>
                    <div style="margin-top: 0.25rem;">
                        <button class="action-btn secondary" onclick="transcribirAudioProxy('${detalle.recepcion.audio_url}')" style="font-size: 0.75rem; padding: 0.25rem 0.75rem;">
                            <i class="fas fa-file-alt"></i> Generar transcripción
                        </button>
                    </div>
                </div>
            `;
        }
        
        // CONSTRUIR HTML COMPLETO
        const detalleHtml = `
            <div style="display: grid; gap: 1rem;">
                <div class="orden-info-card">
                    <h3><i class="fas fa-clipboard-list"></i> Información de la Orden</h3>
                    <div class="detalle-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
                        <div><strong>Código:</strong> ${escapeHtml(detalle.orden?.codigo_unico || 'N/A')}</div>
                        <div><strong>Estado:</strong> ${statusBadge(detalle.orden?.estado_global)}</div>
                        <div><strong>Fecha Ingreso:</strong> ${formatDate(detalle.orden?.fecha_ingreso)}</div>
                        <div><strong>Técnico(s):</strong> ${escapeHtml(detalle.tecnicos_nombres || 'N/A')}</div>
                    </div>
                </div>
                
                <div class="orden-info-card">
                    <h3><i class="fas fa-car"></i> Datos del Vehículo</h3>
                    <div class="detalle-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
                        <div><strong>Placa:</strong> ${escapeHtml(detalle.vehiculo?.placa || 'No registrada')}</div>
                        <div><strong>Marca/Modelo:</strong> ${escapeHtml(detalle.vehiculo?.marca || '')} ${escapeHtml(detalle.vehiculo?.modelo || '')}</div>
                        <div><strong>Año:</strong> ${detalle.vehiculo?.anio || 'N/A'}</div>
                        <div><strong>Kilometraje:</strong> ${detalle.vehiculo?.kilometraje?.toLocaleString() || '0'} km</div>
                    </div>
                </div>
                
                <div class="orden-info-card">
                    <h3><i class="fas fa-user"></i> Datos del Cliente</h3>
                    <div class="detalle-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
                        <div><strong>Nombre:</strong> ${escapeHtml(detalle.cliente?.nombre || 'No registrado')}</div>
                        <div><strong>Teléfono:</strong> ${escapeHtml(detalle.cliente?.telefono || 'No registrado')}</div>
                        <div><strong>Email:</strong> ${escapeHtml(detalle.cliente?.email || 'No registrado')}</div>
                    </div>
                </div>
                
                ${detalle.recepcion?.transcripcion_problema ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-clipboard-list"></i> Descripción del Problema</h3>
                        <div style="margin-top: 0.5rem; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm);">
                            ${escapeHtml(detalle.recepcion.transcripcion_problema)}
                        </div>
                        ${audioHtml}
                    </div>
                ` : (detalle.recepcion?.audio_url ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-microphone"></i> Grabación del Problema</h3>
                        ${audioHtml}
                    </div>
                ` : '')}
                
                ${detalle.servicios && detalle.servicios.length > 0 ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-tools"></i> Servicios Realizados</h3>
                        ${detalle.servicios.map(s => `
                            <div style="padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
                                <strong>${escapeHtml(s.descripcion)}</strong>
                                ${s.precio ? `<span style="float: right;">Bs. ${s.precio.toFixed(2)}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${fotosHtml}
            </div>
        `;
        
        document.getElementById('detalleBody').innerHTML = detalleHtml;
        abrirModal('modalDetalle');
        
        // CARGAR IMÁGENES Y AUDIO DESPUÉS DE MOSTRAR EL MODAL (LAZY LOADING)
        setTimeout(() => {
            // Cargar imágenes
            document.querySelectorAll('.foto-item img[data-url]').forEach(img => {
                const url = img.getAttribute('data-url');
                const loader = img.parentElement.querySelector('.foto-loader');
                cargarImagenProxy(url, img, loader);
            });
            
            // 🔥 CARGAR AUDIO si existe - CON ID FIJO
            if (detalle.recepcion?.audio_url) {
                const audioId = `audio_${ordenId}`;
                const loaderId = `audioLoader_${ordenId}`;
                cargarAudioProxy(detalle.recepcion.audio_url, audioId, loaderId);
            }
        }, 100);
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar detalles', 'error');
    } finally {
        mostrarLoading(false);
    }
};


function cerrarFotoModal() {
    cerrarModal('fotoModal');
}

// =====================================================
// APROBAR Y FINALIZAR
// =====================================================

let currentOrdenId = null;

window.abrirModalFinalizar = async function(ordenId) {
    const orden = ordenesPendientes.find(o => o.id_orden === ordenId);
    if (!orden) return;
    
    currentOrdenId = ordenId;
    
    const infoContainer = document.getElementById('finalizarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
        <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
        <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
        <p><strong><i class="fas fa-check-circle"></i> Estado actual:</strong> ${statusBadge(orden.estado_global)}</p>
    `;
    
    document.getElementById('comentariosFinalizar').value = '';
    abrirModal('modalFinalizar');
};

window.confirmarFinalizar = async function() {
    const comentarios = document.getElementById('comentariosFinalizar')?.value || '';
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/finalizar-orden/${currentOrdenId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comentarios: comentarios })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Orden finalizada correctamente', 'success');
            cerrarModal('modalFinalizar');
            await cargarOrdenesPendientes();
            await cargarOrdenesFinalizadas();
        } else {
            showToast(data.error || 'Error al finalizar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// RECHAZAR / ENVIAR A REVISIÓN
// =====================================================

window.abrirModalRechazar = async function(ordenId) {
    const orden = ordenesPendientes.find(o => o.id_orden === ordenId);
    if (!orden) return;
    
    currentOrdenId = ordenId;
    
    const infoContainer = document.getElementById('rechazarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
        <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
        <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
        <p><strong><i class="fas fa-tools"></i> Estado actual:</strong> ${statusBadge(orden.estado_global)}</p>
    `;
    
    document.getElementById('instruccionesRechazo').value = '';
    abrirModal('modalRechazar');
};

window.confirmarRechazar = async function() {
    const instrucciones = document.getElementById('instruccionesRechazo')?.value.trim();
    
    if (!instrucciones) {
        showToast('Debes escribir instrucciones para el técnico', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/rechazar-orden/${currentOrdenId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ instrucciones: instrucciones })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Orden enviada a revisión. El técnico ha sido notificado.', 'success');
            cerrarModal('modalRechazar');
            await cargarOrdenesPendientes();
            await cargarOrdenesFinalizadas();
        } else {
            showToast(data.error || 'Error al enviar a revisión', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// ENTREGAR VEHÍCULO (NUEVA FUNCIONALIDAD)
// =====================================================

let currentEntregarOrdenId = null;

window.abrirModalEntregar = async function(ordenId) {
    const orden = ordenesFinalizadas.find(o => o.id_orden === ordenId);
    if (!orden) return;
    
    currentEntregarOrdenId = ordenId;
    
    const infoContainer = document.getElementById('entregarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
        <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
        <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
        <p><strong><i class="fas fa-check-circle"></i> Estado actual:</strong> ${statusBadge(orden.estado_global)}</p>
    `;
    
    document.getElementById('comentariosEntregar').value = '';
    abrirModal('modalEntregar');
};

window.confirmarEntregar = async function() {
    const comentarios = document.getElementById('comentariosEntregar')?.value || '';
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/entregar-orden/${currentEntregarOrdenId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comentarios: comentarios })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('🚗 Vehículo marcado como ENTREGADO correctamente', 'success');
            cerrarModal('modalEntregar');
            await cargarOrdenesFinalizadas();
        } else {
            showToast(data.error || 'Error al marcar como entregado', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// FUNCIONES ADICIONALES
// =====================================================

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
            
            if (tabId === 'tab-finalizadas') {
                cargarOrdenesFinalizadas();
            }
        });
    });
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => cargarOrdenesPendientes());
    }
    
    const refreshFinalizadasBtn = document.getElementById('refreshFinalizadasBtn');
    if (refreshFinalizadasBtn) {
        refreshFinalizadasBtn.addEventListener('click', () => cargarOrdenesFinalizadas());
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarOrdenesPendientes());
    }
    
    const filtroEstadoFinalizadas = document.getElementById('filtroEstadoFinalizadas');
    if (filtroEstadoFinalizadas) {
        filtroEstadoFinalizadas.addEventListener('change', () => cargarOrdenesFinalizadas());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarOrdenesPendientes());
    }
    
    const searchFinalizadasInput = document.getElementById('searchFinalizadasInput');
    if (searchFinalizadasInput) {
        searchFinalizadasInput.addEventListener('input', () => cargarOrdenesFinalizadas());
    }
    
    const btnConfirmarFinalizar = document.getElementById('btnConfirmarFinalizar');
    if (btnConfirmarFinalizar) {
        btnConfirmarFinalizar.addEventListener('click', confirmarFinalizar);
    }
    
    const btnConfirmarRechazar = document.getElementById('btnConfirmarRechazar');
    if (btnConfirmarRechazar) {
        btnConfirmarRechazar.addEventListener('click', confirmarRechazar);
    }
    
    const btnConfirmarEntregar = document.getElementById('btnConfirmarEntregar');
    if (btnConfirmarEntregar) {
        btnConfirmarEntregar.addEventListener('click', confirmarEntregar);
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
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
            window.location.href = `${window.API_BASE_URL}/`;
            return null;
        }
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');
        
        currentUser = {
            id: payload.user?.id || payload.id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            roles: payload.user?.roles || payload.roles || userData?.roles || []
        };
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.innerHTML = new Date().toLocaleDateString('es-ES', { 
                year: 'numeric', month: 'long', day: 'numeric' 
            });
        }
        
        return currentUser;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = `${window.API_BASE_URL}/`;
        return null;
    }
}

function logout() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = `${window.API_BASE_URL}/`;
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

async function inicializar() {
    console.log('🚀 Inicializando control_calidad.js (Jefe Operativo)');
    console.log('📡 window.API_BASE_URL:', window.API_BASE_URL);
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarOrdenesPendientes();
    await cargarOrdenesFinalizadas();
    setupTabs();
    setupEventListeners();
    
    console.log('✅ control_calidad.js inicializado correctamente');
}
// =====================================================
// CARGAR AUDIO CON PROXY Y TOKEN (PARA CONTROL DE CALIDAD)
// =====================================================

async function cargarAudioProxy(url, audioId, loaderId) {
    if (!url) {
        const loader = document.getElementById(loaderId);
        if (loader) {
            loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> No hay audio disponible';
        }
        return;
    }
    
    const loader = document.getElementById(loaderId);
    const audio = document.getElementById(audioId);
    const source = document.getElementById(`${audioId}_source`);
    
    if (!audio || !source) {
        console.warn('⚠️ Elementos de audio no encontrados');
        return;
    }
    
    try {
        // 🔥 1. OBTENER EL AUDIO CON FETCH Y TOKEN
        const proxyUrl = `${API_URL}/proxy-audio?url=${encodeURIComponent(url)}`;
        console.log('🎵 Descargando audio con fetch:', proxyUrl);
        
        const response = await fetch(proxyUrl, {
            headers: getAuthHeaders()  // 🔥 ESTO ES LA CLAVE
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        // 🔥 2. CONVERTIR A BLOB Y CREAR URL LOCAL
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);
        
        console.log('✅ Audio descargado, tamaño:', blob.size, 'bytes');
        
        // 🔥 3. ASIGNAR AL ELEMENTO DE AUDIO
        source.src = localUrl;
        audio.style.display = 'block';
        audio.load();
        
        // Ocultar loader
        if (loader) loader.style.display = 'none';
        
        // 🔥 4. MANEJAR ERRORES DE REPRODUCCIÓN
        audio.addEventListener('error', function(e) {
            console.warn('⚠️ Error reproduciendo audio:', e);
            if (loader) {
                loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> Error al reproducir audio';
                loader.style.display = 'flex';
            }
            audio.style.display = 'none';
        });
        
    } catch (error) {
        console.error('❌ Error cargando audio:', error);
        if (loader) {
            loader.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> Error: ${error.message}`;
            loader.style.display = 'flex';
        }
        audio.style.display = 'none';
    }
}

// Exponer funciones globales
window.verDetalleOrden = verDetalleOrden;
window.verFotoAmpliada = window.verFotoAmpliadaProxy;
window.cerrarFotoModal = cerrarFotoModal;
window.abrirModalFinalizar = abrirModalFinalizar;
window.confirmarFinalizar = confirmarFinalizar;
window.abrirModalRechazar = abrirModalRechazar;
window.confirmarRechazar = confirmarRechazar;
window.abrirModalEntregar = abrirModalEntregar;
window.confirmarEntregar = confirmarEntregar;
window.cerrarModal = cerrarModal;
window.logout = logout;

document.addEventListener('DOMContentLoaded', inicializar);