import { getNhanVien } from '../src/lib/google-sheets';

async function debugAvatars() {
  console.log('=== DEBUG AVATARS ===');
  const nvList = await getNhanVien();
  console.log(`Total NHAN_VIEN rows: ${nvList.length}`);
  
  let withAvatar = 0;
  let noAvatar = 0;
  
  nvList.forEach((nv, i) => {
    const url = nv.avatar_url || '';
    if (url) {
      withAvatar++;
      const urlType = url.startsWith('data:image') ? 'base64' : url.startsWith('http') ? 'http-url' : 'unknown';
      console.log(`[${i+1}] ${nv.ho_ten}: avatar=${urlType} (${url.length} chars)`);
    } else {
      noAvatar++;
    }
  });
  
  console.log(`\nSummary: ${withAvatar} with avatar, ${noAvatar} without`);
}

debugAvatars().catch(console.error);
