# =====================================================
# RESERVAS Y SOLICITUDES - JEFE TALLER
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import secrets
import string
import hashlib

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
reservas_solicitudes_bp = Blueprint('reservas_solicitudes', __name__, url_prefix='/api/jefe-taller')

# Configuración
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def verificar_rol_usuario(usuario_id, rol_nombre):
    """Verificar si un usuario tiene un rol específico"""
    try:
        result = supabase.rpc('usuario_tiene_rol', {
            'p_usuario_id': usuario_id,
            'p_rol_nombre': rol_nombre
        }).execute()
        return result.data if result.data else False
    except Exception as e:
        logger.error(f"Error verificando rol: {e}")
        return False

def obtener_nombre_usuario(usuario_id):
    """Obtener nombre de usuario por ID"""
    try:
        if not usuario_id:
            return None
        result = supabase.table('usuario') \
            .select('nombre, contacto, email') \
            .eq('id', usuario_id) \
            .execute()
        if result.data:
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Error obteniendo nombre de usuario: {e}")
        return None

def generar_contrasena_temporal(email):
    """Generar una contraseña temporal para el cliente"""
    email_prefix = email.split('@')[0]
    random_suffix = ''.join(secrets.choice(string.digits) for _ in range(4))
    return f"{email_prefix}{random_suffix}"

def validar_disponibilidad_horario(fecha_agendada, excluir_id=None):
    """
    Validar si hay disponibilidad para la fecha y hora solicitada.
    Retorna (bool, str) - (disponible, mensaje)
    """
    try:
        # Limpiar la fecha string
        fecha_str = fecha_agendada.replace('Z', '').replace('+00:00', '')
        if ' ' in fecha_str:
            nueva_fecha = datetime.datetime.strptime(fecha_str, '%Y-%m-%d %H:%M:%S')
        else:
            nueva_fecha = datetime.datetime.fromisoformat(fecha_str)
        
        # Calcular el rango de 1 hora antes y después
        hora_inicio_min = nueva_fecha - datetime.timedelta(hours=1)
        hora_fin_max = nueva_fecha + datetime.timedelta(hours=1)
        
        # Buscar reservas existentes en el horario cercano
        query = supabase.table('solicitud_reserva_cliente') \
            .select('id, fecha_agendada, estado') \
            .not_.is_('fecha_agendada', 'null') \
            .gte('fecha_agendada', hora_inicio_min.isoformat()) \
            .lte('fecha_agendada', hora_fin_max.isoformat()) \
            .in_('estado', ['confirmada', 'pendiente'])
        
        if excluir_id:
            query = query.neq('id', excluir_id)
        
        result = query.execute()
        
        if result.data and len(result.data) > 0:
            conflictos = []
            for r in result.data:
                fecha_existente_str = r['fecha_agendada'].replace('Z', '').replace('+00:00', '')
                if ' ' in fecha_existente_str:
                    fecha_existente = datetime.datetime.strptime(fecha_existente_str, '%Y-%m-%d %H:%M:%S')
                else:
                    fecha_existente = datetime.datetime.fromisoformat(fecha_existente_str)
                diff_minutos = abs((fecha_existente - nueva_fecha).total_seconds() / 60)
                conflictos.append(f"{r['fecha_agendada'][:16]} (diferencia de {int(diff_minutos)} minutos)")
            
            mensaje = f"No hay disponibilidad para esa hora. Debe haber al menos 1 hora de diferencia con otras reservas.\n\nReservas cercanas:\n" + "\n".join(conflictos)
            return False, mensaje
        
        return True, "Horario disponible"
        
    except Exception as e:
        logger.error(f"Error validando disponibilidad: {e}")
        return True, "No se pudo validar disponibilidad"


# =====================================================
# ENDPOINTS - NOTIFICACIONES
# =====================================================

@reservas_solicitudes_bp.route('/notificaciones', methods=['GET'])
@jefe_taller_required
def obtener_notificaciones(current_user):
    """Obtener notificaciones del jefe de taller"""
    try:
        result = supabase.table('notificacion') \
            .select('*') \
            .eq('id_usuario_destino', current_user['id']) \
            .order('fecha_envio', desc=True) \
            .limit(50) \
            .execute()
        
        return jsonify({'success': True, 'notificaciones': result.data or []}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo notificaciones: {str(e)}")
        return jsonify({'error': str(e), 'notificaciones': []}), 500


# =====================================================
# ENDPOINTS - SOLICITUDES DE CLIENTES
# =====================================================

@reservas_solicitudes_bp.route('/solicitudes-clientes', methods=['GET'])
@jefe_taller_required
def obtener_solicitudes_clientes(current_user):
    """Obtener todas las solicitudes de clientes"""
    try:
        estado = request.args.get('estado')
        
        query = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .order('fecha_solicitud', desc=True)
        
        if estado and estado != 'todos':
            query = query.eq('estado', estado)
        
        result = query.execute()
        solicitudes = result.data or []
        
        for solicitud in solicitudes:
            if solicitud.get('id_cliente'):
                usuario = obtener_nombre_usuario(solicitud['id_cliente'])
                if usuario:
                    solicitud['cliente_nombre'] = usuario.get('nombre')
                    solicitud['cliente_contacto'] = usuario.get('contacto')
                    solicitud['cliente_email'] = usuario.get('email')
            
            if solicitud.get('id_vehiculo'):
                vehiculo = supabase.table('vehiculo') \
                    .select('placa, marca, modelo, anio') \
                    .eq('id', solicitud['id_vehiculo']) \
                    .execute()
                if vehiculo.data:
                    solicitud['placa'] = vehiculo.data[0].get('placa')
                    solicitud['marca'] = vehiculo.data[0].get('marca')
                    solicitud['modelo'] = vehiculo.data[0].get('modelo')
                    solicitud['anio'] = vehiculo.data[0].get('anio')
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitudes: {str(e)}")
        return jsonify({'error': str(e), 'solicitudes': []}), 500


@reservas_solicitudes_bp.route('/solicitudes-clientes/<int:id_solicitud>', methods=['GET'])
@jefe_taller_required
def obtener_solicitud_cliente(current_user, id_solicitud):
    """Obtener detalle de una solicitud específica"""
    try:
        result = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        solicitud = result.data[0]
        
        if solicitud.get('id_cliente'):
            usuario = obtener_nombre_usuario(solicitud['id_cliente'])
            if usuario:
                solicitud['cliente_nombre'] = usuario.get('nombre')
                solicitud['cliente_contacto'] = usuario.get('contacto')
        
        if solicitud.get('id_vehiculo'):
            vehiculo = supabase.table('vehiculo') \
                .select('placa, marca, modelo, anio') \
                .eq('id', solicitud['id_vehiculo']) \
                .execute()
            if vehiculo.data:
                solicitud['placa'] = vehiculo.data[0].get('placa')
                solicitud['marca'] = vehiculo.data[0].get('marca')
                solicitud['modelo'] = vehiculo.data[0].get('modelo')
        
        return jsonify({'success': True, 'solicitud': solicitud}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500


@reservas_solicitudes_bp.route('/solicitudes-clientes/<int:id_solicitud>/estado', methods=['PATCH'])
@jefe_taller_required
def actualizar_estado_solicitud(current_user, id_solicitud):
    """Actualizar el estado de una solicitud (confirmar/rechazar) con validación de horario"""
    try:
        data = request.get_json()
        nuevo_estado = data.get('estado')
        fecha_agendada = data.get('fecha_agendada')
        
        if not nuevo_estado:
            return jsonify({'error': 'Estado requerido'}), 400
        
        if nuevo_estado not in ['pendiente', 'confirmada', 'cancelada', 'completada']:
            return jsonify({'error': 'Estado no válido'}), 400
        
        update_data = {'estado': nuevo_estado}
        
        if nuevo_estado == 'confirmada':
            # Obtener la solicitud actual
            solicitud_actual = supabase.table('solicitud_reserva_cliente') \
                .select('fecha_deseada, hora_deseada') \
                .eq('id', id_solicitud) \
                .execute()
            
            if not solicitud_actual.data:
                return jsonify({'error': 'Solicitud no encontrada'}), 404
            
            if fecha_agendada:
                fecha_agendada_str = fecha_agendada
            else:
                fecha_str = solicitud_actual.data[0].get('fecha_deseada')
                hora_str = solicitud_actual.data[0].get('hora_deseada', '10:00')
                fecha_agendada_str = f"{fecha_str} {hora_str}:00"
            
            # Validar disponibilidad de horario (excluyendo esta solicitud)
            disponible, mensaje = validar_disponibilidad_horario(fecha_agendada_str, excluir_id=id_solicitud)
            if not disponible:
                return jsonify({'error': mensaje}), 409
            
            update_data['fecha_agendada'] = fecha_agendada_str
        
        result = supabase.table('solicitud_reserva_cliente') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if nuevo_estado in ['confirmada', 'cancelada']:
            solicitud = result.data[0]
            if nuevo_estado == 'confirmada':
                mensaje = f"✅ Tu solicitud para el {solicitud.get('fecha_deseada')} a las {solicitud.get('hora_deseada')} ha sido CONFIRMADA. Te esperamos en el taller."
            else:
                mensaje = f"❌ Tu solicitud para el {solicitud.get('fecha_deseada')} ha sido RECHAZADA. Contáctanos para más información."
            
            supabase.table('notificacion').insert({
                'id_usuario_destino': solicitud.get('id_cliente'),
                'tipo': f'solicitud_{nuevo_estado}',
                'mensaje': mensaje,
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        return jsonify({'success': True, 'solicitud': result.data[0]}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando estado de solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - CLIENTES Y VEHÍCULOS
# =====================================================

@reservas_solicitudes_bp.route('/clientes', methods=['GET'])
@jefe_taller_required
def obtener_clientes(current_user):
    """Obtener lista de clientes para el formulario"""
    try:
        clientes = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .execute()
        
        clientes_filtrados = []
        for cliente in (clientes.data or []):
            es_cliente = verificar_rol_usuario(cliente['id'], 'cliente')
            if es_cliente:
                clientes_filtrados.append(cliente)
        
        return jsonify({'success': True, 'clientes': clientes_filtrados}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo clientes: {str(e)}")
        return jsonify({'error': str(e), 'clientes': []}), 500


@reservas_solicitudes_bp.route('/vehiculos-cliente/<int:cliente_id>', methods=['GET'])
@jefe_taller_required
def obtener_vehiculos_cliente(current_user, cliente_id):
    """Obtener vehículos de un cliente específico"""
    try:
        cliente_data = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', cliente_id) \
            .execute()
        
        if not cliente_data.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        id_cliente = cliente_data.data[0]['id']
        
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio') \
            .eq('id_cliente', id_cliente) \
            .execute()
        
        return jsonify({'success': True, 'vehiculos': vehiculos.data or []}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos del cliente: {str(e)}")
        return jsonify({'error': str(e), 'vehiculos': []}), 500


# =====================================================
# ENDPOINT - REGISTRAR NUEVO CLIENTE
# =====================================================

@reservas_solicitudes_bp.route('/clientes/nuevo', methods=['POST'])
@jefe_taller_required
def registrar_nuevo_cliente(current_user):
    """Registrar un nuevo cliente con su vehículo desde el jefe de taller"""
    try:
        data = request.get_json()
        
        nombre = data.get('nombre')
        email = data.get('email')
        contacto = data.get('contacto')
        ubicacion = data.get('ubicacion')
        placa = data.get('placa')
        marca = data.get('marca')
        modelo = data.get('modelo')
        anio = data.get('anio')
        
        if not nombre:
            return jsonify({'error': 'El nombre es requerido'}), 400
        if not email:
            return jsonify({'error': 'El email es requerido'}), 400
        if not contacto:
            return jsonify({'error': 'El teléfono es requerido'}), 400
        if not placa:
            return jsonify({'error': 'La placa del vehículo es requerida'}), 400
        
        existing_user = supabase.table('usuario') \
            .select('id') \
            .eq('email', email) \
            .execute()
        
        if existing_user.data:
            return jsonify({'error': 'Ya existe un usuario con este email'}), 400
        
        existing_placa = supabase.table('vehiculo') \
            .select('id') \
            .eq('placa', placa.upper()) \
            .execute()
        
        if existing_placa.data:
            return jsonify({'error': 'Ya existe un vehículo con esta placa'}), 400
        
        password_temporal = generar_contrasena_temporal(email)
        hashed_password = hashlib.sha256(password_temporal.encode()).hexdigest()
        
        nuevo_usuario = {
            'nombre': nombre,
            'email': email,
            'contacto': contacto,
            'ubicacion': ubicacion if ubicacion else None,
            'contrasenia': hashed_password,
            'fecha_registro': datetime.datetime.now().isoformat()
        }
        
        result_usuario = supabase.table('usuario') \
            .insert(nuevo_usuario) \
            .execute()
        
        if not result_usuario.data:
            return jsonify({'error': 'Error al crear el usuario'}), 500
        
        usuario_id = result_usuario.data[0]['id']
        
        # Asignar rol de cliente
        try:
            rol_cliente = supabase.table('rol') \
                .select('id') \
                .eq('nombre_rol', 'cliente') \
                .execute()
            
            if rol_cliente.data:
                supabase.table('usuario_rol').insert({
                    'id_usuario': usuario_id,
                    'id_rol': rol_cliente.data[0]['id']
                }).execute()
        except Exception as e:
            logger.warning(f"No se pudo asignar rol cliente: {e}")
        
        # Crear el cliente
        nuevo_cliente = {
            'id_usuario': usuario_id
        }
        
        result_cliente = supabase.table('cliente') \
            .insert(nuevo_cliente) \
            .execute()
        
        if not result_cliente.data:
            supabase.table('usuario').delete().eq('id', usuario_id).execute()
            return jsonify({'error': 'Error al crear el cliente'}), 500
        
        cliente_id = result_cliente.data[0]['id']
        
        # Crear el vehículo
        nuevo_vehiculo = {
            'id_cliente': cliente_id,
            'placa': placa.upper(),
            'marca': marca if marca else None,
            'modelo': modelo if modelo else None,
            'anio': anio if anio else None,
            'kilometraje': 0
        }
        
        result_vehiculo = supabase.table('vehiculo') \
            .insert(nuevo_vehiculo) \
            .execute()
        
        if not result_vehiculo.data:
            supabase.table('cliente').delete().eq('id', cliente_id).execute()
            supabase.table('usuario').delete().eq('id', usuario_id).execute()
            return jsonify({'error': 'Error al crear el vehículo'}), 500
        
        vehiculo_id = result_vehiculo.data[0]['id']
        
        # Crear notificación
        try:
            supabase.table('notificacion').insert({
                'id_usuario_destino': usuario_id,
                'tipo': 'cliente_registrado',
                'mensaje': f'¡Bienvenido {nombre}! Tu cuenta ha sido creada. Tu contraseña temporal es: {password_temporal}. Por favor cámbiala al iniciar sesión.',
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        except Exception as e:
            logger.warning(f"No se pudo crear notificación: {e}")
        
        logger.info(f"Nuevo cliente registrado: {nombre} ({email})")
        
        return jsonify({
            'success': True,
            'cliente': {
                'id_usuario': usuario_id,
                'id_cliente': cliente_id,
                'nombre': nombre,
                'email': email,
                'contacto': contacto,
                'vehiculo_id': vehiculo_id,
                'placa': placa.upper(),
                'password_temporal': password_temporal
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error registrando nuevo cliente: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - RESERVAS
# =====================================================

@reservas_solicitudes_bp.route('/reservas', methods=['GET'])
@jefe_taller_required
def obtener_reservas(current_user):
    """Obtener todas las reservas confirmadas para el calendario"""
    try:
        estado = request.args.get('estado')
        
        query = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .not_.is_('fecha_agendada', 'null') \
            .order('fecha_agendada', desc=False)
        
        if estado and estado != 'todos':
            query = query.eq('estado', estado)
        
        result = query.execute()
        reservas = result.data or []
        
        for reserva in reservas:
            if reserva.get('id_cliente'):
                usuario = obtener_nombre_usuario(reserva['id_cliente'])
                if usuario:
                    reserva['cliente_nombre'] = usuario.get('nombre')
                    reserva['cliente_contacto'] = usuario.get('contacto')
            
            if reserva.get('id_vehiculo'):
                vehiculo = supabase.table('vehiculo') \
                    .select('placa, marca, modelo') \
                    .eq('id', reserva['id_vehiculo']) \
                    .execute()
                if vehiculo.data:
                    reserva['placa'] = vehiculo.data[0].get('placa')
                    reserva['marca'] = vehiculo.data[0].get('marca')
                    reserva['modelo'] = vehiculo.data[0].get('modelo')
        
        return jsonify({'success': True, 'reservas': reservas}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo reservas: {str(e)}")
        return jsonify({'error': str(e), 'reservas': []}), 500


@reservas_solicitudes_bp.route('/reservas/<int:id_reserva>', methods=['GET'])
@jefe_taller_required
def obtener_reserva(current_user, id_reserva):
    """Obtener detalle de una reserva específica"""
    try:
        result = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .eq('id', id_reserva) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Reserva no encontrada'}), 404
        
        reserva = result.data[0]
        
        if reserva.get('id_cliente'):
            usuario = obtener_nombre_usuario(reserva['id_cliente'])
            if usuario:
                reserva['cliente_nombre'] = usuario.get('nombre')
                reserva['cliente_contacto'] = usuario.get('contacto')
        
        if reserva.get('id_vehiculo'):
            vehiculo = supabase.table('vehiculo') \
                .select('placa, marca, modelo, anio') \
                .eq('id', reserva['id_vehiculo']) \
                .execute()
            if vehiculo.data:
                reserva['placa'] = vehiculo.data[0].get('placa')
                reserva['marca'] = vehiculo.data[0].get('marca')
                reserva['modelo'] = vehiculo.data[0].get('modelo')
                reserva['anio'] = vehiculo.data[0].get('anio')
        
        return jsonify({'success': True, 'reserva': reserva}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo reserva: {str(e)}")
        return jsonify({'error': str(e)}), 500


@reservas_solicitudes_bp.route('/reservas', methods=['POST'])
@jefe_taller_required
def crear_reserva_manual(current_user):
    """Crear una reserva manual desde el jefe de taller con validación de horario"""
    try:
        data = request.get_json()
        
        cliente_id = data.get('cliente_id')
        vehiculo_id = data.get('vehiculo_id')
        fecha_agendada = data.get('fecha_agendada')
        descripcion_problema = data.get('descripcion_problema')
        notas = data.get('notas')
        
        if not all([cliente_id, vehiculo_id, fecha_agendada, descripcion_problema]):
            return jsonify({'error': 'Faltan campos requeridos'}), 400
        
        # Validar disponibilidad de horario
        disponible, mensaje = validar_disponibilidad_horario(fecha_agendada)
        if not disponible:
            return jsonify({'error': mensaje}), 409
        
        fecha_parts = fecha_agendada.split(' ')
        fecha_deseada = fecha_parts[0]
        hora_deseada = fecha_parts[1][:5] if len(fecha_parts) > 1 else '10:00'
        
        nueva_reserva = {
            'id_cliente': cliente_id,
            'id_vehiculo': vehiculo_id,
            'fecha_solicitud': datetime.datetime.now().isoformat(),
            'fecha_deseada': fecha_deseada,
            'hora_deseada': hora_deseada,
            'fecha_agendada': fecha_agendada,
            'descripcion_problema': descripcion_problema,
            'mensaje_adicional': notas,
            'estado': 'confirmada',
            'es_manual': True
        }
        
        result = supabase.table('solicitud_reserva_cliente') \
            .insert(nueva_reserva) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al crear la reserva'}), 500
        
        supabase.table('notificacion').insert({
            'id_usuario_destino': cliente_id,
            'tipo': 'reserva_manual_creada',
            'mensaje': f'Se ha creado una reserva para el {fecha_agendada}. Por favor confirma tu asistencia.',
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False
        }).execute()
        
        return jsonify({'success': True, 'reserva': result.data[0]}), 201
        
    except Exception as e:
        logger.error(f"Error creando reserva manual: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS - EDITAR Y ELIMINAR RESERVAS
# =====================================================

@reservas_solicitudes_bp.route('/reservas/<int:id_reserva>', methods=['PUT'])
@jefe_taller_required
def actualizar_reserva(current_user, id_reserva):
    """Actualizar una reserva existente"""
    try:
        data = request.get_json()
        
        fecha_agendada = data.get('fecha_agendada')
        descripcion_problema = data.get('descripcion_problema')
        mensaje_adicional = data.get('mensaje_adicional')
        
        # Verificar que la reserva existe
        existing = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .eq('id', id_reserva) \
            .execute()
        
        if not existing.data:
            return jsonify({'error': 'Reserva no encontrada'}), 404
        
        reserva = existing.data[0]
        
        # Verificar que no esté completada
        if reserva.get('estado') == 'completada':
            return jsonify({'error': 'No se pueden editar reservas completadas'}), 400
        
        # Validar disponibilidad de horario (excluyendo esta reserva)
        if fecha_agendada:
            disponible, mensaje = validar_disponibilidad_horario(fecha_agendada, excluir_id=id_reserva)
            if not disponible:
                return jsonify({'error': mensaje}), 409
            
            # Extraer fecha y hora para actualizar campos
            fecha_parts = fecha_agendada.split(' ')
            fecha_deseada = fecha_parts[0]
            hora_deseada = fecha_parts[1][:5] if len(fecha_parts) > 1 else '10:00'
        else:
            fecha_deseada = reserva.get('fecha_deseada')
            hora_deseada = reserva.get('hora_deseada')
        
        # Preparar datos de actualización
        update_data = {
            'fecha_deseada': fecha_deseada,
            'hora_deseada': hora_deseada,
            'descripcion_problema': descripcion_problema or reserva.get('descripcion_problema'),
            'mensaje_adicional': mensaje_adicional
        }
        
        if fecha_agendada:
            update_data['fecha_agendada'] = fecha_agendada
        
        result = supabase.table('solicitud_reserva_cliente') \
            .update(update_data) \
            .eq('id', id_reserva) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar la reserva'}), 500
        
        # Notificar al cliente sobre el cambio
        if fecha_agendada:
            supabase.table('notificacion').insert({
                'id_usuario_destino': reserva.get('id_cliente'),
                'tipo': 'reserva_actualizada',
                'mensaje': f'Tu reserva ha sido reprogramada para el {fecha_agendada}. Por favor confirma tu asistencia.',
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        return jsonify({'success': True, 'reserva': result.data[0]}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando reserva: {str(e)}")
        return jsonify({'error': str(e)}), 500


@reservas_solicitudes_bp.route('/reservas/<int:id_reserva>', methods=['DELETE'])
@jefe_taller_required
def eliminar_reserva(current_user, id_reserva):
    """Eliminar una reserva existente"""
    try:
        # Verificar que la reserva existe
        existing = supabase.table('solicitud_reserva_cliente') \
            .select('id_cliente, estado, fecha_agendada') \
            .eq('id', id_reserva) \
            .execute()
        
        if not existing.data:
            return jsonify({'error': 'Reserva no encontrada'}), 404
        
        reserva = existing.data[0]
        
        # Verificar que no esté completada
        if reserva.get('estado') == 'completada':
            return jsonify({'error': 'No se pueden eliminar reservas completadas'}), 400
        
        # Guardar datos para notificación antes de eliminar
        cliente_id = reserva.get('id_cliente')
        fecha_agendada = reserva.get('fecha_agendada')
        
        # Eliminar la reserva
        result = supabase.table('solicitud_reserva_cliente') \
            .delete() \
            .eq('id', id_reserva) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al eliminar la reserva'}), 500
        
        # Notificar al cliente
        if cliente_id and fecha_agendada:
            supabase.table('notificacion').insert({
                'id_usuario_destino': cliente_id,
                'tipo': 'reserva_eliminada',
                'mensaje': f'Tu reserva para el {fecha_agendada[:16]} ha sido cancelada por el taller. Contáctanos para reprogramar.',
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        return jsonify({'success': True, 'message': 'Reserva eliminada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error eliminando reserva: {str(e)}")
        return jsonify({'error': str(e)}), 500