from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
import uuid
import os
import base64  # <-- AGREGAR ESTA LÍNEA
import tempfile  # <-- AGREGAR ESTA LÍNEA también
import io
import cloudinary
import cloudinary.uploader
import cloudinary.api

# Configurar logging
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_taller_ordenes_bp = Blueprint('jefe_taller_ordenes', __name__, url_prefix='/api/jefe-taller')

# Configuración desde config.py
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL
# =====================================================
def jefe_taller_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            
            if current_user.get('rol') != 'jefe_taller' and current_user.get('id_rol') != 3:
                logger.warning(f"Usuario {current_user.get('nombre')} intentó acceder sin permisos")
                return jsonify({'error': 'No autorizado para esta operación'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

# =====================================================
# ENDPOINTS
# =====================================================

@jefe_taller_ordenes_bp.route('/tecnicos', methods=['GET'])
@jefe_taller_required
def listar_tecnicos(current_user):
    """Listar técnicos disponibles para asignación"""
    try:
        resultado = supabase.table('usuario') \
            .select('id, nombre, contacto') \
            .eq('id_rol', 4) \
            .execute()
        
        tecnicos = []
        for tecnico in (resultado.data or []):
            # Contar órdenes activas del técnico
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo') \
                .eq('id_tecnico', tecnico['id']) \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            ordenes_activas = len(asignaciones.data) if asignaciones.data else 0
            
            tecnicos.append({
                'id': tecnico['id'],
                'nombre': tecnico['nombre'],
                'contacto': tecnico.get('contacto', ''),
                'ordenes_activas': ordenes_activas,
                'max_vehiculos': 2
            })
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error listando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/ordenes-activas', methods=['GET'])
@jefe_taller_required
def listar_ordenes_activas(current_user):
    """Listar órdenes de trabajo activas con datos de planificación"""
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('''
                id, 
                codigo_unico, 
                fecha_ingreso, 
                estado_global, 
                id_vehiculo,
                id_jefe_operativo,
                id_jefe_operativo_2
            ''') \
            .in_('estado_global', ['EnRecepcion', 'EnProceso', 'EnPausa']) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        ordenes = []
        for orden in (resultado.data or []):
            # Obtener vehículo
            vehiculo = supabase.table('vehiculo') \
                .select('*') \
                .eq('id', orden['id_vehiculo']) \
                .execute()
            
            v = vehiculo.data[0] if vehiculo.data else {}
            
            # Obtener cliente
            cliente_info = {}
            usuario_cliente = {}
            
            if v.get('id_cliente'):
                cliente = supabase.table('cliente') \
                    .select('*') \
                    .eq('id', v['id_cliente']) \
                    .execute()
                
                if cliente.data:
                    cliente_info = cliente.data[0]
                    
                    if cliente_info.get('id_usuario'):
                        usuario = supabase.table('usuario') \
                            .select('id, nombre, contacto, ubicacion') \
                            .eq('id', cliente_info['id_usuario']) \
                            .execute()
                        
                        if usuario.data:
                            usuario_cliente = usuario.data[0]
            
            # Obtener jefes operativos
            jefe_principal = {}
            if orden.get('id_jefe_operativo'):
                jefe1 = supabase.table('usuario') \
                    .select('id, nombre, contacto') \
                    .eq('id', orden['id_jefe_operativo']) \
                    .execute()
                if jefe1.data:
                    jefe_principal = jefe1.data[0]
            
            jefe_secundario = {}
            if orden.get('id_jefe_operativo_2'):
                jefe2 = supabase.table('usuario') \
                    .select('id, nombre, contacto') \
                    .eq('id', orden['id_jefe_operativo_2']) \
                    .execute()
                if jefe2.data:
                    jefe_secundario = jefe2.data[0]
            
            # Obtener recepción
            recepcion = supabase.table('recepcion') \
                .select('*') \
                .eq('id_orden_trabajo', orden['id']) \
                .execute()
            
            recepcion_data = recepcion.data[0] if recepcion.data else {}
            
            # Obtener técnicos
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_tecnico') \
                .eq('id_orden_trabajo', orden['id']) \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            tecnicos = []
            for asig in (asignaciones.data or []):
                tecnico = supabase.table('usuario') \
                    .select('id, nombre') \
                    .eq('id', asig['id_tecnico']) \
                    .execute()
                if tecnico.data:
                    tecnicos.append(tecnico.data[0])
            
            # Obtener diagnóstico inicial
            diagnostico = supabase.table('diagnostigoinicial') \
                .select('diagnostigo') \
                .eq('id_orden_trabajo', orden['id']) \
                .execute()
            
            # Obtener planificación
            planificacion = supabase.table('planificacion') \
                .select('bahia_asignada, fecha_hora_inicio_estimado, horas_estimadas') \
                .eq('id_orden_trabajo', orden['id']) \
                .execute()
            
            planificacion_data = planificacion.data[0] if planificacion.data else {}
            
            ordenes.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'placa': v.get('placa', ''),
                'marca': v.get('marca', ''),
                'modelo': v.get('modelo', ''),
                'cliente_nombre': usuario_cliente.get('nombre', 'No registrado'),
                'cliente_telefono': usuario_cliente.get('contacto', 'No registrado'),
                'cliente_ubicacion': usuario_cliente.get('ubicacion', 'No registrada'),
                'jefe_operativo_nombre': jefe_principal.get('nombre', ''),
                'jefe_operativo_2_nombre': jefe_secundario.get('nombre', ''),
                'tecnicos': tecnicos,
                'diagnostico_inicial': diagnostico.data[0]['diagnostigo'] if diagnostico.data else None,
                # Datos de planificación
                'planificacion': planificacion_data.get('id') is not None,
                'bahia_asignada': planificacion_data.get('bahia_asignada'),
                'fecha_hora_inicio_estimado': planificacion_data.get('fecha_hora_inicio_estimado'),
                'horas_estimadas': planificacion_data.get('horas_estimadas'),
                # Datos de recepción
                'transcripcion_problema': recepcion_data.get('transcripcion_problema', ''),
                'audio_url': recepcion_data.get('url_grabacion_problema'),
                'fotos': {
                    'url_lateral_izquierda': recepcion_data.get('url_lateral_izquierda'),
                    'url_lateral_derecha': recepcion_data.get('url_lateral_derecha'),
                    'url_foto_frontal': recepcion_data.get('url_foto_frontal'),
                    'url_foto_trasera': recepcion_data.get('url_foto_trasera'),
                    'url_foto_superior': recepcion_data.get('url_foto_superior'),
                    'url_foto_inferior': recepcion_data.get('url_foto_inferior'),
                    'url_foto_tablero': recepcion_data.get('url_foto_tablero')
                }
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error listando órdenes activas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/ordenes-finalizadas', methods=['GET'])
@jefe_taller_required
def listar_ordenes_finalizadas(current_user):
    """Listar órdenes finalizadas o entregadas"""
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo, vehiculo!inner(placa, marca, modelo, id_cliente, cliente!inner(id_usuario, usuario!inner(nombre, contacto)))') \
            .in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_ingreso', desc=True) \
            .limit(50) \
            .execute()
        
        ordenes = []
        for orden in (resultado.data or []):
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {}) if vehiculo else {}
            usuario = cliente.get('usuario', {}) if cliente else {}
            
            ordenes.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_entrega': orden.get('fecha_salida'),
                'estado_global': orden['estado_global'],
                'placa': vehiculo.get('placa', ''),
                'marca': vehiculo.get('marca', ''),
                'modelo': vehiculo.get('modelo', ''),
                'cliente_nombre': usuario.get('nombre', '')
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error listando órdenes finalizadas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/asignar-tecnicos', methods=['POST'])
@jefe_taller_required
def asignar_tecnicos(current_user):
    """Asignar técnicos a una orden de trabajo"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        tecnicos_ids = data.get('tecnicos', [])
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not tecnicos_ids or len(tecnicos_ids) == 0:
            return jsonify({'error': 'Debe asignar al menos un técnico'}), 400
        
        if len(tecnicos_ids) > 2:
            return jsonify({'error': 'Máximo 2 técnicos por orden'}), 400
        
        # Verificar que la orden existe
        orden = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        # Eliminar asignaciones previas activas
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': datetime.datetime.now().isoformat()}) \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        # Crear nuevas asignaciones
        for tecnico_id in tecnicos_ids:
            supabase.table('asignaciontecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'fecha_hora_inicio': datetime.datetime.now().isoformat()
            }).execute()
        
        # Si la orden estaba en Recepción, cambiar a EnProceso
        if orden.data['estado_global'] == 'EnRecepcion':
            supabase.table('ordentrabajo') \
                .update({'estado_global': 'EnProceso'}) \
                .eq('id', id_orden) \
                .execute()
            
            supabase.table('seguimientoorden').insert({
                'id_orden_trabajo': id_orden,
                'estado': 'EnProceso',
                'fecha_hora_cambio': datetime.datetime.now().isoformat()
            }).execute()
        
        logger.info(f"Técnicos asignados a orden {id_orden} por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': 'Técnicos asignados correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/diagnostico-inicial', methods=['POST'])
@jefe_taller_required
def guardar_diagnostico_inicial(current_user):
    """Guardar diagnóstico inicial de la orden con grabación de audio"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        diagnostico = data.get('diagnostico', '')
        audio_url = data.get('audio_url')  # URL del audio subido
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        # Verificar si existe diagnóstico previo
        diagnostico_existente = supabase.table('diagnostigoinicial') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if diagnostico_existente.data:
            # Actualizar existente
            update_data = {
                'diagnostigo': diagnostico,
                'fecha_hora': datetime.datetime.now().isoformat()
            }
            if audio_url:
                update_data['url_grabacion'] = audio_url
            
            supabase.table('diagnostigoinicial') \
                .update(update_data) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
        else:
            # Crear nuevo
            insert_data = {
                'id_orden_trabajo': id_orden,
                'id_jefe_taller': current_user['id'],
                'diagnostigo': diagnostico,
                'fecha_hora': datetime.datetime.now().isoformat()
            }
            if audio_url:
                insert_data['url_grabacion'] = audio_url
            
            supabase.table('diagnostigoinicial').insert(insert_data).execute()
        
        logger.info(f"Diagnóstico inicial guardado para orden {id_orden}")
        
        return jsonify({'success': True, 'message': 'Diagnóstico guardado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500
    

@jefe_taller_ordenes_bp.route('/planificar', methods=['POST'])
@jefe_taller_required
def planificar_trabajo(current_user):
    """Planificar trabajo: asignar bahía y horario"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        bahia = data.get('bahia')
        fecha_inicio = data.get('fecha_inicio')
        horas_estimadas = data.get('horas_estimadas')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not bahia:
            return jsonify({'error': 'Bahía requerida'}), 400
        
        if not fecha_inicio:
            return jsonify({'error': 'Fecha de inicio requerida'}), 400
        
        if not horas_estimadas or horas_estimadas <= 0:
            return jsonify({'error': 'Horas estimadas válidas requeridas'}), 400
        
        # Calcular fecha fin
        fecha_inicio_dt = datetime.datetime.fromisoformat(fecha_inicio)
        fecha_fin_dt = fecha_inicio_dt + datetime.timedelta(hours=float(horas_estimadas))
        
        # Verificar si ya existe planificación
        planificacion_existente = supabase.table('planificacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if planificacion_existente.data:
            # Actualizar existente
            supabase.table('planificacion') \
                .update({
                    'bahia_asignada': bahia,
                    'horas_estimadas': horas_estimadas,
                    'fecha_hora_inicio_estimado': fecha_inicio_dt.isoformat(),
                    'fecha_hora_fin_estimado': fecha_fin_dt.isoformat()
                }) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
        else:
            # Crear nueva
            supabase.table('planificacion').insert({
                'id_orden_trabajo': id_orden,
                'bahia_asignada': bahia,
                'horas_estimadas': horas_estimadas,
                'fecha_hora_inicio_estimado': fecha_inicio_dt.isoformat(),
                'fecha_hora_fin_estimado': fecha_fin_dt.isoformat()
            }).execute()
        
        logger.info(f"Planificación guardada para orden {id_orden}")
        
        return jsonify({'success': True, 'message': 'Planificación guardada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando planificación: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/reanudar-orden', methods=['POST'])
@jefe_taller_required
def reanudar_orden(current_user):
    """Reanudar una orden que estaba en pausa"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        # Actualizar estado de la orden
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnProceso'}) \
            .eq('id', id_orden) \
            .execute()
        
        # Registrar en seguimiento
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnProceso',
            'fecha_hora_cambio': datetime.datetime.now().isoformat()
        }).execute()
        
        logger.info(f"Orden {id_orden} reanudada por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': 'Orden reanudada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error reanudando orden: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def detalle_orden(current_user, id_orden):
    """Obtener detalle completo de una orden de trabajo incluyendo planificación"""
    try:
        # 1. Obtener orden de trabajo con ambos jefes operativos
        orden = supabase.table('ordentrabajo') \
            .select('''
                id, 
                codigo_unico, 
                fecha_ingreso, 
                fecha_salida, 
                estado_global, 
                id_vehiculo, 
                id_jefe_operativo,
                id_jefe_operativo_2
            ''') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        o = orden.data
        
        # 2. Obtener jefe operativo principal
        jefe_operativo = {}
        if o.get('id_jefe_operativo'):
            jefe1 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', o['id_jefe_operativo']) \
                .execute()
            if jefe1.data:
                jefe_operativo = jefe1.data[0]
        
        # 3. Obtener segundo jefe operativo (si existe)
        jefe_operativo_2 = {}
        if o.get('id_jefe_operativo_2'):
            jefe2 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', o['id_jefe_operativo_2']) \
                .execute()
            if jefe2.data:
                jefe_operativo_2 = jefe2.data[0]
        
        # 4. Obtener vehículo
        vehiculo = supabase.table('vehiculo') \
            .select('*') \
            .eq('id', o['id_vehiculo']) \
            .execute()
        
        v = vehiculo.data[0] if vehiculo.data else {}
        
        # 5. Obtener cliente (desde vehículo.id_cliente)
        cliente_info = {}
        usuario_cliente = {}
        
        if v.get('id_cliente'):
            cliente = supabase.table('cliente') \
                .select('*') \
                .eq('id', v['id_cliente']) \
                .execute()
            
            if cliente.data:
                cliente_info = cliente.data[0]
                
                # 6. Obtener usuario del cliente
                if cliente_info.get('id_usuario'):
                    usuario = supabase.table('usuario') \
                        .select('id, nombre, contacto, ubicacion, email') \
                        .eq('id', cliente_info['id_usuario']) \
                        .execute()
                    
                    if usuario.data:
                        usuario_cliente = usuario.data[0]
        
        # 7. Obtener datos de recepción
        recepcion = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        # 8. Obtener técnicos asignados
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        tecnicos = []
        for asig in (asignaciones.data or []):
            tecnico = supabase.table('usuario') \
                .select('id, nombre, contacto') \
                .eq('id', asig['id_tecnico']) \
                .execute()
            if tecnico.data:
                tecnicos.append(tecnico.data[0])
        
        # 9. Obtener diagnóstico inicial (con audio)
        diagnostico = supabase.table('diagnostigoinicial') \
            .select('diagnostigo, fecha_hora, url_grabacion') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()

        diagnostico_data = diagnostico.data[0] if diagnostico.data else None
        
        # 10. Obtener planificación
        planificacion = supabase.table('planificacion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        planificacion_data = planificacion.data[0] if planificacion.data else None
        
        # 11. Construir respuesta completa
        detalle = {
            'id': o['id'],
            'codigo_unico': o['codigo_unico'],
            'fecha_ingreso': o['fecha_ingreso'],
            'fecha_salida': o.get('fecha_salida'),
            'estado_global': o['estado_global'],
            # Datos del jefe operativo PRINCIPAL
            'jefe_operativo': jefe_operativo,
            # Datos del jefe operativo SECUNDARIO
            'jefe_operativo_2': jefe_operativo_2,
            # Datos del vehículo
            'placa': v.get('placa', ''),
            'marca': v.get('marca', ''),
            'modelo': v.get('modelo', ''),
            'anio': v.get('anio'),
            'kilometraje': v.get('kilometraje'),
            # Datos del cliente
            'cliente': {
                'id': cliente_info.get('id') if cliente_info else None,
                'id_usuario': cliente_info.get('id_usuario') if cliente_info else None,
                'nombre': usuario_cliente.get('nombre', 'No registrado'),
                'telefono': usuario_cliente.get('contacto', 'No registrado'),
                'ubicacion': usuario_cliente.get('ubicacion', 'No registrada'),
                'email': usuario_cliente.get('email', 'No registrado'),
                'documento': cliente_info.get('numero_documento', '') if cliente_info else '',
                'tipo_documento': cliente_info.get('tipo_documento', '') if cliente_info else ''
            },
            'tecnicos': tecnicos,
            'diagnostico_inicial': diagnostico_data['diagnostigo'] if diagnostico_data else None,
            'diagnostico_audio_url': diagnostico_data.get('url_grabacion') if diagnostico_data else None,
            # DATOS DE PLANIFICACIÓN
            'planificacion': planificacion_data,
            # DATOS DE RECEPCIÓN
            'transcripcion_problema': recepcion_data.get('transcripcion_problema', ''),
            'audio_url': recepcion_data.get('url_grabacion_problema'),
            'fotos': {
                'url_lateral_izquierda': recepcion_data.get('url_lateral_izquierda'),
                'url_lateral_derecha': recepcion_data.get('url_lateral_derecha'),
                'url_foto_frontal': recepcion_data.get('url_foto_frontal'),
                'url_foto_trasera': recepcion_data.get('url_foto_trasera'),
                'url_foto_superior': recepcion_data.get('url_foto_superior'),
                'url_foto_inferior': recepcion_data.get('url_foto_inferior'),
                'url_foto_tablero': recepcion_data.get('url_foto_tablero')
            }
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de orden: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    

@jefe_taller_ordenes_bp.route('/historial-diagnosticos/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def historial_diagnosticos(current_user, id_orden):
    """Obtener historial de diagnósticos técnicos de una orden"""
    try:
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('id, id_tecnico, informe, url_grabacion_informe, transcripcion_informe, estado, fecha_envio, version, usuario!inner(nombre)') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_envio', desc=True) \
            .execute()
        
        diagnosticos_list = []
        for d in (diagnosticos.data or []):
            # Obtener observaciones
            observaciones = supabase.table('observaciondiagnostico') \
                .select('observacion, url_grabacion_observacion, fecha_hora, id_jefe_taller, jefe_taller:usuario!observaciondiagnostico_id_jefe_taller_fkey(nombre)') \
                .eq('id_diagnostico_tecnico', d['id']) \
                .execute()
            
            observacion_data = observaciones.data[0] if observaciones.data else None
            
            # Obtener fotos
            fotos = supabase.table('foto_diagnostico') \
                .select('url_foto, descripcion_tecnico') \
                .eq('id_diagnostico_tecnico', d['id']) \
                .execute()
            
            diagnosticos_list.append({
                'id': d['id'],
                'id_tecnico': d['id_tecnico'],
                'tecnico_nombre': d.get('usuario', {}).get('nombre', ''),
                'informe': d.get('informe', ''),
                'url_grabacion': d.get('url_grabacion_informe'),
                'transcripcion': d.get('transcripcion_informe'),
                'estado': d.get('estado', ''),
                'fecha_envio': d.get('fecha_envio'),
                'version': d.get('version', 1),
                'observaciones': observacion_data.get('observacion') if observacion_data else None,
                'observacion_audio': observacion_data.get('url_grabacion_observacion') if observacion_data else None,
                'aprobado': d.get('estado') == 'aprobado',
                'fotos': [{'url_foto': f['url_foto'], 'descripcion': f.get('descripcion_tecnico', '')} for f in (fotos.data or [])]
            })
        
        return jsonify({'success': True, 'diagnosticos': diagnosticos_list}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo historial de diagnósticos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/aprobar-diagnostico', methods=['POST'])
@jefe_taller_required
def aprobar_diagnostico(current_user):
    """Aprobar o rechazar un diagnóstico técnico"""
    try:
        data = request.get_json()
        id_diagnostico = data.get('id_diagnostico')
        aceptado = data.get('aceptado', True)
        observacion = data.get('observacion')
        
        if not id_diagnostico:
            return jsonify({'error': 'ID de diagnóstico requerido'}), 400
        
        # Actualizar estado del diagnóstico
        nuevo_estado = 'aprobado' if aceptado else 'rechazado'
        supabase.table('diagnostico_tecnico') \
            .update({'estado': nuevo_estado}) \
            .eq('id', id_diagnostico) \
            .execute()
        
        # Si es rechazado, guardar observación
        if not aceptado and observacion:
            supabase.table('observaciondiagnostico').insert({
                'id_diagnostico_tecnico': id_diagnostico,
                'id_jefe_taller': current_user['id'],
                'observacion': observacion,
                'fecha_hora': datetime.datetime.now().isoformat()
            }).execute()
            
            # Crear nueva versión para el técnico
            diagnostico_actual = supabase.table('diagnostico_tecnico') \
                .select('id_orden_trabajo, id_tecnico, informe, url_grabacion_informe, transcripcion_informe, version') \
                .eq('id', id_diagnostico) \
                .single() \
                .execute()
            
            if diagnostico_actual.data:
                supabase.table('diagnostico_tecnico').insert({
                    'id_orden_trabajo': diagnostico_actual.data['id_orden_trabajo'],
                    'id_tecnico': diagnostico_actual.data['id_tecnico'],
                    'informe': diagnostico_actual.data.get('informe'),
                    'url_grabacion_informe': diagnostico_actual.data.get('url_grabacion_informe'),
                    'transcripcion_informe': diagnostico_actual.data.get('transcripcion_informe'),
                    'estado': 'pendiente',
                    'fecha_envio': datetime.datetime.now().isoformat(),
                    'version': (diagnostico_actual.data.get('version', 1) + 1)
                }).execute()
        
        logger.info(f"Diagnóstico {id_diagnostico} {'aprobado' if aceptado else 'rechazado'} por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': f'Diagnóstico {"aprobado" if aceptado else "rechazado con observaciones"}'}), 200
        
    except Exception as e:
        logger.error(f"Error aprobando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500


def generar_codigo_orden():
    """Generar código único para orden de trabajo"""
    try:
        fecha = datetime.datetime.now()
        año = fecha.strftime('%y')
        mes = fecha.strftime('%m')
        dia = fecha.strftime('%d')
        
        inicio_dia = datetime.datetime.combine(fecha.date(), datetime.time.min)
        fin_dia = datetime.datetime.combine(fecha.date(), datetime.time.max)
        
        ultimos = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .gte('fecha_ingreso', inicio_dia.isoformat()) \
            .lte('fecha_ingreso', fin_dia.isoformat()) \
            .execute()
        
        contador = len(ultimos.data) if ultimos.data else 0
        secuencia = str(contador + 1).zfill(3)
        
        return f"OT-{año}{mes}{dia}-{secuencia}"
        
    except Exception:
        timestamp = datetime.datetime.now().strftime('%y%m%d%H%M%S')
        return f"OT-{timestamp}"


# =====================================================
# TRANSCRIPCIÓN DE AUDIO PARA JEFE TALLER
# =====================================================

@jefe_taller_ordenes_bp.route('/transcribir-audio', methods=['POST'])
@jefe_taller_required
def transcribir_audio_jefe_taller(current_user):
    """Transcribir audio usando Whisper (para jefe taller)"""
    try:
        data = request.get_json()
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        # Verificar si Whisper está disponible
        WHISPER_AVAILABLE = False
        try:
            import whisper
            WHISPER_AVAILABLE = True
        except ImportError:
            pass
        
        if not WHISPER_AVAILABLE:
            return jsonify({'error': 'Whisper no está disponible en el servidor'}), 500
        
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        
        logger.info(f"Audio recibido por jefe taller: {len(audio_bytes)} bytes")
        
        # Función local de transcripción
        import tempfile
        import uuid
        import os
        
        try:
            model = whisper.load_model("base")
            temp_path = None
            try:
                temp_dir = tempfile.gettempdir()
                temp_path = os.path.join(temp_dir, f"whisper_audio_{uuid.uuid4().hex}.wav")
                with open(temp_path, 'wb') as f:
                    f.write(audio_bytes)
                
                resultado = model.transcribe(
                    temp_path,
                    language="es",
                    task="transcribe",
                    verbose=False,
                    fp16=False
                )
                texto = resultado["text"].strip()
                logger.info(f"✅ Transcripción completada: {len(texto)} caracteres")
                
                return jsonify({'success': True, 'transcripcion': texto}), 200
                
            finally:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)
                    
        except Exception as e:
            logger.error(f"Error en transcripción: {str(e)}")
            return jsonify({'error': f'Error al transcribir: {str(e)}'}), 500
        
    except Exception as e:
        logger.error(f"Error en transcripción: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
# =====================================================
# SUBIR AUDIO DE DIAGNÓSTICO A CLOUDINARY
# =====================================================

@jefe_taller_ordenes_bp.route('/subir-audio-diagnostico', methods=['POST'])
@jefe_taller_required
def subir_audio_diagnostico(current_user):
    """Subir audio de diagnóstico a Cloudinary"""
    try:
        data = request.get_json()
        audio_base64 = data.get('audio')
        id_orden = data.get('id_orden')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        # Verificar si Cloudinary está configurado
        if not config.CLOUDINARY_CONFIGURED:
            logger.warning("⚠️ Cloudinary no configurado, guardando audio localmente")
            # Guardar localmente como fallback
            if 'base64,' in audio_base64:
                audio_base64 = audio_base64.split('base64,')[1]
            audio_bytes = base64.b64decode(audio_base64)
            
            upload_dir = os.path.join('uploads', 'audios', f'diagnostico_{id_orden}')
            os.makedirs(upload_dir, exist_ok=True)
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"diagnostico_{id_orden}_{timestamp}.wav"
            filepath = os.path.join(upload_dir, filename)
            
            with open(filepath, 'wb') as f:
                f.write(audio_bytes)
            
            url = f"/uploads/audios/diagnostico_{id_orden}/{filename}"
            logger.info(f"✅ Audio guardado localmente: {url}")
            return jsonify({'success': True, 'url': url}), 200
        
        # Limpiar el base64
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        # Decodificar base64 a bytes
        audio_bytes = base64.b64decode(audio_base64)
        audio_file = io.BytesIO(audio_bytes)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        audio_file.name = f"diagnostico_{id_orden}_{timestamp}.wav"
        
        # Subir a Cloudinary
        resultado = cloudinary.uploader.upload(
            audio_file,
            folder=f"furia_motor/diagnosticos/{id_orden}",
            public_id=f"diagnostico_{id_orden}_{timestamp}",
            resource_type="video"
        )
        
        url = resultado.get('secure_url')
        logger.info(f"✅ Audio de diagnóstico subido a Cloudinary: {url}")
        
        return jsonify({'success': True, 'url': url}), 200
        
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500