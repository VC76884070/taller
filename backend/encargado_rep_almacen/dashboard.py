# =====================================================
# DASHBOARD.PY - ENCARGADO DE REPUESTOS (CORREGIDO)
# FURIA MOTOR COMPANY SRL
# UBICACIÓN: backend/encargado_rep_almacen/dashboard.py
# =====================================================

from flask import Blueprint, jsonify, request
from config import config
import datetime
import logging
import json
from functools import wraps
import jwt

logger = logging.getLogger(__name__)

dashboard_bp = Blueprint('dashboard_repuestos', __name__, url_prefix='/api/encargado-repuestos')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# DECORADOR PARA ENCARGADO DE REPUESTOS
# =====================================================

def encargado_repuestos_required(f):
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
            
            usuario_id = current_user.get('id')
            if not usuario_id:
                return jsonify({'error': 'Token inválido'}), 401
            
            # Obtener roles del usuario
            roles_result = supabase.table('usuario_rol') \
                .select('rol:rol!inner(nombre_rol)') \
                .eq('id_usuario', usuario_id) \
                .execute()
            
            roles = []
            for r in (roles_result.data or []):
                if 'rol' in r and r['rol']:
                    roles.append(r['rol']['nombre_rol'].lower())
            
            logger.info(f"🔍 Dashboard - Roles del usuario {usuario_id}: {roles}")
            
            # Verificar si tiene rol de encargado de repuestos
            tiene_rol = False
            for rol in roles:
                if 'repuestos' in rol or 'almacen' in rol:
                    tiene_rol = True
                    break
            
            if not tiene_rol:
                return jsonify({'error': 'No autorizado - Se requiere rol de Encargado de Repuestos'}), 403
            
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Sesión expirada'}), 401
        except jwt.InvalidTokenError as e:
            logger.error(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            logger.error(f"Error en decorador: {str(e)}")
            return jsonify({'error': 'Error de autenticación'}), 401
        
        return f(current_user, *args, **kwargs)
    return decorated


# =====================================================
# DASHBOARD PRINCIPAL
# =====================================================

@dashboard_bp.route('/dashboard', methods=['GET'])
@encargado_repuestos_required
def obtener_dashboard(current_user):
    """Obtener datos para el dashboard del encargado de repuestos"""
    try:
        usuario_id = current_user['id']
        logger.info(f"📊 Cargando dashboard para usuario: {usuario_id}")
        
        # =====================================================
        # 1. ESTADÍSTICAS DE SOLICITUDES DE COMPRA
        # =====================================================
        pendientes_count = 0
        comprados_count = 0
        entregados_count = 0
        total_count = 0
        
        try:
            # Solicitudes pendientes
            pendientes = supabase.table('solicitud_compra') \
                .select('id', count='exact') \
                .eq('id_encargado_repuestos', usuario_id) \
                .eq('estado', 'pendiente') \
                .execute()
            pendientes_count = pendientes.count if hasattr(pendientes, 'count') else len(pendientes.data or [])
        except Exception as e:
            logger.warning(f"Error contando pendientes: {e}")
        
        try:
            # Solicitudes compradas
            comprados = supabase.table('solicitud_compra') \
                .select('id', count='exact') \
                .eq('id_encargado_repuestos', usuario_id) \
                .eq('estado', 'comprado') \
                .execute()
            comprados_count = comprados.count if hasattr(comprados, 'count') else len(comprados.data or [])
        except Exception as e:
            logger.warning(f"Error contando comprados: {e}")
        
        try:
            # Solicitudes entregadas
            entregados = supabase.table('solicitud_compra') \
                .select('id', count='exact') \
                .eq('id_encargado_repuestos', usuario_id) \
                .eq('estado', 'entregado') \
                .execute()
            entregados_count = entregados.count if hasattr(entregados, 'count') else len(entregados.data or [])
        except Exception as e:
            logger.warning(f"Error contando entregados: {e}")
        
        try:
            # Total de solicitudes
            total = supabase.table('solicitud_compra') \
                .select('id', count='exact') \
                .eq('id_encargado_repuestos', usuario_id) \
                .execute()
            total_count = total.count if hasattr(total, 'count') else len(total.data or [])
        except Exception as e:
            logger.warning(f"Error contando total: {e}")
        
        # =====================================================
        # 2. SOLICITUDES RECIENTES
        # =====================================================
        solicitudes_data = []
        try:
            solicitudes_recientes = supabase.table('solicitud_compra') \
                .select('id, orden_codigo, items, estado, fecha_solicitud, precio_cotizado') \
                .eq('id_encargado_repuestos', usuario_id) \
                .order('fecha_solicitud', desc=True) \
                .limit(5) \
                .execute()
            
            for s in (solicitudes_recientes.data or []):
                items = s.get('items', [])
                if isinstance(items, str):
                    try:
                        items = json.loads(items)
                    except:
                        items = []
                
                solicitudes_data.append({
                    'id': s.get('id'),
                    'orden_codigo': s.get('orden_codigo', 'N/A'),
                    'items_count': len(items) if items else 1,
                    'estado': s.get('estado', 'pendiente'),
                    'fecha_solicitud': s.get('fecha_solicitud'),
                    'precio_cotizado': float(s.get('precio_cotizado')) if s.get('precio_cotizado') else 0
                })
        except Exception as e:
            logger.warning(f"Error cargando solicitudes recientes: {e}")
        
        # =====================================================
        # 3. COMUNICADOS
        # =====================================================
        comunicados = []
        try:
            comunicados_result = supabase.table('comunicado') \
                .select('*') \
                .eq('estado', 'activo') \
                .order('fecha_creacion', desc=True) \
                .limit(10) \
                .execute()
            
            for c in (comunicados_result.data or []):
                comunicados.append({
                    'id': c.get('id'),
                    'titulo': c.get('titulo'),
                    'contenido': c.get('contenido'),
                    'prioridad': c.get('prioridad', 'normal'),
                    'fecha_creacion': c.get('fecha_creacion')
                })
        except Exception as e:
            logger.warning(f"Error cargando comunicados: {e}")
        
        # =====================================================
        # 4. COMPRAS DEL MES (usando fecha_compra)
        # =====================================================
        total_compras_mes = 0
        try:
            hoy = datetime.datetime.now()
            primer_dia_mes = datetime.datetime(hoy.year, hoy.month, 1).isoformat()
            
            compras_mes = supabase.table('solicitud_compra') \
                .select('precio_cotizado') \
                .eq('id_encargado_repuestos', usuario_id) \
                .eq('estado', 'comprado') \
                .gte('fecha_compra', primer_dia_mes) \
                .execute()
            
            for c in (compras_mes.data or []):
                if c.get('precio_cotizado'):
                    total_compras_mes += float(c.get('precio_cotizado'))
        except Exception as e:
            logger.warning(f"Error calculando compras del mes: {e}")
        
        # =====================================================
        # 5. PROVEEDORES MÁS USADOS
        # =====================================================
        proveedores_lista = []
        try:
            proveedores_result = supabase.table('solicitud_compra') \
                .select('proveedor_nombre, proveedor_info') \
                .eq('id_encargado_repuestos', usuario_id) \
                .execute()
            
            proveedores_contados = {}
            for p in (proveedores_result.data or []):
                nombre = p.get('proveedor_nombre') or p.get('proveedor_info')
                if nombre and nombre != 'null' and nombre != '':
                    proveedores_contados[nombre] = proveedores_contados.get(nombre, 0) + 1
            
            proveedores_top = sorted(proveedores_contados.items(), key=lambda x: x[1], reverse=True)[:5]
            proveedores_lista = [{'nombre': k, 'veces': v} for k, v in proveedores_top]
        except Exception as e:
            logger.warning(f"Error cargando proveedores: {e}")
        
        # =====================================================
        # 6. CALENDARIO (PRÓXIMAS ENTREGAS)
        # =====================================================
        eventos_calendario = []
        try:
            fecha_limite = (datetime.datetime.now() + datetime.timedelta(days=7)).isoformat()
            
            entregas_proximas = supabase.table('solicitud_compra') \
                .select('id, orden_codigo, fecha_entrega, proveedor_nombre') \
                .eq('id_encargado_repuestos', usuario_id) \
                .eq('estado', 'entregado') \
                .gte('fecha_entrega', datetime.datetime.now().isoformat()) \
                .lte('fecha_entrega', fecha_limite) \
                .order('fecha_entrega', asc=True) \
                .limit(10) \
                .execute()
            
            for e in (entregas_proximas.data or []):
                if e.get('fecha_entrega'):
                    eventos_calendario.append({
                        'id': e.get('id'),
                        'titulo': f"Entrega - {e.get('orden_codigo', 'N/A')}",
                        'fecha': e.get('fecha_entrega'),
                        'proveedor': e.get('proveedor_nombre', 'N/A')
                    })
        except Exception as e:
            logger.warning(f"Error cargando calendario: {e}")
        
        # =====================================================
        # 7. NOTIFICACIONES RECIENTES
        # =====================================================
        notificaciones_lista = []
        try:
            notificaciones = supabase.table('notificacion') \
                .select('*') \
                .eq('id_usuario_destino', usuario_id) \
                .order('fecha_envio', desc=True) \
                .limit(10) \
                .execute()
            
            for n in (notificaciones.data or []):
                notificaciones_lista.append({
                    'id': n.get('id'),
                    'mensaje': n.get('mensaje'),
                    'tipo': n.get('tipo'),
                    'fecha_envio': n.get('fecha_envio'),
                    'leida': n.get('leida', False)
                })
        except Exception as e:
            logger.warning(f"Error cargando notificaciones: {e}")
        
        # =====================================================
        # 8. GRÁFICO DE COMPRAS POR MES
        # =====================================================
        meses = []
        compras_por_mes = []
        try:
            hoy = datetime.datetime.now()
            for i in range(5, -1, -1):
                mes = hoy.month - i
                anio = hoy.year
                if mes <= 0:
                    mes += 12
                    anio -= 1
                
                primer_dia = datetime.datetime(anio, mes, 1).isoformat()
                if mes == 12:
                    ultimo_dia = datetime.datetime(anio + 1, 1, 1).isoformat()
                else:
                    ultimo_dia = datetime.datetime(anio, mes + 1, 1).isoformat()
                
                compras = supabase.table('solicitud_compra') \
                    .select('precio_cotizado') \
                    .eq('id_encargado_repuestos', usuario_id) \
                    .eq('estado', 'comprado') \
                    .gte('fecha_compra', primer_dia) \
                    .lt('fecha_compra', ultimo_dia) \
                    .execute()
                
                total = 0
                for c in (compras.data or []):
                    if c.get('precio_cotizado'):
                        total += float(c.get('precio_cotizado'))
                
                compras_por_mes.append(total)
                meses.append(datetime.datetime(anio, mes, 1).strftime('%b %Y'))
        except Exception as e:
            logger.warning(f"Error generando gráfico: {e}")
        
        # =====================================================
        # 9. ÓRDENES ACTIVAS (con solicitudes pendientes)
        # =====================================================
        ordenes_activas_count = 0
        try:
            ordenes_activas = supabase.table('solicitud_compra') \
                .select('id_orden_trabajo', count='exact', distinct=True) \
                .eq('id_encargado_repuestos', usuario_id) \
                .in_('estado', ['pendiente', 'comprado']) \
                .execute()
            ordenes_activas_count = ordenes_activas.count if hasattr(ordenes_activas, 'count') else len(ordenes_activas.data or [])
        except Exception as e:
            logger.warning(f"Error contando órdenes activas: {e}")
        
        # =====================================================
        # RESPUESTA
        # =====================================================
        response_data = {
            'success': True,
            'data': {
                'stats': {
                    'pendientes': pendientes_count,
                    'comprados': comprados_count,
                    'entregados': entregados_count,
                    'total': total_count,
                    'compras_mes': total_compras_mes,
                    'ordenes_activas': ordenes_activas_count
                },
                'solicitudes_recientes': solicitudes_data,
                'comunicados': comunicados,
                'proveedores_top': proveedores_lista,
                'eventos_calendario': eventos_calendario,
                'grafico_mensual': {
                    'meses': meses,
                    'valores': compras_por_mes
                },
                'notificaciones': notificaciones_lista
            }
        }
        
        logger.info(f"✅ Dashboard cargado para usuario {usuario_id}")
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Error en dashboard: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'detail': traceback.format_exc()}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@dashboard_bp.route('/dashboard/test', methods=['GET'])
def test_dashboard():
    return jsonify({'success': True, 'message': 'Dashboard endpoint funcionando'}), 200