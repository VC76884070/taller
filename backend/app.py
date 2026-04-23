from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import os
import sys
import logging
from config import config

# Agregar el directorio actual al path para importar módulos
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Crear aplicación Flask
app = Flask(__name__, 
            static_folder='../',  # Sirve archivos estáticos desde la raíz del proyecto
            static_url_path='')

# =====================================================
# CONFIGURACIÓN MEJORADA
# =====================================================
app.config['SECRET_KEY'] = config.SECRET_KEY
app.config['CORS_HEADERS'] = 'Content-Type'
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = True
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max para archivos
app.config['JSON_AS_ASCII'] = False  # Para caracteres especiales

# Habilitar CORS con soporte para credenciales
CORS(app, 
     resources={r"/api/*": {"origins": "*"}}, 
     supports_credentials=True,
     expose_headers=['Content-Type', 'Authorization'])

# =====================================================
# MIDDLEWARE PARA PROCESAR JSON CORRECTAMENTE
# =====================================================
@app.before_request
def before_request():
    """Configuración antes de cada request para asegurar JSON"""
    if request.method == 'POST' and request.endpoint and 'api' in request.endpoint:
        logger.debug(f"📥 Request a {request.endpoint}")
        logger.debug(f"   Content-Type: {request.content_type}")
        logger.debug(f"   Data length: {len(request.data) if request.data else 0}")
        
        if request.is_json:
            try:
                request.get_json(force=True)
            except Exception as e:
                logger.warning(f"⚠️ Error parsing JSON: {e}")

# =====================================================
# IMPORTAR BLUEPRINTS POR ROL
# =====================================================

# Login (público)
from login import login_bp
app.register_blueprint(login_bp)

# Decorators (centralizado)
from decorators import verificar_rol, jefe_taller_required, jefe_operativo_required, encargado_repuestos_required

# Técnico Mecánico - Mis Vehículos
try:
    from tecnico_mecanico.misvehiculos import mis_vehiculos_bp
    app.register_blueprint(mis_vehiculos_bp)
    from tecnico_mecanico.diagnostico import diagnostico_bp
    app.register_blueprint(diagnostico_bp)
    from tecnico_mecanico.historial import historial_bp
    app.register_blueprint(historial_bp)
    from tecnico_mecanico.perfil import tecnico_mecanico_perfil_bp
    app.register_blueprint(tecnico_mecanico_perfil_bp)
    logger.info("✅ Blueprints de Técnico Mecánico registrados")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprints de Técnico Mecánico: {e}")

# Jefe Operativo - Módulos
try:
    from jefe_operativo.recepcion import jefe_operativo_recepcion_bp
    from jefe_operativo.comunicados import jefe_operativo_comunicados_bp
    from jefe_operativo.historial import jefe_operativo_historial_bp
    from jefe_operativo.perfil import jefe_operativo_perfil_bp
    
    app.register_blueprint(jefe_operativo_recepcion_bp)
    app.register_blueprint(jefe_operativo_comunicados_bp)
    app.register_blueprint(jefe_operativo_historial_bp)
    app.register_blueprint(jefe_operativo_perfil_bp)
    logger.info("✅ Blueprints de Jefe Operativo registrados")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprints de Jefe Operativo: {e}")

# Jefe Taller - Módulos
try:
    from jefe_taller.orden_trabajo import jefe_taller_ordenes_bp
    from jefe_taller.calendario_bahias import calendario_bahias_bp
    from jefe_taller.historial_vehiculos import historial_vehiculos_bp
    from jefe_taller.perfil import perfil_bp   
    from jefe_taller.diagnostico import jefe_taller_diagnostico_bp
    from jefe_taller.cotizaciones import cotizaciones_bp
    from jefe_taller.admin_roles import admin_roles_bp  

    app.register_blueprint(jefe_taller_ordenes_bp)
    app.register_blueprint(calendario_bahias_bp)
    app.register_blueprint(historial_vehiculos_bp)
    app.register_blueprint(perfil_bp)
    app.register_blueprint(jefe_taller_diagnostico_bp)
    app.register_blueprint(cotizaciones_bp)
    app.register_blueprint(admin_roles_bp) 
    logger.info("✅ Blueprints de Jefe Taller registrados")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprints de Jefe Taller: {e}")

# =====================================================
# ENCARGADO DE REPUESTOS - MÓDULOS
# =====================================================
try:
    from encargado_rep_almacen.solicitudes_cotizacion import solicitudes_cotizacion_bp
    app.register_blueprint(solicitudes_cotizacion_bp)
    logger.info("✅ Blueprint de Solicitudes Cotización registrado")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprint de Solicitudes Cotización: {e}")

try:
    from encargado_rep_almacen.solicitudes_compra import solicitudes_compra_bp
    app.register_blueprint(solicitudes_compra_bp)
    logger.info("✅ Blueprint de Solicitudes Compra registrado")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprint de Solicitudes Compra: {e}")

try:
    from encargado_rep_almacen.proveedores import proveedores_bp
    app.register_blueprint(proveedores_bp)
    logger.info("✅ Blueprint de Proveedores registrado")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprint de Proveedores: {e}")

try:
    from encargado_rep_almacen.historial import historial_repuestos_bp
    app.register_blueprint(historial_repuestos_bp)
    logger.info("✅ Blueprint de Historial registrado")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprint de Historial: {e}")

try:
    from encargado_rep_almacen.perfil import perfil_repuestos_bp
    app.register_blueprint(perfil_repuestos_bp)
    logger.info("✅ Blueprint de Perfil registrado")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprint de Perfil: {e}")

try:
    from encargado_rep_almacen.dashboard import dashboard_repuestos_bp
    app.register_blueprint(dashboard_repuestos_bp)
    logger.info("✅ Blueprint de Dashboard registrado")
except Exception as e:
    logger.warning(f"⚠️ Error registrando blueprint de Dashboard: {e}")

# =====================================================
# RUTAS ESPECÍFICAS PARA ARCHIVOS ESTÁTICOS
# =====================================================

@app.route('/css/<path:filename>')
def serve_css(filename):
    """Servir archivos CSS"""
    # Buscar en login/css
    login_path = os.path.join('../login/css', filename)
    if os.path.exists(login_path):
        return send_from_directory('../login/css', filename)
    # Buscar en jefe_operativo/css
    jefe_operativo_path = os.path.join('../jefe_operativo/css', filename)
    if os.path.exists(jefe_operativo_path):
        return send_from_directory('../jefe_operativo/css', filename)
    # Buscar en jefe_taller/css
    jefe_taller_path = os.path.join('../jefe_taller/css', filename)
    if os.path.exists(jefe_taller_path):
        return send_from_directory('../jefe_taller/css', filename)
    # Buscar en encargado_rep_almacen/css
    encargado_path = os.path.join('../encargado_rep_almacen/css', filename)
    if os.path.exists(encargado_path):
        return send_from_directory('../encargado_rep_almacen/css', filename)
    # Buscar en otras carpetas
    roles = ['tecnico_mecanico', 'cliente']
    for role in roles:
        role_path = os.path.join(f'../{role}/css', filename)
        if os.path.exists(role_path):
            return send_from_directory(f'../{role}/css', filename)
    return send_from_directory('../login/css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    """Servir archivos JS"""
    # Buscar en login/js
    login_path = os.path.join('../login/js', filename)
    if os.path.exists(login_path):
        return send_from_directory('../login/js', filename)
    # Buscar en jefe_operativo/js
    jefe_operativo_path = os.path.join('../jefe_operativo/js', filename)
    if os.path.exists(jefe_operativo_path):
        return send_from_directory('../jefe_operativo/js', filename)
    # Buscar en jefe_taller/js
    jefe_taller_path = os.path.join('../jefe_taller/js', filename)
    if os.path.exists(jefe_taller_path):
        return send_from_directory('../jefe_taller/js', filename)
    # Buscar en encargado_rep_almacen/js
    encargado_path = os.path.join('../encargado_rep_almacen/js', filename)
    if os.path.exists(encargado_path):
        return send_from_directory('../encargado_rep_almacen/js', filename)
    # Buscar en otras carpetas
    roles = ['tecnico_mecanico', 'cliente']
    for role in roles:
        role_path = os.path.join(f'../{role}/js', filename)
        if os.path.exists(role_path):
            return send_from_directory(f'../{role}/js', filename)
    return send_from_directory('../login/js', filename)

@app.route('/img/<path:filename>')
def serve_img(filename):
    """Servir imágenes"""
    img_path = os.path.join('../img', filename)
    if os.path.exists(img_path):
        return send_from_directory('../img', filename)
    return send_from_directory('../img', filename)

# =====================================================
# RUTAS PARA SERVIR EL FRONTEND DE CADA ROL
# =====================================================

@app.route('/')
def serve_login():
    """Página principal - Login"""
    return send_from_directory('../login', 'index.html')

@app.route('/login.html')
def serve_login_html():
    """Redirigir a login"""
    return send_from_directory('../login', 'index.html')

@app.route('/registro-personal.html')
def serve_registro_personal():
    """Página de registro de personal"""
    try:
        return send_from_directory('../login', 'registro-personal.html')
    except:
        return send_from_directory('..', 'registro-personal.html')

@app.route('/recuperar-contrasena.html')
def serve_recuperar_contrasena():
    """Página de recuperación de contraseña"""
    return send_from_directory('../login', 'recuperar-contrasena.html')

@app.route('/login/<path:path>')
def serve_login_files(path):
    """Servir archivos estáticos desde login"""
    return send_from_directory('../login', path)

# Rutas para Jefe Operativo
@app.route('/jefe_operativo/<path:path>')
def serve_jefe_operativo(path):
    """Servir archivos de Jefe Operativo"""
    return send_from_directory('../jefe_operativo', path)

# Rutas para Jefe Taller
@app.route('/jefe_taller/<path:path>')
def serve_jefe_taller(path):
    """Servir archivos de Jefe Taller"""
    return send_from_directory('../jefe_taller', path)

# Rutas para Encargado de Repuestos
@app.route('/encargado_rep_almacen/<path:path>')
def serve_encargado_repuestos(path):
    """Servir archivos de Encargado de Repuestos"""
    return send_from_directory('../encargado_rep_almacen', path)

# Rutas para otros roles
@app.route('/tecnico_mecanico/<path:path>')
def serve_tecnico_mecanico(path):
    """Servir archivos de Técnico Mecánico"""
    return send_from_directory('../tecnico_mecanico', path)

@app.route('/cliente/<path:path>')
def serve_cliente(path):
    """Servir archivos de Cliente"""
    return send_from_directory('../cliente', path)

# =====================================================
# RUTA PARA FAVICON (evita error 404/500)
# =====================================================
@app.route('/favicon.ico')
def favicon():
    """Servir favicon (evita error)"""
    favicon_path = os.path.join('../img', 'favicon.ico')
    if os.path.exists(favicon_path):
        return send_from_directory('../img', 'favicon.ico')
    return '', 204

# =====================================================
# RUTA PARA ARCHIVOS ESTÁTICOS GENERALES
# =====================================================
@app.route('/<path:path>')
def serve_static(path):
    """Servir cualquier otro archivo estático"""
    static_extensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.json', '.woff', '.woff2', '.ttf']
    
    if any(path.endswith(ext) for ext in static_extensions):
        # Intentar servir desde login
        login_path = os.path.join('../login', path)
        if os.path.exists(login_path):
            return send_from_directory('../login', path)
        
        # Buscar en carpetas de roles
        roles = ['jefe_operativo', 'jefe_taller', 'tecnico_mecanico', 'encargado_rep_almacen', 'cliente']
        
        for role in roles:
            role_path = os.path.join(f'../{role}', path)
            if os.path.exists(role_path):
                return send_from_directory(f'../{role}', path)
    
    return serve_html(path)

def serve_html(path):
    """Servir archivos HTML"""
    html_routes = {
        # Login
        'registro-personal.html': '../login/registro-personal.html',
        'recuperar-contrasena.html': '../login/recuperar-contrasena.html',
        
        # Jefe Operativo
        'jefe_operativo': '../jefe_operativo/dashboard.html',
        'jefe_operativo/dashboard': '../jefe_operativo/dashboard.html',
        'jefe_operativo/recepcion': '../jefe_operativo/recepcion.html',
        'jefe_operativo/cotizaciones': '../jefe_operativo/cotizaciones.html',
        'jefe_operativo/pro_vehiculo': '../jefe_operativo/pro_vehiculo.html',
        'jefe_operativo/control_salida': '../jefe_operativo/control_salida.html',
        'jefe_operativo/rendicion_diaria': '../jefe_operativo/rendicion_diaria.html',
        'jefe_operativo/comunicados': '../jefe_operativo/comunicados.html',
        'jefe_operativo/historial': '../jefe_operativo/historial.html',
        'jefe_operativo/perfil': '../jefe_operativo/perfil.html',
        
        # Jefe Taller
        'jefe_taller': '../jefe_taller/dashboard.html',
        'jefe_taller/dashboard': '../jefe_taller/dashboard.html',
        'jefe_taller/orden_trabajo': '../jefe_taller/orden_trabajo.html',
        'jefe_taller/calendario_bahias': '../jefe_taller/calendario_bahias.html',
        'jefe_taller/historial_vehiculos': '../jefe_taller/historial_vehiculos.html',
        'jefe_taller/diagnostico': '../jefe_taller/diagnostico.html',
        'jefe_taller/planificacion': '../jefe_taller/planificacion.html',
        'jefe_taller/control_calidad': '../jefe_taller/control_calidad.html',
        'jefe_taller/perfil': '../jefe_taller/perfil.html',
        
        # Encargado de Repuestos
        'encargado_rep_almacen': '../encargado_rep_almacen/dashboard.html',
        'encargado_rep_almacen/dashboard': '../encargado_rep_almacen/dashboard.html',
        'encargado_rep_almacen/solicitudes_cotizacion': '../encargado_rep_almacen/solicitudes_cotizacion.html',
        'encargado_rep_almacen/solicitudes_compra': '../encargado_rep_almacen/solicitudes_compra.html',
        'encargado_rep_almacen/proveedores': '../encargado_rep_almacen/proveedores.html',
        'encargado_rep_almacen/historial': '../encargado_rep_almacen/historial.html',
        'encargado_rep_almacen/perfil': '../encargado_rep_almacen/perfil.html',
        
        # Técnico Mecánico
        'tecnico_mecanico': '../tecnico_mecanico/misvehiculos.html',
        'tecnico_mecanico/misvehiculos': '../tecnico_mecanico/misvehiculos.html',
        'tecnico_mecanico/diagnostico': '../tecnico_mecanico/diagnostico.html',
        'tecnico_mecanico/historial': '../tecnico_mecanico/historial.html',
        'tecnico_mecanico/perfil': '../tecnico_mecanico/perfil.html',
        
        # Cliente
        'cliente': '../cliente/dashboard.html',
        'cliente/dashboard': '../cliente/dashboard.html'
    }
    
    if path in html_routes:
        return send_from_directory('..', html_routes[path])
    
    if path.endswith('.html'):
        # Buscar en login
        login_html = os.path.join('../login', path)
        if os.path.exists(login_html):
            return send_from_directory('../login', path)
        
        # Buscar en cada rol
        roles = ['jefe_operativo', 'jefe_taller', 'tecnico_mecanico', 'encargado_rep_almacen', 'cliente']
        
        for role in roles:
            role_html = os.path.join(f'../{role}', path)
            if os.path.exists(role_html):
                return send_from_directory(f'../{role}', path)
    
    return send_from_directory('../login', 'index.html')

# =====================================================
# RUTAS PARA API
# =====================================================

@app.route('/api/test', methods=['GET'])
def test_api():
    """Endpoint de prueba para verificar que la API funciona"""
    return jsonify({
        'status': 'ok',
        'message': 'API de FURIA MOTOR funcionando correctamente',
        'version': '1.0.0'
    }), 200

# =====================================================
# MANEJO DE ERRORES
# =====================================================

@app.errorhandler(404)
def not_found(error):
    """Manejo de errores 404"""
    logger.warning(f"404 error: {request.path}")
    try:
        return send_from_directory('../login', 'index.html')
    except:
        return jsonify({'error': 'Recurso no encontrado'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Manejo de errores 500"""
    logger.error(f"500 error: {str(error)}")
    return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# INICIALIZACIÓN
# =====================================================

if __name__ == '__main__':
    print("="*60)
    print("🚀 FURIA MOTOR COMPANY - Sistema de Gestión")
    print("="*60)
    print(f"📡 Servidor iniciado en: http://localhost:5000")
    print("="*60)
    print("✅ Endpoints disponibles:")
    print("   📄 http://localhost:5000/ - Login")
    print("   📄 http://localhost:5000/registro-personal.html - Registro Personal")
    print("   📄 http://localhost:5000/recuperar-contrasena.html - Recuperar Contraseña")
    print("")
    print("📁 Frontend accesible en:")
    print("   • Jefe Operativo:       http://localhost:5000/jefe_operativo")
    print("   • Jefe Taller:          http://localhost:5000/jefe_taller")
    print("   • Encargado Repuestos:  http://localhost:5000/encargado_rep_almacen")
    print("   • Técnico Mecánico:     http://localhost:5000/tecnico_mecanico")
    print("   • Cliente:              http://localhost:5000/cliente")
    print("="*60)
    print("📁 Módulos de Encargado de Repuestos:")
    print("   • Dashboard:            /encargado_rep_almacen/dashboard")
    print("   • Solicitudes Cotización: /encargado_rep_almacen/solicitudes_cotizacion")
    print("   • Solicitudes Compra:    /encargado_rep_almacen/solicitudes_compra")
    print("   • Proveedores:           /encargado_rep_almacen/proveedores")
    print("   • Historial:             /encargado_rep_almacen/historial")
    print("   • Perfil:                /encargado_rep_almacen/perfil")
    print("="*60)
    
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)