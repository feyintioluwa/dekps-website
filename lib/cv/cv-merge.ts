import {
  type CVSection,
  type CVSectionKey,
  type ParsedCV,
} from "@/lib/cv/section-parser";

export type AppliedCVFix = {
  sectionKey: CVSectionKey;
  improvedContent: string;
  appliedAt: string;
};

export type ImprovedCV = {
  original: ParsedCV;
  appliedFixes: AppliedCVFix[];
  sections: CVSection[];
  mergedText: string;
};

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

function normalizeSectionTitle(
  sectionKey: CVSectionKey,
  fallbackTitle: string
): string {
  switch (sectionKey) {
    case "header":
      return "Header";

    case "summary":
      return "Professional Summary";

    case "skills":
      return "Skills";

    case "experience":
      return "Experience";

    case "projects":
      return "Projects";

    case "education":
      return "Education";

    case "certifications":
      return "Certifications";

    case "leadership":
      return "Leadership";

    case "awards":
      return "Awards & Achievements";

    case "volunteering":
      return "Volunteering";

    case "references":
      return "References";

    case "other":
    default:
      return fallbackTitle || "Other";
  }
}

function buildSectionText(
  section: CVSection
): string {
  const content =
    cleanText(
      section.content
    );

  if (!content) {
    return "";
  }

  if (
    section.key ===
    "header"
  ) {
    return content;
  }

  const title =
    normalizeSectionTitle(
      section.key,
      section.title
    );

  return [
    title,
    content,
  ].join("\n\n");
}

export function createImprovedCV(
  parsedCV: ParsedCV
): ImprovedCV {
  const sections =
    parsedCV.sections.map(
      (section) => ({
        ...section,
      })
    );

  return {
    original:
      parsedCV,

    appliedFixes:
      [],

    sections,

    mergedText:
      buildMergedText(
        sections
      ),
  };
}

export function applyCVFix({
  improvedCV,
  sectionKey,
  improvedContent,
}: {
  improvedCV: ImprovedCV;
  sectionKey: CVSectionKey;
  improvedContent: string;
}): ImprovedCV {
  const cleanedContent =
    cleanText(
      improvedContent
    );

  if (!cleanedContent) {
    return improvedCV;
  }

  const sections =
    improvedCV.sections.map(
      (section) => ({
        ...section,
      })
    );

  const existingIndex =
    sections.findIndex(
      (section) =>
        section.key ===
        sectionKey
    );

  /*
   * If the section already exists,
   * replace only that section's content.
   */
  if (
    existingIndex !== -1
  ) {
    const existingSection =
      sections[
        existingIndex
      ];

    sections[
      existingIndex
    ] = {
      ...existingSection,

      title:
        normalizeSectionTitle(
          sectionKey,
          existingSection.title
        ),

      content:
        cleanedContent,
    };
  } else {
    /*
     * If the section does not exist yet,
     * add a new section in a sensible
     * position.
     */
    const newSection: CVSection = {
      key:
        sectionKey,

      title:
        normalizeSectionTitle(
          sectionKey,
          ""
        ),

      content:
        cleanedContent,

      order:
        getNewSectionOrder(
          sections,
          sectionKey
        ),
    };

    sections.push(
      newSection
    );
  }

  const normalizedSections =
    normalizeSectionOrder(
      sections
    );

  const appliedFixes =
    upsertAppliedFix(
      improvedCV.appliedFixes,
      {
        sectionKey,

        improvedContent:
          cleanedContent,

        appliedAt:
          new Date()
            .toISOString(),
      }
    );

  return {
    ...improvedCV,

    appliedFixes,

    sections:
      normalizedSections,

    mergedText:
      buildMergedText(
        normalizedSections
      ),
  };
}

export function removeCVFix({
  improvedCV,
  sectionKey,
}: {
  improvedCV: ImprovedCV;
  sectionKey: CVSectionKey;
}): ImprovedCV {
  const originalSection =
    improvedCV.original.sections.find(
      (section) =>
        section.key ===
        sectionKey
    );

  let sections =
    improvedCV.sections.map(
      (section) => ({
        ...section,
      })
    );

  const currentIndex =
    sections.findIndex(
      (section) =>
        section.key ===
        sectionKey
    );

  /*
   * If this section existed in the
   * original CV, restore it.
   */
  if (originalSection) {
    if (
      currentIndex !== -1
    ) {
      sections[
        currentIndex
      ] = {
        ...originalSection,
      };
    } else {
      sections.push({
        ...originalSection,
      });
    }
  } else {
    /*
     * If CVCommit created a brand-new
     * section, remove it completely.
     */
    sections =
      sections.filter(
        (section) =>
          section.key !==
          sectionKey
      );
  }

  const normalizedSections =
    normalizeSectionOrder(
      sections
    );

  const appliedFixes =
    improvedCV.appliedFixes.filter(
      (fix) =>
        fix.sectionKey !==
        sectionKey
    );

  return {
    ...improvedCV,

    sections:
      normalizedSections,

    appliedFixes,

    mergedText:
      buildMergedText(
        normalizedSections
      ),
  };
}

export function isFixApplied(
  improvedCV: ImprovedCV,
  sectionKey: CVSectionKey
): boolean {
  return improvedCV.appliedFixes.some(
    (fix) =>
      fix.sectionKey ===
      sectionKey
  );
}

export function getAppliedFix(
  improvedCV: ImprovedCV,
  sectionKey: CVSectionKey
): AppliedCVFix | null {
  return (
    improvedCV.appliedFixes.find(
      (fix) =>
        fix.sectionKey ===
        sectionKey
    ) ?? null
  );
}

export function buildMergedText(
  sections: CVSection[]
): string {
  return sections
    .slice()
    .sort(
      (a, b) =>
        a.order -
        b.order
    )
    .map(
      buildSectionText
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function upsertAppliedFix(
  fixes: AppliedCVFix[],
  nextFix: AppliedCVFix
): AppliedCVFix[] {
  const existingIndex =
    fixes.findIndex(
      (fix) =>
        fix.sectionKey ===
        nextFix.sectionKey
    );

  if (
    existingIndex === -1
  ) {
    return [
      ...fixes,
      nextFix,
    ];
  }

  return fixes.map(
    (fix, index) =>
      index ===
      existingIndex
        ? nextFix
        : fix
  );
}

function getNewSectionOrder(
  sections: CVSection[],
  sectionKey: CVSectionKey
): number {
  const desiredOrder =
    getPreferredSectionOrder(
      sectionKey
    );

  const sorted =
    sections
      .slice()
      .sort(
        (a, b) =>
          a.order -
          b.order
      );

  /*
   * Find the first section that should
   * normally come after the new section.
   */
  for (
    let index = 0;
    index <
    sorted.length;
    index++
  ) {
    const section =
      sorted[index];

    const currentPreference =
      getPreferredSectionOrder(
        section.key
      );

    if (
      currentPreference >
      desiredOrder
    ) {
      return (
        section.order -
        0.5
      );
    }
  }

  const highestOrder =
    sorted.length > 0
      ? Math.max(
          ...sorted.map(
            (section) =>
              section.order
          )
        )
      : 0;

  return (
    highestOrder + 1
  );
}

function normalizeSectionOrder(
  sections: CVSection[]
): CVSection[] {
  return sections
    .slice()
    .sort(
      (a, b) => {
        const preferredA =
          getPreferredSectionOrder(
            a.key
          );

        const preferredB =
          getPreferredSectionOrder(
            b.key
          );

        if (
          preferredA !==
          preferredB
        ) {
          return (
            preferredA -
            preferredB
          );
        }

        return (
          a.order -
          b.order
        );
      }
    )
    .map(
      (
        section,
        index
      ) => ({
        ...section,
        order:
          index,
      })
    );
}

function getPreferredSectionOrder(
  key: CVSectionKey
): number {
  switch (key) {
    case "header":
      return 0;

    case "summary":
      return 10;

    case "skills":
      return 20;

    case "experience":
      return 30;

    case "projects":
      return 40;

    case "education":
      return 50;

    case "certifications":
      return 60;

    case "leadership":
      return 70;

    case "volunteering":
      return 80;

    case "awards":
      return 90;

    case "references":
      return 100;

    case "other":
    default:
      return 110;
  }
}