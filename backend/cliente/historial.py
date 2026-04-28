# =====================================================
# HISTORIAL.PY - CLIENTE
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import cliente_required
import datetime
import logging

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
historial_cliente_bp = Blueprint('historial_cliente', __name__)  # Sin url_prefix

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_cliente_por_usuario(usuario_id):
    """Obtener cliente a partir del usuario"""
    try:
        cliente = supabase.table('cliente') \
            .select('id, nombre, telefono, email, direccion') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return None
        return cliente.data[0]
    except Exception as e:
        logger.error(f"Error obteniendo cliente: {e}")
        return None


def obtener_vehiculos_cliente(cliente_id):
    """Obtener todos los vehículos de un cliente"""
    try:
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio') \
            .eq('id_cliente', cliente_id) \
            .execute()
        return vehiculos.data or []
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {e}")
        return []


# =====================================================
# ENDPOINTS - VEHÍCULOS HISTORIAL
# =====================================================

@historial_cliente_bp.route('/vehiculos-historial', methods=['GET'])
@cliente_required
def obtener_vehiculos_historial(current_user):
    """Obtener vehículos del cliente con resumen de servicios"""
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        if not vehiculos:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        resultado = []
        for v in vehiculos:
            # Obtener órdenes del vehículo
            ordenes = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, fecha_ingreso, estado_global, monto_total') \
                .eq('id_vehiculo', v['id']) \
                .order('fecha_ingreso', desc=True) \
                .execute()
            
            total_servicios = len(ordenes.data) if ordenes.data else 0
            total_gastado = sum(float(o.get('monto_total', 0)) for o in (ordenes.data or []))
            
            ultimos_servicios = []
            for o in (ordenes.data or [])[:3]:
                ultimos_servicios.append({
                    'fecha': o.get('fecha_ingreso'),
                    'estado': o.get('estado_global')
                })
            
            resultado.append({
                'id': v['id'],
                'placa': v['placa'],
                'marca': v['marca'],
                'modelo': v['modelo'],
                'anio': v.get('anio'),
                'total_servicios': total_servicios,
                'total_gastado': total_gastado,
                'ultimos_servicios': ultimos_servicios
            })
        
        return jsonify({'success': True, 'vehiculos': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos historial: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - SERVICIOS HISTORIAL
# =====================================================

@historial_cliente_bp.route('/servicios-historial', methods=['GET'])
@cliente_required
def obtener_servicios_historial(current_user):
    """Obtener historial de servicios con paginación"""
    try:
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 10, type=int)
        anio = request.args.get('anio')
        
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'servicios': []}), 200
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        vehiculos_map = {v['id']: v for v in vehiculos}
        
        # Construir query base
        query = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, monto_total, id_vehiculo') \
            .in_('id_vehiculo', vehiculos_ids) \
            .order('fecha_ingreso', desc=True)
        
        # Aplicar filtro de año
        if anio and anio != 'all':
            query = query.gte('fecha_ingreso', f"{anio}-01-01").lt('fecha_ingreso', f"{int(anio)+1}-01-01")
        
        # Obtener total de registros
        count_result = query.execute()
        total = len(count_result.data) if count_result.data else 0
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        
        # Obtener registros paginados
        offset = (page - 1) * limit
        result = query.range(offset, offset + limit - 1).execute()
        
        servicios = []
        for o in (result.data or []):
            v = vehiculos_map.get(o['id_vehiculo'], {})
            
            # Obtener servicios de la orden
            cotizacion = supabase.table('cotizacion') \
                .select('cotizacion_servicio!inner(precio, servicio_tecnico!inner(descripcion))') \
                .eq('id_orden_trabajo', o['id']) \
                .execute()
            
            servicios_count = 0
            if cotizacion.data and cotizacion.data[0].get('cotizacion_servicio'):
                servicios_count = len(cotizacion.data[0]['cotizacion_servicio'])
            
            monto_total = float(o.get('monto_total', 0))
            if monto_total == 0 and cotizacion.data:
                # Calcular desde los servicios si no hay monto total
                for cs in cotizacion.data[0].get('cotizacion_servicio', []):
                    monto_total += float(cs.get('precio', 0))
            
            servicios.append({
                'orden_id': o['id'],
                'codigo_orden': o['codigo_unico'],
                'fecha': o['fecha_ingreso'],
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')}".strip() or 'Vehículo',
                'placa': v.get('placa', ''),
                'servicios_count': servicios_count,
                'monto_total': monto_total,
                'estado': o['estado_global']
            })
        
        return jsonify({
            'success': True,
            'servicios': servicios,
            'pagination': {
                'current_page': page,
                'per_page': limit,
                'total': total,
                'total_pages': total_pages
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo servicios historial: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@historial_cliente_bp.route('/detalle-servicio/<int:orden_id>', methods=['GET'])
@cliente_required
def obtener_detalle_servicio_historial(current_user, orden_id):
    """Obtener detalle completo de un servicio"""
    try:
        # Verificar que la orden pertenece al cliente
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        orden = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, fecha_ingreso, fecha_salida, 
                estado_global, monto_total, kilometraje_ingreso, kilometraje_salida,
                transcripcion_problema, trabajos_realizados, observaciones_finales,
                id_vehiculo, vehiculo!inner(marca, modelo, placa, anio),
                cliente_nombre, cliente_telefono, cliente_email
            ''') \
            .eq('id', orden_id) \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Servicio no encontrado'}), 404
        
        o = orden.data[0]
        v = o.get('vehiculo', {})
        
        # Obtener servicios de la cotización
        cotizacion = supabase.table('cotizacion') \
            .select('''
                id, fecha_generacion, estado,
                cotizacion_servicio!inner(
                    id, id_servicio,
                    precio, aprobado_por_cliente,
                    servicio_tecnico!inner(descripcion)
                )
            ''') \
            .eq('id_orden_trabajo', orden_id) \
            .execute()
        
        servicios = []
        monto_total = float(o.get('monto_total', 0))
        
        if cotizacion.data:
            cot = cotizacion.data[0]
            for cs in cot.get('cotizacion_servicio', []):
                st = cs.get('servicio_tecnico', {})
                precio = float(cs.get('precio', 0))
                servicios.append({
                    'id': cs.get('id'),
                    'id_servicio': cs.get('id_servicio'),
                    'descripcion': st.get('descripcion', 'Servicio'),
                    'precio': precio,
                    'aprobado_por_cliente': cs.get('aprobado_por_cliente', False)
                })
            
            if monto_total == 0:
                monto_total = sum(s['precio'] for s in servicios)
        
        return jsonify({
            'success': True,
            'servicio': {
                'orden_id': o['id'],
                'codigo_orden': o['codigo_unico'],
                'fecha': o['fecha_ingreso'],
                'fecha_salida': o.get('fecha_salida'),
                'estado': o['estado_global'],
                'monto_total': monto_total,
                'kilometraje_ingreso': o.get('kilometraje_ingreso'),
                'kilometraje_salida': o.get('kilometraje_salida'),
                'placa': v.get('placa'),
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')}".strip(),
                'anio': v.get('anio'),
                'cliente_nombre': o.get('cliente_nombre'),
                'cliente_telefono': o.get('cliente_telefono'),
                'cliente_email': o.get('cliente_email'),
                'descripcion_problema': o.get('transcripcion_problema'),
                'trabajos_realizados': o.get('trabajos_realizados'),
                'observaciones': o.get('observaciones_finales'),
                'servicios': servicios
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle servicio: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - ESTADÍSTICAS
# =====================================================

@historial_cliente_bp.route('/estadisticas-cliente', methods=['GET'])
@cliente_required
def obtener_estadisticas_cliente(current_user):
    """Obtener estadísticas para el dashboard del cliente"""
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'stats': {}}), 200
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        vehiculos_map = {v['id']: v for v in vehiculos}
        
        # Obtener todas las órdenes
        ordenes = supabase.table('ordentrabajo') \
            .select('id, estado_global, monto_total, fecha_ingreso, id_vehiculo') \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        ordenes_data = ordenes.data or []
        
        total_servicios = len(ordenes_data)
        total_gastado = sum(float(o.get('monto_total', 0)) for o in ordenes_data)
        promedio = total_gastado / total_servicios if total_servicios > 0 else 0
        
        # Gastos por mes (últimos 12 meses)
        gastos_por_mes = []
        hoy = datetime.datetime.now()
        for i in range(11, -1, -1):
            mes = hoy.month - i
            año = hoy.year
            if mes <= 0:
                mes += 12
                año -= 1
            
            mes_str = f"{año}-{mes:02d}"
            nombre_mes = datetime.date(año, mes, 1).strftime('%b %Y')
            
            monto_mes = 0
            for o in ordenes_data:
                fecha = o.get('fecha_ingreso', '')
                if fecha.startswith(mes_str):
                    monto_mes += float(o.get('monto_total', 0))
            
            gastos_por_mes.append({
                'mes': nombre_mes,
                'monto': monto_mes
            })
        
        # Servicios por vehículo
        servicios_por_vehiculo = []
        vehiculo_counts = {}
        for o in ordenes_data:
            vid = o.get('id_vehiculo')
            if vid:
                vehiculo_counts[vid] = vehiculo_counts.get(vid, 0) + 1
        
        for vid, count in vehiculo_counts.items():
            v = vehiculos_map.get(vid, {})
            if v:
                servicios_por_vehiculo.append({
                    'placa': v.get('placa', 'N/A'),
                    'total': count
                })
        
        # Estados
        estados = {}
        for o in ordenes_data:
            estado = o.get('estado_global', 'Desconocido')
            estados[estado] = estados.get(estado, 0) + 1
        
        return jsonify({
            'success': True,
            'stats': {
                'total_servicios': total_servicios,
                'total_gastado': total_gastado,
                'total_vehiculos': len(vehiculos),
                'promedio_servicio': promedio,
                'gastos_por_mes': gastos_por_mes,
                'servicios_por_vehiculo': servicios_por_vehiculo,
                'estados': estados
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - DOCUMENTOS
# =====================================================

@historial_cliente_bp.route('/documentos-cliente', methods=['GET'])
@cliente_required
def obtener_documentos_cliente(current_user):
    """Obtener lista de documentos del cliente"""
    try:
        tipo = request.args.get('tipo')
        
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'documentos': []}), 200
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso') \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        documentos = []
        
        # Cotizaciones
        if not tipo or tipo == 'cotizacion' or tipo == 'all':
            for o in (ordenes.data or []):
                cotizaciones = supabase.table('cotizacion') \
                    .select('id, fecha_generacion, estado') \
                    .eq('id_orden_trabajo', o['id']) \
                    .execute()
                
                for c in (cotizaciones.data or []):
                    documentos.append({
                        'id': c['id'],
                        'tipo': 'cotizacion',
                        'titulo': f'Cotización - {o["codigo_unico"]}',
                        'codigo': o['codigo_unico'],
                        'fecha': c['fecha_generacion'],
                        'estado': c.get('estado', 'enviada')
                    })
        
        # Órdenes de trabajo
        if not tipo or tipo == 'orden' or tipo == 'all':
            for o in (ordenes.data or []):
                documentos.append({
                    'id': o['id'],
                    'tipo': 'orden',
                    'titulo': f'Orden de Trabajo - {o["codigo_unico"]}',
                    'codigo': o['codigo_unico'],
                    'fecha': o['fecha_ingreso']
                })
        
        # Ordenar por fecha descendente
        documentos.sort(key=lambda x: x['fecha'], reverse=True)
        
        return jsonify({'success': True, 'documentos': documentos}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo documentos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@historial_cliente_bp.route('/documento/<string:tipo>/<int:id>', methods=['GET'])
@cliente_required
def obtener_documento(current_user, tipo, id):
    """Obtener detalle de un documento específico"""
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        if tipo == 'cotizacion':
            # Obtener cotización
            cotizacion = supabase.table('cotizacion') \
                .select('''
                    id, fecha_generacion, estado,
                    id_orden_trabajo,
                    ordentrabajo!inner(
                        codigo_unico, fecha_ingreso,
                        cliente_nombre, cliente_telefono, cliente_email,
                        vehiculo!inner(marca, modelo, placa)
                    ),
                    cotizacion_servicio!inner(
                        precio, aprobado_por_cliente,
                        servicio_tecnico!inner(descripcion)
                    )
                ''') \
                .eq('id', id) \
                .execute()
            
            if not cotizacion.data:
                return jsonify({'error': 'Documento no encontrado'}), 404
            
            c = cotizacion.data[0]
            orden = c.get('ordentrabajo', {})
            vehiculo = orden.get('vehiculo', {})
            
            servicios = []
            total = 0
            for cs in c.get('cotizacion_servicio', []):
                st = cs.get('servicio_tecnico', {})
                precio = float(cs.get('precio', 0))
                total += precio
                servicios.append({
                    'descripcion': st.get('descripcion', 'Servicio'),
                    'precio': precio,
                    'aprobado_por_cliente': cs.get('aprobado_por_cliente', False)
                })
            
            fecha = datetime.datetime.strptime(c['fecha_generacion'], '%Y-%m-%dT%H:%M:%S.%f') if 'T' in c['fecha_generacion'] else datetime.datetime.strptime(c['fecha_generacion'], '%Y-%m-%d')
            
            html = f"""
            <div class="documento-preview" style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #C1121F;">FURIA MOTOR COMPANY</h1>
                    <h2>INFORME DE COTIZACIÓN</h2>
                    <hr style="border: 1px solid #C1121F;">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <p><strong>Orden de Trabajo:</strong> {orden.get('codigo_unico', 'N/A')}</p>
                    <p><strong>Fecha de Emisión:</strong> {fecha.strftime('%d/%m/%Y %H:%M')}</p>
                    <p><strong>Estado:</strong> {c.get('estado', 'Enviada')}</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #C1121F;">Datos del Cliente</h3>
                    <p><strong>Nombre:</strong> {orden.get('cliente_nombre', 'N/A')}</p>
                    <p><strong>Teléfono:</strong> {orden.get('cliente_telefono', 'N/A')}</p>
                    <p><strong>Email:</strong> {orden.get('cliente_email', 'N/A')}</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #C1121F;">Datos del Vehículo</h3>
                    <p><strong>Placa:</strong> {vehiculo.get('placa', 'N/A')}</p>
                    <p><strong>Vehículo:</strong> {vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #C1121F;">Servicios Cotizados</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 8px; text-align: left;">Descripción</th>
                                <th style="padding: 8px; text-align: right;">Precio</th>
                                <th style="padding: 8px; text-align: center;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {''.join(f"""
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #eee;">{s['descripcion']}</td>
                                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">Bs. {s['precio']:.2f}</td>
                                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                                    {'✓ Aprobado' if s['aprobado_por_cliente'] else '⏳ Pendiente'}
                                </td>
                            </tr>
                            """.replace('\n', '') for s in servicios)}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f5f5f5;">
                                <td style="padding: 10px; text-align: right;"><strong>Total:</strong></td>
                                <td style="padding: 10px; text-align: right;"><strong>Bs. {total:.2f}</strong></td>
                                <td style="padding: 10px;"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #999;">
                    <hr>
                    <p>Documento generado automáticamente por FURIA MOTOR - Sistema de Gestión de Taller</p>
                </div>
            </div>
            """
            
            return jsonify({
                'success': True,
                'documento': {
                    'id': id,
                    'tipo': tipo,
                    'titulo': f'Cotización - {orden.get("codigo_unico", "N/A")}',
                    'html': html
                }
            }), 200
        
        elif tipo == 'orden':
            # Obtener orden de trabajo
            orden = supabase.table('ordentrabajo') \
                .select('''
                    id, codigo_unico, fecha_ingreso, fecha_salida,
                    estado_global, kilometraje_ingreso, kilometraje_salida,
                    transcripcion_problema, trabajos_realizados, observaciones_finales,
                    cliente_nombre, cliente_telefono, cliente_email,
                    vehiculo!inner(marca, modelo, placa, anio)
                ''') \
                .eq('id', id) \
                .in_('id_vehiculo', vehiculos_ids) \
                .execute()
            
            if not orden.data:
                return jsonify({'error': 'Documento no encontrado'}), 404
            
            o = orden.data[0]
            v = o.get('vehiculo', {})
            
            fecha_ingreso = datetime.datetime.strptime(o['fecha_ingreso'], '%Y-%m-%dT%H:%M:%S.%f') if 'T' in o['fecha_ingreso'] else datetime.datetime.strptime(o['fecha_ingreso'], '%Y-%m-%d')
            
            html = f"""
            <div class="documento-preview" style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #C1121F;">FURIA MOTOR COMPANY</h1>
                    <h2>ORDEN DE TRABAJO</h2>
                    <hr style="border: 1px solid #C1121F;">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <p><strong>Código de Orden:</strong> {o.get('codigo_unico', 'N/A')}</p>
                    <p><strong>Fecha de Ingreso:</strong> {fecha_ingreso.strftime('%d/%m/%Y %H:%M')}</p>
                    <p><strong>Estado:</strong> {o.get('estado_global', 'En Recepción')}</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #C1121F;">Datos del Cliente</h3>
                    <p><strong>Nombre:</strong> {o.get('cliente_nombre', 'N/A')}</p>
                    <p><strong>Teléfono:</strong> {o.get('cliente_telefono', 'N/A')}</p>
                    <p><strong>Email:</strong> {o.get('cliente_email', 'N/A')}</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #C1121F;">Datos del Vehículo</h3>
                    <p><strong>Placa:</strong> {v.get('placa', 'N/A')}</p>
                    <p><strong>Vehículo:</strong> {v.get('marca', '')} {v.get('modelo', '')}</p>
                    <p><strong>Año:</strong> {v.get('anio', 'N/A')}</p>
                    <p><strong>Kilometraje Ingreso:</strong> {o.get('kilometraje_ingreso', 0):,} km</p>
                    {f'<p><strong>Kilometraje Salida:</strong> {o.get("kilometraje_salida", 0):,} km</p>' if o.get('kilometraje_salida') else ''}
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #C1121F;">Descripción del Problema</h3>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 5px;">
                        {o.get('transcripcion_problema', 'No se registró descripción')}
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #C1121F;">Trabajos Realizados</h3>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 5px;">
                        {o.get('trabajos_realizados', 'No se registraron trabajos')}
                    </div>
                </div>
                
                {f'''
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #C1121F;">Observaciones</h3>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 5px;">
                        {o.get('observaciones_finales')}
                    </div>
                </div>
                ''' if o.get('observaciones_finales') else ''}
                
                <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #999;">
                    <hr>
                    <p>Documento generado automáticamente por FURIA MOTOR - Sistema de Gestión de Taller</p>
                </div>
            </div>
            """
            
            return jsonify({
                'success': True,
                'documento': {
                    'id': id,
                    'tipo': tipo,
                    'titulo': f'Orden de Trabajo - {o.get("codigo_unico", "N/A")}',
                    'html': html
                }
            }), 200
        
        else:
            return jsonify({'error': 'Tipo de documento no válido'}), 400
        
    except Exception as e:
        logger.error(f"Error obteniendo documento: {str(e)}")
        return jsonify({'error': str(e)}), 500


@historial_cliente_bp.route('/anios-servicios', methods=['GET'])
@cliente_required
def obtener_anios_servicios(current_user):
    """Obtener años disponibles para filtro"""
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'anios': []}), 200
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        ordenes = supabase.table('ordentrabajo') \
            .select('fecha_ingreso') \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        anios = set()
        for o in (ordenes.data or []):
            fecha = o.get('fecha_ingreso')
            if fecha:
                anios.add(fecha[:4])
        
        return jsonify({'success': True, 'anios': sorted(list(anios), reverse=True)}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo años: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - EXPORTACIÓN
# =====================================================

@historial_cliente_bp.route('/exportar-servicios', methods=['GET'])
@cliente_required
def exportar_servicios_csv(current_user):
    """Exportar servicios a CSV"""
    try:
        from io import StringIO, BytesIO
        import csv
        
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        vehiculos_map = {v['id']: v for v in vehiculos}
        
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, monto_total, id_vehiculo') \
            .in_('id_vehiculo', vehiculos_ids) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['Fecha', 'Código Orden', 'Vehículo', 'Placa', 'Monto Total', 'Estado'])
        
        for o in (ordenes.data or []):
            v = vehiculos_map.get(o['id_vehiculo'], {})
            writer.writerow([
                o.get('fecha_ingreso', ''),
                o.get('codigo_unico', ''),
                f"{v.get('marca', '')} {v.get('modelo', '')}".strip(),
                v.get('placa', ''),
                float(o.get('monto_total', 0)),
                o.get('estado_global', '')
            ])
        
        output.seek(0)
        
        from flask import send_file
        return send_file(
            BytesIO(output.getvalue().encode('utf-8-sig')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'servicios_{datetime.datetime.now().strftime("%Y%m%d")}.csv'
        )
        
    except Exception as e:
        logger.error(f"Error exportando servicios: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@historial_cliente_bp.route('/test-historial', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de historial cliente funcionando'}), 200