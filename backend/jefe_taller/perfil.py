# =====================================================
# PERFIL - JEFE TALLER (CON CLOUDINARY)
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
from decorators import jefe_taller_required
import jwt
import datetime
import logging
from werkzeug.security import check_password_hash, generate_password_hash
import base64
import io
import os

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
perfil_bp = Blueprint('perfil', __name__, url_prefix='/api/jefe-taller')

# Configuración
SECRET_KEY = config.SECRET_KEY
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
# FUNCIONES AUXILIARES
# =====================================================

def obtener_roles_usuario(usuario_id):
    """Obtener todos los roles de un usuario"""
    try:
        result = supabase.rpc('usuario_obtener_roles', {
            'p_usuario_id': usuario_id
        }).execute()
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Error obteniendo roles: {e}")
        return []

def verificar_rol_usuario(usuario_id, rol_nombre):
    """Verificar si un usuario tiene un rol específico"""
    try:
        result = supabase.rpc('usuario_tiene_rol', {
            'p_usuario_id': usuario_id,
            'p_rol_nombre': rol_nombre
        }).execute()
        return result.data if result.data else False
    except Exception as e:
        logger.error(f"Error verificando rol: {e}")
        return False


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
        
        # Limpiar base64
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
# ENDPOINTS - PERFIL
# =====================================================

@perfil_bp.route('/perfil', methods=['GET'])
@jefe_taller_required
def obtener_perfil(current_user):
    """Obtener datos del perfil del usuario (incluyendo roles)"""
    try:
        user_id = current_user['id']
        
        resultado = supabase.table('usuario') \
            .select('id, nombre, email, contacto, ubicacion, avatar_url, fecha_registro') \
            .eq('id', user_id) \
            .execute()
        
        if not resultado.data or len(resultado.data) == 0:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        usuario = resultado.data[0]
        
        # Obtener los roles del usuario usando la función SQL
        roles = obtener_roles_usuario(user_id)
        
        # También podemos verificar si tiene rol específico si es necesario
        es_jefe_taller = verificar_rol_usuario(user_id, 'jefe_taller')
        
        # Agregar roles a la respuesta
        usuario['roles'] = roles
        usuario['es_jefe_taller'] = es_jefe_taller
        
        return jsonify({'success': True, 'usuario': usuario}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@perfil_bp.route('/perfil', methods=['PUT'])
@jefe_taller_required
def actualizar_perfil(current_user):
    """Actualizar datos del perfil"""
    try:
        data = request.get_json()
        user_id = current_user['id']
        
        update_data = {}
        
        if 'nombre' in data:
            update_data['nombre'] = data['nombre']
        if 'email' in data:
            update_data['email'] = data['email']
        if 'contacto' in data:
            update_data['contacto'] = data['contacto']
        if 'ubicacion' in data:
            update_data['ubicacion'] = data['ubicacion']
        if 'avatar_url' in data and data['avatar_url']:
            update_data['avatar_url'] = data['avatar_url']
        
        if not update_data:
            return jsonify({'error': 'No hay datos para actualizar'}), 400
        
        resultado = supabase.table('usuario') \
            .update(update_data) \
            .eq('id', user_id) \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Error al actualizar perfil'}), 500
        
        logger.info(f"Perfil actualizado para usuario {user_id}")
        
        return jsonify({'success': True, 'message': 'Perfil actualizado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_bp.route('/perfil/avatar', methods=['POST'])
@jefe_taller_required
def actualizar_avatar(current_user):
    """Actualizar foto de perfil con Cloudinary"""
    try:
        data = request.get_json()
        avatar_base64 = data.get('avatar')
        
        if not avatar_base64:
            return jsonify({'error': 'Imagen no proporcionada'}), 400
        
        # Subir a Cloudinary o guardar localmente
        avatar_url = subir_imagen_a_cloudinary(avatar_base64, 'avatars', f'jefe_taller_{current_user["id"]}')
        
        if not avatar_url:
            return jsonify({'error': 'Error al subir imagen'}), 500
        
        # Verificar si la columna avatar_url existe
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
        
        logger.info(f"Avatar actualizado para usuario {current_user['id']}: {avatar_url}")
        
        return jsonify({'success': True, 'avatar_url': avatar_url}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando avatar: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_bp.route('/perfil/cambiar-password', methods=['POST'])
@jefe_taller_required
def cambiar_password(current_user):
    """Cambiar contraseña del usuario"""
    try:
        data = request.get_json()
        user_id = current_user['id']
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        if not current_password or not new_password:
            return jsonify({'error': 'Contraseña actual y nueva son requeridas'}), 400
        
        # Validar requisitos de contraseña
        if len(new_password) < 6:
            return jsonify({'error': 'La nueva contraseña debe tener al menos 6 caracteres'}), 400
        
        # Obtener usuario actual
        resultado = supabase.table('usuario') \
            .select('contrasenia') \
            .eq('id', user_id) \
            .execute()
        
        if not resultado.data or len(resultado.data) == 0:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        # Verificar contraseña actual
        if not check_password_hash(resultado.data[0]['contrasenia'], current_password):
            return jsonify({'error': 'Contraseña actual incorrecta'}), 401
        
        # Actualizar contraseña
        nueva_contrasenia_hash = generate_password_hash(new_password)
        
        supabase.table('usuario') \
            .update({'contrasenia': nueva_contrasenia_hash}) \
            .eq('id', user_id) \
            .execute()
        
        logger.info(f"Contraseña actualizada para usuario {user_id}")
        
        return jsonify({'success': True, 'message': 'Contraseña actualizada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error cambiando contraseña: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_bp.route('/perfil/estadisticas', methods=['GET'])
@jefe_taller_required
def obtener_estadisticas(current_user):
    """Obtener estadísticas personales del usuario"""
    try:
        user_id = current_user['id']
        
        # Contar órdenes atendidas (como jefe de taller - órdenes donde participó)
        # Nota: Esto usa id_jefe_operativo, no id_jefe_taller
        ordenes = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .eq('id_jefe_operativo', user_id) \
            .execute()
        
        ordenes_count = ordenes.count if ordenes.count else 0
        
        # Contar diagnósticos revisados (observaciones hechas por este jefe de taller)
        diagnosticos = supabase.table('observaciondiagnostico') \
            .select('id', count='exact') \
            .eq('id_jefe_taller', user_id) \
            .execute()
        
        diagnosticos_count = diagnosticos.count if diagnosticos.count else 0
        
        # Obtener fecha de registro
        usuario = supabase.table('usuario') \
            .select('fecha_registro') \
            .eq('id', user_id) \
            .single() \
            .execute()
        
        fecha_registro = usuario.data.get('fecha_registro') if usuario.data else None
        miembro_desde = datetime.datetime.fromisoformat(fecha_registro).strftime('%b %Y') if fecha_registro else '-'
        
        # Obtener roles del usuario para mostrar en estadísticas
        roles = obtener_roles_usuario(user_id)
        roles_nombres = [rol.get('nombre_rol') if isinstance(rol, dict) else rol for rol in roles]
        
        return jsonify({
            'success': True,
            'estadisticas': {
                'ordenes_atendidas': ordenes_count,
                'diagnosticos_revisados': diagnosticos_count,
                'miembro_desde': miembro_desde,
                'ultimo_acceso': datetime.datetime.now().strftime('%d/%m/%Y %H:%M'),
                'roles': roles_nombres
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT ADICIONAL: OBTENER ROLES DEL USUARIO
# =====================================================

@perfil_bp.route('/perfil/roles', methods=['GET'])
@jefe_taller_required
def obtener_mis_roles(current_user):
    """Obtener todos los roles del usuario actual"""
    try:
        user_id = current_user['id']
        roles = obtener_roles_usuario(user_id)
        
        return jsonify({
            'success': True,
            'roles': roles,
            'tiene_rol_jefe_taller': verificar_rol_usuario(user_id, 'jefe_taller'),
            'tiene_rol_jefe_operativo': verificar_rol_usuario(user_id, 'jefe_operativo'),
            'tiene_rol_tecnico': verificar_rol_usuario(user_id, 'tecnico'),
            'tiene_rol_encargado_repuestos': verificar_rol_usuario(user_id, 'encargado_repuestos')
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return jsonify({'error': str(e)}), 500