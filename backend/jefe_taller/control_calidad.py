# =====================================================
# CONTROL_CALIDAD.PY - JEFE DE TALLER
# VERSIÓN CORREGIDA - USANDO TABLAS REALES DE LA BD
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# Inicializar blueprint
control_calidad_bp = Blueprint('control_calidad', __name__, url_prefix='/api/jefe-taller/control-calidad')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_tecnicos_orden(id_orden: int) -> str:
    """Obtener nombres de técnicos asignados a una orden"""
    try:
        # Obtener asignaciones activas
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        tecnicos_ids = [a['id_tecnico'] for a in (asignaciones.data or []) if a.get('id_tecnico')]
        
        # Si no hay activas, buscar históricas
        if not tecnicos_ids:
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_tecnico') \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
            tecnicos_ids = [a['id_tecnico'] for a in (asignaciones.data or []) if a.get('id_tecnico')]
        
        if tecnicos_ids:
            tecnicos = supabase.table('usuario') \
                .select('nombre') \
                .in_('id', tecnicos_ids) \
                .execute()
            nombres = [t.get('nombre', 'Técnico') for t in (tecnicos.data or [])]
            return ', '.join(nombres) if nombres else 'No asignado'
        
        return 'No asignado'
    
    except Exception as e:
        logger.error(f"Error obteniendo técnicos para orden {id_orden}: {e}")
        return 'No asignado'

def formatear_vehiculo(vehiculo_data: Optional[Dict]) -> str:
    """Formatear datos del vehículo para mostrar"""
    if not vehiculo_data:
        return 'Vehículo no registrado'
    
    marca = vehiculo_data.get('marca', '')
    modelo = vehiculo_data.get('modelo', '')
    placa = vehiculo_data.get('placa', '')
    
    if marca or modelo:
        return f"{marca} {modelo} ({placa})".strip()
    return f"Vehículo ({placa})" if placa else 'Vehículo no registrado'

def obtener_cliente_nombre(id_cliente: int) -> str:
    """Obtener nombre del cliente por ID de cliente"""
    try:
        if not id_cliente:
            return 'Cliente no registrado'
        
        # Obtener id_usuario desde tabla cliente
        cliente = supabase.table('cliente') \
            .select('id_usuario') \
            .eq('id', id_cliente) \
            .execute()
        
        if cliente.data and cliente.data[0].get('id_usuario'):
            usuario = supabase.table('usuario') \
                .select('nombre') \
                .eq('id', cliente.data[0]['id_usuario']) \
                .execute()
            if usuario.data:
                return usuario.data[0].get('nombre', 'Cliente no registrado')
        
        return 'Cliente no registrado'
    except Exception as e:
        logger.error(f"Error obteniendo cliente: {e}")
        return 'Cliente no registrado'

def obtener_diagnostico_tecnico(id_orden: int) -> Dict:
    """Obtener diagnóstico técnico de una orden (tabla diagnostico_tecnico)"""
    try:
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('informe, url_grabacion_informe, fecha_envio, estado, version') \
            .eq('id_orden_trabajo', id_orden) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico.data:
            diag = diagnostico.data[0]
            return {
                'informe': diag.get('informe'),
                'audio_url': diag.get('url_grabacion_informe'),
                'fecha_diagnostico': diag.get('fecha_envio'),
                'estado': diag.get('estado'),
                'version': diag.get('version', 1)
            }
        return {}
    except Exception as e:
        logger.error(f"Error obteniendo diagnóstico: {e}")
        return {}

def obtener_servicios_orden(id_orden: int) -> List[Dict]:
    """Obtener servicios de una orden (tabla servicio_tecnico)"""
    try:
        # Primero obtener diagnóstico de la orden
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if not diagnostico.data:
            return []
        
        diagnostico_id = diagnostico.data[0]['id']
        
        # Obtener servicios del diagnóstico
        servicios = supabase.table('servicio_tecnico') \
            .select('id, descripcion, orden') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .order('orden') \
            .execute()
        
        return [{
            'descripcion': s.get('descripcion', 'Servicio no especificado'),
            'cantidad': 1,
            'precio': 0  # No tenemos precio directo en servicio_tecnico
        } for s in (servicios.data or [])]
    
    except Exception as e:
        logger.error(f"Error obteniendo servicios: {e}")
        return []

def obtener_recepcion(id_orden: int) -> Dict:
    """Obtener datos de recepción (tabla recepcion)"""
    try:
        recepcion = supabase.table('recepcion') \
            .select('transcripcion_problema, url_grabacion_problema, url_foto_frontal, url_foto_trasera, url_foto_superior, url_foto_inferior, url_foto_tablero, url_lateral_izquierda, url_lateral_derecha') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if recepcion.data:
            r = recepcion.data[0]
            # Organizar fotos en un diccionario
            fotos = {}
            for key in ['url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero', 'url_lateral_izquierda', 'url_lateral_derecha']:
                if r.get(key):
                    nombre = key.replace('url_', '').replace('_', ' ').title()
                    fotos[nombre] = r[key]
            
            return {
                'transcripcion_problema': r.get('transcripcion_problema'),
                'audio_url': r.get('url_grabacion_problema'),
                'fotos': fotos
            }
        return {}
    except Exception as e:
        logger.error(f"Error obteniendo recepción: {e}")
        return {}

def obtener_historial_orden(id_orden: int) -> List[Dict]:
    """Obtener historial de cambios (tabla seguimientoorden)"""
    try:
        historial = supabase.table('seguimientoorden') \
            .select('estado, motivo_pausa, fecha_hora_cambio, notificaciones_enviadas') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_hora_cambio', desc=True) \
            .limit(10) \
            .execute()
        
        return [{
            'estado_anterior': None,
            'estado_nuevo': h.get('estado'),
            'fecha_cambio': h.get('fecha_hora_cambio'),
            'comentarios': h.get('motivo_pausa')
        } for h in (historial.data or [])]
    
    except Exception as e:
        logger.error(f"Error obteniendo historial: {e}")
        return []

# =====================================================
# ENDPOINTS DE PRUEBA
# =====================================================

@control_calidad_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba SIN autenticación"""
    return jsonify({
        'success': True,
        'message': 'Control de Calidad blueprint funcionando correctamente',
        'timestamp': datetime.datetime.now().isoformat()
    }), 200

# =====================================================
# ENDPOINTS PRINCIPALES (CORREGIDOS)
# =====================================================

@control_calidad_bp.route('/ordenes-pendientes', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_pendientes(current_user):
    """
    Obtener ÚLTIMAS 10 órdenes pendientes de revisión
    """
    try:
        estado = request.args.get('estado', 'all')
        limit = request.args.get('limit', 10, type=int)
        search = request.args.get('search', '').lower()
        
        logger.info(f"📋 Usuario {current_user.get('id')} - Pendientes | Estado: {estado} | Límite: {limit}")
        
        # Órdenes con VehiculoArmado o ReparacionCompletada
        query = supabase.table('ordentrabajo') \
            .select('*') \
            .in_('estado_global', ['VehiculoArmado', 'ReparacionCompletada']) \
            .order('fecha_ingreso', desc=True) \
            .limit(limit)
        
        if estado != 'all':
            query = query.eq('estado_global', estado)
        
        result = query.execute()
        ordenes = result.data or []
        
        logger.info(f"📊 Se encontraron {len(ordenes)} órdenes pendientes")
        
        # Filtrar por búsqueda si es necesario
        if search:
            ordenes = [o for o in ordenes if 
                search in (o.get('codigo_unico', '') or '').lower() or
                search in (o.get('id_vehiculo', '') or '').lower()
            ]
        
        # Para cada orden, obtener datos relacionados
        ordenes_formateadas = []
        for orden in ordenes:
            orden_id = orden.get('id')
            if not orden_id:
                continue
            
            # Obtener datos del vehículo
            vehiculo_texto = 'Vehículo no registrado'
            if orden.get('id_vehiculo'):
                try:
                    vehiculo_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo') \
                        .eq('id', orden['id_vehiculo']) \
                        .execute()
                    if vehiculo_result.data:
                        vehiculo_texto = formatear_vehiculo(vehiculo_result.data[0])
                except Exception as e:
                    logger.error(f"Error obteniendo vehículo: {e}")
            
            # Obtener nombre del cliente
            cliente_nombre = 'Cliente no registrado'
            if orden.get('id_cliente'):
                cliente_nombre = obtener_cliente_nombre(orden['id_cliente'])
            
            # Obtener técnicos
            tecnicos_nombres = obtener_tecnicos_orden(orden_id)
            
            ordenes_formateadas.append({
                'id_orden': orden_id,
                'codigo_unico': orden.get('codigo_unico', 'N/A'),
                'estado_global': orden.get('estado_global', 'Pendiente'),
                'vehiculo': vehiculo_texto,
                'cliente_nombre': cliente_nombre,
                'tecnicos_nombres': tecnicos_nombres,
                'fecha_inicio': orden.get('fecha_ingreso'),
                'fecha_fin': orden.get('fecha_estimada_finalizacion') or orden.get('fecha_ingreso'),
                'fecha_ingreso': orden.get('fecha_ingreso')
            })
        
        return jsonify({
            'success': True,
            'ordenes': ordenes_formateadas,
            'total': len(ordenes_formateadas),
            'limite': limit
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en obtener_ordenes_pendientes: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/ordenes-finalizadas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_finalizadas(current_user):
    """
    Obtener ÚLTIMAS 10 órdenes finalizadas o entregadas
    """
    try:
        estado = request.args.get('estado', 'all')
        limit = request.args.get('limit', 10, type=int)
        search = request.args.get('search', '').lower()
        
        logger.info(f"📋 Usuario {current_user.get('id')} - Finalizadas | Estado: {estado} | Límite: {limit}")
        
        # Órdenes finalizadas o entregadas
        query = supabase.table('ordentrabajo') \
            .select('*') \
            .in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_ingreso', desc=True) \
            .limit(limit)
        
        if estado != 'all':
            query = query.eq('estado_global', estado)
        
        result = query.execute()
        ordenes = result.data or []
        
        logger.info(f"📊 Se encontraron {len(ordenes)} órdenes finalizadas")
        
        if search:
            ordenes = [o for o in ordenes if 
                search in (o.get('codigo_unico', '') or '').lower() or
                search in (o.get('id_vehiculo', '') or '').lower()
            ]
        
        ordenes_formateadas = []
        for orden in ordenes:
            orden_id = orden.get('id')
            if not orden_id:
                continue
            
            vehiculo_texto = 'Vehículo no registrado'
            if orden.get('id_vehiculo'):
                try:
                    vehiculo_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo') \
                        .eq('id', orden['id_vehiculo']) \
                        .execute()
                    if vehiculo_result.data:
                        vehiculo_texto = formatear_vehiculo(vehiculo_result.data[0])
                except Exception as e:
                    logger.error(f"Error obteniendo vehículo: {e}")
            
            cliente_nombre = 'Cliente no registrado'
            if orden.get('id_cliente'):
                cliente_nombre = obtener_cliente_nombre(orden['id_cliente'])
            
            tecnicos_nombres = obtener_tecnicos_orden(orden_id)
            
            ordenes_formateadas.append({
                'id_orden': orden_id,
                'codigo_unico': orden.get('codigo_unico', 'N/A'),
                'estado_global': orden.get('estado_global', 'Finalizado'),
                'vehiculo': vehiculo_texto,
                'cliente_nombre': cliente_nombre,
                'tecnicos_nombres': tecnicos_nombres,
                'fecha_finalizacion': orden.get('fecha_salida') or orden.get('fecha_ingreso'),
                'comentarios_aprobacion': orden.get('instrucciones_tecnico', '')
            })
        
        return jsonify({
            'success': True,
            'ordenes': ordenes_formateadas,
            'total': len(ordenes_formateadas),
            'limite': limit
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en obtener_ordenes_finalizadas: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_orden(current_user, id_orden):
    """Obtener detalle completo de una orden"""
    try:
        logger.info(f"🔍 Usuario {current_user.get('id')} consultando detalle de orden {id_orden}")
        
        # Obtener datos de la orden
        orden_result = supabase.table('ordentrabajo') \
            .select('*') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        orden_data = orden_result.data[0]
        
        # Obtener datos del vehículo
        vehiculo_data = {}
        if orden_data.get('id_vehiculo'):
            vehiculo_result = supabase.table('vehiculo') \
                .select('*') \
                .eq('id', orden_data['id_vehiculo']) \
                .execute()
            if vehiculo_result.data:
                vehiculo_data = vehiculo_result.data[0]
        
        # Obtener nombre del cliente
        cliente_nombre = 'No registrado'
        if orden_data.get('id_cliente'):
            cliente_nombre = obtener_cliente_nombre(orden_data['id_cliente'])
        
        tecnicos_nombres = obtener_tecnicos_orden(id_orden)
        servicios = obtener_servicios_orden(id_orden)
        diagnostico_data = obtener_diagnostico_tecnico(id_orden)
        recepcion_data = obtener_recepcion(id_orden)
        historial = obtener_historial_orden(id_orden)
        
        detalle_completo = {
            'orden': {
                'id': orden_data.get('id'),
                'codigo_unico': orden_data.get('codigo_unico'),
                'estado_global': orden_data.get('estado_global'),
                'fecha_ingreso': orden_data.get('fecha_ingreso'),
                'fecha_salida': orden_data.get('fecha_salida'),
                'total_diagnostico': orden_data.get('total_diagnostico'),
                'dias_estimados_reparacion': orden_data.get('dias_estimados_reparacion'),
                'fecha_estimada_finalizacion': orden_data.get('fecha_estimada_finalizacion')
            },
            'cliente': {
                'nombre': cliente_nombre,
                'telefono': 'No registrado',
                'email': 'No registrado'
            } if cliente_nombre else None,
            'vehiculo': {
                'id': vehiculo_data.get('id'),
                'placa': vehiculo_data.get('placa'),
                'marca': vehiculo_data.get('marca'),
                'modelo': vehiculo_data.get('modelo'),
                'anio': vehiculo_data.get('anio'),
                'kilometraje': vehiculo_data.get('kilometraje')
            } if vehiculo_data else None,
            'tecnicos_nombres': tecnicos_nombres,
            'servicios': servicios,
            'diagnostico': diagnostico_data if diagnostico_data else None,
            'recepcion': recepcion_data,
            'historial': historial
        }
        
        return jsonify({
            'success': True,
            'detalle': detalle_completo
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en obtener_detalle_orden {id_orden}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/finalizar-orden/<int:id_orden>', methods=['PUT'])
@jefe_taller_required
def finalizar_orden(current_user, id_orden):
    """Aprobar y finalizar una orden"""
    try:
        data = request.get_json() or {}
        comentarios = data.get('comentarios', '')
        
        logger.info(f"✅ Usuario {current_user.get('id')} finalizando orden {id_orden}")
        
        # Verificar que la orden existe
        orden_result = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_result.data[0].get('estado_global')
        if estado_actual not in ['VehiculoArmado', 'ReparacionCompletada']:
            return jsonify({
                'success': False,
                'error': f'La orden está en estado "{estado_actual}" y no puede ser finalizada'
            }), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Actualizar la orden
        update_data = {
            'estado_global': 'Finalizado',
            'fecha_salida': ahora
        }
        
        if comentarios:
            update_data['instrucciones_tecnico'] = comentarios
        
        supabase.table('ordentrabajo') \
            .update(update_data) \
            .eq('id', id_orden) \
            .execute()
        
        # Registrar en seguimientoorden
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'Finalizado',
            'fecha_hora_cambio': ahora,
            'notificaciones_enviadas': 0
        }).execute()
        
        logger.info(f"✅ Orden {id_orden} finalizada exitosamente")
        
        return jsonify({
            'success': True,
            'message': 'Orden finalizada correctamente',
            'nuevo_estado': 'Finalizado'
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en finalizar_orden {id_orden}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/rechazar-orden/<int:id_orden>', methods=['PUT'])
@jefe_taller_required
def rechazar_orden(current_user, id_orden):
    """Rechazar orden y enviar a revisión"""
    try:
        data = request.get_json() or {}
        instrucciones = data.get('instrucciones', '')
        
        if not instrucciones or not instrucciones.strip():
            return jsonify({
                'success': False,
                'error': 'Debes proporcionar instrucciones para el técnico'
            }), 400
        
        logger.info(f"❌ Usuario {current_user.get('id')} rechazando orden {id_orden}")
        
        # Verificar que la orden existe
        orden_result = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_result.data[0].get('estado_global')
        if estado_actual not in ['VehiculoArmado', 'ReparacionCompletada']:
            return jsonify({
                'success': False,
                'error': f'La orden está en estado "{estado_actual}" y no puede ser rechazada'
            }), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Actualizar la orden
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'EnReparacion',
                'instrucciones_tecnico': instrucciones
            }) \
            .eq('id', id_orden) \
            .execute()
        
        # Registrar en seguimientoorden
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnReparacion',
            'motivo_pausa': instrucciones,
            'fecha_hora_cambio': ahora,
            'notificaciones_enviadas': 1
        }).execute()
        
        logger.info(f"❌ Orden {id_orden} enviada a revisión")
        
        return jsonify({
            'success': True,
            'message': 'Orden enviada a revisión correctamente',
            'nuevo_estado': 'EnReparacion',
            'instrucciones': instrucciones
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en rechazar_orden {id_orden}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/contadores', methods=['GET'])
@jefe_taller_required
def obtener_contadores(current_user):
    """Obtener contadores de órdenes"""
    try:
        pendientes_result = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .in_('estado_global', ['VehiculoArmado', 'ReparacionCompletada']) \
            .execute()
        
        finalizadas_result = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        return jsonify({
            'success': True,
            'pendientes': pendientes_result.count or 0,
            'finalizadas': finalizadas_result.count or 0
        }), 200
        
    except Exception as e:
        logger.error(f"Error en contadores: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500