import { AiWorkspace } from "@/components/AiWorkspace";

const Index = () => (
  <AiWorkspace
    mode="problem"
    title="Solve any problem, structurally."
    subtitle="Describe what you're stuck on. Organyze breaks it down into understanding, reasoning, and a clear solution."
    placeholder="e.g. How should I prioritize features for my SaaS launch with limited engineering time?"
    examples={[
      "Plan a 30-day study schedule for the AWS Solutions Architect exam.",
      "How do I negotiate a higher salary at my current job?",
      "My React app re-renders too often. How do I diagnose it?",
      "Design a weekly meal plan for high protein on a $40 budget.",
    ]}
  />
);

export default Index;
