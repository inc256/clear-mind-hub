import { AiWorkspace } from "@/components/AiWorkspace";

const Research = () => (
  <AiWorkspace
    mode="research"
    title="Turn raw material into clear research."
    subtitle="Paste text or upload a document. Organyze extracts key points, organizes sections, and gives you a clean summary."
    placeholder="Paste an article, transcript, notes, or any text you want to research…"
    acceptFile
    examples={[
      "Summarize the latest trends in generative AI for SMB software.",
      "Compare React Server Components vs traditional SSR.",
      "Research the health benefits and risks of intermittent fasting.",
    ]}
  />
);

export default Research;
