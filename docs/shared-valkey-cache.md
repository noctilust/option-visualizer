# Shared Valkey cache operations

OptionVis uses a fail-open two-level cache:

1. A process-local L1 cache serves the fastest repeat reads.
2. Google Cloud Memorystore for Valkey is the shared L2 across Cloud Run
   instances.
3. Tastytrade or Yahoo Finance remains the source of truth on a miss.

The shared cache never changes an API response. If Valkey is slow,
unavailable, rejects authentication, exhausts its connection pool, or contains
malformed data, the request continues through the existing provider path.
Screenshot/OCR contents, `/calculate` results, user inputs, empty provider
results, and error responses are not stored.

## Selected GCP size and security

The manually approved workflow provisions exactly:

- `optionvis-cache`, Valkey 8.0, Cluster Mode Disabled
- one `shared-core-nano` shard, zero replicas, single-zone
- 1.4 GB total and 1.12 GB writable memory
- persistence and automated backups disabled
- `allkeys-lru` eviction
- basic token AUTH with the generated default-user token in Secret Manager
- a dedicated custom VPC, `/24` subnet, service connection policy, automated
  Private Service Connect endpoints, and Cloud Run Direct VPC egress for
  private ranges only

The selected node is approximately $23.21/month in `us-central1`, has variable
performance, and has no SLA. It is intentionally treated as disposable.
Google documents the [node limits and no-SLA status][node-spec] and current
[Valkey pricing][pricing].

Basic token authentication is Pre-GA and cannot be disabled after it is
enabled. This deployment deliberately does not enable application TLS: the
AUTH token travels unencrypted at the Valkey protocol layer inside the private
PSC path. Google still provides network-level encryption, but recommends TLS
for token confidentiality. See [basic token authentication][token-auth] and
the [security overview][security].

[node-spec]: https://docs.cloud.google.com/memorystore/docs/valkey/instance-node-specification
[pricing]: https://cloud.google.com/memorystore/valkey/pricing
[token-auth]: https://docs.cloud.google.com/memorystore/docs/valkey/manage-basic-auth
[security]: https://docs.cloud.google.com/memorystore/docs/valkey/security-overview

## One-time GitHub setup

Create a GitHub environment named `infrastructure` and configure required
reviewers. The workflow refuses to proceed unless the dispatcher also types
`PROVISION`, making the monthly spend explicit.

Grant the existing Workload Identity Federation deployer only these additional
project roles:

- `roles/serviceusage.serviceUsageAdmin`
- `roles/compute.networkAdmin`
- `roles/memorystore.admin`
- `roles/secretmanager.admin`
- `roles/monitoring.editor`
- `roles/logging.configWriter`

The existing Cloud Run deploy roles remain unchanged. The workflow grants the
runtime service account `roles/secretmanager.secretAccessor` only on the
Valkey-token secret.

Run **Provision shared Valkey cache** from GitHub Actions. It is idempotent for
the named resources and performs this sequence:

1. Enables the required APIs.
2. Creates the VPC, subnet, connection policy, PSC endpoints, and selected
   Valkey instance.
3. Stores the generated token and binds it to Cloud Run while the feature flag
   remains off.
4. Runs a one-shot Cloud Run probe that verifies private connectivity, AUTH,
   and a read/write/delete round trip.
5. Enables `SHARED_CACHE_ENABLED=true`.
6. Sends paired symbol, market-data, option-chain, and skew requests; compares
   their payloads and confirms shared-cache activity in application logs.
7. Creates the cache dashboard, logs-based metrics, and alert policy.

The normal deployment workflow uses merged environment-variable updates. It
does not clear the VPC attachment, cache settings, or Secret Manager binding
when a new application revision is deployed.

## Cache policy

| Dataset | Shared TTL | Stored only when |
| --- | ---: | --- |
| Symbol search | 1 hour | Results are non-empty |
| Stock price | 30 seconds | Price is positive |
| Tastytrade market metrics | 5 minutes | At least one metric is available |
| Historical volatility | 6 hours | Calculation succeeds |
| Risk-free rate | Until next UTC day | Live Treasury fetch succeeds |
| Option chain | 5 minutes | Expirations are non-empty |
| Per-contract Greeks | 5 minutes | IV or delta is available |
| Volatility skew | 5 minutes | Quotes are usable |
| Confirmed quote-less skew | 45 seconds | Provider completes with `no_quotes` |

The existing `TASTYTRADE_OPTION_CHAIN_CACHE_SECONDS`,
`TASTYTRADE_GREEKS_CACHE_SECONDS`, `TASTYTRADE_SKEW_CACHE_SECONDS`, and
`TASTYTRADE_SKEW_NEGATIVE_CACHE_SECONDS` variables override their respective
L1 and shared TTLs.

Each Cloud Run process has one blocking pool capped at 20 connections. With the
current 20-instance maximum, application connections are capped at 400, below
the node's 5,000-client limit.

## Verification and monitoring

The workflow clears the dedicated disposable cache through its authenticated
probe job, sends the first request set, and then creates a fresh Cloud Run
revision so the second set cannot use a process-local L1 entry. It confirms:

- the first request reports a provider fetch and cache store;
- the fresh-revision second request reports an L2 hit;
- response payloads are identical except for intentionally live timestamps;
- the second request set reports no provider fetches;
- confirmed `no_quotes` skew still renders the existing quote-less state.

The **OptionVis shared cache** dashboard includes memory, CPU, connected and
rejected clients, keyspace hits/misses, evictions, Cloud Run latency and 5xx
responses, and application cache errors. The enabled alert policy triggers on:

- memory above 70% for five minutes;
- CPU above 75% for five minutes;
- any rejected connection;
- any eviction;
- application cache errors above 1% of cache events for five minutes.

Attach the desired notification channel to the policy in Cloud Monitoring.
Supported metric definitions are listed in the [Valkey monitoring
documentation][metrics].

[metrics]: https://docs.cloud.google.com/memorystore/docs/valkey/supported-monitoring-metrics

## Rollback and scaling

Rollback is immediate and does not require deleting infrastructure:

```bash
gcloud run services update option-visualizer \
  --project=gen-lang-client-0233172083 \
  --region=us-central1 \
  --update-env-vars=SHARED_CACHE_ENABLED=false
```

Leave the instance intact for diagnosis. Scale away from
`shared-core-nano` only after sustained memory pressure, CPU pressure,
connection rejection, eviction, or latency evidence.
