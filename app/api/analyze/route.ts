import { recordAIUsage } from "@/lib/ai/usage";
import { generateSelfHosted, isSelfHostedConfigured } from "@/lib/ai/self-hosted";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  createFallbackAnalysis,
  type AnalysisIssue,
  type AnalysisIssueEvidenceKind,
  type AnalysisIssueFixMode,
  type AnalysisIssueSeverity,
  type FallbackAnalysis,
} from "@/lib/analysis/fallback-analysis";

import { getCareerOSServerAccess } from "@/lib/access/server-access";
import {
  ANALYSIS_LIMIT_MESSAGE,
  consumeAnalysisQuota,
} from "@/lib/access/analysis-quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const apiKey = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

const ai = apiKey
  ? new GoogleGenAI({ apiKey })
  : null;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ||
  "openrouter/free";

const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

const SCORE_LIMITS = {
  contentExperience: 25,
  skillsRelevance: 20,
  professionalPositioning: 20,
  atsReadiness: 15,
  education: 10,
  cvStructure: 10,
} as const;

const ISSUE_SECTION_KEYS =
  new Set<AnalysisIssue["sectionKey"]>([
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

const ISSUE_EVIDENCE_KINDS =
  new Set<AnalysisIssueEvidenceKind>([
    "cv_text",
    "absence",
    "pattern",
  ]);

const ISSUE_FIX_MODES =
  new Set<AnalysisIssueFixMode>([
    "rewrite",
    "user_confirmation",
    "structural",
  ]);

const ISSUE_SEVERITIES =
  new Set<AnalysisIssueSeverity>([
    "high",
    "medium",
    "low",
  ]);

type ScoreBreakdown =
  FallbackAnalysis["scoreBreakdown"];

type TraceableAnalysis =
  Omit<
    FallbackAnalysis,
    "issues"
  > & {
    issues: AnalysisIssue[];
  };

type RawObject =
  Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeScore(
  value: unknown,
  max: number
): number {
  const score =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.round(
    Math.max(0, Math.min(max, score))
  );
}

function stringArray(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string"
    )
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean);
}

function stringValue(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function calculateOverallScore(
  breakdown: ScoreBreakdown
): number {
  return (
    breakdown.contentExperience +
    breakdown.skillsRelevance +
    breakdown.professionalPositioning +
    breakdown.atsReadiness +
    breakdown.education +
    breakdown.cvStructure
  );
}

function normalizeScoreBreakdown(
  value: unknown
): ScoreBreakdown | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const breakdown =
    value as RawObject;

  return {
    contentExperience:
      normalizeScore(
        breakdown.contentExperience,
        SCORE_LIMITS.contentExperience
      ),

    skillsRelevance:
      normalizeScore(
        breakdown.skillsRelevance,
        SCORE_LIMITS.skillsRelevance
      ),

    professionalPositioning:
      normalizeScore(
        breakdown.professionalPositioning,
        SCORE_LIMITS.professionalPositioning
      ),

    atsReadiness:
      normalizeScore(
        breakdown.atsReadiness,
        SCORE_LIMITS.atsReadiness
      ),

    education:
      normalizeScore(
        breakdown.education,
        SCORE_LIMITS.education
      ),

    cvStructure:
      normalizeScore(
        breakdown.cvStructure,
        SCORE_LIMITS.cvStructure
      ),
  };
}

function cleanJsonResponse(
  value: string
): string {
  let text =
    value.trim();

  text =
    text.replace(
      /^```(?:json|javascript|typescript)?\s*/i,
      ""
    );

  text =
    text.replace(
      /\s*```$/i,
      ""
    );

  text =
    text.trim();

  const firstBrace =
    text.indexOf("{");

  const lastBrace =
    text.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    text =
      text.slice(
        firstBrace,
        lastBrace + 1
      );
  }

  return text.trim();
}

function normalizeEvidenceText(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isCVTextEvidenceSupported(
  evidence: string,
  extractedText: string
): boolean {
  const normalizedEvidence =
    normalizeEvidenceText(
      evidence
    );

  const normalizedCV =
    normalizeEvidenceText(
      extractedText
    );

  if (
    !normalizedEvidence ||
    !normalizedCV
  ) {
    return false;
  }

  return normalizedCV.includes(
    normalizedEvidence
  );
}

function normalizeIssueSectionKey(
  value: unknown
): AnalysisIssue["sectionKey"] | null {
  const key =
    stringValue(value)
      .toLowerCase() as
      AnalysisIssue["sectionKey"];

  return ISSUE_SECTION_KEYS.has(key)
    ? key
    : null;
}

function normalizeIssueEvidenceKind(
  value: unknown
): AnalysisIssueEvidenceKind | null {
  const kind =
    stringValue(value)
      .toLowerCase() as
      AnalysisIssueEvidenceKind;

  return ISSUE_EVIDENCE_KINDS.has(kind)
    ? kind
    : null;
}

function normalizeIssueFixMode(
  value: unknown
): AnalysisIssueFixMode | null {
  const mode =
    stringValue(value)
      .toLowerCase() as
      AnalysisIssueFixMode;

  return ISSUE_FIX_MODES.has(mode)
    ? mode
    : null;
}

function normalizeIssueSeverity(
  value: unknown
): AnalysisIssueSeverity {
  const severity =
    stringValue(value)
      .toLowerCase() as
      AnalysisIssueSeverity;

  return ISSUE_SEVERITIES.has(
    severity
  )
    ? severity
    : "medium";
}

function normalizeIssues(
  value: unknown,
  extractedText: string
): AnalysisIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const issues:
    AnalysisIssue[] = [];

  const seenIds =
    new Set<string>();

  const seenProblems =
    new Set<string>();

  for (
    const item of value
  ) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const raw =
      item as RawObject;

    const sectionKey =
      normalizeIssueSectionKey(
        raw.sectionKey
      );

    const evidenceKind =
      normalizeIssueEvidenceKind(
        raw.evidenceKind
      );

    const fixMode =
      normalizeIssueFixMode(
        raw.fixMode
      );

    const title =
      stringValue(
        raw.title
      );

    const problem =
      stringValue(
        raw.problem
      );

    const evidence =
      stringValue(
        raw.evidence
      );

    const recommendation =
      stringValue(
        raw.recommendation
      );

    if (
      !sectionKey ||
      !evidenceKind ||
      !fixMode ||
      !title ||
      !problem ||
      !evidence ||
      !recommendation
    ) {
      continue;
    }

    if (
      evidenceKind ===
        "cv_text" &&
      !isCVTextEvidenceSupported(
        evidence,
        extractedText
      )
    ) {
      console.warn(
        "CVCommit: Discarded AI issue because its quoted evidence was not found in the CV.",
        {
          title,
          evidence:
            evidence.slice(
              0,
              180
            ),
        }
      );

      continue;
    }

    const problemKey =
      `${sectionKey}:${problem
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()}`;

    if (
      seenProblems.has(
        problemKey
      )
    ) {
      continue;
    }

    const requestedId =
      stringValue(raw.id);

    let id =
      /^issue_\d{3}$/i.test(
        requestedId
      )
        ? requestedId.toLowerCase()
        : `issue_${String(
            issues.length + 1
          ).padStart(3, "0")}`;

    if (seenIds.has(id)) {
      id =
        `issue_${String(
          issues.length + 1
        ).padStart(3, "0")}`;
    }

    seenIds.add(id);
    seenProblems.add(
      problemKey
    );

    issues.push({
      id,
      sectionKey,

      category:
        stringValue(
          raw.category
        ) || "content",

      title,
      problem,
      evidence,
      evidenceKind,
      recommendation,

      severity:
        normalizeIssueSeverity(
          raw.severity
        ),

      fixMode,
    });

    if (
      issues.length >= 7
    ) {
      break;
    }
  }

  return issues;
}

function validateAnalysis(
  analysis: TraceableAnalysis
): boolean {
  return (
    Boolean(
      analysis.summary
    ) &&
    analysis.strengths.length >
      0 &&
    analysis.weaknesses.length >
      0 &&
    analysis.improvements.length >
      0 &&
    analysis.recommendedRoles.length >
      0 &&
    Boolean(
      analysis.experienceAssessment
    ) &&
    Boolean(
      analysis.educationAssessment
    ) &&
    Boolean(
      analysis.atsAssessment
    ) &&
    analysis.issues.length >
      0
  );
}

function normalizeAIAnalysis(
  value: unknown,
  extractedText: string
): TraceableAnalysis {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "AI provider returned an invalid analysis object."
    );
  }

  const raw =
    value as RawObject;

  const scoreBreakdown =
    normalizeScoreBreakdown(
      raw.scoreBreakdown
    );

  if (!scoreBreakdown) {
    throw new Error(
      "AI provider returned an invalid score breakdown."
    );
  }

  const issues =
    normalizeIssues(
      raw.issues,
      extractedText
    );

  const analysis:
    TraceableAnalysis = {
    overallScore:
      calculateOverallScore(
        scoreBreakdown
      ),

    scoreBreakdown,

    summary:
      stringValue(
        raw.summary
      ),

    strengths:
      stringArray(
        raw.strengths
      ).slice(
        0,
        5
      ),

    weaknesses:
      stringArray(
        raw.weaknesses
      ).slice(
        0,
        5
      ),

    skills:
      stringArray(
        raw.skills
      ),

    recommendedSkills:
      stringArray(
        raw.recommendedSkills
      ).slice(
        0,
        8
      ),

    experienceAssessment:
      stringValue(
        raw.experienceAssessment
      ),

    educationAssessment:
      stringValue(
        raw.educationAssessment
      ),

    atsAssessment:
      stringValue(
        raw.atsAssessment
      ),

    improvements:
      stringArray(
        raw.improvements
      ).slice(
        0,
        7
      ),

    recommendedRoles:
      stringArray(
        raw.recommendedRoles
      ).slice(
        0,
        5
      ),

    issues,
  };

  if (
    !validateAnalysis(
      analysis
    )
  ) {
    throw new Error(
      "AI provider returned an incomplete or untraceable CV analysis."
    );
  }

  return analysis;
}

/* -------------------------------------------------------------------------- */
/* Gemini                                                                     */
/* -------------------------------------------------------------------------- */

async function generateGeminiAnalysis(
  prompt: string
) {
  if (!ai) {
    throw new Error(
      "Gemini is not configured."
    );
  }

  const maxAttempts =
    3;

  const retryDelays = [
    1500,
    3000,
  ];

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      console.log(
        `CVCommit: Gemini attempt ${attempt}/${maxAttempts}`
      );

      return await ai.models.generateContent({
        model:
          GEMINI_MODEL,

        contents:
          prompt,

        config: {
          responseMimeType:
            "application/json",

          temperature:
            0.2,
        },
      });
    } catch (
      error: unknown
    ) {
      const typedError =
        error as {
          status?:
            number | string;
          code?:
            number | string;
          error?: {
            status?:
              number | string;
          };
          message?: string;
        };

      const status =
        typedError.status ??
        typedError.code ??
        typedError.error
          ?.status;

      const numericStatus =
        Number(status);

      const retryable =
        numericStatus ===
          429 ||
        numericStatus ===
          500 ||
        numericStatus ===
          502 ||
        numericStatus ===
          503 ||
        numericStatus ===
          504;

      console.error(
        "CVCommit: Gemini request failed.",
        {
          attempt,
          status,
          retryable,
          message:
            typedError.message,
        }
      );

      if (
        !retryable ||
        attempt ===
          maxAttempts
      ) {
        throw error;
      }

      const delay =
        retryDelays[
          attempt - 1
        ] ?? 3000;

      await new Promise<void>(
        (resolve) => {
          setTimeout(
            resolve,
            delay
          );
        }
      );
    }
  }

  throw new Error(
    "Gemini analysis failed after retries."
  );
}


type OpenRouterAnalysisResponse = {
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

async function generateOpenRouterAnalysis(
  prompt: string
): Promise<string> {
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
              "You are CVCommit's CV analysis fallback engine. Analyze only the supplied CV evidence. Return valid JSON matching the requested schema. Never invent facts, dates, skills, achievements, employers, qualifications, metrics, or evidence.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let data: OpenRouterAnalysisResponse = {};

    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText) as OpenRouterAnalysisResponse;
      } catch {
        throw new Error("OpenRouter returned an invalid response.");
      }
    }

    if (!response.ok) {
      throw new Error(
        data.error?.message ||
          `OpenRouter request failed with status ${response.status}.`
      );
    }

    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("OpenRouter returned an empty analysis.");
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function parseAndNormalizeAnalysis(
  responseText: string,
  extractedText: string,
  providerName: string
): TraceableAnalysis {
  const cleanedResponse = cleanJsonResponse(responseText);

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleanedResponse);
  } catch (parseError) {
    console.error(`CVCommit: ${providerName} returned invalid JSON.`, {
      error: parseError,
      response: cleanedResponse.slice(0, 3000),
    });

    throw new Error(`${providerName} returned invalid JSON.`);
  }

  return normalizeAIAnalysis(parsed, extractedText);
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

function buildPrompt(
  extractedText: string
): string {
  return `
You are CVCommit, an AI career advisor focused on helping students,
graduates, and junior professionals improve their CVs and career positioning.

Analyze the CV below using the CVCommit scoring framework.

IMPORTANT:

Return ONLY valid JSON.

Do not return:
- Markdown
- Code fences
- Explanations outside the JSON
- overallScore

CVCommit calculates overallScore itself.

SCORING FRAMEWORK

1. Content & Experience — maximum 25 points

Evaluate:
- Quality and relevance of experience
- Responsibilities and achievements
- Measurable results
- Projects and practical work

2. Skills & Relevance — maximum 20 points

Evaluate:
- Technical skills
- Soft skills
- Skills clarity
- Alignment with career direction

3. Professional Positioning — maximum 20 points

Evaluate:
- Professional summary
- Career direction
- Professional identity
- Suitability for realistic roles

4. ATS Readiness — maximum 15 points

Evaluate:
- Section structure
- Standard terminology
- Keywords
- Text readability

5. Education — maximum 10 points

Evaluate:
- Qualification
- Institution
- Dates
- Relevant academic information

6. CV Structure — maximum 10 points

Evaluate:
- Organization
- Clarity
- Consistency
- Completeness
- Ease of scanning

For students and junior professionals, consider:
- Academic projects
- Internships
- SIWES
- Volunteering
- Certifications
- Leadership
- Freelance work
- Practical projects

STRICT ACCURACY RULES

Never invent:
- Jobs
- Companies
- Qualifications
- Skills
- Achievements
- Certifications
- Projects
- Dates
- Responsibilities
- Metrics
- Results
- Personal information

Only use information supported by the CV.

Every item in "issues" must be traceable.

For evidenceKind "cv_text":
- evidence MUST be a short exact excerpt copied from CV TEXT below.
- Do not paraphrase the evidence.
- Do not alter spelling, dates, punctuation, employer names, or numbers in the evidence.
- The evidence excerpt must actually occur in CV TEXT.

For evidenceKind "absence":
- use only when a standard section or required information is genuinely not detected.
- explain what was not found without pretending there was text evidence.

For evidenceKind "pattern":
- use only for an observable document-wide pattern such as weak action language or lack of measurable outcomes.
- explain the exact pattern detected.
- do not claim a contradiction unless the conflicting text is explicitly present.

If an issue requires information the CV does not contain, use:
"fixMode": "user_confirmation"

Never invent the missing fact.

Do not create duplicate issues.

Do not create vague issue titles such as:
- CV Improvement 1
- CV Improvement 2
- General Improvement
- Whole-CV Improvement

Every issue must point to a real CV section.

Allowed sectionKey values:
- header
- summary
- skills
- experience
- education
- certifications
- projects
- languages
- leadership
- awards
- volunteering
- references

Allowed severity values:
- high
- medium
- low

Allowed evidenceKind values:
- cv_text
- absence
- pattern

Allowed fixMode values:
- rewrite
- user_confirmation
- structural

Return exactly this structure:

{
  "scoreBreakdown": {
    "contentExperience": 0,
    "skillsRelevance": 0,
    "professionalPositioning": 0,
    "atsReadiness": 0,
    "education": 0,
    "cvStructure": 0
  },
  "summary": "",
  "strengths": [],
  "weaknesses": [],
  "skills": [],
  "recommendedSkills": [],
  "experienceAssessment": "",
  "educationAssessment": "",
  "atsAssessment": "",
  "improvements": [],
  "recommendedRoles": [],
  "issues": [
    {
      "id": "issue_001",
      "sectionKey": "experience",
      "category": "timeline",
      "title": "Experience Timeline",
      "problem": "",
      "evidence": "",
      "evidenceKind": "cv_text",
      "recommendation": "",
      "severity": "high",
      "fixMode": "user_confirmation"
    }
  ]
}

FIELD REQUIREMENTS

summary:
- Concise
- CV-specific
- Professionally useful

strengths:
- 3 to 5 specific strengths
- Evidence-based
- Based only on the CV

weaknesses:
- 3 to 5 specific weaknesses
- Avoid generic statements
- Keep them consistent with the issues array

skills:
- Only skills explicitly supported by the CV

recommendedSkills:
- Skills that would strengthen the profile
- Do not claim the candidate already possesses them

experienceAssessment:
- Evaluate experience and project evidence
- Be fair to students and junior candidates

educationAssessment:
- Evaluate qualification, institution, dates and academic evidence

atsAssessment:
- Evaluate ATS readiness from the extracted text

improvements:
- 3 to 7 practical actions
- Specific to this CV
- Keep them consistent with the issues array
- Do not introduce problems that do not appear in issues

recommendedRoles:
- 3 to 5 realistic roles
- Based on evidence in the CV
- Prefer entry-level and junior roles when appropriate

issues:
- Return between 1 and 7 issues, but only issues you can genuinely support
- Each issue must represent a real problem, discrepancy, weakness, or improvement opportunity in this CV
- Use stable IDs in order: issue_001, issue_002, issue_003, and so on
- sectionKey must be the actual affected section
- category should be concise, for example timeline, achievements, clarity, skills, keywords, project-impact, consistency
- title must be descriptive and customer-facing
- problem must clearly state what is wrong
- evidence must explain exactly why the issue exists
- recommendation must describe the correction or improvement
- severity must match the practical importance of the issue
- fixMode "rewrite" means CVCommit can safely rewrite existing supported content
- fixMode "user_confirmation" means CVCommit must ask the customer before changing an unknown fact
- fixMode "structural" means CVCommit can reorganize supported content without inventing facts
- Never use sectionKey "other"
- Never create a whole-CV issue
- Never duplicate the same underlying issue

TRACEABILITY CONTRACT

The issues array is the source of truth for CVCommit Fix.

The Fix page must eventually use:
issue.id
issue.sectionKey
issue.title
issue.problem
issue.evidence
issue.recommendation
issue.fixMode

It must not guess the issue again from improvements text.

CV TEXT:

${extractedText}
`;
}

/* -------------------------------------------------------------------------- */
/* Fallback                                                                   */
/* -------------------------------------------------------------------------- */

function getFallbackAnalysis(
  extractedText: string
): FallbackAnalysis {
  return createFallbackAnalysis(
    extractedText
  );
}

/* -------------------------------------------------------------------------- */
/* API POST                                                                   */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: Request
) {
  const access =
    await getCareerOSServerAccess();

  if (
    !access.authenticated
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          "Sign in to analyze a CV.",
      },
      {
        status: 401,
      }
    );
  }

  // Daily limit per account (each analysis costs AI credits)
  const analysisQuota = await consumeAnalysisQuota(access.userId, access.plan === "pro");

  if (!analysisQuota.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: analysisQuota.reason === "limit"
          ? ANALYSIS_LIMIT_MESSAGE
          : "Analysis is temporarily unavailable. Please try again shortly.",
        code: analysisQuota.reason === "limit" ? "DAILY_LIMIT_REACHED" : "QUOTA_UNAVAILABLE",
      },
      {
        status: analysisQuota.reason === "limit" ? 429 : 503,
      }
    );
  }

  let extractedText =
    "";

  try {
    const contentType =
      request.headers.get(
        "content-type"
      ) || "";

    if (
      !contentType
        .toLowerCase()
        .includes(
          "application/json"
        )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "CVCommit expected a JSON analysis request.",
        },
        {
          status: 415,
        }
      );
    }

    let body:
      unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,

          error:
            "Invalid JSON request body.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !body ||
      typeof body !==
        "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Invalid request body.",
        },
        {
          status: 400,
        }
      );
    }

    const requestBody =
      body as RawObject;

    if (
      typeof requestBody
        .extractedText !==
      "string"
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "No CV text was provided.",
        },
        {
          status: 400,
        }
      );
    }

    extractedText =
      requestBody
        .extractedText
        .trim();

    if (
      extractedText.length <
      50
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "The CV does not contain enough readable text to analyze.",
        },
        {
          status: 422,
        }
      );
    }

    console.log(
      "CVCommit: Received CV text.",
      {
        characters:
          extractedText.length,

        geminiConfigured:
          Boolean(ai),

        model:
          GEMINI_MODEL,
      }
    );

    const prompt =
      buildPrompt(
        extractedText
      );

    // Primary provider: Gemini
    if (ai) {
      try {
        const response =
          await generateGeminiAnalysis(
            prompt
          );

        const responseText =
          typeof response.text === "string"
            ? response.text.trim()
            : "";

        if (!responseText) {
          throw new Error(
            "Gemini returned an empty response."
          );
        }

        const analysis =
          parseAndNormalizeAnalysis(
            responseText,
            extractedText,
            "Gemini"
          );

        console.log(
          "CVCommit: Gemini analysis completed.",
          {
            model: GEMINI_MODEL,
            overallScore:
              analysis.overallScore,
            issues:
              analysis.issues.map(
                (issue) => ({
                  id: issue.id,
                  sectionKey:
                    issue.sectionKey,
                  title: issue.title,
                  fixMode:
                    issue.fixMode,
                })
              ),
            scoreBreakdown:
              analysis.scoreBreakdown,
          }
        );

        await recordAIUsage({ userId: access.userId, task: "analysis", provider: "gemini", model: GEMINI_MODEL, status: "success", promptCharacters: prompt.length, responseCharacters: responseText.length });
        return NextResponse.json({
          success: true,
          source: "gemini",
          analysis,
        });
      } catch (geminiError) {
        await recordAIUsage({ userId: access.userId, task: "analysis", provider: "gemini", model: GEMINI_MODEL, status: "failure" });
        console.warn(
          "CVCommit: Gemini failed or returned an untraceable analysis. Trying OpenRouter fallback.",
          geminiError
        );
      }
    } else {
      console.warn(
        "CVCommit: Gemini is not configured. Trying OpenRouter fallback."
      );
    }

    // First fallback: OpenRouter
    if (OPENROUTER_API_KEY) {
      try {
        const responseText =
          await generateOpenRouterAnalysis(
            prompt
          );

        const analysis =
          parseAndNormalizeAnalysis(
            responseText,
            extractedText,
            "OpenRouter"
          );

        console.log(
          "CVCommit: OpenRouter fallback analysis completed.",
          {
            model:
              OPENROUTER_MODEL,
            overallScore:
              analysis.overallScore,
            issues:
              analysis.issues.map(
                (issue) => ({
                  id: issue.id,
                  sectionKey:
                    issue.sectionKey,
                  title: issue.title,
                  fixMode:
                    issue.fixMode,
                })
              ),
            scoreBreakdown:
              analysis.scoreBreakdown,
          }
        );

        await recordAIUsage({ userId: access.userId, task: "analysis", provider: "openrouter", model: OPENROUTER_MODEL, status: "success", promptCharacters: prompt.length, responseCharacters: responseText.length });
        return NextResponse.json({
          success: true,
          source: "openrouter",
          analysis,
        });
      } catch (openRouterError) {
        await recordAIUsage({ userId: access.userId, task: "analysis", provider: "openrouter", model: OPENROUTER_MODEL, status: "failure" });
        console.warn(
          "CVCommit: OpenRouter failed or returned an untraceable analysis. Using local fallback.",
          openRouterError
        );
      }
    } else {
      console.warn(
        "CVCommit: OpenRouter is not configured. Using local fallback."
      );
    }

    // Optional self-hosted inference, using the same validated analysis parser.
    if (isSelfHostedConfigured()) {
      try {
        const responseText = await generateSelfHosted(prompt, "analysis");
        const analysis = parseAndNormalizeAnalysis(responseText, extractedText, "Self-hosted");
        await recordAIUsage({ userId: access.userId, task: "analysis", provider: "self-hosted", model: process.env.SELF_HOSTED_AI_MODEL || "self-hosted", status: "success", promptCharacters: prompt.length, responseCharacters: responseText.length });
        return NextResponse.json({ success: true, source: "self-hosted", analysis });
      } catch (error) {
        console.warn("CVCommit: Self-hosted analysis unavailable. Using local fallback.", error);
      }
    }

    // Final fallback: deterministic local analysis
    const fallback =
      getFallbackAnalysis(
        extractedText
      );

    console.warn(
      "CVCommit: Local traceable fallback analysis completed."
    );

    await recordAIUsage({ userId: access.userId, task: "analysis", provider: "local", model: "deterministic", status: "success" });
    return NextResponse.json({
      success: true,
      source: "fallback",
      analysis: fallback,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "CVCommit: analysis error.",
      error
    );

    if (extractedText) {
      try {
        const fallbackAnalysis =
          getFallbackAnalysis(
            extractedText
          );

        console.warn(
          "CVCommit: Gemini failed or returned untraceable issues. Using traceable fallback analysis."
        );

        return NextResponse.json({
          success: true,
          source:
            "fallback",
          analysis:
            fallbackAnalysis,
        });
      } catch (
        fallbackError
      ) {
        console.error(
          "CVCommit: fallback analysis failed.",
          fallbackError
        );
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong while analyzing your CV.";

    return NextResponse.json(
      {
        success: false,
        error:
          message,
      },
      {
        status: 500,
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* API GET                                                                    */
/* -------------------------------------------------------------------------- */

export async function GET() {
  return NextResponse.json(
    {
      success: false,

      error:
        "CVCommit analysis endpoint only accepts POST requests.",
    },
    {
      status: 405,

      headers: {
        Allow:
          "POST",
      },
    }
  );
}