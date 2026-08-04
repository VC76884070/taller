// =====================================================
// HISTORIAL DE VEHÍCULOS - JEFE TALLER
// VERSIÓN CORREGIDA - USA VARIABLE GLOBAL DE INCLUDE.JS
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
// La variable API_BASE_URL ya está declarada en include.js como window.API_BASE_URL
// Si por alguna razón no existe (página cargada sola), la creamos
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 historial_vehiculos.js - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 historial_vehiculos.js - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

let userInfo = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Historial - Jefe Taller...');
    console.log('📡 API_BASE_URL:', window.API_BASE_URL);
    
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
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
    
    try {
        userInfo = JSON.parse(userInfoRaw || '{}');
        
        const verifyResponse = await fetch(`${window.API_BASE_URL}/api/verify-token`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!verifyResponse.ok) {
            localStorage.clear();
            window.location.href = window.API_BASE_URL + '/';
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
                window.location.href = window.API_BASE_URL + '/jefe_operativo/dashboard.html';
            } else {
                window.location.href = window.API_BASE_URL + '/';
            }
            return false;
        }
        
        console.log('✅ Autenticación exitosa - Jefe Taller');
        return true;
        
    } catch (error) {
        console.error('Error en checkAuth:', error);
        window.location.href = window.API_BASE_URL + '/';
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
        
        const response = await fetch(`${window.API_BASE_URL}/api/jefe-taller/ultimas-ordenes?limite=10`, {
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
// MOSTRAR ÚLTIMAS ÓRDENES - CORREGIDO
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
    
    // Calcular estadísticas a partir de los datos reales
    const total = ordenes.length;
    const entregados = ordenes.filter(o => o.estado_global === 'Entregado' || o.estado_global === 'Finalizado').length;
    const en_proceso = ordenes.filter(o => o.estado_global === 'EnReparacion' || o.estado_global === 'EnDiagnostico').length;
    const en_pausa = ordenes.filter(o => o.estado_global === 'EnPausa').length;
    const en_recepcion = ordenes.filter(o => o.estado_global === 'EnRecepcion').length;
    
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
        
        // ✅ CORRECCIÓN: Extraer datos del vehículo correctamente
        const vehiculo = orden.vehiculo || {};
        const marca = vehiculo.marca || '';
        const modelo = vehiculo.modelo || '';
        const placa = vehiculo.placa || 'N/A';
        const clienteNombre = vehiculo.cliente_nombre || 'Cliente no registrado';
        
        // Construir display del vehículo
        const vehiculoDisplay = `${marca} ${modelo}`.trim();
        const vehiculoConPlaca = vehiculoDisplay ? `${vehiculoDisplay} (${placa})` : placa;
        
        // ✅ CORRECCIÓN: Obtener técnicos correctamente
        const tecnicosNombres = orden.tecnicos && orden.tecnicos.length > 0 
            ? orden.tecnicos.map(t => t.nombre).join(', ') 
            : 'Sin asignar';
        
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
                            <span class="orden-info-value"><strong>${escapeHtml(vehiculoConPlaca)}</strong></span>
                        </div>
                        <div class="orden-info-item">
                            <span class="orden-info-label">Cliente</span>
                            <span class="orden-info-value">${escapeHtml(clienteNombre)}</span>
                        </div>
                        <div class="orden-info-item">
                            <span class="orden-info-label">Técnicos</span>
                            <span class="orden-info-value">${escapeHtml(tecnicosNombres)}</span>
                        </div>
                    </div>
                    ${orden.bahia_asignada ? `
                        <div class="orden-info-item">
                            <span class="orden-info-label">Bahía</span>
                            <span class="orden-info-value"><i class="fas fa-warehouse"></i> Bahía ${orden.bahia_asignada}</span>
                        </div>
                    ` : ''}
                    ${orden.diagnostico_inicial ? `
                        <div class="orden-info-item">
                            <span class="orden-info-label">Diagnóstico</span>
                            <span class="orden-info-value">${escapeHtml(orden.diagnostico_inicial.substring(0, 80))}${orden.diagnostico_inicial.length > 80 ? '...' : ''}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="orden-card-footer">
                    <button class="btn-accion" onclick="verDetalleCompletoOrden(${orden.id_orden || orden.id})">
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
        
        let url = `${window.API_BASE_URL}/api/jefe-taller/historial-vehiculo?placa=${encodeURIComponent(placa)}`;
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
        const response = await fetch(`${window.API_BASE_URL}/api/jefe-taller/detalle-completo-orden/${idOrden}`, {
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
// CARGAR DETALLE EN TABS
// =====================================================
// =====================================================
// CARGAR DETALLE EN TABS - CON FOTOS DE RECEPCIÓN
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
    
    // Tab 2: Recepción (CON FOTOS)
    const recepcionContainer = document.getElementById('recepcionContent');
    if (recepcionContainer) {
        // Procesar fotos de recepción
        const fotosRecepcion = detalle.fotos || {};
        const fotosArray = Object.entries(fotosRecepcion).filter(([key, url]) => url && url !== 'null' && url !== 'None' && url !== '');
        
        // Nombres amigables para las fotos
        const nombresFotos = {
            'url_lateral_izquierda': 'Lateral Izquierdo',
            'url_lateral_derecha': 'Lateral Derecho',
            'url_foto_frontal': 'Frontal',
            'url_foto_trasera': 'Trasera',
            'url_foto_superior': 'Superior',
            'url_foto_inferior': 'Inferior',
            'url_foto_tablero': 'Tablero'
        };
        
        let fotosHtml = '';
        if (fotosArray.length > 0) {
            fotosHtml = `
                <div class="fotos-seccion" style="margin-top: 1.5rem;">
                    <h5 style="margin-bottom: 0.75rem; color: var(--gris-texto);">
                        <i class="fas fa-camera"></i> Fotos del Vehículo (${fotosArray.length})
                    </h5>
                    <div class="fotos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem;">
                        ${fotosArray.map(([key, url]) => {
                            const nombre = nombresFotos[key] || key.replace(/url_/g, '').replace(/_/g, ' ').toUpperCase();
                            return `
                                <div class="foto-item" onclick="verImagenAmpliada('${url}', '${escapeHtml(nombre)}')" style="cursor: pointer; text-align: center;">
                                    <img src="${url}" alt="${nombre}" style="width: 100%; height: 100px; object-fit: cover; border-radius: var(--radius-sm);" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                                    <div style="font-size: 0.7rem; padding: 0.25rem; color: var(--gris-texto);">${escapeHtml(nombre)}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        recepcionContainer.innerHTML = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-clipboard-list"></i> Problema Reportado</h4>
                <div class="detalle-descripcion" style="background: var(--gris-oscuro); padding: 0.75rem; border-radius: var(--radius-md);">
                    ${escapeHtml(detalle.descripcion_problema || 'No se registró descripción')}
                </div>
                ${detalle.audio_recepcion ? `
                    <div class="audio-player" style="margin-top: 1rem;">
                        <strong><i class="fas fa-microphone-alt"></i> Audio del cliente:</strong>
                        <audio controls src="${detalle.audio_recepcion}" style="width: 100%; margin-top: 0.5rem;"></audio>
                    </div>
                ` : ''}
            </div>
            ${fotosHtml}
        `;
    }
    
    // Tab 3: Diagnósticos
    const diagnosticosContainer = document.getElementById('diagnosticosContent');
    if (diagnosticosContainer) {
        let diagnosticosHtml = '';
        
        // Diagnóstico Inicial (del jefe operativo/taller)
        if (detalle.diagnostico_inicial) {
            diagnosticosHtml += `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4>
                    <div class="detalle-descripcion" style="background: var(--gris-oscuro); padding: 0.75rem; border-radius: var(--radius-md);">
                        ${escapeHtml(detalle.diagnostico_inicial)}
                    </div>
                    ${detalle.audio_diagnostico_inicial ? `
                        <div class="audio-player" style="margin-top: 1rem;">
                            <strong><i class="fas fa-microphone-alt"></i> Audio del diagnóstico:</strong>
                            <audio controls src="${detalle.audio_diagnostico_inicial}" style="width: 100%; margin-top: 0.5rem;"></audio>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        // Diagnósticos técnicos (del técnico mecánico)
        if (detalle.diagnosticos_tecnicos && detalle.diagnosticos_tecnicos.length > 0) {
            diagnosticosHtml += `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-microscope"></i> Diagnósticos Técnicos</h4>
                    ${detalle.diagnosticos_tecnicos.map(dt => `
                        <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 3px solid var(--rojo-primario);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                                <strong>Versión ${dt.version}</strong>
                                <span style="font-size: 0.7rem; color: var(--gris-texto);">${formatFecha(dt.fecha_envio)}</span>
                            </div>
                            <p style="margin: 0;">${escapeHtml(dt.informe || 'Sin informe')}</p>
                            ${dt.tecnico_nombre ? `<div style="margin-top: 0.5rem; font-size: 0.7rem; color: var(--gris-texto);"><i class="fas fa-user"></i> Técnico: ${escapeHtml(dt.tecnico_nombre)}</div>` : ''}
                            ${dt.url_grabacion_informe ? `
                                <audio controls src="${dt.url_grabacion_informe}" style="width: 100%; margin-top: 0.5rem;"></audio>
                            ` : ''}
                            ${dt.fotos && dt.fotos.length > 0 ? `
                                <div class="fotos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 0.5rem; margin-top: 0.5rem;">
                                    ${dt.fotos.map(foto => `
                                        <div class="foto-item" onclick="verImagenAmpliada('${foto.url_foto}', 'Foto diagnóstico')" style="cursor: pointer;">
                                            <img src="${foto.url_foto}" style="width: 100%; height: 60px; object-fit: cover; border-radius: var(--radius-sm);">
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
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
            const totalServicios = detalle.servicios.reduce((sum, s) => sum + (s.precio || 0), 0);
            serviciosContainer.innerHTML = `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-dollar-sign"></i> Servicios Cotizados</h4>
                    <div class="servicios-lista" style="display: flex; flex-direction: column; gap: 0.5rem;">
                        ${detalle.servicios.map(s => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm);">
                                <span>${escapeHtml(s.descripcion)}</span>
                                <span style="font-weight: 600; color: var(--rojo-primario);">Bs. ${s.precio?.toFixed(2) || '0.00'}</span>
                            </div>
                        `).join('')}
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--rojo-primario); border-radius: var(--radius-sm); color: white; margin-top: 0.5rem;">
                            <strong>TOTAL</strong>
                            <strong>Bs. ${totalServicios.toFixed(2)}</strong>
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
    const estadoMap = {
        'Entregado': 'Entregado',
        'Finalizado': 'Finalizado',
        'EnReparacion': 'EnProceso',
        'EnDiagnostico': 'EnDiagnostico',
        'EnRecepcion': 'EnRecepcion',
        'EnPausa': 'EnPausa',
        'ReparacionCompletada': 'ReparacionCompletada'
    };
    return estadoMap[estado] || '';
}

function getEstadoText(estado) {
    if (!estado) return 'Desconocido';
    const estadoMap = {
        'Entregado': 'Entregado',
        'Finalizado': 'Finalizado',
        'EnReparacion': 'En Reparación',
        'EnDiagnostico': 'En Diagnóstico',
        'EnRecepcion': 'En Recepción',
        'EnPausa': 'En Pausa',
        'ReparacionCompletada': 'Reparación Completada'
    };
    return estadoMap[estado] || estado;
}

function formatFecha(fecha) {
    if (!fecha) return 'N/A';
    try {
        const date = new Date(fecha);
        if (isNaN(date.getTime())) {
            return fecha.split('T')[0];
        }
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
    // Crear modal para ver imagen ampliada
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    `;
    modal.innerHTML = `
        <div style="position: relative; max-width: 90%; max-height: 90%;">
            <button style="position: absolute; top: -40px; right: 0; background: none; border: none; color: white; font-size: 30px; cursor: pointer;">&times;</button>
            <img src="${url}" alt="${escapeHtml(titulo)}" style="max-width: 100%; max-height: 80vh; border-radius: 8px;">
            <p style="color: white; text-align: center; margin-top: 10px;">${escapeHtml(titulo)}</p>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
    modal.querySelector('button').addEventListener('click', () => modal.remove());
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