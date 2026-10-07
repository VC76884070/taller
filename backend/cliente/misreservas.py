# =====================================================
# MIS RESERVAS - CLIENTE
# VERSIÓN ADAPTADA: id_cliente en BD = usuario_id
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
import datetime
import logging
import jwt

logger = logging.getLogger(__name__)

misreservas_bp = Blueprint('misreservas', __name__, url_prefix='/api/cliente')

supabase = config.supabase


# =====================================================
# VERIFICAR TOKEN JWT
# =====================================================

def verificar_token():
    """Verificar token JWT y retornar datos del usuario"""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return None, jsonify({'error': 'No autorizado'}), 401
        
        token = auth_header.replace('Bearer ', '').strip()
        if not token:
            return None, jsonify({'error': 'Token vacío'}), 401
        
        try:
            payload = jwt.decode(token, config.SECRET_KEY, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            return None, jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {e}")
            return None, jsonify({'error': 'Token inválido'}), 401
        
        user_data = payload.get('user', payload)
        usuario_id = user_data.get('id')
        
        if not usuario_id:
            return None, jsonify({'error': 'Token inválido: sin ID'}), 401
        
        user = supabase.table('usuario') \
            .select('id, nombre, email, contacto') \
            .eq('id', usuario_id) \
            .execute()
        
        if not user.data:
            return None, jsonify({'error': 'Usuario no encontrado'}), 401
        
        return user.data[0], None, None
        
    except Exception as e:
        logger.error(f"Error verificando token: {e}")
        return None, jsonify({'error': str(e)}), 401


# =====================================================
# HELPER: OBTENER CLIENTE REAL DESDE USUARIO_ID
# =====================================================

def obtener_id_cliente_real(usuario_id):
    """
    Dado un usuario_id, retorna el id real de la tabla cliente.
    Retorna None si no existe.
    """
    try:
        result = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if result.data:
            return result.data[0]['id']
        return None
    except Exception as e:
        logger.error(f"Error obteniendo cliente real: {e}")
        return None


def obtener_o_crear_cliente_real(usuario_id):
    """Obtiene el cliente real, o lo crea si no existe"""
    id_cliente = obtener_id_cliente_real(usuario_id)
    if id_cliente:
        return id_cliente
    
    # Crear cliente
    logger.info(f"⚠️ Creando cliente para usuario {usuario_id}")
    nuevo = supabase.table('cliente').insert({
        'id_usuario': usuario_id,
        'es_propietario': True
    }).execute()
    
    if not nuevo.data:
        return None
    return nuevo.data[0]['id']


# =====================================================
# ENDPOINT - MI PERFIL
# =====================================================

@misreservas_bp.route('/mi-perfil', methods=['GET'])
def obtener_mi_perfil():
    """Obtener datos del cliente y sus vehículos"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        
        cliente_info = supabase.table('usuario') \
            .select('id, nombre, contacto, email, ubicacion') \
            .eq('id', usuario_id) \
            .execute()
        
        # 🔥 Obtener vehículos usando el id_cliente REAL (no usuario_id)
        id_cliente_real = obtener_o_crear_cliente_real(usuario_id)
        vehiculos = []
        
        if id_cliente_real:
            vehiculos_result = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio') \
                .eq('id_cliente', id_cliente_real) \
                .execute()
            vehiculos = vehiculos_result.data or []
        
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
# GUARDA id_cliente = usuario_id (por la FK actual)
# =====================================================

@misreservas_bp.route('/solicitar', methods=['POST'])
def crear_solicitud():
    """Crear nueva solicitud de reserva"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        data = request.get_json()
        
        logger.info(f"📝 Nueva solicitud de usuario {usuario_id}: {data}")
        
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
        
        # 🔥 Verificar que el vehículo pertenece al cliente REAL
        id_cliente_real = obtener_o_crear_cliente_real(usuario_id)
        if not id_cliente_real:
            return jsonify({'error': 'Error obteniendo cliente'}), 500
        
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, id_cliente') \
            .eq('id', id_vehiculo) \
            .execute()
        
        if not vehiculo.data:
            return jsonify({'error': 'Vehículo no encontrado'}), 404
        
        if vehiculo.data[0]['id_cliente'] != id_cliente_real:
            return jsonify({'error': 'No autorizado para usar este vehículo'}), 403
        
        # 🔥 GUARDAR id_cliente = usuario_id (para respetar la FK actual)
        nueva_solicitud = {
            'id_cliente': usuario_id,           # ← FK apunta a usuario.id
            'id_vehiculo': id_vehiculo,
            'fecha_solicitud': datetime.datetime.now().isoformat(),
            'fecha_deseada': fecha_deseada,
            'hora_deseada': hora_deseada or None,
            'descripcion_problema': descripcion_problema,
            'mensaje_adicional': mensaje_adicional or None,
            'estado': 'pendiente',
            'es_manual': False
        }
        
        logger.info(f"💾 Insertando: id_cliente={usuario_id}, id_vehiculo={id_vehiculo}")
        
        result = supabase.table('solicitud_reserva_cliente') \
            .insert(nueva_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error guardando solicitud'}), 500
        
        logger.info(f"✅ Solicitud creada: {result.data[0].get('id')}")
        
        return jsonify({
            'success': True,
            'solicitud': result.data[0],
            'message': 'Solicitud enviada correctamente'
        }), 201
        
    except Exception as e:
        logger.error(f"❌ Error creando solicitud: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - OBTENER SOLICITUDES
# Busca por id_cliente = usuario_id
# =====================================================

@misreservas_bp.route('/solicitudes', methods=['GET'])
def obtener_solicitudes():
    """Obtener solicitudes del cliente"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        
        # 🔥 Buscar por id_cliente = usuario_id (así se guardan)
        result = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .eq('id_cliente', usuario_id) \
            .order('fecha_solicitud', desc=True) \
            .execute()
        
        solicitudes = result.data or []
        
        # Enriquecer con datos del vehículo
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
        logger.error(f"❌ Error obteniendo solicitudes: {str(e)}")
        return jsonify({'error': str(e), 'solicitudes': []}), 500


# =====================================================
# ENDPOINT - RESERVAS CONFIRMADAS
# =====================================================

@misreservas_bp.route('/reservas-confirmadas', methods=['GET'])
def obtener_reservas_confirmadas():
    """Reservas confirmadas para el calendario"""
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
        logger.error(f"❌ Error obteniendo reservas: {str(e)}")
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
        
        supabase.table('solicitud_reserva_cliente') \
            .update({
                'estado': 'confirmada',
                'horario_seleccionado': horario_seleccionado,
                'fecha_agendada': horario_seleccionado,
                'fecha_respuesta_cliente': datetime.datetime.now().isoformat()
            }) \
            .eq('id', solicitud_id) \
            .eq('id_cliente', usuario_id) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Reserva confirmada'}), 200
        
    except Exception as e:
        logger.error(f"❌ Error aceptando horario: {str(e)}")
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
        data = request.get_json() or {}
        motivo = data.get('motivo', 'Cliente no aceptó')
        
        supabase.table('solicitud_reserva_cliente') \
            .update({
                'estado': 'cancelada',
                'respuesta_comentario': motivo,
                'fecha_respuesta_cliente': datetime.datetime.now().isoformat()
            }) \
            .eq('id', solicitud_id) \
            .eq('id_cliente', usuario_id) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Horarios rechazados'}), 200
        
    except Exception as e:
        logger.error(f"❌ Error rechazando horarios: {str(e)}")
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
        data = request.get_json() or {}
        motivo = data.get('motivo', 'Cliente canceló')
        
        supabase.table('solicitud_reserva_cliente') \
            .update({
                'estado': 'cancelada',
                'respuesta_comentario': motivo
            }) \
            .eq('id', reserva_id) \
            .eq('id_cliente', usuario_id) \
            .eq('estado', 'confirmada') \
            .execute()
        
        return jsonify({'success': True, 'message': 'Reserva cancelada'}), 200
        
    except Exception as e:
        logger.error(f"❌ Error cancelando reserva: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - VEHÍCULOS EN TALLER
# =====================================================

@misreservas_bp.route('/vehiculos-en-taller', methods=['GET'])
def obtener_vehiculos_en_taller():
    """Órdenes activas del cliente"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        
        # 🔥 Obtener id_cliente REAL
        id_cliente_real = obtener_o_crear_cliente_real(usuario_id)
        if not id_cliente_real:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        # Vehículos del cliente
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo') \
            .eq('id_cliente', id_cliente_real) \
            .execute()
        
        ids_vehiculos = [v['id'] for v in vehiculos.data] if vehiculos.data else []
        
        if not ids_vehiculos:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        # Órdenes activas
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo, fecha_ingreso, estado_global, fecha_estimada_finalizacion, dias_estimados_reparacion') \
            .in_('id_vehiculo', ids_vehiculos) \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        for orden in (ordenes.data or []):
            vehiculo = next((v for v in vehiculos.data if v['id'] == orden['id_vehiculo']), None)
            if vehiculo:
                orden['vehiculo'] = vehiculo
        
        return jsonify({
            'success': True,
            'ordenes': ordenes.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo vehículos en taller: {str(e)}")
        return jsonify({'error': str(e), 'ordenes': []}), 500


# =====================================================
# ENDPOINT - DETALLE DE ORDEN
# =====================================================

@misreservas_bp.route('/orden-trabajo/<int:orden_id>', methods=['GET'])
def obtener_detalle_orden(orden_id):
    """Detalle de una orden de trabajo"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        id_cliente_real = obtener_o_crear_cliente_real(usuario_id)
        
        if not id_cliente_real:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, fecha_estimada_finalizacion, dias_estimados_reparacion, vehiculo!inner(id, placa, marca, modelo, id_cliente)') \
            .eq('id', orden_id) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data[0]
        
        if orden_data['vehiculo']['id_cliente'] != id_cliente_real:
            return jsonify({'error': 'No autorizado'}), 403
        
        return jsonify({'success': True, 'orden': orden_data}), 200
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo orden: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - REGISTRAR VEHÍCULO
# =====================================================

@misreservas_bp.route('/vehiculos', methods=['POST'])
def registrar_vehiculo():
    """Registrar un nuevo vehículo"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        data = request.get_json()
        
        placa = data.get('placa', '').upper().strip()
        marca = data.get('marca', '').strip()
        modelo = data.get('modelo', '').strip()
        anio = data.get('anio')
        kilometraje = data.get('kilometraje')
        
        if not placa or not marca or not modelo:
            return jsonify({'error': 'Placa, marca y modelo son requeridos'}), 400
        
        # 🔥 Obtener id_cliente REAL
        id_cliente_real = obtener_o_crear_cliente_real(usuario_id)
        if not id_cliente_real:
            return jsonify({'error': 'Error con cliente'}), 500
        
        existe = supabase.table('vehiculo') \
            .select('id') \
            .eq('placa', placa) \
            .eq('id_cliente', id_cliente_real) \
            .execute()
        
        if existe.data:
            return jsonify({'error': 'Ya tienes un vehículo con esa placa'}), 400
        
        nuevo = supabase.table('vehiculo').insert({
            'id_cliente': id_cliente_real,
            'placa': placa,
            'marca': marca,
            'modelo': modelo,
            'anio': anio if anio else None,
            'kilometraje': kilometraje if kilometraje else None
        }).execute()
        
        return jsonify({
            'success': True,
            'vehiculo': nuevo.data[0],
            'message': 'Vehículo registrado'
        }), 201
        
    except Exception as e:
        logger.error(f"❌ Error registrando vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - TEST
# =====================================================

@misreservas_bp.route('/test', methods=['GET'])
def test():
    return jsonify({'success': True, 'message': 'API funcionando'}), 200