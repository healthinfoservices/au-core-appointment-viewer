import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'

// Components and directives are auto-imported by vite-plugin-vuetify.
export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#00627A',
          secondary: '#4A5D6B',
        },
      },
    },
  },
  defaults: {
    VCard: { rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable' },
  },
})
