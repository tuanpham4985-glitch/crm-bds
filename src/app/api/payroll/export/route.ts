import { NextRequest, NextResponse } from 'next/server';
import { getBangLuong, getNhanVien } from '@/lib/google-sheets';
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

    // 1. Fetch data
    const [allPayroll, allEmployees] = await Promise.all([
      getBangLuong(),
      getNhanVien()
    ]);

    let filtered = allPayroll.filter(bl => {
      if (bl.nam !== nam) return false;
      if (!isYearly && bl.thang !== thang) return false;
      return true;
    });

    if (filtered.length === 0) {
      return NextResponse.json({ success: false, error: 'Không có dữ liệu bảng lương cho thời gian này' }, { status: 404 });
    }

    const empMap = new Map(allEmployees.map(e => [e.id_nhan_vien, e.ho_ten]));

    // 2. Aggregate data if yearly
    let displayData = filtered;
    if (isYearly) {
      const summaryMap = new Map<string, any>();
      filtered.forEach(item => {
        if (!summaryMap.has(item.id_nhan_vien)) {
          summaryMap.set(item.id_nhan_vien, { ...item });
        } else {
          const s = summaryMap.get(item.id_nhan_vien);
          s.luong_co_ban += item.luong_co_ban;
          s.hoa_hong += item.hoa_hong;
          s.thuong += item.thuong;
          s.phat += item.phat;
          s.bao_hiem += item.bao_hiem;
          s.thue += item.thue;
          s.tong_luong += item.tong_luong;
        }
      });
      displayData = Array.from(summaryMap.values());
    }

    const totalNet = displayData.reduce((sum, item) => sum + item.tong_luong, 0);
    const titleText = isYearly ? `BÁO CÁO TỔNG HỢP LƯƠNG CẢ NĂM ${nam}` : `BÁO CÁO TỔNG HỢP LƯƠNG THÁNG ${thang}/${nam}`;

    // 3. Generate DOCX
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [new TextRun({ text: "CÔNG TY BẤT ĐỘNG SẢN CRM", bold: true })],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: titleText,
                bold: true,
                size: 28,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  "STT", "Họ tên", "Lương CB", "Hoa hồng", "Thưởng", "Phạt", "Bảo hiểm", "Thuế", "NET Nhận"
                ].map(header => new TableCell({
                  children: [new Paragraph({ 
                    children: [new TextRun({ text: header, bold: true })],
                    alignment: AlignmentType.CENTER 
                  })],
                  verticalAlign: VerticalAlign.CENTER,
                  shading: { fill: "F2F2F2" }
                }))
              }),
              ...displayData.map((item, index) => new TableRow({
                children: [
                  (index + 1).toString(),
                  empMap.get(item.id_nhan_vien) || item.id_nhan_vien,
                  fmt(item.luong_co_ban),
                  fmt(item.hoa_hong),
                  fmt(item.thuong),
                  fmt(item.phat),
                  fmt(item.bao_hiem),
                  fmt(item.thue),
                  fmt(item.tong_luong)
                ].map(text => new TableCell({
                  children: [new Paragraph({ 
                    text, 
                    alignment: text.includes('₫') ? AlignmentType.RIGHT : AlignmentType.LEFT 
                  })],
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 100, bottom: 100, left: 100, right: 100 }
                }))
              })),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ 
                      children: [new TextRun({ text: "TỔNG CỘNG", bold: true })],
                      alignment: AlignmentType.RIGHT 
                    })],
                    columnSpan: 8,
                    verticalAlign: VerticalAlign.CENTER,
                    shading: { fill: "F2F2F2" }
                  }),
                  new TableCell({
                    children: [new Paragraph({ 
                      children: [new TextRun({ text: fmt(totalNet), bold: true })],
                      alignment: AlignmentType.RIGHT 
                    })],
                    verticalAlign: VerticalAlign.CENTER,
                    shading: { fill: "F2F2F2" }
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
              new TextRun({ text: "Người lập biểu", italics: true }),
              new TextRun({ text: "                " }),
              new TextRun({ text: "Giám đốc phê duyệt", italics: true, bold: true }),
            ],
            spacing: { before: 200 },
            alignment: AlignmentType.CENTER
          })
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = isYearly ? `Bao_cao_luong_nam_${nam}.docx` : `Bao_cao_luong_${thang}_${nam}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename=${filename}`,
      },
    });

  } catch (error) {
    console.error('[API /payroll/export] Error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xuất file báo cáo' }, { status: 500 });
  }
}
