// =====================================================
// PERFIL - TÉCNICO MECÁNICO (VERSIÓN OPTIMIZADA)
// VERSIÓN CORREGIDA CON URL DINÁMICA PARA PRODUCCIÓN
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - FUNCIONA EN LOCAL Y PRODUCCIÓN
// =====================================================
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Modo DESARROLLO - Usando localhost:5000');
        return 'http://localhost:5000';
    }
    console.log('📡 Modo PRODUCCIÓN - Usando URL relativa');
    return '';
})();

let token = null;
let usuarioActual = null;
let datosOriginales = {};
let isLoading = false;

// =====================================================
// UTILIDADES
// =====================================================

function getToken() {
    const localToken = localStorage.getItem('furia_token');
    if (localToken) return localToken;
    const fallbackToken = localStorage.getItem('token');
    if (fallbackToken) return fallbackToken;
    return null;
}

function mostrarFechaActual() {
    const fechaSpan = document.getElementById('currentDate');
    if (fechaSpan) {
        const hoy = new Date();
        const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
        fechaSpan.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;`;
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    toast.style.cssText = `
        background: var(--bg-card); color: var(--blanco); padding: 0.75rem 1.25rem;
        border-radius: 10px; display: flex; align-items: center; gap: 0.75rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-left: 4px solid ${type === 'success' ? '#10B981' : type === 'error' ? '#C1121F' : type === 'warning' ? '#F59E0B' : '#1E3A5F'};
        animation: slideIn 0.3s ease;
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function formatFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const fecha = new Date(fechaStr);
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    } catch (e) {
        return 'N/A';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Mostrar skeleton loading
function showSkeletonLoading() {
    const statsItems = document.querySelectorAll('.stat-value');
    statsItems.forEach(item => {
        if (item.textContent === '0' || item.textContent === '-') {
            item.classList.add('skeleton');
        }
    });
}

function hideSkeletonLoading() {
    const skeletonItems = document.querySelectorAll('.skeleton');
    skeletonItems.forEach(item => {
        item.classList.remove('skeleton');
    });
}

// =====================================================
// VERIFICACIÓN DE AUTENTICACIÓN
// =====================================================

async function verificarToken() {
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/verify-token`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.valid) {
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            window.location.href = '/';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error verificando token:', error);
        window.location.href = '/';
        return false;
    }
}

// =====================================================
// CARGAR PERFIL (OPTIMIZADO - UNA SOLA LLAMADA)
// =====================================================

async function cargarPerfil() {
    if (isLoading) return;
    isLoading = true;
    
    try {
        showSkeletonLoading();
        
        const response = await fetch(`${API_BASE_URL}/tecnico/api/perfil`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            usuarioActual = data.usuario;
            datosOriginales = { ...usuarioActual };
            
            // Actualizar UI de forma eficiente
            actualizarUI(usuarioActual, data.estadisticas);
            
            showToast('Perfil cargado correctamente', 'success');
        } else {
            showToast(data.error || 'Error al cargar perfil', 'error');
        }
    } catch (error) {
        console.error('Error cargando perfil:', error);
        showToast('Error al cargar perfil', 'error');
    } finally {
        isLoading = false;
        hideSkeletonLoading();
    }
}

function actualizarUI(usuario, estadisticas) {
    // Datos personales
    const nombreElement = document.getElementById('nombreUsuario');
    if (nombreElement) nombreElement.textContent = usuario.nombre || 'Técnico';
    
    const nombreInput = document.getElementById('nombre');
    if (nombreInput) nombreInput.value = usuario.nombre || '';
    
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = usuario.email || '';
    
    const contactoInput = document.getElementById('contacto');
    if (contactoInput) contactoInput.value = usuario.contacto || '';
    
    const ubicacionInput = document.getElementById('ubicacion');
    if (ubicacionInput) ubicacionInput.value = usuario.ubicacion || '';
    
    // Avatar
    const avatarImg = document.getElementById('avatarImg');
    if (avatarImg) {
        if (usuario.avatar_url) {
            avatarImg.src = usuario.avatar_url;
        } else {
            avatarImg.src = 'https://ui-avatars.com/api/?background=C1121F&color=fff&name=' + encodeURIComponent(usuario.nombre || 'Técnico');
        }
    }
    
    // Estadísticas
    const totalTrabajos = document.getElementById('totalTrabajos');
    if (totalTrabajos) totalTrabajos.textContent = estadisticas?.total_trabajos || 0;
    
    const trabajosCompletados = document.getElementById('trabajosCompletados');
    if (trabajosCompletados) trabajosCompletados.textContent = estadisticas?.trabajos_completados || 0;
    
    const trabajosActivos = document.getElementById('trabajosActivos');
    if (trabajosActivos) trabajosActivos.textContent = estadisticas?.trabajos_activos || 0;
    
    const fechaRegistro = document.getElementById('fechaRegistro');
    if (fechaRegistro) fechaRegistro.textContent = formatFecha(usuario.fecha_registro);
    
    // Información de cuenta
    const infoId = document.getElementById('infoId');
    if (infoId) infoId.textContent = usuario.id || '-';
    
    const infoRol = document.getElementById('infoRol');
    if (infoRol) infoRol.textContent = 'Técnico Mecánico';
    
    const infoFechaRegistro = document.getElementById('infoFechaRegistro');
    if (infoFechaRegistro) infoFechaRegistro.textContent = formatFecha(usuario.fecha_registro);
    
    const infoEmail = document.getElementById('infoEmail');
    if (infoEmail) infoEmail.textContent = usuario.email || '-';
    
    const infoContacto = document.getElementById('infoContacto');
    if (infoContacto) infoContacto.textContent = usuario.contacto || 'No registrado';
    
    const infoUbicacion = document.getElementById('infoUbicacion');
    if (infoUbicacion) infoUbicacion.textContent = usuario.ubicacion || 'No registrada';
    
    const infoUltimaActividad = document.getElementById('infoUltimaActividad');
    if (infoUltimaActividad) infoUltimaActividad.textContent = 'Hoy';
}

// =====================================================
// ACTUALIZAR AVATAR
// =====================================================

async function actualizarAvatar(file) {
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
        showToast('La imagen no debe superar los 2MB', 'warning');
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        showToast('Solo se permiten archivos de imagen', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
        showToast('Subiendo avatar...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/tecnico/api/perfil/avatar`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            const avatarImg = document.getElementById('avatarImg');
            if (avatarImg) {
                avatarImg.src = data.avatar_url + '?t=' + Date.now();
            }
            if (usuarioActual) usuarioActual.avatar_url = data.avatar_url;
            showToast('Avatar actualizado', 'success');
        } else {
            showToast(data.error || 'Error al actualizar avatar', 'error');
        }
    } catch (error) {
        console.error('Error subiendo avatar:', error);
        showToast('Error al subir avatar', 'error');
    }
}

// =====================================================
// GUARDAR DATOS PERSONALES
// =====================================================

function validarDatosPersonales() {
    const nombre = document.getElementById('nombre')?.value.trim() || '';
    const email = document.getElementById('email')?.value.trim() || '';
    
    if (!nombre) {
        showToast('El nombre es requerido', 'warning');
        return false;
    }
    
    if (!email) {
        showToast('El correo electrónico es requerido', 'warning');
        return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Ingresa un correo electrónico válido', 'warning');
        return false;
    }
    
    return true;
}

async function guardarDatosPersonales() {
    if (!validarDatosPersonales()) return;
    
    const datos = {
        nombre: document.getElementById('nombre')?.value.trim() || '',
        email: document.getElementById('email')?.value.trim() || '',
        contacto: document.getElementById('contacto')?.value.trim() || '',
        ubicacion: document.getElementById('ubicacion')?.value.trim() || ''
    };
    
    try {
        showToast('Guardando cambios...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/tecnico/api/perfil`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(datos)
        });
        
        const data = await response.json();
        
        if (data.success) {
            usuarioActual = { ...usuarioActual, ...datos };
            datosOriginales = { ...usuarioActual };
            
            const nombreUsuario = document.getElementById('nombreUsuario');
            if (nombreUsuario) nombreUsuario.textContent = datos.nombre;
            
            // Actualizar avatar si cambió el nombre y no hay avatar personalizado
            if (!usuarioActual.avatar_url) {
                const avatarImg = document.getElementById('avatarImg');
                if (avatarImg) {
                    avatarImg.src = 'https://ui-avatars.com/api/?background=C1121F&color=fff&name=' + encodeURIComponent(datos.nombre);
                }
            }
            
            // Actualizar información de cuenta
            const infoEmail = document.getElementById('infoEmail');
            if (infoEmail) infoEmail.textContent = datos.email || '-';
            
            const infoContacto = document.getElementById('infoContacto');
            if (infoContacto) infoContacto.textContent = datos.contacto || 'No registrado';
            
            const infoUbicacion = document.getElementById('infoUbicacion');
            if (infoUbicacion) infoUbicacion.textContent = datos.ubicacion || 'No registrada';
            
            cerrarConfirmModal();
            showToast('Datos actualizados correctamente', 'success');
        } else {
            showToast(data.error || 'Error al guardar cambios', 'error');
        }
    } catch (error) {
        console.error('Error guardando datos:', error);
        showToast('Error al guardar cambios', 'error');
    }
}

// =====================================================
// CAMBIAR CONTRASEÑA
// =====================================================

function validarPassword() {
    const actual = document.getElementById('passwordActual')?.value || '';
    const nueva = document.getElementById('nuevaPassword')?.value || '';
    const confirmar = document.getElementById('confirmarPassword')?.value || '';
    
    if (!actual) {
        showToast('Ingresa tu contraseña actual', 'warning');
        return false;
    }
    
    if (!nueva) {
        showToast('Ingresa una nueva contraseña', 'warning');
        return false;
    }
    
    if (nueva.length < 6) {
        showToast('La nueva contraseña debe tener al menos 6 caracteres', 'warning');
        return false;
    }
    
    if (nueva !== confirmar) {
        showToast('Las contraseñas no coinciden', 'warning');
        return false;
    }
    
    return true;
}

function verificarRequisitosPassword() {
    const nueva = document.getElementById('nuevaPassword')?.value || '';
    const confirmar = document.getElementById('confirmarPassword')?.value || '';
    
    const reqLength = document.getElementById('req-length');
    const reqNumber = document.getElementById('req-number');
    const reqMatch = document.getElementById('req-match');
    
    // Longitud
    if (reqLength) {
        if (nueva.length >= 6) {
            reqLength.classList.add('valid');
            reqLength.innerHTML = '<i class="fas fa-check-circle"></i> Mínimo 6 caracteres';
        } else {
            reqLength.classList.remove('valid');
            reqLength.innerHTML = '<i class="fas fa-circle"></i> Mínimo 6 caracteres';
        }
    }
    
    // Número
    if (reqNumber) {
        if (/\d/.test(nueva)) {
            reqNumber.classList.add('valid');
            reqNumber.innerHTML = '<i class="fas fa-check-circle"></i> Al menos un número';
        } else {
            reqNumber.classList.remove('valid');
            reqNumber.innerHTML = '<i class="fas fa-circle"></i> Al menos un número';
        }
    }
    
    // Coincidencia
    if (reqMatch) {
        if (nueva && nueva === confirmar) {
            reqMatch.classList.add('valid');
            reqMatch.innerHTML = '<i class="fas fa-check-circle"></i> Las contraseñas coinciden';
        } else {
            reqMatch.classList.remove('valid');
            reqMatch.innerHTML = '<i class="fas fa-circle"></i> Las contraseñas coinciden';
        }
    }
}

async function cambiarPassword() {
    if (!validarPassword()) return;
    
    const data = {
        password_actual: document.getElementById('passwordActual')?.value || '',
        nueva_password: document.getElementById('nuevaPassword')?.value || ''
    };
    
    try {
        showToast('Cambiando contraseña...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/tecnico/api/perfil/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            cerrarPasswordModal();
            const formPassword = document.getElementById('formCambiarPassword');
            if (formPassword) formPassword.reset();
            verificarRequisitosPassword();
            showToast('Contraseña cambiada correctamente', 'success');
        } else {
            showToast(result.error || 'Error al cambiar contraseña', 'error');
        }
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        showToast('Error al cambiar contraseña', 'error');
    }
}

// =====================================================
// TABS
// =====================================================

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetTab = document.getElementById(`tab-${tabId}`);
            if (targetTab) targetTab.classList.add('active');
        });
    });
}

// =====================================================
// MODALES
// =====================================================

function abrirConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('show');
}

function cerrarConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.remove('show');
}

function abrirPasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.classList.add('show');
}

function cerrarPasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// CANCELAR EDICIÓN
// =====================================================

function cancelarEdicionDatos() {
    const nombreInput = document.getElementById('nombre');
    const emailInput = document.getElementById('email');
    const contactoInput = document.getElementById('contacto');
    const ubicacionInput = document.getElementById('ubicacion');
    
    if (nombreInput) nombreInput.value = datosOriginales.nombre || '';
    if (emailInput) emailInput.value = datosOriginales.email || '';
    if (contactoInput) contactoInput.value = datosOriginales.contacto || '';
    if (ubicacionInput) ubicacionInput.value = datosOriginales.ubicacion || '';
    
    showToast('Cambios descartados', 'info');
}

function cancelarCambioPassword() {
    const formPassword = document.getElementById('formCambiarPassword');
    if (formPassword) formPassword.reset();
    verificarRequisitosPassword();
    showToast('Cambios descartados', 'info');
}

// =====================================================
// CIERRE DE SESIÓN
// =====================================================

function cerrarSesion() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando perfil.js');
    console.log('📡 API_BASE_URL:', API_BASE_URL);
    
    token = getToken();
    
    if (!token) {
        window.location.href = '/';
        return;
    }
    
    const tokenValido = await verificarToken();
    if (!tokenValido) return;
    
    mostrarFechaActual();
    await cargarPerfil();
    initTabs();
    
    // Event Listeners
    const avatarContainer = document.getElementById('avatarContainer');
    const avatarInput = document.getElementById('avatarInput');
    const formDatos = document.getElementById('formDatosPersonales');
    const formPassword = document.getElementById('formCambiarPassword');
    const btnCancelarDatos = document.getElementById('btnCancelarDatos');
    const btnCancelarPassword = document.getElementById('btnCancelarPassword');
    const confirmarGuardar = document.getElementById('confirmarGuardarBtn');
    const confirmarPassword = document.getElementById('confirmarPasswordBtn');
    
    // Nueva contraseña (verificación en tiempo real)
    const nuevaPassword = document.getElementById('nuevaPassword');
    const confirmarPasswordInput = document.getElementById('confirmarPassword');
    
    if (nuevaPassword && confirmarPasswordInput) {
        nuevaPassword.addEventListener('input', verificarRequisitosPassword);
        confirmarPasswordInput.addEventListener('input', verificarRequisitosPassword);
    }
    
    if (avatarContainer && avatarInput) {
        avatarContainer.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) actualizarAvatar(e.target.files[0]);
        });
    }
    
    if (formDatos) {
        formDatos.addEventListener('submit', (e) => {
            e.preventDefault();
            abrirConfirmModal();
        });
    }
    
    if (formPassword) {
        formPassword.addEventListener('submit', (e) => {
            e.preventDefault();
            abrirPasswordModal();
        });
    }
    
    if (btnCancelarDatos) btnCancelarDatos.addEventListener('click', cancelarEdicionDatos);
    if (btnCancelarPassword) btnCancelarPassword.addEventListener('click', cancelarCambioPassword);
    if (confirmarGuardar) confirmarGuardar.addEventListener('click', guardarDatosPersonales);
    if (confirmarPassword) confirmarPassword.addEventListener('click', cambiarPassword);
    
    // Cargar sidebar
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        try {
            const response = await fetch(`${API_BASE_URL}/tecnico_mecanico/components/sidebar.html`);
            if (response.ok) {
                sidebarContainer.innerHTML = await response.text();
            }
        } catch (error) {
            console.error('Error cargando sidebar:', error);
        }
    }
    
    // Exponer funciones globales
    window.cerrarSesion = cerrarSesion;
    window.cerrarConfirmModal = cerrarConfirmModal;
    window.cerrarPasswordModal = cerrarPasswordModal;
    window.cancelarEdicionDatos = cancelarEdicionDatos;
    window.cancelarCambioPassword = cancelarCambioPassword;
    
    console.log('✅ perfil.js cargado correctamente');
});