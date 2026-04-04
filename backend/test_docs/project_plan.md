# Project Alpha — Initial Project Plan
**Version:** 1.0
**Date:** 2026-03-01
**Project Manager:** Sarah Mitchell

---

## Project Overview

Build and deliver a data management portal for the client's finance team.
The portal replaces a legacy Excel-based workflow with a web application.

---

## Original Scope

1. User authentication (email + password, no SSO in Phase 1)
2. Data entry forms for three entity types: Invoices, Vendors, Purchase Orders
3. Search and filter across all entity types
4. Basic reporting dashboard (totals, counts, date filters)
5. RESTful API for future integrations
6. Admin panel for user management (add/remove users, reset passwords)

**Explicitly out of scope for Phase 1:**
- Role-based access control (Phase 2)
- CSV/Excel export (Phase 2)
- Audit logging (Phase 2)
- SSO / Active Directory integration (Phase 2)
- Mobile application (Phase 3)

---

## Key Milestones

| Milestone | Target Date | Owner |
|---|---|---|
| Architecture design approved | 2026-03-10 | James |
| Backend API complete | 2026-04-05 | James |
| Frontend complete | 2026-04-12 | Dev Team |
| QA testing complete | 2026-04-17 | Priya |
| Stakeholder demo | 2026-04-17 | Sarah |
| Alpha release to internal testers | 2026-04-20 | Tom |
| Client sign-off on Alpha | 2026-05-01 | Sarah |

---

## Initial Risk Assessment

### Risk 1: Third-party API integration delays
- **Impact:** HIGH
- **Likelihood:** MEDIUM
- **Mitigation:** Identify backup data source; build adapter layer so switching provider doesn't require frontend changes.

### Risk 2: QA capacity — Priya is shared with another project until April 5th
- **Impact:** MEDIUM
- **Likelihood:** HIGH
- **Mitigation:** Begin writing test cases early; automate regression suite; consider bringing in contract QA resource if needed.

### Risk 3: Client requirements not fully defined
- **Impact:** HIGH
- **Likelihood:** LOW
- **Mitigation:** Weekly client check-ins; requirement freeze date set at 2026-03-20.

---

## Team

| Name | Role | Allocation |
|---|---|---|
| Sarah Mitchell | Project Manager | 50% |
| James Okafor | Dev Lead / Backend | 100% |
| Priya Sharma | QA Engineer | 50% (100% from April 5th) |
| Tom Nakamura | DevOps / Infra | 25% |
| 2x Frontend Devs | Frontend Development | 100% each |

---

## Dependencies

- Backend API must be feature-complete before frontend integration begins.
- QA environment must be provisioned before formal testing can start.
- Client to provide sample data for testing by 2026-03-15.

---

## Budget

Total approved budget: £120,000
Contingency: 10% (£12,000)
