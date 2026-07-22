const Document = require('../models/Document');
const Employee = require('../models/Employee');
const writeAudit = require('../utils/audit');
const { ADMIN_ROLES } = require('../utils/roles');

const MAX_DOCUMENT_CHARS = 6 * 1024 * 1024; // ~4.5MB decoded

function validateFile(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith('data:')) return 'A valid file is required.';
  if (fileUrl.length > MAX_DOCUMENT_CHARS) return 'File must be under ~4.5MB.';
  return null;
}

async function list(req, res) {
  let employeeRef = req.query.employeeRef;
  if (!ADMIN_ROLES.includes(req.user.role)) {
    employeeRef = req.user.employeeRef;
    if (!employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
  } else if (!employeeRef) {
    return res.status(400).json({ message: 'employeeRef is required.' });
  }

  const items = await Document.find({ employeeRef })
    .select('-fileUrl')
    .populate('uploadedByRef', 'name')
    .sort({ createdAt: -1 });
  res.json({ items });
}

async function getOne(req, res) {
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found.' });
  const isOwner = String(doc.employeeRef) === String(req.user.employeeRef);
  if (!isOwner && !ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to view this document.' });
  }
  res.json({ item: doc });
}

async function upload(req, res) {
  const { employeeRef, name, category, fileName, fileType, fileUrl } = req.body;
  if (!employeeRef || !name || !name.trim()) return res.status(400).json({ message: 'employeeRef and name are required.' });
  const fileError = validateFile(fileUrl);
  if (fileError) return res.status(400).json({ message: fileError });

  const employee = await Employee.findById(employeeRef);
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });

  const doc = await Document.create({
    employeeRef,
    name: name.trim(),
    category: category || 'other',
    fileName: fileName || '',
    fileType: fileType || '',
    fileUrl,
    uploadedByRef: req.user._id,
  });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'documents',
    recordId: doc._id,
    detail: `Uploaded document "${doc.name}" for ${employee.name}`,
  });
  const { fileUrl: _omit, ...rest } = doc.toObject();
  res.status(201).json({ item: rest });
}

async function remove(req, res) {
  const doc = await Document.findByIdAndDelete(req.params.id).populate('employeeRef', 'name');
  if (!doc) return res.status(404).json({ message: 'Document not found.' });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'documents',
    recordId: doc._id,
    detail: `Deleted document "${doc.name}" for ${doc.employeeRef?.name || 'unknown employee'}`,
  });
  res.json({ message: 'Document deleted.' });
}

module.exports = { list, getOne, upload, remove };
