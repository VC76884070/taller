// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 Modo DESARROLLO - Usando localhost:5000');
            return 'http://localhost:5000';
        }
        console.log('📡 Modo PRODUCCIÓN - Usando URL relativa');
        return '';
    })();
}

// =====================================================
// AVANCES.JS - CLIENTE (VERSIÓN OPTIMIZADA)
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.API_BASE_URL + '/api/cliente';
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
        return date.toLocaleString('es-ES', {
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

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return formatDate(dateStr);
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
            window.location.href = window.API_BASE_URL + '/';
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
        window.location.href = window.API_BASE_URL + '/';
        return null;
    }
}

function cerrarSesion() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = window.API_BASE_URL + '/';
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
                option.textContent = `${v.marca} ${v.modelo || ''} • ${v.placa}`;
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
// RENDERIZADO DE CONTENIDO MEJORADO
// =====================================================

function renderizarContenido() {
    const container = document.getElementById('contenidoDinamico');
    if (!container) return;
    
    if (!currentVehiculo) {
        container.innerHTML = `
            <div class="empty-state premium">
                <div class="empty-icon">
                    <i class="fas fa-car-side"></i>
                </div>
                <h3>Selecciona un vehículo</h3>
                <p>Elige tu auto para ver el progreso de la reparación</p>
                <small>Los avances aparecerán automáticamente</small>
            </div>
        `;
        actualizarDashboard(0, 0, null);
        return;
    }
    
    if (!ordenActual) {
        container.innerHTML = `
            <div class="empty-state premium">
                <div class="empty-icon">
                    <i class="fas fa-wrench"></i>
                </div>
                <h3>No hay órdenes activas</h3>
                <p>${escapeHtml(currentVehiculo.marca)} ${escapeHtml(currentVehiculo.modelo || '')} no tiene reparaciones en curso</p>
                <small>Si tienes una reparación agendada, aparecerá aquí</small>
                <button class="btn-primary" style="margin-top: 1rem;" onclick="verInfoOrden()">
                    <i class="fas fa-info-circle"></i> Ver información
                </button>
            </div>
        `;
        actualizarDashboard(0, 0, null);
        return;
    }
    
    if (!avancesActuales || avancesActuales.length === 0) {
        container.innerHTML = `
            <div class="empty-state premium">
                <div class="empty-icon">
                    <i class="fas fa-hourglass-half"></i>
                </div>
                <h3>Reparación en proceso</h3>
                <p>Tu vehículo está siendo reparado</p>
                <small>Pronto aparecerán las actualizaciones del progreso</small>
                <div class="orden-info-mini">
                    <i class="fas fa-receipt"></i>
                    <span>Orden: ${escapeHtml(ordenActual.codigo_unico)}</span>
                    <span class="separador">•</span>
                    <i class="fas fa-calendar"></i>
                    <span>Ingreso: ${formatDate(ordenActual.fecha_ingreso)}</span>
                </div>
            </div>
        `;
        actualizarDashboard(0, 0, null);
        return;
    }
    
    // Calcular estadísticas para dashboard
    const totalFotos = avancesActuales.reduce((sum, a) => sum + (a.fotos?.length || 0), 0);
    const ultimoAvance = avancesActuales[0]?.fecha_aprobacion || avancesActuales[0]?.fecha_creacion;
    
    actualizarDashboard(avancesActuales.length, totalFotos, ultimoAvance);
    
    // Renderizar avances en orden cronológico (del más antiguo al más reciente)
    const avancesOrdenados = [...avancesActuales].reverse();
    
    container.innerHTML = `
        <div class="timeline-avances">
            <div class="timeline-header-avances">
                <h3><i class="fas fa-history"></i> Línea de tiempo de reparación</h3>
                <div class="orden-badge">
                    <i class="fas fa-receipt"></i>
                    <span>Orden: ${escapeHtml(ordenActual.codigo_unico)}</span>
                </div>
            </div>
            <div class="avances-timeline">
                ${avancesOrdenados.map((avance, index) => renderizarAvance(avance, index, avancesOrdenados.length)).join('')}
            </div>
        </div>
    `;
}

function actualizarDashboard(totalAvances, totalFotos, ultimoAvance) {
    const totalAvancesEl = document.getElementById('totalAvances');
    const totalFotosEl = document.getElementById('totalFotos');
    const ultimoAvanceEl = document.getElementById('ultimoAvance');
    
    if (totalAvancesEl) totalAvancesEl.textContent = totalAvances;
    if (totalFotosEl) totalFotosEl.textContent = totalFotos;
    if (ultimoAvanceEl) ultimoAvanceEl.textContent = ultimoAvance ? formatRelativeDate(ultimoAvance) : '-';
}

function renderizarAvance(avance, index, total) {
    const fecha = formatDateTime(avance.fecha_aprobacion || avance.fecha_creacion);
    const isFirst = index === 0;
    const isLast = index === total - 1;
    
    // Generar HTML de fotos
    let fotosHtml = '';
    if (avance.fotos && avance.fotos.length > 0) {
        const fotoCount = avance.fotos.length;
        let gridClass = 'fotos-grid';
        if (fotoCount === 1) gridClass = 'fotos-single';
        else if (fotoCount === 2) gridClass = 'fotos-double';
        else gridClass = 'fotos-grid';
        
        fotosHtml = `
            <div class="${gridClass}">
                ${avance.fotos.map((foto, idx) => `
                    <div class="foto-card" onclick="event.stopPropagation(); abrirFoto('${foto.url}', '${escapeHtml(foto.comentario || '')}')">
                        <img src="${foto.url}" alt="Foto del avance" loading="lazy">
                        ${foto.comentario ? `<div class="foto-overlay"><span>${escapeHtml(foto.comentario)}</span></div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    return `
        <div class="timeline-item ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}" onclick="verDetalleAvance(${avance.id})">
            <div class="timeline-marker">
                <div class="marker-dot ${isFirst ? 'current' : ''}"></div>
                ${!isLast ? '<div class="marker-line"></div>' : ''}
            </div>
            <div class="timeline-content">
                <div class="avance-header-content">
                    <div class="avance-fecha-badge">
                        <i class="far fa-calendar-alt"></i>
                        <span>${fecha}</span>
                    </div>
                    <div class="avance-arrow">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
                <h4 class="avance-titulo">${escapeHtml(avance.titulo)}</h4>
                ${avance.descripcion ? `<p class="avance-descripcion">${escapeHtml(avance.descripcion)}</p>` : ''}
                ${fotosHtml}
            </div>
        </div>
    `;
}

// =====================================================
// CARGAR DATOS OPTIMIZADO
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
// DETALLE DEL AVANCE MEJORADO
// =====================================================

window.verDetalleAvance = function(avanceId) {
    const avance = avancesActuales.find(a => a.id === avanceId);
    if (!avance) return;
    
    const modalTitulo = document.getElementById('modalTitulo');
    const modalCuerpo = document.getElementById('modalCuerpo');
    
    if (modalTitulo) modalTitulo.textContent = avance.titulo;
    
    const fecha = formatDateTime(avance.fecha_aprobacion || avance.fecha_creacion);
    
    let fotosHtml = '';
    if (avance.fotos && avance.fotos.length > 0) {
        fotosHtml = `
            <div class="modal-fotos-grid">
                ${avance.fotos.map((foto, idx) => `
                    <div class="modal-foto-card" onclick="abrirFoto('${foto.url}', '${escapeHtml(foto.comentario || '')}')">
                        <img src="${foto.url}" alt="Foto ${idx + 1}" loading="lazy">
                        ${foto.comentario ? `<div class="modal-foto-caption">${escapeHtml(foto.comentario)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    if (modalCuerpo) {
        modalCuerpo.innerHTML = `
            <div class="detalle-avance">
                <div class="detalle-meta">
                    <div class="meta-item">
                        <i class="far fa-calendar-alt"></i>
                        <span>${fecha}</span>
                    </div>
                    <div class="meta-item">
                        <i class="fas fa-receipt"></i>
                        <span>Orden: ${escapeHtml(ordenActual?.codigo_unico || 'N/A')}</span>
                    </div>
                    <div class="meta-item">
                        <i class="fas fa-car"></i>
                        <span>${escapeHtml(currentVehiculo?.marca)} ${escapeHtml(currentVehiculo?.modelo || '')}</span>
                    </div>
                </div>
                
                ${avance.descripcion ? `
                    <div class="detalle-descripcion">
                        <h4><i class="fas fa-align-left"></i> Descripción</h4>
                        <p>${escapeHtml(avance.descripcion)}</p>
                    </div>
                ` : ''}
                
                ${fotosHtml || '<div class="detalle-sin-fotos"><i class="fas fa-image"></i><p>No hay fotos disponibles</p></div>'}
            </div>
        `;
    }
    
    abrirModal('modalDetalle');
};

window.verInfoOrden = function() {
    if (!ordenActual && currentVehiculo) {
        // Mostrar información de que no hay orden activa
        const modalCuerpo = document.getElementById('modalOrdenCuerpo');
        if (modalCuerpo) {
            modalCuerpo.innerHTML = `
                <div class="info-orden-detalle">
                    <div class="info-icon">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <h4>No hay reparaciones activas</h4>
                    <p>Actualmente, el vehículo <strong>${escapeHtml(currentVehiculo.marca)} ${escapeHtml(currentVehiculo.modelo || '')}</strong> (${escapeHtml(currentVehiculo.placa)}) no tiene ninguna orden de trabajo activa.</p>
                    <p>Si deseas agendar una revisión o reparación, por favor contáctanos.</p>
                    <div class="contacto-info">
                        <i class="fas fa-phone"></i>
                        <span>+591 12345678</span>
                        <i class="fas fa-envelope"></i>
                        <span>servicio@furiamotor.com</span>
                    </div>
                </div>
            `;
        }
        abrirModal('modalOrden');
        return;
    }
    
    if (ordenActual) {
        const modalCuerpo = document.getElementById('modalOrdenCuerpo');
        if (modalCuerpo) {
            modalCuerpo.innerHTML = `
                <div class="info-orden-detalle">
                    <div class="info-icon success">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h4>Orden de Trabajo Activa</h4>
                    <div class="orden-info-grid">
                        <div class="orden-info-item">
                            <span class="label">Código de Orden:</span>
                            <span class="value">${escapeHtml(ordenActual.codigo_unico)}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="label">Fecha de Ingreso:</span>
                            <span class="value">${formatDate(ordenActual.fecha_ingreso)}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="label">Estado Actual:</span>
                            <span class="value estado">${ordenActual.estado_global || 'En proceso'}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="label">Vehículo:</span>
                            <span class="value">${escapeHtml(currentVehiculo.marca)} ${escapeHtml(currentVehiculo.modelo || '')} (${escapeHtml(currentVehiculo.placa)})</span>
                        </div>
                    </div>
                    <p>Tu vehículo está siendo atendido. Los técnicos están trabajando para tenerlo listo lo antes posible.</p>
                </div>
            `;
        }
        abrirModal('modalOrden');
    }
};

window.abrirFoto = function(url, caption) {
    const img = document.getElementById('fotoAmpliada');
    const captionDiv = document.getElementById('fotoCaption');
    
    if (img) img.src = url;
    if (captionDiv) {
        if (caption) {
            captionDiv.innerHTML = caption;
            captionDiv.style.display = 'block';
        } else {
            captionDiv.style.display = 'none';
        }
    }
    
    document.getElementById('modalFoto').classList.add('show');
};

function cerrarModalFoto() {
    document.getElementById('modalFoto').classList.remove('show');
    const img = document.getElementById('fotoAmpliada');
    if (img) img.src = '';
}

function abrirModal(modalId) {
    document.getElementById(modalId).classList.add('show');
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
                showToast('Selecciona un vehículo primero', 'warning');
            }
        });
    }
    
    // Cerrar modales al hacer clic fuera
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
    console.log('🚀 Inicializando avances.js');
    console.log('📡 API_BASE_URL:', window.API_BASE_URL);
    
    mostrarLoading(true);
    try {
        await cargarUsuarioActual();
        await cargarVehiculos();
        setupEventListeners();
        renderizarContenido();
        console.log('✅ avances.js inicializado correctamente');
    } catch (error) {
        console.error('Error en inicialización:', error);
    } finally {
        mostrarLoading(false);
    }
}

// Exponer funciones globales
window.cerrarSesion = cerrarSesion;
window.cerrarModal = cerrarModal;
window.verDetalleAvance = verDetalleAvance;
window.verInfoOrden = verInfoOrden;
window.abrirFoto = abrirFoto;
window.cerrarModalFoto = cerrarModalFoto;

document.addEventListener('DOMContentLoaded', inicializar);