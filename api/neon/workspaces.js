/**
 * API Endpoint consolidado para todas las operaciones de workspaces
 * Maneja: /api/neon/workspaces, /api/neon/workspaces/[workspaceId], /api/neon/workspaces/user/[userId]
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
        // Parsear la URL
        const url = req.url || '';
        const urlParts = url.split('/').filter(p => p);
        
        const isUserRoute = urlParts.includes('user');
        const isWorkspaceIdRoute = urlParts.length > 0 && !isUserRoute;

        // Ruta: /api/neon/workspaces/user/[userId]
        if (isUserRoute && req.method === 'GET') {
            const userIdIndex = urlParts.indexOf('user');
            const userId = userIdIndex !== -1 && urlParts[userIdIndex + 1] 
                ? urlParts[userIdIndex + 1] 
                : req.query.userId;

            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId es requerido' });
            }

            const query = 'SELECT * FROM workspaces WHERE user_id = $1 ORDER BY created_at DESC';
            const result = await executeQuery(query, [userId]);

            return res.status(200).json({ success: true, workspaces: result || [] });
        }

        // Ruta: /api/neon/workspaces/workspace/[workspaceId] (GET, PATCH, DELETE)
        if (isWorkspaceIdRoute && urlParts[0] === 'workspace') {
            const workspaceId = urlParts[1] || req.query.workspaceId;

            if (!workspaceId) {
                return res.status(400).json({ success: false, error: 'workspaceId es requerido' });
            }

            if (req.method === 'GET') {
                const query = 'SELECT * FROM workspaces WHERE workspace_id = $1 LIMIT 1';
                const result = await executeQuery(query, [workspaceId]);

                if (result && result.length > 0) {
                    return res.status(200).json(result[0]);
                } else {
                    return res.status(404).json({ success: false, error: 'Workspace no encontrado' });
                }
            } else if (req.method === 'PATCH') {
                const updateFields = req.body;
                const allowedFields = ['name', 'user_id', 'credits', 'status'];

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

                values.push(workspaceId);

                const query = `UPDATE workspaces SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = $${paramIndex} RETURNING *`;
                const result = await executeQuery(query, values);

                if (result && result.length > 0) {
                    return res.status(200).json(result[0]);
                } else {
                    return res.status(404).json({ success: false, error: 'Workspace no encontrado' });
                }
            } else if (req.method === 'DELETE') {
                const query = 'DELETE FROM workspaces WHERE workspace_id = $1 RETURNING id';
                const result = await executeQuery(query, [workspaceId]);

                if (result && result.length > 0) {
                    return res.status(200).json({ success: true, message: 'Workspace eliminado correctamente' });
                } else {
                    return res.status(404).json({ success: false, error: 'Workspace no encontrado' });
                }
            }
        }

        // Ruta: /api/neon/workspaces (GET, POST)
        if (req.method === 'GET') {
            const { user_id, workspace_id, status, limit } = req.query;
            
            let query = 'SELECT * FROM workspaces WHERE 1=1';
            const params = [];
            let paramIndex = 1;

            if (user_id) {
                query += ` AND user_id = $${paramIndex++}`;
                params.push(user_id);
            }

            if (workspace_id) {
                query += ` AND workspace_id = $${paramIndex++}`;
                params.push(workspace_id);
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

            const workspaces = await executeQuery(query, params);
            
            return res.status(200).json({ success: true, workspaces: workspaces });

        } else if (req.method === 'POST') {
            const { workspace_id, name, user_id, credits = 0, status = 'active' } = req.body;

            if (!workspace_id || !name) {
                return res.status(400).json({ success: false, error: 'workspace_id y name son requeridos' });
            }

            const query = `
                INSERT INTO workspaces (workspace_id, name, user_id, credits, status)
                VALUES ($1, $2, $3, $4, $5) RETURNING *
            `;

            const params = [workspace_id, name, user_id || null, credits, status];

            const result = await executeQuery(query, params);
            
            if (result && result.length > 0) {
                return res.status(201).json({ success: true, ...result[0] });
            } else {
                throw new Error('No se pudo crear el workspace');
            }
        }

        return res.status(404).json({ success: false, error: 'Ruta no encontrada' });

    } catch (error) {
        console.error('❌ Error en /api/neon/workspaces:', error);
        
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'El workspace_id ya existe' });
        }

        if (error.code === '23503') {
            return res.status(400).json({ success: false, error: 'El user_id no existe' });
        }

        return res.status(500).json({ success: false, error: error.message || 'Error interno del servidor' });
    }
};

