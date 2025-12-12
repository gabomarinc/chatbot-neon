/**
 * Servicio de Neon Database
 * Reemplaza AirtableService para usar PostgreSQL (Neon) en lugar de Airtable
 */

class NeonService {
    constructor() {
        this.apiBase = '/api/neon'; // Endpoints del backend que conectan a Neon
        console.log('🗄️ NeonService inicializado');
    }

    // ===== MÉTODOS DE USUARIOS =====

    async createUser(userData) {
        try {
            console.log('📝 Creando usuario en Neon:', userData.email);
            
            const response = await fetch(`${this.apiBase}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: userData.email,
                    first_name: userData.firstName || userData.name?.split(' ')[0] || '',
                    last_name: userData.lastName || userData.name?.split(' ').slice(1).join(' ') || '',
                    password_hash: userData.password,
                    role: userData.role || 'user',
                    status: 'active',
                    has_paid: userData.hasPaid || false,
                    is_team_member: userData.isTeamMember || false,
                    member_role: userData.memberRole || '',
                    team_owner_email: userData.teamOwnerEmail || userData.email,
                    empresa: userData.company || ''
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error creando usuario');
            }

            const data = await response.json();
            console.log('✅ Usuario creado en Neon:', data.id);
            
            return {
                success: true,
                user: this.transformUser(data)
            };

        } catch (error) {
            console.error('❌ Error creando usuario en Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getUserByEmail(email) {
        try {
            console.log('🔍 Buscando usuario por email:', email);
            
            const response = await fetch(`${this.apiBase}/users/email/${encodeURIComponent(email)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        success: false,
                        error: 'Usuario no encontrado'
                    };
                }
                const error = await response.json();
                throw new Error(error.message || 'Error obteniendo usuario');
            }

            const data = await response.json();
            console.log('✅ Usuario encontrado en Neon');
            
            return {
                success: true,
                user: this.transformUser(data)
            };

        } catch (error) {
            console.error('❌ Error buscando usuario en Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getUserById(userId) {
        try {
            console.log('🔍 Obteniendo usuario por ID:', userId);
            
            const response = await fetch(`${this.apiBase}/users/${userId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error obteniendo usuario');
            }

            const data = await response.json();
            console.log('✅ Usuario obtenido de Neon');
            
            return {
                success: true,
                user: this.transformUser(data)
            };

        } catch (error) {
            console.error('❌ Error obteniendo usuario de Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async updateUser(userId, userData) {
        try {
            console.log('📝 Actualizando usuario en Neon:', userId);
            
            const updateData = {};
            if (userData.email !== undefined) updateData.email = userData.email;
            if (userData.name !== undefined) {
                const nameParts = userData.name.split(' ');
                updateData.first_name = nameParts[0] || '';
                updateData.last_name = nameParts.slice(1).join(' ') || '';
            }
            if (userData.firstName !== undefined) updateData.first_name = userData.firstName;
            if (userData.lastName !== undefined) updateData.last_name = userData.lastName;
            if (userData.company !== undefined) updateData.empresa = userData.company;
            if (userData.profileImage !== undefined) updateData.profile_image = userData.profileImage;
            if (userData.role !== undefined) updateData.role = userData.role;
            if (userData.status !== undefined) updateData.status = userData.status;
            if (userData.hasPaid !== undefined) updateData.has_paid = userData.hasPaid;
            if (userData.token_api !== undefined) updateData.token_api = userData.token_api;
            if (userData.isTeamMember !== undefined) updateData.is_team_member = userData.isTeamMember;
            if (userData.teamOwnerEmail !== undefined) updateData.team_owner_email = userData.teamOwnerEmail;
            if (userData.memberRole !== undefined) updateData.member_role = userData.memberRole;
            
            console.log('📤 Campos a actualizar:', updateData);
            
            const response = await fetch(`${this.apiBase}/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error actualizando usuario');
            }

            const data = await response.json();
            console.log('✅ Usuario actualizado en Neon');
            
            return {
                success: true,
                user: this.transformUser(data)
            };

        } catch (error) {
            console.error('❌ Error actualizando usuario en Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async updatePassword(userId, newPassword) {
        try {
            console.log('🔐 Actualizando contraseña en Neon:', userId);
            
            const response = await fetch(`${this.apiBase}/users/${userId}/password`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    password_hash: newPassword
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error actualizando contraseña');
            }

            console.log('✅ Contraseña actualizada en Neon');
            return { success: true };

        } catch (error) {
            console.error('❌ Error actualizando contraseña en Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async updateLastLogin(userId) {
        try {
            const response = await fetch(`${this.apiBase}/users/${userId}/last-login`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn('⚠️ No se pudo actualizar last_login');
                return { success: true }; // No fallar si esto falla
            }

            console.log('✅ Última sesión actualizada en Neon');
            return { success: true };

        } catch (error) {
            console.warn('⚠️ Error actualizando última sesión (continuando):', error);
            return { success: true };
        }
    }

    async deleteUser(userId) {
        try {
            console.log('🗑️ Eliminando usuario de Neon:', userId);
            
            const response = await fetch(`${this.apiBase}/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error eliminando usuario');
            }

            console.log('✅ Usuario eliminado de Neon');
            return { success: true };

        } catch (error) {
            console.error('❌ Error eliminando usuario de Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getAllUsers(options = {}) {
        try {
            console.log('📋 Obteniendo todos los usuarios de Neon...');
            
            const params = new URLSearchParams();
            if (options.maxRecords) params.append('limit', options.maxRecords);
            if (options.role) params.append('role', options.role);
            if (options.status) params.append('status', options.status);
            
            const url = `${this.apiBase}/users${params.toString() ? '?' + params.toString() : ''}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error obteniendo usuarios');
            }

            const data = await response.json();
            const users = (data.users || data).map(user => this.transformUser(user));
            
            console.log(`✅ ${users.length} usuarios obtenidos de Neon`);
            
            return {
                success: true,
                users
            };

        } catch (error) {
            console.error('❌ Error obteniendo usuarios de Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== MÉTODOS DE TRANSFORMACIÓN =====

    transformUser(data) {
        if (!data) {
            console.error('❌ Datos inválidos:', data);
            return null;
        }

        const fullName = data.last_name 
            ? `${data.first_name || ''} ${data.last_name || ''}`.trim() 
            : (data.first_name || '');

        return {
            id: data.id,
            email: data.email || '',
            name: fullName || data.name || '',
            firstName: data.first_name || '',
            lastName: data.last_name || '',
            company: data.empresa || data.company || '',
            password: data.password_hash || data.password || '',
            role: data.role || 'user',
            status: data.status || 'active',
            profileImage: data.profile_image || data.profileImage || '',
            createdAt: data.created_at || data.createdAt || '',
            lastLogin: data.last_login || data.lastLogin || '',
            hasPaid: data.has_paid || false,
            token_api: data.token_api || '',
            stripeCustomerId: data.stripe_customer_id || '',
            isTeamMember: data.is_team_member || false,
            teamOwnerEmail: data.team_owner_email || '',
            memberRole: data.member_role || '',
            createdTime: data.created_at || data.createdTime
        };
    }

    // ===== MÉTODOS DE UTILIDAD =====

    verifyPassword(storedPassword, providedPassword) {
        // Nota: En producción, usar bcrypt para comparar hashes
        // Por ahora, comparación simple
        return storedPassword === providedPassword;
    }

    // ===== MÉTODOS DE EQUIPO =====

    async getTeamMembers(ownerEmail) {
        try {
            if (!ownerEmail) throw new Error('ownerEmail es requerido');
            
            const response = await fetch(`${this.apiBase}/users/team/${encodeURIComponent(ownerEmail)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error obteniendo miembros del equipo');
            }

            const data = await response.json();
            const members = (data.members || data).map(user => this.transformUser(user));
            
            return { success: true, members };
        } catch (error) {
            console.error('❌ Error getTeamMembers:', error);
            return { success: false, error: error.message, members: [] };
        }
    }

    async addTeamMember(ownerEmail, memberData) {
        try {
            if (!ownerEmail) throw new Error('ownerEmail es requerido');
            if (!memberData?.email) throw new Error('email del miembro es requerido');

            const result = await this.createUser({
                email: memberData.email,
                name: memberData.name,
                firstName: memberData.firstName,
                lastName: memberData.lastName,
                role: 'user',
                status: 'active',
                isTeamMember: true,
                teamOwnerEmail: ownerEmail,
                memberRole: memberData.role || 'agent'
            });
            
            if (!result.success) throw new Error(result.error || 'No se pudo crear miembro');
            return { success: true, member: result.user };
        } catch (error) {
            console.error('❌ Error addTeamMember:', error);
            return { success: false, error: error.message };
        }
    }

    async removeTeamMember(userId) {
        try {
            if (!userId) throw new Error('userId es requerido');
            const result = await this.deleteUser(userId);
            return result;
        } catch (error) {
            console.error('❌ Error removeTeamMember:', error);
            return { success: false, error: error.message };
        }
    }

    // ===== MÉTODOS DE PROSPECTOS =====

    async createProspect(prospectData) {
        try {
            console.log('📝 Creando prospecto en Neon:', prospectData.nombre);
            
            // Obtener información del usuario/workspace actual
            let userEmail = null;
            let workspaceId = null;
            let userId = null;
            
            try {
                if (window.authService && window.authService.getCurrentUser) {
                    const currentUser = window.authService.getCurrentUser();
                    if (currentUser) {
                        userEmail = currentUser.email;
                        userId = currentUser.id;
                        console.log('👤 Usuario actual para prospecto:', userEmail);
                    }
                }
                
                if (window.dashboard && window.dashboard.dataService) {
                    const workspaces = await window.dashboard.dataService.getWorkspaces();
                    if (workspaces.success && workspaces.data && workspaces.data.length > 0) {
                        workspaceId = workspaces.data[0].id;
                        console.log('🏢 Workspace ID para prospecto:', workspaceId);
                    }
                }
            } catch (error) {
                console.warn('⚠️ No se pudo obtener información de usuario/workspace:', error);
            }
            
            const payload = {
                nombre: prospectData.nombre || '',
                chat_id: prospectData.chatId || '',
                fecha_extraccion: prospectData.fechaExtraccion || new Date().toISOString(),
                user_email: userEmail,
                workspace_id: workspaceId,
                user_id: userId
            };

            // Agregar campos opcionales
            if (prospectData.imagenesUrls && Array.isArray(prospectData.imagenesUrls) && prospectData.imagenesUrls.length > 0) {
                payload.imagenes_urls = JSON.stringify(prospectData.imagenesUrls);
            }
            
            if (prospectData.documentosUrls && Array.isArray(prospectData.documentosUrls) && prospectData.documentosUrls.length > 0) {
                payload.documentos_urls = JSON.stringify(prospectData.documentosUrls);
            }

            const response = await fetch(`${this.apiBase}/prospectos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error creando prospecto');
            }

            const data = await response.json();
            console.log('✅ Prospecto creado en Neon:', data.id);
            
            return {
                success: true,
                prospect: this.transformProspect(data)
            };

        } catch (error) {
            console.error('❌ Error creando prospecto en Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createProspectsBatch(prospectsData) {
        try {
            if (!Array.isArray(prospectsData) || prospectsData.length === 0) {
                return {
                    success: true,
                    created: [],
                    errors: [],
                    total: 0
                };
            }
            
            console.log(`📦 Creando ${prospectsData.length} prospectos en Neon...`);
            
            // Obtener información del usuario/workspace una sola vez
            let userEmail = null;
            let workspaceId = null;
            let userId = null;
            
            try {
                if (window.authService && window.authService.getCurrentUser) {
                    const currentUser = window.authService.getCurrentUser();
                    if (currentUser) {
                        userEmail = currentUser.email;
                        userId = currentUser.id;
                    }
                }
                
                if (window.dashboard && window.dashboard.dataService) {
                    const workspaces = await window.dashboard.dataService.getWorkspaces();
                    if (workspaces.success && workspaces.data && workspaces.data.length > 0) {
                        workspaceId = workspaces.data[0].id;
                    }
                }
            } catch (error) {
                console.warn('⚠️ No se pudo obtener información de usuario/workspace:', error);
            }
            
            // Validar que todos los prospectos tengan los campos requeridos ANTES de procesar
            const invalidProspects = [];
            const validProspectsData = [];
            
            prospectsData.forEach((prospectData, index) => {
                const nombre = prospectData.nombre || '';
                const chatId = prospectData.chatId || '';
                
                if (!nombre || nombre.trim() === '' || !chatId || chatId.trim() === '') {
                    console.error(`❌ Prospecto ${index + 1} inválido:`, {
                        nombre: nombre || 'FALTA',
                        chatId: chatId || 'FALTA',
                        prospectData: prospectData
                    });
                    invalidProspects.push({ index, prospectData, reason: `nombre: ${nombre ? 'OK' : 'FALTA'}, chatId: ${chatId ? 'OK' : 'FALTA'}` });
                } else {
                    validProspectsData.push(prospectData);
                }
            });
            
            if (invalidProspects.length > 0) {
                console.error(`❌ ${invalidProspects.length} prospectos inválidos encontrados, solo se procesarán ${validProspectsData.length} válidos`);
            }
            
            if (validProspectsData.length === 0) {
                return {
                    success: false,
                    created: [],
                    errors: invalidProspects.map(inv => ({ prospect: inv.prospectData, error: `Campo requerido faltante: ${inv.reason}` })),
                    total: prospectsData.length,
                    createdCount: 0,
                    errorCount: invalidProspects.length
                };
            }
            
            // Preparar records de forma similar a Airtable - campos básicos siempre presentes
            const records = validProspectsData.map((prospectData) => {
                // Campos básicos requeridos (como en Airtable)
                const record = {
                    nombre: String(prospectData.nombre || '').trim(),
                    chat_id: String(prospectData.chatId || '').trim(),
                    fecha_extraccion: prospectData.fechaExtraccion || new Date().toISOString()
                };
                
                // Campos de asociación (si existen)
                if (userEmail) record.user_email = userEmail;
                if (workspaceId) record.workspace_id = workspaceId;
                if (userId) record.user_id = userId;
                
                // Campos opcionales (solo agregar si existen y tienen valor)
                if (prospectData.telefono) record.telefono = String(prospectData.telefono).trim();
                if (prospectData.canal) record.canal = String(prospectData.canal).trim();
                if (prospectData.fechaUltimoMensaje) record.fecha_ultimo_mensaje = prospectData.fechaUltimoMensaje;
                if (prospectData.estado) record.estado = String(prospectData.estado).trim();
                if (prospectData.agenteId) record.agente_id = String(prospectData.agenteId).trim();
                if (prospectData.notas) record.notas = String(prospectData.notas).trim();
                if (prospectData.comentarios) record.comentarios = String(prospectData.comentarios).trim();
                
                // Arrays que deben ser JSON strings (solo si tienen elementos)
                if (prospectData.imagenesUrls && Array.isArray(prospectData.imagenesUrls) && prospectData.imagenesUrls.length > 0) {
                    record.imagenes_urls = JSON.stringify(prospectData.imagenesUrls);
                }
                if (prospectData.documentosUrls && Array.isArray(prospectData.documentosUrls) && prospectData.documentosUrls.length > 0) {
                    record.documentos_urls = JSON.stringify(prospectData.documentosUrls);
                }
                if (prospectData.camposSolicitados) {
                    record.campos_solicitados = typeof prospectData.camposSolicitados === 'string' 
                        ? prospectData.camposSolicitados 
                        : JSON.stringify(prospectData.camposSolicitados);
                }
                
                return record;
            });
            
            // Si después de filtrar no hay registros válidos, retornar error
            if (records.length === 0) {
                return {
                    success: false,
                    created: [],
                    errors: invalidProspects.map(inv => ({ prospect: inv.prospectData, error: `Campo requerido faltante: ${inv.reason}` })),
                    total: prospectsData.length,
                    createdCount: 0,
                    errorCount: prospectsData.length
                };
            }
            
            console.log(`✅ ${records.length} registros válidos preparados para batch (${invalidProspects.length} inválidos descartados)`);
            
            // Log del primer registro para debug
            if (records.length > 0) {
                console.log('🔍 Primer registro a enviar:', {
                    nombre: records[0].nombre,
                    chat_id: records[0].chat_id,
                    tieneNombre: !!records[0].nombre,
                    tieneChatId: !!records[0].chat_id,
                    imagenes_urls: records[0].imagenes_urls ? (typeof records[0].imagenes_urls === 'string' ? 'JSON string' : 'array/object') : 'null/undefined',
                    documentos_urls: records[0].documentos_urls ? (typeof records[0].documentos_urls === 'string' ? 'JSON string' : 'array/object') : 'null/undefined',
                    registroCompleto: records[0]
                });
                
                // Mostrar ejemplo de URL de imagen si existe
                if (records[0].imagenes_urls) {
                    try {
                        const imgUrls = typeof records[0].imagenes_urls === 'string' 
                            ? JSON.parse(records[0].imagenes_urls) 
                            : records[0].imagenes_urls;
                        if (Array.isArray(imgUrls) && imgUrls.length > 0) {
                            console.log('📷 Ejemplo de URL de imagen:', imgUrls[0]);
                        }
                    } catch (e) {
                        console.warn('⚠️ Error parseando imagenes_urls para log:', e);
                    }
                }
            }
            
            const response = await fetch(`${this.apiBase}/prospectos/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ records })
            });

            if (!response.ok) {
                let errorMessage = 'Error creando prospectos';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                    console.error('❌ Error respuesta del servidor:', errorData);
                } catch (e) {
                    // Si no se puede parsear el error, usar el status
                    errorMessage = `Error ${response.status}: ${response.statusText}`;
                    console.error('❌ Error HTTP:', response.status, response.statusText);
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const created = (data.prospects || data.created || []).map(p => this.transformProspect(p));
            
            console.log(`✅ Batch completado: ${created.length} creados`);
            
            return {
                success: true,
                created: created,
                errors: data.errors || [],
                total: prospectsData.length,
                createdCount: created.length,
                errorCount: data.errors?.length || 0
            };
            
        } catch (error) {
            console.error('❌ Error en createProspectsBatch:', error);
            return {
                success: false,
                created: [],
                errors: prospectsData.map(p => ({ prospect: p, error: error.message })),
                total: prospectsData.length,
                createdCount: 0,
                errorCount: prospectsData.length
            };
        }
    }

    async getAllProspects(options = {}) {
        try {
            console.log('🔍 Obteniendo prospectos de Neon...');
            
            // Obtener información del usuario/workspace actual para filtrar
            let userEmail = null;
            let workspaceId = null;
            let userId = null;
            
            try {
                if (window.authService && window.authService.getCurrentUser) {
                    const currentUser = window.authService.getCurrentUser();
                    if (currentUser) {
                        userEmail = currentUser.email;
                        userId = currentUser.id;
                        console.log('👤 Filtrando por usuario:', userEmail);
                    }
                }
                
                if (window.dashboard && window.dashboard.dataService) {
                    const workspaces = await window.dashboard.dataService.getWorkspaces();
                    if (workspaces.success && workspaces.data && workspaces.data.length > 0) {
                        workspaceId = workspaces.data[0].id;
                        console.log('🏢 Filtrando por workspace:', workspaceId);
                    }
                }
            } catch (error) {
                console.warn('⚠️ No se pudo obtener información de usuario/workspace para filtrar:', error);
            }
            
            const params = new URLSearchParams();
            if (userEmail && !options.includeAll) params.append('user_email', userEmail);
            if (workspaceId && !options.includeAll) params.append('workspace_id', workspaceId);
            if (userId && !options.includeAll) params.append('user_id', userId);
            if (options.maxRecords) params.append('limit', options.maxRecords);
            if (options.pageSize) params.append('page_size', options.pageSize);
            
            const url = `${this.apiBase}/prospectos${params.toString() ? '?' + params.toString() : ''}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error obteniendo prospectos');
            }

            const data = await response.json();
            const prospects = (data.prospectos || data.data || []).map(record => this.transformProspect(record));

            console.log(`✅ ${prospects.length} prospectos obtenidos de Neon`);
            
            return {
                success: true,
                data: prospects,
                total: prospects.length,
                source: 'neon',
                filtered: !!(userEmail || workspaceId || userId)
            };

        } catch (error) {
            console.error('❌ Error obteniendo prospectos de Neon:', error);
            return {
                success: false,
                error: error.message,
                data: [],
                source: 'neon'
            };
        }
    }

    async getProspectByChatId(chatId) {
        try {
            console.log('🔍 Buscando prospecto por chat_id:', chatId);
            
            const response = await fetch(`${this.apiBase}/prospectos/chat/${encodeURIComponent(chatId)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    // 404 no es un error crítico - simplemente significa que no existe
                    return {
                        success: false,
                        prospect: null,
                        notFound: true
                    };
                }
                // Para otros errores, intentar obtener el mensaje de error
                let errorMessage = 'Error obteniendo prospecto';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Error ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const prospect = this.transformProspect(data);
            
            console.log('✅ Prospecto encontrado:', {
                id: prospect.id,
                nombre: prospect.nombre,
                chatId: prospect.chatId
            });
            
            return {
                success: true,
                prospect: prospect
            };

        } catch (error) {
            console.error('❌ Error buscando prospecto por chat_id:', error);
            return {
                success: false,
                error: error.message,
                prospect: null
            };
        }
    }

    async getProspectById(recordId) {
        try {
            console.log('🔍 Obteniendo prospecto por ID:', recordId);
            
            const response = await fetch(`${this.apiBase}/prospectos/${recordId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error obteniendo prospecto');
            }

            const data = await response.json();
            const prospect = this.transformProspect(data);
            
            return {
                success: true,
                prospect: prospect
            };

        } catch (error) {
            console.error('❌ Error obteniendo prospecto por ID:', error);
            return {
                success: false,
                error: error.message,
                prospect: null
            };
        }
    }

    async updateProspect(recordId, prospectData) {
        try {
            console.log('📝 Actualizando prospecto en Neon:', recordId);
            
            const updateData = {};
            if (prospectData.nombre !== undefined) updateData.nombre = prospectData.nombre;
            if (prospectData.chatId !== undefined) updateData.chat_id = prospectData.chatId;
            if (prospectData.fechaExtraccion !== undefined) updateData.fecha_extraccion = prospectData.fechaExtraccion;
            
            if (prospectData.imagenesUrls !== undefined) {
                if (Array.isArray(prospectData.imagenesUrls) && prospectData.imagenesUrls.length > 0) {
                    updateData.imagenes_urls = JSON.stringify(prospectData.imagenesUrls);
                } else {
                    updateData.imagenes_urls = null;
                }
            }
            
            if (prospectData.documentosUrls !== undefined) {
                if (Array.isArray(prospectData.documentosUrls) && prospectData.documentosUrls.length > 0) {
                    updateData.documentos_urls = JSON.stringify(prospectData.documentosUrls);
                } else {
                    updateData.documentos_urls = null;
                }
            }
            
            if (prospectData.comentarios !== undefined) {
                updateData.comentarios = prospectData.comentarios || '';
            }
            
            if (prospectData.campos_solicitados !== undefined) {
                if (typeof prospectData.campos_solicitados === 'string') {
                    updateData.campos_solicitados = prospectData.campos_solicitados;
                } else if (typeof prospectData.campos_solicitados === 'object') {
                    updateData.campos_solicitados = JSON.stringify(prospectData.campos_solicitados);
                }
            }

            const response = await fetch(`${this.apiBase}/prospectos/${recordId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error actualizando prospecto');
            }

            const data = await response.json();
            console.log('✅ Prospecto actualizado:', data.id);
            
            return {
                success: true,
                prospect: this.transformProspect(data)
            };

        } catch (error) {
            console.error('❌ Error actualizando prospecto:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    transformProspect(data) {
        if (!data) {
            console.error('❌ Datos inválidos:', data);
            return null;
        }

        // Parsear URLs de imágenes y documentos
        let imagenesUrls = [];
        let documentosUrls = [];
        
        try {
            if (data.imagenes_urls) {
                imagenesUrls = typeof data.imagenes_urls === 'string' 
                    ? JSON.parse(data.imagenes_urls) 
                    : data.imagenes_urls;
            }
            if (data.documentos_urls) {
                documentosUrls = typeof data.documentos_urls === 'string' 
                    ? JSON.parse(data.documentos_urls) 
                    : data.documentos_urls;
            }
        } catch (e) {
            console.warn('⚠️ Error parseando URLs:', e);
        }
        
        // Parsear campos_solicitados
        let camposSolicitados = null;
        if (data.campos_solicitados) {
            try {
                camposSolicitados = typeof data.campos_solicitados === 'string'
                    ? JSON.parse(data.campos_solicitados)
                    : data.campos_solicitados;
            } catch (e) {
                console.warn('⚠️ Error parseando campos_solicitados:', e);
                camposSolicitados = data.campos_solicitados;
            }
        }

        return {
            id: data.id,
            nombre: data.nombre || '',
            chatId: data.chat_id || '',
            campos_solicitados: camposSolicitados,
            telefono: data.telefono || '',
            canal: data.canal || '',
            fechaExtraccion: data.fecha_extraccion || '',
            fechaUltimoMensaje: data.fecha_ultimo_mensaje || '',
            estado: data.estado || 'Nuevo',
            imagenesUrls: imagenesUrls,
            documentosUrls: documentosUrls,
            agenteId: data.agente_id || '',
            notas: data.notas || '',
            comentarios: data.comentarios || '',
            createdTime: data.created_at || data.createdTime
        };
    }

    // ===== MÉTODOS DE WORKSPACES =====

    async createWorkspace(workspaceData) {
        try {
            console.log('📝 Creando workspace en Neon:', workspaceData.name);
            
            const response = await fetch(`${this.apiBase}/workspaces`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workspace_id: workspaceData.workspaceId || workspaceData.id,
                    name: workspaceData.name,
                    user_id: workspaceData.userId,
                    credits: workspaceData.credits || 0,
                    status: workspaceData.status || 'active'
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error creando workspace');
            }

            const data = await response.json();
            console.log('✅ Workspace creado en Neon:', data.id);
            
            return {
                success: true,
                workspace: data
            };

        } catch (error) {
            console.error('❌ Error creando workspace en Neon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getWorkspaceByWorkspaceId(workspaceId) {
        try {
            const response = await fetch(`${this.apiBase}/workspaces/workspace/${encodeURIComponent(workspaceId)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        success: false,
                        error: 'Workspace no encontrado'
                    };
                }
                const error = await response.json();
                throw new Error(error.message || 'Error obteniendo workspace');
            }

            const data = await response.json();
            return {
                success: true,
                workspace: data
            };

        } catch (error) {
            console.error('❌ Error obteniendo workspace:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getWorkspacesByUserId(userId) {
        try {
            const response = await fetch(`${this.apiBase}/workspaces/user/${userId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Error obteniendo workspaces');
            }

            const data = await response.json();
            return {
                success: true,
                workspaces: data.workspaces || data
            };

        } catch (error) {
            console.error('❌ Error obteniendo workspaces:', error);
            return {
                success: false,
                error: error.message,
                workspaces: []
            };
        }
    }
}

// Crear instancia global
window.neonService = new NeonService();

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeonService;
}

