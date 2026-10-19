// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import { useCallback } from "preact/hooks"
import { useDirection, type Direction } from "./direction"
import { createStrictContext } from "./internal/create-context"
import { forwardRef } from "./internal/forward-ref"
import { Primitive, type PrimitiveWith } from "./internal/primitive"
import * as RovingFocusGroup from "./internal/roving-focus"
import { useControllableState } from "./internal/use-controllable-state"
import { Root as Toggle, type ToggleProps } from "./toggle"

const [ToggleGroupProvider, useToggleGroupContext] = createStrictContext<{
  type: "single" | "multiple"
  value: string[]
  onItemActivate(value: string): void
  onItemDeactivate(value: string): void
}>("ToggleGroup")

type ToggleGroupImplProps = PrimitiveWith<"div", { orientation?: "horizontal" | "vertical"; dir?: Direction }>
type ToggleGroupSingleProps = ToggleGroupImplProps & {
  type: "single"
  value?: string
  defaultValue?: string
  onValueChange?(value: string): void
}
type ToggleGroupMultipleProps = ToggleGroupImplProps & {
  type: "multiple"
  value?: string[]
  defaultValue?: string[]
  onValueChange?(value: string[]): void
}

// shortcut: no `disabled`, `rovingFocus` or `loop` props on the group (always roving and looping); add them if a caller needs them
const ToggleGroupImpl = forwardRef<ToggleGroupImplProps>(({ orientation, dir, ...toggleGroupProps }, ref) => {
  const direction = useDirection(dir)
  return (
    <RovingFocusGroup.Root asChild orientation={orientation} dir={direction} loop>
      <Primitive.div role="group" dir={direction} {...toggleGroupProps} ref={ref} />
    </RovingFocusGroup.Root>
  )
})

const ToggleGroupImplSingle = forwardRef<Omit<ToggleGroupSingleProps, "type">>(({ value: valueProp, defaultValue, onValueChange, ...props }, ref) => {
  const [value, setValue] = useControllableState({ prop: valueProp, defaultProp: defaultValue ?? "", onChange: onValueChange })
  return (
    <ToggleGroupProvider
      value={{
        type: "single",
        value: value ? [value] : [],
        onItemActivate: setValue,
        onItemDeactivate: useCallback(() => setValue(""), [setValue]),
      }}
    >
      <ToggleGroupImpl role="radiogroup" {...props} ref={ref} />
    </ToggleGroupProvider>
  )
})

const ToggleGroupImplMultiple = forwardRef<Omit<ToggleGroupMultipleProps, "type">>(({ value: valueProp, defaultValue, onValueChange, ...props }, ref) => {
  const [value, setValue] = useControllableState({ prop: valueProp, defaultProp: defaultValue ?? [], onChange: onValueChange })
  return (
    <ToggleGroupProvider
      value={{
        type: "multiple",
        value,
        onItemActivate: (itemValue) => setValue((prev) => [...prev, itemValue]),
        onItemDeactivate: (itemValue) => setValue((prev) => prev.filter((v) => v !== itemValue)),
      }}
    >
      <ToggleGroupImpl role="toolbar" {...props} ref={ref} />
    </ToggleGroupProvider>
  )
})

const ToggleGroup = forwardRef<ToggleGroupSingleProps | ToggleGroupMultipleProps>(({ type, ...props }, ref) => {
  if (type === "single") return <ToggleGroupImplSingle {...(props as Omit<ToggleGroupSingleProps, "type">)} ref={ref} />
  if (type === "multiple") return <ToggleGroupImplMultiple {...(props as Omit<ToggleGroupMultipleProps, "type">)} ref={ref} />
  throw new Error("Missing prop `type` expected on `ToggleGroup`")
})

type ToggleGroupItemProps = Omit<ToggleProps, "pressed" | "defaultPressed" | "onPressedChange"> & { value: string }

const ToggleGroupItem = forwardRef<ToggleGroupItemProps>(({ value, ...itemProps }, ref) => {
  const context = useToggleGroupContext("ToggleGroupItem")
  const pressed = context.value.includes(value)
  const typeProps = context.type === "single" ? ({ role: "radio", "aria-checked": pressed, "aria-pressed": undefined } as const) : undefined

  return (
    <RovingFocusGroup.Item asChild focusable={!itemProps.disabled} active={pressed}>
      <Toggle
        {...typeProps}
        {...itemProps}
        ref={ref}
        pressed={pressed}
        onPressedChange={(next) => (next ? context.onItemActivate(value) : context.onItemDeactivate(value))}
      />
    </RovingFocusGroup.Item>
  )
})

export { ToggleGroup as Root, ToggleGroupItem as Item }
