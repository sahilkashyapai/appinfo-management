// Canonical seniority order for Employee.roleLabel, most senior first. Mirrors
// client/src/components/EmployeeFormModal.jsx's ROLE_LABELS list — used both
// as the Employee model's roleLabel enum and to sort the directory by seniority.
const ROLE_LABEL_ORDER = [
  'President & CTO', 'COO / SVP / VP', 'Director & VP', 'Director', 'Senior Manager', 'Manager',
  'Team Lead', 'Senior Engineer', 'Engineer / Developer', 'Associate', 'Intern',
  'HR Manager / HR Head', 'HR Executive', 'Front Office Executive',
];

module.exports = { ROLE_LABEL_ORDER };
