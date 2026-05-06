# =====================================================
# COTIZACIONES - JEFE DE TALLER
# FURIA MOTOR COMPANY SRL
# VERSIÓN 3.0 - CON NUEVOS ESTADOS DE COTIZACIÓN
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

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

def obtener_encargados_repuestos():
    """Obtener lista de usuarios con rol encargado_repuestos"""
    try:
        resultado = supabase.rpc('get_users_by_role', {
            'role_name': 'encargado_repuestos'
        }).execute()
        
        if resultado.data:
            return resultado.data
        
        usuarios = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .execute()
        
        encargados = []
        for usuario in (usuarios.data or []):
            try:
                tiene_rol = supabase.rpc('usuario_tiene_rol', {
                    'p_usuario_id': usuario['id'],
                    'p_rol_nombre': 'encargado_repuestos'
                }).execute()
                if tiene_rol.data:
                    encargados.append(usuario)
            except:
                continue
        
        return encargados
    except Exception as e:
        logger.error(f"Error obteniendo encargados: {e}")
        return []


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


# =====================================================
# APARTADO 1: ÓRDENES CON DIAGNÓSTICO APROBADO (PRIMER APARTADO - SOLICITAR COTIZACIÓN)
# =====================================================

@cotizaciones_bp.route('/ordenes-diagnostico-aprobado', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_diagnostico_aprobado(current_user):
    """Obtener SOLO órdenes con diagnóstico aprobado (para el primer apartado - Solicitar Cotización)"""
    try:
        logger.info("📢 Obteniendo órdenes con diagnóstico aprobado")
        
        # Buscar órdenes con estado_global = 'DiagnosticoAprobado'
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
        
        logger.info(f"📊 Órdenes encontradas: {len(ordenes_result.data)}")
        
        resultado = []
        for orden in ordenes_result.data:
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario = cliente.get('usuario', {})
            
            # Obtener el diagnóstico aprobado más reciente
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
                    # CORREGIDO: Manejar correctamente maybe_single()
                    solicitud_result = supabase.table('solicitud_cotizacion_repuesto') \
                        .select('id, estado, precio_cotizado') \
                        .eq('id_orden_trabajo', orden['id']) \
                        .eq('id_servicio', serv['id']) \
                        .maybe_single() \
                        .execute()
                    
                    estado_cotizacion = 'pendiente'
                    precio_cotizado = 0
                    
                    # Verificar si hay resultado
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
            
            total_orden = sum(s.get('precio_cotizado', 0) for s in servicios)
            
            resultado.append({
                'id_orden': orden['id'],
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'marca': vehiculo.get('marca'),
                'modelo': vehiculo.get('modelo'),
                'placa': vehiculo.get('placa'),
                'anio': vehiculo.get('anio'),
                'cliente_nombre': usuario.get('nombre', 'No registrado'),
                'cliente_email': usuario.get('email'),
                'cliente_telefono': usuario.get('contacto'),
                'servicios': servicios,
                'total_orden': total_orden,
                'fecha_diagnostico': diagnostico.data[0].get('fecha_envio') if diagnostico.data else None
            })
        
        logger.info(f"✅ Órdenes con diagnóstico aprobado: {len(resultado)}")
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 2: ÓRDENES PARA COTIZACIÓN AL CLIENTE (SEGUNDO APARTADO)
# =====================================================

@cotizaciones_bp.route('/ordenes-con-servicios', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_con_servicios(current_user):
    """Obtener órdenes para el apartado de Cotización al Cliente"""
    try:
        logger.info("📢 Obteniendo órdenes para cotización al cliente")
        
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
            logger.info("No hay órdenes en estados relevantes")
            return jsonify({'success': True, 'ordenes': []}), 200
        
        logger.info(f"📊 Órdenes encontradas: {len(ordenes_result.data)}")
        
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
                    
                    items = []
                    if solicitud.get('items'):
                        try:
                            items = json.loads(solicitud['items']) if isinstance(solicitud['items'], str) else solicitud['items']
                        except:
                            items = []
                    
                    servicios.append({
                        'id_servicio': serv['id'],
                        'descripcion': serv['descripcion'],
                        'estado_cotizacion': estado_cotizacion,
                        'precio_cotizado': float(solicitud.get('precio_cotizado')) if solicitud.get('precio_cotizado') else 0,
                        'items': items,
                        'id_solicitud': solicitud.get('id')
                    })
            
            total_orden = sum(s.get('precio_cotizado', 0) for s in servicios)
            cotizacion_info = cotizaciones_map.get(orden['id'])
            
            tecnicos_asignados = False
            try:
                asignaciones = supabase.table('asignaciontecnico') \
                    .select('id') \
                    .eq('id_orden_trabajo', orden['id']) \
                    .is_('fecha_hora_final', 'null') \
                    .execute()
                tecnicos_asignados = len(asignaciones.data or []) > 0
            except:
                pass
            
            resultado.append({
                'id_orden': orden['id'],
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'cliente_nombre': usuario.get('nombre', 'No registrado'),
                'servicios': servicios,
                'total_orden': total_orden,
                'tecnicos_asignados': tecnicos_asignados,
                'cotizacion_estado': cotizacion_info.get('estado') if cotizacion_info else None,
                'cotizacion_total': float(cotizacion_info.get('total', 0)) if cotizacion_info else 0,
                'motivo_rechazo': cotizacion_info.get('motivo_rechazo') if cotizacion_info else None,
                'fecha_rechazo': cotizacion_info.get('fecha_rechazo') if cotizacion_info else None
            })
        
        logger.info(f"✅ Órdenes cargadas para cotización: {len(resultado)}")
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 3: DATOS DE ORDEN
# =====================================================

@cotizaciones_bp.route('/datos-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_datos_orden(current_user, id_orden):
    """Obtener datos completos de la orden (cliente, vehículo, etc.)"""
    try:
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        o = orden.data[0]
        id_vehiculo = o.get('id_vehiculo')
        
        vehiculo = supabase.table('vehiculo') \
            .select('id, marca, modelo, placa, anio, kilometraje, id_cliente') \
            .eq('id', id_vehiculo) \
            .execute()
        
        v = vehiculo.data[0] if vehiculo.data else {}
        
        cliente_data = {}
        if v.get('id_cliente'):
            cliente = supabase.table('cliente') \
                .select('id, id_usuario') \
                .eq('id', v.get('id_cliente')) \
                .execute()
            if cliente.data:
                id_usuario = cliente.data[0].get('id_usuario')
                if id_usuario:
                    usuario = supabase.table('usuario') \
                        .select('id, nombre, email, contacto') \
                        .eq('id', id_usuario) \
                        .execute()
                    if usuario.data:
                        cliente_data = usuario.data[0]
        
        return jsonify({
            'success': True,
            'datos': {
                'id_orden': o.get('id'),
                'codigo_unico': o.get('codigo_unico'),
                'fecha_ingreso': o.get('fecha_ingreso'),
                'estado_global': o.get('estado_global'),
                'cliente_nombre': cliente_data.get('nombre', 'No registrado'),
                'cliente_email': cliente_data.get('email'),
                'cliente_telefono': cliente_data.get('contacto'),
                'marca': v.get('marca'),
                'modelo': v.get('modelo'),
                'placa': v.get('placa'),
                'anio': v.get('anio'),
                'kilometraje': v.get('kilometraje')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 4: ÓRDENES APROBADAS (PARA SOLICITAR COTIZACIÓN)
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
# APARTADO 5: ENCARGADOS DE REPUESTOS
# =====================================================

@cotizaciones_bp.route('/encargados-repuestos', methods=['GET'])
@jefe_taller_required
def obtener_encargados_repuestos_endpoint(current_user):
    """Obtener lista de encargados de repuestos"""
    try:
        usuarios = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .execute()
        
        encargados = []
        for usuario in (usuarios.data or []):
            try:
                tiene_rol = supabase.rpc('usuario_tiene_rol', {
                    'p_usuario_id': usuario['id'],
                    'p_rol_nombre': 'encargado_repuestos'
                }).execute()
                if tiene_rol.data:
                    encargados.append({
                        'id': usuario['id'],
                        'nombre': usuario.get('nombre', 'Encargado'),
                        'contacto': usuario.get('contacto', ''),
                        'email': usuario.get('email', '')
                    })
            except:
                if usuario.get('id_rol') == 5:
                    encargados.append({
                        'id': usuario['id'],
                        'nombre': usuario.get('nombre', 'Encargado'),
                        'contacto': usuario.get('contacto', ''),
                        'email': usuario.get('email', '')
                    })
        
        return jsonify({'success': True, 'encargados': encargados}), 200
    except Exception as e:
        logger.error(f"Error obteniendo encargados: {e}")
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
            
            # Validaciones
            if not id_orden_trabajo:
                return jsonify({'error': 'Orden de trabajo es requerida'}), 400
            if not id_servicio:
                return jsonify({'error': 'Servicio es requerido'}), 400
            if not id_encargado:
                return jsonify({'error': 'Encargado de repuestos es requerido'}), 400
            if not items or len(items) == 0:
                return jsonify({'error': 'Debe agregar al menos un item a cotizar'}), 400
            
            # Verificar que la orden existe
            orden = supabase.table('ordentrabajo').select('id').eq('id', id_orden_trabajo).execute()
            if not orden.data:
                return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
            
            # Obtener el primer item para los campos requeridos
            primer_item = items[0]
            descripcion_pieza = primer_item.get('descripcion', '')
            cantidad = primer_item.get('cantidad', 1)
            
            ahora = datetime.datetime.now().isoformat()
            
            # Crear la solicitud con los nombres de columna CORRECTOS
            nueva_solicitud = {
                'id_orden_trabajo': id_orden_trabajo,
                'id_servicio': id_servicio,
                'id_jefe_taller': current_user['id'],
                'id_encargado_repuestos': id_encargado,
                'descripcion_pieza': descripcion_pieza,
                'cantidad': cantidad,
                'items': json.dumps(items),
                'observacion_jefe_taller': observaciones,  # ← Nombre correcto de la columna
                'estado': 'pendiente',
                'fecha_solicitud': ahora
            }
            
            result = supabase.table('solicitud_cotizacion_repuesto') \
                .insert(nueva_solicitud) \
                .execute()
            
            if not result.data:
                return jsonify({'error': 'No se pudo crear la solicitud'}), 500
            
            # Enviar notificación al encargado de repuestos
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
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'DELETE':
        try:
            id_solicitud = request.view_args.get('id_solicitud')
            if not id_solicitud:
                return jsonify({'error': 'ID de solicitud requerido'}), 400
            
            # Verificar que la solicitud existe y pertenece al usuario
            check = supabase.table('solicitud_cotizacion_repuesto') \
                .select('id, estado') \
                .eq('id', id_solicitud) \
                .eq('id_jefe_taller', current_user['id']) \
                .execute()
            
            if not check.data:
                return jsonify({'error': 'Solicitud no encontrada'}), 404
            
            if check.data[0]['estado'] != 'pendiente':
                return jsonify({'error': 'Solo se pueden eliminar solicitudes pendientes'}), 400
            
            # Eliminar la solicitud
            supabase.table('solicitud_cotizacion_repuesto') \
                .delete() \
                .eq('id', id_solicitud) \
                .execute()
            
            return jsonify({'success': True, 'message': 'Solicitud eliminada'}), 200
            
        except Exception as e:
            logger.error(f"Error eliminando solicitud: {str(e)}")
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
# APARTADO 7: SERVICIOS COTIZADOS (TEMPORAL)
# =====================================================

@cotizaciones_bp.route('/servicios-cotizacion/<int:id_orden>', methods=['GET', 'POST'])
@jefe_taller_required
def gestionar_servicios_cotizacion(current_user, id_orden):
    """Gestionar servicios temporales para la cotización"""
    
    if request.method == 'GET':
        try:
            temporal = supabase.table('cotizacion_temporal') \
                .select('servicios') \
                .eq('id_orden_trabajo', id_orden) \
                .eq('id_jefe_taller', current_user['id']) \
                .execute()
            
            servicios = []
            if temporal.data and temporal.data[0].get('servicios'):
                try:
                    servicios = json.loads(temporal.data[0]['servicios'])
                except:
                    servicios = []
            
            return jsonify({'success': True, 'servicios': servicios}), 200
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            servicios = data.get('servicios', [])
            
            existente = supabase.table('cotizacion_temporal') \
                .select('id') \
                .eq('id_orden_trabajo', id_orden) \
                .eq('id_jefe_taller', current_user['id']) \
                .execute()
            
            if existente.data:
                supabase.table('cotizacion_temporal') \
                    .update({
                        'servicios': json.dumps(servicios),
                        'fecha_actualizacion': datetime.datetime.now().isoformat()
                    }) \
                    .eq('id', existente.data[0]['id']) \
                    .execute()
            else:
                supabase.table('cotizacion_temporal') \
                    .insert({
                        'id_orden_trabajo': id_orden,
                        'id_jefe_taller': current_user['id'],
                        'servicios': json.dumps(servicios),
                        'fecha_creacion': datetime.datetime.now().isoformat(),
                        'fecha_actualizacion': datetime.datetime.now().isoformat()
                    }) \
                    .execute()
            
            return jsonify({'success': True, 'message': 'Servicios guardados'}), 200
            
        except Exception as e:
            return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 8: COTIZACIONES ENVIADAS
# =====================================================

@cotizaciones_bp.route('/cotizaciones-enviadas', methods=['GET'])
@jefe_taller_required
def obtener_cotizaciones_enviadas(current_user):
    """Obtener todas las cotizaciones (enviadas, aprobadas, rechazadas)"""
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
            
            servicios = []
            if cot.get('servicios_json'):
                try:
                    servicios = json.loads(cot['servicios_json'])
                except:
                    servicios = []
            
            servicios_aprobados = [s for s in servicios if s.get('aprobado_por_cliente', False)]
            total_aprobado = sum(s.get('precio', 0) for s in servicios_aprobados)
            
            if cot.get('estado') == 'rechazada':
                total_aprobado = 200
            
            resultado.append({
                'id': cot['id'],
                'id_orden_trabajo': id_orden,
                'orden_codigo': o.get('codigo_unico'),
                'orden_estado': o.get('estado_global'),
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', '')})".strip(),
                'cliente_nombre': u.get('nombre', 'No registrado'),
                'total': total_aprobado,
                'servicios_aprobados': len(servicios_aprobados),
                'total_servicios': len(servicios),
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
# APARTADO 9: DETALLE DE COTIZACIÓN
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
        orden_codigo = orden_info.get('codigo_unico', 'N/A')
        orden_estado = orden_info.get('estado_global', 'N/A')
        
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
        total = 0
        if cot.get('servicios_json'):
            try:
                servicios = json.loads(cot['servicios_json'])
                total = sum(s.get('precio', 0) for s in servicios)
            except:
                servicios = []
        
        return jsonify({
            'success': True,
            'detalle': {
                'id': cot['id'],
                'id_orden_trabajo': id_orden,
                'orden_codigo': orden_codigo,
                'orden_estado': orden_estado,
                'cliente_nombre': cliente_nombre,
                'vehiculo_marca': vehiculo_marca,
                'vehiculo_modelo': vehiculo_modelo,
                'vehiculo_placa': vehiculo_placa,
                'fecha_envio': cot.get('fecha_envio'),
                'servicios': servicios,
                'total': total,
                'estado': cot.get('estado', 'enviada'),
                'notas': cot.get('notas'),
                'nombre_archivo': cot.get('nombre_archivo'),
                'fecha_rechazo': cot.get('fecha_rechazo'),
                'motivo_rechazo': cot.get('motivo_rechazo')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 10: ENVIAR/ACTUALIZAR COTIZACIÓN
# =====================================================

@cotizaciones_bp.route('/enviar-cotizacion', methods=['POST'])
@jefe_taller_required
def enviar_cotizacion(current_user):
    """Enviar cotización al cliente con archivo adjunto y servicios"""
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
            current_user['id'],
            f'Cotización enviada. Total: Bs. {total:.2f}'
        )
        
        orden = supabase.table('ordentrabajo') \
            .select('id_vehiculo, vehiculo!inner(id_cliente, cliente!inner(id_usuario, usuario!inner(nombre, email)))') \
            .eq('id', id_orden) \
            .execute()
        
        usuario_cliente = None
        cliente_nombre = 'Cliente'
        
        if orden.data and orden.data[0].get('vehiculo'):
            v = orden.data[0]['vehiculo']
            if v.get('cliente'):
                u = v['cliente'].get('usuario', {})
                cliente_nombre = u.get('nombre', 'Cliente')
                usuario_cliente = v['cliente'].get('id_usuario')
        
        if usuario_cliente:
            enviar_notificacion(
                usuario_cliente,
                'cotizacion_recibida',
                f"📎 Hola {cliente_nombre}, has recibido una nueva cotización. Total: Bs. {total:.2f}",
                cotizacion_id
            )
        
        return jsonify({'success': True, 'message': 'Cotización enviada exitosamente', 'id': cotizacion_id}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/actualizar-cotizacion/<int:id_cotizacion>', methods=['POST'])
@jefe_taller_required
def actualizar_cotizacion(current_user, id_cotizacion):
    """Actualizar una cotización existente y reenviar al cliente"""
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
        
        cotizacion_existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id', id_cotizacion) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not cotizacion_existente.data:
            return jsonify({'error': 'Cotización no encontrada o no autorizada'}), 404
        
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
        
        return jsonify({'success': True, 'message': 'Cotización actualizada y reenviada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/descargar-cotizacion/<int:id_cotizacion>', methods=['GET'])
@jefe_taller_required
def descargar_cotizacion(current_user, id_cotizacion):
    """Descargar archivo de cotización"""
    try:
        cotizacion = supabase.table('cotizacion') \
            .select('archivo_base64, nombre_archivo') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        cot = cotizacion.data[0]
        
        if not cot.get('archivo_base64'):
            return jsonify({'error': 'No hay archivo asociado'}), 404
        
        return jsonify({
            'success': True,
            'archivo_base64': cot.get('archivo_base64'),
            'nombre_archivo': cot.get('nombre_archivo', 'cotizacion.pdf')
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 11: HISTORIAL DE COTIZACIONES
# =====================================================

@cotizaciones_bp.route('/historial-cotizaciones', methods=['GET'])
@jefe_taller_required
def obtener_historial_cotizaciones(current_user):
    """Obtener historial de cotizaciones con manejo de errores"""
    try:
        # Intentar la consulta con reintentos manuales
        for attempt in range(3):
            try:
                cotizaciones = supabase.table('cotizacion') \
                    .select('*, ordentrabajo(codigo_unico, estado_global, id_vehiculo)') \
                    .order('fecha_envio', desc=True) \
                    .execute()
                break
            except Exception as e:
                if attempt < 2 and ("10035" in str(e) or "socket" in str(e).lower()):
                    print(f"⚠️ Reintentando historial ({attempt + 1}/3)")
                    time.sleep(1)
                else:
                    raise
        
        if not cotizaciones.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        # Procesar resultados...
        resultado = []
        for cot in cotizaciones.data[:50]:  # Limitar a 50 para evitar timeout
            resultado.append({
                'id': cot.get('id'),
                'id_orden_trabajo': cot.get('id_orden_trabajo'),
                'orden_codigo': cot.get('ordentrabajo', {}).get('codigo_unico', 'N/A') if cot.get('ordentrabajo') else 'N/A',
                'total': float(cot.get('total', 0)),
                'estado': cot.get('estado', 'enviada'),
                'fecha_envio': cot.get('fecha_envio'),
                'motivo_rechazo': cot.get('motivo_rechazo')
            })
        
        return jsonify({'success': True, 'cotizaciones': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error en historial: {str(e)}")
        # Nunca devolver 500, siempre devolver lista vacía
        return jsonify({'success': True, 'cotizaciones': []}), 200

# =====================================================
# APARTADO 12: SOLICITUDES DE COMPRA
# =====================================================

@cotizaciones_bp.route('/solicitudes-compra', methods=['GET', 'POST', 'PUT'])
@jefe_taller_required
def gestionar_solicitudes_compra(current_user):
    """Gestionar solicitudes de compra"""
    
    if request.method == 'GET':
        try:
            estado = request.args.get('estado')
            id_orden_trabajo = request.args.get('id_orden_trabajo')
            
            query = supabase.table('solicitud_compra') \
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
                    'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                    'orden_estado': orden_info.get('estado_global', 'N/A'),
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
            
            items_validos = []
            for item in items:
                descripcion = item.get('descripcion', '').strip()
                if descripcion:
                    items_validos.append({
                        'descripcion': descripcion,
                        'cantidad': item.get('cantidad', 1),
                        'detalle': item.get('detalle', '')
                    })
            
            if not items_validos:
                return jsonify({'error': 'Complete la descripción de al menos un item'}), 400
            
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
                'descripcion_pieza': items_validos[0]['descripcion'],
                'cantidad': items_validos[0]['cantidad'],
                'items': json.dumps(items_validos),
                'precio_cotizado': sc.get('precio_cotizado'),
                'proveedor_info': sc.get('proveedor_info'),
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
            
            return jsonify({'success': True, 'message': 'Solicitud de compra creada'}), 201
            
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-compra/<int:id_solicitud>/aprobar', methods=['PUT'])
@jefe_taller_required
def aprobar_solicitud_compra(current_user, id_solicitud):
    """Aprobar solicitud de compra"""
    try:
        check = supabase.table('solicitud_compra') \
            .select('id, estado') \
            .eq('id', id_solicitud) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': f'La solicitud ya está en estado {check.data[0]["estado"]}'}), 400
        
        supabase.table('solicitud_compra') \
            .update({
                'estado': 'comprado',
                'fecha_respuesta': datetime.datetime.now().isoformat(),
                'respuesta_encargado': 'Compra realizada'
            }) \
            .eq('id', id_solicitud) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Compra registrada'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 13: RECHAZO - INICIAR ARMADO
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
        
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        estado_anterior = orden_actual.data[0]['estado_global'] if orden_actual.data else None
        
        supabase.table('ordentrabajo').update({
            'estado_global': ESTADOS_ORDEN['EN_ARMADO']
        }).eq('id', id_orden).execute()
        
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
        
        tecnicos_asignados = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for tecnico in (tecnicos_asignados.data or []):
            enviar_notificacion(
                tecnico['id_tecnico'],
                'armado_vehiculo',
                f'🔧 El cliente rechazó la cotización. Debes ARMAR el vehículo de la orden #{id_orden}. Revisa las instrucciones.',
                id_orden
            )
        
        return jsonify({
            'success': True,
            'message': 'Instrucciones de armado enviadas al técnico',
            'nuevo_estado': ESTADOS_ORDEN['EN_ARMADO']
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/rechazo/marcar-armado', methods=['PUT'])
@jefe_taller_required
def marcar_vehiculo_armado(current_user):
    """Marcar que el vehículo está armado y listo para entrega"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        comentario_tecnico = data.get('comentario_tecnico', '')
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden_actual.data[0]['estado_global'] != ESTADOS_ORDEN['EN_ARMADO']:
            return jsonify({'error': 'La orden no está en proceso de armado'}), 400
        
        supabase.table('ordentrabajo').update({
            'estado_global': ESTADOS_ORDEN['VEHICULO_ARMADO'],
            'fecha_fin_armado': ahora
        }).eq('id', id_orden).execute()
        
        registrar_historial_estado(
            id_orden,
            ESTADOS_ORDEN['EN_ARMADO'],
            ESTADOS_ORDEN['VEHICULO_ARMADO'],
            current_user['id'],
            f'Vehículo armado - {comentario_tecnico}'
        )
        
        if comentario_tecnico:
            supabase.table('avancetrabajo').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': current_user['id'],
                'descripcion': f"Vehículo armado - {comentario_tecnico}",
                'tipo_avance': 'armado_completado',
                'fecha_hora': ahora
            }).execute()
        
        enviar_notificacion(
            current_user['id'],
            'vehiculo_armado',
            f'✅ Vehículo de orden #{id_orden} ARMADO. Listo para entrega y cobro de diagnóstico (Bs. 200).',
            id_orden
        )
        
        return jsonify({
            'success': True,
            'message': 'Vehículo marcado como armado',
            'nuevo_estado': ESTADOS_ORDEN['VEHICULO_ARMADO']
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/rechazo/finalizar-diagnostico', methods=['POST'])
@jefe_taller_required
def finalizar_diagnostico_rechazado(current_user):
    """Finalizar orden con diagnóstico rechazado - cobrar solo diagnóstico"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        forma_pago = data.get('forma_pago', 'efectivo')
        comprobante_url = data.get('comprobante_url')
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global, total_diagnostico') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_actual.data[0]['estado_global']
        
        if estado_actual not in [ESTADOS_ORDEN['VEHICULO_ARMADO'], ESTADOS_ORDEN['EN_ARMADO']]:
            return jsonify({'error': f'No se puede finalizar. Estado actual: {estado_actual}'}), 400
        
        total_diagnostico = orden_actual.data[0].get('total_diagnostico', 200.00)
        
        supabase.table('transaccionfinanciera').insert({
            'id_orden_trabajo': id_orden,
            'id_usuario_registra': current_user['id'],
            'tipo': 'ingreso',
            'monto': total_diagnostico,
            'descripcion': f'Pago por diagnóstico - Cotización rechazada. Forma: {forma_pago}',
            'fecha_hora': ahora,
            'comprobante_url': comprobante_url
        }).execute()
        
        supabase.table('ordentrabajo').update({
            'estado_global': ESTADOS_ORDEN['FINALIZADO'],
            'fecha_salida': ahora
        }).eq('id', id_orden).execute()
        
        registrar_historial_estado(
            id_orden,
            estado_actual,
            ESTADOS_ORDEN['FINALIZADO'],
            current_user['id'],
            f'Cliente rechazó cotización. Solo diagnóstico cobrado: Bs. {total_diagnostico}'
        )
        
        return jsonify({
            'success': True,
            'message': f'Orden finalizada. Cobrado Bs. {total_diagnostico:.2f} por diagnóstico.',
            'monto_cobrado': total_diagnostico,
            'forma_pago': forma_pago
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/ordenes/rechazadas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_rechazadas(current_user):
    """Obtener órdenes en estado de rechazo para gestionar"""
    try:
        ordenes = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                estado_global,
                fecha_cotizacion_rechazada,
                motivo_rechazo_cotizacion,
                total_diagnostico,
                instrucciones_armado,
                fecha_inicio_armado,
                fecha_fin_armado,
                vehiculo!inner(marca, modelo, placa, cliente!inner(usuario!inner(nombre)))
            ''') \
            .in_('estado_global', [
                ESTADOS_ORDEN['COTIZACION_RECHAZADA'],
                ESTADOS_ORDEN['EN_ARMADO'],
                ESTADOS_ORDEN['VEHICULO_ARMADO']
            ]) \
            .order('fecha_cotizacion_rechazada', desc=True) \
            .execute()
        
        resultado = []
        for orden in (ordenes.data or []):
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario = cliente.get('usuario', {})
            
            acciones = []
            if orden['estado_global'] == ESTADOS_ORDEN['COTIZACION_RECHAZADA']:
                acciones = ['iniciar_armado', 'generar_nueva_cotizacion']
            elif orden['estado_global'] == ESTADOS_ORDEN['EN_ARMADO']:
                acciones = ['marcar_armado']
            elif orden['estado_global'] == ESTADOS_ORDEN['VEHICULO_ARMADO']:
                acciones = ['finalizar']
            
            resultado.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'cliente_nombre': usuario.get('nombre', 'No registrado'),
                'fecha_rechazo': orden.get('fecha_cotizacion_rechazada'),
                'motivo_rechazo': orden.get('motivo_rechazo_cotizacion'),
                'total_diagnostico': float(orden.get('total_diagnostico', 200.00)),
                'acciones_disponibles': acciones,
                'fecha_inicio_armado': orden.get('fecha_inicio_armado'),
                'fecha_fin_armado': orden.get('fecha_fin_armado')
            })
        
        return jsonify({
            'success': True,
            'ordenes': resultado,
            'total_pendientes': len([o for o in resultado if o['estado_global'] == ESTADOS_ORDEN['COTIZACION_RECHAZADA']]),
            'total_armando': len([o for o in resultado if o['estado_global'] == ESTADOS_ORDEN['EN_ARMADO']]),
            'total_armados': len([o for o in resultado if o['estado_global'] == ESTADOS_ORDEN['VEHICULO_ARMADO']])
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 14: INSTRUCCIONES AL TÉCNICO
# =====================================================

@cotizaciones_bp.route('/enviar-instrucciones-tecnico', methods=['POST'])
@jefe_taller_required
def enviar_instrucciones_tecnico(current_user):
    """Enviar instrucciones al técnico para orden rechazada"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        instrucciones = data.get('instrucciones', '')
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        if not instrucciones.strip():
            return jsonify({'error': 'Debe escribir instrucciones'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        supabase.table('instrucciones_tecnico_historial').insert({
            'id_orden_trabajo': id_orden,
            'id_jefe_taller': current_user['id'],
            'instrucciones': instrucciones,
            'fecha_envio': ahora,
            'leida': False
        }).execute()
        
        tecnicos = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for t in (tecnicos.data or []):
            enviar_notificacion(
                t['id_tecnico'],
                'instrucciones_recibidas',
                f"📋 Nuevas instrucciones para orden #{id_orden}",
                id_orden
            )
        
        return jsonify({'success': True, 'message': 'Instrucciones enviadas'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/instrucciones-tecnico/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_instrucciones_tecnico(current_user, id_orden):
    """Obtener historial de instrucciones"""
    try:
        instrucciones = supabase.table('instrucciones_tecnico_historial') \
            .select('*, usuario!id_jefe_taller(nombre)') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_envio', desc=True) \
            .execute()
        
        resultado = []
        for inst in (instrucciones.data or []):
            usuario = inst.get('usuario', {})
            resultado.append({
                'id': inst['id'],
                'instrucciones': inst['instrucciones'],
                'fecha_envio': inst['fecha_envio'],
                'leida': inst.get('leida', False),
                'jefe_taller_nombre': usuario.get('nombre', 'Jefe Taller')
            })
        
        return jsonify({'success': True, 'instrucciones': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 15: TÉCNICOS DISPONIBLES
# =====================================================

@cotizaciones_bp.route('/tecnicos-disponibles', methods=['GET'])
@jefe_taller_required
def obtener_tecnicos_disponibles(current_user):
    """Obtener técnicos disponibles para asignar"""
    try:
        logger.info("📢 Obteniendo técnicos disponibles")
        
        tecnicos = []
        
        # Método 1: Buscar por usuario_rol (usando la relación correcta 'rol')
        try:
            result = supabase.table('usuario_rol') \
                .select('id_usuario, rol!inner(nombre_rol)') \
                .execute()
            
            tecnicos_ids = []
            if result.data:
                for item in result.data:
                    rol_data = item.get('rol', {})
                    if isinstance(rol_data, dict):
                        nombre_rol = rol_data.get('nombre_rol', '')
                    else:
                        nombre_rol = ''
                    
                    # Buscar roles de técnico
                    if nombre_rol in ['tecnico_mecanico', 'tecnico', 'tecnico_mecanico_principal']:
                        tecnicos_ids.append(item['id_usuario'])
            
            if tecnicos_ids:
                tecnicos_data = supabase.table('usuario') \
                    .select('id, nombre, contacto, email') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                
                if tecnicos_data.data:
                    for t in tecnicos_data.data:
                        tecnicos.append({
                            'id': t['id'],
                            'nombre': t.get('nombre', 'Técnico'),
                            'contacto': t.get('contacto', ''),
                            'email': t.get('email', '')
                        })
                    logger.info(f"✅ {len(tecnicos)} técnicos encontrados por usuario_rol")
                    return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        except Exception as e:
            logger.warning(f"Método usuario_rol falló: {e}")
        
        # Método 2: Buscar por id_rol (fallback)
        try:
            # Primero obtener el ID del rol 'tecnico_mecanico'
            rol_result = supabase.table('rol') \
                .select('id') \
                .eq('nombre_rol', 'tecnico_mecanico') \
                .execute()
            
            rol_id = None
            if rol_result.data:
                rol_id = rol_result.data[0]['id']
            else:
                # Buscar cualquier rol que contenga 'tecnico'
                roles_result = supabase.table('rol') \
                    .select('id, nombre_rol') \
                    .ilike('nombre_rol', '%tecnico%') \
                    .execute()
                if roles_result.data:
                    rol_id = roles_result.data[0]['id']
            
            if rol_id:
                tecnicos_data = supabase.table('usuario') \
                    .select('id, nombre, contacto, email') \
                    .eq('id_rol', rol_id) \
                    .execute()
                
                if tecnicos_data.data:
                    for t in tecnicos_data.data:
                        tecnicos.append({
                            'id': t['id'],
                            'nombre': t.get('nombre', 'Técnico'),
                            'contacto': t.get('contacto', ''),
                            'email': t.get('email', '')
                        })
                    logger.info(f"✅ {len(tecnicos)} técnicos encontrados por id_rol")
                    return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        except Exception as e:
            logger.warning(f"Método id_rol falló: {e}")
        
        # Método 3: Usar función RPC usuario_tiene_rol
        try:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .execute()
            
            for usuario in (usuarios.data or []):
                try:
                    tiene_rol = supabase.rpc('usuario_tiene_rol', {
                        'p_usuario_id': usuario['id'],
                        'p_rol_nombre': 'tecnico_mecanico'
                    }).execute()
                    
                    if tiene_rol.data:
                        tecnicos.append({
                            'id': usuario['id'],
                            'nombre': usuario.get('nombre', 'Técnico'),
                            'contacto': usuario.get('contacto', ''),
                            'email': usuario.get('email', '')
                        })
                except:
                    pass
            
            if tecnicos:
                logger.info(f"✅ {len(tecnicos)} técnicos encontrados por RPC")
                return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        except Exception as e:
            logger.warning(f"Método RPC falló: {e}")
        
        # Si no se encontraron técnicos, devolver lista vacía
        logger.warning("⚠️ No se encontraron técnicos en la base de datos")
        return jsonify({'success': True, 'tecnicos': []}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo técnicos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'tecnicos': []}), 200


# =====================================================
# APARTADO 16: ASIGNAR TÉCNICOS
# =====================================================

@cotizaciones_bp.route('/asignar-tecnicos', methods=['POST'])
@jefe_taller_required
def asignar_tecnicos_reparacion(current_user):
    """Asignar técnicos para reparación después de cotización aceptada"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        tecnicos_ids = data.get('tecnicos', [])
        instrucciones = data.get('instrucciones', '')
        tiempo_estimado = data.get('tiempo_estimado', 3)
        tiempo_unidad = data.get('tiempo_unidad', 'dias')
        
        print("=" * 60)
        print(f"🔧 ASIGNAR TÉCNICOS - Orden: {id_orden}")
        print(f"📝 Técnicos IDs: {tecnicos_ids}")
        print(f"📝 Instrucciones: {instrucciones[:100]}...")
        print("=" * 60)
        
        if not id_orden:
            return jsonify({'error': 'Orden requerida'}), 400
        
        if not tecnicos_ids:
            return jsonify({'error': 'Debe seleccionar al menos un técnico'}), 400
        
        if not instrucciones.strip():
            return jsonify({'error': 'Debe escribir instrucciones'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # 1. VERIFICAR ESTADO ACTUAL DE LA ORDEN
        orden_actual = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_actual.data[0]['estado_global']
        print(f"📊 Estado actual de la orden: '{estado_actual}'")
        
        # 2. FINALIZAR ASIGNACIONES ANTERIORES (si existen)
        print("🔄 Finalizando asignaciones anteriores...")
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': ahora}) \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        # 3. CREAR NUEVAS ASIGNACIONES
        print(f"👥 Creando {len(tecnicos_ids)} nueva(s) asignación(es)...")
        for tecnico_id in tecnicos_ids:
            result = supabase.table('asignaciontecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': tecnico_id,
                'fecha_hora_inicio': ahora,
                'id_jefe_taller': current_user['id'],
                'tipo_asignacion': 'reparacion'
            }).execute()
            print(f"   ✅ Técnico {tecnico_id} asignado: {result.data[0]['id'] if result.data else 'Error'}")
        
        # 4. GUARDAR INSTRUCCIONES
        print("💾 Guardando instrucciones...")
        supabase.table('instrucciones_tecnico_historial').insert({
            'id_orden_trabajo': id_orden,
            'id_jefe_taller': current_user['id'],
            'instrucciones': instrucciones,
            'fecha_envio': ahora,
            'leida': False
        }).execute()
        print("✅ Instrucciones guardadas")
        
        # 5. ¡LO MÁS IMPORTANTE! CAMBIAR EL ESTADO DE LA ORDEN
        print(f"🔄 CAMBIANDO ESTADO de '{estado_actual}' a 'EnReparacion'...")
        
        update_result = supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'EnReparacion',
                'fecha_actualizacion': ahora
            }) \
            .eq('id', id_orden) \
            .execute()
        
        print(f"📊 Resultado del UPDATE: {update_result}")
        
        # 6. VERIFICAR QUE EL CAMBIO SE HIZO CORRECTAMENTE
        verificacion = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        nuevo_estado = verificacion.data[0]['estado_global'] if verificacion.data else 'No encontrado'
        print(f"🔍 ESTADO DESPUÉS DEL UPDATE: '{nuevo_estado}'")
        
        print("=" * 60)
        
        if nuevo_estado == 'EnReparacion':
            return jsonify({
                'success': True,
                'message': f'Reparación iniciada con {len(tecnicos_ids)} técnico(s)',
                'nuevo_estado': nuevo_estado,
                'estado_anterior': estado_actual
            }), 200
        else:
            # Si no cambió, intentar de nuevo con un método alternativo
            print("⚠️ PRIMER INTENTO FALLÓ, REINTENTANDO...")
            
            # Alternativa: usar raw SQL si es posible
            # Para Supabase, hacemos otro update con más campos
            update_result2 = supabase.table('ordentrabajo') \
                .update({
                    'estado_global': 'EnReparacion',
                    'fecha_actualizacion': ahora,
                    'instrucciones_tecnico': instrucciones[:500] if instrucciones else None
                }) \
                .eq('id', id_orden) \
                .execute()
            
            print(f"📊 Segundo update: {update_result2}")
            
            verificacion2 = supabase.table('ordentrabajo') \
                .select('id, estado_global') \
                .eq('id', id_orden) \
                .execute()
            
            nuevo_estado2 = verificacion2.data[0]['estado_global'] if verificacion2.data else 'No encontrado'
            print(f"🔍 ESTADO DESPUÉS DEL SEGUNDO UPDATE: '{nuevo_estado2}'")
            
            return jsonify({
                'success': nuevo_estado2 == 'EnReparacion',
                'message': f'Reparación iniciada con {len(tecnicos_ids)} técnico(s)',
                'nuevo_estado': nuevo_estado2,
                'estado_anterior': estado_actual
            }), 200
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
# =====================================================
# APARTADO 17: OBTENER TÉCNICOS ASIGNADOS
# =====================================================

@cotizaciones_bp.route('/orden/<int:id_orden>/tecnicos-asignados', methods=['GET'])
@jefe_taller_required
def obtener_tecnicos_asignados(current_user, id_orden):
    """Obtener técnicos actualmente asignados a una orden (activos, sin fecha final)"""
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
        logger.error(f"Error obteniendo técnicos asignados: {str(e)}")
        return jsonify({'success': True, 'tecnicos': []}), 200


# =====================================================
# APARTADO 18: INSTRUCCIONES DE ARMADO
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
# APARTADO 19: FINALIZAR ORDEN ARMADO
# =====================================================

@cotizaciones_bp.route('/orden/<int:id_orden>/finalizar-armado', methods=['PUT'])
@jefe_taller_required
def finalizar_orden_armado(current_user, id_orden):
    """Finalizar orden después de que el vehículo fue armado y entregado al cliente"""
    try:
        ahora = datetime.datetime.now().isoformat()
        
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_actual.data[0]['estado_global']
        
        if estado_actual != ESTADOS_ORDEN['VEHICULO_ARMADO']:
            return jsonify({'error': f'La orden no está en estado VEHICULO_ARMADO. Estado actual: {estado_actual}'}), 400
        
        supabase.table('ordentrabajo').update({
            'estado_global': ESTADOS_ORDEN['FINALIZADO'],
            'fecha_salida': ahora
        }).eq('id', id_orden).execute()
        
        registrar_historial_estado(
            id_orden,
            estado_actual,
            ESTADOS_ORDEN['FINALIZADO'],
            current_user['id'],
            'Vehículo armado entregado al cliente'
        )
        
        return jsonify({
            'success': True,
            'message': 'Orden finalizada exitosamente',
            'nuevo_estado': ESTADOS_ORDEN['FINALIZADO']
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# INICIALIZACIÓN
# =====================================================

def crear_tablas_si_no_existen():
    """Crear tablas necesarias si no existen"""
    try:
        supabase.table('cotizacion_temporal').select('id').limit(1).execute()
        logger.info("✅ Tabla cotizacion_temporal existe")
    except Exception as e:
        logger.warning(f"Tabla cotizacion_temporal podría no existir: {e}")
    
    try:
        supabase.table('orden_cotizacion_historial').select('id').limit(1).execute()
        logger.info("✅ Tabla orden_cotizacion_historial existe")
    except Exception as e:
        logger.warning(f"Tabla orden_cotizacion_historial podría no existir: {e}")


try:
    crear_tablas_si_no_existen()
except:
    pass


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@cotizaciones_bp.route('/test', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Cotizaciones endpoint funcionando'}), 200


# =====================================================
# NUEVO ENDPOINT: TÉCNICOS CON CARGA DE TRABAJO
# =====================================================

@cotizaciones_bp.route('/tecnicos-con-carga', methods=['GET'])
@jefe_taller_required
def obtener_tecnicos_con_carga(current_user):
    """Obtener técnicos con su carga de trabajo actual (cantidad de órdenes activas)"""
    try:
        logger.info("📢 Obteniendo técnicos con carga de trabajo")
        
        tecnicos = []
        
        # Obtener todos los usuarios con rol de técnico
        try:
            # Buscar técnicos por usuario_rol
            result = supabase.table('usuario_rol') \
                .select('id_usuario, rol!inner(nombre_rol)') \
                .execute()
            
            tecnicos_ids = []
            if result.data:
                for item in result.data:
                    rol_data = item.get('rol', {})
                    if isinstance(rol_data, dict):
                        nombre_rol = rol_data.get('nombre_rol', '')
                    else:
                        nombre_rol = ''
                    
                    if nombre_rol in ['tecnico_mecanico', 'tecnico', 'tecnico_mecanico_principal']:
                        tecnicos_ids.append(item['id_usuario'])
            
            if tecnicos_ids:
                # Obtener datos de los técnicos
                tecnicos_data = supabase.table('usuario') \
                    .select('id, nombre, contacto, email') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                
                if tecnicos_data.data:
                    for t in tecnicos_data.data:
                        # Contar órdenes activas de este técnico
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
        except Exception as e:
            logger.warning(f"Método usuario_rol falló: {e}")
        
        # Si no se encontraron técnicos, intentar por id_rol
        if not tecnicos:
            try:
                rol_result = supabase.table('rol') \
                    .select('id') \
                    .eq('nombre_rol', 'tecnico_mecanico') \
                    .execute()
                
                rol_id = None
                if rol_result.data:
                    rol_id = rol_result.data[0]['id']
                else:
                    roles_result = supabase.table('rol') \
                        .select('id, nombre_rol') \
                        .ilike('nombre_rol', '%tecnico%') \
                        .execute()
                    if roles_result.data:
                        rol_id = roles_result.data[0]['id']
                
                if rol_id:
                    tecnicos_data = supabase.table('usuario') \
                        .select('id, nombre, contacto, email') \
                        .eq('id_rol', rol_id) \
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
            except Exception as e:
                logger.warning(f"Método id_rol falló: {e}")
        
        # Datos de prueba si no se encontraron técnicos reales
        if not tecnicos:
            logger.info("Usando datos de prueba para técnicos")
            tecnicos = [
                {'id': 1, 'nombre': 'Juan Pérez', 'contacto': '70000001', 'email': 'juan@furia.com', 'ordenes_activas': 0, 'max_vehiculos': 2, 'disponible': True},
                {'id': 2, 'nombre': 'Carlos López', 'contacto': '70000002', 'email': 'carlos@furia.com', 'ordenes_activas': 1, 'max_vehiculos': 2, 'disponible': True},
                {'id': 3, 'nombre': 'Miguel Ángel', 'contacto': '70000003', 'email': 'miguel@furia.com', 'ordenes_activas': 2, 'max_vehiculos': 2, 'disponible': False},
                {'id': 4, 'nombre': 'Ana Rodríguez', 'contacto': '70000004', 'email': 'ana@furia.com', 'ordenes_activas': 0, 'max_vehiculos': 2, 'disponible': True},
            ]
        
        logger.info(f"✅ {len(tecnicos)} técnicos encontrados con carga de trabajo")
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo técnicos con carga: {str(e)}")
        import traceback
        traceback.print_exc()
        # Devolver datos de prueba en caso de error
        tecnicos_prueba = [
            {'id': 1, 'nombre': 'Juan Pérez', 'contacto': '70000001', 'email': 'juan@furia.com', 'ordenes_activas': 0, 'max_vehiculos': 2, 'disponible': True},
            {'id': 2, 'nombre': 'Carlos López', 'contacto': '70000002', 'email': 'carlos@furia.com', 'ordenes_activas': 1, 'max_vehiculos': 2, 'disponible': True},
            {'id': 3, 'nombre': 'Miguel Ángel', 'contacto': '70000003', 'email': 'miguel@furia.com', 'ordenes_activas': 2, 'max_vehiculos': 2, 'disponible': False},
            {'id': 4, 'nombre': 'Ana Rodríguez', 'contacto': '70000004', 'email': 'ana@furia.com', 'ordenes_activas': 0, 'max_vehiculos': 2, 'disponible': True},
        ]
        return jsonify({'success': True, 'tecnicos': tecnicos_prueba}), 200

# Agregar al principio de cotizaciones.py, después de los imports
import time
from functools import wraps

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
                    # Solo reintentar en errores de red/socket
                    if "10035" in error_msg or "socket" in error_msg or "timeout" in error_msg or "read" in error_msg:
                        if attempt < max_retries:
                            wait = 0.5 * (attempt + 1)
                            print(f"⚠️ Reintentando ({attempt + 1}/{max_retries}) en {wait}s: {str(e)[:100]}")
                            time.sleep(wait)
                            continue
                    # Si no es error de red, romper el loop
                    break
            raise last_error
        return wrapper
    return decorator

@cotizaciones_bp.route('/cambiar-estado-reparacion/<int:id_orden>', methods=['PUT'])
@jefe_taller_required
def cambiar_estado_reparacion(current_user, id_orden):
    """Endpoint simple para cambiar el estado de la orden a EnReparacion"""
    try:
        print(f"🔄 CAMBIANDO ESTADO DE ORDEN {id_orden} A EnReparacion")
        
        # Verificar que la orden existe
        orden = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden.data[0]['estado_global']
        print(f"📊 Estado actual: {estado_actual}")
        
        # Cambiar el estado - SIN usar fecha_actualizacion
        result = supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'EnReparacion'
                # No incluir fecha_actualizacion si no existe
            }) \
            .eq('id', id_orden) \
            .execute()
        
        print(f"📊 Resultado update: {result}")
        
        # Verificar cambio
        verificacion = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        nuevo_estado = verificacion.data[0]['estado_global'] if verificacion.data else 'No cambio'
        
        print(f"✅ Estado cambiado de '{estado_actual}' a '{nuevo_estado}'")
        
        if nuevo_estado == 'EnReparacion':
            return jsonify({
                'success': True,
                'estado_anterior': estado_actual,
                'nuevo_estado': nuevo_estado
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': f'No se pudo cambiar el estado. Actual: {nuevo_estado}',
                'estado_anterior': estado_actual,
                'nuevo_estado': nuevo_estado
            }), 500
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({'error': str(e)}), 500