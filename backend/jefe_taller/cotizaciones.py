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
from functools import wraps
from config import config
from decorators import jefe_taller_required
import jwt
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
    """Obtener lista de usuarios con rol encargado_repuestos usando la nueva función"""
    try:
        # Primero obtenemos todos los usuarios
        usuarios = supabase.table('usuario').select('id, nombre, contacto').execute()
        
        if not usuarios.data:
            return []
        
        # Filtrar aquellos que tienen rol encargado_repuestos
        encargados = []
        for usuario in usuarios.data:
            tiene_rol = supabase.rpc('usuario_tiene_rol', {
                'p_usuario_id': usuario['id'],
                'p_rol_nombre': 'encargado_repuestos'
            }).execute()
            
            if tiene_rol.data:
                encargados.append(usuario)
        
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

def obtener_roles_usuario(usuario_id):
    """Obtener todos los roles de un usuario"""
    try:
        result = supabase.rpc('usuario_obtener_roles', {
            'p_usuario_id': usuario_id
        }).execute()
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Error obteniendo roles: {e}")
        return []


# =====================================================
# APARTADO 1: SOLICITAR COTIZACIÓN AL ENCARGADO DE REPUESTOS
# =====================================================

@cotizaciones_bp.route('/solicitudes-cotizacion', methods=['GET'])
@jefe_taller_required
def obtener_solicitudes_cotizacion(current_user):
    """Obtener todas las solicitudes de cotización enviadas por el Jefe de Taller"""
    try:
        estado = request.args.get('estado')
        id_orden_trabajo = request.args.get('id_orden_trabajo')
        
        # Primero obtener las solicitudes
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
        
        # Obtener IDs de órdenes únicos
        ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
        
        # Obtener todas las órdenes de trabajo con sus vehículos de una sola vez
        ordenes_map = {}
        if ordenes_ids:
            ordenes_result = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, id_vehiculo') \
                .in_('id', ordenes_ids) \
                .execute()
            
            if ordenes_result.data:
                # Obtener vehículos
                vehiculos_ids = list(set([o.get('id_vehiculo') for o in ordenes_result.data if o.get('id_vehiculo')]))
                vehiculos_map = {}
                
                if vehiculos_ids:
                    vehiculos_result = supabase.table('vehiculo') \
                        .select('id, placa, marca, modelo') \
                        .in_('id', vehiculos_ids) \
                        .execute()
                    
                    for v in (vehiculos_result.data or []):
                        vehiculos_map[v['id']] = v
                
                for o in ordenes_result.data:
                    vehiculo = vehiculos_map.get(o.get('id_vehiculo'), {})
                    ordenes_map[o['id']] = {
                        'codigo_unico': o.get('codigo_unico', 'N/A'),
                        'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip()
                    }
                    if ordenes_map[o['id']]['vehiculo'] == '()':
                        ordenes_map[o['id']]['vehiculo'] = 'Vehículo no registrado'
        
        # Construir respuesta
        solicitudes = []
        for s in result.data:
            orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
            
            solicitudes.append({
                'id': s.get('id'),
                'id_orden_trabajo': s.get('id_orden_trabajo'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'descripcion_pieza': s.get('descripcion_pieza', ''),
                'cantidad': s.get('cantidad', 1),
                'estado': s.get('estado', 'pendiente'),
                'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'proveedor_info': s.get('proveedor_info'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_respuesta': s.get('fecha_respuesta'),
                'observacion_jefe_taller': s.get('observacion_jefe_taller'),
                'respuesta_encargado': s.get('respuesta_encargado')
            })
        
        logger.info(f"Se encontraron {len(solicitudes)} solicitudes")
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitudes de cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/solicitudes-cotizacion', methods=['POST'])
@jefe_taller_required
def crear_solicitud_cotizacion(current_user):
    """Crear nueva solicitud de cotización al Encargado de Repuestos (con múltiples items)"""
    try:
        data = request.get_json()
        
        id_orden_trabajo = data.get('id_orden_trabajo')
        id_encargado_repuestos = data.get('id_encargado_repuestos')
        items = data.get('items', [])
        observacion_general = data.get('observacion_general', '')
        
        if not id_orden_trabajo:
            return jsonify({'error': 'Orden de trabajo requerida'}), 400
        
        if not id_encargado_repuestos:
            return jsonify({'error': 'Encargado de repuestos requerido'}), 400
        
        if not items or len(items) == 0:
            return jsonify({'error': 'Debe agregar al menos un item'}), 400
        
        # Verificar que el encargado tenga el rol correcto
        es_encargado = verificar_rol_usuario(id_encargado_repuestos, 'encargado_repuestos')
        if not es_encargado:
            return jsonify({'error': 'El usuario seleccionado no tiene el rol de encargado de repuestos'}), 400
        
        orden_check = supabase.table('ordentrabajo') \
            .select('id, codigo_unico') \
            .eq('id', id_orden_trabajo) \
            .execute()
        
        if not orden_check.data:
            return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
        
        solicitudes_creadas = []
        for item in items:
            descripcion_pieza = item.get('descripcion', '').strip()
            cantidad = item.get('cantidad', 1)
            observacion_item = item.get('observacion', '')
            
            if not descripcion_pieza:
                continue
            
            nueva_solicitud = {
                'id_orden_trabajo': id_orden_trabajo,
                'id_jefe_taller': current_user['id'],
                'id_encargado_repuestos': id_encargado_repuestos,
                'descripcion_pieza': descripcion_pieza,
                'cantidad': cantidad,
                'estado': 'pendiente',
                'observacion_jefe_taller': f"{observacion_general} {observacion_item}".strip(),
                'fecha_solicitud': datetime.datetime.now().isoformat()
            }
            
            result = supabase.table('solicitud_cotizacion_repuesto') \
                .insert(nueva_solicitud) \
                .execute()
            
            if result.data:
                solicitudes_creadas.append(result.data[0])
        
        if not solicitudes_creadas:
            return jsonify({'error': 'No se pudo crear ninguna solicitud'}), 500
        
        notificacion = {
            'id_usuario_destino': id_encargado_repuestos,
            'tipo': 'solicitud_cotizacion',
            'mensaje': f"📋 Nuevas solicitudes de cotización ({len(solicitudes_creadas)} items) para orden {orden_check.data[0]['codigo_unico']}",
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False
        }
        supabase.table('notificacion').insert(notificacion).execute()
        
        return jsonify({
            'success': True,
            'message': f'{len(solicitudes_creadas)} solicitud(es) de cotización creada(s) exitosamente',
            'solicitudes': solicitudes_creadas
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando solicitud de cotización: {str(e)}")
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
        logger.error(f"Error eliminando solicitud de cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 2: SERVICIOS Y COTIZACIÓN AL CLIENTE
# =====================================================

@cotizaciones_bp.route('/servicios-pendientes', methods=['GET'])
@jefe_taller_required
def obtener_servicios_pendientes(current_user):
    """Obtener servicios técnicos aprobados que aún no tienen precio asignado"""
    try:
        query = supabase.table('diagnostico_tecnico') \
            .select('''
                id,
                id_orden_trabajo,
                estado,
                ordentrabajo!inner(
                    id,
                    codigo_unico,
                    estado_global,
                    id_vehiculo,
                    vehiculo!inner(placa, marca, modelo, id_cliente, cliente!inner(id_usuario, usuario!inner(nombre, contacto)))
                )
            ''') \
            .eq('estado', 'aprobado') \
            .execute()
        
        if not query.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_map = {}
        for diag in query.data:
            orden_info = diag.get('ordentrabajo', {})
            id_orden = diag['id_orden_trabajo']
            
            if id_orden not in ordenes_map:
                vehiculo_info = orden_info.get('vehiculo', {})
                cliente_info = vehiculo_info.get('cliente', {})
                usuario_info = cliente_info.get('usuario', {})
                
                ordenes_map[id_orden] = {
                    'id_orden': id_orden,
                    'codigo_unico': orden_info.get('codigo_unico'),
                    'estado_global': orden_info.get('estado_global'),
                    'vehiculo': f"{vehiculo_info.get('marca', '')} {vehiculo_info.get('modelo', '')}",
                    'placa': vehiculo_info.get('placa'),
                    'cliente_nombre': usuario_info.get('nombre', 'No registrado'),
                    'cliente_contacto': usuario_info.get('contacto', ''),
                    'servicios': []
                }
            
            servicios = supabase.table('servicio_tecnico') \
                .select('id, descripcion') \
                .eq('id_diagnostico_tecnico', diag['id']) \
                .order('orden') \
                .execute()
            
            for serv in (servicios.data or []):
                precio_check = supabase.table('servicio_precio') \
                    .select('id, precio_final') \
                    .eq('id_servicio', serv['id']) \
                    .execute()
                
                tiene_precio = len(precio_check.data) > 0 and precio_check.data[0].get('precio_final') is not None
                
                ordenes_map[id_orden]['servicios'].append({
                    'id_servicio': serv['id'],
                    'descripcion': serv['descripcion'],
                    'tiene_precio': tiene_precio,
                    'precio_asignado': float(precio_check.data[0]['precio_final']) if tiene_precio and precio_check.data[0].get('precio_final') else None
                })
        
        ordenes = list(ordenes_map.values())
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo servicios pendientes: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/asignar-precios', methods=['POST'])
@jefe_taller_required
def asignar_precios_servicios(current_user):
    """Asignar precios a los servicios técnicos y crear cotización"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        servicios = data.get('servicios', [])
        
        if not id_orden:
            return jsonify({'error': 'Orden de trabajo requerida'}), 400
        if not servicios:
            return jsonify({'error': 'Debe asignar al menos un servicio'}), 400
        
        for serv in servicios:
            existing = supabase.table('servicio_precio') \
                .select('id') \
                .eq('id_servicio', serv['id_servicio']) \
                .execute()
            
            precio_data = {
                'id_servicio': serv['id_servicio'],
                'id_jefe_taller': current_user['id'],
                'precio_final': serv['precio'],
                'aprobado_por_jefe_operativo': True,
                'aprobado_en': datetime.datetime.now().isoformat()
            }
            
            if existing.data:
                supabase.table('servicio_precio') \
                    .update(precio_data) \
                    .eq('id_servicio', serv['id_servicio']) \
                    .execute()
            else:
                supabase.table('servicio_precio') \
                    .insert(precio_data) \
                    .execute()
        
        cotizacion_check = supabase.table('cotizacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        id_cotizacion = None
        if cotizacion_check.data:
            id_cotizacion = cotizacion_check.data[0]['id']
        else:
            nueva_cotizacion = {
                'id_orden_trabajo': id_orden,
                'fecha_generacion': datetime.datetime.now().isoformat(),
                'estado': 'pendiente'
            }
            result = supabase.table('cotizacion') \
                .insert(nueva_cotizacion) \
                .execute()
            if result.data:
                id_cotizacion = result.data[0]['id']
        
        if not id_cotizacion:
            return jsonify({'error': 'No se pudo crear la cotización'}), 500
        
        for serv in servicios:
            detalle = {
                'id_cotizacion': id_cotizacion,
                'id_servicio': serv['id_servicio'],
                'precio': serv['precio'],
                'aprobado_por_cliente': False
            }
            supabase.table('cotizacion_servicio') \
                .upsert(detalle, on_conflict='id_cotizacion,id_servicio') \
                .execute()
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'cotizacion_enviada'}) \
            .eq('id', id_orden) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Precios asignados y cotización creada'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando precios: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/enviar-cotizacion-cliente/<int:id_orden>', methods=['POST'])
@jefe_taller_required
def enviar_cotizacion_cliente(current_user, id_orden):
    """Enviar la cotización al cliente"""
    try:
        cotizacion = supabase.table('cotizacion') \
            .select('id, estado') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        id_cotizacion = cotizacion.data[0]['id']
        
        servicios = supabase.table('cotizacion_servicio') \
            .select('''
                id_servicio,
                precio,
                servicio_tecnico!inner(descripcion)
            ''') \
            .eq('id_cotizacion', id_cotizacion) \
            .execute()
        
        orden = supabase.table('ordentrabajo') \
            .select('''
                id_vehiculo,
                vehiculo!inner(id_cliente, placa, marca, modelo)
            ''') \
            .eq('id', id_orden) \
            .execute()
        
        cliente_id = None
        if orden.data and orden.data[0].get('vehiculo'):
            cliente_id = orden.data[0]['vehiculo'].get('id_cliente')
        
        usuario_cliente = None
        if cliente_id:
            cliente = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', cliente_id) \
                .execute()
            if cliente.data and cliente.data[0].get('id_usuario'):
                usuario_cliente = cliente.data[0]['id_usuario']
        
        if usuario_cliente:
            total = sum(float(s.get('precio', 0)) for s in (servicios.data or []))
            notificacion = {
                'id_usuario_destino': usuario_cliente,
                'tipo': 'cotizacion_recibida',
                'mensaje': f"📄 Has recibido una nueva cotización para tu vehículo. Total: Bs. {total:.2f}",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }
            supabase.table('notificacion').insert(notificacion).execute()
        
        supabase.table('cotizacion') \
            .update({'estado': 'enviada'}) \
            .eq('id', id_cotizacion) \
            .execute()
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'cotizacion_enviada'}) \
            .eq('id', id_orden) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Cotización enviada al cliente'}), 200
        
    except Exception as e:
        logger.error(f"Error enviando cotización al cliente: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/cotizaciones-enviadas', methods=['GET'])
@jefe_taller_required
def obtener_cotizaciones_enviadas(current_user):
    """Obtener cotizaciones enviadas y respuestas de clientes"""
    try:
        query = supabase.table('cotizacion') \
            .select('''
                id,
                id_orden_trabajo,
                estado,
                fecha_generacion,
                ordentrabajo!inner(
                    codigo_unico,
                    id_vehiculo,
                    estado_global,
                    vehiculo!inner(placa, marca, modelo, id_cliente, cliente!inner(id_usuario, usuario!inner(nombre, contacto)))
                )
            ''') \
            .in_('estado', ['enviada', 'aprobada', 'rechazada', 'aprobada_parcial']) \
            .order('fecha_generacion', desc=True) \
            .execute()
        
        cotizaciones = []
        for cot in (query.data or []):
            orden_info = cot.get('ordentrabajo', {})
            vehiculo_info = orden_info.get('vehiculo', {})
            cliente_info = vehiculo_info.get('cliente', {})
            usuario_info = cliente_info.get('usuario', {})
            
            servicios_aprobados = supabase.table('cotizacion_servicio') \
                .select('id_servicio, precio, aprobado_por_cliente') \
                .eq('id_cotizacion', cot['id']) \
                .execute()
            
            aprobados = [s for s in (servicios_aprobados.data or []) if s.get('aprobado_por_cliente')]
            total_aprobado = sum(float(s.get('precio', 0)) for s in aprobados)
            
            estado_cliente = cot.get('estado', 'enviada')
            if estado_cliente == 'enviada':
                if any(s.get('aprobado_por_cliente') for s in (servicios_aprobados.data or [])):
                    if all(s.get('aprobado_por_cliente') for s in (servicios_aprobados.data or [])):
                        estado_cliente = 'aprobado_total'
                    else:
                        estado_cliente = 'aprobado_parcial'
            
            pago_50 = False
            transaccion = supabase.table('transaccion_financiera') \
                .select('id') \
                .eq('id_orden_trabajo', cot['id_orden_trabajo']) \
                .eq('tipo', 'anticipo_50') \
                .execute()
            if transaccion.data:
                pago_50 = True
            
            cotizaciones.append({
                'id': cot['id'],
                'id_orden_trabajo': cot['id_orden_trabajo'],
                'orden_codigo': orden_info.get('codigo_unico'),
                'vehiculo': f"{vehiculo_info.get('marca', '')} {vehiculo_info.get('modelo', '')}",
                'placa': vehiculo_info.get('placa'),
                'cliente_nombre': usuario_info.get('nombre', 'No registrado'),
                'total': total_aprobado,
                'servicios_aprobados': len(aprobados),
                'estado_cliente': estado_cliente,
                'pago_50': pago_50,
                'fecha_envio': cot.get('fecha_generacion')
            })
        
        return jsonify({'success': True, 'cotizaciones': cotizaciones}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotizaciones enviadas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/detalle-cotizacion/<int:id_cotizacion>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_cotizacion(current_user, id_cotizacion):
    """Obtener detalle completo de una cotización"""
    try:
        cotizacion = supabase.table('cotizacion') \
            .select('''
                *,
                ordentrabajo!inner(codigo_unico, id_vehiculo, vehiculo!inner(placa, marca, modelo))
            ''') \
            .eq('id', id_cotizacion) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        cot = cotizacion.data[0]
        orden_info = cot.get('ordentrabajo', {})
        vehiculo_info = orden_info.get('vehiculo', {})
        
        servicios = supabase.table('cotizacion_servicio') \
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
        for s in (servicios.data or []):
            precio = float(s.get('precio', 0))
            total += precio
            servicios_list.append({
                'descripcion': s.get('servicio_tecnico', {}).get('descripcion') if s.get('servicio_tecnico') else 'Servicio',
                'precio': precio,
                'aprobado_por_cliente': s.get('aprobado_por_cliente', False),
                'fecha_aprobacion': s.get('fecha_aprobacion')
            })
        
        pagos = supabase.table('transaccion_financiera') \
            .select('tipo, monto, fecha_hora') \
            .eq('id_orden_trabajo', cot['id_orden_trabajo']) \
            .execute()
        
        resultado = {
            'id': cot['id'],
            'orden_codigo': orden_info.get('codigo_unico'),
            'vehiculo': f"{vehiculo_info.get('marca', '')} {vehiculo_info.get('modelo', '')} ({vehiculo_info.get('placa', '')})",
            'fecha_generacion': cot.get('fecha_generacion'),
            'estado': cot.get('estado'),
            'servicios': servicios_list,
            'total': total,
            'pagos': pagos.data or []
        }
        
        return jsonify({'success': True, 'detalle': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de cotización: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 2B: CONFIGURACIÓN DE PAGO
# =====================================================

@cotizaciones_bp.route('/configuracion-pago', methods=['GET'])
@jefe_taller_required
def obtener_configuracion_pago(current_user):
    """Obtener configuración de pago (QR y datos de cuenta)"""
    try:
        config_data = supabase.table('configuracion_taller') \
            .select('clave, valor') \
            .in_('clave', ['qr_pago', 'datos_cuenta']) \
            .execute()
        
        qr_url = None
        datos_cuenta = None
        
        for item in (config_data.data or []):
            if item['clave'] == 'qr_pago':
                qr_url = item['valor']
            elif item['clave'] == 'datos_cuenta':
                datos_cuenta = item['valor']
        
        return jsonify({
            'success': True,
            'qr_url': qr_url,
            'datos_cuenta': datos_cuenta
        }), 200
        
    except Exception as e:
        logger.warning(f"Error obteniendo configuración de pago: {str(e)}")
        return jsonify({'success': True, 'qr_url': None, 'datos_cuenta': None}), 200


@cotizaciones_bp.route('/configuracion-pago', methods=['POST'])
@jefe_taller_required
def guardar_configuracion_pago(current_user):
    """Guardar configuración de pago"""
    try:
        data = request.get_json()
        
        if 'qr_url' in data:
            supabase.table('configuracion_taller') \
                .upsert({'clave': 'qr_pago', 'valor': data['qr_url']}, on_conflict='clave') \
                .execute()
        
        if 'datos_cuenta' in data:
            supabase.table('configuracion_taller') \
                .upsert({'clave': 'datos_cuenta', 'valor': data['datos_cuenta']}, on_conflict='clave') \
                .execute()
        
        return jsonify({'success': True, 'message': 'Configuración guardada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error guardando configuración de pago: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# APARTADO 3: SOLICITAR COMPRA
# =====================================================

@cotizaciones_bp.route('/solicitudes-compra', methods=['GET'])
@jefe_taller_required
def obtener_solicitudes_compra(current_user):
    """Obtener solicitudes de compra enviadas al Encargado de Repuestos"""
    try:
        estado = request.args.get('estado')
        id_orden_trabajo = request.args.get('id_orden_trabajo')
        
        # Primero obtener las solicitudes de compra
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
        
        # Obtener IDs de órdenes únicos
        ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
        
        # Obtener todas las órdenes de trabajo con sus vehículos
        ordenes_map = {}
        if ordenes_ids:
            ordenes_result = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, id_vehiculo') \
                .in_('id', ordenes_ids) \
                .execute()
            
            if ordenes_result.data:
                vehiculos_ids = list(set([o.get('id_vehiculo') for o in ordenes_result.data if o.get('id_vehiculo')]))
                vehiculos_map = {}
                
                if vehiculos_ids:
                    vehiculos_result = supabase.table('vehiculo') \
                        .select('id, placa, marca, modelo') \
                        .in_('id', vehiculos_ids) \
                        .execute()
                    
                    for v in (vehiculos_result.data or []):
                        vehiculos_map[v['id']] = v
                
                for o in ordenes_result.data:
                    vehiculo = vehiculos_map.get(o.get('id_vehiculo'), {})
                    ordenes_map[o['id']] = {
                        'codigo_unico': o.get('codigo_unico', 'N/A'),
                        'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip()
                    }
                    if ordenes_map[o['id']]['vehiculo'] == '()':
                        ordenes_map[o['id']]['vehiculo'] = 'Vehículo no registrado'
        
        solicitudes = []
        for s in result.data:
            orden_info = ordenes_map.get(s.get('id_orden_trabajo'), {})
            
            solicitudes.append({
                'id': s.get('id'),
                'id_orden_trabajo': s.get('id_orden_trabajo'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'id_solicitud_cotizacion': s.get('id_solicitud_cotizacion'),
                'descripcion_pieza': s.get('descripcion_pieza'),
                'cantidad': s.get('cantidad'),
                'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'proveedor_info': s.get('proveedor_info'),
                'estado': s.get('estado'),
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
    """Crear nueva solicitud de compra (con múltiples items)"""
    try:
        data = request.get_json()
        
        id_solicitud_cotizacion = data.get('id_solicitud_cotizacion')
        items = data.get('items', [])
        mensaje = data.get('mensaje', '')
        
        if not id_solicitud_cotizacion:
            return jsonify({'error': 'Solicitud de cotización requerida'}), 400
        
        if not items or len(items) == 0:
            return jsonify({'error': 'Debe agregar al menos un item'}), 400
        
        solicitud_cotizacion = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('id', id_solicitud_cotizacion) \
            .execute()
        
        if not solicitud_cotizacion.data:
            return jsonify({'error': 'Solicitud de cotización no encontrada'}), 404
        
        sc = solicitud_cotizacion.data[0]
        
        if sc.get('estado') != 'cotizado':
            return jsonify({'error': 'La solicitud debe estar cotizada para solicitar compra'}), 400
        
        # Verificar que el encargado tenga el rol correcto
        if sc.get('id_encargado_repuestos'):
            es_encargado = verificar_rol_usuario(sc['id_encargado_repuestos'], 'encargado_repuestos')
            if not es_encargado:
                logger.warning(f"El usuario {sc['id_encargado_repuestos']} ya no tiene rol de encargado_repuestos")
        
        solicitudes_creadas = []
        for item in items:
            descripcion_pieza = item.get('descripcion', '').strip()
            cantidad = item.get('cantidad', 1)
            observacion_item = item.get('observacion', '')
            
            if not descripcion_pieza:
                continue
            
            nueva_solicitud = {
                'id_orden_trabajo': sc['id_orden_trabajo'],
                'id_solicitud_cotizacion': id_solicitud_cotizacion,
                'id_jefe_taller': current_user['id'],
                'id_encargado_repuestos': sc.get('id_encargado_repuestos'),
                'descripcion_pieza': descripcion_pieza,
                'cantidad': cantidad,
                'precio_cotizado': sc.get('precio_cotizado'),
                'proveedor_info': sc.get('proveedor_info'),
                'estado': 'pendiente',
                'mensaje_jefe_taller': f"{mensaje} {observacion_item}".strip(),
                'fecha_solicitud': datetime.datetime.now().isoformat()
            }
            
            result = supabase.table('solicitud_compra') \
                .insert(nueva_solicitud) \
                .execute()
            
            if result.data:
                solicitudes_creadas.append(result.data[0])
        
        if not solicitudes_creadas:
            return jsonify({'error': 'No se pudo crear ninguna solicitud de compra'}), 500
        
        supabase.table('solicitud_cotizacion_repuesto') \
            .update({'estado': 'aprobado'}) \
            .eq('id', id_solicitud_cotizacion) \
            .execute()
        
        if sc.get('id_encargado_repuestos'):
            notificacion = {
                'id_usuario_destino': sc['id_encargado_repuestos'],
                'tipo': 'solicitud_compra',
                'mensaje': f"🛒 Nueva solicitud de compra ({len(solicitudes_creadas)} items)",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }
            supabase.table('notificacion').insert(notificacion).execute()
        
        return jsonify({
            'success': True,
            'message': f'{len(solicitudes_creadas)} solicitud(es) de compra creada(s) exitosamente',
            'solicitudes': solicitudes_creadas
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
# ENDPOINTS AUXILIARES
# =====================================================

@cotizaciones_bp.route('/ordenes-trabajo', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_trabajo(current_user):
    """Obtener lista de órdenes de trabajo para selects"""
    try:
        result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo, vehiculo(placa, marca, modelo)') \
            .order('fecha_ingreso', desc=True) \
            .limit(100) \
            .execute()
        
        ordenes = []
        for o in (result.data or []):
            vehiculo = o.get('vehiculo', {})
            ordenes.append({
                'id': o['id'],
                'codigo_unico': o['codigo_unico'],
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip()
            })
            if ordenes[-1]['vehiculo'] == '()':
                ordenes[-1]['vehiculo'] = 'Vehículo no registrado'
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/encargados-repuestos', methods=['GET'])
@jefe_taller_required
def obtener_encargados_repuestos(current_user):
    """Obtener lista de encargados de repuestos usando la nueva función"""
    try:
        encargados = obtener_encargados_repuestos()
        return jsonify({'success': True, 'encargados': encargados}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo encargados de repuestos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@cotizaciones_bp.route('/servicios-tecnicos/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_servicios_tecnicos_por_orden(current_user, id_orden):
    """Obtener servicios técnicos de una orden específica"""
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
            .select('id, descripcion') \
            .eq('id_diagnostico_tecnico', diagnostico.data[0]['id']) \
            .order('orden') \
            .execute()
        
        return jsonify({'success': True, 'servicios': servicios.data or []}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo servicios técnicos: {str(e)}")
        return jsonify({'error': str(e)}), 500