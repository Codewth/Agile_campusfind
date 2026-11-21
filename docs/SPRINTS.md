# Provisional Agile iterations (post-discovery)

The original PDF prohibits fixed detailed sprint plans **inside Submission 1**. The following are future planning buckets requested for subsequent development. They have no fixed dates, no capacity commitments and no fabricated velocity. In Jira, the sprints were created on the existing board, then development issues were placed in future sprints.

| Future sprint | Jira sprint ID | Goal | Work to validate |
| --- | --- | --- | --- |
| CF A – Foundation | 70 | Sign-in, security rules, initial report flow | SCRUM-17, 18, 19, 23, 44 |
| CF B – Reporting | 71 | Browse/search, owned edit/delete, status | SCRUM-20, 21, 40, 41, 42 |
| CF C – Matching QA | 72 | Explainable matches, optional photos, tests/release documentation | SCRUM-22, 24, 43 |

## Suggested sprint approach

**Planning:** Revisit assumptions and break only validated, prioritized stories into small tasks. Confirm actual team capacity.  
**During the sprint:** Update Jira board status accurately, create defects with steps to reproduce, conduct short check-ins.  
**Review:** Demonstrate acceptance criteria using a test Firebase project. Obtain actual user/staff feedback.  
**Retrospective:** Record one successful practice, one impediment and one improvement action; do not invent meetings.  
**Next sprint:** Re-rank and refine based on the review; do not treat all future tickets as promised features.

## Dependencies

1. Real campus stakeholder evidence, staff ownership verification policy and public-data restrictions must be validated before a live rollout.
2. A working Firebase project is necessary to verify CRUD, Auth and storage permissions.
3. GitHub and Vercel access is needed for real deployment, and the actual URL must be verified before marking release tasks Done.
