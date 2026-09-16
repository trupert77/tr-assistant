# Travis Assistant

## Project Goal

Build a personal AI assistant that Travis can access primarily from his phone, while also working well from a desktop.

This should not become another traditional task-management app that requires constant manual organization.

The core idea is:

**Travis tells the assistant something in natural language. The assistant determines what it is, organizes it, stores it, and takes the appropriate action.**

The interface should eventually feel like communicating with a personal chief of staff rather than filling out forms.

---

## Core Interaction

The primary interface should be a conversational input.

Examples:

* "Remind me Friday to follow up with Matt about SQL access."
* "I need to order new access points for Kalamazoo."
* "Idea: add maintenance percentage to the rental dashboard."
* "Remember that the printer in Howell uses 10.10.20.45."
* "Follow up with Gary next week about the laptop."
* "What do I need to get done today?"
* "What notes do I have about the rental fleet project?"
* "What am I waiting on Matt for?"

The user should NOT normally have to manually select whether something is a task, note, reminder, follow-up, etc.

The AI should interpret the input.

---

# Core Objects

The system should initially support:

## Inbox Items

Anything captured by the user can initially enter an inbox before or during AI processing.

This provides a safety net so information is never lost if classification fails.

## Tasks

Actionable items.

Potential properties include:

* title
* description
* status
* priority
* due date
* project
* workspace
* category
* tags
* related person
* created date
* completed date

## Follow-ups

Things Travis is waiting on or needs to revisit.

Examples:

* Waiting for someone to respond
* Check on an order
* Follow up with an employee
* Revisit something next week

Follow-ups should support:

* person
* organization
* project
* follow-up date
* status
* context

## Notes

Information worth remembering that does not necessarily require an action.

Notes should be searchable and capable of being related to:

* projects
* people
* organizations
* tasks
* other notes

## Projects

Projects provide context for related information.

Examples might include:

* Personal Assistant
* Rental Fleet Performance
* CECO App
* Kalamazoo Network Upgrade
* Wedding

Projects should not be hard-coded.

## People

People mentioned in tasks, notes, or follow-ups should eventually become entities so the assistant can answer questions such as:

"What am I waiting on Matt for?"

## Workspaces

Top-level separation of areas of Travis's life.

Initial examples:

* Personal
* Carleton Equipment
* CECO
* Home
* Development

These should be configurable rather than hard-coded.

---

# AI Classification

When the user submits natural language, the assistant should eventually determine things such as:

* intent
* item type
* title
* workspace
* project
* category
* priority
* due date
* related people
* tags

Example input:

"Remind me Friday to check with Matt about the Aspen SQL login."

Possible structured result:

Type: Follow-up
Title: Check with Matt about Aspen SQL login
Workspace: Carleton Equipment
Project: Rental Fleet Performance
Category: IT / Aspen
Person: Matt
Due: Friday
Status: Open

The original user input should also be preserved.

AI classification should never silently discard information.

---

# Retrieval

The assistant should eventually answer natural-language questions using stored information.

Examples:

* "What do I need to do today?"
* "What is overdue?"
* "What am I waiting on?"
* "What have I written down about Aspen?"
* "Show me everything related to Kalamazoo networking."
* "What did I say about the rental dashboard?"
* "What should I follow up on this week?"

---

# Interface

Design mobile-first.

The application will be installed on Travis's phone as a PWA.

The interface should remain extremely simple.

Potential navigation:

* Today
* Inbox
* Projects
* Assistant

The primary interaction should always be immediately accessible.

A large text input and eventually voice input should allow rapid capture.

The goal is to minimize taps.

---

# Today View

Eventually provide a useful daily command center containing things such as:

* overdue tasks
* tasks due today
* upcoming tasks
* follow-ups
* waiting-on items
* reminders
* recently captured items

AI may eventually generate a short daily briefing.

---

# Inbox Philosophy

Capture first. Organize second.

Travis should be able to dump thoughts into the assistant without deciding where they belong.

The system should attempt automatic classification.

Low-confidence classifications can remain visible in the Inbox for review.

Nothing should disappear because the AI could not classify it.

---

# Technology

Current stack:

* Next.js
* TypeScript
* App Router
* Tailwind CSS
* Vercel
* GitHub

Planned:

* Supabase
* PostgreSQL
* Authentication
* AI model/API
* PWA support
* Push notifications

The architecture should remain modular so AI providers can potentially be changed later.

---

# Security

Security matters because this system may eventually have significant permissions.

Never expose:

* API keys
* Supabase service-role credentials
* GitHub credentials
* server credentials
* AI provider secrets

to browser/client code.

Privileged operations should happen server-side.

Use environment variables for secrets.

---

# Future: Code Agent

A later phase will allow the assistant to perform software-development tasks.

Example:

"Change the CECO inventory card so hours appear underneath the serial number."

The assistant may:

1. Identify the appropriate repository.
2. Create a coding job.
3. Send it to a remote coding worker.
4. Clone/pull the repository.
5. Create a branch.
6. Modify the code.
7. Run lint/tests/build.
8. Commit the changes.
9. Push the branch.
10. Open a pull request.
11. Report the results to Travis.

The default workflow should NOT automatically push directly to production or main.

Human approval should remain part of deployment.

---

# Remote Worker

Code execution should eventually be separated from the public Vercel application.

A private worker can run on Travis's server infrastructure.

The Vercel application should submit jobs to the worker rather than execute arbitrary shell commands itself.

This worker may eventually support additional automation beyond coding.

Do NOT build this component during the initial MVP.

---

# CECO Integration

This assistant is a separate application from the CECO application.

Do not architect the assistant as part of CECO.

Instead, CECO should eventually become one of the systems the assistant can interact with through APIs/tools.

The assistant should also eventually be capable of working with multiple repositories and systems.

---

# Development Philosophy

Prioritize:

1. Simple capture
2. Reliable storage
3. Excellent organization
4. Fast retrieval
5. Mobile usability
6. AI assistance
7. Automation

Avoid unnecessary complexity.

Do not build features simply because they might eventually be useful.

Build the system incrementally.

---

# MVP

The first usable version should allow Travis to:

1. Open the application from his phone.
2. Enter a natural-language thought/request.
3. Store the original input.
4. Classify it as a task, note, or follow-up.
5. Assign workspace/project/category when appropriate.
6. Extract dates when appropriate.
7. View captured items.
8. View tasks and follow-ups that require attention.
9. Search/retrieve stored information.

Do NOT implement autonomous coding, email automation, or complex agent workflows during the initial MVP.

Design the architecture so those capabilities can be added later.
