/**
 * App.jsx - OpenLayers Unified Architecture
 *
 * Single renderer approach using OpenLayers with native CRS support
 * Supports both Web Mercator (EPSG:3857) and Polar Stereographic (EPSG:3413)
 */

import { useState } from 'react';
import { MantineProvider } from '@mantine/core';
import OpenLayersUnifiedMap from './components/OpenLayersUnifiedMap';

function App() {
  const [showWelcome, setShowWelcome] = useState(true);

  return (
    <MantineProvider defaultColorScheme="dark">
      {showWelcome ? (
        <WelcomeScreen onEnter={() => setShowWelcome(false)} />
      ) : (
        <OpenLayersUnifiedMap onShowWelcome={() => setShowWelcome(true)} />
      )}
    </MantineProvider>
  );
}

// Simple welcome screen
function WelcomeScreen({ onEnter }) {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: 'white',
    }}>
      <h1 style={{
        fontSize: '2.5rem',
        fontWeight: 700,
        background: 'linear-gradient(135deg, #4fd1c5 0%, #63b3ed 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '1rem',
      }}>
        ECV Explorer
      </h1>
      <p style={{ color: '#888', marginBottom: '0.5rem' }}>
        Essential Climate Variables Visualization
      </p>
      <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '2rem' }}>
        OpenLayers Unified Architecture - Native CRS Support
      </p>
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <Badge>EPSG:3857</Badge>
        <Badge>EPSG:3413</Badge>
        <Badge color="orange">OpenLayers</Badge>
        <Badge>Zarr</Badge>
      </div>
      <button
        onClick={onEnter}
        style={{
          padding: '1rem 3rem',
          fontSize: '1rem',
          fontWeight: 600,
          color: 'white',
          background: 'linear-gradient(135deg, #4fd1c5 0%, #63b3ed 100%)',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.05)';
          e.target.style.boxShadow = '0 0 30px rgba(79, 209, 197, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
          e.target.style.boxShadow = 'none';
        }}
      >
        Enter Explorer
      </button>
    </div>
  );
}

function Badge({ children, color = 'cyan' }) {
  const colors = {
    cyan: { text: '#4fd1c5', bg: 'rgba(79, 209, 197, 0.1)', border: 'rgba(79, 209, 197, 0.3)' },
    orange: { text: '#ed8936', bg: 'rgba(237, 137, 54, 0.1)', border: 'rgba(237, 137, 54, 0.3)' },
  };
  const c = colors[color] || colors.cyan;
  return (
    <span style={{
      padding: '0.25rem 0.75rem',
      fontSize: '0.75rem',
      fontWeight: 500,
      color: c.text,
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '4px',
    }}>
      {children}
    </span>
  );
}

export default App;
