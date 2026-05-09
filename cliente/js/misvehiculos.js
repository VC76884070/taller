// =====================================================
// MISVEHICULOS.JS - CLIENTE (VERSIÓN SIMPLIFICADA)
// =====================================================

const API_URL = window.location.origin + '/api/cliente';
let currentUser = null;
let vehiculos = [];
let currentVehiculo = null;

// =====================================================
// UTILIDADES
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    let icon = type === 'success' ? 'fa-check-circle' : 
               type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function cerrarModal(modalId) {
    document.getElementById(modalId)?.classList.remove('show');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
}

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/';
            return null;
        }

        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');

        currentUser = {
            id: payload.user?.id || payload.id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario'
        };

        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.textContent = new Date().toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        return currentUser;
    } catch (error) {
        window.location.href = '/';
        return null;
    }
}

function cerrarSesion() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
}

// =====================================================
// VEHÍCULOS
// =====================================================

async function cargarVehiculos() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/vehiculos`, { headers: getAuthHeaders() });
        const data = await response.json();

        if (data.success) {
            vehiculos = data.vehiculos || [];
            renderizarVehiculos();
        } else {
            showToast(data.error || 'Error al cargar vehículos', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
        document.getElementById('vehiculosGrid').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error de conexión</p>
                <button onclick="cargarVehiculos()" class="btn-retry">Reintentar</button>
            </div>
        `;
    } finally {
        mostrarLoading(false);
    }
}

function renderizarVehiculos() {
    const container = document.getElementById('vehiculosGrid');
    if (!container) return;
    
    if (vehiculos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-car-side"></i>
                <p>No tienes vehículos registrados</p>
                <small>Registra tu vehículo para ver el progreso de sus reparaciones</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = vehiculos.map(vehiculo => `
        <div class="vehiculo-card" onclick="verDetalleVehiculo(${vehiculo.id})">
            <div class="vehiculo-icono">
                <i class="fas fa-car-side"></i>
            </div>
            <div class="vehiculo-info">
                <h3>${escapeHtml(vehiculo.marca)} ${escapeHtml(vehiculo.modelo || '')}</h3>
                <p class="vehiculo-placa">${escapeHtml(vehiculo.placa)}</p>
                ${vehiculo.anio ? `<p class="vehiculo-anio">${vehiculo.anio}</p>` : ''}
            </div>
            <div class="vehiculo-action">
                <i class="fas fa-chevron-right"></i>
            </div>
        </div>
    `).join('');
}

// =====================================================
// DETALLE DEL VEHÍCULO
// =====================================================

async function verDetalleVehiculo(id) {
    const vehiculo = vehiculos.find(v => v.id === id);
    if (!vehiculo) return;
    
    currentVehiculo = vehiculo;
    
    // Obtener la orden más reciente
    let estado = 'Sin reparación activa';
    let codigoOrden = '';
    let fechaIngreso = '';
    
    try {
        const ordenesRes = await fetch(`${API_URL}/vehiculo/${id}/ordenes`, { headers: getAuthHeaders() });
        const ordenesData = await ordenesRes.json();
        
        if (ordenesData.success && ordenesData.ordenes?.length > 0) {
            const orden = ordenesData.ordenes[0];
            estado = orden.estado_global || 'En proceso';
            codigoOrden = orden.codigo_unico || '';
            fechaIngreso = orden.fecha_ingreso || '';
        }
    } catch (error) {
        console.error('Error al obtener orden:', error);
    }
    
    const modalBody = document.getElementById('modalDetalleBody');
    const modalTitulo = document.getElementById('modalTitulo');
    
    modalTitulo.textContent = `${vehiculo.marca} ${vehiculo.modelo || ''}`;
    
    modalBody.innerHTML = `
        <div class="detalle-vehiculo">
            <div class="detalle-icono">
                <i class="fas fa-car-side"></i>
            </div>
            <div class="detalle-info">
                <div class="info-row">
                    <span class="label">Placa</span>
                    <span class="value"><strong>${escapeHtml(vehiculo.placa)}</strong></span>
                </div>
                <div class="info-row">
                    <span class="label">Marca</span>
                    <span class="value">${escapeHtml(vehiculo.marca)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Modelo</span>
                    <span class="value">${escapeHtml(vehiculo.modelo || 'No especificado')}</span>
                </div>
                <div class="info-row">
                    <span class="label">Año</span>
                    <span class="value">${vehiculo.anio || 'No especificado'}</span>
                </div>
            </div>
        </div>
        
        <div class="detalle-estado">
            <div class="estado-badge ${getEstadoClass(estado)}">
                <i class="fas ${getEstadoIcon(estado)}"></i>
                <span>${getEstadoTexto(estado)}</span>
            </div>
            ${fechaIngreso ? `<div class="estado-fecha">Ingreso: ${formatDate(fechaIngreso)}</div>` : ''}
        </div>
    `;
    
    abrirModal('modalDetalleVehiculo');
}

function getEstadoTexto(estado) {
    const estados = {
        'EnRecepcion': 'En recepción',
        'EnDiagnostico': 'En diagnóstico',
        'CotizacionEnviada': 'Cotización enviada',
        'EnReparacion': 'En reparación',
        'ControlCalidad': 'Control de calidad',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado',
        'Sin reparación activa': 'Sin reparación activa'
    };
    return estados[estado] || 'En proceso';
}

function getEstadoClass(estado) {
    const classes = {
        'EnRecepcion': 'estado-recepcion',
        'EnDiagnostico': 'estado-diagnostico',
        'CotizacionEnviada': 'estado-cotizacion',
        'EnReparacion': 'estado-reparacion',
        'ControlCalidad': 'estado-calidad',
        'Finalizado': 'estado-finalizado',
        'Entregado': 'estado-entregado',
        'Sin reparación activa': 'estado-sin'
    };
    return classes[estado] || 'estado-proceso';
}

function getEstadoIcon(estado) {
    const icons = {
        'EnRecepcion': 'fa-clipboard-list',
        'EnDiagnostico': 'fa-stethoscope',
        'CotizacionEnviada': 'fa-file-invoice-dollar',
        'EnReparacion': 'fa-wrench',
        'ControlCalidad': 'fa-clipboard-check',
        'Finalizado': 'fa-flag-checkered',
        'Entregado': 'fa-handshake',
        'Sin reparación activa': 'fa-clock'
    };
    return icons[estado] || 'fa-chart-line';
}

function abrirModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function irAvances() {
    if (currentVehiculo) {
        // Guardar el vehículo seleccionado en localStorage para que avances.js lo use
        localStorage.setItem('vehiculo_seleccionado', JSON.stringify(currentVehiculo));
        window.location.href = '/cliente/avances.html';
    } else {
        showToast('Selecciona un vehículo primero', 'warning');
    }
}

// =====================================================
// EVENTOS
// =====================================================

function setupEventListeners() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
}

// =====================================================
// INICIO
// =====================================================

async function inicializar() {
    await cargarUsuarioActual();
    await cargarVehiculos();
    setupEventListeners();
}

// Exponer funciones globales
window.cerrarSesion = cerrarSesion;
window.cerrarModal = cerrarModal;
window.verDetalleVehiculo = verDetalleVehiculo;
window.cargarVehiculos = cargarVehiculos;
window.irAvances = irAvances;

document.addEventListener('DOMContentLoaded', inicializar);