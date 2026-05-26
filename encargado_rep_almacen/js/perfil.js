// =====================================================
// PERFIL.JS - ENCARGADO DE REPUESTOS (VERSIÓN SIMPLIFICADA)
// FURIA MOTOR COMPANY SRL
// =====================================================

// NOTA: API_BASE_URL ya está declarada en include.js como window.API_BASE_URL
// NO redeclarar const API_BASE_URL aquí

// Verificar que existe la variable global, si no, usar fallback
if (typeof window.API_BASE_URL === 'undefined') {
    console.warn('⚠️ window.API_BASE_URL no definida, usando fallback');
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:5000';
        }
        return '';
    })();
}

const API_URL = `${window.API_BASE_URL}/api/encargado-repuestos`;

let currentUser = null;
let editMode = false;
let avatarSeleccionado = 'box';

// =====================================================
// UTILIDADES
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
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

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const btn = input.nextElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

function checkPasswordStrength() {
    const password = document.getElementById('passwordNueva').value;
    const strengthDiv = document.getElementById('passwordStrength');
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/)) strength++;
    if (password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    
    let message = '';
    let className = '';
    
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

// =====================================================
// CARGAR PERFIL
// =====================================================

// =====================================================
// CARGAR PERFIL - CORREGIDO PARA AVATAR
// =====================================================

async function cargarPerfil() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/perfil`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = window.API_BASE_URL + '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            const usuario = data.usuario;
            
            document.getElementById('nombre').value = usuario.nombre || '';
            document.getElementById('email').value = usuario.email || '';
            document.getElementById('telefono').value = usuario.telefono || '';
            document.getElementById('whatsapp').value = usuario.whatsapp || '';
            document.getElementById('direccion').value = usuario.direccion || '';
            
            document.getElementById('displayNombre').textContent = usuario.nombre || 'Usuario';
            document.getElementById('displayEmail').textContent = usuario.email || '';
            
            // CORREGIDO: Extraer el nombre del avatar de la URL
            let avatarNombre = 'box'; // valor por defecto
            if (usuario.avatar) {
                // Si viene como 'avatar_box', extraer 'box'
                if (usuario.avatar.includes('avatar_')) {
                    avatarNombre = usuario.avatar.replace('avatar_', '');
                } else {
                    avatarNombre = usuario.avatar;
                }
            }
            avatarSeleccionado = avatarNombre;
            actualizarAvatar(avatarSeleccionado);
        } else {
            showToast(data.error || 'Error al cargar perfil', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar perfil', 'error');
    } finally {
        mostrarLoading(false);
    }
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

// =====================================================
// EDITAR INFORMACIÓN
// =====================================================

function toggleEditInfo() {
    editMode = !editMode;
    const inputs = document.querySelectorAll('#formInformacion .form-control');
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
    const inputs = document.querySelectorAll('#formInformacion .form-control');
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
        } else {
            showToast(result.error || 'Error al actualizar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// CAMBIAR CONTRASEÑA
// =====================================================

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
    if (event && event.currentTarget) {
        event.currentTarget.style.borderColor = 'var(--rojo-primario)';
    }
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
            
            // Recargar perfil para actualizar todo
            setTimeout(() => {
                cargarPerfil();
            }, 500);
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
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = window.API_BASE_URL + '/';
            return null;
        }
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');
        
        currentUser = {
            id: payload.user?.id || payload.id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email
        };
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', { 
                year: 'numeric', month: 'long', day: 'numeric' 
            });
        }
        
        return currentUser;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = window.API_BASE_URL + '/';
        return null;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    const btnEditar = document.getElementById('btnEditarInfo');
    if (btnEditar) btnEditar.addEventListener('click', toggleEditInfo);
    
    const formInfo = document.getElementById('formInformacion');
    if (formInfo) formInfo.addEventListener('submit', guardarInformacion);
    
    const formPassword = document.getElementById('formPassword');
    if (formPassword) formPassword.addEventListener('submit', cambiarPassword);
    
    const passwordNueva = document.getElementById('passwordNueva');
    if (passwordNueva) passwordNueva.addEventListener('input', checkPasswordStrength);
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando perfil.js (Simplificado)');
    console.log('📡 API_URL:', API_URL);
    console.log('📡 window.API_BASE_URL:', window.API_BASE_URL);
    
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
window.togglePassword = togglePassword;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);