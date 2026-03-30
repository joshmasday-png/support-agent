const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDirectory = path.join(__dirname, 'data');
const defaultDatabasePath = path.join(dataDirectory, 'app-state.db');
const defaultLegacyJsonPath = path.join(dataDirectory, 'app-state.json');

function ensureDataDirectory() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
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

function createTables(db) {
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
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_shop_created_at
      ON conversations (shop, created_at DESC);
  `);
}

function hasNormalizedData(db) {
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM shopify_sessions) AS session_count,
      (SELECT COUNT(*) FROM merchant_settings) AS settings_count,
      (SELECT COUNT(*) FROM usage_stats) AS usage_count,
      (SELECT COUNT(*) FROM conversations) AS conversation_count
  `).get();

  return (
    Number(counts.session_count || 0) > 0 ||
    Number(counts.settings_count || 0) > 0 ||
    Number(counts.usage_count || 0) > 0 ||
    Number(counts.conversation_count || 0) > 0
  );
}

function loadLegacyStateFromSources(db, legacyJsonPath) {
  const defaults = createDefaultState();

  const legacyRow = db.prepare('SELECT value FROM app_state WHERE key = ?').get('global_state');
  if (legacyRow && typeof legacyRow.value === 'string') {
    const parsed = parseJson(legacyRow.value, defaults);
    return mergeStateWithDefaults(parsed);
  }

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

function hydrateStateFromTables(db) {
  const state = createDefaultState();

  const sessions = db.prepare(`
    SELECT shop, access_token, installed_at, synced_at, sync_warning, knowledge_sources
    FROM shopify_sessions
  `).all();

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

  const settings = db.prepare('SELECT shop, settings_json FROM merchant_settings').all();
  settings.forEach((row) => {
    state.merchantSettings[row.shop] = parseJson(row.settings_json, {});
  });

  const usageRows = db.prepare('SELECT shop, stats_json FROM usage_stats').all();
  usageRows.forEach((row) => {
    state.usageStats[row.shop] = parseJson(row.stats_json, {});
  });

  const conversationRows = db.prepare(`
    SELECT id, shop, question, reply, knowledge_source_count, channel, used_sources_json, grounding_json, created_at
    FROM conversations
    ORDER BY created_at DESC
  `).all();

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
      createdAt: row.created_at,
    });
  });

  return state;
}

function createPersistence({
  databasePath = process.env.DATABASE_PATH || defaultDatabasePath,
  legacyJsonPath = defaultLegacyJsonPath,
} = {}) {
  ensureDataDirectory();

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  createTables(db);

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
      id, shop, question, reply, knowledge_source_count, channel, used_sources_json, grounding_json, created_at
    ) VALUES (
      @id, @shop, @question, @reply, @knowledgeSourceCount, @channel, @usedSourcesJson, @groundingJson, @createdAt
    )
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
          groundingJson: JSON.stringify(entry?.grounding && typeof entry.grounding === 'object' ? entry.grounding : { label: 'Unknown', score: 0 }),
          createdAt: entry?.createdAt || updatedAt,
        });
      });
    });

    db.prepare(`
      INSERT INTO app_state (key, value, updated_at)
      VALUES (@key, @value, @updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run({
      key: 'storage_format',
      value: JSON.stringify({ version: 2, migratedAt: updatedAt }),
      updatedAt,
    });
  });

  const loadState = () => {
    if (hasNormalizedData(db)) {
      return hydrateStateFromTables(db);
    }

    const legacyState = loadLegacyStateFromSources(db, legacyJsonPath);
    writeState(legacyState);
    return hydrateStateFromTables(db);
  };

  const saveState = (state) => {
    writeState(state);
  };

  return {
    loadState,
    saveState,
    databasePath,
  };
}

module.exports = {
  createPersistence,
  defaultDatabasePath,
};
