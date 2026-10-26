import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FhirClient } from '../src/services/fhirClient.js'
import { searchByPatientName } from '../src/services/appointmentSearch.js'
import { patientNames, practitionerNames, appointmentTypeLabel, practitionerLabel } from '../src/utils/viewModel.js'
import { createMockFetch } from './mockServer.js'

test('labels resolve names through Practitioner and PractitionerRole', async () => {
  const { fetchImpl } = createMockFetch()
  const r = await searchByPatientName(new FhirClient('https://example.test/fhir', { fetchImpl }), 'Citizen')
  const byId = Object.fromEntries(r.appointments.map((a) => [a.id, a]))
  assert.equal(patientNames(byId.a1), 'Ms Jane Citizen')
  assert.equal(practitionerNames(byId.a1), 'Dr Anh Nguyen')
  assert.equal(practitionerNames(byId.a2), 'Dr Sam Brown')
})

test('labels fall back to reference display when the resource is missing', () => {
  assert.equal(practitionerLabel({ practitioner: null, display: 'Dr X', reference: 'Practitioner/9' }), 'Dr X')
  assert.equal(practitionerLabel({ practitioner: null, reference: 'Practitioner/9' }), 'Practitioner/9')
})

test('appointmentTypeLabel prefers appointmentType then serviceType', () => {
  const vm = (appointment) => ({ appointment })
  assert.equal(appointmentTypeLabel(vm({ appointmentType: { text: 'Follow-up' }, serviceType: [{ text: 'GP' }] })), 'Follow-up')
  assert.equal(appointmentTypeLabel(vm({ serviceType: [{ coding: [{ display: 'General practice' }] }] })), 'General practice')
  assert.equal(appointmentTypeLabel(vm({})), '')
})
