# =====================================================
# CONTROL_CALIDAD.PY - JEFE OPERATIVO
# VERSIÓN COMPLETA CON FUNCIONALIDAD DE ENTREGA Y LIBERACIÓN DE BAHÍAS
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_operativo_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

# Crear blueprint
control_calidad_operativo_bp = Blueprint('control_calidad_operativo', __name__, url_prefix='/api/jefe-operativo/control-calidad')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_tecnicos_orden(id_orden):
    """Obtener nombres de técnicos asignados a una orden"""
    try:
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico, usuario!inner(id, nombre)') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        nombres = []
        for a in (asignaciones.data or []):
            usuario = a.get('usuario', {})
            nombre = usuario.get('nombre') if isinstance(usuario, dict) else None
            if nombre:
                nombres.append(nombre)
        
        return ', '.join(nombres) if nombres else 'No asignado'
    except Exception as e:
        logger.error(f"Error obteniendo técnicos: {e}")
        return 'No asignado'


def enviar_notificacion(id_usuario_destino, tipo, mensaje, id_referencia=None):
    """Enviar notificación a un usuario"""
    try:
        supabase.table('notificacion').insert({
            'id_usuario_destino': id_usuario_destino,
            'tipo': tipo,
            'mensaje': mensaje,
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False,
            'id_referencia': id_referencia
        }).execute()
    except Exception as e:
        logger.warning(f"Error enviando notificación: {e}")


def liberar_bahia(id_orden):
    """Liberar la bahía asignada a una orden actualizando fecha_hora_fin_real"""
    try:
        # Buscar planificación activa de esta orden (sin fecha fin real)
        planificacion = supabase.table('planificacion') \
            .select('id, bahia_asignada') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        if planificacion.data:
            ahora = datetime.datetime.now().isoformat()
            bahia_id = None
            
            for p in planificacion.data:
                bahia_id = p.get('bahia_asignada')
                supabase.table('planificacion') \
                    .update({'fecha_hora_fin_real': ahora}) \
                    .eq('id', p['id']) \
                    .execute()
            
            if bahia_id:
                logger.info(f"✅ Bahía {bahia_id} liberada para orden {id_orden}")
            return True
        else:
            logger.info(f"📋 No hay planificación activa para orden {id_orden}")
            return False
            
    except Exception as e:
        logger.warning(f"Error liberando bahía: {e}")
        return False


# =====================================================
# ENDPOINTS DE PRUEBA
# =====================================================

@control_calidad_operativo_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba para verificar que el blueprint funciona"""
    return jsonify({
        'success': True, 
        'message': 'Control de Calidad (Jefe Operativo) funcionando correctamente'
    }), 200


@control_calidad_operativo_bp.route('/test-auth', methods=['GET'])
@jefe_operativo_required
def test_auth_endpoint(current_user):
    """Endpoint de prueba CON autenticación"""
    return jsonify({
        'success': True, 
        'message': 'Autenticación exitosa (Jefe Operativo)',
        'user': {
            'id': current_user.get('id'),
            'nombre': current_user.get('nombre')
        }
    }), 200


# =====================================================
# ENDPOINTS PRINCIPALES
# =====================================================

@control_calidad_operativo_bp.route('/ordenes-pendientes', methods=['GET'])
@jefe_operativo_required
def obtener_ordenes_pendientes(current_user):
    """Obtener órdenes pendientes de revisión (VehiculoArmado, ReparacionCompletada)"""
    try:
        estado_filtro = request.args.get('estado', 'all')
        estados_pendientes = ['VehiculoArmado', 'ReparacionCompletada']
        
        query = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                estado_global,
                fecha_ingreso,
                id_vehiculo,
                vehiculo!inner(
                    marca,
                    modelo,
                    placa,
                    cliente!inner(
                        usuario!inner(
                            id,
                            nombre,
                            contacto
                        )
                    )
                )
            ''') \
            .in_('estado_global', estados_pendientes) \
            .order('fecha_ingreso', desc=True)
        
        if estado_filtro != 'all' and estado_filtro in estados_pendientes:
            query = query.eq('estado_global', estado_filtro)
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes = []
        for orden in result.data:
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario = cliente.get('usuario', {}) if cliente else {}
            
            tecnicos_nombres = obtener_tecnicos_orden(orden['id'])
            
            # Obtener fecha de finalización
            ultima_asignacion = supabase.table('asignaciontecnico') \
                .select('fecha_hora_final') \
                .eq('id_orden_trabajo', orden['id']) \
                .not_.is_('fecha_hora_final', 'null') \
                .order('fecha_hora_final', desc=True) \
                .limit(1) \
                .execute()
            
            fecha_fin = None
            if ultima_asignacion.data:
                fecha_fin = ultima_asignacion.data[0].get('fecha_hora_final')
            
            # Obtener fecha de inicio
            inicio_reparacion = supabase.table('asignaciontecnico') \
                .select('fecha_hora_inicio') \
                .eq('id_orden_trabajo', orden['id']) \
                .eq('tipo_asignacion', 'reparacion') \
                .not_.is_('fecha_hora_final', 'null') \
                .order('fecha_hora_inicio', desc=False) \
                .limit(1) \
                .execute()
            
            fecha_inicio = None
            if inicio_reparacion.data:
                fecha_inicio = inicio_reparacion.data[0].get('fecha_hora_inicio')
            
            ordenes.append({
                'id_orden': orden['id'],
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'cliente_nombre': usuario.get('nombre', 'No registrado'),
                'tecnicos_nombres': tecnicos_nombres,
                'fecha_inicio': fecha_inicio,
                'fecha_fin': fecha_fin
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error en ordenes-pendientes: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@control_calidad_operativo_bp.route('/ordenes-finalizadas', methods=['GET'])
@jefe_operativo_required
def obtener_ordenes_finalizadas(current_user):
    """Obtener órdenes finalizadas (Finalizado, Entregado)"""
    try:
        estado_filtro = request.args.get('estado', 'all')
        estados_finalizados = ['Finalizado', 'Entregado']
        
        query = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                estado_global,
                fecha_ingreso,
                id_vehiculo,
                vehiculo!inner(
                    marca,
                    modelo,
                    placa,
                    cliente!inner(
                        usuario!inner(
                            id,
                            nombre,
                            contacto
                        )
                    )
                )
            ''') \
            .in_('estado_global', estados_finalizados) \
            .order('fecha_ingreso', desc=True)
        
        if estado_filtro != 'all' and estado_filtro in estados_finalizados:
            query = query.eq('estado_global', estado_filtro)
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes = []
        for orden in result.data:
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario = cliente.get('usuario', {}) if cliente else {}
            
            tecnicos_nombres = obtener_tecnicos_orden(orden['id'])
            
            # Obtener fecha de finalización
            fecha_finalizacion = orden.get('fecha_ingreso')
            avance = supabase.table('avancetrabajo') \
                .select('fecha_hora') \
                .eq('id_orden_trabajo', orden['id']) \
                .eq('tipo_avance', 'control_calidad_aprobado') \
                .order('fecha_hora', desc=True) \
                .limit(1) \
                .execute()
            
            if avance.data:
                fecha_finalizacion = avance.data[0].get('fecha_hora')
            
            # Obtener comentarios
            comentarios = None
            avances = supabase.table('avancetrabajo') \
                .select('descripcion') \
                .eq('id_orden_trabajo', orden['id']) \
                .eq('tipo_avance', 'control_calidad_aprobado') \
                .order('fecha_hora', desc=True) \
                .limit(1) \
                .execute()
            
            if avances.data:
                comentarios = avances.data[0].get('descripcion')
            
            ordenes.append({
                'id_orden': orden['id'],
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'cliente_nombre': usuario.get('nombre', 'No registrado'),
                'tecnicos_nombres': tecnicos_nombres,
                'fecha_finalizacion': fecha_finalizacion,
                'comentarios_aprobacion': comentarios
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error en ordenes-finalizadas: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@control_calidad_operativo_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def obtener_detalle_orden(current_user, id_orden):
    """Obtener detalle completo de una orden para revisión"""
    try:
        # Obtener orden
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data[0]
        
        # Obtener vehículo
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', orden_data.get('id_vehiculo')) \
            .execute()
        
        vehiculo_data = vehiculo.data[0] if vehiculo.data else {}
        
        # Obtener cliente
        cliente_info = {'nombre': 'No registrado', 'telefono': 'No registrado', 'email': 'No registrado'}
        if vehiculo_data.get('id_cliente'):
            cliente = supabase.table('cliente') \
                .select('id, id_usuario, email') \
                .eq('id', vehiculo_data['id_cliente']) \
                .execute()
            
            if cliente.data:
                cliente_data = cliente.data[0]
                cliente_info['email'] = cliente_data.get('email', 'No registrado')
                
                if cliente_data.get('id_usuario'):
                    usuario = supabase.table('usuario') \
                        .select('nombre, contacto') \
                        .eq('id', cliente_data['id_usuario']) \
                        .execute()
                    
                    if usuario.data:
                        cliente_info['nombre'] = usuario.data[0].get('nombre', 'No registrado')
                        cliente_info['telefono'] = usuario.data[0].get('contacto', 'No registrado')
        
        tecnicos_nombres = obtener_tecnicos_orden(id_orden)
        
        # Obtener recepción
        recepcion = supabase.table('recepcion') \
            .select('url_lateral_izquierda, url_lateral_derecha, url_foto_frontal, url_foto_trasera, url_foto_superior, url_foto_inferior, url_foto_tablero, url_grabacion_problema, transcripcion_problema') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        fotos = {}
        if recepcion_data:
            fotos = {
                'lateral_izquierdo': recepcion_data.get('url_lateral_izquierda'),
                'lateral_derecho': recepcion_data.get('url_lateral_derecha'),
                'frontal': recepcion_data.get('url_foto_frontal'),
                'trasera': recepcion_data.get('url_foto_trasera'),
                'superior': recepcion_data.get('url_foto_superior'),
                'inferior': recepcion_data.get('url_foto_inferior'),
                'tablero': recepcion_data.get('url_foto_tablero')
            }
        
        # Obtener servicios realizados
        servicios = []
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('id, informe') \
            .eq('id_orden_trabajo', id_orden) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnosticos.data:
            servicios_tecnicos = supabase.table('servicio_tecnico') \
                .select('id, descripcion') \
                .eq('id_diagnostico_tecnico', diagnosticos.data[0]['id']) \
                .execute()
            
            for serv in (servicios_tecnicos.data or []):
                cotizacion_servicio = supabase.table('cotizacion_servicio') \
                    .select('precio_final') \
                    .eq('id_servicio', serv['id']) \
                    .order('id', desc=True) \
                    .limit(1) \
                    .execute()
                
                precio = None
                if cotizacion_servicio.data:
                    precio = cotizacion_servicio.data[0].get('precio_final')
                
                servicios.append({
                    'id': serv['id'],
                    'descripcion': serv.get('descripcion'),
                    'precio': float(precio) if precio else None
                })
        
        return jsonify({
            'success': True,
            'detalle': {
                'orden': {
                    'id': orden_data['id'],
                    'codigo_unico': orden_data.get('codigo_unico'),
                    'estado_global': orden_data.get('estado_global'),
                    'fecha_ingreso': orden_data.get('fecha_ingreso')
                },
                'vehiculo': {
                    'placa': vehiculo_data.get('placa', ''),
                    'marca': vehiculo_data.get('marca', ''),
                    'modelo': vehiculo_data.get('modelo', ''),
                    'anio': vehiculo_data.get('anio'),
                    'kilometraje': vehiculo_data.get('kilometraje', 0)
                },
                'cliente': cliente_info,
                'tecnicos_nombres': tecnicos_nombres,
                'recepcion': {
                    'transcripcion_problema': recepcion_data.get('transcripcion_problema', 'No hay descripción'),
                    'audio_url': recepcion_data.get('url_grabacion_problema'),
                    'fotos': fotos
                },
                'servicios': servicios
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error en detalle-orden: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@control_calidad_operativo_bp.route('/finalizar-orden/<int:id_orden>', methods=['PUT'])
@jefe_operativo_required
def finalizar_orden(current_user, id_orden):
    """Aprobar y finalizar una orden (cambiar a Finalizado)"""
    try:
        data = request.get_json() or {}
        comentarios = data.get('comentarios', '')
        
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden.data[0]['estado_global']
        codigo_orden = orden.data[0].get('codigo_unico', str(id_orden))
        
        if estado_actual not in ['VehiculoArmado', 'ReparacionCompletada']:
            return jsonify({'success': False, 'error': f'La orden no puede ser finalizada. Estado actual: {estado_actual}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Cambiar estado a Finalizado
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'Finalizado'}) \
            .eq('id', id_orden) \
            .execute()
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': current_user['id'],
            'descripcion': f"Orden finalizada por Control de Calidad. {comentarios}" if comentarios else "Orden finalizada por Control de Calidad",
            'tipo_avance': 'control_calidad_aprobado',
            'fecha_hora': ahora
        }).execute()
        
        # Notificar a técnicos
        tecnicos = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        for t in (tecnicos.data or []):
            enviar_notificacion(
                t['id_tecnico'],
                'trabajo_aprobado',
                f"✅ Tu trabajo en la orden #{codigo_orden} ha sido APROBADO por Control de Calidad. El vehículo está listo para entrega.",
                id_orden
            )
        
        return jsonify({
            'success': True,
            'message': 'Orden finalizada correctamente',
            'nuevo_estado': 'Finalizado'
        }), 200
        
    except Exception as e:
        logger.error(f"Error en finalizar-orden: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@control_calidad_operativo_bp.route('/rechazar-orden/<int:id_orden>', methods=['PUT'])
@jefe_operativo_required
def rechazar_orden(current_user, id_orden):
    """Rechazar orden y enviar a revisión (volver a EnReparacion)"""
    try:
        data = request.get_json() or {}
        instrucciones = data.get('instrucciones', '')
        
        if not instrucciones:
            return jsonify({'success': False, 'error': 'Debes proporcionar instrucciones para el técnico'}), 400
        
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden.data[0]['estado_global']
        codigo_orden = orden.data[0].get('codigo_unico', str(id_orden))
        
        if estado_actual not in ['VehiculoArmado', 'ReparacionCompletada']:
            return jsonify({'success': False, 'error': f'La orden no puede ser rechazada. Estado actual: {estado_actual}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Cambiar estado a EnReparacion
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnReparacion'}) \
            .eq('id', id_orden) \
            .execute()
        
        # Cerrar asignaciones activas y crear nuevas
        tecnicos = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for t in (tecnicos.data or []):
            # Cerrar asignación actual
            supabase.table('asignaciontecnico') \
                .update({'fecha_hora_final': ahora}) \
                .eq('id_orden_trabajo', id_orden) \
                .eq('id_tecnico', t['id_tecnico']) \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            # Crear nueva asignación para correcciones
            supabase.table('asignaciontecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': t['id_tecnico'],
                'tipo_asignacion': 'reparacion',
                'fecha_hora_inicio': ahora
            }).execute()
            
            # Notificar al técnico
            enviar_notificacion(
                t['id_tecnico'],
                'trabajo_rechazado',
                f"⚠️ Tu trabajo en la orden #{codigo_orden} necesita CORRECCIONES.\n\nInstrucciones del Jefe Operativo:\n{instrucciones}\n\nPor favor, realiza las correcciones indicadas.",
                id_orden
            )
        
        # Guardar instrucciones en historial
        supabase.table('instrucciones_tecnico_historial').insert({
            'id_orden_trabajo': id_orden,
            'id_jefe_taller': current_user['id'],
            'instrucciones': f"[REVISIÓN NECESARIA - JEFE OPERATIVO]\n\n{instrucciones}",
            'fecha_envio': ahora,
            'leida': False
        }).execute()
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': current_user['id'],
            'descripcion': f"Orden enviada a revisión por Control de Calidad. Motivo: {instrucciones[:200]}",
            'tipo_avance': 'control_calidad_rechazado',
            'fecha_hora': ahora
        }).execute()
        
        return jsonify({
            'success': True,
            'message': 'Orden enviada a revisión. El técnico ha sido notificado.',
            'nuevo_estado': 'EnReparacion'
        }), 200
        
    except Exception as e:
        logger.error(f"Error en rechazar-orden: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENTREGAR VEHÍCULO (CON LIBERACIÓN DE BAHÍA)
# =====================================================

@control_calidad_operativo_bp.route('/entregar-orden/<int:id_orden>', methods=['PUT'])
@jefe_operativo_required
def entregar_orden(current_user, id_orden):
    """Marcar orden como Entregada (liberar bahía y técnicos)"""
    try:
        data = request.get_json() or {}
        comentarios = data.get('comentarios', '')
        
        # Verificar orden
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden.data[0]['estado_global']
        codigo_orden = orden.data[0].get('codigo_unico', str(id_orden))
        
        # Solo se puede entregar si está en Finalizado
        if estado_actual != 'Finalizado':
            return jsonify({'success': False, 'error': f'La orden debe estar en estado Finalizado para entregar. Estado actual: {estado_actual}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # 1. Cambiar estado a Entregado y registrar fecha de salida
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'Entregado',
                'fecha_salida': ahora
            }) \
            .eq('id', id_orden) \
            .execute()
        
        # 2. Cerrar todas las asignaciones de técnicos activas
        asignaciones_activas = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for asignacion in (asignaciones_activas.data or []):
            supabase.table('asignaciontecnico') \
                .update({'fecha_hora_final': ahora}) \
                .eq('id_orden_trabajo', id_orden) \
                .eq('id_tecnico', asignacion['id_tecnico']) \
                .is_('fecha_hora_final', 'null') \
                .execute()
        
        # 3. LIBERAR LA BAHÍA - Actualizar planificación con fecha fin real
        planificacion = supabase.table('planificacion') \
            .select('id, bahia_asignada') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        if planificacion.data:
            for p in planificacion.data:
                supabase.table('planificacion') \
                    .update({
                        'fecha_hora_fin_real': ahora
                    }) \
                    .eq('id', p['id']) \
                    .execute()
                logger.info(f"✅ Bahía {p.get('bahia_asignada')} liberada para orden {codigo_orden}")
        else:
            logger.info(f"📋 No hay planificación activa para orden {id_orden}")
        
        # 4. Registrar avance de entrega
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': current_user['id'],
            'descripcion': f"✅ VEHÍCULO ENTREGADO AL CLIENTE. {comentarios}" if comentarios else "✅ VEHÍCULO ENTREGADO AL CLIENTE",
            'tipo_avance': 'vehiculo_entregado',
            'fecha_hora': ahora
        }).execute()
        
        # 5. Notificar a los técnicos
        tecnicos = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        tecnicos_ids = set()
        for t in (tecnicos.data or []):
            tecnicos_ids.add(t['id_tecnico'])
        
        for id_tecnico in tecnicos_ids:
            enviar_notificacion(
                id_tecnico,
                'vehiculo_entregado',
                f"🚗 El vehículo de la orden #{codigo_orden} ha sido ENTREGADO al cliente. ¡Trabajo completado!",
                id_orden
            )
        
        logger.info(f"✅ Orden {codigo_orden} marcada como ENTREGADA por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True,
            'message': 'Orden marcada como Entregada correctamente',
            'nuevo_estado': 'Entregado'
        }), 200
        
    except Exception as e:
        logger.error(f"Error en entregar-orden: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINTS PARA BAHÍAS (GRÁFICOS)
# =====================================================

@control_calidad_operativo_bp.route('/bahias', methods=['GET'])
@jefe_operativo_required
def obtener_estado_bahias(current_user):
    """Obtener estado actual de todas las bahías (1-10)"""
    try:
        # Obtener todas las planificaciones activas (sin fecha fin real)
        planificaciones_activas = supabase.table('planificacion') \
            .select('id, bahia_asignada, id_orden_trabajo, fecha_hora_inicio_real, fecha_hora_inicio_estimado, ordentrabajo!inner(codigo_unico, estado_global)') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        # Crear mapa de bahías ocupadas
        bahias_ocupadas = {}
        for p in (planificaciones_activas.data or []):
            bahia_id = p.get('bahia_asignada')
            if bahia_id:
                orden = p.get('ordentrabajo', {})
                bahias_ocupadas[bahia_id] = {
                    'orden_id': p['id_orden_trabajo'],
                    'codigo_orden': orden.get('codigo_unico', 'N/A'),
                    'estado_orden': orden.get('estado_global', 'N/A'),
                    'inicio_real': p.get('fecha_hora_inicio_real'),
                    'inicio_estimado': p.get('fecha_hora_inicio_estimado')
                }
        
        # Generar lista de bahías (1 a 10)
        bahias = []
        for i in range(1, 11):
            ocupada = i in bahias_ocupadas
            bahias.append({
                'numero': i,
                'nombre': f'Bahía {i}',
                'estado': 'ocupada' if ocupada else 'libre',
                'ocupada': ocupada,
                'orden_actual': bahias_ocupadas.get(i) if ocupada else None
            })
        
        return jsonify({
            'success': True,
            'bahias': bahias,
            'total_bahias': len(bahias),
            'bahias_ocupadas': sum(1 for b in bahias if b['ocupada']),
            'bahias_libres': sum(1 for b in bahias if not b['ocupada'])
        }), 200
        
    except Exception as e:
        logger.error(f"Error en obtener estado bahías: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@control_calidad_operativo_bp.route('/historial-bahias/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def historial_bahias_orden(current_user, id_orden):
    """Ver historial de bahías asignadas a una orden"""
    try:
        historial = supabase.table('planificacion') \
            .select('id, bahia_asignada, fecha_hora_inicio_real, fecha_hora_fin_real, fecha_hora_inicio_estimado, fecha_hora_fin_estimado') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_hora_inicio_real', desc=True) \
            .execute()
        
        return jsonify({
            'success': True,
            'historial': historial.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error en historial bahías: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500