from flask import Blueprint, request, jsonify
from config import config
import datetime
import logging
from werkzeug.security import check_password_hash, generate_password_hash
import base64
import io
import os

# Importar decorador desde decorators.py
from decorators import jefe_operativo_required

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_operativo_perfil_bp = Blueprint('jefe_operativo_perfil', __name__, url_prefix='/api/jefe-operativo')

# Configuración
supabase = config.supabase

# =====================================================
# CONFIGURACIÓN DE CLOUDINARY
# =====================================================
CLOUDINARY_CONFIGURED = False
try:
    if hasattr(config, 'CLOUDINARY_CLOUD_NAME') and config.CLOUDINARY_CLOUD_NAME:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=config.CLOUDINARY_CLOUD_NAME,
            api_key=config.CLOUDINARY_API_KEY,
            api_secret=config.CLOUDINARY_API_SECRET,
            secure=True
        )
        CLOUDINARY_CONFIGURED = True
        logger.info(f"✅ Cloudinary configurado correctamente: {config.CLOUDINARY_CLOUD_NAME}")
    else:
        logger.warning("⚠️ Cloudinary no configurado")
except Exception as e:
    logger.error(f"❌ Error configurando Cloudinary: {str(e)}")


# =====================================================
# FUNCIONES AUXILIARES PARA CLOUDINARY
# =====================================================
def subir_imagen_a_cloudinary(base64_data, carpeta, nombre):
    """Subir imagen a Cloudinary y retornar URL"""
    try:
        if not base64_data:
            return None
            
        if not CLOUDINARY_CONFIGURED:
            logger.warning("Cloudinary no configurado, usando almacenamiento local")
            return guardar_imagen_local(base64_data, carpeta, nombre)
        
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_data = base64.b64decode(base64_data)
        image_file = io.BytesIO(image_data)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S%f')
        image_file.name = f"{nombre}_{timestamp}.jpg"
        
        resultado = cloudinary.uploader.upload(
            image_file,
            folder=f"furia_motor/{carpeta}",
            public_id=f"{nombre}_{timestamp}",
            resource_type="image"
        )
        
        url = resultado.get('secure_url')
        logger.info(f"✅ Imagen subida a Cloudinary: {url}")
        return url
        
    except Exception as e:
        logger.error(f"Error subiendo imagen a Cloudinary: {str(e)}")
        return guardar_imagen_local(base64_data, carpeta, nombre)


def guardar_imagen_local(base64_data, carpeta, nombre):
    """Guardar imagen localmente cuando Cloudinary no está disponible"""
    try:
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_data = base64.b64decode(base64_data)
        
        upload_dir = os.path.join('uploads', carpeta)
        os.makedirs(upload_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{nombre}_{timestamp}.jpg"
        filepath = os.path.join(upload_dir, filename)
        
        with open(filepath, 'wb') as f:
            f.write(image_data)
        
        logger.info(f"✅ Imagen guardada localmente: {filepath}")
        return f"/uploads/{carpeta}/{filename}"
        
    except Exception as e:
        logger.error(f"Error guardando imagen local: {e}")
        return None


# =====================================================
# ENDPOINTS DE PERFIL
# =====================================================

@jefe_operativo_perfil_bp.route('/perfil/<int:id_usuario>', methods=['GET'])
@jefe_operativo_required
def obtener_perfil(current_user, id_usuario):
    """Obtener datos del perfil del usuario"""
    try:
        # Verificar que el usuario solicita su propio perfil
        if current_user['id'] != id_usuario:
            return jsonify({'error': 'No autorizado'}), 403
        
        # Obtener datos del usuario
        resultado = supabase.table('usuario') \
            .select('id, nombre, contacto, email, ubicacion, fecha_registro') \
            .eq('id', id_usuario) \
            .execute()
        
        if not resultado.data or len(resultado.data) == 0:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        usuario = resultado.data[0]
        
        # Obtener avatar_url si existe la columna
        avatar_url = None
        try:
            avatar_result = supabase.table('usuario') \
                .select('avatar_url') \
                .eq('id', id_usuario) \
                .execute()
            if avatar_result.data and len(avatar_result.data) > 0:
                avatar_url = avatar_result.data[0].get('avatar_url')
        except Exception as e:
            logger.warning(f"No se pudo obtener avatar_url: {str(e)}")
        
        return jsonify({
            'success': True,
            'data': {
                'id': usuario['id'],
                'nombre': usuario['nombre'],
                'contacto': usuario.get('contacto', ''),
                'email': usuario.get('email', ''),
                'ubicacion': usuario.get('ubicacion', ''),
                'fecha_registro': usuario.get('fecha_registro'),
                'avatar_url': avatar_url
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_perfil_bp.route('/perfil/actualizar', methods=['PUT'])
@jefe_operativo_required
def actualizar_perfil(current_user):
    """Actualizar datos del perfil"""
    try:
        data = request.get_json()
        
        update_data = {}
        if 'nombre' in data:
            update_data['nombre'] = data['nombre']
        if 'contacto' in data:
            update_data['contacto'] = data['contacto']
        if 'email' in data:
            update_data['email'] = data['email']
        if 'ubicacion' in data:
            update_data['ubicacion'] = data['ubicacion']
        
        if not update_data:
            return jsonify({'error': 'No hay datos para actualizar'}), 400
        
        resultado = supabase.table('usuario') \
            .update(update_data) \
            .eq('id', current_user['id']) \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Error al actualizar perfil'}), 500
        
        return jsonify({'success': True, 'message': 'Perfil actualizado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_perfil_bp.route('/perfil/avatar', methods=['POST'])
@jefe_operativo_required
def actualizar_avatar(current_user):
    """Actualizar foto de perfil"""
    try:
        data = request.get_json()
        avatar_base64 = data.get('avatar')
        
        if not avatar_base64:
            return jsonify({'error': 'Imagen no proporcionada'}), 400
        
        avatar_url = subir_imagen_a_cloudinary(avatar_base64, 'avatars', f'user_{current_user["id"]}')
        
        if not avatar_url:
            return jsonify({'error': 'Error al subir imagen'}), 500
        
        try:
            resultado = supabase.table('usuario') \
                .update({'avatar_url': avatar_url}) \
                .eq('id', current_user['id']) \
                .execute()
            
            if not resultado.data:
                return jsonify({'error': 'Error al actualizar avatar'}), 500
                
        except Exception as e:
            logger.error(f"Error actualizando avatar: {str(e)}")
            return jsonify({'error': 'La tabla usuario no tiene campo avatar_url. Contacte al administrador.'}), 500
        
        return jsonify({'success': True, 'avatar_url': avatar_url}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando avatar: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_perfil_bp.route('/perfil/cambiar-contrasena', methods=['POST'])
@jefe_operativo_required
def cambiar_contrasena(current_user):
    """Cambiar contraseña del usuario"""
    try:
        data = request.get_json()
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        if not current_password or not new_password:
            return jsonify({'error': 'Contraseña actual y nueva son requeridas'}), 400
        
        if len(new_password) < 8:
            return jsonify({'error': 'La contraseña debe tener al menos 8 caracteres'}), 400
        if not any(c.isupper() for c in new_password):
            return jsonify({'error': 'La contraseña debe tener al menos una mayúscula'}), 400
        if not any(c.islower() for c in new_password):
            return jsonify({'error': 'La contraseña debe tener al menos una minúscula'}), 400
        if not any(c.isdigit() for c in new_password):
            return jsonify({'error': 'La contraseña debe tener al menos un número'}), 400
        
        resultado = supabase.table('usuario') \
            .select('contrasenia') \
            .eq('id', current_user['id']) \
            .execute()
        
        if not resultado.data or len(resultado.data) == 0:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        if not check_password_hash(resultado.data[0]['contrasenia'], current_password):
            return jsonify({'error': 'Contraseña actual incorrecta'}), 401
        
        nueva_contrasenia_hash = generate_password_hash(new_password)
        
        supabase.table('usuario') \
            .update({'contrasenia': nueva_contrasenia_hash}) \
            .eq('id', current_user['id']) \
            .execute()
        
        logger.info(f"Contraseña actualizada para usuario {current_user['id']}")
        
        return jsonify({'success': True, 'message': 'Contraseña actualizada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error cambiando contraseña: {str(e)}")
        return jsonify({'error': str(e)}), 500