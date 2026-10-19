import { define } from "../../utils.ts";
import Example from "../../islands/Example.tsx";

export default define.page(function ExamplePage(ctx) {
  return <Example name={ctx.params.name} />;
});
