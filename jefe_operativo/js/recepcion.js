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
// CONFIGURACIÓN DE GOOGLE DRIVE (YA NO USA CLOUDINARY)
// =====================================================
// Las funciones de subida ahora usan Google Drive
// No se necesitan constantes de Cloudinary

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

// Variables para manejo de fotos y audio (Google Drive)
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioBlob = null;
let audioDriveUrl = null;

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

// Control de subidas activas
let subidasActivas = {};

// Variables para barra de progreso
let progressOverlay = null;
let currentProgress = 0;
let progressInterval = null;

// Variable para almacenar datos del reporte
let datosReporteFinal = null;

// Variable para controlar si ya se está descargando
let descargandoPDF = false;

// =====================================================
// CONFIGURACIÓN DE REINTENTOS
// =====================================================
const MAX_UPLOAD_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 segundos

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
// FUNCIÓN PARA SUBIR CON REINTENTOS
// =====================================================
async function fetchWithRetry(url, options = {}, retries = MAX_UPLOAD_RETRIES) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.status === 401) {
                throw new Error('Sesión expirada');
            }
            
            if (response.status >= 500) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
            
        } catch (error) {
            lastError = error;
            
            if (error.message === 'Sesión expirada') {
                logger.error('[fetchWithRetry] ❌ Sesión expirada, deteniendo reintentos');
                throw error;
            }
            
            const isNetworkError = error.name === 'TypeError' || 
                                  error.message.includes('SSL') || 
                                  error.message.includes('timeout') ||
                                  error.message.includes('network') ||
                                  error.message.includes('fetch');
            
            if (isNetworkError) {
                logger.warn(`⚠️ Intento ${attempt}/${retries} falló (error de red): ${error.message}`);
            } else {
                logger.warn(`⚠️ Intento ${attempt}/${retries} falló: ${error.message}`);
            }
            
            if (attempt < retries) {
                const waitTime = RETRY_DELAY * attempt;
                logger.info(`⏳ Esperando ${waitTime}ms antes de reintentar...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    throw lastError || new Error('Error en la petición después de varios intentos');
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
    
    try {
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        if (response.status === 401) {
            logger.warn('[fetchWithToken] ⚠️ Token expirado, intentando refrescar...');
            
            try {
                const refreshResponse = await fetch(`${API_URL}/refresh-token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        token: token
                    })
                });
                
                if (refreshResponse.ok) {
                    const refreshData = await refreshResponse.json();
                    if (refreshData.token) {
                        localStorage.setItem('furia_token', refreshData.token);
                        const newHeaders = {
                            ...headers,
                            'Authorization': `Bearer ${refreshData.token}`
                        };
                        const retryResponse = await fetch(url, {
                            ...options,
                            headers: newHeaders
                        });
                        if (retryResponse.ok) {
                            return retryResponse;
                        }
                    }
                }
            } catch (refreshError) {
                logger.error('[fetchWithToken] ❌ Error refrescando token:', refreshError);
            }
            
            logger.error('[fetchWithToken] ❌ Error 401 - Token inválido o expirado');
            mostrarNotificacion('⏳ Tu sesión expiró. Por favor, inicia sesión nuevamente.', 'warning');
            localStorage.clear();
            
            setTimeout(() => {
                window.location.href = `${window.API_BASE_URL}/`;
            }, 1500);
            
            throw new Error('Sesión expirada');
        }
        
        return response;
        
    } catch (error) {
        if (error.name === 'TypeError' || 
            error.message.includes('SSL') || 
            error.message.includes('timeout') ||
            error.message.includes('network') ||
            error.message.includes('fetch')) {
            logger.warn('[fetchWithToken] ⚠️ Error de red: ' + error.message);
            throw new Error('Error de red: ' + error.message);
        }
        throw error;
    }
}

// =====================================================
// NOTIFICACIONES
// =====================================================
function mostrarNotificacion(mensaje, tipo = 'info') {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && document.body.contains(toast)) toast.remove();
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// BARRA DE PROGRESO
// =====================================================

function initProgressElements() {
    progressOverlay = document.getElementById('progressOverlay');
}

function showProgress(title, message, steps = 3) {
    if (!progressOverlay) initProgressElements();
    if (!progressOverlay) return;
    
    currentProgress = 0;
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressTitle = document.getElementById('progressTitle');
    const progressMessage = document.getElementById('progressMessage');
    const progressIcon = document.getElementById('progressIcon');
    const progressStepsContainer = document.getElementById('progressSteps');
    
    if (progressBarFill) progressBarFill.style.width = '0%';
    if (progressPercentage) progressPercentage.textContent = '0%';
    if (progressTitle) progressTitle.textContent = title;
    if (progressMessage) progressMessage.textContent = message;
    if (progressIcon) {
        progressIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    
    if (progressStepsContainer) {
        const stepsEl = progressStepsContainer.querySelectorAll('.progress-step');
        stepsEl.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            const iconSpan = step.querySelector('.progress-step-icon i');
            if (iconSpan) {
                iconSpan.className = 'far fa-circle';
            }
        });
        if (stepsEl[0]) {
            stepsEl[0].classList.add('active');
            const iconSpan = stepsEl[0].querySelector('.progress-step-icon i');
            if (iconSpan) iconSpan.className = 'fas fa-spinner fa-pulse';
        }
    }
    
    progressOverlay.classList.add('active');
    
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        if (currentProgress < 90) {
            currentProgress += Math.random() * 10;
            if (currentProgress > 90) currentProgress = 90;
            updateProgressBar(currentProgress);
        }
    }, 300);
}

function updateProgressBar(percent, step = null) {
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    
    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
    if (progressPercentage) progressPercentage.textContent = `${Math.floor(percent)}%`;
    
    if (step !== null) {
        const progressStepsContainer = document.getElementById('progressSteps');
        if (progressStepsContainer) {
            const steps = progressStepsContainer.querySelectorAll('.progress-step');
            steps.forEach((s, idx) => {
                if (idx + 1 === step) {
                    s.classList.add('active');
                    const iconSpan = s.querySelector('.progress-step-icon i');
                    if (iconSpan) iconSpan.className = 'fas fa-spinner fa-pulse';
                } else if (idx + 1 < step) {
                    s.classList.remove('active');
                    s.classList.add('completed');
                    const iconSpan = s.querySelector('.progress-step-icon i');
                    if (iconSpan) iconSpan.className = 'fas fa-check-circle';
                } else {
                    s.classList.remove('active', 'completed');
                    const iconSpan = s.querySelector('.progress-step-icon i');
                    if (iconSpan) iconSpan.className = 'far fa-circle';
                }
            });
        }
    }
}

function updateProgressMessage(message) {
    const progressMessage = document.getElementById('progressMessage');
    if (progressMessage) progressMessage.textContent = message;
}

function completeProgress(success = true) {
    if (progressInterval) clearInterval(progressInterval);
    
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressIcon = document.getElementById('progressIcon');
    const progressTitle = document.getElementById('progressTitle');
    
    if (success) {
        if (progressBarFill) progressBarFill.style.width = '100%';
        if (progressPercentage) progressPercentage.textContent = '100%';
        if (progressIcon) {
            progressIcon.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981;"></i>';
        }
        if (progressTitle) progressTitle.textContent = '¡Completado!';
        
        const progressStepsContainer = document.getElementById('progressSteps');
        if (progressStepsContainer) {
            const steps = progressStepsContainer.querySelectorAll('.progress-step');
            steps.forEach(step => {
                step.classList.remove('active');
                step.classList.add('completed');
                const iconSpan = step.querySelector('.progress-step-icon i');
                if (iconSpan) iconSpan.className = 'fas fa-check-circle';
            });
        }
        
        setTimeout(() => {
            hideProgress();
        }, 1500);
    } else {
        if (progressIcon) {
            progressIcon.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>';
        }
        if (progressTitle) progressTitle.textContent = 'Error';
        
        setTimeout(() => {
            hideProgress();
        }, 2000);
    }
}

function hideProgress() {
    if (progressOverlay) {
        progressOverlay.classList.remove('active');
    }
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
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
// SUBIR FOTO A GOOGLE DRIVE (CON CÓDIGO DE SESIÓN)
// =====================================================
async function subirFotoGoogleDrive(file, carpeta, campo) {
    return new Promise(async (resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('carpeta', carpeta || 'recepcion');
        formData.append('campo', campo);
        formData.append('codigo_sesion', codigoSesion);
        
        const url = `${API_URL}/jefe-operativo/upload-foto`;
        const token = localStorage.getItem('furia_token');
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.url) {
                resolve(data.url);
            } else {
                reject(new Error(data.error || 'Error subiendo foto'));
            }
        } catch (error) {
            reject(error);
        }
    });
}

// =====================================================
// SUBIR AUDIO A GOOGLE DRIVE (CON CÓDIGO DE SESIÓN)
// =====================================================
async function subirAudioGoogleDrive(audioBlob, carpeta) {
    return new Promise(async (resolve, reject) => {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('carpeta', carpeta || 'recepcion');
        formData.append('tipo', 'audio');
        formData.append('codigo_sesion', codigoSesion);
        
        const url = `${API_URL}/jefe-operativo/upload-audio`;
        const token = localStorage.getItem('furia_token');
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.url) {
                resolve(data.url);
            } else {
                reject(new Error(data.error || 'Error subiendo audio'));
            }
        } catch (error) {
            reject(error);
        }
    });
}

// =====================================================
// PROCESAR FOTO
// =====================================================
async function procesarFoto(input, foto) {
    const file = input.files[0];
    if (!file) return;
    
    const uploadDiv = document.getElementById(`upload-${foto.id}`);
    const preview = uploadDiv?.querySelector('.upload-preview');
    const removeBtn = uploadDiv?.querySelector('.remove-photo');
    
    if (preview) {
        preview.style.backgroundImage = '';
        preview.style.display = 'flex';
        preview.style.alignItems = 'center';
        preview.style.justifyContent = 'center';
        preview.style.backgroundColor = '#f0f0f0';
        preview.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #C1121F;"></i>';
        uploadDiv.classList.add('has-image');
    }
    
    try {
        let fileToUpload = file;
        const originalSize = file.size / 1024 / 1024;
        
        if (originalSize > 2 || file.type === 'image/jpeg' || file.type === 'image/jpg') {
            mostrarNotificacion(`🔄 Comprimiendo ${foto.label}...`, 'info');
            
            try {
                if (typeof imageCompressor !== 'undefined') {
                    fileToUpload = await imageCompressor.compress(file, {
                        maxWidth: 1920,
                        maxHeight: 1920,
                        quality: 0.85,
                        maxSizeMB: 2.5
                    });
                    
                    const compressedSize = fileToUpload.size / 1024 / 1024;
                    const reduction = Math.round((1 - fileToUpload.size / file.size) * 100);
                    
                    if (compressedSize < originalSize) {
                        mostrarNotificacion(`📸 ${foto.label}: ${compressedSize.toFixed(1)} MB (${reduction}% menos)`, 'success');
                    }
                }
            } catch (compressError) {
                console.warn('⚠️ Falló compresión, usando original:', compressError);
                mostrarNotificacion(`⚠️ Usando imagen original para ${foto.label}`, 'warning');
                fileToUpload = file;
            }
        }
        
        const finalSizeMB = fileToUpload.size / 1024 / 1024;
        if (finalSizeMB > 8) {
            throw new Error(`Imagen muy grande (${finalSizeMB.toFixed(1)} MB). Máximo 8MB.`);
        }
        
        if (subidasActivas[foto.id]) {
            return;
        }
        subidasActivas[foto.id] = true;
        
        mostrarNotificacion(`📤 Subiendo ${foto.label} a Google Drive...`, 'info');
        
        const url = await subirFotoGoogleDrive(fileToUpload, codigoSesion || 'temp', foto.campo);
        
        if (preview) {
            const objectUrl = URL.createObjectURL(fileToUpload);
            preview.style.backgroundImage = `url('${objectUrl}')`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.innerHTML = '';
            preview.style.display = 'block';
            uploadDiv.classList.add('has-image');
            uploadDiv.dataset.driveUrl = url;
            
            if (uploadDiv.dataset.objectUrl) {
                URL.revokeObjectURL(uploadDiv.dataset.objectUrl);
            }
            uploadDiv.dataset.objectUrl = objectUrl;
            
            if (removeBtn) removeBtn.style.display = 'flex';
        }
        
        fotosSubidasLocal[foto.campo] = url;
        mostrarNotificacion(`✅ ${foto.label} subida a Google Drive`, 'success');
        validarCompletadoFotos();
        
        if (codigoSesion && seccionesCompletadasLocal.fotos) {
            await guardarSeccion('fotos');
        }
        
    } catch (error) {
        console.error(`❌ Error en ${foto.label}:`, error);
        mostrarNotificacion(`Error: ${error.message || `No se pudo procesar ${foto.label}`}`, 'error');
        
        if (preview) {
            preview.style.backgroundImage = '';
            preview.innerHTML = '';
            preview.style.display = '';
            uploadDiv.classList.remove('has-image');
        }
        if (removeBtn) removeBtn.style.display = 'none';
        input.value = '';
        
    } finally {
        delete subidasActivas[foto.id];
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
            if (audioPreview) {
                audioPreview.src = audioUrl;
                audioPreview.style.display = 'block';
            }
            if (audioStatus) audioStatus.textContent = 'Audio grabado - Subiendo a Google Drive...';
            
            mostrarNotificacion('Subiendo audio a Google Drive...', 'info');
            try {
                const driveUrl = await subirAudioGoogleDrive(audioBlob, codigoSesion || 'temp');
                audioDriveUrl = driveUrl;
                if (audioStatus) audioStatus.textContent = 'Audio guardado en Google Drive';
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                mostrarNotificacion('✅ Audio subido a Google Drive', 'success');
                
                if (codigoSesion && descripcionProblema?.value.trim()) {
                    await guardarSeccion('descripcion');
                }
                validarCompletadoDescripcion();
            } catch (error) {
                console.error('Error subiendo audio a Google Drive:', error);
                if (audioStatus) audioStatus.textContent = 'Error al subir audio';
                mostrarNotificacion('Error al subir audio a Google Drive', 'error');
            }
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        btnGrabarAudio.classList.add('recording');
        btnGrabarAudio.innerHTML = '<i class="fas fa-stop"></i> Detener Grabación';
        if (audioStatus) {
            audioStatus.textContent = 'Grabando...';
            audioStatus.style.color = 'var(--rojo-acento)';
        }
        if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    } catch (error) {
        logger.error('Error al acceder al micrófono:', error);
        if (audioStatus) audioStatus.textContent = 'Error: No se pudo acceder al micrófono';
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
    audioDriveUrl = null;
    if (audioPreview) {
        if (audioPreview.src && audioPreview.src.startsWith('blob:')) URL.revokeObjectURL(audioPreview.src);
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (audioStatus) audioStatus.textContent = 'Grabación eliminada';
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
    isRecording = false;
    
    if (codigoSesion && descripcionProblema?.value.trim()) {
        guardarSeccion('descripcion');
    }
    validarCompletadoDescripcion();
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
                if (preview) {
                    preview.style.backgroundImage = '';
                    preview.innerHTML = '';
                }
                uploadDiv.classList.remove('has-image');
                removeBtn.style.display = 'none';
                delete uploadDiv.dataset.driveUrl;
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
                const url = uploadDiv?.dataset.driveUrl;
                fotosData[foto.campo] = url || null;
            }
            datos = fotosData;
            break;
        case 'descripcion':
            datos = {
                texto: descripcionProblema?.value || '',
                audio_url: audioDriveUrl
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
            
            if (seccion === 'vehiculo') {
                const placa = datos.placa?.trim();
                const marca = datos.marca?.trim();
                const modelo = datos.modelo?.trim();
                const vehiculoCompleto = !!(placa && marca && modelo);
                seccionesCompletadasLocal.vehiculo = vehiculoCompleto;
                
                const badgeVehiculo = document.getElementById('statusVehiculo');
                if (badgeVehiculo) {
                    if (vehiculoCompleto) {
                        badgeVehiculo.textContent = '✓ Completado';
                        badgeVehiculo.classList.add('completado');
                        badgeVehiculo.classList.remove('en-proceso');
                    } else {
                        badgeVehiculo.textContent = '○ Pendiente';
                        badgeVehiculo.classList.add('en-proceso');
                        badgeVehiculo.classList.remove('completado');
                    }
                }
            }
            
            if (seccion !== 'vehiculo' && data.sesion.secciones_completadas) {
                seccionesCompletadasLocal[seccion] = data.sesion.secciones_completadas[seccion];
                actualizarEstadoVisualSeccion(seccion, data.sesion.secciones_completadas[seccion]);
            }
            
            actualizarBotonFinalizar();
            
            const guardadoSpan = document.getElementById(`guardado${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
            if (guardadoSpan) {
                guardadoSpan.style.display = 'flex';
                setTimeout(() => guardadoSpan.style.display = 'none', 1500);
            }
            
            mostrarNotificacion(`✓ ${seccion} guardado`, 'success');
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
            mostrarNotificacion('Esta sesión ya fue finalizada', 'warning');
            return;
        }
        
        sesionActual = data.sesion;
        const datos = sesionActual.datos;
        
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
                        preview.innerHTML = '';
                        uploadDiv.classList.add('has-image');
                        uploadDiv.dataset.driveUrl = url;
                        const removeBtn = uploadDiv.querySelector('.remove-photo');
                        if (removeBtn) removeBtn.style.display = 'flex';
                    }
                }
            }
            validarCompletadoFotos();
        }
        
        if (datos.descripcion) {
            if (descripcionProblema) descripcionProblema.value = datos.descripcion.texto || '';
            if (datos.descripcion.audio_url) {
                audioDriveUrl = datos.descripcion.audio_url;
                if (audioPreview) {
                    audioPreview.src = audioDriveUrl;
                    audioPreview.style.display = 'block';
                }
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                if (audioStatus) audioStatus.textContent = 'Audio disponible';
            }
            validarCompletadoDescripcion();
        }
        
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
            if (data.sesion && data.sesion.estado === 'finalizada') {
                mostrarNotificacion('La sesión guardada ya fue finalizada', 'info');
            }
        }
    } catch (error) {
        localStorage.removeItem('sesion_actual');
    }
}

// =====================================================
// FUNCIÓN PARA FINALIZAR SESIÓN CON REPORTE
// =====================================================
async function finalizarSesionConReporte() {
    if (!codigoSesion) return;
    
    showProgress('Finalizando Recepción', 'Preparando datos...', 3);
    updateProgressBar(10, 1);
    updateProgressMessage('Validando secciones completadas...');
    
    validarCompletadoCliente();
    validarCompletadoVehiculo();
    validarCompletadoFotos();
    validarCompletadoDescripcion();
    
    await new Promise(resolve => setTimeout(resolve, 300));
    updateProgressBar(30, 1);
    
    if (!seccionesCompletadasLocal.cliente || !seccionesCompletadasLocal.vehiculo || 
        !seccionesCompletadasLocal.fotos || !seccionesCompletadasLocal.descripcion) {
        completeProgress(false);
        mostrarNotificacion('Completa todas las secciones antes de finalizar', 'warning');
        return;
    }
    
    if (!confirm('¿Finalizar recepción? Los datos se guardarán permanentemente.')) {
        hideProgress();
        return;
    }
    
    updateProgressBar(50, 2);
    updateProgressMessage('Guardando información del vehículo...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
        updateProgressBar(70, 2);
        updateProgressMessage('Generando orden de trabajo...');
        
        if (!userInfo || !userInfo.id) {
            throw new Error('No se encontró información del usuario. Por favor, recarga la página.');
        }
        
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/finalizar-sesion`, {
            method: 'POST',
            body: JSON.stringify({ 
                codigo: codigoSesion, 
                datos: sesionActual?.datos,
                usuario_id: userInfo.id,
                usuario_nombre: userInfo.nombre
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error del servidor: ${response.status}`);
        }
        
        updateProgressBar(90, 3);
        updateProgressMessage('Creando código de seguimiento...');
        
        const data = await response.json();
        
        if (data.success) {
            updateProgressBar(100, 3);
            updateProgressMessage('¡Recepción finalizada con éxito!');
            
            if (data.id_orden) {
                await mostrarReporteFinal(data.id_orden);
            } else {
                mostrarNotificacion('Error: No se recibió el ID de la orden', 'error');
            }
            
            limpiarSesionCompleta();
            
            setTimeout(() => {
                completeProgress(true);
                mostrarNotificacion('Recepción finalizada exitosamente', 'success');
            }, 500);
            
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
            await cargarRecepciones();
            await cargarSesionesActivas();
        } else {
            throw new Error(data.message || 'Error al finalizar');
        }
    } catch (error) {
        console.error('Error finalizando:', error);
        completeProgress(false);
        mostrarNotificacion(error.message || 'Error al finalizar la recepción. Revisa la consola del servidor.', 'error');
    }
}

function limpiarSesionCompleta() {
    detenerPolling();
    detenerKeepAlive();
    
    codigoSesion = null;
    sesionActual = null;
    audioDriveUrl = null;
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
    
    const inputs = document.querySelectorAll('#recepcionForm input, #recepcionForm textarea');
    inputs.forEach(input => { 
        if (input.id !== 'clienteLatitud' && input.id !== 'clienteLongitud') {
            input.value = '';
        }
    });
    
    document.querySelectorAll('.photo-upload').forEach(upload => {
        upload.classList.remove('has-image');
        const preview = upload.querySelector('.upload-preview');
        if (preview) {
            preview.style.backgroundImage = '';
            preview.innerHTML = '';
        }
        const removeBtn = upload.querySelector('.remove-photo');
        if (removeBtn) removeBtn.style.display = 'none';
        delete upload.dataset.driveUrl;
        if (upload.dataset.objectUrl) {
            URL.revokeObjectURL(upload.dataset.objectUrl);
            delete upload.dataset.objectUrl;
        }
    });
    
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
        cargarSesionesActivas();
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
        
        if (s.estado !== 'activa') return '';
        
        return `
            <div class="sesion-item ${esActiva ? 'active' : ''} ${estaCompleta ? 'full' : ''}">
                <div class="sesion-info">
                    <span class="sesion-codigo">${escapeHtml(s.codigo)}</span>
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
            await cargarSesionesActivas();
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
            mostrarNotificacion('La sesión fue finalizada por otro usuario', 'info');
            return;
        }
        
        const nuevasSecciones = data.sesion.secciones_completadas;
        
        const placaLocal = document.getElementById('vehiculoPlaca')?.value.trim();
        const marcaLocal = document.getElementById('vehiculoMarca')?.value.trim();
        const modeloLocal = document.getElementById('vehiculoModelo')?.value.trim();
        const vehiculoLocalCompleto = !!(placaLocal && marcaLocal && modeloLocal);
        
        if (!vehiculoLocalCompleto && nuevasSecciones) {
            if (seccionesCompletadasLocal.vehiculo !== nuevasSecciones.vehiculo) {
                seccionesCompletadasLocal.vehiculo = nuevasSecciones.vehiculo;
                actualizarEstadoVisualSeccion('vehiculo', nuevasSecciones.vehiculo);
            }
        }
        
        if (nuevasSecciones) {
            if (seccionesCompletadasLocal.cliente !== nuevasSecciones.cliente) {
                seccionesCompletadasLocal.cliente = nuevasSecciones.cliente;
                actualizarEstadoVisualSeccion('cliente', nuevasSecciones.cliente);
            }
            if (seccionesCompletadasLocal.fotos !== nuevasSecciones.fotos) {
                seccionesCompletadasLocal.fotos = nuevasSecciones.fotos;
            }
            if (seccionesCompletadasLocal.descripcion !== nuevasSecciones.descripcion) {
                seccionesCompletadasLocal.descripcion = nuevasSecciones.descripcion;
                actualizarEstadoVisualSeccion('descripcion', nuevasSecciones.descripcion);
            }
        }
        
        actualizarBotonFinalizar();
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
                <span class="recepcion-codigo">${escapeHtml(rec.codigo_unico || 'N/A')}</span>
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
// LEAFLET MAPA (FUNCIONES BÁSICAS)
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
    
    const fotosArray = Object.values(detalle.fotos || {}).filter(url => url && url !== 'null' && url !== 'None');
    const fotosCount = fotosArray.length;
    
    const tabsHtml = `
        <div class="detalle-tabs">
            <button class="detalle-tab active" data-tab="info">📋 Información</button>
            <button class="detalle-tab" data-tab="fotos">📸 Fotos (${fotosCount}/7)</button>
            <button class="detalle-tab" data-tab="descripcion">📝 Descripción</button>
        </div>
        <div class="detalle-panes">
            <div class="detalle-pane active" id="pane-info">
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Código de Trabajo</span>
                        <span class="detalle-value">${escapeHtml(detalle.codigo_unico || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Fecha de Ingreso</span>
                        <span class="detalle-value">${new Date(detalle.fecha_ingreso).toLocaleString()}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Estado</span>
                        <span class="detalle-value estado-${detalle.estado_global || 'EnRecepcion'}">${detalle.estado_global || 'En Recepción'}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Jefe Principal</span>
                        <span class="detalle-value">${escapeHtml(detalle.jefe_operativo?.nombre || 'No asignado')}</span>
                    </div>
                    ${detalle.jefe_operativo_2?.nombre ? `
                    <div class="detalle-item">
                        <span class="detalle-label">Jefe Secundario</span>
                        <span class="detalle-value">${escapeHtml(detalle.jefe_operativo_2.nombre)}</span>
                    </div>
                    ` : ''}
                </div>
                
                <h4 style="margin-top: 1.2rem; margin-bottom: 0.6rem; color: var(--rojo-primario); font-size: 0.9rem;">
                    <i class="fas fa-user"></i> Datos del Cliente
                </h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Nombre</span>
                        <span class="detalle-value">${escapeHtml(detalle.cliente_nombre || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Teléfono</span>
                        <span class="detalle-value">${escapeHtml(detalle.cliente_telefono || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Ubicación</span>
                        <span class="detalle-value">${escapeHtml(detalle.cliente_ubicacion || 'No especificada')}</span>
                    </div>
                    ${detalle.latitud && detalle.longitud ? `
                    <div class="detalle-item">
                        <span class="detalle-label">Coordenadas</span>
                        <span class="detalle-value">${detalle.latitud}, ${detalle.longitud}</span>
                    </div>
                    ` : ''}
                </div>
                
                <h4 style="margin-top: 1.2rem; margin-bottom: 0.6rem; color: var(--rojo-primario); font-size: 0.9rem;">
                    <i class="fas fa-car"></i> Datos del Vehículo
                </h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Placa</span>
                        <span class="detalle-value">${escapeHtml(detalle.placa || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Marca</span>
                        <span class="detalle-value">${escapeHtml(detalle.marca || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Modelo</span>
                        <span class="detalle-value">${escapeHtml(detalle.modelo || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Año</span>
                        <span class="detalle-value">${detalle.anio || 'N/A'}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Kilometraje</span>
                        <span class="detalle-value">${detalle.kilometraje?.toLocaleString() || '0'} km</span>
                    </div>
                </div>
            </div>
            
            <div class="detalle-pane" id="pane-fotos">
                ${generarFotosHtmlDetalle(detalle.fotos)}
            </div>
            
            <div class="detalle-pane" id="pane-descripcion">
                <div class="detalle-descripcion-texto">${escapeHtml(detalle.transcripcion_problema || 'No se registró descripción')}</div>
                ${detalle.audio_url ? `<div class="detalle-audio" style="margin-top: 1rem;"><audio controls src="${detalle.audio_url}" style="width: 100%; border-radius: 8px;"></audio></div>` : ''}
            </div>
        </div>
    `;
    
    body.innerHTML = tabsHtml;
    modal.classList.add('show');
    
    const tabs = document.querySelectorAll('.detalle-tab');
    const panes = document.querySelectorAll('.detalle-pane');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panes.forEach(pane => pane.classList.remove('active'));
            const activePane = document.getElementById(`pane-${tabId}`);
            if (activePane) activePane.classList.add('active');
        });
    });
    
    const btnWord = document.getElementById('btnExportarWord');
    const btnPDF = document.getElementById('btnExportarPDF');
    if (btnWord) btnWord.onclick = () => exportarAWord(detalle);
    if (btnPDF) btnPDF.onclick = () => exportarAPDF();
}

function generarFotosHtmlDetalle(fotos) {
    if (!fotos) return '<p class="detalle-value">No se registraron fotos</p>';
    
    const camposFotos = [
        { campo: 'url_lateral_izquierda', label: 'Lateral Izquierdo' },
        { campo: 'url_lateral_derecha', label: 'Lateral Derecho' },
        { campo: 'url_foto_frontal', label: 'Frontal' },
        { campo: 'url_foto_trasera', label: 'Trasera' },
        { campo: 'url_foto_superior', label: 'Superior' },
        { campo: 'url_foto_inferior', label: 'Inferior' },
        { campo: 'url_foto_tablero', label: 'Tablero' }
    ];
    
    const fotosExistentes = camposFotos.filter(f => {
        const url = fotos[f.campo];
        return url && url !== 'null' && url !== 'None' && url !== '' && url !== null;
    });
    
    if (fotosExistentes.length === 0) {
        return '<p class="detalle-value">No se registraron fotos</p>';
    }
    
    return `
        <div class="detalle-fotos-grid">
            ${fotosExistentes.map(f => `
                <div class="detalle-foto" onclick="verImagenAmpliada('${fotos[f.campo]}', '${f.label}')">
                    <img src="${fotos[f.campo]}" alt="${f.label}" loading="lazy">
                    <div class="detalle-foto-label">${f.label}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function verImagenAmpliada(url, label) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.innerHTML = `
        <div class="modal-imagen-content">
            <button class="modal-imagen-close" onclick="this.closest('.modal-imagen').remove()">&times;</button>
            <img src="${url}" alt="${label}">
            <p>${label}</p>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function exportarAWord(detalle) {
    const contenido = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recepcion_${detalle.codigo_unico}</title><style>
        body{font-family:Arial,sans-serif;padding:40px;line-height:1.6;}
        h1{color:#C1121F;border-bottom:2px solid #C1121F;padding-bottom:10px;}
        h2{color:#333;margin-top:20px;border-bottom:1px solid #ddd;padding-bottom:5px;}
        .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:15px;margin:15px 0;}
        .fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px;margin:15px 0;}
        .foto{border:1px solid #ddd;border-radius:8px;overflow:hidden;}
        .foto img{width:100%;height:auto;}
        .foto p{text-align:center;padding:5px;background:#f5f5f5;margin:0;}
        .descripcion{background:#f9f9f9;padding:15px;border-radius:8px;margin:15px 0;}
        .footer{margin-top:30px;text-align:center;color:#999;font-size:12px;}
    </style></head><body>
        <h1>FURIA MOTOR COMPANY</h1>
        <h2>Recepción de Vehículo</h2>
        <p><strong>Código:</strong> ${detalle.codigo_unico}</p>
        <p><strong>Fecha:</strong> ${new Date(detalle.fecha_ingreso).toLocaleString()}</p>
        
        <h2>Cliente</h2>
        <div class="grid">
            <div><strong>Nombre:</strong> ${detalle.cliente_nombre || 'N/A'}</div>
            <div><strong>Teléfono:</strong> ${detalle.cliente_telefono || 'N/A'}</div>
            <div><strong>Ubicación:</strong> ${detalle.cliente_ubicacion || 'N/A'}</div>
        </div>
        
        <h2>Vehículo</h2>
        <div class="grid">
            <div><strong>Placa:</strong> ${detalle.placa || 'N/A'}</div>
            <div><strong>Marca:</strong> ${detalle.marca || 'N/A'}</div>
            <div><strong>Modelo:</strong> ${detalle.modelo || 'N/A'}</div>
            <div><strong>Año:</strong> ${detalle.anio || 'N/A'}</div>
            <div><strong>Kilometraje:</strong> ${detalle.kilometraje?.toLocaleString() || '0'} km</div>
        </div>
        
        <h2>Fotos</h2>
        <div class="fotos">
            ${Object.entries(detalle.fotos || {}).filter(([_, url]) => url && url !== 'null').map(([campo, url]) => `
                <div class="foto"><img src="${url}" alt="${campo}"><p>${campo.replace(/url_/g, '').replace(/_/g, ' ').toUpperCase()}</p></div>
            `).join('')}
        </div>
        
        <h2>Descripción del Problema</h2>
        <div class="descripcion">${detalle.transcripcion_problema || 'No se registró descripción'}</div>
        ${detalle.audio_url ? `<audio controls src="${detalle.audio_url}"></audio>` : ''}
        
        <div class="footer">Documento generado automáticamente por FURIA MOTOR</div>
    </body></html>`;
    
    const blob = new Blob([contenido], { type: 'application/msword' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Recepcion_${detalle.codigo_unico}.doc`;
    link.click();
    URL.revokeObjectURL(link.href);
    mostrarNotificacion('Documento Word generado', 'success');
}

function exportarAPDF() {
    const elemento = document.getElementById('detalleRecepcionBody');
    if (!elemento) return;
    
    mostrarNotificacion('Generando PDF...', 'info');
    
    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: `Recepcion_${recepcionSeleccionada?.codigo_unico || 'export'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(elemento).save()
        .then(() => mostrarNotificacion('PDF generado', 'success'))
        .catch(() => mostrarNotificacion('Error generando PDF', 'error'));
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
// FUNCIONES DEL REPORTE DE IMPRESIÓN
// =====================================================

// =====================================================
// CONVERTIR IMAGEN A BASE64 (VÍA BACKEND)
// =====================================================
async function convertirImagenABase64(url) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/imagen-base64`, {
            method: 'POST',
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        
        if (data.success && data.base64) {
            return data.base64;
        } else {
            throw new Error(data.error || 'Error convirtiendo imagen');
        }
    } catch (error) {
        console.error('❌ Error convirtiendo imagen:', error);
        return url; // Fallback a la URL original
    }
}

// =====================================================
// FUNCIÓN PARA CARGAR DATOS DE LA ORDEN (CON BASE64)
// =====================================================
async function cargarDatosOrdenCompleta(idOrden) {
    try {
        mostrarNotificacion('📊 Cargando datos de la orden...', 'info');
        
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${idOrden}`, { 
            method: 'GET' 
        });
        
        if (!response.ok) {
            throw new Error('Error al cargar los datos de la orden');
        }
        
        const data = await response.json();
        
        if (data.success && data.detalle) {
            datosReporteFinal = data.detalle;
            datosReporteFinal.id_orden = idOrden;
            
            // =============================================
            // CONVERTIR IMÁGENES A BASE64
            // =============================================
            const fotos = datosReporteFinal.fotos || {};
            const fotosBase64 = {};
            
            for (const [key, url] of Object.entries(fotos)) {
                if (url && url !== 'null' && url !== 'None' && url !== '') {
                    try {
                        const base64 = await convertirImagenABase64(url);
                        fotosBase64[key] = base64;
                        console.log(`✅ Imagen convertida: ${key}`);
                    } catch (error) {
                        console.warn(`⚠️ No se pudo convertir ${key}:`, error);
                        fotosBase64[key] = url;
                    }
                } else {
                    fotosBase64[key] = null;
                }
            }
            
            datosReporteFinal.fotos_base64 = fotosBase64;
            
            return datosReporteFinal;
        } else {
            throw new Error(data.error || 'No se pudieron obtener los datos');
        }
    } catch (error) {
        console.error('❌ Error cargando orden:', error);
        mostrarNotificacion('Error cargando datos: ' + error.message, 'error');
        return null;
    }
}

// =====================================================
// GENERAR HTML DEL REPORTE (CON BASE64)
// =====================================================
function generarHTMLReporte(detalle) {
    if (!detalle) {
        return '<div class="loading-preview"><i class="fas fa-exclamation-triangle"></i><p>No hay datos para mostrar</p></div>';
    }
    
    // =============================================
    // USAR IMÁGENES EN BASE64 SI ESTÁN DISPONIBLES
    // =============================================
    const fotos = detalle.fotos_base64 || detalle.fotos || {};
    const fotosArray = Object.entries(fotos)
        .filter(([key, url]) => url && url !== 'null' && url !== 'None' && url !== '')
        .map(([key, url]) => ({
            campo: key,
            label: key.replace(/url_/g, '').replace(/_/g, ' ').toUpperCase(),
            url: url
        }));
    
    // Si no hay fotos, mostrar mensaje
    const fotosHTML = fotosArray.length > 0 ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 8px 0;">
            ${fotosArray.map(f => `
                <div style="border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: #f5f5f5; text-align: center;">
                    <img src="${f.url}" alt="${f.label}" 
                         style="width: 100%; height: 100px; object-fit: cover; display: block; background: #eee;"
                         onerror="this.style.display='none'">
                    <div style="padding: 3px; font-size: 8px; font-weight: bold; color: #555;">${f.label}</div>
                </div>
            `).join('')}
        </div>
    ` : '<p style="color: #999; font-style: italic; font-size: 11px;">No se registraron fotos</p>';
    
    // Datos del cliente
    const clienteNombre = detalle.cliente_nombre || 'No registrado';
    const clienteTelefono = detalle.cliente_telefono || 'No registrado';
    const clienteUbicacion = detalle.cliente_ubicacion || 'No especificada';
    const coordenadas = (detalle.latitud && detalle.longitud) ? 
        `${detalle.latitud}, ${detalle.longitud}` : 'No especificadas';
    
    // Datos del vehículo
    const placa = detalle.placa || 'No registrada';
    const marca = detalle.marca || 'No registrada';
    const modelo = detalle.modelo || 'No registrado';
    const anio = detalle.anio || 'No especificado';
    const kilometraje = detalle.kilometraje ? 
        `${Number(detalle.kilometraje).toLocaleString()} km` : '0 km';
    
    // Estado
    const estado = detalle.estado_global || 'EnRecepcion';
    const estadoLabels = {
        'EnRecepcion': 'En Recepción',
        'EnTaller': 'En Taller',
        'Finalizado': 'Finalizado'
    };
    const estadoLabel = estadoLabels[estado] || estado;
    
    // Jefes operativos
    const jefePrincipal = detalle.jefe_operativo?.nombre || 'No asignado';
    const jefeSecundario = detalle.jefe_operativo_2?.nombre || null;
    const jefePrincipalContacto = detalle.jefe_operativo?.contacto || '';
    
    // Fecha
    const fechaIngreso = detalle.fecha_ingreso ? 
        new Date(detalle.fecha_ingreso).toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'No registrada';
    
    // Audio
    const audioHTML = detalle.audio_url ? `
        <div style="margin-top: 6px;">
            <audio controls src="${detalle.audio_url}" style="width: 100%; max-width: 300px; border-radius: 4px; height: 30px;"></audio>
        </div>
    ` : '';
    
    // Fecha actual para firmas
    const fechaActual = new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    
    return `
        <div class="reporte-container" id="reporteImprimible" style="
            max-width: 800px;
            margin: 0 auto;
            padding: 15px;
            font-family: Arial, sans-serif;
            background: white;
            color: #222;
            font-size: 11px;
            line-height: 1.4;
            box-sizing: border-box;
        ">
            <!-- ENCABEZADO -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #C1121F; padding-bottom: 10px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <h1 style="font-size: 20px; color: #C1121F; margin: 0;">FURIA <span style="color: #222;">MOTOR</span></h1>
                </div>
                <div style="text-align: right; font-size: 9px;">
                    <strong>FURIA MOTOR COMPANY</strong><br>
                    Taller Automotriz Especializado<br>
                    Cochabamba, Bolivia
                </div>
            </div>
            
            <!-- TÍTULO -->
            <div style="text-align: center; margin-bottom: 10px;">
                <h2 style="font-size: 14px; color: #C1121F; margin: 0;">ORDEN DE TRABAJO - RECEPCIÓN</h2>
                <div style="font-size: 12px; font-weight: bold; background: #f0f0f0; display: inline-block; padding: 2px 10px; border-radius: 3px; margin-top: 3px;">
                    # ${detalle.codigo_unico || 'OT-N/A'}
                </div>
            </div>
            
            <!-- INFORMACIÓN GENERAL -->
            <div style="background: #f8f8f8; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px;">
                <h3 style="font-size: 10px; color: #C1121F; margin: 0 0 4px 0;">📋 Información General</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; font-size: 10px;">
                    <div><strong>Fecha:</strong> ${fechaIngreso}</div>
                    <div><strong>Estado:</strong> <span style="background: ${estado === 'EnRecepcion' ? '#ffc107' : estado === 'EnTaller' ? '#17a2b8' : '#28a745'}; color: white; padding: 1px 6px; border-radius: 8px; font-size: 9px;">${estadoLabel}</span></div>
                    <div><strong>ID Orden:</strong> #${detalle.id || 'N/A'}</div>
                    <div><strong>Jefe Operativo:</strong> ${jefePrincipal}</div>
                    ${jefeSecundario ? `<div><strong>Jefe Op. 2:</strong> ${jefeSecundario}</div>` : ''}
                </div>
            </div>
            
            <!-- DATOS DEL CLIENTE -->
            <div style="background: #f8f8f8; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px;">
                <h3 style="font-size: 10px; color: #C1121F; margin: 0 0 4px 0;">👤 Datos del Cliente</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; font-size: 10px;">
                    <div><strong>Nombre:</strong> ${clienteNombre}</div>
                    <div><strong>Teléfono:</strong> ${clienteTelefono}</div>
                    <div style="grid-column: 1 / -1;"><strong>Ubicación:</strong> ${clienteUbicacion}</div>
                    <div style="grid-column: 1 / -1;"><strong>Coordenadas:</strong> ${coordenadas}</div>
                </div>
            </div>
            
            <!-- DATOS DEL VEHÍCULO -->
            <div style="background: #f8f8f8; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px;">
                <h3 style="font-size: 10px; color: #C1121F; margin: 0 0 4px 0;">🚗 Datos del Vehículo</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 10px; font-size: 10px;">
                    <div><strong>Placa:</strong> <strong>${placa}</strong></div>
                    <div><strong>Marca:</strong> ${marca}</div>
                    <div><strong>Modelo:</strong> ${modelo}</div>
                    <div><strong>Año:</strong> ${anio}</div>
                    <div style="grid-column: span 2;"><strong>Kilometraje:</strong> ${kilometraje}</div>
                </div>
            </div>
            
            <!-- FOTOS -->
            <div style="background: #f8f8f8; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px;">
                <h3 style="font-size: 10px; color: #C1121F; margin: 0 0 4px 0;">📸 Fotos (${fotosArray.length}/7)</h3>
                ${fotosHTML}
            </div>
            
            <!-- DESCRIPCIÓN -->
            <div style="background: #f8f8f8; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px;">
                <h3 style="font-size: 10px; color: #C1121F; margin: 0 0 4px 0;">📝 Descripción</h3>
                <div style="background: white; padding: 6px 8px; border-radius: 3px; font-size: 10px; min-height: 30px; border: 1px solid #eee;">
                    ${detalle.transcripcion_problema || 'No se registró descripción'}
                </div>
                ${audioHTML}
            </div>
            
            <!-- FIRMAS -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 10px; padding-top: 10px; border-top: 2px solid #ddd;">
                <div style="text-align: center;">
                    <p style="font-weight: 600; color: #C1121F; margin-bottom: 3px; font-size: 10px;">FIRMA DEL CLIENTE</p>
                    <div style="border-bottom: 1px solid #222; height: 25px; margin-bottom: 3px;"></div>
                    <div style="font-size: 9px; color: #555;">${clienteNombre}</div>
                    <div style="font-size: 8px; color: #999;">${fechaActual}</div>
                </div>
                <div style="text-align: center;">
                    <p style="font-weight: 600; color: #C1121F; margin-bottom: 3px; font-size: 10px;">FIRMA DEL JEFE OPERATIVO</p>
                    <div style="border-bottom: 1px solid #222; height: 25px; margin-bottom: 3px;"></div>
                    <div style="font-size: 9px; color: #555;">${jefePrincipal}</div>
                    <div style="font-size: 8px; color: #999;">${fechaActual}</div>
                    ${jefePrincipalContacto ? `<div style="font-size: 8px; color: #999;">Contacto: ${jefePrincipalContacto}</div>` : ''}
                </div>
            </div>
            
            <!-- FOOTER -->
            <div style="text-align: center; margin-top: 10px; padding-top: 6px; border-top: 1px solid #eee; font-size: 8px; color: #bbb;">
                <span>Documento generado automáticamente</span> | 
                <span>Código: ${detalle.codigo_unico || 'N/A'}</span> | 
                <span>${new Date().toLocaleString('es-ES')}</span>
                <p style="margin: 2px 0 0 0; color: #bbb;">FURIA MOTOR COMPANY - Todos los derechos reservados</p>
            </div>
        </div>
    `;
}

// =====================================================
// FUNCIÓN PARA DESCARGAR PDF - VERSIÓN CON html2pdf
// =====================================================
async function descargarPDFFinal() {
    if (descargandoPDF) {
        mostrarNotificacion('⏳ Ya se está generando el PDF, espera un momento...', 'warning');
        return;
    }
    
    if (!datosReporteFinal) {
        mostrarNotificacion('⚠️ No hay datos para generar PDF', 'warning');
        return;
    }

    descargandoPDF = true;
    
    const btnDescargar = document.getElementById('btnDescargarPDFFinal');
    if (btnDescargar) {
        btnDescargar.disabled = true;
        btnDescargar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    }

    showProgress('Generando PDF', 'Preparando el documento...', 3);
    updateProgressBar(10, 1);
    updateProgressMessage('Generando contenido del reporte...');

    try {
        // =============================================
        // 1. Generar el HTML del reporte
        // =============================================
        const reporteHTML = generarHTMLReporte(datosReporteFinal);

        const container = document.createElement('div');
        container.id = 'pdfContainer';
        container.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            padding: 30px;
            background: white;
            font-family: Arial, sans-serif;
            z-index: -1;
            opacity: 0;
            pointer-events: none;
            overflow: visible;
        `;
        container.innerHTML = reporteHTML;
        document.body.appendChild(container);

        updateProgressBar(30, 1);
        updateProgressMessage('Renderizando contenido...');

        await new Promise(resolve => setTimeout(resolve, 500));

        // =============================================
        // 2. Forzar carga de imágenes
        // =============================================
        const imagenes = container.querySelectorAll('img');
        for (const img of imagenes) {
            if (img.src && img.src.startsWith('data:image')) {
                // Ya es base64, no hacer nada
                continue;
            }
            if (img.src && img.src.includes('googleusercontent.com')) {
                const cleanUrl = img.src.split('?')[0];
                const id = img.src.split('id=')[1]?.split('&')[0];
                if (id) {
                    img.src = `https://drive.google.com/uc?export=view&id=${id}&cache=${Date.now()}`;
                    img.crossOrigin = 'anonymous';
                }
            }
        }

        // Esperar a que las imágenes carguen
        const promesasImagenes = Array.from(imagenes).map(img => {
            return new Promise((resolve) => {
                if (img.complete && img.naturalHeight > 0) {
                    resolve();
                    return;
                }
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 10000);
            });
        });

        await Promise.race([
            Promise.all(promesasImagenes),
            new Promise(resolve => setTimeout(resolve, 15000))
        ]);

        await new Promise(resolve => setTimeout(resolve, 500));

        updateProgressBar(50, 2);
        updateProgressMessage('Generando archivo PDF...');

        const elemento = container.querySelector('.reporte-container');
        if (!elemento) {
            throw new Error('No se encontró el contenido del reporte');
        }

        // =============================================
        // 3. Verificar que html2pdf está disponible
        // =============================================
        if (typeof html2pdf === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // =============================================
        // 4. Generar PDF con html2pdf
        // =============================================
        const opt = {
            margin: [8, 8, 8, 8],
            filename: `Reporte_${datosReporteFinal.codigo_unico || 'orden'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                letterRendering: true,
                onclone: function(doc) {
                    const imgs = doc.querySelectorAll('img');
                    imgs.forEach(img => {
                        if (img.src && img.src.includes('googleusercontent.com')) {
                            const cleanUrl = img.src.split('?')[0];
                            const id = img.src.split('id=')[1]?.split('&')[0];
                            if (id) {
                                img.src = `https://drive.google.com/uc?export=view&id=${id}&cache=${Date.now()}`;
                                img.crossOrigin = 'anonymous';
                            }
                        }
                    });
                }
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        updateProgressBar(70, 2);
        updateProgressMessage('Generando PDF...');

        await html2pdf().set(opt).from(elemento).save();

        updateProgressBar(100, 3);
        setTimeout(() => {
            completeProgress(true);
            mostrarNotificacion('✅ PDF descargado exitosamente', 'success');
        }, 500);

        setTimeout(() => {
            if (container && document.body.contains(container)) {
                document.body.removeChild(container);
            }
        }, 3000);

    } catch (error) {
        console.error('❌ Error generando PDF:', error);
        completeProgress(false);
        mostrarNotificacion('❌ Error al generar PDF: ' + error.message, 'error');
    }

    if (btnDescargar) {
        btnDescargar.disabled = false;
        btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF';
    }
    
    descargandoPDF = false;
}

// =====================================================
// FUNCIÓN ALTERNATIVA PARA DESCARGAR PDF (FALLBACK)
// =====================================================
async function descargarPDFAlternativo() {
    return new Promise(async (resolve, reject) => {
        try {
            const reporteHTML = generarHTMLReporte(datosReporteFinal);
            
            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed;
                left: 0;
                top: 0;
                width: 100%;
                max-width: 800px;
                margin: 0 auto;
                padding: 30px;
                background: white;
                font-family: Arial, sans-serif;
                z-index: -1;
                opacity: 0;
                pointer-events: none;
                overflow: visible;
            `;
            container.innerHTML = reporteHTML;
            document.body.appendChild(container);

            await new Promise(resolve => setTimeout(resolve, 500));

            const contenido = container.querySelector('.reporte-container');
            if (!contenido) {
                throw new Error('No se encontró el contenido del reporte');
            }

            if (typeof html2pdf === 'undefined') {
                throw new Error('html2pdf no está disponible');
            }

            const opt = {
                margin: [10, 10, 10, 10],
                filename: `Reporte_${datosReporteFinal.codigo_unico || 'orden'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    letterRendering: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff'
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait'
                },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            await html2pdf()
                .set(opt)
                .from(contenido)
                .save();

            mostrarNotificacion('✅ PDF descargado (método alternativo)', 'success');
            
            setTimeout(() => {
                if (container && document.body.contains(container)) {
                    document.body.removeChild(container);
                }
            }, 5000);
            
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// =====================================================
// FUNCIÓN PARA MOSTRAR EL MODAL CON EL REPORTE
// =====================================================
async function mostrarReporteFinal(idOrden) {
    const modal = document.getElementById('codigoOrdenModal');
    const body = document.getElementById('ordenCompletadaBody');
    const btnDescargar = document.getElementById('btnDescargarPDFFinal');
    
    if (!modal || !body) return;
    
    if (btnDescargar) btnDescargar.style.display = 'none';
    
    body.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #C1121F; margin-bottom: 20px;"></i>
            <h3 style="color: white; margin-bottom: 10px;">Generando reporte...</h3>
            <p style="color: #8E8E93;">Por favor espera, estamos preparando tu documento</p>
        </div>
    `;
    
    modal.classList.add('show');
    
    const detalle = await cargarDatosOrdenCompleta(idOrden);
    
    if (detalle) {
        const modalHeader = modal.querySelector('.modal-header h2');
        if (modalHeader) {
            modalHeader.innerHTML = `
                <i class="fas fa-check-circle" style="color: var(--verde-exito);"></i> 
                ✅ ¡Recepción Finalizada! - ${detalle.codigo_unico || 'OT-N/A'}
            `;
        }
        
        body.innerHTML = `
            <div style="text-align: center; padding: 30px 20px;">
                <i class="fas fa-check-circle" style="font-size: 48px; color: #10B981; margin-bottom: 20px;"></i>
                <h3 style="color: white; margin-bottom: 10px;">¡Recepción finalizada!</h3>
                <p style="color: #8E8E93; margin-bottom: 20px;">
                    El vehículo ha sido registrado con el código:<br>
                    <strong style="color: #C1121F; font-size: 20px; font-family: monospace;">${detalle.codigo_unico || 'OT-N/A'}</strong>
                </p>
                <p style="color: #8E8E93; font-size: 14px;">Haz clic en "Descargar PDF" para obtener el reporte completo.</p>
            </div>
        `;
        
        if (btnDescargar) {
            btnDescargar.style.display = 'inline-flex';
            btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF';
            btnDescargar.onclick = function(e) {
                e.preventDefault();
                descargarPDFFinal();
            };
        }
        
        datosReporteFinal = detalle;
        
        mostrarNotificacion('✅ Reporte listo para descargar', 'success');
        
    } else {
        body.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <h3>Error al cargar los datos</h3>
                <p>Intenta nuevamente o revisa la consola</p>
            </div>
        `;
        if (btnDescargar) btnDescargar.style.display = 'none';
    }
}

// =====================================================
// FUNCIONES DE EVENTOS Y VALIDACIÓN
// =====================================================
function setupEventListeners() {
    if (btnCrearSesion) btnCrearSesion.addEventListener('click', iniciarSesion);
    if (btnCancelarSesion) btnCancelarSesion.addEventListener('click', mostrarConfirmacionCancelar);
    if (btnFinalizar) btnFinalizar.addEventListener('click', finalizarSesionConReporte);
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

function mostrarModalCodigo(codigo) {
    const modal = document.getElementById('codigoModal');
    const span = document.getElementById('codigoSesionModal');
    if (span) span.textContent = codigo;
    if (modal) modal.classList.add('show');
    setTimeout(() => modal?.classList.remove('show'), 5000);
}

function mostrarCodigoGenerado(codigo) {
    console.log('Código generado (legacy):', codigo);
}

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
// DOM CONTENT LOADED
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('========================================');
    console.log('🚀 INICIANDO RECEPCION.JS (GOOGLE DRIVE)');
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
    initProgressElements();
    
    await recuperarSesionActiva();
    
    iniciarPollingSesiones();
    initRecepcionesPanel();
    
    console.log('✅ Recepcion.js inicializado correctamente (Google Drive)');
});

// =====================================================
// FUNCIONES GLOBALES
// =====================================================
window.unirseSesionConCodigo = unirseSesionConCodigo;
window.verDetalleRecepcion = verDetalleRecepcion;
window.editarRecepcion = editarRecepcion;
window.confirmarEliminarRecepcion = confirmarEliminarRecepcion;
window.cerrarModal = () => document.getElementById('codigoModal')?.classList.remove('show');
window.cerrarModalOrden = () => document.getElementById('codigoOrdenModal')?.classList.remove('show');
window.cerrarModalDetalle = () => document.getElementById('modalDetalleRecepcion')?.classList.remove('show');
window.cerrarModalEliminar = () => document.getElementById('modalConfirmarEliminar')?.classList.remove('show');
window.verImagenAmpliada = verImagenAmpliada;
window.descargarPDFFinal = descargarPDFFinal;
window.mostrarReporteFinal = mostrarReporteFinal;
window.cargarDatosOrdenCompleta = cargarDatosOrdenCompleta;
window.finalizarSesionConReporte = finalizarSesionConReporte;
window.logout = () => {
    detenerPolling();
    detenerKeepAlive();
    if (sesionesPolling) clearInterval(sesionesPolling);
    localStorage.clear();
    window.location.href = `${window.API_BASE_URL}/`;
};

console.log('✅ recepcion.js cargado - Versión con Google Drive');