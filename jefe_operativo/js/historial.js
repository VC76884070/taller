// =====================================================
// CHECK AUTH - CORREGIDO PARA USAR roles ARRAY
// =====================================================
async function checkAuth() {
    const token = localStorage.getItem('furia_token');
    const userInfoRaw = localStorage.getItem('furia_user');
    
    console.log('=== VERIFICANDO AUTENTICACIÓN - HISTORIAL ===');
    
    if (!token) {
        console.error('No hay token');
        window.location.href = '/';
        return false;
    }
    
    try {
        userInfo = JSON.parse(userInfoRaw || '{}');
        console.log('UserInfo:', userInfo);
        
        // Verificar token con backend
        const verifyResponse = await fetch('/api/verify-token', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!verifyResponse.ok) {
            console.error('Token inválido');
            localStorage.clear();
            window.location.href = '/';
            return false;
        }
        
        const verifyData = await verifyResponse.json();
        if (verifyData.user) {
            userInfo = verifyData.user;
            localStorage.setItem('furia_user', JSON.stringify(userInfo));
        }
        
        // CORREGIDO: Verificar por roles (array)
        const roles = userInfo.roles || [];
        const tieneRolJefeOperativo = roles.includes('jefe_operativo');
        
        console.log('Roles:', roles);
        console.log('Tiene jefe_operativo?', tieneRolJefeOperativo);
        
        if (!tieneRolJefeOperativo) {
            console.error('No tiene permisos de jefe_operativo');
            if (roles.includes('jefe_taller')) {
                window.location.href = '/jefe_taller/dashboard.html';
            } else {
                window.location.href = '/';
            }
            return false;
        }
        
        console.log('✅ Autenticación exitosa - Historial');
        return true;
        
    } catch (error) {
        console.error('Error en checkAuth:', error);
        window.location.href = '/';
        return false;
    }
}