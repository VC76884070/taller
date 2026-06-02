// =====================================================
// DASHBOARD JEFE DE TALLER - CON FLATPICKR
// VERSIÓN CORREGIDA - DÍAS PINTADOS FUNCIONAL
// =====================================================

if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('192.168.')) {
            console.log('📡 Modo DESARROLLO');
            return 'http://localhost:5000';
        }
        return '';
    })();
}

const API_URL = window.API_BASE_URL + '/api';
let flatpickrInstance = null;
let ordenesActivas = [];
let currentUser = null;
let refreshInterval = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando dashboard Jefe Taller con Flatpickr');
    
    const autenticado = await checkAuth();
    if (!autenticado) return;
    
    await cargarDatosIniciales();
    initFlatpickr();
    setupEventListeners();
    iniciarPolling();
});

async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    if (!token) {
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUser = payload.user;
        
        const fechaElement = document.getElementById('currentDate');
        if (fechaElement) {
            const hoy = new Date();
            fechaElement.textContent = hoy.toLocaleDateString('es-ES', { 
                year: 'numeric', month: 'long', day: 'numeric' 
            });
        }
        return true;
    } catch (error) {
        console.error('Error:', error);
        window.location.href = window.API_BASE_URL + '/';
        return false;
    }
}

function getHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('furia_token')}`,
        'Content-Type': 'application/json'
    };
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => cargarDatosIniciales());
    }
}

function iniciarPolling() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        cargarDatosSilencioso();
    }, 30000);
}

async function cargarDatosSilencioso() {
    try {
        const response = await fetch(`${API_URL}/jefe-taller/ordenes-activas`, {
            headers: getHeaders()
        });
        const data = await response.json();
        if (data.success && data.ordenes) {
            ordenesActivas = data.ordenes;
            if (flatpickrInstance) {
                pintarDiasCalendario();
            }
        }
    } catch (error) {
        console.error('Error en polling:', error);
    }
}

// =====================================================
// CARGAR DATOS INICIALES
// =====================================================

async function cargarDatosIniciales() {
    mostrarLoading(true);
    try {
        const token = localStorage.getItem('furia_token');
        
        console.log('🔄 Cargando datos del dashboard...');
        
        const [bahiasRes, diagnosticosRes, cotizacionesRes, ordenesRes] = await Promise.all([
            fetch(`${API_URL}/jefe-taller/bahias-estado`, { headers: getHeaders() }),
            fetch(`${API_URL}/jefe-taller/diagnosticos-pendientes`, { headers: getHeaders() }),
            fetch(`${API_URL}/jefe-taller/cotizaciones-enviadas-dashboard`, { headers: getHeaders() }),
            fetch(`${API_URL}/jefe-taller/ordenes-activas`, { headers: getHeaders() })
        ]);
        
        const bahias = bahiasRes.ok ? await bahiasRes.json() : null;
        const diagnosticos = diagnosticosRes.ok ? await diagnosticosRes.json() : null;
        const cotizaciones = cotizacionesRes.ok ? await cotizacionesRes.json() : null;
        const ordenes = ordenesRes.ok ? await ordenesRes.json() : null;
        
        if (ordenes && ordenes.success && ordenes.ordenes) {
            ordenesActivas = ordenes.ordenes;
            console.log(`📊 Órdenes activas cargadas: ${ordenesActivas.length}`);
            
            // Debug: mostrar las primeras órdenes con sus fechas
            if (ordenesActivas.length > 0) {
                console.log('📋 Primeras órdenes:');
                ordenesActivas.slice(0, 3).forEach((orden, idx) => {
                    console.log(`  ${idx+1}. ID: ${orden.id_orden}, Placa: ${orden.vehiculo?.placa}, Ingreso: ${orden.fecha_ingreso}, Días: ${orden.dias_estimados_reparacion}`);
                });
            }
        }
        
        console.log('📊 Datos recibidos:');
        console.log('- Bahías:', bahias?.bahias?.length || 0);
        console.log('- Diagnósticos:', diagnosticos?.diagnosticos?.length || 0);
        console.log('- Cotizaciones:', cotizaciones?.cotizaciones?.length || 0);
        console.log('- Órdenes activas:', ordenesActivas.length);
        
        actualizarUI(bahias, diagnosticos, cotizaciones, ordenesActivas);
        
        if (flatpickrInstance) {
            setTimeout(() => {
                pintarDiasCalendario();
            }, 200);
        }
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarNotificacion('Error al cargar datos del servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function actualizarUI(bahias, diagnosticos, cotizaciones, ordenes) {
    if (bahias && bahias.bahias && bahias.bahias.length > 0) {
        renderizarBahias(bahias.bahias);
    } else {
        renderizarVacio('bahiasGrid', 'No hay información de bahías');
    }
    
    if (diagnosticos && diagnosticos.diagnosticos && diagnosticos.diagnosticos.length > 0) {
        renderizarDiagnosticos(diagnosticos.diagnosticos);
        const pendientesCount = document.getElementById('pendientesCount');
        if (pendientesCount) pendientesCount.textContent = diagnosticos.diagnosticos.length;
    } else {
        renderizarVacio('diagnosticosList', 'No hay diagnósticos pendientes');
        const pendientesCount = document.getElementById('pendientesCount');
        if (pendientesCount) pendientesCount.textContent = '0';
    }
    
    if (cotizaciones && cotizaciones.cotizaciones && cotizaciones.cotizaciones.length > 0) {
        renderizarEntregas(cotizaciones.cotizaciones);
    } else {
        renderizarVacio('entregasList', 'No hay cotizaciones enviadas');
    }
    
    if (ordenes && ordenes.length > 0) {
        renderizarVehiculosTaller(ordenes);
        const vehiculosCount = document.getElementById('vehiculosTallerCount');
        if (vehiculosCount) vehiculosCount.textContent = ordenes.length;
    } else {
        renderizarVacio('vehiculosTallerList', 'No hay vehículos en taller');
        const vehiculosCount = document.getElementById('vehiculosTallerCount');
        if (vehiculosCount) vehiculosCount.textContent = '0';
    }
}

function renderizarVacio(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${mensaje}</p></div>`;
    }
}

// =====================================================
// FLATPICKR - CALENDARIO CON DÍAS PINTADOS (VERSIÓN CORREGIDA)
// =====================================================

function initFlatpickr() {
    const calendarInput = document.getElementById('calendarioFlatpickr');
    if (!calendarInput) {
        console.error('❌ No se encontró el elemento calendarioFlatpickr');
        setTimeout(() => initFlatpickr(), 500);
        return;
    }
    
    if (typeof flatpickr === 'undefined') {
        console.error('❌ Flatpickr no está cargado');
        return;
    }
    
    console.log('✅ Inicializando Flatpickr...');
    
    flatpickrInstance = flatpickr(calendarInput, {
        locale: 'es',
        dateFormat: 'Y-m-d',
        inline: true,
        defaultDate: new Date(),
        onChange: function(selectedDates, dateStr) {
            mostrarOrdenesDelDia(dateStr);
        },
        onReady: function() {
            console.log('📅 Flatpickr listo, pintando días...');
            setTimeout(() => {
                pintarDiasCalendario();
            }, 100);
        },
        onMonthChange: function() {
            console.log('📅 Mes cambiado, repintando días...');
            setTimeout(() => pintarDiasCalendario(), 200);
        }
    });
    
    console.log('✅ Flatpickr inicializado');
}

function pintarDiasCalendario() {
    if (!flatpickrInstance) {
        console.log('❌ Flatpickr no inicializado');
        return;
    }
    
    if (!ordenesActivas.length) {
        console.log('📭 No hay órdenes activas para pintar');
        return;
    }
    
    console.log(`🎨 Pintando ${ordenesActivas.length} órdenes en el calendario...`);
    
    const days = document.querySelectorAll('.flatpickr-day');
    if (days.length === 0) {
        console.log('⚠️ No se encontraron días en el calendario');
        setTimeout(() => pintarDiasCalendario(), 100);
        return;
    }
    
    // Limpiar clases anteriores
    days.forEach(day => {
        day.classList.remove('reparacion-dia', 'entrega-dia', 'atrasado-dia');
        day.removeAttribute('title');
        day.style.background = '';
        day.style.borderBottom = '';
    });
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    let totalPintados = 0;
    let errores = [];
    
    ordenesActivas.forEach(orden => {
        if (!orden.fecha_ingreso) {
            console.log(`⚠️ Orden ${orden.id_orden} no tiene fecha_ingreso`);
            return;
        }
        
        // Parsear fecha de ingreso
        let fechaIngreso = new Date(orden.fecha_ingreso);
        if (isNaN(fechaIngreso.getTime())) {
            console.log(`⚠️ Fecha ingreso inválida: ${orden.fecha_ingreso}`);
            return;
        }
        fechaIngreso.setHours(0, 0, 0, 0);
        
        // Calcular fecha de finalización
        let fechaFin;
        if (orden.fecha_estimada_finalizacion) {
            fechaFin = new Date(orden.fecha_estimada_finalizacion);
            fechaFin.setHours(0, 0, 0, 0);
        } else if (orden.dias_estimados_reparacion) {
            fechaFin = new Date(fechaIngreso);
            fechaFin.setDate(fechaIngreso.getDate() + orden.dias_estimados_reparacion);
            fechaFin.setHours(0, 0, 0, 0);
        } else {
            console.log(`⚠️ Orden ${orden.id_orden} no tiene fecha fin estimada`);
            return;
        }
        
        if (isNaN(fechaFin.getTime())) {
            console.log(`⚠️ Fecha fin inválida para orden ${orden.id_orden}`);
            return;
        }
        
        const placa = orden.vehiculo?.placa || orden.codigo_unico || 'Vehículo';
        const modelo = orden.vehiculo?.modelo || '';
        
        console.log(`📅 Orden: ${placa} | Ingreso: ${fechaIngreso.toLocaleDateString()} | Entrega: ${fechaFin.toLocaleDateString()} | Días: ${orden.dias_estimados_reparacion || '?'}`);
        
        // Generar array de fechas en el rango
        const fechas = [];
        let current = new Date(fechaIngreso);
        
        while (current <= fechaFin) {
            fechas.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        
        console.log(`   → Pintando ${fechas.length} días (desde ${fechas[0].toLocaleDateString()} hasta ${fechas[fechas.length-1].toLocaleDateString()})`);
        
        // Pintar cada día
        fechas.forEach(fecha => {
            const dayElement = findDayElement(fecha);
            
            if (dayElement) {
                totalPintados++;
                const esUltimoDia = fecha.getTime() === fechaFin.getTime();
                const estaAtrasado = fechaFin < hoy && esUltimoDia;
                
                if (esUltimoDia) {
                    if (estaAtrasado) {
                        dayElement.classList.add('atrasado-dia');
                        dayElement.setAttribute('title', `⚠️ ATRASADO: ${placa}\nEntrega: ${fechaFin.toLocaleDateString()}`);
                        dayElement.style.background = 'rgba(239, 68, 68, 0.25)';
                        dayElement.style.borderBottom = '3px solid #EF4444';
                    } else {
                        dayElement.classList.add('entrega-dia');
                        dayElement.setAttribute('title', `🚗 ENTREGA: ${placa}\n📅 ${orden.dias_estimados_reparacion || '?'} días`);
                        dayElement.style.background = 'rgba(139, 92, 246, 0.25)';
                        dayElement.style.borderBottom = '3px solid #8B5CF6';
                    }
                } else {
                    dayElement.classList.add('reparacion-dia');
                    let tooltip = `🔧 REPARACIÓN: ${placa} ${modelo}`;
                    if (fecha.getTime() === fechaIngreso.getTime()) {
                        tooltip = `📅 INGRESO: ${placa}`;
                        dayElement.style.background = 'rgba(245, 158, 11, 0.35)';
                    } else {
                        dayElement.style.background = 'rgba(245, 158, 11, 0.25)';
                    }
                    dayElement.setAttribute('title', tooltip);
                    dayElement.style.borderBottom = '1px solid rgba(245, 158, 11, 0.3)';
                }
            } else {
                errores.push(fecha.toLocaleDateString());
            }
        });
    });
    
    console.log(`✅ Días pintados: ${totalPintados}`);
    if (errores.length > 0) {
        console.log(`⚠️ No se encontraron ${errores.length} días:`, errores.slice(0, 5));
    }
}

function formatDateForFlatpickr(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function findDayElement(date) {
    const fecha = date instanceof Date ? date : new Date(date);
    if (isNaN(fecha.getTime())) return null;
    
    const diaNumero = fecha.getDate();
    const mesIndex = fecha.getMonth();
    const anio = fecha.getFullYear();
    
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const nombreMes = meses[mesIndex];
    
    const selectors = [
        `.flatpickr-day[aria-label="${diaNumero} de ${nombreMes} de ${anio}"]`,
        `.flatpickr-day[aria-label="${diaNumero} de ${nombreMes}"]`,
        `.flatpickr-day[data-date="${anio}-${String(mesIndex+1).padStart(2,'0')}-${String(diaNumero).padStart(2,'0')}"]`
    ];
    
    for (let selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.classList && element.classList.contains('flatpickr-day') && !element.classList.contains('flatpickr-disabled')) {
            return element;
        }
    }
    
    const allDays = document.querySelectorAll('.flatpickr-day:not(.flatpickr-disabled)');
    for (let day of allDays) {
        const dayText = day.textContent.trim();
        if (dayText === String(diaNumero)) {
            if (!day.classList.contains('prevMonthDay') && !day.classList.contains('nextMonthDay')) {
                return day;
            }
        }
    }
    
    return null;
}

function mostrarOrdenesDelDia(dateStr) {
    const container = document.getElementById('infoDiaSeleccionado');
    const ordenesContainer = document.getElementById('ordenesDelDia');
    
    if (!container || !ordenesContainer) return;
    
    const fechaSeleccionada = new Date(dateStr);
    if (isNaN(fechaSeleccionada.getTime())) return;
    fechaSeleccionada.setHours(0, 0, 0, 0);
    
    console.log(`🔍 Buscando órdenes para ${fechaSeleccionada.toLocaleDateString()}`);
    
    const ordenesEnDia = ordenesActivas.filter(orden => {
        if (!orden.fecha_ingreso) return false;
        
        let fechaIngreso = new Date(orden.fecha_ingreso);
        if (isNaN(fechaIngreso.getTime())) return false;
        fechaIngreso.setHours(0, 0, 0, 0);
        
        let fechaFin;
        if (orden.fecha_estimada_finalizacion) {
            fechaFin = new Date(orden.fecha_estimada_finalizacion);
        } else if (orden.dias_estimados_reparacion) {
            fechaFin = new Date(fechaIngreso);
            fechaFin.setDate(fechaIngreso.getDate() + orden.dias_estimados_reparacion);
        } else {
            return false;
        }
        if (fechaFin) fechaFin.setHours(0, 0, 0, 0);
        
        return fechaSeleccionada >= fechaIngreso && fechaSeleccionada <= fechaFin;
    });
    
    console.log(`📋 Encontradas ${ordenesEnDia.length} órdenes para esta fecha`);
    
    if (ordenesEnDia.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    ordenesContainer.innerHTML = ordenesEnDia.map(orden => {
        const placa = orden.vehiculo?.placa || orden.codigo_unico || 'Vehículo';
        const marca = orden.vehiculo?.marca || '';
        const modelo = orden.vehiculo?.modelo || '';
        
        let fechaIngreso = new Date(orden.fecha_ingreso);
        fechaIngreso.setHours(0, 0, 0, 0);
        
        let fechaFin;
        if (orden.fecha_estimada_finalizacion) {
            fechaFin = new Date(orden.fecha_estimada_finalizacion);
        } else if (orden.dias_estimados_reparacion) {
            fechaFin = new Date(fechaIngreso);
            fechaFin.setDate(fechaIngreso.getDate() + orden.dias_estimados_reparacion);
        }
        if (fechaFin) fechaFin.setHours(0, 0, 0, 0);
        
        const esUltimoDia = fechaFin && fechaSeleccionada.getTime() === fechaFin.getTime();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const estaAtrasado = fechaFin && fechaFin < hoy && esUltimoDia;
        
        let estadoClase = 'reparacion';
        let estadoTexto = 'En reparación';
        
        if (esUltimoDia) {
            if (estaAtrasado) {
                estadoClase = 'atrasado';
                estadoTexto = '⚠️ ATRASADO';
            } else {
                estadoClase = 'entrega';
                estadoTexto = '🚗 ENTREGA';
            }
        }
        
        const ordenId = orden.id_orden || orden.id;
        
        return `
            <div class="orden-dia-item ${estadoClase}" onclick="window.verOrdenTrabajo(${ordenId})">
                <div class="orden-dia-placa">
                    <strong>${escapeHtml(placa)}</strong> - ${escapeHtml(marca)} ${escapeHtml(modelo)}
                </div>
                <div class="orden-dia-estado ${estadoClase}">${estadoTexto}</div>
            </div>
        `;
    }).join('');
}

// =====================================================
// RENDERIZADO DE BAHÍAS
// =====================================================

function renderizarBahias(bahias) {
    const container = document.getElementById('bahiasGrid');
    if (!container) return;
    
    const estadosTexto = { 'ocupada': 'Ocupada', 'reservada': 'Reservada', 'libre': 'Libre' };
    const estadosColor = { 'ocupada': '#E91E63', 'reservada': '#FF9800', 'libre': '#4CAF50' };
    
    if (!bahias || bahias.length === 0) {
        renderizarVacio('bahiasGrid', 'No hay información de bahías');
        return;
    }
    
    container.innerHTML = bahias.map(b => `
        <div class="bahia-item ${b.estado}" onclick="window.verDetalleBahia(${b.numero})" style="border-left: 4px solid ${estadosColor[b.estado] || '#ccc'}">
            <div class="bahia-numero">Bahía ${b.numero}</div>
            <div class="bahia-estado" style="color: ${estadosColor[b.estado] || '#666'}">${estadosTexto[b.estado] || b.estado}</div>
            ${b.tecnico ? `<div class="bahia-tecnico"><i class="fas fa-user"></i> ${escapeHtml(b.tecnico)}</div>` : ''}
            ${b.orden_codigo ? `<div class="bahia-orden"><i class="fas fa-clipboard"></i> ${escapeHtml(b.orden_codigo)}</div>` : ''}
        </div>
    `).join('');
}

// =====================================================
// RENDERIZADO DE DIAGNÓSTICOS
// =====================================================

function renderizarDiagnosticos(diagnosticos) {
    const container = document.getElementById('diagnosticosList');
    if (!container) return;
    
    if (!diagnosticos || diagnosticos.length === 0) {
        renderizarVacio('diagnosticosList', 'No hay diagnósticos pendientes');
        return;
    }
    
    container.innerHTML = diagnosticos.map(d => {
        const vehiculo = d.vehiculo || 'Vehículo';
        const placa = d.placa || '';
        const informe = d.informe || 'Sin informe';
        const fecha = formatearFecha(d.fecha_envio);
        const tecnico = d.tecnico_nombre || 'Sin técnico';
        const diagnosticoId = d.diagnostico_id || d.id;
        
        return `
            <div class="diagnostico-item" onclick="window.revisarDiagnostico(${diagnosticoId})">
                <div class="diagnostico-icon"><i class="fas fa-stethoscope"></i></div>
                <div class="diagnostico-content">
                    <h4>${escapeHtml(vehiculo)} ${placa ? `<span class="placa">${escapeHtml(placa)}</span>` : ''}</h4>
                    <p class="informe-preview">${escapeHtml(informe.substring(0, 80))}${informe.length > 80 ? '...' : ''}</p>
                    <div class="diagnostico-meta">
                        <span class="tecnico"><i class="fas fa-user"></i> ${escapeHtml(tecnico)}</span>
                        <span class="fecha"><i class="far fa-calendar"></i> ${fecha}</span>
                    </div>
                </div>
                <div class="diagnostico-action">
                    <button class="btn-revisar">Revisar</button>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// RENDERIZADO DE ENTREGAS (COTIZACIONES)
// =====================================================

function renderizarEntregas(cotizaciones) {
    const container = document.getElementById('entregasList');
    if (!container) return;
    
    if (!cotizaciones || cotizaciones.length === 0) {
        renderizarVacio('entregasList', 'No hay cotizaciones pendientes');
        return;
    }
    
    container.innerHTML = cotizaciones.slice(0, 5).map(c => {
        const vehiculo = c.vehiculo || 'Vehículo';
        const placa = c.placa || '';
        const cliente = c.cliente_nombre || 'Cliente';
        const total = c.total || 0;
        const estado = c.estado || 'enviada';
        
        return `
            <div class="entrega-item" onclick="window.verCotizacion(${c.id})">
                <div class="entrega-icon"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="entrega-content">
                    <h4>${escapeHtml(vehiculo)} ${placa ? `<span class="placa">${escapeHtml(placa)}</span>` : ''}</h4>
                    <p class="cliente"><i class="fas fa-user"></i> ${escapeHtml(cliente)}</p>
                    <p class="entrega-total">Bs. ${total.toFixed(2)}</p>
                </div>
                <div class="entrega-status">
                    <span class="status-badge ${estado === 'aprobada' ? 'aprobada' : 'pendiente'}">
                        ${estado === 'aprobada' ? 'Aprobada' : 'Pendiente'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// RENDERIZADO DE VEHÍCULOS EN TALLER
// =====================================================

function renderizarVehiculosTaller(ordenes) {
    const container = document.getElementById('vehiculosTallerList');
    if (!container) return;
    
    if (!ordenes || ordenes.length === 0) {
        renderizarVacio('vehiculosTallerList', 'No hay vehículos en taller');
        return;
    }
    
    const estadoColor = {
        'EnRecepcion': '#FF9800', 'EnDiagnostico': '#2196F3', 'EnReparacion': '#4CAF50',
        'EnPausa': '#9E9E9E', 'PendienteAprobacion': '#FF5722'
    };
    
    const estadoDisplay = {
        'EnRecepcion': 'En Recepción', 'EnDiagnostico': 'En Diagnóstico', 'EnReparacion': 'En Reparación',
        'EnPausa': 'En Pausa', 'ReparacionCompletada': 'Reparación Completada',
        'Finalizado': 'Finalizado', 'Entregado': 'Entregado'
    };
    
    container.innerHTML = ordenes.map(orden => {
        const vehiculo = orden.vehiculo || {};
        const placa = vehiculo.placa || orden.codigo_unico || 'Vehículo';
        const marca = vehiculo.marca || '';
        const modelo = vehiculo.modelo || '';
        const estadoGlobal = orden.estado_global;
        const ordenId = orden.id_orden || orden.id;
        
        let diasTexto = '';
        if (orden.dias_estimados_reparacion) {
            diasTexto = `${orden.dias_estimados_reparacion} días estimados`;
        }
        
        return `
            <div class="vehiculo-taller-item" onclick="window.verOrdenTrabajo(${ordenId})">
                <div class="vehiculo-taller-icon"><i class="fas fa-car-side"></i></div>
                <div class="vehiculo-taller-info">
                    <div class="vehiculo-taller-placa">${escapeHtml(placa)}</div>
                    <div class="vehiculo-taller-modelo">${escapeHtml(marca)} ${escapeHtml(modelo)}</div>
                    <div class="vehiculo-taller-estado" style="color: ${estadoColor[estadoGlobal] || '#666'}">
                        <i class="fas fa-circle" style="font-size: 8px;"></i> ${estadoDisplay[estadoGlobal] || estadoGlobal || 'En proceso'}
                    </div>
                </div>
                ${diasTexto ? `<div class="vehiculo-taller-dias">${diasTexto}</div>` : ''}
            </div>
        `;
    }).join('');
}

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

function formatearFecha(fecha) {
    if (!fecha) return 'Fecha no disponible';
    try {
        const d = new Date(fecha);
        if (isNaN(d.getTime())) return fecha;
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return fecha;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    const icon = tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<span><i class="fas ${icon}"></i> ${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// =====================================================
// FUNCIONES GLOBALES (para onclick)
// =====================================================

window.verDetalleBahia = (numero) => {
    mostrarNotificacion(`Ver detalles de Bahía ${numero}`, 'info');
};

window.revisarDiagnostico = (id) => {
    if (id) {
        window.location.href = window.API_BASE_URL + `/jefe_taller/diagnostico.html?diagnostico_id=${id}`;
    }
};

window.verCotizacion = (id) => {
    if (id) {
        window.location.href = window.API_BASE_URL + `/jefe_taller/cotizaciones.html?id=${id}`;
    }
};

window.verOrdenTrabajo = (id) => {
    if (id) {
        window.location.href = window.API_BASE_URL + `/jefe_taller/orden_trabajo.html?id=${id}`;
    }
};

window.logout = () => {
    localStorage.clear();
    window.location.href = window.API_BASE_URL + '/';
};