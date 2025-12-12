# 🔍 Verificación de Configuración en Vercel

## ✅ Checklist de Verificación

### 1. Variable de Entorno NEON_DATABASE_URL

**PASOS:**
1. Ve a tu proyecto en [Vercel Dashboard](https://vercel.com/dashboard)
2. Click en tu proyecto
3. Ve a **Settings** → **Environment Variables**
4. Verifica que exista:
   - **Name**: `NEON_DATABASE_URL`
   - **Value**: `postgresql://user:password@host/database?sslmode=require`
   - **Environment**: Debe estar marcado para **Production**, **Preview** y **Development**

**Si NO existe:**
1. Click en **Add New**
2. Name: `NEON_DATABASE_URL`
3. Value: (pega tu URL de Neon)
4. Marca todas las opciones (Production, Preview, Development)
5. Click en **Save**

### 2. Verificar Logs de Vercel

**PASOS:**
1. Ve a tu deployment más reciente
2. Click en **Functions** o **Logs**
3. Busca mensajes que empiecen con:
   - 🔍 (debug)
   - ✅ (éxito)
   - ❌ (error)
   - 📧 (email)
   - 📊 (resultados)

**Qué buscar:**
- `✅ NEON_DATABASE_URL encontrada` - Confirma que la variable está configurada
- `🔍 URL completa recibida` - Muestra la URL que está recibiendo
- `📧 Email extraído` - Muestra el email que está buscando
- `📊 Resultado de BD` - Muestra si encontró el usuario

### 3. Probar el Endpoint Directamente

Puedes probar el endpoint directamente desde el navegador o con curl:

```bash
# Reemplaza TU_DOMINIO con tu dominio de Vercel
curl https://TU_DOMINIO.vercel.app/api/neon/users/email/admin@example.com
```

O desde el navegador:
```
https://TU_DOMINIO.vercel.app/api/neon/users/email/admin@example.com
```

**Respuesta esperada:**
```json
{
  "id": "eae05ef3-3116-4fa9-851d-89f50994c24a",
  "email": "admin@example.com",
  "first_name": "Kônsul",
  "last_name": "Team",
  "role": "admin",
  "status": "active"
}
```

### 4. Verificar que el Email Coincida Exactamente

El email en la base de datos es: `admin@example.com`

Asegúrate de usar exactamente este email en el login (sin espacios, mayúsculas/minúsculas importan).

## 🐛 Troubleshooting

### Error: "NEON_DATABASE_URL no está configurada"
- **Solución**: Agrega la variable en Vercel (paso 1)

### Error: "Usuario no encontrado" pero existe en Neon
- **Causa posible**: El email no coincide exactamente
- **Solución**: Verifica que uses exactamente `admin@example.com`

### Error 404 en el endpoint
- **Causa posible**: El parsing de la URL no funciona
- **Solución**: Revisa los logs en Vercel para ver qué URL está recibiendo

### Error de conexión a la base de datos
- **Causa posible**: URL de Neon incorrecta o expirada
- **Solución**: Verifica la URL en Neon Console y actualízala en Vercel

## 📝 Notas

- Los logs en Vercel te mostrarán exactamente qué está pasando
- El email debe coincidir exactamente (case-sensitive)
- La variable de entorno debe estar configurada para todos los ambientes

