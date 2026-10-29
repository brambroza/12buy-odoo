"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { ToastIcon } from "@/components/ui/notify"

/**
 * App-wide toaster: cards with a coloured accent bar, an icon badge, title + muted description and a close button.
 * Plain `toast.success(...)` calls get the same look through the default icons below.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      gap={10}
      offset={{ top: 72, right: 16 }}
      mobileOffset={{ top: 64, left: 12, right: 12 }}
      visibleToasts={4}
      icons={{
        success: <ToastIcon type="success" />,
        info: <ToastIcon type="info" />,
        warning: <ToastIcon type="warning" />,
        error: <ToastIcon type="error" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "cn-toast group/toast relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-popover py-3 pl-4 pr-9 text-popover-foreground shadow-[0_10px_30px_-10px_rgb(0_0_0/0.25)] backdrop-blur sm:w-[360px] " +
            "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-muted-foreground/40 " +
            "data-[type=success]:before:bg-emerald-500 data-[type=info]:before:bg-sky-500 data-[type=warning]:before:bg-amber-500 data-[type=error]:before:bg-red-500",
          icon: "m-0 size-auto shrink-0",
          content: "min-w-0 flex-1 space-y-0.5 pt-0.5",
          title: "text-sm font-semibold leading-snug",
          description: "text-xs leading-relaxed text-muted-foreground",
          closeButton:
            "absolute grid size-6 place-items-center rounded-md border-0 bg-transparent text-muted-foreground opacity-70 transition hover:bg-muted hover:opacity-100",
          actionButton: "ml-2 self-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground",
          cancelButton: "ml-2 self-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
