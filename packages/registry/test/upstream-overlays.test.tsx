import { type ComponentProps } from "preact"
import { render, screen } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import { flush, mockLayout, setupUser, useFakeTimers } from "./helpers"
import * as AlertDialogPrimitive from "../src/radix/alert-dialog"
import * as DialogPrimitive from "../src/radix/dialog"
import * as HoverCardPrimitive from "../src/radix/hover-card"
import * as PopoverPrimitive from "../src/radix/popover"
import * as Slot from "../src/radix/slot"
import * as TooltipPrimitive from "../src/radix/tooltip"

// Wrappers written the way the pipeline turns the upstream shadcn components into Preact code
function Button({ asChild = false, variant = "default", size = "default", ...props }: ComponentProps<"button"> & { asChild?: boolean; variant?: string; size?: string }) {
  const Comp = asChild ? Slot.Root : "button"
  return <Comp data-slot="button" data-variant={variant} data-size={size} {...props} />
}

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}
function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}
function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}
function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}
function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={["fixed inset-0 z-50", className].join(" ")} {...props} />
}
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content data-slot="dialog-content" className={["fixed top-1/2 z-50", className].join(" ")} {...props}>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
              <svg />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}
function DialogFooter({ children, showCloseButton = false, ...props }: ComponentProps<"div"> & { showCloseButton?: boolean }) {
  return (
    <div data-slot="dialog-footer" {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Dismiss</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}
function DialogTitle(props: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />
}
function DialogDescription(props: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" {...props} />
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content data-slot="sheet-content" data-side={side} className={["fixed z-50", className].join(" ")} {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function AlertDialogAction({ className, variant = "default", ...props }: ComponentProps<typeof AlertDialogPrimitive.Action> & { variant?: string }) {
  return (
    <Button variant={variant} asChild>
      <AlertDialogPrimitive.Action data-slot="alert-dialog-action" className={className} {...props} />
    </Button>
  )
}
function AlertDialogCancel({ className, variant = "outline", ...props }: ComponentProps<typeof AlertDialogPrimitive.Cancel> & { variant?: string }) {
  return (
    <Button variant={variant} asChild>
      <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" className={className} {...props} />
    </Button>
  )
}

function PopoverContent({ className, align = "center", sideOffset = 4, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={["z-50 origin-(--radix-popover-content-transform-origin)", className].join(" ")}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function TooltipProvider({ delayDuration = 0, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />
}
function TooltipContent({ className, sideOffset = 0, children, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content data-slot="tooltip-content" sideOffset={sideOffset} className={["z-50", className].join(" ")} {...props}>
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 rotate-45" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

function HoverCardContent({ className, align = "center", sideOffset = 4, ...props }: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content data-slot="hover-card-content" align={align} sideOffset={sideOffset} className={["z-50 w-64", className].join(" ")} {...props} />
    </HoverCardPrimitive.Portal>
  )
}

useFakeTimers()

describe("overlay components written like upstream shadcn wrappers", () => {
  test("dialog: asChild trigger, close button, footer close and the slot attributes", async () => {
    const user = setupUser()
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Edit</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Make changes</DialogDescription>
          <DialogFooter showCloseButton>
            <Button>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
    const edit = screen.getByRole("button", { name: "Edit" })
    // The trigger's props reach the Button last, so its slot name wins like it does with Radix
    expect(edit.getAttribute("data-slot")).toBe("dialog-trigger")
    expect(edit.getAttribute("data-variant")).toBe("default")
    expect(edit.getAttribute("aria-haspopup")).toBe("dialog")
    await user.click(edit)
    await flush()
    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("data-slot")).toBe("dialog-content")
    expect(dialog.className).toContain("sm:max-w-sm")
    expect(document.querySelector("[data-slot=dialog-overlay]")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Edit profile" }).getAttribute("data-slot")).toBe("dialog-title")
    const close = screen.getByRole("button", { name: "Close" })
    expect(close.getAttribute("data-slot")).toBe("dialog-close")
    expect(close.getAttribute("data-variant")).toBe("ghost")
    expect(close.className).toContain("absolute")
    await user.click(close)
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(edit)
    await user.click(edit)
    await flush()
    await user.click(screen.getByRole("button", { name: "Dismiss" }))
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("dialog: no close button when asked, controlled like the command dialog", async () => {
    const user = setupUser()
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Command</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    await flush()
    expect(screen.getByRole("dialog")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByRole("dialog")).not.toBeNull()
  })

  test("sheet: side is a wrapper attribute and style, dir and class reach the content", async () => {
    const user = setupUser()
    render(
      <DialogPrimitive.Root>
        <DialogPrimitive.Trigger>Menu</DialogPrimitive.Trigger>
        <SheetContent side="left" dir="rtl" data-sidebar="sidebar" style={{ "--sidebar-width": "18rem" }} className="w-(--sidebar-width) [&>button]:hidden">
          <DialogPrimitive.Title>Sidebar</DialogPrimitive.Title>
        </SheetContent>
      </DialogPrimitive.Root>
    )
    await user.click(screen.getByRole("button", { name: "Menu" }))
    await flush()
    const sheet = screen.getByRole("dialog")
    expect(sheet.getAttribute("data-side")).toBe("left")
    expect(sheet.getAttribute("dir")).toBe("rtl")
    expect(sheet.getAttribute("data-sidebar")).toBe("sidebar")
    expect(sheet.style.getPropertyValue("--sidebar-width")).toBe("18rem")
    expect(sheet.className).toContain("[&>button]:hidden")
  })

  test("alert dialog: Action and Cancel wrapped in Button asChild", async () => {
    const user = setupUser()
    render(
      <AlertDialogPrimitive.Root>
        <AlertDialogPrimitive.Trigger asChild>
          <Button variant="destructive">Delete</Button>
        </AlertDialogPrimitive.Trigger>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay data-slot="alert-dialog-overlay" />
          <AlertDialogPrimitive.Content data-slot="alert-dialog-content" data-size="sm">
            <AlertDialogPrimitive.Title>Sure?</AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description>Cannot be undone</AlertDialogPrimitive.Description>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive">Delete it</AlertDialogAction>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    )
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await flush()
    const dialog = screen.getByRole("alertdialog")
    expect(dialog.getAttribute("data-size")).toBe("sm")
    const cancel = screen.getByRole("button", { name: "Cancel" })
    expect(document.activeElement).toBe(cancel)
    expect(cancel.getAttribute("data-slot")).toBe("alert-dialog-cancel")
    expect(cancel.getAttribute("data-variant")).toBe("outline")
    const action = screen.getByRole("button", { name: "Delete it" })
    expect(action.getAttribute("data-slot")).toBe("alert-dialog-action")
    expect(action.getAttribute("data-variant")).toBe("destructive")
    await user.click(action)
    await flush()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  test("popover: default align and sideOffset, class and the origin variable", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "anchor" })
    const user = setupUser()
    render(
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger asChild data-slot="popover-trigger">
          <Button data-testid="anchor">Open</Button>
        </PopoverPrimitive.Trigger>
        <PopoverContent className="w-72">
          <p>Dimensions</p>
        </PopoverContent>
      </PopoverPrimitive.Root>
    )
    const trigger = screen.getByRole("button", { name: "Open" })
    expect(trigger.getAttribute("data-slot")).toBe("popover-trigger")
    await user.click(trigger)
    await flush(50)
    const content = screen.getByRole("dialog")
    expect(content.getAttribute("data-slot")).toBe("popover-content")
    expect(content.className).toContain("origin-(--radix-popover-content-transform-origin)")
    expect(content.getAttribute("data-align")).toBe("center")
    expect(content.parentElement!.style.transform).toBe("translate(85px, 124px)")
  })

  test("tooltip: provider default delay, children plus a single arrow, hidden prop passes through", async () => {
    const user = setupUser()
    render(
      <TooltipProvider>
        <TooltipPrimitive.Root>
          <TooltipPrimitive.Trigger asChild>
            <Button>Save</Button>
          </TooltipPrimitive.Trigger>
          <TooltipContent hidden={false}>Saves the file</TooltipContent>
        </TooltipPrimitive.Root>
      </TooltipProvider>
    )
    const save = screen.getByRole("button", { name: "Save" })
    await user.hover(save)
    await flush()
    const tooltip = screen.getByRole("tooltip")
    expect(tooltip.textContent).toBe("Saves the file")
    expect(save.getAttribute("aria-describedby")).toBe(tooltip.id)
    const content = tooltip.parentElement!
    expect(content.getAttribute("data-slot")).toBe("tooltip-content")
    expect(content.getAttribute("data-state")).toBe("delayed-open")
    expect(content.querySelectorAll("svg")).toHaveLength(1)
  })

  test("tooltip and popover inside a dialog stay usable and Escape peels off one layer at a time", async () => {
    const user = setupUser()
    render(
      <TooltipProvider>
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Settings</DialogTitle>
            <TooltipPrimitive.Root>
              <TooltipPrimitive.Trigger asChild>
                <Button>Hint</Button>
              </TooltipPrimitive.Trigger>
              <TooltipContent>Helpful</TooltipContent>
            </TooltipPrimitive.Root>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    )
    await flush()
    await user.hover(screen.getByRole("button", { name: "Hint" }))
    await flush()
    expect(screen.getByRole("tooltip").closest("[inert]")).toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByRole("tooltip")).toBeNull()
    expect(screen.getByRole("dialog")).not.toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("hover card: openDelay and closeDelay props, wrapper defaults", async () => {
    const user = setupUser()
    render(
      <HoverCardPrimitive.Root openDelay={100} closeDelay={100}>
        <HoverCardPrimitive.Trigger asChild data-slot="hover-card-trigger">
          <a href="/u">@nextjs</a>
        </HoverCardPrimitive.Trigger>
        <HoverCardContent className="w-80">
          <p>The React Framework</p>
        </HoverCardContent>
      </HoverCardPrimitive.Root>
    )
    const link = screen.getByRole("link", { name: "@nextjs" })
    expect(link.getAttribute("data-slot")).toBe("hover-card-trigger")
    await user.hover(link)
    await flush(100)
    const content = screen.getByText("The React Framework").parentElement!
    expect(content.getAttribute("data-slot")).toBe("hover-card-content")
    expect(content.className).toContain("w-80")
    expect(content.getAttribute("data-align")).toBe("center")
    await user.unhover(link)
    await flush(100)
    expect(screen.queryByText("The React Framework")).toBeNull()
  })
})
