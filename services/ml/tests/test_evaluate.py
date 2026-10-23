from pulse_ml.evaluate import evaluate, load_report, run_and_save


def test_evaluation_reports_bounded_metrics_on_separate_data(small_model):
    report = evaluate(small_model, seed=99, minutes=240, n_incidents=4)
    assert report["dataset"]["seed"] != small_model.meta["training"]["seed"]
    assert report["dataset"]["anomalous_events"] > 0
    for key in ("isolation_forest", "hybrid_policy", "baseline"):
        m = report[key]
        for metric in ("precision", "recall", "f1", "roc_auc", "average_precision", "false_positive_rate"):
            assert 0.0 <= m[metric] <= 1.0
        c = m["confusion"]
        assert c["tp"] + c["fn"] == report["dataset"]["anomalous_events"]


def test_evaluation_is_deterministic(small_model):
    a = evaluate(small_model, seed=99, minutes=120, n_incidents=2)
    b = evaluate(small_model, seed=99, minutes=120, n_incidents=2)
    assert a["isolation_forest"]["confusion"] == b["isolation_forest"]["confusion"]


def test_report_is_persisted(model_dir):
    assert load_report(model_dir) is None or "model_version" in load_report(model_dir)
    run_and_save(model_dir, seed=5, minutes=120, n_incidents=2)
    assert load_report(model_dir)["dataset"]["seed"] == 5
