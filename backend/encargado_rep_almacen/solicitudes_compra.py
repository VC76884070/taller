# =====================================================
# SOLICITUDES_COMPRA.PY - ENCARGADO DE REPUESTOS
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
solicitudes_compra_bp = Blueprint('solicitudes_compra', __name__, url_prefix='/api/encargado-repuestos')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def parse_items(items_data):
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

@solicitudes_compra_bp.route('/solicitudes-compra', methods=['GET'])
@encargado_repuestos_required
def obtener_solicitudes_compra(current_user):
    """Obtener solicitudes de compra asignadas al encargado de repuestos"""
    try:
        estado = request.args.get('estado')
        
        query = supabase.table('solicitud_compra') \
            .select('*') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .order('fecha_solicitud', desc=True)
        
        if estado and estado != 'all':
            query = query.eq('estado', estado)
        
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
                'id_solicitud_cotizacion': s.get('id_solicitud_cotizacion'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'servicio_descripcion': servicios_map.get(s.get('id_servicio'), 'N/A'),
                'items': items,
                'descripcion_pieza': items[0].get('descripcion') if items else s.get('descripcion_pieza'),
                'cantidad': items[0].get('cantidad') if items else s.get('cantidad', 1),
                'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'proveedor_info': s.get('proveedor_info'),
                'estado': s.get('estado', 'pendiente'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_compra': s.get('fecha_compra'),
                'fecha_entrega': s.get('fecha_entrega'),
                'mensaje_jefe_taller': s.get('mensaje_jefe_taller'),
                'respuesta_encargado': s.get('respuesta_encargado'),
                'notas_compra': s.get('notas_compra'),
                'notas_entrega': s.get('notas_entrega')
            })
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitudes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@solicitudes_compra_bp.route('/solicitudes-compra/<int:id_solicitud>/comprar', methods=['PUT'])
@encargado_repuestos_required
def marcar_como_comprado(current_user, id_solicitud):
    """Marcar una solicitud como comprada"""
    try:
        data = request.get_json()
        fecha_compra = data.get('fecha_compra')
        notas_compra = data.get('notas_compra', '')
        
        # Verificar que la solicitud existe
        check = supabase.table('solicitud_compra') \
            .select('id, estado, id_jefe_taller') \
            .eq('id', id_solicitud) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': f'La solicitud ya está en estado {check.data[0]["estado"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        update_data = {
            'estado': 'comprado',
            'fecha_compra': fecha_compra or ahora,
            'notas_compra': notas_compra,
            'respuesta_encargado': f"Compra realizada el {fecha_compra or ahora}"
        }
        
        result = supabase.table('solicitud_compra') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar la solicitud'}), 500
        
        # Notificar al jefe de taller
        try:
            supabase.table('notificacion').insert({
                'id_usuario_destino': check.data[0]['id_jefe_taller'],
                'tipo': 'compra_realizada',
                'mensaje': f"🛒 Compra realizada para solicitud #{id_solicitud}",
                'fecha_envio': ahora,
                'leida': False
            }).execute()
        except Exception as e:
            logger.warning(f"Error enviando notificación: {e}")
        
        return jsonify({'success': True, 'message': 'Compra registrada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error marcando como comprado: {str(e)}")
        return jsonify({'error': str(e)}), 500


@solicitudes_compra_bp.route('/solicitudes-compra/<int:id_solicitud>/entregar', methods=['PUT'])
@encargado_repuestos_required
def registrar_entrega(current_user, id_solicitud):
    """Registrar entrega de una solicitud comprada"""
    try:
        data = request.get_json()
        fecha_entrega = data.get('fecha_entrega')
        notas_entrega = data.get('notas_entrega', '')
        
        # Verificar que la solicitud existe
        check = supabase.table('solicitud_compra') \
            .select('id, estado, id_jefe_taller') \
            .eq('id', id_solicitud) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'comprado':
            return jsonify({'error': f'La solicitud debe estar comprada primero (estado: {check.data[0]["estado"]})'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        update_data = {
            'estado': 'entregado',
            'fecha_entrega': fecha_entrega or ahora,
            'notas_entrega': notas_entrega,
            'respuesta_encargado': f"Entregado el {fecha_entrega or ahora}"
        }
        
        result = supabase.table('solicitud_compra') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar la solicitud'}), 500
        
        # Notificar al jefe de taller
        try:
            supabase.table('notificacion').insert({
                'id_usuario_destino': check.data[0]['id_jefe_taller'],
                'tipo': 'entrega_realizada',
                'mensaje': f"📦 Entrega registrada para solicitud #{id_solicitud}",
                'fecha_envio': ahora,
                'leida': False
            }).execute()
        except Exception as e:
            logger.warning(f"Error enviando notificación: {e}")
        
        return jsonify({'success': True, 'message': 'Entrega registrada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error registrando entrega: {str(e)}")
        return jsonify({'error': str(e)}), 500


@solicitudes_compra_bp.route('/solicitudes-compra/stats', methods=['GET'])
@encargado_repuestos_required
def obtener_estadisticas(current_user):
    """Obtener estadísticas de solicitudes de compra"""
    try:
        pendientes = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'pendiente') \
            .execute()
        
        comprados = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'comprado') \
            .execute()
        
        entregados = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'entregado') \
            .execute()
        
        total = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        return jsonify({
            'success': True,
            'stats': {
                'pendientes': pendientes.count if hasattr(pendientes, 'count') else 0,
                'comprados': comprados.count if hasattr(comprados, 'count') else 0,
                'entregados': entregados.count if hasattr(entregados, 'count') else 0,
                'total': total.count if hasattr(total, 'count') else 0
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@solicitudes_compra_bp.route('/test-compra', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de solicitudes_compra funcionando'}), 200