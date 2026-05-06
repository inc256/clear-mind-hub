import { AiWorkspace } from "@/components/AiWorkspace";
import { useTranslation } from "react-i18next";

const Research = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <AiWorkspace
        mode="research"
        title={t('research.title')}
        subtitle={t('research.subtitle')}
        placeholder={t('research.placeholder')}
        acceptFile
      />
    </div>
  );
};

export default Research;
