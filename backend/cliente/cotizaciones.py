# =====================================================
# COTIZACIONES.PY - CLIENTE
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
cotizaciones_cliente_bp = Blueprint('cotizaciones_cliente', __name__)  # Sin url_prefix

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_cliente_por_usuario(usuario_id):
    """Obtener cliente a partir del usuario"""
    try:
        cliente = supabase.table('cliente') \
            .select('id, nombre, telefono, email') \
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
# ENDPOINTS
# =====================================================

@cotizaciones_cliente_bp.route('/cotizaciones', methods=['GET'])
@cliente_required
def obtener_cotizaciones_cliente(current_user):
    """Obtener todas las cotizaciones del cliente"""
    try:
        estado = request.args.get('estado')
        
        # Obtener cliente
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        cliente_id = cliente['id']
        
        # Obtener vehículos del cliente
        vehiculos = obtener_vehiculos_cliente(cliente_id)
        if not vehiculos:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        # Obtener órdenes de trabajo
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo, estado_global') \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        ordenes_ids = [o['id'] for o in ordenes.data]
        
        # Obtener cotizaciones
        query = supabase.table('cotizacion') \
            .select('''
                id, 
                id_orden_trabajo, 
                fecha_generacion, 
                estado,
                cotizacion_servicio!inner(precio, aprobado_por_cliente)
            ''') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .order('fecha_generacion', desc=True)
        
        if estado and estado != 'all':
            query = query.eq('estado', estado)
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        # Mapear datos
        ordenes_map = {o['id']: o for o in ordenes.data}
        vehiculos_map = {v['id']: v for v in vehiculos}
        
        cotizaciones = []
        for c in result.data:
            orden = ordenes_map.get(c['id_orden_trabajo'], {})
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            
            # Calcular total
            total = sum(float(s.get('precio', 0)) for s in c.get('cotizacion_servicio', []))
            
            cotizaciones.append({
                'id': c['id'],
                'codigo_orden': orden.get('codigo_unico'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip() or 'Vehículo',
                'placa': vehiculo.get('placa'),
                'fecha': c['fecha_generacion'],
                'estado': c['estado'],
                'servicios_count': len(c.get('cotizacion_servicio', [])),
                'monto_total': total
            })
        
        return jsonify({'success': True, 'cotizaciones': cotizaciones}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotizaciones: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_cliente_bp.route('/cotizacion/<int:cotizacion_id>', methods=['GET'])
@cliente_required
def obtener_detalle_cotizacion_cliente(current_user, cotizacion_id):
    """Obtener detalle completo de una cotización"""
    try:
        result = supabase.table('cotizacion') \
            .select('''
                id, 
                id_orden_trabajo, 
                fecha_generacion, 
                estado,
                cotizacion_servicio!inner(
                    id, 
                    id_servicio,
                    precio, 
                    aprobado_por_cliente, 
                    fecha_aprobacion,
                    servicio_tecnico!inner(descripcion)
                )
            ''') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        c = result.data[0]
        
        servicios = []
        for cs in c.get('cotizacion_servicio', []):
            servicio = cs.get('servicio_tecnico', {})
            servicios.append({
                'id': cs.get('id'),
                'id_servicio': cs.get('id_servicio'),
                'descripcion': servicio.get('descripcion') if servicio else 'Servicio',
                'precio': float(cs.get('precio', 0)),
                'aprobado_por_cliente': cs.get('aprobado_por_cliente', False),
                'fecha_aprobacion': cs.get('fecha_aprobacion')
            })
        
        total = sum(s['precio'] for s in servicios)
        
        # Obtener sugerencias generales
        sugerencias = None
        orden_info = supabase.table('ordentrabajo') \
            .select('sugerencias_cliente') \
            .eq('id', c['id_orden_trabajo']) \
            .execute()
        
        if orden_info.data and orden_info.data[0].get('sugerencias_cliente'):
            sugerencias = orden_info.data[0]['sugerencias_cliente']
        
        return jsonify({
            'success': True,
            'cotizacion': {
                'id': c['id'],
                'id_orden_trabajo': c['id_orden_trabajo'],
                'fecha_generacion': c['fecha_generacion'],
                'estado': c['estado'],
                'servicios': servicios,
                'total': total,
                'sugerencias_generales': sugerencias
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_cliente_bp.route('/cotizacion/<int:cotizacion_id>/aprobar', methods=['PUT'])
@cliente_required
def aprobar_servicios_cotizacion(current_user, cotizacion_id):
    """Aprobar servicios de una cotización"""
    try:
        data = request.get_json()
        servicios_aprobados = data.get('servicios', [])
        
        if not servicios_aprobados:
            return jsonify({'error': 'No hay servicios para aprobar'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        for servicio in servicios_aprobados:
            supabase.table('cotizacion_servicio') \
                .update({
                    'aprobado_por_cliente': True,
                    'fecha_aprobacion': ahora
                }) \
                .eq('id_cotizacion', cotizacion_id) \
                .eq('id_servicio', servicio['id_servicio']) \
                .execute()
        
        # Verificar si todos los servicios están aprobados
        all_servicios = supabase.table('cotizacion_servicio') \
            .select('aprobado_por_cliente') \
            .eq('id_cotizacion', cotizacion_id) \
            .execute()
        
        todos_aprobados = all(s.get('aprobado_por_cliente', False) for s in (all_servicios.data or []))
        nuevo_estado = 'aprobado_total' if todos_aprobados else 'aprobado_parcial'
        
        supabase.table('cotizacion') \
            .update({'estado': nuevo_estado}) \
            .eq('id', cotizacion_id) \
            .execute()
        
        # Notificar al taller
        cotizacion = supabase.table('cotizacion') \
            .select('id_orden_trabajo') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if cotizacion.data:
            orden = supabase.table('ordentrabajo') \
                .select('id_jefe_taller') \
                .eq('id', cotizacion.data[0]['id_orden_trabajo']) \
                .execute()
            
            if orden.data and orden.data[0].get('id_jefe_taller'):
                supabase.table('notificacion').insert({
                    'id_usuario_destino': orden.data[0]['id_jefe_taller'],
                    'tipo': 'cotizacion_aprobada',
                    'mensaje': f"✅ Cliente ha aprobado {'todos los' if todos_aprobados else 'algunos'} servicio(s) de la cotización #{cotizacion_id}",
                    'fecha_envio': ahora,
                    'leida': False
                }).execute()
        
        return jsonify({
            'success': True,
            'message': 'Servicios aprobados correctamente',
            'estado': nuevo_estado
        }), 200
        
    except Exception as e:
        logger.error(f"Error aprobando servicios: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_cliente_bp.route('/cotizacion/<int:cotizacion_id>/rechazar', methods=['PUT'])
@cliente_required
def rechazar_cotizacion_cliente(current_user, cotizacion_id):
    """Rechazar una cotización"""
    try:
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar que la cotización pertenece al cliente
        cotizacion = supabase.table('cotizacion') \
            .select('id_orden_trabajo, estado') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        if cotizacion.data[0]['estado'] not in ['enviada', 'aprobado_parcial']:
            return jsonify({'error': 'No se puede rechazar esta cotización'}), 400
        
        supabase.table('cotizacion') \
            .update({'estado': 'rechazada'}) \
            .eq('id', cotizacion_id) \
            .execute()
        
        # Notificar al taller
        orden = supabase.table('ordentrabajo') \
            .select('id_jefe_taller') \
            .eq('id', cotizacion.data[0]['id_orden_trabajo']) \
            .execute()
        
        if orden.data and orden.data[0].get('id_jefe_taller'):
            supabase.table('notificacion').insert({
                'id_usuario_destino': orden.data[0]['id_jefe_taller'],
                'tipo': 'cotizacion_rechazada',
                'mensaje': f"❌ Cliente ha rechazado la cotización #{cotizacion_id}",
                'fecha_envio': ahora,
                'leida': False
            }).execute()
        
        return jsonify({'success': True, 'message': 'Cotización rechazada'}), 200
        
    except Exception as e:
        logger.error(f"Error rechazando cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@cotizaciones_cliente_bp.route('/test-cotizaciones', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de cotizaciones cliente funcionando'}), 200