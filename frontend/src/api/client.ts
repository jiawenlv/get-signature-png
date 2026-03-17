import type { TaskResponse } from "../types";

const API_BASE = "/api";

export async function extractStamp(
  file: File,
  options: {
    color: string;
    mode: string;
    removeText: boolean;
    saturationThreshold: number;
    brightnessThreshold: number;
    outputSize: number;
    customColor: string;
  }
): Promise<TaskResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("color", options.color);
  formData.append("mode", options.mode);
  formData.append("remove_text", String(options.removeText));
  formData.append("saturation_threshold", String(options.saturationThreshold));
  formData.append("brightness_threshold", String(options.brightnessThreshold));
  formData.append("output_size", String(options.outputSize));
  if (options.customColor) {
    formData.append("custom_color", options.customColor);
  }
  const res = await fetch(`${API_BASE}/stamp/extract`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTaskStatus(taskId: string): Promise<TaskResponse> {
  const res = await fetch(`${API_BASE}/stamp/status/${taskId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getPreviewUrl(taskId: string): string {
  return `${API_BASE}/stamp/preview/${taskId}`;
}

export function getDownloadUrl(taskId: string): string {
  return `${API_BASE}/stamp/download/${taskId}`;
}

// ── Enhance API ──────────────────────────────────────────────────

export async function enhanceImage(
  file: File,
  options: { denoiseStrength: number }
): Promise<TaskResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("denoise_strength", String(options.denoiseStrength));
  const res = await fetch(`${API_BASE}/enhance/submit`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getEnhanceStatus(taskId: string): Promise<TaskResponse> {
  const res = await fetch(`${API_BASE}/enhance/status/${taskId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getEnhancePreviewUrl(taskId: string): string {
  return `${API_BASE}/enhance/preview/${taskId}`;
}

export function getEnhanceDownloadUrl(taskId: string): string {
  return `${API_BASE}/enhance/download/${taskId}`;
}
