// =====================================================
// CONTROL_CALIDAD.JS - JEFE OPERATIVO
// GESTIÓN DE TRABAJOS COMPLETADOS POR TÉCNICOS
// VERSIÓN COMPLETA CON FUNCIONALIDAD DE ENTREGA
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================

const API_URL = `${window.API_BASE_URL}/api/jefe-operativo/control-calidad`;
let currentUser = null;
let ordenesPendientes = [];
let ordenesFinalizadas = [];

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
    if (!token) token = sessionStorage.getItem('token');
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
        return date.toLocaleDateString('es-BO', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr.split('T')[0];
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
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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

function statusBadge(estado) {
    const map = {
        'VehiculoArmado': 'status-VehiculoArmado',
        'ReparacionCompletada': 'status-ReparacionCompletada',
        'Finalizado': 'status-Finalizado',
        'Entregado': 'status-Entregado'
    };
    
    const texto = {
        'VehiculoArmado': 'Vehículo Armado',
        'ReparacionCompletada': 'Reparación Completada',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado'
    };
    
    const iconos = {
        'VehiculoArmado': 'fa-check-circle',
        'ReparacionCompletada': 'fa-wrench',
        'Finalizado': 'fa-flag-checkered',
        'Entregado': 'fa-truck'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${iconos[estado] || 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarOrdenesPendientes() {
    mostrarLoading(true);
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/ordenes-pendientes`;
        if (estado !== 'all') url += `?estado=${estado}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let ordenes = data.ordenes || [];
            
            if (search) {
                ordenes = ordenes.filter(o => 
                    (o.codigo_unico || '').toLowerCase().includes(search) ||
                    (o.cliente_nombre || '').toLowerCase().includes(search) ||
                    (o.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            ordenesPendientes = ordenes;
            renderizarOrdenesPendientes();
            
            const badge = document.getElementById('pendientesCount');
            if (badge) badge.textContent = ordenesPendientes.length;
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar órdenes pendientes', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function cargarOrdenesFinalizadas() {
    mostrarLoading(true);
    try {
        const estado = document.getElementById('filtroEstadoFinalizadas')?.value || 'all';
        const search = document.getElementById('searchFinalizadasInput')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/ordenes-finalizadas`;
        if (estado !== 'all') url += `?estado=${estado}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            let ordenes = data.ordenes || [];
            
            if (search) {
                ordenes = ordenes.filter(o => 
                    (o.codigo_unico || '').toLowerCase().includes(search) ||
                    (o.cliente_nombre || '').toLowerCase().includes(search) ||
                    (o.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            ordenesFinalizadas = ordenes;
            renderizarOrdenesFinalizadas();
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar órdenes finalizadas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// RENDERIZADO
// =====================================================

function renderizarOrdenesPendientes() {
    const container = document.getElementById('ordenesContainer');
    if (!container) return;
    
    if (ordenesPendientes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>No hay trabajos pendientes de revisión</p>
                <small>Los trabajos completados por los técnicos aparecerán aquí</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ordenesPendientes.map(orden => `
        <div class="orden-card">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                </div>
                <div>
                    ${statusBadge(orden.estado_global)}
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                </div>
            </div>
            <div class="orden-body">
                <div class="detalle-row">
                    <span class="detalle-label">Técnico(s):</span>
                    <span class="detalle-value">${escapeHtml(orden.tecnicos_nombres || 'No asignado')}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">Fecha inicio:</span>
                    <span class="detalle-value">${formatDate(orden.fecha_inicio)}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">Fecha finalización:</span>
                    <span class="detalle-value">${formatDate(orden.fecha_fin)}</span>
                </div>
            </div>
            <div class="orden-footer">
                <button class="action-btn view" onclick="verDetalleOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
                <button class="action-btn approve" onclick="abrirModalFinalizar(${orden.id_orden})">
                    <i class="fas fa-check-circle"></i> Aprobar y Finalizar
                </button>
                <button class="action-btn reject" onclick="abrirModalRechazar(${orden.id_orden})">
                    <i class="fas fa-tools"></i> Enviar a Revisión
                </button>
            </div>
        </div>
    `).join('');
}

function renderizarOrdenesFinalizadas() {
    const container = document.getElementById('ordenesFinalizadasContainer');
    if (!container) return;
    
    if (ordenesFinalizadas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-archive"></i>
                <p>No hay órdenes finalizadas</p>
                <small>Las órdenes aprobadas aparecerán aquí</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ordenesFinalizadas.map(orden => {
        const isEntregado = orden.estado_global === 'Entregado';
        
        return `
        <div class="orden-card ${isEntregado ? 'entregado-card' : ''}">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                </div>
                <div>
                    ${statusBadge(orden.estado_global)}
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                </div>
            </div>
            <div class="orden-body">
                <div class="detalle-row">
                    <span class="detalle-label">Técnico(s):</span>
                    <span class="detalle-value">${escapeHtml(orden.tecnicos_nombres || 'No asignado')}</span>
                </div>
                <div class="detalle-row">
                    <span class="detalle-label">Fecha finalización:</span>
                    <span class="detalle-value">${formatDate(orden.fecha_finalizacion)}</span>
                </div>
                ${orden.comentarios_aprobacion ? `
                    <div class="detalle-row">
                        <span class="detalle-label">Comentarios:</span>
                        <span class="detalle-value">${escapeHtml(orden.comentarios_aprobacion)}</span>
                    </div>
                ` : ''}
            </div>
            <div class="orden-footer">
                <button class="action-btn view" onclick="verDetalleOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
                ${orden.estado_global === 'Finalizado' ? `
                    <button class="action-btn entregado" onclick="abrirModalEntregar(${orden.id_orden})">
                        <i class="fas fa-truck"></i> Marcar como Entregado
                    </button>
                ` : orden.estado_global === 'Entregado' ? `
                    <button class="action-btn entregado" disabled style="opacity:0.6; cursor:not-allowed;">
                        <i class="fas fa-check-circle"></i> Vehículo Entregado
                    </button>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

// =====================================================
// VER DETALLE DE ORDEN
// =====================================================

window.verDetalleOrden = async function(ordenId) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-orden/${ordenId}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.error || 'Error al cargar detalle', 'error');
            return;
        }
        
        const detalle = data.detalle;
        
        const fotos = detalle.recepcion?.fotos || {};
        const fotosArray = Object.entries(fotos).filter(([_, url]) => url && url !== '');
        
        const detalleHtml = `
            <div style="display: grid; gap: 1rem;">
                <div class="orden-info-card">
                    <h3><i class="fas fa-clipboard-list"></i> Información de la Orden</h3>
                    <div class="detalle-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
                        <div><strong>Código:</strong> ${escapeHtml(detalle.orden?.codigo_unico || 'N/A')}</div>
                        <div><strong>Estado:</strong> ${statusBadge(detalle.orden?.estado_global)}</div>
                        <div><strong>Fecha Ingreso:</strong> ${formatDate(detalle.orden?.fecha_ingreso)}</div>
                        <div><strong>Técnico(s):</strong> ${escapeHtml(detalle.tecnicos_nombres || 'N/A')}</div>
                    </div>
                </div>
                
                <div class="orden-info-card">
                    <h3><i class="fas fa-car"></i> Datos del Vehículo</h3>
                    <div class="detalle-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
                        <div><strong>Placa:</strong> ${escapeHtml(detalle.vehiculo?.placa || 'No registrada')}</div>
                        <div><strong>Marca/Modelo:</strong> ${escapeHtml(detalle.vehiculo?.marca || '')} ${escapeHtml(detalle.vehiculo?.modelo || '')}</div>
                        <div><strong>Año:</strong> ${detalle.vehiculo?.anio || 'N/A'}</div>
                        <div><strong>Kilometraje:</strong> ${detalle.vehiculo?.kilometraje?.toLocaleString() || '0'} km</div>
                    </div>
                </div>
                
                <div class="orden-info-card">
                    <h3><i class="fas fa-user"></i> Datos del Cliente</h3>
                    <div class="detalle-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
                        <div><strong>Nombre:</strong> ${escapeHtml(detalle.cliente?.nombre || 'No registrado')}</div>
                        <div><strong>Teléfono:</strong> ${escapeHtml(detalle.cliente?.telefono || 'No registrado')}</div>
                        <div><strong>Email:</strong> ${escapeHtml(detalle.cliente?.email || 'No registrado')}</div>
                    </div>
                </div>
                
                ${detalle.recepcion?.transcripcion_problema ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-clipboard-list"></i> Descripción del Problema</h3>
                        <div style="margin-top: 0.5rem;">${escapeHtml(detalle.recepcion.transcripcion_problema)}</div>
                        ${detalle.recepcion?.audio_url ? `<div style="margin-top: 0.5rem;"><audio controls src="${detalle.recepcion.audio_url}" style="width: 100%;"></audio></div>` : ''}
                    </div>
                ` : ''}
                
                ${detalle.servicios && detalle.servicios.length > 0 ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-tools"></i> Servicios Realizados</h3>
                        ${detalle.servicios.map(s => `
                            <div style="padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
                                <strong>${escapeHtml(s.descripcion)}</strong>
                                ${s.precio ? `<span style="float: right;">Bs. ${s.precio.toFixed(2)}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${fotosArray.length > 0 ? `
                    <div class="orden-info-card">
                        <h3><i class="fas fa-images"></i> Fotos del Vehículo (${fotosArray.length})</h3>
                        <div class="fotos-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem; margin-top: 0.5rem;">
                            ${fotosArray.map(([nombre, url]) => `
                                <div class="foto-item" onclick="verFotoAmpliada('${url}')" style="cursor: pointer;">
                                    <img src="${url}" alt="${nombre}" style="width: 100%; height: 80px; object-fit: cover; border-radius: var(--radius-sm);">
                                    <div style="font-size: 0.6rem; text-align: center; padding: 0.25rem;">${escapeHtml(nombre)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        document.getElementById('detalleBody').innerHTML = detalleHtml;
        abrirModal('modalDetalle');
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar detalles', 'error');
    } finally {
        mostrarLoading(false);
    }
};

window.verFotoAmpliada = function(url) {
    document.getElementById('fotoAmpliada').src = url;
    abrirModal('fotoModal');
};

function cerrarFotoModal() {
    cerrarModal('fotoModal');
}

// =====================================================
// APROBAR Y FINALIZAR
// =====================================================

let currentOrdenId = null;

window.abrirModalFinalizar = async function(ordenId) {
    const orden = ordenesPendientes.find(o => o.id_orden === ordenId);
    if (!orden) return;
    
    currentOrdenId = ordenId;
    
    const infoContainer = document.getElementById('finalizarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
        <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
        <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
        <p><strong><i class="fas fa-check-circle"></i> Estado actual:</strong> ${statusBadge(orden.estado_global)}</p>
    `;
    
    document.getElementById('comentariosFinalizar').value = '';
    abrirModal('modalFinalizar');
};

window.confirmarFinalizar = async function() {
    const comentarios = document.getElementById('comentariosFinalizar')?.value || '';
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/finalizar-orden/${currentOrdenId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comentarios: comentarios })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Orden finalizada correctamente', 'success');
            cerrarModal('modalFinalizar');
            await cargarOrdenesPendientes();
            await cargarOrdenesFinalizadas();
        } else {
            showToast(data.error || 'Error al finalizar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// RECHAZAR / ENVIAR A REVISIÓN
// =====================================================

window.abrirModalRechazar = async function(ordenId) {
    const orden = ordenesPendientes.find(o => o.id_orden === ordenId);
    if (!orden) return;
    
    currentOrdenId = ordenId;
    
    const infoContainer = document.getElementById('rechazarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
        <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
        <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
        <p><strong><i class="fas fa-tools"></i> Estado actual:</strong> ${statusBadge(orden.estado_global)}</p>
    `;
    
    document.getElementById('instruccionesRechazo').value = '';
    abrirModal('modalRechazar');
};

window.confirmarRechazar = async function() {
    const instrucciones = document.getElementById('instruccionesRechazo')?.value.trim();
    
    if (!instrucciones) {
        showToast('Debes escribir instrucciones para el técnico', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/rechazar-orden/${currentOrdenId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ instrucciones: instrucciones })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Orden enviada a revisión. El técnico ha sido notificado.', 'success');
            cerrarModal('modalRechazar');
            await cargarOrdenesPendientes();
            await cargarOrdenesFinalizadas();
        } else {
            showToast(data.error || 'Error al enviar a revisión', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// ENTREGAR VEHÍCULO (NUEVA FUNCIONALIDAD)
// =====================================================

let currentEntregarOrdenId = null;

window.abrirModalEntregar = async function(ordenId) {
    const orden = ordenesFinalizadas.find(o => o.id_orden === ordenId);
    if (!orden) return;
    
    currentEntregarOrdenId = ordenId;
    
    const infoContainer = document.getElementById('entregarInfo');
    infoContainer.innerHTML = `
        <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</p>
        <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</p>
        <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</p>
        <p><strong><i class="fas fa-check-circle"></i> Estado actual:</strong> ${statusBadge(orden.estado_global)}</p>
    `;
    
    document.getElementById('comentariosEntregar').value = '';
    abrirModal('modalEntregar');
};

window.confirmarEntregar = async function() {
    const comentarios = document.getElementById('comentariosEntregar')?.value || '';
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/entregar-orden/${currentEntregarOrdenId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comentarios: comentarios })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('🚗 Vehículo marcado como ENTREGADO correctamente', 'success');
            cerrarModal('modalEntregar');
            await cargarOrdenesFinalizadas();
        } else {
            showToast(data.error || 'Error al marcar como entregado', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
};

// =====================================================
// FUNCIONES ADICIONALES
// =====================================================

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
            
            if (tabId === 'tab-finalizadas') {
                cargarOrdenesFinalizadas();
            }
        });
    });
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => cargarOrdenesPendientes());
    }
    
    const refreshFinalizadasBtn = document.getElementById('refreshFinalizadasBtn');
    if (refreshFinalizadasBtn) {
        refreshFinalizadasBtn.addEventListener('click', () => cargarOrdenesFinalizadas());
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarOrdenesPendientes());
    }
    
    const filtroEstadoFinalizadas = document.getElementById('filtroEstadoFinalizadas');
    if (filtroEstadoFinalizadas) {
        filtroEstadoFinalizadas.addEventListener('change', () => cargarOrdenesFinalizadas());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarOrdenesPendientes());
    }
    
    const searchFinalizadasInput = document.getElementById('searchFinalizadasInput');
    if (searchFinalizadasInput) {
        searchFinalizadasInput.addEventListener('input', () => cargarOrdenesFinalizadas());
    }
    
    const btnConfirmarFinalizar = document.getElementById('btnConfirmarFinalizar');
    if (btnConfirmarFinalizar) {
        btnConfirmarFinalizar.addEventListener('click', confirmarFinalizar);
    }
    
    const btnConfirmarRechazar = document.getElementById('btnConfirmarRechazar');
    if (btnConfirmarRechazar) {
        btnConfirmarRechazar.addEventListener('click', confirmarRechazar);
    }
    
    const btnConfirmarEntregar = document.getElementById('btnConfirmarEntregar');
    if (btnConfirmarEntregar) {
        btnConfirmarEntregar.addEventListener('click', confirmarEntregar);
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

// =====================================================
// AUTENTICACIÓN
// =====================================================

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token');
        if (!token) token = localStorage.getItem('token');
        if (!token) {
            window.location.href = `${window.API_BASE_URL}/`;
            return null;
        }
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');
        
        currentUser = {
            id: payload.user?.id || payload.id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            roles: payload.user?.roles || payload.roles || userData?.roles || []
        };
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.innerHTML = new Date().toLocaleDateString('es-ES', { 
                year: 'numeric', month: 'long', day: 'numeric' 
            });
        }
        
        return currentUser;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = `${window.API_BASE_URL}/`;
        return null;
    }
}

function logout() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = `${window.API_BASE_URL}/`;
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

async function inicializar() {
    console.log('🚀 Inicializando control_calidad.js (Jefe Operativo)');
    console.log('📡 window.API_BASE_URL:', window.API_BASE_URL);
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarOrdenesPendientes();
    await cargarOrdenesFinalizadas();
    setupTabs();
    setupEventListeners();
    
    console.log('✅ control_calidad.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalleOrden = verDetalleOrden;
window.verFotoAmpliada = verFotoAmpliada;
window.cerrarFotoModal = cerrarFotoModal;
window.abrirModalFinalizar = abrirModalFinalizar;
window.confirmarFinalizar = confirmarFinalizar;
window.abrirModalRechazar = abrirModalRechazar;
window.confirmarRechazar = confirmarRechazar;
window.abrirModalEntregar = abrirModalEntregar;
window.confirmarEntregar = confirmarEntregar;
window.cerrarModal = cerrarModal;
window.logout = logout;

document.addEventListener('DOMContentLoaded', inicializar);