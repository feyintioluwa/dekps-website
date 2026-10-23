import type { Exam } from "@/lib/cbt-types";

export default function ExamFields({ exam }: { exam?: Exam }) {
  return (
    <div className="adm-form-grid">
      <label className="adm-field adm-span-2">
        <span>Exam title</span>
        <input name="title" defaultValue={exam?.title} placeholder="e.g. First Term Mathematics Exam" maxLength={150} required />
      </label>

      <label className="adm-field">
        <span>Subject</span>
        <input name="subject" defaultValue={exam?.subject} placeholder="e.g. Mathematics" maxLength={100} required />
      </label>

      <label className="adm-field">
        <span>Class</span>
        <input name="class_name" defaultValue={exam?.class_name ?? ""} placeholder="e.g. JSS 1 (leave empty for all classes)" maxLength={50} />
        <small>Must match the class name used on the students&apos; records.</small>
      </label>

      <label className="adm-field">
        <span>Duration (minutes)</span>
        <input name="duration_minutes" type="number" min={1} max={600} defaultValue={exam?.duration_minutes ?? 30} required />
      </label>

      <label className="adm-field">
        <span>Term (optional)</span>
        <input name="term" defaultValue={exam?.term ?? ""} placeholder="e.g. Third Term" maxLength={50} />
      </label>

      <label className="adm-field">
        <span>Session (optional)</span>
        <input name="session" defaultValue={exam?.session ?? ""} placeholder="e.g. 2026/2027" maxLength={20} />
      </label>

      <label className="adm-field adm-span-2">
        <span>Extra instructions (optional)</span>
        <textarea name="instructions" rows={3} defaultValue={exam?.instructions ?? ""} placeholder="Shown to students before they begin." maxLength={3000} />
      </label>

      <label className="adm-check adm-span-2">
        <input type="checkbox" name="shuffle_questions" defaultChecked={exam?.shuffle_questions ?? false} />
        <span>Shuffle the question order for each student</span>
      </label>

      <label className="adm-check adm-span-2">
        <input type="checkbox" name="show_score" defaultChecked={exam?.show_score ?? true} />
        <span>Show the score to the student right after they submit</span>
      </label>
    </div>
  );
}
