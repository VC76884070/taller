// =====================================================
// ÓRDENES DE TRABAJO - JEFE TALLER (OPTIMIZADO)
// =====================================================

const API_URL = '/api';
let userInfo = null;
let pollingInterval = null;
let rolesUsuario = [];

let ordenesActivas = [];
let ordenesFinalizadas = [];
let tecnicosDisponibles = [];
let ordenEnGestion = null;
let audioBlob = null;
let audioChunks = [];
let isRecording = false;
let mediaRecorder = null;

// Cache para datos que cambian poco
const dataCache = {
    tecnicos: { data: null, timestamp: null, ttl: 30000 }, // 30 segundos
    bahias: { data: null, timestamp: null, ttl: 10000 },   // 10 segundos
    
    get(key) {
        const item = this[key];
        if (item.data && item.timestamp && (Date.now() - item.timestamp) < item.ttl) {
            return item.data;
        }
        return null;
    },
    
    set(key, data) {
        const item = this[key];
        if (item) {
            item.data = data;
            item.timestamp = Date.now();
        }
    },
    
    clear(key) {
        if (key && this[key]) {
            this[key].data = null;
            this[key].timestamp = null;
        } else {
            Object.keys(this).forEach(k => {
                if (this[k] && typeof this[k] === 'object' && this[k].hasOwnProperty('data')) {
                    this[k].data = null;
                    this[k].timestamp = null;
                }
            });
        }
    }
};

// =====================================================
// VERIFICAR SI LA ORDEN PUEDE SER EDITADA
// =====================================================

function puedeEditarOrden(estadoGlobal, trabajoIniciado = false) {
    if (trabajoIniciado) {
        return { 
            editable: false, 
            mensaje: `🔒 El técnico ya comenzó el trabajo en esta orden. No se puede modificar hasta que complete el diagnóstico.` 
        };
    }
    
    const estadosBloqueados = ['Finalizado', 'Entregado'];
    
    if (estadosBloqueados.includes(estadoGlobal)) {
        return { 
            editable: false, 
            mensaje: `❌ La orden está en estado "${estadoGlobal}". No se puede modificar.` 
        };
    }
    
    return { editable: true, mensaje: null };
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    // Cargar datos iniciales en paralelo
    await Promise.all([
        cargarTecnicos(),
        cargarOrdenesActivas(),
        cargarOrdenesFinalizadas()
    ]);
    
    iniciarPolling();
    
    // Limpiar caché cuando la página se oculta
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Recargar datos al volver a la pestaña
            cargarOrdenesActivas(true);
            cargarOrdenesFinalizadas(true);
        }
    });
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userInfo = payload.user;
        
        if (userInfo && userInfo.roles && Array.isArray(userInfo.roles)) {
            rolesUsuario = userInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            rolesUsuario = user.roles || [];
            if (userInfo) userInfo.roles = rolesUsuario;
        }
        
        const tieneRolPermitido = rolesUsuario.includes('jefe_taller') || rolesUsuario.includes('jefe_operativo');
        
        if (!tieneRolPermitido) {
            window.location.href = '/';
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
        return false;
    }
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
    
    const userNombreSpan = document.getElementById('userNombre');
    if (userNombreSpan && userInfo) {
        userNombreSpan.textContent = userInfo.nombre || userInfo.email || 'Usuario';
    }
}

function setupEventListeners() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            cambiarPestana(tabId);
        });
    });
    
    document.getElementById('refreshActivas')?.addEventListener('click', () => cargarOrdenesActivas(true));
    document.getElementById('refreshFinalizadas')?.addEventListener('click', () => cargarOrdenesFinalizadas(true));
    
    const searchActivas = document.getElementById('searchActivas');
    const tecnicoFiltro = document.getElementById('tecnicoFiltro');
    const estadoFiltroActivas = document.getElementById('estadoFiltroActivas');
    
    if (searchActivas) {
        searchActivas.addEventListener('input', debounce(() => filtrarOrdenesActivas(), 300));
    }
    if (tecnicoFiltro) tecnicoFiltro.addEventListener('change', () => filtrarOrdenesActivas());
    if (estadoFiltroActivas) estadoFiltroActivas.addEventListener('change', () => filtrarOrdenesActivas());
    
    const searchFinalizadas = document.getElementById('searchFinalizadas');
    const fechaDesdeFinalizadas = document.getElementById('fechaDesdeFinalizadas');
    const fechaHastaFinalizadas = document.getElementById('fechaHastaFinalizadas');
    
    if (searchFinalizadas) {
        searchFinalizadas.addEventListener('input', debounce(() => filtrarOrdenesFinalizadas(), 300));
    }
    if (fechaDesdeFinalizadas) fechaDesdeFinalizadas.addEventListener('change', () => filtrarOrdenesFinalizadas());
    if (fechaHastaFinalizadas) fechaHastaFinalizadas.addEventListener('change', () => filtrarOrdenesFinalizadas());
    
    // Cerrar modales con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarModalGestionOrden();
            cerrarModalDetalleOrden();
            cerrarModalHistorialDiagnostico();
        }
    });
}

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function cambiarPestana(tabId) {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');
    
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabId));
    panels.forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tabId}`));
}

// =====================================================
// API CALLS OPTIMIZADOS
// =====================================================

async function cargarTecnicos(forceRefresh = false) {
    try {
        // Usar caché si está disponible
        if (!forceRefresh) {
            const cachedTecnicos = dataCache.get('tecnicos');
            if (cachedTecnicos) {
                tecnicosDisponibles = cachedTecnicos;
                actualizarFiltroTecnicos();
                return;
            }
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/tecnicos`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.tecnicos) {
            tecnicosDisponibles = data.tecnicos;
            dataCache.set('tecnicos', tecnicosDisponibles);
            actualizarFiltroTecnicos();
        }
    } catch (error) {
        console.error('Error cargando técnicos:', error);
        mostrarNotificacion('Error al cargar técnicos', 'error');
    }
}

function actualizarFiltroTecnicos() {
    const selectTecnico = document.getElementById('tecnicoFiltro');
    if (selectTecnico && tecnicosDisponibles.length > 0) {
        selectTecnico.innerHTML = '<option value="">Todos los técnicos</option>' +
            tecnicosDisponibles.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)} (${t.ordenes_activas}/${t.max_vehiculos})</option>`).join('');
    }
}

async function cargarOrdenesActivas(forceRefresh = false) {
    try {
        // Mostrar loading solo si no hay datos
        const container = document.getElementById('ordenesActivasList');
        if (!ordenesActivas.length && container) {
            container.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando órdenes activas...</p></div>`;
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-activas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.ordenes) {
            ordenesActivas = data.ordenes;
            const countElement = document.getElementById('activasCount');
            if (countElement) countElement.textContent = ordenesActivas.length;
            renderOrdenesActivas(ordenesActivas);
        } else {
            throw new Error(data.error || 'Error al cargar órdenes');
        }
    } catch (error) {
        console.error('Error cargando órdenes activas:', error);
        const container = document.getElementById('ordenesActivasList');
        if (container) {
            container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar órdenes: ${error.message}</p><button onclick="cargarOrdenesActivas(true)">Reintentar</button></div>`;
        }
    }
}

async function cargarOrdenesFinalizadas(forceRefresh = false) {
    try {
        const container = document.getElementById('ordenesFinalizadasList');
        if (!ordenesFinalizadas.length && container) {
            container.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando órdenes finalizadas...</p></div>`;
        }
        
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-finalizadas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok && data.ordenes) {
            ordenesFinalizadas = data.ordenes;
            const countElement = document.getElementById('finalizadasCount');
            if (countElement) countElement.textContent = ordenesFinalizadas.length;
            renderOrdenesFinalizadas(ordenesFinalizadas);
        } else {
            throw new Error(data.error || 'Error al cargar órdenes');
        }
    } catch (error) {
        console.error('Error cargando órdenes finalizadas:', error);
        const container = document.getElementById('ordenesFinalizadasList');
        if (container) {
            container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar órdenes: ${error.message}</p><button onclick="cargarOrdenesFinalizadas(true)">Reintentar</button></div>`;
        }
    }
}

// =====================================================
// RENDER FUNCTIONS OPTIMIZADAS
// =====================================================

function renderOrdenesActivas(ordenes) {
    const container = document.getElementById('ordenesActivasList');
    if (!container) return;
    
    if (!ordenes || ordenes.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-tasks"></i><p>No hay órdenes activas</p></div>`;
        return;
    }
    
    // Usar DocumentFragment para mejorar rendimiento
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');
    
    tempDiv.innerHTML = ordenes.map(orden => `
        <div class="orden-card" data-id="${orden.id}">
            <div class="orden-card-header">
                <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                <span class="orden-estado ${orden.estado_global}">${orden.estado_global}</span>
                <span class="recepcion-fecha"><i class="far fa-calendar-alt"></i> ${new Date(orden.fecha_ingreso).toLocaleDateString()}</span>
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
                    <span class="orden-info-label">Técnicos</span>
                    <div class="orden-tecnicos">
                        ${orden.tecnicos && orden.tecnicos.length > 0 ? 
                            orden.tecnicos.map(t => `<span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>`).join('') :
                            '<span class="tecnico-badge">Sin asignar</span>'}
                    </div>
                </div>
                ${orden.bahia_asignada ? `<div class="orden-info-item"><span class="orden-info-label">Bahía</span><span class="orden-info-value">Bahía ${orden.bahia_asignada}</span></div>` : ''}
                ${orden.fecha_hora_inicio_estimado ? `<div class="orden-info-item"><span class="orden-info-label">Inicio estimado</span><span class="orden-info-value">${new Date(orden.fecha_hora_inicio_estimado).toLocaleString()}</span></div>` : ''}
                ${orden.trabajo_iniciado ? `<div class="orden-info-item trabajo-iniciado"><i class="fas fa-play-circle"></i> <strong>Trabajo iniciado por el técnico</strong></div>` : ''}
            </div>
            <div class="orden-card-footer">
                <button class="btn-accion-orden btn-gestionar" onclick="window.abrirModalGestionOrden(${orden.id})" ${orden.trabajo_iniciado ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    <i class="fas fa-edit"></i> Gestionar Orden
                </button>
                <button class="btn-accion-orden btn-ver-detalle-orden" onclick="window.verDetalleOrden(${orden.id})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            </div>
        </div>
    `).join('');
    
    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
    }
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

function renderOrdenesFinalizadas(ordenes) {
    const container = document.getElementById('ordenesFinalizadasList');
    if (!container) return;
    
    if (!ordenes || ordenes.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>No hay órdenes finalizadas</p></div>`;
        return;
    }
    
    container.innerHTML = ordenes.map(orden => `
        <div class="orden-card" data-id="${orden.id}">
            <div class="orden-card-header">
                <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                <span class="orden-estado ${orden.estado_global}">${orden.estado_global}</span>
                <span class="recepcion-fecha"><i class="far fa-calendar-alt"></i> ${new Date(orden.fecha_ingreso).toLocaleDateString()}</span>
            </div>
            <div class="orden-card-body">
                <div class="orden-info-item"><span class="orden-info-label">Cliente</span><span class="orden-info-value">${escapeHtml(orden.cliente_nombre || 'N/A')}</span></div>
                <div class="orden-info-item"><span class="orden-info-label">Vehículo</span><span class="orden-info-value">${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')} (${escapeHtml(orden.placa || '')})</span></div>
                <div class="orden-info-item"><span class="orden-info-label">Fecha entrega</span><span class="orden-info-value">${orden.fecha_entrega ? new Date(orden.fecha_entrega).toLocaleDateString() : 'N/A'}</span></div>
            </div>
            <div class="orden-card-footer">
                <button class="btn-accion-orden btn-ver-detalle-orden" onclick="window.verDetalleOrden(${orden.id})"><i class="fas fa-eye"></i> Ver Detalle</button>
            </div>
        </div>
    `).join('');
}

function filtrarOrdenesActivas() {
    const searchTerm = document.getElementById('searchActivas')?.value?.toLowerCase() || '';
    const tecnicoFiltro = document.getElementById('tecnicoFiltro')?.value || '';
    const estadoFiltro = document.getElementById('estadoFiltroActivas')?.value || '';
    
    let filtradas = [...ordenesActivas];
    
    if (searchTerm) {
        filtradas = filtradas.filter(o => 
            (o.codigo_unico?.toLowerCase().includes(searchTerm)) ||
            (o.placa?.toLowerCase().includes(searchTerm)) ||
            (o.cliente_nombre?.toLowerCase().includes(searchTerm))
        );
    }
    if (tecnicoFiltro) {
        filtradas = filtradas.filter(o => o.tecnicos && o.tecnicos.some(t => t.id == tecnicoFiltro));
    }
    if (estadoFiltro) {
        filtradas = filtradas.filter(o => o.estado_global === estadoFiltro);
    }
    renderOrdenesActivas(filtradas);
}

function filtrarOrdenesFinalizadas() {
    const searchTerm = document.getElementById('searchFinalizadas')?.value?.toLowerCase() || '';
    const fechaDesde = document.getElementById('fechaDesdeFinalizadas')?.value || '';
    const fechaHasta = document.getElementById('fechaHastaFinalizadas')?.value || '';
    
    let filtradas = [...ordenesFinalizadas];
    
    if (searchTerm) {
        filtradas = filtradas.filter(o => 
            (o.codigo_unico?.toLowerCase().includes(searchTerm)) ||
            (o.placa?.toLowerCase().includes(searchTerm)) ||
            (o.cliente_nombre?.toLowerCase().includes(searchTerm))
        );
    }
    if (fechaDesde) filtradas = filtradas.filter(o => o.fecha_ingreso >= fechaDesde);
    if (fechaHasta) filtradas = filtradas.filter(o => o.fecha_ingreso <= fechaHasta + 'T23:59:59');
    
    renderOrdenesFinalizadas(filtradas);
}

// =====================================================
// GENERAR GRID DE BAHÍAS VISUAL
// =====================================================

function generarGridBahias(bahiasEstado, bahiaActual) {
    if (!bahiasEstado || bahiasEstado.length === 0) {
        bahiasEstado = Array.from({ length: 12 }, (_, i) => ({ numero: i + 1, estado: 'libre', orden_codigo: null }));
    }
    
    return bahiasEstado.map(bahia => {
        const num = bahia.numero;
        const estado = bahia.estado;
        const esActual = bahiaActual === num;
        
        let puedeSeleccionar = (estado === 'libre') || (estado === 'reservado' && esActual);
        
        let estadoClass = '', estadoIcono = '', estadoTexto = '';
        switch (estado) {
            case 'ocupado': estadoClass = 'ocupada'; estadoIcono = '🔴'; estadoTexto = 'Ocupada'; puedeSeleccionar = false; break;
            case 'reservado': estadoClass = esActual ? 'reservada actual' : 'reservada'; estadoIcono = '🟡'; estadoTexto = esActual ? 'Actual' : 'Reservada'; break;
            default: estadoClass = 'libre'; estadoIcono = '🟢'; estadoTexto = 'Libre';
        }
        
        let infoAdicional = '';
        if (estado === 'reservado' && bahia.fecha_inicio_estimado && !esActual) {
            const fecha = new Date(bahia.fecha_inicio_estimado);
            infoAdicional = `<div class="bahia-hora">${fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>`;
        }
        if (estado === 'reservado' && esActual) infoAdicional = `<div class="bahia-hora actual-hora">Tu reserva</div>`;
        
        return `
            <div class="bahia-item ${estadoClass} ${esActual ? 'selected' : ''}" 
                 data-bahia="${num}" data-estado="${estado}"
                 style="${!puedeSeleccionar ? 'opacity: 0.6; cursor: not-allowed;' : ''}">
                <div class="bahia-numero">${num}</div>
                <div class="bahia-estado-icono">${estadoIcono}</div>
                <div class="bahia-estado-texto">${estadoTexto}</div>
                ${bahia.orden_codigo ? `<div class="bahia-orden">${escapeHtml(bahia.orden_codigo.substring(0, 8))}</div>` : ''}
                ${infoAdicional}
            </div>
        `;
    }).join('');
}

function configurarSeleccionBahiasVisual() {
    document.querySelectorAll('.bahia-item').forEach(item => {
        const bahiaNum = parseInt(item.dataset.bahia);
        const estado = item.dataset.estado;
        const esActual = item.classList.contains('actual');
        
        let puedeSeleccionar = false;
        let mensaje = '';
        
        if (estado === 'libre') puedeSeleccionar = true;
        else if (estado === 'reservado' && esActual) puedeSeleccionar = true;
        else if (estado === 'ocupado') mensaje = `Bahía ${bahiaNum} está ocupada`;
        else if (estado === 'reservado') mensaje = `Bahía ${bahiaNum} está reservada`;
        
        if (!puedeSeleccionar) {
            item.style.cursor = 'not-allowed';
            item.onclick = () => mostrarNotificacion(mensaje, 'warning');
        } else {
            item.style.cursor = 'pointer';
            item.onclick = () => window.seleccionarBahiaVisual(bahiaNum);
        }
    });
}

window.seleccionarBahiaVisual = function(bahiaNum) {
    const bahiaItem = document.querySelector(`.bahia-item[data-bahia="${bahiaNum}"]`);
    if (!bahiaItem) return;
    
    const estado = bahiaItem.dataset.estado;
    const esActual = bahiaItem.classList.contains('actual');
    
    if (estado === 'ocupado') return mostrarNotificacion(`❌ Bahía ${bahiaNum} está ocupada`, 'error');
    if (estado === 'reservado' && !esActual) return mostrarNotificacion(`❌ Bahía ${bahiaNum} está reservada`, 'error');
    
    document.querySelectorAll('.bahia-item').forEach(i => i.classList.remove('selected'));
    bahiaItem.classList.add('selected');
    document.getElementById('bahiaSeleccionada').value = bahiaNum;
    
    const sectionHeader = bahiaItem.closest('.gestion-section')?.querySelector('.section-status');
    if (sectionHeader) {
        sectionHeader.textContent = 'Planificado';
        sectionHeader.classList.add('completado');
        sectionHeader.classList.remove('pendiente');
    }
    
    mostrarNotificacion(estado === 'reservado' ? `🟡 Bahía ${bahiaNum} (tu reserva) seleccionada` : `🟢 Bahía ${bahiaNum} seleccionada`, 'success');
};

function configurarSeleccionTecnicos() {
    const checkboxes = document.querySelectorAll('#tecnicosGrid input[type="checkbox"]');
    const maxTecnicos = 2;
    
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const seleccionados = Array.from(checkboxes).filter(cb => cb.checked && !cb.disabled).length;
            if (seleccionados > maxTecnicos) {
                checkbox.checked = false;
                mostrarNotificacion(`Máximo ${maxTecnicos} técnicos por orden`, 'warning');
                return;
            }
            const parent = checkbox.closest('.tecnico-option');
            if (checkbox.checked) parent.classList.add('selected');
            else parent.classList.remove('selected');
            
            const sectionHeader = checkbox.closest('.gestion-section').querySelector('.section-status');
            const nuevosSeleccionados = Array.from(checkboxes).filter(cb => cb.checked && !cb.disabled).length;
            sectionHeader.textContent = nuevosSeleccionados > 0 ? `${nuevosSeleccionados}/${maxTecnicos} técnicos` : 'Pendiente';
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
    
    let mediaRecorderLocal = null, isRecordingLocal = false, audioBlobLocal = null, audioChunksLocal = [];
    
    if (existingAudioUrl) {
        if (btnTranscribir) btnTranscribir.style.display = 'flex';
        if (btnEliminar) btnEliminar.style.display = 'flex';
        if (audioPreview) {
            audioPreview.style.display = 'block';
            audioPreview.src = existingAudioUrl;
        }
    }
    
    if (btnGrabar) {
        btnGrabar.addEventListener('click', async () => {
            if (!isRecordingLocal) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorderLocal = new MediaRecorder(stream);
                    audioChunksLocal = [];
                    mediaRecorderLocal.ondataavailable = (event) => audioChunksLocal.push(event.data);
                    mediaRecorderLocal.onstop = () => {
                        audioBlobLocal = new Blob(audioChunksLocal, { type: 'audio/wav' });
                        if (audioPreview) {
                            audioPreview.src = URL.createObjectURL(audioBlobLocal);
                            audioPreview.style.display = 'block';
                        }
                        if (btnTranscribir) btnTranscribir.style.display = 'flex';
                        if (btnEliminar) btnEliminar.style.display = 'flex';
                        stream.getTracks().forEach(track => track.stop());
                    };
                    mediaRecorderLocal.start();
                    isRecordingLocal = true;
                    btnGrabar.innerHTML = '<i class="fas fa-stop"></i> Detener Grabación';
                    btnGrabar.classList.add('recording');
                } catch (error) {
                    mostrarNotificacion('Error accediendo al micrófono', 'error');
                }
            } else {
                mediaRecorderLocal.stop();
                isRecordingLocal = false;
                btnGrabar.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
                btnGrabar.classList.remove('recording');
            }
        });
    }
    
    if (btnTranscribir) {
        btnTranscribir.addEventListener('click', async () => {
            if (!audioBlobLocal) return mostrarNotificacion('Primero graba un audio', 'warning');
            try {
                btnTranscribir.disabled = true;
                btnTranscribir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transcribiendo...';
                if (loadingDiv) loadingDiv.style.display = 'flex';
                
                const reader = new FileReader();
                reader.onload = async () => {
                    const response = await fetch(`${API_URL}/jefe-taller/transcribir-audio`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` },
                        body: JSON.stringify({ audio: reader.result })
                    });
                    const data = await response.json();
                    if (response.ok && data.transcripcion) {
                        const textarea = document.getElementById('diagnosticoTexto');
                        if (textarea) {
                            const textoActual = textarea.value;
                            textarea.value = textoActual + (textoActual ? '\n\n' : '') + `[Transcripción del audio]:\n${data.transcripcion}`;
                        }
                        mostrarNotificacion('Audio transcrito correctamente', 'success');
                    } else throw new Error(data.error || 'Error al transcribir');
                };
                reader.readAsDataURL(audioBlobLocal);
            } catch (error) {
                mostrarNotificacion(error.message, 'error');
            } finally {
                btnTranscribir.disabled = false;
                btnTranscribir.innerHTML = '<i class="fas fa-language"></i> Transcribir Audio';
                if (loadingDiv) loadingDiv.style.display = 'none';
            }
        });
    }
    
    if (btnEliminar) {
        btnEliminar.addEventListener('click', () => {
            audioBlobLocal = null;
            audioChunksLocal = [];
            if (audioPreview) {
                audioPreview.src = '';
                audioPreview.style.display = 'none';
            }
            if (btnTranscribir) btnTranscribir.style.display = 'none';
            if (btnEliminar) btnEliminar.style.display = 'none';
            mostrarNotificacion('Audio eliminado', 'info');
        });
    }
}

// =====================================================
// ABRIR MODAL DE GESTIÓN DE ORDEN (OPTIMIZADO)
// =====================================================

async function abrirModalGestionOrden(idOrden) {
    try {
        mostrarNotificacion('Cargando datos de la orden...', 'info');
        
        // Cargar datos en paralelo
        const [detalleResponse, bahiasResponse, diagnosticoResponse] = await Promise.all([
            fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
            }),
            fetch(`${API_URL}/jefe-taller/bahias/estado`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
            }),
            fetch(`${API_URL}/jefe-taller/diagnostico-pendiente/${idOrden}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
            }).catch(() => ({ ok: true, json: () => ({ enviado: false }) }))
        ]);
        
        const [detalleData, bahiasData, diagnosticoInfo] = await Promise.all([
            detalleResponse.json(),
            bahiasResponse.json(),
            diagnosticoResponse.json()
        ]);
        
        if (!detalleResponse.ok || !detalleData.detalle) {
            throw new Error(detalleData.error || 'Error cargando datos');
        }
        
        ordenEnGestion = detalleData.detalle;
        
        const trabajoIniciado = ordenEnGestion.planificacion?.fecha_hora_inicio_real ? true : false;
        const estadoGlobal = ordenEnGestion.estado_global;
        
        const { editable: puedeEditar, mensaje: mensajeBloqueo } = puedeEditarOrden(estadoGlobal, trabajoIniciado);
        
        const bahiasEstado = bahiasData.success && bahiasData.bahias ? bahiasData.bahias : [];
        
        const modal = document.getElementById('modalGestionOrden');
        const body = document.getElementById('modalGestionOrdenBody');
        const footer = document.getElementById('modalGestionOrdenFooter');
        
        if (!modal || !body) return;
        
        const tecnicosSeleccionados = ordenEnGestion.tecnicos?.map(t => t.id) || [];
        const planificacionExistente = ordenEnGestion.planificacion || {};
        const hoy = new Date().toISOString().slice(0, 16);
        const fechaInicio = planificacionExistente.fecha_hora_inicio_estimado ? planificacionExistente.fecha_hora_inicio_estimado.slice(0, 16) : hoy;
        const bahiaActual = planificacionExistente.bahia_asignada;
        const MAX_ORDENES_POR_TECNICO = 2;
        
        const bahiasGridHtml = generarGridBahias(bahiasEstado, bahiaActual);
        
        const bloqueoBanner = trabajoIniciado ? `
            <div class="bloqueo-banner">
                <i class="fas fa-play-circle"></i>
                <div>
                    <strong>🔒 Orden Bloqueada - Trabajo en Curso</strong>
                    <p>El técnico ya presionó "Empezar Trabajo" en esta orden. No se pueden realizar modificaciones.</p>
                </div>
            </div>
        ` : '';
        
        const diagnosticoBloqueadoBanner = (diagnosticoInfo.enviado && diagnosticoInfo.estado === 'pendiente') ? `
            <div class="bloqueo-banner warning">
                <i class="fas fa-hourglass-half"></i>
                <div>
                    <strong>Diagnóstico en revisión</strong>
                    <p>El técnico ${escapeHtml(diagnosticoInfo.tecnico_nombre || 'asignado')} envió un diagnóstico. Esperando tu aprobación.</p>
                </div>
            </div>
        ` : '';
        
        body.innerHTML = `
            <div class="gestion-orden">
                ${bloqueoBanner}
                ${diagnosticoBloqueadoBanner}
                
                <!-- Técnicos -->
                <div class="gestion-section ${!puedeEditar ? 'bloqueada' : ''}">
                    <div class="gestion-section-header">
                        <h3><i class="fas fa-users"></i> Asignación de Técnicos</h3>
                        <span class="section-status ${tecnicosSeleccionados.length > 0 ? 'completado' : 'pendiente'}">${tecnicosSeleccionados.length > 0 ? `${tecnicosSeleccionados.length}/2 técnicos` : 'Pendiente'}</span>
                        ${!puedeEditar ? '<i class="fas fa-lock"></i>' : ''}
                    </div>
                    <div class="gestion-section-body">
                        <div class="tecnicos-grid" id="tecnicosGrid">
                            ${tecnicosDisponibles.length > 0 ? tecnicosDisponibles.map(t => {
                                const ordenesActivasTec = t.ordenes_activas || 0;
                                const estaCompleto = ordenesActivasTec >= MAX_ORDENES_POR_TECNICO;
                                const estaSeleccionado = tecnicosSeleccionados.includes(t.id);
                                const puedeSeleccionar = (!estaCompleto || estaSeleccionado) && puedeEditar;
                                const disabledAttr = !puedeSeleccionar ? 'disabled' : '';
                                return `
                                    <div class="tecnico-option ${estaSeleccionado ? 'selected' : ''}" data-id="${t.id}" style="${!puedeSeleccionar ? 'opacity: 0.6;' : ''}">
                                        <input type="checkbox" value="${t.id}" id="tecnico_${t.id}" ${estaSeleccionado ? 'checked' : ''} ${disabledAttr}>
                                        <label for="tecnico_${t.id}" class="tecnico-info">
                                            <div class="tecnico-nombre">${escapeHtml(t.nombre)}</div>
                                            <div class="tecnico-carga">${ordenesActivasTec}/${MAX_ORDENES_POR_TECNICO} vehículos</div>
                                        </label>
                                    </div>
                                `;
                            }).join('') : '<div class="sin-tecnicos">No hay técnicos disponibles</div>'}
                        </div>
                        <p class="modal-hint"><i class="fas fa-info-circle"></i> Máximo 2 técnicos por orden</p>
                    </div>
                </div>
                
                <!-- Planificación -->
                <div class="gestion-section ${!puedeEditar ? 'bloqueada' : ''}">
                    <div class="gestion-section-header">
                        <h3><i class="fas fa-calendar-alt"></i> Planificación</h3>
                        <span class="section-status ${planificacionExistente.bahia_asignada ? 'completado' : 'pendiente'}">${planificacionExistente.bahia_asignada ? 'Planificado' : 'Pendiente'}</span>
                        ${!puedeEditar ? '<i class="fas fa-lock"></i>' : ''}
                    </div>
                    <div class="gestion-section-body">
                        <div class="bahias-seleccion-section">
                            <label class="form-label required"><i class="fas fa-warehouse"></i> Selecciona una bahía:</label>
                            <div class="bahias-grid-seleccion" id="bahiasGridSeleccion">${bahiasGridHtml}</div>
                            <input type="hidden" id="bahiaSeleccionada" value="${bahiaActual || ''}">
                        </div>
                        <div class="planificacion-grid">
                            <div class="form-group">
                                <label class="form-label required"><i class="fas fa-calendar"></i> Fecha y hora inicio</label>
                                <input type="datetime-local" id="fechaInicio" class="form-input" value="${fechaInicio}" ${!puedeEditar ? 'disabled' : ''}>
                            </div>
                            <div class="form-group">
                                <label class="form-label required"><i class="fas fa-hourglass-half"></i> Horas estimadas</label>
                                <input type="number" id="horasEstimadas" class="form-input" step="0.5" min="0.5" placeholder="Ej: 2.5" value="${planificacionExistente.horas_estimadas || ''}" ${!puedeEditar ? 'disabled' : ''}>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Diagnóstico -->
                <div class="gestion-section ${!puedeEditar ? 'bloqueada' : ''}">
                    <div class="gestion-section-header">
                        <h3><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h3>
                        <span class="section-status ${ordenEnGestion.diagnostico_inicial ? 'completado' : 'pendiente'}">${ordenEnGestion.diagnostico_inicial ? 'Completado' : 'Pendiente'}</span>
                        ${!puedeEditar ? '<i class="fas fa-lock"></i>' : ''}
                    </div>
                    <div class="gestion-section-body">
                        <div class="form-group">
                            <label class="form-label required"><i class="fas fa-file-alt"></i> Diagnóstico (obligatorio)</label>
                            <textarea id="diagnosticoTexto" rows="5" class="form-textarea" placeholder="Describe el diagnóstico inicial... Este campo es obligatorio." ${!puedeEditar ? 'disabled' : ''}>${escapeHtml(ordenEnGestion.diagnostico_inicial || '')}</textarea>
                        </div>
                        <div class="diagnostico-audio">
                            <div class="diagnostico-audio-controls">
                                <button type="button" class="btn-audio" id="btnGrabarDiagnostico" ${!puedeEditar ? 'disabled' : ''}><i class="fas fa-microphone"></i> Grabar Audio</button>
                                <button type="button" class="btn-secondary" id="btnTranscribirDiagnostico" style="display: none;" ${!puedeEditar ? 'disabled' : ''}><i class="fas fa-language"></i> Transcribir Audio</button>
                                <button type="button" class="btn-secondary" id="btnEliminarAudioDiagnostico" style="display: none;" ${!puedeEditar ? 'disabled' : ''}><i class="fas fa-trash-alt"></i> Eliminar Audio</button>
                            </div>
                            <audio id="audioPreviewDiagnostico" controls style="display: ${ordenEnGestion.diagnostico_audio_url ? 'block' : 'none'}; width: 100%; margin-top: 0.5rem;">
                                ${ordenEnGestion.diagnostico_audio_url ? `<source src="${ordenEnGestion.diagnostico_audio_url}" type="audio/mpeg">` : ''}
                            </audio>
                            <div id="transcripcionLoading" style="display: none; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Transcribiendo audio...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        if (puedeEditar && !diagnosticoInfo.enviado) {
            if (footer) {
                footer.innerHTML = `
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="window.cerrarModalGestionOrden()">Cancelar</button>
                        <button class="btn-primary" onclick="window.guardarGestionOrden()"><i class="fas fa-save"></i> Guardar Cambios</button>
                    </div>
                `;
            }
        } else if (diagnosticoInfo.enviado && diagnosticoInfo.estado === 'pendiente') {
            if (footer) {
                footer.innerHTML = `
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="window.cerrarModalGestionOrden()">Cerrar</button>
                        <button class="btn-primary" onclick="window.irAprobarDiagnostico(${idOrden})"><i class="fas fa-check-circle"></i> Revisar Diagnóstico</button>
                    </div>
                `;
            }
        } else {
            if (footer) {
                footer.innerHTML = `<div class="modal-footer"><button class="btn-secondary" onclick="window.cerrarModalGestionOrden()">Cerrar</button></div>`;
            }
        }
        
        if (puedeEditar) {
            setTimeout(() => {
                configurarSeleccionTecnicos();
                configurarSeleccionBahiasVisual();
                configurarAudioDiagnostico(ordenEnGestion.diagnostico_audio_url);
            }, 100);
        }
        
        modal.classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message || 'Error cargando datos', 'error');
    }
}

// =====================================================
// GUARDAR GESTIÓN DE ORDEN - CON VALIDACIÓN COMPLETA
// =====================================================

async function guardarGestionOrden() {
    if (!ordenEnGestion) return;
    
    let errores = [];
    
    try {
        // 1. VALIDAR TÉCNICOS SELECCIONADOS
        const checkboxes = document.querySelectorAll('#tecnicosGrid input[type="checkbox"]');
        const tecnicosSeleccionados = Array.from(checkboxes)
            .filter(cb => cb.checked && !cb.disabled)
            .map(cb => parseInt(cb.value));
        
        if (tecnicosSeleccionados.length === 0) {
            errores.push('❌ Debes seleccionar al menos un técnico');
            const tecnicosSection = document.querySelector('#tecnicosGrid')?.closest('.gestion-section');
            if (tecnicosSection) {
                tecnicosSection.classList.add('validation-error');
                setTimeout(() => tecnicosSection.classList.remove('validation-error'), 3000);
            }
        }
        
        // 2. VALIDAR BAHÍA SELECCIONADA
        let bahia = document.getElementById('bahiaSeleccionada')?.value;
        if (!bahia) {
            const bahiaSeleccionada = document.querySelector('.bahia-item.selected');
            if (bahiaSeleccionada) {
                bahia = bahiaSeleccionada.dataset.bahia;
            }
        }
        
        if (!bahia) {
            errores.push('❌ Debes seleccionar una bahía');
            const bahiaSection = document.querySelector('.bahias-grid-seleccion')?.closest('.gestion-section');
            if (bahiaSection) {
                bahiaSection.classList.add('validation-error');
                setTimeout(() => bahiaSection.classList.remove('validation-error'), 3000);
            }
        }
        
        // 3. VALIDAR FECHA DE INICIO
        const fechaInicio = document.getElementById('fechaInicio')?.value;
        if (!fechaInicio) {
            errores.push('❌ Debes seleccionar una fecha y hora de inicio');
            const fechaInput = document.getElementById('fechaInicio');
            if (fechaInput) {
                fechaInput.classList.add('validation-error');
                setTimeout(() => fechaInput.classList.remove('validation-error'), 3000);
            }
        } else {
            const fechaInicioDate = new Date(fechaInicio);
            const ahora = new Date();
            const fechaMinima = new Date(ahora.getTime() - 5 * 60000);
            
            if (fechaInicioDate < fechaMinima) {
                errores.push('❌ La fecha de inicio no puede ser anterior a la fecha y hora actual');
                const fechaInput = document.getElementById('fechaInicio');
                if (fechaInput) {
                    fechaInput.classList.add('validation-error');
                    setTimeout(() => fechaInput.classList.remove('validation-error'), 3000);
                }
            }
        }
        
        // 4. VALIDAR HORAS ESTIMADAS
        const horasEstimadas = parseFloat(document.getElementById('horasEstimadas')?.value);
        if (!horasEstimadas || isNaN(horasEstimadas)) {
            errores.push('❌ Debes ingresar horas estimadas válidas');
            const horasInput = document.getElementById('horasEstimadas');
            if (horasInput) {
                horasInput.classList.add('validation-error');
                setTimeout(() => horasInput.classList.remove('validation-error'), 3000);
            }
        } else if (horasEstimadas <= 0) {
            errores.push('❌ Las horas estimadas deben ser mayores a 0');
            const horasInput = document.getElementById('horasEstimadas');
            if (horasInput) {
                horasInput.classList.add('validation-error');
                setTimeout(() => horasInput.classList.remove('validation-error'), 3000);
            }
        } else if (horasEstimadas > 24) {
            const confirmar = confirm('⚠️ Las horas estimadas exceden 24 horas. ¿Deseas continuar de todos modos?');
            if (!confirmar) {
                errores.push('❌ Horas estimadas exceden el límite de 24 horas');
            }
        }
        
        // 5. VALIDAR DIAGNÓSTICO INICIAL
        const diagnostico = document.getElementById('diagnosticoTexto')?.value?.trim() || '';
        if (!diagnostico) {
            errores.push('❌ El diagnóstico inicial es obligatorio. Debes completarlo antes de guardar.');
            const diagnosticoTextarea = document.getElementById('diagnosticoTexto');
            if (diagnosticoTextarea) {
                diagnosticoTextarea.classList.add('validation-error');
                setTimeout(() => diagnosticoTextarea.classList.remove('validation-error'), 3000);
            }
        }
        
        if (errores.length > 0) {
            mostrarNotificacion(errores.join('\n'), 'error');
            return;
        }
        
        mostrarNotificacion('Guardando cambios...', 'info');
        
        // Verificar disponibilidad de bahía
        const bahiaActual = ordenEnGestion.planificacion?.bahia_asignada;
        if (parseInt(bahia) !== bahiaActual && fechaInicio && horasEstimadas > 0) {
            const disponibilidadResponse = await fetch(`${API_URL}/jefe-taller/verificar-bahia`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({
                    bahia: parseInt(bahia),
                    fecha_inicio: fechaInicio,
                    horas_estimadas: horasEstimadas,
                    id_orden_actual: ordenEnGestion.id
                })
            });
            
            const disponibilidadData = await disponibilidadResponse.json();
            if (!disponibilidadData.disponible) {
                mostrarNotificacion(`❌ La Bahía ${bahia} no está disponible en el horario seleccionado`, 'error');
                const bahiaSection = document.querySelector('.bahias-grid-seleccion')?.closest('.gestion-section');
                if (bahiaSection) {
                    bahiaSection.classList.add('validation-error');
                    setTimeout(() => bahiaSection.classList.remove('validation-error'), 3000);
                }
                return;
            }
        }
        
        // Procesar audio
        let audioUrl = ordenEnGestion.diagnostico_audio_url || null;
        const audioPreview = document.getElementById('audioPreviewDiagnostico');
        
        if (audioPreview && audioPreview.src && audioPreview.src.startsWith('blob:')) {
            try {
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
                if (audioResponse.ok && audioData.url) {
                    audioUrl = audioData.url;
                }
            } catch (audioError) {
                console.error('Error subiendo audio:', audioError);
                mostrarNotificacion('⚠️ Error al subir el audio, pero se guardarán los demás datos', 'warning');
            }
        }
        
        // Guardar todo en paralelo
        await Promise.all([
            fetch(`${API_URL}/jefe-taller/asignar-tecnicos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({ 
                    id_orden: ordenEnGestion.id, 
                    tecnicos: tecnicosSeleccionados,
                    tipo_asignacion: 'diagnostico'
                })
            }),
            fetch(`${API_URL}/jefe-taller/planificar`, {
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
            }),
            fetch(`${API_URL}/jefe-taller/diagnostico-inicial`, {
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
            })
        ]);
        
        cerrarModalGestionOrden();
        mostrarNotificacion('✅ Todos los cambios han sido guardados correctamente', 'success');
        
        // Limpiar cachés relacionados
        dataCache.clear('tecnicos');
        
        await Promise.all([
            cargarTecnicos(true),
            cargarOrdenesActivas(true)
        ]);
        
    } catch (error) {
        console.error('Error guardando cambios:', error);
        mostrarNotificacion(error.message || 'Error al guardar los cambios', 'error');
    }
}

function getAudioBase64FromBlob(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Error al leer el audio'));
        reader.readAsDataURL(blob);
    });
}

function cerrarModalGestionOrden() {
    const modal = document.getElementById('modalGestionOrden');
    if (modal) modal.classList.remove('show');
    ordenEnGestion = null;
}

window.irAprobarDiagnostico = function(idOrden) {
    cerrarModalGestionOrden();
    mostrarNotificacion('Redirigiendo a Diagnósticos...', 'info');
    const tabDiagnosticos = document.querySelector('.tab-btn[data-tab="diagnosticos"]');
    if (tabDiagnosticos) tabDiagnosticos.click();
};

// =====================================================
// VER DETALLE DE ORDEN
// =====================================================

async function verDetalleOrden(idOrden) {
    try {
        mostrarNotificacion('Cargando detalle...', 'info');
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        const data = await response.json();
        if (!response.ok || !data.detalle) throw new Error(data.error || 'Error cargando detalle');
        
        const detalle = data.detalle;
        const modal = document.getElementById('modalDetalleOrden');
        const body = document.getElementById('modalDetalleOrdenBody');
        
        if (!modal || !body) return;
        
        body.innerHTML = `
            <div class="detalle-orden">
                <div class="detalle-seccion"><h4><i class="fas fa-info-circle"></i> Información General</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item"><span class="detalle-label">Código</span><span class="detalle-value">${escapeHtml(detalle.codigo_unico)}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Estado</span><span class="detalle-value ${detalle.estado_global}">${detalle.estado_global}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Fecha ingreso</span><span class="detalle-value">${new Date(detalle.fecha_ingreso).toLocaleString()}</span></div>
                        ${detalle.fecha_salida ? `<div class="detalle-item"><span class="detalle-label">Fecha salida</span><span class="detalle-value">${new Date(detalle.fecha_salida).toLocaleString()}</span></div>` : ''}
                    </div>
                </div>
                <div class="detalle-seccion"><h4><i class="fas fa-user"></i> Datos del Cliente</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item"><span class="detalle-label">Nombre</span><span class="detalle-value">${escapeHtml(detalle.cliente?.nombre || 'No registrado')}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Teléfono</span><span class="detalle-value">${escapeHtml(detalle.cliente?.telefono || 'No registrado')}</span></div>
                    </div>
                </div>
                <div class="detalle-seccion"><h4><i class="fas fa-car"></i> Datos del Vehículo</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item"><span class="detalle-label">Placa</span><span class="detalle-value">${escapeHtml(detalle.placa)}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Marca/Modelo</span><span class="detalle-value">${escapeHtml(detalle.marca)} ${escapeHtml(detalle.modelo)}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Año</span><span class="detalle-value">${detalle.anio || 'N/A'}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Kilometraje</span><span class="detalle-value">${detalle.kilometraje?.toLocaleString() || '0'} km</span></div>
                    </div>
                </div>
                <div class="detalle-seccion"><h4><i class="fas fa-pencil-alt"></i> Descripción del Problema</h4>
                    <div class="detalle-descripcion">${escapeHtml(detalle.transcripcion_problema || 'No registrada')}</div>
                </div>
                ${detalle.diagnostico_inicial ? `<div class="detalle-seccion"><h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4><div class="detalle-descripcion">${escapeHtml(detalle.diagnostico_inicial)}</div></div>` : ''}
                ${detalle.diagnostico_audio_url ? `<div class="detalle-seccion"><h4><i class="fas fa-microphone-alt"></i> Audio Diagnóstico</h4><audio controls src="${detalle.diagnostico_audio_url}" style="width: 100%;"></audio></div>` : ''}
                <div class="detalle-seccion"><h4><i class="fas fa-users"></i> Técnicos Asignados</h4>
                    <div class="orden-tecnicos">${detalle.tecnicos && detalle.tecnicos.length > 0 ? detalle.tecnicos.map(t => `<span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>`).join('') : '<span>Sin técnicos asignados</span>'}</div>
                </div>
                ${detalle.planificacion && Object.keys(detalle.planificacion).length > 0 ? `
                <div class="detalle-seccion"><h4><i class="fas fa-calendar-alt"></i> Planificación</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item"><span class="detalle-label">Bahía</span><span class="detalle-value">Bahía ${detalle.planificacion.bahia_asignada || 'No asignada'}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Horas estimadas</span><span class="detalle-value">${detalle.planificacion.horas_estimadas || 'N/A'} horas</span></div>
                        <div class="detalle-item"><span class="detalle-label">Inicio estimado</span><span class="detalle-value">${detalle.planificacion.fecha_hora_inicio_estimado ? new Date(detalle.planificacion.fecha_hora_inicio_estimado).toLocaleString() : 'N/A'}</span></div>
                        ${detalle.planificacion.fecha_hora_inicio_real ? `<div class="detalle-item"><span class="detalle-label">Inicio real</span><span class="detalle-value">${new Date(detalle.planificacion.fecha_hora_inicio_real).toLocaleString()}</span></div>` : ''}
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="modal-footer"><button class="btn-secondary" onclick="window.cerrarModalDetalleOrden()">Cerrar</button></div>
        `;
        modal.classList.add('show');
    } catch (error) {
        mostrarNotificacion(error.message, 'error');
    }
}

function cerrarModalDetalleOrden() {
    const modal = document.getElementById('modalDetalleOrden');
    if (modal) modal.classList.remove('show');
}

function cerrarModalHistorialDiagnostico() {
    const modal = document.getElementById('modalHistorialDiagnostico');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    // Polling cada 30 segundos en lugar de 10
    pollingInterval = setInterval(() => {
        if (!document.hidden) {
            cargarOrdenesActivas();
        }
    }, 30000);
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
    const iconos = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Exponer funciones globales
window.verDetalleOrden = verDetalleOrden;
window.cerrarModalDetalleOrden = cerrarModalDetalleOrden;
window.cerrarModalHistorialDiagnostico = cerrarModalHistorialDiagnostico;
window.abrirModalGestionOrden = abrirModalGestionOrden;
window.cerrarModalGestionOrden = cerrarModalGestionOrden;
window.guardarGestionOrden = guardarGestionOrden;
window.seleccionarBahiaVisual = seleccionarBahiaVisual;
window.irAprobarDiagnostico = irAprobarDiagnostico;
window.cargarOrdenesActivas = cargarOrdenesActivas;
window.cargarOrdenesFinalizadas = cargarOrdenesFinalizadas;