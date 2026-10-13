# Crit 9 — making shared editing predictable

> Written with AI assistance and revised on 13 October 2026. Based on the existing implementation and tests. The student should check that this reflection matches their own view. The Week 10 group demonstration is not recorded as completed.

## What was the breakthrough that moved the work forward?

The main step forward was giving shared editing a clear rule. Seeing two people on the same whiteboard is not enough. Their work also needs to stay safe when they edit at the same time.

For example, one person might move a title while another changes its colour. The website sends each small change to the server, so both can remain. If both change the colour, the server's accepted order decides the result. Undo also checks for a friend's later change before restoring an old value.

This helped turn "make it collaborative" into behaviour that can be explained and tested. The cost is that edits made while disconnected do not automatically merge later.

## What did this work change about who I want to be as a software developer?

The lesson is to ask what happens when things go wrong, not only whether a feature appears to work. This week's deployment made that point clear. Local checks passed, but the deployment package was missing the new translation file. The release stopped until the package was fixed.

I want to judge work using evidence from the situation where people will actually use it. Tests are one part of that. The next step is to watch classmates edit together and check whether they understand what was saved, rejected or restored after reconnecting.
