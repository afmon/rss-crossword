import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'crossword.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export async function initializeDatabase(): Promise<Database.Database> {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Open database
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run migrations
  runMigrations(db);

  return db;
}

function runMigrations(db: Database.Database): void {
  const version = getSchemaVersion(db);

  if (version < 1) {
    migrateToV1(db);
  }
  if (version < 2) {
    migrateToV2(db);
  }
  if (version < 3) {
    migrateToV3(db);
  }
  if (version < 4) {
    migrateToV4(db);
  }
  if (version < 5) {
    migrateToV5(db);
  }
}

function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function migrateToV1(db: Database.Database): void {
  console.log('Running migration: v1 (initial schema)');

  db.exec(`
    -- Meta table for schema versioning
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Folders for organizing feeds
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- RSS feed subscriptions
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      site_url TEXT,
      favicon_url TEXT,
      description TEXT,
      last_fetched_at TEXT,
      last_error TEXT,
      fetch_interval_minutes INTEGER DEFAULT 60,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Articles from feeds
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT NOT NULL,
      author TEXT,
      published_at TEXT,
      fetched_at TEXT DEFAULT (datetime('now')),
      summary TEXT,
      content TEXT,
      content_hash TEXT,
      is_read INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      read_at TEXT,
      favorite_at TEXT,
      word_count INTEGER,
      reading_time_minutes INTEGER,
      thumbnail_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(feed_id, guid)
    );

    -- Tags for articles
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#10b981',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Article-Tag junction table
    CREATE TABLE IF NOT EXISTS article_tags (
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (article_id, tag_id)
    );

    -- Crossword puzzles
    CREATE TABLE IF NOT EXISTS puzzles (
      id TEXT PRIMARY KEY,
      title TEXT,
      size INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      grid_json TEXT NOT NULL,
      words_json TEXT NOT NULL,
      clues_json TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      word_count INTEGER,
      difficulty_score REAL,
      data_range_days INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Link puzzles to source articles
    CREATE TABLE IF NOT EXISTS puzzle_articles (
      puzzle_id TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      word_answer TEXT,
      PRIMARY KEY (puzzle_id, article_id)
    );

    -- Puzzle play attempts
    CREATE TABLE IF NOT EXISTS puzzle_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      puzzle_id TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      progress_json TEXT,
      hints_used INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      incorrect_count INTEGER DEFAULT 0,
      completion_percentage REAL,
      time_spent_seconds INTEGER,
      is_completed INTEGER DEFAULT 0,
      final_score INTEGER
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_feeds_folder ON feeds(folder_id);
    CREATE INDEX IF NOT EXISTS idx_feeds_active ON feeds(is_active);
    CREATE INDEX IF NOT EXISTS idx_articles_feed ON articles(feed_id);
    CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read);
    CREATE INDEX IF NOT EXISTS idx_articles_favorite ON articles(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link);
    CREATE INDEX IF NOT EXISTS idx_puzzles_created ON puzzles(created_at DESC);

    -- Set schema version
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1');
  `);

  console.log('Migration v1 complete');
}

function migrateToV2(db: Database.Database): void {
  console.log('Running migration: v2 (add is_ai_processed)');

  db.exec(`
    ALTER TABLE articles ADD COLUMN is_ai_processed INTEGER DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_articles_ai_processed ON articles(is_ai_processed);
    UPDATE meta SET value = '2' WHERE key = 'schema_version';
  `);

  console.log('Migration v2 complete');
}

function migrateToV3(db: Database.Database): void {
  console.log('Running migration: v3 (add is_content_truncated)');

  db.exec(`
    ALTER TABLE articles ADD COLUMN is_content_truncated INTEGER DEFAULT 0;
    UPDATE meta SET value = '3' WHERE key = 'schema_version';
  `);

  console.log('Migration v3 complete');
}

function migrateToV4(db: Database.Database): void {
  console.log('Running migration: v4 (add content_html for HTML extraction)');

  db.exec(`
    ALTER TABLE articles ADD COLUMN content_html TEXT;
    UPDATE meta SET value = '4' WHERE key = 'schema_version';
  `);

  console.log('Migration v4 complete');
}

function migrateToV5(db: Database.Database): void {
  console.log('Running migration: v5 (add settings table)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    UPDATE meta SET value = '5' WHERE key = 'schema_version';
  `);

  console.log('Migration v5 complete');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
