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
# RUTAS PARA SERVIR EL FRONTEND
# =====================================================
@app.route('/')
def serve_login():
    return send_from_directory('../login', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Servir archivos estáticos"""
    # Extensiones de archivos estáticos
    static_extensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.json']
    
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
    html_routes = {
        'admin_general': '../admin_general/dashboard.html',
        'jefe_operativo/dashboard': '../jefe_operativo/dashboard.html',
        'jefe_operativo/recepcion': '../jefe_operativo/recepcion.html',
        'jefe_taller': '../jefe_taller/dashboard.html',
        'tecnico_mecanico': '../tecnico_mecanico/misvehiculos.html',
        'tecnico_mecanico/misvehiculos': '../tecnico_mecanico/misvehiculos.html', 
        'encargado_rep_almacen': '../encargado_rep_almacen/dashboard.html',
        'cliente': '../cliente/dashboard.html'
    }
    
    if path in html_routes:
        return send_from_directory('..', html_routes[path])
    
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
    
    return send_from_directory('../', path)

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
    print("✅ Endpoints disponibles:")
    print("   • http://localhost:5000/ - Login")
    print("   • http://localhost:5000/api/test - Test API")
    print("   • http://localhost:5000/api/login - Login")
    print("   • http://localhost:5000/api/jefe-operativo/dashboard - Dashboard Jefe Operativo")
    print("   • http://localhost:5000/api/jefe-operativo/recepcion - Recepción de vehículos")
    print("   • http://localhost:5000/api/jefe-operativo/cotizaciones - Cotizaciones (GET/POST)")
    print("   • http://localhost:5000/api/jefe-operativo/ordenes-para-cotizar - Órdenes para cotizar")
    print("="*60)
    
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)