# Project Alpha — Sprint Review & Planning Meeting
**Date:** 2026-04-02
**Attendees:** Sarah (PM), James (Dev Lead), Priya (QA), Tom (Infra)

---

## Summary

Reviewed sprint 4 outcomes. API integration is behind schedule due to auth token issues.
Frontend components are on track. QA environment is not yet provisioned.

---

## Action Items

1. **James** to fix the OAuth token refresh bug and submit PR by **2026-04-07**. Priority: HIGH.
2. **Priya** to set up the QA regression test suite by **2026-04-10**. Priority: HIGH.
3. **Tom** to provision the QA environment (Docker + Postgres) by **2026-04-09**. Priority: HIGH.
4. **Sarah** to send updated project timeline to stakeholders by **2026-04-05**. Priority: MEDIUM.
5. **James** to write unit tests for the payments module by **2026-04-14**. Priority: MEDIUM.

---

## Deadlines

- **Alpha release to internal testers:** 2026-04-20
- **Stakeholder demo:** 2026-04-17

---

## Risks

- **OAuth bug may slip to next sprint** if root cause is deeper than expected.
  - Impact: HIGH — blocks all authenticated API calls
  - Likelihood: MEDIUM
  - Mitigation: James to pair with Tom on Thursday to investigate; escalate to architecture review if not resolved by EOD Friday.

---

## Dependencies

- The QA regression suite (Priya) **cannot start** until Tom provisions the QA environment.
- The stakeholder demo **requires** the OAuth bug to be fixed and at least one happy-path flow working end-to-end.

---

## Notes

- Next sprint planning: 2026-04-08 at 10am
- All PRs need two reviewers from now on
