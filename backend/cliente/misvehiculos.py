# =====================================================
# MISVEHICULOS.PY - CLIENTE
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, session
from config import config
from decorators import cliente_required
import datetime
import logging

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
cliente_bp = Blueprint('cliente', __name__)  # Sin url_prefix

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_cliente_por_placa(placa):
    """Obtener cliente a partir de la placa del vehículo"""
    try:
        # Buscar vehículo por placa
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, id_cliente, cliente!inner(id, nombre, telefono, email)') \
            .eq('placa', placa.upper()) \
            .execute()
        
        if not vehiculo.data:
            return None
        
        v = vehiculo.data[0]
        cliente_data = v.get('cliente', {})
        
        return {
            'id': cliente_data.get('id'),
            'nombre': cliente_data.get('nombre'),
            'telefono': cliente_data.get('telefono'),
            'email': cliente_data.get('email'),
            'vehiculo': {
                'id': v.get('id'),
                'placa': v.get('placa'),
                'marca': v.get('marca'),
                'modelo': v.get('modelo'),
                'anio': v.get('anio')
            }
        }
    except Exception as e:
        logger.error(f"Error obteniendo cliente por placa: {e}")
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

def obtener_ordenes_por_vehiculo(vehiculo_id):
    """Obtener órdenes de trabajo de un vehículo"""
    try:
        ordenes = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, fecha_ingreso, fecha_salida, 
                estado_global, kilometraje_ingreso,
                diagnostico_tecnico!inner(transcripcion_problema)
            ''') \
            .eq('id_vehiculo', vehiculo_id) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        return ordenes.data or []
    except Exception as e:
        logger.error(f"Error obteniendo órdenes: {e}")
        return []

# =====================================================
# ENDPOINTS
# =====================================================

@cliente_bp.route('/perfil', methods=['GET'])
@cliente_required
def obtener_perfil_cliente(current_user):
    """Obtener perfil del cliente"""
    try:
        cliente = supabase.table('cliente') \
            .select('id, nombre, telefono, email, direccion') \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        if not cliente.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        return jsonify({
            'success': True,
            'usuario': {
                'id': cliente.data[0].get('id'),
                'nombre': cliente.data[0].get('nombre'),
                'telefono': cliente.data[0].get('telefono'),
                'email': cliente.data[0].get('email'),
                'direccion': cliente.data[0].get('direccion')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cliente_bp.route('/mis-vehiculos', methods=['GET'])
@cliente_required
def obtener_mis_vehiculos(current_user):
    """Obtener vehículos del cliente con sus órdenes activas"""
    try:
        estado = request.args.get('estado')
        
        # Obtener cliente
        cliente = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        if not cliente.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        cliente_id = cliente.data[0]['id']
        
        # Obtener vehículos
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio') \
            .eq('id_cliente', cliente_id) \
            .execute()
        
        if not vehiculos.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        # Para cada vehículo, obtener la orden más reciente
        resultado = []
        for v in vehiculos.data:
            orden = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, fecha_ingreso, estado_global') \
                .eq('id_vehiculo', v['id']) \
                .order('fecha_ingreso', desc=True) \
                .limit(1) \
                .execute()
            
            if orden.data:
                orden_actual = orden.data[0]
                if estado and estado != 'all' and orden_actual['estado_global'] != estado:
                    continue
                
                resultado.append({
                    'id': v['id'],
                    'placa': v['placa'],
                    'marca': v['marca'],
                    'modelo': v['modelo'],
                    'anio': v['anio'],
                    'orden_id': orden_actual['id'],
                    'codigo_unico': orden_actual['codigo_unico'],
                    'fecha_ingreso': orden_actual['fecha_ingreso'],
                    'estado_global': orden_actual['estado_global']
                })
        
        return jsonify({'success': True, 'vehiculos': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cliente_bp.route('/detalle-vehiculo/<int:vehiculo_id>', methods=['GET'])
@cliente_required
def obtener_detalle_vehiculo(current_user, vehiculo_id):
    """Obtener detalle completo de un vehículo con su orden actual"""
    try:
        # Verificar que el vehículo pertenece al cliente
        cliente = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        if not cliente.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        cliente_id = cliente.data[0]['id']
        
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, id_cliente') \
            .eq('id', vehiculo_id) \
            .eq('id_cliente', cliente_id) \
            .execute()
        
        if not vehiculo.data:
            return jsonify({'error': 'Vehículo no encontrado'}), 404
        
        v = vehiculo.data[0]
        
        # Obtener orden más reciente
        orden = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, fecha_ingreso, fecha_salida, 
                estado_global, kilometraje_ingreso,
                cliente_nombre, cliente_telefono, cliente_email,
                transcripcion_problema, audio_url,
                url_lateral_izquierda, url_lateral_derecha,
                url_foto_frontal, url_foto_trasera,
                url_foto_superior, url_foto_inferior, url_foto_tablero
            ''') \
            .eq('id_vehiculo', vehiculo_id) \
            .order('fecha_ingreso', desc=True) \
            .limit(1) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'No hay órdenes para este vehículo'}), 404
        
        orden_actual = orden.data[0]
        
        # Construir objeto de fotos
        fotos = {
            'url_lateral_izquierda': orden_actual.get('url_lateral_izquierda'),
            'url_lateral_derecha': orden_actual.get('url_lateral_derecha'),
            'url_foto_frontal': orden_actual.get('url_foto_frontal'),
            'url_foto_trasera': orden_actual.get('url_foto_trasera'),
            'url_foto_superior': orden_actual.get('url_foto_superior'),
            'url_foto_inferior': orden_actual.get('url_foto_inferior'),
            'url_foto_tablero': orden_actual.get('url_foto_tablero')
        }
        
        detalle = {
            'id': v['id'],
            'placa': v['placa'],
            'marca': v['marca'],
            'modelo': v['modelo'],
            'anio': v['anio'],
            'codigo_unico': orden_actual.get('codigo_unico'),
            'fecha_ingreso': orden_actual.get('fecha_ingreso'),
            'estado_global': orden_actual.get('estado_global'),
            'kilometraje': orden_actual.get('kilometraje_ingreso'),
            'cliente_nombre': orden_actual.get('cliente_nombre'),
            'cliente_telefono': orden_actual.get('cliente_telefono'),
            'cliente_email': orden_actual.get('cliente_email'),
            'transcripcion_problema': orden_actual.get('transcripcion_problema'),
            'audio_url': orden_actual.get('audio_url'),
            'fotos': fotos
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cliente_bp.route('/cotizacion/<int:orden_id>', methods=['GET'])
@cliente_required
def obtener_cotizacion(current_user, orden_id):
    """Obtener cotización de una orden"""
    try:
        cotizacion = supabase.table('cotizacion') \
            .select('''
                id, fecha_generacion, estado,
                cotizacion_servicio!inner(
                    id_servicio,
                    precio,
                    aprobado_por_cliente,
                    fecha_aprobacion,
                    servicio_tecnico!inner(descripcion)
                )
            ''') \
            .eq('id_orden_trabajo', orden_id) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'success': True, 'cotizacion': None}), 200
        
        c = cotizacion.data[0]
        servicios = []
        total = 0
        
        for cs in c.get('cotizacion_servicio', []):
            servicio = cs.get('servicio_tecnico', {})
            precio = float(cs.get('precio', 0))
            total += precio
            servicios.append({
                'descripcion': servicio.get('descripcion'),
                'precio': precio,
                'aprobado_por_cliente': cs.get('aprobado_por_cliente', False),
                'fecha_aprobacion': cs.get('fecha_aprobacion')
            })
        
        return jsonify({
            'success': True,
            'cotizacion': {
                'id': c.get('id'),
                'fecha_generacion': c.get('fecha_generacion'),
                'estado': c.get('estado'),
                'servicios': servicios,
                'total': total
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cliente_bp.route('/aprobar-cotizacion/<int:cotizacion_id>', methods=['PUT'])
@cliente_required
def aprobar_cotizacion(current_user, cotizacion_id):
    """Aprobar cotización (total o parcial)"""
    try:
        data = request.get_json()
        servicios_aprobados = data.get('servicios_aprobados', [])
        
        # Actualizar cada servicio
        for servicio_id in servicios_aprobados:
            supabase.table('cotizacion_servicio') \
                .update({
                    'aprobado_por_cliente': True,
                    'fecha_aprobacion': datetime.datetime.now().isoformat()
                }) \
                .eq('id_cotizacion', cotizacion_id) \
                .eq('id_servicio', servicio_id) \
                .execute()
        
        # Verificar si todos los servicios están aprobados
        servicios = supabase.table('cotizacion_servicio') \
            .select('aprobado_por_cliente') \
            .eq('id_cotizacion', cotizacion_id) \
            .execute()
        
        todos_aprobados = all(s.get('aprobado_por_cliente', False) for s in (servicios.data or []))
        
        nuevo_estado = 'aprobado_total' if todos_aprobados else 'aprobado_parcial'
        
        supabase.table('cotizacion') \
            .update({'estado': nuevo_estado}) \
            .eq('id', cotizacion_id) \
            .execute()
        
        return jsonify({'success': True, 'estado': nuevo_estado}), 200
        
    except Exception as e:
        logger.error(f"Error aprobando cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@cliente_bp.route('/test', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de cliente funcionando'}), 200