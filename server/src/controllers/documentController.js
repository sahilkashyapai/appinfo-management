const { prisma, shape, shapeMany, sel } = require('../db');
const writeAudit = require('../utils/audit');
const { createNotifications } = require('../services/notify');
const { sendPushToUsers } = require('../services/pushService');
const { ADMIN_ROLES, APPROVER_ROLES } = require('../utils/roles');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');
const { isOutsideScope, scopeByEmployeeRef } = require('../utils/officeScope');

const MAX_DOCUMENT_CHARS = 6 * 1024 * 1024; // ~4.5MB decoded

// Same values as the DocumentRequestType enum in schema.prisma.
const DOCUMENT_REQUEST_TYPES = ['salary_slip', 'experience_letter', 'relieving_letter', 'salary_certificate', 'form16', 'other'];
const DOCUMENT_REQUEST_STATUSES = ['pending', 'fulfilled', 'rejected'];

const REQUEST_TYPE_LABEL = {
  salary_slip: 'Salary Slip',
  experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter',
  salary_certificate: 'Salary Certificate',
  form16: 'Form 16',
  other: 'Document',
};

// The base64 payload is only ever sent by getOne — everything else omits it.
const OMIT_FILE = { fileUrl: true };
const DOC_SUMMARY = sel('Document', 'name fileName fileType');

function validateFile(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('data:')) return 'A valid file is required.';
  if (fileUrl.length > MAX_DOCUMENT_CHARS) return 'File must be under ~4.5MB.';
  return null;
}

async function notifyDocumentEvent({ recipientIds, icon, title, body, link = '/documents' }) {
  const ids = recipientIds.filter(Boolean).map(String);
  if (!ids.length) return;
  try {
    await createNotifications(ids, { icon, type: 'document', title, body, link });
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

  const target = await prisma.employee.findUnique({ where: { id: String(employeeRef) }, select: { location: true } });
  if (await isOutsideScope(req.user, target?.location)) {
    return res.json({ items: [] });
  }

  const items = await prisma.document.findMany({
    where: { employeeId: String(employeeRef) },
    omit: OMIT_FILE,
    include: { uploadedByRef: { select: sel('User', 'name') } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: shapeMany('Document', items) });
}

async function getOne(req, res) {
  const doc = await prisma.document.findUnique({
    where: { id: String(req.params.id) },
    include: { employeeRef: { select: sel('Employee', 'location') } },
  });
  if (!doc) return res.status(404).json({ message: 'Document not found.' });
  const isOwner = String(doc.employeeId) === String(req.user.employeeRef);
  if (!isOwner && !ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to view this document.' });
  }
  if (!isOwner && (await isOutsideScope(req.user, doc.employeeRef.location))) {
    return res.status(404).json({ message: 'Document not found.' });
  }
  res.json({ item: shape('Document', doc) });
}

async function upload(req, res) {
  const { employeeRef, name, category, fileName, fileType, fileUrl } = req.body;
  if (!employeeRef || !name || !String(name).trim()) return res.status(400).json({ message: 'employeeRef and name are required.' });

  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const isSelf = req.user.employeeRef && String(req.user.employeeRef) === String(employeeRef);
  if (!isAdmin && !isSelf) return res.status(403).json({ message: 'You can only upload documents for your own employee record.' });

  const fileError = validateFile(fileUrl);
  if (fileError) return res.status(400).json({ message: fileError });

  const employee = await prisma.employee.findUnique({ where: { id: String(employeeRef) } });
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  if (await isOutsideScope(req.user, employee.location)) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  const doc = await prisma.document.create({
    data: {
      employeeId: employee.id,
      name: String(name).trim(),
      category: category || 'other',
      fileName: fileName || '',
      fileType: fileType || '',
      fileUrl,
      uploadedById: String(req.user._id),
    },
    omit: OMIT_FILE,
  });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'documents',
    recordId: doc.id,
    detail: `Uploaded document "${doc.name}" for ${employee.name}`,
  });
  res.status(201).json({ item: shape('Document', doc) });
}

async function update(req, res) {
  const { name, category, fileName, fileType, fileUrl } = req.body;
  const doc = await prisma.document.findUnique({
    where: { id: String(req.params.id) },
    omit: OMIT_FILE,
    include: { employeeRef: { select: sel('Employee', 'name location') }, salarySlip: { select: { id: true } } },
  });
  if (!doc) return res.status(404).json({ message: 'Document not found.' });
  // A published salary slip is owned by Payroll: change it there (Revert to draft).
  if (doc.salarySlip) return res.status(409).json({ message: 'This is a published salary slip. HR can change it from Payroll by reverting it to draft.' });

  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const isOwner = req.user.employeeRef && String(doc.employeeId) === String(req.user.employeeRef);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: 'You do not have permission to edit this document.' });
  if (isAdmin && (await isOutsideScope(req.user, doc.employeeRef.location))) {
    return res.status(404).json({ message: 'Document not found.' });
  }

  const data = {};
  if (fileUrl) {
    const fileError = validateFile(fileUrl);
    if (fileError) return res.status(400).json({ message: fileError });
    data.fileUrl = fileUrl;
    data.fileName = fileName || '';
    data.fileType = fileType || '';
  }
  if (name && String(name).trim()) data.name = String(name).trim();
  if (category) data.category = category;

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data,
    omit: OMIT_FILE,
    include: { employeeRef: { select: sel('Employee', 'name location') } },
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'documents',
    recordId: updated.id,
    detail: `Updated document "${updated.name}" for ${updated.employeeRef?.name || 'unknown employee'}`,
  });

  res.json({ item: shape('Document', updated) });
}

async function remove(req, res) {
  const doc = await prisma.document.findUnique({
    where: { id: String(req.params.id) },
    omit: OMIT_FILE,
    include: { employeeRef: { select: sel('Employee', 'name location') }, salarySlip: { select: { id: true } } },
  });
  if (!doc) return res.status(404).json({ message: 'Document not found.' });
  // A published salary slip is owned by Payroll: change it there (Revert to draft).
  if (doc.salarySlip) return res.status(409).json({ message: 'This is a published salary slip. HR can change it from Payroll by reverting it to draft.' });

  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const isOwner = req.user.employeeRef && String(doc.employeeId) === String(req.user.employeeRef);
  if (!isAdmin && !isOwner) return res.status(403).json({ message: 'You do not have permission to delete this document.' });
  if (isAdmin && (await isOutsideScope(req.user, doc.employeeRef.location))) {
    return res.status(404).json({ message: 'Document not found.' });
  }

  await prisma.document.deleteMany({ where: { id: doc.id } });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'documents',
    recordId: doc.id,
    detail: `Deleted document "${doc.name}" for ${doc.employeeRef?.name || 'unknown employee'}`,
  });
  res.json({ message: 'Document deleted.' });
}

// --- Document requests: an employee asks HR for an issued document (payslip, letters, ...) ---

async function createRequest(req, res) {
  const { type, period, note } = req.body;
  if (!DOCUMENT_REQUEST_TYPES.includes(type)) {
    return res.status(400).json({ message: `type must be one of ${DOCUMENT_REQUEST_TYPES.join(', ')}` });
  }
  if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });

  const employee = await prisma.employee.findUnique({ where: { id: String(req.user.employeeRef) } });
  if (!employee) return res.status(404).json({ message: 'Employee record not found.' });

  const request = await prisma.documentRequest.create({
    data: { employeeId: employee.id, type, period: String(period || '').trim(), note: String(note || '').trim() },
  });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'document_requests',
    recordId: request.id,
    detail: `Requested ${REQUEST_TYPE_LABEL[type]}${period ? ` (${period})` : ''}`,
  });

  const approvers = await prisma.user.findMany({ where: { role: { in: APPROVER_ROLES } }, select: sel('User', 'managedLocation') });
  notifyDocumentEvent({
    recipientIds: approvers.filter((u) => !u.managedLocation || u.managedLocation === employee.location).map((u) => u.id),
    icon: 'fa-solid fa-file',
    title: 'New document request',
    body: `${employee.name} requested a ${REQUEST_TYPE_LABEL[type]}${period ? ` for ${period}` : ''}.`,
    link: '/documents?tab=requests',
  });

  res.status(201).json({ item: shape('DocumentRequest', request) });
}

async function myRequests(req, res) {
  if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
  const items = await prisma.documentRequest.findMany({
    where: { employeeId: String(req.user.employeeRef) },
    include: { documentRef: { select: DOC_SUMMARY } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: shapeMany('DocumentRequest', items) });
}

async function listRequests(req, res) {
  const { status } = req.query;
  const where = {};
  if (status && status !== 'all') {
    // An unknown status simply matched nothing on MongoDB; Prisma would reject it.
    if (!DOCUMENT_REQUEST_STATUSES.includes(status)) return res.json({ items: [] });
    where.status = status;
  }
  await excludeSuperadminEmployees(where, req.user.role);
  await scopeByEmployeeRef(where, req.user);
  const items = await prisma.documentRequest.findMany({
    where,
    include: {
      employeeRef: { select: sel('Employee', 'name avatarIndex dept desig') },
      documentRef: { select: DOC_SUMMARY },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: shapeMany('DocumentRequest', items) });
}

const REQUEST_EMPLOYEE = { employeeRef: { select: sel('Employee', 'name userRef location') } };

async function fulfillRequest(req, res) {
  const { fileName, fileType, fileUrl } = req.body;
  const fileError = validateFile(fileUrl);
  if (fileError) return res.status(400).json({ message: fileError });

  const request = await prisma.documentRequest.findUnique({ where: { id: String(req.params.id) }, include: REQUEST_EMPLOYEE });
  if (!request) return res.status(404).json({ message: 'Document request not found.' });
  if (await isOutsideScope(req.user, request.employeeRef.location)) {
    return res.status(404).json({ message: 'Document request not found.' });
  }
  if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been decided.' });

  const updated = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        employeeId: request.employeeId,
        name: `${REQUEST_TYPE_LABEL[request.type]}${request.period ? ` — ${request.period}` : ''}`,
        category: request.type === 'other' ? 'other' : request.type,
        fileName: fileName || '',
        fileType: fileType || '',
        fileUrl,
        uploadedById: String(req.user._id),
      },
      select: { id: true },
    });
    return tx.documentRequest.update({
      where: { id: request.id },
      data: { status: 'fulfilled', documentId: doc.id, decidedById: String(req.user._id), decidedAt: new Date() },
      include: REQUEST_EMPLOYEE,
    });
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'document_requests',
    recordId: updated.id,
    detail: `Fulfilled ${REQUEST_TYPE_LABEL[updated.type]} request for ${updated.employeeRef.name}`,
  });

  if (updated.employeeRef.userId) {
    notifyDocumentEvent({
      recipientIds: [updated.employeeRef.userId],
      icon: 'fa-solid fa-circle-check',
      title: 'Document ready',
      body: `Your ${REQUEST_TYPE_LABEL[updated.type]} request${updated.period ? ` for ${updated.period}` : ''} is ready to download.`,
      link: '/documents',
    });
  }

  res.json({ item: shape('DocumentRequest', updated) });
}

async function rejectRequest(req, res) {
  const { note } = req.body;
  const request = await prisma.documentRequest.findUnique({ where: { id: String(req.params.id) }, include: REQUEST_EMPLOYEE });
  if (!request) return res.status(404).json({ message: 'Document request not found.' });
  if (await isOutsideScope(req.user, request.employeeRef.location)) {
    return res.status(404).json({ message: 'Document request not found.' });
  }
  if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been decided.' });

  const updated = await prisma.documentRequest.update({
    where: { id: request.id },
    data: { status: 'rejected', decidedById: String(req.user._id), decisionNote: note ? String(note) : '', decidedAt: new Date() },
    include: REQUEST_EMPLOYEE,
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'document_requests',
    recordId: updated.id,
    detail: `Rejected ${REQUEST_TYPE_LABEL[updated.type]} request for ${updated.employeeRef.name}`,
  });

  if (updated.employeeRef.userId) {
    notifyDocumentEvent({
      recipientIds: [updated.employeeRef.userId],
      icon: 'fa-solid fa-circle-xmark',
      title: 'Document request rejected',
      body: `Your ${REQUEST_TYPE_LABEL[updated.type]} request was rejected.${note ? ` Note: ${note}` : ''}`,
      link: '/documents',
    });
  }

  res.json({ item: shape('DocumentRequest', updated) });
}

async function cancelRequest(req, res) {
  const request = await prisma.documentRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!request) return res.status(404).json({ message: 'Document request not found.' });
  if (String(request.employeeId) !== String(req.user.employeeRef)) {
    return res.status(403).json({ message: 'You can only cancel your own requests.' });
  }
  if (request.status !== 'pending') return res.status(400).json({ message: 'Only pending requests can be cancelled.' });

  await prisma.documentRequest.deleteMany({ where: { id: request.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'document_requests', recordId: request.id, detail: 'Cancelled document request' });
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
