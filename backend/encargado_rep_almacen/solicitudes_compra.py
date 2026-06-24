# =====================================================
# SOLICITUDES_COMPRA.PY - ENCARGADO DE REPUESTOS
# VERSIÓN CORREGIDA - OBTENER SERVICIO DESDE LA ORDEN
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import encargado_repuestos_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

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

def obtener_servicio_desde_orden(id_orden_trabajo):
    """Obtener la descripción del servicio asociado a una orden de trabajo"""
    try:
        # Buscar en diagnóstico_tecnico (tiene id_servicio)
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id_servicio, servicios!inner(descripcion)') \
            .eq('id_orden_trabajo', id_orden_trabajo) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico.data and diagnostico.data[0].get('id_servicio'):
            servicio = diagnostico.data[0].get('servicios', {})
            return servicio.get('descripcion', 'Servicio técnico')
        
        # Buscar en servicio_tecnico directamente (si hay relación)
        # Obtener servicio de la orden desde la planificación
        planificacion = supabase.table('planificacion') \
            .select('id_servicio, servicio_tecnico!inner(descripcion)') \
            .eq('id_orden_trabajo', id_orden_trabajo) \
            .limit(1) \
            .execute()
        
        if planificacion.data and planificacion.data[0].get('id_servicio'):
            servicio = planificacion.data[0].get('servicio_tecnico', {})
            return servicio.get('descripcion', 'Servicio técnico')
        
        return None
    except Exception as e:
        logger.warning(f"Error obteniendo servicio desde orden {id_orden_trabajo}: {e}")
        return None


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
        
        # Obtener IDs únicos de órdenes
        ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
        
        # Mapa de órdenes con vehículo
        ordenes_map = {}
        ordenes_servicio_map = {}  # Mapa para guardar el servicio de cada orden
        
        if ordenes_ids:
            # Obtener información de las órdenes
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
                
                # Obtener servicio para esta orden
                servicio = obtener_servicio_desde_orden(o['id'])
                if servicio:
                    ordenes_servicio_map[o['id']] = servicio
        
        solicitudes = []
        for s in result.data:
            orden_id = s.get('id_orden_trabajo')
            orden_info = ordenes_map.get(orden_id, {})
            
            # Obtener servicio - primero de nuestro mapa, si no, intentar obtener ahora
            servicio_desc = ordenes_servicio_map.get(orden_id)
            if not servicio_desc:
                servicio_desc = obtener_servicio_desde_orden(orden_id)
            
            if not servicio_desc:
                servicio_desc = 'Servicio técnico'
            
            items = parse_items(s.get('items'))
            if not items and s.get('descripcion_pieza'):
                items = [{
                    'descripcion': s.get('descripcion_pieza'),
                    'cantidad': s.get('cantidad', 1),
                    'detalle': ''
                }]
            
            solicitudes.append({
                'id': s.get('id'),
                'id_orden_trabajo': orden_id,
                'id_solicitud_cotizacion': s.get('id_solicitud_cotizacion'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'servicio_descripcion': servicio_desc,
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
                'notas_entrega': s.get('notas_entrega'),
                'comprobante_url': s.get('comprobante_url'),
                'numero_factura': s.get('numero_factura'),
                'proveedor_nombre': s.get('proveedor_nombre'),
                'monto_compra': float(s.get('monto_compra')) if s.get('monto_compra') else None
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
        numero_factura = data.get('numero_factura', '')
        proveedor_nombre = data.get('proveedor_nombre', '')
        monto_compra = data.get('monto_compra')  # Este viene del frontend
        comprobante_url = data.get('comprobante_url')
        
        # Verificar que la solicitud existe
        check = supabase.table('solicitud_compra') \
            .select('id, estado, id_jefe_taller, id_orden_trabajo, items') \
            .eq('id', id_solicitud) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': f'La solicitud ya está en estado {check.data[0]["estado"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # =====================================================
        # 🔧 CORREGIDO: Usar precio_cotizado en lugar de monto_compra
        # =====================================================
        update_data = {
            'estado': 'comprado',
            'fecha_compra': fecha_compra or ahora,
            'notas_compra': notas_compra,
            'respuesta_encargado': f"Compra realizada el {fecha_compra or ahora.split('T')[0]}"
        }
        
        # ✅ Usar precio_cotizado (que sí existe) en lugar de monto_compra
        if monto_compra:
            update_data['precio_cotizado'] = float(monto_compra)
        
        if numero_factura:
            update_data['numero_factura'] = numero_factura
        if proveedor_nombre:
            update_data['proveedor_nombre'] = proveedor_nombre
        if comprobante_url:
            update_data['comprobante_url'] = comprobante_url
        
        result = supabase.table('solicitud_compra') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar la solicitud'}), 500
        
        # Actualizar solicitud del técnico
        try:
            solicitud_tecnico = supabase.table('solicitud_repuestos_tecnico') \
                .select('id, estado') \
                .eq('id_orden_trabajo', check.data[0]['id_orden_trabajo']) \
                .in_('estado', ['pendiente', 'en_proceso']) \
                .order('fecha_solicitud', desc=True) \
                .limit(1) \
                .execute()
            
            if solicitud_tecnico.data:
                supabase.table('solicitud_repuestos_tecnico') \
                    .update({
                        'estado': 'completado',
                        'respuesta': f"Repuestos comprados el {fecha_compra or ahora.split('T')[0]}",
                        'fecha_respuesta': ahora
                    }) \
                    .eq('id', solicitud_tecnico.data[0]['id']) \
                    .execute()
                logger.info(f"✅ Solicitud de técnico actualizada a 'completado'")
        except Exception as e:
            logger.warning(f"Error actualizando solicitud de técnico: {e}")
        
        # Notificar al jefe de taller
        try:
            supabase.table('notificacion').insert({
                'id_usuario_destino': check.data[0]['id_jefe_taller'],
                'tipo': 'compra_realizada',
                'mensaje': f"🛒 Compra realizada para solicitud #{id_solicitud} - Factura: {numero_factura or 'N/A'}",
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
            .select('id, estado, id_jefe_taller, id_orden_trabajo') \
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
            'respuesta_encargado': f"Entregado el {fecha_entrega or ahora.split('T')[0]}"
        }
        
        result = supabase.table('solicitud_compra') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar la solicitud'}), 500
        
        # Actualizar solicitud del técnico a "entregado"
        try:
            solicitud_tecnico = supabase.table('solicitud_repuestos_tecnico') \
                .select('id, estado') \
                .eq('id_orden_trabajo', check.data[0]['id_orden_trabajo']) \
                .in_('estado', ['completado', 'pendiente', 'en_proceso']) \
                .order('fecha_solicitud', desc=True) \
                .limit(1) \
                .execute()
            
            if solicitud_tecnico.data:
                supabase.table('solicitud_repuestos_tecnico') \
                    .update({
                        'estado': 'entregado',
                        'fecha_entrega': fecha_entrega or ahora,
                        'respuesta': f"Repuestos entregados el {fecha_entrega or ahora.split('T')[0]}",
                        'fecha_respuesta': ahora
                    }) \
                    .eq('id', solicitud_tecnico.data[0]['id']) \
                    .execute()
                logger.info(f"✅ Solicitud de técnico actualizada a 'entregado'")
        except Exception as e:
            logger.warning(f"Error actualizando solicitud de técnico: {e}")
        
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
        
        # Notificar al técnico
        try:
            tecnico_asignado = supabase.table('asignaciontecnico') \
                .select('id_tecnico') \
                .eq('id_orden_trabajo', check.data[0]['id_orden_trabajo']) \
                .is_('fecha_hora_final', 'null') \
                .limit(1) \
                .execute()
            
            if tecnico_asignado.data and tecnico_asignado.data[0].get('id_tecnico'):
                supabase.table('notificacion').insert({
                    'id_usuario_destino': tecnico_asignado.data[0]['id_tecnico'],
                    'tipo': 'repuestos_entregados',
                    'mensaje': f"✅ Los repuestos solicitados para la orden han sido entregados. Ya puedes usarlos en tu trabajo.",
                    'fecha_envio': ahora,
                    'leida': False,
                    'id_referencia': id_solicitud
                }).execute()
        except Exception as e:
            logger.warning(f"Error notificando al técnico: {e}")
        
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