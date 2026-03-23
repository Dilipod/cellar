//! CEL LLM Provider Layer
//!
//! Unified multi-provider LLM client for the Context Execution Layer.
//! Supports OpenAI, Anthropic, Google Gemini, and any OpenAI-compatible endpoint.

mod client;
mod config;
mod error;

pub use client::LlmClient;
pub use config::{LlmProviderConfig, ProviderKind};
pub use error::LlmError;

/// Content part in a chat message (text or image).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrlPayload },
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImageUrlPayload {
    pub url: String,
}

/// A single chat message.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Vec<ContentPart>,
}

impl ChatMessage {
    /// Create a text-only message.
    pub fn text(role: &str, text: &str) -> Self {
        Self {
            role: role.into(),
            content: vec![ContentPart::Text { text: text.into() }],
        }
    }

    /// Create a user message with an image (base64 data URL) and text prompt.
    pub fn image(data_url: &str, text: &str) -> Self {
        Self {
            role: "user".into(),
            content: vec![
                ContentPart::ImageUrl {
                    image_url: ImageUrlPayload {
                        url: data_url.into(),
                    },
                },
                ContentPart::Text { text: text.into() },
            ],
        }
    }
}

/// Encode raw bytes as base64.
pub fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Create an [`LlmClient`] from environment variables.
///
/// Reads `CEL_LLM_PROVIDER`, `CEL_LLM_API_KEY`, `CEL_LLM_MODEL`, and
/// `CEL_LLM_ENDPOINT`. Also falls back to provider-specific key vars like
/// `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.
///
/// Returns `LlmError::NotConfigured` if `CEL_LLM_PROVIDER` is not set.
pub fn create_client() -> Result<LlmClient, LlmError> {
    let config = LlmProviderConfig::from_env().ok_or(LlmError::NotConfigured)?;
    LlmClient::new(config)
}

/// Strip markdown code fences from an LLM response and return the inner content.
pub fn strip_code_fences(content: &str) -> &str {
    let s = content.trim();
    let s = s
        .strip_prefix("```json")
        .or_else(|| s.strip_prefix("```"))
        .unwrap_or(s);
    s.strip_suffix("```").unwrap_or(s).trim()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64_encode(b"Hello"), "SGVsbG8=");
        assert_eq!(base64_encode(b"Hi"), "SGk=");
        assert_eq!(base64_encode(b"abc"), "YWJj");
        assert_eq!(base64_encode(b""), "");
    }

    #[test]
    fn test_strip_code_fences_json() {
        let input = "```json\n[{\"key\": \"value\"}]\n```";
        assert_eq!(strip_code_fences(input), "[{\"key\": \"value\"}]");
    }

    #[test]
    fn test_strip_code_fences_plain() {
        let input = "```\nhello\n```";
        assert_eq!(strip_code_fences(input), "hello");
    }

    #[test]
    fn test_strip_code_fences_none() {
        let input = "[1, 2, 3]";
        assert_eq!(strip_code_fences(input), "[1, 2, 3]");
    }

    #[test]
    fn test_chat_message_text() {
        let msg = ChatMessage::text("system", "You are helpful.");
        assert_eq!(msg.role, "system");
        assert_eq!(msg.content.len(), 1);
    }

    #[test]
    fn test_chat_message_image() {
        let msg = ChatMessage::image("data:image/png;base64,abc", "Describe this.");
        assert_eq!(msg.role, "user");
        assert_eq!(msg.content.len(), 2);
    }
}
