import { NextRequest, NextResponse } from 'next/server';
import { getPayrollRecords, getPayrollItems, getNhanVien } from '@/lib/google-sheets';
import { 
  Document, 
  Packer, 
  Paragraph, 
  Table, 
  TableCell, 
  TableRow, 
  WidthType, 
  AlignmentType, 
  TextRun, 
  HeadingLevel,
  VerticalAlign
} from 'docx';

function fmt(n: number) {
  if (!n) return '0 ₫';
  return n.toLocaleString('vi-VN') + ' ₫';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const thang = searchParams.get('thang') ? Number(searchParams.get('thang')) : null;
    const nam = Number(searchParams.get('nam'));

    if (!nam) {
      return NextResponse.json({ success: false, error: 'Thiếu năm' }, { status: 400 });
    }

    const isYearly = !thang || thang === 0;

    // 1. Fetch data from new PAYROLL + PAYROLL_ITEMS sheets
    // For yearly report we need to fetch each month, or fetch all and filter by year.
    // getPayrollRecords filters by thang+nam; for yearly we fetch all 12 months in parallel.
    let allPayrollRecords;
    if (isYearly) {
      const months = await Promise.all(
        Array.from({ length: 12 }, (_, i) => getPayrollRecords(i + 1, nam))
      );
      allPayrollRecords = months.flat();
    } else {
      allPayrollRecords = await getPayrollRecords(thang!, nam);
    }

    if (allPayrollRecords.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Không có dữ liệu bảng lương cho thời gian này' },
        { status: 404 }
      );
    }

    // 2. Fetch employees and payroll items in parallel
    const payrollIds = allPayrollRecords.map(p => p.id);
    const [allEmployees, allItems] = await Promise.all([
      getNhanVien(),
      getPayrollItems(payrollIds),
    ]);

    const empMap = new Map(allEmployees.map(e => [e.id_nhan_vien, e.ho_ten]));

    // 3. Reconstruct payroll figures from dynamic PAYROLL_ITEMS
    //    Items with nhom='thu_nhap' are income; nhom='khau_tru' are deductions.
    //    We derive the display fields from items when available.
    const getItemAmount = (
      payrollId: string,
      loaiKhoan: string
    ): number => {
      const item = allItems.find(
        i => i.payroll_id === payrollId && i.loai_khoan === loaiKhoan
      );
      return item?.so_tien ?? 0;
    };

    const getSumByGroup = (payrollId: string, nhom: 'thu_nhap' | 'khau_tru' | 'chi_phi_cty'): number =>
      allItems
        .filter(i => i.payroll_id === payrollId && i.nhom === nhom)
        .reduce((s, i) => s + i.so_tien, 0);

    // Map each payroll record to display row
    const enriched = allPayrollRecords.map(p => ({
      id_nhan_vien: p.id_nhan_vien,
      thang: p.thang,
      nam: p.nam,
      // Try to pull known line items, fall back to gross/net from header
      luong_co_ban: getItemAmount(p.id, 'Lương thực tế') || getItemAmount(p.id, 'Lương cơ bản'),
      hoa_hong: getItemAmount(p.id, 'Hoa hồng BĐS'),
      thuong: getItemAmount(p.id, 'Thưởng'),
      ot_pay: getItemAmount(p.id, 'Lương OT'),
      phat: getItemAmount(p.id, 'Phạt'),
      bao_hiem_nv: getItemAmount(p.id, 'BHXH (8%)') + getItemAmount(p.id, 'BHYT (1.5%)') + getItemAmount(p.id, 'BHTN (1%)') || getItemAmount(p.id, 'BHXH (10.5%)'),
      thue: getItemAmount(p.id, 'Thuế TNCN'),
      chi_phi_cty: getSumByGroup(p.id, 'chi_phi_cty'),
      gross: p.gross || getSumByGroup(p.id, 'thu_nhap'),
      tong_luong: p.net,
    }));

    // 4. Aggregate if yearly (sum per employee across all months)
    let displayData: typeof enriched;
    if (isYearly) {
      const summaryMap = new Map<string, typeof enriched[0]>();
      enriched.forEach(item => {
        if (!summaryMap.has(item.id_nhan_vien)) {
          summaryMap.set(item.id_nhan_vien, { ...item });
        } else {
          const s = summaryMap.get(item.id_nhan_vien)!;
          s.luong_co_ban += item.luong_co_ban;
          s.hoa_hong     += item.hoa_hong;
          s.thuong       += item.thuong;
          s.ot_pay       += item.ot_pay;
          s.phat         += item.phat;
          s.bao_hiem_nv  += item.bao_hiem_nv;
          s.thue         += item.thue;
          s.chi_phi_cty  += item.chi_phi_cty;
          s.gross        += item.gross;
          s.tong_luong   += item.tong_luong;
        }
      });
      displayData = Array.from(summaryMap.values());
    } else {
      displayData = enriched;
    }

    const totalNet = displayData.reduce((sum, item) => sum + item.tong_luong, 0);
    const titleText = isYearly
      ? `BÁO CÁO TỔNG HỢP LƯƠNG CẢ NĂM ${nam}`
      : `BÁO CÁO TỔNG HỢP LƯƠNG THÁNG ${thang}/${nam}`;

    // 5. Generate DOCX
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'CÔNG TY BẤT ĐỘNG SẢN CRM', bold: true })],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: titleText, bold: true, size: 28 }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Header row
              new TableRow({
                children: [
                  'STT', 'Họ tên', 'Lương CB', 'Hoa hồng', 'Thưởng', 'OT', 'Phạt', 'BH (NV)', 'Thuế', 'NET', 'CP Cty'
                ].map(header => new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: header, bold: true })],
                    alignment: AlignmentType.CENTER
                  })],
                  verticalAlign: VerticalAlign.CENTER,
                  shading: { fill: 'F2F2F2' }
                }))
              }),
              // Data rows
              ...displayData.map((item, index) =>
                new TableRow({
                  children: [
                    (index + 1).toString(),
                    empMap.get(item.id_nhan_vien) || item.id_nhan_vien,
                    fmt(item.luong_co_ban),
                    fmt(item.hoa_hong),
                    fmt(item.thuong),
                    fmt(item.ot_pay),
                    fmt(item.phat),
                    fmt(item.bao_hiem_nv),
                    fmt(item.thue),
                    fmt(item.tong_luong),
                    fmt(item.chi_phi_cty),
                  ].map(text => new TableCell({
                    children: [new Paragraph({
                      text,
                      alignment: text.includes('₫') ? AlignmentType.RIGHT : AlignmentType.LEFT
                    })],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 100, bottom: 100, left: 100, right: 100 }
                  }))
                })
              ),
              // Total row
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: 'TỔNG CỘNG', bold: true })],
                      alignment: AlignmentType.RIGHT
                    })],
                    columnSpan: 10,
                    verticalAlign: VerticalAlign.CENTER,
                    shading: { fill: 'F2F2F2' }
                  }),
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: fmt(totalNet), bold: true })],
                      alignment: AlignmentType.RIGHT
                    })],
                    verticalAlign: VerticalAlign.CENTER,
                    shading: { fill: 'F2F2F2' }
                  })
                ]
              })
            ]
          }),
          new Paragraph({
            text: `Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')}`,
            spacing: { before: 400 },
            alignment: AlignmentType.RIGHT
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Người lập biểu', italics: true }),
              new TextRun({ text: '                ' }),
              new TextRun({ text: 'Giám đốc phê duyệt', italics: true, bold: true }),
            ],
            spacing: { before: 200 },
            alignment: AlignmentType.CENTER
          })
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = isYearly
      ? `Bao_cao_luong_nam_${nam}.docx`
      : `Bao_cao_luong_${thang}_${nam}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename=${filename}`,
      },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[API /payroll/export] Error:', msg, error);
    return NextResponse.json({ success: false, error: `Lỗi xuất file báo cáo: ${msg}` }, { status: 500 });
  }
}
