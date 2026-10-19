// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import type { RefObject } from "preact"
import { useLayoutEffect, useRef, useState } from "preact/hooks"
import { useDirection, type Direction } from "./direction"
import { composeEventHandlers } from "./internal/compose-event-handlers"
import { useComposedRefs } from "./internal/compose-refs"
import { createStrictContext } from "./internal/create-context"
import { forwardRef } from "./internal/forward-ref"
import { Primitive, type PrimitiveProps, type PrimitiveWith } from "./internal/primitive"
import { mergeStyles } from "./internal/style"
import { useControllableState } from "./internal/use-controllable-state"
import { useSize } from "./internal/use-size"

type Orientation = "horizontal" | "vertical"

const PAGE_KEYS = ["PageUp", "PageDown"]
const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]

const [SliderProvider, useSliderContext] = createStrictContext<{
  min: number
  max: number
  disabled: boolean
  values: number[]
  orientation: Orientation
  rootRef: RefObject<HTMLElement | null>
  valueIndexToChangeRef: RefObject<number>
  startEdge: "left" | "right" | "bottom"
  endEdge: "left" | "right" | "top"
  direction: 1 | -1
  size: "width" | "height"
}>("Slider")

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function linearScale(input: [number, number], output: [number, number]) {
  return (value: number) => {
    if (input[0] === input[1] || output[0] === output[1]) return output[0]
    return output[0] + ((output[1] - output[0]) / (input[1] - input[0])) * (value - input[0])
  }
}

const convertValueToPercentage = (value: number, min: number, max: number) => clamp((100 / (max - min)) * (value - min), 0, 100)

function getClosestValueIndex(values: number[], nextValue: number) {
  const distances = values.map((value) => Math.abs(value - nextValue))
  return distances.indexOf(Math.min(...distances))
}

function getLabel(index: number, totalValues: number) {
  if (totalValues > 2) return `Value ${index + 1} of ${totalValues}`
  if (totalValues === 2) return ["Minimum", "Maximum"][index]
}

// Keeps the thumb inside the track at both ends instead of overflowing by half its size
function getThumbInBoundsOffset(width: number, left: number, direction: number) {
  const halfWidth = width / 2
  return (halfWidth - linearScale([0, 50], [0, halfWidth])(left) * direction) * direction
}

const getDecimalCount = (value: number) => (String(value).split(".")[1] || "").length

// shortcut: no `inverted`, `minStepsBetweenThumbs`, `onValueCommit`, `name`/`form` hidden input; add them if a caller needs them
const Slider = forwardRef<
  PrimitiveWith<
    "span",
    {
      min?: number
      max?: number
      step?: number
      orientation?: Orientation
      disabled?: boolean
      dir?: Direction
      value?: number[]
      defaultValue?: number[]
      onValueChange?(value: number[]): void
    }
  >
>(({ min = 0, max = 100, step = 1, orientation = "horizontal", disabled = false, dir, defaultValue = [min], value, onValueChange, ...sliderProps }, forwardedRef) => {
  const rootRef = useRef<HTMLSpanElement>(null)
  const composedRefs = useComposedRefs(forwardedRef, rootRef)
  const valueIndexToChangeRef = useRef(0)
  const direction = useDirection(dir)
  const isHorizontal = orientation === "horizontal"
  // Horizontal sliders start at the left (right in rtl), vertical ones at the bottom
  const fromStart = !isHorizontal || direction === "ltr"
  const [values, setValues] = useControllableState({
    prop: value,
    defaultProp: defaultValue,
    onChange: (next) => {
      rootRef.current?.querySelectorAll<HTMLElement>('[role="slider"]')[valueIndexToChangeRef.current!]?.focus()
      onValueChange?.(next)
    },
  })

  function updateValues(nextRaw: number, atIndex: number) {
    const decimals = getDecimalCount(step)
    const rounder = 10 ** decimals
    const snapped = Math.round((Math.round((nextRaw - min) / step) * step + min) * rounder) / rounder
    const nextValue = clamp(snapped, min, max)
    setValues((prev) => {
      const next = [...prev]
      next[atIndex] = nextValue
      next.sort((a, b) => a - b)
      valueIndexToChangeRef.current = next.indexOf(nextValue)
      return String(next) === String(prev) ? prev : next
    })
  }

  function getValueFromPointer(event: PointerEvent) {
    const rect = rootRef.current!.getBoundingClientRect()
    const position = isHorizontal ? event.clientX - rect.left : event.clientY - rect.top
    const length = isHorizontal ? rect.width : rect.height
    const reversed = isHorizontal ? !fromStart : fromStart
    return linearScale([0, length], reversed ? [max, min] : [min, max])(position)
  }

  return (
    <SliderProvider
      value={{
        min,
        max,
        disabled,
        values,
        orientation,
        rootRef,
        valueIndexToChangeRef,
        startEdge: isHorizontal ? (fromStart ? "left" : "right") : "bottom",
        endEdge: isHorizontal ? (fromStart ? "right" : "left") : "top",
        direction: fromStart ? 1 : -1,
        size: isHorizontal ? "width" : "height",
      }}
    >
      <Primitive.span
        dir={isHorizontal ? direction : undefined}
        aria-disabled={disabled}
        data-disabled={disabled ? "" : undefined}
        data-orientation={orientation}
        {...sliderProps}
        ref={composedRefs}
        style={mergeStyles(sliderProps.style, { "--radix-slider-thumb-transform": isHorizontal ? "translateX(-50%)" : "translateY(50%)" })}
        onKeyDown={composeEventHandlers(sliderProps.onKeyDown, (event) => {
          if (disabled) return
          const atIndex = valueIndexToChangeRef.current!
          if (event.key === "Home") updateValues(min, 0)
          else if (event.key === "End") updateValues(max, values.length - 1)
          else if (PAGE_KEYS.concat(ARROW_KEYS).includes(event.key)) {
            const backKeys = ["PageDown", "ArrowDown", isHorizontal && direction === "rtl" ? "ArrowRight" : "ArrowLeft"]
            const multiplier = PAGE_KEYS.includes(event.key) || (event.shiftKey && ARROW_KEYS.includes(event.key)) ? 10 : 1
            updateValues(values[atIndex]! + step * multiplier * (backKeys.includes(event.key) ? -1 : 1), atIndex)
          } else return
          event.preventDefault()
        })}
        onPointerDown={composeEventHandlers(sliderProps.onPointerDown, (event) => {
          if (disabled) return
          const target = event.target as HTMLElement
          target.setPointerCapture(event.pointerId)
          // Focus is moved to a thumb manually whenever the values change
          event.preventDefault()
          if (target.matches('[role="slider"]')) target.focus()
          else {
            const nextValue = getValueFromPointer(event)
            updateValues(nextValue, getClosestValueIndex(values, nextValue))
          }
        })}
        onPointerMove={composeEventHandlers(sliderProps.onPointerMove, (event) => {
          if (!disabled && (event.target as HTMLElement).hasPointerCapture(event.pointerId)) {
            updateValues(getValueFromPointer(event), valueIndexToChangeRef.current!)
          }
        })}
      />
    </SliderProvider>
  )
})

const SliderTrack = forwardRef<PrimitiveProps<"span">>((props, ref) => {
  const context = useSliderContext("SliderTrack")
  return <Primitive.span data-disabled={context.disabled ? "" : undefined} data-orientation={context.orientation} {...props} ref={ref} />
})

const SliderRange = forwardRef<PrimitiveProps<"span">>((props, ref) => {
  const context = useSliderContext("SliderRange")
  const percentages = context.values.map((value) => convertValueToPercentage(value, context.min, context.max))
  const offsetStart = context.values.length > 1 ? Math.min(...percentages) : 0
  const offsetEnd = 100 - Math.max(...percentages)
  return (
    <Primitive.span
      data-orientation={context.orientation}
      data-disabled={context.disabled ? "" : undefined}
      {...props}
      ref={ref}
      style={mergeStyles(props.style, { [context.startEdge]: `${offsetStart}%`, [context.endEdge]: `${offsetEnd}%` })}
    />
  )
})

const SliderThumb = forwardRef<PrimitiveProps<"span">>((props, forwardedRef) => {
  const context = useSliderContext("SliderThumb")
  const [thumb, setThumb] = useState<HTMLElement | null>(null)
  const composedRefs = useComposedRefs(forwardedRef, setThumb)
  const [index, setIndex] = useState(-1)
  const size = useSize(thumb)

  // Thumbs are numbered by their DOM order inside the slider
  useLayoutEffect(() => {
    const thumbs = Array.from(context.rootRef.current?.querySelectorAll('[role="slider"]') ?? [])
    setIndex(thumb ? thumbs.indexOf(thumb) : -1)
  }, [thumb, context.values.length, context.rootRef])

  const value = context.values[index]
  const percent = value === undefined ? 0 : convertValueToPercentage(value, context.min, context.max)
  const thumbSize = size?.[context.size]
  const offset = thumbSize ? getThumbInBoundsOffset(thumbSize, percent, context.direction) : 0

  return (
    <span
      style={{
        transform: "var(--radix-slider-thumb-transform)",
        position: "absolute",
        [context.startEdge]: `calc(${percent}% + ${offset}px)`,
      }}
    >
      <Primitive.span
        role="slider"
        data-radix-collection-item=""
        aria-label={props["aria-label"] || getLabel(index, context.values.length)}
        aria-valuemin={context.min}
        aria-valuenow={value}
        aria-valuemax={context.max}
        aria-orientation={context.orientation}
        data-orientation={context.orientation}
        data-disabled={context.disabled ? "" : undefined}
        tabIndex={context.disabled ? undefined : 0}
        {...props}
        ref={composedRefs}
        style={value === undefined ? { display: "none" } : props.style}
        onFocus={composeEventHandlers(props.onFocus, () => {
          context.valueIndexToChangeRef.current = index
        })}
      />
    </span>
  )
})

export { Slider as Root, SliderTrack as Track, SliderRange as Range, SliderThumb as Thumb }
