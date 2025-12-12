/**
 * Utilidad de conexión a Neon Database
 * Maneja la conexión y queries a PostgreSQL en Neon
 */

const { neon } = require('@neondatabase/serverless');

// Obtener la URL de conexión desde variables de entorno
const getDatabaseUrl = () => {
    const url = process.env.NEON_DATABASE_URL;
    if (!url) {
        throw new Error('NEON_DATABASE_URL no está configurada en las variables de entorno');
    }
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
        const db = getSql();
        const result = await db(query, params);
        return result;
    } catch (error) {
        console.error('❌ Error ejecutando query:', error);
        throw error;
    }
};

module.exports = {
    getSql,
    executeQuery,
    getDatabaseUrl
};

