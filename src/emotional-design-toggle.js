/**
 * Sistema de Emotional Design
 * El nuevo diseño está activado por defecto
 */

class EmotionalDesignToggle {
    constructor() {
        this.isEnabled = true; // Activado por defecto
        this.init();
    }

    init() {
        // Activar el diseño siempre por defecto
        // Usar setTimeout para asegurar que el DOM esté listo
        setTimeout(() => {
            this.enable();
            // Eliminar cualquier toggle existente del DOM (si quedó de sesiones anteriores)
            this.removeExistingToggle();
        }, 0);
        
        // Guardar estado en localStorage para persistencia
        localStorage.setItem('emotionalDesignEnabled', 'true');
        
        // NO crear toggle switch - el diseño está siempre activo
        // (Comentado para mantener el código pero no ejecutarlo)
        // this.createToggleSwitch();
    }

    removeExistingToggle() {
        // Eliminar el toggle si existe en el DOM
        const toggleContainer = document.querySelector('.emotional-design-toggle-container');
        if (toggleContainer) {
            toggleContainer.remove();
            console.log('🗑️ Toggle eliminado del DOM');
        }
        
        // Eliminar los estilos del toggle si existen
        const toggleStyles = document.getElementById('emotional-design-toggle-styles');
        if (toggleStyles) {
            toggleStyles.remove();
        }
    }

    enable() {
        this.isEnabled = true;
        document.body.setAttribute('data-emotional-design', 'true');
        
        // Activar el CSS que ya está en el HTML (si existe)
        const existingLink = document.getElementById('emotional-design-styles');
        if (existingLink) {
            existingLink.media = 'all';
            existingLink.disabled = false;
            console.log('✅ Emotional Design CSS activado desde HTML');
        } else {
            // Si no existe en HTML, cargarlo dinámicamente
            const link = document.createElement('link');
            link.id = 'emotional-design-styles';
            link.rel = 'stylesheet';
            link.href = 'styles-emotional.css';
            
            link.onload = () => {
                console.log('✅ Emotional Design CSS cargado dinámicamente');
            };
            link.onerror = () => {
                console.error('❌ Error cargando Emotional Design CSS desde styles-emotional.css');
                // Intentar con diferentes rutas
                const altPaths = ['./styles-emotional.css', '/styles-emotional.css'];
                let attempt = 0;
                const tryNextPath = () => {
                    if (attempt < altPaths.length) {
                        link.href = altPaths[attempt];
                        attempt++;
                    } else {
                        console.error('❌ No se pudo cargar Emotional Design CSS desde ninguna ruta');
                    }
                };
                link.onerror = tryNextPath;
                tryNextPath();
            };
            
            document.head.appendChild(link);
        }
        
        // Cargar el CSS de emotional design para login si estamos en login.html
        if (window.location.pathname.includes('login.html') || document.querySelector('.login-container')) {
            const loginStyles = document.getElementById('emotional-design-login-styles');
            if (loginStyles) {
                loginStyles.media = 'all';
                loginStyles.disabled = false;
                console.log('✅ Emotional Design Login CSS activado');
            } else {
                const loginLink = document.createElement('link');
                loginLink.id = 'emotional-design-login-styles';
                loginLink.rel = 'stylesheet';
                loginLink.href = 'styles-emotional-login.css';
                
                loginLink.onload = () => {
                    console.log('✅ Emotional Design Login CSS cargado');
                };
                loginLink.onerror = () => {
                    console.error('❌ Error cargando Emotional Design Login CSS');
                };
                
                document.head.appendChild(loginLink);
            }
        }
        
        // Agregar clase al body para transiciones suaves
        document.body.classList.add('emotional-design-active');
        
        // Verificar que los estilos se apliquen
        setTimeout(() => {
            const testElement = document.createElement('div');
            testElement.style.cssText = 'position: absolute; visibility: hidden;';
            testElement.setAttribute('data-emotional-design', 'true');
            document.body.appendChild(testElement);
            const computedStyle = window.getComputedStyle(testElement);
            document.body.removeChild(testElement);
            
            console.log('📋 Atributo data-emotional-design:', document.body.getAttribute('data-emotional-design'));
            console.log('📋 Clase emotional-design-active:', document.body.classList.contains('emotional-design-active'));
        }, 100);
        
        console.log('✨ Emotional Design activado');
    }

    disable() {
        this.isEnabled = false;
        document.body.removeAttribute('data-emotional-design');
        document.body.classList.remove('emotional-design-active');
        localStorage.setItem('emotionalDesignEnabled', 'false');
        
        // Desactivar estilos del login si existen
        const loginStyles = document.getElementById('emotional-design-login-styles');
        if (loginStyles) {
            loginStyles.media = 'none';
        }
        
        console.log('🎨 Emotional Design desactivado');
    }

    // Método toggle deshabilitado - el diseño está siempre activo
    // toggle() {
    //     if (this.isEnabled) {
    //         this.disable();
    //     } else {
    //         this.enable();
    //     }
    // }

    // Método createToggleSwitch deshabilitado - no se muestra el toggle
    createToggleSwitch() {
        return; // No crear el toggle
        // Solo crear el toggle en el dashboard, no en login
        if (window.location.pathname.includes('login.html') || document.querySelector('.login-container')) {
            return;
        }
        
        // Buscar el sidebar footer o crear un contenedor
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (!sidebarFooter) return;

        // Crear el toggle switch
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'emotional-design-toggle-container';
        toggleContainer.innerHTML = `
            <button class="emotional-design-toggle-btn" id="emotionalDesignToggle" title="Activar/Desactivar Emotional Design">
                <i class="fas fa-palette"></i>
                <span class="toggle-label">Nuevo Diseño</span>
                <div class="toggle-switch ${this.isEnabled ? 'active' : ''}">
                    <div class="toggle-slider"></div>
                </div>
            </button>
        `;

        // Insertar antes del botón de tema
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle && themeToggle.parentNode) {
            sidebarFooter.insertBefore(toggleContainer, themeToggle);
        } else {
            sidebarFooter.appendChild(toggleContainer);
        }

        // Agregar estilos para el toggle
        this.addToggleStyles();

        // Agregar event listener
        const toggleBtn = document.getElementById('emotionalDesignToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggle();
                this.updateToggleUI();
            });
        }
    }

    updateToggleUI() {
        const toggleSwitch = document.querySelector('.emotional-design-toggle-btn .toggle-switch');
        if (toggleSwitch) {
            if (this.isEnabled) {
                toggleSwitch.classList.add('active');
            } else {
                toggleSwitch.classList.remove('active');
            }
        }
    }

    addToggleStyles() {
        const styleId = 'emotional-design-toggle-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .emotional-design-toggle-container {
                margin-bottom: 1rem;
            }

            .emotional-design-toggle-btn {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.75rem 1rem;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-md);
                color: var(--text-primary);
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 0.875rem;
                font-weight: 500;
            }

            .emotional-design-toggle-btn:hover {
                background: var(--bg-tertiary);
                border-color: var(--primary-color);
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            .emotional-design-toggle-btn i {
                color: var(--primary-color);
                font-size: 1rem;
            }

            .toggle-label {
                flex: 1;
                text-align: left;
            }

            .toggle-switch {
                width: 44px;
                height: 24px;
                background: var(--border-color);
                border-radius: 12px;
                position: relative;
                transition: background 0.3s ease;
            }

            .toggle-switch.active {
                background: var(--primary-color);
            }

            .toggle-slider {
                width: 20px;
                height: 20px;
                background: white;
                border-radius: 50%;
                position: absolute;
                top: 2px;
                left: 2px;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }

            .toggle-switch.active .toggle-slider {
                transform: translateX(20px);
            }

            .sidebar.collapsed .emotional-design-toggle-btn .toggle-label {
                display: none;
            }

            .sidebar.collapsed .emotional-design-toggle-btn {
                justify-content: center;
                padding: 0.75rem;
            }

            body[data-emotional-design="true"] .emotional-design-toggle-btn {
                background: rgba(39, 190, 165, 0.1);
                border-color: var(--primary-color);
            }

            body[data-emotional-design="true"] .emotional-design-toggle-btn:hover {
                background: rgba(39, 190, 165, 0.2);
            }
        `;
        document.head.appendChild(style);
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.emotionalDesignToggle = new EmotionalDesignToggle();
    });
} else {
    window.emotionalDesignToggle = new EmotionalDesignToggle();
}
