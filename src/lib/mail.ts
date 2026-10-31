/**
 * 寄信（忘記密碼）。預設走 Google Workspace SMTP（theoneai.com.tw 的 MX 為 Google），
 * 帳號密碼一律從環境變數讀取：SMTP_USER、SMTP_PASS（Google 應用程式密碼）。未設定時視為不能寄信。
 */
import nodemailer, { type Transporter } from "nodemailer";

export const mailConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

export function maskEmail(email: string) {
  const [u, d] = email.split("@");
  return `${u.slice(0, 1)}${"*".repeat(Math.max(2, u.length - 1))}@${d}`;
}

export async function sendResetMail(to: string, name: string, link: string) {
  const from = process.env.MAIL_FROM || `設計思考工作坊 <${process.env.SMTP_USER}>`;
  const text = [
    `${name} 您好：`,
    "",
    "我們收到您在「設計思考工作坊」課程網站重設密碼的申請。",
    "請在 30 分鐘內開啟以下連結設定新密碼（連結只能使用一次）：",
    "",
    link,
    "",
    "如果不是您本人申請，請忽略這封信，您的密碼不會改變。",
    "",
    "中國附醫教學部 設計思考工作坊",
  ].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:'Noto Sans TC','PingFang TC',sans-serif;font-size:18px;line-height:1.7;color:#1c2523">
<p>${esc(name)} 您好：</p>
<p>我們收到您在「設計思考工作坊」課程網站重設密碼的申請。<br>請在 <b>30 分鐘內</b> 點下方按鈕設定新密碼（連結只能使用一次）。</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0f7a63;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600">設定新密碼</a></p>
<p style="color:#5f6b67;font-size:15px">按鈕無法使用時，請複製這個網址到瀏覽器：<br>${esc(link)}</p>
<p style="color:#5f6b67;font-size:15px">如果不是您本人申請，請忽略這封信，您的密碼不會改變。</p>
<p>中國附醫教學部 設計思考工作坊</p></div>`;
  await getTransport().sendMail({ from, to, subject: "【設計思考工作坊】重設密碼", text, html });
}
