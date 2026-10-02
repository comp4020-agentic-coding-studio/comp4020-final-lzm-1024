# ADR 003 — provider media and participant-scoped voice

Status: accepted implementation, documented retrospectively on 2 October 2026; TURN relay remains unconfigured.

## Context

Screenings need shared playback and a conversation; private calls need actual audio transport. The small application service should not download supplied videos or record student audio. A successful HTTP command is insufficient evidence of working media.

## Decision

Providers stream video directly to each browser. The application stores a host-controlled clock and delivers revisions, chat and presence. Embedded host controls publish their intended changes, while programmatic playback commands do not echo as new host input. Buffering suspends repeated correction; live provider delays remain possible.

WebRTC transports call audio. Authenticated HTTP/WebSocket signalling checks campus, private-conversation membership, current session and selected device. Only bounded audio negotiation is permitted. Explicit call/answer requests microphone capture; cancellation, logout, failure and document exit release it. Store lifecycle metadata, never audio or SDP/ICE.

## Alternatives and costs

A service-side media proxy or recording server would add bandwidth, storage, privacy and availability responsibilities. Direct provider playback avoids that work but retains embedding, codec, CORS and autoplay restrictions. Peer-to-peer voice avoids audio storage but cannot guarantee traversal through restrictive NAT/firewalls using STUN alone. A private TURN relay is configurable through deployment secrets; it needs actual setup and network testing before restricted-network support is claimed.

## Acceptance evidence

[Player regressions](../../scripts/watch-player.test.mjs) check long-running sync behaviour and host authority. [Voice integration](../../scripts/voice-calls.integration.mjs) checks private signals; [synthetic duplex audio](../../scripts/voice-audio.e2e.mjs) checks decoded transport without a microphone. Browser previews establish visible controls, not performance on every real network. Technical reference: [MDN WebRTC connectivity](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity).
