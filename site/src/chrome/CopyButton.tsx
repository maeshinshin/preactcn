import { useState } from "preact/hooks";
import { Check, Copy } from "lucide-preact";
import { Button } from "@/components/ui/button";

// copies `text`, or the text content of the element with id `target` (so a long source is not serialized into the island props)
export default function CopyButton({ text, target, label = "Copy" }: { text?: string; target?: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? document.getElementById(target!)?.textContent ?? "");
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // shortcut: no fallback for browsers without the async clipboard API (insecure origins), add a textarea + execCommand if that matters
    }
  };
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={copy}>
      {done ? <Check class="text-brand" /> : <Copy />}
    </Button>
  );
}
