# =====================================================
# COTIZACIONES - JEFE DE TALLER
# FURIA MOTOR COMPANY SRL
# VERSIÓN MEJORADA CON EDICIÓN DE COTIZACIONES
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
cotizaciones_bp = Blueprint('cotizaciones', __name__, url_prefix='/api/jefe-taller')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_encargados_repuestos():
    """Obtener lista de usuarios con rol encargado_repuestos"""
    try:
        usuarios = supabase.table('usuario').select('id, nombre, contacto, email').execute()
        
        if not usuarios.data:
            return []
        
        encargados = []
        for usuario in usuarios.data:
            try:
                tiene_rol = supabase.rpc('usuario_tiene_rol', {
                    'p_usuario_id': usuario['id'],
                    'p_rol_nombre': 'encargado_repuestos'
                }).execute()
                
                if tiene_rol.data:
                    encargados.append(usuario)
            except Exception as e:
                logger.warning(f"Error verificando rol para usuario {usuario['id']}: {e}")
                continue
        
        return encargados
    except Exception as e:
        logger.error(f"Error obteniendo encargados de repuestos: {e}")
        return []

# =====================================================
# APARTADO 1: OBTENER ÓRDENES CON SERVICIOS
# =====================================================

@cotizaciones_bp.route('/ordenes-con-servicios', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_con_servicios(current_user):
    """Obtener órdenes con diagnóstico aprobado y todos sus servicios con cotizaciones"""
    try:
        query = supabase.table('diagnostico_tecnico') \
            .select('id, id_orden_trabajo, estado') \
            .eq('estado', 'aprobado') \
            .execute()
        
        if not query.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_ids = list(set([d['id_orden_trabajo'] for d in query.data if d.get('id_orden_trabajo')]))
        
        if not ordenes_ids:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa, cliente!inner(usuario!inner(nombre)))') \
            .in_('id', ordenes_ids) \
            .execute()
        
        solicitudes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        
        solicitudes_map = {}
        for s in (solicitudes.data or []):
            key = f"{s.get('id_orden_trabajo')}_{s.get('id_servicio')}"
            solicitudes_map[key] = s
        
        resultado = []
        for o in (ordenes_result.data or []):
            vehiculo = o.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario = cliente.get('usuario', {})
            
            diagnostico = supabase.table('diagnostico_tecnico') \
                .select('id') \
                .eq('id_orden_trabajo', o['id']) \
                .eq('estado', 'aprobado') \
                .order('version', desc=True) \
                .limit(1) \
                .execute()
            
            servicios = []
            if diagnostico.data:
                servicios_result = supabase.table('servicio_tecnico') \
                    .select('id, descripcion, orden') \
                    .eq('id_diagnostico_tecnico', diagnostico.data[0]['id']) \
                    .order('orden') \
                    .execute()
                
                for serv in (servicios_result.data or []):
                    key = f"{o['id']}_{serv['id']}"
                    solicitud = solicitudes_map.get(key, {})
                    
                    estado_cotizacion = 'pendiente'
                    if solicitud.get('id'):
                        if solicitud.get('estado') == 'pendiente':
                            estado_cotizacion = 'solicitado'
                        elif solicitud.get('estado') == 'cotizado':
                            estado_cotizacion = 'cotizado'
                    
                    items = []
                    if solicitud.get('items'):
                        try:
                            items = json.loads(solicitud['items']) if isinstance(solicitud['items'], str) else solicitud['items']
                        except:
                            items = []
                    
                    servicios.append({
                        'id_servicio': serv['id'],
                        'descripcion': serv['descripcion'],
                        'estado_cotizacion': estado_cotizacion,
                        'precio_cotizado': float(solicitud.get('precio_cotizado')) if solicitud.get('precio_cotizado') else 0,
                        'items': items,
                        'id_solicitud': solicitud.get('id')
                    })
            
            total_orden = sum(s.get('precio_cotizado', 0) for s in servicios)
            
            resultado.append({
                'id_orden': o['id'],
                'codigo_unico': o.get('codigo_unico'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'cliente_nombre': usuario.get('nombre', 'No registrado'),
                'marca': vehiculo.get('marca'),
                'modelo': vehiculo.get('modelo'),
                'placa': vehiculo.get('placa'),
                'servicios': servicios,
                'total_orden': total_orden
            })
        
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/datos-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_datos_orden(current_user, id_orden):
    """Obtener datos completos de la orden (cliente, vehículo, etc.)"""
    try:
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        o = orden.data[0]
        id_vehiculo = o.get('id_vehiculo')
        
        vehiculo = supabase.table('vehiculo') \
            .select('id, marca, modelo, placa, anio, kilometraje, id_cliente') \
            .eq('id', id_vehiculo) \
            .execute()
        
        v = vehiculo.data[0] if vehiculo.data else {}
        
        cliente_data = {}
        if v.get('id_cliente'):
            cliente = supabase.table('cliente') \
                .select('id, id_usuario') \
                .eq('id', v.get('id_cliente')) \
                .execute()
            if cliente.data:
                id_usuario = cliente.data[0].get('id_usuario')
                if id_usuario:
                    usuario = supabase.table('usuario') \
                        .select('id, nombre, email, contacto') \
                        .eq('id', id_usuario) \
                        .execute()
                    if usuario.data:
                        cliente_data = usuario.data[0]
        
        return jsonify({
            'success': True,
            'datos': {
                'id_orden': o.get('id'),
                'codigo_unico': o.get('codigo_unico'),
                'fecha_ingreso': o.get('fecha_ingreso'),
                'cliente_nombre': cliente_data.get('nombre', 'No registrado'),
                'cliente_email': cliente_data.get('email'),
                'cliente_telefono': cliente_data.get('contacto'),
                'marca': v.get('marca'),
                'modelo': v.get('modelo'),
                'placa': v.get('placa'),
                'anio': v.get('anio'),
                'kilometraje': v.get('kilometraje')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/ordenes-aprobadas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_aprobadas(current_user):
    """Órdenes con diagnóstico APROBADO (para solicitar cotización)"""
    try:
        query = supabase.table('diagnostico_tecnico') \
            .select('id, id_orden_trabajo, estado') \
            .eq('estado', 'aprobado') \
            .execute()
        
        if not query.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_ids = list(set([d['id_orden_trabajo'] for d in query.data if d.get('id_orden_trabajo')]))
        
        if not ordenes_ids:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .in_('id', ordenes_ids) \
            .execute()
        
        ordenes = []
        for o in (ordenes_result.data or []):
            vehiculo = o.get('vehiculo', {})
            ordenes.append({
                'id_orden': o['id'],
                'codigo_unico': o.get('codigo_unico'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip()
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes aprobadas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/encargados-repuestos', methods=['GET'])
@jefe_taller_required
def obtener_encargados_repuestos_endpoint(current_user):
    """Obtener lista de encargados de repuestos"""
    try:
        encargados = obtener_encargados_repuestos()
        return jsonify({'success': True, 'encargados': encargados}), 200
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 2: SOLICITUDES DE COTIZACIÓN
# =====================================================

@cotizaciones_bp.route('/solicitudes-cotizacion', methods=['GET', 'POST', 'DELETE'])
@jefe_taller_required
def gestionar_solicitudes_cotizacion(current_user):
    """Gestionar solicitudes de cotización"""
    
    if request.method == 'GET':
        try:
            estado = request.args.get('estado')
            id_orden_trabajo = request.args.get('id_orden_trabajo')
            
            query = supabase.table('solicitud_cotizacion_repuesto') \
                .select('*') \
                .eq('id_jefe_taller', current_user['id'])
            
            if estado and estado != 'all':
                query = query.eq('estado', estado)
            if id_orden_trabajo and id_orden_trabajo != 'all':
                query = query.eq('id_orden_trabajo', int(id_orden_trabajo))
            
            query = query.order('fecha_solicitud', desc=True)
            result = query.execute()
            
            if not result.data:
                return jsonify({'success': True, 'solicitudes': []}), 200
            
            ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
            servicios_ids = list(set([s.get('id_servicio') for s in result.data if s.get('id_servicio')]))
            
            ordenes_map = {}
            if ordenes_ids:
                ordenes_result = supabase.table('ordentrabajo') \
                    .select('id, codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
                    .in_('id', ordenes_ids) \
                    .execute()
                
                for o in (ordenes_result.data or []):
                    v = o.get('vehiculo', {})
                    ordenes_map[o['id']] = {
                        'codigo_unico': o.get('codigo_unico'),
                        'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', '')})".strip()
                    }
            
            servicios_map = {}
            if servicios_ids:
                servicios_result = supabase.table('servicio_tecnico') \
                    .select('id, descripcion') \
                    .in_('id', servicios_ids) \
                    .execute()
                for s in (servicios_result.data or []):
                    servicios_map[s['id']] = s.get('descripcion')
            
            solicitudes = []
            for s in result.data:
                orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
                
                items = []
                if s.get('items'):
                    try:
                        items = json.loads(s['items']) if isinstance(s['items'], str) else s['items']
                    except:
                        items = [{'descripcion': s.get('descripcion_pieza'), 'cantidad': s.get('cantidad', 1)}]
                
                solicitudes.append({
                    'id': s.get('id'),
                    'id_orden_trabajo': s.get('id_orden_trabajo'),
                    'id_servicio': s.get('id_servicio'),
                    'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                    'vehiculo': orden_info.get('vehiculo', 'N/A'),
                    'servicio_descripcion': servicios_map.get(s.get('id_servicio'), 'N/A'),
                    'items': items,
                    'estado': s.get('estado', 'pendiente'),
                    'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                    'fecha_solicitud': s.get('fecha_solicitud')
                })
            
            return jsonify({'success': True, 'solicitudes': solicitudes}), 200
            
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            
            id_orden_trabajo = data.get('id_orden_trabajo')
            id_servicio = data.get('id_servicio')
            id_encargado = data.get('id_encargado')
            items = data.get('items', [])
            observaciones = data.get('observaciones', '')
            
            if not id_orden_trabajo or not id_servicio or not id_encargado:
                return jsonify({'error': 'Orden, servicio y encargado son requeridos'}), 400
            
            orden = supabase.table('ordentrabajo').select('id').eq('id', id_orden_trabajo).execute()
            if not orden.data:
                return jsonify({'error': 'Orden no encontrada'}), 404
            
            nueva_solicitud = {
                'id_orden_trabajo': id_orden_trabajo,
                'id_servicio': id_servicio,
                'id_jefe_taller': current_user['id'],
                'id_encargado_repuestos': id_encargado,
                'items': json.dumps(items),
                'observaciones': observaciones,
                'estado': 'pendiente',
                'fecha_solicitud': datetime.datetime.now().isoformat()
            }
            
            result = supabase.table('solicitud_cotizacion_repuesto') \
                .insert(nueva_solicitud) \
                .execute()
            
            if not result.data:
                return jsonify({'error': 'No se pudo crear la solicitud'}), 500
            
            supabase.table('notificacion').insert({
                'id_usuario_destino': id_encargado,
                'tipo': 'solicitud_cotizacion',
                'mensaje': f"🔧 Nueva solicitud de cotización para la orden #{id_orden_trabajo}",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
            
            return jsonify({'success': True, 'message': 'Solicitud creada exitosamente', 'id': result.data[0]['id']}), 201
            
        except Exception as e:
            logger.error(f"Error creando solicitud: {str(e)}")
            return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-cotizacion/<int:id_solicitud>', methods=['DELETE'])
@jefe_taller_required
def eliminar_solicitud_cotizacion(current_user, id_solicitud):
    """Eliminar una solicitud de cotización"""
    try:
        check = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id, estado') \
            .eq('id', id_solicitud) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': 'Solo se pueden eliminar solicitudes pendientes'}), 400
        
        supabase.table('solicitud_cotizacion_repuesto') \
            .delete() \
            .eq('id', id_solicitud) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Solicitud eliminada'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 3: SERVICIOS COTIZADOS (TEMPORAL)
# =====================================================

@cotizaciones_bp.route('/servicios-cotizacion/<int:id_orden>', methods=['GET', 'POST'])
@jefe_taller_required
def gestionar_servicios_cotizacion(current_user, id_orden):
    """Gestionar servicios temporales para la cotización"""
    
    if request.method == 'GET':
        try:
            temporal = supabase.table('cotizacion_temporal') \
                .select('servicios') \
                .eq('id_orden_trabajo', id_orden) \
                .eq('id_jefe_taller', current_user['id']) \
                .execute()
            
            servicios = []
            if temporal.data and temporal.data[0].get('servicios'):
                try:
                    servicios = json.loads(temporal.data[0]['servicios'])
                except:
                    servicios = []
            
            return jsonify({'success': True, 'servicios': servicios}), 200
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            servicios = data.get('servicios', [])
            
            existente = supabase.table('cotizacion_temporal') \
                .select('id') \
                .eq('id_orden_trabajo', id_orden) \
                .eq('id_jefe_taller', current_user['id']) \
                .execute()
            
            if existente.data:
                supabase.table('cotizacion_temporal') \
                    .update({
                        'servicios': json.dumps(servicios),
                        'fecha_actualizacion': datetime.datetime.now().isoformat()
                    }) \
                    .eq('id', existente.data[0]['id']) \
                    .execute()
            else:
                supabase.table('cotizacion_temporal') \
                    .insert({
                        'id_orden_trabajo': id_orden,
                        'id_jefe_taller': current_user['id'],
                        'servicios': json.dumps(servicios),
                        'fecha_creacion': datetime.datetime.now().isoformat(),
                        'fecha_actualizacion': datetime.datetime.now().isoformat()
                    }) \
                    .execute()
            
            return jsonify({'success': True, 'message': 'Servicios guardados'}), 200
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 4: COTIZACIONES ENVIADAS
# =====================================================

@cotizaciones_bp.route('/cotizaciones-enviadas', methods=['GET'])
@jefe_taller_required
def obtener_cotizaciones_enviadas(current_user):
    """Obtener cotizaciones enviadas al cliente con filtro por estado"""
    try:
        estado_filtro = request.args.get('estado', 'all')
        
        query = supabase.table('cotizacion') \
            .select('*') \
            .eq('estado', 'enviada')
        
        if estado_filtro != 'all':
            query = query.eq('estado', estado_filtro)
        
        query = query.order('fecha_envio', desc=True)
        cotizaciones = query.execute()
        
        if not cotizaciones.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        resultado = []
        for cot in cotizaciones.data:
            id_orden = cot.get('id_orden_trabajo')
            
            orden = supabase.table('ordentrabajo') \
                .select('codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa, cliente!inner(usuario!inner(nombre)))') \
                .eq('id', id_orden) \
                .execute()
            
            if not orden.data:
                continue
            
            o = orden.data[0]
            v = o.get('vehiculo', {})
            c = v.get('cliente', {})
            u = c.get('usuario', {})
            
            servicios = []
            if cot.get('servicios_json'):
                try:
                    servicios = json.loads(cot['servicios_json'])
                except:
                    servicios = []
            
            servicios_aprobados = [s for s in servicios if s.get('aprobado_por_cliente', False)]
            total_aprobado = sum(s.get('precio', 0) for s in servicios_aprobados)
            
            resultado.append({
                'id': cot['id'],
                'id_orden_trabajo': id_orden,
                'orden_codigo': o.get('codigo_unico'),
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')}",
                'cliente_nombre': u.get('nombre', 'No registrado'),
                'total': total_aprobado,
                'servicios_aprobados': len(servicios_aprobados),
                'total_servicios': len(servicios),
                'estado': cot.get('estado', 'enviada'),
                'fecha_envio': cot.get('fecha_envio')
            })
        
        return jsonify({'success': True, 'cotizaciones': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/detalle-cotizacion/<int:id_cotizacion>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_cotizacion(current_user, id_cotizacion):
    """Obtener detalle de una cotización específica (incluyendo servicios y archivo)"""
    try:
        cotizacion = supabase.table('cotizacion') \
            .select('*') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        cot = cotizacion.data[0]
        id_orden = cot.get('id_orden_trabajo')
        
        # Obtener datos de la orden
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        orden_info = orden.data[0] if orden.data else {}
        orden_codigo = orden_info.get('codigo_unico', 'N/A')
        
        # Obtener vehículo
        vehiculo_info = {}
        vehiculo_marca = ''
        vehiculo_modelo = ''
        vehiculo_placa = ''
        cliente_nombre = 'No registrado'
        
        if orden_info.get('id_vehiculo'):
            vehiculo = supabase.table('vehiculo') \
                .select('marca, modelo, placa, id_cliente') \
                .eq('id', orden_info['id_vehiculo']) \
                .execute()
            
            if vehiculo.data:
                v = vehiculo.data[0]
                vehiculo_marca = v.get('marca', '')
                vehiculo_modelo = v.get('modelo', '')
                vehiculo_placa = v.get('placa', '')
                
                # Obtener cliente
                if v.get('id_cliente'):
                    cliente = supabase.table('cliente') \
                        .select('id_usuario') \
                        .eq('id', v['id_cliente']) \
                        .execute()
                    
                    if cliente.data and cliente.data[0].get('id_usuario'):
                        usuario = supabase.table('usuario') \
                            .select('nombre') \
                            .eq('id', cliente.data[0]['id_usuario']) \
                            .execute()
                        
                        if usuario.data:
                            cliente_nombre = usuario.data[0].get('nombre', 'No registrado')
        
        # Obtener servicios
        servicios = []
        total = 0
        if cot.get('servicios_json'):
            try:
                servicios = json.loads(cot['servicios_json'])
                total = sum(s.get('precio', 0) for s in servicios)
            except:
                servicios = []
        
        return jsonify({
            'success': True,
            'detalle': {
                'id': cot['id'],
                'id_orden_trabajo': id_orden,
                'orden_codigo': orden_codigo,
                'cliente_nombre': cliente_nombre,
                'vehiculo_marca': vehiculo_marca,
                'vehiculo_modelo': vehiculo_modelo,
                'vehiculo_placa': vehiculo_placa,
                'fecha_envio': cot.get('fecha_envio'),
                'servicios': servicios,
                'total': total,
                'estado': cot.get('estado', 'enviada'),
                'notas': cot.get('notas'),
                'nombre_archivo': cot.get('nombre_archivo')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 5: ENVIAR COTIZACIÓN CON ARCHIVO Y SERVICIOS
# =====================================================

@cotizaciones_bp.route('/enviar-cotizacion', methods=['POST'])
@jefe_taller_required
def enviar_cotizacion(current_user):
    """Enviar cotización al cliente con archivo adjunto y servicios"""
    try:
        data = request.get_json()
        
        id_orden = data.get('id_orden')
        archivo_base64 = data.get('archivo_base64')
        nombre_archivo = data.get('nombre_archivo', 'cotizacion.pdf')
        notas = data.get('notas', '')
        servicios = data.get('servicios', [])
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        if not archivo_base64:
            return jsonify({'error': 'Debe subir un archivo PDF o Word'}), 400
        
        if len(archivo_base64) > 15 * 1024 * 1024:
            return jsonify({'error': 'El archivo es demasiado grande (máx 10MB)'}), 400
        
        existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        cotizacion_data = {
            'id_orden_trabajo': id_orden,
            'archivo_base64': archivo_base64,
            'nombre_archivo': nombre_archivo,
            'notas': notas,
            'servicios_json': json.dumps(servicios),
            'id_jefe_taller': current_user['id'],
            'fecha_envio': datetime.datetime.now().isoformat(),
            'fecha_actualizacion': datetime.datetime.now().isoformat(),
            'estado': 'enviada'
        }
        
        if existente.data:
            # Actualizar cotización existente
            supabase.table('cotizacion').update(cotizacion_data).eq('id', existente.data[0]['id']).execute()
        else:
            # Crear nueva cotización
            cotizacion_data['fecha_creacion'] = datetime.datetime.now().isoformat()
            supabase.table('cotizacion').insert(cotizacion_data).execute()
        
        # Actualizar estado de la orden
        supabase.table('ordentrabajo').update({
            'estado_global': 'cotizacion_enviada'
        }).eq('id', id_orden).execute()
        
        # Notificar al cliente
        orden = supabase.table('ordentrabajo') \
            .select('id_vehiculo, vehiculo!inner(id_cliente, cliente!inner(id_usuario, usuario!inner(nombre, email)))') \
            .eq('id', id_orden) \
            .execute()
        
        usuario_cliente = None
        cliente_nombre = 'Cliente'
        
        if orden.data and orden.data[0].get('vehiculo'):
            v = orden.data[0]['vehiculo']
            if v.get('cliente'):
                u = v['cliente'].get('usuario', {})
                cliente_nombre = u.get('nombre', 'Cliente')
                usuario_cliente = v['cliente'].get('id_usuario')
        
        total = sum(s.get('precio', 0) for s in servicios)
        
        if usuario_cliente:
            supabase.table('notificacion').insert({
                'id_usuario_destino': usuario_cliente,
                'tipo': 'cotizacion_recibida',
                'mensaje': f"📎 Hola {cliente_nombre}, has recibido una nueva cotización. Total: Bs. {total:.2f}",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        return jsonify({'success': True, 'message': 'Cotización enviada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error enviando cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 6: ACTUALIZAR COTIZACIÓN EXISTENTE
# =====================================================

@cotizaciones_bp.route('/actualizar-cotizacion/<int:id_cotizacion>', methods=['POST'])
@jefe_taller_required
def actualizar_cotizacion(current_user, id_cotizacion):
    """Actualizar una cotización existente y reenviar al cliente"""
    try:
        data = request.get_json()
        
        id_orden = data.get('id_orden')
        archivo_base64 = data.get('archivo_base64')
        nombre_archivo = data.get('nombre_archivo', 'cotizacion.pdf')
        notas = data.get('notas', '')
        servicios = data.get('servicios', [])
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        if not archivo_base64:
            return jsonify({'error': 'Debe subir un archivo PDF o Word'}), 400
        
        # Verificar que la cotización existe y pertenece al jefe de taller
        cotizacion_existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id', id_cotizacion) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not cotizacion_existente.data:
            return jsonify({'error': 'Cotización no encontrada o no autorizada'}), 404
        
        # Actualizar cotización
        cotizacion_data = {
            'archivo_base64': archivo_base64,
            'nombre_archivo': nombre_archivo,
            'notas': notas,
            'servicios_json': json.dumps(servicios),
            'fecha_actualizacion': datetime.datetime.now().isoformat(),
            'fecha_envio': datetime.datetime.now().isoformat(),
            'estado': 'enviada'
        }
        
        supabase.table('cotizacion').update(cotizacion_data).eq('id', id_cotizacion).execute()
        
        # Actualizar estado de la orden
        supabase.table('ordentrabajo').update({
            'estado_global': 'cotizacion_enviada'
        }).eq('id', id_orden).execute()
        
        # Notificar al cliente sobre la actualización
        orden = supabase.table('ordentrabajo') \
            .select('id_vehiculo, vehiculo!inner(id_cliente, cliente!inner(id_usuario, usuario!inner(nombre, email)))') \
            .eq('id', id_orden) \
            .execute()
        
        usuario_cliente = None
        cliente_nombre = 'Cliente'
        
        if orden.data and orden.data[0].get('vehiculo'):
            v = orden.data[0]['vehiculo']
            if v.get('cliente'):
                u = v['cliente'].get('usuario', {})
                cliente_nombre = u.get('nombre', 'Cliente')
                usuario_cliente = v['cliente'].get('id_usuario')
        
        total = sum(s.get('precio', 0) for s in servicios)
        
        if usuario_cliente:
            supabase.table('notificacion').insert({
                'id_usuario_destino': usuario_cliente,
                'tipo': 'cotizacion_actualizada',
                'mensaje': f"📎 Hola {cliente_nombre}, la cotización de tu vehículo ha sido actualizada. Nuevo total: Bs. {total:.2f}",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        return jsonify({'success': True, 'message': 'Cotización actualizada y reenviada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/descargar-cotizacion/<int:id_cotizacion>', methods=['GET'])
@jefe_taller_required
def descargar_cotizacion(current_user, id_cotizacion):
    """Descargar archivo de cotización (PDF o Word)"""
    try:
        cotizacion = supabase.table('cotizacion') \
            .select('archivo_base64, nombre_archivo') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        cot = cotizacion.data[0]
        
        if not cot.get('archivo_base64'):
            return jsonify({'error': 'No hay archivo asociado a esta cotización'}), 404
        
        return jsonify({
            'success': True,
            'archivo_base64': cot.get('archivo_base64'),
            'nombre_archivo': cot.get('nombre_archivo', 'cotizacion.pdf')
        }), 200
        
    except Exception as e:
        logger.error(f"Error descargando cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 7: SOLICITUDES DE COMPRA
# =====================================================

@cotizaciones_bp.route('/solicitudes-compra', methods=['GET', 'POST', 'PUT'])
@jefe_taller_required
def gestionar_solicitudes_compra(current_user):
    """Gestionar solicitudes de compra"""
    
    if request.method == 'GET':
        try:
            estado = request.args.get('estado')
            id_orden_trabajo = request.args.get('id_orden_trabajo')
            
            query = supabase.table('solicitud_compra') \
                .select('*') \
                .eq('id_jefe_taller', current_user['id'])
            
            if estado and estado != 'all':
                query = query.eq('estado', estado)
            if id_orden_trabajo and id_orden_trabajo != 'all':
                query = query.eq('id_orden_trabajo', int(id_orden_trabajo))
            
            query = query.order('fecha_solicitud', desc=True)
            result = query.execute()
            
            if not result.data:
                return jsonify({'success': True, 'solicitudes': []}), 200
            
            ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
            servicios_ids = list(set([s.get('id_servicio') for s in result.data if s.get('id_servicio')]))
            
            ordenes_map = {}
            if ordenes_ids:
                ordenes_result = supabase.table('ordentrabajo') \
                    .select('id, codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
                    .in_('id', ordenes_ids) \
                    .execute()
                
                for o in (ordenes_result.data or []):
                    v = o.get('vehiculo', {})
                    ordenes_map[o['id']] = {
                        'codigo_unico': o.get('codigo_unico'),
                        'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', '')})".strip()
                    }
            
            servicios_map = {}
            if servicios_ids:
                servicios_result = supabase.table('servicio_tecnico') \
                    .select('id, descripcion') \
                    .in_('id', servicios_ids) \
                    .execute()
                for s in (servicios_result.data or []):
                    servicios_map[s['id']] = s.get('descripcion')
            
            solicitudes = []
            for s in result.data:
                orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
                
                items = []
                if s.get('items'):
                    try:
                        items = json.loads(s['items']) if isinstance(s['items'], str) else s['items']
                    except:
                        items = [{'descripcion': s.get('descripcion_pieza'), 'cantidad': s.get('cantidad', 1)}]
                
                solicitudes.append({
                    'id': s.get('id'),
                    'id_orden_trabajo': s.get('id_orden_trabajo'),
                    'id_servicio': s.get('id_servicio'),
                    'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                    'vehiculo': orden_info.get('vehiculo', 'N/A'),
                    'servicio_descripcion': servicios_map.get(s.get('id_servicio'), 'N/A'),
                    'items': items,
                    'estado': s.get('estado', 'pendiente'),
                    'fecha_solicitud': s.get('fecha_solicitud')
                })
            
            return jsonify({'success': True, 'solicitudes': solicitudes}), 200
            
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            
            id_solicitud_cotizacion = data.get('id_solicitud_cotizacion')
            items = data.get('items', [])
            mensaje = data.get('mensaje', '')
            
            if not id_solicitud_cotizacion:
                return jsonify({'error': 'Solicitud de cotización requerida'}), 400
            
            if not items or len(items) == 0:
                return jsonify({'error': 'Debe agregar al menos un item'}), 400
            
            items_validos = []
            for item in items:
                descripcion = item.get('descripcion', '').strip()
                if descripcion:
                    items_validos.append({
                        'descripcion': descripcion,
                        'cantidad': item.get('cantidad', 1),
                        'detalle': item.get('detalle', '')
                    })
            
            if not items_validos:
                return jsonify({'error': 'Complete la descripción de al menos un item'}), 400
            
            solicitud_cotizacion = supabase.table('solicitud_cotizacion_repuesto') \
                .select('*') \
                .eq('id', id_solicitud_cotizacion) \
                .execute()
            
            if not solicitud_cotizacion.data:
                return jsonify({'error': 'Solicitud de cotización no encontrada'}), 404
            
            sc = solicitud_cotizacion.data[0]
            
            nueva_solicitud = {
                'id_orden_trabajo': sc['id_orden_trabajo'],
                'id_servicio': sc.get('id_servicio'),
                'id_solicitud_cotizacion': id_solicitud_cotizacion,
                'id_jefe_taller': current_user['id'],
                'id_encargado_repuestos': sc.get('id_encargado_repuestos'),
                'descripcion_pieza': items_validos[0]['descripcion'],
                'cantidad': items_validos[0]['cantidad'],
                'items': json.dumps(items_validos),
                'precio_cotizado': sc.get('precio_cotizado'),
                'proveedor_info': sc.get('proveedor_info'),
                'estado': 'pendiente',
                'mensaje_jefe_taller': mensaje,
                'fecha_solicitud': datetime.datetime.now().isoformat()
            }
            
            result = supabase.table('solicitud_compra') \
                .insert(nueva_solicitud) \
                .execute()
            
            if not result.data:
                return jsonify({'error': 'No se pudo crear la solicitud'}), 500
            
            supabase.table('solicitud_cotizacion_repuesto') \
                .update({'estado': 'aprobado'}) \
                .eq('id', id_solicitud_cotizacion) \
                .execute()
            
            return jsonify({'success': True, 'message': 'Solicitud de compra creada'}), 201
            
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-compra/<int:id_solicitud>/aprobar', methods=['PUT'])
@jefe_taller_required
def aprobar_solicitud_compra(current_user, id_solicitud):
    """Aprobar solicitud de compra (marcar como comprado)"""
    try:
        check = supabase.table('solicitud_compra') \
            .select('id, estado') \
            .eq('id', id_solicitud) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': f'La solicitud ya está en estado {check.data[0]["estado"]}'}), 400
        
        supabase.table('solicitud_compra') \
            .update({
                'estado': 'comprado',
                'fecha_respuesta': datetime.datetime.now().isoformat(),
                'respuesta_encargado': 'Compra realizada'
            }) \
            .eq('id', id_solicitud) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Compra registrada'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# TABLA COTIZACION_TEMPORAL (asegurar que existe)
# =====================================================

def crear_tabla_cotizacion_temporal():
    """Crear la tabla cotizacion_temporal si no existe"""
    try:
        supabase.table('cotizacion_temporal').select('id').limit(1).execute()
    except Exception as e:
        try:
            sql = """
            CREATE TABLE IF NOT EXISTS cotizacion_temporal (
                id SERIAL PRIMARY KEY,
                id_orden_trabajo INTEGER NOT NULL REFERENCES ordentrabajo(id) ON DELETE CASCADE,
                id_jefe_taller INTEGER NOT NULL REFERENCES usuario(id),
                servicios JSONB,
                fecha_creacion TIMESTAMP DEFAULT NOW(),
                fecha_actualizacion TIMESTAMP DEFAULT NOW()
            );
            """
            supabase.rpc('exec_sql', {'sql': sql}).execute()
            logger.info("✅ Tabla cotizacion_temporal creada")
        except Exception as create_error:
            logger.warning(f"⚠️ No se pudo crear la tabla cotizacion_temporal: {create_error}")
            pass


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@cotizaciones_bp.route('/test', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de cotizaciones funcionando'}), 200


# Intentar crear la tabla al iniciar
try:
    crear_tabla_cotizacion_temporal()
except:
    pass