# Observability

| Signal | Tool | What |
|---|---|---|
| Errors (client + server) | Sentry | Exceptions, unhandled rejections, release tagging, source maps |
| Logs | pino JSON → Render log stream | Request logs, room lifecycle, matchmaking decisions (sampled) |
| Metrics | `/metrics` (Prometheus format), scraped by Grafana Cloud free tier (optional) | See below |
| Product analytics | Self-hosted or privacy-friendly analytics (e.g. PostHog with EU hosting or Plausible) | Funnel: sign-up → tutorial → Ch1 complete → first showdown |

## Key metrics

- **Realtime:** connected sockets, messages/s by type, event-loop lag p99, reconnect rate
- **Matchmaking:** queue size by mode and rank, wait p50/p90, ready-check success rate, decline rate
- **Execution:** showdown execution ms p50/p99, compile failures at lock, runtime-error rate
- **Economy:** credits minted/spent per day, ledger reconciliation status, receipt mismatch rate
- **Campaign:** completion rate per contract, median attempts, the most common error codes per chapter (drives lesson rewrites)

## Alerts

Event-loop lag p99 > 200 ms for 5 min · execution p99 > 1 s · ready-check success < 60 % · ledger reconciliation failure · 5xx > 1 %.
