// =====================================================
// MISVEHICULOS.JS - CLIENTE (VERSIÓN OPTIMIZADA)
// =====================================================

const API_URL = window.location.origin + '/api/cliente';
let currentUser = null;
let vehiculos = [];
let currentVehiculo = null;
let reparacionesChart = null;
let estadoChart = null;
let loadingEstados = false;

// Cache para evitar peticiones duplicadas
const estadoCache = new Map();

// =====================================================
// UTILIDADES
// =====================================================

function getAuthHeaders() {
    let token = localStorage.getItem('furia_token');
    if (!token) token = localStorage.getItem('token');
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
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return formatDate(dateStr);
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    let icon = type === 'success' ? 'fa-check-circle' : 
               type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function cerrarModal(modalId) {
    document.getElementById(modalId)?.classList.remove('show');
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
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
        const userData = JSON.parse(localStorage.getItem('furia_user') || '{}');

        currentUser = {
            id: payload.user?.id || payload.id || userData?.id,
            nombre: payload.user?.nombre || payload.nombre || userData?.nombre || 'Usuario'
        };

        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            fechaElement.textContent = new Date().toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
        }

        return currentUser;
    } catch (error) {
        window.location.href = '/';
        return null;
    }
}

function cerrarSesion() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
}

// =====================================================
// VEHÍCULOS - VERSIÓN OPTIMIZADA CON PROMESAS PARALELAS
// =====================================================

async function cargarVehiculos() {
    mostrarLoading(true);
    const startTime = performance.now();
    
    try {
        const response = await fetch(`${API_URL}/vehiculos`, { headers: getAuthHeaders() });
        const data = await response.json();

        if (data.success) {
            vehiculos = data.vehiculos || [];
            
            // Renderizado inmediato (sin esperar estados)
            renderizarVehiculos();
            
            // Actualizar contador de vehículos inmediatamente
            const totalElement = document.getElementById('totalVehiculos');
            const vehiculosCount = document.getElementById('vehiculosCount');
            if (totalElement) totalElement.textContent = vehiculos.length;
            if (vehiculosCount) vehiculosCount.textContent = vehiculos.length;
            
            // Cargar todo en paralelo (optimización clave)
            await cargarDatosEnParalelo();
            
            const endTime = performance.now();
            console.log(`✅ Carga completada en ${(endTime - startTime).toFixed(0)}ms`);
        } else {
            showToast(data.error || 'Error al cargar vehículos', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
        document.getElementById('vehiculosGrid').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error de conexión</p>
                <button onclick="cargarVehiculos()" class="btn-retry">Reintentar</button>
            </div>
        `;
    } finally {
        mostrarLoading(false);
    }
}

// OPTIMIZACIÓN CLAVE: Cargar todos los datos en paralelo
async function cargarDatosEnParalelo() {
    if (vehiculos.length === 0) return;
    
    // Crear un array de promesas para todas las peticiones
    const promesasOrdenes = vehiculos.map(vehiculo => 
        fetch(`${API_URL}/vehiculo/${vehiculo.id}/ordenes`, { headers: getAuthHeaders() })
            .then(res => res.json())
            .then(data => ({ vehiculoId: vehiculo.id, data }))
            .catch(err => ({ vehiculoId: vehiculo.id, error: err }))
    );
    
    // Ejecutar TODAS las peticiones en PARALELO
    const resultados = await Promise.all(promesasOrdenes);
    
    // Procesar resultados
    const ordenesPorVehiculo = new Map();
    for (const resultado of resultados) {
        if (resultado.data?.success) {
            ordenesPorVehiculo.set(resultado.vehiculoId, resultado.data.ordenes || []);
        } else {
            ordenesPorVehiculo.set(resultado.vehiculoId, []);
        }
    }
    
    // Actualizar estados en las tarjetas
    for (const vehiculo of vehiculos) {
        const ordenes = ordenesPorVehiculo.get(vehiculo.id) || [];
        let estado = 'Sin reparación activa';
        
        if (ordenes.length > 0) {
            estado = ordenes[0].estado_global || 'En proceso';
        }
        
        estadoCache.set(vehiculo.id, estado);
        
        const previewElement = document.getElementById(`estado-preview-${vehiculo.id}`);
        if (previewElement) {
            previewElement.innerHTML = `
                <div class="estado-badge-premium ${getEstadoClass(estado)}">
                    <i class="fas ${getEstadoIcon(estado)}"></i>
                    <span>${getEstadoTexto(estado)}</span>
                </div>
            `;
        }
    }
    
    // Calcular estadísticas (usando los datos ya obtenidos)
    calcularEstadisticas(ordenesPorVehiculo);
    
    // Cargar actividad reciente y gráficos en paralelo (sin bloquear)
    Promise.all([
        cargarActividadRecienteOptimizado(ordenesPorVehiculo),
        cargarDatosGraficosOptimizado(ordenesPorVehiculo)
    ]).catch(console.error);
}

function calcularEstadisticas(ordenesPorVehiculo) {
    const enTallerElement = document.getElementById('vehiculosEnTaller');
    const finalizadosElement = document.getElementById('vehiculosFinalizados');
    
    let enTaller = 0;
    let finalizados = 0;
    
    for (const [vehiculoId, ordenes] of ordenesPorVehiculo) {
        if (ordenes.length > 0) {
            const estado = ordenes[0].estado_global;
            if (estado !== 'Finalizado' && estado !== 'Entregado' && estado !== 'Sin reparación activa') {
                enTaller++;
            }
            if (estado === 'Finalizado' || estado === 'Entregado') {
                finalizados++;
            }
        }
    }
    
    if (enTallerElement) enTallerElement.textContent = enTaller;
    if (finalizadosElement) finalizadosElement.textContent = finalizados;
}

async function cargarActividadRecienteOptimizado(ordenesPorVehiculo) {
    const container = document.getElementById('activityTimeline');
    if (!container) return;
    
    const actividades = [];
    
    for (const vehiculo of vehiculos.slice(0, 5)) {
        const ordenes = ordenesPorVehiculo.get(vehiculo.id) || [];
        
        if (ordenes.length > 0) {
            const ultimaOrden = ordenes[0];
            if (ultimaOrden.estado_global !== 'Sin reparación activa') {
                actividades.push({
                    vehiculo: `${vehiculo.marca} ${vehiculo.modelo || ''}`,
                    placa: vehiculo.placa,
                    estado: ultimaOrden.estado_global,
                    fecha: ultimaOrden.fecha_ingreso || ultimaOrden.created_at,
                    codigo: ultimaOrden.codigo_unico
                });
            }
        }
    }
    
    // Ordenar por fecha más reciente
    actividades.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    if (actividades.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay actividad reciente</p>
                <small>Tus reparaciones aparecerán aquí</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="timeline-modern">
            ${actividades.slice(0, 10).map((act, idx) => `
                <div class="timeline-item-modern">
                    <div class="timeline-marker ${getEstadoClass(act.estado)}">
                        <i class="fas ${getEstadoIcon(act.estado)}"></i>
                    </div>
                    <div class="timeline-content-modern">
                        <div class="timeline-header">
                            <strong>${escapeHtml(act.vehiculo)}</strong>
                            <span class="placa-tag">${escapeHtml(act.placa)}</span>
                        </div>
                        <div class="timeline-desc">
                            <span class="estado-badge-small ${getEstadoClass(act.estado)}">
                                ${getEstadoTexto(act.estado)}
                            </span>
                            <span class="timeline-date">${formatRelativeDate(act.fecha)}</span>
                        </div>
                        ${act.codigo ? `<div class="timeline-code">Orden: ${act.codigo}</div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function cargarDatosGraficosOptimizado(ordenesPorVehiculo) {
    try {
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const reparacionesPorMes = new Array(12).fill(0);
        let enTaller = 0;
        let completados = 0;
        let pendientes = 0;
        
        for (const [vehiculoId, ordenes] of ordenesPorVehiculo) {
            for (const orden of ordenes) {
                if (orden.fecha_ingreso) {
                    const mes = new Date(orden.fecha_ingreso).getMonth();
                    reparacionesPorMes[mes]++;
                }
                
                const estado = orden.estado_global;
                if (estado === 'Finalizado' || estado === 'Entregado') {
                    completados++;
                } else if (estado !== 'Sin reparación activa') {
                    enTaller++;
                } else {
                    pendientes++;
                }
            }
        }
        
        // Gráfico de reparaciones por mes
        const ctx1 = document.getElementById('reparacionesChart')?.getContext('2d');
        if (ctx1) {
            if (reparacionesChart) reparacionesChart.destroy();
            reparacionesChart = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: meses,
                    datasets: [{
                        label: 'Reparaciones ingresadas',
                        data: reparacionesPorMes,
                        borderColor: '#C1121F',
                        backgroundColor: 'rgba(193, 18, 31, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#FFFFFF' }
                        }
                    },
                    scales: {
                        y: {
                            ticks: { color: '#8E8E93' },
                            grid: { color: '#2C2C2E' }
                        },
                        x: {
                            ticks: { color: '#8E8E93' },
                            grid: { color: '#2C2C2E' }
                        }
                    }
                }
            });
        }
        
        // Gráfico de estado de flota
        const ctx2 = document.getElementById('estadoChart')?.getContext('2d');
        if (ctx2) {
            if (estadoChart) estadoChart.destroy();
            estadoChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['En taller', 'Completados', 'Sin actividad'],
                    datasets: [{
                        data: [enTaller, completados, pendientes],
                        backgroundColor: ['#C1121F', '#10B981', '#F59E0B'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#FFFFFF' }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error cargando gráficos:', error);
    }
}

function renderizarVehiculos() {
    const container = document.getElementById('vehiculosGrid');
    if (!container) return;
    
    if (vehiculos.length === 0) {
        container.innerHTML = `
            <div class="empty-state premium">
                <i class="fas fa-car-side"></i>
                <h3>No tienes vehículos registrados</h3>
                <p>Registra tu primer vehículo para comenzar a dar seguimiento</p>
                <button class="btn-primary" onclick="window.location.href='/cliente/registro-vehiculo.html'">
                    <i class="fas fa-plus"></i> Registrar vehículo
                </button>
            </div>
        `;
        return;
    }
    
    // Renderizado rápido con skeleton loaders
    container.innerHTML = vehiculos.map(vehiculo => `
        <div class="vehiculo-card-premium" onclick="verDetalleVehiculo(${vehiculo.id})">
            <div class="card-header-premium">
                <div class="vehiculo-icono-premium">
                    <i class="fas fa-car-side"></i>
                </div>
                <div class="vehiculo-titulo">
                    <h3>${escapeHtml(vehiculo.marca)} ${escapeHtml(vehiculo.modelo || '')}</h3>
                    <span class="placa-premium">${escapeHtml(vehiculo.placa)}</span>
                </div>
                <div class="card-arrow">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            <div class="card-body-premium">
                ${vehiculo.anio ? `
                    <div class="info-tag">
                        <i class="fas fa-calendar"></i>
                        <span>${vehiculo.anio}</span>
                    </div>
                ` : ''}
                <div class="estado-preview" id="estado-preview-${vehiculo.id}">
                    <div class="skeleton-loader"></div>
                </div>
            </div>
        </div>
    `).join('');
}

function getEstadoTexto(estado) {
    const estados = {
        'EnRecepcion': 'En recepción',
        'EnDiagnostico': 'En diagnóstico',
        'CotizacionEnviada': 'Cotización enviada',
        'EnReparacion': 'En reparación',
        'ControlCalidad': 'Control de calidad',
        'Finalizado': 'Finalizado',
        'Entregado': 'Entregado',
        'Sin reparación activa': 'Sin reparación activa'
    };
    return estados[estado] || 'En proceso';
}

function getEstadoClass(estado) {
    const classes = {
        'EnRecepcion': 'estado-recepcion',
        'EnDiagnostico': 'estado-diagnostico',
        'CotizacionEnviada': 'estado-cotizacion',
        'EnReparacion': 'estado-reparacion',
        'ControlCalidad': 'estado-calidad',
        'Finalizado': 'estado-finalizado',
        'Entregado': 'estado-entregado',
        'Sin reparación activa': 'estado-sin'
    };
    return classes[estado] || 'estado-proceso';
}

function getEstadoIcon(estado) {
    const icons = {
        'EnRecepcion': 'fa-clipboard-list',
        'EnDiagnostico': 'fa-stethoscope',
        'CotizacionEnviada': 'fa-file-invoice-dollar',
        'EnReparacion': 'fa-wrench',
        'ControlCalidad': 'fa-clipboard-check',
        'Finalizado': 'fa-flag-checkered',
        'Entregado': 'fa-handshake',
        'Sin reparación activa': 'fa-clock'
    };
    return icons[estado] || 'fa-chart-line';
}

// =====================================================
// DETALLE DEL VEHÍCULO (con caché)
// =====================================================

async function verDetalleVehiculo(id) {
    const vehiculo = vehiculos.find(v => v.id === id);
    if (!vehiculo) return;
    
    currentVehiculo = vehiculo;
    
    // Intentar usar caché primero
    let ordenes = [];
    let ordenesData = null;
    
    // Verificar si ya tenemos los datos en caché
    const cachedData = window.ordenesDataCache?.get(id);
    if (cachedData) {
        ordenesData = cachedData;
    } else {
        try {
            const response = await fetch(`${API_URL}/vehiculo/${id}/ordenes`, { headers: getAuthHeaders() });
            ordenesData = await response.json();
            
            // Guardar en caché
            if (!window.ordenesDataCache) window.ordenesDataCache = new Map();
            window.ordenesDataCache.set(id, ordenesData);
        } catch (error) {
            console.error('Error al obtener orden:', error);
        }
    }
    
    if (ordenesData?.success && ordenesData.ordenes?.length > 0) {
        ordenes = ordenesData.ordenes;
    }
    
    const estado = ordenes.length > 0 ? (ordenes[0].estado_global || 'En proceso') : 'Sin reparación activa';
    const codigoOrden = ordenes.length > 0 ? (ordenes[0].codigo_unico || '') : '';
    const fechaIngreso = ordenes.length > 0 ? (ordenes[0].fecha_ingreso || '') : '';
    const servicios = ordenes.length > 0 ? (ordenes[0].servicios || []) : [];
    
    const modalBody = document.getElementById('modalDetalleBody');
    const modalTitulo = document.getElementById('modalTitulo');
    
    modalTitulo.textContent = `${vehiculo.marca} ${vehiculo.modelo || ''}`;
    
    modalBody.innerHTML = `
        <div class="detalle-vehiculo-premium">
            <div class="detalle-header">
                <div class="detalle-icono-premium">
                    <i class="fas fa-car-side"></i>
                </div>
                <div class="detalle-titulo">
                    <h2>${escapeHtml(vehiculo.marca)} ${escapeHtml(vehiculo.modelo || '')}</h2>
                    <p>${escapeHtml(vehiculo.placa)}</p>
                </div>
            </div>
            
            <div class="detalle-grid-premium">
                <div class="detalle-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-info-circle"></i>
                        <span>Información General</span>
                    </div>
                    <div class="detalle-card-content">
                        <div class="info-row">
                            <span class="label">Marca</span>
                            <span class="value">${escapeHtml(vehiculo.marca)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Modelo</span>
                            <span class="value">${escapeHtml(vehiculo.modelo || 'No especificado')}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Año</span>
                            <span class="value">${vehiculo.anio || 'No especificado'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="detalle-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-tools"></i>
                        <span>Estado de Reparación</span>
                    </div>
                    <div class="detalle-card-content">
                        <div class="estado-grande ${getEstadoClass(estado)}">
                            <i class="fas ${getEstadoIcon(estado)}"></i>
                            <div>
                                <strong>${getEstadoTexto(estado)}</strong>
                                ${fechaIngreso ? `<small>Ingreso: ${formatDate(fechaIngreso)}</small>` : ''}
                            </div>
                        </div>
                        ${codigoOrden ? `
                            <div class="orden-info">
                                <span class="label">Código de orden:</span>
                                <span class="value code">${codigoOrden}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            ${servicios.length > 0 ? `
                <div class="detalle-card servicios-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-clipboard-list"></i>
                        <span>Servicios en proceso</span>
                    </div>
                    <div class="servicios-lista">
                        ${servicios.map(s => `
                            <div class="servicio-item">
                                <div class="servicio-info">
                                    <strong>${escapeHtml(s.nombre)}</strong>
                                    <span class="servicio-estado">${s.estado || 'Pendiente'}</span>
                                </div>
                                ${s.progreso ? `
                                    <div class="progreso-servicio">
                                        <div class="progreso-bar">
                                            <div class="progreso-fill" style="width: ${s.progreso}%"></div>
                                        </div>
                                        <span>${s.progreso}%</span>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${ordenes.length > 1 ? `
                <div class="detalle-card historial-card">
                    <div class="detalle-card-title">
                        <i class="fas fa-history"></i>
                        <span>Historial de Reparaciones</span>
                    </div>
                    <div class="historial-lista">
                        ${ordenes.slice(1, 4).map(orden => `
                            <div class="historial-item">
                                <div class="historial-fecha">${formatDate(orden.fecha_ingreso)}</div>
                                <div class="historial-estado">${getEstadoTexto(orden.estado_global)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    abrirModal('modalDetalleVehiculo');
}

function abrirModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function irAvances() {
    if (currentVehiculo) {
        localStorage.setItem('vehiculo_seleccionado', JSON.stringify(currentVehiculo));
        window.location.href = '/cliente/avances.html';
    } else {
        showToast('Selecciona un vehículo primero', 'warning');
    }
}

// =====================================================
// FILTROS Y PESTAÑAS
// =====================================================

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('searchVehiculo');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredVehiculos = vehiculos.filter(v => 
                v.placa.toLowerCase().includes(searchTerm) ||
                v.marca.toLowerCase().includes(searchTerm) ||
                (v.modelo && v.modelo.toLowerCase().includes(searchTerm))
            );
            
            const container = document.getElementById('vehiculosGrid');
            if (container) {
                if (filteredVehiculos.length === 0) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-search"></i>
                            <p>No se encontraron vehículos</p>
                            <small>Prueba con otro término de búsqueda</small>
                        </div>
                    `;
                } else {
                    container.innerHTML = filteredVehiculos.map(vehiculo => `
                        <div class="vehiculo-card-premium" onclick="verDetalleVehiculo(${vehiculo.id})">
                            <div class="card-header-premium">
                                <div class="vehiculo-icono-premium">
                                    <i class="fas fa-car-side"></i>
                                </div>
                                <div class="vehiculo-titulo">
                                    <h3>${escapeHtml(vehiculo.marca)} ${escapeHtml(vehiculo.modelo || '')}</h3>
                                    <span class="placa-premium">${escapeHtml(vehiculo.placa)}</span>
                                </div>
                                <div class="card-arrow">
                                    <i class="fas fa-chevron-right"></i>
                                </div>
                            </div>
                            <div class="card-body-premium">
                                ${vehiculo.anio ? `
                                    <div class="info-tag">
                                        <i class="fas fa-calendar"></i>
                                        <span>${vehiculo.anio}</span>
                                    </div>
                                ` : ''}
                                <div class="estado-preview" id="estado-preview-${vehiculo.id}">
                                    <div class="skeleton-loader"></div>
                                </div>
                            </div>
                        </div>
                    `).join('');
                    
                    // Cargar estados para los filtrados desde caché
                    filteredVehiculos.forEach(vehiculo => {
                        const estado = estadoCache.get(vehiculo.id) || 'Sin reparación activa';
                        const previewElement = document.getElementById(`estado-preview-${vehiculo.id}`);
                        if (previewElement) {
                            previewElement.innerHTML = `
                                <div class="estado-badge-premium ${getEstadoClass(estado)}">
                                    <i class="fas ${getEstadoIcon(estado)}"></i>
                                    <span>${getEstadoTexto(estado)}</span>
                                </div>
                            `;
                        }
                    });
                }
            }
        });
    }
}

function setupEventListeners() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    });
}

// =====================================================
// INICIO
// =====================================================

async function inicializar() {
    await cargarUsuarioActual();
    await cargarVehiculos();
    setupTabs();
    setupSearch();
    setupEventListeners();
}

// Exponer funciones globales
window.cerrarSesion = cerrarSesion;
window.cerrarModal = cerrarModal;
window.verDetalleVehiculo = verDetalleVehiculo;
window.cargarVehiculos = cargarVehiculos;
window.irAvances = irAvances;

document.addEventListener('DOMContentLoaded', inicializar);