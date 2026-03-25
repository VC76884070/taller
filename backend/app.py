from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
import os
from login import login_bp
from jefe_operativo import jefe_operativo_bp
from config import config

# Crear aplicación Flask
app = Flask(__name__, 
            static_folder='../',  # Sirve archivos estáticos desde la raíz del proyecto
            static_url_path='')

# Configuración
app.config['SECRET_KEY'] = config.SECRET_KEY
app.config['CORS_HEADERS'] = 'Content-Type'

# Habilitar CORS
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Registrar blueprints
app.register_blueprint(login_bp)
app.register_blueprint(jefe_operativo_bp)

# =====================================================
# RUTAS ESPECÍFICAS PARA ARCHIVOS ESTÁTICOS DEL LOGIN
# =====================================================

@app.route('/css/<path:filename>')
def serve_css(filename):
    """Servir archivos CSS desde login/css"""
    try:
        return send_from_directory('../login/css', filename)
    except:
        return send_from_directory('../login/css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    """Servir archivos JS desde login/js"""
    try:
        return send_from_directory('../login/js', filename)
    except:
        return send_from_directory('../login/js', filename)

@app.route('/img/<path:filename>')
def serve_img(filename):
    """Servir imágenes desde la carpeta img"""
    try:
        return send_from_directory('../img', filename)
    except:
        return send_from_directory('../img', filename)

# =====================================================
# RUTAS PARA SERVIR EL FRONTEND DE CADA ROL
# =====================================================

@app.route('/')
def serve_login():
    """Página principal - Login"""
    return send_from_directory('../login', 'index.html')

@app.route('/registro-personal.html')
def serve_registro_personal():
    """Página de registro de personal"""
    try:
        return send_from_directory('../login', 'registro-personal.html')
    except:
        # Si no está en login, buscar en la raíz
        return send_from_directory('..', 'registro-personal.html')

@app.route('/login/<path:path>')
def serve_login_files(path):
    """Servir archivos estáticos desde login"""
    return send_from_directory('../login', path)

# Rutas para cada rol
@app.route('/admin_general/<path:path>')
def serve_admin_general(path):
    """Servir archivos de Administrador General"""
    return send_from_directory('../admin_general', path)

@app.route('/jefe_operativo/<path:path>')
def serve_jefe_operativo(path):
    """Servir archivos de Jefe Operativo"""
    return send_from_directory('../jefe_operativo', path)

@app.route('/jefe_taller/<path:path>')
def serve_jefe_taller(path):
    """Servir archivos de Jefe de Taller"""
    return send_from_directory('../jefe_taller', path)

@app.route('/tecnico_mecanico/<path:path>')
def serve_tecnico_mecanico(path):
    """Servir archivos de Técnico Mecánico"""
    return send_from_directory('../tecnico_mecanico', path)

@app.route('/encargado_rep_almacen/<path:path>')
def serve_encargado_repuestos(path):
    """Servir archivos de Encargado de Repuestos"""
    return send_from_directory('../encargado_rep_almacen', path)

@app.route('/cliente/<path:path>')
def serve_cliente(path):
    """Servir archivos de Cliente"""
    return send_from_directory('../cliente', path)

# =====================================================
# RUTA PARA ARCHIVOS ESTÁTICOS GENERALES
# =====================================================

@app.route('/<path:path>')
def serve_static(path):
    """Servir cualquier otro archivo estático"""
    # Extensiones de archivos estáticos
    static_extensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.json', '.woff', '.woff2', '.ttf']
    
    if any(path.endswith(ext) for ext in static_extensions):
        # Intentar servir desde login
        login_path = os.path.join('../login', path)
        if os.path.exists(login_path):
            return send_from_directory('../login', path)
        
        # Buscar en carpetas de roles
        roles = ['admin_general', 'jefe_operativo', 'jefe_taller', 
                 'tecnico_mecanico', 'encargado_rep_almacen', 'cliente']
        
        for role in roles:
            role_path = os.path.join(f'../{role}', path)
            if os.path.exists(role_path):
                return send_from_directory(f'../{role}', path)
    
    return serve_html(path)

def serve_html(path):
    """Servir archivos HTML"""
    # Mapeo de rutas de acceso directo
    html_routes = {
        'registro-personal.html': '../login/registro-personal.html',
        'admin_general': '../admin_general/dashboard.html',
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
        'tecnico_mecanico': '../tecnico_mecanico/misvehiculos.html',
        'tecnico_mecanico/misvehiculos': '../tecnico_mecanico/misvehiculos.html',
        'encargado_rep_almacen': '../encargado_rep_almacen/dashboard.html',
        'cliente': '../cliente/misvehiculos.html'
    }
    
    # Verificar si es una ruta mapeada
    if path in html_routes:
        return send_from_directory('..', html_routes[path])
    
    # Si es un archivo HTML, buscarlo en las carpetas correspondientes
    if path.endswith('.html'):
        # Buscar en login
        login_html = os.path.join('../login', path)
        if os.path.exists(login_html):
            return send_from_directory('../login', path)
        
        # Buscar en cada rol
        roles = ['admin_general', 'jefe_operativo', 'jefe_taller', 
                 'tecnico_mecanico', 'encargado_rep_almacen', 'cliente']
        
        for role in roles:
            role_html = os.path.join(f'../{role}', path)
            if os.path.exists(role_html):
                return send_from_directory(f'../{role}', path)
    
    # Si no se encuentra, devolver página de login
    return send_from_directory('../login', 'index.html')

# =====================================================
# RUTAS PARA API
# =====================================================

@app.route('/api/test', methods=['GET'])
def test_api():
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
    try:
        return send_from_directory('../login', 'index.html')
    except:
        return jsonify({'error': 'Recurso no encontrado'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Manejo de errores 500"""
    return jsonify({'error': 'Error interno del servidor'}), 500

@app.route('/recuperar-contrasena.html')
def serve_recuperar_contrasena():
    """Página de recuperación de contraseña"""
    return send_from_directory('../login', 'recuperar-contrasena.html')

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
    print("   • http://localhost:5000/ - Login")
    print("   • http://localhost:5000/registro-personal.html - Registro Personal")
    print("   • http://localhost:5000/api/test - Test API")
    print("   • http://localhost:5000/api/login - Login")
    print("   • http://localhost:5000/api/recuperar/solicitar - Recuperar contraseña")
    print("   • http://localhost:5000/api/recuperar/verificar - Verificar código")
    print("   • http://localhost:5000/api/recuperar/cambiar - Cambiar contraseña")
    print("   • http://localhost:5000/api/registro/solicitar - Solicitar registro cliente")
    print("   • http://localhost:5000/api/registro/confirmar - Confirmar registro cliente")
    print("   • http://localhost:5000/api/registro/vehiculo - Registrar vehículo")
    print("   • http://localhost:5000/api/registro/personal/solicitar - Solicitar registro personal")
    print("   • http://localhost:5000/api/roles - Obtener roles disponibles")
    print("   • http://localhost:5000/api/jefe-operativo/dashboard - Dashboard Jefe Operativo")
    print("   • http://localhost:5000/api/jefe-operativo/recepcion - Recepción de vehículos")
    print("   • http://localhost:5000/api/jefe-operativo/cotizaciones - Cotizaciones")
    print("="*60)
    
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)