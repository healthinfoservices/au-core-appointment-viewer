// Labels derived from the appointment view model built in appointmentSearch.js.
import { resourceName, conceptText, conceptsText } from './fhirFormat.js'

export function patientLabel(p) {
  return resourceName(p.patient, p.display || p.reference || 'Unknown patient')
}

export function practitionerLabel(p) {
  return resourceName(
    p.practitioner,
    p.practitionerDisplay || p.display || p.reference || 'Unknown practitioner',
  )
}

export function patientNames(vm) {
  return vm.patients.map(patientLabel).join(', ')
}

export function practitionerNames(vm) {
  return vm.practitioners.map(practitionerLabel).join(', ')
}

export function appointmentTypeLabel(vm) {
  const a = vm.appointment
  return (
    conceptText(a.appointmentType) ||
    conceptsText(a.serviceType) ||
    conceptsText(a.serviceCategory) ||
    ''
  )
}
