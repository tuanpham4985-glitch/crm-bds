import { findNhanVienByEmail, getNhanVien } from '../src/lib/google-sheets';

async function test() {
  const email = 'tuanpham4985@gmail.com';
  console.log('Testing login for:', email);
  
  const nvList = await getNhanVien();
  console.log(`Total NHAN_VIEN rows: ${nvList.length}`);
  
  const nv = nvList.find(x => x.email?.trim().toLowerCase() === email.toLowerCase());
  
  if (nv) {
    console.log('User found in full list:', JSON.stringify(nv, null, 2));
  } else {
    console.log('User NOT found in full list!');
    console.log('List of all emails in system:');
    nvList.forEach(x => console.log(`- ${x.ho_ten} (${x.email}) - Trang thai: ${x.trang_thai}`));
  }
  
  const nvAuth = await findNhanVienByEmail(email);
  if (nvAuth) {
    console.log('findNhanVienByEmail found:', nvAuth.ho_ten, nvAuth.email, nvAuth.trang_thai);
  } else {
    console.log('findNhanVienByEmail returned null!');
  }
}

test().catch(console.error);
