import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def test_cache_workflow_is_manual_approval_gated_and_exactly_sized():
    workflow = (
        ROOT / ".github/workflows/provision-shared-cache.yml"
    ).read_text()

    assert "workflow_dispatch:" in workflow
    assert "environment: infrastructure" in workflow
    assert "inputs.confirm_cost != 'PROVISION'" in workflow
    assert "--engine-version=VALKEY_8_0" in workflow
    assert "--mode=cluster-disabled" in workflow
    assert "--node-type=shared-core-nano" in workflow
    assert "--shard-count=1" in workflow
    assert "--replica-count=0" in workflow
    assert "--zone-distribution-config-mode=single-zone" in workflow
    assert "--persistence-config-mode=disabled" in workflow
    assert "--automated-backup-config-mode=disabled" in workflow
    assert "--authorization-mode=token-auth" in workflow
    assert "--transit-encryption-mode=transit-encryption-disabled" in workflow
    assert "--engine-configs=maxmemory-policy=allkeys-lru" in workflow
    assert "SUBNET_RANGE: 10.90.0.0/24" in workflow
    assert "--vpc-egress=private-ranges-only" in workflow
    assert "Verify repeated API responses and shared-cache population" in workflow
    assert "CACHE_PROBE_FLUSH=true" in workflow
    assert "CACHE_ROLLOUT_PROBE_ID=" in workflow
    assert "event=provider_fetch" in workflow
    assert "event=store" in workflow
    assert "event=hit" in workflow
    assert "--remove-env-vars=CACHE_ROLLOUT_PROBE_ID" in workflow


def test_normal_deploy_preserves_merged_environment_and_vpc_state():
    workflow = (ROOT / ".github/workflows/deploy.yml").read_text()

    assert "env_vars_update_strategy: merge" in workflow
    assert "--clear-network" not in workflow
    assert "--clear-secrets" not in workflow


def test_monitoring_policy_has_requested_thresholds():
    policy = json.loads(
        (
            ROOT
            / ".github/monitoring/optionvis-cache-alert-policy.json"
        ).read_text()
    )
    thresholds = {
        condition["displayName"]: condition["conditionThreshold"][
            "thresholdValue"
        ]
        for condition in policy["conditions"]
    }

    assert thresholds["Valkey memory above 70% for 5 minutes"] == 0.7
    assert thresholds["Valkey CPU above 75% for 5 minutes"] == 0.75
    assert thresholds["Any rejected Valkey connection"] == 0
    assert thresholds["Any unexpected Valkey eviction"] == 0
    assert thresholds["Application cache-error rate above 1%"] == 0.01
