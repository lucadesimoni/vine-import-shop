import { createContext, useContext } from "react";
import type { Locale } from "../localized";
import de, { type MessageKey, type Messages } from "./de";
import en from "./en";
import fr from "./fr";
import it from "./it";

const dictionaries: Record<Locale, Partial<Messages>> = { de, it, fr, en };

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function messagesFor(locale: Locale): Messages {
  return { ...de, ...dictionaries[locale] } as Messages;
}

export function makeT(messages: Messages): T {
  return (key, vars) => {
    let s = messages[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export const getT = (locale: Locale): T => makeT(messagesFor(locale));

type I18nValue = { locale: Locale; locales: Locale[]; t: T };
export const I18nContext = createContext<I18nValue>({ locale: "de", locales: ["de"], t: makeT(de) });
export const useI18n = () => useContext(I18nContext);
export type { MessageKey };
