from flask import Blueprint, request, jsonify, render_template
from functools import wraps
from config import config
import jwt
import datetime
import logging

logger = logging.getLogger(__name__)

mis_vehiculos_bp = Blueprint('mis_vehiculos', __name__, url_prefix='/tecnico')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL TÉCNICO
# =====================================================
def tecnico_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Buscar token en cookies o header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                pass
        
        if not token:
            token = request.cookies.get('token')
        
        if not token:
            return jsonify({'error': 'No autorizado'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            
            # Verificar que sea técnico (id_rol = 4)
            if current_user.get('id_rol') != 4:
                logger.warning(f"Usuario {current_user.get('nombre')} intentó acceder sin permisos de técnico")
                return jsonify({'error': 'No autorizado - Se requiere rol de Técnico'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Sesión expirada'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# RUTA PARA SERVIR EL HTML
# =====================================================
@mis_vehiculos_bp.route('/mis-vehiculos')
@tecnico_required
def mis_vehiculos_page(current_user):
    """Servir la página de Mis Vehículos"""
    return render_template('../tecnico_mecanico/misvehiculos.html', usuario=current_user)


# =====================================================
# API: OBTENER VEHÍCULOS ASIGNADOS
# =====================================================
@mis_vehiculos_bp.route('/api/mis-vehiculos', methods=['GET'])
@tecnico_required
def obtener_mis_vehiculos(current_user):
    try:
        tecnico_id = current_user['id']
        
        # 1. Obtener asignaciones activas del técnico
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, fecha_hora_inicio') \
            .eq('id_tecnico', tecnico_id) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignaciones.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in asignaciones.data]
        asignacion_fechas = {a['id_orden_trabajo']: a['fecha_hora_inicio'] for a in asignaciones.data}
        
        # 2. Obtener órdenes de trabajo (solo EnProceso o EnPausa)
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .in_('id', orden_ids) \
            .in_('estado_global', ['EnProceso', 'EnPausa']) \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        # 3. Obtener vehículos
        vehiculos_ids = [o['id_vehiculo'] for o in ordenes.data]
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .in_('id', vehiculos_ids) \
            .execute()
        vehiculos_map = {v['id']: v for v in (vehiculos.data or [])}
        
        # 4. Obtener clientes
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
        
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # 5. Obtener recepciones
        recepciones = supabase.table('recepcion') \
            .select('id_orden_trabajo, transcripcion_problema, url_grabacion_problema') \
            .in_('id_orden_trabajo', orden_ids) \
            .execute()
        recepciones_map = {r['id_orden_trabajo']: r for r in (recepciones.data or [])}
        
        # 6. Obtener diagnósticos iniciales
        diagnosticos = supabase.table('diagnostigoinicial') \
            .select('id_orden_trabajo, diagnostigo, url_grabacion') \
            .in_('id_orden_trabajo', orden_ids) \
            .execute()
        diagnosticos_map = {d['id_orden_trabajo']: d for d in (diagnosticos.data or [])}
        
        # 7. Obtener pausas (seguimiento)
        pausas = supabase.table('seguimientoorden') \
            .select('id_orden_trabajo, motivo_pausa, fecha_hora_cambio') \
            .in_('id_orden_trabajo', orden_ids) \
            .eq('estado', 'EnPausa') \
            .execute()
        pausas_map = {p['id_orden_trabajo']: p for p in (pausas.data or [])}
        
        # 8. Construir respuesta
        vehiculos_resultado = []
        for orden in ordenes.data:
            vehiculo = vehiculos_map.get(orden['id_vehiculo'], {})
            cliente_info = clientes_map.get(vehiculo.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
            
            vehiculos_resultado.append({
                'orden_id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_asignacion': asignacion_fechas.get(orden['id']),
                'estado_global': orden['estado_global'],
                'motivo_pausa': pausas_map.get(orden['id'], {}).get('motivo_pausa'),
                'fecha_pausa': pausas_map.get(orden['id'], {}).get('fecha_hora_cambio'),
                'vehiculo': {
                    'placa': vehiculo.get('placa', ''),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'anio': vehiculo.get('anio'),
                    'kilometraje': vehiculo.get('kilometraje')
                },
                'cliente': {
                    'nombre': usuario_cliente.get('nombre', 'No registrado'),
                    'contacto': usuario_cliente.get('contacto', 'No registrado'),
                    'email': usuario_cliente.get('email', '')
                },
                'diagnostico_inicial': diagnosticos_map.get(orden['id'], {}).get('diagnostigo', ''),
                'diagnostico_audio_url': diagnosticos_map.get(orden['id'], {}).get('url_grabacion'),
                'recepcion': {
                    'transcripcion_problema': recepciones_map.get(orden['id'], {}).get('transcripcion_problema', ''),
                    'audio_url': recepciones_map.get(orden['id'], {}).get('url_grabacion_problema')
                }
            })
        
        return jsonify({'success': True, 'vehiculos': vehiculos_resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: PAUSAR TRABAJO
# =====================================================
@mis_vehiculos_bp.route('/api/pausar-trabajo', methods=['POST'])
@tecnico_required
def pausar_trabajo(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        motivo = data.get('motivo', '').strip()
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not motivo:
            return jsonify({'error': 'Debe especificar el motivo de la pausa'}), 400
        
        # Verificar que la orden está asignada al técnico
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada'}), 403
        
        # Verificar estado actual
        orden = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden.data['estado_global'] != 'EnProceso':
            return jsonify({'error': f'No se puede pausar una orden en estado {orden.data["estado_global"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Actualizar estado de la orden
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnPausa'}) \
            .eq('id', id_orden) \
            .execute()
        
        # Registrar en seguimiento
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnPausa',
            'motivo_pausa': motivo,
            'fecha_hora_cambio': ahora,
            'notificaciones_enviadas': 0
        }).execute()
        
        logger.info(f"⏸️ Orden {id_orden} en pausa por técnico {current_user.get('nombre')}: {motivo}")
        
        return jsonify({'success': True, 'message': 'Trabajo en pausa'}), 200
        
    except Exception as e:
        logger.error(f"Error pausando trabajo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: REANUDAR TRABAJO
# =====================================================
@mis_vehiculos_bp.route('/api/reanudar-trabajo', methods=['POST'])
@tecnico_required
def reanudar_trabajo(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        # Verificar asignación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada'}), 403
        
        # Verificar estado
        orden = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden.data['estado_global'] != 'EnPausa':
            return jsonify({'error': f'No se puede reanudar una orden en estado {orden.data["estado_global"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Actualizar estado
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnProceso'}) \
            .eq('id', id_orden) \
            .execute()
        
        # Registrar en seguimiento
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnProceso',
            'fecha_hora_cambio': ahora
        }).execute()
        
        logger.info(f"▶️ Orden {id_orden} reanudada por técnico {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': 'Trabajo reanudado'}), 200
        
    except Exception as e:
        logger.error(f"Error reanudando trabajo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER DETALLE DE ORDEN
# =====================================================
@mis_vehiculos_bp.route('/api/detalle-orden/<int:id_orden>', methods=['GET'])
@tecnico_required
def detalle_orden(current_user, id_orden):
    try:
        logger.info(f"=== OBTENIENDO DETALLE ORDEN {id_orden} ===")
        
        # Verificar asignación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            logger.warning(f"Técnico {current_user['id']} no tiene asignada la orden {id_orden}")
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        # Obtener orden de trabajo con JOINs
        orden = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                fecha_ingreso,
                fecha_salida,
                estado_global,
                id_vehiculo
            ''') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data
        vehiculo_id = orden_data.get('id_vehiculo')
        
        # Obtener vehículo
        vehiculo = supabase.table('vehiculo') \
            .select('''
                id,
                placa,
                marca,
                modelo,
                anio,
                kilometraje,
                color,
                id_cliente
            ''') \
            .eq('id', vehiculo_id) \
            .single() \
            .execute()
        
        vehiculo_data = vehiculo.data if vehiculo.data else {}
        cliente_id = vehiculo_data.get('id_cliente')
        
        # Obtener cliente y su usuario
        cliente_info = {}
        if cliente_id:
            cliente = supabase.table('cliente') \
                .select('''
                    id,
                    id_usuario,
                    email,
                    telefono,
                    direccion
                ''') \
                .eq('id', cliente_id) \
                .single() \
                .execute()
            
            if cliente.data:
                usuario_id = cliente.data.get('id_usuario')
                if usuario_id:
                    usuario = supabase.table('usuario') \
                        .select('nombre, contacto, email') \
                        .eq('id', usuario_id) \
                        .single() \
                        .execute()
                    
                    if usuario.data:
                        cliente_info = {
                            'nombre': usuario.data.get('nombre', 'No registrado'),
                            'telefono': usuario.data.get('contacto', 'No registrado'),
                            'email': cliente.data.get('email', 'No registrado')
                        }
                    else:
                        cliente_info = {
                            'nombre': 'No registrado',
                            'telefono': cliente.data.get('telefono', 'No registrado'),
                            'email': cliente.data.get('email', 'No registrado')
                        }
                else:
                    cliente_info = {
                        'nombre': 'Cliente sin usuario',
                        'telefono': cliente.data.get('telefono', 'No registrado'),
                        'email': cliente.data.get('email', 'No registrado')
                    }
        
        # Obtener diagnóstico inicial
        diagnostico_inicial = supabase.table('diagnostigoinicial') \
            .select('diagnostigo, url_grabacion, fecha_hora') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_hora', desc=True) \
            .limit(1) \
            .execute()
        
        diagnostico_data = diagnostico_inicial.data[0] if diagnostico_inicial.data else {}
        
        # Obtener recepción con fotos
        recepcion = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        # Filtrar solo las URLs de fotos que no sean nulas
        fotos_keys = [
            'url_lateral_izquierda', 'url_lateral_derecha', 
            'url_foto_frontal', 'url_foto_trasera', 
            'url_foto_superior', 'url_foto_inferior', 
            'url_foto_tablero'
        ]
        
        fotos = {}
        for key in fotos_keys:
            url = recepcion_data.get(key)
            if url and url != '' and url != 'null':
                # Limpiar el nombre de la clave para mostrar
                nombre_mostrar = key.replace('url_', '').replace('_', ' ').title()
                fotos[nombre_mostrar] = url
        
        # Log para depuración
        logger.info(f"Datos obtenidos - Vehículo: {vehiculo_data.get('placa', 'N/A')}")
        logger.info(f"Datos obtenidos - Cliente: {cliente_info.get('nombre', 'N/A')}")
        
        # Construir respuesta
        response_data = {
            'success': True,
            'detalle': {
                'vehiculo': {
                    'placa': vehiculo_data.get('placa', 'N/A'),
                    'marca': vehiculo_data.get('marca', 'No especificada'),
                    'modelo': vehiculo_data.get('modelo', 'No especificado'),
                    'anio': vehiculo_data.get('anio', 'N/A'),
                    'kilometraje': vehiculo_data.get('kilometraje', 0),
                    'color': vehiculo_data.get('color', 'No especificado')
                },
                'cliente': {
                    'nombre': cliente_info.get('nombre', 'No registrado'),
                    'telefono': cliente_info.get('telefono', 'No registrado'),
                    'email': cliente_info.get('email', 'No registrado')
                },
                'orden': {
                    'codigo_unico': orden_data.get('codigo_unico', 'N/A'),
                    'fecha_ingreso': orden_data.get('fecha_ingreso'),
                    'estado_global': orden_data.get('estado_global', 'N/A')
                },
                'diagnostico_inicial': diagnostico_data.get('diagnostigo', 'No hay instrucciones registradas'),
                'diagnostico_audio_url': diagnostico_data.get('url_grabacion'),
                'recepcion': {
                    'transcripcion_problema': recepcion_data.get('transcripcion_problema', 'No hay descripción del problema'),
                    'audio_url': recepcion_data.get('url_grabacion_problema'),
                    'fotos': fotos
                }
            }
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500