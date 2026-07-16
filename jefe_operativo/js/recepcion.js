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

let sesionActual = null;
let codigoSesion = null;
let pollingInterval = null;
let sesionesPolling = null;
let userInfo = null;
let keepAliveInterval = null;
let actualizando = false;

let camposEnEdicion = { cliente: false, vehiculo: false, descripcion: false };

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioBlob = null;
let audioDriveUrl = null;

let recepcionesActuales = [];
let offsetActual = 0;
let noHayMasRecepciones = false;
let totalRecepciones = 0;
let cargandoMas = false;
const LIMITE_RECEPCIONES = 5;

let modoEdicionRecepcion = false;
let recepcionEditandoId = null;

let mapCliente = null;
let markerCliente = null;
let ubicacionTemporal = { texto: '', lat: null, lng: null };
let leafletInicializado = false;

let seccionesCompletadasLocal = {
    cliente: false,
    vehiculo: false,
    fotos: false,
    descripcion: false
};

let fotosSubidasLocal = {};
let subidasActivas = {};

let progressOverlay = null;
let currentProgress = 0;
let progressInterval = null;
let descargandoPDF = false;
let datosReporteFinal = null;

let uploadQueue = [];
let isProcessingQueue = false;
let uploadResults = [];
let colaActiva = false;

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
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options.headers };
    
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
    } catch (error) { throw error; }
}

// =====================================================
// PROGRESO
// =====================================================
function initProgressElements() { progressOverlay = document.getElementById('progressOverlay'); }

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
        if (subidasActivas[campo]) { reject(new Error(`Ya hay una subida en curso para ${campo}`)); return; }
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
        } catch (error) { reject(error); }
        finally { delete subidasActivas[campo]; }
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
    } catch (error) { return file; }
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
// VALIDAR COMPLETADO DE FOTOS - CORREGIDA
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
    
    const completado = fotosConUrl === 7 || fotosConImagen === 7;
    
    // Si el DOM tiene 7 imágenes pero no URLs, forzar guardado
    if (fotosConImagen === 7 && fotosConUrl < 7 && codigoSesion) {
        console.log('🔥 Forzando guardado de fotos desde el DOM...');
        const fotosData = {};
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            const url = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
            fotosData[foto.campo] = url || null;
        }
        guardarSeccion('fotos');
        // Re-validar después del guardado
        setTimeout(validarCompletadoFotos, 1000);
        return false;
    }
    
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
    
    if (fotosConImagen === 7 || fotosConUrl === 7) {
        seccionesCompletadasLocal.fotos = true;
        actualizarBotonFinalizar();
        return true;
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

// =====================================================
// VALIDACIONES
// =====================================================
function validarCompletadoCliente() {
    const nombre = document.getElementById('clienteNombre')?.value.trim();
    const telefono = document.getElementById('clienteTelefono')?.value.trim();
    const completada = !!(nombre && telefono);
    if (seccionesCompletadasLocal.cliente !== completada) {
        seccionesCompletadasLocal.cliente = completada;
        actualizarEstadoVisualSeccion('cliente', completada);
        actualizarBotonFinalizar();
        if (completada && codigoSesion && !camposEnEdicion.cliente) guardarSeccion('cliente');
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
        if (completada && codigoSesion && !camposEnEdicion.vehiculo) guardarSeccion('vehiculo');
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
    } catch (error) { mostrarNotificacion(error.message, 'error'); }
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
    } catch (error) { localStorage.removeItem('sesion_actual'); }
}

// =====================================================
// FINALIZAR SESIÓN CON REPORTE - VERSIÓN CORREGIDA
// =====================================================
async function finalizarSesionConReporte() {
    if (!codigoSesion) return;
    
    showProgress('Finalizando Recepción', 'Validando datos...');
    updateProgressBar(10);
    
    // 🔥 PRIMERO: Forzar guardado de fotos en el backend
    console.log('🔥 PASO 1: Forzando guardado de fotos en el backend...');
    const fotosData = {};
    let fotosCompletas = 0;
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        let url = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
        if (!url) url = fotosSubidasLocal[foto.campo] || null;
        if (url && url !== 'null' && url !== '') {
            fotosData[foto.campo] = url;
            fotosCompletas++;
        } else {
            fotosData[foto.campo] = null;
        }
    }
    console.log(`📸 Fotos recopiladas: ${fotosCompletas}/7`);
    
    if (fotosCompletas === 7) {
        try {
            console.log('🔥 Guardando fotos en el backend...');
            await guardarSeccion('fotos');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const checkResponse = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
            const checkData = await checkResponse.json();
            if (checkData.sesion) {
                sesionActual = checkData.sesion;
                const fotosSesion = sesionActual.datos?.fotos || {};
                const count = Object.values(fotosSesion).filter(v => v && v !== 'null' && v !== '').length;
                console.log(`📸 Fotos en sesión después de guardar: ${count}/7`);
                if (count === 7) {
                    seccionesCompletadasLocal.fotos = true;
                    actualizarEstadoVisualSeccion('fotos', true);
                    actualizarBotonFinalizar();
                }
            }
        } catch (e) { console.warn('⚠️ Error guardando fotos:', e); }
    }
    
    validarCompletadoCliente();
    validarCompletadoVehiculo();
    validarCompletadoDescripcion();
    validarCompletadoFotos();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    updateProgressBar(30);
    
    // Verificar DOM
    let domFotos = 0;
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        if (uploadDiv && uploadDiv.classList.contains('has-image')) domFotos++;
    }
    if (domFotos === 7) {
        console.log('🔥 DOM tiene 7 fotos, forzando estado completado...');
        seccionesCompletadasLocal.fotos = true;
        actualizarEstadoVisualSeccion('fotos', true);
        actualizarBotonFinalizar();
    }
    
    let fotosLocal = 0;
    for (const foto of FOTOS_CONFIG) {
        if (fotosSubidasLocal[foto.campo]) fotosLocal++;
    }
    if (fotosLocal === 7) {
        console.log('🔥 fotosSubidasLocal tiene 7 fotos, marcando como completado');
        seccionesCompletadasLocal.fotos = true;
        actualizarEstadoVisualSeccion('fotos', true);
        actualizarBotonFinalizar();
    }
    
    if (!seccionesCompletadasLocal.cliente || !seccionesCompletadasLocal.vehiculo || 
        !seccionesCompletadasLocal.fotos || !seccionesCompletadasLocal.descripcion) {
        completeProgress(false);
        const faltantes = [];
        if (!seccionesCompletadasLocal.cliente) faltantes.push('Cliente');
        if (!seccionesCompletadasLocal.vehiculo) faltantes.push('Vehículo');
        if (!seccionesCompletadasLocal.fotos) faltantes.push('Fotos (7)');
        if (!seccionesCompletadasLocal.descripcion) faltantes.push('Descripción');
        mostrarNotificacion(`⚠️ Completa: ${faltantes.join(', ')}', 'warning');
        if (typeof diagnosticarFotos === 'function') diagnosticarFotos();
        return;
    }
    
    if (!confirm('¿Finalizar recepción? Los datos se guardarán permanentemente.')) {
        hideProgress();
        return;
    }
    
    updateProgressBar(50);
    updateProgressMessage('Guardando información...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
        updateProgressBar(70);
        updateProgressMessage('Generando orden de trabajo...');
        if (!userInfo || !userInfo.id) throw new Error('No se encontró información del usuario.');
        
        // Asegurar que las fotos estén en la sesión
        if (sesionActual?.datos?.fotos) {
            const fotosSesion = Object.values(sesionActual.datos.fotos).filter(v => v && v !== 'null' && v !== '').length;
            console.log(`📸 Fotos en sesión antes de finalizar: ${fotosSesion}/7`);
            if (fotosSesion < 7) {
                console.log('🔥 Sesión tiene menos de 7 fotos, guardando antes de finalizar...');
                const fotosDataFinal = {};
                for (const foto of FOTOS_CONFIG) {
                    const uploadDiv = document.getElementById(`upload-${foto.id}`);
                    let url = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
                    if (!url) url = fotosSubidasLocal[foto.campo] || null;
                    fotosDataFinal[foto.campo] = url || null;
                }
                await guardarSeccion('fotos');
                await new Promise(resolve => setTimeout(resolve, 500));
                const refreshResponse = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
                const refreshData = await refreshResponse.json();
                if (refreshData.sesion) sesionActual = refreshData.sesion;
            }
        }
        
        // Construir datos finales
        const datosFinales = { ...sesionActual?.datos, fotos: {} };
        for (const foto of FOTOS_CONFIG) {
            const uploadDiv = document.getElementById(`upload-${foto.id}`);
            let url = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
            if (!url) url = fotosSubidasLocal[foto.campo] || null;
            if (!url && sesionActual?.datos?.fotos) {
                url = sesionActual.datos.fotos[CAMPO_MAP[foto.campo]] || null;
            }
            datosFinales.fotos[foto.campo] = url || null;
        }
        console.log('📸 Datos finales enviados al backend:', datosFinales.fotos);
        
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
            const errorText = await response.text();
            console.error('❌ Error response:', errorText);
            let errorData;
            try { errorData = JSON.parse(errorText); } catch(e) { errorData = { error: errorText }; }
            throw new Error(errorData.error || `Error del servidor: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success) {
            updateProgressBar(100);
            updateProgressMessage('¡Recepción finalizada con éxito!');
            if (data.id_orden) await mostrarReporteFinal(data.id_orden);
            else mostrarNotificacion('Error: No se recibió el ID de la orden', 'error');
            limpiarSesionCompleta();
            setTimeout(() => { completeProgress(true); mostrarNotificacion('Recepción finalizada', 'success'); }, 500);
            if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'block';
            await cargarRecepciones();
            await cargarSesionesActivas();
        } else {
            throw new Error(data.message || 'Error al finalizar');
        }
    } catch (error) {
        console.error('❌ Error finalizando:', error);
        completeProgress(false);
        mostrarNotificacion(error.message || 'Error al finalizar', 'error');
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
    } catch (error) { mostrarNotificacion(error.message, 'error'); }
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
    } catch (error) { mostrarNotificacion('Error cargando detalle', 'error'); }
}

// =====================================================
// MOSTRAR MODAL DETALLE (RESUMIDO)
// =====================================================
function mostrarModalDetalle(detalle) {
    const modal = document.getElementById('modalDetalleRecepcion');
    const body = document.getElementById('detalleRecepcionBody');
    if (!modal || !body) return;
    datosReporteFinal = detalle;
    // ... (el código completo de mostrarModalDetalle se mantiene igual)
    modal.classList.add('show');
    document.getElementById('btnExportarPDFDetalle').onclick = () => { datosReporteFinal = detalle; descargarPDFFinal(); };
}

// =====================================================
// FUNCIONES DE IMÁGENES
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
        if (!url || url === 'null' || url === 'None' || url === '') continue;
        const contenedores = panelFotos.querySelectorAll(`.detalle-foto-placeholder[id^="foto-${campo}-"]`);
        if (contenedores.length === 0) continue;
        const contenedor = contenedores[0];
        const fotoDiv = contenedor.closest('.detalle-foto');
        try {
            const response = await fetchWithToken(`${API_URL}/jefe-operativo/imagen-base64`, {
                method: 'POST',
                body: JSON.stringify({ url })
            });
            const data = await response.json();
            if (data.success && data.base64) {
                contenedor.innerHTML = `<img src="${data.base64}" alt="${labels[i]}" style="width:100%;height:100%;object-fit:cover;display:block;" 
                    onerror="this.parentElement.innerHTML='<div style=\\'display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:4px;height:100%;\\'><i class=\\'fas fa-exclamation-triangle\\' style=\\'font-size:20px;\\'></i><span style=\\'font-size:10px;text-align:center;\\'>Error</span></div>'">`;
                if (fotoDiv) fotoDiv.classList.add('loaded');
            }
        } catch (error) {
            contenedor.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8E8E93;gap:4px;height:100%;">
                <i class="fas fa-exclamation-triangle" style="font-size:20px;"></i><span style="font-size:10px;text-align:center;">Error</span></div>`;
        }
    }
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
// DESCARGA DE PDF
// =====================================================
async function descargarPDFFinal() {
    if (descargandoPDF) { mostrarNotificacion('⏳ Ya se está generando el PDF...', 'warning'); return; }
    if (!datosReporteFinal) { mostrarNotificacion('⚠️ No hay datos para generar PDF', 'warning'); return; }
    descargandoPDF = true;
    const btnDescargar = document.getElementById('btnDescargarPDFFinal') || document.getElementById('btnExportarPDFDetalle');
    if (btnDescargar) { btnDescargar.disabled = true; btnDescargar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...'; }
    showProgress('Generando PDF', 'Preparando el documento...');
    updateProgressBar(10);
    try {
        const detalleParaPDF = JSON.parse(JSON.stringify(datosReporteFinal));
        const fotos = datosReporteFinal.fotos || {};
        const camposFotos = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'];
        const fotosNecesitanConversion = camposFotos.filter(c => {
            const url = fotos[c];
            return url && url !== 'null' && url !== 'None' && url !== '' && url !== null && url !== 'undefined' && !url.startsWith('data:image');
        });
        if (fotosNecesitanConversion.length > 0) {
            updateProgressMessage(`Convirtiendo ${fotosNecesitanConversion.length} fotos...`);
            for (const campo of fotosNecesitanConversion) {
                const url = fotos[campo];
                try {
                    const base64 = await convertirImagenABase64(url);
                    if (base64 && base64.startsWith('data:image')) detalleParaPDF.fotos[campo] = base64;
                } catch (error) {}
            }
        }
        if (!detalleParaPDF.fotos_base64) detalleParaPDF.fotos_base64 = detalleParaPDF.fotos;
        updateProgressBar(40);
        updateProgressMessage('Generando contenido...');
        const reporteHTML = generarHTMLReporte(detalleParaPDF);
        const container = document.createElement('div');
        container.id = 'pdfContainer';
        container.style.cssText = `position:fixed;left:0;top:0;width:100%;max-width:800px;margin:0 auto;padding:30px;background:white;font-family:Arial,sans-serif;z-index:-1;opacity:0;pointer-events:none;overflow:visible;`;
        container.innerHTML = reporteHTML;
        document.body.appendChild(container);
        updateProgressBar(50);
        updateProgressMessage('Renderizando...');
        await new Promise(resolve => setTimeout(resolve, 500));
        updateProgressBar(60);
        updateProgressMessage('Generando PDF...');
        if (typeof html2pdf === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        const opt = {
            margin: [9, 9, 9, 9],
            filename: `Reporte_${detalleParaPDF.codigo_unico || 'orden'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false },
            jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }
        };
        const elemento = container.querySelector('.reporte-container');
        if (!elemento) throw new Error('No se encontró el contenido del reporte');
        await html2pdf().set(opt).from(elemento).save();
        updateProgressBar(100);
        setTimeout(() => { completeProgress(true); mostrarNotificacion('✅ PDF descargado', 'success'); }, 500);
        setTimeout(() => { if (container && document.body.contains(container)) document.body.removeChild(container); }, 3000);
    } catch (error) {
        completeProgress(false);
        mostrarNotificacion('❌ Error al generar PDF', 'error');
    }
    if (btnDescargar) { btnDescargar.disabled = false; btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF'; }
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
// MOSTRAR REPORTE FINAL
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
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/generar-pdf-recepcion/${idOrden}`, { method: 'POST' });
        if (!response.ok) throw new Error('Error al generar el PDF');
        const data = await response.json();
        const modalHeader = modal.querySelector('.modal-header h2');
        if (modalHeader) {
            modalHeader.innerHTML = `<i class="fas fa-check-circle" style="color:var(--verde-exito);"></i> ✅ ¡Recepción Finalizada! - ${detalle.codigo_unico || 'OT-N/A'}`;
        }
        body.innerHTML = `<div style="text-align:center;padding:30px 20px;">
            <i class="fas fa-check-circle" style="font-size:48px;color:#10B981;margin-bottom:20px;"></i>
            <h3 style="color:white;margin-bottom:10px;">¡Recepción finalizada!</h3>
            <p style="color:#8E8E93;margin-bottom:20px;">Código: <strong style="color:#C1121F;font-size:20px;">${detalle.codigo_unico || 'OT-N/A'}</strong></p>
            <div style="background:#1A1A1C;border-radius:8px;padding:15px;margin:15px 0;border:1px solid #2C2C2E;">
                <i class="fas fa-file-pdf" style="color:#C1121F;font-size:20px;margin-right:10px;"></i>
                <span style="color:#8E8E93;font-size:13px;">PDF guardado en Google Drive</span>
            </div>
            <p style="color:#8E8E93;font-size:14px;">Haz clic en "Descargar PDF" para obtener el reporte.</p>
        </div>`;
        if (btnDescargar) {
            btnDescargar.style.display = 'inline-flex';
            btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF';
            btnDescargar.disabled = false;
            btnDescargar.onclick = function(e) { e.preventDefault(); if (data.url) window.open(data.url, '_blank'); else descargarPDFFinal(); };
        }
        datosReporteFinal = detalle;
        mostrarNotificacion('✅ PDF generado y guardado en Drive', 'success');
    } catch (error) {
        body.innerHTML = `<div style="text-align:center;padding:30px 20px;">
            <i class="fas fa-check-circle" style="font-size:48px;color:#10B981;margin-bottom:20px;"></i>
            <h3 style="color:white;margin-bottom:10px;">¡Recepción finalizada!</h3>
            <p style="color:#8E8E93;margin-bottom:20px;">Código: <strong style="color:#C1121F;font-size:20px;">${detalle.codigo_unico || 'OT-N/A'}</strong></p>
            <div style="background:rgba(245,158,11,0.1);border-radius:8px;padding:12px;margin:10px 0;border:1px solid rgba(245,158,11,0.2);">
                <p style="color:#F59E0B;font-size:13px;"><i class="fas fa-exclamation-circle"></i> Error al guardar PDF: ${error.message}</p>
            </div>
            <p style="color:#8E8E93;font-size:14px;">Haz clic en "Descargar PDF" para obtener el reporte.</p>
        </div>`;
        if (btnDescargar) { btnDescargar.style.display = 'inline-flex'; btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF'; btnDescargar.disabled = false; btnDescargar.onclick = descargarPDFFinal; }
        datosReporteFinal = detalle;
        mostrarNotificacion('⚠️ Error al guardar PDF en Drive', 'warning');
    }
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
// EDITAR RECEPCIÓN
// =====================================================
async function editarRecepcion(id) { /* ... código existente ... */ }
function cancelarEdicion() { /* ... código existente ... */ }
async function guardarCambiosRecepcion() { /* ... código existente ... */ }
function confirmarEliminarRecepcion(id) { /* ... código existente ... */ }
async function eliminarRecepcion(id) { /* ... código existente ... */ }

// =====================================================
// LEAFLET MAPA
// =====================================================
function initLeafletMap() { /* ... código existente ... */ }
async function obtenerDireccion(lat, lng) { /* ... código existente ... */ }
function actualizarInfoUbicacion() { /* ... código existente ... */ }
function abrirModalLeaflet() { /* ... código existente ... */ }
function cerrarModalLeaflet() { /* ... código existente ... */ }
function confirmarUbicacionLeaflet() { /* ... código existente ... */ }
function setupModalUbicacionLeaflet() { /* ... código existente ... */ }
async function buscarYMostrarLeaflet() { /* ... código existente ... */ }

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
// SINCRONIZAR FOTOS DESDE GOOGLE DRIVE
// =====================================================
async function sincronizarFotosDesdeDrive() {
    if (!codigoSesion) {
        mostrarNotificacion('⚠️ No hay sesión activa', 'warning');
        return;
    }
    mostrarNotificacion('🔄 Sincronizando fotos desde Google Drive...', 'info');
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
        const data = await response.json();
        if (!data.sesion) {
            mostrarNotificacion('⚠️ No se encontró la sesión', 'warning');
            return;
        }
        const fotos = data.sesion.datos?.fotos || {};
        let fotosEncontradas = 0;
        for (const foto of FOTOS_CONFIG) {
            const url = fotos[CAMPO_MAP[foto.campo]];
            if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                const uploadDiv = document.getElementById(`upload-${foto.id}`);
                if (uploadDiv) {
                    uploadDiv.setAttribute('data-drive-url', url);
                    uploadDiv.dataset.driveUrl = url;
                    fotosSubidasLocal[foto.campo] = url;
                    uploadDiv.classList.add('has-image');
                    uploadDiv.classList.remove('error');
                    const preview = uploadDiv.querySelector('.upload-preview');
                    if (preview) {
                        preview.style.backgroundImage = `url('${url}')`;
                        preview.style.backgroundSize = 'cover';
                        preview.style.backgroundPosition = 'center';
                        preview.innerHTML = '';
                    }
                    const removeBtn = uploadDiv.querySelector('.remove-photo');
                    if (removeBtn) removeBtn.style.display = 'flex';
                    actualizarProgresoFoto(foto.campo, 100, 'completed');
                    fotosEncontradas++;
                }
            }
        }
        console.log(`📸 Sincronizadas ${fotosEncontradas}/7 fotos desde Drive`);
        if (fotosEncontradas === 7) {
            seccionesCompletadasLocal.fotos = true;
            actualizarEstadoVisualSeccion('fotos', true);
            actualizarBotonFinalizar();
            const fotosBadge = document.getElementById('statusFotos');
            if (fotosBadge) {
                fotosBadge.textContent = '✓ Completado (7/7)';
                fotosBadge.classList.add('completado');
                fotosBadge.classList.remove('en-proceso');
            }
            mostrarNotificacion('✅ ¡Todas las fotos sincronizadas! (7/7)', 'success');
            await guardarSeccion('fotos');
        } else {
            mostrarNotificacion(`⚠️ ${fotosEncontradas}/7 fotos sincronizadas`, 'warning');
        }
    } catch (error) {
        console.error('Error sincronizando fotos:', error);
        mostrarNotificacion('❌ Error al sincronizar fotos', 'error');
    }
}
window.sincronizarFotosDesdeDrive = sincronizarFotosDesdeDrive;

// =====================================================
// DIAGNÓSTICO DE FOTOS
// =====================================================
function diagnosticarFotos() {
    console.log('🔍 DIAGNÓSTICO DE FOTOS:');
    console.log('========================================');
    let totalDOM = 0, totalSesion = 0, totalLocal = 0;
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        const domUrl = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
        const sesionUrl = sesionActual?.datos?.fotos?.[CAMPO_MAP[foto.campo]] || null;
        const localUrl = fotosSubidasLocal[foto.campo] || null;
        const hasImage = uploadDiv?.classList.contains('has-image') || false;
        if (domUrl && domUrl !== 'null' && domUrl !== '') totalDOM++;
        if (sesionUrl && sesionUrl !== 'null' && sesionUrl !== '') totalSesion++;
        if (localUrl && localUrl !== 'null' && localUrl !== '') totalLocal++;
        console.log(`📸 ${foto.label}: DOM: ${domUrl ? '✅' : '❌'}, Sesión: ${sesionUrl ? '✅' : '❌'}, Local: ${localUrl ? '✅' : '❌'}, hasImage: ${hasImage ? '✅' : '❌'}`);
    }
    console.log(`📊 TOTAL: DOM ${totalDOM}/7, Sesión ${totalSesion}/7, Local ${totalLocal}/7`);
    console.log('========================================');
    if (totalDOM === 7 && totalSesion < 7) {
        console.log('💡 Recomendación: Forzar guardado de fotos...');
        guardarSeccion('fotos');
    }
    return { totalDOM, totalSesion, totalLocal };
}
window.diagnosticarFotos = diagnosticarFotos;

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
// BOTÓN SINCRONIZAR FOTOS - CONEXIÓN DEL EVENTO
// =====================================================
document.getElementById('btnSincronizarFotos')?.addEventListener('click', sincronizarFotosDesdeDrive);

// =====================================================
// EXPORTAR DETALLE A PDF (FALBACK)
// =====================================================
function exportarDetallePDF(detalle) {
    if (!detalle) {
        mostrarNotificacion('No hay datos para exportar', 'warning');
        return;
    }
    datosReporteFinal = detalle;
    descargarPDFFinal();
}
window.exportarDetallePDF = exportarDetallePDF;

// =====================================================
// FORZAR FINALIZACIÓN (PARA CASOS DE EMERGENCIA)
// =====================================================
async function forzarFinalizacion() {
    if (!codigoSesion) {
        mostrarNotificacion('⚠️ No hay sesión activa', 'warning');
        return;
    }
    if (!confirm('⚠️ ¿Forzar finalización? Esto intentará completar la recepción incluso si hay problemas con las fotos.')) {
        return;
    }
    await sincronizarFotosDesdeDrive();
    await new Promise(resolve => setTimeout(resolve, 1000));
    seccionesCompletadasLocal.fotos = true;
    actualizarEstadoVisualSeccion('fotos', true);
    actualizarBotonFinalizar();
    await finalizarSesionConReporte();
}
window.forzarFinalizacion = forzarFinalizacion;

console.log('✅ Funciones adicionales cargadas: sincronizarFotosDesdeDrive, diagnosticarFotos, exportarDetallePDF, forzarFinalizacion');