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
                
                # Primero intentar obtener roles desde usuario_rol (nuevo sistema)
                roles_usuario = []
                try:
                    roles_result = supabase.table('usuario_rol') \
                        .select('rol:rol!inner(nombre_rol)') \
                        .eq('id_usuario', usuario_id) \
                        .execute()
                    
                    if roles_result.data:
                        for item in roles_result.data:
                            rol_obj = item.get('rol', {})
                            if isinstance(rol_obj, dict):
                                roles_usuario.append(rol_obj.get('nombre_rol'))
                            elif isinstance(rol_obj, list) and len(rol_obj) > 0:
                                roles_usuario.append(rol_obj[0].get('nombre_rol'))
                except Exception as e:
                    logger.warning(f"Error consultando usuario_rol: {e}")
                
                # Si no tiene roles en usuario_rol, obtener de la tabla usuario (sistema antiguo)
                if not roles_usuario:
                    try:
                        user_result = supabase.table('usuario') \
                            .select('id_rol, rol:rol!inner(nombre_rol)') \
                            .eq('id', usuario_id) \
                            .execute()
                        
                        if user_result.data:
                            rol_obj = user_result.data[0].get('rol', {})
                            if isinstance(rol_obj, dict):
                                rol_antiguo = rol_obj.get('nombre_rol')
                                if rol_antiguo:
                                    roles_usuario.append(rol_antiguo)
                    except Exception as e:
                        logger.warning(f"Error consultando usuario: {e}")
                
                # Mapeo de roles antiguos a nuevos por si acaso
                mapeo_roles = {
                    'admin_general': 'jefe_operativo',
                    'jefe_operativo': 'jefe_operativo',
                    'jefe_taller': 'jefe_taller',
                    'tecnico_mecanico': 'tecnico',
                    'tecnico': 'tecnico',
                    'encargado_rep_almacen': 'encargado_repuestos',
                    'encargado_repuestos': 'encargado_repuestos',
                    'cliente': 'cliente'
                }
                
                # Normalizar roles
                roles_normalizados = []
                for rol in roles_usuario:
                    rol_normalizado = mapeo_roles.get(rol, rol)
                    roles_normalizados.append(rol_normalizado)
                
                logger.info(f"Usuario {current_user.get('nombre')} (ID: {usuario_id}) tiene roles: {roles_normalizados}")
                
                # Verificar si tiene al menos uno de los roles permitidos
                tiene_rol = any(rol in roles_normalizados for rol in roles_permitidos)
                
                if not tiene_rol:
                    logger.warning(f"Usuario {current_user.get('nombre')} no tiene rol permitido. Requeridos: {roles_permitidos}, Tiene: {roles_normalizados}")
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