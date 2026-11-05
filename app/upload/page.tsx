"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function UploadPage() {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleFile = (selectedFile: File | undefined) => {
    if (!selectedFile) {
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    const maxSize = 10 * 1024 * 1024;

    if (!allowedTypes.includes(selectedFile.type)) {
      alert("Please upload a PDF or DOCX file.");
      return;
    }

    if (selectedFile.size > maxSize) {
      alert("Your CV must be less than 10MB.");
      return;
    }

    setFile(selectedFile);
  };

  const resetActiveCVSession = () => {
    const keysToRemove = [
      "careerOSAnalysis",
      "careerOSAnalysisSource",
      "careerOSExtractedText",
      "careerOSFileName",
      "careerOSFixes",
      "careerOSImprovedCV",
      "careerOSImprovedCVText",
      "careerOSActiveCVHash",
      "careerOSAnalysisHash",
    ];

    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }

    console.log("CVCommit: Previous active CV session cleared.");
  };

  const handleUpload = async () => {
    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();

      if (!responseText.trim()) {
        throw new Error("CVCommit received an empty upload response.");
      }

      let data: {
        success?: boolean;
        error?: string;
        extractedText?: string;
        fileName?: string;
      };

      try {
        data = JSON.parse(responseText);
      } catch {
        console.error(
          "CVCommit upload returned non-JSON:",
          responseText.slice(0, 1500)
        );

        throw new Error("CVCommit received an invalid upload response.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      if (
        typeof data.extractedText !== "string" ||
        !data.extractedText.trim()
      ) {
        throw new Error("CVCommit could not read the uploaded CV.");
      }

      resetActiveCVSession();

      sessionStorage.setItem(
        "careerOSExtractedText",
        data.extractedText
      );

      sessionStorage.setItem(
        "careerOSFileName",
        data.fileName || file.name
      );

      console.log("CVCommit: New CV session created.", {
        fileName: data.fileName || file.name,
        characters: data.extractedText.length,
      });

      router.push("/analysis");
    } catch (error) {
      console.error("CVCommit upload error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Something went wrong while uploading your CV."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      /*
       * Remove active CV data from this browser tab so
       * another user cannot inherit the previous session.
       */
      sessionStorage.clear();

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("CVCommit sign out error:", error);

      alert("CVCommit could not sign you out. Please try again.");

      setIsSigningOut(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <nav className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5 lg:px-8">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight"
          >
            CV<span className="text-blue-600">Commit</span>
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </nav>

      <section className="mx-auto flex min-h-[calc(100vh-81px)] max-w-4xl flex-col items-center px-6 py-20 text-center">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
            Step 1 of 2
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Upload your CV
          </h1>

          <p className="mt-5 text-lg leading-8 text-zinc-600">
            Upload your CV and CVCommit will analyze your experience,
            skills, structure, ATS readiness, and areas for improvement.
          </p>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();

            setIsDragging(false);

            handleFile(event.dataTransfer.files?.[0]);
          }}
          className={`mt-12 w-full rounded-3xl border-2 border-dashed p-10 transition sm:p-16 ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-zinc-300 bg-white"
          }`}
        >
          <div className="mx-auto flex max-w-md flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600">
              ↑
            </div>

            <h2 className="mt-6 text-xl font-semibold">
              {file ? file.name : "Drop your CV here"}
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                : "PDF or DOCX • Maximum 10MB"}
            </p>

            {!file && (
              <>
                <div className="my-5 text-sm text-zinc-400">
                  or
                </div>

                <label className="cursor-pointer rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800">
                  Choose a file

                  <input
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={(event) =>
                      handleFile(event.target.files?.[0])
                    }
                  />
                </label>
              </>
            )}

            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="mt-6 text-sm font-medium text-red-600 hover:text-red-700"
              >
                Remove file
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex w-full max-w-2xl items-center justify-between text-sm text-zinc-500">
          <span>Your CV stays private.</span>
          <span>PDF or DOCX</span>
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || isUploading || isSigningOut}
          className="mt-10 w-full max-w-2xl rounded-full bg-blue-600 px-7 py-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          {isUploading
            ? "Uploading your CV..."
            : "Continue to Analysis"}
        </button>

        <p className="mt-8 text-xs text-zinc-400">
          CVCommit is a product by Tioluwa Designs.
        </p>
      </section>
    </main>
  );
}