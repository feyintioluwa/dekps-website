import {
  type CVSection,
} from "@/lib/cv/section-parser";

type ModernTemplateProps = {
  sections: CVSection[];
};

export function ModernTemplate({
  sections,
}: ModernTemplateProps) {
  const orderedSections =
    sections
      .slice()
      .sort(
        (a, b) =>
          a.order -
          b.order
      );

  return (
    <div className="min-h-[1100px] bg-white px-8 py-10 sm:px-12 sm:py-12 lg:px-16 lg:py-14">
      {orderedSections.map(
        (
          section,
          index
        ) => (
          <ModernSection
            key={`${section.key}-${section.order}`}
            section={section}
            isFirst={index === 0}
          />
        )
      )}
    </div>
  );
}

function ModernSection({
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
      <section className="rounded-3xl bg-zinc-950 px-7 py-8 text-white">
        <ModernHeader
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
          : "mt-8"
      }
    >
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-blue-600" />

        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-950">
          {section.title}
        </h2>
      </div>

      <ModernSectionContent
        content={
          section.content
        }
      />
    </section>
  );
}

function ModernHeader({
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
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {firstLine}
        </h1>
      )}

      {rest.length > 0 && (
        <div className="mt-4 space-y-1 text-sm leading-6 text-zinc-300">
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

function ModernSectionContent({
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
    <div className="mt-4 space-y-4">
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
                className="space-y-2 pl-5 text-sm leading-6 text-zinc-700"
              >
                {lines.map(
                  (
                    line,
                    lineIndex
                  ) => (
                    <li
                      key={`${blockIndex}-${lineIndex}`}
                      className="list-disc marker:text-blue-600"
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
              className="space-y-1.5"
            >
              {lines.map(
                (
                  line,
                  lineIndex
                ) => (
                  <p
                    key={`${blockIndex}-${lineIndex}`}
                    className="whitespace-pre-wrap text-sm leading-6 text-zinc-700"
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