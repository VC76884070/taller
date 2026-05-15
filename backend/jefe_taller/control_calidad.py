# =====================================================
# CONTROL_CALIDAD.PY - JEFE DE TALLER
# VERSIÓN CORREGIDA - USANDO 'id' COMO PRIMARY KEY
# =====================================================

from flask import Blueprint, request, jsonify, g
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
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico, usuario!inner(id, nombre)') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        nombres = []
        for asignacion in (asignaciones.data or []):
            usuario = asignacion.get('usuario', {})
            nombre = usuario.get('nombre') if isinstance(usuario, dict) else None
            if nombre:
                nombres.append(nombre)
        
        if not nombres:
            asignaciones_hist = supabase.table('asignaciontecnico') \
                .select('id_tecnico, usuario!inner(id, nombre)') \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
            
            for asignacion in (asignaciones_hist.data or []):
                usuario = asignacion.get('usuario', {})
                nombre = usuario.get('nombre') if isinstance(usuario, dict) else None
                if nombre and nombre not in nombres:
                    nombres.append(nombre)
        
        return ', '.join(nombres) if nombres else 'No asignado'
    
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

def obtener_servicios_orden(id_orden: int) -> List[Dict]:
    """Obtener servicios de una orden"""
    try:
        servicios = supabase.table('ordenservicio') \
            .select('''
                id_servicio,
                cantidad,
                precio_unitario,
                servicio!inner(descripcion)
            ''') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        return [{
            'descripcion': s.get('servicio', {}).get('descripcion', 'Servicio no especificado'),
            'cantidad': s.get('cantidad', 1),
            'precio': s.get('precio_unitario', 0) * s.get('cantidad', 1)
        } for s in (servicios.data or [])]
    
    except Exception as e:
        logger.error(f"Error obteniendo servicios: {e}")
        return []

def obtener_fotos_recepcion(id_orden: int) -> Dict[str, str]:
    """Obtener fotos de la recepción"""
    try:
        recepcion = supabase.table('recepcionvehiculo') \
            .select('fotos') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if recepcion.data and len(recepcion.data) > 0:
            fotos = recepcion.data[0].get('fotos', {})
            if isinstance(fotos, dict):
                return fotos
        return {}
    
    except Exception as e:
        logger.error(f"Error obteniendo fotos: {e}")
        return {}

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

@control_calidad_bp.route('/test-auth', methods=['GET'])
@jefe_taller_required
def test_auth_endpoint(current_user):
    """Endpoint de prueba CON autenticación"""
    return jsonify({
        'success': True,
        'message': 'Autenticación exitosa',
        'user': {
            'id': current_user.get('id'),
            'nombre': current_user.get('nombre'),
            'email': current_user.get('email')
        }
    }), 200

# =====================================================
# ENDPOINTS PRINCIPALES (CORREGIDOS CON 'id')
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
        
        # Consulta usando '*' para obtener todos los campos
        query = supabase.table('ordentrabajo') \
            .select('*') \
            .in_('estado_global', ['VehiculoArmado', 'ReparacionCompletada']) \
            .order('fecha_fin_armado', desc=True) \
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
                search in (o.get('cliente_nombre', '') or '').lower() or
                search in (o.get('vehiculo_placa', '') or '').lower()
            ]
        
        # Para cada orden, obtener datos relacionados
        ordenes_formateadas = []
        for orden in ordenes:
            # IMPORTANTE: La PK se llama 'id' no 'id_orden'
            orden_id = orden.get('id')
            if not orden_id:
                logger.warning(f"Orden sin id: {orden}")
                continue
                
            logger.info(f"Procesando orden ID: {orden_id} - {orden.get('codigo_unico')}")
            
            # Obtener datos del cliente
            cliente_nombre = 'Cliente no registrado'
            if orden.get('cliente_id'):
                try:
                    cliente_result = supabase.table('cliente') \
                        .select('nombre') \
                        .eq('id', orden['cliente_id']) \
                        .execute()
                    if cliente_result.data and len(cliente_result.data) > 0:
                        cliente_nombre = cliente_result.data[0].get('nombre', 'Cliente no registrado')
                except Exception as e:
                    logger.error(f"Error obteniendo cliente: {e}")
            
            # Obtener datos del vehículo
            vehiculo_texto = 'Vehículo no registrado'
            if orden.get('id_vehiculo'):
                try:
                    vehiculo_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo') \
                        .eq('id', orden['id_vehiculo']) \
                        .execute()
                    if vehiculo_result.data and len(vehiculo_result.data) > 0:
                        v = vehiculo_result.data[0]
                        vehiculo_texto = formatear_vehiculo(v)
                except Exception as e:
                    logger.error(f"Error obteniendo vehículo: {e}")
            
            # Obtener técnicos
            tecnicos_nombres = obtener_tecnicos_orden(orden_id)
            
            ordenes_formateadas.append({
                'id_orden': orden_id,  # Enviamos como id_orden para el frontend
                'codigo_unico': orden.get('codigo_unico', 'N/A'),
                'estado_global': orden.get('estado_global', 'Pendiente'),
                'vehiculo': vehiculo_texto,
                'cliente_nombre': cliente_nombre,
                'tecnicos_nombres': tecnicos_nombres,
                'fecha_inicio': orden.get('fecha_inicio_armado') or orden.get('fecha_ingreso'),
                'fecha_fin': orden.get('fecha_fin_armado') or orden.get('fecha_ingreso'),
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
        
        # Consulta usando '*' para obtener todos los campos
        query = supabase.table('ordentrabajo') \
            .select('*') \
            .in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_salida', desc=True) \
            .limit(limit)
        
        if estado != 'all':
            query = query.eq('estado_global', estado)
        
        result = query.execute()
        ordenes = result.data or []
        
        logger.info(f"📊 Se encontraron {len(ordenes)} órdenes finalizadas")
        
        # Filtrar por búsqueda si es necesario
        if search:
            ordenes = [o for o in ordenes if 
                search in (o.get('codigo_unico', '') or '').lower() or
                search in (o.get('cliente_nombre', '') or '').lower() or
                search in (o.get('vehiculo_placa', '') or '').lower()
            ]
        
        # Para cada orden, obtener datos relacionados
        ordenes_formateadas = []
        for orden in ordenes:
            # IMPORTANTE: La PK se llama 'id' no 'id_orden'
            orden_id = orden.get('id')
            if not orden_id:
                logger.warning(f"Orden sin id: {orden}")
                continue
                
            logger.info(f"Procesando orden ID: {orden_id} - {orden.get('codigo_unico')}")
            
            # Obtener datos del cliente
            cliente_nombre = 'Cliente no registrado'
            if orden.get('cliente_id'):
                try:
                    cliente_result = supabase.table('cliente') \
                        .select('nombre') \
                        .eq('id', orden['cliente_id']) \
                        .execute()
                    if cliente_result.data and len(cliente_result.data) > 0:
                        cliente_nombre = cliente_result.data[0].get('nombre', 'Cliente no registrado')
                except Exception as e:
                    logger.error(f"Error obteniendo cliente: {e}")
            
            # Obtener datos del vehículo
            vehiculo_texto = 'Vehículo no registrado'
            if orden.get('id_vehiculo'):
                try:
                    vehiculo_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo') \
                        .eq('id', orden['id_vehiculo']) \
                        .execute()
                    if vehiculo_result.data and len(vehiculo_result.data) > 0:
                        v = vehiculo_result.data[0]
                        vehiculo_texto = formatear_vehiculo(v)
                except Exception as e:
                    logger.error(f"Error obteniendo vehículo: {e}")
            
            # Obtener técnicos
            tecnicos_nombres = obtener_tecnicos_orden(orden_id)
            
            ordenes_formateadas.append({
                'id_orden': orden_id,  # Enviamos como id_orden para el frontend
                'codigo_unico': orden.get('codigo_unico', 'N/A'),
                'estado_global': orden.get('estado_global', 'Finalizado'),
                'vehiculo': vehiculo_texto,
                'cliente_nombre': cliente_nombre,
                'tecnicos_nombres': tecnicos_nombres,
                'fecha_finalizacion': orden.get('fecha_salida') or orden.get('fecha_fin_armado') or orden.get('fecha_ingreso'),
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
        
        # Obtener datos de la orden - Usando 'id' como PK
        orden_result = supabase.table('ordentrabajo') \
            .select('*') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data or len(orden_result.data) == 0:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        orden_data = orden_result.data[0]
        
        # Obtener datos del cliente
        cliente_data = {}
        if orden_data.get('cliente_id'):
            cliente_result = supabase.table('cliente') \
                .select('id, nombre, telefono, email') \
                .eq('id', orden_data['cliente_id']) \
                .execute()
            if cliente_result.data and len(cliente_result.data) > 0:
                cliente_data = cliente_result.data[0]
        
        # Obtener datos del vehículo
        vehiculo_data = {}
        if orden_data.get('id_vehiculo'):
            vehiculo_result = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio, kilometraje') \
                .eq('id', orden_data['id_vehiculo']) \
                .execute()
            if vehiculo_result.data and len(vehiculo_result.data) > 0:
                vehiculo_data = vehiculo_result.data[0]
        
        tecnicos_nombres = obtener_tecnicos_orden(id_orden)
        servicios = obtener_servicios_orden(id_orden)
        
        # Obtener diagnóstico
        diagnostico_result = supabase.table('diagnostico') \
            .select('informe, audio_url, fecha_diagnostico') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        diagnostico_data = diagnostico_result.data[0] if diagnostico_result.data else None
        
        # Obtener recepción y fotos
        recepcion_result = supabase.table('recepcionvehiculo') \
            .select('transcripcion_problema, audio_url, fotos') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion_result.data[0] if recepcion_result.data else {}
        fotos = recepcion_data.get('fotos', {})
        fotos_validas = {k: v for k, v in fotos.items() if v and v != ''}
        
        # Obtener historial de cambios de estado
        historial_result = supabase.table('historialorden') \
            .select('estado_anterior, estado_nuevo, fecha_cambio, comentarios') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_cambio', desc=True) \
            .limit(10) \
            .execute()
        
        historial = historial_result.data or []
        
        detalle_completo = {
            'orden': {
                'id': orden_data.get('id'),
                'codigo_unico': orden_data.get('codigo_unico'),
                'estado_global': orden_data.get('estado_global'),
                'fecha_ingreso': orden_data.get('fecha_ingreso'),
                'fecha_salida': orden_data.get('fecha_salida'),
                'fecha_inicio_armado': orden_data.get('fecha_inicio_armado'),
                'fecha_fin_armado': orden_data.get('fecha_fin_armado'),
                'instrucciones_tecnico': orden_data.get('instrucciones_tecnico'),
                'total_diagnostico': orden_data.get('total_diagnostico')
            },
            'cliente': {
                'id': cliente_data.get('id'),
                'nombre': cliente_data.get('nombre'),
                'telefono': cliente_data.get('telefono'),
                'email': cliente_data.get('email')
            } if cliente_data else None,
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
            'diagnostico': {
                'informe': diagnostico_data.get('informe') if diagnostico_data else None,
                'audio_url': diagnostico_data.get('audio_url') if diagnostico_data else None,
                'fecha_diagnostico': diagnostico_data.get('fecha_diagnostico') if diagnostico_data else None
            } if diagnostico_data else None,
            'recepcion': {
                'transcripcion_problema': recepcion_data.get('transcripcion_problema'),
                'audio_url': recepcion_data.get('audio_url'),
                'fotos': fotos_validas
            },
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
        
        # Verificar que la orden existe - Usando 'id' como PK
        orden_result = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data or len(orden_result.data) == 0:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_result.data[0].get('estado_global')
        if estado_actual not in ['VehiculoArmado', 'ReparacionCompletada']:
            return jsonify({
                'success': False,
                'error': f'La orden está en estado "{estado_actual}" y no puede ser finalizada'
            }), 400
        
        # Actualizar la orden
        update_data = {
            'estado_global': 'Finalizado',
            'fecha_salida': datetime.datetime.now().isoformat()
        }
        
        if comentarios:
            update_data['instrucciones_tecnico'] = comentarios
        
        supabase.table('ordentrabajo') \
            .update(update_data) \
            .eq('id', id_orden) \
            .execute()
        
        # Registrar en historial
        supabase.table('historialorden').insert({
            'id_orden_trabajo': id_orden,
            'estado_anterior': estado_actual,
            'estado_nuevo': 'Finalizado',
            'comentarios': f'Aprobado por control de calidad. {comentarios}' if comentarios else 'Aprobado por control de calidad'
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
        
        # Verificar que la orden existe - Usando 'id' como PK
        orden_result = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data or len(orden_result.data) == 0:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_result.data[0].get('estado_global')
        if estado_actual not in ['VehiculoArmado', 'ReparacionCompletada']:
            return jsonify({
                'success': False,
                'error': f'La orden está en estado "{estado_actual}" y no puede ser rechazada'
            }), 400
        
        # Actualizar la orden
        update_data = {
            'estado_global': 'EnReparacion',
            'instrucciones_tecnico': instrucciones
        }
        
        supabase.table('ordentrabajo') \
            .update(update_data) \
            .eq('id', id_orden) \
            .execute()
        
        # Registrar en historial
        supabase.table('historialorden').insert({
            'id_orden_trabajo': id_orden,
            'estado_anterior': estado_actual,
            'estado_nuevo': 'EnReparacion',
            'comentarios': f'Rechazado por control de calidad. Instrucciones: {instrucciones}'
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