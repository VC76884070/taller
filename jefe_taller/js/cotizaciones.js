// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            return 'http://localhost:5000';
        }
        return '';
    })();
}

// =====================================================
// COTIZACIONES.JS - JEFE DE TALLER
// VERSIÓN 6.0 - CON FOTOS POR ITEM Y SERVICIOS
// =====================================================

const API_URL = window.API_BASE_URL + '/api/jefe-taller';
let currentUser = null;
let currentUserRoles = [];

// Datos globales
let ordenesParaCotizar = [];
let ordenesDiagnosticoAprobado = [];
let encargadosRepuestos = [];
let solicitudesCotizacion = [];
let cotizacionesMap = {};
let solicitudesCompra = [];
let historialCotizaciones = [];
let solicitudesRepuestosTecnico = [];

// Items dinámicos
let itemsSolicitud = [];
let itemsCompraDirecta = [];

// Variables para archivo y servicios
let currentFileData = null;
let currentFileName = null;
let currentOrdenData = null;
let currentCotizacionId = null;
let serviciosCotizables = [];
let isEditingCotizacion = false;
let currentOrdenAceptada = null;
let currentOrdenArmado = null;

// Variable para solicitud de técnico
let currentSolicitudTecnico = null;

// =====================================================
// 🆕 VARIABLES PARA SERVICIOS EN MODAL COTIZACIÓN
// =====================================================
let serviciosParaSolicitud = [];
let itemsPorServicio = {};
let ordenActualSolicitud = null;

// Estados de orden
const ESTADOS_ORDEN = {
    DIAGNOSTICO_APROBADO: 'DiagnosticoAprobado',
    COTIZACION_ENVIADA: 'CotizacionEnviada',
    COTIZACION_ACEPTADA: 'CotizacionAceptada',
    COTIZACION_PARCIAL: 'CotizacionParcial',
    COTIZACION_RECHAZADA: 'CotizacionRechazada',
    EN_ARMADO: 'EnArmadoVehiculo',
    VEHICULO_ARMADO: 'VehiculoArmado',
    EN_REPARACION: 'EnReparacion',
    EN_PAUSA: 'EnPausa',
    REPARACION_COMPLETADA: 'ReparacionCompletada',
    FINALIZADO: 'Finalizado',
    ENTREGADO: 'Entregado'
};

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
        return date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr.split('T')[0];
    }
}

function formatCurrency(amount) {
    return `Bs. ${(amount || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    if (modal) modal.classList.remove('show');
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
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
        'cotizado': 'status-cotizado',
        'aprobado': 'status-aprobado',
        'rechazado': 'status-rechazado',
        'comprado': 'status-comprado',
        'enviada': 'status-enviado',
        'aprobada': 'status-aprobado',
        'expirada': 'status-pendiente',
        'solicitado': 'status-pendiente',
        'en_proceso': 'status-cotizado',
        'completado': 'status-aprobado'
    };
    
    const texto = {
        'pendiente': 'Pendiente',
        'cotizado': 'Cotizado',
        'aprobado': 'Aprobado',
        'rechazado': 'Rechazado',
        'enviada': 'Enviada',
        'aprobada': 'Aprobada',
        'expirada': 'Expirada',
        'comprado': 'Comprado',
        'solicitado': 'Solicitud Enviada',
        'en_proceso': 'En Proceso',
        'completado': 'Completado'
    };
    
    let icon = 'fa-clock';
    if (estado === 'aprobado' || estado === 'aprobada' || estado === 'comprado' || estado === 'completado') icon = 'fa-check-circle';
    if (estado === 'rechazado') icon = 'fa-times-circle';
    if (estado === 'enviada') icon = 'fa-paper-plane';
    if (estado === 'solicitado') icon = 'fa-paper-plane';
    if (estado === 'en_proceso') icon = 'fa-spinner fa-pulse';
    
    return `<span class="status-badge ${map[estado] || 'status-pendiente'}">
        <i class="fas ${icon}"></i> ${texto[estado] || estado}
    </span>`;
}

// =====================================================
// 🆕 FUNCIONES PARA SERVICIOS EN MODAL COTIZACIÓN
// =====================================================

async function cargarServiciosConItems(id_orden) {
    try {
        const response = await fetch(`${API_URL}/servicios-con-items/${id_orden}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            serviciosParaSolicitud = data.servicios || [];
            
            // Inicializar items por servicio
            serviciosParaSolicitud.forEach(serv => {
                if (!itemsPorServicio[serv.id_servicio]) {
                    itemsPorServicio[serv.id_servicio] = serv.items || [];
                }
            });
            
            console.log(`📊 ${serviciosParaSolicitud.length} servicios encontrados`);
            return serviciosParaSolicitud;
        } else {
            showToast(data.error || 'Error al cargar servicios', 'error');
            return [];
        }
    } catch (error) {
        console.error('Error cargando servicios:', error);
        showToast('Error de conexión', 'error');
        return [];
    }
}

function renderServiciosAcordeon(servicios, id_orden) {
    const container = document.getElementById('serviciosItemsContainer');
    if (!container) return;
    
    if (!servicios || servicios.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-info-circle"></i>
                <p>No hay servicios disponibles para esta orden</p>
                <small>El diagnóstico debe estar aprobado para poder solicitar cotización</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = servicios.map((serv, idx) => {
        const items = itemsPorServicio[serv.id_servicio] || [];
        const tieneItems = items.length > 0;
        const estado = serv.estado || 'pendiente';
        const badgeClass = estado === 'solicitado' ? 'activo' : 'pendiente';
        const badgeText = estado === 'solicitado' ? 'Solicitado' : 'Pendiente';
        
        return `
            <div class="servicio-acordeon" data-servicio-id="${serv.id_servicio}">
                <div class="servicio-acordeon-header" onclick="toggleServicioAcordeon(${serv.id_servicio})">
                    <div class="servicio-info-acordeon">
                        <span class="servicio-icono"><i class="fas fa-wrench"></i></span>
                        <span class="servicio-nombre-acordeon">${escapeHtml(serv.descripcion)}</span>
                        <span class="servicio-badge ${badgeClass}">${badgeText}</span>
                        <span style="font-size:0.65rem; color:var(--gris-texto);">${items.length} item(s)</span>
                    </div>
                    <div>
                        <span class="servicio-toggle" id="toggle-icon-${serv.id_servicio}">
                            <i class="fas fa-chevron-down"></i>
                        </span>
                    </div>
                </div>
                <div class="servicio-acordeon-body" id="servicio-body-${serv.id_servicio}">
                    <div class="items-list-container">
                        <div class="items-list" id="itemsListServicio_${serv.id_servicio}">
                            ${renderItemsServicio(serv.id_servicio, items)}
                        </div>
                        <button type="button" class="btn-add-item btn-sm" onclick="agregarItemServicio(${serv.id_servicio})">
                            <i class="fas fa-plus-circle"></i> Agregar item
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// RENDERIZAR ITEMS DE SERVICIO CON SOPORTE PARA 3 FOTOS
// =====================================================

function renderItemsServicio(id_servicio, items) {
    if (!items || items.length === 0) {
        return `
            <div class="item-empty">
                <i class="fas fa-box-open"></i>
                <p>No hay items agregados</p>
                <small>Haz clic en "Agregar item" para comenzar</small>
            </div>
        `;
    }
    
    return items.map((item, index) => {
        const fotos = item.fotos || [];
        const tieneFotos = fotos.length > 0;
        
        // 🔥 GENERAR PREVIEWS PARA CADA FOTO (hasta 3)
        let fotosPreviewsHtml = '';
        for (let i = 0; i < 3; i++) {
            const fotoUrl = fotos[i] || '';
            const tieneFoto = !!fotoUrl;
            const fotoId = `fotoPreviewServicio_${id_servicio}_${index}_${i}`;
            const loaderId = `fotoLoaderServicio_${id_servicio}_${index}_${i}`;
            const inputId = `fotoInputServicio_${id_servicio}_${index}_${i}`;
            
            fotosPreviewsHtml += `
                <div class="foto-slot" data-slot="${i}" style="position:relative;display:inline-block;width:40px;height:40px;margin:2px;">
                    <input type="file" class="item-foto-input-servicio" id="${inputId}" accept="image/*" 
                           onchange="subirFotoItemServicio(${id_servicio}, ${index}, ${i}, this)" style="display:none;">
                    <div id="${loaderId}" style="display:${tieneFoto ? 'none' : 'flex'};align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;border:1px dashed var(--gris-texto);cursor:pointer;" 
                         onclick="document.getElementById('${inputId}').click()">
                        <i class="fas fa-plus" style="color:var(--gris-texto);font-size:12px;"></i>
                    </div>
                    <div id="${fotoId}" style="display:${tieneFoto ? 'block' : 'none'};position:relative;">
                        ${tieneFoto ? `
                            <div style="position:relative;display:inline-block;">
                                <img src="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:2px solid var(--verde-exito);" 
                                     data-loaded="false" data-url="${fotoUrl}"
                                     onerror="this.style.display='none'">
                                <button type="button" class="btn-remove-foto" 
                                        onclick="event.preventDefault(); eliminarFotoItemServicio(${id_servicio}, ${index}, ${i})" 
                                        style="position:absolute;top:-4px;right:-4px;background:var(--rojo-primario);color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    ${!tieneFoto ? `<span style="position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);font-size:7px;color:var(--gris-texto);">${i+1}</span>` : ''}
                </div>
            `;
        }
        
        return `
            <div class="item-row" data-servicio="${id_servicio}" data-index="${index}">
                <div class="item-fields">
                    <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Descripción del item" onchange="actualizarItemServicio(${id_servicio}, ${index}, 'descripcion', this.value)">
                    <input type="number" class="item-cantidad" value="${item.cantidad}" min="1" onchange="actualizarItemServicio(${id_servicio}, ${index}, 'cantidad', parseInt(this.value))">
                    <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle (marca, especificaciones...)" onchange="actualizarItemServicio(${id_servicio}, ${index}, 'detalle', this.value)">
                </div>
                <div class="item-foto-upload" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                    ${fotosPreviewsHtml}
                    <span style="font-size:0.6rem;color:var(--gris-texto);margin-left:2px;">(${fotos.length}/3)</span>
                </div>
                <div class="item-actions">
                    <button type="button" class="btn-remove-item" onclick="event.preventDefault(); eliminarItemServicio(${id_servicio}, ${index})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function toggleServicioAcordeon(id_servicio) {
    const body = document.getElementById(`servicio-body-${id_servicio}`);
    const toggleIcon = document.getElementById(`toggle-icon-${id_servicio}`);
    
    if (!body) return;
    
    const isOpen = body.classList.contains('open');
    
    // Cerrar todos los acordeones
    document.querySelectorAll('.servicio-acordeon-body').forEach(b => b.classList.remove('open'));
    document.querySelectorAll('.servicio-toggle').forEach(icon => {
        icon.classList.remove('rotated');
    });
    
    // Si estaba cerrado, abrirlo
    if (!isOpen) {
        body.classList.add('open');
        if (toggleIcon) toggleIcon.classList.add('rotated');
    }
}

// =====================================================
// MODIFICAR LA ESTRUCTURA DEL ITEM PARA SOPORTAR MÚLTIPLES FOTOS
// =====================================================

// Al agregar un item, ahora tiene un array de fotos
function agregarItemServicio(id_servicio) {
    if (!itemsPorServicio[id_servicio]) {
        itemsPorServicio[id_servicio] = [];
    }
    itemsPorServicio[id_servicio].push({ 
        descripcion: '', 
        cantidad: 1, 
        detalle: '', 
        fotos: [],           // 🔥 ARRAY DE FOTOS (hasta 3)
        foto_public_ids: []  // 🔥 ARRAY DE PUBLIC IDs
    });
    
    const container = document.getElementById(`itemsListServicio_${id_servicio}`);
    if (container) {
        container.innerHTML = renderItemsServicio(id_servicio, itemsPorServicio[id_servicio]);
    }
}

function actualizarItemServicio(id_servicio, index, campo, valor) {
    if (itemsPorServicio[id_servicio] && itemsPorServicio[id_servicio][index]) {
        itemsPorServicio[id_servicio][index][campo] = valor;
    }
}

function eliminarItemServicio(id_servicio, index) {
    if (!confirm('¿Eliminar este item?')) return;
    
    if (itemsPorServicio[id_servicio]) {
        itemsPorServicio[id_servicio].splice(index, 1);
    }
    
    const container = document.getElementById(`itemsListServicio_${id_servicio}`);
    if (container) {
        container.innerHTML = renderItemsServicio(id_servicio, itemsPorServicio[id_servicio] || []);
    }
}
// =====================================================
// ELIMINAR FOTO DE DRIVE (AUXILIAR)
// =====================================================

async function eliminarFotoDeDrive(publicId) {
    if (!publicId) return true;
    
    try {
        const response = await fetch(`${API_URL}/eliminar-foto-item`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                public_id: publicId
            })
        });
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error eliminando foto de Drive:', error);
        return false;
    }
}
// =====================================================
// SUBIR FOTO DE ITEM (SERVICIO) - SOPORTE PARA 3 FOTOS
// =====================================================

async function subirFotoItemServicio(id_servicio, index, slotIndex, input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Solo se permiten imágenes', 'error');
        input.value = '';
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen no debe superar los 5MB', 'error');
        input.value = '';
        return;
    }
    
    // Verificar que no exceda 3 fotos
    if (itemsPorServicio[id_servicio] && itemsPorServicio[id_servicio][index]) {
        const fotosActuales = itemsPorServicio[id_servicio][index].fotos || [];
        if (fotosActuales.length >= 3) {
            showToast('Ya tienes 3 fotos para este item. Elimina una para agregar otra.', 'warning');
            input.value = '';
            return;
        }
    }
    
    mostrarLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('foto', file);
        
        // 🔥 ENVIAR CÓDIGO DE ORDEN AL BACKEND
        const ordenInfo = ordenesDiagnosticoAprobado.find(o => o.id_orden === ordenActualSolicitud);
        if (ordenInfo && ordenInfo.codigo_unico) {
            formData.append('codigo_orden', ordenInfo.codigo_unico);
            formData.append('id_orden', ordenActualSolicitud);
            console.log(`📤 Enviando foto para orden: ${ordenInfo.codigo_unico}`);
        } else {
            console.warn('⚠️ No se encontró código de orden, se usará carpeta global');
        }
        
        const response = await fetch(`${API_URL}/subir-foto-item`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeaders()['Authorization']
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success && data.url) {
            // ✅ Guardar URL en el item (array de fotos)
            if (itemsPorServicio[id_servicio] && itemsPorServicio[id_servicio][index]) {
                if (!itemsPorServicio[id_servicio][index].fotos) {
                    itemsPorServicio[id_servicio][index].fotos = [];
                }
                if (!itemsPorServicio[id_servicio][index].foto_public_ids) {
                    itemsPorServicio[id_servicio][index].foto_public_ids = [];
                }
                
                // Si el slot ya tiene foto, reemplazar
                if (itemsPorServicio[id_servicio][index].fotos[slotIndex]) {
                    // Eliminar la foto anterior de Drive
                    const oldPublicId = itemsPorServicio[id_servicio][index].foto_public_ids[slotIndex];
                    if (oldPublicId) {
                        await eliminarFotoDeDrive(oldPublicId);
                    }
                    itemsPorServicio[id_servicio][index].fotos[slotIndex] = data.url;
                    itemsPorServicio[id_servicio][index].foto_public_ids[slotIndex] = data.public_id;
                } else {
                    // Agregar nueva foto
                    itemsPorServicio[id_servicio][index].fotos.push(data.url);
                    itemsPorServicio[id_servicio][index].foto_public_ids.push(data.public_id);
                }
            }
            
            // ✅ CARGAR PREVIEW CON PROXY
            await cargarPreviewFotoServicio(id_servicio, index, slotIndex, data.url);
            
            // ✅ ACTUALIZAR CONTADOR
            const contador = document.querySelector(`[data-servicio="${id_servicio}"] [data-index="${index}"] .item-foto-upload span`);
            if (contador) {
                const fotos = itemsPorServicio[id_servicio][index].fotos || [];
                contador.textContent = `(${fotos.length}/3)`;
            }
            
            showToast('✅ Foto subida correctamente', 'success');
        } else {
            showToast(data.error || 'Error al subir foto', 'error');
        }
    } catch (error) {
        console.error('Error subiendo foto:', error);
        showToast('Error de conexión al subir foto', 'error');
    } finally {
        mostrarLoading(false);
        input.value = '';
    }
}

// =====================================================
// ELIMINAR FOTO DE ITEM (SERVICIO) - MÚLTIPLES FOTOS
// =====================================================

async function eliminarFotoItemServicio(id_servicio, index, slotIndex) {
    if (!itemsPorServicio[id_servicio] || !itemsPorServicio[id_servicio][index]) {
        showToast('Item no encontrado', 'warning');
        return;
    }
    
    const item = itemsPorServicio[id_servicio][index];
    const fotos = item.fotos || [];
    const publicIds = item.foto_public_ids || [];
    
    if (slotIndex >= fotos.length || !fotos[slotIndex]) {
        showToast('No hay foto en esta posición', 'warning');
        return;
    }
    
    if (!publicIds[slotIndex]) {
        showToast('No se puede eliminar esta foto', 'warning');
        return;
    }
    
    if (!confirm('¿Eliminar esta foto?')) return;
    
    mostrarLoading(true);
    
    try {
        // Eliminar de Drive
        const response = await fetch(`${API_URL}/eliminar-foto-item`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                public_id: publicIds[slotIndex]
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Eliminar del array
            fotos.splice(slotIndex, 1);
            publicIds.splice(slotIndex, 1);
            
            // ✅ LIMPIAR PREVIEW
            const fotoId = `fotoPreviewServicio_${id_servicio}_${index}_${slotIndex}`;
            const loaderId = `fotoLoaderServicio_${id_servicio}_${index}_${slotIndex}`;
            const inputId = `fotoInputServicio_${id_servicio}_${index}_${slotIndex}`;
            
            // Ocultar imagen y mostrar loader
            const previewDiv = document.getElementById(fotoId);
            const loaderDiv = document.getElementById(loaderId);
            
            if (previewDiv) {
                previewDiv.style.display = 'none';
                previewDiv.innerHTML = '';
            }
            
            if (loaderDiv) {
                loaderDiv.style.display = 'flex';
                loaderDiv.innerHTML = `
                    <i class="fas fa-plus" style="color:var(--gris-texto);font-size:12px;"></i>
                `;
                loaderDiv.onclick = function() {
                    document.getElementById(inputId).click();
                };
            }
            
            // ✅ ACTUALIZAR CONTADOR
            const contador = document.querySelector(`[data-servicio="${id_servicio}"] [data-index="${index}"] .item-foto-upload span`);
            if (contador) {
                contador.textContent = `(${fotos.length}/3)`;
            }
            
            showToast('✅ Foto eliminada', 'success');
        } else {
            showToast(data.error || 'Error al eliminar foto', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}
// =====================================================
// HELPER PARA OBTENER EL INPUT DE FOTO CORRECTO
// =====================================================

function getInputFileServicio(id_servicio, index) {
    const container = document.getElementById(`itemsListServicio_${id_servicio}`);
    if (!container) return null;
    
    const rows = container.querySelectorAll('.item-row');
    if (index >= rows.length) return null;
    
    return rows[index].querySelector('.item-foto-input-servicio');
}
// =====================================================
// CARGAR TODOS LOS PREVIEWS DE FOTOS EN SERVICIOS
// =====================================================

function cargarPreviewsFotosServicios() {
    for (const serv of serviciosParaSolicitud) {
        const items = itemsPorServicio[serv.id_servicio] || [];
        items.forEach((item, index) => {
            if (item.foto_url) {
                cargarPreviewFotoServicio(serv.id_servicio, index, item.foto_url);
            }
        });
    }
}

async function abrirModalSolicitudCotizacion(id_orden) {
    limpiarItemsSolicitud();
    ordenActualSolicitud = id_orden;
    
    // Resetear items por servicio
    itemsPorServicio = {};
    serviciosParaSolicitud = [];
    
    mostrarLoading(true);
    
    try {
        // Obtener información de la orden
        const ordenInfo = ordenesDiagnosticoAprobado.find(o => o.id_orden === id_orden);
        if (ordenInfo) {
            document.getElementById('solicitudOrdenCodigo').textContent = ordenInfo.codigo_unico || '-';
            document.getElementById('solicitudVehiculo').textContent = ordenInfo.vehiculo || '-';
            document.getElementById('solicitudCliente').textContent = ordenInfo.cliente_nombre || '-';
        }
        
        document.getElementById('solicitud_id_orden_trabajo').value = id_orden;
        
        // Cargar servicios con items
        const servicios = await cargarServiciosConItems(id_orden);
        
        if (servicios.length === 0) {
            showToast('Esta orden no tiene servicios disponibles para cotizar', 'warning');
            mostrarLoading(false);
            return;
        }
        
        // Renderizar acordeón de servicios
        renderServiciosAcordeon(servicios, id_orden);
        
        // ✅ CARGAR PREVIEWS DE FOTOS EXISTENTES
        setTimeout(() => {
            cargarPreviewsFotosServicios();
        }, 300);
        
        // Cargar encargados de repuestos
        await cargarEncargadosRepuestos();
        
        abrirModal('modalSolicitudCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar el modal', 'error');
    } finally {
        mostrarLoading(false);
    }
}
async function guardarSolicitudCotizacion() {
    const id_orden = document.getElementById('solicitud_id_orden_trabajo')?.value;
    const id_encargado = document.getElementById('solicitud_id_encargado')?.value;
    const observaciones = document.getElementById('solicitud_observacion')?.value || '';
    
    if (!id_orden || !id_encargado) {
        showToast('Complete todos los campos requeridos', 'warning');
        return;
    }
    
    // Recolectar items de todos los servicios
    let todosLosItems = [];
    let itemsPorServicioEnvio = {};
    
    for (const serv of serviciosParaSolicitud) {
        const items = itemsPorServicio[serv.id_servicio] || [];
        if (items.length > 0) {
            const itemsValidos = items.filter(item => item.descripcion && item.descripcion.trim() !== '');
            if (itemsValidos.length > 0) {
                itemsPorServicioEnvio[serv.id_servicio] = itemsValidos;
                todosLosItems = todosLosItems.concat(itemsValidos);
            }
        }
    }
    
    if (todosLosItems.length === 0) {
        showToast('Agregue al menos un item en algún servicio para cotizar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const resultados = [];
        let errores = 0;
        
        // Enviar una solicitud por cada servicio que tenga items
        for (const serv of serviciosParaSolicitud) {
            const items = itemsPorServicioEnvio[serv.id_servicio] || [];
            if (items.length === 0) continue;
            
            const response = await fetch(`${API_URL}/solicitudes-cotizacion`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    id_orden_trabajo: parseInt(id_orden),
                    id_servicio: serv.id_servicio,
                    id_encargado: parseInt(id_encargado),
                    items: items,
                    observaciones: observaciones
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                resultados.push({
                    servicio: serv.descripcion,
                    items: items.length,
                    id: data.id
                });
                
                // Marcar servicio como solicitado
                serv.estado = 'solicitado';
            } else {
                errores++;
                console.error(`Error enviando solicitud para servicio ${serv.id_servicio}:`, data.error);
            }
        }
        
        if (resultados.length > 0) {
            showToast(`✅ ${resultados.length} solicitud(es) enviadas exitosamente`, 'success');
            cerrarModal('modalSolicitudCotizacion');
            
            // Actualizar los servicios en el acordeón
            renderServiciosAcordeon(serviciosParaSolicitud, parseInt(id_orden));
            
            await cargarSolicitudesCotizacion();
            await cargarOrdenesDiagnosticoAprobado();
        } else {
            showToast('Error al enviar las solicitudes', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// FUNCIONES LEGACY PARA COMPATIBILIDAD
// =====================================================

function renderItemsSolicitud() {
    const container = document.getElementById('itemsListSolicitud');
    if (!container) return;
    container.innerHTML = `<div class="item-empty"><i class="fas fa-box-open"></i><p>Usa los servicios para agregar items</p></div>`;
}

function agregarItemSolicitud() {
    showToast('Usa los servicios para agregar items', 'info');
}

function actualizarItemSolicitud(index, campo, valor) {
    // Función legacy
}

function eliminarItemSolicitud(index) {
    // Función legacy
}

function limpiarItemsSolicitud() {
    itemsSolicitud = [];
}

async function subirFotoItemSolicitud(index, input) {
    console.warn('⚠️ subirFotoItemSolicitud está obsoleta. Usa subirFotoItemServicio en su lugar.');
    showToast('La funcionalidad de fotos ahora está integrada en los servicios', 'info');
    if (input) input.value = '';
}

async function eliminarFotoItemSolicitud(index) {
    console.warn('⚠️ eliminarFotoItemSolicitud está obsoleta.');
    showToast('La funcionalidad de fotos ahora está integrada en los servicios', 'info');
}

// =====================================================
// RENDERIZAR ITEMS DE COMPRA DIRECTA CON PROXY
// =====================================================

function renderItemsCompraDirecta() {
    const container = document.getElementById('itemsListCompraDirecta');
    if (!container) return;
    
    if (itemsCompraDirecta.length === 0) {
        container.innerHTML = `<div class="item-empty"><i class="fas fa-box-open"></i><p>No hay items agregados</p><small>Haz clic en "Agregar item" para comenzar</small></div>`;
        return;
    }
    
    container.innerHTML = itemsCompraDirecta.map((item, index) => {
        const tieneFoto = item.foto_url ? true : false;
        
        return `
            <div class="item-row" data-index="${index}">
                <div class="item-fields">
                    <input type="text" class="item-descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Nombre del repuesto" onchange="actualizarItemCompraDirecta(${index}, 'descripcion', this.value)">
                    <input type="number" class="item-cantidad" value="${item.cantidad}" min="1" onchange="actualizarItemCompraDirecta(${index}, 'cantidad', parseInt(this.value))">
                    <input type="text" class="item-detalle" value="${escapeHtml(item.detalle || '')}" placeholder="Detalle (marca, especificaciones...)" onchange="actualizarItemCompraDirecta(${index}, 'detalle', this.value)">
                </div>
                <div class="item-foto-upload">
                    <input type="file" class="item-foto-input-compra" accept="image/*" onchange="subirFotoItemCompra(${index}, this)" style="display:none;">
                    <button type="button" class="btn-foto-item" onclick="event.preventDefault(); document.querySelectorAll('.item-foto-input-compra')[${index}]?.click()">
                        <i class="fas fa-camera"></i> Foto
                    </button>
                    <span class="item-foto-preview" id="fotoPreviewCompra_${index}">
                        ${tieneFoto ? `
                            <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;">
                                <i class="fas fa-spinner fa-spin" style="color:var(--gris-texto);font-size:14px;"></i>
                            </div>
                        ` : `
                            <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;border:1px dashed var(--gris-texto);">
                                <i class="fas fa-plus" style="color:var(--gris-texto);font-size:12px;"></i>
                            </div>
                        `}
                    </span>
                </div>
                <div class="item-actions">
                    <button type="button" class="btn-remove-item" onclick="event.preventDefault(); eliminarItemCompraDirecta(${index})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // 🔥 CARGAR PREVIEWS DE FOTOS EXISTENTES
    setTimeout(() => {
        itemsCompraDirecta.forEach((item, index) => {
            if (item.foto_url) {
                cargarPreviewFotoCompra(index, item.foto_url);
            }
        });
    }, 100);
}

function agregarItemCompraDirecta() {
    itemsCompraDirecta.push({ descripcion: '', cantidad: 1, detalle: '', foto_url: null, foto_public_id: null });
    renderItemsCompraDirecta();
    setTimeout(() => {
        const lastInput = document.querySelector('#itemsListCompraDirecta .item-row:last-child .item-descripcion');
        if (lastInput) lastInput.focus();
    }, 100);
}

function actualizarItemCompraDirecta(index, campo, valor) {
    if (itemsCompraDirecta[index]) itemsCompraDirecta[index][campo] = valor;
}

function eliminarItemCompraDirecta(index) {
    itemsCompraDirecta.splice(index, 1);
    renderItemsCompraDirecta();
}

function limpiarItemsCompraDirecta() {
    itemsCompraDirecta = [];
    renderItemsCompraDirecta();
}

// =====================================================
// SUBIR FOTO DE ITEM (COMPRA DIRECTA) - CON PREVIEW
// =====================================================

async function subirFotoItemCompra(index, input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Solo se permiten imágenes', 'error');
        input.value = '';
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen no debe superar los 5MB', 'error');
        input.value = '';
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('foto', file);
        
        // 🔥 OBTENER CÓDIGO DE ORDEN DEL SELECT
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        const selectedOption = selectOrden?.options[selectOrden.selectedIndex];
        
        if (selectedOption && selectedOption.value) {
            const ordenId = selectedOption.value;
            const orden = await fetch(`${API_URL}/orden/${ordenId}/codigo`, {
                headers: getAuthHeaders()
            });
            const ordenData = await orden.json();
            
            if (ordenData.success && ordenData.codigo_unico) {
                formData.append('codigo_orden', ordenData.codigo_unico);
                formData.append('id_orden', ordenId);
                console.log(`📤 Enviando foto para orden: ${ordenData.codigo_unico}`);
            }
        } else {
            console.warn('⚠️ No se encontró orden seleccionada');
        }
        
        const response = await fetch(`${API_URL}/subir-foto-item`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeaders()['Authorization']
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success && data.url) {
            if (itemsCompraDirecta[index]) {
                itemsCompraDirecta[index].foto_url = data.url;
                itemsCompraDirecta[index].foto_public_id = data.public_id;
            }
            
            // ✅ CARGAR PREVIEW CON PROXY
            await cargarPreviewFotoCompra(index, data.url);
            
            showToast('✅ Foto subida correctamente', 'success');
        } else {
            showToast(data.error || 'Error al subir foto', 'error');
        }
    } catch (error) {
        console.error('Error subiendo foto:', error);
        showToast('Error de conexión al subir foto', 'error');
    } finally {
        mostrarLoading(false);
        input.value = '';
    }
}

// =====================================================
// ELIMINAR FOTO DE ITEM (COMPRA DIRECTA)
// =====================================================

async function eliminarFotoItemCompra(index) {
    if (!itemsCompraDirecta[index] || !itemsCompraDirecta[index].foto_public_id) {
        showToast('No hay foto para eliminar', 'warning');
        return;
    }
    
    if (!confirm('¿Eliminar esta foto?')) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/eliminar-foto-item`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                public_id: itemsCompraDirecta[index].foto_public_id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            delete itemsCompraDirecta[index].foto_url;
            delete itemsCompraDirecta[index].foto_public_id;
            
            // ✅ LIMPIAR PREVIEW
            const previewSpan = document.getElementById(`fotoPreviewCompra_${index}`);
            if (previewSpan) {
                previewSpan.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;border:1px dashed var(--gris-texto);">
                        <i class="fas fa-plus" style="color:var(--gris-texto);font-size:12px;"></i>
                    </div>
                `;
            }
            
            showToast('✅ Foto eliminada', 'success');
        } else {
            showToast(data.error || 'Error al eliminar foto', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// CARGA DE DATOS PRINCIPALES
// =====================================================

async function cargarOrdenesDiagnosticoAprobado() {
    try {
        const response = await fetch(`${API_URL}/ordenes-diagnostico-aprobado`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            ordenesDiagnosticoAprobado = data.ordenes || [];
            console.log(`📊 Órdenes con diagnóstico aprobado: ${ordenesDiagnosticoAprobado.length}`);
            renderOrdenesSolicitarCotizacion();
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        ordenesDiagnosticoAprobado = [];
    }
}

async function cargarOrdenesParaCotizar() {
    try {
        const response = await fetch(`${API_URL}/ordenes-con-servicios`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            ordenesParaCotizar = data.ordenes || [];
            console.log(`📊 Órdenes para cotización al cliente: ${ordenesParaCotizar.length}`);
            renderOrdenesCotizacionCliente();
        }
    } catch (error) {
        console.error('Error cargando órdenes para cotizar:', error);
        ordenesParaCotizar = [];
    }
}

async function cargarSolicitudesCotizacion() {
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            solicitudesCotizacion = data.solicitudes || [];
            renderSolicitudesCotizacion();
        }
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        solicitudesCotizacion = [];
    }
}

async function cargarCotizacionesMap() {
    try {
        const response = await fetch(`${API_URL}/cotizaciones-enviadas`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            cotizacionesMap = {};
            data.cotizaciones.forEach(cot => {
                cotizacionesMap[cot.id_orden_trabajo] = cot;
            });
            console.log('Cotizaciones cargadas:', Object.keys(cotizacionesMap).length);
        }
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
        cotizacionesMap = {};
    }
}

async function cargarSolicitudesCompra() {
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            solicitudesCompra = data.solicitudes || [];
            renderSolicitudesCompra();
            console.log(`📊 Solicitudes de compra cargadas: ${solicitudesCompra.length}`);
        }
    } catch (error) {
        console.error('Error cargando solicitudes de compra:', error);
        solicitudesCompra = [];
    }
}

async function cargarEncargadosRepuestos() {
    try {
        const response = await fetch(`${API_URL}/encargados-repuestos`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            encargadosRepuestos = data.encargados || [];
            const selectEncargado = document.getElementById('solicitud_id_encargado');
            if (selectEncargado) {
                selectEncargado.innerHTML = '<option value="">Seleccionar encargado</option>' +
                    encargadosRepuestos.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
            }
            cargarSelectEncargadosCompra();
        }
    } catch (error) {
        console.error('Error cargando encargados:', error);
        encargadosRepuestos = [];
    }
}

function cargarSelectEncargadosCompra() {
    const selectEncargado = document.getElementById('compraDirecta_id_encargado');
    if (selectEncargado && encargadosRepuestos.length > 0) {
        selectEncargado.innerHTML = '<option value="">Seleccionar encargado</option>' +
            encargadosRepuestos.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
    }
}

async function cargarOrdenesAprobadas() {
    try {
        const response = await fetch(`${API_URL}/ordenes-aprobadas`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            window.ordenesAprobadas = data.ordenes || [];
            console.log(`✅ Órdenes aprobadas cargadas: ${window.ordenesAprobadas.length}`);
        }
    } catch (error) {
        console.error('Error cargando órdenes aprobadas:', error);
        window.ordenesAprobadas = [];
    }
}

async function cargarHistorialCotizaciones() {
    try {
        const response = await fetch(`${API_URL}/historial-cotizaciones`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            historialCotizaciones = data.cotizaciones || [];
            renderHistorialCotizaciones();
        }
    } catch (error) {
        console.error('Error cargando historial:', error);
        historialCotizaciones = [];
    }
}

async function cargarOrdenesActivasParaCompraDirecta() {
    try {
        mostrarLoading(true);
        console.log('🔄 Cargando órdenes activas...');
        
        const response = await fetch(`${API_URL}/ordenes-activas`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        console.log('📦 Datos recibidos del backend:', JSON.stringify(data, null, 2));
        
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        if (!selectOrden) {
            console.error('❌ Select no encontrado');
            return;
        }
        
        if (data.success && data.ordenes && data.ordenes.length > 0) {
            console.log(`✅ ${data.ordenes.length} órdenes encontradas`);
            
            selectOrden.innerHTML = '<option value="">Seleccionar orden</option>';
            
            data.ordenes.forEach(orden => {
                const option = document.createElement('option');
                const ordenId = orden.id_orden || orden.id;
                option.value = ordenId;
                option.textContent = `${orden.codigo_unico} - ${orden.vehiculo || 'Vehículo'}`;
                selectOrden.appendChild(option);
                console.log(`  - Agregada: value=${option.value}, text=${option.textContent}`);
            });
            
            if (selectOrden.options.length > 1) {
                selectOrden.selectedIndex = 1;
                console.log('✅ Seleccionada primera orden:', selectOrden.value);
            }
            
        } else {
            console.warn('⚠️ No hay órdenes activas');
            selectOrden.innerHTML = '<option value="">No hay órdenes activas disponibles</option>';
        }
    } catch (error) {
        console.error('❌ Error cargando órdenes:', error);
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        if (selectOrden) {
            selectOrden.innerHTML = '<option value="">Error al cargar órdenes</option>';
        }
        showToast('Error al cargar las órdenes activas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// SOLICITUDES DE REPUESTOS DE TÉCNICOS (TAB 3)
// =====================================================

async function cargarSolicitudesRepuestosTecnico() {
    try {
        const estado = document.getElementById('filtroEstadoRepuestoTecnico')?.value || 'all';
        const search = document.getElementById('searchRepuestoTecnico')?.value || '';
        
        let url = `${API_URL}/solicitudes-repuestos-tecnico?estado=${estado}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success) {
            solicitudesRepuestosTecnico = data.solicitudes || [];
            renderSolicitudesRepuestosTecnico();
            console.log(`📊 Solicitudes de técnicos: ${solicitudesRepuestosTecnico.length}`);
        }
    } catch (error) {
        console.error('Error cargando solicitudes de técnicos:', error);
        solicitudesRepuestosTecnico = [];
        const tbody = document.getElementById('tablaSolicitudesRepuestosTecnico');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error al cargar solicitudes</p></div></td></tr>`;
        }
    }
}

function renderSolicitudesRepuestosTecnico() {
    const tbody = document.getElementById('tablaSolicitudesRepuestosTecnico');
    if (!tbody) return;
    
    if (solicitudesRepuestosTecnico.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-inbox"></i><p>No hay solicitudes de repuestos de técnicos</p></div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = solicitudesRepuestosTecnico.map(s => {
        let itemsHtml = '';
        if (s.items && s.items.length > 0) {
            itemsHtml = s.items.map(item => {
                const fotoHtml = item.foto_url ? `<img src="${item.foto_url}" style="width:30px;height:30px;object-fit:cover;border-radius:4px;margin-left:4px;">` : '';
                return `<div style="font-size: 0.7rem; padding: 0.2rem 0; display:flex; align-items:center; gap:4px;">• ${escapeHtml(item.descripcion)} x${item.cantidad} ${fotoHtml}</div>`;
            }).join('');
        } else {
            itemsHtml = '<span class="text-muted">No especificado</span>';
        }
        
        let estadoClass = '';
        let estadoIcon = '';
        let estadoTexto = '';
        
        switch (s.estado) {
            case 'pendiente':
                estadoClass = 'status-pendiente';
                estadoIcon = 'fa-clock';
                estadoTexto = 'Pendiente';
                break;
            case 'en_proceso':
                estadoClass = 'status-cotizado';
                estadoIcon = 'fa-spinner fa-pulse';
                estadoTexto = 'En Proceso';
                break;
            case 'completado':
                estadoClass = 'status-aprobado';
                estadoIcon = 'fa-check-circle';
                estadoTexto = 'Completado';
                break;
            case 'rechazado':
                estadoClass = 'status-rechazado';
                estadoIcon = 'fa-times-circle';
                estadoTexto = 'Rechazado';
                break;
            default:
                estadoClass = 'status-pendiente';
                estadoIcon = 'fa-clock';
                estadoTexto = s.estado || 'Desconocido';
        }
        
        let accionesHtml = '';
        if (s.estado === 'pendiente' || s.estado === 'en_proceso') {
            accionesHtml = `
                <button class="action-btn edit" onclick="abrirModalCompraDesdeSolicitudTecnico(${s.id})" title="Gestionar Compra">
                    <i class="fas fa-shopping-cart"></i>
                </button>
            `;
        } else {
            accionesHtml = `<span class="text-muted">Finalizado</span>`;
        }
        
        return `
            <tr>
                <td data-label="ID">${s.id}</td>
                <td data-label="Orden"><strong>${escapeHtml(s.orden_codigo)}</strong><br><small class="text-muted">${escapeHtml(s.orden_estado)}</small></td>
                <td data-label="Vehículo">${escapeHtml(s.vehiculo)}</td>
                <td data-label="Técnico"><strong>${escapeHtml(s.tecnico_nombre)}</strong>${s.tecnico_contacto ? `<br><small class="text-muted">📞 ${escapeHtml(s.tecnico_contacto)}</small>` : ''}</td>
                <td data-label="Repuestos" style="max-width: 250px;">${itemsHtml}${s.observaciones ? `<div class="text-muted" style="font-size: 0.65rem; margin-top: 0.25rem;"><i class="fas fa-comment"></i> ${escapeHtml(s.observaciones.substring(0, 50))}${s.observaciones.length > 50 ? '...' : ''}</div>` : ''}</td>
                <td data-label="Estado"><span class="status-badge ${estadoClass}"><i class="fas ${estadoIcon}"></i> ${estadoTexto}</span></td>
                <td data-label="Fecha">${formatDate(s.fecha_solicitud)}</td>
                <td data-label="Acciones" class="action-buttons">${accionesHtml}</td>
            </tr>
        `;
    }).join('');
}

// =====================================================
// MODAL DE COMPRA DIRECTA UNIFICADO
// =====================================================

async function abrirModalNuevaSolicitudCompraDirecta() {
    console.log('🔄 Abriendo modal de nueva solicitud de compra directa...');
    
    limpiarItemsCompraDirecta();
    currentSolicitudTecnico = null;
    
    const observacionesTextarea = document.getElementById('compraDirecta_observaciones');
    if (observacionesTextarea) observacionesTextarea.value = '';
    
    const infoAdicional = document.getElementById('compraDirectaInfoAdicional');
    if (infoAdicional) infoAdicional.style.display = 'none';
    
    const title = document.getElementById('modalCompraDirectaTitle');
    if (title) title.innerHTML = '<i class="fas fa-shopping-cart"></i> Nueva Solicitud de Compra';
    
    mostrarLoading(true);
    try {
        await cargarOrdenesActivasParaCompraDirecta();
        await cargarEncargadosRepuestos();
        
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        if (selectOrden && selectOrden.options.length > 1) {
            if (selectOrden.selectedIndex === 0 || !selectOrden.value || selectOrden.value === '') {
                selectOrden.selectedIndex = 1;
                console.log('✅ Select orden auto-seleccionado a:', selectOrden.value);
            }
        }
        
        const selectEncargado = document.getElementById('compraDirecta_id_encargado');
        if (selectEncargado && selectEncargado.options.length > 1 && (!selectEncargado.value || selectEncargado.value === '')) {
            selectEncargado.selectedIndex = 1;
        }
        
        abrirModal('modalNuevaSolicitudCompraDirecta');
        
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error al preparar el formulario', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function abrirModalCompraDesdeSolicitudTecnico(id_solicitud) {
    console.log(`🔄 Abriendo modal desde solicitud de técnico #${id_solicitud}`);
    
    const solicitud = solicitudesRepuestosTecnico.find(s => s.id === id_solicitud);
    if (!solicitud) {
        showToast('No se encontró la solicitud del técnico', 'error');
        return;
    }
    
    currentSolicitudTecnico = solicitud;
    
    limpiarItemsCompraDirecta();
    
    if (solicitud.items && solicitud.items.length > 0) {
        itemsCompraDirecta = solicitud.items.map(item => ({
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            detalle: item.detalle || '',
            foto_url: item.foto_url || null,
            foto_public_id: item.foto_public_id || null
        }));
        renderItemsCompraDirecta();
        console.log(`📦 Items pre-cargados: ${itemsCompraDirecta.length}`);
    }
    
    const infoAdicional = document.getElementById('compraDirectaInfoAdicional');
    if (infoAdicional) {
        let itemsHtml = '';
        if (solicitud.items && solicitud.items.length > 0) {
            itemsHtml = '<ul style="margin: 0.5rem 0 0 1rem;">' + 
                solicitud.items.map(item => {
                    const fotoHtml = item.foto_url ? `<img src="${item.foto_url}" style="width:30px;height:30px;object-fit:cover;border-radius:4px;margin-left:4px;">` : '';
                    return `<li><strong>${escapeHtml(item.descripcion)}</strong> x${item.cantidad}${item.detalle ? ` (${escapeHtml(item.detalle)})` : ''} ${fotoHtml}</li>`;
                }).join('') + 
                '</ul>';
        }
        
        infoAdicional.innerHTML = `
            <p><strong><i class="fas fa-tools"></i> Solicitud del Técnico #${solicitud.id}</strong></p>
            <p><strong>Orden:</strong> ${escapeHtml(solicitud.orden_codigo)}</p>
            <p><strong>Vehículo:</strong> ${escapeHtml(solicitud.vehiculo)}</p>
            <p><strong>Técnico:</strong> ${escapeHtml(solicitud.tecnico_nombre)}</p>
            <p><strong>Repuestos solicitados:</strong>${itemsHtml}</p>
            ${solicitud.observaciones ? `<p><strong>Observaciones del técnico:</strong> ${escapeHtml(solicitud.observaciones)}</p>` : ''}
        `;
        infoAdicional.style.display = 'block';
    }
    
    const title = document.getElementById('modalCompraDirectaTitle');
    if (title) title.innerHTML = '<i class="fas fa-shopping-cart"></i> Solicitar Compra - Items del Técnico';
    
    mostrarLoading(true);
    try {
        await cargarOrdenesActivasParaCompraDirecta();
        
        const selectOrden = document.getElementById('compraDirecta_id_orden');
        if (selectOrden && solicitud.id_orden_trabajo) {
            const optionExists = Array.from(selectOrden.options).some(opt => opt.value == solicitud.id_orden_trabajo);
            if (!optionExists) {
                const option = document.createElement('option');
                option.value = solicitud.id_orden_trabajo;
                option.textContent = `${escapeHtml(solicitud.orden_codigo)} - ${escapeHtml(solicitud.vehiculo)}`;
                selectOrden.appendChild(option);
            }
            selectOrden.value = solicitud.id_orden_trabajo;
            console.log(`✅ Orden preseleccionada: ${solicitud.id_orden_trabajo}`);
        }
        
        await cargarEncargadosRepuestos();
        
        const observacionesTextarea = document.getElementById('compraDirecta_observaciones');
        if (observacionesTextarea && solicitud.observaciones) {
            observacionesTextarea.value = `Solicitud del técnico: ${solicitud.observaciones.substring(0, 200)}`;
        }
        
        abrirModal('modalNuevaSolicitudCompraDirecta');
        
    } catch (error) {
        console.error('❌ Error preparando modal:', error);
        showToast('Error al preparar el formulario', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function confirmarCompraDirecta() {
    const selectOrden = document.getElementById('compraDirecta_id_orden');
    const selectEncargado = document.getElementById('compraDirecta_id_encargado');
    const observaciones = document.getElementById('compraDirecta_observaciones')?.value || '';
    
    let id_orden = null;
    if (selectOrden) {
        id_orden = selectOrden.value;
        if (!id_orden || id_orden === '' || id_orden === 'undefined') {
            const selectedOption = selectOrden.options[selectOrden.selectedIndex];
            if (selectedOption && selectedOption.value && selectedOption.value !== '') {
                id_orden = selectedOption.value;
            }
        }
    }
    
    const id_encargado = selectEncargado?.value;
    
    if (!id_orden || id_orden === '' || id_orden === 'undefined' || id_orden === 'null' || id_orden === 'NaN') {
        showToast('⚠️ Por favor, seleccione una orden de trabajo válida', 'warning');
        if (selectOrden) {
            selectOrden.style.borderColor = 'var(--rojo-primario)';
            selectOrden.focus();
            setTimeout(() => {
                selectOrden.style.borderColor = '';
            }, 2000);
        }
        return;
    }
    
    if (!id_encargado || id_encargado === '' || id_encargado === 'undefined') {
        showToast('⚠️ Por favor, seleccione un encargado de repuestos', 'warning');
        if (selectEncargado) {
            selectEncargado.style.borderColor = 'var(--rojo-primario)';
            selectEncargado.focus();
            setTimeout(() => {
                selectEncargado.style.borderColor = '';
            }, 2000);
        }
        return;
    }
    
    const itemsValidos = itemsCompraDirecta.filter(item => item.descripcion && item.descripcion.trim() !== '');
    if (itemsValidos.length === 0) {
        showToast('⚠️ Agregue al menos un repuesto a comprar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const id_orden_numero = parseInt(id_orden);
        
        if (isNaN(id_orden_numero)) {
            showToast('Error: ID de orden inválido', 'error');
            return;
        }
        
        const requestBody = {
            id_orden_trabajo: id_orden_numero,
            id_encargado_repuestos: parseInt(id_encargado),
            items: itemsValidos,
            observaciones: observaciones
        };
        
        console.log('📤 Enviando solicitud:', requestBody);
        
        const response = await fetch(`${API_URL}/solicitudes-compra-directa`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (currentSolicitudTecnico) {
                await actualizarEstadoSolicitudTecnico(currentSolicitudTecnico.id, 'en_proceso', 
                    `Solicitud de compra enviada. Items: ${itemsValidos.length}`);
            }
            
            showToast('✅ Solicitud de compra enviada al encargado de repuestos', 'success');
            cerrarModal('modalNuevaSolicitudCompraDirecta');
            limpiarItemsCompraDirecta();
            currentSolicitudTecnico = null;
            
            await cargarSolicitudesCompra();
            await cargarSolicitudesRepuestosTecnico();
        } else {
            showToast(data.error || 'Error al crear solicitud', 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function actualizarEstadoSolicitudTecnico(id_solicitud, nuevoEstado, respuesta) {
    try {
        const response = await fetch(`${API_URL}/solicitudes-repuestos-tecnico/${id_solicitud}/estado`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                estado: nuevoEstado, 
                respuesta: respuesta,
                respondido_por: currentUser?.id
            })
        });
        const data = await response.json();
        console.log(`✅ Solicitud de técnico #${id_solicitud} actualizada a ${nuevoEstado}`);
        return data;
    } catch (error) {
        console.error('Error actualizando solicitud de técnico:', error);
        return { success: false };
    }
}

// =====================================================
// RENDERIZADO PRIMER APARTADO (TAB 1) - CON BOTÓN VER FOTOS
// =====================================================

function renderOrdenesSolicitarCotizacion() {
    const container = document.getElementById('ordenesSolicitarContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('searchOrdenSolicitar')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstadoCotizacionSolicitar')?.value || 'all';
    
    let ordenesFiltradas = ordenesDiagnosticoAprobado.filter(orden => {
        return orden.servicios.some(serv => 
            serv.estado_cotizacion === 'pendiente' || 
            serv.estado_cotizacion === 'solicitado'
        );
    });
    
    if (searchTerm) {
        ordenesFiltradas = ordenesFiltradas.filter(o => 
            (o.codigo_unico || '').toLowerCase().includes(searchTerm) ||
            (o.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
            (o.vehiculo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtroEstado === 'pendiente') {
        ordenesFiltradas = ordenesFiltradas.filter(o => 
            o.servicios.some(s => s.estado_cotizacion === 'pendiente')
        );
    } else if (filtroEstado === 'solicitado') {
        ordenesFiltradas = ordenesFiltradas.filter(o => 
            o.servicios.some(s => s.estado_cotizacion === 'solicitado')
        );
    }
    
    if (ordenesFiltradas.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No hay órdenes con diagnóstico aprobado pendientes de cotización</p><small>Las órdenes aparecerán aquí cuando el diagnóstico sea aprobado por el jefe de taller</small></div>`;
        return;
    }
    
    container.innerHTML = ordenesFiltradas.map(orden => {
        // Contar TOTAL DE FOTOS EN LA ORDEN
        let totalFotos = 0;
        if (orden.servicios) {
            orden.servicios.forEach(serv => {
                if (serv.items && serv.items.length > 0) {
                    serv.items.forEach(item => {
                        if (item.foto_url) totalFotos += 1;
                        if (item.fotos && Array.isArray(item.fotos)) {
                            totalFotos += item.fotos.length;
                        }
                    });
                }
            });
        }
        
        const serviciosPendientes = orden.servicios.filter(s => s.estado_cotizacion === 'pendiente').length;
        const serviciosSolicitados = orden.servicios.filter(s => s.estado_cotizacion === 'solicitado').length;
        
        let estadoBadge = '';
        let botonesHtml = '';
        
        if (serviciosSolicitados > 0) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> ${serviciosSolicitados} solicitud(es) enviada(s)</span>`;
            botonesHtml = `
                <button class="btn-outline" disabled style="opacity:0.7; width:auto;"><i class="fas fa-clock"></i> Esperando respuesta</button>
                ${totalFotos > 0 ? `
                    <button class="btn-ver-fotos-orden" onclick="abrirModalFotosOrden(${orden.id_orden})" 
                            style="padding:0.3rem 0.8rem;font-size:0.75rem;background:var(--rojo-primario);color:white;border:none;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:0.4rem;white-space:nowrap;">
                        <i class="fas fa-images"></i> Ver ${totalFotos} foto(s)
                    </button>
                ` : ''}
            `;
        } else if (serviciosPendientes > 0) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> ${serviciosPendientes} servicio(s) pendiente(s)`;
            botonesHtml = `
                <button class="btn-primary" onclick="abrirModalSolicitudCotizacion(${orden.id_orden})" style="display:inline-flex;align-items:center;gap:0.4rem;white-space:nowrap;">
                    <i class="fas fa-paper-plane"></i> Solicitar Cotización
                </button>
                ${totalFotos > 0 ? `
                    <button class="btn-ver-fotos-orden" onclick="abrirModalFotosOrden(${orden.id_orden})" 
                            style="padding:0.3rem 0.8rem;font-size:0.75rem;background:var(--rojo-primario);color:white;border:none;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:0.4rem;white-space:nowrap;">
                        <i class="fas fa-images"></i> Ver ${totalFotos} foto(s)
                    </button>
                ` : ''}
            `;
        }
        
        // ✅ HTML RESPONSIVE CON CLASES CORRECTAS
        return `
        <div class="orden-card">
            <div class="orden-header">
                <div class="orden-header-info">
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                    ${totalFotos > 0 ? `
                        <span class="badge-fotos" style="background:var(--rojo-primario);color:white;padding:0.1rem 0.5rem;border-radius:12px;font-size:0.6rem;margin-left:0.5rem;display:inline-block;">
                            <i class="fas fa-camera"></i> ${totalFotos}
                        </span>
                    ` : ''}
                </div>
                <div class="orden-header-cliente">
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                </div>
            </div>
            <div class="orden-body">
                <div class="orden-estados">
                    ${estadoBadge}
                </div>
                <div class="servicios-container">
                    ${orden.servicios.map(serv => {
                        let fotosServicio = 0;
                        if (serv.items) {
                            serv.items.forEach(item => {
                                if (item.foto_url) fotosServicio++;
                                if (item.fotos && Array.isArray(item.fotos)) fotosServicio += item.fotos.length;
                            });
                        }
                        return `
                        <div class="servicio-row">
                            <div class="servicio-info">
                                <div class="servicio-nombre">${escapeHtml(serv.descripcion)}</div>
                                ${fotosServicio > 0 ? `<span class="servicio-fotos-badge"><i class="fas fa-camera"></i> ${fotosServicio}</span>` : ''}
                            </div>
                            <div class="servicio-estado estado-${serv.estado_cotizacion}">
                                <i class="fas ${serv.estado_cotizacion === 'cotizado' ? 'fa-check-circle' : (serv.estado_cotizacion === 'solicitado' ? 'fa-paper-plane' : 'fa-clock')}"></i>
                                ${serv.estado_cotizacion === 'cotizado' ? 'Cotizado' : (serv.estado_cotizacion === 'solicitado' ? 'Solicitud enviada' : 'Pendiente')}
                            </div>
                            ${serv.precio_cotizado > 0 ? `<div class="servicio-precio">${formatCurrency(serv.precio_cotizado)}</div>` : ''}
                        </div>
                    `}).join('')}
                </div>
            </div>
            <div class="orden-footer">
                ${botonesHtml}
            </div>
        </div>`;
    }).join('');
}
// =====================================================
// ABRIR MODAL DE FOTOS DE LA ORDEN (DESDE TAB 1)
// =====================================================

async function abrirModalFotosOrden(id_orden) {
    // Buscar la orden en los datos
    const orden = ordenesDiagnosticoAprobado.find(o => o.id_orden === id_orden);
    if (!orden) {
        showToast('Orden no encontrada', 'error');
        return;
    }
    
    // Recolectar todas las fotos de todos los servicios
    let todasLasFotos = [];
    
    if (orden.servicios) {
        orden.servicios.forEach(serv => {
            if (serv.items && serv.items.length > 0) {
                serv.items.forEach(item => {
                    // Soporte para versión anterior (foto_url)
                    if (item.foto_url) {
                        todasLasFotos.push({
                            url: item.foto_url,
                            descripcion: item.descripcion || 'Item',
                            cantidad: item.cantidad || 1,
                            servicio: serv.descripcion
                        });
                    }
                    // Soporte para nueva versión (fotos array)
                    if (item.fotos && Array.isArray(item.fotos)) {
                        item.fotos.forEach(fotoUrl => {
                            todasLasFotos.push({
                                url: fotoUrl,
                                descripcion: item.descripcion || 'Item',
                                cantidad: item.cantidad || 1,
                                servicio: serv.descripcion
                            });
                        });
                    }
                });
            }
        });
    }
    
    if (todasLasFotos.length === 0) {
        showToast('Esta orden no tiene fotos disponibles', 'warning');
        return;
    }
    
    // Crear el modal si no existe
    let modal = document.getElementById('modalFotosOrden');
    if (!modal) {
        const modalHtml = `
            <div class="modal" id="modalFotosOrden" onclick="cerrarModalFotosOrden()">
                <div class="modal-content" style="max-width: 850px; max-height: 90vh; background: var(--bg-card);" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3><i class="fas fa-images"></i> Fotos de la Orden</h3>
                        <button class="modal-close" onclick="cerrarModalFotosOrden()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 1.5rem; max-height: 60vh; overflow-y: auto;">
                        <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--gris-oscuro); border-radius: 8px; display:grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap:0.5rem;">
                            <div><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(orden.codigo_unico)}</div>
                            <div><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(orden.vehiculo)}</div>
                            <div><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}</div>
                            <div><strong><i class="fas fa-camera"></i> Total:</strong> ${todasLasFotos.length} foto(s)</div>
                        </div>
                        <div id="fotosOrdenContainer" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px;">
                            <!-- Las fotos se cargarán aquí -->
                        </div>
                        <div id="fotosOrdenLoader" style="display:flex;justify-content:center;align-items:center;padding:2rem;">
                            <i class="fas fa-spinner fa-spin fa-2x"></i>
                            <span style="margin-left:1rem;">Cargando fotos...</span>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;flex-wrap:wrap;gap:0.5rem;">
                            <span id="fotosOrdenCounter" style="font-size:0.85rem;color:var(--gris-texto);"></span>
                            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                                <button class="btn-secondary" onclick="cerrarModalFotosOrden()">
                                    <i class="fas fa-times"></i> Cerrar
                                </button>
                                <button class="btn-primary" onclick="descargarTodasFotosOrden(${id_orden})">
                                    <i class="fas fa-download"></i> Descargar Todas
                                </button>
                                <button class="btn-outline" onclick="copiarUrlsFotosOrden(${id_orden})">
                                    <i class="fas fa-copy"></i> Copiar URLs
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    // Mostrar loader
    const container = document.getElementById('fotosOrdenContainer');
    const loader = document.getElementById('fotosOrdenLoader');
    const counter = document.getElementById('fotosOrdenCounter');
    
    if (container) container.innerHTML = '';
    if (loader) loader.style.display = 'flex';
    if (counter) counter.textContent = `Cargando ${todasLasFotos.length} foto(s)...`;
    
    // Abrir modal
    modal = document.getElementById('modalFotosOrden');
    if (modal) modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Cargar fotos con proxy
    let fotosCargadas = 0;
    
    for (let i = 0; i < todasLasFotos.length; i++) {
        const foto = todasLasFotos[i];
        const fotoId = `foto_orden_${id_orden}_${i}`;
        
        // Crear contenedor para la foto
        const fotoDiv = document.createElement('div');
        fotoDiv.className = 'foto-item-modal';
        fotoDiv.style.cssText = `
            background: var(--gris-oscuro);
            border-radius: 8px;
            overflow: hidden;
            position: relative;
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid var(--border-color);
            transition: transform 0.2s;
            cursor: pointer;
        `;
        fotoDiv.onclick = function() {
            verFotoAmpliadaJefeTaller(foto.url);
        };
        
        fotoDiv.innerHTML = `
            <div id="loader_foto_orden_${id_orden}_${i}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
                <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--gris-texto);"></i>
            </div>
            <img id="${fotoId}" src="" alt="Foto ${i+1}" style="width:100%;height:100%;object-fit:cover;display:none;">
            <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent, rgba(0,0,0,0.8));padding:8px;color:white;font-size:0.7rem;text-align:center;pointer-events:none;">
                <strong>${escapeHtml(foto.descripcion)}</strong><br>
                <small><i class="fas fa-tag"></i> ${escapeHtml(foto.servicio || 'Item')} ×${foto.cantidad || 1}</small>
            </div>
            <span style="position:absolute;top:5px;right:8px;background:rgba(0,0,0,0.7);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;z-index:5;pointer-events:none;">
                ${i+1}/${todasLasFotos.length}
            </span>
        `;
        
        if (container) container.appendChild(fotoDiv);
        
        // Cargar la imagen con proxy
        const imgElement = document.getElementById(fotoId);
        const loaderElement = document.getElementById(`loader_foto_orden_${id_orden}_${i}`);
        
        if (imgElement) {
            try {
                const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(foto.url)}`;
                const response = await fetch(proxyUrl, {
                    headers: getAuthHeaders()
                });
                const data = await response.json();
                
                if (data.success && data.base64) {
                    const img = new Image();
                    img.onload = function() {
                        if (imgElement) {
                            imgElement.src = data.base64;
                            imgElement.style.display = 'block';
                            imgElement.setAttribute('data-loaded', 'true');
                        }
                        if (loaderElement) loaderElement.style.display = 'none';
                        fotosCargadas++;
                        if (counter) counter.textContent = `${fotosCargadas}/${todasLasFotos.length} foto(s) cargadas`;
                    };
                    img.onerror = function() {
                        if (loaderElement) {
                            loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:1.5rem;"></i>';
                        }
                        fotosCargadas++;
                        if (counter) counter.textContent = `${fotosCargadas}/${todasLasFotos.length} foto(s) cargadas`;
                    };
                    img.src = data.base64;
                } else {
                    if (loaderElement) {
                        loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:1.5rem;"></i>';
                    }
                    fotosCargadas++;
                    if (counter) counter.textContent = `${fotosCargadas}/${todasLasFotos.length} foto(s) cargadas`;
                }
            } catch (error) {
                console.error('Error cargando foto:', error);
                if (loaderElement) {
                    loaderElement.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--rojo-primario);font-size:1.5rem;"></i>';
                }
                fotosCargadas++;
                if (counter) counter.textContent = `${fotosCargadas}/${todasLasFotos.length} foto(s) cargadas`;
            }
        }
    }
    
    // Ocultar loader principal cuando todas las fotos estén cargadas
    const checkFotosCargadas = setInterval(() => {
        if (fotosCargadas >= todasLasFotos.length) {
            if (loader) loader.style.display = 'none';
            clearInterval(checkFotosCargadas);
        }
    }, 500);
    
    // Timeout de seguridad
    setTimeout(() => {
        if (loader) loader.style.display = 'none';
        if (counter) {
            const cargadas = document.querySelectorAll('#fotosOrdenContainer img[data-loaded="true"]').length;
            counter.textContent = `${cargadas}/${todasLasFotos.length} foto(s) cargadas`;
        }
    }, 10000);
}

// =====================================================
// CERRAR MODAL DE FOTOS DE LA ORDEN
// =====================================================

function cerrarModalFotosOrden() {
    const modal = document.getElementById('modalFotosOrden');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = '';
}

// =====================================================
// DESCARGAR TODAS LAS FOTOS DE LA ORDEN
// =====================================================

async function descargarTodasFotosOrden(id_orden) {
    const orden = ordenesDiagnosticoAprobado.find(o => o.id_orden === id_orden);
    if (!orden) {
        showToast('Orden no encontrada', 'error');
        return;
    }
    
    // Recolectar todas las fotos
    let todasLasFotos = [];
    if (orden.servicios) {
        orden.servicios.forEach(serv => {
            if (serv.items && serv.items.length > 0) {
                serv.items.forEach(item => {
                    if (item.foto_url) {
                        todasLasFotos.push(item.foto_url);
                    }
                    if (item.fotos && Array.isArray(item.fotos)) {
                        item.fotos.forEach(fotoUrl => {
                            todasLasFotos.push(fotoUrl);
                        });
                    }
                });
            }
        });
    }
    
    if (todasLasFotos.length === 0) {
        showToast('No hay fotos para descargar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        let descargasExitosas = 0;
        
        for (let i = 0; i < todasLasFotos.length; i++) {
            const fotoUrl = todasLasFotos[i];
            
            const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(fotoUrl)}`;
            const response = await fetch(proxyUrl, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            
            if (data.success && data.base64) {
                const link = document.createElement('a');
                link.href = data.base64;
                link.download = `orden_${orden.codigo_unico}_foto_${i+1}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                descargasExitosas++;
                
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        showToast(`✅ ${descargasExitosas} foto(s) descargadas`, 'success');
    } catch (error) {
        console.error('Error descargando fotos:', error);
        showToast('Error al descargar las fotos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// COPIAR URLs DE LAS FOTOS DE LA ORDEN
// =====================================================

function copiarUrlsFotosOrden(id_orden) {
    const orden = ordenesDiagnosticoAprobado.find(o => o.id_orden === id_orden);
    if (!orden) {
        showToast('Orden no encontrada', 'error');
        return;
    }
    
    // Recolectar todas las URLs
    let urls = [];
    if (orden.servicios) {
        orden.servicios.forEach(serv => {
            if (serv.items && serv.items.length > 0) {
                serv.items.forEach(item => {
                    if (item.foto_url) {
                        urls.push(item.foto_url);
                    }
                    if (item.fotos && Array.isArray(item.fotos)) {
                        item.fotos.forEach(fotoUrl => {
                            urls.push(fotoUrl);
                        });
                    }
                });
            }
        });
    }
    
    if (urls.length === 0) {
        showToast('No hay URLs para copiar', 'warning');
        return;
    }
    
    const texto = `📸 Fotos de la orden ${orden.codigo_unico}\n\n${urls.map((url, i) => `${i+1}. ${url}`).join('\n')}`;
    
    navigator.clipboard.writeText(texto).then(() => {
        showToast(`✅ ${urls.length} URL(s) copiadas al portapapeles`, 'success');
    }).catch(() => {
        // Fallback
        const input = document.createElement('textarea');
        input.value = texto;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast(`✅ ${urls.length} URL(s) copiadas al portapapeles`, 'success');
    });
}
// =====================================================
// RENDERIZADO SEGUNDO APARTADO (TAB 2) - CON BOTÓN VER DECISIÓN EN TODOS LOS ESTADOS
// =====================================================

function renderOrdenesCotizacionCliente() {
    const container = document.getElementById('ordenesCotizacionContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('searchCotizacionCliente')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstadoCotizacionCliente')?.value || 'all';
    
    let filtered = [...ordenesParaCotizar];
    
    if (searchTerm) {
        filtered = filtered.filter(o => 
            (o.codigo_unico || '').toLowerCase().includes(searchTerm) ||
            (o.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
            (o.vehiculo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtroEstado !== 'all') {
        if (filtroEstado === 'pendiente') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.DIAGNOSTICO_APROBADO);
        } else if (filtroEstado === 'enviada') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.COTIZACION_ENVIADA);
        } else if (filtroEstado === 'aprobada') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.COTIZACION_ACEPTADA || o.estado_global === ESTADOS_ORDEN.COTIZACION_PARCIAL);
        } else if (filtroEstado === 'rechazada') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.COTIZACION_RECHAZADA);
        } else if (filtroEstado === 'reparacion') {
            filtered = filtered.filter(o => o.estado_global === ESTADOS_ORDEN.EN_REPARACION);
        }
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No hay órdenes disponibles</p></div>`;
        return;
    }
    
    container.innerHTML = filtered.map(orden => {
        const estadoOrden = orden.estado_global;
        let estadoBadge = '';
        let botonesHtml = '';
        
        // =====================================================
        // 1. DIAGNOSTICO APROBADO - PENDIENTE DE COTIZACIÓN
        // =====================================================
        if (estadoOrden === ESTADOS_ORDEN.DIAGNOSTICO_APROBADO) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> Pendiente de Cotización</span>`;
            botonesHtml = `
                <button class="btn-primary" onclick="abrirModalGenerarCotizacion(${orden.id_orden})">
                    <i class="fas fa-file-invoice"></i> Generar Cotización
                </button>
            `;
        
        // =====================================================
        // 2. COTIZACION ENVIADA - ESPERANDO RESPUESTA DEL CLIENTE
        // =====================================================
        } else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_ENVIADA) {
            estadoBadge = `<span class="status-badge status-enviado"><i class="fas fa-paper-plane"></i> Cotización Enviada</span>`;
            botonesHtml = `
                <button class="btn-outline" onclick="editarCotizacionExistente(${orden.id_orden})">
                    <i class="fas fa-edit"></i> Editar Cotización
                </button>
                <button class="btn-primary" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        
        // =====================================================
        // 3. COTIZACION ACEPTADA - CLIENTE APROBÓ
        // =====================================================
        } else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_ACEPTADA || estadoOrden === ESTADOS_ORDEN.COTIZACION_PARCIAL) {
            estadoBadge = `<span class="status-badge status-aprobado"><i class="fas fa-check-circle"></i> Cotización Aceptada</span>`;
            botonesHtml = `
                <button class="btn-primary" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
                <button class="btn-success" onclick='abrirModalIniciarReparacion(${orden.id_orden}, "${escapeHtml(orden.codigo_unico)}", "${escapeHtml(orden.vehiculo)}", "${escapeHtml(orden.cliente_nombre)}")'>
                    <i class="fas fa-play-circle"></i> Iniciar Reparación
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Cotización
                </button>
            `;
        
        // =====================================================
        // 4. COTIZACION RECHAZADA - CLIENTE RECHAZÓ
        // =====================================================
        } else if (estadoOrden === ESTADOS_ORDEN.COTIZACION_RECHAZADA) {
            estadoBadge = `<span class="status-badge status-rechazado"><i class="fas fa-times-circle"></i> Cotización Rechazada</span>`;
            botonesHtml = `
                <button class="btn-danger" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
                <button class="btn-warning" onclick='abrirModalNotificarArmado(${orden.id_orden}, "${escapeHtml(orden.codigo_unico)}", "${escapeHtml(orden.vehiculo)}", "${escapeHtml(orden.cliente_nombre)}")'>
                    <i class="fas fa-tools"></i> Notificar Armado
                </button>
                <button class="btn-primary" onclick="reutilizarCotizacionRechazada(${orden.id_orden})">
                    <i class="fas fa-copy"></i> Nueva Cotización
                </button>
            `;
        
        // =====================================================
        // 5. EN ARMADO - VEHÍCULO SIENDO ARMADO
        // =====================================================
        } else if (estadoOrden === ESTADOS_ORDEN.EN_ARMADO) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-tools"></i> Armando Vehículo</span>`;
            botonesHtml = `
                <button class="btn-outline" onclick="verInstruccionesArmado(${orden.id_orden})">
                    <i class="fas fa-clipboard-list"></i> Ver Instrucciones
                </button>
                <button class="btn-primary" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
            `;
        
        // =====================================================
        // 6. EN REPARACION - VEHÍCULO EN TALLER (CON BOTÓN VER DECISIÓN)
        // =====================================================
        } else if (estadoOrden === ESTADOS_ORDEN.EN_REPARACION) {
            estadoBadge = `<span class="status-badge status-proceso"><i class="fas fa-wrench"></i> En Reparación</span>`;
            botonesHtml = `
                <button class="btn-primary" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
                <button class="btn-outline" onclick="verAvanceReparacion(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        
        // =====================================================
        // 7. EN PAUSA - REPARACIÓN EN PAUSA
        // =====================================================
        } else if (estadoOrden === ESTADOS_ORDEN.EN_PAUSA) {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-pause"></i> En Pausa</span>`;
            botonesHtml = `
                <button class="btn-primary" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
                <button class="btn-outline" onclick="verAvanceReparacion(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        
        // =====================================================
        // 8. REPARACION COMPLETADA
        // =====================================================
        } else if (estadoOrden === ESTADOS_ORDEN.REPARACION_COMPLETADA) {
            estadoBadge = `<span class="status-badge status-aprobado"><i class="fas fa-check-circle"></i> Reparación Completada</span>`;
            botonesHtml = `
                <button class="btn-primary" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        
        // =====================================================
        // 9. FINALIZADO / ENTREGADO
        // =====================================================
        } else if (estadoOrden === ESTADOS_ORDEN.FINALIZADO || estadoOrden === ESTADOS_ORDEN.ENTREGADO) {
            estadoBadge = `<span class="status-badge status-aprobado"><i class="fas fa-check-circle"></i> ${estadoOrden === ESTADOS_ORDEN.FINALIZADO ? 'Finalizado' : 'Entregado'}</span>`;
            botonesHtml = `
                <button class="btn-primary" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        
        // =====================================================
        // 10. OTROS ESTADOS - FALLBACK
        // =====================================================
        } else {
            estadoBadge = `<span class="status-badge status-pendiente"><i class="fas fa-clock"></i> ${escapeHtml(estadoOrden)}</span>`;
            botonesHtml = `
                <button class="btn-primary" onclick="verInformeDecisionCliente(${orden.id_orden})">
                    <i class="fas fa-clipboard-check"></i> Ver Decisión
                </button>
                <button class="btn-outline" onclick="verDetalleCotizacionByOrden(${orden.id_orden})">
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            `;
        }
        
        const totalCotizado = orden.cotizacion_total || orden.total_orden || 0;
        
        // =====================================================
        // RENDERIZAR CARD DE LA ORDEN
        // =====================================================
        return `
        <div class="orden-card">
            <div class="orden-header">
                <div>
                    <span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(orden.codigo_unico)}</span>
                    <span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(orden.vehiculo)}</span>
                    ${estadoBadge}
                </div>
                <div>
                    <span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(orden.cliente_nombre)}</span>
                    <span class="orden-total"><i class="fas fa-dollar-sign"></i> Total: ${formatCurrency(totalCotizado)}</span>
                </div>
            </div>
            <div class="servicios-container">
                ${orden.servicios.map(serv => `
                    <div class="servicio-row">
                        <div class="servicio-info">
                            <div class="servicio-nombre">${escapeHtml(serv.descripcion)}</div>
                        </div>
                        <div class="servicio-estado estado-${serv.estado_cotizacion}">
                            <i class="fas ${serv.estado_cotizacion === 'cotizado' ? 'fa-check-circle' : (serv.estado_cotizacion === 'solicitado' ? 'fa-paper-plane' : 'fa-clock')}"></i>
                            ${serv.estado_cotizacion === 'cotizado' ? 'Cotizado' : (serv.estado_cotizacion === 'solicitado' ? 'Solicitud enviada' : 'Pendiente')}
                        </div>
                        ${serv.precio_cotizado > 0 ? `<div class="servicio-precio">${formatCurrency(serv.precio_cotizado)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="orden-footer">
                ${botonesHtml}
            </div>
        </div>`;
    }).join('');
}

function renderHistorialCotizaciones() {
    const container = document.getElementById('historialCotizacionesContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('searchHistorial')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstadoHistorial')?.value || 'all';
    
    let filtered = [...historialCotizaciones];
    
    if (searchTerm) {
        filtered = filtered.filter(c => 
            (c.orden_codigo || '').toLowerCase().includes(searchTerm) ||
            (c.cliente_nombre || '').toLowerCase().includes(searchTerm) ||
            (c.vehiculo || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtroEstado !== 'all') {
        filtered = filtered.filter(c => c.estado === filtroEstado);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-history"></i><p>No hay cotizaciones en el historial</p></div>`;
        return;
    }
    
    container.innerHTML = filtered.map(cot => `
        <div class="orden-card">
            <div class="orden-header">
                <div><span class="orden-codigo"><i class="fas fa-tag"></i> ${escapeHtml(cot.orden_codigo)}</span><span class="orden-vehiculo"><i class="fas fa-car"></i> ${escapeHtml(cot.vehiculo)}</span></div>
                <div><span class="orden-cliente"><i class="fas fa-user"></i> ${escapeHtml(cot.cliente_nombre)}</span><span class="orden-total"><i class="fas fa-dollar-sign"></i> Total: ${formatCurrency(cot.total)}</span></div>
            </div>
            <div class="orden-body" style="padding: 0.75rem 1.25rem;">
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                    <div><strong>Fecha envío:</strong> ${formatDate(cot.fecha_envio)}</div>
                    <div>${statusBadge(cot.estado)}</div>
                    ${cot.fecha_rechazo ? `<div><strong>Rechazado:</strong> ${formatDate(cot.fecha_rechazo)}</div>` : ''}
                </div>
                ${cot.motivo_rechazo ? `<div class="motivo-rechazo" style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(193,18,31,0.1); border-radius: 6px;"><i class="fas fa-comment-dots"></i> <strong>Motivo de rechazo:</strong><p style="margin: 0.25rem 0 0 1.5rem; font-size: 0.8rem;">${escapeHtml(cot.motivo_rechazo)}</p></div>` : ''}
            </div>
            <div class="orden-footer">
                <button class="btn-outline" onclick="verDetalleCotizacion(${cot.id})"><i class="fas fa-eye"></i> Ver Detalle</button>
                ${cot.estado === 'rechazada' ? `<button class="btn-primary" onclick="reutilizarCotizacionRechazada(${cot.id_orden_trabajo}, ${cot.id})"><i class="fas fa-copy"></i> Generar Nueva Cotización</button>` : ''}
            </div>
        </div>
    `).join('');
}

// =====================================================
// RENDERIZAR SOLICITUDES DE COTIZACIÓN CON BOTÓN VER FOTOS (SIN COLUMNA ITEMS)
// =====================================================

function renderSolicitudesCotizacion() {
    const tbody = document.getElementById('tablaSolicitudesCotizacion');
    if (!tbody) return;
    
    if (solicitudesCotizacion.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-inbox"></i><p>No hay solicitudes</p></div></td></tr>`;
        return;
    }
    
    tbody.innerHTML = solicitudesCotizacion.map(s => {
        let totalFotos = 0;
        if (s.items && s.items.length > 0) {
            s.items.forEach(item => {
                if (item.foto_url) totalFotos++;
                if (item.fotos && Array.isArray(item.fotos)) totalFotos += item.fotos.length;
            });
        }
        
        const totalItems = s.items ? s.items.length : 0;
        
        const verFotosBtn = totalFotos > 0 ? `
            <button class="btn-ver-fotos-tabla" onclick="abrirModalFotosSolicitud(${s.id})" 
                    style="padding:0.3rem 0.8rem;font-size:0.7rem;background:var(--rojo-primario);color:white;border:none;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:0.4rem;transition:all 0.2s;white-space:nowrap;">
                <i class="fas fa-images"></i> ${totalFotos}
            </button>
        ` : `<span style="font-size:0.7rem;color:var(--gris-texto);"><i class="fas fa-camera"></i> 0</span>`;
        
        const itemsBadge = totalItems > 0 ? `
            <span style="background:var(--gris-oscuro);padding:0.1rem 0.5rem;border-radius:10px;font-size:0.65rem;color:var(--gris-texto);">
                ${totalItems}
            </span>
        ` : `<span style="font-size:0.65rem;color:var(--gris-texto);">-</span>`;
        
        // ✅ AGREGAR data-label PARA RESPONSIVE
        return `
            <tr>
                <td data-label="ID" style="font-weight:600;font-size:0.85rem;">${s.id}</td>
                <td data-label="Orden"><strong style="font-size:0.85rem;">${escapeHtml(s.orden_codigo)}</strong></td>
                <td data-label="Vehículo" style="font-size:0.8rem;">${escapeHtml(s.vehiculo)}</td>
                <td data-label="Servicio" style="font-size:0.8rem;">${escapeHtml(s.servicio_descripcion || '-')}</td>
                <td data-label="Items" style="text-align:center;">${itemsBadge}</td>
                <td data-label="Estado">${statusBadge(s.estado)}</td>
                <td data-label="Precio" style="font-weight:600;color:var(--verde-exito);">${s.precio_cotizado ? formatCurrency(s.precio_cotizado) : '-'}</td>
                <td data-label="Fecha" style="font-size:0.75rem;">${formatDate(s.fecha_solicitud)}</td>
                <td data-label="Fotos" style="text-align:center;">${verFotosBtn}</td>
            </tr>
        `;
    }).join('');
}
// =====================================================
// ABRIR MODAL DE FOTOS DE LA SOLICITUD - CARGA PARALELA
// =====================================================

async function abrirModalFotosSolicitud(id_solicitud) {
    // Buscar la solicitud en los datos
    const solicitud = solicitudesCotizacion.find(s => s.id === id_solicitud);
    if (!solicitud) {
        showToast('Solicitud no encontrada', 'error');
        return;
    }
    
    // Recolectar todas las fotos de los items
    let todasLasFotos = [];
    
    if (solicitud.items && solicitud.items.length > 0) {
        solicitud.items.forEach(item => {
            // Soporte para versión anterior (foto_url)
            if (item.foto_url) {
                todasLasFotos.push({
                    url: item.foto_url,
                    descripcion: item.descripcion || 'Item',
                    cantidad: item.cantidad || 1
                });
            }
            // Soporte para nueva versión (fotos array)
            if (item.fotos && Array.isArray(item.fotos)) {
                item.fotos.forEach(fotoUrl => {
                    todasLasFotos.push({
                        url: fotoUrl,
                        descripcion: item.descripcion || 'Item',
                        cantidad: item.cantidad || 1
                    });
                });
            }
        });
    }
    
    if (todasLasFotos.length === 0) {
        showToast('Esta solicitud no tiene fotos', 'warning');
        return;
    }
    
    // Crear el modal si no existe
    let modal = document.getElementById('modalFotosSolicitud');
    if (!modal) {
        const modalHtml = `
            <div class="modal" id="modalFotosSolicitud" onclick="cerrarModalFotosSolicitud()">
                <div class="modal-content" style="max-width: 850px; max-height: 90vh; background: var(--bg-card);" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3><i class="fas fa-images"></i> Fotos de la Solicitud #${id_solicitud}</h3>
                        <button class="modal-close" onclick="cerrarModalFotosSolicitud()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 1.5rem; max-height: 60vh; overflow-y: auto;">
                        <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--gris-oscuro); border-radius: 8px; display:grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap:0.5rem;">
                            <div><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(solicitud.orden_codigo)}</div>
                            <div><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(solicitud.vehiculo)}</div>
                            <div><strong><i class="fas fa-camera"></i> Total:</strong> ${todasLasFotos.length} foto(s)</div>
                            <div><strong><i class="fas fa-clock"></i> Estado:</strong> ${statusBadge(solicitud.estado)}</div>
                        </div>
                        <div id="fotosSolicitudContainer" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px;">
                            <!-- Las fotos se cargarán aquí -->
                        </div>
                        <div id="fotosSolicitudLoader" style="display:flex;justify-content:center;align-items:center;padding:2rem;">
                            <i class="fas fa-spinner fa-spin fa-2x"></i>
                            <span style="margin-left:1rem;">Cargando ${todasLasFotos.length} foto(s)...</span>
                        </div>
                        <div id="fotosSolicitudProgress" style="display:none;margin-top:0.5rem;text-align:center;font-size:0.85rem;color:var(--gris-texto);">
                            <span id="fotosSolicitudProgressText">0/${todasLasFotos.length} cargadas</span>
                            <div style="width:100%;height:4px;background:var(--gris-oscuro);border-radius:2px;margin-top:0.25rem;overflow:hidden;">
                                <div id="fotosSolicitudProgressBar" style="width:0%;height:100%;background:var(--rojo-primario);border-radius:2px;transition:width 0.3s;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;flex-wrap:wrap;gap:0.5rem;">
                            <span id="fotosSolicitudCounter" style="font-size:0.85rem;color:var(--gris-texto);"></span>
                            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                                <button class="btn-secondary" onclick="cerrarModalFotosSolicitud()">
                                    <i class="fas fa-times"></i> Cerrar
                                </button>
                                <button class="btn-primary" onclick="descargarTodasFotosSolicitud(${id_solicitud})">
                                    <i class="fas fa-download"></i> Descargar Todas
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    // Mostrar loader
    const container = document.getElementById('fotosSolicitudContainer');
    const loader = document.getElementById('fotosSolicitudLoader');
    const counter = document.getElementById('fotosSolicitudCounter');
    const progress = document.getElementById('fotosSolicitudProgress');
    const progressText = document.getElementById('fotosSolicitudProgressText');
    const progressBar = document.getElementById('fotosSolicitudProgressBar');
    
    if (container) container.innerHTML = '';
    if (loader) loader.style.display = 'flex';
    if (counter) counter.textContent = `Cargando ${todasLasFotos.length} foto(s)...`;
    if (progress) progress.style.display = 'block';
    if (progressText) progressText.textContent = `0/${todasLasFotos.length} cargadas`;
    if (progressBar) progressBar.style.width = '0%';
    
    // Abrir modal
    modal = document.getElementById('modalFotosSolicitud');
    if (modal) modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // 🔥 CREAR TODOS LOS CONTENEDORES PRIMERO
    const fotosPorCargar = todasLasFotos.length;
    let fotosCargadas = 0;
    let fotosExitosas = 0;
    let fotosFallidas = 0;
    
    for (let i = 0; i < todasLasFotos.length; i++) {
        const foto = todasLasFotos[i];
        const fotoId = `foto_solicitud_${id_solicitud}_${i}`;
        const loaderId = `loader_foto_solicitud_${id_solicitud}_${i}`;
        
        const fotoDiv = document.createElement('div');
        fotoDiv.className = 'foto-item-modal';
        fotoDiv.style.cssText = `
            background: var(--gris-oscuro);
            border-radius: 8px;
            overflow: hidden;
            position: relative;
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid var(--border-color);
            transition: transform 0.2s;
            cursor: pointer;
        `;
        fotoDiv.onclick = function() {
            verFotoAmpliadaJefeTaller(foto.url);
        };
        
        fotoDiv.innerHTML = `
            <div id="${loaderId}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
                <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--gris-texto);"></i>
            </div>
            <img id="${fotoId}" src="" alt="Foto ${i+1}" style="width:100%;height:100%;object-fit:cover;display:none;">
            <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent, rgba(0,0,0,0.8));padding:8px;color:white;font-size:0.7rem;text-align:center;pointer-events:none;">
                <strong>${escapeHtml(foto.descripcion)}</strong><br>
                <small>×${foto.cantidad || 1}</small>
            </div>
            <span style="position:absolute;top:5px;right:8px;background:rgba(0,0,0,0.7);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;z-index:5;pointer-events:none;">
                ${i+1}/${todasLasFotos.length}
            </span>
        `;
        
        if (container) container.appendChild(fotoDiv);
    }
    
    // 🔥 FUNCIÓN PARA ACTUALIZAR PROGRESO
    function actualizarProgreso() {
        const porcentaje = Math.round((fotosCargadas / fotosPorCargar) * 100);
        if (progressText) progressText.textContent = `${fotosCargadas}/${fotosPorCargar} cargadas (${fotosExitosas} OK, ${fotosFallidas} ❌)`;
        if (progressBar) progressBar.style.width = `${porcentaje}%`;
        if (counter) counter.textContent = `${fotosExitosas}/${fotosPorCargar} foto(s) cargadas (${fotosFallidas} fallidas)`;
        
        if (fotosCargadas >= fotosPorCargar) {
            if (loader) loader.style.display = 'none';
            if (progress) {
                setTimeout(() => {
                    progress.style.display = 'none';
                }, 2000);
            }
        }
    }
    
    // 🔥 CARGAR TODAS LAS FOTOS EN PARALELO CON PROMISE.ALLSETTLED
    const promesas = todasLasFotos.map((foto, i) => {
        return new Promise((resolve) => {
            const fotoId = `foto_solicitud_${id_solicitud}_${i}`;
            const loaderId = `loader_foto_solicitud_${id_solicitud}_${i}`;
            const imgElement = document.getElementById(fotoId);
            const loaderElement = document.getElementById(loaderId);
            
            if (!imgElement) {
                fotosCargadas++;
                fotosFallidas++;
                actualizarProgreso();
                resolve({ success: false, index: i });
                return;
            }
            
            // Timeout para no esperar más de 10 segundos por foto
            const timeoutId = setTimeout(() => {
                if (loaderElement) {
                    loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:1.5rem;"></i>';
                }
                fotosCargadas++;
                fotosFallidas++;
                actualizarProgreso();
                resolve({ success: false, index: i, error: 'timeout' });
            }, 10000);
            
            // 🔥 CARGAR CON PROXY
            const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(foto.url)}`;
            fetch(proxyUrl, {
                headers: getAuthHeaders()
            })
            .then(response => response.json())
            .then(data => {
                clearTimeout(timeoutId);
                
                if (data.success && data.base64) {
                    const img = new Image();
                    img.onload = function() {
                        if (imgElement) {
                            imgElement.src = data.base64;
                            imgElement.style.display = 'block';
                            imgElement.setAttribute('data-loaded', 'true');
                        }
                        if (loaderElement) loaderElement.style.display = 'none';
                        fotosCargadas++;
                        fotosExitosas++;
                        actualizarProgreso();
                        resolve({ success: true, index: i });
                    };
                    img.onerror = function() {
                        if (loaderElement) {
                            loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:1.5rem;"></i>';
                        }
                        fotosCargadas++;
                        fotosFallidas++;
                        actualizarProgreso();
                        resolve({ success: false, index: i, error: 'load_error' });
                    };
                    img.src = data.base64;
                } else {
                    if (loaderElement) {
                        loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:1.5rem;"></i>';
                    }
                    fotosCargadas++;
                    fotosFallidas++;
                    actualizarProgreso();
                    resolve({ success: false, index: i, error: 'no_data' });
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error(`Error cargando foto ${i}:`, error);
                if (loaderElement) {
                    loaderElement.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--rojo-primario);font-size:1.5rem;"></i>';
                }
                fotosCargadas++;
                fotosFallidas++;
                actualizarProgreso();
                resolve({ success: false, index: i, error: error.message });
            });
        });
    });
    
    // Esperar a que todas las promesas terminen (éxito o error)
    const resultados = await Promise.allSettled(promesas);
    
    // Resumen final
    const exitosas = resultados.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const fallidas = resultados.length - exitosas;
    
    if (counter) {
        counter.textContent = `✅ ${exitosas}/${todasLasFotos.length} foto(s) cargadas ${fallidas > 0 ? `❌ ${fallidas} fallidas` : ''}`;
    }
    if (loader) loader.style.display = 'none';
    if (progress) {
        setTimeout(() => {
            progress.style.display = 'none';
        }, 3000);
    }
    
    // Mostrar toast con resumen
    if (fallidas > 0 && exitosas > 0) {
        showToast(`⚠️ ${exitosas} fotos cargadas, ${fallidas} fallaron. Reintenta más tarde.`, 'warning');
    } else if (fallidas === todasLasFotos.length) {
        showToast('❌ No se pudieron cargar las fotos. Verifica tu conexión.', 'error');
    } else if (exitosas === todasLasFotos.length) {
        showToast(`✅ ${exitosas} fotos cargadas correctamente`, 'success');
    }
}
// =====================================================
// CERRAR MODAL DE FOTOS DE LA SOLICITUD
// =====================================================

function cerrarModalFotosSolicitud() {
    const modal = document.getElementById('modalFotosSolicitud');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = '';
}

// =====================================================
// DESCARGAR TODAS LAS FOTOS DE LA SOLICITUD
// =====================================================

async function descargarTodasFotosSolicitud(id_solicitud) {
    const solicitud = solicitudesCotizacion.find(s => s.id === id_solicitud);
    if (!solicitud) {
        showToast('Solicitud no encontrada', 'error');
        return;
    }
    
    // Recolectar todas las fotos
    let todasLasFotos = [];
    if (solicitud.items && solicitud.items.length > 0) {
        solicitud.items.forEach(item => {
            if (item.foto_url) {
                todasLasFotos.push(item.foto_url);
            }
            if (item.fotos && Array.isArray(item.fotos)) {
                item.fotos.forEach(fotoUrl => {
                    todasLasFotos.push(fotoUrl);
                });
            }
        });
    }
    
    if (todasLasFotos.length === 0) {
        showToast('No hay fotos para descargar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        let descargasExitosas = 0;
        
        for (let i = 0; i < todasLasFotos.length; i++) {
            const fotoUrl = todasLasFotos[i];
            
            const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(fotoUrl)}`;
            const response = await fetch(proxyUrl, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            
            if (data.success && data.base64) {
                const link = document.createElement('a');
                link.href = data.base64;
                link.download = `solicitud_${id_solicitud}_foto_${i+1}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                descargasExitosas++;
                
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        showToast(`✅ ${descargasExitosas} foto(s) descargadas`, 'success');
    } catch (error) {
        console.error('Error descargando fotos:', error);
        showToast('Error al descargar las fotos', 'error');
    } finally {
        mostrarLoading(false);
    }
}
// =====================================================
// SUBIDA DE ARCHIVOS
// =====================================================

function setupFileUpload() {
    console.log('🔧 Configurando subida de archivos...');
    
    const fileInput = document.getElementById('cotizacionFile');
    const selectBtn = document.getElementById('selectFileBtn');
    const dropArea = document.getElementById('fileUploadArea');
    const removeBtn = document.getElementById('removeFileBtn');
    
    if (!fileInput) {
        console.error('❌ No se encontró el input de archivo (cotizacionFile)');
        return;
    }
    
    if (selectBtn) {
        selectBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🖱️ Click en seleccionar archivo');
            fileInput.click();
        });
    }
    
    if (dropArea) {
        dropArea.addEventListener('click', function(e) {
            if (e.target === selectBtn || selectBtn?.contains(e.target)) return;
            console.log('🖱️ Click en área de drop');
            fileInput.click();
        });
    }
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        console.log('📁 Archivo seleccionado:', file?.name);
        if (file) handleFileSelect(file);
    });
    
    if (dropArea) {
        dropArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropArea.classList.add('dragover');
        });
        
        dropArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            dropArea.classList.remove('dragover');
        });
        
        dropArea.addEventListener('drop', function(e) {
            e.preventDefault();
            dropArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            console.log('📁 Archivo soltado:', file?.name);
            if (file) handleFileSelect(file);
        });
    }
    
    if (removeBtn) {
        removeBtn.addEventListener('click', function() {
            console.log('🗑️ Eliminar archivo');
            clearFileSelection();
        });
    }
    
    console.log('✅ Subida de archivos configurada correctamente');
}

function handleFileSelect(file) {
    if (!file) return;
    
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Solo se permiten archivos PDF o Word', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showToast('El archivo no debe superar los 10MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        currentFileData = e.target.result;
        currentFileName = file.name;
        displayFileInfo(file);
        showToast('Archivo cargado correctamente', 'success');
        console.log('✅ Archivo cargado:', file.name);
    };
    reader.onerror = () => {
        showToast('Error al leer el archivo', 'error');
        console.error('❌ Error al leer el archivo');
    };
    reader.readAsDataURL(file);
}

function displayFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileIconPdf = document.getElementById('fileIconPdf');
    const fileIconWord = document.getElementById('fileIconWord');
    
    if (fileInfo && fileName && fileSize) {
        fileName.textContent = file.name;
        fileSize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        
        if (fileIconPdf && fileIconWord) {
            if (file.type === 'application/pdf') {
                fileIconPdf.style.display = 'block';
                fileIconWord.style.display = 'none';
            } else {
                fileIconPdf.style.display = 'none';
                fileIconWord.style.display = 'block';
            }
        }
        
        fileInfo.style.display = 'block';
    }
}

function clearFileSelection() {
    currentFileData = null;
    currentFileName = null;
    
    const fileInfo = document.getElementById('fileInfo');
    const fileInput = document.getElementById('cotizacionFile');
    
    if (fileInfo) fileInfo.style.display = 'none';
    if (fileInput) fileInput.value = '';
}

// =====================================================
// FUNCIONES PARA SERVICIOS COTIZABLES
// =====================================================

function renderServiciosCotizables() {
    const container = document.getElementById('serviciosCotizacionContainer');
    if (!container) return;
    
    if (serviciosCotizables.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-plus-circle"></i><p>No hay servicios agregados</p><small>Haz clic en "Agregar Servicio" para comenzar</small></div>`;
        actualizarTotalCotizacion();
        return;
    }
    
    container.innerHTML = serviciosCotizables.map((serv, idx) => `
        <div class="servicio-cotizable-card">
            <div class="servicio-cotizable-header" onclick="toggleServicioCotizable(${idx})">
                <div class="servicio-cotizable-nombre">
                    <input type="text" value="${escapeHtml(serv.nombre)}" onchange="actualizarServicioCotizable(${idx}, 'nombre', this.value)" onclick="event.stopPropagation()">
                </div>
                <div class="servicio-cotizable-precio">
                    Bs. <input type="number" value="${serv.precio || 0}" step="0.01" onchange="actualizarServicioCotizable(${idx}, 'precio', parseFloat(this.value))" onclick="event.stopPropagation()">
                </div>
                <button class="action-btn delete" onclick="eliminarServicioCotizable(${idx})" onclick="event.stopPropagation()"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="servicio-cotizable-body" id="servicio-body-${idx}">
                <div class="form-group">
                    <label>Descripción detallada</label>
                    <textarea class="form-textarea" rows="2" onchange="actualizarServicioCotizable(${idx}, 'descripcion', this.value)">${escapeHtml(serv.descripcion || '')}</textarea>
                </div>
            </div>
        </div>
    `).join('');
    
    actualizarTotalCotizacion();
}

function toggleServicioCotizable(idx) {
    const body = document.getElementById(`servicio-body-${idx}`);
    if (body) body.classList.toggle('active');
}

function actualizarServicioCotizable(idx, campo, valor) {
    if (serviciosCotizables[idx]) {
        serviciosCotizables[idx][campo] = valor;
        if (campo === 'precio') actualizarTotalCotizacion();
    }
}

function agregarServicioCotizable() {
    serviciosCotizables.push({
        id_servicio: null,
        nombre: 'Nuevo Servicio',
        descripcion: '',
        precio: 0,
        items: []
    });
    renderServiciosCotizables();
}

function eliminarServicioCotizable(idx) {
    if (confirm('¿Eliminar este servicio de la cotización?')) {
        serviciosCotizables.splice(idx, 1);
        renderServiciosCotizables();
    }
}

function actualizarTotalCotizacion() {
    const total = serviciosCotizables.reduce((sum, serv) => sum + (serv.precio || 0), 0);
    const totalSpan = document.getElementById('totalCotizacion');
    if (totalSpan) totalSpan.textContent = formatCurrency(total);
}

function cargarServiciosDesdeDiagnostico(orden) {
    serviciosCotizables = [];
    
    if (orden.servicios && orden.servicios.length > 0) {
        orden.servicios.forEach(serv => {
            serviciosCotizables.push({
                id_servicio: serv.id_servicio,
                nombre: serv.descripcion,
                descripcion: serv.descripcion || '',
                precio: serv.precio_cotizado || 0,
                items: []
            });
        });
    }
    
    if (serviciosCotizables.length === 0) {
        serviciosCotizables.push({
            id_servicio: null,
            nombre: 'Mano de obra',
            descripcion: 'Trabajos de reparación y mantenimiento',
            precio: 0,
            items: []
        });
    }
    
    renderServiciosCotizables();
}

// =====================================================
// COTIZACIÓN AL CLIENTE
// =====================================================

function setupModalTabs() {
    const modalTabs = document.querySelectorAll('#modalGenerarCotizacion .modal-tab-btn');
    const modalContents = document.querySelectorAll('#modalGenerarCotizacion .modal-tab-content');
    
    modalTabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            const tabId = this.getAttribute('data-tab');
            
            modalTabs.forEach(t => t.classList.remove('active'));
            modalContents.forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const activeContent = document.getElementById(`tab-${tabId}`);
            if (activeContent) {
                activeContent.classList.add('active');
            }
        });
    });
}

async function abrirModalGenerarCotizacion(id_orden) {
    mostrarLoading(true);
    isEditingCotizacion = false;
    currentCotizacionId = null;
    
    try {
        const orden = ordenesParaCotizar.find(o => o.id_orden === id_orden);
        if (!orden) {
            showToast('Orden no encontrada', 'error');
            return;
        }
        
        currentOrdenData = { id_orden };
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-file-invoice"></i> Generar Cotización';
        
        cargarServiciosDesdeDiagnostico(orden);
        clearFileSelection();
        
        const ordenInfoDiv = document.getElementById('ordenInfoPreview');
        if (ordenInfoDiv) {
            ordenInfoDiv.innerHTML = `
                <div>
                    <strong>Orden:</strong> ${escapeHtml(orden.codigo_unico)}<br>
                    <strong>Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}<br>
                    <strong>Vehículo:</strong> ${escapeHtml(orden.vehiculo)}
                </div>
            `;
        }
        
        setupFileUpload();
        
        setTimeout(() => {
            setupModalTabs();
        }, 100);
        
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function editarCotizacionExistente(id_orden) {
    const cotizacion = cotizacionesMap[id_orden];
    if (cotizacion) {
        await editarCotizacionPorId(cotizacion.id);
    } else {
        abrirModalGenerarCotizacion(id_orden);
    }
}

async function editarCotizacionPorId(id_cotizacion) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${id_cotizacion}`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (!data.success) {
            showToast('Error al cargar la cotización', 'error');
            return;
        }
        
        const cotizacion = data.detalle;
        currentOrdenData = { id_orden: cotizacion.id_orden_trabajo };
        currentCotizacionId = id_cotizacion;
        isEditingCotizacion = true;
        
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Cotización';
        
        if (cotizacion.servicios && cotizacion.servicios.length > 0) {
            serviciosCotizables = cotizacion.servicios.map(serv => ({
                id_servicio: serv.id_servicio,
                nombre: serv.nombre || serv.descripcion,
                precio: serv.precio || 0
            }));
        } else {
            serviciosCotizables = [];
        }
        
        renderServiciosCotizables();
        
        if (cotizacion.notas) {
            document.getElementById('notasAdicionales').value = cotizacion.notas;
        }
        
        // 🔥 SI HAY ARCHIVO EN DRIVE, MOSTRAR INFORMACIÓN
        if (cotizacion.archivo_url) {
            const fileInfo = document.getElementById('fileInfo');
            const fileName = document.getElementById('fileName');
            const fileSize = document.getElementById('fileSize');
            
            if (fileInfo && fileName) {
                fileName.textContent = cotizacion.nombre_archivo || 'Documento en Drive';
                fileInfo.style.display = 'block';
                
                // Mostrar icono según extensión
                const fileIconPdf = document.getElementById('fileIconPdf');
                const fileIconWord = document.getElementById('fileIconWord');
                const nombreArchivo = (cotizacion.nombre_archivo || '').toLowerCase();
                
                if (fileIconPdf && fileIconWord) {
                    if (nombreArchivo.endsWith('.pdf')) {
                        fileIconPdf.style.display = 'block';
                        fileIconWord.style.display = 'none';
                    } else if (nombreArchivo.endsWith('.doc') || nombreArchivo.endsWith('.docx')) {
                        fileIconPdf.style.display = 'none';
                        fileIconWord.style.display = 'block';
                    }
                }
                
                // 🔥 BOTÓN PARA VER/ABRIR EL ARCHIVO EN DRIVE
                const fileActions = document.getElementById('fileActions');
                if (!fileActions) {
                    const actionsDiv = document.createElement('div');
                    actionsDiv.id = 'fileActions';
                    actionsDiv.style.marginTop = '8px';
                    actionsDiv.innerHTML = `
                        <button class="btn-outline btn-sm" onclick="window.open('${cotizacion.archivo_url}', '_blank')">
                            <i class="fas fa-external-link-alt"></i> Ver en Drive
                        </button>
                        <button class="btn-primary btn-sm" onclick="descargarDocumentoCotizacion(${id_cotizacion})">
                            <i class="fas fa-download"></i> Descargar
                        </button>
                        <small style="display:block; margin-top:4px; color:var(--gris-texto);">
                            <i class="fas fa-info-circle"></i> Archivo actual en Drive. Puedes reemplazarlo subiendo uno nuevo.
                        </small>
                    `;
                    fileInfo.appendChild(actionsDiv);
                }
            }
        }
        
        clearFileSelection();
        setupFileUpload();
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar la cotización', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function enviarCotizacionCliente() {
    if (!currentOrdenData) {
        showToast('No hay datos para enviar', 'warning');
        return;
    }
    
    if (!currentFileData) {
        showToast('Debes subir un archivo PDF o Word', 'warning');
        return;
    }
    
    const serviciosConPrecio = serviciosCotizables.filter(s => s.precio > 0);
    if (serviciosConPrecio.length === 0) {
        showToast('Debes asignar precios a al menos un servicio', 'warning');
        return;
    }
    
    if (!confirm(isEditingCotizacion ? '¿Actualizar y reenviar esta cotización?' : '¿Enviar esta cotización al cliente?')) return;
    
    mostrarLoading(true);
    try {
        const serviciosParaEnviar = serviciosCotizables.map(serv => ({
            id_servicio: serv.id_servicio,
            nombre: serv.nombre,
            precio: serv.precio
        }));
        
        const url = isEditingCotizacion && currentCotizacionId 
            ? `${API_URL}/actualizar-cotizacion/${currentCotizacionId}`
            : `${API_URL}/enviar-cotizacion`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenData.id_orden,
                archivo_base64: currentFileData,
                nombre_archivo: currentFileName,
                notas: document.getElementById('notasAdicionales')?.value || '',
                servicios: serviciosParaEnviar
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast(isEditingCotizacion ? 'Cotización actualizada y reenviada' : 'Cotización enviada al cliente', 'success');
            cerrarModal('modalGenerarCotizacion');
            clearFileSelection();
            serviciosCotizables = [];
            isEditingCotizacion = false;
            currentCotizacionId = null;
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al enviar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function reutilizarCotizacionRechazada(id_orden) {
    mostrarLoading(true);
    try {
        const orden = ordenesParaCotizar.find(o => o.id_orden === id_orden);
        const cotizacionId = orden?.cotizacion_id;
        
        if (!cotizacionId) {
            abrirModalGenerarCotizacion(id_orden);
            return;
        }
        
        const response = await fetch(`${API_URL}/detalle-cotizacion/${cotizacionId}`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (!data.success) {
            abrirModalGenerarCotizacion(id_orden);
            return;
        }
        
        const cotizacion = data.detalle;
        currentOrdenData = { id_orden };
        isEditingCotizacion = false;
        currentCotizacionId = null;
        
        document.getElementById('modalCotizacionTitle').innerHTML = '<i class="fas fa-copy"></i> Nueva Cotización';
        
        if (cotizacion.servicios && cotizacion.servicios.length > 0) {
            serviciosCotizables = cotizacion.servicios.map(serv => ({
                id_servicio: serv.id_servicio,
                nombre: serv.nombre || serv.descripcion,
                precio: serv.precio || 0
            }));
        } else {
            serviciosCotizables = [];
        }
        
        renderServiciosCotizables();
        
        const ordenInfoDiv = document.getElementById('ordenInfoPreview');
        if (ordenInfoDiv && orden) {
            ordenInfoDiv.innerHTML = `
                <div>
                    <strong>Orden:</strong> ${escapeHtml(orden.codigo_unico)}<br>
                    <strong>Cliente:</strong> ${escapeHtml(orden.cliente_nombre)}<br>
                    <strong>Vehículo:</strong> ${escapeHtml(orden.vehiculo)}
                </div>
                <small style="color: var(--gris-texto);">
                    <i class="fas fa-info-circle"></i> 
                    Basado en cotización rechazada el ${formatDate(cotizacion.fecha_rechazo)}
                    ${cotizacion.archivo_url ? ` - <a href="${cotizacion.archivo_url}" target="_blank">Ver documento anterior</a>` : ''}
                </small>
            `;
        }
        
        clearFileSelection();
        setupFileUpload();
        abrirModal('modalGenerarCotizacion');
    } catch (error) {
        console.error('Error:', error);
        abrirModalGenerarCotizacion(id_orden);
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE DE COTIZACIÓN
// =====================================================

async function verDetalleCotizacion(id_cotizacion) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${id_cotizacion}`, { 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            const d = data.detalle;
            const container = document.getElementById('detalleCotizacionContainer');
            
            // 🔥 AGREGAR LINK AL DOCUMENTO EN DRIVE
            const documentoHtml = d.archivo_url ? `
                <div style="margin-top: 1rem; padding: 0.75rem; background: var(--gris-oscuro); border-radius: 8px;">
                    <strong><i class="fas fa-file"></i> Documento:</strong>
                    <a href="${d.archivo_url}" target="_blank" style="color: var(--rojo-primario); font-weight: 500;">
                        ${escapeHtml(d.nombre_archivo || 'Ver documento')}
                        <i class="fas fa-external-link-alt" style="font-size: 0.7rem;"></i>
                    </a>
                    <button class="btn-primary btn-sm" onclick="descargarDocumentoCotizacion(${id_cotizacion})" style="margin-left: 0.5rem; padding: 0.2rem 0.5rem; font-size: 0.7rem;">
                        <i class="fas fa-download"></i> Descargar
                    </button>
                </div>
            ` : '<div style="margin-top: 1rem; color: var(--gris-texto);"><i class="fas fa-info-circle"></i> No hay documento adjunto</div>';
            
            container.innerHTML = `
                <div class="orden-info-card">
                    <p><strong>Orden:</strong> ${escapeHtml(d.orden_codigo)}</p>
                    <p><strong>Cliente:</strong> ${escapeHtml(d.cliente_nombre)}</p>
                    <p><strong>Vehículo:</strong> ${escapeHtml(d.vehiculo_marca)} ${escapeHtml(d.vehiculo_modelo)} - ${escapeHtml(d.vehiculo_placa)}</p>
                    <p><strong>Fecha Envío:</strong> ${formatDate(d.fecha_envio)}</p>
                    <p><strong>Estado:</strong> ${statusBadge(d.estado || 'enviada')}</p>
                    <p><strong>Total:</strong> ${formatCurrency(d.total)}</p>
                    ${d.notas ? `<p><strong>Mensaje:</strong> ${escapeHtml(d.notas)}</p>` : ''}
                    ${documentoHtml}
                </div>
            `;
            
            abrirModal('modalDetalleCotizacion');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}
async function verDetalleCotizacionByOrden(id_orden) {
    const cotizacion = cotizacionesMap[id_orden];
    if (cotizacion) {
        await verDetalleCotizacion(cotizacion.id);
    } else {
        showToast('No se encontró cotización para esta orden', 'warning');
    }
}

// =====================================================
// ACCIONES - SOLICITUDES
// =====================================================

async function eliminarSolicitudCotizacion(id) {
    if (!confirm('¿Eliminar esta solicitud?')) return;
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/solicitudes-cotizacion/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
            showToast('Solicitud eliminada', 'success');
            await cargarSolicitudesCotizacion();
            await cargarOrdenesDiagnosticoAprobado();
        } else {
            showToast(data.error || 'Error al eliminar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// MODALES: NOTIFICAR ARMADO, INICIAR REPARACIÓN
// =====================================================

async function abrirModalNotificarArmado(id_orden, codigo, vehiculo, cliente) {
    currentOrdenArmado = { id_orden, codigo, vehiculo, cliente };
    
    const ordenInfo = document.getElementById('armadoOrdenInfo');
    if (ordenInfo) {
        ordenInfo.innerHTML = `
            <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(codigo)}</p>
            <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(vehiculo)}</p>
            <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(cliente)}</p>
            <p><strong><i class="fas fa-dollar-sign"></i> Monto a cobrar:</strong> Bs. 200.00 (solo diagnóstico)</p>
        `;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/tecnicos-asignados`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        const tecnicosContainer = document.getElementById('tecnicosAsignadosList');
        if (tecnicosContainer) {
            if (data.tecnicos && data.tecnicos.length > 0) {
                tecnicosContainer.innerHTML = data.tecnicos.map(t => `
                    <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; background: var(--bg-card); border-radius: 8px; margin-bottom: 0.5rem;">
                        <i class="fas fa-user-cog" style="color: var(--rojo-primario);"></i>
                        <div><strong>${escapeHtml(t.nombre)}</strong>${t.contacto ? `<br><small style="color: var(--gris-texto);">📞 ${escapeHtml(t.contacto)}</small>` : ''}</div>
                    </div>
                `).join('');
            } else {
                tecnicosContainer.innerHTML = `<div class="alert-warning">No hay técnicos asignados actualmente.</div>`;
            }
        }
    } catch (error) {
        console.error('Error cargando técnicos:', error);
    } finally {
        mostrarLoading(false);
    }
    
    document.getElementById('armadoInstrucciones').value = '';
    abrirModal('modalNotificarArmado');
}

async function confirmarNotificarArmado() {
    if (!currentOrdenArmado) return;
    
    const instrucciones = document.getElementById('armadoInstrucciones')?.value.trim();
    if (!instrucciones) {
        showToast('⚠️ Debes escribir instrucciones para el armado', 'warning');
        return;
    }
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/rechazo/iniciar-armado`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id_orden: currentOrdenArmado.id_orden,
                instrucciones_armado: instrucciones
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Instrucciones enviadas al técnico', 'success');
            cerrarModal('modalNotificarArmado');
            await cargarDatosIniciales();
        } else {
            showToast(data.error || 'Error al notificar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function abrirModalIniciarReparacion(id_orden, codigo, vehiculo, cliente) {
    currentOrdenAceptada = { id_orden, codigo, vehiculo, cliente };
    
    const ordenInfo = document.getElementById('reparacionOrdenInfo');
    if (ordenInfo) {
        ordenInfo.innerHTML = `
            <p><strong><i class="fas fa-tag"></i> Orden:</strong> ${escapeHtml(codigo)}</p>
            <p><strong><i class="fas fa-car"></i> Vehículo:</strong> ${escapeHtml(vehiculo)}</p>
            <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${escapeHtml(cliente)}</p>
        `;
    }
    
    const plazoDiasInput = document.getElementById('reparacionPlazoDias');
    if (plazoDiasInput) {
        plazoDiasInput.value = '';
        plazoDiasInput.style.borderColor = '';
    }
    
    const errorMsg = document.getElementById('plazoDiasError');
    if (errorMsg) errorMsg.style.display = 'none';
    
    mostrarLoading(true);
    try {
        const [tecnicosActualesRes, todosTecnicosRes] = await Promise.all([
            fetch(`${API_URL}/orden/${id_orden}/tecnicos-asignados`, { headers: getAuthHeaders() }),
            fetch(`${API_URL}/tecnicos-con-carga`, { headers: getAuthHeaders() })
        ]);
        
        const tecnicosActualesData = await tecnicosActualesRes.json();
        const todosTecnicosData = await todosTecnicosRes.json();
        
        console.log('📊 Técnicos actuales:', tecnicosActualesData);
        console.log('📊 Todos los técnicos con carga:', todosTecnicosData);
        
        const tecnicosActualesIds = new Set();
        if (tecnicosActualesData.tecnicos && tecnicosActualesData.tecnicos.length > 0) {
            tecnicosActualesData.tecnicos.forEach(t => tecnicosActualesIds.add(t.id));
        }
        
        const container = document.getElementById('tecnicosContainer');
        if (container) {
            if (todosTecnicosData.tecnicos && todosTecnicosData.tecnicos.length > 0) {
                container.innerHTML = todosTecnicosData.tecnicos.map(t => {
                    const estaAsignado = tecnicosActualesIds.has(t.id);
                    const ordenesActivas = t.ordenes_activas || 0;
                    const maxVehiculos = t.max_vehiculos || 2;
                    const disponible = ordenesActivas < maxVehiculos;
                    
                    let cargaColor = '';
                    let cargaIcono = '';
                    let cargaTexto = '';
                    
                    if (ordenesActivas === 0) {
                        cargaColor = '#10B981';
                        cargaIcono = 'fa-check-circle';
                        cargaTexto = 'Disponible';
                    } else if (ordenesActivas === 1) {
                        cargaColor = '#F59E0B';
                        cargaIcono = 'fa-clock';
                        cargaTexto = `${ordenesActivas}/${maxVehiculos} vehículo(s)`;
                    } else {
                        cargaColor = '#EF4444';
                        cargaIcono = 'fa-exclamation-triangle';
                        cargaTexto = `COMPLETO (${ordenesActivas}/${maxVehiculos})`;
                    }
                    
                    const checkboxDisabled = !disponible && !estaAsignado;
                    const disabledAttr = checkboxDisabled ? 'disabled' : '';
                    
                    return `
                        <div class="tecnico-item" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem; background: var(--bg-card); border-radius: 8px; transition: all 0.2s; border: 1px solid var(--border-color); margin-bottom: 0.5rem; ${checkboxDisabled ? 'opacity: 0.6;' : ''}">
                            <input type="checkbox" id="tecnico_${t.id}" value="${t.id}" ${estaAsignado ? 'checked' : ''} ${disabledAttr}>
                            <label for="tecnico_${t.id}" style="flex: 1; cursor: ${checkboxDisabled ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-user-cog" style="color: var(--rojo-primario);"></i>
                                <div style="flex: 1;">
                                    <strong>${escapeHtml(t.nombre)}</strong>
                                    ${t.contacto ? `<br><small style="color: var(--gris-texto);">📞 ${escapeHtml(t.contacto)}</small>` : ''}
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                                    <span style="font-size: 0.7rem; color: ${cargaColor};">
                                        <i class="fas ${cargaIcono}"></i> ${cargaTexto}
                                    </span>
                                    ${ordenesActivas > 0 ? `
                                        <div style="width: 60px; height: 4px; background: var(--gris-oscuro); border-radius: 2px; overflow: hidden;">
                                            <div style="width: ${(ordenesActivas / maxVehiculos) * 100}%; height: 100%; background: ${cargaColor}; border-radius: 2px;"></div>
                                        </div>
                                    ` : ''}
                                </div>
                                ${estaAsignado ? '<span style="margin-left: 0.5rem; font-size: 0.7rem; color: var(--verde-exito);"><i class="fas fa-check-circle"></i> Actual</span>' : ''}
                                ${!disponible && !estaAsignado ? '<span style="margin-left: 0.5rem; font-size: 0.7rem; color: var(--rojo-primario);"><i class="fas fa-ban"></i> Límite alcanzado</span>' : ''}
                            </label>
                        </div>
                    `;
                }).join('');
            } else {
                container.innerHTML = `<div class="alert-warning" style="padding: 1rem; text-align: center;">
                    <i class="fas fa-exclamation-triangle"></i> No hay técnicos disponibles para asignar<br>
                    <small>Verifica que existan usuarios con rol "tecnico_mecanico" en el sistema</small>
                </div>`;
            }
        }
    } catch (error) {
        console.error('Error cargando técnicos:', error);
        const container = document.getElementById('tecnicosContainer');
        if (container) {
            container.innerHTML = `<div class="alert-danger" style="padding: 1rem; text-align: center;">
                <i class="fas fa-exclamation-circle"></i> Error al cargar técnicos. Intente nuevamente.<br>
                <small>${error.message}</small>
            </div>`;
        }
    } finally {
        mostrarLoading(false);
    }
    
    document.getElementById('reparacionInstrucciones').value = '';
    abrirModal('modalIniciarReparacion');
}

async function confirmarIniciarReparacion() {
    if (!currentOrdenAceptada) return;
    
    const plazoDiasInput = document.getElementById('reparacionPlazoDias');
    let plazoDias = plazoDiasInput?.value;
    
    console.log("🔍 Valor del input:", plazoDias);
    
    if (!plazoDias || plazoDias === '' || plazoDias === null) {
        showToast('⚠️ Debes especificar cuántos días durará la reparación', 'warning');
        plazoDiasInput?.focus();
        return;
    }
    
    const diasNumerico = Number(plazoDias);
    console.log("🔍 Convertido a número:", diasNumerico);
    
    if (isNaN(diasNumerico) || diasNumerico < 1 || diasNumerico > 60) {
        showToast('⚠️ El plazo debe ser un número entre 1 y 60 días', 'warning');
        return;
    }
    
    const instrucciones = document.getElementById('reparacionInstrucciones')?.value.trim();
    if (!instrucciones) {
        showToast('⚠️ Debes escribir instrucciones para los técnicos', 'warning');
        return;
    }
    
    const checkboxes = document.querySelectorAll('#tecnicosContainer input[type="checkbox"]:checked');
    const tecnicosIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (tecnicosIds.length === 0) {
        showToast('⚠️ Selecciona al menos un técnico', 'warning');
        return;
    }
    
    const confirmMsg = `📋 INICIAR REPARACIÓN\n\n` +
        `📅 Plazo: ${diasNumerico} DÍAS\n` +
        `👨‍🔧 Técnicos: ${tecnicosIds.length}\n\n` +
        `⚠️ Este plazo se guardará en la base de datos.\n` +
        `¿Confirmar?`;
    
    if (!confirm(confirmMsg)) return;
    
    mostrarLoading(true);
    
    try {
        const payload = {
            id_orden: currentOrdenAceptada.id_orden,
            tecnicos: tecnicosIds,
            instrucciones: instrucciones,
            dias: diasNumerico
        };
        
        console.log("📤 Enviando payload:", JSON.stringify(payload, null, 2));
        
        const response = await fetch(`${API_URL}/iniciar-reparacion-con-dias`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        console.log("📥 Respuesta:", data);
        
        if (data.success) {
            showToast(`✅ Reparación iniciada. Plazo: ${data.dias_guardados} días`, 'success');
            cerrarModal('modalIniciarReparacion');
            setTimeout(() => location.reload(), 1500);
        } else {
            showToast(data.error || 'Error al iniciar reparación', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function verAvanceReparacion(id_orden) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/avances-reparacion`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.error || 'Error al cargar avances', 'error');
            return;
        }
        
        const container = document.getElementById('detalleCotizacionContainer');
        if (!container) return;
        
        let avancesHtml = '';
        if (data.avances && data.avances.length > 0) {
            avancesHtml = data.avances.map(av => `
                <div style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
                        <span style="font-weight:600;">${escapeHtml(av.descripcion)}</span>
                        <span style="font-size:0.7rem;color:var(--gris-texto);">${formatDate(av.fecha)}</span>
                    </div>
                    <div style="display:flex;gap:0.5rem;margin-top:0.25rem;font-size:0.7rem;color:var(--gris-texto);">
                        <span><i class="fas fa-user-cog"></i> ${escapeHtml(av.tecnico_nombre)}</span>
                        <span><span class="status-badge status-pendiente">${escapeHtml(av.tipo)}</span></span>
                    </div>
                </div>
            `).join('');
        } else {
            avancesHtml = `<p style="text-align:center;color:var(--gris-texto);padding:1rem;">No hay avances registrados</p>`;
        }
        
        container.innerHTML = `
            <div style="padding:0.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-bottom:1rem;">
                    <h3 style="margin:0;"><i class="fas fa-tasks"></i> Avances de Reparación</h3>
                    <span style="font-size:0.8rem;color:var(--gris-texto);">Orden: ${escapeHtml(data.orden_codigo)}</span>
                </div>
                <div style="max-height:400px;overflow-y:auto;">
                    ${avancesHtml}
                </div>
            </div>
        `;
        
        abrirModal('modalDetalleCotizacion');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function verInstruccionesArmado(id_orden) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/instrucciones-armado`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success && data.instrucciones) {
            const container = document.getElementById('detalleCotizacionContainer');
            container.innerHTML = `
                <div class="alert-info">
                    <strong>Instrucciones de armado:</strong>
                    <p style="margin-top: 0.75rem; white-space: pre-wrap;">${escapeHtml(data.instrucciones)}</p>
                    <small>Fecha: ${formatDate(data.fecha_envio)}</small>
                </div>
            `;
            abrirModal('modalDetalleCotizacion');
        } else {
            showToast('No se encontraron instrucciones', 'warning');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar instrucciones', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// FUNCIONES DE TAB Y EVENTOS
// =====================================================

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId)?.classList.add('active');
            
            if (tabId === 'tab-solicitar-compra') {
                cargarSolicitudesRepuestosTecnico();
            }
        });
    });
}

function setupEventListeners() {
    // Botones principales
    document.getElementById('enviarCotizacionBtn')?.addEventListener('click', enviarCotizacionCliente);
    document.getElementById('btnAgregarServicioCotizacion')?.addEventListener('click', agregarServicioCotizable);
    document.getElementById('btnAgregarItemSolicitud')?.addEventListener('click', agregarItemSolicitud);
    document.getElementById('saveSolicitudModal')?.addEventListener('click', guardarSolicitudCotizacion);
    
    // Botones de refresh
    document.getElementById('refreshSolicitarBtn')?.addEventListener('click', () => cargarDatosIniciales());
    document.getElementById('refreshCotizacionBtn')?.addEventListener('click', () => cargarDatosIniciales());
    document.getElementById('refreshHistorialBtn')?.addEventListener('click', cargarHistorialCotizaciones);
    document.getElementById('btnHistorialCotizaciones')?.addEventListener('click', () => {
        cargarHistorialCotizaciones().then(() => abrirModal('modalHistorialCotizaciones'));
    });
    document.getElementById('btnNuevaSolicitudCotizacion')?.addEventListener('click', () => {
        // Ya no se usa el select de orden
        showToast('Selecciona una orden desde la lista', 'info');
    });
    
    // Botones TAB 3
    document.getElementById('refreshSolicitudesTecnico')?.addEventListener('click', () => {
        cargarSolicitudesRepuestosTecnico();
    });
    document.getElementById('filtroEstadoRepuestoTecnico')?.addEventListener('change', () => cargarSolicitudesRepuestosTecnico());
    document.getElementById('searchRepuestoTecnico')?.addEventListener('input', () => cargarSolicitudesRepuestosTecnico());
    
    // Filtros TAB 1 y 2
    document.getElementById('filtroEstadoCotizacionSolicitar')?.addEventListener('change', () => renderOrdenesSolicitarCotizacion());
    document.getElementById('searchOrdenSolicitar')?.addEventListener('input', () => renderOrdenesSolicitarCotizacion());
    document.getElementById('filtroEstadoCotizacionCliente')?.addEventListener('change', () => renderOrdenesCotizacionCliente());
    document.getElementById('searchCotizacionCliente')?.addEventListener('input', () => renderOrdenesCotizacionCliente());
    document.getElementById('searchHistorial')?.addEventListener('input', () => renderHistorialCotizaciones());
    document.getElementById('filtroEstadoHistorial')?.addEventListener('change', () => renderHistorialCotizaciones());
    
    // Botones compra directa
    document.getElementById('btnNuevaSolicitudCompraDirecta')?.addEventListener('click', abrirModalNuevaSolicitudCompraDirecta);
    document.getElementById('btnAgregarItemCompraDirecta')?.addEventListener('click', agregarItemCompraDirecta);
    document.getElementById('btnConfirmarCompraDirecta')?.addEventListener('click', confirmarCompraDirecta);
    
    // Cerrar modales al hacer clic fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    });
}

async function cargarUsuarioActual() {
    try {
        let token = localStorage.getItem('furia_token') || localStorage.getItem('token');
        if (!token) { 
            window.location.href = window.API_BASE_URL + '/'; 
            return null; 
        }
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');
        currentUser = { 
            id: payload.user?.id || payload.id || userData?.id, 
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario', 
            roles: payload.user?.roles || payload.roles || userData?.roles || [] 
        };
        currentUserRoles = currentUser.roles || [];
        
        const tieneRolJefeTaller = currentUserRoles.some(rol => 
            rol === 'jefe_taller' || rol === 'jefe_taller_principal' || rol === 'admin'
        );
        
        if (!tieneRolJefeTaller) { 
            showToast('No tienes permisos para acceder a esta sección', 'error'); 
            setTimeout(() => { window.location.href = window.API_BASE_URL + '/'; }, 2000); 
            return null; 
        }
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.innerHTML = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
    } catch (error) { 
        console.error('Error al cargar usuario:', error);
        window.location.href = window.API_BASE_URL + '/'; 
        return null; 
    }
}

async function cargarDatosIniciales() {
    mostrarLoading(true);
    try {
        await Promise.all([
            cargarOrdenesDiagnosticoAprobado(),
            cargarOrdenesParaCotizar(),
            cargarSolicitudesCotizacion(),
            cargarCotizacionesMap(),
            cargarSolicitudesCompra(),
            cargarEncargadosRepuestos(),
            cargarHistorialCotizaciones(),
            cargarSolicitudesRepuestosTecnico()
        ]);
    } catch (error) {
        console.error('Error cargando datos:', error);
        showToast('Error al cargar los datos', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function logout() { 
    localStorage.clear(); 
    sessionStorage.clear(); 
    window.location.href = window.API_BASE_URL + '/'; 
}

async function inicializar() {
    console.log('🚀 Inicializando cotizaciones.js versión 6.0');
    const user = await cargarUsuarioActual();
    if (!user) return;
    await cargarDatosIniciales();
    setupTabs();
    setupEventListeners();
    console.log('✅ cotizaciones.js inicializado correctamente');
}

// =====================================================
// RENDERIZAR SOLICITUDES DE COMPRA CON MINIATURAS DE FOTOS
// =====================================================

function renderSolicitudesCompra() {
    const tbody = document.getElementById('tablaSolicitudesCompra');
    if (!tbody) return;
    
    if (!solicitudesCompra || solicitudesCompra.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-inbox"></i><p>No hay solicitudes de compra</p></div></td></tr>`;
        return;
    }
    
    // Construir HTML de todas las filas
    let html = '';
    
    solicitudesCompra.forEach((s, idx) => {
        // Parsear items
        let itemsList = s.items;
        if (typeof itemsList === 'string') {
            try {
                itemsList = JSON.parse(itemsList);
            } catch(e) {
                itemsList = [];
            }
        }
        
        // Recolectar todas las URLs de fotos de los items
        let fotosUrls = [];
        if (itemsList && itemsList.length > 0) {
            itemsList.forEach(item => {
                // Versión con foto_url
                if (item.foto_url) {
                    fotosUrls.push(item.foto_url);
                }
                // Versión con fotos array
                if (item.fotos && Array.isArray(item.fotos)) {
                    item.fotos.forEach(fotoUrl => {
                        if (fotoUrl) fotosUrls.push(fotoUrl);
                    });
                }
            });
        }
        
        const totalFotos = fotosUrls.length;
        const totalItems = itemsList ? itemsList.length : 0;
        
        // =====================================================
        // GENERAR MINIATURAS (hasta 3)
        // =====================================================
        let miniaturasHtml = '';
        const fotosParaMostrar = fotosUrls.slice(0, 3);
        
        if (fotosParaMostrar.length > 0) {
            // Usar un ID único por solicitud para los elementos
            const uniqueId = `compra_${s.id}`;
            
            miniaturasHtml = `
                <div class="miniaturas-container" style="display:flex;gap:2px;align-items:center;flex-wrap:wrap;">
                    ${fotosParaMostrar.map((url, i) => `
                        <div class="miniatura-wrapper" style="position:relative;width:30px;height:30px;border-radius:4px;overflow:hidden;border:1px solid var(--border-color);flex-shrink:0;">
                            <div class="miniatura-loader" id="loader_${uniqueId}_${i}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:var(--gris-oscuro);">
                                <i class="fas fa-spinner fa-spin" style="font-size:10px;color:var(--gris-texto);"></i>
                            </div>
                            <img class="miniatura-img" id="img_${uniqueId}_${i}" 
                                 src="" 
                                 alt="Foto" 
                                 style="width:100%;height:100%;object-fit:cover;display:none;cursor:pointer;"
                                 onclick="verFotoAmpliadaJefeTaller('${url}')"
                                 data-url="${url}"
                                 data-loaded="false">
                        </div>
                    `).join('')}
                    ${totalFotos > 3 ? `
                        <span class="fotos-extra" style="font-size:0.6rem;color:var(--gris-texto);background:var(--gris-oscuro);padding:0.1rem 0.4rem;border-radius:4px;">
                            +${totalFotos - 3}
                        </span>
                    ` : ''}
                </div>
            `;
        } else {
            miniaturasHtml = `
                <span style="font-size:0.65rem;color:var(--gris-texto);">
                    <i class="fas fa-camera" style="opacity:0.3;"></i> Sin fotos
                </span>
            `;
        }
        
        // Items badge
        const itemsBadge = totalItems > 0 ? `
            <span style="background:var(--gris-oscuro);padding:0.1rem 0.5rem;border-radius:10px;font-size:0.65rem;color:var(--gris-texto);">
                ${totalItems}
            </span>
        ` : `<span style="font-size:0.65rem;color:var(--gris-texto);">-</span>`;
        
        // Estado
        let estadoClass = '';
        let estadoIcon = '';
        let estadoTexto = '';
        
        switch (s.estado) {
            case 'pendiente':
                estadoClass = 'status-pendiente';
                estadoIcon = 'fa-clock';
                estadoTexto = 'Pendiente';
                break;
            case 'comprado':
                estadoClass = 'status-aprobado';
                estadoIcon = 'fa-check-circle';
                estadoTexto = 'Comprado';
                break;
            case 'rechazado':
                estadoClass = 'status-rechazado';
                estadoIcon = 'fa-times-circle';
                estadoTexto = 'Rechazado';
                break;
            default:
                estadoClass = 'status-pendiente';
                estadoIcon = 'fa-clock';
                estadoTexto = s.estado || 'Pendiente';
        }
        
        // Items en texto (para tooltip o vista rápida)
        let itemsTexto = '';
        if (itemsList && itemsList.length > 0) {
            itemsTexto = itemsList.map(item => 
                `${item.descripcion || 'Item'} x${item.cantidad || 1}`
            ).join(', ');
        }
        
        html += `
            <tr data-solicitud-id="${s.id}" data-fotos-count="${totalFotos}">
                <td data-label="ID" style="font-weight:600;font-size:0.85rem;">${s.id}</td>
                <td data-label="Orden"><strong style="font-size:0.85rem;">${escapeHtml(s.orden_codigo || 'N/A')}</strong></td>
                <td data-label="Vehículo" style="font-size:0.8rem;">${escapeHtml(s.vehiculo || 'N/A')}</td>
                <td data-label="Items" style="max-width:200px;font-size:0.75rem;color:var(--gris-texto);" title="${escapeHtml(itemsTexto)}">
                    ${itemsBadge}
                    ${itemsList && itemsList.length > 0 ? `<div style="font-size:0.65rem;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(itemsTexto.substring(0, 50))}${itemsTexto.length > 50 ? '...' : ''}</div>` : ''}
                </td>
                <td data-label="Estado"><span class="status-badge ${estadoClass}"><i class="fas ${estadoIcon}"></i> ${estadoTexto}</span></td>
                <td data-label="Fecha" style="font-size:0.75rem;">${formatDate(s.fecha_solicitud)}</td>
                <td data-label="Fotos" style="text-align:center;min-width:80px;">
                    ${miniaturasHtml}
                </td>
                <td data-label="Acciones" class="action-buttons">
                    <button class="action-btn view" onclick="verDetalleSolicitudCompra(${s.id})" title="Ver detalle">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${s.estado === 'pendiente' ? 
                        `<button class="action-btn approve" onclick="aprobarCompra(${s.id})" title="Marcar como comprado">
                            <i class="fas fa-check-circle"></i>
                        </button>` : ''}
                </td>
            </tr>
        `;
    });
    
    // Insertar todo el HTML de una vez
    tbody.innerHTML = html;
    
    // =====================================================
    // CARGAR LAS MINIATURAS CON PROXY
    // =====================================================
    // Usar requestAnimationFrame para asegurar que el DOM esté listo
    requestAnimationFrame(() => {
        // Pequeño retraso adicional para garantizar que los elementos estén en el DOM
        setTimeout(() => {
            const rows = tbody.querySelectorAll('tr[data-solicitud-id]');
            
            rows.forEach(row => {
                const solicitudId = row.getAttribute('data-solicitud-id');
                const miniaturas = row.querySelectorAll('.miniatura-img');
                
                miniaturas.forEach((img, i) => {
                    const url = img.getAttribute('data-url');
                    const loaderId = `loader_compra_${solicitudId}_${i}`;
                    // Buscar el loader con el ID correcto
                    const loader = document.getElementById(loaderId);
                    
                    if (url && loader) {
                        // Usar la función existente cargarImagenProxy
                        cargarImagenProxy(url, img, loader);
                    } else if (loader) {
                        loader.style.display = 'none';
                    }
                });
            });
        }, 150);
    });
}
// =====================================================
// VER DETALLE DE SOLICITUD DE COMPRA CON PROXY
// =====================================================

function verDetalleSolicitudCompra(id) {
    const solicitud = solicitudesCompra.find(s => s.id === id);
    if (!solicitud) {
        showToast('Solicitud no encontrada', 'error');
        return;
    }
    
    window.currentSolicitudCompraId = id;
    
    // Parsear items
    let itemsList = solicitud.items;
    if (typeof itemsList === 'string') {
        try {
            itemsList = JSON.parse(itemsList);
        } catch(e) {
            itemsList = [];
        }
    }
    
    // Construir HTML de items con fotos usando proxy
    let itemsHtml = '';
    if (itemsList && itemsList.length > 0) {
        itemsHtml = '<ul style="margin: 0.5rem 0 0 0; list-style: none; padding: 0;">' + 
            itemsList.map((item, idx) => {
                const fotoUrl = item.foto_url || item.foto || '';
                const fotoId = `detalle_foto_${solicitud.id}_${idx}`;
                const loaderId = `detalle_loader_${solicitud.id}_${idx}`;
                
                // HTML para la foto con loader
                let fotoHtml = '';
                if (fotoUrl) {
                    fotoHtml = `
                        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                            <div id="${loaderId}" style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--gris-texto);">
                                <i class="fas fa-spinner fa-spin"></i>
                                <span>Cargando imagen...</span>
                            </div>
                            <img id="${fotoId}" 
                                 src="" 
                                 alt="Foto del item" 
                                 style="width:60px;height:60px;object-fit:cover;border-radius:6px;cursor:pointer;display:none;border:2px solid var(--border-color);"
                                 onclick="verFotoAmpliadaJefeTaller('${fotoUrl}')"
                                 data-url="${fotoUrl}"
                                 data-loaded="false"
                                 title="Haz clic para ver ampliada">
                        </div>
                    `;
                }
                
                // Elemento del item
                const itemHtml = `
                    <li style="padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-weight:600;">${escapeHtml(item.descripcion || 'Item')}</span>
                            <span style="background:var(--gris-oscuro);padding:0.1rem 0.5rem;border-radius:4px;font-size:0.8rem;">
                                ×${item.cantidad || 1}
                            </span>
                            ${item.detalle ? `<span style="color:var(--gris-texto);font-size:0.8rem;">(${escapeHtml(item.detalle)})</span>` : ''}
                            ${item.precio ? `<span style="color:var(--verde-exito);font-weight:600;font-size:0.85rem;">${formatCurrency(item.precio)}</span>` : ''}
                        </div>
                        ${fotoHtml}
                    </li>
                `;
                
                // Programar carga de imagen con proxy
                setTimeout(() => {
                    if (fotoUrl) {
                        const imgEl = document.getElementById(fotoId);
                        const loaderEl = document.getElementById(loaderId);
                        if (imgEl && imgEl.getAttribute('data-loaded') !== 'true') {
                            cargarImagenProxy(fotoUrl, imgEl, loaderEl);
                        }
                    } else {
                        const loaderEl = document.getElementById(loaderId);
                        if (loaderEl) loaderEl.style.display = 'none';
                    }
                }, 100);
                
                return itemHtml;
            }).join('') + 
            '</ul>';
    } else {
        // Items legacy (sin array)
        const fotoUrl = solicitud.foto_url || solicitud.foto || '';
        const fotoId = `detalle_foto_${solicitud.id}_0`;
        const loaderId = `detalle_loader_${solicitud.id}_0`;
        
        let fotoHtml = '';
        if (fotoUrl) {
            fotoHtml = `
                <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
                    <div id="${loaderId}" style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--gris-texto);">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Cargando imagen...</span>
                    </div>
                    <img id="${fotoId}" 
                         src="" 
                         alt="Foto del item" 
                         style="width:80px;height:80px;object-fit:cover;border-radius:6px;cursor:pointer;display:none;border:2px solid var(--border-color);"
                         onclick="verFotoAmpliadaJefeTaller('${fotoUrl}')"
                         data-url="${fotoUrl}"
                         data-loaded="false"
                         title="Haz clic para ver ampliada">
                </div>
            `;
            
            setTimeout(() => {
                const imgEl = document.getElementById(fotoId);
                const loaderEl = document.getElementById(loaderId);
                if (imgEl && imgEl.getAttribute('data-loaded') !== 'true') {
                    cargarImagenProxy(fotoUrl, imgEl, loaderEl);
                }
            }, 100);
        }
        
        itemsHtml = `
            <div style="margin: 0.5rem 0 0 0; padding: 0.5rem; background: var(--bg-card); border-radius: 8px; border-left: 3px solid var(--rojo-primario);">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-weight:600;">${escapeHtml(solicitud.descripcion_pieza || 'Item')}</span>
                    <span style="background:var(--gris-oscuro);padding:0.1rem 0.5rem;border-radius:4px;font-size:0.8rem;">
                        ×${solicitud.cantidad || 1}
                    </span>
                    ${solicitud.precio_cotizado ? `<span style="color:var(--verde-exito);font-weight:600;">${formatCurrency(solicitud.precio_cotizado)}</span>` : ''}
                </div>
                ${fotoHtml}
            </div>
        `;
    }
    
    // Buscar la cotización relacionada (si existe)
    const cotizacion = cotizacionesMap ? cotizacionesMap[solicitud.id_orden_trabajo] : null;
    const tieneDocumento = cotizacion && cotizacion.id;
    
    // Construir HTML del modal de detalle
    const container = document.getElementById('detalleCotizacionContainer');
    if (!container) {
        console.error('❌ Contenedor detalleCotizacionContainer no encontrado');
        showToast('Error al mostrar el detalle', 'error');
        return;
    }
    
    container.innerHTML = `
        <div class="orden-info-card" style="padding: 1rem; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color);">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.5rem; margin-bottom: 1rem;">
                <div>
                    <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Solicitud ID</label>
                    <p style="margin: 0; font-weight: 600;">#${solicitud.id}</p>
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Estado</label>
                    <p style="margin: 0;">${statusBadge(solicitud.estado)}</p>
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Orden de Trabajo</label>
                    <p style="margin: 0; font-weight: 600;">${escapeHtml(solicitud.orden_codigo || 'N/A')}</p>
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Vehículo</label>
                    <p style="margin: 0;">${escapeHtml(solicitud.vehiculo || 'N/A')}</p>
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Fecha Solicitud</label>
                    <p style="margin: 0;">${formatDate(solicitud.fecha_solicitud)}</p>
                </div>
                ${solicitud.fecha_respuesta ? `
                    <div>
                        <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Fecha Respuesta</label>
                        <p style="margin: 0;">${formatDate(solicitud.fecha_respuesta)}</p>
                    </div>
                ` : ''}
            </div>
            
            <div style="margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
                <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 0.5rem;">
                    <i class="fas fa-boxes"></i> Items Solicitados
                </label>
                ${itemsHtml}
            </div>
            
            ${solicitud.mensaje_jefe_taller ? `
                <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(193,18,31,0.08); border-radius: 8px; border-left: 3px solid var(--rojo-primario);">
                    <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-comment"></i> Mensaje del Jefe de Taller
                    </label>
                    <p style="margin: 0.25rem 0 0 0; white-space: pre-wrap;">${escapeHtml(solicitud.mensaje_jefe_taller)}</p>
                </div>
            ` : ''}
            
            ${solicitud.respuesta_encargado ? `
                <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(16,185,129,0.08); border-radius: 8px; border-left: 3px solid var(--verde-exito);">
                    <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-reply"></i> Respuesta del Encargado
                    </label>
                    <p style="margin: 0.25rem 0 0 0; white-space: pre-wrap;">${escapeHtml(solicitud.respuesta_encargado)}</p>
                </div>
            ` : ''}
            
            ${solicitud.observacion_jefe_taller ? `
                <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(245,158,11,0.08); border-radius: 8px; border-left: 3px solid var(--amarillo);">
                    <label style="font-size: 0.65rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-sticky-note"></i> Observación
                    </label>
                    <p style="margin: 0.25rem 0 0 0;">${escapeHtml(solicitud.observacion_jefe_taller)}</p>
                </div>
            ` : ''}
            
            <!-- Sección de compra (si está completada) -->
            ${solicitud.estado === 'comprado' || solicitud.estado === 'entregado' ? `
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--border-color);">
                    <h4 style="color: var(--verde-exito); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-receipt"></i> Detalles de la Compra
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem 1rem;">
                        ${solicitud.fecha_compra ? `
                            <div>
                                <label style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Fecha de Compra</label>
                                <p style="margin: 0; font-weight: 500;">${formatDate(solicitud.fecha_compra)}</p>
                            </div>
                        ` : ''}
                        ${solicitud.numero_factura ? `
                            <div>
                                <label style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">N° Factura/Comprobante</label>
                                <p style="margin: 0; font-weight: 500;">${escapeHtml(solicitud.numero_factura)}</p>
                            </div>
                        ` : ''}
                        ${solicitud.proveedor_nombre ? `
                            <div>
                                <label style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Proveedor</label>
                                <p style="margin: 0; font-weight: 500;">${escapeHtml(solicitud.proveedor_nombre)}</p>
                            </div>
                        ` : ''}
                        ${solicitud.precio_cotizado ? `
                            <div>
                                <label style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Monto Total</label>
                                <p style="margin: 0; font-weight: 700; color: var(--verde-exito);">${formatCurrency(solicitud.precio_cotizado)}</p>
                            </div>
                        ` : ''}
                    </div>
                    ${solicitud.notas_compra ? `
                        <div style="margin-top: 0.5rem;">
                            <label style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Notas de compra</label>
                            <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">${escapeHtml(solicitud.notas_compra)}</p>
                        </div>
                    ` : ''}
                    ${solicitud.comprobante_url ? `
                        <div style="margin-top: 0.75rem;">
                            <button class="btn-outline" onclick="verComprobanteCompra(${solicitud.id})" style="width: 100%; padding: 0.5rem;">
                                <i class="fas fa-image"></i> Ver Comprobante de Compra
                            </button>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            
            ${solicitud.fecha_entrega ? `
                <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem;">
                        <div>
                            <label style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">
                                <i class="fas fa-truck"></i> Fecha de entrega
                            </label>
                            <p style="margin: 0; font-weight: 500;">${formatDate(solicitud.fecha_entrega)}</p>
                        </div>
                        ${solicitud.fecha_entrega_estimada ? `
                            <div>
                                <label style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Fecha estimada de entrega</label>
                                <p style="margin: 0;">${formatDate(solicitud.fecha_entrega_estimada)}</p>
                            </div>
                        ` : ''}
                    </div>
                    ${solicitud.notas_entrega ? `
                        <div style="margin-top: 0.5rem;">
                            <label style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Notas de entrega</label>
                            <p style="margin: 0.25rem 0 0 0;">${escapeHtml(solicitud.notas_entrega)}</p>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `;
    
    // Configurar botón de descarga de documento
    const modalFooter = document.querySelector('#modalDetalleCotizacion .modal-footer');
    if (modalFooter) {
        // Limpiar botones existentes (excepto cerrar)
        const closeBtn = modalFooter.querySelector('.btn-secondary');
        modalFooter.innerHTML = '';
        
        // Botón cerrar
        const closeButton = document.createElement('button');
        closeButton.className = 'btn-secondary';
        closeButton.innerHTML = '<i class="fas fa-times"></i> Cerrar';
        closeButton.onclick = () => cerrarModal('modalDetalleCotizacion');
        modalFooter.appendChild(closeButton);
        
        // Botón descargar documento (si existe cotización)
        if (tieneDocumento) {
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn-primary';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Descargar Documento';
            downloadBtn.onclick = () => descargarDocumentoCotizacion(cotizacion.id);
            modalFooter.appendChild(downloadBtn);
        }
        
        // Botón ver en Drive (si existe URL)
        if (solicitud.comprobante_url) {
            const driveBtn = document.createElement('button');
            driveBtn.className = 'btn-outline';
            driveBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Ver en Drive';
            driveBtn.onclick = () => window.open(solicitud.comprobante_url, '_blank');
            modalFooter.appendChild(driveBtn);
        }
    }
    
    // Abrir el modal
    abrirModal('modalDetalleCotizacion');
}
// =====================================================
// FUNCIÓN: DESCARGAR DOCUMENTO DESDE DRIVE
// =====================================================

async function descargarDocumentoCotizacion(idCotizacion) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/detalle-cotizacion/${idCotizacion}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (!data.success || !data.detalle) {
            showToast('No se pudo obtener el documento', 'error');
            return;
        }
        
        const cotizacion = data.detalle;
        
        // 🔥 AHORA USAMOS archivo_url EN VEZ DE archivo_base64
        if (!cotizacion.archivo_url) {
            showToast('No hay documento asociado a esta cotización', 'warning');
            return;
        }
        
        // 🔥 ABRIR LA URL DE DRIVE PARA DESCARGAR
        const downloadUrl = cotizacion.archivo_url;
        
        // Si es la URL de vista de Drive, convertir a descarga directa
        let directDownloadUrl = downloadUrl;
        if (downloadUrl.includes('drive.google.com')) {
            // Extraer ID de la URL
            const fileIdMatch = downloadUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            if (fileIdMatch) {
                directDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
            }
        }
        
        // Abrir en nueva ventana para descargar
        window.open(directDownloadUrl, '_blank');
        
        showToast('✅ Descarga iniciada', 'success');
        
    } catch (error) {
        console.error('Error descargando documento:', error);
        showToast('Error al descargar el documento', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function verComprobanteCompra(idSolicitud) {
    const solicitud = solicitudesCompra.find(s => s.id === idSolicitud);
    if (!solicitud || !solicitud.comprobante_url) {
        showToast('No hay comprobante disponible para esta solicitud', 'warning');
        return;
    }
    
    const isImage = solicitud.comprobante_url.match(/\.(jpeg|jpg|gif|png|webp)$/i);
    const fileExtension = isImage ? 'jpg' : 'pdf';
    
    const container = document.getElementById('detalleCotizacionContainer');
    container.innerHTML = `
        <div class="comprobante-modal-container">
            <div class="comprobante-header">
                <h3><i class="fas fa-receipt"></i> Comprobante de Compra</h3>
                <p>Solicitud #${solicitud.id} - Orden: ${escapeHtml(solicitud.orden_codigo)}</p>
            </div>
            
            <div class="comprobante-visualizacion">
                ${isImage ? 
                    `<img src="${solicitud.comprobante_url}" alt="Comprobante" class="comprobante-imagen" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22200%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%20fill%3D%22%23999%22%3EImagen%20no%20disponible%3C%2Ftext%3E%3C%2Fsvg%3E'">` :
                    `<iframe src="${solicitud.comprobante_url}" class="comprobante-pdf"></iframe>`
                }
            </div>
            
            <div class="comprobante-info">
                <div class="info-grid">
                    <div class="info-item">
                        <label>Factura/Comprobante N°:</label>
                        <span>${escapeHtml(solicitud.numero_factura || 'N/A')}</span>
                    </div>
                    <div class="info-item">
                        <label>Proveedor:</label>
                        <span>${escapeHtml(solicitud.proveedor_nombre || 'N/A')}</span>
                    </div>
                    <div class="info-item">
                        <label>Monto Total:</label>
                        <span class="monto">${formatCurrency(solicitud.precio_cotizado || 0)}</span>
                    </div>
                    <div class="info-item">
                        <label>Fecha de Compra:</label>
                        <span>${formatDate(solicitud.fecha_compra)}</span>
                    </div>
                    <div class="info-item">
                        <label>Estado:</label>
                        <span>${statusBadge(solicitud.estado)}</span>
                    </div>
                </div>
                
                ${solicitud.notas_compra ? `
                    <div class="info-item full-width">
                        <label>Notas de compra:</label>
                        <p>${escapeHtml(solicitud.notas_compra)}</p>
                    </div>
                ` : ''}
                
                ${solicitud.respuesta_encargado ? `
                    <div class="info-item full-width">
                        <label>Respuesta del Encargado:</label>
                        <p>${escapeHtml(solicitud.respuesta_encargado)}</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="comprobante-actions">
                <button class="btn-secondary" onclick="cerrarModal('modalDetalleCotizacion')">
                    <i class="fas fa-times"></i> Cerrar
                </button>
                <button class="btn-primary" onclick="descargarComprobante(${solicitud.id}, '${fileExtension}')">
                    <i class="fas fa-download"></i> Descargar Comprobante
                </button>
                ${isImage ? `
                    <button class="btn-outline" onclick="window.open('${solicitud.comprobante_url}', '_blank')">
                        <i class="fas fa-external-link-alt"></i> Abrir en nueva ventana
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    abrirModal('modalDetalleCotizacion');
}

async function descargarComprobante(idSolicitud) {
    const solicitud = solicitudesCompra.find(s => s.id === idSolicitud);
    if (!solicitud || !solicitud.comprobante_url) {
        showToast('No hay comprobante para descargar', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const url = solicitud.comprobante_url;
        const filename = `comprobante_${solicitud.orden_codigo}_${solicitud.id}.${url.split('.').pop().split('?')[0]}`;
        
        const response = await fetch(url);
        
        if (response.ok) {
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            showToast('✅ Descarga iniciada', 'success');
        } else {
            window.open(url, '_blank');
            showToast('El archivo se abrirá en una nueva ventana. Usa "Guardar como" desde allí.', 'info');
        }
    } catch (error) {
        console.error('Error descargando:', error);
        window.open(solicitud.comprobante_url, '_blank');
        showToast('El archivo se abrirá en una nueva ventana. Usa "Guardar como" para descargarlo.', 'info');
    } finally {
        mostrarLoading(false);
    }
}

async function aprobarCompra(id) {
    if (!confirm('¿Confirmar que la compra se realizó?')) return;
    
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_URL}/solicitudes-compra/${id}/aprobar`, { 
            method: 'PUT', 
            headers: getAuthHeaders() 
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Compra registrada como completada', 'success');
            await cargarSolicitudesCompra();
        } else {
            showToast(data.error || 'Error al registrar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// FUNCIÓN: VERIFICAR DÍAS GUARDADOS
// =====================================================

async function verificarDiasGuardados(id_orden) {
    try {
        console.log(`🔍 Verificando días guardados para orden ${id_orden}...`);
        
        const response = await fetch(`${API_URL}/detalle-cotizacion-orden/${id_orden}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success && data.detalle) {
            const detalle = data.detalle;
            console.log("📊 Datos de la orden:", detalle);
            
            let diasEncontrados = null;
            
            if (detalle.dias_estimados_reparacion) {
                diasEncontrados = detalle.dias_estimados_reparacion;
            }
            if (detalle.dias_estimados) {
                diasEncontrados = detalle.dias_estimados;
            }
            if (detalle.plazo_dias) {
                diasEncontrados = detalle.plazo_dias;
            }
            
            console.log(`📅 Días encontrados: ${diasEncontrados || 'No encontrados'}`);
            
            return {
                success: true,
                dias: diasEncontrados,
                detalle: detalle
            };
        } else {
            console.warn('⚠️ No se encontró la orden');
            return { success: false, error: 'Orden no encontrada' };
        }
    } catch (error) {
        console.error("❌ Error verificando días:", error);
        return { success: false, error: error.message };
    }
}
// =====================================================
// FUNCIÓN: COPIAR URL DE DRIVE
// =====================================================

function copiarUrlDrive(url) {
    if (!url) {
        showToast('No hay URL para copiar', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(url).then(() => {
        showToast('✅ URL copiada al portapapeles', 'success');
    }).catch(() => {
        // Fallback: seleccionar manual
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('✅ URL copiada al portapapeles', 'success');
    });
}
async function cargarImagenProxy(url, imgElement, loaderElement = null) {
    if (!url) {
        if (imgElement) {
            imgElement.style.display = 'none';
            imgElement.src = '';
        }
        if (loaderElement) loaderElement.style.display = 'none';
        return null;
    }
    
    // Mostrar loader
    if (loaderElement) {
        loaderElement.style.display = 'flex';
        loaderElement.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:10px;color:var(--gris-texto);"></i>';
    }
    if (imgElement) {
        imgElement.style.display = 'none';
        imgElement.style.opacity = '0';
    }
    
    try {
        const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.base64) {
            return new Promise((resolve) => {
                const nuevaImg = new Image();
                nuevaImg.onload = function() {
                    if (imgElement) {
                        imgElement.src = data.base64;
                        imgElement.style.display = 'block';
                        imgElement.style.opacity = '1';
                        imgElement.setAttribute('data-loaded', 'true');
                    }
                    if (loaderElement) loaderElement.style.display = 'none';
                    resolve(data.base64);
                };
                nuevaImg.onerror = function() {
                    console.error('Error al cargar imagen:', url);
                    if (loaderElement) {
                        loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--rojo-primario);"></i>';
                        loaderElement.style.display = 'flex';
                    }
                    if (imgElement) {
                        imgElement.style.display = 'none';
                    }
                    resolve(null);
                };
                nuevaImg.src = data.base64;
            });
        } else {
            if (loaderElement) {
                loaderElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--amarillo);"></i>';
                loaderElement.style.display = 'flex';
            }
            return null;
        }
    } catch (error) {
        console.error('Error cargando imagen:', error);
        if (loaderElement) {
            loaderElement.innerHTML = '<i class="fas fa-exclamation-circle" style="color:var(--rojo-primario);"></i>';
            loaderElement.style.display = 'flex';
        }
        return null;
    }
}
// =====================================================
// CARGAR PREVIEW DE FOTO EN SERVICIO (CON PROXY)
// =====================================================

async function cargarPreviewFotoServicio(id_servicio, index, slotIndex, fotoUrl) {
    if (!fotoUrl) {
        return;
    }
    
    const fotoId = `fotoPreviewServicio_${id_servicio}_${index}_${slotIndex}`;
    const loaderId = `fotoLoaderServicio_${id_servicio}_${index}_${slotIndex}`;
    const inputId = `fotoInputServicio_${id_servicio}_${index}_${slotIndex}`;
    
    const previewContainer = document.getElementById(fotoId);
    const loaderContainer = document.getElementById(loaderId);
    
    if (!previewContainer) return;
    
    // Mostrar loader en el preview
    if (loaderContainer) {
        loaderContainer.style.display = 'flex';
        loaderContainer.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--gris-texto);font-size:14px;"></i>';
    }
    
    previewContainer.style.display = 'none';
    
    try {
        const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(fotoUrl)}`;
        const response = await fetch(proxyUrl, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.base64) {
            // Precargar la imagen
            const img = new Image();
            img.onload = function() {
                previewContainer.innerHTML = `
                    <div style="position:relative;display:inline-block;">
                        <img src="${data.base64}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:2px solid var(--verde-exito);" 
                             data-loaded="true" data-url="${fotoUrl}">
                        <button type="button" class="btn-remove-foto" 
                                onclick="event.preventDefault(); eliminarFotoItemServicio(${id_servicio}, ${index}, ${slotIndex})" 
                                style="position:absolute;top:-4px;right:-4px;background:var(--rojo-primario);color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
                previewContainer.style.display = 'block';
                if (loaderContainer) loaderContainer.style.display = 'none';
            };
            img.onerror = function() {
                previewContainer.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;">
                        <i class="fas fa-exclamation-triangle" style="color:var(--rojo-primario);font-size:14px;"></i>
                    </div>
                `;
                previewContainer.style.display = 'block';
                if (loaderContainer) loaderContainer.style.display = 'none';
            };
            img.src = data.base64;
        } else {
            previewContainer.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;">
                    <i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:14px;"></i>
                </div>
            `;
            previewContainer.style.display = 'block';
            if (loaderContainer) loaderContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Error cargando preview:', error);
        previewContainer.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;">
                <i class="fas fa-exclamation-circle" style="color:var(--rojo-primario);font-size:14px;"></i>
            </div>
        `;
        previewContainer.style.display = 'block';
        if (loaderContainer) loaderContainer.style.display = 'none';
    }
}
// =====================================================
// MOSTRAR INFORME DE DECISIÓN DEL CLIENTE
// =====================================================

async function verInformeDecisionCliente(id_orden) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/informe-decision-cliente`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.error || 'Error al obtener el informe', 'error');
            return;
        }
        
        const informe = data.informe;
        const decision = informe.decision;
        const servicios = informe.servicios;
        const cotizacion = informe.cotizacion;
        
        // Construir HTML del informe
        let serviciosHtml = '';
        
        if (servicios.todos && servicios.todos.length > 0) {
            serviciosHtml = servicios.todos.map(serv => {
                const esAprobado = serv.estado === 'aprobado';
                const icono = esAprobado ? 'fa-check-circle' : 'fa-times-circle';
                const color = esAprobado ? 'var(--verde-exito)' : 'var(--rojo-primario)';
                const badgeText = esAprobado ? '✅ APROBADO' : '❌ RECHAZADO';
                const badgeColor = esAprobado ? 'background: var(--verde-exito);' : 'background: var(--rojo-primario);';
                
                return `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid var(--border-color);">
                            ${escapeHtml(serv.descripcion)}
                        </td>
                        <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: right;">
                            ${formatCurrency(serv.precio)}
                        </td>
                        <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: center;">
                            <span style="display: inline-block; padding: 0.1rem 0.5rem; border-radius: 12px; color: white; font-size: 0.6rem; ${badgeColor}">
                                <i class="fas ${icono}"></i> ${badgeText}
                            </span>
                        </td>
                        <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: center; font-size: 0.7rem; color: var(--gris-texto);">
                            ${serv.fecha_aprobacion ? formatDate(serv.fecha_aprobacion) : '-'}
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            serviciosHtml = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 1rem; color: var(--gris-texto);">
                        <i class="fas fa-info-circle"></i> No hay servicios en esta cotización
                    </td>
                </tr>
            `;
        }
        
        // Resumen de la decisión
        let resumenHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; margin-top: 0.5rem;">
                <div style="padding: 0.5rem; background: var(--bg-card); border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Servicios Aprobados</div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--verde-exito);">
                        ${servicios.total_aprobados} de ${servicios.total_servicios}
                    </div>
                </div>
                <div style="padding: 0.5rem; background: var(--bg-card); border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Total Aprobado</div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--verde-exito);">
                        ${formatCurrency(decision.total_aprobado)}
                    </div>
                </div>
                <div style="padding: 0.5rem; background: var(--bg-card); border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Total Rechazado</div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--rojo-primario);">
                        ${formatCurrency(decision.total_rechazado)}
                    </div>
                </div>
                <div style="padding: 0.5rem; background: var(--bg-card); border-radius: 8px; text-align: center; border: 2px solid ${decision.es_rechazada_total ? 'var(--rojo-primario)' : 'var(--verde-exito)'};">
                    <div style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Total a Pagar</div>
                    <div style="font-size: 1.4rem; font-weight: 700; color: ${decision.es_rechazada_total ? 'var(--rojo-primario)' : 'var(--verde-exito)'};">
                        ${formatCurrency(decision.total_final)}
                        ${decision.es_rechazada_total ? `<span style="font-size: 0.6rem; color: var(--gris-texto); display: block;">(Diagnóstico)</span>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Estado de la decisión - badge grande
        let estadoBadgeColor = '';
        let estadoIcono = '';
        let estadoTexto = '';
        
        if (decision.es_rechazada_total) {
            estadoBadgeColor = 'background: var(--rojo-primario);';
            estadoIcono = 'fa-times-circle';
            estadoTexto = 'RECHAZADA TOTAL';
        } else if (decision.estado === 'APROBADA TOTAL') {
            estadoBadgeColor = 'background: var(--verde-exito);';
            estadoIcono = 'fa-check-circle';
            estadoTexto = 'APROBADA TOTALMENTE';
        } else if (decision.estado === 'APROBADA PARCIAL') {
            estadoBadgeColor = 'background: var(--amarillo); color: var(--negro);';
            estadoIcono = 'fa-check-double';
            estadoTexto = 'APROBADA PARCIALMENTE';
        } else {
            estadoBadgeColor = 'background: var(--gris-texto);';
            estadoIcono = 'fa-clock';
            estadoTexto = 'PENDIENTE';
        }
        
        const container = document.getElementById('detalleCotizacionContainer');
        if (!container) {
            showToast('Error al mostrar el informe', 'error');
            return;
        }
        
        container.innerHTML = `
            <div style="padding: 0.5rem;">
                <!-- Encabezado -->
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-file-invoice"></i> Informe de Decisión
                        </h3>
                        <p style="margin: 0.25rem 0 0 0; color: var(--gris-texto); font-size: 0.8rem;">
                            Orden: <strong>${escapeHtml(informe.codigo_unico)}</strong>
                            | Cliente: <strong>${escapeHtml(informe.cliente_nombre)}</strong>
                            | Vehículo: <strong>${escapeHtml(informe.vehiculo.marca)} ${escapeHtml(informe.vehiculo.modelo)} - ${escapeHtml(informe.vehiculo.placa)}</strong>
                        </p>
                    </div>
                    <span style="padding: 0.3rem 1rem; border-radius: 20px; color: white; font-weight: 700; font-size: 0.8rem; ${estadoBadgeColor}">
                        <i class="fas ${estadoIcono}"></i> ${estadoTexto}
                    </span>
                </div>
                
                <!-- Mensaje de estado -->
                <div style="padding: 0.75rem; background: var(--gris-oscuro); border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid ${decision.es_rechazada_total ? 'var(--rojo-primario)' : (decision.estado === 'APROBADA TOTAL' ? 'var(--verde-exito)' : 'var(--amarillo)')};">
                    <p style="margin: 0; font-size: 0.9rem;">
                        <i class="fas ${decision.icono}" style="color: ${decision.es_rechazada_total ? 'var(--rojo-primario)' : (decision.estado === 'APROBADA TOTAL' ? 'var(--verde-exito)' : 'var(--amarillo)')};"></i>
                        ${decision.mensaje}
                    </p>
                    ${decision.fecha_decision ? `
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.7rem; color: var(--gris-texto);">
                            <i class="fas fa-calendar"></i> Decisión tomada: ${formatDate(decision.fecha_decision)}
                        </p>
                    ` : ''}
                </div>
                
                <!-- Resumen de la decisión -->
                ${resumenHtml}
                
                <!-- Tabla de servicios -->
                <div style="margin-top: 1rem; overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead>
                            <tr style="background: var(--gris-oscuro);">
                                <th style="padding: 8px; text-align: left;">Servicio</th>
                                <th style="padding: 8px; text-align: right;">Precio</th>
                                <th style="padding: 8px; text-align: center;">Estado</th>
                                <th style="padding: 8px; text-align: center;">Fecha Aprobación</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${serviciosHtml}
                        </tbody>
                        <tfoot style="font-weight: 700; background: var(--gris-oscuro);">
                            <tr>
                                <td style="padding: 8px; text-align: right;" colspan="3">TOTAL FINAL:</td>
                                <td style="padding: 8px; text-align: center; font-size: 1.1rem; color: ${decision.es_rechazada_total ? 'var(--rojo-primario)' : 'var(--verde-exito)'};">
                                    ${formatCurrency(decision.total_final)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                <!-- Motivo de rechazo (si aplica) -->
                ${cotizacion.motivo_rechazo || cotizacion.comentarios_rechazo ? `
                    <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(193,18,31,0.1); border-radius: 8px; border-left: 4px solid var(--rojo-primario);">
                        <p style="margin: 0; font-weight: 600; color: var(--rojo-primario);">
                            <i class="fas fa-comment-dots"></i> Motivo del Rechazo
                        </p>
                        ${cotizacion.motivo_rechazo ? `<p style="margin: 0.25rem 0 0 0; white-space: pre-wrap;">${escapeHtml(cotizacion.motivo_rechazo)}</p>` : ''}
                        ${cotizacion.comentarios_rechazo ? `<p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: var(--gris-texto);">${escapeHtml(cotizacion.comentarios_rechazo)}</p>` : ''}
                    </div>
                ` : ''}
                
                <!-- Historial de modificaciones -->
                ${informe.historial && informe.historial.length > 0 ? `
                    <div style="margin-top: 1rem;">
                        <details style="background: var(--gris-oscuro); border-radius: 8px; padding: 0.5rem;">
                            <summary style="cursor: pointer; font-weight: 600; font-size: 0.85rem;">
                                <i class="fas fa-history"></i> Historial de Modificaciones (${informe.historial.length})
                            </summary>
                            <div style="margin-top: 0.5rem; max-height: 150px; overflow-y: auto; font-size: 0.8rem;">
                                ${informe.historial.map((h, idx) => `
                                    <div style="padding: 0.25rem 0; border-bottom: 1px solid var(--border-color);">
                                        <span style="color: var(--gris-texto);">${formatDate(h.fecha)}</span>
                                        <span style="margin-left: 0.5rem;">${escapeHtml(h.comentario || 'Modificación de decisión')}</span>
                                        <span style="margin-left: 0.5rem; font-size: 0.7rem; color: var(--gris-texto);">
                                            (${h.servicios ? h.servicios.filter(s => s.aprobado).length : 0} aprobados)
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Configurar footer del modal
        const modalFooter = document.querySelector('#modalDetalleCotizacion .modal-footer');
        if (modalFooter) {
            // Limpiar footer
            modalFooter.innerHTML = '';
            
            // Botón cerrar
            const closeBtn = document.createElement('button');
            closeBtn.className = 'btn-secondary';
            closeBtn.innerHTML = '<i class="fas fa-times"></i> Cerrar';
            closeBtn.onclick = () => cerrarModal('modalDetalleCotizacion');
            modalFooter.appendChild(closeBtn);
            
            // Botón imprimir
            const printBtn = document.createElement('button');
            printBtn.className = 'btn-primary';
            printBtn.innerHTML = '<i class="fas fa-print"></i> Imprimir Informe';
            printBtn.onclick = () => imprimirInformeDecision(id_orden);
            modalFooter.appendChild(printBtn);
            
            // Botón descargar PDF (si hay cotización)
            if (cotizacion.id) {
                const pdfBtn = document.createElement('button');
                pdfBtn.className = 'btn-outline';
                pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Ver Cotización';
                pdfBtn.onclick = () => verDetalleCotizacion(cotizacion.id);
                modalFooter.appendChild(pdfBtn);
            }
        }
        
        // Abrir el modal
        abrirModal('modalDetalleCotizacion');
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al obtener el informe', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// IMPRIMIR INFORME DE DECISIÓN
// =====================================================

function imprimirInformeDecision(id_orden) {
    const content = document.getElementById('detalleCotizacionContainer');
    if (!content) return;
    
    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
            <head>
                <title>Informe de Decisión - FURIA MOTOR</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 0; padding: 20px; background: white; color: #1a1a1a; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #C1121F; padding-bottom: 15px; }
                    .header h1 { color: #C1121F; margin: 0; font-size: 1.5rem; }
                    .header p { margin: 5px 0 0 0; color: #666; font-size: 0.9rem; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th, td { padding: 8px 10px; border: 1px solid #ddd; text-align: left; }
                    th { background: #f5f5f5; font-weight: 600; }
                    .total-row { background: #f5f5f5; font-weight: 700; }
                    .badge-aprobado { display: inline-block; padding: 2px 10px; background: #10B981; color: white; border-radius: 12px; font-size: 0.7rem; }
                    .badge-rechazado { display: inline-block; padding: 2px 10px; background: #EF4444; color: white; border-radius: 12px; font-size: 0.7rem; }
                    .badge-pendiente { display: inline-block; padding: 2px 10px; background: #8E8E93; color: white; border-radius: 12px; font-size: 0.7rem; }
                    .resumen { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; }
                    .resumen-item { text-align: center; padding: 10px; background: #f5f5f5; border-radius: 8px; }
                    .resumen-item .label { font-size: 0.7rem; color: #666; text-transform: uppercase; }
                    .resumen-item .value { font-size: 1.2rem; font-weight: 700; }
                    .estado-badge { display: inline-block; padding: 4px 15px; border-radius: 20px; color: white; font-weight: 700; font-size: 0.8rem; }
                    .estado-aprobada { background: #10B981; }
                    .estado-parcial { background: #F59E0B; color: #1a1a1a; }
                    .estado-rechazada { background: #EF4444; }
                    .estado-pendiente { background: #8E8E93; }
                    .footer { margin-top: 30px; text-align: center; font-size: 0.7rem; color: #999; border-top: 1px solid #ddd; padding-top: 15px; }
                    .motivo { background: #fee2e2; padding: 10px; border-radius: 8px; margin: 10px 0; }
                    @media print {
                        .no-print { display: none; }
                        body { margin: 0; padding: 10px; }
                        .resumen-item { background: #f5f5f5; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>FURIA MOTOR COMPANY SRL</h1>
                    <p>Informe de Decisión del Cliente</p>
                    <p style="font-size: 0.8rem;">Fecha: ${new Date().toLocaleDateString('es-BO')}</p>
                </div>
                ${content.innerHTML}
                <div class="footer">
                    <p>Este informe es generado automáticamente por FURIA MOTOR COMPANY SRL</p>
                    <p>Documento válido para fines de seguimiento de la orden de trabajo</p>
                </div>
                <script>
                    window.onload = function() { window.print(); }
                <\/script>
            </body>
        </html>
    `);
    ventana.document.close();
}
// =====================================================
// CARGAR PREVIEW DE FOTO EN COMPRA DIRECTA (CON PROXY)
// =====================================================

async function cargarPreviewFotoCompra(index, fotoUrl) {
    if (!fotoUrl) {
        const previewSpan = document.getElementById(`fotoPreviewCompra_${index}`);
        if (previewSpan) previewSpan.innerHTML = '';
        return;
    }
    
    const previewSpan = document.getElementById(`fotoPreviewCompra_${index}`);
    if (!previewSpan) return;
    
    // Mostrar loader en el preview
    previewSpan.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;">
            <i class="fas fa-spinner fa-spin" style="color:var(--gris-texto);font-size:14px;"></i>
        </div>
    `;
    
    try {
        const proxyUrl = `${API_URL}/proxy-imagen?url=${encodeURIComponent(fotoUrl)}`;
        const response = await fetch(proxyUrl, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success && data.base64) {
            const img = new Image();
            img.onload = function() {
                previewSpan.innerHTML = `
                    <div class="foto-preview-container" style="position:relative;display:inline-block;">
                        <img src="${data.base64}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:2px solid var(--verde-exito);">
                        <button type="button" class="btn-remove-foto" onclick="event.preventDefault(); eliminarFotoItemCompra(${index})" 
                                style="position:absolute;top:-4px;right:-4px;background:var(--rojo-primario);color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            };
            img.onerror = function() {
                previewSpan.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;">
                        <i class="fas fa-exclamation-triangle" style="color:var(--rojo-primario);font-size:14px;"></i>
                    </div>
                `;
            };
            img.src = data.base64;
        } else {
            previewSpan.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;">
                    <i class="fas fa-exclamation-triangle" style="color:var(--amarillo);font-size:14px;"></i>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando preview:', error);
        previewSpan.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:var(--gris-oscuro);border-radius:6px;">
                <i class="fas fa-exclamation-circle" style="color:var(--rojo-primario);font-size:14px;"></i>
            </div>
        `;
    }
}
// =====================================================
// FUNCIÓN PARA VER FOTO AMPLIADA (JEFE DE TALLER)
// =====================================================

function verFotoAmpliadaJefeTaller(url) {
    if (!url) {
        showToast('No hay foto para mostrar', 'warning');
        return;
    }
    
    // Crear modal si no existe
    let modal = document.getElementById('modalFotoAmpliadaJefeTaller');
    if (!modal) {
        const modalHtml = `
            <div class="modal" id="modalFotoAmpliadaJefeTaller" onclick="cerrarFotoAmpliadaJefeTaller()">
                <div class="modal-content" style="max-width: 800px; background: var(--bg-card);" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3><i class="fas fa-image"></i> Foto del Repuesto</h3>
                        <button class="modal-close" onclick="cerrarFotoAmpliadaJefeTaller()">&times;</button>
                    </div>
                    <div class="modal-body" style="display:flex;justify-content:center;align-items:center;padding:1.5rem;background:var(--negro);min-height:300px;">
                        <img id="fotoAmpliadaJefeTallerImg" src="" alt="Foto ampliada" loading="lazy" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:var(--radius-md);">
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="cerrarFotoAmpliadaJefeTaller()">Cerrar</button>
                        <button class="btn-primary" onclick="descargarFotoAmpliadaJefeTaller()">
                            <i class="fas fa-download"></i> Descargar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    const img = document.getElementById('fotoAmpliadaJefeTallerImg');
    if (img) {
        img.src = url;
        img.alt = 'Foto ampliada';
        img.onerror = function() {
            this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="%238E8E93" stroke-width="2"%3E%3Crect x="3" y="3" width="18" height="18" rx="2"/%3E%3Ccircle cx="8.5" cy="8.5" r="1.5"/%3E%3Cpolyline points="21 15 16 10 5 21"/%3E%3C/svg%3E';
            this.style.objectFit = 'contain';
        };
    }
    
    window._fotoAmpliadaJefeTallerUrl = url;
    
    modal = document.getElementById('modalFotoAmpliadaJefeTaller');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function cerrarFotoAmpliadaJefeTaller() {
    const modal = document.getElementById('modalFotoAmpliadaJefeTaller');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

function descargarFotoAmpliadaJefeTaller() {
    const url = window._fotoAmpliadaJefeTallerUrl;
    if (!url) {
        showToast('No hay foto para descargar', 'warning');
        return;
    }
    
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.download = `repuesto_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('✅ Descargando foto...', 'success');
}
// =====================================================
// INFORME DE DECISIÓN DEL CLIENTE
// =====================================================

async function verInformeDecisionCliente(id_orden) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/orden/${id_orden}/informe-decision-cliente`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.error || 'Error al obtener el informe', 'error');
            return;
        }
        
        const informe = data.informe;
        const decision = informe.decision;
        const servicios = informe.servicios;
        const cotizacion = informe.cotizacion;
        
        // Construir HTML del informe
        let serviciosHtml = '';
        
        if (servicios.todos && servicios.todos.length > 0) {
            serviciosHtml = servicios.todos.map(serv => {
                const esAprobado = serv.estado === 'aprobado';
                const icono = esAprobado ? 'fa-check-circle' : 'fa-times-circle';
                const badgeText = esAprobado ? '✅ APROBADO' : '❌ RECHAZADO';
                const badgeColor = esAprobado ? 'background: var(--verde-exito);' : 'background: var(--rojo-primario);';
                
                return `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid var(--border-color);">
                            ${escapeHtml(serv.descripcion)}
                        </td>
                        <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: right;">
                            ${formatCurrency(serv.precio)}
                        </td>
                        <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: center;">
                            <span style="display: inline-block; padding: 0.1rem 0.5rem; border-radius: 12px; color: white; font-size: 0.6rem; ${badgeColor}">
                                <i class="fas ${icono}"></i> ${badgeText}
                            </span>
                        </td>
                        <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: center; font-size: 0.7rem; color: var(--gris-texto);">
                            ${serv.fecha_aprobacion ? formatDate(serv.fecha_aprobacion) : '-'}
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            serviciosHtml = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 1rem; color: var(--gris-texto);">
                        <i class="fas fa-info-circle"></i> No hay servicios en esta cotización
                    </td>
                </tr>
            `;
        }
        
        // Resumen de la decisión
        let resumenHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; margin-top: 0.5rem;">
                <div style="padding: 0.5rem; background: var(--bg-card); border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Servicios Aprobados</div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--verde-exito);">
                        ${servicios.total_aprobados} de ${servicios.total_servicios}
                    </div>
                </div>
                <div style="padding: 0.5rem; background: var(--bg-card); border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Total Aprobado</div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--verde-exito);">
                        ${formatCurrency(decision.total_aprobado)}
                    </div>
                </div>
                <div style="padding: 0.5rem; background: var(--bg-card); border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Total Rechazado</div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--rojo-primario);">
                        ${formatCurrency(decision.total_rechazado)}
                    </div>
                </div>
                <div style="padding: 0.5rem; background: var(--bg-card); border-radius: 8px; text-align: center; border: 2px solid ${decision.es_rechazada_total ? 'var(--rojo-primario)' : 'var(--verde-exito)'};">
                    <div style="font-size: 0.6rem; color: var(--gris-texto); text-transform: uppercase; letter-spacing: 0.5px;">Total a Pagar</div>
                    <div style="font-size: 1.4rem; font-weight: 700; color: ${decision.es_rechazada_total ? 'var(--rojo-primario)' : 'var(--verde-exito)'};">
                        ${formatCurrency(decision.total_final)}
                        ${decision.es_rechazada_total ? `<span style="font-size: 0.6rem; color: var(--gris-texto); display: block;">(Diagnóstico)</span>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Estado de la decisión - badge grande
        let estadoBadgeColor = '';
        let estadoIcono = '';
        let estadoTexto = '';
        
        if (decision.es_rechazada_total) {
            estadoBadgeColor = 'background: var(--rojo-primario);';
            estadoIcono = 'fa-times-circle';
            estadoTexto = 'RECHAZADA TOTAL';
        } else if (decision.estado === 'APROBADA TOTAL') {
            estadoBadgeColor = 'background: var(--verde-exito);';
            estadoIcono = 'fa-check-circle';
            estadoTexto = 'APROBADA TOTALMENTE';
        } else if (decision.estado === 'APROBADA PARCIAL') {
            estadoBadgeColor = 'background: var(--amarillo); color: var(--negro);';
            estadoIcono = 'fa-check-double';
            estadoTexto = 'APROBADA PARCIALMENTE';
        } else {
            estadoBadgeColor = 'background: var(--gris-texto);';
            estadoIcono = 'fa-clock';
            estadoTexto = 'PENDIENTE';
        }
        
        const container = document.getElementById('detalleCotizacionContainer');
        if (!container) {
            showToast('Error al mostrar el informe', 'error');
            return;
        }
        
        container.innerHTML = `
            <div style="padding: 0.5rem;">
                <!-- Encabezado -->
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-file-invoice"></i> Informe de Decisión
                        </h3>
                        <p style="margin: 0.25rem 0 0 0; color: var(--gris-texto); font-size: 0.8rem;">
                            Orden: <strong>${escapeHtml(informe.codigo_unico)}</strong>
                            | Cliente: <strong>${escapeHtml(informe.cliente_nombre)}</strong>
                            | Vehículo: <strong>${escapeHtml(informe.vehiculo.marca)} ${escapeHtml(informe.vehiculo.modelo)} - ${escapeHtml(informe.vehiculo.placa)}</strong>
                        </p>
                    </div>
                    <span style="padding: 0.3rem 1rem; border-radius: 20px; color: white; font-weight: 700; font-size: 0.8rem; ${estadoBadgeColor}">
                        <i class="fas ${estadoIcono}"></i> ${estadoTexto}
                    </span>
                </div>
                
                <!-- Mensaje de estado -->
                <div style="padding: 0.75rem; background: var(--gris-oscuro); border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid ${decision.es_rechazada_total ? 'var(--rojo-primario)' : (decision.estado === 'APROBADA TOTAL' ? 'var(--verde-exito)' : 'var(--amarillo)')};">
                    <p style="margin: 0; font-size: 0.9rem;">
                        <i class="fas ${decision.icono}" style="color: ${decision.es_rechazada_total ? 'var(--rojo-primario)' : (decision.estado === 'APROBADA TOTAL' ? 'var(--verde-exito)' : 'var(--amarillo)')};"></i>
                        ${decision.mensaje}
                    </p>
                    ${decision.fecha_decision ? `
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.7rem; color: var(--gris-texto);">
                            <i class="fas fa-calendar"></i> Decisión tomada: ${formatDate(decision.fecha_decision)}
                        </p>
                    ` : ''}
                </div>
                
                <!-- Resumen de la decisión -->
                ${resumenHtml}
                
                <!-- Tabla de servicios -->
                <div style="margin-top: 1rem; overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead>
                            <tr style="background: var(--gris-oscuro);">
                                <th style="padding: 8px; text-align: left;">Servicio</th>
                                <th style="padding: 8px; text-align: right;">Precio</th>
                                <th style="padding: 8px; text-align: center;">Estado</th>
                                <th style="padding: 8px; text-align: center;">Fecha Aprobación</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${serviciosHtml}
                        </tbody>
                        <tfoot style="font-weight: 700; background: var(--gris-oscuro);">
                            <tr>
                                <td style="padding: 8px; text-align: right;" colspan="3">TOTAL FINAL:</td>
                                <td style="padding: 8px; text-align: center; font-size: 1.1rem; color: ${decision.es_rechazada_total ? 'var(--rojo-primario)' : 'var(--verde-exito)'};">
                                    ${formatCurrency(decision.total_final)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                <!-- Motivo de rechazo (si aplica) -->
                ${cotizacion.motivo_rechazo || cotizacion.comentarios_rechazo ? `
                    <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(193,18,31,0.1); border-radius: 8px; border-left: 4px solid var(--rojo-primario);">
                        <p style="margin: 0; font-weight: 600; color: var(--rojo-primario);">
                            <i class="fas fa-comment-dots"></i> Motivo del Rechazo
                        </p>
                        ${cotizacion.motivo_rechazo ? `<p style="margin: 0.25rem 0 0 0; white-space: pre-wrap;">${escapeHtml(cotizacion.motivo_rechazo)}</p>` : ''}
                        ${cotizacion.comentarios_rechazo ? `<p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: var(--gris-texto);">${escapeHtml(cotizacion.comentarios_rechazo)}</p>` : ''}
                    </div>
                ` : ''}
                
                <!-- Historial de modificaciones -->
                ${informe.historial && informe.historial.length > 0 ? `
                    <div style="margin-top: 1rem;">
                        <details style="background: var(--gris-oscuro); border-radius: 8px; padding: 0.5rem;">
                            <summary style="cursor: pointer; font-weight: 600; font-size: 0.85rem;">
                                <i class="fas fa-history"></i> Historial de Modificaciones (${informe.historial.length})
                            </summary>
                            <div style="margin-top: 0.5rem; max-height: 150px; overflow-y: auto; font-size: 0.8rem;">
                                ${informe.historial.map((h, idx) => `
                                    <div style="padding: 0.25rem 0; border-bottom: 1px solid var(--border-color);">
                                        <span style="color: var(--gris-texto);">${formatDate(h.fecha)}</span>
                                        <span style="margin-left: 0.5rem;">${escapeHtml(h.comentario || 'Modificación de decisión')}</span>
                                        <span style="margin-left: 0.5rem; font-size: 0.7rem; color: var(--gris-texto);">
                                            (${h.servicios ? h.servicios.filter(s => s.aprobado).length : 0} aprobados)
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Configurar footer del modal
        const modalFooter = document.querySelector('#modalDetalleCotizacion .modal-footer');
        if (modalFooter) {
            modalFooter.innerHTML = '';
            
            const closeBtn = document.createElement('button');
            closeBtn.className = 'btn-secondary';
            closeBtn.innerHTML = '<i class="fas fa-times"></i> Cerrar';
            closeBtn.onclick = () => cerrarModal('modalDetalleCotizacion');
            modalFooter.appendChild(closeBtn);
            
            const printBtn = document.createElement('button');
            printBtn.className = 'btn-primary';
            printBtn.innerHTML = '<i class="fas fa-print"></i> Imprimir Informe';
            printBtn.onclick = () => imprimirInformeDecision(id_orden);
            modalFooter.appendChild(printBtn);
            
            if (cotizacion.id) {
                const pdfBtn = document.createElement('button');
                pdfBtn.className = 'btn-outline';
                pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Ver Cotización';
                pdfBtn.onclick = () => verDetalleCotizacion(cotizacion.id);
                modalFooter.appendChild(pdfBtn);
            }
        }
        
        abrirModal('modalDetalleCotizacion');
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al obtener el informe', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// IMPRIMIR INFORME DE DECISIÓN
// =====================================================

function imprimirInformeDecision(id_orden) {
    const content = document.getElementById('detalleCotizacionContainer');
    if (!content) return;
    
    const ventana = window.open('', '_blank');
    ventana.document.write(`
        <html>
            <head>
                <title>Informe de Decisión - FURIA MOTOR</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 0; padding: 20px; background: white; color: #1a1a1a; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #C1121F; padding-bottom: 15px; }
                    .header h1 { color: #C1121F; margin: 0; font-size: 1.5rem; }
                    .header p { margin: 5px 0 0 0; color: #666; font-size: 0.9rem; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th, td { padding: 8px 10px; border: 1px solid #ddd; text-align: left; }
                    th { background: #f5f5f5; font-weight: 600; }
                    .total-row { background: #f5f5f5; font-weight: 700; }
                    .badge-aprobado { display: inline-block; padding: 2px 10px; background: #10B981; color: white; border-radius: 12px; font-size: 0.7rem; }
                    .badge-rechazado { display: inline-block; padding: 2px 10px; background: #EF4444; color: white; border-radius: 12px; font-size: 0.7rem; }
                    .badge-pendiente { display: inline-block; padding: 2px 10px; background: #8E8E93; color: white; border-radius: 12px; font-size: 0.7rem; }
                    .resumen { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; }
                    .resumen-item { text-align: center; padding: 10px; background: #f5f5f5; border-radius: 8px; }
                    .resumen-item .label { font-size: 0.7rem; color: #666; text-transform: uppercase; }
                    .resumen-item .value { font-size: 1.2rem; font-weight: 700; }
                    .estado-badge { display: inline-block; padding: 4px 15px; border-radius: 20px; color: white; font-weight: 700; font-size: 0.8rem; }
                    .estado-aprobada { background: #10B981; }
                    .estado-parcial { background: #F59E0B; color: #1a1a1a; }
                    .estado-rechazada { background: #EF4444; }
                    .estado-pendiente { background: #8E8E93; }
                    .footer { margin-top: 30px; text-align: center; font-size: 0.7rem; color: #999; border-top: 1px solid #ddd; padding-top: 15px; }
                    .motivo { background: #fee2e2; padding: 10px; border-radius: 8px; margin: 10px 0; }
                    @media print {
                        .no-print { display: none; }
                        body { margin: 0; padding: 10px; }
                        .resumen-item { background: #f5f5f5; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>FURIA MOTOR COMPANY SRL</h1>
                    <p>Informe de Decisión del Cliente</p>
                    <p style="font-size: 0.8rem;">Fecha: ${new Date().toLocaleDateString('es-BO')}</p>
                </div>
                ${content.innerHTML}
                <div class="footer">
                    <p>Este informe es generado automáticamente por FURIA MOTOR COMPANY SRL</p>
                    <p>Documento válido para fines de seguimiento de la orden de trabajo</p>
                </div>
                <script>
                    window.onload = function() { window.print(); }
                <\/script>
            </body>
        </html>
    `);
    ventana.document.close();
}
// =====================================================
// EXPORTAR FUNCIONES GLOBALES
// =====================================================
// Agregar junto a las otras exportaciones
window.cargarPreviewFotoCompra = cargarPreviewFotoCompra;
window.abrirModalFotosSolicitud = abrirModalFotosSolicitud;
window.cerrarModalFotosSolicitud = cerrarModalFotosSolicitud;
window.descargarTodasFotosSolicitud = descargarTodasFotosSolicitud;
window.abrirModalFotosOrden = abrirModalFotosOrden;
window.cerrarModalFotosOrden = cerrarModalFotosOrden;
window.descargarTodasFotosOrden = descargarTodasFotosOrden;
window.copiarUrlsFotosOrden = copiarUrlsFotosOrden;
window.descargarDocumentoCotizacion = descargarDocumentoCotizacion;
window.verDetalleSolicitudCompra = verDetalleSolicitudCompra;
window.verComprobanteCompra = verComprobanteCompra;
window.descargarComprobante = descargarComprobante;
window.eliminarSolicitudCotizacion = eliminarSolicitudCotizacion;
window.abrirModalGenerarCotizacion = abrirModalGenerarCotizacion;
window.editarCotizacionExistente = editarCotizacionExistente;
window.verDetalleCotizacion = verDetalleCotizacion;
window.verDetalleCotizacionByOrden = verDetalleCotizacionByOrden;
window.cerrarModal = cerrarModal;
window.logout = logout;
window.agregarItemSolicitud = agregarItemSolicitud;
window.actualizarItemSolicitud = actualizarItemSolicitud;
window.eliminarItemSolicitud = eliminarItemSolicitud;
window.subirFotoItemSolicitud = subirFotoItemSolicitud;
window.eliminarFotoItemSolicitud = eliminarFotoItemSolicitud;
window.actualizarServicioCotizable = actualizarServicioCotizable;
window.agregarServicioCotizable = agregarServicioCotizable;
window.eliminarServicioCotizable = eliminarServicioCotizable;
window.reutilizarCotizacionRechazada = reutilizarCotizacionRechazada;
window.abrirModalIniciarReparacion = abrirModalIniciarReparacion;
window.confirmarIniciarReparacion = confirmarIniciarReparacion;
window.abrirModalNotificarArmado = abrirModalNotificarArmado;
window.confirmarNotificarArmado = confirmarNotificarArmado;
window.verAvanceReparacion = verAvanceReparacion;
window.verInstruccionesArmado = verInstruccionesArmado;
window.toggleServicioCotizable = toggleServicioCotizable;
window.abrirModalNuevaSolicitudCompraDirecta = abrirModalNuevaSolicitudCompraDirecta;
window.abrirModalCompraDesdeSolicitudTecnico = abrirModalCompraDesdeSolicitudTecnico;
window.agregarItemCompraDirecta = agregarItemCompraDirecta;
window.actualizarItemCompraDirecta = actualizarItemCompraDirecta;
window.eliminarItemCompraDirecta = eliminarItemCompraDirecta;
window.subirFotoItemCompra = subirFotoItemCompra;
window.eliminarFotoItemCompra = eliminarFotoItemCompra;
window.verificarDiasGuardados = verificarDiasGuardados;
// Agregar junto a las otras exportaciones
window.verInformeDecisionCliente = verInformeDecisionCliente;
window.imprimirInformeDecision = imprimirInformeDecision;

// 🆕 Exportar funciones de servicios
window.abrirModalSolicitudCotizacion = abrirModalSolicitudCotizacion;
window.toggleServicioAcordeon = toggleServicioAcordeon;
window.agregarItemServicio = agregarItemServicio;
window.actualizarItemServicio = actualizarItemServicio;
window.eliminarItemServicio = eliminarItemServicio;
window.subirFotoItemServicio = subirFotoItemServicio;
window.eliminarFotoItemServicio = eliminarFotoItemServicio;
window.guardarSolicitudCotizacion = guardarSolicitudCotizacion;

window.copiarUrlDrive = copiarUrlDrive;

console.log('✅ Funciones globales de cotizaciones.js exportadas correctamente');
document.addEventListener('DOMContentLoaded', inicializar);