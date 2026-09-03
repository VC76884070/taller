# =====================================================
# SOLICITUDES_COMPRA.PY - ENCARGADO DE REPUESTOS
# VERSIÓN CORREGIDA - OBTENER SERVICIO DESDE LA ORDEN
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import encargado_repuestos_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

solicitudes_compra_bp = Blueprint('solicitudes_compra', __name__, url_prefix='/api/encargado-repuestos')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def parse_items(items_data):
    if not items_data:
        return []
    try:
        if isinstance(items_data, str):
            return json.loads(items_data)
        return items_data
    except:
        return []

def obtener_servicio_desde_orden(id_orden_trabajo):
    """Obtener la descripción del servicio asociado a una orden de trabajo"""
    try:
        # Buscar en diagnóstico_tecnico (tiene id_servicio)
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id_servicio, servicios!inner(descripcion)') \
            .eq('id_orden_trabajo', id_orden_trabajo) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico.data and diagnostico.data[0].get('id_servicio'):
            servicio = diagnostico.data[0].get('servicios', {})
            return servicio.get('descripcion', 'Servicio técnico')
        
        # Buscar en servicio_tecnico directamente
        planificacion = supabase.table('planificacion') \
            .select('id_servicio, servicio_tecnico!inner(descripcion)') \
            .eq('id_orden_trabajo', id_orden_trabajo) \
            .limit(1) \
            .execute()
        
        if planificacion.data and planificacion.data[0].get('id_servicio'):
            servicio = planificacion.data[0].get('servicio_tecnico', {})
            return servicio.get('descripcion', 'Servicio técnico')
        
        return None
    except Exception as e:
        logger.warning(f"Error obteniendo servicio desde orden {id_orden_trabajo}: {e}")
        return None

# =====================================================
# ENDPOINTS
# =====================================================

@solicitudes_compra_bp.route('/solicitudes-compra', methods=['GET'])
@encargado_repuestos_required
def obtener_solicitudes_compra(current_user):
    """Obtener solicitudes de compra asignadas al encargado de repuestos"""
    try:
        estado = request.args.get('estado')
        
        query = supabase.table('solicitud_compra') \
            .select('*') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .order('fecha_solicitud', desc=True)
        
        if estado and estado != 'all':
            query = query.eq('estado', estado)
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'solicitudes': []}), 200
        
        # Obtener IDs únicos de órdenes
        ordenes_ids = list(set([s.get('id_orden_trabajo') for s in result.data if s.get('id_orden_trabajo')]))
        
        # Mapa de órdenes con vehículo
        ordenes_map = {}
        ordenes_servicio_map = {}
        
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
                
                servicio = obtener_servicio_desde_orden(o['id'])
                if servicio:
                    ordenes_servicio_map[o['id']] = servicio
        
        solicitudes = []
        for s in result.data:
            orden_id = s.get('id_orden_trabajo')
            orden_info = ordenes_map.get(orden_id, {})
            
            servicio_desc = ordenes_servicio_map.get(orden_id)
            if not servicio_desc:
                servicio_desc = obtener_servicio_desde_orden(orden_id)
            
            if not servicio_desc:
                servicio_desc = 'Servicio técnico'
            
            # =====================================================
            # 🔥 CORRECCIÓN: PARSEAR ITEMS Y PRESERVAR EL ARRAY 'fotos'
            # =====================================================
            items = parse_items(s.get('items'))
            
            # ✅ Si no hay items pero hay descripcion_pieza, crear item básico
            if not items and s.get('descripcion_pieza'):
                items = [{
                    'descripcion': s.get('descripcion_pieza'),
                    'cantidad': s.get('cantidad', 1),
                    'detalle': ''
                }]
            
            # ✅ Asegurar que cada item tenga el array 'fotos' preservado
            items_procesados = []
            for item in items:
                item_procesado = {
                    'descripcion': item.get('descripcion', 'Item'),
                    'cantidad': item.get('cantidad', 1),
                    'detalle': item.get('detalle', '')
                }
                
                # 🔥 PRESERVAR EL ARRAY 'fotos' COMPLETO
                if 'fotos' in item and item['fotos'] and isinstance(item['fotos'], list):
                    item_procesado['fotos'] = item['fotos']
                    print(f"📸 Preservando {len(item['fotos'])} fotos para item: {item.get('descripcion')}")
                
                # 🔥 PRESERVAR 'foto_url' (primer foto) para compatibilidad
                if 'foto_url' in item and item['foto_url']:
                    item_procesado['foto_url'] = item['foto_url']
                
                # 🔥 PRESERVAR 'foto_public_ids' si existe
                if 'foto_public_ids' in item and item['foto_public_ids']:
                    item_procesado['foto_public_ids'] = item['foto_public_ids']
                
                items_procesados.append(item_procesado)
            
            solicitudes.append({
                'id': s.get('id'),
                'id_orden_trabajo': orden_id,
                'id_solicitud_cotizacion': s.get('id_solicitud_cotizacion'),
                'orden_codigo': orden_info.get('codigo_unico', 'N/A'),
                'vehiculo': orden_info.get('vehiculo', 'N/A'),
                'servicio_descripcion': servicio_desc,
                'items': items_procesados,  # ✅ AHORA CON TODAS LAS FOTOS
                'descripcion_pieza': items_procesados[0].get('descripcion') if items_procesados else s.get('descripcion_pieza'),
                'cantidad': items_procesados[0].get('cantidad') if items_procesados else s.get('cantidad', 1),
                'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else None,
                'proveedor_info': s.get('proveedor_info'),
                'estado': s.get('estado', 'pendiente'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_compra': s.get('fecha_compra'),
                'fecha_entrega': s.get('fecha_entrega'),
                'mensaje_jefe_taller': s.get('mensaje_jefe_taller'),
                'respuesta_encargado': s.get('respuesta_encargado'),
                'notas_compra': s.get('notas_compra'),
                'notas_entrega': s.get('notas_entrega'),
                'comprobante_url': s.get('comprobante_url'),
                'numero_factura': s.get('numero_factura'),
                'proveedor_nombre': s.get('proveedor_nombre'),
                'monto_compra': float(s.get('monto_compra')) if s.get('monto_compra') else None,
                'foto_url': items_procesados[0].get('foto_url') if items_procesados and items_procesados[0].get('foto_url') else None
            })
        
        # Log para verificar que las fotos se están enviando
        for sol in solicitudes:
            if sol.get('items'):
                for item in sol['items']:
                    if 'fotos' in item and item['fotos']:
                        print(f"📸 Enviando item con {len(item['fotos'])} fotos: {item.get('descripcion')}")
        
        return jsonify({'success': True, 'solicitudes': solicitudes}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo solicitudes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@solicitudes_compra_bp.route('/solicitudes-compra/<int:id_solicitud>/comprar', methods=['PUT'])
@encargado_repuestos_required
def marcar_como_comprado(current_user, id_solicitud):
    """Marcar una solicitud como comprada"""
    try:
        data = request.get_json()
        fecha_compra = data.get('fecha_compra')
        notas_compra = data.get('notas_compra', '')
        numero_factura = data.get('numero_factura', '')
        proveedor_nombre = data.get('proveedor_nombre', '')
        proveedor_id = data.get('proveedor_id')  # 🔥 NUEVO: ID del proveedor
        monto_compra = data.get('monto_compra')
        comprobante_url = data.get('comprobante_url')
        
        # Verificar que la solicitud existe
        check = supabase.table('solicitud_compra') \
            .select('id, estado, id_jefe_taller, id_orden_trabajo, items') \
            .eq('id', id_solicitud) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'pendiente':
            return jsonify({'error': f'La solicitud ya está en estado {check.data[0]["estado"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        update_data = {
            'estado': 'comprado',
            'fecha_compra': fecha_compra or ahora,
            'notas_compra': notas_compra,
            'respuesta_encargado': f"Compra realizada el {fecha_compra or ahora.split('T')[0]}"
        }
        
        # Usar precio_cotizado en lugar de monto_compra
        if monto_compra:
            update_data['precio_cotizado'] = float(monto_compra)
        
        if numero_factura:
            update_data['numero_factura'] = numero_factura
        
        # 🔥 SI SE PROPORCIONA proveedor_id, buscar el nombre desde la tabla proveedor
        if proveedor_id:
            proveedor_result = supabase.table('proveedor') \
                .select('nombre') \
                .eq('id', proveedor_id) \
                .execute()
            
            if proveedor_result.data:
                update_data['proveedor_nombre'] = proveedor_result.data[0].get('nombre')
                update_data['proveedor_id'] = proveedor_id  # Guardar el ID para referencia
                logger.info(f"✅ Proveedor ID {proveedor_id} asignado: {update_data['proveedor_nombre']}")
        elif proveedor_nombre:
            update_data['proveedor_nombre'] = proveedor_nombre
        
        if comprobante_url:
            update_data['comprobante_url'] = comprobante_url
        
        result = supabase.table('solicitud_compra') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar la solicitud'}), 500
        
        # Actualizar solicitud del técnico
        try:
            solicitud_tecnico = supabase.table('solicitud_repuestos_tecnico') \
                .select('id, estado') \
                .eq('id_orden_trabajo', check.data[0]['id_orden_trabajo']) \
                .in_('estado', ['pendiente', 'en_proceso']) \
                .order('fecha_solicitud', desc=True) \
                .limit(1) \
                .execute()
            
            if solicitud_tecnico.data:
                supabase.table('solicitud_repuestos_tecnico') \
                    .update({
                        'estado': 'completado',
                        'respuesta': f"Repuestos comprados el {fecha_compra or ahora.split('T')[0]}",
                        'fecha_respuesta': ahora
                    }) \
                    .eq('id', solicitud_tecnico.data[0]['id']) \
                    .execute()
                logger.info(f"✅ Solicitud de técnico actualizada a 'completado'")
        except Exception as e:
            logger.warning(f"Error actualizando solicitud de técnico: {e}")
        
        # Notificar al jefe de taller
        try:
            supabase.table('notificacion').insert({
                'id_usuario_destino': check.data[0]['id_jefe_taller'],
                'tipo': 'compra_realizada',
                'mensaje': f"🛒 Compra realizada para solicitud #{id_solicitud} - Factura: {numero_factura or 'N/A'} - Proveedor: {update_data.get('proveedor_nombre', 'N/A')}",
                'fecha_envio': ahora,
                'leida': False
            }).execute()
        except Exception as e:
            logger.warning(f"Error enviando notificación: {e}")
        
        return jsonify({'success': True, 'message': 'Compra registrada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error marcando como comprado: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@solicitudes_compra_bp.route('/solicitudes-compra/<int:id_solicitud>/entregar', methods=['PUT'])
@encargado_repuestos_required
def registrar_entrega(current_user, id_solicitud):
    """Registrar entrega de una solicitud comprada"""
    try:
        data = request.get_json()
        fecha_entrega = data.get('fecha_entrega')
        notas_entrega = data.get('notas_entrega', '')
        
        # Verificar que la solicitud existe
        check = supabase.table('solicitud_compra') \
            .select('id, estado, id_jefe_taller, id_orden_trabajo') \
            .eq('id', id_solicitud) \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Solicitud no encontrada'}), 404
        
        if check.data[0]['estado'] != 'comprado':
            return jsonify({'error': f'La solicitud debe estar comprada primero (estado: {check.data[0]["estado"]})'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        update_data = {
            'estado': 'entregado',
            'fecha_entrega': fecha_entrega or ahora,
            'notas_entrega': notas_entrega,
            'respuesta_encargado': f"Entregado el {fecha_entrega or ahora.split('T')[0]}"
        }
        
        result = supabase.table('solicitud_compra') \
            .update(update_data) \
            .eq('id', id_solicitud) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar la solicitud'}), 500
        
        # Actualizar solicitud del técnico a "entregado"
        try:
            solicitud_tecnico = supabase.table('solicitud_repuestos_tecnico') \
                .select('id, estado') \
                .eq('id_orden_trabajo', check.data[0]['id_orden_trabajo']) \
                .in_('estado', ['completado', 'pendiente', 'en_proceso']) \
                .order('fecha_solicitud', desc=True) \
                .limit(1) \
                .execute()
            
            if solicitud_tecnico.data:
                supabase.table('solicitud_repuestos_tecnico') \
                    .update({
                        'estado': 'entregado',
                        'fecha_entrega': fecha_entrega or ahora,
                        'respuesta': f"Repuestos entregados el {fecha_entrega or ahora.split('T')[0]}",
                        'fecha_respuesta': ahora
                    }) \
                    .eq('id', solicitud_tecnico.data[0]['id']) \
                    .execute()
                logger.info(f"✅ Solicitud de técnico actualizada a 'entregado'")
        except Exception as e:
            logger.warning(f"Error actualizando solicitud de técnico: {e}")
        
        # Notificar al jefe de taller
        try:
            supabase.table('notificacion').insert({
                'id_usuario_destino': check.data[0]['id_jefe_taller'],
                'tipo': 'entrega_realizada',
                'mensaje': f"📦 Entrega registrada para solicitud #{id_solicitud}",
                'fecha_envio': ahora,
                'leida': False
            }).execute()
        except Exception as e:
            logger.warning(f"Error enviando notificación: {e}")
        
        # Notificar al técnico
        try:
            tecnico_asignado = supabase.table('asignaciontecnico') \
                .select('id_tecnico') \
                .eq('id_orden_trabajo', check.data[0]['id_orden_trabajo']) \
                .is_('fecha_hora_final', 'null') \
                .limit(1) \
                .execute()
            
            if tecnico_asignado.data and tecnico_asignado.data[0].get('id_tecnico'):
                supabase.table('notificacion').insert({
                    'id_usuario_destino': tecnico_asignado.data[0]['id_tecnico'],
                    'tipo': 'repuestos_entregados',
                    'mensaje': f"✅ Los repuestos solicitados para la orden han sido entregados. Ya puedes usarlos en tu trabajo.",
                    'fecha_envio': ahora,
                    'leida': False,
                    'id_referencia': id_solicitud
                }).execute()
        except Exception as e:
            logger.warning(f"Error notificando al técnico: {e}")
        
        return jsonify({'success': True, 'message': 'Entrega registrada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error registrando entrega: {str(e)}")
        return jsonify({'error': str(e)}), 500


@solicitudes_compra_bp.route('/solicitudes-compra/stats', methods=['GET'])
@encargado_repuestos_required
def obtener_estadisticas(current_user):
    """Obtener estadísticas de solicitudes de compra"""
    try:
        pendientes = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'pendiente') \
            .execute()
        
        comprados = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'comprado') \
            .execute()
        
        entregados = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .eq('estado', 'entregado') \
            .execute()
        
        total = supabase.table('solicitud_compra') \
            .select('id', count='exact') \
            .eq('id_encargado_repuestos', current_user['id']) \
            .execute()
        
        return jsonify({
            'success': True,
            'stats': {
                'pendientes': pendientes.count if hasattr(pendientes, 'count') else 0,
                'comprados': comprados.count if hasattr(comprados, 'count') else 0,
                'entregados': entregados.count if hasattr(entregados, 'count') else 0,
                'total': total.count if hasattr(total, 'count') else 0
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@solicitudes_compra_bp.route('/subir-comprobante-drive', methods=['POST'])
@encargado_repuestos_required
def subir_comprobante_drive(current_user):
    """Subir comprobante de compra a Google Drive"""
    try:
        from google_drive import google_drive
        
        if 'comprobante' not in request.files:
            return jsonify({'success': False, 'error': 'No se envió comprobante'}), 400
        
        file = request.files['comprobante']
        if not file.filename:
            return jsonify({'success': False, 'error': 'Archivo vacío'}), 400
        
        id_orden = request.form.get('id_orden')
        codigo_orden = request.form.get('codigo_orden')
        
        if not codigo_orden and id_orden:
            orden = supabase.table('ordentrabajo') \
                .select('codigo_unico') \
                .eq('id', id_orden) \
                .execute()
            if orden.data:
                codigo_orden = orden.data[0].get('codigo_unico')
        
        if not codigo_orden:
            return jsonify({'success': False, 'error': 'No se pudo obtener el código de la orden'}), 400
        
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'}
        file_ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        
        if file_ext not in allowed_extensions:
            return jsonify({'error': f'Formato no permitido. Use: {", ".join(allowed_extensions)}'}), 400
        
        if len(file.read()) > 5 * 1024 * 1024:
            return jsonify({'error': 'El archivo no debe superar los 5MB'}), 400
        file.seek(0)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"comprobante_{timestamp}_{file.filename}"
        
        folder_path = google_drive.get_ruta_solicitud_compra(codigo_orden, 'comprobantes')
        
        logger.info(f"📁 Subiendo comprobante a: {folder_path}")
        
        # 🔥 CAMBIAR public=False a public=True
        result = google_drive.upload_file(
            file_data=file,
            filename=filename,
            folder_path=folder_path,
            public=True  # ✅ AHORA ES PÚBLICO
        )
        
        return jsonify({
            'success': True,
            'url': result['url'],
            'file_id': result['id'],
            'filename': filename,
            'folder_path': folder_path
        }), 200
        
    except Exception as e:
        logger.error(f"Error subiendo comprobante: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# =====================================================
# ENDPOINT: PROXY IMAGEN PARA ENCARGADO DE REPUESTOS
# =====================================================

@solicitudes_compra_bp.route('/proxy-imagen-encargado', methods=['GET'])
@encargado_repuestos_required
def proxy_imagen_encargado(current_user):
    """Proxy para imágenes de Google Drive y Cloudinary"""
    import requests
    import base64
    import re
    
    url = request.args.get('url')
    if not url:
        return jsonify({'success': False, 'error': 'URL no proporcionada'}), 400
    
    # Cloudinary
    if 'cloudinary.com' in url or 'res.cloudinary.com' in url:
        try:
            logger.info(f"📸 Proxy Encargado: Cargando desde Cloudinary: {url[:80]}...")
            response = requests.get(url, timeout=30, allow_redirects=True)
            
            if response.status_code == 200:
                content_type = response.headers.get('Content-Type', 'image/jpeg')
                
                if not content_type or content_type == 'application/octet-stream':
                    if url.lower().endswith('.png'):
                        content_type = 'image/png'
                    elif url.lower().endswith('.jpg') or url.lower().endswith('.jpeg'):
                        content_type = 'image/jpeg'
                    elif url.lower().endswith('.webp'):
                        content_type = 'image/webp'
                    else:
                        content_type = 'image/jpeg'
                
                if len(response.content) > 500:
                    base64_data = base64.b64encode(response.content).decode('utf-8')
                    return jsonify({
                        'success': True,
                        'base64': f'data:{content_type};base64,{base64_data}'
                    })
                else:
                    return jsonify({'success': False, 'error': 'Imagen corrupta'}), 404
            else:
                return jsonify({'success': False, 'error': f'Error Cloudinary: {response.status_code}'}), 404
                
        except Exception as e:
            logger.error(f"❌ Error descargando de Cloudinary: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    # Google Drive
    from google_drive import google_drive
    
    file_id = google_drive.extract_file_id_from_url(url)
    if not file_id:
        return jsonify({'success': False, 'error': 'No se pudo extraer el ID de Google Drive'}), 400
    
    estrategias = [
        f"https://drive.google.com/thumbnail?id={file_id}&sz=w800",
        f"https://drive.google.com/uc?export=view&id={file_id}",
        f"https://drive.google.com/uc?export=download&id={file_id}",
    ]
    
    image_data = None
    mime_type = 'image/jpeg'
    
    for download_url in estrategias:
        try:
            response = requests.get(download_url, timeout=30, allow_redirects=True)
            
            if 'confirm' in response.url and 'download' in response.url:
                confirm_match = re.search(r'confirm=([^&]+)', response.text)
                if confirm_match:
                    confirm_token = confirm_match.group(1)
                    download_url_confirm = f"{response.url}&confirm={confirm_token}"
                    response = requests.get(download_url_confirm, timeout=30, allow_redirects=True)
            
            if response.status_code == 200:
                content_type = response.headers.get('Content-Type', '')
                if content_type.startswith('image/') or len(response.content) > 500:
                    image_data = response.content
                    mime_type = content_type if content_type.startswith('image/') else 'image/jpeg'
                    break
        except Exception as e:
            continue
    
    if not image_data:
        return jsonify({'success': False, 'error': 'No se pudo descargar la imagen'}), 404
    
    base64_data = base64.b64encode(image_data).decode('utf-8')
    
    return jsonify({
        'success': True,
        'base64': f'data:{mime_type};base64,{base64_data}'
    })


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@solicitudes_compra_bp.route('/test-compra', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de solicitudes_compra funcionando'}), 200