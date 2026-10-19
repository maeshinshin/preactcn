import { type ComponentProps } from "preact"
import { useState } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import * as ContextMenuPrimitive from "../src/radix/context-menu"
import * as DropdownMenuPrimitive from "../src/radix/dropdown-menu"
import * as MenubarPrimitive from "../src/radix/menubar"
import * as SelectPrimitive from "../src/radix/select"

// Wrappers written the way the pipeline turns the upstream shadcn components into Preact code: `pnpm typecheck` is the assertion
// that the shims accept what they pass (ComponentProps of a part, className, data-* props, inset and variant on items, side on
// the context menu, position and align on the select list)
const cn = (...values: unknown[]) => values.filter(Boolean).join(" ")
const Check = () => <svg data-icon="check" />

function DropdownMenu(props: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}
function DropdownMenuTrigger(props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}
function DropdownMenuPortal(props: ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}
function DropdownMenuContent({ className, align = "start", sideOffset = 4, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content data-slot="dropdown-menu-content" sideOffset={sideOffset} align={align} className={cn("z-50", className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  )
}
function DropdownMenuGroup(props: ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean; variant?: "default" | "destructive" }) {
  return <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item" data-inset={inset} data-variant={variant} className={cn("relative", className)} {...props} />
}
function DropdownMenuCheckboxItem({ className, children, checked, inset, ...props }: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.CheckboxItem data-slot="dropdown-menu-checkbox-item" data-inset={inset} className={cn("relative", className)} checked={checked} {...props}>
      <span data-slot="dropdown-menu-checkbox-item-indicator">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}
function DropdownMenuRadioGroup(props: ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}
function DropdownMenuRadioItem({ className, children, inset, ...props }: ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" data-inset={inset} className={cn("relative", className)} {...props}>
      <DropdownMenuPrimitive.ItemIndicator>
        <Check />
      </DropdownMenuPrimitive.ItemIndicator>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}
function DropdownMenuLabel({ className, inset, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" data-inset={inset} className={cn("px-1.5", className)} {...props} />
}
function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("-mx-1", className)} {...props} />
}
function DropdownMenuSub(props: ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}
function DropdownMenuSubTrigger({ className, inset, children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubTrigger data-slot="dropdown-menu-sub-trigger" data-inset={inset} className={cn("flex", className)} {...props}>
      {children}
      <Check />
    </DropdownMenuPrimitive.SubTrigger>
  )
}
function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return <DropdownMenuPrimitive.SubContent data-slot="dropdown-menu-sub-content" className={cn("z-50", className)} {...props} />
}

function ContextMenu(props: ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}
function ContextMenuTrigger({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" className={cn("select-none", className)} {...props} />
}
function ContextMenuContent({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Content> & { side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content data-slot="context-menu-content" className={cn("z-50", className)} {...props} />
    </ContextMenuPrimitive.Portal>
  )
}
function ContextMenuItem({ className, inset, variant = "default", ...props }: ComponentProps<typeof ContextMenuPrimitive.Item> & { inset?: boolean; variant?: "default" | "destructive" }) {
  return <ContextMenuPrimitive.Item data-slot="context-menu-item" data-inset={inset} data-variant={variant} className={cn("relative", className)} {...props} />
}

function Menubar({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Root>) {
  return <MenubarPrimitive.Root data-slot="menubar" className={cn("flex", className)} {...props} />
}
function MenubarMenu(props: ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />
}
function MenubarTrigger({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return <MenubarPrimitive.Trigger data-slot="menubar-trigger" className={cn("flex", className)} {...props} />
}
function MenubarPortal(props: ComponentProps<typeof MenubarPrimitive.Portal>) {
  return <MenubarPrimitive.Portal data-slot="menubar-portal" {...props} />
}
function MenubarContent({ className, align = "start", alignOffset = -4, sideOffset = 8, ...props }: ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPortal>
      <MenubarPrimitive.Content data-slot="menubar-content" align={align} alignOffset={alignOffset} sideOffset={sideOffset} className={cn("z-50", className)} {...props} />
    </MenubarPortal>
  )
}
function MenubarItem({ className, inset, variant = "default", ...props }: ComponentProps<typeof MenubarPrimitive.Item> & { inset?: boolean; variant?: "default" | "destructive" }) {
  return <MenubarPrimitive.Item data-slot="menubar-item" data-inset={inset} data-variant={variant} className={cn("relative", className)} {...props} />
}
function MenubarSub(props: ComponentProps<typeof MenubarPrimitive.Sub>) {
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />
}
function MenubarSubTrigger({ className, inset, children, ...props }: ComponentProps<typeof MenubarPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <MenubarPrimitive.SubTrigger data-slot="menubar-sub-trigger" data-inset={inset} className={cn("flex", className)} {...props}>
      {children}
    </MenubarPrimitive.SubTrigger>
  )
}
function MenubarSubContent({ className, ...props }: ComponentProps<typeof MenubarPrimitive.SubContent>) {
  return <MenubarPrimitive.SubContent data-slot="menubar-sub-content" className={cn("z-50", className)} {...props} />
}

function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}
function SelectGroup({ className, ...props }: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn("p-1", className)} {...props} />
}
function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}
function SelectTrigger({ className, size = "default", children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger> & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger data-slot="select-trigger" data-size={size} className={cn("flex", className)} {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <Check />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}
function SelectScrollUpButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton data-slot="select-scroll-up-button" className={cn("z-10", className)} {...props}>
      <Check />
    </SelectPrimitive.ScrollUpButton>
  )
}
function SelectScrollDownButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton data-slot="select-scroll-down-button" className={cn("z-10", className)} {...props}>
      <Check />
    </SelectPrimitive.ScrollDownButton>
  )
}
function SelectContent({ className, children, position = "item-aligned", align = "center", ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content data-slot="select-content" data-align-trigger={position === "item-aligned"} className={cn("relative z-50", position === "popper" && "translate-y-1", className)} position={position} align={align} {...props}>
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport data-position={position} className={cn("w-full", position === "popper" && "min-w-(--radix-select-trigger-width)")}>
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}
function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label data-slot="select-label" className={cn("px-1.5", className)} {...props} />
}
function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item data-slot="select-item" className={cn("relative", className)} {...props}>
      <span className="absolute">
        <SelectPrimitive.ItemIndicator>
          <Check />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={cn("-mx-1", className)} {...props} />
}

useFakeTimers()

describe("upstream-style menu wrappers", () => {
  test("a dropdown menu with every part opens, toggles a checkbox, picks a radio item and opens a submenu", async () => {
    const user = setupUser()
    function Menu() {
      const [bookmarks, setBookmarks] = useState(false)
      const [theme, setTheme] = useState("light")
      return (
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel inset>Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem inset variant="destructive">
                Delete
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={bookmarks} onCheckedChange={setBookmarks} onSelect={(event) => event.preventDefault()}>
                Bookmarks
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light" onSelect={(event) => event.preventDefault()}>
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" onSelect={(event) => event.preventDefault()}>
                Dark
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger inset>More</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>Export</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
    render(<Menu />)
    await user.click(screen.getByRole("button", { name: "Open" }))
    await flush(50)
    const content = screen.getByRole("menu")
    expect(content.getAttribute("data-slot")).toBe("dropdown-menu-content")
    expect(content.className).toBe("z-50 w-56")
    expect(content.getAttribute("data-align")).toBe("end")
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant")).toBe("destructive")
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-inset")).toBe("true")
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Bookmarks" }))
    expect(screen.getByRole("menuitemcheckbox", { name: "Bookmarks" }).getAttribute("aria-checked")).toBe("true")
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }))
    expect(screen.getByRole("menuitemradio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("menuitemradio", { name: "Light" }).getAttribute("aria-checked")).toBe("false")
    await user.click(screen.getByRole("menuitem", { name: "More" }))
    await flush(50)
    expect(screen.getByRole("menuitem", { name: "Export" })).not.toBeNull()
    expect(screen.getAllByRole("menu")).toHaveLength(2)
  })

  test("a context menu accepts a side prop and opens on right click", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger className="box">Right click here</ContextMenuTrigger>
        <ContextMenuContent side="top">
          <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
    const trigger = screen.getByText("Right click here")
    expect(trigger.getAttribute("data-slot")).toBe("context-menu-trigger")
    trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }))
    await flush(50)
    expect(screen.getByRole("menu").getAttribute("data-side")).toBe("top")
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant")).toBe("destructive")
  })

  test("a menubar with a submenu opens its menus", async () => {
    const user = setupUser()
    render(
      <Menubar className="bar">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem inset>New</MenubarItem>
            <MenubarSub>
              <MenubarSubTrigger inset>Share</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>Email</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    )
    expect(screen.getByRole("menubar").getAttribute("data-slot")).toBe("menubar")
    await user.click(screen.getByRole("menuitem", { name: "File" }))
    await flush(50)
    expect(screen.getByRole("menu").getAttribute("data-slot")).toBe("menubar-content")
    await user.click(screen.getByRole("menuitem", { name: "Share" }))
    await flush(50)
    expect(screen.getByRole("menuitem", { name: "Email" })).not.toBeNull()
  })

  test.each([["item-aligned"], ["popper"]] as const)("a select with %s position shows the choice and keeps the wrapper's props", async (position) => {
    const user = setupUser()
    render(
      <Select defaultValue="b">
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent position={position}>
          <SelectGroup>
            <SelectLabel>Letters</SelectLabel>
            <SelectItem value="a">Alpha</SelectItem>
            <SelectItem value="b">Beta</SelectItem>
            <SelectItem value="c" disabled>
              Gamma
            </SelectItem>
          </SelectGroup>
          <SelectSeparator />
        </SelectContent>
      </Select>
    )
    await flush()
    const trigger = screen.getByRole("combobox")
    expect(trigger.getAttribute("data-size")).toBe("sm")
    expect(trigger.textContent).toContain("Beta")
    await user.pointer({ keys: "[MouseLeft>]", target: trigger })
    await flush(50)
    const list = screen.getByRole("listbox")
    expect(list.getAttribute("data-slot")).toBe("select-content")
    expect(list.getAttribute("data-align-trigger")).toBe(String(position === "item-aligned"))
    expect(screen.getByRole("option", { name: "Beta" }).getAttribute("data-slot")).toBe("select-item")
    expect(screen.getByText("Letters").getAttribute("data-slot")).toBe("select-label")
  })
})
