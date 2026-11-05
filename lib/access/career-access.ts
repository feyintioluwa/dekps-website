export type CareerOSPlan =
  | "free"
  | "pro";

export type CareerOSFeature =
  | "analysis"
  | "fix"
  | "preview"
  | "docxExport"
  | "pdfExport";

type PlanPermissions = {
  analysis: boolean;
  fix: boolean;
  preview: boolean;
  docxExport: boolean;
  pdfExport: boolean;
};

const PLAN_PERMISSIONS: Record<
  CareerOSPlan,
  PlanPermissions
> = {
  free: {
    analysis: true,
    fix: false,
    preview: false,
    docxExport: false,
    pdfExport: false,
  },

  pro: {
    analysis: true,
    fix: true,
    preview: true,
    docxExport: true,
    pdfExport: true,
  },
};

export function normalizeCareerOSPlan(
  value: unknown
): CareerOSPlan {
  if (value === "pro") {
    return "pro";
  }

  return "free";
}

export function canUseFeature(
  plan: CareerOSPlan,
  feature: CareerOSFeature
): boolean {
  return PLAN_PERMISSIONS[
    plan
  ][feature];
}

export function canAnalyzeCV(
  plan: CareerOSPlan
): boolean {
  return canUseFeature(
    plan,
    "analysis"
  );
}

export function canUseFixMyCV(
  plan: CareerOSPlan
): boolean {
  return canUseFeature(
    plan,
    "fix"
  );
}

export function canPreviewCV(
  plan: CareerOSPlan
): boolean {
  return canUseFeature(
    plan,
    "preview"
  );
}

export function canExportDOCX(
  plan: CareerOSPlan
): boolean {
  return canUseFeature(
    plan,
    "docxExport"
  );
}

export function canExportPDF(
  plan: CareerOSPlan
): boolean {
  return canUseFeature(
    plan,
    "pdfExport"
  );
}