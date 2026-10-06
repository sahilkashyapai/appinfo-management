const PDFDocument = require('pdfkit');

// Salary slip maths and PDF rendering. The calculation is a pure function so
// it can be tested without a database; payrollController feeds it the salary
// structure, the payroll settings (Settings.payroll) and attendance counts.
//
// Line items are { name, fullAmount?, amount, source } where source is
// 'structure' (from the employee's salary structure), 'statutory' (PF/ESI/PT,
// India offices only) or 'manual' (added by HR on the draft). Recalculating a
// draft rebuilds the first two and keeps manual lines.

const CURRENCY_LOCALE = { INR: 'en-IN', USD: 'en-US', ZAR: 'en-ZA' };
const LOP_BASES = ['calendar', 'working', 'fixed30'];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const sum = (lines) => round2(lines.reduce((t, l) => t + Number(l.amount || 0), 0));

function parsePeriod(period) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(period || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return {
    year,
    month,
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)), // exclusive
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

// The office's payroll settings for an employee location; unknown or empty
// locations fall back to the first configured office.
function officeSettings(payroll, location) {
  const offices = payroll.offices || {};
  const key = offices[location] ? location : Object.keys(offices)[0];
  return { name: key || location || '', ...(offices[key] || { currency: 'INR', companyName: '', address: '', statutory: false }) };
}

/**
 * Builds a slip's lines and totals.
 *  structure:  { earnings: [{name, amount, isBasic}], deductions: [{name, amount}], pfApplicable, esiApplicable, ptApplicable }
 *  payroll:    Settings.payroll
 *  office:     officeSettings(...) result
 *  period:     parsePeriod(...) result
 *  lopDays:    days without pay, in units of the LOP basis (already includes days before joining)
 *  basisDays:  divisor for per-day pay (days in month / working days / 30)
 *  manualLines: { earnings: [], deductions: [] } kept from an earlier draft
 */
function computeSlip({ structure, payroll, office, period, lopDays, basisDays, manualLines = { earnings: [], deductions: [] } }) {
  const lop = Math.min(Math.max(Number(lopDays) || 0, 0), basisDays);
  const factor = basisDays > 0 ? (basisDays - lop) / basisDays : 0;

  const structureEarnings = (structure.earnings || []).map((l) => ({
    name: l.name,
    fullAmount: round2(l.amount),
    amount: round2(Number(l.amount || 0) * factor),
    source: 'structure',
    ...(l.isBasic ? { isBasic: true } : {}),
  }));
  const earnings = [...structureEarnings, ...(manualLines.earnings || [])];
  const fullGross = sum(structureEarnings.map((l) => ({ amount: l.fullAmount })));
  const gross = sum(earnings);

  const deductions = [];
  if (office.statutory) {
    const { pf, esi, pt } = payroll;
    if (pf?.enabled && structure.pfApplicable) {
      const basicLine = structureEarnings.find((l) => l.isBasic) || structureEarnings.find((l) => /basic/i.test(l.name));
      if (basicLine) {
        const wage = pf.applyWageCeiling ? Math.min(basicLine.amount, Number(pf.wageCeiling) || 0) : basicLine.amount;
        const amount = Math.round((wage * Number(pf.ratePct || 0)) / 100);
        if (amount > 0) deductions.push({ name: 'Provident Fund (PF)', amount, source: 'statutory' });
      }
    }
    if (esi?.enabled && structure.esiApplicable && fullGross > 0 && fullGross <= Number(esi.grossThreshold || 0)) {
      const amount = Math.ceil((gross * Number(esi.ratePct || 0)) / 100); // ESI is rounded up to the next rupee
      if (amount > 0) deductions.push({ name: 'ESI', amount, source: 'statutory' });
    }
    if (pt?.enabled && structure.ptApplicable && fullGross * 12 > Number(pt.annualIncomeThreshold || 0)) {
      const amount = round2(pt.monthlyAmount);
      if (amount > 0) deductions.push({ name: 'Professional Tax', amount, source: 'statutory' });
    }
  }
  for (const l of structure.deductions || []) {
    if (Number(l.amount) > 0) deductions.push({ name: l.name, amount: round2(l.amount), source: 'structure' });
  }
  deductions.push(...(manualLines.deductions || []));

  return withTotals({ earnings, deductions, lopDays: lop, daysInMonth: period.daysInMonth });
}

// Totals are always derived from the lines, never trusted from the client.
function withTotals({ earnings, deductions, lopDays, daysInMonth }) {
  const grossEarnings = sum(earnings);
  const totalDeductions = sum(deductions);
  return {
    earnings,
    deductions,
    lopDays: round2(lopDays),
    paidDays: round2(Math.max(daysInMonth - lopDays, 0)),
    grossEarnings,
    totalDeductions,
    netPay: round2(grossEarnings - totalDeductions),
  };
}

// ─── Amount in words ────────────────────────────────────────────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n) {
  const words = [];
  if (n >= 100) {
    words.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    words.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    words.push(ONES[n]);
  }
  return words.join(' ');
}

// Indian grouping (lakh, crore) for INR; thousand/million/billion otherwise.
function integerWords(n, indian) {
  if (n === 0) return 'Zero';
  const parts = [];
  const scales = indian
    ? [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]
    : [[1000000000, 'Billion'], [1000000, 'Million'], [1000, 'Thousand']];
  for (const [value, label] of scales) {
    if (n >= value) {
      parts.push(`${integerWords(Math.floor(n / value), indian)} ${label}`);
      n %= value;
    }
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(' ');
}

const CURRENCY_WORDS = { INR: ['Rupees', 'Paise'], USD: ['US Dollars', 'Cents'], ZAR: ['Rand', 'Cents'] };

function amountInWords(amount, currency) {
  const value = Math.abs(round2(amount));
  const whole = Math.floor(value);
  const fraction = Math.round((value - whole) * 100);
  const [major, minor] = CURRENCY_WORDS[currency] || [currency, 'Cents'];
  let words = `${major} ${integerWords(whole, currency === 'INR')}`;
  if (fraction) words += ` and ${integerWords(fraction, false)} ${minor}`;
  return `${amount < 0 ? 'Minus ' : ''}${words} Only`;
}

function formatMoney(amount, currency) {
  const n = Number(amount || 0).toLocaleString(CURRENCY_LOCALE[currency] || 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${n}`;
}

// ─── PDF ────────────────────────────────────────────────────────────────────

function imageBuffer(dataUrl) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl || '');
  return m ? Buffer.from(m[2], 'base64') : null;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Renders a slip to a PDF Buffer (A4, one page for a typical slip).
 *  slip:     shaped SalarySlip (numbers, JSON lines, employeeInfo snapshot)
 *  company:  { name, address, phone, logoDataUrl, primaryColor, secondaryColor }
 *  footerNote
 * Any detail missing from the snapshot (older slips, empty fields) prints as "—".
 */
function renderSlipPdf(slip, { company, footerNote }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Salary Slip ${slip.period}`, Author: company.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 36;
    const W = pageW - 72;
    const C = {
      accent: /^#[0-9a-f]{6}$/i.test(company.primaryColor || '') ? company.primaryColor : '#2E86AB',
      dark: /^#[0-9a-f]{6}$/i.test(company.secondaryColor || '') ? company.secondaryColor : '#1E3A5F',
      ink: '#1f2d3d',
      muted: '#6b7a8c',
      rule: '#dbe3ea',
      soft: '#f2f6f9',
      zebra: '#f8fafc',
      white: '#ffffff',
      draft: '#b54708',
    };
    const period = parsePeriod(slip.period);
    const info = slip.employeeInfo || {};
    const locale = CURRENCY_LOCALE[slip.currency] || 'en-US';
    const num = (n) => Number(n || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cell = (n) => (Number(n) ? num(n) : '—');
    const dash = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));
    const caps = (text, x, y, opts = {}) =>
      doc.font('Helvetica-Bold').fontSize(opts.size || 7.5).fillColor(opts.color || C.muted).text(text.toUpperCase(), x, y, { characterSpacing: 0.8, lineBreak: false, ...opts });

    // ── Brand band ───────────────────────────────────────────────────────
    doc.rect(0, 0, pageW, 7).fill(C.dark);
    doc.rect(0, 7, pageW, 3).fill(C.accent);

    // ── Header: logo | PAYSLIP + month ───────────────────────────────────
    let y = 30;
    const logo = imageBuffer(company.logoDataUrl);
    if (logo) {
      try {
        doc.image(logo, left, y, { fit: [150, 44] });
      } catch {
        /* unsupported image: skip the logo */
      }
    }
    caps('Payslip', left, y + 2, { width: W, align: 'right', color: C.accent, size: 9, characterSpacing: 2 });
    doc.font('Helvetica-Bold').fontSize(17).fillColor(C.dark).text(period ? period.label : slip.period, left, y + 15, { width: W, align: 'right' });
    if (slip.status !== 'published') {
      const tag = 'DRAFT';
      doc.font('Helvetica-Bold').fontSize(8);
      const tw = doc.widthOfString(tag) + 14;
      doc.roundedRect(left + W - tw, y + 38, tw, 14, 7).fill('#fdecd8');
      doc.fillColor(C.draft).text(tag, left + W - tw, y + 41.5, { width: tw, align: 'center', characterSpacing: 1 });
    }

    // ── Company ──────────────────────────────────────────────────────────
    y = 84;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(company.name, left, y, { width: 330 });
    let cy = doc.y + 2;
    if (company.address) {
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(company.address, left, cy, { width: 330 });
      cy = doc.y + 1;
    }
    if (company.phone) {
      doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(`Tel: ${company.phone}`, left, cy, { width: 330 });
      cy = doc.y;
    }
    if (period) {
      const range = `${formatDate(period.start)} – ${formatDate(new Date(period.end - 1))}`;
      caps('Pay period', left, y + 1, { width: W, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(range, left, y + 12, { width: W, align: 'right' });
      caps('Office', left, y + 30, { width: W, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(dash(slip.office), left, y + 41, { width: W, align: 'right' });
    }
    y = Math.max(cy, y + 56) + 12;
    doc.moveTo(left, y).lineTo(left + W, y).strokeColor(C.rule).lineWidth(1).stroke();
    y += 14;

    // ── Employee details: 3 columns of label-over-value ──────────────────
    caps('Employee details', left, y, { color: C.accent, size: 8 });
    y += 14;
    const fields = [
      ['Employee Name', info.name],
      ['Employee ID', info.empId],
      ['Designation', info.desig],
      ['Department', info.dept],
      ['Date of Joining', info.joined ? formatDate(info.joined) : ''],
      ['Monthly CTC', info.monthlyCtc ? `${slip.currency} ${num(info.monthlyCtc)}` : ''],
      ['PAN', info.pan],
      ['UAN', info.uan],
      ['EPF Number', info.epfNumber],
      ['ESI Number', info.esiNumber],
      ['Bank Name', info.bankName],
      ['Account Number', info.bankAccount],
      ['IFSC Code', info.ifsc],
    ];
    const cols = 3;
    const pad = 12;
    const colW = (W - pad * 2) / cols;
    const rowH = 27;
    const rows = Math.ceil(fields.length / cols);
    let addrH = 0;
    if (info.address) {
      doc.font('Helvetica-Bold').fontSize(9.5);
      addrH = 12 + doc.heightOfString(info.address, { width: W - pad * 2 }) + 6;
    }
    const cardH = pad + rows * rowH + (info.address ? addrH : 0) + 4;
    doc.roundedRect(left, y, W, cardH, 6).fill(C.soft);
    fields.forEach(([label, value], i) => {
      const x = left + pad + (i % cols) * colW;
      const fy = y + pad + Math.floor(i / cols) * rowH;
      caps(label, x, fy, { width: colW - 8 });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(dash(value), x, fy + 10, { width: colW - 8, ellipsis: true, lineBreak: false });
    });
    if (info.address) {
      const ay = y + pad + rows * rowH;
      caps('Address', left + pad, ay);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(info.address, left + pad, ay + 10, { width: W - pad * 2 });
    }
    y += cardH + 14;

    // ── Attendance stats ─────────────────────────────────────────────────
    const stats = [
      ['Days in Month', slip.daysInMonth],
      ['Working Days', slip.workingDays],
      ['Days Worked', slip.daysWorked],
      ['Paid Leave', slip.paidLeaveDays],
      ['Paid Days', slip.paidDays],
      ['LOP Days', slip.lopDays],
    ];
    const gap = 8;
    const boxW = (W - gap * (stats.length - 1)) / stats.length;
    stats.forEach(([label, value], i) => {
      const x = left + i * (boxW + gap);
      doc.roundedRect(x, y, boxW, 40, 6).lineWidth(0.8).strokeColor(C.rule).stroke();
      const isLop = label === 'LOP Days' && Number(value) > 0;
      doc.font('Helvetica-Bold').fontSize(14).fillColor(isLop ? C.draft : C.dark).text(dash(value), x, y + 7, { width: boxW, align: 'center' });
      caps(label, x, y + 26, { width: boxW, align: 'center', size: 7 });
    });
    y += 54;

    // ── Earnings | Deductions ────────────────────────────────────────────
    const tGap = 14;
    const tW = (W - tGap) / 2;
    const hdrH = 22;
    const lineH = 19;
    const nRows = Math.max(slip.earnings.length, slip.deductions.length, 1);
    function table(x, title, lines, totalLabel, total) {
      doc.roundedRect(x, y, tW, hdrH, 4).fill(C.dark);
      doc.rect(x, y + hdrH - 4, tW, 4).fill(C.dark); // square off the bottom corners
      caps(title, x + 10, y + 8, { color: C.white, size: 8 });
      caps(`Amount (${slip.currency})`, x, y + 8, { width: tW - 10, align: 'right', color: C.white, size: 8 });
      for (let i = 0; i < nRows; i++) {
        const ry = y + hdrH + i * lineH;
        if (i % 2 === 1) doc.rect(x, ry, tW, lineH).fill(C.zebra);
        const l = lines[i];
        if (l) {
          doc.font('Helvetica').fontSize(9).fillColor(C.ink).text(l.name, x + 10, ry + 5.5, { width: tW - 120, ellipsis: true, lineBreak: false });
          doc.font('Helvetica').fontSize(9).fillColor(C.ink).text(cell(l.amount), x, ry + 5.5, { width: tW - 10, align: 'right' });
        }
      }
      const ty = y + hdrH + nRows * lineH;
      doc.rect(x, ty, tW, 24).fill(C.soft);
      doc.moveTo(x, ty).lineTo(x + tW, ty).strokeColor(C.rule).lineWidth(0.8).stroke();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.dark).text(totalLabel, x + 10, ty + 7.5);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.dark).text(num(total), x, ty + 7.5, { width: tW - 10, align: 'right' });
      doc.roundedRect(x, y, tW, hdrH + nRows * lineH + 24, 4).lineWidth(0.8).strokeColor(C.rule).stroke();
    }
    table(left, 'Earnings', slip.earnings, 'Gross Earnings', slip.grossEarnings);
    table(left + tW + tGap, 'Deductions', slip.deductions, 'Total Deductions', slip.totalDeductions);
    y += hdrH + nRows * lineH + 24 + 16;

    // ── Net pay banner ───────────────────────────────────────────────────
    const words = amountInWords(slip.netPay, slip.currency);
    doc.font('Helvetica').fontSize(8.5);
    const wordsH = doc.heightOfString(words, { width: W - 210 });
    const bannerH = Math.max(58, 30 + wordsH + 12);
    doc.roundedRect(left, y, W, bannerH, 8).fill(C.accent);
    caps('Net pay', left + 16, y + 14, { color: C.white, size: 9, characterSpacing: 1.5 });
    doc.font('Helvetica').fontSize(8.5).fillColor(C.white).text(words, left + 16, y + 29, { width: W - 210 });
    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.white).text(`${slip.currency} ${num(slip.netPay)}`, left, y + (bannerH - 20) / 2, { width: W - 16, align: 'right' });
    y += bannerH + 18;

    // ── Leave balance ────────────────────────────────────────────────────
    const balances = slip.leaveBalances;
    if (balances && typeof balances === 'object' && Object.keys(balances).length) {
      if (y > pageH - 190) { doc.addPage(); y = 50; }
      caps(`Leave balance${period ? ` (${period.year})` : ''}`, left, y, { color: C.accent, size: 8 });
      y += 13;
      const lcols = [['Leave Type', 0.4, 'left'], ['Allocated', 0.2, 'right'], ['Used', 0.2, 'right'], ['Balance', 0.2, 'right']];
      doc.rect(left, y, W, 20).fill(C.soft);
      let lx = left;
      lcols.forEach(([label, frac, align]) => {
        caps(label, lx + 10, y + 7, { width: W * frac - 20, align });
        lx += W * frac;
      });
      y += 20;
      const LABEL = { casual: 'Casual Leave', sick: 'Sick Leave', earned: 'Earned Leave' };
      // MySQL JSON doesn't keep key order, so list the known types first.
      const order = [...Object.keys(LABEL).filter((k) => k in balances), ...Object.keys(balances).filter((k) => !(k in LABEL))];
      order.map((type) => [type, balances[type]]).forEach(([type, b], i) => {
        if (i % 2 === 1) doc.rect(left, y, W, 18).fill(C.zebra);
        const vals = [LABEL[type] || type, b?.allocated, b?.used, b?.remaining];
        let vx = left;
        lcols.forEach(([, frac, align], ci) => {
          const v = ci === 0 ? vals[0] : String(Number(vals[ci] || 0));
          doc.font(ci === 3 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(C.ink).text(v, vx + 10, y + 5, { width: W * frac - 20, align });
          vx += W * frac;
        });
        y += 18;
      });
      doc.rect(left, y - 18 * Object.keys(balances).length - 20, W, 18 * Object.keys(balances).length + 20).lineWidth(0.8).strokeColor(C.rule).stroke();
      y += 16;
    }

    // ── Notes ────────────────────────────────────────────────────────────
    if (slip.notes) {
      if (y > pageH - 130) { doc.addPage(); y = 50; }
      caps('Notes', left, y, { color: C.accent, size: 8 });
      doc.font('Helvetica').fontSize(9).fillColor(C.ink).text(slip.notes, left, y + 12, { width: W });
      y = doc.y + 12;
    }

    // ── Footer ───────────────────────────────────────────────────────────
    // Drawn inside the bottom margin, so lift the margin first or pdfkit
    // would push these lines onto a new page.
    doc.page.margins.bottom = 0;
    const fy = pageH - 62;
    doc.moveTo(left, fy).lineTo(left + W, fy).strokeColor(C.rule).lineWidth(0.8).stroke();
    if (footerNote) doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted).text(footerNote, left, fy + 9, { width: W, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(`Generated on ${formatDate(new Date())} · ${company.name}`, left, fy + 22, { width: W, align: 'center', lineBreak: false });
    doc.end();
  });
}

module.exports = { LOP_BASES, parsePeriod, officeSettings, computeSlip, withTotals, amountInWords, formatMoney, renderSlipPdf, round2 };
