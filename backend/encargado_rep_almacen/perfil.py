# =====================================================
# PERFIL.PY - ENCARGADO DE REPUESTOS (VERSIÓN COMPLETA CORREGIDA)
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, send_file
from config import config
from decorators import encargado_repuestos_required
import datetime
import logging
import json
import hashlib
from io import StringIO, BytesIO
import csv

logger = logging.getLogger(__name__)

perfil_repuestos_bp = Blueprint('perfil_repuestos', __name__, url_prefix='/api/encargado-repuestos')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, hashed):
    return hash_password(password) == hashed

# =====================================================
# ENDPOINTS - AVATAR (DEBEN IR PRIMERO PARA EVITAR CONFLICTOS)
# =====================================================

@perfil_repuestos_bp.route('/perfil/avatar-url', methods=['PUT', 'POST'])
@encargado_repuestos_required
def actualizar_avatar_url(current_user):
    """Actualizar avatar con URL de Cloudinary (imagen real)"""
    try:
        data = request.get_json()
        avatar_url = data.get('avatar_url')
        
        if not avatar_url:
            return jsonify({'error': 'URL de avatar requerida'}), 400
        
        result = supabase.table('usuario') \
            .update({'avatar_url': avatar_url}) \
            .eq('id', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar avatar'}), 500
        
        logger.info(f"✅ Avatar URL actualizado para usuario {current_user['id']}")
        
        return jsonify({'success': True, 'message': 'Avatar actualizado'}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando avatar URL: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_repuestos_bp.route('/perfil/avatar', methods=['PUT'])
@encargado_repuestos_required
def actualizar_avatar(current_user):
    """Actualizar avatar con icono predefinido"""
    try:
        data = request.get_json()
        avatar = data.get('avatar', 'box')
        
        # Guardar como 'avatar_nombre' para mantener consistencia
        avatar_url = f'avatar_{avatar}'
        
        result = supabase.table('usuario') \
            .update({'avatar_url': avatar_url}) \
            .eq('id', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar avatar'}), 500
        
        return jsonify({'success': True, 'message': 'Avatar actualizado'}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando avatar: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - INFORMACIÓN PERSONAL
# =====================================================

@perfil_repuestos_bp.route('/perfil', methods=['GET'])
@encargado_repuestos_required
def obtener_perfil(current_user):
    """Obtener información del perfil del encargado"""
    try:
        result = supabase.table('usuario') \
            .select('id, nombre, email, contacto, ubicacion, avatar_url, fecha_registro, rol_principal') \
            .eq('id', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        usuario = result.data[0]
        
        # Procesar avatar_url
        avatar_url = usuario.get('avatar_url', '')
        avatar_valor = 'box'
        
        if avatar_url:
            if avatar_url.startswith('http'):
                avatar_valor = avatar_url
            elif avatar_url.startswith('avatar_'):
                avatar_valor = avatar_url.replace('avatar_', '')
            else:
                avatar_valor = avatar_url
        
        # Preferencias por defecto (sin consultar tabla que no existe)
        preferencias = {
            'nueva_cotizacion': True,
            'compra_confirmada': True,
            'entrega_realizada': True,
            'stock_bajo': True
        }
        
        return jsonify({
            'success': True,
            'usuario': {
                'id': usuario.get('id'),
                'nombre': usuario.get('nombre'),
                'email': usuario.get('email'),
                'telefono': usuario.get('contacto', ''),
                'whatsapp': usuario.get('contacto', ''),
                'direccion': usuario.get('ubicacion', ''),
                'avatar': avatar_valor,
                'preferencias_notificaciones': preferencias,
                'created_at': usuario.get('fecha_registro'),
                'rol_principal': usuario.get('rol_principal')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_repuestos_bp.route('/perfil', methods=['PUT'])
@encargado_repuestos_required
def actualizar_perfil(current_user):
    """Actualizar información del perfil"""
    try:
        data = request.get_json()
        
        update_data = {
            'nombre': data.get('nombre'),
            'contacto': data.get('telefono'),
            'ubicacion': data.get('direccion'),
        }
        
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        result = supabase.table('usuario') \
            .update(update_data) \
            .eq('id', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar perfil'}), 500
        
        return jsonify({'success': True, 'message': 'Perfil actualizado'}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_repuestos_bp.route('/perfil/cambiar-password', methods=['PUT'])
@encargado_repuestos_required
def cambiar_password(current_user):
    """Cambiar contraseña del usuario"""
    try:
        data = request.get_json()
        password_actual = data.get('password_actual')
        password_nueva = data.get('password_nueva')
        
        result = supabase.table('usuario') \
            .select('contrasenia') \
            .eq('id', current_user['id']) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        from werkzeug.security import check_password_hash, generate_password_hash
        
        if not check_password_hash(result.data[0]['contrasenia'], password_actual):
            return jsonify({'error': 'Contraseña actual incorrecta'}), 401
        
        nuevo_hash = generate_password_hash(password_nueva)
        supabase.table('usuario') \
            .update({'contrasenia': nuevo_hash}) \
            .eq('id', current_user['id']) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Contraseña cambiada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error cambiando password: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - NOTIFICACIONES (Manejo de error si tabla no existe)
# =====================================================

@perfil_repuestos_bp.route('/perfil/notificaciones', methods=['GET'])
@encargado_repuestos_required
def obtener_notificaciones(current_user):
    """Obtener notificaciones del usuario"""
    try:
        limit = request.args.get('limit', 20, type=int)
        
        result = supabase.table('notificacion') \
            .select('*') \
            .eq('id_usuario_destino', current_user['id']) \
            .order('fecha_envio', desc=True) \
            .limit(limit) \
            .execute()
        
        return jsonify({
            'success': True,
            'notificaciones': result.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo notificaciones: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_repuestos_bp.route('/perfil/notificaciones/<int:id_notificacion>/leer', methods=['PUT'])
@encargado_repuestos_required
def marcar_notificacion_leida(current_user, id_notificacion):
    """Marcar una notificación como leída"""
    try:
        supabase.table('notificacion') \
            .update({'leida': True}) \
            .eq('id', id_notificacion) \
            .eq('id_usuario_destino', current_user['id']) \
            .execute()
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Error marcando notificación: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_repuestos_bp.route('/perfil/notificaciones/leer-todas', methods=['PUT'])
@encargado_repuestos_required
def marcar_todas_notificaciones_leidas(current_user):
    """Marcar todas las notificaciones como leídas"""
    try:
        supabase.table('notificacion') \
            .update({'leida': True}) \
            .eq('id_usuario_destino', current_user['id']) \
            .eq('leida', False) \
            .execute()
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Error marcando todas las notificaciones: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - SESIONES
# =====================================================

@perfil_repuestos_bp.route('/perfil/sesiones', methods=['GET'])
@encargado_repuestos_required
def obtener_sesiones(current_user):
    """Obtener sesiones activas del usuario"""
    try:
        token_actual = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        result = supabase.table('sesion_usuario') \
            .select('*') \
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
                'fecha_creacion': s.get('fecha_creacion'),
                'es_actual': s.get('token_hash') == token_actual[:50] if s.get('token_hash') else False
            })
        
        return jsonify({'success': True, 'sesiones': sesiones}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo sesiones: {str(e)}")
        return jsonify({'error': str(e)}), 500


@perfil_repuestos_bp.route('/perfil/sesiones/<string:session_id>', methods=['DELETE'])
@encargado_repuestos_required
def cerrar_sesion_especifica(current_user, session_id):
    """Cerrar una sesión específica"""
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


@perfil_repuestos_bp.route('/perfil/sesiones/cerrar-todas', methods=['DELETE'])
@encargado_repuestos_required
def cerrar_todas_sesiones(current_user):
    """Cerrar todas las sesiones excepto la actual"""
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

@perfil_repuestos_bp.route('/perfil/actividad', methods=['GET'])
@encargado_repuestos_required
def obtener_actividad(current_user):
    """Obtener historial de actividad del usuario"""
    try:
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 20, type=int)
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


@perfil_repuestos_bp.route('/perfil/actividad/exportar', methods=['GET'])
@encargado_repuestos_required
def exportar_actividad(current_user):
    """Exportar actividad a CSV"""
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
            BytesIO(output.getvalue().encode('utf-8')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'actividad_{current_user["id"]}_{datetime.datetime.now().strftime("%Y%m%d")}.csv'
        )
        
    except Exception as e:
        logger.error(f"Error exportando actividad: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@perfil_repuestos_bp.route('/test-perfil', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de perfil funcionando'}), 200