# =====================================================
# HISTORIAL DE TRABAJOS - TÉCNICO MECÁNICO
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, send_from_directory
from config import config
from decorators import tecnico_required  # ← Usar decorador unificado
import datetime
import logging

logger = logging.getLogger(__name__)

# Crear blueprint con prefijo para evitar conflictos
historial_bp = Blueprint('historial_tecnico', __name__, url_prefix='/tecnico')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


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
        tecnico_id = current_user.get('id')
        logger.info(f"🔍 Obteniendo historial para técnico ID: {tecnico_id}")
        
        if not tecnico_id:
            return jsonify({'error': 'ID de técnico no encontrado'}), 400
        
        # Obtener todas las asignaciones del técnico (tanto activas como finalizadas)
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, fecha_hora_inicio, fecha_hora_final') \
            .eq('id_tecnico', tecnico_id) \
            .execute()
        
        if not asignaciones.data:
            return jsonify({'success': True, 'trabajos': []}), 200
        
        orden_ids = list(set([a['id_orden_trabajo'] for a in asignaciones.data]))
        
        # Obtener órdenes de trabajo
        ordenes = supabase.table('ordentrabajo') \
            .select('''
                id, 
                codigo_unico, 
                fecha_ingreso, 
                fecha_salida, 
                estado_global, 
                id_vehiculo
            ''') \
            .in_('id', orden_ids) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'trabajos': []}), 200
        
        # Obtener vehículos
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes.data if o.get('id_vehiculo')]))
        vehiculos_map = {}
        
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
            
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # Obtener clientes
        clientes_ids = list(set([v.get('id_cliente') for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        
        if clientes_ids:
            clientes = supabase.table('cliente') \
                .select('id, id_usuario') \
                .in_('id', clientes_ids) \
                .execute()
            
            for c in (clientes.data or []):
                clientes_map[c['id']] = c
        
        # Obtener usuarios (clientes)
        usuarios_ids = list(set([c.get('id_usuario') for c in clientes_map.values() if c.get('id_usuario')]))
        usuarios_map = {}
        
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto, ubicacion') \
                .in_('id', usuarios_ids) \
                .execute()
            
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # Construir respuesta
        trabajos = []
        for orden in ordenes.data:
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            
            # Obtener información del cliente
            cliente_nombre = 'No registrado'
            cliente_telefono = 'No registrado'
            cliente_ubicacion = 'No registrado'
            
            id_cliente = vehiculo.get('id_cliente')
            if id_cliente and id_cliente in clientes_map:
                cliente = clientes_map[id_cliente]
                id_usuario = cliente.get('id_usuario')
                if id_usuario and id_usuario in usuarios_map:
                    usuario = usuarios_map[id_usuario]
                    cliente_nombre = usuario.get('nombre') or 'No registrado'
                    cliente_telefono = usuario.get('contacto') or 'No registrado'
                    cliente_ubicacion = usuario.get('ubicacion') or 'No registrado'
            
            # Obtener diagnóstico más reciente del técnico para esta orden
            diagnostico = supabase.table('diagnostico_tecnico') \
                .select('id, transcripcion_informe, url_grabacion_informe, estado, fecha_envio') \
                .eq('id_orden_trabajo', orden['id']) \
                .eq('id_tecnico', tecnico_id) \
                .order('version', desc=True) \
                .limit(1) \
                .execute()
            
            diagnostico_data = diagnostico.data[0] if diagnostico.data else None
            
            # Obtener servicios del diagnóstico
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
                'codigo_unico': orden.get('codigo_unico', 'N/A'),
                'fecha_ingreso': orden.get('fecha_ingreso'),
                'fecha_salida': orden.get('fecha_salida'),
                'estado_global': orden.get('estado_global', 'Desconocido'),
                'placa': vehiculo.get('placa', 'N/A'),
                'marca': vehiculo.get('marca', 'N/A'),
                'modelo': vehiculo.get('modelo', 'N/A'),
                'anio': vehiculo.get('anio'),
                'kilometraje': vehiculo.get('kilometraje', 0),
                'cliente_nombre': cliente_nombre,
                'cliente_telefono': cliente_telefono,
                'cliente_ubicacion': cliente_ubicacion,
                'servicios': servicios,
                'diagnostico_estado': diagnostico_data.get('estado') if diagnostico_data else None
            })
        
        return jsonify({'success': True, 'trabajos': trabajos}), 200
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo historial: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# API: OBTENER DETALLE DE UN TRABAJO
# =====================================================
@historial_bp.route('/api/historial/<int:id_orden>', methods=['GET'])
@tecnico_required
def obtener_detalle_trabajo(current_user, id_orden):
    try:
        tecnico_id = current_user.get('id')
        
        # Verificar que el técnico haya trabajado en esta orden
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'success': False, 'error': 'No tienes acceso a este trabajo'}), 403
        
        # Obtener orden de trabajo
        orden_result = supabase.table('ordentrabajo') \
            .select('''
                id, 
                codigo_unico, 
                fecha_ingreso, 
                fecha_salida, 
                estado_global, 
                id_vehiculo
            ''') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'success': False, 'error': 'Trabajo no encontrado'}), 404
        
        orden_data = orden_result.data[0]
        
        # Obtener vehículo
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', orden_data['id_vehiculo']) \
            .execute()
        
        vehiculo_data = vehiculo_result.data[0] if vehiculo_result.data else {}
        
        # Obtener información del cliente
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        cliente_ubicacion = 'No registrado'
        
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
                        cliente_nombre = usuario.get('nombre') or 'No registrado'
                        cliente_telefono = usuario.get('contacto') or 'No registrado'
                        cliente_ubicacion = usuario.get('ubicacion') or 'No registrado'
        
        # OBTENER DATOS DE LA RECEPCIÓN
        recepcion_result = supabase.table('recepcion') \
            .select('''
                url_lateral_izquierda, 
                url_lateral_derecha, 
                url_foto_frontal, 
                url_foto_trasera, 
                url_foto_superior, 
                url_foto_inferior, 
                url_foto_tablero, 
                url_grabacion_problema, 
                transcripcion_problema
            ''') \
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
            if url and url != 'null' and url != 'None' and url.strip():
                recepcion_fotos.append({
                    'url_foto': url,
                    'descripcion': label,
                    'tipo': 'recepcion'
                })
        
        # Obtener audio de la recepción
        recepcion_audio = None
        recepcion_transcripcion = None
        
        if recepcion_data.get('url_grabacion_problema'):
            recepcion_audio = recepcion_data.get('url_grabacion_problema')
            recepcion_transcripcion = recepcion_data.get('transcripcion_problema')
        
        # Obtener diagnóstico
        diagnostico_result = supabase.table('diagnostico_tecnico') \
            .select('''
                id, 
                transcripcion_informe, 
                url_grabacion_informe, 
                estado, 
                fecha_envio
            ''') \
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
        
        # Obtener observaciones del jefe de taller
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
            'codigo_unico': orden_data.get('codigo_unico', 'N/A'),
            'fecha_ingreso': orden_data.get('fecha_ingreso'),
            'fecha_salida': orden_data.get('fecha_salida'),
            'estado_global': orden_data.get('estado_global', 'Desconocido'),
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
        logger.error(f"❌ Error obteniendo detalle: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500