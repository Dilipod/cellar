//! CEL Unified Context API
//!
//! Merges all five context streams (display, input, accessibility, vision, network)
//! into a single structured world model. This is the core API that agents consume.

mod element;
mod confidence;
pub mod events;
mod merge;
mod resolve;
pub mod watchdog;

pub use element::{
    Bounds, BoundsRegion, ContextElement, ContextReference, ContextSource, ElementState,
    FocusedContext, ScreenContext,
};
pub use confidence::{ConfidenceBehavior, ConfidenceThresholds};
pub use events::CelEvent;
pub use merge::ContextMerger;
pub use resolve::resolve_reference;
pub use watchdog::ContextWatchdog;
