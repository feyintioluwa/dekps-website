const actions = [
  { label: "Enter Scores", detail: "Open online score entry", href: "/teacher/broadsheet", symbol: "▤" },
  { label: "Create Assignment", detail: "Open assignment management", href: "/teacher/assignments", symbol: "✎" },
  { label: "Create Test", detail: "Open tests and exams", href: "/teacher/cbt", symbol: "✓" },
] as const;

export default function QuickActions() {
  return (
    <section className="tch-quick-actions" aria-labelledby="tch-quick-title">
      <div className="tch-quick-heading">
        <h2 id="tch-quick-title">Quick Actions</h2>
        <p className="tch-muted">Jump straight to the tools you use most.</p>
      </div>
      <div className="tch-quick-grid">
        {actions.map((action) => (
          <a className="tch-quick-link" href={action.href} key={action.href}>
            <span className="tch-quick-icon" aria-hidden="true">{action.symbol}</span>
            <span className="tch-quick-copy">
              <strong>{action.label}</strong>
              <small>{action.detail}</small>
            </span>
            <span className="tch-quick-arrow" aria-hidden="true">›</span>
          </a>
        ))}
      </div>
    </section>
  );
}
