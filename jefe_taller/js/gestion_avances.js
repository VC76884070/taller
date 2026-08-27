// =====================================================
// GESTION_AVANCES.JS - JEFE DE TALLER (VERSIÓN OPTIMIZADA)
// SOLO ÚLTIMOS 10 AVANCES - CARGA RÁPIDA
// VERSIÓN CORREGIDA - USA VARIABLE GLOBAL DE INCLUDE.JS
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
// La variable API_BASE_URL ya está declarada en include.js como window.API_BASE_URL
// Si por alguna razón no existe (página cargada sola), la creamos
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 gestion_avances.js - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 gestion_avances.js - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

const API_URL = window.API_BASE_URL + '/api/jefe-taller/avances';

let token = null;
let currentUser = null;
let avancesPendientes = [];
let avancesProcesados = [];

// Control de polling y caché
let pollingInterval = null;
let isUpdating = false;
let lastPendientesFetch = 0;
let lastProcesadosFetch = 0;

// TTL en milisegundos
const CACHE_TTL = {
    pendientes: 15000,   // 15 segundos
    procesados: 30000,   // 30 segundos
    contador: 30000      // 30 segundos
};

console.log('🔧 Iniciando configuración de gestion_avances.js (VERSIÓN OPTIMIZADA)');
console.log('📍 API_URL configurada:', API_URL);

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================
// =====================================================
// FUNCIONES PARA ARCHIVOS DE GOOGLE DRIVE
// =====================================================

/**
 * Extrae el file_id de una URL de Google Drive
 */
function extraerFileIdDrive(url) {
    if (!url) return null;
    url = url.trim();
    
    const patterns = [
        /[?&]id=([a-zA-Z0-9_-]+)/,
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /open\?id=([a-zA-Z0-9_-]+)/,
        /\/d\/([a-zA-Z0-9_-]+)/,
        /thumbnail\?id=([a-zA-Z0-9_-]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    
    if (/^[a-zA-Z0-9_-]{10,}$/.test(url)) return url;
    return null;
}

/**
 * Carga una imagen desde Google Drive usando el proxy
 */
async function cargarImagenProxy(url, imgElement, loaderElement = null) {
    if (!url) {
        if (imgElement) imgElement.style.display = 'none';
        return null;
    }
    
    if (loaderElement) loaderElement.style.display = 'flex';
    if (imgElement) {
        imgElement.style.display = 'none';
        imgElement.style.opacity = '0';
    }
    
    try {
        const proxyUrl = `${API_URL.replace('/avances', '')}/proxy-imagen?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success && data.base64) {
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
                        loaderElement.innerHTML = '<i class="fas fa-image"></i>';
                        loaderElement.style.display = 'flex';
                    }
                    resolve(null);
                };
                nuevaImg.src = data.base64;
            });
        } else {
            if (loaderElement) loaderElement.style.display = 'none';
            return null;
        }
    } catch (error) {
        console.error('Error cargando imagen:', error);
        if (loaderElement) loaderElement.style.display = 'none';
        return null;
    }
}

/**
 * Carga múltiples imágenes en un contenedor
 */
async function cargarImagenesEnContenedor(containerId, fotos) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Limpiar el contenedor y mostrar loaders
    container.innerHTML = '';
    
    if (!fotos || fotos.length === 0) {
        container.innerHTML = '<p class="no-fotos">No hay fotos registradas</p>';
        return;
    }
    
    // Crear contenedor de grid
    const grid = document.createElement('div');
    grid.className = 'detalle-fotos-grid';
    container.appendChild(grid);
    
    fotos.forEach((foto, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'detalle-foto-item';
        
        // Loader
        const loaderDiv = document.createElement('div');
        loaderDiv.className = 'foto-loader';
        loaderDiv.id = `loader_${index}`;
        loaderDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        loaderDiv.style.display = 'flex';
        loaderDiv.style.alignItems = 'center';
        loaderDiv.style.justifyContent = 'center';
        loaderDiv.style.minHeight = '100px';
        loaderDiv.style.background = 'var(--gris-oscuro)';
        loaderDiv.style.borderRadius = 'var(--radius-sm)';
        itemDiv.appendChild(loaderDiv);
        
        // Imagen
        const img = document.createElement('img');
        img.id = `img_${index}`;
        img.style.display = 'none';
        img.style.width = '100%';
        img.style.height = '200px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = 'var(--radius-sm)';
        img.style.cursor = 'pointer';
        img.onclick = () => verFotoAmpliada(foto.url);
        itemDiv.appendChild(img);
        
        // Comentario
        if (foto.comentario) {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'detalle-foto-comentario';
            commentDiv.textContent = foto.comentario;
            itemDiv.appendChild(commentDiv);
        }
        
        grid.appendChild(itemDiv);
        
        // Cargar imagen
        cargarImagenProxy(foto.url, img, loaderDiv);
    });
}
function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    if (!token) token = sessionStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
        return dateStr;
    }
}

function showToast(message, type = 'info') {
    console.log(`📢 Toast [${type}]: ${message}`);
    
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
    if (modal) modal.classList.remove('show');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

function statusBadge(estado) {
    const map = {
        'pendiente': 'status-pendiente',
        'aprobado': 'status-aprobado',
        'rechazado': 'status-rechazado'
    };
    const textos = {
        'pendiente': 'Pendiente',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado'
    };
    const iconos = {
        'pendiente': 'fa-clock',
        'aprobado': 'fa-check-circle',
        'rechazado': 'fa-times-circle'
    };
    return `<span class="status-badge ${map[estado]}"><i class="fas ${iconos[estado]}"></i> ${textos[estado]}</span>`;
}

// =====================================================
// CARGA DE DATOS OPTIMIZADA (SOLO ÚLTIMOS 10)
// =====================================================

async function cargarAvancesPendientes(forceRefresh = false) {
    if (isUpdating && !forceRefresh) return;
    
    const now = Date.now();
    
    // Usar caché si no se fuerza actualización
    if (!forceRefresh && avancesPendientes.length > 0 && (now - lastPendientesFetch) < CACHE_TTL.pendientes) {
        console.log('📦 Usando caché de avances pendientes');
        renderizarAvancesPendientes();
        return;
    }
    
    console.log('🔄 Cargando últimos 10 avances pendientes...');
    mostrarLoading(true);
    isUpdating = true;
    
    try {
        const search = document.getElementById('searchPendientes')?.value.toLowerCase() || '';
        const timestamp = new Date().getTime();
        const url = `${API_URL}/pendientes?_=${timestamp}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();

        if (data.success) {
            let avances = data.avances || [];
            console.log(`✅ Avances pendientes encontrados: ${avances.length} (últimos 10)`);
            
            if (search) {
                avances = avances.filter(a => 
                    (a.titulo || '').toLowerCase().includes(search) ||
                    (a.tecnico_nombre || '').toLowerCase().includes(search) ||
                    (a.orden_codigo || '').toLowerCase().includes(search)
                );
            }
            
            avancesPendientes = avances;
            lastPendientesFetch = Date.now();
            renderizarAvancesPendientes();
            
            // Actualizar badge con contador TOTAL (no solo los últimos 10)
            actualizarContadorPendientes();
        } else {
            throw new Error(data.error || 'Error al cargar avances pendientes');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error al cargar avances pendientes: ' + error.message, 'error');
    } finally {
        mostrarLoading(false);
        isUpdating = false;
    }
}

async function actualizarContadorPendientes() {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_URL}/contador?_=${timestamp}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            const badge = document.getElementById('pendientesCount');
            if (badge) {
                const count = data.pendientes_count;
                badge.textContent = count;
                // Mostrar indicador visual si hay más de 10
                if (count > 10) {
                    badge.title = `Hay ${count} avances pendientes en total. Mostrando los últimos 10.`;
                    badge.style.cursor = 'help';
                }
            }
        }
    } catch (error) {
        console.error('Error actualizando contador:', error);
    }
}

async function cargarAvancesProcesados(forceRefresh = false) {
    if (isUpdating && !forceRefresh) return;
    
    const now = Date.now();
    
    if (!forceRefresh && avancesProcesados.length > 0 && (now - lastProcesadosFetch) < CACHE_TTL.procesados) {
        console.log('📦 Usando caché de avances procesados');
        renderizarAvancesProcesados();
        return;
    }
    
    console.log('🔄 Cargando avances procesados...');
    mostrarLoading(true);
    
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchAprobados')?.value.toLowerCase() || '';
        const timestamp = new Date().getTime();
        
        let url = `${API_URL}/procesados?_=${timestamp}`;
        if (estado !== 'all') url += `&estado=${estado}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders(),
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();

        if (data.success) {
            let avances = data.avances || [];
            console.log(`✅ Avances procesados encontrados: ${avances.length}`);
            
            if (search) {
                avances = avances.filter(a => 
                    (a.titulo || '').toLowerCase().includes(search) ||
                    (a.tecnico_nombre || '').toLowerCase().includes(search) ||
                    (a.orden_codigo || '').toLowerCase().includes(search)
                );
            }
            
            avancesProcesados = avances;
            lastProcesadosFetch = Date.now();
            renderizarAvancesProcesados();
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error al cargar avances procesados', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarAvancesPendientes() {
    const container = document.getElementById('avancesPendientesContainer');
    if (!container) return;

    console.log(`🎨 Renderizando ${avancesPendientes.length} avances pendientes`);

    if (avancesPendientes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>No hay avances pendientes de revisión</p>
            </div>
        `;
        return;
    }

    const totalBadge = document.getElementById('pendientesCount');
    const hayMas = totalBadge && parseInt(totalBadge.textContent) > 10;
    
    const hayMasHtml = hayMas ? `
        <div class="info-banner">
            <i class="fas fa-info-circle"></i>
            Mostrando los últimos 10 avances. Hay <strong>${totalBadge.textContent}</strong> avances pendientes en total.
        </div>
    ` : '';

    container.innerHTML = hayMasHtml + avancesPendientes.map((avance, index) => {
        const fotos = avance.fotos || [];
        
        // 🔥 INDICADOR DE ACTUALIZACIÓN
        let badgeActualizacion = '';
        if (avance.es_actualizado) {
            badgeActualizacion = `
                <span class="update-badge">
                    <i class="fas fa-sync-alt fa-pulse"></i> 
                    Actualizado ${avance.numero_actualizaciones ? `(${avance.numero_actualizaciones}x)` : ''}
                </span>
            `;
        }
        
        const fotosHtml = fotos.length > 0 ? `
            <div class="avance-fotos" id="fotosPreview_${avance.id}">
                ${fotos.slice(0, 3).map((f, i) => `
                    <div class="foto-mini-wrapper" style="display:inline-block; position:relative; width:50px; height:50px; margin-right:4px; border-radius:4px; overflow:hidden; background:var(--gris-oscuro);">
                        <div id="miniLoader_${avance.id}_${i}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;">
                            <i class="fas fa-spinner fa-spin" style="font-size:12px; color:var(--gris-texto);"></i>
                        </div>
                        <img id="miniImg_${avance.id}_${i}" 
                             src="" 
                             style="display:none; width:100%; height:100%; object-fit:cover; cursor:pointer;"
                             onclick="event.stopPropagation(); verFotoAmpliada('${f.url}')"
                             data-url="${f.url}"
                             data-avance-id="${avance.id}"
                             data-index="${i}">
                    </div>
                `).join('')}
                ${fotos.length > 3 ? `<span class="avance-foto-mas">+${fotos.length - 3}</span>` : ''}
            </div>
        ` : '';

        // 🔥 MOSTRAR FECHA DE ACTUALIZACIÓN SI EXISTE
        const fechaDisplay = avance.fecha_actualizacion ? 
            `<span class="update-date"><i class="far fa-clock"></i> Última actualización: ${formatDate(avance.fecha_actualizacion)}</span>` :
            `<span class="avance-fecha">${formatDate(avance.fecha_creacion)}</span>`;

        return `
            <div class="avance-card ${avance.es_actualizado ? 'card-updated' : ''}" data-avance-id="${avance.id}">
                <div class="avance-card-header">
                    <span class="avance-titulo">
                        ${escapeHtml(avance.titulo)}
                        ${badgeActualizacion}
                    </span>
                    ${fechaDisplay}
                </div>
                <div class="avance-card-body">
                    <div class="avance-descripcion">${escapeHtml(avance.descripcion || 'Sin descripción')}</div>
                    ${fotosHtml}
                    <div class="avance-info-row">
                        <span class="avance-tecnico"><i class="fas fa-user"></i> ${escapeHtml(avance.tecnico_nombre)}</span>
                        <span class="avance-orden"><i class="fas fa-tag"></i> ${escapeHtml(avance.orden_codigo)}</span>
                    </div>
                    ${avance.comentario_revision ? `
                        <div class="avance-info-row" style="margin-top: 0.5rem;">
                            <span style="font-size: 0.7rem; color: var(--gris-texto);">
                                <i class="fas fa-comment"></i> Comentario anterior: ${escapeHtml(avance.comentario_revision)}
                            </span>
                        </div>
                    ` : ''}
                </div>
                <div class="avance-card-footer">
                    <button class="action-btn view" onclick="verDetalleAvance(${avance.id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    <button class="action-btn approve" onclick="abrirModalAprobar(${avance.id})">
                        <i class="fas fa-check-circle"></i> Aprobar
                    </button>
                    <button class="action-btn reject" onclick="abrirModalRechazar(${avance.id})">
                        <i class="fas fa-times-circle"></i> Rechazar
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Cargar miniaturas después de renderizar
    setTimeout(() => {
        avancesPendientes.forEach(avance => {
            const fotos = avance.fotos || [];
            fotos.slice(0, 3).forEach((f, i) => {
                const imgElement = document.getElementById(`miniImg_${avance.id}_${i}`);
                const loaderElement = document.getElementById(`miniLoader_${avance.id}_${i}`);
                if (imgElement && f.url) {
                    cargarImagenProxy(f.url, imgElement, loaderElement);
                }
            });
        });
    }, 100);
}
function renderizarAvancesProcesados() {
    const container = document.getElementById('avancesAprobadosContainer');
    if (!container) return;

    console.log(`🎨 Renderizando ${avancesProcesados.length} avances procesados`);

    if (avancesProcesados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-archive"></i>
                <p>No hay avances procesados</p>
            </div>
        `;
        return;
    }

    container.innerHTML = avancesProcesados.map((avance) => {
        const fotos = avance.fotos || [];
        const fotosHtml = fotos.length > 0 ? `
            <div class="avance-fotos" id="fotosPreviewProc_${avance.id}">
                ${fotos.slice(0, 3).map((f, i) => `
                    <div class="foto-mini-wrapper" style="display:inline-block; position:relative; width:50px; height:50px; margin-right:4px; border-radius:4px; overflow:hidden; background:var(--gris-oscuro);">
                        <div id="miniLoaderProc_${avance.id}_${i}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%;">
                            <i class="fas fa-spinner fa-spin" style="font-size:12px; color:var(--gris-texto);"></i>
                        </div>
                        <img id="miniImgProc_${avance.id}_${i}" 
                             src="" 
                             style="display:none; width:100%; height:100%; object-fit:cover; cursor:pointer;"
                             onclick="event.stopPropagation(); verFotoAmpliada('${f.url}')"
                             data-url="${f.url}"
                             data-avance-id="${avance.id}"
                             data-index="${i}">
                    </div>
                `).join('')}
                ${fotos.length > 3 ? `<span class="avance-foto-mas">+${fotos.length - 3}</span>` : ''}
            </div>
        ` : '';

        return `
            <div class="avance-card">
                <div class="avance-card-header">
                    <span class="avance-titulo">${escapeHtml(avance.titulo)}</span>
                    <span class="avance-fecha">${formatDate(avance.fecha_creacion)}</span>
                </div>
                <div class="avance-card-body">
                    <div class="avance-descripcion">${escapeHtml(avance.descripcion || 'Sin descripción')}</div>
                    ${fotosHtml}
                    <div class="avance-info-row">
                        <span class="avance-tecnico"><i class="fas fa-user"></i> ${escapeHtml(avance.tecnico_nombre)}</span>
                        <span class="avance-orden"><i class="fas fa-tag"></i> ${escapeHtml(avance.orden_codigo)}</span>
                    </div>
                    ${avance.comentario_revision ? `
                        <div class="avance-info-row" style="margin-top: 0.5rem;">
                            <span style="font-size: 0.7rem; color: var(--gris-texto);">
                                <i class="fas fa-comment"></i> ${escapeHtml(avance.comentario_revision)}
                            </span>
                        </div>
                    ` : ''}
                </div>
                <div class="avance-card-footer">
                    ${statusBadge(avance.estado)}
                    <button class="action-btn view" onclick="verDetalleAvance(${avance.id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // 🔥 Cargar las miniaturas después de renderizar
    setTimeout(() => {
        avancesProcesados.forEach(avance => {
            const fotos = avance.fotos || [];
            fotos.slice(0, 3).forEach((f, i) => {
                const imgElement = document.getElementById(`miniImgProc_${avance.id}_${i}`);
                const loaderElement = document.getElementById(`miniLoaderProc_${avance.id}_${i}`);
                if (imgElement && f.url) {
                    cargarImagenProxy(f.url, imgElement, loaderElement);
                }
            });
        });
    }, 100);
}

// =====================================================
// POLLING OPTIMIZADO (SOLO EN PESTAÑA ACTIVA)
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(() => {
        if (!document.hidden && !isUpdating) {
            const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
            
            if (activeTab === 'tab-pendientes') {
                cargarAvancesPendientes();
            } else if (activeTab === 'tab-aprobados') {
                cargarAvancesProcesados();
            }
        }
    }, 30000); // 30 segundos
}

window.verDetalleAvance = async function(avanceId) {
    console.log(`🔍 Ver detalle del avance ${avanceId}`);
    mostrarLoading(true);
    
    try {
        const url = `${API_URL}/detalle/${avanceId}`;
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();

        if (!data.success) {
            showToast(data.error || 'Error al cargar detalle', 'error');
            return;
        }

        const avance = data.avance;
        const fotos = avance.fotos || [];

        // 🔥 INDICADOR DE ACTUALIZACIÓN EN EL DETALLE
        let badgeActualizacion = '';
        if (avance.es_actualizado) {
            badgeActualizacion = `
                <div class="update-info-banner">
                    <i class="fas fa-sync-alt fa-pulse"></i>
                    <strong>¡Este avance ha sido actualizado!</strong>
                    ${avance.numero_actualizaciones ? ` (${avance.numero_actualizaciones} actualizaciones)` : ''}
                    ${avance.fecha_actualizacion ? ` - Última actualización: ${formatDate(avance.fecha_actualizacion)}` : ''}
                </div>
            `;
        }

        const modalBody = document.getElementById('detalleAvanceBody');
        modalBody.innerHTML = `
            <div class="orden-info-card">
                ${badgeActualizacion}
                <p><strong><i class="fas fa-tag"></i> Título:</strong> ${escapeHtml(avance.titulo)}</p>
                <p><strong><i class="fas fa-align-left"></i> Descripción:</strong> ${escapeHtml(avance.descripcion || 'Sin descripción')}</p>
                <p><strong><i class="fas fa-user"></i> Técnico:</strong> ${escapeHtml(avance.tecnico_nombre)}</p>
                <p><strong><i class="fas fa-clipboard-list"></i> Orden:</strong> ${escapeHtml(avance.orden_codigo)}</p>
                <p><strong><i class="fas fa-calendar"></i> Fecha de creación:</strong> ${formatDate(avance.fecha_creacion)}</p>
                ${avance.fecha_actualizacion ? `<p><strong><i class="fas fa-edit"></i> Última actualización:</strong> ${formatDate(avance.fecha_actualizacion)}</p>` : ''}
                <p><strong><i class="fas fa-chart-line"></i> Estado:</strong> ${statusBadge(avance.estado)}</p>
                ${avance.comentario_revision ? `<p><strong><i class="fas fa-comment"></i> Comentario de revisión:</strong> ${escapeHtml(avance.comentario_revision)}</p>` : ''}
                ${avance.fecha_aprobacion ? `<p><strong><i class="fas fa-check-circle"></i> Fecha de aprobación:</strong> ${formatDate(avance.fecha_aprobacion)}</p>` : ''}
            </div>
            <div class="fotos-section">
                <h4><i class="fas fa-images"></i> Fotos del avance (${fotos.length})</h4>
                <div id="detalleFotosContainer"></div>
            </div>
        `;

        // Cargar las fotos
        if (fotos.length > 0) {
            await cargarImagenesEnContenedor('detalleFotosContainer', fotos);
        } else {
            document.getElementById('detalleFotosContainer').innerHTML = '<p class="no-fotos">No hay fotos registradas</p>';
        }

        abrirModal('modalDetalleAvance');
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error al cargar detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
};

window.verFotoAmpliada = function(url) {
    document.getElementById('fotoAmpliada').src = url;
    const modal = document.getElementById('modalFoto');
    if (modal) modal.classList.add('show');
};

function cerrarModalFoto() {
    const modal = document.getElementById('modalFoto');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// APROBAR AVANCE
// =====================================================

let currentAvanceId = null;

window.abrirModalAprobar = async function(avanceId) {
    const avance = avancesPendientes.find(a => a.id === avanceId);
    if (!avance) return;
    
    console.log(`📝 Abriendo modal para aprobar avance ${avanceId}`);
    currentAvanceId = avanceId;
    
    const infoContainer = document.getElementById('aprobarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Título:</strong> ${escapeHtml(avance.titulo)}</p>
        <p><strong><i class="fas fa-user"></i> Técnico:</strong> ${escapeHtml(avance.tecnico_nombre)}</p>
        <p><strong><i class="fas fa-clipboard-list"></i> Orden:</strong> ${escapeHtml(avance.orden_codigo)}</p>
        <p><strong><i class="fas fa-images"></i> Fotos:</strong> ${avance.fotos?.length || 0} fotos</p>
    `;
    
    document.getElementById('comentarioAprobacion').value = '';
    abrirModal('modalAprobar');
};

window.confirmarAprobar = async function() {
    const comentario = document.getElementById('comentarioAprobacion')?.value || '';
    console.log(`✅ Confirmando aprobación del avance ${currentAvanceId}`);
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/aprobar/${currentAvanceId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comentario: comentario })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Avance aprobado correctamente', 'success');
            cerrarModal('modalAprobar');
            // Recargar datos
            await cargarAvancesPendientes(true);
            await cargarAvancesProcesados(true);
        } else {
            showToast(data.error || 'Error al aprobar', 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// RECHAZAR AVANCE
// =====================================================

window.abrirModalRechazar = async function(avanceId) {
    const avance = avancesPendientes.find(a => a.id === avanceId);
    if (!avance) return;
    
    console.log(`📝 Abriendo modal para rechazar avance ${avanceId}`);
    currentAvanceId = avanceId;
    
    const infoContainer = document.getElementById('rechazarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Título:</strong> ${escapeHtml(avance.titulo)}</p>
        <p><strong><i class="fas fa-user"></i> Técnico:</strong> ${escapeHtml(avance.tecnico_nombre)}</p>
        <p><strong><i class="fas fa-clipboard-list"></i> Orden:</strong> ${escapeHtml(avance.orden_codigo)}</p>
        <p><strong><i class="fas fa-images"></i> Fotos:</strong> ${avance.fotos?.length || 0} fotos</p>
    `;
    
    document.getElementById('motivoRechazo').value = '';
    abrirModal('modalRechazar');
};

window.confirmarRechazar = async function() {
    const motivo = document.getElementById('motivoRechazo')?.value.trim();
    
    if (!motivo) {
        showToast('Debes escribir el motivo del rechazo', 'warning');
        return;
    }
    
    console.log(`❌ Confirmando rechazo del avance ${currentAvanceId}`);
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/rechazar/${currentAvanceId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ motivo: motivo })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Avance rechazado. El técnico ha sido notificado.', 'success');
            cerrarModal('modalRechazar');
            await cargarAvancesPendientes(true);
            await cargarAvancesProcesados(true);
        } else {
            showToast(data.error || 'Error al rechazar', 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    console.log('🔐 Verificando autenticación...');
    
    try {
        token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ No hay token');
            window.location.href = window.API_BASE_URL + '/';
            return null;
        }
        
        const response = await fetch(`${API_URL}/verify-token`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();

        if (data.success && data.user) {
            currentUser = data.user;
        } else {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');
            currentUser = {
                id: payload.user?.id || payload.id || userData?.id,
                nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
                roles: payload.user?.roles || payload.roles || userData?.roles || []
            };
        }

        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.textContent = new Date().toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
    } catch (error) {
        console.error('❌ Error:', error);
        window.location.href = window.API_BASE_URL + '/';
        return null;
    }
}

function logout() {
    console.log('🚪 Cerrando sesión...');
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = window.API_BASE_URL + '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    console.log('🔧 Configurando event listeners...');
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
            
            if (tabId === 'tab-aprobados') {
                cargarAvancesProcesados();
            } else if (tabId === 'tab-pendientes') {
                cargarAvancesPendientes();
            }
        });
    });
    
    const refreshPendientes = document.getElementById('refreshPendientesBtn');
    if (refreshPendientes) {
        refreshPendientes.addEventListener('click', () => cargarAvancesPendientes(true));
    }
    
    const refreshAprobados = document.getElementById('refreshAprobadosBtn');
    if (refreshAprobados) {
        refreshAprobados.addEventListener('click', () => cargarAvancesProcesados(true));
    }
    
    const searchPendientes = document.getElementById('searchPendientes');
    if (searchPendientes) {
        searchPendientes.addEventListener('input', debounce(() => cargarAvancesPendientes(true), 500));
    }
    
    const searchAprobados = document.getElementById('searchAprobados');
    if (searchAprobados) {
        searchAprobados.addEventListener('input', debounce(() => cargarAvancesProcesados(true), 500));
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarAvancesProcesados(true));
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
    
    const btnAprobar = document.getElementById('btnConfirmarAprobar');
    if (btnAprobar) {
        btnAprobar.addEventListener('click', confirmarAprobar);
    }
    
    const btnRechazar = document.getElementById('btnConfirmarRechazar');
    if (btnRechazar) {
        btnRechazar.addEventListener('click', confirmarRechazar);
    }
    
    console.log('✅ Event listeners configurados');
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

async function inicializar() {
    console.log('🚀 Inicializando gestion_avances.js (VERSIÓN OPTIMIZADA)');
    console.log(`📡 API_URL: ${API_URL}`);
    
    const user = await cargarUsuarioActual();
    if (!user) {
        console.error('❌ No se pudo autenticar usuario');
        return;
    }
    
    await Promise.all([
        cargarAvancesPendientes(),
        cargarAvancesProcesados()
    ]);
    
    setupEventListeners();
    iniciarPolling();
    
    console.log('✅ gestion_avances.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalleAvance = verDetalleAvance;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarModalFoto = cerrarModalFoto;
window.abrirModalAprobar = abrirModalAprobar;
window.confirmarAprobar = confirmarAprobar;
window.abrirModalRechazar = abrirModalRechazar;
window.confirmarRechazar = confirmarRechazar;
window.cerrarModal = cerrarModal;
window.logout = logout;

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}