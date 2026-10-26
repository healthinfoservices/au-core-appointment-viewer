import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FhirClient, FhirError, referenceKey } from '../src/services/fhirClient.js'
import {
  searchByPatientName,
  searchByPractitionerName,
  searchByDate,
  dayBounds,
  localToday,
  toFhirInstant,
} from '../src/services/appointmentSearch.js'
import { createMockFetch } from './mockServer.js'

const BASE = 'https://example.test/fhir'
const client = (opts) => {
  const mock = createMockFetch(opts)
  return { c: new FhirClient(BASE, { fetchImpl: mock.fetchImpl }), calls: mock.calls }
}

test('referenceKey normalises relative, absolute and versioned references', () => {
  assert.equal(referenceKey('Patient/1'), 'Patient/1')
  assert.equal(referenceKey('https://x.org/fhir/Patient/1'), 'Patient/1')
  assert.equal(referenceKey('Patient/1/_history/3'), 'Patient/1')
  assert.equal(referenceKey('#contained'), null)
  assert.equal(referenceKey('urn:uuid:abc'), null)
  assert.equal(referenceKey(undefined), null)
})

test('patient name search finds appointments with both practitioner patterns', async () => {
  const { c } = client()
  const r = await searchByPatientName(c, 'citizen')
  assert.deepEqual(r.appointments.map((a) => a.id), ['a2', 'a1']) // sorted by start
  const a1 = r.appointments.find((a) => a.id === 'a1')
  assert.equal(a1.patients[0].patient.id, 'p1')
  assert.equal(a1.practitioners[0].practitioner.id, 'd1')
  assert.equal(a1.practitioners[0].role, null)
  const a2 = r.appointments.find((a) => a.id === 'a2')
  assert.equal(a2.practitioners[0].role.id, 'r2')
  assert.equal(a2.practitioners[0].practitioner.id, 'd2')
  assert.deepEqual(r.failures, [])
})

test('practitioner name search matches PractitionerRole-based appointments', async () => {
  const { c, calls } = client()
  const r = await searchByPractitionerName(c, 'Brown')
  assert.deepEqual(r.appointments.map((a) => a.id).sort(), ['a2', 'a3'])
  assert.ok(calls.some((u) => u.includes('PractitionerRole?practitioner=')))
  const actorCall = decodeURIComponent(calls.find((u) => u.includes('Appointment?actor=')))
  assert.ok(actorCall.includes('Practitioner/d2') && actorCall.includes('PractitionerRole/r2'))
})

test('practitioner name search matches direct Practitioner appointments', async () => {
  const { c } = client()
  const r = await searchByPractitionerName(c, 'nguyen')
  assert.deepEqual(r.appointments.map((a) => a.id), ['a1'])
})

test('no matching patient returns an empty result with a note, no Appointment query', async () => {
  const { c, calls } = client()
  const r = await searchByPatientName(c, 'zzz')
  assert.equal(r.appointments.length, 0)
  assert.match(r.note, /No patients/)
  assert.ok(!calls.some((u) => u.includes('/Appointment')))
})

test('date search sends explicit-offset bounds and filters by start', async () => {
  const { c, calls } = client()
  const r = await searchByDate(c, '2026-10-16')
  const url = decodeURIComponent(calls[0])
  assert.match(url, /date=ge2026-10-16T00:00:00[+-]\d{2}:\d{2}/)
  assert.match(url, /date=lt2026-10-17T00:00:00[+-]\d{2}:\d{2}/)
  // Fixture times are +10:00, so only assert exact ids when the test runs in AEST.
  if (new Date('2026-10-16T00:00:00').getTimezoneOffset() === -600) {
    assert.deepEqual(r.appointments.map((a) => a.id), ['a3', 'a1'])
  }
})

test('URL encodes the + in timezone offsets', () => {
  const c = new FhirClient(BASE, { fetchImpl: async () => {} })
  const url = c.buildUrl('Appointment', [['date', 'ge2026-10-16T00:00:00+10:00']])
  assert.ok(url.includes('%2B10%3A00'), url)
})

test('falls back to plain search and individual reads when _include is rejected', async () => {
  const { c, calls } = client({ rejectIncludes: true })
  const r = await searchByPatientName(c, 'Citizen')
  assert.equal(r.appointments.length, 2)
  assert.ok(calls.some((u) => /\/Patient\/p1$/.test(u)))
  assert.ok(calls.some((u) => /\/PractitionerRole\/r2$/.test(u)))
  assert.ok(calls.some((u) => /\/Practitioner\/d2$/.test(u)))
  assert.equal(r.appointments.find((a) => a.id === 'a2').practitioners[0].practitioner.id, 'd2')
})

test('resolves references individually when server ignores _include', async () => {
  const { c } = client({ omitIncludes: true })
  const r = await searchByDate(c, '2026-10-15')
  if (new Date('2026-10-15T00:00:00').getTimezoneOffset() === -600) {
    assert.equal(r.appointments[0].practitioners[0].practitioner.id, 'd2')
  }
})

test('server errors surface OperationOutcome diagnostics', async () => {
  const c = new FhirClient(BASE, {
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ resourceType: 'OperationOutcome', issue: [{ diagnostics: 'boom' }] }),
    }),
  })
  await assert.rejects(() => searchByDate(c, '2026-10-16'), (e) => e instanceof FhirError && /500: boom/.test(e.message))
})

test('network failure gives a CORS/network hint', async () => {
  const c = new FhirClient(BASE, { fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
  await assert.rejects(() => searchByDate(c, '2026-10-16'), /network error or CORS/)
})

test('follows next links and reports truncation at maxPages', async () => {
  let n = 0
  const c = new FhirClient(BASE, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Appointment', id: `x${n++}`, participant: [] } }],
        link: [{ relation: 'next', url: `${BASE}/page${n}` }],
      }),
    }),
  })
  const r = await c.searchAll('Appointment', [], { maxPages: 3 })
  assert.equal(r.resources.length, 3)
  assert.equal(r.truncated, true)
})

test('dayBounds / localToday / toFhirInstant', () => {
  const [ge, lt] = dayBounds('2026-12-31')
  assert.match(ge, /^2026-12-31T00:00:00[+-]\d{2}:\d{2}$/)
  assert.match(lt, /^2027-01-01T00:00:00[+-]\d{2}:\d{2}$/)
  assert.equal(localToday(new Date(2026, 9, 16, 12)), '2026-10-16')
  assert.match(toFhirInstant(new Date(2026, 0, 2, 3, 4, 5)), /^2026-01-02T03:04:05[+-]\d{2}:\d{2}$/)
  assert.throws(() => dayBounds('16/10/2026'), FhirError)
})

test('empty search terms are rejected', async () => {
  const { c } = client()
  await assert.rejects(() => searchByPatientName(c, '  '), FhirError)
  await assert.rejects(() => searchByPractitionerName(c, ''), FhirError)
})
