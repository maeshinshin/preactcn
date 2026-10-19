import { useState } from "preact/hooks";
import { Menu, X } from "lucide-preact";
import { Button } from "@/components/ui/button";

// below md the sidebar is hidden until this sets data-nav-open on <html> (see global.css)
export default function NavToggle() {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    document.documentElement.toggleAttribute("data-nav-open", !open);
    setOpen(!open);
  };
  return (
    <Button className="md:hidden" variant="ghost" size="icon" aria-label="Components" aria-expanded={open} aria-controls="sidebar" onClick={toggle}>
      {open ? <X /> : <Menu />}
    </Button>
  );
}
