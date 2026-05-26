# =====================================================
# MIS VEHÍCULOS - CLIENTE (CORREGIDO)
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
import logging
from functools import wraps
import jwt

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
cliente_bp = Blueprint('cliente', __name__)

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# DECORADOR CLIENTE REQUIRED
# =====================================================

def cliente_required(f):
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
            
            if 'user' in data:
                current_user = data['user']
            else:
                current_user = data
            
            if not current_user.get('id'):
                logger.error("Usuario sin ID en token")
                return jsonify({'error': 'Token inválido: ID de usuario no encontrado'}), 401
            
            roles = current_user.get('roles', [])
            if 'cliente' not in roles:
                return jsonify({'error': 'Acceso denegado. Se requiere rol de cliente.'}), 403
                
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
# FUNCIONES AUXILIARES
# =====================================================

def obtener_cliente_por_usuario(usuario_id):
    """Obtener cliente a partir del usuario"""
    try:
        # La tabla cliente SOLO tiene: id, email, id_usuario
        cliente = supabase.table('cliente') \
            .select('id, email, id_usuario') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return None
        
        cliente_data = cliente.data[0]
        
        # Obtener datos del usuario (nombre, contacto están aquí)
        usuario = supabase.table('usuario') \
            .select('nombre, contacto, email') \
            .eq('id', usuario_id) \
            .execute()
        
        if usuario.data:
            cliente_data['nombre'] = usuario.data[0].get('nombre', 'Cliente')
            cliente_data['telefono'] = usuario.data[0].get('contacto', '')
        
        return cliente_data
    except Exception as e:
        logger.error(f"Error obteniendo cliente: {e}")
        return None

# =====================================================
# ENDPOINTS
# =====================================================

@cliente_bp.route('/perfil', methods=['GET'])
@cliente_required
def obtener_perfil_cliente(current_user):
    """Obtener perfil del cliente autenticado"""
    try:
        usuario_id = current_user.get('id')
        
        # Obtener datos del usuario
        usuario = supabase.table('usuario') \
            .select('id, nombre, email, contacto') \
            .eq('id', usuario_id) \
            .execute()
        
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        user_data = usuario.data[0]
        
        # Obtener cliente
        cliente = supabase.table('cliente') \
            .select('id, email') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        return jsonify({
            'success': True,
            'usuario': {
                'id': user_data['id'],
                'nombre': user_data['nombre'],
                'email': user_data.get('email', ''),
                'contacto': user_data.get('contacto', ''),
                'roles': current_user.get('roles', ['cliente']),
                'id_cliente': cliente.data[0]['id'] if cliente.data else None
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500

@cliente_bp.route('/vehiculos', methods=['GET'])
@cliente_required
def obtener_vehiculos_cliente(current_user):
    """Obtener todos los vehículos del cliente"""
    try:
        usuario_id = current_user.get('id')
        
        # Obtener cliente
        cliente = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        cliente_id = cliente.data[0]['id']
        
        # Obtener vehículos
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje') \
            .eq('id_cliente', cliente_id) \
            .execute()
        
        return jsonify({
            'success': True,
            'vehiculos': vehiculos.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {str(e)}")
        return jsonify({'error': str(e)}), 500

@cliente_bp.route('/vehiculo/<int:vehiculo_id>/ordenes', methods=['GET'])
@cliente_required
def obtener_ordenes_vehiculo(current_user, vehiculo_id):
    """Obtener órdenes de trabajo de un vehículo específico"""
    try:
        # Verificar que el vehículo pertenece al cliente
        usuario_id = current_user.get('id')
        
        cliente = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        cliente_id = cliente.data[0]['id']
        
        # Verificar propiedad del vehículo
        vehiculo = supabase.table('vehiculo') \
            .select('id') \
            .eq('id', vehiculo_id) \
            .eq('id_cliente', cliente_id) \
            .execute()
        
        if not vehiculo.data:
            return jsonify({'error': 'Vehículo no encontrado o no pertenece al cliente'}), 404
        
        # Obtener órdenes de trabajo
        ordenes = supabase.table('ordentrabajo') \
            .select('''
                id, 
                codigo_unico, 
                fecha_ingreso, 
                fecha_salida, 
                estado_global
            ''') \
            .eq('id_vehiculo', vehiculo_id) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        return jsonify({
            'success': True,
            'ordenes': ordenes.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes: {str(e)}")
        return jsonify({'error': str(e)}), 500

@cliente_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba"""
    return jsonify({'success': True, 'message': 'API de cliente funcionando'}), 200