// =====================================================
// HISTORIAL.JS - VERSIÓN COMPLETA CON GOOGLE MAPS
// =====================================================

// Verificar si existe la variable global, si no, crearla
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 historial.js - Modo DESARROLLO');
            return 'http://localhost:5000';
        }
        console.log('📡 historial.js - Modo PRODUCCIÓN');
        return '';
    })();
}

let userInfo = null;
let ordenesCache = [];

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
        if (toast && document.body.contains(toast)) toast.remove();
    }, 3000);
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

function mostrarFechaActual() {
    const ahora = new Date();
    const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        dateElement.textContent = ahora.toLocaleDateString('es-CL', opciones);
    }
}

// =====================================================
// FUNCIONES PARA GOOGLE MAPS
// =====================================================

function abrirGoogleMapsCoordenadas(lat, lng) {
    if (!lat || !lng) {
        mostrarNotificacion('No hay coordenadas disponibles', 'warning');
        return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, '_blank');
    mostrarNotificacion('Abriendo Google Maps...', 'info');
}

function abrirGoogleMapsBusqueda(direccion) {
    if (!direccion || direccion === 'No especificada' || direccion === 'No registrada') {
        mostrarNotificacion('No hay dirección disponible para buscar', 'warning');
        return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
    window.open(url, '_blank');
    mostrarNotificacion('Buscando dirección en Google Maps...', 'info');
}

function abrirRutaGoogleMaps(lat, lng) {
    if (!lat || !lng) {
        mostrarNotificacion('No hay coordenadas disponibles para la ruta', 'warning');
        return;
    }
    const tallerLat = -17.3895;
    const tallerLng = -66.1568;
    const url = `https://www.google.com/maps/dir/${tallerLat},${tallerLng}/${lat},${lng}/`;
    window.open(url, '_blank');
    mostrarNotificacion('Abriendo ruta desde el taller...', 'info');
}

// =====================================================
// CHECK AUTH
// =====================================================

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userInfoRaw = localStorage.getItem('furia_user');
    
    if (!token) {
        window.location.href = `${window.API_BASE_URL}/`;
        return false;
    }
    
    try {
        userInfo = JSON.parse(userInfoRaw || '{}');
        
        const verifyResponse = await fetch(`${window.API_BASE_URL}/api/verify-token`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!verifyResponse.ok) {
            localStorage.clear();
            window.location.href = `${window.API_BASE_URL}/`;
            return false;
        }
        
        const verifyData = await verifyResponse.json();
        if (verifyData.user) {
            userInfo = verifyData.user;
            localStorage.setItem('furia_user', JSON.stringify(userInfo));
        }
        
        const roles = userInfo.roles || [];
        const tieneRolJefeOperativo = roles.includes('jefe_operativo');
        
        if (!tieneRolJefeOperativo) {
            if (roles.includes('jefe_taller')) {
                window.location.href = `${window.API_BASE_URL}/jefe_taller/dashboard.html`;
            } else {
                window.location.href = `${window.API_BASE_URL}/`;
            }
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error en checkAuth:', error);
        window.location.href = `${window.API_BASE_URL}/`;
        return false;
    }
}

// =====================================================
// CARGAR SIDEBAR
// =====================================================

async function loadSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;
    
    try {
        if (typeof includeSidebar === 'function') {
            await includeSidebar();
        } else {
            const response = await fetch(`${window.API_BASE_URL}/jefe_operativo/components/sidebar.html`);
            if (response.ok) {
                const html = await response.text();
                sidebarContainer.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('Error cargando sidebar:', error);
    }
}

// =====================================================
// FUNCIONES PRINCIPALES
// =====================================================

async function fetchWithToken(url, options = {}) {
    const token = localStorage.getItem('furia_token');
    if (!token) throw new Error('No hay token');
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        localStorage.clear();
        window.location.href = `${window.API_BASE_URL}/`;
        throw new Error('Sesión expirada');
    }
    return response;
}

async function cargarUltimasOrdenes() {
    const container = document.getElementById('resultadosContainer');
    try {
        mostrarLoading(container, 'Cargando últimas órdenes...');
        const response = await fetchWithToken(`${window.API_BASE_URL}/api/jefe-operativo/ultimas-ordenes?limite=10`);
        const data = await response.json();
        
        if (data.success) {
            ordenesCache = data.ordenes;
            mostrarUltimasOrdenes(data.ordenes, data.resumen);
        } else {
            mostrarError(container, data.error || 'Error al cargar órdenes');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarError(container, 'Error de conexión al servidor');
    }
}

function mostrarUltimasOrdenes(ordenes, resumen) {
    const container = document.getElementById('resultadosContainer');
    
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
    
    let html = `
        <div class="ultimas-ordenes-banner">
            <i class="fas fa-clock"></i>
            <span>Últimas 10 órdenes de trabajo</span>
            <small><i class="fas fa-sync-alt"></i> Actualizado automáticamente</small>
        </div>
        <div class="resumen-stats">
            <div class="stat-card"><div class="stat-number">${resumen.total}</div><div class="stat-label">Total</div></div>
            <div class="stat-card"><div class="stat-number">${resumen.entregados}</div><div class="stat-label">Entregados</div></div>
            <div class="stat-card"><div class="stat-number">${resumen.en_proceso}</div><div class="stat-label">En Proceso</div></div>
            <div class="stat-card"><div class="stat-number">${resumen.en_pausa}</div><div class="stat-label">En Pausa</div></div>
            <div class="stat-card"><div class="stat-number">${resumen.en_recepcion || 0}</div><div class="stat-label">En Recepción</div></div>
        </div>
        <div class="ordenes-lista">
    `;
    
    ordenes.forEach(orden => {
        const estadoClass = getEstadoClass(orden.estado_global);
        const estadoText = getEstadoText(orden.estado_global);
        const fechaIngreso = formatFecha(orden.fecha_ingreso);
        
        html += `
            <div class="orden-historial-card">
                <div class="orden-card-header">
                    <div class="orden-codigo"><i class="fas fa-hashtag"></i> ${orden.codigo_unico || 'N/A'}</div>
                    <div class="orden-estado ${estadoClass}">${estadoText}</div>
                    <div class="orden-fecha"><i class="fas fa-calendar-alt"></i> ${fechaIngreso}</div>
                </div>
                <div class="orden-card-body">
                    <div class="orden-info-row">
                        <div class="orden-info-item">
                            <span class="orden-info-label">Placa</span>
                            <span class="orden-info-value"><strong>${orden.placa || 'N/A'}</strong></span>
                        </div>
                        <div class="orden-info-item">
                            <span class="orden-info-label">Vehículo</span>
                            <span class="orden-info-value">${orden.marca || ''} ${orden.modelo || ''}</span>
                        </div>
                    </div>
                </div>
                <div class="orden-card-footer">
                    <button class="btn-accion" onclick="verDetalleOrden(${orden.id})">
                        <i class="fas fa-eye"></i> Ver Detalle Completo
                    </button>
                    <button class="btn-accion" onclick="verFotosOrden(${orden.id})">
                        <i class="fas fa-camera"></i> Ver Fotos
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

async function buscarPorPlaca() {
    const placa = document.getElementById('searchPlaca').value.trim().toUpperCase();
    if (!placa) {
        await cargarUltimasOrdenes();
        return;
    }
    
    const container = document.getElementById('resultadosContainer');
    try {
        mostrarLoading(container, `Buscando historial de ${placa}...`);
        
        const estado = document.getElementById('filterEstado').value;
        const fechaDesde = document.getElementById('fechaDesde').value;
        const fechaHasta = document.getElementById('fechaHasta').value;
        
        let url = `${window.API_BASE_URL}/api/jefe-operativo/historial-vehiculo?placa=${encodeURIComponent(placa)}`;
        if (estado) url += `&estado=${estado}`;
        if (fechaDesde) url += `&fecha_desde=${fechaDesde}`;
        if (fechaHasta) url += `&fecha_hasta=${fechaHasta}`;
        
        const response = await fetchWithToken(url);
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

function mostrarHistorialVehiculo(data) {
    const container = document.getElementById('resultadosContainer');
    const vehiculo = data.vehiculo;
    const ordenes = data.ordenes;
    const resumen = data.resumen;
    
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
                    <span class="vehiculo-placa">${vehiculo.placa}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Marca/Modelo</span>
                    <span class="vehiculo-info-value">${vehiculo.marca || 'N/A'} ${vehiculo.modelo || ''}</span>
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
                    <span class="vehiculo-info-value">${vehiculo.cliente_nombre || 'No registrado'}</span>
                </div>
                <div class="vehiculo-info-item">
                    <span class="vehiculo-info-label">Teléfono</span>
                    <span class="vehiculo-info-value">${vehiculo.cliente_telefono || 'No registrado'}</span>
                </div>
            </div>
        </div>
        <div class="resumen-stats">
            <div class="stat-card"><div class="stat-number">${resumen.total || 0}</div><div class="stat-label">Total Servicios</div></div>
            <div class="stat-card"><div class="stat-number">${resumen.entregados || 0}</div><div class="stat-label">Completados</div></div>
            <div class="stat-card"><div class="stat-number">${(resumen.en_proceso || 0) + (resumen.en_pausa || 0)}</div><div class="stat-label">En Taller</div></div>
        </div>
    `;
    
    if (ordenes && ordenes.length > 0) {
        html += `<div class="ordenes-lista">`;
        ordenes.forEach(orden => {
            const estadoClass = getEstadoClass(orden.estado_global);
            const estadoText = getEstadoText(orden.estado_global);
            const fechaIngreso = formatFecha(orden.fecha_ingreso);
            
            html += `
                <div class="orden-historial-card">
                    <div class="orden-card-header">
                        <div class="orden-codigo"><i class="fas fa-hashtag"></i> ${orden.codigo_unico || 'N/A'}</div>
                        <div class="orden-estado ${estadoClass}">${estadoText}</div>
                        <div class="orden-fecha"><i class="fas fa-calendar-alt"></i> ${fechaIngreso}</div>
                    </div>
                    <div class="orden-card-body">
                        ${orden.diagnostico_inicial ? `<div class="orden-info-item"><span class="orden-info-label">Diagnóstico Inicial</span><span class="orden-info-value">${orden.diagnostico_inicial.substring(0, 100)}${orden.diagnostico_inicial.length > 100 ? '...' : ''}</span></div>` : ''}
                    </div>
                    <div class="orden-card-footer">
                        <button class="btn-accion" onclick="verDetalleOrden(${orden.id})"><i class="fas fa-eye"></i> Ver Detalle Completo</button>
                        <button class="btn-accion" onclick="verFotosOrden(${orden.id})"><i class="fas fa-camera"></i> Ver Fotos</button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    } else {
        html += `<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>Sin historial de servicios</h3><p>Este vehículo no tiene órdenes de trabajo registradas.</p></div>`;
    }
    
    container.innerHTML = html;
}

// =====================================================
// VER DETALLE COMPLETO DE ORDEN CON UBICACIÓN Y MAPA
// =====================================================

window.verDetalleOrden = async function(idOrden) {
    const modal = document.getElementById('modalDetalleOrden');
    const modalBody = document.getElementById('modalDetalleBody');
    
    try {
        modal.style.display = 'flex';
        modalBody.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando detalle completo de la orden...</p></div>`;
        
        const response = await fetchWithToken(`${window.API_BASE_URL}/api/jefe-operativo/detalle-completo-orden/${idOrden}`);
        const data = await response.json();
        
        if (data.success) {
            modalBody.innerHTML = renderDetalleOrdenCompleto(data.detalle);
        } else {
            modalBody.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${data.error || 'Error al cargar el detalle'}</p></div>`;
        }
    } catch (error) {
        console.error('Error:', error);
        modalBody.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error de conexión al servidor</p></div>`;
    }
};

function renderDetalleOrdenCompleto(detalle) {
    let html = '';
    
    // Información básica
    html += `
        <div class="detalle-seccion">
            <h4><i class="fas fa-info-circle"></i> Información General</h4>
            <div class="detalle-grid">
                <div class="detalle-item"><span class="detalle-label">Código Orden</span><span class="detalle-value"><strong>${detalle.codigo_unico || 'N/A'}</strong></span></div>
                <div class="detalle-item"><span class="detalle-label">Estado</span><span class="detalle-value"><span class="orden-estado ${getEstadoClass(detalle.estado_global)}">${getEstadoText(detalle.estado_global)}</span></span></div>
                <div class="detalle-item"><span class="detalle-label">Fecha Ingreso</span><span class="detalle-value">${formatFecha(detalle.fecha_ingreso)}</span></div>
                ${detalle.fecha_salida ? `<div class="detalle-item"><span class="detalle-label">Fecha Salida</span><span class="detalle-value">${formatFecha(detalle.fecha_salida)}</span></div>` : ''}
            </div>
        </div>
    `;
    
    // Vehículo y Cliente (con ubicación y mapa)
    html += `
        <div class="detalle-seccion">
            <h4><i class="fas fa-car"></i> Vehículo y Cliente</h4>
            <div class="detalle-grid">
                <div class="detalle-item"><span class="detalle-label">Placa</span><span class="detalle-value"><strong>${detalle.placa || 'N/A'}</strong></span></div>
                <div class="detalle-item"><span class="detalle-label">Marca/Modelo</span><span class="detalle-value">${detalle.marca || ''} ${detalle.modelo || ''}</span></div>
                <div class="detalle-item"><span class="detalle-label">Año</span><span class="detalle-value">${detalle.anio || 'N/A'}</span></div>
                <div class="detalle-item"><span class="detalle-label">Kilometraje</span><span class="detalle-value">${detalle.kilometraje?.toLocaleString() || 'N/A'} km</span></div>
                <div class="detalle-item"><span class="detalle-label">Cliente</span><span class="detalle-value">${detalle.cliente_nombre || 'No registrado'}</span></div>
                <div class="detalle-item"><span class="detalle-label">Teléfono</span><span class="detalle-value">${detalle.cliente_telefono || 'No registrado'}</span></div>
                <div class="detalle-item ubicacion-item-full">
                    <span class="detalle-label"><i class="fas fa-map-marker-alt"></i> Ubicación del Cliente</span>
                    <div class="ubicacion-detalle-historial">
                        <div class="ubicacion-texto-historial">
                            <i class="fas fa-location-dot"></i>
                            <span>${escapeHtml(detalle.cliente_ubicacion || 'No especificada')}</span>
                        </div>
                        <div class="maps-buttons-group">
                            ${detalle.latitud && detalle.longitud ? `
                                <button class="btn-maps-historial" onclick="abrirGoogleMapsCoordenadas(${detalle.latitud}, ${detalle.longitud})">
                                    <i class="fas fa-map-pin"></i> Ver en Google Maps
                                </button>
                                <button class="btn-ruta-historial" onclick="abrirRutaGoogleMaps(${detalle.latitud}, ${detalle.longitud})">
                                    <i class="fas fa-directions"></i> Cómo llegar
                                </button>
                            ` : detalle.cliente_ubicacion && detalle.cliente_ubicacion !== 'No especificada' && detalle.cliente_ubicacion !== 'No registrada' ? `
                                <button class="btn-maps-historial" onclick="abrirGoogleMapsBusqueda('${escapeHtml(detalle.cliente_ubicacion)}')">
                                    <i class="fas fa-search-location"></i> Buscar en Google Maps
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Descripción del problema
    if (detalle.descripcion_problema) {
        html += `
            <div class="detalle-seccion recepcion">
                <h4><i class="fas fa-clipboard-list"></i> Descripción del Problema</h4>
                <div class="detalle-descripcion">${escapeHtml(detalle.descripcion_problema)}</div>
                ${detalle.audio_recepcion ? `<div class="audio-player"><audio controls src="${detalle.audio_recepcion}"></audio></div>` : ''}
            </div>
        `;
    }
    
    // Diagnóstico Inicial
    if (detalle.diagnostico_inicial) {
        html += `
            <div class="detalle-seccion diagnostico-inicial">
                <h4><i class="fas fa-stethoscope"></i> Diagnóstico Inicial</h4>
                <div class="detalle-descripcion">${escapeHtml(detalle.diagnostico_inicial)}</div>
                ${detalle.jefe_taller_nombre ? `<p style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--gris-texto);"><i class="fas fa-user-md"></i> Realizado por: ${detalle.jefe_taller_nombre}</p>` : ''}
                ${detalle.audio_diagnostico_inicial ? `<div class="audio-player"><audio controls src="${detalle.audio_diagnostico_inicial}"></audio></div>` : ''}
            </div>
        `;
    }
    
    // Técnicos Asignados
    if (detalle.tecnicos_asignados && detalle.tecnicos_asignados.length > 0) {
        html += `
            <div class="detalle-seccion">
                <h4><i class="fas fa-users"></i> Técnicos Asignados</h4>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${detalle.tecnicos_asignados.map(t => `<span class="tecnico-badge"><i class="fas fa-wrench"></i> ${t.nombre}</span>`).join('')}
                </div>
            </div>
        `;
    }
    
    // Servicios
    if (detalle.servicios && detalle.servicios.length > 0) {
        html += `
            <div class="detalle-seccion">
                <h4><i class="fas fa-dollar-sign"></i> Servicios Cotizados</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead><tr style="border-bottom: 1px solid var(--border-color);"><th style="text-align: left; padding: 0.5rem;">Servicio</th><th style="text-align: right; padding: 0.5rem;">Precio</th></tr></thead>
                    <tbody>
                        ${detalle.servicios.map(s => `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 0.5rem;">${s.descripcion}</td><td style="text-align: right; padding: 0.5rem;">$${s.precio?.toLocaleString()}</td></tr>`).join('')}
                        <tr style="background: var(--gris-oscuro);"><td style="padding: 0.5rem; font-weight: 700;">TOTAL</td><td style="text-align: right; padding: 0.5rem; font-weight: 700; color: var(--rojo-primario);">$${detalle.total?.toLocaleString()}</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // Fotos de Recepción
    if (detalle.fotos && Object.keys(detalle.fotos).length > 0) {
        const nombresFotos = {
            'url_lateral_izquierda': 'Lateral Izquierdo', 'url_lateral_derecha': 'Lateral Derecho',
            'url_foto_frontal': 'Frontal', 'url_foto_trasera': 'Trasera',
            'url_foto_superior': 'Superior', 'url_foto_inferior': 'Inferior', 'url_foto_tablero': 'Tablero'
        };
        html += `<div class="detalle-seccion"><h4><i class="fas fa-camera"></i> Fotos de Recepción</h4><div class="fotos-grid">`;
        for (const [key, url] of Object.entries(detalle.fotos)) {
            if (url) {
                const nombre = nombresFotos[key] || key;
                html += `<div class="foto-item" onclick="verImagenAmpliada('${url}', '${nombre}')"><img src="${url}" alt="${nombre}" onerror="this.src='/images/no-image.png'"><div class="foto-label">${nombre}</div></div>`;
            }
        }
        html += `</div></div>`;
    }
    
    // Diagnósticos Técnicos
    if (detalle.diagnosticos_tecnicos && detalle.diagnosticos_tecnicos.length > 0) {
        html += `<div class="detalle-seccion diagnostico-tecnico"><h4><i class="fas fa-microscope"></i> Diagnósticos Técnicos</h4>`;
        detalle.diagnosticos_tecnicos.forEach(dt => {
            html += `
                <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md);">
                    <p><strong>Versión ${dt.version}</strong> - ${formatFecha(dt.fecha_envio)}</p>
                    <p>${dt.informe || 'Sin informe'}</p>
                    ${dt.tecnico_nombre ? `<p style="font-size: 0.75rem; color: var(--gris-texto);"><i class="fas fa-user"></i> Técnico: ${dt.tecnico_nombre}</p>` : ''}
                    ${dt.url_grabacion_informe ? `<div class="audio-player"><audio controls src="${dt.url_grabacion_informe}"></audio></div>` : ''}
                    ${dt.fotos && dt.fotos.length > 0 ? `<div class="fotos-grid" style="margin-top: 0.5rem;">${dt.fotos.map(foto => `<div class="foto-item" onclick="verImagenAmpliada('${foto.url_foto}', 'Foto Diagnóstico')"><img src="${foto.url_foto}" alt="Foto diagnóstico"><div class="foto-label">${foto.descripcion_tecnico || 'Sin descripción'}</div></div>`).join('')}</div>` : ''}
                </div>
            `;
        });
        html += `</div>`;
    }
    
    return html;
}

// =====================================================
// VER FOTOS DE ORDEN
// =====================================================

window.verFotosOrden = async function(idOrden) {
    const modal = document.getElementById('modalDetalleOrden');
    const modalBody = document.getElementById('modalDetalleBody');
    
    try {
        modal.style.display = 'flex';
        modalBody.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando fotos...</p></div>`;
        
        const response = await fetchWithToken(`${window.API_BASE_URL}/api/jefe-operativo/orden-fotos/${idOrden}`);
        const data = await response.json();
        
        if (data.success && data.fotos && data.fotos.length > 0) {
            let fotosHtml = `<div class="detalle-seccion"><h4><i class="fas fa-camera"></i> Fotos de la Orden</h4><div class="fotos-grid">`;
            data.fotos.forEach(foto => {
                fotosHtml += `<div class="foto-item" onclick="verImagenAmpliada('${foto.url}', '${foto.nombre}')"><img src="${foto.url}" alt="${foto.nombre}" onerror="this.src='/images/no-image.png'"><div class="foto-label">${foto.nombre}</div></div>`;
            });
            fotosHtml += `</div></div>`;
            modalBody.innerHTML = fotosHtml;
        } else {
            modalBody.innerHTML = `<div class="empty-state"><i class="fas fa-image"></i><p>No hay fotos disponibles para esta orden.</p></div>`;
        }
    } catch (error) {
        console.error('Error:', error);
        modalBody.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar las fotos</p></div>`;
    }
};

window.verImagenAmpliada = function(url, titulo) {
    const modal = document.getElementById('modalImagen');
    const imgElement = document.getElementById('imagenAmpliada');
    const tituloElement = document.getElementById('imagenTitulo');
    tituloElement.textContent = titulo || 'Imagen';
    imgElement.src = url;
    modal.style.display = 'flex';
};

window.cerrarModalDetalle = function() {
    const modal = document.getElementById('modalDetalleOrden');
    if (modal) modal.style.display = 'none';
};

window.cerrarModalImagen = function() {
    const modal = document.getElementById('modalImagen');
    if (modal) modal.style.display = 'none';
};

function configurarEventListeners() {
    const btnBuscar = document.getElementById('btnBuscar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const searchPlaca = document.getElementById('searchPlaca');
    
    if (btnBuscar) btnBuscar.addEventListener('click', buscarPorPlaca);
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
            if (e.key === 'Enter') buscarPorPlaca();
        });
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('modalDetalleOrden')?.style.setProperty('display', 'none');
        document.getElementById('modalImagen')?.style.setProperty('display', 'none');
    }
});

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Historial...');
    
    const isAuth = await checkAuth();
    if (!isAuth) return;
    
    await loadSidebar();
    mostrarFechaActual();
    await cargarUltimasOrdenes();
    configurarEventListeners();
    
    console.log('✅ Historial inicializado correctamente');
});

// Funciones globales
window.cargarUltimasOrdenes = cargarUltimasOrdenes;
window.buscarPorPlaca = buscarPorPlaca;
window.verDetalleOrden = verDetalleOrden;
window.verFotosOrden = verFotosOrden;
window.verImagenAmpliada = verImagenAmpliada;
window.abrirGoogleMapsCoordenadas = abrirGoogleMapsCoordenadas;
window.abrirGoogleMapsBusqueda = abrirGoogleMapsBusqueda;
window.abrirRutaGoogleMaps = abrirRutaGoogleMaps;