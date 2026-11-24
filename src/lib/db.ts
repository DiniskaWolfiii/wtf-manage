import mysql from 'mysql2/promise';

const DB_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

function getDbSslConfig(): mysql.SslOptions | undefined {
  const rawSsl = process.env.DB_SSL?.trim().toLowerCase();
  if (rawSsl !== 'true' && rawSsl !== '1' && rawSsl !== 'required') {
    return undefined;
  }

  const rejectUnauthorized =
    process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== 'false';
  const ca = process.env.DB_SSL_CA?.trim()
    ? process.env.DB_SSL_CA.replace(/\\n/g, '\n')
    : undefined;

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {}),
  };
}

function getDbConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const host = process.env.DB_HOST?.trim() || (isProd ? '' : '127.0.0.1');
  const port = Number(process.env.DB_PORT || '3306');
  const user = process.env.DB_USERNAME?.trim() || (isProd ? '' : 'root');
  const password = process.env.DB_PASSWORD ?? (isProd ? undefined : '');
  const database = process.env.DB_NAME?.trim() || (isProd ? '' : 'wtf_manage');

  if (!host || !user || password === undefined || !database) {
    throw new Error(
      '[DB] Missing required database configuration (DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME)'
    );
  }

  if (!DB_NAME_REGEX.test(database)) {
    throw new Error('Invalid DB_NAME format');
  }

  const ssl = getDbSslConfig();

  return { host, port, user, password, database, ssl };
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
      ...(cfg.ssl ? { ssl: cfg.ssl } : {}),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 50,
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
        ...(cfg.ssl ? { ssl: cfg.ssl } : {}),
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
