-- Phase 5B-1: classes (and through them sections) become academic-year scoped.
--
-- IMPORTANT - this migration changes STRUCTURE ONLY. It does not move, copy,
-- stamp or delete a single existing row. Existing classes keep a NULL
-- "academicYearId" until someone explicitly runs the backfill:
--
--     SELECT * FROM class_year_backfill(true);    -- dry run: report only, writes nothing
--     SELECT * FROM class_year_backfill(false);   -- the real, atomic, logged backfill
--     SELECT * FROM class_year_rollback(NULL, true);   -- rollback dry run
--     SELECT * FROM class_year_rollback(NULL, false);  -- undo the latest backfill run
--
-- Identity of a class becomes School (via Division) + Academic Year + Level.

-- DropIndex: a level is no longer unique per division, only per division + year.
DROP INDEX "classes_divisionId_level_key";

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "academicYearId" TEXT;

-- CreateTable: audit + rollback log of the backfill.
CREATE TABLE "class_year_backfill_changes" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "columnName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_year_backfill_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_year_backfill_changes_runId_idx" ON "class_year_backfill_changes"("runId");

-- CreateIndex
CREATE INDEX "classes_academicYearId_idx" ON "classes"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_divisionId_academicYearId_level_key" ON "classes"("divisionId", "academicYearId", "level");

-- CreateIndex (transitional guard): while a class can still exist WITHOUT a year
-- (before the backfill, and for a writer that does not set it yet), keep the
-- old "one class per level per division" rule for exactly those rows, so the
-- unique index above (NULLs are distinct in Postgres) cannot let duplicates in.
-- Prisma cannot express a partial index and does not report it as drift. The
-- migration that makes "academicYearId" required drops this index.
CREATE UNIQUE INDEX "classes_divisionId_level_unstamped_key" ON "classes"("divisionId", "level") WHERE "academicYearId" IS NULL;

-- AddForeignKey: NO ACTION (checked at end of statement) so a whole-school
-- delete can still cascade years and classes together, while deleting a year
-- that still owns classes is refused.
ALTER TABLE "classes" ADD CONSTRAINT "classes_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- class_year_backfill(p_dry_run, p_school_id)
--
-- Maps every not-yet-stamped class to one class PER ACADEMIC YEAR that
-- actually references it (an enrollment, an exam subject, a result
-- submission, a teacher assignment, or a class fee structure):
--   * the EARLIEST referenced year KEEPS the original class row (its id, its
--     sections, its subject links stay exactly as they are); it is only
--     stamped with that year;
--   * every LATER referenced year gets a NEW class row (same division, name
--     and level) with copies of the sections and the subject links, and
--     everything that belongs to that year is re-pointed to the new rows.
-- Nothing is ever deleted. Student ids, student numbers, roll numbers,
-- statuses, results, attendance, marks and teacher identities are never
-- touched: only the classId / sectionId pointers of the re-pointed rows change.
--
-- p_dry_run = true (default) writes nothing and reports the plan and every
-- safety check. p_dry_run = false refuses to run if any check fails, runs in
-- one atomic statement (any error rolls everything back), logs every change
-- to class_year_backfill_changes, and re-verifies the result before returning.
-- Running it again is a no-op: only classes whose year is still NULL are
-- considered. p_school_id limits the run to one school (NULL = all schools).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION class_year_backfill(p_dry_run boolean DEFAULT true, p_school_id text DEFAULT NULL)
RETURNS TABLE (r_kind text, r_item text, r_expected bigint, r_actual bigint, r_verdict text)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_run text := gen_random_uuid()::text;
  v_failed bigint;
  v_bad bigint;
  v_planned bigint;
  v_add_classes bigint;
  v_add_sections bigint;
  v_add_links bigint;
  b_classes bigint;
  b_sections bigint;
  b_links bigint;
  b_enrollments bigint;
  b_students bigint;
  b_results bigint;
  b_attendance bigint;
  b_exam_subjects bigint;
  b_submissions bigint;
  b_assignments bigint;
  b_fees bigint;
BEGIN
  DROP TABLE IF EXISTS _cyb_plan;
  DROP TABLE IF EXISTS _cyb_sec;
  DROP TABLE IF EXISTS _cyb_report;

  IF NOT p_dry_run THEN
    -- Nobody may write to the tables being re-pointed while this runs.
    LOCK TABLE classes, sections, class_subjects, student_enrollments, exam_subjects,
               result_submissions, teacher_assignments, fee_structures IN SHARE ROW EXCLUSIVE MODE;
  END IF;

  -- One row per (unstamped class, referenced year); rn = 1 is the earliest year.
  CREATE TEMP TABLE _cyb_plan ON COMMIT DROP AS
  WITH refs AS (
    SELECT en."classId" AS class_id, en."academicYearId" AS year_id FROM student_enrollments en
    UNION SELECT es."classId", e."academicYearId" FROM exam_subjects es JOIN exams e ON e.id = es."examId"
    UNION SELECT sec."classId", ta."academicYearId" FROM teacher_assignments ta JOIN sections sec ON sec.id = ta."sectionId"
    UNION SELECT f."classId", f."academicYearId" FROM fee_structures f WHERE f."classId" IS NOT NULL
    UNION SELECT sec."classId", e."academicYearId" FROM result_submissions rs
          JOIN sections sec ON sec.id = rs."sectionId" JOIN exam_subjects es ON es.id = rs."examSubjectId"
          JOIN exams e ON e.id = es."examId"
  ), ranked AS (
    SELECT r.class_id, r.year_id, ay."startDate" AS year_start, ay."schoolId" AS year_school,
           row_number() OVER (PARTITION BY r.class_id ORDER BY ay."startDate", ay.id) AS rn
    FROM refs r
    JOIN academic_years ay ON ay.id = r.year_id
    JOIN classes c ON c.id = r.class_id
    JOIN divisions d ON d.id = c."divisionId"
    WHERE c."academicYearId" IS NULL AND (p_school_id IS NULL OR d."schoolId" = p_school_id)
  )
  SELECT class_id, year_id, year_start, year_school, rn::int AS rn,
         CASE WHEN rn = 1 THEN class_id ELSE gen_random_uuid()::text END AS new_class_id
  FROM ranked;

  -- One row per (planned class's section, referenced year) with its target section.
  CREATE TEMP TABLE _cyb_sec ON COMMIT DROP AS
  SELECT sec.id AS old_section_id, p.year_id, p.rn, p.class_id, p.new_class_id,
         CASE WHEN p.rn = 1 THEN sec.id ELSE gen_random_uuid()::text END AS new_section_id
  FROM sections sec JOIN _cyb_plan p ON p.class_id = sec."classId";

  CREATE TEMP TABLE _cyb_report (k text, item text, exp_n bigint, act_n bigint, verdict text) ON COMMIT DROP;

  -- ---- safety checks: each must find 0 problems --------------------------------
  INSERT INTO _cyb_report
  SELECT 'CHECK', 'classes with no reference from any year (no year can be inferred - decide them first)', 0,
         (SELECT count(*) FROM classes c JOIN divisions d ON d.id = c."divisionId"
           WHERE c."academicYearId" IS NULL AND (p_school_id IS NULL OR d."schoolId" = p_school_id)
             AND NOT EXISTS (SELECT 1 FROM _cyb_plan p WHERE p.class_id = c.id)), NULL;

  INSERT INTO _cyb_report
  SELECT 'CHECK', 'classes whose two earliest referenced years share the same start date (keeper would be a guess)', 0,
         (SELECT count(*) FROM (SELECT class_id FROM _cyb_plan GROUP BY class_id, year_start HAVING count(*) > 1) t), NULL;

  INSERT INTO _cyb_report
  SELECT 'CHECK', 'referenced years that belong to a different school than the class', 0,
         (SELECT count(*) FROM _cyb_plan p JOIN classes c ON c.id = p.class_id JOIN divisions d ON d.id = c."divisionId"
           WHERE p.year_school <> d."schoolId"), NULL;

  INSERT INTO _cyb_report
  SELECT 'CHECK', 'planned (division, level, year) already taken by another class, or planned twice', 0,
         (SELECT count(*) FROM _cyb_plan p JOIN classes c ON c.id = p.class_id
           WHERE EXISTS (SELECT 1 FROM classes o WHERE o.id <> c.id AND o."divisionId" = c."divisionId" AND o.level = c.level
                           AND o."academicYearId" = p.year_id))
       + (SELECT count(*) FROM (SELECT c."divisionId", c.level, p.year_id FROM _cyb_plan p JOIN classes c ON c.id = p.class_id
                                GROUP BY c."divisionId", c.level, p.year_id HAVING count(*) > 1) t), NULL;

  INSERT INTO _cyb_report
  SELECT 'CHECK', 'enrollments whose section is not part of their own class', 0,
         (SELECT count(*) FROM student_enrollments en JOIN sections sec ON sec.id = en."sectionId"
           WHERE sec."classId" <> en."classId" AND en."classId" IN (SELECT class_id FROM _cyb_plan)), NULL;

  INSERT INTO _cyb_report
  SELECT 'CHECK', 'result submissions whose section belongs to a different class than the exam subject', 0,
         (SELECT count(*) FROM result_submissions rs JOIN sections sec ON sec.id = rs."sectionId"
            JOIN exam_subjects es ON es.id = rs."examSubjectId"
           WHERE sec."classId" <> es."classId" AND es."classId" IN (SELECT class_id FROM _cyb_plan)), NULL;

  INSERT INTO _cyb_report
  SELECT 'CHECK', 'results whose enrollment year, section or class disagrees with their submission and exam', 0,
         (SELECT count(*) FROM results r
            JOIN result_submissions rs ON rs.id = r."resultSubmissionId"
            JOIN exam_subjects es ON es.id = r."examSubjectId" JOIN exams e ON e.id = es."examId"
            JOIN student_enrollments en ON en.id = r."enrollmentId"
           WHERE es."classId" IN (SELECT class_id FROM _cyb_plan)
             AND (en."sectionId" <> rs."sectionId" OR en."classId" <> es."classId" OR en."academicYearId" <> e."academicYearId")), NULL;

  UPDATE _cyb_report SET verdict = CASE WHEN act_n = exp_n THEN 'PASS' ELSE 'FAIL' END;

  -- ---- the plan, as counts ----------------------------------------------------------
  v_planned := (SELECT count(*) FROM _cyb_plan);
  v_add_classes := (SELECT count(*) FROM _cyb_plan WHERE rn > 1);
  v_add_sections := (SELECT count(*) FROM _cyb_sec WHERE rn > 1);
  v_add_links := (SELECT count(*) FROM class_subjects cs JOIN _cyb_plan p ON p.class_id = cs."classId" WHERE p.rn > 1);

  INSERT INTO _cyb_report VALUES
    ('PLAN', 'classes to stamp with their year (original row kept, KEEP)', NULL, (SELECT count(*) FROM _cyb_plan WHERE rn = 1), 'INFO'),
    ('PLAN', 'classes to add (one per later referenced year, ADD)', NULL, v_add_classes, 'INFO'),
    ('PLAN', 'sections to add (copies for the ADD classes)', NULL, v_add_sections, 'INFO'),
    ('PLAN', 'class-subject links to add (copies for the ADD classes)', NULL, v_add_links, 'INFO'),
    ('PLAN', 'enrollments to re-point to their own year''s class and section', NULL,
       (SELECT count(*) FROM student_enrollments en JOIN _cyb_plan p ON p.class_id = en."classId" AND p.year_id = en."academicYearId" AND p.rn > 1), 'INFO'),
    ('PLAN', 'exam subjects to re-point', NULL,
       (SELECT count(*) FROM exam_subjects es JOIN exams e ON e.id = es."examId" JOIN _cyb_plan p ON p.class_id = es."classId" AND p.year_id = e."academicYearId" AND p.rn > 1), 'INFO'),
    ('PLAN', 'result submissions to re-point', NULL,
       (SELECT count(*) FROM result_submissions rs JOIN exam_subjects es ON es.id = rs."examSubjectId" JOIN exams e ON e.id = es."examId"
          JOIN _cyb_sec sm ON sm.old_section_id = rs."sectionId" AND sm.year_id = e."academicYearId" AND sm.rn > 1), 'INFO'),
    ('PLAN', 'teacher assignments to re-point', NULL,
       (SELECT count(*) FROM teacher_assignments ta JOIN _cyb_sec sm ON sm.old_section_id = ta."sectionId" AND sm.year_id = ta."academicYearId" AND sm.rn > 1), 'INFO'),
    ('PLAN', 'class fee structures to re-point', NULL,
       (SELECT count(*) FROM fee_structures f JOIN _cyb_plan p ON p.class_id = f."classId" AND p.year_id = f."academicYearId" AND p.rn > 1), 'INFO');

  v_failed := (SELECT count(*) FROM _cyb_report WHERE verdict = 'FAIL');

  IF p_dry_run THEN
    RETURN QUERY SELECT k, item, exp_n, act_n, verdict FROM _cyb_report ORDER BY k DESC, item;
    RETURN;
  END IF;

  IF v_planned = 0 AND v_failed = 0 THEN
    RETURN QUERY SELECT 'RESULT'::text, 'nothing to do: no unstamped class is referenced by any year'::text, NULL::bigint, 0::bigint, 'NO-OP'::text;
    RETURN;
  END IF;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'class_year_backfill refused: % safety check(s) failed. Nothing was changed. Run class_year_backfill(true) to see which.', v_failed;
  END IF;

  -- ---- baselines for the "nothing lost" verification -----------------------------
  b_classes := (SELECT count(*) FROM classes);
  b_sections := (SELECT count(*) FROM sections);
  b_links := (SELECT count(*) FROM class_subjects);
  b_enrollments := (SELECT count(*) FROM student_enrollments WHERE p_school_id IS NULL OR "schoolId" = p_school_id);
  b_students := (SELECT count(DISTINCT "studentId") FROM student_enrollments WHERE p_school_id IS NULL OR "schoolId" = p_school_id);
  b_results := (SELECT count(*) FROM results r JOIN student_enrollments en ON en.id = r."enrollmentId" WHERE p_school_id IS NULL OR en."schoolId" = p_school_id);
  b_attendance := (SELECT count(*) FROM attendance_records a JOIN student_enrollments en ON en.id = a."enrollmentId" WHERE p_school_id IS NULL OR en."schoolId" = p_school_id);
  b_exam_subjects := (SELECT count(*) FROM exam_subjects es JOIN exams e ON e.id = es."examId" WHERE p_school_id IS NULL OR e."schoolId" = p_school_id);
  b_submissions := (SELECT count(*) FROM result_submissions rs JOIN exam_subjects es ON es.id = rs."examSubjectId" JOIN exams e ON e.id = es."examId" WHERE p_school_id IS NULL OR e."schoolId" = p_school_id);
  b_assignments := (SELECT count(*) FROM teacher_assignments WHERE p_school_id IS NULL OR "schoolId" = p_school_id);
  b_fees := (SELECT count(*) FROM fee_structures WHERE p_school_id IS NULL OR "schoolId" = p_school_id);

  -- ---- 1. new classes, sections and subject links for every LATER year -----------
  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId")
  SELECT v_run, 'INSERT', 'classes', p.new_class_id FROM _cyb_plan p WHERE p.rn > 1;
  INSERT INTO classes (id, "divisionId", name, level, "academicYearId", "createdAt", "updatedAt")
  SELECT p.new_class_id, c."divisionId", c.name, c.level, p.year_id, now(), now()
  FROM _cyb_plan p JOIN classes c ON c.id = p.class_id WHERE p.rn > 1;

  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId")
  SELECT v_run, 'INSERT', 'sections', sm.new_section_id FROM _cyb_sec sm WHERE sm.rn > 1;
  INSERT INTO sections (id, "classId", name, capacity, "createdAt", "updatedAt")
  SELECT sm.new_section_id, sm.new_class_id, sec.name, sec.capacity, now(), now()
  FROM _cyb_sec sm JOIN sections sec ON sec.id = sm.old_section_id WHERE sm.rn > 1;

  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId")
  SELECT v_run, 'INSERT', 'class_subjects', p.new_class_id || '|' || cs."subjectId"
  FROM class_subjects cs JOIN _cyb_plan p ON p.class_id = cs."classId" WHERE p.rn > 1;
  INSERT INTO class_subjects ("classId", "subjectId")
  SELECT p.new_class_id, cs."subjectId" FROM class_subjects cs JOIN _cyb_plan p ON p.class_id = cs."classId" WHERE p.rn > 1;

  -- ---- 2. re-point everything that belongs to a LATER year (log first, then move) ---
  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId", "columnName", "oldValue", "newValue")
  SELECT v_run, 'UPDATE', 'student_enrollments', en.id, 'classId', en."classId", p.new_class_id
  FROM student_enrollments en JOIN _cyb_plan p ON p.class_id = en."classId" AND p.year_id = en."academicYearId" AND p.rn > 1;
  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId", "columnName", "oldValue", "newValue")
  SELECT v_run, 'UPDATE', 'student_enrollments', en.id, 'sectionId', en."sectionId", sm.new_section_id
  FROM student_enrollments en JOIN _cyb_sec sm ON sm.old_section_id = en."sectionId" AND sm.year_id = en."academicYearId" AND sm.rn > 1;
  UPDATE student_enrollments en SET "classId" = p.new_class_id, "sectionId" = sm.new_section_id
  FROM _cyb_plan p, _cyb_sec sm
  WHERE p.class_id = en."classId" AND p.year_id = en."academicYearId" AND p.rn > 1
    AND sm.old_section_id = en."sectionId" AND sm.year_id = en."academicYearId";

  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId", "columnName", "oldValue", "newValue")
  SELECT v_run, 'UPDATE', 'exam_subjects', es.id, 'classId', es."classId", p.new_class_id
  FROM exam_subjects es JOIN exams e ON e.id = es."examId"
  JOIN _cyb_plan p ON p.class_id = es."classId" AND p.year_id = e."academicYearId" AND p.rn > 1;
  UPDATE exam_subjects es SET "classId" = p.new_class_id
  FROM exams e, _cyb_plan p
  WHERE e.id = es."examId" AND p.class_id = es."classId" AND p.year_id = e."academicYearId" AND p.rn > 1;

  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId", "columnName", "oldValue", "newValue")
  SELECT v_run, 'UPDATE', 'result_submissions', rs.id, 'sectionId', rs."sectionId", sm.new_section_id
  FROM result_submissions rs JOIN exam_subjects es ON es.id = rs."examSubjectId" JOIN exams e ON e.id = es."examId"
  JOIN _cyb_sec sm ON sm.old_section_id = rs."sectionId" AND sm.year_id = e."academicYearId" AND sm.rn > 1;
  UPDATE result_submissions rs SET "sectionId" = sm.new_section_id
  FROM exam_subjects es, exams e, _cyb_sec sm
  WHERE es.id = rs."examSubjectId" AND e.id = es."examId"
    AND sm.old_section_id = rs."sectionId" AND sm.year_id = e."academicYearId" AND sm.rn > 1;

  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId", "columnName", "oldValue", "newValue")
  SELECT v_run, 'UPDATE', 'teacher_assignments', ta.id, 'sectionId', ta."sectionId", sm.new_section_id
  FROM teacher_assignments ta JOIN _cyb_sec sm ON sm.old_section_id = ta."sectionId" AND sm.year_id = ta."academicYearId" AND sm.rn > 1;
  UPDATE teacher_assignments ta SET "sectionId" = sm.new_section_id
  FROM _cyb_sec sm
  WHERE sm.old_section_id = ta."sectionId" AND sm.year_id = ta."academicYearId" AND sm.rn > 1;

  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId", "columnName", "oldValue", "newValue")
  SELECT v_run, 'UPDATE', 'fee_structures', f.id, 'classId', f."classId", p.new_class_id
  FROM fee_structures f JOIN _cyb_plan p ON p.class_id = f."classId" AND p.year_id = f."academicYearId" AND p.rn > 1;
  UPDATE fee_structures f SET "classId" = p.new_class_id
  FROM _cyb_plan p
  WHERE p.class_id = f."classId" AND p.year_id = f."academicYearId" AND p.rn > 1;

  -- ---- 3. stamp the original rows with their (earliest) year ----------------------
  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId", "columnName", "oldValue", "newValue")
  SELECT v_run, 'UPDATE', 'classes', p.class_id, 'academicYearId', NULL, p.year_id FROM _cyb_plan p WHERE p.rn = 1;
  UPDATE classes c SET "academicYearId" = p.year_id FROM _cyb_plan p WHERE p.rn = 1 AND c.id = p.class_id;

  -- ---- 4. verify, or roll everything back by raising ------------------------------
  v_bad := (SELECT count(*) FROM classes c WHERE c.id IN (SELECT class_id FROM _cyb_plan) AND c."academicYearId" IS NULL);
  IF v_bad <> 0 THEN RAISE EXCEPTION 'class_year_backfill verification failed: % class(es) still without a year', v_bad; END IF;

  v_bad := (SELECT count(*) FROM student_enrollments en JOIN classes c ON c.id = en."classId"
             WHERE c."academicYearId" IS NOT NULL AND c."academicYearId" <> en."academicYearId");
  IF v_bad <> 0 THEN RAISE EXCEPTION 'class_year_backfill verification failed: % enrollment(s) point at a class of another year', v_bad; END IF;

  v_bad := (SELECT count(*) FROM student_enrollments en JOIN sections sec ON sec.id = en."sectionId" WHERE sec."classId" <> en."classId"
             AND en."classId" IN (SELECT new_class_id FROM _cyb_plan));
  IF v_bad <> 0 THEN RAISE EXCEPTION 'class_year_backfill verification failed: % enrollment(s) point at a section outside their class', v_bad; END IF;

  v_bad := (SELECT count(*) FROM exam_subjects es JOIN exams e ON e.id = es."examId" JOIN classes c ON c.id = es."classId"
             WHERE c."academicYearId" IS NOT NULL AND c."academicYearId" <> e."academicYearId");
  IF v_bad <> 0 THEN RAISE EXCEPTION 'class_year_backfill verification failed: % exam subject(s) point at a class of another year', v_bad; END IF;

  v_bad := (SELECT count(*) FROM result_submissions rs JOIN exam_subjects es ON es.id = rs."examSubjectId" JOIN exams e ON e.id = es."examId"
              JOIN sections sec ON sec.id = rs."sectionId" JOIN classes c ON c.id = sec."classId"
             WHERE sec."classId" <> es."classId" OR (c."academicYearId" IS NOT NULL AND c."academicYearId" <> e."academicYearId"));
  IF v_bad <> 0 THEN RAISE EXCEPTION 'class_year_backfill verification failed: % result submission(s) point at a section of another class or year', v_bad; END IF;

  v_bad := (SELECT count(*) FROM teacher_assignments ta JOIN sections sec ON sec.id = ta."sectionId" JOIN classes c ON c.id = sec."classId"
             WHERE c."academicYearId" IS NOT NULL AND c."academicYearId" <> ta."academicYearId");
  IF v_bad <> 0 THEN RAISE EXCEPTION 'class_year_backfill verification failed: % teacher assignment(s) point at a section of another year', v_bad; END IF;

  v_bad := (SELECT count(*) FROM fee_structures f JOIN classes c ON c.id = f."classId"
             WHERE c."academicYearId" IS NOT NULL AND c."academicYearId" <> f."academicYearId");
  IF v_bad <> 0 THEN RAISE EXCEPTION 'class_year_backfill verification failed: % fee structure(s) point at a class of another year', v_bad; END IF;

  IF (SELECT count(*) FROM classes) <> b_classes + v_add_classes THEN RAISE EXCEPTION 'class_year_backfill verification failed: class count'; END IF;
  IF (SELECT count(*) FROM sections) <> b_sections + v_add_sections THEN RAISE EXCEPTION 'class_year_backfill verification failed: section count'; END IF;
  IF (SELECT count(*) FROM class_subjects) <> b_links + v_add_links THEN RAISE EXCEPTION 'class_year_backfill verification failed: class-subject count'; END IF;
  IF (SELECT count(*) FROM student_enrollments WHERE p_school_id IS NULL OR "schoolId" = p_school_id) <> b_enrollments THEN RAISE EXCEPTION 'class_year_backfill verification failed: enrollment count changed'; END IF;
  IF (SELECT count(DISTINCT "studentId") FROM student_enrollments WHERE p_school_id IS NULL OR "schoolId" = p_school_id) <> b_students THEN RAISE EXCEPTION 'class_year_backfill verification failed: student count changed'; END IF;
  IF (SELECT count(*) FROM results r JOIN student_enrollments en ON en.id = r."enrollmentId" WHERE p_school_id IS NULL OR en."schoolId" = p_school_id) <> b_results THEN RAISE EXCEPTION 'class_year_backfill verification failed: result count changed'; END IF;
  IF (SELECT count(*) FROM attendance_records a JOIN student_enrollments en ON en.id = a."enrollmentId" WHERE p_school_id IS NULL OR en."schoolId" = p_school_id) <> b_attendance THEN RAISE EXCEPTION 'class_year_backfill verification failed: attendance count changed'; END IF;
  IF (SELECT count(*) FROM exam_subjects es JOIN exams e ON e.id = es."examId" WHERE p_school_id IS NULL OR e."schoolId" = p_school_id) <> b_exam_subjects THEN RAISE EXCEPTION 'class_year_backfill verification failed: exam subject count changed'; END IF;
  IF (SELECT count(*) FROM result_submissions rs JOIN exam_subjects es ON es.id = rs."examSubjectId" JOIN exams e ON e.id = es."examId" WHERE p_school_id IS NULL OR e."schoolId" = p_school_id) <> b_submissions THEN RAISE EXCEPTION 'class_year_backfill verification failed: submission count changed'; END IF;
  IF (SELECT count(*) FROM teacher_assignments WHERE p_school_id IS NULL OR "schoolId" = p_school_id) <> b_assignments THEN RAISE EXCEPTION 'class_year_backfill verification failed: assignment count changed'; END IF;
  IF (SELECT count(*) FROM fee_structures WHERE p_school_id IS NULL OR "schoolId" = p_school_id) <> b_fees THEN RAISE EXCEPTION 'class_year_backfill verification failed: fee structure count changed'; END IF;

  RETURN QUERY
  SELECT 'RESULT'::text, 'run id (keep it: class_year_rollback uses it)'::text, NULL::bigint, NULL::bigint, v_run
  UNION ALL SELECT 'RESULT', 'classes stamped with their year', NULL, (SELECT count(*) FROM _cyb_plan WHERE rn = 1), 'DONE'
  UNION ALL SELECT 'RESULT', 'classes added', NULL, v_add_classes, 'DONE'
  UNION ALL SELECT 'RESULT', 'sections added', NULL, v_add_sections, 'DONE'
  UNION ALL SELECT 'RESULT', 'class-subject links added', NULL, v_add_links, 'DONE'
  UNION ALL SELECT 'RESULT', 'rows re-pointed (log entries)', NULL, (SELECT count(*) FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'UPDATE'), 'DONE'
  UNION ALL SELECT 'VERIFIED', 'enrollments, students, results, attendance, exam subjects, submissions, assignments, fees: counts unchanged; every row points at the class/section of its own year', NULL, NULL, 'PASS';
END;
$fn$;

-- ---------------------------------------------------------------------------
-- class_year_rollback(p_run_id, p_dry_run)
--
-- Undoes ONE backfill run from its log: re-points every moved row back to its
-- original class/section, removes the added subject links, sections and
-- classes, and un-stamps the kept classes. Refuses (changes nothing) if a row
-- was changed by someone else since, if any added class/section already has
-- newer data attached (e.g. a new-year enrollment), or if the run was already
-- rolled back. p_run_id NULL = the latest run. Not possible after the
-- "academicYearId" column is made required (a later, separate migration).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION class_year_rollback(p_run_id text DEFAULT NULL, p_dry_run boolean DEFAULT true)
RETURNS TABLE (r_kind text, r_item text, r_expected bigint, r_actual bigint, r_verdict text)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_run text;
  v_pair record;
  ch record;
  v_n bigint;
  v_conflicts bigint := 0;
  v_dependents bigint;
BEGIN
  v_run := coalesce(p_run_id, (SELECT "runId" FROM class_year_backfill_changes WHERE action <> 'ROLLED_BACK' ORDER BY id DESC LIMIT 1));
  IF v_run IS NULL THEN RAISE EXCEPTION 'class_year_rollback: no backfill run found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM class_year_backfill_changes WHERE "runId" = v_run AND action <> 'ROLLED_BACK') THEN
    RAISE EXCEPTION 'class_year_rollback: run % has no logged changes', v_run;
  END IF;
  IF EXISTS (SELECT 1 FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'ROLLED_BACK') THEN
    RAISE EXCEPTION 'class_year_rollback: run % was already rolled back', v_run;
  END IF;

  IF NOT p_dry_run THEN
    LOCK TABLE classes, sections, class_subjects, student_enrollments, exam_subjects,
               result_submissions, teacher_assignments, fee_structures IN SHARE ROW EXCLUSIVE MODE;
  END IF;

  -- Every re-pointed value must still be exactly what the backfill wrote.
  FOR v_pair IN SELECT DISTINCT "tableName" AS t, "columnName" AS c FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'UPDATE' LOOP
    EXECUTE format(
      'SELECT count(*) FROM class_year_backfill_changes l LEFT JOIN %I t ON t.id = l."rowId" '
      'WHERE l."runId" = $1 AND l.action = ''UPDATE'' AND l."tableName" = $2 AND l."columnName" = $3 '
      'AND t.%I IS DISTINCT FROM l."newValue"', v_pair.t, v_pair.c)
      INTO v_n USING v_run, v_pair.t, v_pair.c;
    v_conflicts := v_conflicts + v_n;
  END LOOP;

  -- Newer data attached to an ADDED class/section that this run did not put there.
  v_dependents :=
      (SELECT count(*) FROM student_enrollments en
        WHERE (en."classId" IN (SELECT "rowId" FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT' AND "tableName" = 'classes')
            OR en."sectionId" IN (SELECT "rowId" FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT' AND "tableName" = 'sections'))
          AND NOT EXISTS (SELECT 1 FROM class_year_backfill_changes u WHERE u."runId" = v_run AND u.action = 'UPDATE' AND u."tableName" = 'student_enrollments' AND u."rowId" = en.id))
    + (SELECT count(*) FROM exam_subjects es
        WHERE es."classId" IN (SELECT "rowId" FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT' AND "tableName" = 'classes')
          AND NOT EXISTS (SELECT 1 FROM class_year_backfill_changes u WHERE u."runId" = v_run AND u.action = 'UPDATE' AND u."tableName" = 'exam_subjects' AND u."rowId" = es.id))
    + (SELECT count(*) FROM result_submissions rs
        WHERE rs."sectionId" IN (SELECT "rowId" FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT' AND "tableName" = 'sections')
          AND NOT EXISTS (SELECT 1 FROM class_year_backfill_changes u WHERE u."runId" = v_run AND u.action = 'UPDATE' AND u."tableName" = 'result_submissions' AND u."rowId" = rs.id))
    + (SELECT count(*) FROM teacher_assignments ta
        WHERE ta."sectionId" IN (SELECT "rowId" FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT' AND "tableName" = 'sections')
          AND NOT EXISTS (SELECT 1 FROM class_year_backfill_changes u WHERE u."runId" = v_run AND u.action = 'UPDATE' AND u."tableName" = 'teacher_assignments' AND u."rowId" = ta.id))
    + (SELECT count(*) FROM fee_structures f
        WHERE f."classId" IN (SELECT "rowId" FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT' AND "tableName" = 'classes')
          AND NOT EXISTS (SELECT 1 FROM class_year_backfill_changes u WHERE u."runId" = v_run AND u.action = 'UPDATE' AND u."tableName" = 'fee_structures' AND u."rowId" = f.id));

  IF p_dry_run THEN
    RETURN QUERY
    SELECT 'ROLLBACK'::text, 'run being rolled back'::text, NULL::bigint, NULL::bigint, v_run
    UNION ALL SELECT 'ROLLBACK', 'logged inserts (classes + sections + subject links) that would be removed', NULL,
                     (SELECT count(*) FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT'), 'INFO'
    UNION ALL SELECT 'ROLLBACK', 'logged re-pointed values that would be restored', NULL,
                     (SELECT count(*) FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'UPDATE'), 'INFO'
    UNION ALL SELECT 'CHECK', 're-pointed values changed by someone else since the backfill', 0, v_conflicts,
                     CASE WHEN v_conflicts = 0 THEN 'PASS' ELSE 'FAIL' END
    UNION ALL SELECT 'CHECK', 'newer rows attached to an added class/section (rolling back would orphan them)', 0, v_dependents,
                     CASE WHEN v_dependents = 0 THEN 'PASS' ELSE 'FAIL' END;
    RETURN;
  END IF;

  IF v_conflicts <> 0 THEN RAISE EXCEPTION 'class_year_rollback refused: % re-pointed value(s) changed since the backfill. Nothing was changed.', v_conflicts; END IF;
  IF v_dependents <> 0 THEN RAISE EXCEPTION 'class_year_rollback refused: % newer row(s) are attached to an added class/section. Nothing was changed.', v_dependents; END IF;

  -- Undo in reverse order of the log: stamps, re-points, then the inserted rows.
  FOR ch IN SELECT * FROM class_year_backfill_changes WHERE "runId" = v_run AND action IN ('INSERT', 'UPDATE') ORDER BY id DESC LOOP
    IF ch.action = 'UPDATE' THEN
      EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2', ch."tableName", ch."columnName") USING ch."oldValue", ch."rowId";
    ELSIF ch."tableName" = 'class_subjects' THEN
      DELETE FROM class_subjects WHERE "classId" = split_part(ch."rowId", '|', 1) AND "subjectId" = split_part(ch."rowId", '|', 2);
    ELSIF ch."tableName" = 'sections' THEN
      DELETE FROM sections WHERE id = ch."rowId";
    ELSIF ch."tableName" = 'classes' THEN
      DELETE FROM classes WHERE id = ch."rowId";
    END IF;
  END LOOP;

  INSERT INTO class_year_backfill_changes ("runId", action, "tableName", "rowId") VALUES (v_run, 'ROLLED_BACK', 'run', v_run);

  v_n := (SELECT count(*) FROM classes c WHERE c.id IN (SELECT "rowId" FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT' AND "tableName" = 'classes'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'class_year_rollback verification failed: % added class(es) still exist', v_n; END IF;
  v_n := (SELECT count(*) FROM classes c WHERE c.id IN (SELECT "rowId" FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'UPDATE' AND "tableName" = 'classes') AND c."academicYearId" IS NOT NULL);
  IF v_n <> 0 THEN RAISE EXCEPTION 'class_year_rollback verification failed: % class(es) still stamped', v_n; END IF;

  RETURN QUERY
  SELECT 'RESULT'::text, 'rolled back run'::text, NULL::bigint, NULL::bigint, v_run
  UNION ALL SELECT 'RESULT', 'rows removed (classes + sections + subject links)', NULL,
                   (SELECT count(*) FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'INSERT'), 'DONE'
  UNION ALL SELECT 'RESULT', 'values restored', NULL,
                   (SELECT count(*) FROM class_year_backfill_changes WHERE "runId" = v_run AND action = 'UPDATE'), 'DONE';
END;
$fn$;
