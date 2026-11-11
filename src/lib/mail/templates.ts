/**
 * Transactional email bodies (Thai). Every template returns both a plain-text and an HTML part;
 * user-supplied values are HTML-escaped before they reach the HTML part.
 */

/** Escapes the five HTML-significant characters. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

export type MailBody = { subject: string; text: string; html: string };

/** Shared wrapper: brand bar, white card, muted footer. Inline styles only (email clients). */
function layout(input: { title: string; bodyHtml: string; brand: string }): string {
  return `<!doctype html><html lang="th"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,'Noto Sans Thai',sans-serif;color:#18181b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
<tr><td style="background:#b91c1c;color:#fff;padding:14px 20px;font-weight:700;font-size:16px">${escapeHtml(input.brand)}</td></tr>
<tr><td style="padding:20px;font-size:15px;line-height:1.6"><h1 style="margin:0 0 12px;font-size:18px">${escapeHtml(input.title)}</h1>${input.bodyHtml}</td></tr>
<tr><td style="padding:12px 20px;background:#fafafa;color:#71717a;font-size:12px">อีเมลนี้ส่งจากระบบอัตโนมัติ หากคุณไม่ได้ขอรหัสผ่านใหม่ กรุณาติดต่อทีมงานทันที</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * "Here is your temporary password" email sent after an admin resets a login.
 * The user must change it on first sign-in (mustChangePassword is set by the caller).
 */
export function tempPasswordEmail(input: { name: string; email: string; tempPassword: string; loginUrl: string; brand: string; shop?: string | null }): MailBody {
  const subject = `รหัสผ่านชั่วคราวสำหรับเข้าสู่ระบบ ${input.brand}`;
  const greeting = input.shop ? `สวัสดีคุณ${input.name} (${input.shop})` : `สวัสดีคุณ${input.name}`;
  const text = [
    greeting,
    '',
    'ทีมงานได้รีเซ็ตรหัสผ่านบัญชีของคุณแล้ว ใช้ข้อมูลด้านล่างเพื่อเข้าสู่ระบบ',
    `อีเมล: ${input.email}`,
    `รหัสผ่านชั่วคราว: ${input.tempPassword}`,
    `เข้าสู่ระบบที่: ${input.loginUrl}`,
    '',
    'หลังเข้าสู่ระบบ ระบบจะให้ตั้งรหัสผ่านใหม่ทันที กรุณาอย่าส่งต่ออีเมลนี้ให้ผู้อื่น',
    'หากคุณไม่ได้ขอรหัสผ่านใหม่ กรุณาติดต่อทีมงานทันที',
  ].join('\n');
  const bodyHtml = `
<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 12px">ทีมงานได้รีเซ็ตรหัสผ่านบัญชีของคุณแล้ว ใช้ข้อมูลด้านล่างเพื่อเข้าสู่ระบบ</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border-collapse:collapse">
<tr><td style="padding:6px 12px 6px 0;color:#71717a">อีเมล</td><td style="padding:6px 0;font-family:ui-monospace,Menlo,monospace">${escapeHtml(input.email)}</td></tr>
<tr><td style="padding:6px 12px 6px 0;color:#71717a">รหัสผ่านชั่วคราว</td><td style="padding:6px 0;font-family:ui-monospace,Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:1px">${escapeHtml(input.tempPassword)}</td></tr>
</table>
<p style="margin:0 0 16px"><a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700">เข้าสู่ระบบ</a></p>
<p style="margin:0;color:#52525b;font-size:13px">หลังเข้าสู่ระบบ ระบบจะให้ตั้งรหัสผ่านใหม่ทันที กรุณาอย่าส่งต่ออีเมลนี้ให้ผู้อื่น</p>`;
  return { subject, text, html: layout({ title: 'รหัสผ่านชั่วคราวของคุณ', bodyHtml, brand: input.brand }) };
}

/** Plain "settings work" email sent by the test button on /admin/settings. */
export function testEmail(input: { brand: string; sentBy: string }): MailBody {
  const text = `ทดสอบการส่งอีเมลจากหลังบ้าน ${input.brand} โดย ${input.sentBy}\nถ้าได้รับอีเมลนี้ แปลว่าตั้งค่า SMTP ถูกต้อง`;
  const bodyHtml = `<p style="margin:0">ส่งจากหลังบ้านโดย ${escapeHtml(input.sentBy)}<br>ถ้าได้รับอีเมลนี้ แปลว่าตั้งค่า SMTP ถูกต้อง</p>`;
  return { subject: `[ทดสอบ] การส่งอีเมลของ ${input.brand}`, text, html: layout({ title: 'ทดสอบการส่งอีเมล', bodyHtml, brand: input.brand }) };
}
