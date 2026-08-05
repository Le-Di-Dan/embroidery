/**
 * The lexical half of the package-owned path parser (`IMP-D047` PO-10).
 *
 * A scanner rather than a token stream, because SVG path data cannot be
 * tokenized without knowing what is being parsed. `a1 1 0 011 1` is a legal arc
 * whose two flags are single digits glued to the next number, so "read a number"
 * and "read a flag" are different lexical operations and only the grammar knows
 * which one is due. A generic tokenizer would read `011` as one number and the
 * arc would be silently wrong — which is exactly why PO-10 forbids a permissive
 * character regex and requires a real parser.
 *
 * Every method advances only on success and reports failure by returning
 * `undefined`, so the parser can never consume input it did not understand.
 */

const WSP = new Set([' ', '\t', '\n', '\r', '\f']);

const DIGITS = new Set([...'0123456789']);

export class PathScanner {
  private index = 0;

  constructor(private readonly text: string) {}

  get position(): number {
    return this.index;
  }

  atEnd(): boolean {
    return this.index >= this.text.length;
  }

  /** Consumes SVG whitespace only — never a comma, which is a list separator. */
  skipWhitespace(): void {
    while (this.index < this.text.length && WSP.has(this.text[this.index] as string)) {
      this.index += 1;
    }
  }

  /**
   * Consumes the optional separator between two arguments.
   *
   * At most one comma, exactly as the grammar allows: `1,,2` leaves the second
   * comma in place, where the number reader rejects it.
   */
  skipCommaWhitespace(): void {
    this.skipWhitespace();
    if (this.text[this.index] === ',') {
      this.index += 1;
      this.skipWhitespace();
    }
  }

  /** Reads one command letter, or `undefined` when the next character is not one. */
  readCommand(): string | undefined {
    const char = this.text[this.index];
    if (char === undefined || !/^[A-Za-z]$/.test(char)) return undefined;
    this.index += 1;
    return char;
  }

  /** True when a number could start here — the test that ends an implicit group. */
  startsNumber(): boolean {
    const char = this.text[this.index];
    if (char === undefined) return false;
    if (DIGITS.has(char)) return true;
    if (char !== '+' && char !== '-' && char !== '.') return false;
    // A sign or a dot alone is not a number; the next character has to continue it.
    const next = this.text[this.index + 1];
    if (next === undefined) return false;
    if (DIGITS.has(next)) return true;
    return (
      (char === '+' || char === '-') && next === '.' && DIGITS.has(this.text[this.index + 2] ?? '')
    );
  }

  /**
   * Reads one number, or `undefined` when the text at this position is not one.
   *
   * Written as an explicit scan rather than a regex match so the scanner's
   * position is advanced by exactly the characters that formed the number —
   * a regex that matched more than it consumed is how trailing garbage survives.
   */
  readNumber(): number | undefined {
    const start = this.index;
    const char = this.text[this.index];
    if (char === '+' || char === '-') this.index += 1;

    const integerDigits = this.consumeDigits();
    let fractionDigits = 0;
    if (this.text[this.index] === '.') {
      this.index += 1;
      fractionDigits = this.consumeDigits();
    }
    if (integerDigits === 0 && fractionDigits === 0) {
      this.index = start;
      return undefined;
    }

    if (!this.consumeExponent()) {
      this.index = start;
      return undefined;
    }

    const value = Number(this.text.slice(start, this.index));
    if (!Number.isFinite(value)) {
      this.index = start;
      return undefined;
    }
    return value;
  }

  /**
   * Reads one arc flag, which is exactly the character `0` or `1`.
   *
   * Never `readNumber`: `01` is a legal pair of flags and an illegal single
   * flag, and only a reader that consumes one character can tell them apart.
   */
  readFlag(): number | undefined {
    const char = this.text[this.index];
    if (char !== '0' && char !== '1') return undefined;
    this.index += 1;
    return char === '0' ? 0 : 1;
  }

  private consumeDigits(): number {
    const start = this.index;
    while (this.index < this.text.length && DIGITS.has(this.text[this.index] as string)) {
      this.index += 1;
    }
    return this.index - start;
  }

  /** Consumes a well-formed exponent, or none at all. A truncated one fails. */
  private consumeExponent(): boolean {
    const char = this.text[this.index];
    if (char !== 'e' && char !== 'E') return true;
    const mark = this.index;
    this.index += 1;
    const sign = this.text[this.index];
    if (sign === '+' || sign === '-') this.index += 1;
    if (this.consumeDigits() === 0) {
      this.index = mark;
      return false;
    }
    return true;
  }
}
