export type CVSectionKey =
  | "header"
  | "summary"
  | "skills"
  | "experience"
  | "projects"
  | "education"
  | "certifications"
  | "leadership"
  | "awards"
  | "volunteering"
  | "references"
  | "other";

export type CVSection = {
  key: CVSectionKey;
  title: string;
  content: string;
  order: number;
};

export type ParsedCV = {
  sections: CVSection[];

  byKey: Partial<
    Record<
      CVSectionKey,
      string
    >
  >;

  rawText: string;
};

type SectionDefinition = {
  key: CVSectionKey;
  title: string;
  headings: string[];
};

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    key: "summary",
    title: "Professional Summary",
    headings: [
      "professional summary",
      "summary",
      "profile",
      "professional profile",
      "career profile",
      "career objective",
      "objective",
      "about me",
      "personal profile",
    ],
  },

  {
    key: "skills",
    title: "Skills",
    headings: [
      "skills",
      "key skills",
      "technical skills",
      "core skills",
      "core competencies",
      "competencies",
      "professional skills",
      "technical competencies",
      "areas of expertise",
      "expertise",
      "software skills",
      "computer skills",
    ],
  },

  {
    key: "experience",
    title: "Experience",
    headings: [
      "experience",
      "work experience",
      "professional experience",
      "employment",
      "employment history",
      "work history",
      "career history",
      "internship",
      "internships",
      "industrial training",
      "siwes",
      "industrial experience",
      "practical experience",
    ],
  },

  {
    key: "projects",
    title: "Projects",
    headings: [
      "projects",
      "project experience",
      "academic projects",
      "academic project",
      "personal projects",
      "professional projects",
      "selected projects",
      "final year project",
      "final year projects",
      "portfolio projects",
    ],
  },

  {
    key: "education",
    title: "Education",
    headings: [
      "education",
      "educational background",
      "academic background",
      "academic qualifications",
      "qualifications",
      "education and qualifications",
    ],
  },

  {
    key: "certifications",
    title: "Certifications",
    headings: [
      "certifications",
      "certification",
      "certificates",
      "professional certifications",
      "training",
      "professional training",
      "courses",
      "courses and certifications",
      "licenses",
      "licences",
    ],
  },

  {
    key: "leadership",
    title: "Leadership",
    headings: [
      "leadership",
      "leadership experience",
      "positions of responsibility",
      "responsibilities",
      "leadership and activities",
      "extracurricular activities",
      "activities",
    ],
  },

  {
    key: "awards",
    title: "Awards & Achievements",
    headings: [
      "awards",
      "achievements",
      "awards and achievements",
      "honours",
      "honors",
      "recognition",
      "scholarships",
    ],
  },

  {
    key: "volunteering",
    title: "Volunteering",
    headings: [
      "volunteering",
      "volunteer experience",
      "voluntary experience",
      "community service",
      "community involvement",
      "social impact",
    ],
  },

  {
    key: "references",
    title: "References",
    headings: [
      "references",
      "referees",
      "referee",
    ],
  },
];

function normalizeLine(
  value: string
): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeHeading(
  value: string
): string {
  return normalizeLine(value)
    .toLowerCase()
    .replace(/[:\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(
  value: string
): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSectionDefinition(
  line: string
): SectionDefinition | null {
  const normalized =
    normalizeHeading(line);

  if (!normalized) {
    return null;
  }

  for (const definition of SECTION_DEFINITIONS) {
    for (const heading of definition.headings) {
      if (
        normalized ===
        normalizeHeading(
          heading
        )
      ) {
        return definition;
      }
    }
  }

  return null;
}

function looksLikeHeading(
  line: string
): boolean {
  const cleaned =
    normalizeLine(line);

  if (!cleaned) {
    return false;
  }

  if (cleaned.length > 60) {
    return false;
  }

  const words =
    cleaned.split(/\s+/);

  if (words.length > 8) {
    return false;
  }

  /*
   * Explicit known headings always count.
   */
  if (
    getSectionDefinition(
      cleaned
    )
  ) {
    return true;
  }

  /*
   * Uppercase short lines are often CV headings.
   */
  const lettersOnly =
    cleaned.replace(
      /[^A-Za-z]/g,
      ""
    );

  if (
    lettersOnly.length >= 3 &&
    lettersOnly ===
      lettersOnly.toUpperCase()
  ) {
    return true;
  }

  /*
   * Title Case headings are also common.
   */
  const titleCaseWords =
    words.filter(
      (word) =>
        /^[A-Z][A-Za-z&/+-]*$/.test(
          word
        )
    ).length;

  return (
    words.length <= 5 &&
    titleCaseWords ===
      words.length
  );
}

function appendSectionContent(
  map: Map<
    CVSectionKey,
    {
      title: string;
      content: string[];
      order: number;
    }
  >,
  key: CVSectionKey,
  title: string,
  content: string,
  order: number
) {
  const cleaned =
    cleanText(content);

  if (!cleaned) {
    return;
  }

  const existing =
    map.get(key);

  if (existing) {
    existing.content.push(
      cleaned
    );

    return;
  }

  map.set(key, {
    title,
    content: [cleaned],
    order,
  });
}

function detectUnknownHeadingKey(
  heading: string
): CVSectionKey {
  const normalized =
    normalizeHeading(
      heading
    );

  if (
    normalized.includes(
      "language"
    ) ||
    normalized.includes(
      "interest"
    ) ||
    normalized.includes(
      "hobby"
    ) ||
    normalized.includes(
      "personal detail"
    ) ||
    normalized.includes(
      "additional information"
    )
  ) {
    return "other";
  }

  return "other";
}

export function parseCVSections(
  extractedText: string
): ParsedCV {
  const rawText =
    cleanText(
      extractedText
    );

  if (!rawText) {
    return {
      sections: [],
      byKey: {},
      rawText: "",
    };
  }

  const lines =
    rawText.split("\n");

  const sectionMap =
    new Map<
      CVSectionKey,
      {
        title: string;
        content: string[];
        order: number;
      }
    >();

  let currentKey:
    CVSectionKey =
    "header";

  let currentTitle =
    "Header";

  let buffer:
    string[] = [];

  let order = 0;

  const flushBuffer = () => {
    if (
      buffer.length === 0
    ) {
      return;
    }

    const content =
      buffer.join("\n");

    appendSectionContent(
      sectionMap,
      currentKey,
      currentTitle,
      content,
      order
    );

    buffer = [];

    order += 1;
  };

  for (const rawLine of lines) {
    const line =
      normalizeLine(
        rawLine
      );

    if (!line) {
      buffer.push("");
      continue;
    }

    const knownSection =
      getSectionDefinition(
        line
      );

    if (knownSection) {
      flushBuffer();

      currentKey =
        knownSection.key;

      currentTitle =
        knownSection.title;

      continue;
    }

    /*
     * If a line looks strongly like a heading but
     * it is not one of our known sections, preserve
     * it under "other" instead of throwing it away.
     */
    if (
      looksLikeHeading(
        line
      ) &&
      currentKey !==
        "header"
    ) {
      const nextKey =
        detectUnknownHeadingKey(
          line
        );

      if (
        nextKey ===
        "other"
      ) {
        /*
         * Only treat it as a new unknown section if
         * there is already meaningful content in the
         * current section. This reduces false positives.
         */
        const bufferedText =
          buffer
            .join(" ")
            .trim();

        if (
          bufferedText.length >
          20
        ) {
          flushBuffer();

          currentKey =
            "other";

          currentTitle =
            line;

          continue;
        }
      }
    }

    buffer.push(line);
  }

  flushBuffer();

  const sections =
    Array.from(
      sectionMap.entries()
    )
      .map(
        ([
          key,
          value,
        ]): CVSection => ({
          key,

          title:
            value.title,

          content:
            cleanText(
              value.content.join(
                "\n\n"
              )
            ),

          order:
            value.order,
        })
      )
      .filter(
        (section) =>
          section.content
            .trim()
            .length > 0
      )
      .sort(
        (a, b) =>
          a.order -
          b.order
      );

  const byKey:
    Partial<
      Record<
        CVSectionKey,
        string
      >
    > = {};

  for (const section of sections) {
    if (
      byKey[
        section.key
      ]
    ) {
      byKey[
        section.key
      ] =
        `${byKey[section.key]}\n\n${section.content}`;
    } else {
      byKey[
        section.key
      ] =
        section.content;
    }
  }

  return {
    sections,
    byKey,
    rawText,
  };
}

export function getCVSection(
  parsedCV: ParsedCV,
  key: CVSectionKey
): string {
  return (
    parsedCV.byKey[
      key
    ] ?? ""
  );
}

export function hasCVSection(
  parsedCV: ParsedCV,
  key: CVSectionKey
): boolean {
  return Boolean(
    parsedCV.byKey[
      key
    ]?.trim()
  );
}

export function getBestMatchingSection(
  parsedCV: ParsedCV,
  fixTitle: string
): CVSectionKey {
  const title =
    fixTitle
      .toLowerCase()
      .trim();

  if (
    title.includes(
      "summary"
    ) ||
    title.includes(
      "profile"
    )
  ) {
    return "summary";
  }

  if (
    title.includes(
      "experience"
    ) ||
    title.includes(
      "achievement"
    )
  ) {
    if (
      hasCVSection(
        parsedCV,
        "experience"
      )
    ) {
      return "experience";
    }

    if (
      hasCVSection(
        parsedCV,
        "projects"
      )
    ) {
      return "projects";
    }

    return "experience";
  }

  if (
    title.includes(
      "project"
    )
  ) {
    return "projects";
  }

  if (
    title.includes(
      "skill"
    ) ||
    title.includes(
      "technical"
    )
  ) {
    return "skills";
  }

  if (
    title.includes(
      "education"
    ) ||
    title.includes(
      "qualification"
    )
  ) {
    return "education";
  }

  if (
    title.includes(
      "certification"
    ) ||
    title.includes(
      "training"
    )
  ) {
    return "certifications";
  }

  if (
    title.includes(
      "leadership"
    )
  ) {
    return "leadership";
  }

  if (
    title.includes(
      "award"
    )
  ) {
    return "awards";
  }

  if (
    title.includes(
      "volunteer"
    )
  ) {
    return "volunteering";
  }

  if (
    title.includes(
      "reference"
    )
  ) {
    return "references";
  }

  /*
   * ATS and structure fixes usually affect the
   * complete CV rather than one isolated section.
   */
  if (
    title.includes(
      "ats"
    ) ||
    title.includes(
      "keyword"
    ) ||
    title.includes(
      "structure"
    ) ||
    title.includes(
      "format"
    ) ||
    title.includes(
      "layout"
    )
  ) {
    return "other";
  }

  return "other";
}