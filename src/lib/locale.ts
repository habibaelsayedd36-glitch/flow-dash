import { dictFor, type Dict, type Locale } from "./i18n";

export const LOCALE_COOKIE = "flow_lang";

/** The dashboard UI is English. Listing content itself stays bilingual (English + Arabic). */
export async function getLocale(): Promise<Locale> {
  return "en";
}

export async function getI18n(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: dictFor(locale) };
}
