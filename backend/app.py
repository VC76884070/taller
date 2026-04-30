from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import os
import sys
import logging
from config import config

# Agregar el directorio actual al path para importar módulos
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configurar logging - SILENCIAR COMENTARIOS
logging.basicConfig(level=logging.WARNING)  # Cambiado a WARNING para menos ruido
logger = logging.getLogger(__name__)

# Crear aplicación Flask
app = Flask(__name__, 
            static_folder='../',
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
# TÉCNICO MECÁNICO - CORREGIDO
# =====================================================
try:
    from tecnico_mecanico.misvehiculos import mis_vehiculos_bp
    app.register_blueprint(mis_vehiculos_bp, url_prefix='/tecnico')  # ← CAMBIADO: antes era '/api/tecnico'
    from tecnico_mecanico.diagnostico import diagnostico_bp
    app.register_blueprint(diagnostico_bp, url_prefix='/tecnico')    # ← CAMBIADO
    from tecnico_mecanico.historial import historial_bp
    app.register_blueprint(historial_bp, url_prefix='/tecnico')      # ← CAMBIADO
    from tecnico_mecanico.perfil import tecnico_mecanico_perfil_bp
    app.register_blueprint(tecnico_mecanico_perfil_bp, url_prefix='/tecnico')  # ← CAMBIADO
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
    
    app.register_blueprint(jefe_operativo_recepcion_bp, url_prefix='/api/jefe-operativo')
    app.register_blueprint(jefe_operativo_comunicados_bp, url_prefix='/api/jefe-operativo')
    app.register_blueprint(jefe_operativo_historial_bp, url_prefix='/api/jefe-operativo')
    app.register_blueprint(jefe_operativo_perfil_bp, url_prefix='/api/jefe-operativo')
    logger.info("✅ Blueprints de Jefe Operativo registrados correctamente")
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

    app.register_blueprint(jefe_taller_ordenes_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(calendario_bahias_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(historial_vehiculos_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(perfil_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(jefe_taller_diagnostico_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(cotizaciones_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(admin_roles_bp, url_prefix='/api/jefe-taller')
    app.register_blueprint(reservas_solicitudes_bp, url_prefix='/api/jefe-taller')
    logger.info("✅ Blueprints de Jefe Taller registrados correctamente")
except Exception as e:
    logger.error(f"❌ Error registrando blueprints de Jefe Taller: {e}")

# =====================================================
# ENCARGADO DE REPUESTOS
# =====================================================
try:
    from encargado_rep_almacen.solicitudes_cotizacion import solicitudes_cotizacion_bp
    app.register_blueprint(solicitudes_cotizacion_bp, url_prefix='/api/encargado-repuestos')
except Exception as e:
    pass

try:
    from encargado_rep_almacen.solicitudes_compra import solicitudes_compra_bp
    app.register_blueprint(solicitudes_compra_bp, url_prefix='/api/encargado-repuestos')
except Exception as e:
    pass

try:
    from encargado_rep_almacen.proveedores import proveedores_bp
    app.register_blueprint(proveedores_bp, url_prefix='/api/encargado-repuestos')
except Exception as e:
    pass

try:
    from encargado_rep_almacen.historial import historial_repuestos_bp
    app.register_blueprint(historial_repuestos_bp, url_prefix='/api/encargado-repuestos')
except Exception as e:
    pass

try:
    from encargado_rep_almacen.perfil import perfil_repuestos_bp
    app.register_blueprint(perfil_repuestos_bp, url_prefix='/api/encargado-repuestos')
except Exception as e:
    pass

try:
    from encargado_rep_almacen.dashboard import dashboard_repuestos_bp
    app.register_blueprint(dashboard_repuestos_bp, url_prefix='/api/encargado-repuestos')
except Exception as e:
    pass

# =====================================================
# CLIENTE
# =====================================================
try:
    from cliente.misvehiculos import cliente_bp
    app.register_blueprint(cliente_bp, url_prefix='/api/cliente')
except Exception as e:
    pass

try:
    from cliente.cotizaciones import cotizaciones_cliente_bp
    app.register_blueprint(cotizaciones_cliente_bp, url_prefix='/api/cliente')
except Exception as e:
    pass

try:
    from cliente.avances import avances_cliente_bp
    app.register_blueprint(avances_cliente_bp, url_prefix='/api/cliente')
except Exception as e:
    pass

try:
    from cliente.historial import historial_cliente_bp
    app.register_blueprint(historial_cliente_bp, url_prefix='/api/cliente')
except Exception as e:
    pass

try:
    from cliente.perfil import perfil_cliente_bp
    app.register_blueprint(perfil_cliente_bp, url_prefix='/api/cliente')
except Exception as e:
    pass

# =====================================================
# RUTAS ESTÁTICAS
# =====================================================

@app.route('/css/<path:filename>')
def serve_css(filename):
    rutas = ['../login/css', '../jefe_operativo/css', '../jefe_taller/css', 
             '../encargado_rep_almacen/css', '../tecnico_mecanico/css', '../cliente/css']
    for ruta in rutas:
        if os.path.exists(os.path.join(ruta, filename)):
            return send_from_directory(ruta, filename)
    return send_from_directory('../login/css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    rutas = ['../login/js', '../jefe_operativo/js', '../jefe_taller/js', 
             '../encargado_rep_almacen/js', '../tecnico_mecanico/js', '../cliente/js']
    for ruta in rutas:
        if os.path.exists(os.path.join(ruta, filename)):
            return send_from_directory(ruta, filename)
    return send_from_directory('../login/js', filename)

@app.route('/img/<path:filename>')
def serve_img(filename):
    return send_from_directory('../img', filename)

@app.route('/')
def serve_login():
    return send_from_directory('../login', 'index.html')

@app.route('/login.html')
def serve_login_html():
    return send_from_directory('../login', 'index.html')

@app.route('/registro-personal.html')
def serve_registro_personal():
    try:
        return send_from_directory('../login', 'registro-personal.html')
    except:
        return send_from_directory('..', 'registro-personal.html')

@app.route('/recuperar-contrasena.html')
def serve_recuperar_contrasena():
    return send_from_directory('../login', 'recuperar-contrasena.html')

@app.route('/login/<path:path>')
def serve_login_files(path):
    return send_from_directory('../login', path)

@app.route('/jefe_operativo/<path:path>')
def serve_jefe_operativo(path):
    return send_from_directory('../jefe_operativo', path)

@app.route('/jefe_taller/<path:path>')
def serve_jefe_taller(path):
    return send_from_directory('../jefe_taller', path)

@app.route('/encargado_rep_almacen/<path:path>')
def serve_encargado_repuestos(path):
    return send_from_directory('../encargado_rep_almacen', path)

@app.route('/tecnico_mecanico/<path:path>')
def serve_tecnico_mecanico(path):
    return send_from_directory('../tecnico_mecanico', path)

@app.route('/cliente/<path:path>')
def serve_cliente(path):
    return send_from_directory('../cliente', path)

@app.route('/favicon.ico')
def favicon():
    favicon_path = os.path.join('../img', 'favicon.ico')
    if os.path.exists(favicon_path):
        return send_from_directory('../img', 'favicon.ico')
    return '', 204

@app.route('/<path:path>')
def serve_static(path):
    static_extensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.json', '.woff', '.woff2', '.ttf']
    
    if any(path.endswith(ext) for ext in static_extensions):
        roles = ['jefe_operativo', 'jefe_taller', 'tecnico_mecanico', 'encargado_rep_almacen', 'cliente']
        for role in roles:
            role_path = os.path.join(f'../{role}', path)
            if os.path.exists(role_path):
                return send_from_directory(f'../{role}', path)
        
        login_path = os.path.join('../login', path)
        if os.path.exists(login_path):
            return send_from_directory('../login', path)
    
    return serve_html(path)

def serve_html(path):
    html_routes = {
        'registro-personal.html': '../login/registro-personal.html',
        'recuperar-contrasena.html': '../login/recuperar-contrasena.html',
        
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
        
        'jefe_taller': '../jefe_taller/dashboard.html',
        'jefe_taller/dashboard': '../jefe_taller/dashboard.html',
        'jefe_taller/orden_trabajo': '../jefe_taller/orden_trabajo.html',
        'jefe_taller/calendario_bahias': '../jefe_taller/calendario_bahias.html',
        'jefe_taller/historial_vehiculos': '../jefe_taller/historial_vehiculos.html',
        'jefe_taller/diagnostico': '../jefe_taller/diagnostico.html',
        'jefe_taller/planificacion': '../jefe_taller/planificacion.html',
        'jefe_taller/control_calidad': '../jefe_taller/control_calidad.html',
        'jefe_taller/perfil': '../jefe_taller/perfil.html',
        'jefe_taller/reservas_solicitudes': '../jefe_taller/reservas_solicitudes.html',
        
        'encargado_rep_almacen': '../encargado_rep_almacen/dashboard.html',
        'encargado_rep_almacen/dashboard': '../encargado_rep_almacen/dashboard.html',
        'encargado_rep_almacen/solicitudes_cotizacion': '../encargado_rep_almacen/solicitudes_cotizacion.html',
        'encargado_rep_almacen/solicitudes_compra': '../encargado_rep_almacen/solicitudes_compra.html',
        'encargado_rep_almacen/proveedores': '../encargado_rep_almacen/proveedores.html',
        'encargado_rep_almacen/historial': '../encargado_rep_almacen/historial.html',
        'encargado_rep_almacen/perfil': '../encargado_rep_almacen/perfil.html',
        
        'tecnico_mecanico': '../tecnico_mecanico/misvehiculos.html',
        'tecnico_mecanico/misvehiculos': '../tecnico_mecanico/misvehiculos.html',
        'tecnico_mecanico/diagnostico': '../tecnico_mecanico/diagnostico.html',
        'tecnico_mecanico/historial': '../tecnico_mecanico/historial.html',
        'tecnico_mecanico/perfil': '../tecnico_mecanico/perfil.html',
        
        'cliente': '../cliente/misvehiculos.html',
        'cliente/misvehiculos': '../cliente/misvehiculos.html',
        'cliente/cotizaciones': '../cliente/cotizaciones.html',
        'cliente/avances': '../cliente/avances.html',
        'cliente/historial': '../cliente/historial.html',
        'cliente/perfil': '../cliente/perfil.html'
    }
    
    if path in html_routes:
        return send_from_directory('..', html_routes[path])
    
    if path.endswith('.html'):
        roles = ['jefe_operativo', 'jefe_taller', 'tecnico_mecanico', 'encargado_rep_almacen', 'cliente']
        for role in roles:
            role_html = os.path.join(f'../{role}', path)
            if os.path.exists(role_html):
                return send_from_directory(f'../{role}', path)
        
        login_html = os.path.join('../login', path)
        if os.path.exists(login_html):
            return send_from_directory('../login', path)
    
    return send_from_directory('../login', 'index.html')

# =====================================================
# API
# =====================================================

@app.route('/api/test', methods=['GET'])
def test_api():
    return jsonify({
        'status': 'ok',
        'message': 'API de FURIA MOTOR funcionando correctamente',
        'version': '1.0.0'
    }), 200

# =====================================================
# ERROR HANDLERS
# =====================================================

@app.errorhandler(404)
def not_found(error):
    try:
        return send_from_directory('../login', 'index.html')
    except:
        return jsonify({'error': 'Recurso no encontrado'}), 404

@app.errorhandler(500)
def internal_error(error):
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
    print("✅ Frontend accesible en:")
    print("   • Jefe Operativo:       http://localhost:5000/jefe_operativo")
    print("   • Jefe Taller:          http://localhost:5000/jefe_taller")
    print("   • Encargado Repuestos:  http://localhost:5000/encargado_rep_almacen")
    print("   • Técnico Mecánico:     http://localhost:5000/tecnico_mecanico")
    print("   • Cliente:              http://localhost:5000/cliente")
    print("="*60)
    print("📁 API Endpoints por Rol:")
    print("   • Técnico Mecánico:     /tecnico/*")
    print("   • Jefe Operativo:       /api/jefe-operativo/*")
    print("   • Jefe Taller:          /api/jefe-taller/*")
    print("   • Encargado Repuestos:  /api/encargado-repuestos/*")
    print("   • Cliente:              /api/cliente/*")
    print("="*60)
    
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)