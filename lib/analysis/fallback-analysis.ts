export type AnalysisIssueSeverity =
  | "high"
  | "medium"
  | "low";

export type AnalysisIssueEvidenceKind =
  | "cv_text"
  | "absence"
  | "pattern";

export type AnalysisIssueFixMode =
  | "rewrite"
  | "user_confirmation"
  | "structural";

export type AnalysisIssueSectionKey =
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

export type AnalysisIssue = {
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

export type FallbackAnalysis = {
  overallScore: number;

  scoreBreakdown: {
    contentExperience: number;
    skillsRelevance: number;
    professionalPositioning: number;
    atsReadiness: number;
    education: number;
    cvStructure: number;
  };

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

type CareerDirection =
  | "civil"
  | "data"
  | "software"
  | "general";

type RoleMatch = {
  role: string;
  score: number;
};

/* =========================================================
   SKILL KEYWORDS
   ========================================================= */

const SKILL_KEYWORDS: Record<string, string[]> = {
  AutoCAD: ["autocad"],
  "Civil 3D": ["civil 3d", "civil3d"],
  Revit: ["revit"],

  "Microsoft Excel": [
    "microsoft excel",
    "excel",
  ],

  "Microsoft Word": [
    "microsoft word",
    "ms word",
  ],

  "Microsoft PowerPoint": [
    "microsoft powerpoint",
    "powerpoint",
  ],

  Python: ["python"],
  JavaScript: ["javascript"],
  TypeScript: ["typescript"],

  React: [
    "react.js",
    "reactjs",
    "react",
  ],

  "Node.js": [
    "node.js",
    "nodejs",
  ],

  SQL: ["sql"],

  "Data Analysis": [
    "data analysis",
    "data analytics",
  ],

  Surveying: [
    "surveying",
    "land surveying",
  ],

  "Structural Design": [
    "structural design",
  ],

  "Project Management": [
    "project management",
  ],

  "Construction Management": [
    "construction management",
  ],

  "Quantity Surveying": [
    "quantity surveying",
    "quantity surveyor",
  ],

  "Site Supervision": [
    "site supervision",
    "site supervisor",
  ],

  "Technical Drawing": [
    "technical drawing",
    "technical drawings",
  ],

  "Engineering Design": [
    "engineering design",
  ],

  "Bill of Quantities": [
    "bill of quantities",
    "boq",
  ],

  "Cost Estimation": [
    "cost estimation",
    "cost estimating",
  ],

  Leadership: [
    "leadership",
    "team lead",
    "team leader",
  ],

  Communication: [
    "communication skills",
    "verbal communication",
    "written communication",
  ],

  Research: [
    "research skills",
    "research",
  ],

  "Problem Solving": [
    "problem solving",
    "problem-solving",
  ],

  Teamwork: [
    "teamwork",
    "team work",
  ],
};

/* =========================================================
   ROLE KEYWORDS
   ========================================================= */

const ROLE_KEYWORDS: Record<string, string[]> = {
  "Graduate Civil Engineer": [
    "civil engineering",
    "civil engineer",
    "b.eng",
    "beng",
    "b.sc civil",
    "bsc civil",
  ],

  "Junior Civil Engineer": [
    "civil engineering",
    "civil engineer",
    "structural",
    "construction",
  ],

  "Site Engineer": [
    "site supervision",
    "site engineer",
    "construction",
    "site work",
  ],

  "Graduate Trainee": [
    "graduate",
    "student",
    "internship",
    "industrial training",
    "siwes",
    "trainee",
    "national diploma",
    "higher national diploma",
    "ond",
    "hnd",
  ],

  "Quantity Surveyor": [
    "quantity surveying",
    "quantity surveyor",
    "bill of quantities",
    "boq",
    "cost estimation",
    "cost estimating",
  ],

  "CAD Technician": [
    "autocad",
    "civil 3d",
    "technical drawing",
    "cad",
    "drafting",
  ],

  "Project Assistant": [
    "project management",
    "project assistant",
    "coordination",
    "project coordination",
  ],

  "Data Analyst": [
    "data analysis",
    "data analytics",
    "data analyst",
    "sql",
    "python",
    "excel",
  ],

  "Software Developer": [
    "javascript",
    "typescript",
    "react",
    "node.js",
    "nodejs",
    "python",
    "software development",
    "programming",
  ],
};

/* =========================================================
   SECTION KEYWORDS
   ========================================================= */

const SECTION_KEYWORDS: Record<string, string[]> = {
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "employment history",
    "work history",
    "internship",
    "industrial training",
    "siwes",
  ],

  education: [
    "education",
    "academic background",
    "university",
    "college",
    "school",
    "bachelor",
    "degree",
    "hnd",
    "ond",
    "master",
    "msc",
    "b.sc",
    "b.eng",
    "beng",
    "higher national diploma",
    "national diploma",
  ],

  projects: [
    "projects",
    "project",
    "academic project",
    "academic projects",
    "final year project",
    "project experience",
  ],

  summary: [
    "professional summary",
    "profile",
    "career objective",
    "career profile",
    "objective",
    "about me",
    "professional profile",
  ],

  certifications: [
    "certification",
    "certifications",
    "certificate",
    "certificates",
    "professional training",
    "training",
  ],

  achievements: [
    "achievement",
    "achievements",
    "award",
    "awards",
    "recognition",
    "scholarship",
    "honor",
    "honours",
  ],

  leadership: [
    "leadership",
    "team leader",
    "team lead",
    "coordinator",
    "president",
    "executive",
    "chairman",
    "chairperson",
  ],

  references: [
    "references",
    "referee",
  ],
};

/* =========================================================
   TEXT HELPERS
   ========================================================= */

function normalizeText(text: string | null | undefined): string {
  return String(text || "")
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function containsKeyword(
  text: string,
  keyword: string
): boolean {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);

  if (
    !normalizedText ||
    !normalizedKeyword
  ) {
    return false;
  }

  /*
   * For keywords containing punctuation such as:
   * React.js
   * Node.js
   * B.Sc
   *
   * use a simpler escaped substring check with
   * safe boundaries.
   */

  const escapedKeyword =
    escapeRegExp(normalizedKeyword);

  const pattern = new RegExp(
    "(^|[^a-z0-9])" +
      escapedKeyword +
      "(?=$|[^a-z0-9])",
    "i"
  );

  return pattern.test(normalizedText);
}

function containsAny(
  text: string,
  keywords: string[]
): boolean {
  for (const keyword of keywords) {
    if (containsKeyword(text, keyword)) {
      return true;
    }
  }

  return false;
}

function countMatches(
  text: string,
  keywords: string[]
): number {
  let count = 0;

  for (const keyword of keywords) {
    if (containsKeyword(text, keyword)) {
      count += 1;
    }
  }

  return count;
}

function detectSection(
  text: string,
  keywords: string[]
): boolean {
  return containsAny(text, keywords);
}

function uniqueItems(
  items: string[]
): string[] {
  const result: string[] = [];

  for (const item of items) {
    if (result.indexOf(item) === -1) {
      result.push(item);
    }
  }

  return result;
}

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(
    min,
    Math.min(max, Math.round(value))
  );
}

function hasSkill(
  skills: string[],
  skill: string
): boolean {
  return skills.indexOf(skill) !== -1;
}

function hasAnySkill(
  skills: string[],
  requiredSkills: string[]
): boolean {
  for (const skill of requiredSkills) {
    if (hasSkill(skills, skill)) {
      return true;
    }
  }

  return false;
}

/* =========================================================
   SKILL DETECTION
   ========================================================= */

function detectSkills(
  text: string
): string[] {
  const skills: string[] = [];

  const skillEntries =
    Object.keys(SKILL_KEYWORDS);

  for (const skill of skillEntries) {
    const keywords =
      SKILL_KEYWORDS[skill];

    if (containsAny(text, keywords)) {
      skills.push(skill);
    }
  }

  return skills;
}

/* =========================================================
   ROLE DETECTION
   ========================================================= */

function detectRoles(
  text: string,
  skills: string[]
): string[] {
  const matches: RoleMatch[] = [];

  const roles =
    Object.keys(ROLE_KEYWORDS);

  for (const role of roles) {
    const keywords =
      ROLE_KEYWORDS[role];

    let score = countMatches(
      text,
      keywords
    );

    if (
      role === "CAD Technician" &&
      hasAnySkill(skills, [
        "AutoCAD",
        "Civil 3D",
        "Technical Drawing",
      ])
    ) {
      score += 2;
    }

    if (
      role === "Quantity Surveyor" &&
      hasAnySkill(skills, [
        "Quantity Surveying",
        "Bill of Quantities",
        "Cost Estimation",
      ])
    ) {
      score += 2;
    }

    if (
      role === "Site Engineer" &&
      hasAnySkill(skills, [
        "Site Supervision",
        "Construction Management",
      ])
    ) {
      score += 2;
    }

    if (
      role === "Data Analyst" &&
      hasAnySkill(skills, [
        "Data Analysis",
        "SQL",
        "Python",
        "Microsoft Excel",
      ])
    ) {
      score += 2;
    }

    if (
      role === "Software Developer" &&
      hasAnySkill(skills, [
        "JavaScript",
        "TypeScript",
        "React",
        "Node.js",
        "Python",
      ])
    ) {
      score += 2;
    }

    if (score > 0) {
      matches.push({
        role,
        score,
      });
    }
  }

  matches.sort(
    (
      a: RoleMatch,
      b: RoleMatch
    ): number => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.role.localeCompare(
        b.role
      );
    }
  );

  const result: string[] = [];

  for (
    let i = 0;
    i < matches.length && i < 5;
    i += 1
  ) {
    result.push(matches[i].role);
  }

  return result;
}

/* =========================================================
   EVIDENCE DETECTION
   ========================================================= */

function hasMetricEvidence(
  text: string
): boolean {
  const pattern =
    /\b\d+(?:\.\d+)?\s*(%|percent|years?|months?|days?|hours?|km|m2|m²|m3|m³|naira|ngn|million|thousand|projects?|clients?|people|staff|members?)\b/i;

  return pattern.test(text);
}

function hasDateEvidence(
  text: string
): boolean {
  const yearPattern =
    /\b(?:19|20)\d{2}\b/;

  const monthPattern =
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

  return (
    yearPattern.test(text) ||
    monthPattern.test(text)
  );
}

function detectActionLanguage(
  text: string
): boolean {
  return containsAny(text, [
    "developed",
    "designed",
    "managed",
    "created",
    "built",
    "analyzed",
    "implemented",
    "coordinated",
    "supervised",
    "prepared",
    "calculated",
    "assisted",
    "conducted",
    "measured",
    "improved",
    "led",
    "organized",
    "produced",
    "drafted",
    "inspected",
    "monitored",
  ]);
}

function detectContactInformation(
  text: string
): boolean {
  const hasEmail =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
      text
    );

  const hasPhone =
    /(?:\+234|234|0)\s*\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/i.test(
      text
    );

  const hasLinkedIn =
    containsKeyword(
      text,
      "linkedin"
    );

  return (
    hasEmail ||
    hasPhone ||
    hasLinkedIn
  );
}

/* =========================================================
   CAREER DIRECTION
   ========================================================= */

function getCareerDirection(
  text: string,
  skills: string[]
): CareerDirection {
  let civilScore = 0;
  let dataScore = 0;
  let softwareScore = 0;

  civilScore += countMatches(text, [
    "civil engineering",
    "civil engineer",
    "construction",
    "structural",
    "surveying",
    "autocad",
    "civil 3d",
    "site engineer",
  ]);

  civilScore += skills.filter(
    (skill: string) =>
      [
        "AutoCAD",
        "Civil 3D",
        "Surveying",
        "Structural Design",
        "Construction Management",
        "Site Supervision",
        "Technical Drawing",
      ].indexOf(skill) !== -1
  ).length;

  dataScore += countMatches(text, [
    "data analysis",
    "data analytics",
    "data analyst",
    "sql",
    "excel",
    "statistics",
    "dashboard",
  ]);

  dataScore += skills.filter(
    (skill: string) =>
      [
        "Data Analysis",
        "Microsoft Excel",
        "SQL",
        "Python",
      ].indexOf(skill) !== -1
  ).length;

  softwareScore += countMatches(text, [
    "software development",
    "software developer",
    "programming",
    "javascript",
    "typescript",
    "react",
    "node.js",
    "frontend",
    "backend",
  ]);

  softwareScore += skills.filter(
    (skill: string) =>
      [
        "JavaScript",
        "TypeScript",
        "React",
        "Node.js",
        "Python",
      ].indexOf(skill) !== -1
  ).length;

  if (
    civilScore >= dataScore &&
    civilScore >= softwareScore &&
    civilScore > 0
  ) {
    return "civil";
  }

  if (
    dataScore >= civilScore &&
    dataScore >= softwareScore &&
    dataScore > 0
  ) {
    return "data";
  }

  if (
    softwareScore >= civilScore &&
    softwareScore >= dataScore &&
    softwareScore > 0
  ) {
    return "software";
  }

  return "general";
}

/* =========================================================
   TRACEABLE ISSUE HELPERS
   ========================================================= */

function getEvidenceSnippet(
  originalText: string,
  keywords: string[]
): string {
  const lines = String(originalText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) =>
      line.replace(/[ \t]+/g, " ").trim()
    )
    .filter(Boolean);

  for (const line of lines) {
    if (containsAny(line, keywords)) {
      return line.slice(0, 240);
    }
  }

  return "";
}

function createIssueId(
  index: number
): string {
  return `issue_${String(index).padStart(3, "0")}`;
}

function buildFallbackIssues(args: {
  extractedText: string;
  skills: string[];
  hasSummary: boolean;
  hasExperience: boolean;
  hasProjects: boolean;
  hasMetrics: boolean;
  actionLanguageDetected: boolean;
  hasContactInformation: boolean;
  hasEducation: boolean;
  hasDates: boolean;
}): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  const addIssue = (
    issue: Omit<AnalysisIssue, "id">
  ) => {
    issues.push({
      id: createIssueId(issues.length + 1),
      ...issue,
    });
  };

  if (!args.hasSummary) {
    addIssue({
      sectionKey: "summary",
      category: "missing-section",
      title: "Professional Summary",
      problem:
        "A recognizable professional summary or career objective was not found.",
      evidence:
        "No standard professional summary, profile, career objective, or professional profile heading was detected in the extracted CV text.",
      evidenceKind: "absence",
      recommendation:
        "Add a concise professional summary using only skills, experience, education, and career evidence already supported by the CV.",
      severity: "medium",
      fixMode: "rewrite",
    });
  }

  if (args.skills.length < 3) {
    const evidence = getEvidenceSnippet(
      args.extractedText,
      [
        "skills",
        "technical skills",
        "competencies",
        "tools",
      ]
    );

    addIssue({
      sectionKey: "skills",
      category: "skills-clarity",
      title: "Skills",
      problem:
        "The CV does not clearly present enough specific role-related or technical skills.",
      evidence:
        evidence ||
        `Only ${args.skills.length} supported skill${
          args.skills.length === 1 ? "" : "s"
        } were detected by CVCommit's fallback skill matcher.`,
      evidenceKind: evidence
        ? "cv_text"
        : "pattern",
      recommendation:
        "Clarify and organize only skills that are genuinely supported by the candidate's CV. Do not add unverified skills.",
      severity: "medium",
      fixMode: "rewrite",
    });
  }

  if (
    args.hasExperience &&
    !args.hasMetrics
  ) {
    const evidence = getEvidenceSnippet(
      args.extractedText,
      SECTION_KEYWORDS.experience
    );

    addIssue({
      sectionKey: "experience",
      category: "impact",
      title: "Experience Impact",
      problem:
        "Experience is present, but measurable evidence of results or scale was not detected.",
      evidence:
        evidence ||
        "An experience section was detected, but measurable result patterns such as percentages, quantities, durations, project counts, client counts, or similar scale indicators were not detected.",
      evidenceKind: evidence
        ? "cv_text"
        : "pattern",
      recommendation:
        "Strengthen existing experience descriptions with clearer outcomes. Only use numbers already present in the CV; if a metric is unknown, do not invent one.",
      severity: "medium",
      fixMode: "rewrite",
    });
  }

  if (
    (args.hasExperience || args.hasProjects) &&
    !args.actionLanguageDetected
  ) {
    const sectionKey: AnalysisIssueSectionKey =
      args.hasExperience
        ? "experience"
        : "projects";

    const evidence = getEvidenceSnippet(
      args.extractedText,
      args.hasExperience
        ? SECTION_KEYWORDS.experience
        : SECTION_KEYWORDS.projects
    );

    addIssue({
      sectionKey,
      category: "action-language",
      title:
        sectionKey === "experience"
          ? "Experience Descriptions"
          : "Project Descriptions",
      problem:
        "Practical evidence is present, but strong action-oriented wording was not detected.",
      evidence:
        evidence ||
        "Experience or project content was detected without the fallback analyzer finding its supported action-language patterns.",
      evidenceKind: evidence
        ? "cv_text"
        : "pattern",
      recommendation:
        "Rewrite the existing descriptions with clearer action verbs while preserving every factual claim.",
      severity: "medium",
      fixMode: "rewrite",
    });
  }

  if (
    args.hasEducation &&
    !args.hasDates
  ) {
    const evidence = getEvidenceSnippet(
      args.extractedText,
      SECTION_KEYWORDS.education
    );

    addIssue({
      sectionKey: "education",
      category: "dates",
      title: "Education Dates",
      problem:
        "Education is present, but recognizable date information was not detected.",
      evidence:
        evidence ||
        "An education section was detected without a recognizable year or month pattern.",
      evidenceKind: evidence
        ? "cv_text"
        : "pattern",
      recommendation:
        "Ask the candidate to confirm the correct education dates before changing them. CVCommit must not invent dates.",
      severity: "medium",
      fixMode: "user_confirmation",
    });
  }

  if (!args.hasContactInformation) {
    addIssue({
      sectionKey: "header",
      category: "contact-information",
      title: "Contact Information",
      problem:
        "Recognizable contact information was not detected in the extracted CV text.",
      evidence:
        "No supported email, Nigerian phone-number pattern, or LinkedIn reference was detected.",
      evidenceKind: "absence",
      recommendation:
        "Ask the candidate to confirm the contact details they want displayed. CVCommit must not invent personal information.",
      severity: "high",
      fixMode: "user_confirmation",
    });
  }

  return issues.slice(0, 7);
}

/* =========================================================
   MAIN ANALYSIS FUNCTION
   ========================================================= */

export function createFallbackAnalysis(
  extractedText: string
): FallbackAnalysis {
  const text =
    normalizeText(extractedText);

  const wordCount =
    text.length === 0
      ? 0
      : text
          .split(/\s+/)
          .filter(Boolean)
          .length;

  /* -------------------------------------------------------
     BASIC DETECTION
     ------------------------------------------------------- */

  const skills =
    detectSkills(text);

  const hasExperience =
    detectSection(
      text,
      SECTION_KEYWORDS.experience
    );

  const hasEducation =
    detectSection(
      text,
      SECTION_KEYWORDS.education
    );

  const hasProjects =
    detectSection(
      text,
      SECTION_KEYWORDS.projects
    );

  const hasSummary =
    detectSection(
      text,
      SECTION_KEYWORDS.summary
    );

  const hasCertifications =
    detectSection(
      text,
      SECTION_KEYWORDS.certifications
    );

  const hasLeadership =
    detectSection(
      text,
      SECTION_KEYWORDS.leadership
    );

  const hasAchievements =
    detectSection(
      text,
      SECTION_KEYWORDS.achievements
    );

  const hasReferences =
    detectSection(
      text,
      SECTION_KEYWORDS.references
    );

  const hasContactInformation =
    detectContactInformation(text);

  const hasMetrics =
    hasMetricEvidence(text);

  const hasDates =
    hasDateEvidence(text);

  /*
   * IMPORTANT:
   * This is deliberately named differently from
   * detectActionLanguage().
   */
  const actionLanguageDetected =
    detectActionLanguage(text);

  const recommendedRoles =
    detectRoles(
      text,
      skills
    );

  const careerDirection =
    getCareerDirection(
      text,
      skills
    );

  /* -------------------------------------------------------
     EVIDENCE
     ------------------------------------------------------- */

  const skillsEvidence =
    Math.min(
      skills.length,
      6
    );

  const structureEvidence =
    Number(hasContactInformation) +
    Number(hasSummary) +
    Number(hasEducation) +
    Number(hasExperience) +
    Number(skills.length > 0) +
    Number(hasProjects) +
    Number(hasCertifications);

  /* -------------------------------------------------------
     SCORE BREAKDOWN
     ------------------------------------------------------- */

  const contentExperience =
    clamp(
      4 +
        (hasExperience ? 5 : 0) +
        (hasProjects ? 4 : 0) +
        (actionLanguageDetected ? 4 : 0) +
        (hasMetrics ? 4 : 0) +
        (hasAchievements ? 2 : 0) +
        (hasLeadership ? 1 : 0),
      0,
      25
    );

  const skillsRelevance =
    clamp(
      3 +
        skillsEvidence * 2 +
        (hasProjects ? 2 : 0) +
        (hasExperience ? 2 : 0) +
        (careerDirection !== "general"
          ? 2
          : 0),
      0,
      20
    );

  const professionalPositioning =
    clamp(
      4 +
        (hasSummary ? 5 : 0) +
        (careerDirection !== "general"
          ? 4
          : 0) +
        (recommendedRoles.length > 0
          ? 3
          : 0) +
        (skills.length >= 3
          ? 2
          : 0) +
        (hasExperience ? 2 : 0),
      0,
      20
    );

  const atsReadiness =
    clamp(
      4 +
        (hasContactInformation ? 2 : 0) +
        (hasEducation ? 2 : 0) +
        (hasExperience ? 2 : 0) +
        (skills.length >= 2 ? 2 : 0) +
        (hasCertifications ? 1 : 0) +
        (hasDates ? 1 : 0) +
        (hasSummary ? 1 : 0),
      0,
      15
    );

  const education =
    clamp(
      hasEducation
        ? 6 +
          (hasDates ? 2 : 0) +
          (hasProjects ? 1 : 0) +
          (skills.length >= 2 ? 1 : 0)
        : 2,
      0,
      10
    );

  const cvStructure =
    clamp(
      2 +
        structureEvidence +
        (wordCount >= 250 ? 1 : 0) +
        (wordCount >= 500 ? 1 : 0),
      0,
      10
    );

  const scoreBreakdown = {
    contentExperience,
    skillsRelevance,
    professionalPositioning,
    atsReadiness,
    education,
    cvStructure,
  };

  const overallScore =
    clamp(
      contentExperience +
        skillsRelevance +
        professionalPositioning +
        atsReadiness +
        education +
        cvStructure,
      0,
      100
    );

  /* -------------------------------------------------------
     STRENGTHS
     ------------------------------------------------------- */

  const strengths: string[] = [];

  if (skills.length >= 3) {
    strengths.push(
      "The CV identifies several relevant skills, including " +
        skills
          .slice(0, 5)
          .join(", ") +
        "."
    );
  } else if (skills.length > 0) {
    strengths.push(
      "The CV identifies relevant skills such as " +
        skills
          .slice(0, 4)
          .join(", ") +
        "."
    );
  }

  if (hasExperience) {
    strengths.push(
      "The CV contains employment, internship, industrial training, or other practical experience."
    );
  }

  if (hasProjects) {
    strengths.push(
      "Projects provide additional evidence of practical or academic capability."
    );
  }

  if (hasEducation) {
    strengths.push(
      "The CV clearly contains an identifiable educational background."
    );
  }

  if (hasCertifications) {
    strengths.push(
      "Additional certifications or professional training are included."
    );
  }

  if (hasLeadership) {
    strengths.push(
      "Leadership, coordination, or organizational experience is represented."
    );
  }

  if (hasMetrics) {
    strengths.push(
      "The CV contains measurable information that can help demonstrate impact."
    );
  }

  if (actionLanguageDetected) {
    strengths.push(
      "Several experience or project descriptions use action-oriented language."
    );
  }

  if (strengths.length === 0) {
    strengths.push(
      "The CV provides a starting foundation for further improvement."
    );
  }

  while (strengths.length < 3) {
    strengths.push(
      "The available CV content provides information that can be developed into stronger career evidence."
    );
  }

  /* -------------------------------------------------------
     WEAKNESSES
     ------------------------------------------------------- */

  const weaknesses: string[] = [];

  if (!hasSummary) {
    weaknesses.push(
      "A clear professional summary or career objective is missing."
    );
  }

  if (
    !hasExperience &&
    !hasProjects
  ) {
    weaknesses.push(
      "There is limited evidence of practical experience or projects."
    );
  }

  if (skills.length < 3) {
    weaknesses.push(
      "The CV does not clearly demonstrate enough specific technical or role-related skills."
    );
  }

  if (!hasMetrics) {
    weaknesses.push(
      "Experience and project descriptions contain limited measurable evidence of results or impact."
    );
  }

  if (!actionLanguageDetected) {
    weaknesses.push(
      "Several sections would benefit from stronger action-oriented descriptions of what was actually done."
    );
  }

  if (!hasContactInformation) {
    weaknesses.push(
      "Contact information is not clearly identifiable from the extracted CV text."
    );
  }

  if (!hasCertifications) {
    weaknesses.push(
      "Relevant certifications, training, or professional development are not clearly identified."
    );
  }

  if (!hasDates) {
    weaknesses.push(
      "Dates are not clearly identifiable, which can make education and experience harder to evaluate."
    );
  }

  if (weaknesses.length < 3) {
    weaknesses.push(
      "The CV could be more specifically targeted toward the roles being pursued."
    );
  }

  /* -------------------------------------------------------
     RECOMMENDED SKILLS
     ------------------------------------------------------- */

  const recommendedSkills: string[] = [];

  if (careerDirection === "civil") {
    if (!hasSkill(skills, "AutoCAD")) {
      recommendedSkills.push(
        "AutoCAD"
      );
    }

    if (!hasSkill(skills, "Civil 3D")) {
      recommendedSkills.push(
        "Civil 3D"
      );
    }

    if (
      !hasSkill(
        skills,
        "Construction Management"
      )
    ) {
      recommendedSkills.push(
        "Construction Project Management"
      );
    }

    if (
      !hasSkill(
        skills,
        "Site Supervision"
      )
    ) {
      recommendedSkills.push(
        "Site Supervision"
      );
    }

    if (
      !hasSkill(
        skills,
        "Quantity Surveying"
      )
    ) {
      recommendedSkills.push(
        "Construction Cost Estimation"
      );
    }
  }

  if (careerDirection === "data") {
    if (!hasSkill(skills, "SQL")) {
      recommendedSkills.push(
        "SQL"
      );
    }

    if (
      !hasSkill(
        skills,
        "Microsoft Excel"
      )
    ) {
      recommendedSkills.push(
        "Advanced Excel"
      );
    }

    recommendedSkills.push(
      "Power BI",
      "Data Visualization"
    );
  }

  if (careerDirection === "software") {
    recommendedSkills.push(
      "Git",
      "API Development",
      "Software Testing"
    );
  }

  if (careerDirection === "general") {
    recommendedSkills.push(
      "Microsoft Excel",
      "Digital Productivity",
      "Professional Communication"
    );
  }

  recommendedSkills.push(
    "Achievement-focused CV writing",
    "ATS keyword optimization"
  );

  const uniqueRecommendedSkills =
    uniqueItems(
      recommendedSkills
    )
      .filter(
        (
          skill: string
        ): boolean => {
          const lowerSkill =
            skill.toLowerCase();

          return !skills.some(
            (
              existingSkill: string
            ): boolean =>
              existingSkill.toLowerCase() ===
              lowerSkill
          );
        }
      )
      .slice(0, 8);

  /* -------------------------------------------------------
     EXPERIENCE ASSESSMENT
     ------------------------------------------------------- */

  let experienceAssessment: string;

  if (
    hasExperience &&
    hasMetrics &&
    actionLanguageDetected
  ) {
    experienceAssessment =
      "Your CV contains practical experience supported by action-oriented descriptions and measurable evidence. Continue making each entry specific to the role you are targeting.";
  } else if (
    hasExperience ||
    hasProjects
  ) {
    experienceAssessment =
      "Your CV contains experience or project evidence, but the descriptions can be stronger. Explain what you did, the tools or methods you used, and the result or outcome whenever possible.";
  } else {
    experienceAssessment =
      "The CV contains limited practical experience evidence. For an early-career candidate, academic projects, internships, SIWES/industrial training, volunteering, competitions, freelance work, and relevant personal projects can provide useful evidence.";
  }

  /* -------------------------------------------------------
     EDUCATION ASSESSMENT
     ------------------------------------------------------- */

  let educationAssessment: string;

  if (hasEducation) {
    if (hasDates) {
      educationAssessment =
        "Your educational background is identifiable and appears to include date information. Keep the qualification, institution, dates, relevant coursework, projects, and academic achievements clearly structured.";
    } else {
      educationAssessment =
        "Your educational background is identifiable, but dates are not clearly detected. Make the qualification, institution, start/end dates, relevant coursework, and academic projects easy to find.";
    }
  } else {
    educationAssessment =
      "A clearly structured education section should be added with your qualification, institution, location where useful, and dates.";
  }

  /* -------------------------------------------------------
     ATS ASSESSMENT
     ------------------------------------------------------- */

  let atsAssessment: string;

  if (atsReadiness >= 12) {
    atsAssessment =
      "The extracted CV has several ATS-friendly signals, including recognizable sections and relevant searchable terms. Keep headings standard, use role-specific keywords, and avoid unnecessary formatting.";
  } else if (atsReadiness >= 8) {
    atsAssessment =
      "The CV has a reasonable ATS foundation, but section clarity and keyword targeting can be improved. Use standard headings, concise bullets, and terminology that matches the roles you want.";
  } else {
    atsAssessment =
      "ATS readiness needs attention. Use standard section headings, searchable role-specific keywords, clear dates, concise bullet points, and simple formatting that extracts cleanly as text.";
  }

  /* -------------------------------------------------------
     SUMMARY
     ------------------------------------------------------- */

  let summary: string;

  if (careerDirection === "civil") {
    if (overallScore >= 70) {
      summary =
        "Your CV shows a recognizable civil engineering or construction direction with useful technical evidence. The biggest opportunity is to make your practical achievements and role-specific skills more measurable.";
    } else {
      summary =
        "Your CV shows a developing civil engineering or construction direction, but it needs stronger evidence of practical capability, clearer positioning, and more targeted technical skills.";
    }
  } else if (careerDirection === "data") {
    if (overallScore >= 70) {
      summary =
        "Your CV shows a developing data and analytical direction with relevant technical evidence. Strengthen it further by connecting tools to measurable analytical outcomes.";
    } else {
      summary =
        "Your CV shows some data or analytical evidence, but stronger technical skills, projects, measurable outcomes, and clearer career positioning would improve its competitiveness.";
    }
  } else if (careerDirection === "software") {
    if (overallScore >= 70) {
      summary =
        "Your CV shows a recognizable software or technology direction with relevant technical evidence. Strengthen the profile by demonstrating projects, outcomes, and the technologies used.";
    } else {
      summary =
        "Your CV shows some technology-related evidence, but stronger projects, technical depth, measurable outcomes, and clearer role positioning would make it more competitive.";
    }
  } else {
    if (overallScore >= 75) {
      summary =
        "Your CV has a solid foundation of career information and identifiable skills. The next improvement is to make the document more targeted and achievement-focused.";
    } else if (overallScore >= 55) {
      summary =
        "Your CV contains useful career information, but several areas can be strengthened, particularly professional positioning, evidence of impact, ATS keywords, and role-specific skills.";
    } else {
      summary =
        "Your CV provides a starting foundation, but it needs stronger evidence of skills, experience, achievements, and professional direction.";
    }
  }

  /* -------------------------------------------------------
     IMPROVEMENTS
     ------------------------------------------------------- */

  const improvements: string[] = [];

  if (!hasSummary) {
    improvements.push(
      "Add a concise professional summary that states your career direction, strongest skills, and the type of role you are targeting."
    );
  } else {
    improvements.push(
      "Refine your professional summary so it clearly communicates your target role, strongest skills, and value to an employer."
    );
  }

  if (hasExperience) {
    if (hasMetrics) {
      improvements.push(
        "Make your strongest experience bullets even more achievement-focused by connecting actions to measurable outcomes."
      );
    } else {
      improvements.push(
        "Rewrite experience bullets to show actions, responsibilities, tools used, and measurable results wherever possible."
      );
    }
  } else {
    improvements.push(
      "Add relevant practical evidence through internships, SIWES/industrial training, academic projects, volunteering, freelance work, competitions, or relevant personal projects."
    );
  }

  if (skills.length < 3) {
    improvements.push(
      "Expand the skills section with specific technical and role-related skills that are genuinely supported by your experience or training."
    );
  } else {
    improvements.push(
      "Prioritize the most relevant technical skills and arrange them according to the roles you are targeting."
    );
  }

  if (careerDirection === "civil") {
    improvements.push(
      "Target your CV toward civil engineering, construction, site, CAD, or related engineering roles instead of using one generic positioning for every application."
    );
  } else if (careerDirection === "data") {
    improvements.push(
      "Target your CV toward data and analytical roles instead of using one generic positioning for every application."
    );
  } else if (careerDirection === "software") {
    improvements.push(
      "Target your CV toward software and technology roles instead of using one generic positioning for every application."
    );
  } else {
    improvements.push(
      "Choose a clear target career direction and adapt your CV to the requirements and keywords of those roles."
    );
  }

  improvements.push(
    "Use standard ATS-friendly section headings, consistent dates, concise bullet points, and simple formatting."
  );

  if (!hasMetrics) {
    improvements.push(
      "Add measurable evidence wherever possible, such as quantities, percentages, project sizes, costs, time saved, people supported, or tasks completed."
    );
  } else {
    improvements.push(
      "Increase the number of quantified achievements so employers can quickly understand the scale and impact of your work."
    );
  }

  improvements.push(
    "Remove unnecessary information and give more space to experience, projects, skills, achievements, and evidence that support your target role."
  );

  if (hasReferences) {
    improvements.push(
      "Consider removing a large references section unless the employer specifically requests references, and use the space for stronger career evidence."
    );
  }

  const issues = buildFallbackIssues({
    extractedText,
    skills,
    hasSummary,
    hasExperience,
    hasProjects,
    hasMetrics,
    actionLanguageDetected,
    hasContactInformation,
    hasEducation,
    hasDates,
  });

  /* -------------------------------------------------------
     FINAL RESULT
     ------------------------------------------------------- */

  const finalRoles =
    recommendedRoles.length > 0
      ? recommendedRoles
      : [
          "Graduate Trainee",
          "Entry-Level Professional",
          "Junior Specialist",
        ];

  return {
    overallScore,

    scoreBreakdown,

    summary,

    strengths:
      uniqueItems(strengths)
        .slice(0, 5),

    weaknesses:
      uniqueItems(weaknesses)
        .slice(0, 5),

    skills,

    recommendedSkills:
      uniqueRecommendedSkills,

    experienceAssessment,

    educationAssessment,

    atsAssessment,

    improvements:
      uniqueItems(improvements)
        .slice(0, 7),

    recommendedRoles:
      uniqueItems(finalRoles)
        .slice(0, 5),

    issues,
  };
}