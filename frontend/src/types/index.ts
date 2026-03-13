export type StampColor = "red" | "blue" | "purple";
export type StampMode = "original" | "recolor";
export type TaskStatus = "processing" | "completed" | "failed";

export interface ExtractOptions {
  color: StampColor;
  mode: StampMode;
  removeText: boolean;
  saturationThreshold: number;
  brightnessThreshold: number;
  outputSize: number; // 0 = 原始尺寸，其他为最大边长像素
  customColor: string; // 模式二自定义颜色 hex，如 "#e04040"
}

export interface TaskResponse {
  task_id: string;
  status: TaskStatus;
  progress: number;
  result_url: string | null;
  error: string | null;
  message: string | null;
}
