// Manager de Facturación
class BillingManager {
    constructor() {
        this.stripeService = null;
        this.customerInfo = null;
        this.subscriptions = [];
        this.invoices = [];
        this.paymentMethods = [];
        this.init();
    }

    async init() {
        try {
            console.log('🔄 Inicializando Billing Manager...');
            
            // Inicializar Stripe Service
            this.stripeService = new StripeService();
            await this.stripeService.initialize();
            
            // Cargar datos de facturación
            await this.loadBillingData();
            
            console.log('✅ Billing Manager inicializado correctamente');
        } catch (error) {
            console.error('❌ Error inicializando Billing Manager:', error);
        }
    }

    // Cargar todos los datos de facturación DIRECTAMENTE de Stripe
    async loadBillingData() {
        try {
            console.log('📊 Cargando datos de facturación desde Stripe...');
            
            // Verificar y recargar usuario si es necesario
            if (!window.authService) {
                console.error('❌ AuthService no está disponible');
                this.showErrorMessage('Error: Servicio de autenticación no disponible. Por favor, recarga la página.');
                return;
            }
            
            // Intentar recargar datos de autenticación desde storage
            window.authService.loadAuthData();
            
            // Verificar usuario después de recargar
            let currentUser = window.authService?.getCurrentUser();
            if (!currentUser) {
                console.error('❌ No hay usuario autenticado después de recargar datos');
                
                // Verificar si hay token pero no usuario (sesión expirada)
                const token = window.authService?.getToken();
                if (!token) {
                    console.log('❌ No hay token disponible');
                    this.showErrorMessage('No hay usuario autenticado. Por favor, inicia sesión nuevamente.');
                    // Redirigir a login después de 2 segundos
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                    return;
                }
                
                // Si hay token pero no usuario, puede ser que la sesión expiró
                // No validamos el token para evitar limpiar la sesión innecesariamente
                // Solo mostramos el error y sugerimos reiniciar sesión
                console.log('⚠️ Hay token pero no usuario - sesión puede haber expirado');
                this.showErrorMessage('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                return;
            }
            
            console.log('👤 Usuario autenticado:', currentUser.email);
            console.log('🔍 Verificando stripe_customer_id...');
            
            // Cargar datos en paralelo (customerInfo puede fallar, así que lo manejamos por separado)
            let customerInfo = null;
            try {
                customerInfo = await this.stripeService.getCustomerInfo();
            } catch (error) {
                // Manejar errores de Stripe de forma silenciosa si no está configurado
                // No romper la aplicación por errores de Stripe
                console.warn('⚠️ Error obteniendo información del cliente de Stripe (continuando sin datos de facturación):', error.message);
                
                // Solo mostrar error detallado en desarrollo
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    let errorMessage = 'No se pudo obtener la información del cliente de Stripe.';
                    
                    if (error.message.includes('stripe_customer_id no configurado')) {
                        errorMessage += '\n\nEl campo stripe_customer_id no está configurado en Neon.';
                        errorMessage += '\n\nPara solucionarlo:';
                        errorMessage += '\n1. Verifica el nombre exacto del campo en Neon';
                        errorMessage += '\n2. Asegúrate de que el campo tenga un valor (ej: cus_THw3cWvDfKwj5g)';
                    } else if (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('Customer not found')) {
                        const stripeCustomerId = currentUser?.stripeCustomerId || currentUser?.stripe_customer_id || 'N/A';
                        errorMessage += `\n\nEl Customer ID "${stripeCustomerId}" no existe en Stripe o no está asociado a tu cuenta.`;
                        errorMessage += '\n\nPosibles causas:';
                        errorMessage += '\n1. El Customer ID en Neon es incorrecto';
                        errorMessage += '\n2. El Customer ID fue eliminado de Stripe';
                        errorMessage += '\n3. La clave secreta de Stripe no tiene acceso a este customer';
                        errorMessage += '\n4. STRIPE_SECRET_KEY no está configurada en Vercel';
                        errorMessage += '\n\nSolución: Verifica el Customer ID en Neon y asegúrate de que existe en tu cuenta de Stripe.';
                    } else if (error.message.includes('ERR_BLOCKED_BY_CLIENT') || error.message.includes('Failed to fetch')) {
                        errorMessage += '\n\nPosible bloqueo por extensión del navegador o endpoint no disponible.';
                        errorMessage += '\n\nSolución: Desactiva ad-blockers o verifica que los endpoints de Stripe estén desplegados en Vercel.';
                    } else if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                        errorMessage += '\n\nError de autenticación con el servidor.';
                        errorMessage += '\n\nSolución: Verifica que la variable STRIPE_SECRET_KEY esté configurada correctamente en Vercel.';
                    }
                    console.error('❌', errorMessage);
                }
                
                // NO romper el flujo - continuar sin datos de Stripe
                // El usuario puede usar la app sin facturación
                customerInfo = null;
            }
            
            // Cargar el resto de datos en paralelo
            const [subscriptions, invoices, paymentMethods] = await Promise.all([
                this.stripeService.getSubscriptions().catch(err => {
                    console.error('Error obteniendo suscripciones:', err);
                    return [];
                }),
                this.stripeService.getInvoices().catch(err => {
                    console.error('Error obteniendo facturas:', err);
                    return [];
                }),
                this.stripeService.getPaymentMethods().catch(err => {
                    console.error('Error obteniendo métodos de pago:', err);
                    return [];
                })
            ]);

            this.customerInfo = customerInfo;
            this.subscriptions = subscriptions || [];
            this.invoices = invoices || [];
            this.paymentMethods = paymentMethods || [];

            // Renderizar la UI (funcionará incluso sin datos de Stripe)
            this.renderBillingUI();
            
            if (customerInfo) {
                console.log('✅ Datos de facturación cargados correctamente desde Stripe');
            } else {
                console.log('ℹ️ Dashboard cargado sin datos de Stripe (esto es normal si Stripe no está configurado)');
            }
        } catch (error) {
            console.error('❌ Error cargando datos de facturación:', error);
            this.showErrorMessage('Error cargando datos de facturación desde Stripe');
        }
    }

    // Renderizar la interfaz de facturación
    renderBillingUI() {
        console.log('🎨 Renderizando interfaz de facturación...');
        console.log('- Customer Info:', this.customerInfo);
        console.log('- Subscriptions:', this.subscriptions);
        console.log('- Invoices:', this.invoices);
        console.log('- Payment Methods:', this.paymentMethods);
        
        this.renderCustomerInfo();
        this.renderSubscriptions();
        this.renderInvoices();
        this.renderPaymentMethods();
        
        console.log('✅ Interfaz de facturación renderizada');
    }

    // Renderizar información del cliente
    renderCustomerInfo() {
        console.log('👤 Renderizando información del cliente...');
        const customerInfoSection = document.getElementById('customerInfoSection');
        
        if (!customerInfoSection) {
            console.error('❌ No se encontró el elemento customerInfoSection');
            return;
        }
        
        if (!this.customerInfo) {
            console.warn('⚠️ No hay información del cliente para renderizar');
            return;
        }
        
        console.log('✅ Renderizando información del cliente:', this.customerInfo);

        customerInfoSection.innerHTML = `
            <div class="billing-card">
                <div class="card-header">
                    <h3>
                        <i class="fas fa-user"></i>
                        Información del Cliente
                    </h3>
                    <button class="btn btn-primary btn-sm" onclick="window.billingManager.openBillingPortal()">
                        <i class="fas fa-external-link-alt"></i>
                        Portal de Facturación
                    </button>
                </div>
                <div class="card-body">
                    <div class="info-grid">
                        <div class="info-item">
                            <label>ID del Cliente:</label>
                            <span class="info-value">${this.customerInfo.id}</span>
                        </div>
                        <div class="info-item">
                            <label>Email:</label>
                            <span class="info-value">${this.customerInfo.email || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <label>Nombre:</label>
                            <span class="info-value">${this.customerInfo.name || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <label>Fecha de Registro:</label>
                            <span class="info-value">${this.formatDate(this.customerInfo.created)}</span>
                        </div>
                        <div class="info-item">
                            <label>Moneda:</label>
                            <span class="info-value">${this.customerInfo.currency.toUpperCase()}</span>
                        </div>
                        <div class="info-item">
                            <label>Estado:</label>
                            <span class="status-badge ${this.customerInfo.delinquent ? 'danger' : 'success'}">
                                ${this.customerInfo.delinquent ? 'Moroso' : 'Al día'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Renderizar suscripciones
    renderSubscriptions() {
        const subscriptionsSection = document.getElementById('subscriptionsSection');
        if (!subscriptionsSection) return;

        if (this.subscriptions.length === 0) {
            subscriptionsSection.innerHTML = `
                <div class="billing-card">
                    <div class="card-header">
                        <h3>
                            <i class="fas fa-credit-card"></i>
                            Suscripciones
                        </h3>
                    </div>
                    <div class="card-body">
                        <div class="empty-state">
                            <i class="fas fa-credit-card"></i>
                            <p>No tienes suscripciones activas</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const subscriptionsHTML = this.subscriptions.map(subscription => {
            // Obtener datos DIRECTAMENTE de Stripe (sin fallbacks)
            const items = subscription.items?.data || subscription.items || [];
            const firstItem = items[0] || {};
            const price = firstItem.price || {};
            const product = price.product || {};
            
            // Obtener nombre del producto REAL de Stripe
            // El producto debería estar expandido por la función serverless
            let productName = 'N/A';
            if (typeof product === 'object' && product.name) {
                productName = product.name; // Nombre real de Stripe (ej: "Agente IA - Plan Starter")
            } else if (typeof product === 'string') {
                // Si viene como ID, intentar obtener de metadata o usar el ID
                productName = subscription.metadata?.product_name || product;
            }
            
            // Obtener descripción del producto REAL de Stripe
            let productDescription = '';
            if (typeof product === 'object' && product.description) {
                productDescription = product.description; // Descripción real de Stripe
            } else {
                productDescription = subscription.metadata?.product_description || '';
            }
            
            const statusColor = this.stripeService.getStatusColor(subscription.status, 'subscription');
            const statusText = this.stripeService.getSubscriptionStatusText(subscription.status);
            
            // Manejar fechas (pueden venir como timestamp o string)
            const periodStart = subscription.current_period_start 
                ? (typeof subscription.current_period_start === 'number' 
                    ? subscription.current_period_start 
                    : Math.floor(new Date(subscription.current_period_start).getTime() / 1000))
                : null;
            const periodEnd = subscription.current_period_end
                ? (typeof subscription.current_period_end === 'number'
                    ? subscription.current_period_end
                    : Math.floor(new Date(subscription.current_period_end).getTime() / 1000))
                : null;
            
            // Formatear precio
            const unitAmount = price.unit_amount || 0;
            const currency = price.currency || subscription.currency || 'usd';
            const interval = price.recurring?.interval || subscription.metadata?.interval || 'month';
            const intervalText = interval === 'month' ? 'mensual' : interval === 'year' ? 'anual' : interval;

            return `
                <div class="subscription-item">
                    <div class="subscription-header">
                        <div class="subscription-info">
                            <h4>${productName}</h4>
                            <p>${productDescription}</p>
                        </div>
                        <div class="subscription-status">
                            <span class="status-badge ${statusColor}">${statusText}</span>
                        </div>
                    </div>
                    <div class="subscription-details">
                        <div class="detail-item">
                            <label>Precio:</label>
                            <span>${this.stripeService.formatStripeAmount(unitAmount, currency)} ${intervalText}</span>
                        </div>
                        ${periodStart && periodEnd ? `
                        <div class="detail-item">
                            <label>Período actual:</label>
                            <span>${this.stripeService.formatStripeDate(periodStart)} - ${this.stripeService.formatStripeDate(periodEnd)}</span>
                        </div>
                        ` : ''}
                        <div class="detail-item">
                            <label>Cancelar al finalizar:</label>
                            <span>${subscription.cancel_at_period_end ? 'Sí' : 'No'}</span>
                        </div>
                    </div>
                    <div class="subscription-actions">
                        ${subscription.status === 'active' || subscription.status === 'trialing' ? `
                            <button class="btn btn-outline btn-sm" onclick="window.billingManager.manageSubscription('${subscription.id}')">
                                <i class="fas fa-cog"></i>
                                Gestionar
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        subscriptionsSection.innerHTML = `
            <div class="billing-card">
                <div class="card-header">
                    <h3>
                        <i class="fas fa-credit-card"></i>
                        Suscripciones Activas
                    </h3>
                </div>
                <div class="card-body">
                    <div class="subscriptions-list">
                        ${subscriptionsHTML}
                    </div>
                </div>
            </div>
        `;
    }

    // Renderizar facturas
    renderInvoices() {
        const invoicesSection = document.getElementById('invoicesSection');
        if (!invoicesSection) return;

        if (this.invoices.length === 0) {
            invoicesSection.innerHTML = `
                <div class="billing-card">
                    <div class="card-header">
                        <h3>
                            <i class="fas fa-file-invoice"></i>
                            Facturas
                        </h3>
                    </div>
                    <div class="card-body">
                        <div class="empty-state">
                            <i class="fas fa-file-invoice"></i>
                            <p>No hay facturas disponibles</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const invoicesHTML = this.invoices.map(invoice => {
            const statusColor = this.stripeService.getStatusColor(invoice.status);
            const statusText = this.stripeService.getInvoiceStatusText(invoice.status);
            
            // Manejar el número de factura (puede venir como 'number' o generarse desde 'id')
            const invoiceNumber = invoice.number || invoice.id?.replace('in_', 'INV-').toUpperCase() || 'N/A';
            
            // Manejar fechas (pueden venir como timestamp o string)
            const createdDate = invoice.created ? (typeof invoice.created === 'number' ? invoice.created : Math.floor(new Date(invoice.created).getTime() / 1000)) : null;
            const dueDate = invoice.due_date ? (typeof invoice.due_date === 'number' ? invoice.due_date : Math.floor(new Date(invoice.due_date).getTime() / 1000)) : createdDate;
            
            // URLs de descarga
            const pdfUrl = invoice.invoice_pdf || invoice.hosted_invoice_url || '#';
            const hostedUrl = invoice.hosted_invoice_url || '#';

            return `
                <div class="invoice-item">
                    <div class="invoice-header">
                        <div class="invoice-info">
                            <h4>${invoiceNumber}</h4>
                            <p>${createdDate ? this.stripeService.formatStripeDate(createdDate) : 'N/A'}</p>
                        </div>
                        <div class="invoice-amount">
                            <span class="amount">${this.stripeService.formatStripeAmount(invoice.amount_due || 0, invoice.currency || 'usd')}</span>
                            <span class="status-badge ${statusColor}">${statusText}</span>
                        </div>
                    </div>
                    <div class="invoice-details">
                        <div class="detail-item">
                            <label>Vencimiento:</label>
                            <span>${dueDate ? this.stripeService.formatStripeDate(dueDate) : 'N/A'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Pagado:</label>
                            <span>${this.stripeService.formatStripeAmount(invoice.amount_paid || 0, invoice.currency || 'usd')}</span>
                        </div>
                    </div>
                    <div class="invoice-actions">
                        ${pdfUrl !== '#' ? `
                            <a href="${pdfUrl}" target="_blank" class="btn btn-outline btn-sm">
                                <i class="fas fa-download"></i>
                                Descargar PDF
                            </a>
                        ` : `
                            <button class="btn btn-outline btn-sm" onclick="window.billingManager.downloadInvoice('${invoice.id}')">
                                <i class="fas fa-download"></i>
                                Descargar PDF
                            </button>
                        `}
                        ${invoice.status === 'open' || invoice.status === 'draft' ? `
                            <button class="btn btn-primary btn-sm" onclick="window.billingManager.payInvoice('${invoice.id}')">
                                <i class="fas fa-credit-card"></i>
                                Pagar Ahora
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        invoicesSection.innerHTML = `
            <div class="billing-card">
                <div class="card-header">
                    <h3>
                        <i class="fas fa-file-invoice"></i>
                        Historial de Facturas
                    </h3>
                </div>
                <div class="card-body">
                    <div class="invoices-list">
                        ${invoicesHTML}
                    </div>
                </div>
            </div>
        `;
    }

    // Renderizar métodos de pago
    renderPaymentMethods() {
        const paymentMethodsSection = document.getElementById('paymentMethodsSection');
        if (!paymentMethodsSection) return;

        if (this.paymentMethods.length === 0) {
            paymentMethodsSection.innerHTML = `
                <div class="billing-card">
                    <div class="card-header">
                        <h3>
                            <i class="fas fa-credit-card"></i>
                            Métodos de Pago
                        </h3>
                    </div>
                    <div class="card-body">
                        <div class="empty-state">
                            <i class="fas fa-credit-card"></i>
                            <p>No hay métodos de pago configurados</p>
                            <button class="btn btn-primary" onclick="window.billingManager.addPaymentMethod()">
                                <i class="fas fa-plus"></i>
                                Agregar Método de Pago
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const paymentMethodsHTML = this.paymentMethods.map(pm => {
            const cardIcon = this.getCardIcon(pm.card.brand);
            return `
                <div class="payment-method-item">
                    <div class="payment-method-info">
                        <div class="card-icon">
                            <i class="${cardIcon}"></i>
                        </div>
                        <div class="card-details">
                            <h4>**** **** **** ${pm.card.last4}</h4>
                            <p>${pm.card.brand.toUpperCase()} • Expira ${pm.card.exp_month}/${pm.card.exp_year}</p>
                        </div>
                    </div>
                    <div class="payment-method-actions">
                        <button class="btn btn-outline btn-sm" onclick="window.billingManager.editPaymentMethod('${pm.id}')">
                            <i class="fas fa-edit"></i>
                            Editar
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="window.billingManager.removePaymentMethod('${pm.id}')">
                            <i class="fas fa-trash"></i>
                            Eliminar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        paymentMethodsSection.innerHTML = `
            <div class="billing-card">
                <div class="card-header">
                    <h3>
                        <i class="fas fa-credit-card"></i>
                        Métodos de Pago
                    </h3>
                    <button class="btn btn-primary btn-sm" onclick="window.billingManager.addPaymentMethod()">
                        <i class="fas fa-plus"></i>
                        Agregar
                    </button>
                </div>
                <div class="card-body">
                    <div class="payment-methods-list">
                        ${paymentMethodsHTML}
                    </div>
                </div>
            </div>
        `;
    }

    // Obtener ícono de la tarjeta
    getCardIcon(brand) {
        const icons = {
            'visa': 'fab fa-cc-visa',
            'mastercard': 'fab fa-cc-mastercard',
            'amex': 'fab fa-cc-amex',
            'discover': 'fab fa-cc-discover',
            'diners': 'fab fa-cc-diners-club',
            'jcb': 'fab fa-cc-jcb',
            'unionpay': 'fab fa-cc-unionpay'
        };
        return icons[brand] || 'fas fa-credit-card';
    }

    // Formatear fecha
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Métodos de acción (simulados)
    manageSubscription(subscriptionId) {
        console.log('🔧 Gestionando suscripción:', subscriptionId);
        this.showNotification('Funcionalidad de gestión de suscripción en desarrollo', 'info');
    }

    downloadInvoice(invoiceId) {
        console.log('📥 Descargando factura:', invoiceId);
        this.showNotification('Descarga de factura en desarrollo', 'info');
    }

    payInvoice(invoiceId) {
        console.log('💳 Pagando factura:', invoiceId);
        this.showNotification('Proceso de pago en desarrollo', 'info');
    }

    addPaymentMethod() {
        console.log('➕ Agregando método de pago');
        this.showNotification('Funcionalidad de agregar método de pago en desarrollo', 'info');
    }

    editPaymentMethod(paymentMethodId) {
        console.log('✏️ Editando método de pago:', paymentMethodId);
        this.showNotification('Funcionalidad de edición en desarrollo', 'info');
    }

    removePaymentMethod(paymentMethodId) {
        console.log('🗑️ Eliminando método de pago:', paymentMethodId);
        if (confirm('¿Estás seguro de que quieres eliminar este método de pago?')) {
            this.showNotification('Método de pago eliminado', 'success');
        }
    }

    async openBillingPortal() {
        try {
            console.log('🔗 Abriendo portal de facturación...');

            if (!this.stripeService) {
                throw new Error('StripeService no está disponible');
            }

            const returnUrl = window.location.href;
            const portalUrl = await this.stripeService.createBillingPortalSession(returnUrl);

            if (portalUrl) {
                window.open(portalUrl, '_blank', 'noopener');
            } else {
                throw new Error('No se recibió la URL del portal');
            }
        } catch (error) {
            console.error('❌ Error abriendo portal de facturación:', error);
            this.showNotification(error.message || 'No se pudo abrir el portal de facturación', 'error');
        }
    }

    // Mostrar mensaje de error
    showErrorMessage(message) {
        const errorSection = document.getElementById('billingContent');
        if (errorSection) {
            errorSection.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error</h3>
                    <p>${message}</p>
                    <button class="btn btn-primary" onclick="window.billingManager.loadBillingData()">
                        <i class="fas fa-refresh"></i>
                        Reintentar
                    </button>
                </div>
            `;
        }
    }

    // Mostrar notificación
    showNotification(message, type = 'info') {
        if (window.dashboard && window.dashboard.showNotification) {
            window.dashboard.showNotification(message, type);
        } else {
            alert(message);
        }
    }
}

// Hacer disponible globalmente
window.BillingManager = BillingManager;






