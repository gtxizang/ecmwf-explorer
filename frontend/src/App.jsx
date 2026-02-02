import { useState, useEffect } from 'react';
import { MantineProvider } from '@mantine/core';
import { ZarrMap } from './components/ZarrMap';
import PolarMap from './components/PolarMap';
import { GlobeView } from './components/GlobeView';
import { getFeatureFlags } from './config/featureFlags';

function App() {
  // Check URL params for sea_ice dataset - if so, start in polar mode
  const getInitialViewMode = () => {
    const params = new URLSearchParams(window.location.search);
    const dataset = params.get('dataset');
    return dataset === 'sea_ice' ? 'polar' : 'standard';
  };

  const [viewMode, setViewMode] = useState(getInitialViewMode);
  const [globeData, setGlobeData] = useState(null);

  // Handler to switch to globe view with current data
  const handleGlobeView = (data) => {
    setGlobeData(data);
    setViewMode('globe');
  };

  return (
    <MantineProvider defaultColorScheme="dark">
      {viewMode === 'polar' ? (
        <PolarMap onBack={() => setViewMode('standard')} />
      ) : viewMode === 'globe' ? (
        <GlobeView
          imageUrl={globeData?.imageUrl}
          bounds={globeData?.bounds}
          datasetName={globeData?.datasetName}
          loading={globeData?.loading || false}
          loadDuration={globeData?.loadDuration}
          onExit={() => setViewMode('standard')}
        />
      ) : (
        <ZarrMap
          onPolarView={() => setViewMode('polar')}
          onGlobeView={handleGlobeView}
        />
      )}
    </MantineProvider>
  );
}

export default App;
