const EMP_ID_PREFIX = 'APIIND';
const EMP_ID_DIGITS = 6;
const EMP_ID_REGEX = new RegExp(`^${EMP_ID_PREFIX}\\d{${EMP_ID_DIGITS}}$`);

// Finds the highest existing APIINDxxxxxx id and returns the next one, e.g. APIIND000000 -> APIIND000072.
async function nextEmpId(Employee) {
  const last = await Employee.findOne({ empId: EMP_ID_REGEX }).sort({ empId: -1 });
  const lastNum = last ? parseInt(last.empId.slice(EMP_ID_PREFIX.length), 10) : 0;
  return `${EMP_ID_PREFIX}${String(lastNum + 1).padStart(EMP_ID_DIGITS, '0')}`;
}

module.exports = { EMP_ID_PREFIX, EMP_ID_DIGITS, EMP_ID_REGEX, nextEmpId };
