"use client";

/** Stage 16: device-local, explicitly restored teacher score drafts.
 * Drafts are never automatically submitted to the server.
 * localStorage is not encrypted: avoid shared devices for sensitive data.
 */
const PREFIX = "dkps:teacher-score-draft:v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DraftScope = {
  teacherId: string;
  termId: string;
  mode: "excel" | "broadsheet";
  classId?: string;
  subjectId?: string;
};

type StoredDraft<T> = {
  version: 1;
  savedAt: number;
  scope: DraftScope;
  payload: T;
};

function storageKey(scope: DraftScope): string {
  // Stable, unambiguous encoding of scope values.
  return `${PREFIX}:${encodeURIComponent(JSON.stringify([
    scope.teacherId, scope.termId, scope.mode,
    scope.classId ?? "", scope.subjectId ?? "",
  ]))}`;
}

function validScope(scope: DraftScope): boolean {
  return !!scope.teacherId && !!scope.termId &&
    (scope.mode === "excel" || scope.mode === "broadsheet");
}

export function saveTeacherDraft<T>(scope: DraftScope, payload: T): boolean {
  if (typeof window === "undefined" || !validScope(scope)) return false;
  try {
    const item: StoredDraft<T> = {
      version: 1, savedAt: Date.now(), scope, payload,
    };
    window.localStorage.setItem(storageKey(scope), JSON.stringify(item));
    return true;
  } catch {
    // Storage may be blocked or full. Callers must surface this to teachers.
    return false;
  }
}

export function readTeacherDraft<T>(scope: DraftScope):
  { payload: T; savedAt: number } | null {
  if (typeof window === "undefined" || !validScope(scope)) return null;
  try {
    const key = storageKey(scope);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const item = JSON.parse(raw) as StoredDraft<T>;
    if (item.version !== 1 ||
        JSON.stringify(item.scope) !== JSON.stringify(scope) ||
        !Number.isFinite(item.savedAt) ||
        item.savedAt > Date.now() ||
        Date.now() - item.savedAt > TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { payload: item.payload, savedAt: item.savedAt };
  } catch {
    return null;
  }
}

export function clearTeacherDraft(scope: DraftScope): void {
  if (typeof window === "undefined" || !validScope(scope)) return;
  try { window.localStorage.removeItem(storageKey(scope)); } catch { /* blocked */ }
}

/** Clear only this teacher's drafts (e.g. on explicit logout). */
export function clearAllTeacherDrafts(teacherId: string): void {
  if (typeof window === "undefined" || !teacherId) return;
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(`${PREFIX}:`)) continue;
      const encoded = key.slice(PREFIX.length + 1);
      try {
        const values = JSON.parse(decodeURIComponent(encoded)) as unknown[];
        if (values[0] === teacherId) window.localStorage.removeItem(key);
      } catch { /* leave unrelated/malformed keys untouched */ }
    }
  } catch { /* blocked */ }
}
