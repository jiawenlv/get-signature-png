import { useState, useEffect, useCallback } from "react";
import type { ExtractOptions } from "./types";
import { useStampExtract } from "./hooks/useStampExtract";
import UploadZone from "./components/UploadZone";
import ImagePreview from "./components/ImagePreview";
import ResultView from "./components/ResultView";
import SettingsPanel from "./components/SettingsPanel";

async function handleDownload(downloadUrl: string) {
  const res = await fetch(downloadUrl);
  const blob = await res.blob();
  if ("showSaveFilePicker" in window) {
    try {
      // @ts-expect-error showSaveFilePicker is not yet in TS lib
      const handle = await window.showSaveFilePicker({
        suggestedName: "stamp.png",
        types: [{ description: "PNG", accept: { "image/png": [".png"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch {
      // user cancelled or API error — fall through to fallback
      return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "stamp.png";
  a.click();
  URL.revokeObjectURL(a.href);
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [options, setOptions] = useState<ExtractOptions>({
    color: "red",
    mode: "recolor",
    removeText: false,
    saturationThreshold: 80,
    brightnessThreshold: 128,
    outputSize: 512,
    customColor: "",
  });

  const { status, progress, previewUrl, downloadUrl, error, upload, reset } =
    useStampExtract();

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      setSelectedFile(file);
      setLocalPreviewUrl(URL.createObjectURL(file));
      setHasStarted(false);
      reset();
    },
    [localPreviewUrl, reset]
  );

  const handleReupload = useCallback(() => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setSelectedFile(null);
    setLocalPreviewUrl(null);
    setHasStarted(false);
    reset();
  }, [localPreviewUrl, reset]);

  const handleExtract = useCallback(() => {
    if (!selectedFile) return;
    setHasStarted(true);
    reset();
    upload(selectedFile, options);
  }, [selectedFile, options, reset, upload]);

  const isProcessing = status === "uploading" || status === "processing";
  const hasFile = selectedFile !== null;
  const isCompleted = hasStarted && status === "completed" && !!previewUrl && !!downloadUrl;

  // Progress bar state
  const showProgress = hasStarted && (isProcessing || status === "failed");
  const progressWidth =
    status === "uploading" ? 10 : status === "processing" ? progress : status === "failed" ? 100 : 0;
  const progressColor = status === "failed" ? "bg-red-500" : "bg-blue-500";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with progress bar */}
      <header className="relative bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-gray-800">印章提取工具</h1>
        </div>
        {/* Progress bar — thin line at bottom of header */}
        <div
          className={`absolute bottom-0 left-0 h-0.5 ${progressColor} transition-all duration-300 ease-out ${
            showProgress ? "opacity-100" : "opacity-0"
          }`}
          style={{ width: `${progressWidth}%` }}
        />
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Image area — always two squares side by side */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left: upload / original image */}
          <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white">
            {hasFile && localPreviewUrl ? (
              <ImagePreview src={localPreviewUrl} label="原图" />
            ) : (
              <UploadZone onFileSelect={handleFileSelect} disabled={false} />
            )}
          </div>

          {/* Right: result / placeholder */}
          <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            {isCompleted ? (
              <ResultView previewUrl={previewUrl} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-400">处理中...</span>
                  </div>
                ) : hasStarted && status === "failed" ? (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-red-500">处理失败</span>
                    {error && <span className="text-xs text-red-400">{error}</span>}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">
                    {hasFile ? "选择设置后点击开始抠图" : "提取结果"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Settings */}
        <SettingsPanel options={options} onChange={setOptions} />

        {/* Bottom button bar — always visible */}
        <div className="flex items-center gap-3">
          {/* Start / Re-extract / Abort */}
          {isProcessing ? (
            <button
              onClick={() => {
                reset();
                setHasStarted(false);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              终止
            </button>
          ) : (
            <button
              onClick={handleExtract}
              disabled={!hasFile}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {hasStarted ? "重新抠图" : "开始抠图"}
            </button>
          )}

          {/* Re-upload */}
          <button
            onClick={handleReupload}
            disabled={!hasFile || isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            重新上传
          </button>

          {/* Download */}
          <button
            onClick={() => downloadUrl && handleDownload(downloadUrl)}
            disabled={!isCompleted}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            下载
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
