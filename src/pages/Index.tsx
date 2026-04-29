import { AiWorkspace } from "@/components/AiWorkspace";
import { useTranslation } from "react-i18next";

const Index = () => {
  const { t } = useTranslation();
  return (
    <AiWorkspace
      mode="problem"
      title={t('problem.title')}
      subtitle={t('problem.subtitle')}
      placeholder={t('problem.placeholder')}
    />
  );
};

export default Index;
