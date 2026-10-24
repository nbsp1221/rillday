export class HttpFault extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400, options?: ErrorOptions) {
    super(code, options);
    this.code = code;
    this.status = status;
  }
}
