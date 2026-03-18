// =====================================================
// CONFIGURACIÓN
// =====================================================
const API_URL = 'http://localhost:5000/api';

// Elementos DOM
const salidasTableBody = document.getElementById('salidasTableBody');
const searchInput = document.getElementById('searchInput');
const estadoFilter = document.getElementById('estadoFilter');
const fechaFilter = document.getElementById('fechaFilter');
const currentDateSpan = document.getElementById('currentDate');
const listosCount = document.getElementById('listosCount');
const entregadosHoyCount = document.getElementById('entregadosHoyCount');
const pendientesFirmaCount = document.getElementById('pendientesFirmaCount');

// Variables para firma
let signaturePad = null;
let currentColor = '#0F0F10';
let vehiculoSeleccionado = null;

// Variables globales
let salidasData = [];

// =====================================================
// INICIALIZACIÓN
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initPage();
    await loadSalidas();
    setupEventListeners();
    initSignaturePad();
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
        searchInput.addEventListener('input', filtrarSalidas);
    }
    
    // Filtros
    if (estadoFilter) {
        estadoFilter.addEventListener('change', filtrarSalidas);
    }
    
    if (fechaFilter) {
        fechaFilter.addEventListener('change', filtrarSalidas);
    }
}

// Inicializar pad de firma
function initSignaturePad() {
    const canvas = document.getElementById('signatureCanvas');
    if (canvas) {
        signaturePad = new SignaturePad(canvas, {
            penColor: currentColor,
            backgroundColor: '#FFFFFF',
            minWidth: 0.5,
            maxWidth: 2.5,
            throttle: 16
        });
        
        // Ajustar tamaño del canvas
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
}

function resizeCanvas() {
    const canvas = document.getElementById('signatureCanvas');
    if (canvas && signaturePad) {
        const container = canvas.parentElement;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        
        canvas.width = container.offsetWidth;
        canvas.height = 200;
        
        signaturePad.clear();
    }
}

// =====================================================
// CARGAR DATOS DESDE API
// =====================================================
async function loadSalidas() {
    try {
        // Mostrar loading
        salidasTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem;">
                    <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
            </tr>
        `;
        
        const response = await fetch(`${API_URL}/jefe-operativo/control-salidas`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('furia_token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Error al cargar datos');
        }
        
        const result = await response.json();
        salidasData = result.data || [];
        
        actualizarEstadisticas();
        renderTabla();
        
    } catch (error) {
        console.error('Error:', error);
        cargarDatosEjemplo();
    }
}

// Datos de ejemplo para desarrollo
function cargarDatosEjemplo() {
    salidasData = [
        {
            id: 1,
            codigo: 'OT-240317-001',
            cliente: 'Juan Pérez',
            vehiculo: 'Toyota Corolla',
            placa: 'ABC123',
            tecnico: 'Luis Mamani',
            estado: 'finalizado',
            fechaFinalizacion: '2026-03-17T15:30:00',
            telefonoCliente: '77712345',
            trabajos: ['Cambio de aceite', 'Frenos (pastillas)']
        },
        {
            id: 2,
            codigo: 'OT-240317-002',
            cliente: 'María López',
            vehiculo: 'Honda Civic',
            placa: 'XYZ789',
            tecnico: 'Carlos Rodríguez',
            estado: 'finalizado',
            fechaFinalizacion: '2026-03-17T14:15:00',
            telefonoCliente: '77712346',
            trabajos: ['Reparación de motor']
        },
        {
            id: 3,
            codigo: 'OT-240316-015',
            cliente: 'Roberto Méndez',
            vehiculo: 'Suzuki Swift',
            placa: 'DEF456',
            tecnico: 'Luis Mamani',
            estado: 'finalizado',
            fechaFinalizacion: '2026-03-16T11:30:00',
            telefonoCliente: '77712347',
            trabajos: ['Cambio de batería']
        },
        {
            id: 4,
            codigo: 'OT-240316-012',
            cliente: 'Ana Flores',
            vehiculo: 'Nissan Versa',
            placa: 'GHI789',
            tecnico: 'Juan Pérez',
            estado: 'entregado',
            fechaFinalizacion: '2026-03-16T10:00:00',
            telefonoCliente: '77712348',
            trabajos: ['Alineación y balanceo']
        },
        {
            id: 5,
            codigo: 'OT-240315-008',
            cliente: 'Carlos Ruiz',
            vehiculo: 'Chevrolet Spark',
            placa: 'JKL012',
            tecnico: 'María González',
            estado: 'finalizado',
            fechaFinalizacion: '2026-03-15T16:45:00',
            telefonoCliente: '77712349',
            trabajos: ['Diagnóstico computarizado']
        }
    ];
    
    actualizarEstadisticas();
    renderTabla();
}

// Actualizar estadísticas
function actualizarEstadisticas() {
    const hoy = new Date().toDateString();
    
    const listos = salidasData.filter(v => v.estado === 'finalizado').length;
    const entregadosHoy = salidasData.filter(v => {
        if (v.estado !== 'entregado') return false;
        const fecha = new Date(v.fechaFinalizacion).toDateString();
        return fecha === hoy;
    }).length;
    const pendientesFirma = salidasData.filter(v => v.estado === 'finalizado').length;
    
    if (listosCount) listosCount.textContent = listos;
    if (entregadosHoyCount) entregadosHoyCount.textContent = entregadosHoy;
    if (pendientesFirmaCount) pendientesFirmaCount.textContent = pendientesFirma;
}

// Filtrar salidas
function filtrarSalidas() {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const estado = estadoFilter?.value;
    
    const filtradas = salidasData.filter(v => {
        // Filtro de búsqueda
        const matchesSearch = 
            v.codigo.toLowerCase().includes(searchTerm) ||
            v.cliente.toLowerCase().includes(searchTerm) ||
            v.placa.toLowerCase().includes(searchTerm);
        
        if (!matchesSearch) return false;
        
        // Filtro de estado
        if (estado && v.estado !== estado) return false;
        
        return true;
    });
    
    renderTabla(filtradas);
}

// Renderizar tabla
function renderTabla(datos = salidasData) {
    if (!salidasTableBody) return;
    
    if (datos.length === 0) {
        salidasTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: var(--gris-medio);">
                    <i class="fas fa-car" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>No hay vehículos para mostrar</p>
                </td>
            </tr>
        `;
        return;
    }
    
    salidasTableBody.innerHTML = datos.map(v => {
        const fecha = new Date(v.fechaFinalizacion);
        const fechaStr = fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const estadoClass = v.estado;
        const estadoTexto = v.estado === 'finalizado' ? 'Finalizado' : 'Entregado';
        
        return `
            <tr class="${v.estado}">
                <td><strong>${v.codigo}</strong></td>
                <td>${v.cliente}</td>
                <td>${v.vehiculo}</td>
                <td><span class="plate-badge">${v.placa}</span></td>
                <td>${v.tecnico}</td>
                <td><span class="estado-badge ${estadoClass}">${estadoTexto}</span></td>
                <td>${fechaStr}</td>
                <td>
                    ${v.estado === 'finalizado' ? `
                        <button class="btn-confirmar" onclick="abrirModalEntrega(${v.id})">
                            <i class="fas fa-check-circle"></i> Confirmar Entrega
                        </button>
                    ` : `
                        <button class="btn-ver" onclick="verDetalleEntrega(${v.id})">
                            <i class="fas fa-eye"></i> Ver detalle
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// =====================================================
// MODAL DE ENTREGA
// =====================================================
window.abrirModalEntrega = (id) => {
    vehiculoSeleccionado = salidasData.find(v => v.id === id);
    if (!vehiculoSeleccionado) return;
    
    // Limpiar firma
    if (signaturePad) {
        signaturePad.clear();
    }
    
    // Llenar información
    const infoHTML = `
        <div class="info-grid">
            <div class="info-row">
                <span class="label">Código</span>
                <span class="value"><i class="fas fa-tag"></i> ${vehiculoSeleccionado.codigo}</span>
            </div>
            <div class="info-row">
                <span class="label">Cliente</span>
                <span class="value"><i class="fas fa-user"></i> ${vehiculoSeleccionado.cliente}</span>
            </div>
            <div class="info-row">
                <span class="label">Vehículo</span>
                <span class="value"><i class="fas fa-car"></i> ${vehiculoSeleccionado.vehiculo}</span>
            </div>
            <div class="info-row">
                <span class="label">Placa</span>
                <span class="value"><span class="plate-badge">${vehiculoSeleccionado.placa}</span></span>
            </div>
            <div class="info-row">
                <span class="label">Técnico</span>
                <span class="value"><i class="fas fa-user-cog"></i> ${vehiculoSeleccionado.tecnico}</span>
            </div>
            <div class="info-row">
                <span class="label">Teléfono</span>
                <span class="value"><i class="fas fa-phone"></i> ${vehiculoSeleccionado.telefonoCliente || 'No registrado'}</span>
            </div>
        </div>
        <div style="margin-top: 1rem;">
            <span class="label">Trabajos realizados:</span>
            <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
                ${vehiculoSeleccionado.trabajos?.map(t => `<li>${t}</li>`).join('') || '<li>No especificado</li>'}
            </ul>
        </div>
    `;
    
    document.getElementById('entregaInfo').innerHTML = infoHTML;
    document.getElementById('entregaModal').classList.add('show');
};

window.verDetalleEntrega = (id) => {
    const vehiculo = salidasData.find(v => v.id === id);
    if (!vehiculo) return;
    
    mostrarNotificacion(`Vehículo ${vehiculo.placa} entregado el ${new Date(vehiculo.fechaFinalizacion).toLocaleDateString()}`, 'info');
};

window.cerrarModal = () => {
    document.getElementById('entregaModal').classList.remove('show');
    vehiculoSeleccionado = null;
};

// =====================================================
// FUNCIONES DE FIRMA
// =====================================================
window.limpiarFirma = () => {
    if (signaturePad) {
        signaturePad.clear();
    }
};

window.cambiarColorFirma = () => {
    const colors = ['#0F0F10', '#C1121F', '#2C3E50', '#10B981'];
    const currentIndex = colors.indexOf(currentColor);
    const nextIndex = (currentIndex + 1) % colors.length;
    currentColor = colors[nextIndex];
    
    if (signaturePad) {
        signaturePad.penColor = currentColor;
    }
};

// =====================================================
// ACCIONES DE ENTREGA
// =====================================================
window.confirmarEntrega = async () => {
    if (!vehiculoSeleccionado) {
        mostrarNotificacion('No hay vehículo seleccionado', 'error');
        return;
    }
    
    // Validar firma
    if (signaturePad && signaturePad.isEmpty()) {
        mostrarNotificacion('La firma del cliente es requerida', 'warning');
        return;
    }
    
    const observaciones = document.getElementById('observacionesEntrega').value;
    const documentos = {
        orden: document.getElementById('docOrden').checked,
        garantia: document.getElementById('docGarantia').checked,
        factura: document.getElementById('docFactura').checked,
        manual: document.getElementById('docManual').checked
    };
    
    try {
        // Aquí iría la llamada a la API
        const firmaData = signaturePad ? signaturePad.toDataURL() : null;
        
        console.log('Confirmando entrega:', {
            vehiculo: vehiculoSeleccionado,
            firma: firmaData ? '✓ Firma capturada' : 'Sin firma',
            observaciones,
            documentos
        });
        
        // Simular éxito
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Actualizar estado en la UI
        vehiculoSeleccionado.estado = 'entregado';
        vehiculoSeleccionado.fechaEntrega = new Date().toISOString();
        
        actualizarEstadisticas();
        renderTabla();
        cerrarModal();
        
        mostrarNotificacion('Entrega confirmada exitosamente', 'success');
        
        // Generar comprobante automáticamente
        generarPDF();
        
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al confirmar entrega', 'error');
    }
};

// =====================================================
// FUNCIONES DE PDF
// =====================================================
window.generarPDF = () => {
    if (!vehiculoSeleccionado) {
        mostrarNotificacion('No hay vehículo seleccionado', 'warning');
        return;
    }
    
    // Simular generación de PDF
    const fecha = new Date().toLocaleString();
    const firmaData = signaturePad ? signaturePad.toDataURL() : null;
    
    const pdfPreview = document.getElementById('pdfPreview');
    pdfPreview.innerHTML = `
        <div style="width: 100%; padding: 2rem; background: white; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 2rem;">
                <h2 style="color: #C1121F; margin-bottom: 0.5rem;">FURIA MOTOR COMPANY</h2>
                <h3 style="color: #2C3E50;">COMPROBANTE DE ENTREGA</h3>
            </div>
            
            <div style="margin-bottom: 2rem;">
                <p><strong>Fecha de entrega:</strong> ${fecha}</p>
                <p><strong>Código de orden:</strong> ${vehiculoSeleccionado.codigo}</p>
                <p><strong>Cliente:</strong> ${vehiculoSeleccionado.cliente}</p>
                <p><strong>Vehículo:</strong> ${vehiculoSeleccionado.vehiculo} (${vehiculoSeleccionado.placa})</p>
                <p><strong>Técnico responsable:</strong> ${vehiculoSeleccionado.tecnico}</p>
            </div>
            
            <div style="margin-bottom: 2rem;">
                <h4 style="color: #2C3E50; margin-bottom: 1rem;">Trabajos realizados:</h4>
                <ul>
                    ${vehiculoSeleccionado.trabajos?.map(t => `<li>${t}</li>`).join('') || '<li>No especificado</li>'}
                </ul>
            </div>
            
            <div style="margin-bottom: 2rem;">
                <h4 style="color: #2C3E50; margin-bottom: 1rem;">Documentos entregados:</h4>
                <ul>
                    ${document.getElementById('docOrden').checked ? '<li>✓ Orden de trabajo finalizada</li>' : ''}
                    ${document.getElementById('docGarantia').checked ? '<li>✓ Certificado de garantía</li>' : ''}
                    ${document.getElementById('docFactura').checked ? '<li>✓ Factura / Recibo de pago</li>' : ''}
                    ${document.getElementById('docManual').checked ? '<li>✓ Manual del propietario</li>' : ''}
                </ul>
            </div>
            
            <div style="margin-bottom: 2rem;">
                <h4 style="color: #2C3E50; margin-bottom: 1rem;">Observaciones:</h4>
                <p style="font-style: italic;">${document.getElementById('observacionesEntrega').value || 'Ninguna'}</p>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 3rem;">
                <div style="text-align: center; width: 200px;">
                    <div style="border-top: 1px solid #000; margin-bottom: 0.5rem;"></div>
                    <p><strong>Firma del cliente</strong></p>
                    ${firmaData ? `<img src="${firmaData}" style="max-width: 150px; max-height: 60px; margin-bottom: 0.5rem;">` : ''}
                </div>
                <div style="text-align: center; width: 200px;">
                    <div style="border-top: 1px solid #000; margin-bottom: 0.5rem;"></div>
                    <p><strong>Sello del taller</strong></p>
                </div>
            </div>
            
            <div style="margin-top: 3rem; font-size: 0.8rem; color: #6B7280; text-align: center;">
                <p>Este documento certifica la entrega del vehículo en conformidad con los trabajos realizados.</p>
                <p>FURIA MOTOR COMPANY - Sistema de Gestión Integral</p>
            </div>
        </div>
    `;
    
    document.getElementById('pdfModal').classList.add('show');
};

window.cerrarPDFModal = () => {
    document.getElementById('pdfModal').classList.remove('show');
};

window.descargarPDF = () => {
    mostrarNotificacion('Descargando PDF...', 'info');
    // Aquí iría la lógica real de descarga
    setTimeout(() => {
        mostrarNotificacion('PDF descargado correctamente', 'success');
    }, 1500);
};

window.imprimirPDF = () => {
    mostrarNotificacion('Enviando a impresión...', 'info');
    // Aquí iría la lógica real de impresión
    setTimeout(() => {
        window.print();
    }, 500);
};

// =====================================================
// NOTIFICACIONES
// =====================================================
function mostrarNotificacion(mensaje, tipo = 'info') {
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

// Estilos para animaciones
if (!document.querySelector('#toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
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
}