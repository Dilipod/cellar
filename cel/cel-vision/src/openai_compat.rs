use async_trait::async_trait;
use cel_display::{encode_png, Frame};
use serde::{Deserialize, Serialize};

use crate::provider::{VisionElement, VisionError, VisionProvider, VisionProviderConfig};

/// Default endpoints per provider.
fn default_endpoint(provider: &str) -> &str {
    match provider {
        "openai" => "https://api.openai.com/v1/chat/completions",
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "anthropic" | "claude" => "https://api.anthropic.com/v1/messages",
        _ => "",
    }
}

fn default_model(provider: &str) -> &str {
    match provider {
        "openai" => "gpt-4o",
        "gemini" => "gemini-2.0-flash",
        "anthropic" | "claude" => "claude-sonnet-4-20250514",
        _ => "",
    }
}

/// Vision provider using OpenAI-compatible chat completions API.
/// Works with OpenAI, Gemini (via OpenAI compat), and custom endpoints.
pub struct OpenAICompatProvider {
    config: VisionProviderConfig,
    client: reqwest::Client,
    endpoint: String,
    model: String,
}

impl OpenAICompatProvider {
    pub fn new(config: VisionProviderConfig) -> Result<Self, VisionError> {
        let endpoint = config
            .endpoint
            .clone()
            .unwrap_or_else(|| default_endpoint(&config.provider).to_string());
        let model = config
            .model
            .clone()
            .unwrap_or_else(|| default_model(&config.provider).to_string());

        if endpoint.is_empty() {
            return Err(VisionError::NotConfigured);
        }

        let client = reqwest::Client::new();
        Ok(Self {
            config,
            client,
            endpoint,
            model,
        })
    }
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: Vec<ContentPart>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrl },
}

#[derive(Serialize)]
struct ImageUrl {
    url: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Option<Vec<Choice>>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: String,
}

/// System prompt instructing the model to return structured UI element data.
const VISION_SYSTEM_PROMPT: &str = r#"You are a UI element detector. Analyze the screenshot and identify all visible UI elements.
Return a JSON array of objects with these fields:
- "label": the visible text or description of the element
- "element_type": one of "button", "input", "text", "link", "checkbox", "dropdown", "menu", "tab", "icon", "image", "dialog", "other"
- "bounds": {"x": int, "y": int, "width": int, "height": int} in pixel coordinates from top-left, or null if uncertain
- "confidence": float 0.0-1.0 indicating how confident you are

Return ONLY the JSON array, no other text."#;

#[async_trait]
impl VisionProvider for OpenAICompatProvider {
    async fn analyze(
        &self,
        frame: &Frame,
        prompt: &str,
    ) -> Result<Vec<VisionElement>, VisionError> {
        // Encode frame as PNG then base64
        let png_data = encode_png(frame).map_err(|e| VisionError::EncodeFailed(e.to_string()))?;
        let b64 = base64_encode(&png_data);
        let data_url = format!("data:image/png;base64,{}", b64);

        let user_prompt = if prompt.is_empty() {
            "Identify all UI elements in this screenshot.".to_string()
        } else {
            prompt.to_string()
        };

        let request = ChatRequest {
            model: self.model.clone(),
            messages: vec![
                ChatMessage {
                    role: "system".into(),
                    content: vec![ContentPart::Text {
                        text: VISION_SYSTEM_PROMPT.into(),
                    }],
                },
                ChatMessage {
                    role: "user".into(),
                    content: vec![
                        ContentPart::ImageUrl {
                            image_url: ImageUrl { url: data_url },
                        },
                        ContentPart::Text { text: user_prompt },
                    ],
                },
            ],
            max_tokens: 4096,
        };

        let api_key = self.config.api_key.as_deref().unwrap_or("");

        let resp = self
            .client
            .post(&self.endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request)
            .send()
            .await
            .map_err(|e| VisionError::ApiFailed(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(VisionError::ApiFailed(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let chat_resp: ChatResponse = resp
            .json()
            .await
            .map_err(|e| VisionError::ApiFailed(e.to_string()))?;

        let content = chat_resp
            .choices
            .and_then(|c| c.into_iter().next())
            .map(|c| c.message.content)
            .unwrap_or_default();

        // Parse the JSON array from the response
        parse_vision_elements(&content)
    }

    fn name(&self) -> &str {
        &self.config.provider
    }
}

fn base64_encode(data: &[u8]) -> String {
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

fn parse_vision_elements(content: &str) -> Result<Vec<VisionElement>, VisionError> {
    // Try to extract JSON array from response (may be wrapped in markdown code blocks)
    let json_str = content
        .trim()
        .strip_prefix("```json")
        .or_else(|| content.trim().strip_prefix("```"))
        .unwrap_or(content.trim());
    let json_str = json_str
        .strip_suffix("```")
        .unwrap_or(json_str)
        .trim();

    serde_json::from_str::<Vec<VisionElement>>(json_str)
        .map_err(|e| VisionError::ApiFailed(format!("Failed to parse vision response: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_vision_elements() {
        let json = r#"[
            {"label": "Submit", "element_type": "button", "bounds": {"x": 100, "y": 200, "width": 80, "height": 30}, "confidence": 0.95},
            {"label": "Username", "element_type": "input", "bounds": null, "confidence": 0.8}
        ]"#;
        let elements = parse_vision_elements(json).unwrap();
        assert_eq!(elements.len(), 2);
        assert_eq!(elements[0].label, "Submit");
        assert_eq!(elements[0].element_type, "button");
        assert!(elements[0].bounds.is_some());
        assert_eq!(elements[1].label, "Username");
        assert!(elements[1].bounds.is_none());
    }

    #[test]
    fn test_parse_vision_elements_markdown_wrapped() {
        let json = "```json\n[{\"label\": \"OK\", \"element_type\": \"button\", \"bounds\": null, \"confidence\": 0.9}]\n```";
        let elements = parse_vision_elements(json).unwrap();
        assert_eq!(elements.len(), 1);
    }

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64_encode(b"Hello"), "SGVsbG8=");
        assert_eq!(base64_encode(b"Hi"), "SGk=");
        assert_eq!(base64_encode(b"abc"), "YWJj");
    }
}
