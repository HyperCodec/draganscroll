import { useRef, useState } from 'react';

type UploadScreenProps = {
  error: string | null;
  onFile: (file: File) => void;
};

function UploadScreen({ error, onFile }: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function selectFirstFile(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <main className="upload-page">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">d</span>
        <span>draganscroll</span>
      </header>

      <section className="upload-content" aria-labelledby="upload-title">
        <p className="eyebrow">A quieter way to read</p>
        <h1 id="upload-title">Make room for focus.</h1>
        <p className="upload-description">
          Open a PDF and settle into a clean, distraction-free reading space.
        </p>

        <button
          className={`drop-zone${isDragging ? ' drop-zone-active' : ''}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            selectFirstFile(event.dataTransfer.files);
          }}
          aria-label="Choose or drop a PDF file"
        >
          <span className="upload-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" />
            </svg>
          </span>
          <span className="drop-title">Drop your PDF here</span>
          <span className="drop-subtitle">or click to browse your files</span>
          <span className="file-type">PDF files only</span>
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            selectFirstFile(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
        {error && <p className="error-message" role="alert">{error}</p>}
        <p className="privacy-note">
          Your document stays on your device.
        </p>
      </section>
    </main>
  );
}

export default UploadScreen;
