import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * The panel every "more detail" opens in: full height on the right, over the page that opened it,
 * so closing it leaves you where you were. Callers put a DialogTitle inside for accessibility.
 */
export default function SidePanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="top-0 right-0 left-auto flex h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none p-0 sm:max-w-[580px] data-open:slide-in-from-right data-open:zoom-in-100 data-closed:slide-out-to-right data-closed:zoom-out-100">
        {children}
      </DialogContent>
    </Dialog>
  );
}
