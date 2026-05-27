import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Lang, StringKey, translate } from './strings';

const STORAGE_KEY = 'app.lang';
const DEFAULT_LANG: Lang = 'en';

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a string key. Unknown keys are returned verbatim. */
  t: (key: StringKey) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'en' || v === 'hi') setLangState(v as Lang);
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (key) => translate(key, lang),
    }),
    [lang, setLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback when called outside the provider (e.g. tests).
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      t: (key) => translate(key, DEFAULT_LANG),
    };
  }
  return ctx;
}

/** Convenience hook: returns just the `t` function. */
export function useT() {
  return useI18n().t;
}
