from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_operativo_historial_bp = Blueprint('jefe_operativo_historial', __name__, url_prefix='/api/jefe-operativo')

# Configuración
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
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            
            if current_user.get('rol') != 'jefe_operativo' and current_user.get('id_rol') != 2:
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
# ENDPOINTS DE HISTORIAL
# =====================================================

@jefe_operativo_historial_bp.route('/historial', methods=['GET'])
@jefe_operativo_required
def listar_historial(current_user):
    """Listar órdenes de trabajo finalizadas con filtros"""
    try:
        search = request.args.get('search', '')
        fecha_desde = request.args.get('fecha_desde', '')
        fecha_hasta = request.args.get('fecha_hasta', '')
        cliente = request.args.get('cliente', '')
        estado = request.args.get('estado', '')
        vehiculo = request.args.get('vehiculo', '')
        sort = request.args.get('sort', 'fecha_ingreso')
        order = request.args.get('order', 'desc')
        
        # Construir consulta base
        query = supabase.table('ordentrabajo') \
            .select('*, vehiculo!inner(placa, marca, modelo, cliente!inner(id_usuario, usuario!inner(nombre, contacto)))') \
            .execute()
        
        historial = []
        for orden in query.data or []:
            vehiculo_data = orden.get('vehiculo', {})
            cliente_data = vehiculo_data.get('cliente', {})
            usuario_data = cliente_data.get('usuario', {})
            
            # Obtener servicios de la orden desde cotizaciondetalle
            servicios = []
            try:
                cotizacion = supabase.table('cotizacion') \
                    .select('id') \
                    .eq('id_orden_trabajo', orden['id']) \
                    .execute()
                
                if cotizacion.data:
                    detalles = supabase.table('cotizaciondetalle') \
                        .select('servicio_descripcion, precio') \
                        .eq('id_cotizacion', cotizacion.data[0]['id']) \
                        .execute()
                    
                    for det in detalles.data or []:
                        servicios.append({
                            'descripcion': det.get('servicio_descripcion', 'Servicio'),
                            'precio': float(det.get('precio', 0))
                        })
            except Exception as e:
                logger.warning(f"Error obteniendo servicios para orden {orden['id']}: {e}")
            
            total = sum(s['precio'] for s in servicios)
            
            # Obtener fecha de salida (si existe)
            fecha_salida = orden.get('fecha_salida')
            if not fecha_salida and orden.get('estado_global') in ['Finalizado', 'Entregado']:
                fecha_salida = orden.get('fecha_ingreso')  # fallback
            
            # Construir objeto
            item = {
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_salida': fecha_salida,
                'estado_global': orden.get('estado_global', 'EnRecepcion'),
                'placa': vehiculo_data.get('placa', ''),
                'vehiculo_marca': vehiculo_data.get('marca', ''),
                'vehiculo_modelo': vehiculo_data.get('modelo', ''),
                'cliente_nombre': usuario_data.get('nombre', ''),
                'cliente_telefono': usuario_data.get('contacto', ''),
                'jefe_nombre': current_user.get('nombre', ''),
                'total': total,
                'servicios': servicios
            }
            
            # Aplicar filtros
            if search:
                search_lower = search.lower()
                if not (search_lower in (item['codigo_unico'] or '').lower() or
                        search_lower in (item['placa'] or '').lower() or
                        search_lower in (item['cliente_nombre'] or '').lower() or
                        search_lower in (item['vehiculo_marca'] or '').lower() or
                        search_lower in (item['vehiculo_modelo'] or '').lower()):
                    continue
            
            if cliente and item['cliente_nombre'] != cliente:
                continue
            
            if estado and item['estado_global'] != estado:
                continue
            
            if vehiculo:
                vehiculo_str = f"{item['vehiculo_marca']} {item['vehiculo_modelo']}".lower()
                if vehiculo.lower() not in vehiculo_str:
                    continue
            
            if fecha_desde:
                fecha_item = item['fecha_ingreso'][:10] if item['fecha_ingreso'] else ''
                if fecha_item < fecha_desde:
                    continue
            
            if fecha_hasta:
                fecha_item = item['fecha_ingreso'][:10] if item['fecha_ingreso'] else ''
                if fecha_item > fecha_hasta:
                    continue
            
            historial.append(item)
        
        # Ordenar
        reverse = (order == 'desc')
        if sort == 'fecha_ingreso':
            historial.sort(key=lambda x: x.get('fecha_ingreso', ''), reverse=reverse)
        elif sort == 'codigo_unico':
            historial.sort(key=lambda x: x.get('codigo_unico', ''), reverse=reverse)
        elif sort == 'total':
            historial.sort(key=lambda x: x.get('total', 0), reverse=reverse)
        
        return jsonify({'success': True, 'data': historial}), 200
        
    except Exception as e:
        logger.error(f"Error listando historial: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_historial_bp.route('/historial/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def obtener_detalle_historial(current_user, id_orden):
    """Obtener detalle completo de una orden finalizada"""
    try:
        orden_result = supabase.table('ordentrabajo') \
            .select('*, vehiculo!inner(placa, marca, modelo, cliente!inner(id_usuario, usuario!inner(nombre, contacto)))') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data
        vehiculo_data = orden.get('vehiculo', {})
        cliente_data = vehiculo_data.get('cliente', {})
        usuario_data = cliente_data.get('usuario', {})
        
        # Obtener recepción
        recepcion = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .single() \
            .execute()
        
        recepcion_data = recepcion.data if recepcion.data else {}
        
        # Obtener servicios de cotización
        servicios = []
        cotizacion = supabase.table('cotizacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .single() \
            .execute()
        
        if cotizacion.data:
            detalles = supabase.table('cotizaciondetalle') \
                .select('*') \
                .eq('id_cotizacion', cotizacion.data['id']) \
                .execute()
            
            for det in detalles.data or []:
                servicios.append({
                    'descripcion': det.get('servicio_descripcion', 'Servicio'),
                    'precio': float(det.get('precio', 0))
                })
        
        total = sum(s['precio'] for s in servicios)
        
        # Obtener fecha de salida
        fecha_salida = orden.get('fecha_salida')
        if not fecha_salida and orden.get('estado_global') in ['Finalizado', 'Entregado']:
            fecha_salida = orden.get('fecha_ingreso')
        
        detalle = {
            'id': orden['id'],
            'codigo_unico': orden['codigo_unico'],
            'fecha_ingreso': orden['fecha_ingreso'],
            'fecha_salida': fecha_salida,
            'estado_global': orden.get('estado_global', 'EnRecepcion'),
            'placa': vehiculo_data.get('placa', ''),
            'vehiculo_marca': vehiculo_data.get('marca', ''),
            'vehiculo_modelo': vehiculo_data.get('modelo', ''),
            'cliente_nombre': usuario_data.get('nombre', ''),
            'cliente_telefono': usuario_data.get('contacto', ''),
            'jefe_nombre': current_user.get('nombre', ''),
            'total': total,
            'servicios': servicios,
            'fotos': {
                'url_lateral_izquierda': recepcion_data.get('url_lateral_izquierda'),
                'url_lateral_derecha': recepcion_data.get('url_lateral_derecha'),
                'url_foto_frontal': recepcion_data.get('url_foto_frontal'),
                'url_foto_trasera': recepcion_data.get('url_foto_trasera'),
                'url_foto_superior': recepcion_data.get('url_foto_superior'),
                'url_foto_inferior': recepcion_data.get('url_foto_inferior'),
                'url_foto_tablero': recepcion_data.get('url_foto_tablero')
            },
            'descripcion_problema': recepcion_data.get('transcripcion_problema', ''),
            'audio_url': recepcion_data.get('url_grabacion_problema')
        }
        
        return jsonify({'success': True, 'data': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_historial_bp.route('/clientes', methods=['GET'])
@jefe_operativo_required
def listar_clientes(current_user):
    """Listar clientes para filtros"""
    try:
        resultado = supabase.table('usuario') \
            .select('id, nombre, contacto') \
            .eq('id_rol', 6) \
            .execute()
        
        clientes = []
        if resultado.data:
            for u in resultado.data:
                clientes.append({
                    'id': u['id'],
                    'nombre': u['nombre'],
                    'telefono': u['contacto']
                })
        
        return jsonify({'success': True, 'data': clientes}), 200
        
    except Exception as e:
        logger.error(f"Error listando clientes: {str(e)}")
        return jsonify({'error': str(e)}), 500