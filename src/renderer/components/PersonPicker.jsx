import { useId, useMemo, useRef, useState } from 'react';
import { matchPerson, normalizeArabic } from '../../services/arabicSearch.js';

const MAX_RESULTS = 8;

export default function PersonPicker({
  persons,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  browseOnFocus = false,
  placeholder = 'اكتب بداية الاسم بالتسلسل أو بداية الرقم العسكري'
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const listId = useId();
  const selectedPerson = useMemo(
    () => persons.find((person) => person.military_number === value) ?? null,
    [persons, value]
  );
  const normalizedQuery = normalizeArabic(query);
  const results = useMemo(() => {
    if (!normalizedQuery) {
      return browseOnFocus
        ? [...persons]
          .sort((left, right) => String(left.full_name || '').localeCompare(String(right.full_name || ''), 'ar'))
          .slice(0, MAX_RESULTS)
          .map((person) => ({ person, score: 0 }))
        : [];
    }

    return persons
      .map((person) => ({ person, score: matchPerson(person, normalizedQuery) }))
      .filter((result) => result.score > 0)
      .sort((left, right) => (
        right.score - left.score
        || String(left.person.full_name || '').localeCompare(String(right.person.full_name || ''), 'ar')
      ))
      .slice(0, MAX_RESULTS);
  }, [browseOnFocus, normalizedQuery, persons]);

  function choosePerson(person) {
    onChange(person);
    setQuery('');
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index < 0 ? 0 : (index + 1) % results.length));
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index < 0 ? results.length - 1 : (index - 1 + results.length) % results.length));
    } else if (event.key === 'Enter' && isOpen && results.length) {
      event.preventDefault();
      choosePerson(results[activeIndex < 0 ? 0 : activeIndex].person);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    } else if (event.key === 'Tab' && isOpen && results.length === 1) {
      choosePerson(results[0].person);
    }
  }

  function clearSelection() {
    onChange(null);
    setQuery('');
    setIsOpen(false);
    setActiveIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className="relative min-w-0" dir="rtl">
      {selectedPerson ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-emerald-950">{selectedPerson.full_name}</p>
            <p className="mt-0.5 truncate text-xs text-emerald-800">
              {[selectedPerson.rank, selectedPerson.category, selectedPerson.unit, selectedPerson.military_number].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={clearSelection}
            disabled={disabled}
            aria-label="مسح الفرد المختار"
          >
            مسح
          </button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            className="field"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen && (Boolean(normalizedQuery) || browseOnFocus)}
            aria-controls={listId}
            aria-activedescendant={isOpen && results[activeIndex]
              ? `${listId}-option-${activeIndex}`
              : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => { if (query || browseOnFocus) setIsOpen(true); }}
            onBlur={() => setIsOpen(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
          />
          {isOpen && (normalizedQuery || browseOnFocus) && (
            <ul
              id={listId}
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
              role="listbox"
              aria-label="نتائج البحث عن الأفراد"
            >
              {results.map(({ person }, index) => (
                <li
                  key={person.military_number}
                  role="presentation"
                >
                  <button
                    id={`${listId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    type="button"
                    className={`w-full rounded-lg px-3 py-2.5 text-right transition ${
                      index === activeIndex ? 'bg-indigo-50 text-indigo-950' : 'text-slate-800 hover:bg-slate-50'
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choosePerson(person)}
                  >
                    <span className="block truncate text-sm font-bold">
                      {person.full_name || '—'}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-600">
                      {[person.rank, person.category, person.unit, person.military_number].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-3 py-3 text-sm text-slate-500" role="status">
                  {persons.length === 0 ? 'لا يوجد أفراد في سجل الأفراد.' : 'لا توجد نتائج مطابقة.'}
                </li>
              )}
              {!normalizedQuery && persons.length > MAX_RESULTS && (
                <li className="px-3 py-2 text-center text-xs text-slate-500" role="status">
                  يعرض أول {MAX_RESULTS} أفراد من أصل {persons.length}. ابحث بالاسم أو الرقم للوصول للباقين.
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
