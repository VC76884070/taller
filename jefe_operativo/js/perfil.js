// =====================================================
// PERFIL - JEFE OPERATIVO
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';
let currentEditField = null;

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const avatarImg = document.getElementById('avatarImg');
const avatarInput = document.getElementById('avatarInput');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const userNameDisplay = document.getElementById('userNameDisplay');
const userRoleDisplay = document.getElementById('userRoleDisplay');
const userPhone = document.getElementById('userPhone');
const userEmail = document.getElementById('userEmail');
const userDocument = document.getElementById('userDocument');
const userMemberSince = document.getElementById('userMemberSince');
const userLocation = document.getElementById('userLocation');
const userLastLogin = document.getElementById('userLastLogin');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const saveChangesBtn = document.getElementById('saveChangesBtn');
const activityList = document.getElementById('activityList');

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

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initPage();
    await loadUserData();
    loadActivityData();
    setupEventListeners();
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

// Configurar event listeners
function setupEventListeners() {
    // Cambiar avatar
    changeAvatarBtn.addEventListener('click', () => {
        avatarInput.click();
    });
    
    avatarInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                avatarImg.src = e.target.result;
                mostrarNotificacion('Foto de perfil actualizada', 'success');
            };
            reader.readAsDataURL(e.target.files[0]);
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
// CARGAR DATOS DEL USUARIO
// =====================================================
async function loadUserData() {
    try {
        // Simulación - Reemplazar con llamada real a la API
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Obtener usuario de localStorage
        const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
        
        // Datos de ejemplo (reemplazar con datos reales de la API)
        const userData = {
            nombre: user.nombre || 'María González',
            rol: 'Jefe Operativo',
            telefono: '+591 77712345',
            email: 'maria.gonzalez@furia.com',
            documento: '12345678',
            memberSince: '15 enero, 2025',
            ubicacion: 'Santa Cruz, Bolivia',
            lastLogin: '18 marzo, 2026 08:30'
        };
        
        // Actualizar UI
        userNameDisplay.textContent = userData.nombre;
        userRoleDisplay.textContent = userData.rol;
        userPhone.textContent = userData.telefono;
        userEmail.textContent = userData.email;
        userDocument.textContent = userData.documento;
        userMemberSince.textContent = userData.memberSince;
        userLocation.textContent = userData.ubicacion;
        userLastLogin.textContent = userData.lastLogin;
        
    } catch (error) {
        console.error('Error cargando datos del usuario:', error);
        mostrarNotificacion('Error al cargar datos del perfil', 'error');
    }
}

// Cargar actividad reciente
function loadActivityData() {
    const actividades = [
        {
            icon: 'fa-check-circle',
            desc: 'Entrega de vehículo - Toyota Corolla (ABC123)',
            time: 'Hace 15 minutos',
            color: 'var(--verde-exito)'
        },
        {
            icon: 'fa-file-invoice',
            desc: 'Cotización generada para Juan Pérez',
            time: 'Hace 1 hora',
            color: 'var(--azul-info)'
        },
        {
            icon: 'fa-car',
            desc: 'Nueva recepción - Honda Civic',
            time: 'Hace 2 horas',
            color: 'var(--rojo-primario)'
        },
        {
            icon: 'fa-users',
            desc: 'Reunión de personal programada',
            time: 'Hace 3 horas',
            color: '#F59E0B'
        },
        {
            icon: 'fa-file-pdf',
            desc: 'Reporte diario generado',
            time: 'Hace 5 horas',
            color: '#EF4444'
        }
    ];
    
    activityList.innerHTML = actividades.map(act => `
        <div class="activity-item">
            <div class="activity-icon" style="color: ${act.color};">
                <i class="fas ${act.icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-desc">${act.desc}</div>
                <div class="activity-time">${act.time}</div>
            </div>
        </div>
    `).join('');
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

window.guardarCampoEditado = () => {
    const nuevoValor = editField.value.trim();
    
    if (!nuevoValor) {
        mostrarNotificacion('El valor no puede estar vacío', 'warning');
        return;
    }
    
    // Actualizar el campo correspondiente
    switch (currentEditField) {
        case 'telefono':
            userPhone.textContent = nuevoValor;
            break;
        case 'email':
            userEmail.textContent = nuevoValor;
            break;
        case 'ubicacion':
            userLocation.textContent = nuevoValor;
            break;
    }
    
    mostrarNotificacion('Campo actualizado correctamente', 'success');
    cerrarEditModal();
    
    // Mostrar botón de guardar cambios
    saveChangesBtn.style.display = 'inline-flex';
};

window.cerrarEditModal = () => {
    editModal.classList.remove('show');
    currentEditField = null;
    editField.value = '';
};

// =====================================================
// FUNCIONES DE CONTRASEÑA
// =====================================================
function validatePassword() {
    const password = newPassword.value;
    const confirm = confirmPassword.value;
    
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
    if (confirm && password !== confirm) {
        confirmPassword.setCustomValidity('Las contraseñas no coinciden');
    } else {
        confirmPassword.setCustomValidity('');
    }
}

window.togglePassword = (inputId) => {
    const input = document.getElementById(inputId);
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    
    const icon = input.nextElementSibling.querySelector('i');
    if (type === 'text') {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

window.cambiarContrasena = () => {
    // Validar que todos los campos estén llenos
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
        mostrarNotificacion('Todos los campos son requeridos', 'warning');
        return;
    }
    
    // Validar que la nueva contraseña cumpla los requisitos
    if (newPassword.value.length < 8 || 
        !/[A-Z]/.test(newPassword.value) || 
        !/[a-z]/.test(newPassword.value) || 
        !/[0-9]/.test(newPassword.value)) {
        mostrarNotificacion('La contraseña no cumple los requisitos de seguridad', 'error');
        return;
    }
    
    // Validar que coincidan
    if (newPassword.value !== confirmPassword.value) {
        mostrarNotificacion('Las contraseñas no coinciden', 'error');
        return;
    }
    
    // Simular cambio de contraseña
    mostrarNotificacion('Cambiando contraseña...', 'info');
    
    setTimeout(() => {
        mostrarNotificacion('Contraseña actualizada correctamente', 'success');
        cerrarPasswordModal();
    }, 1500);
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
// GUARDAR CAMBIOS GENERALES
// =====================================================
document.getElementById('saveChangesBtn').addEventListener('click', () => {
    mostrarNotificacion('Guardando cambios...', 'info');
    
    setTimeout(() => {
        mostrarNotificacion('Cambios guardados correctamente', 'success');
        saveChangesBtn.style.display = 'none';
    }, 1000);
});

// =====================================================
// CERRAR MODALES CON ESC
// =====================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (passwordModal.classList.contains('show')) {
            cerrarPasswordModal();
        }
        if (editModal.classList.contains('show')) {
            cerrarEditModal();
        }
    }
});

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