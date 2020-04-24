import React from 'react';
import './App.css';
import UploadPage from './pages/UploadPage';
import ContentContainer from './components/ContentContainer';

const App = () => {
  
  return (
    <div className="App">
      <ContentContainer />
      <UploadPage />
    </div>
  );
  
}

export default App;
