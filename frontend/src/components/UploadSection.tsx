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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedFile(null);
    setMode(null);
    setDragActive(false);
  }, [resetKey]);

  const selectFile = useCallback((file: File) => {
    setSelectedFile(file);
    onFileSelect(file);
  }, [onFileSelect]);

  useEffect(() => {
    if (mode !== 'upload' || selectedFile || loading) return;

    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find(
        item => item.kind === 'file' && item.type.startsWith('image/')
      );
      const file = imageItem?.getAsFile();

      if (!file) return;

      event.preventDefault();
      selectFile(file);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [loading, mode, selectFile, selectedFile]);

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
      selectFile(file);
    }
  }, [selectFile]);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      selectFile(file);
    }
  }, [selectFile]);

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
        <div className="flex flex-col sm:flex-row gap-4 items-stretch">
          {/* Manual Entry Option */}
          <button
            onClick={handleManualClick}
            className="flex-1 group rounded-lg border border-border bg-card hover:border-foreground/25 hover:bg-muted/40 transition-colors"
          >
            <div className="flex flex-col items-center justify-center p-5">
              <div className="mb-3 p-3 rounded-lg border border-border bg-muted text-muted-foreground group-hover:text-foreground transition-colors">
                <PenLine className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">Build Strategy</h3>
              <p className="text-xs text-muted-foreground text-center">
                Add positions one by one
              </p>
            </div>
          </button>

          {/* Divider */}
          <div className="flex sm:flex-col items-center justify-center">
            <div className="flex-1 h-px sm:h-auto sm:w-px bg-border"></div>
            <span className="px-4 py-2 text-xs text-muted-foreground font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px sm:h-auto sm:w-px bg-border"></div>
          </div>

          {/* Upload Screenshot Option */}
          <button
            onClick={handleUploadClick}
            className="flex-1 group rounded-lg border border-border bg-card hover:border-foreground/25 hover:bg-muted/40 transition-colors"
          >
            <div className="flex flex-col items-center justify-center p-5">
              <div className="mb-3 p-3 rounded-lg border border-border bg-muted text-muted-foreground group-hover:text-foreground transition-colors">
                <Upload className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">Upload Screenshot</h3>
              <p className="text-xs text-muted-foreground text-center">
                Upload, drop, or paste an image of your positions
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
                className={`flex flex-col items-center justify-center w-full h-56 border border-dashed rounded-lg cursor-pointer bg-card hover:bg-muted/40 transition-colors duration-200 ${dragActive ? "border-primary bg-muted/40" : "border-border"
                  }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span>, drag and drop, or paste
                  </p>
                  <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground">
                      ⌘ V
                    </kbd>
                    <span>or</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground">
                      Ctrl V
                    </kbd>
                  </div>
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
            <div className="w-full p-4 border border-border rounded-lg bg-card flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {loading ? (
                  <div className="p-1.5 bg-muted rounded-full">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  </div>
                ) : (
                  <div className="p-1.5 bg-muted rounded-full">
                    <File className="w-5 h-5 text-muted-foreground" />
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
      <div className="rounded-lg border border-border bg-muted/40">
        <div className="flex items-center justify-between px-5 py-3">
          <button
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back
          </button>
          <div className="flex items-center gap-3">
            <PenLine className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Manual entry mode</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs text-primary font-medium">Active</span>
            </div>
          </div>
          <div className="w-12" /> {/* Spacer for centering */}
        </div>
      </div>
    </div>
  );
}
