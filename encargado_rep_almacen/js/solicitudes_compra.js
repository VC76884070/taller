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
// SOLICITUDES_COMPRA.JS - ENCARGADO DE REPUESTOS
// FURIA MOTOR COMPANY SRL - VERSIÓN COMPLETA
// =====================================================

const API_URL = API_BASE_URL + '/api/encargado-repuestos';

// Configuración de Cloudinary (hardcodeada temporalmente)
const CLOUDINARY_CLOUD_NAME = 'drpt6ztkd';
const CLOUDINARY_UPLOAD_PRESET = 'furia_motor_preset';

let currentUser = null;
let currentUserRoles = [];
let solicitudesPendientes = [];

// Variables para subida de comprobante
let currentSolicitudId = null;
let currentComprobanteFile = null;

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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
    
    if (modalId === 'modalComprar') {
        currentComprobanteFile = null;
    }
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
        'pendiente': 'status-pendiente',
        'comprado': 'status-comprado',
        'entregado': 'status-entregado'
    };
    
    const texto = {
        'pendiente': 'Pendiente',
        'comprado': 'Comprado',
        'entregado': 'Entregado'
    };
    
    const iconos = {
        'pendiente': 'fa-clock',
        'comprado': 'fa-check-circle',
        'entregado': 'fa-truck'
    };
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${iconos[estado] || 'fa-clock'}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// SUBIR A CLOUDINARY
// =====================================================

async function subirACloudinary(file) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', 'comprobantes_compra');
        
        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
        
        console.log('📤 Subiendo a Cloudinary...');
        
        fetch(cloudinaryUrl, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                console.log('✅ Comprobante subido:', data.secure_url);
                resolve(data.secure_url);
            } else {
                console.error('❌ Error Cloudinary:', data);
                reject(new Error(data.error?.message || 'Error al subir a Cloudinary'));
            }
        })
        .catch(err => {
            console.error('❌ Error de red:', err);
            reject(new Error('Error de conexión con Cloudinary'));
        });
    });
}

// =====================================================
// CARGA DE DATOS Y ESTADÍSTICAS
// =====================================================

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/stats`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.stats) {
            const pendientes = document.getElementById('statPendientes');
            const comprados = document.getElementById('statComprados');
            const entregados = document.getElementById('statEntregados');
            const total = document.getElementById('statTotal');
            
            if (pendientes) pendientes.textContent = data.stats.pendientes || 0;
            if (comprados) comprados.textContent = data.stats.comprados || 0;
            if (entregados) entregados.textContent = data.stats.entregados || 0;
            if (total) total.textContent = data.stats.total || 0;
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

async function cargarSolicitudes() {
    mostrarLoading(true);
    
    try {
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        let url = `${API_URL}/solicitudes-compra`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = API_BASE_URL + '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            let solicitudes = data.solicitudes || [];
            
            if (search) {
                solicitudes = solicitudes.filter(s => 
                    (s.orden_codigo || '').toLowerCase().includes(search) ||
                    (s.descripcion_pieza || '').toLowerCase().includes(search) ||
                    (s.vehiculo || '').toLowerCase().includes(search)
                );
            }
            
            solicitudesPendientes = solicitudes;
            renderizarSolicitudes(solicitudes);
            await cargarEstadisticas();
        } else {
            showToast(data.error || 'Error al cargar solicitudes', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarSolicitudes(solicitudes) {
    const container = document.getElementById('solicitudesContainer');
    if (!container) return;
    
    if (solicitudes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay solicitudes de compra</p>
                <small>Las solicitudes aparecerán aquí cuando el Jefe de Taller las cree</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = solicitudes.map(solicitud => {
        let items = solicitud.items || [];
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
        }
        
        const itemsHtml = items.map(item => `
            <div class="item-row-solicitud">
                <div class="item-desc">${escapeHtml(item.descripcion)}</div>
                <div class="item-cant">${item.cantidad} uds</div>
                <div class="item-detalle">${escapeHtml(item.detalle || '')}</div>
            </div>
        `).join('');
        
        const puedeComprar = solicitud.estado === 'pendiente';
        const puedeEntregar = solicitud.estado === 'comprado';
        const tieneComprobante = solicitud.comprobante_url;
        
        return `
            <div class="solicitud-card" data-id="${solicitud.id}">
                <div class="solicitud-header">
                    <h3><i class="fas fa-shopping-cart"></i> Solicitud #${solicitud.id}</h3>
                    ${statusBadge(solicitud.estado)}
                </div>
                <div class="solicitud-body">
                    <div class="orden-info">
                        <div class="orden-info-item">
                            <label>Orden de Trabajo</label>
                            <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
                        </div>
                        <div class="orden-info-item">
                            <label>Vehículo</label>
                            <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <label>Servicio</label>
                            <span>${escapeHtml(solicitud.servicio_descripcion || 'N/A')}</span>
                        </div>
                        <div class="orden-info-item">
                            <label>Fecha Solicitud</label>
                            <span>${formatDate(solicitud.fecha_solicitud)}</span>
                        </div>
                    </div>
                    
                    <div class="items-list">
                        <h4><i class="fas fa-cubes"></i> Items solicitados:</h4>
                        ${itemsHtml}
                    </div>
                    
                    ${solicitud.precio_cotizado ? `
                        <div class="precio-cotizado-box">
                            <strong><i class="fas fa-tag"></i> Precio cotizado:</strong>
                            <span class="precio-valor">Bs. ${solicitud.precio_cotizado.toFixed(2)}</span>
                            ${solicitud.proveedor_info ? `<br><small>Proveedor: ${escapeHtml(solicitud.proveedor_info)}</small>` : ''}
                        </div>
                    ` : ''}
                    
                    ${solicitud.mensaje_jefe_taller ? `
                        <div class="observacion-box">
                            <small><i class="fas fa-comment"></i> Mensaje del Jefe de Taller:</small>
                            <p>${escapeHtml(solicitud.mensaje_jefe_taller)}</p>
                        </div>
                    ` : ''}
                    
                    ${solicitud.respuesta_encargado ? `
                        <div class="observacion-box">
                            <small><i class="fas fa-reply"></i> Tu respuesta:</small>
                            <p>${escapeHtml(solicitud.respuesta_encargado)}</p>
                        </div>
                    ` : ''}
                    
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="verDetalle(${solicitud.id})" title="Ver Detalle">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        ${tieneComprobante ? `
                            <button class="action-btn view" onclick="verComprobante(${solicitud.id})" title="Ver Comprobante">
                                <i class="fas fa-receipt"></i> Ver Comprobante
                            </button>
                        ` : ''}
                        ${puedeComprar ? `
                            <button class="action-btn buy" onclick="abrirModalComprar(${solicitud.id})" title="Marcar como Comprado">
                                <i class="fas fa-shopping-cart"></i> Marcar Comprado
                            </button>
                        ` : ''}
                        ${puedeEntregar ? `
                            <button class="action-btn deliver" onclick="abrirModalEntregar(${solicitud.id})" title="Registrar Entrega">
                                <i class="fas fa-truck"></i> Registrar Entrega
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// VER DETALLE
// =====================================================

async function verDetalle(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map(item => `
        <div class="item-row-solicitud">
            <div class="item-desc">${escapeHtml(item.descripcion)}</div>
            <div class="item-cant">${item.cantidad} uds</div>
            <div class="item-detalle">${escapeHtml(item.detalle || '')}</div>
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalDetalleBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="orden-info">
                <div class="orden-info-item">
                    <label>Solicitud ID</label>
                    <span>#${solicitud.id}</span>
                </div>
                <div class="orden-info-item">
                    <label>Orden de Trabajo</label>
                    <span><strong>${escapeHtml(solicitud.orden_codigo || 'N/A')}</strong></span>
                </div>
                <div class="orden-info-item">
                    <label>Vehículo</label>
                    <span>${escapeHtml(solicitud.vehiculo || 'N/A')}</span>
                </div>
                <div class="orden-info-item">
                    <label>Servicio</label>
                    <span>${escapeHtml(solicitud.servicio_descripcion || 'N/A')}</span>
                </div>
                <div class="orden-info-item">
                    <label>Fecha Solicitud</label>
                    <span>${formatDateTime(solicitud.fecha_solicitud)}</span>
                </div>
                <div class="orden-info-item">
                    <label>Estado</label>
                    <span>${statusBadge(solicitud.estado)}</span>
                </div>
            </div>
            
            <div class="items-list">
                <h4>Items solicitados:</h4>
                ${itemsHtml}
            </div>
            
            ${solicitud.precio_cotizado ? `
                <div class="precio-cotizado-box">
                    <strong>Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                    ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
                </div>
            ` : ''}
            
            ${solicitud.mensaje_jefe_taller ? `
                <div class="observacion-box">
                    <small>Mensaje del Jefe de Taller:</small>
                    <p>${escapeHtml(solicitud.mensaje_jefe_taller)}</p>
                </div>
            ` : ''}
            
            ${solicitud.respuesta_encargado ? `
                <div class="observacion-box">
                    <small>Tu respuesta:</small>
                    <p>${escapeHtml(solicitud.respuesta_encargado)}</p>
                </div>
            ` : ''}
            
            ${solicitud.comprobante_url ? `
                <div class="comprobante-box">
                    <strong><i class="fas fa-receipt"></i> Comprobante de compra:</strong>
                    <div style="margin-top: 0.5rem;">
                        <button class="btn-outline" onclick="verComprobante(${solicitud.id})">
                            <i class="fas fa-image"></i> Ver Comprobante
                        </button>
                    </div>
                </div>
            ` : ''}
        `;
    }
    
    abrirModal('modalDetalle');
}

// =====================================================
// VER COMPROBANTE
// =====================================================

async function verComprobante(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud || !solicitud.comprobante_url) return;
    
    const modalBody = document.getElementById('modalVerComprobanteBody');
    const isImage = solicitud.comprobante_url.match(/\.(jpeg|jpg|gif|png|webp)$/i);
    
    if (modalBody) {
        modalBody.innerHTML = `
            <div style="text-align: center;">
                ${isImage ? 
                    `<img src="${solicitud.comprobante_url}" alt="Comprobante" style="max-width: 100%; max-height: 60vh; border-radius: var(--radius-md);">` :
                    `<iframe src="${solicitud.comprobante_url}" style="width: 100%; height: 60vh; border: none; border-radius: var(--radius-md);"></iframe>`
                }
                <div style="margin-top: 1rem; text-align: left;">
                    <p><strong>Factura/Comprobante N°:</strong> ${escapeHtml(solicitud.numero_factura || 'N/A')}</p>
                    <p><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_nombre || solicitud.proveedor_info || 'N/A')}</p>
                    <p><strong>Monto:</strong> Bs. ${(solicitud.precio_cotizado || 0).toFixed(2)}</p>
                    <p><strong>Fecha de compra:</strong> ${formatDate(solicitud.fecha_compra)}</p>
                </div>
            </div>
        `;
    }
    
    const downloadBtn = document.getElementById('descargarComprobanteBtn');
    if (downloadBtn) {
        downloadBtn.href = solicitud.comprobante_url;
        downloadBtn.download = `comprobante_${solicitud.id}.${isImage ? 'jpg' : 'pdf'}`;
    }
    
    abrirModal('modalVerComprobante');
}

// =====================================================
// CONFIGURAR SUBIDA DE COMPROBANTE
// =====================================================

function configurarSubidaComprobante() {
    const uploadArea = document.getElementById('comprobanteUploadArea');
    const fileInput = document.getElementById('comprobanteFile');
    const removeBtn = document.getElementById('removeComprobanteBtn');
    
    if (!uploadArea || !fileInput) return;
    
    // Limpiar eventos anteriores
    const newUploadArea = uploadArea.cloneNode(true);
    uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    
    const finalUploadArea = document.getElementById('comprobanteUploadArea');
    const finalFileInput = document.getElementById('comprobanteFile');
    const finalRemoveBtn = document.getElementById('removeComprobanteBtn');
    
    if (!finalUploadArea || !finalFileInput) return;
    
    finalUploadArea.addEventListener('click', () => finalFileInput.click());
    
    finalFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) procesarArchivoComprobante(file);
    });
    
    if (finalRemoveBtn) {
        finalRemoveBtn.addEventListener('click', () => {
            currentComprobanteFile = null;
            const preview = document.getElementById('comprobantePreview');
            if (preview) preview.style.display = 'none';
            finalFileInput.value = '';
        });
    }
}

function procesarArchivoComprobante(file) {
    if (file.size > 5 * 1024 * 1024) {
        showToast('El archivo no debe superar los 5MB', 'error');
        return;
    }
    
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!tiposPermitidos.includes(file.type)) {
        showToast('Formato no permitido. Use JPG, PNG o PDF', 'error');
        return;
    }
    
    currentComprobanteFile = file;
    
    const preview = document.getElementById('comprobantePreview');
    const nombreSpan = document.getElementById('comprobanteNombre');
    if (preview && nombreSpan) {
        nombreSpan.textContent = file.name;
        preview.style.display = 'flex';
    }
    showToast('Comprobante cargado correctamente', 'success');
}

// =====================================================
// MARCAR COMO COMPRADO (CON COMPROBANTE)
// =====================================================

function abrirModalComprar(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;
    
    currentSolicitudId = idSolicitud;
    currentComprobanteFile = null;
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map(item => `
        <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm);">
            <strong>${escapeHtml(item.descripcion)}</strong> - ${item.cantidad} uds
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalComprarBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="orden-info" style="margin-bottom: 1rem;">
                <div class="orden-info-item">
                    <label>Orden</label>
                    <span><strong>${escapeHtml(solicitud.orden_codigo)}</strong></span>
                </div>
                <div class="orden-info-item">
                    <label>Vehículo</label>
                    <span>${escapeHtml(solicitud.vehiculo)}</span>
                </div>
            </div>
            
            <div class="items-list">
                <h4>Items a comprar:</h4>
                ${itemsHtml}
            </div>
            
            ${solicitud.precio_cotizado ? `
                <div class="precio-cotizado-box">
                    <strong>Precio cotizado:</strong> Bs. ${solicitud.precio_cotizado.toFixed(2)}
                    ${solicitud.proveedor_info ? `<br><strong>Proveedor:</strong> ${escapeHtml(solicitud.proveedor_info)}` : ''}
                </div>
            ` : ''}
            
            <div class="compra-form">
                <div class="form-group">
                    <label>Fecha de compra</label>
                    <input type="date" id="fechaCompra" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                </div>
                
                <div class="form-group">
                    <label>N° de Factura/Comprobante</label>
                    <input type="text" id="numeroFactura" class="form-input" placeholder="Ej: 001-123456">
                </div>
                
                <div class="form-group">
                    <label>Proveedor</label>
                    <input type="text" id="proveedorNombre" class="form-input" placeholder="Nombre del proveedor">
                </div>
                
                <div class="form-group">
                    <label>Monto total de la compra (Bs.)</label>
                    <input type="number" id="montoCompra" step="0.01" class="form-input" placeholder="0.00">
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-image"></i> Subir foto del recibo/comprobante <span class="required">*</span></label>
                    <div class="file-upload-area" id="comprobanteUploadArea">
                        <i class="fas fa-cloud-upload-alt" style="font-size: 32px; color: var(--rojo-primario); margin-bottom: 0.5rem;"></i>
                        <p style="margin: 0; font-size: 0.85rem;">Haz clic para seleccionar el comprobante</p>
                        <small style="color: var(--gris-texto);">Formatos: JPG, PNG, PDF (Máx. 5MB)</small>
                        <input type="file" id="comprobanteFile" accept="image/*,application/pdf" style="display: none;">
                    </div>
                    <div id="comprobantePreview" style="display: none; margin-top: 0.5rem;" class="comprobante-preview">
                        <i class="fas fa-file-image"></i>
                        <span id="comprobanteNombre"></span>
                        <button type="button" id="removeComprobanteBtn" class="btn-remove-comprobante">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Notas de compra (opcional)</label>
                    <textarea id="notasCompra" rows="2" class="form-textarea" placeholder="Detalles adicionales de la compra..."></textarea>
                </div>
            </div>
        `;
    }
    
    setTimeout(() => configurarSubidaComprobante(), 100);
    abrirModal('modalComprar');
}

async function confirmarCompra() {
    const fechaCompra = document.getElementById('fechaCompra')?.value || new Date().toISOString().split('T')[0];
    const numeroFactura = document.getElementById('numeroFactura')?.value || '';
    const proveedorNombre = document.getElementById('proveedorNombre')?.value || '';
    const montoCompra = document.getElementById('montoCompra')?.value;
    const notas = document.getElementById('notasCompra')?.value || '';
    
    if (!currentComprobanteFile) {
        showToast('⚠️ Debes subir la foto del recibo/comprobante de compra', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        let comprobanteUrl = null;
        
        if (currentComprobanteFile) {
            try {
                comprobanteUrl = await subirACloudinary(currentComprobanteFile);
                console.log('✅ Comprobante subido a Cloudinary:', comprobanteUrl);
            } catch (cloudError) {
                console.error('Error al subir a Cloudinary:', cloudError);
                showToast('Error al subir el comprobante. Intenta nuevamente.', 'error');
                mostrarLoading(false);
                return;
            }
        }
        
        const response = await fetch(`${API_URL}/solicitudes-compra/${currentSolicitudId}/comprar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                fecha_compra: fechaCompra,
                numero_factura: numeroFactura,
                proveedor_nombre: proveedorNombre,
                monto_compra: montoCompra ? parseFloat(montoCompra) : null,
                notas_compra: notas,
                comprobante_url: comprobanteUrl
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Compra registrada exitosamente con comprobante', 'success');
            cerrarModal('modalComprar');
            currentComprobanteFile = null;
            await cargarSolicitudes();
        } else {
            showToast(data.error || 'Error al registrar compra', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al procesar la compra: ' + error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// REGISTRAR ENTREGA
// =====================================================

function abrirModalEntregar(idSolicitud) {
    const solicitud = solicitudesPendientes.find(s => s.id === idSolicitud);
    if (!solicitud) return;
    
    currentSolicitudId = idSolicitud;
    
    let items = solicitud.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = [{ descripcion: solicitud.descripcion_pieza, cantidad: solicitud.cantidad }]; }
    }
    
    const itemsHtml = items.map(item => `
        <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--gris-oscuro); border-radius: var(--radius-sm);">
            <strong>${escapeHtml(item.descripcion)}</strong> - ${item.cantidad} uds
        </div>
    `).join('');
    
    const modalBody = document.getElementById('modalEntregarBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="orden-info" style="margin-bottom: 1rem;">
                <div class="orden-info-item">
                    <label>Orden</label>
                    <span><strong>${escapeHtml(solicitud.orden_codigo)}</strong></span>
                </div>
                <div class="orden-info-item">
                    <label>Vehículo</label>
                    <span>${escapeHtml(solicitud.vehiculo)}</span>
                </div>
            </div>
            
            <div class="items-list">
                <h4>Items a entregar:</h4>
                ${itemsHtml}
            </div>
            
            <div class="compra-form">
                <div class="form-group">
                    <label>Fecha de entrega</label>
                    <input type="date" id="fechaEntrega" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label>Notas de entrega (opcional)</label>
                    <textarea id="notasEntrega" rows="2" class="form-textarea" placeholder="Detalles de la entrega..."></textarea>
                </div>
            </div>
        `;
    }
    
    abrirModal('modalEntregar');
}

async function confirmarEntrega() {
    const fechaEntrega = document.getElementById('fechaEntrega')?.value || new Date().toISOString().split('T')[0];
    const notas = document.getElementById('notasEntrega')?.value || '';
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${currentSolicitudId}/entregar`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                fecha_entrega: fechaEntrega,
                notas_entrega: notas
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Entrega registrada exitosamente', 'success');
            cerrarModal('modalEntregar');
            await cargarSolicitudes();
        } else {
            showToast(data.error || 'Error al registrar entrega', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
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
            window.location.href = API_BASE_URL + '/';
            return null;
        }
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        let userData = null;
        try {
            const userStr = localStorage.getItem('furia_user');
            if (userStr) userData = JSON.parse(userStr);
        } catch (e) {}
        
        currentUser = {
            id: payload.user?.id || payload.id || payload.user_id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario',
            email: payload.user?.email || payload.email || userData?.email,
            roles: payload.user?.roles || payload.roles || userData?.roles || [],
            rol_principal: payload.user?.rol_principal || payload.rol_principal || userData?.rol_principal
        };
        
        if (currentUser.roles && Array.isArray(currentUser.roles)) {
            currentUserRoles = currentUser.roles;
        } else if (currentUser.rol_principal) {
            currentUserRoles = [currentUser.rol_principal];
        }
        
        const tieneRolRepuestos = currentUserRoles.includes('encargado_repuestos') || 
                                    currentUserRoles.includes('encargado_rep_almacen') ||
                                    currentUser.rol_principal === 'encargado_repuestos';
        
        if (!tieneRolRepuestos) {
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = API_BASE_URL + '/';
            }, 2000);
            return null;
        }
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', opciones);
        }
        
        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
        
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        window.location.href = API_BASE_URL + '/';
        return null;
    }
}

function logout() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = API_BASE_URL + '/';
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarSolicitudes();
            showToast('Actualizando...', 'info');
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarSolicitudes());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarSolicitudes());
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando solicitudes_compra.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarSolicitudes();
    setupEventListeners();
    
    console.log('✅ solicitudes_compra.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalle = verDetalle;
window.verComprobante = verComprobante;
window.abrirModalComprar = abrirModalComprar;
window.abrirModalEntregar = abrirModalEntregar;
window.confirmarCompra = confirmarCompra;
window.confirmarEntrega = confirmarEntrega;
window.cerrarModal = cerrarModal;
window.logout = logout;

document.addEventListener('DOMContentLoaded', inicializar);