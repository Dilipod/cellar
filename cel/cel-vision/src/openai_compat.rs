use async_trait::async_trait;
use cel_display::{encode_png, Frame};
use cel_llm::{base64_encode, strip_code_fences, LlmClient, LlmProviderConfig};

use crate::provider::{VisionElement, VisionError, VisionProvider};

/// Maximum number of retries on parse failure before giving up.
const MAX_RETRIES: usize = 1;

/// System prompt instructing the model to return structured UI element data.
const VISION_SYSTEM_PROMPT: &str = r#"You are a UI element detector. Analyze the screenshot and identify all visible UI elements.
Return a JSON array of objects with these fields:
- "label": the visible text or description of the element
- "element_type": one of "button", "input", "text", "link", "checkbox", "dropdown", "menu", "tab", "icon", "image", "dialog", "other"
- "bounds": {"x": int, "y": int, "width": int, "height": int} in pixel coordinates from top-left, or null if uncertain
- "confidence": float 0.0-1.0 indicating how confident you are

Return ONLY the JSON array, no other text."#;

/// Stricter retry prompt when the first attempt returns unparseable output.
const VISION_RETRY_PROMPT: &str = r#"Your previous response was not valid JSON. You MUST return ONLY a JSON array. No markdown, no explanation, no code fences. Example: [{"label":"OK","element_type":"button","bounds":null,"confidence":0.9}]"#;

/// Vision provider backed by a [`LlmClient`].
pub struct OpenAICompatProvider {
    client: LlmClient,
    provider_name: String,
}

impl OpenAICompatProvider {
    pub fn new(config: LlmProviderConfig) -> Result<Self, VisionError> {
        let client = LlmClient::new(config)?;
        let provider_name = client.provider_name();
        Ok(Self {
            client,
            provider_name,
        })
    }
}

#[async_trait]
impl VisionProvider for OpenAICompatProvider {
    async fn analyze(
        &self,
        frame: &Frame,
        prompt: &str,
    ) -> Result<Vec<VisionElement>, VisionError> {
        let png_data = encode_png(frame).map_err(|e| VisionError::EncodeFailed(e.to_string()))?;
        let data_url = format!("data:image/png;base64,{}", base64_encode(&png_data));

        let user_prompt = if prompt.is_empty() {
            "Identify all UI elements in this screenshot."
        } else {
            prompt
        };

        let content = self
            .client
            .complete_with_image(VISION_SYSTEM_PROMPT, &data_url, user_prompt, 4096)
            .await?;

        // Try to parse; on failure, retry with a stricter prompt
        let json_str = strip_code_fences(&content);
        match serde_json::from_str::<Vec<VisionElement>>(json_str) {
            Ok(elements) => Ok(elements),
            Err(first_err) => {
                tracing::warn!(
                    "Vision response parse failed ({}), retrying with stricter prompt",
                    first_err
                );

                for attempt in 0..MAX_RETRIES {
                    let retry_content = self
                        .client
                        .complete_with_image(
                            VISION_SYSTEM_PROMPT,
                            &data_url,
                            VISION_RETRY_PROMPT,
                            4096,
                        )
                        .await?;

                    let retry_json = strip_code_fences(&retry_content);
                    match serde_json::from_str::<Vec<VisionElement>>(retry_json) {
                        Ok(elements) => return Ok(elements),
                        Err(e) => {
                            tracing::warn!("Vision retry {} failed: {}", attempt + 1, e);
                        }
                    }
                }

                Err(VisionError::ApiFailed(format!(
                    "Failed to parse vision response after {} retries: {}",
                    MAX_RETRIES, first_err
                )))
            }
        }
    }

    fn name(&self) -> &str {
        self.provider_name.as_str()
    }
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
        let elements: Vec<VisionElement> = serde_json::from_str(json).unwrap();
        assert_eq!(elements.len(), 2);
        assert_eq!(elements[0].label, "Submit");
        assert_eq!(elements[0].element_type, "button");
        assert!(elements[0].bounds.is_some());
        assert_eq!(elements[1].label, "Username");
        assert!(elements[1].bounds.is_none());
    }

    #[test]
    fn test_parse_markdown_wrapped() {
        let raw = "```json\n[{\"label\": \"OK\", \"element_type\": \"button\", \"bounds\": null, \"confidence\": 0.9}]\n```";
        let json_str = strip_code_fences(raw);
        let elements: Vec<VisionElement> = serde_json::from_str(json_str).unwrap();
        assert_eq!(elements.len(), 1);
    }
}
