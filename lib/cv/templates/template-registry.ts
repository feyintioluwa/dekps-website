import {
  type CVTemplateDefinition,
  type CVTemplateId,
  isCVTemplateId,
} from "./template-types";

export const DEFAULT_CV_TEMPLATE: CVTemplateId =
  "classic";

export const CV_TEMPLATES: readonly CVTemplateDefinition[] = [
  {
    id: "classic",
    name: "Classic",
    description:
      "A clean, traditional CV layout with strong readability and a professional structure.",
    bestFor:
      "Corporate, finance, administration, graduate and general professional roles.",
    atsFriendly: true,
  },
  {
    id: "modern",
    name: "Modern",
    description:
      "A polished contemporary layout with stronger visual hierarchy and subtle styling.",
    bestFor:
      "Technology, consulting, product, marketing and modern professional roles.",
    atsFriendly: true,
  },
  {
    id: "compact",
    name: "Compact",
    description:
      "A space-efficient layout designed to present more information without feeling crowded.",
    bestFor:
      "Candidates with several projects, roles, certifications or detailed experience.",
    atsFriendly: true,
  },
] as const;

export function getCVTemplate(
  templateId: unknown
): CVTemplateDefinition {
  const safeTemplateId =
    isCVTemplateId(templateId)
      ? templateId
      : DEFAULT_CV_TEMPLATE;

  return (
    CV_TEMPLATES.find(
      (template) =>
        template.id === safeTemplateId
    ) ?? CV_TEMPLATES[0]
  );
}