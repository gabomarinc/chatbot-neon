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
        console.log('🔍 URL recibida en prospectos:', url);
        const urlParts = url.split('/').filter(p => p);
        console.log('🔍 URL parts:', urlParts);
        console.log('🔍 Método:', req.method);
        
        const isBatchRoute = urlParts.includes('batch');
        const isChatRoute = urlParts.includes('chat');
        const hasId = urlParts.length > 0 && !isBatchRoute && !isChatRoute;

        // Ruta: /api/neon/prospectos/batch
        if (isBatchRoute && req.method === 'POST') {
            console.log('📦 Procesando batch de prospectos...');
            console.log('📦 req.body completo:', JSON.stringify(req.body, null, 2));
            console.log('📦 Tipo de req.body:', typeof req.body);
            console.log('📦 Claves de req.body:', Object.keys(req.body || {}));
            
            // En Vercel, el body puede venir parseado o como string
            let body = req.body;
            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                    console.log('📦 Body parseado desde string');
                } catch (e) {
                    console.error('❌ Error parseando body como string:', e);
                    return res.status(400).json({ success: false, error: 'Body inválido' });
                }
            }
            
            const { records } = body || {};
            
            console.log('📦 Records extraído:', {
                hasRecords: !!records,
                recordsType: Array.isArray(records) ? 'array' : typeof records,
                recordsLength: Array.isArray(records) ? records.length : 'N/A',
                firstRecord: Array.isArray(records) && records.length > 0 ? records[0] : null,
                firstRecordKeys: Array.isArray(records) && records.length > 0 ? Object.keys(records[0]) : null
            });

            if (!Array.isArray(records) || records.length === 0) {
                console.error('❌ Error: records debe ser un array no vacío');
                console.error('❌ Body recibido:', JSON.stringify(body, null, 2));
                return res.status(400).json({ success: false, error: 'records debe ser un array no vacío' });
            }

            const created = [];
            const errors = [];

            for (let i = 0; i < records.length; i++) {
                const record = records[i];
                try {
                    // Log detallado del record recibido
                    console.log(`📝 Procesando prospecto ${i + 1}/${records.length}:`, {
                        nombre: record.nombre,
                        chat_id: record.chat_id,
                        nombreType: typeof record.nombre,
                        nombreValue: record.nombre,
                        chat_idType: typeof record.chat_id,
                        chat_idValue: record.chat_id,
                        nombreLength: record.nombre ? record.nombre.length : 0,
                        chat_idLength: record.chat_id ? record.chat_id.length : 0,
                        hasUserEmail: !!record.user_email,
                        hasWorkspaceId: !!record.workspace_id,
                        recordKeys: Object.keys(record),
                        recordCompleto: record
                    });
                    
                    const {
                        nombre, chat_id, fecha_extraccion, user_email, workspace_id, user_id,
                        telefono, canal, fecha_ultimo_mensaje, estado, imagenes_urls,
                        documentos_urls, agente_id, notas, comentarios, campos_solicitados
                    } = record;

                    // Validación - nombre y chat_id son requeridos (como en Airtable)
                    // Convertir a string y trim por si acaso
                    const nombreFinal = String(nombre || '').trim();
                    const chatIdFinal = String(chat_id || '').trim();

                    if (!nombreFinal || !chatIdFinal) {
                        const errorMsg = `nombre y chat_id son requeridos (nombre: ${nombreFinal || 'FALTA'}, chat_id: ${chatIdFinal || 'FALTA'})`;
                        console.error(`❌ Error en prospecto ${i + 1}:`, errorMsg);
                        console.error(`❌ Record completo que falló:`, JSON.stringify(record, null, 2));
                        errors.push({ record, error: errorMsg });
                        continue;
                    }
                    
                    // Usar los valores procesados
                    const nombreToUse = nombreFinal;
                    const chatIdToUse = chatIdFinal;

                    const existingQuery = 'SELECT id FROM prospectos WHERE chat_id = $1 LIMIT 1';
                    const existing = await executeQuery(existingQuery, [chatIdToUse]);
                    
                    if (existing && existing.length > 0) {
                        console.log(`ℹ️ Prospecto ya existe (chat_id: ${chatIdToUse}), saltando...`);
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
                        nombreToUse, 
                        chatIdToUse, 
                        fecha_extraccion || new Date().toISOString(),
                        user_email || null, 
                        workspace_id || null, 
                        user_id || null,
                        telefono || null, 
                        canal || null, 
                        fecha_ultimo_mensaje || null,
                        estado || 'Nuevo', 
                        imagenes_urls || null, 
                        documentos_urls || null,
                        agente_id || null, 
                        notas || null, 
                        comentarios || null,
                        campos_solicitados ? (typeof campos_solicitados === 'string' ? campos_solicitados : JSON.stringify(campos_solicitados)) : null
                    ];

                    const result = await executeQuery(query, params);
                    
                    if (result && result.length > 0) {
                        console.log(`✅ Prospecto ${i + 1} creado exitosamente:`, result[0].id);
                        created.push(result[0]);
                    } else {
                        const errorMsg = 'No se pudo crear el prospecto (query no devolvió resultado)';
                        console.error(`❌ Error en prospecto ${i + 1}:`, errorMsg);
                        errors.push({ record, error: errorMsg });
                    }
                } catch (error) {
                    console.error(`❌ Error procesando prospecto ${i + 1}:`, error.message);
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
            console.log('🔍 Buscando prospecto por chat_id...');
            const chatIdIndex = urlParts.indexOf('chat');
            const chatId = chatIdIndex !== -1 && urlParts[chatIdIndex + 1] 
                ? decodeURIComponent(urlParts[chatIdIndex + 1]) 
                : req.query.chatId;

            console.log('🔍 chatId extraído:', chatId);

            if (!chatId) {
                console.error('❌ chatId es requerido');
                return res.status(400).json({ success: false, error: 'chatId es requerido' });
            }

            try {
                const query = 'SELECT * FROM prospectos WHERE chat_id = $1 LIMIT 1';
                const result = await executeQuery(query, [chatId]);

                if (result && result.length > 0) {
                    console.log('✅ Prospecto encontrado:', result[0].id);
                    return res.status(200).json(result[0]);
                } else {
                    console.log('ℹ️ Prospecto no encontrado para chat_id:', chatId);
                    return res.status(404).json({ success: false, error: 'Prospecto no encontrado' });
                }
            } catch (queryError) {
                console.error('❌ Error ejecutando query de búsqueda por chat_id:', queryError);
                throw queryError;
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
        if (req.method === 'GET' && !isBatchRoute && !isChatRoute && !hasId) {
            console.log('📋 Obteniendo lista de prospectos...');
            const { user_email, workspace_id, user_id, limit, page_size } = req.query;
            
            console.log('📋 Filtros aplicados:', { user_email, workspace_id, user_id, limit, page_size });
            
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

            try {
                console.log('🔍 Ejecutando query:', query);
                console.log('🔍 Parámetros:', params);
                const prospectos = await executeQuery(query, params);
                console.log(`✅ ${prospectos?.length || 0} prospectos obtenidos`);
                return res.status(200).json({ success: true, prospectos: prospectos || [], total: prospectos?.length || 0 });
            } catch (queryError) {
                console.error('❌ Error ejecutando query de prospectos:', queryError);
                console.error('❌ Stack trace:', queryError.stack);
                return res.status(500).json({ 
                    success: false, 
                    error: queryError.message || 'Error obteniendo prospectos',
                    details: process.env.NODE_ENV === 'development' ? queryError.stack : undefined
                });
            }

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

