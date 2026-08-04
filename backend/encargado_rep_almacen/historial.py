# =====================================================
# HISTORIAL.PY - ENCARGADO DE REPUESTOS
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
historial_repuestos_bp = Blueprint('historial_repuestos', __name__, url_prefix='/api/encargado-repuestos')

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

def format_fecha(fecha_str):
    if not fecha_str:
        return None
    try:
        if isinstance(fecha_str, str):
            return fecha_str.split('T')[0] if 'T' in fecha_str else fecha_str
        return fecha_str
    except:
        return fecha_str

# =====================================================
# ENDPOINTS - COTIZACIONES
# =====================================================

@historial_repuestos_bp.route('/historial/cotizaciones', methods=['GET'])
@encargado_repuestos_required
def obtener_historial_cotizaciones(current_user):
    """Obtener historial de cotizaciones del encargado"""
    try:
        estado = request.args.get('estado')
        fecha_inicio = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')
        
        query = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .order('fecha_solicitud', desc=True)
        
        if estado and estado != 'all':
            query = query.eq('estado', estado)
        
        if fecha_inicio:
            query = query.gte('fecha_solicitud', f"{fecha_inicio}T00:00:00")
        if fecha_fin:
            query = query.lte('fecha_solicitud', f"{fecha_fin}T23:59:59")
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
        
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
        
        cotizaciones = []
        for s in result.data:
            orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
            items = parse_items(s.get('items'))
            
            cotizaciones.append({
                'id': s.get('id'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'repuesto': items[0].get('descripcion') if items else s.get('descripcion_pieza'),
                'cantidad': items[0].get('cantidad') if items else s.get('cantidad', 1),
                'precio': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'proveedor': s.get('proveedor_info'),
                'estado': s.get('estado', 'pendiente'),
                'fecha_respuesta': s.get('fecha_respuesta')
            })
        
        return jsonify({'success': True, 'cotizaciones': cotizaciones}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo historial cotizaciones: {str(e)}")
        return jsonify({'error': str(e)}), 500


@historial_repuestos_bp.route('/historial/cotizaciones/<int:id_cotizacion>', methods=['GET'])
@encargado_repuestos_required
def obtener_detalle_cotizacion_historial(current_user, id_cotizacion):
    """Obtener detalle de una cotización específica"""
    try:
        result = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('id', id_cotizacion) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        s = result.data[0]
        
        orden_info = supabase.table('ordentrabajo') \
            .select('codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .eq('id', s.get('id_orden_trabajo')) \
            .execute()
        
        orden = orden_info.data[0] if orden_info.data else {}
        vehiculo = orden.get('vehiculo', {}) if orden else {}
        
        servicio_info = supabase.table('servicio_tecnico') \
            .select('descripcion') \
            .eq('id', s.get('id_servicio')) \
            .execute()
        
        items = parse_items(s.get('items'))
        
        cotizacion = {
            'id': s.get('id'),
            'id_orden_trabajo': s.get('id_orden_trabajo'),
            'orden_codigo': orden.get('codigo_unico', 'N/A'),
            'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
            'servicio_descripcion': servicio_info.data[0].get('descripcion') if servicio_info.data else 'N/A',
            'items': items,
            'estado': s.get('estado'),
            'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
            'proveedor_info': s.get('proveedor_info'),
            'observacion_jefe_taller': s.get('observacion_jefe_taller'),
            'respuesta_encargado': s.get('respuesta_encargado'),
            'fecha_solicitud': s.get('fecha_solicitud'),
            'fecha_respuesta': s.get('fecha_respuesta')
        }
        
        return jsonify({'success': True, 'cotizacion': cotizacion}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - COMPRAS
# =====================================================

@historial_repuestos_bp.route('/historial/compras', methods=['GET'])
@encargado_repuestos_required
def obtener_historial_compras(current_user):
    """Obtener historial de compras del encargado"""
    try:
        estado = request.args.get('estado')
        fecha_inicio = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')
        
        query = supabase.table('solicitud_compra') \
            .select('*') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .order('fecha_solicitud', desc=True)
        
        if estado and estado != 'all':
            query = query.eq('estado', estado)
        
        if fecha_inicio:
            query = query.gte('fecha_solicitud', f"{fecha_inicio}T00:00:00")
        if fecha_fin:
            query = query.lte('fecha_solicitud', f"{fecha_fin}T23:59:59")
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'compras': []}), 200
        
        ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
        
        ordenes_map = {}
        if ordenes_ids:
            ordenes_result = supabase.table('ordentrabajo') \
                .select('id, codigo_unico') \
                .in_('id', ordenes_ids) \
                .execute()
            for o in (ordenes_result.data or []):
                ordenes_map[o['id']] = o.get('codigo_unico')
        
        compras = []
        for s in result.data:
            items = parse_items(s.get('items'))
            
            compras.append({
                'id': s.get('id'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_compra': s.get('fecha_compra'),
                'orden_codigo': ordenes_map.get(s.get('id_orden_trabajo'), 'N/A'),
                'proveedor': s.get('proveedor_info'),
                'repuesto': items[0].get('descripcion') if items else s.get('descripcion_pieza'),
                'cantidad': items[0].get('cantidad') if items else s.get('cantidad', 1),
                'monto': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'estado': s.get('estado', 'pendiente')
            })
        
        return jsonify({'success': True, 'compras': compras}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo historial compras: {str(e)}")
        return jsonify({'error': str(e)}), 500


@historial_repuestos_bp.route('/historial/compras/<int:id_compra>', methods=['GET'])
@encargado_repuestos_required
def obtener_detalle_compra_historial(current_user, id_compra):
    """Obtener detalle de una compra específica"""
    try:
        result = supabase.table('solicitud_compra') \
            .select('*') \
            .eq('id', id_compra) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Compra no encontrada'}), 404
        
        s = result.data[0]
        
        orden_info = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', s.get('id_orden_trabajo')) \
            .execute()
        
        items = parse_items(s.get('items'))
        
        compra = {
            'id': s.get('id'),
            'id_orden_trabajo': s.get('id_orden_trabajo'),
            'orden_codigo': orden_info.data[0].get('codigo_unico') if orden_info.data else 'N/A',
            'items': items,
            'proveedor': s.get('proveedor_info'),
            'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
            'monto': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
            'estado': s.get('estado'),
            'fecha_solicitud': s.get('fecha_solicitud'),
            'fecha_compra': s.get('fecha_compra'),
            'notas_compra': s.get('notas_compra'),
            'respuesta_encargado': s.get('respuesta_encargado')
        }
        
        return jsonify({'success': True, 'compra': compra}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle compra: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - ENTREGAS
# =====================================================

@historial_repuestos_bp.route('/historial/entregas', methods=['GET'])
@encargado_repuestos_required
def obtener_historial_entregas(current_user):
    """Obtener historial de entregas del encargado"""
    try:
        estado = request.args.get('estado')
        fecha_inicio = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')
        
        query = supabase.table('solicitud_compra') \
            .select('*') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'entregado') \
            .order('fecha_entrega', desc=True)
        
        if fecha_inicio:
            query = query.gte('fecha_entrega', f"{fecha_inicio}T00:00:00")
        if fecha_fin:
            query = query.lte('fecha_entrega', f"{fecha_fin}T23:59:59")
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'entregas': []}), 200
        
        ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
        
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
        
        entregas = []
        for s in result.data:
            orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
            items = parse_items(s.get('items'))
            
            entregas.append({
                'id': s.get('id'),
                'fecha_entrega': s.get('fecha_entrega'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'repuesto': items[0].get('descripcion') if items else s.get('descripcion_pieza'),
                'cantidad': items[0].get('cantidad') if items else s.get('cantidad', 1),
                'destinatario': None,
                'estado': s.get('estado')
            })
        
        return jsonify({'success': True, 'entregas': entregas}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo historial entregas: {str(e)}")
        return jsonify({'error': str(e)}), 500@historial_repuestos_bp.route('/historial/entregas/<int:id_entrega>', methods=['GET'])
@encargado_repuestos_required
def obtener_detalle_entrega_historial(current_user, id_entrega):
    """Obtener detalle de una entrega específica"""
    try:
        result = supabase.table('solicitud_compra') \
            .select('*') \
            .eq('id', id_entrega) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Entrega no encontrada'}), 404
        
        s = result.data[0]
        
        orden_info = supabase.table('ordentrabajo') \
            .select('codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .eq('id', s.get('id_orden_trabajo')) \
            .execute()
        
        orden = orden_info.data[0] if orden_info.data else {}
        vehiculo = orden.get('vehiculo', {}) if orden else {}
        
        items = parse_items(s.get('items'))
        
        entrega = {
            'id': s.get('id'),
            'id_orden_trabajo': s.get('id_orden_trabajo'),
            'orden_codigo': orden.get('codigo_unico', 'N/A'),
            'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
            'items': items,
            'estado': s.get('estado'),
            'fecha_entrega': s.get('fecha_entrega'),
            'notas_entrega': s.get('notas_entrega'),
            'destinatario': None
        }
        
        return jsonify({'success': True, 'entrega': entrega}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle entrega: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - ESTADÍSTICAS
# =====================================================

@historial_repuestos_bp.route('/historial/estadisticas', methods=['GET'])
@encargado_repuestos_required
def obtener_estadisticas_historial(current_user):
    """Obtener estadísticas para el dashboard de historial"""
    try:
        # Totales
        cotizaciones = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        compras = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        entregas = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'entregado') \
            .execute()
        
        # Monto total de compras
        compras_data = supabase.table('solicitud_compra') \
            .select('precio_cotizado') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        monto_total = 0
        for c in (compras_data.data or []):
            if c.get('precio_cotizado'):
                monto_total += float(c['precio_cotizado'])
        
        # Movimientos por mes (últimos 6 meses)
        movimientos_por_mes = []
        hoy = datetime.datetime.now()
        for i in range(5, -1, -1):
            mes = hoy.month - i
            año = hoy.year
            if mes <= 0:
                mes += 12
                año -= 1
            
            mes_str = f"{año}-{mes:02d}"
            nombre_mes = datetime.date(año, mes, 1).strftime('%b %Y')
            
            # Cotizaciones del mes
            cotizaciones_mes = supabase.table('solicitud_cotizacion_repuesto') \
                .select('id', count='exact') \
                .eq('id_encargado_repuestos', current_user['id']) \
                .gte('fecha_solicitud', f"{mes_str}-01T00:00:00") \
                .lt('fecha_solicitud', f"{año}-{mes+1:02d}-01T00:00:00" if mes < 12 else f"{año+1}-01-01T00:00:00") \
                .execute()
            
            # Compras del mes
            compras_mes = supabase.table('solicitud_compra') \
                .select('id', count='exact') \
                .eq('id_encargado_repuestos', current_user['id']) \
                .gte('fecha_solicitud', f"{mes_str}-01T00:00:00") \
                .lt('fecha_solicitud', f"{año}-{mes+1:02d}-01T00:00:00" if mes < 12 else f"{año+1}-01-01T00:00:00") \
                .execute()
            
            # Entregas del mes
            entregas_mes = supabase.table('solicitud_compra') \
                .select('id', count='exact') \
                .eq('id_encargado_repuestos', current_user['id']) \
                .eq('estado', 'entregado') \
                .gte('fecha_entrega', f"{mes_str}-01T00:00:00") \
                .lt('fecha_entrega', f"{año}-{mes+1:02d}-01T00:00:00" if mes < 12 else f"{año+1}-01-01T00:00:00") \
                .execute()
            
            movimientos_por_mes.append({
                'mes': nombre_mes,
                'cotizaciones': cotizaciones_mes.count if hasattr(cotizaciones_mes, 'count') else 0,
                'compras': compras_mes.count if hasattr(compras_mes, 'count') else 0,
                'entregas': entregas_mes.count if hasattr(entregas_mes, 'count') else 0
            })
        
        # Estados
        estados = {}
        for estado in ['pendiente', 'cotizado', 'comprado', 'entregado']:
            if estado == 'entregado':
                count = supabase.table('solicitud_compra') \
                    .select('id', count='exact') \
                    .eq('id_encargado_repuestos', current_user['id']) \
                    .eq('estado', estado) \
                    .execute()
            elif estado == 'pendiente':
                count = supabase.table('solicitud_cotizacion_repuesto') \
                    .select('id', count='exact') \
                    .eq('id_encargado_repuestos', current_user['id']) \
                    .eq('estado', estado) \
                    .execute()
            elif estado == 'cotizado':
                count = supabase.table('solicitud_cotizacion_repuesto') \
                    .select('id', count='exact') \
                    .eq('id_encargado_repuestos', current_user['id']) \
                    .eq('estado', estado) \
                    .execute()
            else:  # comprado
                count = supabase.table('solicitud_compra') \
                    .select('id', count='exact') \
                    .eq('id_encargado_repuestos', current_user['id']) \
                    .eq('estado', estado) \
                    .execute()
            
            estados[estado] = count.count if hasattr(count, 'count') else 0
        
        # Top proveedores
        compras_con_proveedor = supabase.table('solicitud_compra') \
            .select('proveedor_info') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .not_.is_('proveedor_info', 'null') \
            .execute()
        
        proveedores_count = {}
        for c in (compras_con_proveedor.data or []):
            prov = c.get('proveedor_info')
            if prov:
                proveedores_count[prov] = proveedores_count.get(prov, 0) + 1
        
        top_proveedores = sorted(proveedores_count.items(), key=lambda x: x[1], reverse=True)[:5]
        top_proveedores_list = [{'nombre': p[0], 'total_compras': p[1]} for p in top_proveedores]
        
        return jsonify({
            'success': True,
            'stats': {
                'total_cotizaciones': cotizaciones.count if hasattr(cotizaciones, 'count') else 0,
                'total_compras': compras.count if hasattr(compras, 'count') else 0,
                'total_entregas': entregas.count if hasattr(entregas, 'count') else 0,
                'monto_total_compras': monto_total,
                'movimientos_por_mes': movimientos_por_mes,
                'estados': estados,
                'top_proveedores': top_proveedores_list
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@historial_repuestos_bp.route('/test-historial', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de historial funcionando'}), 200