const Document = require('../models/Document');
const DocumentRequest = require('../models/DocumentRequest');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');
const writeAudit = require('../utils/audit');
const { sendPushToUsers } = require('../services/pushService');
const { ADMIN_ROLES, APPROVER_ROLES } = require('../utils/roles');
const { superadminEmployeeIds, excludeSuperadminEmployees } = require('../utils/hideSuperadmin');

const MAX_DOCUMENT_CHARS = 6 * 1024 * 1024; // ~4.5MB decoded

const REQUEST_TYPE_LABEL = {
  salary_slip: 'Salary Slip',
  experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter',
  salary_certificate: 'Salary Certificate',
  form16: 'Form 16',
  other: 'Document',
};

function validateFile(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith('data:')) return 'A valid file is required.';
  if (fileUrl.length > MAX_DOCUMENT_CHARS) return 'File must be under ~4.5MB.';
  return null;
}

async function notifyDocumentEvent({ recipientIds, icon, title, body, link = '/documents' }) {
  const ids = recipientIds.filter(Boolean).map(String);
  if (!ids.length) return;
  try {
    await Promise.all(ids.map((id) => Notification.create({ recipientRef: id, icon, type: 'document', title, body, link })));
  } catch (err) {
    console.error('[documents] failed to create notification:', err.message);
  }
  sendPushToUsers(ids, { title, body, url: link }).catch((err) => console.error('[documents] push failed:', err.message));
}

async function list(req, res) {
  let employeeRef = req.query.employeeRef;
  if (!ADMIN_ROLES.includes(req.user.role)) {
    employeeRef = req.user.employeeRef;
    if (!employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
  } else if (!employeeRef) {
    return res.status(400).json({ message: 'employeeRef is required.' });
  }

  if (req.user.role !== 'superadmin') {
    const ids = await superadminEmployeeIds();
    if (ids.some((id) => String(id) === String(employeeRef))) return res.json({ items: [] });
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

  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const isSelf = req.user.employeeRef && String(req.user.employeeRef) === String(employeeRef);
  if (!isAdmin && !isSelf) return res.status(403).json({ message: 'You can only upload documents for your own employee record.' });

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

async function update(req, res) {
  const { name, category, fileName, fileType, fileUrl } = req.body;
  const doc = await Document.findById(req.params.id).populate('employeeRef', 'name');
  if (!doc) return res.status(404).json({ message: 'Document not found.' });

  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const isOwnUpload =
    req.user.employeeRef && String(doc.employeeRef._id) === String(req.user.employeeRef) && String(doc.uploadedByRef) === String(req.user._id);
  if (!isAdmin && !isOwnUpload) return res.status(403).json({ message: 'You do not have permission to edit this document.' });

  if (fileUrl) {
    const fileError = validateFile(fileUrl);
    if (fileError) return res.status(400).json({ message: fileError });
    doc.fileUrl = fileUrl;
    doc.fileName = fileName || '';
    doc.fileType = fileType || '';
  }
  if (name && name.trim()) doc.name = name.trim();
  if (category) doc.category = category;
  await doc.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'documents',
    recordId: doc._id,
    detail: `Updated document "${doc.name}" for ${doc.employeeRef?.name || 'unknown employee'}`,
  });

  const { fileUrl: _omit, ...rest } = doc.toObject();
  res.json({ item: rest });
}

async function remove(req, res) {
  const doc = await Document.findById(req.params.id).populate('employeeRef', 'name');
  if (!doc) return res.status(404).json({ message: 'Document not found.' });

  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const isOwnUpload =
    req.user.employeeRef && String(doc.employeeRef._id) === String(req.user.employeeRef) && String(doc.uploadedByRef) === String(req.user._id);
  if (!isAdmin && !isOwnUpload) return res.status(403).json({ message: 'You do not have permission to delete this document.' });

  await doc.deleteOne();
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

// --- Document requests: an employee asks HR for an issued document (payslip, letters, ...) ---

async function createRequest(req, res) {
  const { type, period, note } = req.body;
  if (!DocumentRequest.DOCUMENT_REQUEST_TYPES.includes(type)) {
    return res.status(400).json({ message: `type must be one of ${DocumentRequest.DOCUMENT_REQUEST_TYPES.join(', ')}` });
  }
  if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });

  const employee = await Employee.findById(req.user.employeeRef);
  if (!employee) return res.status(404).json({ message: 'Employee record not found.' });

  const request = await DocumentRequest.create({ employeeRef: employee._id, type, period: period || '', note: note || '' });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'document_requests',
    recordId: request._id,
    detail: `Requested ${REQUEST_TYPE_LABEL[type]}${period ? ` (${period})` : ''}`,
  });

  const approvers = await User.find({ role: { $in: APPROVER_ROLES } }, '_id');
  notifyDocumentEvent({
    recipientIds: approvers.map((u) => u._id),
    icon: '📄',
    title: 'New document request',
    body: `${employee.name} requested a ${REQUEST_TYPE_LABEL[type]}${period ? ` for ${period}` : ''}.`,
    link: '/documents?tab=requests',
  });

  res.status(201).json({ item: request });
}

async function myRequests(req, res) {
  if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
  const items = await DocumentRequest.find({ employeeRef: req.user.employeeRef })
    .populate('documentRef', 'name fileName fileType')
    .sort({ createdAt: -1 });
  res.json({ items });
}

async function listRequests(req, res) {
  const { status } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  await excludeSuperadminEmployees(filter, req.user.role);
  const items = await DocumentRequest.find(filter)
    .populate('employeeRef', 'name avatarIndex dept desig')
    .populate('documentRef', 'name fileName fileType')
    .sort({ createdAt: -1 });
  res.json({ items });
}

async function fulfillRequest(req, res) {
  const { fileName, fileType, fileUrl } = req.body;
  const fileError = validateFile(fileUrl);
  if (fileError) return res.status(400).json({ message: fileError });

  const request = await DocumentRequest.findById(req.params.id).populate('employeeRef', 'name userRef');
  if (!request) return res.status(404).json({ message: 'Document request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been decided.' });

  const doc = await Document.create({
    employeeRef: request.employeeRef._id,
    name: `${REQUEST_TYPE_LABEL[request.type]}${request.period ? ` — ${request.period}` : ''}`,
    category: request.type === 'other' ? 'other' : request.type,
    fileName: fileName || '',
    fileType: fileType || '',
    fileUrl,
    uploadedByRef: req.user._id,
  });

  request.status = 'fulfilled';
  request.documentRef = doc._id;
  request.decidedByRef = req.user._id;
  request.decidedAt = new Date();
  await request.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'document_requests',
    recordId: request._id,
    detail: `Fulfilled ${REQUEST_TYPE_LABEL[request.type]} request for ${request.employeeRef.name}`,
  });

  if (request.employeeRef.userRef) {
    notifyDocumentEvent({
      recipientIds: [request.employeeRef.userRef],
      icon: '✅',
      title: 'Document ready',
      body: `Your ${REQUEST_TYPE_LABEL[request.type]} request${request.period ? ` for ${request.period}` : ''} is ready to download.`,
      link: '/documents',
    });
  }

  res.json({ item: request });
}

async function rejectRequest(req, res) {
  const { note } = req.body;
  const request = await DocumentRequest.findById(req.params.id).populate('employeeRef', 'name userRef');
  if (!request) return res.status(404).json({ message: 'Document request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been decided.' });

  request.status = 'rejected';
  request.decidedByRef = req.user._id;
  request.decisionNote = note || '';
  request.decidedAt = new Date();
  await request.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'document_requests',
    recordId: request._id,
    detail: `Rejected ${REQUEST_TYPE_LABEL[request.type]} request for ${request.employeeRef.name}`,
  });

  if (request.employeeRef.userRef) {
    notifyDocumentEvent({
      recipientIds: [request.employeeRef.userRef],
      icon: '❌',
      title: 'Document request rejected',
      body: `Your ${REQUEST_TYPE_LABEL[request.type]} request was rejected.${note ? ` Note: ${note}` : ''}`,
      link: '/documents',
    });
  }

  res.json({ item: request });
}

async function cancelRequest(req, res) {
  const request = await DocumentRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Document request not found.' });
  if (String(request.employeeRef) !== String(req.user.employeeRef)) {
    return res.status(403).json({ message: 'You can only cancel your own requests.' });
  }
  if (request.status !== 'pending') return res.status(400).json({ message: 'Only pending requests can be cancelled.' });

  await request.deleteOne();
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'document_requests', recordId: request._id, detail: 'Cancelled document request' });
  res.json({ message: 'Document request cancelled.' });
}

module.exports = {
  list,
  getOne,
  upload,
  update,
  remove,
  createRequest,
  myRequests,
  listRequests,
  fulfillRequest,
  rejectRequest,
  cancelRequest,
};
