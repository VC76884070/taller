# =====================================================
# DASHBOARD JEFE OPERATIVO - VERSIÓN COMPLETA Y CORREGIDA
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from functools import wraps
import datetime
import json
import jwt
import logging

logger = logging.getLogger(__name__)

dashboard_op_bp = Blueprint('dashboard_operativo', __name__, url_prefix='/api/jefe-operativo')
supabase = config.supabase
SECRET_KEY = config.SECRET_KEY


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
# FUNCIONES AUXILIARES
# =====================================================

def parse_destinatarios(destinatarios_raw):
    """Convierte destinatarios a lista, sea string JSON o lista"""
    if not destinatarios_raw:
        return []
    if isinstance(destinatarios_raw, list):
        return destinatarios_raw
    if isinstance(destinatarios_raw, str):
        try:
            return json.loads(destinatarios_raw)
        except:
            return []
    return []


def obtener_vehiculo_por_id(id_vehiculo):
    """Obtiene un vehículo por su ID"""
    if not id_vehiculo:
        return {'placa': 'SIN PLACA', 'marca': '', 'modelo': ''}
    
    try:
        response = supabase.table('vehiculo') \
            .select('placa, marca, modelo, id_cliente') \
            .eq('id', id_vehiculo) \
            .execute()
        
        if response.data:
            return response.data[0]
        return {'placa': 'SIN PLACA', 'marca': '', 'modelo': ''}
    except Exception as e:
        logger.error(f"Error obteniendo vehículo: {e}")
        return {'placa': 'SIN PLACA', 'marca': '', 'modelo': ''}


def obtener_nombre_usuario(user_id):
    """Obtiene el nombre de un usuario por su ID"""
    if not user_id:
        return 'Sistema'
    
    try:
        response = supabase.table('usuario') \
            .select('nombre') \
            .eq('id', user_id) \
            .execute()
        
        if response.data:
            return response.data[0].get('nombre', 'Usuario')
        return 'Usuario'
    except Exception as e:
        logger.error(f"Error obteniendo nombre usuario: {e}")
        return 'Usuario'


# =====================================================
# ENDPOINT 1: COMUNICADOS (CORREGIDO)
# =====================================================

@dashboard_op_bp.route('/mis-comunicados', methods=['GET'])
@jefe_operativo_required
def mis_comunicados(current_user):
    """Obtener comunicados dirigidos al rol jefe_operativo"""
    print("📡 /mis-comunicados llamado")
    
    try:
        # Obtener todos los comunicados activos
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('estado', 'activo') \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        comunicados = []
        
        if resultado.data:
            for c in resultado.data:
                # Parsear destinatarios (puede ser string JSON o lista)
                destinatarios = parse_destinatarios(c.get('destinatarios', []))
                
                print(f"   📬 Comunicado ID {c.get('id')}: {c.get('titulo')}")
                print(f"      Destinatarios: {destinatarios}")
                
                # Verificar si 'jefe_operativo' está en destinatarios
                if 'jefe_operativo' in destinatarios:
                    # Obtener nombre del creador
                    creado_por = c.get('creado_por')
                    nombre_creador = obtener_nombre_usuario(creado_por) if creado_por else 'Sistema'
                    
                    comunicados.append({
                        'id': c.get('id'),
                        'titulo': c.get('titulo'),
                        'contenido': c.get('contenido'),
                        'prioridad': c.get('prioridad', 'normal'),
                        'fecha_creacion': c.get('fecha_creacion'),
                        'creado_por': creado_por,
                        'creador_nombre': nombre_creador
                    })
                    print(f"      ✅ AGREGADO para jefe_operativo")
        
        print(f"✅ {len(comunicados)} comunicados encontrados para jefe_operativo")
        return jsonify({'success': True, 'comunicados': comunicados}), 200
        
    except Exception as e:
        print(f"❌ Error obteniendo comunicados: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'comunicados': []}), 200


# =====================================================
# ENDPOINT 2: ÓRDENES ACTIVAS (PARA CALENDARIO)
# =====================================================

@dashboard_op_bp.route('/mis-ordenes-activas', methods=['GET'])
@jefe_operativo_required
def mis_ordenes_activas(current_user):
    """Obtener órdenes activas para el calendario"""
    print("📡 /mis-ordenes-activas llamado")
    
    try:
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_estimada_finalizacion, dias_estimados_reparacion, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        resultado = []
        for orden in (ordenes.data or []):
            vehiculo = {'placa': 'SIN PLACA', 'marca': '', 'modelo': ''}
            if orden.get('id_vehiculo'):
                try:
                    v_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo') \
                        .eq('id', orden['id_vehiculo']) \
                        .execute()
                    if v_result.data:
                        v = v_result.data[0]
                        vehiculo = {
                            'placa': v.get('placa', 'SIN PLACA'),
                            'marca': v.get('marca', ''),
                            'modelo': v.get('modelo', '')
                        }
                except:
                    pass
            
            resultado.append({
                'id_orden': orden.get('id'),
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'fecha_ingreso': orden.get('fecha_ingreso'),
                'fecha_estimada_finalizacion': orden.get('fecha_estimada_finalizacion'),
                'dias_estimados_reparacion': orden.get('dias_estimados_reparacion'),
                'vehiculo': vehiculo
            })
        
        print(f"✅ {len(resultado)} órdenes activas")
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        print(f"❌ Error en órdenes activas: {e}")
        return jsonify({'success': True, 'ordenes': []}), 200


# =====================================================
# ENDPOINT 3: ESTADÍSTICAS (KPIs)
# =====================================================

@dashboard_op_bp.route('/mis-stats', methods=['GET'])
@jefe_operativo_required
def mis_stats(current_user):
    """Obtener estadísticas para KPIs"""
    print("📡 /mis-stats llamado")
    
    try:
        hoy = datetime.datetime.now().date()
        manana = hoy + datetime.timedelta(days=1)
        
        # Ingresos hoy
        ingresos_hoy = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .gte('fecha_ingreso', hoy.isoformat()) \
            .lt('fecha_ingreso', manana.isoformat()) \
            .execute()
        
        # Órdenes activas
        ordenes_activas = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        # Órdenes en pausa
        ordenes_pausa = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .eq('estado_global', 'EnPausa') \
            .execute()
        
        return jsonify({
            'success': True,
            'stats': {
                'ingresados_hoy': ingresos_hoy.count or 0,
                'en_proceso': ordenes_activas.count or 0,
                'en_pausa': ordenes_pausa.count or 0
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Error en stats: {e}")
        return jsonify({'success': True, 'stats': {
            'ingresados_hoy': 0, 'en_proceso': 0, 'en_pausa': 0
        }}), 200


# =====================================================
# ENDPOINT 4: PRÓXIMAS ENTREGAS
# =====================================================

@dashboard_op_bp.route('/mis-proximas-entregas', methods=['GET'])
@jefe_operativo_required
def mis_proximas_entregas(current_user):
    """Obtener próximas entregas"""
    print("📡 /mis-proximas-entregas llamado")
    
    try:
        # 🔧 CORRECCIÓN: Eliminar nulls_last que causa el error
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_estimada_finalizacion, dias_estimados_reparacion, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_estimada_finalizacion', desc=False) \
            .limit(15) \
            .execute()
        
        resultado = []
        hoy = datetime.datetime.now()
        
        for orden in (ordenes.data or []):
            vehiculo = obtener_vehiculo_por_id(orden.get('id_vehiculo'))
            
            placa = vehiculo.get('placa', 'SIN PLACA')
            marca = vehiculo.get('marca', '')
            modelo = vehiculo.get('modelo', '')
            
            # Formatear vehículo
            if marca and modelo:
                vehiculo_str = f"{marca} {modelo}"
                if placa and placa != 'SIN PLACA':
                    vehiculo_str = f"{vehiculo_str} ({placa})"
            elif marca:
                vehiculo_str = marca
                if placa and placa != 'SIN PLACA':
                    vehiculo_str = f"{vehiculo_str} ({placa})"
            elif placa and placa != 'SIN PLACA':
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
                    
                    dias_restantes = (fecha_fin - hoy).days
                    
                    if dias_restantes < 0:
                        prioridad = 'urgente'
                    elif dias_restantes == 0:
                        prioridad = 'hoy'
                    elif dias_restantes <= 3:
                        prioridad = 'pronto'
                except Exception as e:
                    logger.warning(f"Error calculando días: {e}")
            
            resultado.append({
                'id_orden': orden.get('id'),
                'codigo': orden.get('codigo_unico'),
                'placa': placa,
                'vehiculo': vehiculo_str,
                'dias_restantes': dias_restantes,
                'dias_estimados': orden.get('dias_estimados_reparacion'),
                'prioridad': prioridad
            })
        
        # 🔧 CORRECCIÓN: Ordenar en Python en lugar de usar nulls_last
        # Las órdenes sin fecha van al final
        resultado.sort(key=lambda x: (x['dias_restantes'] is None, x['dias_restantes'] if x['dias_restantes'] is not None else 999))
        
        print(f"✅ {len(resultado)} próximas entregas")
        return jsonify({'success': True, 'entregas': resultado}), 200
        
    except Exception as e:
        print(f"❌ Error en próximas entregas: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'entregas': []}), 200


# =====================================================
# ENDPOINT 5: VEHÍCULOS EN TALLER
# =====================================================

@dashboard_op_bp.route('/mis-vehiculos-taller', methods=['GET'])
@jefe_operativo_required
def mis_vehiculos_taller(current_user):
    """Obtener vehículos actualmente en taller"""
    print("📡 /mis-vehiculos-taller llamado")
    
    try:
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_estimada_finalizacion, dias_estimados_reparacion, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .order('fecha_ingreso', desc=True) \
            .limit(15) \
            .execute()
        
        resultado = []
        hoy = datetime.datetime.now()
        
        for orden in (ordenes.data or []):
            vehiculo = obtener_vehiculo_por_id(orden.get('id_vehiculo'))
            
            placa = vehiculo.get('placa', 'SIN PLACA')
            marca = vehiculo.get('marca', '')
            modelo = vehiculo.get('modelo', '')
            
            # Formatear vehículo
            if marca and modelo:
                vehiculo_str = f"{marca} {modelo}"
                if placa and placa != 'SIN PLACA':
                    vehiculo_str = f"{vehiculo_str} ({placa})"
            elif marca:
                vehiculo_str = marca
                if placa and placa != 'SIN PLACA':
                    vehiculo_str = f"{vehiculo_str} ({placa})"
            elif placa and placa != 'SIN PLACA':
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
                    dias_restantes = (fecha_fin - hoy).days
                except:
                    pass
            
            resultado.append({
                'id_orden': orden.get('id'),
                'codigo': orden.get('codigo_unico'),
                'placa': placa,
                'vehiculo': vehiculo_str,
                'estado': orden.get('estado_global'),
                'dias_restantes': dias_restantes
            })
        
        print(f"✅ {len(resultado)} vehículos en taller")
        return jsonify({'success': True, 'vehiculos': resultado}), 200
        
    except Exception as e:
        print(f"❌ Error en vehículos taller: {e}")
        return jsonify({'success': True, 'vehiculos': []}), 200


# =====================================================
# ENDPOINT 6: ÚLTIMOS INGRESOS
# =====================================================

@dashboard_op_bp.route('/mis-ultimos-ingresos', methods=['GET'])
@jefe_operativo_required
def mis_ultimos_ingresos(current_user):
    """Obtener últimos vehículos ingresados"""
    print("📡 /mis-ultimos-ingresos llamado")
    
    try:
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, id_vehiculo') \
            .order('fecha_ingreso', desc=True) \
            .limit(10) \
            .execute()
        
        resultado = []
        for orden in (ordenes.data or []):
            vehiculo = obtener_vehiculo_por_id(orden.get('id_vehiculo'))
            
            placa = vehiculo.get('placa', '---')
            marca = vehiculo.get('marca', '')
            modelo = vehiculo.get('modelo', '')
            
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
            
            resultado.append({
                'id': orden.get('id'),
                'hora': hora,
                'placa': placa,
                'vehiculo': vehiculo_str,
                'estado': orden.get('estado_global')
            })
        
        print(f"✅ {len(resultado)} últimos ingresos")
        return jsonify({'success': True, 'ingresos': resultado}), 200
        
    except Exception as e:
        print(f"❌ Error en últimos ingresos: {e}")
        return jsonify({'success': True, 'ingresos': []}), 200


# =====================================================
# ENDPOINT 7: DASHBOARD COMPLETO (UNIFICADO)
# =====================================================

@dashboard_op_bp.route('/dashboard-completo', methods=['GET'])
@jefe_operativo_required
def dashboard_completo(current_user):
    """Obtener todos los datos del dashboard en una sola llamada"""
    print("📡 /dashboard-completo llamado")
    
    try:
        # ========== 1. ESTADÍSTICAS ==========
        hoy = datetime.datetime.now().date()
        manana = hoy + datetime.timedelta(days=1)
        
        ingresos_hoy = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .gte('fecha_ingreso', hoy.isoformat()) \
            .lt('fecha_ingreso', manana.isoformat()) \
            .execute()
        
        ordenes_activas = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        ordenes_pausa = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .eq('estado_global', 'EnPausa') \
            .execute()
        
        # ========== 2. COMUNICADOS ==========
        comunicados_result = supabase.table('comunicado') \
            .select('*') \
            .eq('estado', 'activo') \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        comunicados = []
        if comunicados_result.data:
            for c in comunicados_result.data:
                destinatarios = parse_destinatarios(c.get('destinatarios', []))
                if 'jefe_operativo' in destinatarios:
                    nombre_creador = obtener_nombre_usuario(c.get('creado_por')) if c.get('creado_por') else 'Sistema'
                    comunicados.append({
                        'id': c.get('id'),
                        'titulo': c.get('titulo'),
                        'contenido': c.get('contenido'),
                        'prioridad': c.get('prioridad', 'normal'),
                        'fecha_creacion': c.get('fecha_creacion'),
                        'creador_nombre': nombre_creador
                    })
        
        # ========== 3. PRÓXIMAS ENTREGAS ==========
        ordenes_entrega = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_estimada_finalizacion, dias_estimados_reparacion, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        proximas_entregas = []
        hoy_dt = datetime.datetime.now()
        
        for orden in (ordenes_entrega.data or []):
            vehiculo = obtener_vehiculo_por_id(orden.get('id_vehiculo'))
            
            placa = vehiculo.get('placa', 'SIN PLACA')
            marca = vehiculo.get('marca', '')
            modelo = vehiculo.get('modelo', '')
            
            if marca and modelo:
                vehiculo_str = f"{marca} {modelo}"
            elif marca:
                vehiculo_str = marca
            else:
                vehiculo_str = 'Vehículo'
            
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
                except:
                    pass
            
            proximas_entregas.append({
                'id_orden': orden.get('id'),
                'codigo': orden.get('codigo_unico'),
                'placa': placa,
                'vehiculo': vehiculo_str,
                'dias_restantes': dias_restantes,
                'prioridad': prioridad
            })
        
        proximas_entregas.sort(key=lambda x: x['dias_restantes'] if x['dias_restantes'] is not None else 999)
        proximas_entregas = proximas_entregas[:15]
        
        # ========== 4. VEHÍCULOS EN TALLER ==========
        vehiculos_taller = []
        for orden in (ordenes_entrega.data or [])[:15]:
            vehiculo = obtener_vehiculo_por_id(orden.get('id_vehiculo'))
            marca = vehiculo.get('marca', '')
            modelo = vehiculo.get('modelo', '')
            
            if marca and modelo:
                vehiculo_str = f"{marca} {modelo}"
            elif marca:
                vehiculo_str = marca
            else:
                vehiculo_str = 'Vehículo'
            
            vehiculos_taller.append({
                'id_orden': orden.get('id'),
                'codigo': orden.get('codigo_unico'),
                'placa': vehiculo.get('placa', 'SIN PLACA'),
                'vehiculo': vehiculo_str,
                'estado': orden.get('estado_global')
            })
        
        # ========== 5. RESPUESTA ==========
        return jsonify({
            'success': True,
            'data': {
                'kpis': {
                    'ingresados_hoy': ingresos_hoy.count or 0,
                    'en_proceso': ordenes_activas.count or 0,
                    'en_pausa': ordenes_pausa.count or 0
                },
                'proximas_entregas': proximas_entregas,
                'vehiculos_taller': vehiculos_taller,
                'comunicados': comunicados,
                'total_comunicados': len(comunicados)
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Error en dashboard completo: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500