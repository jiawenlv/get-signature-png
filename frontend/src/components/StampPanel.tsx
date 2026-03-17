import { useState, useEffect, useCallback } from "react";
import type { ExtractOptions } from "../types";
import { useStampExtract } from "../hooks/useStampExtract";
import { handleDownload } from "../utils/download";
import UploadZone from "./UploadZone";
import ImagePreview from "./ImagePreview";
import ResultView from "./ResultView";
import SettingsPanel from "./SettingsPanel";

export default function StampPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [options, setOptions] = useState<ExtractOptions>({
    color: "red",
    mode: "original",
    removeText: false,
    saturationThreshold: 80,
    brightnessThreshold: 128,
    outputSize: 512,
    customColor: "#e04040",
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
  const isCompleted =
    hasStarted && status === "completed" && !!previewUrl && !!downloadUrl;

  const showProgress = hasStarted && (isProcessing || status === "failed");
  const progressWidth =
    status === "uploading"
      ? 10
      : status === "processing"
        ? progress
        : status === "failed"
          ? 100
          : 0;
  const progressColor = status === "failed" ? "bg-red-500" : "bg-blue-500";

  return (
    <div className="relative flex flex-col gap-6">
      {/* Progress bar */}
      <div
        className={`absolute top-0 left-0 h-0.5 ${progressColor} transition-all duration-300 ease-out ${
          showProgress ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: `${progressWidth}%` }}
      />
        {/* Image area */}
        <div className="grid grid-cols-2 gap-6">
          <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white">
            {hasFile && localPreviewUrl ? (
              <ImagePreview
                src={localPreviewUrl}
                label="原图"
                isPickingColor={isPickingColor}
                onColorPicked={(color) => {
                  setOptions((prev) => ({ ...prev, customColor: color }));
                  setIsPickingColor(false);
                }}
              />
            ) : (
              <UploadZone onFileSelect={handleFileSelect} disabled={false} />
            )}
          </div>

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
                    {error && (
                      <span className="text-xs text-red-400">{error}</span>
                    )}
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
        <SettingsPanel
          options={options}
          onChange={setOptions}
          onPickColor={
            hasFile
              ? () => setIsPickingColor((prev) => !prev)
              : undefined
          }
          isPickingColor={isPickingColor}
        />

        {/* Button bar */}
        <div className="flex items-center gap-3">
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

          <button
            onClick={handleReupload}
            disabled={!hasFile || isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            重新上传
          </button>

          <button
            onClick={() =>
              downloadUrl && handleDownload(downloadUrl, `stamp_${Date.now()}.png`)
            }
            disabled={!isCompleted}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
    </div>
  );
}
