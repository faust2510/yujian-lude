export function XMobileFormRow({ label, htmlFor, help, error, children }) {
  return (
    <div className="x-mobile-form-row">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {help ? <small>{help}</small> : null}
      {error ? <span className="x-mobile-form-error" role="alert">{error}</span> : null}
    </div>
  )
}
