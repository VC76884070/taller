# =====================================================
# PERFIL - TÉCNICO MECÁNICO (VERSIÓN OPTIMIZADA)
# =====================================================

from flask import Blueprint, request, jsonify, send_from_directory
from config import config
from decorators import tecnico_required
import datetime
import logging
import cloudinary
import cloudinary.uploader
from werkzeug.security import generate_password_hash, check_password_hash
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

tecnico_mecanico_perfil_bp = Blueprint('tecnico_mecanico_perfil', __name__, url_prefix='/tecnico')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# Thread pool para consultas paralelas
executor = ThreadPoolExecutor(max_workers=4)

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
        logger.info("✅ Cloudinary configurado correctamente")
except Exception as e:
    logger.warning(f"⚠️ Cloudinary no configurado: {str(e)}")


# =====================================================
# RUTA PARA SERVIR EL HTML
# =====================================================
@tecnico_mecanico_perfil_bp.route('/perfil')
@tecnico_required
def perfil_page(current_user):
    """Servir la página de Perfil"""
    return send_from_directory('../tecnico_mecanico', 'perfil.html')


# =====================================================
# API: OBTENER PERFIL DEL TÉCNICO (OPTIMIZADO)
# =====================================================
@tecnico_mecanico_perfil_bp.route('/api/perfil', methods=['GET'])
@tecnico_required
def obtener_perfil(current_user):
    try:
        usuario_id = current_user.get('id')
        logger.info(f"🔍 Obteniendo perfil optimizado para técnico ID: {usuario_id}")
        
        if not usuario_id:
            return jsonify({'error': 'ID de usuario no encontrado'}), 400
        
        # 1. Obtener datos del usuario (UNA consulta)
        usuario_result = supabase.table('usuario') \
            .select('id, nombre, email, contacto, ubicacion, avatar_url, fecha_registro') \
            .eq('id', usuario_id) \
            .execute()
        
        if not usuario_result.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        usuario = usuario_result.data[0]
        
        # 2. Obtener estadísticas en PARALELO
        # Primero obtener asignaciones del técnico
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo') \
            .eq('id_tecnico', usuario_id) \
            .execute()
        
        total_trabajos = len(asignaciones.data or [])
        trabajos_completados = 0
        trabajos_activos = 0
        
        if asignaciones.data and total_trabajos > 0:
            orden_ids = list(set([a['id_orden_trabajo'] for a in asignaciones.data]))
            
            # Ejecutar ambas consultas en PARALELO
            future_completados = executor.submit(
                lambda: supabase.table('ordentrabajo')
                .select('id')
                .in_('id', orden_ids)
                .in_('estado_global', ['Finalizado', 'Entregado'])
                .execute()
            )
            
            future_activos = executor.submit(
                lambda: supabase.table('ordentrabajo')
                .select('id')
                .in_('id', orden_ids)
                .in_('estado_global', ['EnProceso', 'EnPausa', 'ReparacionCompletada', 'VehiculoArmado'])
                .execute()
            )
            
            ordenes_completadas = future_completados.result()
            ordenes_activas = future_activos.result()
            
            trabajos_completados = len(ordenes_completadas.data or [])
            trabajos_activos = len(ordenes_activas.data or [])
        
        return jsonify({
            'success': True,
            'usuario': usuario,
            'estadisticas': {
                'total_trabajos': total_trabajos,
                'trabajos_completados': trabajos_completados,
                'trabajos_activos': trabajos_activos
            }
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo perfil: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: ACTUALIZAR DATOS PERSONALES
# =====================================================
@tecnico_mecanico_perfil_bp.route('/api/perfil', methods=['PUT'])
@tecnico_required
def actualizar_perfil(current_user):
    try:
        data = request.get_json()
        usuario_id = current_user.get('id')
        
        if not usuario_id:
            return jsonify({'error': 'ID de usuario no encontrado'}), 400
        
        nombre = data.get('nombre', '').strip()
        email = data.get('email', '').strip()
        contacto = data.get('contacto', '')
        ubicacion = data.get('ubicacion', '')
        
        if not nombre:
            return jsonify({'error': 'El nombre es requerido'}), 400
        
        if not email:
            return jsonify({'error': 'El email es requerido'}), 400
        
        # Verificar si el email ya está en uso por otro usuario (solo si cambió)
        usuario_actual = supabase.table('usuario') \
            .select('email') \
            .eq('id', usuario_id) \
            .execute()
        
        if usuario_actual.data and usuario_actual.data[0]['email'] != email:
            email_existente = supabase.table('usuario') \
                .select('id') \
                .eq('email', email) \
                .neq('id', usuario_id) \
                .execute()
            
            if email_existente.data:
                return jsonify({'error': 'El correo electrónico ya está en uso'}), 400
        
        # Actualizar usuario
        resultado = supabase.table('usuario') \
            .update({
                'nombre': nombre,
                'email': email,
                'contacto': contacto,
                'ubicacion': ubicacion
            }) \
            .eq('id', usuario_id) \
            .execute()
        
        if resultado.data:
            return jsonify({
                'success': True,
                'message': 'Perfil actualizado correctamente'
            }), 200
        else:
            return jsonify({'error': 'Error al actualizar perfil'}), 500
        
    except Exception as e:
        logger.error(f"❌ Error actualizando perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: ACTUALIZAR AVATAR
# =====================================================
@tecnico_mecanico_perfil_bp.route('/api/perfil/avatar', methods=['POST'])
@tecnico_required
def actualizar_avatar(current_user):
    try:
        usuario_id = current_user.get('id')
        
        if not usuario_id:
            return jsonify({'error': 'ID de usuario no encontrado'}), 400
        
        if 'avatar' not in request.files:
            return jsonify({'error': 'No se envió ninguna imagen'}), 400
        
        avatar = request.files['avatar']
        if avatar.filename == '':
            return jsonify({'error': 'No se seleccionó ningún archivo'}), 400
        
        # Verificar tipo de archivo
        allowed_types = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp']
        if avatar.mimetype not in allowed_types:
            return jsonify({'error': 'Formato no permitido. Use JPG, PNG o WEBP'}), 400
        
        # Verificar tamaño (max 2MB)
        avatar.seek(0, 2)
        file_size = avatar.tell()
        avatar.seek(0)
        
        if file_size > 2 * 1024 * 1024:
            return jsonify({'error': 'La imagen no debe superar los 2MB'}), 400
        
        # Obtener nombre del usuario
        usuario_result = supabase.table('usuario') \
            .select('nombre') \
            .eq('id', usuario_id) \
            .execute()
        
        nombre_usuario = usuario_result.data[0]['nombre'] if usuario_result.data else 'Usuario'
        
        if not CLOUDINARY_CONFIGURED:
            # Si no hay Cloudinary, usar avatar por defecto
            avatar_url = f"https://ui-avatars.com/api/?background=C1121F&color=fff&name={nombre_usuario}"
        else:
            # Subir a Cloudinary con optimización
            resultado = cloudinary.uploader.upload(
                avatar,
                folder="avatars/tecnicos",
                transformation=[
                    {'width': 200, 'height': 200, 'crop': 'fill', 'quality': 'auto'},
                    {'fetch_format': 'auto'}
                ],
                quality='auto'
            )
            avatar_url = resultado['secure_url']
        
        # Actualizar en BD
        supabase.table('usuario') \
            .update({'avatar_url': avatar_url}) \
            .eq('id', usuario_id) \
            .execute()
        
        return jsonify({
            'success': True,
            'avatar_url': avatar_url,
            'message': 'Avatar actualizado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error actualizando avatar: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: CAMBIAR CONTRASEÑA
# =====================================================
@tecnico_mecanico_perfil_bp.route('/api/perfil/password', methods=['PUT'])
@tecnico_required
def cambiar_password(current_user):
    try:
        data = request.get_json()
        usuario_id = current_user.get('id')
        
        if not usuario_id:
            return jsonify({'error': 'ID de usuario no encontrado'}), 400
        
        password_actual = data.get('password_actual')
        nueva_password = data.get('nueva_password')
        
        if not password_actual or not nueva_password:
            return jsonify({'error': 'Todos los campos son requeridos'}), 400
        
        if len(nueva_password) < 6:
            return jsonify({'error': 'La nueva contraseña debe tener al menos 6 caracteres'}), 400
        
        # Obtener contraseña actual del usuario
        usuario_result = supabase.table('usuario') \
            .select('contrasenia') \
            .eq('id', usuario_id) \
            .execute()
        
        if not usuario_result.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        contrasenia_hash = usuario_result.data[0]['contrasenia']
        
        # Verificar contraseña actual
        if not check_password_hash(contrasenia_hash, password_actual):
            return jsonify({'error': 'Contraseña actual incorrecta'}), 401
        
        # Generar nuevo hash
        nuevo_hash = generate_password_hash(nueva_password)
        
        # Actualizar contraseña
        supabase.table('usuario') \
            .update({'contrasenia': nuevo_hash}) \
            .eq('id', usuario_id) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Contraseña cambiada correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error cambiando contraseña: {str(e)}")
        return jsonify({'error': str(e)}), 500