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

# Crear el blueprint
admin_roles_bp = Blueprint('admin_roles', __name__, url_prefix='/api/admin')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# Roles de personal
ROLES_PERSONAL = [1, 2, 3, 4]

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN
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
            
            # Verificar si es JEFE TALLER
            roles = current_user.get('roles', [])
            es_jefe_taller = 'jefe_taller' in roles
            
            if not es_jefe_taller:
                rol_antiguo = current_user.get('rol')
                id_rol_antiguo = current_user.get('id_rol')
                es_jefe_taller = (rol_antiguo == 'jefe_taller') or (id_rol_antiguo == 2)
            
            if not es_jefe_taller:
                return jsonify({'error': 'No autorizado'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        
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
        result = supabase.table('rol') \
            .select('id, nombre_rol, descripcion') \
            .in_('id', ROLES_PERSONAL) \
            .execute()
        
        roles = result.data if result.data else []
        
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
            .in_('id_rol', ROLES_PERSONAL) \
            .execute()
        
        if not usuarios_con_roles.data:
            return jsonify({'success': True, 'usuarios': []}), 200
        
        usuarios_ids = list(set([ur['id_usuario'] for ur in usuarios_con_roles.data]))
        
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
            .in_('id_rol', ROLES_PERSONAL) \
            .execute()
        
        # Mapa de roles por usuario
        roles_por_usuario = {}
        for ur in (usuarios_roles.data or []):
            usuario_id = ur['id_usuario']
            if usuario_id not in roles_por_usuario:
                roles_por_usuario[usuario_id] = []
            roles_por_usuario[usuario_id].append(ur['id_rol'])
        
        # Obtener nombres de roles
        roles_result = supabase.table('rol') \
            .select('id, nombre_rol') \
            .in_('id', ROLES_PERSONAL) \
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
            .in_('id_rol', ROLES_PERSONAL) \
            .execute()
        
        # Insertar nuevos roles
        for rol_id in roles_ids:
            supabase.table('usuario_rol').insert({
                'id_usuario': id_usuario,
                'id_rol': rol_id,
                'fecha_asignacion': datetime.datetime.now().isoformat(),
                'asignado_por': current_user['id']
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
        # Total de usuarios con roles de personal
        usuarios_personal = supabase.table('usuario_rol') \
            .select('id_usuario', count='exact') \
            .in_('id_rol', ROLES_PERSONAL) \
            .execute()
        
        usuarios_ids = set()
        for ur in (usuarios_personal.data or []):
            usuarios_ids.add(ur['id_usuario'])
        total_personal = len(usuarios_ids)
        
        # Usuarios por rol
        roles = supabase.table('rol') \
            .select('id, nombre_rol') \
            .in_('id', ROLES_PERSONAL) \
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
            .in_('id_rol', ROLES_PERSONAL) \
            .execute()
        
        roles = []
        for item in (roles_result.data or []):
            if item.get('rol') and item['rol'].get('nombre_rol'):
                roles.append(item['rol']['nombre_rol'])
        
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
        usuario = supabase.table('usuario').select('id, nombre').eq('id', id_usuario).execute()
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        if id_usuario == current_user['id']:
            return jsonify({'error': 'No puedes eliminarte a ti mismo'}), 400
        
        # Eliminar asignaciones de roles
        supabase.table('usuario_rol').delete().eq('id_usuario', id_usuario).execute()
        
        # Eliminar usuario
        supabase.table('usuario').delete().eq('id', id_usuario).execute()
        
        return jsonify({
            'success': True,
            'message': f'Usuario {usuario.data[0]["nombre"]} eliminado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error eliminando usuario: {str(e)}")
        return jsonify({'error': str(e)}), 500