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
    'email_password': 'uahnoblikntnqlbk',  # Contraseña de aplicación sin espacios
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
        # Verificar configuración - REMUEVE ESTA VALIDACIÓN
        # if EMAIL_CONFIG['email_password'] == 'gmuhjextdixawkk':
        #     logger.info(f"⚠️ MODO DESARROLLO - Email simulado a: {destinatario}")
        #     logger.info(f"Asunto: {asunto}")
        #     logger.info(f"Cuerpo: {cuerpo_html[:200]}...")
        #     return True
        
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

def crear_notificacion_admin(tipo, titulo, mensaje):
    """Crear notificación para el Administrador General"""
    try:
        admin_result = supabase.table('usuario').select('id').eq('id_rol', 1).limit(1).execute()
        
        if admin_result.data:
            supabase.table('notificacion').insert({
                'id_usuario_destino': admin_result.data[0]['id'],
                'tipo': tipo,
                'mensaje': f"{titulo}: {mensaje}",
                'fecha_envio': datetime.datetime.now().isoformat()
            }).execute()
            logger.info(f"📢 Notificación creada para admin: {titulo}")
    except Exception as e:
        logger.error(f"Error creando notificación: {str(e)}")

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
            
            roles_result = supabase.table('rol').select('id, nombre_rol').execute()
            roles = {r['id']: r['nombre_rol'] for r in roles_result.data} if roles_result.data else {}
            
            # CORREGIDO: Usar filter con operadores en lugar de or_
            result = supabase.table('usuario') \
                .select('*') \
                .filter('numero_documento', 'eq', identifier) \
                .filter('email', 'eq', identifier) \
                .execute()
            
            # Alternativa: Hacer dos consultas separadas
            if not result.data:
                # Buscar por email si no se encontró por documento
                result = supabase.table('usuario') \
                    .select('*') \
                    .eq('email', identifier) \
                    .execute()
                
                if not result.data:
                    # Buscar por documento
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
            
            rol_nombre = roles.get(user['id_rol'], 'desconocido')
            logger.info(f"✅ Login exitoso: {user['nombre']} - Rol: {rol_nombre}")
            
            token = jwt.encode({
                'user': {
                    'id': user['id'],
                    'nombre': user['nombre'],
                    'documento': user.get('numero_documento', ''),
                    'email': user.get('email', ''),
                    'id_rol': user['id_rol'],
                    'rol': rol_nombre,
                    'type': 'staff'
                },
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, SECRET_KEY, algorithm="HS256")
            
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
                    'documento': user.get('numero_documento', ''),
                    'email': user.get('email', ''),
                    'rol': rol_nombre,
                    'type': 'staff'
                },
                'redirect': role_redirects.get(rol_nombre, '/dashboard.html')
            }), 200
            
        elif user_type == 'client':
            # LOGIN PARA CLIENTES (también necesita corrección)
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
            
            token = jwt.encode({
                'user': {
                    'id_cliente': cliente['id'],
                    'nombre': user['nombre'] if user else cliente.get('nombre', 'Cliente'),
                    'email': cliente.get('email', ''),
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
                    'type': 'client'
                },
                'redirect': '/cliente/misvehiculos.html'
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
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: 'Plus Jakarta Sans', sans-serif; background: #f5f5f5; padding: 20px; }}
                .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }}
                .header {{ background: #C1121F; padding: 30px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; text-align: center; }}
                .codigo {{ font-size: 32px; font-weight: bold; color: #C1121F; letter-spacing: 5px; background: #f5f5f5; padding: 15px; border-radius: 12px; margin: 20px 0; font-family: monospace; }}
                .footer {{ background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>FURIA MOTOR COMPANY</h1>
                </div>
                <div class="content">
                    <h2>Recuperación de contraseña</h2>
                    <p>Hola <strong>{nombre_usuario}</strong>,</p>
                    <p>Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código:</p>
                    <div class="codigo">{codigo}</div>
                    <p>Este código expirará en <strong>15 minutos</strong>.</p>
                    <p>Si no solicitaste este cambio, ignora este mensaje.</p>
                </div>
                <div class="footer">
                    <p>© 2026 FURIA MOTOR COMPANY. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(email, asunto, cuerpo_html)
        crear_notificacion_admin('recuperacion', 'Solicitud de recuperación', f'{nombre_usuario} solicitó recuperar contraseña')
        
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
        
        # Verificar si ya existe
        user_existente = supabase.table('usuario').select('id').eq('email', email).execute()
        if user_existente.data:
            return jsonify({'error': 'El email ya está registrado'}), 400
        
        # Verificar si ya existe usuario con ese documento
        doc_existente = supabase.table('usuario').select('id').eq('numero_documento', documento).execute()
        if doc_existente.data:
            return jsonify({'error': 'El número de documento ya está registrado'}), 400
        
        # Verificar solicitud pendiente
        solicitud_existente = supabase.table('solicitudregistropersonal') \
            .select('id') \
            .eq('email', email) \
            .eq('estado', 'pendiente') \
            .execute()
        
        if solicitud_existente.data:
            return jsonify({'error': 'Ya tienes una solicitud pendiente de aprobación'}), 400
        
        # Hashear contraseña
        hashed_password = generate_password_hash(password)
        
        # Insertar solicitud
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
        
        # Obtener nombre del rol
        rol_result = supabase.table('rol').select('nombre_rol').eq('id', id_rol).execute()
        nombre_rol = rol_result.data[0]['nombre_rol'] if rol_result.data else 'Personal'
        
        # Enviar email al administrador
        admin_email = 'vaniacarrasco68056530@gmail.com'
        
        base_url = 'http://localhost:5000'
        aprobar_url = f"{base_url}/api/registro/personal/aprobar/{solicitud_result.data[0]['id']}"
        rechazar_url = f"{base_url}/api/registro/personal/rechazar/{solicitud_result.data[0]['id']}"
        
        asunto = f"🔔 NUEVA SOLICITUD DE REGISTRO - {nombre}"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: 'Plus Jakarta Sans', sans-serif; background: #f5f5f5; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }}
                .header {{ background: #C1121F; padding: 30px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; }}
                .info {{ background: #f5f5f5; padding: 20px; border-radius: 12px; margin: 20px 0; }}
                .info-item {{ margin-bottom: 10px; }}
                .info-label {{ font-weight: bold; color: #C1121F; width: 120px; display: inline-block; }}
                .buttons {{ display: flex; gap: 15px; justify-content: center; margin-top: 30px; }}
                .btn {{ padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; text-align: center; display: inline-block; }}
                .btn-aprobar {{ background: #10B981; color: white; }}
                .btn-rechazar {{ background: #C1121F; color: white; }}
                .footer {{ background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>FURIA MOTOR COMPANY</h1>
                </div>
                <div class="content">
                    <h2>📋 Nueva solicitud de registro</h2>
                    <p>Se ha recibido una nueva solicitud de registro en el sistema:</p>
                    
                    <div class="info">
                        <div class="info-item"><span class="info-label">👤 Nombre:</span> {nombre}</div>
                        <div class="info-item"><span class="info-label">📧 Email:</span> {email}</div>
                        <div class="info-item"><span class="info-label">🆔 Documento:</span> {documento}</div>
                        <div class="info-item"><span class="info-label">📞 Teléfono:</span> {telefono or 'No especificado'}</div>
                        <div class="info-item"><span class="info-label">📍 Dirección:</span> {direccion or 'No especificada'}</div>
                        <div class="info-item"><span class="info-label">🎯 Rol solicitado:</span> <strong>{nombre_rol}</strong></div>
                    </div>
                    
                    <div class="buttons">
                        <a href="{aprobar_url}" class="btn btn-aprobar">✓ APROBAR SOLICITUD</a>
                        <a href="{rechazar_url}" class="btn btn-rechazar">✗ RECHAZAR SOLICITUD</a>
                    </div>
                    <p style="margin-top: 20px; font-size: 12px; color: #666;">Este enlace expirará en 7 días.</p>
                </div>
                <div class="footer">
                    <p>© 2026 FURIA MOTOR COMPANY. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(admin_email, asunto, cuerpo_html)
        
        return jsonify({
            'success': True,
            'message': '✅ Solicitud enviada exitosamente. Revisa tu correo para confirmación.',
            'solicitud_id': solicitud_result.data[0]['id']
        }), 200
        
    except Exception as e:
        logger.error(f"Error en solicitud de registro personal: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Error interno del servidor: {str(e)}'}), 500


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
            return """
            <html><body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: #C1121F;">❌ Solicitud no encontrada</h1>
                <p>La solicitud ya fue procesada o no existe.</p>
                <a href="/">Volver al inicio</a>
            </body></html>
            """, 404
        
        solicitud = solicitud_result.data[0]
        
        # Verificar si el usuario ya existe
        user_existente = supabase.table('usuario').select('id').eq('email', solicitud['email']).execute()
        if user_existente.data:
            return """
            <html><body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: #C1121F;">❌ Error</h1>
                <p>El usuario ya existe en el sistema.</p>
                <a href="/">Volver al inicio</a>
            </body></html>
            """, 400
        
        # Crear usuario
        usuario_result = supabase.table('usuario').insert({
            'id_rol': solicitud['id_rol_solicitado'],
            'nombre': solicitud['nombre'],
            'numero_documento': solicitud['numero_documento'],
            'contacto': solicitud.get('telefono', ''),
            'ubicacion': solicitud.get('direccion', ''),
            'email': solicitud['email'],
            'contrasenia': solicitud.get('contrasenia_temporal', generate_password_hash('furia123')),
            'fecha_registro': datetime.datetime.now().isoformat()
        }).execute()
        
        if not usuario_result.data:
            return """
            <html><body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: #C1121F;">❌ Error al crear usuario</h1>
                <a href="/">Volver al inicio</a>
            </body></html>
            """, 500
        
        # Actualizar solicitud
        supabase.table('solicitudregistropersonal').update({
            'estado': 'aprobado',
            'fecha_respuesta': datetime.datetime.now().isoformat()
        }).eq('id', solicitud_id).execute()
        
        # Email de confirmación
        asunto = "✅ ¡Tu registro ha sido aprobado! - FURIA MOTOR"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: 'Plus Jakarta Sans'; text-align: center; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden;">
                <div style="background: #10B981; padding: 30px;"><h1 style="color: white;">✅ ¡Bienvenido!</h1></div>
                <div style="padding: 30px;">
                    <h2>Hola {solicitud['nombre']}</h2>
                    <p>Tu solicitud de registro ha sido <strong>APROBADA</strong>.</p>
                    <p>Ahora puedes iniciar sesión con las credenciales que registraste:</p>
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>📧 Email:</strong> {solicitud['email']}</p>
                        <p><strong>🆔 Documento:</strong> {solicitud['numero_documento']}</p>
                    </div>
                    <a href="http://localhost:5000/" style="display: inline-block; padding: 12px 24px; background: #C1121F; color: white; text-decoration: none; border-radius: 8px;">Iniciar sesión</a>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(solicitud['email'], asunto, cuerpo_html)
        
        return """
        <html><body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #10B981;">✅ Solicitud aprobada</h1>
            <p>El usuario ha sido registrado exitosamente.</p>
            <p>Se ha enviado un correo de confirmación.</p>
            <a href="/">Volver al inicio</a>
        </body></html>
        """
        
    except Exception as e:
        logger.error(f"Error aprobando solicitud: {str(e)}")
        return f"""
        <html><body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #C1121F;">❌ Error</h1>
            <p>Ocurrió un error: {str(e)}</p>
            <a href="/">Volver al inicio</a>
        </body></html>
        """, 500


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
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial; text-align: center; padding: 20px;">
            <div style="background: #C1121F; padding: 20px;"><h1 style="color: white;">❌ Solicitud no aprobada</h1></div>
            <h2>Hola {solicitud['nombre']}</h2>
            <p>Lamentamos informarte que tu solicitud de registro no ha sido aprobada en este momento.</p>
            <p>Si consideras que esto es un error, por favor contacta al administrador.</p>
        </body>
        </html>
        """
        
        enviar_email(solicitud['email'], asunto, cuerpo_html)
        
        return """
        <html><body style="text-align: center; padding: 50px;">
            <h1 style="color: #C1121F;">❌ Solicitud rechazada</h1>
            <p>Se ha notificado al solicitante.</p>
            <a href="/">Volver al inicio</a>
        </body></html>
        """
        
    except Exception as e:
        logger.error(f"Error rechazando solicitud: {str(e)}")
        return str(e), 500


@login_bp.route('/api/roles', methods=['GET'])
def obtener_roles():
    """Obtener lista de roles disponibles"""
    try:
        result = supabase.table('rol').select('id, nombre_rol').execute()
        roles = [
            {'id': r['id'], 'nombre': r['nombre_rol']}
            for r in (result.data if result.data else [])
        ]
        return jsonify(roles), 200
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# OTROS ENDPOINTS
# =====================================================

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


@login_bp.route('/api/registro/cliente/solicitar', methods=['POST'])
def solicitar_registro_cliente():
    """Solicitar registro de cliente"""
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
        
        email_existente = supabase.table('cliente').select('id').eq('email', email).execute()
        if email_existente.data:
            return jsonify({'error': 'El correo ya está registrado'}), 400
        
        codigo = generar_codigo_verificacion()
        expira = datetime.datetime.now() + datetime.timedelta(minutes=15)
        
        supabase.table('codigoverificacion').insert({
            'email': email,
            'codigo': codigo,
            'tipo': 'register_confirm',
            'expira': expira.isoformat(),
            'datos_extra': {
                'nombre': nombre,
                'telefono': telefono,
                'direccion': direccion,
                'password': generate_password_hash(password)
            }
        }).execute()
        
        asunto = "Verifica tu correo - FURIA MOTOR"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial; text-align: center;">
            <h2>Verifica tu correo electrónico</h2>
            <p>Hola {nombre},</p>
            <p>Tu código de verificación es: <strong style="font-size: 24px; color: #C1121F;">{codigo}</strong></p>
            <p>Expira en 15 minutos.</p>
        </body>
        </html>
        """
        
        enviar_email(email, asunto, cuerpo_html)
        
        return jsonify({'success': True, 'message': 'Código enviado a tu correo', 'email': email}), 200
        
    except Exception as e:
        logger.error(f"Error en solicitud de registro cliente: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


@login_bp.route('/api/registro/cliente/confirmar', methods=['POST'])
def confirmar_registro_cliente():
    """Confirmar registro de cliente"""
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
            .eq('tipo', 'register_confirm') \
            .eq('usado', False) \
            .gt('expira', datetime.datetime.now().isoformat()) \
            .execute()
        
        if not codigo_result.data:
            return jsonify({'error': 'Código inválido o expirado'}), 400
        
        datos_extra = codigo_result.data[0].get('datos_extra', {})
        
        user_result = supabase.table('usuario').insert({
            'id_rol': 6,
            'nombre': datos_extra.get('nombre'),
            'contacto': datos_extra.get('telefono'),
            'ubicacion': datos_extra.get('direccion'),
            'contrasenia': datos_extra.get('password'),
            'email': email,
            'fecha_registro': datetime.datetime.now().isoformat()
        }).execute()
        
        if not user_result.data:
            return jsonify({'error': 'Error al crear usuario'}), 500
        
        id_usuario = user_result.data[0]['id']
        
        cliente_result = supabase.table('cliente').insert({
            'id_usuario': id_usuario,
            'email': email,
            'tipo_documento': 'CI',
            'numero_documento': f"TEMP-{datetime.datetime.now().timestamp()}"
        }).execute()
        
        if not cliente_result.data:
            supabase.table('usuario').delete().eq('id', id_usuario).execute()
            return jsonify({'error': 'Error al crear cliente'}), 500
        
        supabase.table('codigoverificacion').update({'usado': True}).eq('id', codigo_result.data[0]['id']).execute()
        
        return jsonify({'success': True, 'message': 'Registro completado exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error confirmando registro: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500
# =====================================================
# ENDPOINTS DE RECUPERACIÓN DE CONTRASEÑA POR DOCUMENTO
# =====================================================

@login_bp.route('/api/recuperar/solicitar-por-documento', methods=['POST'])
def solicitar_recuperacion_por_documento():
    """Solicitar código de recuperación usando número de documento"""
    try:
        data = request.get_json()
        documento = data.get('documento')
        
        if not documento:
            return jsonify({'error': 'Número de documento requerido'}), 400
        
        if not documento.isdigit():
            return jsonify({'error': 'El documento debe contener solo números'}), 400
        
        # Buscar usuario por documento
        user_result = supabase.table('usuario') \
            .select('id, nombre, email, numero_documento') \
            .eq('numero_documento', documento) \
            .execute()
        
        if not user_result.data:
            return jsonify({'error': 'No se encontró un usuario con ese número de documento'}), 404
        
        user = user_result.data[0]
        email = user.get('email')
        
        if not email:
            return jsonify({'error': 'El usuario no tiene un correo electrónico registrado'}), 400
        
        # Generar código
        codigo = generar_codigo_verificacion()
        expira = datetime.datetime.now() + datetime.timedelta(minutes=15)
        
        # Guardar código
        supabase.table('codigoverificacion').insert({
            'email': email,
            'codigo': codigo,
            'tipo': 'reset_password',
            'expira': expira.isoformat(),
            'datos_extra': {'documento': documento}
        }).execute()
        
        # Enviar email
        asunto = "🔐 Código de recuperación - FURIA MOTOR"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: 'Plus Jakarta Sans', sans-serif; background: #f5f5f5; padding: 20px; }}
                .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }}
                .header {{ background: #C1121F; padding: 30px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; text-align: center; }}
                .codigo {{ font-size: 32px; font-weight: bold; color: #C1121F; letter-spacing: 5px; background: #f5f5f5; padding: 15px; border-radius: 12px; margin: 20px 0; font-family: monospace; }}
                .footer {{ background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>FURIA MOTOR COMPANY</h1>
                </div>
                <div class="content">
                    <h2>Código de recuperación</h2>
                    <p>Hola <strong>{user['nombre']}</strong>,</p>
                    <p>Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código:</p>
                    <div class="codigo">{codigo}</div>
                    <p>Este código expirará en <strong>15 minutos</strong>.</p>
                    <p>Si no solicitaste este cambio, ignora este mensaje.</p>
                </div>
                <div class="footer">
                    <p>© 2026 FURIA MOTOR COMPANY. Todos los derechos reservados.</p>
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
        logger.error(f"Error en solicitud de recuperación por documento: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


@login_bp.route('/api/recuperar/verificar-por-documento', methods=['POST'])
def verificar_codigo_por_documento():
    """Verificar código de recuperación por documento"""
    try:
        data = request.get_json()
        documento = data.get('documento')
        codigo = data.get('codigo')
        
        if not documento or not codigo:
            return jsonify({'error': 'Documento y código requeridos'}), 400
        
        # Buscar usuario por documento
        user_result = supabase.table('usuario') \
            .select('email') \
            .eq('numero_documento', documento) \
            .execute()
        
        if not user_result.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        email = user_result.data[0]['email']
        
        # Verificar código
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


@login_bp.route('/api/recuperar/cambiar-por-documento', methods=['POST'])
def cambiar_contrasena_por_documento():
    """Cambiar contraseña usando número de documento"""
    try:
        data = request.get_json()
        documento = data.get('documento')
        nueva_contrasena = data.get('nueva_contrasena')
        
        if not documento or not nueva_contrasena:
            return jsonify({'error': 'Documento y nueva contraseña requeridos'}), 400
        
        if len(nueva_contrasena) < 6:
            return jsonify({'error': 'La contraseña debe tener al menos 6 caracteres'}), 400
        
        # Buscar usuario por documento
        user_result = supabase.table('usuario') \
            .select('id, email') \
            .eq('numero_documento', documento) \
            .execute()
        
        if not user_result.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        user = user_result.data[0]
        
        # Actualizar contraseña
        nueva_hash = generate_password_hash(nueva_contrasena)
        supabase.table('usuario').update({'contrasenia': nueva_hash}).eq('id', user['id']).execute()
        
        # Marcar todos los códigos pendientes como usados
        supabase.table('codigoverificacion') \
            .update({'usado': True}) \
            .eq('email', user['email']) \
            .eq('tipo', 'reset_password') \
            .eq('usado', False) \
            .execute()
        
        # Enviar email de confirmación
        asunto = "🔐 Contraseña actualizada - FURIA MOTOR"
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: 'Plus Jakarta Sans'; text-align: center; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden;">
                <div style="background: #10B981; padding: 30px;"><h1 style="color: white;">✅ Contraseña actualizada</h1></div>
                <div style="padding: 30px;">
                    <h2>Hola</h2>
                    <p>Tu contraseña ha sido actualizada exitosamente.</p>
                    <p>Si no realizaste este cambio, por favor contacta al administrador.</p>
                    <a href="http://localhost:5000/" style="display: inline-block; padding: 12px 24px; background: #C1121F; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px;">Iniciar sesión</a>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(user['email'], asunto, cuerpo_html)
        
        return jsonify({'success': True, 'message': 'Contraseña actualizada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error cambiando contraseña: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500