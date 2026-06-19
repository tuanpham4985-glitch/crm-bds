// Zalo OA API v2 client — gửi tin nhắn qua Official Account
const ZALO_API = 'https://openapi.zalo.me/v2.0/oa/message';

export async function sendZaloMessage(zaloUserId: string, text: string): Promise<boolean> {
  const token = process.env.ZALO_ACCESS_TOKEN;
  if (!token || !zaloUserId) return false;

  try {
    const res = await fetch(ZALO_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': token,
      },
      body: JSON.stringify({
        recipient: { user_id: zaloUserId },
        message:   { text },
      }),
    });

    if (!res.ok) {
      console.error('[Zalo] HTTP error:', res.status, await res.text());
      return false;
    }

    const data = await res.json() as { error: number; message?: string };
    if (data.error !== 0) {
      console.error('[Zalo] API error:', data.error, data.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Zalo] sendZaloMessage failed:', err);
    return false;
  }
}
