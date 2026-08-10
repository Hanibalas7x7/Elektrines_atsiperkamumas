import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import lt from './locales/lt/translation.json'
import en from './locales/en/translation.json'

const STORAGE_KEY = 'elektrines.language'

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      lt: { translation: lt },
      en: { translation: en },
    },
    lng: window.localStorage.getItem(STORAGE_KEY) ?? 'lt',
    fallbackLng: 'lt',
    interpolation: { escapeValue: false },
  })

i18n.on('languageChanged', (lng) => {
  window.localStorage.setItem(STORAGE_KEY, lng)
})

export default i18n
