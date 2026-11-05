"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import {
  type ImprovedCV,
} from "@/lib/cv/cv-merge";

import {
  type CVSection,
} from "@/lib/cv/section-parser";

import { ClassicTemplate } from "@/components/cv/templates/classic-template";
import { ModernTemplate } from "@/components/cv/templates/modern-template";
import { CompactTemplate } from "@/components/cv/templates/compact-template";

import {
  CV_TEMPLATES,
  DEFAULT_CV_TEMPLATE,
} from "@/lib/cv/templates/template-registry";

import {
  type CVTemplateId,
  isCVTemplateId,
} from "@/lib/cv/templates/template-types";

type RawObject = Record<string, unknown>;

type ExportType =
  | "docx"
  | "pdf";

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

function isCVSection(
  value: unknown
): value is CVSection {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const section =
    value as RawObject;

  return (
    typeof section.key === "string" &&
    typeof section.title === "string" &&
    typeof section.content === "string" &&
    typeof section.order === "number"
  );
}

function isImprovedCV(
  value: unknown
): value is ImprovedCV {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const cv =
    value as RawObject;

  return (
    typeof cv.mergedText === "string" &&
    Array.isArray(cv.sections) &&
    cv.sections.every(isCVSection) &&
    Array.isArray(cv.appliedFixes)
  );
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
    improvedCV:
      `careerOSImprovedCV_${cvHash}`,

    improvedCVText:
      `careerOSImprovedCVText_${cvHash}`,

    fixes:
      `careerOSFixes_${cvHash}`,

    analysis:
      `careerOSAnalysis_${cvHash}`,
  };
}

function getDownloadFileName(
  response: Response,
  fallbackFileName: string,
  type: ExportType
): string {
  const disposition =
    response.headers.get(
      "content-disposition"
    );

  if (disposition) {
    const match =
      disposition.match(
        /filename="?([^"]+)"?/i
      );

    if (
      match &&
      match[1]
    ) {
      return match[1].trim();
    }
  }

  const withoutExtension =
    fallbackFileName.replace(
      /\.(pdf|docx)$/i,
      ""
    );

  const cleaned =
    withoutExtension
      .replace(
        /[^a-zA-Z0-9 _-]/g,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  const baseName =
    cleaned ||
    "CVCommit-CV";

  return `${baseName}-CVCommit.${type}`;
}

async function readExportError(
  response: Response,
  type: ExportType
): Promise<string> {
  const responseText =
    await response.text();

  if (
    !responseText.trim()
  ) {
    return `CVCommit could not export your CV as ${type.toUpperCase()}.`;
  }

  try {
    const parsed =
      JSON.parse(
        responseText
      ) as {
        error?: unknown;
      };

    if (
      typeof parsed.error ===
        "string" &&
      parsed.error.trim()
    ) {
      return parsed.error.trim();
    }
  } catch {
    console.error(
      `CVCommit ${type.toUpperCase()} export returned a non-JSON error:`,
      responseText.slice(
        0,
        1500
      )
    );
  }

  return `CVCommit could not export your CV as ${type.toUpperCase()}.`;
}

export default function PreviewPage() {
  const router =
    useRouter();

  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    improvedCV,
    setImprovedCV,
  ] =
    useState<ImprovedCV | null>(
      null
    );

  const [
    fileName,
    setFileName,
  ] =
    useState("");

  const [
    cvHash,
    setCVHash,
  ] =
    useState("");

  const [
    selectedTemplate,
    setSelectedTemplate,
  ] =
    useState<CVTemplateId>(
      DEFAULT_CV_TEMPLATE
    );

  const [
    isLoaded,
    setIsLoaded,
  ] =
    useState(false);

  const [
    verificationError,
    setVerificationError,
  ] =
    useState("");

  const [
    isDownloadingDOCX,
    setIsDownloadingDOCX,
  ] =
    useState(false);

  const [
    isDownloadingPDF,
    setIsDownloadingPDF,
  ] =
    useState(false);

  const [
    downloadError,
    setDownloadError,
  ] =
    useState("");

  const [
    isAuthenticated,
    setIsAuthenticated,
  ] =
    useState(false);

  const [
    accessError,
    setAccessError,
  ] =
    useState("");

  const [
    isSigningOut,
    setIsSigningOut,
  ] =
    useState(false);

  useEffect(() => {
    let cancelled =
      false;

    async function loadPreview() {
      const storedExtractedText =
        sessionStorage.getItem(
          "careerOSExtractedText"
        );

      const storedFileName =
        sessionStorage.getItem(
          "careerOSFileName"
        );

      if (
        !storedExtractedText ||
        !storedExtractedText.trim()
      ) {
        if (!cancelled) {
          setVerificationError(
            "The original CV is unavailable. Please upload and analyze the CV again."
          );

          setIsLoaded(
            true
          );
        }

        return;
      }

      try {
        const currentCVHash =
          await createCVHash(
            storedExtractedText
          );

        if (cancelled) {
          return;
        }

        const storedTemplate =
          sessionStorage.getItem(
            `careerOSCVTemplate_${currentCVHash}`
          );

        setSelectedTemplate(
          isCVTemplateId(
            storedTemplate
          )
            ? storedTemplate
            : DEFAULT_CV_TEMPLATE
        );

        /*
         * ---------------------------------------------------------
         * VERIFY ACCESS FOR THIS EXACT CV
         * ---------------------------------------------------------
         */

        try {
          const accountResponse =
            await fetch(
              `/api/account?cvHash=${encodeURIComponent(
                currentCVHash
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          const accountData =
            (await accountResponse.json()) as AccountResponse;

          if (cancelled) {
            return;
          }

          const authenticated =
            accountResponse.ok &&
            accountData.success === true &&
            accountData.authenticated === true;

          setIsAuthenticated(
            authenticated
          );

          if (!authenticated) {
            setAccessError(
              "Sign in to preview your improved CVCommit CV."
            );

            setIsLoaded(
              true
            );

            return;
          }

          const paidAccess =
            accountData.canDownload ===
              true &&
            accountData.cvHash ===
              currentCVHash;

          if (!paidAccess) {
            setAccessError(
              "Unlock this CV to preview and export your improved version."
            );

            setIsLoaded(
              true
            );

            return;
          }
        } catch (error) {
          console.error(
            "CVCommit Preview: Failed to verify CV access.",
            error
          );

          if (!cancelled) {
            setIsAuthenticated(
              false
            );

            setAccessError(
              "CVCommit could not verify access to this CV. Please sign in again and retry."
            );

            setIsLoaded(
              true
            );
          }

          return;
        }

        const activeCVHash =
          sessionStorage.getItem(
            "careerOSActiveCVHash"
          );

        const analysisHash =
          sessionStorage.getItem(
            "careerOSAnalysisHash"
          );

        if (
          activeCVHash &&
          activeCVHash !==
            currentCVHash
        ) {
          throw new Error(
            "CVCommit detected that this preview belongs to a different CV."
          );
        }

        if (
          analysisHash &&
          analysisHash !==
            currentCVHash
        ) {
          throw new Error(
            "The active analysis does not belong to the CV being previewed."
          );
        }

        const keys =
          getCVStorageKeys(
            currentCVHash
          );

        const verifiedAnalysis =
          sessionStorage.getItem(
            keys.analysis
          );

        if (
          !verifiedAnalysis
        ) {
          throw new Error(
            "CVCommit could not verify an analysis for this CV."
          );
        }

        const storedImprovedCV =
          sessionStorage.getItem(
            keys.improvedCV
          );

        if (
          !storedImprovedCV
        ) {
          if (!cancelled) {
            setFileName(
              storedFileName ??
                ""
            );

            setImprovedCV(
              null
            );

            setIsLoaded(
              true
            );
          }

          return;
        }

        const parsed:
          unknown =
          JSON.parse(
            storedImprovedCV
          );

        if (
          !isImprovedCV(
            parsed
          )
        ) {
          throw new Error(
            "Stored improved CV is invalid."
          );
        }

        if (
          parsed.appliedFixes.length ===
          0
        ) {
          if (!cancelled) {
            setFileName(
              storedFileName ??
                ""
            );

            setImprovedCV(
              null
            );

            setIsLoaded(
              true
            );
          }

          return;
        }

        sessionStorage.setItem(
          "careerOSActiveCVHash",
          currentCVHash
        );

        sessionStorage.setItem(
          "careerOSAnalysisHash",
          currentCVHash
        );

        sessionStorage.setItem(
          "careerOSImprovedCV",
          storedImprovedCV
        );

        sessionStorage.setItem(
          "careerOSImprovedCVText",
          parsed.mergedText
        );

        if (!cancelled) {
          setCVHash(
            currentCVHash
          );

          setImprovedCV(
            parsed
          );

          setFileName(
            storedFileName ??
              ""
          );

          setVerificationError(
            ""
          );

          setIsLoaded(
            true
          );
        }

        console.log(
          "CVCommit Preview: Verified improved CV.",
          {
            cvHash:
              currentCVHash,

            appliedFixes:
              parsed.appliedFixes.length,

            sections:
              parsed.sections.length,
          }
        );
      } catch (error) {
        console.error(
          "CVCommit Preview: Failed to verify improved CV.",
          error
        );

        if (!cancelled) {
          setImprovedCV(
            null
          );

          setVerificationError(
            error instanceof Error
              ? error.message
              : "CVCommit could not verify the improved CV."
          );

          setIsLoaded(
            true
          );
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled =
        true;
    };
  }, []);

  function handleTemplateChange(
    templateId: CVTemplateId
  ) {
    setSelectedTemplate(
      templateId
    );

    if (cvHash) {
      sessionStorage.setItem(
        `careerOSCVTemplate_${cvHash}`,
        templateId
      );
    }
  }

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
       * Preview contains the user's improved CV.
       * Clear this browser tab's CV session on sign out.
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

  async function downloadExport(
    type: ExportType
  ) {
    if (!improvedCV) {
      return;
    }

    if (!cvHash) {
      setDownloadError(
        "CVCommit could not verify which CV is active. Please return to Fix My CV and try again."
      );

      return;
    }

    if (
      isDownloadingDOCX ||
      isDownloadingPDF
    ) {
      return;
    }

    if (
      type === "docx"
    ) {
      setIsDownloadingDOCX(
        true
      );
    } else {
      setIsDownloadingPDF(
        true
      );
    }

    setDownloadError(
      ""
    );

    try {
      const endpoint =
        type === "docx"
          ? "/api/export/docx"
          : "/api/export/pdf";

      console.log(
        `CVCommit: Starting ${type.toUpperCase()} export.`,
        {
          sections:
            improvedCV.sections.length,

          appliedFixes:
            improvedCV.appliedFixes.length,
        }
      );

      const response =
        await fetch(
          endpoint,
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

                templateId:
                  selectedTemplate,

                fileName:
                  fileName ||
                  "CVCommit-CV",

                sections:
                  improvedCV.sections,
              }),
          }
        );

      if (
        !response.ok
      ) {
        const message =
          await readExportError(
            response,
            type
          );

        throw new Error(
          message
        );
      }

      const blob =
        await response.blob();

      if (
        blob.size ===
        0
      ) {
        throw new Error(
          `CVCommit created an empty ${type.toUpperCase()} file.`
        );
      }

      const downloadName =
        getDownloadFileName(
          response,
          fileName,
          type
        );

      const downloadUrl =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href =
        downloadUrl;

      anchor.download =
        downloadName;

      anchor.style.display =
        "none";

      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();

      window.setTimeout(
        () => {
          URL.revokeObjectURL(
            downloadUrl
          );
        },
        1000
      );

      console.log(
        `CVCommit: ${type.toUpperCase()} export completed.`,
        {
          fileName:
            downloadName,

          bytes:
            blob.size,
        }
      );
    } catch (error) {
      console.error(
        `CVCommit ${type.toUpperCase()} download error:`,
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : `CVCommit could not download your ${type.toUpperCase()} CV.`;

      setDownloadError(
        message
      );
    } finally {
      if (
        type === "docx"
      ) {
        setIsDownloadingDOCX(
          false
        );
      } else {
        setIsDownloadingPDF(
          false
        );
      }
    }
  }

  const downloadDOCX =
    () =>
      downloadExport(
        "docx"
      );

  const downloadPDF =
    () =>
      downloadExport(
        "pdf"
      );

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-950">
            Building your preview
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Verifying and preparing your improved CVCommit CV...
          </p>
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-xl font-bold text-amber-600">
            !
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-950">
            Unlock this CV to preview
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {accessError}
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            {!isAuthenticated ? (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Log In
                </Link>

                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Create Account
                </Link>
              </>
            ) : (
              <div className="flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/upgrade"
                  className="inline-flex items-center justify-center rounded-xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Unlock This CV — ₦7,500
                </Link>

                <Link
                  href="/results"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Return to Results
                </Link>

                <button
                  type="button"
                  onClick={
                    handleSignOut
                  }
                  disabled={
                    isSigningOut
                  }
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSigningOut
                    ? "Signing out..."
                    : "Sign Out"}
                </button>
              </div>
            )}
          </div>

          {isAuthenticated ? (
            <p className="mt-5 text-xs leading-5 text-zinc-400">
              One-time payment · No subscription
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  if (!improvedCV) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-xl font-bold text-blue-600">
            !
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-950">
            No verified improved CV found
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {verificationError ||
              "Apply at least one improvement before previewing your new CV."}
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/fix"
              className="inline-flex items-center justify-center rounded-xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Return to Fix My CV
            </Link>

            <Link
              href="/upload"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Upload CV
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const sections =
    improvedCV.sections
      .slice()
      .sort(
        (a, b) =>
          a.order -
          b.order
      );

  const appliedCount =
    improvedCV.appliedFixes.length;

  const exportDisabled =
    isDownloadingDOCX ||
    isDownloadingPDF;

  const SelectedTemplateComponent =
    selectedTemplate === "modern"
      ? ModernTemplate
      : selectedTemplate === "compact"
        ? CompactTemplate
        : ClassicTemplate;

  const selectedTemplateDefinition =
    CV_TEMPLATES.find(
      (template) =>
        template.id ===
        selectedTemplate
    ) ?? CV_TEMPLATES[0];

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <nav className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
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
              href="/fix"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Back to fixes
            </Link>

            <button
              type="button"
              onClick={
                downloadDOCX
              }
              disabled={
                exportDisabled
              }
              className="hidden items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 lg:inline-flex"
            >
              {isDownloadingDOCX
                ? "Creating DOCX..."
                : "Download DOCX"}
            </button>

            <button
              type="button"
              onClick={
                downloadPDF
              }
              disabled={
                exportDisabled
              }
              className="hidden items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex"
            >
              {isDownloadingPDF
                ? "Creating PDF..."
                : "Download PDF"}
            </button>

            <button
              type="button"
              onClick={
                handleSignOut
              }
              disabled={
                isSigningOut ||
                exportDisabled
              }
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningOut
                ? "Signing out..."
                : "Sign Out"}
            </button>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Improved CV Preview
            </div>

            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Preview your new CV
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-500 sm:text-lg">
              Review the version CVCommit is building from the improvements you approved.
            </p>

            {fileName && (
              <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-200">
                <span className="font-medium text-zinc-800">
                  Original
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

          <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">
              Applied improvements
            </p>

            <p className="mt-1 text-3xl font-bold tracking-tight text-emerald-600">
              {appliedCount}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Choose template
              </p>

              <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950">
                Pick the look of your CV
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                Changing the template only changes the design. Your approved CV content stays exactly the same.
              </p>
            </div>

            <div className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600">
              Selected: {selectedTemplateDefinition.name}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {CV_TEMPLATES.map(
              (template) => {
                const selected =
                  template.id ===
                  selectedTemplate;

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() =>
                      handleTemplateChange(
                        template.id
                      )
                    }
                    className={`rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                        : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-zinc-950">
                        {template.name}
                      </p>

                      {selected ? (
                        <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                          Selected
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      {template.description}
                    </p>

                    <p className="mt-3 text-xs font-semibold leading-5 text-zinc-600">
                      Best for: {template.bestFor}
                    </p>

                    {template.atsFriendly ? (
                      <p className="mt-3 text-xs font-bold text-emerald-600">
                        ATS-friendly
                      </p>
                    ) : null}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {downloadError && (
          <div className="mx-auto mt-6 max-w-[850px] rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm font-semibold text-red-700">
              CV export failed
            </p>

            <p className="mt-1 text-sm leading-6 text-red-600">
              {downloadError}
            </p>
          </div>
        )}

        <div className="mt-10 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
              CV Sections
            </p>

            <div className="mt-5 space-y-2">
              {sections.map(
                (section) => (
                  <a
                    key={`${section.key}-${section.order}`}
                    href={`#section-${section.order}`}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-950"
                  >
                    <span className="truncate">
                      {section.key ===
                      "header"
                        ? "Contact / Header"
                        : section.title}
                    </span>

                    <span className="text-xs text-zinc-300">
                      →
                    </span>
                  </a>
                )
              )}
            </div>

            <div className="mt-6 rounded-2xl bg-blue-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Original protected
              </p>

              <p className="mt-2 text-xs leading-5 text-blue-700/80">
                CVCommit is previewing a separate improved copy. Your uploaded CV has not been overwritten.
              </p>
            </div>

            <div className="mt-3 rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                CV verified
              </p>

              <p className="mt-2 text-xs leading-5 text-emerald-700/80">
                This preview has been matched to the currently active CV before being displayed.
              </p>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mx-auto max-w-[850px] overflow-hidden bg-white shadow-xl ring-1 ring-zinc-200">
              <SelectedTemplateComponent
                sections={sections}
              />
            </div>

            <div className="mx-auto mt-5 flex max-w-[850px] flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold text-zinc-950">
                  Something doesn&apos;t look right?
                </p>

                <p className="mt-1 text-sm text-zinc-500">
                  Return to the improvement workspace and change or undo any applied fix.
                </p>
              </div>

              <Link
                href="/fix"
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
              >
                Edit improvements
              </Link>
            </div>

            <div className="mx-auto mt-5 max-w-[850px] overflow-hidden rounded-3xl bg-zinc-950 p-6 text-white shadow-xl sm:p-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">
                  Export CV
                </p>

                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  Your improved CV is ready
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  Download your verified improved CV as an editable Word document or a ready-to-share PDF.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={
                      downloadDOCX
                    }
                    disabled={
                      exportDisabled
                    }
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDownloadingDOCX
                      ? "Creating DOCX..."
                      : "Download DOCX"}
                  </button>

                  <button
                    type="button"
                    onClick={
                      downloadPDF
                    }
                    disabled={
                      exportDisabled
                    }
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDownloadingPDF
                      ? "Creating PDF..."
                      : "Download PDF"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
