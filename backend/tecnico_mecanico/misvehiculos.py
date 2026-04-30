# =====================================================
# MIS VEHÍCULOS - TÉCNICO MECÁNICO
# FLUJO: EMPEZAR TRABAJO → DIAGNÓSTICO → APROBACIÓN → REPARACIÓN
# FURIA MOTOR COMPANY SRL
# VERSIÓN CORREGIDA - SIN DUPLICADOS
# =====================================================

from flask import Blueprint, request, jsonify, send_from_directory
from functools import wraps
from config import config
import jwt
import datetime
import logging
import os
import time

logger = logging.getLogger(__name__)

mis_vehiculos_bp = Blueprint('tecnico_misvehiculos', __name__)

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# FUNCIÓN AUXILIAR: NORMALIZAR NOMBRE DE ROL
# =====================================================
def normalizar_nombre_rol(nombre):
    """Normaliza el nombre del rol para que coincida con el frontend"""
    if not nombre:
        return None
    
    nombre_lower = nombre.lower()
    
    mapping = {
        'tecnico': 'tecnico',
        'tecnico_mecanico': 'tecnico',
        'jefe_taller': 'jefe_taller',
        'jefe_operativo': 'jefe_operativo',
        'encargado_repuestos': 'encargado_repuestos',
        'cliente': 'cliente',
        'admin': 'admin',
        'administrador': 'admin'
    }
    
    return mapping.get(nombre_lower, nombre_lower)


# =====================================================
# FUNCIÓN AUXILIAR: OBTENER ROLES DEL USUARIO
# =====================================================
def obtener_roles_usuario(usuario_id):
    """Obtiene los nombres de los roles de un usuario"""
    try:
        logger.info(f"🔍 Buscando roles para usuario ID: {usuario_id}")
        
        user_roles = supabase.table('usuario_rol') \
            .select('id_rol') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not user_roles.data:
            logger.warning(f"No se encontraron roles para usuario {usuario_id}")
            return []
        
        rol_ids = [ur['id_rol'] for ur in user_roles.data if ur.get('id_rol')]
        
        if not rol_ids:
            return []
        
        roles_data = supabase.table('rol') \
            .select('nombre_rol') \
            .in_('id', rol_ids) \
            .execute()
        
        roles = [r['nombre_rol'] for r in (roles_data.data or [])]
        logger.info(f"✅ Roles encontrados: {roles}")
        
        roles_normalizados = [normalizar_nombre_rol(r) for r in roles if normalizar_nombre_rol(r)]
        logger.info(f"📋 Roles normalizados: {roles_normalizados}")
        
        return roles_normalizados
        
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return []


# =====================================================
# FUNCIÓN AUXILIAR: VERIFICAR TOKEN Y OBTENER USUARIO
# =====================================================
def verificar_token_y_usuario():
    """Verifica el token y retorna el usuario si es válido"""
    token = None
    
    logger.info("🔍 === VERIFICANDO TOKEN ===")
    logger.info(f"Request path: {request.path}")
    
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            token = auth_header.split(" ")[1]
            logger.info(f"✅ Token extraído: {token[:50]}...")
        except IndexError:
            logger.error("❌ Error al extraer token")
            pass
    
    if not token:
        logger.error("❌ No se encontró token")
        return None, "No autorizado", 401
    
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        logger.info(f"✅ Token decodificado")
        
        if 'user' in data:
            current_user = data['user']
        else:
            current_user = data
        
        usuario_id = current_user.get('id')
        if not usuario_id:
            logger.error("❌ Usuario sin ID en token")
            return None, "Token inválido", 401
        
        logger.info(f"👤 Usuario: ID={usuario_id}, Nombre={current_user.get('nombre')}")
        logger.info(f"📋 Roles en token: {current_user.get('roles', [])}")
        
        roles = obtener_roles_usuario(usuario_id)
        
        if not roles:
            roles_token = current_user.get('roles', [])
            if roles_token:
                roles = [normalizar_nombre_rol(r) for r in roles_token if normalizar_nombre_rol(r)]
        
        current_user['roles'] = roles
        logger.info(f"✅ Usuario verificado - Roles finales: {roles}")
        logger.info("🔍 === FIN VERIFICACIÓN ===")
        
        return current_user, None, None
        
    except jwt.ExpiredSignatureError:
        logger.error("❌ Token expirado")
        return None, "Sesión expirada", 401
    except jwt.InvalidTokenError as e:
        logger.error(f"❌ Token inválido: {str(e)}")
        return None, "Token inválido", 401
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}")
        return None, "Error de autenticación", 401


# =====================================================
# DECORADOR: VERIFICAR ROL TÉCNICO
# =====================================================
def tecnico_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user, error, status = verificar_token_y_usuario()
        
        if error:
            return jsonify({'error': error}), status
        
        user_roles = current_user.get('roles', [])
        tiene_rol_tecnico = 'tecnico' in user_roles
        
        logger.info(f"🔐 Verificando rol técnico - Roles: {user_roles} - Tiene técnico: {tiene_rol_tecnico}")
        
        if not tiene_rol_tecnico:
            logger.warning(f"❌ Acceso denegado")
            return jsonify({'error': 'No autorizado - Se requiere rol de Técnico'}), 403
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# RUTAS PARA SERVIR ARCHIVOS ESTÁTICOS
# =====================================================
@mis_vehiculos_bp.route('/mis-vehiculos')
def mis_vehiculos_page():
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico'), 'misvehiculos.html')


@mis_vehiculos_bp.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'css'), filename)


@mis_vehiculos_bp.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'js'), filename)


@mis_vehiculos_bp.route('/components/<path:filename>')
def serve_components(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'components'), filename)


# =====================================================
# API: VERIFICAR TOKEN
# =====================================================
@mis_vehiculos_bp.route('/verify-token', methods=['GET'])
def verify_token():
    logger.info("🔍 [TECNICO] Verificando token...")
    current_user, error, status = verificar_token_y_usuario()
    
    if error:
        return jsonify({'valid': False, 'error': error}), status
    
    return jsonify({
        'valid': True,
        'user': {
            'id': current_user.get('id'),
            'nombre': current_user.get('nombre'),
            'email': current_user.get('email'),
            'roles': current_user.get('roles', [])
        }
    }), 200


# =====================================================
# API: TEST TOKEN
# =====================================================
@mis_vehiculos_bp.route('/test-token', methods=['GET'])
def test_token():
    token = None
    
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            token = auth_header.split(" ")[1]
        except IndexError:
            pass
    
    if not token:
        return jsonify({'error': 'No token'}), 401
    
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return jsonify({
            'token_decoded': data,
            'user': data.get('user', data),
            'roles': data.get('user', data).get('roles', [])
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER VEHÍCULOS ASIGNADOS (CON LOGS)
# =====================================================
@mis_vehiculos_bp.route('/get-mis-vehiculos', methods=['GET'])
@tecnico_required
def obtener_mis_vehiculos(current_user):
    logger.info("🚨🚨🚨 ESTA FUNCIÓN SE ESTÁ EJECUTANDO 🚨🚨🚨")
    logger.info("=" * 60)
    logger.info(f"🔧 INICIO - Técnico {current_user['id']}")
    try:
        tecnico_id = current_user['id']
        logger.info("=" * 60)
        logger.info(f"🔧 INICIO - Técnico {tecnico_id}")
        logger.info("=" * 60)
        
        # 1. Asignaciones de DIAGNÓSTICO
        logger.info(f"📋 PASO 1: Consultando asignaciones DIAGNÓSTICO...")
        asignaciones_diagnostico = supabase.table('asignaciontecnico') \
            .select('*') \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        logger.info(f"📊 DIAGNÓSTICO - Cantidad: {len(asignaciones_diagnostico.data) if asignaciones_diagnostico.data else 0}")
        if asignaciones_diagnostico.data:
            for a in asignaciones_diagnostico.data:
                logger.info(f"   - Orden ID: {a.get('id_orden_trabajo')}, Tipo: {a.get('tipo_asignacion')}")
        
        # 2. Asignaciones de REPARACIÓN
        logger.info(f"📋 PASO 2: Consultando asignaciones REPARACIÓN...")
        asignaciones_reparacion = supabase.table('asignaciontecnico') \
            .select('*') \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        logger.info(f"📊 REPARACIÓN - Cantidad: {len(asignaciones_reparacion.data) if asignaciones_reparacion.data else 0}")
        if asignaciones_reparacion.data:
            for a in asignaciones_reparacion.data:
                logger.info(f"   - Orden ID: {a.get('id_orden_trabajo')}, Tipo: {a.get('tipo_asignacion')}")
        
        todas_asignaciones = []
        if asignaciones_diagnostico.data:
            todas_asignaciones.extend(asignaciones_diagnostico.data)
        if asignaciones_reparacion.data:
            todas_asignaciones.extend(asignaciones_reparacion.data)
        
        logger.info(f"📊 TOTAL asignaciones: {len(todas_asignaciones)}")
        
        if not todas_asignaciones:
            logger.warning(f"⚠️ Técnico {tecnico_id} no tiene asignaciones activas")
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in todas_asignaciones]
        logger.info(f"📋 PASO 3: IDs de órdenes encontrados: {orden_ids}")
        
        # 3. Órdenes
        logger.info(f"📋 PASO 4: Consultando órdenes con IDs: {orden_ids}")
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .in_('id', orden_ids) \
            .execute()
        
        logger.info(f"📊 Órdenes encontradas: {len(ordenes.data) if ordenes.data else 0}")
        
        if not ordenes.data:
            logger.warning(f"⚠️ No se encontraron órdenes")
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        for o in ordenes.data:
            logger.info(f"   - Orden ID: {o.get('id')}, Código: {o.get('codigo_unico')}, Vehículo ID: {o.get('id_vehiculo')}")
        
        # 4. Vehículos
        vehiculos_ids = [o['id_vehiculo'] for o in ordenes.data if o.get('id_vehiculo')]
        logger.info(f"📋 PASO 5: IDs de vehículos: {vehiculos_ids}")
        
        if not vehiculos_ids:
            logger.warning(f"⚠️ No hay IDs de vehículos válidos")
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .in_('id', vehiculos_ids) \
            .execute()
        
        logger.info(f"📊 Vehículos encontrados: {len(vehiculos.data) if vehiculos.data else 0}")
        
        if vehiculos.data:
            for v in vehiculos.data:
                logger.info(f"   - Vehículo ID: {v.get('id')}, Placa: {v.get('placa')}, Marca: {v.get('marca')}")
        
        vehiculos_map = {v['id']: v for v in (vehiculos.data or [])}
        
        # 5. Clientes
        clientes_ids = list(set([v.get('id_cliente') for v in vehiculos_map.values() if v.get('id_cliente')]))
        logger.info(f"📋 PASO 6: IDs de clientes: {clientes_ids}")
        
        clientes_map = {}
        usuarios_ids = []
        
        if clientes_ids:
            clientes = supabase.table('cliente') \
                .select('id, id_usuario, email') \
                .in_('id', clientes_ids) \
                .execute()
            
            logger.info(f"📊 Clientes encontrados: {len(clientes.data) if clientes.data else 0}")
            
            for c in (clientes.data or []):
                clientes_map[c['id']] = c
                if c.get('id_usuario'):
                    usuarios_ids.append(c['id_usuario'])
        
        logger.info(f"📋 IDs de usuarios (clientes): {usuarios_ids}")
        
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .in_('id', usuarios_ids) \
                .execute()
            
            logger.info(f"📊 Usuarios encontrados: {len(usuarios.data) if usuarios.data else 0}")
            
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # 6. Construir respuesta
        logger.info(f"📋 PASO 7: Construyendo respuesta...")
        vehiculos_resultado = []
        
        for orden in ordenes.data:
            vehiculo = vehiculos_map.get(orden['id_vehiculo'], {})
            logger.info(f"   - Procesando orden {orden['id']}: Vehículo encontrado: {bool(vehiculo)}")
            
            cliente_info = clientes_map.get(vehiculo.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
            
            vehiculos_resultado.append({
                'orden_id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'tipo_asignacion': 'diagnostico',
                'diagnostico_enviado': False,
                'diagnostico_aprobado': False,
                'diagnostico_rechazado': False,
                'diagnostico_estado': None,
                'diagnostico_version': 1,
                'trabajo_iniciado': False,
                'bahia_asignada': None,
                'vehiculo': {
                    'placa': vehiculo.get('placa', ''),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'anio': vehiculo.get('anio'),
                    'kilometraje': vehiculo.get('kilometraje', 0)
                },
                'cliente': {
                    'nombre': usuario_cliente.get('nombre', 'No registrado'),
                    'contacto': usuario_cliente.get('contacto', 'No registrado'),
                    'email': usuario_cliente.get('email', '')
                }
            })
        
        logger.info(f"✅ RESULTADO FINAL: {len(vehiculos_resultado)} vehículos")
        logger.info("=" * 60)
        
        return jsonify({'success': True, 'vehiculos': vehiculos_resultado}), 200
        
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500

# =====================================================
# API: COMUNICADOS
# =====================================================
@mis_vehiculos_bp.route('/comunicados', methods=['GET'])
@tecnico_required
def obtener_comunicados_tecnico(current_user):
    try:
        logger.info(f"📢 Técnico {current_user['id']} consultando comunicados")
        
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('estado', 'activo') \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        comunicados = []
        if resultado.data:
            for c in resultado.data:
                destinatarios = c.get('destinatarios', [])
                if isinstance(destinatarios, list) and 'tecnico' in destinatarios:
                    comunicados.append({
                        'id': c['id'],
                        'titulo': c['titulo'],
                        'contenido': c['contenido'],
                        'prioridad': c.get('prioridad', 'normal'),
                        'estado': c.get('estado', 'activo'),
                        'destinatarios': destinatarios,
                        'fecha_creacion': c['fecha_creacion']
                    })
        
        logger.info(f"✅ {len(comunicados)} comunicados encontrados")
        return jsonify({'success': True, 'data': comunicados}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500