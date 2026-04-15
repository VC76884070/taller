// =====================================================
// DIAGNÓSTICO TÉCNICO - TÉCNICO MECÁNICO
// FURIA MOTOR COMPANY SRL
// =====================================================

let token = null;
let ordenesTecnico = [];
let ordenSeleccionada = null;
let serviciosLista = [];
let fotosSubidas = [{}, {}]; // Array para 2 fotos
let mediaRecorder = null;
let audioChunks = [];
let grabando = false;
let audioUrlSubido = null;
let diagnosticoActual = null;

// =====================================================
// UTILIDADES
// =====================================================

function getToken() {
    const localToken = localStorage.getItem('furia_token');
    if (localToken) return localToken;
    const fallbackToken = localStorage.getItem('token');
    if (fallbackToken) return fallbackToken;
    return null;
}

function mostrarFechaActual() {
    const fechaSpan = document.getElementById('currentDate');
    if (fechaSpan) {
        const hoy = new Date();
        const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
        fechaSpan.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function formatFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const fecha = new Date(fechaStr);
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// VERIFICACIÓN DE AUTENTICACIÓN
// =====================================================

async function verificarToken() {
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const response = await fetch('/api/verify-token', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.valid) {
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            window.location.href = '/';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error verificando token:', error);
        window.location.href = '/';
        return false;
    }
}

// =====================================================
// CARGA DE ÓRDENES DEL TÉCNICO
// =====================================================

async function cargarOrdenes() {
    try {
        showToast('Cargando órdenes...', 'info');
        const response = await fetch('/tecnico/api/ordenes-tecnico', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            ordenesTecnico = data.ordenes;
            actualizarSelectorOrdenes();
            if (ordenesTecnico.length === 0) {
                showToast('No tienes órdenes de trabajo asignadas', 'warning');
            } else {
                showToast(`${ordenesTecnico.length} órden(es) cargada(s)`, 'success');
            }
        } else {
            showToast(data.error || 'Error al cargar órdenes', 'error');
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        showToast('Error al cargar órdenes', 'error');
    }
}

function actualizarSelectorOrdenes() {
    const select = document.getElementById('ordenSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Seleccione una orden --</option>';
    
    ordenesTecnico.forEach(orden => {
        const option = document.createElement('option');
        option.value = orden.orden_id;
        let texto = `${orden.codigo_unico} - ${orden.vehiculo.placa} (${orden.vehiculo.marca} ${orden.vehiculo.modelo})`;
        if (orden.tiene_diagnostico) {
            const estadoIcon = orden.diagnostico_estado === 'pendiente' ? '⏳' : 
                              orden.diagnostico_estado === 'aprobado' ? '✅' : 
                              orden.diagnostico_estado === 'rechazado' ? '❌' : '📝';
            texto += ` ${estadoIcon} ${orden.diagnostico_estado || 'borrador'}`;
        }
        option.textContent = texto;
        select.appendChild(option);
    });
}

// =====================================================
// MANEJO DE SERVICIOS
// =====================================================

function agregarServicio() {
    const input = document.getElementById('nuevoServicioInput');
    const descripcion = input.value.trim();
    
    if (!descripcion) {
        showToast('Escribe una descripción del servicio', 'warning');
        return;
    }
    
    if (descripcion.length < 3) {
        showToast('La descripción debe tener al menos 3 caracteres', 'warning');
        return;
    }
    
    serviciosLista.push({
        id: Date.now(),
        descripcion: descripcion,
        orden: serviciosLista.length
    });
    
    input.value = '';
    renderizarServicios();
    showToast('Servicio agregado', 'success');
}

function eliminarServicio(servicioId) {
    serviciosLista = serviciosLista.filter(s => s.id !== servicioId);
    serviciosLista.forEach((s, idx) => s.orden = idx);
    renderizarServicios();
    showToast('Servicio eliminado', 'info');
}

function renderizarServicios() {
    const container = document.getElementById('serviciosList');
    if (!container) return;
    
    if (serviciosLista.length === 0) {
        container.innerHTML = `
            <div class="servicios-empty">
                <i class="fas fa-clipboard-list"></i>
                <p>No hay servicios agregados aún.<br>Escribe un servicio y presiona "Agregar"</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = serviciosLista.map(servicio => `
        <div class="servicio-item" data-id="${servicio.id}">
            <div class="servicio-nombre">
                <i class="fas fa-wrench"></i>
                <span>${escapeHtml(servicio.descripcion)}</span>
            </div>
            <button class="btn-eliminar-servicio" onclick="eliminarServicio(${servicio.id})">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

// =====================================================
// MANEJO DE AUDIO
// =====================================================

async function iniciarGrabacion() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioPreview = document.getElementById('audioPreview');
            audioPreview.src = audioUrl;
            audioPreview.style.display = 'block';
            
            await subirAudio(audioBlob);
            
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        grabando = true;
        
        const btnGrabar = document.getElementById('btnGrabarAudio');
        btnGrabar.innerHTML = '<i class="fas fa-stop"></i> Detener Grabación';
        btnGrabar.classList.add('recording');
        
        document.getElementById('grabacionStatus').innerHTML = '<i class="fas fa-circle" style="color: red;"></i> Grabando...';
    } catch (error) {
        console.error('Error al iniciar grabación:', error);
        showToast('Error al acceder al micrófono', 'error');
    }
}

function detenerGrabacion() {
    if (mediaRecorder && grabando) {
        mediaRecorder.stop();
        grabando = false;
        
        const btnGrabar = document.getElementById('btnGrabarAudio');
        btnGrabar.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        btnGrabar.classList.remove('recording');
        
        document.getElementById('grabacionStatus').innerHTML = 'Procesando grabación...';
    }
}

function eliminarGrabacion() {
    if (audioUrlSubido) {
        // Opcional: llamar a API para eliminar audio de Cloudinary
        audioUrlSubido = null;
    }
    
    document.getElementById('audioUrl').value = '';
    const audioPreview = document.getElementById('audioPreview');
    if (audioPreview.src && audioPreview.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioPreview.src);
    }
    audioPreview.src = '';
    audioPreview.style.display = 'none';
    document.getElementById('transcripcionDiagnostico').value = '';
    document.getElementById('grabacionStatus').innerHTML = 'Audio eliminado';
    document.getElementById('btnEliminarAudio').style.display = 'none';
    showToast('Audio eliminado', 'info');
}

async function subirAudio(audioBlob) {
    if (!ordenSeleccionada) {
        showToast('Primero selecciona una orden', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'diagnostico.mp3');
    formData.append('id_orden', ordenSeleccionada.orden_id);
    
    try {
        showToast('Subiendo audio...', 'info');
        const response = await fetch('/tecnico/api/diagnostico/subir-audio', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            audioUrlSubido = data.url;
            document.getElementById('audioUrl').value = data.url;
            document.getElementById('btnEliminarAudio').style.display = 'inline-flex';
            showToast('Audio subido correctamente', 'success');
            
            if (data.transcripcion) {
                document.getElementById('transcripcionDiagnostico').value = data.transcripcion;
            }
        } else {
            showToast(data.error || 'Error al subir audio', 'error');
        }
    } catch (error) {
        console.error('Error subiendo audio:', error);
        showToast('Error al subir audio', 'error');
    }
}

// =====================================================
// MANEJO DE FOTOS (MÁXIMO 2)
// =====================================================

function setupFotosUpload() {
    for (let i = 0; i < 2; i++) {
        const uploadCard = document.getElementById(`fotoUpload${i + 1}`);
        if (!uploadCard) continue;
        
        const uploadArea = uploadCard.querySelector('.upload-area');
        const fotoInput = uploadCard.querySelector('.foto-input');
        const fotoPreview = uploadCard.querySelector('.foto-preview');
        const previewImg = fotoPreview.querySelector('img');
        const btnEliminar = fotoPreview.querySelector('.btn-eliminar-foto');
        
        uploadArea.addEventListener('click', () => fotoInput.click());
        
        fotoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    showToast('La imagen no debe superar los 5MB', 'warning');
                    fotoInput.value = '';
                    return;
                }
                if (!file.type.startsWith('image/')) {
                    showToast('Solo se permiten archivos de imagen', 'warning');
                    fotoInput.value = '';
                    return;
                }
                
                await subirFoto(file, i);
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImg.src = e.target.result;
                    uploadArea.style.display = 'none';
                    fotoPreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
        
        btnEliminar.addEventListener('click', async () => {
            if (fotosSubidas[i] && fotosSubidas[i].id) {
                await eliminarFoto(fotosSubidas[i].id);
            }
            fotosSubidas[i] = {};
            uploadArea.style.display = 'block';
            fotoPreview.style.display = 'none';
            fotoInput.value = '';
            actualizarInfoFotos();
        });
    }
}

async function subirFoto(file, index) {
    if (!ordenSeleccionada) {
        showToast('Primero selecciona una orden', 'warning');
        return false;
    }
    
    const formData = new FormData();
    formData.append('foto', file);
    formData.append('id_orden', ordenSeleccionada.orden_id);
    
    try {
        showToast('Subiendo foto...', 'info');
        const response = await fetch('/tecnico/api/diagnostico/subir-foto', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            fotosSubidas[index] = { id: data.foto_id, url: data.url };
            actualizarInfoFotos();
            showToast('Foto subida correctamente', 'success');
            return true;
        } else {
            showToast(data.error || 'Error al subir foto', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error subiendo foto:', error);
        showToast('Error al subir foto', 'error');
        return false;
    }
}

async function eliminarFoto(fotoId) {
    try {
        const response = await fetch(`/tecnico/api/diagnostico/eliminar-foto/${fotoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Foto eliminada', 'success');
            return true;
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error eliminando foto:', error);
        showToast('Error al eliminar foto', 'error');
        return false;
    }
}

function actualizarInfoFotos() {
    const fotosValidas = fotosSubidas.filter(f => f && f.id).length;
    const fotosInfo = document.getElementById('fotosInfo');
    
    if (fotosInfo) {
        if (fotosValidas === 0) {
            fotosInfo.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ⚠️ Debes subir al menos 1 foto del diagnóstico';
            fotosInfo.classList.add('warning');
        } else {
            fotosInfo.innerHTML = `<i class="fas fa-check-circle"></i> ✅ ${fotosValidas}/2 fotos subidas`;
            fotosInfo.classList.remove('warning');
        }
    }
}

function validarFotos() {
    const fotosValidas = fotosSubidas.filter(f => f && f.id).length;
    return fotosValidas >= 1;
}

function cargarFotosDesdeServidor(fotos) {
    fotosSubidas = [{}, {}];
    
    fotos.forEach((foto, idx) => {
        if (idx < 2) {
            fotosSubidas[idx] = { id: foto.id, url: foto.url_foto };
            
            const uploadCard = document.getElementById(`fotoUpload${idx + 1}`);
            if (uploadCard) {
                const uploadArea = uploadCard.querySelector('.upload-area');
                const fotoPreview = uploadCard.querySelector('.foto-preview');
                const previewImg = fotoPreview.querySelector('img');
                
                previewImg.src = foto.url_foto;
                uploadArea.style.display = 'none';
                fotoPreview.style.display = 'block';
            }
        }
    });
    
    actualizarInfoFotos();
}

// =====================================================
// CARGA DE DIAGNÓSTICO EXISTENTE
// =====================================================

async function cargarDiagnosticoExistente(ordenId) {
    try {
        const response = await fetch(`/tecnico/api/diagnostico/${ordenId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.diagnostico) {
            diagnosticoActual = data.diagnostico;
            
            // Cargar transcripción
            if (data.diagnostico.transcripcion_informe) {
                document.getElementById('transcripcionDiagnostico').value = data.diagnostico.transcripcion_informe;
            }
            
            // Cargar audio
            if (data.diagnostico.url_grabacion_informe) {
                audioUrlSubido = data.diagnostico.url_grabacion_informe;
                document.getElementById('audioUrl').value = data.diagnostico.url_grabacion_informe;
                const audioPreview = document.getElementById('audioPreview');
                audioPreview.src = data.diagnostico.url_grabacion_informe;
                audioPreview.style.display = 'block';
                document.getElementById('btnEliminarAudio').style.display = 'inline-flex';
                document.getElementById('grabacionStatus').innerHTML = 'Audio disponible';
            }
            
            // Cargar servicios
            serviciosLista = data.servicios || [];
            renderizarServicios();
            
            // Cargar fotos
            if (data.fotos && data.fotos.length > 0) {
                cargarFotosDesdeServidor(data.fotos);
            }
            
            // Mostrar estado
            mostrarEstadoDiagnostico(data.diagnostico);
            
            // Mostrar historial
            mostrarHistorial(data.diagnostico.observaciones || []);
            
            // Si el diagnóstico está rechazado, mostrar mensaje
            if (data.diagnostico.estado === 'rechazado') {
                showToast('⚠️ Este diagnóstico fue rechazado. Revisa las observaciones y realiza las correcciones.', 'warning');
            }
        } else {
            // Nuevo diagnóstico
            diagnosticoActual = null;
            serviciosLista = [];
            fotosSubidas = [{}, {}];
            renderizarServicios();
            actualizarInfoFotos();
            
            // Limpiar UI de fotos
            for (let i = 0; i < 2; i++) {
                const uploadCard = document.getElementById(`fotoUpload${i + 1}`);
                if (uploadCard) {
                    const uploadArea = uploadCard.querySelector('.upload-area');
                    const fotoPreview = uploadCard.querySelector('.foto-preview');
                    const fotoInput = uploadCard.querySelector('.foto-input');
                    uploadArea.style.display = 'block';
                    fotoPreview.style.display = 'none';
                    if (fotoInput) fotoInput.value = '';
                }
            }
            
            document.getElementById('transcripcionDiagnostico').value = '';
            document.getElementById('audioPreview').style.display = 'none';
            document.getElementById('audioUrl').value = '';
            document.getElementById('btnEliminarAudio').style.display = 'none';
            document.getElementById('grabacionStatus').innerHTML = '';
            document.getElementById('historialContainer').style.display = 'none';
            document.getElementById('estadoDiagnostico').innerHTML = '';
        }
    } catch (error) {
        console.error('Error cargando diagnóstico:', error);
    }
}

function mostrarEstadoDiagnostico(diagnostico) {
    const estadoContainer = document.getElementById('estadoDiagnostico');
    if (!estadoContainer) return;
    
    let estadoHtml = '';
    switch (diagnostico.estado) {
        case 'borrador':
            estadoHtml = '<span class="estado-badge estado-borrador"><i class="fas fa-pencil-alt"></i> Borrador</span>';
            break;
        case 'pendiente':
            estadoHtml = '<span class="estado-badge estado-pendiente"><i class="fas fa-clock"></i> Pendiente de revisión</span>';
            break;
        case 'aprobado':
            estadoHtml = '<span class="estado-badge estado-aprobado"><i class="fas fa-check-circle"></i> Aprobado</span>';
            break;
        case 'rechazado':
            estadoHtml = '<span class="estado-badge estado-rechazado"><i class="fas fa-times-circle"></i> Rechazado</span>';
            break;
    }
    
    estadoContainer.innerHTML = estadoHtml;
}

function mostrarHistorial(observaciones) {
    const historialContainer = document.getElementById('historialContainer');
    const historialList = document.getElementById('historialList');
    
    if (observaciones && observaciones.length > 0) {
        historialContainer.style.display = 'block';
        historialList.innerHTML = observaciones.map(obs => `
            <div class="historial-item">
                <div class="historial-header">
                    <span class="historial-version">
                        <i class="fas fa-comment-dots"></i> Observación
                    </span>
                    <span class="historial-fecha">${formatFecha(obs.fecha_hora)}</span>
                </div>
                <div class="historial-informe">${escapeHtml(obs.observacion)}</div>
                ${obs.transcripcion_obs ? `<div class="historial-transcripcion"><i class="fas fa-microphone-alt"></i> ${escapeHtml(obs.transcripcion_obs)}</div>` : ''}
            </div>
        `).join('');
    } else {
        historialContainer.style.display = 'none';
    }
}

function mostrarInfoVehiculo(orden) {
    const vehiculo = orden.vehiculo;
    
    document.getElementById('vehiculoPlaca').textContent = vehiculo.placa || 'No registrada';
    document.getElementById('vehiculoModelo').textContent = `${vehiculo.marca || ''} ${vehiculo.modelo || ''}`.trim() || 'No especificado';
    document.getElementById('vehiculoAnio').textContent = vehiculo.anio || 'No especificado';
    document.getElementById('vehiculoKm').textContent = vehiculo.kilometraje ? `${vehiculo.kilometraje.toLocaleString()} km` : 'No registrado';
}

// =====================================================
// GUARDAR DIAGNÓSTICO
// =====================================================

function validarDiagnostico() {
    const errores = [];
    
    if (serviciosLista.length === 0) {
        errores.push('Debes agregar al menos un servicio');
    }
    
    if (!validarFotos()) {
        errores.push('Debes subir al menos 1 foto del diagnóstico');
    }
    
    return errores;
}

async function guardarDiagnostico(enviar = false) {
    if (!ordenSeleccionada) {
        showToast('Selecciona una orden primero', 'warning');
        return false;
    }
    
    if (enviar) {
        const errores = validarDiagnostico();
        if (errores.length > 0) {
            const errorList = document.querySelector('#validacionErrores ul');
            if (errorList) {
                errorList.innerHTML = errores.map(e => `<li>${e}</li>`).join('');
                document.getElementById('validacionErrores').style.display = 'block';
            }
            showToast('Por favor completa todos los campos requeridos', 'warning');
            return false;
        }
    }
    
    document.getElementById('validacionErrores').style.display = 'none';
    
    const data = {
        id_orden: ordenSeleccionada.orden_id,
        transcripcion: document.getElementById('transcripcionDiagnostico').value,
        url_grabacion: document.getElementById('audioUrl').value,
        servicios: serviciosLista.map(s => s.descripcion),
        enviar: enviar
    };
    
    try {
        showToast(enviar ? 'Enviando diagnóstico...' : 'Guardando borrador...', 'info');
        
        const response = await fetch('/tecnico/api/diagnostico/guardar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(enviar ? '✅ Diagnóstico enviado al Jefe de Taller' : '📝 Borrador guardado', 'success');
            
            if (enviar) {
                cerrarConfirmModal();
                document.getElementById('diagnosticoForm').style.display = 'none';
                document.getElementById('ordenSelect').value = '';
                ordenSeleccionada = null;
                await cargarOrdenes();
            } else {
                await cargarDiagnosticoExistente(ordenSeleccionada.orden_id);
            }
            return true;
        } else {
            showToast(result.error || 'Error al guardar', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error guardando diagnóstico:', error);
        showToast('Error al guardar', 'error');
        return false;
    }
}

// =====================================================
// MODALES
// =====================================================

function abrirConfirmModal() {
    const errores = validarDiagnostico();
    if (errores.length > 0) {
        const errorList = document.querySelector('#validacionErrores ul');
        if (errorList) {
            errorList.innerHTML = errores.map(e => `<li>${e}</li>`).join('');
            document.getElementById('validacionErrores').style.display = 'block';
        }
        showToast('Por favor completa todos los campos requeridos antes de enviar', 'warning');
        return;
    }
    
    document.getElementById('validacionErrores').style.display = 'none';
    document.getElementById('confirmModal').classList.add('show');
}

function cerrarConfirmModal() {
    document.getElementById('confirmModal').classList.remove('show');
}

// =====================================================
// CIERRE DE SESIÓN
// =====================================================

function cerrarSesion() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    token = getToken();
    
    if (!token) {
        window.location.href = '/';
        return;
    }
    
    const tokenValido = await verificarToken();
    if (!tokenValido) return;
    
    mostrarFechaActual();
    await cargarOrdenes();
    setupFotosUpload();
    
    // Event Listeners
    const ordenSelect = document.getElementById('ordenSelect');
    ordenSelect.addEventListener('change', async (e) => {
        const ordenId = parseInt(e.target.value);
        if (ordenId) {
            ordenSeleccionada = ordenesTecnico.find(o => o.orden_id === ordenId);
            mostrarInfoVehiculo(ordenSeleccionada);
            document.getElementById('diagnosticoForm').style.display = 'block';
            await cargarDiagnosticoExistente(ordenId);
        } else {
            ordenSeleccionada = null;
            document.getElementById('diagnosticoForm').style.display = 'none';
        }
    });
    
    // Botón agregar servicio
    const btnAgregarServicio = document.getElementById('btnAgregarServicio');
    if (btnAgregarServicio) {
        btnAgregarServicio.addEventListener('click', agregarServicio);
    }
    
    const nuevoServicioInput = document.getElementById('nuevoServicioInput');
    if (nuevoServicioInput) {
        nuevoServicioInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') agregarServicio();
        });
    }
    
    // Botón grabar audio
    const btnGrabar = document.getElementById('btnGrabarAudio');
    if (btnGrabar) {
        btnGrabar.addEventListener('click', () => {
            if (grabando) {
                detenerGrabacion();
            } else {
                iniciarGrabacion();
            }
        });
    }
    
    // Botón eliminar audio
    const btnEliminarAudio = document.getElementById('btnEliminarAudio');
    if (btnEliminarAudio) {
        btnEliminarAudio.addEventListener('click', eliminarGrabacion);
    }
    
    // Botón guardar borrador
    const btnGuardar = document.getElementById('btnGuardarBorrador');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', () => guardarDiagnostico(false));
    }
    
    // Botón enviar diagnóstico
    const btnEnviar = document.getElementById('btnEnviarDiagnostico');
    if (btnEnviar) {
        btnEnviar.addEventListener('click', abrirConfirmModal);
    }
    
    // Confirmar envío
    const confirmarBtn = document.getElementById('confirmarEnvioBtn');
    if (confirmarBtn) {
        confirmarBtn.addEventListener('click', () => guardarDiagnostico(true));
    }
    
    // Cargar sidebar
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        try {
            const response = await fetch('/tecnico_mecanico/components/sidebar.html');
            if (response.ok) {
                sidebarContainer.innerHTML = await response.text();
            }
        } catch (error) {
            console.error('Error cargando sidebar:', error);
        }
    }
    
    // Exponer funciones globales
    window.agregarServicio = agregarServicio;
    window.eliminarServicio = eliminarServicio;
    window.cerrarSesion = cerrarSesion;
    window.cerrarConfirmModal = cerrarConfirmModal;
});