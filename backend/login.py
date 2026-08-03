# =====================================================
# LOGIN Y AUTENTICACIÓN - FURIA MOTOR COMPANY SRL
# VERSIÓN COMPLETA CON APROBACIÓN DE SOLICITUDES
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
    'email_password': 'uahnoblikntnqlbk',  # Cambiar por tu contraseña
    'from_name': 'FURIA MOTOR COMPANY'
}

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def generar_codigo_verificacion():
    return ''.join(random.choices(string.digits, k=6))

def generar_token_aprobacion(solicitud_id):
    """Generar token JWT para aprobación de solicitud (expira en 7 días)"""
    payload = {
        'solicitud_id': solicitud_id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7),
        'type': 'aprobacion'
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def enviar_email(destinatario, asunto, cuerpo_html):
    """Enviar correo usando SMTP"""
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
    """Obtener roles de un usuario desde la tabla usuario_rol - CON LOGS Y NORMALIZACIÓN"""
    try:
        logger.info(f"🔍 [LOGIN] Buscando roles para usuario ID: {id_usuario}")
        
        user_roles = supabase.table('usuario_rol') \
            .select('id_rol') \
            .eq('id_usuario', id_usuario) \
            .execute()
        
        logger.info(f"📊 [LOGIN] Resultado usuario_rol: {user_roles.data}")
        
        if not user_roles.data:
            logger.warning(f"⚠️ [LOGIN] No se encontraron roles para usuario {id_usuario}")
            return []
        
        rol_ids = [ur['id_rol'] for ur in user_roles.data if ur.get('id_rol')]
        logger.info(f"📊 [LOGIN] IDs de roles encontrados: {rol_ids}")
        
        if not rol_ids:
            logger.warning(f"⚠️ [LOGIN] No hay IDs de roles válidos")
            return []
        
        roles_data = supabase.table('rol') \
            .select('nombre_rol') \
            .in_('id', rol_ids) \
            .execute()
        
        logger.info(f"📊 [LOGIN] Datos de roles desde tabla rol: {roles_data.data}")
        
        roles_originales = [r['nombre_rol'] for r in (roles_data.data or [])]
        logger.info(f"📋 [LOGIN] Roles originales desde BD: {roles_originales}")
        
        roles_normalizados = []
        for rol in roles_originales:
            rol_lower = rol.lower()
            if rol_lower == 'tecnico_mecanico':
                roles_normalizados.append('tecnico')
                logger.info(f"🔄 [LOGIN] Normalizado: '{rol}' → 'tecnico'")
            elif rol_lower == 'tecnico':
                roles_normalizados.append('tecnico')
                logger.info(f"✅ [LOGIN] Manteniendo: '{rol}'")
            else:
                roles_normalizados.append(rol_lower)
                logger.info(f"✅ [LOGIN] Manteniendo: '{rol}'")
        
        roles_normalizados = list(set(roles_normalizados))
        logger.info(f"✅ [LOGIN] Roles finales normalizados: {roles_normalizados}")
        
        return roles_normalizados
        
    except Exception as e:
        logger.error(f"❌ [LOGIN] Error obteniendo roles: {str(e)}")
        import traceback
        traceback.print_exc()
        return []

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
            
            if 'user' in data:
                current_user = data['user']
            else:
                current_user = data
            
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
# ENDPOINT PRINCIPAL DE LOGIN
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
            
            if not check_password_hash(user['contrasenia'], password):
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            nombres_roles = obtener_roles_usuario(user['id'])
            
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
            placa = identifier.upper()
            
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
            
            user_result = supabase.table('usuario') \
                .select('id, nombre, contacto, contrasenia, email') \
                .eq('id', id_usuario) \
                .execute()
            
            if not user_result.data:
                return jsonify({'error': 'Usuario no encontrado'}), 401
            
            user = user_result.data[0]
            
            if not check_password_hash(user['contrasenia'], password):
                logger.warning(f"Contraseña incorrecta para cliente con placa: {placa}")
                return jsonify({'error': 'Credenciales inválidas'}), 401
            
            roles_usuario = obtener_roles_usuario(user['id'])
            if 'cliente' not in roles_usuario:
                roles_usuario.append('cliente')
            
            email_cliente = cliente.get('email') or user.get('email', '')
            telefono_cliente = user.get('contacto', '')
            
            token = jwt.encode({
                'user': {
                    'id': user['id'],
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
                    'id': user['id'],
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
        
        user_result = supabase.table('usuario') \
            .select('id, nombre, email') \
            .eq('email', email) \
            .execute()
        
        nombre = None
        if user_result.data:
            nombre = user_result.data[0].get('nombre', 'Usuario')
        else:
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
        
        user_update = supabase.table('usuario') \
            .update({'contrasenia': nuevo_hash}) \
            .eq('email', email) \
            .execute()
        
        if not user_update.data:
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
# REGISTRO DE PERSONAL (SOLICITUD)
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
        
        solicitud_id = solicitud_result.data[0]['id']
        
        # =====================================================
        # ENVIAR CORREO CON BOTONES
        # =====================================================
        
        # Generar token para aprobación
        token = generar_token_aprobacion(solicitud_id)
        base_url = "http://localhost:5000"
        link_aprobar = f"{base_url}/api/registro/aprobar/{token}"
        link_rechazar = f"{base_url}/api/registro/rechazar/{token}"
        
        # Mapeo de roles
        roles_nombres = {
            1: 'Administrador General',
            2: 'Jefe Operativo',
            3: 'Jefe de Taller',
            4: 'Técnico Mecánico',
            5: 'Encargado de Repuestos/Almacén'
        }
        rol_nombre = roles_nombres.get(id_rol, 'Desconocido')
        
        admin_email = 'vaniacarrasco68056530@gmail.com'
        asunto = f"🔔 NUEVA SOLICITUD DE REGISTRO - {nombre}"
        
        cuerpo_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                }}
                .container {{
                    max-width: 600px;
                    margin: 20px auto;
                    background-color: #ffffff;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    overflow: hidden;
                }}
                .header {{
                    background: linear-gradient(135deg, #C1121F, #8B0000);
                    padding: 30px 20px;
                    text-align: center;
                }}
                .header h1 {{
                    color: #ffffff;
                    margin: 0;
                    font-size: 24px;
                    font-weight: 700;
                    letter-spacing: 2px;
                }}
                .header p {{
                    color: rgba(255,255,255,0.8);
                    margin: 5px 0 0;
                    font-size: 14px;
                }}
                .content {{
                    padding: 30px;
                }}
                .content h2 {{
                    color: #333;
                    margin-top: 0;
                    font-size: 20px;
                }}
                .info-item {{
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                    display: flex;
                }}
                .info-label {{
                    font-weight: bold;
                    color: #555;
                    width: 120px;
                    flex-shrink: 0;
                }}
                .info-value {{
                    color: #333;
                }}
                .button-group {{
                    margin: 30px 0 20px;
                    text-align: center;
                }}
                .btn {{
                    display: inline-block;
                    padding: 12px 30px;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    margin: 5px 10px;
                    transition: all 0.3s ease;
                    font-size: 14px;
                }}
                .btn-approve {{
                    background-color: #28a745;
                    color: white;
                    border: 2px solid #28a745;
                }}
                .btn-approve:hover {{
                    background-color: #218838;
                    border-color: #1e7e34;
                    transform: scale(1.05);
                }}
                .btn-reject {{
                    background-color: #dc3545;
                    color: white;
                    border: 2px solid #dc3545;
                }}
                .btn-reject:hover {{
                    background-color: #c82333;
                    border-color: #bd2130;
                    transform: scale(1.05);
                }}
                .footer {{
                    background-color: #f8f9fa;
                    padding: 15px 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #888;
                    border-top: 1px solid #eee;
                }}
                .footer a {{
                    color: #C1121F;
                    text-decoration: none;
                }}
                .expiry {{
                    color: #888;
                    font-size: 12px;
                    text-align: center;
                    margin-top: 15px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚡ FURIA MOTOR</h1>
                    <p>Sistema de Gestión de Taller</p>
                </div>
                <div class="content">
                    <h2>🔔 Nueva Solicitud de Registro</h2>
                    <p>Se ha recibido una nueva solicitud de registro en el sistema:</p>
                    
                    <div class="info-item"><span class="info-label">👤 Nombre:</span><span class="info-value">{nombre}</span></div>
                    <div class="info-item"><span class="info-label">📧 Email:</span><span class="info-value">{email}</span></div>
                    <div class="info-item"><span class="info-label">📄 Documento:</span><span class="info-value">{documento}</span></div>
                    <div class="info-item"><span class="info-label">📱 Teléfono:</span><span class="info-value">{telefono or 'N/A'}</span></div>
                    <div class="info-item"><span class="info-label">📍 Dirección:</span><span class="info-value">{direccion or 'N/A'}</span></div>
                    <div class="info-item"><span class="info-label">🎯 Rol solicitado:</span><span class="info-value">{rol_nombre}</span></div>
                    
                    <div class="button-group">
                        <a href="{link_aprobar}" class="btn btn-approve">✅ APROBAR SOLICITUD</a>
                        <a href="{link_rechazar}" class="btn btn-reject">❌ RECHAZAR SOLICITUD</a>
                    </div>
                    
                    <div class="expiry">⏰ Este enlace expirará en 7 días.</div>
                </div>
                <div class="footer">
                    FURIA MOTOR COMPANY &copy; 2026 - <a href="http://localhost:5000">Sistema de Gestión de Taller</a>
                </div>
            </div>
        </body>
        </html>
        """
        
        enviar_email(admin_email, asunto, cuerpo_html)
        
        return jsonify({
            'success': True,
            'message': 'Solicitud de registro enviada. Espera aprobación del administrador.',
            'solicitud_id': solicitud_id
        }), 200
        
    except Exception as e:
        logger.error(f"Error en solicitud de registro personal: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APROBAR SOLICITUD DESDE LINK
# =====================================================

@login_bp.route('/api/registro/aprobar/<token>', methods=['GET'])
def aprobar_solicitud_desde_link(token):
    """Aprobar solicitud desde link de correo (acceso público)"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        solicitud_id = payload.get('solicitud_id')
        
        if not solicitud_id:
            return "<h2>❌ Error: Token inválido</h2>", 400
        
        solicitud = supabase.table('solicitudregistropersonal')\
            .select('*')\
            .eq('id', solicitud_id)\
            .execute()
        
        if not solicitud.data:
            return "<h2>❌ Error: Solicitud no encontrada</h2>", 404
        
        solicitud_data = solicitud.data[0]
        
        if solicitud_data['estado'] != 'pendiente':
            return f"<h2>⚠️ Esta solicitud ya fue {solicitud_data['estado']}</h2>", 400
        
        now = datetime.datetime.now().isoformat()
        
        # Actualizar estado de solicitud
        supabase.table('solicitudregistropersonal')\
            .update({
                'estado': 'aprobado',
                'fecha_respuesta': now
            })\
            .eq('id', solicitud_id)\
            .execute()
        
        # Crear usuario
        user_data = {
            'nombre': solicitud_data['nombre'],
            'email': solicitud_data['email'],
            'numero_documento': solicitud_data['numero_documento'],
            'contacto': solicitud_data.get('telefono', ''),
            'ubicacion': solicitud_data.get('direccion', ''),
            'contrasenia': solicitud_data.get('contrasenia_temporal'),
            'rol_principal': solicitud_data['id_rol_solicitado'],
            'fecha_registro': datetime.datetime.now().isoformat()
        }
        
        user_result = supabase.table('usuario').insert(user_data).execute()
        
        if user_result.data:
            user_id = user_result.data[0]['id']
            
            supabase.table('usuario_rol').insert({
                'id_usuario': user_id,
                'id_rol': solicitud_data['id_rol_solicitado'],
                'fecha_asignacion': datetime.datetime.now().isoformat()
            }).execute()
        
        # Enviar correo de confirmación al usuario
        email_confirmacion = f"""
        <h2>✅ ¡Tu solicitud ha sido aprobada!</h2>
        <p>Hola <strong>{solicitud_data['nombre']}</strong>,</p>
        <p>Tu solicitud de registro en FURIA MOTOR ha sido <strong style="color: green;">APROBADA</strong>.</p>
        <p>Ya puedes iniciar sesión en el sistema.</p>
        <p><a href="http://localhost:5000" style="background: #C1121F; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Iniciar Sesión</a></p>
        <p><small>FURIA MOTOR - Sistema de Gestión de Taller</small></p>
        """
        enviar_email(solicitud_data['email'], "✅ Solicitud Aprobada - FURIA MOTOR", email_confirmacion)
        
        # HTML de confirmación para el admin
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>✅ Solicitud Aprobada - FURIA MOTOR</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }}
                .container {{
                    max-width: 500px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    overflow: hidden;
                    text-align: center;
                    padding: 40px 30px;
                }}
                .icon {{ font-size: 64px; margin-bottom: 20px; }}
                .title {{ color: #28a745; font-size: 28px; margin-bottom: 10px; }}
                .subtitle {{ color: #555; font-size: 16px; margin-bottom: 30px; }}
                .btn {{
                    display: inline-block;
                    background: #C1121F;
                    color: white;
                    padding: 14px 40px;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    transition: background 0.3s;
                }}
                .btn:hover {{ background: #8B0000; }}
                .footer {{ margin-top: 30px; font-size: 12px; color: #999; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">✅</div>
                <h1 class="title">¡Solicitud Aprobada!</h1>
                <p class="subtitle">La solicitud de <strong>{solicitud_data['nombre']}</strong> ha sido aprobada exitosamente.</p>
                <p>El usuario ya puede iniciar sesión en el sistema.</p>
                <br>
                <a href="http://localhost:5000" class="btn">Ir al sistema</a>
                <div class="footer">FURIA MOTOR - Sistema de Gestión de Taller</div>
            </div>
        </body>
        </html>
        """
        
    except jwt.ExpiredSignatureError:
        return "<h2>❌ El enlace ha expirado</h2><p>La solicitud de aprobación expiró después de 7 días.</p>", 400
    except Exception as e:
        logger.error(f"Error aprobando solicitud: {str(e)}")
        return f"<h2>❌ Error</h2><p>{str(e)}</p>", 500

# =====================================================
# RECHAZAR SOLICITUD DESDE LINK
# =====================================================

@login_bp.route('/api/registro/rechazar/<token>', methods=['GET'])
def rechazar_solicitud_desde_link(token):
    """Rechazar solicitud desde link de correo (acceso público)"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        solicitud_id = payload.get('solicitud_id')
        
        if not solicitud_id:
            return "<h2>❌ Error: Token inválido</h2>", 400
        
        solicitud = supabase.table('solicitudregistropersonal')\
            .select('*')\
            .eq('id', solicitud_id)\
            .execute()
        
        if not solicitud.data:
            return "<h2>❌ Error: Solicitud no encontrada</h2>", 404        
        solicitud_data = solicitud.data[0]
        
        if solicitud_data['estado'] != 'pendiente':
            return f"<h2>⚠️ Esta solicitud ya fue {solicitud_data['estado']}</h2>", 400
        
        now = datetime.datetime.now().isoformat()
        
        supabase.table('solicitudregistropersonal')\
            .update({
                'estado': 'rechazado',
                'fecha_respuesta': now
            })\
            .eq('id', solicitud_id)\
            .execute()
        
        # Enviar correo de rechazo al usuario
        email_rechazo = f"""
        <h2>❌ Tu solicitud ha sido rechazada</h2>
        <p>Hola <strong>{solicitud_data['nombre']}</strong>,</p>
        <p>Tu solicitud de registro en FURIA MOTOR ha sido <strong style="color: red;">RECHAZADA</strong>.</p>
        <p>Si crees que esto es un error, por favor contacta al administrador.</p>
        <p><small>FURIA MOTOR - Sistema de Gestión de Taller</small></p>
        """
        enviar_email(solicitud_data['email'], "❌ Solicitud Rechazada - FURIA MOTOR", email_rechazo)
        
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>❌ Solicitud Rechazada - FURIA MOTOR</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }}
                .container {{
                    max-width: 500px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    overflow: hidden;
                    text-align: center;
                    padding: 40px 30px;
                }}
                .icon {{ font-size: 64px; margin-bottom: 20px; }}
                .title {{ color: #dc3545; font-size: 28px; margin-bottom: 10px; }}
                .subtitle {{ color: #555; font-size: 16px; margin-bottom: 30px; }}
                .btn {{
                    display: inline-block;
                    background: #C1121F;
                    color: white;
                    padding: 14px 40px;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    transition: background 0.3s;
                }}
                .btn:hover {{ background: #8B0000; }}
                .footer {{ margin-top: 30px; font-size: 12px; color: #999; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">❌</div>
                <h1 class="title">Solicitud Rechazada</h1>
                <p class="subtitle">La solicitud de <strong>{solicitud_data['nombre']}</strong> ha sido rechazada.</p>
                <p>Si crees que esto es un error, contacta al administrador.</p>
                <br>
                <a href="http://localhost:5000" class="btn">Volver al inicio</a>
                <div class="footer">FURIA MOTOR - Sistema de Gestión de Taller</div>
            </div>
        </body>
        </html>
        """
        
    except jwt.ExpiredSignatureError:
        return "<h2>❌ El enlace ha expirado</h2><p>La solicitud de aprobación expiró después de 7 días.</p>", 400
    except Exception as e:
        logger.error(f"Error rechazando solicitud: {str(e)}")
        return f"<h2>❌ Error</h2><p>{str(e)}</p>", 500

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
        
        cliente_result = supabase.table('cliente').select('id').eq('email', email).execute()
        
        if not cliente_result.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        id_cliente = cliente_result.data[0]['id']
        
        placa_existente = supabase.table('vehiculo').select('id').eq('placa', placa).execute()
        if placa_existente.data:
            return jsonify({'error': 'La placa ya está registrada'}), 400
        
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

# =====================================================
# LISTAR SOLICITUDES (PARA ADMIN)
# =====================================================

@login_bp.route('/api/registro/personal/listar', methods=['GET'])
@token_required
def listar_solicitudes(current_user):
    """Listar todas las solicitudes de registro (solo admin)"""
    try:
        # Verificar que el usuario sea admin o jefe
        roles = current_user.get('roles', [])
        if 'admin_general' not in roles and 'jefe_operativo' not in roles:
            return jsonify({'error': 'No autorizado'}), 403
        
        response = supabase.table('solicitudregistropersonal')\
            .select('*')\
            .order('fecha_solicitud', desc=True)\
            .execute()
        
        return jsonify(response.data), 200
        
    except Exception as e:
        logger.error(f"Error listando solicitudes: {str(e)}")
        return jsonify({'error': str(e)}), 500