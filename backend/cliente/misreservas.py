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


# =====================================================
# ENDPOINT - VEHÍCULOS EN TALLER (ÓRDENES ACTIVAS)
# =====================================================

@misreservas_bp.route('/vehiculos-en-taller', methods=['GET'])
def obtener_vehiculos_en_taller():
    """Obtener las órdenes activas del cliente (vehículos en taller)"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        
        # Obtener el ID del cliente desde la tabla cliente
        cliente = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return jsonify({'ordenes': []}), 200
        
        id_cliente = cliente.data[0]['id']
        
        # Obtener vehículos del cliente
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo') \
            .eq('id_cliente', id_cliente) \
            .execute()
        
        ids_vehiculos = [v['id'] for v in vehiculos.data] if vehiculos.data else []
        
        if not ids_vehiculos:
            return jsonify({'ordenes': []}), 200
        
        # Obtener órdenes activas (que no hayan finalizado ni entregado)
        ordenes = supabase.table('ordentrabajo') \
            .select('''
                id, 
                codigo_unico, 
                id_vehiculo, 
                fecha_ingreso, 
                estado_global,
                fecha_estimada_finalizacion,
                dias_estimados_reparacion
            ''') \
            .in_('id_vehiculo', ids_vehiculos) \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        # Para cada orden, obtener la planificación si existe (fallback)
        for orden in ordenes.data:
            planificacion = supabase.table('planificacion') \
                .select('fecha_hora_inicio_real, fecha_hora_fin_estimado, horas_estimadas') \
                .eq('id_orden_trabajo', orden['id']) \
                .execute()
            
            if planificacion.data:
                orden['planificacion'] = planificacion.data[0]
                
                # Si no hay fecha_estimada_finalizacion pero hay planificación, usarla
                if not orden.get('fecha_estimada_finalizacion') and planificacion.data[0].get('fecha_hora_fin_estimado'):
                    orden['fecha_estimada_finalizacion'] = planificacion.data[0]['fecha_hora_fin_estimado']
            
            # Obtener datos del vehículo
            vehiculo = next((v for v in vehiculos.data if v['id'] == orden['id_vehiculo']), None)
            if vehiculo:
                orden['vehiculo'] = vehiculo
        
        return jsonify({
            'success': True,
            'ordenes': ordenes.data
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos en taller: {str(e)}")
        return jsonify({'error': str(e), 'ordenes': []}), 500


# =====================================================
# ENDPOINT - DETALLE DE ORDEN DE TRABAJO
# =====================================================

@misreservas_bp.route('/orden-trabajo/<int:orden_id>', methods=['GET'])
def obtener_detalle_orden(orden_id):
    """Obtener detalle de una orden de trabajo del cliente"""
    try:
        user, error_response, error_code = verificar_token()
        if error_response:
            return error_response, error_code
        
        usuario_id = user['id']
        
        # Obtener el ID del cliente
        cliente = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        id_cliente = cliente.data[0]['id']
        
        # Obtener la orden con datos del vehículo
        orden = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                estado_global,
                fecha_ingreso,
                fecha_salida,
                fecha_estimada_finalizacion,
                dias_estimados_reparacion,
                vehiculo!inner (
                    id,
                    placa,
                    marca,
                    modelo,
                    id_cliente
                )
            ''') \
            .eq('id', orden_id) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data[0]
        
        # Verificar que el vehículo pertenece al cliente
        if orden_data['vehiculo']['id_cliente'] != id_cliente:
            return jsonify({'error': 'No autorizado'}), 403
        
        # Obtener planificación si existe
        planificacion = supabase.table('planificacion') \
            .select('*') \
            .eq('id_orden_trabajo', orden_id) \
            .execute()
        
        if planificacion.data:
            orden_data['planificacion'] = planificacion.data[0]
        
        # Obtener diagnósticos (opcional, para mostrar más info)
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('informe, estado, fecha_envio') \
            .eq('id_orden_trabajo', orden_id) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico.data:
            orden_data['diagnostico'] = diagnostico.data[0]
        
        return jsonify({
            'success': True,
            'orden': orden_data
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de orden: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT - REGISTRAR NUEVO VEHÍCULO
# =====================================================

@misreservas_bp.route('/vehiculos', methods=['POST'])
def registrar_vehiculo():
    """Registrar un nuevo vehículo para el cliente"""
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
        
        # Verificar si el cliente existe en la tabla cliente
        cliente = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            # Crear cliente si no existe
            nuevo_cliente = supabase.table('cliente') \
                .insert({'id_usuario': usuario_id}) \
                .execute()
            id_cliente = nuevo_cliente.data[0]['id']
        else:
            id_cliente = cliente.data[0]['id']
        
        # Verificar si la placa ya existe para este cliente
        existe = supabase.table('vehiculo') \
            .select('id') \
            .eq('placa', placa) \
            .eq('id_cliente', id_cliente) \
            .execute()
        
        if existe.data:
            return jsonify({'error': 'Ya tienes un vehículo registrado con esa placa'}), 400
        
        # Registrar vehículo
        nuevo_vehiculo = supabase.table('vehiculo') \
            .insert({
                'id_cliente': id_cliente,
                'placa': placa,
                'marca': marca,
                'modelo': modelo,
                'anio': anio if anio else None,
                'kilometraje': kilometraje if kilometraje else None
            }) \
            .execute()
        
        return jsonify({
            'success': True,
            'vehiculo': nuevo_vehiculo.data[0],
            'message': 'Vehículo registrado correctamente'
        }), 201
        
    except Exception as e:
        logger.error(f"Error registrando vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500