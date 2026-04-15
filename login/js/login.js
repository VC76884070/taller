// =====================================================
// LOGIN - FURIA MOTOR COMPANY
// Funcionalidades: Login, Recuperar contraseña, Registro
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const tabBtns = document.querySelectorAll('.tab-btn');
const documentGroup = document.getElementById('documentGroup');
const plateGroup = document.getElementById('plateGroup');
const welcomeTitle = document.getElementById('welcomeTitle');
const welcomeSubtitle = document.getElementById('welcomeSubtitle');
const clientQuickAccess = document.getElementById('clientQuickAccess');
const loginForm = document.getElementById('loginForm');
const documentInput = document.getElementById('document');
const plateInput = document.getElementById('plate');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const rememberCheck = document.getElementById('remember');
const toastContainer = document.getElementById('toastContainer');

// Modales
const recoverModal = document.getElementById('recoverModal');
const registerModal = document.getElementById('registerModal');
const vehicleRegisterModal = document.getElementById('vehicleRegisterModal');

// Variables de estado
let selectedType = 'staff';
let recoveryEmail = '';
let recoveryUserType = '';
let registerData = {};
let recoveryTimer = null;
let registerTimer = null;
let recoveryTimeLeft = 0;
let registerTimeLeft = 0;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    setupEventListeners();
    checkSavedSession();  // Esto verificará si ya hay sesión
    setupCodeInputs();
}

function setupEventListeners() {
    // Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
            toggleLoginFields();
        });
    });

    // Login form
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Permitir email o documento en personal
    if (documentInput) {
        documentInput.addEventListener('keypress', (e) => {
            // No restringimos, puede ser email o documento
        });
    }

    // Convertir placa a mayúsculas
    if (plateInput) {
        plateInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
}

function toggleLoginFields() {
    if (selectedType === 'staff') {
        documentGroup.style.display = 'block';
        plateGroup.style.display = 'none';
        welcomeTitle.textContent = 'Acceso Personal Taller';
        welcomeSubtitle.textContent = 'Ingresa con tu número de documento o correo electrónico';
        clientQuickAccess.style.display = 'none';
        
        if (plateInput) plateInput.value = '';
        if (documentInput) {
            documentInput.focus();
        }
    } else {
        documentGroup.style.display = 'none';
        plateGroup.style.display = 'block';
        welcomeTitle.textContent = 'Acceso Cliente';
        welcomeSubtitle.textContent = 'Ingresa con tu correo electrónico o placa';
        clientQuickAccess.style.display = 'block';
        
        if (documentInput) documentInput.value = '';
        if (plateInput) {
            plateInput.focus();
        }
    }
}

// =====================================================
// LOGIN
// =====================================================
async function handleLogin(e) {
    e.preventDefault();
    
    const identifier = selectedType === 'staff' 
        ? documentInput?.value.trim() 
        : plateInput?.value.trim().toUpperCase();
        
    const password = passwordInput?.value;
    
    // Validaciones
    if (!identifier || !password) {
        showToast('Por favor completa todos los campos', 'warning');
        return;
    }
    
    // Mostrar loading
    setLoadingState(true);
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: selectedType,
                identifier: identifier,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error en el login');
        }
        
        // Login exitoso
        if (data.success) {
            localStorage.setItem('furia_token', data.token);
            localStorage.setItem('furia_user', JSON.stringify(data.user));
            
            if (rememberCheck?.checked) {
                localStorage.setItem('furia_remembered', identifier);
                localStorage.setItem('furia_remembered_type', selectedType);
            } else {
                localStorage.removeItem('furia_remembered');
                localStorage.removeItem('furia_remembered_type');
            }
            
            showToast(`¡Bienvenido ${data.user.nombre}!`, 'success');
            
            setTimeout(() => {
                window.location.href = data.redirect;
            }, 1500);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message || 'Error al conectar con el servidor', 'error');
        setLoadingState(false);
    }
}

function setLoadingState(loading) {
    if (loading) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
    } else {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>Ingresar al sistema</span><i class="fas fa-arrow-right"></i>';
    }
}

// =====================================================
// RECUPERAR CONTRASEÑA
// =====================================================
function openRecoverModal(e) {
    if (e) e.preventDefault();
    document.getElementById('recoverStep1').style.display = 'block';
    document.getElementById('recoverStep2').style.display = 'none';
    document.getElementById('recoverEmail').value = '';
    document.getElementById('recoverUserType').value = selectedType;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    
    // Limpiar códigos
    document.querySelectorAll('#recoverStep2 .code-digit').forEach(input => {
        input.value = '';
    });
    
    // Detener timer si existe
    if (recoveryTimer) {
        clearInterval(recoveryTimer);
        recoveryTimer = null;
    }
    document.getElementById('timerText').innerHTML = '';
    
    recoverModal.classList.add('show');
}

function closeRecoverModal() {
    recoverModal.classList.remove('show');
    if (recoveryTimer) {
        clearInterval(recoveryTimer);
        recoveryTimer = null;
    }
}

function goBackToStep1() {
    document.getElementById('recoverStep1').style.display = 'block';
    document.getElementById('recoverStep2').style.display = 'none';
    if (recoveryTimer) {
        clearInterval(recoveryTimer);
        recoveryTimer = null;
    }
    document.getElementById('timerText').innerHTML = '';
}

async function sendRecoveryCode() {
    const email = document.getElementById('recoverEmail').value.trim();
    const userType = document.getElementById('recoverUserType').value;
    
    if (!email) {
        showToast('Ingresa tu correo electrónico', 'warning');
        return;
    }
    
    if (!email.includes('@') || !email.includes('.')) {
        showToast('Ingresa un correo válido', 'warning');
        return;
    }
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/recuperar/solicitar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                tipo: userType
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al enviar el código');
        }
        
        recoveryEmail = email;
        recoveryUserType = userType;
        
        showToast('Código enviado a tu correo electrónico', 'success');
        
        // Mostrar email en el paso 2
        document.getElementById('recoverEmailDisplay').textContent = email;
        
        // Limpiar inputs de código
        document.querySelectorAll('#recoverStep2 .code-digit').forEach(input => {
            input.value = '';
        });
        
        document.getElementById('recoverStep1').style.display = 'none';
        document.getElementById('recoverStep2').style.display = 'block';
        
        // Iniciar timer para reenvío
        startRecoveryTimer();
        
        // Enfocar primer input de código
        document.querySelector('#recoverStep2 .code-digit')?.focus();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

function startRecoveryTimer() {
    recoveryTimeLeft = 60; // 60 segundos
    const timerText = document.getElementById('timerText');
    const resendBtn = document.getElementById('resendCodeBtn');
    
    if (recoveryTimer) clearInterval(recoveryTimer);
    
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.5';
    
    recoveryTimer = setInterval(() => {
        if (recoveryTimeLeft <= 0) {
            clearInterval(recoveryTimer);
            resendBtn.disabled = false;
            resendBtn.style.opacity = '1';
            timerText.innerHTML = '';
        } else {
            const minutos = Math.floor(recoveryTimeLeft / 60);
            const segundos = recoveryTimeLeft % 60;
            timerText.innerHTML = `Puedes reenviar el código en ${minutos}:${segundos.toString().padStart(2, '0')}`;
            recoveryTimeLeft--;
        }
    }, 1000);
}

async function resendRecoveryCode() {
    if (!recoveryEmail) return;
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/recuperar/solicitar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: recoveryEmail,
                tipo: recoveryUserType
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al reenviar el código');
        }
        
        showToast('Código reenviado a tu correo', 'success');
        
        // Reiniciar timer
        if (recoveryTimer) clearInterval(recoveryTimer);
        startRecoveryTimer();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

async function verifyAndChangePassword() {
    const codigo = getCodeFromInputs('#recoverStep2 .code-digit');
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (codigo.length !== 6) {
        showToast('Ingresa el código de 6 dígitos', 'warning');
        return;
    }
    
    if (!newPassword || newPassword.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres', 'warning');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/recuperar/cambiar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: recoveryEmail,
                codigo: codigo,
                nueva_contrasena: newPassword
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al cambiar la contraseña');
        }
        
        showToast('Contraseña actualizada correctamente', 'success');
        closeRecoverModal();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

// =====================================================
// REGISTRO DE CLIENTE
// =====================================================
function openRegisterModal() {
    registerData = {};
    document.getElementById('registerStep1').style.display = 'block';
    document.getElementById('registerStep2').style.display = 'none';
    document.getElementById('regNombre').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('regTelefono').value = '';
    document.getElementById('regDireccion').value = '';
    document.getElementById('regPassword').value = '';
    document.getElementById('regConfirmPassword').value = '';
    
    // Limpiar códigos
    document.querySelectorAll('#registerStep2 .code-digit').forEach(input => {
        input.value = '';
    });
    
    // Detener timer si existe
    if (registerTimer) {
        clearInterval(registerTimer);
        registerTimer = null;
    }
    document.getElementById('registerTimerText').innerHTML = '';
    
    registerModal.classList.add('show');
}

function closeRegisterModal() {
    registerModal.classList.remove('show');
    if (registerTimer) {
        clearInterval(registerTimer);
        registerTimer = null;
    }
}

function goBackToRegisterStep1() {
    document.getElementById('registerStep1').style.display = 'block';
    document.getElementById('registerStep2').style.display = 'none';
    if (registerTimer) {
        clearInterval(registerTimer);
        registerTimer = null;
    }
    document.getElementById('registerTimerText').innerHTML = '';
}

async function sendRegisterCode() {
    const nombre = document.getElementById('regNombre').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const telefono = document.getElementById('regTelefono').value.trim();
    const direccion = document.getElementById('regDireccion').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    
    if (!nombre || !email || !telefono || !direccion || !password) {
        showToast('Todos los campos son requeridos', 'warning');
        return;
    }
    
    if (!email.includes('@') || !email.includes('.')) {
        showToast('Ingresa un correo válido', 'warning');
        return;
    }
    
    if (password.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres', 'warning');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }
    
    registerData = { nombre, email, telefono, direccion, password };
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/registro/solicitar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                nombre: nombre,
                email: email,
                telefono: telefono,
                direccion: direccion,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al enviar el código');
        }
        
        showToast('Código de verificación enviado a tu correo', 'success');
        
        // Mostrar email en el paso 2
        document.getElementById('registerEmailDisplay').textContent = email;
        
        document.getElementById('registerStep1').style.display = 'none';
        document.getElementById('registerStep2').style.display = 'block';
        
        // Iniciar timer para reenvío
        startRegisterTimer();
        
        // Limpiar inputs de código
        document.querySelectorAll('#registerStep2 .code-digit').forEach(input => {
            input.value = '';
        });
        
        document.querySelector('#registerStep2 .code-digit')?.focus();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

function startRegisterTimer() {
    registerTimeLeft = 60;
    const timerText = document.getElementById('registerTimerText');
    const resendBtn = document.getElementById('resendRegisterCodeBtn');
    
    if (registerTimer) clearInterval(registerTimer);
    
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.5';
    
    registerTimer = setInterval(() => {
        if (registerTimeLeft <= 0) {
            clearInterval(registerTimer);
            resendBtn.disabled = false;
            resendBtn.style.opacity = '1';
            timerText.innerHTML = '';
        } else {
            const minutos = Math.floor(registerTimeLeft / 60);
            const segundos = registerTimeLeft % 60;
            timerText.innerHTML = `Puedes reenviar el código en ${minutos}:${segundos.toString().padStart(2, '0')}`;
            registerTimeLeft--;
        }
    }, 1000);
}

async function resendRegisterCode() {
    if (!registerData.email) return;
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/registro/solicitar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                nombre: registerData.nombre,
                email: registerData.email,
                telefono: registerData.telefono,
                direccion: registerData.direccion,
                password: registerData.password
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al reenviar el código');
        }
        
        showToast('Código reenviado a tu correo', 'success');
        
        // Reiniciar timer
        if (registerTimer) clearInterval(registerTimer);
        startRegisterTimer();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

async function verifyRegisterCode() {
    const codigo = getCodeFromInputs('#registerStep2 .code-digit');
    
    if (codigo.length !== 6) {
        showToast('Ingresa el código de 6 dígitos', 'warning');
        return;
    }
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/registro/confirmar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: registerData.email,
                codigo: codigo
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al verificar el código');
        }
        
        showToast('Registro completado exitosamente. Ahora puedes iniciar sesión.', 'success');
        closeRegisterModal();
        
        // Cambiar a tab cliente
        document.querySelector('.tab-btn[data-type="client"]').click();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

// =====================================================
// REGISTRO DE VEHÍCULO EXISTENTE
// =====================================================
function openVehicleRegisterModal() {
    document.getElementById('vehPlaca').value = '';
    document.getElementById('vehMarca').value = '';
    document.getElementById('vehModelo').value = '';
    document.getElementById('vehAnio').value = '';
    document.getElementById('vehColor').value = '';
    vehicleRegisterModal.classList.add('show');
}

function closeVehicleRegisterModal() {
    vehicleRegisterModal.classList.remove('show');
}

async function registerVehicle() {
    const email = localStorage.getItem('register_email') || prompt('Para registrar tu vehículo, ingresa tu correo electrónico:');
    const placa = document.getElementById('vehPlaca').value.trim().toUpperCase();
    const marca = document.getElementById('vehMarca').value.trim();
    const modelo = document.getElementById('vehModelo').value.trim();
    const anio = document.getElementById('vehAnio').value.trim();
    const color = document.getElementById('vehColor').value.trim();
    
    if (!email) {
        showToast('Necesitas un correo electrónico registrado', 'warning');
        return;
    }
    
    if (!placa || !marca || !modelo) {
        showToast('Placa, marca y modelo son requeridos', 'warning');
        return;
    }
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/registro/vehiculo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                placa: placa,
                marca: marca,
                modelo: modelo,
                anio: anio,
                color: color
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al registrar el vehículo');
        }
        
        showToast('Vehículo registrado exitosamente', 'success');
        closeVehicleRegisterModal();
        
        // Cambiar a tab cliente y precargar placa
        document.querySelector('.tab-btn[data-type="client"]').click();
        if (plateInput) {
            plateInput.value = placa;
        }
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

// =====================================================
// UTILIDADES
// =====================================================
function togglePassword() {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    const toggleIcon = document.getElementById('toggleIcon');
    if (toggleIcon) {
        toggleIcon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
}

function setupCodeInputs() {
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('code-digit')) {
            const inputs = document.querySelectorAll(e.target.closest('.code-inputs') ? '.code-digit' : '.code-digit');
            const index = parseInt(e.target.dataset.index);
            
            if (e.target.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('code-digit') && e.key === 'Backspace') {
            const inputs = document.querySelectorAll(e.target.closest('.code-inputs') ? '.code-digit' : '.code-digit');
            const index = parseInt(e.target.dataset.index);
            
            if (e.target.value === '' && index > 0) {
                inputs[index - 1].focus();
            }
        }
    });
}

function getCodeFromInputs(selector) {
    let code = '';
    document.querySelectorAll(selector).forEach(input => {
        code += input.value;
    });
    return code;
}

function setModalLoading(loading) {
    const buttons = document.querySelectorAll('.modal .btn-primary, .modal .btn-secondary, .modal button');
    buttons.forEach(btn => {
        if (loading) {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

async function checkSavedSession() {
    const token = localStorage.getItem('furia_token');
    const currentPath = window.location.pathname;
    
    // Si no hay token, no hacer nada
    if (!token) return;
    
    // Si ya estamos en la página de login, verificar token y redirigir si es válido
    if (currentPath === '/' || currentPath === '/login.html') {
        try {
            const response = await fetch(`${API_URL}/verify-token`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok && data.valid && data.user) {
                const user = data.user;
                let redirect = '/';
                
                // Determinar redirección basada en roles
                if (user.type === 'client') {
                    redirect = '/cliente/misvehiculos.html';
                } else if (user.roles && user.roles.length > 0) {
                    const roleRedirects = {
                        'jefe_operativo': '/jefe_operativo/dashboard.html',
                        'jefe_taller': '/jefe_taller/dashboard.html',
                        'tecnico': '/tecnico_mecanico/misvehiculos.html',
                        'encargado_repuestos': '/encargado_rep_almacen/dashboard.html'
                    };
                    
                    // Buscar el primer rol que tenga redirección
                    for (const rol of user.roles) {
                        if (roleRedirects[rol]) {
                            redirect = roleRedirects[rol];
                            break;
                        }
                    }
                }
                
                // Solo redirigir si no estamos ya en la página destino
                if (redirect !== '/' && !window.location.pathname.includes(redirect)) {
                    window.location.href = redirect;
                }
            } else {
                // Token inválido, limpiar
                localStorage.removeItem('furia_token');
                localStorage.removeItem('furia_user');
                localStorage.removeItem('furia_remembered');
                localStorage.removeItem('furia_remembered_type');
            }
        } catch (error) {
            console.error('Error verificando token:', error);
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
        }
    }
    
    // Cargar credenciales recordadas para el formulario
    const remembered = localStorage.getItem('furia_remembered');
    const rememberedType = localStorage.getItem('furia_remembered_type');
    
    if (remembered && rememberedType) {
        if (rememberedType === 'staff' && documentInput) {
            documentInput.value = remembered;
        } else if (rememberedType === 'client' && plateInput) {
            plateInput.value = remembered;
        }
        
        if (rememberCheck) {
            rememberCheck.checked = true;
        }
        
        // Cambiar al tab correcto
        if (rememberedType !== selectedType) {
            const tabBtn = document.querySelector(`.tab-btn[data-type="${rememberedType}"]`);
            if (tabBtn) tabBtn.click();
        }
    }
}

// Funciones globales
window.togglePassword = togglePassword;
window.openRecoverModal = openRecoverModal;
window.closeRecoverModal = closeRecoverModal;
window.goBackToStep1 = goBackToStep1;
window.sendRecoveryCode = sendRecoveryCode;
window.resendRecoveryCode = resendRecoveryCode;
window.verifyAndChangePassword = verifyAndChangePassword;
window.openRegisterModal = openRegisterModal;
window.closeRegisterModal = closeRegisterModal;
window.goBackToRegisterStep1 = goBackToRegisterStep1;
window.sendRegisterCode = sendRegisterCode;
window.resendRegisterCode = resendRegisterCode;
window.verifyRegisterCode = verifyRegisterCode;
window.openVehicleRegisterModal = openVehicleRegisterModal;
window.closeVehicleRegisterModal = closeVehicleRegisterModal;
window.registerVehicle = registerVehicle;
window.logout = () => {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};