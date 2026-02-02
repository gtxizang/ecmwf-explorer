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
    return (dataset === 'sea_ice' || dataset === 'sea_ice_with_quality') ? 'polar' : 'standard';
  };

  const getInitialPolarDataset = () => {
    const params = new URLSearchParams(window.location.search);
    const dataset = params.get('dataset');
    return (dataset === 'sea_ice' || dataset === 'sea_ice_with_quality') ? dataset : 'sea_ice';
  };

  const [viewMode, setViewMode] = useState(getInitialViewMode);
  const [polarDataset, setPolarDataset] = useState(getInitialPolarDataset);
  const [globeData, setGlobeData] = useState(null);

  // Handler to switch to polar view with optional dataset
  const handlePolarView = (dataset = 'sea_ice') => {
    setPolarDataset(dataset);
    setViewMode('polar');
  };

  // Handler to switch to globe view with current data
  const handleGlobeView = (data) => {
    setGlobeData(data);
    setViewMode('globe');
  };

  return (
    <MantineProvider defaultColorScheme="dark">
      {viewMode === 'polar' ? (
        <PolarMap onBack={() => setViewMode('standard')} initialDataset={polarDataset} />
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
          onPolarView={handlePolarView}
          onGlobeView={handleGlobeView}
        />
      )}
    </MantineProvider>
  );
}

export default App;
