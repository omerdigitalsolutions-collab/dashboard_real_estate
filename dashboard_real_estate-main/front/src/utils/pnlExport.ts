import * as XLSX from 'xlsx';
// @ts-ignore
import html2pdf from 'html2pdf.js';

export interface PnLReportData {
    agencyName: string;
    agencyLogo: string;
    userLogo?: string;
    dateRangeLabel: string;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    incomes: {
        agentName: string;
        propertyName: string;
        date: string;
        amount: number;
    }[];
    expenses: {
        category: string;
        description: string;
        date: string;
        amount: number;
        isRecurring: boolean;
        timesMultiplied: number;
    }[];
    expenseCategories: {
        category: string;
        total: number;
        itemsCount: number;
    }[];
}

// ─── EXCEL EXPORT ──────────────────────────────────────────────────────────

export const exportPnLToExcel = (data: PnLReportData, fileName: string) => {
    // 1. Summary Sheet
    const summaryData = [
        ['דוח רווח והפסד', ''],
        ['תקופה', data.dateRangeLabel],
        [''],
        ['סה"כ הכנסות (₪)', data.totalRevenue],
        ['סה"כ הוצאות (₪)', data.totalExpenses],
        ['רווח נקי (₪)', data.netProfit],
        ['שולי רווח (%)', `${data.profitMargin.toFixed(2)}%`],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 20 }];

    // 2. Incomes Sheet
    const incomesData = data.incomes.map(inc => ({
        'תאריך': inc.date,
        'נכס / לקוח': inc.propertyName,
        'סוכן אחראי': inc.agentName,
        'סכום (₪)': inc.amount
    }));
    const wsIncomes = XLSX.utils.json_to_sheet(incomesData);
    wsIncomes['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 15 }];

    // 3. Expenses Sheet
    const expensesData = data.expenses.map(exp => ({
        'תאריך מופע לחשבון': exp.date,
        'קטגוריה': exp.category,
        'תיאור': exp.description,
        'הוצאה קבועה?': exp.isRecurring ? 'כן' : 'לא',
        'מספר חודשים שחושבו': exp.timesMultiplied,
        'סכום מחושב סה"כ (₪)': exp.amount
    }));
    const wsExpenses = XLSX.utils.json_to_sheet(expensesData);
    wsExpenses['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 20 }];

    // 4. Create Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום הדוח');
    XLSX.utils.book_append_sheet(wb, wsIncomes, 'פירוט הכנסות');
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'פירוט הוצאות');

    // 5. Download
    XLSX.writeFile(wb, `${fileName}.xlsx`);
};

// ─── PDF EXPORT ────────────────────────────────────────────────────────────

export const exportPnLToPDF = (data: PnLReportData, fileName: string) => {
    // We create a temporary hidden DOM element to render the elegant HTML template.
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    const isPositive = data.netProfit >= 0;
    const profitColor = isPositive ? 'color: #059669;' : 'color: #e11d48;';
    const profitBg = isPositive ? 'background: #d1fae5;' : 'background: #ffe4e6;';

    const renderTableRows = (items: any[], type: 'income' | 'expense') => {
        if (items.length === 0) return `<tr><td colspan="4" style="text-align: center; padding: 10px; color: #6b7280;">אין נתונים</td></tr>`;

        return items.map(item => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; font-weight: 600; color: #111827;">${type === 'income' ? item.propertyName : item.description}</td>
                <td style="padding: 10px; color: #4b5563;">${type === 'income' ? item.agentName : item.category}</td>
                <td style="padding: 10px; color: #6b7280;">${item.date}</td>
                <td style="padding: 10px; font-weight: bold; text-align: left; direction: ltr;">₪${item.amount.toLocaleString()}</td>
            </tr>
        `).join('');
    };

    container.innerHTML = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; padding: 40px; background: #ffffff; color: #111827; width: 800px;">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f3f4f6; padding-bottom: 25px; margin-bottom: 35px;">
                <div>
                    <h1 style="margin: 0; font-size: 32px; font-weight: 800; color: #020617; letter-spacing: -0.5px;">דוח רווח והפסד</h1>
                    <p style="margin: 8px 0 0 0; color: #64748b; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                        <span>תקופה:</span>
                        <span style="font-weight: 700; color: #0f172a; background: #f1f5f9; padding: 2px 10px; border-radius: 6px;">${data.dateRangeLabel}</span>
                    </p>
                </div>
                <div style="text-align: left; display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        ${data.userLogo ? `<img src="${data.userLogo}" style="height: 55px; width: 55px; border-radius: 50%; object-fit: cover; border: 2px solid #f1f5f9;" />` : ''}
                        ${data.agencyLogo ? `<img src="${data.agencyLogo}" style="max-height: 55px; max-width: 140px; object-fit: contain;" />` : ''}
                    </div>
                    ${data.agencyName ? `
                    <div style="margin-top: 4px;">
                        <p style="margin: 0; font-size: 16px; font-weight: 800; color: #1e293b;">${data.agencyName}</p>
                    </div>` : ''}
                </div>
            </div>

            <!-- Summary KPI Cards -->
            <div style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 40px;">
                <div style="flex: 1; padding: 20px; background: #f3f4f6; border-radius: 12px;">
                    <p style="margin: 0 0 5px 0; font-size: 14px; color: #6b7280;">סה"כ הכנסות</p>
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #059669; text-align: left; direction: ltr;">₪${data.totalRevenue.toLocaleString()}</p>
                </div>
                <div style="flex: 1; padding: 20px; background: #f3f4f6; border-radius: 12px;">
                    <p style="margin: 0 0 5px 0; font-size: 14px; color: #6b7280;">סה"כ הוצאות</p>
                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #e11d48; text-align: left; direction: ltr;">₪${data.totalExpenses.toLocaleString()}</p>
                </div>
                <div className="flex: 1; padding: 20px; border-radius: 12px; ${profitBg}">
                    <p style="margin: 0 0 5px 0; font-size: 14px; color: #6b7280;">
                        ${isPositive ? 'רווח נקי' : 'הפסד'} (${Math.abs(data.profitMargin).toFixed(1)}%)
                    </p>
                    <p style="margin: 0; font-size: 24px; font-weight: bold; text-align: left; direction: ltr; ${profitColor}">₪${Math.abs(data.netProfit).toLocaleString()}</p>
                </div>
            </div>

            <!-- Incomes List -->
            <div style="margin-bottom: 40px;">
                <h3 style="margin: 0 0 15px 0; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">פעילות הכנסות (עסקאות סגורות)</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f9fafb; text-align: right;">
                            <th style="padding: 10px; color: #6b7280;">נכס / לקוח</th>
                            <th style="padding: 10px; color: #6b7280;">סוכן</th>
                            <th style="padding: 10px; color: #6b7280;">תאריך</th>
                            <th style="padding: 10px; color: #6b7280; text-align: left;">סכום</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderTableRows(data.incomes, 'income')}
                    </tbody>
                </table>
            </div>

            <!-- Expenses List -->
            <div style="margin-bottom: 40px;">
                <h3 style="margin: 0 0 15px 0; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">פעילות הוצאות</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f9fafb; text-align: right;">
                            <th style="padding: 10px; color: #6b7280;">תיאור</th>
                            <th style="padding: 10px; color: #6b7280;">קטגוריה</th>
                            <th style="padding: 10px; color: #6b7280;">תאריך/קבוע</th>
                            <th style="padding: 10px; color: #6b7280; text-align: left;">סכום מחושב</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderTableRows(data.expenses, 'expense')}
                    </tbody>
                </table>
            </div>

            <!-- Footer -->
            <div style="margin-top: 50px; text-align: center; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                <p>הופק אוטומטית באמצעות מערכת <strong>hOMER Real Estate OS</strong></p>
                <p>תאריך הפקה: ${new Date().toLocaleString('he-IL')}</p>
            </div>
        </div>
    `;

    // html2pdf options
    const opt = {
        margin: 0,
        filename: `${fileName}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
    };

    html2pdf().from(container.firstElementChild as HTMLElement).set(opt).save().then(() => {
        // Cleanup DOM after generation
        document.body.removeChild(container);
    }).catch((err: any) => {
        console.error('PDF Generation Error:', err);
        document.body.removeChild(container);
    });
};
