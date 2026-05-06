/**
 * Logic tính thuế TNCN theo quy định 2026.
 * Bảng lương tháng & Quyết toán năm.
 */

export const TAX_CONFIG = {
  giam_tru_ban_than: 15_500_000,
  giam_tru_phu_thuoc: 6_200_000,
};

// Biểu thuế lũy tiến theo tháng (Quy định 2026)
export const TAX_BRACKETS_MONTH = [
  { limit: 10_000_000, rate: 0.05 },
  { limit: 30_000_000, rate: 0.10 },
  { limit: 60_000_000, rate: 0.20 },
  { limit: 100_000_000, rate: 0.30 },
  { limit: Infinity, rate: 0.35 }
];

// Biểu thuế lũy tiến theo năm (x12 giới hạn)
export const TAX_BRACKETS_YEAR = TAX_BRACKETS_MONTH.map(b => ({
  limit: b.limit === Infinity ? Infinity : b.limit * 12,
  rate: b.rate
}));

/**
 * Tính thuế lũy tiến chung
 */
function calculateProgressiveTax(income: number, brackets: { limit: number, rate: number }[]): number {
  if (income <= 0) return 0;
  
  let tax = 0;
  let remainingIncome = income;
  let prevLimit = 0;

  for (const bracket of brackets) {
    const bracketSize = bracket.limit - prevLimit;
    
    if (remainingIncome > bracketSize) {
      tax += bracketSize * bracket.rate;
      remainingIncome -= bracketSize;
      prevLimit = bracket.limit;
    } else {
      tax += remainingIncome * bracket.rate;
      remainingIncome = 0;
      break;
    }
  }

  return tax;
}

/**
 * Tính thuế TNCN tháng
 */
export function calculateTaxMonthly(taxableIncomeMonth: number): number {
  return calculateProgressiveTax(taxableIncomeMonth, TAX_BRACKETS_MONTH);
}

/**
 * Tính thuế TNCN năm (dùng cho quyết toán)
 */
export function calculateTaxYearly(taxableIncomeYear: number): number {
  return calculateProgressiveTax(taxableIncomeYear, TAX_BRACKETS_YEAR);
}

/**
 * Tính quyết toán thuế cuối năm cho nhân viên
 * @param totalGross Tổng thu nhập (gross) 12 tháng
 * @param totalBaoHiem Tổng bảo hiểm đã đóng 12 tháng
 * @param totalTaxPaid Tổng thuế đã đóng (khấu trừ) 12 tháng
 * @param so_nguoi_phu_thuoc Số người phụ thuộc
 * @returns { tax_year_final, tax_diff, message } 
 * tax_diff > 0: Phải nộp thêm
 * tax_diff < 0: Được hoàn thuế
 */
export function calculateYearlySettlement(
  totalGross: number,
  totalBaoHiem: number,
  totalTaxPaid: number,
  so_nguoi_phu_thuoc: number = 0
) {
  const totalDeductionYear = (TAX_CONFIG.giam_tru_ban_than * 12) + (TAX_CONFIG.giam_tru_phu_thuoc * 12 * so_nguoi_phu_thuoc);
  
  const taxableIncomeYear = totalGross - totalBaoHiem - totalDeductionYear;
  
  const taxYearFinal = calculateTaxYearly(taxableIncomeYear);
  const taxDiff = taxYearFinal - totalTaxPaid;
  
  return {
    total_income_year: totalGross,
    total_insurance_year: totalBaoHiem,
    total_deduction_year: totalDeductionYear,
    taxable_income_year: taxableIncomeYear,
    tax_year_final: taxYearFinal,
    tax_paid: totalTaxPaid,
    tax_diff: taxDiff,
    message: taxDiff > 0 ? 'Phải nộp thêm' : (taxDiff < 0 ? 'Được hoàn thuế' : 'Đã nộp đủ')
  };
}
