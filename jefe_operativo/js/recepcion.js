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

// =====================================================
// 🔥 ESTADO DE SECCIONES - CORREGIDO
// =====================================================
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
// CONFIGURACIÓN DE FOTOS
// =====================================================
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
// PROCESAR FOTO - CORREGIDO
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
        const url = await subirFotoGoogleDrive(fileToUpload, codigoSesion || 'temp', foto.campo);
        
        // 🔥 GUARDAR EN SESIÓN DB
        await actualizarSesionFoto(foto.campo, url);
        
        if (uploadDiv) {
            uploadDiv.setAttribute('data-drive-url', url);
            uploadDiv.dataset.driveUrl = url;
            fotosSubidasLocal[foto.campo] = url;
        }
        
        actualizarProgresoFoto(foto.campo, 100, 'completed');
        validarCompletadoFotos();
        mostrarNotificacion(`✅ ${foto.label} subida y guardada`, 'success');
        
    } catch (error) {
        console.error('❌ Error:', error);
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
        mostrarNotificacion(`❌ Error en ${foto.label}: ${error.message}`, 'error');
    }
}

// =====================================================
// ACTUALIZAR FOTO EN SESIÓN DB
// =====================================================
async function actualizarSesionFoto(campo, url) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/actualizar-foto-sesion`, {
            method: 'POST',
            body: JSON.stringify({ 
                codigo_sesion: codigoSesion, 
                campo, 
                url,
                usuario_id: userInfo?.id,
                usuario_nombre: userInfo?.nombre
            })
        });
        const data = await response.json();
        if (data.success) {
            sesionActual = data.sesion;
            if (data.sesion.secciones_completadas) {
                seccionesCompletadasLocal.fotos = data.sesion.secciones_completadas.fotos || false;
                actualizarEstadoVisualSeccion('fotos', seccionesCompletadasLocal.fotos);
                actualizarBotonFinalizar();
            }
            console.log(`📸 Foto ${campo} guardada en DB`);
        }
    } catch (error) {
        console.error('❌ Error guardando foto en DB:', error);
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
    
    const completado = fotosConUrl === 7 || fotosConImagen === 7;
    
    const fotosBadge = document.getElementById('statusFotos');
    if (fotosBadge) {
        if (completado) {
            fotosBadge.textContent = '✅ Completado (7/7)';
            fotosBadge.classList.add('completado');
            fotosBadge.classList.remove('en-proceso');
        } else if (fotosConUrl > 0) {
            fotosBadge.textContent = `📸 ${fotosConUrl}/7 en Drive`;
            fotosBadge.classList.add('en-proceso');
            fotosBadge.classList.remove('completado');
        } else {
            fotosBadge.textContent = `📸 ${fotosConImagen}/7 fotos`;
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
// 🔥 GUARDAR SECCIÓN - VERSIÓN CORREGIDA
// =====================================================
async function guardarSeccion(seccion) {
    if (!codigoSesion) {
        mostrarNotificacion('⚠️ No hay sesión activa', 'warning');
        return;
    }

    const btnGuardar = document.querySelector(`.btn-guardar-seccion[data-seccion="${seccion}"]`);
    const indicator = document.getElementById(`guardado${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
    
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
        let datos = {};
        let seccionCompletada = false;

        switch(seccion) {
            case 'cliente':
                const nombre = document.getElementById('clienteNombre')?.value.trim() || '';
                const telefono = document.getElementById('clienteTelefono')?.value.trim() || '';
                const ubicacion = document.getElementById('clienteUbicacion')?.value.trim() || '';
                const latitud = document.getElementById('clienteLatitud')?.value || null;
                const longitud = document.getElementById('clienteLongitud')?.value || null;
                datos = { nombre, telefono, ubicacion, latitud, longitud };
                seccionCompletada = !!(nombre && telefono);
                break;

            case 'vehiculo':
                const placa = document.getElementById('vehiculoPlaca')?.value.trim().toUpperCase() || '';
                const marca = document.getElementById('vehiculoMarca')?.value.trim() || '';
                const modelo = document.getElementById('vehiculoModelo')?.value.trim() || '';
                const anio = parseInt(document.getElementById('vehiculoAnio')?.value) || null;
                const kilometraje = parseInt(document.getElementById('vehiculoKilometraje')?.value) || 0;
                datos = { placa, marca, modelo, anio, kilometraje };
                seccionCompletada = !!(placa && marca && modelo);
                break;

            case 'fotos':
                const fotosData = {};
                let fotosValidas = 0;
                for (const foto of FOTOS_CONFIG) {
                    const uploadDiv = document.getElementById(`upload-${foto.id}`);
                    let url = uploadDiv?.getAttribute('data-drive-url') || uploadDiv?.dataset?.driveUrl || null;
                    if (!url) url = fotosSubidasLocal[foto.campo] || null;
                    if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                        fotosData[foto.campo] = url;
                        fotosValidas++;
                    } else {
                        fotosData[foto.campo] = null;
                    }
                }
                datos = fotosData;
                seccionCompletada = fotosValidas === 7;
                break;

            case 'descripcion':
                const texto = document.getElementById('descripcionProblema')?.value.trim() || '';
                const audio_url = audioDriveUrl || null;
                datos = { texto, audio_url };
                seccionCompletada = !!(texto && texto.length > 0);
                break;
        }

        const response = await fetchWithToken(`${API_URL}/jefe-operativo/guardar-seccion`, {
            method: 'POST',
            body: JSON.stringify({
                codigo: codigoSesion,
                seccion: seccion,
                datos: datos,
                completada: seccionCompletada,
                usuario_id: userInfo?.id,
                usuario_nombre: userInfo?.nombre
            })
        });

        const data = await response.json();
        
        if (data.success) {
            sesionActual = data.sesion;
            seccionesCompletadasLocal[seccion] = data.completada;
            actualizarEstadoVisualSeccion(seccion, data.completada);
            
            if (seccion === 'fotos') {
                const fotos = data.sesion.datos?.fotos || {};
                const fotosValidas = Object.values(fotos).filter(v => v && v !== 'null' && v !== '').length;
                const fotosBadge = document.getElementById('statusFotos');
                if (fotosBadge) {
                    if (fotosValidas === 7) {
                        fotosBadge.textContent = '✅ Completado (7/7)';
                        fotosBadge.className = 'status-badge completado';
                    } else {
                        fotosBadge.textContent = `📸 ${fotosValidas}/7 fotos`;
                        fotosBadge.className = 'status-badge en-proceso';
                    }
                }
            }
            
            actualizarBotonFinalizar();
            
            if (indicator) {
                indicator.style.display = 'inline-flex';
                setTimeout(() => { indicator.style.display = 'none'; }, 3000);
            }
            
            mostrarNotificacion(`✅ ${seccion.charAt(0).toUpperCase() + seccion.slice(1)} guardado correctamente`, 'success');
            
        } else {
            throw new Error(data.error || 'Error al guardar');
        }

    } catch (error) {
        console.error('❌ Error guardando sección:', error);
        mostrarNotificacion(`❌ Error al guardar ${seccion}: ${error.message}`, 'error');
        
        const badge = document.getElementById(`status${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
        if (badge && !seccionesCompletadasLocal[seccion]) {
            badge.textContent = '○ Pendiente';
            badge.className = 'status-badge en-proceso';
        }
        
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = `<i class="fas fa-save"></i> Guardar ${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`;
        }
    }
}

// =====================================================
// ACTUALIZAR ESTADO VISUAL DE SECCIÓN
// =====================================================
function actualizarEstadoVisualSeccion(seccion, completada) {
    const badge = document.getElementById(`status${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
    if (badge) {
        if (completada) {
            badge.textContent = '✅ Completado';
            badge.className = 'status-badge completado';
        } else {
            badge.textContent = '○ Pendiente';
            badge.className = 'status-badge en-proceso';
        }
    }
}

// =====================================================
// 🔥 ACTUALIZAR BOTÓN FINALIZAR - CORREGIDO
// =====================================================
function actualizarBotonFinalizar() {
    const btnFinalizar = document.getElementById('btnFinalizar');
    if (!btnFinalizar) return;
    
    const todasCompletas = 
        seccionesCompletadasLocal.cliente &&
        seccionesCompletadasLocal.vehiculo &&
        seccionesCompletadasLocal.fotos &&
        seccionesCompletadasLocal.descripcion;
    
    btnFinalizar.disabled = !todasCompletas;
    btnFinalizar.title = todasCompletas 
        ? '✅ Todas las secciones completadas. Finalizar recepción.' 
        : '⚠️ Completa todas las secciones para finalizar';
    
    if (todasCompletas) {
        btnFinalizar.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        btnFinalizar.style.opacity = '1';
        btnFinalizar.style.cursor = 'pointer';
        btnFinalizar.innerHTML = '<i class="fas fa-check-circle"></i> ✅ Finalizar Recepción';
    } else {
        btnFinalizar.style.background = '#2C2C2E';
        btnFinalizar.style.opacity = '0.5';
        btnFinalizar.style.cursor = 'not-allowed';
        btnFinalizar.innerHTML = '<i class="fas fa-lock"></i> Completa todas las secciones';
    }
}

// =====================================================
// AUDIO
// =====================================================
function setupAudioRecording() {
    const btnGrabarAudio = document.getElementById('btnGrabarAudio');
    const btnEliminarAudio = document.getElementById('btnEliminarAudio');
    const audioStatus = document.getElementById('audioStatus');
    const audioPreview = document.getElementById('audioPreview');
    
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
            const audioPreview = document.getElementById('audioPreview');
            const audioStatus = document.getElementById('audioStatus');
            if (audioPreview) {
                audioPreview.src = URL.createObjectURL(audioBlob);
                audioPreview.style.display = 'block';
            }
            if (audioStatus) audioStatus.textContent = 'Subiendo audio...';
            try {
                const driveUrl = await subirAudioGoogleDrive(audioBlob, codigoSesion || 'temp');
                audioDriveUrl = driveUrl;
                if (audioStatus) audioStatus.textContent = 'Audio guardado en Drive';
                const btnEliminarAudio = document.getElementById('btnEliminarAudio');
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                mostrarNotificacion('✅ Audio subido', 'success');
                if (codigoSesion) await guardarSeccion('descripcion');
                validarCompletadoDescripcion();
            } catch (error) {
                if (audioStatus) audioStatus.textContent = 'Error al subir audio';
                mostrarNotificacion('Error subiendo audio', 'error');
            }
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        isRecording = true;
        const btnGrabarAudio = document.getElementById('btnGrabarAudio');
        if (btnGrabarAudio) {
            btnGrabarAudio.classList.add('recording');
            btnGrabarAudio.innerHTML = '<i class="fas fa-stop"></i> Detener';
        }
        const audioStatus = document.getElementById('audioStatus');
        if (audioStatus) audioStatus.textContent = 'Grabando...';
        const btnEliminarAudio = document.getElementById('btnEliminarAudio');
        if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    } catch (error) {
        const audioStatus = document.getElementById('audioStatus');
        if (audioStatus) audioStatus.textContent = 'Error: No se pudo acceder al micrófono';
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        const btnGrabarAudio = document.getElementById('btnGrabarAudio');
        if (btnGrabarAudio) {
            btnGrabarAudio.classList.remove('recording');
            btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        }
    }
}

function eliminarGrabacion() {
    audioBlob = null;
    audioChunks = [];
    audioDriveUrl = null;
    const audioPreview = document.getElementById('audioPreview');
    const audioStatus = document.getElementById('audioStatus');
    const btnEliminarAudio = document.getElementById('btnEliminarAudio');
    const btnGrabarAudio = document.getElementById('btnGrabarAudio');
    if (audioPreview) { audioPreview.src = ''; audioPreview.style.display = 'none'; }
    if (audioStatus) audioStatus.textContent = 'Grabación eliminada';
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    if (btnGrabarAudio) {
        btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        btnGrabarAudio.classList.remove('recording');
    }
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
    }
    return completada;
}

function validarCompletadoDescripcion() {
    const texto = document.getElementById('descripcionProblema')?.value?.trim();
    const completada = !!(texto && texto.length > 0);
    if (seccionesCompletadasLocal.descripcion !== completada) {
        seccionesCompletadasLocal.descripcion = completada;
        actualizarEstadoVisualSeccion('descripcion', completada);
        actualizarBotonFinalizar();
    }
    return completada;
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
    const sesionesActivasPanel = document.getElementById('sesionesActivasPanel');
    const sessionPanel = document.getElementById('sessionPanel');
    const colaboradoresPanel = document.getElementById('colaboradoresPanel');
    const recepcionForm = document.getElementById('recepcionForm');
    const codigoActivoSpan = document.getElementById('codigoActivo');
    
    if (sesionesActivasPanel) sesionesActivasPanel.style.display = 'none';
    if (sessionPanel) sessionPanel.style.display = 'flex';
    if (colaboradoresPanel) colaboradoresPanel.style.display = 'block';
    if (recepcionForm) recepcionForm.style.display = 'block';
    if (codigoActivoSpan) codigoActivoSpan.textContent = codigoSesion;
    cargarDatosSesionInicial();
    iniciarPollingSecciones();
    iniciarKeepAlive();
}

// =====================================================
// CARGAR DATOS INICIALES DE SESIÓN
// =====================================================
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
        
        // Cargar Cliente
        if (datos.cliente) {
            document.getElementById('clienteNombre').value = datos.cliente.nombre || '';
            document.getElementById('clienteTelefono').value = datos.cliente.telefono || '';
            document.getElementById('clienteUbicacion').value = datos.cliente.ubicacion || '';
            document.getElementById('clienteLatitud').value = datos.cliente.latitud || '';
            document.getElementById('clienteLongitud').value = datos.cliente.longitud || '';
            
            const completado = datos.cliente.nombre && datos.cliente.telefono;
            seccionesCompletadasLocal.cliente = completado;
            actualizarEstadoVisualSeccion('cliente', completado);
        }
        
        // Cargar Vehículo
        if (datos.vehiculo) {
            document.getElementById('vehiculoPlaca').value = datos.vehiculo.placa || '';
            document.getElementById('vehiculoMarca').value = datos.vehiculo.marca || '';
            document.getElementById('vehiculoModelo').value = datos.vehiculo.modelo || '';
            document.getElementById('vehiculoAnio').value = datos.vehiculo.anio || '';
            document.getElementById('vehiculoKilometraje').value = datos.vehiculo.kilometraje || '';
            
            const completado = datos.vehiculo.placa && datos.vehiculo.marca && datos.vehiculo.modelo;
            seccionesCompletadasLocal.vehiculo = completado;
            actualizarEstadoVisualSeccion('vehiculo', completado);
        }
        
        // Cargar Fotos
        if (datos.fotos) {
            let fotosCargadas = 0;
            for (const foto of FOTOS_CONFIG) {
                const url = datos.fotos[CAMPO_MAP[foto.campo]];
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
                        fotosCargadas++;
                    }
                }
            }
            seccionesCompletadasLocal.fotos = fotosCargadas === 7;
            validarCompletadoFotos();
        }
        
        // Cargar Descripción
        if (datos.descripcion) {
            document.getElementById('descripcionProblema').value = datos.descripcion.texto || '';
            if (datos.descripcion.audio_url) {
                audioDriveUrl = datos.descripcion.audio_url;
                const audioPreview = document.getElementById('audioPreview');
                if (audioPreview) {
                    audioPreview.src = audioDriveUrl;
                    audioPreview.style.display = 'block';
                }
                const btnEliminarAudio = document.getElementById('btnEliminarAudio');
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                const audioStatus = document.getElementById('audioStatus');
                if (audioStatus) audioStatus.textContent = 'Audio disponible';
            }
            const completado = datos.descripcion.texto && datos.descripcion.texto.trim().length > 0;
            seccionesCompletadasLocal.descripcion = completado;
            actualizarEstadoVisualSeccion('descripcion', completado);
        }
        
        actualizarBotonFinalizar();
        
    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        mostrarNotificacion('⚠️ Error cargando datos de sesión', 'error');
    }
}

// =====================================================
// 🔥 POLLING PARA SINCRONIZAR SECCIONES
// =====================================================
function iniciarPollingSecciones() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        if (!codigoSesion || actualizando) return;
        
        try {
            const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
            const data = await response.json();
            
            if (!data.sesion || data.sesion.estado === 'finalizada') {
                limpiarSesionCompleta();
                mostrarNotificacion('Sesión finalizada por otro usuario', 'info');
                return;
            }
            
            const sesion = data.sesion;
            const seccionesDB = sesion.secciones_completadas || {};
            let huboCambios = false;
            
            for (const [seccion, completada] of Object.entries(seccionesDB)) {
                if (seccionesCompletadasLocal[seccion] !== completada) {
                    seccionesCompletadasLocal[seccion] = completada;
                    actualizarEstadoVisualSeccion(seccion, completada);
                    huboCambios = true;
                }
            }
            
            // Sincronizar fotos
            const fotos = sesion.datos?.fotos || {};
            for (const foto of FOTOS_CONFIG) {
                const url = fotos[CAMPO_MAP[foto.campo]];
                if (url && url !== 'null' && url !== '' && url !== 'undefined') {
                    const uploadDiv = document.getElementById(`upload-${foto.id}`);
                    if (uploadDiv) {
                        const currentUrl = uploadDiv.getAttribute('data-drive-url');
                        if (currentUrl !== url) {
                            uploadDiv.setAttribute('data-drive-url', url);
                            uploadDiv.dataset.driveUrl = url;
                            fotosSubidasLocal[foto.campo] = url;
                            uploadDiv.classList.add('has-image');
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
                            huboCambios = true;
                        }
                    }
                }
            }
            
            if (huboCambios) {
                validarCompletadoFotos();
                actualizarBotonFinalizar();
            }
            
            sesionActual = sesion;
            
        } catch (error) {
            console.warn('⚠️ Error en polling:', error);
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

// =====================================================
// FINALIZAR SESIÓN
// =====================================================
async function finalizarSesionConReporte() {
    if (!codigoSesion) return;
    
    showProgress('Finalizando Recepción', 'Validando datos...');
    updateProgressBar(10);
    
    // 🔥 Guardar todas las secciones antes de finalizar
    await guardarSeccion('cliente');
    await guardarSeccion('vehiculo');
    await guardarSeccion('fotos');
    await guardarSeccion('descripcion');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 🔥 Recuperar la sesión actualizada
    try {
        const refreshResponse = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
        const refreshData = await refreshResponse.json();
        if (refreshData.sesion) {
            sesionActual = refreshData.sesion;
        }
    } catch (e) {
        console.warn('⚠️ Error refrescando sesión:', e);
    }
    
    validarCompletadoCliente();
    validarCompletadoVehiculo();
    validarCompletadoDescripcion();
    validarCompletadoFotos();
    
    if (!seccionesCompletadasLocal.cliente || !seccionesCompletadasLocal.vehiculo || 
        !seccionesCompletadasLocal.fotos || !seccionesCompletadasLocal.descripcion) {
        completeProgress(false);
        const faltantes = [];
        if (!seccionesCompletadasLocal.cliente) faltantes.push('Cliente');
        if (!seccionesCompletadasLocal.vehiculo) faltantes.push('Vehículo');
        if (!seccionesCompletadasLocal.fotos) faltantes.push('Fotos (7)');
        if (!seccionesCompletadasLocal.descripcion) faltantes.push('Descripción');
        mostrarNotificacion(`⚠️ Completa: ${faltantes.join(', ')}`, 'warning');
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
        
        const datosFinales = { ...sesionActual?.datos };
        datosFinales.fotos = sesionActual?.datos?.fotos || {};
        
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
            document.getElementById('sesionesActivasPanel').style.display = 'block';
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
    document.getElementById('sessionPanel').style.display = 'none';
    document.getElementById('colaboradoresPanel').style.display = 'none';
    document.getElementById('recepcionForm').style.display = 'none';
    document.getElementById('sesionesActivasPanel').style.display = 'block';
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
    const audioPreview = document.getElementById('audioPreview');
    const audioStatus = document.getElementById('audioStatus');
    const btnEliminarAudio = document.getElementById('btnEliminarAudio');
    const btnGrabarAudio = document.getElementById('btnGrabarAudio');
    if (audioPreview) { audioPreview.src = ''; audioPreview.style.display = 'none'; }
    if (audioStatus) audioStatus.textContent = '';
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    if (btnGrabarAudio) {
        btnGrabarAudio.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        btnGrabarAudio.classList.remove('recording');
    }
    ['Cliente', 'Vehiculo', 'Fotos', 'Descripcion'].forEach(seccion => {
        const badge = document.getElementById(`status${seccion}`);
        if (badge) { badge.textContent = '○ Pendiente'; badge.className = 'status-badge en-proceso'; }
    });
    actualizarBotonFinalizar();
}

// =====================================================
// SESIONES ACTIVAS
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
            const activas = data.sesiones.filter(s => s.estado === 'activa');
            renderSesionesActivas(activas);
            const sesionesCount = document.getElementById('sesionesCount');
            if (sesionesCount) sesionesCount.textContent = activas.length;
        }
    } catch (error) {
        const sesionesList = document.getElementById('sesionesList');
        if (sesionesList) sesionesList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar sesiones</p></div>';
    }
}

function renderSesionesActivas(sesiones) {
    const sesionesList = document.getElementById('sesionesList');
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
                document.getElementById('sesionesActivasPanel').style.display = 'block';
                document.getElementById('sesionesList').innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Actualizando...</p></div>';
                setTimeout(cargarSesionesActivas, 500);
            });
        } else {
            limpiarSesionCompleta();
            mostrarNotificacion('Recepción cancelada', 'success');
            document.getElementById('sesionesActivasPanel').style.display = 'block';
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
// MODALES
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

function mostrarModalDetalle(detalle) {
    // Implementación simplificada - expandir según necesidades
    const modal = document.getElementById('modalDetalleRecepcion');
    const body = document.getElementById('detalleRecepcionBody');
    if (!modal || !body) return;
    datosReporteFinal = detalle;
    body.innerHTML = `<div style="padding:20px;"><p>Detalle de la recepción ${detalle.codigo_unico}</p></div>`;
    modal.classList.add('show');
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
    datosReporteFinal = detalle;
    if (btnDescargar) {
        btnDescargar.style.display = 'inline-flex';
        btnDescargar.innerHTML = '<i class="fas fa-file-pdf"></i> 📥 Descargar PDF';
        btnDescargar.disabled = false;
        btnDescargar.onclick = descargarPDFFinal;
    }
    body.innerHTML = `<div style="text-align:center;padding:30px 20px;">
        <i class="fas fa-check-circle" style="font-size:48px;color:#10B981;margin-bottom:20px;"></i>
        <h3 style="color:white;margin-bottom:10px;">¡Recepción finalizada!</h3>
        <p style="color:#8E8E93;margin-bottom:20px;">Código: <strong style="color:#C1121F;font-size:20px;">${detalle.codigo_unico || 'OT-N/A'}</strong></p>
        <p style="color:#8E8E93;font-size:14px;">Haz clic en "Descargar PDF" para obtener el reporte.</p>
    </div>`;
}

async function cargarDatosOrdenCompleta(idOrden) {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/detalle-recepcion/${idOrden}`, { method: 'GET' });
        if (!response.ok) throw new Error('Error al cargar los datos');
        const data = await response.json();
        if (data.success && data.detalle) {
            datosReporteFinal = data.detalle;
            datosReporteFinal.id_orden = idOrden;
            return datosReporteFinal;
        }
        throw new Error(data.error || 'No se pudieron obtener los datos');
    } catch (error) { return null; }
}

// =====================================================
// DESCARGA DE PDF
// =====================================================
async function descargarPDFFinal() {
    if (descargandoPDF) { mostrarNotificacion('⏳ Ya se está generando el PDF...', 'warning'); return; }
    if (!datosReporteFinal) { mostrarNotificacion('⚠️ No hay datos para generar PDF', 'warning'); return; }
    descargandoPDF = true;
    mostrarNotificacion('📄 Generando PDF...', 'info');
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/generar-pdf-recepcion/${datosReporteFinal.id}`, { method: 'POST' });
        const data = await response.json();
        if (data.success && data.url) {
            window.open(data.url, '_blank');
            mostrarNotificacion('✅ PDF generado y descargado', 'success');
        } else {
            throw new Error(data.error || 'Error generando PDF');
        }
    } catch (error) {
        mostrarNotificacion('❌ Error al generar PDF', 'error');
    } finally { descargandoPDF = false; }
}

// =====================================================
// EVENTOS
// =====================================================
function setupEventListeners() {
    document.getElementById('btnCrearSesion')?.addEventListener('click', iniciarSesion);
    document.getElementById('btnCancelarSesion')?.addEventListener('click', mostrarConfirmacionCancelar);
    document.getElementById('btnFinalizar')?.addEventListener('click', finalizarSesionConReporte);
    document.getElementById('btnCopiarCodigoSesion')?.addEventListener('click', () => { if (codigoSesion) { navigator.clipboard.writeText(codigoSesion); mostrarNotificacion('Código copiado', 'success'); } });
    
    document.querySelectorAll('.btn-guardar-seccion').forEach(btn => {
        btn.addEventListener('click', () => {
            const seccion = btn.dataset.seccion;
            if (seccion && codigoSesion) guardarSeccion(seccion);
        });
    });
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
                if (codigoSesion) guardarSeccion('fotos');
                mostrarNotificacion(`📸 ${foto.label} eliminada`, 'info');
            });
        }
    }
}

function setupInputTracking() {
    ['clienteNombre', 'clienteTelefono'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', validarCompletadoCliente);
            input.addEventListener('blur', () => { if (codigoSesion) guardarSeccion('cliente'); });
        }
    });
    ['vehiculoPlaca', 'vehiculoMarca', 'vehiculoModelo'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', validarCompletadoVehiculo);
            input.addEventListener('blur', () => { if (codigoSesion) guardarSeccion('vehiculo'); });
        }
    });
    const descripcionProblema = document.getElementById('descripcionProblema');
    if (descripcionProblema) {
        descripcionProblema.addEventListener('input', validarCompletadoDescripcion);
        descripcionProblema.addEventListener('blur', () => { if (codigoSesion) guardarSeccion('descripcion'); });
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
                if (codigoSesion) { guardarSeccion('vehiculo'); guardarSeccion('cliente'); }
            }
        }
    } catch (error) {}
}

function setupModalUbicacionLeaflet() {
    // Placeholder para mapa - implementar según necesidades
}

function initProgressElements() {
    progressOverlay = document.getElementById('progressOverlay');
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
    const currentDateSpan = document.getElementById('currentDate');
    if (currentDateSpan) currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

// =====================================================
// FUNCIONES GLOBALES
// =====================================================
window.unirseSesionConCodigo = unirseSesionConCodigo;
window.finalizarSesionConReporte = finalizarSesionConReporte;
window.verDetalleRecepcion = verDetalleRecepcion;
window.cerrarModalOrden = () => document.getElementById('codigoOrdenModal')?.classList.remove('show');
window.cerrarModalDetalle = () => document.getElementById('modalDetalleRecepcion')?.classList.remove('show');
window.descargarPDFFinal = descargarPDFFinal;
window.mostrarReporteFinal = mostrarReporteFinal;
window.cargarDatosOrdenCompleta = cargarDatosOrdenCompleta;

window.logout = () => {
    detenerPolling();
    detenerKeepAlive();
    if (sesionesPolling) clearInterval(sesionesPolling);
    localStorage.clear();
    window.location.href = `${window.API_BASE_URL}/`;
};

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
    iniciarPollingSesiones();
    initRecepcionesPanel();
    
    // Recuperar sesión activa
    const sesionGuardada = localStorage.getItem('sesion_actual');
    if (sesionGuardada) {
        try {
            const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${sesionGuardada}`, { method: 'GET' });
            const data = await response.json();
            if (data.sesion && data.sesion.estado === 'activa') {
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
    
    console.log('✅ Recepción JS cargado correctamente');
});

// =====================================================
// FUNCIONES DE EDICIÓN Y ELIMINACIÓN (Placeholders)
// =====================================================
function editarRecepcion(id) {
    mostrarNotificacion('📝 Editando recepción ' + id, 'info');
}

function confirmarEliminarRecepcion(id) {
    if (confirm('¿Eliminar esta recepción? Esta acción no se puede deshacer.')) {
        fetchWithToken(`${API_URL}/jefe-operativo/eliminar-recepcion/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    mostrarNotificacion('✅ Recepción eliminada', 'success');
                    cargarRecepciones();
                } else {
                    mostrarNotificacion('❌ Error eliminando', 'error');
                }
            })
            .catch(() => mostrarNotificacion('❌ Error eliminando', 'error'));
    }
}

console.log('✅ recepcion.js cargado completamente');