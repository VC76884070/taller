// =====================================================
// PROVEEDORES.JS - ENCARGADO DE REPUESTOS
// VERSIÓN FINAL CORREGIDA - USA window.API_BASE_URL
// FURIA MOTOR COMPANY SRL
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - USA LA VARIABLE GLOBAL
// =====================================================
// NOTA: window.API_BASE_URL ya está declarada en include.js
// No declarar const API_BASE_URL aquí

const API_URL = `${window.API_BASE_URL}/api/encargado-repuestos`;

// Variables globales
let currentUser = null;
let currentUserRoles = [];
let proveedores = [];
let categoriasDisponibles = [];
let currentProveedorId = null;
let proveedorAEliminar = null;

// Bandera para evitar envíos duplicados
let isSubmitting = false;
let isInitialized = false;

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
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = mostrar ? 'flex' : 'none';
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// =====================================================
// CARGAR CATEGORÍAS
// =====================================================

async function cargarCategorias() {
    try {
        const response = await fetch(`${API_URL}/proveedores/categorias`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.success) {
            categoriasDisponibles = data.categorias || [];
            actualizarSelectCategorias();
        } else {
            console.error('Error cargando categorías:', data.error);
        }
    } catch (error) {
        console.error('Error cargando categorías:', error);
    }
}

function actualizarSelectCategorias() {
    const filtroCategoria = document.getElementById('filtroCategoria');
    if (filtroCategoria) {
        filtroCategoria.innerHTML = '<option value="all">Todas las categorías</option>' +
            categoriasDisponibles.map(c => `<option value="${c.id}">${escapeHtml(c.nombre_filtro)}</option>`).join('');
    }
    
    const selectForm = document.getElementById('id_filtro');
    if (selectForm) {
        selectForm.innerHTML = '<option value="">Seleccionar categoría</option>' +
            categoriasDisponibles.map(c => `<option value="${c.id}">${escapeHtml(c.nombre_filtro)}</option>`).join('');
    }
}

// =====================================================
// CARGAR PROVEEDORES
// =====================================================

async function cargarProveedores() {
    mostrarLoading(true);
    
    try {
        const search = document.getElementById('searchInput')?.value || '';
        const categoria = document.getElementById('filtroCategoria')?.value || 'all';
        
        let url = `${API_URL}/proveedores`;
        const params = new URLSearchParams();
        
        if (search) params.append('search', search);
        if (categoria !== 'all') params.append('categoria', categoria);
        
        if (params.toString()) url += `?${params.toString()}`;
        
        const response = await fetch(url, { headers: getAuthHeaders() });
        
        if (response.status === 401) {
            showToast('Sesión expirada, redirigiendo...', 'warning');
            setTimeout(() => { window.location.href = `${window.API_BASE_URL}/`; }, 1500);
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            proveedores = data.proveedores || [];
            renderizarProveedores(proveedores);
            
            if (data.categorias && data.categorias.length > 0) {
                categoriasDisponibles = data.categorias;
                actualizarSelectCategorias();
            }
        } else {
            showToast(data.error || 'Error al cargar proveedores', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
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
                <i class="fas fa-truck fa-3x"></i>
                <p>No hay proveedores registrados</p>
                <small>Haz clic en "Nuevo Proveedor" para comenzar</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = proveedoresList.map((proveedor, index) => {
        const tieneInfo = proveedor.propietario || proveedor.ubicacion_gps || proveedor.categoria;
        
        return `
            <div class="proveedor-card" data-id="${proveedor.id}" style="animation-delay: ${Math.min(index * 0.05, 0.5)}s">
                <div class="proveedor-header">
                    <div class="proveedor-nombre">
                        <i class="fas fa-building"></i>
                        ${escapeHtml(proveedor.nombre)}
                    </div>
                </div>
                <div class="proveedor-body">
                    <div class="proveedor-info">
                        ${proveedor.propietario ? `
                            <div class="info-item">
                                <i class="fas fa-user"></i>
                                <span>${escapeHtml(proveedor.propietario)}</span>
                            </div>
                        ` : ''}
                        <div class="info-item">
                            <i class="fas fa-phone"></i>
                            <span>${escapeHtml(proveedor.telefono)}</span>
                        </div>
                        ${proveedor.categoria ? `
                            <div class="info-item">
                                <i class="fas fa-tag"></i>
                                <span><span class="categoria-tag">${escapeHtml(proveedor.categoria)}</span></span>
                            </div>
                        ` : ''}
                        ${proveedor.ubicacion_gps ? `
                            <div class="info-item">
                                <i class="fas fa-map-marker-alt"></i>
                                <span title="${escapeHtml(proveedor.ubicacion_gps)}">${escapeHtml(proveedor.ubicacion_gps.length > 30 ? proveedor.ubicacion_gps.substring(0, 30) + '...' : proveedor.ubicacion_gps)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${!tieneInfo ? `
                        <div class="info-item" style="justify-content: center; color: var(--gris-texto);">
                            <i class="fas fa-info-circle"></i>
                            <span>Sin información adicional</span>
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
    document.getElementById('propietario').value = '';
    document.getElementById('telefono').value = '';
    document.getElementById('ubicacion_gps').value = '';
    document.getElementById('id_filtro').value = '';
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-truck"></i> Nuevo Proveedor';
}

function abrirNuevoProveedor() {
    limpiarFormulario();
    abrirModal('modalProveedor');
    setTimeout(() => { document.getElementById('nombre')?.focus(); }, 100);
}

async function editarProveedor(id) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/proveedores/${id}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success && data.proveedor) {
            const proveedor = data.proveedor;
            
            document.getElementById('proveedorId').value = proveedor.id;
            document.getElementById('nombre').value = proveedor.nombre || '';
            document.getElementById('propietario').value = proveedor.propietario || '';
            document.getElementById('telefono').value = proveedor.telefono || '';
            document.getElementById('ubicacion_gps').value = proveedor.ubicacion_gps || '';
            document.getElementById('id_filtro').value = proveedor.id_filtro || '';
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Proveedor';
            abrirModal('modalProveedor');
        } else {
            showToast('No se encontró el proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar el proveedor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// GUARDAR PROVEEDOR - CORREGIDO (SIN DOBLE ENVÍO)
// =====================================================

async function guardarProveedor(event) {
    // Prevenir comportamiento por defecto
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Evitar envíos duplicados
    if (isSubmitting) {
        console.log('⏳ Ya hay un envío en proceso, ignorando...');
        return;
    }
    
    isSubmitting = true;
    
    // Deshabilitar botón de submit
    const submitBtn = document.querySelector('#proveedorForm .btn-primary');
    let originalBtnText = '';
    if (submitBtn) {
        originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }
    
    try {
        const id = document.getElementById('proveedorId').value;
        const nombre = document.getElementById('nombre').value.trim();
        const telefono = document.getElementById('telefono').value.trim();
        const propietario = document.getElementById('propietario').value.trim();
        const ubicacion_gps = document.getElementById('ubicacion_gps').value.trim();
        const id_filtro = document.getElementById('id_filtro').value;
        
        // Validaciones
        if (!nombre) {
            showToast('El nombre del proveedor es requerido', 'error');
            document.getElementById('nombre').focus();
            return;
        }
        
        if (!telefono) {
            showToast('El teléfono es requerido', 'error');
            document.getElementById('telefono').focus();
            return;
        }
        
        const proveedorData = {
            nombre: nombre,
            telefono: telefono,
            propietario: propietario || null,
            ubicacion_gps: ubicacion_gps || null,
            id_filtro: id_filtro || null
        };
        
        mostrarLoading(true);
        
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
            showToast(id ? '✅ Proveedor actualizado' : '✅ Proveedor creado', 'success');
            cerrarModal('modalProveedor');
            await cargarProveedores();
        } else {
            showToast(data.error || 'Error al guardar proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
        isSubmitting = false;
        
        // Rehabilitar botón
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

// =====================================================
// ELIMINAR PROVEEDOR
// =====================================================

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
            showToast('✅ Proveedor eliminado exitosamente', 'success');
            cerrarModal('modalEliminar');
            proveedorAEliminar = null;
            await cargarProveedores();
        } else {
            showToast(data.error || 'Error al eliminar proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =====================================================
// VER DETALLE
// =====================================================

let currentDetalleId = null;

async function verDetalle(id) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/proveedores/${id}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.success && data.proveedor) {
            const p = data.proveedor;
            currentDetalleId = p.id;
            
            const modalBody = document.getElementById('modalDetalleBody');
            modalBody.innerHTML = `
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <label><i class="fas fa-building"></i> Nombre</label>
                        <p><strong>${escapeHtml(p.nombre)}</strong></p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-user"></i> Propietario</label>
                        <p>${escapeHtml(p.propietario) || '-'}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-phone"></i> Teléfono</label>
                        <p>${escapeHtml(p.telefono)}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-tag"></i> Categoría</label>
                        <p>${p.categoria ? `<span class="categoria-tag">${escapeHtml(p.categoria)}</span>` : '-'}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-map-marker-alt"></i> Ubicación GPS</label>
                        <p>${escapeHtml(p.ubicacion_gps) || '-'}</p>
                    </div>
                    <div class="detalle-item">
                        <label><i class="fas fa-id-card"></i> ID</label>
                        <p>#${p.id}</p>
                    </div>
                </div>
            `;
            
            abrirModal('modalDetalle');
        } else {
            showToast('No se encontró el proveedor', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar el detalle', 'error');
    } finally {
        mostrarLoading(false);
    }
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
            window.location.href = `${window.API_BASE_URL}/`;
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
        
        currentUserRoles = currentUser.roles || (currentUser.rol_principal ? [currentUser.rol_principal] : []);
        
        const tieneRolRepuestos = currentUserRoles.some(r => 
            r === 'encargado_repuestos' || r === 'encargado_rep_almacen'
        );
        
        if (!tieneRolRepuestos) {
            showToast('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => { window.location.href = `${window.API_BASE_URL}/`; }, 2000);
            return null;
        }
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        console.log('✅ Usuario autenticado:', currentUser.nombre);
        return currentUser;
        
    } catch (error) {
        console.error('Error:', error);
        window.location.href = `${window.API_BASE_URL}/`;
        return null;
    }
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

function agregarFiltroCategoria() {
    const filtrosBar = document.querySelector('.filtros-bar');
    if (!filtrosBar) return;
    if (document.getElementById('filtroCategoria')) return;
    
    const searchBox = filtrosBar.querySelector('.search-box');
    if (searchBox) {
        const selectHTML = `
            <select id="filtroCategoria" style="min-width: 180px; padding: 0.5rem 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--gris-oscuro); color: var(--blanco);">
                <option value="all">Todas las categorías</option>
            </select>
        `;
        searchBox.insertAdjacentHTML('afterend', selectHTML);
    }
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            cargarProveedores();
            cargarCategorias();
            showToast('Actualizando lista...', 'info');
        });
    }
    
    const btnNuevo = document.getElementById('btnNuevoProveedor');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', abrirNuevoProveedor);
    }
    
    const filtroCategoria = document.getElementById('filtroCategoria');
    if (filtroCategoria) {
        filtroCategoria.addEventListener('change', () => cargarProveedores());
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(() => cargarProveedores(), 500);
        searchInput.addEventListener('input', debouncedSearch);
    }
    
    // IMPORTANTE: Configurar el formulario sin duplicados
    const proveedorForm = document.getElementById('proveedorForm');
    if (proveedorForm) {
        // Eliminar cualquier listener anterior y agregar uno nuevo
        proveedorForm.removeEventListener('submit', guardarProveedor);
        proveedorForm.addEventListener('submit', guardarProveedor);
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModal(modal.id);
        });
    });
}

async function inicializar() {
    if (isInitialized) {
        console.log('⚠️ Ya inicializado');
        return;
    }
    
    console.log('🚀 Inicializando proveedores.js');
    console.log('📡 window.API_BASE_URL:', window.API_BASE_URL);
    
    const user = await cargarUsuarioActual();
    if (!user) return;
    
    agregarFiltroCategoria();
    
    await cargarCategorias();
    await cargarProveedores();
    
    setupEventListeners();
    
    isInitialized = true;
    console.log('✅ proveedores.js inicializado correctamente');
}

// =====================================================
// EXPORTAR FUNCIONES GLOBALES
// =====================================================

window.verDetalle = verDetalle;
window.editarProveedor = editarProveedor;
window.guardarProveedor = guardarProveedor;
window.confirmarEliminarModal = confirmarEliminarModal;
window.confirmarEliminar = confirmarEliminar;
window.editarDesdeDetalle = editarDesdeDetalle;
window.cerrarModal = cerrarModal;
window.abrirNuevoProveedor = abrirNuevoProveedor;

// Inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}

console.log('✅ proveedores.js cargado correctamente');