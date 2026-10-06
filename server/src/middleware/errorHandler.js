function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ message: err.message });
  }
  // Prisma (MySQL) errors — see https://www.prisma.io/docs/orm/reference/error-reference
  if (err.code === 'P2002') {
    const target = err.meta?.target;
    const field = Array.isArray(target) ? target.join(', ') : String(target || 'field').replace(/_key$/, '');
    return res.status(409).json({ message: `Duplicate value for ${field}.` });
  }
  if (err.code === 'P2025') return res.status(404).json({ message: 'Record not found.' });
  if (err.code === 'P2003') return res.status(400).json({ message: 'This record is linked to another record that does not exist or is still in use.' });
  if (err.name === 'PrismaClientValidationError') return res.status(400).json({ message: 'Invalid request data.' });
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error.' });
}

module.exports = { notFound, errorHandler };
