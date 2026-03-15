//! CEL Vision Layer
//!
//! Multi-provider vision model integration. Supports Gemini, GPT-4o, Claude,
//! HuggingFace (local), and any OpenAI-compatible endpoint.
//!
//! Vision is only invoked when the accessibility tree and native APIs
//! cannot provide sufficient context.

mod provider;
mod openai_compat;

pub use provider::{VisionBounds, VisionElement, VisionError, VisionProvider, VisionProviderConfig};
pub use openai_compat::OpenAICompatProvider;

/// Create a vision provider from configuration.
pub fn create_provider(config: VisionProviderConfig) -> Result<Box<dyn VisionProvider>, VisionError> {
    match config.provider.as_str() {
        "openai" | "gemini" | "custom" => Ok(Box::new(OpenAICompatProvider::new(config)?)),
        "anthropic" | "claude" => Ok(Box::new(OpenAICompatProvider::new(config)?)),
        "huggingface" => Ok(Box::new(OpenAICompatProvider::new(config)?)),
        _ => Err(VisionError::NotConfigured),
    }
}
