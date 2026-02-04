/**
 * i18n Configuration - Inline translations
 *
 * Previously used i18next-fs-backend with JSON files, but tsup build
 * doesn't copy locale files to dist/. Using inline resources instead.
 */

import i18next from 'i18next';

// Import all locale files
import arNotifications from '../locales/ar/notifications.json' with { type: 'json' };
import caNotifications from '../locales/ca/notifications.json' with { type: 'json' };
import csNotifications from '../locales/cs/notifications.json' with { type: 'json' };
import daNotifications from '../locales/da/notifications.json' with { type: 'json' };
import deNotifications from '../locales/de/notifications.json' with { type: 'json' };
import elNotifications from '../locales/el/notifications.json' with { type: 'json' };
import enNotifications from '../locales/en/notifications.json' with { type: 'json' };
import esNotifications from '../locales/es/notifications.json' with { type: 'json' };
import fiNotifications from '../locales/fi/notifications.json' with { type: 'json' };
import frNotifications from '../locales/fr/notifications.json' with { type: 'json' };
import heNotifications from '../locales/he/notifications.json' with { type: 'json' };
import hiNotifications from '../locales/hi/notifications.json' with { type: 'json' };
import hrNotifications from '../locales/hr/notifications.json' with { type: 'json' };
import huNotifications from '../locales/hu/notifications.json' with { type: 'json' };
import idNotifications from '../locales/id/notifications.json' with { type: 'json' };
import itNotifications from '../locales/it/notifications.json' with { type: 'json' };
import jaNotifications from '../locales/ja/notifications.json' with { type: 'json' };
import koNotifications from '../locales/ko/notifications.json' with { type: 'json' };
import msNotifications from '../locales/ms/notifications.json' with { type: 'json' };
import nlNotifications from '../locales/nl/notifications.json' with { type: 'json' };
import noNotifications from '../locales/no/notifications.json' with { type: 'json' };
import plNotifications from '../locales/pl/notifications.json' with { type: 'json' };
import ptNotifications from '../locales/pt/notifications.json' with { type: 'json' };
import roNotifications from '../locales/ro/notifications.json' with { type: 'json' };
import ruNotifications from '../locales/ru/notifications.json' with { type: 'json' };
import skNotifications from '../locales/sk/notifications.json' with { type: 'json' };
import svNotifications from '../locales/sv/notifications.json' with { type: 'json' };
import thNotifications from '../locales/th/notifications.json' with { type: 'json' };
import trNotifications from '../locales/tr/notifications.json' with { type: 'json' };
import ukNotifications from '../locales/uk/notifications.json' with { type: 'json' };

// Resource bundle
const resources = {
  ar: { notifications: arNotifications },
  ca: { notifications: caNotifications },
  cs: { notifications: csNotifications },
  da: { notifications: daNotifications },
  de: { notifications: deNotifications },
  el: { notifications: elNotifications },
  en: { notifications: enNotifications },
  es: { notifications: esNotifications },
  fi: { notifications: fiNotifications },
  fr: { notifications: frNotifications },
  he: { notifications: heNotifications },
  hi: { notifications: hiNotifications },
  hr: { notifications: hrNotifications },
  hu: { notifications: huNotifications },
  id: { notifications: idNotifications },
  it: { notifications: itNotifications },
  ja: { notifications: jaNotifications },
  ko: { notifications: koNotifications },
  ms: { notifications: msNotifications },
  nl: { notifications: nlNotifications },
  no: { notifications: noNotifications },
  pl: { notifications: plNotifications },
  pt: { notifications: ptNotifications },
  ro: { notifications: roNotifications },
  ru: { notifications: ruNotifications },
  sk: { notifications: skNotifications },
  sv: { notifications: svNotifications },
  th: { notifications: thNotifications },
  tr: { notifications: trNotifications },
  uk: { notifications: ukNotifications },
};

// Initialize i18next with inline resources
// Note: Using void operator to intentionally ignore the promise since
// we're loading resources synchronously and don't need to wait
void i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['notifications'],
  defaultNS: 'notifications',
  resources,
  interpolation: {
    escapeValue: false,
  },
});

export default i18next;
