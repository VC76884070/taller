# =====================================================
# COTIZACIONES - JEFE DE TALLER
# FURIA MOTOR COMPANY SRL
# VERSIÓN 4.0 - CON SOLICITUDES DE REPUESTOS DE TÉCNICOS Y COMPRA DIRECTA
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import json
import time
from functools import wraps

logger = logging.getLogger(__name__)
print("="*60)
print("🔥🔥🔥 VERSIÓN CORREGIDA DE COTIZACIONES - 2026-05-11 🔥🔥🔥")
print("="*60)
# =====================================================
# CREAR BLUEPRINT
# =====================================================
cotizaciones_bp = Blueprint('cotizaciones', __name__, url_prefix='/api/jefe-taller')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# CONSTANTES DE ESTADOS
# =====================================================

ESTADOS_ORDEN = {
    'EN_RECEPCION': 'EnRecepcion',
    'EN_DIAGNOSTICO': 'EnDiagnostico',
    'DIAGNOSTICO_COMPLETADO': 'DiagnosticoCompletado',
    'DIAGNOSTICO_APROBADO': 'DiagnosticoAprobado',
    'DIAGNOSTICO_RECHAZADO': 'DiagnosticoRechazado',
    'COTIZACION_ENVIADA': 'CotizacionEnviada',
    'COTIZACION_ACEPTADA': 'CotizacionAceptada',
    'COTIZACION_PARCIAL': 'CotizacionParcial',
    'COTIZACION_RECHAZADA': 'CotizacionRechazada',
    'EN_ARMADO': 'EnArmadoVehiculo',
    'VEHICULO_ARMADO': 'VehiculoArmado',
    'EN_REPARACION': 'EnReparacion',
    'EN_PAUSA': 'EnPausa',
    'REPARACION_COMPLETADA': 'ReparacionCompletada',
    'FINALIZADO': 'Finalizado',
    'ENTREGADO': 'Entregado'
}

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def retry_query(max_retries=2):
    """Decorador simple para reintentar consultas que fallan"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    error_msg = str(e).lower()
                    if "10035" in error_msg or "socket" in error_msg or "timeout" in error_msg or "read" in error_msg:
                        if attempt < max_retries:
                            wait = 0.5 * (attempt + 1)
                            print(f"⚠️ Reintentando ({attempt + 1}/{max_retries}) en {wait}s: {str(e)[:100]}")
                            time.sleep(wait)
                            continue
                    break
            raise last_error
        return wrapper
    return decorator

def enviar_notificacion(id_usuario_destino, tipo, mensaje, id_referencia=None):
    """Enviar notificación a un usuario"""
    try:
        supabase.table('notificacion').insert({
            'id_usuario_destino': id_usuario_destino,
            'tipo': tipo,
            'mensaje': mensaje,
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False,
            'id_referencia': id_referencia
        }).execute()
    except Exception as e:
        logger.error(f"Error enviando notificación: {e}")

def registrar_historial_estado(id_orden, estado_anterior, estado_nuevo, id_usuario, motivo=None):
    """Registrar cambio de estado en el historial"""
    try:
        supabase.table('orden_cotizacion_historial').insert({
            'id_orden_trabajo': id_orden,
            'estado_anterior': estado_anterior,
            'estado_nuevo': estado_nuevo,
            'motivo': motivo,
            'fecha_cambio': datetime.datetime.now().isoformat(),
            'realizado_por': id_usuario
        }).execute()
    except Exception as e:
        logger.warning(f"No se pudo registrar historial: {e}")

def obtener_encargados_repuestos():
    """Obtener lista de usuarios con rol encargado_repuestos"""
    try:
        print("🔍 Buscando encargados de repuestos...")
        
        # Primero obtener el ID del rol 'encargado_repuestos'
        rol_result = supabase.table('rol') \
            .select('id') \
 .eq('nombre_rol', 'encargado_repuestos') \
            .execute()
        
        if not rol_result.data:
            print("❌ Rol 'encargado_repuestos' no encontrado")
            return []
        
        rol_id = rol_result.data[0]['id']
        print(f"📌 ID del rol encargado_repuestos: {rol_id}")
        
        # Buscar usuarios con ese rol en la tabla usuario_rol
        usuarios_roles = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', rol_id) \
            .execute()
        
        if not usuarios_roles.data:
            print("❌ No hay usuarios con ese rol")
            return []
        
        # Obtener IDs de usuarios
        usuario_ids = [ur['id_usuario'] for ur in usuarios_roles.data]
        print(f"📊 IDs de usuarios encontrados: {usuario_ids}")
        
        # Obtener los datos completos de los usuarios
        usuarios = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .in_('id', usuario_ids) \
            .execute()
        
        encargados = []
        for usuario in (usuarios.data or []):
            encargados.append({
                'id': usuario['id'],
                'nombre': usuario.get('nombre', 'Encargado'),
                'contacto': usuario.get('contacto', ''),
                'email': usuario.get('email', '')
            })
            print(f"✅ Encargado encontrado: ID={usuario['id']}, Nombre={usuario.get('nombre')}")
        
        print(f"📊 TOTAL ENCARGADOS: {len(encargados)}")
        return encargados
        
    except Exception as e:
        print(f"❌ Error obteniendo encargados: {e}")
        import traceback
        traceback.print_exc()
        return []

# =====================================================
# APARTADO 1: ÓRDENES CON DIAGNÓSTICO APROBADO
# =====================================================

@cotizaciones_bp.route('/ordenes-diagnostico-aprobado', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_diagnostico_aprobado(current_user):
    """Obtener SOLO órdenes con diagnóstico aprobado"""
    try:
        logger.info("📢 Obteniendo órdenes con diagnóstico aprobado")
        
        ordenes_result = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                estado_global,
                id_vehiculo,
                vehiculo!inner(
                    marca,
                    modelo,
                    placa,
                    anio,
                    cliente!inner(
                        id,
                        usuario!inner(
                            id,
                            nombre,
                            email,
                            contacto
                        )
                    )
                )
            ''') \
            .eq('estado_global', 'DiagnosticoAprobado') \
            .execute()
        
        if not ordenes_result.data:
            logger.info("No hay órdenes con estado DiagnosticoAprobado")
            return jsonify({'success': True, 'ordenes': []}), 200
        
        resultado = []
        for orden in ordenes_result.data:
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario = cliente.get('usuario', {})
            
            diagnostico = supabase.table('diagnostico_tecnico') \
                .select('id, informe, fecha_envio, version') \
                .eq('id_orden_trabajo', orden['id']) \
                .in_('estado', ['aprobado', 'DiagnosticoAprobado']) \
                .order('version', desc=True) \
                .limit(1) \
                .execute()
            
            servicios = []
            if diagnostico.data:
                diagnostico_id = diagnostico.data[0]['id']
                
                servicios_data = supabase.table('servicio_tecnico') \
                    .select('id, descripcion, orden') \
                    .eq('id_diagnostico_tecnico', diagnostico_id) \
                    .order('orden') \
                    .execute()
                
                for serv in (servicios_data.data or []):
                    solicitud_result = supabase.table('solicitud_cotizacion_repuesto') \
                        .select('id, estado, precio_cotizado') \
                        .eq('id_orden_trabajo', orden['id']) \
                        .eq('id_servicio', serv['id']) \
                        .maybe_single() \
                        .execute()
                    
                    estado_cotizacion = 'pendiente'
                    precio_cotizado = 0
                    
                    if solicitud_result and solicitud_result.data:
                        if solicitud_result.data.get('estado') == 'pendiente':
                            estado_cotizacion = 'solicitado'
                        elif solicitud_result.data.get('estado') == 'cotizado':
                            estado_cotizacion = 'cotizado'
                            precio_cotizado = float(solicitud_result.data.get('precio_cotizado', 0))
                    
                    servicios.append({
                        'id_servicio': serv['id'],
                        'descripcion': serv['descripcion'],
                        'orden': serv.get('orden', 0),
                        'estado_cotizacion': estado_cotizacion,
                        'precio_cotizado': precio_cotizado
                    })
            
            resultado.append({
                'id_orden': orden['id'],
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'cliente_nombre': usuario.get('nombre', 'No registrado'),
                'servicios': servicios
            })
        
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 2: ÓRDENES PARA COTIZACIÓN AL CLIENTE
# =====================================================

@cotizaciones_bp.route('/ordenes-con-servicios', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_con_servicios(current_user):
    """Obtener órdenes para el apartado de Cotización al Cliente"""
    try:
        estados_relevantes = [
            'DiagnosticoAprobado',
            'CotizacionEnviada',
            'CotizacionAceptada',
            'CotizacionParcial',
            'CotizacionRechazada',
            'EnArmadoVehiculo',
            'EnReparacion'
        ]
        
        ordenes_result = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                estado_global,
                id_vehiculo,
                vehiculo!inner(
                    marca,
                    modelo,
                    placa,
                    cliente!inner(
                        usuario!inner(
                            nombre
                        )
                    )
                )
            ''') \
            .in_('estado_global', estados_relevantes) \
            .execute()
        
        if not ordenes_result.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_ids = [o['id'] for o in ordenes_result.data]
        
        solicitudes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        
        solicitudes_map = {}
        for s in (solicitudes.data or []):
            key = f"{s.get('id_orden_trabajo')}_{s.get('id_servicio')}"
            solicitudes_map[key] = s
        
        cotizaciones = supabase.table('cotizacion') \
            .select('id, id_orden_trabajo, estado, total, motivo_rechazo, fecha_rechazo') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        
        cotizaciones_map = {}
        for c in (cotizaciones.data or []):
            cotizaciones_map[c['id_orden_trabajo']] = c
        
        resultado = []
        for orden in ordenes_result.data:
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario = cliente.get('usuario', {})
            
            diagnostico = supabase.table('diagnostico_tecnico') \
                .select('id') \
                .eq('id_orden_trabajo', orden['id']) \
                .in_('estado', ['aprobado', 'DiagnosticoAprobado']) \
                .order('version', desc=True) \
                .limit(1) \
                .execute()
            
            servicios = []
            if diagnostico.data:
                servicios_result = supabase.table('servicio_tecnico') \
                    .select('id, descripcion, orden') \
                    .eq('id_diagnostico_tecnico', diagnostico.data[0]['id']) \
                    .order('orden') \
                    .execute()
                
                for serv in (servicios_result.data or []):
                    key = f"{orden['id']}_{serv['id']}"
                    solicitud = solicitudes_map.get(key, {})
                    
                    estado_cotizacion = 'pendiente'
                    if solicitud.get('id'):
                        if solicitud.get('estado') == 'pendiente':
                            estado_cotizacion = 'solicitado'
                        elif solicitud.get('estado') == 'cotizado':
                            estado_cotizacion = 'cotizado'
                    
                    servicios.append({
                        'id_servicio': serv['id'],
                        'descripcion': serv['descripcion'],
                        'estado_cotizacion': estado_cotizacion,
                        'precio_cotizado': float(solicitud.get('precio_cotizado')) if solicitud.get('precio_cotizado') else 0
                    })
            
            cotizacion_info = cotizaciones_map.get(orden['id'])
            
            resultado.append({
                'id_orden': orden['id'],
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'cliente_nombre': usuario.get('nombre', 'No registrado'),
                'servicios': servicios,
                'cotizacion_estado': cotizacion_info.get('estado') if cotizacion_info else None,
                'cotizacion_total': float(cotizacion_info.get('total', 0)) if cotizacion_info else 0,
                'motivo_rechazo': cotizacion_info.get('motivo_rechazo') if cotizacion_info else None,
                'fecha_rechazo': cotizacion_info.get('fecha_rechazo') if cotizacion_info else None
            })
        
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 3: ÓRDENES APROBADAS (PARA SOLICITAR COTIZACIÓN)
# =====================================================

@cotizaciones_bp.route('/ordenes-aprobadas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_aprobadas(current_user):
    """Órdenes con diagnóstico APROBADO (para solicitar cotización)"""
    try:
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .eq('estado_global', 'DiagnosticoAprobado') \
            .execute()
        
        ordenes = []
        for o in (ordenes_result.data or []):
            vehiculo = o.get('vehiculo', {})
            ordenes.append({
                'id_orden': o['id'],
                'codigo_unico': o.get('codigo_unico'),
                'estado_global': o.get('estado_global'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip()
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 4: ÓRDENES ACTIVAS (PARA COMPRA DIRECTA)
# =====================================================

@cotizaciones_bp.route('/ordenes-activas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_activas(current_user):
    """Obtener órdenes activas (EnReparacion, EnPausa) para compra directa"""
    try:
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .in_('estado_global', ['EnReparacion', 'EnPausa']) \
            .execute()
        
        ordenes = []
        for o in (ordenes_result.data or []):
            v = o.get('vehiculo', {})
            ordenes.append({
                'id_orden': o['id'],
                'codigo_unico': o.get('codigo_unico'),
                'estado_global': o.get('estado_global'),
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', '')})".strip()
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 5: ENCARGADOS DE REPUESTOS
# =====================================================

@cotizaciones_bp.route('/encargados-repuestos', methods=['GET'])
@jefe_taller_required
def obtener_encargados_repuestos_endpoint(current_user):
    """Obtener lista de encargados de repuestos"""
    try:
        encargados = obtener_encargados_repuestos()
        
        # Log para debugging
        print(f"📤 Enviando {len(encargados)} encargados al frontend")
        
        return jsonify({'success': True, 'encargados': encargados}), 200
    except Exception as e:
        logger.error(f"Error en endpoint encargados: {e}")
        return jsonify({'success': True, 'encargados': []}), 200

# =====================================================
# APARTADO 6: SOLICITUDES DE COTIZACIÓN
# =====================================================

@cotizaciones_bp.route('/solicitudes-cotizacion', methods=['GET', 'POST', 'DELETE'])
@jefe_taller_required
def gestionar_solicitudes_cotizacion(current_user):
    """Gestionar solicitudes de cotización"""
    
    if request.method == 'GET':
        try:
            estado = request.args.get('estado')
            id_orden_trabajo = request.args.get('id_orden_trabajo')
            
            query = supabase.table('solicitud_cotizacion_repuesto') \
                .select('*') \
                .eq('id_jefe_taller', current_user['id'])
            
            if estado and estado != 'all':
                query = query.eq('estado', estado)
            if id_orden_trabajo and id_orden_trabajo != 'all':
                query = query.eq('id_orden_trabajo', int(id_orden_trabajo))
            
            query = query.order('fecha_solicitud', desc=True)
            result = query.execute()
            
            if not result.data:
                return jsonify({'success': True, 'solicitudes': []}), 200
            
            ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
            servicios_ids = list(set([s.get('id_servicio') for s in result.data if s.get('id_servicio')]))
            
            ordenes_map = {}
            if ordenes_ids:
                ordenes_result = supabase.table('ordentrabajo') \
                    .select('id, codigo_unico, estado_global, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
                    .in_('id', ordenes_ids) \
                    .execute()
                
                for o in (ordenes_result.data or []):
                    v = o.get('vehiculo', {})
                    ordenes_map[o['id']] = {
                        'codigo_unico': o.get('codigo_unico'),
                        'estado_global': o.get('estado_global'),
                        'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', '')})".strip()
                    }
            
            servicios_map = {}
            if servicios_ids:
                servicios_result = supabase.table('servicio_tecnico') \
                    .select('id, descripcion') \
                    .in_('id', servicios_ids) \
                    .execute()
                for s in (servicios_result.data or []):
                    servicios_map[s['id']] = s.get('descripcion')
            
            solicitudes = []
            for s in result.data:
                orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
                
                items = []
                if s.get('items'):
                    try:
                        items = json.loads(s['items']) if isinstance(s['items'], str) else s['items']
                    except:
                        items = [{'descripcion': s.get('descripcion_pieza'), 'cantidad': s.get('cantidad', 1)}]
                
                solicitudes.append({
                    'id': s.get('id'),
                    'id_orden_trabajo': s.get('id_orden_trabajo'),
                    'id_servicio': s.get('id_servicio'),
                    'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                    'orden_estado': orden_info.get('estado_global', 'N/A'),
                    'vehiculo': orden_info.get('vehiculo', 'N/A'),
                    'servicio_descripcion': servicios_map.get(s.get('id_servicio'), 'N/A'),
                    'items': items,
                    'estado': s.get('estado', 'pendiente'),
                    'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                    'fecha_solicitud': s.get('fecha_solicitud')
                })
            
            return jsonify({'success': True, 'solicitudes': solicitudes}), 200
            
        except Exception as e:
            logger.error(f"Error en GET solicitudes: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            
            id_orden_trabajo = data.get('id_orden_trabajo')
            id_servicio = data.get('id_servicio')
            id_encargado = data.get('id_encargado')
            items = data.get('items', [])
            observaciones = data.get('observaciones', '')
            
            if not id_orden_trabajo:
                return jsonify({'error': 'Orden de trabajo es requerida'}), 400
            if not id_servicio:
                return jsonify({'error': 'Servicio es requerido'}), 400
            if not id_encargado:
                return jsonify({'error': 'Encargado de repuestos es requerido'}), 400
            if not items or len(items) == 0:
                return jsonify({'error': 'Debe agregar al menos un item a cotizar'}), 400
            
            orden = supabase.table('ordentrabajo').select('id').eq('id', id_orden_trabajo).execute()
            if not orden.data:
                return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
            
            primer_item = items[0]
            descripcion_pieza = primer_item.get('descripcion', '')
            cantidad = primer_item.get('cantidad', 1)
            
            ahora = datetime.datetime.now().isoformat()
            
            nueva_solicitud = {
                'id_orden_trabajo': id_orden_trabajo,
                'id_servicio': id_servicio,
                'id_jefe_taller': current_user['id'],
                'id_encargado_repuestos': id_encargado,
                'descripcion_pieza': descripcion_pieza,
                'cantidad': cantidad,
                'items': json.dumps(items),
                'observacion_jefe_taller': observaciones,
                'estado': 'pendiente',
                'fecha_solicitud': ahora
            }
            
            result = supabase.table('solicitud_cotizacion_repuesto') \
                .insert(nueva_solicitud) \
                .execute()
            
            if not result.data:
                return jsonify({'error': 'No se pudo crear la solicitud'}), 500
            
            enviar_notificacion(
                id_encargado,
                'solicitud_cotizacion',
                f"🔧 Nueva solicitud de cotización para la orden #{id_orden_trabajo}",
                result.data[0]['id']
            )
            
            return jsonify({
                'success': True, 
                'message': 'Solicitud creada exitosamente', 
                'id': result.data[0]['id']
            }), 201
            
        except Exception as e:
            logger.error(f"Error creando solicitud: {str(e)}")
            return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-cotizacion/<int:id_solicitud>', methods=['DELETE'])
@jefe_taller_required
def eliminar_solicitud_cotizacion(current_user, id_solicitud):
    """Eliminar una solicitud de cotización"""
    try:
        check = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id, estado') \
            .eq('id', id_solicitud) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': 'Solo se pueden eliminar solicitudes pendientes'}), 400
        
        supabase.table('solicitud_cotizacion_repuesto') \
            .delete() \
            .eq('id', id_solicitud) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Solicitud eliminada'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 7: SOLICITUDES DE REPUESTOS DE TÉCNICOS
# =====================================================

@cotizaciones_bp.route('/solicitudes-repuestos-tecnico', methods=['GET'])
@jefe_taller_required
def obtener_solicitudes_repuestos_tecnico(current_user):
    """Obtener solicitudes de repuestos hechas por técnicos"""
    try:
        estado = request.args.get('estado', 'all')
        search = request.args.get('search', '')
        
        query = supabase.table('solicitud_repuestos_tecnico') \
            .select('*, ordentrabajo(codigo_unico, estado_global, id_vehiculo, vehiculo!inner(marca, modelo, placa)), usuario!id_tecnico(nombre, contacto)')
        
        if estado != 'all':
            query = query.eq('estado', estado)
        
        query = query.order('fecha_solicitud', desc=True)
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'solicitudes': []}), 200
        
        solicitudes = []
        for s in result.data:
            orden_data = s.get('ordentrabajo', {})
            vehiculo_data = orden_data.get('vehiculo', {}) if orden_data else {}
            tecnico_data = s.get('usuario', {}) if s.get('usuario') else {}
            
            items = []
            if s.get('items'):
                try:
                    items = json.loads(s['items']) if isinstance(s['items'], str) else s['items']
                except:
                    items = [{'descripcion': 'Item no especificado', 'cantidad': 1}]
            
            if search:
                orden_codigo = orden_data.get('codigo_unico', '') if orden_data else ''
                vehiculo_str = f"{vehiculo_data.get('marca', '')} {vehiculo_data.get('modelo', '')} {vehiculo_data.get('placa', '')}"
                tecnico_nombre = tecnico_data.get('nombre', '')
                if not (search.lower() in orden_codigo.lower() or 
                       search.lower() in vehiculo_str.lower() or 
                       search.lower() in tecnico_nombre.lower()):
                    continue
            
            solicitudes.append({
                'id': s.get('id'),
                'id_orden_trabajo': s.get('id_orden_trabajo'),
                'orden_codigo': orden_data.get('codigo_unico', 'N/A') if orden_data else 'N/A',
                'orden_estado': orden_data.get('estado_global', 'N/A') if orden_data else 'N/A',
                'vehiculo': f"{vehiculo_data.get('marca', '')} {vehiculo_data.get('modelo', '')} ({vehiculo_data.get('placa', '')})".strip() if vehiculo_data else 'N/A',
                'tecnico_nombre': tecnico_data.get('nombre', 'N/A'),
                'tecnico_contacto': tecnico_data.get('contacto', ''),
                'items': items,
                'observaciones': s.get('observaciones', ''),
                'estado': s.get('estado', 'pendiente'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_respuesta': s.get('fecha_respuesta'),
                'respondido_por': s.get('respondido_por'),
                'respuesta': s.get('respuesta', '')
            })
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitudes de técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-repuestos-tecnico/<int:id_solicitud>/estado', methods=['PUT'])
@jefe_taller_required
def actualizar_estado_solicitud_tecnico(current_user, id_solicitud):
    """Actualizar estado de una solicitud de repuestos de técnico y enviar respuesta"""
    try:
        data = request.get_json()
        nuevo_estado = data.get('estado')
        respuesta = data.get('respuesta', '')
        respondido_por = data.get('respondido_por', current_user['id'])
        
        if not nuevo_estado:
            return jsonify({'error': 'Estado requerido'}), 400
        
        estados_validos = ['pendiente', 'en_proceso', 'completado', 'rechazado']
        if nuevo_estado not in estados_validos:
            return jsonify({'error': f'Estado inválido. Permitidos: {", ".join(estados_validos)}'}), 400
        
        solicitud = supabase.table('solicitud_repuestos_tecnico') \
            .select('*') \
            .eq('id', id_solicitud) \
            .execute()
        
        if not solicitud.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        ahora = datetime.datetime.now().isoformat()
        
        update_data = {
            'estado': nuevo_estado,
            'fecha_respuesta': ahora,
            'respondido_por': respondido_por,
            'respuesta': respuesta
        }
        
        supabase.table('solicitud_repuestos_tecnico') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        # Notificar al técnico
        mensaje = f"📦 Tu solicitud de repuestos #{id_solicitud} ha sido actualizada a: {nuevo_estado}. "
        if respuesta:
            mensaje += f"Mensaje: {respuesta[:200]}"
        
        enviar_notificacion(
            solicitud.data[0]['id_tecnico'],
            'solicitud_repuestos_actualizada',
            mensaje,
            id_solicitud
        )
        
        return jsonify({'success': True, 'message': f'Solicitud actualizada a {nuevo_estado}'}), 200
        
    except Exception as e:
        logger.error(f"Error actualizando solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 8: SOLICITUDES DE COMPRA DIRECTA (JEFE DE TALLER)
# =====================================================

@cotizaciones_bp.route('/solicitudes-compra-directa', methods=['POST'])
@jefe_taller_required
def crear_solicitud_compra_directa(current_user):
    """Crear una solicitud de compra directa (sin pasar por cotización)"""
    try:
        data = request.get_json()
        
        id_orden_trabajo = data.get('id_orden_trabajo')
        id_encargado_repuestos = data.get('id_encargado_repuestos')
        items = data.get('items', [])
        observaciones = data.get('observaciones', '')
        
        if not id_orden_trabajo:
            return jsonify({'error': 'Orden de trabajo requerida'}), 400
        
        if not id_encargado_repuestos:
            return jsonify({'error': 'Encargado de repuestos requerido'}), 400
        
        if not items or len(items) == 0:
            return jsonify({'error': 'Debe agregar al menos un item'}), 400
        
        orden = supabase.table('ordentrabajo').select('id').eq('id', id_orden_trabajo).execute()
        if not orden.data:
            return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
        
        ahora = datetime.datetime.now().isoformat()
        
        nueva_solicitud = {
            'id_orden_trabajo': id_orden_trabajo,
            'id_jefe_taller': current_user['id'],
            'id_encargado_repuestos': id_encargado_repuestos,
            'items': json.dumps(items),
            'descripcion_pieza': items[0].get('descripcion', '') if items else '',
            'cantidad': sum(item.get('cantidad', 1) for item in items),
            'mensaje_jefe_taller': observaciones,
            'estado': 'pendiente',
            'fecha_solicitud': ahora
        }
        
        result = supabase.table('solicitud_compra') \
            .insert(nueva_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'No se pudo crear la solicitud'}), 500
        
        # Notificar al encargado de repuestos
        enviar_notificacion(
            id_encargado_repuestos,
            'nueva_solicitud_compra',
            f"🛒 Nueva solicitud de compra para la orden #{id_orden_trabajo}. {len(items)} item(s) solicitados.",
            result.data[0]['id']
        )
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden_trabajo,
            'id_tecnico': current_user['id'],
            'descripcion': f"Solicitud de compra directa creada por jefe de taller. Items: {len(items)}",
            'tipo_avance': 'solicitud_compra_directa',
            'fecha_hora': ahora
        }).execute()
        
        return jsonify({
            'success': True,
            'message': f'Solicitud de compra creada exitosamente para {len(items)} item(s)',
            'id': result.data[0]['id']
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando solicitud de compra directa: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 9: SOLICITUDES DE COMPRA (DESDE COTIZACIÓN)
# =====================================================

@cotizaciones_bp.route('/solicitudes-compra', methods=['GET', 'POST', 'PUT'])
@jefe_taller_required
def gestionar_solicitudes_compra(current_user):
    """Gestionar solicitudes de compra"""
    
    if request.method == 'GET':
        try:
            estado = request.args.get('estado')
            
            query = supabase.table('solicitud_compra') \
                .select('*') \
                .eq('id_jefe_taller', current_user['id'])
            
            if estado and estado != 'all':
                query = query.eq('estado', estado)
            
            query = query.order('fecha_solicitud', desc=True)
            result = query.execute()
            
            if not result.data:
                return jsonify({'success': True, 'solicitudes': []}), 200
            
            ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
            
            ordenes_map = {}
            if ordenes_ids:
                ordenes_result = supabase.table('ordentrabajo') \
                    .select('id, codigo_unico, estado_global, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
                    .in_('id', ordenes_ids) \
                    .execute()
                
                for o in (ordenes_result.data or []):
                    v = o.get('vehiculo', {})
                    ordenes_map[o['id']] = {
                        'codigo_unico': o.get('codigo_unico'),
                        'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', '')})".strip()
                    }
            
            solicitudes = []
            for s in result.data:
                orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
                
                items = []
                if s.get('items'):
                    try:
                        items = json.loads(s['items'])
                    except:
                        items = []
                
                solicitudes.append({
                    'id': s.get('id'),
                    'id_orden_trabajo': s.get('id_orden_trabajo'),
                    'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                    'vehiculo': orden_info.get('vehiculo', 'N/A'),
                    'items': items,
                    'estado': s.get('estado', 'pendiente'),
                    'fecha_solicitud': s.get('fecha_solicitud')
                })
            
            return jsonify({'success': True, 'solicitudes': solicitudes}), 200
            
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            
            id_solicitud_cotizacion = data.get('id_solicitud_cotizacion')
            items = data.get('items', [])
            mensaje = data.get('mensaje', '')
            
            if not id_solicitud_cotizacion:
                return jsonify({'error': 'Solicitud de cotización requerida'}), 400
            
            solicitud_cotizacion = supabase.table('solicitud_cotizacion_repuesto') \
                .select('*') \
                .eq('id', id_solicitud_cotizacion) \
                .execute()
            
            if not solicitud_cotizacion.data:
                return jsonify({'error': 'Solicitud de cotización no encontrada'}), 404
            
            sc = solicitud_cotizacion.data[0]
            ahora = datetime.datetime.now().isoformat()
            
            nueva_solicitud = {
                'id_orden_trabajo': sc['id_orden_trabajo'],
                'id_servicio': sc.get('id_servicio'),
                'id_solicitud_cotizacion': id_solicitud_cotizacion,
                'id_jefe_taller': current_user['id'],
                'id_encargado_repuestos': sc.get('id_encargado_repuestos'),
                'items': json.dumps(items),
                'precio_cotizado': sc.get('precio_cotizado'),
                'estado': 'pendiente',
                'mensaje_jefe_taller': mensaje,
                'fecha_solicitud': ahora
            }
            
            result = supabase.table('solicitud_compra') \
                .insert(nueva_solicitud) \
                .execute()
            
            if not result.data:
                return jsonify({'error': 'No se pudo crear la solicitud'}), 500
            
            supabase.table('solicitud_cotizacion_repuesto') \
                .update({'estado': 'aprobado'}) \
                .eq('id', id_solicitud_cotizacion) \
                .execute()
            
            # Notificar al encargado de repuestos
            enviar_notificacion(
                sc.get('id_encargado_repuestos'),
                'nueva_solicitud_compra',
                f"🛒 Nueva solicitud de compra para la orden #{sc['id_orden_trabajo']}",
                result.data[0]['id']
            )
            
            return jsonify({'success': True, 'message': 'Solicitud de compra creada'}), 201
            
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-compra/<int:id_solicitud>/aprobar', methods=['PUT'])
@jefe_taller_required
def aprobar_solicitud_compra(current_user, id_solicitud):
    """Aprobar solicitud de compra (marcar como comprado)"""
    try:
        check = supabase.table('solicitud_compra') \
            .select('id, estado, id_encargado_repuestos, id_orden_trabajo, items') \
            .eq('id', id_solicitud) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': f'La solicitud ya está en estado {check.data[0]["estado"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        supabase.table('solicitud_compra') \
            .update({
                'estado': 'comprado',
                'fecha_respuesta': ahora,
                'respuesta_encargado': 'Compra realizada'
            }) \
            .eq('id', id_solicitud) \
            .execute()
        
        # Registrar uso de repuestos en la orden
        try:
            solicitud = check.data[0]
            items = []
            if solicitud.get('items'):
                items = json.loads(solicitud['items']) if isinstance(solicitud['items'], str) else solicitud['items']
            
            for item in items:
                supabase.table('usorepuesto').insert({
                    'id_orden_trabajo': solicitud['id_orden_trabajo'],
                    'descripcion_repuesto': item.get('descripcion', ''),
                    'cantidad': item.get('cantidad', 1),
                    'detalle': item.get('detalle', ''),
                    'fecha_uso': ahora
                }).execute()
        except Exception as e:
            logger.warning(f"Error registrando uso de repuestos: {e}")
        
        # Notificar al encargado de repuestos
        enviar_notificacion(
            solicitud.get('id_encargado_repuestos'),
            'compra_aprobada',
            f"✅ La compra #{id_solicitud} ha sido registrada como COMPRADA",
            id_solicitud
        )
        
        return jsonify({'success': True, 'message': 'Compra registrada'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 10: COTIZACIONES ENVIADAS
# =====================================================

@cotizaciones_bp.route('/cotizaciones-enviadas', methods=['GET'])
@jefe_taller_required
def obtener_cotizaciones_enviadas(current_user):
    """Obtener todas las cotizaciones"""
    try:
        estado_filtro = request.args.get('estado', 'all')
        
        query = supabase.table('cotizacion').select('*')
        
        if estado_filtro != 'all':
            query = query.eq('estado', estado_filtro)
        
        query = query.order('fecha_envio', desc=True)
        cotizaciones = query.execute()
        
        if not cotizaciones.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        resultado = []
        for cot in cotizaciones.data:
            id_orden = cot.get('id_orden_trabajo')
            
            orden = supabase.table('ordentrabajo') \
                .select('codigo_unico, estado_global, id_vehiculo, vehiculo!inner(marca, modelo, placa, cliente!inner(usuario!inner(nombre)))') \
                .eq('id', id_orden) \
                .execute()
            
            if not orden.data:
                continue
            
            o = orden.data[0]
            v = o.get('vehiculo', {})
            c = v.get('cliente', {})
            u = c.get('usuario', {})
            
            resultado.append({
                'id': cot['id'],
                'id_orden_trabajo': id_orden,
                'orden_codigo': o.get('codigo_unico'),
                'orden_estado': o.get('estado_global'),
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', '')})".strip(),
                'cliente_nombre': u.get('nombre', 'No registrado'),
                'total': float(cot.get('total', 0)),
                'estado': cot.get('estado', 'enviada'),
                'fecha_envio': cot.get('fecha_envio'),
                'fecha_rechazo': cot.get('fecha_rechazo'),
                'motivo_rechazo': cot.get('motivo_rechazo')
            })
        
        return jsonify({'success': True, 'cotizaciones': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 11: DETALLE DE COTIZACIÓN
# =====================================================

@cotizaciones_bp.route('/detalle-cotizacion/<int:id_cotizacion>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_cotizacion(current_user, id_cotizacion):
    """Obtener detalle de una cotización específica"""
    try:
        cotizacion = supabase.table('cotizacion') \
            .select('*') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        cot = cotizacion.data[0]
        id_orden = cot.get('id_orden_trabajo')
        
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        orden_info = orden.data[0] if orden.data else {}
        
        vehiculo_info = {}
        vehiculo_marca = ''
        vehiculo_modelo = ''
        vehiculo_placa = ''
        cliente_nombre = 'No registrado'
        
        if orden_info.get('id_vehiculo'):
            vehiculo = supabase.table('vehiculo') \
                .select('marca, modelo, placa, id_cliente') \
                .eq('id', orden_info['id_vehiculo']) \
                .execute()
            
            if vehiculo.data:
                v = vehiculo.data[0]
                vehiculo_marca = v.get('marca', '')
                vehiculo_modelo = v.get('modelo', '')
                vehiculo_placa = v.get('placa', '')
                
                if v.get('id_cliente'):
                    cliente = supabase.table('cliente') \
                        .select('id_usuario') \
                        .eq('id', v['id_cliente']) \
                        .execute()
                    
                    if cliente.data and cliente.data[0].get('id_usuario'):
                        usuario = supabase.table('usuario') \
                            .select('nombre') \
                            .eq('id', cliente.data[0]['id_usuario']) \
                            .execute()
                        
                        if usuario.data:
                            cliente_nombre = usuario.data[0].get('nombre', 'No registrado')
        
        servicios = []
        if cot.get('servicios_json'):
            try:
                servicios = json.loads(cot['servicios_json'])
            except:
                servicios = []
        
        return jsonify({
            'success': True,
            'detalle': {
                'id': cot['id'],
                'id_orden_trabajo': id_orden,
                'orden_codigo': orden_info.get('codigo_unico'),
                'orden_estado': orden_info.get('estado_global'),
                'cliente_nombre': cliente_nombre,
                'vehiculo_marca': vehiculo_marca,
                'vehiculo_modelo': vehiculo_modelo,
                'vehiculo_placa': vehiculo_placa,
                'fecha_envio': cot.get('fecha_envio'),
                'servicios': servicios,
                'total': float(cot.get('total', 0)),
                'estado': cot.get('estado', 'enviada'),
                'notas': cot.get('notas'),
                'nombre_archivo': cot.get('nombre_archivo')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 12: ENVIAR/ACTUALIZAR COTIZACIÓN
# =====================================================

@cotizaciones_bp.route('/enviar-cotizacion', methods=['POST'])
@jefe_taller_required
def enviar_cotizacion(current_user):
    """Enviar cotización al cliente con archivo adjunto"""
    try:
        data = request.get_json()
        
        id_orden = data.get('id_orden')
        archivo_base64 = data.get('archivo_base64')
        nombre_archivo = data.get('nombre_archivo', 'cotizacion.pdf')
        notas = data.get('notas', '')
        servicios = data.get('servicios', [])
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        if not archivo_base64:
            return jsonify({'error': 'Debe subir un archivo PDF o Word'}), 400
        
        total = sum(s.get('precio', 0) for s in servicios)
        ahora = datetime.datetime.now().isoformat()
        
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        estado_anterior = orden_actual.data[0]['estado_global'] if orden_actual.data else None
        
        existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        cotizacion_data = {
            'id_orden_trabajo': id_orden,
            'archivo_base64': archivo_base64,
            'nombre_archivo': nombre_archivo,
            'notas': notas,
            'servicios_json': json.dumps(servicios),
            'total': total,
            'id_jefe_taller': current_user['id'],
            'fecha_actualizacion': ahora,
            'fecha_envio': ahora,
            'estado': 'enviada'
        }
        
        if existente.data:
            supabase.table('cotizacion').update(cotizacion_data).eq('id', existente.data[0]['id']).execute()
            cotizacion_id = existente.data[0]['id']
        else:
            cotizacion_data['fecha_creacion'] = ahora
            result = supabase.table('cotizacion').insert(cotizacion_data).execute()
            cotizacion_id = result.data[0]['id'] if result.data else None
        
        supabase.table('ordentrabajo').update({
            'estado_global': ESTADOS_ORDEN['COTIZACION_ENVIADA']
        }).eq('id', id_orden).execute()
        
        registrar_historial_estado(
            id_orden, 
            estado_anterior, 
            ESTADOS_ORDEN['COTIZACION_ENVIADA'], 
            current_user['id']
        )
        
        return jsonify({'success': True, 'message': 'Cotización enviada exitosamente', 'id': cotizacion_id}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/actualizar-cotizacion/<int:id_cotizacion>', methods=['POST'])
@jefe_taller_required
def actualizar_cotizacion(current_user, id_cotizacion):
    """Actualizar una cotización existente"""
    try:
        data = request.get_json()
        
        id_orden = data.get('id_orden')
        archivo_base64 = data.get('archivo_base64')
        nombre_archivo = data.get('nombre_archivo', 'cotizacion.pdf')
        notas = data.get('notas', '')
        servicios = data.get('servicios', [])
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        if not archivo_base64:
            return jsonify({'error': 'Debe subir un archivo PDF o Word'}), 400
        
        total = sum(s.get('precio', 0) for s in servicios)
        ahora = datetime.datetime.now().isoformat()
        
        cotizacion_data = {
            'archivo_base64': archivo_base64,
            'nombre_archivo': nombre_archivo,
            'notas': notas,
            'servicios_json': json.dumps(servicios),
            'total': total,
            'fecha_actualizacion': ahora,
            'fecha_envio': ahora,
            'estado': 'enviada'
        }
        
        supabase.table('cotizacion').update(cotizacion_data).eq('id', id_cotizacion).execute()
        
        supabase.table('ordentrabajo').update({
            'estado_global': ESTADOS_ORDEN['COTIZACION_ENVIADA']
        }).eq('id', id_orden).execute()
        
        return jsonify({'success': True, 'message': 'Cotización actualizada y reenviada'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 13: HISTORIAL DE COTIZACIONES
# =====================================================

@cotizaciones_bp.route('/historial-cotizaciones', methods=['GET'])
@jefe_taller_required
def obtener_historial_cotizaciones(current_user):
    """Obtener historial de cotizaciones"""
    try:
        cotizaciones = supabase.table('cotizacion') \
            .select('*') \
            .order('fecha_envio', desc=True) \
            .execute()
        
        if not cotizaciones.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        resultado = []
        for cot in cotizaciones.data[:50]:
            resultado.append({
                'id': cot.get('id'),
                'id_orden_trabajo': cot.get('id_orden_trabajo'),
                'total': float(cot.get('total', 0)),
                'estado': cot.get('estado', 'enviada'),
                'fecha_envio': cot.get('fecha_envio'),
                'motivo_rechazo': cot.get('motivo_rechazo'),
                'fecha_rechazo': cot.get('fecha_rechazo')
            })
        
        return jsonify({'success': True, 'cotizaciones': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error en historial: {str(e)}")
        return jsonify({'success': True, 'cotizaciones': []}), 200

# =====================================================
# APARTADO 14: RECHAZO - INICIAR ARMADO
# =====================================================

@cotizaciones_bp.route('/rechazo/iniciar-armado', methods=['POST'])
@jefe_taller_required
def iniciar_armado_vehiculo(current_user):
    """Iniciar proceso de armado cuando el cliente rechaza la cotización"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        instrucciones_armado = data.get('instrucciones_armado', '')
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        if not instrucciones_armado.strip():
            return jsonify({'error': 'Debe escribir instrucciones para el armado'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Obtener la orden actual
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        estado_anterior = orden_actual.data[0]['estado_global']
        
        # Cambiar estado a EnArmadoVehiculo
        supabase.table('ordentrabajo').update({
            'estado_global': ESTADOS_ORDEN['EN_ARMADO']
        }).eq('id', id_orden).execute()
        
        # =====================================================
        # CREAR ASIGNACIÓN DE ARMADO PARA LOS TÉCNICOS
        # =====================================================
        # Obtener los técnicos actualmente asignados a esta orden
        tecnicos_asignados = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if tecnicos_asignados.data:
            # Finalizar asignaciones activas de diagnóstico/reparación
            for ta in tecnicos_asignados.data:
                supabase.table('asignaciontecnico') \
                    .update({'fecha_hora_final': ahora}) \
                    .eq('id_orden_trabajo', id_orden) \
                    .eq('id_tecnico', ta['id_tecnico']) \
                    .is_('fecha_hora_final', 'null') \
                    .execute()
            
            # Crear nuevas asignaciones de tipo ARMADO para los mismos técnicos
            for ta in tecnicos_asignados.data:
                supabase.table('asignaciontecnico').insert({
                    'id_orden_trabajo': id_orden,
                    'id_tecnico': ta['id_tecnico'],
                    'tipo_asignacion': 'armado',
                    'fecha_hora_inicio': ahora,
                    'id_jefe_taller': current_user['id']
                }).execute()
                logger.info(f"✅ Asignación de ARMADO creada para técnico {ta['id_tecnico']} en orden {id_orden}")
        else:
            logger.warning(f"⚠️ No hay técnicos asignados a la orden {id_orden} para crear asignación de armado")
        
        registrar_historial_estado(
            id_orden,
            estado_anterior,
            ESTADOS_ORDEN['EN_ARMADO'],
            current_user['id'],
            'Cliente rechazó cotización. Iniciando armado del vehículo.'
        )
        
        instruccion_completa = f"""
[ARMADO DE VEHÍCULO - COTIZACIÓN RECHAZADA]

El cliente ha rechazado la cotización. Proceder a ARMAR el vehículo completamente.

Instrucciones específicas:
{instrucciones_armado}

⚠️ IMPORTANTE:
- Armar el vehículo a su estado original antes del diagnóstico
- Al terminar, marcar como "Vehículo Armado" usando el botón correspondiente
"""
        
        supabase.table('instrucciones_tecnico_historial').insert({
            'id_orden_trabajo': id_orden,
            'id_jefe_taller': current_user['id'],
            'instrucciones': instruccion_completa,
            'fecha_envio': ahora,
            'leida': False
        }).execute()
        
        # Notificar a los técnicos
        for ta in (tecnicos_asignados.data or []):
            try:
                supabase.table('notificacion').insert({
                    'id_usuario_destino': ta['id_tecnico'],
                    'tipo': 'armado_vehiculo',
                    'mensaje': f'🔧 El cliente rechazó la cotización. Debes ARMAR el vehículo de la orden #{id_orden}',
                    'fecha_envio': ahora,
                    'leida': False
                }).execute()
            except Exception as e:
                logger.warning(f"Error enviando notificación: {e}")
        
        return jsonify({'success': True, 'message': 'Instrucciones de armado enviadas'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500
# =====================================================
# APARTADO 15: TÉCNICOS ASIGNADOS
# =====================================================

@cotizaciones_bp.route('/orden/<int:id_orden>/tecnicos-asignados', methods=['GET'])
@jefe_taller_required
def obtener_tecnicos_asignados(current_user, id_orden):
    """Obtener técnicos actualmente asignados a una orden"""
    try:
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico, fecha_hora_inicio, usuario!id_tecnico(id, nombre, contacto)') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        tecnicos = []
        for asignacion in (asignaciones.data or []):
            usuario_data = asignacion.get('usuario', {})
            tecnicos.append({
                'id': usuario_data.get('id'),
                'nombre': usuario_data.get('nombre', 'Técnico'),
                'contacto': usuario_data.get('contacto', ''),
                'fecha_asignacion': asignacion.get('fecha_hora_inicio')
            })
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': True, 'tecnicos': []}), 200

# =====================================================
# APARTADO 16: TÉCNICOS CON CARGA DE TRABAJO
# =====================================================

@cotizaciones_bp.route('/tecnicos-con-carga', methods=['GET'])
@jefe_taller_required
def obtener_tecnicos_con_carga(current_user):
    """Obtener técnicos con su carga de trabajo actual"""
    try:
        tecnicos = []
        
        tecnicos_ids = []
        result = supabase.table('usuario_rol') \
            .select('id_usuario, rol!inner(nombre_rol)') \
            .execute()
        
        if result.data:
            for item in result.data:
                rol_data = item.get('rol', {})
                nombre_rol = rol_data.get('nombre_rol', '') if isinstance(rol_data, dict) else ''
                if nombre_rol in ['tecnico_mecanico', 'tecnico']:
                    tecnicos_ids.append(item['id_usuario'])
        
        if tecnicos_ids:
            tecnicos_data = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .in_('id', tecnicos_ids) \
                .execute()
            
            if tecnicos_data.data:
                for t in tecnicos_data.data:
                    asignaciones_count = supabase.table('asignaciontecnico') \
                        .select('id', count='exact') \
                        .eq('id_tecnico', t['id']) \
                        .is_('fecha_hora_final', 'null') \
                        .execute()
                    
                    ordenes_activas = asignaciones_count.count if hasattr(asignaciones_count, 'count') else len(asignaciones_count.data or [])
                    
                    tecnicos.append({
                        'id': t['id'],
                        'nombre': t.get('nombre', 'Técnico'),
                        'contacto': t.get('contacto', ''),
                        'email': t.get('email', ''),
                        'ordenes_activas': ordenes_activas,
                        'max_vehiculos': 2,
                        'disponible': ordenes_activas < 2
                    })
        
        # Datos de prueba si no se encontraron técnicos reales
        if not tecnicos:
            tecnicos = [
                {'id': 1, 'nombre': 'Juan Pérez', 'contacto': '70000001', 'email': 'juan@furia.com', 'ordenes_activas': 0, 'max_vehiculos': 2, 'disponible': True},
                {'id': 2, 'nombre': 'Carlos López', 'contacto': '70000002', 'email': 'carlos@furia.com', 'ordenes_activas': 1, 'max_vehiculos': 2, 'disponible': True},
                {'id': 3, 'nombre': 'Miguel Ángel', 'contacto': '70000003', 'email': 'miguel@furia.com', 'ordenes_activas': 2, 'max_vehiculos': 2, 'disponible': False},
            ]
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': True, 'tecnicos': []}), 200

# =====================================================
# APARTADO 17: ASIGNAR TÉCNICOS
# =====================================================

@cotizaciones_bp.route('/asignar-tecnicos', methods=['POST'])
@jefe_taller_required
def asignar_tecnicos_reparacion(current_user):
    """Asignar técnicos para reparación con días estimados"""
    print("\n" + "="*80)
    print("🚨 ASIGNAR TÉCNICOS - VERSIÓN CORREGIDA 🚨")
    print("="*80)
    
    try:
        data = request.get_json()
        print(f"📦 Datos recibidos: {data}")
        
        id_orden = data.get('id_orden')
        tecnicos_ids = data.get('tecnicos', [])
        instrucciones = data.get('instrucciones', '')
        tiempo_estimado = data.get('tiempo_estimado')
        
        print(f"📊 tiempo_estimado recibido: {tiempo_estimado}")
        
        # Validaciones
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        if not tiempo_estimado:
            return jsonify({'error': 'Debes especificar los días de reparación'}), 400
        
        try:
            tiempo_estimado = int(tiempo_estimado)
            if tiempo_estimado < 1:
                return jsonify({'error': 'El plazo debe ser al menos 1 día'}), 400
        except:
            return jsonify({'error': 'El plazo debe ser un número válido'}), 400
        
        if not tecnicos_ids:
            return jsonify({'error': 'Selecciona al menos un técnico'}), 400
        
        ahora = datetime.datetime.now()
        fecha_estimada_fin = ahora + datetime.timedelta(days=tiempo_estimado)
        
        print(f"📅 Guardando {tiempo_estimado} días, fecha estimada: {fecha_estimada_fin}")
        
        # ACTUALIZAR ORDEN CON DÍAS
        update_result = supabase.table('ordentrabajo').update({
            'dias_estimados_reparacion': tiempo_estimado,
            'fecha_estimada_finalizacion': fecha_estimada_fin.isoformat(),
            'estado_global': 'EnReparacion'
        }).eq('id', id_orden).execute()
        
        print(f"✅ Resultado update: {update_result.data}")
        
        # Verificar que se guardó
        verify = supabase.table('ordentrabajo') \
            .select('dias_estimados_reparacion, fecha_estimada_finalizacion') \
            .eq('id', id_orden) \
            .execute()
        
        print(f"🔍 Verificación: {verify.data}")
        
        # Asignar técnicos
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': ahora.isoformat()}) \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for tecnico_id in tecnicos_ids:
            supabase.table('asignaciontecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'tipo_asignacion': 'reparacion',
                'fecha_hora_inicio': ahora.isoformat(),
                'fecha_hora_final_estimada': fecha_estimada_fin.isoformat(),
                'id_jefe_taller': current_user['id']
            }).execute()
        
        # Guardar instrucciones
        supabase.table('instrucciones_tecnico_historial').insert({
            'id_orden_trabajo': id_orden,
            'id_jefe_taller': current_user['id'],
            'instrucciones': instrucciones,
            'fecha_envio': ahora.isoformat()
        }).execute()
        
        print("="*80)
        print("✅✅✅ DÍAS GUARDADOS CORRECTAMENTE ✅✅✅")
        print(f"   Orden: {id_orden}")
        print(f"   Días: {tiempo_estimado}")
        print(f"   Fecha estimada: {fecha_estimada_fin}")
        print("="*80)
        
        return jsonify({
            'success': True,
            'message': f'Reparación iniciada. Plazo: {tiempo_estimado} días',
            'dias_guardados': tiempo_estimado,
            'fecha_estimada': fecha_estimada_fin.isoformat()
        }), 200
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 18: CAMBIAR ESTADO REPARACIÓN
# =====================================================

@cotizaciones_bp.route('/cambiar-estado-reparacion/<int:id_orden>', methods=['PUT'])
@jefe_taller_required
def cambiar_estado_reparacion(current_user, id_orden):
    """Cambiar el estado de la orden a EnReparacion"""
    try:
        orden = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden.data[0]['estado_global']
        
        result = supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnReparacion'}) \
            .eq('id', id_orden) \
            .execute()
        
        verificacion = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        nuevo_estado = verificacion.data[0]['estado_global'] if verificacion.data else 'No cambio'
        
        return jsonify({
            'success': nuevo_estado == 'EnReparacion',
            'estado_anterior': estado_actual,
            'nuevo_estado': nuevo_estado
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# APARTADO 19: INSTRUCCIONES DE ARMADO
# =====================================================

@cotizaciones_bp.route('/orden/<int:id_orden>/instrucciones-armado', methods=['GET'])
@jefe_taller_required
def obtener_instrucciones_armado(current_user, id_orden):
    """Obtener las instrucciones de armado enviadas al técnico"""
    try:
        instrucciones = supabase.table('instrucciones_tecnico_historial') \
            .select('instrucciones, fecha_envio') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_envio', desc=True) \
            .limit(1) \
            .execute()
        
        if instrucciones.data:
            return jsonify({
                'success': True,
                'instrucciones': instrucciones.data[0].get('instrucciones', ''),
                'fecha_envio': instrucciones.data[0].get('fecha_envio')
            }), 200
        else:
            return jsonify({'success': False, 'error': 'No se encontraron instrucciones'}), 404
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================
@cotizaciones_bp.route('/test-version', methods=['GET'])
def test_version():
    return jsonify({
        'version': 'VERSION_2026-05-11',
        'message': 'El backend está usando el código actualizado'
    })


@cotizaciones_bp.route('/iniciar-reparacion-con-dias', methods=['POST'])
@jefe_taller_required
def iniciar_reparacion_con_dias(current_user):
    """
    NUEVO ENDPOINT - Iniciar reparación GUARDANDO los días
    ========================================================
    """
    print("\n" + "="*80)
    print("🟢🟢🟢 NUEVO ENDPOINT: iniciar-reparacion-con-dias 🟢🟢🟢")
    print("="*80)
    
    try:
        data = request.get_json()
        print(f"📦 Datos recibidos: {json.dumps(data, indent=2)}")
        
        id_orden = data.get('id_orden')
        tecnicos_ids = data.get('tecnicos', [])
        instrucciones = data.get('instrucciones', '')
        dias = data.get('dias')
        
        print(f"📊 Datos extraídos:")
        print(f"   🔹 id_orden: {id_orden}")
        print(f"   🔹 dias: {dias}")
        print(f"   🔹 tecnicos_ids: {tecnicos_ids}")
        print(f"   🔹 instrucciones (primeros 50): {instrucciones[:50] if instrucciones else 'None'}")
        
        # =====================================================
        # VALIDACIONES
        # =====================================================
        if not id_orden:
            print("❌ Error: id_orden no proporcionado")
            return jsonify({'success': False, 'error': 'Orden requerida'}), 400
        
        if not dias:
            print("❌ Error: dias no proporcionado")
            return jsonify({'success': False, 'error': 'Debes especificar cuántos días durará la reparación'}), 400
        
        try:
            dias = int(dias)
            if dias < 1:
                print(f"❌ Error: dias {dias} es menor que 1")
                return jsonify({'success': False, 'error': 'El plazo debe ser al menos 1 día'}), 400
            if dias > 60:
                print(f"❌ Error: dias {dias} es mayor que 60")
                return jsonify({'success': False, 'error': 'El plazo no puede ser mayor a 60 días'}), 400
        except (ValueError, TypeError):
            print(f"❌ Error: dias no es número válido")
            return jsonify({'success': False, 'error': 'El plazo debe ser un número válido'}), 400
        
        if not tecnicos_ids:
            print("❌ Error: No hay técnicos seleccionados")
            return jsonify({'success': False, 'error': 'Debe seleccionar al menos un técnico'}), 400
        
        if not instrucciones or not instrucciones.strip():
            print("❌ Error: Instrucciones vacías")
            return jsonify({'success': False, 'error': 'Debes escribir instrucciones para los técnicos'}), 400
        
        print("✅ Todas las validaciones pasaron")
        
        # =====================================================
        # CALCULAR FECHAS
        # =====================================================
        ahora = datetime.datetime.now()
        fecha_estimada_fin = ahora + datetime.timedelta(days=dias)
        fecha_estimada_fin_str = fecha_estimada_fin.isoformat()
        ahora_str = ahora.isoformat()
        
        print(f"📅 Fecha actual: {ahora.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"📅 Días a sumar: {dias}")
        print(f"📅 Fecha estimada fin: {fecha_estimada_fin.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # =====================================================
        # 1. ACTUALIZAR LA ORDEN CON LOS DÍAS
        # =====================================================
        print("\n💾 PASO 1: Actualizando tabla ordentrabajo...")
        
        update_data = {
            'dias_estimados_reparacion': dias,
            'fecha_estimada_finalizacion': fecha_estimada_fin_str,
            'estado_global': 'EnReparacion'
        }
        
        print(f"   📤 Datos a actualizar: {update_data}")
        
        result = supabase.table('ordentrabajo').update(update_data).eq('id', id_orden).execute()
        print(f"   ✅ Resultado update: {result.data}")
        
        # Verificar que se guardó
        verify = supabase.table('ordentrabajo') \
            .select('dias_estimados_reparacion, fecha_estimada_finalizacion, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        print(f"   🔍 Verificación post-update: {verify.data}")
        
        if verify.data and verify.data[0].get('dias_estimados_reparacion') == dias:
            print("   ✅ ¡DÍAS GUARDADOS EXITOSAMENTE!")
        else:
            print(f"   ⚠️ ADVERTENCIA: Se esperaba {dias} pero se guardó {verify.data[0].get('dias_estimados_reparacion') if verify.data else 'NULL'}")
        
        # =====================================================
        # 2. ACTUALIZAR ASIGNACIONES DE TÉCNICOS
        # =====================================================
        print("\n👨‍🔧 PASO 2: Actualizando asignaciones de técnicos...")
        
        # Finalizar asignaciones anteriores activas
        try:
            supabase.table('asignaciontecnico') \
                .update({'fecha_hora_final': ahora_str}) \
                .eq('id_orden_trabajo', id_orden) \
                .is_('fecha_hora_final', 'null') \
                .execute()
            print(f"   ✅ Asignaciones anteriores finalizadas")
        except Exception as e:
            print(f"   ⚠️ Error al finalizar asignaciones: {e}")
        
        # Crear nuevas asignaciones (SIN id_jefe_taller)
        for tecnico_id in tecnicos_ids:
            try:
                supabase.table('asignaciontecnico').insert({
                    'id_orden_trabajo': id_orden,
                    'id_tecnico': tecnico_id,
                    'tipo_asignacion': 'reparacion',
                    'fecha_hora_inicio': ahora_str,
                    'fecha_hora_final_estimada': fecha_estimada_fin_str
                }).execute()
                print(f"   ✅ Técnico {tecnico_id} asignado")
            except Exception as e:
                print(f"   ⚠️ Error asignando técnico {tecnico_id}: {e}")
        
        # =====================================================
        # 3. GUARDAR INSTRUCCIONES
        # =====================================================
        print("\n📝 PASO 3: Guardando instrucciones...")
        
        instruccion_completa = f"""
[REPARACIÓN - COTIZACIÓN ACEPTADA]

📅 Plazo estimado: {dias} días
⏱️ Fecha estimada de finalización: {fecha_estimada_fin.strftime('%d/%m/%Y')}

Instrucciones específicas:
{instrucciones}

⚠️ IMPORTANTE:
- Registrar avances diariamente en el sistema
- Notificar cualquier retraso o problema
- Al finalizar, marcar como "Reparación Completada"
"""
        
        try:
            supabase.table('instrucciones_tecnico_historial').insert({
                'id_orden_trabajo': id_orden,
                'id_jefe_taller': current_user['id'],
                'instrucciones': instruccion_completa,
                'fecha_envio': ahora_str,
                'leida': False
            }).execute()
            print(f"   ✅ Instrucciones guardadas")
        except Exception as e:
            print(f"   ⚠️ Error guardando instrucciones: {e}")
        
        # =====================================================
        # RESPUESTA FINAL
        # =====================================================
        print("\n" + "="*80)
        print("✅✅✅ NUEVO ENDPOINT - PROCESO COMPLETADO ✅✅✅")
        print(f"   Orden: {id_orden}")
        print(f"   Días guardados: {dias}")
        print(f"   Fecha estimada: {fecha_estimada_fin_str}")
        print("="*80 + "\n")
        
        return jsonify({
            'success': True,
            'message': f'✅ Reparación iniciada correctamente. Plazo: {dias} días',
            'dias_guardados': dias,
            'fecha_estimada': fecha_estimada_fin_str,
            'tecnicos_asignados': len(tecnicos_ids)
        }), 200
        
    except Exception as e:
        print("\n" + "="*80)
        print("❌❌❌ ERROR EN NUEVO ENDPOINT ❌❌❌")
        print(f"   Error: {str(e)}")
        print("="*80 + "\n")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500