import { OPTION_KEYS, type Question } from "@/lib/cbt-types";

export default function QuestionFields({ q }: { q?: Question }) {
  const options = [q?.option_a, q?.option_b, q?.option_c, q?.option_d];

  return (
    <div className="adm-form-grid">
      <label className="adm-field adm-span-2">
        <span>Question</span>
        <textarea name="question_text" rows={3} defaultValue={q?.question_text} maxLength={1500} required />
      </label>

      {OPTION_KEYS.map((key, i) => (
        <label className="adm-field" key={key}>
          <span>
            Option {key}
            {i >= 2 ? " (optional)" : ""}
          </span>
          <input
            name={`option_${key.toLowerCase()}`}
            defaultValue={options[i] ?? ""}
            maxLength={300}
            required={i < 2}
          />
        </label>
      ))}

      <label className="adm-field">
        <span>Correct answer</span>
        <select name="correct_option" defaultValue={q?.correct_option ?? "A"} required>
          {OPTION_KEYS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </label>

      <label className="adm-field">
        <span>Marks</span>
        <input name="marks" type="number" min={1} max={100} defaultValue={q?.marks ?? 1} required />
      </label>
    </div>
  );
}
