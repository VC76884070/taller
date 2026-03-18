// =====================================================
// COMUNICADOS - JEFE OPERATIVO
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';
let quillEditor = null;
let comunicadosData = [];
let currentFilter = 'todos';
let editingId = null;

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

// Modal
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
let confirmActionBtn = document.getElementById('confirmActionBtn');

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initPage();
    initQuill();
    await loadComunicados();
    setupEventListeners();
    
    // Asegurar que la lista ocupe todo el ancho al inicio
    listaColumn.classList.add('full-width');
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

// Configurar event listeners
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
// FUNCIONES DEL EDITOR
// =====================================================
function showEditor(show) {
    const comunicadosGrid = document.querySelector('.comunicados-grid');
    
    if (show) {
        // Mostrar editor y cambiar a dos columnas
        editorColumn.classList.add('visible');
        comunicadosGrid.classList.add('with-editor');
        listaColumn.classList.remove('full-width');
        
        // Scroll suave hacia el editor
        setTimeout(() => {
            editorColumn.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        // Ocultar editor y volver a una columna
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
    
    // Limpiar Quill editor
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
// CARGAR DATOS DESDE API
// =====================================================
async function loadComunicados() {
    try {
        comunicadosList.innerHTML = `
            <div class="loading-comunicados">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando comunicados...</p>
            </div>
        `;
        
        // Simulación - Reemplazar con llamada real a la API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Datos de ejemplo
        comunicadosData = [
            {
                id: 1,
                titulo: 'Reunión de personal obligatoria',
                contenido: 'Se convoca a reunión general de personal para el día viernes a las 8:00 am en la sala de capacitación. Se tratarán temas sobre nuevos procedimientos y metas del mes.',
                fecha: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                prioridad: 'urgente',
                estado: 'activo',
                destinatarios: ['jefe_taller', 'tecnico', 'encargado_repuestos']
            },
            {
                id: 2,
                titulo: 'Mantenimiento de equipos',
                contenido: 'Se realizará mantenimiento preventivo a los elevadores y compresores durante el fin de semana. Por favor coordinar con el encargado de taller.',
                fecha: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                prioridad: 'importante',
                estado: 'activo',
                destinatarios: ['jefe_taller', 'tecnico']
            },
            {
                id: 3,
                titulo: 'Nuevos horarios de atención',
                contenido: 'A partir del próximo mes, el horario de atención se extenderá hasta las 8:00 pm. Se asignarán turnos rotativos. Favor de revisar el nuevo cronograma.',
                fecha: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                prioridad: 'normal',
                estado: 'inactivo',
                destinatarios: ['jefe_operativo', 'jefe_taller', 'tecnico', 'encargado_repuestos', 'admin_general']
            },
            {
                id: 4,
                titulo: 'Permisos por feriado nacional',
                contenido: 'Se recuerda que el día lunes es feriado nacional. Los que deseen tomar permiso deben solicitarlo con 48 horas de anticipación.',
                fecha: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
                prioridad: 'normal',
                estado: 'activo',
                destinatarios: ['jefe_taller', 'tecnico', 'encargado_repuestos']
            },
            {
                id: 5,
                titulo: 'Actualización de sistema',
                contenido: 'El día miércoles se realizará una actualización del sistema de gestión. El taller permanecerá cerrado de 2:00 pm a 4:00 pm.',
                fecha: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
                prioridad: 'importante',
                estado: 'inactivo',
                destinatarios: ['jefe_operativo', 'jefe_taller', 'encargado_repuestos', 'admin_general']
            }
        ];
        
        renderComunicados();
        
    } catch (error) {
        console.error('Error:', error);
        comunicadosList.innerHTML = `
            <div class="loading-comunicados">
                <i class="fas fa-exclamation-circle" style="color: #C1121F;"></i>
                <p>Error al cargar comunicados</p>
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
    filteredData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    comunicadosCount.textContent = filteredData.length;
    
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
                <h4 class="comunicado-titulo">${com.titulo}</h4>
                <span class="comunicado-fecha">
                    <i class="far fa-calendar-alt"></i>
                    ${formatFecha(com.fecha)}
                </span>
            </div>
            <div class="comunicado-contenido">
                ${stripHtml(com.contenido)}
            </div>
            <div class="comunicado-footer">
                <div class="comunicado-destinatarios">
                    ${getDestinatariosTags(com.destinatarios)}
                </div>
                <div class="comunicado-actions">
                    <button class="btn-card editar" onclick="editarComunicado(${com.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-card estado" onclick="toggleEstadoComunicado(${com.id})" title="${com.estado === 'activo' ? 'Desactivar' : 'Activar'}">
                        <i class="fas ${com.estado === 'activo' ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button class="btn-card eliminar" onclick="eliminarComunicado(${com.id})" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Formatear fecha
function formatFecha(fechaISO) {
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
    
    if (quillEditor.getText().trim().length < 10) {
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
        id: editingId || Date.now(),
        titulo: comunicadoTitulo.value.trim(),
        contenido: quillEditor.root.innerHTML,
        prioridad: comunicadoPrioridad.value,
        estado: comunicadoEstado.checked ? 'activo' : 'inactivo',
        destinatarios: destinatarios,
        fecha: new Date().toISOString()
    };
    
    try {
        // Simular guardado
        await new Promise(resolve => setTimeout(resolve, 800));
        
        if (editingId) {
            // Editar existente
            const index = comunicadosData.findIndex(c => c.id === editingId);
            if (index !== -1) {
                comunicadosData[index] = { ...comunicadosData[index], ...comunicado };
            }
            mostrarNotificacion('Comunicado actualizado correctamente', 'success');
        } else {
            // Nuevo comunicado
            comunicadosData.unshift(comunicado);
            mostrarNotificacion('Comunicado publicado correctamente', 'success');
        }
        
        renderComunicados();
        showEditor(false);
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al guardar el comunicado', 'error');
    }
}

window.editarComunicado = (id) => {
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
        cb.checked = comunicado.destinatarios.includes(cb.value);
    });
    
    // Actualizar checkbox "Todos"
    const allChecked = Array.from(document.querySelectorAll('.dest-rol')).every(c => c.checked);
    destTodos.checked = allChecked;
    destTodos.indeterminate = !allChecked && Array.from(document.querySelectorAll('.dest-rol')).some(c => c.checked);
    
    quillEditor.root.innerHTML = comunicado.contenido;
    
    showEditor(true);
};

window.toggleEstadoComunicado = (id) => {
    const comunicado = comunicadosData.find(c => c.id === id);
    if (!comunicado) return;
    
    const nuevoEstado = comunicado.estado === 'activo' ? 'inactivo' : 'activo';
    const accion = nuevoEstado === 'activo' ? 'activar' : 'desactivar';
    
    showConfirmModal(`¿Estás seguro de que deseas ${accion} este comunicado?`, () => {
        comunicado.estado = nuevoEstado;
        renderComunicados();
        mostrarNotificacion(`Comunicado ${comunicado.estado === 'activo' ? 'activado' : 'desactivado'}`, 'success');
    });
};

window.eliminarComunicado = (id) => {
    showConfirmModal('¿Estás seguro de que deseas eliminar este comunicado? Esta acción no se puede deshacer.', () => {
        comunicadosData = comunicadosData.filter(c => c.id !== id);
        renderComunicados();
        mostrarNotificacion('Comunicado eliminado correctamente', 'success');
        
        if (editingId === id) {
            showEditor(false);
        }
    });
};

// =====================================================
// MODAL DE CONFIRMACIÓN - MEJORADO
// =====================================================
function showConfirmModal(message, onConfirm) {
    // Asegurar que los elementos existen
    if (!confirmModal || !confirmMessage || !confirmActionBtn) {
        console.error('Elementos del modal no encontrados');
        return;
    }
    
    // Establecer el mensaje
    confirmMessage.textContent = message;
    
    // Remover event listeners anteriores clonando el botón
    const newConfirmBtn = confirmActionBtn.cloneNode(true);
    confirmActionBtn.parentNode.replaceChild(newConfirmBtn, confirmActionBtn);
    confirmActionBtn = newConfirmBtn;
    
    // Agregar nuevo event listener
    confirmActionBtn.addEventListener('click', function() {
        onConfirm();
        cerrarConfirmModal();
    });
    
    // Mostrar modal
    confirmModal.classList.add('show');
    
    // Prevenir scroll del body
    document.body.style.overflow = 'hidden';
}

window.cerrarConfirmModal = () => {
    if (confirmModal) {
        confirmModal.classList.remove('show');
        // Restaurar scroll del body
        document.body.style.overflow = '';
    }
};

// Cerrar modal con tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal && confirmModal.classList.contains('show')) {
        cerrarConfirmModal();
    }
});

// Cerrar modal haciendo clic fuera del contenido
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
function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;
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
        <span>${mensaje}</span>
    `;
    
    toast.style.cssText = `
        background: white;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        animation: slideIn 0.3s ease;
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#2C3E50'};
        min-width: 300px;
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