// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import { composeEventHandlers } from "./internal/compose-event-handlers"
import { forwardRef } from "./internal/forward-ref"
import { Primitive, type PrimitiveWith } from "./internal/primitive"
import { useControllableState } from "./internal/use-controllable-state"

type ToggleProps = PrimitiveWith<
  "button",
  { pressed?: boolean; defaultPressed?: boolean; disabled?: boolean; onPressedChange?(pressed: boolean): void }
>

const Toggle = forwardRef<ToggleProps>(({ pressed: pressedProp, defaultPressed, onPressedChange, ...buttonProps }, ref) => {
  const [pressed, setPressed] = useControllableState({
    prop: pressedProp,
    onChange: onPressedChange,
    defaultProp: defaultPressed ?? false,
  })

  return (
    <Primitive.button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      data-disabled={buttonProps.disabled ? "" : undefined}
      {...buttonProps}
      ref={ref}
      onClick={composeEventHandlers(buttonProps.onClick, () => {
        if (!buttonProps.disabled) setPressed(!pressed)
      })}
    />
  )
})

export { Toggle as Root }
export type { ToggleProps }
