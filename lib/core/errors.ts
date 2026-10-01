export class CommandError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export class NoRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoRetryError";
  }
}
