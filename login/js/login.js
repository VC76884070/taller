// Simulación de consultas a la BD (luego serán llamadas API)
const DB_SIMULATION = {
    // Personal del taller - Tabla Usuario
    staff: [
        {
            email: 'admin@furia.com',
            password: 'admin123',
            id_rol: 1,
            nombre: 'Carlos Rodríguez',
            rol: 'admin_general',
            redirect: '../admin_general/dashboard.html'
        },
        {
            email: 'operativo@furia.com',
            password: 'operativo123',
            id_rol: 2,
            nombre: 'María González',
            rol: 'jefe_operativo',
            redirect: '../jefe_operativo/dashboard.html'
        },
        {
            email: 'taller@furia.com',
            password: 'taller123',
            id_rol: 3,
            nombre: 'Juan Pérez',
            rol: 'jefe_taller',
            redirect: '../jefe_taller/dashboard.html'
        },
        {
            email: 'tecnico1@furia.com',
            password: 'tecnico123',
            id_rol: 4,
            nombre: 'Luis Mamani',
            rol: 'tecnico_mecanico',
            redirect: '../tecnico_mecanico/dashboard.html'
        },
        {
            email: 'repuestos@furia.com',
            password: 'repuestos123',
            id_rol: 5,
            nombre: 'Ana López',
            rol: 'encargado_rep_almacen',
            redirect: '../encargado_rep_almacen/dashboard.html'
        }
    ],
    
    // Clientes con sus vehículos - JOIN Cliente + Vehiculo
    clients: [
        {
            placa: 'ABC123',
            password: 'cliente123', // En BD sería un acceso temporal
            id_cliente: 1,
            nombre: 'Pedro Sánchez',
            vehiculo: {
                marca: 'Toyota',
                modelo: 'Corolla',
                anio: 2020
            },
            redirect: '../cliente/dashboard.html'
        },
        {
            placa: 'XYZ789',
            password: 'cliente123',
            id_cliente: 2,
            nombre: 'Laura Flores',
            vehiculo: {
                marca: 'Honda',
                modelo: 'Civic',
                anio: 2022
            },
            redirect: '../cliente/dashboard.html'
        },
        {
            placa: 'DEF456',
            password: 'cliente123',
            id_cliente: 3,
            nombre: 'Roberto Méndez',
            vehiculo: {
                marca: 'Suzuki',
                modelo: 'Swift',
                anio: 2021
            },
            redirect: '../cliente/dashboard.html'
        }
    ]
};

// Elementos DOM
const tabBtns = document.querySelectorAll('.tab-btn');
const emailGroup = document.getElementById('emailGroup');
const plateGroup = document.getElementById('plateGroup');
const welcomeTitle = document.getElementById('welcomeTitle');
const welcomeSubtitle = document.getElementById('welcomeSubtitle');
const clientQuickAccess = document.getElementById('clientQuickAccess');
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const plateInput = document.getElementById('plate');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const rememberCheck = document.getElementById('remember');
const demoSection = document.querySelector('.demo-section');
const demoContent = document.getElementById('demoContent');
const demoArrow = document.getElementById('demoArrow');
const toastContainer = document.getElementById('toastContainer');

let selectedType = 'staff';

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
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
            toggleLoginFields();
            loadDemoCredentials();
        });
    });

    demoSection?.addEventListener('click', toggleDemoSection);
    loginForm.addEventListener('submit', handleLogin);
    
    window.togglePassword = togglePassword;
    window.quickRegister = quickRegister;
}

function toggleLoginFields() {
    if (selectedType === 'staff') {
        emailGroup.style.display = 'block';
        plateGroup.style.display = 'none';
        welcomeTitle.textContent = 'Acceso Personal Taller';
        welcomeSubtitle.textContent = 'Ingresa con tu correo institucional';
        clientQuickAccess.style.display = 'none';
        
        if (plateInput) plateInput.value = '';
        if (emailInput) emailInput.focus();
    } else {
        emailGroup.style.display = 'none';
        plateGroup.style.display = 'block';
        welcomeTitle.textContent = 'Acceso Cliente';
        welcomeSubtitle.textContent = 'Ingresa con la placa de tu vehículo';
        clientQuickAccess.style.display = 'block';
        
        if (emailInput) emailInput.value = '';
        if (plateInput) plateInput.focus();
    }
}

function loadDemoCredentials() {
    if (!demoContent) return;
    
    let credentials = [];
    
    if (selectedType === 'staff') {
        credentials = DB_SIMULATION.staff.map(user => ({
            identifier: user.email,
            password: user.password,
            name: user.nombre,
            role: user.rol,
            icon: getRoleIcon(user.rol),
            detail: user.email
        }));
    } else {
        credentials = DB_SIMULATION.clients.map(client => ({
            identifier: client.placa,
            password: client.password,
            name: client.nombre,
            vehicle: `${client.vehiculo.marca} ${client.vehiculo.modelo} ${client.vehiculo.anio}`,
            icon: 'fa-car',
            detail: `Placa: ${client.placa}`
        }));
    }

    demoContent.innerHTML = credentials.map(cred => `
        <div class="demo-credential-item" onclick="setCredentials('${cred.identifier}', '${cred.password}')">
            <i class="fas ${cred.icon}"></i>
            <div class="demo-credential-info">
                <strong>${cred.name}</strong>
                <small>${cred.detail}</small>
                ${cred.vehicle ? `<small class="vehicle-info">${cred.vehicle}</small>` : ''}
            </div>
        </div>
    `).join('');
}

function getRoleIcon(role) {
    const icons = {
        'admin_general': 'fa-user-cog',
        'jefe_operativo': 'fa-user-tie',
        'jefe_taller': 'fa-user-gear',
        'tecnico_mecanico': 'fa-user-wrench',
        'encargado_rep_almacen': 'fa-boxes',
        'cliente': 'fa-user'
    };
    return icons[role] || 'fa-user';
}

window.setCredentials = (identifier, password) => {
    if (selectedType === 'staff') {
        if (emailInput) {
            emailInput.value = identifier;
            emailInput.dispatchEvent(new Event('input'));
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
        ? emailInput?.value.trim() 
        : plateInput?.value.trim().toUpperCase();
        
    const password = passwordInput?.value;
    
    // Validaciones
    if (!identifier || !password) {
        showToast('Por favor completa todos los campos', 'warning');
        return;
    }
    
    if (selectedType === 'staff' && !validateEmail(identifier)) {
        showToast('Correo electrónico inválido', 'error');
        return;
    }
    
    if (selectedType === 'client' && !validatePlate(identifier)) {
        showToast('Formato de placa inválido (ej: ABC123)', 'error');
        return;
    }
    
    // Buscar en la "BD" correspondiente
    let user = null;
    
    if (selectedType === 'staff') {
        user = DB_SIMULATION.staff.find(u => u.email === identifier && u.password === password);
    } else {
        user = DB_SIMULATION.clients.find(c => c.placa === identifier && c.password === password);
    }
    
    if (!user) {
        showToast('Credenciales incorrectas', 'error');
        passwordInput.value = '';
        passwordInput.focus();
        return;
    }
    
    // Login exitoso
    setLoadingState(true);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Guardar sesión
    const session = {
        user: {
            identifier: identifier,
            name: user.nombre || user.name,
            role: user.rol || 'cliente',
            type: selectedType,
            ...(selectedType === 'client' && { 
                id_cliente: user.id_cliente,
                vehiculo: user.vehiculo 
            })
        },
        token: generateToken(),
        timestamp: Date.now()
    };
    
    localStorage.setItem('furia_session', JSON.stringify(session));
    
    if (rememberCheck?.checked) {
        localStorage.setItem('furia_remembered', identifier);
        localStorage.setItem('furia_remembered_type', selectedType);
    } else {
        localStorage.removeItem('furia_remembered');
        localStorage.removeItem('furia_remembered_type');
    }
    
    showToast(`¡Bienvenido ${user.nombre || user.name}!`, 'success');
    
    setTimeout(() => {
        if (selectedType === 'staff') {
            const roleMap = {
                'admin_general': '../admin_general/dashboard.html',
                'jefe_operativo': '../jefe_operativo/dashboard.html',
                'jefe_taller': '../jefe_taller/dashboard.html',
                'tecnico_mecanico': '../tecnico_mecanico/dashboard.html',
                'encargado_rep_almacen': '../encargado_rep_almacen/dashboard.html'
            };
            window.location.href = roleMap[user.rol] || '../dashboard.html';
        } else {
            window.location.href = '../cliente/dashboard.html';
        }
    }, 1500);
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePlate(plate) {
    return /^[A-Z0-9]{3,8}$/.test(plate);
}

function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
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
    demoArrow.className = demoSection.classList.contains('expanded') 
        ? 'fas fa-chevron-up' 
        : 'fas fa-chevron-down';
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
    
    if (remembered && rememberedType) {
        if (rememberedType === 'staff' && emailInput) {
            emailInput.value = remembered;
        } else if (rememberedType === 'client' && plateInput) {
            plateInput.value = remembered;
        }
        
        if (rememberCheck) {
            rememberCheck.checked = true;
        }
    }
}

function quickRegister() {
    showToast('Dirígete a recepción para registrar tu vehículo', 'info');
}