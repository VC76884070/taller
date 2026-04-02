// =====================================================
// ÓRDENES DE TRABAJO - JEFE TALLER
// =====================================================

const API_URL = 'http://localhost:5000/api';
let userInfo = null;
let pollingInterval = null;

// Variables de estado
let ordenesActivas = [];
let ordenesFinalizadas = [];
let tecnicosDisponibles = [];
let ordenEnGestion = null;
let audioBlob = null;
let audioChunks = [];
let isRecording = false;
let mediaRecorder = null;

// Elementos DOM
const tabs = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    await cargarTecnicos();
    await cargarOrdenesActivas();
    await cargarOrdenesFinalizadas();
    
    iniciarPolling();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    userInfo = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || (userInfo.rol !== 'jefe_taller' && userInfo.id_rol !== 3)) {
        window.location.href = '/';
        return false;
    }
    return true;
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

function setupEventListeners() {
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            cambiarPestana(tabId);
        });
    });
    
    document.getElementById('refreshActivas')?.addEventListener('click', cargarOrdenesActivas);
    document.getElementById('refreshFinalizadas')?.addEventListener('click', cargarOrdenesFinalizadas);
    
    document.getElementById('searchActivas')?.addEventListener('input', filtrarOrdenesActivas);
    document.getElementById('tecnicoFiltro')?.addEventListener('change', filtrarOrdenesActivas);
    document.getElementById('estadoFiltroActivas')?.addEventListener('change', filtrarOrdenesActivas);
    
    document.getElementById('searchFinalizadas')?.addEventListener('input', filtrarOrdenesFinalizadas);
    document.getElementById('fechaDesdeFinalizadas')?.addEventListener('change', filtrarOrdenesFinalizadas);
    document.getElementById('fechaHastaFinalizadas')?.addEventListener('change', filtrarOrdenesFinalizadas);
}

function cambiarPestana(tabId) {
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    panels.forEach(panel => {
        if (panel.id === `panel-${tabId}`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
}

// =====================================================
// API CALLS
// =====================================================

async function cargarTecnicos() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/tecnicos`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (response.ok && data.tecnicos) {
            tecnicosDisponibles = data.tecnicos;
            
            const selectTecnico = document.getElementById('tecnicoFiltro');
            if (selectTecnico) {
                selectTecnico.innerHTML = '<option value="">Todos los técnicos</option>' +
                    tecnicosDisponibles.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
            }
        }
    } catch (error) {
        console.error('Error cargando técnicos:', error);
    }
}

async function cargarOrdenesActivas() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-activas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (response.ok && data.ordenes) {
            ordenesActivas = data.ordenes;
            document.getElementById('activasCount').textContent = ordenesActivas.length;
            renderOrdenesActivas(ordenesActivas);
        }
    } catch (error) {
        console.error('Error cargando órdenes activas:', error);
    }
}

async function cargarOrdenesFinalizadas() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-finalizadas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (response.ok && data.ordenes) {
            ordenesFinalizadas = data.ordenes;
            document.getElementById('finalizadasCount').textContent = ordenesFinalizadas.length;
            renderOrdenesFinalizadas(ordenesFinalizadas);
        }
    } catch (error) {
        console.error('Error cargando órdenes finalizadas:', error);
    }
}

// =====================================================
// RENDER FUNCTIONS
// =====================================================

function renderOrdenesActivas(ordenes) {
    const container = document.getElementById('ordenesActivasList');
    if (!container) return;
    
    if (ordenes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tasks"></i>
                <p>No hay órdenes activas</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ordenes.map(orden => `
        <div class="orden-card" data-id="${orden.id}">
            <div class="orden-card-header">
                <span class="orden-codigo">${orden.codigo_unico}</span>
                <span class="orden-estado ${orden.estado_global}">${orden.estado_global}</span>
                <span class="recepcion-fecha">
                    <i class="far fa-calendar-alt"></i>
                    ${new Date(orden.fecha_ingreso).toLocaleDateString()}
                </span>
            </div>
            <div class="orden-card-body">
                <div class="orden-info-item">
                    <span class="orden-info-label">Cliente</span>
                    <span class="orden-info-value">${escapeHtml(orden.cliente_nombre || 'N/A')}</span>
                </div>
                <div class="orden-info-item">
                    <span class="orden-info-label">Vehículo</span>
                    <span class="orden-info-value">${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')} (${escapeHtml(orden.placa || '')})</span>
                </div>
                <div class="orden-info-item">
                    <span class="orden-info-label">Jefes Operativos</span>
                    <div class="orden-tecnicos">
                        ${orden.jefe_operativo_nombre ? `<span class="tecnico-badge"><i class="fas fa-user-tie"></i> ${escapeHtml(orden.jefe_operativo_nombre)}</span>` : ''}
                        ${orden.jefe_operativo_2_nombre ? `<span class="tecnico-badge"><i class="fas fa-user-tie"></i> ${escapeHtml(orden.jefe_operativo_2_nombre)}</span>` : ''}
                        ${!orden.jefe_operativo_nombre && !orden.jefe_operativo_2_nombre ? '<span class="tecnico-badge">No registrado</span>' : ''}
                    </div>
                </div>
                <div class="orden-info-item">
                    <span class="orden-info-label">Técnicos asignados</span>
                    <div class="orden-tecnicos">
                        ${orden.tecnicos && orden.tecnicos.length > 0 ? 
                            orden.tecnicos.map(t => `<span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>`).join('') :
                            '<span class="tecnico-badge">Sin asignar</span>'}
                    </div>
                </div>
                ${orden.bahia_asignada ? `
                    <div class="orden-info-item">
                        <span class="orden-info-label">Bahía</span>
                        <span class="orden-info-value">Bahía ${orden.bahia_asignada}</span>
                    </div>
                ` : ''}
                ${orden.fecha_hora_inicio_estimado ? `
                    <div class="orden-info-item">
                        <span class="orden-info-label">Inicio estimado</span>
                        <span class="orden-info-value">${new Date(orden.fecha_hora_inicio_estimado).toLocaleString()}</span>
                    </div>
                ` : ''}
                ${orden.transcripcion_problema ? `
                    <div class="orden-info-item">
                        <span class="orden-info-label">Problema</span>
                        <span class="orden-info-value">${escapeHtml(orden.transcripcion_problema.substring(0, 80))}${orden.transcripcion_problema.length > 80 ? '...' : ''}</span>
                    </div>
                ` : ''}
            </div>
            <div class="orden-card-footer">
                <button class="btn-accion-orden btn-gestionar" onclick="abrirModalGestionOrden(${orden.id})">
                    <i class="fas fa-edit"></i> Gestionar Orden
                </button>
                <button class="btn-accion-orden btn-ver-detalle-orden" onclick="verDetalleOrden(${orden.id})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
                ${orden.estado_global === 'EnPausa' ? `
                    <button class="btn-accion-orden btn-reanudar" onclick="reanudarOrden(${orden.id})">
                        <i class="fas fa-play"></i> Reanudar
                    </button>
                ` : ''}
                <button class="btn-accion-orden btn-ver-diagnosticos" onclick="verHistorialDiagnosticos(${orden.id})">
                    <i class="fas fa-history"></i> Ver Diagnósticos
                </button>
            </div>
        </div>
    `).join('');
}

function renderOrdenesFinalizadas(ordenes) {
    const container = document.getElementById('ordenesFinalizadasList');
    if (!container) return;
    
    if (ordenes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>No hay órdenes finalizadas</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ordenes.map(orden => `
        <div class="orden-card" data-id="${orden.id}">
            <div class="orden-card-header">
                <span class="orden-codigo">${orden.codigo_unico}</span>
                <span class="orden-estado ${orden.estado_global}">${orden.estado_global}</span>
                <span class="recepcion-fecha">
                    <i class="far fa-calendar-alt"></i>
                    ${new Date(orden.fecha_ingreso).toLocaleDateString()}
                </span>
            </div>
            <div class="orden-card-body">
                <div class="orden-info-item">
                    <span class="orden-info-label">Cliente</span>
                    <span class="orden-info-value">${escapeHtml(orden.cliente_nombre || 'N/A')}</span>
                </div>
                <div class="orden-info-item">
                    <span class="orden-info-label">Vehículo</span>
                    <span class="orden-info-value">${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')} (${escapeHtml(orden.placa || '')})</span>
                </div>
                <div class="orden-info-item">
                    <span class="orden-info-label">Fecha entrega</span>
                    <span class="orden-info-value">${orden.fecha_entrega ? new Date(orden.fecha_entrega).toLocaleDateString() : 'N/A'}</span>
                </div>
            </div>
            <div class="orden-card-footer">
                <button class="btn-accion-orden btn-ver-detalle-orden" onclick="verDetalleOrden(${orden.id})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
                <button class="btn-accion-orden btn-ver-diagnosticos" onclick="verHistorialDiagnosticos(${orden.id})">
                    <i class="fas fa-history"></i> Ver Diagnósticos
                </button>
            </div>
        </div>
    `).join('');
}

// =====================================================
// MODAL UNIFICADO DE GESTIÓN
// =====================================================

async function abrirModalGestionOrden(idOrden) {
    try {
        mostrarNotificacion('Cargando datos de la orden...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (!response.ok || !data.detalle) throw new Error(data.error || 'Error cargando datos');
        
        ordenEnGestion = data.detalle;
        
        const modal = document.getElementById('modalGestionOrden');
        const body = document.getElementById('modalGestionOrdenBody');
        const footer = document.getElementById('modalGestionOrdenFooter');
        
        // Cargar técnicos seleccionados actualmente
        const tecnicosSeleccionados = ordenEnGestion.tecnicos?.map(t => t.id) || [];
        
        // Cargar planificación existente
        const planificacionExistente = ordenEnGestion.planificacion || {};
        const hoy = new Date().toISOString().slice(0, 16);
        const fechaInicio = planificacionExistente.fecha_hora_inicio_estimado ? 
            planificacionExistente.fecha_hora_inicio_estimado.slice(0, 16) : hoy;
        
        // Obtener URL del audio de diagnóstico si existe
        const diagnosticoAudioUrl = ordenEnGestion.diagnostico_audio_url || null;
        
        body.innerHTML = `
            <div class="gestion-orden">
                <!-- Sección: Asignación de Técnicos -->
                <div class="gestion-section">
                    <div class="gestion-section-header">
                        <h3><i class="fas fa-users"></i> Asignación de Técnicos</h3>
                        <span class="section-status ${tecnicosSeleccionados.length > 0 ? 'completado' : 'pendiente'}">
                            ${tecnicosSeleccionados.length > 0 ? `${tecnicosSeleccionados.length}/2 técnicos` : 'Pendiente'}
                        </span>
                    </div>
                    <div class="gestion-section-body">
                        <div class="tecnicos-grid" id="tecnicosGrid">
                            ${tecnicosDisponibles.map(t => `
                                <div class="tecnico-option ${tecnicosSeleccionados.includes(t.id) ? 'selected' : ''}" data-id="${t.id}">
                                    <input type="checkbox" value="${t.id}" ${tecnicosSeleccionados.includes(t.id) ? 'checked' : ''}>
                                    <div class="tecnico-info">
                                        <div class="tecnico-nombre">${escapeHtml(t.nombre)}</div>
                                        <div class="tecnico-carga">${t.ordenes_activas || 0}/${t.max_vehiculos || 2} vehículos</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <p class="modal-hint">* Máximo 2 técnicos por orden</p>
                    </div>
                </div>
                
                <!-- Sección: Planificación -->
                <div class="gestion-section">
                    <div class="gestion-section-header">
                        <h3><i class="fas fa-calendar-alt"></i> Planificación</h3>
                        <span class="section-status ${planificacionExistente.bahia_asignada ? 'completado' : 'pendiente'}">
                            ${planificacionExistente.bahia_asignada ? 'Planificado' : 'Pendiente'}
                        </span>
                    </div>
                    <div class="gestion-section-body">
                        <div class="planificacion-grid">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-warehouse"></i> Bahía asignada</label>
                                <select id="bahiaSelect" class="form-select">
                                    <option value="">Seleccionar bahía</option>
                                    ${Array.from({length: 12}, (_, i) => i + 1).map(num => `
                                        <option value="${num}" ${planificacionExistente.bahia_asignada == num ? 'selected' : ''}>
                                            Bahía ${num}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-calendar"></i> Fecha y hora inicio</label>
                                <input type="datetime-local" id="fechaInicio" class="form-input" value="${fechaInicio}">
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-hourglass-half"></i> Horas estimadas</label>
                                <input type="number" id="horasEstimadas" class="form-input" step="0.5" min="0.5" 
                                       placeholder="Ej: 2.5" value="${planificacionExistente.horas_estimadas || ''}">
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Sección: Diagnóstico Inicial con Audio -->
                <div class="gestion-section">
                    <div class="gestion-section-header">
                        <h3><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h3>
                        <span class="section-status ${ordenEnGestion.diagnostico_inicial ? 'completado' : 'pendiente'}">
                            ${ordenEnGestion.diagnostico_inicial ? 'Completado' : 'Pendiente'}
                        </span>
                    </div>
                    <div class="gestion-section-body">
                        <div class="form-group">
                            <label class="form-label">Diagnóstico</label>
                            <textarea id="diagnosticoTexto" rows="5" class="form-textarea" 
                                placeholder="Describe el diagnóstico inicial...">${ordenEnGestion.diagnostico_inicial || ''}</textarea>
                        </div>
                        <div class="diagnostico-audio">
                            <div class="diagnostico-audio-controls">
                                <button type="button" class="btn-audio" id="btnGrabarDiagnostico">
                                    <i class="fas fa-microphone"></i> Grabar Audio
                                </button>
                                <button type="button" class="btn-secondary" id="btnTranscribirDiagnostico" style="display: none;">
                                    <i class="fas fa-language"></i> Transcribir Audio
                                </button>
                                <button type="button" class="btn-secondary" id="btnEliminarAudioDiagnostico" style="display: none;">
                                    <i class="fas fa-trash-alt"></i> Eliminar Audio
                                </button>
                            </div>
                            <audio id="audioPreviewDiagnostico" controls style="display: ${diagnosticoAudioUrl ? 'block' : 'none'}; width: 100%; margin-top: 0.5rem;">
                                ${diagnosticoAudioUrl ? `<source src="${diagnosticoAudioUrl}" type="audio/mpeg">` : ''}
                            </audio>
                            <div id="transcripcionLoading" style="display: none; margin-top: 0.5rem; text-align: center;">
                                <i class="fas fa-spinner fa-spin"></i> Transcribiendo audio...
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Footer con solo botón Guardar
        footer.innerHTML = `
            <div class="modal-footer">
                <button class="btn-secondary" onclick="cerrarModalGestionOrden()">Cancelar</button>
                <button class="btn-primary" onclick="guardarGestionOrden()">
                    <i class="fas fa-save"></i> Guardar Cambios
                </button>
            </div>
        `;
        
        // Configurar eventos de la interfaz
        configurarSeleccionTecnicos();
        configurarAudioDiagnostico(diagnosticoAudioUrl);
        
        modal.classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message || 'Error cargando datos', 'error');
    }
}

function configurarSeleccionTecnicos() {
    const checkboxes = document.querySelectorAll('#tecnicosGrid input[type="checkbox"]');
    const maxTecnicos = 2;
    
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const seleccionados = Array.from(checkboxes).filter(cb => cb.checked).length;
            if (seleccionados > maxTecnicos) {
                checkbox.checked = false;
                mostrarNotificacion('Máximo 2 técnicos por orden', 'warning');
                return;
            }
            
            const parent = checkbox.closest('.tecnico-option');
            if (checkbox.checked) {
                parent.classList.add('selected');
            } else {
                parent.classList.remove('selected');
            }
            
            const sectionHeader = checkbox.closest('.gestion-section').querySelector('.section-status');
            const nuevosSeleccionados = Array.from(checkboxes).filter(cb => cb.checked).length;
            sectionHeader.textContent = nuevosSeleccionados > 0 ? `${nuevosSeleccionados}/2 técnicos` : 'Pendiente';
            sectionHeader.className = `section-status ${nuevosSeleccionados > 0 ? 'completado' : 'pendiente'}`;
        });
    });
}

function configurarAudioDiagnostico(existingAudioUrl) {
    const btnGrabar = document.getElementById('btnGrabarDiagnostico');
    const btnTranscribir = document.getElementById('btnTranscribirDiagnostico');
    const btnEliminar = document.getElementById('btnEliminarAudioDiagnostico');
    const audioPreview = document.getElementById('audioPreviewDiagnostico');
    const loadingDiv = document.getElementById('transcripcionLoading');
    
    let mediaRecorderLocal = null;
    let isRecordingLocal = false;
    let audioBlobLocal = null;
    let audioChunksLocal = [];
    
    // Si hay audio existente, mostrar controles
    if (existingAudioUrl) {
        btnTranscribir.style.display = 'flex';
        btnEliminar.style.display = 'flex';
    }
    
    btnGrabar.addEventListener('click', async () => {
        if (!isRecordingLocal) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorderLocal = new MediaRecorder(stream);
                audioChunksLocal = [];
                
                mediaRecorderLocal.ondataavailable = (event) => {
                    audioChunksLocal.push(event.data);
                };
                
                mediaRecorderLocal.onstop = () => {
                    audioBlobLocal = new Blob(audioChunksLocal, { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(audioBlobLocal);
                    audioPreview.src = audioUrl;
                    audioPreview.style.display = 'block';
                    btnTranscribir.style.display = 'flex';
                    btnEliminar.style.display = 'flex';
                    stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorderLocal.start();
                isRecordingLocal = true;
                btnGrabar.innerHTML = '<i class="fas fa-stop"></i> Detener Grabación';
                btnGrabar.classList.add('recording');
            } catch (error) {
                console.error('Error accediendo al micrófono:', error);
                mostrarNotificacion('Error accediendo al micrófono', 'error');
            }
        } else {
            mediaRecorderLocal.stop();
            isRecordingLocal = false;
            btnGrabar.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
            btnGrabar.classList.remove('recording');
        }
    });
    
    btnTranscribir.addEventListener('click', async () => {
        if (!audioBlobLocal) {
            mostrarNotificacion('Primero graba un audio', 'warning');
            return;
        }
        
        try {
            btnTranscribir.disabled = true;
            btnTranscribir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transcribiendo...';
            loadingDiv.style.display = 'flex';
            
            const reader = new FileReader();
            reader.onload = async () => {
                const audioBase64 = reader.result;
                const response = await fetch(`${API_URL}/jefe-taller/transcribir-audio`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                    },
                    body: JSON.stringify({ audio: audioBase64 })
                });
                
                const data = await response.json();
                if (response.ok && data.transcripcion) {
                    const textarea = document.getElementById('diagnosticoTexto');
                    const textoActual = textarea.value;
                    const nuevaTranscripcion = data.transcripcion;
                    
                    const nuevoTexto = textoActual + (textoActual ? '\n\n' : '') + `[Transcripción del audio]:\n${nuevaTranscripcion}`;
                    textarea.value = nuevoTexto;
                    mostrarNotificacion('Audio transcrito correctamente', 'success');
                } else {
                    throw new Error(data.error || 'Error al transcribir');
                }
            };
            reader.readAsDataURL(audioBlobLocal);
        } catch (error) {
            console.error('Error en transcripción:', error);
            mostrarNotificacion(error.message, 'error');
        } finally {
            btnTranscribir.disabled = false;
            btnTranscribir.innerHTML = '<i class="fas fa-language"></i> Transcribir Audio';
            loadingDiv.style.display = 'none';
        }
    });
    
    btnEliminar.addEventListener('click', () => {
        audioBlobLocal = null;
        audioChunksLocal = [];
        audioPreview.src = '';
        audioPreview.style.display = 'none';
        btnTranscribir.style.display = 'none';
        btnEliminar.style.display = 'none';
        mostrarNotificacion('Audio eliminado', 'info');
    });
}

async function guardarGestionOrden() {
    if (!ordenEnGestion) return;
    
    try {
        mostrarNotificacion('Guardando cambios...', 'info');
        
        // Obtener técnicos seleccionados
        const tecnicosSeleccionados = Array.from(document.querySelectorAll('#tecnicosGrid input:checked')).map(cb => parseInt(cb.value));
        
        // Obtener planificación
        const bahia = document.getElementById('bahiaSelect').value;
        const fechaInicio = document.getElementById('fechaInicio').value;
        const horasEstimadas = parseFloat(document.getElementById('horasEstimadas').value);
        
        // Obtener diagnóstico y audio
        const diagnostico = document.getElementById('diagnosticoTexto').value;
        let audioUrl = null;
        
        // Si hay audio grabado, subirlo a Cloudinary
        const audioPreview = document.getElementById('audioPreviewDiagnostico');
        if (audioPreview && audioPreview.src && audioPreview.src.startsWith('blob:')) {
            // Hay un nuevo audio grabado (blob)
            const response = await fetch(audioPreview.src);
            const blob = await response.blob();
            const audioBase64 = await getAudioBase64FromBlob(blob);
            
            const audioResponse = await fetch(`${API_URL}/jefe-taller/subir-audio-diagnostico`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({ audio: audioBase64, id_orden: ordenEnGestion.id })
            });
            const audioData = await audioResponse.json();
            if (audioResponse.ok) {
                audioUrl = audioData.url;
            }
        } else if (ordenEnGestion.diagnostico_audio_url && audioPreview && !audioPreview.src.startsWith('blob:')) {
            // Mantener el audio existente
            audioUrl = ordenEnGestion.diagnostico_audio_url;
        }
        
        // Guardar técnicos
        if (tecnicosSeleccionados.length > 0) {
            await fetch(`${API_URL}/jefe-taller/asignar-tecnicos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({ id_orden: ordenEnGestion.id, tecnicos: tecnicosSeleccionados })
            });
        }
        
        // Guardar planificación
        if (bahia && fechaInicio && horasEstimadas > 0) {
            await fetch(`${API_URL}/jefe-taller/planificar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({ 
                    id_orden: ordenEnGestion.id, 
                    bahia: parseInt(bahia), 
                    fecha_inicio: fechaInicio, 
                    horas_estimadas: horasEstimadas 
                })
            });
        }
        
        // Guardar diagnóstico con audio
        await fetch(`${API_URL}/jefe-taller/diagnostico-inicial`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({ 
                id_orden: ordenEnGestion.id, 
                diagnostico: diagnostico,
                audio_url: audioUrl
            })
        });
        
        mostrarNotificacion('Cambios guardados correctamente', 'success');
        cerrarModalGestionOrden();
        await cargarOrdenesActivas();
        
    } catch (error) {
        console.error('Error guardando cambios:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function getAudioBase64FromBlob(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

function cerrarModalGestionOrden() {
    const modal = document.getElementById('modalGestionOrden');
    if (modal) modal.classList.remove('show');
    ordenEnGestion = null;
}

// =====================================================
// OTRAS FUNCIONES
// =====================================================

async function reanudarOrden(idOrden) {
    try {
        mostrarNotificacion('Reanudando orden...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/reanudar-orden`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({ id_orden: idOrden })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mostrarNotificacion('Orden reanudada correctamente', 'success');
            await cargarOrdenesActivas();
        } else {
            throw new Error(data.error || 'Error al reanudar orden');
        }
    } catch (error) {
        console.error('Error reanudando orden:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

async function verDetalleOrden(idOrden) {
    try {
        mostrarNotificacion('Cargando detalle de orden...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (!response.ok || !data.detalle) throw new Error(data.error || 'Error cargando detalle');
        
        const detalle = data.detalle;
        const modal = document.getElementById('modalDetalleOrden');
        const body = document.getElementById('modalDetalleOrdenBody');
        
        // Generar HTML para las fotos de recepción
        const fotosHtml = detalle.fotos ? renderFotosDetalle(detalle.fotos) : '';
        
        // Generar HTML para el audio de recepción
        const audioRecepcionHtml = detalle.audio_url ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-microphone"></i> Grabación del Problema (Recepción)</h4>
                <audio controls style="width: 100%;">
                    <source src="${detalle.audio_url}" type="audio/mpeg">
                    Tu navegador no soporta audio
                </audio>
            </div>
        ` : '';
        
        // Generar HTML para el audio del diagnóstico inicial
        const audioDiagnosticoHtml = detalle.diagnostico_audio_url ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-microphone"></i> Grabación del Diagnóstico Inicial</h4>
                <audio controls style="width: 100%;">
                    <source src="${detalle.diagnostico_audio_url}" type="audio/mpeg">
                    Tu navegador no soporta audio
                </audio>
            </div>
        ` : '';
        
        // Generar HTML para la planificación
        let planificacionHtml = '';
        if (detalle.planificacion && (detalle.planificacion.bahia_asignada || detalle.planificacion.fecha_hora_inicio_estimado)) {
            planificacionHtml = `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-calendar-alt"></i> Planificación</h4>
                    <div class="detalle-grid">
                        ${detalle.planificacion.bahia_asignada ? `
                            <div class="detalle-item">
                                <span class="detalle-label">Bahía</span>
                                <span class="detalle-value">Bahía ${detalle.planificacion.bahia_asignada}</span>
                            </div>
                        ` : ''}
                        ${detalle.planificacion.fecha_hora_inicio_estimado ? `
                            <div class="detalle-item">
                                <span class="detalle-label">Inicio estimado</span>
                                <span class="detalle-value">${new Date(detalle.planificacion.fecha_hora_inicio_estimado).toLocaleString()}</span>
                            </div>
                        ` : ''}
                        ${detalle.planificacion.horas_estimadas ? `
                            <div class="detalle-item">
                                <span class="detalle-label">Horas estimadas</span>
                                <span class="detalle-value">${detalle.planificacion.horas_estimadas} horas</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
        // Generar HTML para los jefes operativos
        let jefesHtml = '';
        
        if (detalle.jefe_operativo && detalle.jefe_operativo.nombre) {
            jefesHtml += `
                <div class="detalle-item">
                    <span class="detalle-label">Jefe Principal</span>
                    <span class="detalle-value">${escapeHtml(detalle.jefe_operativo.nombre)}</span>
                    ${detalle.jefe_operativo.contacto ? `<span class="detalle-value-small">📞 ${escapeHtml(detalle.jefe_operativo.contacto)}</span>` : ''}
                </div>
            `;
        }
        
        if (detalle.jefe_operativo_2 && detalle.jefe_operativo_2.nombre) {
            jefesHtml += `
                <div class="detalle-item">
                    <span class="detalle-label">Jefe Secundario</span>
                    <span class="detalle-value">${escapeHtml(detalle.jefe_operativo_2.nombre)}</span>
                    ${detalle.jefe_operativo_2.contacto ? `<span class="detalle-value-small">📞 ${escapeHtml(detalle.jefe_operativo_2.contacto)}</span>` : ''}
                </div>
            `;
        }
        
        body.innerHTML = `
            <div class="detalle-orden">
                <div class="detalle-seccion">
                    <h4><i class="fas fa-info-circle"></i> Información General</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Código</span>
                            <span class="detalle-value">${detalle.codigo_unico}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Estado</span>
                            <span class="detalle-value ${detalle.estado_global}">${detalle.estado_global}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Fecha ingreso</span>
                            <span class="detalle-value">${new Date(detalle.fecha_ingreso).toLocaleString()}</span>
                        </div>
                        ${detalle.fecha_salida ? `
                            <div class="detalle-item">
                                <span class="detalle-label">Fecha salida</span>
                                <span class="detalle-value">${new Date(detalle.fecha_salida).toLocaleString()}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                ${jefesHtml ? `
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-user-tie"></i> Jefes Operativos que registraron</h4>
                        <div class="detalle-grid">
                            ${jefesHtml}
                        </div>
                    </div>
                ` : ''}
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-user"></i> Datos del Cliente</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Nombre</span>
                            <span class="detalle-value">${escapeHtml(detalle.cliente?.nombre || 'No registrado')}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Teléfono</span>
                            <span class="detalle-value">${escapeHtml(detalle.cliente?.telefono || 'No registrado')}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Ubicación</span>
                            <span class="detalle-value">${escapeHtml(detalle.cliente?.ubicacion || 'No registrada')}</span>
                        </div>
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-car"></i> Datos del Vehículo</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Placa</span>
                            <span class="detalle-value">${escapeHtml(detalle.placa)}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Marca/Modelo</span>
                            <span class="detalle-value">${escapeHtml(detalle.marca)} ${escapeHtml(detalle.modelo)}</span>
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
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-pencil-alt"></i> Descripción del Problema (Recepción)</h4>
                    <div class="detalle-descripcion">
                        ${escapeHtml(detalle.transcripcion_problema || 'No se registró descripción del problema')}
                    </div>
                </div>
                
                ${audioRecepcionHtml}
                ${fotosHtml}
                
                ${planificacionHtml}
                
                ${detalle.diagnostico_inicial ? `
                    <div class="detalle-seccion">
                        <h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4>
                        <div class="detalle-descripcion">
                            ${escapeHtml(detalle.diagnostico_inicial)}
                        </div>
                    </div>
                ` : ''}
                
                ${audioDiagnosticoHtml}
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-users"></i> Técnicos Asignados</h4>
                    <div class="orden-tecnicos">
                        ${detalle.tecnicos && detalle.tecnicos.length > 0 ? 
                            detalle.tecnicos.map(t => `<span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>`).join('') :
                            '<span>Sin técnicos asignados</span>'}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="cerrarModalDetalleOrden()">Cerrar</button>
            </div>
        `;
        
        modal.classList.add('show');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message || 'Error cargando detalle', 'error');
    }
}

function cerrarModalDetalleOrden() {
    document.getElementById('modalDetalleOrden').classList.remove('show');
}

function renderFotosDetalle(fotos) {
    if (!fotos) return '';
    
    const fotosList = [];
    const camposMap = {
        'url_lateral_izquierda': 'Lateral Izquierdo',
        'url_lateral_derecha': 'Lateral Derecho',
        'url_foto_frontal': 'Frontal',
        'url_foto_trasera': 'Trasera',
        'url_foto_superior': 'Superior',
        'url_foto_inferior': 'Inferior',
        'url_foto_tablero': 'Tablero'
    };
    
    const fotosConUrl = Object.entries(fotos)
        .filter(([key, url]) => url && camposMap[key])
        .map(([key, url]) => ({
            url: url,
            nombre: camposMap[key],
            key: key
        }));
    
    if (fotosConUrl.length === 0) return '';
    
    fotosConUrl.forEach(foto => {
        fotosList.push(`
            <div class="detalle-foto-item" onclick="verImagenAmpliada('${foto.url}')">
                <img src="${foto.url}" alt="${foto.nombre}" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                <span class="detalle-foto-label">${foto.nombre}</span>
            </div>
        `);
    });
    
    return `
        <div class="detalle-seccion">
            <h4><i class="fas fa-camera"></i> Fotos de Recepción (${fotosConUrl.length}/7)</h4>
            <div class="detalle-fotos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem;">
                ${fotosList.join('')}
            </div>
        </div>
    `;
}

async function verHistorialDiagnosticos(idOrden) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/historial-diagnosticos/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error('Error cargando historial');
        
        const diagnosticos = data.diagnosticos || [];
        const modal = document.getElementById('modalHistorialDiagnostico');
        const body = document.getElementById('modalHistorialDiagnosticoBody');
        
        if (diagnosticos.length === 0) {
            body.innerHTML = '<div class="empty-state"><p>No hay diagnósticos técnicos registrados</p></div>';
        } else {
            body.innerHTML = `
                <div class="diagnostico-historial">
                    ${diagnosticos.map(d => `
                        <div class="diagnostico-historial-item">
                            <div class="diagnostico-version">Versión ${d.version}</div>
                            <div class="diagnostico-fecha">
                                <i class="far fa-calendar-alt"></i> ${new Date(d.fecha_envio).toLocaleString()}
                                <span class="badge" style="margin-left: 0.5rem;">${escapeHtml(d.tecnico_nombre)}</span>
                            </div>
                            <div class="diagnostico-informe">
                                ${escapeHtml(d.informe || 'Sin informe detallado')}
                            </div>
                            ${d.fotos && d.fotos.length > 0 ? `
                                <div class="diagnostico-fotos">
                                    ${d.fotos.map(f => `<div class="diagnostico-foto" style="background-image: url('${f.url_foto}')" onclick="verImagenAmpliada('${f.url_foto}')"></div>`).join('')}
                                </div>
                            ` : ''}
                            ${d.observaciones ? `
                                <div class="observacion" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(245,158,11,0.1); border-radius: 8px;">
                                    <i class="fas fa-comment"></i> <strong>Observación del Jefe Taller:</strong><br>
                                    ${escapeHtml(d.observaciones)}
                                </div>
                            ` : ''}
                            ${!d.aprobado && d.estado !== 'aprobado' ? `
                                <div class="modal-footer" style="margin-top: 0.5rem; padding: 0;">
                                    <button class="btn-success" onclick="aprobarDiagnosticoTecnico(${d.id}, true)">Aprobar</button>
                                    <button class="btn-danger" onclick="abrirModalObservacionRechazo(${d.id})">Rechazar</button>
                                </div>
                            ` : d.aprobado ? `
                                <div class="badge-success" style="margin-top: 0.5rem;"><i class="fas fa-check-circle"></i> Aprobado</div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        modal.classList.add('show');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error cargando historial', 'error');
    }
}

function cerrarModalHistorialDiagnostico() {
    document.getElementById('modalHistorialDiagnostico').classList.remove('show');
}

function abrirModalObservacionRechazo(idDiagnostico) {
    const observacion = prompt('Ingresa la observación para el técnico (motivo del rechazo):');
    if (observacion && observacion.trim()) {
        aprobarDiagnosticoTecnico(idDiagnostico, false, observacion.trim());
    }
}

async function aprobarDiagnosticoTecnico(idDiagnostico, aceptado, observacion = null) {
    try {
        mostrarNotificacion(aceptado ? 'Aprobando diagnóstico...' : 'Rechazando diagnóstico...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/aprobar-diagnostico`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({ id_diagnostico: idDiagnostico, aceptado, observacion })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mostrarNotificacion(aceptado ? 'Diagnóstico aprobado' : 'Diagnóstico rechazado con observaciones', 'success');
            await cargarOrdenesActivas();
        } else {
            throw new Error(data.error || 'Error al procesar diagnóstico');
        }
    } catch (error) {
        console.error('Error procesando diagnóstico:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// FUNCIONES DE FILTRADO
// =====================================================

function filtrarOrdenesActivas() {
    const searchTerm = document.getElementById('searchActivas')?.value.toLowerCase() || '';
    const tecnicoFiltro = document.getElementById('tecnicoFiltro')?.value;
    const estadoFiltro = document.getElementById('estadoFiltroActivas')?.value;
    
    let filtradas = [...ordenesActivas];
    
    if (searchTerm) {
        filtradas = filtradas.filter(o => 
            (o.codigo_unico?.toLowerCase().includes(searchTerm)) ||
            (o.placa?.toLowerCase().includes(searchTerm)) ||
            (o.cliente_nombre?.toLowerCase().includes(searchTerm))
        );
    }
    
    if (tecnicoFiltro) {
        filtradas = filtradas.filter(o => 
            o.tecnicos && o.tecnicos.some(t => t.id == tecnicoFiltro)
        );
    }
    
    if (estadoFiltro) {
        filtradas = filtradas.filter(o => o.estado_global === estadoFiltro);
    }
    
    renderOrdenesActivas(filtradas);
}

function filtrarOrdenesFinalizadas() {
    const searchTerm = document.getElementById('searchFinalizadas')?.value.toLowerCase() || '';
    const fechaDesde = document.getElementById('fechaDesdeFinalizadas')?.value;
    const fechaHasta = document.getElementById('fechaHastaFinalizadas')?.value;
    
    let filtradas = [...ordenesFinalizadas];
    
    if (searchTerm) {
        filtradas = filtradas.filter(o => 
            (o.codigo_unico?.toLowerCase().includes(searchTerm)) ||
            (o.placa?.toLowerCase().includes(searchTerm)) ||
            (o.cliente_nombre?.toLowerCase().includes(searchTerm))
        );
    }
    
    if (fechaDesde) {
        filtradas = filtradas.filter(o => o.fecha_ingreso >= fechaDesde);
    }
    if (fechaHasta) {
        filtradas = filtradas.filter(o => o.fecha_ingreso <= fechaHasta + 'T23:59:59');
    }
    
    renderOrdenesFinalizadas(filtradas);
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(() => {
        cargarOrdenesActivas();
    }, 10000);
}

function verImagenAmpliada(url) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.innerHTML = `
        <div class="modal-imagen-content">
            <button class="modal-imagen-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            <img src="${url}" alt="Imagen ampliada">
            <p style="text-align: center; margin-top: 10px;">Haz clic fuera para cerrar</p>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
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
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && document.body.contains(toast)) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
        }
    }, 3000);
}

// Exponer funciones globales
window.reanudarOrden = reanudarOrden;
window.aprobarDiagnosticoTecnico = aprobarDiagnosticoTecnico;
window.verDetalleOrden = verDetalleOrden;
window.verHistorialDiagnosticos = verHistorialDiagnosticos;
window.verImagenAmpliada = verImagenAmpliada;
window.abrirModalGestionOrden = abrirModalGestionOrden;
window.abrirModalObservacionRechazo = abrirModalObservacionRechazo;
window.cerrarModalGestionOrden = cerrarModalGestionOrden;
window.cerrarModalDetalleOrden = cerrarModalDetalleOrden;
window.cerrarModalHistorialDiagnostico = cerrarModalHistorialDiagnostico;
window.guardarGestionOrden = guardarGestionOrden;