// Display helpers for FHIR R4 datatypes. Framework-free.

/**
 * Labels for identifier systems commonly seen in AU Core data.
 * These URIs are from memory of the AU Base / AU Core IGs and should be
 * checked against the IG version your data was built with. Anything not
 * listed falls back to the identifier's own type text/coding.
 */
export const AU_IDENTIFIER_SYSTEMS = {
  'http://ns.electronichealth.net.au/id/hi/ihi/1.0': 'IHI',
  'http://ns.electronichealth.net.au/id/medicare-number': 'Medicare number',
  'http://ns.electronichealth.net.au/id/dva': 'DVA number',
  'http://ns.electronichealth.net.au/id/hi/hpii/1.0': 'HPI-I',
  'http://ns.electronichealth.net.au/id/hi/hpio/1.0': 'HPI-O',
  'http://ns.electronichealth.net.au/id/medicare-provider-number': 'Medicare provider number',
}

/** AU Base Indigenous Status extension URL (verify against your IG version). */
export const INDIGENOUS_STATUS_URL = 'http://hl7.org.au/fhir/StructureDefinition/indigenous-status'

export function codingText(coding) {
  if (!coding) return ''
  return coding.display || coding.code || ''
}

export function conceptText(cc) {
  if (!cc) return ''
  if (cc.text) return cc.text
  const c = (cc.coding || []).find((x) => x.display) || (cc.coding || [])[0]
  return codingText(c)
}

export function conceptsText(list, sep = ', ') {
  return (list || []).map(conceptText).filter(Boolean).join(sep)
}

/** Pick the most appropriate HumanName: official, then usual, then first. */
export function pickName(names) {
  if (!names?.length) return null
  const current = names.filter((n) => !n.period?.end || n.period.end >= new Date().toISOString())
  const pool = current.length ? current : names
  return (
    pool.find((n) => n.use === 'official') ||
    pool.find((n) => n.use === 'usual') ||
    pool.find((n) => n.use !== 'old' && n.use !== 'maiden') ||
    pool[0]
  )
}

export function humanName(nameOrNames, { withPrefix = true } = {}) {
  const n = Array.isArray(nameOrNames) ? pickName(nameOrNames) : nameOrNames
  if (!n) return ''
  if (n.text) return n.text
  return [
    withPrefix ? (n.prefix || []).join(' ') : '',
    (n.given || []).join(' '),
    n.family || '',
    (n.suffix || []).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
}

/** Display name for a Patient/Practitioner resource, with a fallback string. */
export function resourceName(resource, fallback = '') {
  return humanName(resource?.name) || fallback
}

export function identifierLabel(id) {
  if (!id) return ''
  if (id.system && AU_IDENTIFIER_SYSTEMS[id.system]) return AU_IDENTIFIER_SYSTEMS[id.system]
  return conceptText(id.type) || id.system || 'Identifier'
}

export function identifierRows(identifiers) {
  return (identifiers || [])
    .filter((i) => i.value)
    .map((i) => ({ label: identifierLabel(i), value: i.value, system: i.system || '' }))
}

export function addressText(a) {
  if (!a) return ''
  if (a.text) return a.text
  return [(a.line || []).join(', '), a.city, a.state, a.postalCode, a.country]
    .filter(Boolean)
    .join(', ')
}

export function telecomRows(telecom) {
  return (telecom || [])
    .filter((t) => t.value)
    .map((t) => ({ system: t.system || 'other', use: t.use || '', value: t.value }))
}

/** Format a FHIR date (YYYY, YYYY-MM or YYYY-MM-DD) without timezone shifting. */
export function formatDate(fhirDate, locale = 'en-AU') {
  if (!fhirDate) return ''
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(fhirDate)
  if (!m) return fhirDate
  const [, y, mo, d] = m
  if (!mo) return y
  const date = new Date(Number(y), Number(mo) - 1, Number(d || 1))
  const opts = d ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'short', year: 'numeric' }
  return new Intl.DateTimeFormat(locale, opts).format(date)
}

/** Format a FHIR dateTime/instant in the viewer's local timezone. */
export function formatDateTime(value, locale = 'en-AU', opts = {}) {
  if (!value) return ''
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) return formatDate(value, locale)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...opts,
  }).format(d)
}

export function formatTime(value, locale = 'en-AU') {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d)
}

/** Duration in minutes from start/end, falling back to minutesDuration. */
export function durationMinutes(appointment) {
  if (appointment?.start && appointment?.end) {
    const ms = new Date(appointment.end) - new Date(appointment.start)
    if (Number.isFinite(ms) && ms >= 0) return Math.round(ms / 60000)
  }
  return appointment?.minutesDuration ?? null
}

/** Whole years between a FHIR birthDate and `now`. */
export function ageFrom(birthDate, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate || '')
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  let age = now.getFullYear() - y
  const beforeBirthday = now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)
  if (beforeBirthday) age -= 1
  return age >= 0 ? age : null
}

export function extensionValue(resource, url) {
  const ext = (resource?.extension || []).find((e) => e.url === url)
  if (!ext) return null
  return (
    ext.valueCoding ||
    ext.valueCodeableConcept ||
    ext.valueString ||
    ext.valueCode ||
    ext.valueBoolean ||
    null
  )
}

export function indigenousStatus(patient) {
  const v = extensionValue(patient, INDIGENOUS_STATUS_URL)
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.coding ? conceptText(v) : codingText(v)
}

/** Vuetify colour for an Appointment.status (R4 value set). */
export function statusColor(status) {
  return (
    {
      proposed: 'grey',
      pending: 'amber-darken-2',
      booked: 'primary',
      arrived: 'teal',
      fulfilled: 'green',
      cancelled: 'red',
      noshow: 'deep-orange',
      'entered-in-error': 'grey-darken-1',
      'checked-in': 'teal-darken-1',
      waitlist: 'purple',
    }[status] || 'grey'
  )
}

export function titleCase(s) {
  return (s || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
