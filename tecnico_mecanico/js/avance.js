// =====================================================
// AVANCE.JS - TÉCNICO MECÁNICO
// REGISTRO DE AVANCES DE TRABAJO
// =====================================================

const API_URL = window.location.origin + '/api/tecnico';
let token = null;
let currentUser = null;
let currentOrdenId = null;
let fotosData = {};
let avancesActuales = [];

// Configuración de Cloudinary
const CLOUDINARY_CLOUD_NAME = 'drpt6ztkd';
const CLOUDINARY_UPLOAD_PRESET = 'furia_motor_preset';

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    if (!token) token = sessionStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-BO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';

    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/';
            return null;
        }

        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');

        currentUser = {
            id: payload.user?.id || payload.id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email,
            roles: payload.user?.roles || payload.roles || userData?.roles || []
        };

        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.textContent = new Date().toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = '/';
        return null;
    }
}

function cerrarSesion() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
}

// =====================================================
// CARGAR ÓRDENES EN REPARACIÓN
// =====================================================

async function cargarOrdenesEnReparacion() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/ordenes-en-reparacion`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        console.log('Órdenes cargadas (raw):', JSON.stringify(data, null, 2));

        if (data.success) {
            const select = document.getElementById('selectOrden');
            select.innerHTML = '<option value="">-- Selecciona una orden en reparación --</option>';
            
            if (data.ordenes && data.ordenes.length > 0) {
                for (const orden of data.ordenes) {
                    // Validación más robusta
                    const hasValidId = orden.id && 
                                      orden.id !== 'null' && 
                                      orden.id !== 'undefined' && 
                                      orden.id !== 'NULL' &&
                                      orden.id !== '';
                    
                    if (hasValidId) {
                        const option = document.createElement('option');
                        option.value = orden.id;
                        option.textContent = `${orden.codigo_unico} - ${orden.vehiculo}`;
                        select.appendChild(option);
                        console.log(`✅ Opción agregada: value=${option.value}, text=${option.textContent}`);
                    } else {
                        console.warn('⚠️ Orden con ID inválido, saltando:', orden);
                    }
                }
                
                // Si no se agregó ninguna opción válida
                if (select.options.length === 1) {
                    select.innerHTML = '<option value="">-- No hay órdenes válidas en reparación --</option>';
                }
            } else {
                select.innerHTML = '<option value="">-- No hay órdenes en reparación --</option>';
            }
        } else {
            showToast(data.error || 'Error al cargar órdenes', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar órdenes', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// CARGAR AVANCES DE UNA ORDEN (CORREGIDO)
// =====================================================

async function cargarAvances() {
    // Validar que currentOrdenId sea un número válido
    if (!currentOrdenId || currentOrdenId === 'null' || currentOrdenId === 'undefined' || currentOrdenId === '') {
        showToast('Selecciona una orden válida primero', 'warning');
        return;
    }

    mostrarLoading(true);
    try {
        const id_orden = parseInt(currentOrdenId);
        if (isNaN(id_orden)) {
            showToast('ID de orden inválido', 'error');
            return;
        }

        const response = await fetch(`${API_URL}/avances?id_orden=${id_orden}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            avancesActuales = data.avances || [];
            renderizarAvances();

            const avancesSection = document.getElementById('avancesExistentes');
            if (avancesSection) avancesSection.style.display = 'block';
            
            document.getElementById('formAvance').style.display = 'none';
        } else {
            showToast(data.error || 'Error al cargar avances', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar avances', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarAvances() {
    const container = document.getElementById('listaAvances');
    if (!container) return;

    if (avancesActuales.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay avances registrados</p>
                <small>Haz clic en "Nuevo Avance" para comenzar</small>
            </div>
        `;
        return;
    }

    container.innerHTML = avancesActuales.map(avance => {
        let fotosPreview = '';
        if (avance.fotos && avance.fotos.length > 0) {
            fotosPreview = avance.fotos.slice(0, 3).map(f => `
                <img src="${f.url}" class="avance-foto-mini" onclick="event.stopPropagation(); verFotoAmpliada('${f.url}')">
            `).join('');
            if (avance.fotos.length > 3) {
                fotosPreview += `<span class="avance-foto-mas">+${avance.fotos.length - 3}</span>`;
            }
        }

        let estadoClass = '';
        let estadoText = '';
        switch (avance.estado) {
            case 'pendiente':
                estadoClass = 'status-pendiente';
                estadoText = 'Pendiente de revisión';
                break;
            case 'aprobado':
                estadoClass = 'status-aprobado';
                estadoText = '✓ Aprobado';
                break;
            case 'rechazado':
                estadoClass = 'status-rechazado';
                estadoText = '✗ Rechazado';
                break;
            default:
                estadoClass = 'status-pendiente';
                estadoText = 'Pendiente';
        }

        return `
            <div class="avance-card" onclick="verDetalleAvance(${avance.id})">
                <div class="avance-card-header">
                    <span class="avance-titulo">${escapeHtml(avance.titulo || 'Sin título')}</span>
                    <span class="avance-fecha">${formatDate(avance.fecha_creacion)}</span>
                </div>
                <div class="avance-card-body">
                    <div class="avance-descripcion">${escapeHtml(avance.descripcion || 'Sin descripción')}</div>
                    <div class="avance-fotos">${fotosPreview}</div>
                </div>
                <div class="avance-card-footer">
                    <span>${avance.fotos?.length || 0} fotos</span>
                    <span class="${estadoClass}">${estadoText}</span>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// NUEVO AVANCE
// =====================================================

function limpiarFormulario() {
    document.getElementById('tituloAvance').value = '';
    document.getElementById('descripcionAvance').value = '';
    fotosData = {};

    for (let i = 0; i < 10; i++) {
        const input = document.getElementById(`fotoInput_${i}`);
        if (input) input.value = '';
        
        const preview = document.querySelector(`.foto-upload-item[data-index="${i}"] .foto-preview`);
        if (preview) {
            preview.style.backgroundImage = '';
            preview.classList.remove('has-image');
            preview.innerHTML = '<i class="fas fa-plus-circle"></i><span>Foto ' + (i + 1) + '</span>';
        }
        
        const comentario = document.getElementById(`comentario_${i}`);
        if (comentario) comentario.value = '';
        
        const removeBtn = document.querySelector(`.foto-upload-item[data-index="${i}"] .btn-remove-foto`);
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

// =====================================================
// CONFIGURAR SUBIDA DE FOTOS (CORREGIDO)
// =====================================================

function configurarSubidaFotos() {
    for (let i = 0; i < 10; i++) {
        const input = document.getElementById(`fotoInput_${i}`);
        if (!input) continue;

        // Remover evento anterior si existe (clonando y reemplazando)
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        
        // Agregar nuevo evento
        newInput.addEventListener('change', (e) => procesarFoto(i, e));
        
        // Actualizar la referencia en el DOM (no es necesario reasignar, el evento ya está)
        console.log(`Configurada foto ${i + 1}`);
    }
}

async function procesarFoto(index, event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen no debe superar los 5MB', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('Solo se permiten archivos de imagen', 'error');
        return;
    }

    mostrarLoading(true);

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', 'avances_trabajo');

        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
        const response = await fetch(cloudinaryUrl, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.secure_url) {
            const comentarioInput = document.getElementById(`comentario_${index}`);
            fotosData[index] = {
                url: data.secure_url,
                comentario: comentarioInput ? comentarioInput.value : ''
            };

            const preview = document.querySelector(`.foto-upload-item[data-index="${index}"] .foto-preview`);
            if (preview) {
                preview.style.backgroundImage = `url('${data.secure_url}')`;
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                preview.classList.add('has-image');
                preview.innerHTML = '';
            }

            const removeBtn = document.querySelector(`.foto-upload-item[data-index="${index}"] .btn-remove-foto`);
            if (removeBtn) removeBtn.style.display = 'block';

            showToast(`Foto ${index + 1} subida correctamente`, 'success');
        }
    } catch (error) {
        console.error('Error subiendo foto:', error);
        showToast('Error al subir la foto', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function eliminarFoto(index) {
    delete fotosData[index];

    const input = document.getElementById(`fotoInput_${index}`);
    if (input) input.value = '';

    const preview = document.querySelector(`.foto-upload-item[data-index="${index}"] .foto-preview`);
    if (preview) {
        preview.style.backgroundImage = '';
        preview.classList.remove('has-image');
        preview.innerHTML = '<i class="fas fa-plus-circle"></i><span>Foto ' + (index + 1) + '</span>';
    }

    const removeBtn = document.querySelector(`.foto-upload-item[data-index="${index}"] .btn-remove-foto`);
    if (removeBtn) removeBtn.style.display = 'none';

    showToast(`Foto ${index + 1} eliminada`, 'info');
}

async function guardarAvance(estado) {
    const titulo = document.getElementById('tituloAvance').value.trim();
    const descripcion = document.getElementById('descripcionAvance').value.trim();

    if (!titulo) {
        showToast('Debes ingresar un título para el avance', 'warning');
        return;
    }

    const fotosArray = Object.entries(fotosData)
        .filter(([_, data]) => data.url)
        .map(([index, data]) => ({
            url: data.url,
            comentario: document.getElementById(`comentario_${index}`)?.value || '',
            orden: parseInt(index)
        }));

    if (fotosArray.length === 0) {
        showToast('Debes subir al menos una foto', 'warning');
        return;
    }

    mostrarLoading(true);

    try {
        const response = await fetch(`${API_URL}/avances`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden_trabajo: parseInt(currentOrdenId),
                titulo: titulo,
                descripcion: descripcion,
                fotos: fotosArray,
                estado: estado === 'pendiente' ? 'pendiente' : 'borrador'
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(estado === 'pendiente' ? '✅ Avance enviado a revisión' : '📝 Avance guardado como borrador', 'success');
            limpiarFormulario();
            document.getElementById('formAvance').style.display = 'none';
            await cargarAvances();
        } else {
            showToast(data.error || 'Error al guardar avance', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE DE AVANCE
// =====================================================

window.verDetalleAvance = async function(avanceId) {
    const avance = avancesActuales.find(a => a.id === avanceId);
    if (!avance) return;

    const fotosHtml = avance.fotos && avance.fotos.length > 0 ? `
        <div class="detalle-fotos-grid">
            ${avance.fotos.map(foto => `
                <div class="detalle-foto-item">
                    <img src="${foto.url}" onclick="verFotoAmpliada('${foto.url}')">
                    <div class="detalle-foto-comentario">${escapeHtml(foto.comentario || 'Sin comentario')}</div>
                </div>
            `).join('')}
        </div>
    ` : '<p>No hay fotos registradas</p>';

    let estadoBadge = '';
    switch (avance.estado) {
        case 'pendiente':
            estadoBadge = '<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente de revisión</span>';
            break;
        case 'aprobado':
            estadoBadge = '<span class="status-badge status-aprobado"><i class="fas fa-check-circle"></i> Aprobado</span>';
            break;
        case 'rechazado':
            estadoBadge = '<span class="status-badge status-rechazado"><i class="fas fa-times-circle"></i> Rechazado</span>';
            break;
        default:
            estadoBadge = '<span class="status-badge status-pendiente">Pendiente</span>';
    }

    const modalBody = document.getElementById('detalleAvanceBody');
    modalBody.innerHTML = `
        <div class="orden-info-card">
            <p><strong><i class="fas fa-tag"></i> Título:</strong> ${escapeHtml(avance.titulo)}</p>
            <p><strong><i class="fas fa-align-left"></i> Descripción:</strong> ${escapeHtml(avance.descripcion || 'Sin descripción')}</p>
            <p><strong><i class="fas fa-calendar"></i> Fecha:</strong> ${formatDate(avance.fecha_creacion)}</p>
            <p><strong><i class="fas fa-chart-line"></i> Estado:</strong> ${estadoBadge}</p>
            ${avance.comentario_revision ? `<p><strong><i class="fas fa-comment"></i> Comentario de revisión:</strong> ${escapeHtml(avance.comentario_revision)}</p>` : ''}
            ${avance.fecha_aprobacion ? `<p><strong><i class="fas fa-check-circle"></i> Fecha de aprobación:</strong> ${formatDate(avance.fecha_aprobacion)}</p>` : ''}
        </div>
        <div class="fotos-section">
            <h4><i class="fas fa-images"></i> Fotos del avance (${avance.fotos?.length || 0})</h4>
            ${fotosHtml}
        </div>
    `;

    abrirModal('modalDetalleAvance');
};

window.verFotoAmpliada = function(url) {
    document.getElementById('fotoAmpliada').src = url;
    const modal = document.getElementById('modalFoto');
    if (modal) modal.classList.add('show');
};

function cerrarModalFoto() {
    const modal = document.getElementById('modalFoto');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// EVENTO DEL SELECT (CORREGIDO)
// =====================================================

function setupEventListeners() {
    const selectOrden = document.getElementById('selectOrden');
    if (selectOrden) {
        selectOrden.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            console.log('Orden seleccionada:', selectedValue);
            
            if (selectedValue && selectedValue !== 'null' && selectedValue !== 'undefined' && selectedValue !== '') {
                currentOrdenId = selectedValue;
                cargarAvances();
            } else {
                currentOrdenId = null;
                document.getElementById('avancesExistentes').style.display = 'none';
                document.getElementById('formAvance').style.display = 'none';
            }
        });
    }

    const btnCargar = document.getElementById('btnCargarAvances');
    if (btnCargar) {
        btnCargar.addEventListener('click', () => {
            const select = document.getElementById('selectOrden');
            const selectedValue = select.value;
            
            if (selectedValue && selectedValue !== 'null' && selectedValue !== 'undefined' && selectedValue !== '') {
                currentOrdenId = selectedValue;
                cargarAvances();
            } else {
                showToast('Selecciona una orden primero', 'warning');
            }
        });
    }

    const btnNuevoAvance = document.getElementById('btnNuevoAvance');
    if (btnNuevoAvance) {
        btnNuevoAvance.addEventListener('click', () => {
            if (!currentOrdenId || currentOrdenId === 'null' || currentOrdenId === '') {
                showToast('Primero selecciona una orden de trabajo', 'warning');
                return;
            }
            limpiarFormulario();
            configurarSubidaFotos();
            document.getElementById('formAvance').style.display = 'block';
        });
    }

    const btnCancelarAvance = document.getElementById('btnCancelarAvance');
    if (btnCancelarAvance) {
        btnCancelarAvance.addEventListener('click', () => {
            document.getElementById('formAvance').style.display = 'none';
            limpiarFormulario();
        });
    }

    const btnGuardarAvance = document.getElementById('btnGuardarAvance');
    if (btnGuardarAvance) {
        btnGuardarAvance.addEventListener('click', () => guardarAvance('borrador'));
    }

    const btnEnviarRevision = document.getElementById('btnEnviarRevision');
    if (btnEnviarRevision) {
        btnEnviarRevision.addEventListener('click', () => guardarAvance('pendiente'));
    }

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando avance.js');

    const user = await cargarUsuarioActual();
    if (!user) return;

    await cargarOrdenesEnReparacion();
    setupEventListeners();

    console.log('✅ avance.js inicializado correctamente');
}

// Exponer funciones globales
window.cerrarSesion = cerrarSesion;
window.cerrarModal = cerrarModal;
window.verDetalleAvance = verDetalleAvance;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarModalFoto = cerrarModalFoto;
window.eliminarFoto = eliminarFoto;

document.addEventListener('DOMContentLoaded', inicializar);