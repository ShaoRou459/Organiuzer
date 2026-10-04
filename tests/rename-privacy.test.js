'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { prepareNamingBrief } = require('../src/main/renamePrivacy');

test('extracts only explicit conservative title forms locally', () => {
  const markdown = prepareNamingBrief('# Quarterly Sales Plan\nThe team is preparing for the next quarter.');
  assert.equal(markdown.localName, 'Quarterly Sales Plan');
  assert.equal(markdown.localSummary, 'Quarterly Sales Plan');

  const labeled = prepareNamingBrief('Title: Annual Budget Review\nForecast discussion follows.');
  assert.equal(labeled.localName, 'Annual Budget Review');

  const subject = prepareNamingBrief('Subject: Office Supplies Invoice\nVendor purchase summary.');
  assert.equal(subject.localName, 'Office Supplies Invoice');

  const html = prepareNamingBrief('<html><head><title>Market &amp; Sales Report</title></head><body>Details follow.</body></html>');
  assert.equal(html.localName, 'Market & Sales Report');
});

test('uses a conservative first heading for PDF and DOCX only', () => {
  const text = 'Quarterly Sales Performance Report\nPrepared for internal planning.\nMore detail follows.';
  assert.equal(prepareNamingBrief(text, { kind: 'pdf' }).localName, 'Quarterly Sales Performance Report');
  assert.equal(prepareNamingBrief(text, { extension: '.docx' }).localName, 'Quarterly Sales Performance Report');
  assert.equal(prepareNamingBrief(text, { kind: 'text' }).localName, null);

  const generic = prepareNamingBrief('Summary of this report\nHere are the details.', { kind: 'docx' });
  assert.equal(generic.localName, null);
  const chatter = prepareNamingBrief('Please find the attached report\nPrepared for review.', { kind: 'pdf' });
  assert.equal(chatter.localName, null);
  const contact = prepareNamingBrief('Prepared by: Jane Doe\nAddress: 123 Main Street', { kind: 'docx' });
  assert.equal(contact.localName, null);
});

test('redacts contact details, paths, account-like numbers, and labeled identity fields while preserving topic', () => {
  const text = [
    '# Quarterly Budget Forecast',
    'Prepared by:',
    'Mira Patel',
    'Address:',
    '184 King Street',
    'Toronto, ON',
    'Email: mira.patel@example.com',
    'Phone: +1 (416) 555-0199',
    'Source URL: https://example.test/private/forecast',
    'Local file: C:\\Users\\Mira Patel\\budget.xlsx',
    'Invoice reference: 123456789012',
    'Report date: 2026-10-03',
    'The forecast covers staffing and travel costs.',
  ].join('\n');
  const result = prepareNamingBrief(text, { kind: 'docx' });

  assert.equal(result.blocked, false);
  assert.equal(result.localName, 'Quarterly Budget Forecast');
  assert.ok(result.redactions >= 6);
  assert.match(result.excerpt, /Quarterly Budget Forecast/);
  assert.match(result.excerpt, /forecast covers staffing and travel costs/i);
  for (const privateValue of ['mira.patel@example.com', '416', '184 King Street', 'C:\\Users', '123456789012']) {
    assert.ok(!result.excerpt.includes(privateValue), `brief should omit ${privateValue}`);
  }
  assert.match(result.excerpt, /2026-10-03/, 'ordinary dates should not be treated as account identifiers');
});

test('redacts common PII inline without erasing surrounding document topic', () => {
  const result = prepareNamingBrief('Subject: Vendor invoice review\nContact Jane Doe at jane@example.com or 416-555-0100. See https://vendor.example/invoice.');
  assert.equal(result.localName, 'Vendor invoice review');
  assert.ok(result.redactions >= 3);
  assert.match(result.excerpt, /Vendor invoice review/);
  assert.match(result.excerpt, /Contact .* at \[redacted\] or \[redacted\]/);
  assert.ok(!result.excerpt.includes('vendor.example'));
});

test('redacts labeled identity fields inside HTML markup before making the brief', () => {
  const result = prepareNamingBrief('<html><head><title>Quarterly Review</title></head><body><p>Prepared by: <strong>Jane Doe</strong></p><p>Address: <span>123 Main Street</span></p><p>Revenue is on target.</p></body></html>');
  assert.equal(result.localName, 'Quarterly Review');
  assert.ok(result.redactions >= 2);
  assert.ok(!result.excerpt.includes('Jane Doe'));
  assert.ok(!result.excerpt.includes('123 Main Street'));
  assert.match(result.excerpt, /Revenue is on target/);
});

test('blocks multiline private keys and known provider tokens without returning source text', () => {
  const privateKey = prepareNamingBrief([
    '# Deployment Notes',
    '-----BEGIN PRIVATE KEY-----',
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw',
    'more-key-material',
    '-----END PRIVATE KEY-----',
    'Deployment details follow.',
  ].join('\n'));
  assert.equal(privateKey.blocked, true);
  assert.match(privateKey.blockReason, /private key/i);
  assert.equal(privateKey.excerpt, '');
  assert.equal(privateKey.localName, null);
  assert.ok(!privateKey.localSummary);

  const token = prepareNamingBrief('Build notes\nOPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456');
  assert.equal(token.blocked, true);
  assert.match(token.blockReason, /credential/i);
  assert.equal(token.excerpt, '');

  const labeledSecret = prepareNamingBrief('Secret: 9Nw4qP3vX8mK2tR6');
  assert.equal(labeledSecret.blocked, true);
  assert.equal(labeledSecret.excerpt, '');
});

test('checks every secret assignment, including short and wrapped values, while allowing empty tutorial labels', () => {
  const placeholderThenSecret = prepareNamingBrief('API_KEY: [redacted]\napiKey: hunter2');
  assert.equal(placeholderThenSecret.blocked, true);
  assert.match(placeholderThenSecret.blockReason, /credential or secret/i);

  const shortPassword = prepareNamingBrief('password: hunter2');
  assert.equal(shortPassword.blocked, true);

  const wrappedValue = prepareNamingBrief('clientSecret:\n  s3cret');
  assert.equal(wrappedValue.blocked, true);

  const quotedJsonKey = prepareNamingBrief('{"apiKey":"hunter2"}');
  assert.equal(quotedJsonKey.blocked, true);

  const emptyTutorialFields = prepareNamingBrief('API key:\nPassword:\nUse a placeholder value in examples.');
  assert.equal(emptyTutorialFields.blocked, false);

  const wrappedTutorialPlaceholder = prepareNamingBrief('<p>Password: <span>example</span></p>');
  assert.equal(wrappedTutorialPlaceholder.blocked, false);
});

test('detects secrets after HTML markup and entity decoding', () => {
  const htmlSpan = prepareNamingBrief('<p>Password: <span>hi</span></p>');
  assert.equal(htmlSpan.blocked, true);

  const encodedKey = prepareNamingBrief('<p>apiKey&#58;hunter2</p>');
  assert.equal(encodedKey.blocked, true);

  const encodedTitlePii = prepareNamingBrief('<html><head><title>Quarterly report for jane&#64;example.com</title></head><body>Budget planning continues.</body></html>');
  assert.equal(encodedTitlePii.blocked, false);
  assert.equal(encodedTitlePii.localName, null);
  assert.ok(!encodedTitlePii.excerpt.includes('jane@example.com'));
  assert.match(encodedTitlePii.excerpt, /Budget planning continues/);
});

test('blocks obvious health, personnel, and financial identity records but not invoices or budget topics', () => {
  for (const [text, reason] of [
    ['Patient medical record\nDiagnosis: seasonal allergy', /medical|patient/i],
    ['Employee performance review\nSalary history included.', /personnel|employee/i],
    ['Bank statement\nAccount activity by month.', /financial|identity/i],
    ['Passport copy\nFull name and document number.', /financial|identity/i],
  ]) {
    const result = prepareNamingBrief(text);
    assert.equal(result.blocked, true);
    assert.match(result.blockReason, reason);
    assert.equal(result.excerpt, '');
    assert.equal(result.localName, null);
  }

  const ordinary = prepareNamingBrief('Subject: Office Supplies Invoice\nBudget category: recurring purchases.');
  assert.equal(ordinary.blocked, false);
  assert.equal(ordinary.localName, 'Office Supplies Invoice');
  assert.match(ordinary.excerpt, /Budget category/);
});

test('rejects sensitive matches in title candidates and redacts their source values', () => {
  const result = prepareNamingBrief('Title: Forecast for mira@example.com\nTravel costs rose this quarter.');
  assert.equal(result.blocked, false);
  assert.equal(result.localName, null);
  assert.ok(!result.excerpt.includes('mira@example.com'));
  assert.match(result.localSummary, /Forecast for \[redacted\]/);
});

test('keeps excerpts bounded and refuses text too large to privacy-check', () => {
  const bounded = prepareNamingBrief(`Subject: Budget Brief\n${'Quarterly planning details. '.repeat(200)}`);
  assert.ok(bounded.excerpt.length <= 1_800);
  assert.equal(bounded.localName, 'Budget Brief');
  assert.ok(bounded.localSummary.length <= 180);

  const tooLong = prepareNamingBrief('A'.repeat(200_001));
  assert.equal(tooLong.blocked, true);
  assert.equal(tooLong.excerpt, '');
  assert.match(tooLong.blockReason, /too long/i);
});

test('does not analyze image content', () => {
  const byKind = prepareNamingBrief('Recognizable text content', { kind: 'image' });
  const byExtension = prepareNamingBrief('Recognizable text content', { extension: '.png' });
  for (const result of [byKind, byExtension]) {
    assert.equal(result.blocked, true);
    assert.match(result.blockReason, /images are not included/i);
    assert.equal(result.excerpt, '');
    assert.equal(result.localName, null);
  }
});

test('returns only a sanitized brief contract and handles missing text', () => {
  const result = prepareNamingBrief('Subject: Client Follow-up\nEmail: client@example.org\nNext steps are outlined below.');
  assert.deepEqual(Object.keys(result).sort(), ['blocked', 'excerpt', 'localName', 'localSummary', 'redactions']);
  assert.equal(prepareNamingBrief(null).blocked, true);
  assert.equal(prepareNamingBrief(null).excerpt, '');
});
