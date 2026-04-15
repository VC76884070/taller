# =====================================================
# ADMINISTRACIÓN DE ROLES - JEFE DE TALLER
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging

logger = logging.getLogger(__name__)

admin_roles_bp = Blueprint('admin_roles', __name__, url_prefix='/api/admin')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIÓN PARA OBTENER ROLES DEL USUARIO
# =====================================================

def obtener_roles_usuario_desde_bd(id_usuario):
    """Obtener roles del usuario directamente desde la BD"""
    try:
        result = supabase.rpc('usuario_obtener_nombres_roles', {'p_usuario_id': id_usuario}).execute()
        if result.data and isinstance(result.data, list):
            return result.data
        return []
    except Exception as e:
        logger.error(f"Error obteniendo roles desde BD: {e}")
        # Fallback: consulta directa
        try:
            result = supabase.table('usuario_rol') \
                .select('rol(nombre_rol)') \
                .eq('id_usuario', id_usuario) \
                .execute()
            if result.data:
                roles = []
                for item in result.data:
                    if item.get('rol') and item['rol'].get('nombre_rol'):
                        roles.append(item['rol']['nombre_rol'])
                return roles
        except Exception as e2:
            logger.error(f"Error en fallback: {e2}")
        return []

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL (JEFE TALLER)
# =====================================================

def admin_required(f):
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
            current_user = data.get('user', {})
            
            logger.info(f"🔐 Verificando permisos - Usuario: {current_user.get('nombre')}")
            logger.info(f"Roles en token: {current_user.get('roles', [])}")
            
            # Obtener roles del token
            roles = current_user.get('roles', [])
            
            # Si no hay roles en el token, obtenerlos de la BD
            if not roles and current_user.get('id'):
                roles = obtener_roles_usuario_desde_bd(current_user['id'])
                logger.info(f"Roles obtenidos desde BD: {roles}")
            
            # Verificar si es JEFE TALLER (permisos para asignar roles)
            es_jefe_taller = 'jefe_taller' in roles
            
            # Compatibilidad con sistema antiguo
            if not es_jefe_taller:
                rol_antiguo = current_user.get('rol')
                id_rol_antiguo = current_user.get('id_rol')
                es_jefe_taller = (rol_antiguo == 'jefe_taller') or (id_rol_antiguo == 2)
            
            if not es_jefe_taller:
                logger.warning(f"❌ Usuario {current_user.get('nombre')} (ID: {current_user.get('id')}) no tiene permisos de Jefe Taller. Roles: {roles}")
                return jsonify({'error': 'No autorizado. Se requieren permisos de Jefe de Taller.'}), 403
            
            logger.info(f"✅ Jefe Taller autorizado: {current_user.get('nombre')}")
                
        except jwt.ExpiredSignatureError:
            logger.warning("Token expirado")
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            logger.error(f"Error en verificación: {str(e)}")
            return jsonify({'error': 'Error de autenticación'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_roles_usuario(id_usuario):
    """Obtener todos los roles de un usuario (para mostrar en UI)"""
    try:
        result = supabase.rpc('usuario_obtener_roles', {'p_usuario_id': id_usuario}).execute()
        
        if result.data:
            roles = []
            for item in result.data:
                if isinstance(item, dict):
                    rol = item.get('nombre_rol') or item.get('nombre')
                    if rol:
                        roles.append(rol)
                else:
                    roles.append(str(item))
            return roles
        return []
    except Exception as e:
        logger.error(f"Error obteniendo roles: {e}")
        return []

def obtener_todos_roles():
    """Obtener lista de todos los roles disponibles (solo los 5 roles)"""
    try:
        result = supabase.table('rol') \
            .select('id, nombre_rol, descripcion') \
            .in_('id', [1, 2, 3, 4, 5]) \
            .execute()
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Error obteniendo roles: {e}")
        return []

def obtener_usuarios_con_roles():
    """Obtener todos los usuarios con sus roles asignados"""
    try:
        # Obtener todos los usuarios
        usuarios = supabase.table('usuario') \
            .select('id, nombre, email, numero_documento, contacto, fecha_registro') \
            .execute()
        
        if not usuarios.data:
            return []
        
        # Obtener todos los roles asignados
        usuarios_roles = supabase.table('usuario_rol') \
            .select('id_usuario, id_rol') \
            .execute()
        
        # Crear mapa de roles por usuario
        roles_por_usuario = {}
        for ur in (usuarios_roles.data or []):
            usuario_id = ur['id_usuario']
            if usuario_id not in roles_por_usuario:
                roles_por_usuario[usuario_id] = []
            roles_por_usuario[usuario_id].append(ur['id_rol'])
        
        # Obtener nombres de roles
        todos_roles = obtener_todos_roles()
        roles_map = {r['id']: r['nombre_rol'] for r in todos_roles}
        
        # Combinar datos
        resultado = []
        for u in usuarios.data:
            roles_ids = roles_por_usuario.get(u['id'], [])
            resultado.append({
                'id': u['id'],
                'nombre': u['nombre'],
                'email': u.get('email', ''),
                'documento': u.get('numero_documento', ''),
                'contacto': u.get('contacto', ''),
                'fecha_registro': u.get('fecha_registro'),
                'roles_ids': roles_ids,
                'roles_nombres': [roles_map.get(rid, '') for rid in roles_ids if roles_map.get(rid)]
            })
        
        return resultado
    except Exception as e:
        logger.error(f"Error obteniendo usuarios con roles: {e}")
        return []

# =====================================================
# ENDPOINTS
# =====================================================

@admin_roles_bp.route('/roles', methods=['GET'])
@admin_required
def get_roles(current_user):
    """Obtener lista de todos los roles disponibles"""
    try:
        roles = obtener_todos_roles()
        return jsonify({
            'success': True,
            'roles': roles
        }), 200
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuarios', methods=['GET'])
@admin_required
def get_usuarios(current_user):
    """Obtener lista de todos los usuarios con sus roles"""
    try:
        usuarios = obtener_usuarios_con_roles()
        return jsonify({
            'success': True,
            'usuarios': usuarios
        }), 200
    except Exception as e:
        logger.error(f"Error obteniendo usuarios: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>/roles', methods=['GET'])
@admin_required
def get_usuario_roles(current_user, id_usuario):
    """Obtener roles de un usuario específico"""
    try:
        roles = obtener_roles_usuario(id_usuario)
        return jsonify({
            'success': True,
            'roles': roles
        }), 200
    except Exception as e:
        logger.error(f"Error obteniendo roles del usuario: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>/roles', methods=['PUT'])
@admin_required
def asignar_roles_usuario(current_user, id_usuario):
    """Asignar roles a un usuario (reemplaza todos los roles existentes)"""
    try:
        data = request.get_json()
        roles_ids = data.get('roles_ids', [])
        
        if not isinstance(roles_ids, list):
            return jsonify({'error': 'roles_ids debe ser una lista'}), 400
        
        # Verificar que el usuario existe
        usuario = supabase.table('usuario').select('id, nombre').eq('id', id_usuario).execute()
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        # Verificar que los roles existen (solo ids 1-5)
        roles_validos = obtener_todos_roles()
        roles_ids_validos = [r['id'] for r in roles_validos]
        
        for rol_id in roles_ids:
            if rol_id not in roles_ids_validos:
                return jsonify({'error': f'Rol con id {rol_id} no existe'}), 400
        
        # Eliminar roles existentes
        supabase.table('usuario_rol').delete().eq('id_usuario', id_usuario).execute()
        
        # Insertar nuevos roles
        if roles_ids:
            for rol_id in roles_ids:
                supabase.table('usuario_rol').insert({
                    'id_usuario': id_usuario,
                    'id_rol': rol_id,
                    'fecha_asignacion': datetime.datetime.now().isoformat(),
                    'asignado_por': current_user['id']
                }).execute()
        
        logger.info(f"Jefe Taller {current_user['nombre']} asignó roles {roles_ids} al usuario {usuario.data[0]['nombre']}")
        
        return jsonify({
            'success': True,
            'message': f'Roles asignados correctamente al usuario {usuario.data[0]["nombre"]}'
        }), 200
        
    except Exception as e:
        logger.error(f"Error asignando roles: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>/rol/<int:id_rol>', methods=['POST'])
@admin_required
def agregar_rol_usuario(current_user, id_usuario, id_rol):
    """Agregar un rol específico a un usuario (sin eliminar los existentes)"""
    try:
        # Verificar que el usuario existe
        usuario = supabase.table('usuario').select('id, nombre').eq('id', id_usuario).execute()
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        # Verificar que el rol existe (ids 1-5)
        rol = supabase.table('rol').select('id, nombre_rol').eq('id', id_rol).execute()
        if not rol.data:
            return jsonify({'error': 'Rol no encontrado'}), 404
        
        # Verificar si ya tiene el rol
        existing = supabase.table('usuario_rol') \
            .select('id') \
            .eq('id_usuario', id_usuario) \
            .eq('id_rol', id_rol) \
            .execute()
        
        if existing.data:
            return jsonify({'error': 'El usuario ya tiene este rol asignado'}), 400
        
        # Agregar rol
        supabase.table('usuario_rol').insert({
            'id_usuario': id_usuario,
            'id_rol': id_rol,
            'fecha_asignacion': datetime.datetime.now().isoformat(),
            'asignado_por': current_user['id']
        }).execute()
        
        logger.info(f"Jefe Taller {current_user['nombre']} agregó rol {rol.data[0]['nombre_rol']} al usuario {usuario.data[0]['nombre']}")
        
        return jsonify({
            'success': True,
            'message': f'Rol {rol.data[0]["nombre_rol"]} agregado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error agregando rol: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>/rol/<int:id_rol>', methods=['DELETE'])
@admin_required
def eliminar_rol_usuario(current_user, id_usuario, id_rol):
    """Eliminar un rol específico de un usuario"""
    try:
        # Verificar que el usuario existe
        usuario = supabase.table('usuario').select('id, nombre').eq('id', id_usuario).execute()
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        # Verificar que el rol existe
        rol = supabase.table('rol').select('id, nombre_rol').eq('id', id_rol).execute()
        if not rol.data:
            return jsonify({'error': 'Rol no encontrado'}), 404
        
        # Eliminar rol
        supabase.table('usuario_rol') \
            .delete() \
            .eq('id_usuario', id_usuario) \
            .eq('id_rol', id_rol) \
            .execute()
        
        logger.info(f"Jefe Taller {current_user['nombre']} eliminó rol {rol.data[0]['nombre_rol']} del usuario {usuario.data[0]['nombre']}")
        
        return jsonify({
            'success': True,
            'message': f'Rol {rol.data[0]["nombre_rol"]} eliminado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error eliminando rol: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/estadisticas', methods=['GET'])
@admin_required
def get_estadisticas(current_user):
    """Obtener estadísticas de roles"""
    try:
        # Total de usuarios
        total_usuarios = supabase.table('usuario').select('id', count='exact').execute()
        
        # Usuarios por rol (solo ids 1-5)
        roles = obtener_todos_roles()
        usuarios_por_rol = []
        
        for rol in roles:
            count = supabase.table('usuario_rol') \
                .select('id', count='exact') \
                .eq('id_rol', rol['id']) \
                .execute()
            usuarios_por_rol.append({
                'rol_id': rol['id'],
                'rol_nombre': rol['nombre_rol'],
                'cantidad': count.count if count.count else 0
            })
        
        return jsonify({
            'success': True,
            'estadisticas': {
                'total_usuarios': total_usuarios.count if total_usuarios.count else 0,
                'usuarios_por_rol': usuarios_por_rol
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500