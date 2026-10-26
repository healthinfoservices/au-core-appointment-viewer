import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  humanName,
  conceptText,
  identifierRows,
  addressText,
  formatDate,
  durationMinutes,
  ageFrom,
  indigenousStatus,
  statusColor,
  INDIGENOUS_STATUS_URL,
} from '../src/utils/fhirFormat.js'

test('humanName prefers official name and joins parts', () => {
  const names = [
    { use: 'usual', given: ['Jenny'], family: 'Citizen' },
    { use: 'official', prefix: ['Ms'], given: ['Jane', 'A'], family: 'Citizen' },
  ]
  assert.equal(humanName(names), 'Ms Jane A Citizen')
  assert.equal(humanName(names, { withPrefix: false }), 'Jane A Citizen')
  assert.equal(humanName([{ text: 'Dr Who' }]), 'Dr Who')
  assert.equal(humanName([]), '')
})

test('humanName skips names whose period has ended', () => {
  const names = [
    { use: 'official', family: 'Old', period: { end: '2000-01-01' } },
    { use: 'usual', family: 'New' },
  ]
  assert.equal(humanName(names), 'New')
})

test('conceptText falls back text → display → code', () => {
  assert.equal(conceptText({ text: 'T', coding: [{ display: 'D' }] }), 'T')
  assert.equal(conceptText({ coding: [{ code: 'c' }, { display: 'D' }] }), 'D')
  assert.equal(conceptText({ coding: [{ code: 'c' }] }), 'c')
  assert.equal(conceptText(null), '')
})

test('identifierRows labels AU systems and falls back to type', () => {
  const rows = identifierRows([
    { system: 'http://ns.electronichealth.net.au/id/hi/ihi/1.0', value: '800360' },
    { system: 'urn:local', type: { text: 'MRN' }, value: '42' },
    { system: 'urn:x', value: '' },
  ])
  assert.deepEqual(rows.map((r) => r.label), ['IHI', 'MRN'])
})

test('addressText', () => {
  assert.equal(
    addressText({ line: ['1 Queen St'], city: 'Brisbane', state: 'QLD', postalCode: '4000' }),
    '1 Queen St, Brisbane, QLD, 4000',
  )
})

test('formatDate does not shift date-only values across timezones', () => {
  assert.match(formatDate('1985-03-21', 'en-AU'), /21/)
  assert.equal(formatDate('1985'), '1985')
})

test('durationMinutes uses start/end, then minutesDuration', () => {
  assert.equal(durationMinutes({ start: '2026-10-16T09:00:00+10:00', end: '2026-10-16T09:20:00+10:00' }), 20)
  assert.equal(durationMinutes({ minutesDuration: 30 }), 30)
  assert.equal(durationMinutes({}), null)
})

test('ageFrom handles birthdays not yet reached', () => {
  const now = new Date(2026, 9, 16)
  assert.equal(ageFrom('1985-03-21', now), 41)
  assert.equal(ageFrom('1985-12-01', now), 40)
  assert.equal(ageFrom('', now), null)
})

test('indigenousStatus reads valueCoding', () => {
  const p = { extension: [{ url: INDIGENOUS_STATUS_URL, valueCoding: { code: '4', display: 'Neither Aboriginal nor Torres Strait Islander origin' } }] }
  assert.match(indigenousStatus(p), /Neither/)
  assert.equal(indigenousStatus({}), '')
})

test('statusColor has a default', () => {
  assert.equal(statusColor('booked'), 'primary')
  assert.equal(statusColor('weird'), 'grey')
})
