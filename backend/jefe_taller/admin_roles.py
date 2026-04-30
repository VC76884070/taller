# =====================================================
# ADMINISTRACIÓN DE ROLES - JEFE DE TALLER (CORREGIDO)
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging

logger = logging.getLogger(__name__)

# Crear el blueprint
admin_roles_bp = Blueprint('admin_roles', __name__, url_prefix='/api/admin')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# Roles de personal (IDs de la tabla 'rol')
ROLES_PERSONAL = [1, 2, 3, 4]  # Ajusta según tu BD

# =====================================================
# DECORADOR PERSONALIZADO PARA ADMIN
# =====================================================

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Obtener token
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            # Decodificar token
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data.get('user', data)
            
            # Obtener roles del usuario
            usuario_id = current_user.get('id')
            if not usuario_id:
                return jsonify({'error': 'ID de usuario no encontrado'}), 401
            
            # Obtener roles desde la BD
            roles_result = supabase.table('usuario_rol') \
                .select('rol:rol!inner(nombre_rol)') \
                .eq('id_usuario', usuario_id) \
                .execute()
            
            user_roles = []
            if roles_result.data:
                for item in roles_result.data:
                    rol_obj = item.get('rol', {})
                    if isinstance(rol_obj, dict):
                        nombre_rol = rol_obj.get('nombre_rol', '')
                        if nombre_rol:
                            user_roles.append(nombre_rol.lower())
                    elif isinstance(rol_obj, list) and len(rol_obj) > 0:
                        nombre_rol = rol_obj[0].get('nombre_rol', '')
                        if nombre_rol:
                            user_roles.append(nombre_rol.lower())
            
            # Fallback a roles del token
            if not user_roles:
                user_roles = current_user.get('roles', [])
            
            # Verificar si es jefe_taller
            es_jefe_taller = 'jefe_taller' in user_roles
            
            # También verificar por ID de rol
            if not es_jefe_taller:
                id_rol = current_user.get('id_rol')
                if id_rol == 2:  # ID 2 = jefe_taller
                    es_jefe_taller = True
            
            if not es_jefe_taller:
                logger.warning(f"Acceso denegado: Usuario {usuario_id} no es jefe_taller")
                return jsonify({'error': 'No autorizado. Se requiere rol jefe_taller'}), 403
            
            # Agregar usuario a la función
            if 'user' in data:
                data['user']['roles'] = user_roles
            else:
                data['roles'] = user_roles
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            logger.error(f"Error en autenticación: {str(e)}")
            return jsonify({'error': 'Error de autenticación'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

# =====================================================
# ENDPOINTS PRINCIPALES
# =====================================================

@admin_roles_bp.route('/roles', methods=['GET'])
@admin_required
def get_roles(current_user):
    """Obtener lista de roles (solo personal)"""
    try:
        # Obtener todos los roles
        result = supabase.table('rol') \
            .select('id, nombre_rol, descripcion') \
            .execute()
        
        if not result.data:
            return jsonify({'success': True, 'roles': []}), 200
        
        # Filtrar roles de personal (excluir cliente)
        roles = [r for r in result.data if r['id'] != 5]  # Asumiendo que id=5 es cliente
        
        # Log para depuración
        logger.info(f"Roles encontrados: {len(roles)} roles de personal")
        
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
    """Obtener lista de usuarios con roles de personal"""
    try:
        # Obtener usuarios que tienen roles de personal
        usuarios_con_roles = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .execute()
        
        if not usuarios_con_roles.data:
            return jsonify({'success': True, 'usuarios': []}), 200
        
        # Obtener IDs únicos de usuarios
        usuarios_ids = list(set([ur['id_usuario'] for ur in usuarios_con_roles.data]))
        
        if not usuarios_ids:
            return jsonify({'success': True, 'usuarios': []}), 200
        
        # Obtener datos de usuarios
        usuarios = supabase.table('usuario') \
            .select('id, nombre, email, numero_documento, contacto, fecha_registro') \
            .in_('id', usuarios_ids) \
            .execute()
        
        if not usuarios.data:
            return jsonify({'success': True, 'usuarios': []}), 200
        
        # Obtener roles de cada usuario
        usuarios_roles = supabase.table('usuario_rol') \
            .select('id_usuario, id_rol') \
            .in_('id_usuario', usuarios_ids) \
            .execute()
        
        # Mapa de roles por usuario
        roles_por_usuario = {}
        
        # Primero, obtener la relación usuario-rol
        for ur in (usuarios_roles.data or []):
            usuario_id = ur['id_usuario']
            if usuario_id not in roles_por_usuario:
                roles_por_usuario[usuario_id] = []
            roles_por_usuario[usuario_id].append(ur['id_rol'])
        
        # Obtener nombres de roles
        roles_result = supabase.table('rol') \
            .select('id, nombre_rol') \
            .execute()
        
        roles_map = {r['id']: r['nombre_rol'] for r in (roles_result.data or [])}
        
        # Construir resultado
        resultado = []
        for u in usuarios.data:
            roles_ids = roles_por_usuario.get(u['id'], [])
            roles_nombres = [roles_map.get(rid, '') for rid in roles_ids]
            
            resultado.append({
                'id': u['id'],
                'nombre': u['nombre'],
                'email': u.get('email', ''),
                'documento': u.get('numero_documento', ''),
                'contacto': u.get('contacto', ''),
                'fecha_registro': u.get('fecha_registro'),
                'roles_ids': roles_ids,
                'roles_nombres': roles_nombres
            })
        
        return jsonify({'success': True, 'usuarios': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo usuarios: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_roles_bp.route('/usuario/<int:id_usuario>/roles', methods=['PUT'])
@admin_required
def asignar_roles_usuario(current_user, id_usuario):
    """Asignar roles a un usuario"""
    try:
        data = request.get_json()
        roles_ids = data.get('roles_ids', [])
        
        # Verificar roles válidos
        for rol_id in roles_ids:
            if rol_id not in ROLES_PERSONAL:
                return jsonify({'error': f'Rol {rol_id} no permitido'}), 400
        
        # Eliminar roles existentes
        supabase.table('usuario_rol').delete() \
            .eq('id_usuario', id_usuario) \
            .execute()
        
        # Insertar nuevos roles
        for rol_id in roles_ids:
            supabase.table('usuario_rol').insert({
                'id_usuario': id_usuario,
                'id_rol': rol_id,
                'fecha_asignacion': datetime.datetime.now().isoformat()
            }).execute()
        
        return jsonify({'success': True, 'message': 'Roles asignados correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando roles: {str(e)}")
        return jsonify({'error': str(e)}), 500

@admin_roles_bp.route('/estadisticas', methods=['GET'])
@admin_required
def get_estadisticas(current_user):
    """Obtener estadísticas de roles"""
    try:
        # Total de usuarios con roles activos
        usuarios_personal = supabase.table('usuario_rol') \
            .select('id_usuario', count='exact') \
            .execute()
        
        usuarios_ids = set()
        for ur in (usuarios_personal.data or []):
            usuarios_ids.add(ur['id_usuario'])
        total_personal = len(usuarios_ids)
        
        # Usuarios por rol
        roles = supabase.table('rol') \
            .select('id, nombre_rol') \
            .execute()
        
        usuarios_por_rol = []
        for rol in (roles.data or []):
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
                'total_usuarios': total_personal,
                'usuarios_por_rol': usuarios_por_rol
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# OBTENER DETALLE DE USUARIO
# =====================================================

@admin_roles_bp.route('/usuario/<int:id_usuario>', methods=['GET'])
@admin_required
def get_usuario_detalle(current_user, id_usuario):
    """Obtener detalle completo de un usuario"""
    try:
        usuario = supabase.table('usuario') \
            .select('id, nombre, email, numero_documento, contacto, ubicacion, fecha_registro') \
            .eq('id', id_usuario) \
            .execute()
        
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        u = usuario.data[0]
        
        # Obtener roles del usuario
        roles_result = supabase.table('usuario_rol') \
            .select('id_rol, rol(nombre_rol)') \
            .eq('id_usuario', id_usuario) \
            .execute()
        
        roles = []
        for item in (roles_result.data or []):
            if item.get('rol') and isinstance(item['rol'], dict):
                nombre_rol = item['rol'].get('nombre_rol')
                if nombre_rol:
                    roles.append(nombre_rol)
            elif item.get('rol') and isinstance(item['rol'], list) and len(item['rol']) > 0:
                nombre_rol = item['rol'][0].get('nombre_rol')
                if nombre_rol:
                    roles.append(nombre_rol)
        
        return jsonify({
            'success': True,
            'usuario': {
                'id': u['id'],
                'nombre': u['nombre'],
                'email': u.get('email', ''),
                'documento': u.get('numero_documento', ''),
                'contacto': u.get('contacto', ''),
                'ubicacion': u.get('ubicacion', ''),
                'fecha_registro': u.get('fecha_registro'),
                'roles': roles
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ELIMINAR USUARIO
# =====================================================

@admin_roles_bp.route('/usuario/<int:id_usuario>', methods=['DELETE'])
@admin_required
def eliminar_usuario(current_user, id_usuario):
    """Eliminar un usuario del sistema"""
    try:
        # Verificar si el usuario existe
        usuario = supabase.table('usuario') \
            .select('id, nombre') \
            .eq('id', id_usuario) \
            .execute()
        
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        # No permitir eliminar a sí mismo
        if id_usuario == current_user.get('id'):
            return jsonify({'error': 'No puedes eliminarte a ti mismo'}), 400
        
        # Eliminar asignaciones de roles
        supabase.table('usuario_rol').delete() \
            .eq('id_usuario', id_usuario) \
            .execute()
        
        # Eliminar usuario
        supabase.table('usuario').delete() \
            .eq('id', id_usuario) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': f'Usuario {usuario.data[0]["nombre"]} eliminado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error eliminando usuario: {str(e)}")
        return jsonify({'error': str(e)}), 500