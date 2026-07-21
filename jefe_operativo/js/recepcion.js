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
// SUBIR FOTO A GOOGLE DRIVE
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
            formData.append('codigo_sesion', codigoSesion);
            
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
// PROCESAR COLA DE FOTOS
// =====================================================
function encolarFoto(file, campo, label) {
    uploadQueue.push({ file, campo, label, intentos: 0 });
    actualizarProgresoFoto(campo, 0, 'pending');
    if (!isProcessingQueue) procesarCola();
}

async function procesarCola() {
    if (uploadQueue.length === 0) {
        isProcessingQueue = false;
        colaActiva = false;
        const exitos = uploadResults.filter(r => r.success).length;
        const errores = uploadResults.filter(r => !r.success).length;
        if (errores > 0) mostrarNotificacion(`⚠️ ${exitos} subidas exitosas, ${errores} errores`, 'warning');
        else mostrarNotificacion(`✅ ${exitos} fotos subidas exitosamente`, 'success');
        setTimeout(validarCompletadoFotos, 500);
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
        
        if (uploadDiv) {
            uploadDiv.setAttribute('data-drive-url', url);
            uploadDiv.dataset.driveUrl = url;
            fotosSubidasLocal[campo] = url;
            uploadDiv.classList.remove('error');
            uploadDiv.classList.add('has-image');
            const preview = uploadDiv.querySelector('.upload-preview');
            if (preview) preview.style.backgroundImage = `url('${url}')`;
        }
        
        try { await actualizarSesionFoto(campo, url); } catch (e) {}
        setTimeout(validarCompletadoFotos, 500);
        setTimeout(() => {
            if (barContainer) barContainer.style.display = 'none';
            if (statusContainer) statusContainer.style.display = 'none';
        }, 1500);
        
    } catch (error) {
        clearInterval(interval);
        actualizarProgresoFoto(campo, 100, 'error');
        uploadResults.push({ campo, label, success: false, error: error.message });
        if (uploadDiv) {
            uploadDiv.classList.add('error');
            const input = uploadDiv.querySelector('input[type="file"]');
            if (input) input.value = '';
        }
        mostrarNotificacion(`❌ Error en ${label}: ${error.message}`, 'error');
    }
    
    setTimeout(procesarCola, 500);
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
        encolarFoto(fileToUpload, foto.campo, foto.label);
        validarCompletadoFotos();
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
// VALIDAR COMPLETADO DE FOTOS
// =====================================================
function validarCompletadoFotos() {
    let fotosConUrl = 0;
    let fotosConImagen = 0;
    
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        const hasImage = uploadDiv?.classList.contains('has-image') || false;
        if (hasImage) fotosConImagen++;
        
        let driveUrl = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
        if (!driveUrl && fotosSubidasLocal[foto.campo]) {
            driveUrl = fotosSubidasLocal[foto.campo];
            if (uploadDiv) { uploadDiv.setAttribute('data-drive-url', driveUrl); uploadDiv.dataset.driveUrl = driveUrl; }
        }
        if (!driveUrl && sesionActual?.datos?.fotos?.[CAMPO_MAP[foto.campo]]) {
            const url = sesionActual.datos.fotos[CAMPO_MAP[foto.campo]];
            if (url && url !== 'null' && url !== '') {
                driveUrl = url;
                if (uploadDiv) { uploadDiv.setAttribute('data-drive-url', driveUrl); uploadDiv.dataset.driveUrl = driveUrl; fotosSubidasLocal[foto.campo] = driveUrl; }
            }
        }
        if (driveUrl && driveUrl !== 'null' && driveUrl !== '') fotosConUrl++;
    }
    
    const completado = fotosConUrl === 7;
    const fotosBadge = document.getElementById('statusFotos');
    if (fotosBadge) {
        if (completado) {
            fotosBadge.textContent = '✓ Completado (7/7)';
            fotosBadge.classList.add('completado');
            fotosBadge.classList.remove('en-proceso');
        } else if (fotosConUrl > 0) {
            fotosBadge.textContent = `⏳ ${fotosConUrl}/7 en Drive`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
        } else {
            fotosBadge.textContent = `○ ${fotosConImagen}/7 fotos`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
        }
    }
    
    if (seccionesCompletadasLocal.fotos !== completado) {
        seccionesCompletadasLocal.fotos = completado;
        actualizarBotonFinalizar();
    }
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
    validarCompletadoDescripcion();
}

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
                                if (data.success && data.url) { resolve(data.url); return; }
                            }
                        }
                    }
                } catch (refreshError) {}
                mostrarNotificacion('⚠️ Sesión expirada. Reintenta subir el audio.', 'warning');
                reject(new Error('Sesión expirada'));
                return;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.success && data.url) resolve(data.url);
            else reject(new Error(data.error || 'Error subiendo audio'));
        } catch (error) { reject(error); }
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
    
    if (sessionPanel) sessionPanel.style.display = 'none';
    if (colaboradoresPanel) colaboradoresPanel.style.display = 'none';
    if (recepcionForm) recepcionForm.style.display = 'none';
    if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
    
    document.querySelectorAll('#recepcionForm input, #recepcionForm textarea').forEach(input => {
        if (input.id !== 'clienteLatitud' && input.id !== 'clienteLongitud') input.value = '';
    });
    
    document.querySelectorAll('.photo-upload').forEach(upload => {
        upload.classList.remove('has-image', 'error');
        const preview = upload.querySelector('.upload-preview');
        if (preview) { preview.style.backgroundImage = ''; preview.innerHTML = ''; }
        const removeBtn = upload.querySelector('.remove-photo');
        if (removeBtn) removeBtn.style.display = 'none';
        upload.removeAttribute('data-drive-url');
        delete upload.dataset.driveUrl;
        if (upload.dataset.objectUrl) { URL.revokeObjectURL(upload.dataset.objectUrl); delete upload.dataset.objectUrl; }
        const campo = upload.dataset.campo;
        if (campo) actualizarProgresoFoto(campo, 0, 'pending');
    });
    
    if (audioPreview) { audioPreview.src = ''; audioPreview.style.display = 'none'; }
    audioStatus.textContent = '';
    btnEliminarAudio.style.display = 'none';
    btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
    btnGrabarAudio.classList.remove('recording');
    
    ['Cliente', 'Vehiculo', 'Fotos', 'Descripcion'].forEach(seccion => {
        const badge = document.getElementById(`status${seccion}`);
        if (badge) { badge.textContent = '○ Pendiente'; badge.className = 'status-badge en-proceso'; }
    });
    
    actualizarBotonFinalizar();
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
// RECEPCIONES GUARDADAS
// =====================================================
function initRecepcionesPanel() {
    cargarRecepciones();
    document.getElementById('btnRefreshRecepciones')?.addEventListener('click', () => {
        offsetActual = 0; recepcionesActuales = []; noHayMasRecepciones = false; cargarRecepciones();
    });
    document.getElementById('searchRecepcion')?.addEventListener('input', () => {
        offsetActual = 0; recepcionesActuales = []; noHayMasRecepciones = false; filtrarYMostrarRecepciones();
    });
    document.getElementById('fechaDesde')?.addEventListener('change', () => {
        offsetActual = 0; recepcionesActuales = []; noHayMasRecepciones = false; filtrarYMostrarRecepciones();
    });
    document.getElementById('fechaHasta')?.addEventListener('change', () => {
        offsetActual = 0; recepcionesActuales = []; noHayMasRecepciones = false; filtrarYMostrarRecepciones();
    });
    document.getElementById('estadoFiltro')?.addEventListener('change', () => {
        offsetActual = 0; recepcionesActuales = []; noHayMasRecepciones = false; filtrarYMostrarRecepciones();
    });
    document.getElementById('btnPaginaAnterior')?.addEventListener('click', () => {
        if (offsetActual >= LIMITE_RECEPCIONES) { offsetActual -= LIMITE_RECEPCIONES; cargarRecepciones(); }
    });
    document.getElementById('btnPaginaSiguiente')?.addEventListener('click', () => {
        if (!noHayMasRecepciones) { offsetActual += LIMITE_RECEPCIONES; cargarRecepciones(); }
    });
}

async function cargarRecepciones(append = false) {
    if (cargandoMas) return;
    cargandoMas = true;
    const listDiv = document.getElementById('recepcionesList');
    if (listDiv && !append) listDiv.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando recepciones...</p></div>`;
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/listar-recepciones?limit=${LIMITE_RECEPCIONES}&offset=${offsetActual}`, { method: 'GET' });
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
            document.getElementById('recepcionesCount').textContent = totalRecepciones || recepcionesActuales.length;
            filtrarYMostrarRecepciones();
        } else {
            if (!append) { recepcionesActuales = []; filtrarYMostrarRecepciones(); }
        }
    } catch (error) {
        if (listDiv && !append) listDiv.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar</p><small>${error.message}</small></div>`;
    } finally { cargandoMas = false; }
}

function filtrarYMostrarRecepciones() {
    const listDiv = document.getElementById('recepcionesList');
    if (!listDiv) return;
    
    let filtradas = [...recepcionesActuales];
    const searchTerm = document.getElementById('searchRecepcion')?.value?.toLowerCase() || '';
    if (searchTerm) {
        filtradas = filtradas.filter(r => 
            (r.codigo_unico || '').toLowerCase().includes(searchTerm) ||
            (r.placa || '').toLowerCase().includes(searchTerm) ||
            (r.cliente_nombre || '').toLowerCase().includes(searchTerm)
        );
    }
    const fechaDesde = document.getElementById('fechaDesde')?.value;
    const fechaHasta = document.getElementById('fechaHasta')?.value;
    if (fechaDesde) filtradas = filtradas.filter(r => r.fecha_ingreso && r.fecha_ingreso >= fechaDesde);
    if (fechaHasta) filtradas = filtradas.filter(r => r.fecha_ingreso && r.fecha_ingreso <= fechaHasta + 'T23:59:59');
    const estadoFiltro = document.getElementById('estadoFiltro')?.value;
    if (estadoFiltro && estadoFiltro !== 'todos') filtradas = filtradas.filter(r => r.estado_global === estadoFiltro);
    document.getElementById('recepcionesCount').textContent = filtradas.length;
    
    if (filtradas.length === 0) {
        listDiv.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No hay recepciones</p></div>`;
        return;
    }
    
    listDiv.innerHTML = filtradas.map(rec => {
        const estadoLabels = { 'EnRecepcion': 'En Recepción', 'EnTaller': 'En Taller', 'Finalizado': 'Finalizado' };
        const estado = rec.estado_global || 'EnRecepcion';
        const fecha = rec.fecha_ingreso ? new Date(rec.fecha_ingreso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
        const vehiculo = `${rec.marca || ''} ${rec.modelo || ''}`.trim() || 'Vehículo sin especificar';
        
        return `<div class="recepcion-card estado-${estado}">
            <div class="recepcion-header">
                <span class="recepcion-codigo">${escapeHtml(rec.codigo_unico || 'OT-N/A')}</span>
                <span class="recepcion-estado ${estado}">${estadoLabels[estado] || estado}</span>
            </div>
            <div class="recepcion-body">
                <div class="recepcion-info-item">
                    <div class="icon-wrapper"><i class="fas fa-user"></i></div>
                    <div><span class="info-label">Cliente</span><span class="info-value">${escapeHtml(rec.cliente_nombre || 'N/A')}</span></div>
                </div>
                <div class="recepcion-info-item">
                    <div class="icon-wrapper"><i class="fas fa-car"></i></div>
                    <div><span class="info-label">Vehículo</span><span class="info-value">${escapeHtml(vehiculo)} <span class="placa-badge">${escapeHtml(rec.placa || 'N/A')}</span></span></div>
                </div>
            </div>
            <div class="recepcion-footer">
                <span class="recepcion-fecha"><i class="far fa-calendar-alt"></i> ${fecha}</span>
                <div class="recepcion-actions">
                    <button class="btn-action btn-ver" onclick="verDetalleRecepcion(${rec.id})"><i class="fas fa-eye"></i> Ver</button>
                    <button class="btn-action btn-editar" onclick="editarRecepcion(${rec.id})"><i class="fas fa-edit"></i> Editar</button>
                    <button class="btn-action btn-eliminar" onclick="confirmarEliminarRecepcion(${rec.id})"><i class="fas fa-trash-alt"></i> Eliminar</button>
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
// MOSTRAR MODAL DETALLE
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
            <div class="detalle-card"><div class="detalle-card-title"><i class="fas fa-align-left"></i> Descripción del Problema</div>
                <div class="detalle-descripcion-texto">${escapeHtml(detalle.transcripcion_problema || 'No se registró descripción')}</div>
            </div>
            ${audioHtml}
        </div>
    </div>`;
    
    body.innerHTML = html;
    modal.classList.add('show');
    
    // Tabs
    document.querySelectorAll('.detalle-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            document.querySelectorAll('.detalle-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.detalle-pane').forEach(p => p.classList.remove('active'));
            const activePane = document.getElementById(`pane-${tabId}`);
            if (activePane) activePane.classList.add('active');
            if (tabId === 'fotos') setTimeout(() => cargarImagenesFotos(detalle.fotos), 200);
        });
    });
    
    setTimeout(() => {
        const fotosTab = document.querySelector('.detalle-tab[data-tab="fotos"]');
        if (fotosTab && fotosTab.classList.contains('active')) cargarImagenesFotos(detalle.fotos);
    }, 400);
    
    document.getElementById('btnExportarPDFDetalle').onclick = () => { datosReporteFinal = detalle; descargarPDFFinal(); };
}

// =====================================================
// CARGAR IMÁGENES DE FOTOS EN EL DETALLE
// =====================================================
async function cargarImagenesFotos(fotos) {
    if (!fotos) return;
    
    const panelFotos = document.getElementById('pane-fotos');
    if (!panelFotos) return;
    
    const camposFotos = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'];
    const labels = ['Lateral Izquierdo', 'Lateral Derecho', 'Frontal', 'Trasera', 'Superior', 'Inferior', 'Tablero'];
    
    for (let i = 0; i < camposFotos.length; i++) {
        const campo = camposFotos[i];
        const url = fotos[campo];
        
        // 🔥 VERIFICAR QUE LA URL SEA VÁLIDA
        if (!url || url === 'null' || url === 'None' || url === '' || url === 'undefined') {
            continue;
        }
        
        // Buscar el contenedor de la foto
        const contenedores = panelFotos.querySelectorAll(`.detalle-foto-placeholder[id^="foto-${campo}-"]`);
        if (contenedores.length === 0) continue;
        const contenedor = contenedores[0];
        const fotoDiv = contenedor.closest('.detalle-foto');
        
        // 🔥 MOSTRAR INDICADOR DE CARGA
        contenedor.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:8px;height:100%;">
            <i class="fas fa-spinner fa-spin" style="font-size:24px;color:#C1121F;"></i>
            <span style="font-size:10px;text-align:center;">Cargando...</span>
        </div>`;
        
        try {
            // 🔥 LLAMAR AL ENDPOINT PARA CONVERTIR A BASE64
            const response = await fetchWithToken(`${API_URL}/jefe-operativo/imagen-base64`, {
                method: 'POST',
                body: JSON.stringify({ url })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.base64) {
                // 🔥 MOSTRAR LA IMAGEN CON LA URL BASE64
                contenedor.innerHTML = `<img src="${data.base64}" alt="${labels[i]}" style="width:100%;height:100%;object-fit:cover;display:block;" 
                    onerror="this.parentElement.innerHTML='<div style=\\'display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:4px;height:100%;\\'><i class=\\'fas fa-exclamation-triangle\\' style=\\'font-size:20px;\\'></i><span style=\\'font-size:10px;text-align:center;\\'>Error</span></div>'">`;
                if (fotoDiv) fotoDiv.classList.add('loaded');
            } else {
                throw new Error(data.error || 'Error convirtiendo imagen');
            }
        } catch (error) {
            console.error(`❌ Error cargando foto ${labels[i]}:`, error);
            contenedor.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:4px;height:100%;">
                <i class="fas fa-exclamation-triangle" style="font-size:20px;"></i>
                <span style="font-size:10px;text-align:center;">Error al cargar</span>
            </div>`;
        }
    }
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
// EDITAR RECEPCIÓN (CORREGIDO)
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
        
        // ========== CARGAR AUDIO ==========
        if (detalle.audio_url && detalle.audio_url !== 'null' && detalle.audio_url !== 'None') {
            audioDriveUrl = detalle.audio_url;
            audioPreview.src = detalle.audio_url;
            audioPreview.style.display = 'block';
            btnEliminarAudio.style.display = 'flex';
            audioStatus.textContent = 'Audio disponible';
            btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Regrabar Audio';
        } else {
            audioDriveUrl = null;
            audioPreview.src = '';
            audioPreview.style.display = 'none';
            btnEliminarAudio.style.display = 'none';
            audioStatus.textContent = 'No hay audio';
            btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        }
        
        // ========== CARGAR DESCRIPCIÓN ==========
        descripcionProblema.value = detalle.transcripcion_problema || '';
        seccionesCompletadasLocal.descripcion = !!(detalle.transcripcion_problema && detalle.transcripcion_problema.trim().length > 0 && audioDriveUrl);
        actualizarEstadoVisualSeccion('descripcion', seccionesCompletadasLocal.descripcion);
        
        // ========== CARGAR FOTOS (USANDO LA NUEVA FUNCIÓN) ==========
        await cargarFotosExistentes(detalle.fotos);
        
        // ========== CONFIGURAR MODO EDICIÓN ==========
        modoEdicionRecepcion = true;
        recepcionEditandoId = id;
        window.datosOriginalesRecepcion = detalle;
        window.fotosOriginalesRecepcion = JSON.parse(JSON.stringify(detalle.fotos || {}));
        window.audioOriginalRecepcion = detalle.audio_url || null;
        
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
            // Eliminar banner existente
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
        mostrarNotificacion(`✅ Editando recepción: ${detalle.codigo_unico}`, 'success');
        
    } catch (error) {
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
        // Recolectar todas las URLs de fotos
        const fotosData = {};
        let fotosValidas = 0;
        
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            let url = uploadDiv?.getAttribute('data-drive-url') || 
                     uploadDiv?.dataset?.driveUrl || 
                     fotosSubidasLocal[foto.campo];
            
            if (!url || url === 'null' || url === '' || url === 'undefined') {
                // Buscar en datos originales
                if (window.fotosOriginalesRecepcion) {
                    url = window.fotosOriginalesRecepcion[CAMPO_MAP[foto.campo]];
                }
            }
            
            if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                fotosData[foto.campo] = url;
                fotosValidas++;
            } else {
                fotosData[foto.campo] = null;
            }
        }
        
        updateProgressBar(20);
        updateProgressMessage('Preparando datos...');
        
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
            fotos: fotosData,
            descripcion: {
                texto: descripcionProblema?.value || '',
                audio_url: audioDriveUrl || null
            }
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
        
        updateProgressBar(90);
        updateProgressMessage('¡Cambios guardados!');
        
        mostrarNotificacion('✅ Cambios guardados correctamente', 'success');
        
        // Limpiar modo edición
        modoEdicionRecepcion = false;
        recepcionEditandoId = null;
        window.datosOriginalesRecepcion = null;
        window.fotosOriginalesRecepcion = null;
        window.audioOriginalRecepcion = null;
        
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

function setupPhotoUploads() {
    for (const foto of FOTOS_CONFIG) {
        const input = document.getElementById(foto.id);
        if (input) input.addEventListener('change', () => procesarFoto(input, foto));
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        const removeBtn = uploadDiv?.querySelector('.remove-photo');
        if (removeBtn) {
            removeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                uploadDiv.removeAttribute('data-drive-url');
                delete uploadDiv.dataset.driveUrl;
                delete fotosSubidasLocal[foto.campo];
                if (uploadDiv.dataset.objectUrl) { URL.revokeObjectURL(uploadDiv.dataset.objectUrl); delete uploadDiv.dataset.objectUrl; }
                const inputEl = document.getElementById(foto.id);
                if (inputEl) {
                    inputEl.value = '';
                    const newInput = inputEl.cloneNode(true);
                    inputEl.parentNode.replaceChild(newInput, inputEl);
                    newInput.addEventListener('change', () => procesarFoto(newInput, foto));
                }
                const preview = uploadDiv.querySelector('.upload-preview');
                if (preview) { preview.style.backgroundImage = ''; preview.innerHTML = ''; preview.style.display = ''; }
                uploadDiv.classList.remove('has-image', 'error');
                this.style.display = 'none';
                actualizarProgresoFoto(foto.campo, 0, 'pending');
                validarCompletadoFotos();
                if (codigoSesion && !modoEdicionRecepcion) guardarSeccion('fotos');
                mostrarNotificacion(`📸 ${foto.label} eliminada`, 'info');
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
// CARGAR FOTOS EXISTENTES EN EDICIÓN (CORREGIDO)
// =====================================================
async function cargarFotosExistentes(fotos) {
    if (!fotos) return;
    
    let fotosCargadas = 0;
    
    for (const foto of FOTOS_CONFIG) {
        const campoDB = CAMPO_MAP[foto.campo];
        const url = fotos[campoDB];
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        
        if (!uploadDiv) continue;
        
        const preview = uploadDiv.querySelector('.upload-preview');
        const removeBtn = uploadDiv.querySelector('.remove-photo');
        
        // Limpiar estado anterior
        uploadDiv.classList.remove('has-image', 'error');
        uploadDiv.removeAttribute('data-drive-url');
        delete uploadDiv.dataset.driveUrl;
        delete fotosSubidasLocal[foto.campo];
        
        if (preview) {
            preview.style.backgroundImage = '';
            preview.innerHTML = '';
            preview.style.display = '';
        }
        
        // Si hay URL válida, cargarla
        if (url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined') {
            try {
                // Verificar si la imagen es accesible
                const img = new Image();
                img.onload = function() {
                    // Imagen cargada correctamente
                    if (preview) {
                        preview.style.backgroundImage = `url('${url}')`;
                        preview.style.backgroundSize = 'cover';
                        preview.style.backgroundPosition = 'center';
                        preview.innerHTML = '';
                        uploadDiv.classList.add('has-image');
                        uploadDiv.setAttribute('data-drive-url', url);
                        uploadDiv.dataset.driveUrl = url;
                        fotosSubidasLocal[foto.campo] = url;
                        if (removeBtn) removeBtn.style.display = 'flex';
                        actualizarProgresoFoto(foto.campo, 100, 'completed');
                        fotosCargadas++;
                    }
                };
                img.onerror = function() {
                    // Error al cargar la imagen
                    logger.warn(`⚠️ No se pudo cargar la foto ${foto.campo}: ${url}`);
                    if (removeBtn) removeBtn.style.display = 'none';
                    actualizarProgresoFoto(foto.campo, 0, 'pending');
                };
                img.src = url;
            } catch (error) {
                logger.warn(`⚠️ Error al cargar ${foto.campo}:`, error);
                if (removeBtn) removeBtn.style.display = 'none';
                actualizarProgresoFoto(foto.campo, 0, 'pending');
            }
        } else {
            if (removeBtn) removeBtn.style.display = 'none';
            actualizarProgresoFoto(foto.campo, 0, 'pending');
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
    
    logger.info(`📸 Fotos cargadas: ${fotosCargadas}/7`);
    return fotosCargadas;
}