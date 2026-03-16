use async_trait::async_trait;
use cel_display::Frame;
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum VisionError {
    #[error("Vision provider not configured")]
    NotConfigured,
    #[error("Vision API call failed: {0}")]
    ApiFailed(String),
    #[error("Failed to encode frame: {0}")]
    EncodeFailed(String),
}

impl From<cel_llm::LlmError> for VisionError {
    fn from(e: cel_llm::LlmError) -> Self {
        match e {
            cel_llm::LlmError::NotConfigured => VisionError::NotConfigured,
            other => VisionError::ApiFailed(other.to_string()),
        }
    }
}

/// An element detected by the vision model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionElement {
    /// Detected label/text.
    pub label: String,
    /// Detected element type (button, input, text, etc.).
    pub element_type: String,
    /// Bounding box in screen coordinates.
    pub bounds: Option<VisionBounds>,
    /// Confidence score (0.0 - 1.0).
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Trait for vision model providers.
#[async_trait]
pub trait VisionProvider: Send + Sync {
    /// Analyze a screenshot and return detected UI elements.
    async fn analyze(
        &self,
        frame: &Frame,
        prompt: &str,
    ) -> Result<Vec<VisionElement>, VisionError>;

    /// Provider name for logging.
    fn name(&self) -> &str;
}
