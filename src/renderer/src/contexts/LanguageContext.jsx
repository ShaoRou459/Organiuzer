import React, { createContext, useState, useContext, useEffect } from 'react';
import { translations } from '../utils/i18n';

const LanguageContext = createContext();

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState('en');

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const storedLang = await window.electronAPI.getSettings('language');
        if (storedLang && translations[storedLang]) {
          setLanguageState(storedLang);
        }
      } catch (error) {
        console.error("Failed to load language setting:", error);
      }
    };
    loadLanguage();
  }, []);

  const setLanguage = async (lang) => {
    if (translations[lang]) {
      setLanguageState(lang);
      try {
        await window.electronAPI.setSettings('language', lang);
      } catch (error) {
        console.error("Failed to save language setting:", error);
      }
    }
  };

  const t = (key) => {
    const keys = key.split('.');

    const getVal = (lang, keys) => {
        let value = translations[lang];
        for (const k of keys) {
            if (value && value[k] !== undefined) {
                value = value[k];
            } else {
                return undefined;
            }
        }
        return value;
    }

    const val = getVal(language, keys);
    if (val !== undefined) return val;

    const fallbackVal = getVal('en', keys);
    if (fallbackVal !== undefined) return fallbackVal;

    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
