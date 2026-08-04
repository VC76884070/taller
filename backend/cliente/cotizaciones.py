# =====================================================
# COTIZACIONES.PY - CLIENTE (COMPLETO CORREGIDO)
# CON COSTO DE DIAGNÓSTICO DE Bs. 200 AL RECHAZAR
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from functools import wraps
import datetime
import logging
import json
import jwt

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
cotizaciones_cliente_bp = Blueprint('cotizaciones_cliente', __name__)

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase
COSTO_DIAGNOSTICO = 200

# =====================================================
# DECORADOR CLIENTE REQUIRED
# =====================================================

def cliente_required(f):
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
            
            if 'user' in data:
                current_user = data['user']
            else:
                current_user = data
            
            if not current_user.get('id'):
                logger.error("Usuario sin ID en token")
                return jsonify({'error': 'Token inválido: ID de usuario no encontrado'}), 401
            
            roles = current_user.get('roles', [])
            if 'cliente' not in roles:
                logger.warning(f"Usuario {current_user.get('id')} no tiene rol cliente. Roles: {roles}")
                return jsonify({'error': 'Acceso denegado. Se requiere rol de cliente.'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            logger.error(f"Error en autenticación: {str(e)}")
            return jsonify({'error': 'Error de autenticación'}), 401
        
        return f(current_user, *args, **kwargs)
    return decorated

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_cliente_por_usuario(usuario_id):
    try:
        cliente = supabase.table('cliente') \
            .select('id, email, id_usuario') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return None
        
        cliente_data = cliente.data[0]
        
        usuario = supabase.table('usuario') \
            .select('nombre, contacto, email') \
            .eq('id', usuario_id) \
            .execute()
        
        if usuario.data:
            cliente_data['nombre'] = usuario.data[0].get('nombre', 'Cliente')
            cliente_data['telefono'] = usuario.data[0].get('contacto', '')
        
        return cliente_data
    except Exception as e:
        logger.error(f"Error obteniendo cliente: {e}")
        return None

def obtener_vehiculos_cliente(cliente_id):
    try:
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio') \
            .eq('id_cliente', cliente_id) \
            .execute()
        return vehiculos.data or []
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {e}")
        return []

def puede_editar_cotizacion(cotizacion_data):
    """Verifica si el cliente aún puede editar su decisión"""
    try:
        # Si el taller ya comenzó a trabajar
        if cotizacion_data.get('trabajo_iniciado', False):
            return False, "El taller ya comenzó a trabajar en tu vehículo."
        
        # Si ya está rechazada o aprobada y pasó tiempo
        estado = cotizacion_data.get('estado')
        if estado in ['rechazada', 'aprobado_total']:
            return False, f"La cotización ya fue {estado}. No se puede modificar."
        
        # Si ya pasó la ventana de 1 hora
        fecha_mod = cotizacion_data.get('fecha_ultima_modificacion') or cotizacion_data.get('fecha_envio')
        if fecha_mod:
            try:
                # Limpiar la fecha
                if isinstance(fecha_mod, str):
                    fecha_mod_str = fecha_mod.replace('Z', '+00:00')
                    fecha_mod_dt = datetime.datetime.fromisoformat(fecha_mod_str)
                else:
                    fecha_mod_dt = fecha_mod
                
                # Asegurar zona horaria UTC
                if fecha_mod_dt.tzinfo is None:
                    fecha_mod_dt = fecha_mod_dt.replace(tzinfo=datetime.timezone.utc)
                
                ahora = datetime.datetime.now(datetime.timezone.utc)
                minutos_pasados = (ahora - fecha_mod_dt).total_seconds() / 60
                ventana_minutos = cotizacion_data.get('ventana_edicion_horas', 1) * 60
                
                if minutos_pasados > ventana_minutos:
                    return False, f"El tiempo para editar expiró. Pasaron {int(minutos_pasados)} minutos (máximo {int(ventana_minutos)} minutos)"
            except Exception as e:
                logger.warning(f"Error calculando tiempo: {e}")
                # Si hay error, permitir por defecto
        
        return True, "Puede editar"
        
    except Exception as e:
        logger.error(f"Error verificando edición: {e}")
        return False, "Error verificando permisos"

# =====================================================
# ENDPOINT: PERFIL
# =====================================================

@cotizaciones_cliente_bp.route('/perfil', methods=['GET'])
@cliente_required
def obtener_perfil_cliente(current_user):
    try:
        usuario_id = current_user.get('id')
        
        usuario = supabase.table('usuario') \
            .select('id, nombre, email, contacto') \
            .eq('id', usuario_id) \
            .execute()
        
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        user_data = usuario.data[0]
        
        cliente = supabase.table('cliente') \
            .select('id, email') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        return jsonify({
            'success': True,
            'usuario': {
                'id': user_data['id'],
                'nombre': user_data.get('nombre', 'Cliente'),
                'email': user_data.get('email', ''),
                'contacto': user_data.get('contacto', ''),
                'roles': current_user.get('roles', ['cliente']),
                'id_cliente': cliente.data[0]['id'] if cliente.data else None
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT: LISTAR COTIZACIONES
# =====================================================

@cotizaciones_cliente_bp.route('/cotizaciones', methods=['GET'])
@cliente_required
def obtener_cotizaciones_cliente(current_user):
    try:
        estado = request.args.get('estado')
        usuario_id = current_user.get('id')
        
        cliente = supabase.table('cliente') \
            .select('id') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not cliente.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        cliente_id = cliente.data[0]['id']
        
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo') \
            .eq('id_cliente', cliente_id) \
            .execute()
        
        if not vehiculos.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        vehiculos_ids = [v['id'] for v in vehiculos.data]
        
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo, estado_global, fecha_ingreso') \
            .in_('id_vehiculo', vehiculos_ids) \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        ordenes_ids = [o['id'] for o in ordenes.data]
        
        query = supabase.table('cotizacion') \
            .select('id, id_orden_trabajo, fecha_generacion, fecha_envio, estado, nombre_archivo, servicios_json, motivo_rechazo, fecha_rechazo') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .order('fecha_generacion', desc=True)
        
        if estado and estado != 'all':
            query = query.eq('estado', estado)
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'cotizaciones': []}), 200
        
        ordenes_map = {o['id']: o for o in ordenes.data}
        vehiculos_map = {v['id']: v for v in vehiculos.data}
        
        cotizaciones = []
        for c in result.data:
            orden = ordenes_map.get(c['id_orden_trabajo'], {})
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            
            total = 0
            servicios_count = 0
            
            if c.get('estado') == 'rechazada':
                total = COSTO_DIAGNOSTICO
                servicios_count = 0
            else:
                if c.get('servicios_json'):
                    try:
                        servicios_data = c['servicios_json']
                        if isinstance(servicios_data, str):
                            servicios_data = json.loads(servicios_data)
                        
                        if c.get('estado') in ['aprobado_total', 'aprobado_parcial']:
                            aprobados = [s for s in servicios_data if s.get('aprobado_por_cliente', False)]
                            total = sum(float(s.get('precio', 0)) for s in aprobados)
                            servicios_count = len(aprobados)
                        else:
                            total = sum(float(s.get('precio', 0)) for s in servicios_data)
                            servicios_count = len(servicios_data)
                    except Exception as e:
                        logger.error(f"Error parseando servicios_json: {e}")
                        total = 0
            
            cotizaciones.append({
                'id': c['id'],
                'codigo_orden': orden.get('codigo_unico', 'N/A'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')}".strip() or 'Vehículo',
                'placa': vehiculo.get('placa', 'N/A'),
                'fecha': c.get('fecha_envio') or c.get('fecha_generacion'),
                'estado': c.get('estado', 'enviada'),
                'servicios_count': servicios_count,
                'monto_total': total,
                'motivo_rechazo': c.get('motivo_rechazo'),
                'fecha_rechazo': c.get('fecha_rechazo')
            })
        
        return jsonify({'success': True, 'cotizaciones': cotizaciones}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotizaciones: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT: DETALLE DE COTIZACIÓN
# =====================================================

@cotizaciones_cliente_bp.route('/cotizacion/<int:cotizacion_id>', methods=['GET'])
@cliente_required
def obtener_detalle_cotizacion_cliente(current_user, cotizacion_id):
    try:
        cotizacion = supabase.table('cotizacion') \
            .select('id, id_orden_trabajo, fecha_generacion, fecha_envio, estado, nombre_archivo, servicios_json, fecha_ultima_modificacion, ventana_edicion_horas, trabajo_iniciado, motivo_rechazo, fecha_rechazo') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        c = cotizacion.data[0]
        
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico, id_vehiculo') \
            .eq('id', c['id_orden_trabajo']) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_codigo = orden.data[0]['codigo_unico']
        id_vehiculo = orden.data[0]['id_vehiculo']
        
        vehiculo = supabase.table('vehiculo') \
            .select('marca, modelo, placa') \
            .eq('id', id_vehiculo) \
            .execute()
        
        vehiculo_data = vehiculo.data[0] if vehiculo.data else {}
        
        servicios = []
        total = 0
        
        if c.get('servicios_json'):
            try:
                servicios_data = c['servicios_json']
                if isinstance(servicios_data, str):
                    servicios_data = json.loads(servicios_data)
                
                for s in servicios_data:
                    precio = float(s.get('precio', 0))
                    
                    if c.get('estado') == 'rechazada':
                        total = COSTO_DIAGNOSTICO
                    elif c.get('estado') in ['aprobado_total', 'aprobado_parcial']:
                        if s.get('aprobado_por_cliente', False):
                            total += precio
                    else:
                        total += precio
                    
                    servicios.append({
                        'id_servicio': s.get('id_servicio'),
                        'descripcion': s.get('descripcion') or s.get('nombre', 'Servicio'),
                        'precio': precio,
                        'aprobado_por_cliente': s.get('aprobado_por_cliente', False),
                        'fecha_aprobacion': s.get('fecha_aprobacion')
                    })
            except Exception as e:
                logger.error(f"Error parseando servicios_json: {e}")
        
        if len(servicios) == 0 and c.get('estado') == 'rechazada':
            total = COSTO_DIAGNOSTICO
        
        puede_editar, mensaje_edicion = puede_editar_cotizacion(c)
        
        tiempo_restante = None
        if puede_editar:
            fecha_ref = c.get('fecha_ultima_modificacion') or c.get('fecha_envio')
            if fecha_ref:
                try:
                    if isinstance(fecha_ref, str):
                        fecha_ref = fecha_ref.replace('Z', '+00:00')
                        fecha_ref_dt = datetime.datetime.fromisoformat(fecha_ref)
                    else:
                        fecha_ref_dt = fecha_ref
                    
                    if fecha_ref_dt.tzinfo is None:
                        fecha_ref_dt = fecha_ref_dt.replace(tzinfo=datetime.timezone.utc)
                    
                    ahora = datetime.datetime.now(datetime.timezone.utc)
                    minutos_pasados = (ahora - fecha_ref_dt).total_seconds() / 60
                    ventana_minutos = c.get('ventana_edicion_horas', 1) * 60
                    minutos_restantes = max(0, ventana_minutos - minutos_pasados)
                    
                    tiempo_restante = {
                        'minutos': int(minutos_restantes),
                        'texto': f"{int(minutos_restantes)} minuto(s)"
                    }
                except Exception as e:
                    logger.error(f"Error calculando tiempo restante: {e}")
                    tiempo_restante = {'minutos': 60, 'texto': "60 minutos"}
        
        return jsonify({
            'success': True,
            'cotizacion': {
                'id': c['id'],
                'id_orden_trabajo': c['id_orden_trabajo'],
                'codigo_orden': orden_codigo,
                'vehiculo': f"{vehiculo_data.get('marca', '')} {vehiculo_data.get('modelo', '')}".strip(),
                'placa': vehiculo_data.get('placa', ''),
                'fecha_generacion': c.get('fecha_envio') or c.get('fecha_generacion'),
                'estado': c.get('estado', 'enviada'),
                'servicios': servicios,
                'total': total,
                'nombre_archivo': c.get('nombre_archivo'),
                'puede_editar': puede_editar,
                'mensaje_edicion': mensaje_edicion,
                'tiempo_restante': tiempo_restante,
                'motivo_rechazo': c.get('motivo_rechazo'),
                'fecha_rechazo': c.get('fecha_rechazo')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT: EDITAR DECISIÓN
# =====================================================

@cotizaciones_cliente_bp.route('/cotizacion/<int:cotizacion_id>/editar-decision', methods=['PUT'])
@cliente_required
def editar_decision_cotizacion(current_user, cotizacion_id):
    try:
        data = request.get_json()
        nuevos_servicios_aprobados = data.get('servicios_aprobados', [])
        comentario_edicion = data.get('comentario_edicion', '')
        
        ahora = datetime.datetime.now().isoformat()
        
        cotizacion = supabase.table('cotizacion') \
            .select('*, ordentrabajo!inner(estado_global)') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        c = cotizacion.data[0]
        
        puede, mensaje = puede_editar_cotizacion(c)
        if not puede:
            return jsonify({'error': mensaje}), 400
        
        historial = c.get('historial_aprobaciones', [])
        if isinstance(historial, str):
            historial = json.loads(historial)
        
        servicios_anteriores = []
        if c.get('servicios_json'):
            servicios_data = c['servicios_json']
            if isinstance(servicios_data, str):
                servicios_data = json.loads(servicios_data)
            for s in servicios_data:
                servicios_anteriores.append({
                    'id_servicio': s.get('id_servicio'),
                    'aprobado': s.get('aprobado_por_cliente', False)
                })
        
        historial.append({
            'fecha': ahora,
            'servicios': servicios_anteriores,
            'comentario': comentario_edicion
        })
        
        servicios_actualizados = []
        total = 0
        if c.get('servicios_json'):
            servicios_data = c['servicios_json']
            if isinstance(servicios_data, str):
                servicios_data = json.loads(servicios_data)
            
            for s in servicios_data:
                es_aprobado = s.get('id_servicio') in nuevos_servicios_aprobados
                s['aprobado_por_cliente'] = es_aprobado
                s['fecha_aprobacion'] = ahora if es_aprobado else None
                if es_aprobado:
                    total += float(s.get('precio', 0))
                servicios_actualizados.append(s)
        
        todos_aprobados = all(s.get('aprobado_por_cliente', False) for s in servicios_actualizados)
        hay_aprobados = any(s.get('aprobado_por_cliente', False) for s in servicios_actualizados)
        
        if todos_aprobados:
            nuevo_estado = 'aprobado_total'
            estado_orden = 'CotizacionAceptada'
        elif hay_aprobados:
            nuevo_estado = 'aprobado_parcial'
            estado_orden = 'CotizacionAceptada'
        else:
            nuevo_estado = 'enviada'
            estado_orden = 'CotizacionEnviada'
        
        supabase.table('cotizacion') \
            .update({
                'servicios_json': json.dumps(servicios_actualizados),
                'estado': nuevo_estado,
                'total': total,
                'fecha_ultima_modificacion': ahora,
                'historial_aprobaciones': json.dumps(historial)
            }) \
            .eq('id', cotizacion_id) \
            .execute()
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': estado_orden}) \
            .eq('id', c['id_orden_trabajo']) \
            .execute()
        
        orden = supabase.table('ordentrabajo') \
            .select('id_jefe_taller') \
            .eq('id', c['id_orden_trabajo']) \
            .execute()
        
        if orden.data and orden.data[0].get('id_jefe_taller'):
            supabase.table('notificacion').insert({
                'id_usuario_destino': orden.data[0]['id_jefe_taller'],
                'tipo': 'cotizacion_corregida',
                'mensaje': f"✏️ El cliente ha CORREGIDO su decisión. {comentario_edicion}",
                'fecha_envio': ahora,
                'leida': False
            }).execute()
        
        return jsonify({
            'success': True,
            'message': 'Decisión corregida exitosamente',
            'estado': nuevo_estado
        }), 200
        
    except Exception as e:
        logger.error(f"Error editando decisión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT: RECHAZAR COTIZACIÓN (CORREGIDO - SIN id_referencia)
# =====================================================

@cotizaciones_cliente_bp.route('/cotizacion/<int:cotizacion_id>/rechazar', methods=['POST'])
@cliente_required
def rechazar_cotizacion_cliente(current_user, cotizacion_id):
    try:
        ahora = datetime.datetime.now().isoformat()
        
        # Obtener cotización actual
        cotizacion = supabase.table('cotizacion') \
            .select('id_orden_trabajo, estado, id_jefe_taller') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        c = cotizacion.data[0]
        
        if c.get('estado') != 'enviada':
            return jsonify({'error': f'La cotización ya fue {c.get("estado")}'}), 400
        
        # 1. Actualizar cotización como rechazada
        supabase.table('cotizacion') \
            .update({
                'estado': 'rechazada',
                'fecha_rechazo': ahora,
                'total': 200.00,
                'fecha_ultima_modificacion': ahora
            }) \
            .eq('id', cotizacion_id) \
            .execute()
        
        # 2. Actualizar orden de trabajo - USAR EL MISMO ESTADO QUE ESPERA EL JS
        # El estado 'CotizacionRechazada' debe existir en tu tabla ordentrabajo
        try:
            supabase.table('ordentrabajo') \
                .update({
                    'estado_global': 'CotizacionRechazada',
                    'fecha_cotizacion_rechazada': ahora
                }) \
                .eq('id', c['id_orden_trabajo']) \
                .execute()
            logger.info(f"✅ Orden {c['id_orden_trabajo']} actualizada a CotizacionRechazada")
        except Exception as e:
            logger.warning(f"No se pudo usar CotizacionRechazada: {e}")
            # Fallback: usar EnDiagnostico pero el JS no lo mostrará correctamente
            supabase.table('ordentrabajo') \
                .update({
                    'estado_global': 'EnDiagnostico',
                    'fecha_cotizacion_rechazada': ahora
                }) \
                .eq('id', c['id_orden_trabajo']) \
                .execute()
            logger.info(f"✅ Orden {c['id_orden_trabajo']} actualizada a EnDiagnostico (fallback)")
        
        # 3. Notificar al jefe de taller
        if c.get('id_jefe_taller'):
            supabase.table('notificacion') \
                .insert({
                    'id_usuario_destino': c['id_jefe_taller'],
                    'tipo': 'cotizacion_rechazada',
                    'mensaje': f"❌ Cliente rechazó la cotización. Se cobrará Bs. 200 por diagnóstico.",
                    'fecha_envio': ahora,
                    'leida': False
                }) \
                .execute()
        
        return jsonify({
            'success': True,
            'message': f'Cotización rechazada. Costo de diagnóstico: Bs. 200.00',
            'costo_diagnostico': 200.00
        }), 200
        
    except Exception as e:
        logger.error(f"Error rechazando cotización: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT: APROBAR TOTAL (CORREGIDO - SIN id_referencia)
# =====================================================

@cotizaciones_cliente_bp.route('/cotizacion/<int:cotizacion_id>/aprobar-total', methods=['POST'])
@cliente_required
def aprobar_total(current_user, cotizacion_id):
    try:
        ahora = datetime.datetime.now().isoformat()
        
        cotizacion = supabase.table('cotizacion') \
            .select('id_orden_trabajo, estado, servicios_json, id_jefe_taller') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        c = cotizacion.data[0]
        
        if c.get('estado') != 'enviada':
            return jsonify({'error': f'La cotización ya fue {c.get("estado")}'}), 400
        
        servicios_actualizados = []
        total = 0
        if c.get('servicios_json'):
            servicios_data = c['servicios_json']
            if isinstance(servicios_data, str):
                servicios_data = json.loads(servicios_data)
            
            for s in servicios_data:
                s['aprobado_por_cliente'] = True
                s['fecha_aprobacion'] = ahora
                total += float(s.get('precio', 0))
                servicios_actualizados.append(s)
        
        supabase.table('cotizacion') \
            .update({
                'servicios_json': json.dumps(servicios_actualizados),
                'estado': 'aprobado_total',
                'total': total,
                'fecha_ultima_modificacion': ahora,
                'trabajo_iniciado': True
            }) \
            .eq('id', cotizacion_id) \
            .execute()
        
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'CotizacionAceptada',
                'fecha_cotizacion_aceptada': ahora
            }) \
            .eq('id', c['id_orden_trabajo']) \
            .execute()
        
        logger.info(f"✅ Orden {c['id_orden_trabajo']} actualizada - Fecha aceptación: {ahora}")
        
        # Notificar (SIN id_referencia)
        if c.get('id_jefe_taller'):
            supabase.table('notificacion') \
                .insert({
                    'id_usuario_destino': c['id_jefe_taller'],
                    'tipo': 'cotizacion_aprobada_total',
                    'mensaje': f"✅ El cliente ha aprobado TODOS los servicios. Total: Bs. {total:.2f}",
                    'fecha_envio': ahora,
                    'leida': False
                }) \
                .execute()
        
        return jsonify({
            'success': True,
            'message': f'¡Cotización aprobada totalmente! Total: Bs. {total:.2f}',
            'estado': 'aprobado_total',
            'total': total,
            'fecha_aprobacion': ahora
        }), 200
        
    except Exception as e:
        logger.error(f"Error en aprobación total: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT: APROBAR PARCIAL (CORREGIDO - SIN id_referencia)
# =====================================================

@cotizaciones_cliente_bp.route('/cotizacion/<int:cotizacion_id>/aprobar-parcial', methods=['POST'])
@cliente_required
def aprobar_parcial(current_user, cotizacion_id):
    try:
        data = request.get_json()
        servicios_aprobados_ids = data.get('servicios_aprobados', [])
        comentarios = data.get('comentarios', '')
        
        ahora = datetime.datetime.now().isoformat()
        
        cotizacion = supabase.table('cotizacion') \
            .select('id_orden_trabajo, estado, servicios_json, id_jefe_taller') \
            .eq('id', cotizacion_id) \
            .execute()
        
        if not cotizacion.data:
            return jsonify({'error': 'Cotización no encontrada'}), 404
        
        c = cotizacion.data[0]
        
        if c.get('estado') != 'enviada':
            return jsonify({'error': f'La cotización ya fue {c.get("estado")}'}), 400
        
        servicios_actualizados = []
        total = 0
        if c.get('servicios_json'):
            servicios_data = c['servicios_json']
            if isinstance(servicios_data, str):
                servicios_data = json.loads(servicios_data)
            
            for s in servicios_data:
                serv_id = s.get('id_servicio')
                es_aprobado = serv_id in servicios_aprobados_ids
                s['aprobado_por_cliente'] = es_aprobado
                s['fecha_aprobacion'] = ahora if es_aprobado else None
                if es_aprobado:
                    total += float(s.get('precio', 0))
                servicios_actualizados.append(s)
        
        supabase.table('cotizacion') \
            .update({
                'servicios_json': json.dumps(servicios_actualizados),
                'estado': 'aprobado_parcial',
                'total': total,
                'fecha_ultima_modificacion': ahora,
                'comentarios_cliente': comentarios if comentarios else None
            }) \
            .eq('id', cotizacion_id) \
            .execute()
        
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'CotizacionAceptada',
                'fecha_cotizacion_aceptada': ahora
            }) \
            .eq('id', c['id_orden_trabajo']) \
            .execute()
        
        logger.info(f"✅ Orden {c['id_orden_trabajo']} actualizada - Aprobación parcial - Fecha: {ahora}")
        
        # Notificar (SIN id_referencia)
        if c.get('id_jefe_taller'):
            supabase.table('notificacion') \
                .insert({
                    'id_usuario_destino': c['id_jefe_taller'],
                    'tipo': 'cotizacion_aprobada_parcial',
                    'mensaje': f"📋 Cliente aprobó {len(servicios_aprobados_ids)} servicio(s). Total: Bs. {total:.2f}",
                    'fecha_envio': ahora,
                    'leida': False
                }) \
                .execute()
        
        return jsonify({
            'success': True,
            'message': f'Cotización aprobada parcialmente. Total: Bs. {total:.2f}',
            'estado': 'aprobado_parcial',
            'total': total,
            'fecha_aprobacion': ahora
        }), 200
        
    except Exception as e:
        logger.error(f"Error en aprobación parcial: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT: TEST
# =====================================================

@cotizaciones_cliente_bp.route('/test', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de cotizaciones cliente funcionando'}), 200