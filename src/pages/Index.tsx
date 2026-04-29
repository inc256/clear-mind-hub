import { AiWorkspace } from "@/components/AiWorkspace";
import { useTranslation } from "react-i18next";

const Index = () => {
  const { t } = useTranslation();
  return (
    <AiWorkspace
      mode="tutor"
      title={t('tutor.title')}
      subtitle={t('tutor.subtitle')}
      placeholder={t('tutor.placeholder')}
      acceptFile
    />
  );
};

export default Index;
