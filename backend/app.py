from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import os
import sys
import logging
from config import config
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Agregar el directorio actual al path para importar módulos
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configurar logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURACIÓN DE RUTAS PARA PRODUCCIÓN Y LOCAL
# =====================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Detectar si estamos en Railway u otro entorno de producción
def is_production():
    return os.environ.get('RAILWAY_ENVIRONMENT') is not None or os.environ.get('PORT') is not None

# Crear aplicación Flask
app = Flask(__name__, 
            static_folder=None,  # Desactivamos static_folder por defecto
            static_url_path='')

# =====================================================
# CONFIGURACIÓN DE LA APLICACIÓN
# =====================================================
app.config['SECRET_KEY'] = config.SECRET_KEY
app.config['CORS_HEADERS'] = 'Content-Type'
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = True
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max
app.config['JSON_AS_ASCII'] = False

# Configurar CORS
CORS(app, 
     resources={r"/api/*": {"origins": "*"}}, 
     supports_credentials=True,
     expose_headers=['Content-Type', 'Authorization'])

# =====================================================
# MIDDLEWARE
# =====================================================
@app.before_request
def before_request():
    if request.method == 'POST' and request.endpoint and 'api' in request.endpoint:
        if request.is_json:
            try:
                request.get_json(force=True)
            except Exception:
                pass

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================
def safe_send_file(directory, filename):
    """Envía un archivo de forma segura si existe"""
    try:
        filepath = os.path.join(directory, filename)
        if os.path.exists(filepath) and os.path.isfile(filepath):
            return send_from_directory(directory, filename)
        return None
    except Exception:
        return None

# =====================================================
# IMPORTAR BLUEPRINTS
# =====================================================

# Login
try:
    from login import login_bp
    app.register_blueprint(login_bp)
    logger.info("✅ Login blueprint registrado")
except Exception as e:
    logger.error(f"❌ Error registrando login: {e}")

# Decorators (no es blueprint, pero lo importamos para que esté disponible)
try:
    from decorators import verificar_rol, jefe_taller_required, jefe_operativo_required, encargado_repuestos_required, cliente_required
    logger.info("✅ Decorators importados")
except Exception as e:
    logger.error(f"❌ Error importando decorators: {e}")

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
    
    logger.info("✅ Blueprints de Técnico Mecánico registrados")
except Exception as e:
    logger.error(f"❌ Error en blueprints de Técnico Mecánico: {e}")

# =====================================================
# JEFE OPERATIVO
# =====================================================
try:
    from jefe_operativo.recepcion import jefe_operativo_recepcion_bp
    from jefe_operativo.comunicados import jefe_operativo_comunicados_bp
    from jefe_operativo.historial import jefe_operativo_historial_bp
    from jefe_operativo.perfil import jefe_operativo_perfil_bp
    from jefe_operativo.control_calidad import control_calidad_operativo_bp 
    from jefe_operativo.dashboard_jefe_operativo import dashboard_op_bp

    app.register_blueprint(dashboard_op_bp)
    app.register_blueprint(jefe_operativo_recepcion_bp, url_prefix='/api/jefe-operativo')
    app.register_blueprint(jefe_operativo_comunicados_bp, url_prefix='/api/jefe-operativo')
    app.register_blueprint(jefe_operativo_historial_bp, url_prefix='/api/jefe-operativo')
    app.register_blueprint(jefe_operativo_perfil_bp, url_prefix='/api/jefe-operativo')
    app.register_blueprint(control_calidad_operativo_bp)
    
    logger.info("✅ Blueprints de Jefe Operativo registrados")
except Exception as e:
    logger.error(f"❌ Error en blueprints de Jefe Operativo: {e}")

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
    
    logger.info("✅ Blueprints de Jefe Taller registrados")
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
    
    app.register_blueprint(solicitudes_cotizacion_bp, url_prefix='/api/encargado-repuestos')
    app.register_blueprint(solicitudes_compra_bp, url_prefix='/api/encargado-repuestos')
    app.register_blueprint(proveedores_bp, url_prefix='/api/encargado-repuestos')
    app.register_blueprint(historial_repuestos_bp, url_prefix='/api/encargado-repuestos')
    app.register_blueprint(perfil_repuestos_bp, url_prefix='/api/encargado-repuestos')
    
    logger.info("✅ Blueprints de Encargado de Repuestos registrados")
except Exception as e:
    logger.error(f"❌ Error en blueprints de Encargado de Repuestos: {e}")

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
    
    logger.info("✅ Blueprints de Cliente registrados")
except Exception as e:
    logger.error(f"❌ Error en blueprints de Cliente: {e}")

# =====================================================
# RUTAS ESTÁTICAS Y HTML
# =====================================================

@app.route('/')
def serve_login():
    """Página principal - Login"""
    login_path = os.path.join(BASE_DIR, 'login', 'index.html')
    if os.path.exists(login_path):
        return send_from_directory(os.path.join(BASE_DIR, 'login'), 'index.html')
    return jsonify({'error': 'Login page not found'}), 404

@app.route('/<role>/')
@app.route('/<role>/<path:path>')
def serve_role_content(role, path=''):
    """Sirve contenido estático y HTML para cada rol"""
    valid_roles = ['login', 'jefe_operativo', 'jefe_taller', 'encargado_rep_almacen', 'tecnico_mecanico', 'cliente']
    
    if role not in valid_roles:
        return send_from_directory(os.path.join(BASE_DIR, 'login'), 'index.html')
    
    role_dir = os.path.join(BASE_DIR, role)
    
    # Si no hay path o es vacío, servir el dashboard/index
    if not path or path == '':
        # Buscar archivos comunes de inicio
        for index_file in ['dashboard.html', 'index.html', 'misvehiculos.html']:
            index_path = os.path.join(role_dir, index_file)
            if os.path.exists(index_path):
                return send_from_directory(role_dir, index_file)
        return send_from_directory(os.path.join(BASE_DIR, 'login'), 'index.html')
    
    # Si el path tiene extensión, servir archivo estático
    if '.' in path:
        file_path = os.path.join(role_dir, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(role_dir, path)
    
    # Si no tiene extensión, asumir que es HTML
    html_file = path if path.endswith('.html') else f"{path}.html"
    html_path = os.path.join(role_dir, html_file)
    
    if os.path.exists(html_path):
        return send_from_directory(role_dir, html_file)
    
    # Fallback: intentar servir como archivo estático
    file_path = os.path.join(role_dir, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(role_dir, path)
    
    # Último fallback: ir al login
    return send_from_directory(os.path.join(BASE_DIR, 'login'), 'index.html')

# Rutas específicas para archivos estáticos comunes
@app.route('/css/<path:filename>')
def serve_css(filename):
    for role in ['login', 'jefe_operativo', 'jefe_taller', 'encargado_rep_almacen', 'tecnico_mecanico', 'cliente']:
        css_path = os.path.join(BASE_DIR, role, 'css', filename)
        if os.path.exists(css_path):
            return send_from_directory(os.path.join(BASE_DIR, role, 'css'), filename)
    return jsonify({'error': 'CSS file not found'}), 404

@app.route('/js/<path:filename>')
def serve_js(filename):
    for role in ['login', 'jefe_operativo', 'jefe_taller', 'encargado_rep_almacen', 'tecnico_mecanico', 'cliente']:
        js_path = os.path.join(BASE_DIR, role, 'js', filename)
        if os.path.exists(js_path):
            return send_from_directory(os.path.join(BASE_DIR, role, 'js'), filename)
    return jsonify({'error': 'JS file not found'}), 404

@app.route('/img/<path:filename>')
def serve_img(filename):
    img_path = os.path.join(BASE_DIR, 'img', filename)
    if os.path.exists(img_path):
        return send_from_directory(os.path.join(BASE_DIR, 'img'), filename)
    return jsonify({'error': 'Image not found'}), 404

@app.route('/favicon.ico')
def favicon():
    favicon_path = os.path.join(BASE_DIR, 'img', 'favicon.ico')
    if os.path.exists(favicon_path):
        return send_from_directory(os.path.join(BASE_DIR, 'img'), 'favicon.ico')
    return '', 204

# =====================================================
# API ENDPOINTS DE PRUEBA
# =====================================================

@app.route('/api/test', methods=['GET'])
def test_api():
    return jsonify({
        'status': 'ok',
        'message': 'API de FURIA MOTOR funcionando correctamente',
        'version': '2.0.0',
        'environment': 'production' if is_production() else 'development',
        'base_dir': BASE_DIR
    }), 200

@app.route('/api/health', methods=['GET'])
def health_check():
    """Endpoint para verificaciones de salud en Railway"""
    return jsonify({
        'status': 'healthy',
        'timestamp': __import__('datetime').datetime.now().isoformat()
    }), 200

# =====================================================
# ERROR HANDLERS
# =====================================================

@app.errorhandler(404)
def not_found(error):
    """Manejo de errores 404"""
    if request.path.startswith('/api/'):
        return jsonify({'error': 'API endpoint not found'}), 404
    # Para rutas web, devolver el login
    login_index = os.path.join(BASE_DIR, 'login', 'index.html')
    if os.path.exists(login_index):
        return send_from_directory(os.path.join(BASE_DIR, 'login'), 'index.html')
    return jsonify({'error': 'Page not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Manejo de errores 500"""
    logger.error(f"Error 500: {error}")
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Internal server error'}), 500
    return jsonify({'error': 'Internal server error'}), 500

# =====================================================
# INICIALIZACIÓN DE LA APLICACIÓN
# =====================================================

if __name__ == '__main__':
    # Configuración para producción (Railway) o desarrollo (local)
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    # En Railway, siempre forzar debug=False por seguridad
    if is_production():
        debug_mode = False
        print("🌍 Ejecutando en modo PRODUCCIÓN (Railway)")
    else:
        print("💻 Ejecutando en modo DESARROLLO (Local)")
    
    print("="*60)
    print("🚀 FURIA MOTOR COMPANY - Sistema de Gestión de Taller")
    print("="*60)
    print(f"📡 Servidor: http://0.0.0.0:{port}")
    print(f"🔧 Debug mode: {debug_mode}")
    print(f"📁 Directorio base: {BASE_DIR}")
    print("="*60)
    print("📱 Accesos directos:")
    print(f"   • Login:              http://localhost:{port}/")
    print(f"   • Jefe Operativo:     http://localhost:{port}/jefe_operativo/")
    print(f"   • Jefe Taller:        http://localhost:{port}/jefe_taller/")
    print(f"   • Encargado Repuestos: http://localhost:{port}/encargado_rep_almacen/")
    print(f"   • Técnico Mecánico:   http://localhost:{port}/tecnico_mecanico/")
    print(f"   • Cliente:            http://localhost:{port}/cliente/")
    print("="*60)
    print("🔗 API Endpoints:")
    print("   • Test API:           /api/test")
    print("   • Health Check:       /api/health")
    print("="*60)
    
    # Ejecutar la aplicación
    app.run(debug=debug_mode, host='0.0.0.0', port=port, threaded=True)