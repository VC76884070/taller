# =====================================================
# HISTORIAL DE TRABAJOS - TÉCNICO MECÁNICO
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, send_from_directory
from functools import wraps
from config import config
import jwt
import datetime
import logging

logger = logging.getLogger(__name__)

historial_bp = Blueprint('historial', __name__)

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL TÉCNICO
# =====================================================
def tecnico_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                pass
        
        if not token:
            token = request.cookies.get('token')
        
        if not token:
            return jsonify({'error': 'No autorizado'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            
            if current_user.get('id_rol') != 4:
                return jsonify({'error': 'No autorizado - Se requiere rol de Técnico'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Sesión expirada'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# RUTA PARA SERVIR EL HTML
# =====================================================
@historial_bp.route('/historial')
@tecnico_required
def historial_page(current_user):
    """Servir la página de Historial"""
    return send_from_directory('../tecnico_mecanico', 'historial.html')


# =====================================================
# API: OBTENER HISTORIAL DEL TÉCNICO
# =====================================================
@historial_bp.route('/api/historial', methods=['GET'])
@tecnico_required
def obtener_historial(current_user):
    try:
        tecnico_id = current_user['id']
        logger.info(f"Obteniendo historial para técnico ID: {tecnico_id}")
        
        # Obtener todas las asignaciones del técnico
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, fecha_hora_inicio, fecha_hora_final') \
            .eq('id_tecnico', tecnico_id) \
            .execute()
        
        if not asignaciones.data:
            return jsonify({'success': True, 'trabajos': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in asignaciones.data]
        
        # Obtener órdenes de trabajo
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo') \
            .in_('id', orden_ids) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'trabajos': []}), 200
        
        # Obtener vehículos
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes.data]))
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .in_('id', vehiculos_ids) \
            .execute()
        
        vehiculos_map = {v['id']: v for v in (vehiculos.data or [])}
        
        # Obtener clientes
        clientes_ids = list(set([v.get('id_cliente') for v in vehiculos_map.values() if v.get('id_cliente')]))
        
        clientes_map = {}
        if clientes_ids:
            clientes = supabase.table('cliente') \
                .select('id, id_usuario') \
                .in_('id', clientes_ids) \
                .execute()
            
            for cliente in (clientes.data or []):
                clientes_map[cliente['id']] = cliente
        
        # Obtener usuarios (clientes)
        usuarios_ids = list(set([c.get('id_usuario') for c in clientes_map.values() if c.get('id_usuario')]))
        
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto, ubicacion') \
                .in_('id', usuarios_ids) \
                .execute()
            
            for usuario in (usuarios.data or []):
                usuarios_map[usuario['id']] = usuario
        
        # Construir respuesta
        trabajos = []
        for orden in ordenes.data:
            vehiculo = vehiculos_map.get(orden['id_vehiculo'], {})
            
            # Obtener información del cliente
            cliente_nombre = 'N/A'
            cliente_telefono = 'N/A'
            cliente_ubicacion = 'N/A'
            
            id_cliente = vehiculo.get('id_cliente')
            if id_cliente and id_cliente in clientes_map:
                cliente = clientes_map[id_cliente]
                id_usuario = cliente.get('id_usuario')
                if id_usuario and id_usuario in usuarios_map:
                    usuario = usuarios_map[id_usuario]
                    cliente_nombre = usuario.get('nombre') or 'N/A'
                    cliente_telefono = usuario.get('contacto') or 'N/A'
                    cliente_ubicacion = usuario.get('ubicacion') or 'N/A'
            
            # Obtener diagnóstico
            diagnostico = supabase.table('diagnostico_tecnico') \
                .select('id, transcripcion_informe, url_grabacion_informe, estado') \
                .eq('id_orden_trabajo', orden['id']) \
                .eq('id_tecnico', tecnico_id) \
                .order('version', desc=True) \
                .limit(1) \
                .execute()
            
            diagnostico_data = diagnostico.data[0] if diagnostico.data else None
            
            # Obtener servicios
            servicios = []
            if diagnostico_data:
                servicios_result = supabase.table('servicio_tecnico') \
                    .select('descripcion') \
                    .eq('id_diagnostico_tecnico', diagnostico_data['id']) \
                    .order('orden') \
                    .execute()
                servicios = [s['descripcion'] for s in (servicios_result.data or [])]
            
            trabajos.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_salida': orden.get('fecha_salida'),
                'estado_global': orden['estado_global'],
                'placa': vehiculo.get('placa', 'N/A'),
                'marca': vehiculo.get('marca', 'N/A'),
                'modelo': vehiculo.get('modelo', 'N/A'),
                'anio': vehiculo.get('anio'),
                'kilometraje': vehiculo.get('kilometraje', 0),
                'cliente_nombre': cliente_nombre,
                'cliente_telefono': cliente_telefono,
                'cliente_ubicacion': cliente_ubicacion,
                'servicios': servicios,
                'diagnostico_estado': diagnostico_data['estado'] if diagnostico_data else None
            })
        
        return jsonify({'success': True, 'trabajos': trabajos}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo historial: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER DETALLE DE UN TRABAJO
# =====================================================
@historial_bp.route('/api/historial/<int:id_orden>', methods=['GET'])
@tecnico_required
def obtener_detalle_trabajo(current_user, id_orden):
    try:
        tecnico_id = current_user['id']
        
        # Verificar que el técnico haya trabajado en esta orden
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a este trabajo'}), 403
        
        # Obtener orden de trabajo
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Trabajo no encontrado'}), 404
        
        orden_data = orden_result.data[0]
        
        # Obtener vehículo
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', orden_data['id_vehiculo']) \
            .execute()
        
        vehiculo_data = vehiculo_result.data[0] if vehiculo_result.data else {}
        
        # Obtener información del cliente
        cliente_nombre = 'N/A'
        cliente_telefono = 'N/A'
        cliente_ubicacion = 'N/A'
        
        id_cliente = vehiculo_data.get('id_cliente')
        if id_cliente:
            cliente_result = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', id_cliente) \
                .execute()
            
            if cliente_result.data:
                cliente = cliente_result.data[0]
                id_usuario = cliente.get('id_usuario')
                if id_usuario:
                    usuario_result = supabase.table('usuario') \
                        .select('nombre, contacto, ubicacion') \
                        .eq('id', id_usuario) \
                        .execute()
                    
                    if usuario_result.data:
                        usuario = usuario_result.data[0]
                        cliente_nombre = usuario.get('nombre') or 'N/A'
                        cliente_telefono = usuario.get('contacto') or 'N/A'
                        cliente_ubicacion = usuario.get('ubicacion') or 'N/A'
        
        # OBTENER DATOS DE LA RECEPCIÓN
        recepcion_result = supabase.table('recepcion') \
            .select('url_lateral_izquierda, url_lateral_derecha, url_foto_frontal, url_foto_trasera, url_foto_superior, url_foto_inferior, url_foto_tablero, url_grabacion_problema, transcripcion_problema') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion_result.data[0] if recepcion_result.data else {}
        
        # Obtener fotos de la recepción
        recepcion_fotos = []
        campos_fotos = [
            ('url_lateral_izquierda', 'Lateral Izquierdo'),
            ('url_lateral_derecha', 'Lateral Derecho'),
            ('url_foto_frontal', 'Frontal'),
            ('url_foto_trasera', 'Trasera'),
            ('url_foto_superior', 'Superior'),
            ('url_foto_inferior', 'Inferior'),
            ('url_foto_tablero', 'Tablero')
        ]
        for campo, label in campos_fotos:
            url = recepcion_data.get(campo)
            if url and url != 'null' and url != 'None':
                recepcion_fotos.append({
                    'url_foto': url,
                    'descripcion': label,
                    'tipo': 'recepcion'
                })
        
        # Obtener audio de la recepción (problema del cliente)
        recepcion_audio = None
        recepcion_transcripcion = None
        
        if recepcion_data.get('url_grabacion_problema'):
            recepcion_audio = recepcion_data.get('url_grabacion_problema')
            recepcion_transcripcion = recepcion_data.get('transcripcion_problema')
        
        # Obtener diagnóstico
        diagnostico_result = supabase.table('diagnostico_tecnico') \
            .select('id, transcripcion_informe, url_grabacion_informe, estado, fecha_envio') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        diagnostico_data = diagnostico_result.data[0] if diagnostico_result.data else None
        
        # Obtener servicios
        servicios = []
        if diagnostico_data:
            servicios_result = supabase.table('servicio_tecnico') \
                .select('descripcion, orden') \
                .eq('id_diagnostico_tecnico', diagnostico_data['id']) \
                .order('orden') \
                .execute()
            servicios = [s['descripcion'] for s in (servicios_result.data or [])]
        
        # Obtener fotos del diagnóstico
        fotos_diagnostico = []
        if diagnostico_data:
            fotos_result = supabase.table('foto_diagnostico') \
                .select('id, url_foto, descripcion_tecnico') \
                .eq('id_diagnostico_tecnico', diagnostico_data['id']) \
                .execute()
            for foto in (fotos_result.data or []):
                fotos_diagnostico.append({
                    'url_foto': foto['url_foto'],
                    'descripcion': foto.get('descripcion_tecnico', 'Diagnóstico'),
                    'tipo': 'diagnostico'
                })
        
        # Combinar fotos
        todas_fotos = recepcion_fotos + fotos_diagnostico
        
        # Obtener observaciones
        observaciones = []
        if diagnostico_data:
            obs_result = supabase.table('observaciondiagnostico') \
                .select('id, observacion, transcripcion_obs, fecha_hora') \
                .eq('id_diagnostico_tecnico', diagnostico_data['id']) \
                .order('fecha_hora', desc=True) \
                .execute()
            observaciones = obs_result.data if obs_result.data else []
        
        detalle = {
            'id': orden_data['id'],
            'codigo_unico': orden_data['codigo_unico'],
            'fecha_ingreso': orden_data['fecha_ingreso'],
            'fecha_salida': orden_data.get('fecha_salida'),
            'estado_global': orden_data['estado_global'],
            'placa': vehiculo_data.get('placa', 'N/A'),
            'marca': vehiculo_data.get('marca', 'N/A'),
            'modelo': vehiculo_data.get('modelo', 'N/A'),
            'anio': vehiculo_data.get('anio'),
            'kilometraje': vehiculo_data.get('kilometraje', 0),
            'cliente_nombre': cliente_nombre,
            'cliente_telefono': cliente_telefono,
            'cliente_ubicacion': cliente_ubicacion,
            'servicios': servicios,
            'diagnostico': diagnostico_data,
            'fotos': todas_fotos,
            'observaciones': observaciones,
            'recepcion_audio': recepcion_audio,
            'recepcion_transcripcion': recepcion_transcripcion
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500