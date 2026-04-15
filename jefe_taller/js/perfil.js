// =====================================================
// PERFIL - JEFE TALLER
// =====================================================

const API_URL = 'http://localhost:5000/api';
let userInfo = null;
let avatarBase64 = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    await cargarDatosPerfil();
    await cargarEstadisticas();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    userInfo = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || (userInfo.rol !== 'jefe_taller' && userInfo.id_rol !== 3)) {
        window.location.href = '/';
        return false;
    }
    return true;
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

function setupEventListeners() {
    document.getElementById('btnGuardarPerfil')?.addEventListener('click', guardarPerfil);
    document.getElementById('btnCambiarPassword')?.addEventListener('click', cambiarPassword);
    document.getElementById('btnCancelar')?.addEventListener('click', cancelarEdicion);
    document.getElementById('avatarInput')?.addEventListener('change', previewAvatar);
}

// =====================================================
// CARGAR DATOS DEL PERFIL
// =====================================================

async function cargarDatosPerfil() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/perfil`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error cargando perfil');
        }
        
        const usuario = data.usuario;
        
        // Llenar formulario
        document.getElementById('nombre').value = usuario.nombre || '';
        document.getElementById('email').value = usuario.email || '';
        document.getElementById('contacto').value = usuario.contacto || '';
        document.getElementById('ubicacion').value = usuario.ubicacion || '';
        document.getElementById('userNameDisplay').textContent = usuario.nombre || 'Jefe de Taller';
        
        // Mostrar avatar
        const avatarPreview = document.getElementById('avatarPreview');
        if (usuario.avatar_url) {
            avatarPreview.src = usuario.avatar_url;
        } else {
            avatarPreview.src = 'https://ui-avatars.com/api/?background=C1121F&color=fff&name=' + encodeURIComponent(usuario.nombre || 'Jefe Taller');
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/perfil/estadisticas`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error cargando estadísticas');
        }
        
        document.getElementById('ordenesAtendidas').textContent = data.estadisticas.ordenes_atendidas || 0;
        document.getElementById('diagnosticosRevisados').textContent = data.estadisticas.diagnosticos_revisados || 0;
        document.getElementById('miembroDesde').textContent = data.estadisticas.miembro_desde || '-';
        document.getElementById('ultimoAcceso').textContent = data.estadisticas.ultimo_acceso || '-';
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// =====================================================
// PREVISUALIZAR AVATAR
// =====================================================

function previewAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        mostrarNotificacion('Selecciona una imagen válida', 'warning');
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        mostrarNotificacion('La imagen no debe superar los 2MB', 'warning');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        avatarBase64 = e.target.result;
        document.getElementById('avatarPreview').src = avatarBase64;
    };
    reader.readAsDataURL(file);
}

// =====================================================
// GUARDAR PERFIL
// =====================================================

async function guardarPerfil() {
    const nombre = document.getElementById('nombre').value.trim();
    const email = document.getElementById('email').value.trim();
    const contacto = document.getElementById('contacto').value.trim();
    const ubicacion = document.getElementById('ubicacion').value.trim();
    
    if (!nombre) {
        mostrarNotificacion('El nombre es requerido', 'warning');
        return;
    }
    
    if (!email) {
        mostrarNotificacion('El correo electrónico es requerido', 'warning');
        return;
    }
    
    if (!email.includes('@')) {
        mostrarNotificacion('Ingresa un correo válido', 'warning');
        return;
    }
    
    mostrarNotificacion('Guardando cambios...', 'info');
    
    try {
        // Subir avatar si hay uno nuevo
        let avatarUrl = null;
        if (avatarBase64) {
            const avatarResponse = await fetch(`${API_URL}/jefe-taller/perfil/avatar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
                },
                body: JSON.stringify({ avatar: avatarBase64 })
            });
            
            const avatarData = await avatarResponse.json();
            if (avatarResponse.ok && avatarData.avatar_url) {
                avatarUrl = avatarData.avatar_url;
            } else {
                throw new Error(avatarData.error || 'Error subiendo avatar');
            }
        }
        
        // Guardar datos del perfil
        const response = await fetch(`${API_URL}/jefe-taller/perfil`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({
                nombre,
                email,
                contacto,
                ubicacion,
                avatar_url: avatarUrl
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error guardando perfil');
        }
        
        // Actualizar localStorage
        const storedUser = JSON.parse(localStorage.getItem('furia_user') || '{}');
        storedUser.nombre = nombre;
        storedUser.email = email;
        localStorage.setItem('furia_user', JSON.stringify(storedUser));
        
        // Actualizar display
        document.getElementById('userNameDisplay').textContent = nombre;
        
        mostrarNotificacion('Perfil actualizado correctamente', 'success');
        avatarBase64 = null;
        
        // Recargar datos
        await cargarDatosPerfil();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cancelarEdicion() {
    cargarDatosPerfil();
    avatarBase64 = null;
    document.getElementById('avatarInput').value = '';
    mostrarNotificacion('Cambios descartados', 'info');
}

// =====================================================
// CAMBIAR CONTRASEÑA
// =====================================================

async function cambiarPassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword) {
        mostrarNotificacion('Ingresa tu contraseña actual', 'warning');
        return;
    }
    
    if (!newPassword) {
        mostrarNotificacion('Ingresa una nueva contraseña', 'warning');
        return;
    }
    
    if (newPassword.length < 6) {
        mostrarNotificacion('La nueva contraseña debe tener al menos 6 caracteres', 'warning');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        mostrarNotificacion('Las contraseñas no coinciden', 'warning');
        return;
    }
    
    mostrarNotificacion('Actualizando contraseña...', 'info');
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/perfil/cambiar-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error cambiando contraseña');
        }
        
        // Limpiar formulario
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        mostrarNotificacion('Contraseña actualizada correctamente', 'success');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

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
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && document.body.contains(toast)) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
        }
    }, 3000);
}

// Exponer funciones globales
window.logout = function() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        window.location.href = '/';
    }
};