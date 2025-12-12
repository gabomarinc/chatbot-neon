// Servicio de Gestión de Prospectos
class ProspectsService {
    constructor() {
        // Esperar a que NeonService esté disponible
        if (!window.neonService) {
            console.warn('⚠️ NeonService no disponible aún, esperando...');
            // Intentar obtenerlo después de un delay
            setTimeout(() => {
                this.neonService = window.neonService;
                if (this.neonService) {
                    console.log('✅ NeonService ahora disponible');
                } else {
                    console.error('❌ NeonService aún no disponible después de esperar');
                }
            }, 500);
        } else {
            this.neonService = window.neonService;
        }
        this.savingProspects = new Set(); // Para evitar condiciones de carrera
        console.log('👥 ProspectsService inicializado');
    }

    // ===== EXTRACCIÓN DE NOMBRES =====

    /**
     * Extrae el nombre del prospecto de los mensajes del chat
     * Busca patrones como "mi nombre es", "me llamo", etc.
     */
    extractNameFromMessages(messages) {
        if (!messages || messages.length === 0) {
            console.log('⚠️ No hay mensajes para buscar nombre.');
            return null;
        }

        console.log('🔍 Buscando nombre en mensajes...');

        // Patrones para detectar preguntas sobre el nombre (más flexibles)
        const nameQuestionPatterns = [
            /nombre\s+completo/i,
            /me\s+podr[ií]a\s+dar\s+su\s+nombre/i,
            /cu[aá]l\s+es\s+tu\s+nombre/i,
            /cu[aá]l\s+es\s+su\s+nombre/i,
            /dame\s+tu\s+nombre/i,
            /dame\s+su\s+nombre/i,
            /c[oó]mo\s+te\s+llamas/i,
            /c[oó]mo\s+se\s+llama/i,
            /nombre/i, // Cualquier mención de "nombre"
            /llamo/i,  // Cualquier mención de "llamo"
            /dar\s+nombre/i
        ];

        // Patrones para extraer el nombre de la respuesta
        const nameExtractionPatterns = [
            /(?:mi\s+nombre\s+es|me\s+llamo|es|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/i,
            /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)$/,
            /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/, // Nombre y apellido
            /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/ // Solo nombre
        ];

        // Buscar pregunta del bot y respuesta del usuario
        for (let i = 0; i < messages.length - 1; i++) {
            const botMessage = messages[i];
            const userMessage = messages[i + 1];

            // Verificar que el bot preguntó por el nombre
            if (botMessage.role === 'assistant' || botMessage.role === 'agent') {
                const botText = botMessage.text || '';
                const isNameQuestion = nameQuestionPatterns.some(pattern => pattern.test(botText));

                if (isNameQuestion && userMessage.role === 'user') {
                    const userText = (userMessage.text || '').trim();
                    console.log(`  💬 Bot preguntó por nombre: "${botText.substring(0, 50)}..."`);
                    console.log(`  👤 Usuario respondió: "${userText.substring(0, 50)}..."`);

                    // Intentar extraer el nombre de la respuesta
                    for (const pattern of nameExtractionPatterns) {
                        const match = userText.match(pattern);
                        if (match && match[1]) {
                            const extractedName = match[1].trim();
                            // Validar que el nombre tenga sentido (2-50 caracteres, al menos 2 palabras o una palabra de 3+ letras)
                            if (extractedName.length >= 2 && extractedName.length <= 50) {
                                console.log('✅ Nombre extraído:', extractedName);
                                return extractedName;
                            }
                        }
                    }

                    // Si no coincide con patrones, intentar tomar las primeras palabras como nombre
                    const words = userText.split(/\s+/).filter(w => w.length > 0);
                    if (words.length >= 1 && words.length <= 4) {
                        const possibleName = words.join(' ');
                        // Validar que no sean solo números o símbolos
                        if (/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(possibleName)) {
                            console.log('✅ Nombre extraído (palabras):', possibleName);
                            return possibleName;
                        }
                    }
                }
            }
        }

        console.log('⚠️ No se pudo extraer nombre de los mensajes');
        return null;
    }

    // ===== EXTRACCIÓN DE IMÁGENES Y DOCUMENTOS =====

    /**
     * Extrae todas las imágenes enviadas por el usuario
     */
    extractImagesFromMessages(messages, userId = 'user') {
        if (!messages || messages.length === 0) {
            return [];
        }

        const images = [];
        
        messages.forEach(message => {
            // Solo procesar mensajes del usuario especificado
            if (message.role !== userId) {
                return;
            }
            
            // Buscar imagen en múltiples campos posibles (misma lógica que el dashboard)
            const imageUrl = message.imageUrl || 
                           message.image || 
                           message.mediaUrl || 
                           message.attachmentUrl ||
                           message.media?.url || 
                           message.attachment?.url || 
                           (message.media && typeof message.media === 'string' ? message.media : null) ||
                           message.url ||
                           message.fileUrl ||
                           message.file?.url ||
                           message.photo ||
                           message.photoUrl ||
                           (message.content && typeof message.content === 'string' && message.content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/i)?.[0]);
            
            // Verificar si es una imagen (misma lógica que el dashboard)
            const messageType = (message.type || '').toLowerCase();
            const isImageType = messageType === 'image' || messageType === 'photo' || message.type === 'IMAGE';
            const isImageUrl = imageUrl && (
                              /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(imageUrl) ||
                              imageUrl.includes('image') ||
                              imageUrl.includes('photo') ||
                              imageUrl.startsWith('data:image') ||
                              imageUrl.startsWith('blob:') ||
                              imageUrl.includes('gpt-files.com') // GPTMaker URLs
                          );
            const isImage = isImageType || isImageUrl;
            
            if (isImage && imageUrl) {
                images.push({
                    url: imageUrl,
                    timestamp: message.time || message.timestamp,
                    messageId: message.id
                });
                console.log(`📸 Imagen extraída del usuario:`, imageUrl);
            }
            
            // Buscar en arrays de attachments
            if (message.attachments && Array.isArray(message.attachments)) {
                message.attachments.forEach(attachment => {
                    const attachmentUrl = attachment.url || attachment.imageUrl || attachment.mediaUrl;
                    if (attachmentUrl && (attachment.type === 'image' || /\.(jpg|jpeg|png|gif|webp)/i.test(attachmentUrl))) {
                        images.push({
                            url: attachmentUrl,
                            timestamp: message.time || message.timestamp,
                            messageId: message.id
                        });
                        console.log(`📸 Imagen extraída de attachments:`, attachmentUrl);
                    }
                });
            }
            
            // Buscar en arrays de media
            if (message.media && Array.isArray(message.media)) {
                message.media.forEach(mediaItem => {
                    const mediaUrl = mediaItem.url || mediaItem.imageUrl;
                    if (mediaUrl && (mediaItem.type === 'image' || /\.(jpg|jpeg|png|gif|webp)/i.test(mediaUrl))) {
                        images.push({
                            url: mediaUrl,
                            timestamp: message.time || message.timestamp,
                            messageId: message.id
                        });
                        console.log(`📸 Imagen extraída de media array:`, mediaUrl);
                    }
                });
            }
        });

        console.log(`✅ ${images.length} imágenes extraídas del usuario`);
        return images;
    }

    /**
     * Extrae todos los documentos (incluyendo PDFs) enviados por el usuario
     */
    extractDocumentsFromMessages(messages, userId = 'user') {
        if (!messages || messages.length === 0) {
            return [];
        }

        const documents = [];

        messages.forEach(message => {
            // Solo procesar mensajes del usuario especificado
            if (message.role !== userId) {
                return;
            }
            
            // Buscar documento en múltiples campos posibles
            const documentUrl = message.documentUrl ||
                              message.fileUrl ||
                              message.file?.url ||
                              message.attachmentUrl ||
                              message.attachment?.url ||
                              message.mediaUrl ||
                              message.media?.url ||
                              (message.url && !message.url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)/i) ? message.url : null);
            
            // Verificar si es un documento (no imagen)
            const messageType = (message.type || '').toLowerCase();
            const isImageType = messageType === 'image' || messageType === 'photo' || message.type === 'IMAGE';
            const isDocumentType = messageType === 'document' || messageType === 'file' || messageType === 'pdf';
            const isDocumentUrl = documentUrl && (
                /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)/i.test(documentUrl) ||
                documentUrl.includes('document') ||
                documentUrl.includes('file') ||
                (messageType !== 'image' && messageType !== 'photo' && documentUrl)
            );
            const isDocument = isDocumentType || (isDocumentUrl && !isImageType);
            
            if (isDocument && documentUrl) {
                // Determinar tipo de archivo
                let fileType = 'document';
                if (documentUrl.toLowerCase().endsWith('.pdf')) {
                    fileType = 'pdf';
                } else if (documentUrl.match(/\.(doc|docx)/i)) {
                    fileType = 'word';
                } else if (documentUrl.match(/\.(xls|xlsx)/i)) {
                    fileType = 'excel';
                }
                
                documents.push({
                    url: documentUrl,
                    fileName: message.fileName || message.name || `documento_${documents.length + 1}`,
                    type: fileType,
                    timestamp: message.time || message.timestamp,
                    messageId: message.id
                });
                console.log(`📄 Documento extraído del usuario:`, documentUrl);
            }
            
            // Buscar en arrays de attachments
            if (message.attachments && Array.isArray(message.attachments)) {
                message.attachments.forEach(attachment => {
                    const attachmentUrl = attachment.url || attachment.documentUrl || attachment.fileUrl;
                    if (attachmentUrl && attachment.type !== 'image' && !/\.(jpg|jpeg|png|gif|webp)/i.test(attachmentUrl)) {
                        let fileType = 'document';
                        if (attachmentUrl.toLowerCase().endsWith('.pdf')) {
                            fileType = 'pdf';
                        }
                        documents.push({
                            url: attachmentUrl,
                            fileName: attachment.fileName || attachment.name || 'documento',
                            type: fileType,
                            timestamp: message.time || message.timestamp,
                            messageId: message.id
                        });
                        console.log(`📄 Documento extraído de attachments:`, attachmentUrl);
                    }
                });
            }
        });

        console.log(`✅ ${documents.length} documentos extraídos`);
        return documents;
    }

    // ===== ANÁLISIS COMPLETO DE CHAT =====

    /**
     * Analiza un chat completo y extrae información del prospecto
     */
    async analyzeChat(chat, messages) {
        try {
            console.log(`📊 Analizando chat ${chat.id} para extraer prospecto...`);

            if (!messages || messages.length === 0) {
                console.log('⚠️ No hay mensajes para analizar en el chat', chat.id);
                // Solo crear prospecto si hay un nombre válido en el chat
                const chatName = chat.name || chat.userName || chat.whatsappPhone;
                if (chatName && chatName !== 'Sin nombre' && chatName.trim().length > 0) {
                    return this.createProspectFromChatData(chat, [], chatName);
                } else {
                    console.log('⚠️ No hay nombre válido disponible, saltando este chat');
                    return null; // No crear prospecto sin nombre válido
                }
            }

            // Extraer nombre
            let nombre = this.extractNameFromMessages(messages);
            if (!nombre) {
                nombre = chat.name || chat.userName || chat.whatsappPhone || 'Sin nombre'; // Usar nombre del chat como fallback
                console.log(`⚠️ No se pudo extraer nombre de mensajes, usando datos del chat como fallback: "${nombre}"`);
                // Si el nombre sigue siendo "Sin nombre" o vacío, no crear prospecto
                if (nombre === 'Sin nombre' || nombre.trim().length === 0) {
                    console.log('⚠️ Nombre de prospecto inválido, saltando este chat.');
                    return null;
                }
            }

            // Extraer imágenes
            const imagenes = this.extractImagesFromMessages(messages);
            const imagenesUrls = imagenes.map(img => img.url);

            // Extraer documentos
            const documentos = this.extractDocumentsFromMessages(messages);
            const documentosUrls = documentos.map(doc => ({
                url: doc.url,
                fileName: doc.fileName,
                type: doc.type
            }));

            // Obtener fecha del último mensaje
            const lastMessage = messages[messages.length - 1];
            const fechaUltimoMensaje = lastMessage?.time || lastMessage?.timestamp || new Date().toISOString();

            const prospectData = {
                nombre: nombre,
                chatId: chat.id,
                telefono: chat.whatsappPhone || '',
                canal: chat.type || 'whatsapp',
                fechaExtraccion: new Date().toISOString(),
                fechaUltimoMensaje: fechaUltimoMensaje,
                estado: 'Nuevo',
                imagenesUrls: imagenesUrls,
                documentosUrls: documentosUrls,
                agenteId: chat.agentId || '',
                notas: ''
            };

            console.log('✅ Prospecto analizado:', prospectData);
            return prospectData;

        } catch (error) {
            console.error('❌ Error analizando chat:', error);
            return null;
        }
    }

    /**
     * Crea datos de prospecto usando información del chat (fallback cuando no hay mensajes o nombre)
     */
    createProspectFromChatData(chat, messages = [], nombreFallback = null) {
        try {
            const nombre = nombreFallback || chat.name || chat.userName || chat.whatsappPhone || 'Sin nombre';
            
            // Si el nombre es "Sin nombre" o vacío, no crear prospecto
            if (nombre === 'Sin nombre' || nombre.trim().length === 0) {
                console.log('⚠️ Nombre de prospecto inválido en createProspectFromChatData, saltando.');
                return null;
            }

            // Extraer imágenes y documentos si hay mensajes
            let imagenesUrls = [];
            let documentosUrls = [];
            
            if (messages && messages.length > 0) {
                const imagenes = this.extractImagesFromMessages(messages);
                imagenesUrls = imagenes.map(img => img.url);
                
                const documentos = this.extractDocumentsFromMessages(messages);
                documentosUrls = documentos.map(doc => ({
                    url: doc.url,
                    fileName: doc.fileName,
                    type: doc.type
                }));
            }
            
            const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;
            const fechaUltimoMensaje = lastMessage?.time || lastMessage?.timestamp || chat.time || chat.createdAt || new Date().toISOString();

            return {
                nombre: nombre,
                chatId: chat.id,
                telefono: chat.whatsappPhone || '',
                canal: chat.type || 'whatsapp',
                fechaExtraccion: new Date().toISOString(),
                fechaUltimoMensaje: fechaUltimoMensaje,
                estado: 'Nuevo',
                imagenesUrls: imagenesUrls,
                documentosUrls: documentosUrls,
                agenteId: chat.agentId || '',
                notas: ''
            };

        } catch (error) {
            console.error('❌ Error creando prospecto desde datos del chat:', error);
            return null;
        }
    }

    // ===== GESTIÓN EN NEON =====

    /**
     * Guarda o actualiza un prospecto en Neon
     */
    async saveProspect(prospectData) {
        try {
            if (!this.neonService) {
                throw new Error('NeonService no disponible');
            }

            // PROTECCIÓN CONTRA CONDICIONES DE CARRERA
            // Si ya se está guardando este chat_id, esperar y verificar nuevamente
            if (this.savingProspects.has(prospectData.chatId)) {
                console.log(`⏳ Ya se está guardando este prospecto (chat_id: ${prospectData.chatId}), esperando...`);
                // Esperar y verificar nuevamente hasta 3 veces
                for (let i = 0; i < 3; i++) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const existingAfterWait = await this.neonService.getProspectByChatId(prospectData.chatId);
                    if (existingAfterWait.success && existingAfterWait.prospect) {
                        console.log(`✅ Prospecto ya fue creado por otro proceso durante la espera`);
                        return {
                            success: true,
                            prospect: existingAfterWait.prospect,
                            alreadyExists: true
                        };
                    }
                }
            }
            
            // Marcar que estamos guardando este chat_id
            this.savingProspects.add(prospectData.chatId);
            
            try {
                // Verificar si el prospecto ya existe por chat_id ANTES de crear
                console.log(`🔍 Verificando si prospecto existe para chat_id: ${prospectData.chatId}`);
                const existing = await this.neonService.getProspectByChatId(prospectData.chatId);
                
                if (existing.success && existing.prospect) {
                    // Prospecto ya existe - Actualizar con imágenes/documentos si no los tiene o si hay nuevos
                    console.log(`✅ Prospecto ya existe (ID: ${existing.prospect.id}, nombre: ${existing.prospect.nombre})`);
                    
                    // Verificar si necesita actualizar con imágenes/documentos
                    const hasNewImages = prospectData.imagenesUrls && prospectData.imagenesUrls.length > 0;
                    const hasNewDocuments = prospectData.documentosUrls && prospectData.documentosUrls.length > 0;
                    const existingHasImages = existing.prospect.imagenesUrls && existing.prospect.imagenesUrls.length > 0;
                    const existingHasDocuments = existing.prospect.documentosUrls && existing.prospect.documentosUrls.length > 0;
                    
                    if ((hasNewImages && !existingHasImages) || (hasNewDocuments && !existingHasDocuments)) {
                        console.log(`🔄 Actualizando prospecto existente con imágenes/documentos...`);
                        console.log(`   - Imágenes nuevas: ${hasNewImages ? prospectData.imagenesUrls.length : 0}, existentes: ${existingHasImages ? existing.prospect.imagenesUrls.length : 0}`);
                        console.log(`   - Documentos nuevos: ${hasNewDocuments ? prospectData.documentosUrls.length : 0}, existentes: ${existingHasDocuments ? existing.prospect.documentosUrls.length : 0}`);
                        
                        const updateResult = await this.neonService.updateProspect(existing.prospect.id, {
                            imagenesUrls: prospectData.imagenesUrls,
                            documentosUrls: prospectData.documentosUrls
                        });
                        
                        if (updateResult.success) {
                            console.log(`✅ Prospecto actualizado con imágenes/documentos`);
                            return {
                                success: true,
                                prospect: updateResult.prospect,
                                alreadyExists: true,
                                wasUpdated: true
                            };
                        } else {
                            console.warn(`⚠️ No se pudo actualizar prospecto: ${updateResult.error}`);
                        }
                    } else {
                        console.log(`⏭️ Prospecto ya tiene imágenes/documentos o no hay nuevos, no se actualiza`);
                    }
                    
                    return {
                        success: true,
                        prospect: existing.prospect,
                        alreadyExists: true
                    };
                } else {
                    // Verificar si hubo un error en la búsqueda
                    if (existing.error) {
                        console.error(`❌ Error al buscar prospecto existente: ${existing.error}. NO se creará nuevo prospecto para evitar duplicados.`);
                        return {
                            success: false,
                            error: `Error al verificar duplicados: ${existing.error}`,
                            alreadyExists: false
                        };
                    } else {
                        console.log(`➕ Creando nuevo prospecto (no existe en Neon para chat_id: ${prospectData.chatId})`);
                    }
                    
                    // Crear nuevo prospecto solo si no existe
                    const result = await this.neonService.createProspect(prospectData);
                    if (result.success) {
                        return { ...result, alreadyExists: false };
                    } else {
                        return result;
                    }
                }
            } finally {
                // Siempre remover el chat_id del set, incluso si hay error
                this.savingProspects.delete(prospectData.chatId);
            }
        } catch (error) {
            console.error('❌ Error guardando prospecto:', error);
            // Asegurar que se limpie el set incluso si hay error
            this.savingProspects.delete(prospectData.chatId);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Obtiene todos los prospectos de Neon
     */
    async getAllProspects() {
        try {
            if (!this.neonService) {
                throw new Error('NeonService no disponible');
            }

            const result = await this.neonService.getAllProspects();
            return result;
        } catch (error) {
            console.error('❌ Error obteniendo prospectos:', error);
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    }

    /**
     * Analiza todos los chats y extrae prospectos
     */
    async extractProspectsFromAllChats(chats, dataService) {
        try {
            console.log(`📊 Analizando ${chats.length} chats para extraer prospectos...`);

            const prospects = [];
            const errors = [];

            for (const chat of chats) {
                try {
                    console.log(`📋 Procesando chat: ${chat.id} - ${chat.name || chat.userName || 'Sin nombre'}`);
                    // Obtener mensajes del chat
                    const messagesResult = await dataService.getAllChatMessages(chat.id);

                    if (messagesResult.success && messagesResult.data) {
                        console.log(`  ✅ ${messagesResult.data.length} mensajes obtenidos`);
                        // Analizar chat
                        const prospectData = await this.analyzeChat(chat, messagesResult.data);

                        if (prospectData) {
                            prospects.push(prospectData);
                        }
                    } else {
                        console.warn(`  ⚠️ No se pudieron obtener mensajes para el chat ${chat.id}: ${messagesResult.error || 'Desconocido'}`);
                        // Si no hay mensajes, aún podemos intentar crear un prospecto con la información del chat
                        const prospectData = await this.analyzeChat(chat, []); // Pasar array vacío para que use fallback
                        if (prospectData) {
                            prospects.push(prospectData);
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error analizando chat ${chat.id}:`, error);
                    errors.push({ chatId: chat.id, error: error.message });
                }
            }

            console.log(`✅ ${prospects.length} prospectos extraídos, ${errors.length} errores`);
            return {
                success: true,
                prospects: prospects,
                errors: errors
            };
        } catch (error) {
            console.error('❌ Error extrayendo prospectos:', error);
            return {
                success: false,
                error: error.message,
                prospects: [],
                errors: []
            };
        }
    }
    
    /**
     * Guarda múltiples prospectos usando batch operations cuando sea posible
     * Optimiza las llamadas a la API agrupando creaciones
     */
    async saveProspectsBatch(prospectsData) {
        try {
            if (!this.neonService) {
                throw new Error('NeonService no disponible');
            }
            
            if (!Array.isArray(prospectsData) || prospectsData.length === 0) {
                return {
                    success: true,
                    saved: [],
                    alreadyExists: [],
                    errors: [],
                    savedCount: 0,
                    alreadyExistsCount: 0,
                    errorCount: 0
                };
            }
            
            console.log(`📦 Guardando ${prospectsData.length} prospectos en modo optimizado...`);
            
            // Paso 1: Verificar cuáles ya existen (en batch si es posible)
            const newProspects = [];
            const existingProspects = [];
            const checkErrors = [];
            
            // Verificar existencia de cada prospecto (necesario para evitar duplicados)
            // Nota: Hacemos verificaciones individuales para cada prospecto
            // pero agrupamos las creaciones después
            for (const prospectData of prospectsData) {
                try {
                    const existing = await this.neonService.getProspectByChatId(prospectData.chatId);
                    
                    if (existing.success && existing.prospect) {
                        existingProspects.push({
                            prospect: existing.prospect,
                            newData: prospectData
                        });
                    } else if (!existing.error || !existing.error.includes('429')) {
                        // Solo agregar a nuevos si no es error de rate limit
                        newProspects.push(prospectData);
                    } else {
                        // Si es rate limit, agregar a errores para reintentar después
                        checkErrors.push({
                            prospect: prospectData,
                            error: existing.error
                        });
                    }
                } catch (error) {
                    checkErrors.push({
                        prospect: prospectData,
                        error: error.message
                    });
                }
            }
            
            console.log(`📊 Verificación completada: ${newProspects.length} nuevos, ${existingProspects.length} existentes, ${checkErrors.length} errores`);
            
            // Paso 2: Crear nuevos prospectos en batch
            let batchResult = { created: [], errors: [] };
            if (newProspects.length > 0) {
                console.log(`📦 Creando ${newProspects.length} prospectos nuevos en batch...`);
                batchResult = await this.neonService.createProspectsBatch(newProspects);
            }
            
            // Paso 3: Actualizar prospectos existentes si tienen nuevas imágenes/documentos
            const updated = [];
            for (const { prospect, newData } of existingProspects) {
                const hasNewImages = newData.imagenesUrls && newData.imagenesUrls.length > 0;
                const hasNewDocuments = newData.documentosUrls && newData.documentosUrls.length > 0;
                const existingHasImages = prospect.imagenesUrls && prospect.imagenesUrls.length > 0;
                const existingHasDocuments = prospect.documentosUrls && prospect.documentosUrls.length > 0;
                
                if ((hasNewImages && !existingHasImages) || (hasNewDocuments && !existingHasDocuments)) {
                    try {
                        const updateResult = await this.neonService.updateProspect(prospect.id, {
                            imagenesUrls: newData.imagenesUrls,
                            documentosUrls: newData.documentosUrls
                        });
                        
                        if (updateResult.success) {
                            updated.push(updateResult.prospect);
                        }
                    } catch (error) {
                        console.warn(`⚠️ Error actualizando prospecto ${prospect.id}:`, error);
                    }
                }
            }
            
            return {
                success: batchResult.errorCount === 0 && checkErrors.length === 0,
                saved: batchResult.created,
                alreadyExists: existingProspects.map(e => e.prospect),
                updated: updated,
                errors: [...batchResult.errors, ...checkErrors],
                savedCount: batchResult.created.length,
                alreadyExistsCount: existingProspects.length,
                updatedCount: updated.length,
                errorCount: batchResult.errorCount + checkErrors.length
            };
            
        } catch (error) {
            console.error('❌ Error en saveProspectsBatch:', error);
            return {
                success: false,
                saved: [],
                alreadyExists: [],
                updated: [],
                errors: prospectsData.map(p => ({ prospect: p, error: error.message })),
                savedCount: 0,
                alreadyExistsCount: 0,
                updatedCount: 0,
                errorCount: prospectsData.length
            };
        }
    }
}

// Crear instancia global
window.prospectsService = new ProspectsService();
