// =====================================================
// DASHBOARD ENCARGADO DE REPUESTOS - VERSIÓN SIMPLIFICADA
// SOLO FUNCIONES DEL DASHBOARD (sin tabs)
// VERSIÓN CORREGIDA - USA DIRECTAMENTE window.API_BASE_URL
// =====================================================

// =====================================================
// NOTA: API_BASE_URL ya está definida globalmente por include.js
// como window.API_BASE_URL. NO redeclarar como const aquí.
// =====================================================

// Verificar si existe la variable global, si no, crearla (solo por si acaso)
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 dashboard.js (Repuestos) - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 dashboard.js (Repuestos) - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

// Elementos DOM
const currentDateSpan = document.getElementById('currentDate');
const totalRepuestos = document.getElementById('totalRepuestos');
const stockBajo = document.getElementById('stockBajo');
const comprasMes = document.getElementById('comprasMes');
const proveedoresActivos = document.getElementById('proveedoresActivos');
const alertasList = document.getElementById('alertasList');
const comprasList = document.getElementById('comprasList');
const criticosList = document.getElementById('criticosList');

// Variables
let usuarioActual = null;
let token = null;
let inventoryChart = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Dashboard Repuestos');
    console.log('📡 window.API_BASE_URL:', window.API_BASE_URL);
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    await loadDashboardData();
    setupEventListeners();
});

// Verificar autenticación
async function checkAuth() {
    token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
    
    try {
        if (userData) {
            usuarioActual = JSON.parse(userData);
        }
        
        // Verificar rol
        const roles = usuarioActual?.roles || [];
        const tieneRol = roles.some(r => r === 'encargado_repuestos' || r === 'encargado_rep_almacen');
        
        if (!tieneRol) {
            console.warn('❌ Usuario no tiene permisos');
            window.location.href = window.API_BASE_URL + '/';
            return false;
        }
        
        // Mostrar nombre
        const userNameSpan = document.getElementById('userName');
        if (userNameSpan && usuarioActual) {
            userNameSpan.textContent = usuarioActual.nombre || 'Encargado Repuestos';
        }
        
        return true;
        
    } catch (error) {
        console.error('Error:', error);
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    if (currentDateSpan) {
        currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDashboardData();
            mostrarNotificacion('Datos actualizados', 'success');
        });
    }
}

// =====================================================
// CARGAR DATOS DEL DASHBOARD
// =====================================================
async function loadDashboardData() {
    try {
        mostrarLoading(true);
        
        // Intentar conectar al backend
        const response = await fetch(`${window.API_BASE_URL}/api/encargado-repuestos/dashboard`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        let data;
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                data = result.data;
            } else {
                throw new Error(result.error);
            }
        } else {
            console.log('Usando datos de ejemplo');
            data = generarDatosEjemplo();
        }
        
        actualizarKPIs(data);
        renderizarAlertas(data.alertas || []);
        renderizarCompras(data.compras || []);
        renderizarCriticos(data.criticos || []);
        
        if (data.categorias) {
            renderizarGrafico(data.categorias);
        }
        
        // Actualizar badge de notificaciones
        const stockBajoCount = (data.alertas || []).length;
        const badge = document.getElementById('notificacionesBadge');
        if (badge) badge.textContent = stockBajoCount;
        
    } catch (error) {
        console.error('Error:', error);
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

function generarDatosEjemplo() {
    return {
        kpis: {
            totalRepuestos: 1284,
            stockBajo: 23,
            comprasMes: 12450,
            proveedoresActivos: 8
        },
        alertas: [
            { id: 1, titulo: 'Filtros de aceite', descripcion: 'Stock crítico - Solo 2 unidades', cantidad: 2, unidad: 'uds' },
            { id: 2, titulo: 'Pastillas de freno', descripcion: 'Stock bajo - 5 unidades', cantidad: 5, unidad: 'uds' },
            { id: 3, titulo: 'Bujías NGK', descripcion: 'Agotándose - 8 unidades', cantidad: 8, unidad: 'uds' }
        ],
        compras: [
            { id: 1, proveedor: 'Autorepuestos López', fecha: 'Hoy', items: 12, monto: 2450 },
            { id: 2, proveedor: 'Distribuidora Gómez', fecha: 'Ayer', items: 8, monto: 1890 },
            { id: 3, proveedor: 'Importadora Vargas', fecha: 'Hace 2 días', items: 15, monto: 3200 }
        ],
        criticos: [
            { id: 1, nombre: 'Filtro de aceite', codigo: 'FA-001', stock: 2, minimo: 10 },
            { id: 2, nombre: 'Pastilla freno delantera', codigo: 'PF-023', stock: 4, minimo: 15 },
            { id: 3, nombre: 'Bujía NGK', codigo: 'BJ-112', stock: 5, minimo: 20 }
        ],
        categorias: {
            labels: ['Filtros', 'Frenos', 'Motor', 'Eléctrico', 'Suspensión', 'Transmisión'],
            data: [320, 280, 240, 180, 150, 114]
        }
    };
}

function actualizarKPIs(data) {
    if (totalRepuestos) totalRepuestos.textContent = (data.kpis.totalRepuestos || 0).toLocaleString();
    if (stockBajo) stockBajo.textContent = data.kpis.stockBajo || 0;
    if (comprasMes) comprasMes.textContent = `Bs. ${(data.kpis.comprasMes || 0).toLocaleString()}`;
    if (proveedoresActivos) proveedoresActivos.textContent = data.kpis.proveedoresActivos || 0;
}

function renderizarAlertas(alertas) {
    if (!alertasList) return;
    
    if (alertas.length === 0) {
        alertasList.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>No hay alertas activas</p></div>`;
        return;
    }
    
    alertasList.innerHTML = alertas.map(alerta => `
        <div class="alerta-item">
            <div class="alerta-icon"><i class="fas fa-exclamation-triangle"></i></div>
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

function renderizarCompras(compras) {
    if (!comprasList) return;
    
    if (compras.length === 0) {
        comprasList.innerHTML = `<div class="empty-state"><i class="fas fa-receipt"></i><p>No hay compras recientes</p></div>`;
        return;
    }
    
    comprasList.innerHTML = compras.map(compra => `
        <div class="compra-item">
            <div class="compra-icon"><i class="fas fa-receipt"></i></div>
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

function renderizarCriticos(criticos) {
    if (!criticosList) return;
    
    if (criticos.length === 0) {
        criticosList.innerHTML = `<div class="empty-state"><i class="fas fa-check"></i><p>No hay stock crítico</p></div>`;
        return;
    }
    
    criticosList.innerHTML = criticos.map(critico => `
        <div class="critico-item">
            <div class="critico-info">
                <h4>${escapeHtml(critico.nombre)}</h4>
                <p>${escapeHtml(critico.codigo)} | Mínimo: ${critico.minimo}</p>
            </div>
            <div class="critico-stock">
                <span>${critico.stock}</span>
                <small>uds</small>
            </div>
        </div>
    `).join('');
}

function renderizarGrafico(categorias) {
    const canvas = document.getElementById('inventoryChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const colores = ['#C1121F', '#2C3E50', '#1E3A5F', '#10B981', '#F59E0B', '#6B7280'];
    
    if (inventoryChart) inventoryChart.destroy();
    
    inventoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categorias.labels,
            datasets: [{
                data: categorias.data,
                backgroundColor: colores.slice(0, categorias.labels.length),
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 11 } } },
                tooltip: { 
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

// =====================================================
// UTILIDADES
// =====================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarLoading(mostrar) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = mostrar ? 'flex' : 'none';
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
    toast.className = 'toast-notification';
    toast.innerHTML = `<i class="fas ${tipo === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i><span>${mensaje}</span>`;
    
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Cerrar sesión global
window.cerrarSesion = function() {
    if (confirm('¿Cerrar sesión?')) {
        localStorage.clear();
        window.location.href = window.API_BASE_URL + '/';
    }
};

console.log('✅ Dashboard.js cargado correctamente');