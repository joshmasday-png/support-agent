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

function parseRowJson(row) {
  if (!row || typeof row.value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
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

function createPersistence({ databasePath = process.env.DATABASE_PATH || defaultDatabasePath, legacyJsonPath = defaultLegacyJsonPath } = {}) {
  ensureDataDirectory();

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const selectStateRow = db.prepare('SELECT value FROM app_state WHERE key = ?');
  const upsertStateRow = db.prepare(`
    INSERT INTO app_state (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  const loadState = () => {
    const row = selectStateRow.get('global_state');
    const persisted = parseRowJson(row);

    if (row) {
      return mergeStateWithDefaults(persisted);
    }

    if (fs.existsSync(legacyJsonPath)) {
      try {
        const raw = fs.readFileSync(legacyJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        const migrated = mergeStateWithDefaults(parsed);
        saveState(migrated);
        return migrated;
      } catch (error) {
        return createDefaultState();
      }
    }

    return createDefaultState();
  };

  const saveState = (state) => {
    const payload = {
      ...mergeStateWithDefaults(state),
      updatedAt: new Date().toISOString(),
    };

    upsertStateRow.run({
      key: 'global_state',
      value: JSON.stringify(payload),
      updatedAt: payload.updatedAt,
    });
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
