use crate::StoreError;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// The main CEL Store handle.
pub struct CelStore {
    conn: Connection,
}

/// A fact stored in the agent knowledge layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeFact {
    pub id: i64,
    pub content: String,
    pub source: String,
    pub created_at: String,
}

/// A run history entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunRecord {
    pub id: i64,
    pub workflow_name: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,
    pub steps_completed: u32,
    pub steps_total: u32,
    pub interventions: u32,
}

impl CelStore {
    /// Open or create a CEL Store database at the given path.
    pub fn open(path: &str) -> Result<Self, StoreError> {
        let conn = Connection::open(path)?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    /// Open an in-memory database (for testing).
    pub fn open_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    /// Run database migrations.
    fn migrate(&self) -> Result<(), StoreError> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS context_maps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_name TEXT NOT NULL,
                app_name TEXT NOT NULL,
                element_map TEXT NOT NULL, -- JSON
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS run_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_name TEXT NOT NULL,
                started_at TEXT DEFAULT (datetime('now')),
                finished_at TEXT,
                status TEXT NOT NULL DEFAULT 'running',
                steps_completed INTEGER DEFAULT 0,
                steps_total INTEGER DEFAULT 0,
                interventions INTEGER DEFAULT 0,
                log TEXT -- JSON array of step logs
            );

            CREATE TABLE IF NOT EXISTS confidence_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                element_id TEXT NOT NULL,
                app_name TEXT NOT NULL,
                confidence REAL NOT NULL,
                source TEXT NOT NULL,
                recorded_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS agent_knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                source TEXT NOT NULL,
                tags TEXT, -- comma-separated
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS interventions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER REFERENCES run_history(id),
                step_index INTEGER NOT NULL,
                agent_context TEXT NOT NULL, -- JSON: what the agent saw
                user_action TEXT NOT NULL, -- JSON: what the user did
                correct_action TEXT, -- JSON: derived correct action
                recorded_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS workflow_state (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_name TEXT NOT NULL UNIQUE,
                current_step INTEGER DEFAULT 0,
                state TEXT NOT NULL DEFAULT 'idle', -- idle, running, paused, queued
                queue_priority INTEGER DEFAULT 0,
                context TEXT, -- JSON: serialized execution context
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS credential_refs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                store_type TEXT NOT NULL, -- 'env', 'keychain', 'vault'
                reference TEXT NOT NULL, -- env var name or keychain entry
                created_at TEXT DEFAULT (datetime('now'))
            );
            ",
        )?;
        Ok(())
    }

    /// Store a knowledge fact.
    pub fn add_knowledge(&self, content: &str, source: &str) -> Result<i64, StoreError> {
        self.conn.execute(
            "INSERT INTO agent_knowledge (content, source) VALUES (?1, ?2)",
            rusqlite::params![content, source],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Query knowledge facts by keyword search.
    pub fn query_knowledge(&self, query: &str) -> Result<Vec<KnowledgeFact>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, source, created_at FROM agent_knowledge WHERE content LIKE ?1",
        )?;
        let pattern = format!("%{}%", query);
        let rows = stmt.query_map(rusqlite::params![pattern], |row| {
            Ok(KnowledgeFact {
                id: row.get(0)?,
                content: row.get(1)?,
                source: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        let mut facts = Vec::new();
        for row in rows {
            facts.push(row?);
        }
        Ok(facts)
    }

    /// Record a new workflow run.
    pub fn start_run(&self, workflow_name: &str, steps_total: u32) -> Result<i64, StoreError> {
        self.conn.execute(
            "INSERT INTO run_history (workflow_name, status, steps_total) VALUES (?1, 'running', ?2)",
            rusqlite::params![workflow_name, steps_total],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Complete a workflow run.
    pub fn finish_run(&self, run_id: i64, status: &str) -> Result<(), StoreError> {
        self.conn.execute(
            "UPDATE run_history SET status = ?1, finished_at = datetime('now') WHERE id = ?2",
            rusqlite::params![status, run_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_open_and_migrate() {
        let store = CelStore::open_memory().expect("Failed to open in-memory store");
        // Verify tables exist by inserting
        store.add_knowledge("test fact", "test").expect("Failed to add knowledge");
    }

    #[test]
    fn test_knowledge_roundtrip() {
        let store = CelStore::open_memory().unwrap();
        store.add_knowledge("Vendor X maps to code 10045", "manual").unwrap();
        store.add_knowledge("Vendor Y requires approval over 50000", "learned").unwrap();

        let results = store.query_knowledge("Vendor").unwrap();
        assert_eq!(results.len(), 2);
        assert!(results[0].content.contains("Vendor"));
    }

    #[test]
    fn test_run_tracking() {
        let store = CelStore::open_memory().unwrap();
        let run_id = store.start_run("daily-po", 5).unwrap();
        assert!(run_id > 0);
        store.finish_run(run_id, "completed").unwrap();
    }
}
