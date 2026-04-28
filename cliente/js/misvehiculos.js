// =====================================================
// MISVEHICULOS.JS - CLIENTE
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/cliente';
let currentUser = null;
let vehiculos = [];
let currentVehiculoId = null;

// =====================================================
// FUNCIONES DE UTILIDAD
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
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('es-BO');
    } catch {
        return dateStr;
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
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

function getEstadoTexto(estado) {
    const estados = {
        'EnRecepcion': 'En Recepción',
        'EnDiagnostico': 'En Diagnóstico',
        'CotizacionEnviada': 'Cotización Enviada',
        'EnReparacion': 'En Reparación',
        'ControlCalidad': 'Control de Calidad',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado'
    };
    return estados[estado] || estado;
}

function getProgresoPorEstado(estado) {
    const progreso = {
        'EnRecepcion': 10,
        'EnDiagnostico': 25,
        'CotizacionEnviada': 40,
        'EnReparacion': 60,
        'ControlCalidad': 80,
        'Finalizado': 95,
        'Entregado': 100
    };
    return progreso[estado] || 0;
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarVehiculos() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        
        let url = `${API_URL}/mis-vehiculos`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            let vehiculosList = data.vehiculos || [];
            
            if (search) {
                vehiculosList = vehiculosList.filter(v => 
                    (v.placa || '').toLowerCase().includes(search) ||
                    (v.marca || '').toLowerCase().includes(search) ||
                    (v.modelo || '').toLowerCase().includes(search)
                );
            }
            
            vehiculos = vehiculosList;
            renderizarVehiculos(vehiculosList);
        } else {
            showToast(data.error || 'Error al cargar vehículos', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarVehiculos(vehiculosList) {
    const container = document.getElementById('vehiculosGrid');
    if (!container) return;
    
    if (vehiculosList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-car"></i>
                <p>No tienes vehículos registrados</p>
                <small>Cuando lleves tu vehículo al taller, aparecerá aquí</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = vehiculosList.map(vehiculo => {
        const progreso = getProgresoPorEstado(vehiculo.estado_global);
        
        return `
            <div class="vehiculo-card" onclick="verDetalleVehiculo(${vehiculo.id})">
                <div class="vehiculo-header">
                    <div class="vehiculo-placa">
                        <i class="fas fa-car"></i>
                        ${escapeHtml(vehiculo.placa)}
                    </div>
                    <span class="vehiculo-estado estado-${vehiculo.estado_global}">
                        ${getEstadoTexto(vehiculo.estado_global)}
                    </span>
                </div>
                <div class="vehiculo-body">
                    <div class="vehiculo-info">
                        <div class="info-item">
                            <i class="fas fa-tag"></i>
                            <span>${escapeHtml(vehiculo.marca)} ${escapeHtml(vehiculo.modelo)}</span>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-calendar"></i>
                            <span>Ingreso: ${formatDate(vehiculo.fecha_ingreso)}</span>
                        </div>
                    </div>
                    
                    <div class="progreso-container">
                        <div class="progreso-label">
                            <span>Progreso</span>
                            <span>${progreso}%</span>
                        </div>
                        <div class="progreso-bar">
                            <div class="progreso-fill" style="width: ${progreso}%"></div>
                        </div>
                    </div>
                    
                    <div class="vehiculo-footer">
                        <button class="btn-ver-detalle" onclick="event.stopPropagation(); verDetalleVehiculo(${vehiculo.id})">
                            <i class="fas fa-eye"></i> Ver detalles
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// DETALLE DE VEHÍCULO
// =====================================================

async function verDetalleVehiculo(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-vehiculo/${id}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentVehiculoId = id;
            mostrarDetalle(data.detalle);
        } else {
            showToast(data.error || 'Error al cargar detalle', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarDetalle(detalle) {
    // Información básica
    const progreso = getProgresoPorEstado(detalle.estado_global);
    
    // Fotos
    const fotosHtml = generarFotosHtml(detalle.fotos);
    
    // Timeline de avances (simulado basado en estado)
    const timelineHtml = generarTimelineHtml(detalle);
    
    // Verificar si tiene cotización
    const tieneCotizacion = detalle.estado_global === 'CotizacionEnviado' || 
                           detalle.estado_global === 'EnReparacion' ||
                           detalle.estado_global === 'ControlCalidad';
    
    const modalBody = document.getElementById('modalDetalleBody');
    modalBody.innerHTML = `
        <div class="detalle-seccion">
            <h4><i class="fas fa-info-circle"></i> Información General</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Código de Trabajo</span>
                    <span class="detalle-value">${escapeHtml(detalle.codigo_unico || 'N/A')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Estado</span>
                    <span class="detalle-value">${getEstadoTexto(detalle.estado_global)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Fecha de Ingreso</span>
                    <span class="detalle-value">${formatDateTime(detalle.fecha_ingreso)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Progreso</span>
                    <span class="detalle-value">${progreso}%</span>
                </div>
            </div>
            <div class="progreso-bar" style="margin-top: 0.5rem;">
                <div class="progreso-fill" style="width: ${progreso}%"></div>
            </div>
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-user"></i> Datos del Cliente</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Nombre</span>
                    <span class="detalle-value">${escapeHtml(detalle.cliente_nombre || 'N/A')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Teléfono</span>
                    <span class="detalle-value">${escapeHtml(detalle.cliente_telefono || 'N/A')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Email</span>
                    <span class="detalle-value">${escapeHtml(detalle.cliente_email || 'N/A')}</span>
                </div>
            </div>
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-car"></i> Datos del Vehículo</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Placa</span>
                    <span class="detalle-value">${escapeHtml(detalle.placa)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Marca/Modelo</span>
                    <span class="detalle-value">${escapeHtml(detalle.marca)} ${escapeHtml(detalle.modelo)}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Año</span>
                    <span class="detalle-value">${detalle.anio || 'N/A'}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Kilometraje</span>
                    <span class="detalle-value">${detalle.kilometraje?.toLocaleString() || '0'} km</span>
                </div>
            </div>
        </div>
        
        ${fotosHtml ? `
            <div class="detalle-seccion">
                <h4><i class="fas fa-camera"></i> Registro Fotográfico</h4>
                ${fotosHtml}
            </div>
        ` : ''}
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-pencil-alt"></i> Descripción del Problema</h4>
            <div class="detalle-descripcion">
                ${escapeHtml(detalle.transcripcion_problema || 'No se registró descripción')}
            </div>
            ${detalle.audio_url ? `
                <div class="detalle-audio">
                    <audio controls>
                        <source src="${detalle.audio_url}" type="audio/wav">
                        Tu navegador no soporta audio.
                    </audio>
                </div>
            ` : ''}
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-chart-line"></i> Avance de la Reparación</h4>
            ${timelineHtml}
        </div>
    `;
    
    // Mostrar/ocultar botón de cotización
    const btnCotizacion = document.getElementById('btnVerCotizacion');
    if (btnCotizacion) {
        btnCotizacion.style.display = tieneCotizacion ? 'flex' : 'none';
    }
    
    abrirModal('modalDetalleVehiculo');
}

function generarFotosHtml(fotos) {
    if (!fotos) return '';
    
    const camposFotos = [
        { campo: 'url_lateral_izquierda', label: 'Lateral Izquierdo' },
        { campo: 'url_lateral_derecha', label: 'Lateral Derecho' },
        { campo: 'url_foto_frontal', label: 'Frontal' },
        { campo: 'url_foto_trasera', label: 'Trasera' },
        { campo: 'url_foto_superior', label: 'Superior' },
        { campo: 'url_foto_inferior', label: 'Inferior' },
        { campo: 'url_foto_tablero', label: 'Tablero' }
    ];
    
    const fotosExistentes = camposFotos.filter(f => {
        const url = fotos[f.campo];
        return url && url !== 'null' && url !== 'None' && url !== '';
    });
    
    if (fotosExistentes.length === 0) return '';
    
    return `
        <div class="detalle-fotos">
            ${fotosExistentes.map(f => `
                <div class="detalle-foto" onclick="verImagenAmpliada('${fotos[f.campo]}', '${f.label}')">
                    <img src="${fotos[f.campo]}" alt="${f.label}" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                    <div class="detalle-foto-label">${f.label}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function generarTimelineHtml(detalle) {
    // Estados en orden
    const estados = [
        { key: 'EnRecepcion', label: 'Recepción del Vehículo', desc: 'Vehículo ingresado al taller' },
        { key: 'EnDiagnostico', label: 'Diagnóstico', desc: 'Técnico realizando diagnóstico' },
        { key: 'CotizacionEnviada', label: 'Cotización', desc: 'Cotización enviada al cliente' },
        { key: 'EnReparacion', label: 'Reparación', desc: 'Vehículo en proceso de reparación' },
        { key: 'ControlCalidad', label: 'Control de Calidad', desc: 'Verificación final de la reparación' },
        { key: 'Finalizado', label: 'Finalizado', desc: 'Reparación completada' },
        { key: 'Entregado', label: 'Entregado', desc: 'Vehículo entregado al cliente' }
    ];
    
    const estadoActual = detalle.estado_global;
    let encontrado = false;
    
    const timelineItems = estados.map(estado => {
        const isCompleted = encontrado ? false : (estado.key === estadoActual || encontrado);
        if (estado.key === estadoActual) encontrado = true;
        
        let fecha = '';
        if (estado.key === 'EnRecepcion' && detalle.fecha_ingreso) {
            fecha = formatDate(detalle.fecha_ingreso);
        }
        
        return `
            <div class="timeline-item">
                <div class="timeline-dot ${isCompleted ? 'completed' : ''} ${estado.key === estadoActual ? 'current' : ''}"></div>
                <div class="timeline-content">
                    <div class="timeline-title">${estado.label}</div>
                    ${fecha ? `<div class="timeline-date">${fecha}</div>` : ''}
                    <div class="timeline-desc">${estado.desc}</div>
                </div>
            </div>
        `;
    }).join('');
    
    return `<div class="timeline">${timelineItems}</div>`;
}

function verImagenAmpliada(url, label) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.innerHTML = `
        <div class="modal-imagen-content">
            <button class="modal-imagen-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            <img src="${url}" alt="${label}">
            <p>${label}</p>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function verCotizacion() {
    if (currentVehiculoId) {
        window.location.href = `cotizaciones.html?id=${currentVehiculoId}`;
    }
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
        
        const response = await fetch(`${API_URL}/perfil`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return null;
        }
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.usuario;
            
            // Actualizar nombre en sidebar
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) {
                userNameSpan.textContent = currentUser.nombre || currentUser.placa || 'Cliente';
            }
            
            // Mostrar fecha
            const fechaElement = document.getElementById('currentDate');
            if (fechaElement) {
                const hoy = new Date();
                fechaElement.textContent = hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
            }
            
            return currentUser;
        }
        
        return null;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = '/';
        return null;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarVehiculos();
            showToast('Actualizando...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarVehiculos());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarVehiculos());
    }
    
    // Cerrar modales
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando misvehiculos.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarVehiculos();
    setupEventListeners();
    
    console.log('✅ misvehiculos.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalleVehiculo = verDetalleVehiculo;
window.verCotizacion = verCotizacion;
window.verImagenAmpliada = verImagenAmpliada;
window.cerrarModal = cerrarModal;

document.addEventListener('DOMContentLoaded', inicializar);