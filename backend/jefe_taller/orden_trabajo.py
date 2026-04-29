# =====================================================
# ÓRDENES DE TRABAJO - JEFE TALLER (COMPLETO Y CORREGIDO)
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
from functools import lru_cache
from datetime import datetime as dt
import time

logger = logging.getLogger(__name__)

jefe_taller_ordenes_bp = Blueprint('jefe_taller_ordenes', __name__, url_prefix='/api/jefe-taller')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# CACHE EN MEMORIA
# =====================================================

class CacheManager:
    """Gestor de caché simple en memoria"""
    def __init__(self):
        self._cache = {}
    
    def get(self, key):
        """Obtener dato del caché si no ha expirado"""
        if key in self._cache:
            data, timestamp, ttl = self._cache[key]
            if time.time() - timestamp < ttl:
                return data
            del self._cache[key]
        return None
    
    def set(self, key, data, ttl=30):
        """Guardar dato en caché con TTL en segundos"""
        self._cache[key] = (data, time.time(), ttl)
    
    def clear(self, key=None):
        """Limpiar caché específico o todo"""
        if key:
            self._cache.pop(key, None)
        else:
            self._cache.clear()

# Instancia global de caché
cache = CacheManager()

# =====================================================
# ENDPOINTS OPTIMIZADOS
# =====================================================

@jefe_taller_ordenes_bp.route('/tecnicos', methods=['GET'])
@jefe_taller_required
def listar_tecnicos(current_user):
    """Listar técnicos con su disponibilidad actual"""
    try:
        # Intentar obtener del caché
        cached_data = cache.get('tecnicos_list')
        if cached_data:
            return jsonify({'success': True, 'tecnicos': cached_data}), 200
        
        # Consultar usuarios
        usuarios_result = supabase.table('usuario') \
            .select('id, nombre, contacto') \
            .execute()
        
        tecnicos = []
        MAX_ORDENES = 2
        
        if usuarios_result.data:
            usuarios_ids = [u['id'] for u in usuarios_result.data]
            
            # Obtener roles de usuarios (tabla correcta: usuario_rol)
            roles_data = supabase.table('usuario_rol') \
                .select('id_usuario, nombre_rol') \
                .execute()
            
            # Crear conjunto de IDs de técnicos
            tecnicos_ids_set = set()
            for r in (roles_data.data or []):
                if r.get('nombre_rol') == 'tecnico':
                    tecnicos_ids_set.add(r.get('id_usuario'))
            
            # Obtener asignaciones activas
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_tecnico') \
                .eq('tipo_asignacion', 'diagnostico') \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            # Contar órdenes por técnico
            ordenes_por_tecnico = {}
            for a in (asignaciones.data or []):
                if a.get('id_tecnico'):
                    ordenes_por_tecnico[a['id_tecnico']] = ordenes_por_tecnico.get(a['id_tecnico'], 0) + 1
            
            # Construir lista de técnicos
            for usuario in usuarios_result.data:
                if usuario['id'] in tecnicos_ids_set:
                    ordenes_activas = ordenes_por_tecnico.get(usuario['id'], 0)
                    tecnicos.append({
                        'id': usuario['id'],
                        'nombre': usuario['nombre'],
                        'contacto': usuario.get('contacto', ''),
                        'ordenes_activas': ordenes_activas,
                        'max_vehiculos': MAX_ORDENES,
                        'disponible': ordenes_activas < MAX_ORDENES,
                        'cupo_restante': MAX_ORDENES - ordenes_activas
                    })
        
        # Guardar en caché
        cache.set('tecnicos_list', tecnicos, ttl=30)
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error listando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/ordenes-activas', methods=['GET'])
@jefe_taller_required
def listar_ordenes_activas(current_user):
    """Listar órdenes activas"""
    try:
        # Obtener órdenes activas
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .in_('estado_global', ['EnRecepcion', 'EnProceso', 'EnPausa']) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        if not resultado.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes = resultado.data
        ordenes_ids = [o['id'] for o in ordenes]
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes if o.get('id_vehiculo')]))
        
        # Obtener vehículos
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # Obtener clientes
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
        
        # Obtener usuarios (clientes)
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # Obtener técnicos por orden
        tecnicos_por_orden = {}
        if ordenes_ids:
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, id_tecnico') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .eq('tipo_asignacion', 'diagnostico') \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones.data or []) if a.get('id_tecnico')]))
            tecnicos_nombres_map = {}
            
            if tecnicos_ids:
                tecnicos = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                for t in (tecnicos.data or []):
                    tecnicos_nombres_map[t['id']] = t
            
            for a in (asignaciones.data or []):
                orden_id = a.get('id_orden_trabajo')
                if orden_id and orden_id not in tecnicos_por_orden:
                    tecnicos_por_orden[orden_id] = []
                if orden_id and a.get('id_tecnico') in tecnicos_nombres_map:
                    tecnicos_por_orden[orden_id].append({
                        'id': a['id_tecnico'],
                        'nombre': tecnicos_nombres_map[a['id_tecnico']]['nombre']
                    })
        
        # Obtener planificaciones
        planificaciones_map = {}
        if ordenes_ids:
            planificaciones = supabase.table('planificacion') \
                .select('id_orden_trabajo, bahia_asignada, fecha_hora_inicio_estimado, horas_estimadas, fecha_hora_inicio_real') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            for p in (planificaciones.data or []):
                if p.get('id_orden_trabajo'):
                    planificaciones_map[p['id_orden_trabajo']] = p
        
        # Construir resultado
        ordenes_resultado = []
        for orden in ordenes:
            v = vehiculos_map.get(orden.get('id_vehiculo'), {})
            cliente_info = clientes_map.get(v.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
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
    """Listar órdenes finalizadas"""
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                fecha_ingreso,
                fecha_salida,
                estado_global,
                vehiculo:vehiculo!inner (
                    placa,
                    marca,
                    modelo,
                    cliente:cliente!inner (
                        id_usuario,
                        usuario:usuario!inner (
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
                'cliente_nombre': usuario.get('nombre', 'No registrado')
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error listando órdenes finalizadas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/asignar-tecnicos', methods=['POST'])
@jefe_taller_required
def asignar_tecnicos(current_user):
    """Asignar técnicos a una orden"""
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
        
        # Validar disponibilidad de técnicos
        if tecnicos_ids:
            asignaciones_activas = supabase.table('asignaciontecnico') \
                .select('id_tecnico') \
                .in_('id_tecnico', tecnicos_ids) \
                .eq('tipo_asignacion', tipo_asignacion) \
                .is_('fecha_hora_final', 'null') \
                .neq('id_orden_trabajo', id_orden) \
                .execute()
            
            ordenes_por_tecnico = {}
            for a in (asignaciones_activas.data or []):
                if a.get('id_tecnico'):
                    ordenes_por_tecnico[a['id_tecnico']] = ordenes_por_tecnico.get(a['id_tecnico'], 0) + 1
            
            tecnicos_con_error = []
            for tecnico_id in tecnicos_ids:
                ordenes_activas = ordenes_por_tecnico.get(tecnico_id, 0)
                if ordenes_activas >= MAX_ORDENES_POR_TECNICO:
                    tecnico_info = supabase.table('usuario') \
                        .select('nombre') \
                        .eq('id', tecnico_id) \
                        .execute()
                    nombre_tecnico = tecnico_info.data[0].get('nombre', f"ID {tecnico_id}") if tecnico_info.data else f"ID {tecnico_id}"
                    tecnicos_con_error.append(f"{nombre_tecnico} ya tiene {ordenes_activas}/{MAX_ORDENES_POR_TECNICO} órdenes activas")
            
            if tecnicos_con_error:
                return jsonify({'error': 'No se pueden asignar los técnicos seleccionados', 'detalles': tecnicos_con_error}), 400
        
        # Finalizar asignaciones activas actuales
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': datetime.datetime.now().isoformat()}) \
            .eq('id_orden_trabajo', id_orden) \
            .eq('tipo_asignacion', tipo_asignacion) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        # Crear nuevas asignaciones
        for tecnico_id in tecnicos_ids:
            supabase.table('asignaciontecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'tipo_asignacion': tipo_asignacion,
                'fecha_hora_inicio': datetime.datetime.now().isoformat()
            }).execute()
        
        # Limpiar caché de técnicos
        cache.clear('tecnicos_list')
        
        return jsonify({'success': True, 'message': 'Técnicos asignados correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/diagnostico-inicial', methods=['POST'])
@jefe_taller_required
def guardar_diagnostico_inicial(current_user):
    """Guardar diagnóstico inicial"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        diagnostico = data.get('diagnostico', '')
        audio_url = data.get('audio_url')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not diagnostico:
            return jsonify({'error': 'El diagnóstico es obligatorio'}), 400
        
        # Verificar si existe diagnóstico previo
        diagnostico_existente = supabase.table('diagnostigoinicial') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        now = datetime.datetime.now().isoformat()
        
        if diagnostico_existente.data:
            # Actualizar existente
            update_data = {
                'diagnostigo': diagnostico,
                'fecha_hora': now,
                'id_jefe_taller': current_user['id']
            }
            if audio_url:
                update_data['url_grabacion'] = audio_url
                
            supabase.table('diagnostigoinicial') \
                .update(update_data) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
        else:
            # Insertar nuevo
            insert_data = {
                'id_orden_trabajo': id_orden,
                'id_jefe_taller': current_user['id'],
                'diagnostigo': diagnostico,
                'fecha_hora': now
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
    """Guardar planificación"""
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
        
        # Verificar si existe planificación previa
        planificacion_existente = supabase.table('planificacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        planificacion_data = {
            'bahia_asignada': bahia,
            'horas_estimadas': horas_estimadas,
            'fecha_hora_inicio_estimado': fecha_inicio_dt.isoformat(),
            'fecha_hora_fin_estimado': fecha_fin_dt.isoformat()
        }
        
        if planificacion_existente.data:
            supabase.table('planificacion') \
                .update(planificacion_data) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
        else:
            planificacion_data['id_orden_trabajo'] = id_orden
            supabase.table('planificacion').insert(planificacion_data).execute()
        
        return jsonify({'success': True, 'message': 'Planificación guardada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando planificación: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def detalle_orden(current_user, id_orden):
    """Obtener detalle completo de una orden"""
    try:
        # Obtener orden
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data or len(orden_result.data) == 0:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data[0]
        
        # Obtener vehículo
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', orden.get('id_vehiculo')) \
            .execute()
        
        v = vehiculo_result.data[0] if vehiculo_result.data else {}
        
        # Obtener cliente y usuario
        cliente_info = {}
        usuario_cliente = {}
        
        if v.get('id_cliente'):
            cliente_result = supabase.table('cliente') \
                .select('id, id_usuario') \
                .eq('id', v['id_cliente']) \
                .execute()
            
            if cliente_result.data:
                cliente_info = cliente_result.data[0]
                if cliente_info.get('id_usuario'):
                    usuario_result = supabase.table('usuario') \
                        .select('nombre, contacto') \
                        .eq('id', cliente_info['id_usuario']) \
                        .execute()
                    if usuario_result.data:
                        usuario_cliente = usuario_result.data[0]
        
        # Obtener recepción
        recepcion_result = supabase.table('recepcion') \
            .select('transcripcion_problema') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        recepcion_data = recepcion_result.data[0] if recepcion_result.data else {}
        
        # Obtener técnicos asignados
        tecnicos = []
        asignaciones_result = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for asignacion in (asignaciones_result.data or []):
            if asignacion.get('id_tecnico'):
                tecnico_result = supabase.table('usuario') \
                    .select('id, nombre') \
                    .eq('id', asignacion['id_tecnico']) \
                    .execute()
                if tecnico_result.data:
                    tecnicos.append(tecnico_result.data[0])
        
        # Obtener diagnóstico inicial
        diagnostico_result = supabase.table('diagnostigoinicial') \
            .select('diagnostigo, url_grabacion') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        diagnostico_data = diagnostico_result.data[0] if diagnostico_result.data else {}
        
        # Obtener planificación
        planificacion_result = supabase.table('planificacion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        planificacion_data = planificacion_result.data[0] if planificacion_result.data else {}
        
        detalle = {
            'id': orden['id'],
            'codigo_unico': orden['codigo_unico'],
            'fecha_ingreso': orden['fecha_ingreso'],
            'fecha_salida': orden.get('fecha_salida'),
            'estado_global': orden['estado_global'],
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
            'diagnostico_inicial': diagnostico_data.get('diagnostigo'),
            'diagnostico_audio_url': diagnostico_data.get('url_grabacion'),
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
    """Verificar si hay diagnóstico técnico pendiente de aprobación"""
    try:
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, estado, version, id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('estado', 'pendiente') \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico.data and len(diagnostico.data) > 0:
            diag = diagnostico.data[0]
            tecnico_nombre = 'Desconocido'
            if diag.get('id_tecnico'):
                tecnico_result = supabase.table('usuario') \
                    .select('nombre') \
                    .eq('id', diag['id_tecnico']) \
                    .execute()
                if tecnico_result.data:
                    tecnico_nombre = tecnico_result.data[0].get('nombre', 'Desconocido')
            
            return jsonify({
                'enviado': True,
                'estado': 'pendiente',
                'version': diag.get('version'),
                'tecnico_nombre': tecnico_nombre
            }), 200
        else:
            return jsonify({'enviado': False}), 200
            
    except Exception as e:
        logger.error(f"Error verificando diagnóstico pendiente: {str(e)}")
        return jsonify({'enviado': False}), 200


@jefe_taller_ordenes_bp.route('/bahias/estado', methods=['GET'])
@jefe_taller_required
def get_estado_bahias(current_user):
    """Obtener estado de todas las bahías"""
    try:
        # Intentar obtener del caché
        cached_data = cache.get('bahias_estado')
        if cached_data:
            return jsonify({'success': True, 'bahias': cached_data}), 200
        
        ahora = datetime.datetime.now()
        
        # Obtener bahías ocupadas (trabajo en curso)
        planificaciones_ocupadas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_real') \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        # Obtener códigos de órdenes para bahías ocupadas
        ordenes_ids_ocupadas = [p['id_orden_trabajo'] for p in (planificaciones_ocupadas.data or []) if p.get('id_orden_trabajo')]
        ordenes_codigos = {}
        if ordenes_ids_ocupadas:
            ordenes_data = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, estado_global') \
                .in_('id', ordenes_ids_ocupadas) \
                .execute()
            for o in (ordenes_data.data or []):
                ordenes_codigos[o['id']] = o
        
        # Obtener bahías reservadas (planificadas para futuro)
        planificaciones_reservadas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_estimado, horas_estimadas') \
            .is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        # Obtener códigos de órdenes para bahías reservadas
        ordenes_ids_reservadas = [p['id_orden_trabajo'] for p in (planificaciones_reservadas.data or []) if p.get('id_orden_trabajo')]
        if ordenes_ids_reservadas:
            ordenes_data_res = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, estado_global') \
                .in_('id', ordenes_ids_reservadas) \
                .execute()
            for o in (ordenes_data_res.data or []):
                if o['id'] not in ordenes_codigos:
                    ordenes_codigos[o['id']] = o
        
        bahias_ocupadas = {}
        for p in (planificaciones_ocupadas.data or []):
            bahia = p.get('bahia_asignada')
            if bahia:
                orden_info = ordenes_codigos.get(p['id_orden_trabajo'], {})
                bahias_ocupadas[bahia] = {
                    'estado': 'ocupado',
                    'codigo': orden_info.get('codigo_unico'),
                    'estado_orden': orden_info.get('estado_global'),
                    'inicio_real': p.get('fecha_hora_inicio_real')
                }
        
        bahias_reservadas = {}
        for p in (planificaciones_reservadas.data or []):
            bahia = p.get('bahia_asignada')
            if bahia and bahia not in bahias_ocupadas:
                orden_info = ordenes_codigos.get(p['id_orden_trabajo'], {})
                fecha_estimada = p.get('fecha_hora_inicio_estimado')
                
                es_futura = False
                if fecha_estimada:
                    try:
                        fecha_estimada_dt = datetime.datetime.fromisoformat(fecha_estimada.replace('Z', '+00:00'))
                        es_futura = fecha_estimada_dt > ahora
                    except:
                        es_futura = True
                
                if es_futura:
                    bahias_reservadas[bahia] = {
                        'estado': 'reservado',
                        'codigo': orden_info.get('codigo_unico'),
                        'estado_orden': orden_info.get('estado_global'),
                        'fecha_inicio_estimado': fecha_estimada,
                        'horas_estimadas': p.get('horas_estimadas')
                    }
        
        # Construir lista de bahías 1-12
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
        
        # Guardar en caché por 10 segundos
        cache.set('bahias_estado', bahias, ttl=10)
        
        return jsonify({'success': True, 'bahias': bahias}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estado de bahías: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/verificar-bahia', methods=['POST'])
@jefe_taller_required
def verificar_bahia(current_user):
    """Verificar disponibilidad de una bahía en un horario específico"""
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
        
        # Verificar conflictos
        query = supabase.table('planificacion') \
            .select('id') \
            .eq('bahia_asignada', bahia) \
            .filter('fecha_hora_inicio_estimado', 'lt', fecha_fin_dt.isoformat()) \
            .filter('fecha_hora_fin_estimado', 'gt', fecha_inicio_dt.isoformat())
        
        if id_orden_actual:
            query = query.neq('id_orden_trabajo', id_orden_actual)
        
        conflictos = query.execute()
        disponible = len(conflictos.data or []) == 0
        
        return jsonify({'success': True, 'disponible': disponible}), 200
        
    except Exception as e:
        logger.error(f"Error verificando bahía: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_taller_ordenes_bp.route('/transcribir-audio', methods=['POST'])
@jefe_taller_required
def transcribir_audio_jefe_taller(current_user):
    """Transcribir audio usando Whisper"""
    try:
        data = request.get_json()
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        # Verificar disponibilidad de Whisper
        WHISPER_AVAILABLE = False
        try:
            import whisper
            WHISPER_AVAILABLE = True
        except ImportError:
            pass
        
        if not WHISPER_AVAILABLE:
            return jsonify({'error': 'Whisper no está disponible en el servidor'}), 500
        
        # Limpiar base64 si es necesario
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        
        # Cargar modelo y transcribir
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
    """Subir audio diagnóstico a Cloudinary"""
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
        
        # Subir a Cloudinary
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