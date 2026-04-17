# =====================================================
# backend/decorators.py
# =====================================================

from functools import wraps
from flask import request, jsonify
from config import config
import jwt
import logging

logger = logging.getLogger(__name__)
supabase = config.supabase

# Cache simple para roles (reduce consultas a BD)
_roles_cache = {}
_CACHE_TTL = 60  # segundos

def obtener_roles_usuario(usuario_id):
    """Obtener roles de usuario con caché simple"""
    import time
    
    # Verificar caché
    if usuario_id in _roles_cache:
        cached_data, timestamp = _roles_cache[usuario_id]
        if time.time() - timestamp < _CACHE_TTL:
            return cached_data
    
    roles = []
    try:
        # Consultar roles directamente
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
                        # Normalizar nombre de rol
                        if nombre in ['jefe_taller', 'jefe_operativo', 'tecnico', 'encargado_repuestos']:
                            roles.append(nombre)
                elif isinstance(rol_obj, list) and len(rol_obj) > 0:
                    nombre = rol_obj[0].get('nombre_rol')
                    if nombre and nombre in ['jefe_taller', 'jefe_operativo', 'tecnico', 'encargado_repuestos']:
                        roles.append(nombre)
    except Exception as e:
        logger.debug(f"Error consultando roles: {e}")
    
    # Guardar en caché
    _roles_cache[usuario_id] = (roles, time.time())
    
    return roles

def verificar_rol(roles_permitidos):
    """Decorador para verificar que el usuario tenga al menos uno de los roles permitidos"""
    def decorator(f):
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
                data = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
                current_user = data['user']
                usuario_id = current_user.get('id')
                
                if not usuario_id:
                    logger.error("Usuario sin ID en token")
                    return jsonify({'error': 'Token inválido'}), 401
                
                # Obtener roles del usuario (con caché)
                roles_usuario = obtener_roles_usuario(usuario_id)
                
                # Si no tiene roles, intentar obtener del token
                if not roles_usuario:
                    roles_token = current_user.get('roles', [])
                    if roles_token:
                        roles_usuario = [r for r in roles_token if r in ['jefe_taller', 'jefe_operativo', 'tecnico', 'encargado_repuestos']]
                
                # Verificar si tiene al menos un rol permitido
                tiene_rol = any(rol in roles_usuario for rol in roles_permitidos)
                
                if not tiene_rol:
                    # Solo log de advertencia cuando realmente no tiene permiso
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
            
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator

# Decoradores específicos para simplificar
def jefe_taller_required(f):
    return verificar_rol(['jefe_taller'])(f)

def jefe_operativo_required(f):
    return verificar_rol(['jefe_operativo'])(f)

def tecnico_required(f):
    return verificar_rol(['tecnico'])(f)

def encargado_repuestos_required(f):
    return verificar_rol(['encargado_repuestos'])(f)

def jefe_taller_o_operativo_required(f):
    return verificar_rol(['jefe_taller', 'jefe_operativo'])(f)