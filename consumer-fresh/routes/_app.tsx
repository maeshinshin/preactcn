import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>consumer-fresh</title>
        {/* classic script, so it runs before the islands hydrate (copied from consumer/public by scripts/verify.mjs) */}
        <script src="/collect-errors.js" />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
