// =====================================================
// MIS VEHÍCULOS - TÉCNICO MECÁNICO
// FURIA MOTOR COMPANY SRL
// =====================================================

// Estado global
let vehiculosAsignados = [];
let token = null;

// Obtener token - USANDO LA MISMA CLAVE QUE LOGIN.JS
function getToken() {
    // Usar la misma clave que en login.js
    const localToken = localStorage.getItem('furia_token');
    if (localToken) return localToken;
    
    // Fallback por si usan otra clave
    const fallbackToken = localStorage.getItem('token');
    if (fallbackToken) return fallbackToken;
    
    return null;
}

// Mostrar fecha actual
function mostrarFechaActual() {
    const fechaSpan = document.getElementById('currentDate');
    if (fechaSpan) {
        const hoy = new Date();
        const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
        fechaSpan.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
}

// Mostrar toast
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) {
        // Si no existe el contenedor, crearlo
        const newContainer = document.createElement('div');
        newContainer.id = 'toast-container';
        document.body.appendChild(newContainer);
    }
    
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Recargar datos (función global para el botón)
window.recargarDatos = function() {
    cargarVehiculos();
};

// Verificar token antes de cargar
async function verificarToken() {
    if (!token) {
        console.error('No hay token');
        window.location.href = '/';
        return false;
    }
    
    try {
        const response = await fetch('/api/verify-token', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.valid) {
            console.error('Token inválido');
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            window.location.href = '/';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error verificando token:', error);
        window.location.href = '/';
        return false;
    }
}

// Cargar vehículos asignados
async function cargarVehiculos() {
    const grid = document.getElementById('vehiculosGrid');
    const loadingContainer = document.getElementById('loadingContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (grid) grid.innerHTML = '';
    if (loadingContainer) loadingContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    try {
        const response = await fetch('/tecnico/api/mis-vehiculos', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 401) {
            // Token inválido o expirado
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al cargar');
        }
        
        vehiculosAsignados = data.vehiculos || [];
        
        // Actualizar badge de notificaciones (trabajos en pausa)
        const badge = document.getElementById('notificacionesBadge');
        if (badge) {
            const enPausa = vehiculosAsignados.filter(v => v.estado_global === 'EnPausa').length;
            badge.textContent = enPausa;
            badge.style.display = enPausa > 0 ? 'flex' : 'none';
        }
        
        if (loadingContainer) loadingContainer.style.display = 'none';
        
        if (vehiculosAsignados.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        
        renderVehiculos();
        
    } catch (error) {
        console.error('Error:', error);
        if (loadingContainer) loadingContainer.style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'block';
            const emptyTitle = emptyState.querySelector('h3');
            const emptyText = emptyState.querySelector('p');
            if (emptyTitle) emptyTitle.textContent = 'Error al cargar';
            if (emptyText) emptyText.textContent = error.message;
        }
        showToast(error.message, 'error');
    }
}

// Renderizar tarjetas de vehículos
function renderVehiculos() {
    const grid = document.getElementById('vehiculosGrid');
    if (!grid) return;
    
    if (!vehiculosAsignados || vehiculosAsignados.length === 0) {
        grid.innerHTML = '<div class="no-data">No hay vehículos asignados</div>';
        return;
    }
    
    grid.innerHTML = vehiculosAsignados.map(vehiculo => {
        const estado = vehiculo.estado_global === 'EnProceso' ? 'proceso' : 'pausa';
        const estadoTexto = vehiculo.estado_global === 'EnProceso' ? 'En Proceso' : 'En Pausa';
        const estadoIcon = vehiculo.estado_global === 'EnProceso' ? 'fa-play-circle' : 'fa-pause-circle';
        
        const tieneDiagnostico = vehiculo.diagnostico_inicial && vehiculo.diagnostico_inicial !== '';
        const tieneAudio = vehiculo.diagnostico_audio_url;
        const tieneProblema = vehiculo.recepcion?.transcripcion_problema;
        
        return `
            <div class="vehiculo-card" data-orden-id="${vehiculo.orden_id}">
                <div class="card-header">
                    <div class="vehiculo-info">
                        <div class="vehiculo-icon">
                            <i class="fas fa-car"></i>
                        </div>
                        <div class="vehiculo-titulo">
                            <h3>${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</h3>
                            <span class="placa">${escapeHtml(vehiculo.vehiculo.placa)}</span>
                        </div>
                    </div>
                    <span class="estado-badge ${estado}">
                        <i class="fas ${estadoIcon}"></i> ${estadoTexto}
                    </span>
                </div>
                
                <div class="card-body">
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-tag"></i> Orden:</span>
                        <span class="detalle-value">${escapeHtml(vehiculo.codigo_unico)}</span>
                    </div>
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-calendar"></i> Ingreso:</span>
                        <span class="detalle-value">${formatFecha(vehiculo.fecha_ingreso)}</span>
                    </div>
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-road"></i> Kilometraje:</span>
                        <span class="detalle-value">${vehiculo.vehiculo.kilometraje?.toLocaleString() || 'N/A'} km</span>
                    </div>
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-user"></i> Cliente:</span>
                        <span class="detalle-value">${escapeHtml(vehiculo.cliente.nombre)}</span>
                    </div>
                    <div class="detalle-row">
                        <span class="detalle-label"><i class="fas fa-phone"></i> Contacto:</span>
                        <span class="detalle-value">${escapeHtml(vehiculo.cliente.contacto || 'No registrado')}</span>
                    </div>
                    
                    ${vehiculo.motivo_pausa ? `
                        <div class="motivo-pausa">
                            <i class="fas fa-info-circle"></i>
                            <strong>Motivo pausa:</strong> ${escapeHtml(vehiculo.motivo_pausa)}
                        </div>
                    ` : ''}
                    
                    ${tieneProblema ? `
                        <div class="diagnostico-preview">
                            <p><i class="fas fa-comment"></i> <strong>Problema reportado:</strong></p>
                            <div class="diagnostico-texto">${escapeHtml(truncateText(vehiculo.recepcion.transcripcion_problema, 100))}</div>
                        </div>
                    ` : ''}
                    
                    ${tieneDiagnostico ? `
                        <div class="diagnostico-preview">
                            <p><i class="fas fa-clipboard-list"></i> <strong>Instrucciones Jefe Taller:</strong></p>
                            <div class="diagnostico-texto">${escapeHtml(truncateText(vehiculo.diagnostico_inicial, 100))}</div>
                        </div>
                    ` : ''}
                    
                    ${tieneAudio ? `
                        <div class="audio-player">
                            <audio controls preload="none">
                                <source src="${vehiculo.diagnostico_audio_url}" type="audio/mpeg">
                                Tu navegador no soporta audio.
                            </audio>
                        </div>
                    ` : ''}
                </div>
                
                <div class="card-footer">
                    <button class="btn-sm btn-info-sm" onclick="verDetalle(${vehiculo.orden_id})">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                    
                    ${vehiculo.estado_global === 'EnPausa' ? `
                        <button class="btn-sm btn-success-sm" onclick="abrirReanudarModal(${vehiculo.orden_id})">
                            <i class="fas fa-play"></i> Reanudar
                        </button>
                    ` : `
                        <button class="btn-sm btn-outline-sm" onclick="abrirPausaModal(${vehiculo.orden_id})">
                            <i class="fas fa-pause"></i> Pausar
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// Formatear fecha
function formatFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const fecha = new Date(fechaStr);
        if (isNaN(fecha.getTime())) return 'N/A';
        return fecha.toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

// Truncar texto
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Escapar HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// MODAL DE PAUSA
// =====================================================
window.abrirPausaModal = function(ordenId) {
    document.getElementById('ordenIdPausa').value = ordenId;
    document.getElementById('motivoPausa').value = '';
    document.getElementById('pausaModal').classList.add('show');
};

window.cerrarPausaModal = function() {
    document.getElementById('pausaModal').classList.remove('show');
    document.getElementById('motivoPausa').value = '';
    document.getElementById('ordenIdPausa').value = '';
};

async function confirmarPausa() {
    const ordenId = document.getElementById('ordenIdPausa').value;
    const motivo = document.getElementById('motivoPausa').value.trim();
    
    if (!motivo) {
        showToast('Debes especificar el motivo de la pausa', 'warning');
        return;
    }
    
    cerrarPausaModal();
    showToast('Pausando trabajo...', 'info');
    
    try {
        const response = await fetch('/tecnico/api/pausar-trabajo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId), motivo })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Trabajo pausado correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al pausar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// MODAL DE REANUDAR
// =====================================================
window.abrirReanudarModal = function(ordenId) {
    const vehiculo = vehiculosAsignados.find(v => v.orden_id === ordenId);
    if (vehiculo) {
        const infoHtml = `
            <p><strong>Vehículo:</strong> ${escapeHtml(vehiculo.vehiculo.marca)} ${escapeHtml(vehiculo.vehiculo.modelo)}</p>
            <p><strong>Placa:</strong> ${escapeHtml(vehiculo.vehiculo.placa)}</p>
            <p><strong>Orden:</strong> ${escapeHtml(vehiculo.codigo_unico)}</p>
            ${vehiculo.motivo_pausa ? `<p><strong>Motivo de pausa:</strong> ${escapeHtml(vehiculo.motivo_pausa)}</p>` : ''}
        `;
        document.getElementById('reanudarInfo').innerHTML = infoHtml;
    }
    document.getElementById('ordenIdReanudar').value = ordenId;
    document.getElementById('reanudarModal').classList.add('show');
};

window.cerrarReanudarModal = function() {
    document.getElementById('reanudarModal').classList.remove('show');
    document.getElementById('reanudarInfo').innerHTML = '';
    document.getElementById('ordenIdReanudar').value = '';
};

async function confirmarReanudar() {
    const ordenId = document.getElementById('ordenIdReanudar').value;
    
    cerrarReanudarModal();
    showToast('Reanudando trabajo...', 'info');
    
    try {
        const response = await fetch('/tecnico/api/reanudar-trabajo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id_orden: parseInt(ordenId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Trabajo reanudado correctamente', 'success');
            cargarVehiculos();
        } else {
            showToast(data.error || 'Error al reanudar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

// =====================================================
// MODAL DE DETALLE - VERSIÓN MEJORADA
// =====================================================
window.verDetalle = async function(ordenId) {
    showToast('Cargando detalles...', 'info');
    
    try {
        const response = await fetch(`/tecnico/api/detalle-orden/${ordenId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('furia_token');
            localStorage.removeItem('furia_user');
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error al cargar detalle');
        }
        
        const detalle = data.detalle;
        
        // Verificar qué datos llegaron (para depuración)
        console.log('Datos recibidos:', detalle);
        
        const fotos = detalle.recepcion?.fotos || {};
        const fotosArray = Object.entries(fotos).filter(([_, url]) => url && url !== '');
        
        // Formatear kilometraje
        const kilometraje = detalle.vehiculo?.kilometraje ? 
            `${parseInt(detalle.vehiculo.kilometraje).toLocaleString()} km` : 'N/A';
        
        // Formatear año
        const anio = detalle.vehiculo?.anio && detalle.vehiculo.anio !== 'N/A' ? 
            detalle.vehiculo.anio : 'No especificado';
        
        // Obtener marca y modelo
        const marcaModelo = `${detalle.vehiculo?.marca || ''} ${detalle.vehiculo?.modelo || ''}`.trim() || 'No especificado';
        
        const detalleHtml = `
            <div style="display: grid; gap: 1rem;">
                <!-- Información de la Orden -->
                <div class="modal-section">
                    <h3><i class="fas fa-clipboard-list"></i> Información de la Orden</h3>
                    <div class="detalle-grid">
                        <div><strong>Código:</strong> ${escapeHtml(detalle.orden?.codigo_unico || 'N/A')}</div>
                        <div><strong>Estado:</strong> 
                            <span class="estado-badge ${detalle.orden?.estado_global === 'EnProceso' ? 'proceso' : 'pausa'}" style="display: inline-flex; font-size: 0.7rem;">
                                ${detalle.orden?.estado_global === 'EnProceso' ? 'En Proceso' : 'En Pausa'}
                            </span>
                        </div>
                        <div><strong>Fecha Ingreso:</strong> ${formatFecha(detalle.orden?.fecha_ingreso)}</div>
                    </div>
                </div>
                
                <!-- Información del vehículo -->
                <div class="modal-section">
                    <h3><i class="fas fa-car" style="color: var(--rojo-primario);"></i> Datos del Vehículo</h3>
                    <div class="detalle-grid">
                        <div><strong>Placa:</strong> ${escapeHtml(detalle.vehiculo?.placa || 'No registrada')}</div>
                        <div><strong>Marca/Modelo:</strong> ${escapeHtml(marcaModelo)}</div>
                        <div><strong>Año:</strong> ${escapeHtml(anio)}</div>
                        <div><strong>Kilometraje:</strong> ${kilometraje}</div>
                        ${detalle.vehiculo?.color ? `<div><strong>Color:</strong> ${escapeHtml(detalle.vehiculo.color)}</div>` : ''}
                    </div>
                </div>
                
                <!-- Información del cliente -->
                <div class="modal-section">
                    <h3><i class="fas fa-user" style="color: var(--rojo-primario);"></i> Datos del Cliente</h3>
                    <div class="detalle-grid">
                        <div><strong>Nombre:</strong> ${escapeHtml(detalle.cliente?.nombre || 'No registrado')}</div>
                        <div><strong>Teléfono:</strong> ${escapeHtml(detalle.cliente?.telefono || 'No registrado')}</div>
                        <div><strong>Email:</strong> ${escapeHtml(detalle.cliente?.email || 'No registrado')}</div>
                    </div>
                </div>
                
                <!-- Problema reportado por el cliente -->
                <div class="modal-section">
                    <h3><i class="fas fa-comment" style="color: var(--rojo-primario);"></i> Problema Reportado</h3>
                    <div class="diagnostico-box">
                        <p>${escapeHtml(detalle.recepcion?.transcripcion_problema || 'No hay descripción del problema')}</p>
                        ${detalle.recepcion?.audio_url ? `
                            <div class="audio-player" style="margin-top: 0.75rem;">
                                <audio controls preload="none">
                                    <source src="${detalle.recepcion.audio_url}" type="audio/mpeg">
                                    Tu navegador no soporta audio.
                                </audio>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Instrucciones del Jefe de Taller -->
                <div class="modal-section">
                    <h3><i class="fas fa-clipboard-list" style="color: var(--rojo-primario);"></i> Instrucciones del Jefe de Taller</h3>
                    <div class="diagnostico-box">
                        <p>${escapeHtml(detalle.diagnostico_inicial || 'No hay instrucciones registradas')}</p>
                        ${detalle.diagnostico_audio_url ? `
                            <div class="audio-player" style="margin-top: 0.75rem;">
                                <audio controls preload="none">
                                    <source src="${detalle.diagnostico_audio_url}" type="audio/mpeg">
                                    Tu navegador no soporta audio.
                                </audio>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Fotos del vehículo -->
                ${fotosArray.length > 0 ? `
                    <div class="modal-section">
                        <h3><i class="fas fa-images" style="color: var(--rojo-primario);"></i> Fotos del Vehículo (${fotosArray.length})</h3>
                        <div class="fotos-grid">
                            ${fotosArray.map(([nombre, url]) => `
                                <div class="foto-item" onclick="verFoto('${url}')">
                                    <img src="${url}" alt="${nombre}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238E8E93\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Crect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'%3E%3C/rect%3E%3Ccircle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'%3E%3C/circle%3E%3Cpolyline points=\'21 15 16 10 5 21\'%3E%3C/polyline%3E%3C/svg%3E'">
                                    <span>${escapeHtml(nombre)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : `
                    <div class="modal-section">
                        <h3><i class="fas fa-images" style="color: var(--rojo-primario);"></i> Fotos del Vehículo</h3>
                        <div class="diagnostico-box" style="text-align: center; color: var(--gris-texto);">
                            <i class="fas fa-camera" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                            No hay fotos disponibles de este vehículo
                        </div>
                    </div>
                `}
            </div>
        `;
        
        document.getElementById('detalleBody').innerHTML = detalleHtml;
        document.getElementById('detalleModal').classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message, 'error');
    }
};

// Ver foto en grande
window.verFoto = function(url) {
    const modalHtml = `
        <div class="modal show" id="fotoModal" onclick="cerrarFotoModal()">
            <div class="modal-content modal-lg" style="max-width: 90%; background: transparent;" onclick="event.stopPropagation()">
                <div style="text-align: right; margin-bottom: 0.5rem;">
                    <button class="modal-close" onclick="cerrarFotoModal()" style="background: var(--bg-card); padding: 0.3rem 0.8rem; border-radius: var(--radius-full);">&times;</button>
                </div>
                <img src="${url}" style="width: 100%; border-radius: var(--radius-lg);">
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('fotoModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.cerrarFotoModal = function() {
    const modal = document.getElementById('fotoModal');
    if (modal) modal.remove();
};

window.cerrarDetalleModal = function() {
    document.getElementById('detalleModal').classList.remove('show');
};

// =====================================================
// CIERRE DE SESIÓN - USANDO LA MISMA CLAVE
// =====================================================
window.cerrarSesion = function() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    token = getToken();
    
    console.log('Token encontrado:', token ? 'Sí' : 'No');
    
    if (!token) {
        console.error('No se encontró token');
        window.location.href = '/';
        return;
    }
    
    // Verificar token antes de cargar datos
    const tokenValido = await verificarToken();
    if (!tokenValido) return;
    
    mostrarFechaActual();
    await cargarVehiculos();
    
    // Configurar botones de modales
    const confirmarPausaBtn = document.getElementById('confirmarPausaBtn');
    if (confirmarPausaBtn) {
        confirmarPausaBtn.onclick = confirmarPausa;
    }
    
    const confirmarReanudarBtn = document.getElementById('confirmarReanudarBtn');
    if (confirmarReanudarBtn) {
        confirmarReanudarBtn.onclick = confirmarReanudar;
    }
    
    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
    
    // Refrescar datos cada 30 segundos
    setInterval(() => {
        if (document.visibilityState === 'visible' && token) {
            cargarVehiculos();
        }
    }, 30000);
});