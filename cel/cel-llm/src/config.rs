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

/// Model capability tier — determines prompt complexity and context budget.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    /// Small/fast models (gemini-flash, gpt-4o-mini, haiku). Short prompts, aggressive filtering.
    Flash,
    /// Standard models (gpt-4o, claude-sonnet, gemini-pro). Default behavior.
    Standard,
    /// Premium models (claude-opus, o3, gpt-5). Extended prompts, more context.
    Premium,
}

impl Default for ModelTier {
    fn default() -> Self {
        Self::Standard
    }
}

/// Profile describing a model's capabilities.
#[derive(Debug, Clone)]
pub struct ModelProfile {
    pub provider: ProviderKind,
    pub model_id: String,
    pub tier: ModelTier,
}

impl ModelProfile {
    /// Infer a model profile from a model ID string.
    pub fn from_model_id(model_id: &str) -> Self {
        let lower = model_id.to_lowercase();
        let provider = if lower.contains("claude") || lower.contains("anthropic") {
            ProviderKind::Anthropic
        } else if lower.contains("gemini") {
            ProviderKind::Gemini
        } else if lower.contains("gpt") || lower.contains("o1") || lower.contains("o3") {
            ProviderKind::OpenAI
        } else {
            ProviderKind::Custom
        };

        let tier = if lower.contains("flash")
            || lower.contains("mini")
            || lower.contains("haiku")
            || lower.contains("nano")
        {
            ModelTier::Flash
        } else if lower.contains("opus")
            || lower.contains("o3")
            || lower.contains("gpt-5")
            || lower.contains("pro")
        {
            ModelTier::Premium
        } else {
            ModelTier::Standard
        };

        ModelProfile {
            provider,
            model_id: model_id.to_string(),
            tier,
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
    /// Build configuration from environment variables.
    ///
    /// Reads the following env vars:
    /// - `CEL_LLM_PROVIDER` — provider name (openai, anthropic, gemini, huggingface, custom)
    /// - `CEL_LLM_MODEL` — model name/ID override
    /// - `CEL_LLM_API_KEY` — API key (falls back to provider-specific vars below)
    /// - `CEL_LLM_ENDPOINT` — custom endpoint URL override
    ///
    /// Provider-specific API key fallbacks (checked when `CEL_LLM_API_KEY` is unset):
    /// - `OPENAI_API_KEY`
    /// - `ANTHROPIC_API_KEY`
    /// - `GEMINI_API_KEY`
    /// - `HUGGINGFACE_API_KEY` / `HF_API_KEY`
    ///
    /// Returns `None` if `CEL_LLM_PROVIDER` is not set.
    pub fn from_env() -> Option<Self> {
        let provider_str = std::env::var("CEL_LLM_PROVIDER").ok()?;
        let provider = ProviderKind::from(provider_str.as_str());

        let api_key = std::env::var("CEL_LLM_API_KEY")
            .ok()
            .or_else(|| Self::provider_specific_key(&provider));

        Some(Self {
            provider,
            endpoint: std::env::var("CEL_LLM_ENDPOINT").ok(),
            api_key,
            model: std::env::var("CEL_LLM_MODEL").ok(),
        })
    }

    /// Look up provider-specific API key env vars.
    fn provider_specific_key(provider: &ProviderKind) -> Option<String> {
        match provider {
            ProviderKind::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
            ProviderKind::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
            ProviderKind::Gemini => std::env::var("GEMINI_API_KEY").ok(),
            ProviderKind::HuggingFace => std::env::var("HUGGINGFACE_API_KEY")
                .or_else(|_| std::env::var("HF_API_KEY"))
                .ok(),
            ProviderKind::Custom => None,
        }
    }

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
    fn test_from_env_not_set() {
        // CEL_LLM_PROVIDER not set → None
        std::env::remove_var("CEL_LLM_PROVIDER");
        assert!(LlmProviderConfig::from_env().is_none());
    }

    #[test]
    fn test_from_env_basic() {
        std::env::set_var("CEL_LLM_PROVIDER", "openai");
        std::env::set_var("CEL_LLM_API_KEY", "sk-env-test");
        std::env::set_var("CEL_LLM_MODEL", "gpt-4o-mini");
        std::env::remove_var("CEL_LLM_ENDPOINT");

        let config = LlmProviderConfig::from_env().unwrap();
        assert_eq!(config.provider, ProviderKind::OpenAI);
        assert_eq!(config.api_key.as_deref(), Some("sk-env-test"));
        assert_eq!(config.model.as_deref(), Some("gpt-4o-mini"));
        assert!(config.endpoint.is_none());

        // Cleanup
        std::env::remove_var("CEL_LLM_PROVIDER");
        std::env::remove_var("CEL_LLM_API_KEY");
        std::env::remove_var("CEL_LLM_MODEL");
    }

    #[test]
    fn test_from_env_provider_specific_key() {
        std::env::set_var("CEL_LLM_PROVIDER", "anthropic");
        std::env::remove_var("CEL_LLM_API_KEY");
        std::env::set_var("ANTHROPIC_API_KEY", "sk-ant-fallback");

        let config = LlmProviderConfig::from_env().unwrap();
        assert_eq!(config.provider, ProviderKind::Anthropic);
        assert_eq!(config.api_key.as_deref(), Some("sk-ant-fallback"));

        std::env::remove_var("CEL_LLM_PROVIDER");
        std::env::remove_var("ANTHROPIC_API_KEY");
    }

    #[test]
    fn test_model_tier_flash() {
        assert_eq!(ModelProfile::from_model_id("gemini-2.0-flash").tier, ModelTier::Flash);
        assert_eq!(ModelProfile::from_model_id("gpt-4o-mini").tier, ModelTier::Flash);
        assert_eq!(ModelProfile::from_model_id("claude-haiku-4-5").tier, ModelTier::Flash);
    }

    #[test]
    fn test_model_tier_standard() {
        assert_eq!(ModelProfile::from_model_id("gpt-4o").tier, ModelTier::Standard);
        assert_eq!(ModelProfile::from_model_id("claude-sonnet-4-20250514").tier, ModelTier::Standard);
    }

    #[test]
    fn test_model_tier_premium() {
        assert_eq!(ModelProfile::from_model_id("claude-opus-4-6").tier, ModelTier::Premium);
        assert_eq!(ModelProfile::from_model_id("o3").tier, ModelTier::Premium);
        assert_eq!(ModelProfile::from_model_id("gpt-5").tier, ModelTier::Premium);
    }

    #[test]
    fn test_model_profile_provider_detection() {
        assert_eq!(ModelProfile::from_model_id("claude-sonnet-4").provider, ProviderKind::Anthropic);
        assert_eq!(ModelProfile::from_model_id("gpt-4o").provider, ProviderKind::OpenAI);
        assert_eq!(ModelProfile::from_model_id("gemini-2.0-flash").provider, ProviderKind::Gemini);
        assert_eq!(ModelProfile::from_model_id("llama-3").provider, ProviderKind::Custom);
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
