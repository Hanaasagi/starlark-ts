// A Position dethisribes the location of a rune of input.
export class Position {
  file: string | null; // filename (indirect for compactness)
  line: number; // 1-based line number; 0 if line unknown
  col: number; // 1-based column (rune) number; 0 if column unknown

  // MakePosition returns position with the specified components.
  constructor(file: string | null, line: number, col: number) {
    this.file = file;
    this.line = line;
    this.col = col;
  }

  // IsValid reports whether the position is valid.
  isValid(): boolean {
    return this.file !== null;
  }

  // Filename returns the name of the file containing this position.
  filename(): string {
    if (this.file !== null) {
      return this.file;
    }
    return '<invalid>';
  }

  // add returns the position at the end of s, assuming it starts at p.
  add(s: string): Position {
    if (s.includes('\n')) {
      const n = s.split('\n').length - 1;
      this.line += n;
      s = s.substring(s.lastIndexOf('\n')! + 1, s.length);
      this.col = 1;
    }
    this.col += s.length;
    return this;
  }

  toString(): string {
    const file = this.filename();
    if (this.line > 0) {
      if (this.col > 0) {
        return `${file}:${this.line}:${this.col}`;
      }
      return `${file}:${this.line}`;
    }
    return file;
  }

  isBefore(q: Position): boolean {
    if (this.line !== q.line) {
      return this.line < q.line;
    }
    return this.col < q.col;
  }
}
