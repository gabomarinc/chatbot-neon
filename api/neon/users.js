/**
 * API Endpoint consolidado para todas las operaciones de usuarios
 * Maneja: /api/neon/users, /api/neon/users/[userId], /api/neon/users/email/[email], etc.
 */

const { executeQuery } = require('../../lib/neon/db');

module.exports = async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Parsear la URL para determinar la ruta
        // En Vercel con rewrites, req.url puede contener la ruta original completa
        // o solo la parte después del destino del rewrite
        let url = req.url || req.path || '';
        
        // Si la URL no comienza con /api, puede que Vercel haya hecho un rewrite
        // En ese caso, la URL original puede estar en headers
        if (!url.startsWith('/')) {
            url = '/' + url;
        }
        
        console.log('🔍 URL completa recibida:', url);
        console.log('🔍 Query params:', req.query);
        console.log('🔍 Method:', req.method);
        console.log('🔍 Headers referer:', req.headers.referer);
        
        // Extraer la parte relevante de la URL
        // Patrones posibles:
        // - /api/neon/users/email/admin@example.com
        // - /email/admin@example.com (después del rewrite)
        // - email/admin@example.com (sin barra inicial)
        let urlPath = url.split('?')[0]; // Remover query string
        
        // Si la URL contiene /api/neon/users, extraer solo la parte después
        const apiIndex = urlPath.indexOf('/api/neon/users');
        if (apiIndex !== -1) {
            urlPath = urlPath.substring(apiIndex + '/api/neon/users'.length);
        }
        
        // Asegurar que empiece con /
        if (!urlPath.startsWith('/')) {
            urlPath = '/' + urlPath;
        }
        
        // Dividir en partes y filtrar vacías
        const urlParts = urlPath.split('/').filter(p => p && p.trim());
        
        console.log('🔍 URL path procesado:', urlPath);
        console.log('🔍 URL parts después de filtrar:', urlParts);
        
        // Determinar el tipo de operación basado en la URL
        const isEmailRoute = urlParts.includes('email') || url.includes('/email/') || url.includes('/email?');
        const isPasswordRoute = urlParts.includes('password') || url.includes('/password');
        const isLastLoginRoute = urlParts.includes('last-login') || url.includes('/last-login');
        const hasUserId = urlParts.length > 0 && !isEmailRoute && !isPasswordRoute && !isLastLoginRoute && urlParts[0] !== 'email';
        
        console.log('🔍 Detección de ruta:', {
            isEmailRoute,
            isPasswordRoute,
            isLastLoginRoute,
            hasUserId,
            urlParts
        });

        // Ruta: /api/neon/users/email/[email]
        if (isEmailRoute) {
            let email = null;
            
            // Intentar obtener email de diferentes formas (orden de prioridad)
            
            // 1. De query params (más confiable)
            if (req.query.email) {
                email = decodeURIComponent(req.query.email);
                console.log('📧 Email obtenido de query params:', email);
            }
            // 2. De urlParts si email está en la posición correcta
            else {
                const emailIndex = urlParts.indexOf('email');
                if (emailIndex !== -1 && urlParts[emailIndex + 1]) {
                    email = decodeURIComponent(urlParts[emailIndex + 1]);
                    console.log('📧 Email obtenido de urlParts (después de email):', email);
                }
                // 3. Intentar extraer de la URL completa con regex (más flexible)
                else {
                    // Buscar patrones como /email/xxx o email/xxx o email?xxx
                    const emailPatterns = [
                        /email[\/]([^\/\?&]+)/i,  // /email/value o email/value
                        /email[=]([^\/\?&]+)/i,   // email=value
                        /[\/]email[\/]([^\/\?&]+)/i  // /email/value (más específico)
                    ];
                    
                    for (const pattern of emailPatterns) {
                        const emailMatch = url.match(pattern);
                        if (emailMatch && emailMatch[1]) {
                            email = decodeURIComponent(emailMatch[1]);
                            console.log('📧 Email obtenido de regex pattern:', email);
                            break;
                        }
                    }
                }
            }
            
            // 4. Si aún no tenemos email, buscar cualquier parte que parezca un email
            if (!email && urlParts.length > 0) {
                for (const part of urlParts) {
                    const decodedPart = decodeURIComponent(part);
                    if (decodedPart.includes('@') && decodedPart.includes('.')) {
                        email = decodedPart;
                        console.log('📧 Email encontrado en urlParts (búsqueda por @):', email);
                        break;
                    }
                }
            }

            console.log('📧 Email final extraído:', email);
            console.log('📧 URL original completa:', url);
            console.log('📧 URL path procesado:', urlPath);
            console.log('📧 URL parts finales:', urlParts);

            if (!email) {
                console.error('❌ No se pudo extraer el email de la URL');
                return res.status(400).json({ 
                    success: false, 
                    error: 'Email es requerido',
                    debug: { url, urlParts, query: req.query }
                });
            }

            if (req.method === 'GET') {
                console.log('🔍 Buscando usuario en BD con email:', email);
                try {
                    const query = 'SELECT * FROM users WHERE email = $1 LIMIT 1';
                    const result = await executeQuery(query, [email]);
                    
                    console.log('📊 Resultado de BD:', result ? `${result.length} registros encontrados` : 'null');
                    if (result && result.length > 0) {
                        console.log('✅ Usuario encontrado:', { id: result[0].id, email: result[0].email });
                        return res.status(200).json(result[0]);
                    } else {
                        console.log('⚠️ Usuario no encontrado en BD para email:', email);
                        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
                    }
                } catch (dbError) {
                    console.error('❌ Error en consulta a BD:', dbError);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error de base de datos: ' + dbError.message 
                    });
                }
            }
        }

        // Ruta: /api/neon/users/[userId]/password
        if (isPasswordRoute && hasUserId) {
            const userId = urlParts[0] || req.query.userId;
            const { password_hash } = req.body;

            if (!userId || !password_hash) {
                return res.status(400).json({ success: false, error: 'userId y password_hash son requeridos' });
            }

            if (req.method === 'PATCH') {
                const query = `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`;
                const result = await executeQuery(query, [password_hash, userId]);
                
                if (result && result.length > 0) {
                    return res.status(200).json({ success: true, message: 'Contraseña actualizada correctamente' });
                } else {
                    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
                }
            }
        }

        // Ruta: /api/neon/users/[userId]/last-login
        if (isLastLoginRoute && hasUserId) {
            const userId = urlParts[0] || req.query.userId;

            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId es requerido' });
            }

            if (req.method === 'PATCH') {
                const query = `UPDATE users SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`;
                const result = await executeQuery(query, [userId]);
                
                if (result && result.length > 0) {
                    return res.status(200).json({ success: true, message: 'Última sesión actualizada' });
                } else {
                    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
                }
            }
        }

        // Ruta: /api/neon/users/[userId] (GET, PATCH, DELETE)
        if (hasUserId && !isEmailRoute && !isPasswordRoute && !isLastLoginRoute) {
            const userId = urlParts[0] || req.query.userId;

            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId es requerido' });
            }

            if (req.method === 'GET') {
                const query = 'SELECT * FROM users WHERE id = $1';
                const result = await executeQuery(query, [userId]);

                if (result && result.length > 0) {
                    return res.status(200).json(result[0]);
                } else {
                    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
                }
            } else if (req.method === 'PATCH') {
                const updateFields = req.body;
                const allowedFields = [
                    'email', 'first_name', 'last_name', 'empresa', 'phone',
                    'profile_image', 'role', 'status', 'has_paid', 'token_api',
                    'stripe_customer_id', 'is_team_member', 'team_owner_email', 'member_role'
                ];

                const fieldsToUpdate = [];
                const values = [];
                let paramIndex = 1;

                for (const [key, value] of Object.entries(updateFields)) {
                    if (allowedFields.includes(key)) {
                        fieldsToUpdate.push(`${key} = $${paramIndex++}`);
                        values.push(value);
                    }
                }

                if (fieldsToUpdate.length === 0) {
                    return res.status(400).json({ success: false, error: 'No hay campos válidos para actualizar' });
                }

                values.push(userId);

                const query = `UPDATE users SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`;
                const result = await executeQuery(query, values);

                if (result && result.length > 0) {
                    return res.status(200).json(result[0]);
                } else {
                    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
                }
            } else if (req.method === 'DELETE') {
                const query = 'DELETE FROM users WHERE id = $1 RETURNING id';
                const result = await executeQuery(query, [userId]);

                if (result && result.length > 0) {
                    return res.status(200).json({ success: true, message: 'Usuario eliminado correctamente' });
                } else {
                    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
                }
            }
        }

        // Ruta: /api/neon/users (GET, POST)
        if (req.method === 'GET') {
            const { limit, role, status } = req.query;
            
            let query = 'SELECT * FROM users WHERE 1=1';
            const params = [];
            let paramIndex = 1;

            if (role) {
                query += ` AND role = $${paramIndex++}`;
                params.push(role);
            }

            if (status) {
                query += ` AND status = $${paramIndex++}`;
                params.push(status);
            }

            query += ' ORDER BY created_at DESC';

            if (limit) {
                query += ` LIMIT $${paramIndex++}`;
                params.push(parseInt(limit));
            }

            const users = await executeQuery(query, params);
            
            return res.status(200).json({ success: true, users: users });

        } else if (req.method === 'POST') {
            const {
                email, first_name, last_name, password_hash, role = 'user',
                status = 'active', empresa, phone, profile_image, has_paid = false,
                token_api, stripe_customer_id, is_team_member = false,
                team_owner_email, member_role
            } = req.body;

            if (!email || !password_hash) {
                return res.status(400).json({ success: false, error: 'Email y password_hash son requeridos' });
            }

            const query = `
                INSERT INTO users (
                    email, first_name, last_name, password_hash, role, status,
                    empresa, phone, profile_image, has_paid, token_api,
                    stripe_customer_id, is_team_member, team_owner_email, member_role
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
                ) RETURNING *
            `;

            const params = [
                email, first_name || '', last_name || '', password_hash, role, status,
                empresa || null, phone || null, profile_image || null, has_paid,
                token_api || null, stripe_customer_id || null, is_team_member,
                team_owner_email || null, member_role || null
            ];

            const result = await executeQuery(query, params);
            
            if (result && result.length > 0) {
                return res.status(201).json({ success: true, id: result[0].id, ...result[0] });
            } else {
                throw new Error('No se pudo crear el usuario');
            }
        }

        return res.status(404).json({ success: false, error: 'Ruta no encontrada' });

    } catch (error) {
        console.error('❌ Error en /api/neon/users:', error);
        
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'El email ya está registrado' });
        }

        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno del servidor'
        });
    }
};

