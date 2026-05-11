# =====================================================
# MIS RESERVAS - CLIENTE (SIN DECORADOR COMPLEJO)
# =====================================================

from flask import Blueprint, request, jsonify, session
from config import config
import datetime
import logging

logger = logging.getLogger(__name__)

misreservas_bp = Blueprint('misreservas', __name__, url_prefix='/api/cliente')

supabase = config.supabase


# =====================================================
# FUNCIÓN PARA VERIFICAR AUTENTICACIÓN MANUALMENTE
# =====================================================

def verificar_token():
    """Verificar token manualmente sin decorador complejo"""
    try:
        # Obtener token del header
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return None, jsonify({'error': 'No autorizado'}), 401
        
        token = auth_header.replace('Bearer ', '')
        
        # Aquí deberías decodificar el JWT y obtener el usuario
        # Por ahora, usamos session como fallback
        if 'user_id' in session:
            usuario_id = session['user_id']
            
            # Obtener usuario
            user = supabase.table('usuario') \
                .select('id, nombre, email') \
                .eq('id', usuario_id) \
                .execute()
            
            if user.data:
                return user.data[0], None, None
        else:
            # Intentar obtener de localStorage vía header personalizado
            user_id = request.headers.get('X-User-Id')
            if user_id:
                user = supabase.table('usuario') \
                    .select('id, nombre, email') \
                    .eq('id', int(user_id)) \
                    .execute()
                if user.data:
                    return user.data[0], None, None
        
        return None, jsonify({'error': 'Sesión inválida'}), 401
        
    except Exception as e:
        logger.error(f"Error verificando token: {e}")
        return None, jsonify({'error': str(e)}), 401


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_id_cliente(usuario_id):
    """Obtener el id de la tabla cliente"""
    try:
        result = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', usuario_id) \
            .execute()
        return result.data[0]['id'] if result.data else None
    except Exception as e:
        logger.error(f"Error obteniendo id_cliente: {e}")
        return None


def obtener_vehiculos_cliente(usuario_id):
    """Obtener los vehículos del cliente"""
    try:
        id_cliente = obtener_id_cliente(usuario_id)
        if not id_cliente:
            return []
        
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio') \
            .eq('id_cliente', id_cliente) \
            .execute()
        
        return vehiculos.data or []
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {e}")
        return []


# =====================================================
# ENDPOINT - OBTENER MIS DATOS (PRUEBA)
# =====================================================

@misreservas_bp.route('/test', methods=['GET'])
def test():
    """Endpoint de prueba sin autenticación"""
    return jsonify({'success': True, 'message': 'API funcionando'}), 200


@misreservas_bp.route('/mi-perfil', methods=['GET'])
def obtener_mi_perfil():
    """Obtener datos del cliente (sin decorador por ahora)"""
    try:
        # Verificar autenticación manualmente
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        
        # Obtener info del cliente
        cliente_info = supabase.table('usuario') \
            .select('id, nombre, contacto, email, ubicacion') \
            .eq('id', usuario_id) \
            .execute()
        
        vehiculos = obtener_vehiculos_cliente(usuario_id)
        
        return jsonify({
            'success': True,
            'cliente': cliente_info.data[0] if cliente_info.data else None,
            'vehiculos': vehiculos
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - CREAR SOLICITUD
# =====================================================

@misreservas_bp.route('/solicitar', methods=['POST'])
def crear_solicitud():
    """Crear nueva solicitud"""
    try:
        # Verificar autenticación
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        data = request.get_json()
        
        id_vehiculo = data.get('id_vehiculo')
        fecha_deseada = data.get('fecha_deseada')
        hora_deseada = data.get('hora_deseada')
        descripcion_problema = data.get('descripcion_problema')
        mensaje_adicional = data.get('mensaje_adicional')
        
        if not id_vehiculo:
            return jsonify({'error': 'Vehículo requerido'}), 400
        if not fecha_deseada:
            return jsonify({'error': 'Fecha requerida'}), 400
        if not descripcion_problema:
            return jsonify({'error': 'Descripción requerida'}), 400
        
        # Crear solicitud
        nueva_solicitud = {
            'id_cliente': usuario_id,
            'id_vehiculo': id_vehiculo,
            'fecha_solicitud': datetime.datetime.now().isoformat(),
            'fecha_deseada': fecha_deseada,
            'hora_deseada': hora_deseada,
            'descripcion_problema': descripcion_problema,
            'mensaje_adicional': mensaje_adicional,
            'estado': 'pendiente',
            'es_manual': False
        }
        
        result = supabase.table('solicitud_reserva_cliente') \
            .insert(nueva_solicitud) \
            .execute()
        
        return jsonify({
            'success': True,
            'solicitud': result.data[0] if result.data else None,
            'message': 'Solicitud enviada'
        }), 201
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - OBTENER SOLICITUDES
# =====================================================

@misreservas_bp.route('/solicitudes', methods=['GET'])
def obtener_solicitudes():
    """Obtener todas las solicitudes del cliente"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        
        result = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .eq('id_cliente', usuario_id) \
            .order('fecha_solicitud', desc=True) \
            .execute()
        
        solicitudes = result.data or []
        
        # Agregar datos del vehículo
        for solicitud in solicitudes:
            if solicitud.get('id_vehiculo'):
                vehiculo = supabase.table('vehiculo') \
                    .select('placa, marca, modelo') \
                    .eq('id', solicitud['id_vehiculo']) \
                    .execute()
                if vehiculo.data:
                    solicitud['vehiculo'] = vehiculo.data[0]
        
        return jsonify({
            'success': True,
            'solicitudes': solicitudes
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e), 'solicitudes': []}), 500


# =====================================================
# ENDPOINT - RESERVAS CONFIRMADAS (CALENDARIO)
# =====================================================

@misreservas_bp.route('/reservas-confirmadas', methods=['GET'])
def obtener_reservas_confirmadas():
    """Obtener reservas confirmadas para el calendario"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        
        result = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .eq('id_cliente', usuario_id) \
            .eq('estado', 'confirmada') \
            .not_.is_('fecha_agendada', 'null') \
            .order('fecha_agendada', desc=False) \
            .execute()
        
        reservas = result.data or []
        
        for reserva in reservas:
            if reserva.get('id_vehiculo'):
                vehiculo = supabase.table('vehiculo') \
                    .select('placa, marca, modelo') \
                    .eq('id', reserva['id_vehiculo']) \
                    .execute()
                if vehiculo.data:
                    reserva['vehiculo'] = vehiculo.data[0]
        
        return jsonify({
            'success': True,
            'reservas': reservas
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e), 'reservas': []}), 500


# =====================================================
# ENDPOINT - ACEPTAR HORARIO
# =====================================================

@misreservas_bp.route('/aceptar-horario/<int:solicitud_id>', methods=['POST'])
def aceptar_horario(solicitud_id):
    """Aceptar horario propuesto"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        data = request.get_json()
        horario_seleccionado = data.get('horario_seleccionado')
        
        if not horario_seleccionado:
            return jsonify({'error': 'Horario requerido'}), 400
        
        result = supabase.table('solicitud_reserva_cliente') \
            .update({
                'estado': 'confirmada',
                'horario_seleccionado': horario_seleccionado,
                'fecha_agendada': horario_seleccionado,
                'fecha_respuesta_cliente': datetime.datetime.now().isoformat()
            }) \
            .eq('id', solicitud_id) \
            .eq('id_cliente', usuario_id) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Reserva confirmada'
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - RECHAZAR HORARIOS
# =====================================================

@misreservas_bp.route('/rechazar-horarios/<int:solicitud_id>', methods=['POST'])
def rechazar_horarios(solicitud_id):
    """Rechazar horarios propuestos"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        data = request.get_json()
        motivo = data.get('motivo', 'Cliente no aceptó')
        
        result = supabase.table('solicitud_reserva_cliente') \
            .update({
                'estado': 'cancelada',
                'respuesta_comentario': motivo,
                'fecha_respuesta_cliente': datetime.datetime.now().isoformat()
            }) \
            .eq('id', solicitud_id) \
            .eq('id_cliente', usuario_id) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Horarios rechazados'
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - CANCELAR RESERVA
# =====================================================

@misreservas_bp.route('/cancelar-reserva/<int:reserva_id>', methods=['POST'])
def cancelar_reserva(reserva_id):
    """Cancelar reserva confirmada"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        data = request.get_json()
        motivo = data.get('motivo', 'Cliente canceló')
        
        result = supabase.table('solicitud_reserva_cliente') \
            .update({
                'estado': 'cancelada',
                'respuesta_comentario': motivo
            }) \
            .eq('id', reserva_id) \
            .eq('id_cliente', usuario_id) \
            .eq('estado', 'confirmada') \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Reserva cancelada'
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500