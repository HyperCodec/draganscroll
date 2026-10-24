import { useCallback, useState } from 'react';
import { isPdfFile } from './lib/pdfFile';
import PdfViewer from './components/PdfViewer';
import UploadScreen from './components/UploadScreen';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function handleFile(candidate: File) {
    if (!isPdfFile(candidate)) {
      setFileError('Please choose a PDF file to start reading.');
      return;
    }

    setFileError(null);
    setFile(candidate);
  }

  const handleViewerError = useCallback((message: string) => {
    setFileError(message);
    setFile(null);
  }, []);

  if (file) {
    return (
      <PdfViewer
        file={file}
        onBack={() => {
          setFile(null);
          setFileError(null);
        }}
        onError={handleViewerError}
      />
    );
  }

  return (
    <UploadScreen
      error={fileError}
      onFile={handleFile}
    />
  );
}

export default App;
