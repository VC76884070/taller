# =====================================================
# DIAGNÓSTICO - JEFE DE TALLER (VERSIÓN CORREGIDA)
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import base64
import io
import os
import json

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_taller_diagnostico_bp = Blueprint('jefe_taller_diagnostico', __name__, url_prefix='/api/jefe-taller')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# Configuración Cloudinary
CLOUDINARY_CONFIGURED = False
try:
    if hasattr(config, 'CLOUDINARY_CLOUD_NAME') and config.CLOUDINARY_CLOUD_NAME:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=config.CLOUDINARY_CLOUD_NAME,
            api_key=config.CLOUDINARY_API_KEY,
            api_secret=config.CLOUDINARY_API_SECRET,
            secure=True
        )
        CLOUDINARY_CONFIGURED = True
        logger.info(f"✅ Cloudinary configurado: {config.CLOUDINARY_CLOUD_NAME}")
except Exception as e:
    logger.warning(f"⚠️ Cloudinary no configurado: {e}")

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================
def subir_audio_cloudinary(audio_base64, carpeta, nombre):
    """Subir audio a Cloudinary"""
    try:
        if not audio_base64:
            return None
        
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        audio_file = io.BytesIO(audio_bytes)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S%f')
        audio_file.name = f"{nombre}_{timestamp}.wav"
        
        if CLOUDINARY_CONFIGURED:
            resultado = cloudinary.uploader.upload(
                audio_file,
                folder=f"furia_motor/{carpeta}",
                public_id=f"{nombre}_{timestamp}",
                resource_type="video"
            )
            return resultado.get('secure_url')
        else:
            upload_dir = os.path.join('uploads', 'audios', carpeta)
            os.makedirs(upload_dir, exist_ok=True)
            filename = f"{nombre}_{timestamp}.wav"
            filepath = os.path.join(upload_dir, filename)
            with open(filepath, 'wb') as f:
                f.write(audio_bytes)
            return f"/uploads/audios/{carpeta}/{filename}"
    except Exception as e:
        logger.error(f"Error subiendo audio: {e}")
        return None

def obtener_encargado_repuestos():
    """Obtener el primer encargado de repuestos disponible"""
    try:
        usuarios = supabase.table('usuario').select('id').execute()
        if not usuarios.data:
            return None
        
        for usuario in usuarios.data:
            tiene_rol = supabase.rpc('usuario_tiene_rol', {
                'p_usuario_id': usuario['id'],
                'p_rol_nombre': 'encargado_repuestos'
            }).execute()
            if tiene_rol.data:
                return usuario['id']
        return None
    except Exception as e:
        logger.error(f"Error obteniendo encargado repuestos: {e}")
        return None

# =====================================================
# 1. LISTAR TODOS LOS DIAGNÓSTICOS (CON FILTRO POR ESTADO)
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos', methods=['GET'])
@jefe_taller_required
def listar_diagnosticos(current_user):
    """Lista todos los diagnósticos con filtro opcional por estado"""
    try:
        # Obtener parámetro de filtro de estado
        estado_filtro = request.args.get('estado', 'todos')
        logger.info(f"📋 Listando diagnósticos - Filtro estado: {estado_filtro}")
        
        # Consulta base - obtener todos los diagnósticos
        query = supabase.table('diagnostico_tecnico').select('*')
        
        # Aplicar filtro de estado si no es 'todos'
        if estado_filtro != 'todos':
            query = query.eq('estado', estado_filtro)
        
        diagnosticos = query.order('fecha_envio', desc=True).execute()
        
        if not diagnosticos.data:
            return jsonify({'success': True, 'diagnosticos': []}), 200
        
        # Obtener IDs de órdenes y técnicos
        ordenes_ids = list(set([d['id_orden_trabajo'] for d in diagnosticos.data if d.get('id_orden_trabajo')]))
        tecnicos_ids = list(set([d['id_tecnico'] for d in diagnosticos.data if d.get('id_tecnico')]))
        
        # Mapear órdenes
        ordenes_map = {}
        if ordenes_ids:
            ordenes = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, id_vehiculo') \
                .in_('id', ordenes_ids) \
                .execute()
            for o in (ordenes.data or []):
                ordenes_map[o['id']] = o
        
        # Mapear vehículos
        vehiculos_ids = list(set([o.get('id_vehiculo') for o in ordenes_map.values() if o.get('id_vehiculo')]))
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # Mapear técnicos
        tecnicos_map = {}
        if tecnicos_ids:
            for tecnico_id in tecnicos_ids:
                tecnico = supabase.table('usuario') \
                    .select('id, nombre') \
                    .eq('id', tecnico_id) \
                    .execute()
                if tecnico.data:
                    tecnicos_map[tecnico_id] = tecnico.data[0]['nombre']
        
        # Mapear servicios
        diagnosticos_ids = [d['id'] for d in diagnosticos.data]
        servicios_map = {}
        if diagnosticos_ids:
            servicios = supabase.table('servicio_tecnico') \
                .select('id, descripcion, id_diagnostico_tecnico') \
                .in_('id_diagnostico_tecnico', diagnosticos_ids) \
                .execute()
            for s in (servicios.data or []):
                diag_id = s['id_diagnostico_tecnico']
                if diag_id not in servicios_map:
                    servicios_map[diag_id] = []
                servicios_map[diag_id].append({'id': s['id'], 'descripcion': s['descripcion']})
        
        # Construir resultado
        resultado = []
        for dt in diagnosticos.data:
            orden = ordenes_map.get(dt['id_orden_trabajo'], {})
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            tecnico_nombre = tecnicos_map.get(dt['id_tecnico'], '')
            
            resultado.append({
                'diagnostico_id': dt['id'],
                'id_orden_trabajo': dt['id_orden_trabajo'],
                'id_tecnico': dt['id_tecnico'],
                'tecnico_nombre': tecnico_nombre,
                'informe': dt.get('informe', ''),
                'estado': dt['estado'],
                'version': dt.get('version', 1),
                'es_borrador': dt.get('es_borrador', False),
                'fecha_envio': dt.get('fecha_envio'),
                'codigo_unico': orden.get('codigo_unico', ''),
                'placa': vehiculo.get('placa', ''),
                'marca': vehiculo.get('marca', ''),
                'modelo': vehiculo.get('modelo', ''),
                'servicios': servicios_map.get(dt['id'], [])
            })
        
        logger.info(f"✅ {len(resultado)} diagnósticos encontrados")
        return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando diagnósticos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# 1b. LISTAR DIAGNÓSTICOS PENDIENTES (MANTENER POR COMPATIBILIDAD)
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos-pendientes', methods=['GET'])
@jefe_taller_required
def listar_diagnosticos_pendientes(current_user):
    """Endpoint legacy - redirige al nuevo endpoint con filtro pendiente"""
    try:
        # Redirigir al nuevo endpoint con filtro de estado pendiente
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .in_('estado', ['pendiente', 'borrador']) \
            .order('fecha_envio', desc=True) \
            .execute()
        
        if not diagnosticos.data:
            return jsonify({'success': True, 'diagnosticos': []}), 200
        
        ordenes_ids = list(set([d['id_orden_trabajo'] for d in diagnosticos.data if d.get('id_orden_trabajo')]))
        tecnicos_ids = list(set([d['id_tecnico'] for d in diagnosticos.data if d.get('id_tecnico')]))
        
        ordenes_map = {}
        if ordenes_ids:
            ordenes = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, id_vehiculo') \
                .in_('id', ordenes_ids) \
                .execute()
            for o in (ordenes.data or []):
                ordenes_map[o['id']] = o
        
        vehiculos_ids = list(set([o.get('id_vehiculo') for o in ordenes_map.values() if o.get('id_vehiculo')]))
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        tecnicos_map = {}
        if tecnicos_ids:
            for tecnico_id in tecnicos_ids:
                tecnico = supabase.table('usuario') \
                    .select('id, nombre') \
                    .eq('id', tecnico_id) \
                    .execute()
                if tecnico.data:
                    tecnicos_map[tecnico_id] = tecnico.data[0]['nombre']
        
        diagnosticos_ids = [d['id'] for d in diagnosticos.data]
        servicios_map = {}
        if diagnosticos_ids:
            servicios = supabase.table('servicio_tecnico') \
                .select('id, descripcion, id_diagnostico_tecnico') \
                .in_('id_diagnostico_tecnico', diagnosticos_ids) \
                .execute()
            for s in (servicios.data or []):
                diag_id = s['id_diagnostico_tecnico']
                if diag_id not in servicios_map:
                    servicios_map[diag_id] = []
                servicios_map[diag_id].append({'id': s['id'], 'descripcion': s['descripcion']})
        
        resultado = []
        for dt in diagnosticos.data:
            orden = ordenes_map.get(dt['id_orden_trabajo'], {})
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            tecnico_nombre = tecnicos_map.get(dt['id_tecnico'], '')
            
            resultado.append({
                'diagnostico_id': dt['id'],
                'id_orden_trabajo': dt['id_orden_trabajo'],
                'id_tecnico': dt['id_tecnico'],
                'tecnico_nombre': tecnico_nombre,
                'informe': dt.get('informe', ''),
                'estado': dt['estado'],
                'version': dt.get('version', 1),
                'es_borrador': dt.get('es_borrador', False),
                'fecha_envio': dt.get('fecha_envio'),
                'codigo_unico': orden.get('codigo_unico', ''),
                'placa': vehiculo.get('placa', ''),
                'marca': vehiculo.get('marca', ''),
                'modelo': vehiculo.get('modelo', ''),
                'servicios': servicios_map.get(dt['id'], [])
            })
        
        logger.info(f"✅ {len(resultado)} diagnósticos pendientes/borradores encontrados")
        return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando diagnósticos pendientes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# 2. OBTENER DETALLE DE UN DIAGNÓSTICO
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnostico/<int:diagnostico_id>', methods=['GET'])
@jefe_taller_required
def obtener_diagnostico(current_user, diagnostico_id):
    try:
        logger.info(f"🔍 Obteniendo diagnóstico {diagnostico_id}")
        
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        orden = supabase.table('ordentrabajo') \
            .select('*') \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        orden_data = orden.data[0] if orden.data else {}
        
        vehiculo = {}
        if orden_data.get('id_vehiculo'):
            v = supabase.table('vehiculo') \
                .select('placa, marca, modelo') \
                .eq('id', orden_data['id_vehiculo']) \
                .execute()
            if v.data:
                vehiculo = v.data[0]
        
        tecnico_nombre = ''
        tecnico = supabase.table('usuario') \
            .select('nombre') \
            .eq('id', dt['id_tecnico']) \
            .execute()
        if tecnico.data:
            tecnico_nombre = tecnico.data[0]['nombre']
        
        servicios = supabase.table('servicio_tecnico') \
            .select('id, descripcion, orden') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .order('orden') \
            .execute()
        
        servicios_ids = [s['id'] for s in (servicios.data or [])]
        precios_map = {}
        if servicios_ids:
            precios = supabase.table('servicio_precio') \
                .select('id_servicio, precio_estimado, precio_final') \
                .in_('id_servicio', servicios_ids) \
                .execute()
            for p in (precios.data or []):
                precios_map[p['id_servicio']] = p
        
        servicios_list = []
        for s in (servicios.data or []):
            precio = precios_map.get(s['id'], {})
            servicios_list.append({
                'id': s['id'],
                'descripcion': s['descripcion'],
                'orden': s.get('orden', 0),
                'precio_estimado': precio.get('precio_estimado') if isinstance(precio, dict) else None,
                'precio_final': precio.get('precio_final') if isinstance(precio, dict) else None
            })
        
        solicitudes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('id_orden_trabajo', dt['id_orden_trabajo']) \
            .execute()
        
        fotos = supabase.table('foto_diagnostico') \
            .select('*') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .execute()
        
        observaciones = supabase.table('observaciondiagnostico') \
            .select('*') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .order('fecha_hora', desc=True) \
            .execute()
        
        jefes_ids = list(set([obs.get('id_jefe_taller') for obs in (observaciones.data or []) if obs.get('id_jefe_taller')]))
        jefes_map = {}
        if jefes_ids:
            for jefe_id in jefes_ids:
                jefe = supabase.table('usuario') \
                    .select('id, nombre') \
                    .eq('id', jefe_id) \
                    .execute()
                if jefe.data:
                    jefes_map[jefe_id] = jefe.data[0]['nombre']
        
        resultado = {
            'diagnostico_id': dt['id'],
            'id_orden_trabajo': dt['id_orden_trabajo'],
            'codigo_unico': orden_data.get('codigo_unico', ''),
            'id_tecnico': dt['id_tecnico'],
            'tecnico_nombre': tecnico_nombre,
            'informe': dt.get('informe', ''),
            'url_grabacion_informe': dt.get('url_grabacion_informe'),
            'transcripcion_informe': dt.get('transcripcion_informe'),
            'estado': dt['estado'],
            'version': dt.get('version', 1),
            'es_borrador': dt.get('es_borrador', False),
            'fecha_envio': dt.get('fecha_envio'),
            'fecha_modificacion': dt.get('fecha_modificacion'),
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'servicios': servicios_list,
            'solicitudes_repuestos': solicitudes.data or [],
            'fotos': fotos.data or [],
            'observaciones': [{
                'id': obs['id'],
                'observacion': obs.get('observacion', ''),
                'url_grabacion': obs.get('url_grabacion_observacion'),
                'jefe_taller_nombre': jefes_map.get(obs.get('id_jefe_taller'), ''),
                'fecha_hora': obs.get('fecha_hora')
            } for obs in (observaciones.data or [])]
        }
        
        logger.info(f"✅ Diagnóstico {diagnostico_id} obtenido correctamente")
        return jsonify({'success': True, 'diagnostico': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo diagnóstico: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# 3. APROBAR DIAGNÓSTICO
# =====================================================
@jefe_taller_diagnostico_bp.route('/aprobar-diagnostico', methods=['POST'])
@jefe_taller_required
def aprobar_diagnostico(current_user):
    print("=" * 60)
    print("🔵 APROBAR DIAGNÓSTICO - ENDPOINT LLAMADO")
    print(f"Usuario: {current_user.get('nombre') if current_user else 'None'}")
    
    try:
        # Intentar obtener datos de diferentes fuentes
        diagnostico_id = None
        
        # 1. Intentar como JSON
        if request.is_json:
            data = request.get_json(silent=True)
            if data:
                diagnostico_id = data.get('diagnostico_id') or data.get('id')
                print(f"📝 Desde JSON: {data}")
        
        # 2. Intentar como FormData
        if not diagnostico_id and request.form:
            diagnostico_id = request.form.get('diagnostico_id') or request.form.get('id')
            print(f"📝 Desde FormData: {request.form}")
        
        # 3. Intentar desde raw data
        if not diagnostico_id and request.data:
            try:
                data = json.loads(request.data.decode('utf-8'))
                diagnostico_id = data.get('diagnostico_id') or data.get('id')
                print(f"📝 Desde Raw: {data}")
            except:
                pass
        
        # 4. Intentar desde args (GET)
        if not diagnostico_id and request.args:
            diagnostico_id = request.args.get('diagnostico_id') or request.args.get('id')
            print(f"📝 Desde Args: {request.args}")
        
        print(f"🔍 ID extraído: {diagnostico_id}")
        
        if not diagnostico_id:
            print(f"❌ No se encontró ID")
            return jsonify({
                'error': 'ID de diagnóstico requerido',
                'debug': {
                    'content_type': request.content_type,
                    'is_json': request.is_json,
                    'form': dict(request.form),
                    'data_present': bool(request.data)
                }
            }), 400
        
        # Convertir a entero
        diagnostico_id = int(diagnostico_id)
        print(f"✅ ID convertido: {diagnostico_id}")
        
        # Verificar diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': f'Diagnóstico {diagnostico_id} no encontrado'}), 404
        
        dt = diagnostico.data[0]
        print(f"✅ Diagnóstico encontrado: estado={dt['estado']}, orden={dt['id_orden_trabajo']}")
        
        if dt['estado'] != 'pendiente':
            return jsonify({'error': f'El diagnóstico está en estado {dt["estado"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Actualizar diagnóstico
        supabase.table('diagnostico_tecnico') \
            .update({'estado': 'aprobado', 'fecha_modificacion': ahora}) \
            .eq('id', diagnostico_id) \
            .execute()
        print("  ✓ Diagnóstico actualizado")
        
        # Actualizar orden
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'Cotizacion'}) \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        print(f"  ✓ Orden actualizada a Cotizacion")
        
        # Registrar seguimiento
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': dt['id_orden_trabajo'],
            'estado': 'Cotizacion',
            'fecha_hora_cambio': ahora
        }).execute()
        print("  ✓ Seguimiento registrado")
        
        # Notificar
        supabase.table('notificacion').insert({
            'id_usuario_destino': dt['id_tecnico'],
            'tipo': 'diagnostico_aprobado',
            'mensaje': '✅ Tu diagnóstico ha sido APROBADO. Ahora se procederá con la cotización.',
            'fecha_envio': ahora,
            'leida': False
        }).execute()
        print("  ✓ Notificación enviada")
        
        print("🎉 DIAGNÓSTICO APROBADO CON ÉXITO!")
        print("=" * 60)
        
        return jsonify({
            'success': True,
            'message': 'Diagnóstico aprobado correctamente',
            'nuevo_estado': 'Cotizacion'
        }), 200
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# 4. RECHAZAR DIAGNÓSTICO
# =====================================================
@jefe_taller_diagnostico_bp.route('/rechazar-diagnostico', methods=['POST'])
@jefe_taller_required
def rechazar_diagnostico(current_user):
    print("🔴 RECHAZAR DIAGNÓSTICO")
    
    try:
        diagnostico_id = None
        observacion = ''
        grabacion_url = None
        
        # Intentar obtener datos
        if request.is_json:
            data = request.get_json(silent=True)
            if data:
                diagnostico_id = data.get('diagnostico_id') or data.get('id')
                observacion = data.get('observacion', '')
                grabacion_url = data.get('grabacion_url')
        
        if not diagnostico_id and request.form:
            diagnostico_id = request.form.get('diagnostico_id') or request.form.get('id')
            observacion = request.form.get('observacion', '')
            grabacion_url = request.form.get('grabacion_url')
        
        if not diagnostico_id:
            return jsonify({'error': 'ID de diagnóstico requerido'}), 400
        
        if not observacion and not grabacion_url:
            return jsonify({'error': 'Debe proporcionar una observación o grabación'}), 400
        
        diagnostico_id = int(diagnostico_id)
        
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, id_orden_trabajo, id_tecnico, version') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        observacion_data = {
            'id_diagnostico_tecnico': diagnostico_id,
            'id_jefe_taller': current_user['id'],
            'observacion': observacion,
            'url_grabacion_observacion': grabacion_url,
            'fecha_hora': datetime.datetime.now().isoformat(),
            'version_diagnostico': dt.get('version', 1) + 1
        }
        
        supabase.table('observaciondiagnostico').insert(observacion_data).execute()
        
        supabase.table('diagnostico_tecnico') \
            .update({
                'estado': 'rechazado',
                'version': dt.get('version', 1) + 1,
                'fecha_modificacion': datetime.datetime.now().isoformat()
            }) \
            .eq('id', diagnostico_id) \
            .execute()
        
        supabase.table('notificacion').insert({
            'id_usuario_destino': dt['id_tecnico'],
            'tipo': 'diagnostico_rechazado',
            'mensaje': f'❌ Tu diagnóstico ha sido RECHAZADO. Motivo: {observacion[:100]}...',
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False
        }).execute()
        
        print(f"✅ Diagnóstico {diagnostico_id} rechazado")
        
        return jsonify({'success': True, 'message': 'Diagnóstico rechazado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error rechazando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# 5. SOLICITAR COTIZACIÓN DE REPUESTO
# =====================================================
@jefe_taller_diagnostico_bp.route('/solicitar-cotizacion-repuesto', methods=['POST'])
@jefe_taller_required
def solicitar_cotizacion_repuesto(current_user):
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            data = request.form.to_dict()
        
        orden_id = data.get('orden_id')
        servicio_id = data.get('servicio_id')
        descripcion_pieza = data.get('descripcion_pieza')
        cantidad = data.get('cantidad', 1)
        urgencia = data.get('urgencia', 'normal')
        observacion = data.get('observacion', '')
        
        if not orden_id or not servicio_id or not descripcion_pieza:
            return jsonify({'error': 'Faltan datos requeridos'}), 400
        
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico') \
            .eq('id', orden_id) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
        
        encargado_id = obtener_encargado_repuestos()
        
        solicitud_data = {
            'id_orden_trabajo': int(orden_id),
            'id_servicio': int(servicio_id),
            'id_jefe_taller': current_user['id'],
            'id_encargado_repuestos': encargado_id,
            'descripcion_pieza': descripcion_pieza,
            'cantidad': int(cantidad),
            'urgencia': urgencia,
            'observacion_jefe_taller': observacion,
            'estado': 'pendiente',
            'fecha_solicitud': datetime.datetime.now().isoformat()
        }
        
        result = supabase.table('solicitud_cotizacion_repuesto').insert(solicitud_data).execute()
        
        if encargado_id:
            supabase.table('notificacion').insert({
                'id_usuario_destino': encargado_id,
                'tipo': 'solicitud_cotizacion',
                'mensaje': f'🔧 Nueva solicitud de cotización: {descripcion_pieza[:50]}...',
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        logger.info(f"Solicitud de repuesto creada para orden {orden_id}")
        
        return jsonify({'success': True, 'solicitud_id': result.data[0]['id'] if result.data else None}), 200
        
    except Exception as e:
        logger.error(f"Error creando solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# 6. SUBIR AUDIO DE OBSERVACIÓN
# =====================================================
@jefe_taller_diagnostico_bp.route('/subir-audio-observacion', methods=['POST'])
@jefe_taller_required
def subir_audio_observacion(current_user):
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            data = request.form.to_dict()
        
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        url = subir_audio_cloudinary(audio_base64, f'observaciones/{current_user["id"]}', f'obs_{timestamp}')
        
        if url:
            return jsonify({'success': True, 'url': url}), 200
        else:
            return jsonify({'error': 'Error subiendo audio'}), 500
            
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# 7. ESTADÍSTICAS PARA DASHBOARD
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos-stats', methods=['GET'])
@jefe_taller_required
def diagnosticos_stats(current_user):
    try:
        estados = ['pendiente', 'aprobado', 'rechazado', 'borrador']
        stats = {}
        
        for estado in estados:
            result = supabase.table('diagnostico_tecnico') \
                .select('id', count='exact') \
                .eq('estado', estado) \
                .execute()
            stats[estado] = result.count if hasattr(result, 'count') else len(result.data) if result.data else 0
        
        return jsonify({'success': True, 'stats': stats}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo stats: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# 8. ENDPOINT DE PRUEBA
# =====================================================
@jefe_taller_diagnostico_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba"""
    return jsonify({
        'success': True,
        'message': 'Endpoint de diagnóstico funcionando'
    }), 200


# =====================================================
# 9. APROBAR DIAGNÓSTICO - VERSIÓN SIMPLE (SIN AUTH)
# =====================================================
@jefe_taller_diagnostico_bp.route('/aprobar-diagnostico-simple', methods=['POST'])
def aprobar_diagnostico_simple():
    """Versión simple sin autenticación para probar"""
    print("=" * 60)
    print("🔵 APROBAR DIAGNÓSTICO - VERSIÓN SIMPLE")
    
    try:
        # Obtener datos de FormData
        diagnostico_id = request.form.get('diagnostico_id') or request.form.get('id')
        
        if not diagnostico_id:
            # Intentar obtener de JSON
            if request.is_json:
                data = request.get_json(silent=True)
                if data:
                    diagnostico_id = data.get('diagnostico_id') or data.get('id')
        
        print(f"ID recibido: {diagnostico_id}")
        print(f"Content-Type: {request.content_type}")
        print(f"Form: {request.form}")
        print(f"Data: {request.data}")
        
        if not diagnostico_id:
            return jsonify({'error': 'ID no recibido', 'content_type': request.content_type}), 400
        
        diagnostico_id = int(diagnostico_id)
        
        # Verificar diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        if dt['estado'] != 'pendiente':
            return jsonify({'error': f'Estado actual: {dt["estado"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Actualizar diagnóstico
        supabase.table('diagnostico_tecnico') \
            .update({'estado': 'aprobado', 'fecha_modificacion': ahora}) \
            .eq('id', diagnostico_id) \
            .execute()
        
        # Actualizar orden
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'Cotizacion'}) \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        
        print("🎉 ÉXITO!")
        
        return jsonify({
            'success': True,
            'message': 'Diagnóstico aprobado correctamente'
        }), 200
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({'error': str(e)}), 500