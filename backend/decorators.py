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
                
                # Verificar roles usando la función SQL
                tiene_rol = False
                for rol in roles_permitidos:
                    result = supabase.rpc('usuario_tiene_rol', {
                        'p_usuario_id': current_user['id'],
                        'p_rol_nombre': rol
                    }).execute()
                    if result.data:
                        tiene_rol = True
                        break
                
                if not tiene_rol:
                    logger.warning(f"Usuario {current_user.get('nombre')} no tiene rol permitido. Requeridos: {roles_permitidos}")
                    return jsonify({'error': 'No autorizado para esta operación'}), 403
                    
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Token expirado'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'error': 'Token inválido'}), 401
            
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
    