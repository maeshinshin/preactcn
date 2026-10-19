// stand-in for the docs app's URL-backed design system params, fixed to the radix-nova style
export function useDesignSystemSearchParams() {
  return [{ style: "nova" }] as const
}
