"use client";
import { useState } from "react";

// Множество ключевых слов (в нижнем регистре)
const KEYWORDS = new Set([
  "var",
  "array",
  "of",
  "integer",
  "real",
  "char",
  "boolean",
  "string"
]);

// Регулярное выражение для идентификатора
const IDENT_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/* -----------------------------------------------------------
   ЛЕКСИЧЕСКИЙ АНАЛИЗАТОР (ТОКЕНИЗАТОР)
----------------------------------------------------------- */
function tokenize(code) {
  const tokens = [];
  let i = 0,
    line = 1,
    col = 1;

  function pushToken(type, value, l = line, c = col) {
    tokens.push({ type, value, line: l, col: c });
  }

  function isAlpha(ch) {
    return /[A-Za-z_]/.test(ch);
  }
  function isAlnum(ch) {
    return /[A-Za-z0-9_]/.test(ch);
  }
  function isDigit(ch) {
    return /[0-9]/.test(ch);
  }

  while (i < code.length) {
    const ch = code[i];

    // переход на новую строку
    if (ch === "\r") {
      i++;
      if (code[i] === "\n") i++;
      line++;
      col = 1;
      continue;
    }
    if (ch === "\n") {
      i++;
      line++;
      col = 1;
      continue;
    }

    // пробелы и табуляция
    if (" \t\f\v".includes(ch)) {
      i++;
      col++;
      continue;
    }

    // комментарий { ... }
    if (ch === "{") {
      const startL = line,
        startC = col;
      i++;
      col++;
      let closed = false;
      while (i < code.length) {
        if (code[i] === "}") {
          i++;
          col++;
          closed = true;
          break;
        }
        if (code[i] === "\n") {
          i++;
          line++;
          col = 1;
          continue;
        }
        if (code[i] === "\r") {
          i++;
          if (code[i] === "\n") i++;
          line++;
          col = 1;
          continue;
        }
        i++;
        col++;
      }
      if (!closed)
        throw {
          type: "lexical",
          line: startL,
          col: startC,
          message: "Незакрытый комментарий"
        };
      continue;
    }

    // комментарий (* ... *)
    if (ch === "(" && code[i + 1] === "*") {
      const startL = line,
        startC = col;
      i += 2;
      col += 2;
      let closed = false;
      while (i < code.length) {
        if (code[i] === "*" && code[i + 1] === ")") {
          i += 2;
          col += 2;
          closed = true;
          break;
        }
        if (code[i] === "\n") {
          i++;
          line++;
          col = 1;
          continue;
        }
        if (code[i] === "\r") {
          i++;
          if (code[i] === "\n") i++;
          line++;
          col = 1;
          continue;
        }
        i++;
        col++;
      }
      if (!closed)
        throw {
          type: "lexical",
          line: startL,
          col: startC,
          message: "Незакрытый комментарий"
        };
      continue;
    }

    // оператор :=
    if (ch === ":" && code[i + 1] === "=") {
      pushToken("SYMBOL", ":=");
      i += 2;
      col += 2;
      continue;
    }

    // оператор ..
    if (ch === "." && code[i + 1] === ".") {
      pushToken("SYMBOL", "..");
      i += 2;
      col += 2;
      continue;
    }

    // отрицательное число
    if (ch === "-" && isDigit(code[i + 1])) {
      let j = i + 1;
      while (j < code.length && isDigit(code[j])) j++;
      pushToken("NUMBER", code.slice(i, j));
      col += j - i;
      i = j;
      continue;
    }

    // одиночный символ
    if (":;.,[]()^@:+-*/<>=".includes(ch)) {
      pushToken("SYMBOL", ch);
      i++;
      col++;
      continue;
    }

    // положительное число
    if (isDigit(ch)) {
      let j = i;
      while (j < code.length && isDigit(code[j])) j++;
      pushToken("NUMBER", code.slice(i, j));
      col += j - i;
      i = j;
      continue;
    }

    // идентификатор или ключевое слово
    if (isAlpha(ch)) {
      let j = i;
      while (j < code.length && isAlnum(code[j])) j++;
      const raw = code.slice(i, j);
      pushToken(KEYWORDS.has(raw.toLowerCase()) ? "KEYWORD" : "IDENT", raw);
      col += j - i;
      i = j;
      continue;
    }

    // неизвестный символ
    pushToken("UNKNOWN", ch);
    i++;
    col++;
  }

  pushToken("EOF", "");
  return tokens;
}

/* -----------------------------------------------------------
   ПАРСЕР
----------------------------------------------------------- */
function Parser(tokens) {
  this.tokens = tokens;
  this.pos = 0;
}
Parser.prototype.peek = function () {
  return this.tokens[this.pos];
};
Parser.prototype.next = function () {
  return this.tokens[this.pos++];
};

// проверка идентификатора
function checkIdent(tok, errors) {
  if (!tok) return;
  if (!IDENT_REGEX.test(tok.value) || KEYWORDS.has(tok.value.toLowerCase())) {
    errors.push({
      type: "syntax",
      line: tok.line,
      col: tok.col,
      message: "Недопустимый идентификатор"
    });
  }
}

/* -----------------------------------------------------------
   ПАРСЕР ТИПОВ
----------------------------------------------------------- */
function parseType(parser, errors) {
  const tok = parser.peek();
  if (!tok) {
    errors.push({ type: "syntax", line: 0, col: 0, message: "Ожидался тип" });
    return { kind: "unknown" };
  }
  if (tok.type === "KEYWORD") {
    const v = tok.value.toLowerCase();
    if (["integer", "real", "char", "boolean"].includes(v)) {
      parser.next();
      return { kind: v };
    }

    if (v === "string") {
      parser.next();
      const nxt = parser.peek();
      if (nxt && nxt.type === "SYMBOL" && nxt.value === "[") {
        parser.next();
        const lenTok = parser.peek();
        if (!lenTok || lenTok.type !== "NUMBER") {
          errors.push({
            type: "syntax",
            line: lenTok?.line || tok.line,
            col: lenTok?.col || tok.col,
            message: "Недопустимый символ"
          });
          if (lenTok) parser.next();
          return { kind: "string", size: 0 };
        }
        const size = parseInt(parser.next().value, 10);
        if (size < 1 || size > 255) {
          errors.push({
            type: "syntax",
            line: lenTok.line,
            col: lenTok.col,
            message: "Размер строки должен быть от 1 до 255"
          });
        }
        const close = parser.peek();
        if (!close || close.type !== "SYMBOL" || close.value !== "]") {
          errors.push({
            type: "syntax",
            line: close?.line || lenTok.line,
            col: close?.col || lenTok.col,
            message: "Недопустимый символ"
          });
          if (close && close.type !== "EOF") parser.next();
          return { kind: "string", size };
        }
        parser.next();

        // проверка лишних символов
        // после ']' допускается только ';' или конец строки
        const afterClose = parser.peek();
        if (
          afterClose &&
          afterClose.type === "SYMBOL" &&
          afterClose.value !== ";" &&
          afterClose.value !== ","
        ) {
          errors.push({
            type: "syntax",
            line: afterClose.line,
            col: afterClose.col,
            message: `Недопустимый символ ${afterClose.value}`
          });
          parser.next();
        }

        return { kind: "string", size };
      }
      return { kind: "string" };
    }

    if (v === "array") {
      parser.next();
      const open = parser.peek();
      if (!open || open.type !== "SYMBOL" || open.value !== "[") {
        errors.push({
          type: "syntax",
          line: open?.line || tok.line,
          col: open?.col || tok.col,
          message: "Недопустимый символ"
        });
        if (open) parser.next();
        return { kind: "array", ranges: [], baseType: { kind: "unknown" } };
      }
      parser.next();

      const ranges = [];
      while (true) {
        const fromTok = parser.peek();
        if (!fromTok || fromTok.type !== "NUMBER") {
          if (fromTok) {
            errors.push({
              type: "syntax",
              line: fromTok.line,
              col: fromTok.col,
              message: `Недопустимый символ ${fromTok.value}`
            });
            parser.next();
          }
          break;
        }
        const from = parseInt(parser.next().value, 10);

        const dots = parser.peek();
        if (!dots || dots.type !== "SYMBOL" || dots.value !== "..") {
          errors.push({
            type: "syntax",
            line: dots?.line || fromTok.line,
            col: dots?.col || fromTok.col,
            message: "Недопустимый символ"
          });
          if (dots) parser.next();
          break;
        }
        parser.next();

        const toTok = parser.peek();
        if (!toTok || toTok.type !== "NUMBER") {
          if (toTok) {
            errors.push({
              type: "syntax",
              line: toTok.line,
              col: toTok.col,
              message: `Недопустимый символ ${toTok.value}`
            });
            parser.next();
          }
          break;
        }
        const to = parseInt(parser.next().value, 10);
        if (from > to)
          errors.push({
            type: "syntax",
            line: fromTok.line,
            col: fromTok.col,
            message: "Левая граница больше правой"
          });
        ranges.push({ from, to });

        const sep = parser.peek();
        if (!sep) break;
        if (sep.type === "SYMBOL" && sep.value === ",") {
          parser.next();
          continue;
        }
        if (sep.type === "SYMBOL" && sep.value === "]") {
          parser.next();
          break;
        }
        errors.push({
          type: "syntax",
          line: sep.line,
          col: sep.col,
          message: `Недопустимый символ ${sep.value}`
        });
        parser.next();
        break;
      }

      const ofTok = parser.peek();
      if (
        !ofTok ||
        ofTok.type !== "KEYWORD" ||
        ofTok.value.toLowerCase() !== "of"
      ) {
        errors.push({
          type: "syntax",
          line: ofTok?.line || tok.line,
          col: ofTok?.col || tok.col,
          message: "Пропущено of"
        });
        if (ofTok) parser.next();
        return { kind: "array", ranges, baseType: { kind: "unknown" } };
      }
      parser.next();
      const baseType = parseType(parser, errors);
      return { kind: "array", ranges, baseType };
    }
  }

  errors.push({
    type: "syntax",
    line: tok.line,
    col: tok.col,
    message: "Неверный тип"
  });
  parser.next();
  return { kind: "unknown" };
}

/* -----------------------------------------------------------
   ПАРСЕР ОБЪЯВЛЕНИЯ ПЕРЕМЕННЫХ
----------------------------------------------------------- */
function parseDeclaration(parser, declared, errors) {
  const ids = [];
  const lineStart = parser.peek()?.line || 0;

  while (true) {
    const tok = parser.peek();
    if (!tok || tok.type !== "IDENT") {
      if (tok) {
        errors.push({
          type: "syntax",
          line: tok.line,
          col: tok.col,
          message: `Недопустимый символ ${tok.value}`
        });
        parser.next();
      }
      break;
    }
    checkIdent(tok, errors);
    const name = parser.next().value;
    ids.push({ name, low: name.toLowerCase(), line: tok.line, col: tok.col });

    const sep = parser.peek();
    if (sep && sep.type === "SYMBOL" && sep.value === ",") {
      parser.next();
      continue;
    }
    break;
  }

  const colon = parser.peek();
  if (!colon || colon.type !== "SYMBOL" || colon.value !== ":") {
    if (colon && colon.type === "UNKNOWN") {
      errors.push({
        type: "syntax",
        line: lineStart,
        col: colon.col,
        message: `Недопустимый символ ${colon.value}`
      });
      parser.next();
    } else {
      errors.push({
        type: "syntax",
        line: lineStart,
        col: 0,
        message: "Пропущен :"
      });
      if (colon) parser.next();
    }
  } else parser.next();

  parseType(parser, errors);

  // определяем последнюю значимую позицию в строке для ;
  const lastTok = parser.tokens
    .slice(0, parser.pos)
    .filter((t) => t.line === lineStart && t.type !== "UNKNOWN")
    .slice(-1)[0];

  const semi = parser.peek();
  let errLine = lastTok?.line || lineStart;
  let errCol = lastTok ? lastTok.col + (lastTok.value?.length || 0) : 1;

  if (!semi || semi.type !== "SYMBOL" || semi.value !== ";") {
    if (semi && semi.type === "UNKNOWN") {
      errors.push({
        type: "syntax",
        line: errLine,
        col: errCol,
        message: `Недопустимый символ ${semi.value}`
      });
      parser.next();
    } else {
      errors.push({
        type: "syntax",
        line: errLine,
        col: errCol,
        message: "Пропущен ;"
      });
      if (semi && semi.type !== "EOF") parser.next();
    }
  } else parser.next();

  // Проверка всех неизвестных символов на той же строке после ;
  while (true) {
    const tok = parser.peek();
    if (!tok || tok.line !== lineStart) break;
    if (tok.type === "UNKNOWN") {
      errors.push({
        type: "syntax",
        line: tok.line,
        col: tok.col,
        message: `Недопустимый символ ${tok.value}`
      });
    }
    parser.next();
  }

  for (const id of ids) {
    if (declared.has(id.low)) {
      errors.push({
        type: "syntax",
        line: id.line,
        col: id.col,
        message: `Повторное объявление переменной '${id.name}'`
      });
    } else declared.set(id.low, { line: id.line, col: id.col });
  }

  return { ids };
}

/* -----------------------------------------------------------
   ГЛАВНЫЙ ПАРСЕР
----------------------------------------------------------- */
function parse(tokens, errors) {
  const parser = new Parser(tokens);
  const declared = new Map();
  while (true) {
    const t = parser.peek();
    if (!t || t.type === "EOF") break;
    if (t.type === "KEYWORD" && t.value.toLowerCase() === "var") {
      parser.next();
      while (true) {
        const look = parser.peek();
        if (look && look.type === "IDENT") {
          parseDeclaration(parser, declared, errors);
          continue;
        }
        break;
      }
      continue;
    }
    if (t.type === "UNKNOWN") {
      errors.push({
        type: "syntax",
        line: t.line,
        col: t.col,
        message: `Недопустимый символ ${t.value}`
      });
      parser.next();
    } else {
      errors.push({
        type: "syntax",
        line: t.line,
        col: t.col,
        message: "Ожидалось ключевое слово var"
      });
      parser.next();
    }
  }
  return declared;
}

/* -----------------------------------------------------------
   РЕАКТ-КОМПОНЕНТ
----------------------------------------------------------- */
export default function Home() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState("");
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const sample = `var a, b, c: real;
d: array [1..6, 6..9] of integer;
s1: string;
s2: string[10];`;

  const updateCursorPosition = (e) => {
    const textarea = e.target;
    const pos = textarea.selectionStart;
    const lines = textarea.value.substr(0, pos).split("\n");
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    setCursorPos({ line, col });
  };

  const checkCode = () => {
    setResult("");
    const errors = [];
    try {
      const tokens = tokenize(code);
      parse(tokens, errors);

      console.log("Ошибки:", errors);

      if (errors.length === 0) {
        setResult("✅ Описание корректное");
      } else {
        errors.sort((a, b) => a.line - b.line || a.col - b.col);
        const e = errors[0];
        setResult(
          `❗ Синтаксическая ошибка в строке ${e.line}, позиция ${e.col}${
            e.message ? ": " + e.message : ""
          }`
        );
      }
    } catch (e) {
      setResult(
        `❗ Лексическая ошибка в строке ${e.line}, позиция ${e.col}${
          e.message ? ": " + e.message : ""
        }`
      );
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-gray-200 p-6 flex flex-col">
        <h1 className="text-2xl font-bold mb-4 text-gray-800 text-center">
          Проверка описания переменных (Pascal)
        </h1>
        <textarea
          className="w-full h-56 p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none shadow-sm mb-2"
          placeholder="Вставьте код..."
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (!e.target.value.trim()) setResult("");
            updateCursorPosition(e);
          }}
          onClick={updateCursorPosition}
          onKeyUp={updateCursorPosition}
          onMouseUp={updateCursorPosition}
        />
        <div className="text-sm text-gray-600 mb-4">
          <div>
            Курсор: строка {cursorPos.line}, позиция {cursorPos.col}
          </div>
          <div>Позиция -- положение курсора перед символом</div>
        </div>

        <div className="flex gap-4 justify-center mb-4">
          <button
            onClick={checkCode}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl shadow hover:scale-105 transition"
          >
            Проверить
          </button>
          <button
            onClick={() => {
              setCode(sample);
              setResult("");
            }}
            className="px-4 py-2 bg-gray-200 rounded-xl shadow hover:bg-gray-300"
          >
            Пример
          </button>
          <button
            onClick={() => {
              setCode("");
              setResult("");
            }}
            className="px-4 py-2 bg-red-100 rounded-xl shadow hover:bg-red-200"
          >
            Очистить
          </button>
        </div>
        {result && (
          <pre className="p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-inner whitespace-pre-wrap text-sm overflow-x-auto">
            {result}
          </pre>
        )}
      </div>
    </div>
  );
}
