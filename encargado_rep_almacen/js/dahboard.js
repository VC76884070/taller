// =====================================================
// DASHBOARD ENCARGADO DE REPUESTOS - VERSIÓN CORREGIDA
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

// Elementos DOM del Dashboard
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
let inventoryChart = null;

// =====================================================
// DATOS DE EJEMPLO PARA LAS NUEVAS PESTAÑAS
// =====================================================

// Solicitudes de Cotización
let solicitudesCotizacion = [
    { id: 'COT-001', repuesto: 'Filtro de Aceite', cantidad: 50, fecha: '2024-01-15', estado: 'pendiente', proveedor: 'Autorepuestos López' },
    { id: 'COT-002', repuesto: 'Pastillas de Freno', cantidad: 30, fecha: '2024-01-14', estado: 'aprobado', proveedor: 'Distribuidora Gómez' },
    { id: 'COT-003', repuesto: 'Bujías NGK', cantidad: 100, fecha: '2024-01-13', estado: 'cotizando', proveedor: 'Importadora Vargas' },
    { id: 'COT-004', repuesto: 'Correa de Distribución', cantidad: 20, fecha: '2024-01-12', estado: 'pendiente', proveedor: 'Repuestos Rápidos' },
    { id: 'COT-005', repuesto: 'Amortiguadores', cantidad: 15, fecha: '2024-01-11', estado: 'rechazado', proveedor: 'Suspensiones Total' }
];

// Solicitudes de Compra
let solicitudesCompra = [
    { id: 'COM-001', proveedor: 'Autorepuestos López', repuesto: 'Filtro de Aceite', cantidad: 100, monto: 12500, fecha: '2024-01-15', estado: 'pendiente' },
    { id: 'COM-002', proveedor: 'Distribuidora Gómez', repuesto: 'Pastillas de Freno', cantidad: 60, monto: 8400, fecha: '2024-01-14', estado: 'aprobado' },
    { id: 'COM-003', proveedor: 'Importadora Vargas', repuesto: 'Bujías NGK', cantidad: 200, monto: 18000, fecha: '2024-01-13', estado: 'pendiente' },
    { id: 'COM-004', proveedor: 'Repuestos Rápidos', repuesto: 'Correa Distribución', cantidad: 40, monto: 12000, fecha: '2024-01-12', estado: 'aprobado' }
];

// Proveedores
let proveedores = [
    { id: 'PROV-001', nombre: 'Autorepuestos López', contacto: 'Carlos López', telefono: '71234567', email: 'ventas@autorepuestos.com', direccion: 'Av. Libertador 123' },
    { id: 'PROV-002', nombre: 'Distribuidora Gómez', contacto: 'María Gómez', telefono: '71234568', email: 'mgomez@distribuidora.com', direccion: 'Calle Comercio 456' },
    { id: 'PROV-003', nombre: 'Importadora Vargas', contacto: 'Juan Vargas', telefono: '71234569', email: 'jvargas@importadora.com', direccion: 'Zona Industrial 789' },
    { id: 'PROV-004', nombre: 'Repuestos Rápidos', contacto: 'Ana Condori', telefono: '71234570', email: 'acondori@repuestosrapidos.com', direccion: 'Av. 6 de Agosto 321' }
];

// Historial
let historialMovimientos = [
    { fecha: '2024-01-15 10:30', tipo: 'compra', repuesto: 'Filtro de Aceite', cantidad: 100, usuario: 'Roberto Vargas', estado: 'completado' },
    { fecha: '2024-01-15 09:15', tipo: 'cotizacion', repuesto: 'Pastillas de Freno', cantidad: 30, usuario: 'Roberto Vargas', estado: 'enviado' },
    { fecha: '2024-01-14 16:45', tipo: 'compra', repuesto: 'Bujías NGK', cantidad: 200, usuario: 'Roberto Vargas', estado: 'pendiente' },
    { fecha: '2024-01-14 11:20', tipo: 'cotizacion', repuesto: 'Correa Distribución', cantidad: 20, usuario: 'Roberto Vargas', estado: 'aprobado' },
    { fecha: '2024-01-13 14:50', tipo: 'compra', repuesto: 'Amortiguadores', cantidad: 15, usuario: 'Roberto Vargas', estado: 'completado' }
];

// =====================================================
// VERIFICAR AUTENTICACIÓN
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
        if (userData) {
            usuarioActual = JSON.parse(userData);
            rolesUsuario = usuarioActual.roles || [];
        }
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.user) {
            usuarioActual = { ...usuarioActual, ...payload.user };
            if (payload.user.roles) {
                rolesUsuario = payload.user.roles;
            }
        }
        
        const selectedRole = usuarioActual?.selected_role;
        
        console.log('📋 Roles del usuario:', rolesUsuario);
        console.log('🎯 Rol seleccionado:', selectedRole);
        
        const rolesValidos = ['encargado_repuestos', 'encargado_rep_almacen'];
        const tieneRolRepuestos = rolesUsuario.some(r => rolesValidos.includes(r));
        
        if (!tieneRolRepuestos) {
            console.warn('❌ Usuario no tiene permiso de Encargado de Repuestos');
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            
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
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
            console.log('❌ Token inválido, redirigiendo a login');
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        console.log('✅ Autenticación correcta para Encargado de Repuestos');
        
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
    
    // Cargar datos de todas las pestañas
    await loadDashboardData();
    await loadCotizacionesData();
    await loadComprasData();
    await loadProveedoresData();
    await loadHistorialData();
    
    setupEventListeners();
    setupTabs();
});

// Inicializar página
function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    if (currentDateSpan) {
        currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

// Configurar tabs
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Actualizar botones activos
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Actualizar contenidos activos
            tabContents.forEach(content => content.classList.remove('active'));
            const activeContent = document.getElementById(tabId);
            if (activeContent) activeContent.classList.add('active');
        });
    });
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDashboardData();
            loadCotizacionesData();
            loadComprasData();
            loadProveedoresData();
            loadHistorialData();
            mostrarNotificacion('Datos actualizados', 'success');
        });
    }
}

function mostrarNombreUsuario() {
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan && usuarioActual) {
        userNameSpan.textContent = usuarioActual.nombre || usuarioActual.email || 'Roberto Vargas';
    }
}

function mostrarIndicadorRoles() {
    const headerUserInfo = document.querySelector('.user-info');
    if (headerUserInfo && rolesUsuario && rolesUsuario.length > 1) {
        if (headerUserInfo.querySelector('.roles-badge')) return;
        
        const rolesBadge = document.createElement('div');
        rolesBadge.className = 'roles-badge';
        rolesBadge.style.cssText = `
            font-size: 0.7rem;
            background: var(--gris-oscuro);
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

// =====================================================
// CARGAR DATOS DEL DASHBOARD
// =====================================================
async function loadDashboardData() {
    try {
        mostrarLoading(true);
        
        const response = await fetch(`${API_URL}/encargado-repuestos/dashboard`, {
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
        
        const stockBajoCount = (data.alertas || []).length;
        localStorage.setItem('stock_bajo_count', stockBajoCount.toString());
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
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
            { id: 2, titulo: 'Pastillas de freno delanteras', descripcion: 'Stock bajo - 5 unidades', cantidad: 5, unidad: 'uds' },
            { id: 3, titulo: 'Bujías NGK', descripcion: 'Agotándose rápidamente - 8 unidades', cantidad: 8, unidad: 'uds' }
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
    if (alertasCount) alertasCount.textContent = alertas.length;
    if (!alertasList) return;
    
    if (alertas.length === 0) {
        alertasList.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--gris-medio);"><i class="fas fa-check-circle" style="font-size: 2rem;"></i><p>No hay alertas</p></div>`;
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
        comprasList.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--gris-medio);"><i class="fas fa-receipt"></i><p>No hay compras recientes</p></div>`;
        return;
    }
    
    comprasList.innerHTML = compras.map(compra => `
        <div class="compra-item">
            <div class="compra-icon"><i class="fas fa-receipt"></i></div>
            <div class="compra-content">
                <div class="compra-proveedor">${escapeHtml(compra.proveedor)}</div>
                <div class="compra-info"><span><i class="far fa-clock"></i> ${compra.fecha}</span><span><i class="fas fa-boxes"></i> ${compra.items} items</span></div>
            </div>
            <div class="compra-monto">Bs. ${(compra.monto || 0).toLocaleString()}</div>
        </div>
    `).join('');
}

function renderizarCriticos(criticos) {
    if (criticosCount) criticosCount.textContent = criticos.length;
    if (!criticosList) return;
    
    if (criticos.length === 0) {
        criticosList.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--gris-medio);"><i class="fas fa-check"></i><p>No hay repuestos críticos</p></div>`;
        return;
    }
    
    criticosList.innerHTML = criticos.map(critico => `
        <div class="critico-item">
            <div class="critico-info">
                <h4>${escapeHtml(critico.nombre)}</h4>
                <p>${escapeHtml(critico.codigo)} | Mínimo: ${critico.minimo}</p>
            </div>
            <div class="critico-stock">${critico.stock}<small>uds</small></div>
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
                borderRadius: 4,
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 11 } } },
                tooltip: { callbacks: { label: function(context) {
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    const percentage = ((context.raw / total) * 100).toFixed(1);
                    return `${context.raw} unidades (${percentage}%)`;
                } } }
            }
        }
    });
}

// =====================================================
// FUNCIONES PARA SOLICITUDES DE COTIZACIÓN
// =====================================================
async function loadCotizacionesData() {
    const tbody = document.getElementById('cotizacionesList');
    if (!tbody) return;
    
    tbody.innerHTML = solicitudesCotizacion.map(cot => `
        <tr>
            <td>${cot.id}</td>
            <td>${escapeHtml(cot.repuesto)}</td>
            <td>${cot.cantidad}</td>
            <td>${cot.fecha}</td>
            <td><span class="status-badge status-${cot.estado}">${getEstadoTexto(cot.estado)}</span></td>
            <td>
                <button class="btn-icon" onclick="verDetalleCotizacion('${cot.id}')" title="Ver"><i class="fas fa-eye"></i></button>
                <button class="btn-icon" onclick="editarCotizacion('${cot.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon" onclick="eliminarCotizacion('${cot.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function openNuevaCotizacionModal() {
    document.getElementById('nuevaCotizacionModal').classList.add('active');
    cargarProveedoresSelect('cotizacionProveedor');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function enviarCotizacion(event) {
    event.preventDefault();
    const nuevaCot = {
        id: `COT-${String(solicitudesCotizacion.length + 1).padStart(3, '0')}`,
        repuesto: document.getElementById('cotizacionRepuesto').value,
        cantidad: parseInt(document.getElementById('cotizacionCantidad').value),
        fecha: new Date().toISOString().split('T')[0],
        estado: 'pendiente',
        proveedor: document.getElementById('cotizacionProveedor').value || 'Sin asignar'
    };
    
    solicitudesCotizacion.unshift(nuevaCot);
    loadCotizacionesData();
    closeModal('nuevaCotizacionModal');
    document.getElementById('cotizacionForm').reset();
    mostrarNotificacion('Solicitud de cotización enviada', 'success');
}

function verDetalleCotizacion(id) {
    const cot = solicitudesCotizacion.find(c => c.id === id);
    if (cot) {
        alert(`Detalle de ${id}:\nRepuesto: ${cot.repuesto}\nCantidad: ${cot.cantidad}\nEstado: ${cot.estado}\nProveedor: ${cot.proveedor}`);
    }
}

function editarCotizacion(id) {
    mostrarNotificacion('Función de edición en desarrollo', 'info');
}

function eliminarCotizacion(id) {
    if (confirm('¿Eliminar esta solicitud?')) {
        solicitudesCotizacion = solicitudesCotizacion.filter(c => c.id !== id);
        loadCotizacionesData();
        mostrarNotificacion('Solicitud eliminada', 'success');
    }
}

// =====================================================
// FUNCIONES PARA SOLICITUDES DE COMPRA
// =====================================================
async function loadComprasData() {
    const tbody = document.getElementById('comprasList');
    if (!tbody) return;
    
    tbody.innerHTML = solicitudesCompra.map(comp => `
        <tr>
            <td>${comp.id}</td>
            <td>${escapeHtml(comp.proveedor)}</td>
            <td>${escapeHtml(comp.repuesto)}</td>
            <td>${comp.cantidad}</td>
            <td>Bs. ${comp.monto.toLocaleString()}</td>
            <td><span class="status-badge status-${comp.estado}">${getEstadoTexto(comp.estado)}</span></td>
            <td>
                <button class="btn-icon" onclick="verDetalleCompra('${comp.id}')" title="Ver"><i class="fas fa-eye"></i></button>
                <button class="btn-icon" onclick="aprobarCompra('${comp.id}')" title="Aprobar"><i class="fas fa-check-circle"></i></button>
            </td>
        </tr>
    `).join('');
}

function openNuevaCompraModal() {
    document.getElementById('nuevaCompraModal').classList.add('active');
    cargarProveedoresSelect('compraProveedor');
}

function enviarCompra(event) {
    event.preventDefault();
    const nuevaComp = {
        id: `COM-${String(solicitudesCompra.length + 1).padStart(3, '0')}`,
        proveedor: document.getElementById('compraProveedor').value,
        repuesto: document.getElementById('compraRepuesto').value,
        cantidad: parseInt(document.getElementById('compraCantidad').value),
        monto: parseFloat(document.getElementById('compraMonto').value),
        fecha: new Date().toISOString().split('T')[0],
        estado: 'pendiente'
    };
    
    solicitudesCompra.unshift(nuevaComp);
    loadComprasData();
    closeModal('nuevaCompraModal');
    document.getElementById('compraForm').reset();
    mostrarNotificacion('Solicitud de compra enviada', 'success');
}

function verDetalleCompra(id) {
    const comp = solicitudesCompra.find(c => c.id === id);
    if (comp) {
        alert(`Detalle de ${id}:\nProveedor: ${comp.proveedor}\nRepuesto: ${comp.repuesto}\nCantidad: ${comp.cantidad}\nMonto: Bs. ${comp.monto.toLocaleString()}`);
    }
}

function aprobarCompra(id) {
    const comp = solicitudesCompra.find(c => c.id === id);
    if (comp && comp.estado === 'pendiente') {
        comp.estado = 'aprobado';
        loadComprasData();
        mostrarNotificacion(`Compra ${id} aprobada`, 'success');
    }
}

// =====================================================
// FUNCIONES PARA PROVEEDORES
// =====================================================
async function loadProveedoresData() {
    const tbody = document.getElementById('proveedoresList');
    if (!tbody) return;
    
    tbody.innerHTML = proveedores.map(prov => `
        <tr>
            <td>${prov.id}</td>
            <td>${escapeHtml(prov.nombre)}</td>
            <td>${escapeHtml(prov.contacto)}</td>
            <td>${prov.telefono}</td>
            <td>${prov.email}</td>
            <td>
                <button class="btn-icon" onclick="editarProveedor('${prov.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon" onclick="eliminarProveedor('${prov.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function cargarProveedoresSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '<option value="">Seleccionar proveedor</option>' + 
        proveedores.map(prov => `<option value="${escapeHtml(prov.nombre)}">${escapeHtml(prov.nombre)}</option>`).join('');
}

function openNuevoProveedorModal() {
    document.getElementById('nuevoProveedorModal').classList.add('active');
}

function guardarProveedor(event) {
    event.preventDefault();
    const nuevoProv = {
        id: `PROV-${String(proveedores.length + 1).padStart(3, '0')}`,
        nombre: document.getElementById('provNombre').value,
        contacto: document.getElementById('provContacto').value,
        telefono: document.getElementById('provTelefono').value,
        email: document.getElementById('provEmail').value,
        direccion: document.getElementById('provDireccion').value
    };
    
    proveedores.push(nuevoProv);
    loadProveedoresData();
    closeModal('nuevoProveedorModal');
    document.getElementById('proveedorForm').reset();
    mostrarNotificacion('Proveedor agregado', 'success');
}

function editarProveedor(id) {
    mostrarNotificacion('Función de edición en desarrollo', 'info');
}

function eliminarProveedor(id) {
    if (confirm('¿Eliminar este proveedor?')) {
        proveedores = proveedores.filter(p => p.id !== id);
        loadProveedoresData();
        mostrarNotificacion('Proveedor eliminado', 'success');
    }
}

// =====================================================
// FUNCIONES PARA HISTORIAL
// =====================================================
async function loadHistorialData() {
    const tbody = document.getElementById('historialList');
    if (!tbody) return;
    
    tbody.innerHTML = historialMovimientos.map(hist => `
        <tr>
            <td>${hist.fecha}</td>
            <td><span class="status-badge">${hist.tipo.toUpperCase()}</span></td>
            <td>${escapeHtml(hist.repuesto)}</td>
            <td>${hist.cantidad}</td>
            <td>${escapeHtml(hist.usuario)}</td>
            <td><span class="status-badge status-${hist.estado}">${getEstadoTexto(hist.estado)}</span></td>
        </tr>
    `).join('');
}

// =====================================================
// FUNCIONES PARA PERFIL
// =====================================================
let editMode = false;

function toggleEditProfile() {
    editMode = !editMode;
    const profileInfo = document.getElementById('profileInfo');
    const profileEdit = document.getElementById('profileEdit');
    
    if (editMode) {
        profileInfo.style.display = 'none';
        profileEdit.style.display = 'block';
        document.getElementById('editNombre').value = document.getElementById('profileNombre').innerText;
        document.getElementById('editEmail').value = document.getElementById('profileEmail').innerText;
        document.getElementById('editTelefono').value = document.getElementById('profileTelefono').innerText;
    } else {
        profileInfo.style.display = 'block';
        profileEdit.style.display = 'none';
    }
}

function saveProfile() {
    const nuevoNombre = document.getElementById('editNombre').value;
    const nuevoEmail = document.getElementById('editEmail').value;
    const nuevoTelefono = document.getElementById('editTelefono').value;
    
    document.getElementById('profileNombre').innerText = nuevoNombre;
    document.getElementById('profileEmail').innerText = nuevoEmail;
    document.getElementById('profileTelefono').innerText = nuevoTelefono;
    
    if (usuarioActual) {
        usuarioActual.nombre = nuevoNombre;
        usuarioActual.email = nuevoEmail;
        localStorage.setItem('furia_user', JSON.stringify(usuarioActual));
    }
    
    toggleEditProfile();
    mostrarNotificacion('Perfil actualizado', 'success');
}

// =====================================================
// FUNCIONES UTILITARIAS
// =====================================================
function getEstadoTexto(estado) {
    const estados = {
        'pendiente': 'Pendiente',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado',
        'cotizando': 'Cotizando',
        'completado': 'Completado',
        'enviado': 'Enviado'
    };
    return estados[estado] || estado;
}

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
        toastContainer.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;`;
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    const iconos = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${mensaje}</span>`;
    toast.style.cssText = `background: var(--negro); color: var(--blanco); padding: 0.75rem 1.25rem; border-radius: 10px; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : '#F59E0B'}; animation: slideIn 0.3s ease;`;
    
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// Funciones globales
window.logout = () => {
    if (confirm('¿Cerrar sesión?')) {
        localStorage.clear();
        window.location.href = '/';
    }
};

window.openNuevaCotizacionModal = openNuevaCotizacionModal;
window.closeModal = closeModal;
window.enviarCotizacion = enviarCotizacion;
window.verDetalleCotizacion = verDetalleCotizacion;
window.editarCotizacion = editarCotizacion;
window.eliminarCotizacion = eliminarCotizacion;
window.openNuevaCompraModal = openNuevaCompraModal;
window.enviarCompra = enviarCompra;
window.verDetalleCompra = verDetalleCompra;
window.aprobarCompra = aprobarCompra;
window.openNuevoProveedorModal = openNuevoProveedorModal;
window.guardarProveedor = guardarProveedor;
window.editarProveedor = editarProveedor;
window.eliminarProveedor = eliminarProveedor;
window.toggleEditProfile = toggleEditProfile;
window.saveProfile = saveProfile;

console.log('✅ dashboard.js de Encargado de Repuestos cargado correctamente');