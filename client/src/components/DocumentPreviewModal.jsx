export default function DocumentPreviewModal({ doc, onClose }) {
  const isImage = (doc.fileType || '').startsWith('image/');
  const isPdf = doc.fileType === 'application/pdf';

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.65)', zIndex: 970, alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(760px, 96vw)', height: 'min(88vh, 820px)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-file" /> {doc.name}</div>
          <div style={{ display: 'flex', gap: 7 }}>
            <a className="btn bs bxs" href={doc.fileUrl} download={doc.fileName || doc.name}>
              <i className="fa-solid fa-download" /> Download
            </a>
            <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: 'var(--bg3)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
          {isImage && <img src={doc.fileUrl} alt={doc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
          {isPdf && <iframe src={doc.fileUrl} title={doc.name} style={{ width: '100%', height: '100%', border: 'none' }} />}
          {!isImage && !isPdf && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--t3)' }}>
              <i className="fa-solid fa-file-circle-question" style={{ fontSize: 40, marginBottom: 10, display: 'block' }} />
              <div style={{ fontSize: 12 }}>Preview isn't available for this file type. Use Download instead.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
