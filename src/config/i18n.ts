import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize i18next
i18next
  .use(Backend)
  .init({
    lng: 'en', // default language
    fallbackLng: 'en',
    ns: ['notifications'],
    defaultNS: 'notifications',
    backend: {
      loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
    },
    interpolation: {
      escapeValue: false, // XSS protection not needed (no HTML in backend)
    },
  });

export default i18next;
