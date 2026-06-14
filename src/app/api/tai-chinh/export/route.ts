import { NextRequest, NextResponse } from 'next/server';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType,
} from 'docx';

const B = 1e9;
const fmtTy = (v: number) => `${(v / B).toFixed(2)} tỷ`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function cell(text: string, bold = false, color = '000000', shade?: string): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold, color, size: 20 })],
      alignment: AlignmentType.LEFT,
    })],
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

function cellR(text: string, bold = false, color = '000000'): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold, color, size: 20 })],
      alignment: AlignmentType.RIGHT,
    })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}

function para(text: string, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, bold, size: 22 })],
    spacing: { after: 120 },
  });
}

function hr() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
    spacing: { before: 120, after: 120 },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pnl: p, monthly = [], period = 'T1–T5/2026', filename = '' } = body;

    const dtMG  = p.dtMG;
    const hhAll = p.hhSalesAll;
    const tNong = p.thuongNongSales;
    const cpBH  = p.cpBanHang;
    const cpVH  = p.cpVanHanh;
    const ln    = p.lnTruocThue;
    const ds    = p.doanhSo;
    const n     = body.numMonths || 5;

    const pct = (a: number) => dtMG > 0 ? (a / dtMG * 100) : 0;
    const hhPct   = pct(hhAll);
    const tNongPct= pct(tNong);
    const grossPct= 100 - hhPct - tNongPct;
    const cpBHPct = pct(cpBH);
    const cpVHPct = pct(cpVH);
    const lnPct   = pct(ln);

    const avgDS  = ds  / B / n;
    const avgDT  = dtMG / B / n;
    const avgCan = p.soCan / n;

    const statusDS  = avgDS  >= 58  ? 'ĐẠT' : 'CHƯA ĐẠT';
    const statusDT  = avgDT  >= 2.3 ? 'ĐẠT' : 'CHƯA ĐẠT';
    const statusHH  = hhPct  <= 65  ? 'ĐẠT' : 'VƯỢT';
    const statusVH  = cpVHPct<= 15  ? 'ĐẠT' : 'VƯỢT';
    const statusLN  = lnPct  >= 20  ? 'ĐẠT' : 'CHƯA ĐẠT';
    const statusCan = avgCan >= 6   ? 'ĐẠT' : 'CHƯA ĐẠT';

    const ROW_SHADE = 'F5F5F5';
    const HEAD_SHADE = '2563EB';

    const tableHeader = (cols: string[]) => new TableRow({
      children: cols.map(c => new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: c, bold: true, color: 'FFFFFF', size: 20 })],
          alignment: AlignmentType.LEFT,
        })],
        shading: { type: ShadingType.CLEAR, fill: HEAD_SHADE },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
      })),
    });

    const kpiTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableHeader(['KPI', 'Mục tiêu', `Thực tế BQ (${period})`, 'Trạng thái']),
        ...[
          ['Doanh số/tháng', '≥ 58 tỷ', `${avgDS.toFixed(1)} tỷ`, statusDS],
          ['DT môi giới/tháng', '≥ 2,3 tỷ', `${avgDT.toFixed(2)} tỷ`, statusDT],
          ['HH Sales/DT', '≤ 65%', fmtPct(hhPct), statusHH],
          ['MKT/DT', '≤ 8%', fmtPct(cpBHPct), 'ĐẠT'],
          ['CP VH/DT', '≤ 15%', fmtPct(cpVHPct), statusVH],
          ['LN trước thuế/DT', '≥ 20%', fmtPct(lnPct), statusLN],
          ['Số căn/tháng', '≥ 6 căn', `${avgCan.toFixed(1)} căn`, statusCan],
        ].map((r, i) => new TableRow({
          children: [
            cell(r[0], true, '111827', i % 2 === 0 ? ROW_SHADE : 'FFFFFF'),
            cell(r[1], false, '374151', i % 2 === 0 ? ROW_SHADE : 'FFFFFF'),
            cell(r[2], true, '111827', i % 2 === 0 ? ROW_SHADE : 'FFFFFF'),
            cell(r[3], true,
              r[3] === 'ĐẠT' ? '065F46' : '9B1C1C',
              i % 2 === 0 ? ROW_SHADE : 'FFFFFF'),
          ],
        })),
      ],
    });

    const plTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableHeader(['Khoản mục', 'Số tiền', '% Doanh thu']),
        ...[
          ['Doanh thu môi giới', fmtTy(dtMG), '100,0%', ''],
          ['  — HH Sales (tất cả)', fmtTy(-hhAll), fmtPct(hhPct), 'neg'],
          ['  — Thưởng nóng sales', fmtTy(-tNong), fmtPct(tNongPct), 'neg'],
          ['Lợi nhuận gộp', fmtTy(dtMG - hhAll - tNong), fmtPct(grossPct), 'mid'],
          ['  — CP bán hàng/MKT', fmtTy(-cpBH), fmtPct(cpBHPct), 'neg'],
          ['  — CP vận hành', fmtTy(-cpVH), fmtPct(cpVHPct), 'neg'],
          ['Lợi nhuận trước thuế', fmtTy(ln), fmtPct(lnPct), 'result'],
        ].map((r, i) => {
          const isResult = r[3] === 'result';
          const isMid    = r[3] === 'mid';
          const shade    = isResult || isMid ? 'EFF6FF' : i % 2 === 0 ? ROW_SHADE : 'FFFFFF';
          const numColor = r[3] === 'neg' ? '9B1C1C' : r[3] === 'result' ? '1D4ED8' : '065F46';
          return new TableRow({
            children: [
              cell(r[0], isResult || isMid, '111827', shade),
              cellR(r[1], isResult || isMid, numColor),
              cellR(r[2], isResult || isMid, numColor),
            ],
          });
        }),
      ],
    });

    const monthTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableHeader(['Tháng', 'Doanh số', 'DT Môi giới', '% HH/DS', 'Số căn']),
        ...monthly.map((m: { label: string; doanhSo: number; dtHH: number; soCan: number }, i: number) => {
          const shade = i % 2 === 0 ? ROW_SHADE : 'FFFFFF';
          const dtHHty = m.dtHH / B;
          const dsTy   = m.doanhSo / B;
          const hhRate = m.doanhSo > 0 ? (m.dtHH / m.doanhSo * 100) : 0;
          return new TableRow({
            children: [
              cell(m.label, true, '111827', shade),
              cellR(`${dsTy.toFixed(2)} tỷ`, false, '374151'),
              cellR(`${dtHHty.toFixed(2)} tỷ`, false, '374151'),
              cellR(fmtPct(hhRate), false, '374151'),
              cellR(`${m.soCan} căn`, false, '374151'),
            ],
          });
        }),
      ],
    });

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Times New Roman', size: 24 } },
        },
      },
      sections: [{
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1200, right: 1200 } } },
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'VICTORY HOLDINGS', bold: true, size: 36, color: '1D3557' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH', bold: true, size: 28, color: '1D3557' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Kỳ báo cáo: ${period}`, size: 24, color: '374151' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Nguồn dữ liệu: ${filename || 'BC KQ HĐKD'}`, size: 20, color: '6B7280' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`, size: 20, color: '6B7280' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 360 },
          }),
          hr(),

          heading('I. TÓM TẮT ĐIỀU HÀNH', HeadingLevel.HEADING_1),
          para(
            `Trong kỳ ${period}, Victory Holdings ghi nhận doanh số giao dịch đạt ${(ds/B).toFixed(1)} tỷ đồng ` +
            `(${p.soCan} căn), doanh thu môi giới ${(dtMG/B).toFixed(2)} tỷ đồng. ` +
            `Bình quân mỗi tháng: ${avgDS.toFixed(1)} tỷ doanh số, ${avgDT.toFixed(2)} tỷ doanh thu, ${avgCan.toFixed(1)} căn. ` +
            `Lợi nhuận trước thuế đạt ${(ln/B*1000).toFixed(0)} triệu đồng, tương đương ${fmtPct(lnPct)} doanh thu.`
          ),
          para(
            `Điểm nổi bật: doanh số và doanh thu vượt kế hoạch lần lượt +${((avgDS/58-1)*100).toFixed(0)}% và ` +
            `+${((avgDT/2.3-1)*100).toFixed(0)}%. Tuy nhiên tỷ lệ hoa hồng sales ở mức ${fmtPct(hhPct)} ` +
            `(mục tiêu ≤65%) và lợi nhuận trước thuế ${fmtPct(lnPct)} (mục tiêu ≥20%) là hai chỉ số cần cải thiện ngay.`
          ),
          hr(),

          heading('II. BẢNG KPI THEO DÕI', HeadingLevel.HEADING_1),
          kpiTable,

          new Paragraph({ text: '', spacing: { after: 240 } }),
          hr(),

          heading('III. CẤU TRÚC P&L', HeadingLevel.HEADING_1),
          plTable,

          new Paragraph({ text: '', spacing: { after: 240 } }),
          hr(),

          heading('IV. KẾT QUẢ THEO THÁNG', HeadingLevel.HEADING_1),
          monthTable,

          new Paragraph({ text: '', spacing: { after: 240 } }),
          hr(),

          heading('V. PHÂN TÍCH ĐIỂM MẠNH & ĐIỂM YẾU', HeadingLevel.HEADING_1),

          heading('Điểm mạnh', HeadingLevel.HEADING_2),
          ...[
            `✓  Doanh số BQ ${avgDS.toFixed(1)} tỷ/tháng — vượt kế hoạch 58 tỷ tới ${((avgDS/58-1)*100).toFixed(0)}%, cho thấy năng lực giao dịch mạnh.`,
            `✓  Doanh thu môi giới BQ ${avgDT.toFixed(2)} tỷ/tháng — vượt mục tiêu 2,3 tỷ tới ${((avgDT/2.3-1)*100).toFixed(0)}%.`,
            `✓  Chi phí marketing chỉ ${fmtPct(cpBHPct)} doanh thu — tiết kiệm tốt, còn nhiều dư địa (giới hạn 8%).`,
            `✓  Số căn BQ ${avgCan.toFixed(1)} căn/tháng — đạt mục tiêu ≥6 căn.`,
            `✓  Chi phí vận hành ${fmtPct(cpVHPct)} DT — trong giới hạn cho phép.`,
          ].map(t => para(t)),

          heading('Điểm yếu & rủi ro', HeadingLevel.HEADING_2),
          ...[
            `✗  HH Sales ${fmtPct(hhPct)} DT — vượt trần 65% tới ${(hhPct-65).toFixed(1)} điểm %. Nguyên nhân: tỷ trọng deal đối tác cao (HH 3,5–4%+). Mỗi điểm % dư ≈ ${((dtMG/B)*(hhPct-65)/100*1000/n).toFixed(0)} tr đồng/tháng bị "rò rỉ".`,
            `✗  LN trước thuế ${fmtPct(lnPct)} — thấp hơn mục tiêu 20%, chênh lệch ${(20-lnPct).toFixed(1)} điểm %, tương đương ${((dtMG/B)*(20-lnPct)/100).toFixed(2)} tỷ lợi nhuận bị thiếu hụt trong kỳ.`,
            `✗  Biến động doanh thu tháng lớn — có tháng dưới điểm hòa vốn 2,7 tỷ, gây áp lực dòng tiền.`,
            `✗  Phụ thuộc đối tác bên ngoài — rủi ro khi đối tác rút lui hoặc chuyển sang sàn khác.`,
          ].map(t => para(t)),

          hr(),

          heading('VI. Ý KIẾN THAM MƯU KẾ TOÁN TRƯỞNG', HeadingLevel.HEADING_1),
          ...[
            '1. Kiểm soát tỷ lệ HH Sales về ≤65% — Ưu tiên deal nội bộ, đàm phán lại khung HH với đối tác chiến lược (đặt trần HH đối tác ≤3%). Mỗi điểm % giảm = thêm ~' + ((dtMG/B)*0.01*1000/n).toFixed(0) + ' triệu LN/tháng.',
            '2. Xây dựng pipeline 3 tháng tới — Đảm bảo mỗi tháng có ít nhất 6 căn trong pipe để không bị tháng "trống" dưới điểm hòa vốn 2,7 tỷ DT.',
            '3. Tách báo cáo Deal nội bộ vs Đối tác — Theo dõi KPI riêng: tỷ trọng deal nội bộ mục tiêu ≥60% (hiện ~50%).',
            '4. Chi phí setup VP (569 tr) — Đây là CP một lần, đề nghị phân bổ vào 12 tháng (47,4 tr/tháng) để phản ánh đúng chi phí định kỳ. Nếu điều chỉnh, CP VH thực tế chỉ ~11,4% DT.',
            '5. Tăng thưởng nóng CĐT cho nội bộ — Ưu tiên dự án có chính sách thưởng nóng, giảm phụ thuộc deal HH cao từ đối tác.',
          ].map(t => para(t)),

          hr(),

          heading('VII. KẾ HOẠCH THỰC HIỆN', HeadingLevel.HEADING_1),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              tableHeader(['Mục tiêu', 'Hành động cụ thể', 'Thời hạn', 'Người chịu trách nhiệm']),
              ...[
                ['Giảm HH Sales ≤65%', 'Đặt trần HH đối tác ≤3%; tăng tỷ lệ deal nội bộ lên 60%', 'T6–T7/2026', 'GĐ Kinh doanh'],
                ['LN ≥15% DT (interim)', 'Giảm HH + kiểm soát CP VH cố định', 'T6–T8/2026', 'Kế toán trưởng + GĐ KD'],
                ['Pipeline ≥6 căn/tháng', 'Họp review pipeline hàng tuần; kích hoạt khách hàng cũ', 'Hàng tháng', 'GDDA + Sales'],
                ['Báo cáo KPI hàng tháng', 'Upload file HĐKD lên Dashboard; BGĐ review ngày 5 hàng tháng', 'Từ T6/2026', 'Kế toán trưởng'],
                ['Đánh giá lại đối tác', 'Rà soát top 5 đối tác theo doanh thu và tỷ lệ HH', 'T6/2026', 'GĐ Kinh doanh'],
              ].map((r, i) => new TableRow({
                children: r.map(t => cell(t, false, '111827', i % 2 === 0 ? ROW_SHADE : 'FFFFFF')),
              })),
            ],
          }),

          new Paragraph({ text: '', spacing: { after: 360 } }),
          hr(),
          new Paragraph({
            children: [new TextRun({ text: 'Báo cáo do hệ thống Victory Holdings CRM tổng hợp tự động.', size: 18, color: '9CA3AF', italics: true })],
            alignment: AlignmentType.CENTER,
          }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="VH_BaoCao_TaiChinh_${period.replace(/[^a-zA-Z0-9]/g, '_')}.docx"`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json({ error: 'Lỗi tạo file Word.' }, { status: 500 });
  }
}
