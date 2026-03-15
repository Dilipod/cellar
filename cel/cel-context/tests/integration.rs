//! Integration tests for the CEL Context pipeline.
//!
//! Tests the full flow: accessibility → merge → confidence scoring.

use cel_context::{ConfidenceBehavior, ConfidenceThresholds, ContextElement, ContextSource, ScreenContext};

#[test]
fn test_confidence_thresholds_default() {
    let thresholds = ConfidenceThresholds::default();
    assert_eq!(thresholds.behavior_for(0.95), ConfidenceBehavior::ActImmediately);
    assert_eq!(thresholds.behavior_for(0.8), ConfidenceBehavior::ActAndLog);
    assert_eq!(thresholds.behavior_for(0.6), ConfidenceBehavior::ActCautiously);
    assert_eq!(thresholds.behavior_for(0.3), ConfidenceBehavior::PauseAndNotify);
}

#[test]
fn test_context_element_serialization() {
    let element = ContextElement {
        id: "test:button:1".into(),
        label: Some("Submit".into()),
        element_type: "button".into(),
        value: None,
        bounds: Some(cel_context::Bounds { x: 100, y: 200, width: 80, height: 30 }),
        confidence: 0.95,
        source: ContextSource::AccessibilityTree,
    };

    let json = serde_json::to_string(&element).unwrap();
    let deserialized: ContextElement = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.id, "test:button:1");
    assert_eq!(deserialized.label.as_deref(), Some("Submit"));
    assert_eq!(deserialized.confidence, 0.95);
}

#[test]
fn test_screen_context_serialization() {
    let ctx = ScreenContext {
        app: "TestApp".into(),
        window: "Main Window".into(),
        elements: vec![
            ContextElement {
                id: "a11y:btn:1".into(),
                label: Some("OK".into()),
                element_type: "button".into(),
                value: None,
                bounds: None,
                confidence: 0.9,
                source: ContextSource::AccessibilityTree,
            },
            ContextElement {
                id: "vision:text:1".into(),
                label: Some("Hello World".into()),
                element_type: "text".into(),
                value: Some("Hello World".into()),
                bounds: None,
                confidence: 0.75,
                source: ContextSource::Vision,
            },
        ],
        timestamp_ms: 1700000000000,
    };

    let json = serde_json::to_string(&ctx).unwrap();
    let back: ScreenContext = serde_json::from_str(&json).unwrap();
    assert_eq!(back.app, "TestApp");
    assert_eq!(back.elements.len(), 2);
}

#[test]
fn test_context_source_variants() {
    // Verify all source variants exist and are distinct
    let sources = vec![
        ContextSource::AccessibilityTree,
        ContextSource::NativeApi,
        ContextSource::Vision,
        ContextSource::Merged,
    ];
    for (i, a) in sources.iter().enumerate() {
        for (j, b) in sources.iter().enumerate() {
            if i == j {
                assert_eq!(a, b);
            } else {
                assert_ne!(a, b);
            }
        }
    }
}
