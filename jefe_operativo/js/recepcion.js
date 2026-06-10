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
// CONFIGURACIÓN DE CLOUDINARY (para subida directa)
// =====================================================
const CLOUDINARY_CLOUD_NAME = 'drpt6ztkd';
const CLOUDINARY_UPLOAD_PRESET = 'furia_audio_unsigned';

// =====================================================
// CONFIGURACIÓN PRINCIPAL
// =====================================================
const API_URL = `${window.API_BASE_URL}/api`;

// Variables globales
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
let audioCloudinaryUrl = null;
let descripcionOriginal = '';
let recepcionesActuales = [];
let paginaActual = 1;
let itemsPorPagina = 10;

// Variables para Leaflet
let mapCliente = null;
let markerCliente = null;
let ubicacionTemporal = { texto: '', lat: null, lng: null };
let leafletInicializado = false;

// Estado de completado
let seccionesCompletadas = {
    cliente: false,
    vehiculo: false,
    fotos: false,
    descripcion: false
};

// Configuración de fotos
const FOTOS_CONFIG = [
    { id: 'fotoLateralIzq', campo: 'url_lateral_izquierda', label: 'Lateral Izquierdo', icono: 'fa-car-side' },
    { id: 'fotoLateralDer', campo: 'url_lateral_derecha', label: 'Lateral Derecho', icono: 'fa-car-side' },
    { id: 'fotoFrontal', campo: 'url_foto_frontal', label: 'Frontal', icono: 'fa-car' },
    { id: 'fotoTrasera', campo: 'url_foto_trasera', label: 'Trasera', icono: 'fa-car' },
    { id: 'fotoSuperior', campo: 'url_foto_superior', label: 'Superior', icono: 'fa-arrow-up' },
    { id: 'fotoInferior', campo: 'url_foto_inferior', label: 'Inferior', icono: 'fa-arrow-down' },
    { id: 'fotoTablero', campo: 'url_foto_tablero', label: 'Tablero', icono: 'fa-tachometer-alt' }
];

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
const btnCopiarCodigoSesion = document.getElementById('btnCopiarCodigoSesion');
const photoGrid = document.getElementById('photoGrid');
const btnGrabarAudio = document.getElementById('btnGrabarAudio');
const btnEliminarAudio = document.getElementById('btnEliminarAudio');
const audioStatus = document.getElementById('audioStatus');
const audioPreview = document.getElementById('audioPreview');
const descripcionProblema = document.getElementById('descripcionProblema');
const currentDateSpan = document.getElementById('currentDate');
const clienteUbicacionInput = document.getElementById('clienteUbicacion');
const clienteLatitudInput = document.getElementById('clienteLatitud');
const clienteLongitudInput = document.getElementById('clienteLongitud');
const btnAbrirModalUbicacion = document.getElementById('btnAbrirModalUbicacion');
const colaboradoresCountSpan = document.getElementById('colaboradoresCount');
const colaboradoresListDiv = document.getElementById('colaboradoresList');

// =====================================================
// FUNCIONES DE SUBIDA A CLOUDINARY (DESDE FRONTEND)
// =====================================================

async function subirFotoCloudinary(file, carpeta, campo) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'furia_motor_unsigned');
        formData.append('folder', `furia_motor/recepcion/${carpeta}`);
        
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
        
        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                console.log(`✅ Foto ${campo} subida:`, data.secure_url);
                resolve(data.secure_url);
            } else {
                reject(new Error(data.error?.message || 'Error subiendo foto'));
            }
        })
        .catch(reject);
    });
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
                console.log('✅ Audio subido:', data.secure_url);
                resolve(data.secure_url);
            } else {
                reject(new Error(data.error?.message || 'Error subiendo audio'));
            }
        })
        .catch(reject);
    });
}

// =====================================================
// FUNCIÓN PARA PETICIONES CON TOKEN
// =====================================================
async function fetchWithToken(url, options = {}) {
    const token = localStorage.getItem('furia_token');
    if (!token) throw new Error('No hay token');
    
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });
    
    if (response.status === 401) {
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
    const todasCompletas = seccionesCompletadas.cliente && seccionesCompletadas.vehiculo && 
                           seccionesCompletadas.fotos && seccionesCompletadas.descripcion;
    btnFinalizar.disabled = !todasCompletas;
}

// =====================================================
// VALIDACIONES EN TIEMPO REAL
// =====================================================
function validarCliente() {
    const nombre = document.getElementById('clienteNombre')?.value.trim();
    const telefono = document.getElementById('clienteTelefono')?.value.trim();
    const completado = !!(nombre && telefono);
    
    if (seccionesCompletadas.cliente !== completado) {
        seccionesCompletadas.cliente = completado;
        const badge = document.getElementById('statusCliente');
        if (badge) {
            badge.textContent = completado ? '✓ Completado' : '○ Pendiente';
            badge.classList.toggle('completado', completado);
        }
        actualizarBotonFinalizar();
        
        if (completado && codigoSesion && !camposEnEdicion.cliente) {
            guardarSeccion('cliente');
        }
    }
    return completado;
}

function validarVehiculo() {
    const placa = document.getElementById('vehiculoPlaca')?.value.trim();
    const marca = document.getElementById('vehiculoMarca')?.value.trim();
    const modelo = document.getElementById('vehiculoModelo')?.value.trim();
    const completado = !!(placa && marca && modelo);
    
    if (seccionesCompletadas.vehiculo !== completado) {
        seccionesCompletadas.vehiculo = completado;
        const badge = document.getElementById('statusVehiculo');
        if (badge) {
            badge.textContent = completado ? '✓ Completado' : '○ Pendiente';
            badge.classList.toggle('completado', completado);
        }
        actualizarBotonFinalizar();
        
        if (completado && codigoSesion && !camposEnEdicion.vehiculo) {
            guardarSeccion('vehiculo');
        }
    }
    return completado;
}

function validarFotos() {
    let fotosCargadas = 0;
    for (const foto of FOTOS_CONFIG) {
        const uploadDiv = document.getElementById(`upload-${foto.id}`);
        if (uploadDiv && uploadDiv.classList.contains('has-image')) {
            fotosCargadas++;
        }
    }
    const completado = fotosCargadas === 7;
    
    if (seccionesCompletadas.fotos !== completado) {
        seccionesCompletadas.fotos = completado;
        const badge = document.getElementById('statusFotos');
        if (badge) {
            badge.textContent = completado ? '✓ Completado' : `○ ${fotosCargadas}/7 fotos`;
            badge.classList.toggle('completado', completado);
        }
        actualizarBotonFinalizar();
    }
    return completado;
}

function validarDescripcion() {
    const texto = descripcionProblema?.value?.trim();
    const completado = !!(texto && texto.length > 0);
    
    if (seccionesCompletadas.descripcion !== completado) {
        seccionesCompletadas.descripcion = completado;
        const badge = document.getElementById('statusDescripcion');
        if (badge) {
            badge.textContent = completado ? '✓ Completado' : '○ Pendiente';
            badge.classList.toggle('completado', completado);
        }
        actualizarBotonFinalizar();
    }
    return completado;
}

// =====================================================
// FUNCIONES DE UI
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

async function procesarFoto(input, foto) {
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
        
        // Subir directamente a Cloudinary
        mostrarNotificacion(`Subiendo ${foto.label}...`, 'info');
        try {
            const url = await subirFotoCloudinary(file, codigoSesion, foto.campo);
            uploadDiv.dataset.cloudinaryUrl = url;
            mostrarNotificacion(`✅ ${foto.label} subida`, 'success');
            validarFotos();
            
            if (codigoSesion && seccionesCompletadas.fotos) {
                await guardarSeccion('fotos');
            }
        } catch (error) {
            console.error('Error subiendo foto:', error);
            mostrarNotificacion(`Error al subir ${foto.label}`, 'error');
            preview.style.backgroundImage = '';
            uploadDiv.classList.remove('has-image');
            if (removeBtn) removeBtn.style.display = 'none';
        }
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
                if (uploadDiv.dataset.objectUrl) {
                    URL.revokeObjectURL(uploadDiv.dataset.objectUrl);
                    delete uploadDiv.dataset.objectUrl;
                }
                validarFotos();
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
            audioStatus.textContent = 'Audio grabado - Guardando...';
            
            // Subir directamente a Cloudinary
            mostrarNotificacion('Subiendo audio...', 'info');
            try {
                const cloudinaryUrl = await subirAudioCloudinary(audioBlob, codigoSesion);
                audioCloudinaryUrl = cloudinaryUrl;
                audioStatus.textContent = 'Audio guardado';
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                mostrarNotificacion('✅ Audio subido', 'success');
                
                if (codigoSesion && descripcionProblema.value.trim()) {
                    await guardarSeccion('descripcion');
                }
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
        btnGrabarAudio.innerHTML = '<i class="fas fa-stop"></i> Detener';
        audioStatus.textContent = 'Grabando...';
        if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
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
    audioCloudinaryUrl = null;
    if (audioPreview) {
        if (audioPreview.src?.startsWith('blob:')) URL.revokeObjectURL(audioPreview.src);
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
            body: JSON.stringify({ codigo: codigoSesion, seccion, datos })
        });
        
        const data = await response.json();
        if (data.success) {
            sesionActual = data.sesion;
            if (data.sesion.secciones_completadas) {
                seccionesCompletadas = { ...data.sesion.secciones_completadas };
                actualizarBotonFinalizar();
            }
            
            const guardadoSpan = document.getElementById(`guardado${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
            if (guardadoSpan) {
                guardadoSpan.style.display = 'flex';
                setTimeout(() => guardadoSpan.style.display = 'none', 1500);
            }
        }
    } catch (error) {
        console.error('Error guardando:', error);
        mostrarNotificacion('Error al guardar', 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = `<i class="fas fa-save"></i> Guardar`;
        }
    }
}

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
        const userRaw = localStorage.getItem('furia_user');
        userInfo = JSON.parse(userRaw || '{}');
        
        const response = await fetch(`${window.API_BASE_URL}/api/verify-token`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Token inválido');
        
        const data = await response.json();
        if (data.user) {
            userInfo = data.user;
            localStorage.setItem('furia_user', JSON.stringify(userInfo));
        }
        
        const tieneRol = userInfo.roles?.includes('jefe_operativo') || userInfo.rol === 'jefe_operativo';
        if (!tieneRol) {
            window.location.href = `${window.API_BASE_URL}/`;
            return false;
        }
        
        return true;
    } catch (error) {
        localStorage.clear();
        window.location.href = `${window.API_BASE_URL}/`;
        return false;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Iniciando Recepción');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    // Fecha actual
    if (currentDateSpan) {
        currentDateSpan.textContent = new Date().toLocaleDateString('es-ES', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
    
    generatePhotoUploads();
    setupPhotoUploads();
    setupAudioRecording();
    
    // Event listeners
    btnCrearSesion?.addEventListener('click', iniciarSesion);
    btnCancelarSesion?.addEventListener('click', mostrarConfirmacionCancelar);
    btnFinalizar?.addEventListener('click', finalizarSesion);
    btnCopiarCodigoSesion?.addEventListener('click', () => {
        if (codigoSesion) {
            navigator.clipboard.writeText(codigoSesion);
            mostrarNotificacion('Código copiado', 'success');
        }
    });
    
    document.querySelectorAll('.btn-guardar-seccion').forEach(btn => {
        btn.addEventListener('click', () => {
            const seccion = btn.dataset.seccion;
            if (seccion && codigoSesion) {
                guardarSeccion(seccion);
                mostrarNotificacion(`Guardando ${seccion}...`, 'info');
            }
        });
    });
    
    // Input tracking para validación en tiempo real
    const clienteInputs = ['clienteNombre', 'clienteTelefono'];
    clienteInputs.forEach(id => {
        const input = document.getElementById(id);
        input?.addEventListener('input', () => validarCliente());
        input?.addEventListener('blur', () => { if (codigoSesion) guardarSeccion('cliente'); });
    });
    
    const vehiculoInputs = ['vehiculoPlaca', 'vehiculoMarca', 'vehiculoModelo'];
    vehiculoInputs.forEach(id => {
        const input = document.getElementById(id);
        input?.addEventListener('input', () => validarVehiculo());
        input?.addEventListener('blur', () => { if (codigoSesion) guardarSeccion('vehiculo'); });
    });
    
    descripcionProblema?.addEventListener('input', () => validarDescripcion());
    descripcionProblema?.addEventListener('blur', () => { if (codigoSesion) guardarSeccion('descripcion'); });
    
    // Mapa
    setupModalUbicacionLeaflet();
    
    // Recuperar sesión activa
    await recuperarSesionActiva();
    
    // Iniciar polling
    iniciarPollingSesiones();
    await cargarRecepciones();
});

// =====================================================
// SESIONES
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
    sesionesActivasPanel.style.display = 'none';
    sessionPanel.style.display = 'flex';
    colaboradoresPanel.style.display = 'block';
    recepcionForm.style.display = 'block';
    codigoActivoSpan.textContent = codigoSesion;
    
    cargarDatosSesion();
    iniciarPolling();
    iniciarKeepAlive();
}

async function cargarDatosSesion() {
    if (!codigoSesion) return;
    
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/obtener-sesion/${codigoSesion}`, { method: 'GET' });
        const data = await response.json();
        
        if (!data.sesion || data.sesion.estado === 'finalizada') {
            limpiarSesionCompleta();
            return;
        }
        
        sesionActual = data.sesion;
        const d = sesionActual.datos;
        
        // Cargar cliente
        if (d.cliente) {
            document.getElementById('clienteNombre').value = d.cliente.nombre || '';
            document.getElementById('clienteTelefono').value = d.cliente.telefono || '';
            document.getElementById('clienteUbicacion').value = d.cliente.ubicacion || '';
            document.getElementById('clienteLatitud').value = d.cliente.latitud || '';
            document.getElementById('clienteLongitud').value = d.cliente.longitud || '';
            validarCliente();
        }
        
        // Cargar vehículo
        if (d.vehiculo) {
            document.getElementById('vehiculoPlaca').value = d.vehiculo.placa || '';
            document.getElementById('vehiculoMarca').value = d.vehiculo.marca || '';
            document.getElementById('vehiculoModelo').value = d.vehiculo.modelo || '';
            document.getElementById('vehiculoAnio').value = d.vehiculo.anio || '';
            document.getElementById('vehiculoKilometraje').value = d.vehiculo.kilometraje || '';
            validarVehiculo();
        }
        
        // Cargar fotos
        if (d.fotos) {
            for (const foto of FOTOS_CONFIG) {
                const url = d.fotos[foto.campo];
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
            validarFotos();
        }
        
        // Cargar descripción
        if (d.descripcion) {
            descripcionProblema.value = d.descripcion.texto || '';
            if (d.descripcion.audio_url) {
                audioCloudinaryUrl = d.descripcion.audio_url;
                audioPreview.src = audioCloudinaryUrl;
                audioPreview.style.display = 'block';
                if (btnEliminarAudio) btnEliminarAudio.style.display = 'flex';
                audioStatus.textContent = 'Audio disponible';
            }
            validarDescripcion();
        }
        
        // Colaboradores
        if (sesionActual.colaboradores_nombres) {
            const count = sesionActual.colaboradores_nombres.length;
            colaboradoresCountSpan.textContent = count;
            colaboradoresListDiv.innerHTML = sesionActual.colaboradores_nombres.map(n => 
                `<div class="colaborador"><i class="fas fa-user"></i><span>${escapeHtml(n)}</span>${n === userInfo?.nombre ? ' (Tú)' : ''}</div>`
            ).join('');
        }
        
        if (sesionActual.secciones_completadas) {
            seccionesCompletadas = { ...sesionActual.secciones_completadas };
            actualizarBotonFinalizar();
        }
        
    } catch (error) {
        console.error('Error cargando sesión:', error);
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
    
    if (!seccionesCompletadas.cliente || !seccionesCompletadas.vehiculo || 
        !seccionesCompletadas.fotos || !seccionesCompletadas.descripcion) {
        mostrarNotificacion('Completa todas las secciones', 'warning');
        return;
    }
    
    if (!confirm('¿Finalizar recepción?')) return;
    
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
            sesionesActivasPanel.style.display = 'block';
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
    seccionesCompletadas = { cliente: false, vehiculo: false, fotos: false, descripcion: false };
    localStorage.removeItem('sesion_actual');
    
    sessionPanel.style.display = 'none';
    colaboradoresPanel.style.display = 'none';
    recepcionForm.style.display = 'none';
    
    // Limpiar formulario
    const inputs = document.querySelectorAll('#recepcionForm input, #recepcionForm textarea');
    inputs.forEach(input => { if (input.id !== 'clienteLatitud' && input.id !== 'clienteLongitud') input.value = ''; });
    
    document.querySelectorAll('.photo-upload').forEach(upload => {
        upload.classList.remove('has-image');
        const preview = upload.querySelector('.upload-preview');
        if (preview) preview.style.backgroundImage = '';
        const removeBtn = upload.querySelector('.remove-photo');
        if (removeBtn) removeBtn.style.display = 'none';
        delete upload.dataset.cloudinaryUrl;
    });
    
    if (audioPreview) {
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (btnEliminarAudio) btnEliminarAudio.style.display = 'none';
    
    actualizarBotonFinalizar();
}

function mostrarConfirmacionCancelar() {
    if (confirm('¿Cancelar recepción? Se perderán los datos.')) {
        if (codigoSesion) {
            fetchWithToken(`${API_URL}/jefe-operativo/cancelar-sesion`, {
                method: 'DELETE',
                body: JSON.stringify({ codigo: codigoSesion })
            }).catch(console.error);
        }
        limpiarSesionCompleta();
        mostrarNotificacion('Recepción cancelada', 'success');
        sesionesActivasPanel.style.display = 'block';
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
        if (data.sesiones) renderSesionesActivas(data.sesiones);
    } catch (error) {}
}

function renderSesionesActivas(sesiones) {
    if (!sesionesList) return;
    const activas = sesiones.filter(s => s.estado === 'activa');
    sesionesCount.textContent = activas.length;
    
    if (activas.length === 0) {
        sesionesList.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No hay sesiones activas</p></div>';
        return;
    }
    
    sesionesList.innerHTML = activas.map(s => `
        <div class="sesion-item ${codigoSesion === s.codigo ? 'active' : ''}">
            <div class="sesion-info">
                <span class="sesion-codigo">${s.codigo}</span>
                <span class="sesion-creador">${escapeHtml(s.creador_nombre)}</span>
            </div>
            <div class="sesion-actions">
                ${codigoSesion !== s.codigo && s.colaboradores?.length < 2 ? 
                    `<button class="btn-unirse-sesion" onclick="unirseSesion('${s.codigo}')">Unirse</button>` : ''}
            </div>
        </div>
    `).join('');
}

async function unirseSesion(codigo) {
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
            mostrarNotificacion(`Te has unido a ${codigo}`, 'success');
        }
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        if (codigoSesion && !camposEnEdicion.cliente && !camposEnEdicion.vehiculo && !camposEnEdicion.descripcion) {
            cargarDatosSesion();
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

// =====================================================
// RECEPCIONES GUARDADAS
// =====================================================
async function cargarRecepciones() {
    try {
        const response = await fetchWithToken(`${API_URL}/jefe-operativo/listar-recepciones`, { method: 'GET' });
        const data = await response.json();
        if (data.recepciones) {
            recepcionesActuales = data.recepciones;
            const countSpan = document.getElementById('recepcionesCount');
            if (countSpan) countSpan.textContent = recepcionesActuales.length;
            filtrarYMostrarRecepciones();
        }
    } catch (error) {
        console.error('Error cargando recepciones:', error);
    }
}

function filtrarYMostrarRecepciones() {
    const listDiv = document.getElementById('recepcionesList');
    if (!listDiv) return;
    
    if (recepcionesActuales.length === 0) {
        listDiv.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>No hay recepciones</p></div>';
        return;
    }
    
    listDiv.innerHTML = recepcionesActuales.slice(0, 10).map(rec => `
        <div class="recepcion-card">
            <div class="recepcion-header">
                <span class="recepcion-codigo">${rec.codigo_unico || 'N/A'}</span>
                <span class="recepcion-estado">${rec.estado_global || 'En Recepción'}</span>
                <span class="recepcion-fecha">${new Date(rec.fecha_ingreso).toLocaleDateString()}</span>
            </div>
            <div class="recepcion-info">
                <div><strong>Cliente:</strong> ${escapeHtml(rec.cliente_nombre || 'N/A')}</div>
                <div><strong>Vehículo:</strong> ${escapeHtml(rec.marca || '')} ${escapeHtml(rec.modelo || '')} (${rec.placa || 'N/A'})</div>
            </div>
        </div>
    `).join('');
}

// =====================================================
// LEAFLET - MAPA
// =====================================================
function setupModalUbicacionLeaflet() {
    if (!btnAbrirModalUbicacion) return;
    
    btnAbrirModalUbicacion.addEventListener('click', () => {
        if (!leafletInicializado) {
            initLeafletMap();
        }
        abrirModalLeaflet();
    });
}

function initLeafletMap() {
    if (leafletInicializado) return;
    
    const mapContainer = document.getElementById('leafletMapa');
    if (!mapContainer) return;
    
    mapCliente = L.map(mapContainer).setView([TALLER_LAT, TALLER_LNG], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapCliente);
    
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
    } catch {
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
    
    if (mapCliente) mapCliente.invalidateSize();
    modal.classList.add('show');
}

function confirmarUbicacionLeaflet() {
    if (!ubicacionTemporal.texto || !ubicacionTemporal.lat) {
        mostrarNotificacion('Selecciona una ubicación en el mapa', 'warning');
        return;
    }
    
    clienteUbicacionInput.value = ubicacionTemporal.texto;
    clienteLatitudInput.value = ubicacionTemporal.lat;
    clienteLongitudInput.value = ubicacionTemporal.lng;
    
    cerrarModalLeaflet();
    validarCliente();
    
    if (codigoSesion) {
        guardarSeccion('cliente');
        mostrarNotificacion('Ubicación guardada', 'success');
    }
}

function cerrarModalLeaflet() {
    const modal = document.getElementById('modalUbicacionLeaflet');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// UTILIDADES
// =====================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    toast.innerHTML = `<span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

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

window.cerrarModal = () => document.getElementById('codigoModal')?.classList.remove('show');
window.cerrarModalOrden = () => document.getElementById('codigoOrdenModal')?.classList.remove('show');
window.confirmarUbicacionLeaflet = confirmarUbicacionLeaflet;
window.cerrarModalLeaflet = cerrarModalLeaflet;
window.buscarYMostrarLeaflet = async () => {
    const query = document.getElementById('modalBuscarUbicacionLeaflet')?.value;
    if (!query) return;
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const data = await response.json();
        if (data[0]) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            if (mapCliente) {
                mapCliente.setView([lat, lng], 15);
                markerCliente.setLatLng([lat, lng]);
                const direccion = await obtenerDireccion(lat, lng);
                ubicacionTemporal = { texto: direccion, lat, lng };
                actualizarInfoUbicacion();
            }
        }
    } catch (error) {
        console.error('Error buscando:', error);
    }
};
window.unirseSesion = unirseSesion;
window.logout = () => {
    detenerPolling();
    detenerKeepAlive();
    if (sesionesPolling) clearInterval(sesionesPolling);
    localStorage.clear();
    window.location.href = `${window.API_BASE_URL}/`;
};

console.log('✅ recepcion.js cargado');