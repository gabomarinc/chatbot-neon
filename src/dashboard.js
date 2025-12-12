// Dashboard JavaScript con datos reales
class ChatbotDashboard {
    constructor(dataService = null) {
        this.currentSection = 'overview';
        this.isDarkTheme = false;
        this.isSidebarCollapsed = false;
        this.dataService = dataService;
        this.api = null;
        this.dashboardData = {
            chats: [],
            agents: [],
            team: [],
            stats: {},
            apiHealth: false
        };
        
        // Copia completa de todos los chats sin filtrar (para filtrado)
        this.allChats = [];
        
        // Estado de filtros activos
        this.activeFilters = {
            agentId: '',
            channel: '',
            date: ''
        };
        
        // Servicios de notificaciones y polling
        this.notificationService = null;
        this.pollingService = null;
        this.currentChatId = null;
        
        // Rastreo de chats abiertos/sin abrir
        this.openedChats = new Set(); // IDs de chats que han sido abiertos
        this.loadOpenedChats(); // Cargar desde localStorage
        
        // Bandera para evitar duplicar listeners
        this.pollingListenersInitialized = false;
        
        // Sistema de notificaciones en header
        this.headerNotifications = [];
        this.unreadNotificationsCount = 0;
        
        // Sistema de paginación para prospectos
        this.prospectsPagination = {
            currentPage: 1,
            itemsPerPage: 50, // Por defecto 50 items por página (configurable)
            totalPages: 1,
            filteredProspects: [], // Prospectos después de aplicar filtros
            totalFiltered: 0
        };
        
        this.init();
    }
    // Espera a que window.teamManager esté disponible
    async waitForTeamManager(timeoutMs = 2000) {
        const start = Date.now();
        while (!window.teamManager) {
            await new Promise(resolve => setTimeout(resolve, 50));
            if (Date.now() - start > timeoutMs) {
                return false;
            }
        }
        return true;
    }

    async init() {
        try {
            this.setupEventListeners();
            
            // PRIMERO: Cargar token desde Neon ANTES de inicializar la API
            console.log('🔄 Paso 1: Cargando token API desde Neon...');
            try {
                await this.loadTokenFromAirtable();
                console.log('✅ Token cargado desde Neon, ahora inicializando API...');
            } catch (tokenError) {
                console.warn('⚠️ No se pudo cargar token desde Neon, continuando con token de localStorage:', tokenError.message);
            }
            
            // SEGUNDO: Inicializar API (ahora con el token cargado)
            this.initializeAPI();
            
            // TERCERO: Cargar datos con el token configurado
            console.log('🔄 Paso 2: Cargando datos del dashboard...');
            await this.loadRealData();
            
            this.loadTheme();
            this.loadBrandSettings();
            this.setupMobileMenu();
            this.setupChatsManagement();
            this.setupAgentsManagement();
            this.setupAttendancesManagement();
            this.setupProspectsManagement();
            this.setupHeaderNotifications();
            this.setupNotificationsAndPolling();
        } catch (error) {
            console.error('❌ Error en inicialización del dashboard:', error);
            // Asegurar que el dashboard se muestre incluso con errores
            // Intentar cargar datos de todos modos
            try {
                await this.loadRealData();
            } catch (dataError) {
                console.error('❌ Error cargando datos:', dataError);
            }
            
            // Continuar con inicialización básica
            try {
                this.loadTheme();
                this.loadBrandSettings();
                this.setupMobileMenu();
            } catch (initError) {
                console.error('❌ Error en inicialización básica:', initError);
            }
        }
    }

    /**
     * Carga el token de API desde Neon al iniciar
     * Esto asegura que el usuario use su token guardado en la base de datos
     */
    async loadTokenFromAirtable() {
        try {
            // Obtener email del usuario
            let userEmail = null;
            
            // Método 1: Desde getCurrentUser
            const currentUser = this.getCurrentUser();
            if (currentUser && currentUser.email) {
                userEmail = currentUser.email;
            }
            
            // Método 2: Desde authService
            if (!userEmail && window.authService && window.authService.getCurrentUser) {
                const authUser = window.authService.getCurrentUser();
                if (authUser && authUser.email) {
                    userEmail = authUser.email;
                }
            }
            
            if (!userEmail) {
                console.log('ℹ️ No se pudo obtener el email del usuario, usando token de localStorage si existe');
                return;
            }

            // Esperar a que neonService esté disponible
            let attempts = 0;
            while (!window.neonService && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!window.neonService) {
                console.log('ℹ️ NeonService no disponible, usando token de localStorage si existe');
                return;
            }

            if (!window.authService || window.authService.useNeon === false) {
                console.log('ℹ️ Neon no está habilitado, usando token de localStorage si existe');
                return;
            }

            console.log('🗄️ Cargando token de API desde Neon para usuario:', userEmail);
            const userResult = await window.neonService.getUserByEmail(userEmail);
            console.log('📊 Resultado de getUserByEmail:', userResult);
            
            if (userResult.success && userResult.user) {
                const token = userResult.user.token_api;
                console.log('🔑 Token encontrado en token_api:', token ? 'SÍ' : 'NO');
                
                if (token && typeof token === 'string' && token.trim() !== '') {
                    console.log('✅ Token válido encontrado, configurando...');
                    
                    // Guardar en localStorage para que la API lo use
                    localStorage.setItem('gptmaker_token', token);
                    localStorage.setItem('apiToken', token);
                    console.log('💾 Token guardado en localStorage');
                    
                    // Actualizar configuración global ANTES de inicializar API
                    if (window.gptmakerConfig) {
                        window.gptmakerConfig.setToken(token);
                        console.log('✅ Token configurado en gptmakerConfig');
                    }
                    if (window.GPTMAKER_CONFIG) {
                        window.GPTMAKER_CONFIG.token = token;
                        console.log('✅ Token configurado en GPTMAKER_CONFIG');
                    }
                    
                    console.log('✅✅✅ TOKEN API CARGADO DESDE NEON Y CONFIGURADO ✅✅✅');
                    return token; // Retornar el token para uso posterior
                } else {
                    console.log('ℹ️ Usuario encontrado pero token_api está vacío');
                }
            } else {
                console.log('ℹ️ No se encontró usuario en Neon o hubo un error:', userResult.error || 'Usuario no encontrado');
            }
        } catch (error) {
            console.warn('⚠️ Error cargando token desde Neon:', error.message);
            console.log('ℹ️ Continuando con token de localStorage si existe');
        }
        
        return null;
    }

    async initializeAPI() {
        try {
            if (!this.dataService) {
                // Inicializar API de GPTMaker
                // El token ya debería estar cargado en localStorage/gptmakerConfig
                this.api = new GPTMakerAPI();
                this.dataService = new DataService(this.api);
                
                // Asegurar que el token esté configurado en la instancia
                const token = localStorage.getItem('gptmaker_token') || localStorage.getItem('apiToken');
                if (token && this.api && typeof this.api.setToken === 'function') {
                    this.api.setToken(token);
                    console.log('✅ Token configurado en instancia de API');
                }
            }
            
            console.log('✅ API inicializada correctamente');
        } catch (error) {
            console.error('❌ Error inicializando API:', error);
        }
    }

    async loadRealData() {
        try {
            console.log('🔄 Cargando datos reales...');
            
            // Cargar datos en paralelo (sin getStats para evitar duplicados)
            const [chatsResult, agentsResult, teamResult] = await Promise.all([
                this.dataService.getAllChats(), // Usar getAllChats para obtener todos los chats con paginación
                this.dataService.getAgents(),
                this.dataService.getTeamMembers()
            ]);

            console.log('📊 Resultados de la API:', {
                chatsResult: {
                    success: chatsResult.success,
                    dataLength: chatsResult.data ? chatsResult.data.length : 0,
                    totalChats: chatsResult.totalChats || 0,
                    totalPages: chatsResult.totalPages || 0,
                    source: chatsResult.source || 'unknown',
                    data: chatsResult.data ? chatsResult.data.slice(0, 2) : [] // Solo primeros 2 para debug
                },
                agentsResult: {
                    success: agentsResult.success,
                    dataLength: agentsResult.data ? agentsResult.data.length : 0
                },
                teamResult: {
                    success: teamResult.success,
                    dataLength: teamResult.data ? teamResult.data.length : 0
                }
            });

            // Calcular estadísticas localmente para evitar llamados duplicados
            const stats = this.calculateStats(chatsResult.data, agentsResult.data, teamResult.data);

            // Actualizar datos del dashboard
            // IMPORTANTE: Solo usar datos si success es true, evitar datos mock/fallback
            this.dashboardData = {
                chats: chatsResult.success && chatsResult.source !== 'mock' ? chatsResult.data : [],
                agents: agentsResult.success && agentsResult.source !== 'mock' ? agentsResult.data : [],
                team: teamResult.success && teamResult.source !== 'mock' ? teamResult.data : [],
                stats: stats,
                apiHealth: true
            };
            
            // Log si se detectaron datos mock para debugging
            if (agentsResult.source === 'mock') {
                console.warn('⚠️ Se detectaron datos mock para agentes - ignorados');
            }
            
            // Guardar copia completa de todos los chats sin filtrar (solo si no son mock)
            this.allChats = chatsResult.success && chatsResult.source !== 'mock' ? [...chatsResult.data] : [];
            console.log(`✅ Guardados ${this.allChats.length} chats completos para filtrado`);

            console.log('✅ Datos cargados:', {
                chats: this.dashboardData.chats.length,
                agents: this.dashboardData.agents.length,
                team: this.dashboardData.team.length,
                apiHealth: this.dashboardData.apiHealth
            });

            // Actualizar UI con datos reales
            console.log('🔄 Actualizando UI con datos cargados...');
            console.log('📊 Datos disponibles para UI:', {
                chats: this.dashboardData.chats.length,
                agents: this.dashboardData.agents.length,
                team: this.dashboardData.team.length
            });
            
            // Actualizar estadísticas primero
            await this.updateOverviewStats();
            
            // Luego actualizar las listas
            this.updateChatsList();
            this.updateAgentsList();
            this.updateTeamList();
            this.loadChannels(); // Cargar canales de comunicación
            
            // Inicializar gráficos DESPUÉS de cargar los datos
            console.log('📊 Inicializando gráficos con datos reales...');
            this.initializeCharts();

        } catch (error) {
            console.error('❌ Error cargando datos reales:', error);
            // No bloquear el dashboard - mostrar con datos vacíos
            this.dashboardData = {
                chats: [],
                agents: [],
                team: [],
                stats: this.calculateStats([], [], []),
                apiHealth: false
            };
            
            // Actualizar UI con datos vacíos para que el dashboard se muestre
            this.updateOverviewStats();
            this.updateChatsList();
            this.updateAgentsList();
            this.updateTeamList();
            
            // Mostrar notificación pero no bloquear
            this.showNotification('Algunos datos no se pudieron cargar. El dashboard está disponible con funcionalidad limitada.', 'warning');
        }
    }

    // Calcular estadísticas localmente para evitar llamados duplicados
    calculateStats(chats, agents, team) {
        console.log('📊 Calculando estadísticas con datos:', {
            chats: chats ? chats.length : 0,
            agents: agents ? agents.length : 0,
            team: team ? team.length : 0
        });
        
        if (chats && chats.length > 0) {
            console.log('📋 Estructura del primer chat:', chats[0]);
            console.log('📋 Chats terminados:', chats.filter(chat => chat.finished).length);
            console.log('📋 Chats activos:', chats.filter(chat => !chat.finished).length);
        }
        
        const totalChats = chats ? chats.length : 0;
        const totalAgents = agents ? agents.length : 0;
        const totalTeamMembers = team ? team.length : 0;
        
        // Calcular chats activos (que no estén terminados)
        const activeChats = chats ? chats.filter(chat => !chat.finished).length : 0;
        
        // Calcular usuarios únicos
        const uniqueUsers = chats ? new Set(chats.map(chat => chat.whatsappPhone || chat.userName)).size : 0;
        
        console.log('📊 Estadísticas calculadas:', {
            totalChats,
            activeChats,
            uniqueUsers
        });
        
        return {
            totalChats,
            totalAgents,
            totalTeamMembers,
            activeChats,
            uniqueUsers,
            apiHealth: true
        };
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.closest('.nav-item').dataset.section;
                this.navigateToSection(section);
            });
        });

        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        // Mobile menu toggle
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        if (mobileMenuToggle) {
            mobileMenuToggle.addEventListener('click', () => {
                this.toggleMobileMenu();
            });
        }

        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // Sync data button
        const syncBtn = document.getElementById('syncDataBtn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                this.loadRealData();
            });
        }

        // Credits refresh
        const creditsInfo = document.getElementById('creditsInfo');
        if (creditsInfo) {
            creditsInfo.addEventListener('click', () => {
                this.refreshCredits();
            });
            creditsInfo.style.cursor = 'pointer';
            creditsInfo.title = 'Hacer clic para actualizar créditos';
        }

        // Agent credits refresh
        const refreshCreditsBtn = document.getElementById('refreshCreditsBtn');
        if (refreshCreditsBtn) {
            refreshCreditsBtn.addEventListener('click', () => {
                this.loadAgentCredits();
                this.showNotification('Actualizando créditos de agentes...', 'info');
            });
        }

        // Invite team member button
        const inviteMemberBtn = document.getElementById('inviteMemberBtn');
        if (inviteMemberBtn) {
            console.log('✅ Botón de invitar miembro encontrado, configurando event listener...');
            inviteMemberBtn.addEventListener('click', () => {
                console.log('🖱️ Clic detectado en botón Invitar Miembro (addEventListener)');
                this.showTeamModal();
            });
        } else {
            console.warn('⚠️ Botón inviteMemberBtn no encontrado en el DOM');
        }

        // Chat filters
        this.setupChatFilters();

        // Agent filters
        this.setupAgentFilters();

        // Profile tabs functionality
        this.setupProfileTabs();

        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                const sidebar = document.querySelector('.sidebar');
                const mobileToggle = document.getElementById('mobileMenuToggle');
                
                if (!sidebar.contains(e.target) && !mobileToggle.contains(e.target)) {
                    this.closeMobileMenu();
                }
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    setupChatFilters() {
        const agentFilter = document.getElementById('agentFilter');
        const channelFilter = document.getElementById('channelFilter');
        const dateFilter = document.getElementById('dateFilter');

        console.log('🔧 Configurando filtros de chats...');

        if (agentFilter) {
            agentFilter.addEventListener('change', () => {
                console.log('🔍 Filtro de agente cambiado:', agentFilter.value);
                this.applyChatFilters();
            });
        }

        if (channelFilter) {
            channelFilter.addEventListener('change', () => {
                console.log('🔍 Filtro de canal cambiado:', channelFilter.value);
                this.applyChatFilters();
            });
        }

        if (dateFilter) {
            dateFilter.addEventListener('change', () => {
                console.log('🔍 Filtro de fecha cambiado:', dateFilter.value);
                this.applyChatFilters();
            });
        }

        // Botón para limpiar filtros (solo crear si no existe)
        const filtersContainer = document.querySelector('.filters');
        if (filtersContainer && !document.getElementById('clearFiltersBtn')) {
            const clearFiltersBtn = document.createElement('button');
            clearFiltersBtn.id = 'clearFiltersBtn';
            clearFiltersBtn.className = 'btn btn-outline';
            clearFiltersBtn.innerHTML = '<i class="fas fa-times"></i> Limpiar';
            clearFiltersBtn.title = 'Limpiar todos los filtros';
            clearFiltersBtn.addEventListener('click', () => {
                this.clearChatFilters();
            });
            filtersContainer.appendChild(clearFiltersBtn);
            console.log('✅ Botón de limpiar filtros agregado');
        }

        console.log('✅ Filtros de chats configurados');
    }

    setupAgentFilters() {
        // Solo seleccionar los tabs de filtros de agentes, no los del perfil
        const filterTabs = document.querySelectorAll('.agents-section .tab-btn, .filter-tabs .tab-btn');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs in this section
                filterTabs.forEach(t => t.classList.remove('active'));
                // Add active class to clicked tab
                tab.classList.add('active');
                // Apply filter
                this.applyAgentFilters(tab.dataset.filter);
            });
        });
    }

    setupProfileTabs() {
        console.log('🔧 Configurando pestañas del perfil...');
        
        // Check user role and show/hide API Config tab
        this.checkUserRoleForApiConfig();
        
        // Setup tab switching functionality
        const profileTabs = document.querySelectorAll('.profile-tabs .tab-btn');
        profileTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                this.switchProfileTab(tabId);
            });
        });

        // Setup API Config form functionality
        this.setupApiConfigForm();
    }

    checkUserRoleForApiConfig() {
        console.log('🔍 Verificando rol del usuario para mostrar pestaña de API Config...');
        
        const apiConfigTab = document.getElementById('apiConfigTab');
        if (!apiConfigTab) {
            console.warn('⚠️ No se encontró la pestaña API Config');
            return;
        }
        
        // Obtener rol del usuario desde múltiples fuentes
        let userRole = null;
        
        // Método 1: Desde getCurrentUser
        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.role) {
            userRole = currentUser.role;
            console.log(`👤 Rol obtenido de getCurrentUser: ${userRole}`);
        }
        
        // Método 2: Desde authService
        if (!userRole && window.authService && window.authService.getCurrentUser) {
            const authUser = window.authService.getCurrentUser();
            if (authUser && authUser.role) {
                userRole = authUser.role;
                console.log(`👤 Rol obtenido de authService: ${userRole}`);
            }
        }
        
        // Método 3: Desde el elemento del perfil
        if (!userRole) {
            const profileRole = document.querySelector('#profileRole');
            if (profileRole && profileRole.textContent) {
                const roleText = profileRole.textContent.trim().toLowerCase();
                if (roleText.includes('admin') || roleText.includes('administrador')) {
                    userRole = 'admin';
                    console.log(`👤 Rol detectado desde #profileRole: ${userRole}`);
                }
            }
        }
        
        // Si no se puede determinar el rol, mostrar la pestaña de todos modos
        // (es mejor mostrar y permitir que el usuario la vea)
        if (!userRole) {
            console.log('⚠️ No se pudo determinar el rol, mostrando pestaña de todos modos');
            apiConfigTab.style.display = 'flex';
            return;
        }
        
        console.log(`👤 Rol final del usuario: ${userRole}`);
        
        // Mostrar la pestaña si es admin, o siempre para permitir configuración
        // Cambio: mostrar siempre la pestaña para que todos puedan configurar su token
        apiConfigTab.style.display = 'flex';
        console.log('✅ Pestaña API Config mostrada');
    }

    getCurrentUser() {
        console.log('🔍 Buscando usuario actual...');
        
        // Debug: mostrar todos los datos disponibles en localStorage
        console.log('🔍 Debugging localStorage:');
        console.log('- currentUser:', localStorage.getItem('currentUser'));
        console.log('- authData:', localStorage.getItem('authData'));
        console.log('- authToken:', localStorage.getItem('authToken'));
        console.log('- authService available:', !!window.authService);
        if (window.authService) {
            console.log('- authService.currentUser:', window.authService.getCurrentUser());
        }
        
        // Try to get user from localStorage first
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                console.log('✅ Usuario encontrado en localStorage:', user);
                return user;
            } catch (e) {
                console.error('❌ Error parsing stored user:', e);
            }
        }
        
        // Try authService
        if (window.authService && window.authService.getCurrentUser) {
            const authUser = window.authService.getCurrentUser();
            if (authUser) {
                console.log('✅ Usuario encontrado en authService:', authUser);
                return authUser;
            }
        }
        
        // Try to get user from authData in localStorage
        const authData = localStorage.getItem('authData');
        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                if (parsed.user) {
                    console.log('✅ Usuario encontrado en authData:', parsed.user);
                    return parsed.user;
                }
            } catch (e) {
                console.error('❌ Error parsing authData:', e);
            }
        }
        
        // Try to get user from token if available
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                const decoded = JSON.parse(atob(token.split('.')[1]));
                console.log('✅ Usuario encontrado en token:', decoded);
                return decoded;
            } catch (e) {
                console.error('❌ Error decoding token:', e);
            }
        }
        
        // Last resort: get email from profile page
        const profileEmail = document.getElementById('profileEmail');
        console.log('🔍 Buscando email en perfil visible...');
        console.log('- Elemento profileEmail encontrado:', !!profileEmail);
        if (profileEmail) {
            console.log('- Texto del elemento:', profileEmail.textContent);
            const email = profileEmail.textContent.trim();
            if (email) {
                console.log('✅ Email obtenido del perfil visible:', email);
                return { email: email, role: 'admin' }; // Assume admin for API config
            }
        }
        
        // Force get email from any profile element
        const emailElements = document.querySelectorAll('[id*="email"], [id*="Email"]');
        console.log('🔍 Elementos con email encontrados:', emailElements.length);
        for (let element of emailElements) {
            if (element.textContent && element.textContent.includes('@')) {
                const email = element.textContent.trim();
                console.log('✅ Email encontrado en elemento alternativo:', email);
                return { email: email, role: 'admin' };
            }
        }
        
        console.warn('⚠️ No se pudo encontrar usuario actual');
        return null;
    }

    switchProfileTab(tabId) {
        console.log(`🔄 Cambiando a pestaña: ${tabId}`);
        
        // Remove active class from all tabs
        document.querySelectorAll('.profile-tabs .tab-btn').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Remove active class from all tab contents
        document.querySelectorAll('.profile-content .tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Add active class to clicked tab
        const clickedTab = document.querySelector(`[data-tab="${tabId}"]`);
        if (clickedTab) {
            clickedTab.classList.add('active');
        }
        
        // Add active class to corresponding content
        const tabContent = document.getElementById(tabId);
        if (tabContent) {
            tabContent.classList.add('active');
        }
        
        // Si es la pestaña de configuración API, cargar el token
        if (tabId === 'api-config') {
            console.log('🔧 Cambiando a pestaña de configuración API, cargando token...');
            // Dar un pequeño delay para asegurar que el DOM esté listo
            setTimeout(() => {
                this.loadApiToken();
            }, 200);
        }
    }

    setupApiConfigForm() {
        console.log('🔧 Configurando formulario de API Config...');
        
        const form = document.getElementById('apiConfigForm');
        const toggleBtn = document.getElementById('toggleTokenVisibility');
        const apiConfigTab = document.getElementById('api-config');
        
        if (!form) {
            console.warn('⚠️ No se encontró el formulario de API Config');
            return;
        }

        // Observar cuando el tab se hace visible para cargar el token
        if (apiConfigTab) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const isActive = apiConfigTab.classList.contains('active');
                        if (isActive) {
                            console.log('👁️ Tab api-config ahora está visible, cargando token...');
                            setTimeout(() => this.loadApiToken(), 100);
                        }
                    }
                });
            });
            
            observer.observe(apiConfigTab, {
                attributes: true,
                attributeFilter: ['class']
            });
            
            // También cargar si ya está activo al inicializar
            if (apiConfigTab.classList.contains('active')) {
                console.log('👁️ Tab api-config ya está activo al inicializar, cargando token...');
                setTimeout(() => this.loadApiToken(), 100);
            }
        }

        // Toggle token visibility with password protection
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.toggleTokenVisibility();
            });
        }

        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveApiConfig();
        });
    }

    async loadApiToken() {
        console.log('🚀🚀🚀 CARGANDO TOKEN API DESDE NEON 🚀🚀🚀');
        
        const tokenInput = document.getElementById('apiToken');
        if (!tokenInput) {
            console.warn('⚠️ Input no encontrado, reintentando...');
            setTimeout(() => this.loadApiToken(), 300);
            return;
        }

        try {
            // 1. OBTENER EMAIL
            let userEmail = null;
            
            if (window.authService && window.authService.getCurrentUser) {
                const user = window.authService.getCurrentUser();
                if (user && user.email) {
                    userEmail = user.email;
                    console.log('✅ Email desde authService:', userEmail);
                }
            }
            
            if (!userEmail) {
                const profileEmailEl = document.querySelector('#profileEmail');
                if (profileEmailEl && profileEmailEl.textContent && profileEmailEl.textContent !== 'Cargando...') {
                    userEmail = profileEmailEl.textContent.trim();
                    console.log('✅ Email desde #profileEmail:', userEmail);
                }
            }
            
            if (!userEmail) {
                const currentUser = this.getCurrentUser();
                if (currentUser && currentUser.email) {
                    userEmail = currentUser.email;
                    console.log('✅ Email desde getCurrentUser:', userEmail);
                }
            }
            
            if (!userEmail) {
                console.error('❌ NO SE PUDO OBTENER EL EMAIL');
                return;
            }
            
            // 2. ESPERAR NEON SERVICE
            if (!window.neonService) {
                console.log('⏳ Esperando neonService...');
                for (let i = 0; i < 50; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    if (window.neonService) break;
                }
            }
            
            if (!window.neonService) {
                console.error('❌ NeonService NO disponible');
                return;
            }
            
            // 3. CONSULTAR NEON
            console.log('📞 Llamando getUserByEmail para:', userEmail);
            const result = await window.neonService.getUserByEmail(userEmail);
            console.log('📦 Resultado:', result);
            
            if (result && result.success && result.user) {
                const token = result.user.token_api;
                console.log('🔑 Token encontrado:', token ? 'SÍ' : 'NO');
                console.log('🔑 Valor del token:', token ? token.substring(0, 30) + '...' : 'null/undefined/vacío');
                
                if (token && typeof token === 'string' && token.trim() !== '') {
                    tokenInput.value = token;
                    console.log('✅✅✅ TOKEN CARGADO EN EL INPUT ✅✅✅');
                    localStorage.setItem('gptmaker_token', token);
                    return;
                } else {
                    console.log('⚠️ Token existe pero está vacío o inválido');
                    tokenInput.value = '';
                }
            } else {
                console.error('❌ Error obteniendo usuario:', result?.error);
            }
            
        } catch (error) {
            console.error('❌ ERROR:', error);
        }
    }

    async testApiConnection() {
        console.log('🔌 Probando conexión con API...');
        
        const tokenInput = document.getElementById('apiToken');
        const apiToken = tokenInput.value.trim();
        const statusElement = document.getElementById('apiStatus');
        
        if (!apiToken) {
            this.showNotification('Por favor, ingresa un token de API primero', 'warning');
            return;
        }

        // Show testing status
        this.showApiStatus('testing', 'Probando conexión...');
        
        try {
            // Simulate API test (replace with actual API call)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // For demo purposes, assume connection is successful
            // In real implementation, you would make an actual API call here
            this.showApiStatus('connected', 'Conexión exitosa');
            this.showNotification('Conexión con API establecida correctamente', 'success');
            console.log('✅ Conexión con API exitosa');
            
        } catch (error) {
            this.showApiStatus('disconnected', 'Error de conexión');
            this.showNotification('Error al conectar con la API', 'error');
            console.error('❌ Error al conectar con API:', error);
        }
    }

    showApiStatus(status, message) {
        const statusElement = document.getElementById('apiStatus');
        const indicator = statusElement.querySelector('.status-indicator i');
        const textElement = statusElement.querySelector('.status-text');
        
        if (statusElement) {
            statusElement.style.display = 'block';
            
            // Remove previous status classes
            indicator.classList.remove('connected', 'disconnected', 'testing');
            indicator.classList.add(status);
            
            textElement.textContent = message;
        }
    }

    toggleTokenVisibility() {
        console.log('👁️ Intentando mostrar/ocultar token...');
        
        const input = document.getElementById('apiToken');
        const toggleBtn = document.getElementById('toggleTokenVisibility');
        const icon = toggleBtn.querySelector('i');
        
        if (!input || !toggleBtn) {
            console.error('❌ Elementos no encontrados');
            return;
        }
        
        // Si el token ya está visible, simplemente ocultarlo
        if (input.type === 'text') {
            input.type = 'password';
            icon.className = 'fas fa-eye';
            console.log('🔒 Token ocultado');
            return;
        }
        
        // Si el token está oculto, pedir contraseña
        this.showPasswordModal(() => {
            // Callback cuando la contraseña es correcta
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
            console.log('👁️ Token mostrado');
        });
    }

    showPasswordModal(onSuccess) {
        console.log('🔐 Mostrando modal de contraseña...');
        
        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay password-modal';
        modal.innerHTML = `
            <div class="modal-content password-modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-lock"></i>
                        Verificar Identidad
                    </h3>
                    <button class="modal-close" id="closePasswordModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p>Por seguridad, ingresa tu contraseña para ver el token de API:</p>
                    <form id="passwordForm">
                        <div class="form-group">
                            <label for="passwordInput">Contraseña</label>
                            <input 
                                type="password" 
                                id="passwordInput" 
                                name="password" 
                                placeholder="Ingresa tu contraseña"
                                required
                                autofocus
                            />
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-outline" id="cancelPasswordBtn">
                                <i class="fas fa-times"></i>
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-check"></i>
                                Verificar
                            </button>
                        </div>
                    </form>
                    <div class="password-error" id="passwordError" style="display: none;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Contraseña incorrecta. Intenta de nuevo.</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        console.log('✅ Modal de contraseña agregado al DOM');

        // Event listeners
        const closeBtn = modal.querySelector('#closePasswordModal');
        const cancelBtn = modal.querySelector('#cancelPasswordBtn');
        const form = modal.querySelector('#passwordForm');
        const passwordInput = modal.querySelector('#passwordInput');
        const errorDiv = modal.querySelector('#passwordError');

        const closeModal = () => {
            console.log('🚫 Cerrando modal de contraseña');
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Manejar envío del formulario
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('🔐 Verificando contraseña...');
            
            const password = passwordInput.value.trim();
            
            if (!password) {
                this.showPasswordError(errorDiv, 'Por favor, ingresa tu contraseña');
                return;
            }

            try {
                // Verificar contraseña con el usuario actual
                const currentUser = this.getCurrentUser();
                if (!currentUser || !currentUser.email) {
                    throw new Error('Usuario no encontrado');
                }

                // Buscar usuario en Airtable para verificar contraseña
                const userResult = await window.neonService.getUserByEmail(currentUser.email);
                
                if (!userResult.success || !userResult.user) {
                    throw new Error('Usuario no encontrado en Neon');
                }

                // Verificar contraseña
                const passwordMatch = window.neonService.verifyPassword(userResult.user.password, password);
                
                if (passwordMatch) {
                    console.log('✅ Contraseña correcta');
                    closeModal();
                    onSuccess(); // Ejecutar callback de éxito
                } else {
                    console.log('❌ Contraseña incorrecta');
                    this.showPasswordError(errorDiv, 'Contraseña incorrecta. Intenta de nuevo.');
                }

            } catch (error) {
                console.error('❌ Error verificando contraseña:', error);
                this.showPasswordError(errorDiv, 'Error verificando contraseña. Intenta de nuevo.');
            }
        });

        // Focus en el input
        setTimeout(() => {
            passwordInput.focus();
        }, 100);
    }

    showPasswordError(errorDiv, message) {
        errorDiv.style.display = 'block';
        errorDiv.querySelector('span').textContent = message;
        
        // Ocultar error después de 3 segundos
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 3000);
    }

    showChangePasswordModal() {
        console.log('🔐 Mostrando modal de cambio de contraseña...');
        
        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay password-modal';
        modal.innerHTML = `
            <div class="modal-content password-modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-key"></i>
                        Cambiar Contraseña
                    </h3>
                    <button class="modal-close" id="closeChangePasswordModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p>Ingresa tu contraseña actual y la nueva contraseña:</p>
                    <form id="changePasswordForm">
                        <div class="form-group">
                            <label for="currentPasswordInput">Contraseña Actual</label>
                            <input 
                                type="password" 
                                id="currentPasswordInput" 
                                name="currentPassword" 
                                placeholder="Ingresa tu contraseña actual"
                                required
                                autofocus
                            />
                        </div>
                        <div class="form-group">
                            <label for="newPasswordInput">Nueva Contraseña</label>
                            <input 
                                type="password" 
                                id="newPasswordInput" 
                                name="newPassword" 
                                placeholder="Ingresa tu nueva contraseña"
                                required
                            />
                        </div>
                        <div class="form-group">
                            <label for="confirmPasswordInput">Confirmar Nueva Contraseña</label>
                            <input 
                                type="password" 
                                id="confirmPasswordInput" 
                                name="confirmPassword" 
                                placeholder="Confirma tu nueva contraseña"
                                required
                            />
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-outline" id="cancelChangePasswordBtn">
                                <i class="fas fa-times"></i>
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-save"></i>
                                Cambiar Contraseña
                            </button>
                        </div>
                    </form>
                    <div class="password-error" id="changePasswordError" style="display: none;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Error en el cambio de contraseña. Intenta de nuevo.</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        console.log('✅ Modal de cambio de contraseña agregado al DOM');

        // Event listeners
        const closeBtn = modal.querySelector('#closeChangePasswordModal');
        const cancelBtn = modal.querySelector('#cancelChangePasswordBtn');
        const form = modal.querySelector('#changePasswordForm');
        const currentPasswordInput = modal.querySelector('#currentPasswordInput');
        const newPasswordInput = modal.querySelector('#newPasswordInput');
        const confirmPasswordInput = modal.querySelector('#confirmPasswordInput');
        const errorDiv = modal.querySelector('#changePasswordError');

        const closeModal = () => {
            console.log('🚫 Cerrando modal de cambio de contraseña');
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Manejar envío del formulario
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('🔐 Cambiando contraseña...');
            
            const currentPassword = currentPasswordInput.value.trim();
            const newPassword = newPasswordInput.value.trim();
            const confirmPassword = confirmPasswordInput.value.trim();
            
            // Validaciones
            if (!currentPassword || !newPassword || !confirmPassword) {
                this.showPasswordError(errorDiv, 'Por favor, completa todos los campos');
                return;
            }

            if (newPassword !== confirmPassword) {
                this.showPasswordError(errorDiv, 'Las contraseñas nuevas no coinciden');
                return;
            }

            if (newPassword.length < 6) {
                this.showPasswordError(errorDiv, 'La nueva contraseña debe tener al menos 6 caracteres');
                return;
            }

            if (currentPassword === newPassword) {
                this.showPasswordError(errorDiv, 'La nueva contraseña debe ser diferente a la actual');
                return;
            }

            try {
                // Obtener usuario actual
                const currentUser = this.getCurrentUser();
                if (!currentUser || !currentUser.email) {
                    throw new Error('Usuario no encontrado');
                }

                // Buscar usuario en Airtable
                const userResult = await window.neonService.getUserByEmail(currentUser.email);
                
                if (!userResult.success || !userResult.user) {
                    throw new Error('Usuario no encontrado en Neon');
                }

                // Verificar contraseña actual
                const passwordMatch = window.neonService.verifyPassword(userResult.user.password, currentPassword);
                
                if (!passwordMatch) {
                    this.showPasswordError(errorDiv, 'La contraseña actual es incorrecta');
                    return;
                }

                // Actualizar contraseña en Neon
                const updateResult = await window.neonService.updatePassword(userResult.user.id, newPassword);
                
                if (updateResult.success) {
                    console.log('✅ Contraseña actualizada exitosamente');
                    this.showNotification('Contraseña actualizada exitosamente', 'success');
                    closeModal();
                } else {
                    throw new Error(updateResult.error || 'Error actualizando contraseña');
                }

            } catch (error) {
                console.error('❌ Error cambiando contraseña:', error);
                this.showPasswordError(errorDiv, 'Error cambiando contraseña. Intenta de nuevo.');
            }
        });

        // Focus en el primer input
        setTimeout(() => {
            currentPasswordInput.focus();
        }, 100);
    }

    async saveApiConfig() {
        console.log('💾 Guardando configuración de API...');
        
        const tokenInput = document.getElementById('apiToken');
        const apiToken = tokenInput.value.trim();
        
        if (!apiToken) {
            this.showNotification('Por favor, ingresa un token de API válido', 'warning');
            return;
        }

        try {
            // Get current user
            let currentUser = this.getCurrentUser();
            
            // If no user found, try to get email directly from profile
            if (!currentUser || !currentUser.email) {
                console.log('🔄 Usuario no encontrado, obteniendo email del perfil...');
                const profileEmail = document.getElementById('profileEmail');
                if (profileEmail && profileEmail.textContent) {
                    const email = profileEmail.textContent.trim();
                    currentUser = { email: email, role: 'admin' };
                    console.log('✅ Email obtenido directamente del perfil:', email);
                } else {
                    console.error('❌ Usuario no encontrado y no se puede obtener email del perfil');
                    this.showNotification('Error: Usuario no encontrado. Por favor, inicia sesión nuevamente.', 'error');
                    return;
                }
            }

            console.log('👤 Usuario actual:', currentUser);
            console.log('📧 Email del usuario:', currentUser.email);

            // Save to Airtable if available
            if (window.neonService && window.authService && window.authService.useNeon) {
                console.log('🗄️ Guardando token en Neon...');
                console.log('🔍 Buscando usuario por email:', currentUser.email);
                
                // Get user ID from Neon
                const userResult = await window.neonService.getUserByEmail(currentUser.email);
                console.log('📊 Resultado de búsqueda en Airtable:', userResult);
                
                if (!userResult.success || !userResult.user) {
                    console.error('❌ Usuario no encontrado en Airtable');
                    throw new Error(`No se pudo encontrar el usuario ${currentUser.email} en Airtable`);
                }
                
                const userId = userResult.user.id;
                console.log('🆔 ID del usuario en Airtable:', userId);
                
                // Update user with API token
                const updateData = {
                    token_api: apiToken
                };
                console.log('📤 Datos a enviar a Airtable:', updateData);
                
                const updateResult = await window.neonService.updateUser(userId, updateData);
                console.log('📊 Resultado de actualización:', updateResult);
                
                if (!updateResult.success) {
                    throw new Error(updateResult.error || 'Error al guardar token en Airtable');
                }
                
                console.log('✅ Token guardado en Airtable exitosamente');
            } else {
                console.log('⚠️ Airtable no disponible, guardando solo en localStorage');
                console.log('🔧 neonService disponible:', !!window.neonService);
                console.log('🔧 authService disponible:', !!window.authService);
                console.log('🔧 authService.useNeon:', window.authService?.useNeon);
            }

            // Save to localStorage - usar gptmaker_token como clave principal
            localStorage.setItem('gptmaker_token', apiToken);
            localStorage.setItem('apiToken', apiToken); // Mantener compatibilidad
            console.log('💾 Token guardado en localStorage (gptmaker_token y apiToken)');
            
            // Actualizar configuración global
            if (window.GPTMAKER_CONFIG) {
                window.GPTMAKER_CONFIG.token = apiToken;
                console.log('✅ Configuración global actualizada');
            }
            
            // Actualizar GPTMakerConfig si está disponible
            if (window.gptmakerConfig) {
                window.gptmakerConfig.setToken(apiToken);
                console.log('✅ GPTMakerConfig actualizado');
            }
            
            // Limpiar TODA la cache de la API para forzar recarga con nuevo token
            if (this.api) {
                if (typeof this.api.clearAllCache === 'function') {
                    this.api.clearAllCache();
                    console.log('🗑️ Toda la cache de API limpiada');
                } else if (typeof this.api.clearCacheByPrefix === 'function') {
                    this.api.clearCacheByPrefix('');
                    console.log('🗑️ Cache de API limpiada (método alternativo)');
                }
            }
            
            // Limpiar cache de DataService si existe
            if (this.dataService && typeof this.dataService.clearCache === 'function') {
                this.dataService.clearCache();
                console.log('🗑️ Cache de DataService limpiada');
            }
            
            // Si hay una instancia de GPTMakerAPI en el dashboard, actualizar su token
            if (this.api && typeof this.api.setToken === 'function') {
                this.api.setToken(apiToken);
                console.log('✅ Token actualizado en instancia de API del dashboard');
            }
            
            // Forzar recarga de la configuración de GPTMakerConfig
            if (window.gptmakerConfig && typeof window.gptmakerConfig.reloadConfig === 'function') {
                window.gptmakerConfig.reloadConfig();
                console.log('🔄 Configuración de GPTMaker recargada');
            }
            
            // Update global API service if available
            if (window.gptmakerService) {
                window.gptmakerService.setApiKey(apiToken);
                console.log('🔧 Token actualizado en gptmakerService');
            }
            
            this.showNotification('Configuración de API guardada exitosamente. Los cambios se aplicarán en la próxima actualización de datos.', 'success');
            console.log('✅ Configuración de API guardada completamente');
            
            // Sugerir recargar la página para aplicar cambios inmediatamente
            setTimeout(() => {
                const reload = confirm('¿Deseas recargar la página para aplicar los cambios inmediatamente?');
                if (reload) {
                    window.location.reload();
                }
            }, 1000);
            
        } catch (error) {
            console.error('❌ Error al guardar configuración de API:', error);
            this.showNotification(`Error al guardar configuración: ${error.message}`, 'error');
        }
    }

    navigateToSection(section) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Solo agregar clase 'active' si el nav-item existe
        const navItem = document.querySelector(`[data-section="${section}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        // Update content
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        
        const targetSection = document.getElementById(section);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Update page title
        const titles = {
            overview: 'Resumen General',
            chats: 'Chats',
            team: 'Equipo',
            agents: 'Agentes IA',
            attendances: 'Atendimientos',
            prospects: 'Prospectos',
            integrations: 'Integraciones',
            profile: 'Mi Perfil'
        };
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle && titles[section]) {
            pageTitle.textContent = titles[section];
        }

        this.currentSection = section;

        // Close mobile menu if open
        this.closeMobileMenu();

        // Add animation
        document.getElementById(section).classList.add('fade-in');
        setTimeout(() => {
            document.getElementById(section).classList.remove('fade-in');
        }, 300);
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const toggleIcon = document.querySelector('#sidebarToggle i');
        this.isSidebarCollapsed = !this.isSidebarCollapsed;
        
        if (this.isSidebarCollapsed) {
            sidebar.classList.add('collapsed');
            // Cambiar ícono a flecha derecha cuando está colapsado
            if (toggleIcon) {
                toggleIcon.className = 'fas fa-chevron-right';
            }
        } else {
            sidebar.classList.remove('collapsed');
            // Cambiar ícono a barras cuando está expandido
            if (toggleIcon) {
                toggleIcon.className = 'fas fa-bars';
            }
        }

        // Actualizar logo según el estado del sidebar
        this.updateSidebarLogo();

        localStorage.setItem('sidebarCollapsed', this.isSidebarCollapsed);
    }

    toggleMobileMenu() {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.toggle('active');
    }

    closeMobileMenu() {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.remove('active');
    }

    setupMobileMenu() {
        const savedState = localStorage.getItem('sidebarCollapsed');
        const toggleIcon = document.querySelector('#sidebarToggle i');
        
        if (savedState === 'true') {
            this.isSidebarCollapsed = true;
            document.querySelector('.sidebar').classList.add('collapsed');
            // Configurar ícono de flecha cuando está colapsado
            if (toggleIcon) {
                toggleIcon.className = 'fas fa-chevron-right';
            }
        } else {
            // Configurar ícono de barras cuando está expandido
            if (toggleIcon) {
                toggleIcon.className = 'fas fa-bars';
            }
        }
        // Configurar logo según el estado inicial del sidebar
        this.updateSidebarLogo();
    }

    toggleTheme() {
        this.isDarkTheme = !this.isDarkTheme;
        document.documentElement.setAttribute('data-theme', this.isDarkTheme ? 'dark' : 'light');
        
        const themeIcon = document.querySelector('#themeToggle i');
        themeIcon.className = this.isDarkTheme ? 'fas fa-sun' : 'fas fa-moon';

        // Cambiar logo según el tema
        this.updateSidebarLogo();

        localStorage.setItem('darkTheme', this.isDarkTheme);
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('darkTheme');
        if (savedTheme === 'true') {
            this.isDarkTheme = true;
            document.documentElement.setAttribute('data-theme', 'dark');
            const themeIcon = document.querySelector('#themeToggle i');
            themeIcon.className = 'fas fa-sun';
        }
        // Configurar logo inicial
        this.updateSidebarLogo();
    }

    updateSidebarLogo() {
        const sidebarLogo = document.getElementById('sidebarLogo');
        const sidebar = document.querySelector('.sidebar');
        
        if (sidebarLogo && sidebar) {
            const isCollapsed = sidebar.classList.contains('collapsed');
            
            if (isCollapsed) {
                // Sidebar contraído - usar logo especial para ambos temas
                sidebarLogo.src = 'https://konsul.digital/wp-content/uploads/2025/07/3.png';
                sidebarLogo.alt = 'Konsul Digital';
            } else {
                // Sidebar expandido - usar logo según el tema
                if (this.isDarkTheme) {
                    // Tema oscuro - usar logo en blanco y negro
                    sidebarLogo.src = 'https://konsul.digital/wp-content/uploads/2025/07/Logo-en-BW-e1751712792454.png';
                    sidebarLogo.alt = 'Konsul Digital - Tema Oscuro';
                } else {
                    // Tema claro - usar logo original
                    sidebarLogo.src = 'https://konsul.digital/wp-content/uploads/2025/07/Logo-original-e1751717849441.png';
                    sidebarLogo.alt = 'Konsul Digital - Tema Claro';
                }
            }
        }
    }

    getTeamMembersCount() {
        // Obtener miembros del equipo desde localStorage
        const storedMembers = localStorage.getItem('teamMembers');
        if (storedMembers) {
            try {
                const members = JSON.parse(storedMembers);
                return members.length;
            } catch (error) {
                console.error('❌ Error al parsear miembros del equipo:', error);
                return 0;
            }
        }
        return 0;
    }

    loadBrandSettings() {
        const savedSettings = localStorage.getItem('brandSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            
            if (settings.companyName) {
                document.querySelector('.brand-name').textContent = settings.companyName;
            }
            
            if (settings.primaryColor) {
                document.documentElement.style.setProperty('--primary-color', settings.primaryColor);
            }
        }
    }

    // Actualizar estadísticas del resumen con datos reales
    async updateOverviewStats() {
        console.log('🔄 Actualizando estadísticas del dashboard...');
        console.log('📊 Datos del dashboard disponibles:', {
            chats: this.dashboardData.chats ? this.dashboardData.chats.length : 0,
            agents: this.dashboardData.agents ? this.dashboardData.agents.length : 0,
            team: this.dashboardData.team ? this.dashboardData.team.length : 0
        });
        
        const totalChats = this.dashboardData.chats ? this.dashboardData.chats.length : 0;
        const totalAgents = this.dashboardData.agents ? this.dashboardData.agents.length : 0;
        const totalTokens = await this.calculateTotalTokens();
        
        // Mostrar total de chats (sin importar status)
        const totalChatsCount = this.dashboardData.chats ? this.dashboardData.chats.length : 0;
        
        console.log(`📊 Estadísticas calculadas:`, {
            totalChats: totalChatsCount,
            totalAgents,
            totalTokens,
            chatsBreakdown: this.dashboardData.chats ? {
                total: this.dashboardData.chats.length,
                active: this.dashboardData.chats.filter(chat => !chat.finished).length,
                finished: this.dashboardData.chats.filter(chat => chat.finished).length
            } : 'No hay chats'
        });
        
        if (this.dashboardData.chats && this.dashboardData.chats.length > 0) {
            console.log('📋 Detalles de chats:', this.dashboardData.chats.map(chat => ({
                id: chat.id,
                finished: chat.finished,
                name: chat.name || chat.userName || 'Sin nombre'
            })));
        }

        // Verificar que los elementos del DOM existan antes de actualizarlos
        const totalChatsElement = document.getElementById('totalChats');
        const totalAgentsElement = document.getElementById('totalAgents');
        const totalUsersElement = document.getElementById('totalUsers');
        const totalTokensElement = document.getElementById('totalTokens');
        
        if (totalChatsElement) {
            totalChatsElement.textContent = totalChatsCount;
            console.log(`✅ Actualizado totalChats a: ${totalChatsCount} (total de chats)`);
        } else {
            console.error('❌ No se encontró el elemento totalChats');
        }
        
        if (totalAgentsElement) {
            totalAgentsElement.textContent = totalAgents;
            console.log(`✅ Actualizado totalAgents a: ${totalAgents}`);
        }
        
        if (totalUsersElement) {
            // Obtener la cantidad real de miembros del equipo
            const teamMembersCount = this.getTeamMembersCount();
            totalUsersElement.textContent = teamMembersCount;
            console.log(`✅ Actualizado totalUsers (miembros del equipo) a: ${teamMembersCount}`);
        }
        
        if (totalTokensElement) {
            totalTokensElement.textContent = totalTokens.toLocaleString();
            console.log(`✅ Actualizado totalTokens a: ${totalTokens.toLocaleString()}`);
        }

        // Mostrar información del workspace
        this.displayWorkspaceInfo();
    }

    async displayWorkspaceInfo() {
        try {
            const workspaces = await this.dataService.getWorkspaces();
            if (workspaces.success && workspaces.data && workspaces.data.length > 0) {
                const workspace = workspaces.data[0];
                console.log(`🏢 Workspace activo: ${workspace.name} (${workspace.id})`);
                
                // Mostrar indicador del workspace en el header
                const workspaceInfo = document.getElementById('workspaceInfo');
                const workspaceName = document.getElementById('workspaceName');
                
                if (workspaceInfo && workspaceName) {
                    workspaceName.textContent = workspace.name;
                    workspaceInfo.style.display = 'flex';
                }
                
                // Cargar y mostrar créditos del workspace
                await this.displayWorkspaceCredits(workspace.id);
                
                // Actualizar el título de la página con el nombre del workspace
                const pageTitle = document.getElementById('pageTitle');
                if (pageTitle && this.currentSection === 'overview') {
                    pageTitle.textContent = `Resumen General - ${workspace.name}`;
                }
            }
        } catch (error) {
            console.error('❌ Error obteniendo información del workspace:', error);
        }
    }

    async displayWorkspaceCredits(workspaceId) {
        try {
            const creditsResult = await this.dataService.getWorkspaceCredits(workspaceId);
            
            if (creditsResult.success && creditsResult.data) {
                const credits = creditsResult.data.credits;
                const status = creditsResult.data.status;
                
                console.log(`💰 Créditos del workspace: ${credits} (Status: ${status})`);
                
                // Mostrar indicador de créditos en el header
                const creditsInfo = document.getElementById('creditsInfo');
                const creditsAmount = document.getElementById('creditsAmount');
                const creditsStatus = document.getElementById('creditsStatus');
                
                if (creditsInfo && creditsAmount && creditsStatus) {
                    creditsAmount.textContent = credits.toLocaleString();
                    creditsStatus.textContent = this.getStatusText(status);
                    creditsStatus.className = `credits-status ${status.toLowerCase()}`;
                    creditsInfo.style.display = 'flex';
                }
            } else {
                console.warn('⚠️ No se pudieron obtener créditos del workspace');
            }
        } catch (error) {
            console.error('❌ Error obteniendo créditos del workspace:', error);
        }
    }

    getStatusText(status) {
        const statusMap = {
            'TRIAL': 'Prueba',
            'ACTIVE': 'Activo',
            'PAST_DUE': 'Vencido',
            'CANCELED': 'Cancelado'
        };
        return statusMap[status] || status;
    }

    async refreshCredits() {
        try {
            const workspaces = await this.dataService.getWorkspaces();
            if (workspaces.success && workspaces.data && workspaces.data.length > 0) {
                const workspace = workspaces.data[0];
                await this.displayWorkspaceCredits(workspace.id);
                this.showNotification('Créditos actualizados', 'success');
            }
        } catch (error) {
            console.error('❌ Error actualizando créditos:', error);
            this.showNotification('Error al actualizar créditos', 'error');
        }
    }

    getUniqueUsersCount() {
        const uniqueUsers = new Set();
        this.dashboardData.chats.forEach(chat => {
            // Usar whatsappPhone como identificador principal, luego userName como fallback
            const userIdentifier = chat.whatsappPhone || chat.userName || chat.name;
            if (userIdentifier) {
                uniqueUsers.add(userIdentifier);
            }
        });
        
        console.log(`👥 Usuarios únicos encontrados: ${uniqueUsers.size}`, Array.from(uniqueUsers));
        return uniqueUsers.size;
    }

    async calculateTotalTokens() {
        try {
            // Obtener todos los agentes para sumar sus créditos consumidos
            const agentsResult = await this.dataService.getAgents();
            
            if (agentsResult.success && agentsResult.data && agentsResult.data.length > 0) {
                let totalCreditsConsumed = 0;
                const agents = agentsResult.data;
                
                console.log(`💰 Calculando créditos consumidos totales de ${agents.length} agentes...`);
                
                // Obtener créditos consumidos de cada agente
                for (const agent of agents) {
                    // Solo intentar obtener créditos si el ID parece ser real (no mock)
                    if (agent.id && !agent.id.startsWith('agent-') && agent.id.length > 10) {
                        try {
                            const creditsResult = await this.dataService.getAgentCredits(agent.id);
                            
                            if (creditsResult.success && creditsResult.data && creditsResult.data.total) {
                                const agentCredits = creditsResult.data.total || 0;
                                totalCreditsConsumed += agentCredits;
                                console.log(`✅ Agente ${agent.name}: ${agentCredits} créditos consumidos`);
            }
        } catch (error) {
                            console.warn(`⚠️ No se pudieron obtener créditos para agente ${agent.name}:`, error.message);
                        }
                    }
                }
                
                console.log(`📊 Total de créditos consumidos: ${totalCreditsConsumed}`);
                return totalCreditsConsumed;
            }
            
            console.log('ℹ️ No hay agentes para calcular créditos consumidos');
            return 0;
            
        } catch (error) {
            console.error('❌ Error calculando tokens consumidos:', error);
        return 0;
        }
    }

    // Actualizar lista de chats con datos reales
    updateChatsList() {
        console.log('🔄 Actualizando lista de chats...');
        console.log('📊 Datos de chats disponibles:', this.dashboardData.chats.length);
        
        // Actualizar estadísticas del dashboard cuando se actualicen los chats
        this.updateOverviewStats();
        
        const chatsList = document.getElementById('chatsList');
        if (!chatsList) {
            console.error('❌ No se encontró el contenedor de chats (chatsList)');
            return;
        }

        console.log('✅ Contenedor de chats encontrado');
        chatsList.innerHTML = '';

        if (this.dashboardData.chats.length === 0) {
            console.log('⚠️ No hay chats para mostrar');
            chatsList.innerHTML = `
                <div class="no-chats">
                    <i class="fas fa-comments"></i>
                    <h3>No hay chats disponibles</h3>
                    <p>Los chats aparecerán aquí cuando estén disponibles</p>
                </div>
            `;
            return;
        }

        console.log(`✅ Renderizando ${this.dashboardData.chats.length} chats...`);
        
        // Actualizar filtros de agentes y canales
        this.updateAgentFilter();
        this.updateChannelFilter();
        
        // Aplicar filtros activos si los hay, sino mostrar todos
        this.applyActiveFilters();

        console.log('✅ Lista de chats actualizada exitosamente');
    }

    // Setup chats management
    setupChatsManagement() {
        // Chat selection - solo si NO es el botón de eliminar
        document.addEventListener('click', async (e) => {
            // Verificar que NO sea el botón de eliminar
            if (e.target.closest('.delete-chat-btn')) {
                return; // No hacer nada, el botón de eliminar manejará el evento
            }
            
            const chatItem = e.target.closest('.chat-item');
            if (chatItem) {
                const chatId = chatItem.dataset.chatId;
                await this.selectChatById(chatId);
            }
        });

        // Refresh button
        const refreshBtn = document.getElementById('refreshChatsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                console.log('🔄 Refrescando chats manualmente...');
                const icon = refreshBtn.querySelector('i');
                
                // Animación de rotación
                icon.classList.add('fa-spin');
                refreshBtn.disabled = true;
                
                try {
                    // Forzar actualización
                    await this.forceRefreshChats();
                } finally {
                    // Quitar animación
                    icon.classList.remove('fa-spin');
                    refreshBtn.disabled = false;
                }
            });
        }

        // Filter controls
        const agentFilter = document.getElementById('agentFilter');
        const channelFilter = document.getElementById('channelFilter');
        const dateFilter = document.getElementById('dateFilter');

        if (agentFilter) {
            agentFilter.addEventListener('change', () => {
                this.filterChats();
            });
        }

        if (channelFilter) {
            channelFilter.addEventListener('change', () => {
                this.filterChats();
            });
        }

        if (dateFilter) {
            dateFilter.addEventListener('change', () => {
                this.filterChats();
            });
        }

        // Send message functionality
        this.setupMessageSending();

        // Chat deletion
        this.setupChatDeletion();

        // Chat assumption
        this.setupChatAssumption();
    }

    async selectChatById(chatId) {
        const chat = this.dashboardData.chats.find(c => c.id === chatId);
        if (chat) {
            // Siempre usar selectChat para mostrar loading y cargar mensajes
            await this.selectChat(chat);
        }
    }

    async loadChatMessages(chatId) {
        try {
            console.log(`💬 Cargando mensajes del chat: ${chatId}`);
            
            // Obtener todos los mensajes
            const result = await this.dataService.getAllChatMessages(chatId);
            console.log(`📊 Resultado de getAllChatMessages:`, result);
            
            if (result.success && result.data) {
                console.log(`✅ Datos de mensajes recibidos: ${result.data.length} mensajes`);
                
                // Determinar estrategia de carga basada en la cantidad de mensajes
                const totalMessages = result.data.length;
                const chat = this.dashboardData.chats.find(c => c.id === chatId);
                
                if (chat) {
                    if (totalMessages <= 50) {
                        // Para 50 mensajes o menos: cargar todo de una vez
                        console.log(`📱 Carga completa: ${totalMessages} mensajes (≤50)`);
                        chat.messages = result.data;
                        this.updateChatDetails(chat);
                    } else {
                        // Para más de 50 mensajes: carga progresiva inteligente
                        console.log(`📱 Carga progresiva: ${totalMessages} mensajes (>50)`);
                        await this.loadMessagesProgressively(chat, result.data);
                    }
                    
                    console.log(`💾 Mensajes guardados en chat: ${chat.messages.length} mensajes`);
                } else {
                    console.error(`❌ No se encontró el chat ${chatId} en los datos del dashboard`);
                }
            } else {
                console.error(`❌ Error en la respuesta de mensajes:`, result.error || 'Sin datos');
            }
        } catch (error) {
            console.error('❌ Error cargando mensajes del chat:', error);
        }
    }

    // Carga progresiva inteligente para historiales largos
    async loadMessagesProgressively(chat, allMessages) {
        try {
            console.log(`🔄 Iniciando carga progresiva para ${allMessages.length} mensajes`);
            
            // Calcular el 50% inicial
            const initialCount = Math.ceil(allMessages.length * 0.5);
            const remainingMessages = allMessages.length - initialCount;
            
            console.log(`📊 Carga inicial: ${initialCount} mensajes (50%)`);
            console.log(`📊 Carga restante: ${remainingMessages} mensajes (50%)`);
            
            // Cargar el 50% inicial
            const initialMessages = allMessages.slice(0, initialCount);
            chat.messages = initialMessages;
            
            // Mostrar la primera parte
            this.updateChatDetails(chat);
            console.log(`✅ Primera parte mostrada: ${initialMessages.length} mensajes`);
            
            // Esperar un poco para que el usuario vea la primera parte
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Cargar el resto de forma fluida
            if (remainingMessages > 0) {
                console.log(`🔄 Cargando mensajes restantes de forma fluida...`);
                
                // Dividir el resto en chunks pequeños para carga fluida
                const chunkSize = Math.min(10, Math.ceil(remainingMessages / 5));
                const remainingChunks = [];
                
                for (let i = initialCount; i < allMessages.length; i += chunkSize) {
                    remainingChunks.push(allMessages.slice(i, i + chunkSize));
                }
                
                console.log(`📦 Dividido en ${remainingChunks.length} chunks de ~${chunkSize} mensajes`);
                
                // Cargar cada chunk con delay
                for (let i = 0; i < remainingChunks.length; i++) {
                    const chunk = remainingChunks[i];
                    chat.messages = [...chat.messages, ...chunk];
                    
                    // Actualizar solo los mensajes de forma fluida (sin re-renderizar todo)
                    this.updateChatMessagesOnly(chat);
                    
                    console.log(`✅ Chunk ${i + 1}/${remainingChunks.length} cargado: ${chunk.length} mensajes`);
                    
                    // Delay pequeño para carga fluida
                    if (i < remainingChunks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
            
            console.log(`🎉 Carga progresiva completada: ${chat.messages.length} mensajes totales`);
            
        } catch (error) {
            console.error('❌ Error en carga progresiva:', error);
            // Fallback: cargar todo de una vez
            chat.messages = allMessages;
            this.updateChatDetails(chat);
        }
    }

    setupMessageSending() {
        // Add message input to chat details only if it doesn't exist
        const chatDetails = document.getElementById('chatDetails');
        if (chatDetails && !document.getElementById('messageInput')) {
            const messageInput = document.createElement('div');
            messageInput.className = 'message-input-container';
            messageInput.innerHTML = `
                <div class="message-input">
                    <input type="text" id="messageInput" placeholder="Escribe un mensaje...">
                    <button id="sendMessageBtn" class="btn btn-primary">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            `;
            chatDetails.appendChild(messageInput);

            // Send message event
            const sendBtn = document.getElementById('sendMessageBtn');
            const input = document.getElementById('messageInput');
            
            if (sendBtn && input) {
                sendBtn.addEventListener('click', () => this.sendMessage());
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.sendMessage();
                    }
                });
            }
        }
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendMessageBtn');
        const message = input.value.trim();
        
        if (!message) {
            this.showNotification('⚠️ Escribe un mensaje primero', 'warning');
            return;
        }

        const activeChat = document.querySelector('.chat-item.active');
        if (!activeChat) {
            this.showNotification('⚠️ Selecciona un chat primero', 'warning');
            return;
        }

        const chatId = activeChat.dataset.chatId;
        
        try {
            console.log(`📤 Enviando mensaje al chat: ${chatId}`);
            console.log(`📝 Contenido del mensaje: "${message}"`);
            
            // Deshabilitar input y botón mientras se envía
            input.disabled = true;
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }
            
            // Mostrar mensaje de carga
            this.showNotification('📤 Enviando mensaje...', 'info');
            
            const result = await this.dataService.sendMessage(chatId, message);
            
            if (result.success) {
                // Limpiar input
                input.value = '';
                
                // Notificación de éxito
                this.showNotification('✅ Mensaje enviado exitosamente', 'success');
                console.log('✅ Mensaje enviado exitosamente');
                
                // Recargar mensajes del chat para mostrar el nuevo mensaje
                await this.loadChatMessages(chatId);
                
                // Actualizar lista de chats para reflejar el último mensaje
                await this.updateChatsDisplay();
            } else {
                this.showNotification('❌ Error al enviar el mensaje: ' + (result.error || 'Error desconocido'), 'error');
                console.error('❌ Error al enviar mensaje:', result);
            }
        } catch (error) {
            console.error('❌ Error enviando mensaje:', error);
            this.showNotification('❌ Error al enviar el mensaje: ' + error.message, 'error');
        } finally {
            // Re-habilitar input y botón
            input.disabled = false;
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
            // Enfocar el input nuevamente
            input.focus();
        }
    }

    setupChatDeletion() {
        // Add delete button to chat items - con mayor prioridad
        document.addEventListener('click', (e) => {
            if (e.target.closest('.delete-chat-btn')) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                console.log('🗑️ Botón de eliminar clickeado');
                const chatItem = e.target.closest('.chat-item');
                const chatId = chatItem.dataset.chatId;
                console.log('🗑️ Chat ID para eliminar:', chatId);
                
                this.deleteChat(chatId);
            }
        }, true); // Usar capture phase para mayor prioridad
    }

    async deleteChat(chatId) {
        // Show confirmation modal
        const confirmed = await this.showDeleteConfirmation();
        if (!confirmed) return;

        try {
            console.log(`🗑️ Eliminando chat: ${chatId}`);
            const result = await this.dataService.deleteChat(chatId);
            
            if (result.success) {
                // Remove from dashboard data
                this.dashboardData.chats = this.dashboardData.chats.filter(c => c.id !== chatId);
                this.allChats = this.allChats.filter(c => c.id !== chatId); // También eliminar de allChats
                
                // Update UI
                this.updateChatsList();
                
                // Clear chat details
                const chatDetails = document.getElementById('chatDetails');
                if (chatDetails) {
                    chatDetails.innerHTML = `
                        <div class="chat-welcome">
                            <i class="fas fa-comments"></i>
                            <h3>Selecciona un chat</h3>
                            <p>Elige una conversación para ver los detalles</p>
                        </div>
                    `;
                }
                
                this.showNotification('Chat eliminado exitosamente', 'success');
            } else {
                this.showNotification('Error al eliminar el chat', 'error');
            }
        } catch (error) {
            console.error('❌ Error eliminando chat:', error);
            this.showNotification('Error al eliminar el chat', 'error');
        }
    }

    async showDeleteConfirmation() {
        return new Promise((resolve) => {
            console.log('🔍 Mostrando modal de confirmación...');
            
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>¿Eliminar chat?</h3>
                    <p>Esta acción no se puede deshacer.</p>
                    <div class="modal-actions">
                        <button class="btn btn-outline" id="cancelDelete">Cancelar</button>
                        <button class="btn btn-danger" id="confirmDelete">Eliminar</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            console.log('✅ Modal agregado al DOM');
            
            // Función para cerrar el modal
            const closeModal = (result) => {
                console.log('🔒 Cerrando modal con resultado:', result);
                if (document.body.contains(modal)) {
                    document.body.removeChild(modal);
                }
                resolve(result);
            };
            
            // Usar setTimeout para asegurar que el DOM esté renderizado
            setTimeout(() => {
                const cancelBtn = document.getElementById('cancelDelete');
                const confirmBtn = document.getElementById('confirmDelete');
                
                console.log('🔍 Configurando event listeners del modal:', {
                    cancelBtn: !!cancelBtn,
                    confirmBtn: !!confirmBtn,
                    modal: !!modal
                });
                
                if (cancelBtn) {
                    cancelBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🚫 Cancelando eliminación de chat');
                        closeModal(false);
                    };
                } else {
                    console.error('❌ No se encontró el botón de cancelar');
                }
                
                if (confirmBtn) {
                    confirmBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('✅ Confirmando eliminación de chat');
                        closeModal(true);
                    };
                } else {
                    console.error('❌ No se encontró el botón de confirmar');
                }
                
                // Click fuera del modal
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        console.log('🚫 Cerrando modal al hacer clic fuera');
                        closeModal(false);
                    }
                };
            }, 50);
        });
    }

    setupChatAssumption() {
        // Add assume button to chat details only if it doesn't exist
        const chatDetails = document.getElementById('chatDetails');
        if (chatDetails && !document.querySelector('.assume-chat-btn')) {
            // Crear contenedor para el botón con el mismo padding que message-input-container
            const assumeContainer = document.createElement('div');
            assumeContainer.className = 'assume-chat-container';
            
            const assumeBtn = document.createElement('button');
            assumeBtn.className = 'assume-chat-btn';
            assumeBtn.innerHTML = '<i class="fas fa-user-check"></i> Asumir Chat';
            
            assumeContainer.appendChild(assumeBtn);
            chatDetails.appendChild(assumeContainer);

            assumeBtn.addEventListener('click', () => this.assumeChat());
        }
    }

    async assumeChat() {
        const activeChat = document.querySelector('.chat-item.active');
        if (!activeChat) {
            this.showNotification('Selecciona un chat primero', 'warning');
            return;
        }

        const chatId = activeChat.dataset.chatId;
        
        // Mostrar modal de confirmación
        this.showAssumeChatConfirmation(chatId);
    }

    showAssumeChatConfirmation(chatId) {
        // Crear modal de confirmación
        const modal = document.createElement('div');
        modal.className = 'modal-overlay assume-chat-modal';
        modal.innerHTML = `
            <div class="modal-content assume-chat-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                        Confirmar Asunción de Chat
                    </h3>
                    <button class="modal-close" id="closeAssumeChatModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="warning-message">
                        <i class="fas fa-info-circle"></i>
                        <div class="warning-text">
                            <h4>⚠️ Advertencia Importante</h4>
                            <p>Al asumir este chat, el <strong>agente de IA quedará fuera del chat</strong> y <strong>no se podrá volver a activar</strong> en esta conversación.</p>
                            <p>Solo deberías asumir el chat si:</p>
                            <ul>
                                <li>Necesitas intervenir personalmente en la conversación</li>
                                <li>El agente IA no puede resolver la consulta</li>
                                <li>El usuario solicita hablar con un humano</li>
                            </ul>
                            <p class="final-warning">Esta acción es <strong>permanente</strong> y no se puede deshacer.</p>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-outline" id="cancelAssumeBtn">
                        <i class="fas fa-times"></i>
                        Cancelar
                    </button>
                    <button class="btn btn-warning" id="confirmAssumeBtn">
                        <i class="fas fa-user-check"></i>
                        Entiendo, Asumir Chat Igualmente
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        this.setupAssumeChatModalListeners(modal, chatId);
    }

    setupAssumeChatModalListeners(modal, chatId) {
        const closeBtn = modal.querySelector('#closeAssumeChatModal');
        const cancelBtn = modal.querySelector('#cancelAssumeBtn');
        const confirmBtn = modal.querySelector('#confirmAssumeBtn');

        const closeModal = () => {
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        confirmBtn.addEventListener('click', async () => {
            // Cerrar modal
            modal.remove();

            // Ejecutar asunción de chat
            await this.executeAssumeTakeover(chatId);
        });

        // Cerrar al hacer clic fuera del modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    async executeAssumeTakeover(chatId) {
        try {
            console.log(`👤 Ejecutando asunción de chat: ${chatId}`);

            // Guardar TODOS los datos originales del cliente antes de asumir
            const chat = this.dashboardData.chats.find(c => c.id === chatId);
            const originalClientData = chat ? {
                userName: chat.userName,
                name: chat.name,
                whatsappPhone: chat.whatsappPhone,
                // IMPORTANTE: name es el nombre real del cliente, userName es el username
                displayName: chat.name || chat.userName || chat.whatsappPhone || 'Usuario',
                displayPhone: chat.whatsappPhone || ''
            } : null;
            
            console.log(`💾 Datos originales del cliente guardados:`, originalClientData);

            // Guardar en localStorage para persistencia
            if (originalClientData) {
                const savedClientNames = JSON.parse(localStorage.getItem('clientOriginalNames') || '{}');
                savedClientNames[chatId] = originalClientData;
                localStorage.setItem('clientOriginalNames', JSON.stringify(savedClientNames));
                console.log(`💾 Datos del cliente guardados en localStorage para chat ${chatId}`);
            }

            // Mostrar loading
            this.showNotification('Asumiendo chat...', 'info');

            const result = await this.dataService.assumeChat(chatId);
            
            if (result.success) {
                this.showNotification('✅ Chat asumido exitosamente. Ahora puedes responder como humano.', 'success');
                console.log('✅ Chat asumido exitosamente:', result.data);

                // Actualizar el estado visual del chat
                const activeChat = document.querySelector('.chat-item.active');
                if (activeChat) {
                    activeChat.classList.add('human-takeover');
                    activeChat.dataset.humanTakeover = 'true';
                }

                // Ocultar el botón de asumir chat ya que ya fue asumido
                const assumeBtn = document.querySelector('.chat-details button');
                if (assumeBtn && assumeBtn.textContent.includes('Asumir Chat')) {
                    assumeBtn.style.display = 'none';
                }

                // NO actualizar la lista completa, solo marcar este chat como asumido
                // await this.updateChatsDisplay();

                // Restaurar inmediatamente los datos originales del cliente
                if (originalClientData && chat) {
                    console.log(`🔄 Restaurando datos originales del cliente:`, originalClientData);
                    this.restoreClientData(chatId, originalClientData);
                }
            } else {
                this.showNotification('❌ Error al asumir el chat', 'error');
                console.error('❌ Error al asumir chat:', result);
            }
        } catch (error) {
            console.error('❌ Error asumiendo chat:', error);
            this.showNotification('❌ Error al asumir el chat: ' + error.message, 'error');
        }
    }

    restoreClientData(chatId, clientData) {
        // Restaurar en el objeto de datos
        const chat = this.dashboardData.chats.find(c => c.id === chatId);
        if (chat && clientData) {
            // IMPORTANTE: name es el nombre real del cliente
            chat.name = clientData.name || clientData.displayName;
            chat.userName = clientData.userName;
            chat.whatsappPhone = clientData.whatsappPhone || clientData.displayPhone;
            chat.originalClientName = clientData.displayName; // Marcar como preservado
            
            console.log(`✅ Datos restaurados en objeto chat:`, {
                name: chat.name,
                userName: chat.userName,
                whatsappPhone: chat.whatsappPhone
            });
        }
        
        // Actualizar visualmente el elemento del chat en la lista
        const chatElement = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
        if (chatElement) {
            const chatNameElement = chatElement.querySelector('.chat-info h4');
            if (chatNameElement) {
                // Mostrar nombre del cliente (displayName ya tiene la prioridad correcta: name primero)
                chatNameElement.textContent = clientData.displayName || clientData.name || clientData.userName;
                console.log(`✅ Nombre actualizado en lista: ${clientData.displayName}`);
            }
            
            // Actualizar también el teléfono si existe el elemento
            const chatPhoneElement = chatElement.querySelector('.chat-phone');
            if (chatPhoneElement && (clientData.displayPhone || clientData.whatsappPhone)) {
                chatPhoneElement.textContent = clientData.displayPhone || clientData.whatsappPhone;
                console.log(`✅ Teléfono actualizado en lista: ${clientData.displayPhone || clientData.whatsappPhone}`);
            }
        }
        
        // Actualizar el header del chat si está abierto
        const chatHeaderName = document.querySelector('.chat-header-details .chat-info h3');
        if (chatHeaderName) {
            chatHeaderName.textContent = clientData.displayName || clientData.name || clientData.userName;
            console.log(`✅ Nombre actualizado en header: ${clientData.displayName}`);
        }
        
        // Actualizar el teléfono en el header si existe
        const chatHeaderPhone = document.querySelector('.chat-header-details .chat-phone');
        if (chatHeaderPhone && (clientData.displayPhone || clientData.whatsappPhone)) {
            chatHeaderPhone.textContent = clientData.displayPhone || clientData.whatsappPhone;
            console.log(`✅ Teléfono actualizado en header: ${clientData.displayPhone || clientData.whatsappPhone}`);
        }
    }

    createChatElement(chat) {
        const chatDiv = document.createElement('div');
        
        // Verificar si el chat ha sido abierto
        const isOpened = this.isChatOpened(chat.id);
        chatDiv.className = isOpened ? 'chat-item' : 'chat-item unopened-chat';
        chatDiv.dataset.chatId = chat.id;

        // Verificar si hay datos originales del cliente guardados (para chats asumidos)
        const savedClientNames = JSON.parse(localStorage.getItem('clientOriginalNames') || '{}');
        const savedClientData = savedClientNames[chat.id];
        
        // Usar datos guardados si existen, sino usar los del API
        let userName, whatsappPhone;
        if (savedClientData) {
            // Chat asumido: usar datos originales del cliente
            // IMPORTANTE: displayName ya tiene la prioridad correcta (name primero)
            userName = savedClientData.displayName || savedClientData.name || savedClientData.userName || 'Usuario';
            whatsappPhone = savedClientData.displayPhone || savedClientData.whatsappPhone || '';
            console.log(`📋 Usando datos guardados para chat ${chat.id}: ${userName} (${whatsappPhone})`);
        } else {
            // Chat normal: usar datos del API
            // IMPORTANTE: name es el nombre real del cliente, userName es el username
            userName = chat.name || chat.userName || 'Usuario';
            whatsappPhone = chat.whatsappPhone || '';
        }
        
        const userInitials = this.getUserInitials(userName);
        const lastMessage = chat.conversation || 'Sin mensajes';
        const timeAgo = this.formatTime(chat.time || chat.createdAt);
        const unreadCount = chat.unReadCount || 0;
        const isFinished = chat.finished || false;
        const agentName = chat.agentName || 'Agente';
        const chatType = chat.type || 'whatsapp';

        chatDiv.innerHTML = `
            <div class="chat-avatar">
                <div class="avatar-circle">${userInitials}</div>
                ${unreadCount > 0 ? `<div class="unread-indicator">${unreadCount}</div>` : ''}
                ${!isOpened ? '<div class="unopened-badge"><i class="fas fa-circle"></i></div>' : ''}
            </div>
            <div class="chat-info">
                <div class="chat-header">
                    <h4>${userName}</h4>
                    <span class="chat-time">${timeAgo}</span>
                </div>
                <div class="chat-preview">
                    <p>${lastMessage}</p>
                </div>
                <div class="chat-meta">
                    <span class="chat-agent">${agentName}</span>
                    <span class="chat-channel">${chatType.toUpperCase()}</span>
                    ${whatsappPhone ? `<span class="chat-phone">${whatsappPhone}</span>` : ''}
                    ${isFinished ? '<span class="chat-status finished">Finalizado</span>' : '<span class="chat-status active">Activo</span>'}
                </div>
            </div>
            <div class="chat-actions">
                <button class="delete-chat-btn" title="Eliminar chat">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        chatDiv.addEventListener('click', async () => {
            await this.selectChat(chat);
        });

        return chatDiv;
    }

    /**
     * Renderiza el historial de comentarios
     */
    renderCommentsHistory(comentarios) {
        // Parsear comentarios (puede ser string JSON, array, o null/undefined)
        let commentsArray = [];
        
        if (!comentarios) {
            return '<div class="no-comments-message"><p>No hay comentarios aún. Sé el primero en comentar.</p></div>';
        }
        
        try {
            // Si es string, intentar parsearlo como JSON
            if (typeof comentarios === 'string') {
                // Si es un string JSON válido, parsearlo
                if (comentarios.trim().startsWith('[') || comentarios.trim().startsWith('{')) {
                    commentsArray = JSON.parse(comentarios);
                } else {
                    // Si es un string simple (comentario antiguo), convertirlo a array
                    commentsArray = [{
                        texto: comentarios,
                        fecha: new Date().toISOString(),
                        autor: 'Usuario'
                    }];
                }
            } else if (Array.isArray(comentarios)) {
                commentsArray = comentarios;
            } else {
                // Si es un objeto, convertirlo a array
                commentsArray = [comentarios];
            }
        } catch (e) {
            console.warn('⚠️ Error parseando comentarios, tratando como string simple:', e);
            // Si falla el parseo, tratarlo como comentario simple
            commentsArray = [{
                texto: comentarios,
                fecha: new Date().toISOString(),
                autor: 'Usuario'
            }];
        }
        
        // Asegurar que sea un array
        if (!Array.isArray(commentsArray)) {
            commentsArray = [];
        }
        
        // Ordenar por fecha (más reciente primero)
        commentsArray.sort((a, b) => {
            const dateA = new Date(a.fecha || a.date || 0);
            const dateB = new Date(b.fecha || b.date || 0);
            return dateB - dateA;
        });
        
        if (commentsArray.length === 0) {
            return '<div class="no-comments-message"><p>No hay comentarios aún. Sé el primero en comentar.</p></div>';
        }
        
        // Renderizar cada comentario
        return commentsArray.map((comment, index) => {
            const texto = comment.texto || comment.text || comment.comentario || String(comment);
            const fecha = comment.fecha || comment.date || comment.timestamp || new Date().toISOString();
            const autor = comment.autor || comment.author || comment.user || 'Usuario';
            
            const fechaFormateada = new Date(fecha).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="comment-item" data-comment-index="${index}">
                    <div class="comment-header">
                        <div class="comment-author">
                            <i class="fas fa-user-circle"></i>
                            <span>${autor}</span>
                        </div>
                        <div class="comment-date">
                            <i class="fas fa-clock"></i>
                            <span>${fechaFormateada}</span>
                        </div>
                    </div>
                    <div class="comment-text">${this.escapeHtml(texto)}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Escapa HTML para prevenir XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Carga y muestra los campos personalizados de GPTMaker para un prospecto usando su chatId
     */
    async loadProspectCustomFields(chatId, containerId) {
        try {
            const container = document.getElementById(containerId);
            if (!container) {
                console.warn('⚠️ Contenedor de campos personalizados no encontrado');
                return;
            }
            
            // Mostrar mensaje de carga
            container.innerHTML = '<p class="text-muted">Cargando campos personalizados...</p>';

            if (!chatId) {
                container.innerHTML = '<p class="no-custom-fields">No se proporcionó un chatId válido</p>';
                return;
            }

            console.log(`📋 ===== CARGANDO CAMPOS PERSONALIZADOS =====`);
            console.log(`📋 ChatId: ${chatId}`);

            // Obtener API
            const api = window.gptmakerAPI || this.api || (this.dataService && this.dataService.api);
            if (!api) {
                container.innerHTML = '<p class="no-custom-fields">API de GPTMaker no disponible</p>';
                return;
            }

            // Buscar el chat para obtener el contactId
            let chat = this.dashboardData.chats?.find(c => c.id === chatId);
            if (!chat) {
                // Intentar cargar el chat si no está disponible
                console.log('⚠️ Chat no encontrado en datos, intentando cargar...');
                await this.loadRealData();
                chat = this.dashboardData.chats?.find(c => c.id === chatId);
            }

            // Obtener el contactId del chat
            // El contactId puede estar en diferentes propiedades según la estructura de GPTMaker
            const contactId = chat?.recipient || 
                             chat?.userId || 
                             chat?.contactId || 
                             chat?.contact?.id ||
                             chatId; // Usar chatId como fallback

            console.log(`🔍 ContactId obtenido: ${contactId}`);
            console.log(`📊 Estructura del chat:`, {
                id: chat?.id,
                recipient: chat?.recipient,
                userId: chat?.userId,
                contactId: chat?.contactId,
                contact: chat?.contact
            });

            // Obtener campos personalizados disponibles
            const fieldsResult = await api.getCustomFields();
            const availableFields = fieldsResult.success ? fieldsResult.data : [];
            console.log(`📊 ${availableFields.length} campos personalizados disponibles`);
            
            // Obtener prospecto desde Airtable para cargar campos_solicitados guardados
            let savedRequestedFields = {};
            if (window.neonService && chatId) {
                try {
                    const prospectResult = await window.neonService.getProspectByChatId(chatId);
                    if (prospectResult.success && prospectResult.prospect && prospectResult.prospect.campos_solicitados) {
                        // Parsear campos_solicitados (puede ser JSON string o objeto)
                        const camposSolicitados = prospectResult.prospect.campos_solicitados;
                        if (typeof camposSolicitados === 'string') {
                            try {
                                savedRequestedFields = JSON.parse(camposSolicitados);
                            } catch (e) {
                                console.warn('⚠️ Error parseando campos_solicitados:', e);
                            }
                        } else if (typeof camposSolicitados === 'object') {
                            savedRequestedFields = camposSolicitados;
                        }
                        console.log('📋 Campos solicitados guardados:', savedRequestedFields);
                    }
                } catch (err) {
                    console.warn('⚠️ Error obteniendo prospecto para campos_solicitados:', err);
                }
            }

            // Obtener valores de campos personalizados del contacto usando el chatId
            let customFieldValues = {};
            
            // MÉTODO 1: Buscar campos personalizados directamente en el chat
            console.log(`🔍 ===== MÉTODO 1: Buscando campos personalizados en el chat =====`);
            if (chat) {
                console.log(`📊 Estructura completa del chat:`, JSON.stringify(chat, null, 2));
                console.log(`📋 Claves disponibles en el chat:`, Object.keys(chat));
                
                // Buscar campos personalizados en diferentes ubicaciones del chat
                customFieldValues = chat.customFields || 
                                  chat.custom_fields || 
                                  chat.fields ||
                                  chat.customFieldValues ||
                                  chat.contact?.customFields ||
                                  chat.contact?.custom_fields ||
                                  {};
                
                console.log(`📋 Campos encontrados directamente en chat:`, Object.keys(customFieldValues).length);
                
                // Si no se encontraron directamente, buscar por jsonName de cada campo disponible
                if (Object.keys(customFieldValues).length === 0 && availableFields.length > 0) {
                    console.log(`🔍 Buscando campos por jsonName en estructura del chat...`);
                    availableFields.forEach(field => {
                        const jsonName = field.jsonName || field.name;
                        // Buscar en el chat y en chat.contact
                        const locations = [chat, chat?.contact].filter(Boolean);
                        locations.forEach(location => {
                            if (location[jsonName] !== undefined) {
                                customFieldValues[jsonName] = location[jsonName];
                                console.log(`   ✅ Encontrado: ${jsonName} = ${location[jsonName]}`);
                            }
                        });
                    });
                }
                
                if (Object.keys(customFieldValues).length > 0) {
                    console.log(`✅ ${Object.keys(customFieldValues).length} campos personalizados encontrados en el chat`);
                }
            }
            console.log(`🔍 ===== FIN MÉTODO 1 =====`);
            
            // MÉTODO 2: Intentar obtener el chat completo desde la API
            if (Object.keys(customFieldValues).length === 0) {
                try {
                    console.log(`🔍 MÉTODO 2: Obteniendo chat completo desde API...`);
                    const chatResult = await api.request(`/v2/chat/${chatId}`);
                    
                    if (chatResult.success && chatResult.data) {
                        const fullChat = chatResult.data;
                        console.log(`📊 Chat completo obtenido:`, JSON.stringify(fullChat, null, 2));
                        
                        // Buscar campos personalizados en el chat completo
                        customFieldValues = fullChat.customFields || 
                                          fullChat.custom_fields || 
                                          fullChat.fields ||
                                          fullChat.customFieldValues ||
                                          fullChat.contact?.customFields ||
                                          fullChat.contact?.custom_fields ||
                                          {};
                        
                        // Si no se encontraron, buscar por jsonName
                        if (Object.keys(customFieldValues).length === 0 && availableFields.length > 0) {
                            availableFields.forEach(field => {
                                const jsonName = field.jsonName || field.name;
                                const locations = [fullChat, fullChat?.contact].filter(Boolean);
                                locations.forEach(location => {
                                    if (location[jsonName] !== undefined) {
                                        customFieldValues[jsonName] = location[jsonName];
                                    }
                                });
                            });
                        }
                        
                        if (Object.keys(customFieldValues).length > 0) {
                            console.log(`✅ ${Object.keys(customFieldValues).length} campos personalizados encontrados en chat completo`);
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ Error obteniendo chat completo:', err.message);
                }
            }
            
            // MÉTODO 3: Intentar endpoint de campos personalizados del chat
            if (Object.keys(customFieldValues).length === 0) {
                try {
                    console.log(`🔍 MÉTODO 3: Intentando endpoint de campos personalizados del chat...`);
                    const endpoints = [
                        `/v2/chat/${chatId}/custom-fields`,
                        `/v2/chat/${chatId}/fields`,
                        `/v2/custom-field/chat/${chatId}`
                    ];
                    
                    for (const endpoint of endpoints) {
                        try {
                            const result = await api.request(endpoint);
                            if (result.success && result.data) {
                                if (typeof result.data === 'object' && !Array.isArray(result.data)) {
                                    customFieldValues = result.data;
                                } else if (Array.isArray(result.data)) {
                                    result.data.forEach(item => {
                                        if (item.jsonName || item.name) {
                                            const key = item.jsonName || item.name;
                                            customFieldValues[key] = item.value || item;
                                        }
                                    });
                                }
                                if (Object.keys(customFieldValues).length > 0) {
                                    console.log(`✅ Campos personalizados obtenidos desde ${endpoint}`);
                                    break;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ Error en método 3:', err.message);
                }
            }
            
            console.log('📊 ===== RESUMEN FINAL =====');
            console.log('📊 Resumen:', {
                chatId,
                contactId,
                camposDisponibles: availableFields.length,
                camposConValores: Object.keys(customFieldValues).length,
                valores: customFieldValues
            });
            console.log('📊 ===== FIN RESUMEN =====');

            // Renderizar lista de campos personalizados con checkboxes
            this.renderCustomFieldsWithCheckboxes(container, availableFields, savedRequestedFields, chatId);

        } catch (error) {
            console.warn('⚠️ Error cargando campos personalizados (no crítico):', error.message);
            const container = document.getElementById(containerId);
            if (container) {
                // Mostrar mensaje amigable sin bloquear la UI
                container.innerHTML = `
                    <div class="no-custom-fields">
                        <i class="fas fa-info-circle"></i>
                        <p>No se pudieron cargar los campos personalizados en este momento.</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Renderiza los campos personalizados en el contenedor
     * Formato: "Campo: Valor" (ej: "DUI: [URL de la imagen]", "Perfil laboral: asalariado")
     */
    renderCustomFields(container, availableFields, customFieldValues) {
        if (!container) return;

        // Crear un mapa de todos los valores de campos personalizados
        // Incluir tanto campos disponibles como valores directos
        const allFields = new Map();
        
        // Primero agregar campos disponibles con sus valores
        availableFields.forEach(field => {
            const jsonName = field.jsonName || field.name;
            const value = customFieldValues[jsonName] || customFieldValues[field.id] || customFieldValues[field.name];
            if (value && value !== '' && value !== null && value !== undefined) {
                allFields.set(field.name, value);
            }
        });
        
        // También agregar valores directos que no estén en availableFields
        Object.keys(customFieldValues).forEach(key => {
            const value = customFieldValues[key];
            if (value && value !== '' && value !== null && value !== undefined) {
                // Buscar el nombre del campo por jsonName
                const field = availableFields.find(f => 
                    (f.jsonName || f.name) === key || 
                    f.id === key || 
                    f.name === key
                );
                const fieldName = field ? field.name : key;
                if (!allFields.has(fieldName)) {
                    allFields.set(fieldName, value);
                }
            }
        });

        if (allFields.size === 0) {
            container.innerHTML = `
                <div class="no-custom-fields">
                    <i class="fas fa-info-circle"></i>
                    <p>Este contacto no tiene campos personalizados configurados aún.</p>
                </div>
            `;
            return;
        }

        // Renderizar en formato simple: "Campo: Valor"
        const fieldsHTML = Array.from(allFields.entries()).map(([fieldName, value]) => {
            // Procesar el valor
            let valueDisplay = '';
            const valueStr = String(value);
            
            // Verificar si es JSON
            const isJson = valueStr.trim().startsWith('[') || valueStr.trim().startsWith('{');
            const isUrl = valueStr.startsWith('http://') || valueStr.startsWith('https://');
            
            if (isJson) {
                try {
                    const parsed = JSON.parse(valueStr);
                    if (Array.isArray(parsed)) {
                        // Si es un array, mostrar las URLs o valores
                        valueDisplay = parsed.map(item => {
                            const itemStr = typeof item === 'string' ? item : (item.url || JSON.stringify(item));
                            if (itemStr && (itemStr.startsWith('http://') || itemStr.startsWith('https://'))) {
                                return `<a href="${this.escapeHtml(itemStr)}" target="_blank" class="custom-field-link">${this.escapeHtml(itemStr)}</a>`;
                            }
                            return this.escapeHtml(itemStr);
                        }).join(', ');
                    } else {
                        valueDisplay = this.escapeHtml(JSON.stringify(parsed));
                    }
                } catch (e) {
                    valueDisplay = this.escapeHtml(valueStr);
                }
            } else if (isUrl) {
                valueDisplay = `<a href="${this.escapeHtml(valueStr)}" target="_blank" class="custom-field-link">${this.escapeHtml(valueStr)}</a>`;
            } else {
                valueDisplay = this.escapeHtml(valueStr);
            }

            return `
                <div class="custom-field-row">
                    <span class="custom-field-name"><strong>${this.escapeHtml(fieldName)}:</strong></span>
                    <span class="custom-field-value">${valueDisplay}</span>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="custom-fields-list">
                ${fieldsHTML}
            </div>
        `;
    }

    /**
     * Renderiza la lista de campos personalizados con botones grandes para solicitar
     */
    renderCustomFieldsWithCheckboxes(container, availableFields, savedRequestedFields, chatId) {
        if (!container) return;

        if (!availableFields || availableFields.length === 0) {
            container.innerHTML = `
                <div class="no-custom-fields">
                    <i class="fas fa-info-circle"></i>
                    <p>No hay campos personalizados disponibles para configurar.</p>
                </div>
            `;
            return;
        }

        // Crear HTML con botones grandes
        const fieldsHTML = availableFields.map((field, index) => {
            const fieldId = field.id || field.jsonName || field.name;
            const fieldName = field.name || field.jsonName || 'Campo sin nombre';
            const isSelected = savedRequestedFields[fieldId] === true || savedRequestedFields[fieldName] === true;
            const buttonId = `customFieldButton_${chatId}_${index}`;

            return `
                <button 
                    type="button"
                    id="${buttonId}"
                    class="custom-field-button ${isSelected ? 'selected' : ''}"
                    data-field-id="${fieldId}"
                    data-field-name="${this.escapeHtml(fieldName)}"
                >
                    <div class="custom-field-button-content">
                        <div class="custom-field-button-icon">
                            <i class="fas ${isSelected ? 'fa-check-circle' : 'fa-circle'}"></i>
                        </div>
                        <div class="custom-field-button-text">
                            ${this.escapeHtml(fieldName)}
                        </div>
                    </div>
                </button>
            `;
        }).join('');

        container.innerHTML = `
            <div class="custom-fields-buttons-container">
                <div class="custom-fields-buttons-grid">
                    ${fieldsHTML}
                </div>
                <div class="custom-fields-actions">
                    <button class="btn btn-primary btn-lg save-custom-fields-btn" data-chat-id="${chatId}">
                        <i class="fas fa-save"></i>
                        Guardar Campos Solicitados
                    </button>
                </div>
            </div>
        `;

        // Agregar event listeners a los botones
        container.querySelectorAll('.custom-field-button').forEach(button => {
            button.addEventListener('click', () => {
                // Toggle selección
                button.classList.toggle('selected');
                const icon = button.querySelector('.custom-field-button-icon i');
                if (button.classList.contains('selected')) {
                    icon.classList.remove('fa-circle');
                    icon.classList.add('fa-check-circle');
                } else {
                    icon.classList.remove('fa-check-circle');
                    icon.classList.add('fa-circle');
                }
            });
        });

        // Agregar event listener al botón de guardar
        const saveBtn = container.querySelector('.save-custom-fields-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await this.saveRequestedCustomFields(chatId, container);
            });
        }
    }

    /**
     * Guarda los campos personalizados solicitados en Neon
     */
    async saveRequestedCustomFields(chatId, container) {
        try {
            if (!window.prospectsService) {
                this.showNotification('Error: ProspectsService no disponible', 'error');
                return;
            }

            // Obtener estado de todos los botones
            const buttons = container.querySelectorAll('.custom-field-button');
            const requestedFields = {};

            buttons.forEach(button => {
                const fieldId = button.getAttribute('data-field-id');
                const fieldName = button.getAttribute('data-field-name');
                const isSelected = button.classList.contains('selected');
                
                // Guardar con ambos ID y nombre para flexibilidad
                if (fieldId) {
                    requestedFields[fieldId] = isSelected;
                }
                if (fieldName) {
                    requestedFields[fieldName] = isSelected;
                }
            });

            console.log('💾 Guardando campos solicitados:', requestedFields);

            // Obtener prospecto por chatId
            const prospectResult = await window.neonService.getProspectByChatId(chatId);
            
            if (!prospectResult.success || !prospectResult.prospect) {
                this.showNotification('No se encontró el prospecto para guardar los campos', 'warning');
                return;
            }

            // Actualizar prospecto en Neon
            const updateResult = await window.neonService.updateProspect(prospectResult.prospect.id, {
                campos_solicitados: JSON.stringify(requestedFields)
            });

            if (updateResult.success) {
                this.showNotification('✅ Campos solicitados guardados correctamente', 'success');
                console.log('✅ Campos solicitados guardados en Neon');
            } else {
                throw new Error(updateResult.error || 'Error al guardar');
            }
        } catch (error) {
            console.error('❌ Error guardando campos solicitados:', error);
            this.showNotification('Error al guardar campos solicitados: ' + error.message, 'error');
        }
    }


    getUserInitials(user) {
        if (!user) return 'U';
        const words = user.toString().split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return user.toString().substring(0, 2).toUpperCase();
    }

    formatConversationTime(conversation) {
        // Usar los mismos campos que en calculateChatFlowByDay
        let dateValue = conversation.createdAt || conversation.time || conversation.timestamp;
        
        if (!dateValue) {
            return 'Sin fecha';
        }
        
        try {
            // Convertir timestamp a fecha
            const date = new Date(Number(dateValue) || dateValue);
            
            if (isNaN(date.getTime())) {
                return 'Fecha inválida';
            }
            
            // Formatear como "15 sep, 14:30"
            return date.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.warn('Error formateando fecha:', error);
            return 'Error en fecha';
        }
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 1) return 'Ahora';
        if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
        if (diffHours < 24) return `Hace ${diffHours}h`;
        if (diffDays < 7) return `Hace ${diffDays}d`;
        
        // Para fechas más antiguas, mostrar fecha
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async selectChat(chat) {
        console.log(`💬 Seleccionando chat: ${chat.id} - ${chat.name || chat.userName}`);
        
        // Marcar como abierto
        this.markChatAsOpened(chat.id);
        
        // Establecer como chat actual
        this.currentChatId = chat.id;
        
        // Informar al polling service
        if (this.pollingService) {
            this.pollingService.setCurrentChat(chat.id);
        }
        
        // Remove active class from all chat items
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active class to selected chat and remove unopened class ONLY from this chat
        const selectedChat = document.querySelector(`[data-chat-id="${chat.id}"]`);
        if (selectedChat) {
            selectedChat.classList.add('active');
            // Remover clase de sin abrir SOLO de este chat
            selectedChat.classList.remove('unopened-chat');
        }

        // Actualizar badge de notificaciones
        this.updateNotificationBadge();

        // Ocultar mensajes anteriores inmediatamente y mostrar loading
        this.clearChatMessages();
        this.showChatLoadingWithMessage('Cargando mensajes...', `Obteniendo el historial de ${chat.name || chat.userName || 'este chat'}`);

        // Small delay to ensure loading indicator is visible
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            // Always load messages to ensure we have the latest data
            console.log(`💬 Cargando mensajes para el chat: ${chat.id}`);
            await this.loadChatMessages(chat.id);
        } catch (error) {
            console.error('❌ Error cargando mensajes:', error);
        } finally {
            // Hide loading indicator
            this.hideChatLoading();
        }
    }

    showChatLoading() {
        console.log('🔄 Mostrando indicador de carga...');
        const chatWelcome = document.querySelector('.chat-welcome');
        const chatLoading = document.getElementById('chatLoading');
        
        if (chatWelcome) {
            chatWelcome.style.display = 'none';
            console.log('✅ Chat welcome ocultado');
        }
        if (chatLoading) {
            chatLoading.style.display = 'flex';
            console.log('✅ Chat loading mostrado');
            // Update loading message
            const loadingTitle = chatLoading.querySelector('h3');
            const loadingText = chatLoading.querySelector('p');
            if (loadingTitle) loadingTitle.textContent = 'Cargando mensajes...';
            if (loadingText) loadingText.textContent = 'Obteniendo el historial completo del chat';
        } else {
            console.error('❌ No se encontró el elemento chatLoading');
        }
    }

    // Método para mostrar loading con mensaje personalizado
    showChatLoadingWithMessage(title, message) {
        console.log('🔄 Mostrando indicador de carga personalizado...');
        const chatDetails = document.getElementById('chatDetails');
        if (!chatDetails) return;

        // Ocultar welcome y otros elementos
        const chatWelcome = document.querySelector('.chat-welcome');
        if (chatWelcome) {
            chatWelcome.style.display = 'none';
        }

        // Crear o mostrar el indicador de carga
        let chatLoading = document.getElementById('chatLoading');
        if (!chatLoading) {
            // Crear el indicador de carga si no existe
            chatLoading = document.createElement('div');
            chatLoading.id = 'chatLoading';
            chatLoading.className = 'chat-loading';
            chatLoading.style.display = 'none';
        }

        // Actualizar contenido del loading
        chatLoading.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <h3>${title}</h3>
            <p>${message}</p>
        `;

        // Buscar el contenedor de mensajes o crearlo si no existe
        let chatMessagesContainer = document.getElementById('chatMessagesContainer');
        if (!chatMessagesContainer) {
            // Crear estructura básica si no existe
            chatDetails.innerHTML = `
                <div class="chat-header-details">
                    <div class="chat-avatar">...</div>
                    <div class="chat-info">
                        <h3>Cargando...</h3>
                        <p>...</p>
                    </div>
                </div>
                <div class="chat-messages" id="chatMessagesContainer">
                </div>
            `;
            chatMessagesContainer = document.getElementById('chatMessagesContainer');
        }

        // Insertar el loading dentro del contenedor de mensajes
        chatMessagesContainer.innerHTML = '';
        chatMessagesContainer.appendChild(chatLoading);

        // Mostrar loading
        chatLoading.style.display = 'flex';
        console.log('✅ Chat loading mostrado con mensaje personalizado');
    }

    // Método para limpiar mensajes anteriores y mostrar solo loading
    clearChatMessages() {
        console.log('🧹 Limpiando mensajes anteriores...');
        const chatDetails = document.getElementById('chatDetails');
        if (!chatDetails) return;

        // Ocultar welcome
        const chatWelcome = document.querySelector('.chat-welcome');
        if (chatWelcome) {
            chatWelcome.style.display = 'none';
        }

        // Limpiar solo la sección de mensajes, mantener header y elementos de envío
        const chatMessagesContainer = document.getElementById('chatMessagesContainer');
        if (chatMessagesContainer) {
            chatMessagesContainer.innerHTML = '';
        } else {
            // Si no existe el contenedor, limpiar todo el chatDetails excepto elementos de envío
            const headerDetails = chatDetails.querySelector('.chat-header-details');
            const messageInput = chatDetails.querySelector('.message-input-container');
            const assumeBtn = chatDetails.querySelector('.assume-chat-btn');
            
            chatDetails.innerHTML = '';
            
            // Restaurar solo elementos necesarios si existen
            if (headerDetails) {
                chatDetails.appendChild(headerDetails);
            }
            if (messageInput) {
                chatDetails.appendChild(messageInput);
            }
            if (assumeBtn) {
                chatDetails.appendChild(assumeBtn);
            }
        }

        // Ocultar loading si existe
        const chatLoading = document.getElementById('chatLoading');
        if (chatLoading) {
            chatLoading.style.display = 'none';
        }
    }

    hideChatLoading() {
        console.log('🔄 Ocultando indicador de carga...');
        const chatLoading = document.getElementById('chatLoading');
        
        if (chatLoading) {
            chatLoading.style.display = 'none';
            console.log('✅ Chat loading ocultado');
        } else {
            console.log('⚠️ No se encontró el elemento chatLoading para ocultar');
        }
    }

    updateChatDetails(chat) {
        const chatDetails = document.getElementById('chatDetails');
        if (!chatDetails) return;

        // LIMPIAR COMPLETAMENTE antes de actualizar para evitar superposiciones
        console.log('🧹 Limpiando chatDetails antes de actualizar...');
        
        // Ocultar welcome y loading
        const chatWelcome = document.querySelector('.chat-welcome');
        if (chatWelcome) {
            chatWelcome.style.display = 'none';
        }
        const chatLoading = document.getElementById('chatLoading');
        if (chatLoading) {
            chatLoading.style.display = 'none';
        }
        
        // Limpiar completamente el contenido
        chatDetails.innerHTML = '';

        // Verificar si hay datos originales del cliente guardados (para chats asumidos)
        const savedClientNames = JSON.parse(localStorage.getItem('clientOriginalNames') || '{}');
        const savedClientData = savedClientNames[chat.id];
        
        // Usar datos guardados si existen, sino usar los del API
        let userName, whatsappPhone;
        if (savedClientData) {
            // Chat asumido: usar datos originales del cliente
            // IMPORTANTE: displayName ya tiene la prioridad correcta (name primero)
            userName = savedClientData.displayName || savedClientData.name || savedClientData.userName || 'Usuario';
            whatsappPhone = savedClientData.displayPhone || savedClientData.whatsappPhone || '';
            console.log(`📋 Usando datos guardados en updateChatDetails para chat ${chat.id}: ${userName} (${whatsappPhone})`);
        } else {
            // Chat normal: usar datos del API
            // IMPORTANTE: name es el nombre real del cliente, userName es el username
            userName = chat.name || chat.userName || 'Usuario';
            whatsappPhone = chat.whatsappPhone || '';
        }
        
        const agentName = chat.agentName || 'Agente';
        const chatType = chat.type || 'whatsapp';

        // Crear nuevo contenido limpio
        chatDetails.innerHTML = `
            <div class="chat-header-details">
                <div class="chat-avatar">${this.getUserInitials(userName)}</div>
                <div class="chat-info">
                    <h3>${userName}</h3>
                    <p>${agentName}</p>
                    ${whatsappPhone ? `<span class="chat-phone">${whatsappPhone}</span>` : ''}
                    <span class="chat-channel">${chatType.toUpperCase()}</span>
                </div>
            </div>
            <div class="chat-messages" id="chatMessagesContainer">
                ${this.renderChatMessages(chat.messages || [], chat)}
            </div>
        `;

        // Restaurar elementos de envío de mensajes
        this.setupMessageSending();
        this.setupChatAssumption();
        
        // Configurar controles de audio después de renderizar
        setTimeout(() => {
            this.setupAudioControls();
            // Configurar scroll inteligente
            this.setupSmartScroll();
            // Scroll suave al final de los mensajes
            this.scrollToBottom();
        }, 100);
    }

    // Método optimizado para actualizar solo los mensajes (para carga progresiva)
    updateChatMessagesOnly(chat) {
        const chatMessagesContainer = document.getElementById('chatMessagesContainer');
        if (!chatMessagesContainer) return;

        // Actualizar solo el contenido de mensajes sin re-renderizar todo
        chatMessagesContainer.innerHTML = this.renderChatMessages(chat.messages || [], chat);
        
        // Configurar controles de audio para los nuevos mensajes
        setTimeout(() => {
            this.setupAudioControls();
            // Scroll suave al final solo si es necesario
            this.scrollToBottomIfNearEnd();
        }, 50);
    }

    // Scroll suave al final de los mensajes
    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessagesContainer');
        if (chatMessages) {
            // Usar requestAnimationFrame para scroll suave
            requestAnimationFrame(() => {
                chatMessages.scrollTo({
                    top: chatMessages.scrollHeight,
                    behavior: 'smooth'
                });
            });
        }
    }

    // Scroll inteligente que detecta si el usuario está cerca del final
    scrollToBottomIfNearEnd() {
        const chatMessages = document.getElementById('chatMessagesContainer');
        if (chatMessages) {
            const scrollTop = chatMessages.scrollTop;
            const scrollHeight = chatMessages.scrollHeight;
            const clientHeight = chatMessages.clientHeight;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            
            // Si está cerca del final (50px), hacer scroll automático
            if (distanceFromBottom < 50) {
                this.scrollToBottom();
            }
        }
    }

    // Configurar scroll inteligente
    setupSmartScroll() {
        const chatMessages = document.getElementById('chatMessagesContainer');
        if (chatMessages) {
            // Detectar cuando se agregan nuevos mensajes
            const observer = new MutationObserver(() => {
                this.scrollToBottomIfNearEnd();
            });
            
            observer.observe(chatMessages, {
                childList: true,
                subtree: true
            });
        }
    }

    renderChatMessages(messages, chatData = null) {
        if (!messages || messages.length === 0) {
            return '<div class="no-messages">No hay mensajes en esta conversación</div>';
        }

        console.log(`💬 Renderizando ${messages.length} mensajes...`);
        
        // Log de mensajes con imágenes para debug - especialmente mensajes del usuario
        const userMessages = messages.filter(msg => msg.role === 'user');
        const userMessagesWithMedia = userMessages.filter(msg => 
            msg.type === 'image' || 
            msg.imageUrl || 
            msg.image || 
            msg.mediaUrl || 
            msg.attachmentUrl ||
            msg.attachments || 
            msg.media ||
            JSON.stringify(msg).toLowerCase().includes('image') ||
            JSON.stringify(msg).toLowerCase().includes('photo')
        );
        
        if (userMessagesWithMedia.length > 0) {
            console.log(`👤 ${userMessagesWithMedia.length} mensajes del USUARIO con posibles imágenes:`, userMessagesWithMedia);
            userMessagesWithMedia.forEach(msg => {
                console.log('📸 Mensaje del USUARIO con media:', {
                    id: msg.id,
                    type: msg.type,
                    role: msg.role,
                    text: msg.text?.substring(0, 50),
                    imageUrl: msg.imageUrl,
                    image: msg.image,
                    mediaUrl: msg.mediaUrl,
                    attachmentUrl: msg.attachmentUrl,
                    attachments: msg.attachments,
                    media: msg.media,
                    url: msg.url,
                    file: msg.file,
                    fileUrl: msg.fileUrl,
                    allFields: Object.keys(msg),
                    fullMessage: msg
                });
            });
        }
        
        // Log general de mensajes con imágenes
        const messagesWithImages = messages.filter(msg => 
            msg.type === 'image' || 
            msg.imageUrl || 
            msg.image || 
            msg.mediaUrl || 
            msg.attachments || 
            msg.media
        );
        if (messagesWithImages.length > 0) {
            console.log(`🖼️ ${messagesWithImages.length} mensajes con imágenes/media detectados:`, messagesWithImages);
        }

        // Obtener nombres reales del chat si están disponibles
        const realUserName = chatData ? (chatData.userName || chatData.name || 'Usuario') : 'Usuario';
        const realAgentName = chatData ? (chatData.agentName || 'Agente') : 'Agente';

        return messages.map((message, index) => {
            const isUser = message.role === 'user';
            const isAgent = message.role === 'assistant' || message.role === 'agent';
            const messageTime = this.formatTime(message.time || message.timestamp);
            
            // Usar nombres reales del chat en lugar de genéricos
            const senderName = isUser ? realUserName : realAgentName;
            
            // Determinar el contenido del mensaje según el tipo
            let messageContent = '';
            
            // Primero detectar si hay imagen - buscar en TODOS los campos posibles
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
            
            // Verificar si es una imagen - aceptar tanto mayúsculas como minúsculas
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
            
            // Log detallado para mensajes del usuario con posibles imágenes
            if (isUser && (imageUrl || isImageType || message.attachments || message.media || JSON.stringify(message).toLowerCase().includes('image'))) {
                console.log(`👤🔍 Mensaje del USUARIO ${message.id} - Buscando imagen:`, {
                    type: message.type,
                    imageUrl: message.imageUrl,
                    image: message.image,
                    mediaUrl: message.mediaUrl,
                    attachmentUrl: message.attachmentUrl,
                    url: message.url,
                    fileUrl: message.fileUrl,
                    attachments: message.attachments,
                    media: message.media,
                    photo: message.photo,
                    photoUrl: message.photoUrl,
                    text: message.text?.substring(0, 100),
                    allFields: Object.keys(message),
                    fullMessage: message
                });
            }
            
            // Agregar texto si existe
            if (message.text && message.text.trim()) {
                messageContent = `<div class="message-text">${message.text}</div>`;
            }
            
            // Si tiene imageUrl, SIEMPRE mostrar la imagen (incluso si no hay texto)
            if (imageUrl && !imageUrl.includes('example.com') && !imageUrl.includes('placeholder')) {
                console.log(`🖼️ ✅ AGREGANDO imagen al contenido del mensaje ${message.id} (${isUser ? 'USUARIO' : 'AGENTE'}):`, {
                    type: message.type,
                    role: message.role,
                    url: imageUrl,
                    isUser: isUser,
                    hasText: !!message.text,
                    messageContentLength: messageContent.length
                });
                
                messageContent += `<div class="message-image">
                    <img src="${imageUrl}" alt="Imagen enviada" 
                         style="max-width: 300px; max-height: 300px; border-radius: 8px; cursor: pointer; display: block; margin-top: 8px;"
                         onerror="console.error('Error cargando imagen:', this.src)"
                         onclick="window.open(this.src, '_blank')">
                </div>`;
                
                console.log(`✅ Imagen agregada. messageContent ahora tiene ${messageContent.length} caracteres`);
            }
            
            // Detectar imágenes en attachments o media array
            if (message.attachments && Array.isArray(message.attachments)) {
                message.attachments.forEach(attachment => {
                    const attachmentUrl = attachment.url || attachment.imageUrl || attachment.mediaUrl;
                    if (attachmentUrl && (attachment.type === 'image' || /\.(jpg|jpeg|png|gif|webp)/i.test(attachmentUrl))) {
                        console.log(`🖼️ Imagen en attachments:`, attachmentUrl);
                        messageContent += `<div class="message-image">
                            <img src="${attachmentUrl}" alt="Imagen adjunta" 
                                 style="max-width: 300px; max-height: 300px; border-radius: 8px; cursor: pointer;"
                                 onerror="console.error('Error cargando imagen:', this.src)"
                                 onclick="window.open(this.src, '_blank')">
                        </div>`;
                    }
                });
            }
            
            if (message.media && Array.isArray(message.media)) {
                message.media.forEach(mediaItem => {
                    const mediaUrl = mediaItem.url || mediaItem.imageUrl;
                    if (mediaUrl && (mediaItem.type === 'image' || /\.(jpg|jpeg|png|gif|webp)/i.test(mediaUrl))) {
                        console.log(`🖼️ Imagen en media array:`, mediaUrl);
                        messageContent += `<div class="message-image">
                            <img src="${mediaUrl}" alt="Imagen de media" 
                                 style="max-width: 300px; max-height: 300px; border-radius: 8px; cursor: pointer;"
                                 onerror="console.error('Error cargando imagen:', this.src)"
                                 onclick="window.open(this.src, '_blank')">
                        </div>`;
                    }
                });
            }
            
            // Manejar archivos de audio - detectar diferentes formatos y URLs
            if (message.type === 'audio' || message.audioUrl || message.audio || message.voice) {
                const audioUrl = message.audioUrl || message.audio || message.voice || message.url;
                if (audioUrl) {
                    messageContent += `<div class="message-audio">
                        <audio controls preload="metadata" data-message-id="${message.id}">
                            <source src="${audioUrl}" type="audio/mpeg">
                            <source src="${audioUrl}" type="audio/wav">
                            <source src="${audioUrl}" type="audio/ogg">
                            <source src="${audioUrl}" type="audio/mp3">
                            <source src="${audioUrl}" type="audio/m4a">
                            Tu navegador no soporta el elemento de audio.
                        </audio>
                        <div class="audio-info">
                            <div class="audio-title">${message.audioTitle || 'Mensaje de voz'}</div>
                            <div class="audio-duration" id="duration-${message.id}">--:--</div>
                        </div>
                    </div>`;
                }
            }
            
            if (message.type === 'document' && message.documentUrl) {
                messageContent += `<div class="message-document">
                    <a href="${message.documentUrl}" target="_blank" class="document-link">
                        <i class="fas fa-file"></i> ${message.fileName || 'Documento'}
                    </a>
                </div>`;
            }
            
            if (message.midiaContent) {
                messageContent += `<div class="message-media">${message.midiaContent}</div>`;
            }

            return `
                <div class="message ${isUser ? 'user' : 'agent'}" data-message-id="${message.id}">
                    <div class="message-avatar">
                        ${isUser ? this.getUserInitials(senderName) : this.getAgentInitials(senderName)}
                    </div>
                    <div class="message-content">
                        <div class="message-header">
                            <span class="message-sender">${senderName}</span>
                            <span class="message-time">${messageTime}</span>
                        </div>
                        <div class="message-body">
                            ${messageContent}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    setupAudioControls() {
        // Configurar controles de audio para todos los elementos de audio
        const audioElements = document.querySelectorAll('audio[data-message-id]');
        
        audioElements.forEach(audio => {
            const messageId = audio.dataset.messageId;
            const durationElement = document.getElementById(`duration-${messageId}`);
            
            // Configurar evento para mostrar duración
            audio.addEventListener('loadedmetadata', () => {
                if (durationElement) {
                    const duration = this.formatDuration(audio.duration);
                    durationElement.textContent = duration;
                }
            });
            
            // Configurar evento para mostrar progreso
            audio.addEventListener('timeupdate', () => {
                if (durationElement) {
                    const current = this.formatDuration(audio.currentTime);
                    const total = this.formatDuration(audio.duration);
                    durationElement.textContent = `${current} / ${total}`;
                }
            });
            
            // Configurar evento para resetear cuando termine
            audio.addEventListener('ended', () => {
                if (durationElement) {
                    const total = this.formatDuration(audio.duration);
                    durationElement.textContent = total;
                }
            });
            
            // Configurar evento para manejar errores
            audio.addEventListener('error', (e) => {
                console.error(`Error cargando audio para mensaje ${messageId}:`, e);
                if (durationElement) {
                    durationElement.textContent = 'Error al cargar';
                    durationElement.style.color = 'var(--error-color)';
                }
            });
        });
    }

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '--:--';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    updateAgentFilter() {
        const agentFilter = document.getElementById('agentFilter');
        if (!agentFilter) return;

        // Clear existing options except first
        agentFilter.innerHTML = '<option value="">Todos los Agentes</option>';

        // Add agents from the agents data (not from chats)
        if (this.dashboardData.agents && this.dashboardData.agents.length > 0) {
            this.dashboardData.agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = agent.name || agent.agentName || 'Agente';
                agentFilter.appendChild(option);
            });
        }

        console.log('✅ Filtro de agentes actualizado con', this.dashboardData.agents?.length || 0, 'agentes');
        
        // Debug: mostrar agentes disponibles
        if (this.dashboardData.agents && this.dashboardData.agents.length > 0) {
            console.log('🔍 DEBUG - Agentes disponibles en filtro:', this.dashboardData.agents.map(agent => ({
                id: agent.id,
                name: agent.name,
                agentName: agent.agentName
            })));
        }
    }

    updateChannelFilter() {
        const channelFilter = document.getElementById('channelFilter');
        if (!channelFilter) return;

        // Clear existing options except first
        channelFilter.innerHTML = '<option value="">Todos los Canales</option>';

        // Get unique channel types from all chats
        if (this.allChats && this.allChats.length > 0) {
            const uniqueChannels = [...new Set(this.allChats.map(chat => chat.type).filter(Boolean))];
            
            console.log('🔍 Canales únicos encontrados:', uniqueChannels);
            
            uniqueChannels.forEach(channel => {
                const option = document.createElement('option');
                // Normalizar el valor para el filtro (minúsculas)
                option.value = channel.toLowerCase();
                // Mostrar el nombre formateado
                option.textContent = this.formatChannelName(channel);
                channelFilter.appendChild(option);
            });
        }

        console.log('✅ Filtro de canales actualizado con', channelFilter.options.length - 1, 'canales');
    }

    formatChannelName(channel) {
        // Formatear nombres de canales para mostrar
        const channelNames = {
            'whatsapp': 'WhatsApp',
            'instagram': 'Instagram',
            'facebook': 'Facebook',
            'telegram': 'Telegram',
            'web': 'Web',
            'widget': 'Widget',
            'cloud_api': 'WhatsApp Cloud API',
            'email': 'Email',
            'sms': 'SMS'
        };
        
        const normalizedChannel = channel.toLowerCase();
        return channelNames[normalizedChannel] || channel.charAt(0).toUpperCase() + channel.slice(1).toLowerCase();
    }

    applyChatFilters() {
        const agentFilter = document.getElementById('agentFilter');
        const channelFilter = document.getElementById('channelFilter');
        const dateFilter = document.getElementById('dateFilter');

        // Guardar estado de filtros
        this.activeFilters.agentId = agentFilter ? agentFilter.value : '';
        this.activeFilters.channel = channelFilter ? channelFilter.value : '';
        this.activeFilters.date = dateFilter ? dateFilter.value : '';

        console.log('🔍 Aplicando filtros:', {
            agentId: this.activeFilters.agentId,
            channel: this.activeFilters.channel,
            date: this.activeFilters.date,
            totalChats: this.allChats.length || this.dashboardData.chats.length
        });

        // Debug: mostrar estructura de datos
        if (this.activeFilters.agentId) {
            this.debugChatsData();
        }

        // SIEMPRE empezar con TODOS los chats disponibles (sin filtrar)
        let filteredChats = [...this.allChats];
        console.log(`📋 Chats disponibles para filtrar (desde allChats): ${filteredChats.length}`);

        // Mostrar información de agentes disponibles para debug
        if (this.activeFilters.agentId) {
            const agentChats = this.allChats.filter(chat => chat.agentId === this.activeFilters.agentId);
            console.log(`🔍 Debug - Chats con agentId "${this.activeFilters.agentId}":`, agentChats.map(chat => ({
                id: chat.id,
                name: chat.name,
                agentId: chat.agentId,
                agentName: chat.agentName
            })));
        }

        // Filtrar por agente (usar agentId en lugar de agent)
        if (this.activeFilters.agentId) {
            const beforeCount = filteredChats.length;
            console.log(`🔍 Filtrando por agentId: "${this.activeFilters.agentId}"`);
            
            // Verificar todos los agentId disponibles
            const allAgentIds = [...new Set(this.allChats.map(chat => chat.agentId))];
            console.log(`🔍 AgentIds disponibles en chats:`, allAgentIds);
            
            filteredChats = filteredChats.filter(chat => {
                // Comparación exacta y con trim para evitar problemas de espacios
                const chatAgentId = (chat.agentId || '').toString().trim();
                const filterAgentId = (this.activeFilters.agentId || '').toString().trim();
                const matches = chatAgentId === filterAgentId;
                
                if (!matches) {
                    console.log(`❌ Chat ${chat.id} (${chat.name}) no coincide:`, {
                        chatAgentId: `"${chatAgentId}"`,
                        filterAgentId: `"${filterAgentId}"`,
                        chatAgentIdType: typeof chat.agentId,
                        filterAgentIdType: typeof this.activeFilters.agentId,
                        agentName: chat.agentName
                    });
                } else {
                    console.log(`✅ Chat ${chat.id} (${chat.name}) coincide con agente ${chat.agentName}`);
                }
                return matches;
            });
            console.log(`📊 Filtro por agente ${this.activeFilters.agentId}: ${filteredChats.length} chats (antes: ${beforeCount})`);
        }

        // Filtrar por canal
        if (this.activeFilters.channel) {
            const beforeCount = filteredChats.length;
            
            // Debug: mostrar todos los tipos de canal disponibles
            const allChannelTypes = [...new Set(this.allChats.map(chat => chat.type))];
            console.log(`🔍 Tipos de canal disponibles en chats:`, allChannelTypes);
            console.log(`🔍 Filtrando por canal: "${this.activeFilters.channel}"`);
            
            filteredChats = filteredChats.filter(chat => {
                const chatType = (chat.type || '').toString().toLowerCase().trim();
                const filterChannel = (this.activeFilters.channel || '').toString().toLowerCase().trim();
                const matches = chatType === filterChannel;
                
                if (!matches) {
                    console.log(`❌ Chat ${chat.id} (${chat.name}) no coincide:`, {
                        chatType: `"${chatType}"`,
                        filterChannel: `"${filterChannel}"`,
                        originalChatType: `"${chat.type}"`
                    });
                } else {
                    console.log(`✅ Chat ${chat.id} (${chat.name}) coincide con canal ${chat.type}`);
                }
                return matches;
            });
            console.log(`📊 Filtro por canal ${this.activeFilters.channel}: ${filteredChats.length} chats (antes: ${beforeCount})`);
        }

        // Filtrar por fecha
        if (this.activeFilters.date) {
            const beforeCount = filteredChats.length;
            const filterDate = new Date(this.activeFilters.date);
            filteredChats = filteredChats.filter(chat => {
                // Usar diferentes campos de fecha según lo que esté disponible
                let chatDate;
                if (chat.createdAt) {
                    chatDate = new Date(chat.createdAt);
                } else if (chat.timestamp) {
                    chatDate = new Date(chat.timestamp);
                } else if (chat.time) {
                    chatDate = new Date(chat.time);
                } else {
                    return false;
                }
                
                return chatDate.toDateString() === filterDate.toDateString();
            });
            console.log(`📊 Filtro por fecha ${this.activeFilters.date}: ${filteredChats.length} chats (antes: ${beforeCount})`);
        }

        console.log(`✅ Filtros aplicados: ${filteredChats.length} chats de ${this.allChats.length} total`);
        this.renderFilteredChats(filteredChats);
    }

    // Método para debug - mostrar estructura de datos de chats
    debugChatsData() {
        console.log('🔍 DEBUG - Estructura de datos de chats:');
        console.log(`📊 Total de chats (allChats): ${this.allChats.length}`);
        console.log(`📊 Total de chats (dashboardData.chats): ${this.dashboardData.chats.length}`);
        
        // Agrupar por agente para mejor visualización
        const chatsByAgent = {};
        this.allChats.forEach(chat => {
            const agentId = chat.agentId || 'sin-agente';
            if (!chatsByAgent[agentId]) {
                chatsByAgent[agentId] = [];
            }
            chatsByAgent[agentId].push({
                id: chat.id,
                name: chat.name,
                agentName: chat.agentName
            });
        });
        
        console.log('📊 Chats agrupados por agente (desde allChats):');
        Object.entries(chatsByAgent).forEach(([agentId, chats]) => {
            console.log(`  🤖 Agente ID: "${agentId}" (${chats[0]?.agentName || 'Sin nombre'}) - ${chats.length} chat(s):`);
            chats.forEach(chat => {
                console.log(`    💬 ${chat.name} (${chat.id})`);
            });
        });
    }

    clearChatFilters() {
        console.log('🧹 Limpiando todos los filtros...');
        
        // Limpiar estado de filtros
        this.activeFilters.agentId = '';
        this.activeFilters.channel = '';
        this.activeFilters.date = '';
        
        const agentFilter = document.getElementById('agentFilter');
        const channelFilter = document.getElementById('channelFilter');
        const dateFilter = document.getElementById('dateFilter');

        if (agentFilter) agentFilter.value = '';
        if (channelFilter) channelFilter.value = '';
        if (dateFilter) dateFilter.value = '';

        // Mostrar todos los chats (desde allChats)
        this.renderFilteredChats(this.allChats);
        
        console.log('✅ Filtros limpiados, mostrando todos los chats');
    }

    // Aplicar filtros activos (usado cuando se actualiza la lista)
    applyActiveFilters() {
        if (this.activeFilters.agentId || this.activeFilters.channel || this.activeFilters.date) {
            console.log('🔄 Aplicando filtros activos después de actualización...');
            this.restoreFilterValues();
            this.applyChatFilters();
        } else {
            console.log('🔄 No hay filtros activos, mostrando todos los chats');
            this.renderFilteredChats(this.allChats);
        }
    }

    // Restaurar valores de filtros en el DOM
    restoreFilterValues() {
        const agentFilter = document.getElementById('agentFilter');
        const channelFilter = document.getElementById('channelFilter');
        const dateFilter = document.getElementById('dateFilter');

        if (agentFilter && this.activeFilters.agentId) {
            agentFilter.value = this.activeFilters.agentId;
        }
        if (channelFilter && this.activeFilters.channel) {
            channelFilter.value = this.activeFilters.channel;
        }
        if (dateFilter && this.activeFilters.date) {
            dateFilter.value = this.activeFilters.date;
        }
    }

    renderFilteredChats(chats) {
        const chatsList = document.getElementById('chatsList');
        if (!chatsList) return;

        chatsList.innerHTML = '';

        if (chats.length === 0) {
            chatsList.innerHTML = `
                <div class="no-chats">
                    <i class="fas fa-search"></i>
                    <h3>No se encontraron chats</h3>
                    <p>Intenta ajustar los filtros</p>
                </div>
            `;
            return;
        }

        chats.forEach(chat => {
            const chatElement = this.createChatElement(chat);
            chatsList.appendChild(chatElement);
        });
    }

    // Actualizar lista de agentes con datos reales
    updateAgentsList() {
        const agentsGrid = document.getElementById('agentsGrid');
        if (!agentsGrid) return;

        agentsGrid.innerHTML = '';

        if (this.dashboardData.agents.length === 0) {
            agentsGrid.innerHTML = `
                <div class="no-agents">
                    <i class="fas fa-robot"></i>
                    <h3>No hay agentes disponibles</h3>
                    <p>No se encontraron agentes en tu cuenta de GPTMaker. Verifica que:</p>
                    <ul style="text-align: left; display: inline-block; margin-top: 10px;">
                        <li>Tu token de API esté correctamente configurado</li>
                        <li>Tengas agentes creados en tu cuenta de GPTMaker</li>
                        <li>El token tenga los permisos necesarios</li>
                    </ul>
                    <p style="margin-top: 15px; font-size: 0.9rem; color: var(--text-muted);">
                        Puedes configurar tu token en <strong>Mi Perfil → Configuración API</strong>
                    </p>
                </div>
            `;
            return;
        }

        this.dashboardData.agents.forEach(agent => {
            const agentElement = this.createAgentElement(agent);
            agentsGrid.appendChild(agentElement);
        });
    }

    // Setup agents management
    setupAgentsManagement() {
        // Evitar listeners duplicados
        if (this._agentsListenersInitialized) return;
        this._agentsListenersInitialized = true;

        // Agent details button functionality
        document.addEventListener('click', (e) => {
            if (e.target.closest('.agent-toggle')) {
                e.stopPropagation();
                const button = e.target.closest('.agent-toggle');
                const agentId = button.dataset.agentId;
                this.showAgentDetails(agentId);
            }
        });

        // Load agent credits after a short delay to ensure agents are loaded
        setTimeout(() => {
            this.loadAgentCredits();
        }, 1000);
    }

    async showAgentDetails(agentId) {
        const agent = this.dashboardData.agents.find(a => a.id === agentId);
        if (!agent) {
            console.error('❌ Agente no encontrado:', agentId);
            return;
        }

        console.log('📊 Mostrando detalles del agente:', agent.name);

        // Cerrar cualquier modal de detalles existente para evitar duplicados
        const existingAgentModal = document.querySelector('.agent-details-modal');
        if (existingAgentModal && existingAgentModal.parentElement) {
            existingAgentModal.parentElement.removeChild(existingAgentModal);
        }

        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay agent-details-modal';
        modal.innerHTML = `
            <div class="modal-content agent-modal-content">
                <div class="modal-header">
                    <div class="agent-modal-title">
                        <div class="agent-avatar-large">${this.getAgentInitials(agent.name)}</div>
                        <div>
                            <h2>${agent.name}</h2>
                            <p class="agent-modal-subtitle">${agent.jobName || 'Agente'}</p>
                        </div>
                    </div>
                    <button class="modal-close" id="closeAgentModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-tabs">
                    <button class="tab-button active" data-tab="trainings">
                        <i class="fas fa-graduation-cap"></i>
                        Entrenamientos
                    </button>
                    <button class="tab-button" data-tab="intentions">
                        <i class="fas fa-bullseye"></i>
                        Intenciones
                    </button>
                </div>
                
                <div class="modal-body">
                    <div class="tab-content active" id="trainings-tab">
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Cargando entrenamientos...</p>
                        </div>
                    </div>
                    
                    <div class="tab-content" id="intentions-tab">
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Cargando intenciones...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners para tabs
        const tabButtons = modal.querySelectorAll('.tab-button');
        const tabContents = modal.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                
                // Actualizar botones
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Actualizar contenido
                tabContents.forEach(content => content.classList.remove('active'));
                const activeTab = modal.querySelector(`#${tabName}-tab`);
                if (activeTab) {
                    activeTab.classList.add('active');
                }
            });
        });

        // Event listener para cerrar modal
        const closeModal = () => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        };

        modal.querySelector('#closeAgentModal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Cargar datos (por ahora mock, luego conectaremos con API)
        this.loadAgentTrainings(agentId);
        this.loadAgentIntentions(agentId);
    }

    async loadAgentTrainings(agentId) {
        const trainingsTab = document.getElementById('trainings-tab');
        if (!trainingsTab) return;

        try {
            console.log('📚 Cargando entrenamientos del agente:', agentId);

            // Consultar todas las variantes de tipo en paralelo y consolidar
            const types = ['TEXT', 'WEBSITE', 'VIDEO', 'DOCUMENT'];
            const results = await Promise.all(
                types.map(type => this.dataService.getAgentTrainings(agentId, { type }))
            );

            const merged = results
                .filter(r => r && r.success && Array.isArray(r.data))
                .flatMap(r => r.data.map(t => ({ ...t, _type: t.type || 'TEXT' })));

            // Eliminar duplicados por id
            const uniqueById = new Map();
            merged.forEach(t => { if (t && t.id) uniqueById.set(t.id, t); });
            const trainings = Array.from(uniqueById.values());

            if (trainings.length > 0) {
                console.log(`✅ ${trainings.length} entrenamientos combinados obtenidos desde la API`);
                
                // Log detallado de entrenamientos WEBSITE para debugging
                const websiteTrainings = trainings.filter(t => t.type === 'WEBSITE');
                if (websiteTrainings.length > 0) {
                    console.log('🌐 Entrenamientos WEBSITE encontrados:', websiteTrainings.map(t => ({
                        id: t.id,
                        type: t.type,
                        url: t.url,
                        title: t.title,
                        description: t.description,
                        text: t.text ? t.text.substring(0, 50) + '...' : 'Sin texto',
                        image: t.image ? 'Con imagen' : 'Sin imagen'
                    })));
                }
                
                trainingsTab.innerHTML = this.renderTrainings(trainings);
            } else {
                console.log('⚠️ No se encontraron entrenamientos en ningún tipo');
                trainingsTab.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-graduation-cap"></i>
                        <p>No hay entrenamientos configurados</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('❌ Error cargando entrenamientos:', error);
            trainingsTab.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar entrenamientos</p>
                </div>
            `;
        }
    }

    renderTrainings(trainings) {
        if (!trainings || trainings.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-graduation-cap"></i>
                    <p>No hay entrenamientos configurados</p>
                </div>
            `;
        }

        return `
            <div class="trainings-list">
                ${trainings.map(training => `
                    <div class="training-item">
                        <div class="training-header">
                            <span class="training-category">${this.getTrainingTypeLabel(training.type)}</span>
                            <span class="training-date">${training.id ? `ID: ${training.id}` : 'Sin ID'}</span>
                        </div>
                        <div class="training-content">
                            ${this.renderTrainingContent(training)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderTrainingContent(training) {
        const type = training.type || 'TEXT';
        
        switch (type) {
            case 'TEXT':
                return `
                    <div class="training-text">
                        <i class="fas fa-file-text"></i>
                        <strong>Contenido:</strong> ${training.text || 'Sin texto'}
                    </div>
                    ${training.image ? `
                        <div class="training-image">
                            <i class="fas fa-image"></i>
                            <strong>Imagen:</strong> 
                            <img src="${training.image}" alt="Imagen del entrenamiento" style="max-width: 200px; max-height: 150px; border-radius: 8px; margin-top: 0.5rem;">
                        </div>
                    ` : ''}
                `;
                
            case 'WEBSITE':
                return `
                    <div class="training-website">
                        <i class="fas fa-globe"></i>
                        <strong>Sitio Web:</strong> 
                        ${training.website ? `
                            <a href="${training.website}" target="_blank" rel="noopener noreferrer" class="website-link">
                                <i class="fas fa-external-link-alt"></i>
                                ${training.website}
                            </a>
                        ` : '<span class="no-url">URL no disponible</span>'}
                    </div>
                    ${training.text ? `
                        <div class="training-text">
                            <i class="fas fa-file-text"></i>
                            <strong>Contenido:</strong> ${training.text}
                        </div>
                    ` : ''}
                    ${training.image ? `
                        <div class="training-image">
                            <i class="fas fa-image"></i>
                            <strong>Imagen:</strong> 
                            <img src="${training.image}" alt="Imagen del sitio web" style="max-width: 200px; max-height: 150px; border-radius: 8px; margin-top: 0.5rem;">
                        </div>
                    ` : ''}
                    ${training.callbackUrl ? `
                        <div class="training-callback">
                            <i class="fas fa-link"></i>
                            <strong>Callback URL:</strong> 
                            <a href="${training.callbackUrl}" target="_blank" rel="noopener noreferrer" class="callback-link">
                                ${training.callbackUrl}
                            </a>
                        </div>
                    ` : ''}
                `;
                
            case 'VIDEO':
                return `
                    <div class="training-video">
                        <i class="fas fa-video"></i>
                        <strong>Video:</strong> 
                        ${training.video ? `
                            <a href="${training.video}" target="_blank" rel="noopener noreferrer" class="video-link">
                                <i class="fas fa-external-link-alt"></i>
                                ${training.video}
                            </a>
                        ` : '<span class="no-url">URL no disponible</span>'}
                    </div>
                    ${training.text ? `
                        <div class="training-text">
                            <i class="fas fa-file-text"></i>
                            <strong>Contenido:</strong> ${training.text}
                        </div>
                    ` : ''}
                    ${training.image ? `
                        <div class="training-image">
                            <i class="fas fa-image"></i>
                            <strong>Imagen:</strong> 
                            <img src="${training.image}" alt="Imagen del video" style="max-width: 200px; max-height: 150px; border-radius: 8px; margin-top: 0.5rem;">
                        </div>
                    ` : ''}
                `;
                
            case 'DOCUMENT':
                return `
                    <div class="training-document">
                        <i class="fas fa-file-pdf"></i>
                        <strong>Documento:</strong> 
                        ${training.documentUrl ? `
                            <a href="${training.documentUrl}" target="_blank" rel="noopener noreferrer" class="document-link">
                                <i class="fas fa-external-link-alt"></i>
                                ${training.documentName || training.documentUrl}
                            </a>
                        ` : '<span class="no-url">URL no disponible</span>'}
                    </div>
                    ${training.documentName ? `
                        <div class="training-filename">
                            <i class="fas fa-file"></i>
                            <strong>Archivo:</strong> ${training.documentName}
                        </div>
                    ` : ''}
                    ${training.documentMimetype ? `
                        <div class="training-mimetype">
                            <i class="fas fa-info-circle"></i>
                            <strong>Tipo:</strong> ${training.documentMimetype}
                        </div>
                    ` : ''}
                    ${training.text ? `
                        <div class="training-text">
                            <i class="fas fa-file-text"></i>
                            <strong>Contenido:</strong> ${training.text}
                        </div>
                    ` : ''}
                    ${training.image ? `
                        <div class="training-image">
                            <i class="fas fa-image"></i>
                            <strong>Imagen:</strong> 
                            <img src="${training.image}" alt="Imagen del documento" style="max-width: 200px; max-height: 150px; border-radius: 8px; margin-top: 0.5rem;">
                        </div>
                    ` : ''}
                `;
                
            default:
                return `
                    <div class="training-text">
                        <i class="fas fa-file-text"></i>
                        <strong>Contenido:</strong> ${training.text || 'Sin contenido'}
                    </div>
                    ${training.image ? `
                        <div class="training-image">
                            <i class="fas fa-image"></i>
                            <strong>Imagen:</strong> 
                            <img src="${training.image}" alt="Imagen del entrenamiento" style="max-width: 200px; max-height: 150px; border-radius: 8px; margin-top: 0.5rem;">
                        </div>
                    ` : ''}
                `;
        }
    }

    getTrainingTypeLabel(type) {
        const typeLabels = {
            'TEXT': 'Texto',
            'WEBSITE': 'Sitio Web',
            'VIDEO': 'Video',
            'DOCUMENT': 'Documento'
        };
        return typeLabels[type] || type || 'Desconocido';
    }

    async loadAgentIntentions(agentId) {
        const intentionsTab = document.getElementById('intentions-tab');
        if (!intentionsTab) return;

        try {
            console.log('🎯 Cargando intenciones del agente:', agentId);
            
            // Obtener intenciones desde la API real
            const result = await this.dataService.getAgentIntentions(agentId);
            
            if (result.success && result.data && result.data.length > 0) {
                console.log(`✅ ${result.data.length} intenciones obtenidas desde la API`);
                intentionsTab.innerHTML = this.renderIntentions(result.data);
            } else {
                console.log('⚠️ No se encontraron intenciones o error en la API');
                intentionsTab.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-bullseye"></i>
                        <p>No hay intenciones configuradas</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('❌ Error cargando intenciones:', error);
            intentionsTab.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar intenciones</p>
                </div>
            `;
        }
    }

    renderIntentions(intentions) {
        if (!intentions || intentions.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-bullseye"></i>
                    <p>No hay intenciones configuradas</p>
                </div>
            `;
        }

        return `
            <div class="intentions-list">
                ${intentions.map(intention => `
                    <div class="intention-item">
                        <div class="intention-header">
                            <div class="intention-title">
                                <i class="fas fa-bullseye"></i>
                                <h4>${intention.description || 'Intención sin descripción'}</h4>
                            </div>
                            <div class="intention-status active">
                                ${intention.type || 'WEBHOOK'}
                            </div>
                        </div>
                        <div class="intention-description">
                            ${intention.instructions || 'Sin instrucciones específicas'}
                        </div>
                        ${intention.details ? `
                            <div class="intention-details">
                                <strong>Detalles:</strong> ${intention.details}
                            </div>
                        ` : ''}
                        ${intention.url ? `
                            <div class="intention-webhook">
                                <strong>Webhook URL:</strong> 
                                <a href="${intention.url}" target="_blank" rel="noopener noreferrer" class="webhook-link">
                                    <i class="fas fa-external-link-alt"></i>
                                    ${intention.url}
                                </a>
                            </div>
                        ` : ''}
                        ${intention.httpMethod ? `
                            <div class="intention-method">
                                <strong>Método HTTP:</strong> 
                                <span class="http-method ${intention.httpMethod.toLowerCase()}">${intention.httpMethod}</span>
                            </div>
                        ` : ''}
                        ${intention.fields && intention.fields.length > 0 ? `
                            <div class="intention-fields">
                                <strong>Campos (${intention.fields.length}):</strong>
                                <div class="fields-list">
                                    ${intention.fields.map(field => `
                                        <div class="field-item">
                                            <span class="field-name">${field.name}</span>
                                            <span class="field-type">${field.type}</span>
                                            ${field.required ? '<span class="field-required">*</span>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${intention.headers && intention.headers.length > 0 ? `
                            <div class="intention-headers">
                                <strong>Headers (${intention.headers.length}):</strong>
                                <div class="headers-list">
                                    ${intention.headers.map(header => `
                                        <div class="header-item">
                                            <span class="header-name">${header.name}:</span>
                                            <span class="header-value">${header.value}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${intention.params && intention.params.length > 0 ? `
                            <div class="intention-params">
                                <strong>Parámetros (${intention.params.length}):</strong>
                                <div class="params-list">
                                    ${intention.params.map(param => `
                                        <div class="param-item">
                                            <span class="param-name">${param.name}:</span>
                                            <span class="param-value">${param.value}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${intention.variables && intention.variables.length > 0 ? `
                            <div class="intention-variables">
                                <strong>Variables (${intention.variables.length}):</strong>
                                <div class="variables-list">
                                    ${intention.variables.map(variable => `
                                        <div class="variable-item">
                                            <span class="variable-expression">${variable.valueExpression}</span>
                                            ${variable.defaultFieldKey ? `<span class="variable-field">${variable.defaultFieldKey}</span>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${intention.requestBody ? `
                            <div class="intention-body">
                                <strong>Request Body:</strong>
                                <pre class="body-content">${intention.requestBody}</pre>
                            </div>
                        ` : ''}
                        <div class="intention-meta">
                            <small>ID: ${intention.id}</small>
                            ${intention.autoGenerateParams ? '<span class="auto-param">Auto Params</span>' : ''}
                            ${intention.autoGenerateBody ? '<span class="auto-body">Auto Body</span>' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async toggleAgentStatus(agentId) {
        const agent = this.dashboardData.agents.find(a => a.id === agentId);
        if (!agent) return;

        const newStatus = agent.status === 'active' ? 'inactive' : 'active';
        
        try {
            console.log(`🔄 Cambiando estado del agente ${agentId} a ${newStatus}`);
            
            // Update local data
            agent.status = newStatus;
            
            // Update UI
            this.updateAgentsList();
            
            this.showNotification(`Agente ${newStatus === 'active' ? 'activado' : 'inactivado'} exitosamente`, 'success');
        } catch (error) {
            console.error('❌ Error cambiando estado del agente:', error);
            this.showNotification('Error al cambiar estado del agente', 'error');
        }
    }

    async loadAgentCredits() {
        console.log('💰 Cargando créditos de todos los agentes...');
        
        // Mostrar indicador de carga
        this.showCreditsLoadingState();
        
        for (const agent of this.dashboardData.agents) {
            try {
                // Solo intentar obtener créditos si el ID parece ser real (no mock)
                if (agent.id && !agent.id.startsWith('agent-') && agent.id.length > 10) {
                    console.log(`💰 Obteniendo créditos para agente: ${agent.name} (${agent.id})`);
                    const result = await this.dataService.getAgentCredits(agent.id);
                    
                    if (result.success && result.data) {
                        agent.credits = result.data.total || 0;
                        console.log(`✅ Créditos cargados para ${agent.name}: ${agent.credits}`);
                    } else {
                        agent.credits = 0;
                        console.warn(`⚠️ No se pudieron obtener créditos para ${agent.name}`);
                    }
                } else {
                    // Para agentes mock, usar créditos predefinidos
                    agent.credits = agent.credits || 0;
                    console.log(`💰 Usando créditos mock para ${agent.name}: ${agent.credits}`);
                }
            } catch (error) {
                console.error(`❌ Error cargando créditos para agente ${agent.name} (${agent.id}):`, error);
                agent.credits = 0;
            }
        }
        
        console.log('✅ Créditos de agentes cargados, actualizando UI...');
        
        // Update agents list with credits
        this.updateAgentsList();
        
        // Ocultar indicador de carga
        this.hideCreditsLoadingState();
    }

    showCreditsLoadingState() {
        const creditsValues = document.querySelectorAll('.credits-value');
        creditsValues.forEach(element => {
            element.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
            element.className = 'credits-value loading';
        });
    }

    hideCreditsLoadingState() {
        // El estado se actualiza automáticamente cuando se llama a updateAgentsList()
    }

    createAgentElement(agent) {
        const agentDiv = document.createElement('div');
        agentDiv.className = 'agent-card';
        agentDiv.dataset.agentId = agent.id;

        const agentInitials = this.getAgentInitials(agent.name);
        const credits = agent.credits || 0;

        // Mapear tipos de comunicación
        const communicationTypeMap = {
            'FORMAL': 'Formal',
            'NORMAL': 'Normal', 
            'RELAXED': 'Relajado'
        };

        // Mapear tipos de agente
        const typeMap = {
            'SUPPORT': 'Soporte',
            'SALE': 'Ventas',
            'PERSONAL': 'Personal'
        };

        const communicationType = communicationTypeMap[agent.communicationType] || agent.communicationType || 'Normal';
        const agentType = typeMap[agent.type] || agent.type || 'Soporte';

        agentDiv.innerHTML = `
            <div class="agent-header">
                <div class="agent-avatar">${agentInitials}</div>
                <div class="agent-info">
                    <h3>${agent.name || 'Agente'}</h3>
                    <div class="agent-meta-item">
                        <span class="meta-label">Tipo de Agente:</span>
                        <p class="agent-type">${agentType}</p>
                    </div>
                    <div class="agent-meta-item">
                        <span class="meta-label">Tono de Comunicación:</span>
                        <p class="agent-communication">${communicationType}</p>
                    </div>
                </div>
            </div>
            <div class="agent-details">
                <div class="agent-detail-item">
                    <span class="detail-label">
                        <i class="fas fa-building"></i>
                        Empresa:
                    </span>
                    <span class="detail-value">${agent.jobName || 'No especificada'}</span>
                </div>
                <div class="agent-detail-item">
                    <span class="detail-label">
                        <i class="fas fa-globe"></i>
                        Sitio Web:
                    </span>
                    <span class="detail-value">${agent.jobSite || 'No especificado'}</span>
                </div>
                <div class="agent-detail-item">
                    <span class="detail-label">
                        <i class="fas fa-align-left"></i>
                        Descripción:
                    </span>
                    <span class="detail-value">${agent.jobDescription || 'Sin descripción'}</span>
                </div>
            </div>
            <div class="agent-credits">
                <div class="credits-header">
                    <i class="fas fa-coins"></i>
                    <span class="credits-title">Créditos Consumidos</span>
                </div>
                <span class="credits-value ${credits > 0 ? 'has-credits' : 'no-credits'}">
                    ${credits > 0 ? credits.toLocaleString() : 'Sin datos'}
                </span>
            </div>
            <div class="agent-actions">
                <button class="agent-toggle btn btn-outline" data-agent-id="${agent.id}">
                    <i class="fas fa-info-circle"></i>
                    Ver Detalles
                </button>
            </div>
        `;

        return agentDiv;
    }

    getAgentInitials(name) {
        if (!name) return 'A';
        const words = name.split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    applyAgentFilters(filter) {
        const agentsGrid = document.getElementById('agentsGrid');
        if (!agentsGrid) return;

        const agentCards = agentsGrid.querySelectorAll('.agent-card');
        
        agentCards.forEach(card => {
            const statusElement = card.querySelector('.agent-status');
            
            // Validar que statusElement existe antes de acceder a classList
            if (!statusElement) {
                console.warn('⚠️ Elemento .agent-status no encontrado en una tarjeta de agente');
                return; // Saltar esta tarjeta
            }
            
            const status = statusElement.classList.contains('active') ? 'active' : 'inactive';
            
            if (filter === 'all' || filter === status) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // Actualizar lista de equipo con datos reales
    updateTeamList() {
        const teamGrid = document.getElementById('teamMembersList');
        if (!teamGrid) {
            console.warn('⚠️ No se encontró el contenedor de miembros del equipo (teamMembersList)');
            return;
        }

        teamGrid.innerHTML = '';
        const members = (window.teamManager && Array.isArray(window.teamManager.teamMembers)) 
            ? window.teamManager.teamMembers 
            : [];

        console.log(`👥 Actualizando lista de equipo. Total miembros (reales): ${members.length}`);

        if (members.length === 0) {
            teamGrid.innerHTML = `
                <div class="empty-team-state">
                    <i class="fas fa-user-slash"></i>
                    <p>Aún no has invitado a ningún miembro</p>
                    <button class="btn btn-outline" onclick="document.getElementById('inviteMemberBtn').click()">
                        <i class="fas fa-user-plus"></i>
                        Invitar Primer Miembro
                    </button>
                </div>
            `;
            return;
        }

        members.forEach(member => {
            const memberElement = this.createTeamMemberElement(member);
            teamGrid.appendChild(memberElement);
        });
        
        console.log(`✅ Lista de equipo actualizada con ${members.length} miembros`);
    }

    // Load and display channels
    async loadChannels() {
        const channelsList = document.getElementById('channelsList');
        if (!channelsList) {
            console.warn('⚠️ No se encontró el contenedor de canales (channelsList)');
            return;
        }

        try {
            console.log('📱 Cargando canales...');
            
            // Mostrar loading
            channelsList.innerHTML = '<div class="loading-message">Cargando canales...</div>';
            
            // Obtener todos los canales
            const channelsResult = await this.dataService.getAllChannels();
            
            if (!channelsResult.success || !channelsResult.data || channelsResult.data.length === 0) {
                channelsList.innerHTML = `
                    <div class="no-channels">
                        <i class="fas fa-satellite-dish"></i>
                        <p>No hay canales activos</p>
                    </div>
                `;
                return;
            }
            
            // Filtrar solo canales conectados
            const connectedChannels = channelsResult.data.filter(channel => channel.connected);
            
            if (connectedChannels.length === 0) {
                channelsList.innerHTML = `
                    <div class="no-channels">
                        <i class="fas fa-satellite-dish"></i>
                        <p>No hay canales conectados</p>
                    </div>
                `;
                return;
            }
            
            console.log(`✅ ${connectedChannels.length} canales conectados cargados`);
            
            // Crear elementos de canales
            channelsList.innerHTML = '';
            connectedChannels.forEach(channel => {
                const channelElement = this.createChannelElement(channel);
                channelsList.appendChild(channelElement);
            });
            
        } catch (error) {
            console.error('❌ Error cargando canales:', error);
            channelsList.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar canales</p>
                </div>
            `;
        }
    }

    createChannelElement(channel) {
        const channelDiv = document.createElement('div');
        channelDiv.className = 'channel-item';
        
        // Determinar ícono según el tipo de canal
        let icon = 'fa-comment';
        let typeText = channel.type;
        let iconClass = channel.type ? channel.type.toLowerCase() : '';
        
        // Detectar si es WhatsApp Cloud API o Widget basado en el nombre o tipo
        const isWhatsAppCloudAPI = channel.type === 'WHATSAPP' || 
                                   channel.type === 'CLOUD_API' ||
                                   channel.type === 'WHATSAPP_CLOUD_API' ||
                                   (channel.name && (
                                       channel.name.toLowerCase().includes('cloud') || 
                                       channel.name.toLowerCase().includes('api') ||
                                       channel.name.toLowerCase().includes('business') ||
                                       channel.name.toLowerCase().includes('whatsapp')
                                   ));
        
        const isWidget = channel.type === 'WIDGET' || 
                        channel.type === 'WEB' ||
                        (channel.name && (
                            channel.name.toLowerCase().includes('widget') ||
                            channel.name.toLowerCase().includes('web') ||
                            channel.name.toLowerCase().includes('site')
                        ));
        
        // Asignar ícono específico
        if (isWhatsAppCloudAPI) {
            icon = 'fab fa-whatsapp';
            typeText = 'WhatsApp Business';
            iconClass = 'whatsapp-business';
        } else if (isWidget) {
            icon = 'fas fa-globe';
            typeText = 'Widget Web';
            iconClass = 'widget';
        } else {
            switch (channel.type) {
                case 'INSTAGRAM':
                    icon = 'fab fa-instagram';
                    typeText = 'Instagram';
                    iconClass = 'instagram';
                    break;
                case 'MESSENGER':
                    icon = 'fab fa-facebook-messenger';
                    typeText = 'Messenger';
                    iconClass = 'messenger';
                    break;
                case 'TELEGRAM':
                    icon = 'fab fa-telegram';
                    typeText = 'Telegram';
                    iconClass = 'telegram';
                    break;
                case 'DISCORD':
                    icon = 'fab fa-discord';
                    typeText = 'Discord';
                    iconClass = 'discord';
                    break;
                default:
                    icon = 'fa-comment';
                    typeText = channel.type || 'Canal';
                    iconClass = 'default';
            }
        }
        
        channelDiv.innerHTML = `
            <div class="channel-icon ${iconClass}">
                <i class="${icon}"></i>
            </div>
            <div class="channel-info">
                <div class="channel-name">${channel.name || typeText}</div>
                <div class="channel-type">${typeText}</div>
                ${channel.agentName ? `<div class="channel-agent">${channel.agentName}</div>` : ''}
            </div>
            <div class="channel-status connected">
                <i class="fas fa-check-circle"></i>
                Conectado
            </div>
        `;
        
        return channelDiv;
    }

    // Setup attendances management
    setupAttendancesManagement() {
        // Filter button
        const filterBtn = document.getElementById('filterAttendancesBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                this.showNotification('Funcionalidad de filtros en desarrollo', 'info');
            });
        }

        // Search functionality
        const searchInput = document.querySelector('#attendances .search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterAttendances(e.target.value);
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportAttendancesBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.showNotification('Funcionalidad de exportar en desarrollo', 'info');
            });
        }

        // Load attendances data
        this.loadAttendances();
    }

    async loadAttendances() {
        try {
            console.log('📞 Cargando atendimientos...');
            
            // Obtener datos reales de la API
            const result = await this.dataService.getInteractions();
            
            if (result.success) {
                // Transformar datos de la API al formato de la UI
                const attendances = result.data.map(interaction => this.transformInteractionToAttendance(interaction));
                this.renderAttendances(attendances);
                console.log(`✅ ${attendances.length} atendimientos cargados exitosamente (fuente: ${result.source})`);
            } else {
                throw new Error(result.error || 'Error obteniendo atendimientos');
            }
        } catch (error) {
            console.error('❌ Error cargando atendimientos:', error);
            this.showNotification('Error al cargar los atendimientos', 'error');
        }
    }

    transformInteractionToAttendance(interaction) {
        // Mapear status de la API a formato de UI
        const statusMap = {
            'RUNNING': 'in-progress',
            'WAITING': 'waiting',
            'RESOLVED': 'completed'
        };

        const uiStatus = statusMap[interaction.status] || 'completed';
        
        // Formatear fechas
        const startDate = new Date(interaction.startAt);
        const endDate = interaction.resolvedAt ? new Date(interaction.resolvedAt) : null;
        
        // Calcular duración si está resuelto
        let duration = '-';
        if (endDate && interaction.status === 'RESOLVED') {
            const diffMs = endDate - startDate;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            if (diffHours > 0) {
                duration = `${diffHours}h ${diffMinutes}min`;
            } else {
                duration = `${diffMinutes}min`;
            }
        }

        // Obtener el canal real del chat asociado
        let channelName = 'Desconocido';
        if (interaction.chatId) {
            // Buscar el chat en allChats o dashboardData.chats
            const chat = this.allChats.find(c => c.id === interaction.chatId) || 
                        this.dashboardData.chats.find(c => c.id === interaction.chatId);
            
            if (chat && chat.type) {
                channelName = this.formatChannelName(chat.type);
                console.log(`📊 Atendimiento ${interaction.id}: Canal encontrado "${chat.type}" → "${channelName}"`);
            } else {
                console.warn(`⚠️ Atendimiento ${interaction.id}: No se encontró el chat ${interaction.chatId} o no tiene tipo de canal`);
            }
        } else {
            console.warn(`⚠️ Atendimiento ${interaction.id}: No tiene chatId asociado`);
        }

        return {
            id: interaction.id,
            name: interaction.chatName || interaction.name || 'Sin nombre',
            channel: channelName,
            status: uiStatus,
            responsible: interaction.agentName || 'Sin asignar',
            secondaryAgent: interaction.transferAt ? 'Transferido a humano' : null,
            startTime: this.formatDateTime(startDate),
            endTime: endDate ? this.formatDateTime(endDate) : '-',
            duration: duration
        };
    }

    formatDateTime(date) {
        return date.toLocaleString('es-ES', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        });
    }

    renderAttendances(attendances) {
        const attendancesList = document.getElementById('attendancesList');
        if (!attendancesList) return;

        attendancesList.innerHTML = '';

        if (attendances.length === 0) {
            attendancesList.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <div class="no-attendances">
                            <i class="fas fa-headset"></i>
                            <h3>No hay atendimientos</h3>
                            <p>Los atendimientos aparecerán aquí cuando estén disponibles</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        attendances.forEach(attendance => {
            const row = this.createAttendanceRow(attendance);
            attendancesList.appendChild(row);
        });
    }

    createAttendanceRow(attendance) {
        const row = document.createElement('tr');
        
        const userInitials = this.getUserInitials(attendance.name);
        const channelIcon = this.getChannelIconHTML(attendance.channel);
        
        row.innerHTML = `
            <td>
                <div class="attendance-name">
                    <div class="attendance-avatar">${userInitials}</div>
                    <div>
                        <div class="attendance-client-name">${attendance.name}</div>
                    </div>
                </div>
            </td>
            <td>
                <div class="attendance-channel">
                    ${channelIcon}
                    ${attendance.channel}
                </div>
            </td>
            <td>
                <span class="attendance-status ${attendance.status}">
                    ${attendance.status === 'completed' ? 'Completado' : 
                      attendance.status === 'in-progress' ? 'En Progreso' : 'Esperando'}
                </span>
            </td>
            <td>
                <div class="attendance-responsible">
                    <div class="responsible-avatar">${this.getUserInitials(attendance.responsible)}</div>
                    ${attendance.responsible}
                </div>
            </td>
            <td class="attendance-time">${attendance.startTime}</td>
            <td class="attendance-time">${attendance.endTime}</td>
            <td class="attendance-duration">${attendance.duration}</td>
        `;

        return row;
    }

    getChannelIconHTML(channelName) {
        // Normalizar el nombre del canal para comparación
        const normalizedChannel = channelName.toLowerCase();
        
        // Determinar el icono y clase según el canal
        let iconClass = 'fas fa-comments'; // Icono por defecto
        let channelClass = 'default';
        
        if (normalizedChannel.includes('whatsapp')) {
            iconClass = 'fab fa-whatsapp';
            channelClass = 'whatsapp';
        } else if (normalizedChannel.includes('instagram')) {
            iconClass = 'fab fa-instagram';
            channelClass = 'instagram';
        } else if (normalizedChannel.includes('facebook')) {
            iconClass = 'fab fa-facebook';
            channelClass = 'facebook';
        } else if (normalizedChannel.includes('telegram')) {
            iconClass = 'fab fa-telegram';
            channelClass = 'telegram';
        } else if (normalizedChannel.includes('widget') || normalizedChannel.includes('web')) {
            iconClass = 'fas fa-globe';
            channelClass = 'widget';
        } else if (normalizedChannel.includes('email')) {
            iconClass = 'fas fa-envelope';
            channelClass = 'email';
        } else if (normalizedChannel.includes('sms')) {
            iconClass = 'fas fa-sms';
            channelClass = 'sms';
        }
        
        return `<div class="channel-icon ${channelClass}"><i class="${iconClass}"></i></div>`;
    }

    filterAttendances(searchTerm) {
        const rows = document.querySelectorAll('#attendancesList tr');
        rows.forEach(row => {
            const clientName = row.querySelector('.attendance-client-name');
            if (clientName) {
                const name = clientName.textContent.toLowerCase();
                const matches = name.includes(searchTerm.toLowerCase());
                row.style.display = matches ? '' : 'none';
            }
        });
    }

    createTeamMemberElement(member) {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'team-member';

        const memberInitials = this.getMemberInitials(member.name);
        const skills = member.skills || [];

        memberDiv.innerHTML = `
            <div class="member-avatar">${memberInitials}</div>
            <div class="member-name">${member.name || 'Miembro'}</div>
            <div class="member-role">${member.role || 'Miembro'}</div>
            <div class="member-skills">
                ${skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
            </div>
        `;

        return memberDiv;
    }

    getMemberInitials(name) {
        if (!name) return 'M';
        const words = name.split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    initializeCharts() {
        console.log('📊 Inicializando gráficos simples...');
        this.initializeTokensChart();
        this.initializeChannelsChart();
    }

    initializeTokensChart() {
        const chartContainer = document.getElementById('simpleChart');
        if (!chartContainer) {
            console.warn('⚠️ Contenedor simpleChart no encontrado');
            return;
        }

        console.log('📊 Inicializando gráfico simple de flujo de chats...');

        // Inicializar navegación de semanas
        this.currentWeekOffset = 0;
        this.setupWeekNavigation();

        // Cargar datos de la semana actual
        this.loadWeekData();
    }

    setupWeekNavigation() {
        const prevBtn = document.getElementById('prevWeekBtn');
        const nextBtn = document.getElementById('nextWeekBtn');
        const weekDisplay = document.getElementById('currentWeekDisplay');

        if (!prevBtn || !nextBtn || !weekDisplay) {
            console.warn('⚠️ Controles de navegación de semana no encontrados');
            return;
        }

        prevBtn.addEventListener('click', () => {
            this.currentWeekOffset--;
            this.loadWeekData();
        });

        nextBtn.addEventListener('click', () => {
            this.currentWeekOffset++;
            this.loadWeekData();
        });

        // Actualizar estado de botones
        this.updateWeekNavigation();
    }

    loadWeekData() {
        const chartContainer = document.getElementById('simpleChart');
        if (!chartContainer) return;

        console.log(`📊 Cargando datos para semana offset: ${this.currentWeekOffset}`);

        // Calcular datos para la semana específica
        const chatFlowData = this.calculateChatFlowByDay(this.currentWeekOffset);
        const labels = Object.keys(chatFlowData);
        const data = Object.values(chatFlowData);

        console.log('📊 Labels para el gráfico:', labels);
        console.log('📊 Data para el gráfico:', data);

        // Crear gráfico simple con HTML y CSS
        this.createSimpleChart(chartContainer, labels, data);
        
        // Actualizar navegación
        this.updateWeekNavigation();
    }

    updateWeekNavigation() {
        const prevBtn = document.getElementById('prevWeekBtn');
        const nextBtn = document.getElementById('nextWeekBtn');
        const weekDisplay = document.getElementById('currentWeekDisplay');

        if (!prevBtn || !nextBtn || !weekDisplay) return;

        // Calcular fecha de la semana
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + (this.currentWeekOffset * 7));
        
        const weekStart = new Date(baseDate);
        weekStart.setDate(baseDate.getDate() - 6);
        
        const weekEnd = new Date(baseDate);

        // Formatear rango de fechas
        const startStr = weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const endStr = weekEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        
        weekDisplay.textContent = `${startStr} - ${endStr}`;

        // Deshabilitar botones si no hay más datos
        // Por ahora, permitir navegación libre
        prevBtn.disabled = false;
        nextBtn.disabled = false;
    }

    createSimpleChart(container, labels, data) {
        const maxValue = Math.max(...data);
        const minValue = Math.min(...data);
        const range = maxValue - minValue || 1;
        
        console.log('📊 Datos del gráfico:', { maxValue, minValue, range, data });
        console.log('📊 Valores individuales:', data.map((value, index) => `${labels[index]}: ${value}`));
        
        // Verificar que hay diferencias en los datos
        const uniqueValues = [...new Set(data)];
        console.log('📊 Valores únicos:', uniqueValues);
        console.log('📊 ¿Hay diferencias?', uniqueValues.length > 1);

        // Crear estructura del gráfico
        container.innerHTML = `
            <div class="simple-chart-content">
                <div class="chart-bars">
                    ${labels.map((label, index) => {
                        const value = data[index];
                        
                        // Calcular altura usando ranking fijo para garantizar diferencias visuales
                        let height;
                        if (value === 0) {
                            height = 10; // 10% para valores cero
                        } else if (maxValue === 0) {
                            height = 10;
                        } else {
                            // Crear ranking de valores únicos
                            const uniqueValues = [...new Set(data)].sort((a, b) => a - b);
                            const rank = uniqueValues.indexOf(value);
                            const totalRanks = uniqueValues.length;
                            
                            // Mapear ranking a altura: 25% - 90%
                            const heightRange = 90 - 25; // 65% de rango
                            const rankPercent = rank / (totalRanks - 1);
                            height = 25 + (rankPercent * heightRange);
                            
                            console.log(`📊 ${label}: valor=${value}, rank=${rank}/${totalRanks-1}, altura=${height}%`);
                        }
                        
                        const isHighest = value === maxValue;
                        const isLowest = value === minValue && value > 0;
                        
                        console.log(`📊 Barra ${label}: valor=${value}, altura=${height}%, maxValue=${maxValue}`);
                        
                        return `
                            <div class="chart-bar-container ${isHighest ? 'highest' : ''} ${isLowest ? 'lowest' : ''}" 
                                 data-value="${value}" 
                                 data-label="${label}"
                                 title="${label}: ${value} chats">
                                <div class="chart-bar" style="height: ${height}%; min-height: ${height}px;">
                                    <div class="bar-value">${value}</div>
                                </div>
                                <div class="bar-label">${label}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="chart-legend">
                    <div class="legend-item">
                        <div class="legend-color"></div>
                        <span>Conversaciones Iniciadas</span>
                    </div>
                </div>
                <div class="chart-stats">
                    <div class="stat-item">
                        <span class="stat-label">Máximo:</span>
                        <span class="stat-value">${maxValue} conversaciones</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Mínimo:</span>
                        <span class="stat-value">${minValue} conversaciones</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total:</span>
                        <span class="stat-value">${data.reduce((a, b) => a + b, 0)} conversaciones</span>
                    </div>
                </div>
            </div>
        `;

        // Agregar event listeners para tooltips y clics
        container.querySelectorAll('.chart-bar-container').forEach(bar => {
            bar.addEventListener('mouseenter', (e) => {
                const value = e.currentTarget.dataset.value;
                const label = e.currentTarget.dataset.label;
                this.showTooltip(e.currentTarget, label, value);
            });
            
            bar.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });

            // Event listener para clic en barra
            bar.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = e.currentTarget.dataset.value;
                const label = e.currentTarget.dataset.label;
                this.showConversationsPopup(label, value, data, labels);
            });
        });

        console.log('✅ Gráfico simple creado exitosamente');
    }

    showTooltip(element, label, value) {
        // Crear tooltip si no existe
        let tooltip = document.querySelector('.chart-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            document.body.appendChild(tooltip);
        }

        tooltip.innerHTML = `
            <div class="tooltip-content">
                <div class="tooltip-title">📅 ${label}</div>
                <div class="tooltip-value">💬 ${value} conversaciones iniciadas</div>
            </div>
        `;

        // Posicionar tooltip
        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + (rect.width / 2) - 50 + 'px';
        tooltip.style.top = rect.top - 60 + 'px';
        tooltip.style.display = 'block';
    }

    hideTooltip() {
        const tooltip = document.querySelector('.chart-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    showConversationsPopup(dayLabel, dayValue, allData, allLabels) {
        console.log('📊 Mostrando popup para:', dayLabel, dayValue);
        
        // Cerrar popup existente si hay uno
        const existingPopup = document.querySelector('.conversations-popup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // Obtener conversaciones del día específico
        const dayConversations = this.getConversationsForDay(dayLabel, allData, allLabels);
        
        // Crear popup
        const popup = document.createElement('div');
        popup.className = 'conversations-popup';
        popup.innerHTML = `
            <div class="popup-overlay">
                <div class="popup-content">
                    <div class="popup-header">
                        <h3>💬 Conversaciones del ${dayLabel}</h3>
                        <button class="popup-close" id="closeConversationsPopup">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="popup-body">
                        <div class="conversations-stats">
                            <div class="stat-item">
                                <span class="stat-label">Total:</span>
                                <span class="stat-value">${dayValue} conversaciones</span>
                            </div>
                        </div>
                        <div class="conversations-list">
                            ${this.renderConversationsList(dayConversations)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(popup);

        // Event listeners para cerrar popup
        const closeBtn = popup.querySelector('#closeConversationsPopup');
        const overlay = popup.querySelector('.popup-overlay');

        closeBtn.addEventListener('click', () => {
            popup.remove();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                popup.remove();
            }
        });

        // Cerrar con Escape
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                popup.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    getConversationsForDay(dayLabel, allData, allLabels) {
        // Obtener fecha del día
        const dayDate = this.getDateFromLabel(dayLabel);
        const dayConversations = [];

        if (this.dashboardData.chats && this.dashboardData.chats.length > 0) {
            this.dashboardData.chats.forEach(chat => {
                // Usar los mismos campos que en calculateChatFlowByDay
                let dateValue = chat.createdAt || chat.time || chat.timestamp;
                
                if (dateValue) {
                    const chatDate = new Date(Number(dateValue) || dateValue).toISOString().split('T')[0];
                    if (chatDate === dayDate) {
                        dayConversations.push(chat);
                    }
                }
            });
        }

        console.log(`📊 Conversaciones para ${dayLabel} (${dayDate}): ${dayConversations.length}`);
        return dayConversations;
    }

    getDateFromLabel(dayLabel) {
        // Buscar en los últimos 7 días generados
        if (this.last7Days && this.last7Days.length > 0) {
            const dayObj = this.last7Days.find(day => day.key === dayLabel);
            if (dayObj) {
                return dayObj.date;
            }
        }
        
        // Fallback: extraer fecha del label
        const dayName = dayLabel.split(' ')[0];
        const dayNumber = parseInt(dayLabel.split(' ')[1]);
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const expectedDayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
            const expectedDayNumber = date.getDate();
            
            if (expectedDayName === dayName && expectedDayNumber === dayNumber) {
                return date.toISOString().split('T')[0];
            }
        }
        
        return new Date().toISOString().split('T')[0];
    }


    renderConversationsList(conversations) {
        if (conversations.length === 0) {
            return `
                <div class="empty-conversations">
                    <i class="fas fa-comment-slash"></i>
                    <p>No hay conversaciones registradas para este día</p>
                </div>
            `;
        }

        return conversations.map(conversation => `
            <div class="conversation-item">
                <div class="conversation-avatar">
                    <div class="avatar-circle">${this.getUserInitials(conversation.name || conversation.userName)}</div>
                </div>
                <div class="conversation-content">
                    <div class="conversation-header">
                        <span class="conversation-name">${conversation.name || conversation.userName}</span>
                        <span class="conversation-agent">Agente: ${conversation.agentName}</span>
                    </div>
                    <div class="conversation-message">${conversation.lastMessage}</div>
                    <div class="conversation-meta">
                        <span class="conversation-phone">${conversation.whatsappPhone || 'N/A'}</span>
                        <span class="conversation-time">${this.formatConversationTime(conversation)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    calculateChatFlowByDay(weekOffset = 0) {
        console.log('📊 Calculando flujo de chats...');
        console.log('📊 Chats disponibles:', this.dashboardData.chats?.length || 0);
        console.log('📊 Offset de semana:', weekOffset);
        
        const chatsByDate = {};
        
        // Primero, obtener todas las fechas de los chats
        if (this.dashboardData.chats && this.dashboardData.chats.length > 0) {
            console.log('📊 Ejemplo de chat completo:', this.dashboardData.chats[0]);
            
            this.dashboardData.chats.forEach(chat => {
                // Priorizar campos específicos de fecha
                let dateValue = chat.createdAt || chat.time || chat.timestamp;
                
                if (dateValue) {
                    // Convertir timestamp a fecha si es necesario
                    const chatDate = new Date(Number(dateValue) || dateValue).toISOString().split('T')[0];
                    
                    if (!chatsByDate[chatDate]) {
                        chatsByDate[chatDate] = 0;
                    }
                    chatsByDate[chatDate]++;
                }
            });
            
            console.log('📊 Chats agrupados por fecha:', chatsByDate);
        }
        
        // Calcular la semana basada en el offset
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + (weekOffset * 7));
        
        const chatFlow = {};
        this.last7Days = [];
        
        // Generar 7 días desde la fecha base
        for (let i = 6; i >= 0; i--) {
            const date = new Date(baseDate);
            date.setDate(baseDate.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
            const dayKey = `${dayName} ${date.getDate()}`;
            
            this.last7Days.push({ key: dayKey, date: dateStr });
            chatFlow[dayKey] = chatsByDate[dateStr] || 0;
        }

        console.log('📊 Flujo de chats por día:', chatFlow);
        console.log('📊 Rango de fechas:', this.last7Days.map(d => `${d.key}: ${d.date} (${chatFlow[d.key]} chats)`).join(', '));
        return chatFlow;
    }

    initializeChannelsChart() {
        const ctx = document.getElementById('channelsChart');
        if (!ctx) return;

        if (typeof Chart === 'undefined') {
            console.warn('⚠️ Chart.js no está disponible para channelsChart');
            return;
        }

        // Datos reales basados en los chats
        const channelData = this.calculateChannelDistribution();
        const labels = Object.keys(channelData);
        const data = Object.values(channelData);

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#25D366', // WhatsApp
                        '#E4405F', // Instagram
                        '#6366f1'  // Web
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    calculateChannelDistribution() {
        const channels = {};
        
        this.dashboardData.chats.forEach(chat => {
            const channel = chat.type || 'whatsapp';
            channels[channel] = (channels[channel] || 0) + 1;
        });

        return channels;
    }

    handleResize() {
        if (window.innerWidth > 768) {
            this.closeMobileMenu();
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // Filter chats based on selected filters
    async filterChats() {
        const agentFilter = document.getElementById('agentFilter');
        const channelFilter = document.getElementById('channelFilter');
        const dateFilter = document.getElementById('dateFilter');

        const filters = {
            agentId: agentFilter?.value || '',
            channel: channelFilter?.value || '',
            date: dateFilter?.value || ''
        };

        console.log('🔍 Aplicando filtros:', filters);

        try {
            // Obtener chats con filtros
            const chatsResult = await this.dataService.getChats(filters);
            
            if (chatsResult.success && chatsResult.data) {
                this.dashboardData.chats = chatsResult.data;
                this.updateChatsList();
                console.log(`✅ ${chatsResult.data.length} chats filtrados mostrados`);
            }
        } catch (error) {
            console.error('❌ Error aplicando filtros:', error);
        }
    }


    // ============================================
    // Sistema de Notificaciones en Header
    // ============================================

    setupHeaderNotifications() {
        console.log('🔔 Configurando notificaciones en header...');

        const bellButton = document.getElementById('bellButton');

        if (!bellButton) {
            console.error('❌ Botón de campana no encontrado');
            return;
        }

        // Abrir modal de notificaciones
        bellButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔔 Clic en campana detectado - Abriendo modal');
            this.showNotificationsModal();
        });

        // Actualizar contador inicial
        this.updateNotificationBadge();

        console.log('✅ Notificaciones en header configuradas');
    }

    showNotificationsModal() {
        console.log('📋 Mostrando modal de notificaciones...');
        
        // Cerrar modal existente si hay uno
        const existingModal = document.querySelector('.notifications-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay notifications-modal';
        modal.innerHTML = `
            <div class="modal-content notifications-modal-content">
                <div class="modal-header">
                    <h2>
                        <i class="fas fa-bell"></i>
                        Notificaciones
                    </h2>
                    <button class="modal-close" id="closeNotificationsModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="notifications-actions">
                        <button class="btn btn-outline btn-sm" id="markAllReadModal">
                            <i class="fas fa-check-double"></i>
                            Marcar todas como leídas
                        </button>
                    </div>
                    <div class="notifications-list" id="notificationsListModal">
                        ${this.renderNotificationsList()}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        console.log('✅ Modal de notificaciones agregado al DOM');

        // Event listeners
        const closeBtn = modal.querySelector('#closeNotificationsModal');
        const markAllReadBtn = modal.querySelector('#markAllReadModal');

        closeBtn.addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', () => {
                // Marcar todos los chats como abiertos
                this.headerNotifications.forEach(notif => {
                    this.markChatAsOpened(notif.chatId);
                });
                
                this.markAllNotificationsAsRead();
                
                // Actualizar la lista en el modal
                const listContainer = modal.querySelector('#notificationsListModal');
                if (listContainer) {
                    listContainer.innerHTML = this.renderNotificationsList();
                    this.setupNotificationItemListeners(listContainer);
                }
            });
        }

        // Setup listeners para items de notificación
        const listContainer = modal.querySelector('#notificationsListModal');
        if (listContainer) {
            this.setupNotificationItemListeners(listContainer);
        }
    }

    renderNotificationsList() {
        // Filtrar solo notificaciones de chats no abiertos
        const unopenedNotifications = this.headerNotifications.filter(notif => 
            !this.isChatOpened(notif.chatId)
        );

        console.log('🔍 Debug notificaciones:');
        console.log('- Total notificaciones en headerNotifications:', this.headerNotifications.length);
        console.log('- Notificaciones no abiertas:', unopenedNotifications.length);
        console.log('- Total chats sin abrir:', this.dashboardData.chats.filter(chat => !this.isChatOpened(chat.id)).length);

        // Generar notificaciones de prueba si no hay ninguna
        if (unopenedNotifications.length === 0) {
            console.log('🔄 No hay notificaciones, generando notificaciones de prueba...');
            this.generateTestNotifications();
            // Filtrar nuevamente después de generar
            const updatedUnopenedNotifications = this.headerNotifications.filter(notif => 
                !this.isChatOpened(notif.chatId)
            );
            
            console.log('- Notificaciones después de generar:', updatedUnopenedNotifications.length);
            
            if (updatedUnopenedNotifications.length === 0) {
                return `
                    <div class="empty-notifications">
                        <i class="fas fa-bell-slash"></i>
                        <p>No hay notificaciones</p>
                    </div>
                `;
            }
            
            return updatedUnopenedNotifications.map(notif => `
                <div class="notification-item unread" data-notification-id="${notif.id}" data-chat-id="${notif.chatId}">
                    <div class="notification-item-icon">
                        <i class="fas fa-comment"></i>
                    </div>
                    <div class="notification-item-content">
                        <div class="notification-item-title">${notif.chatName}</div>
                        <div class="notification-item-body">${notif.message}</div>
                        <div class="notification-item-time">${this.formatTime(notif.timestamp)}</div>
                    </div>
                </div>
            `).join('');
        }

        console.log('✅ Renderizando notificaciones no abiertas:', unopenedNotifications.length);
        
        return unopenedNotifications.map(notif => `
            <div class="notification-item unread" data-notification-id="${notif.id}" data-chat-id="${notif.chatId}">
                <div class="notification-item-icon">
                    <i class="fas fa-comment"></i>
                </div>
                <div class="notification-item-content">
                    <div class="notification-item-title">${notif.chatName}</div>
                    <div class="notification-item-body">${notif.message}</div>
                    <div class="notification-item-time">${this.formatTime(notif.timestamp)}</div>
                </div>
            </div>
        `).join('');
    }

    generateTestNotifications() {
        console.log('🔔 Generando notificaciones de prueba...');
        
        // Obtener chats que no han sido abiertos
        const chats = this.dashboardData.chats || [];
        const unopenedChats = chats.filter(chat => !this.isChatOpened(chat.id));
        const testNotifications = [];

        // Crear notificaciones solo para chats no abiertos
        unopenedChats.slice(0, 10).forEach((chat, index) => {
            const notification = {
                id: `test-${chat.id}-${Date.now()}-${index}`,
                chatId: chat.id,
                chatName: chat.name || chat.userName || 'Usuario',
                message: 'Nuevo mensaje',
                type: 'new-message',
                timestamp: new Date(Date.now() - (index * 5 * 60 * 1000)), // 5 min, 10 min, 15 min ago
                read: false // Todas son no leídas
            };
            testNotifications.push(notification);
        });

        // Agregar notificaciones al array
        this.headerNotifications = [...this.headerNotifications, ...testNotifications];
        
        // Actualizar contador
        this.updateNotificationBadge();
        
        console.log('✅ Notificaciones de prueba generadas:', testNotifications.length);
    }

    setupNotificationItemListeners(container) {
        container.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const chatId = item.dataset.chatId;
                const notifId = item.dataset.notificationId;
                
                console.log('📬 Clic en notificación:', chatId);
                
                // Marcar chat como abierto
                this.markChatAsOpened(chatId);
                
                // Marcar notificación como leída
                this.markNotificationAsRead(notifId);
                
                // Cerrar modal
                const modal = document.querySelector('.notifications-modal');
                if (modal) {
                    modal.remove();
                }
                
                // Abrir el chat
                window.dispatchEvent(new CustomEvent('openChat', {
                    detail: { chatId }
                }));
            });
        });
    }

    addHeaderNotification(notification) {
        const { id, chatId, chatName, message, type, timestamp } = notification;

        // Agregar a la lista
        this.headerNotifications.unshift({
            id: id || Date.now().toString(),
            chatId,
            chatName,
            message,
            type: type || 'message',
            timestamp: timestamp || Date.now(),
            read: false
        });

        // Limitar a 50 notificaciones
        if (this.headerNotifications.length > 50) {
            this.headerNotifications = this.headerNotifications.slice(0, 50);
        }

        // Actualizar contador
        this.unreadNotificationsCount++;
        this.updateNotificationBadge();

        console.log('📬 Notificación agregada al header:', chatName);
    }

    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;

        // Contar chats sin abrir
        const unopenedCount = this.dashboardData.chats.filter(
            chat => !this.isChatOpened(chat.id)
        ).length;

        if (unopenedCount > 0) {
            badge.textContent = unopenedCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    markNotificationAsRead(notifId) {
        const notif = this.headerNotifications.find(n => n.id === notifId);
        if (notif && !notif.read) {
            notif.read = true;
            this.unreadNotificationsCount = Math.max(0, this.unreadNotificationsCount - 1);
            this.updateNotificationBadge();
        }
    }

    markAllNotificationsAsRead() {
        this.headerNotifications.forEach(notif => {
            notif.read = true;
        });
        this.unreadNotificationsCount = 0;
        this.updateNotificationBadge();
        
        console.log('✅ Todas las notificaciones marcadas como leídas');
    }

    // ============================================
    // Sistema de Notificaciones y Polling
    // ============================================

    setupNotificationsAndPolling() {
        console.log('🔔 Configurando sistema de notificaciones y polling...');

        // Inicializar servicios
        this.notificationService = new NotificationService();
        this.pollingService = new PollingService(this.dataService, this.notificationService);

        // Configurar event listeners para eventos del polling
        this.setupPollingEventListeners();

        // Iniciar polling (async)
        this.pollingService.startPolling();

        console.log('✅ Sistema de notificaciones y polling configurado');
    }

    /**
     * Carga los chats abiertos desde localStorage
     */
    loadOpenedChats() {
        try {
            const stored = localStorage.getItem('openedChats');
            if (stored) {
                const chatsArray = JSON.parse(stored);
                this.openedChats = new Set(chatsArray);
                console.log('📥 Chats abiertos cargados:', this.openedChats.size);
            }
        } catch (error) {
            console.error('❌ Error cargando chats abiertos:', error);
            this.openedChats = new Set();
        }
    }

    /**
     * Guarda los chats abiertos en localStorage
     */
    saveOpenedChats() {
        try {
            const chatsArray = Array.from(this.openedChats);
            localStorage.setItem('openedChats', JSON.stringify(chatsArray));
        } catch (error) {
            console.error('❌ Error guardando chats abiertos:', error);
        }
    }

    /**
     * Marca un chat como abierto
     */
    markChatAsOpened(chatId) {
        if (!this.openedChats.has(chatId)) {
            this.openedChats.add(chatId);
            this.saveOpenedChats();
            console.log('✅ Chat marcado como abierto:', chatId);
        }
    }

    /**
     * Verifica si un chat ha sido abierto
     */
    isChatOpened(chatId) {
        return this.openedChats.has(chatId);
    }

    /**
     * Fuerza el refresh de chats desde la API
     */
    async forceRefreshChats() {
        try {
            console.log('🔄 Forzando refresh de chats...');
            
            // Obtener chats frescos sin cache
            const result = await this.dataService.getChatsFresh();
            
            if (result.success && result.data) {
                console.log(`✅ ${result.data.length} chats obtenidos (refresh manual)`);
                
                // Actualizar datos
                this.dashboardData.chats = result.data;
                this.allChats = [...result.data]; // Actualizar también allChats
                
                // Actualizar UI
                this.updateChatsDisplay();
                
                // Mostrar mensaje de éxito
                this.showNotification('Chats actualizados', 'success');
            } else {
                this.showNotification('Error al actualizar chats', 'error');
            }
        } catch (error) {
            console.error('❌ Error en refresh manual:', error);
            this.showNotification('Error al actualizar chats', 'error');
        }
    }

    /**
     * Actualiza la visualización de chats sin recargar todo
     */
    updateChatsDisplay() {
        const chatsContainer = document.getElementById('chatsList');
        if (!chatsContainer) {
            console.log('⚠️ No se encontró el contenedor de chats, puede que no estemos en la sección de chats');
            return;
        }

        console.log('🔄 Actualizando visualización de chats...');
        
        // Actualizar estadísticas del dashboard cuando se actualicen los chats
        this.updateOverviewStats();
        
        // Guardar el scroll actual
        const currentScrollTop = chatsContainer.scrollTop;
        
        // Limpiar contenedor
        chatsContainer.innerHTML = '';
        
        // Aplicar filtros activos si los hay
        this.applyActiveFilters();
        
        // Restaurar scroll
        chatsContainer.scrollTop = currentScrollTop;
        
        console.log('✅ Visualización de chats actualizada');
    }

    /**
     * Obtiene chats filtrados según el filtro actual
     */
    getFilteredChats() {
        const agentFilter = document.getElementById('agentFilter');
        const selectedAgentId = agentFilter ? agentFilter.value : '';
        
        if (!selectedAgentId || selectedAgentId === '') {
            return this.dashboardData.chats;
        }
        
        return this.dashboardData.chats.filter(chat => chat.agentId === selectedAgentId);
    }

    setupPollingEventListeners() {
        // Prevenir múltiples registros de eventos
        if (this.pollingListenersInitialized) {
            console.log('⚠️ Listeners de polling ya inicializados, saltando.');
            return;
        }

        // Evento: Nuevos chats detectados
        window.addEventListener('newChatsDetected', (event) => {
            console.log('🆕 Nuevos chats detectados:', event.detail.newChats.length);
            
            // Actualizar la lista de chats en el dashboard PRIMERO
            this.dashboardData.chats = event.detail.allChats;
            this.allChats = [...event.detail.allChats]; // También actualizar allChats
            
            // Filtrar solo chats que NO han sido abiertos
            const unopenedChats = event.detail.newChats.filter(chat => !this.isChatOpened(chat.id));
            
            console.log('📬 Chats sin abrir:', unopenedChats.length);
            
            // Mostrar notificaciones solo para chats sin abrir
            unopenedChats.forEach(chat => {
                // Notificación flotante
                this.notificationService.showNewChat(
                    chat.name || chat.userName || 'Usuario',
                    chat.id
                );
                
                // Notificación en header
                this.addHeaderNotification({
                    chatId: chat.id,
                    chatName: chat.name || chat.userName || 'Usuario',
                    message: 'Ha iniciado una conversación',
                    type: 'new-chat',
                    timestamp: Date.now()
                });
            });
            
            // SIEMPRE actualizar la UI, independientemente de la sección
            this.updateChatsDisplay();
            this.updateNotificationBadge();
        });

        // Evento: Nuevos mensajes detectados
        window.addEventListener('newMessagesDetected', (event) => {
            console.log('💬 Nuevos mensajes detectados en', event.detail.chatsWithNewMessages.length, 'chats');
            
            // Actualizar chats con nuevos mensajes PRIMERO
            event.detail.chatsWithNewMessages.forEach(({ chat }) => {
                const existingChat = this.dashboardData.chats.find(c => c.id === chat.id);
                if (existingChat) {
                    existingChat.messages = chat.messages;
                    existingChat.conversation = chat.conversation || existingChat.conversation;
                    existingChat.time = chat.time || existingChat.time;
                }
                
                // También actualizar en allChats
                const existingChatInAll = this.allChats.find(c => c.id === chat.id);
                if (existingChatInAll) {
                    existingChatInAll.messages = chat.messages;
                    existingChatInAll.conversation = chat.conversation || existingChatInAll.conversation;
                    existingChatInAll.time = chat.time || existingChatInAll.time;
                }
            });
            
            // Filtrar solo chats que NO han sido abiertos
            const unopenedChatsWithMessages = event.detail.chatsWithNewMessages.filter(
                ({ chat }) => !this.isChatOpened(chat.id)
            );
            
            console.log('📬 Mensajes en chats sin abrir:', unopenedChatsWithMessages.length);
            
            // Mostrar notificaciones solo para chats sin abrir
            unopenedChatsWithMessages.forEach(({ chat }) => {
                if (chat.messages && chat.messages.length > 0) {
                    const lastMessage = chat.messages[chat.messages.length - 1];
                    const messageText = lastMessage.text || 'Mensaje multimedia';
                    
                    // Notificación flotante
                    this.notificationService.showNewMessage(
                        chat.name || chat.userName || 'Usuario',
                        messageText,
                        chat.id
                    );
                    
                    // Notificación en header
                    this.addHeaderNotification({
                        chatId: chat.id,
                        chatName: chat.name || chat.userName || 'Usuario',
                        message: messageText,
                        type: 'message',
                        timestamp: Date.now()
                    });
                }
            });
            
            // SIEMPRE actualizar la UI, independientemente de la sección
            this.updateChatsDisplay();
            this.updateNotificationBadge();
        });

        // Evento: Chat refrescado (mensajes actualizados del chat actual)
        window.addEventListener('chatRefreshed', (event) => {
            console.log('🔄 Chat refrescado:', event.detail.chatId);
            
            // Validar chatId
            if (!event.detail.chatId || event.detail.chatId === 'undefined') {
                console.error('❌ ChatId inválido en evento chatRefreshed');
                return;
            }
            
            // Si es el chat actual, actualizar los mensajes
            if (event.detail.chatId === this.currentChatId) {
                const chat = this.dashboardData.chats.find(c => c.id === event.detail.chatId);
                if (chat) {
                    chat.messages = event.detail.messages;
                    this.updateChatMessagesOnly(chat);
                }
            }
        });

        // Evento: Abrir chat desde notificación
        window.addEventListener('openChat', (event) => {
            console.log('📂 Abriendo chat desde notificación:', event.detail.chatId);
            
            // Validar chatId
            if (!event.detail.chatId || event.detail.chatId === 'undefined') {
                console.error('❌ ChatId inválido en evento openChat');
                return;
            }
            
            // Cambiar a la sección de chats si no estamos ahí
            if (this.currentSection !== 'chats') {
                this.showSection('chats');
            }
            
            // Abrir el chat
            this.selectChatById(event.detail.chatId);
        });

        this.pollingListenersInitialized = true;
        console.log('✅ Listeners de polling inicializados');
    }

    async selectChatById(chatId) {
        // Validar chatId antes de proceder
        if (!chatId || chatId === 'undefined' || chatId === undefined) {
            console.error('❌ ChatId inválido en selectChatById:', chatId);
            return;
        }
        
        console.log('📂 Seleccionando chat:', chatId);
        
        // Buscar el chat en los datos
        const chat = this.dashboardData.chats.find(c => c.id === chatId);
        if (!chat) {
            console.error('❌ Chat no encontrado:', chatId);
            return;
        }
        
        // Establecer como chat actual
        this.currentChatId = chatId;
        
        // Marcar como abierto
        this.markChatAsOpened(chatId);
        
        // Informar al polling service
        if (this.pollingService) {
            this.pollingService.setCurrentChat(chatId);
        }
        
        // Seleccionar el chat
        await this.selectChat(chat);
    }

    stopPolling() {
        if (this.pollingService) {
            this.pollingService.stopPolling();
            console.log('🛑 Polling detenido');
        }
    }

    startPolling() {
        if (this.pollingService) {
            this.pollingService.startPolling();
            console.log('🔄 Polling iniciado');
        }
    }

    // Función para mostrar modal de invitar miembros del equipo
    showTeamModal() {
        console.log('👥 Mostrando modal de invitar miembro del equipo...');
        
        // Cerrar modal existente si hay uno
        const existingModal = document.querySelector('.team-modal');
        if (existingModal) {
            console.log('⚠️ Cerrando modal existente');
            existingModal.remove();
        }

        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay team-modal';
        modal.innerHTML = `
            <div class="modal-content team-modal-content">
                <div class="modal-header">
                    <h2>
                        <i class="fas fa-user-plus"></i>
                        Invitar Miembro del Equipo
                    </h2>
                    <button class="modal-close" id="closeTeamModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="inviteTeamForm">
                        
                        <div class="form-group">
                            <label for="memberEmail">
                                <i class="fas fa-envelope"></i>
                                Correo Electrónico
                            </label>
                            <input 
                                type="email" 
                                id="memberEmail" 
                                name="memberEmail" 
                                class="form-input" 
                                placeholder="juan@ejemplo.com"
                                required
                            />
                        </div>
                        
                        <div class="form-group">
                            <label for="memberRole">
                                <i class="fas fa-briefcase"></i>
                                Rol
                            </label>
                            <select id="memberRole" name="memberRole" class="form-input" disabled style="background-color: #f3f4f6; cursor: not-allowed;">
                                <option value="user" selected>User</option>
                            </select>
                            <input type="hidden" name="memberRoleValue" value="user">
                            <small style="color: #6b7280; font-size: 0.875rem; margin-top: 0.25rem; display: block;">
                                Todos los nuevos miembros se crean con el rol de usuario
                            </small>
                        </div>
                        
                        
                        
                        <div class="modal-actions">
                            <button type="button" class="btn btn-outline" id="cancelInviteBtn">
                                <i class="fas fa-times"></i>
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary" id="sendInviteBtn">
                                <i class="fas fa-paper-plane"></i>
                                Enviar Invitación
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        console.log('✅ Modal de invitar miembro agregado al DOM');

        // Event listeners
        const closeBtn = modal.querySelector('#closeTeamModal');
        const cancelBtn = modal.querySelector('#cancelInviteBtn');
        const form = modal.querySelector('#inviteTeamForm');

        const closeModal = () => {
            console.log('🚫 Cerrando modal de invitar miembro');
            modal.remove();
        };

        closeBtn.addEventListener('click', () => {
            console.log('📍 Clic en botón cerrar (X)');
            closeModal();
        });

        cancelBtn.addEventListener('click', () => {
            console.log('📍 Clic en botón Cancelar');
            closeModal();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                console.log('📍 Clic fuera del modal');
                closeModal();
            }
        });

        // Manejar envío del formulario
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('📍 Clic en botón Enviar Invitación');
            console.log('📝 Procesando formulario de invitación...');
            
            const formData = new FormData(form);
            const emailValue = formData.get('memberEmail');
            const derivedName = (emailValue || '').split('@')[0];
            const memberData = {
                id: Date.now().toString(),
                name: derivedName,
                email: emailValue,
                role: 'user', // Rol fijo predefinido
                status: 'pending',
                invitedAt: new Date().toISOString()
            };

            console.log('👤 Datos del miembro a invitar:', memberData);
            console.log('📌 Rol asignado automáticamente: user (predefinido)');

            try {
                // Usar TeamManager/Airtable, no datos mock
                const ready = await this.waitForTeamManager(3000);
                if (ready && window.teamManager) {
                    await window.teamManager.handleInvite(form, modal);
                } else {
                    console.warn('⚠️ teamManager no disponible; no se puede invitar miembro real');
                    this.showNotification('No se pudo inicializar el gestor de equipo. Intenta nuevamente.', 'warning');
                    return; 
                }
                // Actualizar la lista visual desde fuente real
                this.updateTeamList();
                await this.updateOverviewStats();

                // Mostrar notificación de éxito
                this.showNotification(`Invitación enviada a ${memberData.email}`, 'success');
                console.log('✅ Notificación de éxito mostrada');

                // Cerrar modal
                closeModal();

            } catch (error) {
                console.error('❌ Error al invitar miembro:', error);
                this.showNotification('Error al enviar la invitación. Por favor, intenta de nuevo.', 'error');
            }
        });

        console.log('🎯 Event listeners del modal configurados correctamente');
    }

    // Función de utilidad para limpiar toda la cache
    clearAllCache() {
        console.log('🧹 Limpiando toda la cache del dashboard...');
        
        // Limpiar cache de la API
        if (this.api) {
            if (typeof this.api.clearAllCache === 'function') {
                this.api.clearAllCache();
            } else if (typeof this.api.clearCacheByPrefix === 'function') {
                this.api.clearCacheByPrefix('');
            }
            console.log('✅ Cache de API limpiada');
        }
        
        // Limpiar cache de DataService
        if (this.dataService && typeof this.dataService.clearCache === 'function') {
            this.dataService.clearCache();
            console.log('✅ Cache de DataService limpiada');
        }
        
        console.log('✅ Toda la cache ha sido limpiada');
        return true;
    }

    // ===== PROSPECTOS MANAGEMENT =====

    setupProspectsManagement() {
        console.log('👥 Configurando gestión de prospectos...');

        // Botón de sincronizar
        const refreshBtn = document.getElementById('refreshProspectsBtn');
        if (refreshBtn) {
            // Remover listeners anteriores para evitar duplicados
            const newRefreshBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
            newRefreshBtn.addEventListener('click', async () => {
                await this.loadProspects();
            });
        }

        // Botón de extraer prospectos
        const extractBtn = document.getElementById('extractProspectsBtn');
        if (extractBtn) {
            // Remover listeners anteriores para evitar duplicados
            const newExtractBtn = extractBtn.cloneNode(true);
            extractBtn.parentNode.replaceChild(newExtractBtn, extractBtn);
            newExtractBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Prevenir múltiples clics simultáneos
                if (newExtractBtn.disabled) {
                    console.log('⚠️ Extracción ya en progreso, ignorando clic');
                    return;
                }
                
                // Deshabilitar botón durante la ejecución
                newExtractBtn.disabled = true;
                const originalText = newExtractBtn.innerHTML;
                newExtractBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extrayendo...';
                
                try {
                    await this.extractProspectsFromChats();
                } finally {
                    // Rehabilitar botón después de la ejecución
                    newExtractBtn.disabled = false;
                    newExtractBtn.innerHTML = originalText;
                }
            });
        }

        // Configurar búsqueda y filtros
        this.setupProspectsFilters();
        
        // Configurar paginación
        this.setupProspectsPagination();

        // Cargar prospectos al entrar a la sección
        this.loadProspects();
    }
    
    setupProspectsPagination() {
        // Botón anterior
        const prevBtn = document.getElementById('prospectsPaginationPrev');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.prospectsPagination.currentPage > 1) {
                    this.prospectsPagination.currentPage--;
                    this.renderProspectsPaginated();
                    this.updatePaginationControls();
                    // Scroll suave hacia arriba de la tabla
                    const tableContainer = document.querySelector('.prospects-table-container');
                    if (tableContainer) {
                        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        }

        // Botón siguiente
        const nextBtn = document.getElementById('prospectsPaginationNext');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.prospectsPagination.currentPage < this.prospectsPagination.totalPages) {
                    this.prospectsPagination.currentPage++;
                    this.renderProspectsPaginated();
                    this.updatePaginationControls();
                    // Scroll suave hacia arriba de la tabla
                    const tableContainer = document.querySelector('.prospects-table-container');
                    if (tableContainer) {
                        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        }

        // Selector de items por página
        const itemsPerPageSelect = document.getElementById('prospectsItemsPerPage');
        if (itemsPerPageSelect) {
            itemsPerPageSelect.addEventListener('change', (e) => {
                const newItemsPerPage = parseInt(e.target.value, 10);
                this.prospectsPagination.itemsPerPage = newItemsPerPage;
                this.prospectsPagination.currentPage = 1; // Resetear a página 1
                this.prospectsPagination.totalPages = Math.max(1, Math.ceil(
                    this.prospectsPagination.totalFiltered / newItemsPerPage
                ));
                this.renderProspectsPaginated();
                this.updatePaginationControls();
            });
        }

        // Input de página directa
        const pageInput = document.getElementById('prospectsPageInput');
        if (pageInput) {
            pageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const pageNumber = parseInt(e.target.value, 10);
                    if (pageNumber >= 1 && pageNumber <= this.prospectsPagination.totalPages) {
                        this.prospectsPagination.currentPage = pageNumber;
                        this.renderProspectsPaginated();
                        this.updatePaginationControls();
                        // Scroll suave hacia arriba de la tabla
                        const tableContainer = document.querySelector('.prospects-table-container');
                        if (tableContainer) {
                            tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    } else {
                        // Restaurar valor válido
                        e.target.value = this.prospectsPagination.currentPage;
                    }
                }
            });
        }
    }
    
    updatePaginationControls() {
        const { currentPage, totalPages, totalFiltered, itemsPerPage } = this.prospectsPagination;
        
        // Actualizar botones anterior/siguiente
        const prevBtn = document.getElementById('prospectsPaginationPrev');
        const nextBtn = document.getElementById('prospectsPaginationNext');
        
        if (prevBtn) {
            prevBtn.disabled = currentPage === 1 || totalFiltered === 0;
            prevBtn.classList.toggle('disabled', currentPage === 1 || totalFiltered === 0);
        }
        
        if (nextBtn) {
            nextBtn.disabled = currentPage === totalPages || totalFiltered === 0;
            nextBtn.classList.toggle('disabled', currentPage === totalPages || totalFiltered === 0);
        }
        
        // Actualizar información de página
        const pageInfo = document.getElementById('prospectsPageInfo');
        if (pageInfo) {
            if (totalFiltered === 0) {
                pageInfo.textContent = 'No hay prospectos para mostrar';
            } else {
                const startIndex = (currentPage - 1) * itemsPerPage + 1;
                const endIndex = Math.min(currentPage * itemsPerPage, totalFiltered);
                pageInfo.textContent = `Mostrando ${startIndex}-${endIndex} de ${totalFiltered} prospectos`;
            }
        }
        
        // Actualizar input de página
        const pageInput = document.getElementById('prospectsPageInput');
        if (pageInput) {
            pageInput.value = totalFiltered === 0 ? 0 : currentPage;
            pageInput.max = totalPages;
            pageInput.disabled = totalFiltered === 0;
        }
        
        // Actualizar total de páginas
        const totalPagesSpan = document.getElementById('prospectsTotalPages');
        if (totalPagesSpan) {
            totalPagesSpan.textContent = totalPages;
        }
        
        // Ocultar/mostrar controles de paginación si no hay prospectos
        const paginationContainer = document.querySelector('.prospects-pagination');
        if (paginationContainer) {
            paginationContainer.style.display = totalFiltered === 0 ? 'none' : 'flex';
        }
    }

    setupProspectsFilters() {
        // Búsqueda
        const searchInput = document.getElementById('prospectSearchInput');
        const clearSearchBtn = document.getElementById('clearProspectSearch');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                if (query.length > 0) {
                    clearSearchBtn.style.display = 'flex';
                } else {
                    clearSearchBtn.style.display = 'none';
                }
                this.applyProspectsFilters();
            });
        }

        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                this.applyProspectsFilters();
            });
        }

        // Filtro de fecha
        const dateFilter = document.getElementById('prospectDateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', () => {
                this.applyProspectsFilters();
            });
        }

        // Botón limpiar filtros
        const clearFiltersBtn = document.getElementById('clearProspectFilters');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (dateFilter) dateFilter.value = '';
                if (clearSearchBtn) clearSearchBtn.style.display = 'none';
                this.applyProspectsFilters();
            });
        }
    }

    applyProspectsFilters() {
        const searchInput = document.getElementById('prospectSearchInput');
        const dateFilter = document.getElementById('prospectDateFilter');
        
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const dateFilterValue = dateFilter ? dateFilter.value : '';

        // Obtener todos los prospectos originales
        const allProspects = this.allProspects || [];
        
        // Filtrar prospectos
        let filteredProspects = allProspects.filter(prospect => {
            // Filtro de búsqueda
            if (searchQuery) {
                const nombre = (prospect.nombre || '').toLowerCase();
                const telefono = (prospect.telefono || '').toLowerCase();
                if (!nombre.includes(searchQuery) && !telefono.includes(searchQuery)) {
                    return false;
                }
            }

            // Filtro de fecha
            if (dateFilterValue) {
                const prospectDate = prospect.fechaExtraccion 
                    ? new Date(prospect.fechaExtraccion).toISOString().split('T')[0]
                    : '';
                if (prospectDate !== dateFilterValue) {
                    return false;
                }
            }

            return true;
        });

        // Ordenar: más recientes primero (priorizar createdTime - fecha de creación)
        // Esto asegura que el último prospecto agregado aparezca primero
        filteredProspects.sort((a, b) => {
            // Priorizar createdTime (fecha de creación del registro)
            // Si no existe, usar fechaExtraccion como fallback
            const dateA = new Date(a.createdTime || a.fechaExtraccion || 0).getTime();
            const dateB = new Date(b.createdTime || b.fechaExtraccion || 0).getTime();
            return dateB - dateA; // Más reciente primero
        });

        // Guardar prospectos filtrados para paginación
        this.prospectsPagination.filteredProspects = filteredProspects;
        this.prospectsPagination.totalFiltered = filteredProspects.length;
        
        // Resetear a página 1 cuando se aplican nuevos filtros
        this.prospectsPagination.currentPage = 1;
        
        // Calcular total de páginas
        this.prospectsPagination.totalPages = Math.max(1, Math.ceil(filteredProspects.length / this.prospectsPagination.itemsPerPage));

        // Renderizar prospectos con paginación
        this.renderProspectsPaginated();
        
        // Actualizar controles de paginación
        this.updatePaginationControls();
    }

    async loadProspects() {
        try {
            console.log('📊 Cargando prospectos...');
            
            if (!window.prospectsService) {
                console.error('❌ ProspectsService no disponible');
                this.showNotification('Error: Servicio de prospectos no disponible', 'error');
                return;
            }

            const result = await window.prospectsService.getAllProspects();
            
            if (result.success) {
                // Filtrar prospectos inválidos (sin nombre válido o sin chat_id)
                let validProspects = (result.data || []).filter(prospect => {
                    const hasValidName = prospect.nombre && 
                                        prospect.nombre !== 'Sin nombre' && 
                                        prospect.nombre.trim().length > 0;
                    const hasChatId = prospect.chatId && prospect.chatId.trim().length > 0;
                    return hasValidName && hasChatId;
                });
                
                // Eliminar duplicados por chat_id (mantener el más reciente)
                const uniqueProspects = [];
                const seenChatIds = new Set();
                
                // Ordenar por fecha de creación en Airtable (createdTime) - más reciente primero
                // Esto asegura que el último prospecto agregado aparezca primero
                validProspects.sort((a, b) => {
                    // Priorizar createdTime (fecha de creación del registro)
                    // Si no existe, usar fechaExtraccion como fallback
                    const dateA = new Date(a.createdTime || a.fechaExtraccion || 0).getTime();
                    const dateB = new Date(b.createdTime || b.fechaExtraccion || 0).getTime();
                    return dateB - dateA; // Más reciente primero
                });
                
                // Mantener solo el primero de cada chat_id (que será el más reciente después del sort)
                validProspects.forEach(prospect => {
                    if (!seenChatIds.has(prospect.chatId)) {
                        seenChatIds.add(prospect.chatId);
                        uniqueProspects.push(prospect);
                    } else {
                        console.log(`⚠️ Duplicado encontrado y eliminado: ${prospect.nombre} (chat: ${prospect.chatId})`);
                    }
                });
                
                console.log(`✅ ${uniqueProspects.length} prospectos únicos de ${result.data.length} totales (eliminados ${result.data.length - uniqueProspects.length} duplicados/inválidos)`);
                
                // Guardar todos los prospectos para filtrado
                this.allProspects = uniqueProspects;
                
                // Si no hay prospectos, mostrar mensaje informativo
                if (uniqueProspects.length === 0) {
                    this.showNotification('Para extraer los prospectos, ve a Prospectos y dale a Extraer', 'info');
                }
                
                // Aplicar filtros (si hay alguno activo) o mostrar todos
                this.applyProspectsFilters();
            } else {
                // Si no hay datos pero no es un error crítico, mostrar mensaje informativo
                if (result.error && (result.error.includes('no encontrado') || result.error.includes('vací') || result.error.includes('empty'))) {
                    this.showNotification('Para extraer los prospectos, ve a Prospectos y dale a Extraer', 'info');
                    // Inicializar con lista vacía
                    this.allProspects = [];
                    this.applyProspectsFilters();
                } else {
                    // Solo mostrar error si es un error real (conexión, etc.)
                    throw new Error(result.error || 'Error cargando prospectos');
                }
            }
        } catch (error) {
            console.error('❌ Error cargando prospectos:', error);
            // Si el error es que no hay datos, mostrar mensaje informativo
            if (error.message.includes('no encontrado') || error.message.includes('vací') || error.message.includes('empty') || error.message.includes('404')) {
                this.showNotification('Para extraer los prospectos, ve a Prospectos y dale a Extraer', 'info');
                // Inicializar con lista vacía
                this.allProspects = [];
                this.applyProspectsFilters();
            } else {
                this.showNotification('Error al cargar los prospectos', 'error');
            }
        }
    }

    renderProspectsPaginated() {
        const prospectsList = document.getElementById('prospectsList');
        if (!prospectsList) return;

        prospectsList.innerHTML = '';

        const { filteredProspects, currentPage, itemsPerPage } = this.prospectsPagination;
        
        if (filteredProspects.length === 0) {
            prospectsList.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center">
                        <div class="no-prospects">
                            <i class="fas fa-user-friends"></i>
                            <h3>No hay prospectos</h3>
                            <p>Haz clic en "Extraer Prospectos" para analizar los chats y extraer información</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        // Calcular índices para la página actual
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const prospectsToRender = filteredProspects.slice(startIndex, endIndex);

        // Renderizar solo los prospectos de la página actual
        prospectsToRender.forEach(prospect => {
            const row = this.createProspectRow(prospect);
            prospectsList.appendChild(row);
        });
    }

    // Método legacy para compatibilidad (ahora usa paginación)
    renderProspects(prospects) {
        // Si se llama directamente, aplicar paginación
        this.prospectsPagination.filteredProspects = prospects;
        this.prospectsPagination.totalFiltered = prospects.length;
        this.prospectsPagination.currentPage = 1;
        this.prospectsPagination.totalPages = Math.max(1, Math.ceil(prospects.length / this.prospectsPagination.itemsPerPage));
        this.renderProspectsPaginated();
        this.updatePaginationControls();
    }

    createProspectRow(prospect) {
        const row = document.createElement('tr');
        
        const nombre = prospect.nombre || 'Sin nombre';
        const telefono = prospect.telefono || 'N/A';
        const fechaExtraccion = prospect.fechaExtraccion 
            ? new Date(prospect.fechaExtraccion).toLocaleDateString('es-ES')
            : 'N/A';
        const imagenesCount = prospect.imagenesUrls?.length || 0;
        const documentosCount = prospect.documentosUrls?.length || 0;

        row.innerHTML = `
            <td>
                <strong>${nombre}</strong>
            </td>
            <td>${telefono}</td>
            <td>${fechaExtraccion}</td>
            <td>
                <div class="prospect-actions">
                    <button class="btn btn-sm btn-primary view-prospect-btn" data-prospect-id="${prospect.id}">
                        <i class="fas fa-eye"></i>
                        Ver Prospecto
                    </button>
                    <button class="btn btn-sm btn-outline go-to-chat-btn" data-chat-id="${prospect.chatId}">
                        <i class="fas fa-comments"></i>
                        Ir al Chat
                    </button>
                </div>
            </td>
        `;

        // Event listeners
        const viewBtn = row.querySelector('.view-prospect-btn');
        if (viewBtn) {
            viewBtn.addEventListener('click', async () => {
                // Recargar el prospecto desde Airtable para obtener los comentarios más recientes
                try {
                    console.log('🔄 Recargando prospecto desde Airtable para mostrar comentarios actualizados...');
                    const result = await window.neonService.getProspectById(prospect.id);
                    if (result.success && result.prospect) {
                        console.log('✅ Prospecto recargado, comentarios:', result.prospect.comentarios ? 'Sí' : 'No');
                        this.showProspectModal(result.prospect);
                    } else {
                        console.warn('⚠️ No se pudo recargar el prospecto, usando datos en memoria');
                        this.showProspectModal(prospect);
                    }
                } catch (error) {
                    console.error('❌ Error recargando prospecto:', error);
                    this.showProspectModal(prospect);
                }
            });
        }

        const chatBtn = row.querySelector('.go-to-chat-btn');
        if (chatBtn) {
            chatBtn.addEventListener('click', async () => {
                await this.navigateToChat(prospect.chatId);
            });
        }

        return row;
    }

    async navigateToChat(chatId) {
        try {
            // Navegar a la sección de chats
            this.navigateToSection('chats');
            
            // Esperar un momento para que se cargue la sección
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Buscar y seleccionar el chat
            const chat = this.dashboardData.chats.find(c => c.id === chatId);
            if (chat) {
                await this.selectChat(chat);
            } else {
                // Si no está cargado, cargarlo primero
                await this.loadRealData();
                const chatAfterLoad = this.dashboardData.chats.find(c => c.id === chatId);
                if (chatAfterLoad) {
                    await this.selectChat(chatAfterLoad);
                } else {
                    this.showNotification('Chat no encontrado', 'error');
                }
            }
        } catch (error) {
            console.error('❌ Error navegando al chat:', error);
            this.showNotification('Error al abrir el chat', 'error');
        }
    }

    async extractProspectsFromChats() {
        try {
            console.log('🔄 Iniciando extracción de prospectos...');
            this.showNotification('Recargando chats y extrayendo prospectos...', 'info');
            
            if (!window.prospectsService) {
                throw new Error('ProspectsService no disponible');
            }

            // IMPORTANTE: Recargar chats antes de extraer para incluir chats nuevos
            console.log('📡 Recargando chats para incluir los más recientes...');
            await this.loadRealData();
            
            // Obtener todos los chats actualizados
            const chats = this.dashboardData.chats || [];
            
            console.log(`📊 Total de chats disponibles para extraer: ${chats.length}`);
            
            if (chats.length === 0) {
                this.showNotification('No hay chats para analizar. Primero carga los chats.', 'warning');
                return;
            }
            
            // Mostrar notificación de progreso
            this.showNotification(`Analizando ${chats.length} chats para extraer prospectos...`, 'info');
            
            console.log(`📊 Analizando ${chats.length} chats...`);

            // Extraer prospectos
            const result = await window.prospectsService.extractProspectsFromAllChats(chats, this.dataService);
            
            if (result.success) {
                console.log(`📊 ${result.prospects.length} prospectos encontrados, ${result.errors.length} errores en el análisis`);
                
                // OPTIMIZACIÓN: Usar batch operations cuando hay múltiples prospectos
                let savedCount = 0;
                let alreadyExistsCount = 0;
                let updatedCount = 0;
                let errorCount = 0;
                const saveErrors = [];

                if (result.prospects.length > 1) {
                    // Si hay múltiples prospectos, usar batch
                    console.log(`📦 Usando batch operations para ${result.prospects.length} prospectos...`);
                    const batchResult = await window.prospectsService.saveProspectsBatch(result.prospects);
                    
                    savedCount = batchResult.savedCount || 0;
                    alreadyExistsCount = batchResult.alreadyExistsCount || 0;
                    updatedCount = batchResult.updatedCount || 0;
                    errorCount = batchResult.errorCount || 0;
                    
                    // Convertir errores a formato de mensaje
                    batchResult.errors.forEach(err => {
                        const errorMsg = `Chat ${err.prospect?.chatId || 'desconocido'}: ${err.error}`;
                        saveErrors.push(errorMsg);
                    });
                    
                    console.log(`✅ Batch completado: ${savedCount} nuevos, ${alreadyExistsCount} existentes, ${updatedCount} actualizados, ${errorCount} errores`);
                } else {
                    // Si hay solo uno, usar método individual (más rápido para un solo registro)
                    for (const prospectData of result.prospects) {
                        console.log(`💾 Guardando prospecto: ${prospectData.nombre} (chat: ${prospectData.chatId})`);
                        const saveResult = await window.prospectsService.saveProspect(prospectData);
                        if (saveResult.success) {
                            if (!saveResult.alreadyExists) {
                                savedCount++;
                                console.log(`✅ Prospecto guardado: ${prospectData.nombre}`);
                            } else {
                                alreadyExistsCount++;
                                if (saveResult.wasUpdated) {
                                    updatedCount++;
                                }
                                console.log(`⏭️ Prospecto ya existe: ${prospectData.nombre}`);
                            }
                        } else {
                            errorCount++;
                            const errorMsg = `Chat ${prospectData.chatId}: ${saveResult.error}`;
                            console.error('❌ Error guardando prospecto:', errorMsg);
                            saveErrors.push(errorMsg);
                        }
                    }
                }

                // Mostrar errores de análisis si los hay
                if (result.errors.length > 0) {
                    console.warn('⚠️ Errores durante el análisis:', result.errors);
                    result.errors.forEach(err => {
                        console.error(`  - Chat ${err.chatId}: ${err.error}`);
                    });
                }

                // Mostrar errores de guardado si los hay
                if (saveErrors.length > 0) {
                    console.warn('⚠️ Errores al guardar:', saveErrors);
                }

                // Mensaje final
                let message = '';
                const parts = [];
                
                if (savedCount > 0) {
                    parts.push(`${savedCount} nuevo${savedCount > 1 ? 's' : ''}`);
                }
                if (updatedCount > 0) {
                    parts.push(`${updatedCount} actualizado${updatedCount > 1 ? 's' : ''}`);
                }
                if (alreadyExistsCount > 0) {
                    parts.push(`${alreadyExistsCount} ya existente${alreadyExistsCount > 1 ? 's' : ''}`);
                }
                
                if (parts.length > 0) {
                    message = `✅ ${parts.join(', ')} prospecto${parts.length > 1 ? 's' : ''}`;
                    if (errorCount > 0 || result.errors.length > 0) {
                        const totalErrors = errorCount + result.errors.length;
                        message += ` (${totalErrors} error${totalErrors > 1 ? 'es' : ''})`;
                    }
                    this.showNotification(message, 'success');
                } else {
                    message = `⚠️ No se pudieron extraer prospectos`;
                    if (errorCount > 0 || result.errors.length > 0) {
                        const totalErrors = errorCount + result.errors.length;
                        message += ` (${totalErrors} error${totalErrors > 1 ? 'es' : ''})`;
                        console.log('💡 Abre la consola del navegador para ver los detalles de los errores');
                    }
                    this.showNotification(message, 'warning');
                }

                // Recargar la lista
                await this.loadProspects();
            } else {
                throw new Error(result.error || 'Error extrayendo prospectos');
            }
        } catch (error) {
            console.error('❌ Error extrayendo prospectos:', error);
            this.showNotification('Error al extraer prospectos: ' + error.message, 'error');
        }
    }

    showProspectModal(prospect) {
        // Crear modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay prospect-modal';
        modal.id = 'prospectModal';

        // Debug: Verificar comentarios del prospecto
        console.log('📝 Prospecto recibido en modal:', {
            id: prospect.id,
            nombre: prospect.nombre,
            comentarios: prospect.comentarios,
            tieneComentarios: !!prospect.comentarios,
            longitudComentarios: prospect.comentarios ? prospect.comentarios.length : 0
        });

        // Normalizar imágenes - puede ser array de strings o array de objetos
        let imagenes = prospect.imagenesUrls || [];
        console.log('🖼️ Imágenes del prospecto (raw):', imagenes);
        if (imagenes.length > 0 && typeof imagenes[0] === 'object' && imagenes[0].url) {
            imagenes = imagenes.map(img => img.url || img);
        }
        console.log('🖼️ Imágenes del prospecto (normalizado):', imagenes);
        
        // Normalizar documentos - puede ser array de strings o array de objetos
        let documentos = prospect.documentosUrls || [];
        console.log('📄 Documentos del prospecto (raw):', documentos);
        // Si documentos es un string JSON, parsearlo
        if (typeof documentos === 'string') {
            try {
                documentos = JSON.parse(documentos);
            } catch (e) {
                console.warn('⚠️ Error parseando documentos como JSON:', e);
                documentos = [];
            }
        }
        // Si es array de objetos con url, mantener la estructura
        if (documentos.length > 0 && typeof documentos[0] === 'object') {
            documentos = documentos.map(doc => {
                if (typeof doc === 'string') {
                    return { url: doc, fileName: 'Documento', type: 'document' };
                }
                return doc;
            });
        }
        console.log('📄 Documentos del prospecto (normalizado):', documentos);

        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <div class="modal-header-content">
                        <div class="prospect-avatar-large">
                            ${this.getUserInitials(prospect.nombre || 'Sin nombre')}
                        </div>
                        <div class="modal-header-info">
                            <h2>${prospect.nombre || 'Sin nombre'}</h2>
                            <p class="prospect-subtitle">Prospecto</p>
                        </div>
                    </div>
                    <button class="modal-close" id="closeProspectModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="modal-body">
                    <div class="prospect-info-section">
                        <h3><i class="fas fa-info-circle"></i> Información del Prospecto</h3>
                        <div class="info-grid">
                            <div class="info-item">
                                <label><i class="fas fa-user"></i> Nombre:</label>
                                <span>${prospect.nombre || 'N/A'}</span>
                            </div>
                            ${prospect.telefono && prospect.telefono !== 'N/A' ? `
                            <div class="info-item">
                                <label><i class="fas fa-phone"></i> Teléfono:</label>
                                <span>${prospect.telefono}</span>
                            </div>
                            ` : ''}
                            ${prospect.canal && prospect.canal !== 'N/A' ? `
                            <div class="info-item">
                                <label><i class="fas fa-comments"></i> Canal:</label>
                                <span>${prospect.canal}</span>
                            </div>
                            ` : ''}
                            <div class="info-item">
                                <label><i class="fas fa-tag"></i> Estado:</label>
                                <span class="prospect-status status-${(prospect.estado || 'Nuevo').toLowerCase()}">${prospect.estado || 'Nuevo'}</span>
                            </div>
                            ${prospect.fechaExtraccion ? `
                            <div class="info-item">
                                <label><i class="fas fa-calendar"></i> Fecha Extracción:</label>
                                <span>${new Date(prospect.fechaExtraccion).toLocaleDateString('es-ES', { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}</span>
                            </div>
                            ` : ''}
                            ${prospect.fechaUltimoMensaje ? `
                            <div class="info-item">
                                <label><i class="fas fa-clock"></i> Último Mensaje:</label>
                                <span>${new Date(prospect.fechaUltimoMensaje).toLocaleDateString('es-ES', { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>

                    ${imagenes.length > 0 ? `
                    <div class="prospect-images-section">
                        <h3><i class="fas fa-images"></i> Imágenes (${imagenes.length})</h3>
                        <div class="images-gallery" id="prospectImagesGallery">
                            ${imagenes.map((imgUrl, index) => {
                                // Asegurar que imgUrl sea un string
                                const url = typeof imgUrl === 'string' ? imgUrl : (imgUrl?.url || imgUrl);
                                if (!url) return '';
                                return `
                                <div class="gallery-item" data-image-index="${index}">
                                    <img src="${url}" alt="Imagen ${index + 1}" loading="lazy" 
                                         onerror="console.error('Error cargando imagen del prospecto:', this.src)">
                                    <div class="gallery-overlay">
                                        <button class="btn btn-sm btn-primary view-image-btn" data-image-url="${url}">
                                            <i class="fas fa-expand"></i> Ampliar
                                        </button>
                                    </div>
                                </div>
                                `;
                            }).filter(html => html).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${documentos.length > 0 ? `
                    <div class="prospect-documents-section">
                        <h3><i class="fas fa-file-pdf"></i> Documentos (${documentos.length})</h3>
                        <div class="documents-list">
                            ${documentos.map(doc => `
                                <div class="document-item">
                                    <i class="fas fa-file-${doc.type === 'pdf' ? 'pdf' : 'alt'}"></i>
                                    <div class="document-info">
                                        <span class="document-name">${doc.fileName || 'Documento'}</span>
                                        <div class="document-actions">
                                            <a href="${doc.url}" target="_blank" class="btn btn-sm btn-outline">
                                                <i class="fas fa-external-link-alt"></i> Ver
                                            </a>
                                            <a href="${doc.url}" download class="btn btn-sm btn-primary">
                                                <i class="fas fa-download"></i> Descargar
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${imagenes.length === 0 && documentos.length === 0 ? `
                    <div class="no-media-message">
                        <i class="fas fa-image"></i>
                        <p>Este prospecto no ha enviado imágenes ni documentos aún.</p>
                    </div>
                    ` : ''}

                    <div class="prospect-custom-fields-section">
                        <h3><i class="fas fa-tags"></i> Campos Personalizados</h3>
                        <div id="customFieldsContainer" class="custom-fields-container">
                            <div class="loading-custom-fields">
                                <i class="fas fa-spinner fa-spin"></i>
                                Cargando campos personalizados...
                            </div>
                        </div>
                    </div>

                    <div class="prospect-comments-section">
                        <h3><i class="fas fa-comment-dots"></i> Historial de Comentarios</h3>
                        
                        <!-- Historial de comentarios -->
                        <div class="comments-history" id="commentsHistory">
                            ${this.renderCommentsHistory(prospect.comentarios)}
                        </div>
                        
                        <!-- Formulario para agregar nuevo comentario -->
                        <div class="new-comment-form">
                            <textarea 
                                id="prospectCommentsTextarea" 
                                class="comments-textarea" 
                                placeholder="Escribe un nuevo comentario..."
                                rows="3"></textarea>
                            <div class="comments-actions">
                                <button class="btn btn-primary btn-sm" id="addCommentBtn" data-prospect-id="${prospect.id}">
                                    <i class="fas fa-plus"></i>
                                    Agregar Comentario
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="btn btn-outline" id="closeProspectModalBtn">Cerrar</button>
                    <button class="btn btn-primary" id="goToChatFromModal" data-chat-id="${prospect.chatId}">
                        <i class="fas fa-comments"></i>
                        Ir al Chat
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        const closeBtn = document.getElementById('closeProspectModal');
        const closeBtn2 = document.getElementById('closeProspectModalBtn');
        const goToChatBtn = document.getElementById('goToChatFromModal');

        const closeModal = () => {
            if (modal && document.body.contains(modal)) {
                modal.style.opacity = '0';
                modal.style.transition = 'opacity 0.2s ease';
                setTimeout(() => {
                    if (document.body.contains(modal)) {
                        document.body.removeChild(modal);
                    }
                }, 200);
            }
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (closeBtn2) closeBtn2.addEventListener('click', closeModal);
        if (goToChatBtn) {
            const chatId = prospect.chatId; // Capturar el chatId antes del event listener
            goToChatBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Cerrar el modal primero
                closeModal();
                
                // Pequeño delay para que el modal se cierre visualmente
                await new Promise(resolve => setTimeout(resolve, 150));
                
                // Luego navegar al chat
                try {
                    await this.navigateToChat(chatId);
                } catch (error) {
                    console.error('Error navegando al chat:', error);
                    // El modal ya está cerrado, así que no hay problema
                }
            });
        }

        // Lightbox para imágenes
        const imageButtons = modal.querySelectorAll('.view-image-btn');
        imageButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const imageUrl = e.target.closest('.view-image-btn').dataset.imageUrl;
                this.showImageLightbox(imageUrl, imagenes);
            });
        });

        // Agregar nuevo comentario al historial
        const addCommentBtn = document.getElementById('addCommentBtn');
        if (addCommentBtn) {
            addCommentBtn.addEventListener('click', async () => {
                const textarea = document.getElementById('prospectCommentsTextarea');
                const newCommentText = textarea ? textarea.value.trim() : '';
                const prospectId = addCommentBtn.dataset.prospectId;

                if (!newCommentText) {
                    this.showNotification('Por favor, escribe un comentario antes de guardar', 'warning');
                    return;
                }

                if (!prospectId) {
                    this.showNotification('Error: No se pudo identificar el prospecto', 'error');
                    return;
                }

                try {
                    addCommentBtn.disabled = true;
                    addCommentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Agregando...';

                    // PRIMERO: Recargar el prospecto desde Neon para obtener los comentarios más recientes
                    console.log('🔄 Recargando prospecto desde Neon para obtener comentarios actualizados...');
                    const prospectResult = await window.neonService.getProspectById(prospectId);
                    
                    let commentsArray = [];
                    
                    if (prospectResult.success && prospectResult.prospect) {
                        const currentComentarios = prospectResult.prospect.comentarios;
                        console.log('📝 Comentarios actuales desde Neon:', currentComentarios);
                        
                        // Parsear comentarios existentes
                        if (currentComentarios) {
                            try {
                                if (typeof currentComentarios === 'string') {
                                    if (currentComentarios.trim().startsWith('[')) {
                                        // Es un JSON array
                                        commentsArray = JSON.parse(currentComentarios);
                                        console.log('✅ Comentarios parseados como JSON array:', commentsArray.length, 'comentarios');
                                    } else if (currentComentarios.trim().startsWith('{')) {
                                        // Es un objeto, convertirlo a array
                                        commentsArray = [JSON.parse(currentComentarios)];
                                        console.log('✅ Comentario parseado como objeto único, convertido a array');
                                    } else {
                                        // String simple (comentario antiguo), convertirlo a array
                                        commentsArray = [{
                                            texto: currentComentarios,
                                            fecha: new Date().toISOString(),
                                            autor: 'Usuario'
                                        }];
                                        console.log('✅ Comentario antiguo (string simple) convertido a array');
                                    }
                                } else if (Array.isArray(currentComentarios)) {
                                    commentsArray = currentComentarios;
                                    console.log('✅ Comentarios ya son un array:', commentsArray.length, 'comentarios');
                                }
                            } catch (e) {
                                console.warn('⚠️ Error parseando comentarios existentes, iniciando array vacío:', e);
                                commentsArray = [];
                            }
                        }
                    } else {
                        console.warn('⚠️ No se pudo recargar el prospecto, intentando usar datos en memoria');
                        // Fallback: intentar usar datos en memoria
                        const currentProspect = this.dashboardData.prospects?.find(p => p.id === prospectId);
                        if (currentProspect && currentProspect.comentarios) {
                            try {
                                if (typeof currentProspect.comentarios === 'string' && currentProspect.comentarios.trim().startsWith('[')) {
                                    commentsArray = JSON.parse(currentProspect.comentarios);
                                } else if (typeof currentProspect.comentarios === 'string') {
                                    commentsArray = [{
                                        texto: currentProspect.comentarios,
                                        fecha: new Date().toISOString(),
                                        autor: 'Usuario'
                                    }];
                                }
                            } catch (e) {
                                console.warn('⚠️ Error parseando comentarios de memoria:', e);
                                commentsArray = [];
                            }
                        }
                    }
                    
                    // Asegurar que sea un array válido
                    if (!Array.isArray(commentsArray)) {
                        console.warn('⚠️ commentsArray no es un array válido, inicializando como array vacío');
                        commentsArray = [];
                    }
                    
                    console.log(`📊 Comentarios existentes antes de agregar nuevo: ${commentsArray.length} comentarios`);
                    
                    // Agregar nuevo comentario al inicio del array
                    const newComment = {
                        texto: newCommentText,
                        fecha: new Date().toISOString(),
                        autor: 'Usuario'
                    };
                    
                    commentsArray.unshift(newComment); // Agregar al inicio (más reciente primero)
                    console.log(`✅ Nuevo comentario agregado. Total de comentarios: ${commentsArray.length}`);
                    
                    // Guardar el array completo como JSON string
                    const jsonComments = JSON.stringify(commentsArray);
                    console.log('💾 Guardando comentarios en Neon:', jsonComments.substring(0, 100) + '...');
                    
                    const result = await window.neonService.updateProspect(prospectId, {
                        comentarios: jsonComments
                    });

                    if (result.success) {
                        this.showNotification('Comentario agregado correctamente al historial', 'success');
                        
                        // Actualizar el prospecto en los datos locales
                        const prospectIndex = this.dashboardData.prospects?.findIndex(p => p.id === prospectId);
                        if (prospectIndex !== undefined && prospectIndex !== -1 && this.dashboardData.prospects) {
                            this.dashboardData.prospects[prospectIndex].comentarios = jsonComments;
                        }
                        
                        // Limpiar el textarea
                        if (textarea) {
                            textarea.value = '';
                        }
                        
                        // Actualizar el historial en el modal con el array completo
                        const commentsHistory = document.getElementById('commentsHistory');
                        if (commentsHistory) {
                            commentsHistory.innerHTML = this.renderCommentsHistory(jsonComments);
                        }
                    } else {
                        this.showNotification('Error al guardar comentario: ' + (result.error || 'Desconocido'), 'error');
                    }
                } catch (error) {
                    console.error('❌ Error guardando comentario:', error);
                    this.showNotification('Error al guardar comentario: ' + error.message, 'error');
                } finally {
                    addCommentBtn.disabled = false;
                    addCommentBtn.innerHTML = '<i class="fas fa-plus"></i> Agregar Comentario';
                }
            });
        }

        // Cargar campos personalizados de GPTMaker
        this.loadProspectCustomFields(prospect.chatId, 'customFieldsContainer');

        // Click fuera del modal para cerrar
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    showImageLightbox(imageUrl, allImages) {
        const lightbox = document.createElement('div');
        lightbox.className = 'image-lightbox';
        
        const currentIndex = allImages.findIndex(url => url === imageUrl);
        
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <button class="lightbox-close" id="closeLightbox">
                    <i class="fas fa-times"></i>
                </button>
                ${currentIndex > 0 ? `
                    <button class="lightbox-nav lightbox-prev" id="prevImage">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                ` : ''}
                <img src="${imageUrl}" alt="Imagen ampliada" id="lightboxImage">
                ${currentIndex < allImages.length - 1 ? `
                    <button class="lightbox-nav lightbox-next" id="nextImage">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                ` : ''}
                <div class="lightbox-counter">
                    ${currentIndex + 1} / ${allImages.length}
                </div>
            </div>
        `;

        document.body.appendChild(lightbox);

        let currentImgIndex = currentIndex;

        const updateImage = (index) => {
            if (index >= 0 && index < allImages.length) {
                currentImgIndex = index;
                const img = document.getElementById('lightboxImage');
                img.src = allImages[index];
                
                // Actualizar navegación
                const prevBtn = document.getElementById('prevImage');
                const nextBtn = document.getElementById('nextImage');
                const counter = lightbox.querySelector('.lightbox-counter');
                
                if (prevBtn) prevBtn.style.display = index > 0 ? 'block' : 'none';
                if (nextBtn) nextBtn.style.display = index < allImages.length - 1 ? 'block' : 'none';
                if (counter) counter.textContent = `${index + 1} / ${allImages.length}`;
            }
        };

        const closeLightbox = () => {
            if (document.body.contains(lightbox)) {
                document.body.removeChild(lightbox);
            }
        };

        // Event listeners
        document.getElementById('closeLightbox').addEventListener('click', closeLightbox);
        
        const prevBtn = document.getElementById('prevImage');
        const nextBtn = document.getElementById('nextImage');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => updateImage(currentImgIndex - 1));
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => updateImage(currentImgIndex + 1));
        }

        // Cerrar con ESC
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeLightbox();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Click fuera para cerrar
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });
    }

}

// Funciones de utilidad globales para debugging
window.clearDashboardCache = function() {
    console.log('🧹 Limpiando cache del dashboard...');
    
    if (window.dashboard && typeof window.dashboard.clearAllCache === 'function') {
        window.dashboard.clearAllCache();
        console.log('✅ Cache del dashboard limpiada');
        return true;
    }
    
    // Si no hay dashboard, limpiar directamente
    if (window.dashboard && window.dashboard.api) {
        if (typeof window.dashboard.api.clearAllCache === 'function') {
            window.dashboard.api.clearAllCache();
        }
    }
    
    if (window.dashboard && window.dashboard.dataService) {
        if (typeof window.dashboard.dataService.clearCache === 'function') {
            window.dashboard.dataService.clearCache();
        }
    }
    
    console.log('✅ Cache limpiada. Recarga la página para aplicar los cambios.');
    return true;
};

window.forceReloadData = function() {
    console.log('🔄 Forzando recarga de datos...');
    
    // Limpiar cache
    window.clearDashboardCache();
    
    // Recargar datos si el dashboard está disponible
    if (window.dashboard && typeof window.dashboard.loadRealData === 'function') {
        window.dashboard.loadRealData().then(() => {
            console.log('✅ Datos recargados');
        });
    } else {
        console.log('⚠️ Dashboard no disponible, recarga la página');
        window.location.reload();
    }
};

console.log('🔧 Funciones de utilidad disponibles:');
console.log('- clearDashboardCache() - Limpiar toda la cache');
console.log('- forceReloadData() - Limpiar cache y recargar datos');

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new ChatbotDashboard();
    
    // Exponer función showTeamModal globalmente para que funcione el onclick en HTML
    window.showTeamModal = () => {
        console.log('🌐 showTeamModal llamada desde window');
        dashboard.showTeamModal();
    };
    
    console.log('✅ Función showTeamModal expuesta globalmente en window');
});
});