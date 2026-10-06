const prisma = require('../db/prisma');

const EMP_ID_PREFIX = 'APIIND';
const EMP_ID_DIGITS = 6;
const EMP_ID_REGEX = new RegExp(`^${EMP_ID_PREFIX}\d{${EMP_ID_DIGITS}}$`);

// Finds the highest existing APIINDxxxxxx id and returns the next one, e.g. APIIND000071 -> APIIND000072.
// REGEXP_LIKE's 'c' flag keeps the match case-sensitive like EMP_ID_REGEX,
// despite the case-insensitive column collation.
async function nextEmpId() {
  const pattern = `^${EMP_ID_PREFIX}[0-9]{${EMP_ID_DIGITS}}$`;
  const [last] = await prisma.$queryRaw`
    SELECT empId FROM employees WHERE REGEXP_LIKE(empId, ${pattern}, 'c') ORDER BY empId DESC LIMIT 1`;
  const lastNum = last ? parseInt(last.empId.slice(EMP_ID_PREFIX.length), 10) : 0;
  return `${EMP_ID_PREFIX}${String(lastNum + 1).padStart(EMP_ID_DIGITS, '0')}`;
}

module.exports = { EMP_ID_PREFIX, EMP_ID_DIGITS, EMP_ID_REGEX, nextEmpId };
