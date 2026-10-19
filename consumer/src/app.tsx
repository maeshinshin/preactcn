import { Button } from "@/components/ui/button";

const variants = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const;
const sizes = ["sm", "default", "lg", "icon"] as const;

export function App() {
  return (
    <div class="p-8 space-y-4">
      {variants.map((v) => (
        <div class="flex items-center gap-2" key={v}>
          {sizes.map((s) => (
            <Button key={s} variant={v} size={s}>
              {s === "icon" ? "★" : `${v} ${s}`}
            </Button>
          ))}
        </div>
      ))}
      <Button disabled>disabled</Button>
      <Button onClick={() => alert("click")}>click</Button>
    </div>
  );
}
