# =====================================================
# ÓRDENES DE TRABAJO - JEFE TALLER (CORREGIDO)
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

# Configurar logging
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_taller_ordenes_bp = Blueprint('jefe_taller_ordenes', __name__, url_prefix='/api/jefe-taller')

# Configuración desde config.py
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# ENDPOINTS
# =====================================================

@jefe_taller_ordenes_bp.route('/tecnicos', methods=['GET'])
@jefe_taller_required
def listar_tecnicos(current_user):
    """Listar técnicos disponibles para asignación con su carga actual"""
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
        
        logger.info(f"Técnicos encontrados: {len(tecnicos)}")
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error listando técnicos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/ordenes-activas', methods=['GET'])
@jefe_taller_required
def listar_ordenes_activas(current_user):
    """Listar órdenes de trabajo activas con datos de planificación (OPTIMIZADO)"""
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
        jefes_ids = list(set([o['id_jefe_operativo'] for o in ordenes if o.get('id_jefe_operativo')] + 
                             [o['id_jefe_operativo_2'] for o in ordenes if o.get('id_jefe_operativo_2')]))
        
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
                .select('id, id_usuario, numero_documento, tipo_documento') \
                .in_('id', clientes_ids) \
                .execute()
            for c in (clientes.data or []):
                clientes_map[c['id']] = c
                if c.get('id_usuario'):
                    usuarios_ids.append(c['id_usuario'])
        
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto, ubicacion, email') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        jefes_map = {}
        if jefes_ids:
            jefes = supabase.table('usuario') \
                .select('id, nombre, contacto') \
                .in_('id', jefes_ids) \
                .execute()
            for j in (jefes.data or []):
                jefes_map[j['id']] = j
        
        recepciones_map = {}
        if ordenes_ids:
            recepciones = supabase.table('recepcion') \
                .select('id_orden_trabajo, url_lateral_izquierda, url_lateral_derecha, url_foto_frontal, url_foto_trasera, url_foto_superior, url_foto_inferior, url_foto_tablero, url_grabacion_problema, transcripcion_problema') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            for r in (recepciones.data or []):
                recepciones_map[r['id_orden_trabajo']] = r
        
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
        
        diagnosticos_map = {}
        if ordenes_ids:
            diagnosticos = supabase.table('diagnostigoinicial') \
                .select('id_orden_trabajo, diagnostigo') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            for d in (diagnosticos.data or []):
                diagnosticos_map[d['id_orden_trabajo']] = d.get('diagnostigo')
        
        planificaciones_map = {}
        if ordenes_ids:
            planificaciones = supabase.table('planificacion') \
                .select('id_orden_trabajo, bahia_asignada, fecha_hora_inicio_estimado, horas_estimadas') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            for p in (planificaciones.data or []):
                planificaciones_map[p['id_orden_trabajo']] = p
        
        ordenes_resultado = []
        for orden in ordenes:
            v = vehiculos_map.get(orden['id_vehiculo'], {})
            
            cliente_info = clientes_map.get(v.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
            
            jefe_principal = jefes_map.get(orden.get('id_jefe_operativo'), {})
            jefe_secundario = jefes_map.get(orden.get('id_jefe_operativo_2'), {})
            
            recepcion_data = recepciones_map.get(orden['id'], {})
            tecnicos = tecnicos_por_orden.get(orden['id'], [])
            diagnostico_texto = diagnosticos_map.get(orden['id'])
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
                'cliente_telefono': usuario_cliente.get('contacto', 'No registrado'),
                'cliente_ubicacion': usuario_cliente.get('ubicacion', 'No registrada'),
                'jefe_operativo_nombre': jefe_principal.get('nombre', ''),
                'jefe_operativo_2_nombre': jefe_secundario.get('nombre', ''),
                'tecnicos': tecnicos,
                'diagnostico_inicial': diagnostico_texto,
                'planificacion': bool(planificacion_data),
                'bahia_asignada': planificacion_data.get('bahia_asignada'),
                'fecha_hora_inicio_estimado': planificacion_data.get('fecha_hora_inicio_estimado'),
                'horas_estimadas': planificacion_data.get('horas_estimadas'),
                'transcripcion_problema': recepcion_data.get('transcripcion_problema', ''),
                'audio_url': recepcion_data.get('url_grabacion_problema'),
                'fotos': {
                    'url_lateral_izquierda': recepcion_data.get('url_lateral_izquierda'),
                    'url_lateral_derecha': recepcion_data.get('url_lateral_derecha'),
                    'url_foto_frontal': recepcion_data.get('url_foto_frontal'),
                    'url_foto_trasera': recepcion_data.get('url_foto_trasera'),
                    'url_foto_superior': recepcion_data.get('url_foto_superior'),
                    'url_foto_inferior': recepcion_data.get('url_foto_inferior'),
                    'url_foto_tablero': recepcion_data.get('url_foto_tablero')
                }
            })
        
        return jsonify({'success': True, 'ordenes': ordenes_resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando órdenes activas: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/ordenes-finalizadas', methods=['GET'])
@jefe_taller_required
def listar_ordenes_finalizadas(current_user):
    """Listar órdenes finalizadas o entregadas (OPTIMIZADO)"""
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
                            nombre,
                            contacto
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
    """Asignar técnicos a una orden de trabajo para diagnóstico"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        tecnicos_ids = data.get('tecnicos', [])
        tipo_asignacion = data.get('tipo_asignacion', 'diagnostico')  # ✅ NUEVO: permite especificar tipo
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if len(tecnicos_ids) > 2:
            return jsonify({'error': 'Máximo 2 técnicos por orden'}), 400
        
        # Validar carga de técnicos
        MAX_ORDENES_POR_TECNICO = 2
        tecnicos_con_error = []
        
        for tecnico_id in tecnicos_ids:
            # ✅ AHORA FILTRA POR tipo_asignacion
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
                tecnicos_con_error.append(f"{nombre_tecnico} ya tiene {ordenes_activas}/{MAX_ORDENES_POR_TECNICO} órdenes activas de {tipo_asignacion}")
        
        if tecnicos_con_error:
            return jsonify({
                'error': 'No se pueden asignar los técnicos seleccionados',
                'detalles': tecnicos_con_error
            }), 400
        
        # Verificar que la orden existe
        orden = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        # ✅ Eliminar asignaciones previas del mismo tipo
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': datetime.datetime.now().isoformat()}) \
            .eq('id_orden_trabajo', id_orden) \
            .eq('tipo_asignacion', tipo_asignacion) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        # ✅ Crear nuevas asignaciones con tipo_asignacion
        for tecnico_id in tecnicos_ids:
            supabase.table('asignaciontecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'tipo_asignacion': tipo_asignacion,  # ✅ AGREGADO
                'fecha_hora_inicio': datetime.datetime.now().isoformat()
            }).execute()
        
        # Cambiar estado de la orden si es necesario
        if orden.data['estado_global'] == 'EnRecepcion' and len(tecnicos_ids) > 0:
            supabase.table('ordentrabajo') \
                .update({'estado_global': 'EnProceso'}) \
                .eq('id', id_orden) \
                .execute()
            
            supabase.table('seguimientoorden').insert({
                'id_orden_trabajo': id_orden,
                'estado': 'EnProceso',
                'fecha_hora_cambio': datetime.datetime.now().isoformat()
            }).execute()
        
        logger.info(f"Técnicos asignados a orden {id_orden} para {tipo_asignacion}: {tecnicos_ids}")
        
        return jsonify({'success': True, 'message': f'Técnicos asignados correctamente para {tipo_asignacion}'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/diagnostico-inicial', methods=['POST'])
@jefe_taller_required
def guardar_diagnostico_inicial(current_user):
    """Guardar diagnóstico inicial de la orden con grabación de audio"""
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
            update_data = {
                'diagnostigo': diagnostico,
                'fecha_hora': datetime.datetime.now().isoformat()
            }
            if audio_url:
                update_data['url_grabacion'] = audio_url
            
            supabase.table('diagnostigoinicial') \
                .update(update_data) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
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
        
        logger.info(f"Diagnóstico inicial guardado para orden {id_orden}")
        
        return jsonify({'success': True, 'message': 'Diagnóstico guardado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500
    

@jefe_taller_ordenes_bp.route('/planificar', methods=['POST'])
@jefe_taller_required
def planificar_trabajo(current_user):
    """Planificar trabajo: asignar bahía y horario"""
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
        
        logger.info(f"Planificación guardada para orden {id_orden}")
        
        return jsonify({'success': True, 'message': 'Planificación guardada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando planificación: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/reanudar-orden', methods=['POST'])
@jefe_taller_required
def reanudar_orden(current_user):
    """Reanudar una orden que estaba en pausa"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnProceso'}) \
            .eq('id', id_orden) \
            .execute()
        
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnProceso',
            'fecha_hora_cambio': datetime.datetime.now().isoformat()
        }).execute()
        
        logger.info(f"Orden {id_orden} reanudada por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': 'Orden reanudada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error reanudando orden: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def detalle_orden(current_user, id_orden):
    """Obtener detalle completo de una orden de trabajo incluyendo planificación"""
    try:
        orden = supabase.table('ordentrabajo') \
            .select('''
                id, 
                codigo_unico, 
                fecha_ingreso, 
                fecha_salida, 
                estado_global, 
                id_vehiculo, 
                id_jefe_operativo,
                id_jefe_operativo_2
            ''') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        o = orden.data
        
        jefe_operativo = {}
        if o.get('id_jefe_operativo'):
            jefe1 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', o['id_jefe_operativo']) \
                .execute()
            if jefe1.data:
                jefe_operativo = jefe1.data[0]
        
        jefe_operativo_2 = {}
        if o.get('id_jefe_operativo_2'):
            jefe2 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', o['id_jefe_operativo_2']) \
                .execute()
            if jefe2.data:
                jefe_operativo_2 = jefe2.data[0]
        
        vehiculo = supabase.table('vehiculo') \
            .select('*') \
            .eq('id', o['id_vehiculo']) \
            .execute()
        v = vehiculo.data[0] if vehiculo.data else {}
        
        cliente_info = {}
        usuario_cliente = {}
        
        if v.get('id_cliente'):
            cliente = supabase.table('cliente') \
                .select('*') \
                .eq('id', v['id_cliente']) \
                .execute()
            
            if cliente.data:
                cliente_info = cliente.data[0]
                
                if cliente_info.get('id_usuario'):
                    usuario = supabase.table('usuario') \
                        .select('id, nombre, contacto, ubicacion, email') \
                        .eq('id', cliente_info['id_usuario']) \
                        .execute()
                    
                    if usuario.data:
                        usuario_cliente = usuario.data[0]
        
        recepcion = supabase.table('recepcion') \
            .select('*') \
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
                .select('id, nombre, contacto') \
                .eq('id', asig['id_tecnico']) \
                .execute()
            if tecnico.data:
                tecnicos.append(tecnico.data[0])
        
        diagnostico = supabase.table('diagnostigoinicial') \
            .select('diagnostigo, fecha_hora, url_grabacion') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        diagnostico_data = diagnostico.data[0] if diagnostico.data else None
        
        planificacion = supabase.table('planificacion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        planificacion_data = planificacion.data[0] if planificacion.data else None
        
        detalle = {
            'id': o['id'],
            'codigo_unico': o['codigo_unico'],
            'fecha_ingreso': o['fecha_ingreso'],
            'fecha_salida': o.get('fecha_salida'),
            'estado_global': o['estado_global'],
            'jefe_operativo': jefe_operativo,
            'jefe_operativo_2': jefe_operativo_2,
            'placa': v.get('placa', ''),
            'marca': v.get('marca', ''),
            'modelo': v.get('modelo', ''),
            'anio': v.get('anio'),
            'kilometraje': v.get('kilometraje'),
            'cliente': {
                'id': cliente_info.get('id') if cliente_info else None,
                'id_usuario': cliente_info.get('id_usuario') if cliente_info else None,
                'nombre': usuario_cliente.get('nombre', 'No registrado'),
                'telefono': usuario_cliente.get('contacto', 'No registrado'),
                'ubicacion': usuario_cliente.get('ubicacion', 'No registrada'),
                'email': usuario_cliente.get('email', 'No registrado'),
                'documento': cliente_info.get('numero_documento', '') if cliente_info else '',
                'tipo_documento': cliente_info.get('tipo_documento', '') if cliente_info else ''
            },
            'tecnicos': tecnicos,
            'diagnostico_inicial': diagnostico_data['diagnostigo'] if diagnostico_data else None,
            'diagnostico_audio_url': diagnostico_data.get('url_grabacion') if diagnostico_data else None,
            'planificacion': planificacion_data,
            'transcripcion_problema': recepcion_data.get('transcripcion_problema', ''),
            'audio_url': recepcion_data.get('url_grabacion_problema'),
            'fotos': {
                'url_lateral_izquierda': recepcion_data.get('url_lateral_izquierda'),
                'url_lateral_derecha': recepcion_data.get('url_lateral_derecha'),
                'url_foto_frontal': recepcion_data.get('url_foto_frontal'),
                'url_foto_trasera': recepcion_data.get('url_foto_trasera'),
                'url_foto_superior': recepcion_data.get('url_foto_superior'),
                'url_foto_inferior': recepcion_data.get('url_foto_inferior'),
                'url_foto_tablero': recepcion_data.get('url_foto_tablero')
            }
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de orden: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    

@jefe_taller_ordenes_bp.route('/historial-diagnosticos/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def historial_diagnosticos(current_user, id_orden):
    """Obtener historial de diagnósticos técnicos de una orden"""
    try:
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('id, id_tecnico, informe, url_grabacion_informe, transcripcion_informe, estado, fecha_envio, version, usuario!inner(nombre)') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_envio', desc=True) \
            .execute()
        
        diagnosticos_list = []
        for d in (diagnosticos.data or []):
            observaciones = supabase.table('observaciondiagnostico') \
                .select('observacion, url_grabacion_observacion, fecha_hora, id_jefe_taller, jefe_taller:usuario!observaciondiagnostico_id_jefe_taller_fkey(nombre)') \
                .eq('id_diagnostico_tecnico', d['id']) \
                .execute()
            
            observacion_data = observaciones.data[0] if observaciones.data else None
            
            fotos = supabase.table('foto_diagnostico') \
                .select('url_foto, descripcion_tecnico') \
                .eq('id_diagnostico_tecnico', d['id']) \
                .execute()
            
            diagnosticos_list.append({
                'id': d['id'],
                'id_tecnico': d['id_tecnico'],
                'tecnico_nombre': d.get('usuario', {}).get('nombre', ''),
                'informe': d.get('informe', ''),
                'url_grabacion': d.get('url_grabacion_informe'),
                'transcripcion': d.get('transcripcion_informe'),
                'estado': d.get('estado', ''),
                'fecha_envio': d.get('fecha_envio'),
                'version': d.get('version', 1),
                'observaciones': observacion_data.get('observacion') if observacion_data else None,
                'observacion_audio': observacion_data.get('url_grabacion_observacion') if observacion_data else None,
                'aprobado': d.get('estado') == 'aprobado',
                'fotos': [{'url_foto': f['url_foto'], 'descripcion': f.get('descripcion_tecnico', '')} for f in (fotos.data or [])]
            })
        
        return jsonify({'success': True, 'diagnosticos': diagnosticos_list}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo historial de diagnósticos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/aprobar-diagnostico', methods=['POST'])
@jefe_taller_required
def aprobar_diagnostico(current_user):
    """Aprobar o rechazar un diagnóstico técnico"""
    try:
        data = request.get_json()
        id_diagnostico = data.get('id_diagnostico')
        aceptado = data.get('aceptado', True)
        observacion = data.get('observacion')
        
        if not id_diagnostico:
            return jsonify({'error': 'ID de diagnóstico requerido'}), 400
        
        nuevo_estado = 'aprobado' if aceptado else 'rechazado'
        supabase.table('diagnostico_tecnico') \
            .update({'estado': nuevo_estado}) \
            .eq('id', id_diagnostico) \
            .execute()
        
        if not aceptado and observacion:
            supabase.table('observaciondiagnostico').insert({
                'id_diagnostico_tecnico': id_diagnostico,
                'id_jefe_taller': current_user['id'],
                'observacion': observacion,
                'fecha_hora': datetime.datetime.now().isoformat()
            }).execute()
            
            diagnostico_actual = supabase.table('diagnostico_tecnico') \
                .select('id_orden_trabajo, id_tecnico, informe, url_grabacion_informe, transcripcion_informe, version') \
                .eq('id', id_diagnostico) \
                .single() \
                .execute()
            
            if diagnostico_actual.data:
                supabase.table('diagnostico_tecnico').insert({
                    'id_orden_trabajo': diagnostico_actual.data['id_orden_trabajo'],
                    'id_tecnico': diagnostico_actual.data['id_tecnico'],
                    'informe': diagnostico_actual.data.get('informe'),
                    'url_grabacion_informe': diagnostico_actual.data.get('url_grabacion_informe'),
                    'transcripcion_informe': diagnostico_actual.data.get('transcripcion_informe'),
                    'estado': 'pendiente',
                    'fecha_envio': datetime.datetime.now().isoformat(),
                    'version': (diagnostico_actual.data.get('version', 1) + 1)
                }).execute()
        
        logger.info(f"Diagnóstico {id_diagnostico} {'aprobado' if aceptado else 'rechazado'} por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': f'Diagnóstico {"aprobado" if aceptado else "rechazado con observaciones"}'}), 200
        
    except Exception as e:
        logger.error(f"Error aprobando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500


def generar_codigo_orden():
    """Generar código único para orden de trabajo"""
    try:
        fecha = datetime.datetime.now()
        año = fecha.strftime('%y')
        mes = fecha.strftime('%m')
        dia = fecha.strftime('%d')
        
        inicio_dia = datetime.datetime.combine(fecha.date(), datetime.time.min)
        fin_dia = datetime.datetime.combine(fecha.date(), datetime.time.max)
        
        ultimos = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .gte('fecha_ingreso', inicio_dia.isoformat()) \
            .lte('fecha_ingreso', fin_dia.isoformat()) \
            .execute()
        
        contador = len(ultimos.data) if ultimos.data else 0
        secuencia = str(contador + 1).zfill(3)
        
        return f"OT-{año}{mes}{dia}-{secuencia}"
        
    except Exception:
        timestamp = datetime.datetime.now().strftime('%y%m%d%H%M%S')
        return f"OT-{timestamp}"


@jefe_taller_ordenes_bp.route('/transcribir-audio', methods=['POST'])
@jefe_taller_required
def transcribir_audio_jefe_taller(current_user):
    """Transcribir audio usando Whisper (para jefe taller)"""
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
            return jsonify({'error': 'Whisper no está disponible en el servidor'}), 500
        
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        logger.info(f"Audio recibido por jefe taller: {len(audio_bytes)} bytes")
        
        try:
            model = whisper.load_model("base")
            temp_path = None
            try:
                temp_dir = tempfile.gettempdir()
                temp_path = os.path.join(temp_dir, f"whisper_audio_{uuid.uuid4().hex}.wav")
                with open(temp_path, 'wb') as f:
                    f.write(audio_bytes)
                
                resultado = model.transcribe(
                    temp_path,
                    language="es",
                    task="transcribe",
                    verbose=False,
                    fp16=False
                )
                texto = resultado["text"].strip()
                logger.info(f"✅ Transcripción completada: {len(texto)} caracteres")
                
                return jsonify({'success': True, 'transcripcion': texto}), 200
                
            finally:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)
                    
        except Exception as e:
            logger.error(f"Error en transcripción: {str(e)}")
            return jsonify({'error': f'Error al transcribir: {str(e)}'}), 500
        
    except Exception as e:
        logger.error(f"Error en transcripción: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/subir-audio-diagnostico', methods=['POST'])
@jefe_taller_required
def subir_audio_diagnostico(current_user):
    """Subir audio de diagnóstico a Cloudinary"""
    try:
        data = request.get_json()
        audio_base64 = data.get('audio')
        id_orden = data.get('id_orden')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        if not config.CLOUDINARY_CONFIGURED:
            logger.warning("⚠️ Cloudinary no configurado, guardando audio localmente")
            if 'base64,' in audio_base64:
                audio_base64 = audio_base64.split('base64,')[1]
            audio_bytes = base64.b64decode(audio_base64)
            
            upload_dir = os.path.join('uploads', 'audios', f'diagnostico_{id_orden}')
            os.makedirs(upload_dir, exist_ok=True)
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"diagnostico_{id_orden}_{timestamp}.wav"
            filepath = os.path.join(upload_dir, filename)
            
            with open(filepath, 'wb') as f:
                f.write(audio_bytes)
            
            url = f"/uploads/audios/diagnostico_{id_orden}/{filename}"
            logger.info(f"✅ Audio guardado localmente: {url}")
            return jsonify({'success': True, 'url': url}), 200
        
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
        logger.info(f"✅ Audio de diagnóstico subido a Cloudinary: {url}")
        
        return jsonify({'success': True, 'url': url}), 200
        
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/bahias/estado', methods=['GET'])
@jefe_taller_required
def get_estado_bahias(current_user):
    """Obtener estado actual de todas las bahías (1-12)"""
    try:
        planificaciones_activas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, ordentrabajo!inner(codigo_unico, estado_global)') \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        bahias_ocupadas = {}
        for p in (planificaciones_activas.data or []):
            bahia = p.get('bahia_asignada')
            if bahia:
                orden = p.get('ordentrabajo', {})
                bahias_ocupadas[bahia] = {
                    'codigo': orden.get('codigo_unico'),
                    'estado': orden.get('estado_global')
                }
        
        bahias = []
        for i in range(1, 13):
            if i in bahias_ocupadas:
                bahias.append({
                    'numero': i,
                    'estado': 'ocupado',
                    'orden_codigo': bahias_ocupadas[i]['codigo'],
                    'orden_estado': bahias_ocupadas[i]['estado']
                })
            else:
                bahias.append({
                    'numero': i,
                    'estado': 'libre',
                    'orden_codigo': None,
                    'orden_estado': None
                })
        
        ocupadas = len([b for b in bahias if b['estado'] == 'ocupado'])
        
        return jsonify({
            'success': True,
            'bahias': bahias,
            'resumen': {
                'total': 12,
                'ocupadas': ocupadas,
                'libres': 12 - ocupadas
            }
        }), 200
    except Exception as e:
        logger.error(f"Error obteniendo estado de bahías: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/iniciar-trabajo', methods=['POST'])
@jefe_taller_required
def iniciar_trabajo_orden(current_user):
    """Marcar inicio real de trabajo en una orden (ocupa la bahía)"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        orden = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        planificacion = supabase.table('planificacion') \
            .select('id, bahia_asignada') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if not planificacion.data:
            return jsonify({'error': 'La orden no tiene planificación (bahía asignada)'}), 400
        
        if orden.data['estado_global'] not in ['EnRecepcion', 'EnPausa']:
            return jsonify({'error': f'No se puede iniciar trabajo en estado {orden.data["estado_global"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        supabase.table('planificacion') \
            .update({'fecha_hora_inicio_real': ahora}) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnProceso'}) \
            .eq('id', id_orden) \
            .execute()
        
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnProceso',
            'fecha_hora_cambio': ahora
        }).execute()
        
        bahia = planificacion.data[0].get('bahia_asignada', 'desconocida')
        logger.info(f"🔧 Trabajo iniciado en bahía {bahia} para orden {id_orden}")
        
        return jsonify({'success': True, 'message': f'Trabajo iniciado en bahía {bahia}'}), 200
        
    except Exception as e:
        logger.error(f"Error iniciando trabajo: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/completar-trabajo', methods=['POST'])
@jefe_taller_required
def completar_trabajo_orden(current_user):
    """Técnico marca trabajo como completado (pendiente de aprobación)"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        observaciones = data.get('observaciones', '')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        orden = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden.data['estado_global'] != 'EnProceso':
            return jsonify({'error': f'Solo se pueden completar órdenes en estado EnProceso (actual: {orden.data["estado_global"]})'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'PendienteAprobacion'}) \
            .eq('id', id_orden) \
            .execute()
        
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'PendienteAprobacion',
            'fecha_hora_cambio': ahora
        }).execute()
        
        if observaciones:
            supabase.table('avancetrabajo').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': current_user['id'],
                'descripcion': observaciones,
                'tipo_avance': 'finalizacion',
                'fecha_hora': ahora
            }).execute()
        
        logger.info(f"✅ Trabajo completado para orden {id_orden}, pendiente aprobación")
        
        return jsonify({'success': True, 'message': 'Trabajo completado. Pendiente de aprobación por Jefe de Taller'}), 200
        
    except Exception as e:
        logger.error(f"Error completando trabajo: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/aprobar-entrega', methods=['POST'])
@jefe_taller_required
def aprobar_entrega_orden(current_user):
    """Jefe de Taller aprueba trabajo y libera bahía"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        aprobado = data.get('aprobado', True)
        observaciones = data.get('observaciones', '')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        orden = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        ahora = datetime.datetime.now().isoformat()
        
        if aprobado:
            supabase.table('planificacion') \
                .update({'fecha_hora_fin_real': ahora}) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
            
            supabase.table('ordentrabajo') \
                .update({'estado_global': 'Entregado', 'fecha_salida': ahora}) \
                .eq('id', id_orden) \
                .execute()
            
            supabase.table('asignaciontecnico') \
                .update({'fecha_hora_final': ahora}) \
                .eq('id_orden_trabajo', id_orden) \
                .eq('tipo_asignacion', 'diagnostico') \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            mensaje = "Trabajo aprobado y bahía liberada"
        else:
            supabase.table('ordentrabajo') \
                .update({'estado_global': 'EnProceso'}) \
                .eq('id', id_orden) \
                .execute()
            
            if observaciones:
                supabase.table('avancetrabajo').insert({
                    'id_orden_trabajo': id_orden,
                    'id_tecnico': current_user['id'],
                    'descripcion': f'RECHAZO: {observaciones}',
                    'tipo_avance': 'rechazo',
                    'fecha_hora': ahora
                }).execute()
            
            mensaje = "Trabajo rechazado. Se enviaron observaciones al técnico"
        
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'Entregado' if aprobado else 'EnProceso',
            'fecha_hora_cambio': ahora
        }).execute()
        
        logger.info(f"{'✅' if aprobado else '❌'} Orden {id_orden} {'aprobada' if aprobado else 'rechazada'}")
        
        return jsonify({'success': True, 'message': mensaje, 'aprobado': aprobado}), 200
        
    except Exception as e:
        logger.error(f"Error aprobando entrega: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/tecnicos/carga', methods=['GET'])
@jefe_taller_required
def get_carga_tecnicos(current_user):
    """Obtener carga de trabajo de técnicos para el panel derecho"""
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
                porcentaje = (ordenes_activas / MAX_ORDENES) * 100
                
                tecnicos.append({
                    'id': usuario['id'],
                    'nombre': usuario['nombre'],
                    'contacto': usuario.get('contacto', ''),
                    'ordenes_activas': ordenes_activas,
                    'max_vehiculos': MAX_ORDENES,
                    'porcentaje': porcentaje
                })
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo carga de técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/verificar-bahia', methods=['POST'])
@jefe_taller_required
def verificar_bahia(current_user):
    """Verificar si una bahía está disponible en un horario específico"""
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
        
        return jsonify({
            'success': True,
            'disponible': disponible,
            'bahia': bahia,
            'fecha_inicio': fecha_inicio_dt.isoformat(),
            'fecha_fin': fecha_fin_dt.isoformat()
        }), 200
        
    except Exception as e:
        logger.error(f"Error verificando bahía: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/bahias-ocupadas', methods=['GET'])
@jefe_taller_required
def get_bahias_ocupadas(current_user):
    """Obtener lista de bahías actualmente ocupadas"""
    try:
        resultado = supabase.table('vista_bahias_ocupadas') \
            .select('*') \
            .execute()
        
        bahias_ocupadas = resultado.data if resultado.data else []
        
        return jsonify({
            'success': True,
            'bahias_ocupadas': bahias_ocupadas
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo bahías ocupadas: {str(e)}")
        return jsonify({'error': str(e)}), 500