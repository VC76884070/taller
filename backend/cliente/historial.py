# =====================================================
# HISTORIAL.PY - CLIENTE
# FURIA MOTOR COMPANY SRL
# VERSIÓN CORREGIDA - COMPLETA
# =====================================================

from flask import Blueprint, request, jsonify, send_file
from config import config
from decorators import cliente_required
import datetime
import logging
import csv
from io import StringIO, BytesIO

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
historial_cliente_bp = Blueprint('historial_cliente', __name__)

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_cliente_por_usuario(usuario_id):
    """Obtener cliente a partir del usuario"""
    try:
        cliente = supabase.table('cliente') \
            .select('id, email') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return None
        
        cliente_data = cliente.data[0]
        
        usuario = supabase.table('usuario') \
            .select('nombre, contacto, email') \
            .eq('id', usuario_id) \
            .execute()
        
        if usuario.data:
            cliente_data['nombre'] = usuario.data[0].get('nombre', 'Cliente')
            cliente_data['telefono'] = usuario.data[0].get('contacto', '')
        
        return cliente_data
    except Exception as e:
        logger.error(f"Error obteniendo cliente: {e}")
        return None


def obtener_vehiculos_cliente(cliente_id):
    """Obtener todos los vehículos de un cliente"""
    try:
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje') \
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
            ordenes = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, fecha_ingreso, estado_global, total_diagnostico') \
                .eq('id_vehiculo', v['id']) \
                .order('fecha_ingreso', desc=True) \
                .execute()
            
            total_servicios = len(ordenes.data) if ordenes.data else 0
            total_gastado = sum(float(o.get('total_diagnostico', 0)) for o in (ordenes.data or []))
            
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
        
        query = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, total_diagnostico, id_vehiculo') \
            .in_('id_vehiculo', vehiculos_ids) \
            .order('fecha_ingreso', desc=True)
        
        if anio and anio != 'all':
            query = query.gte('fecha_ingreso', f"{anio}-01-01").lt('fecha_ingreso', f"{int(anio)+1}-01-01")
        
        count_result = query.execute()
        total = len(count_result.data) if count_result.data else 0
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        
        offset = (page - 1) * limit
        result = query.range(offset, offset + limit - 1).execute()
        
        servicios = []
        for o in (result.data or []):
            v = vehiculos_map.get(o['id_vehiculo'], {})
            
            monto_total = float(o.get('total_diagnostico', 0))
            
            servicios.append({
                'orden_id': o['id'],
                'codigo_orden': o['codigo_unico'],
                'fecha': o['fecha_ingreso'],
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')}".strip() or 'Vehículo',
                'placa': v.get('placa', ''),
                'servicios_count': 1,
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
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        orden = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, fecha_ingreso, fecha_salida, 
                estado_global, total_diagnostico,
                id_vehiculo,
                vehiculo!inner(marca, modelo, placa, anio, kilometraje)
            ''') \
            .eq('id', orden_id) \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Servicio no encontrado'}), 404
        
        o = orden.data[0]
        v = o.get('vehiculo', {})
        
        return jsonify({
            'success': True,
            'servicio': {
                'orden_id': o['id'],
                'codigo_orden': o['codigo_unico'],
                'fecha': o['fecha_ingreso'],
                'fecha_salida': o.get('fecha_salida'),
                'estado': o['estado_global'],
                'monto_total': float(o.get('total_diagnostico', 0)),
                'placa': v.get('placa'),
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')}".strip(),
                'anio': v.get('anio'),
                'kilometraje': v.get('kilometraje')
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
        
        ordenes = supabase.table('ordentrabajo') \
            .select('id, estado_global, total_diagnostico, fecha_ingreso, id_vehiculo') \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        ordenes_data = ordenes.data or []
        
        total_servicios = len(ordenes_data)
        total_gastado = sum(float(o.get('total_diagnostico', 0)) for o in ordenes_data)
        promedio = total_gastado / total_servicios if total_servicios > 0 else 0
        
        gastos_por_mes = []
        hoy = datetime.datetime.now()
        for i in range(11, -1, -1):
            mes = hoy.month - i
            año = hoy.year
            if mes <= 0:
                mes += 12
                año -= 1
            
            nombre_mes = datetime.date(año, mes, 1).strftime('%b %Y')
            
            monto_mes = 0
            for o in ordenes_data:
                fecha = o.get('fecha_ingreso', '')
                if fecha and fecha.startswith(f"{año}-{mes:02d}"):
                    monto_mes += float(o.get('total_diagnostico', 0))
            
            gastos_por_mes.append({
                'mes': nombre_mes,
                'monto': monto_mes
            })
        
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
# ENDPOINTS - EXPORTACIÓN
# =====================================================

@historial_cliente_bp.route('/exportar-servicios', methods=['GET'])
@cliente_required
def exportar_servicios_csv(current_user):
    """Exportar servicios a CSV"""
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        vehiculos_map = {v['id']: v for v in vehiculos}
        
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, total_diagnostico, id_vehiculo') \
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
                float(o.get('total_diagnostico', 0)),
                o.get('estado_global', '')
            ])
        
        output.seek(0)
        
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
# ENDPOINTS - AÑOS
# =====================================================

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
# ENDPOINTS - DOCUMENTOS (SIMPLIFICADO Y CORREGIDO)
# =====================================================

@historial_cliente_bp.route('/documentos-cliente', methods=['GET'])
@cliente_required
def obtener_documentos_cliente(current_user):
    """Obtener lista de documentos del cliente"""
    try:
        tipo = request.args.get('tipo', 'all')
        
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'documentos': []}), 200
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global') \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        documentos = []
        
        for o in (ordenes.data or []):
            documentos.append({
                'id': o['id'],
                'tipo': 'orden',
                'titulo': f'Orden de Trabajo - {o["codigo_unico"]}',
                'codigo': o['codigo_unico'],
                'fecha': o['fecha_ingreso'],
                'estado': o.get('estado_global', '')
            })
        
        documentos.sort(key=lambda x: x['fecha'], reverse=True)
        
        if tipo != 'all':
            documentos = [d for d in documentos if d['tipo'] == tipo]
        
        return jsonify({'success': True, 'documentos': documentos}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo documentos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@historial_cliente_bp.route('/documento/orden/<int:id>', methods=['GET'])
@cliente_required
def obtener_documento_orden(current_user, id):
    """Obtener detalle de una orden (documento simplificado)"""
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        orden = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, fecha_ingreso, fecha_salida,
                estado_global, total_diagnostico,
                id_vehiculo,
                vehiculo!inner(marca, modelo, placa, anio)
            ''') \
            .eq('id', id) \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Documento no encontrado'}), 404
        
        o = orden.data[0]
        v = o.get('vehiculo', {})
        
        info = {
            'id': o['id'],
            'tipo': 'orden',
            'codigo': o['codigo_unico'],
            'fecha_ingreso': o['fecha_ingreso'],
            'fecha_salida': o.get('fecha_salida'),
            'estado': o['estado_global'],
            'monto_total': float(o.get('total_diagnostico', 0)),
            'vehiculo': {
                'placa': v.get('placa'),
                'marca': v.get('marca'),
                'modelo': v.get('modelo'),
                'anio': v.get('anio')
            }
        }
        
        return jsonify({'success': True, 'documento': info}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo documento orden: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@historial_cliente_bp.route('/test-historial', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de historial cliente funcionando'}), 200