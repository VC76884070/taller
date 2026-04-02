// =====================================================
// COMUNICADOS - JEFE OPERATIVO
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';
let quillEditor = null;
let comunicadosData = [];
let currentFilter = 'todos';
let editingId = null;
let userInfo = null;

// Elementos DOM
const btnNuevoComunicado = document.getElementById('btnNuevoComunicado');
const btnCerrarEditor = document.getElementById('btnCerrarEditor');
const btnCancelar = document.getElementById('btnCancelar');
const btnGuardarComunicado = document.getElementById('btnGuardarComunicado');
const editorColumn = document.getElementById('editorColumn');
const listaColumn = document.getElementById('listaColumn');
const comunicadosList = document.getElementById('comunicadosList');
const comunicadosCount = document.getElementById('comunicadosCount');
const editorTitle = document.getElementById('editorTitle');
const comunicadoTitulo = document.getElementById('comunicadoTitulo');
const comunicadoPrioridad = document.getElementById('comunicadoPrioridad');
const comunicadoEstado = document.getElementById('comunicadoEstado');
const estadoLabel = document.getElementById('estadoLabel');
const destTodos = document.getElementById('destTodos');
const destinatariosGrid = document.getElementById('destinatariosGrid');
const filterTabs = document.querySelectorAll('.filter-tab');
const currentDateSpan = document.getElementById('currentDate');
const notificacionesCount = document.getElementById('notificacionesCount');

// Modal
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
let confirmActionBtn = document.getElementById('confirmActionBtn');
let pendingConfirmAction = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    initQuill();
    await loadComunicados();
    setupEventListeners();
    iniciarPollingNotificaciones();
    
    // Asegurar que la lista ocupe todo el ancho al inicio
    listaColumn.classList.add('full-width');
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    userInfo = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || (userInfo.rol !== 'jefe_operativo' && userInfo.id_rol !== 2)) {
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

// Inicializar editor Quill
function initQuill() {
    quillEditor = new Quill('#editorQuill', {
        theme: 'snow',
        placeholder: 'Escribe el contenido del comunicado aquí...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'color': [] }, { 'background': [] }],
                ['link', 'clean']
            ]
        }
    });
}

// =====================================================
// CARGAR COMUNICADOS DESDE API
// =====================================================
async function loadComunicados() {
    try {
        mostrarLoading(true);
        
        const response = await fetch(`${API_URL}/jefe-operativo/comunicados`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar comunicados');
        }
        
        comunicadosData = result.data || [];
        renderComunicados();
        
    } catch (error) {
        console.error('Error cargando comunicados:', error);
        mostrarNotificacion('Error al cargar comunicados: ' + error.message, 'error');
        
        if (comunicadosList) {
            comunicadosList.innerHTML = `
                <div class="loading-comunicados">
                    <i class="fas fa-exclamation-circle" style="color: var(--rojo-primario);"></i>
                    <p>Error al cargar comunicados</p>
                </div>
            `;
        }
    } finally {
        mostrarLoading(false);
    }
}

function mostrarLoading(mostrar) {
    if (comunicadosList && mostrar) {
        comunicadosList.innerHTML = `
            <div class="loading-comunicados">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando comunicados...</p>
            </div>
        `;
    }
}

// Renderizar comunicados
function renderComunicados() {
    let filteredData = comunicadosData;
    
    if (currentFilter === 'activos') {
        filteredData = comunicadosData.filter(c => c.estado === 'activo');
    } else if (currentFilter === 'inactivos') {
        filteredData = comunicadosData.filter(c => c.estado === 'inactivo');
    }
    
    // Ordenar por fecha (más reciente primero)
    filteredData.sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
    
    if (comunicadosCount) {
        comunicadosCount.textContent = filteredData.length;
    }
    
    if (filteredData.length === 0) {
        comunicadosList.innerHTML = `
            <div class="loading-comunicados">
                <i class="fas fa-bullhorn" style="opacity: 0.2; font-size: 3rem;"></i>
                <p style="margin-top: 1rem;">No hay comunicados para mostrar</p>
            </div>
        `;
        return;
    }
    
    comunicadosList.innerHTML = filteredData.map(com => `
        <div class="comunicado-card ${com.estado}" data-id="${com.id}">
            <div class="comunicado-prioridad">
                <span class="prioridad-badge ${com.prioridad}">${com.prioridad.toUpperCase()}</span>
            </div>
            <div class="comunicado-header">
                <h4 class="comunicado-titulo">${escapeHtml(com.titulo)}</h4>
                <span class="comunicado-fecha">
                    <i class="far fa-calendar-alt"></i>
                    ${formatFecha(com.fecha_creacion)}
                </span>
            </div>
            <div class="comunicado-contenido">
                ${stripHtml(com.contenido)}
            </div>
            <div class="comunicado-footer">
                <div class="comunicado-destinatarios">
                    ${getDestinatariosTags(com.destinatarios || [])}
                </div>
                <div class="comunicado-actions">
                    <button class="btn-card editar" onclick="event.stopPropagation(); editarComunicado(${com.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-card estado" onclick="event.stopPropagation(); toggleEstadoComunicado(${com.id})" title="${com.estado === 'activo' ? 'Desactivar' : 'Activar'}">
                        <i class="fas ${com.estado === 'activo' ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button class="btn-card eliminar" onclick="event.stopPropagation(); eliminarComunicado(${com.id})" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Formatear fecha
function formatFecha(fechaISO) {
    if (!fechaISO) return '-';
    const fecha = new Date(fechaISO);
    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    
    if (fecha.toDateString() === hoy.toDateString()) {
        return `Hoy, ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
    } else if (fecha.toDateString() === ayer.toDateString()) {
        return `Ayer, ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
    } else {
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
}

// Obtener tags de destinatarios
function getDestinatariosTags(destinatarios) {
    const nombres = {
        'jefe_operativo': 'Jefe Operativo',
        'jefe_taller': 'Jefe Taller',
        'tecnico': 'Técnicos',
        'encargado_repuestos': 'Enc. Repuestos',
        'admin_general': 'Admin General'
    };
    
    return destinatarios.map(d => `
        <span class="destinatario-tag">${nombres[d] || d}</span>
    `).join('');
}

// Eliminar HTML
function stripHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

// =====================================================
// CRUD DE COMUNICADOS
// =====================================================
async function guardarComunicado() {
    // Validaciones
    if (!comunicadoTitulo.value.trim()) {
        mostrarNotificacion('El título es requerido', 'warning');
        comunicadoTitulo.focus();
        return;
    }
    
    const contenido = quillEditor.root.innerHTML;
    if (!contenido || contenido === '<p><br></p>' || quillEditor.getText().trim().length < 10) {
        mostrarNotificacion('El contenido debe tener al menos 10 caracteres', 'warning');
        return;
    }
    
    // Obtener destinatarios seleccionados
    const destinatarios = [];
    document.querySelectorAll('.dest-rol:checked').forEach(cb => {
        destinatarios.push(cb.value);
    });
    
    if (destinatarios.length === 0) {
        mostrarNotificacion('Selecciona al menos un destinatario', 'warning');
        return;
    }
    
    const comunicado = {
        titulo: comunicadoTitulo.value.trim(),
        contenido: contenido,
        prioridad: comunicadoPrioridad.value,
        estado: comunicadoEstado.checked ? 'activo' : 'inactivo',
        destinatarios: destinatarios
    };
    
    const btnGuardar = document.getElementById('btnGuardarComunicado');
    const textoOriginal = btnGuardar?.innerHTML;
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }
    
    try {
        let url = `${API_URL}/jefe-operativo/comunicados`;
        let method = 'POST';
        
        if (editingId) {
            url = `${API_URL}/jefe-operativo/comunicados/${editingId}`;
            method = 'PUT';
        }
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify(comunicado)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al guardar comunicado');
        }
        
        mostrarNotificacion(editingId ? 'Comunicado actualizado correctamente' : 'Comunicado publicado correctamente', 'success');
        
        await loadComunicados();
        showEditor(false);
        resetForm();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = textoOriginal;
        }
    }
}

async function editarComunicado(id) {
    const comunicado = comunicadosData.find(c => c.id === id);
    if (!comunicado) return;
    
    editingId = id;
    editorTitle.textContent = 'Editar Comunicado';
    
    comunicadoTitulo.value = comunicado.titulo;
    comunicadoPrioridad.value = comunicado.prioridad;
    comunicadoEstado.checked = comunicado.estado === 'activo';
    estadoLabel.textContent = comunicado.estado === 'activo' ? 'Activo' : 'Inactivo';
    
    // Destinatarios
    document.querySelectorAll('.dest-rol').forEach(cb => {
        cb.checked = comunicado.destinatarios?.includes(cb.value) || false;
    });
    
    // Actualizar checkbox "Todos"
    const allChecked = Array.from(document.querySelectorAll('.dest-rol')).every(c => c.checked);
    destTodos.checked = allChecked;
    destTodos.indeterminate = !allChecked && Array.from(document.querySelectorAll('.dest-rol')).some(c => c.checked);
    
    quillEditor.root.innerHTML = comunicado.contenido;
    
    showEditor(true);
}

async function toggleEstadoComunicado(id) {
    const comunicado = comunicadosData.find(c => c.id === id);
    if (!comunicado) return;
    
    const nuevoEstado = comunicado.estado === 'activo' ? 'inactivo' : 'activo';
    const accion = nuevoEstado === 'activo' ? 'activar' : 'desactivar';
    
    showConfirmModal(`¿Estás seguro de que deseas ${accion} este comunicado?`, async () => {
        try {
            const response = await fetch(`${API_URL}/jefe-operativo/comunicados/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({ estado: nuevoEstado })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Error al cambiar estado');
            }
            
            await loadComunicados();
            mostrarNotificacion(`Comunicado ${nuevoEstado === 'activo' ? 'activado' : 'desactivado'}`, 'success');
            
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion(error.message, 'error');
        }
    });
}

async function eliminarComunicado(id) {
    showConfirmModal('¿Estás seguro de que deseas eliminar este comunicado? Esta acción no se puede deshacer.', async () => {
        try {
            const response = await fetch(`${API_URL}/jefe-operativo/comunicados/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                }
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Error al eliminar comunicado');
            }
            
            await loadComunicados();
            mostrarNotificacion('Comunicado eliminado correctamente', 'success');
            
            if (editingId === id) {
                showEditor(false);
                resetForm();
            }
            
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion(error.message, 'error');
        }
    });
}

// =====================================================
// FUNCIONES DEL EDITOR
// =====================================================
function showEditor(show) {
    const comunicadosGrid = document.querySelector('.comunicados-grid');
    
    if (show) {
        editorColumn.classList.add('visible');
        comunicadosGrid.classList.add('with-editor');
        listaColumn.classList.remove('full-width');
        
        setTimeout(() => {
            editorColumn.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        editorColumn.classList.remove('visible');
        comunicadosGrid.classList.remove('with-editor');
        listaColumn.classList.add('full-width');
        resetForm();
    }
}

function resetForm() {
    comunicadoTitulo.value = '';
    comunicadoPrioridad.value = 'normal';
    comunicadoEstado.checked = true;
    estadoLabel.textContent = 'Activo';
    destTodos.checked = true;
    document.querySelectorAll('.dest-rol').forEach(cb => cb.checked = true);
    
    if (quillEditor) {
        quillEditor.setText('');
    }
    
    editingId = null;
    editorTitle.textContent = 'Nuevo Comunicado';
}

function isFormDirty() {
    return comunicadoTitulo.value.trim() !== '' || 
           (quillEditor && quillEditor.getText().trim() !== '') ||
           editingId !== null;
}

// =====================================================
// EVENT LISTENERS
// =====================================================
function setupEventListeners() {
    // Botones principales
    btnNuevoComunicado.addEventListener('click', () => {
        resetForm();
        showEditor(true);
    });
    
    btnCerrarEditor.addEventListener('click', () => {
        if (isFormDirty()) {
            showConfirmModal('¿Cancelar la edición? Los cambios no guardados se perderán.', () => {
                showEditor(false);
                resetForm();
            });
        } else {
            showEditor(false);
            resetForm();
        }
    });
    
    btnCancelar.addEventListener('click', () => {
        if (isFormDirty()) {
            showConfirmModal('¿Cancelar la edición? Los cambios no guardados se perderán.', () => {
                showEditor(false);
                resetForm();
            });
        } else {
            showEditor(false);
            resetForm();
        }
    });
    
    btnGuardarComunicado.addEventListener('click', guardarComunicado);
    
    // Toggle estado
    comunicadoEstado.addEventListener('change', () => {
        estadoLabel.textContent = comunicadoEstado.checked ? 'Activo' : 'Inactivo';
    });
    
    // Checkbox "Todos"
    destTodos.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.dest-rol');
        checkboxes.forEach(cb => {
            cb.checked = destTodos.checked;
        });
    });
    
    // Checkboxes individuales
    document.querySelectorAll('.dest-rol').forEach(cb => {
        cb.addEventListener('change', () => {
            const allChecked = Array.from(document.querySelectorAll('.dest-rol')).every(c => c.checked);
            destTodos.checked = allChecked;
            destTodos.indeterminate = !allChecked && Array.from(document.querySelectorAll('.dest-rol')).some(c => c.checked);
        });
    });
    
    // Filtros
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderComunicados();
        });
    });
}

// =====================================================
// MODAL DE CONFIRMACIÓN
// =====================================================
function showConfirmModal(message, onConfirm) {
    if (!confirmModal || !confirmMessage || !confirmActionBtn) return;
    
    confirmMessage.textContent = message;
    pendingConfirmAction = onConfirm;
    
    // Remover event listeners anteriores
    const newConfirmBtn = confirmActionBtn.cloneNode(true);
    confirmActionBtn.parentNode.replaceChild(newConfirmBtn, confirmActionBtn);
    confirmActionBtn = newConfirmBtn;
    
    confirmActionBtn.addEventListener('click', () => {
        if (pendingConfirmAction) {
            pendingConfirmAction();
            pendingConfirmAction = null;
        }
        cerrarConfirmModal();
    });
    
    confirmModal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function cerrarConfirmModal() {
    if (confirmModal) {
        confirmModal.classList.remove('show');
        document.body.style.overflow = '';
        pendingConfirmAction = null;
    }
}

// Cerrar modal con tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal && confirmModal.classList.contains('show')) {
        cerrarConfirmModal();
    }
});

// Cerrar modal haciendo clic fuera
if (confirmModal) {
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            cerrarConfirmModal();
        }
    });
}

// =====================================================
// NOTIFICACIONES
// =====================================================
let notificacionesInterval = null;

function iniciarPollingNotificaciones() {
    if (notificacionesInterval) clearInterval(notificacionesInterval);
    
    notificacionesInterval = setInterval(async () => {
        await cargarNotificaciones();
    }, 30000);
}

async function cargarNotificaciones() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/notificaciones`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.data) {
            const noLeidas = result.data.filter(n => !n.leida).length;
            if (notificacionesCount) {
                notificacionesCount.textContent = noLeidas;
                notificacionesCount.style.display = noLeidas > 0 ? 'inline-block' : 'none';
            }
        }
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
    }
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
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
        <span>${escapeHtml(mensaje)}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// LOGOUT
// =====================================================
window.logout = () => {
    if (notificacionesInterval) clearInterval(notificacionesInterval);
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};

// Exportar funciones globales
window.editarComunicado = editarComunicado;
window.toggleEstadoComunicado = toggleEstadoComunicado;
window.eliminarComunicado = eliminarComunicado;
window.cerrarConfirmModal = cerrarConfirmModal;
window.logout = logout;