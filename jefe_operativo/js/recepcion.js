// =====================================================
// CONFIGURACIÓN
// =====================================================
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const photoGrid = document.getElementById('photoGrid');
const form = document.getElementById('recepcionForm');
const btnGenerar = document.getElementById('btnGenerar');
const btnGrabarAudio = document.getElementById('btnGrabarAudio');
const audioStatus = document.getElementById('audioStatus');
const audioPreview = document.getElementById('audioPreview');
const codigoModal = document.getElementById('codigoModal');
const codigoGenerado = document.getElementById('codigoGenerado');
const qrContainer = document.getElementById('qrContainer');
const resumenDatos = document.getElementById('resumenDatos');
const currentDateSpan = document.getElementById('currentDate');

// Variables para manejo de fotos y audio
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioBlob = null;

// Configuración de las 6 fotos requeridas (según tu tabla Recepcion)
const FOTOS_CONFIG = [
    { id: 'fotoLateralIzq', nombre: 'lateral_izquierdo', label: 'Lateral Izquierdo', icono: 'fa-car-side', campo: 'url_lateral_izquierda' },
    { id: 'fotoLateralDer', nombre: 'lateral_derecho', label: 'Lateral Derecho', icono: 'fa-car-side', campo: 'url_lateral_derecha' },
    { id: 'fotoFrontal', nombre: 'frontal', label: 'Frontal', icono: 'fa-car', campo: 'url_foto_frontal' },
    { id: 'fotoTrasera', nombre: 'trasera', label: 'Trasera', icono: 'fa-car', campo: 'url_foto_trasera' },
    { id: 'fotoSuperior', nombre: 'superior', label: 'Superior', icono: 'fa-arrow-up', campo: 'url_foto_superior' },
    { id: 'fotoInferior', nombre: 'inferior', label: 'Inferior', icono: 'fa-arrow-down', campo: 'url_foto_inferior' }
    // Nota: falta url_foto_tablero en tu configuración? La agregamos
];

// Añadimos la foto del tablero si es necesaria (son 7 en tu tabla)
const FOTOS_CONFIG_COMPLETO = [
    ...FOTOS_CONFIG,
    { id: 'fotoTablero', nombre: 'tablero', label: 'Tablero', icono: 'fa-tachometer-alt', campo: 'url_foto_tablero' }
];

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    generatePhotoUploads();
    setupPhotoUploads();
    setupAudioRecording();
    setupFormSubmit();
    setupPlacaValidation();
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || user.rol !== 'jefe_operativo') {
        window.location.href = '/';
        return false;
    }
    return true;
}

// Inicializar página
function initPage() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    if (currentDateSpan) {
        currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

// =====================================================
// GENERACIÓN DE CAMPOS DE FOTO
// =====================================================
function generatePhotoUploads() {
    if (!photoGrid) return;
    
    photoGrid.innerHTML = FOTOS_CONFIG_COMPLETO.map(foto => `
        <div class="photo-upload" id="upload-${foto.id}" data-campo="${foto.campo}">
            <input type="file" id="${foto.id}" accept="image/*" capture="environment">
            <div class="upload-placeholder">
                <i class="fas ${foto.icono}"></i>
                <span>${foto.label}</span>
            </div>
            <div class="upload-preview"></div>
            <button type="button" class="remove-photo" style="display: none;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// =====================================================
// MANEJO DE FOTOS
// =====================================================
function setupPhotoUploads() {
    const photoUploads = document.querySelectorAll('.photo-upload');
    
    photoUploads.forEach(upload => {
        const input = upload.querySelector('input[type="file"]');
        const preview = upload.querySelector('.upload-preview');
        const removeBtn = upload.querySelector('.remove-photo');
        
        // Manejar cambio de archivo
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Validar tamaño (máx 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    alert('La imagen no debe superar los 5MB');
                    input.value = '';
                    return;
                }
                
                // Validar tipo
                if (!file.type.startsWith('image/')) {
                    alert('Solo se permiten archivos de imagen');
                    input.value = '';
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.style.backgroundImage = `url('${e.target.result}')`;
                    upload.classList.add('has-image');
                };
                reader.readAsDataURL(file);
            }
        });
        
        // Manejar clic en el botón de eliminar
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            input.value = '';
            preview.style.backgroundImage = '';
            upload.classList.remove('has-image');
        });
        
        // Prevenir que el clic en el botón de eliminar abra el file dialog
        removeBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
    });
}

// Obtener todas las fotos como base64
async function getFotos() {
    const fotos = {};
    
    for (const foto of FOTOS_CONFIG_COMPLETO) {
        const input = document.getElementById(foto.id);
        if (input && input.files && input.files[0]) {
            fotos[foto.campo] = await fileToBase64(input.files[0]);
        } else {
            fotos[foto.campo] = null;
        }
    }
    
    return fotos;
}

// Convertir archivo a base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Validar que todas las fotos estén cargadas
function validarFotosCompletas() {
    const photoUploads = document.querySelectorAll('.photo-upload');
    let todasCompletas = true;
    let faltantes = [];
    
    photoUploads.forEach(upload => {
        const hasImage = upload.classList.contains('has-image');
        const label = upload.querySelector('.upload-placeholder span').textContent;
        
        if (!hasImage) {
            todasCompletas = false;
            faltantes.push(label);
        }
    });
    
    if (!todasCompletas) {
        console.log('Fotos faltantes:', faltantes);
    }
    
    return todasCompletas;
}

// =====================================================
// GRABACIÓN DE AUDIO
// =====================================================
function setupAudioRecording() {
    if (!btnGrabarAudio) return;
    
    btnGrabarAudio.addEventListener('click', async () => {
        if (!isRecording) {
            await startRecording();
        } else {
            stopRecording();
        }
    });
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        audioBlob = null;
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            audioPreview.src = audioUrl;
            audioPreview.style.display = 'block';
            audioStatus.textContent = 'Audio grabado correctamente';
            audioStatus.style.color = 'var(--verde-exito)';
            
            // Detener todas las pistas del stream
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        btnGrabarAudio.classList.add('recording');
        btnGrabarAudio.innerHTML = '<i class="fas fa-stop"></i> Detener Grabación';
        audioStatus.textContent = 'Grabando...';
        audioStatus.style.color = 'var(--rojo-acento)';
        
    } catch (error) {
        console.error('Error al acceder al micrófono:', error);
        audioStatus.textContent = 'Error: No se pudo acceder al micrófono';
        audioStatus.style.color = 'var(--rojo-acento)';
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

// Obtener audio como base64
async function getAudioBase64() {
    if (!audioBlob) return null;
    
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(audioBlob);
    });
}

// =====================================================
// VALIDACIÓN DE PLACA
// =====================================================
function setupPlacaValidation() {
    const placaInput = document.getElementById('vehiculoPlaca');
    if (!placaInput) return;
    
    let timeoutId;
    
    placaInput.addEventListener('input', (e) => {
        clearTimeout(timeoutId);
        const placa = e.target.value.toUpperCase();
        e.target.value = placa;
        
        if (placa.length >= 3) {
            timeoutId = setTimeout(() => verificarPlacaExistente(placa), 500);
        }
    });
}

async function verificarPlacaExistente(placa) {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/verificar-placa/${placa}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.exists) {
            // Mostrar sugerencia
            const mensaje = `La placa ${placa} ya está registrada para ${data.vehiculo.cliente} (${data.vehiculo.marca} ${data.vehiculo.modelo})`;
            
            // Crear toast de notificación
            mostrarNotificacion(mensaje, 'info');
            
            // Autocompletar datos básicos si se desea
            if (confirm('¿Desea cargar los datos de este vehículo?')) {
                document.getElementById('vehiculoMarca').value = data.vehiculo.marca || '';
                document.getElementById('vehiculoModelo').value = data.vehiculo.modelo || '';
                document.getElementById('clienteNombre').value = data.vehiculo.cliente || '';
            }
        }
    } catch (error) {
        console.error('Error verificando placa:', error);
    }
}

// =====================================================
// ENVÍO DEL FORMULARIO
// =====================================================
function setupFormSubmit() {
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Validar campos requeridos
        if (!validarCamposRequeridos()) return;
        
        // Validar que todas las fotos estén cargadas
        if (!validarFotosCompletas()) {
            mostrarNotificacion('Por favor, complete todas las 7 fotografías requeridas', 'warning');
            return;
        }
        
        // Deshabilitar botón mientras se procesa
        setLoadingState(true);
        
        try {
            // Recopilar datos del formulario
            const formData = {
                cliente: {
                    nombre: document.getElementById('clienteNombre').value,
                    telefono: document.getElementById('clienteTelefono').value,
                    ubicacion: document.getElementById('clienteUbicacion').value
                },
                vehiculo: {
                    placa: document.getElementById('vehiculoPlaca').value.toUpperCase(),
                    marca: document.getElementById('vehiculoMarca').value,
                    modelo: document.getElementById('vehiculoModelo').value,
                    anio: parseInt(document.getElementById('vehiculoAnio').value) || null,
                    kilometraje: parseInt(document.getElementById('vehiculoKilometraje').value) || 0
                },
                descripcion: document.getElementById('descripcionProblema').value,
                fotos: await getFotos(),
                audio: await getAudioBase64()
            };
            
            // Enviar a la API
            const response = await fetch(`${API_URL}/jefe-operativo/recepcion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Error al registrar el vehículo');
            }
            
            // Mostrar modal con código generado
            mostrarCodigoGenerado(data.codigo, formData);
            
            // Limpiar formulario
            limpiarFormulario();
            
        } catch (error) {
            console.error('Error al procesar el formulario:', error);
            mostrarNotificacion(error.message || 'Error al procesar el formulario', 'error');
        } finally {
            setLoadingState(false);
        }
    });
}

// Validar campos requeridos del formulario
function validarCamposRequeridos() {
    const campos = [
        { id: 'clienteNombre', nombre: 'Nombre del cliente' },
        { id: 'clienteTelefono', nombre: 'Teléfono' },
        { id: 'vehiculoPlaca', nombre: 'Placa' },
        { id: 'vehiculoMarca', nombre: 'Marca' },
        { id: 'vehiculoModelo', nombre: 'Modelo' },
        { id: 'vehiculoAnio', nombre: 'Año' },
        { id: 'vehiculoKilometraje', nombre: 'Kilometraje' }
    ];
    
    for (const campo of campos) {
        const input = document.getElementById(campo.id);
        if (!input || !input.value.trim()) {
            mostrarNotificacion(`El campo ${campo.nombre} es requerido`, 'warning');
            if (input) input.focus();
            return false;
        }
    }
    
    return true;
}

// Estado de carga del botón
function setLoadingState(loading) {
    if (!btnGenerar) return;
    
    if (loading) {
        btnGenerar.disabled = true;
        btnGenerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    } else {
        btnGenerar.disabled = false;
        btnGenerar.innerHTML = '<i class="fas fa-qrcode"></i> Generar Código de Trabajo';
    }
}

// Limpiar formulario después del envío exitoso
function limpiarFormulario() {
    // Limpiar inputs de texto
    const inputs = form.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"], textarea');
    inputs.forEach(input => {
        if (input.id !== 'vehiculoPlaca') { // Mantener la placa como referencia
            input.value = '';
        }
    });
    
    // Limpiar fotos
    const photoUploads = document.querySelectorAll('.photo-upload');
    photoUploads.forEach(upload => {
        const input = upload.querySelector('input[type="file"]');
        const preview = upload.querySelector('.upload-preview');
        if (input) input.value = '';
        if (preview) preview.style.backgroundImage = '';
        upload.classList.remove('has-image');
    });
    
    // Limpiar audio
    audioChunks = [];
    audioBlob = null;
    if (audioPreview) {
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (audioStatus) {
        audioStatus.textContent = '';
    }
}

// =====================================================
// MODAL DE CÓDIGO GENERADO
// =====================================================
function mostrarCodigoGenerado(codigo, datos) {
    if (!codigoGenerado || !qrContainer || !resumenDatos) return;
    
    codigoGenerado.textContent = codigo;
    
    // Limpiar QR anterior
    qrContainer.innerHTML = '';
    
    // Generar nuevo QR
    try {
        new QRCode(qrContainer, {
            text: codigo,
            width: 150,
            height: 150,
            colorDark: "#C1121F",
            colorLight: "#FFFFFF",
            correctLevel: QRCode.CorrectLevel.H
        });
    } catch (error) {
        console.error('Error generando QR:', error);
        qrContainer.innerHTML = '<p style="color: var(--rojo-acento);">Error al generar QR</p>';
    }
    
    // Mostrar resumen de datos
    resumenDatos.innerHTML = `
        <div class="resumen-item">
            <span class="resumen-label">Cliente:</span>
            <span class="resumen-value">${datos.cliente.nombre}</span>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">Vehículo:</span>
            <span class="resumen-value">${datos.vehiculo.marca} ${datos.vehiculo.modelo} (${datos.vehiculo.placa})</span>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">Fecha:</span>
            <span class="resumen-value">${new Date().toLocaleDateString()}</span>
        </div>
    `;
    
    codigoModal.classList.add('show');
}

// Cerrar modal
window.cerrarModal = () => {
    if (codigoModal) {
        codigoModal.classList.remove('show');
    }
};

// Imprimir código
window.imprimirCodigo = () => {
    const codigo = codigoGenerado ? codigoGenerado.textContent : 'OT-0000';
    const qrHTML = qrContainer ? qrContainer.innerHTML : '';
    
    const contenido = `
        <html>
            <head>
                <title>Código de Trabajo - FURIA MOTOR</title>
                <style>
                    body { 
                        font-family: 'Plus Jakarta Sans', Arial, sans-serif; 
                        padding: 30px; 
                        text-align: center;
                        color: #0F0F10;
                    }
                    .header {
                        margin-bottom: 30px;
                    }
                    .header h1 {
                        color: #C1121F;
                        margin-bottom: 5px;
                    }
                    .codigo { 
                        font-size: 32px; 
                        color: #C1121F; 
                        margin: 30px 0;
                        font-weight: bold;
                        letter-spacing: 2px;
                        padding: 20px;
                        border: 2px dashed #C1121F;
                        border-radius: 10px;
                        display: inline-block;
                    }
                    .qr { 
                        margin: 30px 0;
                        display: flex;
                        justify-content: center;
                    }
                    .fecha {
                        color: #6B7280;
                        margin-top: 30px;
                        font-size: 14px;
                    }
                    .footer {
                        margin-top: 50px;
                        font-size: 12px;
                        color: #6B7280;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>FURIA MOTOR COMPANY</h1>
                    <p>Sistema de Gestión Integral</p>
                </div>
                <h2>Código de Trabajo</h2>
                <div class="codigo">${codigo}</div>
                <div class="qr">${qrHTML}</div>
                <div class="fecha">Fecha de emisión: ${new Date().toLocaleString()}</div>
                <div class="footer">Presentar este código para dar seguimiento al vehículo</div>
            </body>
        </html>
    `;
    
    const ventana = window.open('', '_blank');
    ventana.document.write(contenido);
    ventana.document.close();
    ventana.focus();
    ventana.print();
};

// =====================================================
// NOTIFICACIONES
// =====================================================
function mostrarNotificacion(mensaje, tipo = 'info') {
    // Crear elemento de notificación
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${iconos[tipo] || iconos.info}"></i>
        <span>${mensaje}</span>
    `;
    
    // Estilos para el toast
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        z-index: 9999;
        animation: slideIn 0.3s ease;
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#2C3E50'};
    `;
    
    document.body.appendChild(toast);
    
    // Eliminar después de 3 segundos
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// =====================================================
// LOGOUT
// =====================================================
window.logout = () => {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};