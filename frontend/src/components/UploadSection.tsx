import { useState, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react';
import { Upload, File, X, PenLine } from 'lucide-react';

interface UploadSectionProps {
  onFileSelect: (file: File | null) => void;
  onManualEntry: () => void;
  resetKey: number;
}

type Mode = null | 'upload' | 'manual';

export default function UploadSection({ onFileSelect, onManualEntry, resetKey }: UploadSectionProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>(null);

  // Reset internal state when resetKey changes
  useEffect(() => {
    setSelectedFile(null);
    setMode(null);
    setDragActive(false);
  }, [resetKey]);

  const handleDrag = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const removeFile = () => {
    setSelectedFile(null);
    onFileSelect(null);
    setMode(null);
  };

  const handleManualClick = () => {
    setMode('manual');
    onManualEntry();
  };

  const handleUploadClick = () => {
    setMode('upload');
  };

  const handleBack = () => {
    setMode(null);
  };

  // Selection mode - show both options
  if (mode === null) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch">
          {/* Upload Screenshot Option */}
          <button
            onClick={handleUploadClick}
            className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent/50 hover:border-primary transition-all duration-200 border-border group"
          >
            <div className="p-3 bg-primary/10 rounded-full mb-4 group-hover:bg-primary/20 transition-colors">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">Upload Screenshot</p>
            <p className="text-xs text-muted-foreground text-center">
              PNG, JPG or GIF of your positions
            </p>
          </button>

          {/* Divider */}
          <div className="flex sm:flex-col items-center justify-center px-2">
            <div className="flex-1 h-px sm:h-auto sm:w-px bg-border"></div>
            <span className="px-3 py-1 text-xs text-muted-foreground font-medium">or</span>
            <div className="flex-1 h-px sm:h-auto sm:w-px bg-border"></div>
          </div>

          {/* Manual Entry Option */}
          <button
            onClick={handleManualClick}
            className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent/50 hover:border-primary transition-all duration-200 border-border group"
          >
            <div className="p-3 bg-primary/10 rounded-full mb-4 group-hover:bg-primary/20 transition-colors">
              <PenLine className="w-8 h-8 text-primary" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">Build Manually</p>
            <p className="text-xs text-muted-foreground text-center">
              Add positions one by one
            </p>
          </button>
        </div>
      </div>
    );
  }

  // Upload mode
  if (mode === 'upload') {
    return (
      <div className="w-full max-w-xl mx-auto">
        <div className="flex flex-col items-center justify-center w-full">
          {!selectedFile ? (
            <>
              <label
                className={`flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent/50 transition-colors duration-200 ${dragActive ? "border-primary bg-accent/50" : "border-border"
                  }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG or GIF (Screenshot of positions)
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    Large images are auto-optimized for faster processing
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleChange}
                />
              </label>
              <button
                onClick={handleBack}
                className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                &larr; Back to options
              </button>
            </>
          ) : (
            <div className="w-full p-2 border rounded-lg bg-card flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="p-1.5 bg-primary/10 rounded-full">
                  <File className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                onClick={removeFile}
                className="p-1 hover:bg-destructive/10 rounded-full text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Manual mode - just show a confirmation message (positions table is shown in App)
  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex items-center justify-center p-4 bg-primary/10 rounded-lg border border-primary/20">
        <PenLine className="w-5 h-5 text-primary mr-2" />
        <span className="text-sm font-medium text-foreground">Manual entry mode</span>
      </div>
    </div>
  );
}
