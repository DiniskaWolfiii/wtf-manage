import mysql from 'mysql2/promise';

const DB_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

function getDbConfig() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || '3306');
  const user = process.env.DB_USERNAME || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'wtf_manage';

  if (!DB_NAME_REGEX.test(database)) {
    throw new Error('Invalid DB_NAME format');
  }

  return { host, port, user, password, database };
}

const globalForDb = globalThis as unknown as {
  mysqlPool?: mysql.Pool;
  mysqlDbInitialized?: Promise<void>;
};

export function getPool(): mysql.Pool {
  if (!globalForDb.mysqlPool) {
    const cfg = getDbConfig();
    globalForDb.mysqlPool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
    });
  }
  return globalForDb.mysqlPool;
}

/**
 * Ensures the target database exists if the server allows CREATE DATABASE.
 */
export async function ensureDatabaseExists(): Promise<void> {
  if (!globalForDb.mysqlDbInitialized) {
    globalForDb.mysqlDbInitialized = (async () => {
      const cfg = getDbConfig();
      const adminConn = await mysql.createConnection({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
      });
      try {
        await adminConn.query(
          `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
      } finally {
        await adminConn.end();
      }
    })().catch((err) => {
      globalForDb.mysqlDbInitialized = undefined;
      throw err;
    });
  }
  return globalForDb.mysqlDbInitialized;
}
