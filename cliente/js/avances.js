// =====================================================
// AVANCES.JS - CLIENTE
// =====================================================

const API_URL = window.location.origin + '/api/cliente';
let currentUser = null;
let vehiculos = [];
let avancesActuales = [];
let currentVehiculoId = null;
let currentVehiculo = null;
let ordenActual = null;

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

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
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
        const response = await fetch(`${API_URL}/mis-vehiculos`, { headers: getAuthHeaders() });
        const data = await response.json();

        if (data.success) {
            vehiculos = data.vehiculos || [];
            const select = document.getElementById('selectVehiculo');
            select.innerHTML = '<option value="">-- Seleccionar vehículo --</option>';
            
            for (const v of vehiculos) {
                const option = document.createElement('option');
                option.value = v.id;
                option.textContent = `${v.marca} ${v.modelo} • ${v.placa}`;
                select.appendChild(option);
            }
        }
    } catch (error) {
        showToast('Error al cargar vehículos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZADO DE CONTENIDO
// =====================================================

function renderizarContenido() {
    const container = document.getElementById('contenidoDinamico');
    if (!container) return;
    
    if (!currentVehiculo) {
        container.innerHTML = `
            <div class="empty-initial">
                <div class="empty-icon">
                    <i class="fas fa-car-side"></i>
                </div>
                <h3>Selecciona un vehículo</h3>
                <p>Elige tu auto para ver el progreso de la reparación</p>
            </div>
        `;
        return;
    }
    
    if (!ordenActual) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-wrench"></i>
                </div>
                <h3>No hay órdenes activas</h3>
                <p>${currentVehiculo.marca} ${currentVehiculo.modelo} no tiene reparaciones en curso</p>
                <small>Si tienes una reparación agendada, aparecerá aquí</small>
            </div>
        `;
        return;
    }
    
    if (!avancesActuales || avancesActuales.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-hourglass-half"></i>
                </div>
                <h3>Reparación en proceso</h3>
                <p>Tu vehículo está siendo reparado</p>
                <small>Pronto aparecerán las actualizaciones del progreso</small>
            </div>
        `;
        return;
    }
    
    // Renderizar avances
    const avancesOrdenados = [...avancesActuales].reverse();
    
    container.innerHTML = `
        <div class="avances-container">
            ${avancesOrdenados.map((avance, index) => renderizarAvance(avance, index, avancesOrdenados.length)).join('')}
        </div>
    `;
}

function renderizarAvance(avance, index, total) {
    const fecha = formatDate(avance.fecha_aprobacion || avance.fecha_creacion);
    const isLast = index === total - 1;
    
    // Generar HTML de fotos (grid responsivo)
    let fotosHtml = '';
    if (avance.fotos && avance.fotos.length > 0) {
        const fotoCount = avance.fotos.length;
        const gridClass = fotoCount === 1 ? 'foto-single' : 
                          fotoCount === 2 ? 'foto-double' : 'foto-grid';
        
        fotosHtml = `
            <div class="fotos-section ${gridClass}">
                ${avance.fotos.map(foto => `
                    <div class="foto-item" onclick="event.stopPropagation(); abrirFoto('${foto.url}')">
                        <img src="${foto.url}" alt="Foto del avance">
                        ${foto.comentario ? `<div class="foto-caption">${escapeHtml(foto.comentario)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    return `
        <div class="avance-card" onclick="verDetalleAvance(${avance.id})">
            <div class="avance-header">
                <div class="avance-timeline">
                    <div class="timeline-marker ${isLast ? 'last' : ''}"></div>
                    ${!isLast ? '<div class="timeline-line"></div>' : ''}
                </div>
                <div class="avance-contenido">
                    <div class="avance-meta">
                        <span class="avance-fecha">
                            <i class="far fa-calendar-alt"></i> ${fecha}
                        </span>
                    </div>
                    <h3 class="avance-titulo">${escapeHtml(avance.titulo)}</h3>
                    ${avance.descripcion ? `<p class="avance-descripcion">${escapeHtml(avance.descripcion)}</p>` : ''}
                    ${fotosHtml}
                </div>
            </div>
        </div>
    `;
}

// =====================================================
// CARGAR DATOS
// =====================================================

async function cargarDatosVehiculo() {
    if (!currentVehiculoId) return;
    
    mostrarLoading(true);
    try {
        // Buscar vehículo seleccionado
        currentVehiculo = vehiculos.find(v => v.id === currentVehiculoId);
        
        // Obtener órdenes del vehículo
        const ordenesRes = await fetch(`${API_URL}/ordenes-vehiculo/${currentVehiculoId}`, { headers: getAuthHeaders() });
        const ordenesData = await ordenesRes.json();
        
        if (ordenesData.success && ordenesData.ordenes?.length > 0) {
            ordenActual = ordenesData.ordenes[0];
            
            // Obtener avances de la orden
            const avancesRes = await fetch(`${API_URL}/avances-orden/${ordenActual.id}`, { headers: getAuthHeaders() });
            const avancesData = await avancesRes.json();
            
            avancesActuales = avancesData.success ? (avancesData.avances || []) : [];
        } else {
            ordenActual = null;
            avancesActuales = [];
        }
        
        renderizarContenido();
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar datos', 'error');
        renderizarContenido();
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// DETALLE DEL AVANCE
// =====================================================

window.verDetalleAvance = function(avanceId) {
    const avance = avancesActuales.find(a => a.id === avanceId);
    if (!avance) return;
    
    document.getElementById('modalTitulo').textContent = avance.titulo;
    
    const fecha = formatDateTime(avance.fecha_aprobacion || avance.fecha_creacion);
    
    let fotosHtml = '';
    if (avance.fotos && avance.fotos.length > 0) {
        fotosHtml = `
            <div class="modal-fotos">
                ${avance.fotos.map(foto => `
                    <div class="modal-foto-item" onclick="abrirFoto('${foto.url}')">
                        <img src="${foto.url}" alt="Foto">
                        ${foto.comentario ? `<div class="modal-foto-caption">${escapeHtml(foto.comentario)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    document.getElementById('modalCuerpo').innerHTML = `
        <div class="modal-fecha">
            <i class="far fa-calendar-alt"></i> ${fecha}
        </div>
        ${avance.descripcion ? `
            <div class="modal-descripcion">
                <h4><i class="fas fa-align-left"></i> Descripción</h4>
                <p>${escapeHtml(avance.descripcion)}</p>
            </div>
        ` : ''}
        ${fotosHtml || '<div class="modal-sin-fotos">No hay fotos disponibles</div>'}
    `;
    
    document.getElementById('modalDetalle').classList.add('show');
};

window.abrirFoto = function(url) {
    document.getElementById('fotoAmpliada').src = url;
    document.getElementById('modalFoto').classList.add('show');
};

function cerrarModalFoto() {
    document.getElementById('modalFoto').classList.remove('show');
}

// =====================================================
// EVENTOS
// =====================================================

function setupEventListeners() {
    const selectVehiculo = document.getElementById('selectVehiculo');
    if (selectVehiculo) {
        selectVehiculo.addEventListener('change', (e) => {
            currentVehiculoId = parseInt(e.target.value);
            if (currentVehiculoId) {
                cargarDatosVehiculo();
            } else {
                currentVehiculo = null;
                ordenActual = null;
                avancesActuales = [];
                renderizarContenido();
            }
        });
    }
    
    const btnVer = document.getElementById('btnVerAvances');
    if (btnVer) {
        btnVer.addEventListener('click', () => {
            if (currentVehiculoId) {
                cargarDatosVehiculo();
            } else {
                showToast('Selecciona un vehículo', 'warning');
            }
        });
    }
    
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
    renderizarContenido();
}

window.cerrarSesion = cerrarSesion;
window.cerrarModal = cerrarModal;
window.verDetalleAvance = verDetalleAvance;
window.abrirFoto = abrirFoto;
window.cerrarModalFoto = cerrarModalFoto;

document.addEventListener('DOMContentLoaded', inicializar);