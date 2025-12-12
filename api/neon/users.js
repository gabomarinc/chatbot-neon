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
        const url = req.url || '';
        const urlParts = url.split('/').filter(p => p);
        
        // Determinar el tipo de operación basado en la URL
        const isEmailRoute = urlParts.includes('email');
        const isPasswordRoute = urlParts.includes('password');
        const isLastLoginRoute = urlParts.includes('last-login');
        const hasUserId = urlParts.length > 1 && !isEmailRoute;

        // Ruta: /api/neon/users/email/[email]
        if (isEmailRoute) {
            const emailIndex = urlParts.indexOf('email');
            const email = emailIndex !== -1 && urlParts[emailIndex + 1] 
                ? decodeURIComponent(urlParts[emailIndex + 1]) 
                : req.query.email;

            if (!email) {
                return res.status(400).json({ success: false, error: 'Email es requerido' });
            }

            if (req.method === 'GET') {
                const query = 'SELECT * FROM users WHERE email = $1 LIMIT 1';
                const result = await executeQuery(query, [email]);
                
                if (result && result.length > 0) {
                    return res.status(200).json(result[0]);
                } else {
                    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
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

