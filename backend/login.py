# =====================================================
# LOGIN Y AUTENTICACIÓN - FURIA MOTOR COMPANY SRL
# VERSIÓN CORREGIDA - CON SOPORTE PARA CLIENTES
# =====================================================

from flask import Blueprint, request, jsonify
import jwt
import datetime
from functools import wraps
from config import config
from werkzeug.security import check_password_hash, generate_password_hash
import logging
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

login_bp = Blueprint('login', __name__)

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# CONFIGURACIÓN DE CORREO
# =====================================================
EMAIL_CONFIG = {
    'smtp_server': 'smtp.gmail.com',
    'smtp_port': 587,
    'email_user': 'vaniacarrasco68056530@gmail.com',
    'email_password': 'uahnoblikntnqlbk',
    'from_name': 'FURIA MOTOR COMPANY'
}

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def generar_codigo_verificacion():
    return ''.join(random.choices(string.digits, k=6))

def enviar_email(destinatario, asunto, cuerpo_html):
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = asunto
        msg['From'] = f"{EMAIL_CONFIG['from_name']} <{EMAIL_CONFIG['email_user']}>"
        msg['To'] = destinatario
        
        parte_html = MIMEText(cuerpo_html, 'html')
        msg.attach(parte_html)
        
        server = smtplib.SMTP(EMAIL_CONFIG['smtp_server'], EMAIL_CONFIG['smtp_port'])
        server.starttls()
        server.login(EMAIL_CONFIG['email_user'], EMAIL_CONFIG['email_password'])
        server.send_message(msg)
        server.quit()
        
        logger.info(f"Email enviado a {destinatario}")
        return True
    except Exception as e:
        logger.error(f"Error enviando email: {str(e)}")
        return False

def obtener_roles_usuario(id_usuario):
    """Obtener roles de un usuario desde la tabla usuario_rol"""
    try:
        result = supabase.table('usuario_rol') \
            .select('rol!inner(nombre_rol)') \
            .eq('id_usuario', id_usuario) \
            .execute()
        
        roles = []
        if result.data:
            for item in result.data:
                rol_obj = item.get('rol', {})
                if isinstance(rol_obj, dict):
                    nombre = rol_obj.get('nombre_rol')
                    if nombre:
                        roles.append(nombre)
                elif isinstance(rol_obj, list) and len(rol_obj) > 0:
                    nombre = rol_obj[0].get('nombre_rol')
                    if nombre:
                        roles.append(nombre)
        return roles
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return []

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN (VERSIÓN CORREGIDA)
# =====================================================

def token_required(f):
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
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            
            # El token puede tener la estructura {'user': {...}} o ser directamente el usuario
            if 'user' in data:
                current_user = data['user']
            else:
                current_user = data
            
            # Verificar que el usuario tenga ID
            if not current_user.get('id'):
                logger.error("Usuario sin ID en token")
                return jsonify({'error': 'Token inválido: ID de usuario no encontrado'}), 401
                
        except jwt.ExpiredSignatureError:
            logger.warning("Token expirado")
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    return decorated

# =====================================================
# ENDPOINT PRINCIPAL DE LOGIN (VERSIÓN CORREGIDA)
# =====================================================

@login_bp.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Datos requeridos'}), 400
        
        user_type = data.get('type')
        identifier = data.get('identifier')
        password = data.get('password')
        
        if not all([user_type, identifier, password]):
            return jsonify({'error': 'Todos los campos son requeridos'}), 400
        
        if user_type == 'staff':
            # =====================================================
            # LOGIN PARA PERSONAL
            # =====================================================
            result = supabase.table('usuario') \
                .select('*') \
                .eq('email', identifier) \
                .execute()
            
            if not result.data:
                result = supabase.table('usuario') \
                    .select('*') \
                    .eq('numero_documento', identifier) \
                    .execute()
            
            if not result.data:
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            user = result.data[0]
            
            # Verificar contraseña
            if not check_password_hash(user['contrasenia'], password):
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            # Obtener roles
            nombres_roles = obtener_roles_usuario(user['id'])
            
            # Crear token con estructura correcta
            token = jwt.encode({
                'user': {
                    'id': user['id'],
                    'nombre': user['nombre'],
                    'email': user.get('email', ''),
                    'documento': user.get('numero_documento', ''),
                    'contacto': user.get('contacto', ''),
                    'roles': nombres_roles,
                    'type': 'staff'
                },
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id': user['id'],
                    'nombre': user['nombre'],
                    'email': user.get('email', ''),
                    'documento': user.get('numero_documento', ''),
                    'contacto': user.get('contacto', ''),
                    'roles': nombres_roles,
                    'type': 'staff'
                }
            }), 200
        
        elif user_type == 'client':
            # =====================================================
            # LOGIN PARA CLIENTES - VERSIÓN CORREGIDA
            # =====================================================
            placa = identifier.upper()
            
            # 1. Buscar vehículo por placa
            vehiculo_result = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, id_cliente') \
                .eq('placa', placa) \
                .execute()
            
            if not vehiculo_result.data:
                logger.warning(f"Vehículo no encontrado con placa: {placa}")
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            vehiculo = vehiculo_result.data[0]
            id_cliente = vehiculo.get('id_cliente')
            
            if not id_cliente:
                return jsonify({'error': 'Cliente no asociado al vehículo'}), 401
            
            # 2. Buscar cliente
            cliente_result = supabase.table('cliente') \
                .select('id, email, id_usuario') \
                .eq('id', id_cliente) \
                .execute()
            
            if not cliente_result.data:
                return jsonify({'error': 'Cliente no encontrado'}), 401
            
            cliente = cliente_result.data[0]
            id_usuario = cliente.get('id_usuario')
            
            if not id_usuario:
                return jsonify({'error': 'Usuario no asociado al cliente'}), 401
            
            # 3. Verificar contraseña en la tabla usuario
            user_result = supabase.table('usuario') \
                .select('id, nombre, contacto, contrasenia, email') \
                .eq('id', id_usuario) \
                .execute()
            
            if not user_result.data:
                return jsonify({'error': 'Usuario no encontrado'}), 401
            
            user = user_result.data[0]
            
            # Verificar contraseña
            if not check_password_hash(user['contrasenia'], password):
                logger.warning(f"Contraseña incorrecta para cliente con placa: {placa}")
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            # 4. Obtener roles del usuario
            roles_usuario = obtener_roles_usuario(user['id'])
            if 'cliente' not in roles_usuario:
                roles_usuario.append('cliente')
            
            email_cliente = cliente.get('email') or user.get('email', '')
            telefono_cliente = user.get('contacto', '')
            
            # =====================================================
            # IMPORTANTE: Crear objeto user con campo 'id' unificado
            # =====================================================
            token = jwt.encode({
                'user': {
                    'id': user['id'],  # CLAVE: ID unificado para el decorador
                    'id_cliente': cliente['id'],
                    'id_usuario': user['id'],
                    'nombre': user['nombre'],
                    'email': email_cliente,
                    'telefono': telefono_cliente,
                    'contacto': telefono_cliente,
                    'placa': vehiculo['placa'],
                    'id_vehiculo': vehiculo['id'],
                    'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip(),
                    'roles': roles_usuario,
                    'type': 'client'
                },
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id': user['id'],  # CLAVE: ID unificado
                    'id_cliente': cliente['id'],
                    'id_usuario': user['id'],
                    'nombre': user['nombre'],
                    'email': email_cliente,
                    'telefono': telefono_cliente,
                    'contacto': telefono_cliente,
                    'placa': vehiculo['placa'],
                    'id_vehiculo': vehiculo['id'],
                    'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip(),
                    'roles': roles_usuario,
                    'type': 'client'
                }
            }), 200
        
        else:
            return jsonify({'error': 'Tipo de usuario inválido'}), 400
            
    except Exception as e:
        logger.error(f"Error en login: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500


# =====================================================
# VERIFICAR TOKEN
# =====================================================

@login_bp.route('/api/verify-token', methods=['GET'])
@token_required
def verify_token(current_user):
    return jsonify({'valid': True, 'user': current_user}), 200


# =====================================================
# LOGOUT
# =====================================================

@login_bp.route('/api/logout', methods=['POST'])
def logout():
    return jsonify({'success': True, 'message': 'Sesión cerrada'}), 200


# =====================================================
# HEALTH CHECK
# =====================================================

@login_bp.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'message': 'Servidor FURIA MOTOR funcionando',
        'timestamp': datetime.datetime.now().isoformat()
    }), 200


# =====================================================
# RECUPERACIÓN DE CONTRASEÑA
# =====================================================

@login_bp.route('/api/recuperar/solicitar', methods=['POST'])
def solicitar_recuperacion():
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email requerido'}), 400
        
        # Buscar en usuarios (personal)
        user_result = supabase.table('usuario') \
            .select('id, nombre, email') \
            .eq('email', email) \
            .execute()
        
        nombre = None
        if user_result.data:
            nombre = user_result.data[0].get('nombre', 'Usuario')
        else:
            # Buscar en clientes
            cliente_result = supabase.table('cliente') \
                .select('id, id_usuario') \
                .eq('email', email) \
                .execute()
            
            if cliente_result.data and cliente_result.data[0].get('id_usuario'):
                user_cliente = supabase.table('usuario') \
                    .select('nombre') \
                    .eq('id', cliente_result.data[0]['id_usuario']) \
                    .execute()
                if user_cliente.data:
                    nombre = user_cliente.data[0].get('nombre', 'Cliente')
            else:
                return jsonify({'error': 'Email no registrado'}), 404
        
        if not nombre:
            nombre = 'Usuario'
        
        codigo = generar_codigo_verificacion()
        expira = datetime.datetime.now() + datetime.timedelta(minutes=15)
        
        supabase.table('codigoverificacion').insert({
            'email': email,
            'codigo': codigo,
            'tipo': 'reset_password',
            'expira': expira.isoformat()
        }).execute()
        
        asunto = "🔐 Recuperación de contraseña - FURIA MOTOR"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: Arial; text-align: center; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px;">
                <div style="background: #C1121F; padding: 30px;"><h1 style="color: white;">FURIA MOTOR</h1></div>
                <div style="padding: 30px;">
                    <h2>Código de recuperación</h2>
                    <p>Hola <strong>{nombre}</strong>,</p>
                    <div style="font-size: 32px; font-weight: bold; color: #C1121F; background: #f5f5f5; padding: 15px;">{codigo}</div>
                    <p>Expira en <strong>15 minutos</strong>.</p>
                    <p>Si no solicitaste este cambio, ignora este mensaje.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(email, asunto, cuerpo_html)
        
        return jsonify({'success': True, 'message': 'Código enviado a tu correo', 'email': email}), 200
        
    except Exception as e:
        logger.error(f"Error en solicitud de recuperación: {str(e)}")
        return jsonify({'error': str(e)}), 500


@login_bp.route('/api/recuperar/cambiar', methods=['POST'])
def cambiar_contrasena():
    try:
        data = request.get_json()
        email = data.get('email')
        codigo = data.get('codigo')
        nueva_contrasena = data.get('nueva_contrasena')
        
        if not all([email, codigo, nueva_contrasena]):
            return jsonify({'error': 'Todos los campos son requeridos'}), 400
        
        if len(nueva_contrasena) < 6:
            return jsonify({'error': 'La contraseña debe tener al menos 6 caracteres'}), 400
        
        codigo_result = supabase.table('codigoverificacion') \
            .select('*') \
            .eq('email', email) \
            .eq('codigo', codigo) \
            .eq('tipo', 'reset_password') \
            .eq('usado', False) \
            .gt('expira', datetime.datetime.now().isoformat()) \
            .execute()
        
        if not codigo_result.data:
            return jsonify({'error': 'Código inválido o expirado'}), 400
        
        nuevo_hash = generate_password_hash(nueva_contrasena)
        
        # Actualizar en usuario
        user_update = supabase.table('usuario') \
            .update({'contrasenia': nuevo_hash}) \
            .eq('email', email) \
            .execute()
        
        if not user_update.data:
            # Si no es usuario, buscar cliente
            cliente = supabase.table('cliente').select('id_usuario').eq('email', email).execute()
            if cliente.data and cliente.data[0].get('id_usuario'):
                supabase.table('usuario') \
                    .update({'contrasenia': nuevo_hash}) \
                    .eq('id', cliente.data[0]['id_usuario']) \
                    .execute()
        
        supabase.table('codigoverificacion').update({'usado': True}).eq('id', codigo_result.data[0]['id']).execute()
        
        return jsonify({'success': True, 'message': 'Contraseña actualizada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error cambiando contraseña: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# REGISTRO DE PERSONAL
# =====================================================

@login_bp.route('/api/registro/personal/solicitar', methods=['POST'])
def solicitar_registro_personal():
    try:
        data = request.get_json()
        
        nombre = data.get('nombre')
        email = data.get('email')
        documento = data.get('documento')
        telefono = data.get('telefono')
        direccion = data.get('direccion')
        id_rol = data.get('id_rol')
        password = data.get('password')
        
        if not all([nombre, email, documento, id_rol, password]):
            return jsonify({'error': 'Nombre, email, documento, rol y contraseña son requeridos'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'La contraseña debe tener al menos 6 caracteres'}), 400
        
        user_existente = supabase.table('usuario').select('id').eq('email', email).execute()
        if user_existente.data:
            return jsonify({'error': 'El email ya está registrado'}), 400
        
        doc_existente = supabase.table('usuario').select('id').eq('numero_documento', documento).execute()
        if doc_existente.data:
            return jsonify({'error': 'El número de documento ya está registrado'}), 400
        
        hashed_password = generate_password_hash(password)
        
        solicitud_result = supabase.table('solicitudregistropersonal').insert({
            'nombre': nombre,
            'email': email,
            'numero_documento': documento,
            'telefono': telefono,
            'direccion': direccion,
            'id_rol_solicitado': id_rol,
            'estado': 'pendiente',
            'fecha_solicitud': datetime.datetime.now().isoformat(),
            'contrasenia_temporal': hashed_password
        }).execute()
        
        if not solicitud_result.data:
            return jsonify({'error': 'Error al crear solicitud'}), 500
        
        # Notificar al administrador
        admin_email = 'vaniacarrasco68056530@gmail.com'
        asunto = f"🔔 NUEVA SOLICITUD DE REGISTRO - {nombre}"
        cuerpo_html = f"""
        <html>
        <body style="font-family: Arial; padding: 20px;">
            <h2 style="color: #C1121F;">Nueva Solicitud de Registro</h2>
            <p><strong>Nombre:</strong> {nombre}</p>
            <p><strong>Email:</strong> {email}</p>
            <p><strong>Documento:</strong> {documento}</p>
            <p><strong>Teléfono:</strong> {telefono}</p>
            <p><strong>Dirección:</strong> {direccion}</p>
            <p><strong>Rol ID:</strong> {id_rol}</p>
            <p><strong>Fecha:</strong> {datetime.datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
            <hr>
            <p>Revisa el panel de administración para aprobar o rechazar esta solicitud.</p>
        </body>
        </html>
        """
        
        enviar_email(admin_email, asunto, cuerpo_html)
        
        return jsonify({
            'success': True,
            'message': 'Solicitud de registro enviada. Espera aprobación del administrador.',
            'solicitud_id': solicitud_result.data[0]['id']
        }), 200
        
    except Exception as e:
        logger.error(f"Error en solicitud de registro personal: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# REGISTRO DE VEHÍCULO PARA CLIENTE EXISTENTE
# =====================================================

@login_bp.route('/api/registro/vehiculo', methods=['POST'])
def registrar_vehiculo():
    try:
        data = request.get_json()
        
        email = data.get('email')
        placa = data.get('placa').upper()
        marca = data.get('marca')
        modelo = data.get('modelo')
        anio = data.get('anio')
        color = data.get('color')
        
        if not all([email, placa, marca, modelo]):
            return jsonify({'error': 'Email, placa, marca y modelo son requeridos'}), 400
        
        # Buscar cliente
        cliente_result = supabase.table('cliente').select('id').eq('email', email).execute()
        
        if not cliente_result.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        id_cliente = cliente_result.data[0]['id']
        
        # Verificar si placa ya existe
        placa_existente = supabase.table('vehiculo').select('id').eq('placa', placa).execute()
        if placa_existente.data:
            return jsonify({'error': 'La placa ya está registrada'}), 400
        
        # Registrar vehículo
        vehiculo_result = supabase.table('vehiculo').insert({
            'id_cliente': id_cliente,
            'placa': placa,
            'marca': marca,
            'modelo': modelo,
            'anio': anio if anio else None,
            'color': color if color else None
        }).execute()
        
        if not vehiculo_result.data:
            return jsonify({'error': 'Error al registrar vehículo'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Vehículo registrado exitosamente',
            'id_vehiculo': vehiculo_result.data[0]['id']
        }), 200
        
    except Exception as e:
        logger.error(f"Error registrando vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500