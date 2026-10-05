// =====================================================
// ADMINISTRACIÓN DE ROLES - JEFE TALLER (COMPLETO)
// FURIA MOTOR COMPANY SRL
// VERSIÓN: Personal + Clientes + Vehículos (CRUD completo)
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API - USA VARIABLE GLOBAL
// =====================================================
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 admin_roles.js - Modo DESARROLLO (fallback)');
            return 'http://localhost:5000';
        }
        console.log('📡 admin_roles.js - Modo PRODUCCIÓN (fallback)');
        return '';
    })();
}

// Endpoint correcto para jefe-taller
const API_URL = `${window.API_BASE_URL}/api/jefe-taller`;

// =====================================================
// VARIABLES GLOBALES
// =====================================================
let usuariosData = [];
let clientesData = [];
let vehiculosData = [];        // NUEVO
let rolesData = [];
let usuarioSeleccionado = null;
let currentUserRoles = [];
let currentUserInfo = null;
let asignacionesActivas = [];
let personalDisponible = [];
let accionEliminarPendiente = null;   // NUEVO

// IDs de roles críticos (deben coincidir con los del backend)
const ROLES_CRITICOS = {
    tecnico: 3,
    encargado_repuestos: 4
};

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando admin_roles.js');
    console.log('📡 API_URL:', API_URL);

    const autenticado = await checkAuth();
    if (!autenticado) return;

    initPage();
    await cargarRoles();
    await cargarUsuarios();
    await cargarClientes();
    await cargarVehiculos();       // NUEVO
    await cargarEstadisticas();
    setupEventListeners();

    cambiarPestana('personal');
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userData = localStorage.getItem('furia_user');

    if (!token) {
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUserInfo = payload.user;

        if (currentUserInfo && currentUserInfo.roles && Array.isArray(currentUserInfo.roles)) {
            currentUserRoles = currentUserInfo.roles;
        } else if (userData) {
            const user = JSON.parse(userData);
            currentUserRoles = user.roles || [];
            if (currentUserInfo) currentUserInfo.roles = currentUserRoles;
        }

        const esJefeTaller = currentUserRoles.includes('jefe_taller');

        if (!esJefeTaller) {
            mostrarNotificacion('No tienes permisos para acceder a esta sección', 'error');
            setTimeout(() => {
                window.location.href = window.API_BASE_URL + '/jefe_taller/dashboard.html';
            }, 2000);
            return false;
        }

        return true;

    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
}

function initPage() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);

    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }

    const userNameElement = document.getElementById('userNombre');
    if (userNameElement && currentUserInfo) {
        userNameElement.textContent = currentUserInfo.nombre || 'Jefe Taller';
    }
}

function setupEventListeners() {
    // Filtro personal
    const searchPersonal = document.getElementById('searchPersonal');
    if (searchPersonal) {
        searchPersonal.addEventListener('input', () => filtrarPersonal());
    }

    // Filtro clientes
    const searchClientes = document.getElementById('searchClientes');
    if (searchClientes) {
        searchClientes.addEventListener('input', () => filtrarClientes());
    }

    // Filtro vehículos (NUEVO)
    const searchVehiculos = document.getElementById('searchVehiculos');
    if (searchVehiculos) {
        searchVehiculos.addEventListener('input', () => filtrarVehiculos());
    }

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => cambiarPestana(btn.dataset.tab));
    });

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

function cambiarPestana(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${tabId}`);
    });
}

function logout() {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    window.location.href = window.API_BASE_URL + '/';
}

// =====================================================
// API CALLS
// =====================================================
function getAuthHeaders() {
    const token = localStorage.getItem('furia_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

async function cargarRoles() {
    try {
        const response = await fetch(`${API_URL}/roles`, { headers: getAuthHeaders() });
        if (response.status === 401) { logout(); return; }

        const data = await response.json();
        if (response.ok && data.success) {
            rolesData = data.roles;
            console.log('✅ Roles cargados:', rolesData);
        } else {
            throw new Error(data.error || 'Error cargando roles');
        }
    } catch (error) {
        console.error('Error cargando roles:', error);
        mostrarNotificacion('Error al cargar los roles', 'error');
    }
}

async function cargarUsuarios() {
    try {
        const response = await fetch(`${API_URL}/usuarios`, { headers: getAuthHeaders() });
        if (response.status === 401) { logout(); return; }

        const data = await response.json();
        if (response.ok && data.success) {
            usuariosData = data.usuarios;
            console.log('✅ Usuarios de personal cargados:', usuariosData.length);
            renderPersonalTable(usuariosData);
            actualizarEstadisticasPersonal();
        } else {
            throw new Error(data.error || 'Error cargando usuarios');
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        mostrarNotificacion('Error al cargar los usuarios', 'error');
        const tbody = document.getElementById('personalTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-row"><i class="fas fa-exclamation-circle"></i> Error al cargar usuarios</td></tr>`;
        }
    }
}

async function cargarClientes() {
    try {
        const response = await fetch(`${API_URL}/clientes`, { headers: getAuthHeaders() });
        if (response.status === 401) { logout(); return; }

        const data = await response.json();
        if (response.ok && data.success) {
            clientesData = data.clientes;
            console.log('✅ Clientes cargados:', clientesData.length);
            renderClientesGrid(clientesData);
            const totalClientesSpan = document.getElementById('totalClientes');
            if (totalClientesSpan) totalClientesSpan.textContent = clientesData.length;
        } else {
            throw new Error(data.error || 'Error cargando clientes');
        }
    } catch (error) {
        console.error('Error cargando clientes:', error);
        mostrarNotificacion('Error al cargar los clientes', 'error');
        const grid = document.getElementById('clientesGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state-cards">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar clientes</p>
                </div>
            `;
        }
    }
}

// NUEVO: Cargar vehículos
async function cargarVehiculos() {
    try {
        const response = await fetch(`${API_URL}/vehiculos`, { headers: getAuthHeaders() });
        if (response.status === 401) { logout(); return; }

        const data = await response.json();
        if (response.ok && data.success) {
            vehiculosData = data.vehiculos;
            console.log('✅ Vehículos cargados:', vehiculosData.length);
            renderVehiculosGrid(vehiculosData);
            const totalV = document.getElementById('totalVehiculos');
            if (totalV) totalV.textContent = vehiculosData.length;
        } else {
            throw new Error(data.error || 'Error cargando vehículos');
        }
    } catch (error) {
        console.error('Error cargando vehículos:', error);
        mostrarNotificacion('Error al cargar los vehículos', 'error');
        const grid = document.getElementById('vehiculosGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state-cards">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar vehículos</p>
                </div>
            `;
        }
    }
}

async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_URL}/estadisticas`, { headers: getAuthHeaders() });
        if (response.status === 401) { logout(); return; }

        const data = await response.json();
        if (response.ok && data.success) {
            const stats = data.estadisticas;

            document.getElementById('totalPersonal').textContent = stats.total_usuarios || 0;
            document.getElementById('totalClientes').textContent = clientesData.length || 0;

            for (const rol of stats.usuarios_por_rol) {
                const rolNombre = rol.rol_nombre;
                const cantidad = rol.cantidad;

                if (rolNombre === 'jefe_operativo') {
                    const elem = document.getElementById('totalJefeOperativo');
                    if (elem) elem.textContent = cantidad;
                } else if (rolNombre === 'jefe_taller') {
                    const elem = document.getElementById('totalJefeTaller');
                    if (elem) elem.textContent = cantidad;
                } else if (rolNombre === 'tecnico') {
                    const elem = document.getElementById('totalTecnico');
                    if (elem) elem.textContent = cantidad;
                } else if (rolNombre === 'encargado_repuestos') {
                    const elem = document.getElementById('totalRepuestos');
                    if (elem) elem.textContent = cantidad;
                }
            }
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

async function cargarPersonalDisponible(rolNombre, excluirUsuarioId = null) {
    try {
        let filtrados = usuariosData.filter(u => {
            const tieneRol = u.roles_nombres && u.roles_nombres.includes(rolNombre);
            const noEsElMismo = excluirUsuarioId ? u.id !== excluirUsuarioId : true;
            return tieneRol && noEsElMismo;
        });

        if (rolNombre === 'tecnico') {
            for (let i = 0; i < filtrados.length; i++) {
                const ordenesActivas = await contarOrdenesActivasTecnico(filtrados[i].id);
                filtrados[i].ordenes_activas = ordenesActivas;
                filtrados[i].disponible = ordenesActivas < 2;
            }
            filtrados.sort((a, b) => (b.disponible ? 1 : 0) - (a.disponible ? 1 : 0));
        }

        personalDisponible = filtrados;
        return personalDisponible;
    } catch (error) {
        console.error('Error cargando personal disponible:', error);
        return [];
    }
}

async function contarOrdenesActivasTecnico(tecnicoId) {
    try {
        const response = await fetch(`${API_URL}/tecnico/${tecnicoId}/ordenes-activas`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok && data.success) {
            return data.total;
        }
        return 0;
    } catch (error) {
        console.error('Error contando órdenes activas:', error);
        return 0;
    }
}

async function cargarAsignacionesActivas(usuarioId) {
    try {
        const response = await fetch(`${API_URL}/usuario/${usuarioId}/asignaciones-activas`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok && data.success) {
            asignacionesActivas = data.asignaciones;
            return data;
        }
        return { tiene_asignaciones: false, asignaciones: [] };
    } catch (error) {
        console.error('Error cargando asignaciones activas:', error);
        return { tiene_asignaciones: false, asignaciones: [] };
    }
}

// =====================================================
// RENDER - PERSONAL
// =====================================================
function renderPersonalTable(usuarios) {
    const tbody = document.getElementById('personalTableBody');
    if (!tbody) return;

    if (usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-row">No hay usuarios de personal registrados</td></tr>`;
        return;
    }

    tbody.innerHTML = usuarios.map(usuario => `
        <tr data-id="${usuario.id}">
            <td>${usuario.id}</td>
            <td><strong>${escapeHtml(usuario.nombre)}</strong></td>
            <td>${escapeHtml(usuario.email || '-')}</td>
            <td>${escapeHtml(usuario.documento || '-')}</td>
            <td>
                <div class="roles-badge">
                    ${usuario.roles_nombres && usuario.roles_nombres.length > 0
                        ? usuario.roles_nombres.map(rol => `<span class="role-tag ${rol.replace('_', '-')}">${formatRolName(rol)}</span>`).join('')
                        : '<span class="no-roles">Sin roles asignados</span>'}
                </div>
            </td>
            <td class="action-buttons">
                <button class="action-btn view" onclick="verDetalleUsuario(${usuario.id})" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn edit" onclick="abrirModalRoles(${usuario.id})" title="Editar roles">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="eliminarUsuario(${usuario.id})" title="Eliminar usuario">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function actualizarEstadisticasPersonal() {
    let jefeOperativo = 0, jefeTaller = 0, tecnico = 0, repuestos = 0;

    usuariosData.forEach(u => {
        if (u.roles_nombres) {
            if (u.roles_nombres.includes('jefe_operativo')) jefeOperativo++;
            if (u.roles_nombres.includes('jefe_taller')) jefeTaller++;
            if (u.roles_nombres.includes('tecnico')) tecnico++;
            if (u.roles_nombres.includes('encargado_repuestos')) repuestos++;
        }
    });

    document.getElementById('totalJefeOperativo').textContent = jefeOperativo;
    document.getElementById('totalJefeTaller').textContent = jefeTaller;
    document.getElementById('totalTecnico').textContent = tecnico;
    document.getElementById('totalRepuestos').textContent = repuestos;
    document.getElementById('totalPersonal').textContent = usuariosData.length;
}

function filtrarPersonal() {
    const searchTerm = document.getElementById('searchPersonal')?.value.toLowerCase() || '';

    if (!searchTerm) {
        renderPersonalTable(usuariosData);
        return;
    }

    const filtrados = usuariosData.filter(u =>
        u.nombre.toLowerCase().includes(searchTerm) ||
        (u.email && u.email.toLowerCase().includes(searchTerm)) ||
        (u.documento && u.documento.includes(searchTerm))
    );

    renderPersonalTable(filtrados);
}

// =====================================================
// RENDER - CLIENTES
// =====================================================
function renderClientesGrid(clientes) {
    const grid = document.getElementById('clientesGrid');
    if (!grid) return;

    if (!clientes || clientes.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-cards">
                <i class="fas fa-user-friends"></i>
                <p>No hay clientes registrados</p>
            </div>
        `;
        return;
    }

    const getInitials = (nombre) => {
        if (!nombre) return '?';
        return nombre.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getAvatarColor = (nombre) => {
        const colors = ['#C1121F', '#1E3A5F', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
        let hash = 0;
        for (let i = 0; i < nombre.length; i++) {
            hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    grid.innerHTML = clientes.map(cliente => `
        <div class="cliente-card" data-id="${cliente.id}">
            <div class="cliente-card-header">
                <div class="cliente-avatar" style="background: linear-gradient(135deg, ${getAvatarColor(cliente.nombre)}, ${getAvatarColor(cliente.nombre)}dd)">
                    ${cliente.nombre ? getInitials(cliente.nombre) : '<i class="fas fa-user"></i>'}
                </div>
                <div class="cliente-info-header">
                    <h4 class="cliente-nombre">${escapeHtml(cliente.nombre)}</h4>
                    <div class="cliente-email">
                        <i class="fas fa-envelope"></i>
                        <span>${escapeHtml(cliente.email || 'Email no registrado')}</span>
                    </div>
                </div>
            </div>
            <div class="cliente-card-body">
                <div class="cliente-info-item">
                    <i class="fas fa-phone"></i>
                    <span class="label">Teléfono</span>
                    <span class="value">${escapeHtml(cliente.contacto || 'No registrado')}</span>
                </div>
                <div class="cliente-info-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <span class="label">Ubicación</span>
                    <span class="value">${escapeHtml(cliente.ubicacion || 'No registrada')}</span>
                </div>
                <div class="vehiculos-preview">
                    <div class="vehiculos-title">
                        <i class="fas fa-car"></i>
                        <span>Vehículos (${cliente.vehiculos?.length || 0})</span>
                    </div>
                    <div class="vehiculos-list-mini">
                        ${cliente.vehiculos && cliente.vehiculos.length > 0
                            ? cliente.vehiculos.slice(0, 2).map(v => `
                                <span class="vehiculo-mini">
                                    <i class="fas fa-tag"></i>
                                    ${escapeHtml(v.placa)}
                                </span>
                            `).join('') + (cliente.vehiculos.length > 2 ?
                                `<span class="vehiculo-mini">+${cliente.vehiculos.length - 2} más</span>` : '')
                            : '<span class="no-vehiculos-badge"><i class="fas fa-car-side"></i> Sin vehículos</span>'}
                    </div>
                </div>
            </div>
            <div class="cliente-card-footer">
                <button class="action-btn view" onclick="verDetalleCliente(${cliente.id})" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn edit" onclick="abrirModalEditarCliente(${cliente.id})" title="Editar cliente">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="eliminarCliente(${cliente.id})" title="Eliminar cliente">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function filtrarClientes() {
    const searchTerm = document.getElementById('searchClientes')?.value.toLowerCase() || '';

    if (!searchTerm) {
        renderClientesGrid(clientesData);
        return;
    }

    const filtrados = clientesData.filter(c =>
        c.nombre.toLowerCase().includes(searchTerm) ||
        (c.email && c.email.toLowerCase().includes(searchTerm)) ||
        (c.contacto && c.contacto.includes(searchTerm))
    );

    renderClientesGrid(filtrados);
}

// =====================================================
// RENDER - VEHÍCULOS
// =====================================================
function renderVehiculosGrid(vehiculos) {
    const grid = document.getElementById('vehiculosGrid');
    if (!grid) return;

    if (!vehiculos || vehiculos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-cards">
                <i class="fas fa-car"></i>
                <p>No hay vehículos registrados</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = vehiculos.map(v => `
        <div class="vehiculo-card" data-id="${v.id}">
            <div class="vehiculo-card-header">
                <div class="vehiculo-icon">
                    <i class="fas fa-car"></i>
                </div>
                <div class="vehiculo-info-header">
                    <h4 class="vehiculo-placa">${escapeHtml(v.placa)}</h4>
                    <div class="vehiculo-marca-modelo">
                        ${escapeHtml(v.marca || 'Sin marca')} ${escapeHtml(v.modelo || '')}
                    </div>
                </div>
            </div>
            <div class="vehiculo-card-body">
                <div class="vehiculo-info-item">
                    <i class="fas fa-calendar"></i>
                    <span class="label">Año</span>
                    <span class="value">${v.anio || 'No registrado'}</span>
                </div>
                <div class="vehiculo-info-item">
                    <i class="fas fa-tachometer-alt"></i>
                    <span class="label">Kilometraje</span>
                    <span class="value">${(v.kilometraje || 0).toLocaleString()} km</span>
                </div>
                <div class="vehiculo-info-item">
                    <i class="fas fa-user"></i>
                    <span class="label">Propietario</span>
                    <span class="value">${escapeHtml(v.cliente_nombre || 'Sin cliente')}</span>
                </div>
                <div class="vehiculo-info-item">
                    <i class="fas fa-clipboard-list"></i>
                    <span class="label">Órdenes</span>
                    <span class="value">${v.total_ordenes || 0} registradas</span>
                </div>
            </div>
            <div class="vehiculo-card-footer">
                <button class="action-btn view" onclick="verDetalleVehiculo(${v.id})" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn edit" onclick="abrirModalEditarVehiculo(${v.id})" title="Editar vehículo">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="eliminarVehiculo(${v.id})" title="Eliminar vehículo">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function filtrarVehiculos() {
    const searchTerm = document.getElementById('searchVehiculos')?.value.toLowerCase() || '';

    if (!searchTerm) {
        renderVehiculosGrid(vehiculosData);
        return;
    }

    const filtrados = vehiculosData.filter(v =>
        (v.placa && v.placa.toLowerCase().includes(searchTerm)) ||
        (v.marca && v.marca.toLowerCase().includes(searchTerm)) ||
        (v.modelo && v.modelo.toLowerCase().includes(searchTerm)) ||
        (v.cliente_nombre && v.cliente_nombre.toLowerCase().includes(searchTerm))
    );

    renderVehiculosGrid(filtrados);
}

// =====================================================
// VER DETALLE - USUARIO
// =====================================================
async function verDetalleUsuario(usuarioId) {
    try {
        mostrarNotificacion('Cargando datos...', 'info');

        const response = await fetch(`${API_URL}/usuario/${usuarioId}`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) { logout(); return; }

        const data = await response.json();

        if (response.ok && data.success) {
            const usuario = data.usuario;

            const modalBody = document.getElementById('modalDetalleUsuarioBody');
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="detalle-usuario">
                        <div class="info-group">
                            <label><i class="fas fa-user"></i> Nombre completo</label>
                            <p>${escapeHtml(usuario.nombre)}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-envelope"></i> Correo electrónico</label>
                            <p>${escapeHtml(usuario.email || 'No registrado')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-id-card"></i> Número de documento</label>
                            <p>${escapeHtml(usuario.documento || 'No registrado')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-phone"></i> Teléfono / Contacto</label>
                            <p>${escapeHtml(usuario.contacto || 'No registrado')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-map-marker-alt"></i> Ubicación</label>
                            <p>${escapeHtml(usuario.ubicacion || 'No registrada')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-tags"></i> Roles asignados</label>
                            <div class="roles-badge">
                                ${usuario.roles && usuario.roles.length > 0
                                    ? usuario.roles.map(rol => `<span class="role-tag ${rol.replace('_', '-')}">${formatRolName(rol)}</span>`).join('')
                                    : '<span class="no-roles">Sin roles asignados</span>'}
                            </div>
                        </div>
                    </div>
                `;
            }

            document.getElementById('modalDetalleUsuario').classList.add('show');
        } else {
            throw new Error(data.error || 'Error al cargar detalles');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cerrarModalDetalleUsuario() {
    document.getElementById('modalDetalleUsuario').classList.remove('show');
}

// =====================================================
// VER DETALLE - CLIENTE
// =====================================================
function verDetalleCliente(clienteId) {
    const cliente = clientesData.find(c => c.id === clienteId);
    if (!cliente) return;

    const modalBody = document.getElementById('modalDetalleClienteBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div class="detalle-cliente">
                <div class="info-group">
                    <label><i class="fas fa-user"></i> Nombre completo</label>
                    <p>${escapeHtml(cliente.nombre)}</p>
                </div>
                <div class="info-group">
                    <label><i class="fas fa-envelope"></i> Correo electrónico</label>
                    <p>${escapeHtml(cliente.email || 'No registrado')}</p>
                </div>
                <div class="info-group">
                    <label><i class="fas fa-phone"></i> Teléfono / Contacto</label>
                    <p>${escapeHtml(cliente.contacto || 'No registrado')}</p>
                </div>
                <div class="info-group">
                    <label><i class="fas fa-map-marker-alt"></i> Ubicación</label>
                    <p>${escapeHtml(cliente.ubicacion || 'No registrada')}</p>
                </div>
                <div class="info-group">
                    <label><i class="fas fa-calendar-alt"></i> Cliente desde</label>
                    <p>${formatDate(cliente.fecha_registro)}</p>
                </div>
                <div class="info-group">
                    <label><i class="fas fa-car"></i> Vehículos registrados</label>
                    <div class="vehiculos-list">
                        ${cliente.vehiculos && cliente.vehiculos.length > 0
                            ? cliente.vehiculos.map(v => `
                                <div class="vehiculo-item">
                                    <span class="placa">${escapeHtml(v.placa)}</span>
                                    <span>${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</span>
                                    <span class="anio">${v.anio || 'N/A'}</span>
                                    <span class="km">${(v.kilometraje || 0).toLocaleString()} km</span>
                                </div>
                            `).join('')
                            : '<p class="no-data">No tiene vehículos registrados</p>'}
                    </div>
                </div>
            </div>
        `;
    }

    document.getElementById('modalDetalleCliente').classList.add('show');
}

function cerrarModalDetalleCliente() {
    document.getElementById('modalDetalleCliente').classList.remove('show');
}

// =====================================================
// VER DETALLE - VEHÍCULO (NUEVO)
// =====================================================
async function verDetalleVehiculo(vehiculoId) {
    try {
        mostrarNotificacion('Cargando datos...', 'info');

        const response = await fetch(`${API_URL}/vehiculo/${vehiculoId}`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) { logout(); return; }

        const data = await response.json();

        if (response.ok && data.success) {
            const v = data.vehiculo;
            const c = v.cliente || {};

            const modalBody = document.getElementById('modalDetalleVehiculoBody');
            modalBody.innerHTML = `
                <div class="detalle-vehiculo">
                    <div class="vehiculo-hero">
                        <div class="vehiculo-hero-icon">
                            <i class="fas fa-car"></i>
                        </div>
                        <div class="vehiculo-hero-info">
                            <h3>${escapeHtml(v.placa)}</h3>
                            <p>${escapeHtml(v.marca || 'Sin marca')} ${escapeHtml(v.modelo || '')} ${v.anio ? `(${v.anio})` : ''}</p>
                        </div>
                    </div>

                    <div class="detalle-grid">
                        <div class="info-group">
                            <label><i class="fas fa-tag"></i> Placa</label>
                            <p>${escapeHtml(v.placa)}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-car"></i> Marca</label>
                            <p>${escapeHtml(v.marca || 'No registrada')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-car-side"></i> Modelo</label>
                            <p>${escapeHtml(v.modelo || 'No registrado')}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-calendar"></i> Año</label>
                            <p>${v.anio || 'No registrado'}</p>
                        </div>
                        <div class="info-group">
                            <label><i class="fas fa-tachometer-alt"></i> Kilometraje</label>
                            <p>${(v.kilometraje || 0).toLocaleString()} km</p>
                        </div>
                    </div>

                    <div class="info-group">
                        <label><i class="fas fa-user"></i> Propietario</label>
                        <p>${escapeHtml(c.nombre || 'Sin cliente asignado')}</p>
                        ${c.email ? `<p style="font-size:0.8rem; color:var(--gris-texto);"><i class="fas fa-envelope"></i> ${escapeHtml(c.email)}</p>` : ''}
                        ${c.contacto ? `<p style="font-size:0.8rem; color:var(--gris-texto);"><i class="fas fa-phone"></i> ${escapeHtml(c.contacto)}</p>` : ''}
                    </div>

                    <div class="info-group">
                        <label><i class="fas fa-clipboard-list"></i> Historial de Órdenes (${v.ordenes?.length || 0})</label>
                        <div class="ordenes-list">
                            ${v.ordenes && v.ordenes.length > 0
                                ? v.ordenes.map(o => `
                                    <div class="orden-item">
                                        <span class="orden-codigo">${escapeHtml(o.codigo_unico)}</span>
                                        <span class="orden-estado">${escapeHtml(o.estado_global)}</span>
                                        <span class="orden-fecha">${formatDate(o.fecha_ingreso)}</span>
                                    </div>
                                `).join('')
                                : '<p class="no-data">Sin órdenes registradas</p>'}
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('modalDetalleVehiculo').classList.add('show');
        } else {
            throw new Error(data.error || 'Error al cargar detalles');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cerrarModalDetalleVehiculo() {
    document.getElementById('modalDetalleVehiculo').classList.remove('show');
}

// =====================================================
// ELIMINAR USUARIO CON VERIFICACIÓN
// =====================================================
async function eliminarUsuario(usuarioId) {
    const usuario = usuariosData.find(u => u.id === usuarioId);
    if (!usuario) return;

    mostrarNotificacion('Verificando asignaciones activas...', 'info');
    const asignacionesInfo = await cargarAsignacionesActivas(usuarioId);

    if (asignacionesInfo.tiene_asignaciones) {
        await abrirModalReasignar(usuario, asignacionesInfo.asignaciones);
        return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario "${usuario.nombre}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    await ejecutarEliminacion(usuarioId, usuario.nombre);
}

async function ejecutarEliminacion(usuarioId, nombreUsuario) {
    try {
        const response = await fetch(`${API_URL}/usuario/${usuarioId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.status === 401) { logout(); return; }

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarNotificacion(data.message, 'success');
            await cargarUsuarios();
            await cargarEstadisticas();
        } else if (response.status === 409) {
            mostrarModalTareasPendientes(data, { nombre: nombreUsuario, id: usuarioId }, true);
        } else {
            throw new Error(data.error || 'Error al eliminar usuario');
        }
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

// =====================================================
// CRUD CLIENTES
// =====================================================
function abrirModalEditarCliente(clienteId) {
    const cliente = clientesData.find(c => c.id === clienteId);
    if (!cliente) {
        mostrarNotificacion('Cliente no encontrado', 'error');
        return;
    }

    document.getElementById('editClienteId').value = cliente.id;
    document.getElementById('editClienteNombre').value = cliente.nombre || '';
    document.getElementById('editClienteEmail').value = cliente.email || '';
    document.getElementById('editClienteContacto').value = cliente.contacto || '';
    document.getElementById('editClienteUbicacion').value = cliente.ubicacion || '';

    document.getElementById('modalEditarCliente').classList.add('show');
}

function cerrarModalEditarCliente() {
    document.getElementById('modalEditarCliente').classList.remove('show');
}

async function guardarEdicionCliente() {
    const id = document.getElementById('editClienteId').value;
    const nombre = document.getElementById('editClienteNombre').value.trim();

    if (!nombre) {
        mostrarNotificacion('El nombre es obligatorio', 'warning');
        return;
    }

    const payload = {
        nombre: nombre,
        email: document.getElementById('editClienteEmail').value.trim() || null,
        contacto: document.getElementById('editClienteContacto').value.trim() || null,
        ubicacion: document.getElementById('editClienteUbicacion').value.trim() || null
    };

    try {
        const response = await fetch(`${API_URL}/cliente/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarNotificacion('Cliente actualizado correctamente', 'success');
            cerrarModalEditarCliente();
            await cargarClientes();
        } else {
            throw new Error(data.error || 'Error al actualizar cliente');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function eliminarCliente(clienteId) {
    const cliente = clientesData.find(c => c.id === clienteId);
    if (!cliente) return;

    abrirModalConfirmarEliminar(
        'Eliminar Cliente',
        `¿Estás seguro de eliminar al cliente "${cliente.nombre}"? Se eliminarán también todos sus vehículos y órdenes de trabajo finalizadas. Esta acción no se puede deshacer.`,
        async () => {
            try {
                const response = await fetch(`${API_URL}/cliente/${clienteId}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    mostrarNotificacion('Cliente eliminado correctamente', 'success');
                    await cargarClientes();
                    await cargarVehiculos();
                } else if (response.status === 409) {
                    mostrarNotificacion(data.error, 'error');
                } else {
                    throw new Error(data.error || 'Error al eliminar cliente');
                }
            } catch (error) {
                console.error('Error:', error);
                mostrarNotificacion(error.message, 'error');
            }
        }
    );
}

// =====================================================
// CRUD VEHÍCULOS
// =====================================================
function abrirModalEditarVehiculo(vehiculoId) {
    const vehiculo = vehiculosData.find(v => v.id === vehiculoId);
    if (!vehiculo) {
        mostrarNotificacion('Vehículo no encontrado', 'error');
        return;
    }

    // Cargar lista de clientes en el select
    const selectCliente = document.getElementById('editVehiculoCliente');
    selectCliente.innerHTML = '<option value="">-- Seleccionar cliente --</option>';

    clientesData.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = `${c.nombre} ${c.email ? `(${c.email})` : ''}`;
        if (c.id === vehiculo.id_cliente) option.selected = true;
        selectCliente.appendChild(option);
    });

    document.getElementById('editVehiculoId').value = vehiculo.id;
    document.getElementById('editVehiculoPlaca').value = vehiculo.placa || '';
    document.getElementById('editVehiculoMarca').value = vehiculo.marca || '';
    document.getElementById('editVehiculoModelo').value = vehiculo.modelo || '';
    document.getElementById('editVehiculoAnio').value = vehiculo.anio || '';
    document.getElementById('editVehiculoKilometraje').value = vehiculo.kilometraje || '';

    document.getElementById('modalEditarVehiculo').classList.add('show');
}

function cerrarModalEditarVehiculo() {
    document.getElementById('modalEditarVehiculo').classList.remove('show');
}

async function guardarEdicionVehiculo() {
    const id = document.getElementById('editVehiculoId').value;
    const placa = document.getElementById('editVehiculoPlaca').value.trim().toUpperCase();

    if (!placa) {
        mostrarNotificacion('La placa es obligatoria', 'warning');
        return;
    }

    const clienteId = document.getElementById('editVehiculoCliente').value;

    const payload = {
        placa: placa,
        marca: document.getElementById('editVehiculoMarca').value.trim() || null,
        modelo: document.getElementById('editVehiculoModelo').value.trim() || null,
        anio: document.getElementById('editVehiculoAnio').value ? parseInt(document.getElementById('editVehiculoAnio').value) : null,
        kilometraje: document.getElementById('editVehiculoKilometraje').value ? parseInt(document.getElementById('editVehiculoKilometraje').value) : null
    };

    if (clienteId) {
        payload.id_cliente = parseInt(clienteId);
    }

    try {
        const response = await fetch(`${API_URL}/vehiculo/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarNotificacion('Vehículo actualizado correctamente', 'success');
            cerrarModalEditarVehiculo();
            await cargarVehiculos();
        } else {
            throw new Error(data.error || 'Error al actualizar vehículo');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function eliminarVehiculo(vehiculoId) {
    const vehiculo = vehiculosData.find(v => v.id === vehiculoId);
    if (!vehiculo) return;

    abrirModalConfirmarEliminar(
        'Eliminar Vehículo',
        `¿Estás seguro de eliminar el vehículo con placa "${vehiculo.placa}"? Se eliminarán también sus órdenes de trabajo finalizadas. Esta acción no se puede deshacer.`,
        async () => {
            try {
                const response = await fetch(`${API_URL}/vehiculo/${vehiculoId}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    mostrarNotificacion('Vehículo eliminado correctamente', 'success');
                    await cargarVehiculos();
                    await cargarClientes();
                } else if (response.status === 409) {
                    mostrarNotificacion(data.error, 'error');
                } else {
                    throw new Error(data.error || 'Error al eliminar vehículo');
                }
            } catch (error) {
                console.error('Error:', error);
                mostrarNotificacion(error.message, 'error');
            }
        }
    );
}

// =====================================================
// MODAL DE CONFIRMACIÓN GENÉRICO
// =====================================================
function abrirModalConfirmarEliminar(titulo, mensaje, callback) {
    document.getElementById('confirmarEliminarTitulo').textContent = titulo;
    document.getElementById('confirmarEliminarMensaje').textContent = mensaje;
    accionEliminarPendiente = callback;
    document.getElementById('modalConfirmarEliminar').classList.add('show');
}

function cerrarModalConfirmarEliminar() {
    document.getElementById('modalConfirmarEliminar').classList.remove('show');
    accionEliminarPendiente = null;
}

async function confirmarEliminar() {
    if (accionEliminarPendiente) {
        const callback = accionEliminarPendiente;
        cerrarModalConfirmarEliminar();
        await callback();
    }
}

// =====================================================
// MODAL DE REASIGNACIÓN
// =====================================================
async function abrirModalReasignar(usuario, asignaciones) {
    usuarioSeleccionado = usuario;
    asignacionesActivas = asignaciones;

    const rolesUsuario = usuario.roles_nombres || [];
    const esTecnico = rolesUsuario.includes('tecnico');
    const esEncargadoRepuestos = rolesUsuario.includes('encargado_repuestos');

    let tecnicosDisponibles = [];
    let encargadosDisponibles = [];

    if (esTecnico) {
        tecnicosDisponibles = await cargarPersonalDisponible('tecnico', usuario.id);
    }
    if (esEncargadoRepuestos) {
        encargadosDisponibles = await cargarPersonalDisponible('encargado_repuestos', usuario.id);
    }

    const modalBody = document.getElementById('modalReasignarBody');
    const modalTitle = document.getElementById('modalReasignarTitle');

    modalTitle.innerHTML = `<i class="fas fa-exchange-alt"></i> Reasignar tareas - ${escapeHtml(usuario.nombre)}`;

    modalBody.innerHTML = `
        <div class="reasignar-container">
            <div class="alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>⚠️ Este usuario tiene tareas activas</strong>
                    <p>Para poder eliminar al usuario, debes reasignar sus tareas a otro miembro del personal.</p>
                </div>
            </div>

            <div class="asignaciones-lista">
                <h4><i class="fas fa-tasks"></i> Tareas activas (${asignaciones.length})</h4>
                ${asignaciones.map(asig => `
                    <div class="asignacion-item" data-id="${asig.id_asignacion || asig.id_solicitud}" data-tipo="${asig.tipo}">
                        <input type="checkbox" class="asignacion-checkbox" data-tipo="${asig.tipo}" data-id="${asig.id_asignacion || asig.id_solicitud}" checked>
                        <div class="asignacion-info">
                            <span class="badge ${asig.tipo}">${asig.tipo === 'tecnico' ? '🔧 Técnico' : '📦 Repuestos'}</span>
                            <span class="orden-ref">Orden: ${escapeHtml(asig.codigo_orden)}</span>
                            ${asig.descripcion_pieza ? `<span class="pieza">Pieza: ${escapeHtml(asig.descripcion_pieza)}</span>` : ''}
                            ${asig.tipo_asignacion ? `<span class="tipo">Tipo: ${escapeHtml(asig.tipo_asignacion)}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>

            ${esTecnico ? `
            <div class="reasignar-seccion">
                <h4><i class="fas fa-user-cog"></i> Reasignar tareas de TÉCNICO</h4>
                <div class="form-group">
                    <label>Seleccionar nuevo técnico:</label>
                    <select id="nuevoTecnico" class="form-select">
                        <option value="">-- Seleccionar técnico --</option>
                        ${tecnicosDisponibles.map(t => `
                            <option value="${t.id}" ${!t.disponible ? 'disabled' : ''}>
                                ${escapeHtml(t.nombre)} ${!t.disponible ? '(No disponible - tiene 2 órdenes activas)' : t.ordenes_activas ? `(${t.ordenes_activas}/2 activas)` : '(Disponible)'}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
            ` : ''}

            ${esEncargadoRepuestos ? `
            <div class="reasignar-seccion">
                <h4><i class="fas fa-boxes"></i> Reasignar tareas de ENCARGADO DE REPUESTOS</h4>
                <div class="form-group">
                    <label>Seleccionar nuevo encargado:</label>
                    <select id="nuevoEncargado" class="form-select">
                        <option value="">-- Seleccionar encargado --</option>
                        ${encargadosDisponibles.map(e => `
                            <option value="${e.id}">${escapeHtml(e.nombre)}</option>
                        `).join('')}
                    </select>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    document.getElementById('modalReasignar').classList.add('show');
}

async function confirmarReasignar() {
    const asignacionesSeleccionadas = [];

    document.querySelectorAll('.asignacion-checkbox:checked').forEach(cb => {
        asignacionesSeleccionadas.push({
            tipo: cb.dataset.tipo,
            id_asignacion: cb.dataset.tipo === 'tecnico' ? parseInt(cb.dataset.id) : null,
            id_solicitud: cb.dataset.tipo === 'repuestos' ? parseInt(cb.dataset.id) : null,
            codigo_orden: cb.closest('.asignacion-item')?.querySelector('.orden-ref')?.textContent?.replace('Orden: ', '') || ''
        });
    });

    const nuevoTecnicoId = document.getElementById('nuevoTecnico')?.value;
    const nuevoEncargadoId = document.getElementById('nuevoEncargado')?.value;

    if (asignacionesSeleccionadas.length === 0) {
        mostrarNotificacion('Debes seleccionar al menos una tarea para reasignar', 'warning');
        return;
    }

    const tieneTareasTecnico = asignacionesSeleccionadas.some(a => a.tipo === 'tecnico');
    const tieneTareasRepuestos = asignacionesSeleccionadas.some(a => a.tipo === 'repuestos');

    if (tieneTareasTecnico && !nuevoTecnicoId) {
        mostrarNotificacion('Debes seleccionar un nuevo técnico para reasignar las tareas técnicas', 'warning');
        return;
    }

    if (tieneTareasRepuestos && !nuevoEncargadoId) {
        mostrarNotificacion('Debes seleccionar un nuevo encargado de repuestos', 'warning');
        return;
    }

    mostrarNotificacion('Reasignando tareas...', 'info');

    try {
        const response = await fetch(`${API_URL}/usuario/${usuarioSeleccionado.id}/reasignar`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                nuevo_tecnico_id: nuevoTecnicoId ? parseInt(nuevoTecnicoId) : null,
                nuevo_encargado_id: nuevoEncargadoId ? parseInt(nuevoEncargadoId) : null,
                asignaciones: asignacionesSeleccionadas
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarNotificacion('Tareas reasignadas correctamente', 'success');
            cerrarModalReasignar();

            if (confirm(`¿Las tareas fueron reasignadas. ¿Deseas eliminar al usuario "${usuarioSeleccionado.nombre}" ahora?`)) {
                await ejecutarEliminacion(usuarioSeleccionado.id, usuarioSeleccionado.nombre);
            }
        } else {
            throw new Error(data.error || 'Error al reasignar');
        }
    } catch (error) {
        console.error('Error reasignando:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function cerrarModalReasignar() {
    document.getElementById('modalReasignar').classList.remove('show');
    usuarioSeleccionado = null;
    asignacionesActivas = [];
}

// =====================================================
// MODAL DE ROLES
// =====================================================
function abrirModalRoles(usuarioId) {
    const usuario = usuariosData.find(u => u.id === usuarioId);
    if (!usuario) {
        mostrarNotificacion('Usuario no encontrado', 'error');
        return;
    }

    usuarioSeleccionado = usuario;

    document.getElementById('modalUserName').textContent = usuario.nombre;
    document.getElementById('modalUserEmail').textContent = usuario.email || 'No registrado';
    document.getElementById('modalUserDocumento').textContent = usuario.documento || 'No registrado';

    const rolesContainer = document.getElementById('rolesCheckboxGroup');
    if (rolesContainer && rolesData.length > 0) {
        rolesContainer.innerHTML = rolesData.map(rol => `
            <div class="role-checkbox-item" onclick="toggleCheckbox(${rol.id})">
                <input type="checkbox" id="rol_${rol.id}" value="${rol.id}"
                    ${usuario.roles_ids && usuario.roles_ids.includes(rol.id) ? 'checked' : ''}>
                <label for="rol_${rol.id}">
                    ${formatRolName(rol.nombre_rol)}
                    <span class="role-description">${rol.descripcion || getRolDescription(rol.nombre_rol)}</span>
                </label>
            </div>
        `).join('');
    }

    document.getElementById('rolesModal').classList.add('show');
}

function toggleCheckbox(rolId) {
    const checkbox = document.getElementById(`rol_${rolId}`);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
    }
}

async function saveRoles() {
    if (!usuarioSeleccionado) return;

    const checkboxes = document.querySelectorAll('#rolesCheckboxGroup input[type="checkbox"]');
    const rolesSeleccionados = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));

    const rolesActuales = usuarioSeleccionado.roles_ids || [];
    const rolesQuitando = rolesActuales.filter(id => !rolesSeleccionados.includes(id));

    const quitandoTecnico = rolesQuitando.includes(ROLES_CRITICOS.tecnico);
    const quitandoRepuestos = rolesQuitando.includes(ROLES_CRITICOS.encargado_repuestos);

    if (quitandoTecnico || quitandoRepuestos) {
        mostrarNotificacion('Verificando tareas pendientes...', 'info');

        const asignacionesInfo = await cargarAsignacionesActivas(usuarioSeleccionado.id);

        const tieneTareasTecnico = quitandoTecnico && asignacionesInfo.asignaciones.some(a => a.tipo === 'tecnico');
        const tieneTareasRepuestos = quitandoRepuestos && asignacionesInfo.asignaciones.some(a => a.tipo === 'repuestos');

        if (tieneTareasTecnico || tieneTareasRepuestos) {
            const rolesAfectados = [];
            if (tieneTareasTecnico) rolesAfectados.push('Técnico Mecánico');
            if (tieneTareasRepuestos) rolesAfectados.push('Encargado de Repuestos');

            mostrarNotificacion(`No se puede quitar el rol de ${rolesAfectados.join(' y ')} porque tiene tareas pendientes`, 'warning');

            mostrarModalTareasPendientes({
                error: `No se puede quitar el rol de ${rolesAfectados.join(' y ')} porque tiene tareas pendientes`,
                tareas_pendientes: asignacionesInfo.asignaciones.filter(a =>
                    (tieneTareasTecnico && a.tipo === 'tecnico') ||
                    (tieneTareasRepuestos && a.tipo === 'repuestos')
                ),
                total_tareas: asignacionesInfo.asignaciones.length
            }, usuarioSeleccionado, false);
            return;
        }
    }

    mostrarNotificacion('Guardando cambios...', 'info');

    try {
        const response = await fetch(`${API_URL}/usuario/${usuarioSeleccionado.id}/roles`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ roles_ids: rolesSeleccionados })
        });

        if (response.status === 401) { logout(); return; }

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarNotificacion(data.message, 'success');
            closeRolesModal();
            await cargarUsuarios();
            await cargarEstadisticas();
        } else if (response.status === 409) {
            mostrarModalTareasPendientes(data, usuarioSeleccionado, false);
        } else {
            throw new Error(data.error || 'Error al guardar los roles');
        }
    } catch (error) {
        console.error('Error guardando roles:', error);
        mostrarNotificacion(error.message, 'error');
    }
}

function closeRolesModal() {
    document.getElementById('rolesModal').classList.remove('show');
    usuarioSeleccionado = null;
}

// =====================================================
// MODAL DE TAREAS PENDIENTES
// =====================================================
function mostrarModalTareasPendientes(data, usuario, esParaEliminacion = false) {
    const modalExistente = document.getElementById('modalTareasPendientes');
    if (modalExistente) {
        modalExistente.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modalTareasPendientes';
    modal.style.display = 'flex';

    const tareas = data.tareas_pendientes || [];
    const totalTareas = data.total_tareas || tareas.length;

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header" style="background: #dc2626;">
                <h3><i class="fas fa-tasks"></i> ${esParaEliminacion ? 'No se puede eliminar el usuario' : 'No se puede modificar el rol'}</h3>
                <button class="modal-close" onclick="cerrarModalTareasPendientes()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="alert-warning" style="margin-bottom: 20px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>⚠️ ${data.error || `El usuario ${escapeHtml(usuario.nombre)} tiene tareas pendientes`}</strong>
                        <p>${esParaEliminacion ?
                            'No se puede eliminar al usuario hasta que complete o reasigne las siguientes tareas:' :
                            'No se puede modificar el rol hasta que complete o reasigne las siguientes tareas:'}
                        </p>
                    </div>
                </div>

                <div class="tareas-lista">
                    <h4>Tareas pendientes (${totalTareas})</h4>
                    ${tareas.length > 0 ? tareas.map(tarea => `
                        <div class="tarea-item">
                            <i class="fas ${tarea.tipo === 'tecnico' ? 'fa-wrench' : 'fa-box'}"></i>
                            <div class="tarea-info">
                                <span class="tarea-tipo">${tarea.tipo === 'tecnico' ? '🔧 Asignación técnica' : '📦 Solicitud de repuestos'}</span>
                                <span class="tarea-descripcion">${escapeHtml(tarea.descripcion)}</span>
                                ${tarea.orden_codigo ? `<span class="tarea-orden">Orden: ${escapeHtml(tarea.orden_codigo)}</span>` : ''}
                            </div>
                        </div>
                    `).join('') : `
                        <div class="tarea-item">
                            <i class="fas fa-info-circle"></i>
                            <div class="tarea-info">
                                <span class="tarea-descripcion">No se pudieron cargar los detalles de las tareas pendientes</span>
                            </div>
                        </div>
                    `}
                </div>

                <div class="acciones-sugeridas">
                    <p><strong>Opciones disponibles:</strong></p>
                    <ul>
                        <li>Esperar a que el usuario complete las tareas pendientes</li>
                        ${!esParaEliminacion ? `
                            <li>Mantener el rol actual y editar otros roles</li>
                            <li>Reasignar las tareas a otro miembro del personal (desde la opción "Eliminar usuario")</li>
                        ` : `
                            <li>Reasignar las tareas a otro miembro del personal</li>
                        `}
                    </ul>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="cerrarModalTareasPendientes()">
                    <i class="fas fa-times"></i> Entendido
                </button>
                ${!esParaEliminacion ? `
                    <button class="btn-primary" onclick="cerrarModalTareasPendientes(); abrirModalReasignar(usuarioSeleccionado, ${JSON.stringify(tareas).replace(/"/g, '&quot;')})">
                        <i class="fas fa-exchange-alt"></i> Reasignar tareas
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function cerrarModalTareasPendientes() {
    const modal = document.getElementById('modalTareasPendientes');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// =====================================================
// UTILIDADES
// =====================================================
function formatRolName(rolNombre) {
    const nombres = {
        'jefe_operativo': 'Jefe Operativo',
        'jefe_taller': 'Jefe de Taller',
        'tecnico': 'Técnico Mecánico',
        'encargado_repuestos': 'Encargado de Repuestos'
    };
    return nombres[rolNombre] || rolNombre.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getRolDescription(rolNombre) {
    const descripciones = {
        'jefe_operativo': 'Gestiona recepción, cotizaciones y facturación',
        'jefe_taller': 'Supervisa diagnósticos, asigna técnicos y planifica',
        'tecnico': 'Realiza diagnósticos y trabajos mecánicos',
        'encargado_repuestos': 'Gestiona inventario y cotizaciones de repuestos'
    };
    return descripciones[rolNombre] || '';
}

function formatDate(dateStr) {
    if (!dateStr) return 'No registrado';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');

    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999;';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;

    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `<i class="fas ${iconos[tipo] || iconos.info}"></i><span>${escapeHtml(mensaje)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

// =====================================================
// FUNCIONES GLOBALES (exponer al window)
// =====================================================

// Personal
window.verDetalleUsuario = verDetalleUsuario;
window.cerrarModalDetalleUsuario = cerrarModalDetalleUsuario;
window.eliminarUsuario = eliminarUsuario;
window.abrirModalRoles = abrirModalRoles;
window.closeRolesModal = closeRolesModal;
window.saveRoles = saveRoles;
window.toggleCheckbox = toggleCheckbox;
window.confirmarReasignar = confirmarReasignar;
window.cerrarModalReasignar = cerrarModalReasignar;
window.cerrarModalTareasPendientes = cerrarModalTareasPendientes;

// Clientes
window.verDetalleCliente = verDetalleCliente;
window.cerrarModalDetalleCliente = cerrarModalDetalleCliente;
window.abrirModalEditarCliente = abrirModalEditarCliente;
window.cerrarModalEditarCliente = cerrarModalEditarCliente;
window.guardarEdicionCliente = guardarEdicionCliente;
window.eliminarCliente = eliminarCliente;

// Vehículos
window.verDetalleVehiculo = verDetalleVehiculo;
window.cerrarModalDetalleVehiculo = cerrarModalDetalleVehiculo;
window.abrirModalEditarVehiculo = abrirModalEditarVehiculo;
window.cerrarModalEditarVehiculo = cerrarModalEditarVehiculo;
window.guardarEdicionVehiculo = guardarEdicionVehiculo;
window.eliminarVehiculo = eliminarVehiculo;

// Confirmación genérica
window.cerrarModalConfirmarEliminar = cerrarModalConfirmarEliminar;
window.confirmarEliminar = confirmarEliminar;

// Auth
window.logout = logout;

console.log('✅ admin_roles.js cargado completamente (Personal + Clientes + Vehículos)');