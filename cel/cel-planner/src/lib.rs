//! CEL Planner — LLM-driven goal decomposition and step planning.
//!
//! Takes a natural-language goal and runs an observe-plan-act loop,
//! using the LLM to decide one step at a time based on the current
//! screen context (elements, state, network events).
//!
//! The planner is adapter-agnostic: it works with any source of
//! `ContextElement`s — browser DOM, desktop accessibility tree,
//! native app APIs, or vision analysis.

mod error;
pub mod history;
pub mod loop_detector;
mod planner;
pub mod prompt;
mod types;

pub use error::PlannerError;
pub use loop_detector::{context_fingerprint, LoopDetector, LoopSignal};
pub use planner::{find_blocking_error, validate_grounding, Planner, PlannerBackend};
pub use types::{
    ContextDetail, GoalConfig, PlannedAction, PlannedPlan, PlannedStep, PlannerEvent, StepRecord,
};

/// Create a planner from environment-configured LLM.
pub fn create_planner(config: GoalConfig) -> Result<Planner, PlannerError> {
    let llm = cel_llm::create_client()?;
    Ok(Planner::new(llm, config))
}
