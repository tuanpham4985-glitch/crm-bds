import { generatePayroll } from '../src/lib/payroll';

async function test() {
  try {
    console.log('--- GENERATING PAYROLL FOR 01/2026 ---');
    const results = await generatePayroll(1, 2026);
    
    const ha = results.find(r => r.ho_ten && r.ho_ten.includes('Nguyễn Thị Hà'));
    if (ha) {
      console.log('\n--- SUCCESS! NGUYEN THI HA PAYROLL DETAIL ---');
      console.log({
        ho_ten: ha.ho_ten,
        luong_co_ban: ha.luong_co_ban,
        doanh_thu: ha.doanh_thu,
        hoa_hong: ha.hoa_hong,
        thuong: ha.thuong,
        phat: ha.phat,
        gross: ha.gross,
        bao_hiem: ha.bao_hiem,
        thue: ha.thue,
        tong_luong: ha.tong_luong,
        items: ha.items
      });
    } else {
      console.log('Employee Nguyễn Thị Hà not found in payroll list!');
    }
  } catch (err) {
    console.error(err);
  }
}

test();
