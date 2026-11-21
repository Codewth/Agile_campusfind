# CampusFind product vision and working agreement

**Product name:** CampusFind — Smart Lost & Found for Colleges  
**Domain:** Education / Campus Services  
**Team:** Team CampusFind

## Vision

For students and campus staff who face fragmented lost-property reporting, CampusFind aims to provide a single, searchable, student-friendly record of lost and found belongings with clear recovery status and explainable match suggestions. Unlike scrolling group chats or isolated paper registers, it focuses on campus categories, familiar locations and privacy-conscious ownership processes.

**Vision status:** proposed solution following discovery, pending genuine stakeholder validation; not part of submission 1.

## Product goals (testable intentions)

- A registered student can create a meaningful report without exposing email, phone or enrolment ID publicly.
- A campus member can locate reports by keyword/type/category/location.
- A report's author can correct, delete and update the recovery status of their own entry.
- A possible lost/found match shows which fields contributed to its score; it never confirms ownership.
- Application works on typical phone and laptop screens.

## Scope choices

**MVP:** email/password authentication; report create, edit, delete and status; browse/search/filter; item details; My Reports; simple match; optional images; basic security rules.

**Not implemented:** admin dashboard, campus SSO, messaging, email notification, QR scanning, algorithmic ML matching, auto-confirmed ownership, moderation, staff inventory, automatic report expiry. These could be considered only after user feedback.

## Team roles

| Person | Enrolment | PDF initial responsibility | Suggested implementation responsibility |
| --- | --- | --- | --- |
| Pranav Agrawal | S24CSEU1336 | Lead and stakeholder liaison | Project coordination, Firebase rules, integration |
| Ayush Rathore | S24CSEU1326 | Background research | Browse/search, match evaluation, comparison study |
| Kartikey Pandey | S24CSEU1344 | Documentation and problem statement | UI wording, acceptance criteria, README and reports |
| Nirnay Pratap Singh | S24CSEU1368 | Survey/interview evidence | Test cases, validation, evidence and privacy review |

These development roles are proposals, not claims of task completion. Jira only reported Pranav as assignable at the time the work was created; other accounts were left unassigned until added to Jira.

## Definition of Done (for future Jira status changes)

- The acceptance criteria for each story have been exercised and evidenced.
- Source code builds successfully in an environment with dependencies installed, without secret credentials committed.
- Security/ownership restrictions pass manual or emulator checks, including negative cases.
- Forms show validation and failure handling; navigation works on a small screen.
- Relevant tests pass; reviewer records any limitation or deferred bug.
- README/documentation updated; reviewer can reproduce feature using a configured Firebase project.
- The story is **not** marked Done merely because a Jira issue or local source file was generated.

## Agile workflow

Keep discovery evidence separate from implementation hypotheses. Hold backlog refinement after genuine stakeholder validation, select limited sprint scope, demonstrate working increments, log feedback and re-prioritize. Treat created sprints as **provisional**, no fixed dates or claimed velocity. Hold sprint review and retrospective only after real team work.
