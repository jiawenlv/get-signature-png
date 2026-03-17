export async function handleDownload(downloadUrl: string, defaultName = "image.png") {
  if (window.isSecureContext && "showSaveFilePicker" in window) {
    try {
      const ext = defaultName.split(".").pop() ?? "png";
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        bmp: "image/bmp",
      };
      const mime = mimeMap[ext] ?? "image/png";

      // @ts-expect-error showSaveFilePicker is not yet in TS lib
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [
          { description: ext.toUpperCase(), accept: { [mime]: [`.${ext}`] } },
        ],
      });
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }

  const res = await fetch(downloadUrl);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(a.href);
}
