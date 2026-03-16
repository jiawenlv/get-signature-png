import type { ExtractOptions, StampColor, StampMode } from "../types";

interface SettingsPanelProps {
  options: ExtractOptions;
  onChange: (options: ExtractOptions) => void;
}

const COLORS: { value: StampColor; label: string; dot: string }[] = [
  { value: "red", label: "红色", dot: "bg-red-500" },
  { value: "blue", label: "蓝色", dot: "bg-blue-500" },
  { value: "purple", label: "紫色", dot: "bg-purple-500" },
];

const MODES: { value: StampMode; label: string }[] = [
  { value: "recolor", label: "统一着色" },
  { value: "original", label: "保留原色" },
];

function ThresholdControl({
  label,
  value,
  min,
  max,
  lowLabel,
  highLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  lowLabel: string;
  highLabel: string;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  return (
    <div className="flex items-center gap-4">
      <label className="text-sm font-medium text-gray-600 w-28 shrink-0">{label}</label>
      <span className="text-xs text-gray-400 shrink-0">{lowLabel}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <span className="text-xs text-gray-400 shrink-0">{highLabel}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v)) onChange(clamp(v));
        }}
        className="w-16 px-2 py-1 text-sm text-right text-gray-700 border border-gray-300 rounded-md tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}

export default function SettingsPanel({ options, onChange }: SettingsPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* 处理模式 */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-600 w-28 shrink-0">处理模式</label>
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => onChange({ ...options, mode: m.value })}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                options.mode === m.value
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 印章颜色 */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-600 w-28 shrink-0">印章颜色</label>
        {options.mode === "recolor" ? (
          <div className="flex items-center gap-2">
            <span
              className="w-8 h-8 rounded-md border border-gray-300 shrink-0"
              style={{ backgroundColor: options.customColor || "#e04040" }}
            />
            <input
              type="text"
              value={options.customColor}
              placeholder="自动取色"
              onChange={(e) => onChange({ ...options, customColor: e.target.value })}
              onBlur={(e) => {
                const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                if (raw.length >= 3) {
                  onChange({ ...options, customColor: `#${raw.length === 3 ? raw[0]+raw[0]+raw[1]+raw[1]+raw[2]+raw[2] : raw}` });
                } else if (raw.length === 0) {
                  onChange({ ...options, customColor: "" });
                }
              }}
              className="w-28 px-2 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            {"EyeDropper" in window ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    // @ts-expect-error EyeDropper API
                    const dropper = new EyeDropper();
                    const result = await dropper.open();
                    onChange({ ...options, customColor: result.sRGBHex });
                  } catch {
                    // user cancelled
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                title="从屏幕取色"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 22l1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="M14.5 5.5l4 4" />
                  <path d="M18.5 1.5a2.121 2.121 0 013 3l-1 1-4-4 1-1z" />
                </svg>
                取色
              </button>
            ) : (
              <label
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                title="选择颜色"
              >
                <input
                  type="color"
                  value={options.customColor || "#e04040"}
                  onChange={(e) => onChange({ ...options, customColor: e.target.value })}
                  className="w-0 h-0 opacity-0 absolute"
                />
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 22l1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="M14.5 5.5l4 4" />
                  <path d="M18.5 1.5a2.121 2.121 0 013 3l-1 1-4-4 1-1z" />
                </svg>
                取色
              </label>
            )}
          </div>
        ) : (
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => onChange({ ...options, color: c.value })}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors ${
                  options.color === c.value
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 阈值 */}
      {options.mode === "original" ? (
        <ThresholdControl
          label="饱和度阈值"
          value={options.saturationThreshold}
          min={30}
          max={150}
          lowLabel="保留更多"
          highLabel="过滤更多"
          onChange={(v) => onChange({ ...options, saturationThreshold: v })}
        />
      ) : (
        <ThresholdControl
          label="灰度阈值"
          value={options.brightnessThreshold}
          min={80}
          max={220}
          lowLabel="只留深墨"
          highLabel="保留浅墨"
          onChange={(v) => onChange({ ...options, brightnessThreshold: v })}
        />
      )}

      {/* 导出分辨率 */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-600 w-28 shrink-0">导出分辨率</label>
        <div className="inline-flex flex-wrap rounded-lg bg-gray-100 p-1 gap-1">
          {[
            { value: 0, label: "原始" },
            { value: 512, label: "512px" },
            { value: 800, label: "800px" },
            { value: 1024, label: "1024px" },
            { value: 2048, label: "2048px" },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => onChange({ ...options, outputSize: s.value })}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                options.outputSize === s.value
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 去除黑色文字 */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-600 w-28 shrink-0">去除黑色文字</label>
        <button
          onClick={() => onChange({ ...options, removeText: !options.removeText })}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            options.removeText ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              options.removeText ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
