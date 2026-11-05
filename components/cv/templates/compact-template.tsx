import {
  type CVSection,
} from "@/lib/cv/section-parser";

type CompactTemplateProps = {
  sections: CVSection[];
};

export function CompactTemplate({
  sections,
}: CompactTemplateProps) {
  const orderedSections =
    sections
      .slice()
      .sort(
        (a, b) =>
          a.order -
          b.order
      );

  return (
    <div className="min-h-[1100px] bg-white px-7 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
      {orderedSections.map(
        (
          section,
          index
        ) => (
          <CompactSection
            key={`${section.key}-${section.order}`}
            section={section}
            isFirst={index === 0}
          />
        )
      )}
    </div>
  );
}

function CompactSection({
  section,
  isFirst,
}: {
  section: CVSection;
  isFirst: boolean;
}) {
  if (
    !section.content.trim()
  ) {
    return null;
  }

  if (
    section.key ===
    "header"
  ) {
    return (
      <section className="border-b border-zinc-300 pb-5">
        <CompactHeader
          content={
            section.content
          }
        />
      </section>
    );
  }

  return (
    <section
      className={
        isFirst
          ? ""
          : "mt-5"
      }
    >
      <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-zinc-950">
        {section.title}
      </h2>

      <div className="mt-1 h-px bg-zinc-200" />

      <CompactSectionContent
        content={
          section.content
        }
      />
    </section>
  );
}

function CompactHeader({
  content,
}: {
  content: string;
}) {
  const lines =
    content
      .split("\n")
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  const [
    firstLine,
    ...rest
  ] = lines;

  return (
    <div>
      {firstLine && (
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
          {firstLine}
        </h1>
      )}

      {rest.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs leading-5 text-zinc-600">
          {rest.map(
            (
              line,
              index
            ) => (
              <p
                key={`${line}-${index}`}
              >
                {line}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

function CompactSectionContent({
  content,
}: {
  content: string;
}) {
  const blocks =
    content
      .split(/\n{2,}/)
      .map(
        (block) =>
          block.trim()
      )
      .filter(Boolean);

  return (
    <div className="mt-2.5 space-y-2.5">
      {blocks.map(
        (
          block,
          blockIndex
        ) => {
          const lines =
            block
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
            return null;
          }

          const bulletLines =
            lines.filter(
              (line) =>
                /^[-•▪◦*]\s+/.test(
                  line
                )
            );

          if (
            bulletLines.length ===
            lines.length
          ) {
            return (
              <ul
                key={
                  blockIndex
                }
                className="space-y-1 pl-4 text-xs leading-5 text-zinc-700"
              >
                {lines.map(
                  (
                    line,
                    lineIndex
                  ) => (
                    <li
                      key={`${blockIndex}-${lineIndex}`}
                      className="list-disc"
                    >
                      {line.replace(
                        /^[-•▪◦*]\s+/,
                        ""
                      )}
                    </li>
                  )
                )}
              </ul>
            );
          }

          return (
            <div
              key={
                blockIndex
              }
              className="space-y-1"
            >
              {lines.map(
                (
                  line,
                  lineIndex
                ) => (
                  <p
                    key={`${blockIndex}-${lineIndex}`}
                    className="whitespace-pre-wrap text-xs leading-5 text-zinc-700"
                  >
                    {line}
                  </p>
                )
              )}
            </div>
          );
        }
      )}
    </div>
  );
}