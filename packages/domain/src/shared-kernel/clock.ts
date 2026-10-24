export interface DomainContext {
  now(this: void): string;
  newId(this: void): string;
}
