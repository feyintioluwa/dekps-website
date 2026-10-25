"use client";

import type { ReactNode } from "react";
import { DialogProvider as BaseDialogProvider } from "@/lib/dialog";

export { useConfirm, useToast } from "@/lib/dialog";

// Admin version: also turns the top-of-page messages into pop-up toasts.
export function DialogProvider({ children }: { children: ReactNode }) {
  return <BaseDialogProvider watchMessages>{children}</BaseDialogProvider>;
}
