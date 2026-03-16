#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("LLM provider not configured")]
    NotConfigured,
    #[error("LLM API call failed: {0}")]
    RequestFailed(String),
    #[error("LLM returned HTTP {status}: {body}")]
    HttpError { status: u16, body: String },
    #[error("Failed to parse LLM response: {0}")]
    ParseError(String),
}
