import { getNhanVien } from '../src/lib/google-sheets';

async function debugAvatarContent() {
  console.log('=== DEBUG AVATAR CONTENT (First 5) ===');
  const nvList = await getNhanVien();
  
  const withAvatar = nvList.filter(nv => nv.avatar_url);
  
  withAvatar.slice(0, 5).forEach((nv, i) => {
    const url = nv.avatar_url || '';
    console.log(`\n[${i+1}] ${nv.ho_ten}:`);
    console.log(`  Length: ${url.length}`);
    console.log(`  Content: ${JSON.stringify(url)}`);
  });
}

debugAvatarContent().catch(console.error);
