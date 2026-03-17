import { useState, useEffect, useCallback } from "react";
import type { EnhanceOptions } from "../types";
import { useImageEnhance } from "../hooks/useImageEnhance";
import { handleDownload } from "../utils/download";
import UploadZone from "./UploadZone";
import ImagePreview from "./ImagePreview";
import ResultView from "./ResultView";

export default function EnhancePanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [options] = useState<EnhanceOptions>({
    denoiseStrength: 0.5,
  });

  const { status, progress, previewUrl, downloadUrl, error, upload, reset } =
    useImageEnhance();

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

  const handleEnhance = useCallback(() => {
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
              <ImagePreview src={localPreviewUrl} label="原图" />
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
                    <span className="text-sm text-gray-400">去模糊中...</span>
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
                    {hasFile ? "点击开始去模糊" : "去模糊结果"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

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
              onClick={handleEnhance}
              disabled={!hasFile}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {hasStarted ? "重新去模糊" : "开始去模糊"}
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
              downloadUrl &&
              handleDownload(downloadUrl, `deblurred_${Date.now()}.png`)
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
