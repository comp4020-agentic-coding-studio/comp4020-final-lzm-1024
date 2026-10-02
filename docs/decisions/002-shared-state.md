# ADR 002 — bounded operations and explicit publication

Status: accepted implementation, documented retrospectively on 2 October 2026.

## Context and alternatives

Multiple invited editors must work without replacing each other's complete documents. A browser-local whole-board save is easy to implement but can destroy concurrent work. A full CRDT could support richer offline merging, at the cost of a different data model, history semantics and a larger implementation surface.

## Decision

Send validated object/property operations with request identities and known versions to an authoritative server. Independent objects/properties merge. Conflicting changes to the same property follow server acceptance order. Expected-property undo/redo rejects changes that would overwrite another user's intervening work. Retain bounded receipts for retries; transient cursors/movement previews are separate from durable state.

Private working state and the owner's published snapshot remain distinct. Collaborators edit; only the owner changes public publication and access grants. Membership is checked for HTTP, WebSocket negotiation and continued delivery.

## Consequences

The behaviour is understandable and testable for bounded online boards. There is no promise of offline merging or unlimited retry history. Reconnect restores accepted state and reports interrupted work. Server-order conflict resolution may disappoint an editor; the feedback must explain rejection rather than claim every intention survives.

Evidence: [canvas operations](../../public/canvas-model.js), [server](../../server.mjs), [two-client tests](../../scripts/whiteboard.integration.mjs), [designer tests](../../scripts/designer.integration.mjs).
