"use client";

import { useState } from "react";
import { addStudent } from "./actions";

type ClassRow = { id: string; name: string };

export default function AddStudentForm({ classes }: { classes: ClassRow[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ name: string; loginId: string; pin: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const res = await addStudent(formData);

    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    // Show success with the generated credentials
    setSuccess({
      name: res.student.name,
      loginId: res.student.login_id,
      pin: res.pin,
    });
    
    // Reset form
    (e.target as HTMLFormElement).reset();
  }

  if (success) {
    return (
      <div className="admin-card" style={{ borderColor: "#2e7d32" }}>
        <h3 style={{ color: "#2e7d32", marginBottom: 8 }}>Student Added Successfully!</h3>
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          Give these details to the student or their parent:
        </p>
        <div style={{ background: "#f0fdf4", padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <p><strong>Name:</strong> {success.name}</p>
          <p><strong>Login ID:</strong> <code>{success.loginId}</code></p>
          <p><strong>PIN:</strong> <code>{success.pin}</code></p>
        </div>
        <button onClick={() => { setSuccess(null); setIsOpen(false); }} className="btn btn-primary">
          Add Another / Done
        </button>
      </div>
    );
  }

  return (
    <div>
      {!isOpen ? (
        <button onClick={() => setIsOpen(true)} className="btn btn-primary" style={{ marginBottom: 20 }}>
          + Add Student
        </button>
      ) : (
        <div className="admin-card" style={{ borderColor: "#7a0f1a" }}>
          <h3 style={{ color: "#7a0f1a", marginBottom: 16 }}>Add New Student</h3>
          {error && <p className="msg-error" style={{ marginBottom: 12 }}>{error}</p>}
          
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 400 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Full Name</label>
              <input name="name" required style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
            </div>
            
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Class</label>
              <select name="class_id" required style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }}>
                <option value="">Select Class...</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Stream (SSS only)</label>
              <input name="stream" placeholder="e.g. Science, Arts, Commercial" style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Result PIN (4 digits)</label>
              <input name="pin" type="text" inputMode="numeric" maxLength={4} required placeholder="e.g. 1234" style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? "Adding..." : "Save Student"}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}