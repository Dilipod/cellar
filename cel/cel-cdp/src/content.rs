//! Page Content Extraction via CDP
//!
//! Extracts structured text content from the active page using CDP.
//! Returns content that can be fused with AX data in the context merger.

use crate::client::{CdpClient, CdpError};
use serde::{Deserialize, Serialize};

/// Extracted page content from a CDP session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageContent {
    /// Page title.
    pub title: String,
    /// Page URL.
    pub url: String,
    /// Main text content of the page body (stripped of HTML).
    pub body_text: String,
    /// Structured text blocks (headings, paragraphs, code blocks).
    pub text_blocks: Vec<TextBlock>,
    /// Interactive elements found via DOM (forms, inputs, links).
    pub interactive_elements: Vec<DomElement>,
}

/// A block of text content from the page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBlock {
    pub block_type: String, // "heading", "paragraph", "code", "list_item"
    pub text: String,
    pub level: Option<u8>, // For headings: 1-6
}

/// An interactive DOM element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomElement {
    pub tag: String,
    pub element_type: String, // "button", "input", "link", "select"
    pub text: String,
    pub href: Option<String>,
    pub input_type: Option<String>,
    pub value: Option<String>,
    pub placeholder: Option<String>,
}

/// Extract page content from an active CDP connection.
pub async fn extract_page_content(client: &CdpClient) -> Result<PageContent, CdpError> {
    let title = client.get_title().await.unwrap_or_default();
    let url = client.get_url().await.unwrap_or_default();

    // Extract body text via JavaScript
    let body_text = client
        .evaluate("document.body?.innerText || ''")
        .await
        .unwrap_or(serde_json::Value::String(String::new()));
    let body_text = body_text.as_str().unwrap_or("").to_string();

    // Extract structured text blocks
    let blocks_js = r#"
        (function() {
            const blocks = [];
            const selectors = [
                { sel: 'h1,h2,h3,h4,h5,h6', type: 'heading' },
                { sel: 'p', type: 'paragraph' },
                { sel: 'pre,code', type: 'code' },
                { sel: 'li', type: 'list_item' },
            ];
            for (const { sel, type: blockType } of selectors) {
                for (const el of document.querySelectorAll(sel)) {
                    const text = el.innerText?.trim();
                    if (text && text.length > 0 && text.length < 5000) {
                        const block = { block_type: blockType, text };
                        if (blockType === 'heading') {
                            block.level = parseInt(el.tagName[1]) || 1;
                        }
                        blocks.push(block);
                    }
                }
            }
            return blocks.slice(0, 200);
        })()
    "#;
    let text_blocks: Vec<TextBlock> = client
        .evaluate(blocks_js)
        .await
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Extract interactive elements
    let interactive_js = r#"
        (function() {
            const elements = [];
            // Buttons
            for (const el of document.querySelectorAll('button, [role="button"]')) {
                elements.push({
                    tag: el.tagName.toLowerCase(),
                    element_type: 'button',
                    text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 200),
                });
            }
            // Links
            for (const el of document.querySelectorAll('a[href]')) {
                elements.push({
                    tag: 'a',
                    element_type: 'link',
                    text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 200),
                    href: el.href,
                });
            }
            // Inputs
            for (const el of document.querySelectorAll('input, textarea, select')) {
                elements.push({
                    tag: el.tagName.toLowerCase(),
                    element_type: 'input',
                    text: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '').trim(),
                    input_type: el.type || null,
                    value: el.value?.slice(0, 200) || null,
                    placeholder: el.placeholder || null,
                });
            }
            return elements.slice(0, 200);
        })()
    "#;
    let interactive_elements: Vec<DomElement> = client
        .evaluate(interactive_js)
        .await
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(PageContent {
        title,
        url,
        body_text: if body_text.len() > 10000 {
            format!("{}...", &body_text[..9997])
        } else {
            body_text
        },
        text_blocks,
        interactive_elements,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_page_content_serialization() {
        let content = PageContent {
            title: "Test Page".into(),
            url: "https://example.com".into(),
            body_text: "Hello world".into(),
            text_blocks: vec![TextBlock {
                block_type: "heading".into(),
                text: "Welcome".into(),
                level: Some(1),
            }],
            interactive_elements: vec![DomElement {
                tag: "button".into(),
                element_type: "button".into(),
                text: "Submit".into(),
                href: None,
                input_type: None,
                value: None,
                placeholder: None,
            }],
        };
        let json = serde_json::to_string(&content).unwrap();
        let back: PageContent = serde_json::from_str(&json).unwrap();
        assert_eq!(back.title, "Test Page");
        assert_eq!(back.text_blocks.len(), 1);
        assert_eq!(back.interactive_elements.len(), 1);
    }
}
