import { useState, useRef, useCallback, useEffect } from "react";
import {
  enhanceImage,
  getEnhanceStatus,
  getEnhancePreviewUrl,
  getEnhanceDownloadUrl,
} from "../api/client";
import type { EnhanceOptions } from "../types";

export type Status = "idle" | "uploading" | "processing" | "completed" | "failed";

interface UseImageEnhanceReturn {
  status: Status;
  progress: number;
  previewUrl: string | null;
  downloadUrl: string | null;
  error: string | null;
  upload: (file: File, options: EnhanceOptions) => void;
  reset: () => void;
}

export function useImageEnhance(): UseImageEnhanceReturn {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (taskId: string) => {
      clearPolling();
      intervalRef.current = setInterval(async () => {
        try {
          const resp = await getEnhanceStatus(taskId);
          setProgress(resp.progress);

          if (resp.status === "completed") {
            clearPolling();
            setPreviewUrl(getEnhancePreviewUrl(taskId));
            setDownloadUrl(getEnhanceDownloadUrl(taskId));
            setStatus("completed");
          } else if (resp.status === "failed") {
            clearPolling();
            setError(resp.error ?? "处理失败");
            setStatus("failed");
          }
        } catch (err) {
          clearPolling();
          setError(err instanceof Error ? err.message : "轮询状态失败");
          setStatus("failed");
        }
      }, 500);
    },
    [clearPolling]
  );

  const upload = useCallback(
    async (file: File, options: EnhanceOptions) => {
      setStatus("uploading");
      setProgress(0);
      setPreviewUrl(null);
      setDownloadUrl(null);
      setError(null);

      try {
        const resp = await enhanceImage(file, options);
        setStatus("processing");
        setProgress(resp.progress);
        startPolling(resp.task_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传失败");
        setStatus("failed");
      }
    },
    [startPolling]
  );

  const reset = useCallback(() => {
    clearPolling();
    setStatus("idle");
    setProgress(0);
    setPreviewUrl(null);
    setDownloadUrl(null);
    setError(null);
  }, [clearPolling]);

  useEffect(() => {
    return () => clearPolling();
  }, [clearPolling]);

  return { status, progress, previewUrl, downloadUrl, error, upload, reset };
}
