import type { ComponentType } from "preact";
import { useEffect } from "preact/hooks";
import { TooltipProvider } from "@/components/ui/tooltip";

// islands are separate render roots, so the provider the upstream docs app puts around examples goes inside each one;
// the Toaster is mounted once by the page, since toast() is a module singleton shared by all islands
export function demo(module: Record<string, unknown>) {
  return ({ section }: { section: string }) => {
    const Section = (section === "default" ? module.default : module[section]) as ComponentType;
    useEffect(() => {
      const body = document.body.dataset; // scripts/mount-check.mjs waits until this counts every [data-section]
      body.mounted = String(Number(body.mounted ?? 0) + 1);
    }, []);
    return (
      <TooltipProvider>
        <Section />
      </TooltipProvider>
    );
  };
}
