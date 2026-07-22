# Employees consolidation — one registry, not three lists

**Status:** proposed · not started
**Why now:** three lists describe the same people and drift apart. Adding a fourth "unified" layer on top would make it worse. The fix is to collapse them into one canonical **Employees** registry, entered once per person.

---

## 1. Current state (grounded in the code)

| Store | Shape | Purpose | Read by |
|---|---|---|---|
| **`app_users`** (table) | `email` (PK, lower-cased) · `name` · `role` · `addedByEmail` · `createdAt` | Login + permission — the security source of truth | `getAppUsers()`, auth scoping (`lib/auth.ts`), `UsersManager` |
| **`lumofy_staff`** (`workspace_config` JSON) | `[{ id, name, jobTitle, email, phone }]` | Internal directory used to populate stakeholder mapping | Stakeholder-mapping matrix (`components/clients/ClientProfileTabs.tsx`), `/api/admin/stakeholder-config`; managed by `LumofyStaffManager` |
| **`csm_users`** (table) | `id` · `name` · `email` (unique) · `initials` · `active` | Assignable account owners, **auto-synced from HubSpot** | Assignment (`lib/assignment/health.ts`, `run.ts`), team-member resolution (`lib/data.ts`), owner assignment, `/api/admin/csm-users` |

The same person can exist in one, two, three, or none of these, keyed loosely by email, with nothing keeping them aligned. That drift is exactly why "add from the directory, then set a permission" felt like duct tape.

---

## 2. Target model

**One canonical employee registry, built on `app_users`** (extended). A person is entered once:

```
name · title · department · email · phone · permission
```

- **Extend `app_users`** with three nullable columns: `title`, `phone`, `department`.
- **Permission vocabulary** (the `role` column): `super_admin | admin | <operator tiers> | guest | none`.
  - `none` = **No access**: a directory-only record — usable in stakeholder mapping, but the person can't log in. (Auth treats `none` like "no role": no access.)
- **One "Employees" list** in Settings → Members: the fields above plus the permission dropdown.
- **The three current uses all read from this one record:**
  - **login & access** → the `role`
  - **stakeholder mapping** → pick any employee
  - **account ownership** → the operators

### HubSpot sync decision
HubSpot stays the source of truth for **who owns accounts** (CSMs). The sync **upserts** those people into the employee registry (auto-adds them with a default operator role). The app registry is the canonical **view**; HubSpot feeds *into* it. **One-way**, no round-trip.

---

## 3. Migration — phased

### Phase 1 — merge the two *manual* lists (`app_users` + `lumofy_staff`)
This is the whole win and touches only one feature (stakeholder mapping).

1. **Schema:** add `title`, `phone`, `department` (all `text`, nullable) to `app_users`. Drizzle migration — additive, no data loss.
2. **Roles:** add `none` to `ROLES` with label **"No access"**; auth resolves `none` → no access (same as null). Existing UI "No access" (which today *removes* the row) becomes "set role = `none`", so the person stays in the one list.
3. **Data migration** (idempotent script, run once against prod):
   - For each `lumofy_staff` entry, keyed by `lower(trim(email))`:
     - **row exists in `app_users`** → fill `title`/`phone` (and `department` if known); **do not touch `role`**.
     - **no row** → insert `{ email, name, title, phone, role: "none" }`.
   - **Never downgrade** a permanent super-admin (`env.superAdminEmails`).
4. **Repoint stakeholder mapping** — `ClientProfileTabs` and `/api/admin/stakeholder-config` read/write the profile (name/title/phone) from the employee registry instead of the `lumofy_staff` JSON.
5. **UI:** replace `UsersManager` + `LumofyStaffManager` with one **`EmployeesManager`** (name, title, department, email, phone, permission). "No access" = `none`.
6. **Verify** (checklist below), then **retire** the `lumofy_staff` `workspace_config` key.

### Phase 2 — fold `csm_users` (optional, later, separate PR)
Bigger, because it touches assignment routing.
- HubSpot sync **upserts owners into `app_users`** (default operator role + team) instead of maintaining a separate table.
- Repoint assignment (`health.ts`, `run.ts`, capacity) and owner resolution to read operators from the employee registry.
- Retire the `csm_users` table.
- Do this **only after Phase 1 is verified** — it changes the routing/capacity data source.

---

## 4. What repoints where (Phase 1)

| Consumer | Today | After |
|---|---|---|
| Stakeholder-mapping matrix (`ClientProfileTabs`) | `lumofy_staff` JSON | employee registry (`app_users`) |
| `/api/admin/stakeholder-config` (PUT) | `workspace_config` write | employee-registry writes |
| Settings directory (`LumofyStaffManager`) | `lumofy_staff` | `EmployeesManager` |
| Settings login list (`UsersManager`) | `app_users` | merged into `EmployeesManager` |
| `getAppUsers()` / auth scoping | `app_users` (+ csm_users + env) | unchanged — same table, now with richer rows |
| Assignment / ownership (`csm_users`) | `csm_users` | **unchanged in Phase 1** (folded in Phase 2) |

---

## 5. Verification checklist (post-migration, on the live authed app)

- [ ] Employees list shows everyone from all sources, **once each** (no duplicates by email).
- [ ] Existing permissions unchanged — spot-check a super-admin, an operator, a guest.
- [ ] Stakeholder-mapping matrix still lists the same people and **saves**.
- [ ] A `none` (No access) employee **cannot** log in but **appears** in stakeholder mapping.
- [ ] Adding a new employee with a department + a role works end-to-end (they can log in at that role).
- [ ] No account "lost" an owner (Phase 1 leaves `csm_users` untouched).

---

## 6. Rollback

- The migration is **additive** — new nullable columns + copied rows. The `lumofy_staff` JSON is **left in place** until sign-off.
- If a repointed reader misbehaves, revert that reader to `lumofy_staff`; **no data is lost**.
- Drop the `lumofy_staff` key **only after** the checklist passes.

---

## 7. Risks

- **Email mismatches** — normalize to `lower(trim(email))` everywhere the merge keys on email.
- **Super-admin downgrade** — the merge must never lower a permanent super-admin's role.
- **Stakeholder mapping is the single reader of `lumofy_staff`** — the repoint (step 4) is the one behavior-critical change; verify it explicitly.
- **`none` role in auth** — must be handled as "no access" in `getCurrentUserRole`/scoping so a `none` employee can't slip through as an operator.
- **Prod data + no local auth to verify** — run the migration deliberately with the checklist above; keep the old data until signed off.

---

## 8. Out of scope (for this consolidation)

- The permission *engine* itself — already done (Super Admin / Admin / Operator / Guest, with the see/edit split). This spec only unifies the *list of people*, not what the roles can do.
- Any change to how HubSpot decides who's a CSM — HubSpot stays authoritative for account owners.
