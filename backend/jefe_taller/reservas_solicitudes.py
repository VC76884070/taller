# =====================================================
# RESERVAS_SOLICITUDES.PY - JEFE TALLER
# GESTIÓN DE RESERVAS Y SOLICITUDES DE CLIENTES
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
import uuid
from werkzeug.security import generate_password_hash

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
reservas_solicitudes_bp = Blueprint('reservas_solicitudes', __name__, url_prefix='/api/jefe-taller')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# DECORADOR DE AUTENTICACIÓN PARA JEFE TALLER
# =====================================================

def jefe_taller_required(f):
    """Decorador para verificar que el usuario es jefe taller"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'Token no proporcionado'}), 401
        
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            
            if 'user' in payload:
                user_data = payload['user']
            else:
                user_data = payload
            
            user_id = user_data.get('id')
            if not user_id:
                return jsonify({'error': 'Token inválido'}), 401
            
            # Obtener usuario
            user_result = supabase.table('usuario') \
                .select('id, nombre, email, contacto') \
                .eq('id', user_id) \
                .execute()
            
            if not user_result.data:
                return jsonify({'error': 'Usuario no encontrado'}), 401
            
            usuario = user_result.data[0]
            
            # Obtener roles
            roles_result = supabase.table('usuario_rol') \
                .select('id_rol, rol!inner(nombre_rol)') \
                .eq('id_usuario', user_id) \
                .execute()
            
            roles = []
            for ur in (roles_result.data or []):
                if 'rol' in ur and 'nombre_rol' in ur['rol']:
                    roles.append(ur['rol']['nombre_rol'])
            
            if 'jefe_taller' not in roles and 'admin_general' not in roles:
                return jsonify({'error': 'Acceso no autorizado'}), 403
            
            current_user = {
                'id': user_id,
                'nombre': usuario.get('nombre', ''),
                'email': usuario.get('email', ''),
                'roles': roles
            }
            
            return f(current_user, *args, **kwargs)
            
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 401
    
    return decorated_function


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def verificar_disponibilidad_horario(fecha_agendada, reserva_id=None):
    """Verifica si el horario está disponible"""
    try:
        # Verificar que la fecha no sea en el pasado
        ahora = datetime.datetime.now()
        if fecha_agendada < ahora:
            return False, "No se pueden agendar reservas en fechas pasadas"
        
        # Verificar horario de atención (8:00 - 20:00)
        hora = fecha_agendada.hour
        if hora < 8 or hora >= 20:
            return False, "El horario de atención es de 8:00 a 20:00"
        
        # Verificar si ya hay una reserva en ese horario
        inicio_dia = fecha_agendada.replace(hour=0, minute=0, second=0, microsecond=0)
        fin_dia = fecha_agendada.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        query = supabase.table('solicitud_reserva_cliente') \
            .select('id') \
            .gte('fecha_agendada', inicio_dia.isoformat()) \
            .lte('fecha_agendada', fin_dia.isoformat()) \
            .eq('estado', 'confirmada')
        
        # Si es una edición, excluir la reserva actual
        if reserva_id:
            query = query.neq('id', reserva_id)
        
        result = query.execute()
        
        if result.data:
            # Verificar si hay conflicto de horario (misma hora)
            for reserva in result.data:
                # Obtener la fecha de la reserva existente
                reserva_result = supabase.table('solicitud_reserva_cliente') \
                    .select('fecha_agendada') \
                    .eq('id', reserva['id']) \
                    .execute()
                
                if reserva_result.data:
                    fecha_existente = datetime.datetime.fromisoformat(
                        reserva_result.data[0]['fecha_agendada'].replace('Z', '+00:00')
                    )
                    # Si es la misma hora, hay conflicto
                    if fecha_existente.hour == fecha_agendada.hour and \
                       fecha_existente.minute == fecha_agendada.minute:
                        return False, "Ya existe una reserva confirmada en ese horario"
        
        return True, "Horario disponible"
        
    except Exception as e:
        logger.error(f"Error verificando disponibilidad: {str(e)}")
        return False, "Error verificando disponibilidad"


# =====================================================
# ENDPOINT 1: LISTAR CLIENTES
# =====================================================

@reservas_solicitudes_bp.route('/clientes', methods=['GET'])
@jefe_taller_required
def listar_clientes(current_user):
    """Lista todos los clientes para el select"""
    try:
        # Obtener usuarios con rol de cliente (rol_id = 5)
        resultado = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .execute()
        
        # Filtrar clientes (los que tienen rol 5)
        clientes = []
        for usuario in (resultado.data or []):
            # Verificar si tiene rol de cliente
            roles_result = supabase.table('usuario_rol') \
                .select('id_rol') \
                .eq('id_usuario', usuario['id']) \
                .eq('id_rol', 5) \
                .execute()
            
            if roles_result.data:
                clientes.append({
                    'id': usuario['id'],
                    'nombre': usuario.get('nombre', ''),
                    'contacto': usuario.get('contacto', ''),
                    'email': usuario.get('email', '')
                })
        
        return jsonify({'success': True, 'clientes': clientes}), 200
        
    except Exception as e:
        logger.error(f"Error listando clientes: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 2: REGISTRAR NUEVO CLIENTE
# =====================================================

@reservas_solicitudes_bp.route('/clientes/nuevo', methods=['POST'])
@jefe_taller_required
def registrar_nuevo_cliente(current_user):
    """Registra un nuevo cliente con su vehículo"""
    try:
        data = request.get_json()
        
        nombre = data.get('nombre', '').strip()
        email = data.get('email', '').strip()
        contacto = data.get('contacto', '').strip()
        ubicacion = data.get('ubicacion')
        placa = data.get('placa', '').strip().upper()
        marca = data.get('marca', '').strip()
        modelo = data.get('modelo', '').strip()
        anio = data.get('anio')
        
        if not nombre or not email or not contacto or not placa:
            return jsonify({'error': 'Nombre, email, contacto y placa son requeridos'}), 400
        
        # Verificar si el email ya existe
        email_existente = supabase.table('usuario') \
            .select('id') \
            .eq('email', email) \
            .execute()
        
        if email_existente.data:
            return jsonify({'error': 'El email ya está registrado'}), 400
        
        # Verificar si el contacto ya existe
        contacto_existente = supabase.table('usuario') \
            .select('id') \
            .eq('contacto', contacto) \
            .execute()
        
        if contacto_existente.data:
            return jsonify({'error': 'El número de contacto ya está registrado'}), 400
        
        # Verificar si la placa ya existe
        placa_existente = supabase.table('vehiculo') \
            .select('id') \
            .eq('placa', placa) \
            .execute()
        
        if placa_existente.data:
            return jsonify({'error': f'La placa {placa} ya está registrada'}), 400
        
        # Generar contraseña temporal
        password_temporal = str(uuid.uuid4())[:8]
        contrasenia_hash = generate_password_hash(password_temporal)
        
        # 1. Crear usuario
        user_result = supabase.table('usuario').insert({
            'nombre': nombre,
            'email': email,
            'contacto': contacto,
            'ubicacion': ubicacion,
            'contrasenia': contrasenia_hash,
            'fecha_registro': datetime.datetime.now().isoformat()
        }).execute()
        
        if not user_result.data:
            return jsonify({'error': 'Error creando usuario'}), 500
        
        id_usuario = user_result.data[0]['id']
        
        # 2. Asignar rol de cliente (id_rol = 5)
        supabase.table('usuario_rol').insert({
            'id_usuario': id_usuario,
            'id_rol': 5,
            'fecha_asignacion': datetime.datetime.now().isoformat()
        }).execute()
        
        # 3. Crear cliente
        cliente_result = supabase.table('cliente').insert({
            'id_usuario': id_usuario,
            'tipo_documento': 'CI',
            'numero_documento': f"TEMP-{int(datetime.datetime.now().timestamp())}",
            'email': email
        }).execute()
        
        if not cliente_result.data:
            return jsonify({'error': 'Error creando cliente'}), 500
        
        id_cliente = cliente_result.data[0]['id']
        
        # 4. Crear vehículo
        vehiculo_result = supabase.table('vehiculo').insert({
            'id_cliente': id_cliente,
            'placa': placa,
            'marca': marca,
            'modelo': modelo,
            'anio': anio
        }).execute()
        
        if not vehiculo_result.data:
            return jsonify({'error': 'Error creando vehículo'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Cliente registrado exitosamente',
            'cliente': {
                'id_usuario': id_usuario,
                'nombre': nombre,
                'email': email,
                'contacto': contacto,
                'password_temporal': password_temporal
            },
            'vehiculo': {
                'id': vehiculo_result.data[0]['id'],
                'placa': placa
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error registrando cliente: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 3: LISTAR VEHÍCULOS DE UN CLIENTE
# =====================================================

@reservas_solicitudes_bp.route('/vehiculos-cliente/<int:cliente_id>', methods=['GET'])
@jefe_taller_required
def listar_vehiculos_cliente(current_user, cliente_id):
    """Lista los vehículos de un cliente"""
    try:
        # Obtener cliente para verificar que existe
        cliente_result = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', cliente_id) \
            .execute()
        
        if not cliente_result.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        id_cliente = cliente_result.data[0]['id']
        
        # Obtener vehículos
        vehiculos_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje') \
            .eq('id_cliente', id_cliente) \
            .execute()
        
        return jsonify({
            'success': True,
            'vehiculos': vehiculos_result.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error listando vehículos: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 4: LISTAR SOLICITUDES DE CLIENTES
# =====================================================

@reservas_solicitudes_bp.route('/solicitudes-clientes', methods=['GET'])
@jefe_taller_required
def listar_solicitudes_clientes(current_user):
    """Lista todas las solicitudes de clientes"""
    try:
        estado = request.args.get('estado')
        
        query = supabase.table('solicitud_reserva_cliente') \
            .select('''
                id,
                id_cliente,
                id_vehiculo,
                fecha_solicitud,
                fecha_deseada,
                hora_deseada,
                fecha_agendada,
                descripcion_problema,
                mensaje_adicional,
                estado,
                created_at,
                cliente!inner(
                    id_usuario,
                    usuario!inner(
                        id,
                        nombre,
                        contacto,
                        email
                    )
                ),
                vehiculo!inner(
                    placa,
                    marca,
                    modelo,
                    anio
                )
            ''') \
            .order('fecha_solicitud', desc=True)
        
        if estado and estado != 'todos':
            query = query.eq('estado', estado)
        
        resultado = query.execute()
        
        solicitudes = []
        for s in (resultado.data or []):
            cliente_data = s.get('cliente', {})
            usuario_data = cliente_data.get('usuario', {})
            vehiculo_data = s.get('vehiculo', {})
            
            solicitudes.append({
                'id': s.get('id'),
                'id_cliente': s.get('id_cliente'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_deseada': s.get('fecha_deseada'),
                'hora_deseada': s.get('hora_deseada'),
                'fecha_agendada': s.get('fecha_agendada'),
                'descripcion_problema': s.get('descripcion_problema', ''),
                'mensaje_adicional': s.get('mensaje_adicional', ''),
                'estado': s.get('estado', 'pendiente'),
                'cliente_nombre': usuario_data.get('nombre', 'N/A'),
                'cliente_contacto': usuario_data.get('contacto', 'N/A'),
                'cliente_email': usuario_data.get('email', 'N/A'),
                'placa': vehiculo_data.get('placa', 'N/A'),
                'marca': vehiculo_data.get('marca', ''),
                'modelo': vehiculo_data.get('modelo', ''),
                'anio': vehiculo_data.get('anio'),
                'id_vehiculo': s.get('id_vehiculo')
            })
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error listando solicitudes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 5: ACTUALIZAR ESTADO DE SOLICITUD
# =====================================================

@reservas_solicitudes_bp.route('/solicitudes-clientes/<int:id_solicitud>/estado', methods=['PATCH'])
@jefe_taller_required
def actualizar_estado_solicitud(current_user, id_solicitud):
    """Actualiza el estado de una solicitud"""
    try:
        data = request.get_json()
        estado = data.get('estado')
        fecha_agendada = data.get('fecha_agendada')
        
        if not estado:
            return jsonify({'error': 'Estado requerido'}), 400
        
        # Verificar que la solicitud existe
        solicitud_result = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .eq('id', id_solicitud) \
            .execute()
        
        if not solicitud_result.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        solicitud = solicitud_result.data[0]
        estado_actual = solicitud.get('estado', 'pendiente')
        
        # Validar transiciones de estado
        if estado_actual == 'completada' and estado != 'completada':
            return jsonify({'error': 'Una solicitud completada no puede cambiar de estado'}), 400
        
        if estado_actual == 'cancelada' and estado != 'cancelada':
            return jsonify({'error': 'Una solicitud cancelada no puede cambiar de estado'}), 400
        
        # Si se confirma, verificar disponibilidad
        if estado == 'confirmada':
            if not fecha_agendada:
                # Usar fecha deseada + hora deseada
                fecha_deseada = solicitud.get('fecha_deseada')
                hora_deseada = solicitud.get('hora_deseada', '09:00')
                
                if not fecha_deseada:
                    return jsonify({'error': 'La solicitud no tiene fecha deseada'}), 400
                
                fecha_agendada = f"{fecha_deseada}T{hora_deseada}:00"
            
            # Verificar que la fecha sea válida
            try:
                fecha_obj = datetime.datetime.fromisoformat(fecha_agendada.replace('Z', '+00:00'))
                fecha_agendada_iso = fecha_obj.isoformat()
            except ValueError:
                return jsonify({'error': 'Formato de fecha inválido'}), 400
            
            # Verificar disponibilidad
            disponible, mensaje = verificar_disponibilidad_horario(fecha_obj, id_solicitud)
            if not disponible:
                return jsonify({'error': mensaje}), 409
        
        # Actualizar
        update_data = {'estado': estado}
        if fecha_agendada:
            update_data['fecha_agendada'] = fecha_agendada
        
        supabase.table('solicitud_reserva_cliente') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        logger.info(f"Solicitud {id_solicitud} actualizada a estado {estado}")
        
        return jsonify({
            'success': True,
            'message': f'Solicitud actualizada a {estado}'
        }), 200
        
    except Exception as e:
        logger.error(f"Error actualizando solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 6: OBTENER DETALLE DE SOLICITUD
# =====================================================

@reservas_solicitudes_bp.route('/solicitudes-clientes/<int:id_solicitud>', methods=['GET'])
@jefe_taller_required
def obtener_solicitud(current_user, id_solicitud):
    """Obtiene el detalle de una solicitud específica"""
    try:
        resultado = supabase.table('solicitud_reserva_cliente') \
            .select('''
                id,
                id_cliente,
                id_vehiculo,
                fecha_solicitud,
                fecha_deseada,
                hora_deseada,
                fecha_agendada,
                descripcion_problema,
                mensaje_adicional,
                estado,
                cliente!inner(
                    id_usuario,
                    usuario!inner(
                        id,
                        nombre,
                        contacto,
                        email
                    )
                ),
                vehiculo!inner(
                    id,
                    placa,
                    marca,
                    modelo,
                    anio
                )
            ''') \
            .eq('id', id_solicitud) \
            .single() \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        s = resultado.data
        cliente_data = s.get('cliente', {})
        usuario_data = cliente_data.get('usuario', {})
        vehiculo_data = s.get('vehiculo', {})
        
        solicitud = {
            'id': s.get('id'),
            'id_cliente': s.get('id_cliente'),
            'fecha_solicitud': s.get('fecha_solicitud'),
            'fecha_deseada': s.get('fecha_deseada'),
            'hora_deseada': s.get('hora_deseada'),
            'fecha_agendada': s.get('fecha_agendada'),
            'descripcion_problema': s.get('descripcion_problema', ''),
            'mensaje_adicional': s.get('mensaje_adicional', ''),
            'estado': s.get('estado', 'pendiente'),
            'cliente_nombre': usuario_data.get('nombre', 'N/A'),
            'cliente_contacto': usuario_data.get('contacto', 'N/A'),
            'cliente_email': usuario_data.get('email', 'N/A'),
            'placa': vehiculo_data.get('placa', 'N/A'),
            'marca': vehiculo_data.get('marca', ''),
            'modelo': vehiculo_data.get('modelo', ''),
            'anio': vehiculo_data.get('anio'),
            'id_vehiculo': s.get('id_vehiculo')
        }
        
        return jsonify({'success': True, 'solicitud': solicitud}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 7: LISTAR RESERVAS (PARA CALENDARIO)
# =====================================================

@reservas_solicitudes_bp.route('/reservas', methods=['GET'])
@jefe_taller_required
def listar_reservas(current_user):
    """Lista todas las reservas confirmadas para el calendario"""
    try:
        estado = request.args.get('estado')
        
        query = supabase.table('solicitud_reserva_cliente') \
            .select('''
                id,
                fecha_agendada,
                descripcion_problema,
                mensaje_adicional,
                estado,
                cliente!inner(
                    id_usuario,
                    usuario!inner(
                        id,
                        nombre,
                        contacto
                    )
                ),
                vehiculo!inner(
                    id,
                    placa,
                    marca,
                    modelo,
                    anio
                )
            ''') \
            .not_.is_('fecha_agendada', 'null') \
            .order('fecha_agendada')
        
        if estado and estado != 'todos':
            query = query.eq('estado', estado)
        
        resultado = query.execute()
        
        reservas = []
        for r in (resultado.data or []):
            cliente_data = r.get('cliente', {})
            usuario_data = cliente_data.get('usuario', {})
            vehiculo_data = r.get('vehiculo', {})
            
            reservas.append({
                'id': r.get('id'),
                'fecha_agendada': r.get('fecha_agendada'),
                'descripcion_problema': r.get('descripcion_problema', ''),
                'estado': r.get('estado', 'pendiente'),
                'cliente_nombre': usuario_data.get('nombre', 'N/A'),
                'cliente_contacto': usuario_data.get('contacto', 'N/A'),
                'placa': vehiculo_data.get('placa', 'N/A'),
                'marca': vehiculo_data.get('marca', ''),
                'modelo': vehiculo_data.get('modelo', ''),
                'anio': vehiculo_data.get('anio')
            })
        
        return jsonify({'success': True, 'reservas': reservas}), 200
        
    except Exception as e:
        logger.error(f"Error listando reservas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 8: OBTENER DETALLE DE RESERVA
# =====================================================

@reservas_solicitudes_bp.route('/reservas/<int:id_reserva>', methods=['GET'])
@jefe_taller_required
def obtener_reserva(current_user, id_reserva):
    """Obtiene el detalle de una reserva específica"""
    try:
        resultado = supabase.table('solicitud_reserva_cliente') \
            .select('''
                id,
                id_cliente,
                id_vehiculo,
                fecha_agendada,
                descripcion_problema,
                mensaje_adicional,
                estado,
                cliente!inner(
                    id_usuario,
                    usuario!inner(
                        id,
                        nombre,
                        contacto,
                        email
                    )
                ),
                vehiculo!inner(
                    id,
                    placa,
                    marca,
                    modelo,
                    anio
                )
            ''') \
            .eq('id', id_reserva) \
            .single() \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Reserva no encontrada'}), 404
        
        r = resultado.data
        cliente_data = r.get('cliente', {})
        usuario_data = cliente_data.get('usuario', {})
        vehiculo_data = r.get('vehiculo', {})
        
        reserva = {
            'id': r.get('id'),
            'id_cliente': r.get('id_cliente'),
            'fecha_agendada': r.get('fecha_agendada'),
            'descripcion_problema': r.get('descripcion_problema', ''),
            'mensaje_adicional': r.get('mensaje_adicional', ''),
            'estado': r.get('estado', 'pendiente'),
            'cliente_nombre': usuario_data.get('nombre', 'N/A'),
            'cliente_contacto': usuario_data.get('contacto', 'N/A'),
            'cliente_email': usuario_data.get('email', 'N/A'),
            'placa': vehiculo_data.get('placa', 'N/A'),
            'marca': vehiculo_data.get('marca', ''),
            'modelo': vehiculo_data.get('modelo', ''),
            'anio': vehiculo_data.get('anio'),
            'id_vehiculo': r.get('id_vehiculo')
        }
        
        return jsonify({'success': True, 'reserva': reserva}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo reserva: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 9: CREAR RESERVA MANUAL
# =====================================================

@reservas_solicitudes_bp.route('/reservas', methods=['POST'])
@jefe_taller_required
def crear_reserva(current_user):
    """Crea una reserva manual desde el panel"""
    try:
        data = request.get_json()
        
        cliente_id = data.get('cliente_id')
        vehiculo_id = data.get('vehiculo_id')
        fecha_agendada = data.get('fecha_agendada')
        descripcion_problema = data.get('descripcion_problema')
        notas = data.get('notas')
        es_manual = data.get('es_manual', True)
        
        if not cliente_id or not vehiculo_id or not fecha_agendada or not descripcion_problema:
            return jsonify({'error': 'Cliente, vehículo, fecha y descripción son requeridos'}), 400
        
        # Verificar que el cliente existe
        cliente_result = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', cliente_id) \
            .execute()
        
        if not cliente_result.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404
        
        id_cliente = cliente_result.data[0]['id']
        
        # Verificar que el vehículo existe y pertenece al cliente
        vehiculo_result = supabase.table('vehiculo') \
            .select('id') \
            .eq('id', vehiculo_id) \
            .eq('id_cliente', id_cliente) \
            .execute()
        
        if not vehiculo_result.data:
            return jsonify({'error': 'Vehículo no encontrado o no pertenece al cliente'}), 404
        
        # Verificar disponibilidad
        try:
            fecha_obj = datetime.datetime.fromisoformat(fecha_agendada.replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Formato de fecha inválido'}), 400
        
        disponible, mensaje = verificar_disponibilidad_horario(fecha_obj)
        if not disponible:
            return jsonify({'error': mensaje}), 409
        
        # Crear la reserva
        reserva_data = {
            'id_cliente': cliente_id,
            'id_vehiculo': vehiculo_id,
            'fecha_deseada': fecha_obj.date().isoformat(),
            'hora_deseada': fecha_obj.strftime('%H:%M'),
            'fecha_agendada': fecha_agendada,
            'descripcion_problema': descripcion_problema,
            'mensaje_adicional': notas,
            'estado': 'confirmada',
            'es_manual': es_manual,
            'fecha_solicitud': datetime.datetime.now().isoformat()
        }
        
        result = supabase.table('solicitud_reserva_cliente') \
            .insert(reserva_data) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error creando reserva'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Reserva creada exitosamente',
            'reserva': result.data[0]
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando reserva: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 10: ACTUALIZAR RESERVA
# =====================================================

@reservas_solicitudes_bp.route('/reservas/<int:id_reserva>', methods=['PUT'])
@jefe_taller_required
def actualizar_reserva(current_user, id_reserva):
    """Actualiza una reserva existente"""
    try:
        data = request.get_json()
        
        fecha_agendada = data.get('fecha_agendada')
        descripcion_problema = data.get('descripcion_problema')
        mensaje_adicional = data.get('mensaje_adicional')
        
        # Verificar que la reserva existe
        reserva_result = supabase.table('solicitud_reserva_cliente') \
            .select('*') \
            .eq('id', id_reserva) \
            .execute()
        
        if not reserva_result.data:
            return jsonify({'error': 'Reserva no encontrada'}), 404
        
        reserva = reserva_result.data[0]
        
        if reserva.get('estado') == 'completada':
            return jsonify({'error': 'No se puede editar una reserva completada'}), 400
        
        update_data = {}
        
        if fecha_agendada:
            try:
                fecha_obj = datetime.datetime.fromisoformat(fecha_agendada.replace('Z', '+00:00'))
                disponible, mensaje = verificar_disponibilidad_horario(fecha_obj, id_reserva)
                if not disponible:
                    return jsonify({'error': mensaje}), 409
                update_data['fecha_agendada'] = fecha_agendada
                update_data['fecha_deseada'] = fecha_obj.date().isoformat()
                update_data['hora_deseada'] = fecha_obj.strftime('%H:%M')
            except ValueError:
                return jsonify({'error': 'Formato de fecha inválido'}), 400
        
        if descripcion_problema:
            update_data['descripcion_problema'] = descripcion_problema
        
        if mensaje_adicional is not None:
            update_data['mensaje_adicional'] = mensaje_adicional
        
        if not update_data:
            return jsonify({'error': 'No hay datos para actualizar'}), 400
        
        supabase.table('solicitud_reserva_cliente') \
            .update(update_data) \
            .eq('id', id_reserva) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Reserva actualizada exitosamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error actualizando reserva: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 11: ELIMINAR RESERVA
# =====================================================

@reservas_solicitudes_bp.route('/reservas/<int:id_reserva>', methods=['DELETE'])
@jefe_taller_required
def eliminar_reserva(current_user, id_reserva):
    """Elimina una reserva"""
    try:
        # Verificar que la reserva existe
        reserva_result = supabase.table('solicitud_reserva_cliente') \
            .select('estado') \
            .eq('id', id_reserva) \
            .execute()
        
        if not reserva_result.data:
            return jsonify({'error': 'Reserva no encontrada'}), 404
        
        if reserva_result.data[0].get('estado') == 'completada':
            return jsonify({'error': 'No se puede eliminar una reserva completada'}), 400
        
        supabase.table('solicitud_reserva_cliente') \
            .delete() \
            .eq('id', id_reserva) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Reserva eliminada exitosamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error eliminando reserva: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 12: NOTIFICACIONES
# =====================================================

@reservas_solicitudes_bp.route('/notificaciones', methods=['GET'])
@jefe_taller_required
def obtener_notificaciones(current_user):
    """Obtiene las notificaciones del jefe taller"""
    try:
        # Obtener solicitudes pendientes
        pendientes_result = supabase.table('solicitud_reserva_cliente') \
            .select('id, fecha_solicitud, cliente!inner(usuario!inner(nombre))') \
            .eq('estado', 'pendiente') \
            .execute()
        
        notificaciones = []
        for s in (pendientes_result.data or []):
            cliente_data = s.get('cliente', {})
            usuario_data = cliente_data.get('usuario', {})
            
            notificaciones.append({
                'id': s['id'],
                'tipo': 'solicitud_pendiente',
                'mensaje': f"Nueva solicitud de {usuario_data.get('nombre', 'Cliente')}",
                'leida': False,
                'fecha': s.get('fecha_solicitud')
            })
        
        return jsonify({
            'success': True,
            'notificaciones': notificaciones
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo notificaciones: {str(e)}")
        return jsonify({'error': str(e)}), 500