// =====================================================
// PROVEEDORES.JS - ENCARGADO DE REPUESTOS
// FURIA MOTOR COMPANY SRL
// =====================================================

const API_URL = window.location.origin + '/api/encargado-repuestos';
let currentUser = null;
let proveedores = [];
let currentProveedorId = null;

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

// =====================================================
// CARGA DE DATOS
// =====================================================

async function cargarProveedores() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const estado = document.getElementById('filtroEstado')?.value || 'all';
        
        let url = `${API_URL}/proveedores`;
        const params = new URLSearchParams();
        if (estado !== 'all') params.append('estado', estado);
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            let proveedoresList = data.proveedores || [];
            
            if (search) {
                proveedoresList = proveedoresList.filter(p => 
                    (p.nombre || '').toLowerCase().includes(search) ||
                    (p.contacto || '').toLowerCase().includes(search) ||
                    (p.telefono || '').toLowerCase().includes(search) ||
                    (p.ruc || '').toLowerCase().includes(search)
                );
            }
            
            proveedores = proveedoresList;
            renderizarProveedores(proveedoresList);
        } else {
            showToast(data.error || 'Error al cargar proveedores', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarProveedores(proveedoresList) {
    const container = document.getElementById('proveedoresGrid');
    if (!container) return;
    
    if (proveedoresList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-truck"></i>
                <p>No hay proveedores registrados</p>
                <small>Haz clic en "Nuevo Proveedor" para comenzar</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = proveedoresList.map(proveedor => {
        const categorias = proveedor.categorias || [];
        const categoriasHtml = categorias.map(cat => `
            <span class="categoria-tag">${escapeHtml(cat)}</span>
        `).join('');
        
        return `
            <div class="proveedor-card" data-id="${proveedor.id}">
                <div class="proveedor-header">
                    <div class="proveedor-nombre">
                        <i class="fas fa-building"></i>
                        ${escapeHtml(proveedor.nombre)}
                    </div>
                    <span class="proveedor-estado estado-${proveedor.estado}">
                        ${proveedor.estado === 'activo' ? 'Activo' : 'Inactivo'}
                    </span>
                </div>
                <div class="proveedor-body">
                    <div class="proveedor-info">
                        ${proveedor.contacto ? `
                            <div class="info-item">
                                <i class="fas fa-user"></i>
                                <span>${escapeHtml(proveedor.contacto)} ${proveedor.cargo ? `(${escapeHtml(proveedor.cargo)})` : ''}</span>
                            </div>
                        ` : ''}
                        <div class="info-item">
                            <i class="fas fa-phone"></i>
                            <span>${escapeHtml(proveedor.telefono)} ${proveedor.telefono2 ? `/ ${escapeHtml(proveedor.telefono2)}` : ''}</span>
                        </div>
                        ${proveedor.email ? `
                            <div class="info-item">
                                <i class="fas fa-envelope"></i>
                                <span><a href="mailto:${escapeHtml(proveedor.email)}">${escapeHtml(proveedor.email)}</a></span>
                            </div>
                        ` : ''}
                        ${proveedor.ruc ? `
                            <div class="info-item">
                                <i class="fas fa-id-card"></i>
                                <span>RUC: ${escapeHtml(proveedor.ruc)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${categoriasHtml ? `
                        <div class="categorias-list">
                            ${categoriasHtml}
                        </div>
                    ` : ''}
                    
                    <div class="proveedor-actions">
                        <button class="action-btn view" onclick="verDetalle(${proveedor.id})" title="Ver Detalle">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="action-btn edit" onclick="editarProveedor(${proveedor.id})" title="Editar">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="action-btn delete" onclick="confirmarEliminarModal(${proveedor.id}, '${escapeHtml(proveedor.nombre)}')" title="Eliminar">
                            <i class="fas fa-trash-alt"></i> Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// CRUD DE PROVEEDORES
// =====================================================

function limpiarFormulario() {
    document.getElementById('proveedorId').value = '';
    document.getElementById('nombre').value = '';
    document.getElementById('ruc').value = '';
    document.getElementById('contacto').value = '';
    document.getElementById('cargo').value = '';
    document.getElementById('telefono').value = '';
    document.getElementById('telefono2').value = '';
    document.getElementById('email').value = '';
    document.getElementById('website').value = '';
    document.getElementById('direccion').value = '';
    document.getElementById('categorias').value = '';
    document.getElementById('estado').value = 'activo';
    document.getElementById('notas').value = '';
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-truck"></i> Nuevo Proveedor';
}

function abrirNuevoProveedor() {
    limpiarFormulario();
    abrirModal('modalProveedor');
}

async function editarProveedor(id) {
    const proveedor = proveedores.find(p => p.id === id);
    if (!proveedor) return;
    
    document.getElementById('proveedorId').value = proveedor.id;
    document.getElementById('nombre').value = proveedor.nombre || '';
    document.getElementById('ruc').value = proveedor.ruc || '';
    document.getElementById('contacto').value = proveedor.contacto || '';
    document.getElementById('cargo').value = proveedor.cargo || '';
    document.getElementById('telefono').value = proveedor.telefono || '';
    document.getElementById('telefono2').value = proveedor.telefono2 || '';
    document.getElementById('email').value = proveedor.email || '';
    document.getElementById('website').value = proveedor.website || '';
    document.getElementById('direccion').value = proveedor.direccion || '';
    document.getElementById('estado').value = proveedor.estado || 'activo';
    document.getElementById('notas').value = proveedor.notas || '';
    
    // Seleccionar categorías
    const categoriasSelect = document.getElementById('categorias');
    const categoriasProveedor = proveedor.categorias || [];
    for (let option of categoriasSelect.options) {
        option.selected = categoriasProveedor.includes(option.value);
    }
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Proveedor';
    abrirModal('modalProveedor');
}

async function guardarProveedor(event) {
    event.preventDefault();
    
    const id = document.getElementById('proveedorId').value;
    const categoriasSelect = document.getElementById('categorias');
    const categorias = Array.from(categoriasSelect.selectedOptions).map(opt => opt.value);
    
    const proveedorData = {
        nombre: document.getElementById('nombre').value,
        ruc: document.getElementById('ruc').value,
        contacto: document.getElementById('contacto').value,
        cargo: document.getElementById('cargo').value,
        telefono: document.getElementById('telefono').value,
        telefono2: document.getElementById('telefono2').value,
        email: document.getElementById('email').value,
        website: document.getElementById('website').value,
        direccion: document.getElementById('direccion').value,
        categorias: categorias,
        estado: document.getElementById('estado').value,
        notas: document.getElementById('notas').value
    };
    
    mostrarLoading(true);
    
    try {
        let url = `${API_URL}/proveedores`;
        let method = 'POST';
        
        if (id) {
            url = `${API_URL}/proveedores/${id}`;
            method = 'PUT';
        }
        
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(proveedorData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(id ? 'Proveedor actualizado' : 'Proveedor creado', 'success');
            cerrarModal('modalProveedor');
            await cargarProveedores();
        } else {
            showToast(data.error || 'Error al guardar proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

let proveedorAEliminar = null;

function confirmarEliminarModal(id, nombre) {
    proveedorAEliminar = id;
    document.getElementById('proveedorNombreEliminar').innerHTML = `<strong>${escapeHtml(nombre)}</strong>`;
    abrirModal('modalEliminar');
}

async function confirmarEliminar() {
    if (!proveedorAEliminar) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/proveedores/${proveedorAEliminar}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Proveedor eliminado', 'success');
            cerrarModal('modalEliminar');
            proveedorAEliminar = null;
            await cargarProveedores();
        } else {
            showToast(data.error || 'Error al eliminar proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE
// =====================================================

let currentDetalleId = null;

async function verDetalle(id) {
    const proveedor = proveedores.find(p => p.id === id);
    if (!proveedor) return;
    
    currentDetalleId = id;
    
    const categorias = proveedor.categorias || [];
    const categoriasHtml = categorias.map(cat => `
        <span class="categoria-tag">${escapeHtml(cat)}</span>
    `).join('');
    
    const modalBody = document.getElementById('modalDetalleBody');
    modalBody.innerHTML = `
        <div class="detalle-grid">
            <div class="detalle-item">
                <label>Nombre</label>
                <p><strong>${escapeHtml(proveedor.nombre)}</strong></p>
            </div>
            <div class="detalle-item">
                <label>RUC/NIT</label>
                <p>${escapeHtml(proveedor.ruc) || '-'}</p>
            </div>
            <div class="detalle-item">
                <label>Contacto</label>
                <p>${escapeHtml(proveedor.contacto) || '-'} ${proveedor.cargo ? `(${escapeHtml(proveedor.cargo)})` : ''}</p>
            </div>
            <div class="detalle-item">
                <label>Teléfono</label>
                <p>${escapeHtml(proveedor.telefono)} ${proveedor.telefono2 ? `/ ${escapeHtml(proveedor.telefono2)}` : ''}</p>
            </div>
            <div class="detalle-item">
                <label>Email</label>
                <p>${proveedor.email ? `<a href="mailto:${escapeHtml(proveedor.email)}">${escapeHtml(proveedor.email)}</a>` : '-'}</p>
            </div>
            <div class="detalle-item">
                <label>Sitio Web</label>
                <p>${proveedor.website ? `<a href="${escapeHtml(proveedor.website)}" target="_blank">${escapeHtml(proveedor.website)}</a>` : '-'}</p>
            </div>
            <div class="detalle-item">
                <label>Dirección</label>
                <p>${escapeHtml(proveedor.direccion) || '-'}</p>
            </div>
            <div class="detalle-item">
                <label>Estado</label>
                <p><span class="proveedor-estado estado-${proveedor.estado}">${proveedor.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></p>
            </div>
            <div class="detalle-item detalle-categorias">
                <label>Categorías</label>
                <div class="categorias-list">${categoriasHtml || '-'}</div>
            </div>
            <div class="detalle-item detalle-categorias">
                <label>Notas</label>
                <p>${escapeHtml(proveedor.notas) || '-'}</p>
            </div>
            <div class="detalle-item">
                <label>Fecha creación</label>
                <p>${formatDate(proveedor.created_at)}</p>
            </div>
            <div class="detalle-item">
                <label>Última actualización</label>
                <p>${formatDate(proveedor.updated_at)}</p>
            </div>
        </div>
    `;
    
    abrirModal('modalDetalle');
}

function editarDesdeDetalle() {
    if (currentDetalleId) {
        cerrarModal('modalDetalle');
        editarProveedor(currentDetalleId);
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
            window.location.href = '/';
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
                window.location.href = '/';
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
        window.location.href = '/';
        return null;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarProveedores();
            showToast('Actualizando...', 'info');
        });
    }
    
    const btnNuevo = document.getElementById('btnNuevoProveedor');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', abrirNuevoProveedor);
    }
    
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarProveedores());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => cargarProveedores());
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

async function inicializar() {
    console.log('🚀 Inicializando proveedores.js');
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    await cargarProveedores();
    setupEventListeners();
    
    console.log('✅ proveedores.js inicializado correctamente');
}

// Exponer funciones globales
window.verDetalle = verDetalle;
window.editarProveedor = editarProveedor;
window.guardarProveedor = guardarProveedor;
window.confirmarEliminarModal = confirmarEliminarModal;
window.confirmarEliminar = confirmarEliminar;
window.editarDesdeDetalle = editarDesdeDetalle;
window.cerrarModal = cerrarModal;
window.abrirNuevoProveedor = abrirNuevoProveedor;

document.addEventListener('DOMContentLoaded', inicializar);