# ADR 001 — one service with volume-backed SQLite

Status: accepted implementation, recorded retrospectively on 2 October 2026. This date is the documentation date, not evidence of when the decision was originally taken.

## Context

The course deployment is one 256 MB shared-CPU Fly machine with a persistent `/data` volume. Ownership, sessions, invited collaborators and multi-user activity need durable relationships and atomic updates.

## Alternatives considered in this record

| Option | Benefit | Cost in this setting |
| --- | --- | --- |
| JSON runtime file | Minimal pilot setup | Application-managed integrity/concurrency and weak relational modelling |
| SQLite embedded in Node | Transactions, constraints and one deployable service | Synchronous work and a single write boundary; volume remains a failure point |
| Separate client/server database | Shared access for multiple workers | Additional service outside the supplied course deployment; more operations |

These alternatives reconstruct the engineering trade-off; no earlier dated deliberation is claimed.

## Decision and consequences

Use Node.js 24, browser JavaScript modules, WebSockets and SQLite on the supplied volume. Persist accepted changes before broadcasting. Keep additive migrations and preserve legacy imports. Uploaded media also lives beneath `/data`.

The deployment stays simple, but this is not a horizontally scaled architecture. Multi-machine service would need shared data and fan-out, and volume backup/recovery still needs operational planning. Bounded statements and public asset compression reduce overhead; neither makes private permission results safe to cache.

Evidence: [database queries](../../database.mjs), [initialisation](../../initialize-database.mjs), [Fly config](../../fly.toml), [cache regressions](../../scripts/performance.test.mjs). Technical reference: [SQLite appropriate uses](https://www.sqlite.org/whentouse.html).
