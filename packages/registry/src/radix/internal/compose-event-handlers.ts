// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
export function composeEventHandlers<E extends Event>(
  original: ((event: E) => void) | undefined,
  ours: ((event: E) => void) | undefined,
  { checkForDefaultPrevented = true } = {}
) {
  return (event: E) => {
    original?.(event)
    if (!checkForDefaultPrevented || !event.defaultPrevented) ours?.(event)
  }
}
