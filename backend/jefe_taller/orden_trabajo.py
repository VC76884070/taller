# =====================================================
# ÓRDENES DE TRABAJO - JEFE TALLER (VERSIÓN COMPLETA OPTIMIZADA)
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import uuid
import os
import base64
import tempfile
import io
import cloudinary
import cloudinary.uploader
import time

logger = logging.getLogger(__name__)

jefe_taller_ordenes_bp = Blueprint('jefe_taller_ordenes', __name__, url_prefix='/api/jefe-taller')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# CACHE EN MEMORIA
# =====================================================

class CacheManager:
    def __init__(self):
        self._cache = {}
    
    def get(self, key):
        if key in self._cache:
            data, timestamp, ttl = self._cache[key]
            if time.time() - timestamp < ttl:
                return data
            del self._cache[key]
        return None
    
    def set(self, key, data, ttl=30):
        self._cache[key] = (data, time.time(), ttl)
    
    def clear(self, key=None):
        if key:
            self._cache.pop(key, None)
        else:
            self._cache.clear()

cache = CacheManager()


# =====================================================
# ENDPOINT 1: LISTAR TÉCNICOS (OPTIMIZADO)
# =====================================================

@jefe_taller_ordenes_bp.route('/tecnicos', methods=['GET'])
@jefe_taller_required
def listar_tecnicos(current_user):
    try:
        cached_data = cache.get('tecnicos_list')
        if cached_data:
            return jsonify({'success': True, 'tecnicos': cached_data}), 200
        
        MAX_ORDENES = 2
        
        # Obtener IDs de técnicos
        roles_data = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 3) \
            .execute()
        
        if not roles_data.data:
            return jsonify({'success': True, 'tecnicos': []}), 200
        
        tecnicos_ids = [r['id_usuario'] for r in roles_data.data]
        
        # Obtener datos de técnicos
        usuarios_result = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .in_('id', tecnicos_ids) \
            .execute()
        
        if not usuarios_result.data:
            return jsonify({'success': True, 'tecnicos': []}), 200
        
        # Obtener asignaciones activas
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .in_('id_tecnico', tecnicos_ids) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        ordenes_por_tecnico = {}
        for a in (asignaciones.data or []):
            tecnico_id = a.get('id_tecnico')
            if tecnico_id:
                ordenes_por_tecnico[tecnico_id] = ordenes_por_tecnico.get(tecnico_id, 0) + 1
        
        tecnicos = []
        for usuario in usuarios_result.data:
            ordenes_activas = ordenes_por_tecnico.get(usuario['id'], 0)
            tecnicos.append({
                'id': usuario['id'],
                'nombre': usuario.get('nombre', 'Técnico'),
                'contacto': usuario.get('contacto', ''),
                'email': usuario.get('email', ''),
                'ordenes_activas': ordenes_activas,
                'max_vehiculos': MAX_ORDENES,
                'disponible': ordenes_activas < MAX_ORDENES,
                'cupo_restante': MAX_ORDENES - ordenes_activas
            })
        
        tecnicos.sort(key=lambda t: (not t['disponible'], t['ordenes_activas']))
        cache.set('tecnicos_list', tecnicos, ttl=30)
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error listando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 2: ÚLTIMAS 10 ÓRDENES ACTIVAS (NUEVO - MÁS RÁPIDO)
# =====================================================

@jefe_taller_ordenes_bp.route('/ultimas-ordenes', methods=['GET'])
@jefe_taller_required
def obtener_ultimas_ordenes(current_user):
    """Obtiene SOLO las últimas 10 órdenes de trabajo activas - MÁXIMO RÁPIDO"""
    try:
        # Verificar caché
        cached_data = cache.get('ultimas_ordenes')
        if cached_data:
            return jsonify({'success': True, 'ordenes': cached_data}), 200
        
        # 1. Obtener SOLO las últimas 10 órdenes activas
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_ingreso', desc=True) \
            .limit(10) \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_data = ordenes.data
        ordenes_ids = [o['id'] for o in ordenes_data]
        
        # 2. Obtener vehículos de esas 10 órdenes (máximo 10)
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes_data if o.get('id_vehiculo')]))
        vehiculos_map = {}
        
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # 3. Obtener clientes de esos vehículos
        clientes_ids = list(set([v['id_cliente'] for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        
        if clientes_ids:
            clientes = supabase.table('cliente') \
                .select('id, id_usuario') \
                .in_('id', clientes_ids) \
                .execute()
            for c in (clientes.data or []):
                clientes_map[c['id']] = c
        
        # 4. Obtener nombres de usuarios
        usuarios_ids = list(set([c['id_usuario'] for c in clientes_map.values() if c.get('id_usuario')]))
        usuarios_map = {}
        
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # 5. Obtener asignaciones de técnicos
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, id_tecnico') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones.data or []) if a.get('id_tecnico')]))
        tecnicos_nombres = {}
        
        if tecnicos_ids:
            tecnicos = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', tecnicos_ids) \
                .execute()
            for t in (tecnicos.data or []):
                tecnicos_nombres[t['id']] = t.get('nombre', 'Técnico')
        
        asignaciones_map = {}
        for a in (asignaciones.data or []):
            orden_id = a.get('id_orden_trabajo')
            tecnico_id = a.get('id_tecnico')
            if orden_id and tecnico_id and tecnico_id in tecnicos_nombres:
                if orden_id not in asignaciones_map:
                    asignaciones_map[orden_id] = []
                asignaciones_map[orden_id].append({
                    'id': tecnico_id,
                    'nombre': tecnicos_nombres[tecnico_id]
                })
        
        # 6. Obtener planificaciones
        planificaciones = supabase.table('planificacion') \
            .select('id_orden_trabajo, bahia_asignada, fecha_hora_inicio_estimado, horas_estimadas, fecha_hora_inicio_real') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        
        planificaciones_map = {}
        for p in (planificaciones.data or []):
            if p.get('id_orden_trabajo'):
                planificaciones_map[p['id_orden_trabajo']] = p
        
        # 7. Construir resultado
        resultado = []
        for orden in ordenes_data:
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            
            cliente_nombre = 'No registrado'
            cliente_id = vehiculo.get('id_cliente')
            if cliente_id and cliente_id in clientes_map:
                usuario_id = clientes_map[cliente_id].get('id_usuario')
                if usuario_id and usuario_id in usuarios_map:
                    cliente_nombre = usuarios_map[usuario_id].get('nombre', 'No registrado')
            
            planificacion = planificaciones_map.get(orden['id'], {})
            trabajo_iniciado = planificacion.get('fecha_hora_inicio_real') is not None
            
            resultado.append({
                'id_orden': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'vehiculo': {
                    'placa': vehiculo.get('placa', 'S/N'),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'cliente_nombre': cliente_nombre
                },
                'tecnicos': asignaciones_map.get(orden['id'], []),
                'bahia_asignada': planificacion.get('bahia_asignada'),
                'fecha_hora_inicio_estimado': planificacion.get('fecha_hora_inicio_estimado'),
                'horas_estimadas': planificacion.get('horas_estimadas'),
                'trabajo_iniciado': trabajo_iniciado
            })
        
        # Guardar en caché por 10 segundos
        cache.set('ultimas_ordenes', resultado, ttl=10)
        
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error en últimas órdenes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 3: LISTAR ÓRDENES ACTIVAS COMPLETAS (PARA VER MÁS)
# =====================================================

@jefe_taller_ordenes_bp.route('/ordenes-activas-v2', methods=['GET'])
@jefe_taller_required
def listar_ordenes_activas_v2(current_user):
    """Listar órdenes activas - VERSIÓN COMPLETA (para cuando el usuario pide ver todas)"""
    try:
        estados_activos = [
            'EnRecepcion', 'EnDiagnostico', 'DiagnosticoCompletado',
            'CotizacionEnviada', 'CotizacionAceptada', 'CotizacionParcial',
            'CotizacionRechazada', 'EnArmadoVehiculo', 'VehiculoArmado',
            'EnReparacion', 'EnPausa', 'ReparacionCompletada'
        ]
        
        # 1. Obtener TODAS las órdenes activas
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .in_('estado_global', estados_activos) \
            .execute()
        
        if not ordenes_result.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes = ordenes_result.data
        
        # 2. Obtener TODOS los vehículos
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes if o.get('id_vehiculo')]))
        vehiculos_map = {}
        
        if vehiculos_ids:
            vehiculos_result = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos_result.data or []):
                vehiculos_map[v['id']] = v
        
        # 3. Obtener TODOS los clientes
        clientes_ids = list(set([v['id_cliente'] for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        
        if clientes_ids:
            clientes_result = supabase.table('cliente') \
                .select('id, id_usuario') \
                .in_('id', clientes_ids) \
                .execute()
            for c in (clientes_result.data or []):
                clientes_map[c['id']] = c
        
        # 4. Obtener TODOS los usuarios
        usuarios_ids = list(set([c['id_usuario'] for c in clientes_map.values() if c.get('id_usuario')]))
        usuarios_map = {}
        
        if usuarios_ids:
            usuarios_result = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios_result.data or []):
                usuarios_map[u['id']] = u
        
        # 5. Obtener TODAS las asignaciones de técnicos
        ordenes_ids = [o['id'] for o in ordenes]
        asignaciones_map = {}
        
        if ordenes_ids:
            asignaciones_result = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, id_tecnico') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .eq('tipo_asignacion', 'diagnostico') \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones_result.data or []) if a.get('id_tecnico')]))
            tecnicos_nombres = {}
            
            if tecnicos_ids:
                tecnicos_result = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                for t in (tecnicos_result.data or []):
                    tecnicos_nombres[t['id']] = t.get('nombre', 'Técnico')
            
            for a in (asignaciones_result.data or []):
                orden_id = a.get('id_orden_trabajo')
                tecnico_id = a.get('id_tecnico')
                if orden_id and tecnico_id and tecnico_id in tecnicos_nombres:
                    if orden_id not in asignaciones_map:
                        asignaciones_map[orden_id] = []
                    asignaciones_map[orden_id].append({
                        'id': tecnico_id,
                        'nombre': tecnicos_nombres[tecnico_id]
                    })
        
        # 6. Obtener TODAS las planificaciones
        planificaciones_map = {}
        if ordenes_ids:
            planificaciones_result = supabase.table('planificacion') \
                .select('id_orden_trabajo, bahia_asignada, fecha_hora_inicio_estimado, horas_estimadas, fecha_hora_inicio_real') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            for p in (planificaciones_result.data or []):
                if p.get('id_orden_trabajo'):
                    planificaciones_map[p['id_orden_trabajo']] = p
        
        # 7. Construir resultado
        ordenes_resultado = []
        for orden in ordenes:
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            
            # Obtener nombre del cliente
            cliente_nombre = 'No registrado'
            cliente_id = vehiculo.get('id_cliente')
            if cliente_id and cliente_id in clientes_map:
                usuario_id = clientes_map[cliente_id].get('id_usuario')
                if usuario_id and usuario_id in usuarios_map:
                    cliente_nombre = usuarios_map[usuario_id].get('nombre', 'No registrado')
            
            planificacion = planificaciones_map.get(orden['id'], {})
            trabajo_iniciado = planificacion.get('fecha_hora_inicio_real') is not None
            
            ordenes_resultado.append({
                'id_orden': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'vehiculo': {
                    'placa': vehiculo.get('placa', 'S/N'),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'cliente_nombre': cliente_nombre
                },
                'tecnicos': asignaciones_map.get(orden['id'], []),
                'bahia_asignada': planificacion.get('bahia_asignada'),
                'fecha_hora_inicio_estimado': planificacion.get('fecha_hora_inicio_estimado'),
                'horas_estimadas': planificacion.get('horas_estimadas'),
                'trabajo_iniciado': trabajo_iniciado
            })
        
        # 8. ORDENAR: EnRecepcion primero, luego EnDiagnostico (últimas 5), luego el resto
        en_recepcion = [o for o in ordenes_resultado if o['estado_global'] == 'EnRecepcion']
        en_diagnostico = [o for o in ordenes_resultado if o['estado_global'] == 'EnDiagnostico']
        otros = [o for o in ordenes_resultado if o['estado_global'] not in ['EnRecepcion', 'EnDiagnostico']]
        
        en_recepcion.sort(key=lambda o: o['fecha_ingreso'], reverse=True)
        en_diagnostico.sort(key=lambda o: o['fecha_ingreso'], reverse=True)
        otros.sort(key=lambda o: o['fecha_ingreso'], reverse=True)
        
        # Solo últimas 5 de EnDiagnostico
        ordenes_final = en_recepcion + en_diagnostico[:5] + otros
        
        return jsonify({'success': True, 'ordenes': ordenes_final}), 200
        
    except Exception as e:
        logger.error(f"Error en órdenes activas: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 4: LISTAR ÓRDENES FINALIZADAS (OPTIMIZADO)
# =====================================================

@jefe_taller_ordenes_bp.route('/ordenes-finalizadas', methods=['GET'])
@jefe_taller_required
def listar_ordenes_finalizadas(current_user):
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo') \
            .in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_ingreso', desc=True) \
            .limit(50) \
            .execute()
        
        if not resultado.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes = resultado.data
        
        # Obtener vehículos
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes if o.get('id_vehiculo')]))
        vehiculos_map = {}
        
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # Obtener clientes
        clientes_ids = list(set([v['id_cliente'] for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        
        if clientes_ids:
            clientes = supabase.table('cliente') \
                .select('id, id_usuario') \
                .in_('id', clientes_ids) \
                .execute()
            for c in (clientes.data or []):
                clientes_map[c['id']] = c
        
        # Obtener usuarios
        usuarios_ids = list(set([c['id_usuario'] for c in clientes_map.values() if c.get('id_usuario')]))
        usuarios_map = {}
        
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        ordenes_resultado = []
        for orden in ordenes:
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            
            cliente_nombre = 'No registrado'
            cliente_id = vehiculo.get('id_cliente')
            if cliente_id and cliente_id in clientes_map:
                usuario_id = clientes_map[cliente_id].get('id_usuario')
                if usuario_id and usuario_id in usuarios_map:
                    cliente_nombre = usuarios_map[usuario_id].get('nombre', 'No registrado')
            
            ordenes_resultado.append({
                'id_orden': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_entrega': orden.get('fecha_salida'),
                'estado_global': orden['estado_global'],
                'vehiculo': {
                    'placa': vehiculo.get('placa', 'S/N'),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'cliente_nombre': cliente_nombre
                }
            })
        
        return jsonify({'success': True, 'ordenes': ordenes_resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando órdenes finalizadas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 5: DETALLE DE ORDEN
# =====================================================

@jefe_taller_ordenes_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def detalle_orden(current_user, id_orden):
    try:
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data[0]
        
        # Obtener vehículo
        vehiculo = {}
        if orden.get('id_vehiculo'):
            vehiculo_resp = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
                .eq('id', orden['id_vehiculo']) \
                .execute()
            if vehiculo_resp.data:
                vehiculo = vehiculo_resp.data[0]
        
        # Obtener cliente
        cliente_nombre = 'No registrado'
        if vehiculo.get('id_cliente'):
            cliente_resp = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', vehiculo['id_cliente']) \
                .execute()
            if cliente_resp.data and cliente_resp.data[0].get('id_usuario'):
                usuario_resp = supabase.table('usuario') \
                    .select('nombre') \
                    .eq('id', cliente_resp.data[0]['id_usuario']) \
                    .execute()
                if usuario_resp.data:
                    cliente_nombre = usuario_resp.data[0].get('nombre', 'No registrado')
        
        # Obtener técnicos
        tecnicos = []
        asignaciones_resp = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for a in (asignaciones_resp.data or []):
            if a.get('id_tecnico'):
                tecnico_resp = supabase.table('usuario') \
                    .select('id, nombre') \
                    .eq('id', a['id_tecnico']) \
                    .execute()
                if tecnico_resp.data:
                    tecnicos.append(tecnico_resp.data[0])
        
        # Obtener planificación
        planificacion = {}
        planif_resp = supabase.table('planificacion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        if planif_resp.data:
            planificacion = planif_resp.data[0]
        
        # Obtener recepción
        recepcion = {}
        recep_resp = supabase.table('recepcion') \
            .select('transcripcion_problema') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        if recep_resp.data:
            recepcion = recep_resp.data[0]
        
        detalle = {
            'id': orden['id'],
            'codigo_unico': orden['codigo_unico'],
            'fecha_ingreso': orden['fecha_ingreso'],
            'fecha_salida': orden.get('fecha_salida'),
            'estado_global': orden['estado_global'],
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'anio': vehiculo.get('anio'),
            'kilometraje': vehiculo.get('kilometraje'),
            'cliente': {'nombre': cliente_nombre, 'telefono': 'No registrado'},
            'tecnicos': tecnicos,
            'planificacion': planificacion,
            'transcripcion_problema': recepcion.get('transcripcion_problema', '')
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 6: ASIGNAR TÉCNICOS
# =====================================================

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
        
        # Limpiar caché
        cache.clear('tecnicos_list')
        cache.clear('ultimas_ordenes')
        
        return jsonify({'success': True, 'message': 'Técnicos asignados correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 7: PLANIFICAR TRABAJO
# =====================================================

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
        
        # Limpiar caché
        cache.clear('ultimas_ordenes')
        
        return jsonify({'success': True, 'message': 'Planificación guardada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando planificación: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 8: GUARDAR DIAGNÓSTICO INICIAL
# =====================================================

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
        if not diagnostico:
            return jsonify({'error': 'El diagnóstico es obligatorio'}), 400
        
        diagnostico_existente = supabase.table('diagnostigoinicial') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        now = datetime.datetime.now().isoformat()
        
        if diagnostico_existente.data:
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


# =====================================================
# ENDPOINT 9: CAMBIAR ESTADO DE ORDEN
# =====================================================

@jefe_taller_ordenes_bp.route('/cambiar-estado-orden', methods=['POST'])
@jefe_taller_required
def cambiar_estado_orden(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        nuevo_estado = data.get('estado_global')
        
        if not id_orden or not nuevo_estado:
            return jsonify({'error': 'ID de orden y estado requeridos'}), 400
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': nuevo_estado}) \
            .eq('id', id_orden) \
            .execute()
        
        # Limpiar caché
        cache.clear('ultimas_ordenes')
        
        return jsonify({'success': True, 'message': f'Orden cambiada a {nuevo_estado}'}), 200
        
    except Exception as e:
        logger.error(f"Error cambiando estado: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 10: ESTADO DE BAHÍAS
# =====================================================

@jefe_taller_ordenes_bp.route('/bahias/estado', methods=['GET'])
@jefe_taller_required
def get_estado_bahias(current_user):
    try:
        cached_data = cache.get('bahias_estado')
        if cached_data:
            return jsonify({'success': True, 'bahias': cached_data}), 200
        
        planificaciones_ocupadas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_real') \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        planificaciones_reservadas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_estimado, horas_estimadas') \
            .is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        ordenes_ids = set()
        for p in (planificaciones_ocupadas.data or []):
            if p.get('id_orden_trabajo'):
                ordenes_ids.add(p['id_orden_trabajo'])
        for p in (planificaciones_reservadas.data or []):
            if p.get('id_orden_trabajo'):
                ordenes_ids.add(p['id_orden_trabajo'])
        
        ordenes_codigos = {}
        if ordenes_ids:
            ordenes_data = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, estado_global') \
                .in_('id', list(ordenes_ids)) \
                .execute()
            for o in (ordenes_data.data or []):
                ordenes_codigos[o['id']] = o
        
        bahias_ocupadas = {}
        for p in (planificaciones_ocupadas.data or []):
            bahia = p.get('bahia_asignada')
            if bahia:
                orden_info = ordenes_codigos.get(p['id_orden_trabajo'], {})
                bahias_ocupadas[bahia] = {
                    'estado': 'ocupado',
                    'orden_codigo': orden_info.get('codigo_unico'),
                    'inicio_real': p.get('fecha_hora_inicio_real')
                }
        
        bahias_reservadas = {}
        for p in (planificaciones_reservadas.data or []):
            bahia = p.get('bahia_asignada')
            if bahia and bahia not in bahias_ocupadas:
                orden_info = ordenes_codigos.get(p['id_orden_trabajo'], {})
                bahias_reservadas[bahia] = {
                    'estado': 'reservado',
                    'orden_codigo': orden_info.get('codigo_unico'),
                    'fecha_inicio_estimado': p.get('fecha_hora_inicio_estimado'),
                    'horas_estimadas': p.get('horas_estimadas')
                }
        
        bahias = []
        for i in range(1, 13):
            if i in bahias_ocupadas:
                info = bahias_ocupadas[i]
                bahias.append({
                    'numero': i,
                    'estado': info['estado'],
                    'orden_codigo': info.get('orden_codigo'),
                    'inicio_real': info.get('inicio_real')
                })
            elif i in bahias_reservadas:
                info = bahias_reservadas[i]
                bahias.append({
                    'numero': i,
                    'estado': info['estado'],
                    'orden_codigo': info.get('orden_codigo'),
                    'fecha_inicio_estimado': info.get('fecha_inicio_estimado'),
                    'horas_estimadas': info.get('horas_estimadas')
                })
            else:
                bahias.append({
                    'numero': i,
                    'estado': 'libre',
                    'orden_codigo': None
                })
        
        cache.set('bahias_estado', bahias, ttl=10)
        
        return jsonify({'success': True, 'bahias': bahias}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estado de bahías: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 11: VERIFICAR DISPONIBILIDAD DE BAHÍA
# =====================================================

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


# =====================================================
# ENDPOINT 12: DIAGNÓSTICO PENDIENTE
# =====================================================

@jefe_taller_ordenes_bp.route('/diagnostico-pendiente/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def diagnostico_pendiente(current_user, id_orden):
    try:
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, estado, version, id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('estado', 'pendiente') \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico.data:
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


# =====================================================
# ENDPOINT 13: TRANSCRIBIR AUDIO
# =====================================================

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
            return jsonify({'error': 'Whisper no está disponible en el servidor'}), 500
        
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


# =====================================================
# ENDPOINT 14: SUBIR AUDIO A CLOUDINARY
# =====================================================

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


# =====================================================
# ENDPOINT 15: NOTIFICACIONES
# =====================================================

@jefe_taller_ordenes_bp.route('/notificaciones', methods=['GET'])
@jefe_taller_required
def obtener_notificaciones(current_user):
    try:
        resultado = supabase.table('notificacion') \
            .select('*') \
            .eq('id_usuario_destino', current_user['id']) \
            .order('fecha_envio', desc=True) \
            .limit(20) \
            .execute()
        
        return jsonify({'success': True, 'notificaciones': resultado.data or []}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo notificaciones: {str(e)}")
        return jsonify({'error': str(e)}), 500