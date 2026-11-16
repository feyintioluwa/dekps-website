
"use client";

import { useMemo, useState } from "react";

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

type Filter = "pending" | "completed" | "all";

const PREVIEW_COUNT = 3;

export default function ClassCompletionTracker({
  classes,
  completion,
  loading = false,
  error = false,
  noActiveTerm = false,
}: Props) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => {
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

    return completion.map((item) => ({
      ...item,
      className:
        classNames.get(item.classId) ?? "Assigned Class",
      subjectName:
        subjectNames.get(
          `${item.classId}|${item.subjectId}`
        ) ?? "Assigned Subject",
      isComplete:
        item.required > 0 && item.remaining === 0,
    }));
  }, [classes, completion]);

  const completedCount = items.filter(
    (item) => item.isComplete
  ).length;

  const pendingCount = items.length - completedCount;

  const overallPercentage = items.length
    ? Math.round((completedCount / items.length) * 100)
    : 0;

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (filter === "pending" && item.isComplete) {
        return false;
      }

      if (filter === "completed" && !item.isComplete) {
        return false;
      }

      if (!query) return true;

      return `${item.subjectName} ${item.className}`
        .toLowerCase()
        .includes(query);
    });
  }, [items, filter, search]);

  const visibleItems = expanded
    ? filteredItems
    : filteredItems.slice(0, PREVIEW_COUNT);

  function changeFilter(next: Filter) {
    setFilter(next);
    setExpanded(false);
  }

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

        {!loading &&
          !error &&
          !noActiveTerm &&
          items.length > 0 && (
            <span className="tch-completion-summary">
              {completedCount} of {items.length} completed
            </span>
          )}
      </div>

      {loading ? (
        <p className="tch-completion-message">
          Loading score completion...
        </p>
      ) : error ? (
        <p
          className="tch-completion-message"
          role="alert"
        >
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
        <>
          <div className="tch-completion-overview">
            <div className="tch-completion-overview-top">
              <div>
                <span className="tch-completion-eyebrow">
                  Overall completion
                </span>
                <strong className="tch-completion-overall-value">
                  {overallPercentage}%
                </strong>
              </div>

              <div className="tch-completion-overview-counts">
                <span>
                  <strong>{completedCount}</strong>
                  {" "}completed
                </span>
                <span>
                  <strong>{pendingCount}</strong>
                  {" "}remaining
                </span>
              </div>
            </div>

            <div
              className="tch-completion-overall-track"
              role="progressbar"
              aria-label="Completed subject assignments"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overallPercentage}
            >
              <div
                className="tch-completion-overall-fill"
                style={{
                  width: `${overallPercentage}%`,
                }}
              />
            </div>

            <p className="tch-completion-overview-note">
              Based on completed subject and class
              assignments, not individual score entries.
            </p>
          </div>

          <div className="tch-completion-controls">
            <div
              className="tch-completion-filters"
              role="group"
              aria-label="Filter score entry progress"
            >
              <button
                type="button"
                className={
                  filter === "pending" ? "is-active" : ""
                }
                aria-pressed={filter === "pending"}
                onClick={() => changeFilter("pending")}
              >
                Pending ({pendingCount})
              </button>

              <button
                type="button"
                className={
                  filter === "completed" ? "is-active" : ""
                }
                aria-pressed={filter === "completed"}
                onClick={() => changeFilter("completed")}
              >
                Completed ({completedCount})
              </button>

              <button
                type="button"
                className={
                  filter === "all" ? "is-active" : ""
                }
                aria-pressed={filter === "all"}
                onClick={() => changeFilter("all")}
              >
                All ({items.length})
              </button>
            </div>

            <label className="tch-completion-search">
              <span className="tch-completion-sr-only">
                Search subjects or classes
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setExpanded(false);
                }}
                placeholder="Search subject or class..."
              />
            </label>
          </div>

          {filteredItems.length === 0 ? (
            <div className="tch-completion-empty">
              {search.trim()
                ? "No subjects or classes match your search."
                : filter === "completed"
                  ? "No completed subjects yet."
                  : filter === "pending"
                    ? "All assigned subjects are completed."
                    : "No subjects available."}
            </div>
          ) : (
            <>
              <div className="tch-completion-list">
                {visibleItems.map((item) => {
                  const percent = Math.min(
                    100,
                    Math.max(0, item.percentage)
                  );

                  return (
                    <article
                      className="tch-completion-item"
                      key={`${item.classId}|${item.subjectId}`}
                    >
                      <div className="tch-completion-item-main">
                        <div className="tch-completion-item-info">
                          <h3>{item.subjectName}</h3>
                          <p>{item.className}</p>
                        </div>

                        <strong
                          className={
                            item.isComplete
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
                        aria-valuenow={percent}
                      >
                        <div
                          className={
                            item.isComplete
                              ? "tch-completion-fill is-complete"
                              : "tch-completion-fill"
                          }
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="tch-completion-footer">
                        <span>
                          {item.completed} of {item.required}
                          {" "}scores entered
                        </span>

                        <span
                          className={
                            item.isComplete
                              ? "tch-completion-done"
                              : ""
                          }
                        >
                          {item.required === 0
                            ? "No required scores yet"
                            : item.isComplete
                              ? "Completed"
                              : `${item.remaining} remaining`}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>

              {filteredItems.length > PREVIEW_COUNT && (
                <button
                  type="button"
                  className="tch-completion-more"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded
                    ? "Show fewer subjects"
                    : `View all ${filteredItems.length} subjects`}
                  <span aria-hidden="true">
                    {expanded ? "↑" : "↓"}
                  </span>
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
