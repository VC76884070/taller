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
// CONFIGURACIÓN DE CLOUDINARY
// =====================================================
const CLOUDINARY_CLOUD_NAME = 'drpt6ztkd';
const CLOUDINARY_UPLOAD_PRESET = 'furia_audio_unsigned';

// =====================================================
// CONFIGURACIÓN PRINCIPAL
// =====================================================
const API_URL = `${window.API_BASE_URL}/api`;
const logger = {
    info: (...args) => console.log('📘 [INFO]', ...args),
    error: (...args) => console.error('❌ [ERROR]', ...args),
    warn: (...args) => console.warn('⚠️ [WARN]', ...args),
    debug: (...args) => console.log('🔍 [DEBUG]', ...args)
};

// Coordenadas del taller
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

// Control de edición - EVITA SOBREESCRITURA
let camposEnEdicion = {
    cliente: false,
    vehiculo: false,
    descripcion: false
};
let timeoutsEdicion = {};

// Control de estado de completado local
let seccionesCompletadasLocal = {
    cliente: false,
    vehiculo: false,
    fotos: false,
    descripcion: false
};

// Variables para manejo de fotos y audio
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioBlob = null;
let audioCloudinaryUrl = null;
let fotosSubidasLocal = {};

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
        formData.append('resource_type', 'video');
        
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
        
        logger.info('📤 Subiendo audio a Cloudinary...');
        
        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                logger.info(`✅ Audio subido a Cloudinary: ${data.secure_url}`);
                resolve(data.secure_url);
            } else {
                logger.error('❌ Error Cloudinary:', data);
                reject(new Error(data.error?.message || 'Error subiendo audio'));
            }
        })
        .catch(error => {
            logger.error('❌ Error en fetch:', error);
            reject(error);
        });
    });
}

// =====================================================
// FUNCIÓN PARA HACER PETICIONES CON TOKEN
// =====================================================
async function fetchWithToken(url, options = {}) {
    const token = localStorage.getItem('furia_token');
    
    if (!token) {
        logger.error('[fetchWithToken] ❌ No hay token');
        throw new Error('No hay token de autenticación');
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    if (response.status === 401) {
        logger.error('[fetchWithToken] ❌ Error 401 - Token inválido');
    }
    
    return response;
}

// =====================================================
// ACTUALIZAR ESTADO DEL BOTÓN FINALIZAR
// =====================================================
function actualizarBotonFinalizar() {
    if (!btnFinalizar) return;
    
    const todasCompletas = seccionesCompletadasLocal.cliente && 
                           seccionesCompletadasLocal.vehiculo && 
                           seccionesCompletadasLocal.fotos && 
                           seccionesCompletadasLocal.descripcion;
    
    btnFinalizar.disabled = !todasCompletas;
    
    if (!todasCompletas) {
        const faltantes = [];
        if (!seccionesCompletadasLocal.cliente) faltantes.push('Cliente');
        if (!seccionesCompletadasLocal.vehiculo) faltantes.push('Vehículo');
        if (!seccionesCompletadasLocal.fotos) faltantes.push('Fotos (7)');
        if (!seccionesCompletadasLocal.descripcion) faltantes.push('Descripción');
        btnFinalizar.title = `Completa: ${faltantes.join(', ')}`;
    } else {
        btnFinalizar.title = 'Finalizar recepción';
    }
}

// =====================================================
// ACTUALIZAR ESTADO VISUAL DE SECCIONES
// =====================================================
function actualizarEstadoVisualSeccion(seccion, completada) {
    const badge = document.getElementById(`status${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
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
}

// =====================================================
// VALIDAR COMPLETADO DE CLIENTE
// =====================================================
function validarCompletadoCliente() {
    const nombre = document.getElementById('clienteNombre')?.value.trim();
    const telefono = document.getElementById('clienteTelefono')?.value.trim();
    const completada = !!(nombre && telefono);
    
    if (seccionesCompletadasLocal.cliente !== completada) {
        seccionesCompletadasLocal.cliente = completada;
        actualizarEstadoVisualSeccion('cliente', completada);
        actualizarBotonFinalizar();
        
        // Si está completa, guardar automáticamente
        if (completada && codigoSesion && !camposEnEdicion.cliente) {
            guardarSeccion('cliente');
        }
    }
    return completada;
}

// =====================================================
// VALIDAR COMPLETADO DE VEHÍCULO
// =====================================================
function validarCompletadoVehiculo() {
    const placa = document.getElementById('vehiculoPlaca')?.value.trim();
    const marca = document.getElementById('vehiculoMarca')?.value.trim();
    const modelo = document.getElementById('vehiculoModelo')?.value.trim();
    const completada = !!(placa && marca && modelo);
    
    if (seccionesCompletadasLocal.vehiculo !== completada) {
        seccionesCompletadasLocal.vehiculo = completada;
        actualizarEstadoVisualSeccion('vehiculo', completada);
        actualizarBotonFinalizar();
        
        if (completada && codigoSesion && !camposEnEdicion.vehiculo) {
            guardarSeccion('vehiculo');
        }
    }
    return completada;
}

// =====================================================
// VALIDAR COMPLETADO DE FOTOS
// =====================================================
function validarCompletadoFotos() {
    let fotosCompletas = 0;
    
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        if (uploadDiv && uploadDiv.classList.contains('has-image')) {
            fotosCompletas++;
        }
    }
    
    const completada = fotosCompletas === 7;
    
    // Actualizar badge de fotos
    const fotosBadge = document.getElementById('statusFotos');
    if (fotosBadge) {
        if (completada) {
            fotosBadge.textContent = '✓ Completado';
            fotosBadge.classList.add('completado');
            fotosBadge.classList.remove('en-proceso');
        } else {
            fotosBadge.textContent = `○ ${fotosCompletas}/7 fotos`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
        }
    }
    
    if (seccionesCompletadasLocal.fotos !== completada) {
        seccionesCompletadasLocal.fotos = completada;
        actualizarBotonFinalizar();
    }
    
    return completada;
}

// =====================================================
// VALIDAR COMPLETADO DE DESCRIPCIÓN
// =====================================================
function validarCompletadoDescripcion() {
    const texto = descripcionProblema?.value?.trim();
    const completada = !!(texto && texto.length > 0);
    
    if (seccionesCompletadasLocal.descripcion !== completada) {
        seccionesCompletadasLocal.descripcion = completada;
        actualizarEstadoVisualSeccion('descripcion', completada);
        actualizarBotonFinalizar();
        
        if (completada && codigoSesion && !camposEnEdicion.descripcion && !descripcionModificadaManualmente) {
            // No guardar automáticamente para dar tiempo al usuario
        }
    }
    return completada;
}

// =====================================================
// FUNCIÓN PARA SUBIR IMAGEN Y ACTUALIZAR CONTADOR
// =====================================================
function subirImagenLocal(input, foto) {
    const file = input.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        mostrarNotificacion(`La foto ${foto.label} no debe superar los 5MB`, 'warning');
        input.value = '';
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        mostrarNotificacion('Solo imágenes', 'warning');
        input.value = '';
        return;
    }
    
    const uploadDiv = document.getElementById(`upload-${foto.id}`);
    const preview = uploadDiv?.querySelector('.upload-preview');
    const removeBtn = uploadDiv?.querySelector('.remove-photo');
    
    if (preview) {
        const objectUrl = URL.createObjectURL(file);
        preview.style.backgroundImage = `url('${objectUrl}')`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        uploadDiv.classList.add('has-image');
        
        // Guardar referencia para limpiar después
        if (uploadDiv.dataset.objectUrl) {
            URL.revokeObjectURL(uploadDiv.dataset.objectUrl);
        }
        uploadDiv.dataset.objectUrl = objectUrl;
        
        if (removeBtn) removeBtn.style.display = 'flex';
        
        // Guardar el file para subir después
        fotosSubidasLocal[foto.campo] = file;
        
        // Validar completado de fotos
        validarCompletadoFotos();
    }
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
    console.log('========================================');
    console.log('🚀 INICIANDO RECEPCION.JS');
    console.log('========================================');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    await verificarSesionAbandonada();
    
    initPage();
    generatePhotoUploads();
    setupPhotoUploads();
    setupAudioRecording();
    setupEventListeners();
    setupPlacaValidation();
    setupInputTracking();
    setupUnirsePorCodigo();
    setupModalUbicacionLeaflet();
    
    await recuperarSesionActiva();
    
    iniciarPollingSesiones();
    initRecepcionesPanel();
    
    console.log('✅ Recepcion.js inicializado correctamente');
});

// =====================================================
// CHECK AUTH
// =====================================================
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    
    if (!token) {
        window.location.href = `${window.API_BASE_URL}/`;
        return false;
    }
    
    try {
        const userInfoRaw = localStorage.getItem('furia_user');
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
            window.location.href = `${window.API_BASE_URL}/`;
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
// POLLING DE SESIONES ACTIVAS
// =====================================================
function iniciarPollingSesiones() {
    if (sesionesPolling) clearInterval(sesionesPolling);
    sesionesPolling = setInterval(() => cargarSesionesActivas(), 5000);
}

async function cargarSesionesActivas() {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/sesiones-activas`, { method: 'GET' });
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.sesiones) renderSesionesActivas(data.sesiones);
    } catch (error) {
        logger.error('Error cargando sesiones:', error);
    }
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
        const esActiva = codigoSesion === sesion.codigo;
        
        return `
            <div class="sesion-item ${esActiva ? 'active' : ''} ${estaCompleta ? 'full' : ''}">
                <div class="sesion-info">
                    <span class="sesion-codigo"><i class="fas fa-lock"></i> Sesión #${sesion.codigo.substring(2, 5)}***</span>
                    <div class="sesion-colaboradores"><i class="fas fa-users"></i><span>${colaboradoresCount}/2</span></div>
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
}

async function unirseSesionConCodigo(codigo) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/unirse-sesion`, {
            method: 'POST',
            body: JSON.stringify({ codigo })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al unirse');
        }
        
        const data = await response.json();
        
        if (data.success) {
            codigoSesion = codigo;
            sesionActual = data.sesion;
            localStorage.setItem('sesion_actual', codigo);
            activarSesion();
            mostrarNotificacion(`Te has unido a ${codigoSesion}`, 'success');
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
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
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/iniciar-sesion`, { method: 'POST' });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al crear sesión');
        }
        
        const data = await response.json();
        
        if (data.success) {
            codigoSesion = data.codigo;
            sesionActual = data.sesion;
            localStorage.setItem('sesion_actual', codigoSesion);
            activarSesion();
            mostrarModalCodigo(codigoSesion);
            mostrarNotificacion(`Sesión creada: ${codigoSesion}`, 'success');
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
    
    // Resetear estado local
    seccionesCompletadasLocal = {
        cliente: false,
        vehiculo: false,
        fotos: false,
        descripcion: false
    };
    
    cargarDatosSesionInicial();
    iniciarPolling();
    iniciarKeepAlive();
}

// =====================================================
// CARGAR DATOS INICIALES DE SESIÓN
// =====================================================
async function cargarDatosSesionInicial() {
    if (!codigoSesion) return;
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
        
        if (!response.ok) return;
        
        const data = await response.json();
        if (!data.sesion || data.sesion.estado === 'finalizada') {
            limpiarSesionCompleta();
            return;
        }
        
        sesionActual = data.sesion;
        const datos = sesionActual.datos;
        
        // Cargar datos de cliente
        if (datos.cliente) {
            const clienteNombre = document.getElementById('clienteNombre');
            const clienteTelefono = document.getElementById('clienteTelefono');
            const clienteUbicacion = document.getElementById('clienteUbicacion');
            const clienteLatitud = document.getElementById('clienteLatitud');
            const clienteLongitud = document.getElementById('clienteLongitud');
            
            if (clienteNombre && datos.cliente.nombre) clienteNombre.value = datos.cliente.nombre;
            if (clienteTelefono && datos.cliente.telefono) clienteTelefono.value = datos.cliente.telefono;
            if (clienteUbicacion && datos.cliente.ubicacion) clienteUbicacion.value = datos.cliente.ubicacion;
            if (clienteLatitud && datos.cliente.latitud) clienteLatitud.value = datos.cliente.latitud;
            if (clienteLongitud && datos.cliente.longitud) clienteLongitud.value = datos.cliente.longitud;
            
            validarCompletadoCliente();
        }
        
        // Cargar datos de vehículo
        if (datos.vehiculo) {
            const vehiculoPlaca = document.getElementById('vehiculoPlaca');
            const vehiculoMarca = document.getElementById('vehiculoMarca');
            const vehiculoModelo = document.getElementById('vehiculoModelo');
            const vehiculoAnio = document.getElementById('vehiculoAnio');
            const vehiculoKilometraje = document.getElementById('vehiculoKilometraje');
            
            if (vehiculoPlaca && datos.vehiculo.placa) vehiculoPlaca.value = datos.vehiculo.placa;
            if (vehiculoMarca && datos.vehiculo.marca) vehiculoMarca.value = datos.vehiculo.marca;
            if (vehiculoModelo && datos.vehiculo.modelo) vehiculoModelo.value = datos.vehiculo.modelo;
            if (vehiculoAnio && datos.vehiculo.anio) vehiculoAnio.value = datos.vehiculo.anio;
            if (vehiculoKilometraje && datos.vehiculo.kilometraje) vehiculoKilometraje.value = datos.vehiculo.kilometraje;
            
            validarCompletadoVehiculo();
        }
        
        // Cargar fotos
        if (datos.fotos) {
            for (const [campo, url] of Object.entries(datos.fotos)) {
                if (url && url !== 'null' && url !== 'None') {
                    const fotoConfig = FOTOS_CONFIG.find(f => f.campo === campo);
                    if (fotoConfig) {
                        const uploadDiv = document.getElementById(`upload-${fotoConfig.id}`);
                        const preview = uploadDiv?.querySelector('.upload-preview');
                        if (preview) {
                            preview.style.backgroundImage = `url('${url}')`;
                            preview.style.backgroundSize = 'cover';
                            preview.style.backgroundPosition = 'center';
                            uploadDiv.classList.add('has-image');
                            
                            const removeBtn = uploadDiv.querySelector('.remove-photo');
                            if (removeBtn) removeBtn.style.display = 'flex';
                        }
                    }
                }
            }
            validarCompletadoFotos();
        }
        
        // Cargar descripción
        if (datos.descripcion) {
            if (datos.descripcion.texto) {
                descripcionProblema.value = datos.descripcion.texto;
                descripcionOriginal = datos.descripcion.texto;
            }
            if (datos.descripcion.audio_url) {
                audioCloudinaryUrl = datos.descripcion.audio_url;
                if (audioPreview) {
                    audioPreview.src = audioCloudinaryUrl;
                    audioPreview.style.display = 'block';
                    audioStatus.textContent = 'Audio disponible';
                }
            }
            validarCompletadoDescripcion();
        }
        
        // Actualizar colaboradores
        if (sesionActual.colaboradores_nombres) {
            const colaboradores = sesionActual.colaboradores_nombres;
            if (colaboradoresCount) colaboradoresCount.textContent = colaboradores.length;
            if (colaboradoresCountDetail) colaboradoresCountDetail.textContent = colaboradores.length;
            if (colaboradoresList) {
                colaboradoresList.innerHTML = colaboradores.map(nombre => 
                    `<div class="colaborador"><i class="fas fa-user"></i><span>${escapeHtml(nombre)}</span>${nombre === userInfo?.nombre ? '<span class="badge-you"> (Tú)</span>' : ''}</div>`
                ).join('');
            }
        }
        
        // Actualizar completado desde servidor si está marcado
        if (sesionActual.secciones_completadas) {
            seccionesCompletadasLocal = { ...sesionActual.secciones_completadas };
            actualizarBotonFinalizar();
        }
        
    } catch (error) {
        logger.error('Error cargando datos iniciales:', error);
    }
}

// =====================================================
// RECUPERAR SESIÓN ACTIVA
// =====================================================
async function recuperarSesionActiva() {
    const sesionGuardada = localStorage.getItem('sesion_actual');
    if (!sesionGuardada) return;
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${sesionGuardada}`, { method: 'GET' });
        
        if (!response.ok) {
            if (response.status === 404) {
                localStorage.removeItem('sesion_actual');
            }
            return;
        }
        
        const data = await response.json();
        
        if (data.sesion && data.sesion.estado === 'activa') {
            const esColaborador = data.sesion.colaboradores.includes(userInfo.id);
            if (esColaborador) {
                codigoSesion = sesionGuardada;
                sesionActual = data.sesion;
                activarSesion();
                mostrarNotificacion(`Sesión recuperada: ${codigoSesion}`, 'success');
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
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/listar-recepciones`, { method: 'GET' });
        
        if (!response.ok) {
            if (response.status === 401) {
                const list = document.getElementById('recepcionesList');
                if (list) list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error de autenticación</p></div>`;
                return;
            }
            throw new Error(`Error ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.recepciones) {
            recepcionesActuales = data.recepciones;
            const count = document.getElementById('recepcionesCount');
            if (count) count.textContent = recepcionesActuales.length;
            filtrarYMostrarRecepciones();
        }
    } catch (error) {
        logger.error('Error cargando recepciones:', error);
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
    if (recepciones.length === 0) { 
        list.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>No hay recepciones</p></div>`; 
        return; 
    }
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
                <button class="btn-eliminar-recepcion" onclick="confirmarEliminarRecepcion(${rec.id})"><i class="fas fa-trash-alt"></i> Eliminar</button>
            </div>
        </div>
    `).join('');
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
        const removeBtn = upload.querySelector('.remove-photo');
        const fotoConfig = FOTOS_CONFIG.find(f => `upload-${f.id}` === upload.id);
        
        if (input && fotoConfig) {
            input.addEventListener('change', (e) => {
                subirImagenLocal(input, fotoConfig);
                if (codigoSesion && seccionesCompletadasLocal.fotos) {
                    setTimeout(() => guardarSeccion('fotos'), 500);
                }
            });
        }
        
        if (removeBtn && fotoConfig) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                input.value = '';
                const preview = upload.querySelector('.upload-preview');
                if (preview) preview.style.backgroundImage = '';
                upload.classList.remove('has-image');
                removeBtn.style.display = 'none';
                delete fotosSubidasLocal[fotoConfig.campo];
                if (upload.dataset.objectUrl) {
                    URL.revokeObjectURL(upload.dataset.objectUrl);
                    delete upload.dataset.objectUrl;
                }
                validarCompletadoFotos();
                if (codigoSesion) {
                    guardarSeccion('fotos');
                }
            });
        }
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
            audioStatus.textContent = 'Audio grabado - Presiona "Guardar Descripción"';
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
    
    if (codigoSesion && descripcionProblema.value.trim()) {
        guardarSeccion('descripcion');
    } else if (codigoSesion) {
        descripcionProblema.value = '';
        validarCompletadoDescripcion();
        guardarSeccion('descripcion');
    }
    
    mostrarNotificacion('Grabación eliminada', 'info');
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

function setupPlacaValidation() {
    const placaInput = document.getElementById('vehiculoPlaca');
    if (!placaInput) return;
    let timeoutId;
    placaInput.addEventListener('input', (e) => {
        clearTimeout(timeoutId);
        const placa = e.target.value.toUpperCase();
        e.target.value = placa;
        validarCompletadoVehiculo();
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
            if (confirm('¿Cargar datos del vehículo y cliente?')) {
                document.getElementById('vehiculoMarca').value = data.vehiculo.marca || '';
                document.getElementById('vehiculoModelo').value = data.vehiculo.modelo || '';
                document.getElementById('clienteNombre').value = data.vehiculo.cliente || '';
                document.getElementById('clienteTelefono').value = data.vehiculo.telefono || '';
                validarCompletadoVehiculo();
                validarCompletadoCliente();
                if (codigoSesion) {
                    await guardarSeccion('vehiculo');
                    await guardarSeccion('cliente');
                }
            }
        }
    } catch (error) {}
}

function setupInputTracking() {
    // Cliente inputs
    const clienteInputs = ['clienteNombre', 'clienteTelefono', 'clienteUbicacion'];
    clienteInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            let debounceTimeout;
            input.addEventListener('focus', () => { camposEnEdicion.cliente = true; });
            input.addEventListener('blur', async () => {
                validarCompletadoCliente();
                camposEnEdicion.cliente = false;
                if (codigoSesion && seccionesCompletadasLocal.cliente) {
                    await guardarSeccion('cliente');
                }
            });
            input.addEventListener('input', () => {
                if (debounceTimeout) clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    validarCompletadoCliente();
                    if (codigoSesion && seccionesCompletadasLocal.cliente) {
                        guardarSeccion('cliente');
                    }
                }, 1000);
            });
        }
    });
    
    // Vehículo inputs
    const vehiculoInputs = ['vehiculoPlaca', 'vehiculoMarca', 'vehiculoModelo', 'vehiculoAnio', 'vehiculoKilometraje'];
    vehiculoInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            let debounceTimeout;
            input.addEventListener('focus', () => { camposEnEdicion.vehiculo = true; });
            input.addEventListener('blur', async () => {
                validarCompletadoVehiculo();
                camposEnEdicion.vehiculo = false;
                if (codigoSesion && seccionesCompletadasLocal.vehiculo) {
                    await guardarSeccion('vehiculo');
                }
            });
            input.addEventListener('input', () => {
                if (debounceTimeout) clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    validarCompletadoVehiculo();
                    if (codigoSesion && seccionesCompletadasLocal.vehiculo) {
                        guardarSeccion('vehiculo');
                    }
                }, 1000);
            });
        }
    });
    
    // Descripción
    if (descripcionProblema) {
        let debounceTimeout;
        descripcionProblema.addEventListener('focus', () => { camposEnEdicion.descripcion = true; });
        descripcionProblema.addEventListener('blur', async () => {
            validarCompletadoDescripcion();
            camposEnEdicion.descripcion = false;
            if (codigoSesion && seccionesCompletadasLocal.descripcion) {
                await guardarSeccion('descripcion');
            }
        });
        descripcionProblema.addEventListener('input', () => {
            descripcionModificadaManualmente = true;
            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                validarCompletadoDescripcion();
                if (codigoSesion && seccionesCompletadasLocal.descripcion) {
                    guardarSeccion('descripcion');
                }
            }, 1500);
        });
    }
}

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
        validarCompletadoDescripcion();
        if (codigoSesion) {
            guardarSeccion('descripcion');
        }
        mostrarNotificacion('Descripción limpiada', 'info');
    }
}

// =====================================================
// GUARDAR SECCIÓN
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
            const fotosData = {};
            const fotosExistentes = sesionActual?.datos?.fotos || {};
            
            for (const foto of FOTOS_CONFIG) {
                const input = document.getElementById(foto.id);
                const file = input?.files?.[0];
                
                if (file && file.size > 0) {
                    if (file.size <= 5 * 1024 * 1024) {
                        fotosData[foto.campo] = await fileToBase64(file);
                    } else {
                        fotosData[foto.campo] = fotosExistentes[foto.campo] || null;
                    }
                } else {
                    const uploadDiv = document.getElementById(`upload-${foto.id}`);
                    if (uploadDiv && uploadDiv.classList.contains('has-image')) {
                        fotosData[foto.campo] = fotosExistentes[foto.campo] || null;
                    } else {
                        fotosData[foto.campo] = null;
                    }
                }
            }
            datos = fotosData;
            break;
            
        case 'descripcion':
            let audioUrl = audioCloudinaryUrl;
            if (audioBlob) {
                mostrarNotificacion('Subiendo audio a Cloudinary...', 'info');
                try {
                    audioUrl = await subirAudioCloudinary(audioBlob);
                    audioCloudinaryUrl = audioUrl;
                    mostrarNotificacion('✅ Audio subido correctamente', 'success');
                } catch (error) {
                    logger.error('Error subiendo audio:', error);
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
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/guardar-seccion`, {
            method: 'POST',
            body: JSON.stringify({ 
                codigo: codigoSesion, 
                seccion: seccion, 
                datos: datos, 
                usuario_id: userInfo?.id, 
                usuario_nombre: userInfo?.nombre 
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al guardar');
        }
        
        const data = await response.json();
        sesionActual = data.sesion;
        
        // Actualizar estado local con lo que viene del servidor
        if (sesionActual.secciones_completadas) {
            seccionesCompletadasLocal = { ...sesionActual.secciones_completadas };
            actualizarBotonFinalizar();
        }
        
        const guardadoIndicator = document.getElementById(`guardado${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
        if (guardadoIndicator) {
            guardadoIndicator.style.display = 'flex';
            setTimeout(() => guardadoIndicator.style.display = 'none', 1500);
        }
        
        if (seccion === 'fotos') {
            for (const foto of FOTOS_CONFIG) {
                const input = document.getElementById(foto.id);
                if (input) {
                    input.value = '';
                    delete fotosSubidasLocal[foto.campo];
                }
            }
            validarCompletadoFotos();
        }
        
        if (seccion === 'descripcion' && audioBlob) {
            audioBlob = null;
            audioChunks = [];
            if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
            audioStatus.textContent = 'Descripción guardada';
            validarCompletadoDescripcion();
        }
        
        logger.info(`✅ Sección ${seccion} guardada correctamente`);
        
    } catch (error) {
        logger.error(`Error guardando ${seccion}:`, error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = `<i class="fas fa-save"></i> Guardar ${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`;
        }
    }
}

// =====================================================
// FINALIZAR SESIÓN
// =====================================================
async function finalizarSesion() {
    if (!codigoSesion) return;
    
    // Verificar que todas las secciones estén completas
    if (!seccionesCompletadasLocal.cliente || !seccionesCompletadasLocal.vehiculo || 
        !seccionesCompletadasLocal.fotos || !seccionesCompletadasLocal.descripcion) {
        mostrarNotificacion('Completa todas las secciones antes de finalizar', 'warning');
        return;
    }
    
    if (!confirm('¿Finalizar recepción? Los datos se guardarán permanentemente.')) return;
    
    try {
        // Primero guardar todas las secciones pendientes
        if (!seccionesCompletadasLocal.cliente) await guardarSeccion('cliente');
        if (!seccionesCompletadasLocal.vehiculo) await guardarSeccion('vehiculo');
        if (!seccionesCompletadasLocal.fotos) await guardarSeccion('fotos');
        if (!seccionesCompletadasLocal.descripcion) await guardarSeccion('descripcion');
        
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/finalizar-sesion`, {
            method: 'POST',
            body: JSON.stringify({ 
                codigo: codigoSesion, 
                datos: sesionActual?.datos 
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al finalizar');
        }
        
        const data = await response.json();
        mostrarCodigoGenerado(data.codigo, obtenerDatosFormulario());
        limpiarSesionCompleta();
        mostrarNotificacion('Recepción finalizada', 'success');
        if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
        cargarRecepciones();
        cargarSesionesActivas();
        
    } catch (error) {
        logger.error('Error finalizando sesión:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function limpiarSesionCompleta() {
    detenerPolling();
    detenerKeepAlive();
    codigoSesion = null;
    sesionActual = null;
    audioCloudinaryUrl = null;
    fotosSubidasLocal = {};
    seccionesCompletadasLocal = {
        cliente: false,
        vehiculo: false,
        fotos: false,
        descripcion: false
    };
    localStorage.removeItem('sesion_actual');
    
    if (sessionPanel) sessionPanel.style.display = 'none';
    if (colaboradoresPanel) colaboradoresPanel.style.display = 'none';
    if (recepcionForm) recepcionForm.style.display = 'none';
    if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
    
    // Limpiar formulario
    const inputs = document.querySelectorAll('#recepcionForm input, #recepcionForm textarea');
    inputs.forEach(input => { if (input.id !== 'clienteLatitud' && input.id !== 'clienteLongitud') input.value = ''; });
    
    const photoUploads = document.querySelectorAll('.photo-upload');
    photoUploads.forEach(upload => {
        const input = upload.querySelector('input[type="file"]');
        const preview = upload.querySelector('.upload-preview');
        const removeBtn = upload.querySelector('.remove-photo');
        if (input) input.value = '';
        if (preview) preview.style.backgroundImage = '';
        upload.classList.remove('has-image');
        if (removeBtn) removeBtn.style.display = 'none';
    });
    
    if (audioPreview) {
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (audioStatus) audioStatus.textContent = '';
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
}

function mostrarConfirmacionCancelar() {
    if (confirm('¿Cancelar recepción? Se perderán todos los datos no guardados.')) {
        if (codigoSesion) {
            fetchWithToken(`${API_URL}/jefe-operativo/cancelar-sesion`, {
                method: 'DELETE',
                body: JSON.stringify({ codigo: codigoSesion })
            }).catch(console.error);
        }
        limpiarSesionCompleta();
        mostrarNotificacion('Recepción cancelada', 'success');
        if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
    }
}

function iniciarKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(async () => {
        if (codigoSesion) {
            try {
                await fetchWithToken(`${API_URL}/jefe-operativo/ping-sesion/${codigoSesion}`, { method: 'GET' });
            } catch (error) {}
        }
    }, 60000);
}

function detenerKeepAlive() {
    if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
}

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    // Polling cada 5 segundos en lugar de 3 para menos carga
    pollingInterval = setInterval(() => { if (codigoSesion) cargarDatosSesionLigero(); }, 5000);
}

function detenerPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

// Polling ligero - solo actualiza estado sin sobrescribir inputs activos
async function cargarDatosSesionLigero() {
    if (!codigoSesion || actualizando) return;
    
    // No actualizar si el usuario está editando
    if (camposEnEdicion.cliente || camposEnEdicion.vehiculo || camposEnEdicion.descripcion) {
        return;
    }
    
    actualizando = true;
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
        if (!response.ok) return;
        
        const data = await response.json();
        if (!data.sesion || data.sesion.estado === 'finalizada') {
            limpiarSesionCompleta();
            return;
        }
        
        const nuevosDatos = data.sesion.datos;
        const nuevasCompletadas = data.sesion.secciones_completadas;
        
        // Solo actualizar secciones que no están siendo editadas
        if (!camposEnEdicion.cliente && nuevosDatos.cliente) {
            const clienteNombre = document.getElementById('clienteNombre');
            const clienteTelefono = document.getElementById('clienteTelefono');
            const clienteUbicacion = document.getElementById('clienteUbicacion');
            
            if (clienteNombre && clienteNombre.value !== nuevosDatos.cliente.nombre && nuevosDatos.cliente.nombre) {
                clienteNombre.value = nuevosDatos.cliente.nombre;
            }
            if (clienteTelefono && clienteTelefono.value !== nuevosDatos.cliente.telefono && nuevosDatos.cliente.telefono) {
                clienteTelefono.value = nuevosDatos.cliente.telefono;
            }
            if (clienteUbicacion && clienteUbicacion.value !== nuevosDatos.cliente.ubicacion && nuevosDatos.cliente.ubicacion) {
                clienteUbicacion.value = nuevosDatos.cliente.ubicacion;
            }
        }
        
        if (!camposEnEdicion.vehiculo && nuevosDatos.vehiculo) {
            const vehiculoPlaca = document.getElementById('vehiculoPlaca');
            const vehiculoMarca = document.getElementById('vehiculoMarca');
            const vehiculoModelo = document.getElementById('vehiculoModelo');
            
            if (vehiculoPlaca && vehiculoPlaca.value !== nuevosDatos.vehiculo.placa && nuevosDatos.vehiculo.placa) {
                vehiculoPlaca.value = nuevosDatos.vehiculo.placa;
            }
            if (vehiculoMarca && vehiculoMarca.value !== nuevosDatos.vehiculo.marca && nuevosDatos.vehiculo.marca) {
                vehiculoMarca.value = nuevosDatos.vehiculo.marca;
            }
            if (vehiculoModelo && vehiculoModelo.value !== nuevosDatos.vehiculo.modelo && nuevosDatos.vehiculo.modelo) {
                vehiculoModelo.value = nuevosDatos.vehiculo.modelo;
            }
        }
        
        if (!camposEnEdicion.descripcion && nuevosDatos.descripcion && !descripcionModificadaManualmente) {
            if (descripcionProblema && descripcionProblema.value !== nuevosDatos.descripcion.texto && nuevosDatos.descripcion.texto) {
                descripcionProblema.value = nuevosDatos.descripcion.texto;
                descripcionOriginal = nuevosDatos.descripcion.texto;
            }
        }
        
        // Actualizar estado de completado si cambió
        if (nuevasCompletadas) {
            let huboCambio = false;
            if (seccionesCompletadasLocal.cliente !== nuevasCompletadas.cliente) {
                seccionesCompletadasLocal.cliente = nuevasCompletadas.cliente;
                actualizarEstadoVisualSeccion('cliente', nuevasCompletadas.cliente);
                huboCambio = true;
            }
            if (seccionesCompletadasLocal.vehiculo !== nuevasCompletadas.vehiculo) {
                seccionesCompletadasLocal.vehiculo = nuevasCompletadas.vehiculo;
                actualizarEstadoVisualSeccion('vehiculo', nuevasCompletadas.vehiculo);
                huboCambio = true;
            }
            if (seccionesCompletadasLocal.descripcion !== nuevasCompletadas.descripcion) {
                seccionesCompletadasLocal.descripcion = nuevasCompletadas.descripcion;
                actualizarEstadoVisualSeccion('descripcion', nuevasCompletadas.descripcion);
                huboCambio = true;
            }
            if (huboCambio) {
                actualizarBotonFinalizar();
            }
        }
        
        sesionActual = data.sesion;
        
    } catch (error) {
        logger.error('Error en polling ligero:', error);
    } finally {
        actualizando = false;
    }
}

function mostrarModalCodigo(codigo) {
    const modal = document.getElementById('codigoModal');
    const codigoSesionModal = document.getElementById('codigoSesionModal');
    if (!modal) return;
    if (codigoSesionModal) codigoSesionModal.textContent = codigo;
    modal.classList.add('show');
    
    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
        if (modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    }, 5000);
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
            <div class="resumen-item"><span>Fecha:</span><span>${new Date().toLocaleDateString()}</span></div>
        `;
    }
    modal.classList.add('show');
}

function obtenerDatosFormulario() {
    return {
        cliente: {
            nombre: document.getElementById('clienteNombre')?.value || '',
            ubicacion: document.getElementById('clienteUbicacion')?.value || ''
        },
        vehiculo: {
            placa: document.getElementById('vehiculoPlaca')?.value.toUpperCase() || '',
            marca: document.getElementById('vehiculoMarca')?.value || '',
            modelo: document.getElementById('vehiculoModelo')?.value || ''
        }
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const iconos = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast && document.body.contains(toast)) toast.remove();
    }, 3000);
}

// =====================================================
// FUNCIONES DE LEAFLET (UBICACIÓN) - VERSIÓN SIMPLIFICADA
// =====================================================
function setupModalUbicacionLeaflet() {
    // Implementación de Leaflet - mantener la original
    console.log('Setup modal ubicación Leaflet');
}

// =====================================================
// FUNCIONES DE DETALLE Y EDICIÓN DE RECEPCIONES
// =====================================================
async function verDetalleRecepcion(id) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, { method: 'GET' });
        if (response.ok) {
            const data = await response.json();
            alert(`Detalle de recepción:\nCódigo: ${data.detalle.codigo_unico}\nCliente: ${data.detalle.cliente_nombre}\nVehículo: ${data.detalle.marca} ${data.detalle.modelo}\nEstado: ${data.detalle.estado_global}`);
        } else {
            mostrarNotificacion('Error cargando detalle', 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error cargando detalle', 'error');
    }
}

async function editarRecepcion(id) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, { method: 'GET' });
        if (response.ok) {
            const data = await response.json();
            mostrarNotificacion(`Editando recepción ${data.detalle.codigo_unico}`, 'info');
        }
    } catch (error) {
        mostrarNotificacion('Error cargando datos para edición', 'error');
    }
}

function confirmarEliminarRecepcion(id) {
    if (confirm('¿Eliminar esta recepción? Esta acción no se puede deshacer.')) {
        eliminarRecepcion(id);
    }
}

async function eliminarRecepcion(id) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/eliminar-recepcion/${id}`, { method: 'DELETE' });
        if (response.ok) {
            mostrarNotificacion('Recepción eliminada', 'success');
            cargarRecepciones();
        }
    } catch (error) {
        mostrarNotificacion('Error eliminando recepción', 'error');
    }
}

// =====================================================
// EXPORTAR FUNCIONES GLOBALES
// =====================================================
window.unirseSesionConCodigo = unirseSesionConCodigo;
window.verDetalleRecepcion = verDetalleRecepcion;
window.editarRecepcion = editarRecepcion;
window.confirmarEliminarRecepcion = confirmarEliminarRecepcion;
window.cerrarModal = () => document.getElementById('codigoModal')?.classList.remove('show');
window.cerrarModalOrden = () => document.getElementById('codigoOrdenModal')?.classList.remove('show');
window.imprimirCodigo = () => {
    const codigo = document.getElementById('codigoGenerado')?.textContent || 'OT-0000';
    const ventana = window.open('', '_blank');
    ventana.document.write(`<html><head><title>Código de Trabajo</title><style>body{font-family:Arial;padding:30px;text-align:center;}.codigo{font-size:32px;color:#C1121F;margin:20px;font-weight:bold;}</style></head><body><h1>FURIA MOTOR COMPANY</h1><h2>Código de Trabajo</h2><div class="codigo">${codigo}</div><p>Fecha: ${new Date().toLocaleString()}</p></body></html>`);
    ventana.document.close();
    ventana.print();
};
window.logout = () => {
    detenerPolling();
    detenerKeepAlive();
    if (sesionesPolling) clearInterval(sesionesPolling);
    localStorage.clear();
    window.location.href = `${window.API_BASE_URL}/`;
};

console.log('✅ recepcion.js cargado - Versión estable');