"use client";


import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import {
  applyCVFix,
  createImprovedCV,
  getAppliedFix,
  removeCVFix,
  type AppliedCVFix,
  type ImprovedCV,
} from "@/lib/cv/cv-merge";

import {
  parseCVSections,
  type CVSectionKey,
  type ParsedCV,
} from "@/lib/cv/section-parser";

type AnalysisIssueSeverity = "high" | "medium" | "low";
type AnalysisIssueEvidenceKind = "cv_text" | "absence" | "pattern";
type AnalysisIssueFixMode =
  | "rewrite"
  | "user_confirmation"
  | "structural";

type AnalysisIssueSectionKey =
  | "header"
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "certifications"
  | "projects"
  | "languages"
  | "leadership"
  | "awards"
  | "volunteering"
  | "references";

type AnalysisIssue = {
  id: string;
  sectionKey: AnalysisIssueSectionKey;
  category: string;
  title: string;
  problem: string;
  evidence: string;
  evidenceKind: AnalysisIssueEvidenceKind;
  recommendation: string;
  severity: AnalysisIssueSeverity;
  fixMode: AnalysisIssueFixMode;
};

type Analysis = {
  overallScore: number;

  summary: string;

  strengths: string[];
  weaknesses: string[];
  skills: string[];
  recommendedSkills: string[];

  experienceAssessment: string;
  educationAssessment: string;
  atsAssessment: string;

  improvements: string[];
  recommendedRoles: string[];
  issues: AnalysisIssue[];
};

type FixItem = {
  id: string;
  sectionKey: CVSectionKey | null;
  category: string;
  title: string;
  problem: string;
  evidence: string;
  evidenceKind: AnalysisIssueEvidenceKind;
  recommendation: string;
  severity: AnalysisIssueSeverity;
  fixMode: AnalysisIssueFixMode;
  userConfirmation: string;
  content: string;
  generated: boolean;
  applied: boolean;
};

type FixApiResponse = {
  success?: boolean;
  source?: string;
  sectionKey?: CVSectionKey;
  improvedContent?: string;
  error?: string;
};

type AccountResponse = {
  success?: boolean;
  authenticated?: boolean;
  cvHash?: string | null;
  cvUnlocked?: boolean;
  hasPaidAccess?: boolean;
  canFix?: boolean;
  canDownload?: boolean;
  error?: string;
};

type RawObject = Record<string, unknown>;

const CV_SECTION_KEYS: CVSectionKey[] = [
  "header",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "leadership",
  "awards",
  "volunteering",
  "references",
  "other",
];

const ANALYSIS_SECTION_KEYS: AnalysisIssueSectionKey[] = [
  "header",
  "summary",
  "skills",
  "experience",
  "education",
  "certifications",
  "projects",
  "languages",
  "leadership",
  "awards",
  "volunteering",
  "references",
];

const ISSUE_SEVERITIES: AnalysisIssueSeverity[] = [
  "high",
  "medium",
  "low",
];

const ISSUE_EVIDENCE_KINDS: AnalysisIssueEvidenceKind[] = [
  "cv_text",
  "absence",
  "pattern",
];

const ISSUE_FIX_MODES: AnalysisIssueFixMode[] = [
  "rewrite",
  "user_confirmation",
  "structural",
];

function isCVSectionKey(value: unknown): value is CVSectionKey {
  return (
    typeof value === "string" &&
    CV_SECTION_KEYS.includes(value as CVSectionKey)
  );
}

function isAnalysisIssue(value: unknown): value is AnalysisIssue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const issue = value as RawObject;

  return (
    typeof issue.id === "string" &&
    typeof issue.sectionKey === "string" &&
    ANALYSIS_SECTION_KEYS.includes(issue.sectionKey as AnalysisIssueSectionKey) &&
    typeof issue.category === "string" &&
    typeof issue.title === "string" &&
    typeof issue.problem === "string" &&
    typeof issue.evidence === "string" &&
    typeof issue.evidenceKind === "string" &&
    ISSUE_EVIDENCE_KINDS.includes(issue.evidenceKind as AnalysisIssueEvidenceKind) &&
    typeof issue.recommendation === "string" &&
    typeof issue.severity === "string" &&
    ISSUE_SEVERITIES.includes(issue.severity as AnalysisIssueSeverity) &&
    typeof issue.fixMode === "string" &&
    ISSUE_FIX_MODES.includes(issue.fixMode as AnalysisIssueFixMode)
  );
}

function isAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const analysis = value as RawObject;

  return (
    typeof analysis.overallScore === "number" &&
    typeof analysis.summary === "string" &&
    Array.isArray(analysis.strengths) &&
    Array.isArray(analysis.weaknesses) &&
    Array.isArray(analysis.skills) &&
    Array.isArray(analysis.recommendedSkills) &&
    typeof analysis.experienceAssessment === "string" &&
    typeof analysis.educationAssessment === "string" &&
    typeof analysis.atsAssessment === "string" &&
    Array.isArray(analysis.improvements) &&
    Array.isArray(analysis.recommendedRoles) &&
    Array.isArray(analysis.issues) &&
    analysis.issues.length > 0 &&
    analysis.issues.every(isAnalysisIssue)
  );
}

function toCVSectionKey(
  sectionKey: AnalysisIssueSectionKey
): CVSectionKey | null {
  if (!isCVSectionKey(sectionKey)) {
    return null;
  }

  return sectionKey;
}

function createFixFromIssue(issue: AnalysisIssue): FixItem {
  return {
    id: issue.id,
    sectionKey: toCVSectionKey(issue.sectionKey),
    category: issue.category,
    title: issue.title,
    problem: issue.problem,
    evidence: issue.evidence,
    evidenceKind: issue.evidenceKind,
    recommendation: issue.recommendation,
    severity: issue.severity,
    fixMode: issue.fixMode,
    userConfirmation: "",
    content: "",
    generated: false,
    applied: false,
  };
}

async function createCVHash(
  text: string
): Promise<string> {
  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(text);

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(
      hashBuffer
    )
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

function getCVStorageKeys(
  cvHash: string
) {
  return {
    analysis:
      `careerOSAnalysis_${cvHash}`,

    analysisSource:
      `careerOSAnalysisSource_${cvHash}`,

    fixes:
      `careerOSFixes_${cvHash}`,

    improvedCV:
      `careerOSImprovedCV_${cvHash}`,

    improvedCVText:
      `careerOSImprovedCVText_${cvHash}`,
  };
}

function normalizeStoredFix(value: unknown): FixItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as RawObject;

  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.problem !== "string" ||
    typeof raw.evidence !== "string" ||
    typeof raw.recommendation !== "string" ||
    typeof raw.content !== "string"
  ) {
    return null;
  }

  if (
    typeof raw.evidenceKind !== "string" ||
    !ISSUE_EVIDENCE_KINDS.includes(
      raw.evidenceKind as AnalysisIssueEvidenceKind
    ) ||
    typeof raw.severity !== "string" ||
    !ISSUE_SEVERITIES.includes(raw.severity as AnalysisIssueSeverity) ||
    typeof raw.fixMode !== "string" ||
    !ISSUE_FIX_MODES.includes(raw.fixMode as AnalysisIssueFixMode)
  ) {
    return null;
  }

  const content = raw.content.trim();

  return {
    id: raw.id,
    sectionKey:
      isCVSectionKey(raw.sectionKey) && raw.sectionKey !== "other"
        ? raw.sectionKey
        : null,
    category: typeof raw.category === "string" ? raw.category : "content",
    title: raw.title,
    problem: raw.problem,
    evidence: raw.evidence,
    evidenceKind: raw.evidenceKind as AnalysisIssueEvidenceKind,
    recommendation: raw.recommendation,
    severity: raw.severity as AnalysisIssueSeverity,
    fixMode: raw.fixMode as AnalysisIssueFixMode,
    userConfirmation:
      typeof raw.userConfirmation === "string" ? raw.userConfirmation : "",
    content: raw.content,
    generated:
      typeof raw.generated === "boolean" ? raw.generated : content.length > 0,
    applied: typeof raw.applied === "boolean" ? raw.applied : false,
  };
}

function mergeStoredFixesWithIssues(
  issues: AnalysisIssue[],
  storedFixes: FixItem[]
): FixItem[] {
  const storedById = new Map(storedFixes.map((fix) => [fix.id, fix]));

  return issues.map((issue) => {
    const base = createFixFromIssue(issue);
    const stored = storedById.get(issue.id);

    if (!stored) {
      return base;
    }

    const sameIssue =
      stored.title === issue.title &&
      stored.problem === issue.problem &&
      stored.recommendation === issue.recommendation &&
      stored.evidence === issue.evidence;

    if (!sameIssue) {
      return base;
    }

    return {
      ...base,
      userConfirmation: stored.userConfirmation,
      content: stored.content,
      generated: Boolean(stored.content.trim()),
      applied: stored.applied,
    };
  });
}

function normalizeAppliedFix(
  value: unknown
): AppliedCVFix | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const raw =
    value as RawObject;

  if (
    !isCVSectionKey(
      raw.sectionKey
    ) ||
    typeof raw.improvedContent !==
      "string" ||
    !raw.improvedContent.trim()
  ) {
    return null;
  }

  return {
    sectionKey:
      raw.sectionKey,

    improvedContent:
      raw.improvedContent.trim(),

    appliedAt:
      typeof raw.appliedAt ===
      "string"
        ? raw.appliedAt
        : new Date().toISOString(),
  };
}

function restoreImprovedCV(
  parsedCV: ParsedCV,
  storedValue: string | null
): ImprovedCV {
  let improvedCV =
    createImprovedCV(
      parsedCV
    );

  if (!storedValue) {
    return improvedCV;
  }

  try {
    const parsed: unknown =
      JSON.parse(
        storedValue
      );

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return improvedCV;
    }

    const raw =
      parsed as RawObject;

    if (
      !Array.isArray(
        raw.appliedFixes
      )
    ) {
      return improvedCV;
    }

    const appliedFixes =
      raw.appliedFixes
        .map(
          normalizeAppliedFix
        )
        .filter(
          (
            fix
          ): fix is AppliedCVFix =>
            fix !== null
        );

    for (
      const fix of
      appliedFixes
    ) {
      improvedCV =
        applyCVFix({
          improvedCV,

          sectionKey:
            fix.sectionKey,

          improvedContent:
            fix.improvedContent,
        });
    }

    return improvedCV;
  } catch (error) {
    console.warn(
      "CVCommit: Failed to restore improved CV.",
      error
    );

    return improvedCV;
  }
}

async function readFixResponse(
  response: Response
): Promise<FixApiResponse> {
  const responseText =
    await response.text();

  if (
    !responseText.trim()
  ) {
    throw new Error(
      "CVCommit Fix received an empty server response."
    );
  }

  try {
    return JSON.parse(
      responseText
    ) as FixApiResponse;
  } catch {
    console.error(
      "CVCommit Fix returned a non-JSON response:",
      responseText.slice(
        0,
        1500
      )
    );

    throw new Error(
      "CVCommit Fix returned an invalid server response."
    );
  }
}

function saveFixesToStorage(
  fixes: FixItem[],
  cvHash: string
) {
  const keys =
    getCVStorageKeys(
      cvHash
    );

  sessionStorage.setItem(
    keys.fixes,
    JSON.stringify(
      fixes
    )
  );

  /*
   * Keep the generic key synchronized
   * for the active CV only.
   */
  sessionStorage.setItem(
    "careerOSFixes",
    JSON.stringify(
      fixes
    )
  );
}


function saveImprovedCVToStorage(
  improvedCV: ImprovedCV,
  cvHash: string
) {
  const keys =
    getCVStorageKeys(
      cvHash
    );

  sessionStorage.setItem(
    keys.improvedCV,
    JSON.stringify(
      improvedCV
    )
  );

  sessionStorage.setItem(
    keys.improvedCVText,
    improvedCV.mergedText
  );

  /*
   * Preview currently reads the generic
   * active-CV keys, so keep those synchronized.
   */
  sessionStorage.setItem(
    "careerOSImprovedCV",
    JSON.stringify(
      improvedCV
    )
  );

  sessionStorage.setItem(
    "careerOSImprovedCVText",
    improvedCV.mergedText
  );
}

export default function FixPage() {
  const router =
    useRouter();

  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    accessLoaded,
    setAccessLoaded,
  ] =
    useState(false);

  const [
    hasPaidAccess,
    setHasPaidAccess,
  ] =
    useState(false);

  const [
    analysis,
    setAnalysis,
  ] =
    useState<Analysis | null>(
      null
    );

  const [
    fileName,
    setFileName,
  ] =
    useState("");

  const [
    extractedText,
    setExtractedText,
  ] =
    useState("");

  const [
    cvHash,
    setCVHash,
  ] =
    useState("");

  const [
    isLoaded,
    setIsLoaded,
  ] =
    useState(false);

  const [
    activeFix,
    setActiveFix,
  ] =
    useState(0);

  const [
    fixes,
    setFixes,
  ] =
    useState<FixItem[]>([]);

  const [
    improvedCV,
    setImprovedCV,
  ] =
    useState<ImprovedCV | null>(
      null
    );

  const [
    saved,
    setSaved,
  ] =
    useState(false);

  const [
    isGenerating,
    setIsGenerating,
  ] =
    useState(false);

  const [
    isSigningOut,
    setIsSigningOut,
  ] =
    useState(false);

  useEffect(() => {
    let cancelled =
      false;

    async function loadFixWorkspace() {
      const storedFileName =
        sessionStorage.getItem(
          "careerOSFileName"
        );

      const storedExtractedText =
        sessionStorage.getItem(
          "careerOSExtractedText"
        );

      if (
        !storedExtractedText ||
        !storedExtractedText.trim()
      ) {
        if (!cancelled) {
          setAccessLoaded(
            true
          );

          setIsLoaded(
            true
          );
        }

        return;
      }

      try {
        /*
         * ---------------------------------------------------------
         * VERIFY CURRENT CV
         * ---------------------------------------------------------
         */

        const currentCVHash =
          await createCVHash(
            storedExtractedText
          );

        if (cancelled) {
          return;
        }

        /*
         * ---------------------------------------------------------
         * LOAD ACCESS FOR THIS EXACT CV
         * ---------------------------------------------------------
         */

        let nextHasPaidAccess =
          false;

        try {
          const response =
            await fetch(
              `/api/account?cvHash=${encodeURIComponent(
                currentCVHash
              )}`,
              {
                method: "GET",
                cache: "no-store",
              }
            );

          const data =
            (await response.json()) as AccountResponse;

          if (
            response.ok &&
            data.success &&
            data.authenticated
          ) {
            nextHasPaidAccess =
              data.canFix === true;
          } else if (
            response.status === 401 ||
            !data.authenticated
          ) {
            console.warn(
              "CVCommit Fix: No authenticated account found."
            );
          } else {
            console.error(
              "CVCommit Fix: Could not load CV access.",
              data.error ||
                "Unknown CV access error."
            );
          }
        } catch (error) {
          console.error(
            "CVCommit Fix CV access error:",
            error
          );
        }

        if (cancelled) {
          return;
        }

        setHasPaidAccess(
          nextHasPaidAccess
        );

        setAccessLoaded(
          true
        );

        const activeCVHash =
          sessionStorage.getItem(
            "careerOSActiveCVHash"
          );

        const analysisHash =
          sessionStorage.getItem(
            "careerOSAnalysisHash"
          );

        /*
         * The active CV hash must match the CV text
         * currently being used.
         */
        if (
          activeCVHash &&
          activeCVHash !==
            currentCVHash
        ) {
          throw new Error(
            "The active CV does not match the CV being improved."
          );
        }

        /*
         * The active analysis must also belong
         * to this exact CV.
         */
        if (
          analysisHash &&
          analysisHash !==
            currentCVHash
        ) {
          throw new Error(
            "The stored analysis belongs to a different CV."
          );
        }

        const keys =
          getCVStorageKeys(
            currentCVHash
          );

        /*
         * ---------------------------------------------------------
         * LOAD HASH-SPECIFIC ANALYSIS
         * ---------------------------------------------------------
         *
         * This is the important safeguard.
         *
         * We do NOT trust careerOSAnalysis here.
         * We load the analysis stored specifically
         * for this CV fingerprint.
         */
        const storedAnalysis =
          sessionStorage.getItem(
            keys.analysis
          );

        if (!storedAnalysis) {
          console.warn(
            "CVCommit: No analysis found for current CV hash."
          );

          setCVHash(
            currentCVHash
          );

          setIsLoaded(
            true
          );

          return;
        }

        const parsedAnalysis:
          unknown =
          JSON.parse(
            storedAnalysis
          );

        if (
          !isAnalysis(
            parsedAnalysis
          )
        ) {
          throw new Error(
            "Stored CVCommit analysis is invalid."
          );
        }

        /*
         * ---------------------------------------------------------
         * PARSE CURRENT CV
         * ---------------------------------------------------------
         */

        const parsedCV =
          parseCVSections(
            storedExtractedText
          );

        /*
         * ---------------------------------------------------------
         * LOAD FIXES FOR THIS CV ONLY
         * ---------------------------------------------------------
         */

        const storedFixes =
          sessionStorage.getItem(
            keys.fixes
          );

        /*
         * ---------------------------------------------------------
         * LOAD IMPROVED CV FOR THIS CV ONLY
         * ---------------------------------------------------------
         */

        const storedImprovedCV =
          sessionStorage.getItem(
            keys.improvedCV
          );

        const restoredImprovedCV =
          restoreImprovedCV(
            parsedCV,
            storedImprovedCV
          );

        let storedTraceableFixes: FixItem[] = [];

        if (storedFixes) {
          try {
            const parsedFixes: unknown = JSON.parse(storedFixes);

            if (Array.isArray(parsedFixes)) {
              storedTraceableFixes = parsedFixes
                .map(normalizeStoredFix)
                .filter((fix): fix is FixItem => fix !== null);
            }
          } catch (error) {
            console.warn(
              "CVCommit: Failed to load saved traceable fixes for this CV.",
              error
            );
          }
        }

        /*
         * Analysis issues are always the source of truth.
         * Stored generated content is restored only when it still
         * belongs to the exact same stable issue ID and evidence.
         */
        let generatedFixes = mergeStoredFixesWithIssues(
          parsedAnalysis.issues,
          storedTraceableFixes
        );

        /*
         * Reconcile applied state against
         * the actual improved CV.
         */
        generatedFixes =
          generatedFixes.map(
            (fix) => {
              if (
                !fix.sectionKey ||
                !fix.content.trim()
              ) {
                return {
                  ...fix,
                  applied:
                    false,
                };
              }

              const appliedFix =
                getAppliedFix(
                  restoredImprovedCV,
                  fix.sectionKey
                );

              const applied =
                Boolean(
                  appliedFix &&
                    appliedFix.improvedContent.trim() ===
                      fix.content.trim()
                );

              return {
                ...fix,
                applied,
              };
            }
          );

        /*
         * ---------------------------------------------------------
         * SYNCHRONIZE ACTIVE SESSION
         * ---------------------------------------------------------
         */

        sessionStorage.setItem(
          "careerOSActiveCVHash",
          currentCVHash
        );

        sessionStorage.setItem(
          "careerOSAnalysisHash",
          currentCVHash
        );

        sessionStorage.setItem(
          "careerOSAnalysis",
          storedAnalysis
        );

        const storedSource =
          sessionStorage.getItem(
            keys.analysisSource
          );

        if (storedSource) {
          sessionStorage.setItem(
            "careerOSAnalysisSource",
            storedSource
          );
        }

        saveFixesToStorage(
          generatedFixes,
          currentCVHash
        );

        saveImprovedCVToStorage(
          restoredImprovedCV,
          currentCVHash
        );

        /*
         * ---------------------------------------------------------
         * UPDATE REACT STATE
         * ---------------------------------------------------------
         */

        setCVHash(
          currentCVHash
        );

        setAnalysis(
          parsedAnalysis
        );

        setFileName(
          storedFileName ??
            ""
        );

        setExtractedText(
          storedExtractedText
        );

        setFixes(
          generatedFixes
        );

        setImprovedCV(
          restoredImprovedCV
        );

        setIsLoaded(
          true
        );

        console.log(
          "CVCommit Fix: Workspace loaded.",
          {
            cvHash:
              currentCVHash,

            fixes:
              generatedFixes.length,

            applied:
              restoredImprovedCV.appliedFixes.length,

            hasPaidAccess:
              nextHasPaidAccess,
          }
        );
      } catch (error) {
        console.error(
          "Failed to load CVCommit fix workspace:",
          error
        );

        if (!cancelled) {
          setAnalysis(
            null
          );

          setFixes(
            []
          );

          setImprovedCV(
            null
          );

          setAccessLoaded(
            true
          );

          setIsLoaded(
            true
          );
        }
      }
    }

    void loadFixWorkspace();

    return () => {
      cancelled =
        true;
    };
  }, []);

  const unapplyFixIfNeeded = (
    fix: FixItem
  ) => {
    if (
      !fix.applied ||
      !fix.sectionKey ||
      !cvHash
    ) {
      return;
    }

    setImprovedCV(
      (current) => {
        if (!current) {
          return current;
        }

        const updated =
          removeCVFix({
            improvedCV:
              current,

            sectionKey:
              fix.sectionKey as CVSectionKey,
          });

        saveImprovedCVToStorage(
          updated,
          cvHash
        );

        return updated;
      }
    );
  };

  const updateFixContent = (
    id: string,
    content: string
  ) => {
    const previousFix =
      fixes.find(
        (fix) =>
          fix.id === id
      );

    if (previousFix) {
      unapplyFixIfNeeded(
        previousFix
      );
    }

    const updatedFixes =
      fixes.map(
        (fix) =>
          fix.id === id
            ? {
                ...fix,

                content,

                generated:
                  content.trim()
                    .length >
                  0,

                applied:
                  false,
              }
            : fix
      );

    setFixes(
      updatedFixes
    );

    if (cvHash) {
      saveFixesToStorage(
        updatedFixes,
        cvHash
      );
    }

    setSaved(
      false
    );
  };

  const updateUserConfirmation = (
    id: string,
    userConfirmation: string
  ) => {
    const updatedFixes = fixes.map((fix) =>
      fix.id === id
        ? {
            ...fix,
            userConfirmation,
          }
        : fix
    );

    setFixes(updatedFixes);

    if (cvHash) {
      saveFixesToStorage(updatedFixes, cvHash);
    }

    setSaved(false);
  };

  const generateImprovement =
    async () => {
      const currentFix =
        fixes[activeFix];

      if (!currentFix) {
        return;
      }

      if (!extractedText) {
        alert(
          "The original CV content is unavailable. Please upload your CV again."
        );

        return;
      }

      if (!cvHash) {
        alert(
          "CVCommit could not verify which CV is active. Please analyze the CV again."
        );

        return;
      }

      if (!currentFix.sectionKey) {
        alert(
          "This issue points to a CV section that the current editor cannot safely rewrite yet."
        );

        return;
      }

      if (
        currentFix.fixMode === "user_confirmation" &&
        !currentFix.userConfirmation.trim()
      ) {
        alert(
          "Confirm the correct information first. CVCommit will not invent a missing or uncertain fact."
        );

        return;
      }

      const activeHash =
        sessionStorage.getItem(
          "careerOSActiveCVHash"
        );

      if (
        activeHash !==
        cvHash
      ) {
        alert(
          "CVCommit detected a CV mismatch. Please analyze the current CV again."
        );

        return;
      }

      setIsGenerating(
        true
      );

      setSaved(
        false
      );

      try {
        const response =
          await fetch(
            "/api/fix",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  cvHash,

                  extractedText:
                    improvedCV?.mergedText ?? extractedText,

                  issueId:
                    currentFix.id,

                  sectionKey:
                    currentFix.sectionKey,

                  section:
                    currentFix.title,

                  category:
                    currentFix.category,

                  problem:
                    currentFix.fixMode === "user_confirmation"
                      ? `${currentFix.problem}\n\nUser-confirmed information: ${currentFix.userConfirmation.trim()}`
                      : currentFix.problem,

                  evidence:
                    currentFix.evidence,

                  evidenceKind:
                    currentFix.evidenceKind,

                  severity:
                    currentFix.severity,

                  fixMode:
                    currentFix.fixMode,

                  userConfirmation:
                    currentFix.userConfirmation.trim(),

                  improvement:
                    currentFix.fixMode === "user_confirmation"
                      ? `${currentFix.recommendation}\n\nUse only this customer-confirmed fact where needed: ${currentFix.userConfirmation.trim()}`
                      : currentFix.recommendation,
                }),
            }
          );

        const data =
          await readFixResponse(
            response
          );

        if (
          !response.ok
        ) {
          throw new Error(
            data.error ??
              "Failed to generate CV improvement."
          );
        }

        if (
          !data.success
        ) {
          throw new Error(
            data.error ??
              "CVCommit could not generate this improvement."
          );
        }

        if (
          typeof data.improvedContent !==
            "string" ||
          !data.improvedContent.trim()
        ) {
          throw new Error(
            "CVCommit received an empty improvement."
          );
        }

        console.log(
          "CVCommit Fix source:",
          data.source ??
            "unknown"
        );

        const returnedSectionKey =
          currentFix.sectionKey;

        unapplyFixIfNeeded(
          currentFix
        );

        const updatedFixes =
          fixes.map(
            (fix) =>
              fix.id ===
              currentFix.id
                ? {
                    ...fix,

                    content:
                      data.improvedContent?.trim() ??
                      "",

                    generated:
                      true,

                    applied:
                      false,

                    sectionKey:
                      returnedSectionKey ??
                      fix.sectionKey,
                  }
                : fix
          );

        setFixes(
          updatedFixes
        );

        saveFixesToStorage(
          updatedFixes,
          cvHash
        );
      } catch (error) {
        console.error(
          "CVCommit fix error:",
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : "Something went wrong while generating the improvement."
        );
      } finally {
        setIsGenerating(
          false
        );
      }
    };

  const applyCurrentFix =
    () => {
      const currentFix =
        fixes[activeFix];

      if (
        !currentFix ||
        !improvedCV
      ) {
        return;
      }

      if (!cvHash) {
        alert(
          "CVCommit could not verify which CV is active."
        );

        return;
      }

      const activeHash =
        sessionStorage.getItem(
          "careerOSActiveCVHash"
        );

      if (
        activeHash !==
        cvHash
      ) {
        alert(
          "CVCommit detected a CV mismatch. Please analyze the current CV again."
        );

        return;
      }

      if (
        !currentFix.content.trim()
      ) {
        alert(
          "Generate or write an improved version before applying this fix."
        );

        return;
      }

      const sectionKey =
        currentFix.sectionKey;

      if (!sectionKey) {
        alert(
          "CVCommit could not match this recommendation to a real CV section. Please return to the analysis and try again."
        );

        return;
      }

      const updatedImprovedCV =
        applyCVFix({
          improvedCV,

          sectionKey,

          improvedContent:
            currentFix.content,
        });

      const updatedFixes =
        fixes.map(
          (fix) => {
            if (
              fix.id ===
              currentFix.id
            ) {
              return {
                ...fix,

                sectionKey,

                applied:
                  true,

              };
            }

            if (
              fix.sectionKey === sectionKey &&
              fix.id !== currentFix.id
            ) {
              return {
                ...fix,
                applied: false,
              };
            }

            return fix;
          }
        );

      setImprovedCV(
        updatedImprovedCV
      );

      setFixes(
        updatedFixes
      );

      saveFixesToStorage(
        updatedFixes,
        cvHash
      );

      saveImprovedCVToStorage(
        updatedImprovedCV,
        cvHash
      );

      setSaved(
        true
      );
    };

  const undoCurrentFix =
    () => {
      const currentFix =
        fixes[activeFix];

      if (
        !currentFix ||
        !improvedCV ||
        !currentFix.sectionKey ||
        !cvHash
      ) {
        return;
      }

      const updatedImprovedCV =
        removeCVFix({
          improvedCV,

          sectionKey:
            currentFix.sectionKey,
        });

      const updatedFixes =
        fixes.map(
          (fix) =>
            fix.id ===
            currentFix.id
              ? {
                  ...fix,

                  applied:
                    false,
                }
              : fix
        );

      setImprovedCV(
        updatedImprovedCV
      );

      setFixes(
        updatedFixes
      );

      saveFixesToStorage(
        updatedFixes,
        cvHash
      );

      saveImprovedCVToStorage(
        updatedImprovedCV,
        cvHash
      );

      setSaved(
        true
      );
    };

  const saveChanges =
    () => {
      if (!cvHash) {
        alert(
          "CVCommit could not verify which CV is active."
        );

        return;
      }

      saveFixesToStorage(
        fixes,
        cvHash
      );

      if (improvedCV) {
        saveImprovedCVToStorage(
          improvedCV,
          cvHash
        );
      }

      setSaved(
        true
      );
    };

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(
      true
    );

    try {
      const {
        error,
      } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      /*
       * Fix My CV contains generated and applied CV content.
       * Clear this browser tab's active CV session on sign out.
       */
      sessionStorage.clear();

      router.replace(
        "/"
      );

      router.refresh();
    } catch (error) {
      console.error(
        "CVCommit sign out error:",
        error
      );

      alert(
        "CVCommit could not sign you out. Please try again."
      );

      setIsSigningOut(
        false
      );
    }
  }

  if (!accessLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-950">
            Checking access
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Preparing your CVCommit workspace...
          </p>
        </div>
      </main>
    );
  }

  if (!hasPaidAccess) {
    return (
      <main className="min-h-screen bg-zinc-50 text-zinc-950">
        <nav className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight sm:text-2xl"
            >
              CV
              <span className="text-blue-600">
                Commit
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <Link
                href="/results"
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Back to analysis
              </Link>

              <button
                type="button"
                onClick={
                  handleSignOut
                }
                disabled={
                  isSigningOut
                }
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningOut
                  ? "Signing out..."
                  : "Sign Out"}
              </button>
            </div>
          </div>
        </nav>

        <section className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6 py-16">
          <div className="w-full max-w-lg rounded-3xl border border-violet-100 bg-white p-8 text-center shadow-xl sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-2xl">
              🔒
            </div>

            <div className="mt-6 inline-flex rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-violet-700">
              CV Unlock
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-950">
              Unlock this CV to continue
            </h1>

            <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-zinc-600">
              Your free CVCommit analysis is still available.
              Unlock this CV once to generate improved content,
              apply fixes, preview the improved version, and
              export it.
            </p>

            <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
              <ProFeature
                text="AI-assisted CV rewrites"
              />

              <ProFeature
                text="Apply fixes to your CV"
              />

              <ProFeature
                text="Improved CV preview"
              />

              <ProFeature
                text="DOCX and PDF export"
              />
            </div>

            <Link
              href="/upgrade"
              className="mt-8 flex w-full items-center justify-center rounded-2xl bg-zinc-950 px-6 py-4 text-sm font-bold text-white transition hover:bg-zinc-800"
            >
              Unlock This CV — ₦7,500
            </Link>

            <p className="mt-3 text-xs text-zinc-500">
              One-time payment · No subscription
            </p>

            <Link
              href="/results"
              className="mt-5 inline-flex text-sm font-semibold text-zinc-500 transition hover:text-zinc-950"
            >
              ← Back to my analysis
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-950">
            Loading your CV fixes
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Preparing your personalized
            improvement workspace...
          </p>
        </div>
      </main>
    );
  }

  if (!analysis) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl font-bold text-blue-600">
            !
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-950">
            No matching CV analysis found
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            CVCommit could not find a verified
            analysis for the CV currently loaded.
            Analyze the CV again before improving it.
          </p>

          <Link
            href="/upload"
            className="mt-7 inline-flex rounded-xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Analyze your CV
          </Link>
        </div>
      </main>
    );
  }

  const score =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          analysis.overallScore
        ) || 0
      )
    );

  const currentFix =
    fixes[activeFix];

  const generatedCount =
    fixes.filter(
      (fix) =>
        fix.generated &&
        fix.content
          .trim()
          .length > 0
    ).length;

  const appliedCount =
    fixes.filter(
      (fix) =>
        fix.applied
    ).length;

  const currentSectionKey =
    currentFix?.sectionKey ??
    null;

  const canApplyCurrentFix =
    Boolean(
      currentFix &&
        currentFix.generated &&
        currentFix.content.trim() &&
        currentSectionKey
    );

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <nav className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight sm:text-2xl"
          >
            CV
            <span className="text-blue-600">
              Commit
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {appliedCount > 0 && (
              <Link
                href="/preview"
                className="hidden rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 md:inline-flex"
              >
                Preview CV
              </Link>
            )}

            <Link
              href="/results"
              className="hidden text-sm font-semibold text-zinc-500 transition hover:text-zinc-950 sm:block"
            >
              Back to analysis
            </Link>

            <Link
              href="/upload"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
            >
              New CV
            </Link>

            <button
              type="button"
              onClick={
                handleSignOut
              }
              disabled={
                isSigningOut
              }
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningOut
                ? "Signing out..."
                : "Sign Out"}
            </button>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <div className="max-w-3xl">
          <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
            CVCommit CV Improvement
          </div>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl">
            Fix your CV
          </h1>

          <p className="mt-4 text-base leading-7 text-zinc-500 sm:text-lg">
            Work through the exact issues found during analysis.
            Every improvement stays linked to its original finding,
            evidence, and affected CV section.
          </p>

          {fileName && (
            <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-200">
              <span className="font-medium text-zinc-800">
                CV
              </span>

              <span className="text-zinc-300">
                •
              </span>

              <span className="max-w-[280px] truncate">
                {fileName}
              </span>
            </div>
          )}
        </div>

        <section className="mt-10 grid gap-5 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl bg-zinc-950 p-7 text-white shadow-xl">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-600/20 blur-3xl" />

            <div className="relative">
              <p className="text-sm font-medium text-zinc-400">
                Current CV Score
              </p>

              <div className="mt-4 flex items-end gap-2">
                <span className="text-6xl font-bold tracking-tight">
                  {score}
                </span>

                <span className="mb-2 text-zinc-500">
                  /100
                </span>
              </div>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{
                    width:
                      `${score}%`,
                  }}
                />
              </div>

              <p className="mt-5 text-sm leading-6 text-zinc-400">
                Your original score stays unchanged
                while you build the improved version.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
              Improvement progress
            </p>

            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              Build your improved CV one section
              at a time.
            </h2>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Generated
                </p>

                <p className="mt-2 text-2xl font-bold text-zinc-950">
                  {generatedCount}

                  <span className="text-sm font-medium text-zinc-400">
                    {" "}
                    / {fixes.length}
                  </span>
                </p>
              </div>

              <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Applied to CV
                </p>

                <p className="mt-2 text-2xl font-bold text-blue-700">
                  {appliedCount}

                  <span className="text-sm font-medium text-blue-400">
                    {" "}
                    / {fixes.length}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {analysis.recommendedRoles
                .slice(0, 4)
                .map(
                  (
                    role,
                    index
                  ) => (
                    <span
                      key={`${role}-${index}`}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700"
                    >
                      {role}
                    </span>
                  )
                )}
            </div>
          </div>
        </section>

        {fixes.length === 0 ? (
          <section className="mt-5 rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-bold">
              No improvements available yet
            </h2>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-500">
              We couldn’t load the details needed to improve this CV. Please analyze it again to continue.
            </p>

            <Link
              href="/upload"
              className="mt-6 inline-flex rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Analyze this CV again
            </Link>
          </section>
        ) : (
          <>
            <section className="mt-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                    Current Fix
                  </p>

                  <h2 className="mt-2 text-2xl font-bold tracking-tight">
                    {activeFix + 1} of{" "}
                    {fixes.length}
                  </h2>
                </div>

                <span className="text-sm font-medium text-zinc-400">
                  {appliedCount} applied
                </span>
              </div>

              <div className="mt-6 flex gap-2">
                {fixes.map(
                  (
                    fix,
                    index
                  ) => (
                    <button
                      key={fix.id}
                      type="button"
                      onClick={() =>
                        setActiveFix(
                          index
                        )
                      }
                      className={`h-2 flex-1 rounded-full transition ${
                        fix.applied
                          ? "bg-emerald-500"
                          : fix.generated
                            ? "bg-blue-600"
                            : index === activeFix
                              ? "bg-blue-300"
                              : "bg-zinc-200"
                      }`}
                      aria-label={`Open fix ${
                        index + 1
                      }`}
                    />
                  )
                )}
              </div>
            </section>

            {currentFix && (
              <section className="mt-5 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-200 p-6 sm:p-8">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-600">
                        {String(activeFix + 1).padStart(2, "0")}
                      </span>

                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">
                          CV improvement
                        </p>

                        <h2 className="mt-0.5 text-2xl font-bold tracking-tight">
                          {currentFix.title}
                        </h2>

                      </div>
                    </div>

                    {currentFix.applied ? (
                      <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        ✓ Applied to CV
                      </span>
                    ) : (
                      <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                        Recommended fix
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid lg:grid-cols-2">
                  <div className="border-b border-zinc-200 p-6 sm:p-8 lg:border-b-0 lg:border-r">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">
                      What needs attention
                    </p>

                    <h3 className="mt-3 text-lg font-bold">
                      Current issue
                    </h3>

                    <div className="mt-5 rounded-2xl border border-red-100 bg-red-50/60 p-5">
                      <p className="text-sm leading-7 text-zinc-700">
                        {currentFix.problem}
                      </p>
                    </div>

                    <div className="mt-7">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                        CVCommit recommendation
                      </p>

                      <p className="mt-3 text-sm leading-7 text-zinc-600">
                        {currentFix.recommendation}
                      </p>
                    </div>

                    <div className="mt-7 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 ring-1 ring-zinc-200">
                          {currentFix.severity} priority
                        </span>

                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 ring-1 ring-zinc-200">
                          {currentFix.category}
                        </span>

                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 ring-1 ring-zinc-200">
                          {currentFix.fixMode.replace("_", " ")}
                        </span>
                      </div>

                      <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
                        Analysis evidence
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                        {currentFix.evidence}
                      </p>
                    </div>

                    {currentFix.fixMode === "user_confirmation" && (
                      <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                          Confirmation required
                        </p>

                        <p className="mt-2 text-sm leading-6 text-zinc-700">
                          CVCommit cannot safely infer the missing or uncertain fact. Enter the correct information before generating a rewrite.
                        </p>

                        <textarea
                          value={currentFix.userConfirmation}
                          onChange={(event) =>
                            updateUserConfirmation(
                              currentFix.id,
                              event.target.value
                            )
                          }
                          rows={4}
                          className="mt-4 w-full resize-y rounded-xl border border-amber-200 bg-white p-4 text-sm leading-6 text-zinc-800 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                          placeholder="Enter the correct information exactly as it should appear in your CV..."
                        />
                      </div>
                    )}
                  </div>

                  <div className="p-6 sm:p-8">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                          Improved version
                        </p>

                        <h3 className="mt-2 text-lg font-bold">
                          CVCommit generated content
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={
                          generateImprovement
                        }
                        disabled={
                          isGenerating ||
                          !currentFix.sectionKey ||
                          (currentFix.fixMode === "user_confirmation" &&
                            !currentFix.userConfirmation.trim())
                        }
                        className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        {isGenerating
                          ? "Generating..."
                          : currentFix.generated
                            ? "Regenerate"
                            : currentFix.fixMode === "user_confirmation"
                              ? "Generate with Confirmed Info"
                              : "Generate Improvement"}
                      </button>
                    </div>

                    <textarea
                      value={
                        currentFix.content
                      }
                      onChange={(
                        event
                      ) =>
                        updateFixContent(
                          currentFix.id,
                          event.target.value
                        )
                      }
                      rows={10}
                      className="mt-5 w-full resize-y rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-7 text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
                      placeholder="Click Generate Improvement to create stronger CV content..."
                    />

                    <p className="mt-3 text-xs leading-5 text-zinc-400">
                      Review every generated statement
                      and make sure it accurately
                      reflects your real experience.
                    </p>

                    {!currentFix.sectionKey && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                        This improvement can’t be applied automatically to this section yet. Please review and update it manually.
                      </div>
                    )}

                    {currentFix.generated && (
                      <div className="mt-5">
                        {currentFix.applied ? (
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="flex flex-1 items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
                              <span>
                                ✓
                              </span>

                              This version is currently
                              applied to your improved CV.
                            </div>

                            <button
                              type="button"
                              onClick={
                                undoCurrentFix
                              }
                              className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                            >
                              Undo
                            </button>
                          </div>
                        ) : canApplyCurrentFix ? (
                          <button
                            type="button"
                            onClick={
                              applyCurrentFix
                            }
                            className="w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-700"
                          >
                            Apply to CV
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 bg-zinc-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    disabled={
                      activeFix === 0
                    }
                    onClick={() =>
                      setActiveFix(
                        (
                          current
                        ) =>
                          Math.max(
                            0,
                            current - 1
                          )
                      )
                    }
                    className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={
                        saveChanges
                      }
                      className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
                    >
                      {saved
                        ? "Changes Saved"
                        : "Save Changes"}
                    </button>

                    {activeFix <
                    fixes.length - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveFix(
                            (
                              current
                            ) =>
                              Math.min(
                                fixes.length -
                                  1,
                                current + 1
                              )
                          )
                        }
                        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Next Fix
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={
                          saveChanges
                        }
                        className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                      >
                        Save Improvement Plan
                      </button>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="mt-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Your fixes
              </p>

              <h2 className="mt-2 text-2xl font-bold tracking-tight">
                Improvement checklist
              </h2>

              <div className="mt-7 space-y-3">
                {fixes.map(
                  (
                    fix,
                    index
                  ) => (
                    <button
                      key={fix.id}
                      type="button"
                      onClick={() =>
                        setActiveFix(
                          index
                        )
                      }
                      className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                        index === activeFix
                          ? "border-blue-200 bg-blue-50/50"
                          : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                          fix.applied
                            ? "bg-emerald-500 text-white"
                            : fix.generated
                              ? "bg-blue-600 text-white"
                              : "bg-white text-zinc-500 ring-1 ring-zinc-200"
                        }`}
                      >
                        {fix.applied
                          ? "✓"
                          : fix.generated
                            ? "AI"
                            : String(index + 1).padStart(2, "0")}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-zinc-900">
                            {fix.title}
                          </p>

                          {fix.applied && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                              Applied
                            </span>
                          )}
                        </div>

                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {fix.recommendation}
                        </p>

                      </div>

                      <span className="text-zinc-400">
                        →
                      </span>
                    </button>
                  )
                )}
              </div>
            </section>

            {appliedCount > 0 &&
              improvedCV && (
                <section className="mt-5 overflow-hidden rounded-3xl bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
                  <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
                        Improved CV
                      </p>

                      <h2 className="mt-2 text-2xl font-bold tracking-tight">
                        {appliedCount} improvement
                        {appliedCount === 1
                          ? ""
                          : "s"}{" "}
                        applied
                      </h2>

                      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                        CVCommit is keeping your
                        original CV untouched while
                        building a separate improved
                        version from the fixes you
                        approve.
                      </p>

                      <div className="mt-6">
                        <Link
                          href="/preview"
                          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-blue-500"
                        >
                          Preview Improved CV

                          <span className="ml-2">
                            →
                          </span>
                        </Link>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-5 text-center">
                      <p className="text-3xl font-bold">
                        {
                          improvedCV.appliedFixes
                            .length
                        }
                      </p>

                      <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
                        Sections updated
                      </p>
                    </div>
                  </div>
                </section>
              )}
          </>
        )}

        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-3xl border border-zinc-200 bg-white p-6 sm:flex-row sm:p-7">
          <div>
            <h2 className="font-bold text-zinc-950">
              Need to review your original
              analysis?
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Go back to your CVCommit report.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {appliedCount > 0 && (
              <Link
                href="/preview"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Preview Improved CV
              </Link>
            )}

            <Link
              href="/results"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
            >
              Back to analysis
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProFeature({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-bold text-violet-600">
        ✓
      </div>

      <span className="text-sm font-medium text-zinc-700">
        {text}
      </span>
    </div>
  );
}
