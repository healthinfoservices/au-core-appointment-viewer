// Appointment search strategies and reference resolution.
//
// Design choice: name searches run in two steps (find Patient/Practitioner
// ids first, then Appointments by reference) instead of chained parameters
// such as `Appointment?patient.name=`. Chaining support differs between
// servers, and practitioner-via-PractitionerRole would need a double chain,
// so the two-step form is the more portable option.

import { FhirClient, FhirError, referenceKey, referenceType } from './fhirClient.js'

/** Max references per Appointment query, to keep URLs a reasonable length. */
export const REF_CHUNK = 40

const INCLUDES = [
  ['_include', 'Appointment:patient'],
  ['_include', 'Appointment:practitioner'],
  ['_include', 'Appointment:actor'],
  ['_include:iterate', 'PractitionerRole:practitioner'],
]

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function unique(arr) {
  return [...new Set(arr)]
}

/** Run async fn over items, at most `limit` at once. Never rejects. */
async function settleLimited(items, limit, fn) {
  const results = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      try {
        results[idx] = { ok: true, value: await fn(items[idx]) }
      } catch (error) {
        results[idx] = { ok: false, error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Format a Date as a FHIR instant with the local UTC offset. */
export function toFhirInstant(date) {
  const pad = (n) => String(Math.abs(n)).padStart(2, '0')
  const off = -date.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  )
}

/**
 * Local-day bounds for a "YYYY-MM-DD" string, as [startInclusive, endExclusive]
 * FHIR instants. Using explicit offsets avoids the server applying its own
 * timezone to a bare date.
 */
export function dayBounds(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '')
  if (!m) throw new FhirError(`Invalid date "${isoDate}" (expected YYYY-MM-DD)`)
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0)
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1, 0, 0, 0)
  return [toFhirInstant(start), toFhirInstant(end)]
}

/** Today's date in the browser's local timezone as YYYY-MM-DD. */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Appointment search with _include. If the server rejects the include
 * parameters (HTTP 400), retry without them; missing references are then
 * fetched individually by resolveReferences().
 */
async function appointmentQuery(client, params, opts) {
  const base = [...params, ['_count', '50']]
  try {
    return await client.searchAll('Appointment', [...base, ...INCLUDES], opts)
  } catch (err) {
    if (err instanceof FhirError && err.status === 400) {
      return client.searchAll('Appointment', base, opts)
    }
    throw err
  }
}

/** Collect results from several Appointment queries into one store. */
async function runAppointmentQueries(client, paramSets, opts) {
  const store = new Map()
  const appointmentIds = []
  let truncated = false
  for (const params of paramSets) {
    const { resources, truncated: t } = await appointmentQuery(client, params, opts)
    truncated = truncated || t
    for (const { resource } of resources) {
      const key = `${resource.resourceType}/${resource.id}`
      store.set(key, resource)
      if (resource.resourceType === 'Appointment' && !appointmentIds.includes(key)) {
        appointmentIds.push(key)
      }
    }
  }
  return { store, appointmentIds, truncated }
}

/**
 * Read any Patient, Practitioner or PractitionerRole referenced by the
 * appointments that the bundle did not already include, then any
 * Practitioner referenced by those roles. Failures are recorded, not thrown.
 */
export async function resolveReferences(client, store, appointmentIds) {
  const wanted = new Set(['Patient', 'Practitioner', 'PractitionerRole'])
  const failures = []

  const missing = (refs) =>
    unique(refs.map(referenceKey).filter((k) => k && wanted.has(k.split('/')[0]) && !store.has(k)))

  async function fetchInto(keys) {
    const results = await settleLimited(keys, 6, (k) => client.read(k))
    results.forEach((r, i) => {
      if (r.ok && r.value?.resourceType) store.set(`${r.value.resourceType}/${r.value.id}`, r.value)
      else failures.push({ reference: keys[i], error: r.error?.message || 'Unknown error' })
    })
  }

  const participantRefs = appointmentIds.flatMap((k) =>
    (store.get(k)?.participant || []).map((p) => p.actor?.reference),
  )
  await fetchInto(missing(participantRefs))

  const roleRefs = [...store.values()]
    .filter((r) => r.resourceType === 'PractitionerRole')
    .map((r) => r.practitioner?.reference)
  await fetchInto(missing(roleRefs))

  return failures
}

/** Turn an Appointment plus the resource store into a view model. */
export function buildViewModel(appointment, store) {
  const patients = []
  const practitioners = []
  const others = []

  for (const p of appointment.participant || []) {
    const ref = p.actor?.reference
    const key = referenceKey(ref)
    const type = referenceType(ref)
    const base = {
      reference: ref || null,
      display: p.actor?.display || '',
      participantStatus: p.status || '',
      required: p.required || '',
      participantType: p.type || [],
    }
    if (type === 'Patient') {
      patients.push({ ...base, patient: store.get(key) || null })
    } else if (type === 'Practitioner') {
      practitioners.push({ ...base, practitioner: store.get(key) || null, role: null })
    } else if (type === 'PractitionerRole') {
      const role = store.get(key) || null
      const pracKey = referenceKey(role?.practitioner?.reference)
      practitioners.push({
        ...base,
        role,
        practitioner: pracKey ? store.get(pracKey) || null : null,
        practitionerDisplay: role?.practitioner?.display || '',
      })
    } else {
      others.push({ ...base, type: type || 'Unknown' })
    }
  }

  return {
    key: `Appointment/${appointment.id}`,
    id: appointment.id,
    appointment,
    start: appointment.start || null,
    end: appointment.end || null,
    status: appointment.status || 'unknown',
    patients,
    practitioners,
    others,
  }
}

function finish(store, appointmentIds) {
  return appointmentIds
    .map((k) => buildViewModel(store.get(k), store))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
}

const emptyResult = (note) => ({ appointments: [], truncated: false, failures: [], note })

/** Search Appointments for patients whose name matches `name`. */
export async function searchByPatientName(client, name, opts = {}) {
  const term = (name || '').trim()
  if (!term) throw new FhirError('Enter a patient name to search')
  const { resources, truncated: pt } = await client.searchAll(
    'Patient',
    [['name', term], ['_count', '50']],
    opts,
  )
  const refs = unique(
    resources.filter((r) => r.resource.resourceType === 'Patient').map((r) => `Patient/${r.resource.id}`),
  )
  if (!refs.length) return emptyResult(`No patients found matching "${term}"`)

  const sets = chunk(refs, REF_CHUNK).map((c) => [['patient', c.join(',')]])
  const { store, appointmentIds, truncated } = await runAppointmentQueries(client, sets, opts)
  const failures = await resolveReferences(client, store, appointmentIds)
  return {
    appointments: finish(store, appointmentIds),
    truncated: truncated || pt,
    failures,
    note: `${refs.length} matching patient${refs.length === 1 ? '' : 's'}`,
  }
}

/**
 * Search Appointments for practitioners whose name matches `name`,
 * whether the Appointment references the Practitioner directly or a
 * PractitionerRole that points at them.
 */
export async function searchByPractitionerName(client, name, opts = {}) {
  const term = (name || '').trim()
  if (!term) throw new FhirError('Enter a practitioner name to search')
  const { resources, truncated: pt } = await client.searchAll(
    'Practitioner',
    [['name', term], ['_count', '50']],
    opts,
  )
  const pracRefs = unique(
    resources
      .filter((r) => r.resource.resourceType === 'Practitioner')
      .map((r) => `Practitioner/${r.resource.id}`),
  )
  if (!pracRefs.length) return emptyResult(`No practitioners found matching "${term}"`)

  // Find roles for those practitioners so role-based appointments match too.
  const prefill = new Map(
    resources
      .filter((r) => r.resource.resourceType === 'Practitioner')
      .map((r) => [`Practitioner/${r.resource.id}`, r.resource]),
  )
  const roleRefs = []
  let roleTruncated = false
  for (const c of chunk(pracRefs, REF_CHUNK)) {
    const { resources: roles, truncated } = await client.searchAll(
      'PractitionerRole',
      [['practitioner', c.join(',')], ['_count', '50']],
      opts,
    )
    roleTruncated = roleTruncated || truncated
    for (const { resource } of roles) {
      if (resource.resourceType === 'PractitionerRole') {
        roleRefs.push(`PractitionerRole/${resource.id}`)
        prefill.set(`PractitionerRole/${resource.id}`, resource)
      }
    }
  }

  const actorRefs = unique([...pracRefs, ...roleRefs])
  const sets = chunk(actorRefs, REF_CHUNK).map((c) => [['actor', c.join(',')]])
  const { store, appointmentIds, truncated } = await runAppointmentQueries(client, sets, opts)
  for (const [k, v] of prefill) if (!store.has(k)) store.set(k, v)
  const failures = await resolveReferences(client, store, appointmentIds)
  return {
    appointments: finish(store, appointmentIds),
    truncated: truncated || pt || roleTruncated,
    failures,
    note: `${pracRefs.length} matching practitioner${pracRefs.length === 1 ? '' : 's'}`,
  }
}

/** Search Appointments starting on a local calendar day (YYYY-MM-DD). */
export async function searchByDate(client, isoDate, opts = {}) {
  const [ge, lt] = dayBounds(isoDate)
  const { store, appointmentIds, truncated } = await runAppointmentQueries(
    client,
    [[['date', `ge${ge}`], ['date', `lt${lt}`]]],
    opts,
  )
  const failures = await resolveReferences(client, store, appointmentIds)
  return { appointments: finish(store, appointmentIds), truncated, failures, note: '' }
}

export { FhirClient }
