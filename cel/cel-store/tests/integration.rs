//! Integration tests for CEL Store.

use cel_store::CelStore;

#[test]
fn test_store_lifecycle() {
    let store = CelStore::open_memory().expect("Failed to open in-memory store");

    // add_knowledge(content, source)
    store.add_knowledge("Ctrl+S saves the file in Excel", "excel").unwrap();
    store.add_knowledge("Ctrl+Z undoes the last action in Excel", "excel").unwrap();
    store.add_knowledge("Use T-code VA01 for sales orders", "sap").unwrap();

    // query_knowledge searches content via LIKE
    let results = store.query_knowledge("Ctrl").unwrap();
    assert_eq!(results.len(), 2);

    let results = store.query_knowledge("VA01").unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].content.contains("VA01"));
}

#[test]
fn test_run_tracking() {
    let store = CelStore::open_memory().expect("Failed to open in-memory store");

    let run_id = store.start_run("test-workflow", 5).unwrap();
    assert!(run_id > 0);

    store.finish_run(run_id, "completed").unwrap();

    let run_id2 = store.start_run("test-workflow-2", 3).unwrap();
    assert!(run_id2 > run_id);
    store.finish_run(run_id2, "failed").unwrap();
}

#[test]
fn test_independent_stores() {
    let store1 = CelStore::open_memory().unwrap();
    let store2 = CelStore::open_memory().unwrap();

    store1.add_knowledge("unique-fact-alpha", "app1").unwrap();
    store2.add_knowledge("unique-fact-beta", "app2").unwrap();

    assert_eq!(store1.query_knowledge("alpha").unwrap().len(), 1);
    assert_eq!(store1.query_knowledge("beta").unwrap().len(), 0);
    assert_eq!(store2.query_knowledge("beta").unwrap().len(), 1);
    assert_eq!(store2.query_knowledge("alpha").unwrap().len(), 0);
}
