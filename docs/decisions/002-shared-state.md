# ADR 002 — how two people edit one whiteboard

Status: implemented. First recorded after implementation on 2 October 2026; wording simplified on 13 October 2026.

## The problem

Two friends may edit the same poster at the same time. One person's older copy must not erase the other person's new work. The editor must also give a clear answer when both people change the same thing.

## The options

| Option | Why consider it? | Main problem |
| --- | --- | --- |
| Send the whole board after each change | Simple to build | An older board can replace newer work |
| Send small changes to one server | Easier to check each action and explain its result | The server must be available; offline work does not automatically merge |
| Use a CRDT | A system for combining changes made in several places, including offline | More code and harder rules for storage, undo and publishing |

## The choice

Use small changes checked by one server. Each action names the object and the property to change, such as its position, colour or text.

The server checks whether the person can edit, saves the accepted change, then sends the result to other editors. A request has an ID so sending it twice does not apply the action twice.

For example, Alice can move a title while Bob changes its colour. These change different properties, so both can remain. If both change its colour, the server's accepted order decides the final colour. This rule is about saved order, not whose device clock is more accurate.

Undo has an extra check. It compares the current value with the value left by the original action. If a friend's later change would be lost, undo is refused rather than silently removing their work.

## What this choice costs

The design supports people working online together. It does not promise that work made while disconnected will merge later. After reconnecting, the editor restores the server's saved board and reports unsent work that was lost.

Two people editing the same property may still want different results. The chosen rule gives a clear result, but cannot satisfy both intentions. The interface needs to explain what happened.

## Who can publish?

The shared working board stays private. Invited friends can edit it, but only the creator can publish it, remove publication or change who has access. The public poster changes only when its creator publishes.

## Evidence and next check

[Canvas operations](../../public/canvas-model.js) and [the server](../../server.mjs) implement these rules. [Whiteboard tests](../../scripts/whiteboard.integration.mjs) and [designer tests](../../scripts/designer.integration.mjs) check separate clients, repeated requests, permission changes and restarts.

The remaining human check is whether two classmates understand a conflicting edit and a refused undo without being coached. Passing automated tests does not answer that question.
