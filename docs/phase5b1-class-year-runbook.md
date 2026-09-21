# Phase 5B-1 runbook: classes and sections become academic-year scoped

Migration: `packages/database/prisma/migrations/20260922000000_class_academic_year`

Every step that writes to production needs explicit approval first. Nothing here runs by itself.

## What the migration does (structure only)

- Adds a **nullable** `classes."academicYearId"` (foreign key to `academic_years`, NO ACTION).
- Replaces the unique key `(divisionId, level)` with `(divisionId, academicYearId, level)`, plus a partial unique index that keeps the old
  "one class per level" rule for classes that still have no year (transitional guard; dropped by the later "make it required" migration).
- Adds the log table `class_year_backfill_changes` and two SQL functions: `class_year_backfill` and `class_year_rollback`.
- It does **not** move, stamp, copy or delete any existing row. Deploying it changes no data.

## Order of production steps (each needs approval)

1. **Before the window:** Neon backup branch created and verified (D04 fingerprints identical on the branch and on `production`), Render auto-deploy checked (see below).
2. **Maintenance window opens:** nobody uses the app. Take the D04 baseline again.
3. **Apply the migration** (a deploy that runs `prisma migrate deploy`, or the SQL file run by hand in the Neon SQL editor). Structure only.
4. **Dry run** in the Neon SQL editor. Read-only, writes nothing:
   ```sql
   SELECT * FROM class_year_backfill(true);
   ```
   Every `CHECK` row must say `PASS`. Expected for production: classes to stamp 2, classes to add 1, sections to add 1, class-subject links to add 7,
   enrollments to re-point 17, everything else 0.
5. **Backfill** (atomic; refuses to run if any check fails; verifies itself before returning; copy the run id it prints):
   ```sql
   SELECT * FROM class_year_backfill(false);
   ```
6. **Verify:** re-run D04 and compare with the baseline (only classes +1, sections +1, class_subjects +7 may differ; every fingerprint identical), re-run D03,
   open the app and check Form 3 for both years.
7. **Later, with 5B-2:** a separate migration makes `academicYearId` required and drops the transitional guard. After that, rollback is only possible from the backup branch.

## Calling the functions

The parameters are named `p_dry_run` / `p_school_id`, so call them positionally or with those exact names:
`class_year_backfill(true)`, `class_year_backfill(p_dry_run => true)`. `class_year_backfill(dry_run => true)` does **not** exist and fails with
"function ... does not exist".

## Until 5B-2 ships: the app still runs the OLD backend code

Applying the migration alone changes no data, so the app behaves exactly as before (one class per level, all without a year).
The risky moment is **after the backfill**, while the old backend is still live. Freeze these until 5B-2 is deployed:

- **Promotion** (especially "Retained"): the old code puts the new enrollment on the OLD class row (stamped with the old year), which breaks
  "an enrollment points at the class of its own year".
- **Adding classes**, Form 1 Transition and Transfers: the old code does not set or check the year.
- Opening **Form 3** by its clean URL (`.../classes/secondary-3`): the slug resolves by level only and can land on either year's Form 3.
- The Classes list shows **both** Form 3 rows (2025-2026 and 2026-2027) with the same name.

Safest: run the backfill in the same maintenance window as the 5B-2 backend deploy, or keep the app in read-only use until then.

## Rollback (only until the "required" migration ships)

```sql
SELECT * FROM class_year_rollback(NULL, true);    -- dry run: shows what would be undone, and whether it is still safe
SELECT * FROM class_year_rollback(NULL, false);   -- undo the latest run (or pass the run id)
```

It re-points every moved row back, removes the added subject links, sections and classes, and un-stamps the kept classes. It refuses (changing nothing) if a
re-pointed row was changed since, if any added class/section already has newer data attached, or if that run was already rolled back.
The full-fidelity rollback is always the Neon backup branch.

## Render: what to check before any production push

I could not see Render's settings from the repository, so this is unverified. Open the API service in the Render dashboard, then **Settings**:

1. **Build Command**: does it contain `prisma migrate deploy` (or `db:migrate`, or `migrate`)?
2. **Pre-Deploy Command**: this field runs before every deploy and is where migrations are most often placed. Is `prisma migrate deploy` there?
3. **Start Command**: does it run a migration before `node dist/main.js`?
4. **Auto-Deploy**: is it "On Commit" (every push to `main` deploys) or "Off"?

If any of 1-3 runs `prisma migrate deploy` and Auto-Deploy is on, **a push to `main` applies this migration to production immediately**.
Before any push, set Auto-Deploy to Off (or manual) and trigger the deploy yourself inside the maintenance window, after the backup is verified.
