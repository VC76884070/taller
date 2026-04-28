# =====================================================
# DECORADORES DE AUTENTICACIÓN Y ROLES - FURIA MOTOR
# VERSIÓN CORREGIDA - CON SOPORTE PARA CLIENTES
# =====================================================

from functools import wraps
from flask import request, jsonify
from config import config
import jwt
import logging
import time

logger = logging.getLogger(__name__)
supabase = config.supabase

# Cache simple para roles (reduce consultas a BD)
_roles_cache = {}
_CACHE_TTL = 60  # segundos

def obtener_roles_usuario(usuario_id):
    """Obtener roles de usuario con caché simple"""
    # Verificar caché
    if usuario_id in _roles_cache:
        cached_data, timestamp = _roles_cache[usuario_id]
        if time.time() - timestamp < _CACHE_TTL:
            return cached_data
    
    roles = []
    try:
        # Consultar roles desde usuario_rol
        roles_result = supabase.table('usuario_rol') \
            .select('rol:rol!inner(nombre_rol)') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if roles_result.data:
            for item in roles_result.data:
                rol_obj = item.get('rol', {})
                if isinstance(rol_obj, dict):
                    nombre = rol_obj.get('nombre_rol')
                    if nombre:
                        # Normalizar nombres de roles
                        rol_normalizado = normalizar_nombre_rol(nombre)
                        if rol_normalizado:
                            roles.append(rol_normalizado)
                elif isinstance(rol_obj, list) and len(rol_obj) > 0:
                    nombre = rol_obj[0].get('nombre_rol')
                    if nombre:
                        rol_normalizado = normalizar_nombre_rol(nombre)
                        if rol_normalizado:
                            roles.append(rol_normalizado)
    except Exception as e:
        logger.debug(f"Error consultando roles: {e}")
    
    # Guardar en caché
    _roles_cache[usuario_id] = (roles, time.time())
    
    return roles

def normalizar_nombre_rol(nombre):
    """Normalizar nombres de roles para que coincidan con el frontend"""
    nombre_lower = nombre.lower()
    
    mapping = {
        'jefe_taller': 'jefe_taller',
        'jefe_operativo': 'jefe_operativo',
        'tecnico_mecanico': 'tecnico',
        'tecnico': 'tecnico',
        'encargado_repuestos': 'encargado_repuestos',
        'cliente': 'cliente',
        'admin': 'admin',
        'administrador': 'admin'
    }
    
    return mapping.get(nombre_lower)

def verificar_rol(roles_permitidos):
    """Decorador para verificar que el usuario tenga al menos uno de los roles permitidos"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = None
            
            # Obtener token del header Authorization
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
                data = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
                
                # El token puede tener la estructura {'user': {...}} o ser directamente el usuario
                if 'user' in data:
                    current_user = data['user']
                else:
                    current_user = data
                
                # Verificar que el usuario tenga ID
                usuario_id = current_user.get('id')
                if not usuario_id:
                    logger.error("Usuario sin ID en token")
                    return jsonify({'error': 'Token inválido: ID de usuario no encontrado'}), 401
                
                # Obtener roles del usuario desde la base de datos (con caché)
                roles_usuario = obtener_roles_usuario(usuario_id)
                
                # Si no tiene roles en BD, usar los roles del token (fallback)
                if not roles_usuario:
                    roles_token = current_user.get('roles', [])
                    if roles_token:
                        roles_usuario = roles_token
                    else:
                        # Si es cliente sin roles, asignar rol cliente
                        if current_user.get('type') == 'client':
                            roles_usuario = ['cliente']
                
                # Verificar si tiene al menos un rol permitido
                tiene_rol = any(rol in roles_usuario for rol in roles_permitidos)
                
                if not tiene_rol:
                    logger.warning(f"Acceso denegado: Usuario {current_user.get('nombre')} (ID: {usuario_id}) - Roles: {roles_usuario} - Requeridos: {roles_permitidos}")
                    return jsonify({'error': f'No autorizado. Se requiere rol: {", ".join(roles_permitidos)}'}), 403
                    
            except jwt.ExpiredSignatureError:
                logger.warning("Token expirado")
                return jsonify({'error': 'Token expirado'}), 401
            except jwt.InvalidTokenError as e:
                logger.warning(f"Token inválido: {str(e)}")
                return jsonify({'error': 'Token inválido'}), 401
            except Exception as e:
                logger.error(f"Error en autenticación: {str(e)}")
                return jsonify({'error': 'Error de autenticación'}), 401
            
            # Pasar el usuario a la función
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator


# =====================================================
# DECORADORES ESPECÍFICOS POR ROL
# =====================================================

def jefe_taller_required(f):
    """Verifica que el usuario sea Jefe de Taller"""
    return verificar_rol(['jefe_taller'])(f)

def jefe_operativo_required(f):
    """Verifica que el usuario sea Jefe Operativo"""
    return verificar_rol(['jefe_operativo'])(f)

def tecnico_required(f):
    """Verifica que el usuario sea Técnico Mecánico"""
    return verificar_rol(['tecnico'])(f)

def encargado_repuestos_required(f):
    """Verifica que el usuario sea Encargado de Repuestos"""
    return verificar_rol(['encargado_repuestos'])(f)

def cliente_required(f):
    """Verifica que el usuario tenga rol de cliente"""
    return verificar_rol(['cliente'])(f)

def jefe_taller_o_operativo_required(f):
    """Verifica que el usuario sea Jefe de Taller o Jefe Operativo"""
    return verificar_rol(['jefe_taller', 'jefe_operativo'])(f)

def admin_required(f):
    """Verifica que el usuario tenga rol de administrador"""
    return verificar_rol(['admin'])(f)

def personal_required(f):
    """Verifica que el usuario sea personal (no cliente)"""
    return verificar_rol(['jefe_taller', 'jefe_operativo', 'tecnico', 'encargado_repuestos', 'admin'])(f)


# =====================================================
# FUNCIÓN PARA LIMPIAR CACHÉ DE ROLES (Útil después de actualizar roles)
# =====================================================

def limpiar_cache_roles(usuario_id=None):
    """Limpiar caché de roles para uno o todos los usuarios"""
    if usuario_id:
        _roles_cache.pop(usuario_id, None)
    else:
        _roles_cache.clear()
    logger.info(f"Caché de roles limpiado para usuario: {usuario_id if usuario_id else 'todos'}")