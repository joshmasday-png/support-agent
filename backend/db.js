const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const dataDirectory = path.join(__dirname, 'data');
const defaultDatabasePath = path.join(dataDirectory, 'app-state.db');
const defaultLegacyJsonPath = path.join(dataDirectory, 'app-state.json');

function ensureDataDirectory() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function ensureSqliteConversationColumns(db) {
  const columns = db.prepare('PRAGMA table_info(conversations)').all();
  const names = new Set(columns.map((column) => column.name));

  if (!names.has('review_status')) {
    db.exec("ALTER TABLE conversations ADD COLUMN review_status TEXT NOT NULL DEFAULT 'unreviewed'");
  }

  if (!names.has('merchant_note')) {
    db.exec("ALTER TABLE conversations ADD COLUMN merchant_note TEXT NOT NULL DEFAULT ''");
  }
}

function createDefaultState() {
  return {
    shopifySessions: {},
    merchantSettings: {},
    conversationHistory: {},
    usageStats: {},
  };
}

function parseJson(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
}

function mergeStateWithDefaults(state) {
  const defaults = createDefaultState();

  return {
    shopifySessions:
      state && typeof state.shopifySessions === 'object' && state.shopifySessions
        ? state.shopifySessions
        : defaults.shopifySessions,
    merchantSettings:
      state && typeof state.merchantSettings === 'object' && state.merchantSettings
        ? state.merchantSettings
        : defaults.merchantSettings,
    conversationHistory:
      state && typeof state.conversationHistory === 'object' && state.conversationHistory
        ? state.conversationHistory
        : defaults.conversationHistory,
    usageStats:
      state && typeof state.usageStats === 'object' && state.usageStats
        ? state.usageStats
        : defaults.usageStats,
  };
}

function buildHydratedState({ sessions, settings, usageRows, conversationRows }) {
  const state = createDefaultState();

  sessions.forEach((row) => {
    state.shopifySessions[row.shop] = {
      shop: row.shop,
      accessToken: row.access_token,
      installedAt: row.installed_at || null,
      syncedAt: row.synced_at || null,
      syncWarning: row.sync_warning || '',
      knowledgeSources: parseJson(row.knowledge_sources, []),
    };
  });

  settings.forEach((row) => {
    state.merchantSettings[row.shop] = parseJson(row.settings_json, {});
  });

  usageRows.forEach((row) => {
    state.usageStats[row.shop] = parseJson(row.stats_json, {});
  });

  conversationRows.forEach((row) => {
    if (!state.conversationHistory[row.shop]) {
      state.conversationHistory[row.shop] = [];
    }

    state.conversationHistory[row.shop].push({
      id: row.id,
      shop: row.shop,
      question: row.question,
      reply: row.reply,
      knowledgeSourceCount: Number(row.knowledge_source_count || 0),
      channel: row.channel,
      usedSources: parseJson(row.used_sources_json, []),
      grounding: parseJson(row.grounding_json, { label: 'Unknown', score: 0 }),
      reviewStatus: row.review_status || 'unreviewed',
      merchantNote: row.merchant_note || '',
      createdAt: row.created_at,
    });
  });

  return state;
}

function loadLegacyStateFromJson(legacyJsonPath) {
  const defaults = createDefaultState();

  if (fs.existsSync(legacyJsonPath)) {
    try {
      const raw = fs.readFileSync(legacyJsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      return mergeStateWithDefaults(parsed);
    } catch (error) {
      return defaults;
    }
  }

  return defaults;
}

function createSqlitePersistence({
  databasePath = process.env.DATABASE_PATH || defaultDatabasePath,
  legacyJsonPath = defaultLegacyJsonPath,
}) {
  ensureDataDirectory();

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shopify_sessions (
      shop TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      installed_at TEXT,
      synced_at TEXT,
      sync_warning TEXT,
      knowledge_sources TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_settings (
      shop TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_stats (
      shop TEXT PRIMARY KEY,
      stats_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      question TEXT NOT NULL,
      reply TEXT NOT NULL,
      knowledge_source_count INTEGER NOT NULL DEFAULT 0,
      channel TEXT NOT NULL,
      used_sources_json TEXT NOT NULL DEFAULT '[]',
      grounding_json TEXT NOT NULL DEFAULT '{}',
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      merchant_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_shop_created_at
      ON conversations (shop, created_at DESC);
  `);
  ensureSqliteConversationColumns(db);

  const hasNormalizedData = () => {
    const counts = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM shopify_sessions) AS session_count,
          (SELECT COUNT(*) FROM merchant_settings) AS settings_count,
          (SELECT COUNT(*) FROM usage_stats) AS usage_count,
          (SELECT COUNT(*) FROM conversations) AS conversation_count
      `)
      .get();

    return (
      Number(counts.session_count || 0) > 0 ||
      Number(counts.settings_count || 0) > 0 ||
      Number(counts.usage_count || 0) > 0 ||
      Number(counts.conversation_count || 0) > 0
    );
  };

  const hydrateState = () => {
    const sessions = db
      .prepare(`
        SELECT shop, access_token, installed_at, synced_at, sync_warning, knowledge_sources
        FROM shopify_sessions
      `)
      .all();
    const settings = db.prepare('SELECT shop, settings_json FROM merchant_settings').all();
    const usageRows = db.prepare('SELECT shop, stats_json FROM usage_stats').all();
    const conversationRows = db
      .prepare(`
        SELECT id, shop, question, reply, knowledge_source_count, channel, used_sources_json, grounding_json, review_status, merchant_note, created_at
        FROM conversations
        ORDER BY created_at DESC
      `)
      .all();

    return buildHydratedState({ sessions, settings, usageRows, conversationRows });
  };

  const clearTables = db.transaction(() => {
    db.prepare('DELETE FROM shopify_sessions').run();
    db.prepare('DELETE FROM merchant_settings').run();
    db.prepare('DELETE FROM usage_stats').run();
    db.prepare('DELETE FROM conversations').run();
  });

  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO shopify_sessions (
      shop, access_token, installed_at, synced_at, sync_warning, knowledge_sources, updated_at
    ) VALUES (
      @shop, @accessToken, @installedAt, @syncedAt, @syncWarning, @knowledgeSources, @updatedAt
    )
  `);

  const insertSettings = db.prepare(`
    INSERT OR REPLACE INTO merchant_settings (shop, settings_json, updated_at)
    VALUES (@shop, @settingsJson, @updatedAt)
  `);

  const insertUsage = db.prepare(`
    INSERT OR REPLACE INTO usage_stats (shop, stats_json, updated_at)
    VALUES (@shop, @statsJson, @updatedAt)
  `);

  const insertConversation = db.prepare(`
    INSERT OR REPLACE INTO conversations (
      id, shop, question, reply, knowledge_source_count, channel, used_sources_json, grounding_json, review_status, merchant_note, created_at
    ) VALUES (
      @id, @shop, @question, @reply, @knowledgeSourceCount, @channel, @usedSourcesJson, @groundingJson, @reviewStatus, @merchantNote, @createdAt
    )
  `);

  const upsertAppState = db.prepare(`
    INSERT INTO app_state (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  const writeState = db.transaction((state) => {
    const merged = mergeStateWithDefaults(state);
    const updatedAt = new Date().toISOString();

    clearTables();

    Object.entries(merged.shopifySessions).forEach(([shop, session]) => {
      if (!shop) {
        return;
      }

      insertSession.run({
        shop,
        accessToken: session?.accessToken || '',
        installedAt: session?.installedAt || null,
        syncedAt: session?.syncedAt || null,
        syncWarning: session?.syncWarning || '',
        knowledgeSources: JSON.stringify(Array.isArray(session?.knowledgeSources) ? session.knowledgeSources : []),
        updatedAt,
      });
    });

    Object.entries(merged.merchantSettings).forEach(([shop, settings]) => {
      if (!shop) {
        return;
      }

      insertSettings.run({
        shop,
        settingsJson: JSON.stringify(settings && typeof settings === 'object' ? settings : {}),
        updatedAt,
      });
    });

    Object.entries(merged.usageStats).forEach(([shop, stats]) => {
      if (!shop) {
        return;
      }

      insertUsage.run({
        shop,
        statsJson: JSON.stringify(stats && typeof stats === 'object' ? stats : {}),
        updatedAt,
      });
    });

    Object.entries(merged.conversationHistory).forEach(([shop, conversations]) => {
      if (!shop || !Array.isArray(conversations)) {
        return;
      }

      conversations.forEach((entry) => {
        insertConversation.run({
          id: entry?.id || `${shop}-${entry?.createdAt || Date.now()}`,
          shop,
          question: entry?.question || '',
          reply: entry?.reply || '',
          knowledgeSourceCount: Number(entry?.knowledgeSourceCount || 0),
          channel: entry?.channel || 'unknown',
          usedSourcesJson: JSON.stringify(Array.isArray(entry?.usedSources) ? entry.usedSources : []),
          groundingJson: JSON.stringify(
            entry?.grounding && typeof entry.grounding === 'object'
              ? entry.grounding
              : { label: 'Unknown', score: 0 }
          ),
          reviewStatus: entry?.reviewStatus || 'unreviewed',
          merchantNote: entry?.merchantNote || '',
          createdAt: entry?.createdAt || updatedAt,
        });
      });
    });

    upsertAppState.run({
      key: 'storage_format',
      value: JSON.stringify({ version: 3, engine: 'sqlite', migratedAt: updatedAt }),
      updatedAt,
    });
  });

  return {
    engine: 'sqlite',
    databasePath,
    async loadState() {
      if (hasNormalizedData()) {
        return hydrateState();
      }

      const legacyRow = db.prepare('SELECT value FROM app_state WHERE key = ?').get('global_state');
      const legacyState = legacyRow
        ? mergeStateWithDefaults(parseJson(legacyRow.value, createDefaultState()))
        : loadLegacyStateFromJson(legacyJsonPath);

      writeState(legacyState);
      return hydrateState();
    },
    async saveState(state) {
      writeState(state);
    },
  };
}

function createPostgresPersistence({ connectionString = process.env.DATABASE_URL, legacyJsonPath = defaultLegacyJsonPath }) {
  const pool = new Pool({
    connectionString,
    ssl:
      process.env.PGSSL === 'false' || process.env.PGSSLMODE === 'disable'
        ? false
        : { rejectUnauthorized: false },
  });

  const createTables = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shopify_sessions (
        shop TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        installed_at TIMESTAMPTZ,
        synced_at TIMESTAMPTZ,
        sync_warning TEXT,
        knowledge_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS merchant_settings (
        shop TEXT PRIMARY KEY,
        settings_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_stats (
        shop TEXT PRIMARY KEY,
        stats_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        shop TEXT NOT NULL,
        question TEXT NOT NULL,
        reply TEXT NOT NULL,
        knowledge_source_count INTEGER NOT NULL DEFAULT 0,
        channel TEXT NOT NULL,
        used_sources_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        grounding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        review_status TEXT NOT NULL DEFAULT 'unreviewed',
        merchant_note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_shop_created_at
        ON conversations (shop, created_at DESC);

      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed';
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS merchant_note TEXT NOT NULL DEFAULT '';
    `);
  };

  const hasNormalizedData = async () => {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM shopify_sessions) AS session_count,
        (SELECT COUNT(*) FROM merchant_settings) AS settings_count,
        (SELECT COUNT(*) FROM usage_stats) AS usage_count,
        (SELECT COUNT(*) FROM conversations) AS conversation_count
    `);
    const counts = result.rows[0] || {};

    return (
      Number(counts.session_count || 0) > 0 ||
      Number(counts.settings_count || 0) > 0 ||
      Number(counts.usage_count || 0) > 0 ||
      Number(counts.conversation_count || 0) > 0
    );
  };

  const hydrateState = async () => {
    const [sessionsResult, settingsResult, usageResult, conversationsResult] = await Promise.all([
      pool.query(`
        SELECT shop, access_token, installed_at, synced_at, sync_warning, knowledge_sources::text AS knowledge_sources
        FROM shopify_sessions
      `),
      pool.query('SELECT shop, settings_json::text AS settings_json FROM merchant_settings'),
      pool.query('SELECT shop, stats_json::text AS stats_json FROM usage_stats'),
      pool.query(`
        SELECT id, shop, question, reply, knowledge_source_count, channel,
               used_sources_json::text AS used_sources_json,
               grounding_json::text AS grounding_json,
               review_status,
               merchant_note,
               created_at
        FROM conversations
        ORDER BY created_at DESC
      `),
    ]);

    const sessions = sessionsResult.rows.map((row) => ({
      ...row,
      installed_at: row.installed_at ? new Date(row.installed_at).toISOString() : null,
      synced_at: row.synced_at ? new Date(row.synced_at).toISOString() : null,
    }));
    const conversations = conversationsResult.rows.map((row) => ({
      ...row,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    }));

    return buildHydratedState({
      sessions,
      settings: settingsResult.rows,
      usageRows: usageResult.rows,
      conversationRows: conversations,
    });
  };

  const writeState = async (state) => {
    const merged = mergeStateWithDefaults(state);
    const updatedAt = new Date().toISOString();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM shopify_sessions');
      await client.query('DELETE FROM merchant_settings');
      await client.query('DELETE FROM usage_stats');
      await client.query('DELETE FROM conversations');

      for (const [shop, session] of Object.entries(merged.shopifySessions)) {
        if (!shop) {
          continue;
        }

        await client.query(
          `
            INSERT INTO shopify_sessions (
              shop, access_token, installed_at, synced_at, sync_warning, knowledge_sources, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
          `,
          [
            shop,
            session?.accessToken || '',
            session?.installedAt || null,
            session?.syncedAt || null,
            session?.syncWarning || '',
            JSON.stringify(Array.isArray(session?.knowledgeSources) ? session.knowledgeSources : []),
            updatedAt,
          ]
        );
      }

      for (const [shop, settings] of Object.entries(merged.merchantSettings)) {
        if (!shop) {
          continue;
        }

        await client.query(
          'INSERT INTO merchant_settings (shop, settings_json, updated_at) VALUES ($1, $2::jsonb, $3)',
          [shop, JSON.stringify(settings && typeof settings === 'object' ? settings : {}), updatedAt]
        );
      }

      for (const [shop, stats] of Object.entries(merged.usageStats)) {
        if (!shop) {
          continue;
        }

        await client.query(
          'INSERT INTO usage_stats (shop, stats_json, updated_at) VALUES ($1, $2::jsonb, $3)',
          [shop, JSON.stringify(stats && typeof stats === 'object' ? stats : {}), updatedAt]
        );
      }

      for (const [shop, conversations] of Object.entries(merged.conversationHistory)) {
        if (!shop || !Array.isArray(conversations)) {
          continue;
        }

        for (const entry of conversations) {
          await client.query(
            `
              INSERT INTO conversations (
                id, shop, question, reply, knowledge_source_count, channel, used_sources_json, grounding_json, review_status, merchant_note, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)
            `,
            [
              entry?.id || `${shop}-${entry?.createdAt || Date.now()}`,
              shop,
              entry?.question || '',
              entry?.reply || '',
              Number(entry?.knowledgeSourceCount || 0),
              entry?.channel || 'unknown',
              JSON.stringify(Array.isArray(entry?.usedSources) ? entry.usedSources : []),
              JSON.stringify(
                entry?.grounding && typeof entry.grounding === 'object'
                  ? entry.grounding
                  : { label: 'Unknown', score: 0 }
              ),
              entry?.reviewStatus || 'unreviewed',
              entry?.merchantNote || '',
              entry?.createdAt || updatedAt,
            ]
          );
        }
      }

      await client.query(
        `
          INSERT INTO app_state (key, value, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT(key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = EXCLUDED.updated_at
        `,
        ['storage_format', JSON.stringify({ version: 3, engine: 'postgres', migratedAt: updatedAt }), updatedAt]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  return {
    engine: 'postgres',
    async loadState() {
      await createTables();

      if (await hasNormalizedData()) {
        return hydrateState();
      }

      const legacyRow = await pool.query('SELECT value FROM app_state WHERE key = $1', ['global_state']);
      const legacyState = legacyRow.rows[0]
        ? mergeStateWithDefaults(parseJson(legacyRow.rows[0].value, createDefaultState()))
        : loadLegacyStateFromJson(legacyJsonPath);

      await writeState(legacyState);
      return hydrateState();
    },
    async saveState(state) {
      await createTables();
      await writeState(state);
    },
  };
}

function createPersistence(options = {}) {
  if (process.env.DATABASE_URL) {
    return createPostgresPersistence(options);
  }

  return createSqlitePersistence(options);
}

module.exports = {
  createPersistence,
  defaultDatabasePath,
};
