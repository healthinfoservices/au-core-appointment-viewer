<script setup>
import { computed } from 'vue'
import InfoList from './InfoList.vue'
import { identifierRows, telecomRows, conceptText, conceptsText, titleCase } from '../utils/fhirFormat.js'
import { practitionerLabel } from '../utils/viewModel.js'

// participant: { practitioner, role, display, reference, participantStatus }
const props = defineProps({ participant: { type: Object, required: true } })

const prac = computed(() => props.participant.practitioner)
const role = computed(() => props.participant.role)
const name = computed(() => practitionerLabel(props.participant))
const viaRole = computed(() => props.participant.reference?.includes('PractitionerRole'))

const practitionerRows = computed(() => {
  if (!prac.value) return []
  return [
    { label: 'Gender', value: titleCase(prac.value.gender) },
    {
      label: 'Qualifications',
      value: (prac.value.qualification || []).map((q) => conceptText(q.code)).filter(Boolean).join(', '),
    },
    ...identifierRows(prac.value.identifier).map((i) => ({ label: i.label, value: i.value })),
    ...telecomRows(prac.value.telecom).map((t) => ({
      label: titleCase(t.system) + (t.use ? ` (${t.use})` : ''),
      value: t.value,
    })),
    { label: 'Resource', value: `Practitioner/${prac.value.id}` },
  ]
})

const roleRows = computed(() => {
  if (!role.value) return []
  const r = role.value
  return [
    { label: 'Role', value: conceptsText(r.code) },
    { label: 'Specialty', value: conceptsText(r.specialty) },
    { label: 'Organisation', value: r.organization?.display || r.organization?.reference || '' },
    {
      label: 'Location',
      value: (r.location || []).map((l) => l.display || l.reference).filter(Boolean).join(', '),
    },
    ...identifierRows(r.identifier).map((i) => ({ label: i.label, value: i.value })),
    ...telecomRows(r.telecom).map((t) => ({
      label: titleCase(t.system) + (t.use ? ` (${t.use})` : ''),
      value: t.value,
    })),
    { label: 'Active', value: r.active === undefined ? '' : r.active ? 'Yes' : 'No' },
    { label: 'Resource', value: `PractitionerRole/${r.id}` },
  ]
})
</script>

<template>
  <v-card variant="outlined" class="h-100">
    <v-card-item prepend-icon="mdi-stethoscope">
      <v-card-title>{{ name }}</v-card-title>
      <v-card-subtitle>
        Practitioner<span v-if="participant.participantStatus"> · {{ titleCase(participant.participantStatus) }}</span>
      </v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <v-alert
        v-if="viaRole && !role"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-3"
      >
        Could not load {{ participant.reference }}.
      </v-alert>
      <template v-if="role">
        <div class="text-overline">Practitioner role</div>
        <InfoList :rows="roleRows" />
        <v-divider class="my-3" />
      </template>
      <div v-if="prac" class="text-overline">Practitioner</div>
      <InfoList v-if="prac" :rows="practitionerRows" />
      <v-alert v-else-if="!viaRole || role" type="warning" variant="tonal" density="compact">
        Practitioner record could not be loaded; showing the name from the appointment only.
      </v-alert>
    </v-card-text>
  </v-card>
</template>
