// =====================================================
// PERFIL-CLIENTE.JS - CLIENTE
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/cliente';
let currentUser = null;
let editMode = false;
let avatarSeleccionado = 'user';
let vehiculoEditandoId = null;

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    
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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr;
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('es-BO');
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
    
    setTimeout(() => toast.remove(), 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

// =====================================================
// CARGA DE DATOS DEL PERFIL
// =====================================================

async function cargarPerfil() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            const usuario = data.usuario;
            
            document.getElementById('nombre').value = usuario.nombre || '';
            document.getElementById('email').value = usuario.email || '';
            document.getElementById('telefono').value = usuario.telefono || '';
            document.getElementById('telefono2').value = usuario.telefono2 || '';
            document.getElementById('direccion').value = usuario.direccion || '';
            document.getElementById('ciudad').value = usuario.ciudad || '';
            
            document.getElementById('displayNombre').textContent = usuario.nombre || 'Cliente';
            document.getElementById('displayEmail').textContent = usuario.email || '';
            
            avatarSeleccionado = usuario.avatar || 'user';
            actualizarAvatar(avatarSeleccionado);
            
            if (usuario.preferencias_notificaciones) {
                const prefs = usuario.preferencias_notificaciones;
                document.getElementById('notif_cotizacion').checked = prefs.cotizacion !== false;
                document.getElementById('notif_avance').checked = prefs.avance !== false;
                document.getElementById('notif_completado').checked = prefs.completado !== false;
                document.getElementById('notif_promociones').checked = prefs.promociones === true;
            }
        }
    } catch (error) {
        console.error('Error cargando perfil:', error);
        showToast('Error al cargar perfil', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cargarSesiones() {
    try {
        const response = await fetch(`${API_URL}/perfil/sesiones`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderSesiones(data.sesiones);
        }
    } catch (error) {
        console.error('Error cargando sesiones:', error);
    }
}

async function cargarVehiculos() {
    try {
        const response = await fetch(`${API_URL}/vehiculos`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderVehiculos(data.vehiculos);
        }
    } catch (error) {
        console.error('Error cargando vehículos:', error);
    }
}

async function cargarActividad(page = 1) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil/actividad?page=${page}&limit=10`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderActividad(data.actividad, data.pagination);
        }
    } catch (error) {
        console.error('Error cargando actividad:', error);
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZADO
// =====================================================

function renderSesiones(sesiones) {
    const container = document.getElementById('sesionesList');
    if (!container) return;
    
    if (sesiones.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gris-texto);">No hay sesiones activas</p>';
        return;
    }
    
    container.innerHTML = sesiones.map(s => `
        <div class="sesion-item ${s.es_actual ? 'sesion-actual' : ''}">
            <div class="sesion-info">
                <span class="sesion-dispositivo">
                    <i class="fas ${s.dispositivo === 'mobile' ? 'fa-mobile-alt' : 'fa-laptop'}"></i>
                    ${escapeHtml(s.dispositivo_nombre || 'Dispositivo desconocido')}
                    ${s.es_actual ? '<span style="margin-left: 0.5rem; color: var(--verde-exito);">(Actual)</span>' : ''}
                </span>
                <span class="sesion-fecha">Última actividad: ${formatDate(s.ultima_actividad)}</span>
            </div>
            ${!s.es_actual ? `
                <button class="btn-cerrar-sesion" onclick="cerrarSesion('${s.id}')">
                    <i class="fas fa-sign-out-alt"></i> Cerrar
                </button>
            ` : ''}
        </div>
    `).join('');
}

function renderVehiculos(vehiculos) {
    const container = document.getElementById('vehiculosList');
    if (!container) return;
    
    if (vehiculos.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem; text-align: center;">
                <i class="fas fa-car" style="font-size: 2rem; color: var(--gris-texto);"></i>
                <p>No tienes vehículos registrados</p>
                <small>Agrega tu vehículo para un mejor seguimiento</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = vehiculos.map(v => `
        <div class="vehiculo-item">
            <div class="vehiculo-info">
                <span class="vehiculo-placa">${escapeHtml(v.placa)}</span>
                <span class="vehiculo-detalle">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)} ${v.anio ? `(${v.anio})` : ''}</span>
                ${v.color ? `<span class="vehiculo-detalle">Color: ${escapeHtml(v.color)}</span>` : ''}
            </div>
            <div class="vehiculo-actions">
                <button class="btn-vehiculo" onclick="editarVehiculo(${v.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-vehiculo" onclick="eliminarVehiculo(${v.id})" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderActividad(actividad, pagination) {
    const tbody = document.getElementById('actividadList');
    if (!tbody) return;
    
    if (actividad.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-history" style="font-size: 2rem; color: var(--gris-texto);"></i>
                    <p>No hay actividad registrada</p>
                 </td>
             </tr>
        `;
        return;
    }
    
    const iconos = {
        'login': 'fa-sign-in-alt',
        'logout': 'fa-sign-out-alt',
        'ver_servicio': 'fa-eye',
        'aprobar_cotizacion': 'fa-check-circle'
    };
    
    tbody.innerHTML = actividad.map(a => `
        <tr>
            <td>${formatDateTime(a.fecha)}</td>
            <td><i class="fas ${iconos[a.accion] || 'fa-circle'}"></i> ${escapeHtml(a.accion_texto || a.accion)}</td>
            <td>${escapeHtml(a.descripcion || '-')}</td>
            <td>${a.ip || '-'}</td>
        </tr>
    `).join('');
    
    renderPaginacion(pagination);
}

function renderPaginacion(pagination) {
    const container = document.getElementById('pagination');
    if (!container) return;
    
    if (!pagination || pagination.total_pages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    for (let i = 1; i <= pagination.total_pages; i++) {
        html += `
            <button class="page-btn ${i === pagination.current_page ? 'active' : ''}" onclick="cargarActividad(${i})">
                ${i}
            </button>
        `;
    }
    container.innerHTML = html;
}

// =====================================================
// FUNCIONES DEL PERFIL
// =====================================================

function toggleEditInfo() {
    editMode = !editMode;
    const inputs = document.querySelectorAll('#formInformacion input');
    const actions = document.getElementById('infoActions');
    const editBtn = document.getElementById('btnEditarInfo');
    
    inputs.forEach(input => {
        input.disabled = !editMode;
    });
    
    if (editMode) {
        actions.style.display = 'flex';
        editBtn.style.display = 'none';
    } else {
        actions.style.display = 'none';
        editBtn.style.display = 'flex';
    }
}

function cancelarEdicionInfo() {
    editMode = false;
    const inputs = document.querySelectorAll('#formInformacion input');
    const actions = document.getElementById('infoActions');
    const editBtn = document.getElementById('btnEditarInfo');
    
    inputs.forEach(input => {
        input.disabled = true;
    });
    
    actions.style.display = 'none';
    editBtn.style.display = 'flex';
    cargarPerfil();
}

async function guardarInformacion(event) {
    event.preventDefault();
    
    const data = {
        nombre: document.getElementById('nombre').value,
        telefono: document.getElementById('telefono').value,
        telefono2: document.getElementById('telefono2').value,
        direccion: document.getElementById('direccion').value,
        ciudad: document.getElementById('ciudad').value
    };
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Información actualizada', 'success');
            cancelarEdicionInfo();
            cargarPerfil();
        } else {
            showToast(result.error || 'Error al actualizar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cambiarPassword(event) {
    event.preventDefault();
    
    const passwordActual = document.getElementById('passwordActual').value;
    const passwordNueva = document.getElementById('passwordNueva').value;
    const passwordConfirmar = document.getElementById('passwordConfirmar').value;
    
    if (passwordNueva !== passwordConfirmar) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }
    
    if (passwordNueva.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil/cambiar-password`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                password_actual: passwordActual,
                password_nueva: passwordNueva
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Contraseña cambiada exitosamente', 'success');
            document.getElementById('formPassword').reset();
            document.getElementById('passwordStrength').innerHTML = '';
        } else {
            showToast(result.error || 'Error al cambiar contraseña', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// AVATAR
// =====================================================

function abrirModalAvatar() {
    abrirModal('modalAvatar');
}

function seleccionarAvatar(avatar) {
    avatarSeleccionado = avatar;
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.style.borderColor = 'transparent';
    });
    event.currentTarget.style.borderColor = 'var(--rojo-primario)';
}

function actualizarAvatar(avatar) {
    const avatarPreview = document.getElementById('avatarPreview');
    const iconos = {
        'user': 'fa-user-circle',
        'car': 'fa-car',
        'user-astronaut': 'fa-user-astronaut',
        'user-ninja': 'fa-user-ninja'
    };
    avatarPreview.innerHTML = `<i class="fas ${iconos[avatar] || 'fa-user-circle'}"></i>`;
}

async function guardarAvatar() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil/avatar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ avatar: avatarSeleccionado })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Avatar actualizado', 'success');
            actualizarAvatar(avatarSeleccionado);
            cerrarModal('modalAvatar');
        } else {
            showToast(result.error || 'Error al actualizar avatar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VEHÍCULOS
// =====================================================

function abrirModalVehiculo() {
    vehiculoEditandoId = null;
    document.getElementById('modalVehiculoTitle').innerHTML = '<i class="fas fa-car"></i> Agregar Vehículo';
    document.getElementById('formVehiculo').reset();
    document.getElementById('vehiculoId').value = '';
    abrirModal('modalVehiculo');
}

function editarVehiculo(id) {
    fetch(`${API_URL}/vehiculos/${id}`, { headers: getAuthHeaders() })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const v = data.vehiculo;
                vehiculoEditandoId = id;
                document.getElementById('modalVehiculoTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Vehículo';
                document.getElementById('vehiculoId').value = v.id;
                document.getElementById('vehiculoPlaca').value = v.placa;
                document.getElementById('vehiculoMarca').value = v.marca;
                document.getElementById('vehiculoModelo').value = v.modelo;
                document.getElementById('vehiculoAnio').value = v.anio;
                document.getElementById('vehiculoColor').value = v.color || '';
                document.getElementById('vehiculoMotor').value = v.numero_motor || '';
                document.getElementById('vehiculoChasis').value = v.numero_chasis || '';
                abrirModal('modalVehiculo');
            }
        })
        .catch(error => console.error('Error:', error));
}

async function guardarVehiculo(event) {
    event.preventDefault();
    
    const id = document.getElementById('vehiculoId').value;
    const data = {
        placa: document.getElementById('vehiculoPlaca').value.toUpperCase(),
        marca: document.getElementById('vehiculoMarca').value,
        modelo: document.getElementById('vehiculoModelo').value,
        anio: document.getElementById('vehiculoAnio').value,
        color: document.getElementById('vehiculoColor').value,
        numero_motor: document.getElementById('vehiculoMotor').value,
        numero_chasis: document.getElementById('vehiculoChasis').value
    };
    
    mostrarLoading(true);
    try {
        const url = id ? `${API_URL}/vehiculos/${id}` : `${API_URL}/vehiculos`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(id ? 'Vehículo actualizado' : 'Vehículo agregado', 'success');
            cerrarModal('modalVehiculo');
            cargarVehiculos();
        } else {
            showToast(result.error || 'Error al guardar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function eliminarVehiculo(id) {
    if (!confirm('¿Estás seguro de eliminar este vehículo?')) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/vehiculos/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Vehículo eliminado', 'success');
            cargarVehiculos();
        } else {
            showToast(result.error || 'Error al eliminar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// NOTIFICACIONES
// =====================================================

async function guardarPreferencias(event) {
    event.preventDefault();
    
    const preferencias = {
        cotizacion: document.getElementById('notif_cotizacion').checked,
        avance: document.getElementById('notif_avance').checked,
        completado: document.getElementById('notif_completado').checked,
        promociones: document.getElementById('notif_promociones').checked
    };
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil/notificaciones/preferencias`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ preferencias })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Preferencias guardadas', 'success');
        } else {
            showToast(result.error || 'Error al guardar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// SESIONES
// =====================================================

async function cerrarSesion(sessionId) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil/sesiones/${sessionId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Sesión cerrada', 'success');
            await cargarSesiones();
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cerrarTodasSesiones() {
    if (!confirm('¿Cerrar todas las sesiones excepto esta?')) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil/sesiones/cerrar-todas`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Todas las demás sesiones han sido cerradas', 'success');
            await cargarSesiones();
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// ACTIVIDAD
// =====================================================

function exportarActividad() {
    window.location.href = `${API_URL}/perfil/actividad/exportar?token=${localStorage.getItem('furia_token')}`;
}

// =====================================================
// SEGURIDAD DE CONTRASEÑA
// =====================================================

function checkPasswordStrength() {
    const password = document.getElementById('passwordNueva').value;
    const strengthDiv = document.getElementById('passwordStrength');
    
    let strength = 0;
    let message = '';
    let className = '';
    
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/)) strength++;
    if (password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    
    if (strength <= 2) {
        message = 'Débil';
        className = 'weak';
    } else if (strength <= 4) {
        message = 'Media';
        className = 'medium';
    } else {
        message = 'Fuerte';
        className = 'strong';
    }
    
    strengthDiv.innerHTML = message;
    strengthDiv.className = `password-strength ${className}`;
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        button.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = '/';
            return null;
        }
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        let userData = null;
        try {
            const userStr = localStorage.getItem('furia_user');
            if (userStr) userData = JSON.parse(userStr);
        } catch (e) {}
        
        currentUser = {
            id: payload.user?.id || payload.id || payload.user_id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Cliente',
            email: payload.user?.email || payload.email || userData?.email
        };
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        return currentUser;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = '/';
        return null;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    const tabBtns = document.querySelectorAll('.tab-btn-perfil');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const tabId = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-perfil').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            if (tabId === 'seguridad') await cargarSesiones();
            else if (tabId === 'vehiculos') await cargarVehiculos();
            else if (tabId === 'actividad') await cargarActividad();
        });
    });
    
    const btnEditar = document.getElementById('btnEditarInfo');
    if (btnEditar) btnEditar.addEventListener('click', toggleEditInfo);
    
    const passwordInput = document.getElementById('passwordNueva');
    if (passwordInput) passwordInput.addEventListener('input', checkPasswordStrength);
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando perfil-cliente.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarPerfil();
    setupEventListeners();
    
    console.log('✅ perfil-cliente.js inicializado correctamente');
}

// Exponer funciones globales
window.toggleEditInfo = toggleEditInfo;
window.cancelarEdicionInfo = cancelarEdicionInfo;
window.guardarInformacion = guardarInformacion;
window.cambiarPassword = cambiarPassword;
window.abrirModalAvatar = abrirModalAvatar;
window.seleccionarAvatar = seleccionarAvatar;
window.guardarAvatar = guardarAvatar;
window.abrirModalVehiculo = abrirModalVehiculo;
window.editarVehiculo = editarVehiculo;
window.guardarVehiculo = guardarVehiculo;
window.eliminarVehiculo = eliminarVehiculo;
window.guardarPreferencias = guardarPreferencias;
window.cerrarSesion = cerrarSesion;
window.cerrarTodasSesiones = cerrarTodasSesiones;
window.exportarActividad = exportarActividad;
window.cargarActividad = cargarActividad;
window.togglePassword = togglePassword;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);