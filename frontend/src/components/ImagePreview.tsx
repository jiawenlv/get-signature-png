import { useRef, useEffect, useState, useCallback } from "react";

interface ImagePreviewProps {
  src: string;
  label: string;
  isPickingColor?: boolean;
  onColorPicked?: (color: string) => void;
}

const SENSITIVITY = 0.1; // mouse moves 10px -> magnifier moves 1px
const MAGNIFIER_SIZE = 120;
const ZOOM = 8;

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export default function ImagePreview({
  src,
  label,
  isPickingColor,
  onColorPicked,
}: ImagePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // magnifier position in image-pixel coordinates
  const [magPos, setMagPos] = useState<{ x: number; y: number } | null>(null);
  const [pickedColor, setPickedColor] = useState<string | null>(null);

  // accumulated mouse delta tracking
  const accRef = useRef({ x: 0, y: 0 });
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);

  // draw image to hidden canvas for pixel reading
  useEffect(() => {
    if (!isPickingColor) {
      setMagPos(null);
      setPickedColor(null);
      lastMouseRef.current = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
    };
    img.src = src;
  }, [src, isPickingColor]);

  // convert mouse position in container to image pixel coordinates
  const toImageCoords = useCallback(
    (containerX: number, containerY: number) => {
      const imgEl = imgRef.current;
      const canvas = canvasRef.current;
      if (!imgEl || !canvas) return null;

      const rect = imgEl.getBoundingClientRect();
      const relX = containerX - (rect.left - (containerRef.current?.getBoundingClientRect().left ?? 0));
      const relY = containerY - (rect.top - (containerRef.current?.getBoundingClientRect().top ?? 0));

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      return {
        x: Math.round(relX * scaleX),
        y: Math.round(relY * scaleY),
      };
    },
    []
  );

  const getColorAt = useCallback((ix: number, iy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const cx = Math.max(0, Math.min(canvas.width - 1, ix));
    const cy = Math.max(0, Math.min(canvas.height - 1, iy));
    const pixel = ctx.getImageData(cx, cy, 1, 1).data;
    return rgbToHex(pixel[0], pixel[1], pixel[2]);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPickingColor) return;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      if (!lastMouseRef.current) {
        // first move - initialize at mouse position
        lastMouseRef.current = { x: mouseX, y: mouseY };
        const coords = toImageCoords(mouseX, mouseY);
        if (coords) {
          accRef.current = { x: coords.x, y: coords.y };
          setMagPos(coords);
          setPickedColor(getColorAt(coords.x, coords.y));
        }
        return;
      }

      const dx = mouseX - lastMouseRef.current.x;
      const dy = mouseY - lastMouseRef.current.y;
      lastMouseRef.current = { x: mouseX, y: mouseY };

      const canvas = canvasRef.current;
      if (!canvas) return;

      // scale sensitivity by image-to-display ratio
      const imgEl = imgRef.current;
      if (!imgEl) return;
      const rect = imgEl.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      accRef.current.x += dx * SENSITIVITY * scaleX;
      accRef.current.y += dy * SENSITIVITY * scaleY;

      // clamp to image bounds
      const ix = Math.max(0, Math.min(canvas.width - 1, Math.round(accRef.current.x)));
      const iy = Math.max(0, Math.min(canvas.height - 1, Math.round(accRef.current.y)));
      accRef.current.x = ix;
      accRef.current.y = iy;

      setMagPos({ x: ix, y: iy });
      setPickedColor(getColorAt(ix, iy));
    },
    [isPickingColor, toImageCoords, getColorAt]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isPickingColor || !magPos) return;
      e.preventDefault();
      e.stopPropagation();
      const color = getColorAt(magPos.x, magPos.y);
      if (color && onColorPicked) {
        onColorPicked(color);
      }
    },
    [isPickingColor, magPos, getColorAt, onColorPicked]
  );

  const handleMouseLeave = useCallback(() => {
    if (isPickingColor) {
      lastMouseRef.current = null;
    }
  }, [isPickingColor]);

  // convert image pixel coords back to display position relative to container
  const imageToDisplay = useCallback(
    (ix: number, iy: number) => {
      const imgEl = imgRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!imgEl || !canvas || !container) return { x: 0, y: 0 };

      const imgRect = imgEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const displayX =
        (ix / canvas.width) * imgRect.width +
        (imgRect.left - containerRect.left);
      const displayY =
        (iy / canvas.height) * imgRect.height +
        (imgRect.top - containerRect.top);

      return { x: displayX, y: displayY };
    },
    []
  );

  // render magnifier content
  const renderMagnifier = () => {
    if (!isPickingColor || !magPos) return null;

    const display = imageToDisplay(magPos.x, magPos.y);
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const imgEl = imgRef.current;
    if (!imgEl) return null;
    const imgRect = imgEl.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return null;

    // source region in image pixels
    const srcSize = MAGNIFIER_SIZE / ZOOM;
    const sx = magPos.x - srcSize / 2;
    const sy = magPos.y - srcSize / 2;

    // display the magnifier above or below the pick point
    const magTop = display.y - MAGNIFIER_SIZE - 20;
    const finalTop = magTop < 0 ? display.y + 20 : magTop;
    const finalLeft = Math.max(
      0,
      Math.min(
        containerRect.width - MAGNIFIER_SIZE,
        display.x - MAGNIFIER_SIZE / 2
      )
    );

    // background position to show zoomed region
    const bgWidth = (canvas.width / srcSize) * MAGNIFIER_SIZE;
    const bgHeight = (canvas.height / srcSize) * MAGNIFIER_SIZE;
    const bgX = -(sx / canvas.width) * bgWidth;
    const bgY = -(sy / canvas.height) * bgHeight;

    // crosshair pixel size
    const pixelSize = MAGNIFIER_SIZE / (srcSize);

    return (
      <div
        className="absolute pointer-events-none z-50"
        style={{
          left: finalLeft,
          top: finalTop,
          width: MAGNIFIER_SIZE,
          height: MAGNIFIER_SIZE,
        }}
      >
        {/* magnifier circle */}
        <div
          className="w-full h-full rounded-full overflow-hidden border-2 border-white shadow-lg"
          style={{
            backgroundImage: `url(${src})`,
            backgroundSize: `${bgWidth}px ${bgHeight}px`,
            backgroundPosition: `${bgX}px ${bgY}px`,
            backgroundRepeat: "no-repeat",
            imageRendering: ZOOM > 4 ? "pixelated" : "auto",
          }}
        >
          {/* crosshair */}
          <div className="relative w-full h-full">
            <div
              className="absolute bg-black/30"
              style={{
                left: MAGNIFIER_SIZE / 2 - pixelSize / 2,
                top: 0,
                width: 1,
                height: "100%",
              }}
            />
            <div
              className="absolute bg-black/30"
              style={{
                top: MAGNIFIER_SIZE / 2 - pixelSize / 2,
                left: 0,
                height: 1,
                width: "100%",
              }}
            />
            {/* center pixel highlight */}
            <div
              className="absolute border border-white/80"
              style={{
                left: MAGNIFIER_SIZE / 2 - pixelSize / 2,
                top: MAGNIFIER_SIZE / 2 - pixelSize / 2,
                width: pixelSize,
                height: pixelSize,
              }}
            />
          </div>
        </div>
        {/* color label */}
        {pickedColor && (
          <div className="mt-1.5 flex items-center justify-center gap-1.5">
            <span
              className="w-4 h-4 rounded border border-white shadow"
              style={{ backgroundColor: pickedColor }}
            />
            <span className="text-xs font-mono text-white bg-black/60 px-1.5 py-0.5 rounded">
              {pickedColor}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center bg-white ${
        isPickingColor ? "cursor-crosshair" : ""
      }`}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onMouseLeave={handleMouseLeave}
    >
      <img
        ref={imgRef}
        src={src}
        alt={label}
        className="max-w-full max-h-full object-contain"
        draggable={false}
      />
      <canvas ref={canvasRef} className="hidden" />
      {renderMagnifier()}
      {isPickingColor && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white bg-black/60 px-2 py-1 rounded">
          移动鼠标取色，点击确认
        </div>
      )}
    </div>
  );
}
