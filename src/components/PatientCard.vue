<script setup>
import { computed } from 'vue'
import InfoList from './InfoList.vue'
import {
  formatDate,
  ageFrom,
  identifierRows,
  telecomRows,
  addressText,
  indigenousStatus,
  titleCase,
} from '../utils/fhirFormat.js'
import { patientLabel } from '../utils/viewModel.js'

// participant: { patient, display, reference, participantStatus }
const props = defineProps({ participant: { type: Object, required: true } })

const p = computed(() => props.participant.patient)
const name = computed(() => patientLabel(props.participant))

const rows = computed(() => {
  if (!p.value) return []
  const age = ageFrom(p.value.birthDate)
  return [
    {
      label: 'Date of birth',
      value: p.value.birthDate ? `${formatDate(p.value.birthDate)}${age != null ? ` (${age} yrs)` : ''}` : '',
    },
    { label: 'Gender', value: titleCase(p.value.gender) },
    { label: 'Indigenous status', value: indigenousStatus(p.value) },
    ...identifierRows(p.value.identifier).map((i) => ({ label: i.label, value: i.value })),
    ...telecomRows(p.value.telecom).map((t) => ({
      label: titleCase(t.system) + (t.use ? ` (${t.use})` : ''),
      value: t.value,
    })),
    ...(p.value.address || []).map((a, i) => ({
      label: i === 0 ? 'Address' : `Address ${i + 1}`,
      value: addressText(a),
    })),
    { label: 'Participation', value: titleCase(props.participant.participantStatus) },
    { label: 'Resource', value: `Patient/${p.value.id}` },
  ]
})
</script>

<template>
  <v-card variant="outlined" class="h-100">
    <v-card-item prepend-icon="mdi-account">
      <v-card-title>{{ name }}</v-card-title>
      <v-card-subtitle>Patient</v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <v-alert v-if="!p" type="warning" variant="tonal" density="compact">
        Could not load {{ participant.reference || 'this patient' }}; showing the name from the
        appointment only.
      </v-alert>
      <InfoList v-else :rows="rows" />
    </v-card-text>
  </v-card>
</template>
