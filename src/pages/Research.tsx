import { AiWorkspace } from "@/components/AiWorkspace";

const Research = () => (
  <AiWorkspace
    mode="research"
    title="Research engine"
    subtitle="Paste text or upload a document. Tyn Tutor extracts key points, organizes sections, and gives you a clean summary."
    placeholder="Paste an article, transcript, notes, or any text you want to research…"
    acceptFile
  />
);

export default Research;
