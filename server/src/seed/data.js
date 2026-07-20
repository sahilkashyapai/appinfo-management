// Static demo data ported 1:1 from the original AII_Celebrations_Platform.html mock arrays.

const DEPARTMENTS = [
  { name: 'Engineering', code: 'ENG', head: 'Rahul Sharma', icon: 'fa-solid fa-gear', color: '#2E86AB', desc: 'Product development, QA, DevOps, Architecture' },
  { name: 'Human Resources', code: 'HR', head: 'Priya Nair', icon: 'fa-solid fa-users', color: '#E74C3C', desc: 'Talent acquisition, culture, engagement' },
  { name: 'Sales', code: 'SLS', head: 'Vijay Kumar', icon: 'fa-solid fa-chart-line', color: '#27AE60', desc: 'Business development, key accounts, partnerships' },
  { name: 'Marketing', code: 'MKT', head: 'Sneha Patel', icon: 'fa-solid fa-bullhorn', color: '#E67E22', desc: 'Brand management, campaigns, digital' },
  { name: 'Finance', code: 'FIN', head: 'Lakshmi Iyer', icon: 'fa-solid fa-sack-dollar', color: '#8E44AD', desc: 'Accounting, budgeting, payroll, compliance' },
  { name: 'Operations', code: 'OPS', head: 'Rohan Das', icon: 'fa-solid fa-industry', color: '#16A085', desc: 'Facilities, supply chain, administration' },
  { name: 'IT & Infrastructure', code: 'IT', head: 'Rohit Mehta', icon: 'fa-solid fa-server', color: '#2980B9', desc: 'Systems, networking, cloud, security' },
  { name: 'Legal', code: 'LEG', head: 'Meera Joshi', icon: 'fa-solid fa-scale-balanced', color: '#D35400', desc: 'Contracts, regulatory, IP protection' },
];

// The 10 named employees from the mock, plus the 2 department heads referenced by DEPARTMENTS
// above that weren't otherwise in the employee list (Rohan Das, Meera Joshi).
// dob/joined are MM-DD pairs; the seed script attaches a birth/join year to build a real Date,
// and rewrites the very first two records' month/day to *today* so "today's birthdays" and
// "today's anniversaries" are immediately visible right after seeding, regardless of run date.
const NAMED_EMPLOYEES = [
  { empId: 'EMP001', name: 'Rahul Sharma', dept: 'Engineering', desig: 'Senior Developer', joinedYear: 2020, joinedMD: '06-11', dobYear: 1990, dobMD: '06-11', email: 'rahul.sharma@aii.in', phone: '+91 98001 11111', location: 'Bangalore', status: 'active', mgr: 'Priya Nair' },
  { empId: 'EMP002', name: 'Priya Nair', dept: 'Human Resources', desig: 'HR Manager', joinedYear: 2022, joinedMD: '03-10', dobYear: 1992, dobMD: '07-22', email: 'priya.nair@aii.in', phone: '+91 98002 22222', location: 'Mumbai', status: 'active', mgr: null },
  { empId: 'EMP003', name: 'Amit Verma', dept: 'Sales', desig: 'Sales Executive', joinedYear: 2019, joinedMD: '07-01', dobYear: 1988, dobMD: '06-11', email: 'amit.verma@aii.in', phone: '+91 98003 33333', location: 'Delhi', status: 'active', mgr: 'Vijay Kumar' },
  { empId: 'EMP004', name: 'Sneha Patel', dept: 'Marketing', desig: 'Marketing Lead', joinedYear: 2021, joinedMD: '11-20', dobYear: 1994, dobMD: '03-15', email: 'sneha.patel@aii.in', phone: '+91 98004 44444', location: 'Bangalore', status: 'active', mgr: null },
  { empId: 'EMP005', name: 'Karthik Rao', dept: 'Finance', desig: 'Finance Analyst', joinedYear: 2018, joinedMD: '04-05', dobYear: 1989, dobMD: '06-11', email: 'karthik.rao@aii.in', phone: '+91 98005 55555', location: 'Hyderabad', status: 'active', mgr: 'Lakshmi Iyer' },
  { empId: 'EMP006', name: 'Deepika Singh', dept: 'Engineering', desig: 'QA Engineer', joinedYear: 2023, joinedMD: '01-10', dobYear: 1996, dobMD: '09-30', email: 'deepika.singh@aii.in', phone: '+91 98006 66666', location: 'Bangalore', status: 'active', mgr: 'Rahul Sharma' },
  { empId: 'EMP007', name: 'Vijay Kumar', dept: 'Sales', desig: 'BD Manager', joinedYear: 2017, joinedMD: '08-12', dobYear: 1985, dobMD: '12-05', email: 'vijay.kumar@aii.in', phone: '+91 98007 77777', location: 'Mumbai', status: 'active', mgr: null },
  { empId: 'EMP008', name: 'Ananya Krishnan', dept: 'Human Resources', desig: 'Talent Acquisition', joinedYear: 2022, joinedMD: '06-01', dobYear: 1993, dobMD: '04-18', email: 'ananya.k@aii.in', phone: '+91 98008 88888', location: 'Chennai', status: 'inactive', mgr: 'Priya Nair' },
  { empId: 'EMP009', name: 'Rohit Mehta', dept: 'IT & Infrastructure', desig: 'DevOps Lead', joinedYear: 2016, joinedMD: '06-11', dobYear: 1991, dobMD: '08-25', email: 'rohit.mehta@aii.in', phone: '+91 98009 99999', location: 'Pune', status: 'active', mgr: null },
  { empId: 'EMP010', name: 'Lakshmi Iyer', dept: 'Finance', desig: 'Senior Accountant', joinedYear: 2016, joinedMD: '02-28', dobYear: 1987, dobMD: '01-14', email: 'lakshmi.iyer@aii.in', phone: '+91 98010 10101', location: 'Bangalore', status: 'active', mgr: null },
  { empId: 'EMP011', name: 'Rohan Das', dept: 'Operations', desig: 'Operations Head', joinedYear: 2015, joinedMD: '05-04', dobYear: 1984, dobMD: '11-02', email: 'rohan.das@aii.in', phone: '+91 98011 12121', location: 'Chennai', status: 'active', mgr: null },
  { empId: 'EMP012', name: 'Meera Joshi', dept: 'Legal', desig: 'Legal Head', joinedYear: 2018, joinedMD: '09-15', dobYear: 1986, dobMD: '05-27', email: 'meera.joshi@aii.in', phone: '+91 98012 21212', location: 'Delhi', status: 'active', mgr: null },
];

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
  'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Kavya', 'Riya', 'Myra', 'Anika', 'Ira', 'Navya',
  'Aryan', 'Kabir', 'Dhruv', 'Yash', 'Nikhil', 'Siddharth', 'Varun', 'Karan', 'Manish', 'Rajesh',
  'Pooja', 'Neha', 'Divya', 'Shreya', 'Priyanka', 'Swati', 'Meenal', 'Ritu', 'Sunita', 'Anjali',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Patel', 'Rao', 'Nair', 'Iyer', 'Menon', 'Reddy', 'Kumar',
  'Singh', 'Joshi', 'Mehta', 'Shah', 'Kapoor', 'Malhotra', 'Chatterjee', 'Banerjee', 'Pillai', 'Desai',
];
const LOCATIONS = ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'];
const DESIGNATIONS_BY_DEPT = {
  Engineering: ['Software Engineer', 'Senior Engineer', 'QA Engineer', 'DevOps Engineer', 'Engineering Manager'],
  'Human Resources': ['HR Executive', 'Talent Acquisition Specialist', 'HR Business Partner'],
  Sales: ['Sales Executive', 'Account Manager', 'BD Associate'],
  Marketing: ['Marketing Executive', 'Content Strategist', 'Brand Associate'],
  Finance: ['Accountant', 'Finance Analyst', 'Payroll Specialist'],
  Operations: ['Operations Executive', 'Facilities Coordinator', 'Admin Associate'],
  'IT & Infrastructure': ['Systems Administrator', 'Network Engineer', 'Cloud Engineer'],
  Legal: ['Legal Associate', 'Compliance Analyst'],
};
// Roughly mirrors the original mock's department proportions (Engineering largest, Legal smallest).
const DEPT_WEIGHTS = { Engineering: 10, Sales: 6, Marketing: 4, Operations: 4, 'IT & Infrastructure': 4, Finance: 3, 'Human Resources': 3, Legal: 2 };

const EVENTS = [
  { title: 'Diwali Celebration', type: 'festival', dayOffset: 45, venue: 'Main Hall, Bangalore', status: 'published', emoji: '🪔', color: '#F39C12', capacity: 200 },
  { title: 'Q3 Town Hall', type: 'town_hall', dayOffset: 10, venue: 'Auditorium, HQ', status: 'published', emoji: '🏛️', color: '#2E86AB', capacity: 300 },
  { title: 'Team Outing – Coorg', type: 'team_outing', dayOffset: 30, venue: 'Coorg, Karnataka', status: 'draft', emoji: '🏔️', color: '#27AE60', capacity: 80 },
  { title: 'Leadership Workshop', type: 'workshop', dayOffset: 5, venue: 'Conf Room A, HQ', status: 'published', emoji: '🎓', color: '#8E44AD', capacity: 40 },
  { title: 'Annual Sports Day', type: 'sports', dayOffset: 60, venue: 'AII Sports Ground', status: 'draft', emoji: '🏆', color: '#E67E22', capacity: 250 },
  { title: 'Birthday Bash – This Month', type: 'birthday', dayOffset: 18, venue: 'Cafeteria, Bangalore', status: 'published', emoji: '🎂', color: '#E74C3C', capacity: 100 },
];

const ANNOUNCEMENTS = [
  { priority: 'high', icon: '🚨', title: 'Mid-Year Performance Reviews – Action Required', body: 'The review cycle begins soon. All managers must complete assessments by the end of the month. Login to the HR portal.', pinned: true },
  { priority: 'medium', icon: '📋', title: 'Hybrid Work Policy Update', body: 'Hybrid policy updates to 3 days in-office per week. Review the updated policy on the intranet.', pinned: false },
  { priority: 'low', icon: '🎉', title: 'Company Picnic – Cubbon Park', body: 'Annual company picnic at Cubbon Park, Bangalore. Families welcome. Register via the Events portal.', pinned: false },
  { priority: 'medium', icon: '🛡️', title: 'Cybersecurity Training – Mandatory', body: 'All employees must complete the annual cybersecurity training. Access via the Learning Portal.', pinned: false },
];

const HOLIDAYS = [
  { name: 'Republic Day', monthDay: '01-26', type: 'National', desc: "India's Republic Day" },
  { name: 'Holi', monthDay: '03-14', type: 'Festival', desc: 'Festival of colours' },
  { name: 'Eid ul-Fitr', monthDay: '03-31', type: 'Festival', desc: 'End of Ramadan' },
  { name: 'Good Friday', monthDay: '04-18', type: 'Optional', desc: 'Christian observance' },
  { name: 'Labour Day', monthDay: '05-01', type: 'National', desc: 'International Workers Day' },
  { name: 'Independence Day', monthDay: '08-15', type: 'National', desc: "India's Independence Day" },
  { name: 'Ganesh Chaturthi', monthDay: '08-27', type: 'Festival', desc: 'Festival of Lord Ganesha' },
  { name: 'Gandhi Jayanti', monthDay: '10-02', type: 'National', desc: 'Birthday of Mahatma Gandhi' },
  { name: 'Diwali', monthDay: '10-20', type: 'Festival', desc: 'Festival of Lights' },
  { name: 'Christmas', monthDay: '12-25', type: 'National', desc: 'Birth of Jesus Christ' },
];

module.exports = {
  DEPARTMENTS,
  NAMED_EMPLOYEES,
  FIRST_NAMES,
  LAST_NAMES,
  LOCATIONS,
  DESIGNATIONS_BY_DEPT,
  DEPT_WEIGHTS,
  EVENTS,
  ANNOUNCEMENTS,
  HOLIDAYS,
};
