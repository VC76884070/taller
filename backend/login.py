# =====================================================
# LOGIN Y AUTENTICACIÓN - FURIA MOTOR COMPANY SRL
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

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

login_bp = Blueprint('login', __name__)

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# CONFIGURACIÓN DE CORREO ELECTRÓNICO
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
    """Generar código de 6 dígitos"""
    return ''.join(random.choices(string.digits, k=6))

def enviar_email(destinatario, asunto, cuerpo_html):
    """Enviar correo electrónico"""
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
        
        logger.info(f"✅ Email enviado a {destinatario}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error enviando email: {str(e)}")
        return False

def obtener_roles_usuario(id_usuario):
    """Obtener todos los roles de un usuario (como lista de strings)"""
    try:
        result = supabase.rpc('usuario_obtener_nombres_roles', {'p_usuario_id': id_usuario}).execute()
        
        if result.data and isinstance(result.data, list):
            roles = []
            for rol in result.data:
                if rol:
                    rol_clean = str(rol).strip().lower()
                    if rol_clean in ['jefe_operativo', 'jefe_taller', 'tecnico', 'encargado_repuestos', 'admin_general']:
                        roles.append(rol_clean)
            if roles:
                return roles
        
        result = supabase.table('usuario_rol') \
            .select('rol(nombre_rol)') \
            .eq('id_usuario', id_usuario) \
            .execute()
        
        if result.data:
            roles = []
            for item in result.data:
                if item.get('rol') and item['rol'].get('nombre_rol'):
                    rol_nombre = item['rol']['nombre_rol'].strip().lower()
                    if rol_nombre in ['jefe_operativo', 'jefe_taller', 'tecnico', 'encargado_repuestos', 'admin_general']:
                        roles.append(rol_nombre)
            return roles
        
        return []
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return []

def obtener_rol_principal(nombres_roles):
    """Determinar el rol principal según prioridad"""
    prioridad = ['jefe_taller', 'jefe_operativo', 'tecnico', 'encargado_repuestos', 'admin_general']
    
    for rol in prioridad:
        if rol in nombres_roles:
            return rol
    
    return 'jefe_operativo' if nombres_roles else 'jefe_operativo'

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN
# =====================================================

def token_required(f):
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
            current_user = data['user']
            logger.info(f"✅ Token válido para: {current_user.get('nombre')}")
        except jwt.ExpiredSignatureError:
            logger.warning("⏰ Token expirado")
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"❌ Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

# =====================================================
# ENDPOINTS DE LOGIN
# =====================================================

@login_bp.route('/api/login', methods=['POST'])
def login():
    """Endpoint para login de personal y clientes"""
    try:
        data = request.get_json()
        logger.info(f"🔐 Intento de login - Tipo: {data.get('type') if data else 'No data'}")
        
        if not data:
            return jsonify({'error': 'Datos requeridos'}), 400
        
        user_type = data.get('type')
        identifier = data.get('identifier')
        password = data.get('password')
        
        if not all([user_type, identifier, password]):
            return jsonify({'error': 'Todos los campos son requeridos'}), 400
        
        if user_type == 'staff':
            # LOGIN PARA PERSONAL
            logger.info(f"🔍 Buscando staff con: {identifier}")
            
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
                logger.warning(f"❌ Usuario no encontrado: {identifier}")
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            user = result.data[0]
            
            if not check_password_hash(user['contrasenia'], password):
                logger.warning(f"❌ Contraseña incorrecta para: {identifier}")
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            # Obtener TODOS los roles del usuario
            nombres_roles = obtener_roles_usuario(user['id'])
            logger.info(f"Roles obtenidos para {user['nombre']}: {nombres_roles}")
            
            # Determinar rol principal solo para info, NO para redirección
            rol_principal = obtener_rol_principal(nombres_roles)
            
            logger.info(f"✅ Login exitoso: {user['nombre']} - Roles: {nombres_roles}")
            
            # Crear token JWT con TODOS los roles
            token = jwt.encode({
                'user': {
                    'id': user['id'],
                    'nombre': user['nombre'],
                    'documento': user.get('numero_documento', ''),
                    'email': user.get('email', ''),
                    'roles': nombres_roles,
                    'rol_principal': rol_principal,
                    'type': 'staff'
                },
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
            # IMPORTANTE: NO enviar redirect, el frontend decide a dónde ir
            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id': user['id'],
                    'nombre': user['nombre'],
                    'documento': user.get('numero_documento', ''),
                    'email': user.get('email', ''),
                    'roles': nombres_roles,
                    'rol_principal': rol_principal,
                    'type': 'staff'
                }
                # SIN CAMPO 'redirect' - el frontend maneja la redirección
            }), 200
            
        elif user_type == 'client':
            # LOGIN PARA CLIENTES
            logger.info(f"🔍 Buscando cliente con: {identifier}")
            
            cliente = None
            
            if '@' in identifier:
                cliente_result = supabase.table('cliente').select('*').eq('email', identifier).execute()
                if cliente_result.data:
                    cliente = cliente_result.data[0]
            else:
                vehicle_result = supabase.table('vehiculo').select('id_cliente').eq('placa', identifier.upper()).execute()
                if vehicle_result.data:
                    cliente_result = supabase.table('cliente').select('*').eq('id', vehicle_result.data[0]['id_cliente']).execute()
                    if cliente_result.data:
                        cliente = cliente_result.data[0]
            
            if not cliente:
                logger.warning(f"❌ Cliente no encontrado: {identifier}")
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            vehicle_result = supabase.table('vehiculo').select('*').eq('id_cliente', cliente['id']).execute()
            if not vehicle_result.data:
                return jsonify({'error': 'No se encontró vehículo asociado'}), 401
            
            vehicle = vehicle_result.data[0]
            
            user = None
            if cliente.get('id_usuario'):
                user_result = supabase.table('usuario').select('*').eq('id', cliente['id_usuario']).execute()
                if user_result.data:
                    user = user_result.data[0]
                    if not check_password_hash(user['contrasenia'], password):
                        return jsonify({'error': 'Credenciales inválidas'}), 401
            else:
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            roles_usuario = obtener_roles_usuario(user['id'])
            nombres_roles = roles_usuario + ['cliente']
            
            token = jwt.encode({
                'user': {
                    'id_cliente': cliente['id'],
                    'id_usuario': user['id'],
                    'nombre': user['nombre'] if user else cliente.get('nombre', 'Cliente'),
                    'email': cliente.get('email', ''),
                    'placa': vehicle['placa'],
                    'id_vehiculo': vehicle['id'],
                    'roles': nombres_roles,
                    'vehiculo': {
                        'marca': vehicle.get('marca', ''),
                        'modelo': vehicle.get('modelo', ''),
                        'anio': vehicle.get('anio', '')
                    },
                    'type': 'client'
                },
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
            nombre_cliente = user['nombre'] if user else cliente.get('nombre', 'Cliente')
            
            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id_cliente': cliente['id'],
                    'nombre': nombre_cliente,
                    'email': cliente.get('email', ''),
                    'placa': vehicle['placa'],
                    'vehiculo': f"{vehicle.get('marca', '')} {vehicle.get('modelo', '')}".strip(),
                    'roles': nombres_roles,
                    'type': 'client'
                }
            }), 200
        
        else:
            return jsonify({'error': 'Tipo de usuario inválido'}), 400
            
    except Exception as e:
        logger.error(f"❌ Error en login: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500


# =====================================================
# ENDPOINTS DE RECUPERACIÓN DE CONTRASEÑA
# =====================================================

@login_bp.route('/api/recuperar/solicitar', methods=['POST'])
def solicitar_recuperacion():
    """Solicitar código de recuperación de contraseña"""
    try:
        data = request.get_json()
        email = data.get('email')
        tipo_usuario = data.get('tipo')
        
        if not email or not tipo_usuario:
            return jsonify({'error': 'Email y tipo de usuario requeridos'}), 400
        
        nombre_usuario = ""
        
        if tipo_usuario == 'staff':
            result = supabase.table('usuario').select('id, nombre, email').eq('email', email).execute()
            if result.data:
                nombre_usuario = result.data[0]['nombre']
            else:
                return jsonify({'error': 'Email no registrado'}), 404
        else:
            result = supabase.table('cliente').select('id, nombre, email, id_usuario').eq('email', email).execute()
            if result.data:
                cliente = result.data[0]
                nombre_usuario = cliente.get('nombre', 'Cliente')
                if cliente.get('id_usuario'):
                    user_result = supabase.table('usuario').select('nombre').eq('id', cliente['id_usuario']).execute()
                    if user_result.data:
                        nombre_usuario = user_result.data[0]['nombre']
            else:
                return jsonify({'error': 'Email no registrado'}), 404
        
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
        <body style="font-family: 'Plus Jakarta Sans'; text-align: center; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden;">
                <div style="background: #C1121F; padding: 30px;"><h1 style="color: white;">FURIA MOTOR</h1></div>
                <div style="padding: 30px;">
                    <h2>Código de recuperación</h2>
                    <p>Hola <strong>{nombre_usuario}</strong>,</p>
                    <p>Usa el siguiente código:</p>
                    <div style="font-size: 32px; font-weight: bold; color: #C1121F; background: #f5f5f5; padding: 15px; border-radius: 12px;">{codigo}</div>
                    <p>Expira en <strong>15 minutos</strong>.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(email, asunto, cuerpo_html)
        
        return jsonify({
            'success': True,
            'message': 'Código enviado a tu correo electrónico',
            'email': email
        }), 200
        
    except Exception as e:
        logger.error(f"Error en solicitud de recuperación: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


@login_bp.route('/api/recuperar/verificar', methods=['POST'])
def verificar_codigo_recuperacion():
    """Verificar código de recuperación"""
    try:
        data = request.get_json()
        email = data.get('email')
        codigo = data.get('codigo')
        
        if not email or not codigo:
            return jsonify({'error': 'Email y código requeridos'}), 400
        
        result = supabase.table('codigoverificacion') \
            .select('*') \
            .eq('email', email) \
            .eq('codigo', codigo) \
            .eq('tipo', 'reset_password') \
            .eq('usado', False) \
            .gt('expira', datetime.datetime.now().isoformat()) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Código inválido o expirado'}), 400
        
        return jsonify({'success': True, 'message': 'Código válido'}), 200
        
    except Exception as e:
        logger.error(f"Error verificando código: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


@login_bp.route('/api/recuperar/cambiar', methods=['POST'])
def cambiar_contrasena():
    """Cambiar contraseña después de verificación"""
    try:
        data = request.get_json()
        email = data.get('email')
        codigo = data.get('codigo')
        nueva_contrasena = data.get('nueva_contrasena')
        
        if not email or not codigo or not nueva_contrasena:
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
        
        codigo_id = codigo_result.data[0]['id']
        
        staff_result = supabase.table('usuario').select('id').eq('email', email).execute()
        
        if staff_result.data:
            nueva_hash = generate_password_hash(nueva_contrasena)
            supabase.table('usuario').update({'contrasenia': nueva_hash}).eq('email', email).execute()
        else:
            cliente_result = supabase.table('cliente').select('id_usuario').eq('email', email).execute()
            if cliente_result.data and cliente_result.data[0].get('id_usuario'):
                nueva_hash = generate_password_hash(nueva_contrasena)
                supabase.table('usuario').update({'contrasenia': nueva_hash}).eq('id', cliente_result.data[0]['id_usuario']).execute()
            else:
                return jsonify({'error': 'Usuario no encontrado'}), 404
        
        supabase.table('codigoverificacion').update({'usado': True}).eq('id', codigo_id).execute()
        
        return jsonify({'success': True, 'message': 'Contraseña actualizada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error cambiando contraseña: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


# =====================================================
# ENDPOINTS DE REGISTRO DE CLIENTE
# =====================================================

@login_bp.route('/api/registro/solicitar', methods=['POST'])
def solicitar_registro_cliente():
    """Solicitar registro como cliente - enviar código de verificación"""
    try:
        data = request.get_json()
        
        nombre = data.get('nombre')
        email = data.get('email')
        telefono = data.get('telefono')
        direccion = data.get('direccion')
        password = data.get('password')
        
        if not all([nombre, email, telefono, direccion, password]):
            return jsonify({'error': 'Todos los campos son requeridos'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'La contraseña debe tener al menos 6 caracteres'}), 400
        
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Email inválido'}), 400
        
        cliente_existente = supabase.table('cliente').select('id').eq('email', email).execute()
        if cliente_existente.data:
            return jsonify({'error': 'El email ya está registrado'}), 400
        
        codigo = generar_codigo_verificacion()
        expira = datetime.datetime.now() + datetime.timedelta(minutes=15)
        
        supabase.table('codigoverificacion').insert({
            'email': email,
            'codigo': codigo,
            'tipo': 'registro_cliente',
            'expira': expira.isoformat(),
            'datos_extra': {
                'nombre': nombre,
                'telefono': telefono,
                'direccion': direccion,
                'password': generate_password_hash(password)
            }
        }).execute()
        
        asunto = "✅ Código de verificación - FURIA MOTOR"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: 'Plus Jakarta Sans'; text-align: center; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden;">
                <div style="background: #C1121F; padding: 30px;"><h1 style="color: white;">FURIA MOTOR</h1></div>
                <div style="padding: 30px;">
                    <h2>Código de verificación</h2>
                    <p>Hola <strong>{nombre}</strong>,</p>
                    <p>Usa el siguiente código para completar tu registro:</p>
                    <div style="font-size: 32px; font-weight: bold; color: #C1121F; background: #f5f5f5; padding: 15px; border-radius: 12px;">{codigo}</div>
                    <p>Expira en <strong>15 minutos</strong>.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(email, asunto, cuerpo_html)
        
        return jsonify({
            'success': True,
            'message': 'Código enviado a tu correo electrónico',
            'email': email
        }), 200
        
    except Exception as e:
        logger.error(f"Error en solicitud de registro: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


@login_bp.route('/api/registro/confirmar', methods=['POST'])
def confirmar_registro_cliente():
    """Confirmar registro de cliente con código de verificación"""
    try:
        data = request.get_json()
        email = data.get('email')
        codigo = data.get('codigo')
        
        if not email or not codigo:
            return jsonify({'error': 'Email y código requeridos'}), 400
        
        codigo_result = supabase.table('codigoverificacion') \
            .select('*') \
            .eq('email', email) \
            .eq('codigo', codigo) \
            .eq('tipo', 'registro_cliente') \
            .eq('usado', False) \
            .gt('expira', datetime.datetime.now().isoformat()) \
            .execute()
        
        if not codigo_result.data:
            return jsonify({'error': 'Código inválido o expirado'}), 400
        
        datos_extra = codigo_result.data[0].get('datos_extra', {})
        
        usuario_result = supabase.table('usuario').insert({
            'nombre': datos_extra.get('nombre'),
            'email': email,
            'contrasenia': datos_extra.get('password'),
            'contacto': datos_extra.get('telefono'),
            'ubicacion': datos_extra.get('direccion'),
            'fecha_registro': datetime.datetime.now().isoformat()
        }).execute()
        
        if not usuario_result.data:
            return jsonify({'error': 'Error al crear usuario'}), 500
        
        id_usuario = usuario_result.data[0]['id']
        
        cliente_result = supabase.table('cliente').insert({
            'nombre': datos_extra.get('nombre'),
            'email': email,
            'telefono': datos_extra.get('telefono'),
            'direccion': datos_extra.get('direccion'),
            'id_usuario': id_usuario,
            'fecha_registro': datetime.datetime.now().isoformat()
        }).execute()
        
        if not cliente_result.data:
            return jsonify({'error': 'Error al crear cliente'}), 500
        
        supabase.table('codigoverificacion').update({'usado': True}).eq('id', codigo_result.data[0]['id']).execute()
        
        return jsonify({
            'success': True,
            'message': 'Registro completado exitosamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error confirmando registro: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


@login_bp.route('/api/registro/vehiculo', methods=['POST'])
def registrar_vehiculo_existente():
    """Registrar vehículo para cliente existente"""
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
        
        cliente_result = supabase.table('cliente').select('id').eq('email', email).execute()
        
        if not cliente_result.data:
            return jsonify({'error': 'Cliente no encontrado. Debes registrarte primero.'}), 404
        
        id_cliente = cliente_result.data[0]['id']
        
        placa_existente = supabase.table('vehiculo').select('id').eq('placa', placa).execute()
        if placa_existente.data:
            return jsonify({'error': 'La placa ya está registrada'}), 400
        
        vehiculo_result = supabase.table('vehiculo').insert({
            'placa': placa,
            'marca': marca,
            'modelo': modelo,
            'anio': anio if anio else None,
            'color': color if color else None,
            'id_cliente': id_cliente
        }).execute()
        
        if not vehiculo_result.data:
            return jsonify({'error': 'Error al registrar vehículo'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Vehículo registrado exitosamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error registrando vehículo: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


# =====================================================
# ENDPOINTS DE REGISTRO DE PERSONAL
# =====================================================

@login_bp.route('/api/registro/personal/solicitar', methods=['POST'])
def solicitar_registro_personal():
    """Solicitar registro como personal del taller"""
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
        
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Email inválido'}), 400
        
        if not documento.isdigit():
            return jsonify({'error': 'El número de documento debe contener solo dígitos'}), 400
        
        if len(documento) < 5 or len(documento) > 15:
            return jsonify({'error': 'El documento debe tener entre 5 y 15 dígitos'}), 400
        
        user_existente = supabase.table('usuario').select('id').eq('email', email).execute()
        if user_existente.data:
            return jsonify({'error': 'El email ya está registrado'}), 400
        
        doc_existente = supabase.table('usuario').select('id').eq('numero_documento', documento).execute()
        if doc_existente.data:
            return jsonify({'error': 'El número de documento ya está registrado'}), 400
        
        solicitud_existente = supabase.table('solicitudregistropersonal') \
            .select('id') \
            .eq('email', email) \
            .eq('estado', 'pendiente') \
            .execute()
        
        if solicitud_existente.data:
            return jsonify({'error': 'Ya tienes una solicitud pendiente de aprobación'}), 400
        
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
        
        rol_result = supabase.table('rol').select('nombre_rol').eq('id', id_rol).execute()
        nombre_rol = rol_result.data[0]['nombre_rol'] if rol_result.data else 'Personal'
        
        admin_email = 'vaniacarrasco68056530@gmail.com'
        
        base_url = 'http://localhost:5000'
        aprobar_url = f"{base_url}/api/registro/personal/aprobar/{solicitud_result.data[0]['id']}"
        rechazar_url = f"{base_url}/api/registro/personal/rechazar/{solicitud_result.data[0]['id']}"
        
        asunto = f"🔔 NUEVA SOLICITUD DE REGISTRO - {nombre}"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: 'Plus Jakarta Sans'; text-align: center; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px;">
                <div style="background: #C1121F; padding: 30px;"><h1 style="color: white;">Nueva Solicitud</h1></div>
                <div style="padding: 30px;">
                    <p><strong>👤 Nombre:</strong> {nombre}</p>
                    <p><strong>📧 Email:</strong> {email}</p>
                    <p><strong>🆔 Documento:</strong> {documento}</p>
                    <p><strong>🎯 Rol:</strong> {nombre_rol}</p>
                    <div style="margin-top: 20px;">
                        <a href="{aprobar_url}" style="background: #10B981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; margin: 5px;">✓ APROBAR</a>
                        <a href="{rechazar_url}" style="background: #C1121F; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; margin: 5px;">✗ RECHAZAR</a>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(admin_email, asunto, cuerpo_html)
        
        return jsonify({
            'success': True,
            'message': '✅ Solicitud enviada exitosamente',
            'solicitud_id': solicitud_result.data[0]['id']
        }), 200
        
    except Exception as e:
        logger.error(f"Error en solicitud: {str(e)}")
        return jsonify({'error': f'Error interno: {str(e)}'}), 500


@login_bp.route('/api/registro/personal/aprobar/<int:solicitud_id>', methods=['GET'])
def aprobar_solicitud_personal(solicitud_id):
    """Endpoint para aprobar solicitud"""
    try:
        solicitud_result = supabase.table('solicitudregistropersonal') \
            .select('*') \
            .eq('id', solicitud_id) \
            .eq('estado', 'pendiente') \
            .execute()
        
        if not solicitud_result.data:
            return "Solicitud no encontrada", 404
        
        solicitud = solicitud_result.data[0]
        
        user_existente = supabase.table('usuario').select('id').eq('email', solicitud['email']).execute()
        if user_existente.data:
            return "El usuario ya existe", 400
        
        usuario_result = supabase.table('usuario').insert({
            'nombre': solicitud['nombre'],
            'numero_documento': solicitud['numero_documento'],
            'contacto': solicitud.get('telefono', ''),
            'ubicacion': solicitud.get('direccion', ''),
            'email': solicitud['email'],
            'contrasenia': solicitud.get('contrasenia_temporal', generate_password_hash('furia123')),
            'fecha_registro': datetime.datetime.now().isoformat()
        }).execute()
        
        if not usuario_result.data:
            return "Error al crear usuario", 500
        
        id_usuario = usuario_result.data[0]['id']
        
        supabase.table('usuario_rol').insert({
            'id_usuario': id_usuario,
            'id_rol': solicitud['id_rol_solicitado'],
            'fecha_asignacion': datetime.datetime.now().isoformat(),
            'asignado_por': None
        }).execute()
        
        supabase.table('solicitudregistropersonal').update({
            'estado': 'aprobado',
            'fecha_respuesta': datetime.datetime.now().isoformat()
        }).eq('id', solicitud_id).execute()
        
        asunto = "✅ ¡Tu registro ha sido aprobado! - FURIA MOTOR"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <body style="text-align: center;">
            <h2 style="color: #10B981;">✅ ¡Bienvenido!</h2>
            <p>Hola {solicitud['nombre']}, tu solicitud ha sido <strong>APROBADA</strong>.</p>
            <p>Ahora puedes iniciar sesión.</p>
            <a href="http://localhost:5000/">Iniciar sesión</a>
        </body>
        </html>
        """
        
        enviar_email(solicitud['email'], asunto, cuerpo_html)
        
        return "<h2 style='color: green;'>✅ Solicitud aprobada</h2><p>Usuario registrado exitosamente.</p><a href='/'>Volver</a>"
        
    except Exception as e:
        logger.error(f"Error aprobando: {str(e)}")
        return f"Error: {str(e)}", 500


@login_bp.route('/api/registro/personal/rechazar/<int:solicitud_id>', methods=['GET'])
def rechazar_solicitud_personal(solicitud_id):
    """Endpoint para rechazar solicitud"""
    try:
        solicitud_result = supabase.table('solicitudregistropersonal') \
            .select('*') \
            .eq('id', solicitud_id) \
            .eq('estado', 'pendiente') \
            .execute()
        
        if not solicitud_result.data:
            return "Solicitud no encontrada", 404
        
        solicitud = solicitud_result.data[0]
        
        supabase.table('solicitudregistropersonal').update({
            'estado': 'rechazado',
            'fecha_respuesta': datetime.datetime.now().isoformat()
        }).eq('id', solicitud_id).execute()
        
        asunto = "📋 Actualización sobre tu solicitud - FURIA MOTOR"
        cuerpo_html = f"""
        <html>
        <body style="text-align: center;">
            <h2 style="color: #C1121F;">❌ Solicitud no aprobada</h2>
            <p>Hola {solicitud['nombre']}, tu solicitud no ha sido aprobada.</p>
        </body>
        </html>
        """
        
        enviar_email(solicitud['email'], asunto, cuerpo_html)
        
        return "<h2 style='color: red;'>❌ Solicitud rechazada</h2><a href='/'>Volver</a>"
        
    except Exception as e:
        logger.error(f"Error rechazando: {str(e)}")
        return f"Error: {str(e)}", 500


# =====================================================
# OTROS ENDPOINTS
# =====================================================

@login_bp.route('/api/roles', methods=['GET'])
def obtener_roles():
    """Obtener lista de roles disponibles"""
    try:
        result = supabase.table('rol').select('id, nombre_rol, descripcion').execute()
        roles = [
            {'id': r['id'], 'nombre': r['nombre_rol'], 'descripcion': r.get('descripcion', '')}
            for r in (result.data if result.data else [])
        ]
        return jsonify(roles), 200
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return jsonify({'error': str(e)}), 500


@login_bp.route('/api/verify-token', methods=['GET'])
@token_required
def verify_token(current_user):
    """Verificar token"""
    return jsonify({'valid': True, 'user': current_user}), 200


@login_bp.route('/api/logout', methods=['POST'])
def logout():
    """Cerrar sesión"""
    return jsonify({'success': True, 'message': 'Sesión cerrada'}), 200


@login_bp.route('/api/health', methods=['GET'])
def health_check():
    """Health check"""
    return jsonify({
        'status': 'ok',
        'message': 'Servidor FURIA MOTOR funcionando',
        'timestamp': datetime.datetime.now().isoformat()
    }), 200