
// Función global simple para mostrar el modal
window.showTeamModal = function() {
    if (window.teamManager) {
        window.teamManager.showInviteModal();
    } else {
        console.error('TeamManager no está disponible');
        alert('Error: TeamManager no está disponible');
    }
};

// Gestión de Equipo de Ventas
class TeamManager {
    constructor() {
        this.maxMembers = 3;
        this.teamMembers = [];
        this.usingNeon = false;
        this.ownerEmailCache = '';
        this.ownerRecordIdCache = '';
        this.init();
    }

    async init() {
        // Usar Neon siempre que esté disponible
        this.usingNeon = !!(window.neonService && window.authService && window.authService.useNeon);
        await this.loadTeamMembers();
        this.setupEventListeners();
        this.updateTeamUI();
    }

    setupEventListeners() {
        const inviteBtn = document.getElementById('inviteMemberBtn');
        if (inviteBtn) {
            inviteBtn.addEventListener('click', () => {
                this.showInviteModal();
            });
        }
    }

    async loadTeamMembers() {
        if (this.usingNeon) {
            try {
                const ownerEmail = await this.resolveOwnerEmail();
                if (!ownerEmail) {
                    console.warn('⚠️ No hay email del propietario para cargar equipo');
                    this.teamMembers = [];
                    return;
                }
                // Obtener miembros del equipo desde Neon usando el email del owner
                // Los miembros del equipo son usuarios con team_owner_email = ownerEmail
                const result = await window.neonService.getAllUsers({ 
                    teamOwnerEmail: ownerEmail 
                });
                this.teamMembers = (result.success && Array.isArray(result.users)) ? result.users : [];
                console.log('✅ Miembros del equipo (Neon):', this.teamMembers);
            } catch (error) {
                console.error('❌ Error cargando equipo desde Neon:', error);
                // En modo Neon, si hay error, mostrar vacío (no datos locales)
                this.teamMembers = [];
            }
        } else {
            // Cargar miembros del equipo desde localStorage
            const savedTeam = localStorage.getItem('teamMembers');
            if (savedTeam) {
                try {
                    this.teamMembers = JSON.parse(savedTeam);
                    console.log('✅ Miembros del equipo cargados desde localStorage:', this.teamMembers);
                } catch (error) {
                    console.error('❌ Error cargando miembros del equipo:', error);
                    this.teamMembers = [];
                }
            }
        }
    }

    saveTeamMembers() {
        if (this.usingNeon) return; // En Neon no guardamos en localStorage
        localStorage.setItem('teamMembers', JSON.stringify(this.teamMembers));
        console.log('💾 Miembros del equipo guardados en localStorage');
    }

    updateTeamUI() {
        // Actualizar contador
        const currentCount = document.getElementById('currentMembersCount');
        if (currentCount) {
            currentCount.textContent = this.teamMembers.length;
        }

        // Actualizar barra de progreso
        const progressFill = document.getElementById('teamProgressFill');
        if (progressFill) {
            const percentage = (this.teamMembers.length / this.maxMembers) * 100;
            progressFill.style.width = `${percentage}%`;
        }

        // Notificar al dashboard para actualizar el contador de miembros del equipo
        if (window.dashboard && typeof window.dashboard.updateOverviewStats === 'function') {
            window.dashboard.updateOverviewStats();
        }

        // Actualizar lista de miembros
        this.renderTeamMembers();

        // Deshabilitar botón si llegó al límite
        const inviteBtn = document.getElementById('inviteMemberBtn');
        if (inviteBtn) {
            if (this.teamMembers.length >= this.maxMembers) {
                inviteBtn.disabled = true;
                inviteBtn.innerHTML = '<i class="fas fa-lock"></i> Límite alcanzado';
            } else {
                inviteBtn.disabled = false;
                inviteBtn.innerHTML = '<i class="fas fa-user-plus"></i> Invitar Miembro';
            }
        }
    }

    renderTeamMembers() {
        const membersList = document.getElementById('teamMembersList');
        if (!membersList) return;

        if (this.teamMembers.length === 0) {
            membersList.innerHTML = `
                <div class="empty-team-state">
                    <i class="fas fa-user-slash"></i>
                    <p>Aún no has invitado a ningún miembro</p>
                    <button class="btn btn-outline" onclick="window.showTeamModal()">
                        <i class="fas fa-user-plus"></i>
                        Invitar Primer Miembro
                    </button>
                </div>
            `;
            return;
        }

        membersList.innerHTML = this.teamMembers.map((member, index) => `
            <div class="team-member-card" data-member-id="${member.id}">
                <div class="member-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="member-info">
                    <h4>${member.name}</h4>
                    <p>${member.email}</p>
                    <span class="member-role">
                        <i class="fas fa-briefcase"></i>
                        ${member.role}
                    </span>
                </div>
                <div class="member-actions">
                    <button class="btn-icon" onclick="window.teamManager.removeMember('${member.id}')" title="Eliminar miembro">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    showInviteModal() {
        if (this.teamMembers.length >= this.maxMembers) {
            this.showNotification('Ya has alcanzado el límite de 3 miembros', 'warning');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay team-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-user-plus"></i>
                        Invitar Miembro al Equipo
                    </h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; color: #475569; font-size: 0.9rem;">
                            <i class="fas fa-info-circle" style="color: #3b82f6;"></i>
                            <span>Los miembros recibirán notificaciones cuando un cliente sea calificado por el chatbot.</span>
                        </div>
                    </div>
                    <form id="inviteMemberForm">
                        <div class="form-group">
                            <label for="memberEmail">Correo Electrónico</label>
                            <input 
                                type="email" 
                                id="memberEmail" 
                                class="form-input" 
                                placeholder="juan.perez@empresa.com"
                                required
                            >
                        </div>
                        <div class="form-group">
                            <label for="memberRole">Rol en el Equipo</label>
                            <select id="memberRole" class="form-input" required>
                                <option value="">Selecciona un rol...</option>
                                <option value="user">User</option>
                                <option value="agent">Agent</option>
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-paper-plane"></i>
                                Enviar Invitación
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Setup form handler
        const form = modal.querySelector('#inviteMemberForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleInvite(form, modal);
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    extractOwnerEmail(user) {
        if (!user || typeof user !== 'object') return '';
        const possibleFields = [
            user.email,
            user.teamOwnerEmail,
            user.team_owner_email,
            user.team_ownerEmail,
            user.ownerEmail,
            user.owner_email
        ];
        const found = possibleFields.find(value => typeof value === 'string' && value.trim() !== '');
        return found ? found.trim() : '';
    }

    async resolveOwnerEmail() {
        if (this.ownerEmailCache) {
            return this.ownerEmailCache;
        }

        const trySetCache = (email) => {
            if (email) {
                this.ownerEmailCache = email;
                return true;
            }
            return false;
        };

        const authService = window.authService;
        if (authService) {
            const currentUser = authService.getCurrentUser?.();
            const fromAuth = this.extractOwnerEmail(currentUser);
            if (trySetCache(fromAuth)) {
                if (currentUser?.id) {
                    this.ownerRecordIdCache = currentUser.id;
                }
                return this.ownerEmailCache;
            }

            // Intentar recargar datos desde storage
            authService.loadAuthData?.();
            const reloadedUser = authService.getCurrentUser?.();
            const reloaded = this.extractOwnerEmail(reloadedUser);
            if (trySetCache(reloaded)) {
                if (reloadedUser?.id) {
                    this.ownerRecordIdCache = reloadedUser.id;
                }
                return this.ownerEmailCache;
            }
        }

        // Intentar obtener desde storage manualmente
        const storedAuth = localStorage.getItem('authData') || sessionStorage.getItem('authData');
        if (storedAuth) {
            try {
                const parsed = JSON.parse(storedAuth);
                const storedUser = parsed?.user;
                const fromStorage = this.extractOwnerEmail(storedUser);
                if (trySetCache(fromStorage)) {
                    if (storedUser?.id) {
                        this.ownerRecordIdCache = storedUser.id;
                    }
                    return this.ownerEmailCache;
                }
            } catch (error) {
                console.warn('⚠️ No se pudo leer authData del storage:', error);
            }
        }

        // Último recurso: pedir a Neon el registro del usuario actual
        if (authService && window.neonService) {
            try {
                const currentUser = authService.getCurrentUser?.();
                if (currentUser?.email) {
                    const freshUser = await window.neonService.getUserByEmail(currentUser.email);
                    if (freshUser?.success && freshUser.user) {
                        const email = this.extractOwnerEmail(freshUser.user);
                        if (trySetCache(email)) {
                            if (freshUser.user.id) {
                                this.ownerRecordIdCache = freshUser.user.id;
                            }
                            // Actualizar authService con los nuevos datos
                            authService.currentUser = {
                                ...authService.currentUser,
                                ...freshUser.user
                            };
                            authService.saveAuthData?.(true);
                            return this.ownerEmailCache;
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ No se pudo obtener ownerEmail desde Neon:', error);
            }
        }

        console.warn('⚠️ No se encontró ownerEmail después de todos los intentos');
        const currentUser = window.authService?.getCurrentUser();
        if (currentUser) {
            console.warn('ℹ️ Usuario actual sin ownerEmail:', currentUser);
        }
        return '';
    }

    async resolveOwnerRecordId(ownerEmail) {
        if (this.ownerRecordIdCache) {
            return this.ownerRecordIdCache;
        }

        const authService = window.authService;
        if (authService) {
            const current = authService.getCurrentUser?.();
            if (current?.id) {
                this.ownerRecordIdCache = current.id;
                return this.ownerRecordIdCache;
            }
        }

        if (window.neonService && ownerEmail) {
            try {
                const ownerResult = await window.neonService.getUserByEmail(ownerEmail);
                if (ownerResult?.success && ownerResult.user?.id) {
                    this.ownerRecordIdCache = ownerResult.user.id;
                    return this.ownerRecordIdCache;
                }
            } catch (error) {
                console.warn('⚠️ No se pudo obtener ownerRecordId desde Neon:', error);
            }
        }

        return '';
    }

    async handleInvite(form, modal) {
        const formData = new FormData(form);
        const memberData = {
            id: Date.now().toString(),
            email: formData.get('memberEmail'),
            // Derivar nombre a partir del email (antes de @) si no existe
            name: (formData.get('memberEmail') || '').split('@')[0],
            role: formData.get('memberRole'),
            invitedAt: new Date().toISOString(),
            status: 'active'
        };

        try {
            if (this.usingNeon) {
                const ownerEmail = await this.resolveOwnerEmail();
                if (!ownerEmail) {
                    throw new Error('No se encontró el email del propietario. Vuelve a iniciar sesión e inténtalo de nuevo.');
                }
                this.ownerEmailCache = ownerEmail;
                
                // Crear usuario como miembro del equipo en Neon
                const result = await window.neonService.createUser({
                    email: memberData.email,
                    firstName: memberData.name.split(' ')[0] || memberData.name,
                    lastName: memberData.name.split(' ').slice(1).join(' ') || '',
                    password: '', // Se generará o se pedirá después
                    role: 'member',
                    isTeamMember: true,
                    teamOwnerEmail: ownerEmail,
                    memberRole: memberData.role
                });
                
                if (!result.success) throw new Error(result.error || 'No se pudo agregar miembro');
                // Recargar desde Neon para asegurar datos reales
                await this.loadTeamMembers();
            } else {
                // Agregar miembro al equipo localmente
                this.teamMembers.push(memberData);
                this.saveTeamMembers();
            }
            this.updateTeamUI();

            // Cerrar modal
            modal.remove();

            // Mostrar notificación de éxito
            this.showNotification(`${memberData.name} ha sido agregado al equipo`, 'success');
            console.log('✅ Miembro agregado');
        } catch (error) {
            console.error('❌ Error agregando miembro:', error);
            // Fallback: guardar localmente para no bloquear el flujo
            if (!this.usingNeon) {
                this.teamMembers.push(memberData);
                this.saveTeamMembers();
                this.updateTeamUI();
                this.showNotification('Miembro guardado localmente', 'warning');
            } else {
                this.showNotification(error.message || 'Error agregando miembro', 'error');
            }
        }
    }

    async removeMember(memberId) {
        const member = this.teamMembers.find(m => m.id === memberId);
        if (!member) return;

        if (!confirm(`¿Estás seguro de eliminar a ${member.name} del equipo?`)) return;

        try {
            if (this.usingNeon && memberId) {
                // Eliminar miembro del equipo en Neon (actualizar is_team_member a false o eliminar)
                const result = await window.neonService.updateUser(memberId, {
                    isTeamMember: false,
                    teamOwnerEmail: null,
                    memberRole: null
                });
                if (!result.success) throw new Error(result.error || 'No se pudo eliminar en Neon');
                // Recargar desde Neon
                await this.loadTeamMembers();
            } else {
                this.teamMembers = this.teamMembers.filter(m => m.id !== memberId);
                this.saveTeamMembers();
            }
            this.updateTeamUI();
            this.showNotification(`${member.name} ha sido eliminado del equipo`, 'info');
            console.log('🗑️ Miembro eliminado:', member);
        } catch (error) {
            console.error('❌ Error eliminando miembro:', error);
            this.showNotification(error.message || 'Error eliminando miembro', 'error');
        }
    }

    // Asignación simple: envía email al miembro asignado
    assignToMember(memberEmail, assignment) {
        const member = this.teamMembers.find(m => m.email === memberEmail);
        if (!member) {
            this.showNotification('Miembro no encontrado', 'error');
            return;
        }

        const subject = encodeURIComponent(assignment?.subject || `Nueva asignación`);
        const owner = window.authService?.getCurrentUser();
        const ownerName = owner?.name || owner?.email || 'Administrador';
        const body = encodeURIComponent(
            `${assignment?.message || 'Tienes una nueva asignación.'}\n\n` +
            (assignment?.details ? `${assignment.details}\n\n` : '') +
            `Asignado por: ${ownerName}\nFecha: ${new Date().toLocaleString('es-ES')}`
        );

        const mailto = `mailto:${member.email}?subject=${subject}&body=${body}`;
        // Abrir cliente de correo del sistema
        window.location.href = mailto;

        this.showNotification(`Email de asignación preparado para ${member.name}`, 'success');
    }

    // Método para notificar al equipo sobre un cliente calificado
    notifyTeamAboutQualifiedLead(clientData) {
        if (this.teamMembers.length === 0) {
            console.warn('⚠️ No hay miembros en el equipo para notificar');
            return;
        }

        const user = window.authService ? window.authService.getCurrentUser() : null;
        const ownerName = user ? user.name || 'El administrador' : 'El administrador';

        this.teamMembers.forEach(member => {
            const subject = encodeURIComponent(`🎯 Nuevo cliente calificado - ${clientData.name || 'Cliente'}`);
            const body = encodeURIComponent(
                `Hola ${member.name},\n\n` +
                `Se ha calificado un nuevo cliente y está listo para que lo trabajes:\n\n` +
                `📋 DATOS DEL CLIENTE:\n` +
                `Nombre: ${clientData.name || 'No especificado'}\n` +
                `Email: ${clientData.email || 'No especificado'}\n` +
                `Teléfono: ${clientData.phone || 'No especificado'}\n` +
                `Empresa: ${clientData.company || 'No especificado'}\n\n` +
                `💬 INFORMACIÓN ADICIONAL:\n` +
                `${clientData.notes || 'Sin notas adicionales'}\n\n` +
                `Por favor, contacta a este cliente lo antes posible.\n\n` +
                `---\n` +
                `Notificación enviada por: ${ownerName}\n` +
                `Fecha: ${new Date().toLocaleString('es-ES')}`
            );

            const mailtoLink = `mailto:${member.email}?subject=${subject}&body=${body}`;
            // Abrir cliente de correo (uno por vez)
            window.location.href = mailtoLink;
            console.log(`📧 Notificación disparada para ${member.name} (${member.email})`);
        });

        this.showNotification(`Emails de notificación disparados a ${this.teamMembers.length} miembro(s)`, 'success');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const icon = {
            'success': 'fa-check-circle',
            'error': 'fa-exclamation-circle',
            'warning': 'fa-exclamation-triangle',
            'info': 'fa-info-circle'
        }[type] || 'fa-info-circle';

        notification.innerHTML = `
            <i class="fas ${icon}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);

        notification.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    // Método para forzar la reinicialización
    forceReinitialize() {
        console.log('🔄 Forzando reinicialización del TeamManager...');
        this.setupEventListeners();
        this.updateTeamUI();
        console.log('✅ TeamManager reinicializado forzadamente');
    }

}

// Inicializar TeamManager de forma robusta (funciona si el DOM ya está listo)
(function initTeamManager() {
    function bootstrap() {
        if (!window.teamManager) {
            window.teamManager = new TeamManager();
            console.log('✅ TeamManager inicializado');
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

    // Reinicializar cuando se accede a la sección de equipo
    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('[data-section="team"]');
        if (navItem) {
            setTimeout(() => {
                if (window.teamManager) {
                    window.teamManager.setupEventListeners();
                    window.teamManager.updateTeamUI();
                }
            }, 100);
        }
    });
})();

// Función global para reinicializar manualmente si es necesario
window.reinitializeTeam = () => {
    if (window.teamManager) {
        window.teamManager.forceReinitialize();
    } else {
        console.error('❌ TeamManager no está disponible');
    }
};

