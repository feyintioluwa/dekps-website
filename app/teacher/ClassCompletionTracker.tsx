
"use client";

type Subject = {
  id: string;
  name: string;
};

type ClassCard = {
  id: string;
  name: string;
  subjects: Subject[];
};

export type CompletionItem = {
  classId: string;
  subjectId: string;
  completed: number;
  required: number;
  remaining: number;
  percentage: number;
};

type Props = {
  classes: ClassCard[];
  completion: CompletionItem[];
  loading?: boolean;
  error?: boolean;
  noActiveTerm?: boolean;
};

export default function ClassCompletionTracker({
  classes,
  completion,
  loading = false,
  error = false,
  noActiveTerm = false,
}: Props) {
  const classNames = new Map(
    classes.map((item) => [item.id, item.name])
  );

  const subjectNames = new Map<string, string>();

  for (const item of classes) {
    for (const subject of item.subjects) {
      subjectNames.set(
        `${item.id}|${subject.id}`,
        subject.name
      );
    }
  }

  const items = completion.map((item) => ({
    ...item,
    className:
      classNames.get(item.classId) ?? "Assigned Class",
    subjectName:
      subjectNames.get(`${item.classId}|${item.subjectId}`) ??
      "Assigned Subject",
  }));

  const completedSubjects = items.filter(
    (item) => item.required > 0 && item.remaining === 0
  ).length;

  return (
    <section
      className="tch-completion"
      aria-labelledby="tch-completion-title"
    >
      <div className="tch-completion-header">
        <div>
          <h2 id="tch-completion-title">
            Score Entry Progress
          </h2>
          <p>
            Track submitted scores for your assigned
            subjects and classes.
          </p>
        </div>

        {!loading && !error && !noActiveTerm && items.length > 0 && (
          <span className="tch-completion-summary">
            {completedSubjects} of {items.length} completed
          </span>
        )}
      </div>

      {loading ? (
        <p className="tch-completion-message">
          Loading score completion...
        </p>
      ) : error ? (
        <p className="tch-completion-message" role="alert">
          Completion data is currently unavailable.
        </p>
      ) : noActiveTerm ? (
        <p className="tch-completion-message">
          No active academic term.
        </p>
      ) : items.length === 0 ? (
        <p className="tch-completion-message">
          No assigned subjects to track yet.
        </p>
      ) : (
        <div className="tch-completion-grid">
          {items.map((item) => {
            const complete =
              item.required > 0 && item.remaining === 0;

            return (
              <article
                className="tch-completion-card"
                key={`${item.classId}|${item.subjectId}`}
              >
                <div className="tch-completion-card-top">
                  <div>
                    <h3>{item.subjectName}</h3>
                    <p>{item.className}</p>
                  </div>

                  <strong
                    className={
                      complete
                        ? "tch-completion-percent is-complete"
                        : "tch-completion-percent"
                    }
                  >
                    {item.percentage}%
                  </strong>
                </div>

                <div
                  className="tch-completion-track"
                  role="progressbar"
                  aria-label={`${item.subjectName} in ${item.className}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.percentage}
                >
                  <div
                    className={
                      complete
                        ? "tch-completion-fill is-complete"
                        : "tch-completion-fill"
                    }
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, item.percentage)
                      )}%`,
                    }}
                  />
                </div>

                <div className="tch-completion-footer">
                  <span>
                    {item.completed} of {item.required} scores entered
                  </span>

                  <span
                    className={
                      complete ? "tch-completion-done" : ""
                    }
                  >
                    {item.required === 0
                      ? "No required scores yet"
                      : complete
                        ? "Completed"
                        : `${item.remaining} remaining`}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
