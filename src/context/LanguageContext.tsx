import React, { createContext, useContext, useEffect, useState } from 'react';
import { TRANSLATIONS, UI_LANGUAGES, type TranslationKeys, type UiLangCode } from '../i18n/translations';

interface LanguageContextValue {
  lang: UiLangCode;
  setLang: (code: UiLangCode) => void;
  t: TranslationKeys;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<UiLangCode>('en');
  const langMeta = UI_LANGUAGES.find((l) => l.code === lang) ?? UI_LANGUAGES[0];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = langMeta.dir;
  }, [lang, langMeta.dir]);

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang,
        t: TRANSLATIONS[lang],
        dir: langMeta.dir,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
