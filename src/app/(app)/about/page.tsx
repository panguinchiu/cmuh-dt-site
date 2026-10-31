export default function About() {
  return (
    <>
      <h1>About／授權聲明</h1>
      <div className="card">
        <h3>本網站</h3>
        <p>中國附醫教學部「設計思考工作坊」課程網站，僅供工作坊教學使用，不含任何真實病人資料，不連接院內系統。賽局情境中的醫學中心為虛構。</p>
      </div>
      <div className="card">
        <h3>第三方開源軟體</h3>
        <p>
          白板使用 <a href="https://github.com/excalidraw/excalidraw" target="_blank" rel="noopener noreferrer">Excalidraw</a>（MIT License, Copyright (c) 2020 Excalidraw）。本站僅使用開源套件
          <code> @excalidraw/excalidraw</code>，自架同步伺服器，未使用 Excalidraw+、excalidraw.com 協作服務或素材庫。
        </p>
        <p>其他套件：Next.js、React（MIT）、Prisma（Apache-2.0）、ws（MIT）、zod（MIT）、pdf-lib（MIT）、bcryptjs（MIT）、fflate（MIT）、@azure/storage-blob（MIT）。</p>
        <p className="muted small">完整授權全文見專案根目錄 THIRD_PARTY_NOTICES.md。字型：Noto Sans TC、Noto Serif TC、IBM Plex Mono（SIL Open Font License 1.1）。</p>
      </div>
    </>
  );
}
