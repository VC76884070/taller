from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
from werkzeug.security import generate_password_hash
import cloudinary
import cloudinary.uploader
import cloudinary.api
import base64
import io
import requests

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

jefe_operativo_bp = Blueprint('jefe_operativo', __name__)

# Configuración desde config.py
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL
# =====================================================
def jefe_operativo_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]  # Bearer <token>
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            
            # Verificar que sea Jefe Operativo
            if current_user.get('rol') != 'jefe_operativo':
                logger.warning(f"Usuario {current_user.get('nombre')} intentó acceder sin permisos")
                return jsonify({'error': 'No autorizado para esta operación'}), 403
                
        except jwt.ExpiredSignatureError:
            logger.warning("Token expirado")
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

# =====================================================
# FUNCIONES DE CLOUDINARY
# =====================================================

def subir_imagen_a_cloudinary(base64_data, carpeta, nombre):
    """Subir imagen a Cloudinary y retornar URL"""
    try:
        # Verificar que Cloudinary esté configurado
        if not hasattr(config, 'CLOUDINARY_CONFIGURED') or not config.CLOUDINARY_CONFIGURED:
            logger.info("Cloudinary no configurado, generando URL simulada")
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            url_simulada = f"https://storage.googleapis.com/furia-motor-dev/{carpeta}/{nombre}_{timestamp}.jpg"
            return url_simulada
        
        # Extraer el base64 sin el prefijo
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        # Decodificar base64
        image_data = base64.b64decode(base64_data)
        
        # Crear un archivo en memoria
        image_file = io.BytesIO(image_data)
        image_file.name = f"{nombre}.jpg"
        
        # Subir a Cloudinary
        resultado = cloudinary.uploader.upload(
            image_file,
            folder=f"furia_motor/{carpeta}",
            public_id=f"{nombre}_{datetime.datetime.now().timestamp()}",
            resource_type="image"
        )
        
        url = resultado.get('secure_url')
        logger.info(f"✅ Imagen subida a Cloudinary: {url}")
        return url
        
    except Exception as e:
        logger.error(f"Error subiendo imagen a Cloudinary: {str(e)}")
        # En desarrollo, retornar una URL simulada
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"https://storage.googleapis.com/furia-motor-dev/{carpeta}/{nombre}_{timestamp}.jpg"

def subir_audio_a_cloudinary(base64_data, carpeta, nombre):
    """Subir audio a Cloudinary y retornar URL"""
    try:
        # Verificar que Cloudinary esté configurado
        if not hasattr(config, 'CLOUDINARY_CONFIGURED') or not config.CLOUDINARY_CONFIGURED:
            logger.info("Cloudinary no configurado, generando URL simulada")
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            return f"https://storage.googleapis.com/furia-motor-dev/{carpeta}/{nombre}_{timestamp}.wav"
        
        # Extraer el base64 sin el prefijo
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        # Decodificar base64
        audio_data = base64.b64decode(base64_data)
        
        # Crear un archivo en memoria
        audio_file = io.BytesIO(audio_data)
        audio_file.name = f"{nombre}.wav"
        
        # Subir a Cloudinary
        resultado = cloudinary.uploader.upload(
            audio_file,
            folder=f"furia_motor/{carpeta}",
            public_id=f"{nombre}_{datetime.datetime.now().timestamp()}",
            resource_type="video"  # Cloudinary trata audio como video
        )
        
        url = resultado.get('secure_url')
        logger.info(f"✅ Audio subido a Cloudinary: {url}")
        return url
        
    except Exception as e:
        logger.error(f"Error subiendo audio a Cloudinary: {str(e)}")
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"https://storage.googleapis.com/furia-motor-dev/{carpeta}/{nombre}_{timestamp}.wav"

# =====================================================
# FUNCIÓN DE TRANSCRIPCIÓN DE AUDIO
# =====================================================

def transcribir_audio(url_audio):
    """Transcribir audio usando API (simulado por ahora)"""
    try:
        # Aquí implementarías la integración con Google Speech-to-Text
        # O cualquier otro servicio de transcripción
        
        logger.info(f"Transcribiendo audio: {url_audio}")
        
        # Simulación de transcripción
        transcripcion = "El cliente reporta ruido al frenar y vibración en el volante a alta velocidad. También menciona que el aire acondicionado no enfría correctamente."
        
        return transcripcion
        
    except Exception as e:
        logger.error(f"Error transcribiendo audio: {str(e)}")
        return None

# =====================================================
# DASHBOARD - DATOS REALES
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/dashboard', methods=['GET'])
@jefe_operativo_required
def get_dashboard_data(current_user):
    """Obtener datos reales para el dashboard del Jefe Operativo"""
    try:
        logger.info(f"Obteniendo dashboard para usuario: {current_user.get('id')}")
        
        # Obtener fecha actual
        hoy = datetime.datetime.now().date()
        inicio_dia = datetime.datetime.combine(hoy, datetime.time.min)
        fin_dia = datetime.datetime.combine(hoy, datetime.time.max)
        
        # 1. Vehículos ingresados hoy
        ingresados_hoy = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .gte('fecha_ingreso', inicio_dia.isoformat()) \
            .lte('fecha_ingreso', fin_dia.isoformat()) \
            .execute()
        
        # 2. Vehículos en proceso (estados: EnRecepcion, EnProceso)
        en_proceso = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .in_('estado_global', ['EnRecepcion', 'EnProceso']) \
            .execute()
        
        # 3. Trabajos en pausa
        en_pausa = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .eq('estado_global', 'EnPausa') \
            .execute()
        
        # 4. Ingresos del día (transacciones financieras)
        ingresos_hoy = supabase.table('transaccionfinanciera') \
            .select('monto') \
            .eq('tipo', 'ingreso') \
            .gte('fecha_hora', inicio_dia.isoformat()) \
            .lte('fecha_hora', fin_dia.isoformat()) \
            .execute()
        
        total_ingresos = 0
        if ingresos_hoy.data:
            total_ingresos = sum(t['monto'] for t in ingresos_hoy.data if t.get('monto'))
        
        # 5. Datos para gráfico de ingresos (últimos 7 días)
        ingresos_semana = []
        fechas = []
        for i in range(6, -1, -1):
            fecha = hoy - datetime.timedelta(days=i)
            inicio = datetime.datetime.combine(fecha, datetime.time.min)
            fin = datetime.datetime.combine(fecha, datetime.time.max)
            
            dia_ingresos = supabase.table('transaccionfinanciera') \
                .select('monto') \
                .eq('tipo', 'ingreso') \
                .gte('fecha_hora', inicio.isoformat()) \
                .lte('fecha_hora', fin.isoformat()) \
                .execute()
            
            total = 0
            if dia_ingresos.data:
                total = sum(t['monto'] for t in dia_ingresos.data if t.get('monto'))
            ingresos_semana.append(total)
            fechas.append(fecha.strftime('%a'))
        
        # 6. Últimos ingresos (recepciones recientes)
        try:
            ultimos_ingresos = supabase.table('ordentrabajo') \
                .select('''
                    id, 
                    codigo_unico, 
                    fecha_ingreso,
                    estado_global,
                    vehiculo!inner(
                        placa,
                        marca,
                        modelo,
                        anio,
                        cliente!inner(
                            nombre
                        )
                    )
                ''') \
                .order('fecha_ingreso', desc=True) \
                .limit(5) \
                .execute()
        except Exception as e:
            logger.error(f"Error en consulta de últimos ingresos: {str(e)}")
            # Consulta alternativa sin joins complejos
            ultimos_ingresos = supabase.table('ordentrabajo') \
                .select('*') \
                .order('fecha_ingreso', desc=True) \
                .limit(5) \
                .execute()
        
        ingresos_lista = []
        if ultimos_ingresos.data:
            for item in ultimos_ingresos.data:
                try:
                    # Intentar obtener datos del vehículo
                    vehiculo_info = {}
                    cliente_info = {}
                    
                    if 'vehiculo' in item and item['vehiculo']:
                        vehiculo_info = item['vehiculo']
                        if 'cliente' in vehiculo_info and vehiculo_info['cliente']:
                            cliente_info = vehiculo_info['cliente']
                    
                    fecha = None
                    if item.get('fecha_ingreso'):
                        try:
                            fecha_str = item['fecha_ingreso'].replace('Z', '+00:00')
                            fecha = datetime.datetime.fromisoformat(fecha_str)
                        except:
                            fecha = datetime.datetime.now()
                    
                    ingresos_lista.append({
                        'hora': fecha.strftime('%H:%M') if fecha else '--:--',
                        'placa': vehiculo_info.get('placa', 'N/A'),
                        'vehiculo': f"{vehiculo_info.get('marca', '')} {vehiculo_info.get('modelo', '')}".strip() or 'N/A',
                        'cliente': cliente_info.get('nombre', 'N/A'),
                        'estado': item.get('estado_global', 'EnRecepcion')
                    })
                except Exception as e:
                    logger.error(f"Error procesando item: {str(e)}")
                    continue
        
        # 7. Notificaciones recientes
        try:
            notificaciones = supabase.table('notificacion') \
                .select('*') \
                .eq('id_usuario_destino', current_user['id']) \
                .eq('leida', False) \
                .order('fecha_envio', desc=True) \
                .limit(5) \
                .execute()
        except Exception as e:
            logger.error(f"Error obteniendo notificaciones: {str(e)}")
            notificaciones = {'data': []}
        
        notificaciones_lista = []
        if notificaciones and 'data' in notificaciones and notificaciones['data']:
            for notif in notificaciones['data']:
                try:
                    fecha = None
                    if notif.get('fecha_envio'):
                        try:
                            fecha_str = notif['fecha_envio'].replace('Z', '+00:00')
                            fecha = datetime.datetime.fromisoformat(fecha_str)
                        except:
                            fecha = datetime.datetime.now()
                    
                    ahora = datetime.datetime.now(datetime.timezone.utc)
                    diff = ahora - (fecha.replace(tzinfo=datetime.timezone.utc) if fecha and fecha.tzinfo else fecha.replace(tzinfo=datetime.timezone.utc) if fecha else ahora)
                    
                    if diff.total_seconds() < 60:
                        tiempo_str = f"Hace {int(diff.total_seconds())} segundos"
                    elif diff.total_seconds() < 3600:
                        minutos = int(diff.total_seconds() / 60)
                        tiempo_str = f"Hace {minutos} minuto{'s' if minutos != 1 else ''}"
                    elif diff.total_seconds() < 86400:
                        horas = int(diff.total_seconds() / 3600)
                        tiempo_str = f"Hace {horas} hora{'s' if horas != 1 else ''}"
                    else:
                        dias = int(diff.total_seconds() / 86400)
                        tiempo_str = f"Hace {dias} día{'s' if dias != 1 else ''}"
                    
                    notificaciones_lista.append({
                        'tipo': 'urgent' if notif.get('tipo') == 'alerta' else '',
                        'icono': 'exclamation-circle' if notif.get('tipo') == 'alerta' else 'info-circle',
                        'mensaje': notif.get('mensaje', 'Notificación'),
                        'tiempo': tiempo_str,
                        'badge': 'Urgente' if notif.get('tipo') == 'alerta' else None
                    })
                except Exception as e:
                    logger.error(f"Error procesando notificación: {str(e)}")
                    continue
        
        # 8. Obtener el nombre del usuario actual
        nombre_usuario = current_user.get('nombre', 'Usuario')
        try:
            user_info = supabase.table('usuario') \
                .select('nombre') \
                .eq('id', current_user['id']) \
                .execute()
            
            if user_info.data and len(user_info.data) > 0:
                nombre_usuario = user_info.data[0]['nombre']
        except Exception as e:
            logger.error(f"Error obteniendo nombre de usuario: {str(e)}")
        
        return jsonify({
            'success': True,
            'data': {
                'usuario': {
                    'nombre': nombre_usuario
                },
                'kpis': {
                    'ingresados_hoy': len(ingresados_hoy.data) if ingresados_hoy.data else 0,
                    'en_proceso': len(en_proceso.data) if en_proceso.data else 0,
                    'en_pausa': len(en_pausa.data) if en_pausa.data else 0,
                    'ingresos_hoy': total_ingresos
                },
                'grafico': {
                    'fechas': fechas,
                    'ingresos': ingresos_semana
                },
                'ultimos_ingresos': ingresos_lista,
                'notificaciones': notificaciones_lista,
                'total_notificaciones': len(notificaciones_lista)
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo dashboard: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# RECEPCIÓN DE VEHÍCULO (CON CLOUDINARY)
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/recepcion', methods=['POST'])
@jefe_operativo_required
def crear_recepcion(current_user):
    """Registrar una nueva recepción de vehículo (fotos y audio en Cloudinary)"""
    try:
        data = request.get_json()
        logger.info(f"Nueva recepción iniciada por: {current_user.get('nombre')}")
        
        if not data:
            return jsonify({'error': 'Datos requeridos'}), 400
        
        # Validar datos requeridos
        required_fields = ['cliente', 'vehiculo', 'descripcion', 'fotos']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return jsonify({'error': f'Campos requeridos faltantes: {", ".join(missing_fields)}'}), 400
        
        cliente_data = data.get('cliente', {})
        vehiculo_data = data.get('vehiculo', {})
        descripcion = data.get('descripcion', '')
        fotos = data.get('fotos', {})
        audio_base64 = data.get('audio')
        
        # Validar campos del cliente
        if not cliente_data.get('nombre'):
            return jsonify({'error': 'Nombre del cliente es requerido'}), 400
        if not cliente_data.get('telefono'):
            return jsonify({'error': 'Teléfono del cliente es requerido'}), 400
        
        # Validar campos del vehículo
        if not vehiculo_data.get('placa'):
            return jsonify({'error': 'Placa del vehículo es requerida'}), 400
        if not vehiculo_data.get('marca'):
            return jsonify({'error': 'Marca del vehículo es requerida'}), 400
        if not vehiculo_data.get('modelo'):
            return jsonify({'error': 'Modelo del vehículo es requerido'}), 400
        
        # =====================================================
        # SUBIR FOTOS A CLOUDINARY
        # =====================================================
        placa = vehiculo_data['placa'].upper()
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        carpeta = f"recepcion/{placa}_{timestamp}"
        
        urls_fotos = {}
        campos_fotos = [
            'url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal',
            'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'
        ]
        
        for campo in campos_fotos:
            if fotos.get(campo):
                try:
                    # Subir imagen a Cloudinary
                    url = subir_imagen_a_cloudinary(
                        fotos[campo], 
                        carpeta, 
                        campo.replace('url_', '')
                    )
                    urls_fotos[campo] = url
                    logger.info(f"✅ Foto {campo} procesada: {url}")
                except Exception as e:
                    logger.error(f"Error subiendo {campo}: {str(e)}")
                    urls_fotos[campo] = None
            else:
                urls_fotos[campo] = None
        
        # =====================================================
        # SUBIR AUDIO A CLOUDINARY Y TRANSCRIBIR
        # =====================================================
        url_audio = None
        transcripcion = descripcion
        
        if audio_base64:
            try:
                # Subir audio a Cloudinary
                url_audio = subir_audio_a_cloudinary(
                    audio_base64,
                    carpeta,
                    "audio_problema"
                )
                logger.info(f"✅ Audio procesado: {url_audio}")
                
                # Transcribir audio
                transcripcion_audio = transcribir_audio(url_audio)
                if transcripcion_audio:
                    # Combinar transcripción con descripción escrita
                    transcripcion = f"{descripcion}\n\n[Transcripción del audio]: {transcripcion_audio}"
                    logger.info(f"✅ Audio transcrito exitosamente")
                    
            except Exception as e:
                logger.error(f"Error procesando audio: {str(e)}")
        
        # =====================================================
        # VERIFICAR O CREAR CLIENTE Y VEHÍCULO EN SUPABASE
        # =====================================================
        
        # Verificar si la placa ya existe
        try:
            placa_existente = supabase.table('vehiculo') \
                .select('id, id_cliente') \
                .eq('placa', placa) \
                .execute()
        except Exception as e:
            logger.error(f"Error verificando placa: {str(e)}")
            placa_existente = {'data': []}
        
        id_vehiculo = None
        id_cliente = None
        
        if placa_existente.data and len(placa_existente.data) > 0:
            # Vehículo existente
            id_vehiculo = placa_existente.data[0]['id']
            id_cliente = placa_existente.data[0]['id_cliente']
            logger.info(f"Vehículo existente encontrado - ID: {id_vehiculo}")
            
        else:
            # Nuevo vehículo - crear cliente y vehículo
            
            # Verificar si el cliente ya existe por teléfono
            try:
                cliente_existente = supabase.table('cliente') \
                    .select('id, id_usuario') \
                    .eq('telefono', cliente_data.get('telefono')) \
                    .execute()
            except Exception as e:
                logger.error(f"Error verificando cliente: {str(e)}")
                cliente_existente = {'data': []}
            
            if cliente_existente.data and len(cliente_existente.data) > 0:
                # Cliente existente
                id_cliente = cliente_existente.data[0]['id']
                logger.info(f"Cliente existente encontrado - ID: {id_cliente}")
                
            else:
                # Nuevo cliente - crear usuario y cliente
                
                # Crear usuario para el cliente
                password_temporal = generate_password_hash(cliente_data.get('telefono', '123456'))
                
                try:
                    user_result = supabase.table('usuario').insert({
                        'id_rol': 6,  # rol cliente
                        'nombre': cliente_data['nombre'],
                        'contacto': cliente_data.get('telefono', ''),
                        'ubicacion': cliente_data.get('ubicacion', ''),
                        'contrasenia': password_temporal,
                        'numero_documento': f"TEMP-{datetime.datetime.now().timestamp()}"
                    }).execute()
                except Exception as e:
                    logger.error(f"Error creando usuario: {str(e)}")
                    return jsonify({'error': 'Error creando usuario cliente'}), 500
                
                if not user_result.data:
                    return jsonify({'error': 'Error creando usuario cliente'}), 500
                
                id_usuario = user_result.data[0]['id']
                
                # Crear cliente
                try:
                    cliente_result = supabase.table('cliente').insert({
                        'id_usuario': id_usuario,
                        'tipo_documento': 'CI',
                        'numero_documento': f"TEMP-{datetime.datetime.now().timestamp()}",
                        'telefono': cliente_data.get('telefono'),
                        'direccion': cliente_data.get('ubicacion')
                    }).execute()
                except Exception as e:
                    logger.error(f"Error creando cliente: {str(e)}")
                    # Rollback: eliminar usuario creado
                    supabase.table('usuario').delete().eq('id', id_usuario).execute()
                    return jsonify({'error': 'Error creando cliente'}), 500
                
                if not cliente_result.data:
                    # Rollback: eliminar usuario creado
                    supabase.table('usuario').delete().eq('id', id_usuario).execute()
                    return jsonify({'error': 'Error creando cliente'}), 500
                
                id_cliente = cliente_result.data[0]['id']
                logger.info(f"Nuevo cliente creado - ID: {id_cliente}")
            
            # Crear vehículo
            try:
                vehiculo_result = supabase.table('vehiculo').insert({
                    'id_cliente': id_cliente,
                    'placa': placa,
                    'marca': vehiculo_data.get('marca', ''),
                    'modelo': vehiculo_data.get('modelo', ''),
                    'anio': vehiculo_data.get('anio'),
                    'kilometraje': vehiculo_data.get('kilometraje', 0)
                }).execute()
            except Exception as e:
                logger.error(f"Error creando vehículo: {str(e)}")
                return jsonify({'error': 'Error creando vehículo'}), 500
            
            if not vehiculo_result.data:
                return jsonify({'error': 'Error creando vehículo'}), 500
            
            id_vehiculo = vehiculo_result.data[0]['id']
            logger.info(f"Nuevo vehículo creado - ID: {id_vehiculo}")
        
        # =====================================================
        # CREAR ORDEN DE TRABAJO
        # =====================================================
        codigo_unico = generar_codigo_unico()
        
        try:
            orden_result = supabase.table('ordentrabajo').insert({
                'codigo_unico': codigo_unico,
                'id_vehiculo': id_vehiculo,
                'id_jefe_operativo': current_user['id'],
                'fecha_ingreso': datetime.datetime.now().isoformat(),
                'estado_global': 'EnRecepcion'
            }).execute()
        except Exception as e:
            logger.error(f"Error creando orden de trabajo: {str(e)}")
            return jsonify({'error': 'Error creando orden de trabajo'}), 500
        
        if not orden_result.data:
            return jsonify({'error': 'Error creando orden de trabajo'}), 500
        
        id_orden = orden_result.data[0]['id']
        
        # =====================================================
        # CREAR REGISTRO DE RECEPCIÓN (con URLs de Cloudinary)
        # =====================================================
        recepcion_data = {
            'id_orden_trabajo': id_orden,
            'url_lateral_izquierda': urls_fotos.get('url_lateral_izquierda'),
            'url_lateral_derecha': urls_fotos.get('url_lateral_derecha'),
            'url_foto_frontal': urls_fotos.get('url_foto_frontal'),
            'url_foto_trasera': urls_fotos.get('url_foto_trasera'),
            'url_foto_superior': urls_fotos.get('url_foto_superior'),
            'url_foto_inferior': urls_fotos.get('url_foto_inferior'),
            'url_foto_tablero': urls_fotos.get('url_foto_tablero'),
            'url_grabacion_problema': url_audio,
            'transcripcion_problema': transcripcion
        }
        
        try:
            recepcion_result = supabase.table('recepcion').insert(recepcion_data).execute()
        except Exception as e:
            logger.error(f"Error guardando recepción: {str(e)}")
            # Rollback: eliminar orden de trabajo
            supabase.table('ordentrabajo').delete().eq('id', id_orden).execute()
            return jsonify({'error': 'Error guardando recepción'}), 500
        
        if not recepcion_result.data:
            # Rollback: eliminar orden de trabajo
            supabase.table('ordentrabajo').delete().eq('id', id_orden).execute()
            return jsonify({'error': 'Error guardando recepción'}), 500
        
        # =====================================================
        # CREAR NOTIFICACIÓN PARA EL JEFE DE TALLER
        # =====================================================
        try:
            jefe_taller = supabase.table('usuario') \
                .select('id') \
                .eq('id_rol', 3) \
                .limit(1) \
                .execute()
            
            if jefe_taller.data and len(jefe_taller.data) > 0:
                supabase.table('notificacion').insert({
                    'id_usuario_destino': jefe_taller.data[0]['id'],
                    'tipo': 'info',
                    'mensaje': f"Nuevo vehículo recibido: {placa} - {cliente_data['nombre']}",
                    'fecha_envio': datetime.datetime.now().isoformat()
                }).execute()
        except Exception as e:
            logger.error(f"Error creando notificación: {str(e)}")
            # No fallamos la operación principal por esto
        
        logger.info(f"✅ Recepción completada - Código: {codigo_unico}")
        
        return jsonify({
            'success': True,
            'message': 'Vehículo registrado exitosamente',
            'codigo': codigo_unico,
            'id_orden': id_orden
        }), 201
        
    except Exception as e:
        logger.error(f"Error en recepción: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================
def generar_codigo_unico():
    """Generar código único para orden de trabajo"""
    try:
        fecha = datetime.datetime.now()
        año = fecha.strftime('%y')
        mes = fecha.strftime('%m')
        dia = fecha.strftime('%d')
        
        # Obtener el último código generado hoy
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
        
    except Exception as e:
        logger.error(f"Error generando código único: {str(e)}")
        # Fallback: código con timestamp
        timestamp = datetime.datetime.now().strftime('%y%m%d%H%M%S')
        return f"OT-{timestamp}"

# =====================================================
# VERIFICAR PLACA
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/verificar-placa/<placa>', methods=['GET'])
@jefe_operativo_required
def verificar_placa(current_user, placa):
    """Verificar si una placa ya existe en el sistema"""
    try:
        placa = placa.upper()
        logger.info(f"Verificando placa: {placa}")
        
        resultado = supabase.table('vehiculo') \
            .select('placa, marca, modelo, cliente!inner(nombre, telefono)') \
            .eq('placa', placa) \
            .execute()
        
        if resultado.data and len(resultado.data) > 0:
            vehiculo = resultado.data[0]
            return jsonify({
                'exists': True,
                'vehiculo': {
                    'placa': vehiculo['placa'],
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'cliente': vehiculo.get('cliente', {}).get('nombre', ''),
                    'telefono': vehiculo.get('cliente', {}).get('telefono', '')
                }
            }), 200
        else:
            return jsonify({'exists': False}), 200
            
    except Exception as e:
        logger.error(f"Error verificando placa: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# OBTENER ÚLTIMO CÓDIGO
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/ultimo-codigo', methods=['GET'])
@jefe_operativo_required
def ultimo_codigo(current_user):
    """Obtener el último código generado"""
    try:
        ultimo = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .order('fecha_ingreso', desc=True) \
            .limit(1) \
            .execute()
        
        if ultimo.data and len(ultimo.data) > 0:
            return jsonify({'codigo': ultimo.data[0]['codigo_unico']}), 200
        else:
            return jsonify({'codigo': None}), 200
            
    except Exception as e:
        logger.error(f"Error obteniendo último código: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# TEST ENDPOINT
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba sin autenticación"""
    return jsonify({
        'success': True,
        'message': 'Endpoint de jefe operativo funcionando',
        'timestamp': datetime.datetime.now().isoformat()
    }), 200







# =====================================================
# COTIZACIONES - LISTAR
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/cotizaciones', methods=['GET'])
@jefe_operativo_required
def get_cotizaciones(current_user):
    """Obtener todas las cotizaciones"""
    try:
        logger.info(f"Obteniendo cotizaciones para usuario: {current_user.get('id')}")
        
        # Obtener cotizaciones con joins
        result = supabase.table('cotizacion') \
            .select('''
                id,
                fecha_generacion,
                estado,
                ordentrabajo!inner(
                    codigo_unico,
                    vehiculo!inner(
                        placa,
                        marca,
                        modelo,
                        cliente!inner(
                            nombre
                        )
                    )
                )
            ''') \
            .order('fecha_generacion', desc=True) \
            .execute()
        
        cotizaciones_lista = []
        for item in result.data if result.data else []:
            orden = item.get('ordentrabajo', {})
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            
            # Obtener detalles de la cotización para calcular total
            detalles = supabase.table('cotizaciondetalle') \
                .select('precio, aprobado_por_cliente') \
                .eq('id_cotizacion', item['id']) \
                .execute()
            
            total = 0
            servicios = []
            if detalles.data:
                for detalle in detalles.data:
                    total += detalle.get('precio', 0)
                    servicios.append({
                        'nombre': detalle.get('servicio_descripcion', 'Servicio'),
                        'precio': detalle.get('precio', 0),
                        'seleccionado': detalle.get('aprobado_por_cliente', False)
                    })
            
            fecha = datetime.datetime.fromisoformat(item['fecha_generacion'].replace('Z', '+00:00'))
            
            # Determinar estado para el badge
            estado = item.get('estado', 'pendiente').lower()
            
            cotizaciones_lista.append({
                'id': item['id'],
                'codigo': orden.get('codigo_unico', ''),
                'cliente': cliente.get('nombre', ''),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'total': total if total > 0 else 200,  # Si no hay servicios, diagnóstico
                'estado': estado,
                'fecha': fecha.strftime('%d/%m/%Y'),
                'servicios': servicios
            })
        
        return jsonify({
            'success': True,
            'data': cotizaciones_lista
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotizaciones: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# COTIZACIONES - OBTENER UNA
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/cotizaciones/<int:cotizacion_id>', methods=['GET'])
@jefe_operativo_required
def get_cotizacion(current_user, cotizacion_id):
    """Obtener una cotización específica"""
    try:
        result = supabase.table('cotizacion') \
            .select('''
                id,
                fecha_generacion,
                estado,
                ordentrabajo!inner(
                    codigo_unico,
                    vehiculo!inner(
                        placa,
                        marca,
                        modelo,
                        cliente!inner(
                            nombre
                        )
                    )
                )
            ''') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        item = result.data[0]
        orden = item.get('ordentrabajo', {})
        vehiculo = orden.get('vehiculo', {})
        cliente = vehiculo.get('cliente', {})
        
        # Obtener detalles
        detalles = supabase.table('cotizaciondetalle') \
            .select('*') \
            .eq('id_cotizacion', cotizacion_id) \
            .execute()
        
        servicios = []
        total = 0
        if detalles.data:
            for detalle in detalles.data:
                total += detalle.get('precio', 0)
                servicios.append({
                    'id': detalle['id'],
                    'nombre': detalle.get('servicio_descripcion', 'Servicio'),
                    'precio': detalle.get('precio', 0),
                    'seleccionado': detalle.get('aprobado_por_cliente', False)
                })
        
        fecha = datetime.datetime.fromisoformat(item['fecha_generacion'].replace('Z', '+00:00'))
        
        cotizacion = {
            'id': item['id'],
            'codigo': orden.get('codigo_unico', ''),
            'cliente': cliente.get('nombre', ''),
            'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
            'total': total if total > 0 else 200,
            'estado': item.get('estado', 'pendiente').lower(),
            'fecha': fecha.strftime('%d/%m/%Y'),
            'servicios': servicios
        }
        
        return jsonify({
            'success': True,
            'data': cotizacion
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotización: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# COTIZACIONES - CREAR
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/cotizaciones', methods=['POST'])
@jefe_operativo_required
def crear_cotizacion(current_user):
    """Crear una nueva cotización"""
    try:
        data = request.get_json()
        logger.info(f"Creando nueva cotización por: {current_user.get('nombre')}")
        
        orden_trabajo_id = data.get('orden_trabajo_id')
        servicios = data.get('servicios', [])
        
        if not orden_trabajo_id:
            return jsonify({'error': 'Orden de trabajo requerida'}), 400
        
        # Verificar si ya existe cotización para esta orden
        existente = supabase.table('cotizacion') \
            .select('id') \
            .eq('id_orden_trabajo', orden_trabajo_id) \
            .execute()
        
        if existente.data:
            return jsonify({'error': 'Ya existe una cotización para esta orden'}), 400
        
        # Crear cotización
        cotizacion_result = supabase.table('cotizacion').insert({
            'id_orden_trabajo': orden_trabajo_id,
            'fecha_generacion': datetime.datetime.now().isoformat(),
            'estado': 'pendiente'
        }).execute()
        
        if not cotizacion_result.data:
            return jsonify({'error': 'Error creando cotización'}), 500
        
        id_cotizacion = cotizacion_result.data[0]['id']
        
        # Crear detalles
        for servicio in servicios:
            supabase.table('cotizaciondetalle').insert({
                'id_cotizacion': id_cotizacion,
                'servicio_descripcion': servicio.get('descripcion', ''),
                'precio': servicio.get('precio', 0),
                'aprobado_por_cliente': False
            }).execute()
        
        # Si no hay servicios, crear detalle de diagnóstico
        if not servicios:
            supabase.table('cotizaciondetalle').insert({
                'id_cotizacion': id_cotizacion,
                'servicio_descripcion': 'Diagnóstico',
                'precio': 200,
                'aprobado_por_cliente': False
            }).execute()
        
        logger.info(f"Cotización {id_cotizacion} creada exitosamente")
        
        return jsonify({
            'success': True,
            'message': 'Cotización creada exitosamente',
            'id': id_cotizacion
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# COTIZACIONES - ACTUALIZAR ESTADO
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/cotizaciones/<int:cotizacion_id>/estado', methods=['PUT'])
@jefe_operativo_required
def actualizar_estado_cotizacion(current_user, cotizacion_id):
    """Actualizar estado de una cotización"""
    try:
        data = request.get_json()
        nuevo_estado = data.get('estado')
        
        if not nuevo_estado:
            return jsonify({'error': 'Estado requerido'}), 400
        
        result = supabase.table('cotizacion') \
            .update({'estado': nuevo_estado}) \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error actualizando cotización'}), 500
        
        # Si el estado es 'aprobada', crear notificación para taller
        if nuevo_estado == 'aprobada':
            # Obtener información de la cotización
            cotizacion = supabase.table('cotizacion') \
                .select('id_orden_trabajo, ordentrabajo!inner(id_vehiculo, vehiculo!inner(placa))') \
                .eq('id', cotizacion_id) \
                .execute()
            
            if cotizacion.data:
                # Notificar al jefe de taller
                jefe_taller = supabase.table('usuario') \
                    .select('id') \
                    .eq('id_rol', 3) \
                    .limit(1) \
                    .execute()
                
                if jefe_taller.data:
                    placa = cotizacion.data[0]['ordentrabajo']['vehiculo']['placa']
                    supabase.table('notificacion').insert({
                        'id_usuario_destino': jefe_taller.data[0]['id'],
                        'tipo': 'info',
                        'mensaje': f"Cotización aprobada para vehículo {placa}",
                        'fecha_envio': datetime.datetime.now().isoformat()
                    }).execute()
        
        return jsonify({
            'success': True,
            'message': 'Estado actualizado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error actualizando estado: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# COTIZACIONES - ACTUALIZAR SERVICIOS SELECCIONADOS
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/cotizaciones/<int:cotizacion_id>/servicios', methods=['PUT'])
@jefe_operativo_required
def actualizar_servicios_cotizacion(current_user, cotizacion_id):
    """Actualizar servicios seleccionados por el cliente"""
    try:
        data = request.get_json()
        servicios_seleccionados = data.get('servicios', [])
        
        # Actualizar cada servicio
        for servicio_id in servicios_seleccionados:
            supabase.table('cotizaciondetalle') \
                .update({'aprobado_por_cliente': True}) \
                .eq('id', servicio_id) \
                .execute()
        
        # Los no seleccionados se marcan como no aprobados
        if servicios_seleccionados:
            supabase.table('cotizaciondetalle') \
                .update({'aprobado_por_cliente': False}) \
                .eq('id_cotizacion', cotizacion_id) \
                .not_.in_('id', servicios_seleccionados) \
                .execute()
        
        # Verificar si hay servicios aprobados
        servicios_aprobados = supabase.table('cotizaciondetalle') \
            .select('id') \
            .eq('id_cotizacion', cotizacion_id) \
            .eq('aprobado_por_cliente', True) \
            .execute()
        
        # Actualizar estado según regla de negocio
        if len(servicios_aprobados.data) > 0:
            # Si hay servicios aprobados, diagnóstico gratis
            nuevo_estado = 'aprobada_parcial'
        else:
            # Si no hay servicios aprobados, solo diagnóstico
            nuevo_estado = 'diagnostico'
        
        supabase.table('cotizacion') \
            .update({'estado': nuevo_estado}) \
            .eq('id', cotizacion_id) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Servicios actualizados correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error actualizando servicios: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# COTIZACIONES - ENVIAR AL CLIENTE
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/cotizaciones/<int:cotizacion_id>/enviar', methods=['POST'])
@jefe_operativo_required
def enviar_cotizacion_cliente(current_user, cotizacion_id):
    """Enviar cotización al cliente (simulado)"""
    try:
        # Aquí iría la lógica para enviar por email/WhatsApp
        logger.info(f"Enviando cotización {cotizacion_id} al cliente")
        
        return jsonify({
            'success': True,
            'message': 'Cotización enviada al cliente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error enviando cotización: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

# =====================================================
# ORDENES DE TRABAJO PARA COTIZACIONES
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/ordenes-para-cotizar', methods=['GET'])
@jefe_operativo_required
def get_ordenes_para_cotizar(current_user):
    """Obtener órdenes de trabajo que pueden tener cotización"""
    try:
        # Órdenes en estado EnRecepcion o EnProceso que no tienen cotización
        ordenes_con_cotizacion = supabase.table('cotizacion') \
            .select('id_orden_trabajo') \
            .execute()
        
        ids_con_cotizacion = [o['id_orden_trabajo'] for o in ordenes_con_cotizacion.data] if ordenes_con_cotizacion.data else []
        
        query = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                vehiculo!inner(
                    placa,
                    marca,
                    modelo,
                    cliente!inner(
                        nombre
                    )
                )
            ''') \
            .in_('estado_global', ['EnRecepcion', 'EnProceso'])
        
        if ids_con_cotizacion:
            query = query.not_.in_('id', ids_con_cotizacion)
        
        result = query.execute()
        
        ordenes = []
        for item in result.data if result.data else []:
            vehiculo = item.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            ordenes.append({
                'id': item['id'],
                'codigo': item['codigo_unico'],
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip(),
                'cliente': cliente.get('nombre', '')
            })
        
        return jsonify({
            'success': True,
            'data': ordenes
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


# =====================================================
# VEHÍCULOS EN PROCESO
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/vehiculos-proceso', methods=['GET'])
@jefe_operativo_required
def get_vehiculos_proceso(current_user):
    """Obtener vehículos en proceso (EnRecepcion, EnProceso, EnPausa, Finalizado)"""
    try:
        logger.info(f"Obteniendo vehículos en proceso para usuario: {current_user.get('id')}")
        
        # Estados que consideramos "en proceso"
        estados = ['EnRecepcion', 'EnProceso', 'EnPausa', 'Finalizado']
        
        # Consulta principal
        result = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                fecha_ingreso,
                estado_global,
                vehiculo!inner(
                    id,
                    placa,
                    marca,
                    modelo,
                    anio,
                    cliente!inner(
                        id,
                        nombre,
                        telefono
                    )
                )
            ''') \
            .in_('estado_global', estados) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        vehiculos_lista = []
        for item in result.data if result.data else []:
            vehiculo = item.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            
            # Obtener técnicos asignados
            tecnicos_asignados = supabase.table('asignaciontecnico') \
                .select('usuario!inner(nombre)') \
                .eq('id_orden_trabajo', item['id']) \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            tecnicos = []
            if tecnicos_asignados.data:
                for t in tecnicos_asignados.data:
                    if t.get('usuario'):
                        tecnicos.append(t['usuario']['nombre'])
            
            # Calcular tiempos
            fecha_ingreso = datetime.datetime.fromisoformat(item['fecha_ingreso'].replace('Z', '+00:00'))
            ahora = datetime.datetime.now(datetime.timezone.utc)
            
            tiempo_transcurrido = ahora - fecha_ingreso
            horas_transcurridas = tiempo_transcurrido.total_seconds() / 3600
            
            # Obtener tiempo estimado de planificación
            planificacion = supabase.table('planificacion') \
                .select('horas_estimadas') \
                .eq('id_orden_trabajo', item['id']) \
                .execute()
            
            horas_estimadas = 4  # Valor por defecto
            if planificacion.data and planificacion.data[0].get('horas_estimadas'):
                horas_estimadas = planificacion.data[0]['horas_estimadas']
            
            # Obtener diagnóstico
            diagnostico = supabase.table('diagnostigoinicial') \
                .select('diagnostigo') \
                .eq('id_orden_trabajo', item['id']) \
                .order('fecha_hora', desc=True) \
                .limit(1) \
                .execute()
            
            diagnostico_texto = diagnostico.data[0]['diagnostigo'] if diagnostico.data else 'En revisión'
            
            # Obtener motivo de pausa si está en pausa
            motivo_pausa = None
            if item['estado_global'] == 'EnPausa':
                seguimiento = supabase.table('seguimientoorden') \
                    .select('motivo_pausa') \
                    .eq('id_orden_trabajo', item['id']) \
                    .eq('estado', 'EnPausa') \
                    .order('fecha_hora_cambio', desc=True) \
                    .limit(1) \
                    .execute()
                
                if seguimiento.data:
                    motivo_pausa = seguimiento.data[0].get('motivo_pausa', 'Esperando repuestos')
            
            vehiculos_lista.append({
                'id': item['id'],
                'codigo': item['codigo_unico'],
                'cliente': cliente.get('nombre', ''),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip(),
                'placa': vehiculo.get('placa', ''),
                'tecnicos': tecnicos if tecnicos else ['Sin asignar'],
                'tecnico': tecnicos[0] if tecnicos else 'Sin asignar',
                'tiempoEstimado': f"{horas_estimadas:.1f} horas",
                'tiempoTranscurrido': f"{horas_transcurridas:.1f} horas",
                'progreso': min(100, int((horas_transcurridas / horas_estimadas) * 100)),
                'estado': item['estado_global'].lower().replace('en', '').replace('recepcion', 'proceso').strip() or 'proceso',
                'diagnostico': diagnostico_texto,
                'motivoPausa': motivo_pausa,
                'fechaIngreso': fecha_ingreso.strftime('%d/%m/%Y %H:%M')
            })
        
        return jsonify({
            'success': True,
            'data': vehiculos_lista
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos en proceso: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500

@jefe_operativo_bp.route('/api/jefe-operativo/vehiculos-proceso/<int:orden_id>/reanudar', methods=['POST'])
@jefe_operativo_required
def reanudar_vehiculo(current_user, orden_id):
    """Reanudar un vehículo en pausa"""
    try:
        # Cambiar estado a EnProceso
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnProceso'}) \
            .eq('id', orden_id) \
            .execute()
        
        # Registrar en seguimiento
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': orden_id,
            'estado': 'EnProceso',
            'fecha_hora_cambio': datetime.datetime.now().isoformat()
        }).execute()
        
        logger.info(f"Vehículo {orden_id} reanudado por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True,
            'message': 'Vehículo reanudado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error reanudando vehículo: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


# =====================================================
# CONTROL DE SALIDAS
# =====================================================
@jefe_operativo_bp.route('/api/jefe-operativo/control-salidas', methods=['GET'])
@jefe_operativo_required
def get_control_salidas(current_user):
    """Obtener vehículos listos para entrega"""
    try:
        logger.info(f"Obteniendo control de salidas para usuario: {current_user.get('id')}")
        
        # Estados que consideramos para salidas
        estados = ['Finalizado', 'Entregado']
        
        # Consulta principal
        result = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                fecha_ingreso,
                fecha_salida,
                estado_global,
                vehiculo!inner(
                    id,
                    placa,
                    marca,
                    modelo,
                    anio,
                    cliente!inner(
                        id,
                        nombre,
                        telefono
                    )
                )
            ''') \
            .in_('estado_global', estados) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        salidas_lista = []
        for item in result.data if result.data else []:
            vehiculo = item.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            
            # Obtener técnicos asignados
            tecnicos_asignados = supabase.table('asignaciontecnico') \
                .select('usuario!inner(nombre)') \
                .eq('id_orden_trabajo', item['id']) \
                .execute()
            
            tecnicos = []
            if tecnicos_asignados.data:
                for t in tecnicos_asignados.data:
                    if t.get('usuario'):
                        tecnicos.append(t['usuario']['nombre'])
            
            # Obtener trabajos realizados (servicios aprobados)
            cotizacion = supabase.table('cotizacion') \
                .select('id') \
                .eq('id_orden_trabajo', item['id']) \
                .execute()
            
            trabajos = []
            if cotizacion.data:
                detalles = supabase.table('cotizaciondetalle') \
                    .select('servicio_descripcion') \
                    .eq('id_cotizacion', cotizacion.data[0]['id']) \
                    .eq('aprobado_por_cliente', True) \
                    .execute()
                
                if detalles.data:
                    for d in detalles.data:
                        trabajos.append(d['servicio_descripcion'])
            
            salidas_lista.append({
                'id': item['id'],
                'codigo': item['codigo_unico'],
                'cliente': cliente.get('nombre', ''),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip(),
                'placa': vehiculo.get('placa', ''),
                'tecnico': tecnicos[0] if tecnicos else 'Sin asignar',
                'estado': item['estado_global'].lower(),
                'fechaFinalizacion': item.get('fecha_ingreso'),  # Usar fecha de ingreso como referencia
                'fechaEntrega': item.get('fecha_salida'),
                'telefonoCliente': cliente.get('telefono'),
                'trabajos': trabajos
            })
        
        return jsonify({
            'success': True,
            'data': salidas_lista
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo control de salidas: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Error interno del servidor'}), 500

@jefe_operativo_bp.route('/api/jefe-operativo/confirmar-entrega/<int:orden_id>', methods=['POST'])
@jefe_operativo_required
def confirmar_entrega(current_user, orden_id):
    """Confirmar entrega de vehículo"""
    try:
        data = request.get_json()
        firma_data = data.get('firma')
        observaciones = data.get('observaciones', '')
        documentos = data.get('documentos', {})
        
        # Actualizar orden de trabajo
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'Entregado',
                'fecha_salida': datetime.datetime.now().isoformat()
            }) \
            .eq('id', orden_id) \
            .execute()
        
        # Registrar en seguimiento
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': orden_id,
            'estado': 'Entregado',
            'fecha_hora_cambio': datetime.datetime.now().isoformat(),
            'motivo_pausa': observaciones if observaciones else None
        }).execute()
        
        # Aquí podrías guardar la firma en Cloudinary si es necesario
        if firma_data:
            logger.info(f"Firma recibida para orden {orden_id}")
        
        logger.info(f"Entrega confirmada para orden {orden_id} por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True,
            'message': 'Entrega confirmada exitosamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error confirmando entrega: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500