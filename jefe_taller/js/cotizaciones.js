/**
 * cotizaciones.js - Jefe de Taller (CORREGIDO FINAL)
 * FURIA MOTOR COMPANY SRL
 */

// =====================================================
// VARIABLES GLOBALES
// =====================================================
let currentUser = null;
let currentUserRoles = [];
let API_URL = window.location.origin + '/api/jefe-taller';

// Datos en memoria
let ordenesTrabajo = [];
let encargadosRepuestos = [];
let serviciosTecnicos = [];
let solicitudesCotizacion = [];
let cotizacionesEnviadas = [];
let solicitudesCompra = [];

// Variables para listas dinámicas
let itemsSolicitud = [];
let itemsCompra = [];

// =====================================================
// FUNCIONES DE AUTENTICACIÓN
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    if (!token) token = sessionStorage.getItem('token');
    
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        
        if (!token) {
            window.location.href = '/';
            return null;
        }
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        let userData = null;
        try {
            const userStr = localStorage.getItem('furia_user');
            if (userStr) userData = JSON.parse(userStr);
        } catch (e) {}
        
        currentUser = {
            id: payload.user?.id || payload.id || payload.user_id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email,
            roles: payload.user?.roles || payload.roles || userData?.roles || [],
            rol_principal: payload.user?.rol_principal || payload.rol_principal || userData?.rol_principal
        };
        
        if (currentUser.roles && Array.isArray(currentUser.roles)) {
            currentUserRoles = currentUser.roles;
        } else if (currentUser.rol_principal) {
            currentUserRoles = [currentUser.rol_principal];
        }
        
        const tieneRolJefeTaller = currentUserRoles.includes('jefe_taller') || 
                                    currentUser.rol_principal === 'jefe_taller';
        
        if (!tieneRolJefeTaller) {
            console.warn('Usuario no tiene rol de jefe_taller', currentUserRoles);
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return null;
        }
        
        console.log('✅ Usuario autenticado:', currentUser.nombre, 'Roles:', currentUserRoles);
        return currentUser;
        
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        window.location.href = '/';
        return null;
    }
}

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarFechaActual() {
    const fechaElement = document.getElementById('currentDate');
    if (fechaElement) {
        const hoy = new Date();
        const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
        fechaElement.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
    
    const userNombreSpan = document.getElementById('userNombre');
    if (userNombreSpan && currentUser) {
        userNombreSpan.textContent = currentUser.nombre || 'Usuario';
    }
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        background: var(--bg-card);
        color: var(--blanco);
        padding: 0.75rem 1.25rem;
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-left: 4px solid ${type === 'success' ? '#10B981' : type === 'error' ? '#C1121F' : type === 'warning' ? '#F59E0B' : '#1E3A5F'};
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function renderEstadoBadge(estado) {
    const estados = {
        'pendiente': '<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente</span>',
        'cotizado': '<span class="status-badge status-cotizado"><i class="fas fa-check-circle"></i> Cotizado</span>',
        'aprobado': '<span class="status-badge status-aprobado"><i class="fas fa-check-double"></i> Aprobado</span>',
        'rechazado': '<span class="status-badge status-rechazado"><i class="fas fa-times-circle"></i> Rechazado</span>',
        'comprado': '<span class="status-badge status-comprado"><i class="fas fa-shopping-cart"></i> Comprado</span>'
    };
    return estados[estado] || `<span class="status-badge">${estado}</span>`;
}

function renderEstadoClienteBadge(estado) {
    const estados = {
        'aprobado_total': '<span class="status-badge status-aprobado"><i class="fas fa-check-double"></i> Aprobado Total</span>',
        'aprobado_parcial': '<span class="status-badge status-cotizado"><i class="fas fa-check"></i> Aprobado Parcial</span>',
        'rechazado': '<span class="status-badge status-rechazado"><i class="fas fa-times"></i> Rechazado</span>',
        'pendiente': '<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente</span>',
        'enviada': '<span class="status-badge status-enviado"><i class="fas fa-paper-plane"></i> Enviada</span>'
    };
    return estados[estado] || `<span class="status-badge">${estado}</span>`;
}

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE SOLICITUD
// =====================================================

function renderItemsList() {
    const container = document.getElementById('itemsList');
    if (!container) return;
    
    if (itemsSolicitud.length === 0) {
        container.innerHTML = `
            <div class="item-empty">
                <i class="fas fa-box-open"></i>
                <p>No hay items agregados</p>
                <small>Haz clic en "Agregar item" para comenzar</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = itemsSolicitud.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="form-input item-descripcion" 
                       value="${escapeHtml(item.descripcion)}" 
                       placeholder="Ej: Filtro de aceite, Bujías, Herramienta..."
                       onchange="actualizarItemSolicitud(${index}, 'descripcion', this.value)">
                
                <input type="number" class="form-input item-cantidad" 
                       value="${item.cantidad}" min="1"
                       placeholder="Cantidad"
                       onchange="actualizarItemSolicitud(${index}, 'cantidad', parseInt(this.value))">
                
                <input type="text" class="form-input item-observacion" 
                       value="${escapeHtml(item.observacion || '')}" 
                       placeholder="Observaciones (opcional)"
                       onchange="actualizarItemSolicitud(${index}, 'observacion', this.value)">
            </div>
            <div class="item-actions">
                <button type="button" class="btn-remove-item" onclick="eliminarItemSolicitud(${index})" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function agregarItemSolicitud() {
    itemsSolicitud.push({
        descripcion: '',
        cantidad: 1,
        observacion: ''
    });
    renderItemsList();
    
    setTimeout(() => {
        const lastItem = document.querySelector('#itemsList .item-row:last-child .item-descripcion');
        if (lastItem) lastItem.focus();
    }, 100);
}

function actualizarItemSolicitud(index, campo, valor) {
    if (itemsSolicitud[index]) {
        itemsSolicitud[index][campo] = valor;
    }
}

function eliminarItemSolicitud(index) {
    itemsSolicitud.splice(index, 1);
    renderItemsList();
}

function limpiarItemsSolicitud() {
    itemsSolicitud = [];
    renderItemsList();
}

// =====================================================
// FUNCIONES PARA LISTA DINÁMICA DE COMPRA
// =====================================================

function renderCompraItemsList() {
    const container = document.getElementById('compraItemsList');
    if (!container) return;
    
    if (itemsCompra.length === 0) {
        container.innerHTML = `
            <div class="item-empty">
                <i class="fas fa-box-open"></i>
                <p>No hay items agregados</p>
                <small>Haz clic en "Agregar item" para solicitar compra</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = itemsCompra.map((item, index) => `
        <div class="item-row" data-index="${index}">
            <div class="item-fields">
                <input type="text" class="form-input item-descripcion" 
                       value="${escapeHtml(item.descripcion)}" 
                       placeholder="Ej: Filtro de aceite, Pastillas de freno..."
                       onchange="actualizarItemCompra(${index}, 'descripcion', this.value)">
                
                <input type="number" class="form-input item-cantidad" 
                       value="${item.cantidad}" min="1"
                       placeholder="Cantidad"
                       onchange="actualizarItemCompra(${index}, 'cantidad', parseInt(this.value))">
                
                <input type="text" class="form-input item-observacion" 
                       value="${escapeHtml(item.observacion || '')}" 
                       placeholder="Observaciones (opcional)"
                       onchange="actualizarItemCompra(${index}, 'observacion', this.value)">
            </div>
            <div class="item-actions">
                <button type="button" class="btn-remove-item" onclick="eliminarItemCompra(${index})" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function agregarItemCompra() {
    itemsCompra.push({
        descripcion: '',
        cantidad: 1,
        observacion: ''
    });
    renderCompraItemsList();
    
    setTimeout(() => {
        const lastItem = document.querySelector('#compraItemsList .item-row:last-child .item-descripcion');
        if (lastItem) lastItem.focus();
    }, 100);
}

function actualizarItemCompra(index, campo, valor) {
    if (itemsCompra[index]) {
        itemsCompra[index][campo] = valor;
    }
}

function eliminarItemCompra(index) {
    itemsCompra.splice(index, 1);
    renderCompraItemsList();
}

function limpiarItemsCompra() {
    itemsCompra = [];
    renderCompraItemsList();
}

// =====================================================
// CARGA DE DATOS DESDE API (RESUMIDO POR ESPACIO)
// =====================================================

async function cargarDatosIniciales() {
    try {
        await Promise.all([
            cargarOrdenesTrabajo(),
            cargarEncargadosRepuestos(),
            cargarSolicitudesCotizacion(),
            cargarServiciosPendientes(),
            cargarCotizacionesEnviadas(),
            cargarSolicitudesCompra()
        ]);
        
        renderAllTables();
    } catch (error) {
        console.error('Error cargando datos:', error);
        showToast('Error al cargar los datos', 'error');
    }
}

// Funciones de carga (mantener las que ya tienes)
async function cargarOrdenesTrabajo() {
    try {
        const response = await fetch(`${API_URL}/ordenes-trabajo`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            ordenesTrabajo = data.ordenes || [];
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        ordenesTrabajo = [];
    }
}

async function cargarEncargadosRepuestos() {
    try {
        const response = await fetch(`${API_URL}/encargados-repuestos`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            encargadosRepuestos = data.encargados || [];
        }
    } catch (error) {
        console.error('Error cargando encargados:', error);
        encargadosRepuestos = [];
    }
}

async function cargarSolicitudesCotizacion() {
    try {
        const filtroOrden = document.getElementById('filtroOrdenSolicitud')?.value || 'all';
        const filtroEstado = document.getElementById('filtroEstadoSolicitud')?.value || 'all';
        
        let url = `${API_URL}/solicitudes-cotizacion`;
        const params = new URLSearchParams();
        if (filtroOrden !== 'all') params.append('id_orden_trabajo', filtroOrden);
        if (filtroEstado !== 'all') params.append('estado', filtroEstado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            solicitudesCotizacion = data.solicitudes || [];
        }
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        solicitudesCotizacion = [];
    }
}

async function cargarServiciosPendientes() {
    try {
        const response = await fetch(`${API_URL}/servicios-pendientes`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            serviciosTecnicos = data.ordenes || [];
        }
    } catch (error) {
        console.error('Error cargando servicios:', error);
        serviciosTecnicos = [];
    }
}

async function cargarCotizacionesEnviadas() {
    try {
        const response = await fetch(`${API_URL}/cotizaciones-enviadas`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (data.success) {
            cotizacionesEnviadas = data.cotizaciones || [];
        }
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
        cotizacionesEnviadas = [];
    }
}

async function cargarSolicitudesCompra() {
    try {
        const filtroOrden = document.getElementById('filtroOrdenCompra')?.value || 'all';
        const filtroEstado = document.getElementById('filtroEstadoCompra')?.value || 'all';
        
        let url = `${API_URL}/solicitudes-compra`;
        const params = new URLSearchParams();
        if (filtroOrden !== 'all') params.append('id_orden_trabajo', filtroOrden);
        if (filtroEstado !== 'all') params.append('estado', filtroEstado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            solicitudesCompra = data.solicitudes || [];
        }
    } catch (error) {
        console.error('Error cargando solicitudes de compra:', error);
        solicitudesCompra = [];
    }
}

// =====================================================
// RENDERIZADO DE TABLAS (MANTENER LAS QUE YA TIENES)
// =====================================================

function renderAllTables() {
    renderSelects();
    renderSolicitudesCotizacion();
    renderOrdenesPendientes();
    renderCotizacionesEnviadas();
    renderSolicitudesCompra();
}

function renderSelects() {
    const selectIds = ['filtroOrdenSolicitud', 'filtroOrdenServicio', 'filtroOrdenCompra', 'solicitud_id_orden_trabajo'];
    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="all">Todas las órdenes</option>' + 
                ordenesTrabajo.map(o => `<option value="${o.id}">${o.codigo_unico} - ${o.vehiculo}</option>`).join('');
            if (currentValue !== 'all' && currentValue) select.value = currentValue;
        }
    });
    
    const selectEncargado = document.getElementById('solicitud_id_encargado');
    if (selectEncargado) {
        selectEncargado.innerHTML = '<option value="">Seleccionar encargado</option>' +
            encargadosRepuestos.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
    }
}

function renderSolicitudesCotizacion() {
    const tbody = document.getElementById('tablaSolicitudesCotizacion');
    if (!tbody) return;
    
    const searchTerm = document.getElementById('searchSolicitud')?.value.toLowerCase() || '';
    
    let filtered = [...solicitudesCotizacion];
    if (searchTerm) {
        filtered = filtered.filter(s => 
            s.descripcion_pieza?.toLowerCase().includes(searchTerm) ||
            s.orden_codigo?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>No hay solicitudes de cotización</p>
                        <button class="btn-primary btn-sm" onclick="document.getElementById('btnNuevaSolicitudCotizacion').click()">
                            <i class="fas fa-plus"></i> Crear primera solicitud
                        </button>
                    </div>
                  </td>
              </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filtered.map(solicitud => `
        <tr>
            <td>${solicitud.id}</td>
            <td><span class="orden-code">${solicitud.orden_codigo || 'N/A'}</span></td>
            <td>${solicitud.vehiculo || 'N/A'}</td>
            <td><strong>${solicitud.descripcion_pieza}</strong></td>
            <td>${solicitud.cantidad}</td>
            <td>${renderEstadoBadge(solicitud.estado)}</td>
            <td>${solicitud.precio_cotizado ? `Bs. ${solicitud.precio_cotizado.toFixed(2)}` : '-'}</td>
            <td>${formatDate(solicitud.fecha_solicitud)}</td>
            <td class="action-buttons">
                ${solicitud.estado === 'pendiente' ? `
                    <button class="action-btn delete" onclick="eliminarSolicitudCotizacion(${solicitud.id})" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                ` : ''}
                ${solicitud.estado === 'cotizado' ? `
                    <button class="action-btn send" onclick="solicitarCompraDesdeCotizacion(${solicitud.id})" title="Solicitar Compra"><i class="fas fa-shopping-cart"></i></button>
                ` : ''}
            </td>
         </tr>
    `).join('');
}

// Mantén el resto de funciones de renderizado (renderOrdenesPendientes, renderCotizacionesEnviadas, renderSolicitudesCompra)
// y todas las funciones de acciones (crearSolicitudCotizacion, eliminarSolicitudCotizacion, etc.)
// que ya tienes en tu código original

// =====================================================
// FUNCIONES PARA TABS
// =====================================================
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    console.log('🔍 Configurando tabs, encontrados:', tabBtns.length);
    
    if (tabBtns.length === 0) {
        console.error('❌ No se encontraron botones de tabs');
        return;
    }
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            console.log('🔄 Click en tab:', tabId);
            
            if (!tabId) {
                console.error('❌ Tab sin data-tab attribute');
                return;
            }
            
            // Remover active de todos
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Activar el seleccionado
            this.classList.add('active');
            const targetContent = document.getElementById(tabId);
            
            if (targetContent) {
                targetContent.classList.add('active');
                console.log('✅ Tab activada:', tabId);
            } else {
                console.error('❌ Contenido no encontrado:', tabId);
            }
        });
    });
    
    console.log('✅ Tabs configurados correctamente');
}

// =====================================================
// LOGOUT
// =====================================================

function logout() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    window.location.href = '/';
}

// =====================================================
// INICIALIZACIÓN PRINCIPAL - CORREGIDA
// =====================================================

async function inicializar() {
    console.log('🚀 Inicializando cotizaciones.js');
    
    // Primero mostrar fecha (sin depender de currentUser)
    const fechaElement = document.getElementById('currentDate');
    if (fechaElement) {
        const hoy = new Date();
        const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
        fechaElement.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
    
    // Cargar usuario
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    // Mostrar nombre de usuario
    const userNombreSpan = document.getElementById('userNombre');
    if (userNombreSpan) {
        userNombreSpan.textContent = user.nombre || 'Usuario';
    }
    
    // Cargar datos y configurar todo
    await cargarDatosIniciales();
    setupTabs();
    setupEventListeners();
    await loadPaymentConfig();
    
    console.log('✅ cotizaciones.js inicializado correctamente');
}

// Configurar event listeners
function setupEventListeners() {
    // Botones principales
    const btnNueva = document.getElementById('btnNuevaSolicitudCotizacion');
    if (btnNueva) btnNueva.addEventListener('click', () => {
        limpiarItemsSolicitud();
        abrirModal('modalSolicitudCotizacion');
    });
    
    const saveBtn = document.getElementById('saveSolicitudModal');
    if (saveBtn) saveBtn.addEventListener('click', crearSolicitudCotizacion);
    
    const enviarBtn = document.getElementById('enviarCotizacionModal');
    if (enviarBtn) enviarBtn.addEventListener('click', enviarCotizacionAlCliente);
    
    const confirmarBtn = document.getElementById('confirmarSolicitudCompra');
    if (confirmarBtn) confirmarBtn.addEventListener('click', confirmarSolicitudCompra);
    
    const btnAgregarItem = document.getElementById('btnAgregarItem');
    if (btnAgregarItem) btnAgregarItem.addEventListener('click', agregarItemSolicitud);
    
    const btnAgregarItemCompra = document.getElementById('btnAgregarItemCompra');
    if (btnAgregarItemCompra) btnAgregarItemCompra.addEventListener('click', agregarItemCompra);
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
    
    // Refresh buttons
    const refreshBtns = ['refreshSolicitudes', 'refreshServicios', 'refreshCompras'];
    refreshBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', async () => {
                showToast('Actualizando datos...', 'info');
                await cargarDatosIniciales();
            });
        }
    });
    
    setupPaymentListeners();
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', inicializar);

// Funciones globales (exportar las necesarias)
window.eliminarSolicitudCotizacion = eliminarSolicitudCotizacion;
window.solicitarCompraDesdeCotizacion = solicitarCompraDesdeCotizacion;
window.abrirModalAsignarPrecios = abrirModalAsignarPrecios;
window.verDetalleCotizacion = verDetalleCotizacion;
window.verSolicitudCompra = verSolicitudCompra;
window.aprobarSolicitudCompra = aprobarSolicitudCompra;
window.cerrarModal = cerrarModal;
window.actualizarItemSolicitud = actualizarItemSolicitud;
window.eliminarItemSolicitud = eliminarItemSolicitud;
window.actualizarItemCompra = actualizarItemCompra;
window.eliminarItemCompra = eliminarItemCompra;
window.logout = logout;