// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import type { ComponentChildren, ComponentProps } from "preact"
import { useCallback, useEffect, useId, useRef, useState } from "preact/hooks"
import { useDirection, type Direction } from "./direction"
import { createCollection } from "./internal/collection"
import { composeEventHandlers } from "./internal/compose-event-handlers"
import { useComposedRefs } from "./internal/compose-refs"
import { createStrictContext } from "./internal/create-context"
import { forwardRef } from "./internal/forward-ref"
import * as MenuPrimitive from "./internal/menu"
import { Primitive, type PrimitiveWith } from "./internal/primitive"
import { useControllableState } from "./internal/use-controllable-state"
import { wrapArray } from "./internal/typeahead"

const Collection = createCollection<{ value: string; disabled: boolean }>()

const [MenubarProvider, useMenubarContext] = createStrictContext<{
  value: string
  onMenuOpen(value: string): void
  onMenuClose(): void
  onMenuToggle(value: string): void
  dir: Direction
  loop: boolean
  // The trigger that stays in the tab order; null until one has been focused, so all of them are reachable at first
  tabStop: string | null
  onTabStopChange(value: string): void
}>("Menubar")

const [MenubarMenuProvider, useMenubarMenuContext] = createStrictContext<{
  value: string
  triggerId: string
  triggerRef: { current: HTMLElement | null }
  contentId: string
  wasKeyboardTriggerOpenRef: { current: boolean }
}>("MenubarMenu")

// shortcut: Radix's roving focus is reduced to arrows, Home and End between triggers (no PageUp/PageDown, no group tab stop that
// forwards focus); add them if the bar needs the full roving focus behavior
const Menubar = forwardRef<PrimitiveWith<"div", { value?: string; defaultValue?: string; onValueChange?(value: string): void; loop?: boolean; dir?: Direction }>>(
  ({ value: valueProp, onValueChange, defaultValue, loop = true, dir, ...menubarProps }, forwardedRef) => {
    const direction = useDirection(dir)
    const [value, setValue] = useControllableState({ prop: valueProp, onChange: onValueChange, defaultProp: defaultValue ?? "" })
    const [tabStop, setTabStop] = useState<string | null>(null)
    return (
      <MenubarProvider
        value={{
          value,
          onMenuOpen: useCallback(
            (value: string) => {
              setValue(value)
              setTabStop(value)
            },
            [setValue]
          ),
          onMenuClose: useCallback(() => setValue(""), [setValue]),
          onMenuToggle: useCallback(
            (value: string) => {
              setValue((prevValue) => (prevValue ? "" : value))
              setTabStop(value)
            },
            [setValue]
          ),
          dir: direction,
          loop,
          tabStop,
          onTabStopChange: setTabStop,
        }}
      >
        <Collection.Provider>
          <Collection.Slot>
            <Primitive.div role="menubar" {...menubarProps} ref={forwardedRef} />
          </Collection.Slot>
        </Collection.Provider>
      </MenubarProvider>
    )
  }
)

function MenubarMenu({ value: valueProp, children }: { value?: string; children?: ComponentChildren }) {
  const autoValue = useId()
  const value = valueProp || autoValue
  const context = useMenubarContext("MenubarMenu")
  const triggerRef = useRef<HTMLElement | null>(null)
  const wasKeyboardTriggerOpenRef = useRef(false)
  const open = context.value === value

  useEffect(() => {
    if (!open) wasKeyboardTriggerOpenRef.current = false
  }, [open])

  return (
    <MenubarMenuProvider value={{ value, triggerId: useId(), triggerRef, contentId: useId(), wasKeyboardTriggerOpenRef }}>
      <MenuPrimitive.Root
        name="menubar"
        open={open}
        // The menu only reports closing, and the bar closes the same way when Escape or a click outside dismisses it
        onOpenChange={(open) => {
          if (!open) context.onMenuClose()
        }}
        modal={false}
        dir={context.dir}
      >
        {children}
      </MenuPrimitive.Root>
    </MenubarMenuProvider>
  )
}

const MenubarTrigger = forwardRef<PrimitiveWith<"button", { disabled?: boolean }>>(({ disabled = false, ...triggerProps }, forwardedRef) => {
  const context = useMenubarContext("MenubarTrigger")
  const menuContext = useMenubarMenuContext("MenubarTrigger")
  const getItems = Collection.useCollection()
  const ref = useRef<HTMLElement | null>(null)
  const composedRefs = useComposedRefs(forwardedRef, ref, menuContext.triggerRef)
  const [isFocused, setIsFocused] = useState(false)
  const open = context.value === menuContext.value

  const moveFocus = (key: string) => {
    const triggers = getItems()
      .filter((item) => !item.disabled)
      .map((item) => item.ref.current!)
    const isStart = key === "ArrowLeft" || key === "End"
    const ordered = isStart ? [...triggers].reverse() : triggers
    const next = key.startsWith("Arrow") ? ordered.indexOf(ref.current!) + 1 : 0
    const candidates = context.loop && next > 0 ? wrapArray(ordered, next) : ordered.slice(next)
    candidates[0]?.focus()
  }

  return (
    <Collection.ItemSlot value={menuContext.value} disabled={disabled}>
      <MenuPrimitive.Anchor asChild>
        <Primitive.button
          type="button"
          role="menuitem"
          id={menuContext.triggerId}
          tabIndex={context.tabStop === null || context.tabStop === menuContext.value ? 0 : -1}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuContext.contentId : undefined}
          data-highlighted={isFocused ? "" : undefined}
          data-state={open ? "open" : "closed"}
          data-disabled={disabled ? "" : undefined}
          disabled={disabled}
          {...triggerProps}
          ref={composedRefs}
          onPointerDown={composeEventHandlers(triggerProps.onPointerDown, (event) => {
            // Only the left button, and not ctrl+click, which is a right click on macOS
            if (!disabled && event.button === 0 && event.ctrlKey === false) {
              context.onMenuOpen(menuContext.value)
              // Opening must not focus the trigger, so the content can take focus without competition
              if (!open) event.preventDefault()
            }
          })}
          onPointerEnter={composeEventHandlers(triggerProps.onPointerEnter, () => {
            // While one menu is open, hovering another trigger switches to it
            if (context.value && !open) {
              context.onMenuOpen(menuContext.value)
              ref.current?.focus()
            }
          })}
          onKeyDown={composeEventHandlers(triggerProps.onKeyDown, (event) => {
            if (disabled) return
            if (["Enter", " "].includes(event.key)) context.onMenuToggle(menuContext.value)
            if (event.key === "ArrowDown") context.onMenuOpen(menuContext.value)
            // Keeps the key from scrolling the page and from reaching the first item once it has focus
            if (["Enter", " ", "ArrowDown"].includes(event.key)) {
              menuContext.wasKeyboardTriggerOpenRef.current = true
              event.preventDefault()
            }
            const key = context.dir === "rtl" ? { ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" }[event.key] ?? event.key : event.key
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(key) && !(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) {
              event.preventDefault()
              moveFocus(key)
            }
          })}
          onFocus={composeEventHandlers(triggerProps.onFocus, () => {
            setIsFocused(true)
            context.onTabStopChange(menuContext.value)
          })}
          onBlur={composeEventHandlers(triggerProps.onBlur, () => setIsFocused(false))}
        />
      </MenuPrimitive.Anchor>
    </Collection.ItemSlot>
  )
})

type MenubarContentProps = Omit<MenuPrimitive.MenuContentProps, "onEntryFocus">

const MenubarContent = forwardRef<MenubarContentProps>(({ align = "start", ...props }, forwardedRef) => {
  const context = useMenubarContext("MenubarContent")
  const menuContext = useMenubarMenuContext("MenubarContent")
  const getItems = Collection.useCollection()
  const hasInteractedOutsideRef = useRef(false)
  return (
    <MenuPrimitive.Content
      id={menuContext.contentId}
      aria-labelledby={menuContext.triggerId}
      data-radix-menubar-content=""
      {...props}
      ref={forwardedRef}
      align={align}
      onCloseAutoFocus={composeEventHandlers(props.onCloseAutoFocus, (event) => {
        // Switching to another menu keeps the bar open: that menu, not this trigger, gets the focus
        if (!context.value && !hasInteractedOutsideRef.current) menuContext.triggerRef.current?.focus()
        hasInteractedOutsideRef.current = false
        event.preventDefault()
      })}
      onFocusOutside={composeEventHandlers(props.onFocusOutside, (event) => {
        // A trigger takes care of its own focus: moving there must not dismiss
        if (getItems().some((item) => item.ref.current?.contains(event.target as Node))) event.preventDefault()
      })}
      onInteractOutside={composeEventHandlers(props.onInteractOutside, () => {
        hasInteractedOutsideRef.current = true
      })}
      // A menu opened by a key on its trigger highlights its first item; one reached by switching or by the pointer does not
      onEntryFocus={(event) => {
        if (!menuContext.wasKeyboardTriggerOpenRef.current) event.preventDefault()
      }}
      onKeyDown={composeEventHandlers(
        props.onKeyDown,
        (event) => {
          if (!["ArrowRight", "ArrowLeft"].includes(event.key)) return
          const target = event.target as HTMLElement
          const targetIsSubTrigger = target.hasAttribute("data-radix-menubar-subtrigger")
          const isKeyDownInsideSubMenu = target.closest("[data-radix-menubar-content]") !== event.currentTarget
          const isPrevKey = (context.dir === "rtl" ? "ArrowRight" : "ArrowLeft") === event.key
          // ArrowRight on a submenu trigger opens the submenu, and ArrowLeft inside a submenu closes it
          if ((!isPrevKey && targetIsSubTrigger) || (isKeyDownInsideSubMenu && isPrevKey)) return
          const values = getItems()
            .filter((item) => !item.disabled)
            .map((item) => item.value)
          if (isPrevKey) values.reverse()
          const next = values.indexOf(menuContext.value) + 1
          const [nextValue] = context.loop ? wrapArray(values, next) : values.slice(next)
          if (nextValue) context.onMenuOpen(nextValue)
        },
        { checkForDefaultPrevented: false }
      )}
    />
  )
})

const MenubarSubTrigger = forwardRef<ComponentProps<typeof MenuPrimitive.SubTrigger>>((props, ref) => (
  <MenuPrimitive.SubTrigger data-radix-menubar-subtrigger="" {...props} ref={ref} />
))

const MenubarSubContent = forwardRef<ComponentProps<typeof MenuPrimitive.SubContent>>((props, ref) => (
  <MenuPrimitive.SubContent data-radix-menubar-content="" {...props} ref={ref} />
))

export { Menubar as Root, MenubarMenu as Menu, MenubarTrigger as Trigger, MenubarContent as Content, MenubarSubTrigger as SubTrigger, MenubarSubContent as SubContent }
export { Portal, Group, Label, Item, CheckboxItem, RadioGroup, RadioItem, ItemIndicator, Separator, Sub } from "./internal/menu"
export type { MenubarContentProps }
