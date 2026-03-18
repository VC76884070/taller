// =====================================================
// CONFIGURACIÓN
// =====================================================
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const cotizacionesTableBody = document.getElementById('cotizacionesTableBody');
const detalleVacio = document.getElementById('detalleVacio');
const detalleCotizacion = document.getElementById('detalleCotizacion');
const cerrarDetalleBtn = document.getElementById('cerrarDetalleBtn');
const searchInput = document.getElementById('searchInput');
const estadoFilter = document.getElementById('estadoFilter');
const fechaFilter = document.getElementById('fechaFilter');
const serviciosList = document.getElementById('serviciosList');
const subtotalSpan = document.getElementById('subtotal');
const totalCotizacionSpan = document.getElementById('totalCotizacion');
const diagnosticoMensaje = document.getElementById('diagnosticoMensaje');
const previewTotal = document.getElementById('previewTotal');
const currentDateSpan = document.getElementById('currentDate');

// Variables globales
let cotizacionesData = [];
let serviciosSeleccionados = [];
let cotizacionActual = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initPage();
    await loadCotizaciones();
    setupEventListeners();
    setupModalListeners();
});

// Verificar autenticación
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const user = JSON.parse(localStorage.getItem('furia_user') || '{}');
    
    if (!token || user.rol !== 'jefe_operativo') {
        window.location.href = '/';
        return false;
    }
    return true;
}

// Inicializar página
function initPage() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    if (currentDateSpan) {
        currentDateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Búsqueda
    if (searchInput) {
        searchInput.addEventListener('input', filtrarCotizaciones);
    }
    
    // Filtros
    if (estadoFilter) {
        estadoFilter.addEventListener('change', filtrarCotizaciones);
    }
    
    if (fechaFilter) {
        fechaFilter.addEventListener('change', filtrarCotizaciones);
    }
    
    // Checkboxes de servicios en detalle
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('servicio-checkbox-input')) {
            actualizarTotalDesdeDetalle();
        }
    });
}

// Configurar listeners del modal
function setupModalListeners() {
    const checkboxes = document.querySelectorAll('#nuevaCotizacionModal input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', actualizarPreviewTotal);
    });
    
    const customDesc = document.getElementById('servicioCustomDesc');
    const customPrecio = document.getElementById('servicioCustomPrecio');
    if (customDesc) customDesc.addEventListener('input', actualizarPreviewTotal);
    if (customPrecio) customPrecio.addEventListener('input', actualizarPreviewTotal);
}

// =====================================================
// CARGAR COTIZACIONES DESDE API
// =====================================================
async function loadCotizaciones() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al cargar cotizaciones');
        }
        
        cotizacionesData = result.data;
        renderTabla(cotizacionesData);
        
    } catch (error) {
        console.error('Error cargando cotizaciones:', error);
        mostrarNotificacion('Error al cargar cotizaciones', 'error');
        
        // Si hay error, cargar datos de ejemplo para desarrollo
        if (window.location.hostname === 'localhost') {
            cargarDatosEjemplo();
        }
    }
}

// Datos de ejemplo para desarrollo
function cargarDatosEjemplo() {
    cotizacionesData = [
        {
            id: 1,
            codigo: 'COT-240317-001',
            cliente: 'Juan Pérez',
            vehiculo: 'Toyota Corolla (ABC123)',
            total: 450,
            estado: 'pendiente',
            fecha: '17/03/2026',
            servicios: [
                { id: 1, nombre: 'Cambio de aceite', precio: 150, seleccionado: true },
                { id: 2, nombre: 'Frenos (pastillas)', precio: 250, seleccionado: true },
                { id: 3, nombre: 'Alineación y balanceo', precio: 450, seleccionado: false }
            ]
        },
        {
            id: 2,
            codigo: 'COT-240317-002',
            cliente: 'María López',
            vehiculo: 'Honda Civic (XYZ789)',
            total: 250,
            estado: 'aprobada',
            fecha: '17/03/2026',
            servicios: [
                { id: 4, nombre: 'Frenos (pastillas)', precio: 250, seleccionado: true },
                { id: 5, nombre: 'Cambio de batería', precio: 600, seleccionado: false }
            ]
        },
        {
            id: 3,
            codigo: 'COT-240316-015',
            cliente: 'Roberto Méndez',
            vehiculo: 'Suzuki Swift (DEF456)',
            total: 200,
            estado: 'diagnostico',
            fecha: '16/03/2026',
            servicios: []
        },
        {
            id: 4,
            codigo: 'COT-240316-012',
            cliente: 'Ana Flores',
            vehiculo: 'Nissan Versa (GHI789)',
            total: 800,
            estado: 'rechazada',
            fecha: '16/03/2026',
            servicios: [
                { id: 6, nombre: 'Diagnóstico computarizado', precio: 800, seleccionado: true }
            ]
        },
        {
            id: 5,
            codigo: 'COT-240315-008',
            cliente: 'Carlos Ruiz',
            vehiculo: 'Chevrolet Spark (JKL012)',
            total: 600,
            estado: 'pendiente',
            fecha: '15/03/2026',
            servicios: [
                { id: 7, nombre: 'Cambio de batería', precio: 600, seleccionado: true },
                { id: 8, nombre: 'Sistema de refrigeración', precio: 350, seleccionado: false }
            ]
        }
    ];
    renderTabla(cotizacionesData);
}

// Renderizar tabla
function renderTabla(cotizaciones) {
    if (!cotizacionesTableBody) return;
    
    if (cotizaciones.length === 0) {
        cotizacionesTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: var(--gris-medio);">
                    No hay cotizaciones que coincidan con los filtros
                </td>
            </tr>
        `;
        return;
    }
    
    cotizacionesTableBody.innerHTML = cotizaciones.map(cot => {
        const estadoClass = {
            'pendiente': 'pendiente',
            'aprobada': 'aprobada',
            'aprobada_parcial': 'aprobada',
            'rechazada': 'rechazada',
            'diagnostico': 'diagnostico'
        }[cot.estado] || 'pendiente';
        
        const estadoTexto = {
            'pendiente': 'Pendiente',
            'aprobada': 'Aprobada',
            'aprobada_parcial': 'Aprobada (parcial)',
            'rechazada': 'Rechazada',
            'diagnostico': 'Solo diagnóstico'
        }[cot.estado] || cot.estado;
        
        return `
            <tr onclick="seleccionarCotizacion(${cot.id})">
                <td><strong>${cot.codigo}</strong></td>
                <td>${cot.cliente}</td>
                <td>${cot.vehiculo}</td>
                <td><strong>Bs ${cot.total.toLocaleString()}</strong></td>
                <td><span class="estado-badge ${estadoClass}">${estadoTexto}</span></td>
                <td>${cot.fecha}</td>
                <td>
                    <button class="action-btn" onclick="event.stopPropagation(); verDetalle(${cot.id})" title="Ver detalle">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Filtrar cotizaciones
function filtrarCotizaciones() {
    let filtradas = [...cotizacionesData];
    
    // Filtro de búsqueda
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
        filtradas = filtradas.filter(cot => 
            cot.codigo.toLowerCase().includes(searchTerm) ||
            cot.cliente.toLowerCase().includes(searchTerm) ||
            cot.vehiculo.toLowerCase().includes(searchTerm)
        );
    }
    
    // Filtro de estado
    const estado = estadoFilter?.value;
    if (estado) {
        filtradas = filtradas.filter(cot => cot.estado === estado);
    }
    
    // Filtro de fecha
    const fecha = fechaFilter?.value;
    if (fecha && fecha !== 'todo') {
        const hoy = new Date();
        const inicioSemana = new Date(hoy);
        inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1);
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        
        filtradas = filtradas.filter(cot => {
            const [dia, mes, año] = cot.fecha.split('/');
            const fechaCot = new Date(parseInt('20' + año), parseInt(mes) - 1, parseInt(dia));
            
            if (fecha === 'hoy') {
                return fechaCot.toDateString() === hoy.toDateString();
            } else if (fecha === 'semana') {
                return fechaCot >= inicioSemana && fechaCot <= hoy;
            } else if (fecha === 'mes') {
                return fechaCot >= inicioMes && fechaCot <= hoy;
            }
            return true;
        });
    }
    
    renderTabla(filtradas);
}

// =====================================================
// SELECCIÓN DE COTIZACIÓN
// =====================================================
window.seleccionarCotizacion = (id) => {
    const cotizacion = cotizacionesData.find(c => c.id === id);
    if (!cotizacion) return;
    
    cotizacionActual = cotizacion;
    
    // Remover selección anterior
    document.querySelectorAll('.cotizaciones-table tbody tr').forEach(row => {
        row.classList.remove('selected');
    });
    
    // Marcar fila seleccionada
    event.currentTarget.classList.add('selected');
    
    // Mostrar detalle
    mostrarDetalleCotizacion(cotizacion);
};

window.verDetalle = (id) => {
    const cotizacion = cotizacionesData.find(c => c.id === id);
    if (cotizacion) {
        mostrarDetalleCotizacion(cotizacion);
    }
};

function mostrarDetalleCotizacion(cotizacion) {
    // Ocultar vacío, mostrar detalle
    detalleVacio.style.display = 'none';
    detalleCotizacion.style.display = 'block';
    cerrarDetalleBtn.style.display = 'block';
    
    // Llenar datos básicos
    document.getElementById('detalleCodigo').textContent = cotizacion.codigo;
    document.getElementById('detalleCliente').textContent = cotizacion.cliente;
    document.getElementById('detalleVehiculo').textContent = cotizacion.vehiculo;
    document.getElementById('detalleFecha').textContent = cotizacion.fecha;
    
    // Llenar servicios
    renderServiciosDetalle(cotizacion.servicios || []);
    
    // Calcular totales
    calcularTotalesDetalle(cotizacion.servicios || []);
}

function renderServiciosDetalle(servicios) {
    if (!serviciosList) return;
    
    if (!servicios || servicios.length === 0) {
        serviciosList.innerHTML = `
            <div style="text-align: center; padding: 1rem; color: var(--gris-medio);">
                No hay servicios registrados
            </div>
        `;
        return;
    }
    
    serviciosList.innerHTML = servicios.map(serv => `
        <div class="servicio-checkbox">
            <input type="checkbox" class="servicio-checkbox-input" 
                   data-id="${serv.id || ''}"
                   data-precio="${serv.precio}"
                   ${serv.seleccionado ? 'checked' : ''}>
            <div class="servicio-info">
                <span class="servicio-nombre">${serv.nombre}</span>
                <span class="servicio-precio">Bs ${serv.precio}</span>
            </div>
        </div>
    `).join('');
}

function calcularTotalesDetalle(servicios) {
    // Calcular subtotal (servicios seleccionados)
    const seleccionados = servicios.filter(s => s.seleccionado);
    const subtotal = seleccionados.reduce((sum, s) => sum + s.precio, 0);
    
    // Determinar si aplica diagnóstico
    const aplicarDiagnostico = subtotal === 0;
    
    // Calcular total
    const total = aplicarDiagnostico ? 200 : subtotal;
    
    // Actualizar UI
    subtotalSpan.textContent = `Bs ${subtotal.toLocaleString()}`;
    totalCotizacionSpan.textContent = `Bs ${total.toLocaleString()}`;
    
    // Mostrar/ocultar mensaje de diagnóstico
    diagnosticoMensaje.style.display = aplicarDiagnostico ? 'flex' : 'none';
}

function actualizarTotalDesdeDetalle() {
    if (!cotizacionActual) return;
    
    const checkboxes = document.querySelectorAll('.servicio-checkbox-input');
    const serviciosActualizados = cotizacionActual.servicios.map((serv, index) => {
        if (index < checkboxes.length) {
            return {
                ...serv,
                seleccionado: checkboxes[index]?.checked || false
            };
        }
        return serv;
    });
    
    calcularTotalesDetalle(serviciosActualizados);
}

window.cerrarDetalle = () => {
    detalleVacio.style.display = 'block';
    detalleCotizacion.style.display = 'none';
    cerrarDetalleBtn.style.display = 'none';
    cotizacionActual = null;
};

// =====================================================
// NUEVA COTIZACIÓN
// =====================================================
async function loadOrdenesParaCotizar() {
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/ordenes-para-cotizar`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error);
        }
        
        const ordenSelect = document.getElementById('ordenTrabajo');
        if (ordenSelect && result.data) {
            ordenSelect.innerHTML = '<option value="">Seleccionar orden de trabajo</option>';
            result.data.forEach(orden => {
                ordenSelect.innerHTML += `
                    <option value="${orden.id}">${orden.codigo} - ${orden.vehiculo} (${orden.cliente})</option>
                `;
            });
        }
        
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        // Datos de ejemplo para desarrollo
        const ordenSelect = document.getElementById('ordenTrabajo');
        if (ordenSelect) {
            ordenSelect.innerHTML = `
                <option value="">Seleccionar orden de trabajo</option>
                <option value="1">OT-240317-001 - Toyota Corolla (ABC123) (Juan Pérez)</option>
                <option value="2">OT-240317-002 - Honda Civic (XYZ789) (María López)</option>
                <option value="3">OT-240316-015 - Suzuki Swift (DEF456) (Roberto Méndez)</option>
            `;
        }
    }
}

window.nuevaCotizacion = async () => {
    await loadOrdenesParaCotizar();
    resetModalForm();
    document.getElementById('nuevaCotizacionModal').classList.add('show');
    actualizarPreviewTotal();
};

window.cerrarModal = () => {
    document.getElementById('nuevaCotizacionModal').classList.remove('show');
    resetModalForm();
};

function resetModalForm() {
    document.getElementById('nuevaCotizacionForm').reset();
    
    // Reset checkboxes
    const checkboxes = document.querySelectorAll('#nuevaCotizacionModal input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    
    // Reset campos personalizados
    const customDesc = document.getElementById('servicioCustomDesc');
    const customPrecio = document.getElementById('servicioCustomPrecio');
    if (customDesc) customDesc.value = '';
    if (customPrecio) customPrecio.value = '';
    
    actualizarPreviewTotal();
}

function actualizarPreviewTotal() {
    if (!previewTotal) return;
    
    // Calcular total de servicios predefinidos
    const checkboxes = document.querySelectorAll('#nuevaCotizacionModal input[type="checkbox"]');
    let total = 0;
    
    checkboxes.forEach(cb => {
        if (cb.checked) {
            total += parseFloat(cb.value) || 0;
        }
    });
    
    // Agregar servicio personalizado
    const customPrecio = document.getElementById('servicioCustomPrecio')?.value;
    if (customPrecio) {
        total += parseFloat(customPrecio) || 0;
    }
    
    // Determinar si aplica diagnóstico
    const aplicarDiagnostico = total === 0;
    const diagnosticoPreview = document.getElementById('diagnosticoPreview');
    
    if (aplicarDiagnostico) {
        total = 200;
        if (diagnosticoPreview) {
            diagnosticoPreview.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <span>Diagnóstico Bs. 200 aplicado (sin servicios seleccionados)</span>
            `;
        }
    } else {
        if (diagnosticoPreview) {
            diagnosticoPreview.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <span>Diagnóstico gratuito por seleccionar servicios</span>
            `;
        }
    }
    
    previewTotal.textContent = `Bs ${total.toLocaleString()}`;
}

window.agregarServicioCustom = () => {
    const desc = document.getElementById('servicioCustomDesc');
    const precio = document.getElementById('servicioCustomPrecio');
    
    if (!desc.value || !precio.value) {
        mostrarNotificacion('Complete descripción y precio', 'warning');
        return;
    }
    
    // Crear elemento de servicio personalizado
    const serviciosGrid = document.querySelector('.servicios-grid');
    if (serviciosGrid) {
        const nuevoServicio = document.createElement('div');
        nuevoServicio.className = 'servicio-item';
        nuevoServicio.innerHTML = `
            <input type="checkbox" id="servicio-custom-${Date.now()}" value="${precio.value}" checked>
            <label for="servicio-custom-${Date.now()}">
                <strong>${desc.value}</strong>
                <span>Bs ${parseFloat(precio.value).toLocaleString()}</span>
            </label>
        `;
        serviciosGrid.appendChild(nuevoServicio);
        
        // Agregar event listener al nuevo checkbox
        const newCheckbox = nuevoServicio.querySelector('input[type="checkbox"]');
        newCheckbox.addEventListener('change', actualizarPreviewTotal);
    }
    
    mostrarNotificacion('Servicio personalizado agregado', 'success');
    
    // Limpiar campos
    desc.value = '';
    precio.value = '';
    
    actualizarPreviewTotal();
};

window.guardarCotizacion = async () => {
    // Validar orden de trabajo seleccionada
    const ordenSelect = document.getElementById('ordenTrabajo');
    const ordenId = ordenSelect.value;
    
    if (!ordenId) {
        mostrarNotificacion('Seleccione una orden de trabajo', 'warning');
        return;
    }
    
    // Recopilar servicios seleccionados
    const servicios = [];
    const checkboxes = document.querySelectorAll('#nuevaCotizacionModal .servicio-item input[type="checkbox"]:checked');
    
    checkboxes.forEach(cb => {
        const label = cb.nextElementSibling;
        if (label) {
            const nombre = label.querySelector('strong')?.textContent || 'Servicio';
            const precio = parseFloat(cb.value) || 0;
            servicios.push({
                descripcion: nombre,
                precio: precio
            });
        }
    });
    
    // Si no hay servicios seleccionados, agregar diagnóstico
    if (servicios.length === 0) {
        servicios.push({
            descripcion: 'Diagnóstico',
            precio: 200
        });
    }
    
    // Deshabilitar botón mientras se procesa
    const btnGuardar = document.querySelector('.modal-footer .btn-primary');
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({
                orden_trabajo_id: parseInt(ordenId),
                servicios: servicios
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al guardar cotización');
        }
        
        mostrarNotificacion('Cotización guardada exitosamente', 'success');
        cerrarModal();
        await loadCotizaciones(); // Recargar lista
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = 'Guardar Cotización';
    }
};

// =====================================================
// ACCIONES DE COTIZACIÓN
// =====================================================
window.enviarCotizacion = async () => {
    if (!cotizacionActual) {
        mostrarNotificacion('Seleccione una cotización', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones/${cotizacionActual.id}/enviar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al enviar');
        }
        
        mostrarNotificacion(`Cotización ${cotizacionActual.codigo} enviada al cliente`, 'success');
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
};

window.generarPDF = () => {
    if (!cotizacionActual) {
        mostrarNotificacion('Seleccione una cotización', 'warning');
        return;
    }
    
    mostrarNotificacion(`Generando PDF de ${cotizacionActual.codigo}...`, 'info');
    
    // Aquí iría la lógica real de generación de PDF
    setTimeout(() => {
        mostrarNotificacion('PDF generado correctamente', 'success');
    }, 2000);
};

// =====================================================
// ACTUALIZAR ESTADO (para pruebas)
// =====================================================
window.cambiarEstado = async (nuevoEstado) => {
    if (!cotizacionActual) {
        mostrarNotificacion('Seleccione una cotización', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/jefe-operativo/cotizaciones/${cotizacionActual.id}/estado`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Error al actualizar');
        }
        
        mostrarNotificacion(`Estado actualizado a ${nuevoEstado}`, 'success');
        
        // Recargar cotizaciones
        await loadCotizaciones();
        
        // Cerrar detalle
        cerrarDetalle();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion(error.message, 'error');
    }
};

// =====================================================
// NOTIFICACIONES
// =====================================================
function mostrarNotificacion(mensaje, tipo = 'info') {
    // Verificar si ya existe un contenedor de toasts
    let toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;
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
    
    toast.innerHTML = `
        <i class="fas ${iconos[tipo] || iconos.info}"></i>
        <span>${mensaje}</span>
    `;
    
    toast.style.cssText = `
        background: white;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        animation: slideIn 0.3s ease;
        border-left: 4px solid ${tipo === 'success' ? '#10B981' : tipo === 'error' ? '#C1121F' : tipo === 'warning' ? '#F59E0B' : '#2C3E50'};
        min-width: 300px;
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// =====================================================
// LOGOUT
// =====================================================
window.logout = () => {
    localStorage.removeItem('furia_token');
    localStorage.removeItem('furia_user');
    localStorage.removeItem('furia_remembered');
    localStorage.removeItem('furia_remembered_type');
    window.location.href = '/';
};

// Agregar estilos para animaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);