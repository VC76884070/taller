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
            static_folder=PROJECT_DIR,  # Ahora apunta a la raíz del proyecto
            static_url_path='')

# =====================================================
# CONFIGURACIÓN
# =====================================================
app.config['SECRET_KEY'] = config.SECRET_KEY
app.config['CORS_HEADERS'] = 'Content-Type'
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = True
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.config['JSON_AS_ASCII'] = False

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
    
    logger.info("✅ Blueprints de Jefe Operativo registrados correctamente")
except Exception as e:
    logger.error(f"❌ Error registrando blueprints de Jefe Operativo: {e}")

# =====================================================
# JEFE TALLER
# =====================================================
print("🟡 Iniciando importación de Jefe Taller...")

try:
    print("🔹 Importando jefe_taller_ordenes_bp...")
    from jefe_taller.orden_trabajo import jefe_taller_ordenes_bp
    print(f"🔹 jefe_taller_ordenes_bp importado, tipo: {type(jefe_taller_ordenes_bp)}")
    
    print("🔹 Importando otros blueprints...")
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
    print("🔹 Todos los imports completados")
    
    print("🔹 Registrando blueprints...")
    app.register_blueprint(jefe_taller_ordenes_bp, url_prefix='/api/jefe-taller')
    print("  ✓ jefe_taller_ordenes_bp registrado")
    app.register_blueprint(calendario_bahias_bp, url_prefix='/api/jefe-taller')
    print("  ✓ calendario_bahias_bp registrado")
    app.register_blueprint(historial_vehiculos_bp, url_prefix='/api/jefe-taller')
    print("  ✓ historial_vehiculos_bp registrado")
    app.register_blueprint(perfil_bp, url_prefix='/api/jefe-taller')
    print("  ✓ perfil_bp registrado")
    app.register_blueprint(jefe_taller_diagnostico_bp, url_prefix='/api/jefe-taller')
    print("  ✓ jefe_taller_diagnostico_bp registrado")
    app.register_blueprint(cotizaciones_bp, url_prefix='/api/jefe-taller')
    print("  ✓ cotizaciones_bp registrado")
    app.register_blueprint(admin_roles_bp, url_prefix='/api/jefe-taller')
    print("  ✓ admin_roles_bp registrado")
    app.register_blueprint(reservas_solicitudes_bp, url_prefix='/api/jefe-taller')
    print("  ✓ reservas_solicitudes_bp registrado")
    app.register_blueprint(control_calidad_bp)
    print("  ✓ control_calidad_bp registrado")
    app.register_blueprint(avance_jefe_bp)
    print("  ✓ avance_jefe_bp registrado")
    app.register_blueprint(dashboard_bp, url_prefix='/api/jefe-taller')
    print("  ✓ dashboard_bp registrado")
    
    print("🔵🔵🔵 Blueprints de Jefe Taller registrados correctamente 🔵🔵🔵")
    logger.info("✅ Blueprints de Jefe Taller registrados correctamente")
    
except NameError as e:
    print(f"🔴❌ NameError: {e}")
    import traceback
    traceback.print_exc()
    logger.error(f"❌ NameError en blueprint de Jefe Taller: {e}")
    
except ImportError as e:
    print(f"🔴❌ ImportError: {e}")
    import traceback
    traceback.print_exc()
    logger.error(f"❌ ImportError en blueprint de Jefe Taller: {e}")
    
except Exception as e:
    print(f"🔴❌ Exception: {e}")
    import traceback
    traceback.print_exc()
    logger.error(f"❌ Error registrando blueprints de Jefe Taller: {e}")

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
# RUTAS ESTÁTICAS - CORREGIDAS PARA RAILWAY
# =====================================================

@app.route('/css/<path:filename>')
def serve_css(filename):
    # Buscar en las carpetas de cada rol (ahora usando PROJECT_DIR)
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
    try:
        return send_from_directory(os.path.join(PROJECT_DIR, 'login'), 'registro-personal.html')
    except:
        return send_from_directory(PROJECT_DIR, 'registro-personal.html')

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
        
        # Jefe Operativo
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
        
        # Jefe Taller
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
        
        # Encargado Repuestos
        'encargado_rep_almacen': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'dashboard.html'),
        'encargado_rep_almacen/dashboard': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'dashboard.html'),
        'encargado_rep_almacen/solicitudes_cotizacion': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'solicitudes_cotizacion.html'),
        'encargado_rep_almacen/solicitudes_compra': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'solicitudes_compra.html'),
        'encargado_rep_almacen/proveedores': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'proveedores.html'),
        'encargado_rep_almacen/historial': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'historial.html'),
        'encargado_rep_almacen/perfil': os.path.join(PROJECT_DIR, 'encargado_rep_almacen', 'perfil.html'),
        
        # Técnico Mecánico
        'tecnico_mecanico': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'misvehiculos.html'),
        'tecnico_mecanico/misvehiculos': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'misvehiculos.html'),
        'tecnico_mecanico/diagnostico': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'diagnostico.html'),
        'tecnico_mecanico/historial': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'historial.html'),
        'tecnico_mecanico/avance': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'avance.html'),
        'tecnico_mecanico/perfil': os.path.join(PROJECT_DIR, 'tecnico_mecanico', 'perfil.html'),
        
        # Cliente
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
# API DE PRUEBA
# =====================================================

@app.route('/api/test', methods=['GET'])
def test_api():
    return jsonify({
        'status': 'ok',
        'message': 'API de FURIA MOTOR funcionando correctamente',
        'version': '2.0.0',
        'environment': 'railway' if is_railway() else 'local'
    }), 200

@app.route('/api/health', methods=['GET'])
def health_check():
    """Endpoint para health check de Railway"""
    return jsonify({
        'status': 'healthy',
        'timestamp': __import__('datetime').datetime.now().isoformat()
    }), 200

# =====================================================
# ENDPOINT DE PRUEBA PARA AVANCES (DIRECTO)
# =====================================================

@app.route('/api/jefe-taller/avances/test-directo', methods=['GET'])
def test_avances_directo():
    print("🔴🔴🔴 ENDPOINT DE PRUEBA DIRECTO LLAMADO 🔴🔴🔴")
    return jsonify({'success': True, 'message': 'Endpoint de prueba funcionando'}), 200

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
    # Railway asigna el puerto automáticamente
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
    print(f"📁 Directorio proyecto: {PROJECT_DIR}")
    print("="*60)
    print("✅ Frontend accesible en:")
    print(f"   • Login:              http://localhost:{port}/")
    print(f"   • Jefe Operativo:     http://localhost:{port}/jefe_operativo")
    print(f"   • Jefe Taller:        http://localhost:{port}/jefe_taller")
    print(f"   • Encargado Repuestos: http://localhost:{port}/encargado_rep_almacen")
    print(f"   • Técnico Mecánico:   http://localhost:{port}/tecnico_mecanico")
    print(f"   • Cliente:            http://localhost:{port}/cliente")
    print("="*60)
    print("📁 API Endpoints por Rol:")
    print("   • Técnico Mecánico:     /tecnico/*")
    print("   • Jefe Operativo:       /api/jefe-operativo/*")
    print("   • Jefe Taller:          /api/jefe-taller/*")
    print("   • Encargado Repuestos:  /api/encargado-repuestos/*")
    print("   • Cliente:              /api/cliente/*")
    print("="*60)
    
    app.run(debug=debug_mode, host='0.0.0.0', port=port, threaded=True)