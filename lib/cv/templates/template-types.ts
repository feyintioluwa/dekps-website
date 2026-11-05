export const CV_TEMPLATE_IDS = [
  "classic",
  "modern",
  "compact",
] as const;

export type CVTemplateId =
  (typeof CV_TEMPLATE_IDS)[number];

export type CVTemplateDefinition = {
  id: CVTemplateId;
  name: string;
  description: string;
  bestFor: string;
  atsFriendly: boolean;
};

export function isCVTemplateId(
  value: unknown
): value is CVTemplateId {
  return (
    typeof value === "string" &&
    CV_TEMPLATE_IDS.some(
      (templateId) =>
        templateId === value
    )
  );
}