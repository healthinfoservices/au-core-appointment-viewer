<script setup>
import { ref, watch } from 'vue'
import { FhirClient } from '../services/fhirClient.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  baseUrl: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'save'])

const draft = ref(props.baseUrl)
const testing = ref(false)
const result = ref(null) // { ok, text }

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      draft.value = props.baseUrl
      result.value = null
    }
  },
)

async function testConnection() {
  testing.value = true
  result.value = null
  try {
    const client = new FhirClient(draft.value)
    const cs = await client.request(`${client.baseUrl}/metadata`)
    const software = [cs?.software?.name, cs?.software?.version].filter(Boolean).join(' ')
    result.value = {
      ok: true,
      text: `Connected. FHIR ${cs?.fhirVersion || 'version not stated'}${software ? ` · ${software}` : ''}`,
    }
  } catch (e) {
    result.value = { ok: false, text: e.message }
  } finally {
    testing.value = false
  }
}

function save() {
  emit('save', draft.value.trim().replace(/\/+$/, ''))
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="560" @update:model-value="emit('update:modelValue', $event)">
    <v-card title="FHIR server" prepend-icon="mdi-server-network">
      <v-card-text>
        <v-text-field
          v-model="draft"
          label="FHIR R4 base URL"
          placeholder="https://your-server/fhir"
          hint="Saved in this browser. Must allow cross-origin (CORS) requests."
          persistent-hint
          autofocus
        />
        <v-alert
          v-if="result"
          :type="result.ok ? 'success' : 'error'"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          {{ result.text }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-btn :loading="testing" :disabled="!draft" prepend-icon="mdi-lan-connect" @click="testConnection">
          Test connection
        </v-btn>
        <v-spacer />
        <v-btn @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!draft" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
