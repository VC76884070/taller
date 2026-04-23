# =====================================================
# COTIZACIONES - JEFE DE TALLER
# FURIA MOTOR COMPANY SRL
# =====================================================
# Módulo con 3 apartados:
# 1. Solicitar Cotización al Encargado de Repuestos (con múltiples items)
# 2. Gestión de Servicios y Cotización al Cliente
# 3. Solicitar Compra al Encargado de Repuestos (con múltiples items)
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
# FUNCIONES AUXILIARES
# =====================================================

def obtener_encargados_repuestos():
    """Obtener lista de usuarios con rol encargado_repuestos"""
    try:
        usuarios = supabase.table('usuario').select('id, nombre, contacto, email').execute()
        
        if not usuarios.data:
            return []
        
        encargados = []
        for usuario in usuarios.data:
            try:
                tiene_rol = supabase.rpc('usuario_tiene_rol', {
                    'p_usuario_id': usuario['id'],
                    'p_rol_nombre': 'encargado_repuestos'
                }).execute()
                
                if tiene_rol.data:
                    encargados.append(usuario)
            except Exception as e:
                logger.warning(f"Error verificando rol para usuario {usuario['id']}: {e}")
                continue
        
        return encargados
    except Exception as e:
        logger.error(f"Error obteniendo encargados de repuestos: {e}")
        return []

def verificar_rol_usuario(usuario_id, rol_nombre):
    """Verificar si un usuario tiene un rol específico"""
    try:
        result = supabase.rpc('usuario_tiene_rol', {
            'p_usuario_id': usuario_id,
            'p_rol_nombre': rol_nombre
        }).execute()
        return result.data if result.data else False
    except Exception as e:
        logger.error(f"Error verificando rol: {e}")
        return False

# =====================================================
# APARTADO 1: SOLICITAR COTIZACIÓN AL ENCARGADO DE REPUESTOS
# =====================================================

@cotizaciones_bp.route('/ordenes-aprobadas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_aprobadas(current_user):
    """Órdenes con diagnóstico APROBADO (para solicitar cotización)"""
    try:
        query = supabase.table('diagnostico_tecnico') \
            .select('id, id_orden_trabajo, estado') \
            .eq('estado', 'aprobado') \
            .execute()
        
        if not query.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_ids = list(set([d['id_orden_trabajo'] for d in query.data if d.get('id_orden_trabajo')]))
        
        if not ordenes_ids:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .in_('id', ordenes_ids) \
            .execute()
        
        ordenes = []
        for o in (ordenes_result.data or []):
            vehiculo = o.get('vehiculo', {})
            ordenes.append({
                'id_orden': o['id'],
                'codigo_unico': o.get('codigo_unico'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip()
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes aprobadas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/servicios-por-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_servicios_por_orden(current_user, id_orden):
    """Servicios de una orden con diagnóstico aprobado"""
    try:
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('estado', 'aprobado') \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'success': True, 'servicios': []}), 200
        
        servicios = supabase.table('servicio_tecnico') \
            .select('id, descripcion, orden') \
            .eq('id_diagnostico_tecnico', diagnostico.data[0]['id']) \
            .order('orden') \
            .execute()
        
        return jsonify({'success': True, 'servicios': servicios.data or []}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo servicios: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/encargados-repuestos', methods=['GET'])
@jefe_taller_required
def obtener_encargados_repuestos_endpoint(current_user):
    """Obtener lista de encargados de repuestos"""
    try:
        encargados = obtener_encargados_repuestos()
        return jsonify({'success': True, 'encargados': encargados}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo encargados: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-cotizacion', methods=['GET'])
@jefe_taller_required
def obtener_solicitudes_cotizacion(current_user):
    """Obtener todas las solicitudes de cotización con sus items"""
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
                .select('id, codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
                .in_('id', ordenes_ids) \
                .execute()
            
            for o in (ordenes_result.data or []):
                v = o.get('vehiculo', {})
                ordenes_map[o['id']] = {
                    'codigo_unico': o.get('codigo_unico'),
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
            
            # Parsear items desde JSON
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
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'servicio_descripcion': servicios_map.get(s.get('id_servicio'), 'N/A'),
                'items': items,
                'descripcion_pieza': items[0].get('descripcion') if items else s.get('descripcion_pieza'),
                'cantidad': items[0].get('cantidad') if items else s.get('cantidad', 1),
                'estado': s.get('estado', 'pendiente'),
                'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'proveedor_info': s.get('proveedor_info'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_respuesta': s.get('fecha_respuesta'),
                'observacion_jefe_taller': s.get('observacion_jefe_taller'),
                'respuesta_encargado': s.get('respuesta_encargado')
            })
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitudes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-cotizacion', methods=['POST'])
@jefe_taller_required
def crear_solicitud_cotizacion(current_user):
    """Crear nueva solicitud de cotización con múltiples items"""
    try:
        data = request.get_json()
        
        id_orden_trabajo = data.get('id_orden_trabajo')
        id_servicio = data.get('id_servicio')
        id_encargado_repuestos = data.get('id_encargado_repuestos')
        items = data.get('items', [])
        observacion = data.get('observacion_jefe_taller', '')
        
        if not id_orden_trabajo:
            return jsonify({'error': 'Orden de trabajo requerida'}), 400
        
        if not id_servicio:
            return jsonify({'error': 'Servicio requerido'}), 400
        
        if not id_encargado_repuestos:
            return jsonify({'error': 'Encargado de repuestos requerido'}), 400
        
        if not items or len(items) == 0:
            return jsonify({'error': 'Debe agregar al menos un item'}), 400
        
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
        
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden_trabajo) \
            .eq('estado', 'aprobado') \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'La orden no tiene diagnóstico aprobado'}), 400
        
        servicio_check = supabase.table('servicio_tecnico') \
            .select('id') \
            .eq('id', id_servicio) \
            .eq('id_diagnostico_tecnico', diagnostico.data[0]['id']) \
            .execute()
        
        if not servicio_check.data:
            return jsonify({'error': 'El servicio no pertenece al diagnóstico de esta orden'}), 400
        
        es_encargado = verificar_rol_usuario(id_encargado_repuestos, 'encargado_repuestos')
        if not es_encargado:
            return jsonify({'error': 'El usuario seleccionado no tiene el rol de encargado de repuestos'}), 400
        
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', id_orden_trabajo) \
            .execute()
        orden_codigo = orden.data[0]['codigo_unico'] if orden.data else 'N/A'
        
        nueva_solicitud = {
            'id_orden_trabajo': id_orden_trabajo,
            'id_servicio': id_servicio,
            'id_jefe_taller': current_user['id'],
            'id_encargado_repuestos': id_encargado_repuestos,
            'descripcion_pieza': items_validos[0]['descripcion'],
            'cantidad': items_validos[0]['cantidad'],
            'items': json.dumps(items_validos),
            'estado': 'pendiente',
            'observacion_jefe_taller': observacion,
            'fecha_solicitud': datetime.datetime.now().isoformat()
        }
        
        result = supabase.table('solicitud_cotizacion_repuesto') \
            .insert(nueva_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'No se pudo crear la solicitud'}), 500
        
        supabase.table('notificacion').insert({
            'id_usuario_destino': id_encargado_repuestos,
            'tipo': 'solicitud_cotizacion',
            'mensaje': f"📋 Nueva solicitud de cotización: {len(items_validos)} item(s) (Orden: {orden_codigo})",
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False
        }).execute()
        
        return jsonify({
            'success': True,
            'message': f'Solicitud de cotización creada con {len(items_validos)} item(s)',
            'solicitud': result.data[0]
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando solicitud: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-cotizacion/<int:id_solicitud>', methods=['DELETE'])
@jefe_taller_required
def eliminar_solicitud_cotizacion(current_user, id_solicitud):
    """Eliminar una solicitud de cotización (solo si está pendiente)"""
    try:
        check = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id, estado') \
            .eq('id', id_solicitud) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada o no autorizada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': f'No se puede eliminar una solicitud en estado {check.data[0]["estado"]}'}), 400
        
        supabase.table('solicitud_cotizacion_repuesto') \
            .delete() \
            .eq('id', id_solicitud) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Solicitud eliminada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error eliminando solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 2: SERVICIOS Y COTIZACIÓN AL CLIENTE
# =====================================================

@cotizaciones_bp.route('/servicios-cotizados', methods=['GET'])
@jefe_taller_required
def obtener_servicios_cotizados(current_user):
    """Servicios que ya tienen precios cotizados por repuestos (con items)"""
    try:
        solicitudes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('estado', 'cotizado') \
            .execute()
        
        if not solicitudes.data:
            return jsonify({'success': True, 'servicios': []}), 200
        
        ordenes_map = {}
        
        for s in solicitudes.data:
            id_orden = s.get('id_orden_trabajo')
            id_servicio = s.get('id_servicio')
            
            # 🔥 FILTRO IMPORTANTE: Saltar solicitudes sin servicio válido
            if not id_servicio:
                logger.warning(f"Solicitud {s.get('id')} no tiene id_servicio, omitiendo...")
                continue
            
            if not id_orden:
                logger.warning(f"Solicitud {s.get('id')} no tiene id_orden_trabajo, omitiendo...")
                continue
            
            if id_orden not in ordenes_map:
                orden_info = supabase.table('ordentrabajo') \
                    .select('id, codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa, cliente!inner(usuario!inner(nombre)))') \
                    .eq('id', id_orden) \
                    .execute()
                
                if orden_info.data:
                    o = orden_info.data[0]
                    v = o.get('vehiculo', {})
                    c = v.get('cliente', {})
                    u = c.get('usuario', {})
                    
                    ordenes_map[id_orden] = {
                        'id_orden': id_orden,
                        'codigo_unico': o.get('codigo_unico'),
                        'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', '')})".strip(),
                        'cliente_nombre': u.get('nombre', 'No registrado'),
                        'servicios': []
                    }
            
            # Parsear items
            items = []
            if s.get('items'):
                try:
                    items = json.loads(s['items']) if isinstance(s['items'], str) else s['items']
                except:
                    items = [{'descripcion': s.get('descripcion_pieza'), 'cantidad': s.get('cantidad', 1)}]
            
            # 🔥 OBTENER SERVICIO CON MANEJO DE ERRORES
            servicio_info = supabase.table('servicio_tecnico') \
                .select('descripcion') \
                .eq('id', id_servicio) \
                .execute()
            
            descripcion_servicio = 'Servicio'
            if servicio_info.data:
                descripcion_servicio = servicio_info.data[0].get('descripcion', 'Servicio')
            else:
                logger.warning(f"No se encontró servicio con id {id_servicio}")
            
            if id_orden in ordenes_map:
                ordenes_map[id_orden]['servicios'].append({
                    'id_servicio': id_servicio,
                    'id_solicitud': s.get('id'),
                    'descripcion': descripcion_servicio,
                    'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else 0,
                    'items': items
                })
        
        # 🔥 FILTRAR órdenes que tienen al menos un servicio con precio > 0
        ordenes_con_precio = []
        for orden_key, orden_data in ordenes_map.items():
            servicios_con_precio = [s for s in orden_data['servicios'] if s.get('precio_cotizado', 0) > 0]
            if servicios_con_precio:
                orden_data['servicios'] = servicios_con_precio
                ordenes_con_precio.append(orden_data)
        
        return jsonify({'success': True, 'servicios': ordenes_con_precio}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo servicios cotizados: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/enviar-cotizacion-cliente', methods=['POST'])
@jefe_taller_required
def enviar_cotizacion_cliente(current_user):
    """Enviar cotización al cliente con servicios y precios"""
    try:
        data = request.get_json()
        
        id_orden = data.get('id_orden')
        servicios = data.get('servicios', [])
        sugerencias_generales = data.get('sugerencias_generales', '')
        
        if not id_orden:
            return jsonify({'error': 'Orden de trabajo requerida'}), 400
        
        if not servicios:
            return jsonify({'error': 'Debe haber al menos un servicio'}), 400
        
        # Verificar si ya existe cotización
        cotizacion_existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        id_cotizacion = None
        if cotizacion_existente.data:
            id_cotizacion = cotizacion_existente.data[0]['id']
            supabase.table('cotizacion') \
                .update({
                    'estado': 'enviada',
                    'fecha_generacion': datetime.datetime.now().isoformat()
                }) \
                .eq('id', id_cotizacion) \
                .execute()
        else:
            nueva_cotizacion = {
                'id_orden_trabajo': id_orden,
                'fecha_generacion': datetime.datetime.now().isoformat(),
                'estado': 'enviada'
            }
            result = supabase.table('cotizacion') \
                .insert(nueva_cotizacion) \
                .execute()
            
            if result.data:
                id_cotizacion = result.data[0]['id']
        
        if not id_cotizacion:
            return jsonify({'error': 'No se pudo crear la cotización'}), 500
        
        # Guardar detalles de la cotización
        for serv in servicios:
            detalle_data = {
                'id_cotizacion': id_cotizacion,
                'id_servicio': serv['id_servicio'],
                'precio': serv['precio'],
                'aprobado_por_cliente': False
            }
            
            supabase.table('cotizacion_servicio') \
                .upsert(detalle_data, on_conflict='id_cotizacion,id_servicio') \
                .execute()
        
        # Actualizar estado de la orden
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'cotizacion_enviada'}) \
            .eq('id', id_orden) \
            .execute()
        
        # Obtener información del cliente
        orden = supabase.table('ordentrabajo') \
            .select('id_vehiculo, vehiculo!inner(id_cliente, cliente!inner(id_usuario, usuario!inner(nombre)))') \
            .eq('id', id_orden) \
            .execute()
        
        usuario_cliente = None
        cliente_nombre = 'Cliente'
        
        if orden.data and orden.data[0].get('vehiculo'):
            v = orden.data[0]['vehiculo']
            if v.get('cliente'):
                cliente_nombre = v['cliente'].get('usuario', {}).get('nombre', 'Cliente')
                usuario_cliente = v['cliente'].get('id_usuario')
        
        total = sum(s.get('precio', 0) for s in servicios)
        
        if usuario_cliente:
            supabase.table('notificacion').insert({
                'id_usuario_destino': usuario_cliente,
                'tipo': 'cotizacion_recibida',
                'mensaje': f"📄 Hola {cliente_nombre}, has recibido una nueva cotización. Total: Bs. {total:.2f}",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        return jsonify({
            'success': True,
            'message': 'Cotización enviada al cliente exitosamente',
            'id_cotizacion': id_cotizacion
        }), 200
        
    except Exception as e:
        logger.error(f"Error enviando cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/cotizaciones-enviadas', methods=['GET'])
@jefe_taller_required
def obtener_cotizaciones_enviadas(current_user):
    """Obtener cotizaciones enviadas y respuestas de clientes"""
    try:
        cotizaciones = supabase.table('cotizacion') \
            .select('*') \
            .in_('estado', ['enviada', 'aprobada', 'rechazada', 'aprobada_parcial']) \
            .order('fecha_generacion', desc=True) \
            .execute()
        
        if not cotizaciones.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        resultado = []
        for cot in cotizaciones.data:
            id_orden = cot.get('id_orden_trabajo')
            
            orden = supabase.table('ordentrabajo') \
                .select('codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa, cliente!inner(usuario!inner(nombre)))') \
                .eq('id', id_orden) \
                .execute()
            
            if not orden.data:
                continue
            
            o = orden.data[0]
            v = o.get('vehiculo', {})
            c = v.get('cliente', {})
            u = c.get('usuario', {})
            
            detalles = supabase.table('cotizacion_servicio') \
                .select('id_servicio, precio, aprobado_por_cliente') \
                .eq('id_cotizacion', cot['id']) \
                .execute()
            
            servicios_aprobados = [d for d in (detalles.data or []) if d.get('aprobado_por_cliente')]
            total_aprobado = sum(float(d.get('precio', 0)) for d in servicios_aprobados)
            
            estado_cliente = cot.get('estado', 'enviada')
            if estado_cliente == 'enviada':
                if detalles.data:
                    if all(d.get('aprobado_por_cliente') for d in detalles.data):
                        estado_cliente = 'aprobado_total'
                    elif any(d.get('aprobado_por_cliente') for d in detalles.data):
                        estado_cliente = 'aprobado_parcial'
            
            resultado.append({
                'id': cot['id'],
                'id_orden_trabajo': id_orden,
                'orden_codigo': o.get('codigo_unico'),
                'vehiculo': f"{v.get('marca', '')} {v.get('modelo', '')}",
                'cliente_nombre': u.get('nombre', 'No registrado'),
                'total': total_aprobado,
                'servicios_aprobados': len(servicios_aprobados),
                'estado_cliente': estado_cliente,
                'fecha_envio': cot.get('fecha_generacion')
            })
        
        return jsonify({'success': True, 'cotizaciones': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotizaciones enviadas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/detalle-cotizacion/<int:id_cotizacion>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_cotizacion(current_user, id_cotizacion):
    """Obtener detalle completo de una cotización"""
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
            .select('codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .eq('id', id_orden) \
            .execute()
        
        orden_info = orden.data[0] if orden.data else {}
        vehiculo_info = orden_info.get('vehiculo', {}) if orden_info else {}
        
        detalles = supabase.table('cotizacion_servicio') \
            .select('''
                id_servicio,
                precio,
                aprobado_por_cliente,
                fecha_aprobacion,
                servicio_tecnico!inner(descripcion)
            ''') \
            .eq('id_cotizacion', id_cotizacion) \
            .execute()
        
        servicios_list = []
        total = 0
        for d in (detalles.data or []):
            precio = float(d.get('precio', 0))
            total += precio
            servicio = d.get('servicio_tecnico', {})
            servicios_list.append({
                'descripcion': servicio.get('descripcion') if servicio else 'Servicio',
                'precio': precio,
                'aprobado_por_cliente': d.get('aprobado_por_cliente', False),
                'fecha_aprobacion': d.get('fecha_aprobacion')
            })
        
        resultado = {
            'id': cot['id'],
            'id_orden_trabajo': id_orden,
            'orden_codigo': orden_info.get('codigo_unico') if orden_info else 'N/A',
            'vehiculo': f"{vehiculo_info.get('marca', '')} {vehiculo_info.get('modelo', '')} ({vehiculo_info.get('placa', '')})".strip(),
            'fecha_generacion': cot.get('fecha_generacion'),
            'estado': cot.get('estado'),
            'servicios': servicios_list,
            'total': total,
            'estado_cliente': cot.get('estado', 'enviada')
        }
        
        return jsonify({'success': True, 'detalle': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 3: SOLICITAR COMPRA
# =====================================================

@cotizaciones_bp.route('/solicitudes-compra', methods=['GET'])
@jefe_taller_required
def obtener_solicitudes_compra(current_user):
    """Obtener solicitudes de compra con sus items"""
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
        servicios_ids = list(set([s.get('id_servicio') for s in result.data if s.get('id_servicio')]))
        
        ordenes_map = {}
        if ordenes_ids:
            ordenes_result = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
                .in_('id', ordenes_ids) \
                .execute()
            
            for o in (ordenes_result.data or []):
                v = o.get('vehiculo', {})
                ordenes_map[o['id']] = {
                    'codigo_unico': o.get('codigo_unico'),
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
                'id_solicitud_cotizacion': s.get('id_solicitud_cotizacion'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'servicio_descripcion': servicios_map.get(s.get('id_servicio'), 'N/A'),
                'items': items,
                'descripcion_pieza': items[0].get('descripcion') if items else s.get('descripcion_pieza'),
                'cantidad': items[0].get('cantidad') if items else s.get('cantidad', 1),
                'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'proveedor_info': s.get('proveedor_info'),
                'estado': s.get('estado', 'pendiente'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_respuesta': s.get('fecha_respuesta'),
                'mensaje_jefe_taller': s.get('mensaje_jefe_taller'),
                'respuesta_encargado': s.get('respuesta_encargado')
            })
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitudes de compra: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-compra', methods=['POST'])
@jefe_taller_required
def crear_solicitud_compra(current_user):
    """Crear nueva solicitud de compra con múltiples items"""
    try:
        data = request.get_json()
        
        id_solicitud_cotizacion = data.get('id_solicitud_cotizacion')
        items = data.get('items', [])
        mensaje = data.get('mensaje', '')
        
        if not id_solicitud_cotizacion:
            return jsonify({'error': 'Solicitud de cotización requerida'}), 400
        
        if not items or len(items) == 0:
            return jsonify({'error': 'Debe agregar al menos un item'}), 400
        
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
        
        if sc.get('estado') != 'cotizado':
            return jsonify({'error': 'La solicitud debe estar cotizada para solicitar compra'}), 400
        
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
            'fecha_solicitud': datetime.datetime.now().isoformat()
        }
        
        result = supabase.table('solicitud_compra') \
            .insert(nueva_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'No se pudo crear la solicitud de compra'}), 500
        
        supabase.table('solicitud_cotizacion_repuesto') \
            .update({'estado': 'aprobado'}) \
            .eq('id', id_solicitud_cotizacion) \
            .execute()
        
        if sc.get('id_encargado_repuestos'):
            supabase.table('notificacion').insert({
                'id_usuario_destino': sc['id_encargado_repuestos'],
                'tipo': 'solicitud_compra',
                'mensaje': f"🛒 Nueva solicitud de compra: {len(items_validos)} item(s)",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        return jsonify({
            'success': True,
            'message': f'{len(items_validos)} solicitud(es) de compra creada(s) exitosamente',
            'solicitudes': result.data
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando solicitud de compra: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-compra/<int:id_solicitud>/aprobar', methods=['PUT'])
@jefe_taller_required
def aprobar_solicitud_compra(current_user, id_solicitud):
    """Aprobar una solicitud de compra (marcar como comprado)"""
    try:
        check = supabase.table('solicitud_compra') \
            .select('id, estado, id_encargado_repuestos') \
            .eq('id', id_solicitud) \
            .eq('id_jefe_taller', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada o no autorizada'}), 404
        
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
        
        return jsonify({'success': True, 'message': 'Compra registrada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error aprobando solicitud de compra: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@cotizaciones_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba"""
    return jsonify({'success': True, 'message': 'Endpoint de cotizaciones funcionando'}), 200