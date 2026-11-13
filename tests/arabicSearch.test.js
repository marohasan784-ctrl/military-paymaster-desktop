const assert = require('node:assert/strict');
const test = require('node:test');

async function loadArabicSearch() {
  return import('../src/services/arabicSearch.js');
}

test('normalizes Arabic diacritics, letter variants, tatweel, whitespace, and digits', async () => {
  const { normalizeArabic } = await loadArabicSearch();
  assert.equal(
    normalizeArabic('  أَحْمَـد   إِبْرَاهِيم آمنة ى ة ١٢٣ ۱۲۳ '),
    'احمد ابراهيم امنه ي ه 123 123'
  );
});

test('matches name prefixes sequentially from the first name', async () => {
  const { matchPerson } = await loadArabicSearch();
  const person = {
    full_name: 'محمد أحمد عبد الله',
    military_number: '١٢٣٤٥',
    unit: 'الوحدة الأولى'
  };
  assert.ok(matchPerson(person, 'محم') > 0);
  assert.ok(matchPerson(person, 'محمد احم') > 0);
  assert.ok(matchPerson(person, 'محمد أحمد عبد') > 0);
  assert.equal(matchPerson(person, 'احمد'), 0);
  assert.equal(matchPerson(person, 'عبد'), 0);
  assert.equal(matchPerson(person, 'محمد عبد'), 0);
});

test('matches military numbers only from their beginning', async () => {
  const { matchPerson } = await loadArabicSearch();
  const person = { full_name: 'فرد تجريبي', military_number: '١٢٣٤٥', unit: 'الوحدة' };
  assert.ok(matchPerson(person, '123') > 0);
  assert.equal(matchPerson(person, '345'), 0);
  assert.equal(matchPerson(person, 'الوحده'), 0);
});

test('limits personnel search to the name and military number', async () => {
  const { matchesPersonnelSearch } = await loadArabicSearch();
  const person = {
    full_name: 'أحمد محمد',
    military_number: '١٢٣٤٥',
    rank: 'عريف',
    unit: 'الوحدة',
    excel_1: 'القاهرة',
    source_data: { 'اسم الأب': 'إبراهيم' }
  };
  assert.equal(matchesPersonnelSearch(person, 'احمد'), true);
  assert.equal(matchesPersonnelSearch(person, '1234'), true);
  assert.equal(matchesPersonnelSearch(person, 'محمد'), false);
  assert.equal(matchesPersonnelSearch(person, 'عريف'), false);
  assert.equal(matchesPersonnelSearch(person, 'القاهره'), false);
  assert.equal(matchesPersonnelSearch(person, 'ابراهيم'), false);
  assert.equal(matchesPersonnelSearch(person, 'الوحده'), false);
  assert.equal(matchesPersonnelSearch(person, 'غير موجود'), false);
});

test('ranks sequential name matches above military-number matches', async () => {
  const { matchPerson } = await loadArabicSearch();
  const startsWith = matchPerson({
    full_name: 'أحمد محمد',
    military_number: '9001',
    unit: ''
  }, 'احمد');
  const sequential = matchPerson({
    full_name: 'أحمد محمود',
    military_number: '9002',
    unit: ''
  }, 'احمد مح');
  const identifier = matchPerson({
    full_name: 'فرد آخر',
    military_number: 'احمد-1',
    unit: ''
  }, 'احمد');
  assert.ok(startsWith > identifier);
  assert.ok(sequential > identifier);
});
