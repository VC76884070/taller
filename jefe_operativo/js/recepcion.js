// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            return 'http://localhost:5000';
        }
        return '';
    })();
}

// =====================================================
// CONFIGURACIÓN PRINCIPAL
// =====================================================
const API_URL = `${window.API_BASE_URL}/api`;
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
let camposEnEdicion = { cliente: false, vehiculo: false, descripcion: false };

// Variables de audio
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioBlob = null;
let audioDriveUrl = null;
// Variables de transcripción en formulario
const btnTranscribirForm = document.getElementById('btnTranscribirAudio');
const transcripcionStatusForm = document.getElementById('transcripcionStatusForm');
const transcripcionTextoStatus = document.getElementById('transcripcionTextoStatus');  

// Variables de recepciones
let recepcionesActuales = [];
let offsetActual = 0;
let noHayMasRecepciones = false;
let totalRecepciones = 0;
let cargandoMas = false;
const LIMITE_RECEPCIONES = 5;

// Variables de edición
let modoEdicionRecepcion = false;
let recepcionEditandoId = null;

// Variables de Leaflet
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
let subidasActivas = {};

// Variables de progreso
let progressOverlay = null;
let currentProgress = 0;
let progressInterval = null;
let descargandoPDF = false;
let datosReporteFinal = null;

// Cola de subida de fotos
let uploadQueue = [];
let isProcessingQueue = false;
let uploadResults = [];
let colaActiva = false;

// CONSTANTES
const MAX_UPLOAD_RETRIES = 3;
const RETRY_DELAY = 2000;

// =====================================================
// ELEMENTOS DOM
// =====================================================
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
    { id: 'fotoLateralIzq', campo: 'lateral_izquierdo', label: 'Lateral Izquierdo' },
    { id: 'fotoLateralDer', campo: 'lateral_derecho', label: 'Lateral Derecho' },
    { id: 'fotoFrontal', campo: 'frontal', label: 'Frontal' },
    { id: 'fotoTrasera', campo: 'trasera', label: 'Trasera' },
    { id: 'fotoSuperior', campo: 'superior', label: 'Superior' },
    { id: 'fotoInferior', campo: 'inferior', label: 'Inferior' },
    { id: 'fotoTablero', campo: 'tablero', label: 'Tablero' }
];

const CAMPO_MAP = {
    'lateral_izquierdo': 'url_lateral_izquierda',
    'lateral_derecho': 'url_lateral_derecha',
    'frontal': 'url_foto_frontal',
    'trasera': 'url_foto_trasera',
    'superior': 'url_foto_superior',
    'inferior': 'url_foto_inferior',
    'tablero': 'url_foto_tablero'
};

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================
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
    setTimeout(() => { if (toast && document.body.contains(toast)) toast.remove(); }, 4000);
}

// =====================================================
// FETCH CON TOKEN
// =====================================================
async function fetchWithToken(url, options = {}) {
    const token = localStorage.getItem('furia_token');
    if (!token) throw new Error('No hay token de autenticación');
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    
    try {
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            const isUpload = url.includes('upload-foto') || url.includes('upload-audio');
            if (isUpload) throw new Error('Sesión expirada');
            
            try {
                const refreshResponse = await fetch(`${API_URL}/refresh-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                
                if (refreshResponse.ok) {
                    const refreshData = await refreshResponse.json();
                    if (refreshData.token) {
                        localStorage.setItem('furia_token', refreshData.token);
                        const newHeaders = { ...headers, 'Authorization': `Bearer ${refreshData.token}` };
                        if (options.body && options.body instanceof FormData) delete newHeaders['Content-Type'];
                        const retryResponse = await fetch(url, { ...options, headers: newHeaders });
                        if (retryResponse.ok) return retryResponse;
                    }
                }
            } catch (refreshError) {}
            
            if (!url.includes('upload-foto') && !url.includes('upload-audio')) {
                mostrarNotificacion('⏳ Sesión expirada. Inicia sesión nuevamente.', 'warning');
                localStorage.clear();
                setTimeout(() => window.location.href = `${window.API_BASE_URL}/`, 1500);
            }
            throw new Error('Sesión expirada');
        }
        return response;
    } catch (error) {
        throw error;
    }
}

// =====================================================
// PROGRESO
// =====================================================
function initProgressElements() {
    progressOverlay = document.getElementById('progressOverlay');
}

function showProgress(title, message) {
    if (!progressOverlay) initProgressElements();
    if (!progressOverlay) return;
    
    currentProgress = 0;
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressTitle = document.getElementById('progressTitle');
    const progressMessage = document.getElementById('progressMessage');
    const progressIcon = document.getElementById('progressIcon');
    
    if (progressBarFill) progressBarFill.style.width = '0%';
    if (progressPercentage) progressPercentage.textContent = '0%';
    if (progressTitle) progressTitle.textContent = title;
    if (progressMessage) progressMessage.textContent = message;
    if (progressIcon) progressIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
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

function updateProgressBar(percent) {
    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentage = document.getElementById('progressPercentage');
    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
    if (progressPercentage) progressPercentage.textContent = `${Math.floor(percent)}%`;
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
        if (progressIcon) progressIcon.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981;"></i>';
        if (progressTitle) progressTitle.textContent = '¡Completado!';
        setTimeout(hideProgress, 1500);
    } else {
        if (progressIcon) progressIcon.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>';
        if (progressTitle) progressTitle.textContent = 'Error';
        setTimeout(hideProgress, 2000);
    }
}

function hideProgress() {
    if (progressOverlay) progressOverlay.classList.remove('active');
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

// =====================================================
// ACTUALIZAR PROGRESO DE FOTO
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
        if (estado === 'completed') { percent.textContent = '✓'; percent.className = 'progress-percent completed'; }
        else if (estado === 'error') { percent.textContent = '✕'; percent.className = 'progress-percent error'; }
        else { percent.textContent = `${Math.round(progreso)}%`; percent.className = 'progress-percent'; }
    }
    
    if (badge) {
        badge.className = 'status-badge-foto';
        const icons = { pending: '<i class="fas fa-circle"></i>', uploading: '<i class="fas fa-spinner fa-spin"></i>', completed: '<i class="fas fa-check"></i>', error: '<i class="fas fa-times"></i>' };
        badge.innerHTML = icons[estado] || icons.pending;
        badge.classList.add(estado);
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
            error: '<i class="fas fa-exclamation-circle"></i> <span>Error</span>'
        };
        status.innerHTML = textos[estado] || textos.pending;
        status.classList.add(estado);
    }
}

// =====================================================
// SUBIR FOTO A GOOGLE DRIVE (CORREGIDO)
// =====================================================
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
            formData.append('codigo_sesion', codigoSesion || '');
            
            const codigoOrden = window.datosOriginalesRecepcion?.codigo_unico || null;
            formData.append('codigo_orden', codigoOrden || '');
            formData.append('modo_edicion', modoEdicionRecepcion ? 'true' : 'false');
            
            console.log('📸 Subiendo foto:', {
                campo,
                codigoSesion,
                codigoOrden,
                modoEdicion: modoEdicionRecepcion
            });
            
            const token = localStorage.getItem('furia_token');
            const response = await fetch(`${API_URL}/jefe-operativo/upload-foto`, {
                method: 'POST',
                body: formData,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.status === 401) {
                try {
                    const refreshResponse = await fetch(`${API_URL}/refresh-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token })
                    });
                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        if (refreshData.token) {
                            localStorage.setItem('furia_token', refreshData.token);
                            const retryResponse = await fetch(`${API_URL}/jefe-operativo/upload-foto`, {
                                method: 'POST',
                                body: formData,
                                headers: { 'Authorization': `Bearer ${refreshData.token}` }
                            });
                            if (retryResponse.ok) {
                                const data = await retryResponse.json();
                                if (data.success && data.url) { resolve(data.url); return; }
                            }
                        }
                    }
                } catch (refreshError) {}
                mostrarNotificacion('⚠️ Sesión expirada. Reintenta subir la foto.', 'warning');
                reject(new Error('Sesión expirada'));
                return;
            }
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (data.success && data.url) resolve(data.url);
            else reject(new Error(data.error || 'Error subiendo foto'));
        } catch (error) {
            reject(error);
        } finally {
            delete subidasActivas[campo];
        }
    });
}
// =====================================================
// REEMPLAZAR FOTO EN DRIVE (ELIMINA LA ANTERIOR Y SUBE LA NUEVA)
// =====================================================
async function reemplazarFotoEnDrive(file, campo, urlAnterior) {
    return new Promise(async (resolve, reject) => {
        if (subidasActivas[campo]) {
            reject(new Error(`Ya hay una subida en curso para ${campo}`));
            return;
        }
        subidasActivas[campo] = true;
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('carpeta', codigoSesion || 'recepcion');
            formData.append('campo', campo);
            formData.append('codigo_sesion', codigoSesion || '');
            formData.append('url_anterior', urlAnterior); // 🔥 ENVIAR URL ANTERIOR
            
            const codigoOrden = window.datosOriginalesRecepcion?.codigo_unico || null;
            formData.append('codigo_orden', codigoOrden || '');
            formData.append('modo_edicion', 'true');
            
            console.log('🔄 Reemplazando foto:', { campo, urlAnterior, codigoSesion, codigoOrden });
            
            const token = localStorage.getItem('furia_token');
            const response = await fetch(`${API_URL}/jefe-operativo/reemplazar-foto`, {
                method: 'POST',
                body: formData,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            // Manejar 401 - token expirado
            if (response.status === 401) {
                try {
                    const refreshResponse = await fetch(`${API_URL}/refresh-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token })
                    });
                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        if (refreshData.token) {
                            localStorage.setItem('furia_token', refreshData.token);
                            const retryResponse = await fetch(`${API_URL}/jefe-operativo/reemplazar-foto`, {
                                method: 'POST',
                                body: formData,
                                headers: { 'Authorization': `Bearer ${refreshData.token}` }
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
                } catch (refreshError) {}
                mostrarNotificacion('⚠️ Sesión expirada. Reintenta subir la foto.', 'warning');
                reject(new Error('Sesión expirada'));
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.url) {
                // Actualizar DOM con la nueva URL
                const uploadDiv = document.getElementById(`upload-${campo}`);
                if (uploadDiv) {
                    uploadDiv.setAttribute('data-drive-url', data.url);
                    uploadDiv.dataset.driveUrl = data.url;
                    fotosSubidasLocal[campo] = data.url;
                }
                // Actualizar datos originales para que no se pierda la referencia
                if (window.datosOriginalesRecepcion?.fotos) {
                    const campoMap = {
                        'lateral_izquierdo': 'url_lateral_izquierda',
                        'lateral_derecho': 'url_lateral_derecha',
                        'frontal': 'url_foto_frontal',
                        'trasera': 'url_foto_trasera',
                        'superior': 'url_foto_superior',
                        'inferior': 'url_foto_inferior',
                        'tablero': 'url_foto_tablero'
                    };
                    const campoDB = campoMap[campo] || campo;
                    window.datosOriginalesRecepcion.fotos[campoDB] = data.url;
                }
                resolve(data.url);
            } else {
                reject(new Error(data.error || 'Error reemplazando foto'));
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
            body: JSON.stringify({ codigo_sesion: codigoSesion, campo, url })
        });
        const data = await response.json();
        if (data.success && data.completado) {
            seccionesCompletadasLocal.fotos = true;
            actualizarEstadoVisualSeccion('fotos', true);
            actualizarBotonFinalizar();
        }
    } catch (error) {}
}

// =====================================================
// COMPRIMIR IMAGEN
// =====================================================
async function comprimirImagen(file) {
    try {
        if (file.size < 500 * 1024) return file;
        if (typeof imageCompressor !== 'undefined') {
            return await imageCompressor.compress(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.75, maxSizeMB: 1.2 });
        }
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    const maxSize = 1280;
                    if (width > maxSize || height > maxSize) {
                        if (width > height) { height = (height / width) * maxSize; width = maxSize; }
                        else { width = (width / height) * maxSize; height = maxSize; }
                    }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.75);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    } catch (error) {
        return file;
    }
}

// =====================================================
// ENCOLAR FOTO (CON SOPORTE PARA REEMPLAZO)
// =====================================================
function encolarFoto(file, campo, label, urlAnterior = null) {
    uploadQueue.push({ file, campo, label, intentos: 0, urlAnterior });
    actualizarProgresoFoto(campo, 0, 'pending');
    if (!isProcessingQueue) procesarCola();
}

// =====================================================
// PROCESAR COLA DE FOTOS (CORREGIDO - CON DOM CORRECTO)
// =====================================================
async function procesarCola() {
    if (uploadQueue.length === 0) {
        isProcessingQueue = false;
        colaActiva = false;
        const exitos = uploadResults.filter(r => r.success).length;
        const errores = uploadResults.filter(r => !r.success).length;
        
        if (errores > 0) {
            mostrarNotificacion(`⚠️ ${exitos} subidas exitosas, ${errores} errores`, 'warning');
        } else if (exitos > 0) {
            mostrarNotificacion(`✅ ${exitos} fotos subidas exitosamente`, 'success');
        }
        
        setTimeout(() => {
            validarCompletadoFotos();
            if (modoEdicionRecepcion && codigoSesion) {
                const fotosData = {};
                for (const foto of FOTOS_CONFIG) {
                    const uploadDiv = document.getElementById(`upload-${foto.id}`);
                    let url = uploadDiv?.getAttribute('data-drive-url') || 
                             uploadDiv?.dataset?.driveUrl || 
                             fotosSubidasLocal[foto.campo];
                    if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                        fotosData[foto.campo] = url;
                    }
                }
                if (Object.keys(fotosData).length > 0) {
                    guardarSeccion('fotos');
                }
            }
        }, 500);
        return;
    }
    
    isProcessingQueue = true;
    colaActiva = true;
    const item = uploadQueue.shift();
    const { file, campo, label, urlAnterior } = item;
    
    // 🔥 BUSCAR POR ID CORRECTO
    const fotoConfig = FOTOS_CONFIG.find(f => f.campo === campo);
    const uploadDiv = document.getElementById(`upload-${fotoConfig?.id || campo}`);
    const barContainer = uploadDiv?.querySelector('.progress-bar-foto');
    const statusContainer = uploadDiv?.querySelector('.uploading-status');
    const preview = uploadDiv?.querySelector('.upload-preview');
    const removeBtn = uploadDiv?.querySelector('.remove-photo');
    const ring = document.getElementById(`ring-${campo}`);
    const percent = document.getElementById(`percent-${campo}`);
    
    // 🔥 MOSTRAR ANIMACIÓN DE CARGA
    if (barContainer) barContainer.style.display = 'block';
    if (statusContainer) {
        statusContainer.style.display = 'flex';
        statusContainer.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Subiendo...</span>';
        statusContainer.className = 'uploading-status uploading';
    }
    if (ring) ring.classList.add('uploading');
    if (percent) percent.textContent = '0%';
    
    actualizarProgresoFoto(campo, 0, 'uploading');
    
    let progreso = 0;
    const interval = setInterval(() => {
        progreso += Math.random() * 15 + 5;
        if (progreso > 90) progreso = 90;
        actualizarProgresoFoto(campo, progreso, 'uploading');
    }, 300);
    
    try {
        let url;
        
        // 🔥 SI HAY URL ANTERIOR, USAR REEMPLAZO
        if (urlAnterior && modoEdicionRecepcion) {
            console.log(`🔄 Reemplazando foto ${campo} (anterior: ${urlAnterior.substring(0, 50)}...)`);
            url = await reemplazarFotoEnDrive(file, campo, urlAnterior);
        } else {
            console.log(`📸 Subiendo foto nueva ${campo}`);
            url = await subirFotoGoogleDrive(file, codigoSesion || 'temp', campo);
        }
        
        clearInterval(interval);
        
        // 🔥 ACTUALIZAR DOM CON LA URL
        if (uploadDiv) {
            // 🔥 IMPORTANTE: Guardar la URL en el DOM
            uploadDiv.setAttribute('data-drive-url', url);
            uploadDiv.dataset.driveUrl = url;
            fotosSubidasLocal[campo] = url;
            uploadDiv.classList.remove('error');
            uploadDiv.classList.add('has-image');
            
            // 🔥 Actualizar el preview con la URL
            if (preview) {
                preview.style.backgroundImage = `url('${url}')`;
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                preview.innerHTML = '';
                preview.style.display = 'block';
            }
            
            if (removeBtn) removeBtn.style.display = 'flex';
        }
        
        // 🔥 ACTUALIZAR PROGRESO
        actualizarProgresoFoto(campo, 100, 'completed');
        uploadResults.push({ campo, label, success: true, url });
        
        // 🔥 GUARDAR EN SESIÓN
        try { await actualizarSesionFoto(campo, url); } catch (e) {}
        
        // 🔥 ACTUALIZAR CONTADOR
        setTimeout(validarCompletadoFotos, 300);
        
        // Ocultar barras de progreso
        setTimeout(() => {
            if (barContainer) barContainer.style.display = 'none';
            if (statusContainer) {
                statusContainer.style.display = 'none';
                statusContainer.className = 'uploading-status';
            }
            if (ring) ring.classList.remove('uploading');
            if (percent) {
                percent.textContent = '✓';
                percent.className = 'progress-percent completed';
            }
        }, 1500);
        
        console.log(`✅ Foto ${campo} subida exitosamente: ${url.substring(0, 50)}...`);
        
    } catch (error) {
        clearInterval(interval);
        console.error(`❌ Error subiendo ${label}:`, error);
        
        actualizarProgresoFoto(campo, 100, 'error');
        uploadResults.push({ campo, label, success: false, error: error.message });
        
        if (uploadDiv) {
            uploadDiv.classList.add('error');
            const input = uploadDiv.querySelector('input[type="file"]');
            if (input) input.value = '';
        }
        
        if (statusContainer) {
            statusContainer.style.display = 'flex';
            statusContainer.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>Error: ${error.message}</span>`;
            statusContainer.className = 'uploading-status error';
        }
        
        setTimeout(() => {
            if (statusContainer) {
                statusContainer.style.display = 'none';
                statusContainer.className = 'uploading-status';
            }
        }, 4000);
        
        mostrarNotificacion(`❌ Error en ${label}: ${error.message}`, 'error');
    }
    
    setTimeout(procesarCola, 500);
}

// =====================================================
// PROCESAR FOTO (CORREGIDO - CON REEMPLAZO EN DRIVE)
// =====================================================
async function procesarFoto(input, foto) {
    const file = input.files[0];
    if (!file) return;
    
    const uploadDiv = document.getElementById(`upload-${foto.id}`);
    const preview = uploadDiv?.querySelector('.upload-preview');
    const removeBtn = uploadDiv?.querySelector('.remove-photo');
    
    // 🔥 OBTENER URL ANTERIOR (para reemplazar)
    let urlAnterior = uploadDiv?.getAttribute('data-drive-url') || 
                      uploadDiv?.dataset?.driveUrl || 
                      fotosSubidasLocal[foto.campo];
    
    // Si estamos en modo edición y hay URL anterior, guardarla para reemplazo
    if (modoEdicionRecepcion && urlAnterior && urlAnterior !== 'null' && urlAnterior !== '' && urlAnterior !== 'undefined') {
        console.log(`🔄 Reemplazando foto anterior para ${foto.campo}: ${urlAnterior}`);
    } else {
        urlAnterior = null;
    }
    
    // Limpiar datos anteriores
    if (uploadDiv) {
        uploadDiv.removeAttribute('data-drive-url');
        delete uploadDiv.dataset.driveUrl;
        delete fotosSubidasLocal[foto.campo];
        if (uploadDiv.dataset.objectUrl) {
            URL.revokeObjectURL(uploadDiv.dataset.objectUrl);
            delete uploadDiv.dataset.objectUrl;
        }
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
        uploadDiv.dataset.objectUrl = objectUrl;
        
        // Elementos de progreso
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
        
        if (removeBtn) removeBtn.style.display = 'flex';
    }
    
    try {
        const fileToUpload = await comprimirImagen(file);
        
        // 🔥 SI HAY URL ANTERIOR, USAR REEMPLAZO
        if (urlAnterior && modoEdicionRecepcion) {
            await reemplazarFotoEnDrive(fileToUpload, foto.campo, urlAnterior);
        } else {
            encolarFoto(fileToUpload, foto.campo, foto.label);
        }
        
        mostrarNotificacion(`📸 Subiendo ${foto.label}...`, 'info');
    } catch (error) {
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
        mostrarNotificacion(`Error en ${foto.label}`, 'error');
    }
}

// =====================================================
// VALIDAR COMPLETADO DE FOTOS (CORREGIDO - RECALCULA CORRECTAMENTE)
// =====================================================
function validarCompletadoFotos() {
    let fotosConUrl = 0;
    let fotosConImagen = 0;
    let fotosDetalle = {};
    let fotosEliminadas = 0;
    
    console.log('📸 Validando fotos...');
    
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        const hasImage = uploadDiv?.classList.contains('has-image') || false;
        
        // 🔥 OBTENER URL DEL DOM (LA FUENTE MÁS CONFIABLE)
        let driveUrl = uploadDiv?.getAttribute('data-drive-url') || 
                       uploadDiv?.dataset?.driveUrl || 
                       null;
        
        // 🔥 VERIFICAR EN fotosSubidasLocal SOLO SI NO HAY URL EN EL DOM
        if (!driveUrl || driveUrl === 'null' || driveUrl === '' || driveUrl === 'undefined') {
            const localUrl = fotosSubidasLocal[foto.campo];
            if (localUrl && localUrl !== 'null' && localUrl !== '' && localUrl !== 'undefined') {
                driveUrl = localUrl;
                // Restaurar en el DOM
                if (uploadDiv) {
                    uploadDiv.setAttribute('data-drive-url', driveUrl);
                    uploadDiv.dataset.driveUrl = driveUrl;
                }
            }
        }
        
        // 🔥 SOLO COMO FALLBACK: Buscar en datos originales
        if (!driveUrl || driveUrl === 'null' || driveUrl === '' || driveUrl === 'undefined') {
            if (window.datosOriginalesRecepcion?.fotos) {
                const url = window.datosOriginalesRecepcion.fotos[CAMPO_MAP[foto.campo]];
                if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                    driveUrl = url;
                    // Restaurar en el DOM
                    if (uploadDiv) {
                        uploadDiv.setAttribute('data-drive-url', driveUrl);
                        uploadDiv.dataset.driveUrl = driveUrl;
                        fotosSubidasLocal[foto.campo] = driveUrl;
                    }
                }
            }
        }
        
        // 🔥 SOLO COMO FALLBACK ULTIMO: Buscar en sesión
        if (!driveUrl || driveUrl === 'null' || driveUrl === '' || driveUrl === 'undefined') {
            if (sesionActual?.datos?.fotos) {
                const url = sesionActual.datos.fotos[CAMPO_MAP[foto.campo]];
                if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                    driveUrl = url;
                    if (uploadDiv) {
                        uploadDiv.setAttribute('data-drive-url', driveUrl);
                        uploadDiv.dataset.driveUrl = driveUrl;
                        fotosSubidasLocal[foto.campo] = driveUrl;
                    }
                }
            }
        }
        
        // 🔥 VERIFICAR SI LA FOTO FUE ELIMINADA (no tiene imagen ni URL)
        const esEliminada = !hasImage && (!driveUrl || driveUrl === 'null' || driveUrl === '' || driveUrl === 'undefined');
        if (esEliminada) {
            fotosEliminadas++;
            // Asegurar que no queden vestigios
            if (uploadDiv) {
                uploadDiv.removeAttribute('data-drive-url');
                delete uploadDiv.dataset.driveUrl;
                delete fotosSubidasLocal[foto.campo];
            }
            // Eliminar de datos originales también
            if (window.datosOriginalesRecepcion?.fotos) {
                window.datosOriginalesRecepcion.fotos[CAMPO_MAP[foto.campo]] = null;
            }
            if (window.fotosOriginalesRecepcion) {
                window.fotosOriginalesRecepcion[CAMPO_MAP[foto.campo]] = null;
            }
        }
        
        // 🔥 CONTAR URLS VÁLIDAS
        if (driveUrl && driveUrl !== 'null' && driveUrl !== '' && driveUrl !== 'undefined') {
            // Verificar que la URL no sea de una foto eliminada que quedó en cache
            const esValida = !esEliminada && (uploadDiv?.classList.contains('has-image') || true);
            if (esValida) {
                fotosConUrl++;
                fotosDetalle[foto.campo] = { 
                    url: driveUrl, 
                    estado: 'completado',
                    label: foto.label 
                };
                console.log(`📸 ${foto.campo}: URL válida ✅`);
            } else {
                fotosDetalle[foto.campo] = { 
                    url: null, 
                    estado: 'eliminada',
                    label: foto.label 
                };
                console.log(`📸 ${foto.campo}: URL inválida (eliminada) ❌`);
            }
        } else if (hasImage) {
            // Tiene imagen pero no URL - podría estar subiendo
            fotosConImagen++;
            fotosDetalle[foto.campo] = { 
                url: null, 
                estado: 'subiendo',
                label: foto.label 
            };
            console.log(`📸 ${foto.campo}: Subiendo... ⏳`);
        } else {
            fotosDetalle[foto.campo] = { 
                url: null, 
                estado: 'pendiente',
                label: foto.label 
            };
            console.log(`📸 ${foto.campo}: Pendiente ○`);
        }
    }
    
    // 🔥 CALCULAR COMPLETADO - SOLO SI HAY 7 FOTOS CON URL VÁLIDA
    const completado = fotosConUrl === 7;
    
    // 🔥 ACTUALIZAR BADGE VISUAL
    const fotosBadge = document.getElementById('statusFotos');
    if (fotosBadge) {
        if (completado) {
            fotosBadge.textContent = '✓ Completado (7/7)';
            fotosBadge.className = 'status-badge completado';
        } else if (fotosConUrl > 0) {
            fotosBadge.textContent = `⏳ ${fotosConUrl}/7 en Drive`;
            fotosBadge.className = 'status-badge en-proceso';
        } else if (fotosConImagen > 0) {
            fotosBadge.textContent = `⏳ Subiendo ${fotosConImagen}/7`;
            fotosBadge.className = 'status-badge en-proceso';
        } else {
            fotosBadge.textContent = `○ ${fotosEliminadas > 0 ? 'Eliminadas' : '0/7 fotos'}`;
            fotosBadge.className = 'status-badge en-proceso';
        }
    }
    
    // 🔥 ACTUALIZAR ESTADO LOCAL
    if (seccionesCompletadasLocal.fotos !== completado) {
        seccionesCompletadasLocal.fotos = completado;
        actualizarBotonFinalizar();
        console.log(`📸 Estado actualizado: ${completado ? 'COMPLETADO ✅' : 'PENDIENTE ❌'}`);
    }
    
    console.log('📸 Resumen final:', {
        total: fotosConUrl,
        completado: completado,
        eliminadas: fotosEliminadas,
        subiendo: fotosConImagen,
        detalle: fotosDetalle
    });
    
    return completado;
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
                let url = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
                if (!url && sesionActual?.datos?.fotos) url = sesionActual.datos.fotos[CAMPO_MAP[foto.campo]];
                fotosData[foto.campo] = url || null;
            }
            datos = fotosData;
            break;
        case 'descripcion':
            datos = { texto: descripcionProblema?.value || '', audio_url: audioDriveUrl };
            break;
    }
    
    const btnGuardar = document.querySelector(`.btn-guardar-seccion[data-seccion="${seccion}"]`);
    if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/guardar-seccion`, {
            method: 'POST',
            body: JSON.stringify({ codigo: codigoSesion, seccion, datos, usuario_id: userInfo?.id, usuario_nombre: userInfo?.nombre })
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
                        fotosBadge.textContent = fotos_validas === 7 ? '✓ Completado (7/7)' : `⏳ ${fotos_validas}/7 en Drive`;
                        fotosBadge.className = `status-badge ${fotos_validas === 7 ? 'completado' : 'en-proceso'}`;
                    }
                } else {
                    seccionesCompletadasLocal[seccion] = data.sesion.secciones_completadas[seccion];
                    actualizarEstadoVisualSeccion(seccion, data.sesion.secciones_completadas[seccion]);
                }
            }
            actualizarBotonFinalizar();
            mostrarNotificacion(`✓ ${seccion} guardado`, 'success');
        }
    } catch (error) {
        mostrarNotificacion('Error al guardar', 'error');
    } finally {
        if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.innerHTML = `<i class="fas fa-save"></i> Guardar`; }
    }
}

// =====================================================
// AUDIO
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
        mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
        mediaRecorder.onstop = async () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            if (audioPreview) {
                audioPreview.src = URL.createObjectURL(audioBlob);
                audioPreview.style.display = 'block';
            }
            audioStatus.textContent = 'Subiendo audio...';
            try {
                const driveUrl = await subirAudioGoogleDrive(audioBlob, codigoSesion || 'temp');
                audioDriveUrl = driveUrl;
                audioStatus.textContent = 'Audio guardado en Drive';
                btnEliminarAudio.style.display = 'flex';
                mostrarNotificacion('✅ Audio subido', 'success');
                if (codigoSesion && descripcionProblema?.value.trim()) await guardarSeccion('descripcion');
                validarCompletadoDescripcion();
            } catch (error) {
                audioStatus.textContent = 'Error al subir audio';
                mostrarNotificacion('Error subiendo audio', 'error');
            }
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        isRecording = true;
        btnGrabarAudio.classList.add('recording');
        btnGrabarAudio.innerHTML = '<i class="fas fa-stop"></i> Detener';
        audioStatus.textContent = 'Grabando...';
        btnEliminarAudio.style.display = 'none';
    } catch (error) {
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
    audioDriveUrl = null;
    if (audioPreview) { audioPreview.src = ''; audioPreview.style.display = 'none'; }
    audioStatus.textContent = 'Grabación eliminada';
    btnEliminarAudio.style.display = 'none';
    btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
    isRecording = false;
    
    // 🔥 OCULTAR BOTÓN DE TRANSCRIPCIÓN
    if (btnTranscribirForm) {
        btnTranscribirForm.style.display = 'none';
        btnTranscribirForm.disabled = false;
    }
    if (transcripcionStatusForm) {
        transcripcionStatusForm.style.display = 'none';
        transcripcionStatusForm.className = '';
    }
    
    validarCompletadoDescripcion();
}

// =====================================================
// SUBIR AUDIO A GOOGLE DRIVE
// =====================================================

async function subirAudioGoogleDrive(audioBlob, carpeta) {
    return new Promise(async (resolve, reject) => {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('carpeta', carpeta || 'recepcion');
        formData.append('tipo', 'audio');
        formData.append('codigo_sesion', codigoSesion);
        const token = localStorage.getItem('furia_token');
        
        try {
            const response = await fetch(`${API_URL}/jefe-operativo/upload-audio`, {
                method: 'POST',
                body: formData,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            // Manejar 401 - token expirado
            if (response.status === 401) {
                try {
                    const refreshResponse = await fetch(`${API_URL}/refresh-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token })
                    });
                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        if (refreshData.token) {
                            localStorage.setItem('furia_token', refreshData.token);
                            const retryResponse = await fetch(`${API_URL}/jefe-operativo/upload-audio`, {
                                method: 'POST',
                                body: formData,
                                headers: { 'Authorization': `Bearer ${refreshData.token}` }
                            });
                            if (retryResponse.ok) {
                                const data = await retryResponse.json();
                                if (data.success && data.url) {
                                    // 🔥 MOSTRAR BOTÓN DE TRANSCRIPCIÓN
                                    if (btnTranscribirForm) {
                                        btnTranscribirForm.style.display = 'inline-flex';
                                        btnTranscribirForm.disabled = false;
                                        btnTranscribirForm.innerHTML = '<i class="fas fa-microphone-alt"></i> 🎙️ Transcribir Audio';
                                    }
                                    if (transcripcionStatusForm) {
                                        transcripcionStatusForm.style.display = 'none';
                                    }
                                    resolve(data.url);
                                    return;
                                }
                            }
                        }
                    }
                } catch (refreshError) {}
                mostrarNotificacion('⚠️ Sesión expirada. Reintenta subir el audio.', 'warning');
                reject(new Error('Sesión expirada'));
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.url) {
                // 🔥 MOSTRAR BOTÓN DE TRANSCRIPCIÓN
                if (btnTranscribirForm) {
                    btnTranscribirForm.style.display = 'inline-flex';
                    btnTranscribirForm.disabled = false;
                    btnTranscribirForm.innerHTML = '<i class="fas fa-microphone-alt"></i> 🎙️ Transcribir Audio';
                }
                if (transcripcionStatusForm) {
                    transcripcionStatusForm.style.display = 'none';
                }
                resolve(data.url);
            } else {
                reject(new Error(data.error || 'Error subiendo audio'));
            }
            
        } catch (error) {
            reject(error);
        }
    });
}

function validarCompletadoCliente() {
    const nombre = document.getElementById('clienteNombre')?.value?.trim();
    const telefono = document.getElementById('clienteTelefono')?.value?.trim();
    const ubicacion = document.getElementById('clienteUbicacion')?.value?.trim();
    
    // 🔥 AHORA REQUIERE LOS 3 CAMPOS: NOMBRE + TELÉFONO + UBICACIÓN
    const completada = !!(nombre && telefono && ubicacion);
    
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
    const placa = document.getElementById('vehiculoPlaca')?.value?.trim();
    const marca = document.getElementById('vehiculoMarca')?.value?.trim();
    const modelo = document.getElementById('vehiculoModelo')?.value?.trim();
    const anio = document.getElementById('vehiculoAnio')?.value?.trim();
    const kilometraje = document.getElementById('vehiculoKilometraje')?.value?.trim();
    
    // 🔥 AHORA REQUIERE LOS 5 CAMPOS: PLACA + MARCA + MODELO + AÑO + KILOMETRAJE
    const completada = !!(placa && marca && modelo && anio && kilometraje);
    
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

function validarCompletadoDescripcion() {
    const texto = descripcionProblema?.value?.trim();
    const tieneAudio = !!(audioDriveUrl && audioDriveUrl !== 'null' && audioDriveUrl !== '');
    
    // 🔥 AHORA REQUIERE TEXTO + AUDIO
    const completada = !!(texto && texto.length > 0 && tieneAudio);
    
    if (seccionesCompletadasLocal.descripcion !== completada) {
        seccionesCompletadasLocal.descripcion = completada;
        actualizarEstadoVisualSeccion('descripcion', completada);
        actualizarBotonFinalizar();
    }
    return completada;
}

function actualizarEstadoVisualSeccion(seccion, completada) {
    const badge = document.getElementById(`status${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
    if (badge) {
        badge.textContent = completada ? '✓ Completado' : '○ Pendiente';
        badge.className = `status-badge ${completada ? 'completado' : 'en-proceso'}`;
    }
}

function actualizarBotonFinalizar() {
    if (!btnFinalizar) return;
    const todasCompletas = seccionesCompletadasLocal.cliente && seccionesCompletadasLocal.vehiculo && seccionesCompletadasLocal.fotos && seccionesCompletadasLocal.descripcion;
    btnFinalizar.disabled = !todasCompletas;
    btnFinalizar.title = todasCompletas ? 'Finalizar recepción' : 'Completa todas las secciones';
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
            document.getElementById('clienteNombre').value = datos.cliente.nombre || '';
            document.getElementById('clienteTelefono').value = datos.cliente.telefono || '';
            document.getElementById('clienteUbicacion').value = datos.cliente.ubicacion || '';
            document.getElementById('clienteLatitud').value = datos.cliente.latitud || '';
            document.getElementById('clienteLongitud').value = datos.cliente.longitud || '';
            validarCompletadoCliente();
        }
        
        if (datos.vehiculo) {
            document.getElementById('vehiculoPlaca').value = datos.vehiculo.placa || '';
            document.getElementById('vehiculoMarca').value = datos.vehiculo.marca || '';
            document.getElementById('vehiculoModelo').value = datos.vehiculo.modelo || '';
            document.getElementById('vehiculoAnio').value = datos.vehiculo.anio || '';
            document.getElementById('vehiculoKilometraje').value = datos.vehiculo.kilometraje || '';
            validarCompletadoVehiculo();
        }
        
        if (datos.fotos) {
            for (const foto of FOTOS_CONFIG) {
                const url = datos.fotos[CAMPO_MAP[foto.campo]];
                if (url && url !== 'null' && url !== '') {
                    const uploadDiv = document.getElementById(`upload-${foto.id}`);
                    const preview = uploadDiv?.querySelector('.upload-preview');
                    if (preview) {
                        preview.style.backgroundImage = `url('${url}')`;
                        preview.style.backgroundSize = 'cover';
                        preview.style.backgroundPosition = 'center';
                        preview.innerHTML = '';
                        uploadDiv.classList.add('has-image');
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
            descripcionProblema.value = datos.descripcion.texto || '';
            if (datos.descripcion.audio_url) {
                audioDriveUrl = datos.descripcion.audio_url;
                audioPreview.src = audioDriveUrl;
                audioPreview.style.display = 'block';
                btnEliminarAudio.style.display = 'flex';
                audioStatus.textContent = 'Audio disponible';
            }
            validarCompletadoDescripcion();
        }
        
        if (sesionActual.colaboradores_nombres) {
            const count = sesionActual.colaboradores_nombres.length;
            colaboradoresCount.textContent = count;
            colaboradoresCountDetail.textContent = count;
            colaboradoresList.innerHTML = sesionActual.colaboradores_nombres.map(n => 
                `<div class="colaborador"><i class="fas fa-user"></i><span>${escapeHtml(n)}</span>${n === userInfo?.nombre ? '<span class="badge-you"> (Tú)</span>' : ''}</div>`
            ).join('');
        }
        
        if (sesionActual.secciones_completadas) {
            seccionesCompletadasLocal = { ...sesionActual.secciones_completadas };
            actualizarBotonFinalizar();
        }
    } catch (error) {}
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

// =====================================================
// FUNCIÓN COMPLETA: FINALIZAR SESIÓN CON REPORTE (CORREGIDA)
// =====================================================
async function finalizarSesionConReporte() {
    if (!codigoSesion) {
        mostrarNotificacion('⚠️ No hay sesión activa', 'warning');
        return;
    }

    showProgress('Finalizando Recepción', 'Validando datos...');
    updateProgressBar(5);

    try {
        // =============================================
        // 1. RECOLECTAR TODAS LAS URLS DE FOTOS
        // =============================================
        updateProgressMessage('Verificando fotos...');
        
        // Construir objeto de fotos con todas las URLs
        const fotosParaGuardar = {};
        let fotosFaltantes = [];
        let totalFotosConUrl = 0;
        
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            let url = uploadDiv?.getAttribute('data-drive-url') || 
                     uploadDiv?.dataset?.driveUrl || 
                     fotosSubidasLocal[foto.campo];
            
            // Verificar en la sesión
            if (!url || url === 'null' || url === '' || url === 'undefined') {
                if (sesionActual?.datos?.fotos) {
                    url = sesionActual.datos.fotos[CAMPO_MAP[foto.campo]];
                }
            }
            
            if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                fotosParaGuardar[foto.campo] = url;
                totalFotosConUrl++;
            } else {
                // Verificar si hay imagen en el preview (subida pero sin URL)
                const preview = uploadDiv?.querySelector('.upload-preview');
                const hasImage = uploadDiv?.classList.contains('has-image') || 
                                (preview && preview.style.backgroundImage && 
                                 preview.style.backgroundImage !== '' && 
                                 preview.style.backgroundImage !== 'none');
                
                if (hasImage) {
                    // Tiene imagen pero no URL - podría estar subiendo
                    fotosFaltantes.push(`${foto.label} (subiendo...)`);
                } else {
                    fotosFaltantes.push(foto.label);
                }
            }
        }

        // =============================================
        // 2. VERIFICAR QUE TODAS LAS FOTOS TENGAN URL
        // =============================================
        if (totalFotosConUrl < 7) {
            // Intentar guardar las fotos que tenemos en la sesión
            if (Object.keys(fotosParaGuardar).length > 0) {
                updateProgressMessage('Guardando fotos en el servidor...');
                
                // Guardar sección de fotos
                const guardarResponse = await fetchWithToken(`${API_URL}/jefe-operativo/guardar-seccion`, {
                    method: 'POST',
                    body: JSON.stringify({
                        codigo: codigoSesion,
                        seccion: 'fotos',
                        datos: fotosParaGuardar
                    })
                });
                
                if (guardarResponse.ok) {
                    const guardarData = await guardarResponse.json();
                    if (guardarData.success) {
                        sesionActual = guardarData.sesion;
                        // Recalcular fotos
                        const fotosSesion = sesionActual?.datos?.fotos || {};
                        totalFotosConUrl = Object.values(fotosSesion).filter(v => v && v !== 'null' && v !== '').length;
                    }
                }
            }
            
            // Verificar nuevamente después de guardar
            if (totalFotosConUrl < 7) {
                // Recalcular fotos faltantes
                fotosFaltantes = [];
                for (const foto of FOTOS_CONFIG) {
                    const uploadDiv = document.getElementById(`upload-${foto.id}`);
                    let url = uploadDiv?.getAttribute('data-drive-url') || 
                             uploadDiv?.dataset?.driveUrl || 
                             fotosSubidasLocal[foto.campo];
                    
                    if (!url || url === 'null' || url === '' || url === 'undefined') {
                        if (sesionActual?.datos?.fotos) {
                            url = sesionActual.datos.fotos[CAMPO_MAP[foto.campo]];
                        }
                    }
                    
                    if (!url || url === 'null' || url === '' || url === 'undefined') {
                        fotosFaltantes.push(foto.label);
                    }
                }
                
                if (fotosFaltantes.length > 0) {
                    completeProgress(false);
                    mostrarNotificacion(`⚠️ Faltan fotos: ${fotosFaltantes.join(', ')}`, 'warning');
                    return;
                }
            }
        }

        // =============================================
        // 3. VALIDAR TODAS LAS SECCIONES
        // =============================================
        updateProgressBar(30);
        updateProgressMessage('Validando datos...');
        
        // Validar cliente
        const clienteNombre = document.getElementById('clienteNombre')?.value?.trim() || '';
        const clienteTelefono = document.getElementById('clienteTelefono')?.value?.trim() || '';
        seccionesCompletadasLocal.cliente = !!(clienteNombre && clienteTelefono);
        actualizarEstadoVisualSeccion('cliente', seccionesCompletadasLocal.cliente);
        
        // Validar vehículo
        const placa = document.getElementById('vehiculoPlaca')?.value?.trim() || '';
        const marca = document.getElementById('vehiculoMarca')?.value?.trim() || '';
        const modelo = document.getElementById('vehiculoModelo')?.value?.trim() || '';
        seccionesCompletadasLocal.vehiculo = !!(placa && marca && modelo);
        actualizarEstadoVisualSeccion('vehiculo', seccionesCompletadasLocal.vehiculo);
        
        // Validar fotos (usar totalFotosConUrl)
        seccionesCompletadasLocal.fotos = totalFotosConUrl === 7;
        actualizarEstadoVisualSeccion('fotos', seccionesCompletadasLocal.fotos);
        
        // Validar descripción
        const descripcionTexto = descripcionProblema?.value?.trim() || '';
        seccionesCompletadasLocal.descripcion = !!(descripcionTexto && descripcionTexto.length > 0);
        actualizarEstadoVisualSeccion('descripcion', seccionesCompletadasLocal.descripcion);
        
        // =============================================
        // 4. VERIFICAR ESTADO FINAL
        // =============================================
        const seccionesFaltantes = [];
        if (!seccionesCompletadasLocal.cliente) seccionesFaltantes.push('Cliente');
        if (!seccionesCompletadasLocal.vehiculo) seccionesFaltantes.push('Vehículo');
        if (!seccionesCompletadasLocal.fotos) seccionesFaltantes.push('Fotos (7/7 requeridas)');
        if (!seccionesCompletadasLocal.descripcion) seccionesFaltantes.push('Descripción');
        
        if (seccionesFaltantes.length > 0) {
            completeProgress(false);
            mostrarNotificacion(`⚠️ Completa: ${seccionesFaltantes.join(', ')}`, 'warning');
            return;
        }

        // =============================================
        // 5. CONFIRMAR CON EL USUARIO
        // =============================================
        if (!confirm('✅ ¿Finalizar recepción?\n\nLos datos se guardarán permanentemente y se generará la orden de trabajo.')) {
            hideProgress();
            return;
        }

        // =============================================
        // 6. PREPARAR DATOS PARA ENVIAR
        // =============================================
        updateProgressBar(50);
        updateProgressMessage('Preparando datos...');
        
        // Recolectar todas las URLs de fotos de la sesión o del DOM
        const fotosFinales = {};
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            let url = uploadDiv?.getAttribute('data-drive-url') || 
                     uploadDiv?.dataset?.driveUrl || 
                     fotosSubidasLocal[foto.campo];
            
            if (!url || url === 'null' || url === '' || url === 'undefined') {
                if (sesionActual?.datos?.fotos) {
                    url = sesionActual.datos.fotos[CAMPO_MAP[foto.campo]];
                }
            }
            
            if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                fotosFinales[foto.campo] = url;
            }
        }
        
        const datosFinales = {
            cliente: {
                nombre: clienteNombre,
                telefono: clienteTelefono,
                ubicacion: document.getElementById('clienteUbicacion')?.value || '',
                latitud: document.getElementById('clienteLatitud')?.value || null,
                longitud: document.getElementById('clienteLongitud')?.value || null
            },
            vehiculo: {
                placa: placa.toUpperCase(),
                marca: marca,
                modelo: modelo,
                anio: parseInt(document.getElementById('vehiculoAnio')?.value) || null,
                kilometraje: parseInt(document.getElementById('vehiculoKilometraje')?.value) || 0
            },
            fotos: fotosFinales,
            descripcion: {
                texto: descripcionTexto,
                audio_url: audioDriveUrl || null
            }
        };

        // =============================================
        // 7. ENVIAR AL SERVIDOR PARA FINALIZAR
        // =============================================
        updateProgressBar(60);
        updateProgressMessage('Generando orden de trabajo...');
        
        if (!userInfo || !userInfo.id) {
            throw new Error('No se encontró información del usuario.');
        }
        
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/finalizar-sesion`, {
            method: 'POST',
            body: JSON.stringify({ 
                codigo: codigoSesion, 
                datos: datosFinales,
                usuario_id: userInfo.id, 
                usuario_nombre: userInfo.nombre 
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error del servidor: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Error al finalizar la recepción');
        }

        // =============================================
        // 8. PROCESAR RESPUESTA EXITOSA
        // =============================================
        updateProgressBar(90);
        updateProgressMessage('¡Recepción finalizada con éxito!');
        
        const idOrden = data.id_orden;
        mostrarNotificacion(`✅ Recepción finalizada: ${data.codigo || 'OT-N/A'}`, 'success');
        
        // =============================================
        // 9. GENERAR REPORTE / PDF
        // =============================================
        if (idOrden) {
            updateProgressMessage('Generando reporte...');
            await mostrarReporteFinal(idOrden);
        } else {
            mostrarNotificacion('⚠️ Recepción guardada pero no se pudo generar el reporte', 'warning');
        }
        
        // =============================================
        // 10. LIMPIAR SESIÓN
        // =============================================
        updateProgressBar(100);
        updateProgressMessage('¡Completado!');
        
        limpiarSesionCompleta();
        
        setTimeout(() => {
            completeProgress(true);
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
            cargarRecepciones();
            cargarSesionesActivas();
        }, 500);
        
    } catch (error) {
        console.error('Error en finalizarSesionConReporte:', error);
        completeProgress(false);
        mostrarNotificacion(`❌ ${error.message || 'Error al finalizar la recepción'}`, 'error');
        
        if (error.message?.includes('Sesión expirada') || error.message?.includes('token')) {
            setTimeout(() => {
                localStorage.clear();
                window.location.href = `${window.API_BASE_URL}/`;
            }, 3000);
        }
    }
}

// =====================================================
// LIMPIAR SESIÓN COMPLETA
// =====================================================
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
    seccionesCompletadasLocal = { cliente: false, vehiculo: false, fotos: false, descripcion: false };
    localStorage.removeItem('sesion_actual');
    
    // 🔥 LIMPIAR VARIABLES DE EDICIÓN
    window.sesionCodigoOriginal = null;
    window.datosOriginalesRecepcion = null;
    window.fotosOriginalesRecepcion = null;
    window.audioOriginalRecepcion = null;
    
    // 🔥 LIMPIAR URL DE BLOB DE AUDIO
    if (window.audioBlobUrl) {
        try {
            URL.revokeObjectURL(window.audioBlobUrl);
        } catch (e) {}
        window.audioBlobUrl = null;
    }
    
    // 🔥 LIMPIAR CACHÉ DE IMÁGENES (opcional - si quieres liberar memoria)
    if (window.imageCache) {
        window.imageCache.clear();
    }
    
    if (sessionPanel) sessionPanel.style.display = 'none';
    if (colaboradoresPanel) colaboradoresPanel.style.display = 'none';
    if (recepcionForm) recepcionForm.style.display = 'none';
    if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
    
    // Limpiar todos los inputs del formulario
    document.querySelectorAll('#recepcionForm input, #recepcionForm textarea').forEach(input => {
        if (input.id !== 'clienteLatitud' && input.id !== 'clienteLongitud') {
            input.value = '';
        }
        // Limpiar cualquier estado de error
        input.classList.remove('error', 'success');
    });
    if (clienteLatitudInput) clienteLatitudInput.value = '';
    if (clienteLongitudInput) clienteLongitudInput.value = '';
    
    // Limpiar todas las fotos
    document.querySelectorAll('.photo-upload').forEach(upload => {
        upload.classList.remove('has-image', 'error');
        const preview = upload.querySelector('.upload-preview');
        if (preview) {
            preview.style.backgroundImage = '';
            preview.style.backgroundSize = '';
            preview.style.backgroundPosition = '';
            preview.innerHTML = '';
            preview.style.display = '';
        }
        const removeBtn = upload.querySelector('.remove-photo');
        if (removeBtn) removeBtn.style.display = 'none';
        upload.removeAttribute('data-drive-url');
        delete upload.dataset.driveUrl;
        if (upload.dataset.objectUrl) {
            try {
                URL.revokeObjectURL(upload.dataset.objectUrl);
            } catch (e) {}
            delete upload.dataset.objectUrl;
        }
        const campo = upload.dataset.campo;
        if (campo) actualizarProgresoFoto(campo, 0, 'pending');
        // Limpiar el input file
        const fileInput = upload.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = '';
    });
    
    // Limpiar audio
    if (audioPreview) {
        audioPreview.src = '';
        audioPreview.style.display = 'none';
        audioPreview.oncanplay = null;
        audioPreview.onerror = null;
    }
    if (audioStatus) {
        audioStatus.textContent = '';
        audioStatus.style.color = '';
    }
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    if (btnGrabarAudio) {
        btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        btnGrabarAudio.classList.remove('recording');
    }
    isRecording = false;
    if (mediaRecorder) {
        try {
            if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        } catch (e) {}
        mediaRecorder = null;
    }
    audioChunks = [];
    audioBlob = null;
    
    // Restaurar badges de secciones
    ['Cliente', 'Vehiculo', 'Fotos', 'Descripcion'].forEach(seccion => {
        const badge = document.getElementById(`status${seccion}`);
        if (badge) {
            badge.textContent = '○ Pendiente';
            badge.className = 'status-badge en-proceso';
        }
    });
    
    // Restaurar botón finalizar
    if (btnFinalizar) {
        btnFinalizar.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Recepción';
        btnFinalizar.disabled = true;
        btnFinalizar.onclick = finalizarSesionConReporte;
        btnFinalizar.style.background = '';
        btnFinalizar.style.backgroundColor = '';
    }
    
    // Eliminar banner de edición si existe
    const banner = document.getElementById('editBanner');
    if (banner) banner.remove();
    
    // Limpiar código activo
    if (codigoActivoSpan) {
        codigoActivoSpan.textContent = '';
        codigoActivoSpan.style.color = '';
    }
    
    // Limpiar cualquier modal abierto
    const modalesAbiertos = document.querySelectorAll('.modal.show, .modal-comunicados.active');
    modalesAbiertos.forEach(modal => {
        modal.classList.remove('show', 'active');
    });
    
    // Limpiar cualquier toast
    const toasts = document.querySelectorAll('.toast-notification');
    toasts.forEach(toast => toast.remove());
    
    // Limpiar cualquier overlay de progreso
    hideProgress();
    
    // Limpiar estados de edición
    modoEdicionRecepcion = false;
    recepcionEditandoId = null;
    
    console.log('🧹 Sesión limpiada completamente');
}

// =====================================================
// POLLING
// =====================================================
function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        if (codigoSesion && !colaActiva && !isProcessingQueue && 
            !camposEnEdicion.cliente && !camposEnEdicion.vehiculo && !camposEnEdicion.descripcion) {
            cargarDatosSesionLigero();
        }
    }, 3000);
}

function detenerPolling() { if (pollingInterval) clearInterval(pollingInterval); }

function iniciarKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(() => {
        if (codigoSesion) fetchWithToken(`${API_URL}/jefe-operativo/ping-sesion/${codigoSesion}`, { method: 'GET' }).catch(() => {});
    }, 60000);
}

function detenerKeepAlive() { if (keepAliveInterval) clearInterval(keepAliveInterval); }

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
            ['cliente', 'vehiculo', 'descripcion'].forEach(s => {
                if (seccionesCompletadasLocal[s] !== nuevasSecciones[s]) {
                    seccionesCompletadasLocal[s] = nuevasSecciones[s];
                    actualizarEstadoVisualSeccion(s, nuevasSecciones[s]);
                }
            });
            // Fotos: usar validación completa
            setTimeout(validarCompletadoFotos, 100);
        }
        actualizarBotonFinalizar();
        sesionActual = data.sesion;
    } catch (error) {} finally { actualizando = false; }
}

function iniciarPollingSesiones() {
    if (sesionesPolling) clearInterval(sesionesPolling);
    sesionesPolling = setInterval(cargarSesionesActivas, 5000);
}

async function cargarSesionesActivas() {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/sesiones-activas`, { method: 'GET' });
        const data = await response.json();
        if (data.sesiones) {
            const activas = data.sesiones.filter(s => s.estado === 'activa');
            renderSesionesActivas(activas);
            if (sesionesCount) sesionesCount.textContent = activas.length;
        }
    } catch (error) {
        if (sesionesList) sesionesList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar sesiones</p></div>';
    }
}

function renderSesionesActivas(sesiones) {
    if (!sesionesList) return;
    if (sesiones.length === 0) {
        sesionesList.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No hay sesiones activas</p><small>Crea una nueva sesión</small></div>`;
        return;
    }
    sesionesList.innerHTML = sesiones.map(s => {
        const count = s.colaboradores_nombres?.length || 1;
        const completa = count >= 2;
        const activa = codigoSesion === s.codigo;
        return `<div class="sesion-item ${activa ? 'active' : ''} ${completa ? 'full' : ''}">
            <div class="sesion-info">
                <span class="sesion-codigo">${escapeHtml(s.codigo)}</span>
                <div class="sesion-colaboradores"><i class="fas fa-users"></i><span>${count}/2</span></div>
                ${s.creador_nombre ? `<span style="font-size:0.6rem;color:var(--gris-texto);">Creada por: ${escapeHtml(s.creador_nombre)}</span>` : ''}
            </div>
            <div class="sesion-actions">
                ${!activa && !completa ? `<button class="btn-unirse-sesion" onclick="unirseSesionConCodigo('${s.codigo}')">Unirse</button>` : 
                activa ? '<span class="badge-active">Activa</span>' : '<span class="badge-full">Completa</span>'}
            </div>
        </div>`;
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

function mostrarModalCodigo(codigo) {
    const modal = document.getElementById('codigoModal');
    const span = document.getElementById('codigoSesionModal');
    if (span) span.textContent = codigo;
    if (modal) modal.classList.add('show');
    setTimeout(() => modal?.classList.remove('show'), 5000);
}

function mostrarConfirmacionCancelar() {
    if (confirm('¿Cancelar recepción? Se perderán todos los datos.\n\n⚠️ Esta acción:\n• Eliminará TODAS las fotos subidas\n• Eliminará la carpeta en Google Drive\n• No se podrá deshacer')) {
        if (codigoSesion) {
            mostrarNotificacion('⏳ Eliminando sesión y archivos...', 'info');
            fetchWithToken(`${API_URL}/jefe-operativo/cancelar-sesion`, {
                method: 'DELETE',
                body: JSON.stringify({ codigo: codigoSesion })
            }).then(response => response.json()).then(data => {
                if (data.success) mostrarNotificacion(data.carpeta_eliminada ? '✅ Sesión cancelada y carpeta eliminada' : '⚠️ Sesión cancelada, carpeta no eliminada', data.carpeta_eliminada ? 'success' : 'warning');
            }).catch(() => mostrarNotificacion('Error al cancelar sesión', 'error')).finally(() => {
                limpiarSesionCompleta();
                if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
                if (sesionesList) sesionesList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Actualizando...</p></div>';
                setTimeout(cargarSesionesActivas, 500);
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
// INICIALIZAR PANEL DE RECEPCIONES
// =====================================================

// =====================================================
// INICIALIZAR PANEL DE RECEPCIONES
// =====================================================

function initRecepcionesPanel() {
    cargarRecepciones();
    
    // 🔥 ACTUALIZAR LISTA (recarga completa)
    document.getElementById('btnRefreshRecepciones')?.addEventListener('click', () => {
        offsetActual = 0; 
        recepcionesActuales = []; 
        noHayMasRecepciones = false; 
        cargarRecepciones();
    });
    
    // 🔥 BÚSQUEDA - CON DEBOUNCE PARA EVITAR MUCHAS PETICIONES
    const searchInput = document.getElementById('searchRecepcion');
    if (searchInput) {
        let timeoutId = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                offsetActual = 0;
                recepcionesActuales = [];
                noHayMasRecepciones = false;
                cargarRecepciones();
            }, 300); // Espera 300ms después de dejar de escribir
        });
    }
    
    // 🔥 FILTRO POR ESTADO - Recarga al cambiar
    document.getElementById('estadoFiltro')?.addEventListener('change', () => {
        offsetActual = 0; 
        recepcionesActuales = []; 
        noHayMasRecepciones = false; 
        cargarRecepciones();
    });
    
    // 🔥 BOTÓN LIMPIAR FILTROS
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', () => {
        document.getElementById('searchRecepcion').value = '';
        document.getElementById('estadoFiltro').value = 'todos';
        offsetActual = 0;
        recepcionesActuales = [];
        noHayMasRecepciones = false;
        cargarRecepciones();
        mostrarNotificacion('🧹 Filtros limpiados', 'info');
    });
    
    // 🔥 PAGINACIÓN
    document.getElementById('btnPaginaAnterior')?.addEventListener('click', () => {
        if (offsetActual >= LIMITE_RECEPCIONES) { 
            offsetActual -= LIMITE_RECEPCIONES; 
            cargarRecepciones(); 
        }
    });
    
    document.getElementById('btnPaginaSiguiente')?.addEventListener('click', () => {
        if (!noHayMasRecepciones) { 
            offsetActual += LIMITE_RECEPCIONES; 
            cargarRecepciones(); 
        }
    });
}
// =====================================================
// CARGAR RECEPCIONES CON FILTROS
// =====================================================

async function cargarRecepciones(append = false) {
    if (cargandoMas) return;
    cargandoMas = true;
    
    const listDiv = document.getElementById('recepcionesList');
    if (listDiv && !append) listDiv.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando recepciones...</p></div>`;
    
    try {
        // 🔥 OBTENER FILTROS
        const searchTerm = document.getElementById('searchRecepcion')?.value?.trim() || '';
        const estadoFiltro = document.getElementById('estadoFiltro')?.value || 'todos';
        
        // 🔥 CONSTRUIR QUERY PARAMS
        let url = `${API_URL}/jefe-operativo/listar-recepciones?limit=${LIMITE_RECEPCIONES}&offset=${offsetActual}`;
        
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }
        if (estadoFiltro !== 'todos') {
            url += `&estado=${encodeURIComponent(estadoFiltro)}`;
        }
        
        const response = await fetchWithToken(url, { method: 'GET' });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data.success && data.recepciones) {
            if (data.paginacion) {
                totalRecepciones = data.paginacion.total || 0;
                noHayMasRecepciones = !data.paginacion.has_more;
                const paginaInfo = document.getElementById('paginaInfo');
                if (paginaInfo) {
                    const paginaActual = Math.floor(offsetActual / LIMITE_RECEPCIONES) + 1;
                    const totalPaginas = Math.ceil(totalRecepciones / LIMITE_RECEPCIONES);
                    paginaInfo.textContent = `Página ${paginaActual} de ${totalPaginas || 1}`;
                }
                document.getElementById('btnPaginaAnterior').disabled = offsetActual === 0;
                document.getElementById('btnPaginaSiguiente').disabled = noHayMasRecepciones;
            }
            
            recepcionesActuales = append ? [...recepcionesActuales, ...data.recepciones] : data.recepciones;
            
            // 🔥 ACTUALIZAR CONTADOR
            const countSpan = document.getElementById('recepcionesCount');
            if (countSpan) {
                if (searchTerm || estadoFiltro !== 'todos') {
                    const filtrosActivos = [];
                    if (searchTerm) filtrosActivos.push(`"${searchTerm}"`);
                    if (estadoFiltro !== 'todos') filtrosActivos.push(estadoFiltro);
                    countSpan.textContent = `${totalRecepciones} (filtrado: ${filtrosActivos.join(' + ')})`;
                } else {
                    countSpan.textContent = totalRecepciones;
                }
            }
            
            renderizarRecepciones();
        } else {
            if (!append) { 
                recepcionesActuales = []; 
                renderizarRecepciones();
            }
        }
    } catch (error) {
        console.error('Error cargando recepciones:', error);
        if (listDiv && !append) {
            listDiv.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar</p><small>${error.message}</small></div>`;
        }
    } finally { 
        cargandoMas = false; 
    }
}
// =====================================================
// RENDERIZAR RECEPCIONES (SEPARADO DEL FILTRADO)
// =====================================================

function renderizarRecepciones() {
    const listDiv = document.getElementById('recepcionesList');
    if (!listDiv) return;
    
    const recepciones = recepcionesActuales || [];
    
    // Mostrar mensaje si no hay resultados
    if (recepciones.length === 0) {
        const searchTerm = document.getElementById('searchRecepcion')?.value?.trim() || '';
        const estadoFiltro = document.getElementById('estadoFiltro')?.value || 'todos';
        
        let mensaje = 'No hay recepciones';
        if (searchTerm && estadoFiltro !== 'todos') {
            mensaje = `No hay recepciones que coincidan con "${searchTerm}" y estado "${estadoFiltro}"`;
        } else if (searchTerm) {
            mensaje = `No hay recepciones que coincidan con "${searchTerm}"`;
        } else if (estadoFiltro !== 'todos') {
            mensaje = `No hay recepciones con estado "${estadoFiltro}"`;
        }
        
        listDiv.innerHTML = `<div class="empty-state">
            <i class="fas fa-search"></i>
            <p>${mensaje}</p>
            <small>Intenta con otro término de búsqueda o cambia el filtro</small>
        </div>`;
        return;
    }
    
    // Mapeo de estados con colores
    const estadoConfig = {
        'EnRecepcion': { label: '📋 En Recepción', color: '#ffc107' },
        'EnDiagnostico': { label: '🔍 En Diagnóstico', color: '#17a2b8' },
        'DiagnosticoCompletado': { label: '✅ Diagnóstico Completado', color: '#28a745' },
        'DiagnosticoAprobado': { label: '👍 Diagnóstico Aprobado', color: '#28a745' },
        'DiagnosticoRechazado': { label: '👎 Diagnóstico Rechazado', color: '#dc3545' },
        'CotizacionEnviada': { label: '📨 Cotización Enviada', color: '#6f42c1' },
        'CotizacionAceptada': { label: '✅ Cotización Aceptada', color: '#28a745' },
        'CotizacionParcial': { label: '🟡 Cotización Parcial', color: '#ffc107' },
        'CotizacionRechazada': { label: '❌ Cotización Rechazada', color: '#dc3545' },
        'EnArmadoVehiculo': { label: '🔧 En Armado', color: '#fd7e14' },
        'VehiculoArmado': { label: '✅ Vehículo Armado', color: '#28a745' },
        'EnReparacion': { label: '🔧 En Reparación', color: '#fd7e14' },
        'EnPausa': { label: '⏸️ En Pausa', color: '#ffc107' },
        'ReparacionCompletada': { label: '✅ Reparación Completada', color: '#28a745' },
        'Finalizado': { label: '🏁 Finalizado', color: '#20c997' },
        'Entregado': { label: '🚗 Entregado', color: '#20c997' }
    };
    
    // Renderizar tarjetas
    listDiv.innerHTML = recepciones.map(rec => {
        const estado = rec.estado_global || 'EnRecepcion';
        const config = estadoConfig[estado] || { label: estado, color: '#8E8E93' };
        const fecha = rec.fecha_ingreso ? new Date(rec.fecha_ingreso).toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        }) : 'N/A';
        const vehiculo = `${rec.marca || ''} ${rec.modelo || ''}`.trim() || 'Vehículo sin especificar';
        
        return `<div class="recepcion-card" style="border-left: 4px solid ${config.color};">
            <div class="recepcion-header">
                <span class="recepcion-codigo">${escapeHtml(rec.codigo_unico || 'OT-N/A')}</span>
                <span class="recepcion-estado" style="background: ${config.color}20; color: ${config.color}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                    ${config.label}
                </span>
            </div>
            <div class="recepcion-body">
                <div class="recepcion-info-item">
                    <div class="icon-wrapper"><i class="fas fa-user"></i></div>
                    <div>
                        <span class="info-label">Cliente</span>
                        <span class="info-value">${escapeHtml(rec.cliente_nombre || 'N/A')}</span>
                    </div>
                </div>
                <div class="recepcion-info-item">
                    <div class="icon-wrapper"><i class="fas fa-car"></i></div>
                    <div>
                        <span class="info-label">Vehículo</span>
                        <span class="info-value">${escapeHtml(vehiculo)} <span class="placa-badge" style="background: #2C2C2E; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #8E8E93;">${escapeHtml(rec.placa || 'N/A')}</span></span>
                    </div>
                </div>
            </div>
            <div class="recepcion-footer">
                <span class="recepcion-fecha"><i class="far fa-calendar-alt"></i> ${fecha}</span>
                <div class="recepcion-actions">
                    <button class="btn-action btn-ver" onclick="verDetalleRecepcion(${rec.id})">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                    <button class="btn-action btn-editar" onclick="editarRecepcion(${rec.id})" ${estado !== 'EnRecepcion' ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn-action btn-eliminar" onclick="confirmarEliminarRecepcion(${rec.id})" ${estado !== 'EnRecepcion' ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                        <i class="fas fa-trash-alt"></i> Eliminar
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}
// =====================================================
// FUNCIONES DE MODAL
// =====================================================
window.cerrarModal = () => document.getElementById('codigoModal')?.classList.remove('show');
window.cerrarModalOrden = () => document.getElementById('codigoOrdenModal')?.classList.remove('show');
window.cerrarModalDetalle = () => document.getElementById('modalDetalleRecepcion')?.classList.remove('show');

// =====================================================
// VER DETALLE RECEPCIÓN
// =====================================================
async function verDetalleRecepcion(id) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.detalle) mostrarModalDetalle(data.detalle);
        else mostrarNotificacion('Error cargando detalle', 'error');
    } catch (error) {
        mostrarNotificacion('Error cargando detalle', 'error');
    }
}

// =====================================================
// MOSTRAR MODAL DETALLE (CON PRECARGA DE FOTOS OPTIMIZADA Y BOTÓN DE TRANSCRIPCIÓN)
// =====================================================
function mostrarModalDetalle(detalle) {
    const modal = document.getElementById('modalDetalleRecepcion');
    const body = document.getElementById('detalleRecepcionBody');
    if (!modal || !body) return;
    
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
    
    let fotosHtml = '';
    if (fotosCount === 0) {
        fotosHtml = `<div class="detalle-fotos-vacio"><i class="fas fa-camera"></i><p>No se registraron fotos</p></div>`;
    } else {
        const timestamp = Date.now();
        fotosHtml = `<div class="detalle-fotos-grid">${fotosExistentes.map((f, index) => {
            const url = fotos[f.campo];
            const imgId = `foto-${f.campo}-${timestamp}-${index}`;
            return `<div class="detalle-foto" onclick="verImagenAmpliadaPorId('${imgId}', '${f.label}')">
                <div id="${imgId}" class="detalle-foto-placeholder"><i class="fas fa-spinner fa-spin"></i><span>Cargando...</span></div>
                <div class="detalle-foto-label"><i class="${f.icono}"></i> ${f.label}</div>
            </div>`;
        }).join('')}</div>`;
    }
    
    // Audio
    const audioUrl = detalle.audio_url;
    const tieneAudio = audioUrl && audioUrl !== 'null' && audioUrl !== 'None' && audioUrl !== '' && audioUrl !== null && audioUrl !== 'undefined';
    let audioHtml = '';
    
    if (tieneAudio) {
        let fileId = null;
        const match1 = audioUrl.match(/[?&]id=([^&]+)/);
        if (match1) fileId = match1[1];
        else {
            const match2 = audioUrl.match(/\/file\/d\/([^\/]+)/);
            if (match2) fileId = match2[1];
            else {
                const match3 = audioUrl.match(/\/d\/([^\/]+)/);
                if (match3) fileId = match3[1];
            }
        }
        
        if (fileId) {
            const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
            
            audioHtml = `<div class="detalle-card" style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;">
                <div class="detalle-card-title" style="color:#fff;margin-bottom:12px;"><i class="fas fa-microphone" style="color:#C1121F;"></i> Audio de la Descripción</div>
                <div style="background:#0d0d0d;border-radius:10px;padding:16px;border:1px solid #2a2a2a;">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                        <div style="width:44px;height:44px;background:#C1121F;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-headphones" style="color:white;font-size:20px;"></i>
                        </div>
                        <div style="flex:1;"><div style="color:#fff;font-size:14px;font-weight:600;">Audio de la recepción</div><div style="color:#888;font-size:11px;">Grabado durante la recepción</div></div>
                        <div style="color:#10B981;font-size:12px;background:rgba(16,185,129,0.15);padding:4px 14px;border-radius:20px;"><i class="fas fa-check-circle"></i> Disponible</div>
                    </div>
                    <div style="background:#000;border-radius:8px;overflow:hidden;border:1px solid #2a2a2a;">
                        <iframe src="${embedUrl}" style="width:100%;height:100px;border:none;display:block;" allow="autoplay" allowfullscreen></iframe>
                    </div>
                    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;justify-content:center;">
                        <a href="${viewUrl}" target="_blank" style="background:#1a1a1a;color:#C1121F;padding:7px 18px;border-radius:6px;border:1px solid #333;text-decoration:none;font-size:12px;"><i class="fas fa-external-link-alt"></i> Abrir en Drive</a>
                        <a href="${downloadUrl}" download style="background:#C1121F;color:white;padding:7px 18px;border-radius:6px;border:none;text-decoration:none;font-size:12px;"><i class="fas fa-download"></i> Descargar</a>
                    </div>
                </div>
            </div>`;
        } else {
            audioHtml = `<div class="detalle-card"><div class="detalle-card-title"><i class="fas fa-microphone"></i> Audio</div><a href="${audioUrl}" target="_blank">Escuchar audio en Drive</a></div>`;
        }
    } else {
        audioHtml = `<div class="detalle-sin-audio"><i class="fas fa-microphone-slash"></i> No hay audio disponible</div>`;
    }
    
    // =============================================
    // 🔥 DESCRIPCIÓN CON BOTÓN DE TRANSCRIPCIÓN
    // =============================================
    
    // Verificar si hay audio para mostrar el botón
    const tieneAudioParaTranscribir = detalle.audio_url && 
                                      detalle.audio_url !== 'null' && 
                                      detalle.audio_url !== 'None' && 
                                      detalle.audio_url !== '' && 
                                      detalle.audio_url !== null && 
                                      detalle.audio_url !== 'undefined';
    
    // Texto de la transcripción (si existe)
    const transcripcionActual = detalle.transcripcion_problema || 'No se registró descripción';
    
    const descripcionHtml = `
        <div class="detalle-card">
            <div class="detalle-card-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span><i class="fas fa-align-left"></i> Descripción del Problema</span>
                ${tieneAudioParaTranscribir ? `
                <button class="btn-transcribir" onclick="transcribirAudioManual(${detalle.id})" 
                        style="background:#C1121F;color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:6px;transition:all 0.3s;">
                    <i class="fas fa-microphone"></i> 🎙️ Transcribir Audio
                </button>
                ` : `
                <span style="color:#8E8E93;font-size:11px;"><i class="fas fa-microphone-slash"></i> Sin audio para transcribir</span>
                `}
            </div>
            <div class="detalle-descripcion-texto">
                <textarea id="transcripcionManual" style="width:100%;min-height:80px;background:#1A1A1C;color:#fff;border:1px solid #2C2C2E;border-radius:8px;padding:12px;font-size:13px;resize:vertical;font-family:inherit;line-height:1.6;">
                    ${escapeHtml(transcripcionActual)}
                </textarea>
            </div>
        </div>
    `;
    
    // =============================================
    // CONSTRUIR HTML COMPLETO
    // =============================================
    
    const html = `<div class="detalle-tabs">
        <button class="detalle-tab active" data-tab="info"><i class="fas fa-info-circle"></i> Información</button>
        <button class="detalle-tab" data-tab="fotos"><i class="fas fa-images"></i> Fotos <span class="tab-badge">${fotosCount}/7</span></button>
        <button class="detalle-tab" data-tab="descripcion"><i class="fas fa-align-left"></i> Descripción</button>
    </div>
    <div class="detalle-panes">
        <div class="detalle-pane active" id="pane-info">
            <div class="detalle-card"><div class="detalle-card-title"><i class="fas fa-info-circle"></i> Información General</div>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Código</span><span class="detalle-value codigo">${escapeHtml(detalle.codigo_unico || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Fecha</span><span class="detalle-value">${detalle.fecha_ingreso ? new Date(detalle.fecha_ingreso).toLocaleString('es-ES') : 'N/A'}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Estado</span><span class="detalle-value estado-badge ${detalle.estado_global || 'EnRecepcion'}">${detalle.estado_global || 'En Recepción'}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Jefe Operativo</span><span class="detalle-value">${escapeHtml(detalle.jefe_operativo?.nombre || 'No asignado')}</span></div>
                    ${detalle.jefe_operativo_2?.nombre ? `<div class="detalle-item full-width"><span class="detalle-label">Jefe Operativo 2</span><span class="detalle-value">${escapeHtml(detalle.jefe_operativo_2.nombre)}</span></div>` : ''}
                </div>
            </div>
            <div class="detalle-card"><div class="detalle-card-title"><i class="fas fa-user"></i> Datos del Cliente</div>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Nombre</span><span class="detalle-value">${escapeHtml(detalle.cliente_nombre || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Teléfono</span><span class="detalle-value">${escapeHtml(detalle.cliente_telefono || 'N/A')}</span></div>
                    <div class="detalle-item full-width"><span class="detalle-label">Ubicación</span><span class="detalle-value">${escapeHtml(detalle.cliente_ubicacion || 'No especificada')}</span></div>
                    ${detalle.latitud && detalle.longitud ? `<div class="detalle-item full-width"><span class="detalle-label">Coordenadas</span><span class="detalle-value">${detalle.latitud}, ${detalle.longitud}</span></div>` : ''}
                </div>
            </div>
            <div class="detalle-card"><div class="detalle-card-title"><i class="fas fa-car"></i> Datos del Vehículo</div>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Placa</span><span class="detalle-value placa">${escapeHtml(detalle.placa || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Marca</span><span class="detalle-value">${escapeHtml(detalle.marca || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Modelo</span><span class="detalle-value">${escapeHtml(detalle.modelo || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Año</span><span class="detalle-value">${detalle.anio || 'N/A'}</span></div>
                    <div class="detalle-item full-width"><span class="detalle-label">Kilometraje</span><span class="detalle-value">${detalle.kilometraje?.toLocaleString() || '0'} km</span></div>
                </div>
            </div>
        </div>
        <div class="detalle-pane" id="pane-fotos">${fotosHtml}</div>
        <div class="detalle-pane" id="pane-descripcion">
            ${descripcionHtml}
            ${audioHtml}
        </div>
    </div>`;
    
    body.innerHTML = html;
    modal.classList.add('show');
    
    // 🔥 CONFIGURAR TABS - OPTIMIZADO
    document.querySelectorAll('.detalle-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            document.querySelectorAll('.detalle-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.detalle-pane').forEach(p => p.classList.remove('active'));
            const activePane = document.getElementById(`pane-${tabId}`);
            if (activePane) activePane.classList.add('active');
            
            if (tabId === 'fotos') {
                // 🔥 VERIFICAR SI YA ESTÁN CARGADAS
                const panelFotos = document.getElementById('pane-fotos');
                const imagenesCargadas = panelFotos?.querySelectorAll('.detalle-foto.loaded').length || 0;
                const totalFotos = Object.values(detalle.fotos || {}).filter(v => v && v !== 'null' && v !== 'None' && v !== '' && v !== 'undefined').length;
                
                if (imagenesCargadas < totalFotos) {
                    // Solo cargar si no todas están cargadas
                    setTimeout(() => cargarImagenesFotos(detalle.fotos), 200);
                } else {
                    console.log('📸 Fotos ya cargadas, no es necesario recargar');
                }
            }
        });
    });
    
    // 🔥 PRECARGAR FOTOS EN PARALELO (incluso si no están visibles)
    setTimeout(() => {
        // Verificar si el tab de fotos está activo
        const fotosTab = document.querySelector('.detalle-tab[data-tab="fotos"]');
        const isFotosTabActive = fotosTab?.classList.contains('active') || false;
        
        if (isFotosTabActive) {
            // Si el tab está activo, cargar inmediatamente
            cargarImagenesFotos(detalle.fotos);
        } else {
            // Si no está activo, precargar en segundo plano
            console.log('📸 Precargando fotos en segundo plano...');
            // Esperar un poco antes de precargar para no bloquear la UI
            setTimeout(() => {
                cargarImagenesFotos(detalle.fotos);
            }, 500);
        }
    }, 300);
    
    // 🔥 BOTÓN PDF
    document.getElementById('btnExportarPDFDetalle').onclick = () => { datosReporteFinal = detalle; descargarPDFFinal(); };
}
// =====================================================
// CARGAR IMÁGENES DE FOTOS EN EL DETALLE (OPTIMIZADO - EN PARALELO)
// =====================================================
async function cargarImagenesFotos(fotos) {
    if (!fotos) return;
    
    const panelFotos = document.getElementById('pane-fotos');
    if (!panelFotos) return;
    
    const camposFotos = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'];
    const labels = ['Lateral Izquierdo', 'Lateral Derecho', 'Frontal', 'Trasera', 'Superior', 'Inferior', 'Tablero'];
    
    // 🔥 IDENTIFICAR QUÉ FOTOS TIENEN URL VÁLIDA
    const fotosAProcesar = [];
    
    for (let i = 0; i < camposFotos.length; i++) {
        const campo = camposFotos[i];
        const url = fotos[campo];
        
        // 🔥 VERIFICAR QUE LA URL SEA VÁLIDA
        if (url && url !== 'null' && url !== 'None' && url !== '' && url !== 'undefined') {
            fotosAProcesar.push({
                index: i,
                campo: campo,
                label: labels[i],
                url: url,
                contenedorId: null // Se asignará después
            });
        }
    }
    
    // Si no hay fotos, salir
    if (fotosAProcesar.length === 0) {
        console.log('📸 No hay fotos para cargar en el detalle');
        return;
    }
    
    console.log(`📸 Cargando ${fotosAProcesar.length} fotos en paralelo para el detalle...`);
    
    // 🔥 ASIGNAR CADA FOTO A SU CONTENEDOR
    for (const foto of fotosAProcesar) {
        // Buscar el contenedor de la foto usando el campo
        const contenedores = panelFotos.querySelectorAll(`.detalle-foto-placeholder[id^="foto-${foto.campo}-"]`);
        if (contenedores.length > 0) {
            foto.contenedorId = contenedores[0].id;
            const contenedor = contenedores[0];
            const fotoDiv = contenedor.closest('.detalle-foto');
            
            // 🔥 MOSTRAR INDICADOR DE CARGA
            contenedor.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:8px;height:100%;">
                <i class="fas fa-spinner fa-spin" style="font-size:24px;color:#C1121F;"></i>
                <span style="font-size:10px;text-align:center;">Cargando...</span>
            </div>`;
            
            if (fotoDiv) fotoDiv.classList.remove('loaded');
        }
    }
    
    // 🔥 CARGAR TODAS LAS FOTOS EN PARALELO
    const startTime = Date.now();
    
    const promesas = fotosAProcesar.map(async (foto) => {
        try {
            // 🔥 USAR thumbnail para mejor rendimiento
            const response = await fetchWithToken(`${API_URL}/jefe-operativo/imagen-base64`, {
                method: 'POST',
                body: JSON.stringify({ 
                    url: foto.url, 
                    thumbnail: true, 
                    size: 'w400' 
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.base64) {
                return { ...foto, base64: data.base64, success: true };
            } else {
                throw new Error(data.error || 'Error convirtiendo imagen');
            }
        } catch (error) {
            console.warn(`⚠️ Error cargando ${foto.campo}:`, error.message);
            return { ...foto, success: false, error: error.message };
        }
    });
    
    // Esperar a que todas terminen
    const resultados = await Promise.all(promesas);
    
    const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Todas las fotos del detalle cargadas en ${tiempoTotal} segundos`);
    
    // 🔥 PROCESAR RESULTADOS
    let fotosCargadas = 0;
    
    for (const resultado of resultados) {
        const contenedor = document.getElementById(resultado.contenedorId);
        if (!contenedor) continue;
        
        const fotoDiv = contenedor.closest('.detalle-foto');
        
        if (resultado.success && resultado.base64) {
            // 🔥 MOSTRAR LA IMAGEN
            contenedor.innerHTML = `<img src="${resultado.base64}" alt="${resultado.label}" 
                style="width:100%;height:100%;object-fit:cover;display:block;" 
                onerror="this.parentElement.innerHTML='<div style=\\'display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:4px;height:100%;\\'><i class=\\'fas fa-exclamation-triangle\\' style=\\'font-size:20px;\\'></i><span style=\\'font-size:10px;text-align:center;\\'>Error</span></div>'">`;
            
            if (fotoDiv) fotoDiv.classList.add('loaded');
            fotosCargadas++;
        } else {
            // 🔥 MOSTRAR ERROR
            contenedor.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:4px;height:100%;">
                <i class="fas fa-exclamation-triangle" style="font-size:20px;color:#ef4444;"></i>
                <span style="font-size:9px;text-align:center;">Error</span>
            </div>`;
        }
    }
    
    console.log(`📸 ${fotosCargadas}/${resultados.length} fotos cargadas en el detalle en ${tiempoTotal}s`);
    return fotosCargadas;
}
// =====================================================
// GENERAR HTML PARA EL REPORTE (CON IMÁGENES CONVERTIDAS)
// =====================================================
async function generarHTMLReporteConImagenes(detalle) {
    if (!detalle) return '<div class="loading-preview"><i class="fas fa-exclamation-triangle"></i><p>No hay datos</p></div>';
    
    const fotos = detalle.fotos || {};
    const camposFotos = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'];
    const labels = ['Lateral Izquierdo', 'Lateral Derecho', 'Frontal', 'Trasera', 'Superior', 'Inferior', 'Tablero'];
    
    // 🔥 CONVERTIR CADA FOTO A BASE64 PARA EL PDF
    const fotosBase64 = {};
    for (let i = 0; i < camposFotos.length; i++) {
        const campo = camposFotos[i];
        const url = fotos[campo];
        if (url && url !== 'null' && url !== 'None' && url !== '' && url !== 'undefined') {
            try {
                // Intentar convertir a base64
                const response = await fetchWithToken(`${API_URL}/jefe-operativo/imagen-base64`, {
                    method: 'POST',
                    body: JSON.stringify({ url })
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.base64) {
                        fotosBase64[campo] = data.base64;
                    }
                }
            } catch (error) {
                console.warn(`Error convirtiendo ${campo}:`, error);
            }
        }
    }
    
    const fechaActual = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fechaIngreso = detalle.fecha_ingreso ? new Date(detalle.fecha_ingreso).toLocaleString('es-ES') : 'No registrada';
    
    // 🔥 USAR LAS IMÁGENES EN BASE64 PARA EL PDF
    const fotosArray = Object.entries(fotosBase64)
        .filter(([key, url]) => url && url.startsWith('data:image'))
        .map(([key, url]) => {
            const index = camposFotos.indexOf(key);
            return { campo: key, label: labels[index] || key, url };
        });
    
    return `<div class="reporte-container" style="max-width:100%;width:100%;margin:0 auto;padding:10mm 12mm 8mm 12mm;font-family:'Segoe UI',Arial,sans-serif;background:white;color:#222;font-size:10.5px;line-height:1.5;box-sizing:border-box;">
        <!-- Encabezado -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #C1121F;padding-bottom:10px;margin-bottom:12px;">
            <div><h1 style="font-size:22px;color:#C1121F;margin:0;">FURIA <span style="color:#222;">MOTOR</span></h1>
            <div style="font-size:8px;color:#888;margin-top:2px;">TALLER AUTOMOTRIZ ESPECIALIZADO</div></div>
            <div style="text-align:right;font-size:8px;line-height:1.4;">
                <strong style="font-size:9px;color:#C1121F;">FURIA MOTOR COMPANY</strong><br>Cochabamba, Bolivia<br>
                <span style="font-size:7px;color:#999;">Tel: +591 4 1234567</span>
            </div>
        </div>
        
        <!-- Título -->
        <div style="text-align:center;margin-bottom:12px;">
            <h2 style="font-size:14px;color:#C1121F;margin:0;letter-spacing:3px;text-transform:uppercase;">Orden de Trabajo - Recepción</h2>
            <div style="font-size:13px;font-weight:bold;background:#f0f0f0;display:inline-block;padding:4px 20px;border-radius:4px;margin-top:4px;color:#C1121F;border:1px solid #ddd;"># ${detalle.codigo_unico || 'OT-N/A'}</div>
        </div>
        
        <!-- Información General -->
        <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;margin-bottom:10px;border:1px solid #eee;">
            <div style="display:flex;flex-wrap:wrap;gap:6px 20px;font-size:9.5px;">
                <span><strong>📅 Fecha:</strong> ${fechaIngreso}</span>
                <span><strong>📊 Estado:</strong> <span style="background:#ffc107;color:white;padding:1px 10px;border-radius:12px;font-size:8px;font-weight:600;">${detalle.estado_global || 'En Recepción'}</span></span>
                <span><strong>🆔 ID Orden:</strong> #${detalle.id || 'N/A'}</span>
            </div>
        </div>
        
        <!-- Cliente y Vehículo -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;border:1px solid #eee;">
                <div style="font-weight:700;font-size:10px;color:#C1121F;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">👤 Datos del Cliente</div>
                <div style="font-size:9.5px;line-height:1.7;">
                    <div><strong>Nombre:</strong> ${detalle.cliente_nombre || 'No registrado'}</div>
                    <div><strong>Teléfono:</strong> ${detalle.cliente_telefono || 'No registrado'}</div>
                    <div><strong>Ubicación:</strong> ${detalle.cliente_ubicacion || 'No especificada'}</div>
                </div>
            </div>
            <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;border:1px solid #eee;">
                <div style="font-weight:700;font-size:10px;color:#C1121F;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">🚗 Datos del Vehículo</div>
                <div style="font-size:9.5px;line-height:1.7;">
                    <div><strong style="color:#C1121F;font-size:11px;">Placa:</strong> <strong style="color:#C1121F;font-size:11px;">${detalle.placa || 'No registrada'}</strong></div>
                    <div><strong>Marca:</strong> ${detalle.marca || 'No registrada'}</div>
                    <div><strong>Modelo:</strong> ${detalle.modelo || 'No registrado'}</div>
                    <div><strong>Año:</strong> ${detalle.anio || 'No especificado'}</div>
                    <div><strong>Kilometraje:</strong> ${detalle.kilometraje ? Number(detalle.kilometraje).toLocaleString() : '0'} km</div>
                </div>
            </div>
        </div>
        
        <!-- Fotos -->
        <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;margin-bottom:10px;border:1px solid #eee;">
            <div style="font-weight:700;font-size:10px;color:#C1121F;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">📸 Fotos (${fotosArray.length}/7)</div>
            ${fotosArray.length > 0 ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin:4px 0;">${fotosArray.map(f => `<div style="border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#f5f5f5;text-align:center;"><img src="${f.url}" alt="${f.label}" style="width:100%;height:100px;object-fit:cover;display:block;background:#eee;"><div style="padding:2px;font-size:7px;font-weight:bold;color:#555;background:#f9f9f9;">${f.label}</div></div>`).join('')}</div>` : '<p style="color:#999;font-style:italic;font-size:11px;text-align:center;padding:10px;">No se registraron fotos</p>'}
        </div>
        
        <!-- Descripción -->
        <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;margin-bottom:10px;border:1px solid #eee;">
            <div style="font-weight:700;font-size:10px;color:#C1121F;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">📝 Descripción del Problema</div>
            <div style="background:white;padding:8px 10px;border-radius:4px;font-size:9.5px;min-height:30px;border:1px solid #e8e8e8;white-space:pre-wrap;line-height:1.6;">${detalle.transcripcion_problema || 'No se registró descripción'}</div>
        </div>
        
        <!-- Firmas -->
        <div style="margin-top:15px;padding-top:12px;border-top:2px solid #ddd;">
            <div style="font-weight:700;font-size:11px;color:#C1121F;text-align:center;margin-bottom:12px;letter-spacing:3px;text-transform:uppercase;">✍️ Firmas de Conformidad</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
                <div style="text-align:center;padding:0 5px;">
                    <div style="font-weight:600;color:#333;margin-bottom:8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Firma del Cliente</div>
                    <div style="border-bottom:2px solid #333;height:45px;margin-bottom:5px;"></div>
                    <div style="font-size:10px;color:#555;font-weight:600;">${detalle.cliente_nombre || '____________________'}</div>
                    <div style="font-size:8px;color:#999;margin-top:3px;">${fechaActual}</div>
                </div>
                <div style="text-align:center;padding:0 5px;">
                    <div style="font-weight:600;color:#333;margin-bottom:8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Firma del Jefe Operativo</div>
                    <div style="border-bottom:2px solid #333;height:45px;margin-bottom:5px;"></div>
                    <div style="font-size:10px;color:#555;font-weight:600;">${detalle.jefe_operativo?.nombre || '____________________'}</div>
                    <div style="font-size:8px;color:#999;margin-top:3px;">${fechaActual}</div>
                </div>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="text-align:center;margin-top:18px;padding-top:8px;border-top:1px solid #eee;font-size:7px;color:#bbb;line-height:1.4;">
            <span>Documento generado automáticamente por <strong style="color:#C1121F;">FURIA MOTOR</strong></span> | 
            <span>Código: <strong>${detalle.codigo_unico || 'N/A'}</strong></span> | 
            <span>${new Date().toLocaleString('es-ES')}</span>
        </div>
    </div>`;
}

function verImagenAmpliadaPorId(imgId, label) {
    const contenedor = document.getElementById(imgId);
    if (!contenedor) return;
    const img = contenedor.querySelector('img');
    if (!img) { mostrarNotificacion('La imagen aún no se ha cargado', 'warning'); return; }
    verImagenAmpliada(img.src, label);
}

function verImagenAmpliada(url, label) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:20px;`;
    modal.innerHTML = `<div style="position:relative;max-width:90%;max-height:90%;">
        <button style="position:absolute;top:-40px;right:0;background:none;border:none;color:white;font-size:32px;cursor:pointer;padding:8px 12px;" onclick="this.closest('.modal-imagen').remove()">&times;</button>
        <img src="${url}" alt="${label}" style="max-width:100%;max-height:80vh;border-radius:8px;object-fit:contain;display:block;">
        <p style="color:white;text-align:center;margin-top:12px;font-size:14px;opacity:0.8;">${label}</p>
    </div>`;
    modal.addEventListener('click', function(e) { if (e.target === this) this.remove(); });
    document.body.appendChild(modal);
}
// =====================================================
// TRANSCRIBIR AUDIO DESDE EL FORMULARIO
// =====================================================

async function transcribirAudioFormulario() {
    if (!codigoSesion) {
        mostrarNotificacion('⚠️ No hay sesión activa', 'warning');
        return;
    }

    if (!audioDriveUrl || audioDriveUrl === 'null' || audioDriveUrl === '' || audioDriveUrl === 'undefined') {
        mostrarNotificacion('⚠️ Graba un audio primero', 'warning');
        return;
    }

    const textoActual = descripcionProblema?.value?.trim() || '';
    if (textoActual.length > 10) {
        if (!confirm('⚠️ Ya hay texto en la descripción. ¿Deseas sobrescribirlo con la transcripción automática?')) {
            return;
        }
    }

    if (btnTranscribirForm) {
        btnTranscribirForm.disabled = true;
        btnTranscribirForm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transcribiendo...';
    }

    if (transcripcionStatusForm) {
        transcripcionStatusForm.style.display = 'flex';
        transcripcionStatusForm.className = 'loading';
        transcripcionTextoStatus.textContent = '⏳ Transcribiendo audio... puede tomar varios segundos';
    }

    mostrarNotificacion('🎙️ Transcribiendo audio...', 'info');

    try {
        let audioUrl = audioDriveUrl;
        if (!audioUrl && sesionActual?.datos?.descripcion?.audio_url) {
            audioUrl = sesionActual.datos.descripcion.audio_url;
        }

        if (!audioUrl || audioUrl === 'null' || audioUrl === '' || audioUrl === 'undefined') {
            throw new Error('No se encontró audio para transcribir');
        }

        const response = await fetchWithToken(`${API_URL}/jefe-operativo/transcribir-audio`, {
            method: 'POST',
            body: JSON.stringify({ audio_url: audioUrl })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error en la transcripción');
        }

        const data = await response.json();

        if (data.success && data.transcripcion) {
            if (descripcionProblema) {
                descripcionProblema.value = data.transcripcion;
                descripcionProblema.style.border = '2px solid #10B981';
                setTimeout(() => descripcionProblema.style.border = '', 3000);
            }

            if (transcripcionStatusForm) {
                transcripcionStatusForm.className = 'success';
                transcripcionTextoStatus.textContent = `✅ Transcripción completada (${data.modelo_usado || 'Whisper'})`;
            }

            if (codigoSesion) {
                await guardarSeccion('descripcion');
                mostrarNotificacion('✅ Transcripción guardada', 'success');
            }

            validarCompletadoDescripcion();

        } else {
            throw new Error(data.error || 'No se pudo transcribir');
        }

    } catch (error) {
        console.error('Error transcribiendo audio:', error);
        if (transcripcionStatusForm) {
            transcripcionStatusForm.className = 'error';
            transcripcionTextoStatus.textContent = `❌ Error: ${error.message}`;
        }
        mostrarNotificacion('❌ Error al transcribir: ' + error.message, 'error');
    } finally {
        if (btnTranscribirForm) {
            btnTranscribirForm.disabled = false;
            btnTranscribirForm.innerHTML = '<i class="fas fa-microphone-alt"></i> 🎙️ Transcribir Audio';
        }
    }
}
// =====================================================
// CONFIGURAR BOTÓN DE TRANSCRIPCIÓN EN EL FORMULARIO
// =====================================================

function setupTranscripcionFormulario() {
    if (btnTranscribirForm) {
        btnTranscribirForm.addEventListener('click', transcribirAudioFormulario);
    }
}
// =====================================================
// GENERAR PDF - DESCARGA Y SUBE A GOOGLE DRIVE
// =====================================================
async function descargarPDFFinal() {
    if (descargandoPDF) {
        mostrarNotificacion('⏳ Ya se está generando el PDF...', 'warning');
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
    
    showProgress('Generando PDF', 'Preparando el documento...');
    updateProgressBar(10);
    
    try {
        const detalleParaPDF = JSON.parse(JSON.stringify(datosReporteFinal));
        const fotos = datosReporteFinal.fotos || {};
        const camposFotos = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'];
        
        // 🔥 CONVERTIR FOTOS A BASE64 PARA EL PDF
        updateProgressMessage('Convirtiendo fotos...');
        const fotosNecesitanConversion = camposFotos.filter(c => {
            const url = fotos[c];
            return url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined' && !url.startsWith('data:image');
        });
        
        for (const campo of fotosNecesitanConversion) {
            const url = fotos[campo];
            try {
                const base64 = await convertirImagenABase64(url);
                if (base64 && base64.startsWith('data:image')) {
                    detalleParaPDF.fotos[campo] = base64;
                }
            } catch (error) {
                console.warn(`Error convirtiendo ${campo}:`, error);
            }
        }
        
        detalleParaPDF.fotos_base64 = detalleParaPDF.fotos;
        updateProgressBar(40);
        
        // 🔥 GENERAR HTML DEL REPORTE
        updateProgressMessage('Generando contenido del reporte...');
        const reporteHTML = generarHTMLReporte(detalleParaPDF);
        
        // Crear contenedor temporal
        const container = document.createElement('div');
        container.id = 'pdfContainer';
        container.style.cssText = `position:fixed;left:0;top:0;width:100%;max-width:800px;margin:0 auto;padding:30px;background:white;font-family:Arial,sans-serif;z-index:-1;opacity:0;pointer-events:none;overflow:visible;`;
        container.innerHTML = reporteHTML;
        document.body.appendChild(container);
        
        updateProgressBar(50);
        updateProgressMessage('Renderizando PDF...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 🔥 CARGAR html2pdf.js SI ES NECESARIO
        if (typeof html2pdf === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        
        updateProgressBar(60);
        updateProgressMessage('Generando archivo PDF...');
        
        const elemento = container.querySelector('.reporte-container');
        if (!elemento) throw new Error('No se encontró el contenido del reporte');
        
        // 🔥 GENERAR PDF COMO BLOB
        const pdfBlob = await html2pdf()
            .set({
                margin: [9, 9, 9, 9],
                filename: `Reporte_${detalleParaPDF.codigo_unico || 'orden'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { 
                    scale: 2, 
                    useCORS: true, 
                    allowTaint: true, 
                    backgroundColor: '#ffffff', 
                    logging: false 
                },
                jsPDF: { 
                    unit: 'mm', 
                    format: 'letter', 
                    orientation: 'portrait' 
                }
            })
            .from(elemento)
            .outputPdf('blob');
        
        updateProgressBar(75);
        updateProgressMessage('Preparando para descargar...');
        
        // 🔥 1. DESCARGAR EL PDF LOCALMENTE
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = `Recepcion_${detalleParaPDF.codigo_unico || 'orden'}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        mostrarNotificacion('📥 PDF descargado localmente', 'success');
        
        updateProgressBar(85);
        updateProgressMessage('Subiendo PDF a Google Drive...');
        
        // 🔥 2. CONVERTIR BLOB A BASE64 PARA SUBIR A DRIVE
        const reader = new FileReader();
        const pdfBase64 = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(pdfBlob);
        });
        
        // 🔥 3. ENVIAR AL BACKEND PARA SUBIR A GOOGLE DRIVE
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/subir-pdf-recepcion`, {
            method: 'POST',
            body: JSON.stringify({
                pdf_base64: pdfBase64,
                id_orden: detalleParaPDF.id || detalleParaPDF.id_orden,
                codigo_unico: detalleParaPDF.codigo_unico || 'orden'
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al subir PDF a Drive');
        }
        
        const data = await response.json();
        
        updateProgressBar(100);
        updateProgressMessage('¡PDF guardado en Google Drive!');
        
        // 🔥 LIMPIAR CONTENEDOR
        setTimeout(() => {
            if (container && document.body.contains(container)) {
                document.body.removeChild(container);
            }
        }, 1000);
        
        mostrarNotificacion('✅ PDF guardado en Google Drive', 'success');
        setTimeout(() => completeProgress(true), 500);
        
    } catch (error) {
        console.error('Error generando PDF:', error);
        completeProgress(false);
        mostrarNotificacion('❌ Error al generar PDF: ' + error.message, 'error');
    }
    
    if (btnDescargar) {
        btnDescargar.disabled = false;
        btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF';
    }
    descargandoPDF = false;
}

function generarHTMLReporte(detalle) {
    if (!detalle) return '<div class="loading-preview"><i class="fas fa-exclamation-triangle"></i><p>No hay datos</p></div>';
    
    const fotos = detalle.fotos_base64 || detalle.fotos || {};
    const fotosArray = Object.entries(fotos).filter(([key, url]) => url && url !== 'null' && url !== 'None' && url !== '')
        .map(([key, url]) => ({ campo: key, label: key.replace(/url_/g, '').replace(/_/g, ' ').toUpperCase(), url }));
    
    const fechaActual = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fechaIngreso = detalle.fecha_ingreso ? new Date(detalle.fecha_ingreso).toLocaleString('es-ES') : 'No registrada';
    
    return `<div class="reporte-container" style="max-width:100%;width:100%;margin:0 auto;padding:10mm 12mm 8mm 12mm;font-family:'Segoe UI',Arial,sans-serif;background:white;color:#222;font-size:10.5px;line-height:1.5;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #C1121F;padding-bottom:10px;margin-bottom:12px;">
            <div><h1 style="font-size:22px;color:#C1121F;margin:0;">FURIA <span style="color:#222;">MOTOR</span></h1>
            <div style="font-size:8px;color:#888;margin-top:2px;">TALLER AUTOMOTRIZ ESPECIALIZADO</div></div>
            <div style="text-align:right;font-size:8px;line-height:1.4;">
                <strong style="font-size:9px;color:#C1121F;">FURIA MOTOR COMPANY</strong><br>Cochabamba, Bolivia<br>
                <span style="font-size:7px;color:#999;">Tel: +591 4 1234567</span>
            </div>
        </div>
        <div style="text-align:center;margin-bottom:12px;">
            <h2 style="font-size:14px;color:#C1121F;margin:0;letter-spacing:3px;text-transform:uppercase;">Orden de Trabajo - Recepción</h2>
            <div style="font-size:13px;font-weight:bold;background:#f0f0f0;display:inline-block;padding:4px 20px;border-radius:4px;margin-top:4px;color:#C1121F;border:1px solid #ddd;"># ${detalle.codigo_unico || 'OT-N/A'}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;margin-bottom:10px;border:1px solid #eee;">
            <div style="display:flex;flex-wrap:wrap;gap:6px 20px;font-size:9.5px;">
                <span><strong>📅 Fecha:</strong> ${fechaIngreso}</span>
                <span><strong>📊 Estado:</strong> <span style="background:${detalle.estado_global === 'EnRecepcion' ? '#ffc107' : detalle.estado_global === 'EnTaller' ? '#17a2b8' : '#28a745'};color:white;padding:1px 10px;border-radius:12px;font-size:8px;font-weight:600;">${detalle.estado_global || 'En Recepción'}</span></span>
                <span><strong>🆔 ID Orden:</strong> #${detalle.id || 'N/A'}</span>
                <span><strong>👨‍💼 Jefe Operativo:</strong> ${detalle.jefe_operativo?.nombre || 'No asignado'}</span>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;border:1px solid #eee;">
                <div style="font-weight:700;font-size:10px;color:#C1121F;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">👤 Datos del Cliente</div>
                <div style="font-size:9.5px;line-height:1.7;">
                    <div><strong>Nombre:</strong> ${detalle.cliente_nombre || 'No registrado'}</div>
                    <div><strong>Teléfono:</strong> ${detalle.cliente_telefono || 'No registrado'}</div>
                    <div><strong>Ubicación:</strong> ${detalle.cliente_ubicacion || 'No especificada'}</div>
                </div>
            </div>
            <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;border:1px solid #eee;">
                <div style="font-weight:700;font-size:10px;color:#C1121F;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">🚗 Datos del Vehículo</div>
                <div style="font-size:9.5px;line-height:1.7;">
                    <div><strong style="color:#C1121F;font-size:11px;">Placa:</strong> <strong style="color:#C1121F;font-size:11px;">${detalle.placa || 'No registrada'}</strong></div>
                    <div><strong>Marca:</strong> ${detalle.marca || 'No registrada'}</div>
                    <div><strong>Modelo:</strong> ${detalle.modelo || 'No registrado'}</div>
                    <div><strong>Año:</strong> ${detalle.anio || 'No especificado'}</div>
                    <div><strong>Kilometraje:</strong> ${detalle.kilometraje ? Number(detalle.kilometraje).toLocaleString() : '0'} km</div>
                </div>
            </div>
        </div>
        <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;margin-bottom:10px;border:1px solid #eee;">
            <div style="font-weight:700;font-size:10px;color:#C1121F;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">📸 Fotos (${fotosArray.length}/7)</div>
            ${fotosArray.length > 0 ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin:4px 0;">${fotosArray.map(f => `<div style="border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#f5f5f5;text-align:center;"><img src="${f.url}" alt="${f.label}" style="width:100%;height:100px;object-fit:cover;display:block;background:#eee;" onerror="this.style.display='none'"><div style="padding:2px;font-size:7px;font-weight:bold;color:#555;background:#f9f9f9;">${f.label}</div></div>`).join('')}</div>` : '<p style="color:#999;font-style:italic;font-size:11px;text-align:center;padding:10px;">No se registraron fotos</p>'}
        </div>
        <div style="background:#f8f8f8;border-radius:4px;padding:8px 12px;margin-bottom:10px;border:1px solid #eee;">
            <div style="font-weight:700;font-size:10px;color:#C1121F;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">📝 Descripción del Problema</div>
            <div style="background:white;padding:8px 10px;border-radius:4px;font-size:9.5px;min-height:30px;border:1px solid #e8e8e8;white-space:pre-wrap;line-height:1.6;">${detalle.transcripcion_problema || 'No se registró descripción'}</div>
        </div>
        <div style="margin-top:15px;padding-top:12px;border-top:2px solid #ddd;">
            <div style="font-weight:700;font-size:11px;color:#C1121F;text-align:center;margin-bottom:12px;letter-spacing:3px;text-transform:uppercase;">✍️ Firmas de Conformidad</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
                <div style="text-align:center;padding:0 5px;">
                    <div style="font-weight:600;color:#333;margin-bottom:8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Firma del Cliente</div>
                    <div style="border-bottom:2px solid #333;height:45px;margin-bottom:5px;"></div>
                    <div style="font-size:10px;color:#555;font-weight:600;">${detalle.cliente_nombre || '____________________'}</div>
                    <div style="font-size:8px;color:#999;margin-top:3px;">${fechaActual}</div>
                </div>
                <div style="text-align:center;padding:0 5px;">
                    <div style="font-weight:600;color:#333;margin-bottom:8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;">Firma del Jefe Operativo</div>
                    <div style="border-bottom:2px solid #333;height:45px;margin-bottom:5px;"></div>
                    <div style="font-size:10px;color:#555;font-weight:600;">${detalle.jefe_operativo?.nombre || '____________________'}</div>
                    <div style="font-size:8px;color:#999;margin-top:3px;">${fechaActual}</div>
                </div>
            </div>
        </div>
        <div style="text-align:center;margin-top:18px;padding-top:8px;border-top:1px solid #eee;font-size:7px;color:#bbb;line-height:1.4;">
            <span>Documento generado automáticamente por <strong style="color:#C1121F;">FURIA MOTOR</strong></span> | 
            <span>Código: <strong>${detalle.codigo_unico || 'N/A'}</strong></span> | 
            <span>${new Date().toLocaleString('es-ES')}</span>
        </div>
    </div>`;
}

async function convertirImagenABase64(url) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/imagen-base64`, {
            method: 'POST',
            body: JSON.stringify({ url })
        });
        const data = await response.json();
        if (data.success && data.base64) return data.base64;
        throw new Error(data.error || 'Error convirtiendo imagen');
    } catch (error) { return url; }
}

// =====================================================
// MOSTRAR REPORTE FINAL - GENERA PDF AUTOMÁTICAMENTE
// =====================================================
async function mostrarReporteFinal(idOrden) {
    const modal = document.getElementById('codigoOrdenModal');
    const body = document.getElementById('ordenCompletadaBody');
    const btnDescargar = document.getElementById('btnDescargarPDFFinal');
    
    if (!modal || !body) return;
    if (btnDescargar) { btnDescargar.style.display = 'none'; btnDescargar.disabled = true; }
    
    body.innerHTML = `<div style="text-align:center;padding:40px 20px;">
        <i class="fas fa-spinner fa-spin" style="font-size:48px;color:#C1121F;margin-bottom:20px;"></i>
        <h3 style="color:white;margin-bottom:10px;">Generando reporte...</h3>
        <p style="color:#8E8E93;">Por favor espera</p>
    </div>`;
    modal.classList.add('show');
    
    const detalle = await cargarDatosOrdenCompleta(idOrden);
    if (!detalle) {
        body.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#dc3545;">
            <i class="fas fa-exclamation-triangle" style="font-size:48px;margin-bottom:20px;"></i>
            <h3>Error al cargar los datos</h3>
            <button class="btn-primary" onclick="cerrarModalOrden()" style="margin-top:15px;"><i class="fas fa-times"></i> Cerrar</button>
        </div>`;
        return;
    }
    
    // 🔥 ASIGNAR DATOS PARA EL PDF
    datosReporteFinal = detalle;
    datosReporteFinal.id_orden = idOrden;
    
    // 🔥 GENERAR EL PDF AUTOMÁTICAMENTE (descarga + sube a Drive)
    await descargarPDFFinal();
    
    // 🔥 MOSTRAR MODAL CON CONFIRMACIÓN
    const modalHeader = modal.querySelector('.modal-header h2');
    if (modalHeader) {
        modalHeader.innerHTML = `<i class="fas fa-check-circle" style="color:var(--verde-exito);"></i> ✅ ¡Recepción Finalizada! - ${detalle.codigo_unico || 'OT-N/A'}`;
    }
    
    // Verificar si el PDF ya está en la base de datos
    let pdfUrl = null;
    try {
        const pdfResponse = await fetchWithToken(`${API_URL}/jefe-operativo/descargar-pdf-recepcion/${idOrden}`);
        if (pdfResponse.ok) {
            const pdfData = await pdfResponse.json();
            if (pdfData.success && pdfData.url) {
                pdfUrl = pdfData.url;
            }
        }
    } catch (e) {}
    
    body.innerHTML = `<div style="text-align:center;padding:30px 20px;">
        <i class="fas fa-check-circle" style="font-size:48px;color:#10B981;margin-bottom:20px;"></i>
        <h3 style="color:white;margin-bottom:10px;">¡Recepción finalizada!</h3>
        <p style="color:#8E8E93;margin-bottom:20px;">Código: <strong style="color:#C1121F;font-size:20px;">${detalle.codigo_unico || 'OT-N/A'}</strong></p>
        <div style="background:#1A1A1C;border-radius:8px;padding:15px;margin:15px 0;border:1px solid #2C2C2E;">
            <i class="fas fa-file-pdf" style="color:#C1121F;font-size:20px;margin-right:10px;"></i>
            <span style="color:#8E8E93;font-size:13px;">${pdfUrl ? '✅ PDF guardado en Google Drive' : '📄 PDF descargado localmente'}</span>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button class="btn-primary" onclick="descargarPDFFinal()" style="margin-top:10px;">
                <i class="fas fa-file-pdf"></i> 📥 Regenerar PDF
            </button>
            ${pdfUrl ? `<a href="${pdfUrl}" target="_blank" class="btn-secondary" style="margin-top:10px;background:#1A1A1C;border:1px solid #C1121F;color:#C1121F;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-flex;align-items:center;gap:8px;">
                <i class="fas fa-external-link-alt"></i> Ver en Drive
            </a>` : ''}
        </div>
    </div>`;
    
    mostrarNotificacion('✅ PDF generado y descargado', 'success');
}

async function cargarDatosOrdenCompleta(idOrden) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${idOrden}`, { method: 'GET' });
        if (!response.ok) throw new Error('Error al cargar los datos');
        const data = await response.json();
        if (data.success && data.detalle) {
            datosReporteFinal = data.detalle;
            datosReporteFinal.id_orden = idOrden;
            const fotos = datosReporteFinal.fotos || {};
            const fotosBase64 = {};
            const camposFotos = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'];
            const fotosValidas = camposFotos.filter(c => fotos[c] && fotos[c] !== 'null' && fotos[c] !== 'None' && fotos[c] !== '');
            for (const campo of fotosValidas) {
                const url = fotos[campo];
                try {
                    const base64 = await convertirImagenABase64(url);
                    fotosBase64[campo] = base64;
                } catch (error) { fotosBase64[campo] = url; }
            }
            datosReporteFinal.fotos_base64 = fotosBase64;
            datosReporteFinal.fotos = fotosBase64;
            return datosReporteFinal;
        }
        throw new Error(data.error || 'No se pudieron obtener los datos');
    } catch (error) { return null; }
}

// =====================================================
// CARGAR AUDIO EN EDICIÓN (CORREGIDO)
// =====================================================
async function cargarAudioEnEdicion(audioUrl) {
    if (!audioUrl || audioUrl === 'null' || audioUrl === 'None' || audioUrl === '') {
        return null;
    }
    
    try {
        // 🔥 CONSTRUIR URL DEL PROXY CON EL TOKEN
        const token = localStorage.getItem('furia_token');
        const proxyUrl = `${API_URL}/jefe-operativo/proxy-audio?url=${encodeURIComponent(audioUrl)}`;
        
        console.log('🎵 Intentando cargar audio con proxy:', proxyUrl);
        
        // 🔥 PROBAR EL AUDIO CON EL PROXY (usando HEAD con token)
        const testResponse = await fetch(proxyUrl, {
            method: 'HEAD',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (testResponse.ok) {
            console.log('✅ Proxy de audio disponible');
            return proxyUrl;
        } else {
            console.warn(`⚠️ Proxy respondió ${testResponse.status}, usando URL directa`);
            // Si el proxy falla, intentar con URL directa de descarga
            const fileId = extraerFileIdDrive(audioUrl);
            if (fileId) {
                return `https://drive.google.com/uc?export=download&id=${fileId}`;
            }
            return audioUrl;
        }
        
    } catch (error) {
        console.warn('⚠️ Error verificando audio:', error);
        // Fallback: intentar extraer file_id
        const fileId = extraerFileIdDrive(audioUrl);
        if (fileId) {
            return `https://drive.google.com/uc?export=download&id=${fileId}`;
        }
        return audioUrl;
    }
}
// =====================================================
// EXTRAER FILE_ID DE GOOGLE DRIVE
// =====================================================
function extraerFileIdDrive(url) {
    if (!url) return null;
    
    // Formato 1: https://drive.google.com/uc?export=view&id=XXX
    let match = url.match(/[?&]id=([^&]+)/);
    if (match) return match[1];
    
    // Formato 2: https://drive.google.com/file/d/XXX/view
    match = url.match(/\/file\/d\/([^\/]+)/);
    if (match) return match[1];
    
    // Formato 3: https://drive.google.com/open?id=XXX
    match = url.match(/open\?id=([^&]+)/);
    if (match) return match[1];
    
    // Formato 4: ID directo (10+ caracteres alfanuméricos)
    if (url.match(/^[a-zA-Z0-9_-]{10,}$/)) return url;
    
    return null;
}


// =====================================================
// CARGAR AUDIO EN EDICIÓN (CON FETCH Y BLOB)
// =====================================================
async function cargarAudioConToken(audioUrl) {
    if (!audioUrl || audioUrl === 'null' || audioUrl === 'None' || audioUrl === '') {
        return null;
    }
    
    try {
        const token = localStorage.getItem('furia_token');
        const proxyUrl = `${API_URL}/jefe-operativo/proxy-audio?url=${encodeURIComponent(audioUrl)}`;
        
        console.log('🎵 Descargando audio con token...');
        
        // 🔥 DESCARGAR EL AUDIO CON FETCH Y TOKEN
        const response = await fetch(proxyUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        // 🔥 CONVERTIR A BLOB Y CREAR URL LOCAL
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);
        
        console.log('✅ Audio descargado y convertido a URL local');
        return localUrl;
        
    } catch (error) {
        console.warn('⚠️ Error cargando audio con fetch:', error);
        return null;
    }
}
// =====================================================
// EDITAR RECEPCIÓN (COMPLETO - CON AUDIO CORREGIDO)
// =====================================================
async function editarRecepcion(id) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${id}`, { method: 'GET' });
        const data = await response.json();
        
        if (!response.ok || !data.detalle) {
            throw new Error(data.error || 'Error cargando datos');
        }
        
        const detalle = data.detalle;
        
        if (detalle.estado_global !== 'EnRecepcion') {
            mostrarNotificacion(`⚠️ No se puede editar una orden en estado "${detalle.estado_global}"`, 'warning');
            return;
        }
        
        // Mostrar panel de edición
        if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
        if (sessionPanel) sessionPanel.style.display = 'flex';
        if (colaboradoresPanel) colaboradoresPanel.style.display = 'block';
        if (recepcionForm) recepcionForm.style.display = 'block';
        
        if (codigoActivoSpan) {
            codigoActivoSpan.textContent = `✏️ EDITANDO: ${detalle.codigo_unico || 'OT-N/A'}`;
            codigoActivoSpan.style.color = '#2563EB';
        }
        
        // ========== CARGAR DATOS DEL CLIENTE ==========
        document.getElementById('clienteNombre').value = detalle.cliente_nombre || '';
        document.getElementById('clienteTelefono').value = detalle.cliente_telefono || '';
        document.getElementById('clienteUbicacion').value = detalle.cliente_ubicacion || '';
        document.getElementById('clienteLatitud').value = detalle.latitud || '';
        document.getElementById('clienteLongitud').value = detalle.longitud || '';
        seccionesCompletadasLocal.cliente = !!(detalle.cliente_nombre && detalle.cliente_telefono && detalle.cliente_ubicacion);
        actualizarEstadoVisualSeccion('cliente', seccionesCompletadasLocal.cliente);
        
        // ========== CARGAR DATOS DEL VEHÍCULO ==========
        document.getElementById('vehiculoPlaca').value = detalle.placa || '';
        document.getElementById('vehiculoMarca').value = detalle.marca || '';
        document.getElementById('vehiculoModelo').value = detalle.modelo || '';
        document.getElementById('vehiculoAnio').value = detalle.anio || '';
        document.getElementById('vehiculoKilometraje').value = detalle.kilometraje || 0;
        seccionesCompletadasLocal.vehiculo = !!(detalle.placa && detalle.marca && detalle.modelo && detalle.anio && detalle.kilometraje);
        actualizarEstadoVisualSeccion('vehiculo', seccionesCompletadasLocal.vehiculo);
        
        // ========== CARGAR DESCRIPCIÓN ==========
        descripcionProblema.value = detalle.transcripcion_problema || '';
        seccionesCompletadasLocal.descripcion = !!(detalle.transcripcion_problema && detalle.transcripcion_problema.trim().length > 0);
        actualizarEstadoVisualSeccion('descripcion', seccionesCompletadasLocal.descripcion);
        
        // ========== 🔥 CARGAR AUDIO (CORREGIDO CON FETCH) ==========
        const audioUrl = detalle.audio_url;
        const tieneAudio = audioUrl && audioUrl !== 'null' && audioUrl !== 'None' && audioUrl !== '' && audioUrl !== null && audioUrl !== 'undefined';
        
        // Guardar URL original para referencia
        audioDriveUrl = tieneAudio ? audioUrl : null;
        
        if (tieneAudio) {
            // Mostrar indicador de carga
            if (audioStatus) {
                audioStatus.textContent = '⏳ Cargando audio...';
                audioStatus.style.color = '#f59e0b';
            }
            
            // 🔥 CARGAR AUDIO CON FETCH Y TOKEN
            const localAudioUrl = await cargarAudioConToken(audioUrl);
            
            if (localAudioUrl && audioPreview) {
                // Usar la URL local (blob)
                audioPreview.src = localAudioUrl;
                audioPreview.style.display = 'block';
                
                // Guardar referencia para limpiar después
                if (window.audioBlobUrl) {
                    URL.revokeObjectURL(window.audioBlobUrl);
                }
                window.audioBlobUrl = localAudioUrl;
                
                audioPreview.oncanplay = function() {
                    console.log('✅ Audio cargado correctamente');
                    if (audioStatus) {
                        audioStatus.textContent = '✅ Audio disponible';
                        audioStatus.style.color = '#10B981';
                    }
                    btnEliminarAudio.style.display = 'flex';
                    btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Regrabar Audio';
                };
                
                audioPreview.onerror = function(e) {
                    console.warn('⚠️ Error reproduciendo audio:', e);
                    // Si falla la URL local, intentar con la URL directa de Drive
                    const fileId = extraerFileIdDrive(audioUrl);
                    if (fileId) {
                        const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                        audioPreview.src = directUrl;
                        audioPreview.load();
                    }
                    if (audioStatus) {
                        audioStatus.textContent = 'Audio disponible (directo)';
                        audioStatus.style.color = '#10B981';
                    }
                    btnEliminarAudio.style.display = 'flex';
                    btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Regrabar Audio';
                };
            } else if (audioPreview) {
                // Fallback: usar URL directa
                audioPreview.src = audioUrl;
                audioPreview.style.display = 'block';
                if (audioStatus) {
                    audioStatus.textContent = 'Audio disponible (directo)';
                    audioStatus.style.color = '#10B981';
                }
                btnEliminarAudio.style.display = 'flex';
                btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Regrabar Audio';
            }
        } else {
            // No hay audio
            audioDriveUrl = null;
            if (audioPreview) {
                audioPreview.src = '';
                audioPreview.style.display = 'none';
                // Limpiar URL de blob si existe
                if (window.audioBlobUrl) {
                    URL.revokeObjectURL(window.audioBlobUrl);
                    window.audioBlobUrl = null;
                }
            }
            if (audioStatus) {
                audioStatus.textContent = 'No hay audio';
                audioStatus.style.color = '#8E8E93';
            }
            btnEliminarAudio.style.display = 'none';
            btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        }
        
        // ========== CARGAR FOTOS ==========
        await cargarFotosExistentes(detalle.fotos);
        
        // ========== CONFIGURAR MODO EDICIÓN ==========
        modoEdicionRecepcion = true;
        recepcionEditandoId = id;
        window.datosOriginalesRecepcion = detalle;
        window.fotosOriginalesRecepcion = JSON.parse(JSON.stringify(detalle.fotos || {}));
        window.audioOriginalRecepcion = detalle.audio_url || null;
        window.datosOriginalesRecepcion.codigo_unico = detalle.codigo_unico; 
        // Cambiar botón finalizar
        if (btnFinalizar) {
            btnFinalizar.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            btnFinalizar.disabled = false;
            btnFinalizar.onclick = guardarCambiosRecepcion;
            btnFinalizar.style.background = 'linear-gradient(135deg, #2563EB, #1d4ed8)';
        }
        
        // Banner de edición
        const sessionInfo = document.querySelector('.session-info');
        if (sessionInfo) {
            const bannerExistente = document.getElementById('editBanner');
            if (bannerExistente) bannerExistente.remove();
            
            const editBanner = document.createElement('div');
            editBanner.id = 'editBanner';
            editBanner.style.cssText = `background:rgba(37,99,235,0.15);border:1px solid #2563EB;border-radius:6px;padding:8px 16px;margin:8px 0;color:#2563EB;font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;`;
            editBanner.innerHTML = `
                <i class="fas fa-edit"></i>
                <span>Modo edición: <strong>${detalle.codigo_unico}</strong></span>
                <button onclick="cancelarEdicion()" style="margin-left:auto;background:transparent;border:1px solid #dc3545;color:#dc3545;padding:2px 12px;border-radius:4px;cursor:pointer;font-size:11px;">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            `;
            sessionInfo.prepend(editBanner);
        }
        
        actualizarBotonFinalizar();
        
        // Validar descripción con audio
        validarCompletadoDescripcion();
        
        mostrarNotificacion(`✅ Editando recepción: ${detalle.codigo_unico}`, 'success');
        
    } catch (error) {
        console.error('Error en editarRecepcion:', error);
        mostrarNotificacion('Error cargando datos: ' + error.message, 'error');
    }
}

function cancelarEdicion() {
    if (confirm('¿Cancelar la edición? Los cambios no guardados se perderán.')) {
        if (btnFinalizar) {
            btnFinalizar.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Recepción';
            btnFinalizar.disabled = true;
            btnFinalizar.onclick = finalizarSesionConReporte;
            btnFinalizar.style.background = '';
        }
        document.getElementById('editBanner')?.remove();
        if (codigoActivoSpan) { codigoActivoSpan.textContent = ''; codigoActivoSpan.style.color = ''; }
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
// GUARDAR CAMBIOS RECEPCIÓN (CORREGIDO)
// =====================================================
async function guardarCambiosRecepcion() {
    if (!recepcionEditandoId) {
        mostrarNotificacion('⚠️ No hay una recepción en edición', 'warning');
        return;
    }
    
    // Validar todas las secciones
    validarCompletadoCliente();
    validarCompletadoVehiculo();
    validarCompletadoFotos();
    validarCompletadoDescripcion();
    
    // Verificar completado
    const seccionesFaltantes = [];
    if (!seccionesCompletadasLocal.cliente) seccionesFaltantes.push('Cliente');
    if (!seccionesCompletadasLocal.vehiculo) seccionesFaltantes.push('Vehículo');
    if (!seccionesCompletadasLocal.fotos) seccionesFaltantes.push('Fotos');
    if (!seccionesCompletadasLocal.descripcion) seccionesFaltantes.push('Descripción');
    
    if (seccionesFaltantes.length > 0) {
        mostrarNotificacion(`⚠️ Completa: ${seccionesFaltantes.join(', ')}`, 'warning');
        return;
    }
    
    if (!confirm('¿Guardar los cambios en esta recepción?')) return;
    
    showProgress('Guardando cambios', 'Actualizando recepción...');
    updateProgressBar(10);
    
    try {
        // 🔥 RECOLECTAR TODAS LAS URLS DE FOTOS - DESDE EL DOM
        const fotosData = {};
        let fotosValidas = 0;
        
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            
            // 🔥 OBTENER URL DEL DOM (la más reciente)
            let url = uploadDiv?.getAttribute('data-drive-url') || 
                      uploadDiv?.dataset?.driveUrl || 
                      fotosSubidasLocal[foto.campo];
            
            // 🔥 Si no tiene URL en el DOM, verificar en el preview (puede ser una subida nueva)
            if (!url || url === 'null' || url === '' || url === 'undefined') {
                // Verificar si la foto fue eliminada (no tiene imagen)
                const hasImage = uploadDiv?.classList.contains('has-image') || false;
                if (!hasImage) {
                    // La foto fue eliminada, guardar como null
                    fotosData[foto.campo] = null;
                    continue;
                }
            }
            
            // 🔥 Si aún no hay URL, buscar en datos originales (fotos que no se tocaron)
            if (!url || url === 'null' || url === '' || url === 'undefined') {
                if (window.fotosOriginalesRecepcion) {
                    url = window.fotosOriginalesRecepcion[CAMPO_MAP[foto.campo]];
                }
            }
            
            // 🔥 Si aún no hay URL, buscar en la sesión
            if (!url || url === 'null' || url === '' || url === 'undefined') {
                if (sesionActual?.datos?.fotos) {
                    url = sesionActual.datos.fotos[CAMPO_MAP[foto.campo]];
                }
            }
            
            // 🔥 Guardar la URL (o null si no existe)
            if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                fotosData[foto.campo] = url;
                fotosValidas++;
                console.log(`📸 ${foto.campo}: ${url.substring(0, 50)}...`);
            } else {
                fotosData[foto.campo] = null;
                console.log(`📸 ${foto.campo}: SIN URL (eliminada)`);
            }
        }
        
        console.log(`📸 Total fotos válidas: ${fotosValidas}/7`);
        console.log('📸 fotosData:', fotosData);
        
        updateProgressBar(20);
        updateProgressMessage('Preparando datos...');
        
        // 🔥 EXTRAER CÓDIGO DE SESIÓN DE LAS URLS DE FOTOS
        const sesionCodigoExtraido = extraerSesionCodigoDeFotos(fotosData);
        const sesionCodigoOriginal = window.sesionCodigoOriginal || sesionCodigoExtraido || codigoSesion || null;
        
        console.log('📌 Código de sesión para edición:', sesionCodigoOriginal);
        
        // Construir datos actualizados
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
            fotos: fotosData,  // 🔥 ENVIAR TODAS LAS FOTOS (incluyendo null)
            descripcion: {
                texto: descripcionProblema?.value || '',
                audio_url: audioDriveUrl || null
            },
            sesion_codigo: sesionCodigoOriginal || window.datosOriginalesRecepcion?.codigo_unico || null,
            codigo_unico: window.datosOriginalesRecepcion?.codigo_unico || null
        };
        
        updateProgressBar(40);
        updateProgressMessage('Enviando datos al servidor...');
        
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/actualizar-recepcion/${recepcionEditandoId}`, {
            method: 'PUT',
            body: JSON.stringify(datosActualizados)
        });
        
        updateProgressBar(70);
        updateProgressMessage('Verificando cambios...');
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error del servidor: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ Respuesta del servidor:', result);
        
        updateProgressBar(90);
        updateProgressMessage('¡Cambios guardados!');
        
        mostrarNotificacion('✅ Cambios guardados correctamente', 'success');
        
        // Limpiar modo edición
        modoEdicionRecepcion = false;
        recepcionEditandoId = null;
        window.datosOriginalesRecepcion = null;
        window.fotosOriginalesRecepcion = null;
        window.audioOriginalRecepcion = null;
        window.sesionCodigoOriginal = null;
        
        // Restaurar botón finalizar
        if (btnFinalizar) {
            btnFinalizar.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Recepción';
            btnFinalizar.disabled = true;
            btnFinalizar.onclick = finalizarSesionConReporte;
            btnFinalizar.style.background = '';
        }
        
        // Eliminar banner de edición
        const banner = document.getElementById('editBanner');
        if (banner) banner.remove();
        
        if (codigoActivoSpan) {
            codigoActivoSpan.textContent = '';
            codigoActivoSpan.style.color = '';
        }
        
        // Limpiar formulario y recargar lista
        limpiarSesionCompleta();
        
        setTimeout(() => {
            completeProgress(true);
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
            cargarRecepciones();
        }, 500);
        
    } catch (error) {
        completeProgress(false);
        mostrarNotificacion('❌ Error al guardar cambios: ' + error.message, 'error');
    }
}

function confirmarEliminarRecepcion(id) {
    if (confirm('¿Eliminar esta recepción? Esta acción no se puede deshacer.')) eliminarRecepcion(id);
}

async function eliminarRecepcion(id) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/eliminar-recepcion/${id}`, { method: 'DELETE' });
        if (response.ok) { mostrarNotificacion('Recepción eliminada', 'success'); cargarRecepciones(); }
    } catch (error) { mostrarNotificacion('Error eliminando recepción', 'error'); }
}

// =====================================================
// LEAFLET MAPA
// =====================================================
function initLeafletMap() {
    if (leafletInicializado) return;
    const mapContainer = document.getElementById('leafletMapa');
    if (!mapContainer) return;
    
    mapCliente = L.map(mapContainer).setView([TALLER_LAT, TALLER_LNG], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapCliente);
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
    } catch (error) { return `${lat.toFixed(6)}, ${lng.toFixed(6)}`; }
}

function actualizarInfoUbicacion() {
    const infoDiv = document.getElementById('ubicacionInfoLeaflet');
    const textoSpan = document.getElementById('ubicacionSeleccionadaTextoLeaflet');
    const btnConfirmar = document.getElementById('btnConfirmarUbicacionLeaflet');
    if (infoDiv && textoSpan) { textoSpan.textContent = ubicacionTemporal.texto; infoDiv.style.display = 'block'; if (btnConfirmar) btnConfirmar.disabled = false; }
}

function abrirModalLeaflet() {
    const modal = document.getElementById('modalUbicacionLeaflet');
    if (!modal) return;
    ubicacionTemporal = { texto: '', lat: null, lng: null };
    document.getElementById('ubicacionInfoLeaflet').style.display = 'none';
    document.getElementById('btnConfirmarUbicacionLeaflet').disabled = true;
    if (!leafletInicializado) initLeafletMap();
    setTimeout(() => { if (mapCliente) mapCliente.invalidateSize(); }, 100);
    modal.classList.add('show');
}

function cerrarModalLeaflet() { document.getElementById('modalUbicacionLeaflet')?.classList.remove('show'); }

function confirmarUbicacionLeaflet() {
    if (!ubicacionTemporal.texto || !ubicacionTemporal.lat) { mostrarNotificacion('Selecciona una ubicación en el mapa', 'warning'); return; }
    clienteUbicacionInput.value = ubicacionTemporal.texto;
    clienteLatitudInput.value = ubicacionTemporal.lat;
    clienteLongitudInput.value = ubicacionTemporal.lng;
    cerrarModalLeaflet();
    validarCompletadoCliente();
    if (codigoSesion) { guardarSeccion('cliente'); mostrarNotificacion('Ubicación guardada', 'success'); }
}

function setupModalUbicacionLeaflet() {
    if (!btnAbrirModalUbicacion) return;
    btnAbrirModalUbicacion.addEventListener('click', abrirModalLeaflet);
    document.getElementById('btnCerrarModalUbicacionLeaflet')?.addEventListener('click', cerrarModalLeaflet);
    document.getElementById('btnCancelarUbicacionLeaflet')?.addEventListener('click', cerrarModalLeaflet);
    document.getElementById('btnConfirmarUbicacionLeaflet')?.addEventListener('click', confirmarUbicacionLeaflet);
    document.getElementById('btnBuscarUbicacionLeaflet')?.addEventListener('click', buscarYMostrarLeaflet);
    document.getElementById('modalBuscarUbicacionLeaflet')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') buscarYMostrarLeaflet(); });
    document.getElementById('modalUbicacionLeaflet')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) cerrarModalLeaflet(); });
}

async function buscarYMostrarLeaflet() {
    const query = document.getElementById('modalBuscarUbicacionLeaflet')?.value.trim();
    if (!query) return;
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const data = await response.json();
        if (data && data[0]) {
            const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
            if (mapCliente) {
                mapCliente.setView([lat, lng], 15);
                markerCliente.setLatLng([lat, lng]);
                const direccion = await obtenerDireccion(lat, lng);
                ubicacionTemporal = { texto: direccion, lat, lng };
                actualizarInfoUbicacion();
            }
        } else mostrarNotificacion('No se encontró la dirección', 'warning');
    } catch (error) { mostrarNotificacion('Error al buscar', 'error'); }
}

// =====================================================
// EVENTOS Y VALIDACIONES
// =====================================================
function setupEventListeners() {
    btnCrearSesion?.addEventListener('click', iniciarSesion);
    btnCancelarSesion?.addEventListener('click', mostrarConfirmacionCancelar);
    btnFinalizar?.addEventListener('click', finalizarSesionConReporte);
    btnCopiarCodigoSesion?.addEventListener('click', () => { if (codigoSesion) { navigator.clipboard.writeText(codigoSesion); mostrarNotificacion('Código copiado', 'success'); } });
    document.querySelectorAll('.btn-guardar-seccion').forEach(btn => {
        btn.addEventListener('click', async () => {
            const seccion = btn.dataset.seccion;
            if (seccion && codigoSesion) { await guardarSeccion(seccion); mostrarNotificacion(`✓ ${seccion} guardado`, 'success'); }
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
                if (codigoSesion) { await guardarSeccion('vehiculo'); await guardarSeccion('cliente'); }
            }
        }
    } catch (error) {}
}

function setupInputTracking() {
    ['clienteNombre', 'clienteTelefono'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('focus', () => { camposEnEdicion.cliente = true; });
            input.addEventListener('blur', async () => {
                validarCompletadoCliente();
                camposEnEdicion.cliente = false;
                if (codigoSesion && seccionesCompletadasLocal.cliente) await guardarSeccion('cliente');
            });
            input.addEventListener('input', validarCompletadoCliente);
        }
    });
    ['vehiculoPlaca', 'vehiculoMarca', 'vehiculoModelo'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('focus', () => { camposEnEdicion.vehiculo = true; });
            input.addEventListener('blur', async () => {
                validarCompletadoVehiculo();
                camposEnEdicion.vehiculo = false;
                if (codigoSesion && seccionesCompletadasLocal.vehiculo) await guardarSeccion('vehiculo');
            });
            input.addEventListener('input', validarCompletadoVehiculo);
        }
    });
    if (descripcionProblema) {
        descripcionProblema.addEventListener('focus', () => { camposEnEdicion.descripcion = true; });
        descripcionProblema.addEventListener('blur', async () => {
            validarCompletadoDescripcion();
            camposEnEdicion.descripcion = false;
            if (codigoSesion && seccionesCompletadasLocal.descripcion) await guardarSeccion('descripcion');
        });
        descripcionProblema.addEventListener('input', validarCompletadoDescripcion);
    }
}

function setupUnirsePorCodigo() {
    const btnUnirse = document.getElementById('btnUnirsePorCodigo');
    const modalUnirse = document.getElementById('modalUnirsePorCodigo');
    const btnConfirmarUnirse = document.getElementById('btnConfirmarUnirse');
    const btnCerrarModalUnirse = document.getElementById('btnCerrarModalUnirse');
    const codigoUnirseInput = document.getElementById('codigoUnirseInput');
    const btnCerrarFooter = document.getElementById('btnCerrarModalUnirseFooter');
    
    if (btnUnirse) btnUnirse.addEventListener('click', () => { if (codigoUnirseInput) codigoUnirseInput.value = ''; if (modalUnirse) modalUnirse.classList.add('show'); });
    const cerrarModal = () => { if (codigoUnirseInput) codigoUnirseInput.value = ''; if (modalUnirse) modalUnirse.classList.remove('show'); };
    btnCerrarModalUnirse?.addEventListener('click', cerrarModal);
    btnCerrarFooter?.addEventListener('click', cerrarModal);
    btnConfirmarUnirse?.addEventListener('click', async () => {
        let codigo = codigoUnirseInput?.value.trim().toUpperCase();
        if (!codigo) { mostrarNotificacion('Ingresa un código', 'warning'); return; }
        if (!codigo.startsWith('S-')) codigo = 'S-' + codigo;
        await unirseSesionConCodigo(codigo);
        cerrarModal();
    });
    modalUnirse?.addEventListener('click', (e) => { if (e.target === modalUnirse) cerrarModal(); });
}

// =====================================================
// SETUP PHOTO UPLOADS (CON ELIMINACIÓN DE DRIVE CORREGIDA)
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
            removeBtn.addEventListener('click', async function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                // 🔥 OBTENER LA URL ACTUAL DEL DOM
                let urlAnterior = uploadDiv?.getAttribute('data-drive-url') || 
                                  uploadDiv?.dataset?.driveUrl || 
                                  fotosSubidasLocal[foto.campo];
                
                // 🔥 SI NO HAY URL EN EL DOM, BUSCAR EN window.datosOriginalesRecepcion
                if (!urlAnterior || urlAnterior === 'null' || urlAnterior === '' || urlAnterior === 'undefined') {
                    if (window.datosOriginalesRecepcion?.fotos) {
                        urlAnterior = window.datosOriginalesRecepcion.fotos[CAMPO_MAP[foto.campo]];
                        console.log(`📸 URL recuperada de datosOriginales: ${urlAnterior}`);
                    }
                }
                
                // 🔥 SI AÚN NO HAY URL, BUSCAR EN window.fotosOriginalesRecepcion
                if (!urlAnterior || urlAnterior === 'null' || urlAnterior === '' || urlAnterior === 'undefined') {
                    if (window.fotosOriginalesRecepcion) {
                        urlAnterior = window.fotosOriginalesRecepcion[CAMPO_MAP[foto.campo]];
                        console.log(`📸 URL recuperada de fotosOriginales: ${urlAnterior}`);
                    }
                }
                
                console.log(`📸 URL anterior encontrada para ${foto.campo}: ${urlAnterior ? urlAnterior.substring(0, 50) + '...' : 'null'}`);
                
                const confirmar = confirm(`¿Eliminar la foto ${foto.label}?`);
                if (!confirmar) return;
                
                // 🔥 SI HAY URL Y ESTÁ EN MODO EDICIÓN, ELIMINAR DE DRIVE
                if (modoEdicionRecepcion && urlAnterior && urlAnterior !== 'null' && urlAnterior !== '' && urlAnterior !== 'undefined') {
                    try {
                        mostrarNotificacion(`🗑️ Eliminando ${foto.label} de Drive...`, 'info');
                        
                        const token = localStorage.getItem('furia_token');
                        const response = await fetch(`${API_URL}/jefe-operativo/eliminar-foto`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ url: urlAnterior })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            mostrarNotificacion(`✅ ${foto.label} eliminada de Drive`, 'success');
                        } else {
                            mostrarNotificacion(`⚠️ No se pudo eliminar de Drive: ${result.error || 'Error desconocido'}`, 'warning');
                        }
                    } catch (error) {
                        console.warn('Error eliminando foto de Drive:', error);
                        mostrarNotificacion(`⚠️ Error al eliminar de Drive: ${error.message}`, 'warning');
                    }
                } else if (!modoEdicionRecepcion) {
                    // Si no está en modo edición, solo eliminar del DOM
                    mostrarNotificacion(`📸 ${foto.label} eliminada del formulario`, 'info');
                }
                
                // 🔥 ELIMINAR LA FOTO DEL DOM (SIEMPRE)
                uploadDiv.removeAttribute('data-drive-url');
                delete uploadDiv.dataset.driveUrl;
                delete fotosSubidasLocal[foto.campo];
                
                // Si hay URL de objeto local (blob), revocarla
                if (uploadDiv.dataset.objectUrl) {
                    URL.revokeObjectURL(uploadDiv.dataset.objectUrl);
                    delete uploadDiv.dataset.objectUrl;
                }
                
                const inputEl = document.getElementById(foto.id);
                if (inputEl) {
                    inputEl.value = '';
                }
                
                const preview = uploadDiv.querySelector('.upload-preview');
                if (preview) {
                    preview.style.backgroundImage = '';
                    preview.innerHTML = '';
                    preview.style.display = '';
                }
                
                uploadDiv.classList.remove('has-image', 'error');
                this.style.display = 'none';
                actualizarProgresoFoto(foto.campo, 0, 'pending');
                
                // 🔥 ACTUALIZAR DATOS ORIGINALES ANTES DE VALIDAR
                if (window.datosOriginalesRecepcion?.fotos) {
                    window.datosOriginalesRecepcion.fotos[CAMPO_MAP[foto.campo]] = null;
                    console.log(`📸 datosOriginales actualizado: ${foto.campo} = null`);
                }
                if (window.fotosOriginalesRecepcion) {
                    window.fotosOriginalesRecepcion[CAMPO_MAP[foto.campo]] = null;
                    console.log(`📸 fotosOriginales actualizado: ${foto.campo} = null`);
                }
                
                // 🔥 ACTUALIZAR CONTADOR - FORZAR RECALCULO
                setTimeout(() => {
                    const completado = validarCompletadoFotos();
                    console.log(`📸 Estado después de eliminar: ${completado ? 'COMPLETADO' : 'PENDIENTE'}`);
                    
                    // 🔥 SI ESTÁ EN MODO EDICIÓN, GUARDAR LA SESIÓN
                    if (modoEdicionRecepcion && codigoSesion) {
                        // Recolectar URLs restantes
                        const fotosData = {};
                        for (const f of FOTOS_CONFIG) {
                            const div = document.getElementById(`upload-${f.id}`);
                            let url = div?.getAttribute('data-drive-url') || 
                                     div?.dataset?.driveUrl || 
                                     fotosSubidasLocal[f.campo];
                            if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                                fotosData[f.campo] = url;
                            } else {
                                // IMPORTANTE: Si no tiene URL, enviar null
                                fotosData[f.campo] = null;
                            }
                        }
                        console.log('📸 Guardando sesión con fotosData:', fotosData);
                        guardarSeccion('fotos');
                    }
                }, 300);
                
                // 🔥 DESTACAR EL INPUT PARA QUE EL USUARIO SUBA UNA NUEVA FOTO
                const inputFile = document.getElementById(foto.id);
                if (inputFile) {
                    inputFile.style.border = '2px solid #C1121F';
                    inputFile.style.borderRadius = '8px';
                    setTimeout(() => {
                        inputFile.style.border = '';
                        inputFile.style.borderRadius = '';
                    }, 3000);
                }
            });
        }
    }
}
// =====================================================
// EXPORTAR DETALLE PDF
// =====================================================
async function exportarDetallePDF() {
    if (!datosReporteFinal) {
        mostrarNotificacion('⚠️ No hay datos para exportar', 'warning');
        return;
    }
    await descargarPDFFinal();
}
// =====================================================
// CHECK AUTH
// =====================================================
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userInfoRaw = localStorage.getItem('furia_user');
    if (!token) { window.location.href = `${window.API_BASE_URL}/`; return false; }
    try {
        userInfo = JSON.parse(userInfoRaw || '{}');
        const verifyResponse = await fetch(`${window.API_BASE_URL}/api/verify-token`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!verifyResponse.ok) { localStorage.clear(); window.location.href = `${window.API_BASE_URL}/`; return false; }
        const verifyData = await verifyResponse.json();
        if (verifyData.user) { userInfo = verifyData.user; localStorage.setItem('furia_user', JSON.stringify(userInfo)); }
        const tieneRol = (userInfo.roles && userInfo.roles.includes('jefe_operativo')) || userInfo.rol === 'jefe_operativo';
        if (!tieneRol) { window.location.href = `${window.API_BASE_URL}/`; return false; }
        return true;
    } catch (error) { window.location.href = `${window.API_BASE_URL}/`; return false; }
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    if (currentDateSpan) currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

// =====================================================
// INICIALIZACIÓN
// =====================================================
window.addEventListener('beforeunload', () => {
    if (codigoSesion && sesionActual && sesionActual.estado === 'activa') localStorage.setItem('sesion_abandonada', codigoSesion);
});

async function verificarSesionAbandonada() {
    const sesionAbandonada = localStorage.getItem('sesion_abandonada');
    if (sesionAbandonada) { localStorage.removeItem('sesion_abandonada'); }
}

document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    await verificarSesionAbandonada();
    initPage();
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
    setupTranscripcionFormulario();
});

// =====================================================
// FUNCIONES GLOBALES
// =====================================================
window.unirseSesionConCodigo = unirseSesionConCodigo;
window.finalizarSesionConReporte = finalizarSesionConReporte;
window.verDetalleRecepcion = verDetalleRecepcion;
window.editarRecepcion = editarRecepcion;
window.confirmarEliminarRecepcion = confirmarEliminarRecepcion;
window.cerrarModal = () => document.getElementById('codigoModal')?.classList.remove('show');
window.cerrarModalOrden = () => document.getElementById('codigoOrdenModal')?.classList.remove('show');
window.cerrarModalDetalle = () => document.getElementById('modalDetalleRecepcion')?.classList.remove('show');
window.cerrarModalEliminar = () => document.getElementById('modalConfirmarEliminar')?.classList.remove('show');
window.verImagenAmpliada = verImagenAmpliada;
window.verImagenAmpliadaPorId = verImagenAmpliadaPorId;
window.descargarPDFFinal = descargarPDFFinal;
window.mostrarReporteFinal = mostrarReporteFinal;
window.cargarDatosOrdenCompleta = cargarDatosOrdenCompleta;
window.exportarDetallePDF = exportarDetallePDF;
window.logout = () => {
    detenerPolling();
    detenerKeepAlive();
    if (sesionesPolling) clearInterval(sesionesPolling);
    localStorage.clear();
    window.location.href = `${window.API_BASE_URL}/`;
};
// =====================================================
// CARGAR FOTOS EXISTENTES EN PARALELO (CON DATA-DRIVE-URL CORRECTO)
// =====================================================
async function cargarFotosExistentes(fotos) {
    if (!fotos) return;
    
    // Identificar qué fotos tienen URL válida
    const fotosAProcesar = [];
    
    for (const foto of FOTOS_CONFIG) {
        const campoDB = CAMPO_MAP[foto.campo];
        const url = fotos[campoDB];
        
        if (url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined') {
            fotosAProcesar.push({
                ...foto,
                url: url,
                campoDB: campoDB
            });
        }
    }
    
    // Si no hay fotos, salir
    if (fotosAProcesar.length === 0) {
        console.log('📸 No hay fotos para cargar');
        return;
    }
    
    // Mostrar estado de carga en todas las fotos
    for (const foto of fotosAProcesar) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        const preview = uploadDiv?.querySelector('.upload-preview');
        if (preview) {
            preview.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:8px;height:100%;background:rgba(0,0,0,0.3);border-radius:8px;">
                <i class="fas fa-spinner fa-spin" style="font-size:24px;color:#C1121F;"></i>
                <span style="font-size:10px;text-align:center;">Cargando...</span>
            </div>`;
        }
        actualizarProgresoFoto(foto.campo, 0, 'uploading');
    }
    
    // 🔥 CARGAR TODAS LAS FOTOS EN PARALELO
    const startTime = Date.now();
    console.log(`📸 Cargando ${fotosAProcesar.length} fotos en paralelo...`);
    
    const promesas = fotosAProcesar.map(async (foto) => {
        try {
            const response = await fetchWithToken(`${API_URL}/jefe-operativo/imagen-base64`, {
                method: 'POST',
                body: JSON.stringify({ url: foto.url })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.base64) {
                return { ...foto, base64: data.base64, success: true };
            } else {
                throw new Error(data.error || 'Error convirtiendo imagen');
            }
        } catch (error) {
            console.warn(`⚠️ Error cargando ${foto.campo}:`, error);
            return { ...foto, success: false, error: error.message };
        }
    });
    
    // Esperar a que todas terminen
    const resultados = await Promise.all(promesas);
    
    const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Todas las fotos cargadas en ${tiempoTotal} segundos`);
    
    // Procesar resultados
    let fotosCargadas = 0;
    
    for (const resultado of resultados) {
        const uploadDiv = document.getElementById(`upload-${resultado.id}`);
        const preview = uploadDiv?.querySelector('.upload-preview');
        const removeBtn = uploadDiv?.querySelector('.remove-photo');
        
        if (resultado.success && resultado.base64) {
            // Cargar la imagen
            if (preview) {
                preview.style.backgroundImage = `url('${resultado.base64}')`;
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                preview.innerHTML = '';
                uploadDiv.classList.add('has-image');
                
                // 🔥 GUARDAR LA URL EN EL DOM (IMPORTANTE PARA REEMPLAZO)
                uploadDiv.setAttribute('data-drive-url', resultado.url);
                uploadDiv.dataset.driveUrl = resultado.url;
                fotosSubidasLocal[resultado.campo] = resultado.url;
                
                // 🔥 TAMBIÉN GUARDAR EN DATOS ORIGINALES PARA REFERENCIA
                if (window.datosOriginalesRecepcion?.fotos) {
                    window.datosOriginalesRecepcion.fotos[resultado.campoDB] = resultado.url;
                }
                
                if (removeBtn) removeBtn.style.display = 'flex';
                actualizarProgresoFoto(resultado.campo, 100, 'completed');
                fotosCargadas++;
            }
        } else {
            // Error
            if (preview) {
                preview.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:4px;height:100%;background:rgba(0,0,0,0.3);border-radius:8px;">
                    <i class="fas fa-exclamation-triangle" style="font-size:20px;color:#ef4444;"></i>
                    <span style="font-size:9px;text-align:center;">Error</span>
                </div>`;
            }
            if (removeBtn) removeBtn.style.display = 'none';
            actualizarProgresoFoto(resultado.campo, 0, 'error');
        }
    }
    
    // Actualizar estado
    const completado = fotosCargadas === 7;
    seccionesCompletadasLocal.fotos = completado;
    actualizarEstadoVisualSeccion('fotos', completado);
    actualizarBotonFinalizar();
    
    const fotosBadge = document.getElementById('statusFotos');
    if (fotosBadge) {
        if (completado) {
            fotosBadge.textContent = '✓ Completado (7/7)';
            fotosBadge.className = 'status-badge completado';
        } else {
            fotosBadge.textContent = `⏳ ${fotosCargadas}/7 en Drive`;
            fotosBadge.className = 'status-badge en-proceso';
        }
    }
    
    console.log(`📸 ${fotosCargadas}/7 fotos cargadas en ${tiempoTotal}s`);
    return fotosCargadas;
}
// =====================================================
// EXTRAER CÓDIGO DE SESIÓN DE LAS URLS DE FOTOS
// =====================================================
function extraerSesionCodigoDeFotos(fotosData) {
    if (!fotosData || typeof fotosData !== 'object') return null;
    
    for (const [campo, url] of Object.entries(fotosData)) {
        if (url && typeof url === 'string') {
            // Buscar patrón S-XXXXX en la URL
            const match = url.match(/S-[A-Z0-9]{6}/);
            if (match) {
                console.log(`🔍 Código de sesión encontrado en ${campo}: ${match[0]}`);
                return match[0];
            }
        }
    }
    return null;
}
// =====================================================
// TRANSCRIBIR AUDIO MANUALMENTE (BOTÓN)
// =====================================================

async function transcribirAudioManual(idOrden) {
    if (!idOrden) {
        mostrarNotificacion('⚠️ No se proporcionó ID de orden', 'warning');
        return;
    }
    
    // Verificar si ya hay una transcripción
    const textarea = document.getElementById('transcripcionManual');
    if (textarea && textarea.value && textarea.value.trim().length > 10) {
        if (!confirm('⚠️ Ya hay una transcripción. ¿Deseas sobrescribirla?')) {
            return;
        }
    }
    
    // Cambiar estado del botón
    const btn = document.querySelector('.btn-transcribir');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transcribiendo...';
    }
    
    mostrarNotificacion('🎙️ Transcribiendo audio... puede tomar varios segundos', 'info');
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/transcribir-audio`, {
            method: 'POST',
            body: JSON.stringify({ id_orden: idOrden })
        });
        
        const data = await response.json();
        
        if (data.success && data.transcripcion) {
            // Actualizar el textarea
            if (textarea) {
                textarea.value = data.transcripcion;
                textarea.style.border = '2px solid #10B981';
                setTimeout(() => textarea.style.border = '', 3000);
            }
            
            mostrarNotificacion(`✅ Transcripción completada (${data.modelo_usado || 'Whisper'})`, 'success');
            
            // Guardar automáticamente
            if (idOrden) {
                await guardarTranscripcion(idOrden, data.transcripcion);
            }
        } else {
            mostrarNotificacion('❌ Error: ' + (data.error || 'No se pudo transcribir'), 'error');
        }
        
    } catch (error) {
        console.error('Error transcribiendo audio:', error);
        mostrarNotificacion('❌ Error al transcribir: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-microphone"></i> 🎙️ Transcribir Audio';
        }
    }
}


// =====================================================
// GUARDAR TRANSCRIPCIÓN
// =====================================================

async function guardarTranscripcion(idOrden, texto) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/guardar-transcripcion`, {
            method: 'POST',
            body: JSON.stringify({
                id_orden: idOrden,
                transcripcion: texto
            })
        });
        
        if (response.ok) {
            console.log('✅ Transcripción guardada');
        }
    } catch (error) {
        console.warn('⚠️ No se pudo guardar transcripción:', error);
    }
}