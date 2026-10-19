// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import { useEffect, useRef } from "preact/hooks"
import { useDirection, type Direction } from "./direction"
import { BubbleInput, useFormControl } from "./internal/bubble-input"
import { composeEventHandlers } from "./internal/compose-event-handlers"
import { createStrictContext } from "./internal/create-context"
import { forwardRef } from "./internal/forward-ref"
import { Presence } from "./internal/presence"
import { Primitive, type PrimitiveProps, type PrimitiveWith } from "./internal/primitive"
import * as RovingFocusGroup from "./internal/roving-focus"
import { useControllableState } from "./internal/use-controllable-state"

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]

const [RadioGroupProvider, useRadioGroupContext] = createStrictContext<{
  name?: string
  required?: boolean
  disabled: boolean
  value: string | null
  onValueChange(value: string): void
}>("RadioGroup")
const [RadioProvider, useRadioContext] = createStrictContext<{ checked: boolean; disabled?: boolean }>("RadioGroupItem")

// shortcut: no `loop` or `orientation` props on the group (always looping, both arrow axes); add them if a caller needs them
const RadioGroup = forwardRef<
  PrimitiveWith<
    "div",
    {
      name?: string
      required?: boolean
      disabled?: boolean
      dir?: Direction
      defaultValue?: string
      value?: string | null
      onValueChange?(value: string): void
    }
  >
>(({ defaultValue, value: valueProp, name, required = false, disabled = false, dir, onValueChange, ...groupProps }, ref) => {
  const direction = useDirection(dir)
  const [value, setValue] = useControllableState<string | null>({
    prop: valueProp,
    defaultProp: defaultValue ?? null,
    onChange: onValueChange as (value: string | null) => void,
  })
  return (
    <RadioGroupProvider value={{ name, required, disabled, value, onValueChange: setValue }}>
      <RovingFocusGroup.Root asChild dir={direction} loop>
        <Primitive.div
          role="radiogroup"
          aria-required={required}
          data-disabled={disabled ? "" : undefined}
          dir={direction}
          {...groupProps}
          ref={ref}
        />
      </RovingFocusGroup.Root>
    </RadioGroupProvider>
  )
})

const RadioGroupItem = forwardRef<PrimitiveWith<"button", { value: string; disabled?: boolean }>>(
  ({ value, disabled, ...itemProps }, forwardedRef) => {
    const context = useRadioGroupContext("RadioGroupItem")
    const isDisabled = context.disabled || disabled
    const checked = context.value === value
    const isArrowKeyPressed = useRef(false)
    const { control, ref, isFormControl } = useFormControl(forwardedRef)

    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (ARROW_KEYS.includes(event.key)) isArrowKeyPressed.current = true
      }
      // Deferred so a keyup that arrives before the roving focus move (which runs in a timeout) does not lose the arrow state
      const handleKeyUp = () => {
        setTimeout(() => {
          isArrowKeyPressed.current = false
        })
      }
      document.addEventListener("keydown", handleKeyDown)
      document.addEventListener("keyup", handleKeyUp)
      return () => {
        document.removeEventListener("keydown", handleKeyDown)
        document.removeEventListener("keyup", handleKeyUp)
      }
    }, [])

    return (
      <RadioProvider value={{ checked, disabled: isDisabled }}>
        <RovingFocusGroup.Item asChild focusable={!isDisabled} active={checked}>
          <Primitive.button
            type="button"
            role="radio"
            aria-checked={checked}
            data-state={checked ? "checked" : "unchecked"}
            data-disabled={isDisabled ? "" : undefined}
            disabled={isDisabled}
            value={value}
            {...itemProps}
            ref={ref}
            onClick={composeEventHandlers(itemProps.onClick, () => {
              if (!checked) context.onValueChange(value)
            })}
            onKeyDown={composeEventHandlers(itemProps.onKeyDown, (event) => {
              // According to WAI ARIA, radio groups don't activate items on enter keypress
              if (event.key === "Enter") event.preventDefault()
            })}
            onFocus={composeEventHandlers(itemProps.onFocus, (event) => {
              // Arrow keys move focus through the roving group; click to check
              if (isArrowKeyPressed.current) event.currentTarget.click()
            })}
          />
        </RovingFocusGroup.Item>
        {isFormControl && (
          <BubbleInput type="radio" control={control} checked={checked} name={context.name} value={value} required={context.required} disabled={isDisabled} />
        )}
      </RadioProvider>
    )
  }
)

const RadioGroupIndicator = forwardRef<PrimitiveProps<"span">>((props, ref) => {
  const context = useRadioContext("RadioGroupIndicator")
  return (
    <Presence present={context.checked}>
      <Primitive.span
        data-state={context.checked ? "checked" : "unchecked"}
        data-disabled={context.disabled ? "" : undefined}
        {...props}
        ref={ref}
      />
    </Presence>
  )
})

export { RadioGroup as Root, RadioGroupItem as Item, RadioGroupIndicator as Indicator }
