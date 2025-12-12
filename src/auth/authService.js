class AuthService {
    constructor() {
        this.apiBase = '/api/auth';
        this.currentUser = null;
        this.token = null;
        this.useNeon = true; // Flag para usar Neon o datos mock
        this.init();
    }

    init() {
        console.log('🔧 Inicializando AuthService...');
        
        // Siempre usar Neon si está disponible
        // Esperar un poco para que neonService se cargue
        setTimeout(() => {
            if (window.neonService) {
                this.useNeon = true;
                console.log('✅ NeonService disponible, usando Neon');
            } else {
                console.warn('⚠️ NeonService no está disponible aún, se intentará usar Neon cuando esté disponible');
                // No desactivar useNeon, solo advertir
            }
        }, 500);

        // Cargar datos de autenticación desde localStorage
        this.loadAuthData();
        
        console.log('📊 Estado después de cargar datos:', {
            hasUser: !!this.currentUser,
            userId: this.currentUser?.id,
            hasToken: !!this.token
        });
        
        // NO validar token automáticamente al iniciar para evitar redirecciones
        // La validación se hará cuando sea necesario (ej: al hacer peticiones a la API)
        // Si el token es inválido, la API lo indicará y entonces se limpiará
        console.log('✅ AuthService inicializado');
    }

    // Método mantenido por compatibilidad, pero ya no es necesario con Neon
    setAirtableApiKey(apiKey) {
        console.warn('⚠️ setAirtableApiKey está deprecado. Usando Neon directamente.');
        // No hacer nada, Neon no requiere API key en el frontend
    }

    // ===== MÉTODOS DE AUTENTICACIÓN =====

    async login(email, password, rememberMe = false) {
        try {
            console.log('🔐 Iniciando proceso de login...');
            
            let user, token;
            
            if (this.useNeon && window.neonService) {
                // === AUTENTICACIÓN CON NEON ===
                console.log('🗄️ Autenticando con Neon...');
                console.log('📧 Email:', email);
                console.log('🔐 Password length:', password ? password.length : 0);
                
                // Buscar usuario en Neon
                const result = await window.neonService.getUserByEmail(email);
                
                console.log('📊 Resultado de búsqueda:', result);
                
                if (!result.success) {
                    console.error('❌ Error en búsqueda de usuario:', result.error);
                    throw new Error(result.error || 'Error de conexión con el servidor');
                }
                
                if (!result.user) {
                    console.error('❌ Usuario no encontrado en Neon');
                    throw new Error('Usuario no encontrado');
                }
                
                user = result.user;
                console.log('👤 Usuario encontrado:', {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    hasPassword: !!user.password,
                    passwordLength: user.password ? user.password.length : 0
                });
                
                // Verificar contraseña
                const passwordMatch = window.neonService.verifyPassword(user.password, password);
                console.log('🔐 Verificación de contraseña:', passwordMatch ? 'CORRECTA ✓' : 'INCORRECTA ✗');
                
                if (!passwordMatch) {
                    console.error('❌ Contraseña incorrecta');
                    throw new Error('Contraseña incorrecta');
                }
                
                // Actualizar última sesión en Neon
                await window.neonService.updateLastLogin(user.id);
                
                // Generar token (usar el ID de Neon)
                token = this.generateToken(user);
                
            } else {
                // === AUTENTICACIÓN CON DATOS MOCK ===
                console.log('🧪 Autenticando con datos mock...');
                
                // Simular delay de API
                await window.mockAuthData.simulateApiDelay(1000);
                
                // Buscar usuario en datos mock
                user = window.mockAuthData.findUserByEmail(email);
                
                if (!user) {
                    throw new Error('Credenciales inválidas');
                }
                
                if (!window.mockAuthData.verifyPassword(user, password)) {
                    throw new Error('Credenciales inválidas');
                }
                
                // Generar token mock
                token = window.mockAuthData.generateMockToken(user);
            }
            
            // Preparar datos del usuario (sin contraseña)
            const userData = { ...user };
            delete userData.password;

            // Guardar datos de autenticación
            this.currentUser = userData;
            this.token = token;
            
            // Guardar en localStorage
            this.saveAuthData(rememberMe);
            
            console.log('✅ Login exitoso:', this.currentUser.email);
            return { success: true, user: this.currentUser };

        } catch (error) {
            console.error('❌ Error en login:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }

    generateToken(user) {
        // Generar un token simple basado en el ID del usuario y timestamp
        const payload = {
            userId: user.id,
            email: user.email,
            timestamp: Date.now()
        };
        // En producción, usar JWT
        return btoa(JSON.stringify(payload));
    }

    async logout() {
        try {
            console.log('🔐 Cerrando sesión...');
            
            // Notificar al servidor sobre el logout
            if (this.token) {
                await fetch(`${this.apiBase}/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }

            // Limpiar datos locales
            this.clearAuthData();
            
            console.log('✅ Logout exitoso');
            return { success: true };

        } catch (error) {
            console.error('❌ Error en logout:', error);
            // Limpiar datos locales aunque falle el logout en el servidor
            this.clearAuthData();
            return { success: true };
        }
    }

    async register(userData) {
        try {
            console.log('📝 Registrando nuevo usuario...');
            
            const response = await fetch(`${this.apiBase}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...userData,
                    email: userData.email.toLowerCase().trim()
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error en el registro');
            }

            console.log('✅ Registro exitoso');
            return { success: true, user: data.user };

        } catch (error) {
            console.error('❌ Error en registro:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }

    async changePassword(currentPassword, newPassword) {
        try {
            console.log('🔐 Cambiando contraseña...');
            
            if (this.useNeon && window.neonService && this.currentUser.email) {
                // === CAMBIAR CONTRASEÑA EN NEON ===
                console.log('🗄️ Cambiando contraseña en Neon...');
                console.log('📧 Email del usuario:', this.currentUser.email);
                
                // Buscar usuario por email
                const userResult = await window.neonService.getUserByEmail(this.currentUser.email);
                
                if (!userResult.success || !userResult.user) {
                    throw new Error('No se pudo encontrar el usuario en Neon');
                }
                
                const userId = userResult.user.id;
                console.log('🆔 ID encontrado:', userId);
                
                // Verificar contraseña actual
                if (!window.neonService.verifyPassword(userResult.user.password, currentPassword)) {
                    throw new Error('Contraseña actual incorrecta');
                }
                
                // Actualizar la contraseña
                const result = await window.neonService.updatePassword(userId, newPassword);
                
                if (!result.success) {
                    throw new Error(result.error || 'Error al cambiar contraseña');
                }
                
                console.log('✅ Contraseña cambiada en Neon');
                return { success: true };
                
            } else {
                // === CAMBIAR CONTRASEÑA CON API TRADICIONAL ===
                const response = await fetch(`${this.apiBase}/change-password`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        currentPassword,
                        newPassword
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Error al cambiar contraseña');
                }

                console.log('✅ Contraseña cambiada exitosamente');
                return { success: true };
            }

        } catch (error) {
            console.error('❌ Error al cambiar contraseña:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }

    async updateProfile(profileData) {
        try {
            console.log('👤 Actualizando perfil...');
            console.log('📊 Datos del perfil a actualizar:', profileData);
            
            if (this.useNeon && window.neonService) {
                // === ACTUALIZAR EN NEON ===
                console.log('🗄️ Actualizando perfil en Neon...');
                
                // Obtener email del profileData (que viene del formulario)
                const userEmail = profileData.email;
                
                if (!userEmail) {
                    throw new Error('Email no disponible');
                }
                
                console.log('📧 Email del usuario:', userEmail);
                
                // Buscar usuario por email
                const userResult = await window.neonService.getUserByEmail(userEmail);
                
                if (!userResult.success || !userResult.user) {
                    throw new Error('No se pudo encontrar el usuario en Neon');
                }
                
                const userId = userResult.user.id;
                console.log('🆔 ID encontrado:', userId);
                
                // Actualizar usuario con el ID encontrado
                const result = await window.neonService.updateUser(userId, profileData);
                
                if (!result.success) {
                    throw new Error(result.error || 'Error al actualizar perfil');
                }
                
                // Actualizar datos locales con los datos de Neon
                const updatedUser = { ...result.user };
                delete updatedUser.password;
                
                this.currentUser = updatedUser;
                this.saveAuthData();
                
                console.log('✅ Perfil actualizado en Neon');
                console.log('👤 Usuario actualizado en authService:', this.currentUser);
                return { success: true, user: this.currentUser };
                
            } else {
                // === ACTUALIZAR CON API TRADICIONAL ===
                const response = await fetch(`${this.apiBase}/profile`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(profileData)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Error al actualizar perfil');
                }

                // Actualizar datos locales
                this.currentUser = { ...this.currentUser, ...data.user };
                this.saveAuthData();
                
                console.log('✅ Perfil actualizado exitosamente');
                return { success: true, user: this.currentUser };
            }

        } catch (error) {
            console.error('❌ Error al actualizar perfil:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }

    async forgotPassword(email) {
        try {
            console.log('🔐 Enviando email de recuperación...');
            
            const response = await fetch(`${this.apiBase}/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email.toLowerCase().trim()
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error al enviar email');
            }

            console.log('✅ Email de recuperación enviado');
            return { success: true };

        } catch (error) {
            console.error('❌ Error al enviar email:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }

    async validateToken() {
        try {
            if (!this.token) return false;
            // En modo mock no validamos contra la API, asumimos válido si no ha expirado
            if (!this.useNeon) {
                return true;
            }

            // NO validar contra endpoint que probablemente no existe
            // En modo Neon, si hay token y usuario en localStorage, asumimos válido
            // La validación real se hará cuando se hagan peticiones a la API
            if (this.currentUser && this.token) {
                console.log('✅ Token y usuario presentes, asumiendo válido');
                return true;
            }

            return false;

        } catch (error) {
            console.error('❌ Error validando token:', error);
            // NO limpiar datos automáticamente - dejar que la API lo haga si es necesario
            return false;
        }
    }

    // ===== MÉTODOS DE GESTIÓN DE DATOS =====

    saveAuthData(rememberMe = true) {
        if (!this.currentUser || !this.token) {
            console.error('❌ No se pueden guardar datos de autenticación: faltan usuario o token');
            return;
        }
        
        const authData = {
            user: this.currentUser,
            token: this.token,
            timestamp: Date.now(),
            rememberMe: rememberMe // Guardar el estado de rememberMe para saber la duración
        };

        console.log('💾 Guardando datos de autenticación:', {
            hasUser: !!authData.user,
            userId: authData.user?.id,
            userEmail: authData.user?.email,
            rememberMe: rememberMe,
            storage: 'localStorage (persistente)',
            duration: rememberMe ? '30 días' : '7 días'
        });

        try {
            // Siempre usar localStorage para persistencia entre recargas
            // Si rememberMe es true, la sesión durará 30 días, si es false durará 7 días
            const authDataString = JSON.stringify(authData);
            localStorage.setItem('authData', authDataString);
            
            // También guardar en sessionStorage como respaldo
            sessionStorage.setItem('authData', authDataString);
            
            // Verificar que se guardó correctamente
            const saved = localStorage.getItem('authData');
            if (saved) {
                console.log('✅ Datos guardados correctamente en localStorage');
            } else {
                console.error('❌ Error: Los datos no se guardaron en localStorage');
            }
        } catch (error) {
            console.error('❌ Error guardando datos de autenticación:', error);
        }
    }

    loadAuthData() {
        console.log('🔄 Cargando datos de autenticación...');
        
        // Intentar cargar desde localStorage primero
        let authData = localStorage.getItem('authData');
        let storageSource = 'localStorage';
        
        if (!authData) {
            // Si no hay en localStorage, intentar desde sessionStorage
            authData = sessionStorage.getItem('authData');
            storageSource = 'sessionStorage';
        }

        console.log('🔍 Verificando storage:', {
            hasLocalStorage: !!localStorage.getItem('authData'),
            hasSessionStorage: !!sessionStorage.getItem('authData'),
            source: storageSource
        });

        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                this.currentUser = parsed.user;
                this.token = parsed.token;

                console.log('📂 Datos cargados desde storage:', {
                    source: storageSource,
                    user: this.currentUser,
                    hasId: !!this.currentUser?.id,
                    userId: this.currentUser?.id,
                    hasToken: !!this.token,
                    tokenLength: this.token ? this.token.length : 0
                });

                // Verificar si el token no ha expirado
                const tokenAge = Date.now() - parsed.timestamp;
                // Si rememberMe es true, usar 30 días, si es false usar 7 días
                const rememberMe = parsed.rememberMe !== false; // Por defecto true si no está definido
                const maxAge = rememberMe ? (30 * 24 * 60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000); // 30 días o 7 días

                if (tokenAge > maxAge) {
                    console.log('⚠️ Token expirado, limpiando datos');
                    this.clearAuthData();
                } else {
                    const daysOld = Math.floor(tokenAge / (24 * 60 * 60 * 1000));
                    const maxDays = Math.floor(maxAge / (24 * 60 * 60 * 1000));
                    console.log(`✅ Token válido (edad: ${daysOld} días, máximo: ${maxDays} días, tipo: ${rememberMe ? 'persistente' : 'temporal'})`);
                }
            } catch (error) {
                console.error('❌ Error cargando datos de auth:', error);
                this.clearAuthData();
            }
        } else {
            console.log('⚠️ No hay datos de autenticación en storage');
            console.log('🔍 Verificando localStorage:', {
                hasAuthData: !!localStorage.getItem('authData'),
                allKeys: Object.keys(localStorage).filter(k => k.includes('auth'))
            });
        }
        
        // Log final del estado
        console.log('📊 Estado final después de loadAuthData:', {
            isAuthenticated: this.isAuthenticated(),
            hasUser: !!this.currentUser,
            hasToken: !!this.token,
            userEmail: this.currentUser?.email
        });
    }

    clearAuthData() {
        this.currentUser = null;
        this.token = null;
        localStorage.removeItem('authData');
        sessionStorage.removeItem('authData');
    }

    // ===== MÉTODOS DE UTILIDAD =====

    isAuthenticated() {
        return !!(this.currentUser && this.token);
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getToken() {
        return this.token;
    }

    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }

    // ===== MÉTODOS DE FACTURACIÓN =====

    async getBillingInfo() {
        try {
            console.log('💳 Obteniendo información de facturación...');
            
            // Simular delay de API
            await window.mockAuthData.simulateApiDelay(500);
            
            // Retornar datos mock
            return { success: true, billing: window.mockAuthData.MOCK_BILLING };

        } catch (error) {
            console.error('❌ Error obteniendo facturación:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }

    async getInvoices(page = 1, limit = 10) {
        try {
            console.log('📄 Obteniendo facturas...');
            
            // Simular delay de API
            await window.mockAuthData.simulateApiDelay(500);
            
            // Calcular paginación
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const invoices = window.mockAuthData.MOCK_INVOICES.slice(startIndex, endIndex);
            
            const pagination = {
                page,
                limit,
                total: window.mockAuthData.MOCK_INVOICES.length,
                totalPages: Math.ceil(window.mockAuthData.MOCK_INVOICES.length / limit)
            };

            return { success: true, invoices, pagination };

        } catch (error) {
            console.error('❌ Error obteniendo facturas:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }

    async updatePaymentMethod(paymentMethod) {
        try {
            console.log('💳 Actualizando método de pago...');
            
            const response = await fetch(`${this.apiBase}/payment-method`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(paymentMethod)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error al actualizar método de pago');
            }

            return { success: true };

        } catch (error) {
            console.error('❌ Error actualizando método de pago:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }
}

// Crear instancia global
window.authService = new AuthService();

// Asegurar que init() se ejecute después de que el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🔄 Re-inicializando AuthService después de DOMContentLoaded...');
        if (window.authService) {
            window.authService.loadAuthData();
            console.log('📊 Estado después de re-cargar:', {
                isAuthenticated: window.authService.isAuthenticated(),
                hasUser: !!window.authService.currentUser,
                hasToken: !!window.authService.token
            });
        }
    });
} else {
    // Si el DOM ya está listo, cargar datos inmediatamente
    console.log('🔄 DOM ya listo, re-cargando datos de autenticación...');
    if (window.authService) {
        window.authService.loadAuthData();
        console.log('📊 Estado después de re-cargar:', {
            isAuthenticated: window.authService.isAuthenticated(),
            hasUser: !!window.authService.currentUser,
            hasToken: !!window.authService.token
        });
    }
}
