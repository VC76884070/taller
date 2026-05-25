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
// DIAGNÓSTICO TÉCNICO - TÉCNICO MECÁNICO
// FURIA MOTOR COMPANY SRL - VERSIÓN COMPLETA
// INCLUYE: DIAGNÓSTICO + ARMADO DE VEHÍCULOS + DETALLES
// VERSIÓN CORREGIDA CON URL DINÁMICA PARA PRODUCCIÓN
// =====================================================

let token = null;
let userInfo = null;
let ordenesTecnico = [];
let ordenSeleccionada = null;
let serviciosLista = [];
let fotosSubidas = [{}, {}];
let mediaRecorder = null;
let audioChunks = [];
let grabando = false;
let audioUrlSubido = null;
let diagnosticoActual = null;

// =====================================================
// UTILIDADES
// =====================================================

function getToken() {
    const localToken = localStorage.getItem('furia_token');
    if (localToken) return localToken;
    return null;
}

function mostrarFechaActual() {
    const fechaSpan = document.getElementById('currentDate');
    if (fechaSpan) {
        const hoy = new Date();
        const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
        fechaSpan.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-exclamation-circle' : 
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 3500);
    }, 3500);
}

function formatFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const fecha = new Date(fechaStr);
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarLoading(mostrar) {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        overlay.innerHTML = '<div style="background: white; padding: 20px; border-radius: 12px;"><i class="fas fa-spinner fa-pulse fa-2x"></i><p style="margin-top: 10px;">Cargando...</p></div>';
        document.body.appendChild(overlay);
    }
    overlay.style.display = mostrar ? 'flex' : 'none';
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

// =====================================================
// VERIFICACIÓN DE AUTENTICACIÓN
// =====================================================

async function verificarToken() {
    token = getToken();
    
    if (!token) {
        console.error('No hay token');
        window.location.href = '/';
        return false;
    }
    
    try {
        const userData = localStorage.getItem('furia_user');
        if (userData) {
            userInfo = JSON.parse(userData);
        }
        
        const response = await fetch(`${window.API_BASE_URL}/api/verify-token`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.valid) {
            console.error('Token inválido');
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        if (data.user) {
            userInfo = data.user;
            localStorage.setItem('furia_user', JSON.stringify(userInfo));
        }
        
        const roles = userInfo.roles || [];
        const tieneRolTecnico = roles.includes('tecnico');
        
        if (!tieneRolTecnico) {
            console.error('No tiene rol de técnico');
            showToast('No tienes permisos de técnico', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return false;
        }
        
        console.log('✅ Autenticación exitosa - Técnico');
        return true;
        
    } catch (error) {
        console.error('Error verificando token:', error);
        window.location.href = '/';
        return false;
    }
}

// =====================================================
// CARGA DE ÓRDENES DEL TÉCNICO
// =====================================================

async function cargarOrdenes() {
    const container = document.getElementById('ordenesContainer');
    if (container) {
        container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-pulse"></i> Cargando órdenes...</div>';
    }
    
    try {
        console.log('Cargando órdenes...');
        const response = await fetch(`${window.API_BASE_URL}/tecnico/api/ordenes-tecnico`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        console.log('Órdenes recibidas:', data);
        
        if (data.success) {
            ordenesTecnico = data.ordenes || [];
            
            // Para cada orden en estado EN_ARMADO, cargar instrucciones
            for (let orden of ordenesTecnico) {
                if (orden.estado_global === 'EnArmadoVehiculo') {
                    try {
                        const instruccionesResp = await fetch(`${window.API_BASE_URL}/tecnico/api/orden/${orden.orden_id}/instrucciones-armado`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const instruccionesData = await instruccionesResp.json();
                        if (instruccionesData.success) {
                            orden.instrucciones_armado = instruccionesData.instrucciones;
                            orden.fecha_instrucciones = instruccionesData.fecha_envio;
                        }
                    } catch (e) {
                        console.error('Error cargando instrucciones:', e);
                    }
                }
            }
            
            renderizarOrdenes();
            actualizarSelectorOrdenes();
            
            if (ordenesTecnico.length === 0) {
                showToast('No tienes órdenes de trabajo asignadas', 'warning');
            } else {
                console.log(`${ordenesTecnico.length} órden(es) cargada(s)`);
            }
        } else {
            showToast(data.error || 'Error al cargar órdenes', 'error');
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        if (container) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar órdenes</p><button onclick="cargarOrdenes()" class="btn-retry">Reintentar</button></div>';
        }
        showToast('Error al cargar órdenes', 'error');
    }
}

function actualizarSelectorOrdenes() {
    const select = document.getElementById('ordenSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Seleccione una orden --</option>';
    
    const ordenesDiagnostico = ordenesTecnico.filter(o => o.estado_global !== 'EnArmadoVehiculo');
    
    ordenesDiagnostico.forEach(orden => {
        const ordenId = orden.orden_id;
        if (!ordenId) return;
        
        const option = document.createElement('option');
        option.value = String(ordenId);
        
        const vehiculo = orden.vehiculo || {};
        let estadoIcon = '';
        if (orden.diagnostico_estado === 'aprobado') estadoIcon = '✅';
        else if (orden.diagnostico_estado === 'rechazado') estadoIcon = '❌';
        else if (orden.tiene_diagnostico) estadoIcon = '📝';
        else estadoIcon = '🆕';
        
        option.textContent = `${orden.codigo_unico} - ${vehiculo.placa || 'SIN PLACA'} (${vehiculo.marca || ''} ${vehiculo.modelo || ''}) ${estadoIcon}`;
        select.appendChild(option);
    });
    
    console.log('✅ Selector actualizado con', ordenesDiagnostico.length, 'órdenes para diagnóstico');
}

// =====================================================
// RENDERIZADO DE ÓRDENES (TARJETAS)
// =====================================================

function renderizarOrdenes() {
    const container = document.getElementById('ordenesContainer');
    if (!container) {
        console.log('Contenedor de órdenes no encontrado');
        return;
    }
    
    if (!ordenesTecnico || ordenesTecnico.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <p>No tienes órdenes asignadas actualmente</p>
                <small>Las órdenes aparecerán aquí cuando te sean asignadas</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ordenesTecnico.map(orden => {
        const vehiculo = orden.vehiculo || {};
        const estadoGlobal = orden.estado_global;
        const esArmado = estadoGlobal === 'EnArmadoVehiculo';
        const tieneDiagnostico = orden.tiene_diagnostico;
        const diagnosticoEstado = orden.diagnostico_estado;
        
        let estadoBadge = '';
        let estadoColor = '';
        
        if (esArmado) {
            estadoBadge = '<span class="estado-badge estado-armado"><i class="fas fa-tools"></i> 🔧 ARMADO REQUERIDO</span>';
            estadoColor = 'armado';
        } else if (diagnosticoEstado === 'aprobado') {
            estadoBadge = '<span class="estado-badge estado-aprobado"><i class="fas fa-check-circle"></i> ✅ DIAGNÓSTICO APROBADO</span>';
            estadoColor = 'aprobado';
        } else if (diagnosticoEstado === 'rechazado') {
            estadoBadge = '<span class="estado-badge estado-rechazado"><i class="fas fa-times-circle"></i> ❌ RECHAZADO - CORREGIR</span>';
            estadoColor = 'rechazado';
        } else if (tieneDiagnostico && diagnosticoEstado === 'pendiente') {
            estadoBadge = '<span class="estado-badge estado-pendiente"><i class="fas fa-clock"></i> ⏳ EN REVISIÓN</span>';
            estadoColor = 'pendiente';
        } else if (tieneDiagnostico) {
            estadoBadge = '<span class="estado-badge estado-borrador"><i class="fas fa-pencil-alt"></i> 📝 BORRADOR GUARDADO</span>';
            estadoColor = 'borrador';
        } else {
            estadoBadge = '<span class="estado-badge estado-nuevo"><i class="fas fa-plus-circle"></i> 🆕 NUEVO - PENDIENTE</span>';
            estadoColor = 'nuevo';
        }
        
        let instruccionesHtml = '';
        let botonArmadoHtml = '';
        
        if (esArmado && orden.instrucciones_armado) {
            instruccionesHtml = `
                <div class="instrucciones-armado">
                    <div class="instrucciones-header">
                        <i class="fas fa-clipboard-list"></i>
                        <strong>📋 Instrucciones del Jefe de Taller:</strong>
                    </div>
                    <div class="instrucciones-contenido">
                        ${escapeHtml(orden.instrucciones_armado).replace(/\n/g, '<br>')}
                    </div>
                    <div class="instrucciones-fecha">
                        <i class="far fa-calendar-alt"></i> 
                        📅 Enviado: ${formatFecha(orden.fecha_instrucciones || orden.fecha_asignacion)}
                    </div>
                </div>
            `;
            
            botonArmadoHtml = `
                <button class="btn-armado-completar" onclick="marcarArmadoCompletadoDesdeTarjeta(${orden.orden_id}, '${escapeHtml(orden.codigo_unico)}')">
                    <i class="fas fa-check-circle"></i> ✅ Marcar Armado Completado
                </button>
            `;
        }
        
        let botonesDiagnostico = '';
        if (!esArmado) {
            if (tieneDiagnostico && diagnosticoEstado !== 'aprobado') {
                botonesDiagnostico = `
                    <button class="btn-editar" onclick="editarDiagnostico(${orden.orden_id})">
                        <i class="fas fa-edit"></i> Editar Diagnóstico
                    </button>
                `;
            } else if (!tieneDiagnostico) {
                botonesDiagnostico = `
                    <button class="btn-nuevo" onclick="nuevoDiagnostico(${orden.orden_id})">
                        <i class="fas fa-plus-circle"></i> Nuevo Diagnóstico
                    </button>
                `;
            } else if (diagnosticoEstado === 'aprobado') {
                botonesDiagnostico = `
                    <button class="btn-aprobado" disabled>
                        <i class="fas fa-check-circle"></i> Diagnóstico Aprobado
                    </button>
                `;
            }
        }
        
        return `
            <div class="orden-card ${estadoColor}">
                <div class="orden-header">
                    <div class="orden-info">
                        <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                        <span class="orden-placa"><i class="fas fa-car"></i> ${escapeHtml(vehiculo.placa || 'N/A')}</span>
                    </div>
                    ${estadoBadge}
                </div>
                
                <div class="orden-body">
                    <div class="vehiculo-detalles">
                        <div><i class="fas fa-car-side"></i> ${escapeHtml(vehiculo.marca || '')} ${escapeHtml(vehiculo.modelo || '')}</div>
                        <div><i class="fas fa-calendar"></i> Año: ${vehiculo.anio || 'N/A'}</div>
                        <div><i class="fas fa-tachometer-alt"></i> Km: ${(vehiculo.kilometraje || 0).toLocaleString()} km</div>
                        <div><i class="fas fa-calendar-alt"></i> Ingreso: ${formatFecha(orden.fecha_ingreso)}</div>
                    </div>
                    
                    ${instruccionesHtml}
                </div>
                
                <div class="orden-footer">
                    ${botonesDiagnostico}
                    ${botonArmadoHtml}
                    <button class="btn-detalles" onclick="verDetallesOrden(${orden.orden_id}, '${escapeHtml(orden.codigo_unico)}')">
                        <i class="fas fa-eye"></i> Ver Detalles
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// VER DETALLES COMPLETOS DE LA ORDEN
// =====================================================

async function verDetallesOrden(id_orden, codigo) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${window.API_BASE_URL}/tecnico/api/orden/${id_orden}/detalles-completos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarModalDetalles(data);
        } else {
            showToast(data.error || 'Error al cargar detalles', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar detalles', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarModalDetalles(data) {
    const orden = data.orden;
    const recepcion = data.recepcion;
    const diagnosticoActual = data.diagnostico_actual;
    const diagnosticosAnteriores = data.diagnosticos_anteriores || [];
    const observaciones = data.observaciones || [];
    const cotizacion = data.cotizacion || null;
    const instruccionesArmado = data.instrucciones_armado || null;
    
    let html = `
        <div class="detalles-container">
            <div class="detalles-header">
                <h3><i class="fas fa-tag"></i> Orden: ${escapeHtml(orden.codigo_unico)}</h3>
                <span class="estado-badge estado-${(orden.estado_global || 'pendiente').toLowerCase()}">${escapeHtml(orden.estado_global || 'Pendiente')}</span>
            </div>
            
            <!-- Información del Vehículo -->
            <div class="detalles-seccion">
                <h4><i class="fas fa-car"></i> Información del Vehículo</h4>
                <div class="info-grid">
                    <div><span>Placa:</span> <strong>${escapeHtml(orden.vehiculo?.placa || 'N/A')}</strong></div>
                    <div><span>Marca/Modelo:</span> <strong>${escapeHtml(orden.vehiculo?.marca || '')} ${escapeHtml(orden.vehiculo?.modelo || '')}</strong></div>
                    <div><span>Año:</span> <strong>${orden.vehiculo?.anio || 'N/A'}</strong></div>
                    <div><span>Kilometraje:</span> <strong>${(orden.vehiculo?.kilometraje || 0).toLocaleString()} km</strong></div>
                </div>
            </div>
    `;
    
    // SECCIÓN: INSTRUCCIONES DEL JEFE DE TALLER (para armado)
    if (instruccionesArmado) {
        html += `
            <div class="detalles-seccion seccion-armado">
                <h4><i class="fas fa-clipboard-list"></i> Instrucciones del Jefe de Taller - ARMADO</h4>
                <div class="instrucciones-card">
                    <div class="instrucciones-header">
                        <i class="fas fa-user-tie"></i> Instrucciones para el armado del vehículo:
                    </div>
                    <div class="instrucciones-contenido-detalle">
                        ${escapeHtml(instruccionesArmado.texto || instruccionesArmado).replace(/\n/g, '<br>')}
                    </div>
                    <div class="instrucciones-fecha">
                        <i class="far fa-calendar-alt"></i> Enviado: ${formatFecha(instruccionesArmado.fecha_envio || instruccionesArmado.fecha)}
                    </div>
                </div>
            </div>
        `;
    }
    
    // SECCIÓN: COTIZACIÓN (si existe)
    if (cotizacion) {
        let cotizacionEstado = '';
        let cotizacionColor = '';
        let cotizacionIcon = '';
        
        switch (cotizacion.estado) {
            case 'aprobada':
                cotizacionEstado = 'APROBADA';
                cotizacionColor = 'aprobado';
                cotizacionIcon = 'fa-check-circle';
                break;
            case 'rechazada':
                cotizacionEstado = 'RECHAZADA';
                cotizacionColor = 'rechazado';
                cotizacionIcon = 'fa-times-circle';
                break;
            case 'enviada':
                cotizacionEstado = 'ENVIADA - PENDIENTE';
                cotizacionColor = 'pendiente';
                cotizacionIcon = 'fa-paper-plane';
                break;
            default:
                cotizacionEstado = cotizacion.estado || 'PENDIENTE';
                cotizacionColor = 'pendiente';
                cotizacionIcon = 'fa-clock';
        }
        
        html += `
            <div class="detalles-seccion seccion-cotizacion">
                <h4><i class="fas fa-file-invoice-dollar"></i> Cotización</h4>
                <div class="cotizacion-card">
                    <div class="cotizacion-header">
                        <span class="cotizacion-estado ${cotizacionColor}">
                            <i class="fas ${cotizacionIcon}"></i> ${cotizacionEstado}
                        </span>
                        <span class="cotizacion-total">
                            <i class="fas fa-dollar-sign"></i> Total: Bs. ${(cotizacion.total || 0).toFixed(2)}
                        </span>
                    </div>
                    <div class="cotizacion-fecha">
                        <i class="far fa-calendar-alt"></i> Enviada: ${formatFecha(cotizacion.fecha_envio)}
                    </div>
            `;
        
        if (cotizacion.servicios && cotizacion.servicios.length > 0) {
            html += `
                <div class="cotizacion-servicios">
                    <strong>Servicios cotizados:</strong>
                    <div class="servicios-cotizados">
                        ${cotizacion.servicios.map(serv => `
                            <div class="servicio-cotizado">
                                <div class="servicio-info">
                                    <i class="fas fa-wrench"></i>
                                    <span>${escapeHtml(serv.nombre || serv.descripcion)}</span>
                                </div>
                                <div class="servicio-precio">Bs. ${(serv.precio || 0).toFixed(2)}</div>
                                <div class="servicio-aprobado">
                                    ${serv.aprobado_por_cliente ? 
                                        '<span class="aprobado-badge"><i class="fas fa-check-circle"></i> Aprobado por cliente</span>' : 
                                        '<span class="pendiente-badge"><i class="fas fa-clock"></i> Pendiente</span>'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        if (cotizacion.motivo_rechazo) {
            html += `
                <div class="motivo-rechazo-detalle">
                    <i class="fas fa-comment-dots"></i>
                    <strong>Motivo del rechazo:</strong>
                    <p>${escapeHtml(cotizacion.motivo_rechazo)}</p>
                </div>
            `;
        }
        
        html += `</div></div>`;
    }
    
    // SECCIÓN: RECEPCIÓN
    if (recepcion) {
        html += `
            <div class="detalles-seccion">
                <h4><i class="fas fa-clipboard-list"></i> Información de Recepción</h4>
                <div class="problema-cliente">
                    <strong>Problema reportado por el cliente:</strong>
                    <p>${escapeHtml(recepcion.transcripcion_problema || 'No registrado')}</p>
                </div>
        `;
        
        const fotos = [];
        const camposFoto = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'];
        camposFoto.forEach(campo => {
            if (recepcion[campo]) fotos.push(recepcion[campo]);
        });
        
        if (fotos.length > 0) {
            html += `
                <div class="fotos-recepcion">
                    <strong>Fotos de ingreso:</strong>
                    <div class="fotos-grid">
                        ${fotos.map(url => `
                            <div class="foto-miniatura" onclick="verFotoAmpliada('${url}')">
                                <img src="${url}" alt="Foto recepción">
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        html += `</div>`;
    }
    
    // SECCIÓN: DIAGNÓSTICO APROBADO
    if (diagnosticoActual && diagnosticoActual.estado === 'aprobado') {
        html += `
            <div class="detalles-seccion seccion-aprobada">
                <h4><i class="fas fa-check-circle"></i> Diagnóstico Aprobado por Jefe de Taller</h4>
                <div class="diagnostico-aprobado">
                    <div class="fecha-aprobacion">
                        <i class="far fa-calendar-alt"></i> Aprobado: ${formatFecha(diagnosticoActual.fecha_aprobacion || diagnosticoActual.fecha_envio)}
                    </div>
                    <div class="informe-diagnostico">
                        <strong>Informe del diagnóstico:</strong>
                        <p>${escapeHtml(diagnosticoActual.informe || diagnosticoActual.transcripcion_informe || 'No hay informe disponible')}</p>
                    </div>
        `;
        
        if (diagnosticoActual.servicios && diagnosticoActual.servicios.length > 0) {
            html += `
                <div class="servicios-aprobados">
                    <strong>Servicios aprobados:</strong>
                    <ul>
                        ${diagnosticoActual.servicios.map(s => `<li><i class="fas fa-wrench"></i> ${escapeHtml(s.descripcion)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        if (diagnosticoActual.fotos && diagnosticoActual.fotos.length > 0) {
            html += `
                <div class="fotos-diagnostico">
                    <strong>Evidencia fotográfica del diagnóstico:</strong>
                    <div class="fotos-grid">
                        ${diagnosticoActual.fotos.map(foto => `
                            <div class="foto-miniatura" onclick="verFotoAmpliada('${foto.url_foto}')">
                                <img src="${foto.url_foto}" alt="Foto diagnóstico">
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    
    // SECCIÓN: VERSIONES ANTERIORES
    if (diagnosticosAnteriores.length > 0) {
        html += `
            <div class="detalles-seccion">
                <h4><i class="fas fa-history"></i> Versiones Anteriores del Diagnóstico</h4>
                <div class="versiones-list">
                    ${diagnosticosAnteriores.map((diag, idx) => `
                        <div class="version-item">
                            <div class="version-header">
                                <span class="version-num">Versión ${diag.version || idx + 1}</span>
                                <span class="version-fecha">${formatFecha(diag.fecha_envio)}</span>
                                <span class="estado-badge estado-${diag.estado}">${diag.estado}</span>
                            </div>
                            <div class="version-contenido">
                                <p><strong>Informe:</strong> ${escapeHtml(diag.informe || diag.transcripcion_informe || 'No disponible')}</p>
                                ${diag.servicios && diag.servicios.length > 0 ? `
                                    <div class="servicios-list-mini">
                                        <strong>Servicios:</strong>
                                        <ul>
                                            ${diag.servicios.map(s => `<li>${escapeHtml(s.descripcion)}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // SECCIÓN: OBSERVACIONES
    if (observaciones.length > 0) {
        html += `
            <div class="detalles-seccion">
                <h4><i class="fas fa-comments"></i> Observaciones del Jefe de Taller</h4>
                <div class="observaciones-list">
                    ${observaciones.map(obs => `
                        <div class="observacion-item">
                            <div class="observacion-header">
                                <span><i class="fas fa-user-tie"></i> ${escapeHtml(obs.jefe_taller?.nombre || 'Jefe de Taller')}</span>
                                <span class="observacion-fecha">${formatFecha(obs.fecha_hora)}</span>
                            </div>
                            <div class="observacion-contenido">
                                ${escapeHtml(obs.observacion)}
                            </div>
                            ${obs.transcripcion_obs ? `
                                <div class="observacion-transcripcion">
                                    <i class="fas fa-microphone-alt"></i> ${escapeHtml(obs.transcripcion_obs)}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
    
    const modalContainer = document.getElementById('detalleOrdenContainer');
    if (modalContainer) {
        modalContainer.innerHTML = html;
    }
    
    abrirModal('modalDetalleOrden');
}

function verFotoAmpliada(url) {
    const modal = document.createElement('div');
    modal.className = 'modal foto-ampliada-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content foto-ampliada-content">
            <div class="modal-header">
                <h2><i class="fas fa-image"></i> Ver Foto</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body foto-ampliada-body">
                <img src="${url}" alt="Foto ampliada" style="max-width: 100%; max-height: 70vh;">
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// =====================================================
// FUNCIONES PARA NAVEGAR A DIAGNÓSTICO
// =====================================================

function nuevoDiagnostico(id_orden) {
    const select = document.getElementById('ordenSelect');
    const formContainer = document.getElementById('diagnosticoFormContainer');
    
    if (select) {
        select.value = id_orden;
    }
    
    if (formContainer) {
        formContainer.style.display = 'block';
    }
    
    cargarDiagnosticoSeleccionado();
}

function editarDiagnostico(id_orden) {
    nuevoDiagnostico(id_orden);
}

// =====================================================
// CARGA DE DIAGNÓSTICO EXISTENTE
// =====================================================

async function cargarDiagnosticoSeleccionado() {
    const select = document.getElementById('ordenSelect');
    if (!select) {
        console.error('Selector de órdenes no encontrado');
        showToast('Error: Selector de órdenes no encontrado', 'error');
        return;
    }
    
    const selectedValue = select.value;
    
    if (!selectedValue || selectedValue === '') {
        showToast('Selecciona una orden primero', 'warning');
        return;
    }
    
    const ordenId = parseInt(selectedValue);
    
    if (isNaN(ordenId)) {
        showToast('ID de orden inválido', 'error');
        return;
    }
    
    const ordenEncontrada = ordenesTecnico.find(o => o.orden_id === ordenId);
    
    if (ordenEncontrada) {
        ordenSeleccionada = ordenEncontrada;
        mostrarInfoVehiculo(ordenSeleccionada);
        
        const formContainer = document.getElementById('diagnosticoFormContainer');
        if (formContainer) formContainer.style.display = 'block';
        
        await cargarDiagnosticoExistente(ordenId);
        showToast(`Cargando diagnóstico para orden ${ordenSeleccionada.codigo_unico}...`, 'info');
    } else {
        showToast('Orden no encontrada', 'error');
    }
}

async function cargarDiagnosticoExistente(ordenId) {
    try {
        console.log(`Cargando diagnóstico para orden ${ordenId}`);
        const response = await fetch(`${window.API_BASE_URL}/tecnico/api/diagnostico/${ordenId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        console.log('Diagnóstico recibido:', data);
        
        if (data.success) {
            diagnosticoActual = data.diagnostico;
            
            if (data.diagnostico && data.diagnostico.transcripcion_informe) {
                document.getElementById('transcripcionDiagnostico').value = data.diagnostico.transcripcion_informe;
            } else {
                document.getElementById('transcripcionDiagnostico').value = '';
            }
            
            if (data.diagnostico && data.diagnostico.url_grabacion_informe) {
                audioUrlSubido = data.diagnostico.url_grabacion_informe;
                document.getElementById('audioUrl').value = data.diagnostico.url_grabacion_informe;
                const audioPreview = document.getElementById('audioPreview');
                audioPreview.src = data.diagnostico.url_grabacion_informe;
                audioPreview.style.display = 'block';
                document.getElementById('btnEliminarAudio').style.display = 'inline-flex';
                document.getElementById('grabacionStatus').innerHTML = '<i class="fas fa-check-circle"></i> Audio disponible';
            } else {
                document.getElementById('audioPreview').style.display = 'none';
                document.getElementById('btnEliminarAudio').style.display = 'none';
                document.getElementById('grabacionStatus').innerHTML = '';
            }
            
            serviciosLista = data.servicios || [];
            renderizarServicios();
            
            if (data.fotos && data.fotos.length > 0) {
                cargarFotosDesdeServidor(data.fotos);
            } else {
                limpiarFotos();
            }
            
            if (data.diagnostico) {
                mostrarEstadoDiagnostico(data.diagnostico);
            }
            
            if (data.observaciones && data.observaciones.length > 0) {
                mostrarHistorial(data.observaciones);
            } else {
                const historialContainer = document.getElementById('historialContainer');
                if (historialContainer) historialContainer.style.display = 'none';
            }
            
            if (data.diagnostico && data.diagnostico.estado === 'rechazado') {
                showToast('⚠️ Este diagnóstico fue rechazado. Revisa las observaciones y realiza las correcciones.', 'warning');
            }
        } else {
            limpiarFormularioDiagnostico();
        }
    } catch (error) {
        console.error('Error cargando diagnóstico:', error);
        limpiarFormularioDiagnostico();
        showToast('Error al cargar diagnóstico existente', 'error');
    }
}

function limpiarFormularioDiagnostico() {
    diagnosticoActual = null;
    serviciosLista = [];
    fotosSubidas = [{}, {}];
    renderizarServicios();
    limpiarFotos();
    document.getElementById('transcripcionDiagnostico').value = '';
    document.getElementById('audioPreview').style.display = 'none';
    document.getElementById('audioUrl').value = '';
    document.getElementById('btnEliminarAudio').style.display = 'none';
    document.getElementById('grabacionStatus').innerHTML = '';
    const historialContainer = document.getElementById('historialContainer');
    if (historialContainer) historialContainer.style.display = 'none';
    const estadoContainer = document.getElementById('estadoDiagnostico');
    if (estadoContainer) estadoContainer.innerHTML = '';
}

function limpiarFotos() {
    for (let i = 0; i < 2; i++) {
        const uploadCard = document.getElementById(`fotoUpload${i + 1}`);
        if (uploadCard) {
            const uploadArea = uploadCard.querySelector('.upload-area');
            const fotoPreview = uploadCard.querySelector('.foto-preview');
            const fotoInput = uploadCard.querySelector('.foto-input');
            if (uploadArea) uploadArea.style.display = 'block';
            if (fotoPreview) fotoPreview.style.display = 'none';
            if (fotoInput) fotoInput.value = '';
        }
    }
    actualizarInfoFotos();
}

function cargarFotosDesdeServidor(fotos) {
    fotosSubidas = [{}, {}];
    
    fotos.forEach((foto, idx) => {
        if (idx < 2) {
            fotosSubidas[idx] = { id: foto.id, url: foto.url_foto };
            
            const uploadCard = document.getElementById(`fotoUpload${idx + 1}`);
            if (uploadCard) {
                const uploadArea = uploadCard.querySelector('.upload-area');
                const fotoPreview = uploadCard.querySelector('.foto-preview');
                const previewImg = fotoPreview.querySelector('img');
                
                if (previewImg) previewImg.src = foto.url_foto;
                if (uploadArea) uploadArea.style.display = 'none';
                if (fotoPreview) fotoPreview.style.display = 'block';
            }
        }
    });
    
    actualizarInfoFotos();
}

function mostrarEstadoDiagnostico(diagnostico) {
    const estadoContainer = document.getElementById('estadoDiagnostico');
    if (!estadoContainer) return;
    
    let estadoHtml = '';
    switch (diagnostico.estado) {
        case 'borrador':
            estadoHtml = '<span class="estado-badge estado-borrador"><i class="fas fa-pencil-alt"></i> Borrador</span>';
            break;
        case 'pendiente':
            estadoHtml = '<span class="estado-badge estado-pendiente"><i class="fas fa-clock"></i> Pendiente de revisión</span>';
            break;
        case 'aprobado':
            estadoHtml = '<span class="estado-badge estado-aprobado"><i class="fas fa-check-circle"></i> Aprobado</span>';
            break;
        case 'rechazado':
            estadoHtml = '<span class="estado-badge estado-rechazado"><i class="fas fa-times-circle"></i> Rechazado</span>';
            break;
        default:
            estadoHtml = '';
    }
    
    estadoContainer.innerHTML = estadoHtml;
}

function mostrarHistorial(observaciones) {
    const historialContainer = document.getElementById('historialContainer');
    const historialList = document.getElementById('historialList');
    
    if (observaciones && observaciones.length > 0) {
        if (historialContainer) historialContainer.style.display = 'block';
        if (historialList) {
            historialList.innerHTML = observaciones.map(obs => `
                <div class="historial-item">
                    <div class="historial-header">
                        <span class="historial-version">
                            <i class="fas fa-comment-dots"></i> Observación
                        </span>
                        <span class="historial-fecha">${formatFecha(obs.fecha_hora)}</span>
                    </div>
                    <div class="historial-informe">${escapeHtml(obs.observacion)}</div>
                    ${obs.transcripcion_obs ? `<div class="historial-transcripcion"><i class="fas fa-microphone-alt"></i> ${escapeHtml(obs.transcripcion_obs)}</div>` : ''}
                </div>
            `).join('');
        }
    } else {
        if (historialContainer) historialContainer.style.display = 'none';
    }
}

function mostrarInfoVehiculo(orden) {
    const vehiculo = orden.vehiculo || {};
    
    const placaEl = document.getElementById('vehiculoPlaca');
    const modeloEl = document.getElementById('vehiculoModelo');
    const anioEl = document.getElementById('vehiculoAnio');
    const kmEl = document.getElementById('vehiculoKm');
    
    if (placaEl) placaEl.textContent = vehiculo.placa || 'No registrada';
    if (modeloEl) modeloEl.textContent = `${vehiculo.marca || ''} ${vehiculo.modelo || ''}`.trim() || 'No especificado';
    if (anioEl) anioEl.textContent = vehiculo.anio || 'No especificado';
    if (kmEl) kmEl.textContent = vehiculo.kilometraje ? `${vehiculo.kilometraje.toLocaleString()} km` : 'No registrado';
}

// =====================================================
// MANEJO DE SERVICIOS
// =====================================================

function agregarServicio() {
    const input = document.getElementById('nuevoServicioInput');
    const descripcion = input.value.trim();
    
    if (!descripcion) {
        showToast('Escribe una descripción del servicio', 'warning');
        return;
    }
    
    if (descripcion.length < 3) {
        showToast('La descripción debe tener al menos 3 caracteres', 'warning');
        return;
    }
    
    serviciosLista.push({
        id: Date.now(),
        descripcion: descripcion,
        orden: serviciosLista.length
    });
    
    input.value = '';
    renderizarServicios();
    showToast('Servicio agregado', 'success');
}

function eliminarServicio(servicioId) {
    serviciosLista = serviciosLista.filter(s => s.id !== servicioId);
    serviciosLista.forEach((s, idx) => s.orden = idx);
    renderizarServicios();
    showToast('Servicio eliminado', 'info');
}

function renderizarServicios() {
    const container = document.getElementById('serviciosList');
    if (!container) return;
    
    if (serviciosLista.length === 0) {
        container.innerHTML = `
            <div class="servicios-empty">
                <i class="fas fa-clipboard-list"></i>
                <p>No hay servicios agregados aún.<br>Escribe un servicio y presiona "Agregar"</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = serviciosLista.map(servicio => `
        <div class="servicio-item" data-id="${servicio.id}">
            <div class="servicio-nombre">
                <i class="fas fa-wrench"></i>
                <span>${escapeHtml(servicio.descripcion)}</span>
            </div>
            <button class="btn-eliminar-servicio" onclick="eliminarServicio(${servicio.id})">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

// =====================================================
// MANEJO DE AUDIO
// =====================================================

async function iniciarGrabacion() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioPreview = document.getElementById('audioPreview');
            audioPreview.src = audioUrl;
            audioPreview.style.display = 'block';
            
            await subirAudio(audioBlob);
            
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        grabando = true;
        
        const btnGrabar = document.getElementById('btnGrabarAudio');
        btnGrabar.innerHTML = '<i class="fas fa-stop"></i> Detener Grabación';
        btnGrabar.classList.add('recording');
        
        const statusEl = document.getElementById('grabacionStatus');
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-circle" style="color: red;"></i> Grabando...';
    } catch (error) {
        console.error('Error al iniciar grabación:', error);
        showToast('Error al acceder al micrófono', 'error');
    }
}

function detenerGrabacion() {
    if (mediaRecorder && grabando) {
        mediaRecorder.stop();
        grabando = false;
        
        const btnGrabar = document.getElementById('btnGrabarAudio');
        btnGrabar.innerHTML = '<i class="fas fa-microphone"></i> Grabar Audio';
        btnGrabar.classList.remove('recording');
        
        const statusEl = document.getElementById('grabacionStatus');
        if (statusEl) statusEl.innerHTML = 'Procesando grabación...';
    }
}

function eliminarGrabacion() {
    audioUrlSubido = null;
    const audioUrlInput = document.getElementById('audioUrl');
    const audioPreview = document.getElementById('audioPreview');
    const transcripcion = document.getElementById('transcripcionDiagnostico');
    const statusEl = document.getElementById('grabacionStatus');
    const btnEliminar = document.getElementById('btnEliminarAudio');
    
    if (audioUrlInput) audioUrlInput.value = '';
    if (audioPreview) {
        if (audioPreview.src && audioPreview.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioPreview.src);
        }
        audioPreview.src = '';
        audioPreview.style.display = 'none';
    }
    if (transcripcion) transcripcion.value = '';
    if (statusEl) statusEl.innerHTML = 'Audio eliminado';
    if (btnEliminar) btnEliminar.style.display = 'none';
    showToast('Audio eliminado', 'info');
}

async function subirAudio(audioBlob) {
    if (!ordenSeleccionada) {
        showToast('Primero selecciona una orden', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'diagnostico.mp3');
    formData.append('id_orden', ordenSeleccionada.orden_id);
    
    try {
        showToast('Subiendo audio...', 'info');
        const response = await fetch(`${window.API_BASE_URL}/tecnico/api/diagnostico/subir-audio`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            audioUrlSubido = data.url;
            const audioUrlInput = document.getElementById('audioUrl');
            const btnEliminar = document.getElementById('btnEliminarAudio');
            const transcripcion = document.getElementById('transcripcionDiagnostico');
            
            if (audioUrlInput) audioUrlInput.value = data.url;
            if (btnEliminar) btnEliminar.style.display = 'inline-flex';
            showToast('Audio subido correctamente', 'success');
            
            if (data.transcripcion && transcripcion) {
                transcripcion.value = data.transcripcion;
            }
        } else {
            showToast(data.error || 'Error al subir audio', 'error');
        }
    } catch (error) {
        console.error('Error subiendo audio:', error);
        showToast('Error al subir audio', 'error');
    }
}

// =====================================================
// MANEJO DE FOTOS
// =====================================================

function setupFotosUpload() {
    for (let i = 0; i < 2; i++) {
        const uploadCard = document.getElementById(`fotoUpload${i + 1}`);
        if (!uploadCard) continue;
        
        const uploadArea = uploadCard.querySelector('.upload-area');
        const fotoInput = uploadCard.querySelector('.foto-input');
        const fotoPreview = uploadCard.querySelector('.foto-preview');
        const previewImg = fotoPreview.querySelector('img');
        const btnEliminar = fotoPreview.querySelector('.btn-eliminar-foto');
        
        if (uploadArea) {
            uploadArea.addEventListener('click', () => fotoInput.click());
        }
        
        if (fotoInput) {
            fotoInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (file.size > 5 * 1024 * 1024) {
                        showToast('La imagen no debe superar los 5MB', 'warning');
                        fotoInput.value = '';
                        return;
                    }
                    if (!file.type.startsWith('image/')) {
                        showToast('Solo se permiten archivos de imagen', 'warning');
                        fotoInput.value = '';
                        return;
                    }
                    
                    const uploaded = await subirFoto(file, i);
                    if (uploaded) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            if (previewImg) previewImg.src = e.target.result;
                            if (uploadArea) uploadArea.style.display = 'none';
                            if (fotoPreview) fotoPreview.style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    } else {
                        fotoInput.value = '';
                    }
                }
            });
        }
        
        if (btnEliminar) {
            btnEliminar.addEventListener('click', async () => {
                if (fotosSubidas[i] && fotosSubidas[i].id) {
                    await eliminarFoto(fotosSubidas[i].id);
                }
                fotosSubidas[i] = {};
                if (uploadArea) uploadArea.style.display = 'block';
                if (fotoPreview) fotoPreview.style.display = 'none';
                if (fotoInput) fotoInput.value = '';
                actualizarInfoFotos();
            });
        }
    }
}

async function subirFoto(file, index) {
    if (!ordenSeleccionada) {
        showToast('Primero selecciona una orden', 'warning');
        return false;
    }
    
    const formData = new FormData();
    formData.append('foto', file);
    formData.append('id_orden', ordenSeleccionada.orden_id);
    
    try {
        showToast('Subiendo foto...', 'info');
        const response = await fetch(`${window.API_BASE_URL}/tecnico/api/diagnostico/subir-foto`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            fotosSubidas[index] = { id: data.foto_id, url: data.url };
            actualizarInfoFotos();
            showToast('Foto subida correctamente', 'success');
            return true;
        } else {
            showToast(data.error || 'Error al subir foto', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error subiendo foto:', error);
        showToast('Error al subir foto', 'error');
        return false;
    }
}

async function eliminarFoto(fotoId) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/tecnico/api/diagnostico/eliminar-foto/${fotoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Foto eliminada', 'success');
            return true;
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error eliminando foto:', error);
        showToast('Error al eliminar foto', 'error');
        return false;
    }
}

function actualizarInfoFotos() {
    const fotosValidas = fotosSubidas.filter(f => f && f.id).length;
    const fotosInfo = document.getElementById('fotosInfo');
    
    if (fotosInfo) {
        if (fotosValidas === 0) {
            fotosInfo.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ⚠️ Debes subir al menos 1 foto del diagnóstico';
            fotosInfo.classList.add('warning');
        } else {
            fotosInfo.innerHTML = `<i class="fas fa-check-circle"></i> ✅ ${fotosValidas}/2 fotos subidas`;
            fotosInfo.classList.remove('warning');
        }
    }
}

function validarFotos() {
    const fotosValidas = fotosSubidas.filter(f => f && f.id).length;
    return fotosValidas >= 1;
}

// =====================================================
// GUARDAR DIAGNÓSTICO
// =====================================================

function validarDiagnostico() {
    const errores = [];
    
    if (serviciosLista.length === 0) {
        errores.push('Debes agregar al menos un servicio');
    }
    
    if (!validarFotos()) {
        errores.push('Debes subir al menos 1 foto del diagnóstico');
    }
    
    return errores;
}

async function guardarDiagnostico(enviar = false) {
    if (!ordenSeleccionada) {
        showToast('Selecciona una orden primero', 'warning');
        return false;
    }
    
    if (enviar) {
        const errores = validarDiagnostico();
        if (errores.length > 0) {
            const errorList = document.querySelector('#validacionErrores ul');
            if (errorList) {
                errorList.innerHTML = errores.map(e => `<li>${e}</li>`).join('');
                const errorDiv = document.getElementById('validacionErrores');
                if (errorDiv) errorDiv.style.display = 'block';
            }
            showToast('Por favor completa todos los campos requeridos', 'warning');
            return false;
        }
    }
    
    const errorDiv = document.getElementById('validacionErrores');
    if (errorDiv) errorDiv.style.display = 'none';
    
    const data = {
        id_orden: ordenSeleccionada.orden_id,
        transcripcion: document.getElementById('transcripcionDiagnostico')?.value || '',
        url_grabacion: document.getElementById('audioUrl')?.value || '',
        servicios: serviciosLista.map(s => s.descripcion),
        enviar: enviar
    };
    
    try {
        showToast(enviar ? 'Enviando diagnóstico...' : 'Guardando borrador...', 'info');
        
        const response = await fetch(`${window.API_BASE_URL}/tecnico/api/diagnostico/guardar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(enviar ? '✅ Diagnóstico enviado al Jefe de Taller' : '📝 Borrador guardado', 'success');
            
            if (enviar) {
                cerrarConfirmModal();
                await cargarOrdenes();
                const select = document.getElementById('ordenSelect');
                if (select) select.value = '';
                ordenSeleccionada = null;
            } else {
                await cargarDiagnosticoExistente(ordenSeleccionada.orden_id);
            }
            return true;
        } else {
            showToast(result.error || 'Error al guardar', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error guardando diagnóstico:', error);
        showToast('Error al guardar', 'error');
        return false;
    }
}

// =====================================================
// ARMADO DE VEHÍCULOS
// =====================================================

async function marcarArmadoCompletadoDesdeTarjeta(id_orden, codigo) {
    if (!confirm(`⚠️ CONFIRMACIÓN DE ARMADO\n\n¿Confirmas que has ARMADO COMPLETAMENTE el vehículo de la orden ${codigo}?\n\nEl vehículo quedará a su estado original antes del diagnóstico.\n\n✅ El cliente pagará SOLO el diagnóstico (Bs. 200)\n\n⚠️ Esta acción no se puede deshacer.`)) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${window.API_BASE_URL}/tecnico/api/armado/completar/${id_orden}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ Armado completado para la orden ${codigo}. Se ha notificado al Jefe de Taller.`, 'success');
            await cargarOrdenes();
        } else {
            showToast(data.error || 'Error al marcar armado completado', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// MODALES
// =====================================================

function abrirConfirmModal() {
    const errores = validarDiagnostico();
    if (errores.length > 0) {
        const errorList = document.querySelector('#validacionErrores ul');
        if (errorList) {
            errorList.innerHTML = errores.map(e => `<li>${e}</li>`).join('');
            const errorDiv = document.getElementById('validacionErrores');
            if (errorDiv) errorDiv.style.display = 'block';
        }
        showToast('Por favor completa todos los campos requeridos antes de enviar', 'warning');
        return;
    }
    
    const errorDiv = document.getElementById('validacionErrores');
    if (errorDiv) errorDiv.style.display = 'none';
    
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('show');
}

function cerrarConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.remove('show');
}

function cerrarSesion() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando página de diagnóstico técnico...');
    console.log('📡 API_BASE_URL:', window.API_BASE_URL);
    
    const tokenValido = await verificarToken();
    if (!tokenValido) return;
    
    mostrarFechaActual();
    await cargarOrdenes();
    setupFotosUpload();
    
    const btnCargar = document.getElementById('btnCargarDiagnostico');
    if (btnCargar) {
        const newBtn = btnCargar.cloneNode(true);
        btnCargar.parentNode.replaceChild(newBtn, btnCargar);
        newBtn.addEventListener('click', cargarDiagnosticoSeleccionado);
    }
    
    const btnAgregarServicio = document.getElementById('btnAgregarServicio');
    if (btnAgregarServicio) {
        btnAgregarServicio.addEventListener('click', agregarServicio);
    }
    
    const nuevoServicioInput = document.getElementById('nuevoServicioInput');
    if (nuevoServicioInput) {
        nuevoServicioInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') agregarServicio();
        });
    }
    
    const btnGrabar = document.getElementById('btnGrabarAudio');
    if (btnGrabar) {
        btnGrabar.addEventListener('click', () => {
            if (grabando) {
                detenerGrabacion();
            } else {
                iniciarGrabacion();
            }
        });
    }
    
    const btnEliminarAudio = document.getElementById('btnEliminarAudio');
    if (btnEliminarAudio) {
        btnEliminarAudio.addEventListener('click', eliminarGrabacion);
    }
    
    const btnGuardar = document.getElementById('btnGuardarBorrador');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', () => guardarDiagnostico(false));
    }
    
    const btnEnviar = document.getElementById('btnEnviarDiagnostico');
    if (btnEnviar) {
        btnEnviar.addEventListener('click', abrirConfirmModal);
    }
    
    const confirmarBtn = document.getElementById('confirmarEnvioBtn');
    if (confirmarBtn) {
        confirmarBtn.addEventListener('click', () => guardarDiagnostico(true));
    }
    
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/tecnico_mecanico/components/sidebar.html`);
            if (response.ok) {
                sidebarContainer.innerHTML = await response.text();
            }
        } catch (error) {
            console.error('Error cargando sidebar:', error);
        }
    }
    
    window.agregarServicio = agregarServicio;
    window.eliminarServicio = eliminarServicio;
    window.cerrarSesion = cerrarSesion;
    window.cerrarConfirmModal = cerrarConfirmModal;
    window.cargarDiagnosticoSeleccionado = cargarDiagnosticoSeleccionado;
    window.marcarArmadoCompletadoDesdeTarjeta = marcarArmadoCompletadoDesdeTarjeta;
    window.nuevoDiagnostico = nuevoDiagnostico;
    window.editarDiagnostico = editarDiagnostico;
    window.verDetallesOrden = verDetallesOrden;
    window.verFotoAmpliada = verFotoAmpliada;
    window.cerrarModal = cerrarModal;
    
    console.log('✅ diagnostico.js cargado correctamente');
});