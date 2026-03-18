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
const demoSection = document.getElementById('demoSection');
const demoContent = document.getElementById('demoContent');
const demoArrow = document.getElementById('demoArrow');
const toastContainer = document.getElementById('toastContainer');

let selectedType = 'staff';

// Credenciales de prueba para mostrar en el demo
const DEMO_CREDENTIALS = {
    staff: [
        { documento: '1234567', nombre: 'Carlos Rodríguez', rol: 'Admin General', password: 'admin123' },
        { documento: '7654321', nombre: 'María González', rol: 'Jefe Operativo', password: 'admin123' },
        { documento: '9876543', nombre: 'Juan Pérez', rol: 'Jefe Taller', password: 'admin123' },
        { documento: '1357924', nombre: 'Luis Mamani', rol: 'Técnico', password: 'admin123' },
        { documento: '2468135', nombre: 'Ana López', rol: 'Enc. Repuestos', password: 'admin123' }
    ],
    client: [
        { placa: 'ABC123', nombre: 'Pedro Sánchez', vehiculo: 'Toyota Corolla 2020', password: 'cliente123' },
        { placa: 'XYZ789', nombre: 'Laura Flores', vehiculo: 'Honda Civic 2022', password: 'cliente123' },
        { placa: 'DEF456', nombre: 'Roberto Méndez', vehiculo: 'Suzuki Swift 2021', password: 'cliente123' }
    ]
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    loadDemoCredentials();
    setupEventListeners();
    checkSavedSession();
}

function setupEventListeners() {
    // Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
            toggleLoginFields();
            loadDemoCredentials();
        });
    });

    // Demo section toggle
    if (demoSection) {
        demoSection.addEventListener('click', toggleDemoSection);
    }

    // Login form
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Restringir solo números para documento
    if (documentInput) {
        documentInput.addEventListener('keypress', (e) => {
            if (!/^\d$/.test(e.key)) {
                e.preventDefault();
            }
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
        welcomeSubtitle.textContent = 'Ingresa con tu número de documento';
        clientQuickAccess.style.display = 'none';
        
        if (plateInput) plateInput.value = '';
        if (documentInput) {
            documentInput.focus();
            documentInput.removeAttribute('readonly');
        }
    } else {
        documentGroup.style.display = 'none';
        plateGroup.style.display = 'block';
        welcomeTitle.textContent = 'Acceso Cliente';
        welcomeSubtitle.textContent = 'Ingresa con la placa de tu vehículo';
        clientQuickAccess.style.display = 'block';
        
        if (documentInput) documentInput.value = '';
        if (plateInput) {
            plateInput.focus();
            plateInput.removeAttribute('readonly');
        }
    }
}

function loadDemoCredentials() {
    if (!demoContent) return;
    
    let credentials = [];
    
    if (selectedType === 'staff') {
        credentials = DEMO_CREDENTIALS.staff;
        demoContent.innerHTML = credentials.map(cred => `
            <div class="demo-credential-item" onclick="setCredentials('${cred.documento}', '${cred.password}', 'staff')">
                <i class="fas fa-id-card"></i>
                <div class="demo-credential-info">
                    <strong>${cred.nombre}</strong>
                    <small>${cred.rol}</small>
                    <small class="documento">Doc: ${cred.documento}</small>
                </div>
            </div>
        `).join('');
    } else {
        credentials = DEMO_CREDENTIALS.client;
        demoContent.innerHTML = credentials.map(cred => `
            <div class="demo-credential-item" onclick="setCredentials('${cred.placa}', '${cred.password}', 'client')">
                <i class="fas fa-car"></i>
                <div class="demo-credential-info">
                    <strong>${cred.nombre}</strong>
                    <small>${cred.vehiculo}</small>
                    <small class="placa">Placa: ${cred.placa}</small>
                </div>
            </div>
        `).join('');
    }
}

window.setCredentials = (identifier, password, type) => {
    if (type === 'staff') {
        if (documentInput) {
            documentInput.value = identifier;
            documentInput.dispatchEvent(new Event('input'));
        }
    } else {
        if (plateInput) {
            plateInput.value = identifier;
            plateInput.dispatchEvent(new Event('input'));
        }
    }
    
    if (passwordInput) {
        passwordInput.value = password;
    }
    
    showToast('Credenciales cargadas', 'success');
};

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
    
    if (selectedType === 'staff' && !/^\d+$/.test(identifier)) {
        showToast('El número de documento debe contener solo dígitos', 'error');
        documentInput.focus();
        return;
    }
    
    if (selectedType === 'client' && !/^[A-Z0-9]{3,8}$/.test(identifier)) {
        showToast('Formato de placa inválido (ej: ABC123)', 'error');
        plateInput.focus();
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
            // Guardar token y usuario
            localStorage.setItem('furia_token', data.token);
            localStorage.setItem('furia_user', JSON.stringify(data.user));
            
            if (rememberCheck?.checked) {
                localStorage.setItem('furia_remembered', identifier);
                localStorage.setItem('furia_remembered_type', selectedType);
            }
            
            showToast(`¡Bienvenido ${data.user.nombre}!`, 'success');
            
            // Redirigir
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
    }, 3000);
}

function toggleDemoSection() {
    demoSection.classList.toggle('expanded');
    if (demoSection.classList.contains('expanded')) {
        demoArrow.className = 'fas fa-chevron-up';
    } else {
        demoArrow.className = 'fas fa-chevron-down';
    }
}

function togglePassword() {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    document.getElementById('toggleIcon').className = 
        type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

function checkSavedSession() {
    const remembered = localStorage.getItem('furia_remembered');
    const rememberedType = localStorage.getItem('furia_remembered_type');
    const token = localStorage.getItem('furia_token');
    
    // Si hay token y estamos en login, verificar si es válido
    if (token && window.location.pathname === '/') {
        verifyToken().then(user => {
            if (user) {
                // Redirigir según rol
                const redirects = {
                    'admin_general': '/admin_general/dashboard.html',
                    'jefe_operativo': '/jefe_operativo/dashboard.html',
                    'jefe_taller': '/jefe_taller/dashboard.html',
                    'tecnico_mecanico': '/tecnico_mecanico/dashboard.html',
                    'encargado_rep_almacen': '/encargado_rep_almacen/dashboard.html',
                    'cliente': '/cliente/dashboard.html'
                };
                window.location.href = redirects[user.rol] || '/';
            }
        });
    }
    
    // Cargar credenciales recordadas
    if (remembered && rememberedType) {
        if (rememberedType === 'staff' && documentInput) {
            documentInput.value = remembered;
        } else if (rememberedType === 'client' && plateInput) {
            plateInput.value = remembered;
        }
        
        if (rememberCheck) {
            rememberCheck.checked = true;
        }
    }
}

async function verifyToken() {
    const token = localStorage.getItem('furia_token');
    
    if (!token) return null;
    
    try {
        const response = await fetch(`${API_URL}/verify-token`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            return null;
        }
        
        return data.user;
        
    } catch (error) {
        console.error('Error verificando token:', error);
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        return null;
    }
}

function quickRegister() {
    showToast('Dirígete a recepción del taller para registrar tu vehículo', 'info');
}

// Logout function (para usar en dashboards)
window.logout = () => {
    showToast('Cerrando sesión...', 'info');
    
    setTimeout(() => {
        localStorage.removeItem('furia_token');
        localStorage.removeItem('furia_user');
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
        window.location.href = '/';
    }, 1000);
};

// Proteger rutas (para usar en dashboards)
window.checkAuth = (allowedRoles = []) => {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token) {
        window.location.href = '/';
        return false;
    }
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.rol)) {
        window.location.href = '/';
        return false;
    }
    
    return user;
};