// =====================================================
// PERFIL - JEFE OPERATIVO
// CONEXIÓN REAL A BASE DE DATOS
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';
let currentEditField = null;
let userData = null;

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const notificacionesCount = document.getElementById('notificacionesCount');
const avatarWrapper = document.getElementById('avatarWrapper');
const avatarImg = document.getElementById('avatarImg');
const avatarPlaceholder = document.getElementById('avatarPlaceholder');
const avatarInput = document.getElementById('avatarInput');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const userNameDisplay = document.getElementById('userNameDisplay');
const userRoleDisplay = document.getElementById('userRoleDisplay');
const userPhone = document.getElementById('userPhone');
const userEmail = document.getElementById('userEmail');
const userLocation = document.getElementById('userLocation');
const userMemberSince = document.getElementById('userMemberSince');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const saveChangesBtn = document.getElementById('saveChangesBtn');

// Modales
const passwordModal = document.getElementById('passwordModal');
const editModal = document.getElementById('editModal');
const editModalTitle = document.getElementById('editModalTitle');
const editFieldLabel = document.getElementById('editFieldLabel');
const editField = document.getElementById('editField');

// Password form
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const confirmPassword = document.getElementById('confirmPassword');
const reqLength = document.getElementById('reqLength');
const reqUpper = document.getElementById('reqUpper');
const reqLower = document.getElementById('reqLower');
const reqNumber = document.getElementById('reqNumber');

// Campos editables y sus valores originales
let camposEditados = {
    telefono: null,
    email: null,
    ubicacion: null
};

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    await loadUserData();
    setupEventListeners();
    iniciarPollingNotificaciones();
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || (user.rol !== 'jefe_operativo' && user.id_rol !== 2)) {
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

// Configurar event listeners
function setupEventListeners() {
    // Cambiar avatar
    changeAvatarBtn.addEventListener('click', () => {
        avatarInput.click();
    });
    
    avatarInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            await subirAvatar(e.target.files[0]);
        }
    });
    
    // Cambiar contraseña
    changePasswordBtn.addEventListener('click', () => {
        resetPasswordForm();
        passwordModal.classList.add('show');
    });
    
    // Validar contraseña en tiempo real
    newPassword.addEventListener('input', validatePassword);
    confirmPassword.addEventListener('input', validatePassword);
}

// =====================================================
// CARGAR DATOS DEL USUARIO DESDE API
// =====================================================
async function loadUserData() {
    try {
        const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
        const userId = user.id;
        
        if (!userId) {
            throw new Error('ID de usuario no encontrado');
        }
        
        const response = await fetch(`${API_URL}/jefe-operativo/perfil/${userId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar perfil');
        }
        
        userData = result.data;
        
        // Actualizar UI
        userNameDisplay.textContent = userData.nombre || '-';
        userRoleDisplay.textContent = 'Jefe Operativo';
        userPhone.textContent = userData.contacto || '-';
        userEmail.textContent = userData.email || '-';
        userLocation.textContent = userData.ubicacion || '-';
        
        // Formatear fecha de registro
        if (userData.fecha_registro) {
            const fecha = new Date(userData.fecha_registro);
            userMemberSince.textContent = fecha.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        }
        
        // Cargar avatar si existe
        if (userData.avatar_url && userData.avatar_url !== 'null') {
            avatarImg.src = userData.avatar_url;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
            avatarWrapper.classList.add('has-image');
        } else {
            avatarImg.style.display = 'none';
            avatarPlaceholder.style.display = 'flex';
            avatarWrapper.classList.remove('has-image');
        }
        
        // Guardar valores originales
        camposEditados.telefono = userData.contacto;
        camposEditados.email = userData.email;
        camposEditados.ubicacion = userData.ubicacion;
        
    } catch (error) {
        console.error('Error cargando datos del usuario:', error);
        mostrarNotificacion('Error al cargar datos del perfil: ' + error.message, 'error');
    }
}

// =====================================================
// SUBIR AVATAR A CLOUDINARY
// =====================================================
async function subirAvatar(file) {
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
        mostrarNotificacion('La imagen no debe superar los 2MB', 'warning');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        
        try {
            mostrarNotificacion('Subiendo imagen...', 'info');
            
            const response = await fetch(`${API_URL}/jefe-operativo/perfil/avatar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({ avatar: base64 })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Error al subir avatar');
            }
            
            avatarImg.src = base64;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
            avatarWrapper.classList.add('has-image');
            
            mostrarNotificacion('Foto de perfil actualizada', 'success');
            
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion(error.message, 'error');
        }
    };
    reader.readAsDataURL(file);
}

// =====================================================
// FUNCIONES DE EDICIÓN
// =====================================================
window.editarCampo = (campo) => {
    currentEditField = campo;
    
    const campos = {
        'telefono': {
            titulo: 'Editar teléfono',
            label: 'Número de teléfono',
            valor: userPhone.textContent
        },
        'email': {
            titulo: 'Editar correo electrónico',
            label: 'Correo electrónico',
            valor: userEmail.textContent
        },
        'ubicacion': {
            titulo: 'Editar ubicación',
            label: 'Ubicación',
            valor: userLocation.textContent
        }
    };
    
    if (campos[campo]) {
        editModalTitle.textContent = campos[campo].titulo;
        editFieldLabel.textContent = campos[campo].label;
        editField.value = campos[campo].valor;
        editModal.classList.add('show');
    }
};

window.guardarCampoEditado = async () => {
    const nuevoValor = editField.value.trim();
    
    if (!nuevoValor) {
        mostrarNotificacion('El valor no puede estar vacío', 'warning');
        return;
    }
    
    // Validar email
    if (currentEditField === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(nuevoValor)) {
            mostrarNotificacion('Ingrese un correo electrónico válido', 'warning');
            return;
        }
    }
    
    // Validar teléfono
    if (currentEditField === 'telefono') {
        const telefonoRegex = /^[0-9+\-\s]{8,}$/;
        if (!telefonoRegex.test(nuevoValor)) {
            mostrarNotificacion('Ingrese un número de teléfono válido', 'warning');
            return;
        }
    }
    
    try {
        const data = {};
        if (currentEditField === 'telefono') data.contacto = nuevoValor;
        if (currentEditField === 'email') data.email = nuevoValor;
        if (currentEditField === 'ubicacion') data.ubicacion = nuevoValor;
        
        const response = await fetch(`${API_URL}/jefe-operativo/perfil/actualizar`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al actualizar');
        }
        
        // Actualizar UI
        switch (currentEditField) {
            case 'telefono':
                userPhone.textContent = nuevoValor;
                camposEditados.telefono = nuevoValor;
                break;
            case 'email':
                userEmail.textContent = nuevoValor;
                camposEditados.email = nuevoValor;
                break;
            case 'ubicacion':
                userLocation.textContent = nuevoValor;
                camposEditados.ubicacion = nuevoValor;
                break;
        }
        
        mostrarNotificacion('Campo actualizado correctamente', 'success');
        cerrarEditModal();
        
        // Mostrar botón de guardar cambios
        saveChangesBtn.style.display = 'inline-flex';
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
};

window.cerrarEditModal = () => {
    editModal.classList.remove('show');
    currentEditField = null;
    editField.value = '';
};

// =====================================================
// GUARDAR CAMBIOS GENERALES
// =====================================================
saveChangesBtn.addEventListener('click', async () => {
    const cambios = {};
    
    if (camposEditados.telefono !== userPhone.textContent) {
        cambios.contacto = userPhone.textContent;
    }
    if (camposEditados.email !== userEmail.textContent) {
        cambios.email = userEmail.textContent;
    }
    if (camposEditados.ubicacion !== userLocation.textContent) {
        cambios.ubicacion = userLocation.textContent;
    }
    
    if (Object.keys(cambios).length === 0) {
        mostrarNotificacion('No hay cambios para guardar', 'info');
        return;
    }
    
    try {
        mostrarNotificacion('Guardando cambios...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-operativo/perfil/actualizar`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify(cambios)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al guardar cambios');
        }
        
        // Actualizar valores originales
        camposEditados.telefono = userPhone.textContent;
        camposEditados.email = userEmail.textContent;
        camposEditados.ubicacion = userLocation.textContent;
        
        // Actualizar localStorage
        const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
        if (cambios.email) user.email = cambios.email;
        if (cambios.contacto) user.contacto = cambios.contacto;
        localStorage.setItem('furia_user', JSON.stringify(user));
        
        mostrarNotificacion('Cambios guardados correctamente', 'success');
        saveChangesBtn.style.display = 'none';
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
});

// =====================================================
// FUNCIONES DE CONTRASEÑA
// =====================================================
function validatePassword() {
    const password = newPassword.value;
    
    // Validar longitud
    if (password.length >= 8) {
        reqLength.classList.add('valid');
        reqLength.innerHTML = '✓ Mínimo 8 caracteres';
    } else {
        reqLength.classList.remove('valid');
        reqLength.innerHTML = '✗ Mínimo 8 caracteres';
    }
    
    // Validar mayúscula
    if (/[A-Z]/.test(password)) {
        reqUpper.classList.add('valid');
        reqUpper.innerHTML = '✓ Al menos una mayúscula';
    } else {
        reqUpper.classList.remove('valid');
        reqUpper.innerHTML = '✗ Al menos una mayúscula';
    }
    
    // Validar minúscula
    if (/[a-z]/.test(password)) {
        reqLower.classList.add('valid');
        reqLower.innerHTML = '✓ Al menos una minúscula';
    } else {
        reqLower.classList.remove('valid');
        reqLower.innerHTML = '✗ Al menos una minúscula';
    }
    
    // Validar número
    if (/[0-9]/.test(password)) {
        reqNumber.classList.add('valid');
        reqNumber.innerHTML = '✓ Al menos un número';
    } else {
        reqNumber.classList.remove('valid');
        reqNumber.innerHTML = '✗ Al menos un número';
    }
    
    // Validar coincidencia
    if (confirmPassword.value && password !== confirmPassword.value) {
        confirmPassword.setCustomValidity('Las contraseñas no coinciden');
    } else {
        confirmPassword.setCustomValidity('');
    }
}

window.togglePassword = (inputId) => {
    const input = document.getElementById(inputId);
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    
    const toggleBtn = input.nextElementSibling;
    const icon = toggleBtn.querySelector('i');
    if (type === 'text') {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

window.cambiarContrasena = async () => {
    // Validar campos
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
        mostrarNotificacion('Todos los campos son requeridos', 'warning');
        return;
    }
    
    // Validar nueva contraseña
    if (newPassword.value.length < 8 || 
        !/[A-Z]/.test(newPassword.value) || 
        !/[a-z]/.test(newPassword.value) || 
        !/[0-9]/.test(newPassword.value)) {
        mostrarNotificacion('La contraseña no cumple los requisitos de seguridad', 'error');
        return;
    }
    
    // Validar coincidencia
    if (newPassword.value !== confirmPassword.value) {
        mostrarNotificacion('Las contraseñas no coinciden', 'error');
        return;
    }
    
    try {
        mostrarNotificacion('Cambiando contraseña...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-operativo/perfil/cambiar-contrasena`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({
                current_password: currentPassword.value,
                new_password: newPassword.value
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cambiar contraseña');
        }
        
        mostrarNotificacion('Contraseña actualizada correctamente', 'success');
        cerrarPasswordModal();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
};

function resetPasswordForm() {
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    
    // Resetear validaciones
    [reqLength, reqUpper, reqLower, reqNumber].forEach(req => {
        req.classList.remove('valid');
    });
    
    reqLength.innerHTML = '✗ Mínimo 8 caracteres';
    reqUpper.innerHTML = '✗ Al menos una mayúscula';
    reqLower.innerHTML = '✗ Al menos una minúscula';
    reqNumber.innerHTML = '✗ Al menos un número';
}

window.cerrarPasswordModal = () => {
    passwordModal.classList.remove('show');
    resetPasswordForm();
};

// =====================================================
// NOTIFICACIONES
// =====================================================
let notificacionesInterval = null;

function iniciarPollingNotificaciones() {
    if (notificacionesInterval) clearInterval(notificacionesInterval);
    notificacionesInterval = setInterval(cargarNotificaciones, 30000);
}

async function cargarNotificaciones() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/notificaciones`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
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
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${mensaje}</span>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toastContainer.contains(toast)) toastContainer.removeChild(toast);
        }, 300);
    }, 3000);
}

// =====================================================
// CERRAR MODALES CON ESC
// =====================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (passwordModal?.classList.contains('show')) cerrarPasswordModal();
        if (editModal?.classList.contains('show')) cerrarEditModal();
    }
});

// Cerrar modal haciendo clic fuera
[passwordModal, editModal].forEach(modal => {
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal === passwordModal) cerrarPasswordModal();
                if (modal === editModal) cerrarEditModal();
            }
        });
    }
});

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