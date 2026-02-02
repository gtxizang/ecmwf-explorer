import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import App from './App.jsx'

const theme = createTheme({
  primaryColor: 'cyan',
  fontFamily: 'system-ui, -apple-system, sans-serif',
});

// Note: StrictMode removed because it causes WebGL context loss
// with @carbonplan/maps (double mount/unmount destroys regl context)
createRoot(document.getElementById('root')).render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <App />
  </MantineProvider>,
)
