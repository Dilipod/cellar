//! CDP WebSocket Client
//!
//! Minimal Chrome DevTools Protocol client for page content extraction.

use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, thiserror::Error)]
pub enum CdpError {
    #[error("WebSocket connection failed: {0}")]
    ConnectionFailed(String),
    #[error("CDP command failed: {0}")]
    CommandFailed(String),
    #[error("Timeout waiting for CDP response")]
    Timeout,
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
}

/// Minimal CDP client — connects via WebSocket and sends commands.
pub struct CdpClient {
    ws: Mutex<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>>,
    next_id: AtomicU64,
}

impl CdpClient {
    /// Connect to a CDP WebSocket URL.
    pub async fn connect(ws_url: &str) -> Result<Self, CdpError> {
        let (ws, _) = tokio_tungstenite::connect_async(ws_url)
            .await
            .map_err(|e| CdpError::ConnectionFailed(e.to_string()))?;

        Ok(Self {
            ws: Mutex::new(ws),
            next_id: AtomicU64::new(1),
        })
    }

    /// Send a CDP command and wait for the result.
    pub async fn send_command(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, CdpError> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let msg = serde_json::json!({
            "id": id,
            "method": method,
            "params": params,
        });

        let mut ws = self.ws.lock().await;

        ws.send(Message::Text(msg.to_string().into()))
            .await
            .map_err(|e| CdpError::CommandFailed(e.to_string()))?;

        // Wait for the response with matching id (timeout after 5s)
        let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(5);
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return Err(CdpError::Timeout);
            }

            match tokio::time::timeout(remaining, ws.next()).await {
                Ok(Some(Ok(Message::Text(text)))) => {
                    if let Ok(response) = serde_json::from_str::<serde_json::Value>(&text) {
                        if response.get("id").and_then(|v| v.as_u64()) == Some(id) {
                            if let Some(error) = response.get("error") {
                                return Err(CdpError::CommandFailed(error.to_string()));
                            }
                            return Ok(response.get("result").cloned().unwrap_or(serde_json::Value::Null));
                        }
                        // Not our response — it's an event, skip it
                    }
                }
                Ok(Some(Ok(_))) => continue, // Binary or other message types
                Ok(Some(Err(e))) => return Err(CdpError::CommandFailed(e.to_string())),
                Ok(None) => return Err(CdpError::ConnectionFailed("WebSocket closed".into())),
                Err(_) => return Err(CdpError::Timeout),
            }
        }
    }

    /// Get the full DOM document as a tree.
    pub async fn get_document(&self) -> Result<serde_json::Value, CdpError> {
        self.send_command("DOM.getDocument", serde_json::json!({ "depth": -1 }))
            .await
    }

    /// Get the outer HTML of a node.
    pub async fn get_outer_html(&self, node_id: i64) -> Result<String, CdpError> {
        let result = self
            .send_command(
                "DOM.getOuterHTML",
                serde_json::json!({ "nodeId": node_id }),
            )
            .await?;
        result
            .get("outerHTML")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| CdpError::InvalidResponse("No outerHTML in response".into()))
    }

    /// Execute JavaScript in the page and return the result.
    pub async fn evaluate(&self, expression: &str) -> Result<serde_json::Value, CdpError> {
        let result = self
            .send_command(
                "Runtime.evaluate",
                serde_json::json!({
                    "expression": expression,
                    "returnByValue": true,
                }),
            )
            .await?;
        Ok(result
            .get("result")
            .and_then(|r| r.get("value"))
            .cloned()
            .unwrap_or(serde_json::Value::Null))
    }

    /// Enable network event tracking.
    pub async fn enable_network(&self) -> Result<(), CdpError> {
        self.send_command("Network.enable", serde_json::json!({}))
            .await?;
        Ok(())
    }

    /// Get the page title.
    pub async fn get_title(&self) -> Result<String, CdpError> {
        let result = self
            .evaluate("document.title")
            .await?;
        Ok(result.as_str().unwrap_or("").to_string())
    }

    /// Get the page URL.
    pub async fn get_url(&self) -> Result<String, CdpError> {
        let result = self
            .evaluate("window.location.href")
            .await?;
        Ok(result.as_str().unwrap_or("").to_string())
    }
}
