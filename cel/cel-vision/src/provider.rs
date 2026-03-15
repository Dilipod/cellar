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

/// Configuration for a vision provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionProviderConfig {
    /// Provider type: "gemini", "openai", "anthropic", "huggingface", "custom"
    pub provider: String,
    /// API endpoint URL.
    pub endpoint: Option<String>,
    /// API key (loaded from env or credential store).
    pub api_key: Option<String>,
    /// Model name/ID.
    pub model: Option<String>,
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
