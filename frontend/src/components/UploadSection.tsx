import { useState, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react';
import { Upload, File, X, PenLine, Loader2 } from 'lucide-react';

interface UploadSectionProps {
  onFileSelect: (file: File | null) => void;
  onManualEntry: () => void;
  resetKey: number;
  loading?: boolean;
  onClearError?: () => void;
}

type Mode = null | 'upload' | 'manual';

export default function UploadSection({ onFileSelect, onManualEntry, resetKey, loading = false, onClearError }: UploadSectionProps) {
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
    onClearError?.();
  };

  const handleManualClick = () => {
    setMode('manual');
    onManualEntry();
  };

  const handleUploadClick = () => {
    setMode('upload');
    onClearError?.();
  };

  const handleBack = () => {
    setMode(null);
  };

  // Selection mode - show both options
  if (mode === null) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row gap-6 items-stretch">
          {/* Manual Entry Option */}
          <button
            onClick={handleManualClick}
            className="flex-1 group relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/80 border border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex flex-col items-center justify-center p-5">
              <div className="relative mb-3">
                <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg group-hover:bg-primary/30 transition-colors duration-300" />
                <div className="relative p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl border border-primary/20 group-hover:border-primary/40 transition-colors duration-300">
                  <PenLine className="w-6 h-6 text-primary" />
                </div>
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1 group-hover:text-primary transition-colors duration-300">Build Strategy</h3>
              <p className="text-xs text-muted-foreground text-center">
                Add positions one by one
              </p>
            </div>
          </button>

          {/* Divider */}
          <div className="flex sm:flex-col items-center justify-center">
            <div className="flex-1 h-px sm:h-auto sm:w-px bg-gradient-to-r sm:bg-gradient-to-b from-transparent via-border to-transparent"></div>
            <span className="px-4 py-2 text-xs text-muted-foreground/60 font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px sm:h-auto sm:w-px bg-gradient-to-r sm:bg-gradient-to-b from-transparent via-border to-transparent"></div>
          </div>

          {/* Upload Screenshot Option */}
          <button
            onClick={handleUploadClick}
            className="flex-1 group relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/80 border border-border/50 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex flex-col items-center justify-center p-5">
              <div className="relative mb-3">
                <div className="absolute inset-0 bg-blue-500/20 rounded-xl blur-lg group-hover:bg-blue-500/30 transition-colors duration-300" />
                <div className="relative p-3 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl border border-blue-500/20 group-hover:border-blue-500/40 transition-colors duration-300">
                  <Upload className="w-6 h-6 text-blue-500" />
                </div>
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1 group-hover:text-blue-500 transition-colors duration-300">Upload Screenshot</h3>
              <p className="text-xs text-muted-foreground text-center">
                PNG, JPG or GIF of your positions
              </p>
            </div>
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
            <div className="w-full p-4 border rounded-lg bg-card flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-3">
                {loading ? (
                  <div className="p-1.5 bg-primary/10 rounded-full">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  </div>
                ) : (
                  <div className="p-1.5 bg-primary/10 rounded-full">
                    <File className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {loading ? 'Processing with AI...' : `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`}
                  </p>
                </div>
              </div>
              {!loading && (
                <button
                  onClick={removeFile}
                  className="p-1 hover:bg-destructive/10 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Manual mode - just show a confirmation message (positions table is shown in App)
  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-pulse" />
        <div className="relative flex items-center justify-between px-5 py-3">
          <button
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/15 rounded-lg border border-primary/25">
              <PenLine className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground">Manual entry mode</span>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-emerald-500 font-medium">Active</span>
            </div>
          </div>
          <div className="w-12" /> {/* Spacer for centering */}
        </div>
      </div>
    </div>
  );
}
