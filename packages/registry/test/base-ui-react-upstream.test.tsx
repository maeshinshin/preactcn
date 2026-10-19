import { type ComponentProps } from "preact"
import { useRef } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import { expect, test } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import { Combobox as ComboboxPrimitive } from "../src/shims/base-ui-react"

useFakeTimers()

// The shape of upstream's ui/combobox.tsx: every wrapper types its props with the part's `.Props` and spreads the rest into the part,
// with the casts of the cast-free version gone. `pnpm typecheck` (Preact 10 and 11) is the assertion; the rendering checks that the
// same code works.
const cn = (...classes: (string | undefined)[]) => classes.filter(Boolean).join(" ")
const Button = (props: ComponentProps<"button">) => <button data-slot="button" {...props} />
const InputGroupInput = (props: any) => <input data-slot="input-group-control" {...props} />

const Combobox = ComboboxPrimitive.Root

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger data-slot="combobox-trigger" className={cn("trigger", className)} {...props}>
      {children}
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear data-slot="combobox-clear" render={<Button />} className={cn(className)} {...props}>
      x
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxInput({ className, children, disabled = false, showClear = false, ...props }: ComboboxPrimitive.Input.Props & { showClear?: boolean }) {
  return (
    <div data-slot="input-group" className={cn("w-auto", className)}>
      <ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
      <ComboboxTrigger />
      {showClear && <ComboboxClear disabled={disabled} />}
      {children}
    </div>
  )
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props & Pick<ComboboxPrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset" | "anchor">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} alignOffset={alignOffset} anchor={anchor} className="isolate z-50">
        <ComboboxPrimitive.Popup data-slot="combobox-content" data-chips={!!anchor} className={cn("popup", className)} {...props} />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return <ComboboxPrimitive.List data-slot="combobox-list" className={cn("list", className)} {...props} />
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item data-slot="combobox-item" className={cn("item", className)} {...props}>
      {children}
      <ComboboxPrimitive.ItemIndicator render={<span className="indicator" />}>✓</ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return <ComboboxPrimitive.GroupLabel data-slot="combobox-label" className={cn("label", className)} {...props} />
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return <ComboboxPrimitive.Empty data-slot="combobox-empty" className={cn("empty", className)} {...props} />
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return <ComboboxPrimitive.Separator data-slot="combobox-separator" className={cn("separator", className)} {...props} />
}

function ComboboxChips({ className, ...props }: ComponentProps<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
  return <ComboboxPrimitive.Chips data-slot="combobox-chips" className={cn("chips", className)} {...props} />
}

function ComboboxChip({ className, children, showRemove = true, ...props }: ComboboxPrimitive.Chip.Props & { showRemove?: boolean }) {
  return (
    <ComboboxPrimitive.Chip data-slot="combobox-chip" className={cn("chip", className)} {...props}>
      {children}
      {showRemove && <ComboboxPrimitive.ChipRemove render={<Button />} className="remove" data-slot="combobox-chip-remove" aria-label="Remove" />}
    </ComboboxPrimitive.Chip>
  )
}

function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return <ComboboxPrimitive.Input data-slot="combobox-chip-input" className={cn("chips-input", className)} {...props} />
}

function useComboboxAnchor() {
  return useRef<HTMLDivElement | null>(null)
}

const frameworks = ["Next.js", "Remix", "Astro"] as const

test("the wrappers of upstream's combobox type-check and work on top of the shim", async () => {
  const user = setupUser()
  render(
    <>
      <Combobox items={frameworks} defaultValue={frameworks[0]} itemToStringValue={(item: string) => item.toLowerCase()} name="framework">
        <ComboboxInput placeholder="Select a framework" showClear aria-invalid="true" id="single" />
        <ComboboxContent alignOffset={-28} className="w-60">
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Combobox items={[{ value: "eu", items: ["Paris", "Berlin"] }]}>
        <ComboboxTrigger render={<Button className="outline" />}>
          <ComboboxValue placeholder="Pick a city" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxList>
            {(group) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
                <ComboboxSeparator />
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Chips />
    </>
  )

  const single = screen.getAllByRole("combobox")[0] as HTMLInputElement
  expect(single.value).toBe("Next.js")
  expect(single.getAttribute("data-slot")).toBe("input-group-control")
  expect(single.getAttribute("aria-invalid")).toBe("true")
  expect(single.id).toBe("single")
  expect(document.querySelector('[data-slot="combobox-clear"]')?.getAttribute("data-slot")).toBe("combobox-clear")
  expect((document.querySelector('input[name="framework"]') as HTMLInputElement).value).toBe("next.js")

  await user.click(single)
  await flush(50)
  const popup = document.querySelector('[data-slot="combobox-content"]')!
  expect(popup.className).toContain("popup w-60")
  expect(popup.getAttribute("data-chips")).toBe("false")
  expect(popup.parentElement?.className).toBe("isolate z-50")
  await user.click(screen.getByRole("option", { name: "Remix" }))
  await flush(50)
  expect(single.value).toBe("Remix")

  const city = document.querySelector<HTMLElement>(".outline")!
  expect(city.textContent).toBe("Pick a city")
  await user.click(city)
  await flush(50)
  expect(screen.getAllByRole("group").length).toBe(1)
  expect(screen.getByRole("option", { name: "Paris" })).toBeTruthy()
  await user.click(screen.getByRole("option", { name: "Berlin" }))
  await flush(50)
  expect(city.textContent).toBe("Berlin")

  const chips = document.querySelector('[data-slot="combobox-chips"]')!
  expect(chips.querySelectorAll('[data-slot="combobox-chip"]')).toHaveLength(1)
  await user.click(screen.getByRole("button", { name: "Remove" }))
  await flush(50)
  expect(chips.querySelectorAll('[data-slot="combobox-chip"]')).toHaveLength(0)
})

function Chips() {
  const anchor = useComboboxAnchor()
  return (
    <Combobox multiple items={frameworks} defaultValue={[frameworks[0]]}>
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(values) => (
            <>
              {values.map((value: string) => (
                <ComboboxChip key={value}>{value}</ComboboxChip>
              ))}
              <ComboboxChipsInput />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
