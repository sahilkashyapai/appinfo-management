// An employee's PAN and salary account (BankDetails). Every field is
// optional, but whatever is given must look right, so typos are caught when
// the employee enters them rather than on a salary slip.

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_REGEX = /^[0-9]{6,20}$/;
const FIELDS = ['pan', 'accountHolder', 'bankName', 'bankAccount', 'ifsc'];

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// Request body -> clean BankDetails data (only the fields present), or throws 400.
function cleanBankDetails(body = {}) {
  const data = {};
  if (body.pan !== undefined) data.pan = String(body.pan || '').trim().toUpperCase();
  if (body.accountHolder !== undefined) data.accountHolder = String(body.accountHolder || '').trim().slice(0, 191);
  if (body.bankName !== undefined) data.bankName = String(body.bankName || '').trim().slice(0, 191);
  if (body.bankAccount !== undefined) data.bankAccount = String(body.bankAccount || '').replace(/\s+/g, '');
  if (body.ifsc !== undefined) data.ifsc = String(body.ifsc || '').trim().toUpperCase();

  if (data.pan && !PAN_REGEX.test(data.pan)) throw badRequest('PAN should look like ABCDE1234F.');
  if (data.ifsc && !IFSC_REGEX.test(data.ifsc)) throw badRequest('IFSC should look like HDFC0001234 (11 characters, 5th is zero).');
  if (data.bankAccount && !ACCOUNT_REGEX.test(data.bankAccount)) throw badRequest('Account number should be 6–20 digits.');
  return data;
}

function hasAny(data) {
  return FIELDS.some((f) => data[f]);
}

function toBankDetails(row) {
  return Object.fromEntries(FIELDS.map((f) => [f, row?.[f] || '']));
}

module.exports = { PAN_REGEX, IFSC_REGEX, cleanBankDetails, hasAny, toBankDetails };
