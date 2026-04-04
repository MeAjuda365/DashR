// ── DashR Knex configuration ──────────────────────────────────────
require('dotenv').config();
const path = require('path');

/** @type {import('knex').Knex.Config} */
module.exports = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(process.env.DB_PATH || './data/dashboard.db'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: './server/db/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './server/db/seeds',
    },
  },

  production: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(process.env.DB_PATH || '/app/data/dashboard.db'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: './server/db/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './server/db/seeds',
    },
  },
};
