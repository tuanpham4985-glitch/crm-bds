/**
 * Google Apps Script API Client
 * Được sử dụng để giao tiếp với Google Sheets thông qua Apps Script Web App (không gọi trực tiếp).
 * Hỗ trợ các module HRM: Employees, Attendance, Payroll, Settings.
 */

// Đọc thông tin từ biến môi trường
// Vui lòng thêm các biến này vào file .env.local
const GAS_WEBAPP_URL = process.env.NEXT_PUBLIC_GAS_WEBAPP_URL || process.env.GAS_WEBAPP_URL || "";
const GAS_API_TOKEN = process.env.GAS_API_TOKEN || "CRM_BDS_SECURE_TOKEN_2026"; // Nên lưu trong .env

type GASResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  statusCode: number;
};

/**
 * Gửi GET Request (để đọc dữ liệu từ Sheets)
 * @param action Hành động cần thực hiện, ví dụ: 'getEmployees'
 * @param params Các tham số bổ sung (nếu có)
 */
export async function getFromGAS<T>(action: string, params: Record<string, string> = {}): Promise<GASResponse<T>> {
  if (!GAS_WEBAPP_URL) {
    throw new Error("Missing GAS_WEBAPP_URL environment variable.");
  }

  const url = new URL(GAS_WEBAPP_URL);
  url.searchParams.append('action', action);
  url.searchParams.append('token', GAS_API_TOKEN);
  
  for (const key in params) {
    url.searchParams.append(key, params[key]);
  }
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Thêm cache control tùy thuộc vào tính chất data
      // next: { revalidate: 60 } // Next.js app router feature
    });

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error(`[GAS Client GET] Error for action '${action}':`, error);
    return { statusCode: 500, error: error.message || "Unknown error occurred" };
  }
}

/**
 * Gửi POST Request (để ghi, sửa, xoá dữ liệu trên Sheets)
 * @param action Hành động, ví dụ: 'createEmployee', 'updateEmployee', 'deleteEmployee'
 * @param data Dữ liệu payload
 */
export async function postToGAS<T>(action: string, data: any = {}): Promise<GASResponse<T>> {
  if (!GAS_WEBAPP_URL) {
    throw new Error("Missing GAS_WEBAPP_URL environment variable.");
  }

  try {
    const response = await fetch(GAS_WEBAPP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // Chú ý: GAS Web app có thể bỏ qua header này nhưng fetch vẫn gửi
      },
      body: JSON.stringify({
        token: GAS_API_TOKEN,
        action: action,
        data: data
      }),
    });

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error(`[GAS Client POST] Error for action '${action}':`, error);
    return { statusCode: 500, error: error.message || "Unknown error occurred" };
  }
}

// =====================================
// EXAMPLES CÁC HÀM CRUD SỬ DỤNG GAS
// =====================================


export async function fetchPipeline() {
  return await getFromGAS('getPipeline');
}

export async function triggerSyncPipeline() {
  return await postToGAS('syncPipeline');
}

export async function fetchEmployees() {
  return await getFromGAS('getEmployees');
}

export async function addEmployee(employeeData: any) {
  return await postToGAS('createEmployee', employeeData);
}

export async function editEmployee(employeeId: string, updatedFields: any) {
  return await postToGAS('updateEmployee', {
    idColumn: "id_nhan_vien", // Khớp với tên cột Header trên Google Sheet
    idValue: employeeId,
    updateData: updatedFields
  });
}

export async function removeEmployee(employeeId: string) {
  return await postToGAS('deleteEmployee', {
    idColumn: "id_nhan_vien",
    idValue: employeeId
  });
}
