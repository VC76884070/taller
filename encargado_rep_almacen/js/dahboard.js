// =====================================================
// DASHBOARD ENCARGADO DE REPUESTOS - CORREGIDO PARA MULTI-ROL
// FURIA MOTOR COMPANY SRL
// =====================================================

// Configuración
const API_URL = 'http://localhost:5000/api';

// Configuración de roles para redirección
const ROLE_CONFIG = {
    'jefe_operativo': {
        redirect: '/jefe_operativo/dashboard.html'
    },
    'jefe_taller': {
        redirect: '/jefe_taller/dashboard.html'
    },
    'tecnico': {
        redirect: '/tecnico_mecanico/misvehiculos.html'
    },
    'encargado_repuestos': {
        redirect: '/encargado_rep_almacen/dashboard.html'
    },
    'encargado_rep_almacen': {
        redirect: '/encargado_rep_almacen/dashboard.html'
    }
};

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const totalRepuestos = document.getElementById('totalRepuestos');
const stockBajo = document.getElementById('stockBajo');
const comprasMes = document.getElementById('comprasMes');
const proveedoresActivos = document.getElementById('proveedoresActivos');
const alertasList = document.getElementById('alertasList');
const comprasList = document.getElementById('comprasList');
const criticosList = document.getElementById('criticosList');
const alertasCount = document.getElementById('alertasCount');
const criticosCount = document.getElementById('criticosCount');

// Variables de estado
let usuarioActual = null;
let rolesUsuario = [];
let token = null;

// Variables para gráficos
let categoriasChart = null;

// =====================================================
// VERIFICAR AUTENTICACIÓN - CORREGIDO PARA MULTI-ROL
// =====================================================
async function checkAuth() {
    token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        console.log('❌ No hay token, redirigiendo a login');
        window.location.href = '/';
        return false;
    }
    
    try {
        // Obtener usuario del localStorage
        if (userData) {
            usuarioActual = JSON.parse(userData);
            rolesUsuario = usuarioActual.roles || [];
        }
        
        // Decodificar token para verificar roles
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.user) {
            usuarioActual = { ...usuarioActual, ...payload.user };
            if (payload.user.roles) {
                rolesUsuario = payload.user.roles;
            }
        }
        
        // Obtener rol seleccionado
        const selectedRole = usuarioActual?.selected_role;
        
        console.log('📋 Roles del usuario:', rolesUsuario);
        console.log('🎯 Rol seleccionado:', selectedRole);
        
        // Roles válidos para encargado de repuestos
        const rolesValidos = ['encargado_repuestos', 'encargado_rep_almacen'];
        const tieneRolRepuestos = rolesUsuario.some(r => rolesValidos.includes(r));
        
        if (!tieneRolRepuestos) {
            console.warn('❌ Usuario no tiene permiso de Encargado de Repuestos');
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            
            // Redirigir según el rol que tenga
            if (rolesUsuario.includes('jefe_operativo')) {
                window.location.href = '/jefe_operativo/dashboard.html';
            } else if (rolesUsuario.includes('jefe_taller')) {
                window.location.href = '/jefe_taller/dashboard.html';
            } else if (rolesUsuario.includes('tecnico')) {
                window.location.href = '/tecnico_mecanico/misvehiculos.html';
            } else {
                window.location.href = '/';
            }
            return false;
        }
        
        // Si el usuario seleccionó otro rol diferente a repuestos, redirigir
        if (selectedRole && selectedRole !== 'encargado_repuestos' && selectedRole !== 'encargado_rep_almacen') {
            if (ROLE_CONFIG[selectedRole]) {
                console.log(`🔄 Usuario seleccionó ${selectedRole}, redirigiendo...`);
                window.location.href = ROLE_CONFIG[selectedRole].redirect;
                return false;
            }
        }
        
        // Verificar token con el backend
        const response = await fetch(`${API_URL}/verify-token`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
            console.log('❌ Token inválido, redirigiendo a login');
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        console.log('✅ Autenticación correcta para Encargado de Repuestos');
        
        // Actualizar localStorage con datos actualizados
        if (usuarioActual) {
            localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/';
        return false;
    }
}

// Mostrar indicador de roles múltiples
function mostrarIndicadorRoles() {
    const headerUserInfo = document.querySelector('.user-info');
    if (headerUserInfo && rolesUsuario && rolesUsuario.length > 1) {
        if (headerUserInfo.querySelector('.roles-badge')) return;
        
        const rolesBadge = document.createElement('div');
        rolesBadge.className = 'roles-badge';
        rolesBadge.style.cssText = `
            font-size: 0.7rem;
            background: var(--gris-200);
            padding: 0.2rem 0.5rem;
            border-radius: 12px;
            margin-top: 0.25rem;
            display: inline-block;
            color: var(--blanco);
            cursor: pointer;
        `;
        
        const nombresRoles = rolesUsuario.map(r => {
            const nombres = {
                'jefe_taller': 'Jefe Taller',
                'jefe_operativo': 'Jefe Operativo',
                'tecnico': 'Técnico',
                'encargado_repuestos': 'Repuestos',
                'encargado_rep_almacen': 'Repuestos'
            };
            return nombres[r] || r;
        }).join(' • ');
        
        rolesBadge.innerHTML = `<i class="fas fa-exchange-alt" style="margin-right: 0.3rem;"></i>${nombresRoles}`;
        rolesBadge.title = 'Tienes múltiples roles. Cierra sesión para cambiar de rol.';
        
        headerUserInfo.appendChild(rolesBadge);
    }
}

// Mostrar nombre de usuario
function mostrarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan && usuarioActual) {
        userNameSpan.textContent = usuarioActual.nombre || usuarioActual.email || 'Usuario';
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando dashboard Encargado de Repuestos');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    mostrarNombreUsuario();
    mostrarIndicadorRoles();
    await loadDashboardData();
    setupEventListeners();
});

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
    // Botón de refrescar
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadDashboardData());
    }
}

// =====================================================
// CARGAR DATOS
// =====================================================
async function loadDashboardData() {
    try {
        mostrarLoading(true);
        
        // Intentar cargar datos reales desde la API
        const response = await fetch(`${API_URL}/encargado-repuestos/dashboard`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        let data;
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                data = result.data;
            } else {
                throw new Error(result.error || 'Error al cargar datos');
            }
        } else {
            // Si la API no está disponible, usar datos de ejemplo
            console.log('Usando datos de ejemplo para demostración');
            data = generarDatosEjemplo();
        }
        
        actualizarKPIs(data);
        renderizarAlertas(data.alertas || []);
        renderizarCompras(data.compras || []);
        renderizarCriticos(data.criticos || []);
        if (data.categorias) {
            renderizarGrafico(data.categorias);
        }
        
        // Actualizar badge de stock bajo en sidebar
        const stockBajoCount = (data.alertas || []).length;
        localStorage.setItem('stock_bajo_count', stockBajoCount.toString());
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        mostrarNotificacion('Error al cargar datos del dashboard', 'error');
        
        // Usar datos de ejemplo como fallback
        const data = generarDatosEjemplo();
        actualizarKPIs(data);
        renderizarAlertas(data.alertas);
        renderizarCompras(data.compras);
        renderizarCriticos(data.criticos);
        renderizarGrafico(data.categorias);
    } finally {
        mostrarLoading(false);
    }
}

// Mostrar/ocultar loading
function mostrarLoading(mostrar) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = mostrar ? 'flex' : 'none';
    }
}

// Generar datos de ejemplo
function generarDatosEjemplo() {
    return {
        kpis: {
            totalRepuestos: 1284,
            stockBajo: 23,
            comprasMes: 12450,
            proveedoresActivos: 8
        },
        alertas: [
            {
                id: 1,
                titulo: 'Filtros de aceite',
                descripcion: 'Stock crítico - Solo 2 unidades',
                cantidad: 2,
                unidad: 'uds'
            },
            {
                id: 2,
                titulo: 'Pastillas de freno delanteras',
                descripcion: 'Stock bajo - 5 unidades',
                cantidad: 5,
                unidad: 'uds'
            },
            {
                id: 3,
                titulo: 'Bujías NGK',
                descripcion: 'Agotándose rápidamente - 8 unidades',
                cantidad: 8,
                unidad: 'uds'
            }
        ],
        compras: [
            {
                id: 1,
                proveedor: 'Autorepuestos López',
                fecha: 'Hoy',
                items: 12,
                monto: 2450
            },
            {
                id: 2,
                proveedor: 'Distribuidora Gómez',
                fecha: 'Ayer',
                items: 8,
                monto: 1890
            },
            {
                id: 3,
                proveedor: 'Importadora Vargas',
                fecha: 'Hace 2 días',
                items: 15,
                monto: 3200
            }
        ],
        criticos: [
            {
                id: 1,
                nombre: 'Filtro de aceite',
                codigo: 'FA-001',
                stock: 2,
                minimo: 10
            },
            {
                id: 2,
                nombre: 'Pastilla freno delantera',
                codigo: 'PF-023',
                stock: 4,
                minimo: 15
            },
            {
                id: 3,
                nombre: 'Bujía NGK',
                codigo: 'BJ-112',
                stock: 5,
                minimo: 20
            },
            {
                id: 4,
                nombre: 'Correa de distribución',
                codigo: 'CD-045',
                stock: 1,
                minimo: 8
            },
            {
                id: 5,
                nombre: 'Amortiguador delantero',
                codigo: 'AD-078',
                stock: 3,
                minimo: 12
            }
        ],
        categorias: {
            labels: ['Filtros', 'Frenos', 'Motor', 'Eléctrico', 'Suspensión', 'Transmisión'],
            data: [320, 280, 240, 180, 150, 114]
        }
    };
}

// Actualizar KPIs
function actualizarKPIs(data) {
    if (totalRepuestos) totalRepuestos.textContent = (data.kpis.totalRepuestos || 0).toLocaleString();
    if (stockBajo) stockBajo.textContent = data.kpis.stockBajo || 0;
    if (comprasMes) comprasMes.textContent = `Bs. ${(data.kpis.comprasMes || 0).toLocaleString()}`;
    if (proveedoresActivos) proveedoresActivos.textContent = data.kpis.proveedoresActivos || 0;
}

// Renderizar alertas
function renderizarAlertas(alertas) {
    if (alertasCount) alertasCount.textContent = alertas.length;
    
    if (!alertasList) return;
    
    if (alertas.length === 0) {
        alertasList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--gris-texto);">
                <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>No hay alertas de stock bajo</p>
            </div>
        `;
        return;
    }
    
    alertasList.innerHTML = alertas.map(alerta => `
        <div class="alerta-item">
            <div class="alerta-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="alerta-content">
                <div class="alerta-titulo">${escapeHtml(alerta.titulo)}</div>
                <div class="alerta-desc">${escapeHtml(alerta.descripcion)}</div>
            </div>
            <div class="alerta-meta">
                <div class="alerta-cantidad">${alerta.cantidad}</div>
                <div class="alerta-unidad">${alerta.unidad || 'uds'}</div>
            </div>
        </div>
    `).join('');
}

// Renderizar compras recientes
function renderizarCompras(compras) {
    if (!comprasList) return;
    
    if (compras.length === 0) {
        comprasList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--gris-texto);">
                <i class="fas fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>No hay compras recientes</p>
            </div>
        `;
        return;
    }
    
    comprasList.innerHTML = compras.map(compra => `
        <div class="compra-item">
            <div class="compra-icon">
                <i class="fas fa-receipt"></i>
            </div>
            <div class="compra-content">
                <div class="compra-proveedor">${escapeHtml(compra.proveedor)}</div>
                <div class="compra-info">
                    <span><i class="far fa-clock"></i> ${compra.fecha}</span>
                    <span><i class="fas fa-boxes"></i> ${compra.items} items</span>
                </div>
            </div>
            <div class="compra-monto">Bs. ${(compra.monto || 0).toLocaleString()}</div>
        </div>
    `).join('');
}

// Renderizar repuestos críticos
function renderizarCriticos(criticos) {
    if (criticosCount) criticosCount.textContent = criticos.length;
    
    if (!criticosList) return;
    
    if (criticos.length === 0) {
        criticosList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--gris-texto);">
                <i class="fas fa-check" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>No hay repuestos críticos</p>
            </div>
        `;
        return;
    }
    
    criticosList.innerHTML = criticos.map(critico => `
        <div class="critico-item">
            <div class="critico-info">
                <h4>${escapeHtml(critico.nombre)}</h4>
                <p>${escapeHtml(critico.codigo)} | Mínimo: ${critico.minimo}</p>
            </div>
            <div class="critico-stock ${critico.stock <= (critico.minimo / 2) ? 'critico' : 'bajo'}">
                <span>${critico.stock}</span>
                <small>uds</small>
            </div>
        </div>
    `).join('');
}

// Renderizar gráfico circular
function renderizarGrafico(categorias) {
    const canvas = document.getElementById('categoriasChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const colores = ['#C1121F', '#2C3E50', '#1E3A5F', '#10B981', '#F59E0B', '#6B7280'];
    
    if (categoriasChart) {
        categoriasChart.destroy();
    }
    
    categoriasChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categorias.labels,
            datasets: [{
                data: categorias.data,
                backgroundColor: colores.slice(0, categorias.labels.length),
                borderWidth: 0,
                borderRadius: 4,
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        font: {
                            size: 11,
                            family: 'Plus Jakarta Sans'
                        },
                        color: '#8E8E93'
                    }
                },
                tooltip: {
                    backgroundColor: '#1C1C1E',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${context.raw} unidades (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Escapar HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
            display: flex;
            flex-direction: column;
            gap: 10px;
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
        background: var(--bg-card);
        color: var(--blanco);
        padding: 0.75rem 1.25rem;
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#1E3A5F'};
        animation: slideIn 0.3s ease;
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =====================================================
// LOGOUT - CORREGIDO
// =====================================================
window.logout = () => {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    localStorage.removeItem('furia_selected_role');
    localStorage.removeItem('furia_selected_role_user');
    localStorage.removeItem('stock_bajo_count');
    window.location.href = '/';
};

// Funciones globales
window.recargarDatos = () => loadDashboardData();

console.log('✅ dashboard.js de Encargado de Repuestos cargado correctamente');