// =====================================================
// HISTORIAL DE VEHÍCULOS - JEFE TALLER
// =====================================================

const API_URL = 'http://localhost:5000/api';
let userInfo = null;
let vehiculoActual = null;
let ultimosResultados = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando página de historial (Jefe Taller)...');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    initPage();
    setupEventListeners();
    
    await cargarUltimasOrdenes();
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
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
    
    const userNameElement = document.querySelector('.user-name');
    if (userNameElement && userInfo.nombre) {
        userNameElement.textContent = userInfo.nombre;
    }
}

function setupEventListeners() {
    const btnBuscar = document.getElementById('btnBuscar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const searchPlaca = document.getElementById('searchPlaca');
    
    if (btnBuscar) btnBuscar.addEventListener('click', buscarHistorial);
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarBusqueda);
    if (searchPlaca) searchPlaca.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarHistorial();
    });
    
    // Filtros
    const filterEstado = document.getElementById('filterEstado');
    const fechaDesde = document.getElementById('fechaDesde');
    const fechaHasta = document.getElementById('fechaHasta');
    
    if (filterEstado) filterEstado.addEventListener('change', aplicarFiltros);
    if (fechaDesde) fechaDesde.addEventListener('change', aplicarFiltros);
    if (fechaHasta) fechaHasta.addEventListener('change', aplicarFiltros);
}

function getAuthToken() {
    return localStorage.getItem('furia_token');
}

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
    };
}

// =====================================================
// APLICAR FILTROS
// =====================================================
function aplicarFiltros() {
    if (!ultimosResultados) return;
    
    const estadoFiltro = document.getElementById('filterEstado')?.value || '';
    const fechaDesde = document.getElementById('fechaDesde')?.value || '';
    const fechaHasta = document.getElementById('fechaHasta')?.value || '';
    
    let ordenesFiltradas = [...ultimosResultados.ordenes];
    
    if (estadoFiltro) {
        ordenesFiltradas = ordenesFiltradas.filter(o => o.estado_global === estadoFiltro);
    }
    
    if (fechaDesde) {
        const desde = new Date(fechaDesde);
        desde.setHours(0, 0, 0, 0);
        ordenesFiltradas = ordenesFiltradas.filter(o => {
            const fechaIngreso = new Date(o.fecha_ingreso);
            return fechaIngreso >= desde;
        });
    }
    
    if (fechaHasta) {
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59, 999);
        ordenesFiltradas = ordenesFiltradas.filter(o => {
            const fechaIngreso = new Date(o.fecha_ingreso);
            return fechaIngreso <= hasta;
        });
    }
    
    const resumen = {
        total: ordenesFiltradas.length,
        entregados: ordenesFiltradas.filter(o => o.estado_global === 'Entregado' || o.estado_global === 'Finalizado').length,
        en_proceso: ordenesFiltradas.filter(o => o.estado_global === 'EnProceso').length,
        en_pausa: ordenesFiltradas.filter(o => o.estado_global === 'EnPausa').length,
        en_recepcion: ordenesFiltradas.filter(o => o.estado_global === 'EnRecepcion').length
    };
    
    renderizarOrdenes(ordenesFiltradas, resumen, ultimosResultados.vehiculo);
}

// =====================================================
// BUSCAR HISTORIAL
// =====================================================
async function buscarHistorial() {
    const placa = document.getElementById('searchPlaca')?.value.trim().toUpperCase();
    
    if (!placa) {
        mostrarNotificacion('Ingresa una placa para buscar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        let url = `${API_URL}/jefe-taller/historial-vehiculo?placa=${encodeURIComponent(placa)}`;
        
        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Error al buscar historial');
        
        if (!data.vehiculo) {
            mostrarResultadosVacio(placa);
            return;
        }
        
        ultimosResultados = {
            vehiculo: data.vehiculo,
            ordenes: data.ordenes || [],
            resumen_original: data.resumen || {}
        };
        
        aplicarFiltros();
        
    } catch (error) {
        console.error('Error:', error);
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
    
    ultimosResultados = null;
    vehiculoActual = null;
    
    cargarUltimasOrdenes();
}

// =====================================================
// RENDERIZADO
// =====================================================
function renderizarOrdenes(ordenes, resumen, vehiculo) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    const totalServicios = ordenes.length;
    
    let html = `
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
                <div class="stat-number">${resumen.en_recepcion || 0}</div>
                <div class="stat-label">En recepción</div>
            </div>
        </div>
    `;
    
    if (ordenes.length === 0) {
        html += `<div class="empty-state"><i class="fas fa-folder-open"></i><p>No hay órdenes de trabajo para este vehículo con los filtros seleccionados</p></div>`;
    } else {
        html += `<div class="ordenes-lista">`;
        
        ordenes.forEach(orden => {
            const fechaIngreso = new Date(orden.fecha_ingreso).toLocaleDateString();
            
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
                                    <strong>Diagnóstico:</strong> ${escapeHtml(orden.diagnostico_inicial.substring(0, 100))}${orden.diagnostico_inicial.length > 100 ? '...' : ''}
                                </div>
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
    }
    
    container.innerHTML = html;
}

// =====================================================
// CARGAR ÚLTIMAS ÓRDENES
// =====================================================
async function cargarUltimasOrdenes() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/jefe-taller/ultimas-ordenes?limite=10`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Error cargando últimas órdenes');
        
        renderizarUltimasOrdenes(data);
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
        mostrarResultadosVacioUltimas();
    } finally {
        mostrarLoading(false);
    }
}

function renderizarUltimasOrdenes(data) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    const ordenes = data.ordenes || [];
    const resumen = data.resumen || {};
    
    let html = `
        <div class="ultimas-ordenes-banner">
            <i class="fas fa-clock"></i>
            <span>Últimas 10 órdenes registradas</span>
            <small>(Busca una placa específica para ver el historial completo)</small>
        </div>
        
        <div class="resumen-stats">
            <div class="stat-card">
                <div class="stat-number">${resumen.total || 0}</div>
                <div class="stat-label">Últimas órdenes</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${resumen.entregados || 0}</div>
                <div class="stat-label">Completados</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${resumen.en_proceso || 0}</div>
                <div class="stat-label">En proceso</div>
            </div>
        </div>
    `;
    
    if (ordenes.length === 0) {
        html += `<div class="empty-state"><i class="fas fa-folder-open"></i><p>No hay órdenes de trabajo registradas</p></div>`;
    } else {
        html += `<div class="ordenes-lista">`;
        
        ordenes.forEach(orden => {
            const fechaIngreso = new Date(orden.fecha_ingreso).toLocaleDateString();
            
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
                                <span class="orden-info-label">Vehículo</span>
                                <span class="orden-info-value">${escapeHtml(orden.placa || 'N/A')} - ${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')}</span>
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
                                    <strong>Diagnóstico:</strong> ${escapeHtml(orden.diagnostico_inicial.substring(0, 100))}${orden.diagnostico_inicial.length > 100 ? '...' : ''}
                                </div>
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
    }
    
    container.innerHTML = html;
}

// =====================================================
// VER DETALLE COMPLETO DE ORDEN
// =====================================================
async function verDetalleCompletoOrden(idOrden) {
    try {
        mostrarNotificacion('Cargando detalle completo...', 'info');
        
        const response = await fetch(`${API_URL}/jefe-taller/detalle-completo-orden/${idOrden}`, {
            headers: getHeaders()
        });
        
        const data = await response.json();
        if (!response.ok || !data.detalle) throw new Error(data.error || 'Error cargando detalle');
        
        const detalle = data.detalle;
        mostrarModalDetalleCompleto(detalle);
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function mostrarModalDetalleCompleto(detalle) {
    const modal = document.getElementById('modalDetalleOrden');
    const body = document.getElementById('modalDetalleBody');
    
    // Datos del cliente y vehículo
    const datosClienteVehiculoHtml = `
        <div class="detalle-seccion">
            <h4><i class="fas fa-user-circle"></i> 👤 DATOS DEL CLIENTE</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Nombre completo</span>
                    <span class="detalle-value">${escapeHtml(detalle.cliente_nombre || 'No registrado')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Teléfono / Contacto</span>
                    <span class="detalle-value">${escapeHtml(detalle.cliente_telefono || 'No registrado')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Dirección / Ubicación</span>
                    <span class="detalle-value">${escapeHtml(detalle.cliente_ubicacion || 'No registrada')}</span>
                </div>
            </div>
        </div>
        
        <div class="detalle-seccion">
            <h4><i class="fas fa-car"></i> 🚗 DATOS DEL VEHÍCULO</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Placa</span>
                    <span class="detalle-value" style="font-family: monospace; font-size: 1.1rem; color: var(--rojo-primario);">${escapeHtml(detalle.placa || 'No registrada')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Marca</span>
                    <span class="detalle-value">${escapeHtml(detalle.marca || 'No registrada')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Modelo</span>
                    <span class="detalle-value">${escapeHtml(detalle.modelo || 'No registrado')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Año</span>
                    <span class="detalle-value">${detalle.anio || 'No registrado'}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Kilometraje</span>
                    <span class="detalle-value">${detalle.kilometraje?.toLocaleString() || '0'} km</span>
                </div>
            </div>
        </div>
    `;
    
    // Recepción
    const recepcionHtml = `
        <div class="detalle-seccion recepcion">
            <h4><i class="fas fa-clipboard-list"></i> 📋 RECEPCIÓN (Jefe Operativo)</h4>
            <div class="detalle-grid">
                <div class="detalle-item">
                    <span class="detalle-label">Jefe Operativo</span>
                    <span class="detalle-value">${escapeHtml(detalle.jefe_operativo_nombre || 'No registrado')}</span>
                </div>
                <div class="detalle-item">
                    <span class="detalle-label">Fecha de ingreso</span>
                    <span class="detalle-value">${new Date(detalle.fecha_ingreso).toLocaleString()}</span>
                </div>
            </div>
            <div class="detalle-descripcion">
                <strong>Descripción del problema:</strong><br>
                ${escapeHtml(detalle.descripcion_problema || 'No se registró descripción')}
            </div>
            ${detalle.audio_recepcion ? `
                <div class="audio-player">
                    <strong>Audio de recepción:</strong>
                    <audio controls src="${detalle.audio_recepcion}"></audio>
                </div>
            ` : ''}
        </div>
    `;
    
    // Fotos de recepción
    let fotosHtml = '';
    if (detalle.fotos && Object.keys(detalle.fotos).length > 0) {
        const fotosLista = [];
        const camposFotos = [
            { campo: 'url_lateral_izquierda', label: 'Lateral Izquierdo' },
            { campo: 'url_lateral_derecha', label: 'Lateral Derecho' },
            { campo: 'url_foto_frontal', label: 'Frontal' },
            { campo: 'url_foto_trasera', label: 'Trasera' },
            { campo: 'url_foto_superior', label: 'Superior' },
            { campo: 'url_foto_inferior', label: 'Inferior' },
            { campo: 'url_foto_tablero', label: 'Tablero' }
        ];
        
        for (const campo of camposFotos) {
            if (detalle.fotos[campo.campo]) {
                fotosLista.push(`
                    <div class="foto-item" onclick="verImagenAmpliada('${detalle.fotos[campo.campo]}', '${campo.label}')">
                        <img src="${detalle.fotos[campo.campo]}" alt="${campo.label}" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                        <div class="foto-label">${campo.label}</div>
                    </div>
                `);
            }
        }
        
        if (fotosLista.length > 0) {
            fotosHtml = `
                <div class="detalle-seccion">
                    <h4><i class="fas fa-camera"></i> 📸 FOTOS DE RECEPCIÓN</h4>
                    <div class="fotos-grid">${fotosLista.join('')}</div>
                </div>
            `;
        }
    }
    
    // Técnicos asignados
    let tecnicosHtml = '';
    if (detalle.tecnicos_asignados && detalle.tecnicos_asignados.length > 0) {
        tecnicosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-users"></i> 👨‍🔧 TÉCNICOS ASIGNADOS</h4>
                <div class="detalle-grid">
                    ${detalle.tecnicos_asignados.map(t => `
                        <div class="detalle-item">
                            <span class="tecnico-badge"><i class="fas fa-user"></i> ${escapeHtml(t.nombre)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Diagnóstico Inicial
    const diagnosticoInicialHtml = detalle.diagnostico_inicial ? `
        <div class="detalle-seccion diagnostico-inicial">
            <h4><i class="fas fa-stethoscope"></i> 🔵 DIAGNÓSTICO INICIAL (Jefe de Taller)</h4>
            <div class="detalle-descripcion">${escapeHtml(detalle.diagnostico_inicial)}</div>
            ${detalle.audio_diagnostico_inicial ? `
                <div class="audio-player">
                    <strong>Audio del diagnóstico inicial:</strong>
                    <audio controls src="${detalle.audio_diagnostico_inicial}"></audio>
                </div>
            ` : ''}
        </div>
    ` : '';
    
    // Diagnósticos Técnicos
    let diagnosticosTecnicosHtml = '';
    if (detalle.diagnosticos_tecnicos && detalle.diagnosticos_tecnicos.length > 0) {
        diagnosticosTecnicosHtml = detalle.diagnosticos_tecnicos.map(dt => `
            <div class="detalle-seccion diagnostico-tecnico">
                <h4><i class="fas fa-microscope"></i> 🔴 DIAGNÓSTICO TÉCNICO (Versión ${dt.version})</h4>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <span class="detalle-label">Técnico</span>
                        <span class="detalle-value">${escapeHtml(dt.tecnico_nombre || 'No registrado')}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Fecha</span>
                        <span class="detalle-value">${new Date(dt.fecha_envio).toLocaleString()}</span>
                    </div>
                    <div class="detalle-item">
                        <span class="detalle-label">Estado</span>
                        <span class="detalle-value">${dt.estado === 'aprobado' ? '✅ Aprobado' : (dt.estado === 'rechazado' ? '❌ Rechazado' : '⏳ Pendiente')}</span>
                    </div>
                </div>
                <div class="detalle-descripcion">
                    <strong>Informe del técnico:</strong><br>
                    ${escapeHtml(dt.informe || 'No hay informe detallado')}
                </div>
                ${dt.url_grabacion_informe ? `
                    <div class="audio-player">
                        <strong>Audio del diagnóstico técnico:</strong>
                        <audio controls src="${dt.url_grabacion_informe}"></audio>
                    </div>
                ` : ''}
                ${dt.fotos && dt.fotos.length > 0 ? `
                    <div>
                        <strong>Fotos del diagnóstico técnico:</strong>
                        <div class="fotos-grid">
                            ${dt.fotos.map(foto => `
                                <div class="foto-item" onclick="verImagenAmpliada('${foto.url_foto}', 'Foto técnica')">
                                    <img src="${foto.url_foto}" alt="Foto técnica" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3ESin%20imagen%3C%2Ftext%3E%3C%2Fsvg%3E'">
                                    <div class="foto-label">${escapeHtml(foto.descripcion_tecnico || 'Sin descripción')}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                ${dt.observaciones ? `
                    <div class="detalle-descripcion" style="background: rgba(193,18,31,0.1);">
                        <strong>Observaciones del Jefe de Taller:</strong><br>
                        ${escapeHtml(dt.observaciones)}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }
    
    // Servicios cotizados
    let serviciosHtml = '';
    if (detalle.servicios && detalle.servicios.length > 0) {
        serviciosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-dollar-sign"></i> 💰 SERVICIOS COTIZADOS</h4>
                <div class="detalle-grid">
                    ${detalle.servicios.map(s => `
                        <div class="detalle-item">
                            <span class="detalle-label">${escapeHtml(s.descripcion)}</span>
                            <span class="detalle-value">Bs. ${s.precio?.toFixed(2) || '0.00'}</span>
                        </div>
                    `).join('')}
                    <div class="detalle-item">
                        <span class="detalle-label"><strong>TOTAL</strong></span>
                        <span class="detalle-value" style="color: var(--verde-exito);"><strong>Bs. ${detalle.total?.toFixed(2) || '0.00'}</strong></span>
                    </div>
                </div>
            </div>
        `;
    }
    
    body.innerHTML = `
        ${datosClienteVehiculoHtml}
        ${recepcionHtml}
        ${fotosHtml}
        ${tecnicosHtml}
        ${diagnosticoInicialHtml}
        ${diagnosticosTecnicosHtml}
        ${serviciosHtml}
    `;
    
    modal.classList.add('show');
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================
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

function mostrarResultadosVacioUltimas() {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-search"></i>
            <p>No hay órdenes registradas</p>
            <p style="font-size: 0.8rem; margin-top: 0.5rem;">Ingresa una placa para buscar el historial completo</p>
        </div>
    `;
}

function mostrarLoading(show) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;
    
    if (show) {
        container.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando...</p></div>`;
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

function verImagenAmpliada(url, titulo) {
    const modal = document.getElementById('modalImagen');
    const tituloSpan = document.getElementById('imagenTitulo');
    const imagen = document.getElementById('imagenAmpliada');
    
    if (tituloSpan) tituloSpan.textContent = titulo || 'Imagen';
    if (imagen) imagen.src = url;
    
    modal.classList.add('show');
}

function cerrarModalImagen() {
    const modal = document.getElementById('modalImagen');
    if (modal) modal.classList.remove('show');
}

function cerrarModalDetalle() {
    const modal = document.getElementById('modalDetalleOrden');
    if (modal) modal.classList.remove('show');
}

// Exponer funciones globales
window.verDetalleCompletoOrden = verDetalleCompletoOrden;
window.cerrarModalDetalle = cerrarModalDetalle;
window.verImagenAmpliada = verImagenAmpliada;
window.cerrarModalImagen = cerrarModalImagen;