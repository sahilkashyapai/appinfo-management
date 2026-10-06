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
  // Unexpected 500s can carry database/internal details — keep those in the
  // server log only in production. 4xx errors keep their message.
  const hideDetails = status >= 500 && process.env.NODE_ENV === 'production';
  res.status(status).json({ message: hideDetails || !err.message ? 'Internal server error.' : err.message });
}

module.exports = { notFound, errorHandler };
