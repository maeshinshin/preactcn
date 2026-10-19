const NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i
// The camelCase SVG presentation attributes React writes in kebab-case. Exceptions after (?!...) are real camelCase attributes.
const CAMEL_SVG =
  /^(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|image(?!S)|letter|lighting|marker(?!H|W|U)|overline|paint|pointer|shape|stop|strikethrough|stroke|text(?!L)|underline|unicode|units|v|vector|vert|word|writing|x(?!C))[A-Z]/

// React-style props of a host element to what Preact core writes: numeric styles in px (Preact 11 no longer adds them),
// kebab-case svg attributes, lower-case tabindex (Preact writes `tabIndex` verbatim on svg), bubbling focus events.
export function fixProps(props: Record<string, any>): Record<string, any> {
  let out: Record<string, any> | undefined
  const set = (key: string, value: unknown, drop?: string) => {
    out ||= { ...props }
    if (drop) delete out[drop]
    out[key] = value
  }
  const style = props.style
  if (style && typeof style === "object") {
    let copy: Record<string, unknown> | undefined
    for (const key in style) {
      const value = style[key]
      if (typeof value === "number" && value !== 0 && !key.startsWith("--") && !NON_DIMENSIONAL.test(key)) (copy ||= { ...style })[key] = value + "px"
    }
    if (copy) set("style", copy)
  }
  for (const key in props) {
    if (key === "tabIndex") set("tabindex", props[key], key)
    else if (key === "onFocus") set("onfocusin", props[key], key)
    else if (key === "onBlur") set("onfocusout", props[key], key)
    else if (CAMEL_SVG.test(key)) set(key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), props[key], key)
  }
  return out ?? props
}
