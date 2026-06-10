// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 Recepcion.js - Modo DESARROLLO');
            return 'http://localhost:5000';
        }
        console.log('📡 Recepcion.js - Modo PRODUCCIÓN');
        return '';
    })();
}

// =====================================================
// CONFIGURACIÓN DE CLOUDINARY PARA SUBIDA DIRECTA DE AUDIO
// =====================================================

const CLOUDINARY_CLOUD_NAME = 'drpt6ztkd';  // Tu cloud name
const CLOUDINARY_UPLOAD_PRESET = 'furia_audio_unsigned';  // El preset que creaste

// =====================================================
// RECEPCION.JS - JEFE OPERATIVO
// VERSIÓN CORREGIDA - AUDIO DIRECTO A CLOUDINARY
// =====================================================

// Configuración
const API_URL = `${window.API_BASE_URL}/api`;
const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args)
};

// Coordenadas del taller (CAMBIA ESTO POR LA UBICACIÓN REAL DE TU TALLER)
const TALLER_LAT = -17.3895;
const TALLER_LNG = -66.1568;

// Variables de sesión
let sesionActual = null;
let codigoSesion = null;
let pollingInterval = null;
let sesionesPolling = null;
let userInfo = null;
let keepAliveInterval = null;
let actualizando = false;

// Control de edición
let camposEnEdicion = {
    cliente: false,
    vehiculo: false,
    descripcion: false
};
let timeoutsEdicion = {};

// Variables para manejo de fotos y audio
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioBlob = null;
let audioCloudinaryUrl = null;  // URL guardada después de subir a Cloudinary

// Variables para control de descripción
let descripcionModificadaManualmente = false;
let descripcionOriginal = '';

// Variables para recepciones guardadas
let recepcionesActuales = [];
let paginaActual = 1;
let itemsPorPagina = 10;
let recepcionSeleccionada = null;
let modoEdicionRecepcion = false;
let recepcionEditandoId = null;

// Variables para Leaflet
let mapCliente = null;
let markerCliente = null;
let ubicacionTemporal = { texto: '', lat: null, lng: null };
let leafletInicializado = false;

// Elementos DOM
const sesionesActivasPanel = document.getElementById('sesionesActivasPanel');
const sesionesList = document.getElementById('sesionesList');
const sesionesCount = document.getElementById('sesionesCount');
const btnCrearSesion = document.getElementById('btnCrearSesion');
const sessionPanel = document.getElementById('sessionPanel');
const colaboradoresPanel = document.getElementById('colaboradoresPanel');
const recepcionForm = document.getElementById('recepcionForm');
const btnCancelarSesion = document.getElementById('btnCancelarSesion');
const codigoActivoSpan = document.getElementById('codigoActivo');
const btnFinalizar = document.getElementById('btnFinalizar');
const colaboradoresCount = document.getElementById('colaboradoresCount');
const colaboradoresCountDetail = document.getElementById('colaboradoresCountDetail');
const colaboradoresList = document.getElementById('colaboradoresList');
const btnCopiarCodigoSesion = document.getElementById('btnCopiarCodigoSesion');

const photoGrid = document.getElementById('photoGrid');
const btnGrabarAudio = document.getElementById('btnGrabarAudio');
const btnEliminarAudio = document.getElementById('btnEliminarAudio');
const btnTranscribirAudio = document.getElementById('btnTranscribirAudio');
const audioStatus = document.getElementById('audioStatus');
const audioPreview = document.getElementById('audioPreview');
const descripcionProblema = document.getElementById('descripcionProblema');
const codigoModal = document.getElementById('codigoModal');
const codigoOrdenModal = document.getElementById('codigoOrdenModal');
const currentDateSpan = document.getElementById('currentDate');

const clienteUbicacionInput = document.getElementById('clienteUbicacion');
const clienteLatitudInput = document.getElementById('clienteLatitud');
const clienteLongitudInput = document.getElementById('clienteLongitud');
const btnAbrirModalUbicacion = document.getElementById('btnAbrirModalUbicacion');

const FOTOS_CONFIG = [
    { id: 'fotoLateralIzq', nombre: 'lateral_izquierdo', label: 'Lateral Izquierdo', icono: 'fa-car-side', campo: 'url_lateral_izquierda' },
    { id: 'fotoLateralDer', nombre: 'lateral_derecho', label: 'Lateral Derecho', icono: 'fa-car-side', campo: 'url_lateral_derecha' },
    { id: 'fotoFrontal', nombre: 'frontal', label: 'Frontal', icono: 'fa-car', campo: 'url_foto_frontal' },
    { id: 'fotoTrasera', nombre: 'trasera', label: 'Trasera', icono: 'fa-car', campo: 'url_foto_trasera' },
    { id: 'fotoSuperior', nombre: 'superior', label: 'Superior', icono: 'fa-arrow-up', campo: 'url_foto_superior' },
    { id: 'fotoInferior', nombre: 'inferior', label: 'Inferior', icono: 'fa-arrow-down', campo: 'url_foto_inferior' },
    { id: 'fotoTablero', nombre: 'tablero', label: 'Tablero', icono: 'fa-tachometer-alt', campo: 'url_foto_tablero' }
];

// =====================================================
// FUNCIÓN PARA SUBIR AUDIO DIRECTAMENTE A CLOUDINARY
// =====================================================
async function subirAudioCloudinary(audioBlob) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', 'furia_motor/audios');
        formData.append('resource_type', 'video');  // Importante!
        
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
        
        console.log('📤 Subiendo audio a Cloudinary...');
        
        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                console.log('✅ Audio subido a Cloudinary:', data.secure_url);
                resolve(data.secure_url);
            } else {
                console.error('❌ Error Cloudinary:', data);
                reject(new Error(data.error?.message || 'Error subiendo audio'));
            }
        })
        .catch(error => {
            console.error('❌ Error en fetch:', error);
            reject(error);
        });
    });
}

// =====================================================
// INICIALIZACIÓN
// =====================================================
window.addEventListener('beforeunload', () => {
    if (codigoSesion && sesionActual && sesionActual.estado === 'activa') {
        localStorage.setItem('sesion_abandonada', codigoSesion);
    }
});

async function verificarSesionAbandonada() {
    const sesionAbandonada = localStorage.getItem('sesion_abandonada');
    if (sesionAbandonada) {
        localStorage.removeItem('sesion_abandonada');
        logger.info(`Sesión ${sesionAbandonada} abandonada`);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando recepcion.js');
    console.log('📡 API_BASE_URL:', window.API_BASE_URL);
    console.log('📡 CLOUDINARY_CLOUD_NAME:', CLOUDINARY_CLOUD_NAME);
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    await verificarSesionAbandonada();
    
    initPage();
    generatePhotoUploads();
    setupPhotoUploads();
    setupAudioRecording();
    setupTranscripcion();  // Deshabilitada
    setupEventListeners();
    setupPlacaValidation();
    setupInputTracking();
    setupUnirsePorCodigo();
    setupModalUbicacionLeaflet();
    
    await recuperarSesionActiva();
    
    iniciarPollingSesiones();
    initRecepcionesPanel();
    iniciarEscuchaCambios();
});

// =====================================================
// COLABORACIÓN EN TIEMPO REAL
// =====================================================

function notificarCambioSeccion(seccion) {
    const evento = {
        type: 'SECCION_GUARDADA',
        seccion: seccion,
        timestamp: Date.now(),
        usuario: userInfo?.nombre || 'Usuario'
    };
    localStorage.setItem('furia_cambio_seccion', JSON.stringify(evento));
    setTimeout(() => {
        if (localStorage.getItem('furia_cambio_seccion') === JSON.stringify(evento)) {
            localStorage.removeItem('furia_cambio_seccion');
        }
    }, 500);
}

function iniciarEscuchaCambios() {
    window.addEventListener('storage', (e) => {
        if (e.key === 'furia_cambio_seccion' && e.newValue && !actualizando) {
            try {
                const evento = JSON.parse(e.newValue);
                if (evento.usuario === userInfo?.nombre) return;
                if (codigoSesion && !camposEnEdicion[evento.seccion]) {
                    cargarDatosSesion();
                    mostrarNotificacion(`📝 ${evento.usuario} actualizó: ${evento.seccion}`, 'info');
                }
            } catch (error) {
                console.error('Error:', error);
            }
        }
    });
}

// =====================================================
// CHECK AUTH
// =====================================================
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userInfoRaw = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = `${window.API_BASE_URL}/`;
        return false;
    }
    
    try {
        userInfo = JSON.parse(userInfoRaw || '{}');
        const verifyResponse = await fetch(`${window.API_BASE_URL}/api/verify-token`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!verifyResponse.ok) {
            localStorage.clear();
            window.location.href = `${window.API_BASE_URL}/`;
            return false;
        }
        
        const verifyData = await verifyResponse.json();
        if (verifyData.user) {
            userInfo = verifyData.user;
            localStorage.setItem('furia_user', JSON.stringify(userInfo));
        }
        
        const tieneRolJefeOperativo = (userInfo.roles && userInfo.roles.includes('jefe_operativo')) || userInfo.rol === 'jefe_operativo';
        
        if (!tieneRolJefeOperativo) {
            if (userInfo.roles && userInfo.roles.includes('jefe_taller')) {
                window.location.href = `${window.API_BASE_URL}/jefe_taller/dashboard.html`;
            } else {
                window.location.href = `${window.API_BASE_URL}/`;
            }
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error en checkAuth:', error);
        window.location.href = `${window.API_BASE_URL}/`;
        return false;
    }
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    if (currentDateSpan) currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

// =====================================================
// RUTAS
// =====================================================
function abrirRutaEnGoogleMaps(lat, lng, direccion) {
    let destino = '';
    if (lat && lng && lat !== 'null' && lat !== '' && lng !== 'null' && lng !== '') {
        destino = `${lat},${lng}`;
    } else if (direccion && direccion !== '' && direccion !== 'null') {
        destino = encodeURIComponent(direccion);
    } else {
        mostrarNotificacion('❌ No hay ubicación guardada', 'warning');
        return;
    }
    const url = `https://www.google.com/maps/dir/${TALLER_LAT},${TALLER_LNG}/${destino}`;
    window.open(url, '_blank');
}

function abrirRutaEnWaze(lat, lng) {
    if (!lat || lat === 'null' || lat === '' || !lng || lng === 'null' || lng === '') {
        mostrarNotificacion('❌ No hay coordenadas para Waze', 'warning');
        return;
    }
    window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank');
}

function abrirRutaEnOpenStreetMap(lat, lng, direccion) {
    let destino = '';
    if (lat && lng && lat !== 'null' && lat !== '' && lng !== 'null' && lng !== '') {
        destino = `${lat},${lng}`;
    } else if (direccion && direccion !== '' && direccion !== 'null') {
        destino = encodeURIComponent(direccion);
    } else {
        mostrarNotificacion('❌ No hay ubicación', 'warning');
        return;
    }
    window.open(`https://www.openstreetmap.org/directions?engine=osrm_car&from=${TALLER_LAT},${TALLER_LNG}&to=${destino}`, '_blank');
}

function copiarCoordenadas(lat, lng) {
    if (!lat || !lng) {
        mostrarNotificacion('No hay coordenadas', 'warning');
        return;
    }
    navigator.clipboard.writeText(`${lat},${lng}`);
    mostrarNotificacion('📋 Coordenadas copiadas', 'success');
}

// =====================================================
// LEAFLET - SELECTOR DE UBICACIÓN GRATUITO
// =====================================================

function initLeafletMap() {
    if (leafletInicializado) return;
    
    const mapContainer = document.getElementById('leafletMapa');
    if (!mapContainer) return;
    
    const defaultCoords = [TALLER_LAT, TALLER_LNG];
    
    mapCliente = L.map(mapContainer).setView(defaultCoords, 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(mapCliente);
    
    markerCliente = L.marker(defaultCoords, {
        draggable: true,
        autoPan: true
    });
    
    markerCliente.on('dragend', async function(e) {
        const pos = markerCliente.getLatLng();
        const direccion = await obtenerDireccionDesdeCoordenadas(pos.lat, pos.lng);
        
        ubicacionTemporal = {
            texto: direccion,
            lat: pos.lat,
            lng: pos.lng
        };
        actualizarInfoUbicacionLeaflet();
    });
    
    mapCliente.on('click', async function(e) {
        markerCliente.setLatLng(e.latlng);
        const direccion = await obtenerDireccionDesdeCoordenadas(e.latlng.lat, e.latlng.lng);
        
        ubicacionTemporal = {
            texto: direccion,
            lat: e.latlng.lat,
            lng: e.latlng.lng
        };
        actualizarInfoUbicacionLeaflet();
        
        if (!mapCliente.hasLayer(markerCliente)) {
            markerCliente.addTo(mapCliente);
        }
    });
    
    leafletInicializado = true;
    console.log('✅ Leaflet inicializado correctamente');
    
    cargarUbicacionExistenteLeaflet();
}

async function obtenerDireccionDesdeCoordenadas(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`);
        const data = await response.json();
        if (data && data.display_name) return data.display_name;
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
        console.error('Error obteniendo dirección:', error);
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

async function buscarDireccionLeaflet(query) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error buscando dirección:', error);
        return [];
    }
}

function actualizarInfoUbicacionLeaflet() {
    const ubicacionInfoDiv = document.getElementById('ubicacionInfoLeaflet');
    const ubicacionSeleccionadaTexto = document.getElementById('ubicacionSeleccionadaTextoLeaflet');
    const btnConfirmarUbicacionLeaflet = document.getElementById('btnConfirmarUbicacionLeaflet');
    
    if (ubicacionTemporal.texto && ubicacionInfoDiv) {
        ubicacionInfoDiv.style.display = 'block';
        if (ubicacionSeleccionadaTexto) ubicacionSeleccionadaTexto.textContent = ubicacionTemporal.texto;
        if (btnConfirmarUbicacionLeaflet) btnConfirmarUbicacionLeaflet.disabled = false;
    }
}

function cargarUbicacionExistenteLeaflet() {
    if (!leafletInicializado || !mapCliente || !markerCliente) return;
    
    const ubicacion = clienteUbicacionInput?.value;
    const lat = clienteLatitudInput?.value;
    const lng = clienteLongitudInput?.value;
    
    if (lat && lng && lat !== '' && lng !== '') {
        const position = { lat: parseFloat(lat), lng: parseFloat(lng) };
        mapCliente.setView([position.lat, position.lng], 15);
        markerCliente.setLatLng([position.lat, position.lng]);
        if (!mapCliente.hasLayer(markerCliente)) markerCliente.addTo(mapCliente);
    } else if (ubicacion && ubicacion !== '') {
        buscarDireccionLeaflet(ubicacion).then(resultados => {
            if (resultados && resultados.length > 0) {
                const lugar = resultados[0];
                const lat = parseFloat(lugar.lat);
                const lng = parseFloat(lugar.lon);
                mapCliente.setView([lat, lng], 15);
                markerCliente.setLatLng([lat, lng]);
                if (!mapCliente.hasLayer(markerCliente)) markerCliente.addTo(mapCliente);
                if (clienteLatitudInput) clienteLatitudInput.value = lat;
                if (clienteLongitudInput) clienteLongitudInput.value = lng;
            }
        });
    }
}

function abrirModalLeaflet() {
    const modal = document.getElementById('modalUbicacionLeaflet');
    if (!modal) return;
    
    ubicacionTemporal = { texto: '', lat: null, lng: null };
    const searchInput = document.getElementById('modalBuscarUbicacionLeaflet');
    if (searchInput) searchInput.value = '';
    
    const ubicacionInfoDiv = document.getElementById('ubicacionInfoLeaflet');
    if (ubicacionInfoDiv) ubicacionInfoDiv.style.display = 'none';
    
    const btnConfirmar = document.getElementById('btnConfirmarUbicacionLeaflet');
    if (btnConfirmar) btnConfirmar.disabled = true;
    
    if (!leafletInicializado) {
        setTimeout(() => {
            initLeafletMap();
            setTimeout(() => {
                if (mapCliente) mapCliente.invalidateSize();
                cargarUbicacionExistenteLeaflet();
            }, 100);
        }, 100);
    } else {
        setTimeout(() => {
            if (mapCliente) mapCliente.invalidateSize();
            cargarUbicacionExistenteLeaflet();
        }, 100);
    }
    
    modal.classList.add('show');
}

function cerrarModalLeaflet() {
    const modal = document.getElementById('modalUbicacionLeaflet');
    if (modal) modal.classList.remove('show');
}

function confirmarUbicacionLeaflet() {
    if (!ubicacionTemporal.texto || ubicacionTemporal.lat === null) {
        mostrarNotificacion('Por favor selecciona una ubicación en el mapa', 'warning');
        return;
    }
    
    if (clienteUbicacionInput) {
        clienteUbicacionInput.value = ubicacionTemporal.texto;
        clienteUbicacionInput.dispatchEvent(new Event('input'));
    }
    if (clienteLatitudInput) clienteLatitudInput.value = ubicacionTemporal.lat;
    if (clienteLongitudInput) clienteLongitudInput.value = ubicacionTemporal.lng;
    
    if (codigoSesion) {
        guardarSeccion('cliente').then(() => {
            mostrarNotificacion('Ubicación guardada correctamente', 'success');
        }).catch(error => {
            console.error('Error guardando ubicación:', error);
            mostrarNotificacion('Error al guardar la ubicación', 'error');
        });
    }
    
    cerrarModalLeaflet();
}

async function buscarYMostrarLeaflet() {
    const searchInput = document.getElementById('modalBuscarUbicacionLeaflet');
    const query = searchInput?.value.trim();
    if (!query || query.length < 3) return;
    
    const resultados = await buscarDireccionLeaflet(query);
    if (resultados && resultados.length > 0) {
        const lugar = resultados[0];
        const lat = parseFloat(lugar.lat);
        const lng = parseFloat(lugar.lon);
        
        if (mapCliente) {
            mapCliente.setView([lat, lng], 15);
            markerCliente.setLatLng([lat, lng]);
            if (!mapCliente.hasLayer(markerCliente)) markerCliente.addTo(mapCliente);
            
            ubicacionTemporal = {
                texto: lugar.display_name,
                lat: lat,
                lng: lng
            };
            actualizarInfoUbicacionLeaflet();
        }
    }
}

function setupModalUbicacionLeaflet() {
    if (!document.getElementById('modalUbicacionLeaflet')) {
        const modalHTML = `
            <div class="modal" id="modalUbicacionLeaflet">
                <div class="modal-content modal-ubicacion">
                    <div class="modal-header">
                        <h2><i class="fas fa-map-marker-alt"></i> Seleccionar Ubicación del Cliente</h2>
                        <button class="modal-close" id="btnCerrarModalUbicacionLeaflet">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="ubicacion-busqueda">
                            <div class="search-container">
                                <i class="fas fa-search"></i>
                                <input type="text" id="modalBuscarUbicacionLeaflet" placeholder="Buscar dirección (calle, zona, ciudad)..." class="ubicacion-search">
                            </div>
                            <div id="leafletMapa" class="modal-mapa" style="height: 400px; width: 100%; border-radius: 12px; margin: 15px 0;"></div>
                            <div class="ubicacion-info" id="ubicacionInfoLeaflet" style="display: none;">
                                <div class="info-card">
                                    <i class="fas fa-check-circle"></i>
                                    <div>
                                        <strong>Ubicación seleccionada:</strong>
                                        <span id="ubicacionSeleccionadaTextoLeaflet">-</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" id="btnCancelarUbicacionLeaflet"><i class="fas fa-times"></i> Cancelar</button>
                        <button class="btn-primary" id="btnConfirmarUbicacionLeaflet" disabled><i class="fas fa-check"></i> Usar esta ubicación</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    if (!document.querySelector('link[href*="leaflet.css"]')) {
        const linkCSS = document.createElement('link');
        linkCSS.rel = 'stylesheet';
        linkCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(linkCSS);
        
        const scriptJS = document.createElement('script');
        scriptJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        scriptJS.onload = () => initLeafletMap();
        document.head.appendChild(scriptJS);
    } else {
        initLeafletMap();
    }
    
    const btnAbrir = document.getElementById('btnAbrirModalUbicacion');
    const btnCerrar = document.getElementById('btnCerrarModalUbicacionLeaflet');
    const btnCancelar = document.getElementById('btnCancelarUbicacionLeaflet');
    const btnConfirmar = document.getElementById('btnConfirmarUbicacionLeaflet');
    const searchInput = document.getElementById('modalBuscarUbicacionLeaflet');
    
    if (btnAbrir) btnAbrir.addEventListener('click', abrirModalLeaflet);
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarModalLeaflet);
    if (btnCancelar) btnCancelar.addEventListener('click', cerrarModalLeaflet);
    if (btnConfirmar) btnConfirmar.addEventListener('click', confirmarUbicacionLeaflet);
    
    if (searchInput) {
        let timeoutId;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => buscarYMostrarLeaflet(), 500);
        });
    }
    
    const modal = document.getElementById('modalUbicacionLeaflet');
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModalLeaflet(); });
}

// =====================================================
// KEEP-ALIVE
// =====================================================
function iniciarKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(async () => {
        if (codigoSesion) {
            try {
                await fetch(`${API_URL}/jefe-operativo/ping-sesion/${codigoSesion}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
                });
            } catch (error) {}
        }
    }, 60000);
}

function detenerKeepAlive() {
    if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
}

// =====================================================
// RECUPERAR SESIÓN ACTIVA
// =====================================================
async function recuperarSesionActiva() {
    const sesionGuardada = localStorage.getItem('sesion_actual');
    if (!sesionGuardada) return;
    
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/obtener-sesion/${sesionGuardada}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        
        if (response.ok && data.sesion && data.sesion.estado === 'activa') {
            const esColaborador = data.sesion.colaboradores.includes(userInfo.id);
            if (esColaborador) {
                codigoSesion = sesionGuardada;
                sesionActual = data.sesion;
                activarSesion();
                mostrarNotificacion(`Sesión recuperada: ${codigoSesion}`, 'success');
                if (sesionActual.datos?.descripcion?.texto) {
                    descripcionOriginal = sesionActual.datos.descripcion.texto;
                    descripcionProblema.value = descripcionOriginal;
                }
                if (sesionActual.datos?.descripcion?.audio_url) {
                    audioCloudinaryUrl = sesionActual.datos.descripcion.audio_url;
                    if (audioPreview && audioCloudinaryUrl) {
                        audioPreview.src = audioCloudinaryUrl;
                        audioPreview.style.display = 'block';
                        audioStatus.textContent = 'Audio disponible';
                        if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                    }
                }
            } else {
                localStorage.removeItem('sesion_actual');
            }
        } else {
            localStorage.removeItem('sesion_actual');
        }
    } catch (error) {
        logger.error('Error recuperando sesión:', error);
        localStorage.removeItem('sesion_actual');
    }
}

// =====================================================
// UNIRSE POR CÓDIGO
// =====================================================
function setupUnirsePorCodigo() {
    const btnUnirse = document.getElementById('btnUnirsePorCodigo');
    const modalUnirse = document.getElementById('modalUnirsePorCodigo');
    const btnConfirmarUnirse = document.getElementById('btnConfirmarUnirse');
    const btnCerrarModalUnirse = document.getElementById('btnCerrarModalUnirse');
    const codigoUnirseInput = document.getElementById('codigoUnirseInput');
    const btnCerrarFooter = document.getElementById('btnCerrarModalUnirseFooter');
    
    if (btnUnirse) {
        btnUnirse.addEventListener('click', () => {
            if (codigoUnirseInput) codigoUnirseInput.value = '';
            if (modalUnirse) modalUnirse.classList.add('show');
        });
    }
    
    const cerrarModal = () => {
        if (codigoUnirseInput) codigoUnirseInput.value = '';
        if (modalUnirse) modalUnirse.classList.remove('show');
    };
    
    if (btnCerrarModalUnirse) btnCerrarModalUnirse.addEventListener('click', cerrarModal);
    if (btnCerrarFooter) btnCerrarFooter.addEventListener('click', cerrarModal);
    
    if (btnConfirmarUnirse && codigoUnirseInput) {
        btnConfirmarUnirse.addEventListener('click', async () => {
            let codigo = codigoUnirseInput.value.trim().toUpperCase();
            if (!codigo) {
                mostrarNotificacion('Ingresa un código', 'warning');
                return;
            }
            if (!codigo.startsWith('S-')) codigo = 'S-' + codigo;
            await unirseSesionConCodigo(codigo);
            cerrarModal();
        });
    }
    
    if (modalUnirse) {
        modalUnirse.addEventListener('click', (e) => { if (e.target === modalUnirse) cerrarModal(); });
    }
}

// =====================================================
// RASTREO DE EDICIÓN
// =====================================================
function setupInputTracking() {
    const clienteInputs = ['clienteNombre', 'clienteTelefono', 'clienteUbicacion'];
    clienteInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            let debounceTimeout;
            input.addEventListener('focus', () => { camposEnEdicion.cliente = true; if (timeoutsEdicion.cliente) clearTimeout(timeoutsEdicion.cliente); });
            input.addEventListener('blur', async () => {
                if (timeoutsEdicion.cliente) clearTimeout(timeoutsEdicion.cliente);
                if (codigoSesion && camposEnEdicion.cliente) await guardarSeccion('cliente');
                timeoutsEdicion.cliente = setTimeout(() => { camposEnEdicion.cliente = false; }, 500);
            });
            input.addEventListener('input', () => {
                if (debounceTimeout) clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(async () => {
                    if (codigoSesion && camposEnEdicion.cliente) await guardarSeccion('cliente');
                }, 1000);
            });
        }
    });
    
    const vehiculoInputs = ['vehiculoPlaca', 'vehiculoMarca', 'vehiculoModelo', 'vehiculoAnio', 'vehiculoKilometraje'];
    vehiculoInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            let debounceTimeout;
            input.addEventListener('focus', () => { camposEnEdicion.vehiculo = true; if (timeoutsEdicion.vehiculo) clearTimeout(timeoutsEdicion.vehiculo); });
            input.addEventListener('blur', async () => {
                if (timeoutsEdicion.vehiculo) clearTimeout(timeoutsEdicion.vehiculo);
                if (codigoSesion && camposEnEdicion.vehiculo) await guardarSeccion('vehiculo');
                timeoutsEdicion.vehiculo = setTimeout(() => { camposEnEdicion.vehiculo = false; }, 500);
            });
            input.addEventListener('input', () => {
                if (debounceTimeout) clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(async () => {
                    if (codigoSesion && camposEnEdicion.vehiculo) await guardarSeccion('vehiculo');
                }, 1000);
            });
        }
    });
    
    if (descripcionProblema) {
        let debounceTimeout;
        descripcionProblema.addEventListener('focus', () => { camposEnEdicion.descripcion = true; if (timeoutsEdicion.descripcion) clearTimeout(timeoutsEdicion.descripcion); });
        descripcionProblema.addEventListener('blur', async () => {
            if (timeoutsEdicion.descripcion) clearTimeout(timeoutsEdicion.descripcion);
            if (codigoSesion && descripcionProblema.value !== descripcionOriginal) await guardarSeccion('descripcion');
            timeoutsEdicion.descripcion = setTimeout(() => { camposEnEdicion.descripcion = false; }, 500);
        });
        descripcionProblema.addEventListener('input', () => {
            descripcionModificadaManualmente = true;
            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(async () => {
                if (codigoSesion && camposEnEdicion.descripcion) await guardarSeccion('descripcion');
            }, 1500);
        });
    }
}

function setupEventListeners() {
    if (btnCrearSesion) btnCrearSesion.addEventListener('click', iniciarSesion);
    if (btnCancelarSesion) btnCancelarSesion.addEventListener('click', mostrarConfirmacionCancelar);
    if (btnFinalizar) btnFinalizar.addEventListener('click', finalizarSesion);
    if (btnCopiarCodigoSesion) {
        btnCopiarCodigoSesion.addEventListener('click', () => {
            if (codigoSesion) {
                navigator.clipboard.writeText(codigoSesion);
                mostrarNotificacion('Código copiado', 'success');
            }
        });
    }
    
    document.querySelectorAll('.btn-guardar-seccion').forEach(btn => {
        btn.addEventListener('click', async () => {
            const seccion = btn.dataset.seccion;
            if (seccion && codigoSesion) {
                await guardarSeccion(seccion);
                mostrarNotificacion(`✓ ${seccion} guardado`, 'success');
            }
        });
    });
    
    const btnLimpiarDescripcion = document.getElementById('btnLimpiarDescripcion');
    if (btnLimpiarDescripcion) btnLimpiarDescripcion.addEventListener('click', limpiarDescripcion);
}

// =====================================================
// POLLING DE SESIONES ACTIVAS
// =====================================================
function iniciarPollingSesiones() {
    if (sesionesPolling) clearInterval(sesionesPolling);
    sesionesPolling = setInterval(() => cargarSesionesActivas(), 3000);
}

async function cargarSesionesActivas() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/sesiones-activas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        if (response.ok && data.sesiones) renderSesionesActivas(data.sesiones);
    } catch (error) {}
}

function renderSesionesActivas(sesiones) {
    if (!sesionesList) return;
    const sesionesFiltradas = sesiones.filter(s => s.estado === 'activa');
    if (sesionesCount) sesionesCount.textContent = sesionesFiltradas.length;
    
    if (sesionesFiltradas.length === 0) {
        sesionesList.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No hay sesiones activas</p></div>`;
        return;
    }
    
    sesionesList.innerHTML = sesionesFiltradas.map(sesion => {
        const colaboradoresCount = sesion.colaboradores_nombres?.length || 1;
        const estaCompleta = colaboradoresCount >= 2;
        const seccionesCompletadas = Object.values(sesion.secciones_completadas || {}).filter(v => v === true).length;
        const progreso = (seccionesCompletadas / 4) * 100;
        const esActiva = codigoSesion === sesion.codigo;
        
        return `
            <div class="sesion-item ${esActiva ? 'active' : ''} ${estaCompleta ? 'full' : ''}">
                <div class="sesion-info">
                    <span class="sesion-codigo"><i class="fas fa-lock"></i> Sesión #${sesion.codigo.substring(2, 5)}***</span>
                    <div class="sesion-colaboradores"><i class="fas fa-users"></i><span>${colaboradoresCount}/2</span></div>
                    <div class="sesion-progreso"><div class="progreso-bar"><div class="progreso-fill" style="width: ${progreso}%"></div></div><span>${Math.round(progreso)}%</span></div>
                </div>
                <div class="sesion-actions">
                    ${!esActiva && !estaCompleta ? `<button class="btn-unirse-sesion" onclick="unirseSesionConCodigo('${sesion.codigo}')"><i class="fas fa-sign-in-alt"></i> Unirse</button>` : 
                      estaCompleta && !esActiva ? `<span class="badge-full"><i class="fas fa-ban"></i> Completa</span>` : 
                      esActiva ? `<span class="badge-active"><i class="fas fa-check-circle"></i> Activa</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function unirseSesionConCodigo(codigo) {
    try {
        mostrarNotificacion('Uniéndose...', 'info');
        const response = await fetch(`${API_URL}/jefe-operativo/unirse-sesion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` },
            body: JSON.stringify({ codigo })
        });
        const data = await response.json();
        
        if (response.ok) {
            codigoSesion = codigo;
            sesionActual = data.sesion;
            localStorage.setItem('sesion_actual', codigo);
            activarSesion();
            mostrarNotificacion(`Te has unido a ${codigoSesion}`, 'success');
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
        } else {
            if (data.error && data.error.includes('máximo de 2 colaboradores')) {
                mostrarNotificacion('La sesión ya tiene 2 colaboradores', 'error');
            } else {
                throw new Error(data.error);
            }
        }
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// SESIONES COLABORATIVAS
// =====================================================
async function iniciarSesion() {
    try {
        mostrarNotificacion('Creando sesión...', 'info');
        const response = await fetch(`${API_URL}/jefe-operativo/iniciar-sesion`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        
        if (response.ok) {
            codigoSesion = data.codigo;
            sesionActual = data.sesion;
            localStorage.setItem('sesion_actual', codigoSesion);
            activarSesion();
            mostrarModalCodigo(codigoSesion);
            mostrarNotificacion(`Sesión creada: ${codigoSesion}`, 'success');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

function activarSesion() {
    if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
    if (sessionPanel) sessionPanel.style.display = 'flex';
    if (colaboradoresPanel) colaboradoresPanel.style.display = 'block';
    if (recepcionForm) recepcionForm.style.display = 'block';
    if (codigoActivoSpan) codigoActivoSpan.textContent = codigoSesion;
    
    cargarDatosSesion();
    iniciarPolling();
    iniciarKeepAlive();
}

// =====================================================
// CARGAR DATOS DE SESIÓN
// =====================================================
async function cargarDatosSesion() {
    if (!codigoSesion || actualizando) return;
    
    actualizando = true;
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        
        if (response.ok) {
            if (!data.sesion || data.sesion.estado === 'finalizada') {
                limpiarSesionCompleta();
                if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
                localStorage.removeItem('sesion_actual');
                return;
            }
            
            const puedeActualizarCliente = !camposEnEdicion.cliente && document.activeElement?.id !== 'clienteNombre' &&
                document.activeElement?.id !== 'clienteTelefono' && document.activeElement?.id !== 'clienteUbicacion';
            
            const puedeActualizarVehiculo = !camposEnEdicion.vehiculo && document.activeElement?.id !== 'vehiculoPlaca' &&
                document.activeElement?.id !== 'vehiculoMarca' && document.activeElement?.id !== 'vehiculoModelo' &&
                document.activeElement?.id !== 'vehiculoAnio' && document.activeElement?.id !== 'vehiculoKilometraje';
            
            const puedeActualizarDescripcion = !camposEnEdicion.descripcion && document.activeElement !== descripcionProblema;
            
            const nuevosDatos = data.sesion.datos;
            
            if (puedeActualizarCliente && nuevosDatos.cliente) {
                const clienteNombre = document.getElementById('clienteNombre');
                const clienteTelefono = document.getElementById('clienteTelefono');
                const clienteUbicacion = document.getElementById('clienteUbicacion');
                const clienteLatitud = document.getElementById('clienteLatitud');
                const clienteLongitud = document.getElementById('clienteLongitud');
                
                if (clienteNombre && clienteNombre.value !== nuevosDatos.cliente.nombre) clienteNombre.value = nuevosDatos.cliente.nombre || '';
                if (clienteTelefono && clienteTelefono.value !== nuevosDatos.cliente.telefono) clienteTelefono.value = nuevosDatos.cliente.telefono || '';
                if (clienteUbicacion && clienteUbicacion.value !== nuevosDatos.cliente.ubicacion) clienteUbicacion.value = nuevosDatos.cliente.ubicacion || '';
                if (clienteLatitud && nuevosDatos.cliente.latitud !== undefined) clienteLatitud.value = nuevosDatos.cliente.latitud || '';
                if (clienteLongitud && nuevosDatos.cliente.longitud !== undefined) clienteLongitud.value = nuevosDatos.cliente.longitud || '';
            }
            
            if (puedeActualizarVehiculo && nuevosDatos.vehiculo) {
                const vehiculoPlaca = document.getElementById('vehiculoPlaca');
                const vehiculoMarca = document.getElementById('vehiculoMarca');
                const vehiculoModelo = document.getElementById('vehiculoModelo');
                const vehiculoAnio = document.getElementById('vehiculoAnio');
                const vehiculoKilometraje = document.getElementById('vehiculoKilometraje');
                
                if (vehiculoPlaca && vehiculoPlaca.value !== nuevosDatos.vehiculo.placa) vehiculoPlaca.value = nuevosDatos.vehiculo.placa || '';
                if (vehiculoMarca && vehiculoMarca.value !== nuevosDatos.vehiculo.marca) vehiculoMarca.value = nuevosDatos.vehiculo.marca || '';
                if (vehiculoModelo && vehiculoModelo.value !== nuevosDatos.vehiculo.modelo) vehiculoModelo.value = nuevosDatos.vehiculo.modelo || '';
                if (vehiculoAnio && vehiculoAnio.value != (nuevosDatos.vehiculo.anio || '')) vehiculoAnio.value = nuevosDatos.vehiculo.anio || '';
                if (vehiculoKilometraje && vehiculoKilometraje.value != (nuevosDatos.vehiculo.kilometraje || 0)) vehiculoKilometraje.value = nuevosDatos.vehiculo.kilometraje || 0;
            }
            
            if (puedeActualizarDescripcion && !descripcionModificadaManualmente && nuevosDatos.descripcion && 
                descripcionProblema && descripcionProblema.value !== nuevosDatos.descripcion.texto) {
                descripcionProblema.value = nuevosDatos.descripcion.texto || '';
                descripcionOriginal = nuevosDatos.descripcion.texto || '';
            }
            
            if (nuevosDatos.descripcion && nuevosDatos.descripcion.audio_url) {
                const audioUrl = nuevosDatos.descripcion.audio_url;
                if (audioPreview && audioUrl && audioUrl !== 'null' && audioUrl !== 'None') {
                    if (audioPreview.src !== audioUrl) {
                        audioPreview.src = audioUrl;
                        audioPreview.style.display = 'block';
                        audioStatus.textContent = 'Audio disponible';
                        audioStatus.style.color = 'var(--verde-exito)';
                        if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                    }
                }
            }
            
            if (nuevosDatos.fotos) {
                actualizarFotosDesdeSesion(nuevosDatos.fotos);
                const fotosCompletas = FOTOS_CONFIG.every(foto => {
                    const url = nuevosDatos.fotos[foto.campo];
                    return url && url !== 'null' && url !== 'None' && url !== '';
                });
                if (data.sesion.secciones_completadas) data.sesion.secciones_completadas.fotos = fotosCompletas;
                const fotosBadge = document.getElementById('statusFotos');
                if (fotosBadge) {
                    if (fotosCompletas) {
                        fotosBadge.textContent = '✓ Completado';
                        fotosBadge.classList.add('completado');
                        fotosBadge.classList.remove('en-proceso');
                    } else {
                        const fotosFaltantes = FOTOS_CONFIG.filter(f => {
                            const url = nuevosDatos.fotos[f.campo];
                            return !url || url === 'null' || url === 'None' || url === '';
                        }).length;
                        fotosBadge.textContent = `○ ${7 - fotosFaltantes}/7 fotos`;
                        fotosBadge.classList.add('en-proceso');
                        fotosBadge.classList.remove('completado');
                    }
                }
            }
            
            if (data.sesion.secciones_completadas) {
                const secciones = ['cliente', 'vehiculo', 'fotos', 'descripcion'];
                secciones.forEach(seccion => {
                    const badge = document.getElementById(`status${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
                    const completada = data.sesion.secciones_completadas[seccion];
                    if (badge) {
                        if (completada) {
                            badge.textContent = '✓ Completado';
                            badge.classList.add('completado');
                            badge.classList.remove('en-proceso');
                        } else {
                            badge.textContent = '○ Pendiente';
                            badge.classList.add('en-proceso');
                            badge.classList.remove('completado');
                        }
                    }
                });
            }
            
            if (data.sesion.colaboradores_nombres) {
                const colaboradores = data.sesion.colaboradores_nombres;
                const count = colaboradores.length;
                if (colaboradoresCount) colaboradoresCount.textContent = count;
                if (colaboradoresCountDetail) colaboradoresCountDetail.textContent = count;
                if (colaboradoresList) {
                    if (colaboradores.length === 0) {
                        colaboradoresList.innerHTML = `<div class="colaborador placeholder"><i class="fas fa-user-plus"></i><span>Esperando colaboradores...</span></div>`;
                    } else {
                        colaboradoresList.innerHTML = colaboradores.map(nombre => `<div class="colaborador"><i class="fas fa-user"></i><span>${escapeHtml(nombre)}</span>${nombre === userInfo.nombre ? '<span class="badge-you"> (Tú)</span>' : ''}</div>`).join('');
                    }
                }
            }
            
            if (data.sesion.secciones_completadas) {
                const todasCompletas = Object.values(data.sesion.secciones_completadas).every(v => v === true);
                if (btnFinalizar) {
                    btnFinalizar.disabled = !todasCompletas;
                    if (!todasCompletas) {
                        const faltantes = [];
                        if (!data.sesion.secciones_completadas.cliente) faltantes.push('Cliente');
                        if (!data.sesion.secciones_completadas.vehiculo) faltantes.push('Vehículo');
                        if (!data.sesion.secciones_completadas.fotos) faltantes.push('Fotos (7)');
                        if (!data.sesion.secciones_completadas.descripcion) faltantes.push('Descripción');
                        btnFinalizar.title = `Faltan: ${faltantes.join(', ')}`;
                    } else {
                        btnFinalizar.title = 'Finalizar recepción';
                    }
                }
            }
            
            sesionActual = data.sesion;
        }
    } catch (error) {
        logger.error('Error cargando datos:', error);
    } finally {
        actualizando = false;
    }
}

function actualizarFotosDesdeSesion(fotos) {
    if (!fotos) return;
    for (const [campo, url] of Object.entries(fotos)) {
        if (url && url !== 'null' && url !== 'None' && url !== '') {
            const fotoConfig = FOTOS_CONFIG.find(f => f.campo === campo);
            if (fotoConfig) {
                const uploadDiv = document.getElementById(`upload-${fotoConfig.id}`);
                const preview = uploadDiv?.querySelector('.upload-preview');
                const removeBtn = uploadDiv?.querySelector('.remove-photo');
                if (preview && uploadDiv) {
                    let fullUrl = url;
                    if (!fullUrl.startsWith('http')) fullUrl = url;
                    preview.style.backgroundImage = `url('${fullUrl}')`;
                    preview.style.backgroundSize = 'cover';
                    preview.style.backgroundPosition = 'center';
                    uploadDiv.classList.add('has-image');
                    if (removeBtn) removeBtn.style.display = 'flex';
                }
            }
        }
    }
}

// =====================================================
// GUARDAR SECCIÓN - CON AUDIO DIRECTO A CLOUDINARY
// =====================================================
async function guardarSeccion(seccion) {
    if (!codigoSesion) return;
    
    let datos = {};
    
    switch(seccion) {
        case 'cliente':
            datos = {
                nombre: document.getElementById('clienteNombre')?.value || '',
                telefono: document.getElementById('clienteTelefono')?.value || '',
                ubicacion: document.getElementById('clienteUbicacion')?.value || '',
                latitud: document.getElementById('clienteLatitud')?.value || null,
                longitud: document.getElementById('clienteLongitud')?.value || null
            };
            break;
            
        case 'vehiculo':
            datos = {
                placa: document.getElementById('vehiculoPlaca')?.value.toUpperCase() || '',
                marca: document.getElementById('vehiculoMarca')?.value || '',
                modelo: document.getElementById('vehiculoModelo')?.value || '',
                anio: parseInt(document.getElementById('vehiculoAnio')?.value) || null,
                kilometraje: parseInt(document.getElementById('vehiculoKilometraje')?.value) || 0
            };
            break;
            
        case 'fotos':
            // Las fotos se suben al backend (Cloudinary) como antes
            const fotosData = {};
            const fotosExistentes = sesionActual?.datos?.fotos || {};
            for (const foto of FOTOS_CONFIG) {
                const input = document.getElementById(foto.id);
                if (input && input.files && input.files.length > 0) {
                    const file = input.files[0];
                    if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                            mostrarNotificacion(`La foto ${foto.label} no debe superar los 5MB`, 'warning');
                            fotosData[foto.campo] = fotosExistentes[foto.campo] || null;
                        } else {
                            fotosData[foto.campo] = await fileToBase64(file);
                        }
                    } else {
                        fotosData[foto.campo] = fotosExistentes[foto.campo] || null;
                    }
                } else {
                    fotosData[foto.campo] = fotosExistentes[foto.campo] || null;
                }
            }
            datos = fotosData;
            break;
            
        case 'descripcion':
            // 🔥 NUEVO: Subir audio DIRECTAMENTE a Cloudinary desde el frontend
            let audioUrl = audioCloudinaryUrl;
            
            if (audioBlob) {
                mostrarNotificacion('Subiendo audio a Cloudinary...', 'info');
                try {
                    audioUrl = await subirAudioCloudinary(audioBlob);
                    audioCloudinaryUrl = audioUrl;
                    mostrarNotificacion('✅ Audio subido correctamente', 'success');
                } catch (error) {
                    console.error('Error subiendo audio:', error);
                    mostrarNotificacion('❌ Error al subir el audio', 'error');
                    audioUrl = null;
                }
            }
            
            datos = {
                texto: descripcionProblema?.value || '',
                audio_url: audioUrl
            };
            descripcionModificadaManualmente = false;
            descripcionOriginal = descripcionProblema?.value || '';
            break;
    }
    
    const btnGuardar = document.querySelector(`.btn-guardar-seccion[data-seccion="${seccion}"]`);
    const guardadoIndicator = document.getElementById(`guardado${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
    
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/guardar-seccion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` },
            body: JSON.stringify({ codigo: codigoSesion, seccion: seccion, datos: datos, usuario_id: userInfo.id, usuario_nombre: userInfo.nombre })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            sesionActual = data.sesion;
            if (guardadoIndicator) {
                guardadoIndicator.style.display = 'flex';
                setTimeout(() => guardadoIndicator.style.display = 'none', 1500);
            }
            notificarCambioSeccion(seccion);
            
            if (seccion === 'fotos') {
                for (const foto of FOTOS_CONFIG) {
                    const input = document.getElementById(foto.id);
                    if (input) input.value = '';
                }
            }
            
            if (seccion === 'descripcion' && audioBlob) {
                audioBlob = null;
                audioChunks = [];
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                audioStatus.textContent = 'Descripción guardada';
            }
            
            // Actualizar estado del botón finalizar
            if (sesionActual.secciones_completadas) {
                const todasCompletas = Object.values(sesionActual.secciones_completadas).every(v => v === true);
                if (btnFinalizar) btnFinalizar.disabled = !todasCompletas;
            }
        } else {
            throw new Error(data.error || 'Error al guardar');
        }
    } catch (error) {
        logger.error('Error guardando:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = `<i class="fas fa-save"></i> Guardar ${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`;
        }
    }
}

// =====================================================
// LIMPIAR DESCRIPCIÓN
// =====================================================
function limpiarDescripcion() {
    if (!descripcionProblema) return;
    if (confirm('¿Estás seguro de limpiar la descripción?')) {
        descripcionProblema.value = '';
        descripcionModificadaManualmente = true;
        descripcionOriginal = '';
        if (audioBlob) audioBlob = null;
        audioChunks = [];
        audioCloudinaryUrl = null;
        if (audioPreview) {
            if (audioPreview.src && audioPreview.src.startsWith('blob:')) URL.revokeObjectURL(audioPreview.src);
            audioPreview.src = '';
            audioPreview.style.display = 'none';
        }
        if (audioStatus) audioStatus.textContent = 'Descripción limpiada';
        if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
        if (btnGrabarAudio) {
            btnGrabarAudio.classList.remove('recording');
            btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        }
        isRecording = false;
        mostrarNotificacion('Descripción limpiada', 'info');
    }
}

// =====================================================
// TRANSCRIPCIÓN - DESHABILITADA TEMPORALMENTE
// =====================================================
function setupTranscripcion() {
    if (!btnTranscribirAudio) return;
    
    btnTranscribirAudio.disabled = true;
    btnTranscribirAudio.style.opacity = '0.5';
    btnTranscribirAudio.title = 'Transcripción no disponible en versión gratuita';
    
    btnTranscribirAudio.addEventListener('click', () => {
        mostrarNotificacion('⏳ Transcripción no disponible en el plan gratuito. Próximamente disponible.', 'info');
    });
}

// =====================================================
// GRABACIÓN DE AUDIO
// =====================================================
function setupAudioRecording() {
    if (!btnGrabarAudio) return;
    btnGrabarAudio.addEventListener('click', async () => {
        if (!isRecording) await startRecording();
        else stopRecording();
    });
    if (btnEliminarAudio) btnEliminarAudio.addEventListener('click', eliminarGrabacion);
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        audioBlob = null;
        
        mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPreview.src = audioUrl;
            audioPreview.style.display = 'block';
            audioStatus.textContent = 'Audio grabado - Presiona "Guardar Descripción" para guardar';
            audioStatus.style.color = 'var(--verde-exito)';
            if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        btnGrabarAudio.classList.add('recording');
        btnGrabarAudio.innerHTML = '<i class="fas fa-stop"></i> Detener Grabación';
        audioStatus.textContent = 'Grabando...';
        audioStatus.style.color = 'var(--rojo-acento)';
        if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    } catch (error) {
        logger.error('Error al acceder al micrófono:', error);
        audioStatus.textContent = 'Error: No se pudo acceder al micrófono';
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        btnGrabarAudio.classList.remove('recording');
        btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
    }
}

function eliminarGrabacion() {
    if (audioBlob) audioBlob = null;
    audioChunks = [];
    audioCloudinaryUrl = null;
    if (audioPreview) {
        if (audioPreview.src && audioPreview.src.startsWith('blob:')) URL.revokeObjectURL(audioPreview.src);
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (audioStatus) audioStatus.textContent = 'Grabación eliminada';
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    if (btnGrabarAudio) btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
    isRecording = false;
    mostrarNotificacion('Grabación eliminada', 'info');
}

// =====================================================
// CANCELAR SESIÓN
// =====================================================
function mostrarConfirmacionCancelar() {
    const modal = document.createElement('div');
    modal.className = 'modal-confirmacion';
    modal.innerHTML = `
        <div class="modal-confirmacion-content">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>¿Cancelar recepción?</h3>
            <p>Se eliminarán todos los datos.<br>Esta acción no se puede deshacer.</p>
            <div class="modal-confirmacion-buttons">
                <button class="btn-cancelar-cancelar" id="btnNoCancelar"><i class="fas fa-times"></i> Seguir editando</button>
                <button class="btn-confirmar-cancelar" id="btnSiCancelar"><i class="fas fa-trash-alt"></i> Sí, cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('btnNoCancelar').onclick = () => modal.remove();
    document.getElementById('btnSiCancelar').onclick = async () => {
        modal.remove();
        if (codigoSesion) {
            try {
                await fetch(`${API_URL}/jefe-operativo/cancelar-sesion`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` },
                    body: JSON.stringify({ codigo: codigoSesion })
                });
            } catch (error) {}
        }
        limpiarSesionCompleta();
        mostrarNotificacion('Recepción cancelada', 'success');
        if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
    };
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function limpiarSesionCompleta() {
    detenerPolling();
    detenerKeepAlive();
    codigoSesion = null;
    sesionActual = null;
    audioCloudinaryUrl = null;
    localStorage.removeItem('sesion_actual');
    
    if (sessionPanel) sessionPanel.style.display = 'none';
    if (colaboradoresPanel) colaboradoresPanel.style.display = 'none';
    if (recepcionForm) recepcionForm.style.display = 'none';
    if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
    
    limpiarFormularioCompleto();
    cargarSesionesActivas();
}

function limpiarFormularioCompleto() {
    const inputs = document.querySelectorAll('#recepcionForm input, #recepcionForm textarea');
    inputs.forEach(input => { input.value = ''; });
    
    const photoUploads = document.querySelectorAll('.photo-upload');
    photoUploads.forEach(upload => {
        const input = upload.querySelector('input[type="file"]');
        const preview = upload.querySelector('.upload-preview');
        if (input) input.value = '';
        if (preview) preview.style.backgroundImage = '';
        upload.classList.remove('has-image');
    });
    
    audioChunks = [];
    audioBlob = null;
    audioCloudinaryUrl = null;
    if (audioPreview) {
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (audioStatus) audioStatus.textContent = '';
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    if (clienteLatitudInput) clienteLatitudInput.value = '';
    if (clienteLongitudInput) clienteLongitudInput.value = '';
}

// =====================================================
// FINALIZAR SESIÓN
// =====================================================
async function finalizarSesion() {
    if (!codigoSesion) return;
    if (!confirm('¿Finalizar recepción? Los datos se guardarán permanentemente.')) return;
    
    try {
        setLoadingState(true);
        const datosParaFinalizar = {
            cliente: sesionActual.datos.cliente,
            vehiculo: sesionActual.datos.vehiculo,
            fotos: sesionActual.datos.fotos,
            descripcion: sesionActual.datos.descripcion
        };
        
        const fotosCompletas = FOTOS_CONFIG.every(foto => {
            const url = datosParaFinalizar.fotos[foto.campo];
            return url && url !== 'null' && url !== 'None' && url !== '';
        });
        
        if (!fotosCompletas) {
            mostrarNotificacion('Completa las 7 fotos antes de finalizar', 'warning');
            setLoadingState(false);
            return;
        }
        
        const response = await fetch(`${API_URL}/jefe-operativo/finalizar-sesion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` },
            body: JSON.stringify({ codigo: codigoSesion, datos: datosParaFinalizar })
        });
        const data = await response.json();
        
        if (response.ok) {
            mostrarCodigoGenerado(data.codigo, obtenerDatosFormulario());
            limpiarSesionCompleta();
            mostrarNotificacion('Recepción finalizada', 'success');
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
            cargarRecepciones();
            cargarSesionesActivas();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    } finally {
        setLoadingState(false);
    }
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================
function generatePhotoUploads() {
    if (!photoGrid) return;
    photoGrid.innerHTML = FOTOS_CONFIG.map(foto => `
        <div class="photo-upload" id="upload-${foto.id}" data-campo="${foto.campo}">
            <input type="file" id="${foto.id}" accept="image/*" capture="environment">
            <div class="upload-placeholder"><i class="fas ${foto.icono}"></i><span>${foto.label}</span></div>
            <div class="upload-preview"></div>
            <button type="button" class="remove-photo" style="display: none;"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

function setupPhotoUploads() {
    const photoUploads = document.querySelectorAll('.photo-upload');
    photoUploads.forEach(upload => {
        const input = upload.querySelector('input[type="file"]');
        const preview = upload.querySelector('.upload-preview');
        const removeBtn = upload.querySelector('.remove-photo');
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    mostrarNotificacion('La imagen no debe superar los 5MB', 'warning');
                    input.value = '';
                    return;
                }
                if (!file.type.startsWith('image/')) {
                    mostrarNotificacion('Solo imágenes', 'warning');
                    input.value = '';
                    return;
                }
                const objectUrl = URL.createObjectURL(file);
                preview.style.backgroundImage = `url('${objectUrl}')`;
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                upload.classList.add('has-image');
                const oldUrl = upload.dataset.objectUrl;
                if (oldUrl) URL.revokeObjectURL(oldUrl);
                upload.dataset.objectUrl = objectUrl;
            }
        });
        
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            input.value = '';
            preview.style.backgroundImage = '';
            upload.classList.remove('has-image');
            if (upload.dataset.objectUrl) {
                URL.revokeObjectURL(upload.dataset.objectUrl);
                delete upload.dataset.objectUrl;
            }
        });
        removeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function setupPlacaValidation() {
    const placaInput = document.getElementById('vehiculoPlaca');
    if (!placaInput) return;
    let timeoutId;
    placaInput.addEventListener('input', (e) => {
        clearTimeout(timeoutId);
        const placa = e.target.value.toUpperCase();
        e.target.value = placa;
        if (placa.length >= 3) timeoutId = setTimeout(() => verificarPlacaExistente(placa), 500);
    });
}

async function verificarPlacaExistente(placa) {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/verificar-placa/${placa}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        if (data.exists) {
            mostrarNotificacion(`La placa ${placa} ya está registrada`, 'info');
            if (confirm('¿Cargar datos del vehículo?')) {
                const estabaEditando = camposEnEdicion.vehiculo;
                camposEnEdicion.vehiculo = false;
                document.getElementById('vehiculoMarca').value = data.vehiculo.marca || '';
                document.getElementById('vehiculoModelo').value = data.vehiculo.modelo || '';
                document.getElementById('clienteNombre').value = data.vehiculo.cliente || '';
                camposEnEdicion.vehiculo = estabaEditando;
            }
        }
    } catch (error) {}
}

function obtenerDatosFormulario() {
    return {
        cliente: {
            nombre: document.getElementById('clienteNombre')?.value || '',
            telefono: document.getElementById('clienteTelefono')?.value || '',
            ubicacion: document.getElementById('clienteUbicacion')?.value || '',
            latitud: document.getElementById('clienteLatitud')?.value || null,
            longitud: document.getElementById('clienteLongitud')?.value || null
        },
        vehiculo: {
            placa: document.getElementById('vehiculoPlaca')?.value.toUpperCase() || '',
            marca: document.getElementById('vehiculoMarca')?.value || '',
            modelo: document.getElementById('vehiculoModelo')?.value || '',
            anio: parseInt(document.getElementById('vehiculoAnio')?.value) || null,
            kilometraje: parseInt(document.getElementById('vehiculoKilometraje')?.value) || 0
        }
    };
}

function setLoadingState(loading) {
    if (!btnFinalizar) return;
    if (loading) {
        btnFinalizar.disabled = true;
        btnFinalizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    } else {
        const todasCompletas = sesionActual?.secciones_completadas ? Object.values(sesionActual.secciones_completadas).every(v => v === true) : false;
        btnFinalizar.disabled = !todasCompletas;
        btnFinalizar.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Recepción';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// MODALES
// =====================================================
function mostrarModalCodigo(codigo) {
    const modal = document.getElementById('codigoModal');
    const codigoSesionModal = document.getElementById('codigoSesionModal');
    const btnCopiar = document.getElementById('btnCopiarCodigoModal');
    if (!modal) return;
    if (codigoSesionModal) codigoSesionModal.textContent = codigo;
    if (btnCopiar) btnCopiar.onclick = () => { navigator.clipboard.writeText(codigo); mostrarNotificacion('Código copiado', 'success'); };
    modal.classList.add('show');
}

function mostrarCodigoGenerado(codigo, datos) {
    const modal = document.getElementById('codigoOrdenModal');
    const codigoGeneradoSpan = document.getElementById('codigoGenerado');
    const resumenDatosDiv = document.getElementById('resumenDatos');
    if (!modal) return;
    if (codigoGeneradoSpan) codigoGeneradoSpan.textContent = codigo;
    if (resumenDatosDiv && datos) {
        resumenDatosDiv.innerHTML = `
            <div class="resumen-item"><span>Cliente:</span><span>${escapeHtml(datos.cliente?.nombre || '')}</span></div>
            <div class="resumen-item"><span>Vehículo:</span><span>${escapeHtml(datos.vehiculo?.marca || '')} ${escapeHtml(datos.vehiculo?.modelo || '')} (${escapeHtml(datos.vehiculo?.placa || '')})</span></div>
            <div class="resumen-item"><span>Ubicación:</span><span>${escapeHtml(datos.cliente?.ubicacion || 'No especificada')}</span></div>
            <div class="resumen-item"><span>Fecha:</span><span>${new Date().toLocaleDateString()}</span></div>
        `;
    }
    modal.classList.add('show');
}

window.cerrarModal = () => { const modal = document.getElementById('codigoModal'); if (modal) modal.classList.remove('show'); };
window.cerrarModalOrden = () => { const modal = document.getElementById('codigoOrdenModal'); if (modal) modal.classList.remove('show'); };
window.imprimirCodigo = () => {
    const codigo = document.getElementById('codigoGenerado')?.textContent || 'OT-0000';
    const ventana = window.open('', '_blank');
    ventana.document.write(`<html><head><title>Código de Trabajo</title><style>body{font-family:Arial;padding:30px;text-align:center;}.codigo{font-size:32px;color:#C1121F;margin:20px;font-weight:bold;}</style></head><body><h1>FURIA MOTOR COMPANY</h1><h2>Código de Trabajo</h2><div class="codigo">${codigo}</div><p>Fecha: ${new Date().toLocaleString()}</p></body></html>`);
    ventana.document.close();
    ventana.print();
};

function mostrarNotificacion(mensaje, tipo = 'info') {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const iconos = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast && document.body.contains(toast)) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
        }
    }, 3000);
}

// =====================================================
// POLLING
// =====================================================
function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => { if (codigoSesion) cargarDatosSesion(); }, 3000);
}

function detenerPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

window.logout = () => {
    detenerPolling();
    detenerKeepAlive();
    if (sesionesPolling) clearInterval(sesionesPolling);
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    localStorage.removeItem('sesion_actual');
    window.location.href = `${window.API_BASE_URL}/`;
};

// =====================================================
// PANEL DE RECEPCIONES GUARDADAS
// =====================================================
function initRecepcionesPanel() {
    cargarRecepciones();
    const btnRefresh = document.getElementById('btnRefreshRecepciones');
    if (btnRefresh) btnRefresh.addEventListener('click', cargarRecepciones);
    const searchInput = document.getElementById('searchRecepcion');
    if (searchInput) searchInput.addEventListener('input', () => { paginaActual = 1; filtrarYMostrarRecepciones(); });
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    const estadoFiltro = document.getElementById('estadoFiltro');
    if (fechaDesde) fechaDesde.addEventListener('change', filtrarYMostrarRecepciones);
    if (fechaHasta) fechaHasta.addEventListener('change', filtrarYMostrarRecepciones);
    if (estadoFiltro) estadoFiltro.addEventListener('change', filtrarYMostrarRecepciones);
    const btnAnterior = document.getElementById('btnPaginaAnterior');
    const btnSiguiente = document.getElementById('btnPaginaSiguiente');
    if (btnAnterior) btnAnterior.addEventListener('click', () => { if (paginaActual > 1) { paginaActual--; filtrarYMostrarRecepciones(); } });
    if (btnSiguiente) btnSiguiente.addEventListener('click', () => { paginaActual++; filtrarYMostrarRecepciones(); });
}

async function cargarRecepciones() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/listar-recepciones`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        if (response.ok && data.recepciones) {
            recepcionesActuales = data.recepciones.slice(0, 10);
            const count = document.getElementById('recepcionesCount');
            if (count) count.textContent = recepcionesActuales.length;
            filtrarYMostrarRecepciones();
        } else throw new Error(data.error || 'Error cargando recepciones');
    } catch (error) {
        logger.error('Error cargando recepciones:', error);
        const list = document.getElementById('recepcionesList');
        if (list) list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error cargando recepciones</p></div>`;
    }
}

function filtrarYMostrarRecepciones() {
    let filtradas = [...recepcionesActuales];
    const searchTerm = document.getElementById('searchRecepcion')?.value.toLowerCase() || '';
    if (searchTerm) filtradas = filtradas.filter(r => 
        r.codigo_unico?.toLowerCase().includes(searchTerm) || 
        r.placa?.toLowerCase().includes(searchTerm) || 
        r.cliente_nombre?.toLowerCase().includes(searchTerm)
    );
    
    const fechaDesde = document.getElementById('fechaDesde')?.value;
    const fechaHasta = document.getElementById('fechaHasta')?.value;
    if (fechaDesde) filtradas = filtradas.filter(r => r.fecha_ingreso >= fechaDesde);
    if (fechaHasta) filtradas = filtradas.filter(r => r.fecha_ingreso <= fechaHasta + 'T23:59:59');
    const estadoFiltro = document.getElementById('estadoFiltro')?.value;
    if (estadoFiltro && estadoFiltro !== 'todos') filtradas = filtradas.filter(r => r.estado_global === estadoFiltro);
    
    const totalItems = filtradas.length;
    const totalPaginas = Math.ceil(totalItems / itemsPorPagina);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas || 1;
    
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const paginadas = filtradas.slice(inicio, fin);
    
    const paginaInfo = document.getElementById('paginaInfo');
    if (paginaInfo) paginaInfo.textContent = `Página ${paginaActual} de ${totalPaginas || 1}`;
    
    const btnAnterior = document.getElementById('btnPaginaAnterior');
    const btnSiguiente = document.getElementById('btnPaginaSiguiente');
    if (btnAnterior) btnAnterior.disabled = paginaActual <= 1;
    if (btnSiguiente) btnSiguiente.disabled = paginaActual >= totalPaginas;
    
    renderRecepcionesList(paginadas);
}

function renderRecepcionesList(recepciones) {
    const list = document.getElementById('recepcionesList');
    if (!list) return;
    if (recepciones.length === 0) { list.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>No hay recepciones</p></div>`; return; }
    list.innerHTML = recepciones.map(rec => `
        <div class="recepcion-card estado-${rec.estado_global || 'EnRecepcion'}" data-id="${rec.id}">
            <div class="recepcion-header">
                <span class="recepcion-codigo">${rec.codigo_unico || 'N/A'}</span>
                <span class="recepcion-estado ${rec.estado_global || 'EnRecepcion'}">${rec.estado_global || 'En Recepción'}</span>
                <span class="recepcion-fecha"><i class="far fa-calendar-alt"></i>${new Date(rec.fecha_ingreso).toLocaleDateString()}</span>
            </div>
            <div class="recepcion-info">
                <div><i class="fas fa-user"></i><strong>Cliente:</strong> ${escapeHtml(rec.cliente_nombre || 'N/A')}</div>
                <div><i class="fas fa-car"></i><strong>Vehículo:</strong> ${escapeHtml(rec.marca || '')} ${escapeHtml(rec.modelo || '')}</div>
                <div><i class="fas fa-id-card"></i><strong>Placa:</strong> ${escapeHtml(rec.placa || 'N/A')}</div>
            </div>
            <div class="recepcion-actions">
                <button class="btn-ver-detalle" onclick="verDetalleRecepcion(${rec.id})"><i class="fas fa-eye"></i> Ver</button>
                <button class="btn-editar-recepcion" onclick="editarRecepcion(${rec.id})"><i class="fas fa-edit"></i> Editar</button>
                <button class="btn-eliminar-recepcion" onclick="confirmarEliminarRecepcion(${rec.id}, '${escapeHtml(rec.codigo_unico || '')}')"><i class="fas fa-trash-alt"></i> Eliminar</button>
            </div>
        </div>
    `).join('');
}

async function verDetalleRecepcion(id) {
    try {
        mostrarNotificacion('Cargando...', 'info');
        const response = await fetch(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        if (response.ok && data.detalle) {
            recepcionSeleccionada = data.detalle;
            mostrarModalDetalle(data.detalle);
        } else throw new Error(data.error || 'Error cargando');
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

function mostrarModalDetalle(detalle) {
    const modal = document.getElementById('modalDetalleRecepcion');
    const body = document.getElementById('detalleRecepcionBody');
    if (!modal || !body) return;
    
    const fotosHtml = generarFotosHtml(detalle.fotos);
    let jefesHtml = '';
    if (detalle.jefe_operativo && detalle.jefe_operativo.nombre) jefesHtml += `<div><span>Jefe Principal:</span><span>${escapeHtml(detalle.jefe_operativo.nombre)}</span></div>`;
    if (detalle.jefe_operativo_2 && detalle.jefe_operativo_2.nombre) jefesHtml += `<div><span>Jefe Secundario:</span><span>${escapeHtml(detalle.jefe_operativo_2.nombre)}</span></div>`;
    
    const latCliente = detalle.latitud || null;
    const lngCliente = detalle.longitud || null;
    const ubicacionCliente = detalle.cliente_ubicacion || '';
    const tieneUbicacion = (latCliente && lngCliente) || ubicacionCliente;
    
    body.innerHTML = `
        <div class="detalle-recepcion">
            <div><h4><i class="fas fa-info-circle"></i> Información General</h4>
                <div><div><span>Código:</span><span>${escapeHtml(detalle.codigo_unico || 'N/A')}</span></div>
                <div><span>Fecha:</span><span>${new Date(detalle.fecha_ingreso).toLocaleString()}</span></div>
                <div><span>Estado:</span><span>${escapeHtml(detalle.estado_global || 'En Recepción')}</span></div></div>
            </div>
            ${jefesHtml ? `<div><h4><i class="fas fa-user-tie"></i> Jefes</h4><div>${jefesHtml}</div></div>` : ''}
            <div><h4><i class="fas fa-user"></i> Cliente</h4>
                <div><div><span>Nombre:</span><span>${escapeHtml(detalle.cliente_nombre || 'N/A')}</span></div>
                <div><span>Teléfono:</span><span>${escapeHtml(detalle.cliente_telefono || 'N/A')}</span></div>
                <div><div><span>Ubicación:</span><span>${escapeHtml(ubicacionCliente || 'No especificada')}</span></div>
                ${tieneUbicacion ? `
                <div class="rutas-botones">
                    <button class="btn-ruta" onclick="abrirRutaEnGoogleMaps(${latCliente || 'null'}, ${lngCliente || 'null'}, '${escapeHtml(ubicacionCliente)}')"><i class="fab fa-google"></i> Google Maps</button>
                    <button class="btn-ruta-waze" onclick="abrirRutaEnWaze(${latCliente || 'null'}, ${lngCliente || 'null'}化肥"><i class="fab fa-waze"></i> Waze</button>
                    <button class="btn-ruta-osm" onclick="abrirRutaEnOpenStreetMap(${latCliente || 'null'}, ${lngCliente || 'null'}, '${escapeHtml(ubicacionCliente)}')"><i class="fas fa-map"></i> OpenStreetMap</button>
                    <button class="btn-ruta-copy" onclick="copiarCoordenadas(${latCliente || 'null'}, ${lngCliente || 'null'}化肥"><i class="fas fa-copy"></i> Copiar coordenadas</button>
                </div>
                <small class="ruta-hint">Haz clic para ver la ruta desde el taller</small>
                ` : ''}
                </div>
            </div>
            <div><h4><i class="fas fa-car"></i> Vehículo</h4>
                <div><div><span>Placa:</span><span>${escapeHtml(detalle.placa || 'N/A')}</span></div>
                <div><span>Marca:</span><span>${escapeHtml(detalle.marca || 'N/A')}</span></div>
                <div><span>Modelo:</span><span>${escapeHtml(detalle.modelo || 'N/A')}</span></div>
                <div><span>Año:</span><span>${detalle.anio || 'N/A'}</span></div>
                <div><span>Kilometraje:</span><span>${detalle.kilometraje?.toLocaleString() || '0'} km</span></div></div>
            </div>
            <div><h4><i class="fas fa-camera"></i> Fotos</h4>${fotosHtml}</div>
            <div><h4><i class="fas fa-pencil-alt"></i> Descripción</h4>
                <div>${escapeHtml(detalle.transcripcion_problema || 'No se registró descripción')}</div>
                ${detalle.audio_url ? `<audio controls src="${detalle.audio_url.startsWith('http') ? detalle.audio_url : window.API_BASE_URL + detalle.audio_url}"></audio>` : ''}
            </div>
        </div>
    `;
    modal.classList.add('show');
    
    const btnWord = document.getElementById('btnExportarWord');
    const btnPDF = document.getElementById('btnExportarPDF');
    if (btnWord) btnWord.onclick = () => exportarAWord(detalle);
    if (btnPDF) btnPDF.onclick = () => exportarAPDF();
}

function generarFotosHtml(fotos) {
    if (!fotos) return '<p>No se registraron fotos</p>';
    const camposFotos = [
        { campo: 'url_lateral_izquierda', label: 'Lateral Izquierdo' },
        { campo: 'url_lateral_derecha', label: 'Lateral Derecho' },
        { campo: 'url_foto_frontal', label: 'Frontal' },
        { campo: 'url_foto_trasera', label: 'Trasera' },
        { campo: 'url_foto_superior', label: 'Superior' },
        { campo: 'url_foto_inferior', label: 'Inferior' },
        { campo: 'url_foto_tablero', label: 'Tablero' }
    ];
    const fotosExistentes = camposFotos.filter(f => { const url = fotos[f.campo]; return url && url !== 'null' && url !== 'None' && url !== '' && url !== null; });
    if (fotosExistentes.length === 0) return '<p>No se registraron fotos</p>';
    return `<div class="detalle-fotos">${fotosExistentes.map(f => `<div class="detalle-foto" onclick="verImagenAmpliada('${fotos[f.campo]}', '${f.label}')"><img src="${fotos[f.campo]}" alt="${f.label}" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'"><div class="detalle-foto-label">${f.label}</div></div>`).join('')}</div>`;
}

function verImagenAmpliada(url, label) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.innerHTML = `<div class="modal-imagen-content"><button class="modal-imagen-close" onclick="this.parentElement.parentElement.remove()">&times;</button><img src="${url}" alt="${label}"><p>${label}</p></div>`;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function exportarAWord(detalle) {
    const contenido = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recepcion_${detalle.codigo_unico}</title><style>body{font-family:Arial,sans-serif;padding:40px;}h1{color:#C1121F;}h2{color:#333;margin-top:20px;}.info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:15px 0;}.fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px;}.foto{border:1px solid #ddd;border-radius:8px;overflow:hidden;}.foto img{width:100%;height:auto;}.descripcion{background:#f9f9f9;padding:15px;border-radius:8px;margin:15px 0;}</style></head><body><h1>FURIA MOTOR COMPANY</h1><h2>Recepción de Vehículo</h2><p><strong>Código:</strong> ${detalle.codigo_unico}</p><p><strong>Fecha:</strong> ${new Date(detalle.fecha_ingreso).toLocaleString()}</p><h2>Cliente</h2><div class="info-grid"><div><strong>Nombre:</strong> ${detalle.cliente_nombre || 'N/A'}</div><div><strong>Teléfono:</strong> ${detalle.cliente_telefono || 'N/A'}</div><div><strong>Ubicación:</strong> ${detalle.cliente_ubicacion || 'N/A'}</div></div><h2>Vehículo</h2><div class="info-grid"><div><strong>Placa:</strong> ${detalle.placa || 'N/A'}</div><div><strong>Marca:</strong> ${detalle.marca || 'N/A'}</div><div><strong>Modelo:</strong> ${detalle.modelo || 'N/A'}</div><div><strong>Año:</strong> ${detalle.anio || 'N/A'}</div><div><strong>Kilometraje:</strong> ${detalle.kilometraje?.toLocaleString() || '0'} km</div></div><h2>Fotos</h2><div class="fotos">${Object.entries(detalle.fotos || {}).filter(([_, url]) => url).map(([campo, url]) => `<div class="foto"><img src="${url}" alt="${campo}"><p>${campo.replace(/url_/g, '').replace(/_/g, ' ').toUpperCase()}</p></div>`).join('')}</div><h2>Descripción</h2><div class="descripcion">${detalle.transcripcion_problema || 'No se registró descripción'}</div><div class="footer">Documento generado automáticamente</div></body></html>`;
    const blob = new Blob([contenido], { type: 'application/msword' });
    saveAs(blob, `Recepcion_${detalle.codigo_unico}.doc`);
    mostrarNotificacion('Word generado', 'success');
}

function exportarAPDF() {
    const modal = document.getElementById('modalDetalleRecepcion');
    const contenido = document.getElementById('detalleRecepcionBody');
    if (!contenido) return;
    const originalWidth = contenido.style.width;
    contenido.style.width = '100%';
    const opt = { margin: [0.5, 0.5, 0.5, 0.5], filename: `Recepcion_${recepcionSeleccionada?.codigo_unico || 'export'}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
    html2pdf().set(opt).from(contenido).save().then(() => { contenido.style.width = originalWidth; mostrarNotificacion('PDF generado', 'success'); }).catch(err => { contenido.style.width = originalWidth; mostrarNotificacion('Error generando PDF', 'error'); });
}

function cerrarModalDetalle() { const modal = document.getElementById('modalDetalleRecepcion'); if (modal) modal.classList.remove('show'); }

function confirmarEliminarRecepcion(id, codigo) {
    const modal = document.getElementById('modalConfirmarEliminar');
    const eliminarInfo = document.getElementById('eliminarInfo');
    if (!modal) return;
    eliminarInfo.innerHTML = `<p><strong>Recepción:</strong> ${escapeHtml(codigo)}</p><p><strong>ID:</strong> ${id}</p>`;
    modal.classList.add('show');
    const btnConfirmar = document.getElementById('btnConfirmarEliminar');
    if (btnConfirmar) btnConfirmar.onclick = async () => { await eliminarRecepcion(id); cerrarModalEliminar(); };
}

function cerrarModalEliminar() { const modal = document.getElementById('modalConfirmarEliminar'); if (modal) modal.classList.remove('show'); }

async function eliminarRecepcion(id) {
    try {
        mostrarNotificacion('Eliminando...', 'info');
        const response = await fetch(`${API_URL}/jefe-operativo/eliminar-recepcion/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        if (response.ok) { mostrarNotificacion('Recepción eliminada', 'success'); cargarRecepciones(); }
        else throw new Error(data.error || 'Error al eliminar');
    } catch (error) { mostrarNotificacion(error.message, 'error'); }
}

function cargarDatosParaEdicion(detalle) {
    const clienteNombre = document.getElementById('clienteNombre');
    const clienteTelefono = document.getElementById('clienteTelefono');
    const clienteUbicacion = document.getElementById('clienteUbicacion');
    const clienteLatitud = document.getElementById('clienteLatitud');
    const clienteLongitud = document.getElementById('clienteLongitud');
    
    if (clienteNombre) clienteNombre.value = detalle.cliente_nombre || '';
    if (clienteTelefono) clienteTelefono.value = detalle.cliente_telefono || '';
    if (clienteUbicacion) clienteUbicacion.value = detalle.cliente_ubicacion || '';
    if (clienteLatitud && detalle.latitud) clienteLatitud.value = detalle.latitud;
    if (clienteLongitud && detalle.longitud) clienteLongitud.value = detalle.longitud;
    
    const vehiculoPlaca = document.getElementById('vehiculoPlaca');
    const vehiculoMarca = document.getElementById('vehiculoMarca');
    const vehiculoModelo = document.getElementById('vehiculoModelo');
    const vehiculoAnio = document.getElementById('vehiculoAnio');
    const vehiculoKilometraje = document.getElementById('vehiculoKilometraje');
    if (vehiculoPlaca) vehiculoPlaca.value = detalle.placa || '';
    if (vehiculoMarca) vehiculoMarca.value = detalle.marca || '';
    if (vehiculoModelo) vehiculoModelo.value = detalle.modelo || '';
    if (vehiculoAnio) vehiculoAnio.value = detalle.anio || '';
    if (vehiculoKilometraje) vehiculoKilometraje.value = detalle.kilometraje || '';
    if (descripcionProblema) descripcionProblema.value = detalle.transcripcion_problema || '';
    
    if (detalle.audio_url && audioPreview) { 
        audioPreview.src = detalle.audio_url; 
        audioPreview.style.display = 'block'; 
        audioStatus.textContent = 'Audio disponible'; 
        audioCloudinaryUrl = detalle.audio_url;
        if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
    }
    
    if (detalle.fotos) {
        for (const [campo, url] of Object.entries(detalle.fotos)) {
            if (url && url !== 'null' && url !== 'None') {
                const fotoConfig = FOTOS_CONFIG.find(f => f.campo === campo);
                if (fotoConfig) {
                    const uploadDiv = document.getElementById(`upload-${fotoConfig.id}`);
                    const preview = uploadDiv?.querySelector('.upload-preview');
                    if (preview) { 
                        preview.style.backgroundImage = `url('${url}')`; 
                        preview.style.backgroundSize = 'cover'; 
                        preview.style.backgroundPosition = 'center'; 
                        if (uploadDiv) uploadDiv.classList.add('has-image'); 
                    }
                }
            }
        }
    }
    
    if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
    if (sessionPanel) sessionPanel.style.display = 'flex';
    if (colaboradoresPanel) colaboradoresPanel.style.display = 'block';
    if (recepcionForm) recepcionForm.style.display = 'block';
}

async function guardarCambiosRecepcion() {
    if (!modoEdicionRecepcion || !recepcionEditandoId) { mostrarNotificacion('No hay recepción en edición', 'warning'); return; }
    try {
        // Procesar nuevas fotos
        const fotosData = {};
        for (const foto of FOTOS_CONFIG) {
            const input = document.getElementById(foto.id);
            const file = input?.files?.[0];
            if (file && file.size > 0) {
                if (file.size > 5 * 1024 * 1024) {
                    mostrarNotificacion(`La foto ${foto.label} no debe superar los 5MB`, 'warning');
                } else {
                    fotosData[foto.campo] = await fileToBase64(file);
                }
            }
        }
        
        // Procesar audio nuevo
        let audioUrl = audioCloudinaryUrl;
        if (audioBlob) {
            mostrarNotificacion('Subiendo audio a Cloudinary...', 'info');
            try {
                audioUrl = await subirAudioCloudinary(audioBlob);
                audioCloudinaryUrl = audioUrl;
                mostrarNotificacion('Audio subido', 'success');
            } catch (error) {
                console.error('Error subiendo audio:', error);
            }
        }
        
        const datosActualizados = {
            cliente: { 
                nombre: document.getElementById('clienteNombre')?.value || '', 
                telefono: document.getElementById('clienteTelefono')?.value || '', 
                ubicacion: document.getElementById('clienteUbicacion')?.value || '',
                latitud: document.getElementById('clienteLatitud')?.value || null,
                longitud: document.getElementById('clienteLongitud')?.value || null
            },
            vehiculo: { 
                placa: document.getElementById('vehiculoPlaca')?.value.toUpperCase() || '', 
                marca: document.getElementById('vehiculoMarca')?.value || '', 
                modelo: document.getElementById('vehiculoModelo')?.value || '', 
                anio: parseInt(document.getElementById('vehiculoAnio')?.value) || null, 
                kilometraje: parseInt(document.getElementById('vehiculoKilometraje')?.value) || 0 
            },
            descripcion: { 
                texto: descripcionProblema?.value || '', 
                audio_url: audioUrl 
            },
            fotos: fotosData
        };
        
        mostrarNotificacion('Guardando cambios...', 'info');
        const response = await fetch(`${API_URL}/jefe-operativo/actualizar-recepcion/${recepcionEditandoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` },
            body: JSON.stringify(datosActualizados)
        });
        const data = await response.json();
        if (response.ok) {
            mostrarNotificacion('Recepción actualizada', 'success');
            modoEdicionRecepcion = false;
            recepcionEditandoId = null;
            const badge = document.getElementById('modoEdicionBadge');
            if (badge) badge.remove();
            if (btnFinalizar) {
                const todasCompletas = sesionActual?.secciones_completadas ? Object.values(sesionActual.secciones_completadas).every(v => v === true) : false;
                btnFinalizar.disabled = !todasCompletas;
                btnFinalizar.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Recepción';
            }
            cargarRecepciones();
            limpiarFormularioCompleto();
            if (!codigoSesion) { 
                if (recepcionForm) recepcionForm.style.display = 'none'; 
                if (sessionPanel) sessionPanel.style.display = 'none'; 
                if (colaboradoresPanel) colaboradoresPanel.style.display = 'none'; 
                if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block'; 
            }
        } else throw new Error(data.error || 'Error al actualizar');
    } catch (error) { mostrarNotificacion(error.message, 'error'); }
}

async function editarRecepcion(id) {
    try {
        mostrarNotificacion('Cargando datos...', 'info');
        const response = await fetch(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        if (response.ok && data.detalle) {
            cargarDatosParaEdicion(data.detalle);
            mostrarNotificacion('Datos cargados. Puedes editar.', 'success');
            if (recepcionForm) {
                const modoEdicionBadge = document.createElement('span');
                modoEdicionBadge.className = 'modo-edicion-badge';
                modoEdicionBadge.id = 'modoEdicionBadge';
                modoEdicionBadge.innerHTML = '<i class="fas fa-edit"></i> Modo Edición';
                const existingBadge = document.getElementById('modoEdicionBadge');
                if (existingBadge) existingBadge.remove();
                const panelHeader = document.querySelector('.session-panel .session-info');
                if (panelHeader) panelHeader.appendChild(modoEdicionBadge);
            }
            modoEdicionRecepcion = true;
            recepcionEditandoId = id;
            if (btnFinalizar) {
                btnFinalizar.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
                btnFinalizar.disabled = false;
                const newBtnFinalizar = btnFinalizar.cloneNode(true);
                btnFinalizar.parentNode.replaceChild(newBtnFinalizar, btnFinalizar);
                window.btnFinalizar = newBtnFinalizar;
                newBtnFinalizar.onclick = guardarCambiosRecepcion;
            }
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
            if (sessionPanel) sessionPanel.style.display = 'flex';
            if (colaboradoresPanel) colaboradoresPanel.style.display = 'block';
            if (recepcionForm) recepcionForm.style.display = 'block';
        } else throw new Error(data.error || 'Error cargando datos');
    } catch (error) { mostrarNotificacion(error.message, 'error'); }
}

// =====================================================
// ESTILOS ADICIONALES
// =====================================================
const styleImagen = document.createElement('style');
styleImagen.textContent = `
    .modal-imagen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); display: none; align-items: center; justify-content: center; z-index: 2000; }
    .modal-imagen-content { max-width: 90vw; max-height: 90vh; position: relative; }
    .modal-imagen-content img { max-width: 100%; max-height: 85vh; object-fit: contain; border-radius: 8px; }
    .modal-imagen-close { position: absolute; top: -40px; right: 0; background: none; border: none; color: white; font-size: 30px; cursor: pointer; }
    .modal-imagen-content p { text-align: center; color: white; margin-top: 10px; }
    .btn-danger { background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 500; }
    .btn-danger:hover { background: #c82333; }
    .modo-edicion-badge { background: #FFB347; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; margin-left: 12px; }
    #leafletMapa { border-radius: 12px; margin-top: 10px; border: 1px solid var(--borde-claro); z-index: 1; }
    .ubicacion-info { margin-top: 10px; padding: 12px; background: var(--fondo-suave); border-radius: 8px; animation: fadeIn 0.3s ease; }
    .info-card { display: flex; align-items: center; gap: 12px; }
    .info-card i { font-size: 20px; color: var(--verde-exito); }
    .info-card strong { display: block; font-size: 12px; color: var(--texto-secundario); }
    .info-card span { font-size: 14px; color: var(--texto-principal); }
    .ubicacion-input-group { display: flex; gap: 10px; align-items: center; }
    .ubicacion-input-group input { flex: 1; }
    .btn-ubicacion { background: var(--fondo-suave); border: 1px solid var(--borde-claro); border-radius: 8px; padding: 10px 16px; cursor: pointer; font-size: 14px; color: var(--blanco); transition: all 0.3s ease; white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; }
    .btn-ubicacion:hover { background: var(--rojo-acento); color: white; border-color: var(--rojo-acento); }
    .form-hint { display: block; font-size: 11px; color: var(--gris-texto); margin-top: 5px; }
    .full-width { width: 100%; grid-column: 1 / -1; }
    .search-container { position: relative; margin-bottom: 10px; }
    .search-container i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--texto-secundario); z-index: 2; }
    .ubicacion-search { width: 100%; padding: 12px 12px 12px 40px; border: 1px solid var(--borde-claro); border-radius: 8px; font-size: 14px; outline: none; transition: all 0.3s ease; background: var(--gris-oscuro); color: var(--blanco); }
    .ubicacion-search:focus { border-color: var(--rojo-acento); box-shadow: 0 0 0 2px rgba(193,18,31,0.1); }
    .rutas-botones { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .btn-ruta, .btn-ruta-waze, .btn-ruta-osm, .btn-ruta-copy { padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 0.4rem; border: none; }
    .btn-ruta { background: #4285F4; color: white; }
    .btn-ruta:hover { background: #3367D6; transform: translateY(-1px); }
    .btn-ruta-waze { background: #33CCFF; color: #1D1D1B; }
    .btn-ruta-waze:hover { background: #2BB8E6; transform: translateY(-1px); }
    .btn-ruta-osm { background: #7BC5AE; color: #1D1D1B; }
    .btn-ruta-osm:hover { background: #6BB59E; transform: translateY(-1px); }
    .btn-ruta-copy { background: var(--gris-medio); color: var(--blanco); border: 1px solid var(--border-color); }
    .btn-ruta-copy:hover { background: var(--rojo-primario); border-color: var(--rojo-primario); transform: translateY(-1px); }
    .ruta-hint { display: block; font-size: 0.65rem; color: var(--gris-texto); margin-top: 0.5rem; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
`;
document.head.appendChild(styleImagen);