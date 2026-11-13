"use client";

import { useEffect, useState } from "react";
import "../teacher.css";
import "../teacher-profile.css";
import TeacherAvatar from "../TeacherAvatar";

type ClassInfo = { id: string; name: string; isClassTeacher: boolean; studentCount: number; subjects: { id: string; name: string }[] };
type Me = { teacher: { name: string; email: string }; classes: ClassInfo[] };

export default function TeacherProfile() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [badges, setBadges] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/teacher/me", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { window.location.replace("/teacher"); return null; }
        if (!response.ok) throw new Error("Could not load your profile.");
        return (await response.json()) as Me;
      })
      .then((data) => {
        if (controller.signal.aborted || !data) return;
        setMe(data);
        try {
          setBadges(localStorage.getItem(`dkps:teacher:badges:${data.teacher.email.trim().toLowerCase()}`) !== "off");
        } catch { /* local storage may be unavailable */ }
      })
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load your profile."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function changeBadges(enabled: boolean) {
    if (!me) return;
    setBadges(enabled);
    try {
      localStorage.setItem(`dkps:teacher:badges:${me.teacher.email.trim().toLowerCase()}`, enabled ? "on" : "off");
      window.dispatchEvent(new Event("dkps:teacher:settings-changed"));
    } catch { setError("Your browser could not save this preference."); }
  }

  async function updatePhoto(file?: File, remove = false) {
    if (!remove && !file) return;
    if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setPhotoMessage("Choose a JPG, PNG or WebP photo under 2 MB."); return;
    }
    setPhotoBusy(true); setPhotoMessage("");
    try {
      const form = new FormData();
      if (file) form.append("photo", file);
      const response = await fetch("/api/teacher/profile-photo", { method: remove ? "DELETE" : "POST", body: remove ? undefined : form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update photo.");
      window.dispatchEvent(new Event("dkps:teacher:photo-changed"));
      setPhotoMessage(remove ? "Profile photo removed." : "Profile photo updated.");
    } catch (e) { setPhotoMessage(e instanceof Error ? e.message : "Could not update photo."); }
    finally { setPhotoBusy(false); }
  }

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const response = await fetch("/api/teacher/session", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error("Sign-out failed. Please try again.");
      window.location.replace("/teacher");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
      setSigningOut(false);
    }
  }

  return (
    <div className="tch tch-profile">
      <header className="tch-header">
        <div className="tch-header-in">
          <div className="tch-brand">
            <div><strong>DE KINGS PERFECTION PRIVATE SCHOOL</strong><small>TEACHER PORTAL</small></div>
          </div>
          <div className="tch-me"><span><b>{me?.teacher.name ?? "Teacher"}</b><small>Profile &amp; Settings</small></span></div>
        </div>
      </header>
      <main className="tch-main">
        <a className="tch-link tch-back tch-profile-back" href="/teacher">← Back to Dashboard</a>
        <div className="tch-profile-intro">
          <TeacherAvatar name={me?.teacher.name} large />
          <div><h1>Profile &amp; Settings</h1><p className="tch-muted">Manage your teacher account</p></div>
        </div>
        {loading && <p className="tch-muted" role="status">Loading your profile…</p>}
        {error && <p className="tch-error" role="alert">{error}</p>}
        {me && <div className="tch-profile-sections">
          <section className="tch-card" aria-labelledby="profile-account"><h2 id="profile-account">Account Information</h2>
            <div className="tch-profile-detail"><span>Full name</span><strong>{me.teacher.name}</strong></div>
            <div className="tch-profile-detail"><span>Email address</span><strong>{me.teacher.email}</strong></div>
            <p className="tch-muted">Account details are managed by the school administrator.</p>
          </section>
          <section className="tch-card" aria-labelledby="profile-photo"><h2 id="profile-photo">Profile Picture</h2>
            <p className="tch-muted">Upload a JPG, PNG or WebP photo (maximum 2 MB). Your picture will appear on your dashboard too.</p>
            <div className="tch-photo-actions">
              <label className="tch-btn tch-photo-upload" htmlFor="tch-photo-file">{photoBusy ? "Saving…" : "Choose Photo"}</label>
              <input id="tch-photo-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void updatePhoto(file); e.target.value = ""; }} />
              <button className="tch-btn tch-photo-remove" type="button" disabled={photoBusy} onClick={() => void updatePhoto(undefined, true)}>Remove Photo</button>
            </div>
            {photoMessage && <p className="tch-muted" role="status">{photoMessage}</p>}
          </section>
          <section className="tch-card" aria-labelledby="profile-classes"><h2 id="profile-classes">My Assigned Classes</h2>
            <p className="tch-muted">{me.classes.length} {me.classes.length === 1 ? "class" : "classes"} assigned</p>
            {me.classes.length ? <div className="tch-profile-class-list">{me.classes.map((c) => <div className="tch-profile-class" key={c.id}><strong>{c.name}</strong><div><span className="tch-chip">{c.studentCount} students</span>{c.isClassTeacher && <span className="tch-badge">Class Teacher</span>}</div></div>)}</div> : <p className="tch-muted">No classes assigned yet.</p>}
          </section>
          <section className="tch-card" aria-labelledby="profile-notifications"><h2 id="profile-notifications">Notification Settings</h2>
            <label className="tch-profile-setting"><span><strong>Show unread notification badge</strong><small className="tch-muted">Display the unread count on Alerts in the mobile navigation.</small></span><input type="checkbox" checked={badges} onChange={(e) => changeBadges(e.target.checked)} /></label>
            <p className="tch-muted">Saved in this browser for your account. Notifications will still be delivered.</p>
          </section>
          <section className="tch-card" aria-labelledby="profile-access"><h2 id="profile-access">Account Access</h2>
            <button className="tch-btn" type="button" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Log out"}</button>
          </section>
        </div>}
      </main>
    </div>
  );
}
