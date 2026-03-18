from flask import Blueprint, request, jsonify
import jwt
import datetime
from functools import wraps
from config import config
from werkzeug.security import check_password_hash, generate_password_hash
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

login_bp = Blueprint('login', __name__)

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# Decorador para verificar token
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Buscar token en headers
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]  # Bearer <token>
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            # Decodificar token
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            logger.info(f"Token válido para usuario: {current_user.get('nombre')}")
        except jwt.ExpiredSignatureError:
            logger.warning("Token expirado")
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

@login_bp.route('/api/login', methods=['POST'])
def login():
    """Endpoint para login de personal (por documento) y clientes (por placa)"""
    try:
        data = request.get_json()
        logger.info(f"Intento de login - Tipo: {data.get('type') if data else 'No data'}")
        
        if not data:
            return jsonify({'error': 'Datos requeridos'}), 400
        
        user_type = data.get('type')  # 'staff' o 'client'
        identifier = data.get('identifier')  # Para staff: numero_documento, para client: placa
        password = data.get('password')
        
        if not all([user_type, identifier, password]):
            return jsonify({'error': 'Todos los campos son requeridos'}), 400
        
        if user_type == 'staff':
            # =====================================================
            # LOGIN PARA PERSONAL - POR NÚMERO DE DOCUMENTO
            # =====================================================
            logger.info(f"Buscando staff con documento: {identifier}")
            
            # Obtener todos los roles para mapear IDs a nombres
            roles_result = supabase.table('rol').select('id, nombre_rol').execute()
            roles = {r['id']: r['nombre_rol'] for r in roles_result.data} if roles_result.data else {}
            
            # Buscar usuario por número de documento
            result = supabase.table('usuario').select('*').eq('numero_documento', identifier).execute()
            
            logger.info(f"Resultado búsqueda: {len(result.data) if result.data else 0} usuarios encontrados")
            
            if not result.data:
                logger.warning(f"No se encontró usuario con documento: {identifier}")
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            user = result.data[0]
            
            # Verificar contraseña usando werkzeug.security
            if not check_password_hash(user['contrasenia'], password):
                logger.warning(f"Contraseña incorrecta para documento {identifier}")
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            # Obtener nombre del rol
            rol_nombre = roles.get(user['id_rol'], 'desconocido')
            logger.info(f"Login exitoso staff: {user['nombre']} - Rol: {rol_nombre}")
            
            # Generar token JWT (24 horas de expiración)
            token = jwt.encode({
                'user': {
                    'id': user['id'],
                    'nombre': user['nombre'],
                    'documento': user['numero_documento'],
                    'id_rol': user['id_rol'],
                    'rol': rol_nombre,
                    'type': 'staff'
                },
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
            # Mapeo de rutas según rol
            role_redirects = {
                'admin_general': '/admin_general/dashboard.html',
                'jefe_operativo': '/jefe_operativo/dashboard.html',
                'jefe_taller': '/jefe_taller/dashboard.html',
                'tecnico_mecanico': '/tecnico_mecanico/misvehiculos.html',
                'encargado_rep_almacen': '/encargado_rep_almacen/dashboard.html'
            }
            
            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id': user['id'],
                    'nombre': user['nombre'],
                    'documento': user['numero_documento'],
                    'rol': rol_nombre,
                    'type': 'staff'
                },
                'redirect': role_redirects.get(rol_nombre, '/dashboard.html')
            }), 200
            
        elif user_type == 'client':
            # =====================================================
            # LOGIN PARA CLIENTES - POR PLACA DEL VEHÍCULO
            # =====================================================
            logger.info(f"Buscando cliente con placa: {identifier.upper()}")
            
            # Buscar el vehículo por placa
            vehicle_result = supabase.table('vehiculo').select('*').eq('placa', identifier.upper()).execute()
            
            logger.info(f"Vehículo encontrado: {len(vehicle_result.data) if vehicle_result.data else 0}")
            
            if not vehicle_result.data:
                logger.warning(f"No se encontró vehículo con placa: {identifier}")
                return jsonify({'error': 'Vehículo no encontrado'}), 401
            
            vehicle = vehicle_result.data[0]
            
            # Buscar el cliente asociado al vehículo
            client_result = supabase.table('cliente').select('*').eq('id', vehicle['id_cliente']).execute()
            
            if not client_result.data:
                logger.error(f"Cliente no encontrado para vehículo {identifier}")
                return jsonify({'error': 'Cliente no encontrado'}), 401
            
            cliente = client_result.data[0]
            
            # Verificar si el cliente tiene un usuario asociado
            user = None
            if cliente.get('id_usuario'):
                user_result = supabase.table('usuario').select('*').eq('id', cliente['id_usuario']).execute()
                if user_result.data:
                    user = user_result.data[0]
                    
                    # Verificar contraseña usando werkzeug.security
                    if not check_password_hash(user['contrasenia'], password):
                        logger.warning(f"Contraseña incorrecta para cliente placa {identifier}")
                        return jsonify({'error': 'Credenciales inválidas'}), 401
            
            # Si no tiene usuario, permitir acceso con contraseña por defecto (solo para pruebas)
            elif password != 'cliente123':
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            # Generar token para cliente
            token = jwt.encode({
                'user': {
                    'id_cliente': cliente['id'],
                    'nombre': user['nombre'] if user else 'Cliente',
                    'placa': vehicle['placa'],
                    'id_vehiculo': vehicle['id'],
                    'vehiculo': {
                        'marca': vehicle.get('marca', ''),
                        'modelo': vehicle.get('modelo', ''),
                        'anio': vehicle.get('anio', '')
                    },
                    'type': 'client'
                },
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
            nombre_cliente = user['nombre'] if user else 'Cliente'
            logger.info(f"Login exitoso cliente: {nombre_cliente} - Placa: {vehicle['placa']}")
            
            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id_cliente': cliente['id'],
                    'nombre': nombre_cliente,
                    'placa': vehicle['placa'],
                    'vehiculo': f"{vehicle.get('marca', '')} {vehicle.get('modelo', '')} {vehicle.get('anio', '')}".strip(),
                    'type': 'client'
                },
                'redirect': '/cliente/dashboard.html'
            }), 200
        
        else:
            return jsonify({'error': 'Tipo de usuario inválido'}), 400
            
    except Exception as e:
        logger.error(f"Error en login: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500

@login_bp.route('/api/verify-token', methods=['GET'])
@token_required
def verify_token(current_user):
    """Verificar si el token es válido"""
    logger.info(f"Token verificado para: {current_user.get('nombre')}")
    return jsonify({
        'valid': True,
        'user': current_user
    }), 200

@login_bp.route('/api/logout', methods=['POST'])
def logout():
    """Cerrar sesión"""
    return jsonify({'success': True, 'message': 'Sesión cerrada'}), 200

@login_bp.route('/api/check-vehiculo/<placa>', methods=['GET'])
def check_vehiculo(placa):
    """Verificar si una placa existe (para registro rápido)"""
    try:
        result = supabase.table('vehiculo').select('placa, marca, modelo, id_cliente').eq('placa', placa.upper()).execute()
        
        if result.data:
            vehiculo = result.data[0]
            
            # Verificar si el cliente tiene usuario asociado
            cliente_result = supabase.table('cliente').select('id_usuario').eq('id', vehiculo['id_cliente']).execute()
            
            tiene_usuario = False
            if cliente_result.data and cliente_result.data[0].get('id_usuario'):
                tiene_usuario = True
            
            return jsonify({
                'exists': True, 
                'vehiculo': {
                    'placa': vehiculo['placa'],
                    'marca': vehiculo['marca'],
                    'modelo': vehiculo['modelo']
                },
                'tiene_usuario': tiene_usuario
            }), 200
        else:
            return jsonify({'exists': False}), 200
            
    except Exception as e:
        logger.error(f"Error verificando placa: {str(e)}")
        return jsonify({'error': str(e)}), 500

@login_bp.route('/api/health', methods=['GET'])
def health_check():
    """Endpoint para verificar que el servidor funciona"""
    return jsonify({
        'status': 'ok',
        'message': 'Servidor FURIA MOTOR funcionando',
        'timestamp': datetime.datetime.now().isoformat()
    }), 200

@login_bp.route('/api/staff-list', methods=['GET'])
@token_required
def get_staff_list(current_user):
    """Obtener lista de personal (solo para admin)"""
    try:
        # Solo admin puede ver la lista completa
        if current_user.get('rol') != 'admin_general':
            return jsonify({'error': 'No autorizado'}), 403
        
        result = supabase.table('usuario').select('id, nombre, numero_documento, id_rol').execute()
        
        # Obtener roles para mapear
        roles_result = supabase.table('rol').select('id, nombre_rol').execute()
        roles = {r['id']: r['nombre_rol'] for r in roles_result.data} if roles_result.data else {}
        
        staff_list = []
        for user in result.data if result.data else []:
            staff_list.append({
                'id': user['id'],
                'nombre': user['nombre'],
                'documento': user['numero_documento'],
                'rol': roles.get(user['id_rol'], 'desconocido')
            })
        
        return jsonify(staff_list), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo staff: {str(e)}")
        return jsonify({'error': str(e)}), 500