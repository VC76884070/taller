from config import config
from werkzeug.security import generate_password_hash
import datetime

supabase = config.supabase

def insert_test_data():
    """Insertar datos de prueba en Supabase"""
    
    print("🚀 Insertando datos de prueba en FURIA MOTOR...")
    
    # =====================================================
    # 1. Insertar Roles
    # =====================================================
    print("\n📌 Insertando roles...")
    roles = [
        {'nombre_rol': 'admin_general', 'descripcion': 'Administrador General'},
        {'nombre_rol': 'jefe_operativo', 'descripcion': 'Jefe Operativo'},
        {'nombre_rol': 'jefe_taller', 'descripcion': 'Jefe de Taller'},
        {'nombre_rol': 'tecnico_mecanico', 'descripcion': 'Técnico Mecánico'},
        {'nombre_rol': 'encargado_rep_almacen', 'descripcion': 'Encargado de Repuestos'},
        {'nombre_rol': 'cliente', 'descripcion': 'Cliente'}
    ]
    
    # Verificar si ya existen
    existing = supabase.table('rol').select('nombre_rol').execute()
    existing_names = [r['nombre_rol'] for r in existing.data] if existing.data else []
    
    rol_ids = {}
    for rol in roles:
        if rol['nombre_rol'] not in existing_names:
            result = supabase.table('rol').insert(rol).execute()
            if result.data:
                rol_ids[rol['nombre_rol']] = result.data[0]['id']
                print(f"  ✅ Insertado: {rol['nombre_rol']}")
        else:
            # Obtener ID del rol existente
            result = supabase.table('rol').select('id').eq('nombre_rol', rol['nombre_rol']).execute()
            if result.data:
                rol_ids[rol['nombre_rol']] = result.data[0]['id']
                print(f"  ⏩ Ya existe: {rol['nombre_rol']}")
    
    # =====================================================
    # 2. Insertar Usuarios (Personal)
    # =====================================================
    print("\n👥 Insertando personal (acceso con número de documento)...")
    
    # Hashear contraseñas con werkzeug
    admin_password = generate_password_hash('admin123')
    
    staff_users = [
        {
            'id_rol': rol_ids['admin_general'],
            'nombre': 'Carlos Rodríguez',
            'numero_documento': '1234567',
            'contacto': '77712345',
            'ubicacion': 'Oficina Administración',
            'contrasenia': admin_password
        },
        {
            'id_rol': rol_ids['jefe_operativo'],
            'nombre': 'María González',
            'numero_documento': '7654321',
            'contacto': '77712346',
            'ubicacion': 'Recepción',
            'contrasenia': admin_password
        },
        {
            'id_rol': rol_ids['jefe_taller'],
            'nombre': 'Juan Pérez',
            'numero_documento': '9876543',
            'contacto': '77712347',
            'ubicacion': 'Taller - Oficina',
            'contrasenia': admin_password
        },
        {
            'id_rol': rol_ids['tecnico_mecanico'],
            'nombre': 'Luis Mamani',
            'numero_documento': '1357924',
            'contacto': '77712348',
            'ubicacion': 'Taller - Bahía 3',
            'contrasenia': admin_password
        },
        {
            'id_rol': rol_ids['encargado_rep_almacen'],
            'nombre': 'Ana López',
            'numero_documento': '2468135',
            'contacto': '77712349',
            'ubicacion': 'Almacén',
            'contrasenia': admin_password
        }
    ]
    
    # Insertar usuarios
    for user in staff_users:
        # Verificar si ya existe por número de documento
        existing_user = supabase.table('usuario').select('id').eq('numero_documento', user['numero_documento']).execute()
        
        if not existing_user.data:
            result = supabase.table('usuario').insert(user).execute()
            if result.data:
                print(f"  ✅ Insertado: {user['nombre']} (Doc: {user['numero_documento']})")
        else:
            print(f"  ⏩ Ya existe: {user['nombre']} (Doc: {user['numero_documento']})")
    
    # =====================================================
    # 3. Insertar Usuarios Clientes
    # =====================================================
    print("\n👤 Insertando usuarios clientes...")
    
    client_password = generate_password_hash('cliente123')
    
    client_users = [
        {
            'id_rol': rol_ids['cliente'],
            'nombre': 'Pedro Sánchez',
            'numero_documento': '1111111',
            'contacto': '77712350',
            'ubicacion': 'Zona Sur',
            'contrasenia': client_password
        },
        {
            'id_rol': rol_ids['cliente'],
            'nombre': 'Laura Flores',
            'numero_documento': '2222222',
            'contacto': '77712351',
            'ubicacion': 'Zona Central',
            'contrasenia': client_password
        },
        {
            'id_rol': rol_ids['cliente'],
            'nombre': 'Roberto Méndez',
            'numero_documento': '3333333',
            'contacto': '77712352',
            'ubicacion': 'Zona Norte',
            'contrasenia': client_password
        }
    ]
    
    client_user_ids = []
    for user in client_users:
        existing_user = supabase.table('usuario').select('id').eq('numero_documento', user['numero_documento']).execute()
        
        if not existing_user.data:
            result = supabase.table('usuario').insert(user).execute()
            if result.data:
                client_user_ids.append(result.data[0]['id'])
                print(f"  ✅ Insertado usuario: {user['nombre']} (Doc: {user['numero_documento']})")
        else:
            print(f"  ⏩ Ya existe usuario: {user['nombre']}")
            client_user_ids.append(existing_user.data[0]['id'])
    
    # =====================================================
    # 4. Insertar Clientes
    # =====================================================
    print("\n📋 Insertando registros en tabla Cliente...")
    
    existing_clientes = supabase.table('cliente').select('id_usuario').execute()
    existing_clientes_ids = [c['id_usuario'] for c in existing_clientes.data] if existing_clientes.data else []
    
    clientes_data = [
        {'id_usuario': client_user_ids[0], 'tipo_documento': 'CI', 'numero_documento': '1111111'},
        {'id_usuario': client_user_ids[1], 'tipo_documento': 'CI', 'numero_documento': '2222222'},
        {'id_usuario': client_user_ids[2], 'tipo_documento': 'CI', 'numero_documento': '3333333'},
    ]
    
    cliente_ids = []
    for cliente in clientes_data:
        if cliente['id_usuario'] not in existing_clientes_ids:
            result = supabase.table('cliente').insert(cliente).execute()
            if result.data:
                cliente_ids.append(result.data[0]['id'])
                print(f"  ✅ Cliente registrado: Doc {cliente['numero_documento']}")
        else:
            result = supabase.table('cliente').select('id').eq('id_usuario', cliente['id_usuario']).execute()
            if result.data:
                cliente_ids.append(result.data[0]['id'])
                print(f"  ⏩ Cliente ya existe: Doc {cliente['numero_documento']}")
    
    # =====================================================
    # 5. Insertar Vehículos
    # =====================================================
    print("\n🚗 Insertando vehículos (acceso con PLACA para clientes)...")
    
    existing_vehiculos = supabase.table('vehiculo').select('placa').execute()
    existing_placas = [v['placa'] for v in existing_vehiculos.data] if existing_vehiculos.data else []
    
    vehiculos = [
        {'id_cliente': cliente_ids[0], 'placa': 'ABC123', 'marca': 'Toyota', 'modelo': 'Corolla', 'anio': 2020, 'kilometraje': 45000},
        {'id_cliente': cliente_ids[1], 'placa': 'XYZ789', 'marca': 'Honda', 'modelo': 'Civic', 'anio': 2022, 'kilometraje': 15000},
        {'id_cliente': cliente_ids[2], 'placa': 'DEF456', 'marca': 'Suzuki', 'modelo': 'Swift', 'anio': 2021, 'kilometraje': 30000},
    ]
    
    for v in vehiculos:
        if v['placa'] not in existing_placas:
            result = supabase.table('vehiculo').insert(v).execute()
            if result.data:
                print(f"  ✅ Insertado: {v['placa']} - {v['marca']} {v['modelo']}")
        else:
            print(f"  ⏩ Ya existe: {v['placa']}")
    
    # =====================================================
    # 6. Resumen final
    # =====================================================
    print("\n" + "="*70)
    print("📊 RESUMEN DE CREDENCIALES DE ACCESO")
    print("="*70)
    print("\n👥 PERSONAL (acceso con NÚMERO DE DOCUMENTO):")
    print("  • Admin General: Carlos Rodríguez")
    print("    → Documento: 1234567 / Contraseña: admin123")
    print("  • Jefe Operativo: María González")
    print("    → Documento: 7654321 / Contraseña: admin123")
    print("  • Jefe Taller: Juan Pérez")
    print("    → Documento: 9876543 / Contraseña: admin123")
    print("  • Técnico: Luis Mamani")
    print("    → Documento: 1357924 / Contraseña: admin123")
    print("  • Encargado Repuestos: Ana López")
    print("    → Documento: 2468135 / Contraseña: admin123")
    
    print("\n👤 CLIENTES (acceso con PLACA del vehículo):")
    print("  • Pedro Sánchez")
    print("    → Placa: ABC123 / Contraseña: cliente123")
    print("    → Vehículo: Toyota Corolla 2020")
    print("  • Laura Flores")
    print("    → Placa: XYZ789 / Contraseña: cliente123")
    print("    → Vehículo: Honda Civic 2022")
    print("  • Roberto Méndez")
    print("    → Placa: DEF456 / Contraseña: cliente123")
    print("    → Vehículo: Suzuki Swift 2021")
    print("="*70)
    
    print("\n✅ ¡Proceso completado!")

if __name__ == "__main__":
    insert_test_data()