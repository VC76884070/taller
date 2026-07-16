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

// Variables para recepciones guardadas - PAGINACIÓN
let recepcionesActuales = [];
let paginaActual = 1;
let itemsPorPagina = 10;
let recepcionSeleccionada = null;
let modoEdicionRecepcion = false;
let recepcionEditandoId = null;
let cargandoMas = false;
let noHayMasRecepciones = false;
let totalRecepciones = 0;
let offsetActual = 0;
const LIMITE_RECEPCIONES = 5;

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

// Variables para barra de progreso de operaciones
let progressOverlay = null;
let currentProgress = 0;
let progressInterval = null;

// Variable para almacenar datos del reporte
let datosReporteFinal = null;

// Variable para controlar si ya se está descargando
let descargandoPDF = false;

// =====================================================
// COLA DE PROCESAMIENTO PARA SUBIR FOTOS (SECUENCIAL)
// =====================================================
let uploadQueue = [];
let isProcessingQueue = false;
let uploadResults = [];
let colaActiva = false;

// =====================================================
// CONFIGURACIÓN DE REINTENTOS
// =====================================================
const MAX_UPLOAD_RETRIES = 3;
const RETRY_DELAY = 2000;

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
    { id: 'fotoLateralIzq', nombre: 'lateral_izquierdo', label: 'Lateral Izquierdo', icono: 'fa-car-side', campo: 'lateral_izquierdo' },
    { id: 'fotoLateralDer', nombre: 'lateral_derecho', label: 'Lateral Derecho', icono: 'fa-car-side', campo: 'lateral_derecho' },
    { id: 'fotoFrontal', nombre: 'frontal', label: 'Frontal', icono: 'fa-car', campo: 'frontal' },
    { id: 'fotoTrasera', nombre: 'trasera', label: 'Trasera', icono: 'fa-car', campo: 'trasera' },
    { id: 'fotoSuperior', nombre: 'superior', label: 'Superior', icono: 'fa-arrow-up', campo: 'superior' },
    { id: 'fotoInferior', nombre: 'inferior', label: 'Inferior', icono: 'fa-arrow-down', campo: 'inferior' },
    { id: 'fotoTablero', nombre: 'tablero', label: 'Tablero', icono: 'fa-tachometer-alt', campo: 'tablero' }
];

// =====================================================
// FUNCIÓN PARA ACTUALIZAR PROGRESO INDIVIDUAL DE CADA FOTO
// =====================================================
function actualizarProgresoFoto(campo, progreso, estado = 'pending') {
    const ring = document.getElementById(`ring-${campo}`);
    const percent = document.getElementById(`percent-${campo}`);
    const badge = document.getElementById(`badge-${campo}`);
    const bar = document.getElementById(`bar-${campo}`);
    const status = document.getElementById(`status-${campo}`);
    
    if (!ring && !percent && !badge && !bar && !status) return;
    
    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progreso / 100) * circumference;
    
    if (ring) {
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = offset;
        ring.className = 'ring-fg';
        if (estado === 'completed') ring.classList.add('completed');
        else if (estado === 'error') ring.classList.add('error');
    }
    
    if (percent) {
        if (estado === 'completed') {
            percent.textContent = '✓';
            percent.className = 'progress-percent completed';
        } else if (estado === 'error') {
            percent.textContent = '✕';
            percent.className = 'progress-percent error';
        } else {
            percent.textContent = `${Math.round(progreso)}%`;
            percent.className = 'progress-percent';
        }
    }
    
    if (badge) {
        badge.className = 'status-badge-foto';
        const icons = {
            pending: '<i class="fas fa-circle"></i>',
            uploading: '<i class="fas fa-spinner fa-spin"></i>',
            completed: '<i class="fas fa-check"></i>',
            error: '<i class="fas fa-times"></i>'
        };
        badge.innerHTML = icons[estado] || icons.pending;
        if (estado === 'uploading') badge.classList.add('uploading');
        else if (estado === 'completed') badge.classList.add('completed');
        else if (estado === 'error') badge.classList.add('error');
        else badge.classList.add('pending');
    }
    
    const barContainer = bar?.closest('.progress-bar-foto');
    const statusContainer = status?.closest('.uploading-status');
    
    if (estado === 'uploading') {
        if (barContainer) barContainer.style.display = 'block';
        if (statusContainer) statusContainer.style.display = 'flex';
    } else if (estado === 'completed' || estado === 'error') {
        setTimeout(() => {
            if (barContainer) barContainer.style.display = 'none';
            if (statusContainer) statusContainer.style.display = 'none';
        }, 2000);
    } else {
        if (barContainer) barContainer.style.display = 'none';
        if (statusContainer) statusContainer.style.display = 'none';
    }
    
    if (bar) {
        bar.style.width = `${Math.min(progreso, 100)}%`;
        bar.className = 'fill';
        if (estado === 'completed') bar.classList.add('completed');
        else if (estado === 'error') bar.classList.add('error');
    }
    
    if (status) {
        status.className = 'uploading-status';
        const textos = {
            pending: '<i class="fas fa-clock"></i> <span>En cola...</span>',
            uploading: '<i class="fas fa-spinner fa-spin"></i> <span>Subiendo...</span>',
            completed: '<i class="fas fa-check-circle"></i> <span>Completado</span>',
            error: '<i class="fas fa-exclamation-circle"></i> <span>Error - Haz clic para reintentar</span>'
        };
        status.innerHTML = textos[estado] || textos.pending;
        if (estado === 'completed') status.classList.add('completed');
        else if (estado === 'error') status.classList.add('error');
    }
}

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
// FUNCIÓN PARA HACER PETICIONES CON TOKEN - CORREGIDA
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
        
        // 🔥 SOLO manejar 401 si NO es una petición de subida
        if (response.status === 401) {
            const isUpload = url.includes('upload-foto') || url.includes('upload-audio');
            
            // 🔥 Si es upload, NO redirigir, solo lanzar error controlado
            if (isUpload) {
                logger.warn('[fetchWithToken] ⚠️ Error 401 en subida - Token expirado');
                throw new Error('Sesión expirada - Reintenta subir la foto');
            }
            
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
                        // Guardar nuevo token
                        localStorage.setItem('furia_token', refreshData.token);
                        
                        // Reintentar la petición original con el nuevo token
                        const newHeaders = {
                            ...headers,
                            'Authorization': `Bearer ${refreshData.token}`
                        };
                        
                        // Si es FormData, no usar Content-Type
                        if (options.body && options.body instanceof FormData) {
                            delete newHeaders['Content-Type'];
                        }
                        
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
            
            // 🔥 SOLO redirigir si NO es una subida
            if (!url.includes('upload-foto') && !url.includes('upload-audio')) {
                logger.error('[fetchWithToken] ❌ Error 401 - Token inválido o expirado');
                mostrarNotificacion('⏳ Tu sesión expiró. Por favor, inicia sesión nuevamente.', 'warning');
                localStorage.clear();
                
                setTimeout(() => {
                    window.location.href = `${window.API_BASE_URL}/`;
                }, 1500);
            }
            
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
// BARRA DE PROGRESO PARA OPERACIONES
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
// COLA DE PROCESAMIENTO PARA SUBIR FOTOS (SECUENCIAL)
// =====================================================

function encolarFoto(file, campo, label) {
    uploadQueue.push({
        file: file,
        campo: campo,
        label: label,
        intentos: 0
    });
    
    actualizarProgresoFoto(campo, 0, 'pending');
    
    if (!isProcessingQueue) {
        procesarCola();
    }
}

// =====================================================
// PROCESAR COLA - CORREGIDO
// =====================================================
async function procesarCola() {
    if (uploadQueue.length === 0) {
        isProcessingQueue = false;
        colaActiva = false;
        
        const total = uploadResults.length;
        const exitos = uploadResults.filter(r => r.success).length;
        const errores = uploadResults.filter(r => !r.success).length;
        
        if (errores > 0) {
            mostrarNotificacion(`⚠️ ${exitos} subidas exitosas, ${errores} errores`, 'warning');
        } else {
            mostrarNotificacion(`✅ ${exitos} fotos subidas exitosamente`, 'success');
        }
        
        setTimeout(() => {
            validarCompletadoFotos();
        }, 500);
        
        return;
    }
    
    isProcessingQueue = true;
    colaActiva = true;
    
    const item = uploadQueue.shift();
    const { file, campo, label } = item;
    
    const uploadDiv = document.getElementById(`upload-${campo}`);
    const barContainer = document.querySelector(`#upload-${campo} .progress-bar-foto`);
    const statusContainer = document.querySelector(`#upload-${campo} .uploading-status`);
    
    if (barContainer) barContainer.style.display = 'block';
    if (statusContainer) statusContainer.style.display = 'flex';
    
    actualizarProgresoFoto(campo, 0, 'uploading');
    
    let progreso = 0;
    const interval = setInterval(() => {
        progreso += Math.random() * 15 + 5;
        if (progreso > 90) progreso = 90;
        actualizarProgresoFoto(campo, progreso, 'uploading');
    }, 300);
    
    try {
        const url = await subirFotoGoogleDrive(file, codigoSesion || 'temp', campo);
        
        clearInterval(interval);
        
        actualizarProgresoFoto(campo, 100, 'completed');
        uploadResults.push({ campo, label, success: true, url });
        
        // 🔥 GUARDAR URL EN TODOS LOS LUGARES POSIBLES
        if (uploadDiv) {
            // 🔥 IMPORTANTE: Usar setAttribute para asegurar que se guarde
            uploadDiv.setAttribute('data-drive-url', url);
            uploadDiv.dataset.driveUrl = url;
            fotosSubidasLocal[campo] = url;
            uploadDiv.classList.remove('error');
            uploadDiv.classList.add('has-image');
            
            // Actualizar preview
            const preview = uploadDiv.querySelector('.upload-preview');
            if (preview) {
                preview.style.backgroundImage = `url('${url}')`;
            }
            
            console.log(`✅ Foto ${label} subida y guardada: ${url}`);
        }
        
        // 🔥 ACTUALIZAR SESIÓN EN BACKEND
        try {
            await actualizarSesionFoto(campo, url);
            console.log(`✅ Sesión actualizada para ${label}`);
        } catch (e) {
            console.warn('⚠️ No se pudo actualizar sesión:', e);
        }
        
        // 🔥 FORZAR VALIDACIÓN
        setTimeout(() => {
            validarCompletadoFotos();
        }, 500);
        
        setTimeout(() => {
            if (barContainer) barContainer.style.display = 'none';
            if (statusContainer) statusContainer.style.display = 'none';
        }, 1500);
        
    } catch (error) {
        clearInterval(interval);
        
        actualizarProgresoFoto(campo, 100, 'error');
        console.error(`❌ Error subiendo ${label}:`, error);
        uploadResults.push({ campo, label, success: false, error: error.message });
        
        if (uploadDiv) {
            uploadDiv.classList.add('error');
            const input = uploadDiv.querySelector('input[type="file"]');
            if (input) {
                input.value = '';
            }
        }
        
        mostrarNotificacion(`❌ Error en ${label}: ${error.message}`, 'error');
    }
    
    setTimeout(() => {
        procesarCola();
    }, 500);
}

async function subirFotoGoogleDrive(file, carpeta, campo) {
    return new Promise(async (resolve, reject) => {
        if (subidasActivas[campo]) {
            reject(new Error(`Ya hay una subida en curso para ${campo}`));
            return;
        }
        
        subidasActivas[campo] = true;
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('carpeta', carpeta || 'recepcion');
            formData.append('campo', campo);
            formData.append('codigo_sesion', codigoSesion);
            
            const url = `${API_URL}/jefe-operativo/upload-foto`;
            const token = localStorage.getItem('furia_token');
            
            // 🔥 USAR FETCH NORMAL PARA SUBIDAS (NO fetchWithToken)
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            // 🔥 Manejar 401 específicamente en subidas
            if (response.status === 401) {
                // Intentar refrescar token
                try {
                    const refreshResponse = await fetch(`${API_URL}/refresh-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: token })
                    });
                    
                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        if (refreshData.token) {
                            localStorage.setItem('furia_token', refreshData.token);
                            
                            // Reintentar subida con nuevo token
                            const retryResponse = await fetch(url, {
                                method: 'POST',
                                body: formData,
                                headers: {
                                    'Authorization': `Bearer ${refreshData.token}`
                                }
                            });
                            
                            if (retryResponse.ok) {
                                const data = await retryResponse.json();
                                if (data.success && data.url) {
                                    resolve(data.url);
                                    return;
                                }
                            }
                        }
                    }
                } catch (refreshError) {
                    logger.error('❌ Error refrescando token en subida:', refreshError);
                }
                
                // Si falla el refresh, mostrar notificación y permitir reintentar
                mostrarNotificacion('⚠️ Tu sesión expiró. Vuelve a intentar subir la foto.', 'warning');
                reject(new Error('Sesión expirada - Reintenta subir la foto'));
                return;
            }
            
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
        } finally {
            delete subidasActivas[campo];
        }
    });
}

// =====================================================
// ACTUALIZAR FOTO EN SESIÓN
// =====================================================
async function actualizarSesionFoto(campo, url) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/actualizar-foto-sesion`, {
            method: 'POST',
            body: JSON.stringify({
                codigo_sesion: codigoSesion,
                campo: campo,
                url: url
            })
        });
        
        const data = await response.json();
        if (data.success) {
            if (data.completado) {
                seccionesCompletadasLocal.fotos = true;
                actualizarEstadoVisualSeccion('fotos', true);
                actualizarBotonFinalizar();
            }
            return data;
        }
    } catch (error) {
        console.warn('⚠️ No se pudo actualizar sesión:', error);
    }
}

// =====================================================
// VERIFICAR FOTOS DE SESIÓN
// =====================================================
async function verificarFotosSesion(codigo) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/verificar-fotos/${codigo}`, {
            method: 'GET'
        });
        
        const data = await response.json();
        if (data.success) {
            return data;
        }
    } catch (error) {
        console.warn('⚠️ No se pudo verificar fotos:', error);
    }
    return null;
}

// =====================================================
// COMPRIMIR IMAGEN
// =====================================================
async function comprimirImagen(file) {
    try {
        if (file.size < 500 * 1024) {
            return file;
        }
        
        if (typeof imageCompressor !== 'undefined') {
            return await imageCompressor.compress(file, {
                maxWidth: 1280,
                maxHeight: 1280,
                quality: 0.75,
                maxSizeMB: 1.2
            });
        }
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxSize = 1280;
                    
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = (height / width) * maxSize;
                            width = maxSize;
                        } else {
                            width = (width / height) * maxSize;
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob(function(blob) {
                        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                    }, 'image/jpeg', 0.75);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    } catch (error) {
        console.warn('⚠️ Error comprimiendo imagen, usando original:', error);
        return file;
    }
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
    
    if (uploadDiv.dataset.driveUrl) {
        delete uploadDiv.dataset.driveUrl;
        delete fotosSubidasLocal[foto.campo];
        console.log(`🔄 Reemplazando foto: ${foto.label}`);
    }
    
    if (preview) {
        const objectUrl = URL.createObjectURL(file);
        preview.style.backgroundImage = `url('${objectUrl}')`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        
        preview.innerHTML = '';
        preview.style.display = 'block';
        uploadDiv.classList.add('has-image');
        uploadDiv.classList.remove('error');
        
        const ringContainer = document.createElement('div');
        ringContainer.className = 'progress-ring-container';
        ringContainer.innerHTML = `
            <svg viewBox="0 0 50 50">
                <circle class="ring-bg" cx="25" cy="25" r="22"/>
                <circle class="ring-fg" cx="25" cy="25" r="22" id="ring-${foto.campo}"/>
            </svg>
            <span class="progress-percent" id="percent-${foto.campo}">0%</span>
        `;
        preview.appendChild(ringContainer);
        
        const badge = document.createElement('div');
        badge.className = 'status-badge-foto pending';
        badge.id = `badge-${foto.campo}`;
        badge.innerHTML = '<i class="fas fa-circle"></i>';
        preview.appendChild(badge);
        
        const barContainer = document.createElement('div');
        barContainer.className = 'progress-bar-foto';
        barContainer.innerHTML = `<div class="fill" id="bar-${foto.campo}"></div>`;
        barContainer.style.display = 'none';
        preview.appendChild(barContainer);
        
        const statusText = document.createElement('div');
        statusText.className = 'uploading-status';
        statusText.id = `status-${foto.campo}`;
        statusText.innerHTML = '<i class="fas fa-clock"></i> <span>En cola...</span>';
        statusText.style.display = 'none';
        preview.appendChild(statusText);
        
        preview.dataset.campo = foto.campo;
        
        if (uploadDiv.dataset.objectUrl) {
            URL.revokeObjectURL(uploadDiv.dataset.objectUrl);
        }
        uploadDiv.dataset.objectUrl = objectUrl;
        
        if (removeBtn) removeBtn.style.display = 'flex';
    }
    
    try {
        const fileToUpload = await comprimirImagen(file);
        encolarFoto(fileToUpload, foto.campo, foto.label);
        validarCompletadoFotos();
    } catch (error) {
        console.error(`❌ Error en ${foto.label}:`, error);
        mostrarNotificacion(`Error: ${error.message || 'No se pudo procesar la foto'}`, 'error');
        
        if (preview) {
            preview.style.backgroundImage = '';
            preview.innerHTML = '';
            preview.style.display = '';
            uploadDiv.classList.remove('has-image');
            uploadDiv.classList.add('error');
        }
        if (removeBtn) removeBtn.style.display = 'none';
        input.value = '';
        actualizarProgresoFoto(foto.campo, 100, 'error');
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

// =====================================================
// FUNCIÓN: ELIMINAR AUDIO EN MODO EDICIÓN
// =====================================================

function eliminarGrabacion() {
    audioBlob = null;
    audioChunks = [];
    
    // Si estamos en modo edición, marcar que el audio fue eliminado
    if (modoEdicionRecepcion) {
        audioDriveUrl = null;
        window.audioOriginalRecepcion = null;
        mostrarNotificacion('🎵 Audio eliminado de la edición', 'info');
    } else {
        audioDriveUrl = null;
    }
    
    if (audioPreview) {
        if (audioPreview.src && audioPreview.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioPreview.src);
        }
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (audioStatus) {
        audioStatus.textContent = modoEdicionRecepcion ? 'Audio eliminado' : 'Grabación eliminada';
        audioStatus.style.color = 'var(--gris-texto)';
    }
    if (btnEliminarAudio) {
        btnEliminarAudio.style.display = 'none';
    }
    if (btnGrabarAudio) {
        btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
    }
    isRecording = false;
    
    if (codigoSesion && descripcionProblema?.value.trim()) {
        guardarSeccion('descripcion');
    }
    validarCompletadoDescripcion();
}
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
            
            // 🔥 Manejar 401 en audio
            if (response.status === 401) {
                try {
                    const refreshResponse = await fetch(`${API_URL}/refresh-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: token })
                    });
                    
                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        if (refreshData.token) {
                            localStorage.setItem('furia_token', refreshData.token);
                            
                            const retryResponse = await fetch(url, {
                                method: 'POST',
                                body: formData,
                                headers: {
                                    'Authorization': `Bearer ${refreshData.token}`
                                }
                            });
                            
                            if (retryResponse.ok) {
                                const data = await retryResponse.json();
                                if (data.success && data.url) {
                                    resolve(data.url);
                                    return;
                                }
                            }
                        }
                    }
                } catch (refreshError) {
                    logger.error('❌ Error refrescando token en audio:', refreshError);
                }
                
                mostrarNotificacion('⚠️ Sesión expirada. Reintenta subir el audio.', 'warning');
                reject(new Error('Sesión expirada - Reintenta subir el audio'));
                return;
            }
            
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
// =====================================================
// VALIDAR COMPLETADO DE FOTOS - CORREGIDO
// =====================================================
function validarCompletadoFotos() {
    let fotosConImagen = 0;
    let fotosConUrl = 0;
    
    console.log('📸 [validarCompletadoFotos] INICIO');
    
    // 🔥 PRIMERO: Contar fotos desde el DOM usando getAttribute
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        
        // Verificar si tiene imagen
        const hasImage = uploadDiv?.classList.contains('has-image') || false;
        if (hasImage) {
            fotosConImagen++;
        }
        
        // 🔥 IMPORTANTE: Usar getAttribute en lugar de dataset directamente
        let driveUrl = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
        
        // Si no tiene URL, intentar recuperar de fotosSubidasLocal
        if (!driveUrl && fotosSubidasLocal[foto.campo]) {
            driveUrl = fotosSubidasLocal[foto.campo];
            if (uploadDiv) {
                uploadDiv.setAttribute('data-drive-url', driveUrl);
                uploadDiv.dataset.driveUrl = driveUrl;
            }
        }
        
        // Si aún no tiene URL, intentar de la sesión
        if (!driveUrl && sesionActual?.datos?.fotos?.[foto.campo]) {
            const url = sesionActual.datos.fotos[foto.campo];
            if (url && url !== 'null' && url !== '') {
                driveUrl = url;
                if (uploadDiv) {
                    uploadDiv.setAttribute('data-drive-url', driveUrl);
                    uploadDiv.dataset.driveUrl = driveUrl;
                    fotosSubidasLocal[foto.campo] = driveUrl;
                }
            }
        }
        
        // Verificar si la URL es válida
        if (driveUrl && driveUrl !== 'null' && driveUrl !== '') {
            fotosConUrl++;
            console.log(`✅ ${foto.label}: URL válida (${driveUrl.substring(0, 40)}...)`);
        } else {
            console.log(`❌ ${foto.label}: SIN URL`);
        }
    }
    
    console.log(`📸 DOM: ${fotosConImagen} imágenes, ${fotosConUrl} URLs válidas`);
    
    // 🔥 Si hay 7 fotos con URL, marcar como completado
    if (fotosConUrl === 7) {
        console.log('✅ ¡TODAS LAS FOTOS ESTÁN COMPLETAS! (7/7)');
        seccionesCompletadasLocal.fotos = true;
        actualizarEstadoVisualSeccion('fotos', true);
        actualizarBotonFinalizar();
        
        const fotosBadge = document.getElementById('statusFotos');
        if (fotosBadge) {
            fotosBadge.textContent = '✓ Completado (7/7)';
            fotosBadge.classList.add('completado');
            fotosBadge.classList.remove('en-proceso');
        }
        return true;
    }
    
    // 🔥 Estado intermedio - mostrar progreso
    const fotosBadge = document.getElementById('statusFotos');
    if (fotosBadge) {
        if (fotosConUrl > 0) {
            fotosBadge.textContent = `⏳ ${fotosConUrl}/7 en Drive`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
        } else if (fotosConImagen > 0) {
            fotosBadge.textContent = `⏳ ${fotosConImagen}/7 fotos`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
        } else {
            fotosBadge.textContent = `○ 0/7 fotos`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
        }
    }
    
    // Actualizar estado local
    seccionesCompletadasLocal.fotos = false;
    actualizarBotonFinalizar();
    
    console.log(`📸 Resultado final: ❌ PENDIENTE (${fotosConUrl}/7)`);
    return false;
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
                let url = uploadDiv?.dataset.driveUrl;
                if (!url && sesionActual?.datos?.fotos) {
                    url = sesionActual.datos.fotos[foto.campo];
                }
                fotosData[foto.campo] = url || null;
            }
            datos = fotosData;
            console.log('📸 Enviando fotos al backend:', datos);
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
            
            if (data.sesion.secciones_completadas) {
                if (seccion === 'fotos') {
                    const fotos = data.sesion.datos?.fotos || {};
                    const fotos_validas = Object.values(fotos).filter(v => v && v !== 'null' && v !== '').length;
                    seccionesCompletadasLocal.fotos = fotos_validas === 7;
                    
                    const fotosBadge = document.getElementById('statusFotos');
                    if (fotosBadge) {
                        if (fotos_validas === 7) {
                            fotosBadge.textContent = '✓ Completado (7/7)';
                            fotosBadge.classList.add('completado');
                            fotosBadge.classList.remove('en-proceso');
                        } else {
                            fotosBadge.textContent = `⏳ ${fotos_validas}/7 en Drive`;
                            fotosBadge.classList.add('en-proceso');
                            fotosBadge.classList.remove('completado');
                        }
                    }
                    
                    console.log(`📸 Fotos en sesión: ${fotos_validas}/7`);
                } else {
                    seccionesCompletadasLocal[seccion] = data.sesion.secciones_completadas[seccion];
                    actualizarEstadoVisualSeccion(seccion, data.sesion.secciones_completadas[seccion]);
                }
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
            if (url && url !== 'null' && url !== '') {
                const uploadDiv = document.getElementById(`upload-${foto.id}`);
                const preview = uploadDiv?.querySelector('.upload-preview');
                if (preview) {
                    preview.style.backgroundImage = `url('${url}')`;
                    preview.style.backgroundSize = 'cover';
                    preview.style.backgroundPosition = 'center';
                    preview.innerHTML = '';
                    uploadDiv.classList.add('has-image');
                    // 🔥 Usar setAttribute
                    uploadDiv.setAttribute('data-drive-url', url);
                    uploadDiv.dataset.driveUrl = url;
                    fotosSubidasLocal[foto.campo] = url;
                    const removeBtn = uploadDiv.querySelector('.remove-photo');
                    if (removeBtn) removeBtn.style.display = 'flex';
                    actualizarProgresoFoto(foto.campo, 100, 'completed');
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
    
    uploadQueue = [];
    uploadResults = [];
    isProcessingQueue = false;
    colaActiva = false;
    
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
        upload.classList.remove('error');
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
        const campo = upload.dataset.campo;
        if (campo) {
            actualizarProgresoFoto(campo, 0, 'pending');
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
    
    ['Cliente', 'Vehiculo', 'Fotos', 'Descripcion'].forEach(seccion => {
        const badge = document.getElementById(`status${seccion}`);
        if (badge) {
            badge.textContent = '○ Pendiente';
            badge.classList.remove('completado');
            badge.classList.add('en-proceso');
        }
    });
    
    actualizarBotonFinalizar();
}

function mostrarConfirmacionCancelar() {
    if (confirm('¿Cancelar recepción? Se perderán todos los datos.\n\n⚠️ Esta acción:\n• Eliminará TODAS las fotos subidas\n• Eliminará la carpeta en Google Drive\n• No se podrá deshacer')) {
        if (codigoSesion) {
            mostrarNotificacion('⏳ Eliminando sesión y archivos...', 'info');
            
            fetchWithToken(`${API_URL}/jefe-operativo/cancelar-sesion`, {
                method: 'DELETE',
                body: JSON.stringify({ codigo: codigoSesion })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (data.carpeta_eliminada) {
                        mostrarNotificacion('✅ Sesión cancelada y carpeta eliminada', 'success');
                    } else {
                        mostrarNotificacion('⚠️ Sesión cancelada, pero la carpeta no se pudo eliminar', 'warning');
                    }
                }
            })
            .catch(error => {
                console.error('Error cancelando sesión:', error);
                mostrarNotificacion('Error al cancelar sesión', 'error');
            })
            .finally(() => {
                limpiarSesionCompleta();
                if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
                if (sesionesList) {
                    sesionesList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Actualizando...</p></div>';
                }
                setTimeout(() => {
                    cargarSesionesActivas();
                }, 500);
            });
        } else {
            limpiarSesionCompleta();
            mostrarNotificacion('Recepción cancelada', 'success');
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
            cargarSesionesActivas();
        }
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
            
            if (sesionesCount) {
                sesionesCount.textContent = sesionesActivasFiltradas.length;
            }
        }
    } catch (error) {
        console.error('Error cargando sesiones activas:', error);
        if (sesionesList) {
            sesionesList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar sesiones</p></div>';
        }
    }
}

function renderSesionesActivas(sesiones) {
    if (!sesionesList) return;
    
    const activas = sesiones.filter(s => s.estado === 'activa');
    
    if (sesionesCount) sesionesCount.textContent = activas.length;
    
    if (activas.length === 0) {
        sesionesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay sesiones activas</p>
                <small style="color: var(--gris-texto); font-size: 0.7rem;">Crea una nueva sesión para comenzar</small>
            </div>
        `;
        return;
    }
    
    sesionesList.innerHTML = activas.map(s => {
        const colaboradoresCount = s.colaboradores_nombres?.length || 1;
        const estaCompleta = colaboradoresCount >= 2;
        const esActiva = codigoSesion === s.codigo;
        
        return `
            <div class="sesion-item ${esActiva ? 'active' : ''} ${estaCompleta ? 'full' : ''}">
                <div class="sesion-info">
                    <span class="sesion-codigo">${escapeHtml(s.codigo)}</span>
                    <div class="sesion-colaboradores">
                        <i class="fas fa-users"></i>
                        <span>${colaboradoresCount}/2</span>
                    </div>
                    ${s.creador_nombre ? `<span style="font-size: 0.6rem; color: var(--gris-texto);">Creada por: ${escapeHtml(s.creador_nombre)}</span>` : ''}
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
        // 🔥 SOLO ejecutar si NO hay subidas activas
        if (codigoSesion && !colaActiva && !isProcessingQueue) {
            if (!camposEnEdicion.cliente && !camposEnEdicion.vehiculo && !camposEnEdicion.descripcion) {
                cargarDatosSesionLigero();
            }
        }
    }, 3000); // 🔥 Cambiado a 3 segundos para mejor sincronización
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
        
        if (nuevasSecciones) {
            if (seccionesCompletadasLocal.cliente !== nuevasSecciones.cliente) {
                seccionesCompletadasLocal.cliente = nuevasSecciones.cliente;
                actualizarEstadoVisualSeccion('cliente', nuevasSecciones.cliente);
            }
            if (seccionesCompletadasLocal.vehiculo !== nuevasSecciones.vehiculo) {
                seccionesCompletadasLocal.vehiculo = nuevasSecciones.vehiculo;
                actualizarEstadoVisualSeccion('vehiculo', nuevasSecciones.vehiculo);
            }
            if (seccionesCompletadasLocal.fotos !== nuevasSecciones.fotos) {
                seccionesCompletadasLocal.fotos = nuevasSecciones.fotos;
                actualizarEstadoVisualSeccion('fotos', nuevasSecciones.fotos);
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
// RECEPCIONES GUARDADAS - VERSIÓN CON PAGINACIÓN
// =====================================================
function initRecepcionesPanel() {
    cargarRecepciones();
    
    const btnRefresh = document.getElementById('btnRefreshRecepciones');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            offsetActual = 0;
            recepcionesActuales = [];
            noHayMasRecepciones = false;
            cargarRecepciones();
        });
    }
    
    const searchInput = document.getElementById('searchRecepcion');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            offsetActual = 0;
            recepcionesActuales = [];
            noHayMasRecepciones = false;
            filtrarYMostrarRecepciones();
        });
    }
    
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    const estadoFiltro = document.getElementById('estadoFiltro');
    
    if (fechaDesde) fechaDesde.addEventListener('change', () => {
        offsetActual = 0;
        recepcionesActuales = [];
        noHayMasRecepciones = false;
        filtrarYMostrarRecepciones();
    });
    
    if (fechaHasta) fechaHasta.addEventListener('change', () => {
        offsetActual = 0;
        recepcionesActuales = [];
        noHayMasRecepciones = false;
        filtrarYMostrarRecepciones();
    });
    
    if (estadoFiltro) estadoFiltro.addEventListener('change', () => {
        offsetActual = 0;
        recepcionesActuales = [];
        noHayMasRecepciones = false;
        filtrarYMostrarRecepciones();
    });
    
    const btnAnterior = document.getElementById('btnPaginaAnterior');
    const btnSiguiente = document.getElementById('btnPaginaSiguiente');
    
    if (btnAnterior) {
        btnAnterior.addEventListener('click', () => {
            if (offsetActual >= LIMITE_RECEPCIONES) {
                offsetActual -= LIMITE_RECEPCIONES;
                cargarRecepciones();
            }
        });
    }
    
    if (btnSiguiente) {
        btnSiguiente.addEventListener('click', () => {
            if (!noHayMasRecepciones) {
                offsetActual += LIMITE_RECEPCIONES;
                cargarRecepciones();
            }
        });
    }
}

// =====================================================
// CARGAR RECEPCIONES CON PAGINACIÓN
// =====================================================
async function cargarRecepciones(append = false) {
    try {
        if (cargandoMas) return;
        cargandoMas = true;
        
        console.log(`📡 [cargarRecepciones] Cargando ${LIMITE_RECEPCIONES} recepciones desde offset ${offsetActual}...`);
        
        const listDiv = document.getElementById('recepcionesList');
        if (listDiv && !append) {
            listDiv.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #C1121F;"></i>
                    <p style="margin-top: 10px;">Cargando recepciones...</p>
                </div>
            `;
        }
        
        const response = await fetchWithToken(
            `${API_URL}/jefe-operativo/listar-recepciones?limit=${LIMITE_RECEPCIONES}&offset=${offsetActual}`, 
            { method: 'GET' }
        );
        
        console.log('📡 [cargarRecepciones] Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📡 [cargarRecepciones] Datos recibidos:', data);
        
        if (data.success && data.recepciones) {
            console.log(`📡 [cargarRecepciones] Cantidad de recepciones: ${data.recepciones.length}`);
            
            if (data.paginacion) {
                totalRecepciones = data.paginacion.total || 0;
                noHayMasRecepciones = !data.paginacion.has_more;
                
                const paginaInfo = document.getElementById('paginaInfo');
                if (paginaInfo) {
                    const paginaActual = Math.floor(offsetActual / LIMITE_RECEPCIONES) + 1;
                    const totalPaginas = Math.ceil(totalRecepciones / LIMITE_RECEPCIONES);
                    paginaInfo.textContent = `Página ${paginaActual} de ${totalPaginas || 1}`;
                }
                
                const btnAnterior = document.getElementById('btnPaginaAnterior');
                const btnSiguiente = document.getElementById('btnPaginaSiguiente');
                if (btnAnterior) btnAnterior.disabled = offsetActual === 0;
                if (btnSiguiente) btnSiguiente.disabled = noHayMasRecepciones;
            }
            
            if (append) {
                recepcionesActuales = [...recepcionesActuales, ...data.recepciones];
            } else {
                recepcionesActuales = data.recepciones;
            }
            
            const count = document.getElementById('recepcionesCount');
            if (count) count.textContent = totalRecepciones || recepcionesActuales.length;
            
            filtrarYMostrarRecepciones();
        } else {
            console.warn('⚠️ [cargarRecepciones] No se recibieron recepciones');
            if (!append) {
                recepcionesActuales = [];
                filtrarYMostrarRecepciones();
            }
        }
    } catch (error) {
        console.error('❌ [cargarRecepciones] Error:', error);
        mostrarNotificacion('Error cargando recepciones: ' + error.message, 'error');
        
        const listDiv = document.getElementById('recepcionesList');
        if (listDiv && !append) {
            listDiv.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #dc3545;"></i>
                    <p style="margin-top: 10px;">Error al cargar recepciones</p>
                    <small style="color: var(--gris-texto);">${error.message}</small>
                    <button onclick="cargarRecepciones()" style="margin-top: 10px; padding: 8px 20px; background: #C1121F; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-sync"></i> Reintentar
                    </button>
                </div>
            `;
        }
    } finally {
        cargandoMas = false;
    }
}

// =====================================================
// FILTRAR Y MOSTRAR RECEPCIONES - VERSIÓN OPTIMIZADA
// =====================================================
function filtrarYMostrarRecepciones() {
    const listDiv = document.getElementById('recepcionesList');
    if (!listDiv) return;
    
    console.log('📋 [filtrarYMostrarRecepciones] Total recepciones:', recepcionesActuales.length);
    
    let filtradas = [...recepcionesActuales];
    
    const searchTerm = document.getElementById('searchRecepcion')?.value?.toLowerCase() || '';
    if (searchTerm) {
        filtradas = filtradas.filter(r => {
            const codigo = (r.codigo_unico || '').toLowerCase();
            const placa = (r.placa || '').toLowerCase();
            const cliente = (r.cliente_nombre || '').toLowerCase();
            const marca = (r.marca || '').toLowerCase();
            const modelo = (r.modelo || '').toLowerCase();
            
            return codigo.includes(searchTerm) ||
                   placa.includes(searchTerm) ||
                   cliente.includes(searchTerm) ||
                   marca.includes(searchTerm) ||
                   modelo.includes(searchTerm);
        });
    }
    
    const fechaDesde = document.getElementById('fechaDesde')?.value;
    const fechaHasta = document.getElementById('fechaHasta')?.value;
    if (fechaDesde) {
        filtradas = filtradas.filter(r => r.fecha_ingreso && r.fecha_ingreso >= fechaDesde);
    }
    if (fechaHasta) {
        filtradas = filtradas.filter(r => r.fecha_ingreso && r.fecha_ingreso <= fechaHasta + 'T23:59:59');
    }
    
    const estadoFiltro = document.getElementById('estadoFiltro')?.value;
    if (estadoFiltro && estadoFiltro !== 'todos') {
        filtradas = filtradas.filter(r => r.estado_global === estadoFiltro);
    }
    
    const countSpan = document.getElementById('recepcionesCount');
    if (countSpan) countSpan.textContent = filtradas.length;
    
    if (filtradas.length === 0) {
        let mensaje = 'No hay recepciones que coincidan con los filtros';
        let subtitulo = '';
        
        if (recepcionesActuales.length === 0 && !noHayMasRecepciones) {
            mensaje = 'Cargando recepciones...';
            subtitulo = 'Por favor espera';
        } else if (recepcionesActuales.length === 0 && noHayMasRecepciones) {
            mensaje = 'No hay recepciones registradas';
            subtitulo = 'Comienza creando una nueva recepción';
        } else if (recepcionesActuales.length > 0) {
            subtitulo = `Hay ${recepcionesActuales.length} recepciones pero no coinciden con los filtros`;
        }
        
        listDiv.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>${mensaje}</p>
                ${subtitulo ? `<small style="color: var(--gris-texto); font-size: 0.7rem;">${subtitulo}</small>` : ''}
                ${!noHayMasRecepciones ? `
                <div style="margin-top: 15px;">
                    <i class="fas fa-spinner fa-spin" style="color: #C1121F;"></i>
                    <span style="color: var(--gris-texto); font-size: 0.8rem; margin-left: 8px;">Cargando más...</span>
                </div>
                ` : `
                <button onclick="cargarRecepciones()" style="margin-top: 10px; padding: 8px 20px; background: #C1121F; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync"></i> Recargar
                </button>
                `}
            </div>
        `;
        return;
    }
    
    listDiv.innerHTML = filtradas.map(rec => {
        const safeValue = (value, defaultValue = 'N/A') => {
            if (value === null || value === undefined || value === '' || 
                value === 'null' || value === 'None' || value === 'undefined') {
                return defaultValue;
            }
            return value;
        };
        
        const codigo = safeValue(rec.codigo_unico, 'OT-N/A');
        const estado = rec.estado_global || 'EnRecepcion';
        const estadoLabel = {
            'EnRecepcion': 'En Recepción',
            'EnTaller': 'En Taller',
            'Finalizado': 'Finalizado'
        }[estado] || estado;
        
        const clienteNombre = safeValue(rec.cliente_nombre);
        const placa = safeValue(rec.placa);
        const marca = safeValue(rec.marca, '');
        const modelo = safeValue(rec.modelo, '');
        
        let vehiculoTexto = 'Vehículo sin especificar';
        if (marca && modelo) {
            vehiculoTexto = `${marca} ${modelo}`;
        } else if (marca) {
            vehiculoTexto = marca;
        } else if (modelo) {
            vehiculoTexto = modelo;
        }
        
        const fechaFormateada = rec.fecha_ingreso ? 
            new Date(rec.fecha_ingreso).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }) : 'Fecha N/A';
        
        return `
            <div class="recepcion-card estado-${estado}">
                <div class="recepcion-header">
                    <span class="recepcion-codigo">${escapeHtml(codigo)}</span>
                    <span class="recepcion-estado ${estado}">${estadoLabel}</span>
                </div>
                
                <div class="recepcion-body">
                    <div class="recepcion-info-item">
                        <div class="icon-wrapper">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <span class="info-label">Cliente</span>
                            <span class="info-value" title="${escapeHtml(clienteNombre)}">${escapeHtml(clienteNombre)}</span>
                        </div>
                    </div>
                    <div class="recepcion-info-item">
                        <div class="icon-wrapper">
                            <i class="fas fa-car"></i>
                        </div>
                        <div>
                            <span class="info-label">Vehículo</span>
                            <span class="info-value" title="${escapeHtml(vehiculoTexto)}">
                                ${escapeHtml(vehiculoTexto)}
                                <span class="placa-badge">${escapeHtml(placa)}</span>
                            </span>
                        </div>
                    </div>
                </div>
                
                <div class="recepcion-footer">
                    <span class="recepcion-fecha">
                        <i class="far fa-calendar-alt"></i>
                        ${fechaFormateada}
                    </span>
                    <div class="recepcion-actions">
                        <button class="btn-action btn-ver" onclick="verDetalleRecepcion(${rec.id})" title="Ver detalles">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="btn-action btn-editar" onclick="editarRecepcion(${rec.id})" title="Editar recepción">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn-action btn-eliminar" onclick="confirmarEliminarRecepcion(${rec.id})" title="Eliminar recepción">
                            <i class="fas fa-trash-alt"></i> Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Mostrar indicador de "Cargar más" si hay más recepciones
    if (!noHayMasRecepciones && recepcionesActuales.length > 0) {
        const footerDiv = document.createElement('div');
        footerDiv.style.cssText = 'text-align: center; padding: 10px 0;';
        footerDiv.innerHTML = `
            <button onclick="cargarRecepciones(true)" class="btn-cargar-mas" style="
                background: transparent;
                border: 2px solid var(--border-color);
                color: var(--gris-texto);
                padding: 8px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 0.85rem;
                transition: all 0.3s ease;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            " onmouseover="this.style.borderColor='#C1121F'; this.style.color='#C1121F';" 
               onmouseout="this.style.borderColor='var(--border-color)'; this.style.color='var(--gris-texto)';">
                <i class="fas fa-chevron-down"></i> Cargar más
            </button>
            <p style="color: var(--gris-texto); font-size: 0.7rem; margin-top: 5px;">
                Mostrando ${recepcionesActuales.length} de ${totalRecepciones} recepciones
            </p>
        `;
        listDiv.appendChild(footerDiv);
    } else if (totalRecepciones > 0 && recepcionesActuales.length > 0) {
        const footerDiv = document.createElement('div');
        footerDiv.style.cssText = 'text-align: center; padding: 10px 0; color: var(--gris-texto); font-size: 0.75rem;';
        footerDiv.innerHTML = `
            <i class="fas fa-check-circle" style="color: var(--verde-exito);"></i>
            <span style="margin-left: 5px;">Todas las recepciones cargadas (${totalRecepciones})</span>
        `;
        listDiv.appendChild(footerDiv);
    }
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

// =====================================================
// FUNCIÓN CORREGIDA: mostrarModalDetalle
// CON IFRAME DE GOOGLE DRIVE Y FONDO OSCURO
// =====================================================
function mostrarModalDetalle(detalle) {
    const modal = document.getElementById('modalDetalleRecepcion');
    const body = document.getElementById('detalleRecepcionBody');
    if (!modal || !body) return;
    
    console.log('📋 Detalle completo:', detalle);
    console.log('📸 Fotos en detalle:', detalle.fotos);
    console.log('🎵 Audio URL:', detalle.audio_url);
    
    // 🔥 Guardar detalle en datosReporteFinal para el PDF
    datosReporteFinal = detalle;
    
    const fotos = detalle.fotos || {};
    const camposFotos = [
        { campo: 'url_lateral_izquierda', label: 'Lateral Izquierdo', icono: 'fa-car-side' },
        { campo: 'url_lateral_derecha', label: 'Lateral Derecho', icono: 'fa-car-side' },
        { campo: 'url_foto_frontal', label: 'Frontal', icono: 'fa-car' },
        { campo: 'url_foto_trasera', label: 'Trasera', icono: 'fa-car' },
        { campo: 'url_foto_superior', label: 'Superior', icono: 'fa-arrow-up' },
        { campo: 'url_foto_inferior', label: 'Inferior', icono: 'fa-arrow-down' },
        { campo: 'url_foto_tablero', label: 'Tablero', icono: 'fa-tachometer-alt' }
    ];
    
    const fotosExistentes = camposFotos.filter(f => {
        const url = fotos[f.campo];
        return url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined';
    });
    const fotosCount = fotosExistentes.length;
    
    console.log(`📸 Fotos válidas: ${fotosCount}/7`);
    
    // 🔥 CONSTRUIR FOTOS HTML
    let fotosHtml = '';
    if (fotosCount === 0) {
        fotosHtml = `
            <div class="detalle-fotos-vacio">
                <i class="fas fa-camera"></i>
                <p>No se registraron fotos para esta recepción</p>
                <small>Las fotos se capturan durante el proceso de recepción</small>
            </div>
        `;
    } else {
        const timestamp = Date.now();
        fotosHtml = `
            <div class="detalle-fotos-grid">
                ${fotosExistentes.map((f, index) => {
                    const url = fotos[f.campo];
                    const imgId = `foto-${f.campo}-${timestamp}-${index}`;
                    return `
                        <div class="detalle-foto" onclick="verImagenAmpliadaPorId('${imgId}', '${f.label}')" title="Haz clic para ampliar">
                            <div id="${imgId}" class="detalle-foto-placeholder">
                                <i class="fas fa-spinner fa-spin"></i>
                                <span>Cargando...</span>
                            </div>
                            <div class="detalle-foto-label">
                                <i class="${f.icono}"></i> ${f.label}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    // 🔥 VERIFICAR SI EL AUDIO ES VÁLIDO
    const audioUrl = detalle.audio_url;
    const tieneAudio = audioUrl && audioUrl !== 'null' && audioUrl !== 'None' && audioUrl !== '' && audioUrl !== null && audioUrl !== 'undefined';
    
    // 🔥 CONSTRUIR EL HTML DEL AUDIO - CON IFRAME DE GOOGLE DRIVE
    let audioHtml = '';
    if (tieneAudio) {
        // 🔥 Extraer el ID del archivo de Google Drive
        let fileId = null;
        
        const match1 = audioUrl.match(/[?&]id=([^&]+)/);
        if (match1) {
            fileId = match1[1];
        } else {
            const match2 = audioUrl.match(/\/file\/d\/([^\/]+)/);
            if (match2) {
                fileId = match2[1];
            } else {
                const match3 = audioUrl.match(/\/d\/([^\/]+)/);
                if (match3) {
                    fileId = match3[1];
                }
            }
        }
        
        if (fileId) {
            // 🔥 URL del reproductor de Google Drive
            const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
            
            console.log('🎵 URL del reproductor de Google Drive:', embedUrl);
            
            audioHtml = `
                <div class="detalle-card" style="background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 16px;">
                    <div class="detalle-card-title" style="color: #fff; margin-bottom: 12px;">
                        <i class="fas fa-microphone" style="color: #C1121F;"></i> Audio de la Descripción
                    </div>
                    
                    <div style="background: #0d0d0d; border-radius: 10px; padding: 16px; border: 1px solid #2a2a2a;">
                        <!-- Header -->
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
                            <div style="width: 44px; height: 44px; background: #C1121F; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-headphones" style="color: white; font-size: 20px;"></i>
                            </div>
                            <div style="flex: 1;">
                                <div style="color: #fff; font-size: 14px; font-weight: 600;">Audio de la recepción</div>
                                <div style="color: #888; font-size: 11px;">Grabado durante la recepción del vehículo</div>
                            </div>
                            <div style="color: #10B981; font-size: 12px; background: rgba(16, 185, 129, 0.15); padding: 4px 14px; border-radius: 20px; white-space: nowrap;">
                                <i class="fas fa-check-circle"></i> Disponible
                            </div>
                        </div>
                        
                        <!-- 🔥 Reproductor de Google Drive en iframe -->
                        <div style="background: #000; border-radius: 8px; overflow: hidden; border: 1px solid #2a2a2a;">
                            <iframe 
                                src="${embedUrl}" 
                                style="width: 100%; height: 100px; border: none; display: block;"
                                allow="autoplay"
                                allowfullscreen>
                            </iframe>
                        </div>
                        
                        <!-- 🔥 Botones de acción -->
                        <div style="display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; justify-content: center;">
                            <a href="${viewUrl}" target="_blank" 
                               style="background: #1a1a1a; color: #C1121F; padding: 7px 18px; border-radius: 6px; border: 1px solid #333; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; transition: all 0.3s;"
                               onmouseover="this.style.background='#2a2a2a'"
                               onmouseout="this.style.background='#1a1a1a'">
                                <i class="fas fa-external-link-alt"></i> Abrir en Google Drive
                            </a>
                            <a href="${downloadUrl}" download 
                               style="background: #C1121F; color: white; padding: 7px 18px; border-radius: 6px; border: none; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; transition: all 0.3s;"
                               onmouseover="this.style.background='#a00f1a'"
                               onmouseout="this.style.background='#C1121F'">
                                <i class="fas fa-download"></i> Descargar Audio
                            </a>
                            <button onclick="window.open('${viewUrl}', '_blank')" 
                                    style="background: #2563EB; color: white; padding: 7px 18px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; transition: all 0.3s;"
                                    onmouseover="this.style.background='#1d4ed8'"
                                    onmouseout="this.style.background='#2563EB'">
                                <i class="fas fa-external-link-alt"></i> Abrir en nueva pestaña
                            </button>
                        </div>
                        
                        <div style="margin-top: 10px; font-size: 10px; color: #444; text-align: center; border-top: 1px solid #1a1a1a; padding-top: 10px;">
                            <i class="fas fa-info-circle"></i> 
                            Haz clic en el botón de Play dentro del reproductor para escuchar el audio
                        </div>
                    </div>
                </div>
            `;
            console.log('🎵 Audio con iframe de Google Drive cargado correctamente');
        } else {
            // Fallback: Si no se pudo extraer el ID
            audioHtml = `
                <div class="detalle-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-microphone"></i> Audio de la Descripción
                    </div>
                    <div style="text-align: center; padding: 30px 20px; background: #1a1a1a; border-radius: 8px;">
                        <i class="fas fa-external-link-alt" style="font-size: 32px; color: #C1121F; margin-bottom: 12px; display: block;"></i>
                        <p style="color: #ccc; margin-bottom: 16px;">Haz clic en el enlace para escuchar el audio</p>
                        <a href="${audioUrl}" target="_blank" style="color: #C1121F; font-size: 14px; text-decoration: underline; display: inline-block; padding: 8px 20px; background: #2a2a2a; border-radius: 6px;">
                            <i class="fas fa-headphones"></i> Escuchar audio en Google Drive
                        </a>
                    </div>
                </div>
            `;
        }
    } else {
        audioHtml = `
            <div class="detalle-sin-audio" style="background: #1a1a1a; border-radius: 8px; padding: 30px; text-align: center;">
                <i class="fas fa-microphone-slash" style="font-size: 32px; color: #555; margin-bottom: 12px; display: block;"></i>
                <span style="color: #888;">No hay audio disponible para esta recepción</span>
            </div>
        `;
        console.log('🎵 No hay audio disponible');
    }
    
    // 🔥 CONSTRUIR EL MODAL COMPLETO
    const html = `
        <div class="detalle-tabs">
            <button class="detalle-tab active" data-tab="info">
                <i class="fas fa-info-circle"></i> Información
            </button>
            <button class="detalle-tab" data-tab="fotos">
                <i class="fas fa-images"></i> Fotos 
                <span class="tab-badge">${fotosCount}/7</span>
            </button>
            <button class="detalle-tab" data-tab="descripcion">
                <i class="fas fa-align-left"></i> Descripción
            </button>
        </div>
        
        <div class="detalle-panes">
            <!-- ========================================= -->
            <!-- TAB 1: INFORMACIÓN                        -->
            <!-- ========================================= -->
            <div class="detalle-pane active" id="pane-info">
                <!-- TARJETA: INFORMACIÓN GENERAL -->
                <div class="detalle-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-info-circle"></i> Información General
                    </div>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Código</span>
                            <span class="detalle-value codigo">${escapeHtml(detalle.codigo_unico || 'N/A')}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Fecha de Ingreso</span>
                            <span class="detalle-value">${detalle.fecha_ingreso ? new Date(detalle.fecha_ingreso).toLocaleString('es-ES') : 'N/A'}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Estado</span>
                            <span class="detalle-value estado-badge ${detalle.estado_global || 'EnRecepcion'}">${detalle.estado_global || 'En Recepción'}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Jefe Operativo</span>
                            <span class="detalle-value">${escapeHtml(detalle.jefe_operativo?.nombre || 'No asignado')}</span>
                        </div>
                        ${detalle.jefe_operativo_2?.nombre ? `
                        <div class="detalle-item full-width">
                            <span class="detalle-label">Jefe Operativo 2</span>
                            <span class="detalle-value">${escapeHtml(detalle.jefe_operativo_2.nombre)}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- TARJETA: CLIENTE -->
                <div class="detalle-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-user"></i> Datos del Cliente
                    </div>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Nombre</span>
                            <span class="detalle-value">${escapeHtml(detalle.cliente_nombre || 'N/A')}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Teléfono</span>
                            <span class="detalle-value">${escapeHtml(detalle.cliente_telefono || 'N/A')}</span>
                        </div>
                        <div class="detalle-item full-width">
                            <span class="detalle-label">Ubicación</span>
                            <span class="detalle-value">${escapeHtml(detalle.cliente_ubicacion || 'No especificada')}</span>
                        </div>
                        ${detalle.latitud && detalle.longitud ? `
                        <div class="detalle-item full-width">
                            <span class="detalle-label">Coordenadas</span>
                            <span class="detalle-value">${detalle.latitud}, ${detalle.longitud}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- TARJETA: VEHÍCULO -->
                <div class="detalle-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-car"></i> Datos del Vehículo
                    </div>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Placa</span>
                            <span class="detalle-value placa">${escapeHtml(detalle.placa || 'N/A')}</span>
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
                        <div class="detalle-item full-width">
                            <span class="detalle-label">Kilometraje</span>
                            <span class="detalle-value">${detalle.kilometraje?.toLocaleString() || '0'} km</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- ========================================= -->
            <!-- TAB 2: FOTOS                              -->
            <!-- ========================================= -->
            <div class="detalle-pane" id="pane-fotos">
                ${fotosHtml}
            </div>
            
            <!-- ========================================= -->
            <!-- TAB 3: DESCRIPCIÓN                        -->
            <!-- ========================================= -->
            <div class="detalle-pane" id="pane-descripcion">
                <div class="detalle-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-align-left"></i> Descripción del Problema
                    </div>
                    <div class="detalle-descripcion-texto">
                        ${escapeHtml(detalle.transcripcion_problema || 'No se registró descripción')}
                    </div>
                </div>
                ${audioHtml}
            </div>
        </div>
    `;
    
    body.innerHTML = html;
    modal.classList.add('show');
    
    // =============================================
    // EVENTOS DE TABS
    // =============================================
    const tabs = document.querySelectorAll('.detalle-tab');
    const panes = document.querySelectorAll('.detalle-pane');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            panes.forEach(pane => pane.classList.remove('active'));
            
            const activePane = document.getElementById(`pane-${tabId}`);
            if (activePane) {
                activePane.classList.add('active');
            }
            
            if (tabId === 'fotos') {
                setTimeout(() => {
                    cargarImagenesFotos(detalle.fotos);
                }, 200);
            }
            
            // 🔥 Recargar el iframe cuando se abre el tab de descripción
            if (tabId === 'descripcion') {
                setTimeout(() => {
                    const iframe = document.querySelector('#pane-descripcion iframe');
                    if (iframe) {
                        // Recargar el iframe para asegurar que el audio cargue
                        const src = iframe.src;
                        iframe.src = '';
                        setTimeout(() => {
                            iframe.src = src;
                            console.log('🎵 Iframe de audio recargado');
                        }, 100);
                    }
                }, 200);
            }
        });
    });
    
    // Cargar fotos si el tab está activo
    setTimeout(() => {
        const fotosTab = document.querySelector('.detalle-tab[data-tab="fotos"]');
        if (fotosTab && fotosTab.classList.contains('active')) {
            cargarImagenesFotos(detalle.fotos);
        }
    }, 400);
    
    // =============================================
    // 🔥 BOTÓN PDF
    // =============================================
    const btnPDFDetalle = document.getElementById('btnExportarPDFDetalle');
    if (btnPDFDetalle) {
        btnPDFDetalle.onclick = function() {
            datosReporteFinal = detalle;
            descargarPDFFinal();
        };
    }
}

// =====================================================
// 🔥 FUNCIONES DE CONTROL DE AUDIO (CORREGIDAS)
// =====================================================

function toggleAudioPlayer(playerId) {
    const audio = document.getElementById(playerId);
    const btn = document.getElementById(`${playerId}-btn`);
    
    if (!audio || !btn) return;
    
    if (audio.paused) {
        // 🔥 Guardar referencia al botón y audio para manejar la promesa
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    // ✅ Reproducción exitosa
                    btn.innerHTML = '<i class="fas fa-pause" style="font-size: 14px;"></i>';
                    btn.style.background = '#C1121F';
                    console.log('🎵 Audio reproduciendo correctamente');
                })
                .catch((error) => {
                    // ❌ Error en la reproducción
                    console.warn('⚠️ Error reproduciendo audio:', error);
                    
                    // Si el error es por interrupción, reintentar después de un momento
                    if (error.name === 'AbortError' || error.message.includes('interrupted')) {
                        console.log('🔄 Reintentando reproducción...');
                        setTimeout(() => {
                            audio.play()
                                .then(() => {
                                    btn.innerHTML = '<i class="fas fa-pause" style="font-size: 14px;"></i>';
                                    btn.style.background = '#C1121F';
                                })
                                .catch(() => {
                                    mostrarNotificacion('❌ No se pudo reproducir el audio. Intenta descargarlo.', 'warning');
                                    btn.innerHTML = '<i class="fas fa-play" style="font-size: 14px; margin-left: 2px;"></i>';
                                    btn.style.background = '#dc3545';
                                });
                        }, 300);
                    } else {
                        // Otros errores
                        mostrarNotificacion('❌ No se pudo reproducir el audio: ' + error.message, 'warning');
                        btn.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size: 14px;"></i>';
                        btn.style.background = '#dc3545';
                    }
                });
        }
    } else {
        // 🔥 Pausar el audio
        audio.pause();
        btn.innerHTML = '<i class="fas fa-play" style="font-size: 14px; margin-left: 2px;"></i>';
        btn.style.background = '#C1121F';
        console.log('⏸️ Audio pausado');
    }
}

function seekAudio(playerId, value) {
    const audio = document.getElementById(playerId);
    if (!audio) return;
    
    const total = audio.duration;
    if (total && !isNaN(total)) {
        audio.currentTime = (value / 100) * total;
    }
}

function toggleAudioMute(playerId) {
    const audio = document.getElementById(playerId);
    if (!audio) return;
    
    audio.muted = !audio.muted;
    const btn = event?.target || document.querySelector(`#${playerId}-mute-btn`);
    if (btn) {
        btn.innerHTML = audio.muted ? 
            '<i class="fas fa-volume-mute"></i>' : 
            '<i class="fas fa-volume-up"></i>';
    }
}

function seekAudio(playerId, value) {
    const audio = document.getElementById(playerId);
    if (!audio) return;
    
    const total = audio.duration;
    if (total && !isNaN(total)) {
        audio.currentTime = (value / 100) * total;
    }
}

function toggleAudioMute(playerId) {
    const audio = document.getElementById(playerId);
    if (!audio) return;
    
    audio.muted = !audio.muted;
    const btn = event?.target || document.querySelector(`#${playerId}-mute-btn`);
    if (btn) {
        btn.innerHTML = audio.muted ? 
            '<i class="fas fa-volume-mute"></i>' : 
            '<i class="fas fa-volume-up"></i>';
    }
}
// =====================================================
// FUNCIÓN PARA EXPORTAR DETALLE A PDF
// =====================================================
function exportarDetallePDF(detalle) {
    if (!detalle) {
        mostrarNotificacion('No hay datos para exportar', 'warning');
        return;
    }
    
    mostrarNotificacion('Generando PDF del detalle...', 'info');
    
    // 🔥 PRIMERO, convertir todas las fotos a base64
    const fotos = detalle.fotos || {};
    const camposFotos = [
        'url_lateral_izquierda',
        'url_lateral_derecha',
        'url_foto_frontal',
        'url_foto_trasera',
        'url_foto_superior',
        'url_foto_inferior',
        'url_foto_tablero'
    ];
    
    // Crear una copia del detalle para no modificar el original
    const detalleConBase64 = JSON.parse(JSON.stringify(detalle));
    
    // Función para convertir una imagen a base64
    async function convertirImagenes() {
        const promesas = [];
        
        for (const campo of camposFotos) {
            const url = fotos[campo];
            if (url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined') {
                promesas.push(
                    convertirImagenABase64(url)
                        .then(base64 => {
                            detalleConBase64.fotos[campo] = base64;
                            console.log(`✅ Imagen convertida: ${campo}`);
                        })
                        .catch(error => {
                            console.warn(`⚠️ No se pudo convertir ${campo}:`, error);
                            // Mantener la URL original como fallback
                        })
                );
            }
        }
        
        await Promise.all(promesas);
    }
    
    // Mostrar progreso
    mostrarNotificacion('⏳ Preparando imágenes para el PDF...', 'info');
    
    // Convertir imágenes y luego generar el PDF
    convertirImagenes().then(() => {
        const contenidoHTML = generarHTMLDetallePDFConBase64(detalleConBase64);
        
        const container = document.createElement('div');
        container.id = 'detallePdfContainer';
        container.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 210mm;
            padding: 20px;
            background: white;
            font-family: Arial, sans-serif;
            color: #222;
            font-size: 12px;
            line-height: 1.5;
        `;
        container.innerHTML = contenidoHTML;
        document.body.appendChild(container);
        
        setTimeout(() => {
            const elemento = document.getElementById('detallePdfContainer');
            
            if (typeof html2pdf === 'undefined') {
                mostrarNotificacion('Error: html2pdf no está cargado', 'error');
                document.body.removeChild(container);
                return;
            }
            
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `Detalle_Recepcion_${detalle.codigo_unico || 'orden'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    allowTaint: true
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait'
                }
            };
            
            html2pdf().set(opt).from(elemento).save()
                .then(() => {
                    mostrarNotificacion('✅ PDF generado exitosamente', 'success');
                    document.body.removeChild(container);
                })
                .catch((error) => {
                    console.error('Error generando PDF:', error);
                    mostrarNotificacion('Error al generar PDF', 'error');
                    document.body.removeChild(container);
                });
        }, 500);
    }).catch(error => {
        console.error('Error preparando imágenes:', error);
        mostrarNotificacion('Error al preparar imágenes para el PDF', 'error');
    });
}

// =====================================================
// FUNCIÓN PARA GENERAR HTML DEL DETALLE EN PDF (CON BASE64)
// =====================================================
function generarHTMLDetallePDFConBase64(detalle) {
    const fotos = detalle.fotos || {};
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
        return url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined';
    });
    
    const fechaActual = new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Detalle Recepción ${detalle.codigo_unico}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: Arial, sans-serif; color: #222; padding: 20px; background: white; }
                .header { border-bottom: 3px solid #C1121F; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .header h1 { color: #C1121F; font-size: 22px; }
                .header h1 span { color: #222; }
                .header .fecha { color: #666; font-size: 12px; }
                .titulo-orden { text-align: center; font-size: 16px; color: #C1121F; margin-bottom: 15px; }
                .codigo-orden { text-align: center; font-size: 14px; font-weight: bold; background: #f0f0f0; display: inline-block; padding: 4px 15px; border-radius: 4px; margin: 0 auto 15px; }
                .seccion { background: #f8f8f8; border-radius: 8px; padding: 12px 15px; margin-bottom: 12px; }
                .seccion-titulo { font-weight: bold; font-size: 14px; color: #C1121F; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
                .item { margin-bottom: 4px; }
                .item .label { font-size: 10px; color: #888; text-transform: uppercase; }
                .item .value { font-size: 13px; font-weight: 500; }
                .item .value.codigo { color: #C1121F; font-family: monospace; }
                .item .value.placa { color: #C1121F; font-weight: bold; }
                .full-width { grid-column: 1 / -1; }
                .fotos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin-top: 8px; }
                .foto-item { border: 1px solid #ddd; border-radius: 4px; overflow: hidden; text-align: center; background: white; }
                .foto-item img { width: 100%; height: 100px; object-fit: cover; display: block; background: #eee; }
                .foto-item .foto-label { font-size: 9px; padding: 4px; font-weight: bold; color: #555; background: #f5f5f5; }
                .descripcion-texto { background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 12px; line-height: 1.6; min-height: 40px; }
                .audio-container { margin-top: 8px; }
                .audio-container audio { width: 100%; height: 30px; }
                .sin-audio { color: #999; font-style: italic; font-size: 12px; padding: 8px; text-align: center; }
                .footer { text-align: center; font-size: 10px; color: #999; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; }
                .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 15px; }
                .firma { text-align: center; padding: 10px; }
                .firma .linea { border-bottom: 2px solid #333; height: 35px; margin-bottom: 4px; }
                .firma .nombre { font-size: 12px; font-weight: 500; }
                .firma .fecha-firma { font-size: 10px; color: #999; }
                @media print {
                    body { padding: 0; }
                    .foto-item { break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <!-- HEADER -->
            <div class="header">
                <h1>FURIA <span>MOTOR</span></h1>
                <div class="fecha">${fechaActual}</div>
            </div>
            
            <div class="titulo-orden">ORDEN DE TRABAJO - RECEPCIÓN</div>
            <div style="text-align: center;">
                <span class="codigo-orden"># ${detalle.codigo_unico || 'OT-N/A'}</span>
            </div>
            
            <!-- INFORMACIÓN GENERAL -->
            <div class="seccion">
                <div class="seccion-titulo">📋 Información General</div>
                <div class="grid">
                    <div class="item">
                        <div class="label">Código</div>
                        <div class="value codigo">${escapeHtml(detalle.codigo_unico || 'N/A')}</div>
                    </div>
                    <div class="item">
                        <div class="label">Fecha de Ingreso</div>
                        <div class="value">${detalle.fecha_ingreso ? new Date(detalle.fecha_ingreso).toLocaleString('es-ES') : 'N/A'}</div>
                    </div>
                    <div class="item">
                        <div class="label">Estado</div>
                        <div class="value" style="color: ${detalle.estado_global === 'EnRecepcion' ? '#F59E0B' : detalle.estado_global === 'EnTaller' ? '#2563EB' : '#10B981'}">${detalle.estado_global || 'En Recepción'}</div>
                    </div>
                    <div class="item">
                        <div class="label">Jefe Operativo</div>
                        <div class="value">${escapeHtml(detalle.jefe_operativo?.nombre || 'No asignado')}</div>
                    </div>
                    ${detalle.jefe_operativo_2?.nombre ? `
                    <div class="item full-width">
                        <div class="label">Jefe Operativo 2</div>
                        <div class="value">${escapeHtml(detalle.jefe_operativo_2.nombre)}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- CLIENTE -->
            <div class="seccion">
                <div class="seccion-titulo">👤 Datos del Cliente</div>
                <div class="grid">
                    <div class="item">
                        <div class="label">Nombre</div>
                        <div class="value">${escapeHtml(detalle.cliente_nombre || 'N/A')}</div>
                    </div>
                    <div class="item">
                        <div class="label">Teléfono</div>
                        <div class="value">${escapeHtml(detalle.cliente_telefono || 'N/A')}</div>
                    </div>
                    <div class="item full-width">
                        <div class="label">Ubicación</div>
                        <div class="value">${escapeHtml(detalle.cliente_ubicacion || 'No especificada')}</div>
                    </div>
                    ${detalle.latitud && detalle.longitud ? `
                    <div class="item full-width">
                        <div class="label">Coordenadas</div>
                        <div class="value">${detalle.latitud}, ${detalle.longitud}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- VEHÍCULO -->
            <div class="seccion">
                <div class="seccion-titulo">🚗 Datos del Vehículo</div>
                <div class="grid">
                    <div class="item">
                        <div class="label">Placa</div>
                        <div class="value placa">${escapeHtml(detalle.placa || 'N/A')}</div>
                    </div>
                    <div class="item">
                        <div class="label">Marca</div>
                        <div class="value">${escapeHtml(detalle.marca || 'N/A')}</div>
                    </div>
                    <div class="item">
                        <div class="label">Modelo</div>
                        <div class="value">${escapeHtml(detalle.modelo || 'N/A')}</div>
                    </div>
                    <div class="item">
                        <div class="label">Año</div>
                        <div class="value">${detalle.anio || 'N/A'}</div>
                    </div>
                    <div class="item">
                        <div class="label">Kilometraje</div>
                        <div class="value">${detalle.kilometraje?.toLocaleString() || '0'} km</div>
                    </div>
                </div>
            </div>
            
            <!-- FOTOS -->
            <div class="seccion">
                <div class="seccion-titulo">📸 Fotos (${fotosExistentes.length}/7)</div>
                <div class="fotos-grid">
                    ${fotosExistentes.length > 0 ? fotosExistentes.map(f => `
                        <div class="foto-item">
                            <img src="${fotos[f.campo]}" alt="${f.label}" onerror="this.style.display='none'">
                            <div class="foto-label">${f.label}</div>
                        </div>
                    `).join('') : '<p style="color: #999; font-style: italic; font-size: 12px; grid-column: 1 / -1; text-align: center;">No se registraron fotos</p>'}
                </div>
            </div>
            
            <!-- DESCRIPCIÓN -->
            <div class="seccion">
                <div class="seccion-titulo">📝 Descripción del Problema</div>
                <div class="descripcion-texto">${escapeHtml(detalle.transcripcion_problema || 'No se registró descripción')}</div>
                ${detalle.audio_url ? `
                <div class="audio-container">
                    <audio controls src="${detalle.audio_url}"></audio>
                </div>
                ` : `
                <div class="sin-audio"><i class="fas fa-microphone-slash"></i> No hay audio disponible</div>
                `}
            </div>
            
            <!-- FIRMAS -->
            <div class="seccion">
                <div class="seccion-titulo">✍️ Firmas</div>
                <div class="firmas">
                    <div class="firma">
                        <div class="linea"></div>
                        <div class="nombre">${escapeHtml(detalle.cliente_nombre || '____________________')}</div>
                        <div class="fecha-firma">Firma del Cliente - ${fechaActual}</div>
                    </div>
                    <div class="firma">
                        <div class="linea"></div>
                        <div class="nombre">${escapeHtml(detalle.jefe_operativo?.nombre || '____________________')}</div>
                        <div class="fecha-firma">Firma del Jefe Operativo - ${fechaActual}</div>
                    </div>
                </div>
            </div>
            
            <!-- FOOTER -->
            <div class="footer">
                Documento generado automáticamente por FURIA MOTOR COMPANY<br>
                Código: ${detalle.codigo_unico || 'N/A'} | ${fechaActual}
            </div>
        </body>
        </html>
    `;
}

// =====================================================
// FUNCIÓN PARA CARGAR IMÁGENES VÍA BACKEND
// =====================================================
async function cargarImagenesFotos(fotos) {
    if (!fotos) return;
    
    const panelFotos = document.getElementById('pane-fotos');
    if (!panelFotos) {
        console.warn('⚠️ No se encontró el panel de fotos');
        return;
    }
    
    const camposFotos = [
        { campo: 'url_lateral_izquierda', label: 'Lateral Izquierdo' },
        { campo: 'url_lateral_derecha', label: 'Lateral Derecho' },
        { campo: 'url_foto_frontal', label: 'Frontal' },
        { campo: 'url_foto_trasera', label: 'Trasera' },
        { campo: 'url_foto_superior', label: 'Superior' },
        { campo: 'url_foto_inferior', label: 'Inferior' },
        { campo: 'url_foto_tablero', label: 'Tablero' }
    ];
    
    for (const f of camposFotos) {
        const url = fotos[f.campo];
        if (!url || url === 'null' || url === 'None' || url === '') continue;
        
        // Buscar el contenedor de la foto dentro del panel
        const contenedores = panelFotos.querySelectorAll(`.detalle-foto .detalle-foto-placeholder[id^="foto-${f.campo}-"]`);
        if (contenedores.length === 0) {
            console.warn(`⚠️ No se encontró contenedor para: ${f.campo}`);
            continue;
        }
        
        const contenedor = contenedores[0];
        const fotoDiv = contenedor.closest('.detalle-foto');
        
        try {
            console.log(`📥 Cargando imagen: ${f.campo}`);
            
            const response = await fetchWithToken(`${API_URL}/jefe-operativo/imagen-base64`, {
                method: 'POST',
                body: JSON.stringify({ url: url })
            });
            
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.base64) {
                // Reemplazar el placeholder con la imagen
                contenedor.innerHTML = `
                    <img src="${data.base64}" 
                         alt="${f.label}" 
                         style="width: 100%; height: 100%; object-fit: cover; display: block;"
                         onerror="this.parentElement.innerHTML='<div style=\\'display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:4px;height:100%;\\'><i class=\\'fas fa-exclamation-triangle\\' style=\\'font-size:20px;\\'></i><span style=\\'font-size:10px;text-align:center;\\'>Error al cargar</span></div>'">
                `;
                // Añadir clase para indicar que está cargada
                if (fotoDiv) {
                    fotoDiv.classList.add('loaded');
                }
                console.log(`✅ Imagen cargada: ${f.campo}`);
            } else {
                throw new Error(data.error || 'Error convirtiendo imagen');
            }
            
        } catch (error) {
            console.error(`❌ Error cargando ${f.campo}:`, error);
            contenedor.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8E8E93; gap: 4px; height: 100%;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 20px;"></i>
                    <span style="font-size: 10px; text-align: center;">Error al cargar</span>
                </div>
            `;
        }
    }
}

// =====================================================
// FUNCIÓN PARA VER IMAGEN AMPLIADA POR ID
// =====================================================
function verImagenAmpliadaPorId(imgId, label) {
    const contenedor = document.getElementById(imgId);
    if (!contenedor) return;
    
    const img = contenedor.querySelector('img');
    if (!img) {
        mostrarNotificacion('La imagen aún no se ha cargado', 'warning');
        return;
    }
    
    verImagenAmpliada(img.src, label);
}

// =====================================================
// FUNCIÓN PARA VER IMAGEN AMPLIADA
// =====================================================
function verImagenAmpliada(url, label) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.92);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 20px;
    `;
    modal.innerHTML = `
        <div style="position: relative; max-width: 90%; max-height: 90%;">
            <button style="position: absolute; top: -40px; right: 0; background: none; border: none; color: white; font-size: 32px; cursor: pointer; z-index: 10; padding: 8px 12px;"
                    onclick="this.closest('.modal-imagen').remove()">&times;</button>
            <img src="${url}" alt="${label}" style="max-width: 100%; max-height: 80vh; border-radius: 8px; object-fit: contain; display: block;">
            <p style="color: white; text-align: center; margin-top: 12px; font-size: 14px; opacity: 0.8;">${label}</p>
        </div>
    `;
    modal.addEventListener('click', function(e) {
        if (e.target === this) this.remove();
    });
    document.body.appendChild(modal);
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
// =====================================================
// FUNCIÓN: EDITAR RECEPCIÓN (COMPLETA CON FOTOS Y AUDIO)
// =====================================================

async function editarRecepcion(id) {
    try {
        mostrarNotificacion('📝 Cargando datos para edición...', 'info');
        
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, { method: 'GET' });
        const data = await response.json();
        
        if (!response.ok || !data.detalle) {
            throw new Error(data.error || 'Error cargando datos');
        }
        
        const detalle = data.detalle;
        
        // 🔥 Verificar que la orden esté en estado "EnRecepcion"
        if (detalle.estado_global !== 'EnRecepcion') {
            mostrarNotificacion(`⚠️ No se puede editar una orden en estado "${detalle.estado_global}"`, 'warning');
            return;
        }
        
        // =============================================
        // 1. CARGAR DATOS EN EL FORMULARIO
        // =============================================
        
        // Cliente
        if (document.getElementById('clienteNombre')) {
            document.getElementById('clienteNombre').value = detalle.cliente_nombre || '';
        }
        if (document.getElementById('clienteTelefono')) {
            document.getElementById('clienteTelefono').value = detalle.cliente_telefono || '';
        }
        if (document.getElementById('clienteUbicacion')) {
            document.getElementById('clienteUbicacion').value = detalle.cliente_ubicacion || '';
        }
        if (document.getElementById('clienteLatitud')) {
            document.getElementById('clienteLatitud').value = detalle.latitud || '';
        }
        if (document.getElementById('clienteLongitud')) {
            document.getElementById('clienteLongitud').value = detalle.longitud || '';
        }
        
        // Vehículo
        if (document.getElementById('vehiculoPlaca')) {
            document.getElementById('vehiculoPlaca').value = detalle.placa || '';
        }
        if (document.getElementById('vehiculoMarca')) {
            document.getElementById('vehiculoMarca').value = detalle.marca || '';
        }
        if (document.getElementById('vehiculoModelo')) {
            document.getElementById('vehiculoModelo').value = detalle.modelo || '';
        }
        if (document.getElementById('vehiculoAnio')) {
            document.getElementById('vehiculoAnio').value = detalle.anio || '';
        }
        if (document.getElementById('vehiculoKilometraje')) {
            document.getElementById('vehiculoKilometraje').value = detalle.kilometraje || 0;
        }
        
        // Descripción
        if (descripcionProblema) {
            descripcionProblema.value = detalle.transcripcion_problema || '';
        }
        
        // =============================================
        // 2. CARGAR AUDIO EXISTENTE
        // =============================================
        if (detalle.audio_url && detalle.audio_url !== 'null' && detalle.audio_url !== 'None' && detalle.audio_url !== '') {
            audioDriveUrl = detalle.audio_url;
            
            // Mostrar el audio en el preview
            if (audioPreview) {
                audioPreview.src = detalle.audio_url;
                audioPreview.style.display = 'block';
                audioPreview.load();
                console.log('🎵 Audio cargado para edición:', detalle.audio_url);
            }
            
            if (btnEliminarAudio) {
                btnEliminarAudio.style.display = 'flex';
            }
            
            if (audioStatus) {
                audioStatus.textContent = 'Audio disponible para edición';
                audioStatus.style.color = 'var(--verde-exito)';
            }
            
            // Cambiar el texto del botón de grabación
            if (btnGrabarAudio) {
                btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Regrabar Audio';
            }
        } else {
            audioDriveUrl = null;
            if (audioPreview) {
                audioPreview.src = '';
                audioPreview.style.display = 'none';
            }
            if (btnEliminarAudio) {
                btnEliminarAudio.style.display = 'none';
            }
            if (audioStatus) {
                audioStatus.textContent = 'No hay audio grabado';
                audioStatus.style.color = 'var(--gris-texto)';
            }
            if (btnGrabarAudio) {
                btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
            }
        }
        
        // =============================================
        // 3. CARGAR FOTOS EXISTENTES
        // =============================================
        const fotos = detalle.fotos || {};
        let fotosCargadas = 0;
        
        for (const foto of FOTOS_CONFIG) {
            const url = fotos[foto.campo];
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            const input = document.getElementById(foto.id);
            const preview = uploadDiv?.querySelector('.upload-preview');
            const removeBtn = uploadDiv?.querySelector('.remove-photo');
            
            if (url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined') {
                // 🔥 Cargar la foto existente
                if (preview) {
                    // Mostrar la imagen con la URL de Google Drive
                    preview.style.backgroundImage = `url('${url}')`;
                    preview.style.backgroundSize = 'cover';
                    preview.style.backgroundPosition = 'center';
                    preview.innerHTML = '';
                    uploadDiv.classList.add('has-image');
                    uploadDiv.dataset.driveUrl = url;
                    
                    // Guardar la URL en fotosSubidasLocal
                    fotosSubidasLocal[foto.campo] = url;
                    
                    // Mostrar el botón de eliminar
                    if (removeBtn) {
                        removeBtn.style.display = 'flex';
                    }
                    
                    // Marcar como completado en el progreso
                    actualizarProgresoFoto(foto.campo, 100, 'completed');
                    fotosCargadas++;
                    
                    console.log(`📸 Foto cargada: ${foto.campo}`);
                }
            } else {
                // Limpiar si no hay foto
                if (preview) {
                    preview.style.backgroundImage = '';
                    preview.innerHTML = '';
                    uploadDiv.classList.remove('has-image');
                }
                if (removeBtn) {
                    removeBtn.style.display = 'none';
                }
                delete uploadDiv?.dataset.driveUrl;
                delete fotosSubidasLocal[foto.campo];
                actualizarProgresoFoto(foto.campo, 0, 'pending');
            }
        }
        
        console.log(`📸 Fotos cargadas: ${fotosCargadas}/7`);
        
        // =============================================
        // 4. ACTUALIZAR ESTADO DE SECCIONES
        // =============================================
        
        // Cliente
        seccionesCompletadasLocal.cliente = !!(detalle.cliente_nombre && detalle.cliente_telefono);
        actualizarEstadoVisualSeccion('cliente', seccionesCompletadasLocal.cliente);
        
        // Vehículo
        seccionesCompletadasLocal.vehiculo = !!(detalle.placa && detalle.marca && detalle.modelo);
        actualizarEstadoVisualSeccion('vehiculo', seccionesCompletadasLocal.vehiculo);
        
        // Fotos
        seccionesCompletadasLocal.fotos = fotosCargadas === 7;
        actualizarEstadoVisualSeccion('fotos', seccionesCompletadasLocal.fotos);
        
        // Descripción
        seccionesCompletadasLocal.descripcion = !!(detalle.transcripcion_problema && detalle.transcripcion_problema.trim().length > 0);
        actualizarEstadoVisualSeccion('descripcion', seccionesCompletadasLocal.descripcion);
        
        // =============================================
        // 5. CONFIGURAR MODO EDICIÓN
        // =============================================
        modoEdicionRecepcion = true;
        recepcionEditandoId = id;
        
        // Guardar los datos originales para comparar
        window.datosOriginalesRecepcion = detalle;
        window.fotosOriginalesRecepcion = JSON.parse(JSON.stringify(fotos));
        window.audioOriginalRecepcion = detalle.audio_url || null;
        
        // Cambiar el botón de "Finalizar" a "Guardar Cambios"
        if (btnFinalizar) {
            btnFinalizar.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            btnFinalizar.disabled = false;
            btnFinalizar.onclick = guardarCambiosRecepcion;
            btnFinalizar.style.background = 'linear-gradient(135deg, #2563EB, #1d4ed8)';
        }
        
        // Mostrar el formulario
        if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
        if (sessionPanel) sessionPanel.style.display = 'flex';
        if (colaboradoresPanel) colaboradoresPanel.style.display = 'block';
        if (recepcionForm) recepcionForm.style.display = 'block';
        
        // Mostrar código de la orden en edición
        if (codigoActivoSpan) {
            codigoActivoSpan.textContent = `✏️ EDITANDO: ${detalle.codigo_unico || 'OT-N/A'}`;
            codigoActivoSpan.style.color = '#2563EB';
        }
        
        // Mostrar banner de edición
        const sessionInfo = document.querySelector('.session-info');
        if (sessionInfo) {
            const editBanner = document.createElement('div');
            editBanner.id = 'editBanner';
            editBanner.style.cssText = `
                background: rgba(37, 99, 235, 0.15);
                border: 1px solid #2563EB;
                border-radius: 6px;
                padding: 8px 16px;
                margin: 8px 0;
                color: #2563EB;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            editBanner.innerHTML = `
                <i class="fas fa-edit"></i>
                <span>Modo edición: <strong>${detalle.codigo_unico}</strong></span>
                <button onclick="cancelarEdicion()" style="margin-left: auto; background: transparent; border: 1px solid #dc3545; color: #dc3545; padding: 2px 12px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            `;
            sessionInfo.prepend(editBanner);
        }
        
        actualizarBotonFinalizar();
        
        mostrarNotificacion(`✅ Editando recepción: ${detalle.codigo_unico}`, 'success');
        
    } catch (error) {
        console.error('❌ Error en editarRecepcion:', error);
        mostrarNotificacion('Error cargando datos para edición: ' + error.message, 'error');
    }
}

// =====================================================
// FUNCIÓN: CANCELAR EDICIÓN
// =====================================================

function cancelarEdicion() {
    if (confirm('¿Cancelar la edición? Los cambios no guardados se perderán.')) {
        // Restaurar el botón Finalizar
        if (btnFinalizar) {
            btnFinalizar.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Recepción';
            btnFinalizar.disabled = true;
            btnFinalizar.onclick = finalizarSesionConReporte;
            btnFinalizar.style.background = '';
        }
        
        // Limpiar banner de edición
        const editBanner = document.getElementById('editBanner');
        if (editBanner) editBanner.remove();
        
        // Restaurar código
        if (codigoActivoSpan) {
            codigoActivoSpan.textContent = '';
            codigoActivoSpan.style.color = '';
        }
        
        modoEdicionRecepcion = false;
        recepcionEditandoId = null;
        window.datosOriginalesRecepcion = null;
        window.fotosOriginalesRecepcion = null;
        window.audioOriginalRecepcion = null;
        
        limpiarSesionCompleta();
        mostrarNotificacion('Edición cancelada', 'info');
    }
}

// =====================================================
// FUNCIÓN: GUARDAR CAMBIOS DE RECEPCIÓN (CON FOTOS Y AUDIO)
// =====================================================

async function guardarCambiosRecepcion() {
    if (!recepcionEditandoId) {
        mostrarNotificacion('⚠️ No hay una recepción en edición', 'warning');
        return;
    }
    
    // 🔥 Validar que todas las secciones estén completas
    validarCompletadoCliente();
    validarCompletadoVehiculo();
    validarCompletadoFotos();
    validarCompletadoDescripcion();
    
    if (!seccionesCompletadasLocal.cliente || !seccionesCompletadasLocal.vehiculo || 
        !seccionesCompletadasLocal.fotos || !seccionesCompletadasLocal.descripcion) {
        mostrarNotificacion('⚠️ Completa todas las secciones antes de guardar', 'warning');
        return;
    }
    
    // 🔥 Confirmar con el usuario
    if (!confirm('¿Guardar los cambios en esta recepción?')) {
        return;
    }
    
    showProgress('Guardando cambios', 'Actualizando recepción...', 3);
    updateProgressBar(10, 1);
    updateProgressMessage('Preparando datos...');
    
    try {
        // 🔥 Recopilar todas las fotos del formulario
        const fotosData = {};
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            let url = uploadDiv?.dataset.driveUrl;
            
            // Si no hay URL en el dataset, intentar obtenerla de fotosSubidasLocal
            if (!url) {
                url = fotosSubidasLocal[foto.campo];
            }
            
            // Si aún no hay URL, usar la original si existe
            if (!url && window.fotosOriginalesRecepcion) {
                url = window.fotosOriginalesRecepcion[foto.campo];
            }
            
            fotosData[foto.campo] = url || null;
        }
        
        // 🔥 Recopilar todos los datos del formulario
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
            fotos: fotosData,
            descripcion: {
                texto: descripcionProblema?.value || '',
                audio_url: audioDriveUrl || null
            }
        };
        
        console.log('📸 Fotos a guardar:', fotosData);
        console.log('🎵 Audio a guardar:', datosActualizados.descripcion.audio_url);
        
        updateProgressBar(30, 1);
        updateProgressMessage('Actualizando datos en la base de datos...');
        
        // 🔥 Enviar la actualización al servidor
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/actualizar-recepcion/${recepcionEditandoId}`, {
            method: 'PUT',
            body: JSON.stringify(datosActualizados)
        });
        
        updateProgressBar(70, 2);
        updateProgressMessage('Verificando cambios...');
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error del servidor: ${response.status}`);
        }
        
        const data = await response.json();
        
        updateProgressBar(100, 3);
        updateProgressMessage('¡Cambios guardados exitosamente!');
        
        mostrarNotificacion('✅ Cambios guardados correctamente', 'success');
        
        // 🔥 Resetear modo edición
        modoEdicionRecepcion = false;
        recepcionEditandoId = null;
        window.datosOriginalesRecepcion = null;
        window.fotosOriginalesRecepcion = null;
        window.audioOriginalRecepcion = null;
        
        // Restaurar el botón Finalizar
        if (btnFinalizar) {
            btnFinalizar.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Recepción';
            btnFinalizar.disabled = true;
            btnFinalizar.onclick = finalizarSesionConReporte;
            btnFinalizar.style.background = '';
        }
        
        // Eliminar banner de edición
        const editBanner = document.getElementById('editBanner');
        if (editBanner) editBanner.remove();
        
        // Restaurar código
        if (codigoActivoSpan) {
            codigoActivoSpan.textContent = '';
            codigoActivoSpan.style.color = '';
        }
        
        // Cerrar el formulario y volver a la lista
        limpiarSesionCompleta();
        
        setTimeout(() => {
            completeProgress(true);
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
            cargarRecepciones();
        }, 500);
        
    } catch (error) {
        console.error('❌ Error guardando cambios:', error);
        completeProgress(false);
        mostrarNotificacion('❌ Error al guardar cambios: ' + error.message, 'error');
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
        return url;
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
            
            const fotos = datosReporteFinal.fotos || {};
            const fotosBase64 = {};
            
            // 🔥 Contar fotos válidas
            const camposFotos = [
                'url_lateral_izquierda',
                'url_lateral_derecha',
                'url_foto_frontal',
                'url_foto_trasera',
                'url_foto_superior',
                'url_foto_inferior',
                'url_foto_tablero'
            ];
            
            const fotosValidas = camposFotos.filter(c => fotos[c] && fotos[c] !== 'null' && fotos[c] !== 'None' && fotos[c] !== '');
            
            // 🔥 Convertir cada foto a base64
            for (const campo of fotosValidas) {
                const url = fotos[campo];
                try {
                    const base64 = await convertirImagenABase64(url);
                    fotosBase64[campo] = base64;
                    console.log(`✅ Imagen convertida: ${campo}`);
                } catch (error) {
                    console.warn(`⚠️ No se pudo convertir ${campo}:`, error);
                    fotosBase64[campo] = url; // Fallback: URL original
                }
            }
            
            // 🔥 Guardar fotos en base64 para el PDF
            datosReporteFinal.fotos_base64 = fotosBase64;
            
            // 🔥 También actualizar fotos con las base64 para que el reporte las use
            datosReporteFinal.fotos = fotosBase64;
            
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
// GENERAR HTML DEL REPORTE - OCUPA TODA LA HOJA
// =====================================================
function generarHTMLReporte(detalle) {
    if (!detalle) {
        return '<div class="loading-preview"><i class="fas fa-exclamation-triangle"></i><p>No hay datos para mostrar</p></div>';
    }
    
    // 🔥 USAR fotos_base64 o fotos
    const fotos = detalle.fotos_base64 || detalle.fotos || {};
    const fotosArray = Object.entries(fotos)
        .filter(([key, url]) => url && url !== 'null' && url !== 'None' && url !== '')
        .map(([key, url]) => ({
            campo: key,
            label: key.replace(/url_/g, '').replace(/_/g, ' ').toUpperCase(),
            url: url
        }));
    
    const fotosHTML = fotosArray.length > 0 ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin: 8px 0;">
            ${fotosArray.map(f => `
                <div style="border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: #f5f5f5; text-align: center;">
                    <img src="${f.url}" alt="${f.label}" 
                         style="width: 100%; height: 110px; object-fit: cover; display: block; background: #eee;"
                         onerror="this.parentElement.innerHTML='<div style=\\'padding:20px;text-align:center;color:#999;font-size:10px;\\'><i class=\\'fas fa-image\\' style=\\'font-size:20px;display:block;margin-bottom:5px;\\'></i>${f.label}<br><span style=\\'font-size:8px;\\'>No disponible</span></div>'">
                    <div style="padding: 4px; font-size: 8px; font-weight: bold; color: #555; background: #f9f9f9;">${f.label}</div>
                </div>
            `).join('')}
        </div>
    ` : '<p style="color: #999; font-style: italic; font-size: 11px; text-align: center; padding: 15px;">No se registraron fotos</p>';
    
    const clienteNombre = detalle.cliente_nombre || 'No registrado';
    const clienteTelefono = detalle.cliente_telefono || 'No registrado';
    const clienteUbicacion = detalle.cliente_ubicacion || 'No especificada';
    const coordenadas = (detalle.latitud && detalle.longitud) ? 
        `${detalle.latitud}, ${detalle.longitud}` : 'No especificadas';
    
    const placa = detalle.placa || 'No registrada';
    const marca = detalle.marca || 'No registrada';
    const modelo = detalle.modelo || 'No registrado';
    const anio = detalle.anio || 'No especificado';
    const kilometraje = detalle.kilometraje ? 
        `${Number(detalle.kilometraje).toLocaleString()} km` : '0 km';
    
    const estado = detalle.estado_global || 'EnRecepcion';
    const estadoLabels = {
        'EnRecepcion': 'En Recepción',
        'EnTaller': 'En Taller',
        'Finalizado': 'Finalizado'
    };
    const estadoLabel = estadoLabels[estado] || estado;
    const estadoColor = estado === 'EnRecepcion' ? '#ffc107' : estado === 'EnTaller' ? '#17a2b8' : '#28a745';
    
    const jefePrincipal = detalle.jefe_operativo?.nombre || 'No asignado';
    const jefeSecundario = detalle.jefe_operativo_2?.nombre || null;
    const jefePrincipalContacto = detalle.jefe_operativo?.contacto || '';
    
    const fechaIngreso = detalle.fecha_ingreso ? 
        new Date(detalle.fecha_ingreso).toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'No registrada';
    
    const audioHTML = detalle.audio_url ? `
        <div style="margin-top: 8px;">
            <audio controls src="${detalle.audio_url}" style="width: 100%; max-width: 280px; border-radius: 4px; height: 32px;"></audio>
        </div>
    ` : '';
    
    const fechaActual = new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    
    return `
        <div class="reporte-container" id="reporteImprimible" style="
            max-width: 100%;
            width: 100%;
            margin: 0 auto;
            padding: 10mm 12mm 8mm 12mm;
            font-family: 'Segoe UI', Arial, sans-serif;
            background: white;
            color: #222;
            font-size: 10.5px;
            line-height: 1.5;
            box-sizing: border-box;
            page-break-after: avoid;
        ">
            <!-- HEADER -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #C1121F; padding-bottom: 10px; margin-bottom: 12px;">
                <div>
                    <h1 style="font-size: 22px; color: #C1121F; margin: 0; letter-spacing: 1px;">FURIA <span style="color: #222;">MOTOR</span></h1>
                    <div style="font-size: 8px; color: #888; margin-top: 2px; letter-spacing: 2px;">TALLER AUTOMOTRIZ ESPECIALIZADO</div>
                </div>
                <div style="text-align: right; font-size: 8px; line-height: 1.4;">
                    <strong style="font-size: 9px; color: #C1121F;">FURIA MOTOR COMPANY</strong><br>
                    Cochabamba, Bolivia<br>
                    <span style="font-size: 7px; color: #999;">Tel: +591 4 1234567</span>
                </div>
            </div>
            
            <!-- TÍTULO DE ORDEN -->
            <div style="text-align: center; margin-bottom: 12px;">
                <h2 style="font-size: 14px; color: #C1121F; margin: 0; letter-spacing: 3px; text-transform: uppercase;">Orden de Trabajo - Recepción</h2>
                <div style="font-size: 13px; font-weight: bold; background: #f0f0f0; display: inline-block; padding: 4px 20px; border-radius: 4px; margin-top: 4px; color: #C1121F; border: 1px solid #ddd;">
                    # ${detalle.codigo_unico || 'OT-N/A'}
                </div>
            </div>
            
            <!-- INFORMACIÓN GENERAL - UNA SOLA FILA CON MEJOR ESPACIADO -->
            <div style="background: #f8f8f8; border-radius: 4px; padding: 8px 12px; margin-bottom: 10px; border: 1px solid #eee;">
                <div style="display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 9.5px;">
                    <span><strong>📅 Fecha:</strong> ${fechaIngreso}</span>
                    <span><strong>📊 Estado:</strong> <span style="background: ${estadoColor}; color: white; padding: 1px 10px; border-radius: 12px; font-size: 8px; font-weight: 600;">${estadoLabel}</span></span>
                    <span><strong>🆔 ID Orden:</strong> #${detalle.id || 'N/A'}</span>
                    <span><strong>👨‍💼 Jefe Operativo:</strong> ${jefePrincipal}</span>
                    ${jefeSecundario ? `<span><strong>👨‍💼 Jefe Op. 2:</strong> ${jefeSecundario}</span>` : ''}
                </div>
            </div>
            
            <!-- CLIENTE Y VEHÍCULO - DOS COLUMNAS CON MEJOR ESPACIADO -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <!-- CLIENTE -->
                <div style="background: #f8f8f8; border-radius: 4px; padding: 8px 12px; border: 1px solid #eee;">
                    <div style="font-weight: 700; font-size: 10px; color: #C1121F; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; letter-spacing: 1px;">
                        👤 Datos del Cliente
                    </div>
                    <div style="font-size: 9.5px; line-height: 1.7;">
                        <div><strong>Nombre:</strong> ${clienteNombre}</div>
                        <div><strong>Teléfono:</strong> ${clienteTelefono}</div>
                        <div><strong>Ubicación:</strong> ${clienteUbicacion}</div>
                        ${coordenadas !== 'No especificadas' ? `<div><strong>Coordenadas:</strong> ${coordenadas}</div>` : ''}
                    </div>
                </div>
                
                <!-- VEHÍCULO -->
                <div style="background: #f8f8f8; border-radius: 4px; padding: 8px 12px; border: 1px solid #eee;">
                    <div style="font-weight: 700; font-size: 10px; color: #C1121F; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; letter-spacing: 1px;">
                        🚗 Datos del Vehículo
                    </div>
                    <div style="font-size: 9.5px; line-height: 1.7;">
                        <div><strong style="color: #C1121F; font-size: 11px;">Placa:</strong> <strong style="color: #C1121F; font-size: 11px;">${placa}</strong></div>
                        <div><strong>Marca:</strong> ${marca}</div>
                        <div><strong>Modelo:</strong> ${modelo}</div>
                        <div><strong>Año:</strong> ${anio}</div>
                        <div><strong>Kilometraje:</strong> ${kilometraje}</div>
                    </div>
                </div>
            </div>
            
            <!-- FOTOS -->
            <div style="background: #f8f8f8; border-radius: 4px; padding: 8px 12px; margin-bottom: 10px; border: 1px solid #eee;">
                <div style="font-weight: 700; font-size: 10px; color: #C1121F; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; letter-spacing: 1px;">
                    📸 Fotos (${fotosArray.length}/7)
                </div>
                ${fotosHTML}
            </div>
            
            <!-- DESCRIPCIÓN -->
            <div style="background: #f8f8f8; border-radius: 4px; padding: 8px 12px; margin-bottom: 12px; border: 1px solid #eee;">
                <div style="font-weight: 700; font-size: 10px; color: #C1121F; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; letter-spacing: 1px;">
                    📝 Descripción del Problema
                </div>
                <div style="background: white; padding: 8px 10px; border-radius: 4px; font-size: 9.5px; min-height: 30px; border: 1px solid #e8e8e8; white-space: pre-wrap; line-height: 1.6;">
                    ${detalle.transcripcion_problema || 'No se registró descripción'}
                </div>
                ${audioHTML}
            </div>
            
            <!-- ✍️ FIRMAS - CON ESPACIO AMPLIO -->
            <div style="margin-top: 15px; padding-top: 12px; border-top: 2px solid #ddd;">
                <div style="font-weight: 700; font-size: 11px; color: #C1121F; text-align: center; margin-bottom: 12px; letter-spacing: 3px; text-transform: uppercase;">
                    ✍️ Firmas de Conformidad
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                    <!-- FIRMA CLIENTE -->
                    <div style="text-align: center; padding: 0 5px;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px;">Firma del Cliente</div>
                        <div style="border-bottom: 2px solid #333; height: 45px; margin-bottom: 5px;"></div>
                        <div style="font-size: 10px; color: #555; font-weight: 600;">${clienteNombre}</div>
                        <div style="font-size: 8px; color: #999; margin-top: 3px;">${fechaActual}</div>
                        <div style="font-size: 7px; color: #bbb; margin-top: 6px;">_________________________</div>
                        <div style="font-size: 7px; color: #bbb;">Nombre completo y fecha</div>
                    </div>
                    
                    <!-- FIRMA JEFE OPERATIVO -->
                    <div style="text-align: center; padding: 0 5px;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px;">Firma del Jefe Operativo</div>
                        <div style="border-bottom: 2px solid #333; height: 45px; margin-bottom: 5px;"></div>
                        <div style="font-size: 10px; color: #555; font-weight: 600;">${jefePrincipal}</div>
                        <div style="font-size: 8px; color: #999; margin-top: 3px;">${fechaActual}</div>
                        <div style="font-size: 7px; color: #bbb; margin-top: 6px;">_________________________</div>
                        <div style="font-size: 7px; color: #bbb;">Nombre completo y fecha</div>
                        ${jefePrincipalContacto ? `<div style="font-size: 7px; color: #999; margin-top: 4px;">📞 Contacto: ${jefePrincipalContacto}</div>` : ''}
                    </div>
                </div>
            </div>
            
            <!-- FOOTER -->
            <div style="text-align: center; margin-top: 18px; padding-top: 8px; border-top: 1px solid #eee; font-size: 7px; color: #bbb; line-height: 1.4;">
                <span>Documento generado automáticamente por <strong style="color: #C1121F;">FURIA MOTOR</strong></span> | 
                <span>Código: <strong>${detalle.codigo_unico || 'N/A'}</strong></span> | 
                <span>${new Date().toLocaleString('es-ES')}</span>
                <div style="color: #ccc; margin-top: 2px; font-size: 6.5px;">FURIA MOTOR COMPANY - Todos los derechos reservados</div>
            </div>
        </div>
    `;
}

// =====================================================
// FUNCIÓN PARA DESCARGAR PDF - TAMAÑO CARTA (LETTER)
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
    
    const btnDescargar = document.getElementById('btnDescargarPDFFinal') || document.getElementById('btnExportarPDFDetalle');
    if (btnDescargar) {
        btnDescargar.disabled = true;
        btnDescargar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    }

    showProgress('Generando PDF', 'Preparando el documento...', 3);
    updateProgressBar(10, 1);
    updateProgressMessage('Cargando imágenes...');

    try {
        // 🔥 PASO 1: Crear una copia del detalle para no modificar el original
        const detalleParaPDF = JSON.parse(JSON.stringify(datosReporteFinal));
        
        // 🔥 PASO 2: Verificar si ya tiene fotos en base64, si no, convertirlas
        const fotos = datosReporteFinal.fotos || {};
        const camposFotos = [
            'url_lateral_izquierda',
            'url_lateral_derecha',
            'url_foto_frontal',
            'url_foto_trasera',
            'url_foto_superior',
            'url_foto_inferior',
            'url_foto_tablero'
        ];
        
        // Contar fotos válidas que necesitan conversión
        const fotosNecesitanConversion = camposFotos.filter(c => {
            const url = fotos[c];
            return url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined' && !url.startsWith('data:image');
        });
        
        let fotosConvertidas = 0;
        const totalFotos = fotosNecesitanConversion.length;
        
        if (totalFotos > 0) {
            updateProgressMessage(`Convirtiendo ${totalFotos} fotos...`);
            
            for (const campo of fotosNecesitanConversion) {
                const url = fotos[campo];
                try {
                    const base64 = await convertirImagenABase64(url);
                    if (base64 && base64.startsWith('data:image')) {
                        detalleParaPDF.fotos[campo] = base64;
                        fotosConvertidas++;
                        updateProgressMessage(`✅ ${fotosConvertidas}/${totalFotos} fotos convertidas`);
                    } else {
                        detalleParaPDF.fotos[campo] = url;
                    }
                } catch (error) {
                    console.warn(`⚠️ No se pudo convertir ${campo}:`, error);
                    detalleParaPDF.fotos[campo] = url;
                }
            }
        }
        
        // 🔥 PASO 3: Asegurar que fotos_base64 exista
        if (!detalleParaPDF.fotos_base64) {
            detalleParaPDF.fotos_base64 = detalleParaPDF.fotos;
        }
        
        // 🔥 PASO 4: Generar el HTML del reporte
        updateProgressBar(40, 1);
        updateProgressMessage('Generando contenido del reporte...');
        
        const reporteHTML = generarHTMLReporte(detalleParaPDF);

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

        updateProgressBar(50, 1);
        updateProgressMessage('Renderizando contenido...');

        await new Promise(resolve => setTimeout(resolve, 500));

        // 🔥 PASO 5: Esperar a que las imágenes se carguen
        const imagenes = container.querySelectorAll('img');
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

        updateProgressBar(60, 2);
        updateProgressMessage('Generando archivo PDF...');

        const elemento = container.querySelector('.reporte-container');
        if (!elemento) {
            throw new Error('No se encontró el contenido del reporte');
        }

        if (typeof html2pdf === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // 🔥 TAMAÑO CARTA (LETTER) en mm: 215.9 x 279.4 mm
        // En descargarPDFFinal, actualiza los márgenes:
        const opt = {
            margin: [9, 9, 9, 9],  // Márgenes más amplios para mejor presentación
            filename: `Reporte_${detalleParaPDF.codigo_unico || 'orden'}.pdf`,
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
                        if (img.src && img.src.startsWith('data:image')) {
                            img.crossOrigin = 'anonymous';
                        }
                    });
                }
            },
            jsPDF: {
                unit: 'mm',
                format: 'letter',
                orientation: 'portrait'
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        updateProgressBar(80, 2);
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
// FUNCIÓN PARA MOSTRAR EL MODAL CON EL REPORTE
// Y GUARDAR PDF EN GOOGLE DRIVE AUTOMÁTICAMENTE
// =====================================================
async function mostrarReporteFinal(idOrden) {
    const modal = document.getElementById('codigoOrdenModal');
    const body = document.getElementById('ordenCompletadaBody');
    const btnDescargar = document.getElementById('btnDescargarPDFFinal');
    
    if (!modal || !body) return;
    
    if (btnDescargar) {
        btnDescargar.style.display = 'none';
        btnDescargar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando PDF...';
        btnDescargar.disabled = true;
    }
    
    body.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #C1121F; margin-bottom: 20px;"></i>
            <h3 style="color: white; margin-bottom: 10px;">Generando reporte...</h3>
            <p style="color: #8E8E93;">Por favor espera, estamos preparando tu documento</p>
            <div style="margin-top: 20px; max-width: 300px; margin-left: auto; margin-right: auto;">
                <div style="height: 4px; background: #2C2C2E; border-radius: 4px; overflow: hidden;">
                    <div id="pdfProgressBar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #C1121F, #8B0F1A); border-radius: 4px; transition: width 0.5s ease;"></div>
                </div>
                <p id="pdfProgressText" style="font-size: 12px; color: #8E8E93; margin-top: 8px;">Iniciando...</p>
            </div>
        </div>
    `;
    
    modal.classList.add('show');
    
    const updateProgress = (percent, text) => {
        const bar = document.getElementById('pdfProgressBar');
        const textEl = document.getElementById('pdfProgressText');
        if (bar) bar.style.width = `${Math.min(percent, 100)}%`;
        if (textEl) textEl.textContent = text;
    };
    
    updateProgress(10, 'Cargando datos de la orden...');
    
    const detalle = await cargarDatosOrdenCompleta(idOrden);
    
    if (!detalle) {
        body.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <h3>Error al cargar los datos</h3>
                <p>Intenta nuevamente o revisa la consola</p>
                <button class="btn-primary" onclick="cerrarModalOrden()" style="margin-top: 15px;">
                    <i class="fas fa-times"></i> Cerrar
                </button>
            </div>
        `;
        if (btnDescargar) {
            btnDescargar.style.display = 'none';
            btnDescargar.disabled = false;
        }
        return;
    }
    
    updateProgress(30, 'Datos cargados. Generando PDF...');
    
    try {
        // 🔥 USAR EL NUEVO ENDPOINT CON PDFKIT
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/generar-pdf-pdfkit/${idOrden}`, {
            method: 'POST'
        });
        
        updateProgress(60, 'Subiendo PDF a Google Drive...');
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al generar el PDF');
        }
        
        const data = await response.json();
        
        updateProgress(90, '¡PDF generado exitosamente!');
        
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
                <div style="background: #1A1A1C; border-radius: 8px; padding: 15px; margin: 15px 0; border: 1px solid #2C2C2E;">
                    <i class="fas fa-file-pdf" style="color: #C1121F; font-size: 20px; margin-right: 10px;"></i>
                    <span style="color: #8E8E93; font-size: 13px;">PDF guardado en Google Drive</span>
                    <br>
                    <span style="color: #8E8E93; font-size: 11px;">${data.filename || 'Documento'}</span>
                </div>
                <p style="color: #8E8E93; font-size: 14px;">Haz clic en "Descargar PDF" para obtener el reporte completo.</p>
            </div>
        `;
        
        if (btnDescargar) {
            btnDescargar.style.display = 'inline-flex';
            btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF';
            btnDescargar.disabled = false;
            btnDescargar.onclick = function(e) {
                e.preventDefault();
                if (data.url) {
                    window.open(data.url, '_blank');
                } else {
                    descargarPDFFinal();
                }
            };
        }
        
        datosReporteFinal = detalle;
        if (data.url) {
            datosReporteFinal.pdf_url = data.url;
        }
        
        updateProgress(100, '¡Completado!');
        mostrarNotificacion('✅ PDF generado y guardado en Google Drive', 'success');
        
        setTimeout(() => {
            const progressBar = document.getElementById('pdfProgressBar');
            const progressText = document.getElementById('pdfProgressText');
            if (progressBar) progressBar.style.display = 'none';
            if (progressText) progressText.style.display = 'none';
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error generando PDF:', error);
        
        body.innerHTML = `
            <div style="text-align: center; padding: 30px 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #F59E0B; margin-bottom: 20px;"></i>
                <h3 style="color: white; margin-bottom: 10px;">¡Recepción finalizada!</h3>
                <p style="color: #8E8E93; margin-bottom: 20px;">
                    El vehículo ha sido registrado con el código:<br>
                    <strong style="color: #C1121F; font-size: 20px; font-family: monospace;">${detalle.codigo_unico || 'OT-N/A'}</strong>
                </p>
                <div style="background: rgba(245, 158, 11, 0.1); border-radius: 8px; padding: 12px; margin: 10px 0; border: 1px solid rgba(245, 158, 11, 0.2);">
                    <p style="color: #F59E0B; font-size: 13px;">
                        <i class="fas fa-exclamation-circle"></i> 
                        Error al guardar PDF: ${error.message || 'Error desconocido'}
                    </p>
                    <p style="color: #8E8E93; font-size: 12px; margin-top: 5px;">
                        Puedes descargar el PDF manualmente con el botón de abajo.
                    </p>
                </div>
                <p style="color: #8E8E93; font-size: 14px;">Haz clic en "Descargar PDF" para obtener el reporte completo.</p>
            </div>
        `;
        
        if (btnDescargar) {
            btnDescargar.style.display = 'inline-flex';
            btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF';
            btnDescargar.disabled = false;
            btnDescargar.onclick = function(e) {
                e.preventDefault();
                descargarPDFFinal();
            };
        }
        
        datosReporteFinal = detalle;
        mostrarNotificacion('⚠️ Error al guardar PDF en Drive, pero la recepción está finalizada', 'warning');
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
// GENERAR FOTOS (AHORA LAS FOTOS ESTÁN EN EL HTML)
// =====================================================
function generatePhotoUploads() {
    console.log('📸 Las fotos están definidas en el HTML');
}

// =====================================================
// FUNCIÓN: CONFIGURAR SUBIDA DE FOTOS (COMPLETA)
// =====================================================
function setupPhotoUploads() {
    for (const foto of FOTOS_CONFIG) {
        const input = document.getElementById(foto.id);
        if (input) {
            input.addEventListener('change', () => procesarFoto(input, foto));
        }
        
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        const removeBtn = uploadDiv?.querySelector('.remove-photo');
        
        if (removeBtn) {
            removeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                const inputEl = document.getElementById(foto.id);
                const preview = uploadDiv.querySelector('.upload-preview');
                
                // 🔥 Limpiar usando removeAttribute
                uploadDiv.removeAttribute('data-drive-url');
                delete uploadDiv.dataset.driveUrl;
                delete fotosSubidasLocal[foto.campo];
                
                if (uploadDiv.dataset.objectUrl) {
                    URL.revokeObjectURL(uploadDiv.dataset.objectUrl);
                    delete uploadDiv.dataset.objectUrl;
                }
                
                if (inputEl) {
                    inputEl.value = '';
                    const newInput = inputEl.cloneNode(true);
                    inputEl.parentNode.replaceChild(newInput, inputEl);
                    newInput.addEventListener('change', () => procesarFoto(newInput, foto));
                }
                
                if (preview) {
                    preview.style.backgroundImage = '';
                    preview.innerHTML = '';
                    preview.style.display = '';
                }
                
                uploadDiv.classList.remove('has-image');
                uploadDiv.classList.remove('error');
                removeBtn.style.display = 'none';
                
                actualizarProgresoFoto(foto.campo, 0, 'pending');
                validarCompletadoFotos();
                
                if (codigoSesion && !modoEdicionRecepcion) {
                    guardarSeccion('fotos');
                }
                
                mostrarNotificacion(`📸 ${foto.label} eliminada${modoEdicionRecepcion ? ' de la edición' : ''}`, 'info');
            });
        }
    }
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

// Funciones de sesión
window.unirseSesionConCodigo = unirseSesionConCodigo;
window.finalizarSesionConReporte = finalizarSesionConReporte;

// Funciones de recepciones
window.verDetalleRecepcion = verDetalleRecepcion;
window.editarRecepcion = editarRecepcion;
window.confirmarEliminarRecepcion = confirmarEliminarRecepcion;

// Funciones de modales
window.cerrarModal = () => document.getElementById('codigoModal')?.classList.remove('show');
window.cerrarModalOrden = () => document.getElementById('codigoOrdenModal')?.classList.remove('show');
window.cerrarModalDetalle = () => document.getElementById('modalDetalleRecepcion')?.classList.remove('show');
window.cerrarModalEliminar = () => document.getElementById('modalConfirmarEliminar')?.classList.remove('show');

// Funciones de imágenes
window.verImagenAmpliada = verImagenAmpliada;
window.verImagenAmpliadaPorId = verImagenAmpliadaPorId;

// Funciones de PDF
window.descargarPDFFinal = descargarPDFFinal;
window.mostrarReporteFinal = mostrarReporteFinal;
window.cargarDatosOrdenCompleta = cargarDatosOrdenCompleta;
window.exportarDetallePDF = exportarDetallePDF;

// Logout
window.logout = () => {
    detenerPolling();
    detenerKeepAlive();
    if (sesionesPolling) clearInterval(sesionesPolling);
    localStorage.clear();
    window.location.href = `${window.API_BASE_URL}/`;
};

// =====================================================
// 🔥 FUNCIÓN PARA SINCRONIZAR FOTOS - CORREGIDA
// =====================================================

function sincronizarEstadoFotos() {
    console.log('🔄 [sincronizarEstadoFotos] Iniciando sincronización...');
    
    // 1. Contar fotos en el DOM
    let fotosDOM = 0;
    let fotosConUrl = 0;
    let fotosFaltantesDOM = [];
    
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        if (uploadDiv && uploadDiv.classList.contains('has-image')) {
            fotosDOM++;
            if (uploadDiv.dataset.driveUrl) {
                fotosConUrl++;
            } else {
                fotosFaltantesDOM.push(foto.label);
            }
        }
    }
    
    console.log(`📸 DOM: ${fotosDOM}/7 con imagen, ${fotosConUrl}/7 con URL`);
    
    // 2. Contar fotos en la sesión del backend
    let fotosSesion = 0;
    let fotosSesionConUrl = 0;
    
    if (sesionActual?.datos?.fotos) {
        const fotos = sesionActual.datos.fotos;
        for (const foto of FOTOS_CONFIG) {
            const url = fotos[foto.campo];
            if (url && url !== 'null' && url !== '') {
                fotosSesion++;
                fotosSesionConUrl++;
            }
        }
    }
    
    console.log(`📸 Sesión: ${fotosSesionConUrl}/7 fotos con URL`);
    
    // 3. SI EL DOM TIENE 7 PERO LA SESIÓN NO, FORZAR GUARDADO
    if (fotosConUrl === 7 && fotosSesionConUrl < 7) {
        console.log('🔥 DOM tiene 7 fotos, pero sesión no. Forzando guardado...');
        
        // Recopilar todas las URLs del DOM
        const fotosData = {};
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            fotosData[foto.campo] = uploadDiv?.dataset.driveUrl || null;
        }
        
        // Guardar directamente al backend
        guardarSeccion('fotos').then(() => {
            console.log('✅ Fotos guardadas forzadamente');
            // Re-validar después de guardar
            setTimeout(() => {
                validarCompletadoFotos();
            }, 500);
        });
        return;
    }
    
    // 4. SI LA SESIÓN TIENE 7 PERO EL DOM NO, ACTUALIZAR DOM
    if (fotosSesionConUrl === 7 && fotosConUrl < 7) {
        console.log('🔥 Sesión tiene 7 fotos, actualizando DOM...');
        
        for (const foto of FOTOS_CONFIG) {
            const url = sesionActual.datos.fotos[foto.campo];
            if (url && url !== 'null' && url !== '') {
                const uploadDiv = document.getElementById(`upload-${foto.id}`);
                if (uploadDiv) {
                    uploadDiv.dataset.driveUrl = url;
                    fotosSubidasLocal[foto.campo] = url;
                    
                    if (!uploadDiv.classList.contains('has-image')) {
                        const preview = uploadDiv.querySelector('.upload-preview');
                        if (preview) {
                            preview.style.backgroundImage = `url('${url}')`;
                            preview.style.backgroundSize = 'cover';
                            preview.style.backgroundPosition = 'center';
                            preview.innerHTML = '';
                            uploadDiv.classList.add('has-image');
                            const removeBtn = uploadDiv.querySelector('.remove-photo');
                            if (removeBtn) removeBtn.style.display = 'flex';
                            actualizarProgresoFoto(foto.campo, 100, 'completed');
                        }
                    }
                }
            }
        }
        
        setTimeout(() => {
            validarCompletadoFotos();
        }, 300);
        return;
    }
    
    // 5. Si ambas tienen 7, asegurar que el estado local sea true
    if (fotosConUrl === 7 && fotosSesionConUrl === 7) {
        console.log('✅ Todas las fotos están sincronizadas (7/7)');
        seccionesCompletadasLocal.fotos = true;
        actualizarEstadoVisualSeccion('fotos', true);
        actualizarBotonFinalizar();
    } else {
        // Mostrar qué fotos faltan
        const faltantes = FOTOS_CONFIG
            .filter(f => {
                const div = document.getElementById(`upload-${f.id}`);
                return !div || !div.dataset.driveUrl;
            })
            .map(f => f.label);
        
        if (faltantes.length > 0 && faltantes.length < 7) {
            console.log(`⚠️ Fotos faltantes: ${faltantes.join(', ')}`);
        }
    }
}

// =====================================================
// 🔥 SOBREESCRIBIR validarCompletadoFotos CON VERSIÓN CORREGIDA
// =====================================================

// Guardar la función original si existe
const originalValidarCompletadoFotos = window.validarCompletadoFotos || function() {};

// Nueva versión mejorada
window.validarCompletadoFotos = function() {
    console.log('📸 [validarCompletadoFotos] INICIO');
    
    // PASO 1: Contar fotos en el DOM
    let domFotosConUrl = 0;
    let domFotosConImagen = 0;
    const estadoFotosDOM = {};
    
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        const hasImage = uploadDiv?.classList.contains('has-image') || false;
        const driveUrl = uploadDiv?.dataset.driveUrl || null;
        
        estadoFotosDOM[foto.campo] = {
            hasImage,
            driveUrl,
            valid: !!(driveUrl && driveUrl !== 'null' && driveUrl !== '')
        };
        
        if (hasImage) domFotosConImagen++;
        if (estadoFotosDOM[foto.campo].valid) domFotosConUrl++;
    }
    
    console.log(`📸 DOM: ${domFotosConImagen} imágenes, ${domFotosConUrl} URLs válidas`);
    
    // PASO 2: Si DOM tiene 7 URLs, es la fuente de verdad
    if (domFotosConUrl === 7) {
        console.log('✅ DOM tiene 7 URLs válidas - marcando como completado');
        seccionesCompletadasLocal.fotos = true;
        actualizarEstadoVisualSeccion('fotos', true);
        actualizarBotonFinalizar();
        
        // Actualizar badge
        const fotosBadge = document.getElementById('statusFotos');
        if (fotosBadge) {
            fotosBadge.textContent = '✓ Completado (7/7)';
            fotosBadge.classList.add('completado');
            fotosBadge.classList.remove('en-proceso');
        }
        
        // Si la sesión no tiene 7, guardar
        let sesionFotos = 0;
        if (sesionActual?.datos?.fotos) {
            sesionFotos = Object.values(sesionActual.datos.fotos)
                .filter(v => v && v !== 'null' && v !== '').length;
        }
        
        if (sesionFotos < 7 && codigoSesion) {
            console.log('🔄 Sesión no tiene 7 fotos, guardando...');
            guardarSeccion('fotos');
        }
        
        return true;
    }
    
    // PASO 3: Verificar si la sesión tiene 7 fotos
    let sesionFotosValidas = 0;
    if (sesionActual?.datos?.fotos) {
        sesionFotosValidas = Object.values(sesionActual.datos.fotos)
            .filter(v => v && v !== 'null' && v !== '').length;
        console.log(`📸 Sesión: ${sesionFotosValidas}/7 fotos`);
    }
    
    // PASO 4: Si la sesión tiene 7, actualizar DOM
    if (sesionFotosValidas === 7 && domFotosConUrl < 7) {
        console.log('🔄 Sesión tiene 7 fotos, actualizando DOM...');
        for (const foto of FOTOS_CONFIG) {
            const url = sesionActual.datos.fotos[foto.campo];
            if (url && url !== 'null' && url !== '') {
                const uploadDiv = document.getElementById(`upload-${foto.id}`);
                if (uploadDiv && !uploadDiv.dataset.driveUrl) {
                    uploadDiv.dataset.driveUrl = url;
                    fotosSubidasLocal[foto.campo] = url;
                    
                    if (!uploadDiv.classList.contains('has-image')) {
                        const preview = uploadDiv.querySelector('.upload-preview');
                        if (preview) {
                            preview.style.backgroundImage = `url('${url}')`;
                            preview.style.backgroundSize = 'cover';
                            preview.style.backgroundPosition = 'center';
                            preview.innerHTML = '';
                            uploadDiv.classList.add('has-image');
                            const removeBtn = uploadDiv.querySelector('.remove-photo');
                            if (removeBtn) removeBtn.style.display = 'flex';
                            actualizarProgresoFoto(foto.campo, 100, 'completed');
                        }
                    }
                }
            }
        }
        // Recontar después de actualizar
        setTimeout(() => window.validarCompletadoFotos(), 300);
        return false;
    }
    
    // PASO 5: Estado intermedio - mostrar progreso
    const totalValidas = Math.max(domFotosConUrl, sesionFotosValidas);
    const fotosBadge = document.getElementById('statusFotos');
    if (fotosBadge) {
        if (totalValidas === 7) {
            fotosBadge.textContent = '✓ Completado (7/7)';
            fotosBadge.classList.add('completado');
            fotosBadge.classList.remove('en-proceso');
            seccionesCompletadasLocal.fotos = true;
        } else if (totalValidas > 0) {
            fotosBadge.textContent = `⏳ ${totalValidas}/7 en Drive`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
            seccionesCompletadasLocal.fotos = false;
        } else {
            fotosBadge.textContent = `○ ${domFotosConImagen}/7 fotos`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
            seccionesCompletadasLocal.fotos = false;
        }
    }
    
    actualizarBotonFinalizar();
    
    console.log(`📸 Resultado final: ${seccionesCompletadasLocal.fotos ? '✅ COMPLETADO' : '❌ PENDIENTE'}`);
    return seccionesCompletadasLocal.fotos;
};

// =====================================================
// 🔥 SOBREESCRIBIR cargarDatosSesionLigero PARA NO SOBREESCRIBIR FOTOS
// =====================================================

const originalCargarDatosSesionLigero = cargarDatosSesionLigero;

cargarDatosSesionLigero = async function() {
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
        
        // 🔥 GUARDAR FOTOS DEL DOM ANTES DE SOBREESCRIBIR
        const fotosDOM = {};
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            if (uploadDiv && uploadDiv.dataset.driveUrl) {
                fotosDOM[foto.campo] = uploadDiv.dataset.driveUrl;
            }
        }
        
        // Actualizar sesión
        sesionActual = data.sesion;
        
        // 🔥 RESTAURAR FOTOS DEL DOM SI ES NECESARIO
        if (sesionActual.datos && sesionActual.datos.fotos) {
            // Si el DOM tiene más fotos que la sesión, conservar las del DOM
            let domCount = Object.values(fotosDOM).filter(v => v && v !== 'null' && v !== '').length;
            let sesionCount = Object.values(sesionActual.datos.fotos).filter(v => v && v !== 'null' && v !== '').length;
            
            if (domCount > sesionCount) {
                console.log(`🔄 Conservando fotos del DOM (${domCount}) sobre sesión (${sesionCount})`);
                for (const campo of Object.keys(fotosDOM)) {
                    if (fotosDOM[campo]) {
                        sesionActual.datos.fotos[campo] = fotosDOM[campo];
                    }
                }
            }
        }
        
        // Actualizar secciones COMPLETADAS (excepto fotos si el DOM tiene más)
        const nuevasSecciones = data.sesion.secciones_completadas;
        if (nuevasSecciones) {
            // Para cliente y vehiculo y descripcion, usar lo que dice la sesión
            if (seccionesCompletadasLocal.cliente !== nuevasSecciones.cliente) {
                seccionesCompletadasLocal.cliente = nuevasSecciones.cliente;
                actualizarEstadoVisualSeccion('cliente', nuevasSecciones.cliente);
            }
            if (seccionesCompletadasLocal.vehiculo !== nuevasSecciones.vehiculo) {
                seccionesCompletadasLocal.vehiculo = nuevasSecciones.vehiculo;
                actualizarEstadoVisualSeccion('vehiculo', nuevasSecciones.vehiculo);
            }
            if (seccionesCompletadasLocal.descripcion !== nuevasSecciones.descripcion) {
                seccionesCompletadasLocal.descripcion = nuevasSecciones.descripcion;
                actualizarEstadoVisualSeccion('descripcion', nuevasSecciones.descripcion);
            }
            
            // 🔥 PARA FOTOS: usar validarCompletadoFotos() que hace la verificación completa
            setTimeout(() => {
                window.validarCompletadoFotos();
            }, 100);
        }
        
        actualizarBotonFinalizar();
        
    } catch (error) {
        logger.error('Error en polling ligero:', error);
    } finally {
        actualizando = false;
    }
};

console.log('✅ [FIX] validarCompletadoFotos y cargarDatosSesionLigero sobreescritos correctamente');

console.log('✅ recepcion.js cargado - Versión con Google Drive y cola secuencial');