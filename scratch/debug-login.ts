import { getNhanVien } from '../src/lib/google-sheets';

async function debugLogin() {
  const email = 'tuanpham4985@gmail.com';
  console.log('=== DEBUG LOGIN ===');
  const nvList = await getNhanVien();
  console.log(`Total NHAN_VIEN rows: ${nvList.length}`);
  
  const nv = nvList.find(x => (x.email || '').trim().toLowerCase() === email.toLowerCase());
  
  if (nv) {
    console.log('\n✅ User found!');
    console.log('  ho_ten   :', nv.ho_ten);
    console.log('  email    :', JSON.stringify(nv.email));
    console.log('  vai_tro  :', JSON.stringify(nv.vai_tro));
    console.log('  trang_thai:', JSON.stringify(nv.trang_thai));
  } else {
    console.log('\n❌ User NOT found by email match!');
    console.log('\nAll emails in system:');
    nvList.forEach((x, i) =>
      console.log(`  [${i}] ho_ten="${x.ho_ten}" email=${JSON.stringify(x.email)} trang_thai=${JSON.stringify(x.trang_thai)}`)
    );
  }
}

debugLogin().catch(console.error);
