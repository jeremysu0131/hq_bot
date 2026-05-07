class AppError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

function toErrorSummary(error) {
  if (!error) {
    return "Unknown error";
  }

  const code = error.code ? `[${error.code}] ` : "";
  const message = error.message || String(error);
  return `${code}${message}`;
}

module.exports = {
  AppError,
  toErrorSummary,
};
