import { Fragment, jsx as preactJsx, jsxs as preactJsxs } from "preact/jsx-runtime"
import { fixProps } from "./fix-props"

export { Fragment }
export type { JSX } from "preact/jsx-runtime"

// Only host elements are rewritten; a component gets the props it was given.
export const jsx: typeof preactJsx = (type: any, props: any, key?: string) => preactJsx(type, typeof type === "string" ? fixProps(props) : props, key)
export const jsxs: typeof preactJsxs = (type: any, props: any, key?: string) => preactJsxs(type, typeof type === "string" ? fixProps(props) : props, key)
