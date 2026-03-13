import { useState, useRef, useCallback } from "react";

interface ResultViewProps {
  previewUrl: string;
}

const LENS_SIZE = 160;
const ZOOM = 3;

export default function ResultView({ previewUrl }: ResultViewProps) {
  const [lens, setLens] = useState<{ x: number; y: number; bgX: number; bgY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    const cx = e.clientX - containerRect.left;
    const cy = e.clientY - containerRect.top;

    const ix = e.clientX - imgRect.left;
    const iy = e.clientY - imgRect.top;

    if (ix < 0 || iy < 0 || ix > imgRect.width || iy > imgRect.height) {
      setLens(null);
      return;
    }

    const scaleX = img.naturalWidth / imgRect.width;
    const scaleY = img.naturalHeight / imgRect.height;

    const bgX = ix * scaleX * ZOOM - LENS_SIZE / 2;
    const bgY = iy * scaleY * ZOOM - LENS_SIZE / 2;

    setLens({ x: cx, y: cy, bgX, bgY });
  }, []);

  const handleMouseLeave = useCallback(() => setLens(null), []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full h-full flex items-center justify-center cursor-crosshair"
      style={{
        background:
          "repeating-conic-gradient(#d1d5db 0% 25%, #ffffff 0% 50%) 0 0 / 20px 20px",
      }}
    >
      <img
        ref={imgRef}
        src={previewUrl}
        alt="提取结果"
        className="max-w-full max-h-full object-contain"
      />
      {lens && (
        <div
          className="pointer-events-none absolute border-2 border-white rounded-full shadow-lg"
          style={{
            width: LENS_SIZE,
            height: LENS_SIZE,
            left: lens.x - LENS_SIZE / 2,
            top: lens.y - LENS_SIZE / 2,
            backgroundImage: `url(${previewUrl})`,
            backgroundSize: `${(imgRef.current?.naturalWidth ?? 0) * ZOOM}px ${(imgRef.current?.naturalHeight ?? 0) * ZOOM}px`,
            backgroundPosition: `-${lens.bgX}px -${lens.bgY}px`,
            backgroundRepeat: "no-repeat",
            backgroundColor: "#ffffff",
          }}
        />
      )}
    </div>
  );
}
