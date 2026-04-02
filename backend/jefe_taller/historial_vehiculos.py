# =====================================================
# HISTORIAL DE VEHÍCULOS - JEFE TALLER
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
historial_vehiculos_bp = Blueprint('historial_vehiculos', __name__, url_prefix='/api/jefe-taller')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL
# =====================================================
def jefe_taller_required(f):
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
            
            if current_user.get('rol') != 'jefe_taller' and current_user.get('id_rol') != 3:
                logger.warning(f"Usuario {current_user.get('nombre')} intentó acceder sin permisos")
                return jsonify({'error': 'No autorizado para esta operación'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

# =====================================================
# ENDPOINTS - HISTORIAL DE VEHÍCULOS
# =====================================================

@historial_vehiculos_bp.route('/historial-vehiculo', methods=['GET'])
@jefe_taller_required
def obtener_historial_vehiculo(current_user):
    """Obtener historial completo de un vehículo por placa"""
    try:
        placa = request.args.get('placa', '').upper().strip()
        fecha_desde = request.args.get('fecha_desde')
        fecha_hasta = request.args.get('fecha_hasta')
        estado = request.args.get('estado')
        
        logger.info(f"🔍 Buscando historial para placa: {placa}")
        
        if not placa:
            return jsonify({'error': 'Placa requerida'}), 400
        
        # =====================================================
        # 1. BUSCAR VEHÍCULO
        # =====================================================
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .ilike('placa', f'%{placa}%') \
            .execute()
        
        logger.info(f"📝 Resultado vehículo: {len(vehiculo_result.data) if vehiculo_result.data else 0} encontrados")
        
        if not vehiculo_result.data:
            return jsonify({
                'success': True, 
                'vehiculo': None, 
                'ordenes': [], 
                'resumen': {}
            }), 200
        
        vehiculo = vehiculo_result.data[0]
        logger.info(f"🚗 Vehículo encontrado: ID={vehiculo['id']}, Placa={vehiculo['placa']}")
        
        # =====================================================
        # 2. OBTENER CLIENTE (simplificado)
        # =====================================================
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        
        if vehiculo.get('id_cliente'):
            try:
                cliente = supabase.table('cliente') \
                    .select('id_usuario') \
                    .eq('id', vehiculo['id_cliente']) \
                    .execute()
                
                if cliente.data and cliente.data[0].get('id_usuario'):
                    usuario = supabase.table('usuario') \
                        .select('nombre, contacto') \
                        .eq('id', cliente.data[0]['id_usuario']) \
                        .execute()
                    if usuario.data:
                        cliente_nombre = usuario.data[0].get('nombre', 'No registrado')
                        cliente_telefono = usuario.data[0].get('contacto', 'No registrado')
            except Exception as e:
                logger.warning(f"Error obteniendo cliente: {str(e)}")
        
        # =====================================================
        # 3. OBTENER ÓRDENES DEL VEHÍCULO
        # =====================================================
        query = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_jefe_operativo') \
            .eq('id_vehiculo', vehiculo['id']) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        logger.info(f"📋 Órdenes encontradas: {len(query.data) if query.data else 0}")
        
        ordenes = []
        
        for orden in (query.data or []):
            # Obtener jefe operativo (simplificado)
            jefe_nombre = None
            if orden.get('id_jefe_operativo'):
                try:
                    jefe = supabase.table('usuario') \
                        .select('nombre') \
                        .eq('id', orden['id_jefe_operativo']) \
                        .execute()
                    if jefe.data:
                        jefe_nombre = jefe.data[0]['nombre']
                except Exception as e:
                    logger.warning(f"Error obteniendo jefe: {str(e)}")
            
            # Obtener diagnóstico inicial
            diagnostico_texto = None
            try:
                diagnostico = supabase.table('diagnostigoinicial') \
                    .select('diagnostigo') \
                    .eq('id_orden_trabajo', orden['id']) \
                    .execute()
                if diagnostico.data:
                    diagnostico_texto = diagnostico.data[0].get('diagnostigo')
            except Exception as e:
                logger.warning(f"Error obteniendo diagnóstico: {str(e)}")
            
            # Obtener técnicos
            tecnicos = []
            try:
                asignaciones = supabase.table('asignaciontecnico') \
                    .select('id_tecnico') \
                    .eq('id_orden_trabajo', orden['id']) \
                    .execute()
                
                for asig in (asignaciones.data or []):
                    tecnico = supabase.table('usuario') \
                        .select('nombre') \
                        .eq('id', asig['id_tecnico']) \
                        .execute()
                    if tecnico.data:
                        tecnicos.append({'nombre': tecnico.data[0]['nombre']})
            except Exception as e:
                logger.warning(f"Error obteniendo técnicos: {str(e)}")
            
            ordenes.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_salida': orden.get('fecha_salida'),
                'jefe_operativo_nombre': jefe_nombre,
                'tecnicos': tecnicos,
                'diagnostico_inicial': diagnostico_texto,
                'tiene_fotos': True
            })
        
        # =====================================================
        # 4. APLICAR FILTROS
        # =====================================================
        ordenes_filtradas = ordenes.copy()
        
        if fecha_desde:
            try:
                fecha_desde_dt = datetime.datetime.fromisoformat(fecha_desde).date()
                ordenes_filtradas = [o for o in ordenes_filtradas if datetime.datetime.fromisoformat(o['fecha_ingreso']).date() >= fecha_desde_dt]
            except Exception as e:
                logger.warning(f"Error filtrando fecha_desde: {str(e)}")
        
        if fecha_hasta:
            try:
                fecha_hasta_dt = datetime.datetime.fromisoformat(fecha_hasta).date()
                ordenes_filtradas = [o for o in ordenes_filtradas if datetime.datetime.fromisoformat(o['fecha_ingreso']).date() <= fecha_hasta_dt]
            except Exception as e:
                logger.warning(f"Error filtrando fecha_hasta: {str(e)}")
        
        if estado:
            ordenes_filtradas = [o for o in ordenes_filtradas if o['estado_global'] == estado]
        
        # =====================================================
        # 5. CALCULAR RESUMEN
        # =====================================================
        resumen = {
            'total': len(ordenes_filtradas),
            'entregados': len([o for o in ordenes_filtradas if o['estado_global'] in ['Entregado', 'Finalizado']]),
            'en_proceso': len([o for o in ordenes_filtradas if o['estado_global'] == 'EnProceso']),
            'en_pausa': len([o for o in ordenes_filtradas if o['estado_global'] == 'EnPausa']),
            'en_recepcion': len([o for o in ordenes_filtradas if o['estado_global'] == 'EnRecepcion'])
        }
        
        logger.info(f"✅ Historial generado: {resumen['total']} órdenes")
        
        return jsonify({
            'success': True,
            'vehiculo': {
                'id': vehiculo['id'],
                'placa': vehiculo['placa'],
                'marca': vehiculo.get('marca', ''),
                'modelo': vehiculo.get('modelo', ''),
                'anio': vehiculo.get('anio'),
                'kilometraje': vehiculo.get('kilometraje'),
                'cliente_nombre': cliente_nombre,
                'cliente_telefono': cliente_telefono
            },
            'ordenes': ordenes_filtradas,
            'resumen': resumen
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en historial de vehículo: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@historial_vehiculos_bp.route('/orden-fotos/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_fotos_orden(current_user, id_orden):
    """Obtener todas las fotos de una orden de trabajo"""
    try:
        logger.info(f"📸 Obteniendo fotos para orden {id_orden}")
        
        recepcion = supabase.table('recepcion') \
            .select('''
                url_lateral_izquierda,
                url_lateral_derecha,
                url_foto_frontal,
                url_foto_trasera,
                url_foto_superior,
                url_foto_inferior,
                url_foto_tablero
            ''') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        fotos = []
        if recepcion.data:
            r = recepcion.data[0]
            campos = {
                'url_lateral_izquierda': 'Lateral Izquierdo',
                'url_lateral_derecha': 'Lateral Derecho',
                'url_foto_frontal': 'Frontal',
                'url_foto_trasera': 'Trasera',
                'url_foto_superior': 'Superior',
                'url_foto_inferior': 'Inferior',
                'url_foto_tablero': 'Tablero'
            }
            
            for campo, nombre in campos.items():
                if r.get(campo):
                    fotos.append({
                        'tipo': campo,
                        'nombre': nombre,
                        'url': r[campo]
                    })
        
        logger.info(f"✅ {len(fotos)} fotos encontradas para orden {id_orden}")
        
        return jsonify({'success': True, 'fotos': fotos}), 200
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo fotos de orden: {str(e)}")
        return jsonify({'error': str(e)}), 500