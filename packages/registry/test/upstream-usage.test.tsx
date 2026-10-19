import { type ComponentProps } from "preact"
import { useMemo } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import * as AccordionPrimitive from "../src/radix/accordion"
import * as CheckboxPrimitive from "../src/radix/checkbox"
import * as CollapsiblePrimitive from "../src/radix/collapsible"
import * as ProgressPrimitive from "../src/radix/progress"
import * as RadioGroupPrimitive from "../src/radix/radio-group"
import * as ScrollAreaPrimitive from "../src/radix/scroll-area"
import * as SliderPrimitive from "../src/radix/slider"
import * as SwitchPrimitive from "../src/radix/switch"
import * as TabsPrimitive from "../src/radix/tabs"
import * as ToggleGroupPrimitive from "../src/radix/toggle-group"
import * as Slot from "../src/radix/slot"

// Wrappers written the way the pipeline turns the upstream shadcn components into Preact code
function Checkbox({ class: classProp, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root data-slot="checkbox" class={["peer", classProp].join(" ")} {...props}>
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">✓</CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

function Switch({ size = "default", ...props }: ComponentProps<typeof SwitchPrimitive.Root> & { size?: "sm" | "default" }) {
  return (
    <SwitchPrimitive.Root data-slot="switch" data-size={size} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" />
    </SwitchPrimitive.Root>
  )
}

function Progress({ value, ...props }: ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root data-slot="progress" {...props}>
      <ProgressPrimitive.Indicator style={{ transform: `translateX(-${100 - (value || 0)}%)` }} />
    </ProgressPrimitive.Root>
  )
}

function Slider({ defaultValue, value, min = 0, max = 100, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  const values = useMemo(() => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]), [value, defaultValue, min, max])
  return (
    <SliderPrimitive.Root data-slot="slider" defaultValue={defaultValue} value={value} min={min} max={max} {...props}>
      <SliderPrimitive.Track>
        <SliderPrimitive.Range />
      </SliderPrimitive.Track>
      {Array.from({ length: values.length }, (_, index) => (
        <SliderPrimitive.Thumb key={index} />
      ))}
    </SliderPrimitive.Root>
  )
}

function ScrollArea({ children, ...props }: ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root data-slot="scroll-area" {...props}>
      <ScrollAreaPrimitive.Viewport>{children}</ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({ orientation = "vertical", ...props }: ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar data-orientation={orientation} orientation={orientation} {...props}>
      <ScrollAreaPrimitive.ScrollAreaThumb />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

function Collapsible(props: ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger(props: ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return <CollapsiblePrimitive.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />
}

function CollapsibleContent(props: ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return <CollapsiblePrimitive.CollapsibleContent data-slot="collapsible-content" {...props} />
}

describe("components written like upstream shadcn wrappers", () => {
  test("checkbox, switch and progress", async () => {
    const user = userEvent.setup()
    render(
      <div>
        <Checkbox aria-label="c" class="extra" />
        <Switch aria-label="s" size="sm" />
        <Progress value={40} />
      </div>
    )
    await user.click(screen.getByRole("checkbox"))
    expect(screen.getByRole("checkbox").getAttribute("data-slot")).toBe("checkbox")
    expect(screen.getByRole("checkbox").className).toBe("peer extra")
    expect(screen.getByText("✓").getAttribute("data-slot")).toBe("checkbox-indicator")
    expect(screen.getByRole("switch").getAttribute("data-size")).toBe("sm")
    expect(screen.getByRole("progressbar").children[0]!.getAttribute("style")).toContain("translateX(-60%)")
  })

  test("slider renders one thumb per value", () => {
    render(<Slider defaultValue={[10, 20, 70]} max={100} step={10} />)
    expect(screen.getAllByRole("slider").length).toBe(3)
  })

  test("scroll area renders its content", () => {
    render(
      <ScrollArea class="h-72">
        <p>inside</p>
      </ScrollArea>
    )
    expect(screen.getByText("inside")).not.toBeNull()
  })

  test("collapsible with asChild trigger", async () => {
    const user = userEvent.setup()
    render(
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button type="button">toggle</button>
        </CollapsibleTrigger>
        <CollapsibleContent>body</CollapsibleContent>
      </Collapsible>
    )
    await user.click(screen.getByRole("button"))
    expect(screen.getByText("body")).not.toBeNull()
    expect(screen.getByRole("button").getAttribute("data-slot")).toBe("collapsible-trigger")
  })

  test("tabs, accordion, radio group and toggle group compose with wrapper-level data attributes", async () => {
    const user = userEvent.setup()
    render(
      <div>
        <TabsPrimitive.Root data-slot="tabs" defaultValue="a" orientation="horizontal" data-orientation="horizontal">
          <TabsPrimitive.List data-variant="default">
            <TabsPrimitive.Trigger value="a">A</TabsPrimitive.Trigger>
          </TabsPrimitive.List>
          <TabsPrimitive.Content value="a">tab body</TabsPrimitive.Content>
        </TabsPrimitive.Root>
        <AccordionPrimitive.Root type="single" collapsible>
          <AccordionPrimitive.Item value="x">
            <AccordionPrimitive.Header class="flex">
              <AccordionPrimitive.Trigger>acc</AccordionPrimitive.Trigger>
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Content>
              <div>acc body</div>
            </AccordionPrimitive.Content>
          </AccordionPrimitive.Item>
        </AccordionPrimitive.Root>
        <RadioGroupPrimitive.Root defaultValue="r1">
          <RadioGroupPrimitive.Item value="r1" aria-label="r1">
            <RadioGroupPrimitive.Indicator>
              <span>dot</span>
            </RadioGroupPrimitive.Indicator>
          </RadioGroupPrimitive.Item>
        </RadioGroupPrimitive.Root>
        <ToggleGroupPrimitive.Root type="multiple" data-spacing={2} style={{ "--gap": 2 }}>
          <ToggleGroupPrimitive.Item value="b" aria-label="bold" />
        </ToggleGroupPrimitive.Root>
        <Slot.Root class="slotted">
          <a href="#x">link</a>
        </Slot.Root>
      </div>
    )
    expect(screen.getByText("tab body")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "acc" }))
    expect(screen.getByText("acc body")).not.toBeNull()
    expect(screen.getByText("dot")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "bold" }))
    expect(screen.getByRole("button", { name: "bold" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("link").className).toBe("slotted")
  })
})
