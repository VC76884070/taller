// =====================================================
// LOGIN - FURIA MOTOR COMPANY - VERSIÓN COMPLETA CORREGIDA
// =====================================================

const API_URL = 'http://localhost:5000/api';

const ROLE_CONFIG = {
    'jefe_taller': {
        nombre: 'Jefe de Taller',
        icono: 'fa-user-tie',
        redirect: '/jefe_taller/dashboard.html',
        descripcion: 'Gestión de órdenes, diagnóstico y control de calidad'
    },
    'jefe_operativo': {
        nombre: 'Jefe Operativo',
        icono: 'fa-chart-line',
        redirect: '/jefe_operativo/dashboard.html',
        descripcion: 'Recepción de vehículos y gestión de clientes'
    },
    'tecnico': {
        nombre: 'Técnico Mecánico',
        icono: 'fa-wrench',
        redirect: '/tecnico_mecanico/misvehiculos.html',
        descripcion: 'Diagnóstico y reparación de vehículos'
    },
    'tecnico_mecanico': {
        nombre: 'Técnico Mecánico',
        icono: 'fa-wrench',
        redirect: '/tecnico_mecanico/misvehiculos.html',
        descripcion: 'Diagnóstico y reparación de vehículos'
    },
    'encargado_repuestos': {
        nombre: 'Encargado de Repuestos',
        icono: 'fa-boxes',
        redirect: '/encargado_rep_almacen/dashboard.html',
        descripcion: 'Gestión de inventario y cotizaciones'
    },
    'cliente': {
        nombre: 'Cliente',
        icono: 'fa-user',
        redirect: '/cliente/misvehiculos.html',
        descripcion: 'Seguimiento de tus vehículos'
    }
};

// Función para normalizar roles
function normalizarRol(rol) {
    if (!rol) return null;
    const rolLower = rol.toLowerCase();
    if (rolLower === 'tecnico_mecanico') return 'tecnico';
    if (rolLower === 'tecnico') return 'tecnico';
    return rolLower;
}

// Elementos DOM
const tabBtns = document.querySelectorAll('.tab-btn');
const documentGroup = document.getElementById('documentGroup');
const plateGroup = document.getElementById('plateGroup');
const welcomeTitle = document.getElementById('welcomeTitle');
const welcomeSubtitle = document.getElementById('welcomeSubtitle');
const personalRegisterLink = document.getElementById('personalRegisterLink');
const clientInfoMessage = document.getElementById('clientInfoMessage');
const loginForm = document.getElementById('loginForm');
const documentInput = document.getElementById('document');
const plateInput = document.getElementById('plate');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const rememberCheck = document.getElementById('remember');
const toastContainer = document.getElementById('toastContainer');

let selectedType = 'staff';
let pendingLoginData = null;
let pendingToken = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando login');
    setupEventListeners();
    checkSavedSession();
});

function setupEventListeners() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
            toggleLoginFields();
        });
    });

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

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
        welcomeSubtitle.textContent = 'Ingresa con tu número de documento';
        personalRegisterLink.style.display = 'block';
        if (clientInfoMessage) clientInfoMessage.style.display = 'none';
        if (documentInput) documentInput.focus();
    } else {
        documentGroup.style.display = 'none';
        plateGroup.style.display = 'block';
        welcomeTitle.textContent = 'Acceso Cliente';
        welcomeSubtitle.textContent = 'Ingresa con tu número de placa';
        personalRegisterLink.style.display = 'none';
        if (clientInfoMessage) clientInfoMessage.style.display = 'block';
        if (plateInput) plateInput.focus();
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
    
    if (!identifier || !password) {
        showToast('Completa todos los campos', 'warning');
        return;
    }
    
    setLoadingState(true);
    
    console.log('🔐 === INICIANDO LOGIN ===');
    console.log('Tipo:', selectedType);
    console.log('Identificador:', identifier);
    
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
        
        console.log('📦 Respuesta del servidor:', data);
        
        if (!response.ok) {
            throw new Error(data.error || 'Error en el login');
        }
        
        if (data.success && data.user) {
            console.log('🔐 === DATOS DEL LOGIN ===');
            console.log('Token recibido:', data.token.substring(0, 50) + '...');
            console.log('Usuario:', data.user);
            console.log('Roles originales del servidor:', data.user.roles);
            
            // Normalizar roles del usuario
            let userRoles = data.user.roles || [];
            userRoles = userRoles.map(r => normalizarRol(r));
            
            console.log('Roles normalizados en frontend:', userRoles);
            
            const isMultiRole = userRoles.length > 1;
            
            const savedRole = localStorage.getItem('furia_selected_role');
            const savedUserId = localStorage.getItem('furia_selected_role_user');
            const hasSavedRole = savedRole && savedUserId == data.user.id && userRoles.includes(savedRole);
            
            console.log('¿Múltiples roles?', isMultiRole);
            console.log('Rol guardado:', savedRole);
            console.log('¿Tiene rol guardado?', hasSavedRole);
            
            if (isMultiRole && !hasSavedRole) {
                console.log('🎯 Mostrando modal de selección de roles');
                pendingLoginData = { ...data.user, roles: userRoles };
                pendingToken = data.token;
                showRoleModal();
                setLoadingState(false);
                return;
            }
            
            let redirectUrl = null;
            let selectedRole = null;
            
            if (hasSavedRole) {
                selectedRole = savedRole;
                redirectUrl = ROLE_CONFIG[savedRole]?.redirect;
                console.log('Usando rol guardado:', selectedRole);
            } else if (userRoles.length === 1) {
                selectedRole = userRoles[0];
                redirectUrl = ROLE_CONFIG[selectedRole]?.redirect;
                console.log('Usando único rol:', selectedRole);
            } else {
                selectedRole = userRoles[0];
                redirectUrl = ROLE_CONFIG[selectedRole]?.redirect;
                console.log('Usando primer rol (múltiples):', selectedRole);
            }
            
            if (!redirectUrl && selectedType === 'client') {
                redirectUrl = '/cliente/misvehiculos.html';
                selectedRole = 'cliente';
            }
            
            if (!redirectUrl) {
                throw new Error('No se pudo determinar la redirección');
            }
            
            console.log('🔄 Redirigiendo a:', redirectUrl);
            console.log('🔐 ====================');
            
            const finalUser = { ...data.user, roles: userRoles, selected_role: selectedRole };
            localStorage.setItem('furia_token', data.token);
            localStorage.setItem('furia_user', JSON.stringify(finalUser));
            
            if (rememberCheck?.checked) {
                localStorage.setItem('furia_remembered', identifier);
                localStorage.setItem('furia_remembered_type', selectedType);
            } else {
                localStorage.removeItem('furia_remembered');
                localStorage.removeItem('furia_remembered_type');
            }
            
            showToast(`Bienvenido ${data.user.nombre}`, 'success');
            setTimeout(() => {
                window.location.href = redirectUrl;
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        showToast(error.message, 'error');
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
// MODAL DE SELECCIÓN DE ROL (CORREGIDO)
// =====================================================
function showRoleModal() {
    const modal = document.getElementById('roleSelectionModal');
    const rolesGrid = document.getElementById('rolesGrid');
    const userNameSpan = document.getElementById('roleUserName');
    
    if (!modal || !pendingLoginData) return;
    
    if (userNameSpan) {
        userNameSpan.textContent = pendingLoginData.nombre || 'Usuario';
    }
    
    const userRoles = pendingLoginData.roles || [];
    const availableRoles = userRoles.filter(rol => ROLE_CONFIG[rol] || ROLE_CONFIG['tecnico']);
    
    if (availableRoles.length === 0) return;
    
    if (rolesGrid) {
        rolesGrid.innerHTML = availableRoles.map(rol => {
            const config = ROLE_CONFIG[rol] || ROLE_CONFIG['tecnico'];
            return `
                <div class="role-card" data-role="${rol}" onclick="selectRoleHandler('${rol}')">
                    <div class="role-icon">
                        <i class="fas ${config.icono}"></i>
                    </div>
                    <div class="role-name">${config.nombre}</div>
                    <div class="role-description">${config.descripcion}</div>
                </div>
            `;
        }).join('');
    }
    
    modal.style.display = 'flex';
    modal.classList.add('show');
}

function closeRoleModal() {
    const modal = document.getElementById('roleSelectionModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    pendingLoginData = null;
    pendingToken = null;
}

window.selectRoleHandler = function(selectedRole) {
    console.log('🎯 === SELECCIÓN DE ROL ===');
    console.log('Rol seleccionado:', selectedRole);
    console.log('Datos pendientes:', pendingLoginData);
    
    if (!pendingLoginData || !pendingToken) {
        showToast('Error: No hay datos de sesión', 'error');
        closeRoleModal();
        return;
    }
    
    // Normalizar el rol seleccionado
    let rolNormalizado = normalizarRol(selectedRole);
    console.log('Rol normalizado:', rolNormalizado);
    
    // Verificar roles normalizados
    const rolesNormalizados = pendingLoginData.roles.map(r => normalizarRol(r));
    console.log('Roles disponibles normalizados:', rolesNormalizados);
    
    if (!rolesNormalizados.includes(rolNormalizado)) {
        console.error('❌ Rol no permitido');
        showToast('No tienes permiso para este rol', 'error');
        return;
    }
    
    const rememberChoice = document.getElementById('rememberRoleChoice')?.checked || false;
    console.log('Recordar elección:', rememberChoice);
    
    if (rememberChoice) {
        localStorage.setItem('furia_selected_role', rolNormalizado);
        localStorage.setItem('furia_selected_role_user', pendingLoginData.id);
        console.log('✅ Rol guardado en localStorage:', rolNormalizado);
    }
    
    const roleConfig = ROLE_CONFIG[rolNormalizado] || ROLE_CONFIG['tecnico'];
    const redirectUrl = roleConfig?.redirect;
    
    console.log('Configuración del rol:', roleConfig);
    console.log('URL de redirección:', redirectUrl);
    
    if (!redirectUrl) {
        showToast('Error: URL de redirección no encontrada', 'error');
        return;
    }
    
    const finalUser = { ...pendingLoginData, selected_role: rolNormalizado };
    localStorage.setItem('furia_token', pendingToken);
    localStorage.setItem('furia_user', JSON.stringify(finalUser));
    
    console.log('✅ Usuario guardado:', finalUser);
    console.log('🎯 ====================');
    
    showToast(`Accediendo como ${roleConfig.nombre}`, 'success');
    closeRoleModal();
    
    setTimeout(() => {
        window.location.href = redirectUrl;
    }, 500);
};

// =====================================================
// VERIFICAR SESIÓN GUARDADA - CORREGIDA (EVITA BUCLE)
// =====================================================
async function checkSavedSession() {
    const token = localStorage.getItem('furia_token');
    const currentPath = window.location.pathname;
    
    console.log('🔍 checkSavedSession - Path actual:', currentPath);
    console.log('🔍 checkSavedSession - Token existe:', !!token);
    
    if (!token) return;
    
    // SI YA ESTAMOS EN UNA PÁGINA DEL SISTEMA, NO REDIRIGIR
    const isInSystemPage = currentPath.includes('/jefe_operativo/') ||
                          currentPath.includes('/jefe_taller/') ||
                          currentPath.includes('/tecnico_mecanico/') ||
                          currentPath.includes('/encargado_rep_almacen/') ||
                          currentPath.includes('/cliente/');
    
    if (isInSystemPage) {
        console.log('✅ Ya estamos en una página del sistema, no redirigir');
        return;
    }
    
    // SOLO REDIRIGIR SI ESTAMOS EN LA PÁGINA DE LOGIN
    if (currentPath === '/' || currentPath === '/login.html' || currentPath === '') {
        try {
            const response = await fetch(`${API_URL}/verify-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (response.ok && data.valid && data.user) {
                const user = data.user;
                let redirect = null;
                
                // Normalizar roles del usuario
                if (user.roles) {
                    user.roles = user.roles.map(r => normalizarRol(r));
                }
                
                const savedUser = localStorage.getItem('furia_user');
                if (savedUser) {
                    const userData = JSON.parse(savedUser);
                    if (userData.selected_role && ROLE_CONFIG[userData.selected_role]) {
                        redirect = ROLE_CONFIG[userData.selected_role]?.redirect;
                    }
                }
                
                if (!redirect && user.roles && user.roles.length === 1) {
                    redirect = ROLE_CONFIG[user.roles[0]]?.redirect;
                }
                
                if (!redirect && user.type === 'client') {
                    redirect = '/cliente/misvehiculos.html';
                }
                
                if (redirect && redirect !== '/') {
                    console.log('🔄 Redirigiendo a:', redirect);
                    window.location.href = redirect;
                }
            } else {
                console.log('❌ Token inválido, limpiando localStorage');
                localStorage.clear();
            }
        } catch (error) {
            console.error('Error en checkSavedSession:', error);
        }
    }
    
    // Recordar credenciales
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
// UTILIDADES
// =====================================================
function togglePassword() {
    if (!passwordInput) return;
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    const icon = document.getElementById('toggleIcon');
    if (icon) icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
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

// =====================================================
// REDIRECCIONES EXTERNAS
// =====================================================
function goToRegister() {
    window.location.href = '/registro-personal.html';
}

function goToRecover() {
    window.location.href = '/recuperar-contrasena.html';
}

// =====================================================
// LOGOUT
// =====================================================
window.logout = () => {
    localStorage.clear();
    window.location.href = '/';
};

console.log('✅ login.js cargado correctamente');