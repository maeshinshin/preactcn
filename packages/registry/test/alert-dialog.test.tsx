import { type ComponentChildren, type ComponentProps } from "preact"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import * as AlertDialog from "../src/radix/alert-dialog"
import * as Slot from "../src/radix/slot"

// Written the way upstream shadcn wraps Action and Cancel
function Button({ asChild, ...props }: ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return <Comp data-slot="button" {...props} />
}

function Example({ root, cancel = true, children }: { root?: ComponentProps<typeof AlertDialog.Root>; cancel?: boolean; children?: ComponentChildren }) {
  return (
    <AlertDialog.Root {...root}>
      <AlertDialog.Trigger>Delete</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay data-testid="overlay" />
        <AlertDialog.Content data-testid="content">
          <AlertDialog.Title>Are you sure?</AlertDialog.Title>
          <AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
          {children}
          <Button asChild>
            <AlertDialog.Action data-testid="action">Continue</AlertDialog.Action>
          </Button>
          {cancel && (
            <Button asChild>
              <AlertDialog.Cancel data-testid="cancel">Cancel</AlertDialog.Cancel>
            </Button>
          )}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

const trigger = () => screen.getByRole("button", { name: "Delete" })

useFakeTimers()

describe("alert dialog", () => {
  test("opens as an alertdialog wired to its title and description, with the dialog trigger attributes", async () => {
    const user = setupUser()
    render(<Example />)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog")
    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    expect(trigger().hasAttribute("aria-controls")).toBe(false)
    await user.click(trigger())
    await flush()
    const dialog = screen.getByRole("alertdialog")
    expect(dialog.getAttribute("data-state")).toBe("open")
    expect(dialog.id).toBe(trigger().getAttribute("aria-controls"))
    expect(dialog.getAttribute("aria-labelledby")).toBe(screen.getByText("Are you sure?").id)
    expect(dialog.getAttribute("aria-describedby")).toBe(screen.getByText("This cannot be undone.").id)
    expect(screen.getByTestId("overlay").getAttribute("data-state")).toBe("open")
    expect(dialog.parentElement).toBe(document.body)
    expect(trigger().closest("[inert]")).not.toBeNull()
  })

  test("focus starts on Cancel", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    expect(document.activeElement).toBe(screen.getByTestId("cancel"))
    expect(screen.getByTestId("cancel").getAttribute("data-slot")).toBe("button")
  })

  test("without a Cancel the default initial focus applies", async () => {
    const user = setupUser()
    render(<Example cancel={false} />)
    await user.click(trigger())
    await flush()
    expect(document.activeElement).toBe(screen.getByTestId("action"))
  })

  test("a click outside does not dismiss, Escape does and focus returns to the trigger", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    await user.click(trigger())
    await flush()
    fireEvent.pointerDown(screen.getByTestId("overlay"))
    await flush()
    expect(screen.queryByRole("alertdialog")).not.toBeNull()
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test.each([["action"], ["cancel"]])("%s closes the dialog", async (id) => {
    const user = setupUser()
    const onClick = vi.fn()
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    screen.getByTestId(id).addEventListener("click", onClick)
    await user.click(screen.getByTestId(id))
    await flush()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test("is always modal, even when asked not to be", async () => {
    const user = setupUser()
    render(<Example root={{ modal: false } as ComponentProps<typeof AlertDialog.Root>} />)
    await user.click(trigger())
    await flush()
    expect(screen.getByTestId("overlay")).not.toBeNull()
    expect(trigger().closest("[inert]")).not.toBeNull()
  })

  test("traps Tab inside the content", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByTestId("action"))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByTestId("cancel"))
  })
})
