import { Moon, Sun } from "lucide-preact";
import { Button } from "@/components/ui/button";

// the initial class is set by the inline script in Layout.astro; both icons render and CSS picks one, so there is no hydration mismatch
export default function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
  };
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={toggle}>
      <Sun class="hidden dark:block" />
      <Moon class="dark:hidden" />
    </Button>
  );
}
