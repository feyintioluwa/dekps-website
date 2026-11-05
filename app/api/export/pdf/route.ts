import { NextResponse } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

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

type PDFColor = ReturnType<typeof rgb>;

/*
 * One set of measurements and colours per CV template.
 * Every drawing helper below reads from state.style,
 * so choosing a template changes the PDF design.
 */
type TemplateStyle = {
  marginX: number;
  marginTop: number;
  marginBottom: number;
  nameSize: number;
  detailSize: number;
  detailLineHeight: number;
  headerMode: "line" | "block";
  headerRuleThickness: number;
  headerRuleColor: PDFColor;
  headerAfter: number;
  headingMode: "rule" | "bar";
  headingSize: number;
  headingSpace: number;
  headingRuleGap: number;
  headingAdvance: number;
  bodySize: number;
  bodyLineHeight: number;
  bulletIndent: number;
  blockGap: number;
  sectionGap: number;
  accent: PDFColor;
  headingColor: PDFColor;
  detailColor: PDFColor;
};

type PDFState = {
  pdf: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  style: TemplateStyle;
  y: number;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const TEMPLATE_STYLES: Record<
  CVTemplateId,
  TemplateStyle
> = {
  classic: {
    marginX: 48,
    marginTop: 52,
    marginBottom: 52,
    nameSize: 20,
    detailSize: 9.5,
    detailLineHeight: 13,
    headerMode: "line",
    headerRuleThickness: 1.5,
    headerRuleColor: rgb(0.08, 0.08, 0.08),
    headerAfter: 22,
    headingMode: "rule",
    headingSize: 11,
    headingSpace: 34,
    headingRuleGap: 6,
    headingAdvance: 29,
    bodySize: 10.5,
    bodyLineHeight: 15,
    bulletIndent: 14,
    blockGap: 6,
    sectionGap: 6,
    accent: rgb(0.18, 0.18, 0.18),
    headingColor: rgb(0.08, 0.08, 0.08),
    detailColor: rgb(0.32, 0.32, 0.32),
  },
  modern: {
    marginX: 48,
    marginTop: 52,
    marginBottom: 52,
    nameSize: 20,
    detailSize: 9.5,
    detailLineHeight: 13,
    headerMode: "block",
    headerRuleThickness: 0,
    headerRuleColor: rgb(0.08, 0.08, 0.08),
    headerAfter: 24,
    headingMode: "bar",
    headingSize: 11,
    headingSpace: 36,
    headingRuleGap: 0,
    headingAdvance: 27,
    bodySize: 10.5,
    bodyLineHeight: 15.5,
    bulletIndent: 14,
    blockGap: 7,
    sectionGap: 8,
    accent: rgb(0.145, 0.388, 0.922),
    headingColor: rgb(0.08, 0.08, 0.08),
    detailColor: rgb(0.83, 0.83, 0.85),
  },
  compact: {
    marginX: 40,
    marginTop: 40,
    marginBottom: 40,
    nameSize: 16,
    detailSize: 8.5,
    detailLineHeight: 11.5,
    headerMode: "line",
    headerRuleThickness: 0.8,
    headerRuleColor: rgb(0.6, 0.6, 0.6),
    headerAfter: 14,
    headingMode: "rule",
    headingSize: 9.5,
    headingSpace: 28,
    headingRuleGap: 5,
    headingAdvance: 21,
    bodySize: 9.5,
    bodyLineHeight: 13,
    bulletIndent: 12,
    blockGap: 4,
    sectionGap: 4,
    accent: rgb(0.18, 0.18, 0.18),
    headingColor: rgb(0.08, 0.08, 0.08),
    detailColor: rgb(0.32, 0.32, 0.32),
  },
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
    !Number.isFinite(order)
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
    sections.length === 0
  ) {
    return null;
  }

  return {
    cvHash,
    fileName:
      stringValue(
        raw.fileName
      ),
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

function createPage(
  state: Omit<
    PDFState,
    "page" | "y"
  >
): PDFState {
  const page =
    state.pdf.addPage([
      PAGE_WIDTH,
      PAGE_HEIGHT,
    ]);

  return {
    ...state,
    page,
    y:
      PAGE_HEIGHT -
      state.style.marginTop,
  };
}

function ensureSpace(
  state: PDFState,
  requiredHeight: number
): PDFState {
  if (
    state.y -
      requiredHeight >=
    state.style.marginBottom
  ) {
    return state;
  }

  return createPage({
    pdf:
      state.pdf,
    font:
      state.font,
    boldFont:
      state.boldFont,
    style:
      state.style,
  });
}


function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const words =
    text
      .split(/\s+/)
      .filter(Boolean);

  if (
    words.length === 0
  ) {
    return [];
  }

  const lines:
    string[] = [];

  let currentLine =
    "";

  for (
    const word of
    words
  ) {
    const candidate =
      currentLine
        ? `${currentLine} ${word}`
        : word;

    const width =
      font.widthOfTextAtSize(
        candidate,
        fontSize
      );

    if (
      width <=
      maxWidth
    ) {
      currentLine =
        candidate;

      continue;
    }

    if (currentLine) {
      lines.push(
        currentLine
      );
    }

    /*
     * Handle a single unusually long word.
     */
    if (
      font.widthOfTextAtSize(
        word,
        fontSize
      ) <=
      maxWidth
    ) {
      currentLine =
        word;

      continue;
    }

    let partial =
      "";

    for (
      const character of
      word
    ) {
      const next =
        partial +
        character;

      if (
        font.widthOfTextAtSize(
          next,
          fontSize
        ) >
          maxWidth &&
        partial
      ) {
        lines.push(
          partial
        );

        partial =
          character;
      } else {
        partial =
          next;
      }
    }

    currentLine =
      partial;
  }

  if (
    currentLine
  ) {
    lines.push(
      currentLine
    );
  }

  return lines;
}

function drawWrappedText({
  state,
  text,
  x,
  maxWidth,
  font,
  fontSize,
  lineHeight,
  color = rgb(
    0.18,
    0.18,
    0.18
  ),
}: {
  state: PDFState;
  text: string;
  x: number;
  maxWidth: number;
  font: PDFFont;
  fontSize: number;
  lineHeight: number;
  color?: ReturnType<
    typeof rgb
  >;
}): PDFState {
  const lines =
    wrapText(
      text,
      font,
      fontSize,
      maxWidth
    );

  let current =
    state;

  for (
    const line of
    lines
  ) {
    current =
      ensureSpace(
        current,
        lineHeight
      );

    current.page.drawText(
      line,
      {
        x,
        y:
          current.y -
          fontSize,

        size:
          fontSize,

        font,

        color,
      }
    );

    current = {
      ...current,
      y:
        current.y -
        lineHeight,
    };
  }

  return current;
}

function drawHeader(
  state: PDFState,
  content: string
): PDFState {
  const s =
    state.style;

  const lines =
    content
      .split("\n")
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  if (
    lines.length === 0
  ) {
    return state;
  }

  const [
    name,
    ...details
  ] = lines;

  const contentWidth =
    PAGE_WIDTH -
    s.marginX * 2;

  /*
   * Modern template: a dark block with white text.
   */
  if (
    s.headerMode ===
    "block"
  ) {
    const pad = 16;

    const detailLines =
      details.length > 0
        ? wrapText(
            details.join(
              " | "
            ),
            state.font,
            s.detailSize,
            contentWidth -
              pad * 2
          )
        : [];

    const height =
      pad * 2 +
      s.nameSize +
      (detailLines.length >
      0
        ? 8 +
          detailLines.length *
            s.detailLineHeight
        : 0);

    const current =
      ensureSpace(
        state,
        height + 10
      );

    const top =
      current.y;

    current.page.drawRectangle({
      x:
        s.marginX,
      y:
        top -
        height,
      width:
        contentWidth,
      height,
      color:
        rgb(
          0.09,
          0.09,
          0.1
        ),
    });

    current.page.drawText(
      name,
      {
        x:
          s.marginX +
          pad,
        y:
          top -
          pad -
          s.nameSize,
        size:
          s.nameSize,
        font:
          current.boldFont,
        color:
          rgb(
            1,
            1,
            1
          ),
      }
    );

    let lineY =
      top -
      pad -
      s.nameSize -
      8;

    for (
      const line of
      detailLines
    ) {
      current.page.drawText(
        line,
        {
          x:
            s.marginX +
            pad,
          y:
            lineY -
            s.detailSize,
          size:
            s.detailSize,
          font:
            current.font,
          color:
            s.detailColor,
        }
      );

      lineY -=
        s.detailLineHeight;
    }

    return {
      ...current,
      y:
        top -
        height -
        s.headerAfter,
    };
  }

  /*
   * Classic and Compact templates: name on the left,
   * contact lines under it, and a rule below.
   */
  let current =
    ensureSpace(
      state,
      70
    );

  current.page.drawText(
    name,
    {
      x:
        s.marginX,
      y:
        current.y -
        s.nameSize,
      size:
        s.nameSize,
      font:
        current.boldFont,
      color:
        s.headingColor,
    }
  );

  current = {
    ...current,
    y:
      current.y -
      (s.nameSize +
        10),
  };

  if (
    details.length > 0
  ) {
    const detailLines =
      wrapText(
        details.join(
          " | "
        ),
        current.font,
        s.detailSize,
        contentWidth
      );

    for (
      const line of
      detailLines
    ) {
      current =
        ensureSpace(
          current,
          s.detailLineHeight
        );

      current.page.drawText(
        line,
        {
          x:
            s.marginX,
          y:
            current.y -
            s.detailSize,
          size:
            s.detailSize,
          font:
            current.font,
          color:
            s.detailColor,
        }
      );

      current = {
        ...current,
        y:
          current.y -
          s.detailLineHeight,
      };
    }
  }

  current.page.drawLine({
    start: {
      x:
        s.marginX,
      y:
        current.y -
        6,
    },
    end: {
      x:
        PAGE_WIDTH -
        s.marginX,
      y:
        current.y -
        6,
    },
    thickness:
      s.headerRuleThickness,
    color:
      s.headerRuleColor,
  });

  return {
    ...current,
    y:
      current.y -
      s.headerAfter,
  };
}

function drawSectionHeading(
  state: PDFState,
  title: string
): PDFState {
  const s =
    state.style;

  const current =
    ensureSpace(
      state,
      s.headingSpace
    );

  /*
   * Modern template: blue bar beside the heading.
   */
  if (
    s.headingMode ===
    "bar"
  ) {
    current.page.drawRectangle({
      x:
        s.marginX,
      y:
        current.y -
        s.headingSize -
        2,
      width:
        3,
      height:
        s.headingSize +
        5,
      color:
        s.accent,
    });

    current.page.drawText(
      title.toUpperCase(),
      {
        x:
          s.marginX +
          10,
        y:
          current.y -
          s.headingSize,
        size:
          s.headingSize,
        font:
          current.boldFont,
        color:
          s.headingColor,
      }
    );

    return {
      ...current,
      y:
        current.y -
        s.headingAdvance,
    };
  }

  /*
   * Classic and Compact templates: heading with a thin rule.
   */
  current.page.drawText(
    title.toUpperCase(),
    {
      x:
        s.marginX,
      y:
        current.y -
        s.headingSize,
      size:
        s.headingSize,
      font:
        current.boldFont,
      color:
        s.headingColor,
    }
  );

  current.page.drawLine({
    start: {
      x:
        s.marginX,
      y:
        current.y -
        (s.headingSize +
          s.headingRuleGap),
    },
    end: {
      x:
        PAGE_WIDTH -
        s.marginX,
      y:
        current.y -
        (s.headingSize +
          s.headingRuleGap),
    },
    thickness:
      0.65,
    color:
      rgb(
        0.72,
        0.72,
        0.72
      ),
  });

  return {
    ...current,
    y:
      current.y -
      s.headingAdvance,
  };
}

function drawSectionContent(
  state: PDFState,
  content: string
): PDFState {
  const s =
    state.style;

  const contentWidth =
    PAGE_WIDTH -
    s.marginX * 2;

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

  let current =
    state;

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
        current =
          ensureSpace(
            current,
            s.bodyLineHeight
          );

        current.page.drawText(
          "\u2022",
          {
            x:
              s.marginX +
              2,
            y:
              current.y -
              s.bodySize,
            size:
              s.bodySize,
            font:
              current.font,
            color:
              s.accent,
          }
        );

        current =
          drawWrappedText({
            state:
              current,
            text:
              cleanBullet(
                line
              ),
            x:
              s.marginX +
              s.bulletIndent,
            maxWidth:
              contentWidth -
              s.bulletIndent,
            font:
              current.font,
            fontSize:
              s.bodySize,
            lineHeight:
              s.bodyLineHeight,
          });

        continue;
      }

      current =
        drawWrappedText({
          state:
            current,
          text:
            line,
          x:
            s.marginX,
          maxWidth:
            contentWidth,
          font:
            current.font,
          fontSize:
            s.bodySize,
          lineHeight:
            s.bodyLineHeight,
        });
    }

    current = {
      ...current,
      y:
        current.y -
        s.blockGap,
    };
  }

  return current;
}

function drawSection(
  state: PDFState,
  section: ExportSection
): PDFState {
  if (
    section.key ===
    "header"
  ) {
    return drawHeader(
      state,
      section.content
    );
  }

  let current =
    drawSectionHeading(
      state,
      section.title
    );

  current =
    drawSectionContent(
      current,
      section.content
    );

  return {
    ...current,
    y:
      current.y -
      state.style.sectionGap,
  };
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
            "Invalid PDF export request.",
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
            "CVCommit could not prepare this CV for PDF export.",
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
     * verifies that the signed-in user has paid access to this
     * exact CV before generating the PDF.
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

    const pdf =
      await PDFDocument.create();

    pdf.setTitle(
      "CVCommit Improved CV"
    );

    pdf.setAuthor(
      "CVCommit"
    );

    pdf.setCreator(
      "CVCommit"
    );

    pdf.setProducer(
      "CVCommit"
    );

    const font =
      await pdf.embedFont(
        StandardFonts.Helvetica
      );

    const boldFont =
      await pdf.embedFont(
        StandardFonts.HelveticaBold
      );

    let state =
      createPage({
        pdf,
        font,
        boldFont,
        style:
          TEMPLATE_STYLES[
            exportRequest.templateId
          ],
      });

    for (
      const section of
      exportRequest.sections
    ) {
      state =
        drawSection(
          state,
          section
        );
    }

    const bytes =
      await pdf.save();

    const downloadName =
      `${cleanDownloadName(
        exportRequest.fileName
      )}-CVCommit.pdf`;

    return new NextResponse(
      Buffer.from(
        bytes
      ),
      {
        status:
          200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `attachment; filename="${downloadName}"`,

          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "CVCommit PDF export error:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          "Something went wrong while creating the PDF file.",
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
        "CVCommit PDF export only accepts POST requests.",
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