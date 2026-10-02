# Crit 9 — collaboration needs a conflict rule

> Reflection prepared with AI assistance, 2 October 2026. Draws on existing collaboration tests; no claim is made that the Week 10 group demonstration has happened. Replace this interpretation with the student's own account after actual use.

## What was the breakthrough that moved the work forward?

The breakthrough was making a decision about simultaneous edits explicit. Sending the whole canvas from each browser would let one person's stale copy erase another's work. The whiteboard instead sends validated operations on objects and properties. Independent changes can survive together; a conflict on the same property follows server acceptance order. Reconnection restores accepted state rather than treating an unsent browser copy as authoritative.

Undo revealed why collaboration changes familiar controls. A local undo stack cannot safely restore an old value after a friend has changed that object. Expected-value checks prevent that overwrite. Two-client tests make this boundary visible, but a classroom demonstration still needs to establish whether people understand it while drawing together. A pointer animation alone would not prove useful collaboration.

## What did this work change about who I want to be as a software developer?

I want to explain what happens when two reasonable actions collide, rather than leave that behaviour to timing. This means specifying both successful coordination and rejected stale actions. It also means acknowledging the trade-off: this design supports online collaboration without promising offline merging. The next lesson should come from observing two people edit the same object and recover from a disconnect, then revising the feedback if they cannot tell what was accepted.
