// =====================================================
// CONFIGURACIÓN DE API
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
const CLOUDINARY_UPLOAD_PRESET = 'furia_motor_unsigned';

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
let audioCloudinaryUrl = null;

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

// Estado de completado local
let seccionesCompletadasLocal = {
    cliente: false,
    vehiculo: false,
    fotos: false,
    descripcion: false
};

// Fotos subidas localmente
let fotosSubidasLocal = {};

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
        localStorage.clear();
        window.location.href = `${window.API_BASE_URL}/`;
        throw new Error('Sesión expirada');
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
        console.log('⏳ Botón deshabilitado - Faltan:', faltantes);
    } else {
        btnFinalizar.title = 'Finalizar recepción';
        console.log('✅ Botón habilitado - Todas las secciones completas');
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
// VALIDACIONES EN TIEMPO REAL
// =====================================================
function validarCompletadoCliente() {
    const nombre = document.getElementById('clienteNombre')?.value.trim();
    const telefono = document.getElementById('clienteTelefono')?.value.trim();
    const completada = !!(nombre && telefono);
    
    if (seccionesCompletadasLocal.cliente !== completada) {
        seccionesCompletadasLocal.cliente = completada;
        actualizarEstadoVisualSeccion('cliente', completada);
        actualizarBotonFinalizar();
        
        if (completada && codigoSesion && !camposEnEdicion.cliente) {
            guardarSeccion('cliente');
        }
    }
    return completada;
}

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

function validarCompletadoFotos() {
    let fotosCompletas = 0;
    
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        if (uploadDiv && uploadDiv.classList.contains('has-image')) {
            fotosCompletas++;
        }
    }
    
    const completada = fotosCompletas === 7;
    
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

function validarCompletadoDescripcion() {
    const texto = descripcionProblema?.value?.trim();
    const completada = !!(texto && texto.length > 0);
    
    if (seccionesCompletadasLocal.descripcion !== completada) {
        seccionesCompletadasLocal.descripcion = completada;
        actualizarEstadoVisualSeccion('descripcion', completada);
        actualizarBotonFinalizar();
    }
    return completada;
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
    console.log('📡 API_BASE_URL:', window.API_BASE_URL);
    console.log('📡 API_URL:', API_URL);
    
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
// GENERAR FOTOS
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

async function subirFotoCloudinary(file, carpeta, campo) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', `furia_motor/recepcion/${carpeta}`);
        
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
        
        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                resolve(data.secure_url);
            } else {
                reject(new Error(data.error?.message || 'Error subiendo foto'));
            }
        })
        .catch(reject);
    });
}

function procesarFoto(input, foto) {
    const file = input.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        mostrarNotificacion(`La foto ${foto.label} no debe superar los 5MB`, 'warning');
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
        uploadDiv.dataset.objectUrl = objectUrl;
        if (removeBtn) removeBtn.style.display = 'flex';
        
        mostrarNotificacion(`Subiendo ${foto.label}...`, 'info');
        subirFotoCloudinary(file, codigoSesion || 'temp', foto.campo)
            .then(url => {
                uploadDiv.dataset.cloudinaryUrl = url;
                fotosSubidasLocal[foto.campo] = url;
                mostrarNotificacion(`✅ ${foto.label} subida`, 'success');
                validarCompletadoFotos();
                if (codigoSesion && seccionesCompletadasLocal.fotos) {
                    guardarSeccion('fotos');
                }
            })
            .catch(error => {
                console.error('Error subiendo foto:', error);
                mostrarNotificacion(`Error al subir ${foto.label}`, 'error');
                preview.style.backgroundImage = '';
                uploadDiv.classList.remove('has-image');
                if (removeBtn) removeBtn.style.display = 'none';
            });
    }
}

function setupPhotoUploads() {
    for (const foto of FOTOS_CONFIG) {
        const input = document.getElementById(foto.id);
        if (input) {
            input.addEventListener('change', () => procesarFoto(input, foto));
        }
        
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        const removeBtn = uploadDiv?.querySelector('.remove-photo');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const inputEl = document.getElementById(foto.id);
                if (inputEl) inputEl.value = '';
                const preview = uploadDiv.querySelector('.upload-preview');
                if (preview) preview.style.backgroundImage = '';
                uploadDiv.classList.remove('has-image');
                removeBtn.style.display = 'none';
                delete uploadDiv.dataset.cloudinaryUrl;
                delete fotosSubidasLocal[foto.campo];
                if (uploadDiv.dataset.objectUrl) {
                    URL.revokeObjectURL(uploadDiv.dataset.objectUrl);
                    delete uploadDiv.dataset.objectUrl;
                }
                validarCompletadoFotos();
                if (codigoSesion) guardarSeccion('fotos');
            });
        }
    }
}

// =====================================================
// FUNCIONES DE AUDIO
// =====================================================
function setupAudioRecording() {
    if (!btnGrabarAudio) return;
    btnGrabarAudio.addEventListener('click', async () => {
        if (!isRecording) await startRecording();
        else stopRecording();
    });
    if (btnEliminarAudio) btnEliminarAudio.addEventListener('click', eliminarGrabacion);
}

async function subirAudioCloudinary(audioBlob, carpeta) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', `furia_motor/audios/${carpeta}`);
        formData.append('resource_type', 'video');
        
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
        
        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                resolve(data.secure_url);
            } else {
                reject(new Error(data.error?.message || 'Error subiendo audio'));
            }
        })
        .catch(reject);
    });
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        audioBlob = null;
        
        mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
        mediaRecorder.onstop = async () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPreview.src = audioUrl;
            audioPreview.style.display = 'block';
            audioStatus.textContent = 'Audio grabado - Subiendo...';
            
            mostrarNotificacion('Subiendo audio...', 'info');
            try {
                const cloudinaryUrl = await subirAudioCloudinary(audioBlob, codigoSesion || 'temp');
                audioCloudinaryUrl = cloudinaryUrl;
                audioStatus.textContent = 'Audio guardado';
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                mostrarNotificacion('✅ Audio subido', 'success');
                
                if (codigoSesion && descripcionProblema.value.trim()) {
                    await guardarSeccion('descripcion');
                }
                validarCompletadoDescripcion();
            } catch (error) {
                console.error('Error subiendo audio:', error);
                audioStatus.textContent = 'Error al subir audio';
                mostrarNotificacion('Error al subir audio', 'error');
            }
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
    audioBlob = null;
    audioChunks = [];
    audioCloudinaryUrl = null;
    if (audioPreview) {
        if (audioPreview.src && audioPreview.src.startsWith('blob:')) URL.revokeObjectURL(audioPreview.src);
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    audioStatus.textContent = 'Grabación eliminada';
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
    isRecording = false;
    
    if (codigoSesion && descripcionProblema.value.trim()) {
        guardarSeccion('descripcion');
    }
    validarCompletadoDescripcion();
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
            for (const foto of FOTOS_CONFIG) {
                const uploadDiv = document.getElementById(`upload-${foto.id}`);
                const url = uploadDiv?.dataset.cloudinaryUrl;
                fotosData[foto.campo] = url || null;
            }
            datos = fotosData;
            break;
        case 'descripcion':
            datos = {
                texto: descripcionProblema?.value || '',
                audio_url: audioCloudinaryUrl
            };
            descripcionOriginal = descripcionProblema?.value || '';
            break;
    }
    
    const btnGuardar = document.querySelector(`.btn-guardar-seccion[data-seccion="${seccion}"]`);
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
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
        
        const data = await response.json();
        
        if (data.success) {
            sesionActual = data.sesion;
            if (data.sesion.secciones_completadas) {
                seccionesCompletadasLocal = { ...data.sesion.secciones_completadas };
                actualizarBotonFinalizar();
            }
            
            const guardadoSpan = document.getElementById(`guardado${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
            if (guardadoSpan) {
                guardadoSpan.style.display = 'flex';
                setTimeout(() => guardadoSpan.style.display = 'none', 1500);
            }
            
            // 🔥 FORZAR ACTUALIZACIÓN DEL ESTADO LOCAL
            if (seccion === 'cliente') validarCompletadoCliente();
            if (seccion === 'vehiculo') validarCompletadoVehiculo();
            if (seccion === 'fotos') validarCompletadoFotos();
            if (seccion === 'descripcion') validarCompletadoDescripcion();
        }
    } catch (error) {
        logger.error('Error guardando:', error);
        mostrarNotificacion('Error al guardar', 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = `<i class="fas fa-save"></i> Guardar`;
        }
    }
}

// =====================================================
// SESIONES COLABORATIVAS
// =====================================================
async function iniciarSesion() {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/iniciar-sesion`, { method: 'POST' });
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
    
    cargarDatosSesionInicial();
    iniciarPolling();
    iniciarKeepAlive();
}

async function cargarDatosSesionInicial() {
    if (!codigoSesion) return;
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
        const data = await response.json();
        
        if (!data.sesion || data.sesion.estado === 'finalizada') {
            limpiarSesionCompleta();
            return;
        }
        
        sesionActual = data.sesion;
        const datos = sesionActual.datos;
        
        // Cargar cliente
        if (datos.cliente) {
            const nombre = document.getElementById('clienteNombre');
            const telefono = document.getElementById('clienteTelefono');
            const ubicacion = document.getElementById('clienteUbicacion');
            const latitud = document.getElementById('clienteLatitud');
            const longitud = document.getElementById('clienteLongitud');
            
            if (nombre) nombre.value = datos.cliente.nombre || '';
            if (telefono) telefono.value = datos.cliente.telefono || '';
            if (ubicacion) ubicacion.value = datos.cliente.ubicacion || '';
            if (latitud) latitud.value = datos.cliente.latitud || '';
            if (longitud) longitud.value = datos.cliente.longitud || '';
            validarCompletadoCliente();
        }
        
        // Cargar vehículo
        if (datos.vehiculo) {
            const placa = document.getElementById('vehiculoPlaca');
            const marca = document.getElementById('vehiculoMarca');
            const modelo = document.getElementById('vehiculoModelo');
            const anio = document.getElementById('vehiculoAnio');
            const kilometraje = document.getElementById('vehiculoKilometraje');
            
            if (placa) placa.value = datos.vehiculo.placa || '';
            if (marca) marca.value = datos.vehiculo.marca || '';
            if (modelo) modelo.value = datos.vehiculo.modelo || '';
            if (anio) anio.value = datos.vehiculo.anio || '';
            if (kilometraje) kilometraje.value = datos.vehiculo.kilometraje || '';
            validarCompletadoVehiculo();
        }
        
        // Cargar fotos
        if (datos.fotos) {
            for (const foto of FOTOS_CONFIG) {
                const url = datos.fotos[foto.campo];
                if (url && url !== 'null') {
                    const uploadDiv = document.getElementById(`upload-${foto.id}`);
                    const preview = uploadDiv?.querySelector('.upload-preview');
                    if (preview) {
                        preview.style.backgroundImage = `url('${url}')`;
                        preview.style.backgroundSize = 'cover';
                        preview.style.backgroundPosition = 'center';
                        uploadDiv.classList.add('has-image');
                        uploadDiv.dataset.cloudinaryUrl = url;
                        const removeBtn = uploadDiv.querySelector('.remove-photo');
                        if (removeBtn) removeBtn.style.display = 'flex';
                    }
                }
            }
            validarCompletadoFotos();
        }
        
        // Cargar descripción
        if (datos.descripcion) {
            if (descripcionProblema) descripcionProblema.value = datos.descripcion.texto || '';
            if (datos.descripcion.audio_url) {
                audioCloudinaryUrl = datos.descripcion.audio_url;
                if (audioPreview) {
                    audioPreview.src = audioCloudinaryUrl;
                    audioPreview.style.display = 'block';
                }
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                if (audioStatus) audioStatus.textContent = 'Audio disponible';
            }
            validarCompletadoDescripcion();
        }
        
        // Colaboradores
        if (sesionActual.colaboradores_nombres) {
            const count = sesionActual.colaboradores_nombres.length;
            if (colaboradoresCount) colaboradoresCount.textContent = count;
            if (colaboradoresCountDetail) colaboradoresCountDetail.textContent = count;
            if (colaboradoresList) {
                colaboradoresList.innerHTML = sesionActual.colaboradores_nombres.map(n => 
                    `<div class="colaborador"><i class="fas fa-user"></i><span>${escapeHtml(n)}</span>${n === userInfo?.nombre ? '<span class="badge-you"> (Tú)</span>' : ''}</div>`
                ).join('');
            }
        }
        
        if (sesionActual.secciones_completadas) {
            seccionesCompletadasLocal = { ...sesionActual.secciones_completadas };
            actualizarBotonFinalizar();
        }
        
    } catch (error) {
        logger.error('Error cargando datos iniciales:', error);
    }
}

async function recuperarSesionActiva() {
    const sesionGuardada = localStorage.getItem('sesion_actual');
    if (!sesionGuardada) return;
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${sesionGuardada}`, { method: 'GET' });
        const data = await response.json();
        
        if (data.sesion && data.sesion.estado === 'activa' && data.sesion.colaboradores?.includes(userInfo?.id)) {
            codigoSesion = sesionGuardada;
            sesionActual = data.sesion;
            activarSesion();
            mostrarNotificacion(`Sesión recuperada: ${codigoSesion}`, 'success');
        } else {
            localStorage.removeItem('sesion_actual');
        }
    } catch (error) {
        localStorage.removeItem('sesion_actual');
    }
}

async function finalizarSesion() {
    if (!codigoSesion) return;
    
    // 🔥 VERIFICAR NUEVAMENTE ANTES DE FINALIZAR
    validarCompletadoCliente();
    validarCompletadoVehiculo();
    validarCompletadoFotos();
    validarCompletadoDescripcion();
    
    if (!seccionesCompletadasLocal.cliente || !seccionesCompletadasLocal.vehiculo || 
        !seccionesCompletadasLocal.fotos || !seccionesCompletadasLocal.descripcion) {
        mostrarNotificacion('Completa todas las secciones antes de finalizar', 'warning');
        return;
    }
    
    if (!confirm('¿Finalizar recepción? Los datos se guardarán permanentemente.')) return;
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/finalizar-sesion`, {
            method: 'POST',
            body: JSON.stringify({ codigo: codigoSesion, datos: sesionActual?.datos })
        });
        
        const data = await response.json();
        if (data.success) {
            mostrarCodigoGenerado(data.codigo);
            limpiarSesionCompleta();
            mostrarNotificacion('Recepción finalizada', 'success');
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
            await cargarRecepciones();
        }
    } catch (error) {
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
    inputs.forEach(input => { 
        if (input.id !== 'clienteLatitud' && input.id !== 'clienteLongitud') {
            input.value = '';
        }
    });
    
    // Limpiar fotos
    document.querySelectorAll('.photo-upload').forEach(upload => {
        upload.classList.remove('has-image');
        const preview = upload.querySelector('.upload-preview');
        if (preview) preview.style.backgroundImage = '';
        const removeBtn = upload.querySelector('.remove-photo');
        if (removeBtn) removeBtn.style.display = 'none';
        delete upload.dataset.cloudinaryUrl;
        if (upload.dataset.objectUrl) {
            URL.revokeObjectURL(upload.dataset.objectUrl);
            delete upload.dataset.objectUrl;
        }
    });
    
    // Limpiar audio
    if (audioPreview) {
        if (audioPreview.src && audioPreview.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioPreview.src);
        }
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (audioStatus) audioStatus.textContent = '';
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    if (btnGrabarAudio) {
        btnGrabarAudio.classList.remove('recording');
        btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
    }
    
    actualizarBotonFinalizar();
    console.log('✅ Sesión limpiada correctamente');
}

function mostrarConfirmacionCancelar() {
    if (confirm('¿Cancelar recepción? Se perderán todos los datos.')) {
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

// =====================================================
// POLLING
// =====================================================
function iniciarPollingSesiones() {
    if (sesionesPolling) clearInterval(sesionesPolling);
    sesionesPolling = setInterval(cargarSesionesActivas, 5000);
}

async function cargarSesionesActivas() {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/sesiones-activas`, { method: 'GET' });
        const data = await response.json();
        
        if (data.sesiones) {
            const sesionesActivasFiltradas = data.sesiones.filter(s => s.estado === 'activa');
            renderSesionesActivas(sesionesActivasFiltradas);
        }
    } catch (error) {
        console.error('Error cargando sesiones activas:', error);
    }
}

function renderSesionesActivas(sesiones) {
    if (!sesionesList) return;
    const activas = sesiones.filter(s => s.estado === 'activa');
    if (sesionesCount) sesionesCount.textContent = activas.length;
    
    if (activas.length === 0) {
        sesionesList.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No hay sesiones activas</p></div>';
        return;
    }
    
    sesionesList.innerHTML = activas.map(s => {
        const colaboradoresCount = s.colaboradores_nombres?.length || 1;
        const estaCompleta = colaboradoresCount >= 2;
        const esActiva = codigoSesion === s.codigo;
        
        return `
            <div class="sesion-item ${esActiva ? 'active' : ''} ${estaCompleta ? 'full' : ''}">
                <div class="sesion-info">
                    <span class="sesion-codigo">${s.codigo}</span>
                    <div class="sesion-colaboradores"><i class="fas fa-users"></i><span>${colaboradoresCount}/2</span></div>
                </div>
                <div class="sesion-actions">
                    ${!esActiva && !estaCompleta ? 
                        `<button class="btn-unirse-sesion" onclick="unirseSesionConCodigo('${s.codigo}')">Unirse</button>` : 
                        esActiva ? '<span class="badge-active">Activa</span>' : '<span class="badge-full">Completa</span>'}
                </div>
            </div>
        `;
    }).join('');
}

async function unirseSesionConCodigo(codigo) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/unirse-sesion`, {
            method: 'POST',
            body: JSON.stringify({ codigo })
        });
        const data = await response.json();
        
        if (data.success) {
            codigoSesion = codigo;
            sesionActual = data.sesion;
            localStorage.setItem('sesion_actual', codigo);
            activarSesion();
            mostrarNotificacion(`Te has unido a ${codigoSesion}`, 'success');
        }
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        if (codigoSesion && !camposEnEdicion.cliente && !camposEnEdicion.vehiculo && !camposEnEdicion.descripcion) {
            cargarDatosSesionLigero();
        }
    }, 5000);
}

function detenerPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
}

function iniciarKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(() => {
        if (codigoSesion) {
            fetchWithToken(`${API_URL}/jefe-operativo/ping-sesion/${codigoSesion}`, { method: 'GET' }).catch(() => {});
        }
    }, 60000);
}

function detenerKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
}

async function cargarDatosSesionLigero() {
    if (!codigoSesion || actualizando) return;
    
    actualizando = true;
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
        const data = await response.json();
        
        if (!data.sesion || data.sesion.estado === 'finalizada') {
            limpiarSesionCompleta();
            return;
        }
        
        const nuevosDatos = data.sesion.datos;
        const nuevasSecciones = data.sesion.secciones_completadas;
        
        // Actualizar estado de completado desde el servidor
        if (nuevasSecciones) {
            let cambio = false;
            if (seccionesCompletadasLocal.cliente !== nuevasSecciones.cliente) {
                seccionesCompletadasLocal.cliente = nuevasSecciones.cliente;
                actualizarEstadoVisualSeccion('cliente', nuevasSecciones.cliente);
                cambio = true;
            }
            if (seccionesCompletadasLocal.vehiculo !== nuevasSecciones.vehiculo) {
                seccionesCompletadasLocal.vehiculo = nuevasSecciones.vehiculo;
                actualizarEstadoVisualSeccion('vehiculo', nuevasSecciones.vehiculo);
                cambio = true;
            }
            if (seccionesCompletadasLocal.fotos !== nuevasSecciones.fotos) {
                seccionesCompletadasLocal.fotos = nuevasSecciones.fotos;
                cambio = true;
            }
            if (seccionesCompletadasLocal.descripcion !== nuevasSecciones.descripcion) {
                seccionesCompletadasLocal.descripcion = nuevasSecciones.descripcion;
                actualizarEstadoVisualSeccion('descripcion', nuevasSecciones.descripcion);
                cambio = true;
            }
            if (cambio) actualizarBotonFinalizar();
        }
        
        sesionActual = data.sesion;
        
    } catch (error) {
        logger.error('Error en polling ligero:', error);
    } finally {
        actualizando = false;
    }
}

// =====================================================
// RECEPCIONES GUARDADAS
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
    const listDiv = document.getElementById('recepcionesList');
    if (!listDiv) return;
    
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
    
    if (filtradas.length === 0) {
        listDiv.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>No hay recepciones</p></div>';
        return;
    }
    
    const paginadas = filtradas.slice(0, 10);
    
    listDiv.innerHTML = paginadas.map(rec => `
        <div class="recepcion-card estado-${rec.estado_global || 'EnRecepcion'}">
            <div class="recepcion-header">
                <span class="recepcion-codigo">${rec.codigo_unico || 'N/A'}</span>
                <span class="recepcion-estado ${rec.estado_global || 'EnRecepcion'}">${rec.estado_global || 'En Recepción'}</span>
                <span class="recepcion-fecha"><i class="far fa-calendar-alt"></i>${new Date(rec.fecha_ingreso).toLocaleDateString()}</span>
            </div>
            <div class="recepcion-info">
                <div><i class="fas fa-user"></i><strong>Cliente:</strong> ${escapeHtml(rec.cliente_nombre || 'N/A')}</div>
                <div><i class="fas fa-car"></i><strong>Vehículo:</strong> ${escapeHtml(rec.marca || '')} ${escapeHtml(rec.modelo || '')} (${rec.placa || 'N/A'})</div>
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
// LEAFLET MAPA
// =====================================================
function initLeafletMap() {
    if (leafletInicializado) return;
    
    const mapContainer = document.getElementById('leafletMapa');
    if (!mapContainer) return;
    
    mapCliente = L.map(mapContainer).setView([TALLER_LAT, TALLER_LNG], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapCliente);
    
    markerCliente = L.marker([TALLER_LAT, TALLER_LNG], { draggable: true });
    markerCliente.addTo(mapCliente);
    
    markerCliente.on('dragend', async (e) => {
        const pos = markerCliente.getLatLng();
        const direccion = await obtenerDireccion(pos.lat, pos.lng);
        ubicacionTemporal = { texto: direccion, lat: pos.lat, lng: pos.lng };
        actualizarInfoUbicacion();
    });
    
    mapCliente.on('click', async (e) => {
        markerCliente.setLatLng(e.latlng);
        const direccion = await obtenerDireccion(e.latlng.lat, e.latlng.lng);
        ubicacionTemporal = { texto: direccion, lat: e.latlng.lat, lng: e.latlng.lng };
        actualizarInfoUbicacion();
    });
    
    leafletInicializado = true;
}

async function obtenerDireccion(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await response.json();
        return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

function actualizarInfoUbicacion() {
    const infoDiv = document.getElementById('ubicacionInfoLeaflet');
    const textoSpan = document.getElementById('ubicacionSeleccionadaTextoLeaflet');
    const btnConfirmar = document.getElementById('btnConfirmarUbicacionLeaflet');
    
    if (infoDiv && textoSpan) {
        textoSpan.textContent = ubicacionTemporal.texto;
        infoDiv.style.display = 'block';
        if (btnConfirmar) btnConfirmar.disabled = false;
    }
}

function abrirModalLeaflet() {
    const modal = document.getElementById('modalUbicacionLeaflet');
    if (!modal) return;
    
    ubicacionTemporal = { texto: '', lat: null, lng: null };
    
    const infoDiv = document.getElementById('ubicacionInfoLeaflet');
    if (infoDiv) infoDiv.style.display = 'none';
    
    const btnConfirmar = document.getElementById('btnConfirmarUbicacionLeaflet');
    if (btnConfirmar) btnConfirmar.disabled = true;
    
    if (!leafletInicializado) {
        initLeafletMap();
    }
    
    setTimeout(() => {
        if (mapCliente) mapCliente.invalidateSize();
    }, 100);
    
    modal.classList.add('show');
}

function cerrarModalLeaflet() {
    const modal = document.getElementById('modalUbicacionLeaflet');
    if (modal) modal.classList.remove('show');
}

function confirmarUbicacionLeaflet() {
    if (!ubicacionTemporal.texto || !ubicacionTemporal.lat) {
        mostrarNotificacion('Selecciona una ubicación en el mapa', 'warning');
        return;
    }
    
    if (clienteUbicacionInput) clienteUbicacionInput.value = ubicacionTemporal.texto;
    if (clienteLatitudInput) clienteLatitudInput.value = ubicacionTemporal.lat;
    if (clienteLongitudInput) clienteLongitudInput.value = ubicacionTemporal.lng;
    
    cerrarModalLeaflet();
    validarCompletadoCliente();
    
    if (codigoSesion) {
        guardarSeccion('cliente');
        mostrarNotificacion('Ubicación guardada', 'success');
    }
}

async function buscarYMostrarLeaflet() {
    const searchInput = document.getElementById('modalBuscarUbicacionLeaflet');
    const query = searchInput?.value.trim();
    if (!query) return;
    
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const data = await response.json();
        
        if (data && data[0]) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            
            if (mapCliente) {
                mapCliente.setView([lat, lng], 15);
                markerCliente.setLatLng([lat, lng]);
                const direccion = await obtenerDireccion(lat, lng);
                ubicacionTemporal = { texto: direccion, lat, lng };
                actualizarInfoUbicacion();
            }
        } else {
            mostrarNotificacion('No se encontró la dirección', 'warning');
        }
    } catch (error) {
        console.error('Error buscando dirección:', error);
        mostrarNotificacion('Error al buscar', 'error');
    }
}

function setupModalUbicacionLeaflet() {
    if (!btnAbrirModalUbicacion) return;
    
    btnAbrirModalUbicacion.addEventListener('click', abrirModalLeaflet);
    
    const btnCerrar = document.getElementById('btnCerrarModalUbicacionLeaflet');
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarModalLeaflet);
    
    const btnCancelar = document.getElementById('btnCancelarUbicacionLeaflet');
    if (btnCancelar) btnCancelar.addEventListener('click', cerrarModalLeaflet);
    
    const btnConfirmar = document.getElementById('btnConfirmarUbicacionLeaflet');
    if (btnConfirmar) btnConfirmar.addEventListener('click', confirmarUbicacionLeaflet);
    
    const btnBuscar = document.getElementById('btnBuscarUbicacionLeaflet');
    if (btnBuscar) btnBuscar.addEventListener('click', buscarYMostrarLeaflet);
    
    const searchInput = document.getElementById('modalBuscarUbicacionLeaflet');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') buscarYMostrarLeaflet();
        });
    }
    
    const modal = document.getElementById('modalUbicacionLeaflet');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModalLeaflet();
        });
    }
}

// =====================================================
// FUNCIONES DE DETALLE Y EDICIÓN
// =====================================================
async function verDetalleRecepcion(id) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.detalle) {
            mostrarModalDetalle(data.detalle);
        } else {
            mostrarNotificacion('Error cargando detalle', 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error cargando detalle', 'error');
    }
}

function mostrarModalDetalle(detalle) {
    const modal = document.getElementById('modalDetalleRecepcion');
    const body = document.getElementById('detalleRecepcionBody');
    if (!modal || !body) return;
    
    body.innerHTML = `
        <div class="detalle-recepcion">
            <div class="detalle-seccion">
                <h4><i class="fas fa-info-circle"></i> Información General</h4>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Código:</span><span class="detalle-value">${escapeHtml(detalle.codigo_unico || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Fecha:</span><span class="detalle-value">${new Date(detalle.fecha_ingreso).toLocaleString()}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Estado:</span><span class="detalle-value">${escapeHtml(detalle.estado_global || 'En Recepción')}</span></div>
                </div>
            </div>
            <div class="detalle-seccion">
                <h4><i class="fas fa-user"></i> Cliente</h4>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Nombre:</span><span class="detalle-value">${escapeHtml(detalle.cliente_nombre || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Teléfono:</span><span class="detalle-value">${escapeHtml(detalle.cliente_telefono || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Ubicación:</span><span class="detalle-value">${escapeHtml(detalle.cliente_ubicacion || 'No especificada')}</span></div>
                </div>
            </div>
            <div class="detalle-seccion">
                <h4><i class="fas fa-car"></i> Vehículo</h4>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Placa:</span><span class="detalle-value">${escapeHtml(detalle.placa || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Marca:</span><span class="detalle-value">${escapeHtml(detalle.marca || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Modelo:</span><span class="detalle-value">${escapeHtml(detalle.modelo || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Año:</span><span class="detalle-value">${detalle.anio || 'N/A'}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Kilometraje:</span><span class="detalle-value">${detalle.kilometraje?.toLocaleString() || '0'} km</span></div>
                </div>
            </div>
            <div class="detalle-seccion">
                <h4><i class="fas fa-pencil-alt"></i> Descripción del Problema</h4>
                <div class="detalle-descripcion">${escapeHtml(detalle.transcripcion_problema || 'No se registró descripción')}</div>
                ${detalle.audio_url ? `<div class="detalle-audio"><audio controls src="${detalle.audio_url}"></audio></div>` : ''}
            </div>
        </div>
    `;
    modal.classList.add('show');
}

async function editarRecepcion(id) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.detalle) {
            const detalle = data.detalle;
            if (document.getElementById('clienteNombre')) document.getElementById('clienteNombre').value = detalle.cliente_nombre || '';
            if (document.getElementById('clienteTelefono')) document.getElementById('clienteTelefono').value = detalle.cliente_telefono || '';
            if (document.getElementById('clienteUbicacion')) document.getElementById('clienteUbicacion').value = detalle.cliente_ubicacion || '';
            if (document.getElementById('vehiculoPlaca')) document.getElementById('vehiculoPlaca').value = detalle.placa || '';
            if (document.getElementById('vehiculoMarca')) document.getElementById('vehiculoMarca').value = detalle.marca || '';
            if (document.getElementById('vehiculoModelo')) document.getElementById('vehiculoModelo').value = detalle.modelo || '';
            if (descripcionProblema) descripcionProblema.value = detalle.transcripcion_problema || '';
            
            modoEdicionRecepcion = true;
            recepcionEditandoId = id;
            mostrarNotificacion('Modo edición activado', 'info');
            
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
            if (sessionPanel) sessionPanel.style.display = 'flex';
            if (colaboradoresPanel) colaboradoresPanel.style.display = 'block';
            if (recepcionForm) recepcionForm.style.display = 'block';
            
            validarCompletadoCliente();
            validarCompletadoVehiculo();
            validarCompletadoDescripcion();
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
// FUNCIONES DE EVENTOS Y VALIDACIÓN
// =====================================================
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
                // Forzar validación después de guardar manualmente
                if (seccion === 'cliente') validarCompletadoCliente();
                if (seccion === 'vehiculo') validarCompletadoVehiculo();
                if (seccion === 'fotos') validarCompletadoFotos();
                if (seccion === 'descripcion') validarCompletadoDescripcion();
            }
        });
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
    const clienteInputs = ['clienteNombre', 'clienteTelefono'];
    clienteInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('focus', () => { camposEnEdicion.cliente = true; });
            input.addEventListener('blur', async () => {
                validarCompletadoCliente();
                camposEnEdicion.cliente = false;
                if (codigoSesion && seccionesCompletadasLocal.cliente) {
                    await guardarSeccion('cliente');
                }
            });
            input.addEventListener('input', () => {
                validarCompletadoCliente();
            });
        }
    });
    
    const vehiculoInputs = ['vehiculoPlaca', 'vehiculoMarca', 'vehiculoModelo'];
    vehiculoInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('focus', () => { camposEnEdicion.vehiculo = true; });
            input.addEventListener('blur', async () => {
                validarCompletadoVehiculo();
                camposEnEdicion.vehiculo = false;
                if (codigoSesion && seccionesCompletadasLocal.vehiculo) {
                    await guardarSeccion('vehiculo');
                }
            });
            input.addEventListener('input', () => {
                validarCompletadoVehiculo();
            });
        }
    });
    
    if (descripcionProblema) {
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
            validarCompletadoDescripcion();
        });
    }
}

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
// UTILIDADES
// =====================================================
function mostrarModalCodigo(codigo) {
    const modal = document.getElementById('codigoModal');
    const span = document.getElementById('codigoSesionModal');
    if (span) span.textContent = codigo;
    if (modal) modal.classList.add('show');
    setTimeout(() => modal?.classList.remove('show'), 5000);
}

function mostrarCodigoGenerado(codigo) {
    const modal = document.getElementById('codigoOrdenModal');
    const span = document.getElementById('codigoGenerado');
    if (span) span.textContent = codigo;
    if (modal) modal.classList.add('show');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const iconos = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast && document.body.contains(toast)) toast.remove();
    }, 3000);
}

// Funciones globales necesarias
window.unirseSesionConCodigo = unirseSesionConCodigo;
window.verDetalleRecepcion = verDetalleRecepcion;
window.editarRecepcion = editarRecepcion;
window.confirmarEliminarRecepcion = confirmarEliminarRecepcion;
window.cerrarModal = () => document.getElementById('codigoModal')?.classList.remove('show');
window.cerrarModalOrden = () => document.getElementById('codigoOrdenModal')?.classList.remove('show');
window.cerrarModalDetalle = () => document.getElementById('modalDetalleRecepcion')?.classList.remove('show');
window.cerrarModalEliminar = () => document.getElementById('modalConfirmarEliminar')?.classList.remove('show');
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

console.log('✅ recepcion.js cargado - Versión completa');