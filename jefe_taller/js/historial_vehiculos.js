// =====================================================
// CONFIGURACIÓN DE API - FUNCIONA EN LOCAL Y PRODUCCIÓN
// =====================================================
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.')) {
        console.log('📡 Modo DESARROLLO - Usando localhost:5000');
        return 'http://localhost:5000';
    }
    console.log('📡 Modo PRODUCCIÓN - Usando URL relativa');
    return '';
})();

// =====================================================
// HISTORIAL DE VEHÍCULOS - JEFE TALLER
// VERSIÓN CORREGIDA
// =====================================================

let userInfo = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Historial - Jefe Taller...');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    mostrarFechaActual();
    
    // Cargar últimas órdenes automáticamente
    await cargarUltimasOrdenes();
    
    configurarEventListeners();
    setupModalTabs();
});

// =====================================================
// CHECK AUTH
// =====================================================
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userInfoRaw = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = API_BASE_URL + '/';
        return false;
    }
    
    try {
        userInfo = JSON.parse(userInfoRaw || '{}');
        
        const verifyResponse = await fetch(`${API_BASE_URL}/api/verify-token`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!verifyResponse.ok) {
            localStorage.clear();
            window.location.href = API_BASE_URL + '/';
            return false;
        }
        
        const verifyData = await verifyResponse.json();
        if (verifyData.user) {
            userInfo = verifyData.user;
            localStorage.setItem('furia_user', JSON.stringify(userInfo));
        }
        
        const roles = userInfo.roles || [];
        const tieneRolJefeTaller = roles.includes('jefe_taller');
        
        if (!tieneRolJefeTaller) {
            if (roles.includes('jefe_operativo')) {
                window.location.href = API_BASE_URL + '/jefe_operativo/dashboard.html';
            } else {
                window.location.href = API_BASE_URL + '/';
            }
            return false;
        }
        
        console.log('✅ Autenticación exitosa - Jefe Taller');
        return true;
        
    } catch (error) {
        console.error('Error en checkAuth:', error);
        window.location.href = API_BASE_URL + '/';
        return false;
    }
}

// =====================================================
// CARGAR ÚLTIMAS 10 ÓRDENES
// =====================================================
async function cargarUltimasOrdenes() {
    const container = document.getElementById('resultadosContainer');
    
    if (!container) {
        console.error('❌ No se encontró resultadosContainer');
        return;
    }
    
    try {
        mostrarLoading(container, 'Cargando últimas órdenes...');
        
        const token = localStorage.getItem('furia_token');
        console.log('📡 Llamando a /api/jefe-taller/ultimas-ordenes');
        
        const response = await fetch(`${API_BASE_URL}/api/jefe-taller/ultimas-ordenes?limite=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('📡 Respuesta status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📡 Datos recibidos:', data);
        
        // ✅ Verificar que la respuesta tenga la estructura esperada
        if (data.success) {
            const ordenes = data.ordenes || [];
            const resumen = data.resumen || {
                total: 0,
                entregados: 0,
                en_proceso: 0,
                en_pausa: 0,
                en_recepcion: 0
            };
            
            mostrarUltimasOrdenes(ordenes, resumen);
        } else {
            mostrarError(container, data.error || 'Error al cargar órdenes');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarError(container, 'Error de conexión al servidor: ' + error.message);
    }
}

// =====================================================
// MOSTRAR ÚLTIMAS ÓRDENES
// =====================================================
function mostrarUltimasOrdenes(ordenes, resumen) {
    const container = document.getElementById('resultadosContainer');
    
    if (!container) return;
    
    if (!ordenes || ordenes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>No hay órdenes recientes</h3>
                <p>Las últimas órdenes aparecerán aquí automáticamente.</p>
            </div>
        `;
        return;
    }
    
    // Asegurar que resumen tenga valores por defecto
    const total = resumen.total || ordenes.length;
    const entregados = resumen.entregados || 0;
    const en_proceso = resumen.en_proceso || 0;
    const en_pausa = resumen.en_pausa || 0;
    const en_recepcion = resumen.en_recepcion || 0;
    
    let html = `
        <div class="ultimas-ordenes-banner">
            <i class="fas fa-clock"></i>
            <span>Últimas ${ordenes.length} órdenes de trabajo</span>
            <small><i class="fas fa-sync-alt"></i> Actualizado automáticamente</small>
        </div>
        
        <div class="resumen-stats">
            <div class="stat-card">
                <div class="stat-number">${total}</div>
                <div class="stat-label">Total</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${entregados}</div>
                <div class="stat-label">Entregados</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${en_proceso}</div>
                <div class="stat-label">En Proceso</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${en_pausa}</div>
                <div class="stat-label">En Pausa</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${en_recepcion}</div>
                <div class="stat-label">En Recepción</div>
            </div>
        </div>
        
        <div class="ordenes-lista">
    `;
    
    ordenes.forEach(orden => {
        const estadoClass = getEstadoClass(orden.estado_global);
        const estadoText = getEstadoText(orden.estado_global);
        const fechaIngreso = formatFecha(orden.fecha_ingreso);
        const vehiculoDisplay = orden.vehiculo_info || `${orden.marca || ''} ${orden.modelo || ''} (${orden.placa || 'N/A'})`.trim() || 'Vehículo sin datos';
        
        html += `
            <div class="orden-historial-card">
                <div class="orden-card-header">
                    <div class="orden-codigo">
                        <i class="fas fa-hashtag"></i> ${escapeHtml(orden.codigo_unico || 'N/A')}
                    </div>
                    <div class="orden-estado ${estadoClass}">${estadoText}</div>
                    <div class="orden-fecha">
                        <i class="fas fa-calendar-alt"></i> ${fechaIngreso}
                    </div>
                </div>
                <div class="orden-card-body">
                    <div class="orden-info-row">
                        <div class="orden-info-item">
                            <span class="orden-info-label">Vehículo</span>
                            <span class="orden-info-value"><strong>${escapeHtml(vehiculoDisplay)}</strong></span>
                        </div>
                        <div class="orden-info-item">
                            <span class="orden-info-label">Jefe Operativo</span>
                            <span class="orden-info-value">${escapeHtml(orden.jefe_operativo_nombre || 'No asignado')}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="orden-info-label">Técnicos</span>
                            <span class="orden-info-value">${orden.tecnicos?.map(t => escapeHtml(t.nombre)).join(', ') || 'Sin asignar'}</span>
                        </div>
                    </div>
                    ${orden.diagnostico_inicial ? `
                        <div class="orden-info-item">
                            <span class="orden-info-label">Diagnóstico</span>
                            <span class="orden-info-value">${escapeHtml(orden.diagnostico_inicial.substring(0, 80))}${orden.diagnostico_inicial.length > 80 ? '...' : ''}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="orden-card-footer">
                    <button class="btn-accion" onclick="verDetalleCompletoOrden(${orden.id})">
                        <i class="fas fa-eye"></i> Ver Detalle Completo
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

// =====================================================
// BUSCAR POR PLACA
// =====================================================
async function buscarHistorial() {
    const placa = document.getElementById('searchPlaca').value.trim().toUpperCase();
    
    if (!placa) {
        await cargarUltimasOrdenes();
        return;
    }
    
    const container = document.getElementById('resultadosContainer');
    
    try {
        mostrarLoading(container, `Buscando historial de ${placa}...`);
        
        const token = localStorage.getItem('furia_token');
        const estado = document.getElementById('filterEstado').value;
        const fechaDesde = document.getElementById('fechaDesde').value;
        const fechaHasta = document.getElementById('fechaHasta').value;
        
        let url = `${API_BASE_URL}/api/jefe-taller/historial-vehiculo?placa=${encodeURIComponent(placa)}`;
        if (estado) url += `&estado=${estado}`;
        if (fechaDesde) url += `&fecha_desde=${fechaDesde}`;
        if (fechaHasta) url += `&fecha_hasta=${fechaHasta}`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Error al buscar');
        
        const data = await response.json();
        
        if (data.success) {
            if (data.vehiculo) {
                mostrarHistorialVehiculo(data);
            } else {
                mostrarSinResultados(container, `No se encontró el vehículo con placa ${placa}`);
            }
        } else {
            mostrarError(container, data.error || 'Error al buscar');
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarError(container, 'Error de conexión al servidor');
    }
}

// =====================================================
// MOSTRAR HISTORIAL DE VEHÍCULO
// =====================================================
function mostrarHistorialVehiculo(data) {
    const container = document.getElementById('resultadosContainer');
    const vehiculo = data.vehiculo;
    const ordenes = data.ordenes || [];
    const resumen = data.resumen || {};
    
    let html = `
        <div style="margin-bottom: 1rem;">
            <button class="btn-limpiar" onclick="cargarUltimasOrdenes()">
                <i class="fas fa-arrow-left"></i> Ver últimas órdenes
            </button>
        </div>
        
        <div class="vehiculo-info-card">
            <div class="vehiculo-info-grid">
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Placa</span>
                    <span class="vehiculo-placa">${escapeHtml(vehiculo.placa)}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Marca/Modelo</span>
                    <span class="vehiculo-info-value">${escapeHtml(vehiculo.marca || 'N/A')} ${escapeHtml(vehiculo.modelo || '')}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Año</span>
                    <span class="vehiculo-info-value">${vehiculo.anio || 'N/A'}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Kilometraje</span>
                    <span class="vehiculo-info-value">${vehiculo.kilometraje?.toLocaleString() || 'N/A'} km</span>
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
        
        <div class="resumen-stats">
            <div class="stat-card">
                <div class="stat-number">${resumen.total || ordenes.length}</div>
                <div class="stat-label">Total Servicios</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${resumen.entregados || 0}</div>
                <div class="stat-label">Completados</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${(resumen.en_proceso || 0) + (resumen.en_pausa || 0)}</div>
                <div class="stat-label">En Taller</div>
            </div>
        </div>
    `;
    
    if (ordenes.length > 0) {
        html += `<div class="ordenes-lista">`;
        
        ordenes.forEach(orden => {
            const estadoClass = getEstadoClass(orden.estado_global);
            const estadoText = getEstadoText(orden.estado_global);
            const fechaIngreso = formatFecha(orden.fecha_ingreso);
            
            html += `
                <div class="orden-historial-card">
                    <div class="orden-card-header">
                        <div class="orden-codigo">
                            <i class="fas fa-hashtag"></i> ${escapeHtml(orden.codigo_unico || 'N/A')}
                        </div>
                        <div class="orden-estado ${estadoClass}">${estadoText}</div>
                        <div class="orden-fecha">
                            <i class="fas fa-calendar-alt"></i> ${fechaIngreso}
                        </div>
                    </div>
                    <div class="orden-card-body">
                        ${orden.diagnostico_inicial ? `
                            <div class="orden-info-item">
                                <span class="orden-info-label">Diagnóstico Inicial</span>
                                <span class="orden-info-value">${escapeHtml(orden.diagnostico_inicial.substring(0, 100))}${orden.diagnostico_inicial.length > 100 ? '...' : ''}</span>
                            </div>
                        ` : ''}
                        <div class="orden-info-item">
                            <span class="orden-info-label">Jefe Operativo</span>
                            <span class="orden-info-value">${escapeHtml(orden.jefe_operativo_nombre || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="orden-info-label">Técnicos</span>
                            <span class="orden-info-value">${orden.tecnicos?.map(t => escapeHtml(t.nombre)).join(', ') || 'Sin asignar'}</span>
                        </div>
                    </div>
                    <div class="orden-card-footer">
                        <button class="btn-accion" onclick="verDetalleCompletoOrden(${orden.id})">
                            <i class="fas fa-eye"></i> Ver Detalle Completo
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    } else {
        html += `
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <h3>Sin historial de servicios</h3>
                <p>Este vehículo no tiene órdenes de trabajo registradas.</p>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// =====================================================
// VER DETALLE COMPLETO
// =====================================================
window.verDetalleCompletoOrden = async function(idOrden) {
    const modal = document.getElementById('modalDetalleOrden');
    if (!modal) return;
    
    try {
        modal.classList.add('show');
        
        const token = localStorage.getItem('furia_token');
        const response = await fetch(`${API_BASE_URL}/api/jefe-taller/detalle-completo-orden/${idOrden}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Error al cargar detalle');
        
        const data = await response.json();
        
        if (data.success && data.detalle) {
            cargarDetalleEnTabs(data.detalle);
        } else {
            mostrarNotificacion(data.error || 'Error al cargar detalle', 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error de conexión al servidor', 'error');
    }
};

// =====================================================
// CARGAR DETALLE EN TABS (VERSIÓN SIMPLIFICADA)
// =====================================================
function cargarDetalleEnTabs(detalle) {
    // Tab 1: Cliente y Vehículo
    const clienteVehiculoContainer = document.getElementById('clienteVehiculoContent');
    if (clienteVehiculoContainer) {
        clienteVehiculoContainer.innerHTML = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-user-circle"></i> Datos del Cliente</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Nombre</span>
                        <span class="detalle-value">${escapeHtml(detalle.cliente_nombre || 'No registrado')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Teléfono</span>
                        <span class="detalle-value">${escapeHtml(detalle.cliente_telefono || 'No registrado')}</span>
                    </div>
                </div>
            </div>
            <div class="detalle-seccion">
                <h4><i class="fas fa-car"></i> Datos del Vehículo</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Placa</span>
                        <span class="detalle-value">${escapeHtml(detalle.placa || 'N/A')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Marca/Modelo</span>
                        <span class="detalle-value">${escapeHtml(detalle.marca || 'N/A')} ${escapeHtml(detalle.modelo || '')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Año/Km</span>
                        <span class="detalle-value">${detalle.anio || 'N/A'} / ${detalle.kilometraje?.toLocaleString() || '0'} km</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Tab 2: Recepción
    const recepcionContainer = document.getElementById('recepcionContent');
    if (recepcionContainer) {
        recepcionContainer.innerHTML = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-clipboard-list"></i> Recepción</h4>
                <div class="detalle-descripcion">
                    <strong>Problema:</strong><br>
                    ${escapeHtml(detalle.descripcion_problema || 'No se registró descripción')}
                </div>
                ${detalle.audio_recepcion ? `
                    <div class="audio-player">
                        <audio controls src="${detalle.audio_recepcion}"></audio>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    // Tab 3: Diagnósticos
    const diagnosticosContainer = document.getElementById('diagnosticosContent');
    if (diagnosticosContainer) {
        let diagnosticosHtml = '';
        
        if (detalle.diagnostico_inicial) {
            diagnosticosHtml += `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4>
                    <div class="detalle-descripcion">${escapeHtml(detalle.diagnostico_inicial)}</div>
                </div>
            `;
        }
        
        if (!diagnosticosHtml) {
            diagnosticosHtml = '<div class="empty-state"><p>No hay diagnósticos registrados</p></div>';
        }
        
        diagnosticosContainer.innerHTML = diagnosticosHtml;
    }
    
    // Tab 4: Servicios
    const serviciosContainer = document.getElementById('serviciosContent');
    if (serviciosContainer) {
        if (detalle.servicios && detalle.servicios.length > 0) {
            serviciosContainer.innerHTML = `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-dollar-sign"></i> Servicios</h4>
                    <div class="detalle-grid">
                        ${detalle.servicios.map(s => `
                            <div class="detalle-item">
                                <span class="detalle-label">${escapeHtml(s.descripcion)}</span>
                                <span class="detalle-value">Bs. ${s.precio?.toFixed(2) || '0.00'}</span>
                            </div>
                        `).join('')}
                        <div class="detalle-item">
                            <span class="detalle-label"><strong>TOTAL</strong></span>
                            <span class="detalle-value"><strong>Bs. ${detalle.total?.toFixed(2) || '0.00'}</strong></span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            serviciosContainer.innerHTML = '<div class="empty-state"><p>No hay servicios registrados</p></div>';
        }
    }
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================
function mostrarLoading(container, mensaje) {
    container.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${mensaje}</p>
        </div>
    `;
}

function mostrarError(container, mensaje) {
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Error</h3>
            <p>${mensaje}</p>
            <button class="btn-buscar" onclick="cargarUltimasOrdenes()" style="margin-top: 1rem;">
                <i class="fas fa-sync-alt"></i> Reintentar
            </button>
        </div>
    `;
}

function mostrarSinResultados(container, mensaje) {
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-search"></i>
            <h3>Sin resultados</h3>
            <p>${mensaje}</p>
            <button class="btn-buscar" onclick="cargarUltimasOrdenes()" style="margin-top: 1rem;">
                <i class="fas fa-history"></i> Ver últimas órdenes
            </button>
        </div>
    `;
}

function getEstadoClass(estado) {
    if (!estado) return '';
    if (estado === 'Entregado' || estado === 'Finalizado') return 'Entregado';
    if (estado === 'EnProceso') return 'EnProceso';
    if (estado === 'EnRecepcion') return 'EnRecepcion';
    if (estado === 'EnPausa') return 'EnPausa';
    return '';
}

function getEstadoText(estado) {
    if (!estado) return 'Desconocido';
    if (estado === 'Entregado') return 'Entregado';
    if (estado === 'Finalizado') return 'Finalizado';
    if (estado === 'EnProceso') return 'En Proceso';
    if (estado === 'EnRecepcion') return 'En Recepción';
    if (estado === 'EnPausa') return 'En Pausa';
    return estado;
}

function formatFecha(fecha) {
    if (!fecha) return 'N/A';
    try {
        const date = new Date(fecha);
        return date.toLocaleDateString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (e) {
        return fecha;
    }
}

function mostrarFechaActual() {
    const ahora = new Date();
    const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        dateElement.textContent = ahora.toLocaleDateString('es-CL', opciones);
    }
}

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
    toast.innerHTML = `<i class="fas ${tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && document.body.contains(toast)) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
        }
    }, 3000);
}

function setupModalTabs() {
    const tabs = document.querySelectorAll('.modal-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.modal-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const activeContent = document.getElementById(`tab-${tabId}`);
            if (activeContent) activeContent.classList.add('active');
        });
    });
}

function configurarEventListeners() {
    const btnBuscar = document.getElementById('btnBuscar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const searchPlaca = document.getElementById('searchPlaca');
    
    if (btnBuscar) btnBuscar.addEventListener('click', buscarHistorial);
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            document.getElementById('searchPlaca').value = '';
            document.getElementById('filterEstado').value = '';
            document.getElementById('fechaDesde').value = '';
            document.getElementById('fechaHasta').value = '';
            cargarUltimasOrdenes();
        });
    }
    if (searchPlaca) {
        searchPlaca.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') buscarHistorial();
        });
    }
}

window.verImagenAmpliada = function(url, titulo) {
    const modal = document.getElementById('modalImagen');
    const tituloSpan = document.getElementById('imagenTitulo');
    const imagen = document.getElementById('imagenAmpliada');
    
    if (tituloSpan) tituloSpan.textContent = titulo || 'Imagen';
    if (imagen) imagen.src = url;
    if (modal) modal.classList.add('show');
};

window.cerrarModalImagen = function() {
    const modal = document.getElementById('modalImagen');
    if (modal) modal.classList.remove('show');
};

window.cerrarModalDetalle = function() {
    const modal = document.getElementById('modalDetalleOrden');
    if (modal) modal.classList.remove('show');
};

// Cerrar modales con ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modalDetalle = document.getElementById('modalDetalleOrden');
        const modalImagen = document.getElementById('modalImagen');
        if (modalDetalle) modalDetalle.classList.remove('show');
        if (modalImagen) modalImagen.classList.remove('show');
    }
});