import { define } from "../utils.ts";

const names = Object.keys(import.meta.glob("../examples/*.tsx")).map((path) =>
  path.slice("../examples/".length, -".tsx".length)
);

export default define.page(function Home() {
  return (
    <ul class="p-8">
      {names.map((name) => (
        <li key={name}>
          <a class="underline" href={`/examples/${name}`}>{name}</a>
        </li>
      ))}
    </ul>
  );
});
