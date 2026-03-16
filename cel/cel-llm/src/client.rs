use crate::config::LlmProviderConfig;
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

/// Reusable LLM client that speaks the OpenAI-compatible chat completions protocol.
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

    /// Send a chat completion request with arbitrary messages.
    pub async fn chat(
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ProviderKind;

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
}
