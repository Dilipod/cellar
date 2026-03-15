//! CEL Store
//!
//! Embedded SQLite database for persisting agent memory, context maps,
//! run history, confidence data, and learned knowledge.

mod schema;

pub use schema::CelStore;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Store not initialized")]
    NotInitialized,
}
