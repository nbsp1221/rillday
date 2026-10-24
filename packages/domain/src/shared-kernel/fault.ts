export class Fault extends Error {
  code: string;
  readonly category: 'invalid' | 'not-found' | 'conflict' | 'too-large' | 'internal';

  constructor(code: string, category: Fault['category'] = 'invalid') {
    super(code);
    this.code = code;
    this.category = category;
  }
}
