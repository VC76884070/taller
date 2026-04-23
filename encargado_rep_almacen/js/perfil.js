// =====================================================
// PERFIL.JS - ENCARGADO DE REPUESTOS
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/encargado-repuestos';
let currentUser = null;
let currentTab = 'informacion';
let editMode = false;
let avatarSeleccionado = 'box';

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

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('es-BO');
    } catch {
        return dateStr;
    }
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
            
            // Actualizar campos del formulario
            document.getElementById('nombre').value = usuario.nombre || '';
            document.getElementById('email').value = usuario.email || '';
            document.getElementById('telefono').value = usuario.telefono || '';
            document.getElementById('whatsapp').value = usuario.whatsapp || '';
            document.getElementById('direccion').value = usuario.direccion || '';
            
            // Actualizar display
            document.getElementById('displayNombre').textContent = usuario.nombre || 'Usuario';
            document.getElementById('displayEmail').textContent = usuario.email || '';
            
            // Cargar avatar
            avatarSeleccionado = usuario.avatar || 'box';
            actualizarAvatar(avatarSeleccionado);
            
            // Cargar preferencias de notificaciones
            if (usuario.preferencias_notificaciones) {
                const prefs = usuario.preferencias_notificaciones;
                document.getElementById('notif_nueva_cotizacion').checked = prefs.nueva_cotizacion !== false;
                document.getElementById('notif_compra_confirmada').checked = prefs.compra_confirmada !== false;
                document.getElementById('notif_entrega_realizada').checked = prefs.entrega_realizada !== false;
                document.getElementById('notif_stock_bajo').checked = prefs.stock_bajo !== false;
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

async function cargarNotificacionesRecientes() {
    try {
        const response = await fetch(`${API_URL}/perfil/notificaciones`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderNotificacionesRecientes(data.notificaciones);
        }
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
    }
}

async function cargarActividad(page = 1) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil/actividad?page=${page}&limit=20`, {
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
                    ${s.es_actual ? '<span class="rol-badge" style="margin-left: 0.5rem;">Actual</span>' : ''}
                </span>
                <span class="sesion-fecha">Última actividad: ${formatDate(s.ultima_actividad)}</span>
                <span class="sesion-fecha">IP: ${s.ip || 'Desconocida'}</span>
            </div>
            ${!s.es_actual ? `
                <button class="btn-cerrar-sesion" onclick="cerrarSesion('${s.id}')">
                    <i class="fas fa-sign-out-alt"></i> Cerrar
                </button>
            ` : ''}
        </div>
    `).join('');
}

function renderNotificacionesRecientes(notificaciones) {
    const container = document.getElementById('notificacionesRecientes');
    if (!container) return;
    
    if (notificaciones.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gris-texto); padding: 2rem;">No hay notificaciones recientes</p>';
        return;
    }
    
    const iconos = {
        'solicitud_cotizacion': 'fa-file-invoice-dollar',
        'cotizacion_recibida': 'fa-check-circle',
        'compra_realizada': 'fa-shopping-cart',
        'entrega_realizada': 'fa-truck'
    };
    
    container.innerHTML = notificaciones.map(n => `
        <div class="notificacion-reciente ${n.leida ? 'leida' : ''}" onclick="marcarLeida(${n.id})">
            <div class="notificacion-icon">
                <i class="fas ${iconos[n.tipo] || 'fa-bell'}"></i>
            </div>
            <div class="notificacion-content">
                <div class="notificacion-mensaje">${escapeHtml(n.mensaje)}</div>
                <div class="notificacion-fecha">${formatDate(n.fecha_envio)}</div>
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
        'cotizacion_creada': 'fa-file-invoice-dollar',
        'cotizacion_cotizada': 'fa-tags',
        'compra_registrada': 'fa-shopping-cart',
        'entrega_registrada': 'fa-truck'
    };
    
    tbody.innerHTML = actividad.map(a => `
        <tr>
            <td>${formatDateTime(a.fecha)}</td>
            <td><i class="fas ${iconos[a.accion] || 'fa-circle'}"></i> ${escapeHtml(a.accion_texto || a.accion)}</td>
            <td>${escapeHtml(a.descripcion || '-')}</td>
            <td>${a.ip || '-'}</td>
        </tr>
    `).join('');
    
    // Renderizar paginación
    renderPagination(pagination);
}

function renderPagination(pagination) {
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
    
    // Recargar datos originales
    cargarPerfil();
}

async function guardarInformacion(event) {
    event.preventDefault();
    
    const data = {
        nombre: document.getElementById('nombre').value,
        telefono: document.getElementById('telefono').value,
        whatsapp: document.getElementById('whatsapp').value,
        direccion: document.getElementById('direccion').value
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
    // Marcar visualmente la opción seleccionada
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.style.borderColor = 'transparent';
    });
    event.currentTarget.style.borderColor = 'var(--rojo-primario)';
}

function actualizarAvatar(avatar) {
    const avatarPreview = document.getElementById('avatarPreview');
    const iconos = {
        'box': 'fa-boxes',
        'user': 'fa-user-circle',
        'truck': 'fa-truck',
        'warehouse': 'fa-warehouse'
    };
    avatarPreview.innerHTML = `<i class="fas ${iconos[avatar] || 'fa-boxes'}"></i>`;
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
// NOTIFICACIONES
// =====================================================

async function guardarPreferencias(event) {
    event.preventDefault();
    
    const preferencias = {
        nueva_cotizacion: document.getElementById('notif_nueva_cotizacion').checked,
        compra_confirmada: document.getElementById('notif_compra_confirmada').checked,
        entrega_realizada: document.getElementById('notif_entrega_realizada').checked,
        stock_bajo: document.getElementById('notif_stock_bajo').checked
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

async function marcarLeida(id) {
    try {
        const response = await fetch(`${API_URL}/perfil/notificaciones/${id}/leer`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            await cargarNotificacionesRecientes();
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function marcarTodasLeidas() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil/notificaciones/leer-todas`, {
            method: 'PUT',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Todas las notificaciones marcadas como leídas', 'success');
            await cargarNotificacionesRecientes();
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
        } else {
            showToast(result.error || 'Error al cerrar sesión', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cerrarTodasSesiones() {
    if (!confirm('¿Cerrar todas las sesiones excepto esta? Esto cerrará sesión en todos tus otros dispositivos.')) return;
    
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
        } else {
            showToast(result.error || 'Error al cerrar sesiones', 'error');
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
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email,
            roles: payload.user?.roles || payload.roles || userData?.roles || []
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
    // Pestañas
    const tabBtns = document.querySelectorAll('.tab-btn-perfil');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const tabId = btn.getAttribute('data-tab');
            currentTab = tabId;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-perfil').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            // Cargar datos según pestaña
            if (tabId === 'seguridad') {
                await cargarSesiones();
            } else if (tabId === 'notificaciones') {
                await cargarNotificacionesRecientes();
            } else if (tabId === 'actividad') {
                await cargarActividad();
            }
        });
    });
    
    // Botón editar info
    const btnEditar = document.getElementById('btnEditarInfo');
    if (btnEditar) {
        btnEditar.addEventListener('click', toggleEditInfo);
    }
    
    // Password strength
    const passwordInput = document.getElementById('passwordNueva');
    if (passwordInput) {
        passwordInput.addEventListener('input', checkPasswordStrength);
    }
    
    // Cerrar modales
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando perfil.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarPerfil();
    setupEventListeners();
    
    console.log('✅ perfil.js inicializado correctamente');
}

// Exponer funciones globales
window.toggleEditInfo = toggleEditInfo;
window.cancelarEdicionInfo = cancelarEdicionInfo;
window.guardarInformacion = guardarInformacion;
window.cambiarPassword = cambiarPassword;
window.abrirModalAvatar = abrirModalAvatar;
window.seleccionarAvatar = seleccionarAvatar;
window.guardarAvatar = guardarAvatar;
window.guardarPreferencias = guardarPreferencias;
window.marcarLeida = marcarLeida;
window.marcarTodasLeidas = marcarTodasLeidas;
window.cerrarSesion = cerrarSesion;
window.cerrarTodasSesiones = cerrarTodasSesiones;
window.exportarActividad = exportarActividad;
window.cargarActividad = cargarActividad;
window.togglePassword = togglePassword;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);