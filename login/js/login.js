// =====================================================
// LOGIN - FURIA MOTOR COMPANY
// Funcionalidades: Login, Recuperar contraseña, Registro, Multi-rol
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Configuración de roles con URLs correctas
const ROLE_CONFIG = {
    'jefe_taller': {
        nombre: 'Jefe de Taller',
        icono: 'fa-user-tie',
        descripcion: 'Gestión de diagnósticos, aprobación de servicios, control de calidad',
        redirect: '/jefe_taller/dashboard.html'
    },
    'jefe_operativo': {
        nombre: 'Jefe Operativo',
        icono: 'fa-chart-line',
        descripcion: 'Dashboard general, reportes, gestión de órdenes',
        redirect: '/jefe_operativo/dashboard.html'
    },
    'tecnico': {
        nombre: 'Técnico Mecánico',
        icono: 'fa-wrench',
        descripcion: 'Diagnósticos, órdenes de trabajo asignadas',
        redirect: '/tecnico_mecanico/misvehiculos.html'
    },
    'encargado_repuestos': {
        nombre: 'Encargado de Repuestos',
        icono: 'fa-boxes',
        descripcion: 'Cotizaciones, gestión de inventario',
        redirect: '/encargado_rep_almacen/dashboard.html'
    },
    'admin_general': {
        nombre: 'Administrador General',
        icono: 'fa-crown',
        descripcion: 'Control total del sistema',
        redirect: '/admin_general/dashboard.html'
    }
};

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

// Variables para multi-rol
let pendingLoginData = null;
let pendingToken = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    setupEventListeners();
    checkSavedSession();
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
        if (documentInput) documentInput.focus();
    } else {
        documentGroup.style.display = 'none';
        plateGroup.style.display = 'block';
        welcomeTitle.textContent = 'Acceso Cliente';
        welcomeSubtitle.textContent = 'Ingresa con tu correo electrónico o placa';
        clientQuickAccess.style.display = 'block';
        
        if (documentInput) documentInput.value = '';
        if (plateInput) plateInput.focus();
    }
}

// =====================================================
// LOGIN CON SOPORTE MULTI-ROL
// =====================================================
async function handleLogin(e) {
    e.preventDefault();
    
    const identifier = selectedType === 'staff' 
        ? documentInput?.value.trim() 
        : plateInput?.value.trim().toUpperCase();
        
    const password = passwordInput?.value;
    
    if (!identifier || !password) {
        showToast('Por favor completa todos los campos', 'warning');
        return;
    }
    
    setLoadingState(true);
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        
        if (data.success && data.user) {
            const userRoles = data.user.roles || [];
            const isMultiRole = userRoles.length > 1;
            
            // Verificar si tiene un rol guardado previamente
            const savedRole = localStorage.getItem('furia_selected_role');
            const savedUserId = localStorage.getItem('furia_selected_role_user');
            const hasSavedRole = savedRole && savedUserId && savedUserId == data.user.id && userRoles.includes(savedRole);
            
            console.log('🔍 Roles del usuario:', userRoles);
            console.log('📌 Rol guardado:', savedRole, 'Coincide:', hasSavedRole);
            
            if (isMultiRole && !hasSavedRole) {
                // Mostrar modal de selección de rol
                console.log('🎯 Mostrando modal de selección de roles');
                pendingLoginData = data.user;
                pendingToken = data.token;
                showRoleSelectionModal(data.user);
                setLoadingState(false);
                return;
            }
            
            // Si tiene un solo rol o tiene selección guardada
            let finalUserData = data.user;
            let redirectUrl = null;
            
            if (hasSavedRole) {
                finalUserData = {
                    ...data.user,
                    selected_role: savedRole
                };
                if (ROLE_CONFIG[savedRole]) {
                    redirectUrl = ROLE_CONFIG[savedRole].redirect;
                }
                console.log('✅ Usando rol guardado:', savedRole, 'Redirect:', redirectUrl);
            } else if (userRoles.length === 1) {
                // Un solo rol, usar ese
                const singleRole = userRoles[0];
                if (ROLE_CONFIG[singleRole]) {
                    redirectUrl = ROLE_CONFIG[singleRole].redirect;
                    finalUserData = {
                        ...data.user,
                        selected_role: singleRole
                    };
                }
                console.log('✅ Un solo rol:', singleRole, 'Redirect:', redirectUrl);
            } else {
                // Fallback - usar el primer rol
                const firstRole = userRoles[0];
                if (ROLE_CONFIG[firstRole]) {
                    redirectUrl = ROLE_CONFIG[firstRole].redirect;
                }
            }
            
            localStorage.setItem('furia_token', data.token);
            localStorage.setItem('furia_user', JSON.stringify(finalUserData));
            
            if (rememberCheck?.checked) {
                localStorage.setItem('furia_remembered', identifier);
                localStorage.setItem('furia_remembered_type', selectedType);
            } else {
                localStorage.removeItem('furia_remembered');
                localStorage.removeItem('furia_remembered_type');
            }
            
            const roleName = finalUserData.selected_role ? ` (${ROLE_CONFIG[finalUserData.selected_role]?.nombre || finalUserData.selected_role})` : '';
            showToast(`¡Bienvenido ${finalUserData.nombre}!${roleName}`, 'success');
            
            if (redirectUrl) {
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 1500);
            } else {
                setLoadingState(false);
                showToast('Error: No se pudo determinar el destino', 'error');
            }
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
// SELECCIÓN DE ROL (MULTI-ROL)
// =====================================================

function showRoleSelectionModal(user) {
    const modal = document.getElementById('roleSelectionModal');
    const rolesGrid = document.getElementById('rolesGrid');
    const userNameSpan = document.getElementById('roleUserName');
    
    if (!modal || !rolesGrid) {
        console.error('Modal de selección de roles no encontrado');
        return;
    }
    
    if (userNameSpan) userNameSpan.textContent = user.nombre || 'Usuario';
    
    const userRoles = user.roles || [];
    const availableRoles = userRoles.filter(rol => ROLE_CONFIG[rol]);
    
    console.log('🎨 Roles disponibles para selección:', availableRoles);
    
    if (availableRoles.length === 0) {
        console.error('No hay roles válidos disponibles');
        return;
    }
    
    rolesGrid.innerHTML = availableRoles.map(rol => `
        <div class="role-card" data-role="${rol}" onclick="selectRole('${rol}')">
            <div class="role-icon">
                <i class="fas ${ROLE_CONFIG[rol].icono}"></i>
            </div>
            <div class="role-name">${ROLE_CONFIG[rol].nombre}</div>
            <div class="role-description">${ROLE_CONFIG[rol].descripcion}</div>
        </div>
    `).join('');
    
    modal.classList.add('show');
}

function closeRoleSelectionModal() {
    const modal = document.getElementById('roleSelectionModal');
    if (modal) modal.classList.remove('show');
    pendingLoginData = null;
    pendingToken = null;
}

// Función global para seleccionar rol
window.selectRole = function(selectedRole) {
    console.log('🎯 Rol seleccionado:', selectedRole);
    console.log('📦 Datos pendientes:', pendingLoginData);
    
    if (!pendingLoginData || !pendingToken) {
        showToast('Error: No hay datos de sesión', 'error');
        closeRoleSelectionModal();
        return;
    }
    
    // Verificar que el rol seleccionado esté en la lista de roles del usuario
    if (!pendingLoginData.roles.includes(selectedRole)) {
        console.error('Rol no permitido:', selectedRole, 'Roles disponibles:', pendingLoginData.roles);
        showToast('No tienes permiso para acceder con este rol', 'error');
        return;
    }
    
    // Verificar si el usuario marcó "recordar mi selección"
    const rememberChoice = document.getElementById('rememberRoleChoice')?.checked || false;
    
    if (rememberChoice) {
        localStorage.setItem('furia_selected_role', selectedRole);
        localStorage.setItem('furia_selected_role_user', pendingLoginData.id);
        console.log('💾 Rol guardado para futuros logins:', selectedRole);
    } else {
        localStorage.removeItem('furia_selected_role');
        localStorage.removeItem('furia_selected_role_user');
        console.log('🗑️ No se guardó la selección de rol');
    }
    
    // Crear el objeto de usuario final con el rol seleccionado
    const finalUserData = {
        ...pendingLoginData,
        selected_role: selectedRole
    };
    
    // Obtener la URL de redirección según el rol seleccionado
    const redirectUrl = ROLE_CONFIG[selectedRole]?.redirect;
    console.log('🔗 URL de redirección:', redirectUrl);
    
    if (!redirectUrl) {
        showToast('Error: No se encontró URL para el rol seleccionado', 'error');
        return;
    }
    
    // Guardar en localStorage
    localStorage.setItem('furia_token', pendingToken);
    localStorage.setItem('furia_user', JSON.stringify(finalUserData));
    
    const roleName = ROLE_CONFIG[selectedRole]?.nombre || selectedRole;
    showToast(`✅ Bienvenido ${finalUserData.nombre} - Accediendo como ${roleName}`, 'success');
    
    // Cerrar el modal
    closeRoleSelectionModal();
    
    // Redirigir después de un pequeño delay
    setTimeout(() => {
        console.log('🚀 Redirigiendo a:', redirectUrl);
        window.location.href = redirectUrl;
    }, 1000);
};

function clearSavedRoleSelection() {
    localStorage.removeItem('furia_selected_role');
    localStorage.removeItem('furia_selected_role_user');
}

// =====================================================
// VERIFICAR SESIÓN GUARDADA
// =====================================================
async function checkSavedSession() {
    const token = localStorage.getItem('furia_token');
    const currentPath = window.location.pathname;
    
    if (!token) return;
    
    // Solo verificar si estamos en login
    if (currentPath === '/' || currentPath === '/login.html') {
        try {
            const response = await fetch(`${API_URL}/verify-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (response.ok && data.valid && data.user) {
                const user = data.user;
                let redirect = null;
                
                // IMPORTANTE: Usar el rol seleccionado si existe
                const savedUser = localStorage.getItem('furia_user');
                if (savedUser) {
                    const userData = JSON.parse(savedUser);
                    if (userData.selected_role && ROLE_CONFIG[userData.selected_role]) {
                        redirect = ROLE_CONFIG[userData.selected_role].redirect;
                        console.log('🔁 Usando rol seleccionado guardado:', userData.selected_role, redirect);
                    }
                }
                
                // Si no hay rol seleccionado, verificar si tiene múltiples roles
                if (!redirect && user.roles) {
                    if (user.roles.length === 1) {
                        // Un solo rol, redirigir automáticamente
                        const singleRole = user.roles[0];
                        if (ROLE_CONFIG[singleRole]) {
                            redirect = ROLE_CONFIG[singleRole].redirect;
                            // Actualizar el usuario guardado con el rol
                            const updatedUser = { ...user, selected_role: singleRole };
                            localStorage.setItem('furia_user', JSON.stringify(updatedUser));
                        }
                    } else if (user.roles.length > 1) {
                        // Múltiples roles - NO redirigir automáticamente, mostrar login
                        console.log('⚠️ Múltiples roles sin selección, mostrando login');
                        // Limpiar token para forzar selección
                        localStorage.removeItem('furia_token');
                        localStorage.removeItem('furia_user');
                        return;
                    }
                }
                
                if (redirect && redirect !== '/' && !window.location.pathname.includes(redirect.replace('/', ''))) {
                    console.log('🔄 Redirigiendo por sesión guardada a:', redirect);
                    window.location.href = redirect;
                }
            } else {
                // Token inválido, limpiar
                localStorage.removeItem('furia_token');
                localStorage.removeItem('furia_user');
                localStorage.removeItem('furia_remembered');
                localStorage.removeItem('furia_remembered_type');
                clearSavedRoleSelection();
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
        if (rememberCheck) rememberCheck.checked = true;
        
        if (rememberedType !== selectedType) {
            const tabBtn = document.querySelector(`.tab-btn[data-type="${rememberedType}"]`);
            if (tabBtn) tabBtn.click();
        }
    }
}

// =====================================================
// RECUPERAR CONTRASEÑA (Funciones básicas)
// =====================================================
function openRecoverModal(e) {
    if (e) e.preventDefault();
    const modal = document.getElementById('recoverModal');
    if (modal) modal.classList.add('show');
}

function closeRecoverModal() {
    const modal = document.getElementById('recoverModal');
    if (modal) modal.classList.remove('show');
}

function goBackToStep1() {
    const step1 = document.getElementById('recoverStep1');
    const step2 = document.getElementById('recoverStep2');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
}

async function sendRecoveryCode() {
    const email = document.getElementById('recoverEmail')?.value.trim();
    const userType = document.getElementById('recoverUserType')?.value;
    
    if (!email) {
        showToast('Ingresa tu correo electrónico', 'warning');
        return;
    }
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/recuperar/solicitar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, tipo: userType })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        recoveryEmail = email;
        recoveryUserType = userType;
        
        showToast('Código enviado a tu correo electrónico', 'success');
        
        const emailDisplay = document.getElementById('recoverEmailDisplay');
        if (emailDisplay) emailDisplay.textContent = email;
        
        const step1 = document.getElementById('recoverStep1');
        const step2 = document.getElementById('recoverStep2');
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

async function verifyAndChangePassword() {
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: recoveryEmail,
                codigo: '123456', // En producción, obtener del input
                nueva_contrasena: newPassword
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        showToast('Contraseña actualizada correctamente', 'success');
        closeRecoverModal();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

// =====================================================
// REGISTRO DE CLIENTE (Funciones básicas)
// =====================================================
function openRegisterModal() {
    const modal = document.getElementById('registerModal');
    if (modal) modal.classList.add('show');
}

function closeRegisterModal() {
    const modal = document.getElementById('registerModal');
    if (modal) modal.classList.remove('show');
}

function openVehicleRegisterModal() {
    const modal = document.getElementById('vehicleRegisterModal');
    if (modal) modal.classList.add('show');
}

function closeVehicleRegisterModal() {
    const modal = document.getElementById('vehicleRegisterModal');
    if (modal) modal.classList.remove('show');
}

async function sendRegisterCode() {
    const nombre = document.getElementById('regNombre')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const telefono = document.getElementById('regTelefono')?.value.trim();
    const direccion = document.getElementById('regDireccion')?.value.trim();
    const password = document.getElementById('regPassword')?.value;
    const confirmPassword = document.getElementById('regConfirmPassword')?.value;
    
    if (!nombre || !email || !telefono || !direccion || !password) {
        showToast('Todos los campos son requeridos', 'warning');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }
    
    setModalLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/registro/solicitar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, telefono, direccion, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        showToast('Código de verificación enviado a tu correo', 'success');
        
        const emailDisplay = document.getElementById('registerEmailDisplay');
        if (emailDisplay) emailDisplay.textContent = email;
        
        const step1 = document.getElementById('registerStep1');
        const step2 = document.getElementById('registerStep2');
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
        
        registerData = { nombre, email, telefono, direccion, password };
        
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: registerData.email, codigo: codigo })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        showToast('Registro completado exitosamente. Ahora puedes iniciar sesión.', 'success');
        closeRegisterModal();
        
        const clientTab = document.querySelector('.tab-btn[data-type="client"]');
        if (clientTab) clientTab.click();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setModalLoading(false);
    }
}

async function registerVehicle() {
    const email = prompt('Para registrar tu vehículo, ingresa tu correo electrónico:');
    const placa = document.getElementById('vehPlaca')?.value.trim().toUpperCase();
    const marca = document.getElementById('vehMarca')?.value.trim();
    const modelo = document.getElementById('vehModelo')?.value.trim();
    const anio = document.getElementById('vehAnio')?.value.trim();
    const color = document.getElementById('vehColor')?.value.trim();
    
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, placa, marca, modelo, anio, color })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        showToast('Vehículo registrado exitosamente', 'success');
        closeVehicleRegisterModal();
        
        const clientTab = document.querySelector('.tab-btn[data-type="client"]');
        if (clientTab) clientTab.click();
        
        if (plateInput) plateInput.value = placa;
        
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
    if (!passwordInput) return;
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
            const container = e.target.closest('.code-inputs');
            const inputs = container ? container.querySelectorAll('.code-digit') : document.querySelectorAll('.code-digit');
            const index = parseInt(e.target.dataset.index);
            
            if (e.target.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('code-digit') && e.key === 'Backspace') {
            const container = e.target.closest('.code-inputs');
            const inputs = container ? container.querySelectorAll('.code-digit') : document.querySelectorAll('.code-digit');
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
        btn.disabled = loading;
        btn.style.opacity = loading ? '0.6' : '1';
        btn.style.cursor = loading ? 'not-allowed' : 'pointer';
    });
}

function showToast(message, type = 'info') {
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => toast.remove(), 4000);
}

// Funciones globales
window.togglePassword = togglePassword;
window.openRecoverModal = openRecoverModal;
window.closeRecoverModal = closeRecoverModal;
window.goBackToStep1 = goBackToStep1;
window.sendRecoveryCode = sendRecoveryCode;
window.verifyAndChangePassword = verifyAndChangePassword;
window.openRegisterModal = openRegisterModal;
window.closeRegisterModal = closeRegisterModal;
window.sendRegisterCode = sendRegisterCode;
window.verifyRegisterCode = verifyRegisterCode;
window.openVehicleRegisterModal = openVehicleRegisterModal;
window.closeVehicleRegisterModal = closeVehicleRegisterModal;
window.registerVehicle = registerVehicle;
window.closeRoleSelectionModal = closeRoleSelectionModal;
window.logout = () => {
    clearSavedRoleSelection();
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};

// Funciones placeholder para compatibilidad
window.resendRecoveryCode = () => showToast('Función en desarrollo', 'info');
window.resendRegisterCode = () => showToast('Función en desarrollo', 'info');

console.log('✅ login.js cargado correctamente');