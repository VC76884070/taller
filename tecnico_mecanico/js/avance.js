// =====================================================
// AVANCE.JS - TÉCNICO MECÁNICO
// REGISTRO DE AVANCES DE TRABAJO
// VERSIÓN COMPLETA - CON PREVIEW FUNCIONANDO
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
const API_URL = `${window.API_BASE_URL || ''}/tecnico`;

console.log('📡 avance.js - API_URL:', API_URL);

let token = null;
let currentUser = null;
let currentOrdenId = null;
let fotosData = {};
let avancesActuales = [];
let avanceEditandoId = null;

// Variables para la cola de subida
let colaSubida = [];
let subiendo = false;
let totalFotosSubiendo = 0;
let fotosSubidasExitosas = 0;

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
// 🔥 FUNCIÓN PARA CARGAR IMAGEN CON PROXY (REGLA DE ORO)
// =====================================================

async function cargarImagenProxy(url, imgElement, loaderElement = null) {
    if (!url || url === 'null' || url === '' || url === 'undefined') {
        if (imgElement) imgElement.style.display = 'none';
        return null;
    }

    // Mostrar loader
    if (loaderElement) {
        loaderElement.style.display = 'flex';
        loaderElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    }
    if (imgElement) {
        imgElement.style.display = 'none';
        imgElement.style.opacity = '0';
    }

    try {
        const tokenActual = getToken();
        if (!tokenActual) {
            throw new Error('No hay token de autenticación');
        }

        const proxyUrl = `${API_URL}/proxy-imagen-repuesto?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl, {
            headers: {
                'Authorization': `Bearer ${tokenActual}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.base64) {
            // Pre-cargar la imagen antes de mostrarla
            const nuevaImg = new Image();
            return new Promise((resolve) => {
                nuevaImg.onload = function() {
                    if (imgElement) {
                        imgElement.src = data.base64;
                        imgElement.style.display = 'block';
                        imgElement.style.opacity = '1';
                        imgElement.setAttribute('data-loaded', 'true');
                    }
                    if (loaderElement) loaderElement.style.display = 'none';
                    resolve(data.base64);
                };
                nuevaImg.onerror = function() {
                    if (loaderElement) {
                        loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error al cargar';
                        loaderElement.style.display = 'flex';
                    }
                    resolve(null);
                };
                nuevaImg.src = data.base64;
            });
        } else {
            if (loaderElement) {
                loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No se pudo cargar';
                loaderElement.style.display = 'flex';
            }
            return null;
        }
    } catch (error) {
        console.error('Error cargando imagen:', error);
        if (loaderElement) {
            loaderElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
            loaderElement.style.display = 'flex';
        }
        return null;
    }
}

// =====================================================
// FUNCIÓN PARA ACTUALIZAR PREVIEW DE FOTO CON PROXY
// =====================================================

async function actualizarPreviewConProxy(index, url) {
    const preview = document.getElementById(`preview_${index}`);
    if (!preview) return;

    // Mostrar loader en el preview
    preview.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--gris-texto);"></i></div>';
    preview.classList.add('has-image');

    try {
        const base64 = await cargarImagenProxy(url);
        if (base64) {
            preview.style.backgroundImage = `url('${base64}')`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.innerHTML = '';
        } else {
            preview.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--rojo-primario);font-size:2rem;"></i>';
        }
    } catch (error) {
        console.error('Error actualizando preview:', error);
        preview.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--rojo-primario);font-size:2rem;"></i>';
    }
}

// =====================================================
// ACTUALIZAR CÍRCULO DE PROGRESO
// =====================================================

function actualizarCirculoProgreso(index, porcentaje) {
    const circle = document.getElementById(`circle-progress_${index}`);
    const text = document.querySelector(`#progress_${index} text`);
    
    if (circle) {
        const circumference = 100;
        const offset = circumference - (porcentaje / 100) * circumference;
        circle.style.strokeDasharray = `${offset}, ${circumference}`;
    }
    
    if (text) {
        text.textContent = `${Math.round(porcentaje)}%`;
    }
}

function mostrarCirculoProgreso(index, porcentaje = 0) {
    const container = document.getElementById(`progress_${index}`);
    if (container) {
        container.style.display = 'flex';
        actualizarCirculoProgreso(index, porcentaje);
    }
}

function ocultarCirculoProgreso(index) {
    const container = document.getElementById(`progress_${index}`);
    if (container) {
        container.style.display = 'none';
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
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Órdenes cargadas:', data);

        if (data.success) {
            const select = document.getElementById('selectOrden');
            select.innerHTML = '<option value="">-- Selecciona una orden en reparación --</option>';
            
            if (data.ordenes && data.ordenes.length > 0) {
                for (const orden of data.ordenes) {
                    if (orden.id && orden.id !== 'null' && orden.id !== 'undefined' && orden.id !== '') {
                        const option = document.createElement('option');
                        option.value = orden.id;
                        option.textContent = `${orden.codigo_unico} - ${orden.vehiculo}`;
                        select.appendChild(option);
                    }
                }
                
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
        showToast('Error al cargar órdenes: ' + error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// CARGAR AVANCES DE UNA ORDEN
// =====================================================

async function cargarAvances() {
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
            avanceEditandoId = null;
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

// =====================================================
// RENDERIZAR AVANCES
// =====================================================

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
        let puedeActualizar = false;
        
        switch (avance.estado) {
            case 'pendiente':
                estadoClass = 'status-pendiente';
                estadoText = '⏳ Pendiente de revisión';
                puedeActualizar = true;
                break;
            case 'aprobado':
                estadoClass = 'status-aprobado';
                estadoText = '✅ Aprobado';
                puedeActualizar = false;
                break;
            case 'rechazado':
                estadoClass = 'status-rechazado';
                estadoText = '❌ Rechazado - Corregir';
                puedeActualizar = true;
                break;
            default:
                estadoClass = 'status-pendiente';
                estadoText = 'Pendiente';
                puedeActualizar = true;
        }

        const comentarioRevisionHtml = avance.comentario_revision ? `
            <div class="comentario-revision">
                <i class="fas fa-comment-dots"></i>
                <strong>Comentario del revisor:</strong>
                <p>${escapeHtml(avance.comentario_revision)}</p>
            </div>
        ` : '';

        return `
            <div class="avance-card">
                <div class="avance-card-header" onclick="verDetalleAvance(${avance.id})">
                    <span class="avance-titulo">${escapeHtml(avance.titulo || 'Sin título')}</span>
                    <span class="avance-fecha">${formatDate(avance.fecha_creacion)}</span>
                </div>
                <div class="avance-card-body" onclick="verDetalleAvance(${avance.id})">
                    <div class="avance-descripcion">${escapeHtml(avance.descripcion || 'Sin descripción')}</div>
                    <div class="avance-fotos">${fotosPreview}</div>
                    ${comentarioRevisionHtml}
                </div>
                <div class="avance-card-footer">
                    <div class="avance-info-left">
                        <span><i class="fas fa-images"></i> ${avance.fotos?.length || 0} fotos</span>
                        <span class="${estadoClass}">${estadoText}</span>
                    </div>
                    ${puedeActualizar ? `
                        <button class="btn-actualizar" onclick="event.stopPropagation(); cargarAvanceParaActualizar(${avance.id})">
                            <i class="fas fa-edit"></i> Actualizar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// FORMULARIO - LIMPIAR Y RESETEAR
// =====================================================

function limpiarPreviewLocal(index) {
    const preview = document.getElementById(`preview_${index}`);
    if (preview) {
        preview.style.backgroundImage = '';
        preview.classList.remove('has-image', 'has-error');
        preview.innerHTML = '<i class="fas fa-plus-circle"></i><span>Foto ' + (index + 1) + '</span>';
    }
    
    const input = document.getElementById(`fotoInput_${index}`);
    if (input) input.value = '';
    
    const loading = document.getElementById(`loading_${index}`);
    if (loading) {
        loading.style.display = 'none';
        loading.innerHTML = '';
    }
    
    const progressCircle = document.getElementById(`progress_${index}`);
    if (progressCircle) {
        progressCircle.style.display = 'none';
    }
    
    const removeBtn = document.querySelector(`.foto-upload-item[data-index="${index}"] .btn-remove-foto`);
    if (removeBtn) removeBtn.style.display = 'none';
}

function limpiarFormulario() {
    document.getElementById('tituloAvance').value = '';
    document.getElementById('descripcionAvance').value = '';
    fotosData = {};

    for (let i = 0; i < 10; i++) {
        limpiarPreviewLocal(i);
    }
    
    ocultarBarraProgreso();
    colaSubida = [];
    subiendo = false;
    totalFotosSubiendo = 0;
    fotosSubidasExitosas = 0;
}

function resetearBotonesFormulario() {
    const guardarBtn = document.getElementById('btnGuardarAvance');
    const enviarBtn = document.getElementById('btnEnviarRevision');
    
    if (guardarBtn) {
        guardarBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Borrador';
    }
    if (enviarBtn) {
        enviarBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar a Revisión';
    }
}

// =====================================================
// CONFIGURAR SUBIDA DE FOTOS
// =====================================================

function configurarSubidaFotos() {
    for (let i = 0; i < 10; i++) {
        const input = document.getElementById(`fotoInput_${i}`);
        if (!input) continue;

        // Clonar para eliminar eventos previos
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        
        // ✅ Asegurar que capture esté presente
        if (!newInput.hasAttribute('capture') && !newInput.getAttribute('capture')) {
            newInput.setAttribute('capture', 'environment');
        }
        
        newInput.addEventListener('change', (e) => procesarFoto(i, e));
    }
}

// =====================================================
// 🔥 PROCESAR FOTO - CON PREVIEW LOCAL INMEDIATO
// =====================================================

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

    // ✅ 1. PREVIEW LOCAL INMEDIATO (SIN ESPERAR SUBIDA)
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById(`preview_${index}`);
        if (preview) {
            preview.style.backgroundImage = `url('${e.target.result}')`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.classList.add('has-image');
            preview.innerHTML = '';
        }
        
        // ✅ 2. Mostrar círculo de progreso con 0%
        mostrarCirculoProgreso(index, 0);
        
        // ✅ 3. Mostrar loading sutil
        const loading = document.getElementById(`loading_${index}`);
        if (loading) {
            loading.style.display = 'flex';
            loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Subiendo...</span>';
        }
    };
    reader.readAsDataURL(file);

    // ✅ 4. Agregar a la cola de subida
    colaSubida.push({
        index: index,
        file: file
    });

    // ✅ 5. Mostrar barra de progreso general
    mostrarBarraProgreso();

    // ✅ 6. Iniciar procesamiento en cola si no está en curso
    if (!subiendo) {
        procesarCola();
    }
}

// =====================================================
// 🔥 PROCESAR COLA DE SUBIDA - CON PREVIEW CORREGIDO
// =====================================================

async function procesarCola() {
    if (colaSubida.length === 0) {
        subiendo = false;
        ocultarBarraProgreso();
        return;
    }

    subiendo = true;
    const item = colaSubida.shift();
    const index = item.index;
    const file = item.file;

    totalFotosSubiendo = colaSubida.length + 1;
    fotosSubidasExitosas = 0;
    
    actualizarProgreso();

    try {
        const codigo_orden = await obtenerCodigoOrden(currentOrdenId);
        if (!codigo_orden) {
            showToast('No se pudo obtener el código de la orden', 'error');
            ocultarCirculoProgreso(index);
            const loading = document.getElementById(`loading_${index}`);
            if (loading) loading.style.display = 'none';
            actualizarProgreso();
            procesarCola();
            return;
        }

        actualizarCirculoProgreso(index, 30);

        const result = await subirFotoADrive(file, codigo_orden);

        if (result.url) {
            // ✅ SUBIDA EXITOSA
            actualizarCirculoProgreso(index, 100);
            
            const comentarioInput = document.getElementById(`comentario_${index}`);
            fotosData[index] = {
                url: result.url,
                public_id: result.public_id,
                comentario: comentarioInput ? comentarioInput.value : ''
            };

            // ✅ ACTUALIZAR PREVIEW CON PROXY (REGLAS DE ORO)
            await actualizarPreviewConProxy(index, result.url);

            // ✅ OCULTAR LOADING Y CÍRCULO
            const loading = document.getElementById(`loading_${index}`);
            if (loading) loading.style.display = 'none';
            ocultarCirculoProgreso(index);

            const removeBtn = document.querySelector(`.foto-upload-item[data-index="${index}"] .btn-remove-foto`);
            if (removeBtn) removeBtn.style.display = 'block';

            fotosSubidasExitosas++;
            showToast(`Foto ${index + 1} subida correctamente a Drive`, 'success');
        } else {
            // ❌ ERROR EN SUBIDA - MANTENER PREVIEW LOCAL
            ocultarCirculoProgreso(index);
            
            const loading = document.getElementById(`loading_${index}`);
            if (loading) loading.style.display = 'none';
            showToast(`Error al subir foto ${index + 1}`, 'error');
        }
    } catch (error) {
        console.error('Error subiendo foto:', error);
        ocultarCirculoProgreso(index);
        
        const loading = document.getElementById(`loading_${index}`);
        if (loading) loading.style.display = 'none';
        showToast(`Error al subir foto ${index + 1}`, 'error');
    }

    actualizarProgreso();

    // ✅ ACTUALIZAR CÍRCULOS DE LAS FOTOS EN COLA
    colaSubida.forEach((item, idx) => {
        const progressIndex = item.index;
        const progresoIndividual = Math.round(((fotosSubidasExitosas + idx) / totalFotosSubiendo) * 100);
        actualizarCirculoProgreso(progressIndex, Math.min(progresoIndividual, 99));
    });

    setTimeout(() => {
        procesarCola();
    }, 300);
}

// =====================================================
// MOSTRAR BARRA DE PROGRESO GENERAL
// =====================================================

function mostrarBarraProgreso() {
    const container = document.getElementById('uploadProgressContainer');
    const bar = document.getElementById('uploadProgressBar');
    const text = document.getElementById('uploadProgressText');
    
    if (container) {
        container.style.display = 'block';
    }
    if (bar) {
        bar.style.width = '0%';
    }
    if (text) {
        text.textContent = '0%';
    }
}

function ocultarBarraProgreso() {
    const container = document.getElementById('uploadProgressContainer');
    if (container) {
        setTimeout(() => {
            container.style.display = 'none';
        }, 1000);
    }
}

function actualizarProgreso() {
    const total = totalFotosSubiendo || 1;
    const completadas = fotosSubidasExitosas;
    const porcentaje = Math.min(Math.round((completadas / total) * 100), 100);
    
    const bar = document.getElementById('uploadProgressBar');
    const text = document.getElementById('uploadProgressText');
    
    if (bar) {
        bar.style.width = `${porcentaje}%`;
    }
    if (text) {
        text.textContent = `${porcentaje}% (${completadas}/${total})`;
    }
}

// =====================================================
// ELIMINAR FOTO DE DRIVE
// =====================================================

async function eliminarFoto(index) {
    const fotoData = fotosData[index];
    if (!fotoData || !fotoData.public_id) {
        limpiarPreviewLocal(index);
        delete fotosData[index];
        showToast(`Foto ${index + 1} eliminada (local)`, 'info');
        return;
    }

    if (!confirm('¿Eliminar esta foto de Drive?')) return;

    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/eliminar-foto-avance-drive`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                public_id: fotoData.public_id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            limpiarPreviewLocal(index);
            delete fotosData[index];
            showToast(`Foto ${index + 1} eliminada de Drive`, 'info');
        } else {
            showToast(data.error || 'Error al eliminar foto', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// OBTENER CÓDIGO DE ORDEN
// =====================================================

async function obtenerCodigoOrden(ordenId) {
    try {
        const response = await fetch(`${API_URL}/orden-codigo/${ordenId}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.codigo_unico) {
            return data.codigo_unico;
        }
        return null;
    } catch (error) {
        console.error('Error obteniendo código de orden:', error);
        return null;
    }
}

// =====================================================
// SUBIR FOTO A GOOGLE DRIVE
// =====================================================

async function subirFotoADrive(file, codigo_orden) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('foto', file);
        formData.append('codigo_orden', codigo_orden);
        formData.append('tipo', 'avance');
        
        const uploadUrl = `${API_URL}/subir-foto-avance-drive`;
        
        fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeaders()['Authorization']
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.url) {
                resolve(data);
            } else {
                reject(new Error(data.error || 'Error al subir a Google Drive'));
            }
        })
        .catch(err => {
            reject(new Error('Error de conexión con Google Drive'));
        });
    });
}

// =====================================================
// 🔥 CARGAR AVANCE PARA ACTUALIZAR - CON PREVIEW CORREGIDO
// =====================================================

window.cargarAvanceParaActualizar = async function(avanceId) {
    const avance = avancesActuales.find(a => a.id === avanceId);
    if (!avance) return;
    
    console.log('📝 Cargando avance para actualizar:', avance);
    
    if (avance.estado === 'pendiente') {
        showToast('⚠️ Este avance está pendiente de revisión. Al actualizarlo, se notificará nuevamente al jefe de taller.', 'warning');
    } else if (avance.estado === 'rechazado') {
        showToast('📝 Este avance fue rechazado. Corrige las observaciones y vuelve a enviar.', 'info');
    }
    
    limpiarFormulario();
    
    document.getElementById('tituloAvance').value = avance.titulo || '';
    document.getElementById('descripcionAvance').value = avance.descripcion || '';
    
    if (avance.fotos && avance.fotos.length > 0) {
        for (let i = 0; i < avance.fotos.length && i < 10; i++) {
            const foto = avance.fotos[i];
            
            // ✅ GUARDAR LA URL EN fotosData
            fotosData[i] = {
                url: foto.url,
                comentario: foto.comentario || ''
            };
            
            // ✅ ACTUALIZAR PREVIEW CON PROXY (REGLAS DE ORO)
            await actualizarPreviewConProxy(i, foto.url);
            
            const comentarioInput = document.getElementById(`comentario_${i}`);
            if (comentarioInput) {
                comentarioInput.value = foto.comentario || '';
            }
            
            const removeBtn = document.querySelector(`.foto-upload-item[data-index="${i}"] .btn-remove-foto`);
            if (removeBtn) removeBtn.style.display = 'block';
        }
    }
    
    const guardarBtn = document.getElementById('btnGuardarAvance');
    const enviarBtn = document.getElementById('btnEnviarRevision');
    
    if (guardarBtn) {
        guardarBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios (Borrador)';
    }
    if (enviarBtn) {
        enviarBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar a Revisión (Actualizar)';
    }
    
    avanceEditandoId = avanceId;
    configurarSubidaFotos();
    document.getElementById('formAvance').style.display = 'block';
    document.getElementById('formAvance').scrollIntoView({ behavior: 'smooth' });
};

// =====================================================
// GUARDAR AVANCE
// =====================================================

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
        let method = avanceEditandoId ? 'PUT' : 'POST';
        let url = `${API_URL}/avances`;
        
        const body = {
            id_orden_trabajo: parseInt(currentOrdenId),
            titulo: titulo,
            descripcion: descripcion,
            fotos: fotosArray,
            estado: estado === 'pendiente' ? 'pendiente' : 'borrador'
        };
        
        if (avanceEditandoId) {
            body.id = avanceEditandoId;
        }
        
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.success) {
            let mensaje = '';
            if (avanceEditandoId) {
                mensaje = estado === 'pendiente' 
                    ? '✅ Avance actualizado y enviado a revisión' 
                    : '📝 Avance actualizado como borrador';
            } else {
                mensaje = estado === 'pendiente' 
                    ? '✅ Avance enviado a revisión' 
                    : '📝 Avance guardado como borrador';
            }
            
            showToast(mensaje, 'success');
            avanceEditandoId = null;
            resetearBotonesFormulario();
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
            <p><strong><i class="fas fa-calendar"></i> Fecha de creación:</strong> ${formatDate(avance.fecha_creacion)}</p>
            <p><strong><i class="fas fa-chart-line"></i> Estado:</strong> ${estadoBadge}</p>
            ${avance.comentario_revision ? `
                <div class="comentario-revision-detalle">
                    <p><strong><i class="fas fa-comment-dots"></i> Comentario de revisión:</strong></p>
                    <p class="comentario-texto">${escapeHtml(avance.comentario_revision)}</p>
                </div>
            ` : ''}
            ${avance.fecha_aprobacion ? `<p><strong><i class="fas fa-check-circle"></i> Fecha de aprobación:</strong> ${formatDate(avance.fecha_aprobacion)}</p>` : ''}
        </div>
        <div class="fotos-section">
            <h4><i class="fas fa-images"></i> Fotos del avance (${avance.fotos?.length || 0})</h4>
            ${fotosHtml}
        </div>
    `;

    abrirModal('modalDetalleAvance');
};

// =====================================================
// VER FOTO AMPLIADA - CON PROXY (REGLAS DE ORO)
// =====================================================

window.verFotoAmpliada = async function(url) {
    if (!url) return;
    
    // Crear modal si no existe
    let modal = document.getElementById('fotoAmpliadaModal');
    if (!modal) {
        const modalHtml = `
            <div class="modal" id="fotoAmpliadaModal" onclick="cerrarFotoAmpliadaModal()">
                <div class="modal-content" style="max-width: 800px; background: var(--bg-card);" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3><i class="fas fa-image"></i> Foto Ampliada</h3>
                        <button class="modal-close" onclick="cerrarFotoAmpliadaModal()">&times;</button>
                    </div>
                    <div class="modal-body" style="display:flex;justify-content:center;align-items:center;padding:1.5rem;background:var(--negro);min-height:300px;position:relative;">
                        <div id="fotoAmpliadaLoader" style="position:absolute;color:white;font-size:1.2rem;z-index:5;">
                            <i class="fas fa-spinner fa-spin"></i> Cargando...
                        </div>
                        <img id="fotoAmpliadaImg" src="" alt="Foto ampliada" loading="lazy" 
                             style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:var(--radius-md);display:none;">
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="cerrarFotoAmpliadaModal()">Cerrar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('fotoAmpliadaModal');
    }
    
    const img = document.getElementById('fotoAmpliadaImg');
    const loader = document.getElementById('fotoAmpliadaLoader');
    
    if (!img) return;
    
    // Resetear estados
    img.style.display = 'none';
    img.src = '';
    if (loader) {
        loader.style.display = 'flex';
        loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
    }
    
    abrirModal('fotoAmpliadaModal');
    
    try {
        const tokenActual = getToken();
        if (!tokenActual) {
            throw new Error('No hay token de autenticación');
        }
        
        const proxyUrl = `${API_URL}/proxy-imagen-repuesto?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
            headers: {
                'Authorization': `Bearer ${tokenActual}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.base64) {
            // Pre-cargar la imagen
            const nuevaImg = new Image();
            nuevaImg.onload = function() {
                img.src = data.base64;
                img.style.display = 'block';
                if (loader) loader.style.display = 'none';
            };
            nuevaImg.onerror = function() {
                if (loader) {
                    loader.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error al cargar imagen';
                    loader.style.display = 'flex';
                }
                showToast('Error al cargar la imagen', 'error');
            };
            nuevaImg.src = data.base64;
        } else {
            throw new Error(data.error || 'Error al obtener la imagen');
        }
    } catch (error) {
        console.error('Error cargando foto ampliada:', error);
        if (loader) {
            loader.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
            loader.style.display = 'flex';
        }
        showToast('Error al cargar la imagen', 'error');
    }
};

function cerrarFotoAmpliadaModal() {
    const modal = document.getElementById('fotoAmpliadaModal');
    if (modal) modal.classList.remove('show');
    const img = document.getElementById('fotoAmpliadaImg');
    if (img) {
        img.src = '';
        img.style.display = 'none';
    }
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    const selectOrden = document.getElementById('selectOrden');
    if (selectOrden) {
        selectOrden.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
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
            
            if (avancesActuales.length > 0 && !avanceEditandoId) {
                showToast('⚠️ Ya existe un avance para esta orden. Usa el botón ACTUALIZAR en la tarjeta.', 'warning');
                return;
            }
            
            avanceEditandoId = null;
            resetearBotonesFormulario();
            limpiarFormulario();
            configurarSubidaFotos();
            document.getElementById('formAvance').style.display = 'block';
            document.getElementById('formAvance').scrollIntoView({ behavior: 'smooth' });
        });
    }

    const btnCancelarAvance = document.getElementById('btnCancelarAvance');
    if (btnCancelarAvance) {
        btnCancelarAvance.addEventListener('click', () => {
            document.getElementById('formAvance').style.display = 'none';
            limpiarFormulario();
            avanceEditandoId = null;
            resetearBotonesFormulario();
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

// =====================================================
// INICIALIZACIÓN
// =====================================================

async function inicializar() {
    console.log('🚀 Inicializando avance.js - Versión con preview corregido');
    console.log('📡 API_URL:', API_URL);

    const user = await cargarUsuarioActual();
    if (!user) return;

    await cargarOrdenesEnReparacion();
    setupEventListeners();
    configurarSubidaFotos();

    console.log('✅ avance.js inicializado correctamente');
}

// Exponer funciones globales
window.cerrarSesion = cerrarSesion;
window.cerrarModal = cerrarModal;
window.verDetalleAvance = verDetalleAvance;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarFotoAmpliadaModal = cerrarFotoAmpliadaModal;
window.eliminarFoto = eliminarFoto;
window.cargarAvanceParaActualizar = cargarAvanceParaActualizar;

// Iniciar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}