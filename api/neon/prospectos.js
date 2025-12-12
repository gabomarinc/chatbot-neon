/**
 * API Endpoint consolidado para todas las operaciones de prospectos
 * Maneja: /api/neon/prospectos, /api/neon/prospectos/[id], /api/neon/prospectos/chat/[chatId], /api/neon/prospectos/batch
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
        
        const isBatchRoute = urlParts.includes('batch');
        const isChatRoute = urlParts.includes('chat');
        const hasId = urlParts.length > 0 && !isBatchRoute && !isChatRoute;

        // Ruta: /api/neon/prospectos/batch
        if (isBatchRoute && req.method === 'POST') {
            const { records } = req.body;

            if (!Array.isArray(records) || records.length === 0) {
                return res.status(400).json({ success: false, error: 'records debe ser un array no vacío' });
            }

            const created = [];
            const errors = [];

            for (const record of records) {
                try {
                    const {
                        nombre, chat_id, fecha_extraccion, user_email, workspace_id, user_id,
                        telefono, canal, fecha_ultimo_mensaje, estado, imagenes_urls,
                        documentos_urls, agente_id, notas, comentarios, campos_solicitados
                    } = record;

                    if (!nombre || !chat_id) {
                        errors.push({ record, error: 'nombre y chat_id son requeridos' });
                        continue;
                    }

                    const existingQuery = 'SELECT id FROM prospectos WHERE chat_id = $1 LIMIT 1';
                    const existing = await executeQuery(existingQuery, [chat_id]);
                    
                    if (existing && existing.length > 0) {
                        created.push({ ...existing[0], alreadyExists: true });
                        continue;
                    }

                    const query = `
                        INSERT INTO prospectos (
                            nombre, chat_id, fecha_extraccion, user_email, workspace_id, user_id,
                            telefono, canal, fecha_ultimo_mensaje, estado,
                            imagenes_urls, documentos_urls, agente_id, notas, comentarios, campos_solicitados
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                        ) RETURNING *
                    `;

                    const params = [
                        nombre, chat_id, fecha_extraccion || new Date().toISOString(),
                        user_email || null, workspace_id || null, user_id || null,
                        telefono || null, canal || null, fecha_ultimo_mensaje || null,
                        estado || 'Nuevo', imagenes_urls || null, documentos_urls || null,
                        agente_id || null, notas || null, comentarios || null,
                        campos_solicitados ? (typeof campos_solicitados === 'string' ? campos_solicitados : JSON.stringify(campos_solicitados)) : null
                    ];

                    const result = await executeQuery(query, params);
                    
                    if (result && result.length > 0) {
                        created.push(result[0]);
                    } else {
                        errors.push({ record, error: 'No se pudo crear el prospecto' });
                    }
                } catch (error) {
                    errors.push({ record, error: error.message || 'Error desconocido' });
                }
            }

            return res.status(200).json({
                success: true,
                prospects: created,
                created: created,
                errors: errors,
                createdCount: created.length,
                errorCount: errors.length,
                total: records.length
            });
        }

        // Ruta: /api/neon/prospectos/chat/[chatId]
        if (isChatRoute && req.method === 'GET') {
            const chatIdIndex = urlParts.indexOf('chat');
            const chatId = chatIdIndex !== -1 && urlParts[chatIdIndex + 1] 
                ? decodeURIComponent(urlParts[chatIdIndex + 1]) 
                : req.query.chatId;

            if (!chatId) {
                return res.status(400).json({ success: false, error: 'chatId es requerido' });
            }

            const query = 'SELECT * FROM prospectos WHERE chat_id = $1 LIMIT 1';
            const result = await executeQuery(query, [chatId]);

            if (result && result.length > 0) {
                return res.status(200).json(result[0]);
            } else {
                return res.status(404).json({ success: false, error: 'Prospecto no encontrado' });
            }
        }

        // Ruta: /api/neon/prospectos/[id] (GET, PATCH, DELETE)
        if (hasId) {
            const id = urlParts[0] || req.query.id;

            if (!id) {
                return res.status(400).json({ success: false, error: 'id es requerido' });
            }

            if (req.method === 'GET') {
                const query = 'SELECT * FROM prospectos WHERE id = $1 LIMIT 1';
                const result = await executeQuery(query, [id]);

                if (result && result.length > 0) {
                    return res.status(200).json(result[0]);
                } else {
                    return res.status(404).json({ success: false, error: 'Prospecto no encontrado' });
                }
            } else if (req.method === 'PATCH') {
                const updateFields = req.body;
                const allowedFields = [
                    'nombre', 'chat_id', 'fecha_extraccion', 'user_email', 'workspace_id', 'user_id',
                    'telefono', 'canal', 'fecha_ultimo_mensaje', 'estado',
                    'imagenes_urls', 'documentos_urls', 'agente_id', 'notas', 'comentarios', 'campos_solicitados'
                ];

                const fieldsToUpdate = [];
                const values = [];
                let paramIndex = 1;

                for (const [key, value] of Object.entries(updateFields)) {
                    if (allowedFields.includes(key)) {
                        if (key === 'campos_solicitados' && typeof value !== 'string') {
                            fieldsToUpdate.push(`${key} = $${paramIndex++}`);
                            values.push(JSON.stringify(value));
                        } else if ((key === 'imagenes_urls' || key === 'documentos_urls') && Array.isArray(value)) {
                            fieldsToUpdate.push(`${key} = $${paramIndex++}`);
                            values.push(JSON.stringify(value));
                        } else {
                            fieldsToUpdate.push(`${key} = $${paramIndex++}`);
                            values.push(value);
                        }
                    }
                }

                if (fieldsToUpdate.length === 0) {
                    return res.status(400).json({ success: false, error: 'No hay campos válidos para actualizar' });
                }

                values.push(id);

                const query = `UPDATE prospectos SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`;
                const result = await executeQuery(query, values);

                if (result && result.length > 0) {
                    return res.status(200).json(result[0]);
                } else {
                    return res.status(404).json({ success: false, error: 'Prospecto no encontrado' });
                }
            } else if (req.method === 'DELETE') {
                const query = 'DELETE FROM prospectos WHERE id = $1 RETURNING id';
                const result = await executeQuery(query, [id]);

                if (result && result.length > 0) {
                    return res.status(200).json({ success: true, message: 'Prospecto eliminado correctamente' });
                } else {
                    return res.status(404).json({ success: false, error: 'Prospecto no encontrado' });
                }
            }
        }

        // Ruta: /api/neon/prospectos (GET, POST)
        if (req.method === 'GET') {
            const { user_email, workspace_id, user_id, limit, page_size } = req.query;
            
            let query = 'SELECT * FROM prospectos WHERE 1=1';
            const params = [];
            let paramIndex = 1;

            if (user_email) {
                query += ` AND user_email = $${paramIndex++}`;
                params.push(user_email);
            }

            if (workspace_id) {
                query += ` AND workspace_id = $${paramIndex++}`;
                params.push(workspace_id);
            }

            if (user_id) {
                query += ` AND user_id = $${paramIndex++}`;
                params.push(user_id);
            }

            query += ' ORDER BY fecha_extraccion DESC, created_at DESC';

            if (limit) {
                query += ` LIMIT $${paramIndex++}`;
                params.push(parseInt(limit));
            } else if (page_size) {
                query += ` LIMIT $${paramIndex++}`;
                params.push(parseInt(page_size));
            }

            const prospectos = await executeQuery(query, params);
            
            return res.status(200).json({ success: true, prospectos: prospectos || [], total: prospectos?.length || 0 });

        } else if (req.method === 'POST') {
            const {
                nombre, chat_id, fecha_extraccion, user_email, workspace_id, user_id,
                telefono, canal, fecha_ultimo_mensaje, estado, imagenes_urls,
                documentos_urls, agente_id, notas, comentarios, campos_solicitados
            } = req.body;

            if (!nombre || !chat_id) {
                return res.status(400).json({ success: false, error: 'nombre y chat_id son requeridos' });
            }

            const existingQuery = 'SELECT id FROM prospectos WHERE chat_id = $1 LIMIT 1';
            const existing = await executeQuery(existingQuery, [chat_id]);
            
            if (existing && existing.length > 0) {
                return res.status(409).json({ success: false, error: 'Ya existe un prospecto con este chat_id', id: existing[0].id });
            }

            const query = `
                INSERT INTO prospectos (
                    nombre, chat_id, fecha_extraccion, user_email, workspace_id, user_id,
                    telefono, canal, fecha_ultimo_mensaje, estado,
                    imagenes_urls, documentos_urls, agente_id, notas, comentarios, campos_solicitados
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                ) RETURNING *
            `;

            const params = [
                nombre, chat_id, fecha_extraccion || new Date().toISOString(),
                user_email || null, workspace_id || null, user_id || null,
                telefono || null, canal || null, fecha_ultimo_mensaje || null,
                estado || 'Nuevo', imagenes_urls || null, documentos_urls || null,
                agente_id || null, notas || null, comentarios || null,
                campos_solicitados ? (typeof campos_solicitados === 'string' ? campos_solicitados : JSON.stringify(campos_solicitados)) : null
            ];

            const result = await executeQuery(query, params);
            
            if (result && result.length > 0) {
                return res.status(201).json({ success: true, ...result[0] });
            } else {
                throw new Error('No se pudo crear el prospecto');
            }
        }

        return res.status(404).json({ success: false, error: 'Ruta no encontrada' });

    } catch (error) {
        console.error('❌ Error en /api/neon/prospectos:', error);
        
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Ya existe un prospecto con este chat_id' });
        }

        return res.status(500).json({ success: false, error: error.message || 'Error interno del servidor' });
    }
};

