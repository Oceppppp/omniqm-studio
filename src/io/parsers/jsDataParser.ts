/**
 * Safe, zero-eval tokenizer & recursive-descent JavaScript/JSON5 data extractor.
 * Accepts ANY .js/.mjs/.cjs/.json filename and ANY standard JS export pattern:
 * - export default ...
 * - export const / let / var name = ... (including multiple named exports)
 * - module.exports = ... / module.exports.x = ... / exports.x = ...
 * - window.x = ... / globalThis.x = ...
 * - bare object/array literal, NDJSON, wrapped arrow/function bodies, JSONP callbacks
 * - embedded multi-line CSV/TSV strings
 */

type TokenKind = 'ident' | 'num' | 'str' | 'tmpl' | 'punct' | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
}

const MAX_TOKENS = 200_000;

function stripCommentsAndShebang(source: string): string {
  const clean = source.replace(/^\uFEFF/, '').replace(/^#![^\n]*\n/, '');
  let out = '';
  let i = 0;
  let quote: '"' | "'" | '`' | null = null;

  while (i < clean.length) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (quote) {
      if (ch === '\\' && i + 1 < clean.length) {
        out += ch + clean[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < clean.length && clean[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < clean.length && !(clean[i] === '*' && clean[i + 1] === '/')) i += 1;
      i += 2;
      out += ' ';
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

function unescapeStringContent(raw: string): string {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrtbfv\\'"`0])/g, (_, esc: string) => {
    if (esc === 'n') return '\n';
    if (esc === 'r') return '\r';
    if (esc === 't') return '\t';
    if (esc === 'b') return '\b';
    if (esc === 'f') return '\f';
    if (esc === 'v') return '\v';
    if (esc === '0') return '\0';
    if (esc.startsWith('u{')) {
      return String.fromCodePoint(parseInt(esc.slice(2, -1), 16));
    }
    if (esc.startsWith('u') || esc.startsWith('x')) {
      return String.fromCharCode(parseInt(esc.slice(1), 16));
    }
    return esc;
  });
}

function tokenizeJs(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length && tokens.length < MAX_TOKENS) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // Multi-char punctuators
    const two = input.slice(i, i + 2);
    const three = input.slice(i, i + 3);
    if (three === '...') {
      tokens.push({ kind: 'punct', value: '...' });
      i += 3;
      continue;
    }
    if (two === '=>') {
      tokens.push({ kind: 'punct', value: '=>' });
      i += 2;
      continue;
    }

    // String or template literal
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      i += 1;
      let raw = '';
      while (i < input.length && input[i] !== q) {
        if (input[i] === '\\' && i + 1 < input.length) {
          raw += input[i] + input[i + 1];
          i += 2;
        } else {
          raw += input[i];
          i += 1;
        }
      }
      if (input[i] === q) i += 1;
      tokens.push({
        kind: q === '`' ? 'tmpl' : 'str',
        value: unescapeStringContent(raw),
      });
      continue;
    }

    // Numbers (including .5 leading dot, hex 0x, binary 0b, octal 0o, underscores, exp)
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(input[i + 1] ?? ''))) {
      let raw = '';
      if (ch === '0' && /[xXbBoO]/.test(input[i + 1] ?? '')) {
        raw += ch + input[i + 1];
        i += 2;
        while (i < input.length && /[0-9a-fA-F_]/.test(input[i])) {
          raw += input[i];
          i += 1;
        }
      } else {
        while (i < input.length && /[\d_]/.test(input[i])) {
          raw += input[i];
          i += 1;
        }
        if (input[i] === '.') {
          raw += '.';
          i += 1;
          while (i < input.length && /[\d_]/.test(input[i])) {
            raw += input[i];
            i += 1;
          }
        }
        if (input[i] === 'e' || input[i] === 'E') {
          raw += input[i];
          i += 1;
          if (input[i] === '+' || input[i] === '-') {
            raw += input[i];
            i += 1;
          }
          while (i < input.length && /[\d_]/.test(input[i])) {
            raw += input[i];
            i += 1;
          }
        }
      }
      if (input[i] === 'n') i += 1; // BigInt suffix
      tokens.push({ kind: 'num', value: raw.replace(/_/g, '') });
      continue;
    }

    // Identifiers & keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_$]/.test(input[i])) {
        ident += input[i];
        i += 1;
      }
      tokens.push({ kind: 'ident', value: ident });
      continue;
    }

    // Single char punctuator
    if ('{}[]():,;.=+-*/'.includes(ch)) {
      tokens.push({ kind: 'punct', value: ch });
      i += 1;
      continue;
    }

    // Skip unrecognized chars cleanly (e.g. regex / flags / stray tokens)
    i += 1;
  }

  tokens.push({ kind: 'eof', value: '' });
  return tokens;
}

class JsExpressionParser {
  private tokens: Token[];
  private pos = 0;
  private scope: Map<string, unknown>;

  constructor(tokens: Token[], scope: Map<string, unknown>) {
    this.tokens = tokens;
    this.scope = scope;
  }

  peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? { kind: 'eof', value: '' };
  }

  next(): Token {
    const t = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos += 1;
    return t;
  }

  matchPunct(val: string): boolean {
    const t = this.peek();
    if (t.kind === 'punct' && t.value === val) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  matchIdent(val: string): boolean {
    const t = this.peek();
    if (t.kind === 'ident' && t.value === val) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  skipBalanced(openChar: string, closeChar: string): void {
    if (!this.matchPunct(openChar)) return;
    let depth = 1;
    while (depth > 0 && this.peek().kind !== 'eof') {
      const t = this.next();
      if (t.kind === 'punct' && t.value === openChar) depth += 1;
      else if (t.kind === 'punct' && t.value === closeChar) depth -= 1;
    }
  }

  private resolveTemplate(raw: string): string {
    return raw.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
      const name = expr.trim();
      if (this.scope.has(name)) {
        const val = this.scope.get(name);
        return val === undefined || val === null ? '' : String(val);
      }
      return '';
    });
  }

  parseExpression(): unknown {
    let left = this.parseMultiplicative();
    while (this.peek().kind === 'punct' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      if (op === '+' && (typeof left === 'string' || typeof right === 'string')) {
        left = String(left ?? '') + String(right ?? '');
      } else {
        const lNum = Number(left);
        const rNum = Number(right);
        left = op === '+' ? lNum + rNum : lNum - rNum;
      }
    }
    // Skip optional TypeScript `as const` or `satisfies Type`
    while (
      (this.peek().kind === 'ident' && (this.peek().value === 'as' || this.peek().value === 'satisfies'))
    ) {
      this.next();
      while (this.peek().kind !== 'eof' && this.peek().kind !== 'punct') {
        this.next();
      }
      if (this.peek().value === '[') this.skipBalanced('[', ']');
    }
    return left;
  }

  private parseMultiplicative(): unknown {
    let left = this.parseUnary();
    while (this.peek().kind === 'punct' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.next().value;
      const right = this.parseUnary();
      const lNum = Number(left);
      const rNum = Number(right);
      left = op === '*' ? lNum * rNum : rNum !== 0 ? lNum / rNum : 0;
    }
    return left;
  }

  private parseUnary(): unknown {
    if (this.matchPunct('-')) {
      return -Number(this.parseUnary());
    }
    if (this.matchPunct('+')) {
      return Number(this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    const t = this.peek();

    if (t.kind === 'num') {
      this.next();
      return Number(t.value);
    }

    if (t.kind === 'str') {
      this.next();
      return t.value;
    }

    if (t.kind === 'tmpl') {
      this.next();
      return this.resolveTemplate(t.value);
    }

    if (t.kind === 'punct' && t.value === '{') {
      return this.parseObject();
    }

    if (t.kind === 'punct' && t.value === '[') {
      return this.parseArray();
    }

    // Parenthesized expression, IIFE, or arrow function `() => ...`
    if (t.kind === 'punct' && t.value === '(') {
      // Check if arrow function parameter list `(...) =>`
      const saved = this.pos;
      this.skipBalanced('(', ')');
      if (this.matchPunct('=>')) {
        return this.parseFunctionBodyResult();
      }
      // Rewind and parse parenthesized value or function return
      this.pos = saved;
      this.next(); // '('
      // Support IIFE `(function() { return ...; })()` or `(async function() { ... })()` or UMD
      if (
        this.peek().kind === 'ident' &&
        (this.peek().value === 'function' ||
          (this.peek().value === 'async' && this.peek(1).value === 'function'))
      ) {
        if (this.peek().value === 'async') this.next();
        const res = this.parseFunctionExprResult();
        this.matchPunct(')');
        if (this.peek().value === '(') {
          const iifeArgs = this.parseCallArgs();
          if (res === undefined && iifeArgs.length > 0) {
            const richArg = iifeArgs.find(
              (a) => a !== null && (typeof a === 'object' || (typeof a === 'string' && a.includes('\n'))),
            );
            if (richArg !== undefined) return richArg;
          }
        }
        return res;
      }
      const val = this.parseExpression();
      this.matchPunct(')');
      if (this.peek().value === '(') {
        const trailingArgs = this.parseCallArgs();
        if (val === undefined && trailingArgs.length > 0) {
          const richArg = trailingArgs.find(
            (a) => a !== null && (typeof a === 'object' || (typeof a === 'string' && a.includes('\n'))),
          );
          if (richArg !== undefined) return richArg;
        }
      }
      return val;
    }

    if (t.kind === 'ident') {
      this.next();
      const ident = t.value;

      if (ident === 'true') return true;
      if (ident === 'false') return false;
      if (ident === 'null' || ident === 'undefined') return undefined;
      if (ident === 'NaN') return Number.NaN;
      if (ident === 'Infinity') return Infinity;

      // Single-arg arrow `x => ...` or `async () => ...`
      if (this.matchPunct('=>')) {
        return this.parseFunctionBodyResult();
      }

      if (ident === 'async' || ident === 'function') {
        if (ident === 'async' && this.matchIdent('function')) {
          return this.parseFunctionExprResult();
        }
        if (ident === 'function') {
          this.pos -= 1;
          return this.parseFunctionExprResult();
        }
        if (this.peek().value === '(') this.skipBalanced('(', ')');
        if (this.matchPunct('=>')) return this.parseFunctionBodyResult();
      }

      if (ident === 'new') {
        const cls = this.next();
        if (cls.kind === 'ident' && cls.value === 'Date') {
          if (this.matchPunct('(')) {
            const arg = this.peek().value !== ')' ? this.parseExpression() : '';
            this.matchPunct(')');
            return typeof arg === 'string' || typeof arg === 'number' ? String(arg) : '';
          }
        }
        if (this.peek().value === '(') this.skipBalanced('(', ')');
        return undefined;
      }

      // Member chains & function/JSONP/define calls
      let resolved: unknown = this.scope.has(ident) ? this.scope.get(ident) : undefined;
      while (true) {
        if (this.matchPunct('.')) {
          const prop = this.next();
          if (prop.value === 'freeze' && this.matchPunct('(')) {
            const inner = this.parseExpression();
            this.matchPunct(')');
            return inner;
          }
          if (ident === 'JSON' && prop.value === 'parse' && this.matchPunct('(')) {
            const strArg = this.parseExpression();
            while (this.matchPunct(',')) this.parseExpression();
            this.matchPunct(')');
            if (typeof strArg === 'string') {
              try {
                return JSON.parse(strArg) as unknown;
              } catch {
                return undefined;
              }
            }
            return undefined;
          }
          if (resolved && typeof resolved === 'object' && prop.value in (resolved as Record<string, unknown>)) {
            resolved = (resolved as Record<string, unknown>)[prop.value];
          } else {
            resolved = undefined;
          }
          continue;
        }
        if (this.matchPunct('[')) {
          const idxVal = this.parseExpression();
          this.matchPunct(']');
          if (Array.isArray(resolved) && typeof idxVal === 'number') {
            resolved = resolved[idxVal];
          } else if (resolved && typeof resolved === 'object' && typeof idxVal === 'string') {
            resolved = (resolved as Record<string, unknown>)[idxVal];
          } else {
            resolved = undefined;
          }
          continue;
        }
        // JSONP / define / helper call `callback(data)` or `define(['dep'], () => data)`
        if (this.peek().value === '(') {
          const callArgs = this.parseCallArgs();
          if (resolved === undefined && callArgs.length > 0) {
            const richArg = callArgs.find(
              (a) => a !== null && (typeof a === 'object' || (typeof a === 'string' && a.includes('\n'))),
            );
            resolved = richArg ?? callArgs[0];
          }
          continue;
        }
        break;
      }

      return resolved;
    }

    return undefined;
  }

  getPos(): number {
    return this.pos;
  }

  parseNamedFunctionResult(): unknown {
    this.skipBalanced('(', ')');
    // Skip optional TypeScript return type `: Foo` before `{`
    if (this.matchPunct(':')) {
      while (this.peek().kind !== 'eof' && this.peek().value !== '{' && this.peek().value !== ';') {
        if (this.peek().value === '[') this.skipBalanced('[', ']');
        else this.next();
      }
    }
    return this.parseFunctionBodyResult();
  }

  private parseCallArgs(): unknown[] {
    if (!this.matchPunct('(')) return [];
    const args: unknown[] = [];
    while (this.peek().kind !== 'eof' && this.peek().value !== ')') {
      const prevPos = this.pos;
      const val = this.parseExpression();
      if (val !== undefined) args.push(val);
      if (!this.matchPunct(',')) {
        if (this.pos === prevPos) this.next();
      }
    }
    this.matchPunct(')');
    return args;
  }

  private parseFunctionExprResult(): unknown {
    this.matchIdent('function');
    if (this.peek().kind === 'ident') this.next(); // optional fn name
    return this.parseNamedFunctionResult();
  }

  private parseFunctionBodyResult(): unknown {
    if (this.peek().value !== '{') {
      return this.parseExpression();
    }
    this.next(); // '{'
    const innerScope = new Map(this.scope);
    let returnValue: unknown;
    let guard = 0;

    while (this.peek().kind !== 'eof' && this.peek().value !== '}' && guard < 10_000) {
      guard += 1;
      const cur = this.peek();
      if (cur.kind === 'ident' && cur.value === 'return') {
        this.next();
        const savedScope = this.scope;
        this.scope = innerScope;
        returnValue = this.parseExpression();
        this.scope = savedScope;
        this.matchPunct(';');
        break;
      }
      if (cur.kind === 'ident' && (cur.value === 'const' || cur.value === 'let' || cur.value === 'var')) {
        this.next();
        const varName = this.next().value;
        if (this.matchPunct('=')) {
          const savedScope = this.scope;
          this.scope = innerScope;
          const val = this.parseExpression();
          this.scope = savedScope;
          if (varName) innerScope.set(varName, val);
        }
        this.matchPunct(';');
        continue;
      }
      if (cur.kind === 'punct' && cur.value === '{') {
        this.skipBalanced('{', '}');
      } else {
        this.next();
      }
    }

    // Consume remaining until matching '}'
    let depth = 1;
    while (depth > 0 && this.peek().kind !== 'eof') {
      const tk = this.next();
      if (tk.kind === 'punct' && tk.value === '{') depth += 1;
      else if (tk.kind === 'punct' && tk.value === '}') depth -= 1;
    }
    return returnValue;
  }

  private parseArray(): unknown[] {
    this.matchPunct('[');
    const items: unknown[] = [];
    while (this.peek().kind !== 'eof' && this.peek().value !== ']') {
      if (this.matchPunct(',')) {
        // Elided element or trailing separator
        continue;
      }
      if (this.matchPunct('...')) {
        const spreadVal = this.parseExpression();
        if (Array.isArray(spreadVal)) {
          items.push(...spreadVal);
        }
      } else {
        const val = this.parseExpression();
        if (val !== undefined || this.peek().value === ',') {
          items.push(val === undefined ? null : val);
        }
      }
      this.matchPunct(',');
    }
    this.matchPunct(']');
    return items;
  }

  private parseObject(): Record<string, unknown> {
    this.matchPunct('{');
    const obj: Record<string, unknown> = {};

    while (this.peek().kind !== 'eof' && this.peek().value !== '}') {
      if (this.matchPunct(',')) continue;

      if (this.matchPunct('...')) {
        const spreadVal = this.parseExpression();
        if (spreadVal && typeof spreadVal === 'object' && !Array.isArray(spreadVal)) {
          Object.assign(obj, spreadVal);
        }
        this.matchPunct(',');
        continue;
      }

      let key = '';
      if (this.matchPunct('[')) {
        const dynKey = this.parseExpression();
        this.matchPunct(']');
        key = String(dynKey ?? '');
      } else {
        const kTok = this.next();
        if (kTok.kind === 'eof') break;
        key = kTok.value;
      }

      if (this.matchPunct(':')) {
        const val = this.parseExpression();
        if (val !== undefined && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
          obj[key] = val;
        }
      } else {
        // Object shorthand property `{ myVar, ... }`
        if (key && this.scope.has(key) && key !== '__proto__') {
          obj[key] = this.scope.get(key);
        }
      }

      this.matchPunct(',');
    }
    this.matchPunct('}');
    return obj;
  }
}

export interface ExtractedJsModule {
  defaultExport?: unknown;
  namedExports: Record<string, unknown>;
  scopeBindings: Record<string, unknown>;
  rootValue: unknown;
}

export function extractJsModuleValue(rawSource: string): ExtractedJsModule {
  const cleaned = stripCommentsAndShebang(rawSource).trim();
  const tokens = tokenizeJs(cleaned);
  const scope = new Map<string, unknown>();
  const parser = new JsExpressionParser(tokens, scope);

  const namedExports: Record<string, unknown> = {};
  const scopeBindings: Record<string, unknown> = {};
  const bareExpressions: unknown[] = [];
  let defaultExport: unknown;
  let hasDefault = false;

  const isStmtEnd = () => {
    const t = parser.peek();
    return t.kind === 'eof' || (t.kind === 'punct' && t.value === ';');
  };

  while (parser.peek().kind !== 'eof') {
    while (parser.matchPunct(';')) {
      // skip empty semicolons
    }
    if (parser.peek().kind === 'eof') break;

    const tok = parser.peek();

    // Skip `"use strict"` or `'use strict'`
    if (tok.kind === 'str' && (tok.value === 'use strict' || tok.value === 'use client')) {
      parser.next();
      parser.matchPunct(';');
      continue;
    }

    // Skip `import ... from '...';` or `import '...';`
    if (tok.kind === 'ident' && tok.value === 'import' && parser.peek(1).value !== '(') {
      while (parser.peek().kind !== 'eof' && !isStmtEnd()) {
        const tk = parser.next();
        if (tk.kind === 'str' || tk.kind === 'tmpl') {
          break;
        }
      }
      parser.matchPunct(';');
      continue;
    }

    // Skip TypeScript `type X = ...` or `interface X { ... }`
    if (tok.kind === 'ident' && (tok.value === 'interface' || tok.value === 'type') && parser.peek(1).kind === 'ident') {
      parser.next();
      while (parser.peek().kind !== 'eof' && !isStmtEnd()) {
        if (parser.peek().value === '{') parser.skipBalanced('{', '}');
        else parser.next();
      }
      parser.matchPunct(';');
      continue;
    }

    // `export default ...`, `export const ...`, `export async function ...`, `export { a, b }`
    if (tok.kind === 'ident' && tok.value === 'export') {
      parser.next();
      if (parser.matchIdent('default')) {
        defaultExport = parser.parseExpression();
        hasDefault = true;
        parser.matchPunct(';');
        continue;
      }
      if (parser.matchIdent('const') || parser.matchIdent('let') || parser.matchIdent('var')) {
        do {
          const nameTok = parser.next();
          // Skip optional TS annotation `: Foo` before `=` or `;`
          if (parser.matchPunct(':')) {
            while (
              parser.peek().kind !== 'eof' &&
              parser.peek().value !== '=' &&
              parser.peek().value !== ';' &&
              parser.peek().value !== ','
            ) {
              if (parser.peek().value === '{') parser.skipBalanced('{', '}');
              else if (parser.peek().value === '(') parser.skipBalanced('(', ')');
              else if (parser.peek().value === '[') parser.skipBalanced('[', ']');
              else parser.next();
            }
          }
          if (parser.matchPunct('=')) {
            const val = parser.parseExpression();
            if (nameTok.kind === 'ident') {
              scope.set(nameTok.value, val);
              scopeBindings[nameTok.value] = val;
              namedExports[nameTok.value] = val;
            }
          }
        } while (parser.matchPunct(','));
        parser.matchPunct(';');
        continue;
      }
      if (parser.matchIdent('async')) {
        if (parser.matchIdent('function')) {
          const fnName = parser.peek().kind === 'ident' ? parser.next().value : 'default';
          const val = parser.parseNamedFunctionResult();
          if (val !== undefined) {
            if (fnName === 'default') {
              defaultExport = val;
              hasDefault = true;
            } else {
              namedExports[fnName] = val;
              scope.set(fnName, val);
            }
          }
          continue;
        }
      }
      if (parser.matchIdent('function')) {
        const fnName = parser.peek().kind === 'ident' ? parser.next().value : 'default';
        const val = parser.parseNamedFunctionResult();
        if (val !== undefined) {
          if (fnName === 'default') {
            defaultExport = val;
            hasDefault = true;
          } else {
            namedExports[fnName] = val;
            scope.set(fnName, val);
          }
        }
        continue;
      }
      if (parser.matchPunct('{')) {
        while (parser.peek().kind !== 'eof' && parser.peek().value !== '}') {
          const localName = parser.next().value;
          let exportName = localName;
          if (parser.matchIdent('as')) {
            exportName = parser.next().value;
          }
          if (localName && scope.has(localName)) {
            if (exportName === 'default') {
              defaultExport = scope.get(localName);
              hasDefault = true;
            } else {
              namedExports[exportName] = scope.get(localName);
            }
          }
          parser.matchPunct(',');
        }
        parser.matchPunct('}');
        if (parser.matchIdent('from')) {
          parser.next();
        }
        parser.matchPunct(';');
        continue;
      }
      if (parser.matchIdent('type') || parser.matchIdent('interface')) {
        while (parser.peek().kind !== 'eof' && !isStmtEnd()) {
          if (parser.peek().value === '{') parser.skipBalanced('{', '}');
          else parser.next();
        }
        parser.matchPunct(';');
        continue;
      }
    }

    // `const / let / var a = ...`
    if (tok.kind === 'ident' && (tok.value === 'const' || tok.value === 'let' || tok.value === 'var')) {
      parser.next();
      do {
        const nameTok = parser.next();
        if (parser.matchPunct(':')) {
          while (
            parser.peek().kind !== 'eof' &&
            parser.peek().value !== '=' &&
            parser.peek().value !== ';' &&
            parser.peek().value !== ','
          ) {
            if (parser.peek().value === '{') parser.skipBalanced('{', '}');
            else if (parser.peek().value === '(') parser.skipBalanced('(', ')');
            else if (parser.peek().value === '[') parser.skipBalanced('[', ']');
            else parser.next();
          }
        }
        if (parser.matchPunct('=')) {
          const val = parser.parseExpression();
          if (nameTok.kind === 'ident') {
            scope.set(nameTok.value, val);
            scopeBindings[nameTok.value] = val;
          }
        }
      } while (parser.matchPunct(','));
      parser.matchPunct(';');
      continue;
    }

    // `module.exports = ...` / `module['exports'] = ...` / `exports.x = ...` / `window.x = ...` / `self.x = ...`
    if (
      tok.kind === 'ident' &&
      (tok.value === 'module' ||
        tok.value === 'exports' ||
        tok.value === 'window' ||
        tok.value === 'globalThis' ||
        tok.value === 'self')
    ) {
      const rootIdent = parser.next().value;
      const pathParts: string[] = [];
      while (parser.peek().value === '.' || parser.peek().value === '[') {
        if (parser.matchPunct('.')) {
          pathParts.push(parser.next().value);
        } else if (parser.matchPunct('[')) {
          const keyExpr = parser.parseExpression();
          parser.matchPunct(']');
          pathParts.push(String(keyExpr ?? ''));
        }
      }
      if (parser.matchPunct('=')) {
        const val = parser.parseExpression();
        if (rootIdent === 'module' && pathParts.length === 1 && pathParts[0] === 'exports') {
          defaultExport = val;
          hasDefault = true;
        } else if (rootIdent === 'module' && pathParts[0] === 'exports' && pathParts[1]) {
          namedExports[pathParts[1]] = val;
          scope.set(pathParts[1], val);
        } else if (rootIdent === 'exports' && pathParts[0]) {
          if (pathParts[0] === 'default') {
            defaultExport = val;
            hasDefault = true;
          } else {
            namedExports[pathParts[0]] = val;
            scope.set(pathParts[0], val);
          }
        } else if (
          (rootIdent === 'window' || rootIdent === 'globalThis' || rootIdent === 'self') &&
          pathParts[0]
        ) {
          namedExports[pathParts[0]] = val;
          scope.set(pathParts[0], val);
        }
        parser.matchPunct(';');
        continue;
      }
    }

    // `function getData() { return ...; }` or `async function getData() { return ...; }`
    if (
      (tok.kind === 'ident' && tok.value === 'function') ||
      (tok.kind === 'ident' && tok.value === 'async' && parser.peek(1).value === 'function')
    ) {
      if (tok.value === 'async') parser.next();
      parser.next(); // 'function'
      const maybeName = parser.peek().kind === 'ident' ? parser.next().value : '';
      const val = parser.parseNamedFunctionResult();
      if (val !== undefined) {
        if (maybeName) {
          scope.set(maybeName, val);
          scopeBindings[maybeName] = val;
        } else {
          bareExpressions.push(val);
        }
      }
      parser.matchPunct(';');
      continue;
    }

    // Bare expression (JSON object, JS array, NDJSON line, callback(...), etc.)
    const beforePos = parser.getPos();
    const exprVal = parser.parseExpression();
    if (exprVal !== undefined) {
      bareExpressions.push(exprVal);
    } else if (parser.getPos() === beforePos) {
      parser.next();
    }
    parser.matchPunct(';');
  }

  let rootValue: unknown;
  if (hasDefault) {
    rootValue = defaultExport;
  } else if (Object.keys(namedExports).length === 1) {
    const [onlyKey] = Object.keys(namedExports);
    const val = namedExports[onlyKey];
    if (val && typeof val === 'object' && !Array.isArray(val) && 'moduleId' in (val as object)) {
      rootValue = val;
    } else {
      rootValue = namedExports;
    }
  } else if (Object.keys(namedExports).length > 1) {
    rootValue = namedExports;
  } else if (bareExpressions.length === 1) {
    rootValue = bareExpressions[0];
  } else if (bareExpressions.length > 1) {
    rootValue = bareExpressions;
  } else {
    const scopeKeys = Object.keys(scopeBindings);
    if (scopeKeys.length === 1) {
      rootValue = scopeBindings[scopeKeys[0]];
    } else if (scopeKeys.length > 1) {
      rootValue = scopeBindings;
    }
  }

  return {
    defaultExport: hasDefault ? defaultExport : undefined,
    namedExports,
    scopeBindings,
    rootValue,
  };
}
