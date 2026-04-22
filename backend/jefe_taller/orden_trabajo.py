# =====================================================
# ÓRDENES DE TRABAJO - JEFE TALLER (COMPLETO)
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import jwt
import datetime
import logging
import uuid
import os
import base64
import tempfile
import io
import cloudinary
import cloudinary.uploader
import cloudinary.api

logger = logging.getLogger(__name__)

jefe_taller_ordenes_bp = Blueprint('jefe_taller_ordenes', __name__, url_prefix='/api/jefe-taller')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


@jefe_taller_ordenes_bp.route('/tecnicos', methods=['GET'])
@jefe_taller_required
def listar_tecnicos(current_user):
    try:
        usuarios_result = supabase.table('usuario') \
            .select('id, nombre, contacto') \
            .execute()
        
        tecnicos = []
        MAX_ORDENES = 2
        
        for usuario in (usuarios_result.data or []):
            tiene_rol = supabase.rpc('usuario_tiene_rol', {
                'p_usuario_id': usuario['id'],
                'p_rol_nombre': 'tecnico'
            }).execute()
            
            if tiene_rol.data:
                asignaciones = supabase.table('asignaciontecnico') \
                    .select('id_orden_trabajo') \
                    .eq('id_tecnico', usuario['id']) \
                    .eq('tipo_asignacion', 'diagnostico') \
                    .is_('fecha_hora_final', 'null') \
                    .execute()
                
                ordenes_activas = len(asignaciones.data) if asignaciones.data else 0
                
                tecnicos.append({
                    'id': usuario['id'],
                    'nombre': usuario['nombre'],
                    'contacto': usuario.get('contacto', ''),
                    'ordenes_activas': ordenes_activas,
                    'max_vehiculos': MAX_ORDENES,
                    'disponible': ordenes_activas < MAX_ORDENES,
                    'cupo_restante': MAX_ORDENES - ordenes_activas
                })
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error listando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/ordenes-activas', methods=['GET'])
@jefe_taller_required
def listar_ordenes_activas(current_user):
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('''
                id, 
                codigo_unico, 
                fecha_ingreso, 
                estado_global, 
                id_vehiculo,
                id_jefe_operativo,
                id_jefe_operativo_2
            ''') \
            .in_('estado_global', ['EnRecepcion', 'EnProceso', 'EnPausa']) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        if not resultado.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes = resultado.data
        ordenes_ids = [o['id'] for o in ordenes]
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes]))
        
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        clientes_ids = list(set([v.get('id_cliente') for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        usuarios_ids = []
        
        if clientes_ids:
            clientes = supabase.table('cliente') \
                .select('id, id_usuario') \
                .in_('id', clientes_ids) \
                .execute()
            for c in (clientes.data or []):
                clientes_map[c['id']] = c
                if c.get('id_usuario'):
                    usuarios_ids.append(c['id_usuario'])
        
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        tecnicos_por_orden = {}
        if ordenes_ids:
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, id_tecnico') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .eq('tipo_asignacion', 'diagnostico') \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones.data or [])]))
            tecnicos_nombres_map = {}
            
            if tecnicos_ids:
                tecnicos = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                for t in (tecnicos.data or []):
                    tecnicos_nombres_map[t['id']] = t
            
            for a in (asignaciones.data or []):
                if a['id_orden_trabajo'] not in tecnicos_por_orden:
                    tecnicos_por_orden[a['id_orden_trabajo']] = []
                if a['id_tecnico'] in tecnicos_nombres_map:
                    tecnicos_por_orden[a['id_orden_trabajo']].append({
                        'id': a['id_tecnico'],
                        'nombre': tecnicos_nombres_map[a['id_tecnico']]['nombre']
                    })
        
        planificaciones_map = {}
        if ordenes_ids:
            planificaciones = supabase.table('planificacion') \
                .select('id_orden_trabajo, bahia_asignada, fecha_hora_inicio_estimado, horas_estimadas, fecha_hora_inicio_real') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            for p in (planificaciones.data or []):
                planificaciones_map[p['id_orden_trabajo']] = p
        
        ordenes_resultado = []
        for orden in ordenes:
            v = vehiculos_map.get(orden['id_vehiculo'], {})
            usuario_cliente = usuarios_map.get(clientes_map.get(v.get('id_cliente'), {}).get('id_usuario'), {})
            planificacion_data = planificaciones_map.get(orden['id'], {})
            
            ordenes_resultado.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'placa': v.get('placa', ''),
                'marca': v.get('marca', ''),
                'modelo': v.get('modelo', ''),
                'cliente_nombre': usuario_cliente.get('nombre', 'No registrado'),
                'tecnicos': tecnicos_por_orden.get(orden['id'], []),
                'bahia_asignada': planificacion_data.get('bahia_asignada'),
                'fecha_hora_inicio_estimado': planificacion_data.get('fecha_hora_inicio_estimado'),
                'horas_estimadas': planificacion_data.get('horas_estimadas'),
                'trabajo_iniciado': planificacion_data.get('fecha_hora_inicio_real') is not None
            })
        
        return jsonify({'success': True, 'ordenes': ordenes_resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando órdenes activas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/ordenes-finalizadas', methods=['GET'])
@jefe_taller_required
def listar_ordenes_finalizadas(current_user):
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                fecha_ingreso,
                fecha_salida,
                estado_global,
                vehiculo!inner (
                    placa,
                    marca,
                    modelo,
                    cliente!inner (
                        usuario!inner (
                            nombre
                        )
                    )
                )
            ''') \
            .in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_ingreso', desc=True) \
            .limit(50) \
            .execute()
        
        ordenes = []
        for orden in (resultado.data or []):
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {}) if vehiculo else {}
            usuario = cliente.get('usuario', {}) if cliente else {}
            
            ordenes.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_entrega': orden.get('fecha_salida'),
                'estado_global': orden['estado_global'],
                'placa': vehiculo.get('placa', ''),
                'marca': vehiculo.get('marca', ''),
                'modelo': vehiculo.get('modelo', ''),
                'cliente_nombre': usuario.get('nombre', '')
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error listando órdenes finalizadas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/asignar-tecnicos', methods=['POST'])
@jefe_taller_required
def asignar_tecnicos(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        tecnicos_ids = data.get('tecnicos', [])
        tipo_asignacion = data.get('tipo_asignacion', 'diagnostico')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if len(tecnicos_ids) > 2:
            return jsonify({'error': 'Máximo 2 técnicos por orden'}), 400
        
        MAX_ORDENES_POR_TECNICO = 2
        tecnicos_con_error = []
        
        for tecnico_id in tecnicos_ids:
            asignaciones_activas = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo') \
                .eq('id_tecnico', tecnico_id) \
                .eq('tipo_asignacion', tipo_asignacion) \
                .is_('fecha_hora_final', 'null') \
                .neq('id_orden_trabajo', id_orden) \
                .execute()
            
            ordenes_activas = len(asignaciones_activas.data) if asignaciones_activas.data else 0
            
            if ordenes_activas >= MAX_ORDENES_POR_TECNICO:
                tecnico_info = supabase.table('usuario') \
                    .select('nombre') \
                    .eq('id', tecnico_id) \
                    .single() \
                    .execute()
                
                nombre_tecnico = tecnico_info.data.get('nombre', f"ID {tecnico_id}") if tecnico_info.data else f"ID {tecnico_id}"
                tecnicos_con_error.append(f"{nombre_tecnico} ya tiene {ordenes_activas}/{MAX_ORDENES_POR_TECNICO} órdenes activas")
        
        if tecnicos_con_error:
            return jsonify({'error': 'No se pueden asignar los técnicos seleccionados', 'detalles': tecnicos_con_error}), 400
        
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': datetime.datetime.now().isoformat()}) \
            .eq('id_orden_trabajo', id_orden) \
            .eq('tipo_asignacion', tipo_asignacion) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for tecnico_id in tecnicos_ids:
            supabase.table('asignaciontecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'tipo_asignacion': tipo_asignacion,
                'fecha_hora_inicio': datetime.datetime.now().isoformat()
            }).execute()
        
        return jsonify({'success': True, 'message': f'Técnicos asignados correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/diagnostico-inicial', methods=['POST'])
@jefe_taller_required
def guardar_diagnostico_inicial(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        diagnostico = data.get('diagnostico', '')
        audio_url = data.get('audio_url')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        diagnostico_existente = supabase.table('diagnostigoinicial') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if diagnostico_existente.data:
            update_data = {'diagnostigo': diagnostico, 'fecha_hora': datetime.datetime.now().isoformat()}
            if audio_url:
                update_data['url_grabacion'] = audio_url
            supabase.table('diagnostigoinicial').update(update_data).eq('id_orden_trabajo', id_orden).execute()
        else:
            insert_data = {
                'id_orden_trabajo': id_orden,
                'id_jefe_taller': current_user['id'],
                'diagnostigo': diagnostico,
                'fecha_hora': datetime.datetime.now().isoformat()
            }
            if audio_url:
                insert_data['url_grabacion'] = audio_url
            supabase.table('diagnostigoinicial').insert(insert_data).execute()
        
        return jsonify({'success': True, 'message': 'Diagnóstico guardado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/planificar', methods=['POST'])
@jefe_taller_required
def planificar_trabajo(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        bahia = data.get('bahia')
        fecha_inicio = data.get('fecha_inicio')
        horas_estimadas = data.get('horas_estimadas')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        if not bahia:
            return jsonify({'error': 'Bahía requerida'}), 400
        if not fecha_inicio:
            return jsonify({'error': 'Fecha de inicio requerida'}), 400
        if not horas_estimadas or horas_estimadas <= 0:
            return jsonify({'error': 'Horas estimadas válidas requeridas'}), 400
        
        fecha_inicio_dt = datetime.datetime.fromisoformat(fecha_inicio)
        fecha_fin_dt = fecha_inicio_dt + datetime.timedelta(hours=float(horas_estimadas))
        
        planificacion_existente = supabase.table('planificacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if planificacion_existente.data:
            supabase.table('planificacion') \
                .update({
                    'bahia_asignada': bahia,
                    'horas_estimadas': horas_estimadas,
                    'fecha_hora_inicio_estimado': fecha_inicio_dt.isoformat(),
                    'fecha_hora_fin_estimado': fecha_fin_dt.isoformat()
                }) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
        else:
            supabase.table('planificacion').insert({
                'id_orden_trabajo': id_orden,
                'bahia_asignada': bahia,
                'horas_estimadas': horas_estimadas,
                'fecha_hora_inicio_estimado': fecha_inicio_dt.isoformat(),
                'fecha_hora_fin_estimado': fecha_fin_dt.isoformat()
            }).execute()
        
        return jsonify({'success': True, 'message': 'Planificación guardada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando planificación: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def detalle_orden(current_user, id_orden):
    try:
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        o = orden.data
        
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', o['id_vehiculo']) \
            .execute()
        v = vehiculo.data[0] if vehiculo.data else {}
        
        cliente_info = {}
        usuario_cliente = {}
        
        if v.get('id_cliente'):
            cliente = supabase.table('cliente') \
                .select('id, id_usuario') \
                .eq('id', v['id_cliente']) \
                .execute()
            if cliente.data:
                cliente_info = cliente.data[0]
                if cliente_info.get('id_usuario'):
                    usuario = supabase.table('usuario') \
                        .select('nombre, contacto') \
                        .eq('id', cliente_info['id_usuario']) \
                        .execute()
                    if usuario.data:
                        usuario_cliente = usuario.data[0]
        
        recepcion = supabase.table('recepcion') \
            .select('transcripcion_problema') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        tecnicos = []
        for asig in (asignaciones.data or []):
            tecnico = supabase.table('usuario') \
                .select('id, nombre') \
                .eq('id', asig['id_tecnico']) \
                .execute()
            if tecnico.data:
                tecnicos.append(tecnico.data[0])
        
        diagnostico = supabase.table('diagnostigoinicial') \
            .select('diagnostigo, url_grabacion') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        diagnostico_data = diagnostico.data[0] if diagnostico.data else None
        
        planificacion = supabase.table('planificacion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        planificacion_data = planificacion.data[0] if planificacion.data else {}
        
        detalle = {
            'id': o['id'],
            'codigo_unico': o['codigo_unico'],
            'fecha_ingreso': o['fecha_ingreso'],
            'fecha_salida': o.get('fecha_salida'),
            'estado_global': o['estado_global'],
            'placa': v.get('placa', ''),
            'marca': v.get('marca', ''),
            'modelo': v.get('modelo', ''),
            'anio': v.get('anio'),
            'kilometraje': v.get('kilometraje'),
            'cliente': {
                'nombre': usuario_cliente.get('nombre', 'No registrado'),
                'telefono': usuario_cliente.get('contacto', 'No registrado')
            },
            'tecnicos': tecnicos,
            'diagnostico_inicial': diagnostico_data['diagnostigo'] if diagnostico_data else None,
            'diagnostico_audio_url': diagnostico_data.get('url_grabacion') if diagnostico_data else None,
            'planificacion': planificacion_data,
            'transcripcion_problema': recepcion_data.get('transcripcion_problema', '')
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de orden: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/diagnostico-pendiente/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def diagnostico_pendiente(current_user, id_orden):
    try:
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, estado, version, id_tecnico, usuario!inner(nombre)') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('estado', 'pendiente') \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico.data:
            return jsonify({
                'enviado': True,
                'estado': 'pendiente',
                'version': diagnostico.data[0]['version'],
                'tecnico_nombre': diagnostico.data[0].get('usuario', {}).get('nombre', 'Desconocido')
            }), 200
        else:
            return jsonify({'enviado': False}), 200
            
    except Exception as e:
        logger.error(f"Error verificando diagnóstico pendiente: {str(e)}")
        return jsonify({'enviado': False}), 200


@jefe_taller_ordenes_bp.route('/bahias/estado', methods=['GET'])
@jefe_taller_required
def get_estado_bahias(current_user):
    try:
        ahora = datetime.datetime.now()
        
        planificaciones_ocupadas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_real, ordentrabajo!inner(codigo_unico, estado_global)') \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        planificaciones_reservadas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_estimado, horas_estimadas, ordentrabajo!inner(codigo_unico, estado_global)') \
            .is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        bahias_ocupadas = {}
        for p in (planificaciones_ocupadas.data or []):
            bahia = p.get('bahia_asignada')
            if bahia:
                orden = p.get('ordentrabajo', {})
                bahias_ocupadas[bahia] = {
                    'estado': 'ocupado',
                    'codigo': orden.get('codigo_unico'),
                    'estado_orden': orden.get('estado_global'),
                    'inicio_real': p.get('fecha_hora_inicio_real')
                }
        
        bahias_reservadas = {}
        for p in (planificaciones_reservadas.data or []):
            bahia = p.get('bahia_asignada')
            if bahia and bahia not in bahias_ocupadas:
                orden = p.get('ordentrabajo', {})
                fecha_estimada = p.get('fecha_hora_inicio_estimado')
                
                es_futura = False
                if fecha_estimada:
                    fecha_estimada_dt = datetime.datetime.fromisoformat(fecha_estimada.replace('Z', '+00:00'))
                    es_futura = fecha_estimada_dt > ahora
                
                if es_futura:
                    bahias_reservadas[bahia] = {
                        'estado': 'reservado',
                        'codigo': orden.get('codigo_unico'),
                        'estado_orden': orden.get('estado_global'),
                        'fecha_inicio_estimado': fecha_estimada,
                        'horas_estimadas': p.get('horas_estimadas')
                    }
        
        bahias = []
        for i in range(1, 13):
            if i in bahias_ocupadas:
                info = bahias_ocupadas[i]
                bahias.append({
                    'numero': i,
                    'estado': info['estado'],
                    'orden_codigo': info['codigo'],
                    'orden_estado': info['estado_orden'],
                    'inicio_real': info.get('inicio_real')
                })
            elif i in bahias_reservadas:
                info = bahias_reservadas[i]
                bahias.append({
                    'numero': i,
                    'estado': info['estado'],
                    'orden_codigo': info['codigo'],
                    'orden_estado': info['estado_orden'],
                    'fecha_inicio_estimado': info.get('fecha_inicio_estimado'),
                    'horas_estimadas': info.get('horas_estimadas')
                })
            else:
                bahias.append({
                    'numero': i,
                    'estado': 'libre',
                    'orden_codigo': None,
                    'orden_estado': None
                })
        
        return jsonify({'success': True, 'bahias': bahias}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estado de bahías: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/verificar-bahia', methods=['POST'])
@jefe_taller_required
def verificar_bahia(current_user):
    try:
        data = request.get_json()
        bahia = data.get('bahia')
        fecha_inicio = data.get('fecha_inicio')
        horas_estimadas = data.get('horas_estimadas', 1)
        id_orden_actual = data.get('id_orden_actual')
        
        if not bahia or not fecha_inicio:
            return jsonify({'error': 'Bahía y fecha de inicio requeridas'}), 400
        
        fecha_inicio_dt = datetime.datetime.fromisoformat(fecha_inicio)
        fecha_fin_dt = fecha_inicio_dt + datetime.timedelta(hours=float(horas_estimadas))
        
        resultado = supabase.rpc(
            'bahia_disponible_en_horario',
            {
                'p_bahia': bahia,
                'p_fecha_inicio': fecha_inicio_dt.isoformat(),
                'p_fecha_fin': fecha_fin_dt.isoformat(),
                'p_excluir_orden': id_orden_actual
            }
        ).execute()
        
        disponible = resultado.data if resultado.data else False
        
        return jsonify({'success': True, 'disponible': disponible}), 200
        
    except Exception as e:
        logger.error(f"Error verificando bahía: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/transcribir-audio', methods=['POST'])
@jefe_taller_required
def transcribir_audio_jefe_taller(current_user):
    try:
        data = request.get_json()
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        WHISPER_AVAILABLE = False
        try:
            import whisper
            WHISPER_AVAILABLE = True
        except ImportError:
            pass
        
        if not WHISPER_AVAILABLE:
            return jsonify({'error': 'Whisper no está disponible'}), 500
        
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        
        model = whisper.load_model("base")
        temp_path = None
        try:
            temp_dir = tempfile.gettempdir()
            temp_path = os.path.join(temp_dir, f"whisper_audio_{uuid.uuid4().hex}.wav")
            with open(temp_path, 'wb') as f:
                f.write(audio_bytes)
            
            resultado = model.transcribe(temp_path, language="es", task="transcribe", verbose=False, fp16=False)
            texto = resultado["text"].strip()
            
            return jsonify({'success': True, 'transcripcion': texto}), 200
            
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
        
    except Exception as e:
        logger.error(f"Error en transcripción: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/subir-audio-diagnostico', methods=['POST'])
@jefe_taller_required
def subir_audio_diagnostico(current_user):
    try:
        data = request.get_json()
        audio_base64 = data.get('audio')
        id_orden = data.get('id_orden')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        audio_file = io.BytesIO(audio_bytes)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        audio_file.name = f"diagnostico_{id_orden}_{timestamp}.wav"
        
        resultado = cloudinary.uploader.upload(
            audio_file,
            folder=f"furia_motor/diagnosticos/{id_orden}",
            public_id=f"diagnostico_{id_orden}_{timestamp}",
            resource_type="video"
        )
        
        url = resultado.get('secure_url')
        
        return jsonify({'success': True, 'url': url}), 200
        
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500