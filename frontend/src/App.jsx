/**
 * App.jsx - Unified Architecture with Solution Selector
 *
 * Allows user to choose between:
 * - Option 1: OpenLayers (native multi-CRS support) - 2D
 * - Option 2: Leaflet (proj4leaflet for multi-CRS) - 2D
 * - Option 3: deck.gl (GlobeView for 3D rotating globe)
 */

import { useState } from 'react';
import { MantineProvider } from '@mantine/core';
import OpenLayersUnifiedMap from './components/OpenLayersUnifiedMap';
import LeafletUnifiedMap from './components/LeafletUnifiedMap';
import CesiumGlobeMap from './components/CesiumGlobeMap';

function App() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [selectedSolution, setSelectedSolution] = useState(null);

  const handleEnter = (solution) => {
    setSelectedSolution(solution);
    setShowWelcome(false);
  };

  const handleShowWelcome = () => {
    setShowWelcome(true);
    setSelectedSolution(null);
  };

  return (
    <MantineProvider defaultColorScheme="dark">
      {showWelcome ? (
        <WelcomeScreen onEnter={handleEnter} />
      ) : selectedSolution === 'openlayers' ? (
        <OpenLayersUnifiedMap onShowWelcome={handleShowWelcome} />
      ) : selectedSolution === 'globe' ? (
        <CesiumGlobeMap onShowWelcome={handleShowWelcome} />
      ) : (
        <LeafletUnifiedMap onShowWelcome={handleShowWelcome} />
      )}
    </MantineProvider>
  );
}

// Welcome screen with solution selector
function WelcomeScreen({ onEnter }) {
  const [hoveredSolution, setHoveredSolution] = useState(null);

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
        Unified Architecture - Multi-CRS Support
      </p>

      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <Badge>EPSG:3857</Badge>
        <Badge>EPSG:3413</Badge>
        <Badge color="violet">3D Globe</Badge>
        <Badge>Zarr</Badge>
        <Badge>LOD Pyramids</Badge>
      </div>

      <p style={{ color: '#888', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Select a rendering solution:
      </p>

      <div style={{
        display: 'flex',
        gap: '1.5rem',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {/* CesiumJS Option - Primary */}
        <SolutionCard
          title="CesiumJS 2D/3D"
          description="Unified 2D + 3D with polar reprojection"
          features={['3D Globe + 2D Map toggle', 'Polar data reprojected', 'All datasets supported']}
          color="#b794f4"
          isHovered={hoveredSolution === 'globe'}
          onMouseEnter={() => setHoveredSolution('globe')}
          onMouseLeave={() => setHoveredSolution(null)}
          onClick={() => onEnter('globe')}
        />

        {/* OpenLayers Option */}
        <SolutionCard
          title="OpenLayers 2D"
          description="Native multi-CRS support with proj4 registration"
          features={['EPSG:3857 + EPSG:3413', 'ImageStatic layers', 'Smooth pan/zoom']}
          color="#ed8936"
          isHovered={hoveredSolution === 'openlayers'}
          onMouseEnter={() => setHoveredSolution('openlayers')}
          onMouseLeave={() => setHoveredSolution(null)}
          onClick={() => onEnter('openlayers')}
        />

        {/* Leaflet Option */}
        <SolutionCard
          title="Leaflet 2D"
          description="proj4leaflet for multi-CRS support"
          features={['EPSG:3857 + EPSG:3413', 'Canvas rendering', 'Wide ecosystem']}
          color="#4fd1c5"
          isHovered={hoveredSolution === 'leaflet'}
          onMouseEnter={() => setHoveredSolution('leaflet')}
          onMouseLeave={() => setHoveredSolution(null)}
          onClick={() => onEnter('leaflet')}
        />
      </div>

      {/* Quick enter button */}
      <button
        onClick={() => onEnter('globe')}
        style={{
          padding: '0.75rem 2rem',
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#888',
          background: 'transparent',
          border: '1px solid rgba(79, 209, 197, 0.3)',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.target.style.borderColor = 'rgba(79, 209, 197, 0.6)';
          e.target.style.color = '#4fd1c5';
        }}
        onMouseLeave={(e) => {
          e.target.style.borderColor = 'rgba(79, 209, 197, 0.3)';
          e.target.style.color = '#888';
        }}
      >
        Enter Explorer (CesiumJS)
      </button>
    </div>
  );
}

function SolutionCard({ title, description, features, color, isHovered, onMouseEnter, onMouseLeave, onClick }) {
  const colorToRgb = {
    '#ed8936': '237, 137, 54',
    '#4fd1c5': '79, 209, 197',
    '#b794f4': '183, 148, 244',
  };
  const rgb = colorToRgb[color] || '79, 209, 197';

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: 200,
        padding: '1.5rem',
        background: isHovered ? `rgba(${rgb}, 0.1)` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isHovered ? color : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: isHovered ? `0 8px 30px rgba(${rgb}, 0.2)` : 'none',
      }}
    >
      <h3 style={{
        fontSize: '1.25rem',
        fontWeight: 600,
        color: color,
        marginBottom: '0.5rem',
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: '0.75rem',
        color: '#888',
        marginBottom: '1rem',
        lineHeight: 1.4,
      }}>
        {description}
      </p>
      <ul style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
      }}>
        {features.map((feature, i) => (
          <li key={i} style={{
            fontSize: '0.7rem',
            color: '#666',
            marginBottom: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ color: color }}>•</span>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Badge({ children, color = 'cyan' }) {
  const colors = {
    cyan: { text: '#4fd1c5', bg: 'rgba(79, 209, 197, 0.1)', border: 'rgba(79, 209, 197, 0.3)' },
    orange: { text: '#ed8936', bg: 'rgba(237, 137, 54, 0.1)', border: 'rgba(237, 137, 54, 0.3)' },
    violet: { text: '#b794f4', bg: 'rgba(183, 148, 244, 0.1)', border: 'rgba(183, 148, 244, 0.3)' },
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
