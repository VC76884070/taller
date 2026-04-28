# =====================================================
# AVANCES.PY - CLIENTE
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
avances_cliente_bp = Blueprint('avances_cliente', __name__)  # Sin url_prefix

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

@avances_cliente_bp.route('/avances', methods=['GET'])
@cliente_required
def obtener_avances_cliente(current_user):
    """Obtener órdenes de trabajo activas del cliente (avances)"""
    try:
        estado_filtro = request.args.get('estado')
        
        # Obtener cliente
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'avances': []}), 200
        
        cliente_id = cliente['id']
        
        # Obtener vehículos del cliente
        vehiculos = obtener_vehiculos_cliente(cliente_id)
        if not vehiculos:
            return jsonify({'success': True, 'avances': []}), 200
        
        vehiculos_ids = [v['id'] for v in vehiculos]
        vehiculos_map = {v['id']: v for v in vehiculos}
        
        # Obtener órdenes de trabajo
        query = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, fecha_ingreso, fecha_salida, 
                estado_global, kilometraje_ingreso,
                cliente_nombre, cliente_telefono, cliente_email,
                transcripcion_problema, fecha_estimada_entrega
            ''') \
            .in_('id_vehiculo', vehiculos_ids) \
            .order('fecha_ingreso', desc=True)
        
        if estado_filtro == 'activo':
            query = query.not_.in_('estado_global', ['Finalizado', 'Entregado'])
        elif estado_filtro == 'completado':
            query = query.in_('estado_global', ['Finalizado', 'Entregado'])
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'avances': []}), 200
        
        avances = []
        for orden in result.data:
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            
            # Obtener última actividad
            ultima_actividad = None
            if orden.get('estado_global') != 'Finalizado' and orden.get('estado_global') != 'Entregado':
                # Obtener la última actualización del diagnóstico o reparación
                diagnostico = supabase.table('diagnostico_tecnico') \
                    .select('transcripcion_problema, updated_at') \
                    .eq('id_orden_trabajo', orden['id']) \
                    .order('version', desc=True) \
                    .limit(1) \
                    .execute()
                
                if diagnostico.data:
                    ultima_actividad = diagnostico.data[0].get('transcripcion_problema')
            
            avances.append({
                'orden_id': orden['id'],
                'codigo_orden': orden['codigo_unico'],
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip() or 'Vehículo',
                'placa': vehiculo.get('placa'),
                'estado': orden['estado_global'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_estimada': orden.get('fecha_estimada_entrega'),
                'ultima_actividad': ultima_actividad,
                'kilometraje': orden.get('kilometraje_ingreso')
            })
        
        return jsonify({'success': True, 'avances': avances}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo avances: {str(e)}")
        return jsonify({'error': str(e)}), 500


@avances_cliente_bp.route('/avance-detalle/<int:orden_id>', methods=['GET'])
@cliente_required
def obtener_detalle_avance(current_user, orden_id):
    """Obtener detalle completo del avance de una orden"""
    try:
        # Verificar que la orden pertenece al cliente
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        # Obtener vehículos del cliente
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        # Obtener orden
        orden = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, fecha_ingreso, fecha_salida, 
                estado_global, kilometraje_ingreso,
                cliente_nombre, cliente_telefono, cliente_email,
                transcripcion_problema, sugerencias_cliente,
                id_vehiculo, vehiculo!inner(marca, modelo, placa, anio)
            ''') \
            .eq('id', orden_id) \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data[0]
        vehiculo = orden_data.get('vehiculo', {})
        
        # Obtener actividades de la orden
        actividades = []
        
        # Diagnóstico
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('''
                version, transcripcion_problema, created_at,
                tecnico!inner(nombre)
            ''') \
            .eq('id_orden_trabajo', orden_id) \
            .order('version', desc=True) \
            .execute()
        
        for diag in (diagnosticos.data or []):
            tecnico = diag.get('tecnico', {})
            actividades.append({
                'tipo': 'diagnostico',
                'descripcion': diag.get('transcripcion_problema', 'Diagnóstico realizado'),
                'fecha': diag.get('created_at'),
                'tecnico': tecnico.get('nombre') if tecnico else None
            })
        
        # Obtener técnicos asignados
        tecnicos_asignados = supabase.table('orden_tecnico') \
            .select('tecnico!inner(id, nombre, especialidad)') \
            .eq('id_orden_trabajo', orden_id) \
            .execute()
        
        tecnicos = []
        for ot in (tecnicos_asignados.data or []):
            tecnico = ot.get('tecnico', {})
            if tecnico:
                tecnicos.append({
                    'nombre': tecnico.get('nombre'),
                    'especialidad': tecnico.get('especialidad')
                })
        
        # Obtener fecha de entrega si está completada
        fecha_entrega = None
        if orden_data['estado_global'] in ['Finalizado', 'Entregado']:
            fecha_entrega = orden_data.get('fecha_salida')
        
        return jsonify({
            'success': True,
            'avance': {
                'orden_id': orden_data['id'],
                'codigo_orden': orden_data['codigo_unico'],
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip(),
                'placa': vehiculo.get('placa'),
                'anio': vehiculo.get('anio'),
                'estado': orden_data['estado_global'],
                'fecha_ingreso': orden_data['fecha_ingreso'],
                'fecha_entrega': fecha_entrega,
                'kilometraje': orden_data.get('kilometraje_ingreso'),
                'descripcion_problema': orden_data.get('transcripcion_problema'),
                'sugerencias': orden_data.get('sugerencias_cliente'),
                'actividades': actividades,
                'tecnicos': tecnicos
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle avance: {str(e)}")
        return jsonify({'error': str(e)}), 500


@avances_cliente_bp.route('/orden-completa/<int:orden_id>', methods=['GET'])
@cliente_required
def obtener_orden_completa(current_user, orden_id):
    """Obtener orden de trabajo completada para impresión"""
    try:
        # Verificar que la orden pertenece al cliente
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        # Obtener vehículos del cliente
        vehiculos = obtener_vehiculos_cliente(cliente['id'])
        vehiculos_ids = [v['id'] for v in vehiculos]
        
        # Obtener orden
        orden = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, fecha_ingreso, fecha_salida, 
                estado_global, kilometraje_ingreso, kilometraje_salida,
                cliente_nombre, cliente_telefono, cliente_email,
                transcripcion_problema, trabajos_realizados, observaciones_finales,
                id_vehiculo, vehiculo!inner(marca, modelo, placa, anio)
            ''') \
            .eq('id', orden_id) \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data[0]
        vehiculo = orden_data.get('vehiculo', {})
        
        return jsonify({
            'success': True,
            'orden': {
                'codigo_orden': orden_data['codigo_unico'],
                'fecha_completado': orden_data.get('fecha_salida'),
                'cliente_nombre': orden_data.get('cliente_nombre'),
                'cliente_telefono': orden_data.get('cliente_telefono'),
                'placa': vehiculo.get('placa'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip(),
                'anio': vehiculo.get('anio'),
                'kilometraje_ingreso': orden_data.get('kilometraje_ingreso'),
                'kilometraje_salida': orden_data.get('kilometraje_salida'),
                'trabajos_realizados': orden_data.get('trabajos_realizados') or orden_data.get('transcripcion_problema'),
                'observaciones': orden_data.get('observaciones_finales')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo orden completa: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@avances_cliente_bp.route('/test-avances', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de avances cliente funcionando'}), 200