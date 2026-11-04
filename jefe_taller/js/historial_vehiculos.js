// =====================================================
// HISTORIAL DE VEHÍCULOS - JEFE TALLER
// VERSIÓN FULL - PDF MULTI-PÁGINA + CICLO COMPLETO
// FIX: técnicos robustos + btn-volver + logs debug
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 historial_vehiculos.js - Modo DESARROLLO');
            return 'http://localhost:5000';
        }
        console.log('📡 historial_vehiculos.js - Modo PRODUCCIÓN');
        return '';
    })();
}

let userInfo = null;
let ordenActualDetalle = null;
let descargandoPDF = false;

// Cache de imágenes base64 (evita pedirlas 2 veces al abrir modal + generar PDF)
const imageCache = new Map();

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Historial - Jefe Taller...');
    console.log('📡 API_BASE_URL:', window.API_BASE_URL);

    const autenticado = await checkAuth();
    if (!autenticado) return;

    mostrarFechaActual();
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
    if (!container) return;

    try {
        mostrarLoading(container, 'Cargando últimas órdenes...');
        const token = localStorage.getItem('furia_token');

        const response = await fetch(`${window.API_BASE_URL}/api/jefe-taller/ultimas-ordenes?limite=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`Error HTTP ${response.status}`);

        const data = await response.json();
        console.log('📋 Respuesta últimas órdenes:', data);

        if (data.success) {
            mostrarUltimasOrdenes(data.ordenes || [], data.resumen || {});
        } else {
            mostrarError(container, data.error || 'Error al cargar órdenes');
        }

    } catch (error) {
        console.error('❌ Error:', error);
        mostrarError(container, 'Error de conexión al servidor: ' + error.message);
    }
}

// =====================================================
// HELPER: FORMATEAR TÉCNICOS
// =====================================================
function formatearTecnicos(tecnicos) {
    if (!tecnicos || !Array.isArray(tecnicos) || tecnicos.length === 0) {
        return 'Sin asignar';
    }
    const nombres = tecnicos
        .map(t => {
            if (!t) return null;
            if (typeof t === 'string') return t.trim();
            return (t.nombre || '').trim();
        })
        .filter(n => n && n.length > 0);
    return nombres.length > 0 ? nombres.join(', ') : 'Sin asignar';
}

// =====================================================
// MOSTRAR ÚLTIMAS ÓRDENES
// =====================================================
function mostrarUltimasOrdenes(ordenes, resumen) {
    const container = document.getElementById('resultadosContainer');
    if (!container) return;

    // 🔍 DEBUG
    console.log('📋 Órdenes recibidas:', ordenes.length);
    if (ordenes.length > 0) {
        console.log('🔍 Primera orden completa:', JSON.stringify(ordenes[0], null, 2));
        console.log('🔧 Técnicos primera orden:', ordenes[0].tecnicos);
    }

    if (!ordenes || ordenes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>No hay órdenes recientes</h3>
                <p>Las últimas órdenes aparecerán aquí automáticamente.</p>
            </div>`;
        return;
    }

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
            <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label">Total</div></div>
            <div class="stat-card"><div class="stat-number">${entregados}</div><div class="stat-label">Entregados</div></div>
            <div class="stat-card"><div class="stat-number">${en_proceso}</div><div class="stat-label">En Proceso</div></div>
            <div class="stat-card"><div class="stat-number">${en_pausa}</div><div class="stat-label">En Pausa</div></div>
            <div class="stat-card"><div class="stat-number">${en_recepcion}</div><div class="stat-label">En Recepción</div></div>
        </div>
        <div class="ordenes-lista">
    `;

    ordenes.forEach(orden => {
        const estadoClass = getEstadoClass(orden.estado_global);
        const estadoText = getEstadoText(orden.estado_global);
        const fechaIngreso = formatFecha(orden.fecha_ingreso);

        const marca = orden.marca || '';
        const modelo = orden.modelo || '';
        const placa = orden.placa || 'N/A';
        const clienteNombre = orden.cliente_nombre || 'Cliente no registrado';
        const vehiculoDisplay = `${marca} ${modelo}`.trim();
        const vehiculoConPlaca = vehiculoDisplay ? `${vehiculoDisplay} (${placa})` : placa;

        // 🔧 TÉCNICOS: usar helper robusto
        const tecnicosNombres = formatearTecnicos(orden.tecnicos);

        html += `
            <div class="orden-historial-card">
                <div class="orden-card-header">
                    <div class="orden-codigo"><i class="fas fa-hashtag"></i> ${escapeHtml(orden.codigo_unico || 'N/A')}</div>
                    <div class="orden-estado ${estadoClass}">${estadoText}</div>
                    <div class="orden-fecha"><i class="fas fa-calendar-alt"></i> ${fechaIngreso}</div>
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

        let url = `${window.API_BASE_URL}/api/jefe-taller/historial-vehiculo?placa=${encodeURIComponent(placa)}`;
        if (estado) url += `&estado=${estado}`;
        if (fechaDesde) url += `&fecha_desde=${fechaDesde}`;
        if (fechaHasta) url += `&fecha_hasta=${fechaHasta}`;

        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Error al buscar');

        const data = await response.json();
        console.log('📋 Respuesta búsqueda:', data);

        if (data.success) {
            if (data.vehiculo) mostrarHistorialVehiculo(data);
            else mostrarSinResultados(container, `No se encontró el vehículo con placa ${placa}`);
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
        <div class="historial-back-row">
            <button class="btn-volver" onclick="cargarUltimasOrdenes()">
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
            <div class="stat-card"><div class="stat-number">${resumen.total || ordenes.length}</div><div class="stat-label">Total Servicios</div></div>
            <div class="stat-card"><div class="stat-number">${resumen.entregados || 0}</div><div class="stat-label">Completados</div></div>
            <div class="stat-card"><div class="stat-number">${(resumen.en_proceso || 0) + (resumen.en_pausa || 0)}</div><div class="stat-label">En Taller</div></div>
        </div>
    `;

    if (ordenes.length > 0) {
        html += `<div class="ordenes-lista">`;
        ordenes.forEach(orden => {
            const estadoClass = getEstadoClass(orden.estado_global);
            const estadoText = getEstadoText(orden.estado_global);
            const fechaIngreso = formatFecha(orden.fecha_ingreso);
            const tecnicosNombres = formatearTecnicos(orden.tecnicos);

            html += `
                <div class="orden-historial-card">
                    <div class="orden-card-header">
                        <div class="orden-codigo"><i class="fas fa-hashtag"></i> ${escapeHtml(orden.codigo_unico || 'N/A')}</div>
                        <div class="orden-estado ${estadoClass}">${estadoText}</div>
                        <div class="orden-fecha"><i class="fas fa-calendar-alt"></i> ${fechaIngreso}</div>
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
                            <span class="orden-info-value">${escapeHtml(tecnicosNombres)}</span>
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
            </div>`;
    }

    container.innerHTML = html;
}

// =====================================================
// VER DETALLE COMPLETO
// =====================================================
window.verDetalleCompletoOrden = async function (idOrden) {
    const modal = document.getElementById('modalDetalleOrden');
    if (!modal) return;

    // 🔥 VALIDACIÓN CRÍTICA: Si el ID no existe, evitamos que el fetch falle
    if (!idOrden || idOrden === 'undefined') {
        console.error("❌ ID de orden inválido:", idOrden);
        mostrarNotificacion('Error: No se pudo obtener el ID de la orden', 'error');
        return;
    }

    try {
        modal.classList.add('show');
        
        // Resetear tabs
        document.querySelectorAll('.modal-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        document.querySelectorAll('.modal-tab-content').forEach((c, i) => c.classList.toggle('active', i === 0));

        // Mostrar spinners
        ['clienteVehiculoContent', 'recepcionContent', 'diagnosticosContent', 'serviciosContent', 'timelineContent'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<div style="text-align:center;padding:30px"><i class="fas fa-spinner fa-spin" style="font-size:28px;color:#C1121F;"></i><p style="margin-top:10px;color:#8E8E93">Cargando...</p></div>`;
        });

        const token = localStorage.getItem('furia_token');
        
        // 🔥 LA URL CORRECTA (Asegúrate que API_BASE_URL no esté vacío en producción)
        const baseUrl = window.API_BASE_URL || '';
        const url = `${baseUrl}/api/jefe-taller/detalle-completo-orden/${idOrden}`;
        
        console.log("📡 Consultando backend en:", url);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Error del servidor (${response.status})`);
        }

        const data = await response.json();

        if (data.success && data.detalle) {
            ordenActualDetalle = data.detalle;
            cargarDetalleEnTabs(data.detalle);
        } else {
            throw new Error(data.error || 'Datos inválidos en la respuesta');
        }

    } catch (error) {
        console.error('❌ Error detalle:', error);
        mostrarNotificacion('Error al cargar detalle: ' + error.message, 'error');
        cerrarModalDetalle();
    }
};

// =====================================================
// CARGAR DETALLE EN TABS
// =====================================================
function cargarDetalleEnTabs(detalle) {
    const modalTitle = document.querySelector('#modalDetalleOrden .modal-header h2');
    if (modalTitle) {
        modalTitle.innerHTML = `<i class="fas fa-clipboard-list"></i> Orden <span style="color:#C1121F">${escapeHtml(detalle.codigo_unico)}</span>`;
    }

    renderTabClienteVehiculo(detalle);
    renderTabRecepcion(detalle);
    renderTabDiagnosticos(detalle);
    renderTabServiciosAvances(detalle);
    renderTabTimeline(detalle);
}

// =====================================================
// TAB 1: CLIENTE & VEHÍCULO
// =====================================================
function renderTabClienteVehiculo(detalle) {
    const c = detalle.cliente || {};
    const esPropietario = c.es_propietario !== false;
    const esEmpresa = c.es_empresa === true;

    let bloqueCliente = '';

    if (esPropietario) {
        bloqueCliente = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-user-circle"></i> Cliente (Dueño)</h4>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Nombre</span><span class="detalle-value">${escapeHtml(c.nombre || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Teléfono</span><span class="detalle-value">${escapeHtml(c.telefono || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Email</span><span class="detalle-value">${escapeHtml(c.email || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Documento</span><span class="detalle-value">${escapeHtml(c.documento || 'N/A')}</span></div>
                </div>
            </div>`;
    } else {
        bloqueCliente = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-user-friends"></i> Tercero (quien trae el vehículo)</h4>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Nombre</span><span class="detalle-value">${escapeHtml(c.nombre_tercero || c.nombre || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Teléfono</span><span class="detalle-value">${escapeHtml(c.telefono_tercero || c.telefono || 'N/A')}</span></div>
                    <div class="detalle-item full-width"><span class="detalle-label">Ubicación</span><span class="detalle-value">${escapeHtml(c.ubicacion_tercero || 'No especificada')}</span></div>
                    <div class="detalle-item full-width"><span class="detalle-label">Tipo</span><span class="detalle-value">${escapeHtml(c.tipo_tercero || 'No especificado')}</span></div>
                </div>
            </div>
            ${esEmpresa ? `
                <div class="detalle-seccion" style="border-left:3px solid #2563EB">
                    <h4 style="color:#2563EB"><i class="fas fa-building"></i> Empresa</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item"><span class="detalle-label">Nombre</span><span class="detalle-value">${escapeHtml(c.nombre_empresa || 'N/A')}</span></div>
                        <div class="detalle-item"><span class="detalle-label">NIT</span><span class="detalle-value">${escapeHtml(c.nit_empresa || 'N/A')}</span></div>
                        <div class="detalle-item full-width"><span class="detalle-label">Ubicación</span><span class="detalle-value">${escapeHtml(c.ubicacion_empresa || 'N/A')}</span></div>
                    </div>
                </div>
            ` : `
                <div class="detalle-seccion" style="border-left:3px solid #10B981">
                    <h4 style="color:#10B981"><i class="fas fa-user-check"></i> Dueño Real del Vehículo</h4>
                    <div class="detalle-grid">
                        <div class="detalle-item"><span class="detalle-label">Nombre</span><span class="detalle-value">${escapeHtml(c.nombre_propietario_real || 'N/A')}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Teléfono</span><span class="detalle-value">${escapeHtml(c.telefono_propietario_real || 'N/A')}</span></div>
                        <div class="detalle-item full-width"><span class="detalle-label">Ubicación</span><span class="detalle-value">${escapeHtml(c.ubicacion_propietario_real || 'N/A')}</span></div>
                    </div>
                </div>
            `}
        `;
    }

    // Técnicos asignados
    let tecnicosHtml = '';
    if (detalle.tecnicos_asignados?.length) {
        tecnicosHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-users"></i> Técnicos Asignados (${detalle.tecnicos_asignados.length})</h4>
                <div>
                    ${detalle.tecnicos_asignados.map(t => `
                        <div class="tecnico-badge">
                            <i class="fas fa-wrench"></i>
                            ${escapeHtml(t.nombre || 'Técnico')}
                            <small>(${escapeHtml(t.tipo_asignacion || 'N/A')})</small>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    // Planificación
    let planificacionHtml = '';
    if (detalle.planificacion) {
        planificacionHtml = `
            <div class="detalle-seccion">
                <h4><i class="fas fa-warehouse"></i> Planificación</h4>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Bahía</span><span class="detalle-value">${detalle.planificacion.bahia || 'N/A'}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Horas Estimadas</span><span class="detalle-value">${detalle.planificacion.horas_estimadas || 'N/A'}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Inicio Estimado</span><span class="detalle-value">${formatFecha(detalle.planificacion.inicio_estimado)}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Fin Estimado</span><span class="detalle-value">${formatFecha(detalle.planificacion.fin_estimado)}</span></div>
                </div>
            </div>`;
    }

    const html = `
        <div class="detalle-seccion">
            <h4><i class="fas fa-info-circle"></i> Información General</h4>
            <div class="detalle-grid">
                <div class="detalle-item"><span class="detalle-label">Código</span><span class="detalle-value codigo">${escapeHtml(detalle.codigo_unico)}</span></div>
                <div class="detalle-item"><span class="detalle-label">Estado</span><span class="detalle-value"><span class="estado-badge ${getEstadoClass(detalle.estado_global)}">${getEstadoText(detalle.estado_global)}</span></span></div>
                <div class="detalle-item"><span class="detalle-label">Ingreso</span><span class="detalle-value">${formatFecha(detalle.fecha_ingreso)}</span></div>
                <div class="detalle-item"><span class="detalle-label">Salida</span><span class="detalle-value">${formatFecha(detalle.fecha_salida)}</span></div>
                <div class="detalle-item"><span class="detalle-label">Jefe Operativo</span><span class="detalle-value">${escapeHtml(detalle.jefe_operativo_nombre || 'N/A')}</span></div>
                <div class="detalle-item"><span class="detalle-label">Jefe Taller</span><span class="detalle-value">${escapeHtml(detalle.jefe_taller_instrucciones_nombre || 'N/A')}</span></div>
            </div>
        </div>

        ${bloqueCliente}

        <div class="detalle-seccion">
            <h4><i class="fas fa-car"></i> Vehículo</h4>
            <div class="detalle-grid">
                <div class="detalle-item"><span class="detalle-label">Placa</span><span class="detalle-value placa">${escapeHtml(detalle.placa || 'N/A')}</span></div>
                <div class="detalle-item"><span class="detalle-label">Marca</span><span class="detalle-value">${escapeHtml(detalle.marca || 'N/A')}</span></div>
                <div class="detalle-item"><span class="detalle-label">Modelo</span><span class="detalle-value">${escapeHtml(detalle.modelo || 'N/A')}</span></div>
                <div class="detalle-item"><span class="detalle-label">Año / Km</span><span class="detalle-value">${detalle.anio || 'N/A'} / ${(detalle.kilometraje || 0).toLocaleString()} km</span></div>
            </div>
        </div>

        ${tecnicosHtml}
        ${planificacionHtml}
    `;

    const el = document.getElementById('clienteVehiculoContent');
    if (el) el.innerHTML = html;
}

// =====================================================
// TAB 2: RECEPCIÓN
// =====================================================
function renderTabRecepcion(detalle) {
    const fotosOb = detalle.fotos?.obligatorias || {};
    const fotosOp = detalle.fotos?.opcionales || {};

    let html = `
        <div class="detalle-seccion">
            <h4><i class="fas fa-clipboard-list"></i> Problema Reportado</h4>
            <div class="detalle-descripcion">${escapeHtml(detalle.descripcion_problema || 'Sin descripción registrada')}</div>
            ${detalle.audio_recepcion ? `
                <div class="audio-player">
                    <strong><i class="fas fa-microphone-alt"></i> Audio del cliente:</strong>
                    <audio controls src="${detalle.audio_recepcion}"></audio>
                </div>
            ` : ''}
        </div>
    `;

    if (Object.keys(fotosOb).length) {
        html += `
            <div class="detalle-seccion">
                <h4><i class="fas fa-star" style="color:#C1121F"></i> Fotos Obligatorias (${Object.keys(fotosOb).length}/7)</h4>
                ${renderFotosGrid(fotosOb)}
            </div>`;
    } else {
        html += `<div class="detalle-seccion"><h4><i class="fas fa-camera"></i> Fotos Obligatorias</h4><p style="color:#8E8E93">No hay fotos registradas</p></div>`;
    }

    if (Object.keys(fotosOp).length) {
        html += `
            <div class="detalle-seccion">
                <h4><i class="fas fa-plus-circle" style="color:#6B7280"></i> Fotos Adicionales (${Object.keys(fotosOp).length})</h4>
                ${renderFotosGrid(fotosOp)}
            </div>`;
    }

    const el = document.getElementById('recepcionContent');
    if (el) el.innerHTML = html;
}

// =====================================================
// TAB 3: DIAGNÓSTICOS
// =====================================================
function renderTabDiagnosticos(detalle) {
    let html = '';

    if (detalle.diagnostico_inicial) {
        const d = detalle.diagnostico_inicial;
        html += `
            <div class="detalle-seccion" style="border-left:3px solid #C1121F">
                <h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4>
                <small>${escapeHtml(d.jefe_nombre || 'Jefe')} — ${formatFecha(d.fecha)}</small>
                <div class="detalle-descripcion" style="margin-top:8px">${escapeHtml(d.diagnostico || 'Sin diagnóstico')}</div>
                ${d.audio_url ? `<audio controls src="${d.audio_url}" style="width:100%;margin-top:8px"></audio>` : ''}
            </div>`;
    }

    if (detalle.instrucciones_tecnico) {
        html += `
            <div class="detalle-seccion" style="border-left:3px solid #F59E0B">
                <h4 style="color:#F59E0B"><i class="fas fa-bullhorn"></i> Instrucción Principal</h4>
                <div class="detalle-descripcion">${escapeHtml(detalle.instrucciones_tecnico)}</div>
                <small>${formatFecha(detalle.fecha_instrucciones)}</small>
            </div>`;
    }

    if (detalle.instrucciones?.length) {
        html += `
            <div class="detalle-seccion">
                <h4><i class="fas fa-history"></i> Historial de Instrucciones</h4>
                ${detalle.instrucciones.map(i => `
                    <div style="padding:10px;background:var(--gris-oscuro);border-radius:8px;margin-bottom:8px">
                        <strong>${escapeHtml(i.jefe_nombre || 'Jefe')}</strong>
                        <small style="color:#8E8E93;margin-left:8px">${formatFecha(i.fecha_envio)}</small>
                        <p style="margin:6px 0">${escapeHtml(i.instrucciones)}</p>
                        <small style="color:${i.leida ? '#10B981' : '#F59E0B'}">
                            ${i.leida ? '✅ Leída' : '⏳ Pendiente'} ${i.fecha_leida ? '- ' + formatFecha(i.fecha_leida) : ''}
                        </small>
                    </div>
                `).join('')}
            </div>`;
    }

    if (detalle.diagnosticos_tecnicos?.length) {
        const dts = detalle.diagnosticos_tecnicos.filter(d => !d.es_borrador);
        if (dts.length) {
            html += `<div class="detalle-seccion"><h4><i class="fas fa-microscope"></i> Diagnósticos Técnicos</h4>`;
            dts.forEach(dt => {
                html += `
                    <div style="margin-bottom:12px;padding:12px;background:var(--bg-secondary);border-left:3px solid #C1121F;border-radius:8px">
                        <div style="display:flex;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
                            <strong>Versión ${dt.version} — ${escapeHtml(dt.tecnico_nombre || 'Técnico')}</strong>
                            <small style="color:#8E8E93">${formatFecha(dt.fecha_envio)}</small>
                        </div>
                        <p>${escapeHtml(dt.informe || 'Sin informe')}</p>
                        ${dt.audio_url ? `<audio controls src="${dt.audio_url}" style="width:100%;margin-top:6px"></audio>` : ''}
                        ${dt.fotos?.length ? renderFotosGridList(dt.fotos) : ''}
                        ${dt.observaciones?.length ? `
                            <div style="margin-top:10px;padding:10px;background:rgba(193,18,31,0.08);border-radius:6px">
                                <strong style="font-size:12px;color:#C1121F"><i class="fas fa-comment-dots"></i> Observaciones del Jefe</strong>
                                ${dt.observaciones.map(o => `
                                    <div style="font-size:12px;margin-top:6px;padding-left:8px;border-left:2px solid #C1121F">
                                        ${escapeHtml(o.observacion)}
                                        <small style="color:#8E8E93;display:block">— ${escapeHtml(o.jefe_nombre || 'Jefe')} (${formatFecha(o.fecha)})</small>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            html += `</div>`;
        }
    }

    if (!html) html = '<div class="empty-state"><p>No hay diagnósticos ni instrucciones registradas</p></div>';

    const el = document.getElementById('diagnosticosContent');
    if (el) el.innerHTML = html;
}

// =====================================================
// TAB 4: SERVICIOS Y AVANCES
// =====================================================
function renderTabServiciosAvances(detalle) {
    let html = '';

    if (detalle.cotizacion) {
        const c = detalle.cotizacion;
        html += `
            <div class="detalle-seccion">
                <h4><i class="fas fa-file-invoice-dollar"></i> Cotización</h4>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Estado</span><span class="detalle-value">${escapeHtml(c.estado || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Generada</span><span class="detalle-value">${formatFecha(c.fecha_generacion)}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Por</span><span class="detalle-value">${escapeHtml(c.jefe_taller_nombre || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Total</span><span class="detalle-value" style="color:#10B981;font-weight:700">Bs. ${(c.total || 0).toFixed(2)}</span></div>
                </div>
                ${c.motivo_rechazo ? `<div style="margin-top:8px;padding:8px;background:rgba(220,53,69,0.1);border-radius:6px;color:#ef4444"><strong>Motivo rechazo:</strong> ${escapeHtml(c.motivo_rechazo)}</div>` : ''}
            </div>`;
    }

    if (detalle.servicios?.length) {
        html += `
            <div class="detalle-seccion">
                <h4><i class="fas fa-list"></i> Servicios</h4>
                <div class="servicios-lista">
                    ${detalle.servicios.map(s => `
                        <div style="display:flex;justify-content:space-between;padding:10px;background:var(--gris-oscuro);border-radius:8px;margin-bottom:6px">
                            <span>${s.aprobado ? '<i class="fas fa-check-circle" style="color:#10B981"></i>' : '<i class="fas fa-clock" style="color:#F59E0B"></i>'} ${escapeHtml(s.descripcion)}</span>
                            <strong style="color:#C1121F">Bs. ${s.precio.toFixed(2)}</strong>
                        </div>
                    `).join('')}
                    <div style="display:flex;justify-content:space-between;padding:12px;background:#C1121F;border-radius:8px;color:white;margin-top:8px">
                        <strong>TOTAL</strong>
                        <strong>Bs. ${(detalle.total_servicios || 0).toFixed(2)}</strong>
                    </div>
                </div>
            </div>`;
    }

    if (detalle.avances?.length) {
        html += `<div class="detalle-seccion"><h4><i class="fas fa-tasks"></i> Avances del Trabajo</h4>`;
        detalle.avances.forEach(av => {
            const color = av.estado === 'aprobado' ? '#10B981' : '#F59E0B';
            html += `
                <div style="margin-bottom:12px;padding:12px;background:var(--bg-secondary);border-left:3px solid ${color};border-radius:8px">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
                        <strong>#${av.numero_avance} — ${escapeHtml(av.titulo || '')}</strong>
                        <span style="padding:2px 10px;border-radius:12px;background:${color}22;color:${color};font-size:11px;font-weight:600">${escapeHtml(av.estado || 'N/A')}</span>
                    </div>
                    <small style="color:#8E8E93">${escapeHtml(av.tecnico_nombre || '')} — ${formatFecha(av.fecha_creacion)}</small>
                    ${av.descripcion ? `<p style="margin:8px 0">${escapeHtml(av.descripcion)}</p>` : ''}
                    ${av.comentario_revision ? `<small><i>Revisión:</i> ${escapeHtml(av.comentario_revision)}</small>` : ''}
                    ${av.fecha_aprobacion ? `<div style="margin-top:8px;color:#10B981"><strong><i class="fas fa-check-circle"></i> Aprobado por ${escapeHtml(av.aprobado_por || 'N/A')}</strong> — ${formatFecha(av.fecha_aprobacion)}</div>` : ''}
                    ${av.fotos?.length ? renderFotosGridList(av.fotos.map(f => ({ url_foto: f }))) : ''}
                </div>
            `;
        });
        html += `</div>`;
    }

    if (detalle.control_calidad) {
        const cc = detalle.control_calidad;
        html += `
            <div class="detalle-seccion" style="border-left:3px solid #10B981">
                <h4 style="color:#10B981"><i class="fas fa-shield-alt"></i> Control de Calidad</h4>
                <div class="detalle-grid">
                    <div class="detalle-item"><span class="detalle-label">Aprobado por</span><span class="detalle-value">${escapeHtml(cc.aprobado_por || 'N/A')}</span></div>
                    <div class="detalle-item"><span class="detalle-label">Fecha</span><span class="detalle-value">${formatFecha(cc.fecha_aprobacion)}</span></div>
                </div>
                ${cc.comentario ? `<p style="margin-top:8px">${escapeHtml(cc.comentario)}</p>` : ''}
            </div>`;
    }

    if (!html) html = '<div class="empty-state"><p>No hay servicios ni avances registrados</p></div>';

    const el = document.getElementById('serviciosContent');
    if (el) el.innerHTML = html;
}

// =====================================================
// TAB 5: TIMELINE
// =====================================================
function renderTabTimeline(detalle) {
    let html = '';

    if (detalle.seguimiento?.length) {
        html += `
            <div class="detalle-seccion">
                <h4><i class="fas fa-history"></i> Historial de Estados (${detalle.seguimiento.length})</h4>
                <div class="timeline">
                    ${detalle.seguimiento.map(s => `
                        <div class="timeline-item">
                            <strong>${escapeHtml(s.estado || 'N/A')}</strong>
                            <div class="timeline-fecha">
                                <i class="fas fa-clock"></i> ${formatFecha(s.fecha_hora)}
                            </div>
                            ${s.motivo_pausa ? `<div class="timeline-motivo"><i class="fas fa-pause-circle"></i> ${escapeHtml(s.motivo_pausa)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>`;
    } else {
        html = '<div class="empty-state"><i class="fas fa-stream"></i><p>No hay historial de estados</p></div>';
    }

    const el = document.getElementById('timelineContent');
    if (el) el.innerHTML = html;
}

// =====================================================
// HELPERS DE FOTOS
// =====================================================
const NOMBRES_FOTOS = {
    'url_lateral_izquierda': 'Lateral Izq.',
    'url_lateral_derecha': 'Lateral Der.',
    'url_foto_frontal': 'Frontal',
    'url_foto_trasera': 'Trasera',
    'url_foto_superior': 'Superior',
    'url_foto_inferior': 'Inferior',
    'url_foto_tablero': 'Tablero',
    'url_opcional1': 'Adicional 1',
    'url_opcional2': 'Adicional 2',
    'url_opcional3': 'Adicional 3',
    'url_opcional4': 'Adicional 4',
    'url_opcional5': 'Adicional 5',
    'url_opcional6': 'Adicional 6',
    'url_opcional7': 'Adicional 7',
    'url_opcional8': 'Adicional 8',
    'url_opcional9': 'Adicional 9',
    'url_opcional10': 'Adicional 10'
};

function renderFotosGrid(fotosDict) {
    const items = Object.entries(fotosDict).filter(([k, v]) => v);
    if (!items.length) return '';
    return `<div class="fotos-grid">${items.map(([k, v], idx) => {
        const imgId = `img-${k}-${Date.now()}-${idx}`;
        cargarImagenProxy(v, imgId);
        return `
            <div class="foto-item" onclick="verImagenAmpliadaPorId('${imgId}', '${escapeHtml(NOMBRES_FOTOS[k] || k)}')">
                <div id="${imgId}" class="foto-placeholder"><i class="fas fa-spinner fa-spin"></i></div>
                <div class="foto-label">${escapeHtml(NOMBRES_FOTOS[k] || k)}</div>
            </div>
        `;
    }).join('')}</div>`;
}

function renderFotosGridList(fotos) {
    if (!fotos?.length) return '';
    return `<div class="fotos-grid" style="margin-top:10px">${fotos.map((f, idx) => {
        const url = f.url_foto || f.url;
        if (!url) return '';
        const imgId = `img-dt-${Date.now()}-${idx}`;
        cargarImagenProxy(url, imgId);
        return `
            <div class="foto-item" onclick="verImagenAmpliadaPorId('${imgId}', '${escapeHtml(f.descripcion_tecnico || 'Foto')}')">
                <div id="${imgId}" class="foto-placeholder"><i class="fas fa-spinner fa-spin"></i></div>
                ${f.descripcion_tecnico ? `<div class="foto-label">${escapeHtml(f.descripcion_tecnico.substring(0, 20))}</div>` : ''}
            </div>
        `;
    }).join('')}</div>`;
}

// =====================================================
// CARGAR IMAGEN VÍA PROXY (BASE64)
// =====================================================
async function cargarImagenProxy(url, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;
    if (!url || url === 'null' || url === 'undefined') {
        contenedor.innerHTML = '<div style="color:#8E8E93;font-size:11px;text-align:center">Sin imagen</div>';
        return;
    }

    if (imageCache.has(url)) {
        contenedor.innerHTML = `<img src="${imageCache.get(url)}" style="width:100%;height:100%;object-fit:cover;display:block">`;
        return;
    }

    try {
        const token = localStorage.getItem('furia_token');
        const response = await fetch(`${window.API_BASE_URL}/api/jefe-operativo/proxy-imagen?url=${encodeURIComponent(url)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.success && data.base64) {
            imageCache.set(url, data.base64);
            contenedor.innerHTML = `<img src="${data.base64}" style="width:100%;height:100%;object-fit:cover;display:block">`;
        } else {
            throw new Error(data.error || 'Error');
        }
    } catch (error) {
        console.warn(`⚠️ Error imagen ${url}:`, error.message);
        contenedor.innerHTML = `<div style="color:#ef4444;font-size:11px;text-align:center;display:flex;align-items:center;justify-content:center;height:100%"><i class="fas fa-exclamation-triangle"></i></div>`;
    }
}

// =====================================================
// VER IMAGEN AMPLIADA
// =====================================================
window.verImagenAmpliadaPorId = function (imgId, label) {
    const contenedor = document.getElementById(imgId);
    if (!contenedor) return;
    const img = contenedor.querySelector('img');
    if (!img) { mostrarNotificacion('La imagen aún se está cargando', 'warning'); return; }
    verImagenAmpliada(img.src, label);
};

window.verImagenAmpliada = function (url, label) {
    const modal = document.createElement('div');
    modal.className = 'modal-imagen';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:20px';
    modal.innerHTML = `
        <div style="position:relative;max-width:90%;max-height:90%">
            <button style="position:absolute;top:-40px;right:0;background:none;border:none;color:white;font-size:30px;cursor:pointer">&times;</button>
            <img src="${url}" style="max-width:100%;max-height:80vh;border-radius:8px;display:block">
            <p style="color:white;text-align:center;margin-top:12px;font-size:14px">${escapeHtml(label)}</p>
        </div>`;
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    modal.querySelector('button').addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
};

// =====================================================
// PDF - GENERACIÓN CON JSPDF
// =====================================================
async function descargarPDFHistorial() {
    if (descargandoPDF) { mostrarNotificacion('Ya se está generando el PDF...', 'warning'); return; }
    if (!ordenActualDetalle) { mostrarNotificacion('No hay orden cargada', 'warning'); return; }

    descargandoPDF = true;
    const btn = document.getElementById('btnGenerarPDF');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando PDF...'; }

    try {
        // 1. Cargar jsPDF
        if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        const { jsPDF } = window.jspdf || jspdf;
        const detalle = ordenActualDetalle;

        // 2. Convertir fotos a base64 (usa cache)
        const fotosOb = detalle.fotos?.obligatorias || {};
        const fotosOp = detalle.fotos?.opcionales || {};
        const fotosObBase64 = {};
        const fotosOpBase64 = {};

        for (const [k, url] of Object.entries(fotosOb)) {
            const b64 = await getBase64(url);
            if (b64) fotosObBase64[k] = b64;
        }
        for (const [k, url] of Object.entries(fotosOp)) {
            const b64 = await getBase64(url);
            if (b64) fotosOpBase64[k] = b64;
        }

        // 3. Construir PDF
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: true });
        const PAGE_W = 215.9;
        const PAGE_H = 279.4;
        const MARGEN = 12;
        const ANCHO = PAGE_W - MARGEN * 2;
        let y = MARGEN;
        const COLOR_ROJO = [193, 18, 31];
        const COLOR_GRIS = [90, 90, 90];
        const COLOR_FONDO = [245, 245, 245];
        const COLOR_CLARO = [200, 200, 200];

        const nuevaPaginaSi = (necesario) => {
            if (y + necesario > PAGE_H - 15) {
                pdf.addPage();
                y = MARGEN;
                dibujarHeader();
            }
        };

        const dibujarHeader = () => {
            pdf.setFillColor(...COLOR_ROJO);
            pdf.rect(0, 0, PAGE_W, 2, 'F');
            pdf.setTextColor(...COLOR_ROJO);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(18);
            pdf.text('FURIA', MARGEN, MARGEN + 6);
            pdf.setTextColor(60, 60, 60);
            pdf.text('MOTOR', MARGEN + 23, MARGEN + 6);
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...COLOR_GRIS);
            pdf.text('TALLER AUTOMOTRIZ ESPECIALIZADO', MARGEN, MARGEN + 10);
            pdf.setTextColor(...COLOR_ROJO);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.text('FURIA MOTOR COMPANY', PAGE_W - MARGEN, MARGEN + 3, { align: 'right' });
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(...COLOR_GRIS);
            pdf.text('74080830 - 68176122', PAGE_W - MARGEN, MARGEN + 6.5, { align: 'right' });
            pdf.text('Av. del Policia N 25 entre Calle 1 y Calle 3', PAGE_W - MARGEN, MARGEN + 10, { align: 'right' });
            pdf.text('Alto Seguencoma, La Paz - Bolivia', PAGE_W - MARGEN, MARGEN + 13.5, { align: 'right' });
            pdf.setDrawColor(...COLOR_ROJO);
            pdf.setLineWidth(0.5);
            pdf.line(MARGEN, MARGEN + 16, PAGE_W - MARGEN, MARGEN + 16);
        };

        const seccion = (titulo) => {
            nuevaPaginaSi(15);
            pdf.setFillColor(...COLOR_FONDO);
            pdf.rect(MARGEN, y, ANCHO, 8, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(...COLOR_ROJO);
            pdf.text(titulo, MARGEN + 3, y + 5.5);
            y += 11;
        };

        const dibujarCaja = (x, ancho, alto, titulo, lineas) => {
            pdf.setFillColor(...COLOR_FONDO);
            pdf.rect(x, y, ancho, alto, 'F');
            pdf.setDrawColor(...COLOR_CLARO);
            pdf.setLineWidth(0.2);
            pdf.rect(x, y, ancho, alto);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.setTextColor(...COLOR_ROJO);
            pdf.text(titulo, x + 3, y + 5);
            pdf.setDrawColor(...COLOR_CLARO);
            pdf.line(x + 3, y + 6.5, x + ancho - 3, y + 6.5);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(60, 60, 60);
            let ly = y + 10.5;
            for (const l of lineas) {
                if (l) {
                    const txt = String(l);
                    pdf.text(txt.length > 80 ? txt.substring(0, 78) + '...' : txt, x + 3, ly);
                    ly += 4.2;
                }
            }
        };

        const dibujarFoto = async (x, yPos, w, h, base64, label) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const aspect = img.height / img.width;
                    let fw = w, fh = w * aspect;
                    if (fh > h) { fh = h; fw = h / aspect; }
                    const xImg = x + (w - fw) / 2;
                    const yImg = yPos + (h - fh) / 2;
                    pdf.setFillColor(240, 240, 240);
                    pdf.rect(x, yPos, w, h, 'F');
                    try { pdf.addImage(base64, 'JPEG', xImg, yImg, fw, fh); } catch (e) { console.warn(e); }
                    pdf.setDrawColor(...COLOR_CLARO);
                    pdf.setLineWidth(0.2);
                    pdf.rect(x, yPos, w, h);
                    if (label) {
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(6.5);
                        pdf.setTextColor(...COLOR_GRIS);
                        pdf.text(label, x + w / 2, yPos + h + 3, { align: 'center' });
                    }
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = base64;
            });
        };

        // ---- PORTADA ----
        dibujarHeader();
        y = MARGEN + 20;

        pdf.setTextColor(...COLOR_ROJO);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text('ORDEN DE TRABAJO - HISTORIAL COMPLETO', PAGE_W / 2, y, { align: 'center' });
        y += 6;
        pdf.setFontSize(11);
        pdf.setTextColor(60, 60, 60);
        pdf.text(`# ${detalle.codigo_unico}`, PAGE_W / 2, y, { align: 'center' });
        y += 8;

        pdf.setFillColor(...COLOR_FONDO);
        pdf.rect(MARGEN, y, ANCHO, 8, 'F');
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Fecha ingreso: ${formatFecha(detalle.fecha_ingreso)}`, MARGEN + 3, y + 5);
        pdf.text(`Estado: ${getEstadoText(detalle.estado_global)}`, PAGE_W - MARGEN - 3, y + 5, { align: 'right' });
        y += 12;

        const c = detalle.cliente || {};
        const anchoMitad = (ANCHO - 4) / 2;
        const esProp = c.es_propietario !== false;

        dibujarCaja(MARGEN, anchoMitad, 30, esProp ? 'CLIENTE (DUEÑO)' : 'TERCERO', esProp ? [
            `Nombre: ${c.nombre || 'N/A'}`,
            `Teléfono: ${c.telefono || 'N/A'}`,
            `Documento: ${c.documento || 'N/A'}`
        ] : [
            `Nombre: ${c.nombre_tercero || c.nombre || 'N/A'}`,
            `Teléfono: ${c.telefono_tercero || c.telefono || 'N/A'}`,
            `Tipo: ${c.tipo_tercero || 'N/A'}`
        ]);

        const xDer = MARGEN + anchoMitad + 4;
        dibujarCaja(xDer, anchoMitad, 30, 'VEHÍCULO', [
            `Placa: ${detalle.placa || 'N/A'}`,
            `Marca: ${detalle.marca || 'N/A'}`,
            `Modelo: ${detalle.modelo || 'N/A'}`,
            `Año: ${detalle.anio || 'N/A'} | Km: ${(detalle.kilometraje || 0).toLocaleString()}`
        ]);
        y += 34;

        // ---- RECEPCIÓN ----
        if (detalle.descripcion_problema) {
            seccion('RECEPCIÓN - PROBLEMA REPORTADO');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            const lineas = pdf.splitTextToSize(detalle.descripcion_problema, ANCHO - 6);
            const alto = Math.max(15, lineas.length * 4 + 8);
            nuevaPaginaSi(alto + 5);
            pdf.setFillColor(255, 255, 255);
            pdf.rect(MARGEN, y, ANCHO, alto, 'F');
            pdf.setDrawColor(...COLOR_CLARO);
            pdf.rect(MARGEN, y, ANCHO, alto);
            pdf.text(lineas, MARGEN + 3, y + 6);
            y += alto + 5;
        }

        // Fotos obligatorias
        if (Object.keys(fotosObBase64).length) {
            seccion(`FOTOS OBLIGATORIAS (${Object.keys(fotosObBase64).length}/7)`);
            const gap = 3;
            const wF = (ANCHO - gap * 3) / 4;
            const hF = wF * 0.85;
            const items = Object.entries(fotosObBase64);

            nuevaPaginaSi(hF + 10);
            for (let i = 0; i < 4; i++) {
                const item = items[i];
                const x = MARGEN + i * (wF + gap);
                if (item) await dibujarFoto(x, y, wF, hF, item[1], NOMBRES_FOTOS[item[0]]);
            }
            y += hF + 8;

            if (items.length > 4) {
                nuevaPaginaSi(hF + 10);
                const wTotal = wF * 3 + gap * 2;
                const xIni = (PAGE_W - wTotal) / 2;
                for (let i = 4; i < 7; i++) {
                    const item = items[i];
                    const x = xIni + (i - 4) * (wF + gap);
                    if (item) await dibujarFoto(x, y, wF, hF, item[1], NOMBRES_FOTOS[item[0]]);
                }
                y += hF + 8;
            }
        }

        // Fotos opcionales
        if (Object.keys(fotosOpBase64).length) {
            pdf.addPage();
            dibujarHeader();
            y = MARGEN + 20;
            seccion(`FOTOS ADICIONALES (${Object.keys(fotosOpBase64).length})`);
            const gap = 3;
            const wF = (ANCHO - gap * 2) / 3;
            const hF = wF * 0.85;
            const items = Object.entries(fotosOpBase64);
            for (let i = 0; i < items.length; i += 3) {
                nuevaPaginaSi(hF + 15);
                for (let j = 0; j < 3; j++) {
                    const item = items[i + j];
                    const x = MARGEN + j * (wF + gap);
                    if (item) await dibujarFoto(x, y, wF, hF, item[1], NOMBRES_FOTOS[item[0]]);
                }
                y += hF + 8;
            }
        }

        // ---- DIAGNÓSTICOS ----
        if (detalle.diagnostico_inicial || detalle.diagnosticos_tecnicos?.length) {
            pdf.addPage();
            dibujarHeader();
            y = MARGEN + 20;
            seccion('DIAGNÓSTICOS');

            if (detalle.diagnostico_inicial) {
                const d = detalle.diagnostico_inicial;
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9);
                pdf.setTextColor(...COLOR_ROJO);
                pdf.text(`Diagnóstico Inicial — ${d.jefe_nombre || 'Jefe'} (${formatFecha(d.fecha)})`, MARGEN, y);
                y += 5;
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(60, 60, 60);
                const l = pdf.splitTextToSize(d.diagnostico || '', ANCHO);
                pdf.text(l, MARGEN, y);
                y += l.length * 4 + 6;
            }

            (detalle.diagnosticos_tecnicos || []).filter(x => !x.es_borrador).forEach(dt => {
                nuevaPaginaSi(35);
                pdf.setFillColor(...COLOR_FONDO);
                pdf.rect(MARGEN, y, ANCHO, 7, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8.5);
                pdf.setTextColor(...COLOR_ROJO);
                pdf.text(`Versión ${dt.version} — ${dt.tecnico_nombre || 'Técnico'}`, MARGEN + 2, y + 5);
                y += 10;
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(60, 60, 60);
                const l = pdf.splitTextToSize(dt.informe || 'Sin informe', ANCHO);
                const alto = Math.min(l.length * 4 + 4, 60);
                pdf.text(l.slice(0, 14), MARGEN, y);
                y += alto + 4;
                if (dt.observaciones?.length) {
                    pdf.setFont('helvetica', 'italic');
                    pdf.setFontSize(7.5);
                    dt.observaciones.forEach(o => {
                        pdf.text(`• ${o.observacion} (${o.jefe_nombre || ''})`, MARGEN + 4, y);
                        y += 4;
                    });
                    y += 2;
                }
            });
        }

        // ---- INSTRUCCIONES ----
        if (detalle.instrucciones_tecnico || detalle.instrucciones?.length) {
            seccion('INSTRUCCIONES AL TÉCNICO');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(60, 60, 60);
            if (detalle.instrucciones_tecnico) {
                const l = pdf.splitTextToSize(detalle.instrucciones_tecnico, ANCHO);
                nuevaPaginaSi(l.length * 4 + 5);
                pdf.text(l, MARGEN, y);
                y += l.length * 4 + 4;
            }
            (detalle.instrucciones || []).forEach(i => {
                nuevaPaginaSi(12);
                pdf.setFont('helvetica', 'bold');
                pdf.text(`${i.jefe_nombre || 'Jefe'} (${formatFecha(i.fecha_envio)}):`, MARGEN, y);
                y += 4;
                pdf.setFont('helvetica', 'normal');
                const l = pdf.splitTextToSize(i.instrucciones || '', ANCHO - 4);
                pdf.text(l, MARGEN + 4, y);
                y += l.length * 4 + 4;
            });
            y += 3;
        }

        // ---- SERVICIOS ----
        if (detalle.servicios?.length) {
            pdf.addPage();
            dibujarHeader();
            y = MARGEN + 20;
            seccion('COTIZACIÓN Y SERVICIOS');

            pdf.setFillColor(...COLOR_ROJO);
            pdf.rect(MARGEN, y, ANCHO, 6, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(255, 255, 255);
            pdf.text('Descripción', MARGEN + 3, y + 4);
            pdf.text('Aprobado', PAGE_W - MARGEN - 45, y + 4, { align: 'center' });
            pdf.text('Precio', PAGE_W - MARGEN - 3, y + 4, { align: 'right' });
            y += 8;

            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(60, 60, 60);
            detalle.servicios.forEach(s => {
                nuevaPaginaSi(8);
                const desc = String(s.descripcion || '').substring(0, 70);
                pdf.text(desc, MARGEN + 3, y);
                pdf.text(s.aprobado ? 'SI' : 'NO', PAGE_W - MARGEN - 45, y, { align: 'center' });
                pdf.text(`Bs. ${s.precio.toFixed(2)}`, PAGE_W - MARGEN - 3, y, { align: 'right' });
                y += 5;
            });

            y += 2;
            pdf.setDrawColor(...COLOR_ROJO);
            pdf.setLineWidth(0.5);
            pdf.line(MARGEN, y, PAGE_W - MARGEN, y);
            y += 5;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(...COLOR_ROJO);
            pdf.text('TOTAL:', MARGEN + 3, y);
            pdf.text(`Bs. ${(detalle.total_servicios || 0).toFixed(2)}`, PAGE_W - MARGEN - 3, y, { align: 'right' });
            y += 10;
        }

        // ---- AVANCES ----
        if (detalle.avances?.length) {
            seccion('AVANCES DEL TRABAJO');
            detalle.avances.forEach(av => {
                nuevaPaginaSi(20);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8.5);
                pdf.setTextColor(...COLOR_ROJO);
                pdf.text(`#${av.numero_avance} ${av.titulo || ''}`, MARGEN, y);
                y += 4;
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7.5);
                pdf.setTextColor(...COLOR_GRIS);
                pdf.text(`${av.tecnico_nombre || ''} — ${formatFecha(av.fecha_creacion)} — Estado: ${av.estado || 'N/A'}`, MARGEN, y);
                y += 4;
                if (av.descripcion) {
                    pdf.setTextColor(60, 60, 60);
                    const l = pdf.splitTextToSize(av.descripcion, ANCHO);
                    pdf.text(l.slice(0, 6), MARGEN, y);
                    y += Math.min(l.length, 6) * 4 + 2;
                }
                if (av.fecha_aprobacion) {
                    pdf.setTextColor(16, 185, 129);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(`OK Aprobado por ${av.aprobado_por || ''} — ${formatFecha(av.fecha_aprobacion)}`, MARGEN, y);
                    y += 5;
                }
                y += 2;
            });
        }

        // ---- CONTROL DE CALIDAD ----
        if (detalle.control_calidad) {
            seccion('CONTROL DE CALIDAD');
            const cc = detalle.control_calidad;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(60, 60, 60);
            pdf.text(`Aprobado por: ${cc.aprobado_por || 'N/A'}`, MARGEN, y);
            y += 5;
            pdf.text(`Fecha: ${formatFecha(cc.fecha_aprobacion)}`, MARGEN, y);
            y += 5;
            if (cc.comentario) {
                const l = pdf.splitTextToSize(cc.comentario, ANCHO);
                pdf.text(l, MARGEN, y);
                y += l.length * 4 + 4;
            }
            y += 4;
        }

        // ---- TIMELINE ----
        if (detalle.seguimiento?.length) {
            seccion('HISTORIAL DE ESTADOS');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7.5);
            detalle.seguimiento.forEach(s => {
                nuevaPaginaSi(6);
                pdf.setTextColor(60, 60, 60);
                pdf.text(`${formatFecha(s.fecha_hora)} — ${s.estado || ''}${s.motivo_pausa ? ' (' + s.motivo_pausa + ')' : ''}`, MARGEN + 3, y);
                y += 4;
            });
        }

        // ---- FIRMAS ----
        pdf.addPage();
        dibujarHeader();
        y = MARGEN + 25;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(...COLOR_ROJO);
        pdf.text('FIRMAS DE CONFORMIDAD', PAGE_W / 2, y, { align: 'center' });
        y += 30;

        const firmaY = y;
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.4);
        pdf.line(MARGEN + 10, firmaY, MARGEN + 80, firmaY);
        pdf.line(PAGE_W - MARGEN - 80, firmaY, PAGE_W - MARGEN - 10, firmaY);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(60, 60, 60);
        pdf.text('FIRMA DEL CLIENTE', MARGEN + 45, firmaY + 4, { align: 'center' });
        pdf.text('FIRMA DEL JEFE TALLER', PAGE_W - MARGEN - 45, firmaY + 4, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(c.nombre || '____________________', MARGEN + 45, firmaY + 9, { align: 'center' });
        pdf.text(detalle.jefe_taller_instrucciones_nombre || '____________________', PAGE_W - MARGEN - 45, firmaY + 9, { align: 'center' });

        const fechaHoy = new Date().toLocaleDateString('es-ES');
        pdf.setFontSize(7);
        pdf.setTextColor(...COLOR_GRIS);
        pdf.text(fechaHoy, MARGEN + 45, firmaY + 14, { align: 'center' });
        pdf.text(fechaHoy, PAGE_W - MARGEN - 45, firmaY + 14, { align: 'center' });

        // Footer
        const totalPags = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPags; i++) {
            pdf.setPage(i);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(6.5);
            pdf.setTextColor(180, 180, 180);
            pdf.text(`FURIA MOTOR | ${detalle.codigo_unico} | Página ${i} de ${totalPags}`, PAGE_W / 2, PAGE_H - 5, { align: 'center' });
        }

        // 4. Descargar
        const nombre = `Historial_${detalle.codigo_unico}.pdf`;
        const blob = pdf.output('blob');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = nombre;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        mostrarNotificacion('✅ PDF descargado correctamente', 'success');

        // 5. Intentar subir a Drive (opcional, no rompe si falla)
        try {
            const reader = new FileReader();
            const base64 = await new Promise(resolve => {
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
            const token = localStorage.getItem('furia_token');
            const subida = await fetch(`${window.API_BASE_URL}/api/jefe-taller/subir-pdf-historial`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ pdf_base64: base64, id_orden: detalle.id, codigo_unico: detalle.codigo_unico })
            });
            if (subida.ok) console.log('✅ PDF subido a Drive');
            else console.warn('⚠️ No se pudo subir a Drive (endpoint no existe o falló)');
        } catch (e) {
            console.warn('⚠️ No se pudo subir a Drive:', e);
        }

    } catch (error) {
        console.error('Error generando PDF:', error);
        mostrarNotificacion('Error al generar PDF: ' + error.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        descargandoPDF = false;
    }
}

// =====================================================
// CACHE / CONVERSIÓN BASE64
// =====================================================
async function getBase64(url) {
    if (!url || url === 'null' || url === 'undefined') return null;
    if (imageCache.has(url)) return imageCache.get(url);
    try {
        const token = localStorage.getItem('furia_token');
        const r = await fetch(`${window.API_BASE_URL}/api/jefe-operativo/proxy-imagen?url=${encodeURIComponent(url)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!r.ok) return null;
        const data = await r.json();
        if (data.success && data.base64) {
            imageCache.set(url, data.base64);
            return data.base64;
        }
        return null;
    } catch (e) {
        console.warn('Error base64:', e);
        return null;
    }
}

// =====================================================
// HELPERS DE ESTADO Y FECHA
// =====================================================
function getEstadoClass(estado) {
    if (!estado) return '';
    const map = {
        'Entregado': 'Entregado',
        'Finalizado': 'Finalizado',
        'EnReparacion': 'EnReparacion',
        'EnDiagnostico': 'EnDiagnostico',
        'EnRecepcion': 'EnRecepcion',
        'EnPausa': 'EnPausa',
        'ReparacionCompletada': 'ReparacionCompletada',
        'EnProceso': 'EnProceso'
    };
    return map[estado] || '';
}

function getEstadoText(estado) {
    if (!estado) return 'Desconocido';
    const map = {
        'Entregado': 'Entregado',
        'Finalizado': 'Finalizado',
        'EnReparacion': 'En Reparación',
        'EnDiagnostico': 'En Diagnóstico',
        'EnRecepcion': 'En Recepción',
        'EnPausa': 'En Pausa',
        'ReparacionCompletada': 'Reparación Completada',
        'EnProceso': 'En Proceso'
    };
    return map[estado] || estado;
}

function formatFecha(fecha) {
    if (!fecha) return 'N/A';
    try {
        const date = new Date(fecha);
        if (isNaN(date.getTime())) return String(fecha).split('T')[0];
        return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return String(fecha);
    }
}

function mostrarFechaActual() {
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
    const el = document.getElementById('currentDate');
    if (el) el.textContent = fecha;
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// =====================================================
// LOADING / ERRORES / EMPTY
// =====================================================
function mostrarLoading(container, mensaje) {
    container.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>${escapeHtml(mensaje)}</p></div>`;
}

function mostrarError(container, mensaje) {
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Error</h3>
            <p>${escapeHtml(mensaje)}</p>
            <button class="btn-buscar" onclick="cargarUltimasOrdenes()">
                <i class="fas fa-sync-alt"></i> Reintentar
            </button>
        </div>`;
}

function mostrarSinResultados(container, mensaje) {
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-search"></i>
            <h3>Sin resultados</h3>
            <p>${escapeHtml(mensaje)}</p>
            <button class="btn-buscar" onclick="cargarUltimasOrdenes()">
                <i class="fas fa-history"></i> Ver últimas órdenes
            </button>
        </div>`;
}

// =====================================================
// TOASTS
// =====================================================
function mostrarNotificacion(mensaje, tipo = 'info') {
    document.querySelectorAll('.toast-notification').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    toast.innerHTML = `<i class="fas ${icons[tipo] || icons.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
}

// =====================================================
// TABS DEL MODAL
// =====================================================
function setupModalTabs() {
    const tabs = document.querySelectorAll('.modal-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            const tabId = this.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
            const active = document.getElementById(`tab-${tabId}`);
            if (active) active.classList.add('active');
        });
    });
}

// =====================================================
// EVENTOS
// =====================================================
function configurarEventListeners() {
    document.getElementById('btnBuscar')?.addEventListener('click', buscarHistorial);
    document.getElementById('btnLimpiar')?.addEventListener('click', () => {
        const sp = document.getElementById('searchPlaca');
        const fe = document.getElementById('filterEstado');
        const fd = document.getElementById('fechaDesde');
        const fh = document.getElementById('fechaHasta');
        if (sp) sp.value = '';
        if (fe) fe.value = '';
        if (fd) fd.value = '';
        if (fh) fh.value = '';
        cargarUltimasOrdenes();
    });
    document.getElementById('searchPlaca')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') buscarHistorial();
    });
    document.getElementById('btnGenerarPDF')?.addEventListener('click', descargarPDFHistorial);
}

// =====================================================
// CERRAR MODALES
// =====================================================
window.cerrarModalDetalle = function () {
    document.getElementById('modalDetalleOrden')?.classList.remove('show');
    ordenActualDetalle = null;
};

window.cerrarModalImagen = function () {
    document.getElementById('modalImagen')?.classList.remove('show');
};

// Cerrar con ESC
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.getElementById('modalDetalleOrden')?.classList.remove('show');
        document.getElementById('modalImagen')?.classList.remove('show');
        document.querySelectorAll('.modal-imagen').forEach(m => m.remove());
    }
});