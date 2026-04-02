from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
import random
import uuid

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT - NOMBRE CORRECTO
# =====================================================
jefe_operativo_cotizacion_bp = Blueprint('jefe_operativo_cotizacion', __name__, url_prefix='/api/jefe-operativo')

# Configuración desde config.py
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL
# =====================================================
def jefe_operativo_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            
            if current_user.get('rol') != 'jefe_operativo' and current_user.get('id_rol') != 2:
                logger.warning(f"Usuario {current_user.get('nombre')} intentó acceder sin permisos")
                return jsonify({'error': 'No autorizado para esta operación'}), 403
                
        except jwt.ExpiredSignatureError:
            logger.warning("Token expirado")
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# COTIZACIONES - ENDPOINTS
# =====================================================

@jefe_operativo_cotizacion_bp.route('/servicios-disponibles', methods=['GET'])
@jefe_operativo_required
def get_servicios_disponibles(current_user):
    """Obtener lista de servicios disponibles para cotizar"""
    try:
        resultado = supabase.table('servicio') \
            .select('id, descripcion, precio_estimado') \
            .execute()
        
        servicios = []
        if resultado.data:
            for s in resultado.data:
                servicios.append({
                    'id': s['id'],
                    'nombre': s['descripcion'],
                    'precio': float(s['precio_estimado'] or 0)
                })
        
        return jsonify({'success': True, 'data': servicios}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo servicios: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/ordenes-para-cotizar', methods=['GET'])
@jefe_operativo_required
def get_ordenes_para_cotizar(current_user):
    """Obtener órdenes de trabajo que aún no tienen cotización"""
    try:
        # Obtener todas las órdenes
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo, vehiculo!inner(placa, marca, modelo, cliente!inner(id_usuario, usuario!inner(nombre, contacto)))') \
            .execute()
        
        # Obtener órdenes que ya tienen cotización
        ordenes_con_cotizacion = supabase.table('cotizacion') \
            .select('id_orden_trabajo') \
            .execute()
        
        ids_con_cotizacion = [c['id_orden_trabajo'] for c in ordenes_con_cotizacion.data] if ordenes_con_cotizacion.data else []
        
        ordenes = []
        if resultado.data:
            for orden in resultado.data:
                if orden['id'] not in ids_con_cotizacion:
                    vehiculo = orden.get('vehiculo', {})
                    cliente = vehiculo.get('cliente', {}) if vehiculo else {}
                    usuario = cliente.get('usuario', {}) if cliente else {}
                    
                    ordenes.append({
                        'id': orden['id'],
                        'codigo': orden['codigo_unico'],
                        'vehiculo_marca': vehiculo.get('marca', ''),
                        'vehiculo_modelo': vehiculo.get('modelo', ''),
                        'placa': vehiculo.get('placa', ''),
                        'cliente_nombre': usuario.get('nombre', ''),
                        'diagnostico': None
                    })
        
        return jsonify({'success': True, 'data': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/cotizaciones', methods=['GET'])
@jefe_operativo_required
def listar_cotizaciones(current_user):
    """Listar cotizaciones con paginación y filtros"""
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        search = request.args.get('search', '')
        estado = request.args.get('estado', '')
        periodo = request.args.get('periodo', '')
        
        offset = (page - 1) * limit
        
        # Obtener todas las cotizaciones
        resultado = supabase.table('cotizacion') \
            .select('*, ordentrabajo!inner(*, vehiculo!inner(*, cliente!inner(*, usuario!inner(*))))') \
            .order('fecha_generacion', desc=True) \
            .execute()
        
        cotizaciones = []
        if resultado.data:
            for cot in resultado.data:
                orden = cot.get('ordentrabajo', {})
                vehiculo = orden.get('vehiculo', {})
                cliente = vehiculo.get('cliente', {})
                usuario = cliente.get('usuario', {})
                
                # Obtener detalles para calcular total
                detalles_result = supabase.table('cotizaciondetalle') \
                    .select('*') \
                    .eq('id_cotizacion', cot['id']) \
                    .execute()
                
                total = sum(float(d.get('precio', 0)) for d in detalles_result.data) if detalles_result.data else 0
                
                # Generar código para mostrar
                codigo_mostrar = f"COT-{cot['id']}"
                cliente_nombre = usuario.get('nombre', '')
                placa = vehiculo.get('placa', '')
                
                # Aplicar filtro de búsqueda
                if search and search.lower() not in (codigo_mostrar.lower() + cliente_nombre.lower() + placa.lower()):
                    continue
                
                # Aplicar filtro de estado
                if estado and cot.get('estado', 'pendiente') != estado:
                    continue
                
                # Aplicar filtro de periodo
                if periodo and periodo != 'todo':
                    fecha_cot = datetime.datetime.fromisoformat(cot['fecha_generacion']) if cot.get('fecha_generacion') else None
                    hoy = datetime.datetime.now()
                    
                    if periodo == 'hoy' and fecha_cot:
                        if fecha_cot.date() != hoy.date():
                            continue
                    elif periodo == 'semana' and fecha_cot:
                        inicio_semana = hoy - datetime.timedelta(days=hoy.weekday())
                        if fecha_cot.date() < inicio_semana.date():
                            continue
                    elif periodo == 'mes' and fecha_cot:
                        if fecha_cot.month != hoy.month or fecha_cot.year != hoy.year:
                            continue
                
                cotizaciones.append({
                    'id': cot['id'],
                    'codigo': codigo_mostrar,
                    'cliente_nombre': cliente_nombre,
                    'vehiculo_marca': vehiculo.get('marca', ''),
                    'vehiculo_modelo': vehiculo.get('modelo', ''),
                    'placa': placa,
                    'total': total,
                    'estado': cot.get('estado', 'pendiente'),
                    'fecha': cot.get('fecha_generacion')
                })
        
        # Paginación manual
        total_items = len(cotizaciones)
        total_paginas = (total_items + limit - 1) // limit if total_items > 0 else 1
        paginadas = cotizaciones[offset:offset + limit]
        
        return jsonify({
            'success': True,
            'data': paginadas,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total_items,
                'totalPages': total_paginas
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error listando cotizaciones: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/cotizaciones/<int:id_cotizacion>', methods=['GET'])
@jefe_operativo_required
def obtener_cotizacion(current_user, id_cotizacion):
    """Obtener detalle de una cotización"""
    try:
        # Obtener cotización con relaciones
        resultado = supabase.table('cotizacion') \
            .select('*, ordentrabajo!inner(*, vehiculo!inner(*, cliente!inner(*, usuario!inner(*))))') \
            .eq('id', id_cotizacion) \
            .single() \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        cot = resultado.data
        orden = cot.get('ordentrabajo', {})
        vehiculo = orden.get('vehiculo', {})
        cliente = vehiculo.get('cliente', {})
        usuario = cliente.get('usuario', {})
        
        # Obtener detalles de cotización
        detalles_result = supabase.table('cotizaciondetalle') \
            .select('*') \
            .eq('id_cotizacion', id_cotizacion) \
            .execute()
        
        servicios = []
        if detalles_result.data:
            for det in detalles_result.data:
                servicios.append({
                    'id': det.get('id'),
                    'descripcion': det.get('servicio_descripcion', 'Servicio'),
                    'precio': float(det.get('precio', 0))
                })
        
        total = sum(s['precio'] for s in servicios)
        
        detalle = {
            'id': cot['id'],
            'codigo': f"COT-{cot['id']}",
            'cliente_nombre': usuario.get('nombre', ''),
            'vehiculo_marca': vehiculo.get('marca', ''),
            'vehiculo_modelo': vehiculo.get('modelo', ''),
            'placa': vehiculo.get('placa', ''),
            'orden_codigo': orden.get('codigo_unico', ''),
            'total': total,
            'estado': cot.get('estado', 'pendiente'),
            'fecha': cot.get('fecha_generacion'),
            'servicios': servicios
        }
        
        return jsonify({'success': True, 'data': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/cotizaciones', methods=['POST'])
@jefe_operativo_required
def crear_cotizacion(current_user):
    """Crear nueva cotización"""
    try:
        data = request.get_json()
        orden_id = data.get('orden_trabajo_id')
        servicios = data.get('servicios', [])
        
        if not orden_id:
            return jsonify({'error': 'Orden de trabajo requerida'}), 400
        
        # Verificar que la orden existe
        orden_result = supabase.table('ordentrabajo') \
            .select('id') \
            .eq('id', orden_id) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
        
        # Verificar que no tenga cotización existente
        cot_existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id_orden_trabajo', orden_id) \
            .execute()
        
        if cot_existente.data:
            return jsonify({'error': 'Esta orden ya tiene una cotización'}), 400
        
        # Crear cotización (solo campos que existen en la tabla)
        cotizacion_result = supabase.table('cotizacion').insert({
            'id_orden_trabajo': orden_id,
            'fecha_generacion': datetime.datetime.now().isoformat(),
            'estado': 'pendiente'
        }).execute()
        
        if not cotizacion_result.data:
            return jsonify({'error': 'Error creando cotización'}), 500
        
        cotizacion_id = cotizacion_result.data[0]['id']
        
        # Crear detalles de cotización
        for servicio in servicios:
            supabase.table('cotizaciondetalle').insert({
                'id_cotizacion': cotizacion_id,
                'servicio_descripcion': servicio.get('descripcion', 'Servicio'),
                'precio': servicio.get('precio', 0),
                'aprobado_por_cliente': False
            }).execute()
        
        logger.info(f"Cotización {cotizacion_id} creada para orden {orden_id} por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True, 
            'data': {
                'id': cotizacion_id, 
                'codigo': f"COT-{cotizacion_id}"
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/cotizaciones/<int:id_cotizacion>', methods=['PUT'])
@jefe_operativo_required
def actualizar_cotizacion(current_user, id_cotizacion):
    """Actualizar una cotización existente"""
    try:
        data = request.get_json()
        estado = data.get('estado')
        servicios = data.get('servicios')
        
        # Verificar que la cotización existe
        cot_existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cot_existente.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        # Actualizar estado si se proporciona
        if estado:
            supabase.table('cotizacion') \
                .update({'estado': estado}) \
                .eq('id', id_cotizacion) \
                .execute()
        
        # Actualizar servicios si se proporcionan
        if servicios is not None:
            # Eliminar detalles existentes
            supabase.table('cotizaciondetalle') \
                .delete() \
                .eq('id_cotizacion', id_cotizacion) \
                .execute()
            
            # Insertar nuevos detalles
            for servicio in servicios:
                supabase.table('cotizaciondetalle').insert({
                    'id_cotizacion': id_cotizacion,
                    'servicio_descripcion': servicio.get('descripcion', 'Servicio'),
                    'precio': servicio.get('precio', 0),
                    'aprobado_por_cliente': servicio.get('aprobado', False)
                }).execute()
        
        logger.info(f"Cotización {id_cotizacion} actualizada por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': 'Cotización actualizada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/cotizaciones/<int:id_cotizacion>/enviar', methods=['POST'])
@jefe_operativo_required
def enviar_cotizacion(current_user, id_cotizacion):
    """Enviar cotización al cliente (marcar como enviada)"""
    try:
        # Verificar que la cotización existe
        cot_existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cot_existente.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        # Actualizar estado
        supabase.table('cotizacion') \
            .update({'estado': 'enviada'}) \
            .eq('id', id_cotizacion) \
            .execute()
        
        logger.info(f"Cotización {id_cotizacion} enviada por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': 'Cotización enviada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error enviando cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/cotizaciones/<int:id_cotizacion>', methods=['DELETE'])
@jefe_operativo_required
def eliminar_cotizacion(current_user, id_cotizacion):
    """Eliminar una cotización"""
    try:
        # Verificar que la cotización existe
        cot_existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cot_existente.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        # Eliminar detalles primero
        supabase.table('cotizaciondetalle') \
            .delete() \
            .eq('id_cotizacion', id_cotizacion) \
            .execute()
        
        # Eliminar cotización
        supabase.table('cotizacion') \
            .delete() \
            .eq('id', id_cotizacion) \
            .execute()
        
        logger.info(f"Cotización {id_cotizacion} eliminada por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': 'Cotización eliminada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error eliminando cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/cotizaciones/<int:id_cotizacion>/aprobar', methods=['POST'])
@jefe_operativo_required
def aprobar_cotizacion(current_user, id_cotizacion):
    """Aprobar una cotización (respuesta del cliente)"""
    try:
        data = request.get_json()
        servicios_aprobados = data.get('servicios_aprobados', [])
        
        # Verificar que la cotización existe
        cot_existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cot_existente.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        # Actualizar aprobación de servicios
        for servicio in servicios_aprobados:
            supabase.table('cotizaciondetalle') \
                .update({'aprobado_por_cliente': True}) \
                .eq('id', servicio.get('id')) \
                .eq('id_cotizacion', id_cotizacion) \
                .execute()
        
        # Actualizar estado de la cotización
        supabase.table('cotizacion') \
            .update({'estado': 'aprobada'}) \
            .eq('id', id_cotizacion) \
            .execute()
        
        logger.info(f"Cotización {id_cotizacion} aprobada por cliente")
        
        return jsonify({'success': True, 'message': 'Cotización aprobada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error aprobando cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_cotizacion_bp.route('/notificaciones', methods=['GET'])
@jefe_operativo_required
def get_notificaciones(current_user):
    """Obtener notificaciones del usuario"""
    try:
        resultado = supabase.table('notificacion') \
            .select('*') \
            .eq('id_usuario_destino', current_user['id']) \
            .order('fecha_envio', desc=True) \
            .limit(20) \
            .execute()
        
        return jsonify({'success': True, 'data': resultado.data or []}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo notificaciones: {str(e)}")
        return jsonify({'error': str(e)}), 500