//! CEL Unified Context API
//!
//! Merges all five context streams (display, input, accessibility, vision, network)
//! into a single structured world model. This is the core API that agents consume.

mod element;
mod confidence;
mod merge;

pub use element::{Bounds, ContextElement, ContextSource, ElementState, ScreenContext};
pub use confidence::{ConfidenceBehavior, ConfidenceThresholds};
pub use merge::ContextMerger;
