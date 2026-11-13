const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const EASTERN_ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

function normalizeArabic(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(EASTERN_ARABIC_DIGITS, (digit) => (
      String(digit.charCodeAt(0) >= 0x06f0
        ? digit.charCodeAt(0) - 0x06f0
        : digit.charCodeAt(0) - 0x0660)
    ))
    .replace(/\s+/g, ' ')
    .trim();
}

function matchPerson(person, query) {
  const normalizedQuery = normalizeArabic(query).toLocaleLowerCase('ar');
  if (!normalizedQuery) return 0;

  const name = normalizeArabic(person?.full_name).toLocaleLowerCase('ar');
  const militaryNumber = normalizeArabic(person?.military_number).toLocaleLowerCase('ar');
  const queryParts = normalizedQuery.split(' ');
  const nameParts = name ? name.split(' ') : [];

  const sequentialNameMatch = queryParts.length <= nameParts.length
    && queryParts.every((queryPart, index) => nameParts[index].startsWith(queryPart));
  if (sequentialNameMatch) {
    return queryParts.length === nameParts.length
      && queryParts.every((queryPart, index) => queryPart === nameParts[index])
      ? 1000
      : 900;
  }

  if (militaryNumber.startsWith(normalizedQuery)) return 600;
  return 0;
}

function matchesPersonnelSearch(person, query) {
  const normalizedQuery = normalizeArabic(query);
  if (!normalizedQuery) return true;
  return matchPerson(person, normalizedQuery) > 0;
}

export { normalizeArabic, matchPerson, matchesPersonnelSearch };
