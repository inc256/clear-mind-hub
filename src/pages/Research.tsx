import { AiWorkspace } from "@/components/AiWorkspace";
import { useTranslation } from "react-i18next";

const Research = () => {
  const { t } = useTranslation();
  return (
    <AiWorkspace
      mode="research"
      title={t('research.title')}
      subtitle={t('research.subtitle')}
      placeholder={t('research.placeholder')}
      acceptFile
    />
  );
};

export default Research;
