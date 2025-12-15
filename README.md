# Chatbot Dashboard - Neon Version v1.0

Dashboard web para gestión de chatbots AI con integración a Neon Database (PostgreSQL).

## 🚀 Características

- ✅ Autenticación de usuarios con Neon Database
- ✅ Gestión de prospectos
- ✅ Gestión de workspaces
- ✅ Integración con GPTMaker API
- ✅ Integración con Stripe para pagos
- ✅ Dashboard completo con estadísticas

## 📋 Requisitos

- Node.js >= 16.0.0
- npm >= 8.0.0
- Base de datos Neon (PostgreSQL)
- Cuenta de Vercel para deployment

## 🔧 Instalación

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev

# Build para producción
npm run build
```

## ⚙️ Configuración

### Variables de Entorno

Crea un archivo `.env.local` basado en `config.example.env`:

```env
# Neon Database
NEON_DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# GPTMaker API
GPTMAKER_API_TOKEN=tu_token_aqui

# Stripe (opcional)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

### Configuración en Vercel

1. Conecta tu repositorio de GitHub a Vercel
2. Configura las siguientes variables de entorno:
   - `NEON_DATABASE_URL` - URL de conexión a Neon
   - `GPTMAKER_API_TOKEN` - Token de API de GPTMaker (opcional)
   - `STRIPE_SECRET_KEY` - Clave secreta de Stripe (opcional)

## 🗄️ Base de Datos

### Estructura de Tablas

El proyecto usa Neon (PostgreSQL) con las siguientes tablas:

- **users** - Usuarios del sistema
- **workspaces** - Workspaces asociados a usuarios
- **prospectos** - Prospectos extraídos de chats

### Setup de Base de Datos

Ejecuta los queries en `NEON_MIGRATION_QUERIES_COMPLETO.sql` o `QUERIES_CON_DROPDOWNS.sql` en tu base de datos Neon.

## 📁 Estructura del Proyecto

```
├── api/                    # Endpoints de API (Vercel Serverless)
│   ├── neon/              # Endpoints de Neon Database
│   └── stripe/            # Endpoints de Stripe
├── src/                    # Código fuente
│   ├── auth/              # Autenticación
│   ├── services/          # Servicios (Neon, etc.)
│   └── config/            # Configuraciones
├── index.html             # Dashboard principal
├── login.html             # Página de login
└── vercel.json            # Configuración de Vercel
```

## 🚀 Deployment

### Vercel

1. Conecta tu repositorio a Vercel
2. Configura las variables de entorno
3. Vercel detectará automáticamente el proyecto y lo desplegará

### Build Command

```bash
npm run build
```

### Output Directory

```
dist
```

## 🔐 Seguridad

- ⚠️ **NUNCA** subas archivos `.env` o con credenciales a GitHub
- Usa variables de entorno en Vercel para credenciales
- El archivo `.gitignore` está configurado para excluir archivos sensibles

## 📝 Notas

- Este proyecto migró de Airtable a Neon Database
- Los endpoints de API están en `/api/neon/`
- El frontend usa `neonService.js` para comunicarse con la base de datos

## 📄 Licencia

MIT
