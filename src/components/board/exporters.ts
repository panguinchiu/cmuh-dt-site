/** 匯出：PNG（白底、2x）與 PDF（A3 橫向，頁首畫進圖片再嵌入，避開 pdf-lib 標準字型不支援中文） */
import { PDFDocument } from "pdf-lib";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function blobToImage(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 在白板圖上方加一條頁首，回傳 PNG blob */
export async function withHeader(png: Blob, title: string) {
  const img = await blobToImage(png);
  const headerH = Math.max(96, Math.round(img.width * 0.045));
  const font = Math.round(headerH * 0.4);
  const c = document.createElement("canvas");
  c.width = Math.max(img.width, 1600);
  c.height = img.height + headerH;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#1c2523";
  g.font = `600 ${font}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  g.textBaseline = "middle";
  g.fillText(title, Math.round(font * 1.2), headerH / 2);
  g.fillStyle = "#d9d5c8";
  g.fillRect(0, headerH - 2, c.width, 2);
  g.drawImage(img, Math.round((c.width - img.width) / 2), headerH);
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

/** A3 橫向 1190.55×841.89 pt，等比置中、留邊 */
export async function pngToA3Pdf(png: Blob, title: string) {
  const A3 = { w: 1190.55, h: 841.89 };
  const margin = 28;
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("CMUH 設計思考工作坊");
  const page = pdf.addPage([A3.w, A3.h]);
  const image = await pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
  const s = Math.min((A3.w - margin * 2) / image.width, (A3.h - margin * 2) / image.height);
  const w = image.width * s;
  const h = image.height * s;
  page.drawImage(image, { x: (A3.w - w) / 2, y: (A3.h - h) / 2, width: w, height: h });
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
