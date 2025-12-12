/**
 * Utilidad de conexión a Neon Database
 * Maneja la conexión y queries a PostgreSQL en Neon
 */

const { neon } = require('@neondatabase/serverless');

// Obtener la URL de conexión desde variables de entorno
const getDatabaseUrl = () => {
    const url = process.env.NEON_DATABASE_URL;
    if (!url) {
        console.error('❌ NEON_DATABASE_URL no está configurada');
        console.error('🔍 Variables de entorno disponibles:', Object.keys(process.env).filter(k => k.includes('NEON') || k.includes('DATABASE')));
        throw new Error('NEON_DATABASE_URL no está configurada en las variables de entorno');
    }
    console.log('✅ NEON_DATABASE_URL encontrada (longitud:', url.length, ')');
    return url;
};

// Crear cliente de Neon
let sql = null;

const getSql = () => {
    if (!sql) {
        const databaseUrl = getDatabaseUrl();
        sql = neon(databaseUrl);
    }
    return sql;
};

// Función helper para ejecutar queries
const executeQuery = async (query, params = []) => {
    try {
        console.log('🔍 Ejecutando query:', query.substring(0, 100) + '...');
        console.log('🔍 Parámetros:', params);
        const db = getSql();
        const result = await db(query, params);
        console.log('✅ Query ejecutado exitosamente, resultados:', result ? result.length : 0);
        return result;
    } catch (error) {
        console.error('❌ Error ejecutando query:', error);
        console.error('❌ Query:', query);
        console.error('❌ Parámetros:', params);
        throw error;
    }
};

module.exports = {
    getSql,
    executeQuery,
    getDatabaseUrl
};

