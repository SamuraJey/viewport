import json
from pathlib import Path

import yaml

CONFIG_ROOT = Path("config/observability")


def test_observability_yaml_and_json_configs_parse():
    yaml_paths = [Path("docker-compose.observability.yml"), *CONFIG_ROOT.rglob("*.yml"), *CONFIG_ROOT.rglob("*.yaml")]
    assert yaml_paths
    for path in yaml_paths:
        assert yaml.safe_load(path.read_text()) is not None, path

    dashboard_paths = sorted((CONFIG_ROOT / "grafana" / "dashboards").glob("*.json"))
    assert dashboard_paths
    for path in dashboard_paths:
        payload = json.loads(path.read_text())
        assert payload["title"].startswith("Viewport"), path
        assert payload.get("panels"), path


def test_observability_compose_references_existing_files():
    compose = yaml.safe_load(Path("docker-compose.observability.yml").read_text())
    missing: list[str] = []
    for service in compose["services"].values():
        for volume in service.get("volumes", []) or []:
            source = str(volume).split(":", 1)[0]
            if source.startswith("./") and not Path(source).exists():
                missing.append(source)
    assert missing == []


def test_alert_runbooks_exist_for_prometheus_rules():
    rules = yaml.safe_load((CONFIG_ROOT / "prometheus" / "rules" / "viewport-alerts.yml").read_text())
    runbook_paths = []
    for group in rules["groups"]:
        for rule in group["rules"]:
            runbook = rule.get("annotations", {}).get("runbook_url")
            if runbook:
                runbook_paths.append(Path(runbook))
    assert runbook_paths
    missing = [str(path) for path in runbook_paths if not path.exists()]
    assert missing == []


def test_loki_labels_remain_low_cardinality():
    alloy_config = (CONFIG_ROOT / "alloy" / "config.alloy").read_text()
    labels_block = alloy_config.split("stage.labels", 1)[1].split("stage.static_labels", 1)[0]

    assert "level" in labels_block
    assert "logger" in labels_block
    assert "service" in labels_block
    assert "trace_id" not in labels_block
    assert "span_id" not in labels_block
    assert "request_id" not in labels_block


def test_collector_privacy_processor_deletes_raw_http_identity_attributes():
    collector = yaml.safe_load((CONFIG_ROOT / "otel-collector.yaml").read_text())
    actions = {action["key"]: action["action"] for action in collector["processors"]["attributes/privacy"]["actions"]}

    for key in [
        "http.target",
        "http.url",
        "http.user_agent",
        "http.client_ip",
        "url.full",
        "url.path",
        "url.query",
        "user_agent.original",
        "client.address",
        "net.peer.ip",
        "http.request.header.user-agent",
        "db.statement",
        "share_id",
        "s3.object.key",
    ]:
        assert actions[key] == "delete"
