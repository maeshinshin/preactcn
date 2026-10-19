import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// the panels `<id>-preview` and `<id>-code` are server-rendered (the section is an island of its own and stays mounted), this only flips `hidden`
export default function PreviewTabs({ id }: { id: string }) {
  const show = (value: string) => {
    document.getElementById(`${id}-preview`)!.hidden = value !== "preview";
    document.getElementById(`${id}-code`)!.hidden = value !== "code";
  };
  return (
    <Tabs defaultValue="preview" onValueChange={show}>
      <TabsList>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
