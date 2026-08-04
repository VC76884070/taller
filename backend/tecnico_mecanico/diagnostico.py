# =====================================================
# DIAGNÓSTICO TÉCNICO - TÉCNICO MECÁNICO
# FURIA MOTOR COMPANY SRL
# MIGRADO A GOOGLE DRIVE
# ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_TECNICO/{fotos|audios}
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
import uuid
import os
import tempfile
import io

logger = logging.getLogger(__name__)

diagnostico_bp = Blueprint('diagnostico', __name__)

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# Importar Google Drive
from google_drive import google_drive

# Intentar importar Whisper
WHISPER_AVAILABLE = False
try:
    import whisper
    WHISPER_AVAILABLE = True
    logger.info("✅ Whisper disponible para transcripción")
except ImportError:
    logger.warning("⚠️ Whisper no instalado")


# =====================================================
# FUNCIÓN AUXILIAR: OBTENER ROLES DEL USUARIO
# =====================================================
def obtener_roles_usuario(usuario_id):
    """Obtiene los nombres de los roles de un usuario"""
    try:
        user_roles = supabase.table('usuario_rol') \
            .select('id_rol') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not user_roles.data:
            logger.info(f"Usuario {usuario_id} no tiene roles asignados")
            return []
        
        rol_ids = [ur['id_rol'] for ur in user_roles.data]
        
        roles_data = supabase.table('rol') \
            .select('nombre_rol') \
            .in_('id', rol_ids) \
            .execute()
        
        roles = [r['nombre_rol'] for r in (roles_data.data or [])]
        
        return roles
        
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return []


# =====================================================
# FUNCIÓN AUXILIAR: VERIFICAR TOKEN Y OBTENER USUARIO
# =====================================================
def verificar_token_y_usuario():
    """Verifica el token y retorna el usuario si es válido"""
    token = None
    
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            token = auth_header.split(" ")[1]
        except IndexError:
            pass
    
    if not token:
        return None, "No autorizado", 401
    
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        current_user = data['user']
        
        roles = obtener_roles_usuario(current_user.get('id'))
        current_user['roles'] = roles
        
        logger.info(f"✅ Usuario verificado: {current_user.get('nombre')} - Roles: {roles}")
        return current_user, None, None
        
    except jwt.ExpiredSignatureError:
        return None, "Sesión expirada", 401
    except jwt.InvalidTokenError as e:
        logger.error(f"Token inválido: {str(e)}")
        return None, "Token inválido", 401


# =====================================================
# DECORADOR: VERIFICAR ROL TÉCNICO
# =====================================================
def tecnico_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user, error, status = verificar_token_y_usuario()
        
        if error:
            return jsonify({'error': error}), status
        
        if 'tecnico' not in current_user.get('roles', []):
            logger.warning(f"Usuario {current_user.get('nombre')} no tiene rol de técnico")
            return jsonify({'error': 'No autorizado - Se requiere rol de Técnico'}), 403
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# FUNCIÓN AUXILIAR: OBTENER CÓDIGO DE ORDEN
# =====================================================
def obtener_codigo_orden(id_orden):
    """Obtiene el código único de una orden de trabajo"""
    try:
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        if orden.data:
            return orden.data[0]['codigo_unico']
        return None
    except Exception as e:
        logger.error(f"Error obteniendo código de orden: {str(e)}")
        return None


# =====================================================
# API: OBTENER ÓRDENES DEL TÉCNICO
# =====================================================
@diagnostico_bp.route('/api/ordenes-tecnico', methods=['GET'])
@tecnico_required
def obtener_ordenes_tecnico(current_user):
    try:
        tecnico_id = current_user['id']
        logger.info(f"Obteniendo órdenes para técnico ID: {tecnico_id}")
        
        # Obtener asignaciones activas
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, fecha_hora_inicio, tipo_asignacion') \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignaciones.data:
            logger.info(f"No hay asignaciones de diagnóstico para técnico {tecnico_id}")
            return jsonify({'success': True, 'ordenes': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in asignaciones.data]
        
        # Obtener órdenes
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .in_('id', orden_ids) \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        # Obtener vehículos
        vehiculos_ids = [o['id_vehiculo'] for o in ordenes.data]
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje') \
            .in_('id', vehiculos_ids) \
            .execute()
        vehiculos_map = {v['id']: v for v in (vehiculos.data or [])}
        
        ordenes_resultado = []
        for orden in ordenes.data:
            vehiculo = vehiculos_map.get(orden['id_vehiculo'], {})
            
            # Verificar si existe diagnóstico
            diagnostico_existente = supabase.table('diagnostico_tecnico') \
                .select('id, estado, version, fecha_envio') \
                .eq('id_orden_trabajo', orden['id']) \
                .eq('id_tecnico', tecnico_id) \
                .order('version', desc=True) \
                .limit(1) \
                .execute()
            
            tiene_diagnostico = len(diagnostico_existente.data) > 0
            diagnostico_estado = diagnostico_existente.data[0].get('estado') if tiene_diagnostico else None
            
            ordenes_resultado.append({
                'orden_id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'vehiculo': {
                    'placa': vehiculo.get('placa', 'N/A'),
                    'marca': vehiculo.get('marca', 'N/A'),
                    'modelo': vehiculo.get('modelo', 'N/A'),
                    'anio': vehiculo.get('anio', 'N/A'),
                    'kilometraje': vehiculo.get('kilometraje', 0)
                },
                'tiene_diagnostico': tiene_diagnostico,
                'diagnostico_estado': diagnostico_estado
            })
        
        return jsonify({'success': True, 'ordenes': ordenes_resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER DIAGNÓSTICO DE UNA ORDEN
# =====================================================
@diagnostico_bp.route('/api/diagnostico/<int:id_orden>', methods=['GET'])
@tecnico_required
def obtener_diagnostico(current_user, id_orden):
    try:
        tecnico_id = current_user['id']
        
        # Verificar asignación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        # Obtener diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, informe, url_grabacion_informe, transcripcion_informe, estado, fecha_envio, version, es_borrador') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        diagnostico_data = diagnostico.data[0] if diagnostico.data else None
        
        # Obtener servicios
        servicios = []
        if diagnostico_data:
            servicios_result = supabase.table('servicio_tecnico') \
                .select('id, descripcion, orden') \
                .eq('id_diagnostico_tecnico', diagnostico_data['id']) \
                .order('orden') \
                .execute()
            servicios = servicios_result.data if servicios_result.data else []
        
        # Obtener fotos
        fotos = []
        if diagnostico_data:
            fotos_result = supabase.table('foto_diagnostico') \
                .select('id, url_foto, descripcion_tecnico, public_id') \
                .eq('id_diagnostico_tecnico', diagnostico_data['id']) \
                .execute()
            fotos = fotos_result.data if fotos_result.data else []
        
        # Obtener observaciones
        observaciones = []
        if diagnostico_data:
            obs_result = supabase.table('observaciondiagnostico') \
                .select('id, observacion, transcripcion_obs, fecha_hora, id_jefe_taller') \
                .eq('id_diagnostico_tecnico', diagnostico_data['id']) \
                .order('fecha_hora', desc=True) \
                .execute()
            
            if obs_result.data:
                jefes_ids = list(set([obs['id_jefe_taller'] for obs in obs_result.data if obs.get('id_jefe_taller')]))
                jefes_nombres = {}
                
                if jefes_ids:
                    jefes_result = supabase.table('usuario') \
                        .select('id, nombre') \
                        .in_('id', jefes_ids) \
                        .execute()
                    if jefes_result.data:
                        jefes_nombres = {j['id']: j['nombre'] for j in jefes_result.data}
                
                for obs in obs_result.data:
                    observaciones.append({
                        'id': obs['id'],
                        'observacion': obs.get('observacion', ''),
                        'transcripcion_obs': obs.get('transcripcion_obs', ''),
                        'fecha_hora': obs.get('fecha_hora'),
                        'id_jefe_taller': obs.get('id_jefe_taller'),
                        'jefe_taller': {'nombre': jefes_nombres.get(obs.get('id_jefe_taller'), 'Desconocido')}
                    })
        
        return jsonify({
            'success': True,
            'diagnostico': diagnostico_data,
            'servicios': servicios,
            'fotos': fotos,
            'observaciones': observaciones
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo diagnóstico: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: SUBIR FOTO A GOOGLE DRIVE
# ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_TECNICO/fotos/
# =====================================================
@diagnostico_bp.route('/api/diagnostico/subir-foto', methods=['POST'])
@tecnico_required
def subir_foto_diagnostico(current_user):
    try:
        id_orden = request.form.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if 'foto' not in request.files:
            return jsonify({'error': 'No se envió ninguna foto'}), 400
        
        foto = request.files['foto']
        if foto.filename == '':
            return jsonify({'error': 'No se seleccionó ningún archivo'}), 400
        
        tecnico_id = current_user['id']
        
        # Obtener código de la orden
        codigo_orden = obtener_codigo_orden(id_orden)
        if not codigo_orden:
            return jsonify({'error': 'No se encontró la orden'}), 404
        
        # Obtener o crear diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, max_fotos') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if not diagnostico.data:
            # Crear nuevo diagnóstico
            resultado = supabase.table('diagnostico_tecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'informe': '',
                'estado': 'borrador',
                'fecha_envio': datetime.datetime.now().isoformat(),
                'version': 1,
                'es_borrador': True,
                'max_fotos': 2
            }).execute()
            diagnostico_id = resultado.data[0]['id']
            max_fotos = 2
        else:
            diagnostico_id = diagnostico.data[0]['id']
            max_fotos = diagnostico.data[0].get('max_fotos', 2)
        
        # Verificar límite de fotos
        fotos_existentes = supabase.table('foto_diagnostico') \
            .select('id, public_id') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .execute()
        
        fotos_count = len(fotos_existentes.data or [])
        
        if fotos_count >= max_fotos:
            return jsonify({'error': f'Máximo {max_fotos} fotos por diagnóstico'}), 400
        
        # =============================================
        # SUBIR A GOOGLE DRIVE
        # ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_TECNICO/fotos/
        # =============================================
        folder_path = f"{codigo_orden}/DIAGNOSTICO_TECNICO/fotos"
        
        # Generar nombre de archivo único
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        extension = foto.filename.split('.')[-1] if '.' in foto.filename else 'jpg'
        filename = f"foto_{timestamp}_{uuid.uuid4().hex[:8]}.{extension}"
        
        # Subir a Google Drive
        resultado_drive = google_drive.upload_file(
            file_data=foto,
            filename=filename,
            folder_path=folder_path,
            public=True
        )
        
        if not resultado_drive or not resultado_drive.get('id'):
            return jsonify({'error': 'Error al subir la foto a Google Drive'}), 500
        
        # Guardar en BD
        resultado_foto = supabase.table('foto_diagnostico').insert({
            'id_diagnostico_tecnico': diagnostico_id,
            'url_foto': resultado_drive['url'],
            'public_id': resultado_drive['id'],  # Guardamos el ID de Drive
            'descripcion_tecnico': f"Foto {fotos_count + 1}"
        }).execute()
        
        logger.info(f"✅ Foto subida a Drive: {resultado_drive['url']}")
        
        return jsonify({
            'success': True,
            'url': resultado_drive['url'],
            'foto_id': resultado_foto.data[0]['id'],
            'message': 'Foto subida correctamente a Google Drive'
        }), 200
        
    except Exception as e:
        logger.error(f"Error subiendo foto: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: ELIMINAR FOTO DE GOOGLE DRIVE
# =====================================================
@diagnostico_bp.route('/api/diagnostico/eliminar-foto/<int:foto_id>', methods=['DELETE'])
@tecnico_required
def eliminar_foto_diagnostico(current_user, foto_id):
    try:
        # Obtener la foto
        foto = supabase.table('foto_diagnostico') \
            .select('id, public_id, id_diagnostico_tecnico') \
            .eq('id', foto_id) \
            .execute()
        
        if not foto.data:
            return jsonify({'error': 'Foto no encontrada'}), 404
        
        foto_data = foto.data[0]
        
        # Verificar diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id_tecnico') \
            .eq('id', foto_data['id_diagnostico_tecnico']) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'Diagnóstico no encontrado'}), 404
        
        if diagnostico.data[0]['id_tecnico'] != current_user['id']:
            return jsonify({'error': 'No autorizado'}), 403
        
        # Eliminar de Google Drive usando el public_id (que es el file_id)
        file_id = foto_data.get('public_id')
        if file_id:
            eliminado = google_drive.delete_file(file_id)
            if eliminado:
                logger.info(f"✅ Foto eliminada de Drive: {file_id}")
            else:
                logger.warning(f"⚠️ No se pudo eliminar de Drive: {file_id}")
        
        # Eliminar de BD
        supabase.table('foto_diagnostico').delete().eq('id', foto_id).execute()
        
        return jsonify({'success': True, 'message': 'Foto eliminada'}), 200
        
    except Exception as e:
        logger.error(f"Error eliminando foto: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: SUBIR AUDIO A GOOGLE DRIVE
# ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_TECNICO/audios/
# =====================================================
@diagnostico_bp.route('/api/diagnostico/subir-audio', methods=['POST'])
@tecnico_required
def subir_audio_diagnostico(current_user):
    try:
        id_orden = request.form.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if 'audio' not in request.files:
            return jsonify({'error': 'No se envió ningún audio'}), 400
        
        audio = request.files['audio']
        if audio.filename == '':
            return jsonify({'error': 'No se seleccionó ningún archivo'}), 400
        
        tecnico_id = current_user['id']
        
        # Obtener código de la orden
        codigo_orden = obtener_codigo_orden(id_orden)
        if not codigo_orden:
            return jsonify({'error': 'No se encontró la orden'}), 404
        
        # Obtener o crear diagnóstico (para tener el id)
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if not diagnostico.data:
            # Crear nuevo diagnóstico
            resultado = supabase.table('diagnostico_tecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'informe': '',
                'estado': 'borrador',
                'fecha_envio': datetime.datetime.now().isoformat(),
                'version': 1,
                'es_borrador': True,
                'max_fotos': 2
            }).execute()
            diagnostico_id = resultado.data[0]['id']
        else:
            diagnostico_id = diagnostico.data[0]['id']
        
        # =============================================
        # SUBIR A GOOGLE DRIVE
        # ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_TECNICO/audios/
        # =============================================
        folder_path = f"{codigo_orden}/DIAGNOSTICO_TECNICO/audios"
        
        # Generar nombre de archivo único
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"audio_{timestamp}_{uuid.uuid4().hex[:8]}.mp3"
        
        # Subir a Google Drive
        resultado_drive = google_drive.upload_file(
            file_data=audio,
            filename=filename,
            folder_path=folder_path,
            public=True
        )
        
        if not resultado_drive or not resultado_drive.get('id'):
            return jsonify({'error': 'Error al subir el audio a Google Drive'}), 500
        
        # =============================================
        # TRANSCRIBIR CON WHISPER
        # =============================================
        transcripcion = None
        if WHISPER_AVAILABLE:
            try:
                # Usar el método de google_drive para transcribir
                resultado_transcripcion = google_drive.transcribir_audio(
                    url_audio=resultado_drive['url']
                )
                if resultado_transcripcion.get('success'):
                    transcripcion = resultado_transcripcion.get('transcripcion')
                    logger.info(f"✅ Audio transcrito: {len(transcripcion)} caracteres")
                else:
                    logger.warning(f"⚠️ Error en transcripción: {resultado_transcripcion.get('error')}")
            except Exception as e:
                logger.error(f"Error en transcripción: {str(e)}")
        
        # Actualizar diagnóstico con el audio y transcripción
        supabase.table('diagnostico_tecnico').update({
            'url_grabacion_informe': resultado_drive['url'],
            'transcripcion_informe': transcripcion or '',
            'fecha_modificacion': datetime.datetime.now().isoformat()
        }).eq('id', diagnostico_id).execute()
        
        logger.info(f"✅ Audio subido a Drive: {resultado_drive['url']}")
        
        return jsonify({
            'success': True,
            'url': resultado_drive['url'],
            'transcripcion': transcripcion,
            'message': 'Audio subido correctamente a Google Drive'
        }), 200
        
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: GUARDAR DIAGNÓSTICO
# =====================================================
@diagnostico_bp.route('/api/diagnostico/guardar', methods=['POST'])
@tecnico_required
def guardar_diagnostico(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        transcripcion = data.get('transcripcion', '')
        url_grabacion = data.get('url_grabacion')
        servicios = data.get('servicios', [])
        enviar = data.get('enviar', False)
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        tecnico_id = current_user['id']
        
        # Verificar asignación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar si existe diagnóstico
        diagnostico_existente = supabase.table('diagnostico_tecnico') \
            .select('id, version') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico_existente.data:
            diagnostico_id = diagnostico_existente.data[0]['id']
            
            # Actualizar diagnóstico existente
            supabase.table('diagnostico_tecnico').update({
                'transcripcion_informe': transcripcion,
                'url_grabacion_informe': url_grabacion,
                'estado': 'pendiente' if enviar else 'borrador',
                'es_borrador': not enviar,
                'fecha_envio': ahora if enviar else None,
                'fecha_modificacion': ahora
            }).eq('id', diagnostico_id).execute()
            
            # Eliminar servicios existentes
            supabase.table('servicio_tecnico').delete().eq('id_diagnostico_tecnico', diagnostico_id).execute()
        else:
            # Crear nuevo diagnóstico
            resultado = supabase.table('diagnostico_tecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'transcripcion_informe': transcripcion,
                'url_grabacion_informe': url_grabacion,
                'estado': 'pendiente' if enviar else 'borrador',
                'es_borrador': not enviar,
                'fecha_envio': ahora if enviar else None,
                'fecha_modificacion': ahora,
                'version': 1,
                'max_fotos': 2
            }).execute()
            diagnostico_id = resultado.data[0]['id']
        
        # Insertar servicios
        for idx, servicio_desc in enumerate(servicios):
            if servicio_desc.strip():
                supabase.table('servicio_tecnico').insert({
                    'id_diagnostico_tecnico': diagnostico_id,
                    'descripcion': servicio_desc.strip(),
                    'orden': idx
                }).execute()
        
        # Si se envió, actualizar estado de la orden
        if enviar:
            supabase.table('ordentrabajo').update({
                'estado_global': 'DiagnosticoCompletado' 
            }).eq('id', id_orden).execute()
            
            # Notificar al Jefe de Taller
            notificar_jefes_taller(id_orden, current_user.get('nombre', 'Técnico'))
        
        return jsonify({
            'success': True,
            'message': 'Diagnóstico guardado correctamente',
            'diagnostico_id': diagnostico_id
        }), 200
        
    except Exception as e:
        logger.error(f"Error guardando diagnóstico: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def notificar_jefes_taller(id_orden, tecnico_nombre):
    """Notificar a los jefes de taller sobre un nuevo diagnóstico"""
    try:
        # Obtener jefes de taller (rol con nombre 'jefe_taller')
        jefes_result = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 2) \
            .execute()
        
        jefes_ids = [j['id_usuario'] for j in (jefes_result.data or [])]
        
        if not jefes_ids:
            logger.warning("No se encontraron jefes de taller para notificar")
            return
        
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        codigo_orden = orden.data[0]['codigo_unico'] if orden.data else str(id_orden)
        
        for jefe_id in jefes_ids:
            supabase.table('notificacion').insert({
                'id_usuario_destino': jefe_id,
                'tipo': 'diagnostico_tecnico',
                'mensaje': f"📋 Nuevo diagnóstico de {tecnico_nombre} para orden #{codigo_orden}",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        logger.info(f"Notificaciones enviadas a {len(jefes_ids)} jefes de taller")
        
    except Exception as e:
        logger.error(f"Error enviando notificaciones: {str(e)}")


# =====================================================
# API: OBTENER DETALLES COMPLETOS DE UNA ORDEN
# =====================================================
@diagnostico_bp.route('/api/orden/<int:id_orden>/detalles-completos', methods=['GET'])
@tecnico_required
def obtener_detalles_completos_orden(current_user, id_orden):
    """Obtener todos los detalles de una orden: recepción, diagnósticos, cotización, instrucciones"""
    try:
        tecnico_id = current_user['id']
        
        # Verificar que el técnico tiene acceso a esta orden
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        # Obtener datos de la orden
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo, instrucciones_armado') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data[0]
        
        # Obtener vehículo
        vehiculo = supabase.table('vehiculo') \
            .select('placa, marca, modelo, anio, kilometraje') \
            .eq('id', orden_data['id_vehiculo']) \
            .execute()
        
        orden_data['vehiculo'] = vehiculo.data[0] if vehiculo.data else {}
        
        # Obtener recepción
        recepcion = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else None
        
        # Obtener cotización
        cotizacion = supabase.table('cotizacion') \
            .select('id, estado, total, fecha_envio, motivo_rechazo, servicios_json, fecha_rechazo') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_envio', desc=True) \
            .limit(1) \
            .execute()
        
        cotizacion_data = None
        if cotizacion.data:
            cotizacion_data = cotizacion.data[0]
            if cotizacion_data.get('servicios_json'):
                try:
                    cotizacion_data['servicios'] = json.loads(cotizacion_data['servicios_json'])
                except:
                    cotizacion_data['servicios'] = []
        
        # Obtener instrucciones de armado (del historial)
        instrucciones_armado = None
        instrucciones_result = supabase.table('instrucciones_tecnico_historial') \
            .select('instrucciones, fecha_envio') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_envio', desc=True) \
            .limit(1) \
            .execute()
        
        if instrucciones_result.data:
            instrucciones_armado = {
                'texto': instrucciones_result.data[0]['instrucciones'],
                'fecha_envio': instrucciones_result.data[0]['fecha_envio']
            }
        elif orden_data.get('instrucciones_armado'):
            instrucciones_armado = {
                'texto': orden_data['instrucciones_armado'],
                'fecha_envio': orden_data.get('fecha_instrucciones')
            }
        
        # Obtener todos los diagnósticos del técnico para esta orden
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('id, informe, transcripcion_informe, estado, version, fecha_envio, url_grabacion_informe, es_borrador') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .order('version', desc=True) \
            .execute()
        
        diagnosticos_data = diagnosticos.data if diagnosticos.data else []
        
        diagnosticos_completos = []
        for diag in diagnosticos_data:
            servicios = supabase.table('servicio_tecnico') \
                .select('id, descripcion, orden') \
                .eq('id_diagnostico_tecnico', diag['id']) \
                .order('orden') \
                .execute()
            diag['servicios'] = servicios.data if servicios.data else []
            
            fotos = supabase.table('foto_diagnostico') \
                .select('id, url_foto, descripcion_tecnico') \
                .eq('id_diagnostico_tecnico', diag['id']) \
                .execute()
            diag['fotos'] = fotos.data if fotos.data else []
            
            diagnosticos_completos.append(diag)
        
        diagnostico_actual = diagnosticos_completos[0] if diagnosticos_completos else None
        diagnosticos_anteriores = diagnosticos_completos[1:] if len(diagnosticos_completos) > 1 else []
        
        observaciones = []
        if diagnostico_actual:
            obs_result = supabase.table('observaciondiagnostico') \
                .select('id, observacion, transcripcion_obs, fecha_hora, id_jefe_taller') \
                .eq('id_diagnostico_tecnico', diagnostico_actual['id']) \
                .order('fecha_hora', desc=True) \
                .execute()
            
            if obs_result.data:
                jefes_ids = list(set([obs['id_jefe_taller'] for obs in obs_result.data if obs.get('id_jefe_taller')]))
                jefes_nombres = {}
                
                if jefes_ids:
                    jefes_result = supabase.table('usuario') \
                        .select('id, nombre') \
                        .in_('id', jefes_ids) \
                        .execute()
                    if jefes_result.data:
                        jefes_nombres = {j['id']: j['nombre'] for j in jefes_result.data}
                
                for obs in obs_result.data:
                    observaciones.append({
                        'id': obs['id'],
                        'observacion': obs.get('observacion', ''),
                        'transcripcion_obs': obs.get('transcripcion_obs', ''),
                        'fecha_hora': obs.get('fecha_hora'),
                        'jefe_taller': {'nombre': jefes_nombres.get(obs.get('id_jefe_taller'), 'Jefe de Taller')}
                    })
        
        return jsonify({
            'success': True,
            'orden': orden_data,
            'recepcion': recepcion_data,
            'cotizacion': cotizacion_data,
            'instrucciones_armado': instrucciones_armado,
            'diagnostico_actual': diagnostico_actual,
            'diagnosticos_anteriores': diagnosticos_anteriores,
            'observaciones': observaciones
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalles completos: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: MARCAR ARMADO COMPLETADO
# =====================================================
@diagnostico_bp.route('/api/armado/completar/<int:id_orden>', methods=['PUT'])
@tecnico_required
def marcar_armado_completado(current_user, id_orden):
    """Marca que el técnico ha completado el armado del vehículo"""
    try:
        tecnico_id = current_user['id']
        
        # Verificar asignación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        # Obtener la orden
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        codigo_orden = orden.data[0]['codigo_unico']
        
        # Actualizar orden
        ahora = datetime.datetime.now().isoformat()
        supabase.table('ordentrabajo').update({
            'estado_global': 'ArmadoCompletado',
            'fecha_fin_armado': ahora
        }).eq('id', id_orden).execute()
        
        # Finalizar asignación del técnico
        supabase.table('asignaciontecnico').update({
            'fecha_hora_final': ahora
        }).eq('id_orden_trabajo', id_orden).eq('id_tecnico', tecnico_id).execute()
        
        # Notificar al Jefe de Taller
        notificar_armado_completado(id_orden, codigo_orden, current_user.get('nombre', 'Técnico'))
        
        return jsonify({
            'success': True,
            'message': 'Armado completado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error marcando armado completado: {str(e)}")
        return jsonify({'error': str(e)}), 500


def notificar_armado_completado(id_orden, codigo_orden, tecnico_nombre):
    """Notificar al Jefe de Taller que el armado fue completado"""
    try:
        jefes_result = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 2) \
            .execute()
        
        jefes_ids = [j['id_usuario'] for j in (jefes_result.data or [])]
        
        if not jefes_ids:
            logger.warning("No se encontraron jefes de taller para notificar")
            return
        
        for jefe_id in jefes_ids:
            supabase.table('notificacion').insert({
                'id_usuario_destino': jefe_id,
                'tipo': 'armado_completado',
                'mensaje': f"🔧 {tecnico_nombre} ha completado el armado del vehículo de la orden #{codigo_orden}",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        logger.info(f"Notificaciones de armado enviadas a {len(jefes_ids)} jefes de taller")
        
    except Exception as e:
        logger.error(f"Error enviando notificaciones de armado: {str(e)}")