# =====================================================
# DASHBOARD JEFE OPERATIVO - VERSIÓN CORREGIDA
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from functools import wraps
import datetime
import jwt
import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

dashboard_op_bp = Blueprint('dashboard_operativo', __name__, url_prefix='/api/jefe-operativo')
supabase = config.supabase
SECRET_KEY = config.SECRET_KEY

# Thread pool para consultas paralelas
executor = ThreadPoolExecutor(max_workers=4)

# =====================================================
# DECORADORES
# =====================================================

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if 'user' in data:
                current_user = data['user']
            else:
                current_user = data
            
            if not current_user.get('id'):
                return jsonify({'error': 'Token inválido'}), 401
            
            request.current_user = current_user
            
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(*args, **kwargs)
    return decorated


def jefe_operativo_required(f):
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        current_user = request.current_user
        roles = current_user.get('roles', [])
        roles_lower = [r.lower() for r in roles]
        
        if 'jefe_operativo' not in roles_lower:
            return jsonify({'error': 'Acceso denegado. Se requiere rol jefe_operativo'}), 403
        
        return f(current_user, *args, **kwargs)
    return decorated


# =====================================================
# FUNCIONES AUXILIARES OPTIMIZADAS
# =====================================================

def obtener_vehiculos_por_ids(ids_vehiculos):
    """Obtiene múltiples vehículos de una sola vez"""
    if not ids_vehiculos:
        return {}
    
    try:
        # Filtrar IDs nulos o vacíos
        ids_validos = [id for id in ids_vehiculos if id]
        if not ids_validos:
            return {}
        
        # Consultar todos los vehículos de una vez
        response = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, id_cliente') \
            .in_('id', ids_validos) \
            .execute()
        
        vehiculos = {}
        for v in (response.data or []):
            vehiculos[v['id']] = v
        
        return vehiculos
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {e}")
        return {}


def obtener_clientes_por_ids(ids_clientes):
    """Obtiene múltiples clientes de una sola vez"""
    if not ids_clientes:
        return {}
    
    try:
        ids_validos = [id for id in ids_clientes if id]
        if not ids_validos:
            return {}
        
        # Consultar todos los clientes de una vez
        response = supabase.table('cliente') \
            .select('id, id_usuario') \
            .in_('id', ids_validos) \
            .execute()
        
        clientes = {}
        for c in (response.data or []):
            clientes[c['id']] = c
        
        return clientes
    except Exception as e:
        logger.error(f"Error obteniendo clientes: {e}")
        return {}


def obtener_usuarios_por_ids(ids_usuarios):
    """Obtiene múltiples usuarios de una sola vez"""
    if not ids_usuarios:
        return {}
    
    try:
        ids_validos = [id for id in ids_usuarios if id]
        if not ids_validos:
            return {}
        
        response = supabase.table('usuario') \
            .select('id, nombre') \
            .in_('id', ids_validos) \
            .execute()
        
        usuarios = {}
        for u in (response.data or []):
            usuarios[u['id']] = u
        
        return usuarios
    except Exception as e:
        logger.error(f"Error obteniendo usuarios: {e}")
        return {}


# =====================================================
# ENDPOINT PRINCIPAL OPTIMIZADO
# =====================================================

@dashboard_op_bp.route('/dashboard', methods=['GET'])
@jefe_operativo_required
def obtener_dashboard(current_user):
    try:
        user_id = current_user.get('id')
        
        # 1. Obtener órdenes activas
        ordenes_response = supabase.table('ordentrabajo') \
            .select('*') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        ordenes = ordenes_response.data or []
        
        # 2. Obtener estadísticas en paralelo
        hoy = datetime.datetime.now().date()
        manana = hoy + datetime.timedelta(days=1)
        
        futures = []
        
        # Contar ingresados hoy
        futures.append(executor.submit(
            lambda: supabase.table('ordentrabajo')
            .select('id', count='exact')
            .gte('fecha_ingreso', hoy.isoformat())
            .lt('fecha_ingreso', manana.isoformat())
            .execute()
        ))
        
        # Contar en pausa
        futures.append(executor.submit(
            lambda: supabase.table('ordentrabajo')
            .select('id', count='exact')
            .eq('estado_global', 'EnPausa')
            .execute()
        ))
        
        # Obtener últimos ingresos
        ultimos_ingresos_response = supabase.table('ordentrabajo') \
            .select('*') \
            .order('fecha_ingreso', desc=True) \
            .limit(10) \
            .execute()
        
        ultimos_ingresos_data = ultimos_ingresos_response.data or []
        
        ingresados_hoy_result = futures[0].result()
        en_pausa_result = futures[1].result()
        
        ingresados_hoy = ingresados_hoy_result.count or 0
        en_proceso = len(ordenes)
        en_pausa = en_pausa_result.count or 0
        
        # 3. Recolectar IDs para consultas masivas
        ids_vehiculos = []
        ids_ordenes_ingresos = []
        
        for orden in ordenes:
            if orden.get('id_vehiculo'):
                ids_vehiculos.append(orden['id_vehiculo'])
        
        for orden in ultimos_ingresos_data:
            if orden.get('id_vehiculo'):
                ids_vehiculos.append(orden['id_vehiculo'])
                ids_ordenes_ingresos.append(orden)
        
        # 4. Consultas masivas de datos relacionados
        vehiculos_dict = obtener_vehiculos_por_ids(ids_vehiculos)
        
        # Recolectar IDs de clientes
        ids_clientes = []
        for v in vehiculos_dict.values():
            if v.get('id_cliente'):
                ids_clientes.append(v['id_cliente'])
        
        clientes_dict = obtener_clientes_por_ids(ids_clientes)
        
        # Recolectar IDs de usuarios
        ids_usuarios = []
        for c in clientes_dict.values():
            if c.get('id_usuario'):
                ids_usuarios.append(c['id_usuario'])
        
        usuarios_dict = obtener_usuarios_por_ids(ids_usuarios)
        
        # 5. Procesar próximas entregas
        proximas_entregas = []
        hoy_dt = datetime.datetime.now()
        
        for orden in ordenes:
            id_vehiculo = orden.get('id_vehiculo')
            vehiculo_info = vehiculos_dict.get(id_vehiculo, {})
            
            placa = vehiculo_info.get('placa', 'Sin placa')
            marca = vehiculo_info.get('marca', '')
            modelo = vehiculo_info.get('modelo', '')
            
            # Obtener nombre del cliente
            id_cliente = vehiculo_info.get('id_cliente')
            cliente_info = clientes_dict.get(id_cliente, {})
            id_usuario = cliente_info.get('id_usuario')
            usuario_info = usuarios_dict.get(id_usuario, {})
            cliente_nombre = usuario_info.get('nombre', 'No registrado')
            
            # Formatear vehículo
            if marca and modelo:
                vehiculo_str = f"{marca} {modelo}"
                if placa and placa != 'Sin placa':
                    vehiculo_str = f"{vehiculo_str} ({placa})"
            elif marca:
                vehiculo_str = marca
                if placa and placa != 'Sin placa':
                    vehiculo_str = f"{vehiculo_str} ({placa})"
            elif placa and placa != 'Sin placa':
                vehiculo_str = placa
            else:
                vehiculo_str = 'Vehículo sin especificar'
            
            # Calcular días restantes
            dias_restantes = None
            prioridad = 'normal'
            fecha_estimada = orden.get('fecha_estimada_finalizacion')
            
            if fecha_estimada:
                try:
                    if isinstance(fecha_estimada, str):
                        fecha_fin = datetime.datetime.fromisoformat(fecha_estimada.replace('Z', '+00:00'))
                    else:
                        fecha_fin = fecha_estimada
                    
                    dias_restantes = (fecha_fin - hoy_dt).days
                    
                    if dias_restantes < 0:
                        prioridad = 'urgente'
                    elif dias_restantes == 0:
                        prioridad = 'hoy'
                    elif dias_restantes <= 3:
                        prioridad = 'pronto'
                except Exception as e:
                    logger.warning(f"Error calculando días: {e}")
            
            proximas_entregas.append({
                'id_orden': orden.get('id'),
                'codigo': orden.get('codigo_unico'),
                'placa': placa,
                'vehiculo': vehiculo_str,
                'cliente': cliente_nombre,
                'dias_restantes': dias_restantes,
                'dias_estimados': orden.get('dias_estimados_reparacion'),
                'prioridad': prioridad
            })
        
        # Ordenar entregas
        proximas_entregas.sort(key=lambda x: x['dias_restantes'] if x['dias_restantes'] is not None else 999)
        proximas_entregas = proximas_entregas[:15]
        
        # 6. Procesar vehículos en taller
        vehiculos_taller = []
        for orden in ordenes[:15]:
            id_vehiculo = orden.get('id_vehiculo')
            vehiculo_info = vehiculos_dict.get(id_vehiculo, {})
            
            placa = vehiculo_info.get('placa', 'Sin placa')
            marca = vehiculo_info.get('marca', '')
            modelo = vehiculo_info.get('modelo', '')
            
            if marca and modelo:
                vehiculo_str = f"{marca} {modelo}"
                if placa and placa != 'Sin placa':
                    vehiculo_str = f"{vehiculo_str} ({placa})"
            elif marca:
                vehiculo_str = marca
                if placa and placa != 'Sin placa':
                    vehiculo_str = f"{vehiculo_str} ({placa})"
            elif placa and placa != 'Sin placa':
                vehiculo_str = placa
            else:
                vehiculo_str = 'Vehículo sin especificar'
            
            # Calcular días restantes
            dias_restantes = None
            fecha_estimada = orden.get('fecha_estimada_finalizacion')
            if fecha_estimada:
                try:
                    if isinstance(fecha_estimada, str):
                        fecha_fin = datetime.datetime.fromisoformat(fecha_estimada.replace('Z', '+00:00'))
                    else:
                        fecha_fin = fecha_estimada
                    dias_restantes = (fecha_fin - hoy_dt).days
                except:
                    pass
            
            vehiculos_taller.append({
                'id_orden': orden.get('id'),
                'codigo': orden.get('codigo_unico'),
                'placa': placa,
                'vehiculo': vehiculo_str,
                'estado': orden.get('estado_global'),
                'dias_restantes': dias_restantes
            })
        
        # 7. Procesar últimos ingresos
        ultimos_ingresos = []
        for orden in ultimos_ingresos_data:
            id_vehiculo = orden.get('id_vehiculo')
            vehiculo_info = vehiculos_dict.get(id_vehiculo, {})
            
            placa = vehiculo_info.get('placa', '---')
            marca = vehiculo_info.get('marca', '')
            modelo = vehiculo_info.get('modelo', '')
            
            # Obtener nombre del cliente
            id_cliente = vehiculo_info.get('id_cliente')
            cliente_info = clientes_dict.get(id_cliente, {})
            id_usuario = cliente_info.get('id_usuario')
            usuario_info = usuarios_dict.get(id_usuario, {})
            cliente_nombre = usuario_info.get('nombre', 'No registrado')
            
            # Formatear vehículo
            if marca and modelo:
                vehiculo_str = f"{marca} {modelo}"
            elif marca:
                vehiculo_str = marca
            else:
                vehiculo_str = 'Vehículo sin especificar'
            
            # Formatear hora
            fecha_ingreso = orden.get('fecha_ingreso')
            hora = ''
            if fecha_ingreso:
                try:
                    if isinstance(fecha_ingreso, str):
                        fecha_obj = datetime.datetime.fromisoformat(fecha_ingreso.replace('Z', '+00:00'))
                    else:
                        fecha_obj = fecha_ingreso
                    hora = fecha_obj.strftime('%H:%M')
                except:
                    hora = '--:--'
            
            ultimos_ingresos.append({
                'id': orden.get('id'),
                'hora': hora,
                'placa': placa,
                'vehiculo': vehiculo_str,
                'cliente': cliente_nombre,
                'estado': orden.get('estado_global')
            })
        
        # 8. Obtener notificaciones
        notificaciones = obtener_notificaciones(user_id)
        
        return jsonify({
            'success': True,
            'data': {
                'kpis': {
                    'ingresados_hoy': ingresados_hoy,
                    'en_proceso': en_proceso,
                    'en_pausa': en_pausa,
                    'ingresos_hoy': 0
                },
                'proximas_entregas': proximas_entregas,
                'vehiculos_taller': vehiculos_taller,
                'notificaciones': notificaciones['items'],
                'total_notificaciones': notificaciones['total'],
                'grafico': {'fechas': [], 'ingresos': []},
                'ultimos_ingresos': ultimos_ingresos
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error en dashboard: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT: ÓRDENES PARA CALENDARIO
# =====================================================

@dashboard_op_bp.route('/ordenes-activas-calendario', methods=['GET'])
@jefe_operativo_required
def obtener_ordenes_calendario(current_user):
    try:
        # Obtener órdenes activas
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_estimada_finalizacion, dias_estimados_reparacion, estado_global, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        # Recolectar IDs de vehículos
        ids_vehiculos = []
        for orden in (ordenes.data or []):
            if orden.get('id_vehiculo'):
                ids_vehiculos.append(orden['id_vehiculo'])
        
        # Obtener todos los vehículos de una vez
        vehiculos_dict = obtener_vehiculos_por_ids(ids_vehiculos)
        
        # Construir resultado
        resultado = []
        for orden in (ordenes.data or []):
            id_vehiculo = orden.get('id_vehiculo')
            vehiculo_info = vehiculos_dict.get(id_vehiculo, {})
            placa = vehiculo_info.get('placa', 'Sin placa')
            
            resultado.append({
                'id_orden': orden.get('id'),
                'codigo_unico': orden.get('codigo_unico'),
                'fecha_ingreso': orden.get('fecha_ingreso'),
                'fecha_estimada_finalizacion': orden.get('fecha_estimada_finalizacion'),
                'dias_estimados_reparacion': orden.get('dias_estimados_reparacion'),
                'placa': placa
            })
        
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error en ordenes-activas-calendario: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# FUNCIÓN DE NOTIFICACIONES
# =====================================================

def obtener_notificaciones(user_id, limite=10):
    try:
        # Ejecutar consultas en paralelo
        future1 = executor.submit(
            lambda: supabase.table('notificacion')
            .select('*')
            .eq('id_usuario_destino', user_id)
            .order('fecha_envio', desc=True)
            .limit(limite)
            .execute()
        )
        
        future2 = executor.submit(
            lambda: supabase.table('notificacion')
            .select('id', count='exact')
            .eq('id_usuario_destino', user_id)
            .eq('leida', False)
            .execute()
        )
        
        notificaciones_result = future1.result()
        no_leidas_result = future2.result()
        
        items = []
        for n in (notificaciones_result.data or []):
            items.append({
                'id': n.get('id'),
                'mensaje': n.get('mensaje', ''),
                'tipo': n.get('tipo', 'info'),
                'leida': n.get('leida', False),
                'fecha_envio': n.get('fecha_envio'),
                'icono': 'bell'
            })
        
        return {'items': items, 'total': no_leidas_result.count or 0}
        
    except Exception as e:
        logger.error(f"Error en notificaciones: {e}")
        return {'items': [], 'total': 0}