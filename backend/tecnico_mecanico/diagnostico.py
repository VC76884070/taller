# =====================================================
# DIAGNÓSTICO TÉCNICO - TÉCNICO MECÁNICO
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, send_from_directory
from functools import wraps
from config import config
import jwt
import datetime
import logging
import uuid
import os
import cloudinary
import cloudinary.uploader
import tempfile

logger = logging.getLogger(__name__)

diagnostico_bp = Blueprint('diagnostico', __name__, url_prefix='/tecnico')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# Configurar Cloudinary
CLOUDINARY_CONFIGURED = False
try:
    if hasattr(config, 'CLOUDINARY_CLOUD_NAME') and config.CLOUDINARY_CLOUD_NAME:
        cloudinary.config(
            cloud_name=config.CLOUDINARY_CLOUD_NAME,
            api_key=config.CLOUDINARY_API_KEY,
            api_secret=config.CLOUDINARY_API_SECRET,
            secure=True
        )
        CLOUDINARY_CONFIGURED = True
        logger.info(f"✅ Cloudinary configurado correctamente")
except Exception as e:
    logger.warning(f"⚠️ Cloudinary no configurado: {str(e)}")

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
# FUNCIONES DE CLOUDINARY
# =====================================================
def subir_foto_cloudinary(archivo, carpeta="diagnosticos"):
    try:
        if not CLOUDINARY_CONFIGURED:
            return {'success': False, 'error': 'Cloudinary no configurado'}
        
        resultado = cloudinary.uploader.upload(
            archivo,
            folder=carpeta,
            resource_type="image",
            transformation=[
                {'width': 800, 'height': 600, 'crop': 'limit'},
                {'quality': 'auto'}
            ]
        )
        return {
            'success': True,
            'url': resultado['secure_url'],
            'public_id': resultado['public_id']
        }
    except Exception as e:
        logger.error(f"Error subiendo a Cloudinary: {str(e)}")
        return {'success': False, 'error': str(e)}


def subir_audio_cloudinary(archivo, carpeta="audios_diagnosticos"):
    try:
        if not CLOUDINARY_CONFIGURED:
            return {'success': False, 'error': 'Cloudinary no configurado'}
        
        resultado = cloudinary.uploader.upload(
            archivo,
            folder=carpeta,
            resource_type="video",
            format="mp3"
        )
        return {
            'success': True,
            'url': resultado['secure_url'],
            'public_id': resultado['public_id']
        }
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        return {'success': False, 'error': str(e)}


def transcribir_audio_local(audio_url):
    """Transcribir audio usando Whisper local"""
    if not WHISPER_AVAILABLE:
        return None
    
    temp_path = None
    try:
        import requests
        response = requests.get(audio_url)
        if response.status_code != 200:
            logger.error(f"Error descargando audio: {response.status_code}")
            return None
        
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"whisper_audio_{uuid.uuid4().hex}.mp3")
        
        with open(temp_path, 'wb') as f:
            f.write(response.content)
        
        model = whisper.load_model("base")
        resultado = model.transcribe(
            temp_path,
            language="es",
            task="transcribe",
            verbose=False,
            fp16=False
        )
        
        texto = resultado["text"].strip()
        logger.info(f"✅ Transcripción completada: {len(texto)} caracteres")
        return texto
        
    except Exception as e:
        logger.error(f"Error en transcripción: {str(e)}")
        return None
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.warning(f"Error eliminando archivo temporal: {e}")


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
# API: SUBIR FOTO
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
            .select('id') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .execute()
        
        fotos_count = len(fotos_existentes.data or [])
        
        if fotos_count >= max_fotos:
            return jsonify({'error': f'Máximo {max_fotos} fotos por diagnóstico'}), 400
        
        # Subir a Cloudinary
        resultado_cloudinary = subir_foto_cloudinary(foto)
        
        if not resultado_cloudinary['success']:
            return jsonify({'error': resultado_cloudinary['error']}), 500
        
        # Guardar en BD
        resultado_foto = supabase.table('foto_diagnostico').insert({
            'id_diagnostico_tecnico': diagnostico_id,
            'url_foto': resultado_cloudinary['url'],
            'public_id': resultado_cloudinary['public_id'],
            'descripcion_tecnico': f"Foto {fotos_count + 1}"
        }).execute()
        
        return jsonify({
            'success': True,
            'url': resultado_cloudinary['url'],
            'foto_id': resultado_foto.data[0]['id'],
            'message': 'Foto subida correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error subiendo foto: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: ELIMINAR FOTO
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
        
        # Eliminar de Cloudinary
        public_id = foto_data.get('public_id')
        if public_id and CLOUDINARY_CONFIGURED:
            try:
                cloudinary.uploader.destroy(public_id)
                logger.info(f"✅ Foto eliminada de Cloudinary: {public_id}")
            except Exception as e:
                logger.error(f"Error eliminando de Cloudinary: {str(e)}")
        
        # Eliminar de BD
        supabase.table('foto_diagnostico').delete().eq('id', foto_id).execute()
        
        return jsonify({'success': True, 'message': 'Foto eliminada'}), 200
        
    except Exception as e:
        logger.error(f"Error eliminando foto: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: SUBIR AUDIO
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
        
        resultado_cloudinary = subir_audio_cloudinary(audio)
        
        if not resultado_cloudinary['success']:
            return jsonify({'error': resultado_cloudinary['error']}), 500
        
        transcripcion = None
        if WHISPER_AVAILABLE:
            transcripcion = transcribir_audio_local(resultado_cloudinary['url'])
        
        return jsonify({
            'success': True,
            'url': resultado_cloudinary['url'],
            'transcripcion': transcripcion,
            'message': 'Audio subido correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
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
                'estado_global': 'PendienteAprobacion'
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