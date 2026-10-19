import { hydrate } from "preact"
import { renderToString } from "preact-render-to-string"
import { act, screen } from "@testing-library/preact"
import { expect, test } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import { Combobox } from "../src/shims/base-ui-react"

useFakeTimers()

function Tree() {
  return (
    <Combobox.Root items={["Next.js", "Remix", "Astro"]} defaultValue="Remix">
      <Combobox.Input placeholder="Pick one" />
      <Combobox.Trigger aria-label="Toggle" />
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup>
            <Combobox.List>
              {(item: string) => (
                <Combobox.Item key={item} value={item}>
                  {item}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

test("server markup is adopted and the combobox works afterwards", async () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  container.innerHTML = renderToString(<Tree />)
  const serverInput = container.querySelector("input")!
  const serverButton = container.querySelector("button")!
  await act(async () => {
    hydrate(<Tree />, container)
  })
  // the same nodes, with the server's ids
  expect(container.querySelector("input")).toBe(serverInput)
  expect(container.querySelector("button")).toBe(serverButton)
  expect(serverInput.value).toBe("Remix")
  expect(serverButton.getAttribute("tabindex")).toBe("-1")
  expect(serverButton.hasAttribute("id")).toBe(false)

  const user = setupUser()
  await user.click(serverInput)
  await flush(50)
  const options = screen.getAllByRole("option")
  expect(options.map((option) => option.textContent)).toEqual(["Next.js", "Remix", "Astro"])
  expect(serverInput.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id)
  expect(options[1]!.hasAttribute("data-highlighted")).toBe(true)
  await user.click(options[2]!)
  await flush(50)
  expect(serverInput.value).toBe("Astro")
  container.remove()
})
