// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 Modo DESARROLLO - Usando localhost:5000');
            return 'http://localhost:5000';
        }
        console.log('📡 Modo PRODUCCIÓN - Usando URL relativa');
        return '';
    })();
}

// =====================================================
// AVANCES.JS - CLIENTE (VERSIÓN OPTIMIZADA)
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.API_BASE_URL + '/api/cliente';
let currentUser = null;
let vehiculos = [];
let avancesActuales = [];
let currentVehiculoId = null;
let currentVehiculo = null;
let ordenActual = null;

// =====================================================
// UTILIDADES
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
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
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return formatDate(dateStr);
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    let icon = type === 'success' ? 'fa-check-circle' : 
               type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function cerrarModal(modalId) {
    document.getElementById(modalId)?.classList.remove('show');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
}

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        if (!token) {
            window.location.href = window.API_BASE_URL + '/';
            return null;
        }

        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');

        currentUser = {
            id: payload.user?.id || payload.id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario'
        };

        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.textContent = new Date().toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        return currentUser;
    } catch (error) {
        window.location.href = window.API_BASE_URL + '/';
        return null;
    }
}

function cerrarSesion() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = window.API_BASE_URL + '/';
}

// =====================================================
// VEHÍCULOS
// =====================================================

async function cargarVehiculos() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/mis-vehiculos`, { headers: getAuthHeaders() });
        const data = await response.json();

        if (data.success) {
            vehiculos = data.vehiculos || [];
            const select = document.getElementById('selectVehiculo');
            select.innerHTML = '<option value="">-- Seleccionar vehículo --</option>';
            
            for (const v of vehiculos) {
                const option = document.createElement('option');
                option.value = v.id;
                option.textContent = `${v.marca} ${v.modelo || ''} • ${v.placa}`;
                select.appendChild(option);
            }
        }
    } catch (error) {
        showToast('Error al cargar vehículos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarContenido() {
    const container = document.getElementById('contenidoDinamico');
    if (!container) return;
    
    // Caso 1: No hay vehículo seleccionado
    if (!currentVehiculo) {
        container.innerHTML = `
            <div class="empty-state premium">
                <div class="empty-icon">
                    <i class="fas fa-car-side"></i>
                </div>
                <h3>Selecciona un vehículo</h3>
                <p>Elige tu auto para ver el progreso de la reparación</p>
                <small>Los avances aparecerán automáticamente</small>
            </div>
        `;
        actualizarDashboard(0, 0, null);
        return;
    }
    
    // Caso 2: No hay órdenes activas
    if (!ordenActual) {
        container.innerHTML = `
            <div class="empty-state premium">
                <div class="empty-icon">
                    <i class="fas fa-wrench"></i>
                </div>
                <h3>No hay órdenes activas</h3>
                <p>${escapeHtml(currentVehiculo.marca)} ${escapeHtml(currentVehiculo.modelo || '')} no tiene reparaciones en curso</p>
                <small>Si tienes una reparación agendada, aparecerá aquí</small>
                <button class="btn-primary" style="margin-top: 1rem;" onclick="verInfoOrden()">
                    <i class="fas fa-info-circle"></i> Ver información
                </button>
            </div>
        `;
        actualizarDashboard(0, 0, null);
        return;
    }
    
    // Caso 3: No hay avances aún
    if (!avancesActuales || avancesActuales.length === 0) {
        container.innerHTML = `
            <div class="empty-state premium">
                <div class="empty-icon">
                    <i class="fas fa-hourglass-half"></i>
                </div>
                <h3>Reparación en proceso</h3>
                <p>Tu vehículo está siendo reparado</p>
                <small>Pronto aparecerán las actualizaciones del progreso</small>
                <div class="orden-info-mini">
                    <i class="fas fa-receipt"></i>
                    <span>Orden: ${escapeHtml(ordenActual.codigo_unico)}</span>
                    <span class="separador">•</span>
                    <i class="fas fa-calendar"></i>
                    <span>Ingreso: ${formatDate(ordenActual.fecha_ingreso)}</span>
                </div>
            </div>
        `;
        actualizarDashboard(0, 0, null);
        return;
    }
    
    // Caso 4: Hay avances - RENDERIZAR CONTENIDO COMPLETO
    
    // Calcular estadísticas para dashboard
    const totalFotos = avancesActuales.reduce((sum, a) => sum + (a.fotos?.length || 0), 0);
    const ultimoAvance = avancesActuales[0]?.fecha_aprobacion || avancesActuales[0]?.fecha_creacion;
    
    actualizarDashboard(avancesActuales.length, totalFotos, ultimoAvance);
    
    // Renderizar avances en orden cronológico (del más antiguo al más reciente)
    const avancesOrdenados = [...avancesActuales].reverse();
    
    container.innerHTML = `
        <div class="timeline-avances">
            <div class="timeline-header-avances">
                <h3><i class="fas fa-history"></i> Línea de tiempo de reparación</h3>
                <div class="orden-badge">
                    <i class="fas fa-receipt"></i>
                    <span>Orden: ${escapeHtml(ordenActual.codigo_unico)}</span>
                </div>
            </div>
            <div class="avances-timeline">
                ${avancesOrdenados.map((avance, index) => renderizarAvance(avance, index, avancesOrdenados.length)).join('')}
            </div>
        </div>
    `;

    // 🔥 SOLUCIÓN: Usar requestAnimationFrame + setTimeout para asegurar que el DOM esté listo
    requestAnimationFrame(() => {
        setTimeout(() => {
            cargarFotosClienteProxy();
        }, 50);
    });
}
function actualizarDashboard(totalAvances, totalFotos, ultimoAvance) {
    const totalAvancesEl = document.getElementById('totalAvances');
    const totalFotosEl = document.getElementById('totalFotos');
    const ultimoAvanceEl = document.getElementById('ultimoAvance');
    
    if (totalAvancesEl) totalAvancesEl.textContent = totalAvances;
    if (totalFotosEl) totalFotosEl.textContent = totalFotos;
    if (ultimoAvanceEl) ultimoAvanceEl.textContent = ultimoAvance ? formatRelativeDate(ultimoAvance) : '-';
}

function renderizarAvance(avance, index, total) {
    const fecha = formatDateTime(avance.fecha_aprobacion || avance.fecha_creacion);
    const isFirst = index === 0;
    const isLast = index === total - 1;
    
    let fotosHtml = '';
    if (avance.fotos && avance.fotos.length > 0) {
        const fotosMostrar = avance.fotos.slice(0, 3);
        const totalFotos = avance.fotos.length;
        
        fotosHtml = `
            <div class="avance-fotos-mini-cliente">
                ${fotosMostrar.map((foto, idx) => {
                    const fotoId = `cliente_foto_${avance.id}_${idx}`;
                    const urlEncoded = encodeURIComponent(foto.url);
                    return `
                        <div class="foto-mini-card" onclick="event.stopPropagation(); abrirFotoAmpliadaCliente('${foto.url}', '${escapeHtml(foto.comentario || '')}')">
                            <div class="loader-mini" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;background:var(--gris-oscuro);">
                                <i class="fas fa-spinner fa-spin" style="color:var(--gris-texto);font-size:1rem;"></i>
                            </div>
                            <img id="${fotoId}" src="" 
                                 style="width:100%;height:100%;object-fit:cover;display:none;opacity:0;"
                                 data-url="${urlEncoded}"
                                 onclick="event.stopPropagation(); abrirFotoAmpliadaCliente('${foto.url}', '${escapeHtml(foto.comentario || '')}')">
                        </div>
                    `;
                }).join('')}
                ${totalFotos > 3 ? `<div class="foto-mini-mas" onclick="event.stopPropagation(); verDetalleAvance(${avance.id})">+${totalFotos - 3}</div>` : ''}
            </div>
        `;
    }
    
    return `
        <div class="timeline-item ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}" onclick="verDetalleAvance(${avance.id})">
            <div class="timeline-marker">
                <div class="marker-dot ${isFirst ? 'current' : ''}"></div>
                ${!isLast ? '<div class="marker-line"></div>' : ''}
            </div>
            <div class="timeline-content">
                <div class="avance-header-content">
                    <div class="avance-fecha-badge">
                        <i class="far fa-calendar-alt"></i>
                        <span>${fecha}</span>
                    </div>
                    <div class="avance-arrow">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
                <h4 class="avance-titulo">${escapeHtml(avance.titulo)}</h4>
                ${avance.descripcion ? `<p class="avance-descripcion">${escapeHtml(avance.descripcion)}</p>` : ''}
                ${fotosHtml}
            </div>
        </div>
    `;
}
// =====================================================
// 🔥 CARGAR FOTOS MINIATURA - VERSIÓN CORREGIDA
// =====================================================

async function cargarFotosClienteProxy() {
    console.log('🖼️ Cargando miniaturas del cliente...');
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const miniaturas = document.querySelectorAll('.foto-mini-card img[data-url]');
    console.log(`📸 Encontradas ${miniaturas.length} miniaturas`);
    
    if (miniaturas.length === 0) {
        console.log('⚠️ No hay miniaturas');
        return;
    }
    
    for (const img of miniaturas) {
        const urlEncoded = img.getAttribute('data-url');
        const url = decodeURIComponent(urlEncoded);
        
        const parentCard = img.closest('.foto-mini-card');
        let loader = parentCard ? parentCard.querySelector('.loader-mini') : null;
        
        // Si no encuentra .loader-mini, buscar por ID
        if (!loader && parentCard) {
            loader = parentCard.querySelector('[id^="cliente_loader_"]');
        }
        
        console.log(`🔍 ${img.id}: loader=${loader ? '✅' : '❌'}, url=${url ? '✅' : '❌'}`);
        
        // Si no hay URL, ocultar todo
        if (!url || url === 'null' || url === '' || url === 'undefined') {
            img.style.display = 'none';
            if (loader) loader.style.display = 'none';
            continue;
        }
        
        try {
            // Extraer fileId
            let fileId = null;
            const match1 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            if (match1) fileId = match1[1];
            
            if (!fileId) {
                const match2 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match2) fileId = match2[1];
            }
            
            if (!fileId) {
                console.warn(`⚠️ No se pudo extraer fileId de: ${url.substring(0, 50)}...`);
                img.style.display = 'none';
                if (loader) loader.style.display = 'none';
                continue;
            }
            
            // 🔥 USAR THUMBNAIL DIRECTO
            const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;
            console.log(`📡 Cargando ${img.id} -> thumbnail`);
            
            // Crear nueva imagen para precargar
            const nuevaImg = new Image();
            nuevaImg.crossOrigin = 'anonymous';
            
            nuevaImg.onload = function() {
                // 🔥 ASIGNAR Y FORZAR VISUALIZACIÓN
                img.src = thumbUrl;
                img.style.display = 'block';
                img.style.opacity = '1';
                img.style.visibility = 'visible';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                
                // Ocultar loader
                if (loader) {
                    loader.style.display = 'none';
                    loader.style.opacity = '0';
                }
                
                console.log(`✅ Miniatura VISIBLE: ${img.id}`);
            };
            
            nuevaImg.onerror = function() {
                console.warn(`⚠️ Thumbnail falló para ${img.id}, intentando con proxy...`);
                // Fallback: usar el proxy
                cargarMiniaturaConProxy(img, url, loader);
            };
            
            // Timeout por si tarda demasiado
            setTimeout(() => {
                if (!img.src || img.style.display === 'none' || img.style.display === '') {
                    console.warn(`⏰ Timeout para ${img.id}, usando proxy...`);
                    cargarMiniaturaConProxy(img, url, loader);
                }
            }, 5000);
            
            nuevaImg.src = thumbUrl;
            
        } catch (error) {
            console.error(`❌ Error ${img.id}:`, error);
            img.style.display = 'none';
            if (loader) loader.style.display = 'none';
        }
    }
    
    console.log('✅ Procesamiento de miniaturas completado');
}

// =====================================================
// 🔥 FALLBACK: Cargar con proxy
// =====================================================

async function cargarMiniaturaConProxy(img, url, loader) {
    try {
        const token = getToken();
        if (!token) throw new Error('No hay token');
        
        const proxyUrl = `${window.API_BASE_URL || ''}/api/cliente/proxy-imagen-avance?url=${encodeURIComponent(url)}`;
        console.log(`📡 Proxy fallback: ${img.id}`);
        
        const response = await fetch(proxyUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.base64) {
                img.src = data.base64;
                img.style.display = 'block';
                img.style.opacity = '1';
                img.style.visibility = 'visible';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                
                if (loader) {
                    loader.style.display = 'none';
                    loader.style.opacity = '0';
                }
                console.log(`✅ Proxy fallback: ${img.id}`);
                return;
            }
        }
        throw new Error('Proxy falló');
    } catch (error) {
        console.warn(`⚠️ Proxy fallback falló para ${img.id}`);
        img.style.display = 'none';
        if (loader) loader.style.display = 'none';
    }
}
// =====================================================
// 🔥 FALLBACK: Cargar con proxy si thumbnail falla
// =====================================================

async function cargarConProxy(img, url, loader) {
    const ocultarLoader = () => {
        if (loader) loader.style.display = 'none';
    };
    
    try {
        const token = getToken();
        if (!token) throw new Error('No hay token');
        
        const proxyUrl = `${window.API_BASE_URL || ''}/api/cliente/proxy-imagen-avance?url=${encodeURIComponent(url)}`;
        console.log(`📡 Proxy fallback: ${img.id}`);
        
        const response = await fetch(proxyUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.base64) {
                img.src = data.base64;
                img.style.display = 'block';
                img.style.opacity = '1';
                ocultarLoader();
                console.log(`✅ Proxy fallback: ${img.id}`);
                return;
            }
        }
        throw new Error('Proxy falló');
    } catch (error) {
        console.warn(`⚠️ Proxy fallback falló para ${img.id}:`, error.message);
        img.style.display = 'none';
        ocultarLoader();
    }
}
// =====================================================
// CARGAR DATOS OPTIMIZADO
// =====================================================

async function cargarDatosVehiculo() {
    if (!currentVehiculoId) return;
    
    mostrarLoading(true);
    try {
        // Buscar vehículo seleccionado
        currentVehiculo = vehiculos.find(v => v.id === currentVehiculoId);
        
        // Obtener órdenes del vehículo
        const ordenesRes = await fetch(`${API_URL}/ordenes-vehiculo/${currentVehiculoId}`, { headers: getAuthHeaders() });
        const ordenesData = await ordenesRes.json();
        
        if (ordenesData.success && ordenesData.ordenes?.length > 0) {
            ordenActual = ordenesData.ordenes[0];
            
            // Obtener avances de la orden
            const avancesRes = await fetch(`${API_URL}/avances-orden/${ordenActual.id}`, { headers: getAuthHeaders() });
            const avancesData = await avancesRes.json();
            
            avancesActuales = avancesData.success ? (avancesData.avances || []) : [];
        } else {
            ordenActual = null;
            avancesActuales = [];
        }
        
        renderizarContenido();
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar datos', 'error');
        renderizarContenido();
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE DEL AVANCE - CON FOTOS EN CUADROS PEQUEÑOS
// =====================================================

window.verDetalleAvance = function(avanceId) {
    const avance = avancesActuales.find(a => a.id === avanceId);
    if (!avance) return;
    
    const modalTitulo = document.getElementById('modalTitulo');
    const modalCuerpo = document.getElementById('modalCuerpo');
    
    if (modalTitulo) modalTitulo.textContent = avance.titulo;
    
    const fecha = formatDateTime(avance.fecha_aprobacion || avance.fecha_creacion);
    
    // 🔥 GENERAR FOTOS EN CUADROS PEQUEÑOS (como en técnico)
    let fotosHtml = '';
    if (avance.fotos && avance.fotos.length > 0) {
        fotosHtml = `
            <div class="modal-fotos-grid-cliente">
                ${avance.fotos.map((foto, idx) => {
                    const fotoId = `modal_foto_${avance.id}_${idx}`;
                    const loaderId = `modal_loader_${avance.id}_${idx}`;
                    const urlEncoded = encodeURIComponent(foto.url);
                    return `
                        <div class="modal-foto-card-cliente" onclick="abrirFotoAmpliadaCliente('${foto.url}', '${escapeHtml(foto.comentario || '')}')" style="position:relative;overflow:hidden;border-radius:var(--radius-sm);cursor:pointer;aspect-ratio:1;background:var(--gris-oscuro);">
                            <div id="${loaderId}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;">
                                <i class="fas fa-spinner fa-spin" style="color:var(--gris-texto);font-size:1.5rem;"></i>
                            </div>
                            <img id="${fotoId}" src="" 
                                 style="width:100%;height:100%;object-fit:cover;display:none;opacity:0;"
                                 data-url="${urlEncoded}"
                                 onclick="event.stopPropagation(); abrirFotoAmpliadaCliente('${foto.url}', '${escapeHtml(foto.comentario || '')}')">
                            ${foto.comentario ? `<div class="modal-foto-caption-cliente">${escapeHtml(foto.comentario)}</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } else {
        fotosHtml = '<div class="detalle-sin-fotos"><i class="fas fa-image"></i><p>No hay fotos disponibles</p></div>';
    }
    
    if (modalCuerpo) {
        modalCuerpo.innerHTML = `
            <div class="detalle-avance-cliente">
                <div class="detalle-meta-cliente">
                    <div class="meta-item-cliente">
                        <i class="far fa-calendar-alt"></i>
                        <span>${fecha}</span>
                    </div>
                    <div class="meta-item-cliente">
                        <i class="fas fa-receipt"></i>
                        <span>Orden: ${escapeHtml(ordenActual?.codigo_unico || 'N/A')}</span>
                    </div>
                    <div class="meta-item-cliente">
                        <i class="fas fa-car"></i>
                        <span>${escapeHtml(currentVehiculo?.marca)} ${escapeHtml(currentVehiculo?.modelo || '')}</span>
                    </div>
                </div>
                
                ${avance.descripcion ? `
                    <div class="detalle-descripcion-cliente">
                        <h4><i class="fas fa-align-left"></i> Descripción</h4>
                        <p>${escapeHtml(avance.descripcion)}</p>
                    </div>
                ` : ''}
                
                <div class="detalle-fotos-section-cliente">
                    <h4><i class="fas fa-images"></i> Fotos (${avance.fotos?.length || 0})</h4>
                    ${fotosHtml}
                </div>
            </div>
        `;
    }
    
    abrirModal('modalDetalle');
    
    // 🔥 CARGAR FOTOS DEL MODAL CON PROXY
    setTimeout(() => {
        cargarFotosModalClienteProxy();
    }, 200);
};
// =====================================================
// 🔥 ABRIR FOTO AMPLIADA (MODAL GRANDE) - CLIENTE
// =====================================================

window.abrirFotoAmpliadaCliente = async function(url, caption) {
    if (!url) return;
    
    // Crear modal si no existe
    let modal = document.getElementById('fotoAmpliadaModalCliente');
    if (!modal) {
        const modalHtml = `
            <div class="modal" id="fotoAmpliadaModalCliente" onclick="cerrarFotoAmpliadaCliente()">
                <div class="modal-content" style="max-width: 90%; max-height: 95vh; background: var(--bg-card); padding: 1rem;" onclick="event.stopPropagation()">
                    <div class="modal-header" style="border-bottom: 1px solid var(--gris-oscuro); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                        <h3 style="font-size: 1rem;"><i class="fas fa-image"></i> Foto Ampliada</h3>
                        <button class="modal-close" onclick="cerrarFotoAmpliadaCliente()" style="background: none; border: none; font-size: 1.5rem; color: var(--gris-texto); cursor: pointer;">&times;</button>
                    </div>
                    <div class="modal-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0.5rem;background:var(--negro);border-radius:var(--radius-md);position:relative;min-height:300px;">
                        <div id="fotoAmpliadaLoaderCliente" style="position:absolute;color:white;font-size:1.2rem;z-index:5;">
                            <i class="fas fa-spinner fa-spin"></i> Cargando...
                        </div>
                        <img id="fotoAmpliadaImgCliente" src="" alt="Foto ampliada" 
                             style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:var(--radius-md);display:none;">
                        <div id="fotoAmpliadaCaptionCliente" style="color:var(--gris-texto);font-size:0.9rem;margin-top:0.5rem;text-align:center;display:none;width:100%;padding:0.5rem;background:var(--gris-oscuro);border-radius:var(--radius-sm);"></div>
                    </div>
                    <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:0.5rem;padding-top:0.5rem;">
                        <button class="btn-secondary" onclick="cerrarFotoAmpliadaCliente()" style="padding:0.5rem 1rem;font-size:0.9rem;">
                            <i class="fas fa-times"></i> Cerrar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('fotoAmpliadaModalCliente');
    }
    
    const img = document.getElementById('fotoAmpliadaImgCliente');
    const loader = document.getElementById('fotoAmpliadaLoaderCliente');
    const captionDiv = document.getElementById('fotoAmpliadaCaptionCliente');
    
    if (!img) return;
    
    // Resetear estados
    img.style.display = 'none';
    img.src = '';
    if (loader) {
        loader.style.display = 'flex';
        loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    }
    if (captionDiv) {
        if (caption) {
            captionDiv.textContent = caption;
            captionDiv.style.display = 'block';
        } else {
            captionDiv.style.display = 'none';
        }
    }
    
    // Abrir modal
    modal.classList.add('show');
    
    try {
        const token = getToken();
        if (!token) {
            throw new Error('No hay token de autenticación');
        }
        
        const proxyUrl = `${window.API_BASE_URL || ''}/api/cliente/proxy-imagen-avance?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.base64) {
            // Pre-cargar la imagen
            const nuevaImg = new Image();
            nuevaImg.onload = function() {
                img.src = data.base64;
                img.style.display = 'block';
                if (loader) loader.style.display = 'none';
            };
            nuevaImg.onerror = function() {
                if (loader) {
                    loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error al cargar imagen';
                    loader.style.display = 'flex';
                }
                showToast('Error al cargar la imagen', 'error');
            };
            nuevaImg.src = data.base64;
        } else {
            throw new Error(data.error || 'Error al obtener la imagen');
        }
    } catch (error) {
        console.error('Error cargando foto ampliada:', error);
        if (loader) {
            loader.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
            loader.style.display = 'flex';
        }
        showToast('Error al cargar la imagen', 'error');
    }
};

// =====================================================
// CERRAR FOTO AMPLIADA (CLIENTE)
// =====================================================

function cerrarFotoAmpliadaCliente() {
    const modal = document.getElementById('fotoAmpliadaModalCliente');
    if (modal) modal.classList.remove('show');
    const img = document.getElementById('fotoAmpliadaImgCliente');
    if (img) {
        img.src = '';
        img.style.display = 'none';
    }
    const loader = document.getElementById('fotoAmpliadaLoaderCliente');
    if (loader) {
        loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
        loader.style.display = 'none';
    }
}
// =====================================================
// 🔥 CARGAR FOTOS DEL MODAL CLIENTE CON PROXY
// =====================================================

async function cargarFotosModalClienteProxy() {
    console.log('🖼️ Cargando fotos del modal cliente con proxy...');
    
    const fotos = document.querySelectorAll('#modalCuerpo img[data-url]');
    console.log(`📸 Encontradas ${fotos.length} fotos en modal`);
    
    for (const img of fotos) {
        const urlEncoded = img.getAttribute('data-url');
        const url = decodeURIComponent(urlEncoded);
        
        let loader = null;
        const parent = img.closest('.modal-foto-card-cliente');
        if (parent) {
            loader = parent.querySelector('[id^="modal_loader_"]');
        }
        
        const ocultarLoader = () => {
            if (loader) loader.style.display = 'none';
        };
        
        if (!url || url === 'null' || url === '' || url === 'undefined') {
            img.style.display = 'none';
            ocultarLoader();
            continue;
        }
        
        try {
            const token = getToken();
            if (!token) {
                throw new Error('No hay token');
            }
            
            const proxyUrl = `${window.API_BASE_URL || ''}/api/cliente/proxy-imagen-avance?url=${encodeURIComponent(url)}`;
            
            const response = await fetch(proxyUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.base64) {
                const nuevaImg = new Image();
                nuevaImg.onload = function() {
                    img.src = data.base64;
                    img.style.display = 'block';
                    img.style.opacity = '1';
                    ocultarLoader();
                };
                nuevaImg.onerror = function() {
                    console.error(`❌ Error en foto modal: ${img.id}`);
                    img.style.display = 'none';
                    ocultarLoader();
                };
                nuevaImg.src = data.base64;
            } else {
                throw new Error(data.error || 'Error al cargar');
            }
        } catch (error) {
            console.error('Error cargando foto modal:', error);
            img.style.display = 'none';
            ocultarLoader();
        }
    }
}
window.verInfoOrden = function() {
    if (!ordenActual && currentVehiculo) {
        // Mostrar información de que no hay orden activa
        const modalCuerpo = document.getElementById('modalOrdenCuerpo');
        if (modalCuerpo) {
            modalCuerpo.innerHTML = `
                <div class="info-orden-detalle">
                    <div class="info-icon">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <h4>No hay reparaciones activas</h4>
                    <p>Actualmente, el vehículo <strong>${escapeHtml(currentVehiculo.marca)} ${escapeHtml(currentVehiculo.modelo || '')}</strong> (${escapeHtml(currentVehiculo.placa)}) no tiene ninguna orden de trabajo activa.</p>
                    <p>Si deseas agendar una revisión o reparación, por favor contáctanos.</p>
                    <div class="contacto-info">
                        <i class="fas fa-phone"></i>
                        <span>+591 12345678</span>
                        <i class="fas fa-envelope"></i>
                        <span>servicio@furiamotor.com</span>
                    </div>
                </div>
            `;
        }
        abrirModal('modalOrden');
        return;
    }
    
    if (ordenActual) {
        const modalCuerpo = document.getElementById('modalOrdenCuerpo');
        if (modalCuerpo) {
            modalCuerpo.innerHTML = `
                <div class="info-orden-detalle">
                    <div class="info-icon success">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h4>Orden de Trabajo Activa</h4>
                    <div class="orden-info-grid">
                        <div class="orden-info-item">
                            <span class="label">Código de Orden:</span>
                            <span class="value">${escapeHtml(ordenActual.codigo_unico)}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="label">Fecha de Ingreso:</span>
                            <span class="value">${formatDate(ordenActual.fecha_ingreso)}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="label">Estado Actual:</span>
                            <span class="value estado">${ordenActual.estado_global || 'En proceso'}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="label">Vehículo:</span>
                            <span class="value">${escapeHtml(currentVehiculo.marca)} ${escapeHtml(currentVehiculo.modelo || '')} (${escapeHtml(currentVehiculo.placa)})</span>
                        </div>
                    </div>
                    <p>Tu vehículo está siendo atendido. Los técnicos están trabajando para tenerlo listo lo antes posible.</p>
                </div>
            `;
        }
        abrirModal('modalOrden');
    }
};

window.abrirFoto = async function(url, caption) {
    if (!url) return;
    
    const img = document.getElementById('fotoAmpliada');
    const captionDiv = document.getElementById('fotoCaption');
    const loader = document.getElementById('fotoAmpliadaLoader');
    
    if (!img) return;
    
    // Resetear estados
    img.style.display = 'none';
    img.src = '';
    if (loader) {
        loader.style.display = 'flex';
        loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    }
    if (captionDiv) {
        if (caption) {
            captionDiv.innerHTML = caption;
            captionDiv.style.display = 'block';
        } else {
            captionDiv.style.display = 'none';
        }
    }
    
    document.getElementById('modalFoto').classList.add('show');
    
    try {
        const token = getToken();
        if (!token) {
            throw new Error('No hay token');
        }
        
        const proxyUrl = `${window.API_BASE_URL || ''}/api/cliente/proxy-imagen-avance?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.base64) {
            const nuevaImg = new Image();
            nuevaImg.onload = function() {
                img.src = data.base64;
                img.style.display = 'block';
                if (loader) loader.style.display = 'none';
            };
            nuevaImg.onerror = function() {
                if (loader) {
                    loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
                    loader.style.display = 'flex';
                }
                showToast('Error al cargar la imagen', 'error');
            };
            nuevaImg.src = data.base64;
        } else {
            throw new Error(data.error || 'Error al cargar');
        }
    } catch (error) {
        console.error('Error abriendo foto:', error);
        if (loader) {
            loader.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
            loader.style.display = 'flex';
        }
        showToast('Error al cargar la imagen', 'error');
    }
};
// =====================================================
// 🔥 OBTENER TOKEN
// =====================================================

function getToken() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    if (!token) token = sessionStorage.getItem('token');
    return token;
}

function cerrarModalFoto() {
    document.getElementById('modalFoto').classList.remove('show');
    const img = document.getElementById('fotoAmpliada');
    if (img) img.src = '';
}

function abrirModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

// =====================================================
// EVENTOS
// =====================================================

function setupEventListeners() {
    const selectVehiculo = document.getElementById('selectVehiculo');
    if (selectVehiculo) {
        selectVehiculo.addEventListener('change', (e) => {
            currentVehiculoId = parseInt(e.target.value);
            if (currentVehiculoId) {
                cargarDatosVehiculo();
            } else {
                currentVehiculo = null;
                ordenActual = null;
                avancesActuales = [];
                renderizarContenido();
            }
        });
    }
    
    const btnVer = document.getElementById('btnVerAvances');
    if (btnVer) {
        btnVer.addEventListener('click', () => {
            if (currentVehiculoId) {
                cargarDatosVehiculo();
            } else {
                showToast('Selecciona un vehículo primero', 'warning');
            }
        });
    }
    
    // Cerrar modales al hacer clic fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
}

// =====================================================
// INICIO
// =====================================================

async function inicializar() {
    console.log('🚀 Inicializando avances.js');
    console.log('📡 API_BASE_URL:', window.API_BASE_URL);
    
    mostrarLoading(true);
    try {
        await cargarUsuarioActual();
        await cargarVehiculos();
        setupEventListeners();
        renderizarContenido();
        console.log('✅ avances.js inicializado correctamente');
    } catch (error) {
        console.error('Error en inicialización:', error);
    } finally {
        mostrarLoading(false);
    }
}

// Exponer funciones globales
window.cerrarSesion = cerrarSesion;
window.cerrarModal = cerrarModal;
window.verDetalleAvance = verDetalleAvance;
window.verInfoOrden = verInfoOrden;
window.abrirFoto = abrirFoto;
window.cerrarModalFoto = cerrarModalFoto;
window.abrirFotoAmpliadaCliente = abrirFotoAmpliadaCliente; 
window.cerrarFotoAmpliadaCliente = cerrarFotoAmpliadaCliente;
document.addEventListener('DOMContentLoaded', inicializar);