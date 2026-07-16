from flask import Flask, send_from_directory, jsonify, request, Response
from flask_cors import CORS
import os
import sys
import logging
from config import config
from dotenv import load_dotenv
import jwt
import datetime

# Cargar variables de entorno
load_dotenv()

# Agregar el directorio actual al path para importar módulos
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configurar logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURACIÓN DE RUTAS PARA RAILWAY
# =====================================================
# app.py está en backend/
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/
# Las carpetas de los roles están un nivel arriba (en PROYECTO/)
PROJECT_DIR = os.path.dirname(BACKEND_DIR)  # PROYECTO/

# Detectar si estamos en Railway
def is_railway():
    return os.environ.get('RAILWAY_ENVIRONMENT') is not None or os.environ.get('PORT') is not None

# Crear aplicación Flask
app = Flask(__name__, 
            static_folder=PROJECT_DIR,
            static_url_path='')

# =====================================================
# CONFIGURACIÓN
# =====================================================
app.config['SECRET_KEY'] = config.SECRET_KEY
app.config['CORS_HEADERS'] = 'Content-Type'
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = True
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB
app.config['JSON_AS_ASCII'] = False

# =====================================================
# GOOGLE DRIVE CONFIGURATION
# =====================================================
app.config['GOOGLE_DRIVE_CREDENTIALS_FILE'] = os.getenv('GOOGLE_DRIVE_CREDENTIALS_FILE')
app.config['GOOGLE_DRIVE_FOLDER_ID'] = os.getenv('GOOGLE_DRIVE_FOLDER_ID')

# Verificar configuración de Google Drive
if app.config['GOOGLE_DRIVE_CREDENTIALS_FILE']:
    logger.info(f"✅ Google Drive credentials configurado: {app.config['GOOGLE_DRIVE_CREDENTIALS_FILE']}")
else:
    logger.warning("⚠️ GOOGLE_DRIVE_CREDENTIALS_FILE no configurado")

if app.config['GOOGLE_DRIVE_FOLDER_ID']:
    logger.info(f"✅ Google Drive folder ID configurado: {app.config['GOOGLE_DRIVE_FOLDER_ID']}")
else:
    logger.warning("⚠️ GOOGLE_DRIVE_FOLDER_ID no configurado")

CORS(app, 
     resources={r"/api/*": {"origins": "*"}}, 
     supports_credentials=True,
     expose_headers=['Content-Type', 'Authorization'])

# =====================================================
# MIDDLEWARE PARA INYECTAR CONFIGURACIÓN
# =====================================================

@app.after_request
def add_cors_headers(response):
    """Agrega headers CORS a todas las respuestas"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/api-config.js')
def serve_api_config():
    """Sirve un archivo JS con la configuración de API automática"""
    config_js = f"""// Configuración automática de API - Generada por Flask
(function() {{
    // Detectar si estamos en producción o desarrollo
    const isProduction = window.location.hostname !== 'localhost' && 
                        !window.location.hostname.includes('127.0.0.1') &&
                        !window.location.hostname.includes('192.168.');
    
    // Configurar la URL base de la API
    window.API_BASE_URL = isProduction ? '' : 'http://localhost:5000';
    window.IS_PRODUCTION = isProduction;
    
    // Interceptar todas las peticiones fetch que vayan a localhost
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {{
        if (typeof url === 'string') {{
            // Reemplazar localhost:5000 por la URL relativa
            let newUrl = url.replace('http://localhost:5000', '');
            newUrl = newUrl.replace('http://127.0.0.1:5000', '');
            newUrl = newUrl.replace('https://localhost:5000', '');
            
            if (newUrl !== url) {{
                console.log('🔄 URL corregida:', url, '→', newUrl);
                return originalFetch(newUrl, options);
            }}
        }}
        return originalFetch(url, options);
    }};
    
    // Función helper para hacer peticiones a la API
    window.apiFetch = function(endpoint, options = {{}}) {{
        let url = endpoint;
        if (!url.startsWith('http')) {{
            url = (window.API_BASE_URL || '') + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
        }}
        return originalFetch(url, options);
    }};
    
    console.log('✅ API Config cargada - Modo:', isProduction ? 'PRODUCCIÓN' : 'DESARROLLO');
    console.log('📡 API Base URL:', window.API_BASE_URL || '(relativa)');
}})();
"""
    return Response(config_js, mimetype='application/javascript')

@app.before_request
def before_request():
    if request.method == 'POST' and request.endpoint and 'api' in request.endpoint:
        if request.is_json:
            try:
                request.get_json(force=True)
            except Exception:
                pass
    
    # Inyectar el script de configuración en las respuestas HTML
    if request.path.endswith('.html') or request.path == '/' or request.path == '':
        pass  # Se maneja en after_request

@app.after_request
def inject_config_script(response):
    """Inyecta el script de configuración en todas las páginas HTML"""
    if response.content_type and 'text/html' in response.content_type:
        try:
            # Obtener el contenido HTML
            html = response.get_data(as_text=True)
            
            # Buscar el final del head o el inicio del body para inyectar
            script_tag = '<script src="/api-config.js"></script>'
            
            if '</head>' in html:
                # Inyectar antes de cerrar head
                html = html.replace('</head>', f'    {script_tag}\n</head>')
            elif '<body>' in html:
                # Inyectar después de abrir body
                html = html.replace('<body>', f'<body>\n    {script_tag}')
            else:
                # Inyectar al inicio
                html = f'{script_tag}\n{html}'
            
            response.set_data(html)
        except Exception as e:
            print(f"Error inyectando script: {e}")
    
    return response

# =====================================================
# INICIALIZAR GOOGLE DRIVE
# =====================================================
try:
    from google_drive import init_google_drive
    init_google_drive(app)
    logger.info("✅ Google Drive inicializado correctamente")
except ImportError as e:
    logger.warning(f"⚠️ No se pudo importar google_drive: {e}")
except Exception as e:
    logger.error(f"❌ Error inicializando Google Drive: {e}")

# =====================================================
# 🔥 ENDPOINT PARA REFRESCAR TOKEN (NUEVO)
# =====================================================

@app.route('/api/refresh-token', methods=['POST'])
def refresh_token():
    """
    Refresca un token JWT expirado.
    Recibe el token viejo y devuelve uno nuevo con fecha extendida.
    """
    try:
        data = request.get_json()
        token = data.get('token')
        
        if not token:
            return jsonify({'error': 'Token no proporcionado'}), 400
        
        try:
            # 🔥 Decodificar SIN verificar expiración para obtener el usuario
            payload = jwt.decode(
                token, 
                app.config['SECRET_KEY'], 
                algorithms=['HS256'], 
                options={'verify_exp': False}
            )
            
            # Obtener datos del usuario
            if 'user' in payload:
                user_data = payload['user']
            else:
                user_data = payload
            
            user_id = user_data.get('id')
            if not user_id:
                return jsonify({'error': 'Token inválido - ID de usuario no encontrado'}), 401
            
            # 🔥 Verificar que el usuario existe en la base de datos
            user_result = config.supabase.table('usuario') \
                .select('id, nombre, email, contacto') \
                .eq('id', user_id) \
                .execute()
            
            if not user_result.data:
                return jsonify({'error': 'Usuario no encontrado'}), 401
            
            usuario = user_result.data[0]
            
            # 🔥 Obtener roles del usuario
            roles_result = config.supabase.table('usuario_rol') \
                .select('id_rol, rol!inner(nombre_rol)') \
                .eq('id_usuario', user_id) \
                .execute()
            
            roles = []
            for ur in (roles_result.data or []):
                if 'rol' in ur and 'nombre_rol' in ur['rol']:
                    roles.append(ur['rol']['nombre_rol'])
            
            # 🔥 Construir datos para el nuevo token
            new_token_data = {
                'id': usuario['id'],
                'nombre': usuario.get('nombre', ''),
                'email': usuario.get('email', ''),
                'contacto': usuario.get('contacto', ''),
                'roles': roles,
                'type': 'staff'
            }
            
            # 🔥 Generar NUEVO token con expiración extendida (7 días)
            new_token = jwt.encode(
                {
                    'user': new_token_data, 
                    'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
                },
                app.config['SECRET_KEY'],
                algorithm='HS256'
            )
            
            logger.info(f"✅ Token refrescado para usuario: {usuario.get('nombre')} (ID: {user_id})")
            
            return jsonify({
                'success': True,
                'token': new_token,
                'user': new_token_data
            }), 200
            
        except jwt.InvalidTokenError as e:
            logger.error(f"❌ Token inválido al refrescar: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            logger.error(f"❌ Error decodificando token: {str(e)}")
            return jsonify({'error': f'Error al decodificar token: {str(e)}'}), 401
            
    except Exception as e:
        logger.error(f"❌ Error refrescando token: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# =====================================================
# IMPORTAR BLUEPRINTS
# =====================================================

# Login
from login import login_bp
app.register_blueprint(login_bp)

# Decorators
from decorators import verificar_rol, jefe_taller_required, jefe_operativo_required, encargado_repuestos_required, cliente_required

# =====================================================
# TÉCNICO MECÁNICO
# =====================================================
try:
    from tecnico_mecanico.misvehiculos import mis_vehiculos_bp
    from tecnico_mecanico.diagnostico import diagnostico_bp
    from tecnico_mecanico.historial import historial_bp
    from tecnico_mecanico.perfil import tecnico_mecanico_perfil_bp
    from tecnico_mecanico.avance import avance_bp
    
    app.register_blueprint(mis_vehiculos_bp, url_prefix='/tecnico')
    app.register_blueprint(diagnostico_bp, url_prefix='/tecnico')
    app.register_blueprint(historial_bp, url_prefix='/tecnico')
    app.register_blueprint(tecnico_mecanico_perfil_bp, url_prefix='/tecnico')
    app.register_blueprint(avance_bp, url_prefix='/tecnico')
    
    logger.info("✅ Blueprints de Técnico Mecánico registrados correctamente")
except Exception as e:
    logger.error(f"❌ Error registrando blueprints de Técnico Mecánico: {e}")

# =====================================================
# JEFE OPERATIVO - CORREGIDO
# =====================================================
try:
    from jefe_operativo.recepcion_jefeoperativo import recepcion_jefe_bp
    from jefe_operativo.comunicados import jefe_operativo_comunicados_bp
    from jefe_operativo.historial import jefe_operativo_historial_bp
    from jefe_operativo.perfil import jefe_operativo_perfil_bp
    from jefe_operativo.control_calidad import control_calidad_operativo_bp 
    from jefe_operativo.dashboard_jefe_operativo import dashboard_op_bp

    # 🔥 IMPORTANTE: Todos los blueprints ya tienen url_prefix='/api/jefe-operativo'
    # NO les pases url_prefix de nuevo para evitar duplicados
    app.register_blueprint(dashboard_op_bp)
    app.register_blueprint(recepcion_jefe_bp)
    app.register_blueprint(jefe_operativo_comunicados_bp)
    app.register_blueprint(jefe_operativo_historial_bp)
    app.register_blueprint(jefe_operativo_perfil_bp)
    app.register_blueprint(control_calidad_operativo_bp)
    
    logger.info("✅ Blueprints de Jefe Operativo registrados correctamente")
    logger.info("   🔹 dashboard_op_bp registrado")
    logger.info("   🔹 recepcion_bp registrado")
    logger.info("   🔹 comunicados_bp registrado")
    logger.info("   🔹 historial_bp registrado")
    logger.info("   🔹 perfil_bp registrado")
    logger.info("   🔹 control_calidad_bp registrado")
    
except Exception as e:
    logger.error(f"❌ Error registrando blueprints de Jefe Operativo: {e}")

# =====================================================
# JEFE TALLER
# =====================================================

try:
    from jefe_taller.orden_trabajo import jefe_taller_ordenes_bp
    from jefe_taller.calendario_bahias import calendario_bahias_bp
    from jefe_taller.historial_vehiculos import historial_vehiculos_bp
    from jefe_taller.perfil import perfil_bp   
    from jefe_taller.diagnostico import jefe_taller_diagnostico_bp
    from jefe_taller.cotizaciones import cotizaciones_bp
    from jefe_taller.admin_roles import admin_roles_bp  
    from jefe_taller.reservas_solicitudes import reservas_solicitudes_bp
    from jefe_taller.control_calidad import control_calidad_bp
    from jefe_taller.gestion_avances import avance_jefe_bp
    from jefe_taller.dashboard import dashboard_bp
    
    app.register_blueprint(jefe_taller_ordenes_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(calendario_bahias_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(historial_vehiculos_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(perfil_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(jefe_taller_diagnostico_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(cotizaciones_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(admin_roles_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(reservas_solicitudes_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(control_calidad_bp)
    app.register_blueprint(avance_jefe_bp)
    app.register_blueprint(dashboard_bp, url_prefix='/api/jefe-taller')
    
    logger.info("✅ Blueprints de Jefe Taller registrados correctamente")
except Exception as e:
    logger.error(f"❌ Error en blueprints de Jefe Taller: {e}")

# =====================================================
# ENCARGADO DE REPUESTOS
# =====================================================
try:
    from encargado_rep_almacen.solicitudes_cotizacion import solicitudes_cotizacion_bp
    from encargado_rep_almacen.solicitudes_compra import solicitudes_compra_bp
    from encargado_rep_almacen.proveedores import proveedores_bp
    from encargado_rep_almacen.historial import historial_repuestos_bp
    from encargado_rep_almacen.perfil import perfil_repuestos_bp
    from encargado_rep_almacen.dashboard import dashboard_bp

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(solicitudes_cotizacion_bp, url_prefix='/api/encargado-repuestos')
    app.register_blueprint(solicitudes_compra_bp, url_prefix='/api/encargado-repuestos')
    app.register_blueprint(proveedores_bp, url_prefix='/api/encargado-repuestos')
    app.register_blueprint(historial_repuestos_bp, url_prefix='/api/encargado-repuestos')
    app.register_blueprint(perfil_repuestos_bp, url_prefix='/api/encargado-repuestos')
    
    logger.info("✅ Blueprints de Encargado de Repuestos registrados correctamente")
except Exception as e:
    logger.error(f"❌ Error registrando blueprints de Encargado de Repuestos: {e}")

# =====================================================
# CLIENTE
# =====================================================
try:
    from cliente.misvehiculos import cliente_bp
    from cliente.cotizaciones import cotizaciones_cliente_bp
    from cliente.avances import avances_cliente_bp
    from cliente.historial import historial_cliente_bp
    from cliente.perfil import perfil_cliente_bp
    
    app.register_blueprint(cliente_bp, url_prefix='/api/cliente')
    app.register_blueprint(cotizaciones_cliente_bp, url_prefix='/api/cliente')
    app.register_blueprint(avances_cliente_bp, url_prefix='/api/cliente')
    app.register_blueprint(historial_cliente_bp, url_prefix='/api/cliente')
    app.register_blueprint(perfil_cliente_bp, url_prefix='/api/cliente')
    
    # Intentar importar misreservas si existe
    try:
        from cliente.misreservas import misreservas_bp
        app.register_blueprint(misreservas_bp, url_prefix='/api/cliente')
        logger.info("✅ Misreservas blueprint registrado")
    except ImportError:
        logger.warning("⚠️ Misreservas blueprint no disponible")
    
    logger.info("✅ Blueprints de Cliente registrados correctamente")
except Exception as e:
    logger.error(f"❌ Error registrando blueprints de Cliente: {e}")

# =====================================================
# RUTAS ESTÁTICAS
# =====================================================

@app.route('/css/<path:filename>')
def serve_css(filename):
    roles = ['login', 'jefe_operativo', 'jefe_taller', 'encargado_rep_almacen', 'tecnico_mecanico', 'cliente']
    for role in roles:
        ruta = os.path.join(PROJECT_DIR, role, 'css', filename)
        if os.path.exists(ruta):
            return send_from_directory(os.path.join(PROJECT_DIR, role, 'css'), filename)
    return send_from_directory(os.path.join(PROJECT_DIR, 'login', 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    roles = ['login', 'jefe_operativo', 'jefe_taller', 'encargado_rep_almacen', 'tecnico_mecanico', 'cliente']
    for role in roles:
        ruta = os.path.join(PROJECT_DIR, role, 'js', filename)
        if os.path.exists(ruta):
            return send_from_directory(os.path.join(PROJECT_DIR, role, 'js'), filename)
    return send_from_directory(os.path.join(PROJECT_DIR, 'login', 'js'), filename)

@app.route('/img/<path:filename>')
def serve_img(filename):
    return send_from_directory(os.path.join(PROJECT_DIR, 'img'), filename)

@app.route('/')
def serve_login():
    return send_from_directory(os.path.join(PROJECT_DIR, 'login'), 'index.html')

@app.route('/login.html')
def serve_login_html():
    return send_from_directory(os.path.join(PROJECT_DIR, 'login'), 'index.html')

@app.route('/registro-personal.html')
def serve_registro_personal():
    return send_from_directory(os.path.join(PROJECT_DIR, 'login'), 'registro-personal.html')

@app.route('/recuperar-contrasena.html')
def serve_recuperar_contrasena():
    return send_from_directory(os.path.join(PROJECT_DIR, 'login'), 'recuperar-contrasena.html')

@app.route('/login/<path:path>')
def serve_login_files(path):
    return send_from_directory(os.path.join(PROJECT_DIR, 'login'), path)

@app.route('/jefe_operativo/<path:path>')
def serve_jefe_operativo(path):
    return send_from_directory(os.path.join(PROJECT_DIR, 'jefe_operativo'), path)

@app.route('/jefe_taller/<path:path>')
def serve_jefe_taller(path):
    return send_from_directory(os.path.join(PROJECT_DIR, 'jefe_taller'), path)

@app.route('/encargado_rep_almacen/<path:path>')
def serve_encargado_repuestos(path):
    return send_from_directory(os.path.join(PROJECT_DIR, 'encargado_rep_almacen'), path)

@app.route('/tecnico_mecanico/<path:path>')
def serve_tecnico_mecanico(path):
    return send_from_directory(os.path.join(PROJECT_DIR, 'tecnico_mecanico'), path)

@app.route('/cliente/<path:path>')
def serve_cliente(path):
    return send_from_directory(os.path.join(PROJECT_DIR, 'cliente'), path)

@app.route('/favicon.ico')
def favicon():
    favicon_path = os.path.join(PROJECT_DIR, 'img', 'favicon.ico')
    if os.path.exists(favicon_path):
        return send_from_directory(os.path.join(PROJECT_DIR, 'img'), 'favicon.ico')
    return '', 204

@app.route('/<path:path>')
def serve_static(path):
    static_extensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.json', '.woff', '.woff2', '.ttf']
    
    if any(path.endswith(ext) for ext in static_extensions):
        roles = ['jefe_operativo', 'jefe_taller', 'tecnico_mecanico', 'encargado_rep_almacen', 'cliente']
        for role in roles:
            role_path = os.path.join(PROJECT_DIR, role, path)
            if os.path.exists(role_path):
                return send_from_directory(os.path.join(PROJECT_DIR, role), path)
        
        login_path = os.path.join(PROJECT_DIR, 'login', path)
        if os.path.exists(login_path):
            return send_from_directory(os.path.join(PROJECT_DIR, 'login'), path)
    
    return serve_html(path)

def serve_html(path):
    html_routes = {
        'registro-personal.html': os.path.join(PROJECT_DIR, 'login', 'registro-personal.html'),
        'recuperar-contrasena.html': os.path.join(PROJECT_DIR, 'login', 'recuperar-contrasena.html'),
        'jefe_operativo': os.path.join(PROJECT_DIR, 'jefe_operativo', 'dashboard.html'),
        'jefe_operativo/dashboard': os.path.join(PROJECT_DIR, 'jefe_operativo', 'dashboard.html'),
        'jefe_operativo/recepcion': os.path.join(PROJECT_DIR, 'jefe_operativo', 'recepcion.html'),
        'jefe_operativo/cotizaciones': os.path.join(PROJECT_DIR, 'jefe_operativo', 'cotizaciones.html'),
        'jefe_operativo/pro_vehiculo': os.path.join(PROJECT_DIR, 'jefe_operativo', 'pro_vehiculo.html'),
        'jefe_operativo/control_salida': os.path.join(PROJECT_DIR, 'jefe_operativo', 'control_salida.html'),
        'jefe_operativo/rendicion_diaria': os.path.join(PROJECT_DIR, 'jefe_operativo', 'rendicion_diaria.html'),
        'jefe_operativo/comunicados': os.path.join(PROJECT_DIR, 'jefe_operativo', 'comunicados.html'),
        'jefe_operativo/historial': os.path.join(PROJECT_DIR, 'jefe_operativo', 'historial.html'),
        'jefe_operativo/perfil': os.path.join(PROJECT_DIR, 'jefe_operativo', 'perfil.html'),
        'jefe_operativo/control_calidad': os.path.join(PROJECT_DIR, 'jefe_operativo', 'control_calidad.html'),
        'jefe_taller': os.path.join(PROJECT_DIR, 'jefe_taller', 'dashboard.html'),
        'jefe_taller/dashboard': os.path.join(PROJECT_DIR, 'jefe_taller', 'dashboard.html'),
        'jefe_taller/orden_trabajo': os.path.join(PROJECT_DIR, 'jefe_taller', 'orden_trabajo.html'),
        'jefe_taller/calendario_bahias': os.path.join(PROJECT_DIR, 'jefe_taller', 'calendario_bahias.html'),
        'jefe_taller/historial_vehiculos': os.path.join(PROJECT_DIR, 'jefe_taller', 'historial_vehiculos.html'),
        'jefe_taller/diagnostico': os.path.join(PROJECT_DIR, 'jefe_taller', 'diagnostico.html'),
        'jefe_taller/planificacion': os.path.join(PROJECT_DIR, 'jefe_taller', 'planificacion.html'),
        'jefe_taller/cotizaciones': os.path.join(PROJECT_DIR, 'jefe_taller', 'cotizaciones.html'),
        'jefe_taller/control_calidad': os.path.join(PROJECT_DIR, 'jefe_taller', 'control_calidad.html'),
        'jefe_taller/reservas_solicitudes': os.path.join(PROJECT_DIR, 'jefe_taller', 'reservas_solicitudes.html'),
        'jefe_taller/admin_roles': os.path.join(PROJECT_DIR, 'jefe_taller', 'admin_roles.html'),
        'jefe_taller/gestion_avances': os.path.join(PROJECT_DIR, 'jefe_taller', 'gestion_avances.html'),
        'jefe_taller/perfil': os.path.join(PROJECT_DIR, 'jefe_taller', 'perfil.html'),
        'encargado_rep_almacen': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'dashboard.html'),
        'encargado_rep_almacen/dashboard': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'dashboard.html'),
        'encargado_rep_almacen/solicitudes_cotizacion': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'solicitudes_cotizacion.html'),
        'encargado_rep_almacen/solicitudes_compra': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'solicitudes_compra.html'),
        'encargado_rep_almacen/proveedores': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'proveedores.html'),
        'encargado_rep_almacen/historial': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'historial.html'),
        'encargado_rep_almacen/perfil': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'perfil.html'),
        'tecnico_mecanico': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'misvehiculos.html'),
        'tecnico_mecanico/misvehiculos': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'misvehiculos.html'),
        'tecnico_mecanico/diagnostico': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'diagnostico.html'),
        'tecnico_mecanico/historial': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'historial.html'),
        'tecnico_mecanico/avance': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'avance.html'),
        'tecnico_mecanico/perfil': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'perfil.html'),
        'cliente': os.path.join(PROJECT_DIR, 'cliente', 'misvehiculos.html'),
        'cliente/misvehiculos': os.path.join(PROJECT_DIR, 'cliente', 'misvehiculos.html'),
        'cliente/misreservas': os.path.join(PROJECT_DIR, 'cliente', 'misreservas.html'),
        'cliente/cotizaciones': os.path.join(PROJECT_DIR, 'cliente', 'cotizaciones.html'),
        'cliente/avances': os.path.join(PROJECT_DIR, 'cliente', 'avances.html'),
        'cliente/historial': os.path.join(PROJECT_DIR, 'cliente', 'historial.html'),
        'cliente/perfil': os.path.join(PROJECT_DIR, 'cliente', 'perfil.html')
    }
    
    if path in html_routes:
        return send_from_directory(os.path.dirname(html_routes[path]), os.path.basename(html_routes[path]))
    
    if path.endswith('.html'):
        roles = ['jefe_operativo', 'jefe_taller', 'tecnico_mecanico', 'encargado_rep_almacen', 'cliente']
        for role in roles:
            role_html = os.path.join(PROJECT_DIR, role, path)
            if os.path.exists(role_html):
                return send_from_directory(os.path.join(PROJECT_DIR, role), path)
        
        login_html = os.path.join(PROJECT_DIR, 'login', path)
        if os.path.exists(login_html):
            return send_from_directory(os.path.join(PROJECT_DIR, 'login'), path)
    
    return send_from_directory(os.path.join(PROJECT_DIR, 'login'), 'index.html')

# =====================================================
# ENDPOINT TEMPORAL PARA GENERAR TOKEN EN RENDER
# =====================================================

@app.route('/generar-token', methods=['GET'])
def generar_token_drive():
    """
    Endpoint TEMPORAL para generar el token.pickle en Render usando el Secret File.
    DESPUÉS DE USARLO, ELIMINA ESTE ENDPOINT.
    """
    try:
        import os
        import pickle
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
        
        # === USAR EL SECRET FILE DE RENDER ===
        creds_file = os.getenv('GOOGLE_DRIVE_CREDENTIALS_FILE', '/etc/secrets/oauth-credentials.json')
        token_file = 'token.pickle'
        
        # Verificar que el Secret File existe
        if not os.path.exists(creds_file):
            return jsonify({
                'success': False,
                'error': f'Secret File no encontrado: {creds_file}'
            }), 500
        
        # Configurar OAuth
        SCOPES = ['https://www.googleapis.com/auth/drive.file']
        
        # Iniciar flujo OAuth
        flow = InstalledAppFlow.from_client_secrets_file(creds_file, SCOPES)
        
        # Usar run_local_server (funciona en Render porque usa un puerto interno)
        creds = flow.run_local_server(port=0)
        
        # Guardar token
        with open(token_file, 'wb') as token:
            pickle.dump(creds, token)
        
        return jsonify({
            'success': True,
            'message': f'✅ Token generado correctamente en {token_file}',
            'token_exists': os.path.exists(token_file),
            'token_file': token_file
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# =====================================================
# ENDPOINT DE PRUEBA PARA GOOGLE DRIVE
# =====================================================

@app.route('/test-drive', methods=['GET'])
def test_drive():
    """Endpoint para verificar conexión con Google Drive"""
    try:
        from google_drive import google_drive
        from datetime import datetime
        
        # Crear un archivo de prueba
        test_content = f"✅ Test desde Google Drive - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        test_data = test_content.encode('utf-8')
        
        # Subir archivo de prueba
        result = google_drive.upload_file(
            file_data=test_data,
            filename=f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
            folder_path="pruebas"
        )
        
        return jsonify({
            'success': True,
            'message': '✅ Conexión exitosa a Google Drive',
            'file_url': result['url'],
            'web_view_link': result['web_view_link'],
            'file_id': result['id'],
            'filename': result['filename'],
            'folder_path': result.get('folder_path')
        })
    except ImportError as e:
        return jsonify({
            'success': False,
            'error': f'No se pudo importar google_drive: {str(e)}'
        }), 500
    except FileNotFoundError as e:
        return jsonify({
            'success': False,
            'error': f'Archivo de credenciales no encontrado: {str(e)}'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'message': '❌ Error al conectar con Google Drive'
        }), 500

# =====================================================
# API DE PRUEBA
# =====================================================

@app.route('/api/test', methods=['GET'])
def test_api():
    return jsonify({
        'status': 'ok',
        'message': 'API de FURIA MOTOR funcionando correctamente',
        'version': '2.0.0',
        'environment': 'railway' if is_railway() else 'local',
        'google_drive_configured': bool(app.config.get('GOOGLE_DRIVE_CREDENTIALS_FILE') and app.config.get('GOOGLE_DRIVE_FOLDER_ID'))
    }), 200

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': __import__('datetime').datetime.now().isoformat()
    }), 200

@app.route('/api/jefe-taller/avances/test-directo', methods=['GET'])
def test_avances_directo():
    print("🔴🔴🔴 ENDPOINT DE PRUEBA DIRECTO LLAMADO 🔴🔴🔴")
    return jsonify({'success': True, 'message': 'Endpoint de prueba funcionando'}), 200

# =====================================================
# MOSTRAR TODOS LOS ENDPOINTS REGISTRADOS (DEBUG)
# =====================================================

print("="*60)
print("📋 ENDPOINTS REGISTRADOS - JEFE OPERATIVO:")
for rule in app.url_map.iter_rules():
    if '/api/jefe-operativo' in str(rule):
        print(f"   ✅ {rule}")
print("="*60)

# =====================================================
# ERROR HANDLERS
# =====================================================

@app.errorhandler(404)
def not_found(error):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'API endpoint no encontrado'}), 404
    try:
        return send_from_directory(os.path.join(PROJECT_DIR, 'login'), 'index.html')
    except:
        return jsonify({'error': 'Recurso no encontrado'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Error 500: {error}")
    return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# INICIALIZACIÓN
# =====================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    if is_railway():
        debug_mode = False
        print("🌍 Ejecutando en RAILWAY (Producción)")
    else:
        print("💻 Ejecutando en LOCAL (Desarrollo)")
    
    print("="*60)
    print("🚀 FURIA MOTOR COMPANY - Sistema de Gestión")
    print("="*60)
    print(f"📡 Servidor iniciado en: http://0.0.0.0:{port}")
    print(f"🔧 Modo debug: {debug_mode}")
    print("="*60)
    print("✅ Frontend accesible en:")
    print(f"   • Login:              http://localhost:{port}/")
    print(f"   • Jefe Operativo:     http://localhost:{port}/jefe_operativo")
    print(f"   • Jefe Taller:        http://localhost:{port}/jefe_taller")
    print(f"   • Encargado Repuestos: http://localhost:{port}/encargado_rep_almacen")
    print(f"   • Técnico Mecánico:   http://localhost:{port}/tecnico_mecanico")
    print(f"   • Cliente:            http://localhost:{port}/cliente")
    print("="*60)
    print("🔑 Google Drive:")
    print(f"   • Credentials: {app.config.get('GOOGLE_DRIVE_CREDENTIALS_FILE', 'No configurado')}")
    print(f"   • Folder ID: {app.config.get('GOOGLE_DRIVE_FOLDER_ID', 'No configurado')}")
    print("="*60)
    print("🧪 Prueba Google Drive:")
    print(f"   • http://localhost:{port}/test-drive")
    print("="*60)
    print("🔐 Generar token en Render:")
    print(f"   • http://localhost:{port}/generar-token")
    print("="*60)
    
    app.run(debug=debug_mode, host='0.0.0.0', port=port, threaded=True)