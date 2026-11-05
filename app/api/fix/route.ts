import { recordAIUsage } from "@/lib/ai/usage";
import { generateSelfHosted, isSelfHostedConfigured } from "@/lib/ai/self-hosted";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getCareerOSCVAccess } from "@/lib/access/server-access";
import {
  consumeCVQuota,
  CV_LIMIT_MESSAGE,
} from "@/lib/access/cv-quota";


import {
  getCVSection,
  parseCVSections,
  type CVSectionKey,
  type ParsedCV,
} from "@/lib/cv/section-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

const gemini = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

type RawObject = Record<string, unknown>;

type AnalysisIssueEvidenceKind =
  | "cv_text"
  | "absence"
  | "pattern";

type AnalysisIssueFixMode =
  | "rewrite"
  | "user_confirmation"
  | "structural";

type AnalysisIssueSeverity =
  | "high"
  | "medium"
  | "low";

type TraceableSectionKey =
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

type FixRequest = {
  cvHash: string;
  extractedText: string;
  issueId: string;
  sectionKey: TraceableSectionKey;
  section: string;
  category: string;
  problem: string;
  evidence: string;
  evidenceKind: AnalysisIssueEvidenceKind;
  severity: AnalysisIssueSeverity;
  fixMode: AnalysisIssueFixMode;
  userConfirmation: string;
  improvement: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;

  error?: {
    message?: string;
    code?: number | string;
  };
};

type SectionContext = {
  sectionKey: CVSectionKey;
  sectionContent: string;
  usedFullCV: boolean;
};

const TRACEABLE_SECTION_KEYS = new Set<TraceableSectionKey>([
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
]);

const CV_SECTION_KEYS = new Set<CVSectionKey>([
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
]);

const EVIDENCE_KINDS = new Set<AnalysisIssueEvidenceKind>([
  "cv_text",
  "absence",
  "pattern",
]);

const FIX_MODES = new Set<AnalysisIssueFixMode>([
  "rewrite",
  "user_confirmation",
  "structural",
]);

const SEVERITIES = new Set<AnalysisIssueSeverity>([
  "high",
  "medium",
  "low",
]);

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTraceableSectionKey(
  value: unknown
): TraceableSectionKey | null {
  const sectionKey =
    stringValue(value).toLowerCase() as TraceableSectionKey;

  return TRACEABLE_SECTION_KEYS.has(sectionKey)
    ? sectionKey
    : null;
}

function normalizeEvidenceKind(
  value: unknown
): AnalysisIssueEvidenceKind | null {
  const evidenceKind =
    stringValue(value).toLowerCase() as AnalysisIssueEvidenceKind;

  return EVIDENCE_KINDS.has(evidenceKind)
    ? evidenceKind
    : null;
}

function normalizeFixMode(
  value: unknown
): AnalysisIssueFixMode | null {
  const fixMode =
    stringValue(value).toLowerCase() as AnalysisIssueFixMode;

  return FIX_MODES.has(fixMode) ? fixMode : null;
}

function normalizeSeverity(
  value: unknown
): AnalysisIssueSeverity | null {
  const severity =
    stringValue(value).toLowerCase() as AnalysisIssueSeverity;

  return SEVERITIES.has(severity) ? severity : null;
}

function toCVSectionKey(
  sectionKey: TraceableSectionKey
): CVSectionKey | null {
  if (!CV_SECTION_KEYS.has(sectionKey as CVSectionKey)) {
    return null;
  }

  return sectionKey as CVSectionKey;
}

function normalizeRequest(value: unknown): FixRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const body = value as RawObject;

  const cvHash = stringValue(body.cvHash);
  const extractedText = stringValue(body.extractedText);
  const issueId = stringValue(body.issueId);
  const sectionKey = normalizeTraceableSectionKey(body.sectionKey);
  const evidenceKind = normalizeEvidenceKind(body.evidenceKind);
  const fixMode = normalizeFixMode(body.fixMode);
  const severity = normalizeSeverity(body.severity);

  const section =
    stringValue(body.section) || stringValue(body.title);

  const category = stringValue(body.category);
  const problem = stringValue(body.problem);
  const evidence = stringValue(body.evidence);
  const userConfirmation = stringValue(body.userConfirmation);

  const improvement =
    stringValue(body.improvement) ||
    stringValue(body.recommendation);

  if (
    !cvHash ||
    !extractedText ||
    !/^issue_\d{3}$/i.test(issueId) ||
    !sectionKey ||
    !section ||
    !category ||
    !problem ||
    !evidence ||
    !evidenceKind ||
    !severity ||
    !fixMode ||
    !improvement
  ) {
    return null;
  }

  return {
    cvHash,
    extractedText,
    issueId: issueId.toLowerCase(),
    sectionKey,
    section,
    category,
    problem,
    evidence,
    evidenceKind,
    severity,
    fixMode,
    userConfirmation,
    improvement,
  };
}

function cleanGeneratedText(value: string): string {
  let text = value.trim();

  text = text.replace(
    /^```(?:text|markdown|plaintext)?\s*/i,
    ""
  );

  text = text.replace(/\s*```$/i, "");

  return text.trim();
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSectionContext(
  parsedCV: ParsedCV,
  requestedSectionKey: TraceableSectionKey
): SectionContext | null {
  const sectionKey = toCVSectionKey(requestedSectionKey);

  if (!sectionKey || sectionKey === "other") {
    return null;
  }

  const sectionContent = getCVSection(parsedCV, sectionKey);

  if (sectionContent.trim()) {
    return {
      sectionKey,
      sectionContent,
      usedFullCV: false,
    };
  }

  return {
    sectionKey,
    sectionContent: parsedCV.rawText,
    usedFullCV: true,
  };
}

function buildPrompt({
  request,
  context,
}: {
  request: FixRequest;
  context: SectionContext;
}): string {
  const sourceLabel = context.usedFullCV
    ? "RELEVANT CV CONTEXT"
    : "CURRENT SECTION CONTENT";

  const confirmationBlock =
    request.fixMode === "user_confirmation"
      ? `\nCUSTOMER-CONFIRMED INFORMATION\n\n${request.userConfirmation}\n\nThe customer-confirmed information above is the only new factual information you may add. Do not infer or invent anything beyond it.\n`
      : "";

  return `
You are CVCommit's CV rewriting engine.

Your task is to fix exactly ONE traceable issue that CVCommit already identified during analysis.

TRACEABILITY CONTRACT

Issue ID: ${request.issueId}
Affected section: ${request.sectionKey}
Issue category: ${request.category}
Severity: ${request.severity}
Fix mode: ${request.fixMode}
Evidence type: ${request.evidenceKind}

Issue title:
${request.section}

Problem identified:
${request.problem}

Analysis evidence:
${request.evidence}

Recommended correction:
${request.improvement}
${confirmationBlock}
STRICT ACCURACY RULES

Never invent:
- Jobs
- Employers
- Companies
- Qualifications
- Degrees
- Certifications
- Projects
- Responsibilities
- Achievements
- Skills
- Dates
- Numbers
- Percentages
- Revenue
- Cost savings
- Team sizes
- Project sizes
- Results
- Personal information

Use only facts supported by the CV context plus, when fixMode is user_confirmation, the exact customer-confirmed information supplied above.

Do not add a metric just because the recommendation asks for stronger impact. If the CV contains no metric, improve the wording without inventing a number.

Do not change employer names, job titles, institutions, qualifications, dates, project names, or contact details unless the customer-confirmed information explicitly corrects that exact fact.

FIX MODE RULES

rewrite:
Rewrite only the affected section. Preserve all factual meaning. Improve clarity, strength, concision, and ATS readability.

user_confirmation:
Use the customer-confirmed information to correct the specific missing or uncertain fact. Do not guess. Preserve every unrelated fact exactly.

structural:
Reorganize only the affected section using existing facts. Do not create new claims.

IMPORTANT TRACEABILITY RULES

- Fix only issue ${request.issueId}.
- Do not solve unrelated issues.
- Do not rewrite unrelated CV sections.
- Do not create a "whole CV" replacement.
- If the current section already contains previous approved edits, preserve them unless they directly conflict with this issue.
- Treat the analysis evidence as the reason this fix exists, not as permission to invent additional facts.

${sourceLabel}

${context.sectionContent}

OUTPUT REQUIREMENTS

Return only the final CV-ready content for the affected section.

Do not return JSON.
Do not return Markdown headings.
Do not return code fences.
Do not explain your reasoning.
Do not write "Here is the improved version".

QUALITY STANDARD

- Professional human CV writing
- Clean, natural business English
- ATS-friendly wording
- Strong action verbs only where supported
- Concise, scannable phrasing
- No repetition
- No generic unsupported claims
- Preserve factual accuracy above style
`;
}

function strengthenLine(value: string): string {
  const bulletMatch = value.match(
    /^\s*(?:[-*•▪◦‣]|\d+[.)])\s*(.*)$/
  );

  const bulletContent = bulletMatch
    ? bulletMatch[1]
    : value.trim();

  let text = bulletContent.trim();

  if (!text) {
    return "";
  }

  const replacements: Array<[RegExp, string]> = [
    [/^was responsible for\s+/i, "Handled "],
    [/^responsible for\s+/i, "Handled "],
    [/^tasked with\s+/i, "Handled "],
    [/^in charge of\s+/i, "Managed "],
    [/^helped with\s+/i, "Supported "],
    [/^helped to\s+/i, "Supported "],
    [/^assisted with\s+/i, "Supported "],
    [/^assisted in\s+/i, "Supported "],
    [/^worked on\s+/i, "Contributed to "],
    [/^participated in\s+/i, "Contributed to "],
    [/^my role was to\s+/i, ""],
    [/^i was responsible for\s+/i, "Handled "],
    [/^i helped\s+/i, "Supported "],
    [/^i assisted\s+/i, "Supported "],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      break;
    }
  }

  text = text.replace(/\s+/g, " ").trim();

  if (!text) {
    return "";
  }

  text = text.charAt(0).toUpperCase() + text.slice(1);

  if (bulletMatch && !/[.!?;:]$/.test(text)) {
    text += ".";
  }

  return bulletMatch ? `• ${text}` : text;
}

function improveSectionText(original: string): string {
  return normalizeWhitespace(
    original
      .split(/\r?\n/)
      .map((line) => strengthenLine(line))
      .filter(Boolean)
      .join("\n")
  );
}

function improveSkillsText(original: string): string {
  const lines = normalizeWhitespace(original).split("\n");

  return lines
    .map((line) => {
      const colonIndex = line.indexOf(":");

      const prefix =
        colonIndex >= 0
          ? line.slice(0, colonIndex + 1).trim()
          : "";

      const content =
        colonIndex >= 0 ? line.slice(colonIndex + 1) : line;

      const items = content
        .split(/[,;|•]+/)
        .map((item) => item.trim())
        .filter(Boolean);

      if (items.length <= 1) {
        return line.trim();
      }

      const seen = new Set<string>();

      const uniqueItems = items.filter((item) => {
        const key = item.toLowerCase();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });

      const cleaned = uniqueItems.join(", ");

      return prefix ? `${prefix} ${cleaned}` : cleaned;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function improveSummaryText(original: string): string {
  let text = normalizeWhitespace(original)
    .replace(/\bI am a highly motivated\b/gi, "Highly motivated")
    .replace(/\bI am an experienced\b/gi, "Experienced")
    .replace(/\bI am a\b/gi, "")
    .replace(/\bI am an\b/gi, "")
    .replace(/\bmy objective is to\b/gi, "Seeking to")
    .replace(/\s+/g, " ")
    .trim();

  if (text) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

function createEvidenceBasedSummary(parsedCV: ParsedCV): string {
  const skills = getCVSection(parsedCV, "skills")
    .replace(/\r?\n/g, ", ")
    .split(/[,;|•]+/)
    .map((item) =>
      item.replace(/^[^:]{1,30}:\s*/, "").trim()
    )
    .filter(Boolean)
    .slice(0, 5);

  const experience = getCVSection(parsedCV, "experience");
  const projects = getCVSection(parsedCV, "projects");

  const evidence = normalizeWhitespace(experience || projects)
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•▪◦‣]|\d+[.)])\s*/, "")
        .trim()
    )
    .filter((line) => line.length >= 20 && line.length <= 180)
    .slice(0, 1);

  const parts: string[] = [];

  if (evidence[0]) {
    parts.push(strengthenLine(evidence[0]));
  }

  if (skills.length > 0) {
    parts.push(`Skills include ${skills.join(", ")}.`);
  }

  return parts.join(" ").trim();
}

function createLocalFix(
  request: FixRequest,
  context: SectionContext,
  parsedCV: ParsedCV
): string {
  if (request.fixMode === "user_confirmation") {
    throw new Error(
      "This fix requires the customer-confirmed information to be integrated carefully. AI generation is temporarily unavailable, so CVCommit will not guess or create a risky replacement."
    );
  }

  const original = context.usedFullCV
    ? getCVSection(parsedCV, context.sectionKey).trim()
    : context.sectionContent.trim();

  if (context.sectionKey === "summary") {
    const improved = original
      ? improveSummaryText(original)
      : createEvidenceBasedSummary(parsedCV);

    if (!improved) {
      throw new Error(
        "CVCommit does not have enough supported CV evidence to create this summary safely."
      );
    }

    return improved;
  }

  if (context.sectionKey === "skills") {
    if (!original) {
      throw new Error(
        "CVCommit cannot safely create a skills section because no supported skills content was found."
      );
    }

    return improveSkillsText(original);
  }

  if (
    context.sectionKey === "experience" ||
    context.sectionKey === "projects" ||
    context.sectionKey === "education" ||
    context.sectionKey === "certifications" ||
    context.sectionKey === "leadership" ||
    context.sectionKey === "awards" ||
    context.sectionKey === "volunteering" ||
    context.sectionKey === "references" ||
    context.sectionKey === "header"
  ) {
    if (!original) {
      throw new Error(
        `CVCommit cannot safely create the ${request.section} section because the CV does not contain enough supported content.`
      );
    }

    return improveSectionText(original);
  }

  if (!original) {
    throw new Error(
      "CVCommit does not have enough supported content to generate this fix safely."
    );
  }

  return improveSectionText(original);
}

async function generateGeminiFix(
  prompt: string
): Promise<string> {
  if (!gemini) {
    throw new Error("Gemini is not configured.");
  }

  // Retry temporary provider outages; do not retry authentication or bad requests.
  let response: Awaited<ReturnType<typeof gemini.models.generateContent>> | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { temperature: 0.2 },
      });
      break;
    } catch (error) {
      const status = Number((error as { status?: number; code?: number }).status ??
        (error as { code?: number }).code);
      if (![429, 500, 502, 503, 504].includes(status) || attempt === 2) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  if (!response) throw new Error("Gemini fix did not return a response.");

  const generatedText =
    typeof response.text === "string"
      ? response.text.trim()
      : "";

  if (!generatedText) {
    throw new Error(
      "Gemini returned an empty CV improvement."
    );
  }

  const cleanedText = cleanGeneratedText(generatedText);

  if (!cleanedText) {
    throw new Error(
      "Gemini returned unusable CV improvement content."
    );
  }

  return cleanedText;
}

function getOpenRouterErrorMessage(
  data: OpenRouterResponse,
  status: number
): string {
  return (
    data.error?.message ||
    `OpenRouter request failed with status ${status}.`
  );
}

async function generateOpenRouterFix(prompt: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter is not configured.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "CVCommit",
      },

      body: JSON.stringify({
        model: OPENROUTER_MODEL,

        messages: [
          {
            role: "system",
            content:
              "You are CVCommit's CV rewriting engine. Fix only the supplied traceable issue. Produce polished, truthful, ATS-friendly CV content using only the CV evidence and any explicit customer-confirmed information supplied. Never invent facts, metrics, employers, dates, qualifications, skills, achievements, or personal information. Return only final CV-ready section text.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.2,
        max_tokens: 1800,
      }),

      signal: controller.signal,
    });

    const responseText = await response.text();

    let data: OpenRouterResponse = {};

    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText) as OpenRouterResponse;
      } catch {
        throw new Error("OpenRouter returned an invalid response.");
      }
    }

    if (!response.ok) {
      throw new Error(
        getOpenRouterErrorMessage(data, response.status)
      );
    }

    const generatedText = data.choices?.[0]?.message?.content;

    if (
      typeof generatedText !== "string" ||
      !generatedText.trim()
    ) {
      throw new Error(
        "OpenRouter returned an empty CV improvement."
      );
    }

    const cleanedText = cleanGeneratedText(generatedText);

    if (!cleanedText) {
      throw new Error(
        "OpenRouter returned unusable CV improvement content."
      );
    }

    return cleanedText;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  let normalizedRequest: FixRequest | null = null;
  let sectionContext: SectionContext | null = null;
  let parsedCVForFallback: ParsedCV | null = null;

  try {
    const contentType =
      request.headers.get("content-type") || "";

    if (
      !contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "CVCommit expected a JSON request.",
        },
        { status: 415 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        { status: 400 }
      );
    }

    normalizedRequest = normalizeRequest(body);

    if (!normalizedRequest) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid or incomplete traceable CV improvement request.",
        },
        { status: 400 }
      );
    }

    const {
      cvHash,
      extractedText,
      issueId,
      sectionKey,
      fixMode,
      userConfirmation,
    } = normalizedRequest;

    const access = await getCareerOSCVAccess(cvHash);

    if (!access.authenticated) {
      return NextResponse.json(
        {
          success: false,
          error: "Sign in to use Fix My CV.",
        },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }



    if (extractedText.length < 50) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The current CV does not contain enough readable text.",
        },
        { status: 422 }
      );
    }

    if (fixMode === "user_confirmation" && !userConfirmation) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This issue requires your confirmation before CVCommit can generate a fix.",
        },
        { status: 400 }
      );
    }

    const parsedCV = parseCVSections(extractedText);
    parsedCVForFallback = parsedCV;

    if (parsedCV.sections.length === 0 && !parsedCV.rawText) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CVCommit could not identify readable CV content.",
        },
        { status: 422 }
      );
    }

    sectionContext = getSectionContext(parsedCV, sectionKey);

    if (!sectionContext) {
      return NextResponse.json(
        {
          success: false,
          error:
            `CVCommit cannot safely apply ${issueId} because the affected section "${sectionKey}" is not supported by the current CV section parser.`,
        },
        { status: 422 }
      );
    }

    console.log("CVCommit Fix: Traceable issue received.", {
      issueId,
      category: normalizedRequest.category,
      requestedSection: sectionKey,
      matchedSection: sectionContext.sectionKey,
      evidenceKind: normalizedRequest.evidenceKind,
      severity: normalizedRequest.severity,
      fixMode,
      hasUserConfirmation: Boolean(userConfirmation),
      usingFullCV: sectionContext.usedFullCV,
      originalCharacters: extractedText.length,
      contextCharacters: sectionContext.sectionContent.length,
      parsedSections: parsedCV.sections.map((item) => item.key),
      geminiConfigured: Boolean(gemini),
      geminiModel: GEMINI_MODEL,
      openRouterConfigured: Boolean(OPENROUTER_API_KEY),
      openRouterModel: OPENROUTER_MODEL,
    });

    const quota =
      await consumeCVQuota(
        access,
        "fix"
      );

    if (!quota.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            CV_LIMIT_MESSAGE,
        },
        {
          status: 429,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const prompt = buildPrompt({
      request: normalizedRequest,
      context: sectionContext,
    });

    /*
     * ---------------------------------------------------------
     * PRIMARY PROVIDER: GEMINI
     * ---------------------------------------------------------
     */
    if (gemini) {
      try {
        const improvedContent =
          await generateGeminiFix(prompt);

        console.log(
          "CVCommit Fix: Gemini issue fix completed.",
          {
            issueId,
            sectionKey: sectionContext.sectionKey,
            fixMode,
            usedFullCV: sectionContext.usedFullCV,
            inputCharacters:
              sectionContext.sectionContent.length,
            outputCharacters:
              improvedContent.length,
            model: GEMINI_MODEL,
          }
        );

        await recordAIUsage({ userId: access.userId, task: "fix", provider: "gemini", model: GEMINI_MODEL, status: "success", promptCharacters: prompt.length, responseCharacters: improvedContent.length });
        return NextResponse.json({
          success: true,
          source: "gemini",
          issueId,
          fixMode,
          sectionKey: sectionContext.sectionKey,
          improvedContent,
        });
      } catch (geminiError) {
        await recordAIUsage({ userId: access.userId, task: "fix", provider: "gemini", model: GEMINI_MODEL, status: "failure" });
        console.warn(
          "CVCommit Fix: Gemini unavailable. Trying OpenRouter fallback.",
          geminiError
        );
      }
    } else {
      console.warn(
        "CVCommit Fix: Gemini is not configured. Trying OpenRouter fallback."
      );
    }

    /*
     * ---------------------------------------------------------
     * AI FALLBACK: OPENROUTER
     * ---------------------------------------------------------
     */
    if (OPENROUTER_API_KEY) {
      try {
        const improvedContent =
          await generateOpenRouterFix(prompt);

        console.log(
          "CVCommit Fix: OpenRouter fallback completed.",
          {
            issueId,
            sectionKey: sectionContext.sectionKey,
            fixMode,
            usedFullCV: sectionContext.usedFullCV,
            inputCharacters:
              sectionContext.sectionContent.length,
            outputCharacters:
              improvedContent.length,
            model: OPENROUTER_MODEL,
          }
        );

        await recordAIUsage({ userId: access.userId, task: "fix", provider: "openrouter", model: OPENROUTER_MODEL, status: "success", promptCharacters: prompt.length, responseCharacters: improvedContent.length });
        return NextResponse.json({
          success: true,
          source: "openrouter",
          issueId,
          fixMode,
          sectionKey: sectionContext.sectionKey,
          improvedContent,
        });
      } catch (openRouterError) {
        await recordAIUsage({ userId: access.userId, task: "fix", provider: "openrouter", model: OPENROUTER_MODEL, status: "failure" });
        console.warn(
          "CVCommit Fix: OpenRouter fallback unavailable. Trying safe local fallback.",
          openRouterError
        );
      }
    } else {
      console.warn(
        "CVCommit Fix: OpenRouter is not configured. Trying safe local fallback."
      );
    }

    // Optional self-hosted rewrite; retain the existing output cleanup.
    if (isSelfHostedConfigured()) {
      try {
        const generated = await generateSelfHosted(prompt, "fix");
        const improvedContent = cleanGeneratedText(generated);
        if (!improvedContent) throw new Error("Self-hosted AI returned unusable content.");
        await recordAIUsage({ userId: access.userId, task: "fix", provider: "self-hosted", model: process.env.SELF_HOSTED_AI_MODEL || "self-hosted", status: "success", promptCharacters: prompt.length, responseCharacters: improvedContent.length });
        return NextResponse.json({
          success: true, source: "self-hosted", issueId, fixMode,
          sectionKey: sectionContext.sectionKey, improvedContent,
        });
      } catch (error) {
        console.warn("CVCommit Fix: Self-hosted model unavailable. Using safe local fallback.", error);
      }
    }

    /*
     * ---------------------------------------------------------
     * FINAL FALLBACK: LOCAL DETERMINISTIC REWRITE
     * ---------------------------------------------------------
     */
    const improvedContent = createLocalFix(
      normalizedRequest,
      sectionContext,
      parsedCV
    );

    console.warn(
      "CVCommit Fix: Safe local fallback completed.",
      {
        issueId,
        sectionKey: sectionContext.sectionKey,
        fixMode,
      }
    );

    await recordAIUsage({ userId: access.userId, task: "fix", provider: "local", model: "deterministic", status: "success" });
    return NextResponse.json({
      success: true,
      source: "fallback",
      issueId,
      fixMode,
      sectionKey: sectionContext.sectionKey,
      improvedContent,
    });
  } catch (error: unknown) {
    console.error("CVCommit Fix: generation failed.", error);

    if (
      normalizedRequest &&
      sectionContext &&
      normalizedRequest.fixMode !== "user_confirmation"
    ) {
      try {
        const fallbackParsedCV =
          parsedCVForFallback ??
          parseCVSections(normalizedRequest.extractedText);

        const fallbackContent = createLocalFix(
          normalizedRequest,
          sectionContext,
          fallbackParsedCV
        );

        console.warn(
          "CVCommit Fix: AI providers unavailable. Safe local fallback completed.",
          {
            issueId: normalizedRequest.issueId,
            sectionKey: sectionContext.sectionKey,
          }
        );

        return NextResponse.json({
          success: true,
          source: "fallback",
          issueId: normalizedRequest.issueId,
          fixMode: normalizedRequest.fixMode,
          sectionKey: sectionContext.sectionKey,
          improvedContent: fallbackContent,
        });
      } catch (fallbackError) {
        console.error(
          "CVCommit Fix: local fallback also failed.",
          fallbackError
        );
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong while improving your CV.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "CVCommit Fix API only accepts POST requests.",
    },
    {
      status: 405,
      headers: { Allow: "POST" },
    }
  );
}