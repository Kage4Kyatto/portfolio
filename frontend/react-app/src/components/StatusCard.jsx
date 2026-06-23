function StatusCard({ label, value }) {
  return (
    <article className="status-card">
      <h2>{label}</h2>
      <p className={`status status-${value.status}`}>{value.status.toUpperCase()}</p>
      <p className="detail">{value.detail}</p>
      {value.lastError && (
        <p className="error-detail" title={value.lastError}>
          {value.lastError}
        </p>
      )}
    </article>
  );
}

export default StatusCard;
