// =====================================================
// SOLICITUDES_COMPRA.JS - ENCARGADO DE REPUESTOS
// VERSIÓN COMPLETA CON FOTOS, MAPA Y PROVEEDORES
// FURIA MOTOR COMPANY SRL
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 solicitudes_compra.js - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 solicitudes_compra.js - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

const API_URL = window.API_BASE_URL + '/api/encargado-repuestos';

let currentUser = null;
let currentUserRoles = [];
let solicitudesPendientes = [];
let currentSolicitudId = null;
let currentComprobanteFile = null;

// =====================================================
// 🔥 VARIABLES PARA PROVEEDORES
// =====================================================
let proveedoresCompraCache = {
    data: [],
    timestamp: 0
};
let currentSolicitudCompraId = null;
let isSubmittingCompra = false;

// =====================================================
// 🔥 VARIABLES PARA EL MAPA
// =====================================================
let mapCompra = null;
let mapMarkerCompra = null;
let currentLatCompra = -17.7835;
let currentLngCompra = -63.1821;
const DEFAULT_LAT_COMPRA = -17.7835;
const DEFAULT_LNG_COMPRA = -63.1821;

// Exponer para uso global en HTML
window.DEFAULT_LAT_COMPRA = DEFAULT_LAT_COMPRA;
window.DEFAULT_LNG_COMPRA = DEFAULT_LNG_COMPRA;
window.mapCompra = mapCompra;
window.mapMarkerCompra = mapMarkerCompra;

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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    if (modalId === 'modalComprar') {
        // Limpiar mapa al cerrar
        if (mapCompra) {
            mapCompra.remove();
            mapCompra = null;
            mapMarkerCompra = null;
            window.mapCompra = null;
            window.mapMarkerCompra = null;
        }
        currentComprobanteFile = null;
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
}

function statusBadge(estado) {
    const map = {
        'pendiente': 'status-pendiente',
        'comprado': 'status-comprado',
        'entregado': 'status-entregado'
    };
    const texto = {
        'pendiente': 'Pendiente',
        'comprado': 'Comprado',
        'entregado': 'Entregado'
    };
    const iconos = {
        'pendiente': 'fa-clock',
        'comprado': 'fa-check-circle',
        'entregado': 'fa-truck'
    };
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${iconos[estado] || 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// 🔥 FUNCIÓN PARA EXTRAER URLs DE FOTOS
// =====================================================

function extraerUrlsFotos(item) {
    let urls = [];
    if (!item) return urls;

    function buscarRecursivamente(obj, profundidad = 0) {
        if (profundidad > 5) return;
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
            obj.forEach(subItem => {
                if (typeof subItem === 'string' && subItem.startsWith('http')) {
                    const esImagen = /(drive\.google\.com|cloudinary\.com|res\.cloudinary\.com|googleusercontent\.com|\.(jpg|jpeg|png|gif|webp|svg))/i.test(subItem);
                    if (esImagen && !urls.includes(subItem)) {
                        urls.push(subItem);
                    }
                } else {
                    buscarRecursivamente(subItem, profundidad + 1);
                }
            });
            return;
        }

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && value.startsWith('http')) {
                const esImagen = /(drive\.google\.com|cloudinary\.com|res\.cloudinary\.com|googleusercontent\.com|\.(jpg|jpeg|png|gif|webp|svg))/i.test(value);
                if (esImagen && !urls.includes(value)) {
                    urls.push(value);
                }
            } else if (Array.isArray(value)) {
                buscarRecursivamente(value, profundidad + 1);
            } else if (typeof value === 'object' && value !== null) {
                buscarRecursivamente(value, profundidad + 1);
            }
        }
    }

    buscarRecursivamente(item);

    urls = urls.filter(url => 
        url.startsWith('http') && 
        url.length > 10 &&
        /(drive\.google\.com|cloudinary\.com|res\.cloudinary\.com|googleusercontent\.com)/i.test(url)
    );

    urls = [...new Set(urls)];
    return urls;
}

// =====================================================
// 🔥 FUNCIÓN PARA CARGAR IMAGEN VÍA PROXY
// =====================================================

async function cargarImagenProxyEncargado(url, imgElement) {
    if (!url || !imgElement) return null;
    if (imgElement.getAttribute('data-loaded') === 'true') return;

    try {
        const proxyUrl = `${API_URL}/proxy-imagen-encargado?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, { headers: getAuthHeaders() });
        const data = await response.json();

        if (data.success && data.base64) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = function() {
                    imgElement.src = data.base64;
                    imgElement.style.display = 'block';
                    imgElement.setAttribute('data-loaded', 'true');
                    const parent = imgElement.parentElement;
                    if (parent) {
                        const loader = parent.querySelector('.miniatura-loader, .item-foto-loader, .detalle-loader');
                        if (loader) loader.style.display = 'none';
                    }
                    resolve(data.base64);
                };
                img.onerror = function() {
                    const parent = imgElement.parentElement;
                    if (parent) {
                        const loader = parent.querySelector('.miniatura-loader, .item-foto-loader, .detalle-loader');
                        if (loader) {
                            loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:12px;"></i>';
                            loader.style.display = 'flex';
                        }
                    }
                    resolve(null);
                };
                img.src = data.base64;
            });
        } else {
            const parent = imgElement.parentElement;
            if (parent) {
                const loader = parent.querySelector('.miniatura-loader, .item-foto-loader, .detalle-loader');
                if (loader) {
                    loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:12px;"></i>';
                    loader.style.display = 'flex';
                }
            }
            return null;
        }
    } catch (error) {
        console.error('❌ Error en proxy:', error);
        const parent = imgElement.parentElement;
        if (parent) {
            const loader = parent.querySelector('.miniatura-loader, .item-foto-loader, .detalle-loader');
            if (loader) {
                loader.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--rojo-primario);font-size:12px;"></i>';
                loader.style.display = 'flex';
            }
        }
        return null;
    }
}

// =====================================================
// 🔥 FUNCIONES DE MAPA
// =====================================================

function initMapCompra(lat = DEFAULT_LAT_COMPRA, lng = DEFAULT_LNG_COMPRA) {
    const container = document.getElementById('mapContainerCompra');
    if (!container) {
        console.warn('⚠️ Contenedor del mapa de compra no encontrado');
        return;
    }

    // Si ya existe el mapa, lo destruimos
    if (mapCompra) {
        mapCompra.remove();
        mapCompra = null;
        mapMarkerCompra = null;
    }

    try {
        mapCompra = L.map('mapContainerCompra', {
            center: [lat, lng],
            zoom: 15,
            zoomControl: true,
            fadeAnimation: true,
            attributionControl: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(mapCompra);

        const customIcon = L.divIcon({
            html: '<i class="fas fa-map-pin" style="color: #C1121F; font-size: 2rem; text-shadow: 0 2px 4px rgba(0,0,0,0.5);"></i>',
            className: 'custom-marker',
            iconSize: [30, 42],
            iconAnchor: [15, 42]
        });

        mapMarkerCompra = L.marker([lat, lng], {
            draggable: true,
            icon: customIcon
        }).addTo(mapCompra);

        mapMarkerCompra.on('dragend', function() {
            const pos = mapMarkerCompra.getLatLng();
            actualizarCoordenadasCompra(pos.lat, pos.lng);
        });

        mapCompra.on('click', function(e) {
            const pos = e.latlng;
            mapMarkerCompra.setLatLng(pos);
            actualizarCoordenadasCompra(pos.lat, pos.lng);
        });

        actualizarCoordenadasCompra(lat, lng);

        // Exponer para uso global
        window.mapCompra = mapCompra;
        window.mapMarkerCompra = mapMarkerCompra;

        setTimeout(() => {
            if (mapCompra) {
                mapCompra.invalidateSize();
            }
        }, 300);

        console.log('🗺️ Mapa de compra inicializado');

    } catch (error) {
        console.error('Error al inicializar el mapa de compra:', error);
        showToast('Error al cargar el mapa', 'error');
    }
}

function actualizarCoordenadasCompra(lat, lng) {
    currentLatCompra = lat;
    currentLngCompra = lng;

    const latInput = document.getElementById('latitudCompra');
    const lngInput = document.getElementById('longitudCompra');
    const ubicacionGps = document.getElementById('ubicacion_gps_compra');
    const coordsDisplay = document.getElementById('coordsDisplayCompra');

    if (latInput) latInput.value = lat.toFixed(7);
    if (lngInput) lngInput.value = lng.toFixed(7);

    if (ubicacionGps) {
        const coordsStr = `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
        if (!ubicacionGps.dataset.userEdited) {
            ubicacionGps.value = coordsStr;
        }
    }

    if (coordsDisplay) {
        coordsDisplay.textContent = `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
    }
}

function obtenerUbicacionActualCompra() {
    if (!navigator.geolocation) {
        showToast('Tu navegador no soporta geolocalización', 'warning');
        return;
    }

    showToast('Obteniendo ubicación...', 'info');

    navigator.geolocation.getCurrentPosition(
        function(pos) {
            const { latitude, longitude } = pos.coords;
            if (mapCompra) {
                mapCompra.setView([latitude, longitude], 16);
                if (mapMarkerCompra) {
                    mapMarkerCompra.setLatLng([latitude, longitude]);
                }
                actualizarCoordenadasCompra(latitude, longitude);
                showToast('📍 Ubicación actualizada', 'success');
            }
        },
        function(error) {
            console.error('Error de geolocalización:', error);
            let msg = 'No se pudo obtener tu ubicación. ';
            if (error.code === 1) {
                msg += 'Permite el acceso a la ubicación en tu navegador.';
            } else if (error.code === 2) {
                msg += 'Señal GPS no disponible. Intenta más tarde.';
            } else {
                msg += 'Usa la ubicación por defecto o mueve el marcador en el mapa.';
            }
            showToast(msg, 'warning');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// =====================================================
// 🔥 FUNCIONES DE PROVEEDORES
// =====================================================

async function cargarProveedoresCompra(forceRefresh = false) {
    try {
        if (!forceRefresh && proveedoresCompraCache.data.length > 0 && 
            (Date.now() - proveedoresCompraCache.timestamp) < 300000) {
            return proveedoresCompraCache.data;
        }

        const response = await fetch(`${API_URL}/proveedores`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            showToast('Sesión expirada', 'warning');
            return [];
        }

        const data = await response.json();

        if (data.success) {
            proveedoresCompraCache.data = data.proveedores || [];
            proveedoresCompraCache.timestamp = Date.now();
            return proveedoresCompraCache.data;
        } else {
            console.error('Error cargando proveedores:', data.error);
            return [];
        }
    } catch (error) {
        console.error('Error cargando proveedores:', error);
        return [];
    }
}

function renderizarSelectProveedoresCompra(proveedores, selectedId = null) {
    if (!proveedores || proveedores.length === 0) {
        return `<option value="">-- No hay proveedores --</option>`;
    }

    return proveedores.map(p => {
        const selected = (selectedId && p.id === selectedId) ? 'selected' : '';
        const label = `${p.nombre}${p.telefono ? ' - 📞 ' + p.telefono : ''}${p.propietario ? ' (' + p.propietario + ')' : ''}`;
        return `<option value="${p.id}" ${selected}>${escapeHtml(label)}</option>`;
    }).join('');
}

function mostrarInfoProveedorCompra(proveedorId, proveedores) {
    const infoDisplay = document.getElementById('proveedorInfoDisplayCompra');
    const telefonoSpan = document.getElementById('proveedorTelefonoCompra');
    const ubicacionSpan = document.getElementById('proveedorUbicacionCompra');

    if (!infoDisplay || !telefonoSpan || !ubicacionSpan) return;

    if (proveedorId && proveedores && proveedores.length > 0) {
        const proveedor = proveedores.find(p => p.id === proveedorId);
        if (proveedor) {
            infoDisplay.style.display = 'block';
            telefonoSpan.textContent = proveedor.telefono ? `📞 ${proveedor.telefono}` : '';
            ubicacionSpan.textContent = proveedor.ubicacion_gps ? `📍 ${proveedor.ubicacion_gps}` : '';
            ubicacionSpan.style.display = proveedor.ubicacion_gps ? 'inline' : 'none';
            return;
        }
    }
    infoDisplay.style.display = 'none';
}

// =====================================================
// 🔥 MODAL DE PROVEEDOR PARA COMPRA DIRECTA
// =====================================================

function abrirModalProveedorCompra() {
    let modal = document.getElementById('modalProveedorCompra');

    // Limpiar formulario
    document.getElementById('proveedorIdCompra').value = '';
    document.getElementById('nombreCompra').value = '';
    document.getElementById('telefonoCompra').value = '';
    document.getElementById('propietarioCompra').value = '';
    document.getElementById('ubicacion_gps_compra').value = '';
    document.getElementById('descripcionCompra').value = '';
    document.getElementById('latitudCompra').value = DEFAULT_LAT_COMPRA;
    document.getElementById('longitudCompra').value = DEFAULT_LNG_COMPRA;

    // Resetear flag de edición manual
    const ubicacionGps = document.getElementById('ubicacion_gps_compra');
    if (ubicacionGps) {
        delete ubicacionGps.dataset.userEdited;
    }

    // Actualizar título
    const modalTitle = document.getElementById('modalTitleProveedorCompra');
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-truck"></i> Nuevo Proveedor';
    }

    abrirModal('modalProveedorCompra');

    // Inicializar mapa después de que el modal se haya mostrado
    setTimeout(() => {
        initMapCompra(DEFAULT_LAT_COMPRA, DEFAULT_LNG_COMPRA);
    }, 400);
}

function cerrarModalProveedorCompra() {
    cerrarModal('modalProveedorCompra');
    if (mapCompra) {
        mapCompra.remove();
        mapCompra = null;
        mapMarkerCompra = null;
        window.mapCompra = null;
        window.mapMarkerCompra = null;
    }
}

async function guardarProveedorCompra(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (isSubmittingCompra) return;
    isSubmittingCompra = true;

    const submitBtn = document.querySelector('#proveedorFormCompra .btn-primary');
    let originalBtnText = '';
    if (submitBtn) {
        originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
        const nombre = document.getElementById('nombreCompra').value.trim();
        const telefono = document.getElementById('telefonoCompra').value.trim();
        const propietario = document.getElementById('propietarioCompra').value.trim();
        const ubicacion_gps = document.getElementById('ubicacion_gps_compra').value.trim();
        const descripcion = document.getElementById('descripcionCompra').value.trim();

        if (!nombre) {
            showToast('El nombre del proveedor es requerido', 'error');
            document.getElementById('nombreCompra').focus();
            return;
        }

        if (!telefono) {
            showToast('El teléfono es requerido', 'error');
            document.getElementById('telefonoCompra').focus();
            return;
        }

        // Si el campo ubicacion_gps está vacío pero el mapa tiene coordenadas, usar las del mapa
        let ubicacionFinal = ubicacion_gps;
        if (!ubicacionFinal && currentLatCompra && currentLngCompra) {
            ubicacionFinal = `${currentLatCompra.toFixed(7)}, ${currentLngCompra.toFixed(7)}`;
        }

        const proveedorData = {
            nombre: nombre,
            telefono: telefono,
            propietario: propietario || null,
            descripcion: descripcion || null,
            ubicacion_gps: ubicacionFinal || null
        };

        mostrarLoading(true);

        const response = await fetch(`${API_URL}/proveedores`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(proveedorData)
        });

        const data = await response.json();

        if (data.success) {
            showToast('✅ Proveedor creado exitosamente', 'success');
            cerrarModalProveedorCompra();

            proveedoresCompraCache.timestamp = 0;
            const proveedores = await cargarProveedoresCompra(true);

            const select = document.getElementById('proveedorSelectCompra');
            if (select) {
                const opcionesHtml = renderizarSelectProveedoresCompra(proveedores, data.proveedor?.id);
                select.innerHTML = `
                    <option value="">-- Seleccione un proveedor --</option>
                    ${opcionesHtml}
                `;
                if (data.proveedor?.id) {
                    select.value = data.proveedor.id;
                    mostrarInfoProveedorCompra(data.proveedor.id, proveedores);
                }
            }
        } else {
            showToast(data.error || 'Error al guardar proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
        isSubmittingCompra = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

// =====================================================
// VER FOTO AMPLIADA
// =====================================================

function verFotoAmpliadaEncargado(url) {
    if (!url) {
        showToast('No hay foto para mostrar', 'warning');
        return;
    }
    let decodedUrl = url;
    try { decodedUrl = decodeURI(url); } catch(e) {}

    let modalFoto = document.getElementById('modalFotoAmpliadaEncargado');
    if (!modalFoto) {
        const modalHtml = `
            <div class="modal" id="modalFotoAmpliadaEncargado" onclick="cerrarFotoAmpliadaEncargado()">
                <div class="modal-content" style="max-width: 900px; max-height: 95vh; background: var(--bg-card);" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3><i class="fas fa-image"></i> Foto del Repuesto</h3>
                        <button class="modal-close" onclick="cerrarFotoAmpliadaEncargado()">&times;</button>
                    </div>
                    <div class="modal-body" style="display:flex;justify-content:center;align-items:center;padding:1.5rem;background:var(--negro);min-height:300px;position:relative;">
                        <div id="fotoModalLoaderEncargado" style="position:absolute;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
                            <i class="fas fa-spinner fa-spin" style="font-size:3rem;color:var(--gris-texto);"></i>
                        </div>
                        <img id="fotoAmpliadaEncargadoImg" src="" alt="Foto ampliada" loading="lazy" 
                             style="max-width:100%;max-height:75vh;object-fit:contain;border-radius:var(--radius-md);display:none;">
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="cerrarFotoAmpliadaEncargado()">Cerrar</button>
                        <button class="btn-primary" onclick="descargarFotoAmpliadaEncargado()">
                            <i class="fas fa-download"></i> Descargar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const loader = document.getElementById('fotoModalLoaderEncargado');
    const img = document.getElementById('fotoAmpliadaEncargadoImg');
    if (loader) loader.style.display = 'flex';
    if (img) {
        img.style.display = 'none';
        img.src = '';
    }
    window._fotoAmpliadaEncargadoUrl = decodedUrl;

    const modal = document.getElementById('modalFotoAmpliadaEncargado');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    const proxyUrl = `${API_URL}/proxy-imagen-encargado?url=${encodeURIComponent(decodedUrl)}`;
    fetch(proxyUrl, { headers: getAuthHeaders() })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.base64) {
                const nuevaImg = new Image();
                nuevaImg.onload = function() {
                    if (img) { img.src = data.base64; img.style.display = 'block'; }
                    if (loader) loader.style.display = 'none';
                };
                nuevaImg.onerror = function() {
                    if (loader) {
                        loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--rojo-primario);font-size:3rem;"></i>';
                    }
                    showToast('Error al cargar la imagen', 'error');
                };
                nuevaImg.src = data.base64;
            } else {
                if (loader) {
                    loader.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:3rem;"></i>';
                }
                showToast('Error al cargar la imagen', 'error');
            }
        })
        .catch(error => {
            console.error('Error cargando foto ampliada:', error);
            if (loader) {
                loader.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--rojo-primario);font-size:3rem;"></i>';
            }
            showToast('Error de conexión', 'error');
        });
}

function cerrarFotoAmpliadaEncargado() {
    const modal = document.getElementById('modalFotoAmpliadaEncargado');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function descargarFotoAmpliadaEncargado() {
    const url = window._fotoAmpliadaEncargadoUrl;
    if (!url) {
        showToast('No hay foto para descargar', 'warning');
        return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.download = `repuesto_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ Descargando foto...', 'success');
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/stats`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success && data.stats) {
            const pendientes = document.getElementById('statPendientes');
            const comprados = document.getElementById('statComprados');
            const entregados = document.getElementById('statEntregados');
            const total = document.getElementById('statTotal');
            if (pendientes) pendientes.textContent = data.stats.pendientes || 0;
            if (comprados) comprados.textContent = data.stats.comprados || 0;
            if (entregados) entregados.textContent = data.stats.entregados || 0;
            if (total) total.textContent = data.stats.total || 0;
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

async function cargarSolicitudes() {
    mostrarLoading(true);
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        let url = `${API_URL}/solicitudes-compra`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (params.toString()) url += `?${params.toString()}`;

        const response = await fetch(url, { headers: getAuthHeaders() });
        if (response.status === 401) {
            window.location.href = window.API_BASE_URL + '/';
            return;
        }
        const data = await response.json();

        if (data.success) {
            let solicitudes = data.solicitudes || [];
            if (search) {
                solicitudes = solicitudes.filter(s => 
                    (s.orden_codigo || '').toLowerCase().includes(search) ||
                    (s.descripcion_pieza || '').toLowerCase().includes(search) ||
                    (s.vehiculo || '').toLowerCase().includes(search)
                );
            }
            solicitudesPendientes = solicitudes;
            renderizarSolicitudes(solicitudes);
            await cargarEstadisticas();
        } else {
            showToast(data.error || 'Error al cargar solicitudes', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZAR SOLICITUDES
// =====================================================

function renderizarSolicitudes(solicitudes) {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;

    if (solicitudes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay solicitudes de compra</p>
                <small>Las solicitudes aparecerán aquí cuando el Jefe de Taller las cree</small>
            </div>
        `;
        return;
    }

    let html = '';

    solicitudes.forEach((solicitud) => {
        let items = solicitud.items || [];
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
        }

        let totalFotos = 0;
        items.forEach(item => {
            const fotos = extraerUrlsFotos(item);
            totalFotos += fotos.length;
        });

        let itemsHtml = '';
        items.forEach((item, itemIdx) => {
            const fotosUrls = extraerUrlsFotos(item);
            const tieneFotos = fotosUrls.length > 0;

            let miniaturasHtml = '';
            if (tieneFotos) {
                const fotosMostrar = fotosUrls.slice(0, 3);
                miniaturasHtml = `
                    <div class="miniaturas-container" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px;">
                        ${fotosMostrar.map((url, i) => `
                            <div style="position:relative;width:40px;height:40px;border-radius:4px;overflow:hidden;border:2px solid var(--verde-exito);flex-shrink:0;cursor:pointer;" 
                                 onclick="verFotoAmpliadaEncargado('${encodeURI(url)}')"
                                 title="Haz clic para ver ampliada">
                                <div class="miniatura-loader" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:var(--gris-oscuro);">
                                    <i class="fas fa-spinner fa-spin" style="font-size:12px;color:var(--gris-texto);"></i>
                                </div>
                                <img class="miniatura-img" 
                                     src="" 
                                     alt="Foto" 
                                     style="width:100%;height:100%;object-fit:cover;display:none;"
                                     data-url="${encodeURI(url)}"
                                     data-loaded="false">
                            </div>
                        `).join('')}
                        ${fotosUrls.length > 3 ? `
                            <span style="font-size:0.6rem;color:var(--gris-texto);background:var(--gris-oscuro);padding:0.1rem 0.4rem;border-radius:4px;">
                                +${fotosUrls.length - 3}
                            </span>
                        ` : ''}
                    </div>
                `;
            }

            const descripcion = item.descripcion || item.nombre || 'Item';
            const cantidad = item.cantidad || 1;
            const detalle = item.detalle || '';

            itemsHtml += `
                <div class="item-row-solicitud" style="border-bottom:1px solid var(--border-color);padding:0.4rem 0;">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                        <div style="flex:1;min-width:80px;font-size:0.85rem;">
                            <strong>${escapeHtml(descripcion)}</strong>
                            ${detalle ? `<span style="color:var(--gris-texto);font-size:0.75rem;">(${escapeHtml(detalle)})</span>` : ''}
                        </div>
                        <div style="background:var(--gris-oscuro);padding:0.1rem 0.4rem;border-radius:4px;font-size:0.75rem;">
                            ×${cantidad}
                        </div>
                        ${miniaturasHtml}
                    </div>
                </div>
            `;
        });

        const puedeComprar = solicitud.estado === 'pendiente';
        const puedeEntregar = solicitud.estado === 'comprado';
        const tieneComprobante = solicitud.comprobante_url;

        html += `
            <div class="solicitud-card" data-id="${solicitud.id}" style="margin-bottom:1rem;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-card);">
                <div class="solicitud-header" style="padding:0.75rem 1rem;background:var(--gris-oscuro);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;border-bottom:1px solid var(--border-color);">
                    <h3 style="margin:0;font-size:1rem;"><i class="fas fa-shopping-cart"></i> Solicitud #${solicitud.id}</h3>
                    <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                        ${totalFotos > 0 ? `<span style="background:var(--verde-exito);color:white;padding:0.1rem 0.5rem;border-radius:12px;font-size:0.6rem;"><i class="fas fa-camera"></i> ${totalFotos}</span>` : ''}
                        ${statusBadge(solicitud.estado)}
                    </div>
                </div>
                <div class="solicitud-body" style="padding:0.75rem 1rem;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.25rem 1rem;margin-bottom:0.75rem;font-size:0.8rem;">
                        <div><strong>Orden:</strong> ${escapeHtml(solicitud.orden_codigo || 'N/A')}</div>
                        <div><strong>Vehículo:</strong> ${escapeHtml(solicitud.vehiculo || 'N/A')}</div>
                        <div><strong>Servicio:</strong> ${escapeHtml(solicitud.servicio_descripcion || 'N/A')}</div>
                        <div><strong>Fecha:</strong> ${formatDate(solicitud.fecha_solicitud)}</div>
                    </div>
                    
                    <div style="margin-bottom:0.75rem;">
                        <h4 style="margin:0 0 0.25rem 0;font-size:0.85rem;"><i class="fas fa-cubes"></i> Items solicitados:</h4>
                        ${itemsHtml}
                    </div>
                    
                    ${solicitud.precio_cotizado ? `
                        <div style="padding:0.5rem;background:var(--gris-oscuro);border-radius:4px;margin-bottom:0.5rem;font-size:0.85rem;">
                            <strong><i class="fas fa-tag"></i> Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                            ${solicitud.proveedor_info ? `<br><small>Proveedor: ${escapeHtml(solicitud.proveedor_info)}</small>` : ''}
                        </div>
                    ` : ''}
                    
                    ${solicitud.mensaje_jefe_taller ? `
                        <div style="padding:0.5rem;background:rgba(193,18,31,0.05);border-radius:4px;margin-bottom:0.5rem;font-size:0.8rem;border-left:3px solid var(--rojo-primario);">
                            <small><i class="fas fa-comment"></i> Mensaje del Jefe de Taller:</small>
                            <p style="margin:0.25rem 0 0 0;">${escapeHtml(solicitud.mensaje_jefe_taller)}</p>
                        </div>
                    ` : ''}
                    
                    ${solicitud.respuesta_encargado ? `
                        <div style="padding:0.5rem;background:rgba(16,185,129,0.05);border-radius:4px;margin-bottom:0.5rem;font-size:0.8rem;border-left:3px solid var(--verde-exito);">
                            <small><i class="fas fa-reply"></i> Tu respuesta:</small>
                            <p style="margin:0.25rem 0 0 0;">${escapeHtml(solicitud.respuesta_encargado)}</p>
                        </div>
                    ` : ''}
                    
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">
                        <button class="action-btn view" onclick="verDetalle(${solicitud.id})" style="padding:0.3rem 0.8rem;border-radius:4px;border:none;cursor:pointer;background:var(--gris-oscuro);">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        ${tieneComprobante ? `
                            <button class="action-btn view" onclick="verComprobante(${solicitud.id})" style="padding:0.3rem 0.8rem;border-radius:4px;border:none;cursor:pointer;background:var(--gris-oscuro);">
                                <i class="fas fa-receipt"></i> Ver Comprobante
                            </button>
                        ` : ''}
                        ${puedeComprar ? `
                            <button class="action-btn buy" onclick="abrirModalComprar(${solicitud.id})" style="padding:0.3rem 0.8rem;border-radius:4px;border:none;cursor:pointer;background:var(--rojo-primario);color:white;">
                                <i class="fas fa-shopping-cart"></i> Marcar Comprado
                            </button>
                        ` : ''}
                        ${puedeEntregar ? `
                            <button class="action-btn deliver" onclick="abrirModalEntregar(${solicitud.id})" style="padding:0.3rem 0.8rem;border-radius:4px;border:none;cursor:pointer;background:var(--verde-exito);color:white;">
                                <i class="fas fa-truck"></i> Registrar Entrega
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    setTimeout(() => {
        const cards = container.querySelectorAll('.solicitud-card');
        cards.forEach(card => {
            const imagenes = card.querySelectorAll('.miniatura-img');
            imagenes.forEach(img => {
                const url = img.getAttribute('data-url');
                if (url) {
                    const decodedUrl = decodeURI(url);
                    cargarImagenProxyEncargado(decodedUrl, img);
                }
            });
        });
    }, 500);
}

// =====================================================
// VER DETALLE CON TODAS LAS FOTOS
// =====================================================

async function verDetalle(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;

    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }

    const itemsHtml = items.map((item, idx) => {
        const fotosUrls = extraerUrlsFotos(item);
        const tieneFotos = fotosUrls.length > 0;
        const uniqueId = `detalle_${solicitud.id}_item_${idx}`;

        let miniaturasHtml = '';
        if (tieneFotos) {
            miniaturasHtml = `
                <div class="miniaturas-container" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px;">
                    ${fotosUrls.map((url, i) => `
                        <div style="position:relative;width:60px;height:60px;border-radius:6px;overflow:hidden;border:2px solid var(--verde-exito);flex-shrink:0;cursor:pointer;" 
                             onclick="verFotoAmpliadaEncargado('${encodeURI(url)}')"
                             title="Haz clic para ver ampliada">
                            <div class="detalle-loader" id="detalle_loader_${uniqueId}_${i}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:var(--gris-oscuro);">
                                <i class="fas fa-spinner fa-spin" style="font-size:14px;color:var(--gris-texto);"></i>
                            </div>
                            <img class="detalle-img" id="detalle_img_${uniqueId}_${i}"
                                 src="" 
                                 alt="Foto" 
                                 style="width:100%;height:100%;object-fit:cover;display:none;"
                                 data-url="${encodeURI(url)}"
                                 data-loaded="false">
                            <span style="position:absolute;bottom:2px;right:4px;background:rgba(0,0,0,0.7);color:white;font-size:0.5rem;padding:0.1rem 0.3rem;border-radius:3px;">${i+1}/${fotosUrls.length}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        return `
            <div class="item-row-solicitud" style="border-bottom:1px solid var(--border-color);padding:0.5rem 0;">
                <div style="display:flex;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
                    <div style="flex:1;min-width:100px;">
                        <strong>${escapeHtml(item.descripcion || item.nombre || 'Item')}</strong>
                        ${item.detalle ? `<br><span style="color:var(--gris-texto);font-size:0.8rem;">${escapeHtml(item.detalle)}</span>` : ''}
                        <span style="background:var(--gris-oscuro);padding:0.1rem 0.5rem;border-radius:4px;font-size:0.75rem;display:inline-block;margin-top:2px;">
                            ×${item.cantidad || 1}
                        </span>
                    </div>
                    ${miniaturasHtml}
                </div>
            </div>
        `;
    }).join('');

    const modalBody = document.getElementById('modalDetalleBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="orden-info" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.5rem 1rem;margin-bottom:1rem;padding:0.75rem;background:var(--gris-oscuro);border-radius:8px;">
                <div><strong>Solicitud ID:</strong> #${solicitud.id}</div>
                <div><strong>Orden:</strong> ${escapeHtml(solicitud.orden_codigo || 'N/A')}</div>
                <div><strong>Vehículo:</strong> ${escapeHtml(solicitud.vehiculo || 'N/A')}</div>
                <div><strong>Servicio:</strong> ${escapeHtml(solicitud.servicio_descripcion || 'N/A')}</div>
                <div><strong>Fecha:</strong> ${formatDateTime(solicitud.fecha_solicitud)}</div>
                <div><strong>Estado:</strong> ${statusBadge(solicitud.estado)}</div>
            </div>
            
            <div class="items-list" style="margin-bottom:1rem;">
                <h4 style="margin:0 0 0.5rem 0;"><i class="fas fa-cubes"></i> Items solicitados:</h4>
                ${itemsHtml}
            </div>
            
            ${solicitud.precio_cotizado ? `
                <div class="precio-cotizado-box" style="padding:0.5rem;background:var(--gris-oscuro);border-radius:8px;margin-bottom:0.5rem;">
                    <strong>Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                    ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
                </div>
            ` : ''}
            
            ${solicitud.mensaje_jefe_taller ? `
                <div class="observacion-box" style="padding:0.5rem;background:rgba(193,18,31,0.05);border-radius:8px;margin-bottom:0.5rem;border-left:3px solid var(--rojo-primario);">
                    <small><i class="fas fa-comment"></i> Mensaje del Jefe de Taller:</small>
                    <p style="margin:0.25rem 0 0 0;">${escapeHtml(solicitud.mensaje_jefe_taller)}</p>
                </div>
            ` : ''}
            
            ${solicitud.respuesta_encargado ? `
                <div class="observacion-box" style="padding:0.5rem;background:rgba(16,185,129,0.05);border-radius:8px;margin-bottom:0.5rem;border-left:3px solid var(--verde-exito);">
                    <small><i class="fas fa-reply"></i> Tu respuesta:</small>
                    <p style="margin:0.25rem 0 0 0;">${escapeHtml(solicitud.respuesta_encargado)}</p>
                </div>
            ` : ''}
            
            ${solicitud.comprobante_url ? `
                <div class="comprobante-box" style="padding:0.5rem;background:rgba(245,158,11,0.05);border-radius:8px;margin-top:0.5rem;">
                    <strong><i class="fas fa-receipt"></i> Comprobante de compra:</strong>
                    <div style="margin-top: 0.5rem;">
                        <button class="btn-outline" onclick="verComprobante(${solicitud.id})" style="padding:0.3rem 0.8rem;border-radius:4px;border:1px solid var(--border-color);cursor:pointer;background:transparent;">
                            <i class="fas fa-image"></i> Ver Comprobante
                        </button>
                    </div>
                </div>
            ` : ''}
        `;
    }

    setTimeout(() => {
        const imagenes = document.querySelectorAll('.detalle-img');
        imagenes.forEach(img => {
            const url = img.getAttribute('data-url');
            if (url) {
                const decodedUrl = decodeURI(url);
                cargarImagenProxyEncargado(decodedUrl, img);
            }
        });
    }, 300);

    abrirModal('modalDetalle');
}

// =====================================================
// VER COMPROBANTE
// =====================================================

async function verComprobante(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud || !solicitud.comprobante_url) return;

    const modalBody = document.getElementById('modalVerComprobanteBody');
    const isImage = solicitud.comprobante_url.match(/\.(jpeg|jpg|gif|png|webp)$/i);

    if (modalBody) {
        modalBody.innerHTML = `
            <div style="text-align: center;">
                ${isImage ? 
                    `<img src="${solicitud.comprobante_url}" alt="Comprobante" style="max-width: 100%; max-height: 60vh; border-radius: var(--radius-md);">` :
                    `<iframe src="${solicitud.comprobante_url}" style="width: 100%; height: 60vh; border: none; border-radius: var(--radius-md);"></iframe>`
                }
                <div style="margin-top: 1rem; text-align: left;">
                    <p><strong>Factura/Comprobante N°:</strong> ${escapeHtml(solicitud.numero_factura || 'N/A')}</p>
                    <p><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_nombre || solicitud.proveedor_info || 'N/A')}</p>
                    <p><strong>Monto:</strong> Bs. ${(solicitud.precio_cotizado || 0).toFixed(2)}</p>
                    <p><strong>Fecha de compra:</strong> ${formatDate(solicitud.fecha_compra)}</p>
                </div>
            </div>
        `;
    }

    const downloadBtn = document.getElementById('descargarComprobanteBtn');
    if (downloadBtn) {
        downloadBtn.href = solicitud.comprobante_url;
        downloadBtn.download = `comprobante_${solicitud.id}.${isImage ? 'jpg' : 'pdf'}`;
    }

    abrirModal('modalVerComprobante');
}

// =====================================================
// SUBIR COMPROBANTE A DRIVE
// =====================================================

async function subirComprobanteADrive(file, id_orden, codigo_orden) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('comprobante', file);
        formData.append('id_orden', id_orden);
        formData.append('codigo_orden', codigo_orden);

        const uploadUrl = `${API_URL}/subir-comprobante-drive`;

        console.log('📤 Subiendo comprobante a Google Drive...');
        console.log(`📁 Para orden: ${codigo_orden}`);

        fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeaders()['Authorization']
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.url) {
                console.log('✅ Comprobante subido a Drive:', data.url);
                resolve(data.url);
            } else {
                console.error('❌ Error Drive:', data.error);
                reject(new Error(data.error || 'Error al subir a Google Drive'));
            }
        })
        .catch(err => {
            console.error('❌ Error de red:', err);
            reject(new Error('Error de conexión con Google Drive'));
        });
    });
}

// =====================================================
// 🔥 ABRIR MODAL COMPRAR (SIN MAPA - EL MAPA ESTÁ EN EL MODAL DE PROVEEDOR)
// =====================================================

function abrirModalComprar(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;

    currentSolicitudId = idSolicitud;
    currentComprobanteFile = null;
    currentSolicitudCompraId = idSolicitud;

    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }

    mostrarLoading(true);
    cargarProveedoresCompra().then(proveedores => {
        mostrarLoading(false);
        const selectProveedoresHtml = renderizarSelectProveedoresCompra(proveedores);

        // 🔥 RENDERIZAR ITEMS CON FOTOS (sin mapa)
        const itemsHtml = items.map((item, idx) => {
            const fotosUrls = extraerUrlsFotos(item);
            const tieneFotos = fotosUrls.length > 0;

            let fotosMiniaturas = '';
            if (tieneFotos) {
                const fotosMostrar = fotosUrls.slice(0, 3);
                fotosMiniaturas = `
                    <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
                        ${fotosMostrar.map((url, fi) => `
                            <div style="position:relative; width:50px; height:50px; border-radius:6px; overflow:hidden; border:2px solid var(--verde-exito); cursor:pointer; background:var(--gris-oscuro);"
                                 onclick="verFotoAmpliadaEncargado('${encodeURI(url)}')"
                                 title="Haz clic para ver ampliada">
                                <div class="miniatura-loader" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:var(--gris-oscuro);">
                                    <i class="fas fa-spinner fa-spin" style="font-size:12px;color:var(--gris-texto);"></i>
                                </div>
                                <img class="miniatura-img" 
                                     src="" 
                                     alt="Foto" 
                                     style="width:100%; height:100%; object-fit:cover; display:none;"
                                     data-url="${encodeURI(url)}"
                                     data-loaded="false">
                            </div>
                        `).join('')}
                        ${fotosUrls.length > 3 ? `
                            <span style="font-size:0.6rem;color:var(--gris-texto);background:var(--gris-oscuro);padding:0.1rem 0.4rem;border-radius:4px;align-self:center;">
                                +${fotosUrls.length - 3}
                            </span>
                        ` : ''}
                    </div>
                `;
            } else {
                fotosMiniaturas = `<span style="color:var(--gris-texto);font-size:0.7rem;"><i class="fas fa-camera" style="opacity:0.3;"></i> Sin fotos</span>`;
            }

            return `
                <div class="item-row-solicitud" style="border-bottom:1px solid var(--border-color);padding:0.5rem 0; display:flex; align-items:flex-start; gap:0.75rem; flex-wrap:wrap;">
                    <div style="flex:1; min-width:100px;">
                        <strong>${escapeHtml(item.descripcion || item.nombre || 'Item')}</strong>
                        ${item.detalle ? `<br><span style="color:var(--gris-texto);font-size:0.8rem;">${escapeHtml(item.detalle)}</span>` : ''}
                        <span style="background:var(--gris-oscuro);padding:0.1rem 0.5rem;border-radius:4px;font-size:0.75rem;display:inline-block;margin-top:2px;">
                            ×${item.cantidad || 1}
                        </span>
                    </div>
                    ${fotosMiniaturas}
                </div>
            `;
        }).join('');

        const modalBody = document.getElementById('modalComprarBody');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="orden-info" style="margin-bottom: 1rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:0.5rem 1rem; padding:0.75rem; background:var(--gris-oscuro); border-radius:8px;">
                    <div class="orden-info-item">
                        <label style="font-size:0.65rem; color:var(--gris-texto);"><i class="fas fa-hashtag"></i> Solicitud</label>
                        <span style="font-weight:600;">#${solicitud.id}</span>
                    </div>
                    <div class="orden-info-item">
                        <label style="font-size:0.65rem; color:var(--gris-texto);"><i class="fas fa-tag"></i> OT</label>
                        <span><strong>${escapeHtml(solicitud.orden_codigo)}</strong></span>
                    </div>
                    <div class="orden-info-item">
                        <label style="font-size:0.65rem; color:var(--gris-texto);"><i class="fas fa-car"></i> Vehículo</label>
                        <span>${escapeHtml(solicitud.vehiculo)}</span>
                    </div>
                </div>
                
                <div class="items-list" style="margin-bottom:1rem;">
                    <h4 style="margin:0 0 0.5rem 0; font-size:0.9rem;"><i class="fas fa-cubes"></i> Items a comprar (${items.length}):</h4>
                    <div style="max-height:200px; overflow-y:auto; padding-right:4px;">
                        ${itemsHtml}
                    </div>
                </div>
                
                ${solicitud.precio_cotizado ? `
                    <div class="precio-cotizado-box" style="padding:0.5rem;background:var(--gris-oscuro);border-radius:8px;margin-bottom:1rem;">
                        <strong>Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                        ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
                    </div>
                ` : ''}
                
                <div class="compra-form">
                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label style="font-weight:600; font-size:0.9rem;">Fecha de compra</label>
                        <input type="date" id="fechaCompra" class="form-input" value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:0.5rem; border-radius:6px; border:1px solid var(--border-color); background:var(--gris-oscuro); color:white;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label style="font-weight:600; font-size:0.9rem;">N° de Factura/Comprobante</label>
                        <input type="text" id="numeroFactura" class="form-input" placeholder="Ej: 001-123456" style="width:100%; padding:0.5rem; border-radius:6px; border:1px solid var(--border-color); background:var(--gris-oscuro); color:white;">
                    </div>
                    
                    <!-- 🔥 SECCIÓN DE PROVEEDOR CON SELECT Y BOTÓN NUEVO (SIN MAPA) -->
                    <div class="form-group proveedor-section" style="margin-bottom:0.75rem; padding:0.75rem; background:var(--bg-card); border-radius:8px; border:1px solid var(--border-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                            <label style="font-weight:600; font-size:0.9rem;">
                                <i class="fas fa-truck"></i> Proveedor *
                            </label>
                            <button type="button" class="btn-nuevo-proveedor" onclick="abrirModalProveedorCompra()" 
                                    style="padding:0.2rem 0.6rem; border-radius:4px; border:1px solid var(--rojo-primario); background:transparent; color:var(--rojo-primario); font-size:0.7rem; cursor:pointer;">
                                <i class="fas fa-plus"></i> Nuevo
                            </button>
                        </div>
                        
                        <select id="proveedorSelectCompra" class="form-control" style="width:100%; padding:0.5rem; border-radius:6px; border:1px solid var(--border-color); background:var(--gris-oscuro); color:white; font-size:0.9rem;">
                            <option value="">-- Seleccione un proveedor --</option>
                            ${selectProveedoresHtml}
                        </select>
                        
                        <div id="proveedorInfoDisplayCompra" style="margin-top:0.5rem; font-size:0.75rem; color:var(--gris-texto); display:none;">
                            <span id="proveedorTelefonoCompra"></span>
                            <span id="proveedorUbicacionCompra" style="margin-left:0.5rem;"></span>
                        </div>
                    </div>
                    
                    <!-- 🔥 EL MAPA YA NO ESTÁ AQUÍ - SE MOVIÓ AL MODAL DE NUEVO PROVEEDOR -->
                    
                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label style="font-weight:600; font-size:0.9rem;">Monto total de la compra (Bs.)</label>
                        <input type="number" id="montoCompra" step="0.01" class="form-input" placeholder="0.00" style="width:100%; padding:0.5rem; border-radius:6px; border:1px solid var(--border-color); background:var(--gris-oscuro); color:white;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label style="font-weight:600; font-size:0.9rem;"><i class="fas fa-image"></i> Subir foto del recibo/comprobante <span class="required">*</span></label>
                        <div class="file-upload-area" id="comprobanteUploadArea" style="border:2px dashed var(--border-color); border-radius:8px; padding:1rem; text-align:center; cursor:pointer; transition:all 0.3s;">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 28px; color: var(--rojo-primario); margin-bottom: 0.3rem;"></i>
                            <p style="margin: 0; font-size: 0.8rem;">Haz clic para seleccionar el comprobante</p>
                            <small style="color: var(--gris-texto); font-size:0.65rem;">Formatos: JPG, PNG, PDF (Máx. 5MB)</small>
                            <input type="file" id="comprobanteFile" accept="image/*,application/pdf" style="display: none;">
                        </div>
                        <div id="comprobantePreview" style="display: none; margin-top: 0.5rem; padding:0.5rem; background:var(--gris-oscuro); border-radius:6px; display:none; align-items:center; gap:0.5rem;">
                            <i class="fas fa-file-image" style="color:var(--verde-exito);"></i>
                            <span id="comprobanteNombre"></span>
                            <button type="button" id="removeComprobanteBtn" class="btn-remove-comprobante" style="background:transparent; border:none; color:var(--rojo-primario); cursor:pointer; margin-left:auto;">
                                <i class="fas fa-times-circle"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label style="font-weight:600; font-size:0.9rem;">Notas de compra (opcional)</label>
                        <textarea id="notasCompra" rows="2" class="form-textarea" placeholder="Detalles adicionales de la compra..." style="width:100%; padding:0.5rem; border-radius:6px; border:1px solid var(--border-color); background:var(--gris-oscuro); color:white; resize:vertical;"></textarea>
                    </div>
                </div>
            `;
        }

        setTimeout(() => {
            configurarSubidaComprobante();

            // 🔥 INICIALIZAR MAPA SOLO EN EL MODAL DE PROVEEDOR
            // El mapa se inicializa cuando se abre el modal de proveedor (abrirModalProveedorCompra)
            // NO aquí

            const proveedorSelect = document.getElementById('proveedorSelectCompra');
            if (proveedorSelect) {
                proveedorSelect.addEventListener('change', function() {
                    const selectedId = parseInt(this.value);
                    if (selectedId && proveedoresCompraCache.data.length > 0) {
                        mostrarInfoProveedorCompra(selectedId, proveedoresCompraCache.data);
                    } else {
                        const infoDisplay = document.getElementById('proveedorInfoDisplayCompra');
                        if (infoDisplay) infoDisplay.style.display = 'none';
                    }
                });
            }

            // 🔥 CARGAR IMÁGENES DE MINIATURAS
            const miniaturas = document.querySelectorAll('#modalComprarBody .miniatura-img');
            miniaturas.forEach(img => {
                const url = img.getAttribute('data-url');
                if (url) {
                    const decodedUrl = decodeURI(url);
                    cargarImagenProxyEncargado(decodedUrl, img);
                }
            });
        }, 200);

        abrirModal('modalComprar');

    }).catch(error => {
        mostrarLoading(false);
        console.error('Error cargando proveedores:', error);
        showToast('Error al cargar proveedores', 'error');
    });
}

function configurarSubidaComprobante() {
    const uploadArea = document.getElementById('comprobanteUploadArea');
    const fileInput = document.getElementById('comprobanteFile');
    const removeBtn = document.getElementById('removeComprobanteBtn');

    if (!uploadArea || !fileInput) return;

    const newUploadArea = uploadArea.cloneNode(true);
    uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);

    const finalUploadArea = document.getElementById('comprobanteUploadArea');
    const finalFileInput = document.getElementById('comprobanteFile');
    const finalRemoveBtn = document.getElementById('removeComprobanteBtn');

    if (!finalUploadArea || !finalFileInput) return;

    finalUploadArea.addEventListener('click', () => finalFileInput.click());

    finalFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) procesarArchivoComprobante(file);
    });

    if (finalRemoveBtn) {
        finalRemoveBtn.addEventListener('click', () => {
            currentComprobanteFile = null;
            const preview = document.getElementById('comprobantePreview');
            if (preview) preview.style.display = 'none';
            finalFileInput.value = '';
        });
    }
}

function procesarArchivoComprobante(file) {
    if (file.size > 5 * 1024 * 1024) {
        showToast('El archivo no debe superar los 5MB', 'error');
        return;
    }
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!tiposPermitidos.includes(file.type)) {
        showToast('Formato no permitido. Use JPG, PNG o PDF', 'error');
        return;
    }
    currentComprobanteFile = file;
    const preview = document.getElementById('comprobantePreview');
    const nombreSpan = document.getElementById('comprobanteNombre');
    if (preview && nombreSpan) {
        nombreSpan.textContent = file.name;
        preview.style.display = 'flex';
    }
    showToast('Comprobante cargado correctamente', 'success');
}

// =====================================================
// 🔥 CONFIRMAR COMPRA
// =====================================================

async function confirmarCompra() {
    const fechaCompra = document.getElementById('fechaCompra')?.value || new Date().toISOString().split('T')[0];
    const numeroFactura = document.getElementById('numeroFactura')?.value || '';
    const montoCompra = document.getElementById('montoCompra')?.value;
    const notas = document.getElementById('notasCompra')?.value || '';

    const proveedorSelect = document.getElementById('proveedorSelectCompra');
    let proveedorNombre = '';
    let proveedorId = null;

    if (proveedorSelect && proveedorSelect.value) {
        const selectedId = parseInt(proveedorSelect.value);
        proveedorId = selectedId;
        if (proveedoresCompraCache.data.length > 0) {
            const proveedor = proveedoresCompraCache.data.find(p => p.id === selectedId);
            if (proveedor) {
                proveedorNombre = proveedor.nombre;
            }
        }
    }

    if (!proveedorNombre) {
        showToast('⚠️ Debes seleccionar un proveedor', 'warning');
        if (proveedorSelect) {
            proveedorSelect.style.borderColor = 'var(--rojo-primario)';
            proveedorSelect.focus();
            setTimeout(() => {
                proveedorSelect.style.borderColor = '';
            }, 2000);
        }
        return;
    }

    if (!currentComprobanteFile) {
        showToast('⚠️ Debes subir la foto del recibo/comprobante de compra', 'warning');
        return;
    }

    const solicitud = solicitudesPendientes.find(s => s.id === currentSolicitudId);
    if (!solicitud) {
        showToast('No se encontró la solicitud', 'error');
        return;
    }

    const id_orden = solicitud.id_orden_trabajo;
    const codigo_orden = solicitud.orden_codigo;

    mostrarLoading(true);

    try {
        let comprobanteUrl = null;
        if (currentComprobanteFile) {
            try {
                comprobanteUrl = await subirComprobanteADrive(currentComprobanteFile, id_orden, codigo_orden);
                console.log('✅ Comprobante subido a Drive:', comprobanteUrl);
            } catch (driveError) {
                console.error('Error al subir a Drive:', driveError);
                showToast('Error al subir el comprobante. Intenta nuevamente.', 'error');
                mostrarLoading(false);
                return;
            }
        }

        const response = await fetch(`${API_URL}/solicitudes-compra/${currentSolicitudId}/comprar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                fecha_compra: fechaCompra,
                numero_factura: numeroFactura,
                proveedor_nombre: proveedorNombre,
                proveedor_id: proveedorId,
                monto_compra: montoCompra ? parseFloat(montoCompra) : null,
                notas_compra: notas,
                comprobante_url: comprobanteUrl
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('✅ Compra registrada exitosamente con comprobante en Drive', 'success');
            cerrarModal('modalComprar');
            currentComprobanteFile = null;
            await cargarSolicitudes();
        } else {
            showToast(data.error || 'Error al registrar compra', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al procesar la compra: ' + error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// REGISTRAR ENTREGA
// =====================================================

function abrirModalEntregar(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;

    currentSolicitudId = idSolicitud;

    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }

    const itemsHtml = items.map(item => {
        const fotosUrls = extraerUrlsFotos(item);
        const tieneFotos = fotosUrls.length > 0;

        let fotosMiniaturas = '';
        if (tieneFotos) {
            fotosMiniaturas = fotosUrls.slice(0, 3).map((url, i) => `
                <img src="${url}" style="width:35px;height:35px;object-fit:cover;border-radius:4px;border:2px solid var(--verde-exito);cursor:pointer;margin-right:4px;" 
                     onclick="verFotoAmpliadaEncargado('${url}')" 
                     onerror="this.style.display='none'"
                     title="Haz clic para ver ampliada">
            `).join('');
            if (fotosUrls.length > 3) {
                fotosMiniaturas += `<span style="font-size:0.6rem;color:var(--gris-texto);margin-left:4px;">+${fotosUrls.length - 3}</span>`;
            }
        } else {
            fotosMiniaturas = `<span style="color:var(--gris-texto);font-size:0.7rem;"><i class="fas fa-camera" style="opacity:0.3;"></i> Sin fotos</span>`;
        }

        return `
            <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm); display: flex; align-items: center; gap: 0.5rem; flex-wrap:wrap;">
                ${fotosMiniaturas}
                <div>
                    <strong>${escapeHtml(item.descripcion)}</strong> - ${item.cantidad} uds
                    ${item.detalle ? `<br><small style="color: var(--gris-texto);">${escapeHtml(item.detalle)}</small>` : ''}
                </div>
            </div>
        `;
    }).join('');

    const modalBody = document.getElementById('modalEntregarBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="orden-info" style="margin-bottom: 1rem;">
                <div class="orden-info-item">
                    <label>Orden</label>
                    <span><strong>${escapeHtml(solicitud.orden_codigo)}</strong></span>
                </div>
                <div class="orden-info-item">
                    <label>Vehículo</label>
                    <span>${escapeHtml(solicitud.vehiculo)}</span>
                </div>
            </div>
            
            <div class="items-list">
                <h4>Items a entregar:</h4>
                ${itemsHtml}
            </div>
            
            <div class="compra-form">
                <div class="form-group">
                    <label>Fecha de entrega</label>
                    <input type="date" id="fechaEntrega" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label>Notas de entrega (opcional)</label>
                    <textarea id="notasEntrega" rows="2" class="form-textarea" placeholder="Detalles de la entrega..."></textarea>
                </div>
            </div>
        `;
    }

    abrirModal('modalEntregar');
}

async function confirmarEntrega() {
    const fechaEntrega = document.getElementById('fechaEntrega')?.value || new Date().toISOString().split('T')[0];
    const notas = document.getElementById('notasEntrega')?.value || '';

    mostrarLoading(true);

    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${currentSolicitudId}/entregar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                fecha_entrega: fechaEntrega,
                notas_entrega: notas
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Entrega registrada exitosamente', 'success');
            cerrarModal('modalEntregar');
            await cargarSolicitudes();
        } else {
            showToast(data.error || 'Error al registrar entrega', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
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

        if (currentUser.roles && Array.isArray(currentUser.roles)) {
            currentUserRoles = currentUser.roles;
        } else if (currentUser.rol_principal) {
            currentUserRoles = [currentUser.rol_principal];
        }

        const tieneRolRepuestos = currentUserRoles.includes('encargado_repuestos') || 
                                    currentUserRoles.includes('encargado_rep_almacen') ||
                                    currentUser.rol_principal === 'encargado_repuestos';

        if (!tieneRolRepuestos) {
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = window.API_BASE_URL + '/';
            }, 2000);
            return null;
        }

        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', opciones);
        }

        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;

    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        window.location.href = window.API_BASE_URL + '/';
        return null;
    }
}

function logout() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = window.API_BASE_URL + '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarSolicitudes();
            showToast('Actualizando...', 'info');
        });
    }

    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarSolicitudes());
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarSolicitudes());
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // 🔥 EVENTO DEL FORMULARIO DE PROVEEDOR
    const proveedorForm = document.getElementById('proveedorFormCompra');
    if (proveedorForm) {
        proveedorForm.removeEventListener('submit', guardarProveedorCompra);
        proveedorForm.addEventListener('submit', guardarProveedorCompra);
    }

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal.id === 'modalProveedorCompra') {
                    cerrarModalProveedorCompra();
                } else if (modal.id === 'modalFotoAmpliadaEncargado') {
                    cerrarFotoAmpliadaEncargado();
                } else {
                    cerrarModal(modal.id);
                }
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                if (modal.id === 'modalProveedorCompra') {
                    cerrarModalProveedorCompra();
                } else if (modal.id === 'modalFotoAmpliadaEncargado') {
                    cerrarFotoAmpliadaEncargado();
                } else {
                    cerrarModal(modal.id);
                }
            });
        }
    });

    // Detectar edición manual del campo ubicacion_gps
    const ubicacionGps = document.getElementById('ubicacion_gps_compra');
    if (ubicacionGps) {
        ubicacionGps.addEventListener('input', function() {
            this.dataset.userEdited = 'true';
        });
    }
}

async function inicializar() {
    console.log('🚀 Inicializando solicitudes_compra.js - VERSIÓN CON FOTOS, MAPA Y PROVEEDORES');
    console.log('📡 API_URL:', API_URL);

    const user = await cargarUsuarioActual();
    if (!user) return;

    await cargarSolicitudes();
    setupEventListeners();

    console.log('✅ solicitudes_compra.js inicializado correctamente');
}

// =====================================================
// EXPORTAR FUNCIONES GLOBALES
// =====================================================

window.verDetalle = verDetalle;
window.verComprobante = verComprobante;
window.abrirModalComprar = abrirModalComprar;
window.abrirModalEntregar = abrirModalEntregar;
window.confirmarCompra = confirmarCompra;
window.confirmarEntrega = confirmarEntrega;
window.cerrarModal = cerrarModal;
window.logout = logout;
window.verFotoAmpliadaEncargado = verFotoAmpliadaEncargado;
window.cerrarFotoAmpliadaEncargado = cerrarFotoAmpliadaEncargado;
window.descargarFotoAmpliadaEncargado = descargarFotoAmpliadaEncargado;

// 🔥 Funciones de proveedores y mapa
window.abrirModalProveedorCompra = abrirModalProveedorCompra;
window.cerrarModalProveedorCompra = cerrarModalProveedorCompra;
window.guardarProveedorCompra = guardarProveedorCompra;
window.obtenerUbicacionActualCompra = obtenerUbicacionActualCompra;
window.cargarProveedoresCompra = cargarProveedoresCompra;
window.initMapCompra = initMapCompra;
window.actualizarCoordenadasCompra = actualizarCoordenadasCompra;

document.addEventListener('DOMContentLoaded', inicializar);

console.log('✅ solicitudes_compra.js cargado');