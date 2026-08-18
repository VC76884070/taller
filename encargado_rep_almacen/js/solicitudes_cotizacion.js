// =====================================================
// SOLICITUDES_COTIZACION.JS - ENCARGADO DE REPUESTOS
// VERSIÓN CORREGIDA - MANEJA ARRAY DE FOTOS
// FURIA MOTOR COMPANY SRL
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
const API_URL = `${window.API_BASE_URL}/api/encargado-repuestos`;

const PAGE_SIZE = 10;
let currentUser = null;
let solicitudesCache = {
    data: null,
    timestamp: 0,
    currentPage: 1,
    totalPages: 1,
    totalItems: 0
};
let currentFilters = {
    estado: 'all',
    search: '',
    page: 1
};
let isLoading = false;
let imageCache = {};

// =====================================================
// UTILIDADES
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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function formatDateTime(dateStr) {
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
        return dateStr;
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
    }, 3500);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
    isLoading = mostrar;
}

function statusBadge(estado) {
    const map = {
        'pendiente': 'status-pendiente',
        'cotizado': 'status-cotizado',
        'aprobado': 'status-aprobado',
        'rechazado': 'status-rechazado'
    };
    const texto = {
        'pendiente': 'Pendiente',
        'cotizado': 'Cotizado',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado'
    };
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">${texto[estado] || estado}</span>`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// =====================================================
// 🔥 FUNCIÓN PARA CARGAR IMAGEN VÍA PROXY (CORREGIDA)
// =====================================================

async function cargarImagenProxy(url, imgElement, loaderElement) {
    if (!url) {
        if (loaderElement) loaderElement.style.display = 'none';
        if (imgElement) imgElement.style.display = 'none';
        return null;
    }
    
    // Verificar caché
    if (imageCache[url]) {
        if (imgElement) {
            imgElement.src = imageCache[url];
            imgElement.style.display = 'block';
            imgElement.style.opacity = '1';
            imgElement.setAttribute('data-loaded', 'true');
        }
        if (loaderElement) loaderElement.style.display = 'none';
        return imageCache[url];
    }
    
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
            return new Promise((resolve) => {
                const nuevaImg = new Image();
                nuevaImg.onload = function() {
                    if (imgElement) {
                        imgElement.src = data.base64;
                        imgElement.style.display = 'block';
                        imgElement.style.opacity = '1';
                        imgElement.setAttribute('data-loaded', 'true');
                    }
                    if (loaderElement) loaderElement.style.display = 'none';
                    imageCache[url] = data.base64;
                    resolve(data.base64);
                };
                nuevaImg.onerror = function() {
                    console.error('Error cargando imagen:', url);
                    if (loaderElement) {
                        loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                        loaderElement.style.display = 'flex';
                    }
                    resolve(null);
                };
                nuevaImg.src = data.base64;
            });
        } else {
            if (loaderElement) {
                loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                loaderElement.style.display = 'flex';
            }
            return null;
        }
    } catch (error) {
        console.error('Error cargando imagen:', error);
        if (loaderElement) {
            loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            loaderElement.style.display = 'flex';
        }
        return null;
    }
}

// =====================================================
// 🔥 FUNCIÓN PARA RENDERIZAR ITEMS CON ARRAY DE FOTOS
// =====================================================

function renderItemsConFotos(items, maxItems = 3, prefix = '') {
    if (!items || items.length === 0) {
        return '<div class="text-muted">No hay items</div>';
    }
    
    const itemsToShow = items.slice(0, maxItems);
    
    return itemsToShow.map((item, index) => {
        const fotos = item.fotos || [];
        const fotosCount = fotos.length;
        const fotoUrl = fotosCount > 0 ? fotos[0] : null;
        
        // IDs FIJOS basados en el prefix y el índice
        const uniqueId = `${prefix}_${index}`;
        const imgId = `img_${uniqueId}`;
        const loaderId = `loader_${uniqueId}`;
        
        let miniaturasHtml = '';
        if (fotosCount > 1) {
            const mostrarMiniaturas = fotos.slice(0, 3);
            miniaturasHtml = `
                <div class="miniaturas-container" style="display:flex; gap:2px; margin-top:2px; flex-wrap:wrap;">
                    ${mostrarMiniaturas.map((f, fi) => {
                        const miniId = `mini_img_${uniqueId}_${fi}`;
                        const miniLoaderId = `mini_loader_${uniqueId}_${fi}`;
                        return `
                            <div class="miniatura-item" style="width:18px; height:18px; border-radius:2px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); cursor:pointer;"
                                 onclick="event.stopPropagation(); verFotoAmpliada('${escapeHtml(f)}')">
                                <div id="${miniLoaderId}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:var(--gris-oscuro); font-size:6px;">
                                    <i class="fas fa-spinner fa-spin"></i>
                                </div>
                                <img id="${miniId}" src="" alt="Miniatura" 
                                     style="display:none; width:100%; height:100%; object-fit:cover;"
                                     data-url="${escapeHtml(f)}">
                            </div>
                        `;
                    }).join('')}
                    ${fotosCount > 3 ? `<span style="font-size:7px; color:var(--gris-texto);">+${fotosCount-3}</span>` : ''}
                </div>
            `;
        }
        
        const fotoHtml = fotoUrl ? `
            <div class="item-foto-container" style="position:relative; width:60px; height:60px; border-radius:8px; overflow:hidden; background:var(--gris-oscuro); flex-shrink:0;">
                <div id="${loaderId}" class="item-foto-loader" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:var(--gris-oscuro); color:var(--gris-texto); font-size:0.7rem;">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <img id="${imgId}" class="item-foto-miniatura" alt="Foto" 
                     style="display:none; width:100%; height:100%; object-fit:cover; cursor:pointer;"
                     onclick="verFotoAmpliada('${escapeHtml(fotoUrl)}')"
                     data-url="${escapeHtml(fotoUrl)}">
                ${fotosCount > 1 ? `<span style="position:absolute;bottom:2px;right:4px;background:rgba(0,0,0,0.7);color:white;font-size:0.6rem;padding:0 4px;border-radius:3px;z-index:2;">+${fotosCount-1}</span>` : ''}
            </div>
        ` : `
            <div class="item-foto-placeholder" style="width:60px; height:60px; border-radius:8px; background:var(--gris-oscuro); display:flex; align-items:center; justify-content:center; color:var(--gris-texto); flex-shrink:0;">
                <i class="fas fa-camera" style="font-size:1.2rem;"></i>
            </div>
        `;
        
        return `
            <div class="item-row-solicitud" style="display:flex; align-items:center; gap:0.75rem; padding:0.4rem 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                    ${fotoHtml}
                    ${miniaturasHtml}
                </div>
                <div class="item-desc" style="flex:1; font-size:0.9rem;">${escapeHtml(item.descripcion)}</div>
                <div class="item-cant" style="font-size:0.8rem; color:var(--gris-texto);">${item.cantidad} uds</div>
                ${fotosCount > 0 ? `<span style="font-size:0.7rem; color:var(--rojo-primario);"><i class="fas fa-images"></i> ${fotosCount}</span>` : ''}
            </div>
        `;
    }).join('');
}

// =====================================================
// 🔥 FUNCIÓN PARA CARGAR IMÁGENES DESPUÉS DE RENDERIZAR
// =====================================================

function cargarImagenesEnTarjetas() {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;
    
    // Cargar imágenes principales
    const fotoContainers = container.querySelectorAll('.item-foto-container');
    fotoContainers.forEach(container => {
        const img = container.querySelector('.item-foto-miniatura');
        const loader = container.querySelector('.item-foto-loader');
        if (img && loader) {
            const url = img.getAttribute('data-url');
            if (url) {
                cargarImagenProxy(url, img, loader);
            }
        }
    });
    
    // Cargar miniaturas
    const miniaturas = container.querySelectorAll('.miniatura-item img');
    miniaturas.forEach(img => {
        const url = img.getAttribute('data-url');
        const loaderId = img.id.replace('mini_img', 'mini_loader');
        const loader = document.getElementById(loaderId);
        if (url) {
            cargarImagenProxy(url, img, loader);
        }
    });
}

// =====================================================
// CARGA DE SOLICITUDES
// =====================================================

async function cargarSolicitudes(resetPage = true) {
    if (isLoading) return;
    
    if (resetPage) {
        currentFilters.page = 1;
    }
    
    mostrarLoading(true);
    
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        currentFilters.estado = estado;
        currentFilters.search = search;
        
        let url = `${API_URL}/solicitudes-cotizacion?page=${currentFilters.page}&limit=${PAGE_SIZE}`;
        if (estado !== 'all') url += `&estado=${estado}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });
        
        if (response.status === 401) {
            showToast('Sesión expirada, redirigiendo...', 'warning');
            setTimeout(() => { window.location.href = `${window.API_BASE_URL}/`; }, 1500);
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            solicitudesCache = {
                data: data.solicitudes || [],
                timestamp: Date.now(),
                currentPage: data.pagination?.current_page || 1,
                totalPages: data.pagination?.total_pages || 1,
                totalItems: data.pagination?.total || 0
            };
            
            renderizarSolicitudes(solicitudesCache.data);
            renderizarPaginacion();
            
            setTimeout(() => {
                cargarImagenesEnTarjetas();
            }, 150);
            
        } else {
            showToast(data.error || 'Error al cargar solicitudes', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarSolicitudes(solicitudes) {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;
    
    if (!solicitudes || solicitudes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay solicitudes de cotización</p>
                <small>Las solicitudes aparecerán aquí cuando el Jefe de Taller las cree</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = solicitudes.map((solicitud, index) => {
        let items = solicitud.items || [];
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
        }
        
        const itemsHtml = renderItemsConFotos(items, 3, `solicitud_${solicitud.id}`);
        const tieneMasItems = items.length > 3;
        const puedeCotizar = solicitud.estado === 'pendiente';
        const totalFotos = solicitud.total_fotos || 0;
        
        return `
            <div class="solicitud-card" data-id="${solicitud.id}" style="animation-delay: ${Math.min(index * 0.03, 0.3)}s">
                <div class="solicitud-header">
                    <h3><i class="fas fa-file-invoice"></i> Solicitud #${solicitud.id}</h3>
                    ${statusBadge(solicitud.estado)}
                    ${totalFotos > 0 ? `<span style="background:var(--rojo-primario);color:white;padding:0.1rem 0.5rem;border-radius:12px;font-size:0.6rem;margin-left:0.5rem;"><i class="fas fa-camera"></i> ${totalFotos}</span>` : ''}
                </div>
                <div class="solicitud-body">
                    <div class="orden-info">
                        <div class="orden-info-item">
                            <label><i class="fas fa-hashtag"></i> OT</label>
                            <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
                        </div>
                        <div class="orden-info-item">
                            <label><i class="fas fa-car"></i> Vehículo</label>
                            <span>${escapeHtml(solicitud.vehiculo?.substring(0, 30) || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <label><i class="fas fa-calendar"></i> Fecha</label>
                            <span>${formatDate(solicitud.fecha_solicitud)}</span>
                        </div>
                    </div>
                    
                    <div class="items-list">
                        <h4><i class="fas fa-cubes"></i> Items solicitados (${items.length}):</h4>
                        ${itemsHtml}
                        ${tieneMasItems ? `<div class="more-items">+ ${items.length - 3} items más</div>` : ''}
                    </div>
                    
                    ${solicitud.precio_cotizado ? `
                        <div class="precio-cotizado-box">
                            <strong><i class="fas fa-tag"></i> Precio cotizado:</strong>
                            <span class="precio-valor">Bs. ${solicitud.precio_cotizado.toFixed(2)}</span>
                        </div>
                    ` : ''}
                    
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="verDetalle(${solicitud.id})" title="Ver Detalle">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        ${puedeCotizar ? `
                            <button class="action-btn cotizar" onclick="abrirModalCotizar(${solicitud.id})" title="Cotizar">
                                <i class="fas fa-tags"></i> Cotizar
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarPaginacion() {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;
    if (solicitudesCache.totalPages <= 1) return;
    
    const paginationHtml = `
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="cambiarPagina(${solicitudesCache.currentPage - 1})" 
                ${solicitudesCache.currentPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i> Anterior
            </button>
            <span class="pagination-current">
                Página ${solicitudesCache.currentPage} de ${solicitudesCache.totalPages}
            </span>
            <button class="pagination-btn" onclick="cambiarPagina(${solicitudesCache.currentPage + 1})"
                ${solicitudesCache.currentPage === solicitudesCache.totalPages ? 'disabled' : ''}>
                Siguiente <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', paginationHtml);
}

function cambiarPagina(page) {
    if (page < 1 || page > solicitudesCache.totalPages) return;
    if (page === solicitudesCache.currentPage) return;
    currentFilters.page = page;
    cargarSolicitudes(false);
}
// =====================================================
// COTIZAR SOLICITUD (CORREGIDO - CON VERIFICACIÓN DE ELEMENTOS)
// =====================================================

let currentSolicitudId = null;

async function abrirModalCotizar(idSolicitud) {
    let solicitud = solicitudesCache.data?.find(s => s.id === idSolicitud);
    
    if (!solicitud) {
        mostrarLoading(true);
        try {
            const response = await fetch(`${API_URL}/solicitudes-cotizacion/${idSolicitud}`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                solicitud = data.solicitud;
            } else {
                showToast('No se encontró la solicitud', 'error');
                return;
            }
        } catch (error) {
            showToast('Error al cargar la solicitud', 'error');
            return;
        } finally {
            mostrarLoading(false);
        }
    }
    
    if (!solicitud) {
        showToast('No se encontró la solicitud', 'error');
        return;
    }
    
    currentSolicitudId = idSolicitud;
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    // 🔥 RENDERIZAR ITEMS CON IDs FIJOS
    const itemsHtml = items.map((item, idx) => {
        const fotos = item.fotos || [];
        const fotosCount = fotos.length;
        const fotoUrl = fotosCount > 0 ? fotos[0] : null;
        
        // IDs FIJOS basados en el índice - SIN Date.now()
        const imgId = `img_cotizar_${idSolicitud}_${idx}`;
        const loaderId = `loader_cotizar_${idSolicitud}_${idx}`;
        
        const fotoHtml = fotoUrl ? `
            <div class="precio-item-foto" style="position:relative; width:80px; height:80px; border-radius:8px; overflow:hidden; background:var(--gris-oscuro); flex-shrink:0; border:2px solid var(--border-color);">
                <div id="${loaderId}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:var(--gris-oscuro); color:var(--gris-texto); font-size:0.7rem;">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <img id="${imgId}" class="item-foto-modal" alt="Foto" 
                     style="display:none; width:100%; height:100%; object-fit:cover; cursor:pointer;"
                     onclick="verFotoAmpliada('${escapeHtml(fotoUrl)}')"
                     data-url="${escapeHtml(fotoUrl)}">
                ${fotosCount > 1 ? `<span style="position:absolute;bottom:2px;right:4px;background:rgba(0,0,0,0.8);color:white;font-size:0.55rem;padding:0 5px;border-radius:3px;z-index:2;">+${fotosCount-1}</span>` : ''}
            </div>
        ` : `
            <div class="item-foto-placeholder-modal" style="width:80px; height:80px; border-radius:8px; background:var(--gris-oscuro); display:flex; align-items:center; justify-content:center; color:var(--gris-texto); flex-shrink:0; border:2px dashed var(--border-color);">
                <i class="fas fa-camera" style="font-size:1.5rem;"></i>
            </div>
        `;
        
        return `
            <div class="precio-item-row" style="display:flex; align-items:center; gap:1rem; padding:0.75rem; background:var(--bg-card); border-radius:8px; margin-bottom:0.5rem; border:1px solid var(--border-color);">
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                    ${fotoHtml}
                </div>
                <div class="precio-item-desc" style="flex:1;">
                    <strong>${escapeHtml(item.descripcion)}</strong>
                    <small style="display:block; color:var(--gris-texto); font-size:0.75rem;">(x${item.cantidad} uds)</small>
                    ${item.detalle ? `<small class="text-muted" style="display:block; font-size:0.7rem;">${escapeHtml(item.detalle)}</small>` : ''}
                    ${fotosCount > 0 ? `<small style="display:block; color:var(--rojo-primario); font-size:0.65rem;"><i class="fas fa-images"></i> ${fotosCount} foto(s)</small>` : ''}
                </div>
                <div class="precio-item-input" style="min-width:180px;">
                    <label style="font-size:0.7rem; color:var(--gris-texto);">Precio unitario (Bs.):</label>
                    <input type="number" id="precio_item_${idSolicitud}_${idx}" class="precio-input" step="0.01" min="0" placeholder="0.00" 
                           style="width:100%; padding:0.4rem; border-radius:6px; border:1px solid var(--border-color); background:var(--gris-oscuro); color:white;">
                    <span class="total-hint" style="font-size:0.7rem; color:var(--gris-texto);">Total: Bs. <span id="total_item_${idSolicitud}_${idx}" class="total-item" style="color:var(--verde-exito); font-weight:600;">0.00</span></span>
                </div>
            </div>
        `;
    }).join('');
    
    const modalBody = document.getElementById('modalCotizarBody');
    modalBody.innerHTML = `
        <div class="orden-info" style="margin-bottom: 1.5rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:0.5rem 1rem; padding:0.75rem; background:var(--gris-oscuro); border-radius:8px;">
            <div class="orden-info-item">
                <label style="font-size:0.65rem; color:var(--gris-texto);"><i class="fas fa-hashtag"></i> Solicitud</label>
                <span style="font-weight:600;">#${solicitud.id}</span>
            </div>
            <div class="orden-info-item">
                <label style="font-size:0.65rem; color:var(--gris-texto);"><i class="fas fa-tag"></i> OT</label>
                <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
            </div>
            <div class="orden-info-item">
                <label style="font-size:0.65rem; color:var(--gris-texto);"><i class="fas fa-car"></i> Vehículo</label>
                <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
            </div>
            <div class="orden-info-item">
                <label style="font-size:0.65rem; color:var(--gris-texto);"><i class="fas fa-calendar"></i> Fecha</label>
                <span>${formatDate(solicitud.fecha_solicitud)}</span>
            </div>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
            <h4 style="margin-bottom:0.75rem;"><i class="fas fa-cubes"></i> Items a cotizar (${items.length}):</h4>
            <div style="max-height:400px; overflow-y:auto; padding-right:4px;">
                ${itemsHtml}
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom:1rem;">
            <label style="font-weight:600;"><i class="fas fa-truck"></i> Proveedor *</label>
            <input type="text" id="proveedorInfo" class="form-control" placeholder="Ej: Autoparts Bolivia" autocomplete="off" 
                   style="width:100%; padding:0.6rem; border-radius:8px; border:1px solid var(--border-color); background:var(--gris-oscuro); color:white; margin-top:4px;">
        </div>
        
        <div class="form-group" style="margin-bottom:1.5rem;">
            <label style="font-weight:600;"><i class="fas fa-sticky-note"></i> Observaciones</label>
            <textarea id="respuestaEncargado" class="form-control" rows="2" placeholder="Notas sobre la cotización..." 
                      style="width:100%; padding:0.6rem; border-radius:8px; border:1px solid var(--border-color); background:var(--gris-oscuro); color:white; margin-top:4px; resize:vertical;"></textarea>
        </div>
        
        <div class="modal-actions" style="display:flex; gap:0.75rem; justify-content:flex-end; padding-top:1rem; border-top:1px solid var(--border-color);">
            <button class="btn-secondary" onclick="cerrarModal('modalCotizar')" style="padding:0.5rem 1.5rem; border-radius:8px; border:none; cursor:pointer;">
                Cancelar
            </button>
            <button class="btn-cotizar" onclick="enviarCotizacion()" style="padding:0.5rem 1.5rem; border-radius:8px; border:none; cursor:pointer; background:var(--rojo-primario); color:white; font-weight:600;">
                <i class="fas fa-paper-plane"></i> Enviar Cotización
            </button>
        </div>
    `;
    
    // Configurar eventos de precio y cargar imágenes
    // Usamos setTimeout con 300ms para asegurar que el DOM esté listo
    setTimeout(() => {
        items.forEach((item, idx) => {
            // Precio input
            const precioInput = document.getElementById(`precio_item_${idSolicitud}_${idx}`);
            if (precioInput) {
                precioInput.addEventListener('input', function() {
                    const totalSpan = document.getElementById(`total_item_${idSolicitud}_${idx}`);
                    if (totalSpan) {
                        const precio = parseFloat(this.value) || 0;
                        const total = precio * item.cantidad;
                        totalSpan.textContent = total.toFixed(2);
                        totalSpan.style.color = precio > 0 ? 'var(--verde-exito)' : 'var(--gris-texto)';
                    }
                });
            }
        });
        
        const firstInput = document.getElementById(`precio_item_${idSolicitud}_0`);
        if (firstInput) firstInput.focus();
        
        // 🔥 CARGAR IMÁGENES - Con verificación de existencia
        items.forEach((item, idx) => {
            const fotos = item.fotos || [];
            if (fotos.length > 0) {
                const imgId = `img_cotizar_${idSolicitud}_${idx}`;
                const loaderId = `loader_cotizar_${idSolicitud}_${idx}`;
                
                // Buscar los elementos
                const img = document.getElementById(imgId);
                const loader = document.getElementById(loaderId);
                
                if (img && loader) {
                    console.log(`📸 Cargando imagen para item ${idx}: ${fotos[0].substring(0, 50)}...`);
                    cargarImagenProxy(fotos[0], img, loader);
                } else {
                    console.warn(`⚠️ No se encontraron elementos para item ${idx}: img=${!!img}, loader=${!!loader}`);
                }
            }
        });
    }, 300);
    
    abrirModal('modalCotizar');
}

async function enviarCotizacion() {
    const solicitud = solicitudesCache.data?.find(s => s.id === currentSolicitudId);
    if (!solicitud) {
        showToast('Error: No se encontró la solicitud', 'error');
        return;
    }
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    let precioTotal = 0;
    let itemsConPrecio = 0;
    
    for (let i = 0; i < items.length; i++) {
        const precioInput = document.getElementById(`precio_item_${i}`);
        if (precioInput && precioInput.value) {
            const precioUnitario = parseFloat(precioInput.value);
            if (!isNaN(precioUnitario) && precioUnitario > 0) {
                precioTotal += precioUnitario * items[i].cantidad;
                itemsConPrecio++;
            }
        }
    }
    
    if (precioTotal === 0 || itemsConPrecio === 0) {
        showToast('Ingrese al menos un precio válido', 'warning');
        return;
    }
    
    const proveedorInfo = document.getElementById('proveedorInfo')?.value.trim() || '';
    if (!proveedorInfo) {
        showToast('Indique el nombre del proveedor', 'warning');
        return;
    }
    
    const respuesta = document.getElementById('respuestaEncargado')?.value.trim() || '';
    
    if (!confirm(`Confirmar cotización:\nProveedor: ${proveedorInfo}\nTotal: Bs. ${precioTotal.toFixed(2)}`)) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion/${currentSolicitudId}/cotizar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                precio_cotizado: precioTotal,
                proveedor_info: proveedorInfo,
                respuesta_encargado: respuesta
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`Cotización enviada - Total: Bs. ${precioTotal.toFixed(2)}`, 'success');
            cerrarModal('modalCotizar');
            solicitudesCache.timestamp = 0;
            await cargarSolicitudes(true);
        } else {
            showToast(data.error || 'Error al enviar cotización', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE CON TODAS LAS FOTOS
// =====================================================

async function verDetalle(idSolicitud) {
    let solicitud = solicitudesCache.data?.find(s => s.id === idSolicitud);
    
    if (!solicitud) {
        mostrarLoading(true);
        try {
            const response = await fetch(`${API_URL}/solicitudes-cotizacion/${idSolicitud}`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                solicitud = data.solicitud;
            }
        } catch (error) {
            showToast('Error al cargar detalle', 'error');
            return;
        } finally {
            mostrarLoading(false);
        }
    }
    
    if (!solicitud) {
        showToast('No se encontró la solicitud', 'error');
        return;
    }
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map((item, idx) => {
        const fotos = item.fotos || [];
        const fotosCount = fotos.length;
        
        const fotosHtml = fotosCount > 0 ? `
            <div class="fotos-grid-detalle" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                ${fotos.map((f, fi) => {
                    const fotoId = `detalle_foto_${idSolicitud}_${idx}_${fi}`;
                    const loaderId = `detalle_loader_${idSolicitud}_${idx}_${fi}`;
                    return `
                        <div class="foto-item-detalle" style="position:relative; width:80px; height:80px; border-radius:8px; overflow:hidden; background:var(--gris-oscuro); border:2px solid var(--border-color); cursor:pointer;"
                             onclick="verFotoAmpliada('${escapeHtml(f)}')">
                            <div id="${loaderId}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;">
                                <i class="fas fa-spinner fa-spin" style="color:var(--gris-texto);"></i>
                            </div>
                            <img id="${fotoId}" src="" alt="Foto ${fi+1}" 
                                 style="display:none; width:100%; height:100%; object-fit:cover;"
                                 data-url="${escapeHtml(f)}">
                            <span style="position:absolute;top:2px;right:4px;background:rgba(0,0,0,0.7);color:white;font-size:0.6rem;padding:0 4px;border-radius:3px;">${fi+1}/${fotosCount}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : `<div class="text-muted" style="font-size:0.8rem; margin-top:4px;">Sin fotos</div>`;
        
        return `
            <div class="item-detalle-card" style="padding:0.75rem; background:var(--bg-card); border-radius:8px; margin-bottom:0.75rem; border-left:3px solid var(--rojo-primario);">
                <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                    <strong>${escapeHtml(item.descripcion)}</strong>
                    <span style="background:var(--gris-oscuro);padding:0.1rem 0.5rem;border-radius:4px;font-size:0.8rem;">×${item.cantidad}</span>
                    ${item.detalle ? `<span style="color:var(--gris-texto);font-size:0.8rem;">${escapeHtml(item.detalle)}</span>` : ''}
                    <span style="font-size:0.7rem; color:var(--rojo-primario);"><i class="fas fa-images"></i> ${fotosCount}</span>
                </div>
                ${fotosHtml}
            </div>
        `;
    }).join('');
    
    const modalBody = document.getElementById('modalDetalleBody');
    modalBody.innerHTML = `
        <div class="orden-info">
            <div class="orden-info-item">
                <label>Solicitud #${solicitud.id}</label>
                <span>${statusBadge(solicitud.estado)}</span>
            </div>
            <div class="orden-info-item">
                <label>Orden de Trabajo</label>
                <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
            </div>
            <div class="orden-info-item">
                <label>Vehículo</label>
                <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
            </div>
            <div class="orden-info-item">
                <label>Fecha Solicitud</label>
                <span>${formatDateTime(solicitud.fecha_solicitud)}</span>
            </div>
        </div>
        
        <div class="items-list-detalle">
            <h4>Items solicitados (${items.length}):</h4>
            ${itemsHtml}
        </div>
        
        ${solicitud.observacion_jefe_taller ? `
            <div class="observacion-box">
                <small><i class="fas fa-comment-dots"></i> Observación:</small>
                <p>${escapeHtml(solicitud.observacion_jefe_taller)}</p>
            </div>
        ` : ''}
        
        ${solicitud.precio_cotizado ? `
            <div class="precio-cotizado-box">
                <strong>Precio cotizado:</strong>
                <span class="precio-valor">Bs. ${solicitud.precio_cotizado.toFixed(2)}</span>
                ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
                ${solicitud.respuesta_encargado ? `<br><strong>Notas:</strong> ${escapeHtml(solicitud.respuesta_encargado)}` : ''}
            </div>
        ` : ''}
        
        <div class="modal-actions">
            <button class="btn-secondary" onclick="cerrarModal('modalDetalle')">Cerrar</button>
            ${solicitud.estado === 'pendiente' ? `
                <button class="btn-cotizar" onclick="cerrarModal('modalDetalle'); abrirModalCotizar(${solicitud.id})">
                    Cotizar ahora
                </button>
            ` : ''}
        </div>
    `;
    
    abrirModal('modalDetalle');
    
    setTimeout(() => {
        const fotos = modalBody.querySelectorAll('.foto-item-detalle img');
        fotos.forEach(img => {
            const url = img.getAttribute('data-url');
            const loaderId = img.id.replace('detalle_foto', 'detalle_loader');
            const loader = document.getElementById(loaderId);
            if (url) {
                cargarImagenProxy(url, img, loader);
            }
        });
    }, 200);
}

// =====================================================
// FUNCIÓN PARA VER FOTO AMPLIADA
// =====================================================

async function verFotoAmpliada(url) {
    if (!url) {
        showToast('No hay foto para mostrar', 'warning');
        return;
    }
    
    let modalFoto = document.getElementById('modalFotoAmpliada');
    if (!modalFoto) {
        const modalHtml = `
            <div class="modal" id="modalFotoAmpliada" onclick="cerrarFotoAmpliada()">
                <div class="modal-content foto-ampliada-content" onclick="event.stopPropagation()">
                    <div class="modal-header foto-ampliada-header">
                        <h3><i class="fas fa-image"></i> Foto del Item</h3>
                        <button class="close-modal" onclick="cerrarFotoAmpliada()">&times;</button>
                    </div>
                    <div class="modal-body foto-ampliada-body">
                        <div id="fotoModalLoader" style="display:flex; justify-content:center; align-items:center; padding:2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size:2rem; color:var(--rojo-primario);"></i>
                            <span style="margin-left:1rem;">Cargando imagen...</span>
                        </div>
                        <img id="fotoAmpliadaImg" src="" alt="Foto ampliada" style="display:none; max-width:100%; max-height:70vh; object-fit:contain;">
                    </div>
                    <div class="modal-footer foto-ampliada-footer">
                        <button class="btn-secondary" onclick="cerrarFotoAmpliada()">Cerrar</button>
                        <button class="btn-cotizar" onclick="descargarFotoAmpliada()" id="btnDescargarFoto">
                            <i class="fas fa-download"></i> Descargar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    const modal = document.getElementById('modalFotoAmpliada');
    const img = document.getElementById('fotoAmpliadaImg');
    const loader = document.getElementById('fotoModalLoader');
    
    if (!modal || !img) return;
    
    if (loader) loader.style.display = 'flex';
    img.style.display = 'none';
    img.style.opacity = '0';
    img.src = '';
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    if (imageCache[url]) {
        img.src = imageCache[url];
        img.style.display = 'block';
        img.style.opacity = '1';
        if (loader) loader.style.display = 'none';
        window._fotoAmpliadaUrl = imageCache[url];
        return;
    }
    
    try {
        const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.base64) {
            const nuevaImg = new Image();
            nuevaImg.onload = function() {
                img.src = data.base64;
                img.style.display = 'block';
                img.style.opacity = '1';
                if (loader) loader.style.display = 'none';
                window._fotoAmpliadaUrl = data.base64;
                imageCache[url] = data.base64;
            };
            nuevaImg.onerror = function() {
                if (loader) {
                    loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error al cargar';
                    loader.style.display = 'flex';
                }
                showToast('Error al cargar la imagen', 'error');
            };
            nuevaImg.src = data.base64;
        } else {
            if (loader) {
                loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No se pudo cargar';
                loader.style.display = 'flex';
            }
            showToast('Error al cargar la imagen', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        if (loader) {
            loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error de conexión';
            loader.style.display = 'flex';
        }
        showToast('Error al cargar la imagen', 'error');
    }
}

function cerrarFotoAmpliada() {
    const modal = document.getElementById('modalFotoAmpliada');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function descargarFotoAmpliada() {
    const base64Url = window._fotoAmpliadaUrl;
    if (!base64Url) {
        showToast('No hay foto para descargar', 'warning');
        return;
    }
    const link = document.createElement('a');
    link.href = base64Url;
    link.download = `foto_item_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ Descargando foto...', 'success');
}

// =====================================================
// AUTENTICACIÓN E INICIALIZACIÓN
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
        
        let userData = null;
        try {
            const userStr = localStorage.getItem('furia_user');
            if (userStr) userData = JSON.parse(userStr);
        } catch (e) {}
        
        currentUser = {
            id: payload.user?.id || payload.id || payload.user_id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email,
            roles: payload.user?.roles || payload.roles || userData?.roles || [],
            rol_principal: payload.user?.rol_principal || payload.rol_principal || userData?.rol_principal
        };
        
        const tieneRolRepuestos = currentUser.roles?.includes('encargado_repuestos') || 
                                    currentUser.roles?.includes('encargado_rep_almacen');
        
        if (!tieneRolRepuestos) {
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => { window.location.href = `${window.API_BASE_URL}/`; }, 2000);
            return null;
        }
        
        return currentUser;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = `${window.API_BASE_URL}/`;
        return null;
    }
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            solicitudesCache.timestamp = 0;
            cargarSolicitudes(true);
            showToast('Actualizando lista...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarSolicitudes(true));
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(() => cargarSolicitudes(true), 500);
        searchInput.addEventListener('input', debouncedSearch);
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModal(modal.id);
        });
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                cerrarModal(modal.id);
            });
            cerrarFotoAmpliada();
        }
    });
}

async function inicializar() {
    console.log('🚀 Inicializando solicitudes_cotizacion.js (Con array de fotos)');
    console.log('📡 window.API_BASE_URL:', window.API_BASE_URL);
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    const fechaElement = document.getElementById('currentDate');
    if (fechaElement) {
        const hoy = new Date();
        fechaElement.textContent = hoy.toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    await cargarSolicitudes(true);
    setupEventListeners();
    
    setInterval(() => {
        if (!document.querySelector('.modal.active') && !isLoading) {
            if (Date.now() - solicitudesCache.timestamp > 60000) {
                cargarSolicitudes(true);
            }
        }
    }, 60000);
    
    console.log('✅ solicitudes_cotizacion.js cargado');
}

// =====================================================
// EXPORTAR FUNCIONES GLOBALES
// =====================================================

window.verDetalle = verDetalle;
window.abrirModalCotizar = abrirModalCotizar;
window.enviarCotizacion = enviarCotizacion;
window.cerrarModal = cerrarModal;
window.cambiarPagina = cambiarPagina;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarFotoAmpliada = cerrarFotoAmpliada;
window.descargarFotoAmpliada = descargarFotoAmpliada;
window.cargarImagenProxy = cargarImagenProxy;

document.addEventListener('DOMContentLoaded', inicializar);