use serde::{Deserialize, Serialize};

/// Known LLM provider kinds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    OpenAI,
    Gemini,
    Anthropic,
    HuggingFace,
    Custom,
}

impl ProviderKind {
    /// Default API endpoint for this provider.
    pub fn default_endpoint(&self) -> &str {
        match self {
            Self::OpenAI => "https://api.openai.com/v1/chat/completions",
            Self::Gemini => {
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            }
            Self::Anthropic => "https://api.anthropic.com/v1/messages",
            Self::HuggingFace | Self::Custom => "",
        }
    }

    /// Default model for this provider.
    pub fn default_model(&self) -> &str {
        match self {
            Self::OpenAI => "gpt-4o",
            Self::Gemini => "gemini-2.0-flash",
            Self::Anthropic => "claude-sonnet-4-20250514",
            Self::HuggingFace | Self::Custom => "",
        }
    }
}

impl std::fmt::Display for ProviderKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::OpenAI => write!(f, "openai"),
            Self::Gemini => write!(f, "gemini"),
            Self::Anthropic => write!(f, "anthropic"),
            Self::HuggingFace => write!(f, "huggingface"),
            Self::Custom => write!(f, "custom"),
        }
    }
}

/// Parse a provider string into a ProviderKind.
impl From<&str> for ProviderKind {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "openai" => Self::OpenAI,
            "gemini" => Self::Gemini,
            "anthropic" | "claude" => Self::Anthropic,
            "huggingface" | "hf" => Self::HuggingFace,
            _ => Self::Custom,
        }
    }
}

/// Configuration for an LLM provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProviderConfig {
    /// Provider kind.
    pub provider: ProviderKind,
    /// API endpoint URL. Falls back to the provider's default if unset.
    pub endpoint: Option<String>,
    /// API key.
    pub api_key: Option<String>,
    /// Model name/ID. Falls back to the provider's default if unset.
    pub model: Option<String>,
}

impl LlmProviderConfig {
    /// Resolve the endpoint, falling back to provider default.
    pub fn resolved_endpoint(&self) -> &str {
        self.endpoint
            .as_deref()
            .unwrap_or_else(|| self.provider.default_endpoint())
    }

    /// Resolve the model, falling back to provider default.
    pub fn resolved_model(&self) -> &str {
        self.model
            .as_deref()
            .unwrap_or_else(|| self.provider.default_model())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_kind_from_str() {
        assert_eq!(ProviderKind::from("openai"), ProviderKind::OpenAI);
        assert_eq!(ProviderKind::from("OpenAI"), ProviderKind::OpenAI);
        assert_eq!(ProviderKind::from("gemini"), ProviderKind::Gemini);
        assert_eq!(ProviderKind::from("anthropic"), ProviderKind::Anthropic);
        assert_eq!(ProviderKind::from("claude"), ProviderKind::Anthropic);
        assert_eq!(ProviderKind::from("huggingface"), ProviderKind::HuggingFace);
        assert_eq!(ProviderKind::from("hf"), ProviderKind::HuggingFace);
        assert_eq!(ProviderKind::from("ollama"), ProviderKind::Custom);
    }

    #[test]
    fn test_provider_defaults() {
        assert!(!ProviderKind::OpenAI.default_endpoint().is_empty());
        assert!(!ProviderKind::OpenAI.default_model().is_empty());
        assert!(ProviderKind::Custom.default_endpoint().is_empty());
    }

    #[test]
    fn test_config_resolved() {
        let config = LlmProviderConfig {
            provider: ProviderKind::OpenAI,
            endpoint: None,
            api_key: Some("sk-test".into()),
            model: None,
        };
        assert_eq!(
            config.resolved_endpoint(),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(config.resolved_model(), "gpt-4o");

        let custom = LlmProviderConfig {
            provider: ProviderKind::OpenAI,
            endpoint: Some("http://localhost:8080/v1/chat/completions".into()),
            api_key: None,
            model: Some("local-model".into()),
        };
        assert_eq!(
            custom.resolved_endpoint(),
            "http://localhost:8080/v1/chat/completions"
        );
        assert_eq!(custom.resolved_model(), "local-model");
    }
}
