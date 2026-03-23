use crate::config::{LlmProviderConfig, ProviderKind};
use crate::error::LlmError;
use crate::ChatMessage;

/// Wire types for the OpenAI-compatible chat completions API.
#[derive(serde::Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
}

#[derive(serde::Deserialize)]
struct ChatResponse {
    choices: Option<Vec<Choice>>,
}

#[derive(serde::Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(serde::Deserialize)]
struct ChoiceMessage {
    content: String,
}

/// Wire types for the Anthropic Messages API.
#[derive(serde::Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<AnthropicMessage>,
}

#[derive(serde::Serialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContent>,
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
enum AnthropicContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: AnthropicImageSource },
}

#[derive(serde::Serialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

#[derive(serde::Deserialize)]
struct AnthropicResponse {
    content: Option<Vec<AnthropicResponseContent>>,
}

#[derive(serde::Deserialize)]
struct AnthropicResponseContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

/// Reusable LLM client that speaks both the OpenAI-compatible chat completions
/// protocol and the Anthropic Messages API.
pub struct LlmClient {
    config: LlmProviderConfig,
    http: reqwest::Client,
    endpoint: String,
    model: String,
}

impl LlmClient {
    /// Create a new client from config.
    pub fn new(config: LlmProviderConfig) -> Result<Self, LlmError> {
        let endpoint = config.resolved_endpoint().to_string();
        let model = config.resolved_model().to_string();

        if endpoint.is_empty() {
            return Err(LlmError::NotConfigured);
        }

        Ok(Self {
            config,
            http: reqwest::Client::new(),
            endpoint,
            model,
        })
    }

    /// Provider name for logging.
    pub fn provider_name(&self) -> String {
        self.config.provider.to_string()
    }

    /// The resolved model name.
    pub fn model(&self) -> &str {
        &self.model
    }

    /// Whether this client targets the Anthropic Messages API.
    fn is_anthropic(&self) -> bool {
        self.config.provider == ProviderKind::Anthropic
    }

    /// Send a chat completion request with arbitrary messages.
    pub async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        max_tokens: u32,
    ) -> Result<String, LlmError> {
        if self.is_anthropic() {
            self.chat_anthropic(messages, max_tokens).await
        } else {
            self.chat_openai(messages, max_tokens).await
        }
    }

    /// OpenAI-compatible chat completions path.
    async fn chat_openai(
        &self,
        messages: Vec<ChatMessage>,
        max_tokens: u32,
    ) -> Result<String, LlmError> {
        let request = ChatRequest {
            model: self.model.clone(),
            messages,
            max_tokens,
        };

        let api_key = self.config.api_key.as_deref().unwrap_or("");

        let resp = self
            .http
            .post(&self.endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request)
            .send()
            .await
            .map_err(|e| LlmError::RequestFailed(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(LlmError::HttpError { status, body });
        }

        let chat_resp: ChatResponse = resp
            .json()
            .await
            .map_err(|e| LlmError::ParseError(e.to_string()))?;

        Ok(chat_resp
            .choices
            .and_then(|c| c.into_iter().next())
            .map(|c| c.message.content)
            .unwrap_or_default())
    }

    /// Anthropic Messages API path.
    async fn chat_anthropic(
        &self,
        messages: Vec<ChatMessage>,
        max_tokens: u32,
    ) -> Result<String, LlmError> {
        let api_key = self.config.api_key.as_deref().unwrap_or("");

        // Extract system message (Anthropic uses a top-level `system` field)
        let mut system_prompt: Option<String> = None;
        let mut user_messages = Vec::new();

        for msg in messages {
            if msg.role == "system" {
                // Concatenate system messages
                let text = msg
                    .content
                    .into_iter()
                    .filter_map(|c| match c {
                        crate::ContentPart::Text { text } => Some(text),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                system_prompt = Some(match system_prompt {
                    Some(existing) => format!("{}\n{}", existing, text),
                    None => text,
                });
            } else {
                // Convert ContentParts to Anthropic format
                let content = msg
                    .content
                    .into_iter()
                    .map(|c| match c {
                        crate::ContentPart::Text { text } => AnthropicContent::Text { text },
                        crate::ContentPart::ImageUrl { image_url } => {
                            // Parse data URL: data:image/png;base64,<data>
                            let (media_type, data) = parse_data_url(&image_url.url);
                            AnthropicContent::Image {
                                source: AnthropicImageSource {
                                    source_type: "base64".to_string(),
                                    media_type,
                                    data,
                                },
                            }
                        }
                    })
                    .collect();

                user_messages.push(AnthropicMessage {
                    role: msg.role,
                    content,
                });
            }
        }

        let request = AnthropicRequest {
            model: self.model.clone(),
            max_tokens,
            system: system_prompt,
            messages: user_messages,
        };

        let resp = self
            .http
            .post(&self.endpoint)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| LlmError::RequestFailed(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(LlmError::HttpError { status, body });
        }

        let anthropic_resp: AnthropicResponse = resp
            .json()
            .await
            .map_err(|e| LlmError::ParseError(e.to_string()))?;

        Ok(anthropic_resp
            .content
            .unwrap_or_default()
            .into_iter()
            .filter(|c| c.content_type == "text")
            .filter_map(|c| c.text)
            .collect::<Vec<_>>()
            .join(""))
    }

    /// Send a text-only chat completion (system + user prompt).
    pub async fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String, LlmError> {
        let messages = vec![
            ChatMessage::text("system", system_prompt),
            ChatMessage::text("user", user_prompt),
        ];
        self.chat(messages, max_tokens).await
    }

    /// Send a chat completion with an image (system prompt + image + user prompt).
    pub async fn complete_with_image(
        &self,
        system_prompt: &str,
        image_data_url: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String, LlmError> {
        let messages = vec![
            ChatMessage::text("system", system_prompt),
            ChatMessage::image(image_data_url, user_prompt),
        ];
        self.chat(messages, max_tokens).await
    }
}

/// Parse a data URL into (media_type, base64_data).
fn parse_data_url(url: &str) -> (String, String) {
    // Format: data:image/png;base64,<data>
    if let Some(rest) = url.strip_prefix("data:") {
        if let Some((header, data)) = rest.split_once(',') {
            let media_type = header
                .strip_suffix(";base64")
                .unwrap_or(header)
                .to_string();
            return (media_type, data.to_string());
        }
    }
    ("image/png".to_string(), url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let config = LlmProviderConfig {
            provider: ProviderKind::OpenAI,
            endpoint: None,
            api_key: Some("sk-test".into()),
            model: None,
        };
        let client = LlmClient::new(config).unwrap();
        assert_eq!(client.model(), "gpt-4o");
        assert!(!client.is_anthropic());
    }

    #[test]
    fn test_client_anthropic() {
        let config = LlmProviderConfig {
            provider: ProviderKind::Anthropic,
            endpoint: None,
            api_key: Some("sk-ant-test".into()),
            model: None,
        };
        let client = LlmClient::new(config).unwrap();
        assert_eq!(client.model(), "claude-sonnet-4-20250514");
        assert!(client.is_anthropic());
    }

    #[test]
    fn test_client_not_configured() {
        let config = LlmProviderConfig {
            provider: ProviderKind::Custom,
            endpoint: None,
            api_key: None,
            model: None,
        };
        assert!(LlmClient::new(config).is_err());
    }

    #[test]
    fn test_client_custom_endpoint() {
        let config = LlmProviderConfig {
            provider: ProviderKind::Custom,
            endpoint: Some("http://localhost:11434/v1/chat/completions".into()),
            api_key: None,
            model: Some("llama3".into()),
        };
        let client = LlmClient::new(config).unwrap();
        assert_eq!(client.model(), "llama3");
    }

    #[test]
    fn test_parse_data_url() {
        let (media, data) = parse_data_url("data:image/png;base64,abc123");
        assert_eq!(media, "image/png");
        assert_eq!(data, "abc123");
    }

    #[test]
    fn test_parse_data_url_jpeg() {
        let (media, data) = parse_data_url("data:image/jpeg;base64,xyz");
        assert_eq!(media, "image/jpeg");
        assert_eq!(data, "xyz");
    }

    #[test]
    fn test_parse_data_url_fallback() {
        let (media, data) = parse_data_url("raw_base64_data");
        assert_eq!(media, "image/png");
        assert_eq!(data, "raw_base64_data");
    }
}
