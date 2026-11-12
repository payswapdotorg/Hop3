/**
 * Hop3 — OneForma connector data tables — split out of `sources/oneforma.ts`
 * (reference `lib/sources/oneforma.ts`, contents unchanged) to keep the
 * adapter file within the 800-line module budget.
 *
 * Pure data: card country-name -> ISO 3166-1 alpha-2, card language-tag ->
 * ISO 639-1, and the conservative mapping helper. Unmapped names are returned
 * as-is (left as text, never guessed into an ISO code).
 */

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  afghanistan: "AF", albania: "AL", algeria: "DZ", angola: "AO", argentina: "AR", armenia: "AM",
  australia: "AU", austria: "AT", azerbaijan: "AZ", bahrain: "BH", bangladesh: "BD", belarus: "BY",
  belgium: "BE", belize: "BZ", benin: "BJ", bhutan: "BT", bolivia: "BO", "bosnia and herzegovina": "BA",
  botswana: "BW", brazil: "BR", brunei: "BN", bulgaria: "BG", "burkina faso": "BF", burundi: "BI",
  cambodia: "KH", cameroon: "CM", canada: "CA", "central african republic": "CF", chad: "TD",
  chile: "CL", china: "CN", colombia: "CO", "costa rica": "CR", "cote d\u2019ivoire": "CI",
  "cote d'ivoire": "CI", croatia: "HR", cuba: "CU", cyprus: "CY", "czech republic": "CZ", czechia: "CZ",
  denmark: "DK", "dominican republic": "DO", ecuador: "EC", egypt: "EG", "el salvador": "SV",
  eritrea: "ER", estonia: "EE", eswatini: "SZ", ethiopia: "ET", fiji: "FJ", finland: "FI",
  france: "FR", gabon: "GA", gambia: "GM", georgia: "GE", germany: "DE", ghana: "GH", greece: "GR",
  guatemala: "GT", guinea: "GN", "guinea-bissau": "GW", guyana: "GY", haiti: "HT", honduras: "HN",
  "hong kong": "HK", hungary: "HU", iceland: "IS", india: "IN", indonesia: "ID", iran: "IR",
  iraq: "IQ", ireland: "IE", israel: "IL", italy: "IT", jamaica: "JM", japan: "JP", jordan: "JO",
  kazakhstan: "KZ", kenya: "KE", kuwait: "KW", kyrgyzstan: "KG", laos: "LA", latvia: "LV",
  lebanon: "LB", lesotho: "LS", liberia: "LR", libya: "LY", lithuania: "LT", luxembourg: "LU",
  macau: "MO", madagascar: "MG", malawi: "MW", malaysia: "MY", mali: "ML", malta: "MT",
  mauritania: "MR", mauritius: "MU", mexico: "MX", moldova: "MD", monaco: "MC", mongolia: "MN",
  montenegro: "ME", morocco: "MA", mozambique: "MZ", myanmar: "MM", namibia: "NA", nepal: "NP",
  netherlands: "NL", "new zealand": "NZ", nicaragua: "NI", niger: "NE", nigeria: "NG",
  "north macedonia": "MK", norway: "NO", oman: "OM", pakistan: "PK", palestine: "PS", panama: "PA",
  "papua new guinea": "PG", paraguay: "PY", peru: "PE", philippines: "PH", poland: "PL",
  portugal: "PT", qatar: "QA", romania: "RO", russia: "RU", rwanda: "RW", "saudi arabia": "SA",
  senegal: "SN", serbia: "RS", "sierra leone": "SL", singapore: "SG", slovakia: "SK", slovenia: "SI",
  somalia: "SO", "south africa": "ZA", "south korea": "KR", "south sudan": "SS", spain: "ES",
  "sri lanka": "LK", sudan: "SD", suriname: "SR", sweden: "SE", switzerland: "CH", syria: "SY",
  taiwan: "TW", tajikistan: "TJ", tanzania: "TZ", thailand: "TH", "togo": "TG",
  "trinidad and tobago": "TT", tunisia: "TN", turkey: "TR", turkmenistan: "TM", uganda: "UG",
  ukraine: "UA", "united arab emirates": "AE", "united kingdom": "GB", "united states": "US",
  uruguay: "UY", usa: "US", uzbekistan: "UZ", venezuela: "VE", vietnam: "VN", yemen: "YE",
  zambia: "ZM", zimbabwe: "ZW",
};

const LANGUAGE_TAG_TO_ISO6391: Record<string, string> = {
  amharic: "am", arabic: "ar", bengali: "bn", bulgarian: "bg", cantonese: "zh", chinese: "zh",
  "chinese-simplified": "zh", "chinese-traditional": "zh", croatian: "hr", czech: "cs", danish: "da",
  dutch: "nl", english: "en", estonian: "et", filipino: "tl", finnish: "fi", french: "fr", georgian: "ka",
  german: "de", greek: "el", hausa: "ha", hebrew: "he", hindi: "hi", hungarian: "hu", igbo: "ig",
  indonesian: "id", italian: "it", japanese: "ja", kannada: "kn", kazakh: "kk", korean: "ko",
  latvian: "lv", lithuanian: "lt", malay: "ms", malayalam: "ml", marathi: "mr", norwegian: "no",
  pashto: "ps", persian: "fa", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro",
  russian: "ru", serbian: "sr", slovak: "sk", slovenian: "sl", somali: "so", spanish: "es",
  swahili: "sw", swedish: "sv", tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk",
  urdu: "ur", uzbek: "uz", vietnamese: "vi", yoruba: "yo",
};

/** Map card country names to ISO codes; unmapped names are reported, never guessed. */
export function countryNamesToIso2(names: string[]): { codes: string[]; unmapped: string[] } {
  const codes: string[] = [];
  const unmapped: string[] = [];
  for (const name of names) {
    const code = COUNTRY_NAME_TO_ISO2[name.trim().toLowerCase()];
    if (code && !codes.includes(code)) codes.push(code);
    else if (!code) unmapped.push(name.trim());
  }
  return { codes, unmapped };
}

/** Map a card language tag to an ISO 639-1 code, or undefined when unmapped. */
export function languageTagToIso6391(tag: string): string | undefined {
  return LANGUAGE_TAG_TO_ISO6391[tag.toLowerCase()];
}
