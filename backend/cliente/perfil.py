# =====================================================
# PERFIL.PY - CLIENTE
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, send_file
from config import config
from decorators import cliente_required
import datetime
import logging
import hashlib
from io import StringIO, BytesIO
import csv

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
perfil_cliente_bp = Blueprint('perfil_cliente', __name__)  # Sin url_prefix

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, hashed):
    return hash_password(password) == hashed

def obtener_cliente_por_usuario(usuario_id):
    try:
        cliente = supabase.table('cliente') \
            .select('id, nombre, telefono, telefono2, email, direccion, ciudad, avatar') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return None
        return cliente.data[0]
    except Exception as e:
        logger.error(f"Error obteniendo cliente: {e}")
        return None

# =====================================================
# ENDPOINTS - PERFIL
# =====================================================

@perfil_cliente_bp.route('/perfil', methods=['GET'])
@cliente_required
def obtener_perfil_cliente(current_user):
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        prefs_result = supabase.table('preferencias_notificaciones') \
            .select('preferencias') \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        preferencias = {}
        if prefs_result.data and prefs_result.data[0].get('preferencias'):
            try:
                import json
                preferencias = json.loads(prefs_result.data[0]['preferencias'])
            except:
                preferencias = {}
        
        return jsonify({
            'success': True,
            'usuario': {
                'id': cliente.get('id'),
                'nombre': cliente.get('nombre'),
                'email': cliente.get('email'),
                'telefono': cliente.get('telefono'),
                'telefono2': cliente.get('telefono2'),
                'direccion': cliente.get('direccion'),
                'ciudad': cliente.get('ciudad'),
                'avatar': cliente.get('avatar', 'user'),
                'preferencias_notificaciones': preferencias
            }
        }), 200
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/perfil', methods=['PUT'])
@cliente_required
def actualizar_perfil_cliente(current_user):
    try:
        data = request.get_json()
        
        update_data = {
            'nombre': data.get('nombre'),
            'telefono': data.get('telefono'),
            'telefono2': data.get('telefono2'),
            'direccion': data.get('direccion'),
            'ciudad': data.get('ciudad'),
            'updated_at': datetime.datetime.now().isoformat()
        }
        
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        result = supabase.table('cliente') \
            .update(update_data) \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar perfil'}), 500
        
        return jsonify({'success': True, 'message': 'Perfil actualizado'}), 200
    except Exception as e:
        logger.error(f"Error actualizando perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/perfil/avatar', methods=['PUT'])
@cliente_required
def actualizar_avatar_cliente(current_user):
    try:
        data = request.get_json()
        avatar = data.get('avatar', 'user')
        
        result = supabase.table('cliente') \
            .update({'avatar': avatar, 'updated_at': datetime.datetime.now().isoformat()}) \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar avatar'}), 500
        
        return jsonify({'success': True, 'message': 'Avatar actualizado'}), 200
    except Exception as e:
        logger.error(f"Error actualizando avatar: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/perfil/cambiar-password', methods=['PUT'])
@cliente_required
def cambiar_password_cliente(current_user):
    try:
        data = request.get_json()
        password_actual = data.get('password_actual')
        password_nueva = data.get('password_nueva')
        
        result = supabase.table('usuario') \
            .select('password') \
            .eq('id', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        if not verify_password(password_actual, result.data[0]['password']):
            return jsonify({'error': 'Contraseña actual incorrecta'}), 401
        
        nuevo_hash = hash_password(password_nueva)
        supabase.table('usuario') \
            .update({'password': nuevo_hash, 'updated_at': datetime.datetime.now().isoformat()}) \
            .eq('id', current_user['id']) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Contraseña cambiada exitosamente'}), 200
    except Exception as e:
        logger.error(f"Error cambiando password: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINTS - VEHÍCULOS
# =====================================================

@perfil_cliente_bp.route('/vehiculos', methods=['GET'])
@cliente_required
def obtener_vehiculos_cliente_endpoint(current_user):
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, color, numero_motor, numero_chasis') \
            .eq('id_cliente', cliente['id']) \
            .execute()
        
        return jsonify({'success': True, 'vehiculos': vehiculos.data or []}), 200
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/vehiculos', methods=['POST'])
@cliente_required
def crear_vehiculo_cliente(current_user):
    try:
        data = request.get_json()
        
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        nuevo_vehiculo = {
            'id_cliente': cliente['id'],
            'placa': data.get('placa', '').upper(),
            'marca': data.get('marca'),
            'modelo': data.get('modelo'),
            'anio': data.get('anio'),
            'color': data.get('color'),
            'numero_motor': data.get('numero_motor'),
            'numero_chasis': data.get('numero_chasis'),
            'created_at': datetime.datetime.now().isoformat()
        }
        
        result = supabase.table('vehiculo') \
            .insert(nuevo_vehiculo) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al crear vehículo'}), 500
        
        return jsonify({'success': True, 'message': 'Vehículo agregado'}), 201
    except Exception as e:
        logger.error(f"Error creando vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/vehiculos/<int:vehiculo_id>', methods=['PUT'])
@cliente_required
def actualizar_vehiculo_cliente(current_user, vehiculo_id):
    try:
        data = request.get_json()
        
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        update_data = {
            'placa': data.get('placa', '').upper(),
            'marca': data.get('marca'),
            'modelo': data.get('modelo'),
            'anio': data.get('anio'),
            'color': data.get('color'),
            'numero_motor': data.get('numero_motor'),
            'numero_chasis': data.get('numero_chasis'),
            'updated_at': datetime.datetime.now().isoformat()
        }
        
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        result = supabase.table('vehiculo') \
            .update(update_data) \
            .eq('id', vehiculo_id) \
            .eq('id_cliente', cliente['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Vehículo no encontrado'}), 404
        
        return jsonify({'success': True, 'message': 'Vehículo actualizado'}), 200
    except Exception as e:
        logger.error(f"Error actualizando vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/vehiculos/<int:vehiculo_id>', methods=['DELETE'])
@cliente_required
def eliminar_vehiculo_cliente(current_user, vehiculo_id):
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        supabase.table('vehiculo') \
            .delete() \
            .eq('id', vehiculo_id) \
            .eq('id_cliente', cliente['id']) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Vehículo eliminado'}), 200
    except Exception as e:
        logger.error(f"Error eliminando vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/vehiculos/<int:vehiculo_id>', methods=['GET'])
@cliente_required
def obtener_vehiculo_cliente(current_user, vehiculo_id):
    try:
        cliente = obtener_cliente_por_usuario(current_user['id'])
        if not cliente:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, color, numero_motor, numero_chasis') \
            .eq('id', vehiculo_id) \
            .eq('id_cliente', cliente['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Vehículo no encontrado'}), 404
        
        return jsonify({'success': True, 'vehiculo': result.data[0]}), 200
    except Exception as e:
        logger.error(f"Error obteniendo vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINTS - NOTIFICACIONES
# =====================================================

@perfil_cliente_bp.route('/perfil/notificaciones/preferencias', methods=['PUT'])
@cliente_required
def actualizar_preferencias_cliente(current_user):
    try:
        data = request.get_json()
        preferencias = data.get('preferencias', {})
        
        import json
        existing = supabase.table('preferencias_notificaciones') \
            .select('id') \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        if existing.data:
            supabase.table('preferencias_notificaciones') \
                .update({
                    'preferencias': json.dumps(preferencias),
                    'updated_at': datetime.datetime.now().isoformat()
                }) \
                .eq('id_usuario', current_user['id']) \
                .execute()
        else:
            supabase.table('preferencias_notificaciones') \
                .insert({
                    'id_usuario': current_user['id'],
                    'preferencias': json.dumps(preferencias),
                    'created_at': datetime.datetime.now().isoformat()
                }) \
                .execute()
        
        return jsonify({'success': True, 'message': 'Preferencias actualizadas'}), 200
    except Exception as e:
        logger.error(f"Error actualizando preferencias: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINTS - SESIONES
# =====================================================

@perfil_cliente_bp.route('/perfil/sesiones', methods=['GET'])
@cliente_required
def obtener_sesiones_cliente(current_user):
    try:
        token_actual = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        result = supabase.table('sesion_usuario') \
            .select('id, dispositivo, dispositivo_nombre, ip, ultima_actividad, token_hash') \
            .eq('id_usuario', current_user['id']) \
            .eq('activa', True) \
            .order('ultima_actividad', desc=True) \
            .execute()
        
        sesiones = []
        for s in (result.data or []):
            sesiones.append({
                'id': s.get('id'),
                'dispositivo': s.get('dispositivo', 'desktop'),
                'dispositivo_nombre': s.get('dispositivo_nombre', 'Desconocido'),
                'ip': s.get('ip'),
                'ultima_actividad': s.get('ultima_actividad'),
                'es_actual': s.get('token_hash') == token_actual[:50]
            })
        
        return jsonify({'success': True, 'sesiones': sesiones}), 200
    except Exception as e:
        logger.error(f"Error obteniendo sesiones: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/perfil/sesiones/<session_id>', methods=['DELETE'])
@cliente_required
def cerrar_sesion_cliente(current_user, session_id):
    try:
        supabase.table('sesion_usuario') \
            .update({'activa': False}) \
            .eq('id', session_id) \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error cerrando sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/perfil/sesiones/cerrar-todas', methods=['DELETE'])
@cliente_required
def cerrar_todas_sesiones_cliente(current_user):
    try:
        token_actual = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        supabase.table('sesion_usuario') \
            .update({'activa': False}) \
            .eq('id_usuario', current_user['id']) \
            .neq('token_hash', token_actual[:50]) \
            .execute()
        
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error cerrando todas las sesiones: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINTS - ACTIVIDAD
# =====================================================

@perfil_cliente_bp.route('/perfil/actividad', methods=['GET'])
@cliente_required
def obtener_actividad_cliente(current_user):
    try:
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 10, type=int)
        offset = (page - 1) * limit
        
        total_result = supabase.table('actividad_usuario') \
            .select('id', count='exact') \
            .eq('id_usuario', current_user['id']) \
            .execute()
        
        total = total_result.count if hasattr(total_result, 'count') else 0
        
        result = supabase.table('actividad_usuario') \
            .select('*') \
            .eq('id_usuario', current_user['id']) \
            .order('fecha', desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()
        
        return jsonify({
            'success': True,
            'actividad': result.data or [],
            'pagination': {
                'current_page': page,
                'per_page': limit,
                'total': total,
                'total_pages': (total + limit - 1) // limit if total > 0 else 1
            }
        }), 200
    except Exception as e:
        logger.error(f"Error obteniendo actividad: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/perfil/actividad/exportar', methods=['GET'])
@cliente_required
def exportar_actividad_cliente(current_user):
    try:
        result = supabase.table('actividad_usuario') \
            .select('*') \
            .eq('id_usuario', current_user['id']) \
            .order('fecha', desc=True) \
            .execute()
        
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['Fecha', 'Acción', 'Descripción', 'IP'])
        
        for a in (result.data or []):
            writer.writerow([
                a.get('fecha', ''),
                a.get('accion', ''),
                a.get('descripcion', ''),
                a.get('ip', '')
            ])
        
        output.seek(0)
        
        return send_file(
            BytesIO(output.getvalue().encode('utf-8-sig')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'actividad_{current_user["id"]}_{datetime.datetime.now().strftime("%Y%m%d")}.csv'
        )
    except Exception as e:
        logger.error(f"Error exportando actividad: {str(e)}")
        return jsonify({'error': str(e)}), 500

@perfil_cliente_bp.route('/test-perfil', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de perfil cliente funcionando'}), 200