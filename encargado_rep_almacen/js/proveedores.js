// =====================================================
// PROVEEDORES.JS - ENCARGADO DE REPUESTOS
// VERSIÓN CON MAPA Y DESCRIPCIÓN - CORREGIDA
// FURIA MOTOR COMPANY SRL
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
const API_URL = `${window.API_BASE_URL}/api/encargado-repuestos`;

// Variables globales
let currentUser = null;
let currentUserRoles = [];
let proveedores = [];
let categoriasDisponibles = [];
let currentProveedorId = null;
let proveedorAEliminar = null;

// Bandera para evitar envíos duplicados
let isSubmitting = false;
let isInitialized = false;

// =====================================================
// MAPA CON OPENSTREETMAP (LEAFLET)
// =====================================================

let map = null;
let mapMarker = null;
let isMapInitialized = false;
let currentLat = null;
let currentLng = null;

// Coordenadas por defecto (Santa Cruz, Bolivia)
const DEFAULT_LAT = -17.7835;
const DEFAULT_LNG = -63.1821;

// Exponer para uso en HTML
window.DEFAULT_LAT = DEFAULT_LAT;
window.DEFAULT_LNG = DEFAULT_LNG;
window.map = map;
window.mapMarker = mapMarker;

function initMap(lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
    const container = document.getElementById('mapContainer');
    if (!container) {
        console.warn('⚠️ Contenedor del mapa no encontrado');
        return;
    }
    
    // Si ya existe el mapa, lo destruimos
    if (map) {
        map.remove();
        map = null;
        mapMarker = null;
    }
    
    try {
        // Crear mapa
        map = L.map('mapContainer', {
            center: [lat, lng],
            zoom: 15,
            zoomControl: true,
            fadeAnimation: true,
            attributionControl: true
        });
        
        // Capa de OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);
        
        // Icono personalizado
        const customIcon = L.divIcon({
            html: '<i class="fas fa-map-pin" style="color: #C1121F; font-size: 2rem; text-shadow: 0 2px 4px rgba(0,0,0,0.5);"></i>',
            className: 'custom-marker',
            iconSize: [30, 42],
            iconAnchor: [15, 42]
        });
        
        // Agregar marcador
        mapMarker = L.marker([lat, lng], {
            draggable: true,
            icon: customIcon
        }).addTo(map);
        
        // Actualizar coordenadas al mover el marcador
        mapMarker.on('dragend', function() {
            const pos = mapMarker.getLatLng();
            actualizarCoordenadas(pos.lat, pos.lng);
        });
        
        // Click en el mapa para mover el marcador
        map.on('click', function(e) {
            const pos = e.latlng;
            mapMarker.setLatLng(pos);
            actualizarCoordenadas(pos.lat, pos.lng);
        });
        
        // Actualizar coordenadas iniciales
        actualizarCoordenadas(lat, lng);
        
        isMapInitialized = true;
        
        // Exponer para uso global
        window.map = map;
        window.mapMarker = mapMarker;
        
        // Forzar redimensionamiento del mapa después de un momento
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
            }
        }, 300);
        
        console.log('🗺️ Mapa inicializado correctamente');
        
    } catch (error) {
        console.error('Error al inicializar el mapa:', error);
        showToast('Error al cargar el mapa. Verifica tu conexión.', 'error');
    }
}

function actualizarCoordenadas(lat, lng) {
    currentLat = lat;
    currentLng = lng;
    
    // Actualizar inputs ocultos
    const latInput = document.getElementById('latitud');
    const lngInput = document.getElementById('longitud');
    const ubicacionGps = document.getElementById('ubicacion_gps');
    const coordsDisplay = document.getElementById('coordsDisplay');
    
    if (latInput) latInput.value = lat.toFixed(7);
    if (lngInput) lngInput.value = lng.toFixed(7);
    
    // Actualizar campo de ubicación GPS con formato "lat, lng"
    if (ubicacionGps) {
        const coordsStr = `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
        // Solo actualizar si el campo está vacío o si el usuario no ha escrito manualmente
        if (!ubicacionGps.dataset.userEdited) {
            ubicacionGps.value = coordsStr;
        }
    }
    
    // Actualizar info visual
    if (coordsDisplay) {
        coordsDisplay.textContent = `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
    }
}

function obtenerUbicacionActual() {
    if (!navigator.geolocation) {
        showToast('Tu navegador no soporta geolocalización', 'warning');
        return;
    }
    
    showToast('Obteniendo ubicación...', 'info');
    
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            const { latitude, longitude } = pos.coords;
            // Mover el mapa a la ubicación actual
            if (map) {
                map.setView([latitude, longitude], 16);
                if (mapMarker) {
                    mapMarker.setLatLng([latitude, longitude]);
                }
                actualizarCoordenadas(latitude, longitude);
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

// Función para abrir en Google Maps
function abrirGoogleMaps(lat, lng, nombre) {
    if (!lat || !lng) {
        showToast('No hay coordenadas disponibles para este proveedor', 'warning');
        return;
    }
    
    const query = encodeURIComponent(nombre || 'Proveedor');
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, '_blank');
}

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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        // Si se cierra el modal de proveedor, destruir el mapa para liberar memoria
        if (modalId === 'modalProveedor' && map) {
            setTimeout(() => {
                if (map) {
                    map.remove();
                    map = null;
                    mapMarker = null;
                    window.map = null;
                    window.mapMarker = null;
                    isMapInitialized = false;
                }
            }, 300);
        }
    }
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Si se abre el modal de proveedor, inicializar el mapa
        if (modalId === 'modalProveedor') {
            // Dar tiempo para que el modal se renderice
            setTimeout(() => {
                const lat = parseFloat(document.getElementById('latitud')?.value) || DEFAULT_LAT;
                const lng = parseFloat(document.getElementById('longitud')?.value) || DEFAULT_LNG;
                initMap(lat, lng);
            }, 400);
        }
    }
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
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
// CARGAR CATEGORÍAS
// =====================================================

async function cargarCategorias() {
    try {
        const response = await fetch(`${API_URL}/proveedores/categorias`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            categoriasDisponibles = data.categorias || [];
            actualizarSelectCategorias();
        } else {
            console.error('Error cargando categorías:', data.error);
        }
    } catch (error) {
        console.error('Error cargando categorías:', error);
    }
}

function actualizarSelectCategorias() {
    const filtroCategoria = document.getElementById('filtroCategoria');
    if (filtroCategoria) {
        filtroCategoria.innerHTML = '<option value="all">Todas las categorías</option>' +
            categoriasDisponibles.map(c => `<option value="${c.id}">${escapeHtml(c.nombre_filtro)}</option>`).join('');
    }
    
    // Solo si existe el select de categorías en el formulario
    const selectForm = document.getElementById('id_filtro');
    if (selectForm) {
        selectForm.innerHTML = '<option value="">Seleccionar categoría</option>' +
            categoriasDisponibles.map(c => `<option value="${c.id}">${escapeHtml(c.nombre_filtro)}</option>`).join('');
    }
}

// =====================================================
// CARGAR PROVEEDORES
// =====================================================

async function cargarProveedores() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value || '';
        const categoria = document.getElementById('filtroCategoria')?.value || 'all';
        
        let url = `${API_URL}/proveedores`;
        const params = new URLSearchParams();
        
        if (search) params.append('search', search);
        if (categoria !== 'all') params.append('categoria', categoria);
        
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        
        if (response.status === 401) {
            showToast('Sesión expirada, redirigiendo...', 'warning');
            setTimeout(() => { window.location.href = `${window.API_BASE_URL}/`; }, 1500);
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            proveedores = data.proveedores || [];
            renderizarProveedores(proveedores);
            
            if (data.categorias && data.categorias.length > 0) {
                categoriasDisponibles = data.categorias;
                actualizarSelectCategorias();
            }
        } else {
            showToast(data.error || 'Error al cargar proveedores', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarProveedores(proveedoresList) {
    const container = document.getElementById('proveedoresGrid');
    if (!container) return;
    
    if (proveedoresList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-truck fa-3x"></i>
                <p>No hay proveedores registrados</p>
                <small>Haz clic en "Nuevo Proveedor" para comenzar</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = proveedoresList.map((proveedor, index) => {
        const tieneInfo = proveedor.propietario || proveedor.ubicacion_gps || proveedor.descripcion || proveedor.categoria;
        
        // Extraer coordenadas de ubicacion_gps si existen
        let lat = null, lng = null;
        if (proveedor.ubicacion_gps) {
            const coords = proveedor.ubicacion_gps.split(',').map(s => s.trim());
            if (coords.length === 2) {
                lat = parseFloat(coords[0]);
                lng = parseFloat(coords[1]);
            }
        }
        
        const tieneCoords = lat && lng && !isNaN(lat) && !isNaN(lng);
        
        return `
            <div class="proveedor-card" data-id="${proveedor.id}" style="animation-delay: ${Math.min(index * 0.05, 0.5)}s">
                <div class="proveedor-header">
                    <div class="proveedor-nombre">
                        <i class="fas fa-building"></i>
                        ${escapeHtml(proveedor.nombre)}
                    </div>
                </div>
                <div class="proveedor-body">
                    <div class="proveedor-info">
                        ${proveedor.propietario ? `
                            <div class="info-item">
                                <i class="fas fa-user"></i>
                                <span>${escapeHtml(proveedor.propietario)}</span>
                            </div>
                        ` : ''}
                        <div class="info-item">
                            <i class="fas fa-phone"></i>
                            <span>${escapeHtml(proveedor.telefono)}</span>
                        </div>
                        ${proveedor.descripcion ? `
                            <div class="info-item">
                                <i class="fas fa-tags"></i>
                                <span class="descripcion-texto">${escapeHtml(proveedor.descripcion)}</span>
                            </div>
                        ` : ''}
                        ${proveedor.categoria ? `
                            <div class="info-item">
                                <i class="fas fa-tag"></i>
                                <span><span class="categoria-tag">${escapeHtml(proveedor.categoria)}</span></span>
                            </div>
                        ` : ''}
                        ${proveedor.ubicacion_gps ? `
                            <div class="info-item">
                                <i class="fas fa-map-marker-alt"></i>
                                <span title="${escapeHtml(proveedor.ubicacion_gps)}">
                                    ${escapeHtml(proveedor.ubicacion_gps.length > 30 ? proveedor.ubicacion_gps.substring(0, 30) + '...' : proveedor.ubicacion_gps)}
                                </span>
                                ${tieneCoords ? `
                                    <button class="btn-maps" onclick="event.stopPropagation(); abrirGoogleMaps(${lat}, ${lng}, '${escapeHtml(proveedor.nombre)}')" title="Abrir en Google Maps">
                                        <i class="fas fa-external-link-alt"></i> Maps
                                    </button>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                    
                    ${!tieneInfo ? `
                        <div class="info-item" style="justify-content: center; color: var(--gris-texto);">
                            <i class="fas fa-info-circle"></i>
                            <span>Sin información adicional</span>
                        </div>
                    ` : ''}
                    
                    <div class="proveedor-actions">
                        <button class="action-btn view" onclick="verDetalle(${proveedor.id})" title="Ver Detalle">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="action-btn edit" onclick="editarProveedor(${proveedor.id})" title="Editar">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="action-btn delete" onclick="confirmarEliminarModal(${proveedor.id}, '${escapeHtml(proveedor.nombre)}')" title="Eliminar">
                            <i class="fas fa-trash-alt"></i> Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// CRUD DE PROVEEDORES - CORREGIDO
// =====================================================

function limpiarFormulario() {
    console.log('🧹 Limpiando formulario...');
    
    // Limpiar cada campo con verificación de existencia
    const campos = [
        'proveedorId',
        'nombre',
        'propietario',
        'telefono',
        'descripcion',
        'ubicacion_gps',
        'latitud',
        'longitud'
    ];
    
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = '';
        } else {
            console.warn(`⚠️ Elemento no encontrado: #${id}`);
        }
    });
    
    // Limpiar select de categoría (si existe)
    const idFiltro = document.getElementById('id_filtro');
    if (idFiltro) {
        idFiltro.value = '';
    }
    
    // Resetear flag de edición manual
    const ubicacionGps = document.getElementById('ubicacion_gps');
    if (ubicacionGps) {
        delete ubicacionGps.dataset.userEdited;
    }
    
    // Actualizar título del modal
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-truck"></i> Nuevo Proveedor';
    }
    
    // Resetear coordenadas actuales a las de default
    currentLat = DEFAULT_LAT;
    currentLng = DEFAULT_LNG;
    
    console.log('✅ Formulario limpiado correctamente');
}

function abrirNuevoProveedor() {
    console.log('🔄 Abriendo modal de nuevo proveedor...');
    limpiarFormulario();
    abrirModal('modalProveedor');
    setTimeout(() => { 
        const nombreInput = document.getElementById('nombre');
        if (nombreInput) nombreInput.focus();
    }, 150);
}

async function editarProveedor(id) {
    console.log(`✏️ Editando proveedor ID: ${id}`);
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/proveedores/${id}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success && data.proveedor) {
            const proveedor = data.proveedor;
            
            // Asignar valores con verificación de existencia
            const proveedorId = document.getElementById('proveedorId');
            if (proveedorId) proveedorId.value = proveedor.id;
            
            const nombre = document.getElementById('nombre');
            if (nombre) nombre.value = proveedor.nombre || '';
            
            const propietario = document.getElementById('propietario');
            if (propietario) propietario.value = proveedor.propietario || '';
            
            const telefono = document.getElementById('telefono');
            if (telefono) telefono.value = proveedor.telefono || '';
            
            const descripcion = document.getElementById('descripcion');
            if (descripcion) descripcion.value = proveedor.descripcion || '';
            
            const ubicacionGps = document.getElementById('ubicacion_gps');
            if (ubicacionGps) {
                ubicacionGps.value = proveedor.ubicacion_gps || '';
                delete ubicacionGps.dataset.userEdited;
            }
            
            // Si existe el select de categoría
            const idFiltro = document.getElementById('id_filtro');
            if (idFiltro) {
                idFiltro.value = proveedor.id_filtro || '';
            }
            
            // Extraer coordenadas para el mapa
            let lat = DEFAULT_LAT, lng = DEFAULT_LNG;
            if (proveedor.ubicacion_gps) {
                const coords = proveedor.ubicacion_gps.split(',').map(s => s.trim());
                if (coords.length === 2) {
                    const parsedLat = parseFloat(coords[0]);
                    const parsedLng = parseFloat(coords[1]);
                    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
                        lat = parsedLat;
                        lng = parsedLng;
                    }
                }
            }
            
            const latitud = document.getElementById('latitud');
            if (latitud) latitud.value = lat;
            
            const longitud = document.getElementById('longitud');
            if (longitud) longitud.value = lng;
            
            currentLat = lat;
            currentLng = lng;
            
            const modalTitle = document.getElementById('modalTitle');
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Proveedor';
            }
            
            abrirModal('modalProveedor');
            
            // Inicializar mapa con las coordenadas del proveedor
            setTimeout(() => {
                initMap(lat, lng);
            }, 500);
            
        } else {
            showToast('No se encontró el proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar el proveedor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// GUARDAR PROVEEDOR
// =====================================================

async function guardarProveedor(event) {
    // Prevenir comportamiento por defecto
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Evitar envíos duplicados
    if (isSubmitting) {
        console.log('⏳ Ya hay un envío en proceso, ignorando...');
        return;
    }
    
    isSubmitting = true;
    
    // Deshabilitar botón de submit
    const submitBtn = document.querySelector('#proveedorForm .btn-primary');
    let originalBtnText = '';
    if (submitBtn) {
        originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }
    
    try {
        const id = document.getElementById('proveedorId').value;
        const nombre = document.getElementById('nombre').value.trim();
        const telefono = document.getElementById('telefono').value.trim();
        const propietario = document.getElementById('propietario').value.trim();
        const descripcion = document.getElementById('descripcion').value.trim();
        const ubicacion_gps = document.getElementById('ubicacion_gps').value.trim();
        
        // Obtener id_filtro solo si existe
        const idFiltroEl = document.getElementById('id_filtro');
        const id_filtro = idFiltroEl ? idFiltroEl.value : null;
        
        // Validaciones
        if (!nombre) {
            showToast('El nombre del proveedor es requerido', 'error');
            document.getElementById('nombre').focus();
            return;
        }
        
        if (!telefono) {
            showToast('El teléfono es requerido', 'error');
            document.getElementById('telefono').focus();
            return;
        }
        
        // Si el campo ubicacion_gps está vacío pero el mapa tiene coordenadas, usar las del mapa
        let ubicacionFinal = ubicacion_gps;
        if (!ubicacionFinal && currentLat && currentLng) {
            ubicacionFinal = `${currentLat.toFixed(7)}, ${currentLng.toFixed(7)}`;
        }
        
        const proveedorData = {
            nombre: nombre,
            telefono: telefono,
            propietario: propietario || null,
            descripcion: descripcion || null,
            ubicacion_gps: ubicacionFinal || null,
            id_filtro: id_filtro || null
        };
        
        mostrarLoading(true);
        
        let url = `${API_URL}/proveedores`;
        let method = 'POST';
        
        if (id) {
            url = `${API_URL}/proveedores/${id}`;
            method = 'PUT';
        }
        
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(proveedorData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(id ? '✅ Proveedor actualizado' : '✅ Proveedor creado', 'success');
            cerrarModal('modalProveedor');
            await cargarProveedores();
        } else {
            showToast(data.error || 'Error al guardar proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
        isSubmitting = false;
        
        // Rehabilitar botón
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

// =====================================================
// ELIMINAR PROVEEDOR
// =====================================================

function confirmarEliminarModal(id, nombre) {
    proveedorAEliminar = id;
    const nombreEl = document.getElementById('proveedorNombreEliminar');
    if (nombreEl) {
        nombreEl.innerHTML = `<strong>${escapeHtml(nombre)}</strong>`;
    }
    abrirModal('modalEliminar');
}

async function confirmarEliminar() {
    if (!proveedorAEliminar) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/proveedores/${proveedorAEliminar}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Proveedor eliminado exitosamente', 'success');
            cerrarModal('modalEliminar');
            proveedorAEliminar = null;
            await cargarProveedores();
        } else {
            showToast(data.error || 'Error al eliminar proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE - SIN CATEGORÍA
// =====================================================

let currentDetalleId = null;

async function verDetalle(id) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/proveedores/${id}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success && data.proveedor) {
            const p = data.proveedor;
            currentDetalleId = p.id;
            
            // Extraer coordenadas para el botón de Maps
            let lat = null, lng = null;
            if (p.ubicacion_gps) {
                const coords = p.ubicacion_gps.split(',').map(s => s.trim());
                if (coords.length === 2) {
                    lat = parseFloat(coords[0]);
                    lng = parseFloat(coords[1]);
                }
            }
            const tieneCoords = lat && lng && !isNaN(lat) && !isNaN(lng);
            
            const modalBody = document.getElementById('modalDetalleBody');
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="detalle-grid">
                        <div class="detalle-item full-width">
                            <label><i class="fas fa-building"></i> Nombre</label>
                            <p><strong>${escapeHtml(p.nombre)}</strong></p>
                        </div>
                        <div class="detalle-item">
                            <label><i class="fas fa-user"></i> Propietario</label>
                            <p>${escapeHtml(p.propietario) || '-'}</p>
                        </div>
                        <div class="detalle-item">
                            <label><i class="fas fa-phone"></i> Teléfono</label>
                            <p>${escapeHtml(p.telefono)}</p>
                        </div>
                        <div class="detalle-item full-width">
                            <label><i class="fas fa-tags"></i> Repuestos que ofrece</label>
                            <p>${escapeHtml(p.descripcion) || '-'}</p>
                        </div>
                        <div class="detalle-item full-width">
                            <label><i class="fas fa-map-marker-alt"></i> Ubicación GPS</label>
                            <p>
                                ${escapeHtml(p.ubicacion_gps) || '-'}
                                ${tieneCoords ? `
                                    <button class="btn-maps" onclick="abrirGoogleMaps(${lat}, ${lng}, '${escapeHtml(p.nombre)}')" title="Abrir en Google Maps" style="margin-left: 0.5rem;">
                                        <i class="fas fa-external-link-alt"></i> Maps
                                    </button>
                                ` : ''}
                            </p>
                        </div>
                    </div>
                `;
            }
            
            abrirModal('modalDetalle');
        } else {
            showToast('No se encontró el proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar el detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function editarDesdeDetalle() {
    if (currentDetalleId) {
        cerrarModal('modalDetalle');
        editarProveedor(currentDetalleId);
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
        
        currentUserRoles = currentUser.roles || (currentUser.rol_principal ? [currentUser.rol_principal] : []);
        
        const tieneRolRepuestos = currentUserRoles.some(r => 
            r === 'encargado_repuestos' || r === 'encargado_rep_almacen'
        );
        
        if (!tieneRolRepuestos) {
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => { window.location.href = `${window.API_BASE_URL}/`; }, 2000);
            return null;
        }
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
        
    } catch (error) {
        console.error('Error:', error);
        window.location.href = `${window.API_BASE_URL}/`;
        return null;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function agregarFiltroCategoria() {
    const filtrosBar = document.querySelector('.filtros-bar');
    if (!filtrosBar) return;
    if (document.getElementById('filtroCategoria')) return;
    
    const searchBox = filtrosBar.querySelector('.search-box');
    if (searchBox) {
        const selectHTML = `
            <select id="filtroCategoria" style="min-width: 180px; padding: 0.5rem 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--gris-oscuro); color: var(--blanco);">
                <option value="all">Todas las categorías</option>
            </select>
        `;
        searchBox.insertAdjacentHTML('afterend', selectHTML);
    }
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarProveedores();
            cargarCategorias();
            showToast('Actualizando lista...', 'info');
        });
    }
    
    const btnNuevo = document.getElementById('btnNuevoProveedor');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', abrirNuevoProveedor);
    }
    
    const filtroCategoria = document.getElementById('filtroCategoria');
    if (filtroCategoria) {
        filtroCategoria.addEventListener('change', () => cargarProveedores());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(() => cargarProveedores(), 500);
        searchInput.addEventListener('input', debouncedSearch);
    }
    
    // Detectar edición manual del campo ubicacion_gps
    const ubicacionGps = document.getElementById('ubicacion_gps');
    if (ubicacionGps) {
        ubicacionGps.addEventListener('input', function() {
            this.dataset.userEdited = 'true';
        });
    }
    
    // IMPORTANTE: Configurar el formulario sin duplicados
    const proveedorForm = document.getElementById('proveedorForm');
    if (proveedorForm) {
        proveedorForm.removeEventListener('submit', guardarProveedor);
        proveedorForm.addEventListener('submit', guardarProveedor);
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModal(modal.id);
        });
    });
}

async function inicializar() {
    if (isInitialized) {
        console.log('⚠️ Ya inicializado');
        return;
    }
    
    console.log('🚀 Inicializando proveedores.js');
    console.log('📡 window.API_BASE_URL:', window.API_BASE_URL);
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    agregarFiltroCategoria();
    
    await cargarCategorias();
    await cargarProveedores();
    
    setupEventListeners();
    
    isInitialized = true;
    console.log('✅ proveedores.js inicializado correctamente');
}

// =====================================================
// EXPORTAR FUNCIONES GLOBALES
// =====================================================

window.verDetalle = verDetalle;
window.editarProveedor = editarProveedor;
window.guardarProveedor = guardarProveedor;
window.confirmarEliminarModal = confirmarEliminarModal;
window.confirmarEliminar = confirmarEliminar;
window.editarDesdeDetalle = editarDesdeDetalle;
window.cerrarModal = cerrarModal;
window.abrirNuevoProveedor = abrirNuevoProveedor;
window.abrirGoogleMaps = abrirGoogleMaps;
window.obtenerUbicacionActual = obtenerUbicacionActual;
window.initMap = initMap;
window.actualizarCoordenadas = actualizarCoordenadas;

// Inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}

console.log('✅ proveedores.js cargado correctamente');