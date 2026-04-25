import { AiWorkspace } from "@/components/AiWorkspace";

const Tutor = () => (
  <AiWorkspace
    mode="tutor"
    title="Tutor"
    subtitle="Learn any topic comprehensively. Choose your learning mindset (General, Medical, Engineering, Lecturer, etc.) to customize how concepts are explained."
    placeholder="e.g. Teach me about machine learning, React hooks, quantum computing, etc."
  />
);

export default Tutor;
