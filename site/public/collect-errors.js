// classic script, so it runs before the deferred app module and every error from the app is seen
window.__errors = []
addEventListener("error", (e) => window.__errors.push("error: " + e.message))
addEventListener("unhandledrejection", (e) => window.__errors.push("rejection: " + e.reason))
const error = console.error
console.error = (...args) => {
  window.__errors.push("console.error: " + args.map(String).join(" "))
  error.apply(console, args)
}
