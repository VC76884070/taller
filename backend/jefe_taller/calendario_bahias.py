# =====================================================
# CALENDARIO Y BAHÍAS - JEFE TALLER
# PLANIFICACIÓN OPERATIVA
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging

# Configurar logging
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
calendario_bahias_bp = Blueprint('calendario_bahias', __name__, url_prefix='/api/jefe-taller')

# Configuración desde config.py
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL
# =====================================================
def jefe_taller_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            
            if current_user.get('rol') != 'jefe_taller' and current_user.get('id_rol') != 3:
                logger.warning(f"Usuario {current_user.get('nombre')} intentó acceder sin permisos")
                return jsonify({'error': 'No autorizado para esta operación'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

# =====================================================
# ENDPOINTS - CALENDARIO Y BAHÍAS
# =====================================================

@calendario_bahias_bp.route('/ordenes-planificadas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_planificadas(current_user):
    """Obtener órdenes de trabajo con planificación para el calendario"""
    try:
        # PRIMERO: Obtener todas las planificaciones activas
        planificaciones = supabase.table('planificacion') \
            .select('id_orden_trabajo, bahia_asignada, horas_estimadas, fecha_hora_inicio_estimado, fecha_hora_fin_estimado, fecha_hora_inicio_real, fecha_hora_fin_real') \
            .not_.is_('fecha_hora_inicio_estimado', 'null') \
            .execute()
        
        if not planificaciones.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        # Obtener IDs de órdenes con planificación
        ordenes_ids = [p['id_orden_trabajo'] for p in planificaciones.data]
        
        if not ordenes_ids:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        # SEGUNDO: Obtener las órdenes completas
        ordenes_data = []
        for orden_id in ordenes_ids:
            resultado = supabase.table('ordentrabajo') \
                .select('''
                    id,
                    codigo_unico,
                    estado_global,
                    fecha_ingreso,
                    id_vehiculo,
                    id_jefe_operativo,
                    id_jefe_operativo_2
                ''') \
                .eq('id', orden_id) \
                .execute()
            
            if resultado.data:
                orden = resultado.data[0]
                
                # Obtener vehículo
                vehiculo = supabase.table('vehiculo') \
                    .select('placa, marca, modelo, anio, kilometraje, id_cliente') \
                    .eq('id', orden['id_vehiculo']) \
                    .execute()
                
                v = vehiculo.data[0] if vehiculo.data else {}
                
                # Obtener cliente
                cliente_nombre = 'No registrado'
                if v.get('id_cliente'):
                    cliente = supabase.table('cliente') \
                        .select('id_usuario') \
                        .eq('id', v['id_cliente']) \
                        .execute()
                    
                    if cliente.data and cliente.data[0].get('id_usuario'):
                        usuario = supabase.table('usuario') \
                            .select('nombre, contacto') \
                            .eq('id', cliente.data[0]['id_usuario']) \
                            .execute()
                        if usuario.data:
                            cliente_nombre = usuario.data[0].get('nombre', 'No registrado')
                
                # Obtener técnicos asignados
                tecnicos = []
                asignaciones = supabase.table('asignaciontecnico') \
                    .select('id_tecnico') \
                    .eq('id_orden_trabajo', orden['id']) \
                    .is_('fecha_hora_final', 'null') \
                    .execute()
                
                for asig in (asignaciones.data or []):
                    tecnico = supabase.table('usuario') \
                        .select('id, nombre') \
                        .eq('id', asig['id_tecnico']) \
                        .execute()
                    if tecnico.data:
                        tecnicos.append(tecnico.data[0])
                
                # Obtener la planificación correspondiente
                planif = next((p for p in planificaciones.data if p['id_orden_trabajo'] == orden['id']), {})
                
                ordenes_data.append({
                    'id': orden['id'],
                    'codigo_unico': orden['codigo_unico'],
                    'estado_global': orden['estado_global'],
                    'fecha_ingreso': orden['fecha_ingreso'],
                    'cliente_nombre': cliente_nombre,
                    'placa': v.get('placa', ''),
                    'marca': v.get('marca', ''),
                    'modelo': v.get('modelo', ''),
                    'anio': v.get('anio'),
                    'kilometraje': v.get('kilometraje'),
                    'bahia_asignada': planif.get('bahia_asignada'),
                    'horas_estimadas': planif.get('horas_estimadas'),
                    'fecha_hora_inicio_estimado': planif.get('fecha_hora_inicio_estimado'),
                    'fecha_hora_fin_estimado': planif.get('fecha_hora_fin_estimado'),
                    'fecha_hora_inicio_real': planif.get('fecha_hora_inicio_real'),
                    'fecha_hora_fin_real': planif.get('fecha_hora_fin_real'),
                    'tecnicos': tecnicos,
                    'cantidad_tecnicos': len(tecnicos)
                })
        
        logger.info(f"📅 {len(ordenes_data)} órdenes planificadas obtenidas")
        return jsonify({'success': True, 'ordenes': ordenes_data}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes planificadas: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    

@calendario_bahias_bp.route('/bahias', methods=['GET'])
@jefe_taller_required
def listar_estado_bahias(current_user):
    """Listar el estado actual de las 12 bahías del taller"""
    try:
        # Obtener planificaciones activas (con inicio real pero sin fin real)
        planificaciones_activas = supabase.table('planificacion') \
            .select('''
                id,
                bahia_asignada,
                id_orden_trabajo,
                ordentrabajo!inner (
                    codigo_unico,
                    estado_global
                )
            ''') \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        # Mapear bahías ocupadas
        bahias_ocupadas = {}
        for p in (planificaciones_activas.data or []):
            bahia_num = p.get('bahia_asignada')
            if bahia_num:
                orden = p.get('ordentrabajo', {})
                bahias_ocupadas[bahia_num] = {
                    'codigo': orden.get('codigo_unico') if orden else None,
                    'estado_orden': orden.get('estado_global') if orden else None
                }
        
        # Generar lista de 12 bahías
        bahias = []
        for i in range(1, 13):
            if i in bahias_ocupadas:
                bahias.append({
                    'numero': i,
                    'estado': 'ocupado',
                    'orden_codigo': bahias_ocupadas[i]['codigo'],
                    'orden_estado': bahias_ocupadas[i]['estado_orden']
                })
            else:
                bahias.append({
                    'numero': i,
                    'estado': 'libre',
                    'orden_codigo': None,
                    'orden_estado': None
                })
        
        ocupadas_count = len([b for b in bahias if b['estado'] == 'ocupado'])
        
        return jsonify({
            'success': True,
            'bahias': bahias,
            'resumen': {
                'total': 12,
                'ocupadas': ocupadas_count,
                'libres': 12 - ocupadas_count
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error listando estado de bahías: {str(e)}")
        return jsonify({'error': str(e)}), 500


@calendario_bahias_bp.route('/tecnicos-carga', methods=['GET'])
@jefe_taller_required
def obtener_carga_tecnicos(current_user):
    """Obtener la carga de trabajo actual de cada técnico"""
    try:
        MAX_ORDENES_POR_TECNICO = 2
        
        resultado = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .eq('id_rol', 4) \
            .execute()
        
        tecnicos = []
        for tecnico in (resultado.data or []):
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo') \
                .eq('id_tecnico', tecnico['id']) \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            ordenes_activas = len(asignaciones.data) if asignaciones.data else 0
            porcentaje = (ordenes_activas / MAX_ORDENES_POR_TECNICO) * 100
            
            tecnicos.append({
                'id': tecnico['id'],
                'nombre': tecnico['nombre'],
                'contacto': tecnico.get('contacto', ''),
                'email': tecnico.get('email', ''),
                'ordenes_activas': ordenes_activas,
                'max_vehiculos': MAX_ORDENES_POR_TECNICO,
                'porcentaje_carga': round(porcentaje, 1)
            })
        
        tecnicos.sort(key=lambda x: x['ordenes_activas'], reverse=True)
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo carga de técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@calendario_bahias_bp.route('/bahia/<int:numero_bahia>/detalle', methods=['GET'])
@jefe_taller_required
def detalle_bahia(current_user, numero_bahia):
    """Obtener detalle de una bahía específica"""
    try:
        if numero_bahia < 1 or numero_bahia > 12:
            return jsonify({'error': 'Número de bahía inválido (1-12)'}), 400
        
        planificacion = supabase.table('planificacion') \
            .select('''
                id,
                bahia_asignada,
                horas_estimadas,
                fecha_hora_inicio_estimado,
                fecha_hora_fin_estimado,
                fecha_hora_inicio_real,
                fecha_hora_fin_real,
                id_orden_trabajo,
                ordentrabajo!inner (
                    id,
                    codigo_unico,
                    estado_global,
                    fecha_ingreso,
                    vehiculo!inner (
                        placa,
                        marca,
                        modelo,
                        cliente!inner (
                            id,
                            usuario!inner (
                                id,
                                nombre,
                                contacto
                            )
                        )
                    )
                )
            ''') \
            .eq('bahia_asignada', numero_bahia) \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        orden_asignada = None
        if planificacion.data and len(planificacion.data) > 0:
            p = planificacion.data[0]
            orden = p.get('ordentrabajo', {})
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario_cliente = cliente.get('usuario', {})
            
            orden_asignada = {
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': orden.get('fecha_ingreso'),
                'vehiculo': {
                    'placa': vehiculo.get('placa', ''),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', '')
                },
                'cliente': {
                    'nombre': usuario_cliente.get('nombre', 'No registrado'),
                    'contacto': usuario_cliente.get('contacto', '')
                },
                'horas_estimadas': p.get('horas_estimadas'),
                'fecha_hora_inicio_estimado': p.get('fecha_hora_inicio_estimado'),
                'fecha_hora_fin_estimado': p.get('fecha_hora_fin_estimado'),
                'fecha_hora_inicio_real': p.get('fecha_hora_inicio_real')
            }
        
        return jsonify({
            'success': True,
            'bahia': {
                'numero': numero_bahia,
                'tiene_orden': orden_asignada is not None,
                'orden': orden_asignada
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de bahía {numero_bahia}: {str(e)}")
        return jsonify({'error': str(e)}), 500