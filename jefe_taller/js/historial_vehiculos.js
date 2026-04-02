// =====================================================
// HISTORIAL DE VEHÍCULOS - JEFE TALLER
// =====================================================

const API_URL = 'http://localhost:5000/api';
let userInfo = null;
let vehiculoActual = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    userInfo = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || (userInfo.rol !== 'jefe_taller' && userInfo.id_rol !== 3)) {
        window.location.href = '/';
        return false;
    }
    return true;
}

function initPage() {
    console.log('✅ Inicializando página');  // ← AGREGAR
    
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

function setupEventListeners() {
    console.log('✅ Configurando event listeners');  // ← AGREGAR
    
    const btnBuscar = document.getElementById('btnBuscar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const searchPlaca = document.getElementById('searchPlaca');
    
    console.log('btnBuscar:', btnBuscar);  // ← AGREGAR
    console.log('btnLimpiar:', btnLimpiar);  // ← AGREGAR
    console.log('searchPlaca:', searchPlaca);  // ← AGREGAR
    
    btnBuscar?.addEventListener('click', buscarHistorial);
    btnLimpiar?.addEventListener('click', limpiarBusqueda);
    
    searchPlaca?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarHistorial();
    });
}

// =====================================================
// BUSCAR HISTORIAL
// =====================================================

async function buscarHistorial() {
    console.log('🔍 Función buscarHistorial ejecutada');  // ← AGREGAR
    
    const placa = document.getElementById('searchPlaca')?.value.trim().toUpperCase();
    console.log('📝 Placa ingresada:', placa);  // ← AGREGAR
    
    if (!placa) {
        mostrarNotificacion('Ingresa una placa para buscar', 'warning');
        return;
    }
    
    const fechaDesde = document.getElementById('fechaDesde')?.value;
    const fechaHasta = document.getElementById('fechaHasta')?.value;
    const estado = document.getElementById('filterEstado')?.value;
    
    mostrarLoading(true);
    
    try {
        let url = `${API_URL}/jefe-taller/historial-vehiculo?placa=${encodeURIComponent(placa)}`;
        if (fechaDesde) url += `&fecha_desde=${fechaDesde}`;
        if (fechaHasta) url += `&fecha_hasta=${fechaHasta}`;
        if (estado) url += `&estado=${estado}`;
        
        console.log('🌐 URL:', url);  // ← AGREGAR
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        console.log('📡 Response status:', response.status);  // ← AGREGAR
        
        const data = await response.json();
        console.log('📦 Data:', data);  // ← AGREGAR
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al buscar historial');
        }
        
        if (!data.vehiculo) {
            mostrarResultadosVacio(placa);
            return;
        }
        
        vehiculoActual = data.vehiculo;
        renderizarResultados(data);
        
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarNotificacion(error.message, 'error');
        mostrarResultadosVacio(placa);
    } finally {
        mostrarLoading(false);
    }
}

function limpiarBusqueda() {
    document.getElementById('searchPlaca').value = '';
    document.getElementById('fechaDesde').value = '';
    document.getElementById('fechaHasta').value = '';
    document.getElementById('filterEstado').value = '';
    
    const container = document.getElementById('resultadosContainer');
    if (container) {
        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-search"></i>
                <p>Ingresa una placa para buscar el historial</p>
            </div>
        `;
    }
    vehiculoActual = null;
}

// =====================================================
// RENDERIZADO
// =====================================================

function renderizarResultados(data) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    const vehiculo = data.vehiculo;
    const ordenes = data.ordenes || [];
    const resumen = data.resumen || {};
    
    // Calcular estadísticas
    const totalServicios = ordenes.length;
    const totalGastado = ordenes.reduce((sum, o) => sum + (o.costo_total || 0), 0);
    
    let html = `
        <!-- Información del vehículo -->
        <div class="vehiculo-info-card">
            <div class="vehiculo-info-grid">
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Placa</span>
                    <span class="vehiculo-placa">${escapeHtml(vehiculo.placa)}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Marca / Modelo</span>
                    <span class="vehiculo-info-value">${escapeHtml(vehiculo.marca || 'N/A')} ${escapeHtml(vehiculo.modelo || '')}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Año</span>
                    <span class="vehiculo-info-value">${vehiculo.anio || 'N/A'}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Cliente</span>
                    <span class="vehiculo-info-value">${escapeHtml(vehiculo.cliente_nombre || 'No registrado')}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Teléfono</span>
                    <span class="vehiculo-info-value">${escapeHtml(vehiculo.cliente_telefono || 'No registrado')}</span>
                </div>
            </div>
        </div>
        
        <!-- Resumen de estadísticas -->
        <div class="resumen-stats">
            <div class="stat-card">
                <div class="stat-number">${totalServicios}</div>
                <div class="stat-label">Servicios realizados</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${resumen.entregados || 0}</div>
                <div class="stat-label">Completados</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${resumen.en_proceso || 0}</div>
                <div class="stat-label">En proceso</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">Bs. ${totalGastado.toLocaleString()}</div>
                <div class="stat-label">Total gastado</div>
            </div>
        </div>
    `;
    
    if (ordenes.length === 0) {
        html += `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>No hay órdenes de trabajo para este vehículo</p>
            </div>
        `;
    } else {
        html += `<div class="ordenes-lista">`;
        
        ordenes.forEach(orden => {
            const fechaIngreso = new Date(orden.fecha_ingreso).toLocaleDateString();
            const fechaEntrega = orden.fecha_salida ? new Date(orden.fecha_salida).toLocaleDateString() : 'Pendiente';
            
            html += `
                <div class="orden-historial-card">
                    <div class="orden-card-header">
                        <span class="orden-codigo">${escapeHtml(orden.codigo_unico)}</span>
                        <span class="orden-estado ${orden.estado_global}">${orden.estado_global}</span>
                        <span class="orden-fecha"><i class="far fa-calendar-alt"></i> ${fechaIngreso}</span>
                    </div>
                    <div class="orden-card-body">
                        <div class="orden-info-row">
                            <div class="orden-info-item">
                                <span class="orden-info-label">Fecha entrega</span>
                                <span class="orden-info-value">${fechaEntrega}</span>
                            </div>
                            <div class="orden-info-item">
                                <span class="orden-info-label">Jefe Operativo</span>
                                <span class="orden-info-value">${escapeHtml(orden.jefe_operativo_nombre || 'No registrado')}</span>
                            </div>
                            <div class="orden-info-item">
                                <span class="orden-info-label">Técnicos</span>
                                <span class="orden-info-value">${orden.tecnicos?.map(t => escapeHtml(t.nombre)).join(', ') || 'Sin asignar'}</span>
                            </div>
                        </div>
                        ${orden.diagnostico_inicial ? `
                            <div class="diagnosticos-preview">
                                <div class="diagnostico-item">
                                    <i class="fas fa-stethoscope"></i> 
                                    <strong>Diagnóstico:</strong> ${escapeHtml(orden.diagnostico_inicial.substring(0, 150))}${orden.diagnostico_inicial.length > 150 ? '...' : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="orden-card-footer">
                        <button class="btn-accion" onclick="verDetalleOrden(${orden.id})">
                            <i class="fas fa-eye"></i> Ver detalle
                        </button>
                        ${orden.tiene_fotos ? `
                            <button class="btn-accion btn-ver-fotos" onclick="verFotosOrden(${orden.id})">
                                <i class="fas fa-images"></i> Ver fotos
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

function mostrarResultadosVacio(placa) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-car-side"></i>
            <p>No se encontró el vehículo con placa <strong>${escapeHtml(placa)}</strong></p>
            <p style="font-size: 0.8rem; margin-top: 0.5rem;">Verifica que la placa sea correcta</p>
        </div>
    `;
}

function mostrarLoading(show) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    if (show) {
        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Buscando historial...</p>
            </div>
        `;
    }
}

// =====================================================
// MODALES
// =====================================================

async function verDetalleOrden(idOrden) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/detalle-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (!response.ok || !data.detalle) throw new Error(data.error || 'Error cargando detalle');
        
        const detalle = data.detalle;
        const modal = document.getElementById('modalDetalleOrden');
        const body = document.getElementById('modalDetalleBody');
        
        body.innerHTML = `
            <div class="detalle-orden">
                <div class="detalle-seccion">
                    <h4><i class="fas fa-info-circle"></i> Información General</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Código</span>
                            <span class="detalle-value">${escapeHtml(detalle.codigo_unico)}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Estado</span>
                            <span class="detalle-value ${detalle.estado_global}">${detalle.estado_global}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Fecha ingreso</span>
                            <span class="detalle-value">${new Date(detalle.fecha_ingreso).toLocaleString()}</span>
                        </div>
                        ${detalle.fecha_salida ? `
                            <div class="detalle-item">
                                <span class="detalle-label">Fecha salida</span>
                                <span class="detalle-value">${new Date(detalle.fecha_salida).toLocaleString()}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-car"></i> Vehículo</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <span class="detalle-label">Placa</span>
                            <span class="detalle-value">${escapeHtml(detalle.placa)}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Cliente</span>
                            <span class="detalle-value">${escapeHtml(detalle.cliente?.nombre || 'N/A')}</span>
                        </div>
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4>
                    <div class="detalle-descripcion">
                        ${escapeHtml(detalle.diagnostico_inicial || 'No registrado')}
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <h4><i class="fas fa-users"></i> Técnicos Asignados</h4>
                    <div class="orden-tecnicos">
                        ${detalle.tecnicos && detalle.tecnicos.length > 0 ? 
                            detalle.tecnicos.map(t => `<span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>`).join('') :
                            '<span>Sin técnicos asignados</span>'}
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.add('show');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cerrarModalDetalle() {
    document.getElementById('modalDetalleOrden').classList.remove('show');
}

async function verFotosOrden(idOrden) {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/orden-fotos/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('furia_token')}` }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error cargando fotos');
        
        const fotos = data.fotos || [];
        const modal = document.getElementById('modalFotos');
        const body = document.getElementById('modalFotosBody');
        
        if (fotos.length === 0) {
            body.innerHTML = '<div class="empty-state"><p>Esta orden no tiene fotos registradas</p></div>';
        } else {
            const camposMap = {
                'url_lateral_izquierda': 'Lateral Izquierdo',
                'url_lateral_derecha': 'Lateral Derecho',
                'url_foto_frontal': 'Frontal',
                'url_foto_trasera': 'Trasera',
                'url_foto_superior': 'Superior',
                'url_foto_inferior': 'Inferior',
                'url_foto_tablero': 'Tablero'
            };
            
            body.innerHTML = `
                <div class="fotos-grid">
                    ${fotos.map(foto => `
                        <div class="foto-item" onclick="verImagenAmpliada('${foto.url}')">
                            <img src="${foto.url}" alt="${camposMap[foto.tipo] || foto.tipo}" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                            <div class="foto-label">${camposMap[foto.tipo] || foto.tipo}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        modal.classList.add('show');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cerrarModalFotos() {
    document.getElementById('modalFotos').classList.remove('show');
}

function verImagenAmpliada(url) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.innerHTML = `
        <div class="modal-imagen-content">
            <button class="modal-imagen-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            <img src="${url}" alt="Imagen ampliada">
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    
    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && document.body.contains(toast)) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
        }
    }, 3000);
}

// Exponer funciones globales
window.verDetalleOrden = verDetalleOrden;
window.cerrarModalDetalle = cerrarModalDetalle;
window.verFotosOrden = verFotosOrden;
window.cerrarModalFotos = cerrarModalFotos;
window.verImagenAmpliada = verImagenAmpliada;