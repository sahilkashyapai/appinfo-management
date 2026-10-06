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
 * Renders a slip to a PDF Buffer.
 *  slip:     shaped SalarySlip (numbers, JSON lines)
 *  company:  { name, address, logoDataUrl }
 *  footerNote
 */
function renderSlipPdf(slip, { company, footerNote }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Salary Slip ${slip.period}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 40;
    const width = doc.page.width - 80;
    const ink = '#1f2d3d';
    const muted = '#6b7a8c';
    const rule = '#d5dde6';
    const band = '#eef3f7';
    const period = parsePeriod(slip.period);
    const info = slip.employeeInfo || {};
    const money = (n) => formatMoney(n, slip.currency);

    // Header: logo + company
    let y = 40;
    const logo = imageBuffer(company.logoDataUrl);
    let textLeft = left;
    if (logo) {
      try {
        doc.image(logo, left, y, { fit: [110, 40] });
        textLeft = left + 124;
      } catch {
        /* unsupported image: skip the logo */
      }
    }
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(15).text(company.name, textLeft, y, { width: width - (textLeft - left) });
    if (company.address) {
      doc.font('Helvetica').fontSize(8.5).fillColor(muted).text(company.address, textLeft, doc.y + 2, { width: width - (textLeft - left) });
    }
    y = Math.max(doc.y, y + 40) + 14;

    // Title band
    doc.rect(left, y, width, 26).fill(band);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text(`Salary Slip for ${period ? period.label : slip.period}`, left + 10, y + 8);
    if (slip.status !== 'published') {
      doc.fillColor('#b54708').fontSize(10).text('DRAFT', left, y + 9, { width: width - 10, align: 'right' });
    }
    y += 38;

    // Employee details: two columns of label/value pairs
    const details = [
      ['Employee Name', info.name],
      ['Employee ID', info.empId],
      ['Designation', info.desig],
      ['Department', info.dept],
      ['Date of Joining', formatDate(info.joined)],
      ['Office', slip.office],
      ['PAN', info.pan],
      ['UAN', info.uan],
      ['Bank', info.bankName],
      ['Account No.', info.bankAccount],
      ['Days in Month', String(slip.daysInMonth)],
      ['Paid Days', String(slip.paidDays)],
      ['LOP Days', String(slip.lopDays)],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');
    const colW = width / 2;
    const rowH = 16;
    details.forEach(([label, value], i) => {
      const x = left + (i % 2) * colW;
      const ry = y + Math.floor(i / 2) * rowH;
      doc.font('Helvetica').fontSize(8.5).fillColor(muted).text(label, x, ry, { width: 95 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text(String(value), x + 95, ry, { width: colW - 105, ellipsis: true, lineBreak: false });
    });
    y += Math.ceil(details.length / 2) * rowH + 14;

    // Earnings | Deductions table
    const half = width / 2;
    const amtW = 100;
    doc.rect(left, y, width, 20).fill(band);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(9);
    doc.text('Earnings', left + 8, y + 6);
    doc.text('Amount', left + half - amtW - 8, y + 6, { width: amtW, align: 'right' });
    doc.text('Deductions', left + half + 8, y + 6);
    doc.text('Amount', left + width - amtW - 8, y + 6, { width: amtW, align: 'right' });
    y += 20;

    const rows = Math.max(slip.earnings.length, slip.deductions.length, 1);
    doc.font('Helvetica').fontSize(9).fillColor(ink);
    for (let i = 0; i < rows; i++) {
      const ry = y + i * 18 + 5;
      const e = slip.earnings[i];
      const d = slip.deductions[i];
      if (e) {
        doc.text(e.name, left + 8, ry, { width: half - amtW - 24, ellipsis: true, lineBreak: false });
        doc.text(money(e.amount), left + half - amtW - 8, ry, { width: amtW, align: 'right' });
      }
      if (d) {
        doc.text(d.name, left + half + 8, ry, { width: half - amtW - 24, ellipsis: true, lineBreak: false });
        doc.text(money(d.amount), left + width - amtW - 8, ry, { width: amtW, align: 'right' });
      }
    }
    const tableBottom = y + rows * 18 + 6;
    doc.moveTo(left + half, y - 20).lineTo(left + half, tableBottom + 22).strokeColor(rule).lineWidth(0.8).stroke();
    doc.rect(left, y - 20, width, tableBottom - y + 42).strokeColor(rule).lineWidth(0.8).stroke();
    doc.moveTo(left, tableBottom).lineTo(left + width, tableBottom).stroke();

    doc.font('Helvetica-Bold').fontSize(9).fillColor(ink);
    doc.text('Gross Earnings', left + 8, tableBottom + 7);
    doc.text(money(slip.grossEarnings), left + half - amtW - 8, tableBottom + 7, { width: amtW, align: 'right' });
    doc.text('Total Deductions', left + half + 8, tableBottom + 7);
    doc.text(money(slip.totalDeductions), left + width - amtW - 8, tableBottom + 7, { width: amtW, align: 'right' });
    y = tableBottom + 36;

    // Net pay
    doc.rect(left, y, width, 46).fill(band);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('Net Pay', left + 10, y + 9);
    doc.text(money(slip.netPay), left, y + 9, { width: width - 10, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor(muted).text(amountInWords(slip.netPay, slip.currency), left + 10, y + 28, { width: width - 20 });
    y += 60;

    if (slip.notes) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text('Notes', left, y);
      doc.font('Helvetica').fontSize(9).fillColor(ink).text(slip.notes, left, doc.y + 2, { width });
      y = doc.y + 12;
    }

    if (footerNote) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(muted).text(footerNote, left, Math.max(y, doc.page.height - 70), { width, align: 'center' });
    }
    doc.end();
  });
}

module.exports = { LOP_BASES, parsePeriod, officeSettings, computeSlip, withTotals, amountInWords, formatMoney, renderSlipPdf, round2 };
