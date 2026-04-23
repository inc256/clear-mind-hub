import { AiWorkspace } from "@/components/AiWorkspace";

const Index = () => (
  <AiWorkspace
    mode="problem"
    title="Problem solver"
    subtitle="Describe what you're stuck on. Tyn Tutor breaks it down into understanding, reasoning, and a clear solution."
    placeholder="e.g. How should I prioritize features for my SaaS launch with limited engineering time?"
  />
);

export default Index;
