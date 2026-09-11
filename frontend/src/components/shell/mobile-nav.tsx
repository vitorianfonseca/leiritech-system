"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { useSidebar } from "./sidebar-context";
import { NavList } from "./sidebar";
import { LeiritechWordmark } from "./logo";
import { Button } from "@/components/ui/button";

export function MobileNav({ user }: { user: SessionUser }) {
  const t = useTranslations("shell.sidebar");
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 md:hidden"
        />
        <DialogPrimitive.Popup
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-lg outline-none transition-transform duration-200 data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full md:hidden"
        >
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
            <LeiritechWordmark />
            <DialogPrimitive.Close
              render={
                <Button variant="ghost" size="icon" aria-label={t("close")} />
              }
            >
              <X />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavList
              user={user}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Trigger placed in the top bar on mobile. */
export function MobileNavTrigger({ icon }: { icon: React.ReactNode }) {
  const t = useTranslations("shell.sidebar");
  const { setMobileOpen } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      aria-label={t("open")}
      onClick={() => setMobileOpen(true)}
    >
      {icon}
    </Button>
  );
}
