//! CEL Vision Layer
//!
//! Multi-provider vision model integration. Supports Gemini, GPT-4o, Claude,
//! HuggingFace (local), and any OpenAI-compatible endpoint.
//!
//! Vision is only invoked when the accessibility tree and native APIs
//! cannot provide sufficient context.

mod provider;

pub use provider::{VisionElement, VisionError, VisionProvider, VisionProviderConfig};
