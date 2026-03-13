interface ImagePreviewProps {
  src: string;
  label: string;
}

export default function ImagePreview({ src, label }: ImagePreviewProps) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-white">
      <img
        src={src}
        alt={label}
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}
