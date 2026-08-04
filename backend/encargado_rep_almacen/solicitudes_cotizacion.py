# =====================================================
# SOLICITUDES_COTIZACION.PY - ENCARGADO DE REPUESTOS
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import encargado_repuestos_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
solicitudes_cotizacion_bp = Blueprint('solicitudes_cotizacion', __name__, url_prefix='/api/encargado-repuestos')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def parse_items(items_data):
    """Parsear items desde JSON"""
    if not items_data:
        return []
    try:
        if isinstance(items_data, str):
            return json.loads(items_data)
        return items_data
    except:
        return []

# =====================================================
# ENDPOINTS
# =====================================================

@solicitudes_cotizacion_bp.route('/solicitudes-cotizacion', methods=['GET'])
@encargado_repuestos_required
def obtener_solicitudes_cotizacion(current_user):
    """Obtener solicitudes de cotización asignadas al encargado de repuestos"""
    try:
        estado = request.args.get('estado')
        
        # Construir query base
        query = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .order('fecha_solicitud', desc=True)
        
        # Aplicar filtro de estado si existe
        if estado and estado != 'all':
            query = query.eq('estado', estado)
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'solicitudes': []}), 200
        
        # Obtener IDs únicos de órdenes y servicios
        ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
        servicios_ids = list(set([s.get('id_servicio') for s in result.data if s.get('id_servicio')]))
        
        # Mapear información de órdenes
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
        
        # Mapear información de servicios
        servicios_map = {}
        if servicios_ids:
            servicios_result = supabase.table('servicio_tecnico') \
                .select('id, descripcion') \
                .in_('id', servicios_ids) \
                .execute()
            for s in (servicios_result.data or []):
                servicios_map[s['id']] = s.get('descripcion')
        
        # Construir respuesta
        solicitudes = []
        for s in result.data:
            orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
            
            # Parsear items
            items = parse_items(s.get('items'))
            if not items and s.get('descripcion_pieza'):
                items = [{
                    'descripcion': s.get('descripcion_pieza'),
                    'cantidad': s.get('cantidad', 1),
                    'detalle': ''
                }]
            
            solicitudes.append({
                'id': s.get('id'),
                'id_orden_trabajo': s.get('id_orden_trabajo'),
                'id_servicio': s.get('id_servicio'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'servicio_descripcion': servicios_map.get(s.get('id_servicio'), 'N/A'),
                'items': items,
                'descripcion_pieza': items[0].get('descripcion') if items else s.get('descripcion_pieza'),
                'cantidad': items[0].get('cantidad') if items else s.get('cantidad', 1),
                'estado': s.get('estado', 'pendiente'),
                'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'proveedor_info': s.get('proveedor_info'),
                'observacion_jefe_taller': s.get('observacion_jefe_taller'),
                'respuesta_encargado': s.get('respuesta_encargado'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_respuesta': s.get('fecha_respuesta')
            })
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitudes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@solicitudes_cotizacion_bp.route('/solicitudes-cotizacion/<int:id_solicitud>/cotizar', methods=['PUT'])
@encargado_repuestos_required
def cotizar_solicitud(current_user, id_solicitud):
    """Responder a una solicitud de cotización con precio y proveedor"""
    try:
        data = request.get_json()
        
        precio_cotizado = data.get('precio_cotizado')
        proveedor_info = data.get('proveedor_info', '')
        respuesta_encargado = data.get('respuesta_encargado', '')
        
        if not precio_cotizado:
            return jsonify({'error': 'El precio cotizado es requerido'}), 400
        
        if precio_cotizado <= 0:
            return jsonify({'error': 'El precio debe ser mayor a 0'}), 400
        
        # Verificar que la solicitud existe y está pendiente
        check = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id, estado, id_jefe_taller, id_encargado_repuestos') \
            .eq('id', id_solicitud) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        solicitud = check.data[0]
        
        # Verificar que pertenece al usuario actual
        if solicitud.get('id_encargado_repuestos') != current_user['id']:
            return jsonify({'error': 'No autorizado para esta solicitud'}), 403
        
        if solicitud.get('estado') != 'pendiente':
            return jsonify({'error': f'La solicitud ya fue respondida (estado: {solicitud["estado"]})'}), 400
        
        # Actualizar solicitud
        ahora = datetime.datetime.now().isoformat()
        update_data = {
            'precio_cotizado': precio_cotizado,
            'proveedor_info': proveedor_info,
            'respuesta_encargado': respuesta_encargado,
            'estado': 'cotizado',
            'fecha_respuesta': ahora
        }
        
        result = supabase.table('solicitud_cotizacion_repuesto') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar la solicitud'}), 500
        
        # Notificar al jefe de taller
        try:
            supabase.table('notificacion').insert({
                'id_usuario_destino': solicitud['id_jefe_taller'],
                'tipo': 'cotizacion_recibida',
                'mensaje': f"💰 Cotización recibida para solicitud #{id_solicitud}: Bs. {precio_cotizado:.2f}",
                'fecha_envio': ahora,
                'leida': False
            }).execute()
            logger.info(f"✅ Notificación enviada al jefe de taller {solicitud['id_jefe_taller']}")
        except Exception as e:
            logger.warning(f"⚠️ Error enviando notificación: {e}")
        
        return jsonify({
            'success': True,
            'message': 'Cotización enviada exitosamente',
            'solicitud': result.data[0]
        }), 200
        
    except Exception as e:
        logger.error(f"Error cotizando solicitud: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@solicitudes_cotizacion_bp.route('/solicitudes-cotizacion/<int:id_solicitud>', methods=['GET'])
@encargado_repuestos_required
def obtener_detalle_solicitud(current_user, id_solicitud):
    """Obtener detalle de una solicitud específica"""
    try:
        result = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('id', id_solicitud) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        solicitud = result.data[0]
        
        # Obtener información de la orden
        orden_info = supabase.table('ordentrabajo') \
            .select('codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .eq('id', solicitud.get('id_orden_trabajo')) \
            .execute()
        
        orden = orden_info.data[0] if orden_info.data else {}
        vehiculo = orden.get('vehiculo', {}) if orden else {}
        
        # Obtener información del servicio
        servicio_info = supabase.table('servicio_tecnico') \
            .select('descripcion') \
            .eq('id', solicitud.get('id_servicio')) \
            .execute()
        
        servicio_desc = servicio_info.data[0].get('descripcion') if servicio_info.data else 'N/A'
        
        # Parsear items
        items = parse_items(solicitud.get('items'))
        if not items and solicitud.get('descripcion_pieza'):
            items = [{
                'descripcion': solicitud.get('descripcion_pieza'),
                'cantidad': solicitud.get('cantidad', 1),
                'detalle': ''
            }]
        
        return jsonify({
            'success': True,
            'solicitud': {
                'id': solicitud.get('id'),
                'id_orden_trabajo': solicitud.get('id_orden_trabajo'),
                'orden_codigo': orden.get('codigo_unico', 'N/A'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'servicio_descripcion': servicio_desc,
                'items': items,
                'estado': solicitud.get('estado'),
                'precio_cotizado': float(solicitud.get('precio_cotizado')) if solicitud.get('precio_cotizado') else None,
                'proveedor_info': solicitud.get('proveedor_info'),
                'observacion_jefe_taller': solicitud.get('observacion_jefe_taller'),
                'respuesta_encargado': solicitud.get('respuesta_encargado'),
                'fecha_solicitud': solicitud.get('fecha_solicitud'),
                'fecha_respuesta': solicitud.get('fecha_respuesta')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        return jsonify({'error': str(e)}), 500


@solicitudes_cotizacion_bp.route('/solicitudes-cotizacion/stats', methods=['GET'])
@encargado_repuestos_required
def obtener_estadisticas(current_user):
    """Obtener estadísticas de solicitudes para el dashboard"""
    try:
        # Solicitudes pendientes
        pendientes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'pendiente') \
            .execute()
        
        # Solicitudes cotizadas
        cotizadas = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'cotizado') \
            .execute()
        
        # Solicitudes totales
        total = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        return jsonify({
            'success': True,
            'stats': {
                'pendientes': pendientes.count if hasattr(pendientes, 'count') else 0,
                'cotizadas': cotizadas.count if hasattr(cotizadas, 'count') else 0,
                'total': total.count if hasattr(total, 'count') else 0
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@solicitudes_cotizacion_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba"""
    return jsonify({'success': True, 'message': 'Endpoint de solicitudes_cotizacion funcionando'}), 200