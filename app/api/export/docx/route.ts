import { NextResponse } from "next/server";

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import {
  getCareerOSCVAccess,
} from "@/lib/access/server-access";
import {
  consumeCVQuota,
  CV_LIMIT_MESSAGE,
} from "@/lib/access/cv-quota";


import {
  DEFAULT_CV_TEMPLATE,
} from "@/lib/cv/templates/template-registry";

import {
  isCVTemplateId,
  type CVTemplateId,
} from "@/lib/cv/templates/template-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawObject = Record<string, unknown>;

type ExportSection = {
  key: string;
  title: string;
  content: string;
  order: number;
};

type ExportRequest = {
  cvHash: string;
  fileName: string;
  templateId: CVTemplateId;
  sections: ExportSection[];
};

function stringValue(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeSection(
  value: unknown
): ExportSection | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const raw =
    value as RawObject;

  const key =
    stringValue(
      raw.key
    );

  const title =
    stringValue(
      raw.title
    );

  const content =
    stringValue(
      raw.content
    );

  const order =
    Number(
      raw.order
    );

  if (
    !key ||
    !title ||
    !content ||
    !Number.isFinite(
      order
    )
  ) {
    return null;
  }

  return {
    key,
    title,
    content,
    order,
  };
}

function normalizeRequest(
  value: unknown
): ExportRequest | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const raw =
    value as RawObject;

  const cvHash =
    stringValue(
      raw.cvHash
    );

  const fileName =
    stringValue(
      raw.fileName
    );

  if (
    !cvHash ||
    !Array.isArray(
      raw.sections
    )
  ) {
    return null;
  }

  const sections =
    raw.sections
      .map(
        normalizeSection
      )
      .filter(
        (
          section
        ): section is ExportSection =>
          section !== null
      )
      .sort(
        (a, b) =>
          a.order -
          b.order
      );

  if (
    sections.length ===
    0
  ) {
    return null;
  }

  return {
    cvHash,
    fileName,
    templateId:
      isCVTemplateId(
        raw.templateId
      )
        ? raw.templateId
        : DEFAULT_CV_TEMPLATE,
    sections,
  };
}

function cleanDownloadName(
  fileName: string
): string {
  const withoutExtension =
    fileName.replace(
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

  return cleaned ||
    "CVCommit-CV";
}

/*
 * One set of sizes and colours per CV template.
 * Sizes are in Word units: font sizes in half-points
 * (21 = 10.5 pt), spacing and margins in twips (720 = 0.5 inch).
 */
type DocxStyle = {
  id: CVTemplateId;
  margin: number;
  nameSize: number;
  detailSize: number;
  headerRuleSize: number;
  headerRuleColor: string;
  headerAfter: number;
  headingMode: "rule" | "bar";
  headingSize: number;
  headingBefore: number;
  headingAfter: number;
  bodySize: number;
  lineSpacing: number;
  paragraphAfter: number;
  bulletAfter: number;
  blockAfter: number;
  accent: string;
  ink: string;
  muted: string;
};

const DOCX_STYLES: Record<
  CVTemplateId,
  DocxStyle
> = {
  classic: {
    id: "classic",
    margin: 720,
    nameSize: 40,
    detailSize: 20,
    headerRuleSize: 12,
    headerRuleColor: "222222",
    headerAfter: 260,
    headingMode: "rule",
    headingSize: 22,
    headingBefore: 220,
    headingAfter: 120,
    bodySize: 21,
    lineSpacing: 260,
    paragraphAfter: 100,
    bulletAfter: 80,
    blockAfter: 60,
    accent: "2D2D2D",
    ink: "111111",
    muted: "555555",
  },
  modern: {
    id: "modern",
    margin: 720,
    nameSize: 40,
    detailSize: 20,
    headerRuleSize: 24,
    headerRuleColor: "2563EB",
    headerAfter: 280,
    headingMode: "bar",
    headingSize: 22,
    headingBefore: 240,
    headingAfter: 120,
    bodySize: 21,
    lineSpacing: 270,
    paragraphAfter: 110,
    bulletAfter: 90,
    blockAfter: 80,
    accent: "2563EB",
    ink: "111111",
    muted: "555555",
  },
  compact: {
    id: "compact",
    margin: 576,
    nameSize: 32,
    detailSize: 17,
    headerRuleSize: 6,
    headerRuleColor: "999999",
    headerAfter: 160,
    headingMode: "rule",
    headingSize: 19,
    headingBefore: 140,
    headingAfter: 80,
    bodySize: 19,
    lineSpacing: 240,
    paragraphAfter: 60,
    bulletAfter: 40,
    blockAfter: 30,
    accent: "2D2D2D",
    ink: "111111",
    muted: "555555",
  },
};

/*
 * Bullet lists: one list definition per template,
 * so the bullet colour matches the template.
 */
const NUMBERING_CONFIG =
  (
    Object.keys(
      DOCX_STYLES
    ) as CVTemplateId[]
  ).map((id) => ({
    reference:
      `cv-bullets-${id}`,
    levels: [
      {
        level: 0,
        format:
          LevelFormat.BULLET,
        text: "\u2022",
        alignment:
          AlignmentType.LEFT,
        style: {
          paragraph: {
            indent: {
              left: 360,
              hanging: 260,
            },
          },
          run: {
            color:
              DOCX_STYLES[id]
                .accent,
          },
        },
      },
    ],
  }));

function createHeaderParagraphs(
  content: string,
  s: DocxStyle
): Paragraph[] {
  const lines =
    content
      .split("\n")
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  if (
    lines.length ===
    0
  ) {
    return [];
  }

  const [
    name,
    ...details
  ] = lines;

  const rule = {
    bottom: {
      style:
        BorderStyle.SINGLE,
      size:
        s.headerRuleSize,
      color:
        s.headerRuleColor,
      space:
        8,
    },
  };

  const paragraphs:
    Paragraph[] = [
      new Paragraph({
        spacing: {
          after:
            details.length >
            0
              ? 100
              : s.headerAfter,
        },
        border:
          details.length ===
          0
            ? rule
            : undefined,
        children: [
          new TextRun({
            text:
              name,
            bold:
              true,
            size:
              s.nameSize,
            color:
              s.ink,
          }),
        ],
      }),
    ];

  if (
    details.length >
    0
  ) {
    paragraphs.push(
      new Paragraph({
        spacing: {
          after:
            s.headerAfter,
        },
        border:
          rule,
        children: [
          new TextRun({
            text:
              details.join(
                " | "
              ),
            size:
              s.detailSize,
            color:
              s.muted,
          }),
        ],
      })
    );
  }

  return paragraphs;
}

function isBulletLine(
  line: string
): boolean {
  return /^[-•▪◦*]\s+/.test(
    line
  );
}

function cleanBullet(
  line: string
): string {
  return line.replace(
    /^[-•▪◦*]\s+/,
    ""
  );
}

function createBodyParagraphs(
  content: string,
  s: DocxStyle
): Paragraph[] {
  const blocks =
    content
      .split(
        /\n{2,}/
      )
      .map(
        (block) =>
          block.trim()
      )
      .filter(Boolean);

  const paragraphs:
    Paragraph[] = [];

  for (
    const block of
    blocks
  ) {
    const lines =
      block
        .split("\n")
        .map(
          (line) =>
            line.trim()
        )
        .filter(Boolean);

    for (
      const line of
      lines
    ) {
      if (
        isBulletLine(
          line
        )
      ) {
        paragraphs.push(
          new Paragraph({
            numbering: {
              reference:
                `cv-bullets-${s.id}`,
              level:
                0,
            },
            spacing: {
              after:
                s.bulletAfter,
              line:
                s.lineSpacing,
            },
            children: [
              new TextRun({
                text:
                  cleanBullet(
                    line
                  ),
                size:
                  s.bodySize,
              }),
            ],
          })
        );

        continue;
      }

      paragraphs.push(
        new Paragraph({
          spacing: {
            after:
              s.paragraphAfter,
            line:
              s.lineSpacing,
          },
          children: [
            new TextRun({
              text:
                line,
              size:
                s.bodySize,
            }),
          ],
        })
      );
    }

    paragraphs.push(
      new Paragraph({
        spacing: {
          after:
            s.blockAfter,
        },
      })
    );
  }

  return paragraphs;
}

function createSectionParagraphs(
  section: ExportSection,
  s: DocxStyle
): Paragraph[] {
  if (
    section.key ===
    "header"
  ) {
    return createHeaderParagraphs(
      section.content,
      s
    );
  }

  return [
    new Paragraph({
      heading:
        HeadingLevel.HEADING_2,
      spacing: {
        before:
          s.headingBefore,
        after:
          s.headingAfter,
      },
      border:
        s.headingMode ===
        "bar"
          ? {
              left: {
                style:
                  BorderStyle.SINGLE,
                size:
                  24,
                color:
                  s.accent,
                space:
                  6,
              },
            }
          : {
              bottom: {
                style:
                  BorderStyle.SINGLE,
                size:
                  5,
                color:
                  "AAAAAA",
                space:
                  5,
              },
            },
      children: [
        new TextRun({
          text:
            section.title.toUpperCase(),
          bold:
            true,
          size:
            s.headingSize,
          color:
            s.ink,
        }),
      ],
    }),
    ...createBodyParagraphs(
      section.content,
      s
    ),
  ];
}


export async function POST(
  request: Request
) {
  try {
    let body:
      unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          success:
            false,
          error:
            "Invalid export request.",
        },
        {
          status:
            400,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const exportRequest =
      normalizeRequest(
        body
      );

    if (
      !exportRequest
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            "CVCommit could not prepare this CV for export.",
        },
        {
          status:
            400,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * SERVER-SIDE CV ENTITLEMENT
     * ---------------------------------------------------------
     *
     * The browser supplies the active CV hash, but the server
     * independently verifies that the signed-in user has paid
     * access to this exact CV before generating the DOCX.
     */
    const access =
      await getCareerOSCVAccess(
        exportRequest.cvHash
      );

    if (!access.authenticated) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            "Sign in to export your CVCommit CV.",
        },
        {
          status:
            401,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }



    const quota =
      await consumeCVQuota(
        access,
        "download"
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

    const style =
      DOCX_STYLES[
        exportRequest.templateId
      ];

    const children =
      exportRequest.sections.flatMap(
        (section) =>
          createSectionParagraphs(
            section,
            style
          )
      );

    const document =
      new Document({
        creator:
          "CVCommit",
        title:
          "CVCommit Improved CV",
        description:
          "Improved CV generated with CVCommit",
        numbering: {
          config:
            NUMBERING_CONFIG,
        },
        styles: {
          default: {
            document: {
              run: {
                font:
                  "Arial",
                size:
                  style.bodySize,
                color:
                  "222222",
              },
              paragraph: {
                spacing: {
                  line:
                    style.lineSpacing,
                },
              },
            },
          },
        },
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top:
                    style.margin,
                  right:
                    style.margin,
                  bottom:
                    style.margin,
                  left:
                    style.margin,
                },
              },
            },
            children,
          },
        ],
      });

    const buffer =
      await Packer.toBuffer(
        document
      );

    const downloadName =
      `${cleanDownloadName(
        exportRequest.fileName
      )}-CVCommit.docx`;

    return new NextResponse(
      new Uint8Array(
        buffer
      ),
      {
        status:
          200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition":
            `attachment; filename="${downloadName}"`,
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "CVCommit DOCX export error:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,
        error:
          "Something went wrong while creating the DOCX file.",
      },
      {
        status:
          500,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      success:
        false,
      error:
        "CVCommit DOCX export only accepts POST requests.",
    },
    {
      status:
        405,
      headers: {
        Allow:
          "POST",
      },
    }
  );
}