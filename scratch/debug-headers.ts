import { getNhanVien } from '../src/lib/google-sheets';

async function test() {
  try {
    const list = await getNhanVien();
    const tuan = list.find(r => r.email === 'tuanpham4985@gmail.com');
    console.log('TUAN:', tuan);
  } catch (e) {
    console.error(e);
  }
}

test();
